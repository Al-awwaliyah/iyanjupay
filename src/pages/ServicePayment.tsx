import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ArrowLeft,
  Check,
  ChevronRight,
  CircleAlert,
  Flame,
  Loader2,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Tv,
  WalletCards,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

/* ============================================================
   TYPES
   ============================================================ */

interface ServicePaymentProps {
  service: {
    title: string;
    type: string;
  } | null;

  walletBalance: number;

  onBack: () => void;

  onPurchase: (
    amount: number,
    details: Record<string, any>
  ) => Promise<void>;
}

interface Biller {
  id?: number | string;

  name?: string;
  short_name?: string;
  display_name?: string;
  displayName?: string;

  biller_code?: string;
  billerCode?: string;

  network_code?: string;
  networkCode?: string;

  category?: string;
  country?: string;
  country_code?: string;

  logo?: string | null;
  logo_url?: string | null;
  logoUrl?: string | null;

  description?: string;

  [key: string]: any;
}

interface BillItem {
  id?: number | string;

  item_code?: string;
  itemCode?: string;

  product_code?: string;
  productCode?: string;

  variation_code?: string;
  variationCode?: string;

  biller_code?: string;
  billerCode?: string;

  network_code?: string;
  networkCode?: string;

  name?: string;
  short_name?: string;
  display_name?: string;
  displayName?: string;

  amount?: number | string;
  price?: number | string;

  selling_price?: number | string;
  sellingPrice?: number | string;

  provider_price?: number | string;
  providerPrice?: number | string;

  provider_amount?: number | string;
  providerAmount?: number | string;

  minimum?: number | string;
  maximum?: number | string;
  fee?: number | string;

  label_name?: string;
  labelName?: string;

  validity?: string | number;
  duration?: string | number;

  plan_period?: string;
  planPeriod?: string;

  plan_type?: string;
  planType?: string;

  data_plan?: string;
  dataPlan?: string;

  is_hot_deal?: boolean | string | number;
  isHotDeal?: boolean | string | number;

  quantity?: number | string;

  description?: string;

  [key: string]: any;
}

type ServiceType =
  | "airtime"
  | "data"
  | "electricity"
  | "cable"
  | "airtime-card"
  | "data-card"
  | "smile"
  | "waec"
  | "jamb"
  | "internet"
  | "insurance"
  | "savings";

type DataTab =
  | "HOT"
  | "EXTRA NIGHT"
  | "DAILY"
  | "WEEKLY"
  | "MONTHLY";

/* ============================================================
   CONSTANTS
   ============================================================ */

const LIVE_SERVICES: ServiceType[] = [
  "airtime",
  "data",
  "electricity",
  "cable",
  "airtime-card",
  "data-card",
  "smile",
  "waec",
  "jamb",
];

const PREMIUM_SERVICES: ServiceType[] = [
  "airtime-card",
  "data-card",
  "smile",
  "waec",
  "jamb",
];

const SERVICE_CATEGORY_MAP: Record<string, string> = {
  airtime: "AIRTIME",
  data: "MOBILEDATA",
  electricity: "UTILITYBILLS",
  cable: "CABLEBILLS",
  internet: "INTSERVICE",
};

const AIRTIME_AMOUNTS = [
  100,
  200,
  500,
  1000,
  2000,
  5000,
  10000,
];

const BILL_AMOUNTS = [
  500,
  1000,
  2000,
  5000,
  10000,
  20000,
];

const DATA_TABS: DataTab[] = [
  "HOT",
  "EXTRA NIGHT",
  "DAILY",
  "WEEKLY",
  "MONTHLY",
];

const NETWORK_LOGOS: Record<string, string> = {
  mtn:
    "https://upload.wikimedia.org/wikipedia/commons/a/af/MTN_Logo.svg",
  glo:
    "https://upload.wikimedia.org/wikipedia/commons/8/86/GloLogo.png",
  airtel:
    "https://upload.wikimedia.org/wikipedia/commons/f/fb/Bharti_Airtel_Logo.svg",
  "9mobile":
    "https://images.seeklogo.com/logo-png/48/1/9mobile-logo-png_seeklogo-481168.png",
};

const CABLE_LOGOS: Record<string, string> = {
  dstv:
    "https://res.cloudinary.com/paybeta/image/upload/v1714827633/Provider/Cable/dstv.jpg",
  gotv:
    "https://res.cloudinary.com/paybeta/image/upload/v1714828100/Provider/Cable/gotv.png",
  startimes:
    "https://res.cloudinary.com/paybeta/image/upload/v1714827913/Provider/Cable/startimes.jpg",
  showmax:
    "https://commons.wikimedia.org/wiki/Special:Redirect/file/Showmax_Logo.svg",
};

const SERVICE_ICONS: Record<string, React.ReactNode> = {
  airtime: <Zap className="h-5 w-5" />,
  data: <Sparkles className="h-5 w-5" />,
  electricity: <Zap className="h-5 w-5" />,
  cable: <Tv className="h-5 w-5" />,
  "airtime-card": <WalletCards className="h-5 w-5" />,
  "data-card": <WalletCards className="h-5 w-5" />,
  smile: <Sparkles className="h-5 w-5" />,
  waec: <ShieldCheck className="h-5 w-5" />,
  jamb: <ShieldCheck className="h-5 w-5" />,
};

/* ============================================================
   BASIC HELPERS
   ============================================================ */

function cleanString(value: unknown): string {
  return String(value ?? "").trim();
}

function numberValue(value: unknown): number {
  const valueAsNumber = Number(value);

  return Number.isFinite(valueAsNumber)
    ? valueAsNumber
    : 0;
}

function formatNaira(value: number): string {
  return `₦${Number(value || 0).toLocaleString("en-NG")}`;
}

function isTrueFlag(value: unknown): boolean {
  if (value === true) return true;

  if (typeof value === "number") {
    return value === 1;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    return (
      normalized === "true" ||
      normalized === "1" ||
      normalized === "yes"
    );
  }

  return false;
}

