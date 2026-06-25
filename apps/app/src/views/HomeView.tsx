import * as THREE from 'three'
import { Suspense, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Environment, PerspectiveCamera } from '@react-three/drei'
import { Capacitor } from '@capacitor/core'
import { WORLD_RADIUS } from '@/config/constants'
import { BASE } from '@/config/config'
import { MovingAvatar, Player } from '@/components/three/threeComponents'
import { VirtualJoystick } from '@/components/VirtualJoystick'
import { WorldLoadingOverlay } from '@/components/WorldLoadingOverlay'
import { SafeImg } from '@/components/SafeImg'
import { ModelErrorBoundary } from '@/components/three/ModelErrorBoundary'
import type { User } from '@/types'
import { EMOTES } from '@/config/emotes'
import { useApp } from '@/state/AppContext'

export const HomeView = () => {
  const {
    moveDir,
    avatarConfig,
    relationships,
    user,
    firebaseUid,
    registeredUsers,
    MUTUALS,
    blockedUsers,
    setSelectedProfileUser,
    setView,
    notifications,
    userDataLoaded,
    worldUsernames,
    getWorldEntry,
    sendEmote
  } = useApp()
  // Own emote shown locally for immediate feedback (peers get it via RTDB). The
  // id makes AvatarModel's burst re-trigger even on the same emote type twice.
  const [myEmote, setMyEmote] = useState<{ type: string; id: number } | null>(
    null
  )
  // Emote picker open/closed. Collapsed to a single button (parallel to the
  // joystick) and expands upward so it clears the bottom tab bar on phones.
  const [emoteOpen, setEmoteOpen] = useState(false)
  const triggerEmote = (type: string) => {
    sendEmote(type)
    setEmoteOpen(false)
    const id = (myEmote?.id ?? 0) + 1
    setMyEmote({ type, id })
    setTimeout(() => {
      setMyEmote(prev => (prev?.id === id ? null : prev))
    }, 2000)
  }
  return (
    <div className='fixed inset-0 bg-white'>
      <Canvas shadows>
        <ModelErrorBoundary>
        <Suspense fallback={null}>
          <PerspectiveCamera makeDefault position={[0, 5, 10]} fov={50} />
          {/* These direct lights are the SOLE light source on native (the HDR
              environment is web-only — see below). Avatar materials are
              non-metallic and textured, so ambient + hemisphere + directional
              fully shade them without any environment map. */}
          <ambientLight intensity={0.7} />
          <hemisphereLight args={['#ffffff', '#d9d9d9', 0.8]} />
          <directionalLight position={[5, 10, 7]} intensity={1.4} />
          <pointLight position={[10, 10, 10]} intensity={1.0} />
          <mesh scale={[WORLD_RADIUS, WORLD_RADIUS, WORLD_RADIUS]}>
            <sphereGeometry args={[1, 64, 64]} />
            <meshStandardMaterial
              color='#ffffff'
              transparent
              opacity={0.15}
              side={THREE.BackSide}
            />
          </mesh>
          <gridHelper
            args={[100, 50, 0xeeeeee, 0xf5f5f5]}
            position={[0, -0.01, 0]}
          />
          {/* Hold the player avatar until the Firestore profile resolves. Before
              that, avatarConfig is null and Player would briefly render the
              generic avatar.glb (the red blob). userDataLoaded flips true in the
              same batched setState that populates avatarConfig, so gating here
              means the correct, configured model is the first thing shown. */}
          {userDataLoaded && (
            <Player
              moveDir={moveDir}
              avatarConfig={avatarConfig}
              firebaseUid={firebaseUid}
              emote={myEmote}
            />
          )}
          {(() => {
            // Mutuals = both admire directions exist.
            const myAdmiring = relationships
              .filter(r => r.admirer === user.username)
              .map(r => r.target)
            const actualMutualUsernames = myAdmiring.filter(t =>
              relationships.some(
                r => r.admirer === t && r.target === user.username
              )
            )
            // Render EVERY (non-blocked) mutual, always — online or not. Users
            // present in /world (worldUsernames) get live position/rotation/
            // activity from RTDB via getWorldEntry. Everyone else (offline, or
            // online but in a non-world view) falls back to the legacy random
            // wander inside MovingAvatar, with a status derived here:
            //   - offline            → "Offline"
            //   - online, no /world  → their persisted activity, or "Exploring"
            // Live avatars override that fallback per-frame with the RTDB label.
            return actualMutualUsernames
              .filter(username => !blockedUsers.has(username))
              .map(username => {
                const found = (registeredUsers.find(
                  u => u.username === username
                ) || MUTUALS.find(u => u.username === username)) as
                  | User
                  | undefined
                if (!found) return null
                const live = worldUsernames.has(username)
                const isOnline = live || !!found.isOnline
                const fallbackActivity = isOnline
                  ? found.activity && found.activity !== 'Idle'
                    ? found.activity
                    : 'Exploring'
                  : 'Offline'
                return (
                  <MovingAvatar
                    key={username}
                    user={found}
                    fallbackActivity={fallbackActivity}
                    getWorldEntry={getWorldEntry}
                    onClick={() => {
                      setSelectedProfileUser(found)
                      setView('profile')
                    }}
                  />
                )
              })
              .filter(Boolean)
          })()}
        </Suspense>
        </ModelErrorBoundary>
        {/* The HDR environment is a web-only nicety: avatar materials are
            non-metallic and textured, so they are fully shaded by the direct
            lights above and gain almost nothing from IBL. On native it is
            skipped entirely — the RGBELoader half-float + PMREM path is memory
            heavy in the iOS WKWebView, and keeping it out of the avatars'
            Suspense means it can never blank the character subtree. */}
        {!Capacitor.isNativePlatform() && (
          <Suspense fallback={null}>
            <Environment files={`${BASE}hdr/city.hdr`} />
          </Suspense>
        )}
      </Canvas>
      <div
        className='absolute left-6 pointer-events-none flex justify-between w-[calc(100%-48px)] items-start'
        style={{ top: 'calc(0.75rem + env(safe-area-inset-top))' }}
      >
        <div>
          <SafeImg
            src={`${BASE}wordlogo.png`}
            alt='MainWRLD'
            className='w-[240px] drop-shadow-md'
          />
        </div>
        <div className='flex flex-col gap-4 pointer-events-auto'>
          <button
            onClick={() => setView('notifications')}
            className='w-14 h-14 bg-white/90 backdrop-blur-xl rounded-2xl shadow-xl flex items-center justify-center text-gray-500 border border-white relative transition-all active:scale-90'
          >
            <span className='material-icons-round'>notifications</span>
            {notifications.some(
              n => n.recipient === user.username && !n.read
            ) && (
              <span className='absolute top-2 right-2 w-3 h-3 bg-red-500 rounded-full border-2 border-white' />
            )}
          </button>
          <button
            onClick={() => setView('daily-rewards')}
            className='w-14 h-14 bg-accent/90 backdrop-blur-xl rounded-2xl shadow-xl flex flex-col items-center justify-center text-white border border-white relative transition-all active:scale-90'
          >
            <span className='material-icons-round'>card_giftcard</span>
            <span className='text-[7px] font-black uppercase leading-tight'>
              Points
            </span>
          </button>
        </div>
      </div>
      {/* Bottom-right controls: the emote button stacked ABOVE the analog
          joystick, both raised clear of the bottom tab bar (which sits at
          safe-area + 1rem). The whole column is bottom-anchored, so opening the
          emote menu grows it upward and the joystick stays put.
          The joystick mutates the shared moveDir vector in place rather than
          calling setMoveDir: Player reads moveDir live every frame in useFrame,
          so in-place writes drive movement without re-rendering HomeView (and
          re-running the mutual-avatar layout) 60× a second. */}
      <div
        className='absolute right-8 z-[210] pointer-events-none flex flex-col items-end gap-4'
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 6.5rem)' }}
      >
        {/* Emote control — tap to reveal the emotes, which expand UPWARD so they
            clear the joystick and the tab bar. Picking one broadcasts it over
            RTDB (peers see a burst above your avatar) and collapses the menu. */}
        <div className='pointer-events-auto flex flex-col-reverse items-end gap-3'>
          <button
            onClick={() => setEmoteOpen(o => !o)}
            aria-label='Emotes'
            aria-expanded={emoteOpen}
            className='w-16 h-16 bg-white/90 backdrop-blur-xl rounded-full shadow-xl flex items-center justify-center text-3xl border border-white transition-all active:scale-90'
          >
            {emoteOpen ? '✕' : '😊'}
          </button>
          {emoteOpen &&
            EMOTES.map((e, i) => (
              <button
                key={e.type}
                onClick={() => triggerEmote(e.type)}
                aria-label={e.label}
                style={{ animationDelay: `${i * 30}ms` }}
                className='emote-menu-item w-14 h-14 bg-white/95 backdrop-blur-xl rounded-full shadow-lg flex items-center justify-center text-2xl border border-white transition-all active:scale-90'
              >
                {e.emoji}
              </button>
            ))}
        </div>
        <VirtualJoystick
          onChange={(x, z) => {
            moveDir.set(x, 0, z)
          }}
        />
      </div>
      {/* Splash-style cover that hides the world until its GLB models finish
          streaming in, so the avatars don't all pop into an empty scene at
          once. Rendered last + z-[300] so it sits above the HUD and bottom nav,
          just like the native launch splash. */}
      <WorldLoadingOverlay />
    </div>
  )
}
