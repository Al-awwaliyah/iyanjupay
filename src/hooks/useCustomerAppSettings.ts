import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

type CustomerSettings = Record<string, unknown>;

function bool(settings: CustomerSettings, key: string, fallback: boolean) {
  const value = settings[key];
  if (typeof value === "boolean") return value;
  if (value && typeof value === "object" && "value" in (value as any)) return Boolean((value as any).value);
  return fallback;
}

function stringValue(settings: CustomerSettings, key: string, fallback: string) {
  const value = settings[key];
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "value" in (value as any)) return String((value as any).value ?? fallback);
  return fallback;
}

export function useCustomerAppSettings() {
  const [settings, setSettings] = useState<CustomerSettings>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { data, error } = await db.rpc("get_customer_app_settings");
      if (error) throw error;
      setSettings((data && typeof data === "object") ? data : {});
    } catch (error) {
      console.warn("Customer app settings unavailable:", error);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel("customer-app-settings-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "customer_app_settings" },
        () => void load(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load]);

  return {
    settings,
    loading,
    maintenanceMode: bool(settings, "maintenanceMode", false),
    showMaintenanceBanner: bool(settings, "showMaintenanceBanner", false),
    maintenanceReason: stringValue(settings, "maintenanceReason", "IyanjuPay is temporarily undergoing maintenance."),
    allowTransfers: bool(settings, "allowTransfers", true),
    allowWalletFunding: bool(settings, "allowWalletFunding", true),
    allowBillPayments: bool(settings, "allowBillPayments", true),
    allowVirtualAccounts: bool(settings, "allowVirtualAccounts", true),
    customerEmailNotifications: bool(settings, "customerEmailNotifications", true),
    enableFeatureFlags: bool(settings, "enableFeatureFlags", true),
    allowNewRegistrations: bool(settings, "allowNewRegistrations", true),
    customerPushNotifications: bool(settings, "customerPushNotifications", true),
  };
}