function normalizeKey(value: unknown): string {
  return cleanString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function getItemCode(item: BillItem): string {
  return cleanString(
    item.item_code ??
      item.itemCode ??
      item.product_code ??
      item.productCode ??
      item.variation_code ??
      item.variationCode
  );
}

function getBillerCode(biller: Biller): string {
  return cleanString(
    biller.biller_code ??
      biller.billerCode ??
      biller.network_code ??
      biller.networkCode
  );
}

function getProviderName(provider: Biller): string {
  return cleanString(
    provider.short_name ??
      provider.name ??
      provider.display_name ??
      provider.displayName ??
      "Service"
  );
}

function getItemName(item: BillItem): string {
  return cleanString(
    item.name ??
      item.short_name ??
      item.display_name ??
      item.displayName ??
      item.data_plan ??
      item.dataPlan ??
      getItemCode(item) ??
      "Service package"
  );
}

function getSellingPrice(item: BillItem): number {
  return numberValue(
    item.selling_price ??
      item.sellingPrice ??
      item.price ??
      item.amount
  );
}

function getProviderPrice(item: BillItem): number {
  return numberValue(
    item.provider_price ??
      item.providerPrice ??
      item.provider_amount ??
      item.providerAmount ??
      item.amount ??
      item.price
  );
}

function getIsHotDeal(item: BillItem): boolean {
  if (
    isTrueFlag(item.is_hot_deal) ||
    isTrueFlag(item.isHotDeal)
  ) {
    return true;
  }

  const text = [
    item.name,
    item.short_name,
    item.description,
    item.plan_type,
    item.planType,
    item.data_plan,
    item.dataPlan,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    /\bsme\b/.test(text) ||
    /hot\s*deal/.test(text) ||
    /hotdeal/.test(text)
  );
}

function getPlanPeriod(item: BillItem): string {
  return cleanString(
    item.plan_period ??
      item.planPeriod ??
      item.validity ??
      item.duration
  );
}

function getDataGroup(item: BillItem): DataTab {
  if (getIsHotDeal(item)) {
    return "HOT";
  }

  const text = [
    item.plan_period,
    item.planPeriod,
    item.validity,
    item.duration,
    item.plan_type,
    item.planType,
    item.name,
    item.description,
    item.data_plan,
    item.dataPlan,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (
    /extra\s*night/.test(text) ||
    /night/.test(text)
  ) {
    return "EXTRA NIGHT";
  }

  if (
    /monthly/.test(text) ||
    /\b30\s*days?\b/.test(text) ||
    /\b31\s*days?\b/.test(text) ||
    /\b1\s*month\b/.test(text)
  ) {
    return "MONTHLY";
  }

  if (
    /weekly/.test(text) ||
    /\b7\s*days?\b/.test(text) ||
    /\b14\s*days?\b/.test(text) ||
    /\b1\s*week\b/.test(text) ||
    /\b2\s*weeks?\b/.test(text)
  ) {
    return "WEEKLY";
  }

  if (
    /daily/.test(text) ||
    /\b1\s*day\b/.test(text) ||
    /\b2\s*days?\b/.test(text) ||
    /\b3\s*days?\b/.test(text) ||
    /24\s*hours?/.test(text)
  ) {
    return "DAILY";
  }

  return "DAILY";
}

function isVariableItem(item: BillItem): boolean {
  const code = normalizeKey(getItemCode(item));

  const name = cleanString(
    item.name ??
      item.short_name ??
      item.description
  ).toLowerCase();

  return (
    code === "variable" ||
    code === "variableamount" ||
    code === "enteramount" ||
    /variable\s*amount/.test(name) ||
    /enter\s*amount/.test(name) ||
    /any\s*amount/.test(name)
  );
}

/* ============================================================
   PROVIDER NORMALIZATION
   ============================================================ */

/**
 * ClubKonnect's cable catalogue can arrive as an object instead
 * of a normal array. This function converts every supported shape
 * into the exact provider-card structure the UI needs.
 *
 * Example:
 *
 * {
 *   dstv: {...},
 *   gotv: {...},
 *   startimes: {...}
 * }
 *
 * becomes:
 *
 * [
 *   { biller_code: "dstv", name: "DSTV" },
 *   { biller_code: "gotv", name: "GOtv" },
 *   { biller_code: "startimes", name: "Startimes" }
 * ]
 */

function cableProviderNameFromKey(
  key: string
): string {
  const normalized = normalizeKey(key);

  if (
    normalized === "dstv" ||
    normalized.includes("dstv")
  ) {
    return "DSTV";
  }

  if (
    normalized === "gotv" ||
    normalized.includes("gotv")
  ) {
    return "GOtv";
  }

  if (
    normalized === "startimes" ||
    normalized.includes("startime")
  ) {
    return "Startimes";
  }

  if (normalized.includes("showmax")) {
    return "Showmax";
  }

  return cleanString(key);
}

function cableProviderCodeFromKey(
  key: string
): string {
  const normalized = normalizeKey(key);

  if (normalized.includes("dstv")) {
    return "dstv";
  }

  if (normalized.includes("gotv")) {
    return "gotv";
  }

  if (normalized.includes("startime")) {
    return "startimes";
  }

  if (normalized.includes("showmax")) {
    return "showmax";
  }

  return cleanString(key).toLowerCase();
}

function normalizeCableProviders(
  source: unknown
): Biller[] {
  if (!source) {
    return [];
  }

  if (Array.isArray(source)) {
    return source
      .map((entry: any) => {
        if (
          typeof entry === "string"
        ) {
          return {
            biller_code:
              cableProviderCodeFromKey(entry),
            name:
              cableProviderNameFromKey(entry),
          };
        }

        if (
          entry &&
          typeof entry === "object"
        ) {
          const key = cleanString(
            entry.biller_code ??
              entry.billerCode ??
              entry.code ??
              entry.name ??
              entry.short_name
          );

          return {
            ...entry,
            biller_code:
              key ||
              cableProviderCodeFromKey(
                cleanString(entry.name)
              ),
            name:
              cableProviderNameFromKey(
                cleanString(
                  entry.name ??
                    entry.short_name ??
                    entry.biller_code
                )
              ),
          };
        }

        return null;
      })
      .filter(Boolean) as Biller[];
  }

  if (
    typeof source === "object"
  ) {
    return Object.entries(
      source as Record<string, any>
    )
      .map(([key, value]) => {
        if (
          ![
            "dstv",
            "gotv",
            "startimes",
            "startime",
            "showmax",
          ].some((name) =>
            normalizeKey(key).includes(name)
          )
        ) {
          return null;
        }

        const provider =
          value &&
          typeof value === "object" &&
          !Array.isArray(value)
            ? value
            : {};

        return {
          ...provider,
          biller_code:
            cleanString(
              provider.biller_code ??
                provider.billerCode ??
                provider.code
            ) ||
            cableProviderCodeFromKey(key),
          name:
            cableProviderNameFromKey(
              cleanString(
                provider.name ??
                  provider.short_name ??
                  key
              )
            ),
          short_name:
            cableProviderNameFromKey(
              cleanString(
                provider.short_name ??
                  provider.name ??
                  key
              )
            ),
        };
      })
      .filter(Boolean) as Biller[];
  }

  return [];
}

function normalizeProviders(
  source: unknown,
  serviceType: ServiceType
): Biller[] {
  if (serviceType === "cable") {
    return normalizeCableProviders(source);
  }

  if (Array.isArray(source)) {
    return source
      .map((provider: any) => {
        if (
          typeof provider === "string"
        ) {
          return {
            biller_code: provider,
            name: provider,
          };
        }

        if (
          !provider ||
          typeof provider !== "object"
        ) {
          return null;
        }

        const code = cleanString(
          provider.biller_code ??
            provider.billerCode ??
            provider.network_code ??
            provider.networkCode ??
            provider.code ??
            provider.id
        );

        const name = cleanString(
          provider.short_name ??
            provider.name ??
            provider.display_name ??
            provider.displayName ??
            provider.network ??
            provider.network_name
        );

        if (!code || !name) {
          return null;
        }

        return {
          ...provider,
          biller_code: code,
          name,
        };
      })
      .filter(Boolean) as Biller[];
  }

  if (
    source &&
    typeof source === "object"
  ) {
    return Object.entries(
      source as Record<string, any>
    )
      .map(([key, value]) => {
        if (
          value &&
          typeof value === "object" &&
          !Array.isArray(value)
        ) {
          const code = cleanString(
            value.biller_code ??
              value.billerCode ??
              value.network_code ??
              value.networkCode ??
              value.code ??
              key
          );

          const name = cleanString(
            value.short_name ??
              value.name ??
              value.display_name ??
              value.displayName ??
              key
          );

          return {
            ...value,
            biller_code: code,
            name,
          };
        }

        return {
          biller_code: key,
          name: cleanString(value) || key,
        };
      })
      .filter(
        (provider) =>
          Boolean(provider.biller_code) &&
          Boolean(provider.name)
      );
  }

  return [];
}

/* ============================================================
   PROVIDER LOGOS
   ============================================================ */

function getProviderLogo(
  provider: Biller,
  serviceType: ServiceType
): string | null {
  const backendLogo = cleanString(
    provider.logo ??
      provider.logo_url ??
      provider.logoUrl
  );

  if (backendLogo) {
    try {
      const url = new URL(
        backendLogo
      );

      if (
        url.protocol === "https:" ||
        url.protocol === "http:"
      ) {
        return url.toString();
      }
    } catch {
      // Use local mapping below.
    }
  }

  const key = normalizeKey(
    [
      provider.short_name,
      provider.name,
      provider.display_name,
      provider.displayName,
      provider.biller_code,
    ]
      .filter(Boolean)
      .join(" ")
  );

  if (
    serviceType === "cable"
  ) {
    if (key.includes("dstv")) {
      return CABLE_LOGOS.dstv;
    }

    if (key.includes("gotv")) {
      return CABLE_LOGOS.gotv;
    }

    if (
      key.includes("startime")
    ) {
      return CABLE_LOGOS.startimes;
    }

    if (
      key.includes("showmax")
    ) {
      return CABLE_LOGOS.showmax;
    }
  }

  if (key.includes("mtn")) {
    return NETWORK_LOGOS.mtn;
  }

  if (key.includes("glo")) {
    return NETWORK_LOGOS.glo;
  }

  if (key.includes("airtel")) {
    return NETWORK_LOGOS.airtel;
  }

  if (
    key.includes("9mobile") ||
    key.includes("etisalat")
  ) {
    return NETWORK_LOGOS["9mobile"];
  }

  return null;
}

/* ============================================================
   CUSTOMER LABELS
   ============================================================ */

function getCustomerLabel(
  serviceType: ServiceType
): string {
  switch (serviceType) {
    case "airtime":
    case "data":
    case "airtime-card":
    case "data-card":
    case "waec":
    case "jamb":
      return "Phone Number";

    case "electricity":
      return "Meter Number";

    case "cable":
      return "Smart Card Number";

    case "smile":
      return "Smile Account Number";

    case "internet":
      return "Account Number";

    default:
      return "Customer Number";
  }
}

function getCustomerPlaceholder(
  serviceType: ServiceType
): string {
  switch (serviceType) {
    case "airtime":
    case "data":
    case "airtime-card":
    case "data-card":
    case "waec":
    case "jamb":
      return "08012345678";

    case "electricity":
      return "Enter meter number";

    case "cable":
      return "Enter smart card number";

    case "smile":
      return "Enter Smile account number";

    case "internet":
      return "Enter account number";

    default:
      return "Enter customer number";
  }
}

function serviceNeedsQuantity(
  serviceType: ServiceType
): boolean {
  return (
    serviceType === "airtime-card" ||
    serviceType === "data-card"
  );
}

function serviceUsesNetwork(
  serviceType: ServiceType
): boolean {
  return (
    serviceType === "airtime" ||
    serviceType === "data" ||
    serviceType === "airtime-card" ||
    serviceType === "data-card"
  );
}

function serviceNeedsPackage(
  serviceType: ServiceType
): boolean {
  return (
    serviceType === "data" ||
    serviceType === "cable" ||
    serviceType === "airtime-card" ||
    serviceType === "data-card" ||
    serviceType === "smile" ||
    serviceType === "waec" ||
    serviceType === "jamb"
  );
}

function serviceIsAmountBased(
  serviceType: ServiceType
): boolean {
  return (
    serviceType === "airtime" ||
    serviceType === "electricity"
  );
}

/* ============================================================
   PHONE NORMALIZATION
   ============================================================ */

function normalizePhone(
  value: string
): string {
  const cleaned = value
    .replace(/\s+/g, "")
    .trim();

  if (
    /^0\d{10}$/.test(cleaned)
  ) {
    return `+234${cleaned.slice(1)}`;
  }

  if (
    /^\d{10}$/.test(cleaned)
  ) {
    return `+234${cleaned}`;
  }

  if (
    /^234\d{10}$/.test(cleaned)
  ) {
    return `+${cleaned}`;
  }

  return cleaned;
}

/* ============================================================
   PROVIDER CARD
   ============================================================ */

function ProviderCard({
  provider,
  serviceType,
  selected,
  disabled,
  onClick,
}: {
  provider: Biller;
  serviceType: ServiceType;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const name = getProviderName(
    provider
  );

  const logo = getProviderLogo(
    provider,
    serviceType
  );

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`Select ${name}`}
      className={[
        "group relative min-w-0 overflow-hidden rounded-2xl border bg-white p-3 text-left",
        "transition-all duration-200",
        "hover:-translate-y-0.5 hover:shadow-lg",
        selected
          ? "border-[#5B21B6] bg-gradient-to-br from-purple-50 to-blue-50 shadow-md ring-2 ring-[#5B21B6]/10"
          : "border-slate-200 hover:border-[#6D28D9]/40",
        disabled
          ? "cursor-not-allowed opacity-60"
          : "",
      ].join(" ")}
    >
      {selected && (
        <span className="absolute right-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-r from-[#5B21B6] to-[#2563EB] text-white shadow-sm">
          <Check className="h-3 w-3" strokeWidth={3} />
        </span>
      )}

      <div className="mx-auto flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        {logo ? (
          <img
            src={logo}
            alt=""
            aria-hidden="true"
            className="h-9 w-9 object-contain"
            loading="eager"
            referrerPolicy="no-referrer"
            onError={(event) => {
              event.currentTarget.style.display =
                "none";

              const fallback =
                event.currentTarget
                  .nextElementSibling as HTMLElement | null;

              if (fallback) {
                fallback.style.display =
                  "flex";
              }
            }}
          />
        ) : null}

        <span
          className="items-center justify-center rounded-xl bg-gradient-to-br from-purple-100 to-blue-100 text-sm font-black text-[#5B21B6]"
          style={{
            display: logo
              ? "none"
              : "flex",
            width: "100%",
            height: "100%",
          }}
        >
          {name
            .slice(0, 2)
            .toUpperCase()}
        </span>
      </div>

      <p className="mt-2 truncate text-center text-xs font-bold text-slate-800">
        {name}
      </p>

      {selected && (
        <p className="mt-0.5 text-center text-[9px] font-semibold text-[#5B21B6]">
          Selected
        </p>
      )}
    </button>
  );
}

