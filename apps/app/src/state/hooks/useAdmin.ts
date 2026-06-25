import { useState, useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import * as fbService from '@/services/firebaseService'
import * as stripeConnect from '@/services/stripeConnect'
import { AVATAR_ITEMS } from '@/components/avatar'
import type {
  Report,
  ReportReason,
  User,
  Book,
  Comment,
  NotificationCategory
} from '@/types'

interface AdminDeps {
  user: User
  firebaseUid: string | null
  isAdmin: boolean
  showToast: (message: string, icon?: string) => void
  addNotification: (
    title: string, message: string, icon: string, recipient?: string,
    sender?: string, targetId?: string, targetChapterIndex?: number, commentId?: string, category?: NotificationCategory
  ) => void
  registeredUsers: any[]
  setRegisteredUsers: Dispatch<SetStateAction<any[]>>
  books: Book[]
  setBooks: Dispatch<SetStateAction<Book[]>>
  allComments: Comment[]
  setAllComments: Dispatch<SetStateAction<Comment[]>>
}

// Moderation / admin domain (Phase B). Owns reports + their (admin-gated)
// Firestore subscription, item price overrides + getItemCost/handleUpdateItemPrice,
// and the moderation handlers (report/remove/strike/ban/dismiss). handleRemoveComment
// moved here from the body since it reads reports. Placed after useNotifications/
// useSocial/useBooks so addNotification, registeredUsers and books are direct refs;
// the subscription is gated on firebaseUid && isAdmin. Bodies + the dependency
// array are verbatim.
export function useAdmin({
  user,
  firebaseUid,
  isAdmin,
  showToast,
  addNotification,
  registeredUsers,
  setRegisteredUsers,
  books,
  setBooks,
  allComments,
  setAllComments
}: AdminDeps) {
  // Reports state (Firestore real-time)
  const [reports, setReports] = useState<Report[]>([])
  // Item price overrides (loaded from Firestore user doc, admin only)
  const [itemPriceOverrides, setItemPriceOverrides] = useState<
    Record<string, number>
  >({})

  const getItemCost = (itemId: string): number => {
    if (itemId in itemPriceOverrides) return itemPriceOverrides[itemId]
    const item = AVATAR_ITEMS.find(i => i.id === itemId)
    return item?.cost ?? 0
  }

  const handleUpdateItemPrice = (itemId: string, price: number) => {
    const updated = { ...itemPriceOverrides, [itemId]: price }
    setItemPriceOverrides(updated)
    if (firebaseUid)
      fbService
        .updateUserProfile(firebaseUid, { itemPriceOverrides: updated })
        .catch(console.error)
  }

  // Subscribe to reports
  useEffect(() => {
    if (!firebaseUid || !isAdmin) return
    const unsub = fbService.subscribeToReports((reps: any[]) => {
      setReports(
        reps.map(r => ({
          id: r.id,
          type: r.type,
          targetId: r.targetId,
          reportedBy: r.reportedBy,
          timestamp: r.timestamp,
          status: r.status,
          reason: r.reason
        }))
      )
    })
    return () => unsub()
  }, [firebaseUid, isAdmin])

  // Optimistically reflect a report-status change locally so the admin queue
  // (reports.filter(status === 'pending')) clears immediately instead of after
  // the ~30s reports poll. The subscription reconciles to server truth.
  const setReportsStatusLocally = (
    reportIds: string[],
    status: Report['status']
  ) =>
    setReports(prev =>
      prev.map(r => (reportIds.includes(r.id) ? { ...r, status } : r))
    )

  const handleReport = (
    type: 'Book' | 'Comment' | 'User',
    targetId: string,
    reason?: ReportReason
  ) => {
    const newReport = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      targetId,
      reportedBy: user.username,
      timestamp: new Date().toISOString(),
      status: 'pending',
      ...(reason ? { reason } : {})
    }
    fbService.addReportDoc(newReport).catch(console.error)
    addNotification(
      'Report Filed',
      `Your report for ${type.toLowerCase()} has been submitted.`,
      'flag',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'system'
    )
    showToast(`${type} reported successfully!`, 'flag')
  }

  // ---- Strike core (F04) ----
  // Single funnel for every strike path: removing a reported book/comment/
  // profile, and the manual "Strike" button. Adds one strike, notifies the
  // user in-app, and auto-bans on the third. `reportId` makes the strike
  // idempotent so one report can never strike twice (double-click, or a
  // content-removal path firing alongside a manual Strike on the same report).
  const applyStrike = (username: string, reportId?: string) => {
    const targetUser = registeredUsers.find(u => u.username === username)
    if (!targetUser?.uid) return
    // Admins are never struck or auto-banned (the User-report Strike button
    // and the content-removal path don't otherwise guard this).
    if (targetUser.isAdmin) return
    // Idempotency: this report already produced a strike for this user.
    if (reportId && (targetUser.struckByReportIds || []).includes(reportId))
      return

    const newStrikes = (targetUser.strikes || 0) + 1
    // The "Strike Received" in-app notification is created server-side in
    // AdminService.addStrike, so every strike path (API/automated) is covered.
    fbService.addStrikeToUser(targetUser.uid, reportId).catch(console.error)

    if (newStrikes >= 3) {
      // Third strike → permanent ban via the admin SDK (disable Auth + claim).
      fbService.banUser(targetUser.uid).catch(console.error)
      showToast(`@${username} banned (3 strikes)`, 'block')
    } else {
      showToast(`Strike ${newStrikes}/3 issued to @${username}`, 'warning')
    }

    setRegisteredUsers(prev =>
      prev.map(u =>
        u.username === username
          ? {
              ...u,
              strikes: newStrikes,
              isBanned: newStrikes >= 3 ? true : u.isBanned,
              struckByReportIds: reportId
                ? [...(u.struckByReportIds || []), reportId]
                : u.struckByReportIds
            }
          : u
      )
    )
  }

  const handleRemoveBook = (bookId: string) => {
    // SOFT take-down (no hard delete — there are no Firestore backups, so a
    // deleted book is unrecoverable). Demonetize + hide as a draft + stamp the
    // terminal `takenDown` flag. The book can then never be read (chapters.ts
    // blocks taken-down books), re-published or re-monetized (firestore.rules +
    // submitMonetizationRequest enforce permanence).
    //
    // takenDown/takenDownAt/isMonetized are server-managed: the author-facing
    // PATCH /books/:id whitelists them out, so this MUST go through the dedicated
    // admin endpoint, which stamps them server-side with admin authority.
    fbService.takeDownBook(bookId).catch(console.error)
    // Optimistic: hide the book from client lists immediately (AdminDashboard +
    // readers filter on isDraft). takenDown* are server-side gates, not rendered.
    setBooks(prev =>
      prev.map(b =>
        b.id === bookId
          ? { ...b, isDraft: true, isMonetized: false, isFree: false }
          : b
      )
    )
    const bookReports = reports.filter(
      r => r.targetId === bookId && r.type === 'Book'
    )
    bookReports.forEach(r => {
      fbService.updateReportStatus(r.id, 'resolved').catch(console.error)
    })
    setReportsStatusLocally(
      bookReports.map(r => r.id),
      'resolved'
    )
    // Strike the author once for the removal (keyed on the first report id so
    // N reports on one book = one strike, and a re-run won't double-strike).
    const authorUsername = books.find(b => b.id === bookId)?.author.username
    if (authorUsername && bookReports[0])
      applyStrike(authorUsername, bookReports[0].id)
  }

  const handleRemoveComment = (commentId: string) => {
    fbService.removeCommentDoc(commentId).catch(console.error)
    // Optimistic: drop the comment from readers' threads immediately instead of
    // lingering until the ~20s comments poll.
    setAllComments(prev => prev.filter(c => c.id !== commentId))
    const commentReports = reports.filter(
      r => r.targetId === commentId && r.type === 'Comment'
    )
    commentReports.forEach(r => {
      fbService.updateReportStatus(r.id, 'resolved').catch(console.error)
    })
    setReportsStatusLocally(
      commentReports.map(r => r.id),
      'resolved'
    )
    // Comments carry `authorUsername` on the doc (read into allComments).
    const authorUsername = allComments.find(c => c.id === commentId)
      ?.authorUsername
    if (authorUsername && commentReports[0])
      applyStrike(authorUsername, commentReports[0].id)
  }

  // Manual "Strike" button (Users tab + User-report). For a User report we
  // also resolve the open report(s) so the queue clears.
  const handleAddStrike = (username: string) => {
    const userReports = reports.filter(
      r => r.targetId === username && r.type === 'User'
    )
    userReports.forEach(r => {
      fbService.updateReportStatus(r.id, 'resolved').catch(console.error)
    })
    setReportsStatusLocally(
      userReports.map(r => r.id),
      'resolved'
    )
    applyStrike(username, userReports[0]?.id)
  }

  const handleRemoveStrike = (username: string) => {
    const targetUser = registeredUsers.find(u => u.username === username)
    if (targetUser?.uid && targetUser.strikes > 0) {
      // `strikes` is server-managed (PROTECTED on PATCH /users/me) and this
      // targets ANOTHER user, so updateUserProfile is a no-op here — route
      // through the dedicated admin endpoint that decrements server-side.
      fbService.removeStrikeFromUser(targetUser.uid).catch(console.error)
    }
    setRegisteredUsers(prev =>
      prev.map(u =>
        u.username === username && u.strikes > 0
          ? { ...u, strikes: u.strikes - 1 }
          : u
      )
    )
  }

  // Manual immediate ban (admin "Ban User" button), bypassing the strike
  // ladder for severe violations. Delegates to the admin-only banUser Cloud
  // Function, which disables the Auth record + sets the `banned` claim (only
  // the Admin SDK can). Content is retained, not scrubbed — the ban is
  // reversible via handleUnbanUser. Reports for the user are resolved here so
  // the queue clears optimistically.
  const handleBanUser = (username: string) => {
    const targetUser = registeredUsers.find(u => u.username === username)
    if (!targetUser?.uid) return
    if (targetUser.isAdmin) return // never ban an admin
    const userReports = reports.filter(
      r => r.targetId === username && r.type === 'User'
    )
    userReports.forEach(r => {
      fbService.updateReportStatus(r.id, 'resolved').catch(console.error)
    })
    setReportsStatusLocally(
      userReports.map(r => r.id),
      'resolved'
    )
    fbService.banUser(targetUser.uid).catch(console.error)
    showToast(`@${username} banned`, 'block')
    // Mark banned in place (don't drop from the list) so the row can offer
    // Unban for reversal.
    setRegisteredUsers(prev =>
      prev.map(u => (u.username === username ? { ...u, isBanned: true } : u))
    )
  }

  // Reverse a ban (admin action): re-enables Auth, clears the claim, resets
  // strikes. Content was never scrubbed, so the account comes back intact.
  const handleUnbanUser = (username: string) => {
    const targetUser = registeredUsers.find(u => u.username === username)
    if (!targetUser?.uid) return
    fbService.unbanUser(targetUser.uid).catch(console.error)
    showToast(`@${username} reinstated`, 'check_circle')
    setRegisteredUsers(prev =>
      prev.map(u =>
        u.username === username
          ? { ...u, isBanned: false, strikes: 0, struckByReportIds: [] }
          : u
      )
    )
  }

  const handleDismissReport = (reportId: string) => {
    fbService.updateReportStatus(reportId, 'dismissed').catch(console.error)
    // Optimistic: clear it from the pending queue immediately.
    setReportsStatusLocally([reportId], 'dismissed')
  }

  // ---- Monetization review (F03) ----
  // Both go through the admin-only reviewMonetization callable (server verifies
  // the admin claim + re-validates the price, and writes via the Admin SDK so
  // firestore.rules can keep monetization fields client-unwritable). The
  // author/owner notifications + emails are sent by the onBookMonetized trigger.
  const handleApproveMonetization = async (bookId: string) => {
    try {
      await stripeConnect.reviewMonetization(bookId, 'approve')
      // Optimistic: drop the book from the pending queue immediately
      // (queue = books.filter(monetizationStatus === 'pending')).
      setBooks(prev =>
        prev.map(b =>
          b.id === bookId
            ? {
                ...b,
                monetizationStatus: 'approved' as const,
                isMonetized: true,
                isFree: false,
                price: b.requestedPrice ?? b.price,
                monetizationReviewedAt: new Date().toISOString()
              }
            : b
        )
      )
      showToast('Monetization approved', 'paid')
    } catch (err: any) {
      showToast(err?.message || 'Could not approve.', 'error')
    }
  }

  const handleDenyMonetization = async (bookId: string, reason: string) => {
    const trimmed = (reason || '').trim()
    if (!trimmed) {
      showToast('A denial reason is required.', 'error')
      return
    }
    try {
      await stripeConnect.reviewMonetization(bookId, 'deny', trimmed)
      // Optimistic: drop the book from the pending queue immediately.
      setBooks(prev =>
        prev.map(b =>
          b.id === bookId
            ? {
                ...b,
                monetizationStatus: 'denied' as const,
                monetizationDenialReason: trimmed,
                monetizationReviewedAt: new Date().toISOString()
              }
            : b
        )
      )
      showToast('Monetization denied', 'money_off')
    } catch (err: any) {
      showToast(err?.message || 'Could not deny.', 'error')
    }
  }

  return {
    reports,
    setReports,
    itemPriceOverrides,
    setItemPriceOverrides,
    getItemCost,
    handleUpdateItemPrice,
    handleReport,
    handleRemoveBook,
    handleRemoveComment,
    handleAddStrike,
    handleRemoveStrike,
    handleBanUser,
    handleUnbanUser,
    handleDismissReport,
    handleApproveMonetization,
    handleDenyMonetization
  }
}
