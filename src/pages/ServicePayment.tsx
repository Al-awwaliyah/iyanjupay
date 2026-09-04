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
  Flame,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Tv,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

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

interface CatalogItem {
  id?: string | number;
  ID?: string | number;

  name?: string;
  short_name?: string;
  shortName?: string;
  display_name?: string;
  displayName?: string;
  title?: string;
  label?: string;
  description?: string;

  code?: string | number;
  item_code?: string | number;
  itemCode?: string | number;

  biller_code?: string | number;
  billerCode?: string | number;

  network_code?: string | number;
  networkCode?: string | number;

  product_code?: string | number;
  productCode?: string | number;

  product_id?: string | number;
  productId?: string | number;

  variation_code?: string | number;
  variationCode?: string | number;

  plan_code?: string | number;
  planCode?: string | number;

  cable_code?: string | number;
  cableCode?: string | number;

  package_code?: string | number;
  packageCode?: string | number;

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

  validity?: string | number;
  duration?: string | number;
  plan_period?: string;
  planPeriod?: string;
  period?: string;

  plan_type?: string;
  planType?: string;

  is_hot_deal?: boolean | string | number;
  isHotDeal?: boolean | string | number;

  logo?: string;
  logo_url?: string;
  logoUrl?: string;

  category?: string;
  type?: string;

  [key: string]: any;
}

type DataTab =
  | "HOT"
  | "EXTRA NIGHT"
  | "DAILY"
  | "WEEKLY"
  | "MONTHLY";

const DATA_TABS: DataTab[] = [
  "HOT",
  "EXTRA NIGHT",
  "DAILY",
  "WEEKLY",
  "MONTHLY",
];

const AIRTIME_AMOUNTS = [
  50,
  100,
  200,
  500,
  1000,
  2000,
  5000,
];

const GENERAL_AMOUNTS = [
  500,
  1000,
  2000,
  5000,
  10000,
  20000,
  50000,
];

const NETWORK_NAMES: Record<string, string> = {
  "01": "MTN",
  "02": "Glo",
  "03": "9mobile",
  "04": "Airtel",
};

const NETWORK_CODES: Record<string, string> = {
  MTN: "01",
  GLO: "02",
  "9MOBILE": "03",
  AIRTEL: "04",
};

const CABLE_PROVIDER_NAMES: Record<string, string> = {
  dstv: "DSTV",
  gotv: "GOtv",
  startimes: "Startimes",
  showmax: "Showmax",
};

const SERVICE_CATEGORY_MAP: Record<string, string> = {
  airtime: "AIRTIME",
  data: "MOBILEDATA",
  electricity: "UTILITYBILLS",
  cable: "CABLEBILLS",
  internet: "INTSERVICE",
  "airtime-card": "AIRTIME",
  "data-card": "MOBILEDATA",
  smile: "MOBILEDATA",
  waec: "EDUCATION",
  jamb: "EDUCATION",
};

const PROVIDER_LOGOS: Record<string, string> = {
  "01":
    "https://res.cloudinary.com/dqkq5y0qv/image/upload/v1710960600/mtn_t9c4vr.png",
  "02":
    "https://res.cloudinary.com/dqkq5y0qv/image/upload/v1710960600/glo_hqzv1m.png",
  "03":
    "https://res.cloudinary.com/dqkq5y0qv/image/upload/v1710960600/9mobile_nx7x8w.png",
  "04":
    "https://res.cloudinary.com/dqkq5y0qv/image/upload/v1710960600/airtel_yyg7d1.png",
};

const cn = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(" ");

/**
 * Generate the naira symbol instead of putting the UTF-8 character
 * directly in source/UI strings.
 *
 * This prevents the common â¦ rendering issue caused by bad
 * character encoding.
 */
const NAIRA = String.fromCharCode(8358);

function cleanString(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "object") {
    return "";
  }

  return String(value).trim();
}

