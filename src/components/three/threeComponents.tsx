import React, { useMemo, useRef, useEffect, useState } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Html, useGLTF, useAnimations } from '@react-three/drei'
import { BASE } from '@/config/config'
import { ACCENT_COLOR, WORLD_RADIUS, SKIN_TONE_COLORS } from '@/config/constants'
import { AvatarConfig, User } from '@/types'
import { SkeletonUtils } from 'three-stdlib'

// -----------------------------
// Helpers
// -----------------------------

const applySkinTone = (scene: THREE.Object3D, color: string) => {
  scene.traverse((child: any) => {
    if (child.isMesh) {
      child.material = child.material.clone()
      child.material.color = new THREE.Color(color)
    }
  })
}

// -----------------------------
// Avatar Model
// -----------------------------

export const AvatarModel: React.FC<{
  name: string
  activity: string
  onClick?: () => void
  online: boolean
  isPlayer?: boolean
  skinColor?: string
  avatarConfig?: AvatarConfig
  isMoving?: boolean
}> = ({
  name,
  activity,
  onClick,
  online,
  isPlayer,
  skinColor,
  avatarConfig,
  isMoving = false
}) => {
  const modelPath = avatarConfig
    ? `../CharactersAnimated/AnimatedModels/${
        avatarConfig.gender === 'male' ? 'ManAnimated.glb' : 'WomanAnimated.glb'
      }`
    : `${BASE}avatar.glb`

  const avatarGLTF = useGLTF(modelPath)
  const avatarRef = useRef<THREE.Group>(null)

  const targetColor = avatarConfig
    ? SKIN_TONE_COLORS[avatarConfig.bodyId] || ACCENT_COLOR
    : isPlayer
    ? skinColor || ACCENT_COLOR
    : '#334155'

  // -----------------------------
  // CLONE SCENE (animation-safe)
  // -----------------------------
  const scene = useMemo(() => {
    return SkeletonUtils.clone(avatarGLTF.scene)
  }, [avatarGLTF])

  // -----------------------------
  // APPLY AVATAR CONFIG (IMPORTANT FIX)
  // -----------------------------
  useEffect(() => {
    if (!scene || !avatarConfig) return

    const activeIds = Object.values(avatarConfig).filter(
      v =>
        typeof v === 'string' &&
        v !== avatarConfig.gender &&
        v !== avatarConfig.bodyId
    )

    const bodyNodeName =
      avatarConfig.gender === 'male' ? 'ManBody' : 'WomanBody'

    scene.traverse((child: any) => {
      if (!child.isMesh) return

      // default hidden first (critical fix)
      child.visible = false

      if (child.name.includes(bodyNodeName)) {
        child.visible = true
        applySkinTone(child, targetColor)
        return
      }

      for (let id of activeIds) {
        if (child.name.includes(id)) {
          child.visible = true
          break
        }
      }
    })
  }, [scene, avatarConfig, targetColor])

  // -----------------------------
  // ANIMATIONS
  // -----------------------------
  const { actions } = useAnimations(avatarGLTF.animations, avatarRef)

  useEffect(() => {
    if (!actions) return

    const action = Object.values(actions)[0]
    if (!action) return

    action.enabled = true
    action.setLoop(THREE.LoopRepeat, Infinity)

    if (isMoving) {
      action.reset()
      action.paused = false
      action.timeScale = 1
      action.fadeIn(0.2).play()
    } else {
      action.fadeOut(0.3).play();
    }

    return () => {
      action.stop()
    }
  }, [actions, isMoving])

  console.log(name + " : " + online)

  return (
    <group
      onClick={e => {
        e.stopPropagation()
        onClick?.()
      }}
    >
      <primitive ref={avatarRef} object={scene} />

      <Html position={[0, 2.4, 0]} center distanceFactor={10}>
        <div className='flex flex-col items-center pointer-events-none select-none'>
          <div className='flex items-center gap-1.5 px-3 py-1 bg-white/95 dark:bg-black/90 backdrop-blur-md rounded-full shadow-lg border border-gray-100 dark:border-gray-800'>
            <div
              className={`w-2 h-2 rounded-full ${
                online === true ? 'bg-green-500' : 'bg-gray-300'
              }`}
            />
            <span className='text-[10px] font-bold text-black dark:text-white whitespace-nowrap'>
              {name}
            </span>
          </div>

          <div className='mt-1 px-2 py-0.5 bg-accent/10 rounded-md border border-accent/20'>
            <span className='text-[8px] font-bold uppercase tracking-widest text-accent'>
              {activity}
            </span>
          </div>
        </div>
      </Html>
    </group>
  )
}

