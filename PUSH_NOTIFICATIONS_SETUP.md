# IyanjuPay push notifications setup

The code includes:

- in-app notifications through the existing `notifications` table;
- Supabase Realtime notification updates;
- Web Push subscription storage;
- a service worker that displays background push notifications;
- a Supabase Edge Function for Web Push delivery;
- Capacitor native push registration for Android/iOS.

## 1. Generate VAPID keys

Use a secure machine/CI environment:

```bash
npx web-push generate-vapid-keys
```

Set these Supabase Edge Function secrets:

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT` (for example `mailto:admin@yourdomain.com`)
- `PUSH_WEBHOOK_SECRET`

Set the browser build variable:

```env
VITE_VAPID_PUBLIC_KEY=your_public_key
```

Never put `VAPID_PRIVATE_KEY`, `PUSH_WEBHOOK_SECRET`, or a Supabase service-role key in a Vite environment variable.

## 2. Apply the migration

Apply:

`supabase/migrations/20260918070000_iyanjupay_security_notifications.sql`

The migration creates a sanitized `customer_app_settings` projection. `admin_settings` remains the authoritative administrative table. Only explicitly customer-safe keys are projected, and the projection is realtime-enabled.

## 3. Deploy the push function

```bash
supabase functions deploy send-push-notification
```

The function intentionally does not require a user JWT because it is designed for a trusted database/webhook invocation. Protect the webhook with `PUSH_WEBHOOK_SECRET`.

## 4. Configure the notification webhook

Configure a Supabase Database Webhook for `public.notifications` INSERT events pointing to:

`/functions/v1/send-push-notification`

Send a JSON body containing at least:

```json
{
  "notification_id": "<inserted-notification-id>"
}
```

and include:

`x-push-webhook-secret: <PUSH_WEBHOOK_SECRET>`

This keeps the existing notification creation flow intact. The webhook only adds push delivery; it does not replace in-app notifications.

## 5. Capacitor native push

Install/sync the native plugin and platform projects:

```bash
npm install
npx cap add android
npx cap add ios
npx cap sync
```

Configure Firebase Cloud Messaging for Android and APNs for iOS according to the Capacitor Push Notifications plugin requirements. Native device tokens are stored in `user_push_subscriptions`.

## 6. Passkeys / biometrics

Supabase Passkeys are currently an experimental/beta feature. Enable Authentication → Passkeys in the Supabase Dashboard and configure a stable WebAuthn relying-party ID/origin for the production domain.

The client opts in with `experimental.passkey: true` and exposes:

- passwordless passkey sign-in;
- passkey registration from Security & Notifications;
- passkey deletion;
- App Lock unlock through passkey authentication.

Use HTTPS in production. Changing the WebAuthn relying-party ID invalidates existing credentials, so choose it carefully.

## 7. Test checklist

1. Sign in normally.
2. Open **Me → Security & Notifications**.
3. Register a passkey.
4. Enable App Lock and use **Lock IyanjuPay now**.
5. Unlock with the device biometric/passkey prompt.
6. Enable web push and grant browser permission.
7. Create an admin broadcast; it should appear immediately in the user's notification center.
8. Mark a notification read; refresh and verify it stays read.
9. Change a customer-facing admin setting; verify the user dashboard updates without a full page reload.
10. Test notification delivery with the app closed after configuring the database webhook and VAPID secrets.
