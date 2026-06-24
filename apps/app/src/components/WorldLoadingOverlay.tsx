import { useEffect, useRef, useState } from 'react'
import { useProgress } from '@react-three/drei'
import { BASE } from '@/config/config'

// White full-screen cover that mirrors the native launch splash (logo.png
// centred on #ffffff). HomeView's Canvas uses a null Suspense fallback, so
// without this the ~16MB man / ~11MB woman GLBs stream into an empty world and
// every avatar pops in at once — the "all assets load at the same time" flash.
// We sit on top of the world until drei's loading manager reports the GLBs are
// in, then fade out, so the scene is only revealed once it's actually ready
// (the React-side counterpart to the native splash hand-off in AppShell).
export const WorldLoadingOverlay = () => {
  const { active, progress } = useProgress()
  // Whether a load cycle has actually begun. We only trust an idle manager to
  // mean "done" once we've seen it go busy — otherwise the very first idle tick
  // before loading starts would hide the cover instantly.
  const startedRef = useRef(false)
  const [done, setDone] = useState(false) // loading settled -> begin fade-out
  const [hidden, setHidden] = useState(false) // fade finished -> unmount

  useEffect(() => {
    if (active) startedRef.current = true
  }, [active])

  useEffect(() => {
    // Normal path: a load cycle ran and has now gone idle at 100%. Wait a beat
    // after the GLBs are in so the renderer has a frame or two to actually paint
    // the scene before we fade the cover out — otherwise the reveal can flash an
    // empty world for an instant.
    if (startedRef.current && !active && progress >= 100) {
      const reveal = setTimeout(() => setDone(true), 1000)
      return () => clearTimeout(reveal)
    }
  }, [active, progress])

  useEffect(() => {
    // Cached path: if no load has begun shortly after mount, the world's models
    // were already in the useGLTF cache (e.g. returning to Home, or preloaded by
    // the customiser), so reveal the scene without waiting.
    const settle = setTimeout(() => {
      if (!startedRef.current) setDone(true)
    }, 1000)
    // Hard backstop so a stalled or erroring load can never strand the cover —
    // mirrors AppShell's 8s native-splash failsafe.
    const backstop = setTimeout(() => setDone(true), 8000)
    return () => {
      clearTimeout(settle)
      clearTimeout(backstop)
    }
  }, [])

  if (hidden) return null

  return (
    <div
      className='fixed inset-0 flex items-center justify-center bg-white transition-opacity duration-500'
      // drei's <Html> avatar labels (the "You" / "EXPLORING" badges) render as
      // DOM at z-index up to 16777271, so a plain z-[300] would let them punch
      // through the cover as soon as the player avatar mounts. Sit just above
      // that whole range so the splash genuinely covers the world.
      style={{
        zIndex: 16777300,
        opacity: done ? 0 : 1,
        pointerEvents: done ? 'none' : 'auto'
      }}
      onTransitionEnd={() => {
        if (done) setHidden(true)
      }}
    >
      <img
        src={`${BASE}logo.png`}
        alt=''
        aria-hidden
        draggable={false}
        className='w-32 h-32 select-none'
      />
    </div>
  )
}