/* ============================================================
   DATA PLAN CARD
   ============================================================ */

function DataPlanCard({
  item,
  selected,
  disabled,
  onClick,
}: {
  item: BillItem;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const hot = getIsHotDeal(
    item
  );

  const price =
    getSellingPrice(item);

  const name =
    getItemName(item);

  const duration =
    getPlanPeriod(item);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "relative overflow-hidden rounded-2xl border bg-white p-4 text-left",
        "transition-all duration-200",
        "hover:-translate-y-0.5 hover:shadow-lg",
        selected
          ? "border-[#5B21B6] bg-gradient-to-br from-purple-50/80 to-blue-50/80 shadow-md ring-2 ring-[#5B21B6]/10"
          : "border-slate-200 hover:border-[#6D28D9]/40",
        disabled
          ? "cursor-not-allowed opacity-60"
          : "",
      ].join(" ")}
    >
      {hot && (
        <div className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-orange-600">
          <Flame className="h-3 w-3" />
          Hot
        </div>
      )}

      <div className="pr-12">
        <p className="line-clamp-2 min-h-[40px] text-sm font-extrabold leading-5 text-slate-900">
          {name}
        </p>

        {duration && (
          <p className="mt-1 truncate text-[11px] font-medium text-slate-500">
            {duration}
          </p>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <span className="text-base font-black text-[#5B21B6]">
          {formatNaira(price)}
        </span>

        <span
          className={[
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border",
            selected
              ? "border-[#5B21B6] bg-gradient-to-r from-[#5B21B6] to-[#2563EB] text-white"
              : "border-slate-200 text-slate-300",
          ].join(" ")}
        >
          {selected && (
            <Check
              className="h-3.5 w-3.5"
              strokeWidth={3}
            />
          )}
        </span>
      </div>
    </button>
  );
}

/* ============================================================
   PACKAGE CARD
   ============================================================ */

