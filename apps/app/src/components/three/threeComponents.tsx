import React, { useMemo, useRef, useEffect, useState } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { Html, useGLTF, useAnimations } from "@react-three/drei";
import { BASE } from "@/config/config";
import {
  ACCENT_COLOR,
  WORLD_RADIUS,
  SKIN_TONE_COLORS,
} from "@/config/constants";
import { emojiForEmote } from "@/config/emotes";
import { AvatarConfig, User, WorldEntry } from "@/types";
import * as worldService from "@/services/worldService";
import { SkeletonUtils } from "three-stdlib";

// -----------------------------
// Helpers
// -----------------------------

const UP = new THREE.Vector3(0, 1, 0);

// Remote avatars are rendered this far in the past (seconds). The world layer
// writes transforms at ~9 Hz (WORLD_WRITE_MS = 110ms); by holding the render
// clock ~1.5 write-intervals behind we always have two buffered snapshots that
// bracket the render time, so we can interpolate between them at a *constant*
// velocity. Easing toward the latest snapshot instead (a low-pass chase) makes
// the avatar accelerate right after each packet and decelerate as it arrives —
// the velocity pulses at 9 Hz and reads as a stutter. 150ms trades a little
// latency for genuinely smooth motion. See SNAPSHOT_BUFFER below.
const INTERP_DELAY = 0.15;

// Avatar colour is supplied almost entirely by the embedded baseColorTexture
// maps (every material ships baseColorFactor=white, metallicFactor=0). If a map
// fails to decode / upload — which is what happens in the memory-constrained
// iOS WKWebView — the mesh samples an empty texture and renders pure black,
// while the desktop browser (more GPU/CPU memory) is fine. So for each material
// we: (a) keep it cheap + non-metallic, (b) re-tag the map as sRGB, and (c) when
// the map did not decode, drop it and fall back to a solid colour so the mesh
// stays visible instead of collapsing into a black silhouette.
const FALLBACK_COLOR = "#9ca3af";

const prepMaterial = (mat: THREE.Material, tint?: string) => {
  const m = mat.clone() as THREE.MeshStandardMaterial;
  if ("metalness" in m) m.metalness = 0;
  if ("roughness" in m) m.roughness = 0.85;

  const map = m.map;
  const decoded = !!(map && (map.image as any)?.width);
  if (map) {
    map.colorSpace = THREE.SRGBColorSpace;
    map.needsUpdate = true;
  }

  if (tint) {
    // Body (skin tone) + the untextured fallback model: always recolour. If the
    // map failed, drop it so the tint shows instead of multiplying by black.
    if (map && !decoded) m.map = null;
    if ("color" in m) m.color = new THREE.Color(tint);
  } else if (map && !decoded) {
    // Clothing / hair / eyes have no tint of their own — if their texture failed
    // to upload, show a neutral colour rather than a black blob.
    m.map = null;
    if ("color" in m) m.color = new THREE.Color(FALLBACK_COLOR);
  }

  m.needsUpdate = true;
  return m;
};

const styleMesh = (child: any, tint?: string) => {
  child.material = Array.isArray(child.material)
    ? child.material.map((m: THREE.Material) => prepMaterial(m, tint))
    : prepMaterial(child.material, tint);
};

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
  M_Eye_2_variation_1: "M_Eye_2_variation_3",
  M_Hair4: "M_Hair4_",
};

// -----------------------------
// Avatar Model
// -----------------------------

