import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ArrowLeft,
  Loader2,
  RefreshCw,
  Flame,
  GraduationCap,
  Ticket,
  Database,
  Plus,
  Minus,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

// ============================================================
// TYPES
// ============================================================

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
  biller_code?: string;
  category?: string;
  country?: string;
  country_code?: string;
  logo?: string | null;
  logo_url?: string | null;
  logoUrl?: string | null;
  description?: string;
  short_name?: string;
  code?: string;

  [key: string]: any;
}

interface BillItem {
  id?: number | string;

  biller_code?: string;
  item_code?: string;

  name?: string;
  short_name?: string;
  biller_name?: string;

  amount?: number | string;
  selling_price?: number | string;
  provider_amount?: number | string;

  minimum?: number | string;
  maximum?: number | string;
  fee?: number | string;

  label_name?: string;
  label_name_2?: string;

  validity?: string | number;
  validity_days?: number | string;
  duration?: string | number;

  description?: string;

  is_airtime?: boolean;
  country?: string;

  data_plan?: string;
  network_code?: string;

  plan_period?: string;
  plan_type?: string;

  is_hot_deal?: boolean;

  provider?: string;
  provider_id?: string;

  [key: string]: any;
}

// ============================================================
// SERVICE TYPES
// ============================================================

type ServiceType =
  | "airtime"
  | "data"
  | "electricity"
  | "cable"
  | "internet"
  | "insurance"
  | "education"
  | "airtime-card"
  | "data-card";

// ============================================================
// CONSTANTS
// ============================================================

/**
 * These are customer-facing service categories.
 *
 * They are deliberately not provider names.
 */
const SERVICE_CATEGORY_MAP: Record<
  string,
  string
> = {
  airtime: "AIRTIME",
  data: "MOBILEDATA",
  electricity: "UTILITYBILLS",
  cable: "CABLEBILLS",
  internet: "INTSERVICE",
  insurance: "INSURANCE",
  education: "EDUCATION",
  "airtime-card": "AIRTIMEPIN",
  "data-card": "DATAPIN",
};

const CLUBKONNECT_SERVICES = new Set<
  string
>([
  "data",
  "education",
  "airtime-card",
  "data-card",
]);

const AMOUNT_BASED_SERVICES = new Set<
  string
>([
  "airtime",
  "electricity",
]);

const PHONE_SERVICES = new Set<
  string
>([
  "airtime",
  "data",
  "education",
]);

const QUANTITY_SERVICES = new Set<
  string
>([
  "airtime-card",
  "data-card",
]);

const DATA_TABS = [
  "HOT DEALS",
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "OTHER",
] as const;

type DataTab =
  (typeof DATA_TABS)[number];

const AIRTIME_AMOUNTS = [
  50,
  100,
  200,
  500,
  1000,
];

const BILL_AMOUNTS = [
  50,
  100,
  200,
  500,
  1000,
];

const EDUCATION_BILLERS = [
  "waec",
  "jamb",
];

// ============================================================
// HELPERS
// ============================================================

function cleanString(
  value: unknown
): string {
  return String(
    value ?? ""
  ).trim();
}

function numberValue(
  value: unknown
): number {
  const n =
    Number(value);

  return Number.isFinite(n)
    ? n
    : 0;
}

function formatNaira(
  value: number
): string {
  return `₦${Number(
    value
  ).toLocaleString(
    "en-NG"
  )}`;
}

function isTrueFlag(
  value: unknown
): boolean {
  if (value === true) {
    return true;
  }

  if (
    typeof value ===
    "number"
  ) {
    return value === 1;
  }

  if (
    typeof value ===
    "string"
  ) {
    const normalized =
      value
        .trim()
        .toLowerCase();

    return (
      normalized ===
        "true" ||
      normalized ===
        "1" ||
      normalized ===
        "yes"
    );
  }

  return false;
}

function isClubKonnectService(
  serviceType: string
): boolean {
  return CLUBKONNECT_SERVICES.has(
    serviceType
  );
}

function isAmountOnlyService(
  serviceType: string
): boolean {
  return AMOUNT_BASED_SERVICES.has(
    serviceType
  );
}

function requiresPhone(
  serviceType: string
): boolean {
  return PHONE_SERVICES.has(
    serviceType
  );
}

function requiresQuantity(
  serviceType: string
): boolean {
  return QUANTITY_SERVICES.has(
    serviceType
  );
}

// ============================================================
// PROVIDER DISPLAY FILTER
// ============================================================

const NON_PROVIDER_LABELS =
  new Set([
    "mobilenetwork",
    "mobilenetworks",
    "mobilenetworkservice",
    "mobiledata",
    "airtime",
    "cabletv",
    "cablebills",
    "internet",
    "internetservice",
    "intservice",
    "electricity",
    "utilitybills",
    "utilitybill",
    "education",
    "airtimepin",
    "datapin",
  ]);

function isActualProvider(
  value: unknown
): boolean {
  const key =
    cleanString(value)
      .toLowerCase()
      .replace(
        /[^a-z0-9]+/g,
        ""
      );

  return (
    Boolean(key) &&
    !NON_PROVIDER_LABELS.has(
      key
    )
  );
}

// ============================================================
// DATA GROUPING
// ============================================================

function getDataGroup(
  item: BillItem
):
  | "Daily"
  | "Weekly"
  | "Monthly"
  | "Other" {
  const explicitValues = [
    item.plan_period,
    (item as any)
      .planPeriod,
    (item as any)
      .period,
    (item as any)
      .period_name,
    (item as any)
      .periodName,
    (item as any)
      .validity_period,
    (item as any)
      .validityPeriod,
    (item as any)
      .duration_unit,
    (item as any)
      .durationUnit,
    (item as any)
      .group_name,
    (item as any)
      .groupName,
    (item as any)
      .group,
    (item as any)
      .category,
  ]
    .filter(
      (
        value
      ) =>
        value !==
          undefined &&
        value !==
          null
    )
    .map(
      (
        value
      ) =>
        cleanString(
          value
        ).toLowerCase()
    )
    .filter(
      Boolean
    );

  for (
    const value of
      explicitValues
  ) {
    if (
      value ===
        "monthly" ||
      value.includes(
        "month"
      )
    ) {
      return "Monthly";
    }

    if (
      value ===
        "weekly" ||
      value.includes(
        "week"
      )
    ) {
      return "Weekly";
    }

    if (
      value ===
        "daily" ||
      value.includes(
        "day"
      )
    ) {
      return "Daily";
    }
  }

  const text = [
    item.name,
    item.short_name,
    item.description,
    item.validity,
    item.validity_days,
    item.duration,
    item.plan_type,
    (item as any)
      .plan,
    (item as any)
      .plan_name,
    (item as any)
      .planName,
    ...explicitValues,
  ]
    .filter(
      (
        value
      ) =>
        value !==
          undefined &&
        value !==
          null
    )
    .join(" ")
    .toLowerCase();

  if (
    /\b(30|31)\s*(day|days)\b/.test(
      text
    ) ||
    /\bmonthly\b/.test(
      text
    ) ||
    /\b[1-3]\s*months?\b/.test(
      text
    )
  ) {
    return "Monthly";
  }

  if (
    /\b(7|14)\s*(day|days)\b/.test(
      text
    ) ||
    /\bweekly\b/.test(
      text
    ) ||
    /\b[1-2]\s*weeks?\b/.test(
      text
    )
  ) {
    return "Weekly";
  }

  if (
    /\b(1|2|3)\s*(day|days)\b/.test(
      text
    ) ||
    /\bdaily\b/.test(
      text
    ) ||
    /\b24\s*hours?\b/.test(
      text
    )
  ) {
    return "Daily";
  }

  return "Other";
}

