import { useState, useCallback, useMemo, useEffect } from 'react'
import * as fbService from '@/services/firebaseService'
import type { User, AvatarConfig } from '@/types'

interface AvatarDeps {
  user: User
  selectedProfileUser: User | null
}

// Avatar config + unlocked items per user (Phase B). Owns allAvatarConfigs and
// allUnlockedItems, the derived avatarConfig/unlockedAvatarItems for the current
// user, and the effect that lazy-loads another user's avatar when their profile
// is opened. Depends only on user / selectedProfileUser.
export function useAvatar({ user, selectedProfileUser }: AvatarDeps) {
  // Avatar customization state (loaded from Firestore user doc)
  const [allAvatarConfigs, setAllAvatarConfigs] = useState<
    Record<string, AvatarConfig>
  >({})

  const avatarConfig = allAvatarConfigs[user.username] || null
  const setAvatarConfig = useCallback(
    (config: AvatarConfig | null) => {
      setAllAvatarConfigs(prev => {
        if (!config) {
          const next = { ...prev }
          ;-delete next[user.username]
          return next
        }
        return { ...prev, [user.username]: config }
      })
    },
    [user.username]
  )

  // Unlocked avatar items (loaded from Firestore user doc)
  const [allUnlockedItems, setAllUnlockedItems] = useState<
    Record<string, string[]>
  >({})

  const unlockedAvatarItems = useMemo(
    () => new Set(allUnlockedItems[user.username] || []),
    [allUnlockedItems, user.username]
  )
  const setUnlockedAvatarItems = useCallback(
    (updater: Set<string> | ((prev: Set<string>) => Set<string>)) => {
      setAllUnlockedItems(prev => {
        const currentSet = new Set(prev[user.username] || [])
        const newSet =
          typeof updater === 'function' ? updater(currentSet) : updater
        return { ...prev, [user.username]: [...newSet] }
      })
    },
    [user.username]
  )

  // Load avatar config for other users when viewing their profile
  useEffect(() => {
    if (!selectedProfileUser || selectedProfileUser.username === user.username)
      return
    if (allAvatarConfigs[selectedProfileUser.username]) return // already loaded
    fbService
      .getUserByUsername(selectedProfileUser.username)
      .then((profile: any) => {
        if (profile?.avatarConfig) {
          setAllAvatarConfigs(prev => ({
            ...prev,
            [selectedProfileUser.username]: profile.avatarConfig
          }))
        }
      })
      .catch(console.error)
  }, [selectedProfileUser])
  return {
    allAvatarConfigs,
    setAllAvatarConfigs,
    avatarConfig,
    setAvatarConfig,
    allUnlockedItems,
    setAllUnlockedItems,
    unlockedAvatarItems,
    setUnlockedAvatarItems
  }
}