export const AvatarModel: React.FC<{
  name: string;
  activity: string;
  onClick?: () => void;
  online: boolean;
  isPlayer?: boolean;
  skinColor?: string;
  avatarConfig?: AvatarConfig;
  isMoving?: boolean;
  hideLabel?: boolean;
  emote?: { type: string; id: number } | null;
}> = ({
  name,
  activity,
  onClick,
  online,
  isPlayer,
  skinColor,
  avatarConfig,
  isMoving = false,
  hideLabel = false,
  emote = null,
}) => {
  // Animated avatar models are served from public/characters_animated/. useGLTF
  // caches by URL, so the ~16MB man / ~11MB woman models load once and are
  // shared across every avatar in the 3D world.
  const modelPath = avatarConfig
    ? `${BASE}characters_animated/animated_models/${
        avatarConfig.gender === "male"
          ? "man_animated.glb"
          : "woman_animated_v2.glb"
      }`
    : `${BASE}avatar.glb`;

  const avatarGLTF = useGLTF(modelPath);
  const avatarRef = useRef<THREE.Group>(null);

  const targetColor = avatarConfig
    ? SKIN_TONE_COLORS[avatarConfig.bodyId] || ACCENT_COLOR
    : isPlayer
      ? skinColor || ACCENT_COLOR
      : "#334155";

  // -----------------------------
  // CLONE SCENE (animation-safe)
  // -----------------------------
  const scene = useMemo(() => {
    return SkeletonUtils.clone(avatarGLTF.scene);
  }, [avatarGLTF]);

  // -----------------------------
  // APPLY AVATAR CONFIG (IMPORTANT FIX)
  // -----------------------------
  useEffect(() => {
    if (!scene) return;

    // Generic avatar.glb (no per-user config): the only genuinely metallic,
    // untextured model — give it the target colour so it reads as a character
    // and not a flat blob once forced non-metallic.
    if (!avatarConfig) {
      scene.traverse((child: any) => {
        if (child.isMesh) styleMesh(child, targetColor);
      });
      return;
    }

    const activeIds = Object.values(avatarConfig).filter(
      (v) =>
        typeof v === "string" &&
        v !== avatarConfig.gender &&
        v !== avatarConfig.bodyId,
    );

    const bodyNodeName =
      avatarConfig.gender === "male" ? "ManBody" : "WomanBody";

    // Track which avatar IDs actually matched a GLB mesh node, so we can warn
    // (dev only) about IDs that render nothing — i.e. a mismatch between an
    // AVATAR_ITEMS id and the node names the modeller used in the .glb. This is
    // the "node-name vs avatar-ID consistency check" (X02): file loading is
    // fine, but a renamed/missing node silently hides the item.
    const matchedIds = new Set<string>();
    let bodyMatched = false;

    // Resolve every active id to the exact (sanitised) GLB node name it should
    // light up, then match by equality. Substring matching (the old `includes`)
    // made a base id like "M_Eye_1" also light up "M_Eye_1_variation_1/2",
    // stacking three overlapping eye meshes; equality + the alias table fixes
    // both that and the M_Eye_2/M_Hair4 name mismatches.
    const nodeToId = new Map<string, string>();
    for (const id of activeIds) nodeToId.set(AVATAR_NODE_ALIASES[id] ?? id, id);

    scene.traverse((child: any) => {
      if (!child.isMesh) return;

      // default hidden first (critical fix)
      child.visible = false;

      if (child.name.includes(bodyNodeName)) {
        child.visible = true;
        bodyMatched = true;
        styleMesh(child, targetColor);
        return;
      }

      const id = nodeToId.get(child.name);
      if (id) {
        child.visible = true;
        matchedIds.add(id);
        styleMesh(child);
      }
    });

    if (import.meta.env.DEV) {
      const orphanIds = activeIds.filter((id) => !matchedIds.has(id));
      if (!bodyMatched)
        console.warn(
          `[avatar] body node "${bodyNodeName}" not found in GLB — body will not render`,
        );
      if (orphanIds.length)
        console.warn(
          `[avatar] avatar IDs with no matching GLB mesh node (item won't render):`,
          orphanIds,
        );
    }
  }, [scene, avatarConfig, targetColor]);

  // -----------------------------
  // ANIMATIONS
  // -----------------------------
  const { actions } = useAnimations(avatarGLTF.animations, avatarRef);

  useEffect(() => {
    if (!actions) return;

    const action = Object.values(actions)[0];
    if (!action) return;

    action.enabled = true;
    action.setLoop(THREE.LoopRepeat, Infinity);

    if (isMoving) {
      action.reset();
      action.paused = false;
      action.timeScale = 1;
      action.fadeIn(0.2).play();
    } else {
      action.fadeOut(0.3).play();
    }

    return () => {
      action.stop();
    };
  }, [actions, isMoving]);

  return (
    <group
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
    >
      <primitive ref={avatarRef} object={scene} />

      {!hideLabel && (
        <Html position={[0, 1.9, 0]} center distanceFactor={10}>
          <div className="flex flex-col gap-0.5 items-center pointer-events-none select-none">
            <div className="flex items-center gap-1 px-1 py-0.5 bg-white/95 dark:bg-black/90 backdrop-blur-md rounded-full shadow-lg border border-gray-100 dark:border-gray-800">
              <div
                className={`w-2 h-2 rounded-full ${online === true ? "bg-green-500" : "bg-gray-300"}`}
              />
              <span className="text-[8px] font-bold text-black dark:text-white whitespace-nowrap">
                {name}
              </span>
            </div>

            <div className="px-1 py-px bg-accent/10 rounded-full border border-accent/20">
              <span className="block text-[6px] font-bold uppercase leading-none tracking-wider text-accent">
                {activity}
              </span>
            </div>
          </div>
        </Html>
      )}

      {emote && (
        <Html
          key={emote.id}
          position={[0, 2.3, 0]}
          center
          distanceFactor={10}
          zIndexRange={[100, 0]}
        >
          <div className="emote-burst pointer-events-none select-none text-2xl drop-shadow-lg">
            {emojiForEmote(emote.type)}
          </div>
        </Html>
      )}
    </group>
  );
};

