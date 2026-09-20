# IyanjuPay Push Notifications — Production Setup

This project now uses one notification pipeline:

`transaction / announcement -> public.notifications INSERT -> Supabase Database Webhook -> send-push-notification Edge Function -> Web Push + FCM Android + APNs iOS`

The notification row remains the source of truth. Push delivery failure does not fail the financial transaction.

## 1. Frontend

Set these Vercel/build variables:

```text
VITE_SUPABASE_PROJECT_ID=eekfcjpoyfcuzvvsgwaw
VITE_SUPABASE_URL=https://eekfcjpoyfcuzvvsgwaw.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=...
VITE_VAPID_PUBLIC_KEY=...
```

Never put VAPID private keys, Firebase service-account JSON, APNs private keys, service-role keys, or webhook secrets in Vite variables.

## 2. Supabase Edge Function secrets

Set these as Supabase Edge Function secrets:

```text
PUSH_WEBHOOK_SECRET=...
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:admin@iyanjupay.com
FIREBASE_SERVICE_ACCOUNT_JSON={raw Firebase service-account JSON}
```

For iOS/APNs, additionally set:

```text
APNS_KEY_ID=...
APNS_TEAM_ID=...
APNS_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----...
APNS_BUNDLE_ID=com.iyanjupay.app
APNS_PRODUCTION=true
```

Supabase automatically supplies the function with `SUPABASE_URL` and the server key needed by the function.

## 3. Supabase Vault

Create a Vault secret named exactly:

```text
PUSH_WEBHOOK_SECRET
```

Its value must exactly match the Edge Function secret with the same name.

The SQL trigger reads the Vault value at execution time; the secret is not committed to source control.

## 4. Apply the database migration

Deploy the migrations, including:

```text
supabase/migrations/20260920150000_notification_push_webhook.sql
```

That migration creates an asynchronous `notifications` INSERT webhook trigger pointing to:

```text
https://eekfcjpoyfcuzvvsgwaw.supabase.co/functions/v1/send-push-notification
```

Do **not** create a second Dashboard webhook for the same `notifications` INSERT event, otherwise users can receive duplicate push notifications.

## 5. Deploy the Edge Function

```bash
supabase functions deploy send-push-notification --project-ref eekfcjpoyfcuzvvsgwaw
```

The repository already contains:

```toml
[functions.send-push-notification]
verify_jwt = false
```

The endpoint is protected by `PUSH_WEBHOOK_SECRET` or a valid server authorization header.

## 6. Android Firebase

The Android package ID is:

```text
com.iyanjupay.app
```

`google-services.json` must belong to the Firebase Android app with exactly that package name.

GitHub Actions expects:

```text
GOOGLE_SERVICES_JSON_BASE64
```

It also expects the existing Android signing secrets:

```text
ANDROID_KEYSTORE_BASE64
ANDROID_KEYSTORE_PASSWORD
ANDROID_KEY_ALIAS
ANDROID_KEY_PASSWORD
```

The Android workflow configures Google Services, Firebase Messaging, notification permissions, the IyanjuPay notification channel, and a signed release APK.

## 7. Web Push

The PWA requests notification permission only when the user enables push. Existing enabled subscriptions are restored after application startup and authentication.

The service worker handles:

- background push while the PWA is open in another tab
- push while the PWA is backgrounded
- push while the PWA is closed
- notification click navigation back into IyanjuPay

## 8. Native Android behavior

The native app uses Capacitor Push Notifications for FCM registration.

When the app is foregrounded, a local notification is scheduled so the user still receives a visible alert.

When the app is backgrounded or completely closed, FCM's notification payload is displayed by Android through the system notification tray.

The Android notification channel is:

```text
iyanjupay-default
```

## 9. Transactions and announcements

Transaction functions and the admin announcement RPC create records in `public.notifications`.

No individual transaction function needs to call Firebase directly.

The database webhook sees every inserted notification and the Edge Function fans it out to every active subscription belonging to that user.

This also covers admin broadcasts/announcements because they create notification rows.

## 10. Delivery tracking

The Edge Function updates the notification record with:

- `delivery_status`
- `delivery_attempts`
- `last_attempt_at`
- `delivered_at`
- `failed_at`
- `last_error`

Stale Web Push endpoints and invalid native device tokens are removed automatically.

## 11. Verify Android registration

After signing in and enabling notifications, run:

```sql
select
  platform,
  user_id,
  length(device_token) as token_length,
  last_seen_at
from public.user_push_subscriptions
where platform = 'android'
order by last_seen_at desc;
```

A current Android device should have a non-empty `device_token`.

## 12. Verify PWA registration

```sql
select
  user_id,
  platform,
  endpoint,
  last_seen_at
from public.user_push_subscriptions
where platform = 'web'
order by last_seen_at desc;
```

## 13. End-to-end test

Test all of these separately:

1. Send a test notification while the Android app is open.
2. Background the Android app and send another.
3. Fully close the Android app and send another.
4. Open the PWA and enable notifications.
5. Close the PWA tab/window and send another.
6. Perform a real test transaction that creates a notification.
7. Create an admin announcement.
8. Tap each notification and confirm it opens the relevant notification screen.
9. Confirm the same notification is present in the in-app Notification Center.
10. Confirm there is only one push per active device/subscription.

## 14. Important security rule

Never expose these values in the browser, frontend source, GitHub repository, or APK:

- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `VAPID_PRIVATE_KEY`
- `APNS_PRIVATE_KEY`
- `PUSH_WEBHOOK_SECRET`
- Supabase service-role/secret keys
