import UIKit
import Capacitor
import FirebaseCore

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    /// Full-screen blur added over the app while it's inactive, so the snapshot
    /// iOS takes for the app switcher (and any other backgrounded preview) does
    /// not leak on-screen content. Removed once the app is active again.
    private var privacyBlurView: UIVisualEffectView?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        FirebaseApp.configure()

        // iOS gives no API to *block* screenshots, but it does post this
        // notification right after the user takes one. We forward it to the web
        // layer so the app can react (warn the user, log, etc.).
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleUserDidTakeScreenshot),
            name: UIApplication.userDidTakeScreenshotNotification,
            object: nil
        )

        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // The app is leaving the active state (app switcher, incoming call,
        // Control Center, going to background). Cover the screen with a blur
        // before iOS snapshots it for the switcher.
        addPrivacyBlur()
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // App is interactive again — reveal the content.
        removePrivacyBlur()
    }

    // MARK: - Privacy blur (app switcher)

    private func addPrivacyBlur() {
        guard privacyBlurView == nil, let window = window else { return }
        let blur = UIVisualEffectView(effect: UIBlurEffect(style: .systemMaterial))
        blur.frame = window.bounds
        blur.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        window.addSubview(blur)
        privacyBlurView = blur
    }

    private func removePrivacyBlur() {
        privacyBlurView?.removeFromSuperview()
        privacyBlurView = nil
    }

    // MARK: - Screenshot detection

    @objc private func handleUserDidTakeScreenshot() {
        // Bridge to JS via a plain DOM event; the web app listens for
        // `ios-screenshot` on `window` (see src/lib/privacyScreen.ts).
        guard let vc = window?.rootViewController as? CAPBridgeViewController,
              let webView = vc.bridge?.webView else { return }
        webView.evaluateJavaScript(
            "window.dispatchEvent(new Event('ios-screenshot'))",
            completionHandler: nil
        )
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
