import { useRef, useState } from 'react'

const JOY_SIZE = 128
const KNOB_SIZE = 56
const JOY_RADIUS = (JOY_SIZE - KNOB_SIZE) / 2

/**
 * Analog on-screen joystick. While a finger (or the mouse) is held on the pad
 * it continuously reports the stick displacement as a normalised vector:
 * `x` is screen-right, `z` is screen-down — both in the -1..1 range and
 * matching the world axes the player walks on (forward = -z, right = +x).
 * onChange fires on every move and once more with (0, 0) on release.
 */
export const VirtualJoystick: React.FC<{
  onChange: (x: number, z: number) => void
}> = ({ onChange }) => {
  const baseRef = useRef<HTMLDivElement>(null)
  const active = useRef(false)
  const [knob, setKnob] = useState({ x: 0, y: 0 })

  const update = (clientX: number, clientY: number) => {
    const el = baseRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    let dx = clientX - cx
    let dy = clientY - cy
    const dist = Math.hypot(dx, dy)
    if (dist > JOY_RADIUS) {
      dx = (dx / dist) * JOY_RADIUS
      dy = (dy / dist) * JOY_RADIUS
    }
    setKnob({ x: dx, y: dy })
    onChange(dx / JOY_RADIUS, dy / JOY_RADIUS)
  }

  const handleDown = (e: React.PointerEvent) => {
    e.preventDefault()
    active.current = true
    ;(e.target as Element).setPointerCapture(e.pointerId)
    update(e.clientX, e.clientY)
  }

  const handleMove = (e: React.PointerEvent) => {
    if (!active.current) return
    update(e.clientX, e.clientY)
  }

  const handleUp = () => {
    if (!active.current) return
    active.current = false
    setKnob({ x: 0, y: 0 })
    onChange(0, 0)
  }

  return (
    <div
      ref={baseRef}
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerCancel={handleUp}
      className='rounded-full bg-black/5 backdrop-blur-sm border border-black/10 flex items-center justify-center pointer-events-auto select-none touch-none'
      style={{
        width: JOY_SIZE,
        height: JOY_SIZE,
        WebkitTapHighlightColor: 'transparent',
        WebkitTouchCallout: 'none'
      }}
    >
      <div
        className='rounded-full bg-white/80 shadow-lg border border-white'
        style={{
          width: KNOB_SIZE,
          height: KNOB_SIZE,
          transform: `translate(${knob.x}px, ${knob.y}px)`,
          transition: active.current ? 'none' : 'transform 0.15s ease-out'
        }}
      />
    </div>
  )
}