function PackageCard({
  item,
  selected,
  disabled,
  onClick,
}: {
  item: BillItem;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const name =
    getItemName(item);

  const price =
    getSellingPrice(item);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "relative flex min-h-[82px] items-center justify-between gap-3 rounded-2xl border bg-white p-4 text-left",
        "transition-all duration-200",
        "hover:-translate-y-0.5 hover:shadow-md",
        selected
          ? "border-[#5B21B6] bg-gradient-to-r from-purple-50 to-blue-50 ring-2 ring-[#5B21B6]/10"
          : "border-slate-200",
        disabled
          ? "cursor-not-allowed opacity-60"
          : "",
      ].join(" ")}
    >
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-bold text-slate-900">
          {name}
        </p>

        {item.description && (
          <p className="mt-1 line-clamp-1 text-[11px] text-slate-500">
            {cleanString(
              item.description
            )}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {price > 0 && (
          <span className="text-sm font-black text-[#5B21B6]">
            {formatNaira(price)}
          </span>
        )}

        <span
          className={[
            "flex h-7 w-7 items-center justify-center rounded-full border",
            selected
              ? "border-[#5B21B6] bg-[#5B21B6] text-white"
              : "border-slate-200 text-slate-300",
          ].join(" ")}
        >
          {selected ? (
            <Check
              className="h-3.5 w-3.5"
              strokeWidth={3}
            />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </span>
      </div>
    </button>
  );
}

/* ============================================================
   COMPONENT
   ============================================================ */

const ServicePayment = ({
  service,
  walletBalance,
  onBack,
  onPurchase,
}: ServicePaymentProps) => {
  const serviceType =
    (service?.type ?? "") as ServiceType;

  const category =
    SERVICE_CATEGORY_MAP[
      serviceType
    ] ?? "";

  const isData =
    serviceType === "data";

  const isAirtime =
    serviceType === "airtime";

  const isElectricity =
    serviceType === "electricity";

  const isCable =
    serviceType === "cable";

  const isAmountBased =
    serviceIsAmountBased(
      serviceType
    );

  const isPremium =
    PREMIUM_SERVICES.includes(
      serviceType
    );

  const needsPackage =
    serviceNeedsPackage(
      serviceType
    );

  const usesNetwork =
    serviceUsesNetwork(
      serviceType
    );

  const customerLabel =
    getCustomerLabel(
      serviceType
    );

  const customerPlaceholder =
    getCustomerPlaceholder(
      serviceType
    );

  const { toast } =
    useToast();

  /* ==========================================================
     FORM STATE
     ========================================================== */

  const [customer, setCustomer] =
    useState("");

  const [amount, setAmount] =
    useState("");

  const [customAmountMode, setCustomAmountMode] =
    useState(false);

  const [quantity, setQuantity] =
    useState(1);

  /* ==========================================================
     CATALOGUE
     ========================================================== */

  const [billers, setBillers] =
    useState<Biller[]>([]);

  const [items, setItems] =
    useState<BillItem[]>([]);

  const [selectedBillerCode, setSelectedBillerCode] =
    useState("");

  const [selectedItemCode, setSelectedItemCode] =
    useState("");

  /* ==========================================================
     LOADING
     ========================================================== */

  const [loadingBillers, setLoadingBillers] =
    useState(false);

  const [loadingItems, setLoadingItems] =
    useState(false);

  const [processingPayment, setProcessingPayment] =
    useState(false);

  const [error, setError] =
    useState("");

  const [dataTab, setDataTab] =
    useState<DataTab>("HOT");

  /* ==========================================================
     PIN
     ========================================================== */

  const [showPinPrompt, setShowPinPrompt] =
    useState(false);

  const [paymentPin, setPaymentPin] =
    useState("");

  const [verifyingPin, setVerifyingPin] =
    useState(false);

  /* ==========================================================
     SELECTED OBJECTS
     ========================================================== */

  const selectedBiller =
    useMemo(
      () =>
        billers.find(
          (biller) =>
            getBillerCode(
              biller
            ) ===
            selectedBillerCode
        ) ?? null,
      [
        billers,
        selectedBillerCode,
      ]
    );

  const selectedItem =
    useMemo(
      () =>
        items.find(
          (item) =>
            getItemCode(
              item
            ) ===
            selectedItemCode
        ) ?? null,
      [
        items,
        selectedItemCode,
      ]
    );

  /* ==========================================================
     DATA GROUPS
     ========================================================== */

  const dataGroups =
    useMemo(() => {
      const groups: Record<
        DataTab,
        BillItem[]
      > = {
        HOT: [],
        "EXTRA NIGHT": [],
        DAILY: [],
        WEEKLY: [],
        MONTHLY: [],
      };

      items.forEach(
        (item) => {
          if (
            !getItemCode(item) ||
            isVariableItem(item)
          ) {
            return;
          }

          const group =
            getDataGroup(item);

          groups[group].push(
            item
          );
        }
      );

      return groups;
    }, [items]);

  const visibleDataPlans =
    dataGroups[dataTab];

  /* ==========================================================
     RESET
     ========================================================== */

  const resetForm =
    useCallback(() => {
      setCustomer("");
      setAmount("");
      setQuantity(1);

      setBillers([]);
      setItems([]);

      setSelectedBillerCode("");
      setSelectedItemCode("");

      setCustomAmountMode(false);

      setLoadingBillers(false);
      setLoadingItems(false);
      setProcessingPayment(false);

      setError("");

      setShowPinPrompt(false);
      setPaymentPin("");
      setVerifyingPin(false);

      setDataTab("HOT");
    }, []);

  useEffect(() => {
    resetForm();
  }, [
    serviceType,
    resetForm,
  ]);

  /* ==========================================================
     LOAD PROVIDERS
     ========================================================== */

  const loadBillers =
    useCallback(
      async () => {
        if (!serviceType) {
          return;
        }

        if (
          !LIVE_SERVICES.includes(
            serviceType
          )
        ) {
          setBillers([]);
          return;
        }

        setLoadingBillers(true);
        setError("");

        setSelectedBillerCode("");
        setSelectedItemCode("");
        setItems("");

        try {
          const {
            data,
            error: functionError,
          } =
            await supabase.functions.invoke(
              "clubkonnect-services",
              {
                body: {
                  action:
                    "catalog",
                  service:
                    serviceType,
                  country:
                    "NG",
                  category,
                },
              }
            );

          if (
            functionError
          ) {
            console.error(
              "ClubKonnect provider error:",
              functionError
            );

            throw new Error(
              "Unable to load service providers."
            );
          }

          if (
            !data ||
            data.success !== true
          ) {
            console.error(
              "ClubKonnect provider response:",
              data
            );

            throw new Error(
              data?.error ??
                data?.message ??
                "Unable to load service providers."
            );
          }

          /**
           * The Edge Function may return:
           *
           * data.billers
           * data.providers
           * data.networks
           * data.data
           *
           * Cable may be an object instead of an array.
           */
          const rawSource =
            data?.billers ??
            data?.providers ??
            data?.networks ??
            data?.data ??
            [];

          const normalized =
            normalizeProviders(
              rawSource,
              serviceType
            );

          setBillers(
            normalized
          );

          if (
            normalized.length === 0
          ) {
            setError(
              "No service providers are currently available."
            );
          }
        } catch (err) {
          console.error(
            "Failed to load service providers:",
            err
          );

          const message =
            "Unable to load service providers.";

          setError(message);

          toast({
            title:
              "Unable to load services",
            description:
              message,
            variant:
              "destructive",
          });
        } finally {
          setLoadingBillers(
            false
          );
        }
      },
      [
        category,
        serviceType,
        toast,
      ]
    );

  useEffect(() => {
    if (
      serviceType &&
      LIVE_SERVICES.includes(
        serviceType
      )
    ) {
      void loadBillers();
    }
  }, [
    serviceType,
    loadBillers,
  ]);

  /* ==========================================================
     LOAD PACKAGES / PLANS
     ========================================================== */

  const loadItems =
    useCallback(
      async (
        billerCode: string
      ) => {
        const code =
          cleanString(
            billerCode
          );

        if (!code) {
          setItems([]);
          return;
        }

        if (
          !needsPackage
        ) {
          setItems([]);
          return;
        }

        setLoadingItems(true);
        setError("");

        setItems([]);
        setSelectedItemCode("");
        setAmount("");
        setCustomAmountMode(
          false
        );

        try {
          const {
            data,
            error: functionError,
          } =
            await supabase.functions.invoke(
              "clubkonnect-services",
              {
                body: {
                  action:
                    "catalog",
                  service:
                    serviceType,
                  country:
                    "NG",

                  ...(usesNetwork
                    ? {
                        network_code:
                          code,
                      }
                    : {
                        biller_code:
                          code,
                      }),

                  ...(serviceType ===
                  "waec"
                    ? {
                        exam_type:
                          "waec",
                      }
                    : {}),

                  ...(serviceType ===
                  "jamb"
                    ? {
                        exam_type:
                          "jamb",
                      }
                    : {}),
                },
              }
            );

          if (
            functionError
          ) {
            console.error(
              "ClubKonnect package error:",
              functionError
            );

            throw new Error(
              "Unable to load available packages."
            );
          }

          if (
            !data ||
            data.success !== true
          ) {
            console.error(
              "ClubKonnect package response:",
              data
            );

            throw new Error(
              data?.error ??
                data?.message ??
                "Unable to load available packages."
            );
          }

          const rawItems =
            Array.isArray(
              data?.items
            )
              ? data.items
              : Array.isArray(
                    data?.plans
                  )
                ? data.plans
                : Array.isArray(
                      data?.packages
                    )
                  ? data.packages
                  : Array.isArray(
                        data?.data
                      )
                    ? data.data
                    : [];

          const normalized =
            rawItems
              .map(
                (
                  item: BillItem
                ) => {
                  const itemCode =
                    getItemCode(
                      item
                    );

                  if (
                    !itemCode
                  ) {
                    return null;
                  }

                  return {
                    ...item,

                    item_code:
                      itemCode,

                    selling_price:
                      getSellingPrice(
                        item
                      ),

                    provider_price:
                      getProviderPrice(
                        item
                      ),

                    is_hot_deal:
                      getIsHotDeal(
                        item
                      ),

                    plan_period:
                      getPlanPeriod(
                        item
                      ),

                    plan_type:
                      cleanString(
                        item.plan_type ??
                          item.planType
                      ) ||
                      (getIsHotDeal(
                        item
                      )
                        ? "SME"
                        : "REGULAR"),
                  };
                }
              )
              .filter(
                Boolean
              ) as BillItem[];

          setItems(
            normalized
          );

          if (
            normalized.length ===
            0
          ) {
            setError(
              "No packages are currently available for this service."
            );
          }
        } catch (err) {
          console.error(
            "Failed to load service packages:",
            err
          );

          const message =
            "Unable to load service packages.";

          setError(message);

          toast({
            title:
              "Unable to load packages",
            description:
              message,
            variant:
              "destructive",
          });
        } finally {
          setLoadingItems(
            false
          );
        }
      },
      [
        needsPackage,
        serviceType,
        toast,
        usesNetwork,
      ]
    );

  /* ==========================================================
     PROVIDER CHANGE
     ========================================================== */

  const handleBillerChange =
    async (
      code: string
    ) => {
      if (
        processingPayment ||
        verifyingPin
      ) {
        return;
      }

      setSelectedBillerCode(
        code
      );

      setSelectedItemCode("");
      setAmount("");
      setCustomAmountMode(
        false
      );
      setError("");

      /**
       * This is intentionally after provider
       * selection. Customer information stays visible
       * only after a provider has been chosen.
       */
      if (
        needsPackage
      ) {
        await loadItems(
          code
        );
      }
    };

  /* ==========================================================
     PLAN SELECTION
     ========================================================== */

  const handlePlanSelect =
    (
      item: BillItem
    ) => {
      if (
        processingPayment ||
        verifyingPin
      ) {
        return;
      }

      const code =
        getItemCode(item);

      const price =
        getSellingPrice(item);

      if (
        !code ||
        price <= 0
      ) {
        toast({
          title:
            "Invalid package",
          description:
            "This package does not have a valid selling price.",
          variant:
            "destructive",
        });

        return;
      }

      setSelectedItemCode(
        code
      );

      setAmount(
        String(price)
      );

      setCustomAmountMode(
        false
      );

      setError("");
    };

  /* ==========================================================
     AMOUNT
     ========================================================== */

  const handleAmountSelect =
    (
      value: number
    ) => {
      if (
        processingPayment ||
        verifyingPin
      ) {
        return;
      }

      setAmount(
        String(value)
      );

      setCustomAmountMode(
        false
      );

      setError("");
    };

  const handleCustomAmount =
    () => {
      if (
        processingPayment ||
        verifyingPin
      ) {
        return;
      }

      setAmount("");
      setCustomAmountMode(
        true
      );
      setError("");
    };

  /* ==========================================================
     QUANTITY
     ========================================================== */

  const changeQuantity =
    (
      delta: number
    ) => {
      if (
        processingPayment ||
        verifyingPin
      ) {
        return;
      }

      const next =
        Math.min(
          100,
          Math.max(
            1,
            quantity + delta
          )
        );

      setQuantity(next);
    };

  /* ==========================================================
     CURRENT AMOUNT
     ========================================================== */

  const amountNumber =
    numberValue(amount);

  const selectedItemPrice =
    selectedItem
      ? getSellingPrice(
          selectedItem
        )
      : 0;

  const itemMinimum =
    numberValue(
      selectedItem?.minimum
    );

  const itemMaximum =
    numberValue(
      selectedItem?.maximum
    );

  const totalAmount =
    serviceUsesQuantity(
      serviceType
    )
      ? amountNumber *
        quantity
      : amountNumber;

  /* ==========================================================
     CUSTOMER NORMALIZATION
     ========================================================== */

  const getFinalCustomer =
    () => {
      const value =
        customer.trim();

      if (
        serviceType ===
          "airtime" ||
        serviceType ===
          "data" ||
        serviceType ===
          "airtime-card" ||
        serviceType ===
          "data-card" ||
        serviceType ===
          "waec" ||
        serviceType ===
          "jamb"
      ) {
        return normalizePhone(
          value
        );
      }

      return value;
    };

  /* ==========================================================
     VALIDATION
     ========================================================== */

  const validateForm =
    (): boolean => {
      if (
        !selectedBillerCode
      ) {
        toast({
          title:
            "Choose a provider",
          description:
            "Please choose a service provider first.",
          variant:
            "destructive",
        });

        return false;
      }

      const finalCustomer =
        getFinalCustomer();

      if (
        !finalCustomer
      ) {
        toast({
          title:
            `${customerLabel} required`,
          description:
            `Please enter the ${customerLabel.toLowerCase()} after choosing the provider.`,
          variant:
            "destructive",
        });

        return false;
      }

      if (
        serviceType ===
          "airtime" ||
        serviceType ===
          "data" ||
        serviceType ===
          "airtime-card" ||
        serviceType ===
          "data-card" ||
        serviceType ===
          "waec" ||
        serviceType ===
          "jamb"
      ) {
        if (
          !/^\+234\d{10}$/.test(
            finalCustomer
          )
        ) {
          toast({
            title:
              "Invalid phone number",
            description:
              "Enter a valid Nigerian phone number.",
            variant:
              "destructive",
          });

          return false;
        }
      }

      if (
        needsPackage &&
        !selectedItemCode
      ) {
        toast({
          title:
            "Choose a package",
          description:
            "Please choose a package before continuing.",
          variant:
            "destructive",
        });

        return false;
      }

      if (
        !Number.isFinite(
          amountNumber
        ) ||
        amountNumber <= 0
      ) {
        toast({
          title:
            "Enter an amount",
          description:
            "Please select or enter a valid amount.",
          variant:
            "destructive",
        });

        return false;
      }

      if (
        isData &&
        selectedItemPrice > 0 &&
        Math.abs(
          amountNumber -
            selectedItemPrice
        ) >
          0.01
      ) {
        toast({
          title:
            "Invalid plan price",
          description:
            `This plan costs ${formatNaira(
              selectedItemPrice
            )}.`,
          variant:
            "destructive",
        });

        return false;
      }

      if (
        itemMinimum > 0 &&
        amountNumber <
          itemMinimum
      ) {
        toast({
          title:
            "Amount too low",
          description:
            `Minimum amount is ${formatNaira(
              itemMinimum
            )}.`,
          variant:
            "destructive",
        });

        return false;
      }

      if (
        itemMaximum > 0 &&
        amountNumber >
          itemMaximum
      ) {
        toast({
          title:
            "Amount too high",
          description:
            `Maximum amount is ${formatNaira(
              itemMaximum
            )}.`,
          variant:
            "destructive",
        });

        return false;
      }

      if (
        totalAmount >
        Number(walletBalance)
      ) {
        toast({
          title:
            "Insufficient wallet balance",
          description:
            "Please fund your wallet to continue.",
          variant:
            "destructive",
        });

        return false;
      }

      return true;
    };

  /* ==========================================================
     PURCHASE DETAILS
     ========================================================== */

  const buildPurchaseDetails =
    () => {
      const finalCustomer =
        getFinalCustomer();

      const details: Record<
        string,
        any
      > = {
        type:
          serviceType,

        service:
          serviceType,

        country:
          "NG",

        customer:
          finalCustomer,

        customerLabel,

        biller:
          selectedBiller,

        selected_provider:
          selectedBiller,

        selectedProvider:
          selectedBiller,

        biller_code:
          selectedBillerCode,

        billerCode:
          selectedBillerCode,

        network_code:
          usesNetwork
            ? selectedBillerCode
            : "",

        networkCode:
          usesNetwork
            ? selectedBillerCode
            : "",

        item:
          selectedItem,

        selected_item:
          selectedItem,

        selectedItem:
          selectedItem,

        item_code:
          selectedItemCode,

        itemCode:
          selectedItemCode,

        product_code:
          cleanString(
            selectedItem?.product_code ??
              selectedItem?.productCode
          ),

        productCode:
          cleanString(
            selectedItem?.product_code ??
              selectedItem?.productCode
          ),

        variation_code:
          cleanString(
            selectedItem?.variation_code ??
              selectedItem?.variationCode
          ),

        variationCode:
          cleanString(
            selectedItem?.variation_code ??
              selectedItem?.variationCode
          ),

        plan_code:
          selectedItemCode,

        planCode:
          selectedItemCode,

        data_plan:
          cleanString(
            selectedItem?.data_plan ??
              selectedItem?.dataPlan ??
              getItemName(
                selectedItem ??
                  {}
              )
          ),

        dataPlan:
          cleanString(
            selectedItem?.data_plan ??
              selectedItem?.dataPlan ??
              getItemName(
                selectedItem ??
                  {}
              )
          ),

        plan_name:
          selectedItem
            ? getItemName(
                selectedItem
              )
            : "",

        planName:
          selectedItem
            ? getItemName(
                selectedItem
              )
            : "",

        plan_period:
          selectedItem
            ? getPlanPeriod(
                selectedItem
              )
            : "",

        plan_type:
          selectedItem
            ? cleanString(
                selectedItem.plan_type ??
                  selectedItem.planType
              )
            : "",

        is_hot_deal:
          selectedItem
            ? getIsHotDeal(
                selectedItem
              )
            : false,

        amount:
          amountNumber,

        selling_amount:
          amountNumber,

        sellingAmount:
          amountNumber,

        price:
          amountNumber,

        provider_price:
          selectedItem
            ? getProviderPrice(
                selectedItem
              )
            : 0,

        providerPrice:
          selectedItem
            ? getProviderPrice(
                selectedItem
              )
            : 0,

        quantity:
          serviceUsesQuantity(
            serviceType
          )
            ? quantity
            : 1,
      };

      if (
        serviceType ===
          "airtime" ||
        serviceType ===
          "data" ||
        serviceType ===
          "airtime-card" ||
        serviceType ===
          "data-card" ||
        serviceType ===
          "waec" ||
        serviceType ===
          "jamb"
      ) {
        details.phone =
          finalCustomer;

        details.phone_no =
          finalCustomer;

        details.phoneNumber =
          finalCustomer;

        details.mobile_number =
          finalCustomer;
      }

      if (
        serviceType ===
        "electricity"
      ) {
        details.meter_number =
          finalCustomer;

        details.meterNumber =
          finalCustomer;

        details.meter_no =
          finalCustomer;

        details.meterNo =
          finalCustomer;

        details.meter_type =
          "prepaid";
      }

      if (
        serviceType ===
        "cable"
      ) {
        details.smartcard_number =
          finalCustomer;

        details.smartcardNumber =
          finalCustomer;

        details.smartcard_no =
          finalCustomer;

        details.smartCardNumber =
          finalCustomer;

        details.cable_tv =
          selectedBillerCode;

        details.cableTV =
          selectedBillerCode;

        details.package =
          selectedItemCode;

        details.package_code =
          selectedItemCode;

        details.packageCode =
          selectedItemCode;
      }

      if (
        serviceType ===
        "smile"
      ) {
        details.account_id =
          finalCustomer;

        details.accountId =
          finalCustomer;

        details.phone_no =
          finalCustomer;

        details.phoneNumber =
          finalCustomer;
      }

      if (
        serviceType ===
          "waec" ||
        serviceType ===
          "jamb"
      ) {
        details.exam_type =
          cleanString(
            selectedItem?.exam_type ??
              selectedItem?.examType ??
              serviceType
          );
      }

      return details;
    };

  /* ==========================================================
     START PURCHASE
     ========================================================== */

  const handlePurchase =
    () => {
      if (
        processingPayment ||
        verifyingPin
      ) {
        return;
      }

      if (
        !validateForm()
      ) {
        return;
      }

      setPaymentPin("");
      setError("");
      setShowPinPrompt(
        true
      );
    };

  /* ==========================================================
     VERIFY PIN + PURCHASE
     ========================================================== */

  const handlePinVerification =
    async () => {
      if (
        processingPayment ||
        verifyingPin
      ) {
        return;
      }

      if (
        !/^\d{4}$/.test(
          paymentPin
        )
      ) {
        toast({
          title:
            "Invalid PIN",
          description:
            "Enter your 4-digit payment PIN.",
          variant:
            "destructive",
        });

        return;
      }

      try {
        setVerifyingPin(
          true
        );

        setError("");

        const {
          data,
          error: pinError,
        } =
          await supabase.rpc(
            "verify_payment_pin",
            {
              _pin:
                paymentPin,
            }
          );

        if (
          pinError
        ) {
          console.error(
            "Payment PIN verification error:",
            pinError
          );

          throw new Error(
            "Unable to verify payment PIN."
          );
        }

        if (
          !data ||
          data.success !== true
        ) {
          setPaymentPin("");

          toast({
            title:
              "Payment PIN",
            description:
              data?.message ??
              "Invalid payment PIN.",
            variant:
              "destructive",
          });

          return;
        }

        const details =
          buildPurchaseDetails();

        setShowPinPrompt(
          false
        );

        setPaymentPin("");

        setProcessingPayment(
          true
        );

        await onPurchase(
          totalAmount,
          details
        );

        resetForm();
      } catch (err) {
        console.error(
          "Service purchase failed:",
          err
        );

        const message =
          "Unable to complete this payment.";

        setError(message);

        toast({
          title:
            "Payment failed",
          description:
            message,
          variant:
            "destructive",
        });
      } finally {
        setVerifyingPin(
          false
        );

        setProcessingPayment(
          false
        );
      }
    };

  /* ==========================================================
     BACK
     ========================================================== */

  const handleBack =
    () => {
      if (
        processingPayment ||
        verifyingPin
      ) {
        return;
      }

      resetForm();
      onBack();
    };

  /* ==========================================================
     SELECTED PROVIDER / PACKAGE DISPLAY
     ========================================================== */

  const providerDisplayName =
    selectedBiller
      ? getProviderName(
          selectedBiller
        )
      : "";

  const serviceIcon =
    SERVICE_ICONS[
      serviceType
    ] ?? (
      <Sparkles className="h-5 w-5" />
    );

  /* ==========================================================
     EMPTY SERVICE
     ========================================================== */

  if (!service) {
    return (
      <div className="min-h-screen bg-[#F7F8FC] px-4">
        <div className="flex min-h-screen items-center justify-center">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-100 to-blue-100 text-[#5B21B6]">
              <CircleAlert className="h-7 w-7" />
            </div>

            <h2 className="mt-5 text-xl font-black text-slate-900">
              No service selected
            </h2>

            <p className="mt-2 text-sm text-slate-500">
              Please return to the dashboard and choose a service.
            </p>

            <Button
              type="button"
              onClick={onBack}
              className="mt-6 h-12 w-full rounded-2xl bg-gradient-to-r from-[#5B21B6] to-[#2563EB] font-bold shadow-lg shadow-purple-200 hover:opacity-95"
            >
              Go Back
            </Button>
          </div>
        </div>
      </div>
    );
  }

  /* ============================================================
     PAGE
     ============================================================ */

  return (
    <div className="min-h-screen bg-[#F7F8FC] pb-10">

      {/* ======================================================
          HEADER
          ====================================================== */}

      <header className="sticky top-0 z-30 border-b border-white/10 bg-gradient-to-r from-[#4C1D95] via-[#6D28D9] to-[#2563EB] text-white shadow-lg">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <div className="flex h-[68px] items-center gap-3">

            <button
              type="button"
              onClick={handleBack}
              disabled={
                processingPayment ||
                verifyingPin
              }
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/10 transition hover:bg-white/20 disabled:opacity-50"
              aria-label="Go back"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>

            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/15">
                {serviceIcon}
              </div>

              <div className="min-w-0">
                <p className="truncate text-base font-black sm:text-lg">
                  {service.title}
                </p>

                <p className="truncate text-[10px] font-medium text-white/70 sm:text-xs">
                  Fast, secure & reliable
                </p>
              </div>
            </div>

            <div className="hidden items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 sm:flex">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span className="text-[10px] font-bold">
                Secure Payment
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* ======================================================
          CONTENT
          ====================================================== */}

      <main className="mx-auto max-w-4xl px-4 pt-5 sm:px-6 sm:pt-7">

        {/* ====================================================
            PIN CONFIRMATION
            ==================================================== */}

        {showPinPrompt ? (
          <div className="mx-auto max-w-xl">

            <div className="mb-4 rounded-3xl bg-gradient-to-r from-[#4C1D95] via-[#6D28D9] to-[#2563EB] p-5 text-white shadow-xl shadow-purple-200 sm:p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
                  <LockKeyhole className="h-6 w-6" />
                </div>

                <div>
                  <p className="text-xs font-semibold text-white/70">
                    Final confirmation
                  </p>

                  <h2 className="text-xl font-black">
                    Confirm Payment
                  </h2>
                </div>
              </div>

              <p className="mt-4 text-sm leading-6 text-white/80">
                Enter your 4-digit Payment PIN to securely authorize this transaction.
              </p>
            </div>

            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">

              <div className="space-y-4 p-5 sm:p-6">

                {/* SUMMARY */}

                <div className="rounded-2xl bg-gradient-to-br from-purple-50 to-blue-50 p-4">

                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs font-semibold text-slate-500">
                      Service
                    </span>

                    <span className="text-sm font-black text-slate-900">
                      {service.title}
                    </span>
                  </div>

                  {providerDisplayName && (
                    <div className="mt-3 flex items-center justify-between gap-4">
                      <span className="text-xs font-semibold text-slate-500">
                        Provider
                      </span>

                      <span className="text-sm font-bold text-[#5B21B6]">
                        {providerDisplayName}
                      </span>
                    </div>
                  )}

                  <div className="mt-3 flex items-center justify-between gap-4 border-t border-purple-100 pt-3">
                    <span className="text-xs font-semibold text-slate-500">
                      {customerLabel}
                    </span>

                    <span className="break-all text-right text-sm font-bold text-slate-900">
                      {getFinalCustomer()}
                    </span>
                  </div>

                  {selectedItem && (
                    <div className="mt-3 flex items-center justify-between gap-4">
                      <span className="text-xs font-semibold text-slate-500">
                        Package
                      </span>

                      <span className="max-w-[60%] text-right text-sm font-bold text-slate-900">
                        {getItemName(
                          selectedItem
                        )}
                      </span>
                    </div>
                  )}

                  {serviceUsesQuantity(
                    serviceType
                  ) && (
                    <div className="mt-3 flex items-center justify-between gap-4">
                      <span className="text-xs font-semibold text-slate-500">
                        Quantity
                      </span>

                      <span className="text-sm font-bold text-slate-900">
                        {quantity}
                      </span>
                    </div>
                  )}

                  <div className="mt-4 flex items-end justify-between gap-4 border-t border-purple-100 pt-4">
                    <span className="text-sm font-bold text-slate-600">
                      Total
                    </span>

                    <span className="text-2xl font-black text-[#5B21B6]">
                      {formatNaira(
                        totalAmount
                      )}
                    </span>
                  </div>
                </div>

                {/* PIN */}

                <div className="space-y-2">
                  <Label
                    htmlFor="servicePaymentPin"
                    className="text-sm font-bold text-slate-800"
                  >
                    Payment PIN
                  </Label>

                  <Input
                    id="servicePaymentPin"
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={4}
                    value={paymentPin}
                    onChange={(
                      event
                    ) => {
                      setPaymentPin(
                        event.target.value
                          .replace(
                            /\D/g,
                            ""
                          )
                          .slice(
                            0,
                            4
                          )
                      );

                      setError("");
                    }}
                    onKeyDown={(
                      event
                    ) => {
                      if (
                        event.key ===
                          "Enter" &&
                        paymentPin.length ===
                          4 &&
                        !verifyingPin
                      ) {
                        void handlePinVerification();
                      }
                    }}
                    placeholder="••••"
                    disabled={
                      verifyingPin
                    }
                    autoFocus
                    className="h-14 rounded-2xl border-slate-200 text-center text-2xl font-black tracking-[0.6em] focus-visible:ring-[#5B21B6]"
                  />

                  <p className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
                    <ShieldCheck className="h-3.5 w-3.5 text-[#5B21B6]" />
                    Your PIN is securely verified before payment.
                  </p>
                </div>

                {error && (
                  <div className="rounded-2xl border border-red-100 bg-red-50 p-3">
                    <p className="text-sm font-medium text-red-700">
                      {error}
                    </p>
                  </div>
                )}

                <Button
                  type="button"
                  onClick={() =>
                    void handlePinVerification()
                  }
                  disabled={
                    verifyingPin ||
                    paymentPin.length !==
                      4
                  }
                  className="h-13 w-full rounded-2xl bg-gradient-to-r from-[#5B21B6] to-[#2563EB] font-black shadow-lg shadow-purple-200 hover:opacity-95"
                >
                  {verifyingPin ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying PIN...
                    </>
                  ) : (
                    <>
                      <LockKeyhole className="mr-2 h-4 w-4" />
                      Confirm Payment
                    </>
                  )}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (
                      verifyingPin ||
                      processingPayment
                    ) {
                      return;
                    }

                    setPaymentPin("");
                    setError("");
                    setShowPinPrompt(
                      false
                    );
                  }}
                  disabled={
                    verifyingPin
                  }
                  className="h-12 w-full rounded-2xl border-slate-200 font-bold"
                >
                  Back to Payment
                </Button>
              </div>
            </div>
          </div>
        ) : (

          /* ==================================================
             NORMAL PAYMENT FLOW
             ================================================== */

          <div className="space-y-5">

            {/* =================================================
                HERO
                ================================================= */}

            <section className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-100">
              <div className="relative overflow-hidden bg-gradient-to-br from-purple-50 via-white to-blue-50 p-5 sm:p-6">

                <div className="relative z-10">
                  <div className="inline-flex items-center gap-2 rounded-full border border-purple-100 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-[#5B21B6] shadow-sm">
                    <Sparkles className="h-3 w-3" />
                    Secure Service
                  </div>

                  <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
                    {service.title}
                  </h2>

                  <p className="mt-1 max-w-xl text-sm leading-6 text-slate-500">
                    Choose your service provider and complete your payment in a few simple steps.
                  </p>
                </div>

                <div className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-purple-200/30 blur-2xl" />
                <div className="pointer-events-none absolute -bottom-16 right-20 h-40 w-40 rounded-full bg-blue-200/30 blur-3xl" />
              </div>
            </section>

            {/* =================================================
                STEP 1 — PROVIDER
                ================================================= */}

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">

              <div className="mb-5 flex items-start justify-between gap-4">

                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-100 to-blue-100 text-sm font-black text-[#5B21B6]">
                    1
                  </div>

                  <div>
                    <h3 className="text-base font-black text-slate-900">
                      {usesNetwork
                        ? "Choose network"
                        : "Choose provider"}
                    </h3>

                    <p className="mt-0.5 text-xs text-slate-500">
                      Select where you want to send your service.
                    </p>
                  </div>
                </div>

                {!loadingBillers && (
                  <button
                    type="button"
                    onClick={() =>
                      void loadBillers()
                    }
                    disabled={
                      processingPayment ||
                      verifyingPin
                    }
                    className="flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-xs font-bold text-[#5B21B6] transition hover:bg-purple-50"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Refresh
                  </button>
                )}
              </div>

              {loadingBillers ? (
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 sm:gap-3">
                  {[
                    1,
                    2,
                    3,
                    4,
                    5,
                  ].map(
                    (index) => (
                      <div
                        key={index}
                        className="h-24 animate-pulse rounded-2xl bg-slate-100"
                      />
                    )
                  )}
                </div>
              ) : billers.length > 0 ? (
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 sm:gap-3 md:grid-cols-6">
                  {billers.map(
                    (
                      biller,
                      index
                    ) => {
                      const code =
                        getBillerCode(
                          biller
                        );

                      if (
                        !code
                      ) {
                        return null;
                      }

                      return (
                        <ProviderCard
                          key={`${code}-${index}`}
                          provider={
                            biller
                          }
                          serviceType={
                            serviceType
                          }
                          selected={
                            selectedBillerCode ===
                            code
                          }
                          disabled={
                            processingPayment ||
                            verifyingPin
                          }
                          onClick={() =>
                            void handleBillerChange(
                              code
                            )
                          }
                        />
                      );
                    }
                  )}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center">
                  <p className="text-sm font-semibold text-slate-500">
                    No providers are currently available.
                  </p>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      void loadBillers()
                    }
                    className="mt-3 rounded-xl"
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Try Again
                  </Button>
                </div>
              )}
            </section>

            {/* =================================================
                EVERYTHING BELOW ONLY APPEARS AFTER PROVIDER
                ================================================= */}

            {selectedBillerCode && (
              <>

                {/* =============================================
                    STEP 2 — CUSTOMER NUMBER
                    ============================================= */}

                <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">

                  <div className="mb-4 flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-100 to-blue-100 text-sm font-black text-[#5B21B6]">
                      2
                    </div>

                    <div>
                      <h3 className="text-base font-black text-slate-900">
                        Enter {customerLabel}
                      </h3>

                      <p className="mt-0.5 text-xs text-slate-500">
                        Enter the account or number you want to use for this service.
                      </p>
                    </div>
                  </div>

                  <div className="relative">
                    <Input
                      id="serviceCustomer"
                      value={
                        customer
                      }
                      onChange={(
                        event
                      ) => {
                        setCustomer(
                          event.target.value
                        );

                        setError("");
                      }}
                      placeholder={
                        customerPlaceholder
                      }
                      disabled={
                        processingPayment ||
                        verifyingPin
                      }
                      inputMode={
                        serviceType ===
                          "airtime" ||
                        serviceType ===
                          "data" ||
                        serviceType ===
                          "airtime-card" ||
                        serviceType ===
                          "data-card" ||
                        serviceType ===
                          "electricity" ||
                        serviceType ===
                          "cable" ||
                        serviceType ===
                          "waec" ||
                        serviceType ===
                          "jamb"
                          ? "numeric"
                          : "text"
                      }
                      className="h-14 rounded-2xl border-slate-200 bg-slate-50/50 pr-4 text-sm font-semibold focus-visible:bg-white focus-visible:ring-[#5B21B6]"
                    />
                  </div>

                  {serviceType ===
                    "cable" && (
                    <div className="mt-3 flex items-start gap-2 rounded-2xl bg-blue-50 p-3">
                      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />

                      <p className="text-[11px] leading-5 text-blue-700">
                        Make sure the smart card number matches the selected TV service.
                      </p>
                    </div>
                  )}
                </section>

                {/* =============================================
                    STEP 3 — DATA PLANS
                    ============================================= */}

                {isData && (
                  <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">

                    <div className="mb-5 flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-100 to-blue-100 text-sm font-black text-[#5B21B6]">
                        3
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <h3 className="text-base font-black text-slate-900">
                              Choose data plan
                            </h3>

                            <p className="mt-0.5 text-xs text-slate-500">
                              Pick the plan that works best for you.
                            </p>
                          </div>

                          {loadingItems && (
                            <Loader2 className="h-5 w-5 animate-spin text-[#5B21B6]" />
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
                      {DATA_TABS.map(
                        (tab) => {
                          const count =
                            dataGroups[
                              tab
                            ].length;

                          return (
                            <button
                              key={tab}
                              type="button"
                              onClick={() =>
                                setDataTab(
                                  tab
                                )
                              }
                              disabled={
                                processingPayment ||
                                verifyingPin
                              }
                              className={[
                                "flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-[10px] font-black transition-all",
                                dataTab ===
                                tab
                                  ? "border-[#5B21B6] bg-gradient-to-r from-[#5B21B6] to-[#2563EB] text-white shadow-md"
                                  : "border-slate-200 bg-white text-slate-600 hover:border-purple-200 hover:bg-purple-50",
                              ].join(
                                " "
                              )}
                            >
                              {tab ===
                                "HOT" && (
                                <Flame className="h-3 w-3" />
                              )}

                              {tab}

                              <span className="opacity-70">
                                {count}
                              </span>
                            </button>
                          );
                        }
                      )}
                    </div>

                    {loadingItems ? (
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {[
                          1,
                          2,
                          3,
                          4,
                          5,
                          6,
                        ].map(
                          (index) => (
                            <div
                              key={
                                index
                              }
                              className="h-28 animate-pulse rounded-2xl bg-slate-100"
                            />
                          )
                        )}
                      </div>
                    ) : visibleDataPlans.length >
                      0 ? (
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {visibleDataPlans.map(
                          (
                            item,
                            index
                          ) => (
                            <DataPlanCard
                              key={`${getItemCode(
                                item
                              )}-${index}`}
                              item={
                                item
                              }
                              selected={
                                selectedItemCode ===
                                getItemCode(
                                  item
                                )
                              }
                              disabled={
                                processingPayment ||
                                verifyingPin
                              }
                              onClick={() =>
                                handlePlanSelect(
                                  item
                                )
                              }
                            />
                          )
                        )}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-slate-200 p-7 text-center">
                        <p className="text-sm font-semibold text-slate-500">
                          No plans are available in this category.
                        </p>
                      </div>
                    )}
                  </section>
                )}

                {/* =============================================
                    STEP 3 — OTHER PACKAGES
                    ============================================= */}

                {!isData &&
                  needsPackage && (
                    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">

                      <div className="mb-5 flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-100 to-blue-100 text-sm font-black text-[#5B21B6]">
                          3
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <h3 className="text-base font-black text-slate-900">
                                Choose package
                              </h3>

                              <p className="mt-0.5 text-xs text-slate-500">
                                Select your preferred package.
                              </p>
                            </div>

                            {loadingItems && (
                              <Loader2 className="h-5 w-5 animate-spin text-[#5B21B6]" />
                            )}
                          </div>
                        </div>
                      </div>

                      {loadingItems ? (
                        <div className="space-y-2">
                          {[
                            1,
                            2,
                            3,
                          ].map(
                            (index) => (
                              <div
                                key={
                                  index
                                }
                                className="h-20 animate-pulse rounded-2xl bg-slate-100"
                              />
                            )
                          )}
                        </div>
                      ) : items.filter(
                          (item) =>
                            !isVariableItem(
                              item
                            )
                        ).length >
                        0 ? (
                        <div className="space-y-2">
                          {items
                            .filter(
                              (
                                item
                              ) =>
                                !isVariableItem(
                                  item
                                )
                            )
                            .map(
                              (
                                item,
                                index
                              ) => (
                                <PackageCard
                                  key={`${getItemCode(
                                    item
                                  )}-${index}`}
                                  item={
                                    item
                                  }
                                  selected={
                                    selectedItemCode ===
                                    getItemCode(
                                      item
                                    )
                                  }
                                  disabled={
                                    processingPayment ||
                                    verifyingPin
                                  }
                                  onClick={() =>
                                    handlePlanSelect(
                                      item
                                    )
                                  }
                                />
                              )
                            )}
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-slate-200 p-7 text-center">
                          <p className="text-sm font-semibold text-slate-500">
                            No packages are currently available.
                          </p>
                        </div>
                      )}
                    </section>
                  )}

                {/* =============================================
                    STEP 3 — AMOUNT
                    ============================================= */}

                {isAmountBased && (
                  <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">

                    <div className="mb-5 flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-100 to-blue-100 text-sm font-black text-[#5B21B6]">
                        3
                      </div>

                      <div>
                        <h3 className="text-base font-black text-slate-900">
                          Choose amount
                        </h3>

                        <p className="mt-0.5 text-xs text-slate-500">
                          Select an amount or enter your own.
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {(isAirtime
                        ? AIRTIME_AMOUNTS
                        : BILL_AMOUNTS
                      ).map(
                        (value) => (
                          <button
                            key={
                              value
                            }
                            type="button"
                            onClick={() =>
                              handleAmountSelect(
                                value
                              )
                            }
                            disabled={
                              processingPayment ||
                              verifyingPin
                            }
                            className={[
                              "rounded-2xl border px-3 py-3.5 text-sm font-black transition-all",
                              amount ===
                              String(
                                value
                              )
                                ? "border-[#5B21B6] bg-gradient-to-r from-purple-50 to-blue-50 text-[#5B21B6] ring-2 ring-[#5B21B6]/10"
                                : "border-slate-200 bg-white text-slate-700 hover:border-purple-200 hover:bg-purple-50",
                            ].join(
                              " "
                            )}
                          >
                            {formatNaira(
                              value
                            )}
                          </button>
                        )
                      )}

                      <button
                        type="button"
                        onClick={
                          handleCustomAmount
                        }
                        disabled={
                          processingPayment ||
                          verifyingPin
                        }
                        className={[
                          "rounded-2xl border px-3 py-3.5 text-sm font-black transition-all",
                          customAmountMode
                            ? "border-[#5B21B6] bg-gradient-to-r from-purple-50 to-blue-50 text-[#5B21B6] ring-2 ring-[#5B21B6]/10"
                            : "border-slate-200 bg-white text-slate-700 hover:border-purple-200 hover:bg-purple-50",
                        ].join(
                          " "
                        )}
                      >
                        Other
                      </button>
                    </div>

                    {customAmountMode && (
                      <div className="mt-4">
                        <Label
                          htmlFor="customServiceAmount"
                          className="mb-2 block text-xs font-bold text-slate-700"
                        >
                          Enter amount
                        </Label>

                        <Input
                          id="customServiceAmount"
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="1"
                          value={
                            amount
                          }
                          onChange={(
                            event
                          ) =>
                            setAmount(
                              event.target.value
                            )
                          }
                          placeholder="Enter exact amount"
                          disabled={
                            processingPayment ||
                            verifyingPin
                          }
                          autoFocus
                          className="h-14 rounded-2xl border-slate-200 bg-slate-50/50 text-lg font-black focus-visible:bg-white focus-visible:ring-[#5B21B6]"
                        />
                      </div>
                    )}

                    {(itemMinimum >
                      0 ||
                      itemMaximum >
                        0) && (
                      <p className="mt-3 text-[11px] font-medium text-slate-500">
                        {itemMinimum >
                        0
                          ? `Minimum: ${formatNaira(
                              itemMinimum
                            )}`
                          : ""}

                        {itemMinimum >
                          0 &&
                        itemMaximum >
                          0
                          ? " • "
                          : ""}

                        {itemMaximum >
                        0
                          ? `Maximum: ${formatNaira(
                              itemMaximum
                            )}`
                          : ""}
                      </p>
                    )}
                  </section>
                )}

                {/* =============================================
                    STEP 3 — QUANTITY
                    ============================================= */}

                {serviceUsesQuantity(
                  serviceType
                ) &&
                  selectedItem && (
                    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">

                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <h3 className="text-base font-black text-slate-900">
                            Quantity
                          </h3>

                          <p className="mt-1 text-xs text-slate-500">
                            Select how many cards you want.
                          </p>
                        </div>

                        <div className="flex items-center gap-2 rounded-2xl bg-slate-50 p-1">
                          <button
                            type="button"
                            onClick={() =>
                              changeQuantity(
                                -1
                              )
                            }
                            disabled={
                              quantity <=
                                1 ||
                              processingPayment ||
                              verifyingPin
                            }
                            className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-lg font-black text-slate-700 shadow-sm disabled:opacity-40"
                          >
                            −
                          </button>

                          <span className="w-10 text-center text-base font-black text-[#5B21B6]">
                            {quantity}
                          </span>

                          <button
                            type="button"
                            onClick={() =>
                              changeQuantity(
                                1
                              )
                            }
                            disabled={
                              quantity >=
                                100 ||
                              processingPayment ||
                              verifyingPin
                            }
                            className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-lg font-black text-slate-700 shadow-sm disabled:opacity-40"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </section>
                  )}

                {/* =============================================
                    REVIEW
                    ============================================= */}

                {customer.trim() &&
                  ((isAmountBased &&
                    amountNumber >
                      0) ||
                    (!isAmountBased &&
                      selectedItem)) && (
                    <section className="overflow-hidden rounded-3xl border border-purple-100 bg-gradient-to-br from-purple-50 via-white to-blue-50 p-5 shadow-sm sm:p-6">

                      <div className="mb-4 flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#5B21B6] to-[#2563EB] text-white shadow-md">
                          <Check className="h-5 w-5" strokeWidth={3} />
                        </div>

                        <div>
                          <h3 className="text-base font-black text-slate-900">
                            Review your payment
                          </h3>

                          <p className="text-xs text-slate-500">
                            Everything looks ready.
                          </p>
                        </div>
                      </div>

                      <div className="space-y-3 rounded-2xl bg-white/80 p-4">

                        <div className="flex items-center justify-between gap-4">
                          <span className="text-xs font-medium text-slate-500">
                            Provider
                          </span>

                          <span className="text-sm font-black text-slate-900">
                            {providerDisplayName}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-4">
                          <span className="text-xs font-medium text-slate-500">
                            {customerLabel}
                          </span>

                          <span className="break-all text-right text-sm font-bold text-slate-900">
                            {getFinalCustomer()}
                          </span>
                        </div>

                        {selectedItem && (
                          <div className="flex items-start justify-between gap-4">
                            <span className="text-xs font-medium text-slate-500">
                              Package
                            </span>

                            <span className="max-w-[65%] text-right text-sm font-bold text-slate-900">
                              {getItemName(
                                selectedItem
                              )}
                            </span>
                          </div>
                        )}

                        {serviceUsesQuantity(
                          serviceType
                        ) && (
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-xs font-medium text-slate-500">
                              Quantity
                            </span>

                            <span className="text-sm font-bold text-slate-900">
                              {quantity}
                            </span>
                          </div>
                        )}

                        <div className="flex items-end justify-between gap-4 border-t border-slate-100 pt-3">
                          <span className="text-sm font-black text-slate-700">
                            Total
                          </span>

                          <span className="text-2xl font-black text-[#5B21B6]">
                            {formatNaira(
                              totalAmount
                            )}
                          </span>
                        </div>
                      </div>
                    </section>
                  )}

                {/* =============================================
                    ERROR
                    ============================================= */}

                {error && (
                  <div className="flex items-start gap-3 rounded-2xl border border-red-100 bg-red-50 p-4">
                    <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />

                    <p className="text-sm font-medium leading-5 text-red-700">
                      {error}
                    </p>
                  </div>
                )}

                {/* =============================================
                    CONTINUE
                    ============================================= */}

                <div className="pb-4">

                  <Button
                    type="button"
                    onClick={
                      handlePurchase
                    }
                    disabled={
                      loadingBillers ||
                      loadingItems ||
                      processingPayment ||
                      verifyingPin ||
                      !selectedBillerCode ||
                      !customer.trim() ||
                      (needsPackage &&
                        !selectedItemCode) ||
                      !amount ||
                      amountNumber <=
                        0
                    }
                    className="h-14 w-full rounded-2xl bg-gradient-to-r from-[#4C1D95] via-[#6D28D9] to-[#2563EB] text-sm font-black shadow-xl shadow-purple-200 transition-all hover:-translate-y-0.5 hover:opacity-95 disabled:translate-y-0 disabled:opacity-50"
                  >
                    {processingPayment ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Processing Payment...
                      </>
                    ) : (
                      <>
                        <LockKeyhole className="mr-2 h-5 w-5" />
                        Continue to Payment
                        <ChevronRight className="ml-auto h-5 w-5" />
                      </>
                    )}
                  </Button>

                  <div className="mt-3 flex items-center justify-center gap-2 text-[10px] font-medium text-slate-500">
                    <ShieldCheck className="h-3.5 w-3.5 text-[#5B21B6]" />
                    Secure payment protected by IyanjuPay
                  </div>
                </div>

              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default ServicePayment;