function isHotDeal(
  item: BillItem
): boolean {
  if (
    isTrueFlag(
      item.is_hot_deal
    )
  ) {
    return true;
  }

  const text = [
    item.name,
    item.short_name,
    item.description,
    item.plan_type,
    (item as any)
      .plan,
    (item as any)
      .plan_name,
    (item as any)
      .planName,
    (item as any)
      .bundle,
    (item as any)
      .Bundle,
    (item as any)
      .category,
    (item as any)
      .data_type,
    (item as any)
      .dataType,
  ]
    .filter(
      (
        value
      ) =>
        value !==
          undefined &&
        value !==
          null
    )
    .join(" ")
    .toLowerCase();

  return (
    /\bsme\b/.test(
      text
    ) ||
    /hot\s*deal/.test(
      text
    ) ||
    /hotdeal/.test(
      text
    )
  );
}

function getPlanType(
  item: BillItem
): string {
  const explicit =
    cleanString(
      item.plan_type
    );

  if (explicit) {
    return explicit;
  }

  return isHotDeal(
    item
  )
    ? "SME"
    : "REGULAR";
}

function isVariableItem(
  item: BillItem
): boolean {
  const code =
    cleanString(
      item.item_code
    ).toLowerCase();

  const name =
    cleanString(
      item.name ??
        item.short_name ??
        item.description
    ).toLowerCase();

  return (
    code ===
      "__variable__" ||
    code ===
      "variable" ||
    code ===
      "variable_amount" ||
    /variable\s*amount/.test(
      name
    ) ||
    /enter\s*amount/.test(
      name
    ) ||
    /any\s*amount/.test(
      name
    )
  );
}

// ============================================================
// PROVIDER LOGOS
// ============================================================

const PROVIDER_LOGOS:
  Record<string, string> = {
    mtn:
      "https://upload.wikimedia.org/wikipedia/commons/a/af/MTN_Logo.svg",

    glo:
      "https://upload.wikimedia.org/wikipedia/commons/8/86/GloLogo.png",

    airtel:
      "https://upload.wikimedia.org/wikipedia/commons/f/fb/Bharti_Airtel_Logo.svg",

    "9mobile":
      "https://images.seeklogo.com/logo-png/48/1/9mobile-logo-png_seeklogo-481168.png",

    dstv:
      "https://res.cloudinary.com/paybeta/image/upload/v1714827633/Provider/Cable/dstv.jpg",

    gotv:
      "https://res.cloudinary.com/paybeta/image/upload/v1714828100/Provider/Cable/gotv.png",

    startimes:
      "https://res.cloudinary.com/paybeta/image/upload/v1714827913/Provider/Cable/startimes.jpg",

    showmax:
      "https://commons.wikimedia.org/wiki/Special:Redirect/file/Showmax_Logo.svg",

    smile:
      "https://cdn.jsdelivr.net/gh/PaystackHQ/nigerialogos@master/public/logos/smile/smile.svg",

    spectranet:
      "https://cdn.jsdelivr.net/gh/PaystackHQ/nigerialogos@master/public/logos/spectranet/spectranet.svg",

    ipnx:
      "https://cdn.jsdelivr.net/gh/PaystackHQ/nigerialogos@master/public/logos/ipnx/ipnx.svg",

    ntel:
      "https://cdn.jsdelivr.net/gh/PaystackHQ/nigerialogos@master/public/logos/ntel/ntel.svg",
  };

function normaliseProviderKey(
  value: unknown
): string {
  return cleanString(
    value
  )
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      ""
    );
}

function getProviderLogo(
  provider: Biller
): string | null {
  const backendLogo =
    cleanString(
      provider.logo ??
        provider.logo_url ??
        provider.logoUrl
    );

  if (backendLogo) {
    try {
      const url =
        new URL(
          backendLogo
        );

      if (
        url.hostname !==
          "cdn.simpleicons.org" &&
        (
          url.protocol ===
            "https:" ||
          url.protocol ===
            "http:"
        )
      ) {
        return url.toString();
      }
    } catch {
      // Continue to name-based mapping.
    }
  }

  const key =
    normaliseProviderKey(
      [
        provider.short_name,
        provider.name,
        provider.code,
      ]
        .filter(
          Boolean
        )
        .join(" ")
    );

  if (
    key.includes("mtn")
  ) {
    return PROVIDER_LOGOS.mtn;
  }

  if (
    key.includes("glo") ||
    key.includes(
      "globacom"
    )
  ) {
    return PROVIDER_LOGOS.glo;
  }

  if (
    key.includes("airtel")
  ) {
    return PROVIDER_LOGOS.airtel;
  }

  if (
    key.includes("9mobile") ||
    key.includes(
      "etisalat"
    )
  ) {
    return PROVIDER_LOGOS[
      "9mobile"
    ];
  }

  if (
    key.includes("dstv") ||
    key.includes(
      "multichoice"
    )
  ) {
    return PROVIDER_LOGOS.dstv;
  }

  if (
    key.includes("gotv")
  ) {
    return PROVIDER_LOGOS.gotv;
  }

  if (
    key.includes(
      "startimes"
    ) ||
    key.includes(
      "startime"
    )
  ) {
    return PROVIDER_LOGOS.startimes;
  }

  if (
    key.includes(
      "showmax"
    )
  ) {
    return PROVIDER_LOGOS.showmax;
  }

  if (
    key.includes("smile")
  ) {
    return PROVIDER_LOGOS.smile;
  }

  if (
    key.includes(
      "spectranet"
    )
  ) {
    return PROVIDER_LOGOS.spectranet;
  }

  if (
    key.includes("ipnx")
  ) {
    return PROVIDER_LOGOS.ipnx;
  }

  if (
    key.includes("ntel")
  ) {
    return PROVIDER_LOGOS.ntel;
  }

  return null;
}

function getProviderDisplayName(
  provider: Biller
): string {
  return cleanString(
    provider.short_name ??
      provider.name ??
      provider.code ??
      "Provider"
  );
}

// ============================================================
// PROVIDER CARD
// ============================================================

