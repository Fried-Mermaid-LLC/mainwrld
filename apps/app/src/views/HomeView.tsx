import * as THREE from 'three'
import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { Environment, PerspectiveCamera } from '@react-three/drei'
import { Capacitor } from '@capacitor/core'
import { WORLD_RADIUS } from '@/config/constants'
import { BASE } from '@/config/config'
import { MovingAvatar, Player } from '@/components/three/threeComponents'
import { SafeImg } from '@/components/SafeImg'
import { ModelErrorBoundary } from '@/components/three/ModelErrorBoundary'
import type { User } from '@/types'
import { useApp } from '@/state/AppContext'

export const HomeView = () => {
  const {
    moveDir,
    avatarConfig,
    relationships,
    user,
    registeredUsers,
    MUTUALS,
    blockedUsers,
    setSelectedProfileUser,
    setView,
    notifications,
    setMoveDir,
    userDataLoaded
  } = useApp()
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
            <Player moveDir={moveDir} avatarConfig={avatarConfig} />
          )}
          {(() => {
            // Get usernames of actual mutuals (both directions exist)
            const myAdmiring = relationships
              .filter(r => r.admirer === user.username)
              .map(r => r.target)
            const actualMutualUsernames = myAdmiring.filter(t =>
              relationships.some(
                r => r.admirer === t && r.target === user.username
              )
            )
            // Build User objects for actual mutuals from registeredUsers
            const dynamicMutuals: User[] = actualMutualUsernames
              .map((username, i) => {
                const regUser = registeredUsers.find(
                  u => u.username === username
                )
                const mutualUser = MUTUALS.find(
                  u => u.username === username
                )
                const found = regUser || mutualUser
                if (
                  found &&
                  (!found.position ||
                    (found.position[0] === 0 && found.position[2] === 0))
                ) {
                  const angle =
                    (i / Math.max(actualMutualUsernames.length, 1)) *
                    Math.PI *
                    2
                  const radius = 8 + Math.random() * 10
                  found.position = [
                    Math.cos(angle) * radius,
                    0,
                    Math.sin(angle) * radius
                  ] as [number, number, number]
                }
                return found
              })
              .filter(Boolean) as User[]
            // If no dynamic mutuals, show MUTUALS as fallback so world isn't empty
            const avatarsToShow =
              dynamicMutuals.length > 0 ? dynamicMutuals : MUTUALS
            // Limit visible mutuals to avoid overwhelming the scene
            // const eightHoursAgo = Date.now() - 8 * 3600 * 1000
            const visibleMutuals =
              avatarsToShow.length > 200
                ? avatarsToShow
                    .filter((m: any) => m.isOnline)
                    .slice(0, 200)
                : avatarsToShow.slice(0, 200)
            // Filter out blocked users
            return visibleMutuals
              .filter(u => !blockedUsers.has(u.username))
              .map(u => (
                <MovingAvatar
                  key={u.username}
                  user={u}
                  onClick={() => {
                    setSelectedProfileUser(u)
                    setView('profile')
                  }}
                />
              ))
            // ONLY SHOW USERS WHO ARE ONLINE & MUTUAL
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
      {/* D-Pad */}
      <div className='absolute bottom-32 right-8 w-32 h-32 flex items-center justify-center pointer-events-none'>
        <div
          className='grid grid-cols-3 gap-1 pointer-events-auto select-none'
          style={{
            WebkitTapHighlightColor: 'transparent',
            WebkitTouchCallout: 'none'
          }}
        >
          <div />
          <button
            onPointerDown={(e) => {
              e.preventDefault()
              setMoveDir(new THREE.Vector3(0, 0, -1))
            }}
            onPointerUp={() => setMoveDir(new THREE.Vector3(0, 0, 0))}
            className='w-10 h-10 bg-black/5 rounded-xl flex items-center justify-center text-black/20 select-none touch-manipulation'
            style={{
              WebkitTapHighlightColor: 'transparent',
              WebkitTouchCallout: 'none'
            }}
          >
            <span className='material-icons-round select-none'>
              keyboard_arrow_up
            </span>
          </button>
          <div />
          <button
            onPointerDown={(e) => {
              e.preventDefault()
              setMoveDir(new THREE.Vector3(-1, 0, 0))
            }}
            onPointerUp={() => setMoveDir(new THREE.Vector3(0, 0, 0))}
            className='w-10 h-10 bg-black/5 rounded-xl flex items-center justify-center text-black/20 select-none touch-manipulation'
            style={{
              WebkitTapHighlightColor: 'transparent',
              WebkitTouchCallout: 'none'
            }}
          >
            <span className='material-icons-round select-none'>
              keyboard_arrow_left
            </span>
          </button>
          <div />
          <button
            onPointerDown={(e) => {
              e.preventDefault()
              setMoveDir(new THREE.Vector3(1, 0, 0))
            }}
            onPointerUp={() => setMoveDir(new THREE.Vector3(0, 0, 0))}
            className='w-10 h-10 bg-black/5 rounded-xl flex items-center justify-center text-black/20 select-none touch-manipulation'
            style={{
              WebkitTapHighlightColor: 'transparent',
              WebkitTouchCallout: 'none'
            }}
          >
            <span className='material-icons-round select-none'>
              keyboard_arrow_right
            </span>
          </button>
          <div />
          <button
            onPointerDown={(e) => {
              e.preventDefault()
              setMoveDir(new THREE.Vector3(0, 0, 1))
            }}
            onPointerUp={() => setMoveDir(new THREE.Vector3(0, 0, 0))}
            className='w-10 h-10 bg-black/5 rounded-xl flex items-center justify-center text-black/20 select-none touch-manipulation'
            style={{
              WebkitTapHighlightColor: 'transparent',
              WebkitTouchCallout: 'none'
            }}
          >
            <span className='material-icons-round select-none'>
              keyboard_arrow_down
            </span>
          </button>
          <div />
        </div>
      </div>
    </div>
  )
}
