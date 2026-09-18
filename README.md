# IyanjuPay

IyanjuPay is a digital wallet and financial services application.

## Technology

- React
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui
- Supabase
- Flutterwave

## Development

Install dependencies:

```bash
npm install

## Security, notifications and appearance enhancements

This build adds the following without replacing the existing financial transaction flows:

- realtime customer notification center using the existing `notifications` table and RLS;
- customer-facing admin announcements using the existing broadcast notification flow;
- a sanitized realtime `customer_app_settings` projection derived from authoritative `admin_settings`;
- app lock with configurable timeout and passkey/biometric unlock;
- Supabase Passkey registration, management and login;
- Web Push subscription registration and background notification handling;
- Capacitor native push token registration for Android/iOS;
- Light, Blue and Dark appearance through the existing global theme provider;
- a Security & Notifications page under **Me**.

See `PUSH_NOTIFICATIONS_SETUP.md` before deploying push notifications or enabling Passkeys in production.
