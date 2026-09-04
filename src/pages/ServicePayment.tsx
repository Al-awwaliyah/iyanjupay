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
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

/* ============================================================
 * TYPES
 * ========================================================== */

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
  code?: string;
  item_code?: string;
  itemCode?: string;

  name?: string;
  title?: string;
  label?: string;
  description?: string;
  short_name?: string;
  shortName?: string;

  price?: number | string;
  selling_price?: number | string;
  sellingPrice?: number | string;

  provider_price?: number | string;
  providerPrice?: number | string;

  provider_amount?: number | string;
  providerAmount?: number | string;

  network_code?: string;
  networkCode?: string;

  biller_code?: string;
  billerCode?: string;

  package_code?: string;
  packageCode?: string;

  product_code?: string;
  productCode?: string;

  plan_code?: string;
  planCode?: string;

  data_plan?: string;
  dataPlan?: string;

  plan_period?: string;
  planPeriod?: string;
  period?: string;

  plan_type?: string;
  planType?: string;

  validity_days?: number | string | null;
  validityDays?: number | string | null;

  is_hot_deal?: boolean | string;
  isHotDeal?: boolean | string;

  [key: string]: any;
}

interface ProviderOption {
  id?: string | number;
  code?: string;
  value?: string;

  name?: string;
  label?: string;
  title?: string;
  short_name?: string;
  shortName?: string;

  biller_code?: string;
  billerCode?: string;

  network_code?: string;
  networkCode?: string;

  logo?: string | null;
  logo_url?: string | null;
  logoUrl?: string | null;

  [key: string]: any;
}

interface VerificationResult {
  success: boolean;
  message?: string;
  data?: any;
}

/* ============================================================
 * CONSTANTS
 * ========================================================== */

const CLUBKONNECT_SERVICES = new Set([
  "airtime",
  "data",
  "electricity",
  "cable",
  "airtime-card",
  "data-card",
  "smile",
  "waec",
  "jamb",
]);

const SERVICE_CATEGORY_MAP: Record<string, string> = {
  airtime: "AIRTIME",
  data: "MOBILEDATA",
  electricity: "UTILITYBILLS",
  cable: "CABLEBILLS",
  "airtime-card": "AIRTIME",
  "data-card": "MOBILEDATA",
  smile: "MOBILEDATA",
  waec: "EDUCATION",
  jamb: "EDUCATION",
  internet: "INTSERVICE",
};

const NETWORK_NAMES: Record<string, string> = {
  "01": "MTN",
  "02": "Glo",
  "03": "9mobile",
  "04": "Airtel",
};

const DATA_TABS = [
  "HOT",
  "EXTRA NIGHT",
  "DAILY",
  "WEEKLY",
  "MONTHLY",
] as const;

type DataTab = (typeof DATA_TABS)[number];

const AIRTIME_AMOUNTS = [
  50,
  100,
  200,
  500,
  1000,
  2000,
  5000,
];