function numberValue(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const parsed = Number(
      value.replace(/[^0-9.-]/g, "")
    );

    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function formatNaira(value: unknown): string {
  const amount = numberValue(value);

  return `${NAIRA}${amount.toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function isTrueFlag(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  const normalized = cleanString(value).toLowerCase();

  return [
    "true",
    "1",
    "yes",
    "y",
    "hot",
  ].includes(normalized);
}

function normaliseKey(value: unknown): string {
  return cleanString(value)
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

function objectDisplayName(
  item: CatalogItem | null | undefined
): string {
  if (!item) {
    return "";
  }

  const candidates = [
    item.name,
    item.display_name,
    item.displayName,
    item.title,
    item.label,
    item.short_name,
    item.shortName,
    item.description,
  ];

  for (const candidate of candidates) {
    const value = cleanString(candidate);

    if (value && value.toLowerCase() !== "variable") {
      return value;
    }
  }

  const code = cleanString(
    item.code ??
      item.biller_code ??
      item.billerCode ??
      item.network_code ??
      item.networkCode ??
      item.id ??
      item.ID
  );

  return code;
}

function getNetworkCode(
  item: CatalogItem | null | undefined
): string {
  if (!item) {
    return "";
  }

  return cleanString(
    item.network_code ??
      item.networkCode ??
      item.code ??
      item.id ??
      item.ID
  );
}

function getItemCode(
  item: CatalogItem | null | undefined
): string {
  if (!item) {
    return "";
  }

  const value =
    item.item_code ??
    item.itemCode ??
    item.product_code ??
    item.productCode ??
    item.variation_code ??
    item.variationCode ??
    item.plan_code ??
    item.planCode ??
    item.package_code ??
    item.packageCode ??
    item.code ??
    item.id ??
    item.ID;

  return cleanString(value);
}

function getItemName(
  item: CatalogItem | null | undefined
): string {
  if (!item) {
    return "";
  }

  return objectDisplayName(item) || getItemCode(item);
}

function getProviderPrice(
  item: CatalogItem | null | undefined
): number {
  if (!item) {
    return 0;
  }

  return numberValue(
    item.provider_price ??
      item.providerPrice ??
      item.provider_amount ??
      item.providerAmount ??
      item.amount ??
      item.price
  );
}

function getSellingPrice(
  item: CatalogItem | null | undefined
): number {
  if (!item) {
    return 0;
  }

  return numberValue(
    item.selling_price ??
      item.sellingPrice ??
      item.price ??
      item.amount ??
      item.provider_price ??
      item.providerPrice
  );
}

function isHotDeal(
  item: CatalogItem | null | undefined
): boolean {
  if (!item) {
    return false;
  }

  return (
    isTrueFlag(item.is_hot_deal) ||
    isTrueFlag(item.isHotDeal) ||
    normaliseKey(item.plan_type).includes("hot") ||
    normaliseKey(item.planPeriod).includes("hot") ||
    normaliseKey(item.period).includes("hot")
  );
}

function getDataTab(
  item: CatalogItem | null | undefined
): DataTab | null {
  if (!item) {
    return null;
  }

  if (isHotDeal(item)) {
    return "HOT";
  }

  const text = [
    item.plan_type,
    item.planType,
    item.plan_period,
    item.planPeriod,
    item.period,
    item.duration,
    item.name,
    item.title,
    item.description,
  ]
    .map(cleanString)
    .join(" ")
    .toLowerCase();

  if (
    text.includes("extra night") ||
    text.includes("night") ||
    text.includes("midnight")
  ) {
    return "EXTRA NIGHT";
  }

  if (text.includes("daily") || text.includes("1 day")) {
    return "DAILY";
  }

  if (
    text.includes("weekly") ||
    text.includes("7 day") ||
    text.includes("week")
  ) {
    return "WEEKLY";
  }

  if (
    text.includes("monthly") ||
    text.includes("30 day") ||
    text.includes("month")
  ) {
    return "MONTHLY";
  }

  return null;
}

function getCableProviderLabel(
  item: CatalogItem | null | undefined
): string {
  if (!item) {
    return "";
  }

  const code = cleanString(
    item.biller_code ??
      item.billerCode ??
      item.cable_code ??
      item.cableCode ??
      item.code ??
      item.id ??
      item.ID
  ).toLowerCase();

  if (CABLE_PROVIDER_NAMES[code]) {
    return CABLE_PROVIDER_NAMES[code];
  }

  const nameCandidates = [
    item.name,
    item.display_name,
    item.displayName,
    item.title,
    item.label,
    item.short_name,
    item.shortName,
  ];

  for (const candidate of nameCandidates) {
    const name = cleanString(candidate);

    if (!name) {
      continue;
    }

    if (name.toLowerCase() === "variable") {
      continue;
    }

    const normalized = normaliseKey(name);

    if (normalized === "dstv") {
      return "DSTV";
    }

    if (
      normalized === "gotv" ||
      normalized === "gotvng"
    ) {
      return "GOtv";
    }

    if (
      normalized === "startimes" ||
      normalized === "startime"
    ) {
      return "Startimes";
    }

    if (normalized === "showmax") {
      return "Showmax";
    }

    return name;
  }

  if (code) {
    return code.toUpperCase();
  }

  return "";
}

function getProviderDisplayName(
  provider: CatalogItem,
  serviceType: string
): string {
  if (serviceType === "cable") {
    return getCableProviderLabel(provider);
  }

  if (
    serviceType === "airtime" ||
    serviceType === "data" ||
    serviceType === "airtime-card" ||
    serviceType === "data-card"
  ) {
    const code = getNetworkCode(provider);

    if (NETWORK_NAMES[code]) {
      return NETWORK_NAMES[code];
    }

    const raw = objectDisplayName(provider);

    if (raw) {
      return raw;
    }

    return code;
  }

  return objectDisplayName(provider);
}

function getProviderLogo(
  provider: CatalogItem,
  serviceType: string
): string {
  if (
    serviceType === "airtime" ||
    serviceType === "data" ||
    serviceType === "airtime-card" ||
    serviceType === "data-card"
  ) {
    const code = getNetworkCode(provider);

    return PROVIDER_LOGOS[code] || "";
  }

  const directLogo =
    cleanString(provider.logo) ||
    cleanString(provider.logo_url) ||
    cleanString(provider.logoUrl);

  return directLogo;
}

function serviceUsesNetwork(
  serviceType: string
): boolean {
  return [
    "airtime",
    "data",
    "airtime-card",
    "data-card",
  ].includes(serviceType);
}

function serviceUsesQuantity(
  serviceType: string
): boolean {
  return serviceType === "airtime-card";
}

function serviceIsAmountBased(
  serviceType: string
): boolean {
  return [
    "airtime",
    "electricity",
  ].includes(serviceType);
}

function serviceNeedsPlans(
  serviceType: string
): boolean {
  return [
    "data",
    "cable",
    "airtime-card",
    "data-card",
    "smile",
    "waec",
    "jamb",
  ].includes(serviceType);
}

function getCustomerLabel(
  serviceType: string
): string {
  switch (serviceType) {
    case "airtime":
    case "data":
    case "airtime-card":
    case "data-card":
      return "Phone Number";

    case "electricity":
      return "Meter Number";

    case "cable":
      return "SmartCard Number";

    case "waec":
      return "Phone Number";

    case "smile":
      return "Smile Number";

    default:
      return "Phone Number";
  }
}

function getCustomerPlaceholder(
  serviceType: string
): string {
  switch (serviceType) {
    case "electricity":
      return "Enter meter number";

    case "cable":
      return "Enter SmartCard number";

    case "smile":
      return "Enter Smile number";

    default:
      return "Enter phone number";
  }
}

function dedupeItems(
  items: CatalogItem[]
): CatalogItem[] {
  const seen = new Set<string>();

  return items.filter((item) => {
    const key = [
      getItemCode(item),
      getItemName(item),
      getSellingPrice(item),
    ]
      .join("|")
      .toLowerCase();

    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);

    return true;
  });
}

function flattenCatalog(
  payload: any
): CatalogItem[] {
  if (!payload) {
    return [];
  }

  if (Array.isArray(payload)) {
    return payload.flatMap((item) =>
      typeof item === "object"
        ? [item]
        : []
    );
  }

  const candidates = [
    payload.items,
    payload.plans,
    payload.packages,
    payload.data,
    payload.catalog,
    payload.products,
    payload.results,
  ];

  const result: CatalogItem[] = [];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      result.push(
        ...candidate.filter(
          (item) =>
            item &&
            typeof item === "object"
        )
      );
    }
  }

  return result;
}

function extractArray(
  payload: any,
  keys: string[]
): CatalogItem[] {
  if (!payload) {
    return [];
  }

  if (Array.isArray(payload)) {
    return payload.filter(
      (item) =>
        item &&
        typeof item === "object"
    );
  }

  for (const key of keys) {
    const value = payload?.[key];

    if (Array.isArray(value)) {
      return value.filter(
        (item) =>
          item &&
          typeof item === "object"
      );
    }
  }

  return [];
}

function normaliseFunctionResponse(
  response: any
): any {
  if (!response) {
    return {};
  }

  if (
    response.data &&
    typeof response.data === "object"
  ) {
    return response.data;
  }

  return response;
}

function responseMessage(
  payload: any,
  fallback: string
): string {
  return (
    cleanString(payload?.message) ||
    cleanString(payload?.error) ||
    fallback
  );
}

function isResponseSuccessful(
  payload: any
): boolean {
  if (!payload) {
    return false;
  }

  if (
    payload.success === true ||
    payload.status === true ||
    payload.ok === true
  ) {
    return true;
  }

  const status = cleanString(
    payload.status
  ).toLowerCase();

  return [
    "success",
    "successful",
    "completed",
    "complete",
    "validated",
    "valid",
    "true",
  ].includes(status);
}

function getAmountFromPayload(
  payload: any
): number {
  return numberValue(
    payload?.selling_price ??
      payload?.sellingPrice ??
      payload?.price ??
      payload?.amount ??
      payload?.data?.selling_price ??
      payload?.data?.sellingPrice ??
      payload?.data?.price ??
      payload?.data?.amount
  );
}

function getVerificationState(
  payload: any
): {
  validated: boolean;
  verified: boolean;
  message: string;
} {
  const data =
    payload?.data &&
    typeof payload.data === "object"
      ? payload.data
      : payload;

  return {
    validated:
      data?.validated === true ||
      data?.valid === true ||
      data?.success === true ||
      data?.status === "success" ||
      data?.status === "validated" ||
      data?.status === "valid",

    verified:
      data?.verified === true ||
      data?.verification === true ||
      data?.is_verified === true ||
      data?.isVerified === true,

    message:
      cleanString(data?.message) ||
      cleanString(payload?.message) ||
      "Details validated successfully.",
  };
}

function ProviderCard({
  provider,
  selected,
  disabled,
  serviceType,
  onClick,
}: {
  provider: CatalogItem;
  selected: boolean;
  disabled: boolean;
  serviceType: string;
  onClick: () => void;
}) {
  const name = getProviderDisplayName(
    provider,
    serviceType
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
      className={cn(
        "group relative w-full min-w-0 overflow-hidden rounded-xl border bg-white p-2 text-center transition-all duration-200",
        "hover:-translate-y-0.5 hover:shadow-md",
        selected
          ? "border-[#6D28D9] bg-[#6D28D9]/[0.03] ring-2 ring-[#6D28D9]/15"
          : "border-slate-200 hover:border-[#6D28D9]/30",
        disabled &&
          "cursor-not-allowed opacity-60"
      )}
    >
      {selected && (
        <span className="absolute right-1.5 top-1.5 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-[#4C1D95] text-white shadow-sm">
          <Check className="h-2.5 w-2.5 stroke-[3]" />
        </span>
      )}

      <div className="mx-auto flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg border border-slate-100 bg-white shadow-sm">
        {logo ? (
          <img
            src={logo}
            alt=""
            aria-hidden="true"
            className="h-6 w-6 object-contain"
            loading="eager"
            referrerPolicy="no-referrer"
            onError={(event) => {
              event.currentTarget.style.display =
                "none";

              const fallback =
                event.currentTarget
                  .nextElementSibling as
                  | HTMLElement
                  | null;

              if (fallback) {
                fallback.style.display =
                  "flex";
              }
            }}
          />
        ) : null}

        <span
          className="items-center justify-center text-[10px] font-black text-[#4C1D95]"
          style={{
            display: logo ? "none" : "flex",
          }}
        >
          {name
            .slice(0, 2)
            .toUpperCase()}
        </span>
      </div>

      <p className="mt-1.5 truncate px-0.5 text-center text-[10px] font-bold leading-tight text-slate-700 sm:text-[11px]">
        {name}
      </p>
    </button>
  );
}

function PlanCard({
  item,
  selected,
  disabled,
  onClick,
}: {
  item: CatalogItem;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const price = getSellingPrice(item);
  const providerPrice =
    getProviderPrice(item);

  const name = getItemName(item);

  const validity =
    cleanString(item.validity) ||
    cleanString(item.duration) ||
    cleanString(item.period) ||
    cleanString(item.plan_period) ||
    cleanString(item.planPeriod);

  const hot = isHotDeal(item);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "relative w-full rounded-2xl border bg-white p-3 text-left transition-all duration-200",
        "hover:-translate-y-0.5 hover:shadow-md",
        selected
          ? "border-[#6D28D9] bg-[#6D28D9]/[0.025] ring-2 ring-[#6D28D9]/10"
          : "border-slate-200 hover:border-[#6D28D9]/30",
        disabled &&
          "cursor-not-allowed opacity-60"
      )}
    >
      {hot && (
        <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-1 text-[9px] font-black uppercase text-orange-600">
          <Flame className="h-3 w-3" />
          HOT
        </span>
      )}

      {selected && (
        <span className="absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-[#4C1D95] text-white">
          <Check className="h-3 w-3 stroke-[3]" />
        </span>
      )}

      <div
        className={cn(
          "pr-10",
          selected && "pl-7"
        )}
      >
        <p className="line-clamp-2 text-sm font-black text-slate-900">
          {name || "Service Package"}
        </p>

        {validity && (
          <p className="mt-1 text-[10px] font-medium text-slate-500">
            {validity}
          </p>
        )}

        <div className="mt-3 flex items-end justify-between gap-2">
          <div>
            <p className="text-[10px] font-medium text-slate-400">
              Price
            </p>

            <p className="text-base font-black text-[#4C1D95]">
              {formatNaira(price)}
            </p>
          </div>

          {providerPrice > 0 &&
            providerPrice !== price && (
              <p className="text-[10px] text-slate-400">
                {formatNaira(
                  providerPrice
                )}
              </p>
            )}
        </div>
      </div>
    </button>
  );
}

export default function ServicePayment({
  service,
  walletBalance: _walletBalance,
  onBack,
  onPurchase,
}: ServicePaymentProps) {
  const { toast } = useToast();

  const serviceType = cleanString(
    service?.type
  ).toLowerCase();

  const isData =
    serviceType === "data";

  const isCable =
    serviceType === "cable";

  const isElectricity =
    serviceType === "electricity";

  const isJamb =
    serviceType === "jamb";

  const isEpin =
    serviceType === "airtime-card" ||
    serviceType === "data-card";

  const isAirtime =
    serviceType === "airtime";

  const isSmile =
    serviceType === "smile";

  const isWaec =
    serviceType === "waec";

  const [providers, setProviders] =
    useState<CatalogItem[]>([]);

  const [selectedProviderCode, setSelectedProviderCode] =
    useState("");

  const [selectedProvider, setSelectedProvider] =
    useState<CatalogItem | null>(null);

  const [items, setItems] =
    useState<CatalogItem[]>([]);

  const [selectedItemCode, setSelectedItemCode] =
    useState("");

  const [selectedItem, setSelectedItem] =
    useState<CatalogItem | null>(null);

  const [dataTab, setDataTab] =
    useState<DataTab>("HOT");

  const [customer, setCustomer] =
    useState("");

  const [profileCode, setProfileCode] =
    useState("");

  const [examType, setExamType] =
    useState("");

  const [meterType, setMeterType] =
    useState("prepaid");

  const [electricityAmount, setElectricityAmount] =
    useState<number | null>(null);

  const [quantity, setQuantity] =
    useState(1);

  const [selectedAmount, setSelectedAmount] =
    useState<number | null>(null);

  const [loadingProviders, setLoadingProviders] =
    useState(false);

  const [loadingItems, setLoadingItems] =
    useState(false);

  const [validating, setValidating] =
    useState(false);

  const [processingPayment, setProcessingPayment] =
    useState(false);

  const [error, setError] =
    useState("");

  const [validationMessage, setValidationMessage] =
    useState("");

  const [validated, setValidated] =
    useState(false);

  const [verified, setVerified] =
    useState(false);

  const [step, setStep] =
    useState(1);

  const category =
    SERVICE_CATEGORY_MAP[serviceType] ||
    serviceType.toUpperCase();

  const resetValidation = useCallback(() => {
    setValidated(false);
    setVerified(false);
    setValidationMessage("");
  }, []);

  const invoke = useCallback(
    async (
      body: Record<string, any>
    ) => {
      const result =
        await supabase.functions.invoke(
          "clubkonnect-services",
          {
            body,
          }
        );

      if (result.error) {
        throw new Error(
          result.error.message ||
            "Unable to contact the service."
        );
      }

      return normaliseFunctionResponse(
        result.data
      );
    },
    []
  );

  const loadProviders =
    useCallback(async () => {
      if (!serviceType) {
        return;
      }

      setLoadingProviders(true);
      setError("");

      try {
        const payload =
          await invoke({
            action: "catalog",
            service: serviceType,
            category,
          });

        const providerSource =
          serviceType === "cable"
            ? extractArray(
                payload,
                [
                  "billers",
                  "providers",
                  "cable_types",
                  "cableTypes",
                  "networks",
                ]
              )
            : serviceType ===
                  "electricity"
              ? extractArray(
                  payload,
                  [
                    "billers",
                    "providers",
                    "electricity_billers",
                    "electricityBillers",
                  ]
                )
              : extractArray(
                  payload,
                  [
                    "networks",
                    "providers",
                    "billers",
                  ]
                );

        let normalized =
          providerSource;

        if (
          serviceType === "cable"
        ) {
          normalized =
            normalized.filter(
              (provider) =>
                Boolean(
                  getCableProviderLabel(
                    provider
                  )
                )
            );
        }

        setProviders(
          dedupeItems(normalized)
        );

        if (
          normalized.length === 0 &&
          serviceType ===
            "electricity"
        ) {
          setError(
            "No electricity companies are currently available. Please check the electricity biller configuration in the service backend."
          );
        }
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Unable to load service providers.";

        setError(message);
        setProviders([]);
      } finally {
        setLoadingProviders(false);
      }
    }, [
      category,
      invoke,
      serviceType,
    ]);

  const loadItems =
    useCallback(
      async (
        providerCode?: string
      ) => {
        if (!serviceType) {
          return;
        }

        if (
          serviceUsesNetwork(
            serviceType
          ) &&
          !providerCode
        ) {
          setItems([]);
          return;
        }

        if (
          serviceType === "cable" &&
          !providerCode
        ) {
          setItems([]);
          return;
        }

        if (
          serviceIsAmountBased(
            serviceType
          )
        ) {
          setItems([]);
          return;
        }

        setLoadingItems(true);
        setError("");

        try {
          const payload =
            await invoke({
              action: "items",
              service: serviceType,
              category,
              network_code:
                serviceUsesNetwork(
                  serviceType
                )
                  ? providerCode
                  : undefined,
              network:
                serviceUsesNetwork(
                  serviceType
                )
                  ? providerCode
                  : undefined,
              biller_code:
                isCable
                  ? providerCode
                  : undefined,
              cable_code:
                isCable
                  ? providerCode
                  : undefined,
              provider_id:
                providerCode ||
                undefined,
            });

          const result =
            dedupeItems(
              flattenCatalog(payload)
            );

          setItems(result);

          setSelectedItem(null);
          setSelectedItemCode("");
        } catch (err) {
          const message =
            err instanceof Error
              ? err.message
              : "Unable to load packages.";

          setError(message);
          setItems([]);
        } finally {
          setLoadingItems(false);
        }
      },
      [
        category,
        invoke,
        isCable,
        serviceType,
      ]
    );

  const loadGenericCatalog =
    useCallback(async () => {
      if (!serviceType) {
        return;
      }

      setLoadingItems(true);
      setError("");

      try {
        const payload =
          await invoke({
            action: "catalog",
            service: serviceType,
            category,
          });

        const result =
          dedupeItems(
            flattenCatalog(payload)
          );

        setItems(result);

        if (
          serviceType === "jamb"
        ) {
          const exams =
            extractArray(
              payload,
              [
                "exam_types",
                "examTypes",
                "billers",
                "items",
                "plans",
              ]
            );

          if (exams.length) {
            setProviders(
              dedupeItems(exams)
            );
          }
        }
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Unable to load service packages.";

        setError(message);
        setItems([]);
      } finally {
        setLoadingItems(false);
      }
    }, [
      category,
      invoke,
      serviceType,
    ]);

  useEffect(() => {
    setProviders([]);
    setSelectedProvider(null);
    setSelectedProviderCode("");
    setItems([]);
    setSelectedItem(null);
    setSelectedItemCode("");
    setCustomer("");
    setProfileCode("");
    setExamType("");
    setMeterType("prepaid");
    setElectricityAmount(null);
    setSelectedAmount(null);
    setQuantity(1);
    resetValidation();
    setError("");

    if (!serviceType) {
      return;
    }

    if (
      serviceType === "jamb" ||
      serviceType === "smile" ||
      serviceType === "waec"
    ) {
      void loadGenericCatalog();
      return;
    }

    void loadProviders();
  }, [
    loadGenericCatalog,
    loadProviders,
    resetValidation,
    serviceType,
  ]);

  const handleProviderSelect =
    useCallback(
      async (
        provider: CatalogItem
      ) => {
        const code =
          getNetworkCode(provider) ||
          cleanString(
            provider.biller_code ??
              provider.billerCode ??
              provider.code ??
              provider.id ??
              provider.ID
          );

        if (!code) {
          return;
        }

        setSelectedProvider(provider);
        setSelectedProviderCode(code);
        setSelectedItem(null);
        setSelectedItemCode("");
        setCustomer("");
        resetValidation();
        setError("");

        if (
          serviceType === "cable"
        ) {
          setStep(2);
          return;
        }

        if (
          serviceType === "electricity"
        ) {
          setStep(2);
          return;
        }

        if (
          serviceNeedsPlans(
            serviceType
          )
        ) {
          await loadItems(code);
          setStep(2);
        }
      },
      [
        loadItems,
        resetValidation,
        serviceType,
      ]
    );

  const handleItemSelect =
    useCallback(
      (item: CatalogItem) => {
        const code =
          getItemCode(item);

        setSelectedItem(item);
        setSelectedItemCode(code);
        setError("");
        resetValidation();

        const price =
          getSellingPrice(item);

        if (
          serviceType ===
            "airtime-card" &&
          price > 0
        ) {
          setSelectedAmount(
            price
          );
        }

        setStep(
          serviceType ===
            "data" ||
          serviceType === "cable" ||
          isEpin
            ? 3
            : 2
        );
      },
      [
        isEpin,
        resetValidation,
        serviceType,
      ]
    );

  const filteredDataItems =
    useMemo(() => {
      if (!isData) {
        return [];
      }

      if (dataTab === "HOT") {
        const hot = items.filter(
          (item) =>
            isHotDeal(item)
        );

        return hot.length
          ? hot
          : items;
      }

      return items.filter(
        (item) =>
          getDataTab(item) ===
          dataTab
      );
    }, [
      dataTab,
      isData,
      items,
    ]);

  const currentPlanPrice =
    selectedItem
      ? getSellingPrice(
          selectedItem
        )
      : 0;

  const amountForPurchase =
    isAirtime
      ? selectedAmount || 0
      : isElectricity
        ? electricityAmount || 0
        : isEpin
          ? currentPlanPrice *
            quantity
          : currentPlanPrice;

  const canValidate =
    Boolean(
      serviceType &&
        (
          isJamb
            ? examType &&
              profileCode &&
              customer
            : isCable
              ? selectedProviderCode &&
                customer &&
                selectedItemCode
              : isElectricity
                ? selectedProviderCode &&
                  customer
                : isEpin
                  ? selectedProviderCode &&
                    selectedItemCode &&
                    quantity > 0
                  : serviceUsesNetwork(
                      serviceType
                    )
                    ? selectedProviderCode &&
                      customer &&
                      (
                        isAirtime
                          ? Boolean(
                              selectedAmount
                            )
                          : Boolean(
                              selectedItemCode
                            )
                      )
                    : Boolean(
                        customer ||
                          selectedItemCode
                      )
        )
    );

  const handleValidate =
    useCallback(async () => {
      if (!canValidate) {
        setError(
          "Please complete all required fields first."
        );
        return;
      }

      setValidating(true);
      setError("");
      setValidationMessage("");
      setValidated(false);
      setVerified(false);

      try {
        const payload =
          await invoke({
            action: "validate",
            service: serviceType,

            category,

            provider_id:
              selectedProviderCode ||
              undefined,

            network_code:
              selectedProviderCode ||
              undefined,

            biller_code:
              selectedProviderCode ||
              undefined,

            cable_code:
              isCable
                ? selectedProviderCode
                : undefined,

            customer:
              customer ||
              undefined,

            phone:
              isJamb
                ? customer
                : undefined,

            phone_number:
              customer ||
              undefined,

            meter_number:
              isElectricity
                ? customer
                : undefined,

            smartcard_number:
              isCable
                ? customer
                : undefined,

            smartcard:
              isCable
                ? customer
                : undefined,

            meter_type:
              isElectricity
                ? meterType
                : undefined,

            amount:
              isElectricity
                ? electricityAmount
                : selectedAmount,

            item_code:
              selectedItemCode ||
              undefined,

            product_code:
              selectedItemCode ||
              undefined,

            plan_code:
              selectedItemCode ||
              undefined,

            package_code:
              selectedItemCode ||
              undefined,

            exam_type:
              isJamb
                ? examType
                : undefined,

            profile_code:
              isJamb
                ? profileCode
                : undefined,

            ProfileID:
              isJamb
                ? profileCode
                : undefined,
          });

        const state =
          getVerificationState(
            payload
          );

        if (
          !state.validated &&
          !isResponseSuccessful(
            payload
          )
        ) {
          throw new Error(
            responseMessage(
              payload,
              "The details could not be validated."
            )
          );
        }

        setValidated(true);

        /*
         * Only mark the customer details as
         * "verified" when the backend explicitly
         * returns a verification flag.
         *
         * This prevents the frontend from falsely
         * claiming that a SmartCard, meter or JAMB
         * profile was verified when the backend only
         * performed normal validation.
         */
        setVerified(
          state.verified
        );

        setValidationMessage(
          state.message
        );

        toast({
          title:
            state.verified
              ? "Details verified"
              : "Details validated",
          description:
            state.message,
        });
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Unable to validate the details.";

        setError(message);
      } finally {
        setValidating(false);
      }
    }, [
      amountForPurchase,
      canValidate,
      category,
      customer,
      electricityAmount,
      examType,
      invoke,
      isCable,
      isElectricity,
      isJamb,
      meterType,
      selectedAmount,
      selectedItemCode,
      selectedProviderCode,
      serviceType,
      toast,
    ]);

  const handlePurchase =
    useCallback(async () => {
      if (!serviceType) {
        return;
      }

      if (
        amountForPurchase <= 0
      ) {
        setError(
          "Please select a valid amount or package."
        );
        return;
      }

      if (!canValidate) {
        setError(
          "Please complete all required fields."
        );
        return;
      }

      /*
       * We deliberately don't require `verified === true`
       * here because the currently deployed backend's
       * validate action can return `validated` without
       * claiming that an external biller verification
       * endpoint was called.
       */
      if (!validated) {
        await handleValidate();

        /*
         * React state updates are asynchronous, so the
         * actual purchase is intentionally not chained
         * immediately after handleValidate().
         *
         * The user can tap Purchase after validation.
         */
        return;
      }

      setProcessingPayment(true);
      setError("");

      try {
        const selectedProviderName =
          selectedProvider
            ? getProviderDisplayName(
                selectedProvider,
                serviceType
              )
            : "";

        const selectedPlanName =
          selectedItem
            ? getItemName(
                selectedItem
              )
            : "";

        /*
         * Keep the existing Dashboard contract:
         *
         * onPurchase(amount, details)
         *
         * The Dashboard can continue to handle
         * Payment PIN verification and final purchase
         * orchestration.
         */
        await onPurchase(
          amountForPurchase,
          {
            service:
              serviceType,

            service_type:
              serviceType,

            category,

            provider_id:
              selectedProviderCode ||
              undefined,

            provider_code:
              selectedProviderCode ||
              undefined,

            provider_name:
              selectedProviderName ||
              undefined,

            network_code:
              serviceUsesNetwork(
                serviceType
              )
                ? selectedProviderCode
                : undefined,

            network:
              serviceUsesNetwork(
                serviceType
              )
                ? selectedProviderName
                : undefined,

            biller_code:
              isCable ||
              isElectricity
                ? selectedProviderCode
                : undefined,

            biller_name:
              isCable ||
              isElectricity
                ? selectedProviderName
                : undefined,

            item_code:
              selectedItemCode ||
              undefined,

            product_code:
              selectedItemCode ||
              undefined,

            plan_code:
              selectedItemCode ||
              undefined,

            package_code:
              selectedItemCode ||
              undefined,

            plan_name:
              selectedPlanName ||
              undefined,

            customer:
              customer ||
              undefined,

            phone:
              customer ||
              undefined,

            phone_number:
              customer ||
              undefined,

            smartcard_number:
              isCable
                ? customer
                : undefined,

            smartcard:
              isCable
                ? customer
                : undefined,

            meter_number:
              isElectricity
                ? customer
                : undefined,

            meter_type:
              isElectricity
                ? meterType
                : undefined,

            amount:
              amountForPurchase,

            quantity:
              isEpin
                ? quantity
                : undefined,

            exam_type:
              isJamb
                ? examType
                : undefined,

            ExamType:
              isJamb
                ? examType
                : undefined,

            profile_code:
              isJamb
                ? profileCode
                : undefined,

            ProfileID:
              isJamb
                ? profileCode
                : undefined,

            validated,

            verified,

            provider_price:
              selectedItem
                ? getProviderPrice(
                    selectedItem
                  )
                : undefined,

            selling_price:
              selectedItem
                ? getSellingPrice(
                    selectedItem
                  )
                : amountForPurchase,
          }
        );
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Unable to continue with the purchase.";

        setError(message);
      } finally {
        setProcessingPayment(false);
      }
    }, [
      amountForPurchase,
      canValidate,
      category,
      customer,
      examType,
      handleValidate,
      isCable,
      isElectricity,
      isEpin,
      isJamb,
      meterType,
      onPurchase,
      profileCode,
      quantity,
      selectedItem,
      selectedItemCode,
      selectedProvider,
      selectedProviderCode,
      serviceType,
      validated,
      verified,
    ]);

  const customerLabel =
    getCustomerLabel(
      serviceType
    );

  const customerPlaceholder =
    getCustomerPlaceholder(
      serviceType
    );

  const showProviders =
    providers.length > 0 &&
    !isJamb &&
    !isSmile &&
    !isWaec;

  const showPlans =
    serviceNeedsPlans(
      serviceType
    ) &&
    !isJamb &&
    !isSmile &&
    !isWaec;

  return (
    <div className="min-h-full bg-slate-50 pb-10">
      <div className="mx-auto w-full max-w-3xl px-3 py-4 sm:px-5 sm:py-6">
        {/* HEADER */}
        <div className="mb-4 flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={onBack}
            disabled={
              processingPayment ||
              validating
            }
            className="h-9 rounded-xl px-2 text-slate-700 hover:bg-white"
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back
          </Button>

          <div className="min-w-0 text-center">
            <h1 className="truncate text-base font-black text-slate-900 sm:text-lg">
              {service?.title ||
                "Service Payment"}
            </h1>

            <p className="text-[10px] text-slate-500 sm:text-xs">
              Secure service purchase
            </p>
          </div>

          <Button
            type="button"
            variant="ghost"
            className="h-9 rounded-xl px-2 text-[#4C1D95] hover:bg-white"
            onClick={() => {
              toast({
                title: "History",
                description:
                  "Your service history is available from the transaction history section.",
              });
            }}
          >
            History
          </Button>
        </div>

        {/* ERROR */}
        {error && (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* PROVIDERS */}
        {showProviders && (
          <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#4C1D95] text-[11px] font-black text-white">
                    1
                  </span>

                  <Label className="truncate text-sm font-black text-slate-900 sm:text-base">
                    {serviceUsesNetwork(
                      serviceType
                    )
                      ? "Choose Network"
                      : isCable
                        ? "Choose Cable TV"
                        : isElectricity
                          ? "Choose Electricity Company"
                          : "Choose Service"}
                  </Label>
                </div>

                <p className="ml-8 mt-0.5 text-[10px] text-slate-500 sm:text-xs">
                  Select your preferred service.
                </p>
              </div>

              {!loadingProviders && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    void loadProviders()
                  }
                  disabled={
                    processingPayment ||
                    validating
                  }
                  className="h-7 shrink-0 rounded-lg px-2 text-xs text-[#4C1D95]"
                >
                  <RefreshCw className="mr-1 h-3 w-3" />
                  Refresh
                </Button>
              )}
            </div>

            {loadingProviders ? (
              <div className="flex min-h-[90px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50">
                <div className="text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-[#6D28D9]" />

                  <p className="mt-1.5 text-xs font-medium text-slate-500">
                    Loading services...
                  </p>
                </div>
              </div>
            ) : providers.length ? (
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-6">
                {providers.map(
                  (
                    provider,
                    index
                  ) => {
                    const code =
                      cleanString(
                        provider.network_code ??
                          provider.networkCode ??
                          provider.biller_code ??
                          provider.billerCode ??
                          provider.cable_code ??
                          provider.cableCode ??
                          provider.code ??
                          provider.ID ??
                          provider.id
                      );

                    if (!code) {
                      return null;
                    }

                    return (
                      <ProviderCard
                        key={`${code}-${index}`}
                        provider={
                          provider
                        }
                        selected={
                          code ===
                          selectedProviderCode
                        }
                        disabled={
                          processingPayment ||
                          validating
                        }
                        serviceType={
                          serviceType
                        }
                        onClick={() =>
                          void handleProviderSelect(
                            provider
                          )
                        }
                      />
                    );
                  }
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center">
                <p className="text-xs font-medium text-slate-500 sm:text-sm">
                  No services are currently available.
                </p>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    void loadProviders()
                  }
                  className="mt-2.5 h-8 rounded-lg px-3 text-xs"
                >
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  Try Again
                </Button>
              </div>
            )}
          </section>
        )}

        {/* JAMB EXAM TYPE */}
        {isJamb && (
          <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#4C1D95] text-xs font-black text-white">
                1
              </span>

              <div>
                <p className="text-sm font-black text-slate-900">
                  Exam Type
                </p>

                <p className="text-[10px] text-slate-500">
                  Select the JAMB examination type.
                </p>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              {[
                {
                  code: "utme-no-mock",
                  name: "UTME",
                },
                {
                  code: "utme-mock",
                  name: "UTME Mock",
                },
                {
                  code: "de",
                  name: "Direct Entry",
                },
              ].map((exam) => (
                <button
                  key={exam.code}
                  type="button"
                  disabled={
                    processingPayment ||
                    validating
                  }
                  onClick={() => {
                    setExamType(
                      exam.code
                    );
                    setSelectedItemCode(
                      ""
                    );
                    setSelectedItem(
                      null
                    );
                    resetValidation();
                    setError("");
                  }}
                  className={cn(
                    "rounded-xl border p-3 text-left transition-all",
                    examType ===
                      exam.code
                      ? "border-[#6D28D9] bg-[#6D28D9]/5 ring-2 ring-[#6D28D9]/10"
                      : "border-slate-200 hover:border-[#6D28D9]/30"
                  )}
                >
                  <p className="text-sm font-black text-slate-900">
                    {exam.name}
                  </p>

                  <p className="mt-1 text-[10px] text-slate-500">
                    {exam.code}
                  </p>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* CUSTOMER DETAILS */}
        {(selectedProviderCode ||
          isJamb ||
          isSmile ||
          isWaec) && (
          <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-4 flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#6D28D9] text-xs font-black text-white">
                {isJamb ? 2 : 2}
              </span>

              <div>
                <Label
                  htmlFor="serviceCustomer"
                  className="text-base font-black text-slate-900"
                >
                  {isJamb
                    ? "Profile Code"
                    : customerLabel}
                </Label>

                <p className="text-xs text-slate-500">
                  {isJamb
                    ? "Enter your JAMB profile code."
                    : "Enter the details for your selected service."}
                </p>
              </div>
            </div>

            {isJamb ? (
              <>
                <Input
                  id="jambProfileCode"
                  value={profileCode}
                  onChange={(event) => {
                    setProfileCode(
                      event.target.value
                    );
                    resetValidation();
                    setError("");
                  }}
                  placeholder="Enter JAMB profile code"
                  disabled={
                    processingPayment ||
                    validating
                  }
                  className="h-12 rounded-xl border-slate-200 text-base"
                />

                <div className="mt-3">
                  <Label
                    htmlFor="jambPhone"
                    className="mb-1.5 block text-xs font-bold text-slate-700"
                  >
                    Phone Number
                  </Label>

                  <Input
                    id="jambPhone"
                    value={customer}
                    onChange={(event) => {
                      setCustomer(
                        event.target.value
                      );
                      resetValidation();
                      setError("");
                    }}
                    placeholder="Enter phone number"
                    inputMode="numeric"
                    disabled={
                      processingPayment ||
                      validating
                    }
                    className="h-12 rounded-xl border-slate-200 text-base"
                  />
                </div>
              </>
            ) : (
              <Input
                id="serviceCustomer"
                value={customer}
                onChange={(event) => {
                  setCustomer(
                    event.target.value
                  );
                  resetValidation();
                  setError("");
                }}
                placeholder={
                  customerPlaceholder
                }
                disabled={
                  processingPayment ||
                  validating
                }
                inputMode={
                  [
                    "airtime",
                    "data",
                    "airtime-card",
                    "data-card",
                    "electricity",
                    "cable",
                    "waec",
                    "jamb",
                  ].includes(
                    serviceType
                  )
                    ? "numeric"
                    : "text"
                }
                className="h-12 rounded-xl border-slate-200 text-base"
              />
            )}

            {selectedProvider && (
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
                <Check className="h-4 w-4 text-green-600" />

                <span className="text-xs font-medium text-slate-500">
                  Selected:
                </span>

                <span className="text-xs font-black text-[#4C1D95]">
                  {getProviderDisplayName(
                    selectedProvider,
                    serviceType
                  )}
                </span>
              </div>
            )}

            {/* ELECTRICITY METER TYPE */}
            {isElectricity && (
              <div className="mt-4">
                <Label className="mb-2 block text-xs font-bold text-slate-700">
                  Meter Type
                </Label>

                <div className="grid grid-cols-2 gap-2">
                  {[
                    {
                      value:
                        "prepaid",
                      label:
                        "Prepaid",
                    },
                    {
                      value:
                        "postpaid",
                      label:
                        "Postpaid",
                    },
                  ].map(
                    (option) => (
                      <button
                        key={
                          option.value
                        }
                        type="button"
                        disabled={
                          processingPayment ||
                          validating
                        }
                        onClick={() => {
                          setMeterType(
                            option.value
                          );
                          resetValidation();
                        }}
                        className={cn(
                          "rounded-xl border p-3 text-sm font-bold transition",
                          meterType ===
                            option.value
                            ? "border-[#6D28D9] bg-[#6D28D9]/5 text-[#4C1D95]"
                            : "border-slate-200 text-slate-700 hover:border-[#6D28D9]/30"
                        )}
                      >
                        {option.label}
                      </button>
                    )
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        {/* DATA TABS */}
        {isData &&
          selectedProviderCode && (
            <section className="mb-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-black text-slate-900">
                  Data Plans
                </p>

                {loadingItems && (
                  <Loader2 className="h-4 w-4 animate-spin text-[#6D28D9]" />
                )}
              </div>

              <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
                {DATA_TABS.map(
                  (tab) => (
                    <button
                      key={tab}
                      type="button"
                      disabled={
                        loadingItems ||
                        processingPayment
                      }
                      onClick={() =>
                        setDataTab(tab)
                      }
                      className={cn(
                        "shrink-0 rounded-full px-3 py-2 text-[10px] font-black transition sm:text-xs",
                        dataTab ===
                          tab
                          ? "bg-[#4C1D95] text-white shadow-sm"
                          : "bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-[#6D28D9]/30"
                      )}
                    >
                      {tab ===
                        "HOT" && (
                        <Flame className="mr-1 inline h-3 w-3" />
                      )}
                      {tab}
                    </button>
                  )
                )}
              </div>

              {loadingItems ? (
                <div className="flex min-h-[150px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white">
                  <Loader2 className="h-6 w-6 animate-spin text-[#6D28D9]" />
                </div>
              ) : filteredDataItems.length ? (
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {filteredDataItems.map(
                    (
                      item,
                      index
                    ) => (
                      <PlanCard
                        key={`${getItemCode(item)}-${index}`}
                        item={item}
                        selected={
                          selectedItemCode ===
                          getItemCode(
                            item
                          )
                        }
                        disabled={
                          processingPayment ||
                          validating
                        }
                        onClick={() =>
                          handleItemSelect(
                            item
                          )
                        }
                      />
                    )
                  )}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center">
                  <p className="text-xs font-medium text-slate-500">
                    No plans are currently available in this category.
                  </p>
                </div>
              )}
            </section>
          )}

        {/* CABLE PACKAGES */}
        {isCable &&
          selectedProviderCode && (
            <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Tv className="h-5 w-5 text-[#4C1D95]" />

                  <div>
                    <p className="text-sm font-black text-slate-900">
                      Choose Package
                    </p>

                    <p className="text-[10px] text-slate-500">
                      Select your preferred cable package.
                    </p>
                  </div>
                </div>

                {loadingItems && (
                  <Loader2 className="h-4 w-4 animate-spin text-[#6D28D9]" />
                )}
              </div>

              {loadingItems ? (
                <div className="flex min-h-[120px] items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-[#6D28D9]" />
                </div>
              ) : items.length ? (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {items.map(
                    (
                      item,
                      index
                    ) => (
                      <PlanCard
                        key={`${getItemCode(item)}-${index}`}
                        item={item}
                        selected={
                          selectedItemCode ===
                          getItemCode(
                            item
                          )
                        }
                        disabled={
                          processingPayment ||
                          validating
                        }
                        onClick={() =>
                          handleItemSelect(
                            item
                          )
                        }
                      />
                    )
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center">
                  <p className="text-xs text-slate-500">
                    No cable packages are currently available.
                  </p>
                </div>
              )}
            </section>
          )}

        {/* E-PIN PACKAGE */}
        {isEpin &&
          selectedProviderCode && (
            <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <Smartphone className="h-5 w-5 text-[#4C1D95]" />

                <div>
                  <p className="text-sm font-black text-slate-900">
                    Choose Denomination
                  </p>

                  <p className="text-[10px] text-slate-500">
                    Select the recharge card value.
                  </p>
                </div>
              </div>

              {loadingItems ? (
                <div className="flex min-h-[120px] items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-[#6D28D9]" />
                </div>
              ) : items.length ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {items.map(
                    (
                      item,
                      index
                    ) => (
                      <PlanCard
                        key={`${getItemCode(item)}-${index}`}
                        item={item}
                        selected={
                          selectedItemCode ===
                          getItemCode(
                            item
                          )
                        }
                        disabled={
                          processingPayment ||
                          validating
                        }
                        onClick={() =>
                          handleItemSelect(
                            item
                          )
                        }
                      />
                    )
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center">
                  <p className="text-xs text-slate-500">
                    No denominations are currently available.
                  </p>
                </div>
              )}

              {selectedItem && (
                <div className="mt-4">
                  <Label className="mb-2 block text-xs font-bold text-slate-700">
                    Quantity
                  </Label>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={
                        quantity <= 1 ||
                        processingPayment ||
                        validating
                      }
                      onClick={() =>
                        setQuantity(
                          (value) =>
                            Math.max(
                              1,
                              value - 1
                            )
                        )
                      }
                      className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-lg font-black text-slate-700 disabled:opacity-40"
                    >
                      −
                    </button>

                    <div className="flex h-10 min-w-16 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-black text-slate-900">
                      {quantity}
                    </div>

                    <button
                      type="button"
                      disabled={
                        quantity >=
                          100 ||
                        processingPayment ||
                        validating
                      }
                      onClick={() =>
                        setQuantity(
                          (value) =>
                            Math.min(
                              100,
                              value + 1
                            )
                        )
                      }
                      className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-lg font-black text-slate-700 disabled:opacity-40"
                    >
                      +
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}

        {/* AIRTIME */}
        {isAirtime &&
          selectedProviderCode && (
            <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <Smartphone className="h-5 w-5 text-[#4C1D95]" />

                <div>
                  <p className="text-sm font-black text-slate-900">
                    Choose Amount
                  </p>

                  <p className="text-[10px] text-slate-500">
                    Select or enter your airtime amount.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                {AIRTIME_AMOUNTS.map(
                  (amount) => (
                    <button
                      key={amount}
                      type="button"
                      disabled={
                        processingPayment ||
                        validating
                      }
                      onClick={() => {
                        setSelectedAmount(
                          amount
                        );
                        resetValidation();
                        setError("");
                      }}
                      className={cn(
                        "rounded-xl border px-2 py-3 text-xs font-black transition",
                        selectedAmount ===
                          amount
                          ? "border-[#6D28D9] bg-[#6D28D9]/5 text-[#4C1D95] ring-2 ring-[#6D28D9]/10"
                          : "border-slate-200 text-slate-700 hover:border-[#6D28D9]/30"
                      )}
                    >
                      {formatNaira(
                        amount
                      )}
                    </button>
                  )
                )}
              </div>

              <div className="mt-3">
                <Label
                  htmlFor="customAirtimeAmount"
                  className="mb-1.5 block text-xs font-bold text-slate-700"
                >
                  Custom Amount
                </Label>

                <Input
                  id="customAirtimeAmount"
                  value={
                    selectedAmount ??
                    ""
                  }
                  onChange={(event) => {
                    const value =
                      numberValue(
                        event.target
                          .value
                      );

                    setSelectedAmount(
                      value > 0
                        ? value
                        : null
                    );

                    resetValidation();
                  }}
                  inputMode="decimal"
                  placeholder="Enter amount"
                  disabled={
                    processingPayment ||
                    validating
                  }
                  className="h-12 rounded-xl border-slate-200"
                />
              </div>
            </section>
          )}

        {/* ELECTRICITY AMOUNT */}
        {isElectricity &&
          selectedProviderCode && (
            <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <Zap className="h-5 w-5 text-[#4C1D95]" />

                <div>
                  <p className="text-sm font-black text-slate-900">
                    Choose Amount
                  </p>

                  <p className="text-[10px] text-slate-500">
                    Enter the amount you want to purchase.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 sm:grid-cols-7">
                {GENERAL_AMOUNTS.map(
                  (amount) => (
                    <button
                      key={amount}
                      type="button"
                      disabled={
                        processingPayment ||
                        validating
                      }
                      onClick={() => {
                        setElectricityAmount(
                          amount
                        );
                        resetValidation();
                      }}
                      className={cn(
                        "rounded-xl border px-2 py-3 text-xs font-black transition",
                        electricityAmount ===
                          amount
                          ? "border-[#6D28D9] bg-[#6D28D9]/5 text-[#4C1D95] ring-2 ring-[#6D28D9]/10"
                          : "border-slate-200 text-slate-700 hover:border-[#6D28D9]/30"
                      )}
                    >
                      {formatNaira(
                        amount
                      )}
                    </button>
                  )
                )}
              </div>

              <div className="mt-3">
                <Label
                  htmlFor="electricityAmount"
                  className="mb-1.5 block text-xs font-bold text-slate-700"
                >
                  Custom Amount
                </Label>

                <Input
                  id="electricityAmount"
                  value={
                    electricityAmount ??
                    ""
                  }
                  onChange={(event) => {
                    const value =
                      numberValue(
                        event.target
                          .value
                      );

                    setElectricityAmount(
                      value > 0
                        ? value
                        : null
                    );

                    resetValidation();
                  }}
                  inputMode="decimal"
                  placeholder="Enter amount"
                  disabled={
                    processingPayment ||
                    validating
                  }
                  className="h-12 rounded-xl border-slate-200"
                />
              </div>
            </section>
          )}

        {/* JAMB PACKAGE */}
        {isJamb &&
          examType && (
            <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-[#4C1D95]" />

                <div>
                  <p className="text-sm font-black text-slate-900">
                    JAMB Package
                  </p>

                  <p className="text-[10px] text-slate-500">
                    Select the available JAMB package.
                  </p>
                </div>
              </div>

              {items.length ? (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {items.map(
                    (
                      item,
                      index
                    ) => (
                      <PlanCard
                        key={`${getItemCode(item)}-${index}`}
                        item={item}
                        selected={
                          selectedItemCode ===
                          getItemCode(
                            item
                          )
                        }
                        disabled={
                          processingPayment ||
                          validating
                        }
                        onClick={() =>
                          handleItemSelect(
                            item
                          )
                        }
                      />
                    )
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center">
                  <p className="text-xs text-slate-500">
                    Loading available JAMB package...
                  </p>

                  {loadingItems && (
                    <Loader2 className="mx-auto mt-2 h-4 w-4 animate-spin text-[#6D28D9]" />
                  )}
                </div>
              )}
            </section>
          )}

        {/* GENERIC PACKAGE SERVICES */}
        {(isSmile ||
          isWaec) &&
          items.length > 0 && (
            <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3">
                <p className="text-sm font-black text-slate-900">
                  Choose Package
                </p>

                <p className="text-[10px] text-slate-500">
                  Select the service package you want.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {items.map(
                  (
                    item,
                    index
                  ) => (
                    <PlanCard
                      key={`${getItemCode(item)}-${index}`}
                      item={item}
                      selected={
                        selectedItemCode ===
                        getItemCode(
                          item
                        )
                      }
                      disabled={
                        processingPayment ||
                        validating
                      }
                      onClick={() =>
                        handleItemSelect(
                          item
                        )
                      }
                    />
                  )
                )}
              </div>
            </section>
          )}

        {/* VALIDATION STATUS */}
        {validated && (
          <div className="mb-4 rounded-2xl border border-green-200 bg-green-50 p-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-600 text-white">
                <Check className="h-4 w-4 stroke-[3]" />
              </div>

              <div>
                <p className="text-sm font-black text-green-800">
                  {verified
                    ? "Details verified"
                    : "Details validated"}
                </p>

                <p className="mt-0.5 text-xs text-green-700">
                  {validationMessage ||
                    "Your service details are ready for purchase."}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ORDER SUMMARY */}
        {amountForPurchase > 0 && (
          <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#4C1D95] text-xs font-black text-white">
                ✓
              </span>

              <div>
                <p className="text-sm font-black text-slate-900">
                  Purchase Summary
                </p>

                <p className="text-[10px] text-slate-500">
                  Review your service purchase.
                </p>
              </div>
            </div>

            <div className="space-y-2 rounded-xl bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-slate-500">
                  Service
                </span>

                <span className="text-xs font-black text-slate-900">
                  {service?.title}
                </span>
              </div>

              {selectedProvider && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-slate-500">
                    Network / Company
                  </span>

                  <span className="text-xs font-black text-slate-900">
                    {getProviderDisplayName(
                      selectedProvider,
                      serviceType
                    )}
                  </span>
                </div>
              )}

              {selectedItem && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-slate-500">
                    Package
                  </span>

                  <span className="max-w-[60%] text-right text-xs font-black text-slate-900">
                    {getItemName(
                      selectedItem
                    )}
                  </span>
                </div>
              )}

              {isEpin && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-slate-500">
                    Quantity
                  </span>

                  <span className="text-xs font-black text-slate-900">
                    {quantity}
                  </span>
                </div>
              )}

              <div className="border-t border-slate-200 pt-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-black text-slate-900">
                    Total
                  </span>

                  <span className="text-lg font-black text-[#4C1D95]">
                    {formatNaira(
                      amountForPurchase
                    )}
                  </span>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ACTIONS */}
        <div className="sticky bottom-3 z-20">
          {!validated ? (
            <Button
              type="button"
              onClick={() =>
                void handleValidate()
              }
              disabled={
                !canValidate ||
                validating ||
                processingPayment
              }
              className="h-12 w-full rounded-2xl bg-[#4C1D95] text-sm font-black text-white shadow-lg hover:bg-[#3B1776] disabled:opacity-50"
            >
              {validating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Validating...
                </>
              ) : (
                <>
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Validate Details
                </>
              )}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() =>
                void handlePurchase()
              }
              disabled={
                processingPayment ||
                amountForPurchase <= 0
              }
              className="h-12 w-full rounded-2xl bg-[#4C1D95] text-sm font-black text-white shadow-lg hover:bg-[#3B1776] disabled:opacity-50"
            >
              {processingPayment ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  Purchase
                  <ChevronRight className="ml-1.5 h-4 w-4" />
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
