# IyanjuPay Native Biometric Setup

IyanjuPay uses the native device biometric APIs in the Capacitor Android/iOS app. Browser builds continue to use the existing WebAuthn/passkey path where supported.

## Capacitor dependency

The project uses `@capgo/capacitor-native-biometric` for Capacitor 7-compatible native biometric prompts. Run:

```bash
bun install
bunx cap sync
```

The app requests **strong biometrics only** for App Lock; a device PIN/pattern/password is not treated as a biometric unlock.

## Android

The native build must include:

```xml
<uses-permission android:name="android.permission.USE_BIOMETRIC" />
```

The build workflow adds this permission automatically after generating the Capacitor Android project.

## iOS

The native app must include:

```xml
<key>NSFaceIDUsageDescription</key>
<string>Use Face ID to securely unlock IyanjuPay.</string>
```

The iOS workflow adds this usage description automatically.

## App Lock behavior

- Enabling Biometrics checks that a strong native biometric is actually enrolled.
- Enabling App Lock requires Biometrics to be enabled.
- Native App Lock unlock calls the native biometric API directly.
- Browser App Lock uses the existing Supabase WebAuthn/passkey flow.
- Disabling Biometrics automatically disables App Lock.
- No biometric fingerprint/face data is sent to Supabase.