// -----------------------------
// Moving Avatar (NPCs)
// -----------------------------

export const MovingAvatar: React.FC<{
  user: User;
  // Live RTDB transform reader (keyed by username). When present, the avatar
  // follows the real remote position/rotation/activity/emote; the random wander
  // below is only a fallback for when no live transform exists (e.g. RTDB off).
  getWorldEntry?: (username: string) => WorldEntry | undefined;
  // Status badge shown while there is NO live /world entry: "Offline" for an
  // offline mutual, or their persisted activity when online-but-not-in-world.
  // A live entry overrides this per-frame with the RTDB activity.
  fallbackActivity?: string;
  onClick?: () => void;
}> = ({ user, getWorldEntry, fallbackActivity, onClick }) => {
  const groupRef = useRef<THREE.Group>(null);
  const initialEntry = getWorldEntry?.(user.username);
  const initialPos = (initialEntry?.position ?? user.position ?? [0, 0, 0]) as [
    number,
    number,
    number,
  ];
  const targetPos = useRef(new THREE.Vector3(...initialPos));
  const waitTimer = useRef(0);

  // Snapshot interpolation buffer (entity interpolation). Each distinct pose we
  // see from the live store is recorded with a monotonic receive time, and the
  // render loop interpolates between the two snapshots bracketing `clock -
  // INTERP_DELAY`. `clock` accumulates useFrame's delta (no performance.now /
  // Date.now dependency, and guaranteed monotonic across web + native).
  const buffer = useRef<
    { t: number; x: number; y: number; z: number; rotY: number }[]
  >([]);
  const clock = useRef(0);

  const [isMoving, setIsMoving] = useState(false);
  const lastMoving = useRef(false);
  const fallback = fallbackActivity ?? user.activity;
  const [activity, setActivity] = useState<string>(
    initialEntry?.activity ?? fallback,
  );
  const lastActivity = useRef(activity);
  // Live = currently has a /world entry (online and in a world view). Drives the
  // green/grey presence dot and which status source wins (live RTDB vs fallback).
  const [isLive, setIsLive] = useState<boolean>(!!initialEntry);
  const lastLive = useRef(isLive);
  const [emote, setEmote] = useState<{ type: string; id: number } | null>(null);
  const lastEmoteId = useRef(0);
  const emoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (emoteTimer.current) clearTimeout(emoteTimer.current);
    },
    [],
  );

  const setMoving = (m: boolean) => {
    if (m !== lastMoving.current) {
      lastMoving.current = m;
      setIsMoving(m);
    }
  };

  const getNewTarget = () =>
    new THREE.Vector3(
      (Math.random() - 0.5) * WORLD_RADIUS * 0.8,
      0,
      (Math.random() - 0.5) * WORLD_RADIUS * 0.8,
    );

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    clock.current += delta;
    const entry = getWorldEntry?.(user.username);
    const currentPos = groupRef.current.position;

    // Track live-ness so the presence dot and status flip when a peer joins or
    // drops out of /world (e.g. closes the app while we watch them).
    const live = !!entry;
    if (live !== lastLive.current) {
      lastLive.current = live;
      setIsLive(live);
    }

    // Emote: fire a one-shot burst when the id changes (auto-clears after ~2s).
    if (entry?.emote && entry.emote.id !== lastEmoteId.current) {
      lastEmoteId.current = entry.emote.id;
      setEmote({ type: entry.emote.type, id: entry.emote.id });
      if (emoteTimer.current) clearTimeout(emoteTimer.current);
      emoteTimer.current = setTimeout(() => setEmote(null), 2000);
    }

    if (entry) {
      // LIVE: snapshot interpolation. Record each new pose, then render a fixed
      // delay in the past, lerping between the two snapshots that bracket it.
      if (entry.activity !== lastActivity.current) {
        lastActivity.current = entry.activity;
        setActivity(entry.activity);
      }

      const buf = buffer.current;
      const last = buf[buf.length - 1];
      // The store keeps yielding the same entry while a peer is idle (RTDB's
      // onValue fires for the whole /world subtree), so only push genuinely new
      // poses — otherwise the buffer fills with duplicates and idle never holds.
      if (
        !last ||
        last.x !== entry.position[0] ||
        last.y !== entry.position[1] ||
        last.z !== entry.position[2] ||
        last.rotY !== entry.rotY
      ) {
        buf.push({
          t: clock.current,
          x: entry.position[0],
          y: entry.position[1],
          z: entry.position[2],
          rotY: entry.rotY,
        });
        if (buf.length > 16) buf.shift();
      }

      const renderTime = clock.current - INTERP_DELAY;
      // Pick the snapshot pair [older, newer] straddling renderTime. Falls back
      // to clamping at either end: before the oldest sample, or holding the
      // newest once a peer stops writing (idle) — we never extrapolate.
      let older = buf[0];
      let newer = buf[buf.length - 1];
      for (let i = 0; i < buf.length - 1; i++) {
        if (buf[i].t <= renderTime && buf[i + 1].t >= renderTime) {
          older = buf[i];
          newer = buf[i + 1];
          break;
        }
      }
      const span = newer.t - older.t;
      const alpha =
        span > 0 ? Math.min(Math.max((renderTime - older.t) / span, 0), 1) : 1;

      const prevX = currentPos.x;
      const prevZ = currentPos.z;
      currentPos.set(
        older.x + (newer.x - older.x) * alpha,
        older.y + (newer.y - older.y) * alpha,
        older.z + (newer.z - older.z) * alpha,
      );
      // Rotation: shortest-arc lerp so it never spins the long way round.
      const dRot = Math.atan2(
        Math.sin(newer.rotY - older.rotY),
        Math.cos(newer.rotY - older.rotY),
      );
      groupRef.current.rotation.y = older.rotY + dRot * alpha;

      // Moving = actually advancing this frame (idle holds, so displacement ~0).
      const step = Math.hypot(currentPos.x - prevX, currentPos.z - prevZ);
      setMoving(step > 0.001);
      return;
    }

    // FALLBACK (no live transform): legacy random wander. Show the fallback
    // status (Offline / persisted activity) instead of a stale live label.
    if (fallback !== lastActivity.current) {
      lastActivity.current = fallback;
      setActivity(fallback);
    }
    if (waitTimer.current > 0) {
      waitTimer.current -= delta;
      setMoving(false);
      return;
    }
    const distance = currentPos.distanceTo(targetPos.current);
    if (distance < 0.2) {
      waitTimer.current = 2 + Math.random() * 5;
      targetPos.current = getNewTarget();
      setMoving(false);
    } else {
      setMoving(true);
      const moveDir = targetPos.current.clone().sub(currentPos).normalize();
      currentPos.add(moveDir.multiplyScalar(1.5 * delta));
      const targetRotation = Math.atan2(moveDir.x, moveDir.z);
      groupRef.current.rotation.y = THREE.MathUtils.lerp(
        groupRef.current.rotation.y,
        targetRotation,
        0.05,
      );
    }
  });

  return (
    <group ref={groupRef} position={initialPos}>
      <AvatarModel
        name={user.displayName}
        activity={activity}
        online={isLive}
        onClick={onClick}
        avatarConfig={user.avatarConfig}
        isMoving={isMoving}
        emote={emote}
      />
    </group>
  );
};