// -----------------------------
// Moving Avatar (NPCs)
// -----------------------------

export const MovingAvatar: React.FC<{ user: User; onClick?: () => void }> = ({
  user,
  onClick
}) => {
  const groupRef = useRef<THREE.Group>(null)
  const targetPos = useRef(new THREE.Vector3(...user.position))
  const waitTimer = useRef(0)
  const [isMoving, setIsMoving] = useState(false)

  console.log(user.displayName + " : " + user.isOnline)
  const getNewTarget = () =>
    new THREE.Vector3(
      (Math.random() - 0.5) * WORLD_RADIUS * 0.8,
      0,
      (Math.random() - 0.5) * WORLD_RADIUS * 0.8
    )

  useFrame((_, delta) => {
    if (!groupRef.current) return

    if (waitTimer.current > 0) {
      waitTimer.current -= delta
      setIsMoving(false)
      return
    }

    const currentPos = groupRef.current.position
    const distance = currentPos.distanceTo(targetPos.current)

    if (distance < 0.2) {
      waitTimer.current = 2 + Math.random() * 5
      targetPos.current = getNewTarget()
      setIsMoving(false)
    } else {
      setIsMoving(true)

      const moveDir = targetPos.current.clone().sub(currentPos).normalize()
      currentPos.add(moveDir.multiplyScalar(1.5 * delta))

      const targetRotation = Math.atan2(moveDir.x, moveDir.z)
      groupRef.current.rotation.y = THREE.MathUtils.lerp(
        groupRef.current.rotation.y,
        targetRotation,
        0.05
      )
    }
  })

  // console.log(user.displayName + " : " + user.isOnline)

  return (
    <group ref={groupRef} position={user.position}>
      <AvatarModel
        name={user.displayName}
        activity={user.activity}
        online={user.isOnline}
        onClick={onClick}
        avatarConfig={user.avatarConfig}
        isMoving={isMoving}
      />
    </group>
  )
}

// -----------------------------
// Player Controller
// -----------------------------

export const Player: React.FC<{
  moveDir: THREE.Vector3
  skinColor?: string
  avatarConfig?: AvatarConfig
}> = ({ moveDir, skinColor, avatarConfig }) => {
  const meshRef = useRef<THREE.Group>(null)
  const keys = useRef<Record<string, boolean>>({})
  const [isMoving, setIsMoving] = useState(false)

  useEffect(() => {
    const handleDown = (e: KeyboardEvent) => {
      keys.current[e.code] = true
    }
    const handleUp = (e: KeyboardEvent) => {
      keys.current[e.code] = false
    }

    window.addEventListener('keydown', handleDown)
    window.addEventListener('keyup', handleUp)

    return () => {
      window.removeEventListener('keydown', handleDown)
      window.removeEventListener('keyup', handleUp)
    }
  }, [])

  useFrame((state, delta) => {
    if (!meshRef.current) return

    const { camera } = state
    const speed = 6 * delta
    const direction = new THREE.Vector3()

    if (keys.current['KeyW'] || keys.current['ArrowUp']) direction.z -= 1
    if (keys.current['KeyS'] || keys.current['ArrowDown']) direction.z += 1
    if (keys.current['KeyA'] || keys.current['ArrowLeft']) direction.x -= 1
    if (keys.current['KeyD'] || keys.current['ArrowRight']) direction.x += 1

    if (moveDir.length() > 0) direction.add(moveDir)

    const moving = direction.length() > 0
    setIsMoving(moving)

    if (moving) {
      direction.normalize().multiplyScalar(speed)
      meshRef.current.position.add(direction)
      meshRef.current.rotation.y = Math.atan2(direction.x, direction.z)
    }

    const idealOffset = new THREE.Vector3(0, 5, 8).add(meshRef.current.position)
    camera.position.lerp(idealOffset, 0.1)
    camera.lookAt(
      meshRef.current.position.x,
      meshRef.current.position.y + 1,
      meshRef.current.position.z
    )
  })

  return (
    <group ref={meshRef}>
      <AvatarModel
        name='You'
        activity='Exploring'
        online={true}
        isPlayer={true}
        skinColor={skinColor}
        avatarConfig={avatarConfig}
        isMoving={isMoving}
      />
    </group>
  )
}

export default {
  AvatarModel,
  MovingAvatar,
  Player
}