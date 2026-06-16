import type { CapacitorConfig } from "@capacitor/cli";

// PLACEHOLDER bundle ID. Must be replaced with the real ID assigned in
// App Store Connect before TestFlight upload. The choice affects the
// generated Xcode project's PRODUCT_BUNDLE_IDENTIFIER, the iOS
// `applicationId`, and the App Store Connect record. Renaming after
// `npx cap add ios` requires re-initialising the iOS project, so this
// must be confirmed with the client before Stage 8.
const config: CapacitorConfig = {
  appId: "com.mainwrld",
  appName: "MainWrld",
  // Vite outputs to dist/. Capacitor copies from this folder into
  // ios/App/App/public/ on `npx cap sync`.
  webDir: "dist",
  ios: {
    // Lets web content extend under the notch / Dynamic Island; the
    // app uses CSS `env(safe-area-inset-*)` and `100dvh` to lay out
    // around it (added in Stage 5).
    contentInset: "never",
    // White matches the existing splash logo and bg-white default.
    backgroundColor: "#ffffff",
  },
};

export default config;