// -----------------------------
// Player Controller
// -----------------------------

export const Player: React.FC<{
  moveDir: THREE.Vector3;
  skinColor?: string;
  avatarConfig?: AvatarConfig;
  firebaseUid?: string | null;
  emote?: { type: string; id: number } | null;
}> = ({ moveDir, skinColor, avatarConfig, firebaseUid, emote = null }) => {
  const meshRef = useRef<THREE.Group>(null);
  const keys = useRef<Record<string, boolean>>({});
  const zoom = useRef(1);
  const pinchDist = useRef<number | null>(null);
  const yaw = useRef(0);
  const dragLast = useRef<number | null>(null);
  const gl = useThree((s) => s.gl);
  const [isMoving, setIsMoving] = useState(false);
  // Dedup setIsMoving so it only fires on an actual change, not every frame.
  const lastIsMoving = useRef(false);
  // Tracks the moving→idle transition so we write one final "settle" transform
  // after stopping (the trailing throttle in worldService then lands it).
  const wasMoving = useRef(false);

  const MIN_ZOOM = 0.5;
  const MAX_ZOOM = 2.5;
  const ORBIT_SPEED = 0.005;

  useEffect(() => {
    const handleDown = (e: KeyboardEvent) => {
      keys.current[e.code] = true;
    };
    const handleUp = (e: KeyboardEvent) => {
      keys.current[e.code] = false;
    };

    const clampZoom = (v: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v));

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoom.current = clampZoom(zoom.current + e.deltaY * 0.001);
    };

    const touchDistance = (t: TouchList) => {
      const dx = t[0].clientX - t[1].clientX;
      const dy = t[0].clientY - t[1].clientY;
      return Math.hypot(dx, dy);
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) pinchDist.current = touchDistance(e.touches);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchDist.current != null) {
        e.preventDefault();
        const dist = touchDistance(e.touches);
        const ratio = pinchDist.current / dist;
        zoom.current = clampZoom(zoom.current * ratio);
        pinchDist.current = dist;
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinchDist.current = null;
    };

    window.addEventListener("keydown", handleDown);
    window.addEventListener("keyup", handleUp);
    window.addEventListener("wheel", handleWheel, { passive: false });
    window.addEventListener("touchstart", handleTouchStart, { passive: false });
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd);

    return () => {
      window.removeEventListener("keydown", handleDown);
      window.removeEventListener("keyup", handleUp);
      window.removeEventListener("wheel", handleWheel);
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, []);

  // Orbit the camera around the player by dragging a single finger / the
  // mouse across the viewport. Listeners live on the canvas so touches that
  // start on the on-screen movement buttons don't rotate the camera.
  useEffect(() => {
    const canvas = gl.domElement;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) dragLast.current = e.touches[0].clientX;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        dragLast.current = null;
        return;
      }
      const x = e.touches[0].clientX;
      if (dragLast.current == null) {
        dragLast.current = x;
        return;
      }
      e.preventDefault();
      yaw.current -= (x - dragLast.current) * ORBIT_SPEED;
      dragLast.current = x;
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length === 0) dragLast.current = null;
    };

    const handleMouseDown = (e: MouseEvent) => {
      dragLast.current = e.clientX;
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (dragLast.current == null) return;
      yaw.current -= (e.clientX - dragLast.current) * ORBIT_SPEED;
      dragLast.current = e.clientX;
    };

    const handleMouseUp = () => {
      dragLast.current = null;
    };

    canvas.addEventListener("touchstart", handleTouchStart, { passive: false });
    canvas.addEventListener("touchmove", handleTouchMove, { passive: false });
    canvas.addEventListener("touchend", handleTouchEnd);
    canvas.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      canvas.removeEventListener("touchstart", handleTouchStart);
      canvas.removeEventListener("touchmove", handleTouchMove);
      canvas.removeEventListener("touchend", handleTouchEnd);
      canvas.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [gl]);

  useFrame((state, delta) => {
    if (!meshRef.current) return;

    const { camera } = state;
    const speed = 6 * delta;
    const direction = new THREE.Vector3();

    if (keys.current["KeyW"] || keys.current["ArrowUp"]) direction.z -= 1;
    if (keys.current["KeyS"] || keys.current["ArrowDown"]) direction.z += 1;
    if (keys.current["KeyA"] || keys.current["ArrowLeft"]) direction.x -= 1;
    if (keys.current["KeyD"] || keys.current["ArrowRight"]) direction.x += 1;

    if (moveDir.length() > 0) direction.add(moveDir);

    const moving = direction.length() > 0;
    if (moving !== lastIsMoving.current) {
      lastIsMoving.current = moving;
      setIsMoving(moving);
    }

    if (moving) {
      // Analog joystick gives a 0..1 magnitude; keyboard gives 1 (or √2 on a
      // diagonal). Clamp so the stick scales walk speed while keys stay full.
      const mag = Math.min(direction.length(), 1);
      // Make input camera-relative: rotate it by the orbit yaw so "forward" on
      // the stick always moves away from the camera, whatever angle it sits at.
      direction
        .normalize()
        .applyAxisAngle(UP, yaw.current)
        .multiplyScalar(speed * mag);
      meshRef.current.position.add(direction);
      meshRef.current.rotation.y = Math.atan2(direction.x, direction.z);
    }

    // Broadcast our transform to RTDB while moving, plus one settle frame after
    // stopping. Throttled inside worldService (≈9 Hz); reads meshRef imperatively
    // so this never triggers a React re-render of the world.
    if (firebaseUid && (moving || wasMoving.current)) {
      const p = meshRef.current.position;
      worldService.writeTransform(
        firebaseUid,
        p.x,
        p.y,
        p.z,
        meshRef.current.rotation.y,
      );
    }
    wasMoving.current = moving;

    const idealOffset = new THREE.Vector3(0, 3.2, 5)
      .multiplyScalar(zoom.current)
      .applyAxisAngle(UP, yaw.current)
      .add(meshRef.current.position);
    camera.position.lerp(idealOffset, 0.1);
    camera.lookAt(
      meshRef.current.position.x,
      meshRef.current.position.y + 1,
      meshRef.current.position.z,
    );
  });

  return (
    <group ref={meshRef}>
      <AvatarModel
        name="You"
        activity="Exploring"
        online={true}
        isPlayer={true}
        skinColor={skinColor}
        avatarConfig={avatarConfig}
        isMoving={isMoving}
        emote={emote}
      />
    </group>
  );
};

export default {
  AvatarModel,
  MovingAvatar,
  Player,
};
