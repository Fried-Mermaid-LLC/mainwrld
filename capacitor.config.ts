import type { CapacitorConfig } from "@capacitor/cli";

// Real App Store bundle ID (Team 2C7AJQ5G4C). Drives the Xcode project's
// PRODUCT_BUNDLE_IDENTIFIER, the iOS `applicationId`, and the App Store Connect
// record — and the AASA `appID` (2C7AJQ5G4C.com.mainwrld) for Universal Links.
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
    // Disable the WKWebView's own scrolling so the document doesn't
    // bounce/overscroll like a webpage. html/body already use
    // overflow:hidden + height:100dvh in src/index.css, and individual
    // views opt into scrolling via their own overflow-y: auto containers,
    // so this only kills the page-level drag, not in-view scroll.
    scrollEnabled: false,
  },
  plugins: {
    SplashScreen: {
      // Don't let the native splash auto-hide on a timer. If it does,
      // Capacitor logs the "automatically hidden after default timeout"
      // warning and we lose control of the hand-off to the React splash.
      // Instead main.tsx calls SplashScreen.hide() once React has painted,
      // so the native splash stays up until the web app is actually ready.
      launchAutoHide: false,
      backgroundColor: "#ffffff",
    },
  },
};

export default config;
