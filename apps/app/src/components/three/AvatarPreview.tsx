import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import {
  OrbitControls,
  PerspectiveCamera,
  Environment,
} from "@react-three/drei";
import { Capacitor } from "@capacitor/core";
import { BASE } from "@/config/config";
import { AvatarConfig } from "@/types";
import { AvatarModel } from "@/components/three/threeComponents";
import { ModelErrorBoundary } from "@/components/three/ModelErrorBoundary";

// A self-contained 3D portrait of the player's avatar for the customiser. It
// reuses the same AvatarModel (and therefore the same GLB + live config →
// mesh-visibility wiring) as the world in Home, so picking a skin tone / face /
// hair / outfit updates the model in place. Unlike the world it has no
// movement, joystick or name badge, and the camera orbits the character on
// drag/pinch instead of following it.
export const AvatarPreview = ({
  avatarConfig,
}: {
  avatarConfig: AvatarConfig | null;
}) => {
  return (
    <Canvas shadows className="!absolute inset-0">
      <ModelErrorBoundary>
        <Suspense fallback={null}>
          {/* Offset on +X so the default view is a 3/4 hero angle (front +
              the character's side) rather than a flat straight-on shot. */}
          <PerspectiveCamera makeDefault position={[-2, 2, 2.5]} fov={45} />
          {/* Same direct-light rig as Home: ambient + hemisphere + directional
              fully shade the non-metallic, textured avatar materials without any
              environment map (the HDR below is a web-only nicety). */}
          <ambientLight intensity={0.7} />
          <hemisphereLight args={["#ffffff", "#d9d9d9", 0.8]} />
          <directionalLight position={[5, 10, 7]} intensity={1.4} />
          <pointLight position={[10, 10, 10]} intensity={1.0} />
          {/* The model's front points +Z, so it already faces the camera here;
              the camera's +X offset above gives the angled 3/4 view. */}
          <AvatarModel
            name="You"
            activity="Exploring"
            online
            isPlayer
            hideLabel
            avatarConfig={avatarConfig ?? undefined}
          />
          <OrbitControls
            target={[0, 1.05, 0]}
            enablePan={false}
            minDistance={2.5}
            maxDistance={7}
            minPolarAngle={Math.PI / 2.6}
            maxPolarAngle={Math.PI / 1.9}
          />
        </Suspense>
      </ModelErrorBoundary>
      {!Capacitor.isNativePlatform() && (
        <Suspense fallback={null}>
          <Environment files={`${BASE}hdr/city.hdr`} />
        </Suspense>
      )}
    </Canvas>
  );
};

export default AvatarPreview;
