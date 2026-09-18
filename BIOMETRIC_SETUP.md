# IyanjuPay Biometric Authentication

IyanjuPay now uses native device biometric authentication for App Lock. The application does not use Supabase Passkeys or passkey sign-in.

## Mobile builds

The project uses Capacitor 7. Add the native biometric plugin dependency:

`@capgo/capacitor-native-biometric` (Capacitor 7 compatible line).

For Android, the native app must include:

```xml
<uses-permission android:name="android.permission.USE_BIOMETRIC" />
```

For iOS Face ID, the native app's `Info.plist` must include:

```xml
<key>NSFaceIDUsageDescription</key>
<string>Use Face ID to securely unlock IyanjuPay.</string>
```

After adding/updating the native platform projects, synchronize the Capacitor plugins.

## Browser / Vercel deployment

A browser build does not expose real device biometric APIs to IyanjuPay without WebAuthn/passkeys. Because IyanjuPay is intentionally not using passkeys, the biometric toggle is disabled in a browser-only deployment. The real biometric flow is available in the native iOS/Android Capacitor application.

## Security behavior

- Biometric ON: a real native biometric check is required before App Lock can be enabled.
- Biometric OFF: App Lock is automatically disabled so the app cannot become locked behind a disabled unlock method.
- App Lock ON: the existing timeout controls when the session becomes locked.
- Push Notifications remain independent from biometric/App Lock.
