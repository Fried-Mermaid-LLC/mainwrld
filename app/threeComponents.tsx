import React, { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Html, useGLTF } from '@react-three/drei';
import { BASE } from './config';
import { ACCENT_COLOR, WORLD_RADIUS } from './constants';
import { AvatarConfig, AvatarItem, AvatarCategory, AvatarGender, User } from './types';

// JEVON - PASSING AVATAR CONFIG TO AVATAR MODEL TO RENDER CUSTOMIZATION OPTIONS

export const AvatarModel: React.FC<{
    name: string;
    activity: string;
    onClick?: () => void;
    online: boolean;
    isPlayer?: boolean;
    skinColor?: string;
    avatarConfig?: AvatarConfig | null; // 👈 ADD THIS
}> = ({ name, activity, onClick, online, isPlayer, skinColor, avatarConfig }) => {

    const { scene } = useGLTF(`${BASE}avatar.glb`);
    const targetColor = isPlayer ? (skinColor || ACCENT_COLOR) : '#334155';

    const clonedScene = useMemo(() => {
        const group = new THREE.Group();
        scene.traverse((child: any) => {
            if (child.isMesh) {
                const newGeometry = child.geometry.clone();
                const newMaterial = new THREE.MeshStandardMaterial({
                    color: targetColor,
                    roughness: 0.6,
                    metalness: 0.1,
                });
                const newMesh = new THREE.Mesh(newGeometry, newMaterial);
                newMesh.position.copy(child.position);
                newMesh.rotation.copy(child.rotation);
                newMesh.scale.copy(child.scale);
                group.add(newMesh);
            }
        });
        return group;
    }, [scene, targetColor]);

    useEffect(() => {
        console.log("AvatarConfig:", avatarConfig);
    }, [avatarConfig]);

    return (
        <group onClick={(e) => { e.stopPropagation(); onClick?.(); }}>
            <primitive object={clonedScene} scale={1} position={[0, 0, 0]} />
            <Html position={[0, 2.4, 0]} center distanceFactor={10}>
                <div className="flex flex-col items-center pointer-events-none select-none">
                    <div className="flex items-center gap-1.5 px-3 py-1 bg-white/95 dark:bg-black/90 backdrop-blur-md rounded-full shadow-lg border border-gray-100 dark:border-gray-800">
                        <div className={`w-2 h-2 rounded-full ${online ? 'bg-green-500' : 'bg-gray-300'}`} />
                        <span className="text-[10px] font-bold text-black dark:text-white whitespace-nowrap">{name}</span>
                    </div>
                    <div className="mt-1 px-2 py-0.5 bg-accent/10 rounded-md border border-accent/20"><span className="text-[8px] font-bold uppercase tracking-widest text-accent">{activity}</span></div>
                </div>
            </Html>
        </group>
    );
};

export const MovingAvatar: React.FC<{ user: User; onClick?: () => void }> = ({ user, onClick }) => {
    const groupRef = useRef<THREE.Group>(null);
    const targetPos = useRef(new THREE.Vector3(...user.position));
    const waitTimer = useRef(0);

    const getNewTarget = () => new THREE.Vector3(
        (Math.random() - 0.5) * WORLD_RADIUS * 0.8,
        0,
        (Math.random() - 0.5) * WORLD_RADIUS * 0.8,
    );

    useFrame((state, delta) => {
        if (!groupRef.current) return;
        if (waitTimer.current > 0) {
            waitTimer.current -= delta;
            return;
        }

        const currentPos = groupRef.current.position;
        const distance = currentPos.distanceTo(targetPos.current);

        if (distance < 0.2) {
            waitTimer.current = 2 + Math.random() * 5;
            targetPos.current = getNewTarget();
        } else {
            const moveDir = targetPos.current.clone().sub(currentPos).normalize();
            currentPos.add(moveDir.clone().multiplyScalar(1.5 * delta));
            const targetRotation = Math.atan2(moveDir.x, moveDir.z);
            groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, targetRotation, 0.05);
        }
    });

    return (
        <group ref={groupRef} position={user.position}>
            <AvatarModel
                name={user.displayName}
                activity={user.activity}
                online={user.isOnline}
                onClick={onClick}
            />
        </group>
    );
};

export const Player: React.FC<{ moveDir: THREE.Vector3; skinColor?: string }> = ({ moveDir, skinColor }) => {
    const meshRef = useRef<THREE.Group>(null);
    const keys = useRef<Record<string, boolean>>({});

    useEffect(() => {
        const handleDown = (e: KeyboardEvent) => { keys.current[e.code] = true; };
        const handleUp = (e: KeyboardEvent) => { keys.current[e.code] = false; };
        window.addEventListener('keydown', handleDown);
        window.addEventListener('keyup', handleUp);
        return () => {
            window.removeEventListener('keydown', handleDown);
            window.removeEventListener('keyup', handleUp);
        };
    }, []);

    useFrame((state, delta) => {
        if (!meshRef.current) return;
        const { camera } = state;
        const speed = 6 * delta;
        const direction = new THREE.Vector3();

        if (keys.current['KeyW'] || keys.current['ArrowUp']) direction.z -= 1;
        if (keys.current['KeyS'] || keys.current['ArrowDown']) direction.z += 1;
        if (keys.current['KeyA'] || keys.current['ArrowLeft']) direction.x -= 1;
        if (keys.current['KeyD'] || keys.current['ArrowRight']) direction.x += 1;
        if (moveDir.length() > 0) direction.add(moveDir);

        if (direction.length() > 0) {
            direction.normalize().multiplyScalar(speed);
            meshRef.current.position.add(direction);
            meshRef.current.rotation.y = Math.atan2(direction.x, direction.z);
        }

        const idealOffset = new THREE.Vector3(0, 5, 8).add(meshRef.current.position);
        camera.position.lerp(idealOffset, 0.1);
        camera.lookAt(meshRef.current.position.x, meshRef.current.position.y + 1, meshRef.current.position.z);
    });

    return <group ref={meshRef}><AvatarModel name="You" activity="Exploring" online={true} isPlayer={true} skinColor={skinColor} /></group>;
};

export default {
    AvatarModel,
    MovingAvatar,
    Player,
};