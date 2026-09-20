# IyanjuPay Push Notifications Setup

IyanjuPay supports three delivery paths:

- Web Push for supported browsers/PWA.
- Firebase Cloud Messaging (FCM) for Android native apps.
- Apple Push Notification service (APNs) for iOS native apps.

The same `user_push_subscriptions` table stores all device subscriptions.

## 1. Web Push

Generate VAPID keys:

```bash
npx web-push generate-vapid-keys
```

Set these Supabase Edge Function secrets:

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`
- `PUSH_WEBHOOK_SECRET`

Set the browser build variable:

```env
VITE_VAPID_PUBLIC_KEY=your_public_key
```

Never expose `VAPID_PRIVATE_KEY`, `PUSH_WEBHOOK_SECRET`, or a Supabase service-role key in Vite environment variables.

## 2. Android native push (FCM)

Create a Firebase project/app for the package:

`com.iyanjupay.app`

Download `google-services.json` and provide it to the Android build as the GitHub Actions secret:

`FCM_GOOGLE_SERVICES_JSON_B64`

The workflow decodes that secret into `android/app/google-services.json`, enables the Google Services Gradle plugin, and Capacitor Push Notifications registers the FCM device token.

For server-side delivery, create a Firebase service account with permission to send FCM messages. Base64-encode its JSON and store it as:

`FCM_SERVICE_ACCOUNT_JSON`

The `send-push-notification` Edge Function uses FCM HTTP v1 and removes stale/unregistered device tokens.

## 3. iOS native push (APNs)

In Apple Developer, create an APNs authentication key for the Apple Developer Team that owns `com.iyanjupay.app`.

Configure these Supabase Edge Function secrets:

- `APNS_KEY_ID`
- `APNS_TEAM_ID`
- `APNS_PRIVATE_KEY` (the `.p8` contents)
- `APNS_BUNDLE_ID` = `com.iyanjupay.app`
- `APNS_PRODUCTION` = `true` for App Store/TestFlight production-style builds

The iOS project must have the Push Notifications capability and a provisioning profile that permits it. The workflow creates the `aps-environment` entitlement; the Apple signing configuration must include the capability.

The `send-push-notification` Edge Function sends APNs alert notifications and removes unregistered/bad device tokens.

## 4. Supabase database and webhook

Apply:

`supabase/migrations/20260918070000_iyanjupay_security_notifications.sql`

Deploy:

```bash
supabase functions deploy send-push-notification
```

Configure a Supabase Database Webhook for `public.notifications` INSERT events pointing to:

`/functions/v1/send-push-notification`

Send at least:

```json
{
  "notification_id": "<inserted-notification-id>"
}
```

and include:

`x-push-webhook-secret: <PUSH_WEBHOOK_SECRET>`

The same function now routes delivery by subscription platform: Web Push, FCM, or APNs.

## 5. Native app behavior

When the user enables Push Notifications in **Security & Notifications**:

1. Android/iOS permission is requested.
2. Android creates the `iyanjupay-default` notification channel.
3. The native device token is registered.
4. The token is stored in `user_push_subscriptions` against the signed-in user.
5. Tapping a push notification opens its supplied `url` when one is present.

## 6. Verification checklist

### Android

- Install a release/debug build on a physical Android device.
- Grant notification permission.
- Enable Push Notifications in IyanjuPay.
- Verify an `android` subscription with a `device_token` exists.
- Create a test notification.
- Confirm delivery with the app in foreground, background, and closed.
- Tap the notification and verify the target URL opens.

### iOS

- Install on a real iPhone/iPad; APNs is not equivalent to a simulator test.
- Grant notification permission.
- Enable Push Notifications.
- Verify an `ios` subscription with a `device_token` exists.
- Test foreground, background, and closed-app delivery.

### Web

- Grant browser notification permission.
- Enable Push Notifications.
- Verify a `web` subscription exists.
- Test with the PWA/browser tab closed.

## Security

Push tokens are device identifiers and are stored per authenticated user. The server-side FCM/APNs credentials must never be shipped in the frontend bundle.
