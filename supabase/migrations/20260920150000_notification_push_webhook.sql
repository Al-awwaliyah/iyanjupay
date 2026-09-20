-- IyanjuPay: automatically fan every notification INSERT out to push delivery.
-- The request is asynchronous, so provider outages do not roll back transactions.
--
-- Before applying this migration, create a Supabase Vault secret named
-- PUSH_WEBHOOK_SECRET whose value exactly matches the Edge Function secret
-- PUSH_WEBHOOK_SECRET. The trigger reads it at execution time and never stores
-- the secret in source control.

create or replace function public.enqueue_iyanjupay_notification_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  webhook_secret text;
begin
  select decrypted_secret
    into webhook_secret
  from vault.decrypted_secrets
  where name = 'PUSH_WEBHOOK_SECRET'
  limit 1;

  perform supabase_functions.http_request(
    'https://eekfcjpoyfcuzvvsgwaw.supabase.co/functions/v1/send-push-notification',
    'POST',
    jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-webhook-secret', coalesce(webhook_secret, '')
    ),
    jsonb_build_object(
      'type', 'INSERT',
      'table', 'notifications',
      'schema', 'public',
      'record', to_jsonb(NEW),
      'old_record', null
    ),
    5000
  );

  return NEW;
end;
$$;

drop trigger if exists trg_iyanjupay_notification_push on public.notifications;

create trigger trg_iyanjupay_notification_push
after insert on public.notifications
for each row
execute function public.enqueue_iyanjupay_notification_push();

revoke all on function public.enqueue_iyanjupay_notification_push() from public, anon, authenticated;
