import { useApp } from '@/state/AppContext'
import { CustomizationView } from '@/views/CustomizationView'

// First-run appearance onboarding. A signed-in user whose profile has no
// avatarConfig yet (fresh signup, first login, or a legacy account that never
// set one) would otherwise render the generic default model (the red avatar.glb
// in HomeView). This gate covers the app with the character-setup flow until
// they pick a look, then disappears the moment avatarConfig is set.
//
// State-driven (not a one-time navigation) so it is self-healing: it survives an
// app kill mid-setup and re-appears on the next launch until a config is saved.
// Mirrors the WelcomePopup gating pattern, but sits in front of it — see
// WelcomePopup's `avatarConfig` guard, which holds the tutorial popup back until
// the character is created.
export const OnboardingGate = () => {
  const { user, userDataLoaded, avatarConfig } = useApp()

  const shouldShow = userDataLoaded && !!user?.username && !avatarConfig
  if (!shouldShow) return null

  return <CustomizationView onboarding />
}
