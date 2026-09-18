-- IyanjuPay additive security/notification enhancements.
-- Safe to apply after the existing schema. No existing financial tables are modified.

create table if not exists public.customer_app_settings (
  setting_key text primary key,
  value jsonb not null default 'null'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.customer_app_settings enable row level security;

grant select on public.customer_app_settings to authenticated;

create policy "Authenticated users can view customer app settings"
on public.customer_app_settings
for select to authenticated
using (true);

create or replace function public.sync_customer_app_setting_from_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed boolean;
begin
  allowed := coalesce(new.setting_key, old.setting_key) in (
    'maintenanceMode',
    'maintenanceReason',
    'allowNewRegistrations',
    'allowTransfers',
    'allowWalletFunding',
    'allowBillPayments',
    'allowVirtualAccounts',
    'customerEmailNotifications',
    'customerPushNotifications',
    'showMaintenanceBanner',
    'enableFeatureFlags'
  );

  if not allowed then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    delete from public.customer_app_settings
    where setting_key = old.setting_key;
    return old;
  end if;

  insert into public.customer_app_settings(setting_key, value, updated_at)
  values (new.setting_key, new.value, now())
  on conflict (setting_key) do update
    set value = excluded.value,
        updated_at = now();

  return new;
end;
$$;

 drop trigger if exists trg_sync_customer_app_setting on public.admin_settings;
 create trigger trg_sync_customer_app_setting
 after insert or update or delete on public.admin_settings
 for each row execute function public.sync_customer_app_setting_from_admin();

insert into public.customer_app_settings(setting_key, value, updated_at)
select setting_key, value, coalesce(updated_at, now())
from public.admin_settings
where setting_key in (
  'maintenanceMode',
  'maintenanceReason',
  'allowNewRegistrations',
  'allowTransfers',
  'allowWalletFunding',
  'allowBillPayments',
  'allowVirtualAccounts',
  'customerEmailNotifications',
  'customerPushNotifications',
  'showMaintenanceBanner',
  'enableFeatureFlags'
)
on conflict (setting_key) do update
set value = excluded.value,
    updated_at = excluded.updated_at;

create or replace function public.get_customer_app_settings()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_object_agg(setting_key, value),
    '{}'::jsonb
  )
  from public.customer_app_settings;
$$;

grant execute on function public.get_customer_app_settings() to authenticated;

create table if not exists public.user_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('web', 'android', 'ios')),
  endpoint text,
  p256dh text,
  auth text,
  device_token text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint user_push_subscriptions_endpoint_or_token check (
    endpoint is not null or device_token is not null
  )
);

create unique index if not exists user_push_subscriptions_web_endpoint_idx
on public.user_push_subscriptions(endpoint);

create unique index if not exists user_push_subscriptions_native_token_idx
on public.user_push_subscriptions(device_token);

create index if not exists user_push_subscriptions_user_id_idx
on public.user_push_subscriptions(user_id);

alter table public.user_push_subscriptions enable row level security;

grant select, insert, update, delete on public.user_push_subscriptions to authenticated;

create policy "Users can view own push subscriptions"
on public.user_push_subscriptions
for select to authenticated
using (user_id = auth.uid());

create policy "Users can create own push subscriptions"
on public.user_push_subscriptions
for insert to authenticated
with check (user_id = auth.uid());

create policy "Users can update own push subscriptions"
on public.user_push_subscriptions
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Users can delete own push subscriptions"
on public.user_push_subscriptions
for delete to authenticated
using (user_id = auth.uid());

create or replace function public.touch_user_push_subscription()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.last_seen_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_user_push_subscription on public.user_push_subscriptions;
create trigger trg_touch_user_push_subscription
before update on public.user_push_subscriptions
for each row execute function public.touch_user_push_subscription();

-- Add realtime publication entries only when they are not already present.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'customer_app_settings'
  ) then
    execute 'alter publication supabase_realtime add table public.customer_app_settings';
  end if;
end $$;