function ProviderCard({
  provider,
  selected,
  disabled,
  onClick,
}: {
  provider: Biller;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const logo =
    getProviderLogo(
      provider
    );

  const name =
    getProviderDisplayName(
      provider
    );

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={name}
      aria-label={`Select ${name}`}
      className={[
        "relative w-full min-w-0 overflow-hidden rounded-2xl border bg-white p-2.5 transition-all",
        "hover:-translate-y-0.5 hover:border-[#082A63]/40 hover:shadow-sm",
        selected
          ? "border-[#082A63] bg-[#082A63]/[0.03] ring-2 ring-[#082A63]/10"
          : "border-slate-200",
        disabled
          ? "cursor-not-allowed opacity-60"
          : "",
      ].join(" ")}
    >
      {selected && (
        <span className="absolute right-1.5 top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-[#082A63] text-white">
          <span className="text-[10px] font-black">
            ✓
          </span>
        </span>
      )}

      <div className="mx-auto flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border border-slate-100 bg-white shadow-sm sm:h-14 sm:w-14">
        {logo ? (
          <img
            src={logo}
            alt=""
            aria-hidden="true"
            className="h-8 w-8 object-contain sm:h-9 sm:w-9"
            loading="eager"
            referrerPolicy="no-referrer"
            onError={(
              event
            ) => {
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
          className="items-center justify-center text-sm font-extrabold text-[#082A63]"
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

      <p className="mt-2 truncate text-center text-[11px] font-bold text-slate-700 sm:text-xs">
        {name}
      </p>
    </button>
  );
}

// ============================================================
// DATA PLAN CARD
// ============================================================

function DataPlanCard({
  item,
  selected,
  onClick,
  disabled,
}: {
  item: BillItem;
  selected: boolean;
  onClick: () => void;
  disabled: boolean;
}) {
  const hot =
    isHotDeal(item);

  const price =
    numberValue(
      item.selling_price ??
        item.amount ??
        item.provider_amount
    );

  const name =
    cleanString(
      item.name ??
        item.short_name ??
        item.data_plan ??
        "Data Plan"
    );

  const duration =
    cleanString(
      item.validity ??
        item.validity_days ??
        item.duration ??
        item.plan_period
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
          ? "border-[#082A63] ring-2 ring-[#082A63]/10"
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

        {duration && (
          <p className="mt-1 truncate text-xs text-slate-500">
            {duration}
          </p>
        )}
      </div>

      <div className="mt-4 flex min-w-0 items-end justify-between gap-2">
        <span className="truncate text-base font-extrabold text-[#082A63] sm:text-lg">
          {formatNaira(
            price
          )}
        </span>

        <span
          className={[
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border",
            selected
              ? "border-[#082A63] bg-[#082A63] text-white"
              : "border-slate-200 text-slate-400",
          ].join(" ")}
        >
          {selected && (
            <span className="text-xs font-black">
              ✓
            </span>
          )}
        </span>
      </div>
    </button>
  );
}

// ============================================================
// SIMPLE PACKAGE CARD
// ============================================================

function PackageCard({
  item,
  selected,
  onClick,
  disabled,
}: {
  item: BillItem;
  selected: boolean;
  onClick: () => void;
  disabled: boolean;
}) {
  const name =
    cleanString(
      item.name ??
        item.short_name ??
        item.description ??
        item.item_code ??
        "Package"
    );

  const price =
    numberValue(
      item.selling_price ??
        item.amount ??
        item.provider_amount
    );

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "relative min-w-0 rounded-2xl border bg-white p-4 text-left transition-all",
        "hover:-translate-y-0.5 hover:border-[#082A63]/40 hover:shadow-sm",
        selected
          ? "border-[#082A63] bg-[#082A63]/[0.03] ring-2 ring-[#082A63]/10"
          : "border-slate-200",
        disabled
          ? "cursor-not-allowed opacity-60"
          : "",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="line-clamp-2 text-sm font-bold text-slate-900">
            {name}
          </p>

          {item.description &&
            item.description !==
              item.name && (
              <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                {
                  item.description
                }
              </p>
            )}
        </div>

        <span
          className={[
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border",
            selected
              ? "border-[#082A63] bg-[#082A63] text-white"
              : "border-slate-200 text-slate-400",
          ].join(" ")}
        >
          {selected && (
            <span className="text-xs font-black">
              ✓
            </span>
          )}
        </span>
      </div>

      <div className="mt-4">
        <span className="text-lg font-extrabold text-[#082A63]">
          {formatNaira(
            price
          )}
        </span>
      </div>
    </button>
  );
}

// ============================================================
// COMPONENT
// ============================================================

const ServicePayment = ({
  service,
  walletBalance,
  onBack,
  onPurchase,
}: ServicePaymentProps) => {
  // ==========================================================
  // FORM STATE
  // ==========================================================

  const [
    amount,
    setAmount,
  ] = useState("");

  const [
    customer,
    setCustomer,
  ] = useState("");

  const [
    customAmountMode,
    setCustomAmountMode,
  ] = useState(false);

  const [
    quantity,
    setQuantity,
  ] = useState(1);

  // ==========================================================
  // PAYMENT PIN
  // ==========================================================

  const [
    showPinPrompt,
    setShowPinPrompt,
  ] = useState(false);

  const [
    paymentPin,
    setPaymentPin,
  ] = useState("");

  const [
    verifyingPin,
    setVerifyingPin,
  ] = useState(false);

  // ==========================================================
  // CATALOGUE
  // ==========================================================

  const [
    billers,
    setBillers,
  ] = useState<Biller[]>([]);

  const [
    items,
    setItems,
  ] = useState<BillItem[]>([]);

  const [
    selectedBillerCode,
    setSelectedBillerCode,
  ] = useState("");

  const [
    selectedItemCode,
    setSelectedItemCode,
  ] = useState("");

  // ==========================================================
  // LOADING
  // ==========================================================

  const [
    loadingBillers,
    setLoadingBillers,
  ] = useState(false);

  const [
    loadingItems,
    setLoadingItems,
  ] = useState(false);

  const [
    processingPayment,
    setProcessingPayment,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  // ==========================================================
  // DATA TAB
  // ==========================================================

  const [
    dataTab,
    setDataTab,
  ] = useState<DataTab>(
    "HOT DEALS"
  );

  const { toast } =
    useToast();

  // ==========================================================
  // SERVICE
  // ==========================================================

  const serviceType =
    cleanString(
      service?.type
    ).toLowerCase();

  const category =
    useMemo(
      () =>
        SERVICE_CATEGORY_MAP[
          serviceType
        ] ?? "",
      [serviceType]
    );

  const usingClubKonnect =
    isClubKonnectService(
      serviceType
    );

  const isData =
    serviceType ===
    "data";

  const isEducation =
    serviceType ===
    "education";

  const isAirtimePin =
    serviceType ===
    "airtime-card";

  const isDataPin =
    serviceType ===
    "data-card";

  const isAirtime =
    serviceType ===
    "airtime";

  const isElectricity =
    serviceType ===
    "electricity";

  const isAmountOnly =
    isAmountOnlyService(
      serviceType
    );

  const needsQuantity =
    requiresQuantity(
      serviceType
    );

  /**
   * Provider routing is completely hidden from the customer.
   */
  const serviceFunction =
    usingClubKonnect
      ? "clubkonnect-services"
      : "flutterwave-bills";

  // ==========================================================
  // SELECTED BILLER
  // ==========================================================

  const selectedBiller =
    useMemo(
      () =>
        billers.find(
          (
            biller
          ) =>
            String(
              biller.biller_code ??
                biller.code ??
                ""
            ) ===
            selectedBillerCode
        ) ?? null,
      [
        billers,
        selectedBillerCode,
      ]
    );

  // ==========================================================
  // SELECTED ITEM
  // ==========================================================

  const selectedItem =
    useMemo(
      () =>
        items.find(
          (
            item
          ) =>
            String(
              item.item_code ??
                ""
            ) ===
            selectedItemCode
        ) ?? null,
      [
        items,
        selectedItemCode,
      ]
    );

  // ==========================================================
  // DATA GROUPS
  // ==========================================================

  const dataGroups =
    useMemo(() => {
      const groups: Record<
        | "HOT DEALS"
        | "Daily"
        | "Weekly"
        | "Monthly"
        | "Other",
        BillItem[]
      > = {
        "HOT DEALS": [],
        Daily: [],
        Weekly: [],
        Monthly: [],
        Other: [],
      };

      items.forEach(
        (item) => {
          if (
            !cleanString(
              item.item_code
            ) ||
            isVariableItem(
              item
            )
          ) {
            return;
          }

          if (
            isHotDeal(
              item
            )
          ) {
            groups[
              "HOT DEALS"
            ].push(item);

            return;
          }

          groups[
            getDataGroup(
              item
            )
          ].push(item);
        }
      );

      return groups;
    }, [items]);

  const visibleDataPlans =
    useMemo(() => {
      if (
        dataTab ===
        "HOT DEALS"
      ) {
        return dataGroups[
          "HOT DEALS"
        ];
      }

      if (
        dataTab ===
        "DAILY"
      ) {
        return dataGroups.Daily;
      }

      if (
        dataTab ===
        "WEEKLY"
      ) {
        return dataGroups.Weekly;
      }

      if (
        dataTab ===
        "MONTHLY"
      ) {
        return dataGroups.Monthly;
      }

      return dataGroups.Other;
    }, [
      dataGroups,
      dataTab,
    ]);

  // ==========================================================
  // CUSTOMER LABEL
  // ==========================================================

  const customerLabel =
    useMemo(() => {
      if (
        selectedItem?.label_name
      ) {
        return selectedItem.label_name;
      }

      switch (
        serviceType
      ) {
        case "airtime":
        case "data":
          return "Phone Number";

        case "education":
          return "Phone Number";

        case "electricity":
          return "Meter Number";

        case "cable":
          return "Smart Card / Decoder Number";

        case "internet":
          return "Account Number";

        case "insurance":
          return "Customer ID";

        default:
          return "Customer Information";
      }
    }, [
      selectedItem,
      serviceType,
    ]);

  // ==========================================================
  // CUSTOMER PLACEHOLDER
  // ==========================================================

  const customerPlaceholder =
    useMemo(() => {
      switch (
        serviceType
      ) {
        case "airtime":
        case "data":
        case "education":
          return "e.g. 08012345678";

        case "electricity":
          return "Enter meter number";

        case "cable":
          return "Enter smart card number";

        case "internet":
          return "Enter account number";

        case "insurance":
          return "Enter customer ID";

        default:
          return "Enter customer information";
      }
    }, [
      serviceType,
    ]);

  // ==========================================================
  // RESET FORM
  // ==========================================================

  const resetForm =
    () => {
      setAmount("");
      setCustomer("");

      setBillers([]);
      setItems([]);

      setSelectedBillerCode(
        ""
      );

      setSelectedItemCode(
        ""
      );

      setError("");

      setCustomAmountMode(
        false
      );

      setQuantity(1);

      setLoadingBillers(
        false
      );

      setLoadingItems(
        false
      );

      setProcessingPayment(
        false
      );

      setShowPinPrompt(
        false
      );

      setPaymentPin("");

      setVerifyingPin(
        false
      );

      setDataTab(
        "HOT DEALS"
      );
    };

  // ==========================================================
  // RESET WHEN SERVICE CHANGES
  // ==========================================================

  useEffect(() => {
    resetForm();
  }, [serviceType]);

  // ==========================================================
  // LOAD BILLERS
  // ==========================================================

  const loadBillers =
    async () => {
      if (!category) {
        setBillers([]);
        return;
      }

      setLoadingBillers(
        true
      );

      setError("");

      setSelectedBillerCode(
        ""
      );

      setSelectedItemCode(
        ""
      );

      setItems([]);

      setAmount("");

      setCustomAmountMode(
        false
      );

      try {
        const {
          data,
          error:
            functionError,
        } =
          await supabase.functions.invoke(
            serviceFunction,
            {
              body: {
                action:
                  "billers",
                service:
                  serviceType,
                category,
                country:
                  "NG",
              },
            }
          );

        if (
          functionError
        ) {
          console.error(
            "Billers function error:",
            functionError
          );

          throw new Error(
            "Unable to load service providers."
          );
        }

        if (
          !data ||
          data.success !==
            true
        ) {
          console.error(
            "Billers API response:",
            data
          );

          throw new Error(
            data?.error ??
              "Unable to load service providers."
          );
        }

        const rawBillers =
          Array.isArray(
            data?.billers
          )
            ? data.billers
            : Array.isArray(
                data?.data
              )
              ? data.data
              : [];

        const loadedBillers =
          rawBillers.filter(
            (
              biller: Biller
            ) =>
              isActualProvider(
                biller?.short_name ??
                  biller?.name ??
                  biller?.code
              )
          );

        setBillers(
          loadedBillers
        );

        if (
          !loadedBillers.length
        ) {
          setError(
            "No service providers are currently available."
          );
        }
      } catch (err) {
        console.error(
          "Failed to load billers:",
          err
        );

        const message =
          "Unable to load service providers.";

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
        setLoadingBillers(
          false
        );
      }
    };

  // ==========================================================
  // LOAD BILLERS WHEN PAGE OPENS
  // ==========================================================

  useEffect(() => {
    if (
      category
    ) {
      void loadBillers();
    }
  }, [
    category,
    serviceFunction,
    serviceType,
  ]);

  // ==========================================================
  // LOAD ITEMS
  // ==========================================================

  const loadItems =
    async (
      billerCode: string
    ) => {
      const cleanBillerCode =
        String(
          billerCode ??
            ""
        ).trim();

      if (
        !cleanBillerCode
      ) {
        setItems([]);
        return;
      }

      setLoadingItems(
        true
      );

      setError("");

      setItems([]);

      setSelectedItemCode(
        ""
      );

      setAmount("");

      setCustomAmountMode(
        false
      );

      setQuantity(1);

      try {
        const {
          data,
          error:
            functionError,
        } =
          await supabase.functions.invoke(
            serviceFunction,
            {
              body: {
                action:
                  "items",
                service:
                  serviceType,
                biller_code:
                  cleanBillerCode,
                category,
                country:
                  "NG",
              },
            }
          );

        if (
          functionError
        ) {
          console.error(
            "Bill items function error:",
            functionError
          );

          throw new Error(
            "Unable to load bill packages."
          );
        }

        if (
          !data ||
          data.success !==
            true
        ) {
          console.error(
            "Bill items API response:",
            data
          );

          throw new Error(
            data?.error ??
              data?.message ??
              "Unable to load bill packages."
          );
        }

        const loadedItems =
          Array.isArray(
            data?.items
          )
            ? data.items
            : [];

        const normalizedItems =
          loadedItems
            .map(
              (
                item: BillItem
              ) => {
                const itemCode =
                  cleanString(
                    item.item_code
                  );

                if (
                  !itemCode
                ) {
                  return null;
                }

                const sellingPrice =
                  numberValue(
                    item.selling_price ??
                      item.amount ??
                      item.provider_amount ??
                      (item as any)
                        .price
                  );

                const backendPeriod =
                  cleanString(
                    item.plan_period ??
                      (item as any)
                        .planPeriod
                  );

                const planPeriod =
                  backendPeriod ||
                  getDataGroup(
                    item
                  );

                const hotDeal =
                  isHotDeal(
                    item
                  );

                return {
                  ...item,

                  /**
                   * Never convert item_code to a number.
                   * ClubKonnect product IDs are opaque strings.
                   */
                  item_code:
                    itemCode,

                  amount:
                    sellingPrice >
                    0
                      ? sellingPrice
                      : item.amount,

                  selling_price:
                    sellingPrice >
                    0
                      ? sellingPrice
                      : item.selling_price,

                  plan_period:
                    planPeriod,

                  plan_type:
                    cleanString(
                      item.plan_type
                    ) ||
                    (hotDeal
                      ? "SME"
                      : "REGULAR"),

                  is_hot_deal:
                    hotDeal,
                };
              }
            )
            .filter(
              (
                item
              ): item is BillItem =>
                item !==
                null
            );

        setItems(
          normalizedItems
        );

        if (
          normalizedItems.length ===
          0
        ) {
          setError(
            "No packages are currently available for this option."
          );
        }
      } catch (err) {
        console.error(
          "Failed to load bill items:",
          err
        );

        const message =
          "Unable to load bill packages.";

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
    };

  // ==========================================================
  // BILLER CHANGE
  // ==========================================================

  const handleBillerChange =
    async (
      value: string
    ) => {
      if (
        processingPayment ||
        verifyingPin
      ) {
        return;
      }

      setSelectedBillerCode(
        value
      );

      await loadItems(
        value
      );
    };

  // ==========================================================
  // DATA PLAN SELECT
  // ==========================================================

  const handleDataPlanSelect =
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
        cleanString(
          item.item_code
        );

      if (!code) {
        return;
      }

      const sellingPrice =
        numberValue(
          item.selling_price ??
            item.amount ??
            item.provider_amount
        );

      if (
        sellingPrice <=
        0
      ) {
        toast({
          title:
            "Invalid data plan",
          description:
            "This data plan does not have a valid price.",
          variant:
            "destructive",
        });

        return;
      }

      setSelectedItemCode(
        code
      );

      setAmount(
        String(
          sellingPrice
        )
      );

      setQuantity(1);

      setCustomAmountMode(
        false
      );

      setError("");
    };

  // ==========================================================
  // GENERIC ITEM SELECT
  // ==========================================================

  const handleItemSelect =
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
        cleanString(
          item.item_code
        );

      if (!code) {
        return;
      }

      const price =
        numberValue(
          item.selling_price ??
            item.amount ??
            item.provider_amount
        );

      setSelectedItemCode(
        code
      );

      setAmount(
        price > 0
          ? String(price)
          : ""
      );

      setQuantity(1);

      setCustomAmountMode(
        false
      );

      setError("");
    };

  // ==========================================================
  // AMOUNT
  // ==========================================================

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

      setCustomAmountMode(
        true
      );

      setAmount("");

      setError("");
    };

  // ==========================================================
  // QUANTITY
  // ==========================================================

  const incrementQuantity =
    () => {
      if (
        processingPayment ||
        verifyingPin
      ) {
        return;
      }

      setQuantity(
        (current) =>
          Math.min(
            100,
            current + 1
          )
      );
    };

  const decrementQuantity =
    () => {
      if (
        processingPayment ||
        verifyingPin
      ) {
        return;
      }

      setQuantity(
        (current) =>
          Math.max(
            1,
            current - 1
          )
      );
    };

  // ==========================================================
  // AMOUNT RULES
  // ==========================================================

  const amountNumber =
    Number(
      amount
    );

  const itemMinimum =
    numberValue(
      selectedItem?.minimum
    );

  const itemMaximum =
    numberValue(
      selectedItem?.maximum
    );

  const selectedItemPrice =
    numberValue(
      selectedItem?.selling_price ??
        selectedItem?.amount ??
        selectedItem?.provider_amount
    );

  const dataSellingAmount =
    isData &&
    selectedItem
      ? selectedItemPrice
      : 0;

  const quantityTotal =
    needsQuantity
      ? selectedItemPrice *
        quantity
      : amountNumber;

  const finalPaymentAmount =
    needsQuantity
      ? quantityTotal
      : amountNumber;

  // ==========================================================
  // CUSTOMER NORMALISATION
  // ==========================================================

  const normaliseCustomer =
    (): string => {
      let value =
        customer.trim();

      if (
        requiresPhone(
          serviceType
        )
      ) {
        value =
          value.replace(
            /\s+/g,
            ""
          );

        if (
          /^0\d{10}$/.test(
            value
          )
        ) {
          return `+234${value.substring(
            1
          )}`;
        }

        if (
          /^\d{10}$/.test(
            value
          )
        ) {
          return `+234${value}`;
        }

        if (
          /^234\d{10}$/.test(
            value
          )
        ) {
          return `+${value}`;
        }

        if (
          /^\+234\d{10}$/.test(
            value
          )
        ) {
          return value;
        }
      }

      return value;
    };

  // ==========================================================
  // VALIDATION
  // ==========================================================

  const validateForm =
    (): boolean => {
      if (
        !selectedBillerCode
      ) {
        toast({
          title:
            isEducation
              ? "Select an exam service"
              : "Select a network or biller",
          description:
            isEducation
              ? "Please select WAEC or JAMB."
              : "Please select a service provider.",
          variant:
            "destructive",
        });

        return false;
      }

      if (
        !selectedItemCode &&
        !isAmountOnly
      ) {
        toast({
          title:
            "Select a package",
          description:
            "Please select a service package.",
          variant:
            "destructive",
        });

        return false;
      }

      /**
       * Airtime PIN and Data PIN don't need a customer
       * phone number. ClubKonnect delivers the PIN/card
       * product itself.
       */
      if (
        requiresPhone(
          serviceType
        )
      ) {
        const finalCustomer =
          normaliseCustomer();

        if (
          !finalCustomer
        ) {
          toast({
            title:
              "Customer information required",
            description:
              `Please enter the ${customerLabel.toLowerCase()}.`,
            variant:
              "destructive",
          });

          return false;
        }

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

      /**
       * Quantity validation.
       */
      if (
        needsQuantity &&
        (
          !Number.isInteger(
            quantity
          ) ||
          quantity <
            1 ||
          quantity >
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

      /**
       * Data and package services have fixed prices.
       */
      if (
        !isAmountOnly
      ) {
        if (
          selectedItemPrice <=
          0
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

        if (
          !needsQuantity &&
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
              "Please select a valid package.",
            variant:
              "destructive",
          });

          return false;
        }

        if (
          isData &&
          Math.abs(
            amountNumber -
              dataSellingAmount
          ) >
            0.01
        ) {
          toast({
            title:
              "Invalid data price",
            description:
              `This plan costs ${formatNaira(
                dataSellingAmount
              )}.`,
            variant:
              "destructive",
          });

          return false;
        }

        if (
          needsQuantity &&
          Math.abs(
            finalPaymentAmount -
              selectedItemPrice *
                quantity
          ) >
            0.01
        ) {
          toast({
            title:
              "Invalid package amount",
            description:
              "The selected package amount is invalid.",
            variant:
              "destructive",
          });

          return false;
        }
      }

      /**
       * Amount-based services.
       */
      if (
        isAmountOnly
      ) {
        if (
          !Number.isFinite(
            amountNumber
          ) ||
          amountNumber <=
            0
        ) {
          toast({
            title:
              "Invalid amount",
            description:
              "Please select or enter a valid amount.",
            variant:
              "destructive",
          });

          return false;
        }

        if (
          itemMinimum >
            0 &&
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
          itemMaximum >
            0 &&
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
      }

      if (
        finalPaymentAmount >
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

  // ==========================================================
  // PURCHASE DETAILS
  // ==========================================================

  const buildPurchaseDetails =
    () => {
      const finalCustomer =
        normaliseCustomer();

      return {
        customer:
          finalCustomer,

        biller_code:
          selectedBillerCode,

        item_code:
          selectedItemCode,

        phoneNumber:
          requiresPhone(
            serviceType
          )
            ? finalCustomer
            : "",

        phone:
          requiresPhone(
            serviceType
          )
            ? finalCustomer
            : "",

        meterNumber:
          serviceType ===
          "electricity"
            ? finalCustomer
            : "",

        meter_number:
          serviceType ===
          "electricity"
            ? finalCustomer
            : "",

        smartCardNumber:
          serviceType ===
          "cable"
            ? finalCustomer
            : "",

        smartcardNumber:
          serviceType ===
          "cable"
            ? finalCustomer
            : "",

        smartcard_number:
          serviceType ===
          "cable"
            ? finalCustomer
            : "",

        accountNumber:
          serviceType ===
          "internet"
            ? finalCustomer
            : "",

        account_number:
          serviceType ===
          "internet"
            ? finalCustomer
            : "",

        type:
          serviceType,

        service:
          serviceType,

        country:
          "NG",

        customerLabel,

        item:
          selectedItem,

        biller:
          selectedBiller,

        provider:
          selectedBiller,

        selling_amount:
          finalPaymentAmount,

        provider_amount:
          selectedItemPrice,

        quantity:
          needsQuantity
            ? quantity
            : 1,

        plan_type:
          selectedItem
            ? getPlanType(
                selectedItem
              )
            : "",

        is_hot_deal:
          selectedItem
            ? isHotDeal(
                selectedItem
              )
            : false,
      };
    };

  // ==========================================================
  // SHOW PIN
  // ==========================================================

  const handlePurchase =
    async () => {
      if (!service) {
        return;
      }

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

  // ==========================================================
  // VERIFY PIN + PURCHASE
  // ==========================================================

  const handlePinVerification =
    async () => {
      if (!service) {
        return;
      }

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
            data?.message ??
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

        const sellingAmount =
          finalPaymentAmount;

        setShowPinPrompt(
          false
        );

        setPaymentPin("");

        setProcessingPayment(
          true
        );

        console.log(
          "Payment PIN verified. Sending service purchase:",
          {
            service:
              serviceType,

            selling_amount:
              sellingAmount,

            biller_code:
              selectedBillerCode,

            item_code:
              selectedItemCode,

            quantity:
              details.quantity,
          }
        );

        await onPurchase(
          sellingAmount,
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

  // ==========================================================
  // BACK
  // ==========================================================

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

  // ==========================================================
  // SERVICE ICON
  // ==========================================================

  const ServiceIcon =
    isEducation
      ? GraduationCap
      : isAirtimePin
        ? Ticket
        : isDataPin
          ? Database
          : null;

  // ==========================================================
  // NO SERVICE
  // ==========================================================

  if (!service) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50">
        <div className="text-center">
          <p className="text-gray-600 mb-4">
            No payment service selected.
          </p>

          <Button
            onClick={
              onBack
            }
          >
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  // ==========================================================
  // PAGE
  // ==========================================================

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50 pb-8">
      {/* ======================================================
          HEADER
          ====================================================== */}

      <header className="bg-gradient-to-r from-purple-600 to-blue-600 text-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="flex items-center gap-3 h-16">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={
                handleBack
              }
              disabled={
                processingPayment ||
                verifyingPin
              }
              className="text-white hover:bg-white/20"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>

            <h1 className="text-lg font-bold">
              {
                service.title
              }
            </h1>
          </div>
        </div>
      </header>

      {/* ======================================================
          CONTENT
          ====================================================== */}

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        {/* ====================================================
            PAYMENT PIN
            ==================================================== */}

        {showPinPrompt ? (
          <div className="bg-white rounded-2xl shadow-sm border p-5 sm:p-6">
            <div className="text-center mb-6">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                <span className="text-2xl">
                  🔐
                </span>
              </div>

              <h2 className="text-xl font-bold text-gray-900">
                Confirm Payment
              </h2>

              <p className="text-sm text-gray-500 mt-1">
                Enter your
                4-digit
                Payment
                PIN to
                confirm
                this
                payment.
              </p>

              <p className="text-lg font-semibold text-green-700 mt-2">
                {
                  service.title
                }
              </p>
            </div>

            {/* SUMMARY */}

            <div className="rounded-xl bg-green-50 border border-green-100 p-4 space-y-3 mb-6">
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-gray-600">
                  Amount
                </span>

                <span className="font-bold text-green-700">
                  {formatNaira(
                    finalPaymentAmount
                  )}
                </span>
              </div>

              {requiresPhone(
                serviceType
              ) && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-gray-600">
                    {
                      customerLabel
                    }
                  </span>

                  <span className="text-sm font-medium text-gray-900 text-right break-all">
                    {normaliseCustomer()}
                  </span>
                </div>
              )}

              {selectedItem &&
                !isAmountOnly && (
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-gray-600">
                      Package
                    </span>

                    <span className="text-sm font-medium text-gray-900 text-right">
                      {selectedItem.name ??
                        selectedItem.short_name ??
                        "-"}
                    </span>
                  </div>
                )}

              {needsQuantity && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-gray-600">
                    Quantity
                  </span>

                  <span className="font-semibold text-gray-900">
                    {quantity}
                  </span>
                </div>
              )}

              {selectedBiller && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-gray-600">
                    {
                      isEducation
                        ? "Exam Service"
                        : "Network / Provider"
                    }
                  </span>

                  <span className="text-sm font-medium text-gray-900 text-right">
                    {getProviderDisplayName(
                      selectedBiller
                    )}
                  </span>
                </div>
              )}
            </div>

            {/* PIN */}

            <div className="space-y-2 mb-5">
              <Label htmlFor="servicePaymentPin">
                Payment PIN
              </Label>

              <Input
                id="servicePaymentPin"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                value={
                  paymentPin
                }
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
                placeholder="••••"
                disabled={
                  verifyingPin
                }
                autoFocus
                className="text-center text-2xl tracking-[0.5em]"
              />

              <p className="text-xs text-gray-500 text-center">
                Your Payment
                PIN is
                securely
                verified
                before
                the
                payment
                is
                processed.
              </p>
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 mb-5">
                <p className="text-sm text-red-700">
                  {
                    error
                  }
                </p>
              </div>
            )}

            <div className="space-y-3">
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
                className="w-full bg-green-600 hover:bg-green-700"
              >
                {verifyingPin ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Verifying
                    PIN...
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

                  setError(
                    ""
                  );

                  setShowPinPrompt(
                    false
                  );
                }}
                disabled={
                  verifyingPin
                }
                className="w-full"
              >
                Back
              </Button>
            </div>
          </div>
        ) : (
          /* ==================================================
             NORMAL FORM
             ================================================== */

          <div className="bg-white rounded-2xl shadow-sm border p-5 sm:p-6">
            {/* =================================================
                SERVICE INTRO
                ================================================= */}

            {(isEducation ||
              isAirtimePin ||
              isDataPin) && (
              <div className="mb-5 rounded-2xl bg-slate-50 border border-slate-100 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#082A63]/10 text-[#082A63]">
                    {ServiceIcon && (
                      <ServiceIcon className="h-5 w-5" />
                    )}
                  </div>

                  <div>
                    <p className="font-bold text-slate-900">
                      {
                        service.title
                      }
                    </p>

                    <p className="text-xs text-slate-500">
                      {isEducation
                        ? "Purchase WAEC or JAMB e-PIN services."
                        : isAirtimePin
                          ? "Purchase Airtime PIN vouchers."
                          : "Purchase Data PIN vouchers."}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* =================================================
                PROVIDER / NETWORK
                ================================================= */}

            <div className="mb-5 space-y-2">
              <div className="flex items-center justify-between">
                <Label>
                  {isEducation
                    ? "Exam Service"
                    : isAirtime ||
                        isData ||
                        isAirtimePin ||
                        isDataPin
                      ? "Network"
                      : "Provider"}
                </Label>

                {!loadingBillers &&
                  !processingPayment &&
                  !verifyingPin && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        void loadBillers()
                      }
                      className="h-7 px-2"
                    >
                      <RefreshCw className="mr-1 h-3.5 w-3.5" />
                      Refresh
                    </Button>
                  )}
              </div>

              {loadingBillers ? (
                <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-200 py-8 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading
                  options...
                </div>
              ) : billers.length ? (
                <div className="grid w-full grid-cols-4 gap-2 sm:grid-cols-5 sm:gap-3 md:grid-cols-6">
                  {billers.map(
                    (
                      biller,
                      index
                    ) => {
                      const code =
                        cleanString(
                          biller.biller_code ??
                            biller.code
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
                          selected={
                            code ===
                            selectedBillerCode
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
                <div className="rounded-2xl border border-dashed border-slate-200 p-5 text-center">
                  <p className="text-sm text-slate-500">
                    No options
                    are
                    currently
                    available.
                  </p>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() =>
                      void loadBillers()
                    }
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Retry
                  </Button>
                </div>
              )}
            </div>

            {/* =================================================
                DATA PLANS
                ================================================= */}

            {selectedBillerCode &&
              isData && (
                <div className="mb-5 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <Label>
                        Data Plan
                      </Label>

                      <p className="mt-1 text-xs text-gray-500">
                        Choose
                        from
                        Hot
                        Deals,
                        Daily,
                        Weekly,
                        Monthly
                        or
                        Other
                        plans.
                      </p>
                    </div>

                    {loadingItems && (
                      <Loader2 className="h-4 w-4 animate-spin text-[#082A63]" />
                    )}
                  </div>

                  <div className="flex max-w-full gap-2 overflow-x-auto pb-1">
                    {DATA_TABS.map(
                      (
                        tab
                      ) => {
                        const groupKey =
                          tab ===
                          "HOT DEALS"
                            ? "HOT DEALS"
                            : tab ===
                                "DAILY"
                              ? "Daily"
                              : tab ===
                                  "WEEKLY"
                                ? "Weekly"
                                : tab ===
                                    "MONTHLY"
                                  ? "Monthly"
                                  : "Other";

                        const count =
                          dataGroups[
                            groupKey
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
                              "shrink-0 whitespace-nowrap rounded-full border px-3 py-2 text-[11px] font-bold transition-colors",
                              dataTab ===
                                tab
                                ? "border-[#082A63] bg-[#082A63] text-white"
                                : "border-slate-200 bg-white text-slate-600 hover:border-[#082A63]/30",
                            ].join(
                              " "
                            )}
                          >
                            {tab ===
                              "HOT DEALS" && (
                              <Flame className="mr-1 inline h-3.5 w-3.5" />
                            )}

                            {
                              tab
                            }

                            <span className="ml-1 opacity-70">
                              (
                              {
                                count
                              }
                              )
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
                          n
                        ) => (
                          <div
                            key={
                              n
                            }
                            className="h-28 animate-pulse rounded-2xl bg-slate-100"
                          />
                        )
                      )}
                    </div>
                  ) : visibleDataPlans.length ? (
                    <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3">
                      {visibleDataPlans.map(
                        (
                          item,
                          index
                        ) => (
                          <DataPlanCard
                            key={`${cleanString(
                              item.item_code
                            )}-${index}`}
                            item={
                              item
                            }
                            selected={
                              cleanString(
                                item.item_code
                              ) ===
                              selectedItemCode
                            }
                            onClick={() =>
                              handleDataPlanSelect(
                                item
                              )
                            }
                            disabled={
                              processingPayment ||
                              verifyingPin
                            }
                          />
                        )
                      )}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-slate-500">
                      {dataTab ===
                      "HOT DEALS"
                        ? "No hot deals are currently available."
                        : "No packages are currently available in this category."}
                    </div>
                  )}
                </div>
              )}

            {/* =================================================
                EDUCATION PACKAGES
                ================================================= */}

            {selectedBillerCode &&
              isEducation && (
                <div className="mb-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>
                        Package
                      </Label>

                      <p className="mt-1 text-xs text-gray-500">
                        Select
                        the
                        available
                        {
                          selectedBillerCode
                        }{" "}
                        package.
                      </p>
                    </div>

                    {loadingItems && (
                      <Loader2 className="h-4 w-4 animate-spin text-[#082A63]" />
                    )}
                  </div>

                  {loadingItems ? (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {[1, 2].map(
                        (
                          n
                        ) => (
                          <div
                            key={
                              n
                            }
                            className="h-24 animate-pulse rounded-2xl bg-slate-100"
                          />
                        )
                      )}
                    </div>
                  ) : items.length ? (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                              key={`${cleanString(
                                item.item_code
                              )}-${index}`}
                              item={
                                item
                              }
                              selected={
                                cleanString(
                                  item.item_code
                                ) ===
                                selectedItemCode
                              }
                              onClick={() =>
                                handleItemSelect(
                                  item
                                )
                              }
                              disabled={
                                processingPayment ||
                                verifyingPin
                              }
                            />
                          )
                        )}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-slate-500">
                      No education
                      packages
                      are
                      currently
                      available.
                    </div>
                  )}
                </div>
              )}

            {/* =================================================
                AIRTIME PIN / DATA PIN PACKAGES
                ================================================= */}

            {selectedBillerCode &&
              (
                isAirtimePin ||
                isDataPin
              ) && (
                <div className="mb-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>
                        Package
                      </Label>

                      <p className="mt-1 text-xs text-gray-500">
                        Select
                        the
                        voucher
                        package
                        you
                        want.
                      </p>
                    </div>

                    {loadingItems && (
                      <Loader2 className="h-4 w-4 animate-spin text-[#082A63]" />
                    )}
                  </div>

                  {loadingItems ? (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {[1, 2, 3].map(
                        (
                          n
                        ) => (
                          <div
                            key={
                              n
                            }
                            className="h-24 animate-pulse rounded-2xl bg-slate-100"
                          />
                        )
                      )}
                    </div>
                  ) : items.length ? (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
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
                              key={`${cleanString(
                                item.item_code
                              )}-${index}`}
                              item={
                                item
                              }
                              selected={
                                cleanString(
                                  item.item_code
                                ) ===
                                selectedItemCode
                              }
                              onClick={() =>
                                handleItemSelect(
                                  item
                                )
                              }
                              disabled={
                                processingPayment ||
                                verifyingPin
                              }
                            />
                          )
                        )}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-slate-500">
                      No voucher
                      packages
                      are
                      currently
                      available.
                    </div>
                  )}
                </div>
              )}

            {/* =================================================
                QUANTITY
                ================================================= */}

            {needsQuantity &&
              selectedItem && (
                <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <Label>
                        Quantity
                      </Label>

                      <p className="mt-1 text-xs text-slate-500">
                        Maximum
                        quantity
                        is 100.
                      </p>
                    </div>

                    <div className="flex items-center rounded-xl border bg-white">
                      <button
                        type="button"
                        onClick={
                          decrementQuantity
                        }
                        disabled={
                          processingPayment ||
                          verifyingPin ||
                          quantity <=
                            1
                        }
                        className="flex h-10 w-10 items-center justify-center rounded-l-xl text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                        aria-label="Decrease quantity"
                      >
                        <Minus className="h-4 w-4" />
                      </button>

                      <div className="flex h-10 min-w-[48px] items-center justify-center border-x px-3 text-sm font-bold">
                        {
                          quantity
                        }
                      </div>

                      <button
                        type="button"
                        onClick={
                          incrementQuantity
                        }
                        disabled={
                          processingPayment ||
                          verifyingPin ||
                          quantity >=
                            100
                        }
                        className="flex h-10 w-10 items-center justify-center rounded-r-xl text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                        aria-label="Increase quantity"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t pt-3">
                    <span className="text-sm text-slate-600">
                      Total
                    </span>

                    <span className="text-lg font-extrabold text-[#082A63]">
                      {formatNaira(
                        finalPaymentAmount
                      )}
                    </span>
                  </div>
                </div>
              )}

            {/* =================================================
                GENERIC FLUTTERWAVE PACKAGE
                ================================================= */}

            {selectedBillerCode &&
              !isData &&
              !isEducation &&
              !isAirtimePin &&
              !isDataPin &&
              !isAmountOnly && (
                <div className="mb-5 space-y-2">
                  <Label>
                    Package
                  </Label>

                  <select
                    value={
                      selectedItemCode
                    }
                    onChange={(
                      event
                    ) => {
                      const code =
                        event
                          .target
                          .value;

                      setSelectedItemCode(
                        code
                      );

                      const item =
                        items.find(
                          (
                            entry
                          ) =>
                            cleanString(
                              entry.item_code
                            ) ===
                            code
                        );

                      setAmount(
                        item
                          ? String(
                              numberValue(
                                item.selling_price ??
                                  item.amount ??
                                  item.provider_amount
                              )
                            )
                          : ""
                      );

                      setError(
                        ""
                      );
                    }}
                    disabled={
                      loadingItems ||
                      processingPayment ||
                      verifyingPin ||
                      !items.length
                    }
                    className="h-11 w-full rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="">
                      {loadingItems
                        ? "Loading packages..."
                        : "Select package"}
                    </option>

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
                        ) => {
                          const code =
                            cleanString(
                              item.item_code
                            );

                          if (
                            !code
                          ) {
                            return null;
                          }

                          return (
                            <option
                              key={`${code}-${index}`}
                              value={
                                code
                              }
                            >
                              {cleanString(
                                item.name ??
                                  item.short_name ??
                                  code
                              )}
                            </option>
                          );
                        }
                      )}
                  </select>
                </div>
              )}

            {/* =================================================
                AMOUNT-BASED SERVICES
                ================================================= */}

            {selectedBillerCode &&
              isAmountOnly && (
                <div className="mb-5 space-y-4">
                  <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                    {isAirtime
                      ? "Airtime is amount-based. Choose the network above, then select or enter the amount you want."
                      : "Electricity is amount-based. Choose the provider above, then select or enter the amount you want."}
                  </div>

                  <div className="space-y-2">
                    <Label>
                      Amount (₦)
                    </Label>

                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {(isAirtime
                        ? AIRTIME_AMOUNTS
                        : BILL_AMOUNTS
                      ).map(
                        (
                          value
                        ) => (
                          <button
                            type="button"
                            key={
                              value
                            }
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
                              "rounded-xl border p-3 text-center font-semibold transition-all",
                              "hover:border-green-500 hover:bg-green-50",
                              amount ===
                                String(
                                  value
                                )
                                ? "border-green-600 bg-green-50 text-green-700 ring-1 ring-green-600"
                                : "border-gray-200",
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
                          "rounded-xl border p-3 text-center font-semibold transition-all",
                          "hover:border-green-500 hover:bg-green-50",
                          customAmountMode
                            ? "border-green-600 bg-green-50 text-green-700 ring-1 ring-green-600"
                            : "border-gray-200",
                        ].join(
                          " "
                        )}
                      >
                        Enter
                        Amount
                      </button>
                    </div>

                    {customAmountMode && (
                      <Input
                        id="billAmount"
                        type="number"
                        min="0"
                        step="0.01"
                        value={
                          amount
                        }
                        onChange={(
                          event
                        ) =>
                          setAmount(
                            event
                              .target
                              .value
                          )
                        }
                        placeholder="Enter exact amount"
                        disabled={
                          processingPayment ||
                          verifyingPin
                        }
                        autoFocus
                      />
                    )}

                    {(itemMinimum >
                      0 ||
                      itemMaximum >
                        0) && (
                      <p className="text-xs text-gray-500">
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
                  </div>
                </div>
              )}

            {/* =================================================
                CUSTOMER INFORMATION
                ================================================= */}

            {requiresPhone(
              serviceType
            ) && (
              <div className="space-y-2 mb-5">
                <Label htmlFor="billCustomer">
                  {
                    customerLabel
                  }
                </Label>

                <Input
                  id="billCustomer"
                  value={
                    customer
                  }
                  onChange={(
                    event
                  ) =>
                    setCustomer(
                      event
                        .target
                        .value
                    )
                  }
                  placeholder={
                    customerPlaceholder
                  }
                  disabled={
                    processingPayment ||
                    verifyingPin
                  }
                  inputMode="numeric"
                />
              </div>
            )}

            {/* =================================================
                GENERIC CUSTOMER INFORMATION
                ================================================= */}

            {!requiresPhone(
              serviceType
            ) &&
              !needsQuantity &&
              !isAmountOnly &&
              !isData &&
              !isEducation &&
              !isAirtimePin &&
              !isDataPin &&
              serviceType !==
                "insurance" && (
                <div className="space-y-2 mb-5">
                  <Label htmlFor="billCustomer">
                    {
                      customerLabel
                    }
                  </Label>

                  <Input
                    id="billCustomer"
                    value={
                      customer
                    }
                    onChange={(
                      event
                    ) =>
                      setCustomer(
                        event
                          .target
                          .value
                      )
                    }
                    placeholder={
                      customerPlaceholder
                    }
                    disabled={
                      processingPayment ||
                      verifyingPin
                    }
                  />
                </div>
              )}

            {/* =================================================
                DATA PRICE
                ================================================= */}

            {isData &&
              selectedItem && (
                <div className="rounded-lg bg-green-50 border border-green-100 p-4 mb-5">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-gray-600">
                      Selected
                      Plan
                    </span>

                    <span className="text-sm font-medium text-right">
                      {selectedItem.name ??
                        selectedItem.short_name}
                    </span>
                  </div>

                  <div className="flex items-center justify-between mt-2">
                    <span className="text-sm text-gray-600">
                      Price
                    </span>

                    <span className="font-bold text-green-700">
                      {formatNaira(
                        dataSellingAmount
                      )}
                    </span>
                  </div>
                </div>
              )}

            {/* =================================================
                GENERIC AMOUNT SERVICES
                ================================================= */}

            {!isData &&
              !isAmountOnly &&
              !needsQuantity &&
              selectedItem &&
              selectedItemPrice >
                0 && (
                <div className="rounded-lg bg-green-50 border border-green-100 p-4 mb-5">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-gray-600">
                      Price
                    </span>

                    <span className="font-bold text-green-700">
                      {formatNaira(
                        selectedItemPrice
                      )}
                    </span>
                  </div>
                </div>
              )}

            {/* =================================================
                ERROR
                ================================================= */}

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 mb-5">
                <p className="text-sm text-red-700">
                  {
                    error
                  }
                </p>
              </div>
            )}

            {/* =================================================
                PURCHASE
                ================================================= */}

            <Button
              type="button"
              onClick={() =>
                void handlePurchase()
              }
              disabled={
                loadingBillers ||
                loadingItems ||
                processingPayment ||
                verifyingPin ||
                !selectedBillerCode ||
                (
                  !selectedItemCode &&
                  !isAmountOnly
                ) ||
                (
                  requiresPhone(
                    serviceType
                  ) &&
                  !customer.trim()
                ) ||
                (
                  isAmountOnly &&
                  !amount
                )
              }
              className="w-full bg-green-600 hover:bg-green-700 h-11"
            >
              {processingPayment ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                `Purchase ${service.title}`
              )}
            </Button>

            {processingPayment && (
              <p className="text-xs text-center text-gray-500 mt-3">
                Please do
                not leave
                this page
                while your
                payment is
                being
                processed.
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default ServicePayment;
