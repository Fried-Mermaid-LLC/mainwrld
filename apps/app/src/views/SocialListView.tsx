import { useEffect, useState } from 'react'
import type { Relationship, User, View } from '@/types'
import { useApp } from '@/state/AppContext'
import * as worldService from '@/services/worldService'
import { rtdb } from '@/lib/firebase'

// Shared list screen behind the three social stats on the Me profile
// (Mutuals / Admirers / Admiring). One component, switched by `view`, since the
// three only differ in their title and which slice of the social graph they
// resolve. Rows open the tapped user's profile, mirroring ExploreView's People
// list (setSelectedProfileUser → 'profile').

type SocialView = Extract<View, 'mutuals' | 'admirers' | 'admiring'>

const TITLES: Record<SocialView, string> = {
  mutuals: 'Mutuals',
  admirers: 'Admirers',
  admiring: 'Admiring'
}

// Map a live activity word to the pill label shown on the right of a row. Only
// the two "doing something now" states get a pill; everything else (Idle /
// Exploring / Offline) stays blank, matching the design.
const activityPill = (activity?: string): string | null => {
  if (activity === 'Reading') return 'Reading'
  if (activity === 'Writing') return 'Writing'
  return null
}

export const SocialListView = () => {
  const {
    view,
    user,
    relationships,
    registeredUsers,
    socialListUsername,
    setSelectedProfileUser,
    setView
  } = useApp()

  const mode = view as SocialView
  // Whose lists we're showing: a specific person when opened from their Profile,
  // otherwise the signed-in user (opened from the Me profile).
  const target = socialListUsername ?? user.username
  const isSelf = target === user.username

  // Live presence straight from the RTDB /world node — the same source the 3D
  // avatars and OtherProfileView read. The Firestore mirror on registeredUsers
  // (isOnline / activity) trails the heartbeat and can stay stale, so a row's
  // online dot and Reading/Writing pill must come from here. Falls back to the
  // mirror only when the world layer is disabled (no RTDB configured).
  const [worldPresence, setWorldPresence] = useState<
    Record<string, { activity: string }>
  >({})
  const worldReady = rtdb != null
  useEffect(() => {
    if (!rtdb) return
    return worldService.subscribeWorld(entries => {
      const next: Record<string, { activity: string }> = {}
      for (const e of entries) next[e.username] = { activity: e.activity }
      setWorldPresence(next)
    })
  }, [])
  // Resolve a user's live online + activity, preferring /world over the mirror.
  const presenceOf = (u: any): { isOnline: boolean; activity?: string } => {
    if (worldReady) {
      const entry = worldPresence[u.username]
      return { isOnline: !!entry, activity: entry?.activity }
    }
    return { isOnline: !!u.isOnline, activity: u.activity }
  }

  // Resolve a username from the social graph to its full user record (carries
  // displayName / presence / avatar). Falls back to a minimal stub so a user we
  // haven't mirrored yet still renders as a tappable row instead of vanishing.
  const resolve = (username: string): User =>
    (registeredUsers.find((u: any) => u.username === username) as User) ?? ({
      username,
      displayName: username
    } as User)

  // Computed generically from the social graph for `target`, so the same screen
  // serves both the signed-in user and any other profile. Usernames are
  // deduped first — the relationships feed can carry more than one edge for the
  // same pair, which otherwise renders the same person several times.
  const users: User[] = (() => {
    const usernames: string[] = (() => {
      if (mode === 'admirers') {
        return relationships
          .filter((r: Relationship) => r.target === target)
          .map((r: Relationship) => r.admirer)
      }
      if (mode === 'admiring') {
        return relationships
          .filter((r: Relationship) => r.admirer === target)
          .map((r: Relationship) => r.target)
      }
      // mutuals: people `target` admires who also admire `target` back.
      const targetAdmiring = new Set(
        relationships
          .filter((r: Relationship) => r.admirer === target)
          .map((r: Relationship) => r.target)
      )
      return relationships
        .filter(
          (r: Relationship) =>
            r.target === target && targetAdmiring.has(r.admirer)
        )
        .map((r: Relationship) => r.admirer)
    })()
    return Array.from(new Set(usernames)).map(resolve)
  })()

  const onSelect = (u: User) => {
    setSelectedProfileUser(u)
    setView('profile')
  }

  // Back returns to wherever this list was opened from: the Me profile for the
  // signed-in user, or the other person's Profile otherwise.
  const onBack = () => setView(isSelf ? 'self-profile' : 'profile')

  return (
    <div className='fixed inset-0 bg-white overflow-y-auto no-scrollbar pb-32 animate-in slide-in-from-right duration-500'>
      {/* Back arrow on the left, centered title — matching the other screens. */}
      <header className='relative px-6 py-4 border-b border-[#eaeaea] flex items-center justify-center'>
        <button
          onClick={onBack}
          className='absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400 hover:text-accent transition-colors'
        >
          <span className='material-icons-round'>arrow_back</span>
        </button>
        <h1 className='text-[22px] font-bold leading-[1.24] text-[#1a1a1a]'>
          {TITLES[mode]}
        </h1>
      </header>

      <div className='flex flex-col gap-4 px-6 pt-6 max-w-3xl mx-auto w-full'>
        {users.length === 0 ? (
          <div className='flex flex-col items-center justify-center py-24 text-[#c2c8cf]'>
            <span className='material-icons-round text-5xl mb-4'>
              {mode === 'mutuals'
                ? 'people_outline'
                : mode === 'admirers'
                  ? 'favorite_border'
                  : 'auto_awesome'}
            </span>
            <p className='text-[11px] font-bold uppercase tracking-[0.66px]'>
              {mode === 'mutuals'
                ? 'No mutuals'
                : mode === 'admirers'
                  ? 'No admirers'
                  : 'Not admiring anyone'}
            </p>
          </div>
        ) : (
          users.map((u: any) => {
            const { isOnline, activity } = presenceOf(u)
            const pill = activityPill(activity)
            return (
              <button
                key={u.username}
                onClick={() => onSelect(u)}
                className='w-full p-4 flex items-center gap-4 bg-white rounded-[20px] border border-[#eaeaea] shadow-[0px_6px_18px_0px_rgba(0,0,0,0.04)] transition-transform active:scale-[0.98]'
              >
                <div className='w-16 h-16 rounded-[20px] bg-[#fbdddd] flex items-center justify-center text-accent text-2xl font-bold flex-shrink-0'>
                  {(u.displayName || u.username)[0]?.toUpperCase()}
                </div>
                <div className='text-left flex-1 min-w-0'>
                  <div className='flex items-center gap-2'>
                    <p className='text-[17px] font-bold text-[#1a1a1a] truncate'>
                      {u.displayName || u.username}
                    </p>
                    {isOnline && (
                      <span className='w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0' />
                    )}
                  </div>
                  <p className='text-[13px] text-[#9aa1a9] font-semibold truncate'>
                    @{u.username}
                  </p>
                </div>
                {pill && (
                  <span className='px-3 py-1.5 rounded-lg bg-accent/10 text-accent text-[11px] font-bold uppercase tracking-wider flex-shrink-0'>
                    {pill}
                  </span>
                )}
                <span className='material-icons-round text-[22px] text-[#c2c8cf] flex-shrink-0'>
                  chevron_right
                </span>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
