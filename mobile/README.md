# NeuroReader mobile wrappers

NeuroReader's web core is static and local-first. A native wrapper should ship the same `formula.min.js`, `features.js`, `adaptive.js`, fonts, and pages without adding an account or telemetry SDK.

## iOS with WKWebView

1. Create an iOS App project in Xcode with a local `WKWebView`.
2. Add the repository's web assets to the app target and load `index.html` from the bundle.
3. Set `javaScriptEnabled = true`, `domStorageEnabled = true`, and `allowsBackForwardNavigationGestures = true`.
4. Keep `WKWebsiteDataStore.nonPersistent()` if the wrapper should discard data on close; otherwise use the default store so local adaptive settings persist.
5. Do not grant camera, microphone, clipboard, or network permissions unless the corresponding opt-in feature is explicitly shipped and described to the user.
6. Test VoiceOver, Dynamic Type, keyboard navigation, safe-area insets, offline launch, and the 44px touch target requirement.

## Android with WebView

1. Create an Android Studio project and add the web assets to `app/src/main/assets/neuroreader/`.
2. Enable JavaScript and DOM storage on the WebView, then load `file:///android_asset/neuroreader/index.html`.
3. Use a `WebViewClient` that keeps navigation inside the wrapper and blocks unexpected third-party requests.
4. Preserve localStorage and the service worker only if the app's privacy screen clearly explains local persistence.
5. Test TalkBack, large font settings, back navigation, offline launch, screen rotation, and 44dp touch targets.

## Store readiness

Provide a privacy-policy URL, accessibility statement, screenshots of the paste/transform screen and dashboard, an offline test result, and a clear statement that the free reading core has no account or paywall. Native wrappers must not add ads over reading text or upload pasted content.
