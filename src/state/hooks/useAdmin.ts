import { useState, useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import * as fbService from '@/services/firebaseService'
import * as stripeConnect from '@/services/stripeConnect'
import { AVATAR_ITEMS } from '@/components/avatar'
import type { Report, User, Book } from '@/types'

interface AdminDeps {
  user: User
  firebaseUid: string | null
  isAdmin: boolean
  showToast: (message: string, icon?: string) => void
  addNotification: (
    title: string, message: string, icon: string, recipient?: string,
    sender?: string, targetId?: string, targetChapterIndex?: number, commentId?: string
  ) => void
  registeredUsers: any[]
  setRegisteredUsers: Dispatch<SetStateAction<any[]>>
  books: Book[]
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
  books
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
          status: r.status
        }))
      )
    })
    return () => unsub()
  }, [firebaseUid, isAdmin])

  const handleReport = (
    type: 'Book' | 'Comment' | 'User',
    targetId: string
  ) => {
    const newReport = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      targetId,
      reportedBy: user.username,
      timestamp: new Date().toISOString(),
      status: 'pending'
    }
    fbService.addReportDoc(newReport).catch(console.error)
    addNotification(
      'Report Filed',
      `Your report for ${type.toLowerCase()} has been submitted.`,
      'flag'
    )
    showToast(`${type} reported successfully!`, 'flag')
  }

  const handleRemoveBook = (bookId: string) => {
    fbService.deleteBook(bookId).catch(console.error)
    reports
      .filter(r => r.targetId === bookId && r.type === 'Book')
      .forEach(r => {
        fbService.updateReportStatus(r.id, 'resolved').catch(console.error)
      })
  }

  const handleRemoveComment = (commentId: string) => {
    fbService.removeCommentDoc(commentId).catch(console.error)
    // Resolve any reports for this comment
    reports
      .filter(r => r.targetId === commentId && r.type === 'Comment')
      .forEach(r => {
        fbService.updateReportStatus(r.id, 'resolved').catch(console.error)
      })
  }

  const handleAddStrike = (username: string) => {
    const targetUser = registeredUsers.find(u => u.username === username)
    if (targetUser?.uid) {
      fbService
        .updateUserProfile(targetUser.uid, {
          strikes: (targetUser.strikes || 0) + 1
        })
        .catch(console.error)
    }
    setRegisteredUsers(prev =>
      prev.map(u =>
        u.username === username ? { ...u, strikes: (u.strikes || 0) + 1 } : u
      )
    )
  }

  const handleRemoveStrike = (username: string) => {
    const targetUser = registeredUsers.find(u => u.username === username)
    if (targetUser?.uid && targetUser.strikes > 0) {
      fbService
        .updateUserProfile(targetUser.uid, { strikes: targetUser.strikes - 1 })
        .catch(console.error)
    }
    setRegisteredUsers(prev =>
      prev.map(u =>
        u.username === username && u.strikes > 0
          ? { ...u, strikes: u.strikes - 1 }
          : u
      )
    )
  }

  const handleBanUser = (username: string) => {
    // Remove user's comments from Firestore
    fbService.removeCommentsByAuthor(username).catch(console.error)
    // Remove user's relationships from Firestore
    fbService.removeAllRelationshipsForUser(username).catch(console.error)
    // Resolve reports for this user
    reports
      .filter(r => r.targetId === username && r.type === 'User')
      .forEach(r => {
        fbService.updateReportStatus(r.id, 'resolved').catch(console.error)
      })
    // Delete user's books from Firestore
    books
      .filter(b => b.author.username === username)
      .forEach(b => {
        fbService.deleteBook(b.id).catch(console.error)
      })
    // Note: User account deletion from Firebase Auth would require admin SDK
    // For now, just update their profile with a banned flag
    const bannedUser = registeredUsers.find(u => u.username === username)
    if (bannedUser?.uid) {
      fbService
        .updateUserProfile(bannedUser.uid, { isBanned: true })
        .catch(console.error)
    }
    setRegisteredUsers(prev => prev.filter(u => u.username !== username))
  }

  const handleDismissReport = (reportId: string) => {
    fbService.updateReportStatus(reportId, 'dismissed').catch(console.error)
  }

  // ---- Monetization review (F03) ----
  // Both go through the admin-only reviewMonetization callable (server verifies
  // the admin claim + re-validates the price, and writes via the Admin SDK so
  // firestore.rules can keep monetization fields client-unwritable). The
  // author/owner notifications + emails are sent by the onBookMonetized trigger.
  const handleApproveMonetization = async (bookId: string) => {
    try {
      await stripeConnect.reviewMonetization(bookId, 'approve')
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
    handleDismissReport,
    handleApproveMonetization,
    handleDenyMonetization
  }
}
