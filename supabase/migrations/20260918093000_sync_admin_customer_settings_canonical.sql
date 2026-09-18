-- Keep customer-facing settings synchronized with the Admin Settings page.
-- Supports both the legacy camelCase keys and the snake_case keys generated
-- when admin_settings_upsert creates a setting for the first time.

create or replace function public.canonical_customer_setting_key(p_key text)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_key
    when 'maintenanceMode' then 'maintenanceMode'
    when 'maintenance_mode' then 'maintenanceMode'
    when 'maintenanceReason' then 'maintenanceReason'
    when 'maintenance_reason' then 'maintenanceReason'
    when 'allowNewRegistrations' then 'allowNewRegistrations'
    when 'allow_new_registrations' then 'allowNewRegistrations'
    when 'allowTransfers' then 'allowTransfers'
    when 'allow_transfers' then 'allowTransfers'
    when 'allowWalletFunding' then 'allowWalletFunding'
    when 'allow_wallet_funding' then 'allowWalletFunding'
    when 'allowBillPayments' then 'allowBillPayments'
    when 'allow_bill_payments' then 'allowBillPayments'
    when 'allowVirtualAccounts' then 'allowVirtualAccounts'
    when 'allow_virtual_accounts' then 'allowVirtualAccounts'
    when 'customerEmailNotifications' then 'customerEmailNotifications'
    when 'customer_email_notifications' then 'customerEmailNotifications'
    when 'customerPushNotifications' then 'customerPushNotifications'
    when 'customer_push_notifications' then 'customerPushNotifications'
    when 'showMaintenanceBanner' then 'showMaintenanceBanner'
    when 'show_maintenance_banner' then 'showMaintenanceBanner'
    when 'enableFeatureFlags' then 'enableFeatureFlags'
    when 'enable_feature_flags' then 'enableFeatureFlags'
    else null
  end;
$$;

create or replace function public.sync_customer_app_setting_from_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  canonical_key text;
  source_key text := coalesce(new.setting_key, old.setting_key);
begin
  canonical_key := public.canonical_customer_setting_key(source_key);

  if canonical_key is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    delete from public.customer_app_settings
    where setting_key = canonical_key;
    return old;
  end if;

  insert into public.customer_app_settings(setting_key, value, updated_at)
  values (canonical_key, new.value, now())
  on conflict (setting_key) do update
    set value = excluded.value, updated_at = now();

  return new;
end;
$$;

drop trigger if exists trg_sync_customer_app_setting on public.admin_settings;
create trigger trg_sync_customer_app_setting
after insert or update or delete on public.admin_settings
for each row execute function public.sync_customer_app_setting_from_admin();

-- Rebuild the safe customer projection from every supported key spelling.
delete from public.customer_app_settings;

insert into public.customer_app_settings(setting_key, value, updated_at)
select distinct on (public.canonical_customer_setting_key(setting_key))
  public.canonical_customer_setting_key(setting_key),
  value,
  coalesce(updated_at, now())
from public.admin_settings
where public.canonical_customer_setting_key(setting_key) is not null
order by public.canonical_customer_setting_key(setting_key), updated_at desc nulls last;

-- Ensure realtime is available for instant dashboard updates.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'customer_app_settings'
     ) then
    execute 'alter publication supabase_realtime add table public.customer_app_settings';
  end if;
exception when others then
  null;
end $$;