const ELECTRICITY_AMOUNTS = [
  1000,
  2000,
  5000,
  10000,
  20000,
  50000,
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

/* ============================================================
 * HELPERS
 * ========================================================== */

function cleanString(
  value: unknown
): string {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  if (
    typeof value === "object"
  ) {
    const object =
      value as Record<string, any>;

    return cleanString(
      object.name ??
        object.label ??
        object.title ??
        object.value ??
        object.code ??
        ""
    );
  }

  return String(value).trim();
}

function numberValue(
  value: unknown
): number {
  if (
    typeof value === "number"
  ) {
    return Number.isFinite(value)
      ? value
      : 0;
  }

  const cleaned =
    cleanString(value)
      .replace(/[â¦,\s]/g, "")
      .replace(/NGN/gi, "");

  const result =
    Number(cleaned);

  return Number.isFinite(result)
    ? result
    : 0;
}

function formatNaira(
  value: number
): string {
  return `â¦${numberValue(value).toLocaleString(
    "en-NG",
    {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }
  )}`;
}

function normaliseKey(
  value: unknown
): string {
  return cleanString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function getCode(
  item: CatalogItem | ProviderOption
): string {
  return cleanString(
    item.biller_code ??
      item.billerCode ??
      item.network_code ??
      item.networkCode ??
      item.item_code ??
      item.itemCode ??
      item.package_code ??
      item.packageCode ??
      item.code ??
      item.value ??
      item.id
  );
}

function getItemCode(
  item: CatalogItem
): string {
  return cleanString(
    item.item_code ??
      item.itemCode ??
      item.product_code ??
      item.productCode ??
      item.plan_code ??
      item.planCode ??
      item.package_code ??
      item.packageCode ??
      item.data_plan ??
      item.dataPlan ??
      item.code ??
      item.id
  );
}

function getItemName(
  item: CatalogItem
): string {
  return cleanString(
    item.name ??
      item.title ??
      item.label ??
      item.description ??
      item.short_name ??
      item.shortName ??
      getItemCode(item)
  );
}

function getProviderName(
  provider: ProviderOption
): string {
  return cleanString(
    provider.short_name ??
      provider.shortName ??
      provider.name ??
      provider.label ??
      provider.title ??
      provider.value ??
      provider.code ??
      provider.id ??
      "Provider"
  );
}

function getSellingPrice(
  item: CatalogItem
): number {
  return numberValue(
    item.selling_price ??
      item.sellingPrice ??
      item.price ??
      item.amount ??
      item.provider_price ??
      item.providerPrice ??
      item.provider_amount ??
      item.providerAmount
  );
}

function isTrueFlag(
  value: unknown
): boolean {
  return (
    value === true ||
    cleanString(value).toLowerCase() ===
      "true" ||
    cleanString(value) === "1"
  );
}

function isHotDeal(
  item: CatalogItem
): boolean {
  if (
    isTrueFlag(
      item.is_hot_deal
    ) ||
    isTrueFlag(
      item.isHotDeal
    )
  ) {
    return true;
  }

  const text = [
    item.name,
    item.title,
    item.label,
    item.description,
    item.plan_type,
    item.planType,
  ]
    .filter(Boolean)
    .map(cleanString)
    .join(" ")
    .toLowerCase();

  return (
    /\bsme\b/.test(text) ||
    /hot\s*deal/.test(text) ||
    /hotdeal/.test(text)
  );
}

function getDataTab(
  item: CatalogItem
): DataTab {
  if (isHotDeal(item)) {
    return "HOT";
  }

  const explicit =
    cleanString(
      item.plan_period ??
        item.planPeriod ??
        item.period ??
        item.category
    ).toLowerCase();

  const text = [
    item.name,
    item.title,
    item.description,
    item.plan_type,
    item.planType,
    item.validity_days,
    item.validityDays,
    explicit,
  ]
    .filter(
      (value) =>
        value !==
          undefined &&
        value !== null
    )
    .map(cleanString)
    .join(" ")
    .toLowerCase();

  if (
    text.includes("extra night") ||
    text.includes("night")
  ) {
    return "EXTRA NIGHT";
  }

  if (
    text.includes("monthly") ||
    /\b30\s*days?\b/.test(text) ||
    /\b31\s*days?\b/.test(text)
  ) {
    return "MONTHLY";
  }

  if (
    text.includes("weekly") ||
    /\b7\s*days?\b/.test(text) ||
    /\b14\s*days?\b/.test(text)
  ) {
    return "WEEKLY";
  }

  if (
    text.includes("daily") ||
    /\b1\s*day\b/.test(text) ||
    /\b24\s*hours?\b/.test(text)
  ) {
    return "DAILY";
  }

  return "DAILY";
}

function normalizePhone(
  value: string
): string {
  const raw =
    value
      .replace(/\s+/g, "")
      .trim();

  if (
    /^0\d{10}$/.test(raw)
  ) {
    return `234${raw.slice(1)}`;
  }

  if (
    /^\+234\d{10}$/.test(raw)
  ) {
    return raw.slice(1);
  }

  if (
    /^234\d{10}$/.test(raw)
  ) {
    return raw;
  }

  return raw;
}

function validNigerianPhone(
  value: string
): boolean {
  return /^234\d{10}$/.test(
    normalizePhone(value)
  );
}

function extractArray(
  data: any,
  ...keys: string[]
): any[] {
  for (
    const key of keys
  ) {
    if (
      Array.isArray(data?.[key])
    ) {
      return data[key];
    }
  }

  if (
    Array.isArray(data)
  ) {
    return data;
  }

  if (
    Array.isArray(data?.data)
  ) {
    return data.data;
  }

  return [];
}

function getProviderLogo(
  provider: ProviderOption,
  serviceType: string
): string | null {
  const backendLogo =
    cleanString(
      provider.logo ??
        provider.logo_url ??
        provider.logoUrl
    );

  if (
    backendLogo &&
    /^https?:\/\//i.test(
      backendLogo
    )
  ) {
    return backendLogo;
  }

  const key =
    normaliseKey(
      [
        provider.name,
        provider.label,
        provider.title,
        provider.short_name,
        provider.shortName,
        provider.code,
        provider.biller_code,
        provider.network_code,
      ]
        .filter(Boolean)
        .map(cleanString)
        .join(" ")
    );

  if (
    serviceType === "cable"
  ) {
    if (
      key.includes("dstv") ||
      key.includes("multichoice")
    ) {
      return CABLE_LOGOS.dstv;
    }

    if (
      key.includes("gotv")
    ) {
      return CABLE_LOGOS.gotv;
    }

    if (
      key.includes("startimes") ||
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

  if (
    key.includes("mtn")
  ) {
    return NETWORK_LOGOS.mtn;
  }

  if (
    key.includes("glo") ||
    key.includes("globacom")
  ) {
    return NETWORK_LOGOS.glo;
  }

  if (
    key.includes("airtel")
  ) {
    return NETWORK_LOGOS.airtel;
  }

  if (
    key.includes("9mobile") ||
    key.includes("etisalat") ||
    key.includes("t2mobile")
  ) {
    return NETWORK_LOGOS["9mobile"];
  }

  return null;
}

/* ============================================================
 * PROVIDER CARD
 * ========================================================== */

function ProviderCard({
  provider,
  selected,
  disabled,
  serviceType,
  onClick,
}: {
  provider: ProviderOption;
  selected: boolean;
  disabled: boolean;
  serviceType: string;
  onClick: () => void;
}) {
  const name =
    getProviderName(provider);

  const logo =
    getProviderLogo(
      provider,
      serviceType
    );

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={name}
      aria-label={`Select ${name}`}
      className={[
        "group relative w-full min-w-0 overflow-hidden rounded-xl border bg-white p-2 text-center transition-all duration-200",
        "hover:-translate-y-0.5 hover:shadow-md",
        selected
          ? "border-[#6D28D9] bg-[#6D28D9]/[0.03] ring-2 ring-[#6D28D9]/15"
          : "border-slate-200 hover:border-[#6D28D9]/30",
        disabled
          ? "cursor-not-allowed opacity-60"
          : "",
      ].join(" ")}
    >
      {selected && (
        <span className="absolute right-1.5 top-1.5 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-[#4C1D95] text-white">
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
            display: logo
              ? "none"
              : "flex",
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

/* ============================================================
 * DATA PLAN CARD
 * ========================================================== */

function DataPlanCard({
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
  const hot =
    isHotDeal(item);

  const name =
    getItemName(item);

  const price =
    getSellingPrice(item);

  const validity =
    cleanString(
      item.validity_days ??
        item.validityDays ??
        item.plan_period ??
        item.planPeriod ??
        item.period
    );

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "relative min-w-0 overflow-hidden rounded-2xl border bg-white p-3 text-left transition-all sm:p-4",
        "hover:-translate-y-0.5 hover:shadow-md",
        selected
          ? "border-[#6D28D9] ring-2 ring-[#6D28D9]/10"
          : "border-slate-200",
        disabled
          ? "cursor-not-allowed opacity-60"
          : "",
      ].join(" ")}
    >
      {hot && (
        <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-orange-600">
          <Flame className="h-3 w-3" />
          Hot Deal
        </span>
      )}

      <div className="pr-14">
        <p className="line-clamp-2 min-h-[38px] text-sm font-bold text-slate-900">
          {name}
        </p>

        {validity && (
          <p className="mt-1 truncate text-xs text-slate-500">
            {validity}
          </p>
        )}
      </div>

      <div className="mt-4 flex items-end justify-between gap-2">
        <span className="truncate text-base font-extrabold text-[#4C1D95] sm:text-lg">
          {formatNaira(price)}
        </span>

        <span
          className={[
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border",
            selected
              ? "border-[#6D28D9] bg-[#6D28D9] text-white"
              : "border-slate-200 text-slate-400",
          ].join(" ")}
        >
          {selected && (
            <Check className="h-3.5 w-3.5 stroke-[3]" />
          )}
        </span>
      </div>
    </button>
  );
}

/* ============================================================
 * PACKAGE CARD
 * ========================================================== */

function PackageCard({
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
        "relative flex min-h-[86px] w-full flex-col justify-between rounded-2xl border bg-white p-3 text-left transition-all",
        "hover:-translate-y-0.5 hover:shadow-md",
        selected
          ? "border-[#6D28D9] bg-[#6D28D9]/[0.03] ring-2 ring-[#6D28D9]/10"
          : "border-slate-200",
        disabled
          ? "cursor-not-allowed opacity-60"
          : "",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 text-sm font-bold text-slate-900">
          {name}
        </p>

        {selected && (
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#6D28D9] text-white">
            <Check className="h-3 w-3 stroke-[3]" />
          </span>
        )}
      </div>

      {price > 0 && (
        <p className="mt-2 text-sm font-black text-[#4C1D95]">
          {formatNaira(price)}
        </p>
      )}
    </button>
  );
}

/* ============================================================
 * COMPONENT
 * ========================================================== */

const ServicePayment = ({
  service,
  walletBalance,
  onBack,
  onPurchase,
}: ServicePaymentProps) => {
  const serviceType =
    cleanString(
      service?.type
    ).toLowerCase();

  const category =
    SERVICE_CATEGORY_MAP[
      serviceType
    ] ?? "";

  const isClubKonnect =
    CLUBKONNECT_SERVICES.has(
      serviceType
    );

  const isAirtime =
    serviceType === "airtime";

  const isData =
    serviceType === "data";

  const isCable =
    serviceType === "cable";

  const isElectricity =
    serviceType ===
    "electricity";

  const isAirtimeCard =
    serviceType ===
    "airtime-card";

  const isDataCard =
    serviceType ===
    "data-card";

  const isEpin =
    isAirtimeCard ||
    isDataCard;

  const isJamb =
    serviceType ===
    "jamb";

  const isWaec =
    serviceType ===
    "waec";

  const isSmile =
    serviceType ===
    "smile";

  const isEducation =
    isJamb ||
    isWaec;

  const isAmountBased =
    isAirtime ||
    isElectricity;

  /* ==========================================================
   * FORM STATE
   * ======================================================== */

  const [customer, setCustomer] =
    useState("");

  const [amount, setAmount] =
    useState("");

  const [customAmountMode, setCustomAmountMode] =
    useState(false);

  const [quantity, setQuantity] =
    useState("1");

  const [profileCode, setProfileCode] =
    useState("");

  const [selectedProviderCode, setSelectedProviderCode] =
    useState("");

  const [selectedItemCode, setSelectedItemCode] =
    useState("");

  const [selectedMeterType, setSelectedMeterType] =
    useState("prepaid");

  const [dataTab, setDataTab] =
    useState<DataTab>("HOT");

  /* ==========================================================
   * CATALOGUE STATE
   * ======================================================== */

  const [providers, setProviders] =
    useState<ProviderOption[]>([]);

  const [items, setItems] =
    useState<CatalogItem[]>([]);

  const [loadingProviders, setLoadingProviders] =
    useState(false);

  const [loadingItems, setLoadingItems] =
    useState(false);

  /* ==========================================================
   * VERIFICATION
   * ======================================================== */

  const [verifyingCustomer, setVerifyingCustomer] =
    useState(false);

  const [customerVerified, setCustomerVerified] =
    useState(false);

  const [verificationData, setVerificationData] =
    useState<any>(null);

  /* ==========================================================
   * PAYMENT PIN
   * ======================================================== */

  const [showPinPrompt, setShowPinPrompt] =
    useState(false);

  const [paymentPin, setPaymentPin] =
    useState("");

  const [verifyingPin, setVerifyingPin] =
    useState(false);

  const [processingPayment, setProcessingPayment] =
    useState(false);

  const [error, setError] =
    useState("");

  const { toast } =
    useToast();

  /* ==========================================================
   * SELECTED OBJECTS
   * ======================================================== */

  const selectedProvider =
    useMemo(
      () =>
        providers.find(
          (provider) =>
            getCode(provider) ===
            selectedProviderCode
        ) ?? null,
      [
        providers,
        selectedProviderCode,
      ]
    );

  const selectedItem =
    useMemo(
      () =>
        items.find(
          (item) =>
            getItemCode(item) ===
            selectedItemCode
        ) ?? null,
      [
        items,
        selectedItemCode,
      ]
    );

  /* ==========================================================
   * CUSTOMER LABELS
   * ======================================================== */

  const customerLabel =
    useMemo(() => {
      if (isCable) {
        return "SmartCard Number";
      }

      if (isElectricity) {
        return "Meter Number";
      }

      if (
        isAirtime ||
        isData ||
        isAirtimeCard ||
        isDataCard ||
        isSmile ||
        isWaec ||
        isJamb
      ) {
        return "Phone Number";
      }

      return "Customer Number";
    }, [
      isCable,
      isElectricity,
      isAirtime,
      isData,
      isAirtimeCard,
      isDataCard,
      isSmile,
      isWaec,
      isJamb,
    ]);

  const customerPlaceholder =
    useMemo(() => {
      if (isCable) {
        return "Enter SmartCard number";
      }

      if (isElectricity) {
        return "Enter meter number";
      }

      return "e.g. 08012345678";
    }, [
      isCable,
      isElectricity,
    ]);

  /* ==========================================================
   * DATA GROUPING
   * ======================================================== */

  const dataGroups =
    useMemo(() => {
      const groups: Record<
        DataTab,
        CatalogItem[]
      > = {
        HOT: [],
        "EXTRA NIGHT": [],
        DAILY: [],
        WEEKLY: [],
        MONTHLY: [],
      };

      for (
        const item of items
      ) {
        const group =
          getDataTab(item);

        groups[group].push(
          item
        );
      }

      return groups;
    }, [items]);

  const visibleDataPlans =
    dataGroups[dataTab];

  /* ==========================================================
   * AMOUNT
   * ======================================================== */

  const amountNumber =
    numberValue(amount);

  const quantityNumber =
    Math.max(
      1,
      Math.min(
        100,
        Number(quantity) || 1
      )
    );

  const selectedItemPrice =
    selectedItem
      ? getSellingPrice(
          selectedItem
        )
      : 0;

  const totalAmount =
    isEpin
      ? selectedItemPrice *
        quantityNumber
      : amountNumber;

  /* ==========================================================
   * FUNCTION INVOCATION
   * ======================================================== */

  const invokeClubKonnect =
    useCallback(
      async (
        action: string,
        extra: Record<string, any> = {}
      ) => {
        const {
          data,
          error: functionError,
        } =
          await supabase.functions.invoke(
            "clubkonnect-services",
            {
              body: {
                action,
                service:
                  serviceType,
                category,
                ...extra,
              },
            }
          );

        if (
          functionError
        ) {
          console.error(
            "clubkonnect-services error:",
            functionError
          );

          throw new Error(
            functionError.message ||
              "Unable to communicate with the service."
          );
        }

        if (
          !data ||
          data.success !== true
        ) {
          throw new Error(
            data?.error ||
              data?.message ||
              "The service request failed."
          );
        }

        return data;
      },
      [
        category,
        serviceType,
      ]
    );

  /* ==========================================================
   * LOAD PROVIDERS
   * ======================================================== */

  const loadProviders =
    useCallback(
      async () => {
        if (!serviceType) {
          return;
        }

        setLoadingProviders(
          true
        );
        setError("");

        try {
          const data =
            await invokeClubKonnect(
              "catalog"
            );

          let loaded: ProviderOption[] =
            extractArray(
              data,
              "billers",
              "networks",
              "providers"
            );

          if (
            !loaded.length
          ) {
            loaded =
              extractArray(
                data?.data,
                "billers",
                "networks",
                "providers"
              );
          }

          /*
           * Some service responses expose the
           * actual option directly under data.
           */
          if (
            !loaded.length &&
            Array.isArray(
              data?.data
            )
          ) {
            loaded =
              data.data;
          }

          const normalised =
            loaded
              .map(
                (provider: any) => {
                  const code =
                    getCode(
                      provider
                    );

                  return {
                    ...provider,
                    code,
                    id:
                      provider.id ??
                      code,
                    value:
                      provider.value ??
                      code,
                    biller_code:
                      provider.biller_code ??
                      provider.billerCode ??
                      code,
                    billerCode:
                      provider.billerCode ??
                      provider.biller_code ??
                      code,
                    network_code:
                      provider.network_code ??
                      provider.networkCode ??
                      (
                        NETWORK_NAMES[
                          code
                        ]
                          ? code
                          : ""
                      ),
                    networkCode:
                      provider.networkCode ??
                      provider.network_code ??
                      (
                        NETWORK_NAMES[
                          code
                        ]
                          ? code
                          : ""
                      ),
                    name:
                      cleanString(
                        provider.name ??
                          provider.label ??
                          provider.title ??
                          provider.short_name ??
                          provider.shortName ??
                          provider.value ??
                          provider.code ??
                          code
                      ),
                    label:
                      cleanString(
                        provider.label ??
                          provider.name ??
                          provider.title ??
                          code
                      ),
                  };
                }
              )
              .filter(
                (
                  provider
                ) =>
                  Boolean(
                    getCode(
                      provider
                    )
                  )
              );

          setProviders(
            normalised
          );

          if (
            normalised.length ===
            0
          ) {
            setError(
              "No service options are currently available."
            );
          }
        } catch (
          loadError
        ) {
          console.error(
            "Failed to load ClubKonnect providers:",
            loadError
          );

          const message =
            loadError instanceof
            Error
              ? loadError.message
              : "Unable to load service options.";

          setError(
            message
          );

          toast({
            title:
              "Unable to load services",
            description:
              message,
            variant:
              "destructive",
          });
        } finally {
          setLoadingProviders(
            false
          );
        }
      },
      [
        invokeClubKonnect,
        toast,
      ]
    );

  /* ==========================================================
   * LOAD ITEMS
   * ======================================================== */

  const loadItems =
    useCallback(
      async (
        providerCode: string
      ) => {
        if (
          !providerCode
        ) {
          setItems([]);
          return;
        }

        /*
         * Airtime and electricity are
         * amount based and therefore do not
         * need catalogue packages.
         */
        if (
          isAirtime ||
          isElectricity
        ) {
          setItems([]);
          return;
        }

        setLoadingItems(
          true
        );
        setError("");
        setItems([]);
        setSelectedItemCode("");
        setAmount("");

        try {
          const data =
            await invokeClubKonnect(
              "items",
              {
                biller_code:
                  providerCode,
                billerCode:
                  providerCode,
                network_code:
                  providerCode,
                networkCode:
                  providerCode,
              }
            );

          let loaded: CatalogItem[] =
            extractArray(
              data,
              "items",
              "plans",
              "packages"
            );

          if (
            !loaded.length
          ) {
            loaded =
              extractArray(
                data?.data,
                "items",
                "plans",
                "packages"
              );
          }

          const normalised =
            loaded
              .map(
                (item: any) => ({
                  ...item,
                  item_code:
                    getItemCode(
                      item
                    ),
                  itemCode:
                    getItemCode(
                      item
                    ),
                  code:
                    cleanString(
                      item.code ??
                        item.item_code ??
                        item.itemCode ??
                        item.package_code ??
                        item.packageCode ??
                        item.id
                    ),
                  name:
                    getItemName(
                      item
                    ),
                  selling_price:
                    getSellingPrice(
                      item
                    ),
                  price:
                    getSellingPrice(
                      item
                    ),
                })
              )
              .filter(
                (item) =>
                  Boolean(
                    getItemCode(
                      item
                    )
                  )
              );

          setItems(
            normalised
          );

          if (
            !normalised.length
          ) {
            setError(
              "No packages are currently available for this option."
            );
          }
        } catch (
          loadError
        ) {
          console.error(
            "Failed to load ClubKonnect packages:",
            loadError
          );

          const message =
            loadError instanceof
            Error
              ? loadError.message
              : "Unable to load packages.";

          setError(
            message
          );

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
        invokeClubKonnect,
        isAirtime,
        isElectricity,
        toast,
      ]
    );

  /* ==========================================================
   * INITIAL LOAD
   * ======================================================== */

  useEffect(() => {
    setCustomer("");
    setAmount("");
    setQuantity("1");
    setProfileCode("");

    setProviders([]);
    setItems([]);

    setSelectedProviderCode("");
    setSelectedItemCode("");

    setSelectedMeterType(
      "prepaid"
    );

    setCustomerVerified(
      false
    );

    setVerificationData(
      null
    );

    setDataTab(
      "HOT"
    );

    setError("");
    setShowPinPrompt(
      false
    );
    setPaymentPin("");
  }, [serviceType]);

  useEffect(() => {
    if (
      isClubKonnect
    ) {
      void loadProviders();
    }
  }, [
    isClubKonnect,
    loadProviders,
  ]);

  /* ==========================================================
   * PROVIDER SELECT
   * ======================================================== */

  const handleProviderSelect =
    async (
      provider: ProviderOption
    ) => {
      if (
        processingPayment ||
        verifyingPin
      ) {
        return;
      }

      const code =
        getCode(provider);

      if (!code) {
        return;
      }

      setSelectedProviderCode(
        code
      );

      setSelectedItemCode(
        ""
      );

      setAmount("");

      setCustomerVerified(
        false
      );

      setVerificationData(
        null
      );

      setError("");

      if (
        isAirtime ||
        isElectricity
      ) {
        return;
      }

      await loadItems(
        code
      );
    };

  /* ==========================================================
   * ITEM SELECT
   * ======================================================== */

  const handleItemSelect =
    (
      item: CatalogItem
    ) => {
      if (
        processingPayment ||
        verifyingPin
      ) {
        return;
      }

      const code =
        getItemCode(item);

      if (!code) {
        return;
      }

      setSelectedItemCode(
        code
      );

      const price =
        getSellingPrice(
          item
        );

      if (
        price > 0
      ) {
        setAmount(
          String(price)
        );
      }

      setError("");
    };

  /* ==========================================================
   * AMOUNT SELECT
   * ======================================================== */

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

  /* ==========================================================
   * CUSTOMER VERIFICATION
   * ======================================================== */

  const verifyCustomer =
    async () => {
      if (
        !selectedProviderCode
      ) {
        toast({
          title:
            "Select an option",
          description:
            isCable
              ? "Select a Cable TV service first."
              : "Select an electricity company first.",
          variant:
            "destructive",
        });

        return;
      }

      const identifier =
        customer.trim();

      if (
        identifier.length <
        5
      ) {
        toast({
          title:
            "Invalid number",
          description:
            isCable
              ? "Enter a valid SmartCard number."
              : "Enter a valid meter number.",
          variant:
            "destructive",
        });

        return;
      }

      setVerifyingCustomer(
        true
      );
      setCustomerVerified(
        false
      );
      setVerificationData(
        null
      );
      setError("");

      try {
        /*
         * The service backend owns the actual
         * provider verification. The frontend
         * only supplies the identifier and
         * selected provider.
         */
        const data =
          await invokeClubKonnect(
            "validate",
            {
              biller_code:
                selectedProviderCode,

              billerCode:
                selectedProviderCode,

              customer:
                identifier,

              smartcard_number:
                isCable
                  ? identifier
                  : undefined,

              smartcardNumber:
                isCable
                  ? identifier
                  : undefined,

              meter_number:
                isElectricity
                  ? identifier
                  : undefined,

              meterNumber:
                isElectricity
                  ? identifier
                  : undefined,

              meter_type:
                isElectricity
                  ? selectedMeterType
                  : undefined,

              meterType:
                isElectricity
                  ? selectedMeterType
                  : undefined,

              item_code:
                selectedItemCode ||
                (
                  isCable ||
                  isElectricity
                    ? `${selectedProviderCode}-${identifier}`
                    : ""
                ),
            }
          );

        setCustomerVerified(
          true
        );

        setVerificationData(
          data?.data ??
            data
        );

        toast({
          title:
            "Verification successful",
          description:
            isCable
              ? "SmartCard details have been verified."
              : "Meter details have been verified.",
        });
      } catch (
        verificationError
      ) {
        console.error(
          "Customer verification failed:",
          verificationError
        );

        const message =
          verificationError instanceof
          Error
            ? verificationError.message
            : "Unable to verify the customer details.";

        setError(
          message
        );

        toast({
          title:
            "Verification failed",
          description:
            message,
          variant:
            "destructive",
        });
      } finally {
        setVerifyingCustomer(
          false
        );
      }
    };

  /* ==========================================================
   * FORM VALIDATION
   * ======================================================== */

  const validateForm =
    (): boolean => {
      if (
        !selectedProviderCode
      ) {
        toast({
          title:
            "Select a service option",
          description:
            isCable
              ? "Select a Cable TV provider."
              : isElectricity
                ? "Select an electricity company."
                : "Select a network or service option.",
          variant:
            "destructive",
        });

        return false;
      }

      /*
       * Cable and electricity must be
       * verified before purchase.
       */
      if (
        (
          isCable ||
          isElectricity
        ) &&
        !customerVerified
      ) {
        toast({
          title:
            "Verification required",
          description:
            isCable
              ? "Verify the SmartCard number before choosing a package."
              : "Verify the meter number before entering the amount.",
          variant:
            "destructive",
        });

        return false;
      }

      /*
       * JAMB profile code.
       */
      if (
        isJamb &&
        !profileCode.trim()
      ) {
        toast({
          title:
            "Profile code required",
          description:
            "Enter the JAMB profile code.",
          variant:
            "destructive",
        });

        return false;
      }

      /*
       * Customer phone.
       */
      const requiresPhone =
        isAirtime ||
        isData ||
        isAirtimeCard ||
        isDataCard ||
        isSmile ||
        isWaec ||
        isJamb;

      if (
        requiresPhone &&
        !validNigerianPhone(
          customer
        )
      ) {
        toast({
          title:
            "Invalid phone number",
          description:
            "Enter a valid Nigerian mobile number.",
          variant:
            "destructive",
        });

        return false;
      }

      /*
       * Packages.
       */
      const requiresPackage =
        isData ||
        isCable ||
        isAirtimeCard ||
        isDataCard ||
        isSmile ||
        isWaec;

      if (
        requiresPackage &&
        !selectedItemCode
      ) {
        toast({
          title:
            "Select a package",
          description:
            "Please select a package before continuing.",
          variant:
            "destructive",
        });

        return false;
      }

      /*
       * E-PIN quantity.
       */
      if (
        isEpin &&
        (
          quantityNumber <
            1 ||
          quantityNumber >
            100
        )
      ) {
        toast({
          title:
            "Invalid quantity",
          description:
            "Quantity must be between 1 and 100.",
          variant:
            "destructive",
        });

        return false;
      }

      /*
       * Amount-based services.
       */
      if (
        isAmountBased &&
        (
          !Number.isFinite(
            amountNumber
          ) ||
          amountNumber <=
            0
        )
      ) {
        toast({
          title:
            "Invalid amount",
          description:
            isElectricity
              ? "Enter or select a valid electricity amount."
              : "Enter or select a valid airtime amount.",
          variant:
            "destructive",
        });

        return false;
      }

      if (
        isAirtime &&
        (
          amountNumber <
            50 ||
          amountNumber >
            200000
        )
      ) {
        toast({
          title:
            "Invalid airtime amount",
          description:
            "Airtime amount must be between â¦50 and â¦200,000.",
          variant:
            "destructive",
        });

        return false;
      }

      if (
        isEpin &&
        (
          selectedItemPrice <=
          0
        )
      ) {
        toast({
          title:
            "Invalid package",
          description:
            "The selected package does not have a valid price.",
          variant:
            "destructive",
        });

        return false;
      }

      /*
       * Data price must correspond to the
       * server catalogue.
       */
      if (
        isData &&
        (
          selectedItemPrice <=
          0 ||
          Math.abs(
            amountNumber -
              selectedItemPrice
          ) >
            0.01
        )
      ) {
        toast({
          title:
            "Invalid data plan",
          description:
            "Please select a valid data package again.",
          variant:
            "destructive",
        });

        return false;
      }

      if (
        totalAmount <=
        0
      ) {
        toast({
          title:
            "Invalid payment amount",
          description:
            "Please select a valid service package or amount.",
          variant:
            "destructive",
        });

        return false;
      }

      if (
        totalAmount >
        Number(
          walletBalance
        )
      ) {
        toast({
          title:
            "Insufficient Balance",
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
   * PURCHASE DETAILS
   * ======================================================== */

  const buildPurchaseDetails =
    () => {
      const normalisedPhone =
        normalizePhone(
          customer
        );

      return {
        service:
          serviceType,

        category,

        biller_code:
          selectedProviderCode,

        billerCode:
          selectedProviderCode,

        network_code:
          selectedProviderCode,

        networkCode:
          selectedProviderCode,

        item_code:
          selectedItemCode,

        itemCode:
          selectedItemCode,

        customer:
          normalisedPhone,

        phone:
          (
            isAirtime ||
            isData ||
            isAirtimeCard ||
            isDataCard ||
            isSmile ||
            isWaec ||
            isJamb
          )
            ? normalisedPhone
            : "",

        phoneNumber:
          (
            isAirtime ||
            isData ||
            isAirtimeCard ||
            isDataCard ||
            isSmile ||
            isWaec ||
            isJamb
          )
            ? normalisedPhone
            : "",

        smartcard_number:
          isCable
            ? customer.trim()
            : "",

        smartcardNumber:
          isCable
            ? customer.trim()
            : "",

        meter_number:
          isElectricity
            ? customer.trim()
            : "",

        meterNumber:
          isElectricity
            ? customer.trim()
            : "",

        meter_type:
          isElectricity
            ? selectedMeterType
            : "",

        meterType:
          isElectricity
            ? selectedMeterType
            : "",

        profile_code:
          isJamb
            ? profileCode.trim()
            : "",

        profileCode:
          isJamb
            ? profileCode.trim()
            : "",

        amount:
          amountNumber,

        selling_amount:
          totalAmount,

        sellingAmount:
          totalAmount,

        quantity:
          isEpin
            ? quantityNumber
            : 1,

        item:
          selectedItem,

        provider:
          selectedProvider,

        verification:
          verificationData,

        plan_name:
          selectedItem
            ? getItemName(
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

        plan_period:
          selectedItem
            ? cleanString(
                selectedItem.plan_period ??
                  selectedItem.planPeriod ??
                  selectedItem.period
              )
            : "",

        is_hot_deal:
          selectedItem
            ? isHotDeal(
                selectedItem
              )
            : false,

        country:
          "NG",
      };
    };

  /* ==========================================================
   * START PURCHASE
   * ======================================================== */

  const handlePurchase =
    async () => {
      if (
        !service ||
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
   * VERIFY PIN
   * ======================================================== */

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
          error:
            pinError,
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
          data.success !==
            true
        ) {
          const message =
            data?.message ||
            "Invalid payment PIN.";

          setPaymentPin("");

          toast({
            title:
              "Payment PIN",
            description:
              message,
            variant:
              "destructive",
          });

          return;
        }

        const details =
          buildPurchaseDetails();

        const finalAmount =
          totalAmount;

        setShowPinPrompt(
          false
        );

        setPaymentPin("");

        setProcessingPayment(
          true
        );

        console.log(
          "ClubKonnect service purchase:",
          {
            service:
              serviceType,

            biller_code:
              selectedProviderCode,

            item_code:
              selectedItemCode,

            amount:
              finalAmount,

            quantity:
              details.quantity,

            customer:
              details.customer,

            profile_code:
              details.profile_code,
          }
        );

        await onPurchase(
          finalAmount,
          details
        );

        resetForm();
      } catch (
        purchaseError
      ) {
        console.error(
          "Service purchase failed:",
          purchaseError
        );

        const message =
          purchaseError instanceof
          Error
            ? purchaseError.message
            : "Unable to complete this payment.";

        setError(
          message
        );

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
   * RESET
   * ======================================================== */

  const resetForm =
    () => {
      setCustomer("");
      setAmount("");
      setQuantity("1");
      setProfileCode("");

      setProviders([]);
      setItems([]);

      setSelectedProviderCode(
        ""
      );

      setSelectedItemCode(
        ""
      );

      setSelectedMeterType(
        "prepaid"
      );

      setCustomerVerified(
        false
      );

      setVerificationData(
        null
      );

      setCustomAmountMode(
        false
      );

      setShowPinPrompt(
        false
      );

      setPaymentPin("");

      setError("");

      setDataTab(
        "HOT"
      );
    };

  /* ==========================================================
   * BACK
   * ======================================================== */

  const handleBack =
    () => {
      if (
        processingPayment ||
        verifyingPin ||
        verifyingCustomer
      ) {
        return;
      }

      resetForm();
      onBack();
    };

  /* ==========================================================
   * NO SERVICE
   * ======================================================== */

  if (!service) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-slate-600">
            No payment service selected.
          </p>

          <Button
            type="button"
            onClick={onBack}
            className="mt-4 w-full rounded-xl bg-[#4C1D95] hover:bg-[#3B1677]"
          >
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  /* ==========================================================
   * PAGE
   * ======================================================== */

  return (
    <div className="min-h-screen bg-slate-50 pb-8">
      {/* HEADER */}

      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#4C1D95] text-white shadow-sm">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <div className="flex h-14 items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={
                handleBack
              }
              disabled={
                processingPayment ||
                verifyingPin
              }
              className="h-9 w-9 rounded-xl text-white hover:bg-white/10 hover:text-white"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>

            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-black sm:text-lg">
                {service.title}
              </h1>

              <p className="truncate text-[10px] text-white/65 sm:text-xs">
                Secure service payment
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                window.location.href =
                  "/history";
              }}
              disabled={
                processingPayment ||
                verifyingPin
              }
              className="rounded-lg px-2 py-1.5 text-[11px] font-bold text-white/90 hover:bg-white/10"
            >
              History
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-5 sm:px-6 sm:py-6">
        {/* =====================================================
            PIN SCREEN
            =================================================== */}

        {showPinPrompt ? (
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#6D28D9]/10">
                <ShieldCheck className="h-7 w-7 text-[#6D28D9]" />
              </div>

              <h2 className="mt-3 text-xl font-black text-slate-900">
                Confirm Payment
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Enter your 4-digit Payment PIN
                to confirm this payment.
              </p>

              <p className="mt-2 text-sm font-black text-[#4C1D95]">
                {service.title}
              </p>
            </div>

            {/* SUMMARY */}

            <div className="mt-6 space-y-3 rounded-2xl border border-[#6D28D9]/10 bg-[#6D28D9]/[0.03] p-4">
              <div className="flex items-start justify-between gap-4">
                <span className="text-sm text-slate-500">
                  Amount
                </span>

                <span className="text-base font-black text-[#4C1D95]">
                  {formatNaira(
                    totalAmount
                  )}
                </span>
              </div>

              {selectedProvider && (
                <div className="flex items-start justify-between gap-4">
                  <span className="text-sm text-slate-500">
                    Service
                  </span>

                  <span className="text-right text-sm font-bold text-slate-900">
                    {getProviderName(
                      selectedProvider
                    )}
                  </span>
                </div>
              )}

              {selectedItem && (
                <div className="flex items-start justify-between gap-4">
                  <span className="text-sm text-slate-500">
                    Package
                  </span>

                  <span className="max-w-[60%] text-right text-sm font-bold text-slate-900">
                    {getItemName(
                      selectedItem
                    )}
                  </span>
                </div>
              )}

              {isEpin && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-slate-500">
                    Quantity
                  </span>

                  <span className="text-sm font-black text-slate-900">
                    {quantityNumber}
                  </span>
                </div>
              )}

              {isJamb && (
                <div className="flex items-start justify-between gap-4">
                  <span className="text-sm text-slate-500">
                    Profile Code
                  </span>

                  <span className="text-right text-sm font-bold text-slate-900">
                    {profileCode}
                  </span>
                </div>
              )}

              <div className="flex items-start justify-between gap-4">
                <span className="text-sm text-slate-500">
                  {isCable
                    ? "SmartCard"
                    : isElectricity
                      ? "Meter"
                      : "Phone"}
                </span>

                <span className="break-all text-right text-sm font-bold text-slate-900">
                  {customer}
                </span>
              </div>
            </div>

            {/* PIN */}

            <div className="mt-6">
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
                  const value =
                    event.target.value
                      .replace(
                        /\D/g,
                        ""
                      )
                      .slice(
                        0,
                        4
                      );

                  setPaymentPin(
                    value
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
                placeholder="â¢â¢â¢â¢"
                disabled={
                  verifyingPin
                }
                autoFocus
                className="mt-2 h-12 rounded-xl text-center text-2xl tracking-[0.5em]"
              />

              <p className="mt-2 text-center text-[11px] text-slate-500">
                Your PIN is securely
                verified before the payment
                is processed.
              </p>
            </div>

            {error && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3">
                <p className="text-sm text-red-700">
                  {error}
                </p>
              </div>
            )}

            <div className="mt-5 space-y-2">
              <Button
                type="button"
                onClick={
                  handlePinVerification
                }
                disabled={
                  verifyingPin ||
                  paymentPin.length !==
                    4
                }
                className="h-12 w-full rounded-xl bg-[#4C1D95] font-bold hover:bg-[#3B1677]"
              >
                {verifyingPin ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verifying PIN...
                  </>
                ) : (
                  "Confirm Payment"
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

                  setPaymentPin(
                    ""
                  );

                  setError("");

                  setShowPinPrompt(
                    false
                  );
                }}
                disabled={
                  verifyingPin
                }
                className="h-11 w-full rounded-xl"
              >
                Back
              </Button>
            </div>
          </section>
        ) : (
          <>
            {/* =================================================
                STEP 1 â PROVIDER / NETWORK / SERVICE
                =============================================== */}

            <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#4C1D95] text-[11px] font-black text-white">
                      1
                    </span>

                    <Label className="truncate text-sm font-black text-slate-900 sm:text-base">
                      {isAirtime ||
                      isData ||
                      isAirtimeCard ||
                      isDataCard
                        ? "Choose Network"
                        : isCable
                          ? "Choose Cable TV"
                          : isElectricity
                            ? "Choose Electricity Company"
                            : isJamb
                              ? "Choose Examination Type"
                              : isWaec
                                ? "Choose Service"
                                : "Choose Service"}
                    </Label>
                  </div>

                  <p className="ml-8 mt-0.5 text-[10px] text-slate-500 sm:text-xs">
                    Select your preferred option.
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
                      verifyingPin ||
                      verifyingCustomer
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
                      Loading service options...
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
                        getCode(
                          provider
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
                            provider
                          }
                          selected={
                            code ===
                            selectedProviderCode
                          }
                          disabled={
                            processingPayment ||
                            verifyingPin ||
                            verifyingCustomer
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
                    No service options are currently available.
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

            {/* =================================================
                JAMB PROFILE CODE
                =============================================== */}

            {isJamb &&
              selectedProviderCode && (
                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#4C1D95] text-[11px] font-black text-white">
                      2
                    </span>

                    <div>
                      <Label
                        htmlFor="jambProfileCode"
                        className="text-sm font-black text-slate-900 sm:text-base"
                      >
                        JAMB Profile Code
                      </Label>

                      <p className="text-[10px] text-slate-500 sm:text-xs">
                        Enter the profile code linked to your examination.
                      </p>
                    </div>
                  </div>

                  <Input
                    id="jambProfileCode"
                    value={
                      profileCode
                    }
                    onChange={(
                      event
                    ) => {
                      setProfileCode(
                        event.target.value
                      );
                      setError("");
                    }}
                    placeholder="Enter JAMB profile code"
                    disabled={
                      processingPayment ||
                      verifyingPin
                    }
                    className="h-12 rounded-xl border-slate-200"
                  />
                </section>
              )}

            {/* =================================================
                CUSTOMER IDENTIFIER
                =============================================== */}

            {selectedProviderCode &&
              !(
                isEpin
              ) && (
                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#4C1D95] text-[11px] font-black text-white">
                      {isJamb
                        ? "3"
                        : "2"}
                    </span>

                    <div>
                      <Label
                        htmlFor="serviceCustomer"
                        className="text-sm font-black text-slate-900 sm:text-base"
                      >
                        {customerLabel}
                      </Label>

                      <p className="text-[10px] text-slate-500 sm:text-xs">
                        {isCable
                          ? "Enter and verify your SmartCard number."
                          : isElectricity
                            ? "Enter and verify your meter number."
                            : "Enter the customer details for this service."}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2">
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

                        setCustomerVerified(
                          false
                        );

                        setVerificationData(
                          null
                        );

                        setError("");
                      }}
                      placeholder={
                        customerPlaceholder
                      }
                      disabled={
                        processingPayment ||
                        verifyingPin ||
                        verifyingCustomer
                      }
                      inputMode={
                        isCable ||
                        isElectricity ||
                        isAirtime ||
                        isData ||
                        isAirtimeCard ||
                        isDataCard ||
                        isJamb ||
                        isWaec ||
                        isSmile
                          ? "numeric"
                          : "text"
                      }
                      className="h-12 min-w-0 flex-1 rounded-xl border-slate-200"
                    />

                    {(
                      isCable ||
                      isElectricity
                    ) && (
                      <Button
                        type="button"
                        onClick={() =>
                          void verifyCustomer()
                        }
                        disabled={
                          verifyingCustomer ||
                          processingPayment ||
                          verifyingPin ||
                          customer.trim().length <
                            5
                        }
                        className="h-12 shrink-0 rounded-xl bg-[#4C1D95] px-4 font-bold hover:bg-[#3B1677]"
                      >
                        {verifyingCustomer ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : customerVerified ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          "Verify"
                        )}
                      </Button>
                    )}
                  </div>

                  {customerVerified && (
                    <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2">
                      <Check className="h-4 w-4 text-emerald-600" />

                      <span className="text-xs font-bold text-emerald-700">
                        {isCable
                          ? "SmartCard verified"
                          : "Meter verified"}
                      </span>
                    </div>
                  )}

                  {selectedProvider && (
                    <div className="mt-3 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
                      <Check className="h-4 w-4 text-emerald-600" />

                      <span className="text-[11px] font-medium text-slate-500">
                        Selected:
                      </span>

                      <span className="truncate text-[11px] font-black text-[#4C1D95]">
                        {getProviderName(
                          selectedProvider
                        )}
                      </span>
                    </div>
                  )}
                </section>
              )}

            {/* =================================================
                E-PIN CUSTOMER PHONE
                =============================================== */}

            {selectedProviderCode &&
              isEpin && (
                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#4C1D95] text-[11px] font-black text-white">
                      2
                    </span>

                    <div>
                      <Label
                        htmlFor="epinPhone"
                        className="text-sm font-black text-slate-900"
                      >
                        Phone Number
                      </Label>

                      <p className="text-[10px] text-slate-500">
                        Enter the number associated with the E-PIN order.
                      </p>
                    </div>
                  </div>

                  <Input
                    id="epinPhone"
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
                    placeholder="e.g. 08012345678"
                    inputMode="numeric"
                    disabled={
                      processingPayment ||
                      verifyingPin
                    }
                    className="h-12 rounded-xl border-slate-200"
                  />
                </section>
              )}

            {/* =================================================
                DATA PLANS
                =============================================== */}

            {isData &&
              selectedProviderCode && (
                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#4C1D95] text-[11px] font-black text-white">
                          4
                        </span>

                        <Label className="text-sm font-black text-slate-900 sm:text-base">
                          Choose Data Package
                        </Label>
                      </div>

                      <p className="ml-8 mt-0.5 text-[10px] text-slate-500 sm:text-xs">
                        Select the package you want.
                      </p>
                    </div>

                    {loadingItems && (
                      <Loader2 className="h-4 w-4 animate-spin text-[#6D28D9]" />
                    )}
                  </div>

                  <div className="flex max-w-full gap-2 overflow-x-auto pb-2">
                    {DATA_TABS.map(
                      (tab) => {
                        const count =
                          dataGroups[
                            tab
                          ].length;

                        return (
                          <button
                            key={
                              tab
                            }
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
                              "shrink-0 whitespace-nowrap rounded-full border px-3 py-2 text-[10px] font-bold transition-all",
                              dataTab ===
                              tab
                                ? "border-[#4C1D95] bg-[#4C1D95] text-white"
                                : "border-slate-200 bg-white text-slate-600 hover:border-[#6D28D9]/30",
                            ].join(
                              " "
                            )}
                          >
                            {tab ===
                              "HOT" && (
                              <Flame className="mr-1 inline h-3 w-3" />
                            )}

                            {tab ===
                            "EXTRA NIGHT"
                              ? "Extra Night"
                              : tab}

                            <span className="ml-1 opacity-70">
                              ({count})
                            </span>
                          </button>
                        );
                      }
                    )}
                  </div>

                  {loadingItems ? (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {[1, 2, 3].map(
                        (
                          value
                        ) => (
                          <div
                            key={
                              value
                            }
                            className="h-28 animate-pulse rounded-2xl bg-slate-100"
                          />
                        )
                      )}
                    </div>
                  ) : visibleDataPlans.length ? (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {visibleDataPlans.map(
                        (
                          item,
                          index
                        ) => (
                          <DataPlanCard
                            key={`${getItemCode(item)}-${index}`}
                            item={
                              item
                            }
                            selected={
                              getItemCode(
                                item
                              ) ===
                              selectedItemCode
                            }
                            disabled={
                              processingPayment ||
                              verifyingPin
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
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
                      <p className="text-xs text-slate-500">
                        {dataTab ===
                        "HOT"
                          ? "No hot deals are currently available."
                          : "No data packages are currently available in this category."}
                      </p>
                    </div>
                  )}
                </section>
              )}

            {/* =================================================
                CABLE PACKAGES
                =============================================== */}

            {isCable &&
              selectedProviderCode &&
              customerVerified && (
                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="mb-4 flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#4C1D95] text-[11px] font-black text-white">
                      3
                    </span>

                    <div>
                      <Label className="text-sm font-black text-slate-900 sm:text-base">
                        Choose Package
                      </Label>

                      <p className="text-[10px] text-slate-500 sm:text-xs">
                        Select your TV subscription package.
                      </p>
                    </div>
                  </div>

                  {loadingItems ? (
                    <div className="flex min-h-[100px] items-center justify-center">
                      <Loader2 className="h-5 w-5 animate-spin text-[#6D28D9]" />
                    </div>
                  ) : items.length ? (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {items.map(
                        (
                          item,
                          index
                        ) => (
                          <PackageCard
                            key={`${getItemCode(item)}-${index}`}
                            item={
                              item
                            }
                            selected={
                              getItemCode(
                                item
                              ) ===
                              selectedItemCode
                            }
                            disabled={
                              processingPayment ||
                              verifyingPin
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
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
                      <p className="text-xs text-slate-500">
                        No packages are currently available.
                      </p>
                    </div>
                  )}
                </section>
              )}

            {/* =================================================
                E-PIN PACKAGES
                ================================================= */}

            {isEpin &&
              selectedProviderCode && (
                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="mb-4 flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#4C1D95] text-[11px] font-black text-white">
                      3
                    </span>

                    <div>
                      <Label className="text-sm font-black text-slate-900 sm:text-base">
                        Packages / Denomination
                      </Label>

                      <p className="text-[10px] text-slate-500 sm:text-xs">
                        Choose the E-PIN package you want.
                      </p>
                    </div>
                  </div>

                  {loadingItems ? (
                    <div className="flex min-h-[100px] items-center justify-center">
                      <Loader2 className="h-5 w-5 animate-spin text-[#6D28D9]" />
                    </div>
                  ) : items.length ? (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {items.map(
                        (
                          item,
                          index
                        ) => (
                          <PackageCard
                            key={`${getItemCode(item)}-${index}`}
                            item={
                              item
                            }
                            selected={
                              getItemCode(
                                item
                              ) ===
                              selectedItemCode
                            }
                            disabled={
                              processingPayment ||
                              verifyingPin
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
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
                      <p className="text-xs text-slate-500">
                        No E-PIN packages are currently available.
                      </p>
                    </div>
                  )}

                  {selectedItem && (
                    <div className="mt-4 rounded-xl border border-[#6D28D9]/10 bg-[#6D28D9]/[0.03] p-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-medium text-slate-500">
                          Selected package
                        </span>

                        <span className="text-right text-xs font-black text-[#4C1D95]">
                          {getItemName(
                            selectedItem
                          )}
                        </span>
                      </div>

                      <div className="mt-2 flex items-center justify-between gap-3">
                        <span className="text-xs font-medium text-slate-500">
                          Price per PIN
                        </span>

                        <span className="text-sm font-black text-[#4C1D95]">
                          {formatNaira(
                            selectedItemPrice
                          )}
                        </span>
                      </div>
                    </div>
                  )}
                </section>
              )}

            {/* =================================================
                E-PIN QUANTITY
                =============================================== */}

            {isEpin &&
              selectedItem && (
                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#4C1D95] text-[11px] font-black text-white">
                      4
                    </span>

                    <div>
                      <Label
                        htmlFor="epinQuantity"
                        className="text-sm font-black text-slate-900"
                      >
                        Quantity
                      </Label>

                      <p className="text-[10px] text-slate-500 sm:text-xs">
                        Choose between 1 and 100 PINs.
                      </p>
                    </div>
                  </div>

                  <Input
                    id="epinQuantity"
                    type="number"
                    min={1}
                    max={100}
                    step={1}
                    inputMode="numeric"
                    value={
                      quantity
                    }
                    onChange={(
                      event
                    ) => {
                      const raw =
                        event.target.value;

                      if (
                        raw === ""
                      ) {
                        setQuantity(
                          ""
                        );
                        return;
                      }

                      const parsed =
                        Number(
                          raw
                        );

                      if (
                        Number.isFinite(
                          parsed
                        )
                      ) {
                        setQuantity(
                          String(
                            Math.max(
                              1,
                              Math.min(
                                100,
                                Math.floor(
                                  parsed
                                )
                              )
                            )
                          )
                        );
                      }
                    }}
                    disabled={
                      processingPayment ||
                      verifyingPin
                    }
                    className="h-12 rounded-xl"
                  />

                  <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                    <span className="text-xs text-slate-500">
                      Total
                    </span>

                    <span className="text-base font-black text-[#4C1D95]">
                      {formatNaira(
                        totalAmount
                      )}
                    </span>
                  </div>
                </section>
              )}

            {/* =================================================
                JAMB PHONE
                =============================================== */}

            {isJamb &&
              selectedProviderCode && (
                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#4C1D95] text-[11px] font-black text-white">
                      3
                    </span>

                    <div>
                      <Label
                        htmlFor="jambPhone"
                        className="text-sm font-black text-slate-900"
                      >
                        Phone Number
                      </Label>

                      <p className="text-[10px] text-slate-500">
                        Enter the phone number associated with the JAMB profile.
                      </p>
                    </div>
                  </div>

                  <Input
                    id="jambPhone"
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
                    placeholder="e.g. 08012345678"
                    inputMode="numeric"
                    disabled={
                      processingPayment ||
                      verifyingPin
                    }
                    className="h-12 rounded-xl"
                  />
                </section>
              )}

            {/* =================================================
                WAEC / SMILE PACKAGE
                =============================================== */}

            {(
              isWaec ||
              isSmile
            ) &&
              selectedProviderCode && (
                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="mb-4 flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#4C1D95] text-[11px] font-black text-white">
                      3
                    </span>

                    <div>
                      <Label className="text-sm font-black text-slate-900 sm:text-base">
                        Choose Package
                      </Label>

                      <p className="text-[10px] text-slate-500 sm:text-xs">
                        Select the package you want.
                      </p>
                    </div>
                  </div>

                  {loadingItems ? (
                    <div className="flex min-h-[100px] items-center justify-center">
                      <Loader2 className="h-5 w-5 animate-spin text-[#6D28D9]" />
                    </div>
                  ) : items.length ? (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {items.map(
                        (
                          item,
                          index
                        ) => (
                          <PackageCard
                            key={`${getItemCode(item)}-${index}`}
                            item={
                              item
                            }
                            selected={
                              getItemCode(
                                item
                              ) ===
                              selectedItemCode
                            }
                            disabled={
                              processingPayment ||
                              verifyingPin
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
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
                      <p className="text-xs text-slate-500">
                        No packages are currently available.
                      </p>
                    </div>
                  )}
                </section>
              )}

            {/* =================================================
                ELECTRICITY METER TYPE
                =============================================== */}

            {isElectricity &&
              selectedProviderCode && (
                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#4C1D95] text-[11px] font-black text-white">
                      2
                    </span>

                    <div>
                      <Label className="text-sm font-black text-slate-900">
                        Meter Type
                      </Label>

                      <p className="text-[10px] text-slate-500">
                        Select the meter type before verification.
                      </p>
                    </div>
                  </div>

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
                      (
                        option
                      ) => (
                        <button
                          key={
                            option.value
                          }
                          type="button"
                          onClick={() => {
                            setSelectedMeterType(
                              option.value
                            );

                            setCustomerVerified(
                              false
                            );

                            setVerificationData(
                              null
                            );
                          }}
                          disabled={
                            processingPayment ||
                            verifyingPin ||
                            verifyingCustomer
                          }
                          className={[
                            "rounded-xl border px-3 py-3 text-sm font-bold transition-all",
                            selectedMeterType ===
                            option.value
                              ? "border-[#6D28D9] bg-[#6D28D9]/5 text-[#4C1D95] ring-1 ring-[#6D28D9]/10"
                              : "border-slate-200 text-slate-600",
                          ].join(
                            " "
                          )}
                        >
                          {option.label}
                        </button>
                      )
                    )}
                  </div>
                </section>
              )}

            {/* =================================================
                ELECTRICITY AMOUNT
                =============================================== */}

            {isElectricity &&
              selectedProviderCode &&
              customerVerified && (
                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="mb-4 flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#4C1D95] text-[11px] font-black text-white">
                      3
                    </span>

                    <div>
                      <Label className="text-sm font-black text-slate-900 sm:text-base">
                        Choose Amount
                      </Label>

                      <p className="text-[10px] text-slate-500 sm:text-xs">
                        Enter the amount you want to purchase.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {ELECTRICITY_AMOUNTS.map(
                      (
                        value
                      ) => (
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
                            "rounded-xl border p-3 text-sm font-bold transition-all",
                            amount ===
                            String(
                              value
                            )
                              ? "border-[#6D28D9] bg-[#6D28D9]/5 text-[#4C1D95] ring-1 ring-[#6D28D9]/10"
                              : "border-slate-200 text-slate-700 hover:border-[#6D28D9]/30",
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
                      onClick={() => {
                        setCustomAmountMode(
                          true
                        );
                        setAmount(
                          ""
                        );
                      }}
                      disabled={
                        processingPayment ||
                        verifyingPin
                      }
                      className={[
                        "rounded-xl border p-3 text-sm font-bold transition-all",
                        customAmountMode
                          ? "border-[#6D28D9] bg-[#6D28D9]/5 text-[#4C1D95] ring-1 ring-[#6D28D9]/10"
                          : "border-slate-200 text-slate-700 hover:border-[#6D28D9]/30",
                      ].join(
                        " "
                      )}
                    >
                      Enter Amount
                    </button>
                  </div>

                  {customAmountMode && (
                    <Input
                      type="number"
                      min="1"
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
                      className="mt-3 h-12 rounded-xl"
                    />
                  )}
                </section>
              )}

            {/* =================================================
                AIRTIME AMOUNT
                =============================================== */}

            {isAirtime &&
              selectedProviderCode && (
                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="mb-4 flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#4C1D95] text-[11px] font-black text-white">
                      3
                    </span>

                    <div>
                      <Label className="text-sm font-black text-slate-900 sm:text-base">
                        Choose Airtime Amount
                      </Label>

                      <p className="text-[10px] text-slate-500 sm:text-xs">
                        Select an amount or enter your own.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {AIRTIME_AMOUNTS.map(
                      (
                        value
                      ) => (
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
                            "rounded-xl border p-3 text-sm font-bold transition-all",
                            amount ===
                            String(
                              value
                            )
                              ? "border-[#6D28D9] bg-[#6D28D9]/5 text-[#4C1D95] ring-1 ring-[#6D28D9]/10"
                              : "border-slate-200 text-slate-700 hover:border-[#6D28D9]/30",
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
                      onClick={() => {
                        setCustomAmountMode(
                          true
                        );
                        setAmount(
                          ""
                        );
                      }}
                      disabled={
                        processingPayment ||
                        verifyingPin
                      }
                      className={[
                        "rounded-xl border p-3 text-sm font-bold transition-all",
                        customAmountMode
                          ? "border-[#6D28D9] bg-[#6D28D9]/5 text-[#4C1D95] ring-1 ring-[#6D28D9]/10"
                          : "border-slate-200 text-slate-700 hover:border-[#6D28D9]/30",
                      ].join(
                        " "
                      )}
                    >
                      Enter Amount
                    </button>
                  </div>

                  {customAmountMode && (
                    <Input
                      type="number"
                      min="50"
                      max="200000"
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
                      placeholder="Enter exact airtime amount"
                      disabled={
                        processingPayment ||
                        verifyingPin
                      }
                      autoFocus
                      className="mt-3 h-12 rounded-xl"
                    />
                  )}
                </section>
              )}

            {/* =================================================
                FINAL PHONE FOR AIRTIME / DATA / WAEC / SMILE
                ================================================= */}

            {selectedProviderCode &&
              (
                isAirtime ||
                isData ||
                isWaec ||
                isSmile
              ) && (
                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#4C1D95] text-[11px] font-black text-white">
                      {isAirtime ||
                      isData
                        ? "4"
                        : "4"}
                    </span>

                    <div>
                      <Label
                        htmlFor="servicePhone"
                        className="text-sm font-black text-slate-900"
                      >
                        Phone Number
                      </Label>

                      <p className="text-[10px] text-slate-500">
                        Enter the Nigerian mobile number.
                      </p>
                    </div>
                  </div>

                  <Input
                    id="servicePhone"
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
                    placeholder="e.g. 08012345678"
                    inputMode="numeric"
                    disabled={
                      processingPayment ||
                      verifyingPin
                    }
                    className="h-12 rounded-xl"
                  />
                </section>
              )}

            {/* =================================================
                ERROR
                =============================================== */}

            {error && (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-3.5">
                <p className="text-sm font-medium text-red-700">
                  {error}
                </p>
              </div>
            )}

            {/* =================================================
                PAYMENT SUMMARY
                =============================================== */}

            {(
              selectedItem ||
              amountNumber >
                0
            ) && (
              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-medium text-slate-500">
                      Total to pay
                    </p>

                    <p className="mt-1 text-xl font-black text-[#4C1D95]">
                      {formatNaira(
                        totalAmount
                      )}
                    </p>
                  </div>

                  {isEpin && (
                    <div className="text-right">
                      <p className="text-[10px] text-slate-500">
                        Quantity
                      </p>

                      <p className="text-sm font-black text-slate-900">
                        {quantityNumber}
                      </p>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* =================================================
                PURCHASE BUTTON
                =============================================== */}

            <Button
              type="button"
              onClick={
                handlePurchase
              }
              disabled={
                loadingProviders ||
                loadingItems ||
                verifyingCustomer ||
                processingPayment ||
                verifyingPin ||
                !selectedProviderCode ||
                (
                  (
                    isData ||
                    isCable ||
                    isAirtimeCard ||
                    isDataCard ||
                    isSmile ||
                    isWaec
                  ) &&
                  !selectedItemCode
                ) ||
                (
                  isCable ||
                  isElectricity
                ) &&
                !customerVerified ||
                (
                  isJamb &&
                  !profileCode.trim()
                ) ||
                !customer.trim() ||
                totalAmount <=
                  0
              }
              className="h-12 w-full rounded-xl bg-[#4C1D95] text-sm font-black hover:bg-[#3B1677]"
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

            <p className="text-center text-[10px] leading-5 text-slate-400">
              Your payment is securely
              processed from your IyanjuPay
              wallet.
            </p>
          </>
        )}
      </main>
    </div>
  );
};

export default ServicePayment;
