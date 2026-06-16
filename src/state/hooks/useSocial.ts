import { useState, useRef, useMemo, useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import * as fbService from '@/services/firebaseService'
import type { User, Relationship, AvatarConfig, View } from '@/types'

type ReadingActivityMap = Record<
  string,
  { bookId: string; progress: number; lastRead: string }[]
>

interface SocialDeps {
  user: User
  firebaseUid: string | null
  setView: Dispatch<SetStateAction<View>>
  showToast: (message: string, icon?: string) => void
  showConfirm: (opts: {
    title: string
    message: string
    confirmLabel?: string
    cancelLabel?: string
    icon?: string
    iconBg?: string
    onConfirm: () => void
    onCancel?: () => void
  }) => void
  addNotification: (
    title: string, message: string, icon: string, recipient?: string,
    sender?: string, targetId?: string, targetChapterIndex?: number, commentId?: string
  ) => void
  setAllAvatarConfigs: Dispatch<SetStateAction<Record<string, AvatarConfig>>>
  setAllUnlockedItems: Dispatch<SetStateAction<Record<string, string[]>>>
  setReadingActivity: Dispatch<SetStateAction<ReadingActivityMap>>
}

// Social graph domain (Phase B). Owns registeredUsers + relationships and their
// Firestore subscriptions, the derived MUTUALS and userIsUnder16 memos, the
// blocked-users set, the admire-debounce ref, and the admire/block handlers.
// Placed before useNotifications (which reads MUTUALS/registeredUsers) and after
// useAvatar (subscribeToUsers writes setAllAvatarConfigs/setAllUnlockedItems as
// direct refs). addNotification + setReadingActivity arrive as the late-bound
// addNotificationLB / setReadingActivityLB since their owners run later. Bodies
// and every dependency array are verbatim.
export function useSocial({
  user,
  firebaseUid,
  setView,
  showToast,
  showConfirm,
  addNotification,
  setAllAvatarConfigs,
  setAllUnlockedItems,
  setReadingActivity
}: SocialDeps) {
  // Users loaded from Firestore
  const [registeredUsers, setRegisteredUsers] = useState<any[]>([])
  // Relationships state (Firestore real-time)
  const [relationships, setRelationships] = useState<Relationship[]>([])
  // Compute mutuals from relationships and registeredUsers
  const MUTUALS = useMemo(() => {
    if (!user.username) return []
    const myAdmiring = relationships
      .filter(r => r.admirer === user.username)
      .map(r => r.target)
    const admiringMe = relationships
      .filter(r => r.target === user.username)
      .map(r => r.admirer)
    const mutualUsernames = myAdmiring.filter(username =>
      admiringMe.includes(username)
    )
    return registeredUsers
      .filter(u => mutualUsernames.includes(u.username))
      .map(u => ({
        ...u,
        isMutual: true,
        isOnline: u.isOnline || false,
        activity: u.activity || ('Idle' as const),
        position: u.position || ([0, 0, 0] as [number, number, number]),
        points: u.points || 0,
        admirersCount: u.admirersCount || 0,
        mutualsCount: u.mutualsCount || 0,
        strikes: u.strikes || 0
      }))
  }, [user.username, relationships, registeredUsers])
  // Check if current user is under 16 (for explicit content filtering)
  const userIsUnder16 = useMemo(() => {
    if (!user.username) return false
    const userRecord = registeredUsers.find(
      u => u.username === user.username
    ) as any
    if (!userRecord?.birthDate) return false
    const birth = new Date(userRecord.birthDate)
    const today = new Date()
    let age = today.getFullYear() - birth.getFullYear()
    const m = today.getMonth() - birth.getMonth()
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
    return age < 16
  }, [registeredUsers, user.username])
  // Blocked users state (loaded from Firestore user doc)
  const [blockedUsers, setBlockedUsers] = useState<Set<string>>(new Set())
  const pendingAdmireRef = useRef<Set<string>>(new Set())

  // Subscribe to all registered users in real-time for online status and reading activity
  useEffect(() => {
    if (!firebaseUid) return
    const unsubscribe = fbService.subscribeToUsers((users: any[]) => {
      setRegisteredUsers(users)
      // Pre-populate avatar configs for all users so profile views show avatars
      const configs: Record<string, AvatarConfig> = {}
      const unlocked: Record<string, string[]> = {}
      const readingAct: Record<string, any[]> = {}
      users.forEach((u: any) => {
        if (u.avatarConfig && u.username) configs[u.username] = u.avatarConfig
        if (u.unlockedItems && u.username)
          unlocked[u.username] = u.unlockedItems
        if (u.readingActivity && u.username)
          readingAct[u.username] = u.readingActivity
      })
      if (Object.keys(configs).length > 0) {
        setAllAvatarConfigs(prev => ({ ...prev, ...configs }))
      }
      if (Object.keys(unlocked).length > 0) {
        setAllUnlockedItems(prev => ({ ...prev, ...unlocked }))
      }
      if (Object.keys(readingAct).length > 0) {
        setReadingActivity(prev => ({ ...prev, ...readingAct }))
      }
    })
    return () => unsubscribe()
  }, [firebaseUid])

  // Subscribe to relationships
  useEffect(() => {
    if (!firebaseUid) return
    const unsub = fbService.subscribeToRelationships((rels: any[]) => {
      setRelationships(
        rels.map(r => ({
          admirer: r.admirer,
          target: r.target,
          timestamp: r.timestamp
        }))
      )
    })
    return () => unsub()
  }, [firebaseUid])

  const handleAdmire = (targetUser: User) => {
    const admireKey = `${user.username}->${targetUser.username}`

    // Prevent rapid double-clicks while Firestore is updating
    if (pendingAdmireRef.current.has(admireKey)) return

    const alreadyAdmiring = relationships.some(
      r => r.admirer === user.username && r.target === targetUser.username
    )

    if (alreadyAdmiring) {
      // Check if they are mutuals before un-admiring
      const isMutual = relationships.some(
        r => r.admirer === targetUser.username && r.target === user.username
      )
      if (isMutual) {
        showConfirm({
          title: 'Stop being mutuals?',
          message: `You and ${targetUser.displayName} will no longer be mutuals. Chat will be disabled but previous messages will be saved as read-only.`,
          confirmLabel: 'Yes, stop admiring',
          cancelLabel: 'Cancel',
          icon: 'people_outline',
          onConfirm: () => {
            pendingAdmireRef.current.add(admireKey)
            // Optimistic local update: remove relationship
            setRelationships(prev =>
              prev.filter(
                r =>
                  !(
                    r.admirer === user.username &&
                    r.target === targetUser.username
                  )
              )
            )
            fbService
              .removeRelationship(user.username, targetUser.username)
              .catch(console.error)
              .finally(() => pendingAdmireRef.current.delete(admireKey))
            showToast('You are no longer mutuals', 'people_outline')
          },
          onCancel: () => {}
        })
      } else {
        // Not mutuals, just un-admire silently
        pendingAdmireRef.current.add(admireKey)
        setRelationships(prev =>
          prev.filter(
            r =>
              !(r.admirer === user.username && r.target === targetUser.username)
          )
        )
        fbService
          .removeRelationship(user.username, targetUser.username)
          .catch(console.error)
          .finally(() => pendingAdmireRef.current.delete(admireKey))
        showToast('Stopped admiring', 'person_remove')
      }
      return
    }

    // Lock to prevent duplicate clicks
    pendingAdmireRef.current.add(admireKey)

    // Optimistic local update: add relationship immediately
    setRelationships(prev => [
      ...prev,
      {
        admirer: user.username,
        target: targetUser.username,
        timestamp: new Date().toISOString()
      }
    ])

    // Add admire relationship to Firestore
    fbService
      .addRelationship(user.username, targetUser.username)
      .catch(console.error)
      .finally(() => pendingAdmireRef.current.delete(admireKey))

    // Notify the target user they have a new admirer
    addNotification(
      'New Admirer',
      `${user.displayName} is now admiring you!`,
      'person_add',
      targetUser.username
    )

    // Check if this creates a mutual (target already admires current user)
    // Use local state first, then fall back to Firestore query for reliability
    const targetAdmiresLocal = relationships.some(
      r => r.admirer === targetUser.username && r.target === user.username
    )
    if (targetAdmiresLocal) {
      addNotification(
        'Mutual Connection!',
        `You and ${targetUser.displayName} are now mutuals!`,
        'people',
        user.username
      )
      addNotification(
        'Mutual Connection!',
        `You and ${user.displayName} are now mutuals!`,
        'people',
        targetUser.username
      )
    } else {
      // Firestore fallback: local relationships state might not have the reverse relationship yet
      fbService
        .checkRelationshipExists(targetUser.username, user.username)
        .then(exists => {
          if (exists) {
            addNotification(
              'Mutual Connection!',
              `You and ${targetUser.displayName} are now mutuals!`,
              'people',
              user.username
            )
            addNotification(
              'Mutual Connection!',
              `You and ${user.displayName} are now mutuals!`,
              'people',
              targetUser.username
            )
          }
        })
        .catch(console.error)
    }
  }

  const handleBlockUser = (targetUsername: string) => {
    if (targetUsername === user.username) return // Can't block yourself
    setBlockedUsers(prev => new Set([...prev, targetUsername]))
    // Remove any admire relationships in both directions via Firestore
    fbService
      .removeRelationshipsBetween(user.username, targetUsername)
      .catch(console.error)
    addNotification(
      'User Blocked',
      `You blocked @${targetUsername}. You will no longer see their content.`,
      'block'
    )
    setView('home')
  }

  const handleUnblockUser = (targetUsername: string) => {
    setBlockedUsers(prev => {
      const next = new Set(prev)
      next.delete(targetUsername)
      return next
    })
  }

  return {
    registeredUsers,
    setRegisteredUsers,
    relationships,
    setRelationships,
    MUTUALS,
    userIsUnder16,
    blockedUsers,
    setBlockedUsers,
    pendingAdmireRef,
    handleAdmire,
    handleBlockUser,
    handleUnblockUser
  }
}
