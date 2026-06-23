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

// Avatar colour is supplied almost entirely by the embedded baseColorTexture
// maps (every material ships baseColorFactor=white, metallicFactor=0). If a map
// fails to decode / upload — which is what happens in the memory-constrained
// iOS WKWebView — the mesh samples an empty texture and renders pure black,
// while the desktop browser (more GPU/CPU memory) is fine. So for each material
// we: (a) keep it cheap + non-metallic, (b) re-tag the map as sRGB, and (c) when
// the map did not decode, drop it and fall back to a solid colour so the mesh
// stays visible instead of collapsing into a black silhouette.
const FALLBACK_COLOR = '#9ca3af'

const prepMaterial = (mat: THREE.Material, tint?: string) => {
  const m = mat.clone() as THREE.MeshStandardMaterial
  if ('metalness' in m) m.metalness = 0
  if ('roughness' in m) m.roughness = 0.85

  const map = m.map
  const decoded = !!(map && (map.image as any)?.width)
  if (map) {
    map.colorSpace = THREE.SRGBColorSpace
    map.needsUpdate = true
  }

  if (tint) {
    // Body (skin tone) + the untextured fallback model: always recolour. If the
    // map failed, drop it so the tint shows instead of multiplying by black.
    if (map && !decoded) m.map = null
    if ('color' in m) m.color = new THREE.Color(tint)
  } else if (map && !decoded) {
    // Clothing / hair / eyes have no tint of their own — if their texture failed
    // to upload, show a neutral colour rather than a black blob.
    m.map = null
    if ('color' in m) m.color = new THREE.Color(FALLBACK_COLOR)
  }

  m.needsUpdate = true
  return m
}

const styleMesh = (child: any, tint?: string) => {
  child.material = Array.isArray(child.material)
    ? child.material.map((m: THREE.Material) => prepMaterial(m, tint))
    : prepMaterial(child.material, tint)
}

// The man_animated.glb mesh nodes were authored with names that don't line up
// 1:1 with the AVATAR_ITEMS ids the rest of the app persists / shows in the 2D
// customiser:
//   - The two "Face 2" alternates are named "M_Eye_2 variation_2" and
//     "M_Eye_2 variation_3" (a space, and numbered from 2). After GLTFLoader
//     sanitises whitespace to "_" these become "M_Eye_2_variation_2/3". Item
//     M_Eye_2_variation_2 lines up with node ..._2 already, but item
//     M_Eye_2_variation_1 had no node and rendered an invisible face. Comparing
//     each node's embedded baseColorTexture against the 2D PNG previews, the
//     dark-lipped "Alt" (item ..._1, PNG M_Eye_2_v1) is node ..._variation_3.
//   - "M_Hair4 " carries a trailing space -> sanitised "M_Hair4_".
// The woman_animated_v2.glb model is already consistent (no aliases needed).
const AVATAR_NODE_ALIASES: Record<string, string> = {
  M_Eye_2_variation_1: 'M_Eye_2_variation_3',
  M_Hair4: 'M_Hair4_'
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
  // Animated avatar models are served from public/characters_animated/. useGLTF
  // caches by URL, so the ~16MB man / ~11MB woman models load once and are
  // shared across every avatar in the 3D world.
  const modelPath = avatarConfig
    ? `${BASE}characters_animated/animated_models/${
        avatarConfig.gender === 'male' ? 'man_animated.glb' : 'woman_animated_v2.glb'
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
    if (!scene) return

    // Generic avatar.glb (no per-user config): the only genuinely metallic,
    // untextured model — give it the target colour so it reads as a character
    // and not a flat blob once forced non-metallic.
    if (!avatarConfig) {
      scene.traverse((child: any) => {
        if (child.isMesh) styleMesh(child, targetColor)
      })
      return
    }

    const activeIds = Object.values(avatarConfig).filter(
      v =>
        typeof v === 'string' &&
        v !== avatarConfig.gender &&
        v !== avatarConfig.bodyId
    )

    const bodyNodeName =
      avatarConfig.gender === 'male' ? 'ManBody' : 'WomanBody'

    // Track which avatar IDs actually matched a GLB mesh node, so we can warn
    // (dev only) about IDs that render nothing — i.e. a mismatch between an
    // AVATAR_ITEMS id and the node names the modeller used in the .glb. This is
    // the "node-name vs avatar-ID consistency check" (X02): file loading is
    // fine, but a renamed/missing node silently hides the item.
    const matchedIds = new Set<string>()
    let bodyMatched = false

    // Resolve every active id to the exact (sanitised) GLB node name it should
    // light up, then match by equality. Substring matching (the old `includes`)
    // made a base id like "M_Eye_1" also light up "M_Eye_1_variation_1/2",
    // stacking three overlapping eye meshes; equality + the alias table fixes
    // both that and the M_Eye_2/M_Hair4 name mismatches.
    const nodeToId = new Map<string, string>()
    for (const id of activeIds) nodeToId.set(AVATAR_NODE_ALIASES[id] ?? id, id)

    scene.traverse((child: any) => {
      if (!child.isMesh) return

      // default hidden first (critical fix)
      child.visible = false

      if (child.name.includes(bodyNodeName)) {
        child.visible = true
        bodyMatched = true
        styleMesh(child, targetColor)
        return
      }

      const id = nodeToId.get(child.name)
      if (id) {
        child.visible = true
        matchedIds.add(id)
        styleMesh(child)
      }
    })

    if (import.meta.env.DEV) {
      const orphanIds = activeIds.filter(id => !matchedIds.has(id))
      if (!bodyMatched)
        console.warn(
          `[avatar] body node "${bodyNodeName}" not found in GLB — body will not render`
        )
      if (orphanIds.length)
        console.warn(
          `[avatar] avatar IDs with no matching GLB mesh node (item won't render):`,
          orphanIds
        )
    }
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