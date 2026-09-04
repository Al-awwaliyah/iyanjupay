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

interface CatalogItem {
  id?: string | number;

  name?: string;
  short_name?: string;
  shortName?: string;
  display_name?: string;
  displayName?: string;
  title?: string;
  label?: string;
  description?: string;

  code?: string;
  item_code?: string;
  itemCode?: string;

  biller_code?: string;
  billerCode?: string;

  network_code?: string;
  networkCode?: string;

  product_code?: string;
  productCode?: string;

  product_id?: string;
  productId?: string;

  variation_code?: string;
  variationCode?: string;

  plan_code?: string;
  planCode?: string;

  cable_code?: string;
  cableCode?: string;

  package_code?: string;
  packageCode?: string;

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

  is_hot_deal?: boolean | string;
  isHotDeal?: boolean | string;

  logo?: string;
  logo_url?: string;
  logoUrl?: string;

  category?: string;
  type?: string;

  [key: string]: any;
}

// ============================================================
// CONSTANTS
// ============================================================

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

const GENERAL_AMOUNTS = [
  500,
  1000,
  2000,
  5000,
  10000,
  20000,
  50000,
];

const CABLE_PROVIDER_NAMES: Record<string, string> = {
  dstv: "DSTV",
  gotv: "GOtv",
  startimes: "Startimes",
  showmax: "Showmax",
};

const NETWORK_NAMES: Record<string, string> = {
  "01": "MTN",
  "02": "Glo",
  "03": "9mobile",
  "04": "Airtel",
};

const SERVICE_MARKUP: Record<string, number> = {
  airtime: 0,
  data: 0.15,
  electricity: 0.15,
  cable: 0.15,
  "airtime-card": 0.2,
  "data-card": 0.2,
  smile: 0.2,
  waec: 0.2,
  jamb: 0.2,
};

// ============================================================
// BASIC HELPERS
// ============================================================

function cleanString(value: unknown): string {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  if (
    typeof value === "string" ||
    typeof value === "number"
  ) {
    return String(value).trim();
  }

  return "";
}

function numberValue(value: unknown): number {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (
    typeof value === "string"
  ) {
    const cleaned = value
      .replace(/,/g, "")
      .replace(/[₦$]/g, "")
      .trim();

    const parsed = Number(cleaned);

    return Number.isFinite(parsed)
      ? parsed
      : 0;
  }

  return 0;
}

function formatNaira(
  value: number
): string {
  return `₦${Number(value || 0).toLocaleString(
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
    typeof value === "string"
  ) {
    return [
      "true",
      "yes",
      "1",
      "hot",
    ].includes(
      value.trim().toLowerCase()
    );
  }

  return false;
}

function normaliseKey(
  value: unknown
): string {
  return cleanString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

// ============================================================
// SAFE OBJECT TEXT
// Prevents [object Object] from ever appearing in the UI.
// ============================================================

function objectDisplayName(
  value: unknown
): string {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  if (
    typeof value === "string" ||
    typeof value === "number"
  ) {
    return String(value).trim();
  }

  if (
    typeof value === "object"
  ) {
    const object = value as Record<
      string,
      unknown
    >;

    const candidates = [
      object.name,
      object.short_name,
      object.shortName,
      object.display_name,
      object.displayName,
      object.title,
      object.label,
      object.provider_name,
      object.providerName,
      object.biller_name,
      object.billerName,
      object.network_name,
      object.networkName,
      object.PRODUCT_NAME,
      object.product_name,
    ];

    for (
      const candidate of candidates
    ) {
      const text =
        objectDisplayName(candidate);

      if (text) {
        return text;
      }
    }
  }

  return "";
}

// ============================================================
// PROVIDER LABEL NORMALIZATION
// ============================================================

function getCableProviderLabel(
  provider: CatalogItem
): string {
  const values = [
    provider.biller_code,
    provider.billerCode,
    provider.code,
    provider.name,
    provider.short_name,
    provider.shortName,
    provider.display_name,
    provider.displayName,
    provider.title,
    provider.label,
  ];

  for (
    const value of values
  ) {
    const key =
      normaliseKey(value);

    if (
      key === "dstv" ||
      key === "multichoicedstv"
    ) {
      return "DSTV";
    }

    if (
      key === "gotv" ||
      key === "gotvng" ||
      key === "gotvmax"
    ) {
      return "GOtv";
    }

    if (
      key === "startimes" ||
      key === "startime"
    ) {
      return "Startimes";
    }

    if (
      key === "showmax"
    ) {
      return "Showmax";
    }
  }

  return (
    objectDisplayName(
      provider
    ) || "Cable TV"
  );
}

function getProviderDisplayName(
  provider: CatalogItem,
  serviceType: string
): string {
  if (
    serviceType === "cable"
  ) {
    return getCableProviderLabel(
      provider
    );
  }

  const code =
    cleanString(
      provider.network_code ??
        provider.networkCode ??
        provider.biller_code ??
        provider.billerCode ??
        provider.code
    );

  if (
    NETWORK_NAMES[code]
  ) {
    return NETWORK_NAMES[code];
  }

  const name =
    objectDisplayName(
      provider
    );

  if (name) {
    const key =
      normaliseKey(name);

    if (
      key.includes("mtn")
    ) {
      return "MTN";
    }

    if (
      key.includes("glo") ||
      key.includes("globacom")
    ) {
      return "Glo";
    }

    if (
      key.includes("airtel")
    ) {
      return "Airtel";
    }

    if (
      key.includes("9mobile") ||
      key.includes("etisalat")
    ) {
      return "9mobile";
    }

    if (
      key.includes("smile")
    ) {
      return "Smile";
    }

    return name;
  }

  return (
    code ||
    "Service"
  );
}

// ============================================================
// LOGOS
// ============================================================

const PROVIDER_LOGOS: Record<
  string,
  string
> = {
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
};

function getProviderLogo(
  provider: CatalogItem,
  serviceType: string
): string | null {
  const supplied =
    cleanString(
      provider.logo ??
        provider.logo_url ??
        provider.logoUrl
    );

  if (supplied) {
    return supplied;
  }

  const name =
    normaliseKey(
      getProviderDisplayName(
        provider,
        serviceType
      )
    );

  if (
    name.includes("mtn")
  ) {
    return PROVIDER_LOGOS.mtn;
  }

  if (
    name.includes("glo")
  ) {
    return PROVIDER_LOGOS.glo;
  }

  if (
    name.includes("airtel")
  ) {
    return PROVIDER_LOGOS.airtel;
  }

  if (
    name.includes("9mobile") ||
    name.includes("etisalat")
  ) {
    return PROVIDER_LOGOS["9mobile"];
  }

  if (
    name.includes("dstv")
  ) {
    return PROVIDER_LOGOS.dstv;
  }

  if (
    name.includes("gotv")
  ) {
    return PROVIDER_LOGOS.gotv;
  }

  if (
    name.includes("startimes") ||
    name.includes("startime")
  ) {
    return PROVIDER_LOGOS.startimes;
  }

  if (
    name.includes("showmax")
  ) {
    return PROVIDER_LOGOS.showmax;
  }

  if (
    name.includes("smile")
  ) {
    return PROVIDER_LOGOS.smile;
  }

  return null;
}

// ============================================================
// PRICE HELPERS
// ============================================================

function getProviderPrice(
  item: CatalogItem
): number {
  return numberValue(
    item.provider_price ??
      item.providerPrice ??
      item.provider_amount ??
      item.providerAmount ??
      item.PRODUCT_AMOUNT ??
      item.amount ??
      item.price
  );
}

function getSellingPrice(
  item: CatalogItem
): number {
  const explicitSelling =
    numberValue(
      item.selling_price ??
        item.sellingPrice
    );

  if (
    explicitSelling > 0
  ) {
    return explicitSelling;
  }

  const price =
    numberValue(
      item.price ??
        item.amount ??
        item.PRODUCT_AMOUNT
    );

  if (
    price <= 0
  ) {
    return 0;
  }

  /*
   * If the Edge Function has already returned
   * the customer selling price, use it directly.
   *
   * This prevents the frontend from double-marking
   * ClubKonnect selling prices.
   */
  return price;
}

// ============================================================
// CATALOG NORMALIZATION
// ============================================================

function flattenCatalog(
  value: unknown,
  depth = 0
): CatalogItem[] {
  if (
    depth > 8 ||
    value === null ||
    value === undefined
  ) {
    return [];
  }

  if (
    Array.isArray(value)
  ) {
    return value.flatMap(
      (entry) =>
        flattenCatalog(
          entry,
          depth + 1
        )
    );
  }

  if (
    typeof value !== "object"
  ) {
    return [];
  }

  const object =
    value as Record<
      string,
      unknown
    >;

  const directItemKeys = [
    "items",
    "data",
    "products",
    "plans",
    "packages",
    "billers",
    "providers",
    "networks",
    "results",
    "catalog",
    "catalogue",
    "PRODUCT",
  ];

  const directItems: CatalogItem[] =
    [];

  for (
    const key of directItemKeys
  ) {
    if (
      object[key] !== undefined
    ) {
      directItems.push(
        ...flattenCatalog(
          object[key],
          depth + 1
        )
      );
    }
  }

  const looksLikeItem =
    Boolean(
      object.name ||
        object.short_name ||
        object.display_name ||
        object.title ||
        object.label ||
        object.PRODUCT_NAME ||
        object.PRODUCT_CODE ||
        object.item_code ||
        object.itemCode ||
        object.biller_code ||
        object.billerCode ||
        object.network_code ||
        object.networkCode ||
        object.code
    );

  if (
    looksLikeItem
  ) {
    directItems.push(
      object as CatalogItem
    );
  }

  if (
    directItems.length
  ) {
    return directItems;
  }

  /*
   * Handles ClubKonnect's nested form such as:
   *
   * MOBILE_NETWORK: {
   *   MTN: [
   *     {
   *       ID: "01",
   *       PRODUCT: [...]
   *     }
   *   ]
   * }
   */
  return Object.entries(
    object
  ).flatMap(
    ([key, entry]) => {
      if (
        entry &&
        typeof entry === "object"
      ) {
        const flattened =
          flattenCatalog(
            entry,
            depth + 1
          );

        if (
          flattened.length
        ) {
          return flattened.map(
            (item) => ({
              ...item,

              __parentKey:
                key,

              network_name:
                item.network_name ??
                item.networkName ??
                key,
            })
          );
        }

        if (
          Array.isArray(entry)
        ) {
          return entry.map(
            (item) => ({
              ...(item as CatalogItem),
              __parentKey:
                key,
            })
          );
        }
      }

      return [];
    }
  );
}

function dedupeItems(
  items: CatalogItem[]
): CatalogItem[] {
  const map =
    new Map<
      string,
      CatalogItem
    >();

  items.forEach(
    (item, index) => {
      const key =
        cleanString(
          item.item_code ??
            item.itemCode ??
            item.product_code ??
            item.productCode ??
            item.plan_code ??
            item.planCode ??
            item.biller_code ??
            item.billerCode ??
            item.network_code ??
            item.networkCode ??
            item.code ??
            item.id ??
            `${item.name}-${index}`
        );

      if (
        !map.has(key)
      ) {
        map.set(
          key,
          item
        );
      }
    }
  );

  return Array.from(
    map.values()
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
      item.code ??
      item.id
  );
}

function getItemName(
  item: CatalogItem
): string {
  return (
    objectDisplayName(
      item.name ??
        item.short_name ??
        item.shortName ??
        item.display_name ??
        item.displayName ??
        item.title ??
        item.label ??
        item.PRODUCT_NAME
    ) ||
    getItemCode(item) ||
    "Service package"
  );
}

// ============================================================
// DATA PLAN CLASSIFICATION
// ============================================================

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
    item.short_name,
    item.shortName,
    item.description,
    item.plan_type,
    item.planType,
    item.category,
    item.data_type,
    item.dataType,
  ]
    .map(cleanString)
    .join(" ")
    .toLowerCase();

  return (
    /\bhot\b/.test(text) ||
    /hot\s*deal/.test(text) ||
    /hotdeal/.test(text) ||
    /\bsme\b/.test(text)
  );
}

function getDataTab(
  item: CatalogItem
): DataTab | null {
  if (
    isHotDeal(item)
  ) {
    return "HOT";
  }

  const explicit = [
    item.plan_period,
    item.planPeriod,
    item.period,
    item.category,
    item.plan_type,
    item.planType,
  ]
    .map(cleanString)
    .join(" ")
    .toLowerCase();

  const text = [
    getItemName(item),
    item.description,
    item.validity,
    item.duration,
    explicit,
  ]
    .map(cleanString)
    .join(" ")
    .toLowerCase();

  if (
    /extra\s*night|night\s*plan|night/.test(
      text
    )
  ) {
    return "EXTRA NIGHT";
  }

  if (
    /monthly|30\s*days?|31\s*days?|1\s*month|2\s*months?|3\s*months?/.test(
      text
    )
  ) {
    return "MONTHLY";
  }

  if (
    /weekly|7\s*days?|14\s*days?|1\s*week|2\s*weeks?/.test(
      text
    )
  ) {
    return "WEEKLY";
  }

  if (
    /daily|1\s*day|2\s*days?|3\s*days?|24\s*hours?/.test(
      text
    )
  ) {
    return "DAILY";
  }

  return null;
}

// ============================================================
// SERVICE RULES
// ============================================================

function serviceUsesNetwork(
  serviceType: string
): boolean {
  return [
    "airtime",
    "data",
    "airtime-card",
    "data-card",
  ].includes(
    serviceType
  );
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
  ].includes(
    serviceType
  );
}

function serviceIsAmountBased(
  serviceType: string
): boolean {
  return [
    "airtime",
    "electricity",
  ].includes(
    serviceType
  );
}

function serviceUsesQuantity(
  serviceType: string
): boolean {
  return [
    "airtime-card",
    "data-card",
  ].includes(
    serviceType
  );
}

function getCustomerLabel(
  serviceType: string
): string {
  switch (
    serviceType
  ) {
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
      return "Smartcard Number";

    case "smile":
      return "Smile Account / Phone";

    case "internet":
      return "Account Number";

    default:
      return "Customer Number";
  }
}

function getCustomerPlaceholder(
  serviceType: string
): string {
  switch (
    serviceType
  ) {
    case "airtime":
    case "data":
    case "airtime-card":
    case "data-card":
    case "waec":
    case "jamb":
      return "e.g. 08012345678";

    case "electricity":
      return "Enter meter number";

    case "cable":
      return "Enter smartcard number";

    case "smile":
      return "Enter Smile account or phone";

    case "internet":
      return "Enter account number";

    default:
      return "Enter customer number";
  }
}

// ============================================================
// PROVIDER CARD
// ============================================================

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
  const name =
    getProviderDisplayName(
      provider,
      serviceType
    );

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
        <span className="absolute right-1.5 top-1.5 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-gradient-to-r from-[#4C1D95] to-[#2563EB] text-white shadow-sm">
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

              if (
                fallback
              ) {
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

// ============================================================
// PLAN CARD
// ============================================================

function PlanCard({
  item,
  selected,
  onClick,
  disabled,
}: {
  item: CatalogItem;
  selected: boolean;
  onClick: () => void;
  disabled: boolean;
}) {
  const hot =
    isHotDeal(item);

  const price =
    getSellingPrice(item);

  const name =
    getItemName(item);

  const duration =
    cleanString(
      item.validity ??
        item.duration ??
        item.plan_period ??
        item.planPeriod
    );

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "relative min-w-0 overflow-hidden rounded-2xl border bg-white p-3 text-left transition-all duration-200 sm:p-4",
        "hover:-translate-y-0.5 hover:shadow-lg",
        selected
          ? "border-[#6D28D9] bg-[#6D28D9]/[0.025] ring-2 ring-[#6D28D9]/10"
          : "border-slate-200",
        disabled
          ? "cursor-not-allowed opacity-60"
          : "",
      ].join(" ")}
    >
      {hot && (
        <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-1 text-[9px] font-extrabold uppercase tracking-wide text-orange-600">
          <Flame className="h-3 w-3" />
          HOT
        </span>
      )}

      <div className="pr-12">
        <p className="line-clamp-2 min-h-[40px] text-sm font-extrabold text-slate-900">
          {name}
        </p>

        {duration && (
          <p className="mt-1 truncate text-xs font-medium text-slate-500">
            {duration}
          </p>
        )}
      </div>

      <div className="mt-4 flex items-end justify-between gap-2">
        <span className="truncate text-base font-black text-[#4C1D95] sm:text-lg">
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

// ============================================================
// COMPONENT
// ============================================================

const ServicePayment = ({
  service,
  walletBalance,
  onBack,
  onPurchase,
}: ServicePaymentProps) => {
  const { toast } =
    useToast();

  const serviceType =
    service?.type ?? "";

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

  const isSmile =
    serviceType === "smile";

  const isAmountBased =
    serviceIsAmountBased(
      serviceType
    );

  const needsPlans =
    serviceNeedsPlans(
      serviceType
    );

  const usesQuantity =
    serviceUsesQuantity(
      serviceType
    );

  // ==========================================================
  // FORM STATE
  // ==========================================================

  const [
    customer,
    setCustomer,
  ] = useState("");

  const [
    amount,
    setAmount,
  ] = useState("");

  const [
    quantity,
    setQuantity,
  ] = useState(1);

  const [
    customAmountMode,
    setCustomAmountMode,
  ] = useState(false);

  const [
    dataTab,
    setDataTab,
  ] = useState<DataTab>("HOT");

  const [
    examType,
    setExamType,
  ] = useState("");

  // ==========================================================
  // PROVIDER STATE
  // ==========================================================

  const [
    providers,
    setProviders,
  ] = useState<CatalogItem[]>(
    []
  );

  const [
    selectedProviderCode,
    setSelectedProviderCode,
  ] = useState("");

  // ==========================================================
  // PLANS / PACKAGES
  // ==========================================================

  const [
    items,
    setItems,
  ] = useState<CatalogItem[]>(
    []
  );

  const [
    selectedItemCode,
    setSelectedItemCode,
  ] = useState("");

  // ==========================================================
  // LOADING
  // ==========================================================

  const [
    loadingProviders,
    setLoadingProviders,
  ] = useState(false);

  const [
    loadingItems,
    setLoadingItems,
  ] = useState(false);

  const [
    processingPayment,
    setProcessingPayment,
  ] = useState(false);

  // ==========================================================
  // PIN
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

  const [
    error,
    setError,
  ] = useState("");

  // ==========================================================
  // SELECTED PROVIDER
  // ==========================================================

  const selectedProvider =
    useMemo(
      () =>
        providers.find(
          (provider) => {
            const code =
              cleanString(
                provider.network_code ??
                  provider.networkCode ??
                  provider.biller_code ??
                  provider.billerCode ??
                  provider.code
              );

            return (
              code ===
              selectedProviderCode
            );
          }
        ) ?? null,
      [
        providers,
        selectedProviderCode,
      ]
    );

  // ==========================================================
  // SELECTED ITEM
  // ==========================================================

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

  // ==========================================================
  // DATA GROUPS
  // ==========================================================

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

      items.forEach(
        (item) => {
          const group =
            getDataTab(item);

          if (
            group
          ) {
            groups[
              group
            ].push(item);
          }
        }
      );

      return groups;
    }, [items]);

  const visibleDataPlans =
    useMemo(
      () =>
        dataGroups[
          dataTab
        ] ?? [],
      [
        dataGroups,
        dataTab,
      ]
    );

  // ==========================================================
  // CUSTOMER LABEL
  // ==========================================================

  const customerLabel =
    getCustomerLabel(
      serviceType
    );

  const customerPlaceholder =
    getCustomerPlaceholder(
      serviceType
    );

  // ==========================================================
  // RESET
  // ==========================================================

  const resetForm =
    useCallback(() => {
      setCustomer("");
      setAmount("");
      setQuantity(1);
      setCustomAmountMode(false);

      setProviders([]);
      setItems([]);

      setSelectedProviderCode(
        ""
      );

      setSelectedItemCode(
        ""
      );

      setDataTab("HOT");
      setExamType("");

      setError("");

      setLoadingProviders(
        false
      );

      setLoadingItems(false);

      setProcessingPayment(
        false
      );

      setShowPinPrompt(
        false
      );

      setPaymentPin("");
      setVerifyingPin(false);
    }, []);

  useEffect(() => {
    resetForm();
  }, [
    serviceType,
    resetForm,
  ]);

  // ==========================================================
  // CATALOG REQUEST
  // ==========================================================

  const invokeCatalog =
    useCallback(
      async (
        providerCode?: string
      ) => {
        const payload: Record<
          string,
          any
        > = {
          action: "catalog",
          service: serviceType,
          type: serviceType,
          category,
          country: "NG",
        };

        if (
          providerCode
        ) {
          if (
            serviceUsesNetwork(
              serviceType
            )
          ) {
            payload.network_code =
              providerCode;

            payload.networkCode =
              providerCode;
          } else {
            payload.biller_code =
              providerCode;

            payload.billerCode =
              providerCode;
          }
        }

        if (
          serviceType ===
            "waec" ||
          serviceType ===
            "jamb"
        ) {
          payload.exam_type =
            serviceType;
        }

        const {
          data,
          error: functionError,
        } =
          await supabase.functions.invoke(
            "clubkonnect-services",
            {
              body: payload,
            }
          );

        if (
          functionError
        ) {
          throw functionError;
        }

        if (
          !data ||
          data.success !==
            true
        ) {
          throw new Error(
            data?.error ||
              data?.message ||
              "Unable to load service catalogue."
          );
        }

        return data;
      },
      [
        category,
        serviceType,
      ]
    );

  // ==========================================================
  // LOAD PROVIDERS
  // ==========================================================

  const loadProviders =
    useCallback(
      async () => {
        if (
          !serviceType
        ) {
          return;
        }

        setLoadingProviders(
          true
        );

        setError("");

        setProviders([]);
        setItems([]);

        setSelectedProviderCode(
          ""
        );

        setSelectedItemCode(
          ""
        );

        setAmount("");

        try {
          let data:
            any;

          try {
            data =
              await invokeCatalog();
          } catch {
            /*
             * Compatibility fallback for an Edge Function
             * that exposes billers instead of catalog.
             */
            const response =
              await supabase.functions.invoke(
                "clubkonnect-services",
                {
                  body: {
                    action:
                      "billers",
                    service:
                      serviceType,
                    type:
                      serviceType,
                    category,
                    country:
                      "NG",
                  },
                }
              );

            if (
              response.error
            ) {
              throw response.error;
            }

            data =
              response.data;
          }

          if (
            !data ||
            data.success !==
              true
          ) {
            throw new Error(
              data?.error ||
                data?.message ||
                "Unable to load providers."
            );
          }

          const raw =
            data.billers ??
            data.providers ??
            data.networks ??
            data.data ??
            data.catalog ??
            data.catalogue ??
            data;

          let loaded =
            flattenCatalog(
              raw
            );

          /*
           * Explicitly support ClubKonnect's
           * MOBILE_NETWORK object structure.
           */
          if (
            data.MOBILE_NETWORK
          ) {
            loaded =
              flattenCatalog(
                data.MOBILE_NETWORK
              );
          }

          loaded =
            dedupeItems(
              loaded
            ).filter(
              (item) => {
                const code =
                  cleanString(
                    item.network_code ??
                      item.networkCode ??
                      item.biller_code ??
                      item.billerCode ??
                      item.code ??
                      item.ID ??
                      item.id
                  );

                return Boolean(
                  code
                );
              }
            );

          /*
           * For cable, force the four known customer-facing
           * provider labels whenever the API returns
           * object-shaped provider records.
           */
          if (
            isCable
          ) {
            const known =
              [
                "dstv",
                "gotv",
                "startimes",
                "showmax",
              ];

            const cableProviders =
              loaded.filter(
                (item) => {
                  const text =
                    [
                      item.biller_code,
                      item.billerCode,
                      item.code,
                      item.name,
                      item.short_name,
                      item.shortName,
                      item.display_name,
                      item.displayName,
                      item.title,
                      item.label,
                    ]
                      .map(
                        normaliseKey
                      )
                      .join(" ");

                  return known.some(
                    (key) =>
                      text.includes(
                        key
                      )
                  );
                }
              );

            if (
              cableProviders.length
            ) {
              loaded =
                cableProviders;
            }
          }

          setProviders(
            loaded
          );

          if (
            !loaded.length
          ) {
            setError(
              "No service providers are currently available."
            );
          }
        } catch (
          err
        ) {
          console.error(
            "Failed to load service providers:",
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
          setLoadingProviders(
            false
          );
        }
      },
      [
        category,
        invokeCatalog,
        isCable,
        serviceType,
        toast,
      ]
    );

  // ==========================================================
  // LOAD PROVIDERS WHEN SERVICE OPENS
  // ==========================================================

  useEffect(() => {
    if (
      serviceType
    ) {
      void loadProviders();
    }
  }, [
    serviceType,
    loadProviders,
  ]);

  // ==========================================================
  // LOAD PACKAGES AFTER PROVIDER
  // ==========================================================

  const loadItems =
    useCallback(
      async (
        providerCode: string
      ) => {
        if (
          !providerCode
        ) {
          return;
        }

        setLoadingItems(
          true
        );

        setItems([]);
        setSelectedItemCode(
          ""
        );

        setAmount("");
        setError("");

        try {
          let data:
            any;

          try {
            data =
              await invokeCatalog(
                providerCode
              );
          } catch {
            const response =
              await supabase.functions.invoke(
                "clubkonnect-services",
                {
                  body: {
                    action:
                      "items",
                    service:
                      serviceType,
                    type:
                      serviceType,
                    category,
                    country:
                      "NG",
                    ...(serviceUsesNetwork(
                      serviceType
                    )
                      ? {
                          network_code:
                            providerCode,
                          networkCode:
                            providerCode,
                        }
                      : {
                          biller_code:
                            providerCode,
                          billerCode:
                            providerCode,
                        }),
                  },
                }
              );

            if (
              response.error
            ) {
              throw response.error;
            }

            data =
              response.data;
          }

          if (
            !data ||
            data.success !==
              true
          ) {
            throw new Error(
              data?.error ||
                data?.message ||
                "Unable to load packages."
            );
          }

          const raw =
            data.items ??
            data.products ??
            data.plans ??
            data.packages ??
            data.data ??
            data.catalog ??
            data.catalogue ??
            data;

          let loaded =
            dedupeItems(
              flattenCatalog(
                raw
              )
            );

          /*
           * Remove obvious provider-level records from
           * the package list.
           */
          loaded =
            loaded.filter(
              (item) =>
                Boolean(
                  getItemCode(
                    item
                  )
                ) &&
                (
                  getSellingPrice(
                    item
                  ) > 0 ||
                  serviceType ===
                    "waec" ||
                  serviceType ===
                    "jamb"
                )
            );

          setItems(
            loaded
          );

          if (
            !loaded.length &&
            needsPlans
          ) {
            setError(
              "No packages are currently available for this provider."
            );
          }
        } catch (
          err
        ) {
          console.error(
            "Failed to load packages:",
            err
          );

          const message =
            "Unable to load packages.";

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
        category,
        invokeCatalog,
        needsPlans,
        serviceType,
        toast,
      ]
    );

  // ==========================================================
  // PROVIDER SELECT
  // ==========================================================

  const handleProviderSelect =
    async (
      provider: CatalogItem
    ) => {
      if (
        processingPayment ||
        verifyingPin
      ) {
        return;
      }

      const code =
        cleanString(
          provider.network_code ??
            provider.networkCode ??
            provider.biller_code ??
            provider.billerCode ??
            provider.code ??
            provider.ID ??
            provider.id
        );

      if (
        !code
      ) {
        toast({
          title:
            "Invalid provider",
          description:
            "This provider does not have a valid service code.",
          variant:
            "destructive",
        });

        return;
      }

      setSelectedProviderCode(
        code
      );

      setSelectedItemCode(
        ""
      );

      setItems([]);

      setAmount("");

      setCustomAmountMode(
        false
      );

      setError("");

      /*
       * Provider is deliberately selected FIRST.
       * Only after this call do plans/packages appear.
       */
      if (
        needsPlans
      ) {
        await loadItems(
          code
        );
      }
    };

  // ==========================================================
  // PLAN SELECT
  // ==========================================================

  const handlePlanSelect =
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
        getItemCode(
          item
        );

      const price =
        getSellingPrice(
          item
        );

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
  // CUSTOMER NORMALIZATION
  // ==========================================================

  const normaliseCustomer =
    (): string => {
      let value =
        customer.trim();

      if (
        [
          "airtime",
          "data",
          "airtime-card",
          "data-card",
          "waec",
          "jamb",
        ].includes(
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
          return `+234${value.slice(
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

        return value;
      }

      return value;
    };

  // ==========================================================
  // AMOUNT
  // ==========================================================

  const amountNumber =
    numberValue(
      amount
    );

  const selectedItemPrice =
    selectedItem
      ? getSellingPrice(
          selectedItem
        )
      : 0;

  const quantityTotal =
    usesQuantity
      ? amountNumber *
        quantity
      : amountNumber;

  const itemMinimum =
    selectedItem
      ? numberValue(
          selectedItem.minimum
        )
      : 0;

  const itemMaximum =
    selectedItem
      ? numberValue(
          selectedItem.maximum
        )
      : 0;

  // ==========================================================
  // VALIDATION
  // ==========================================================

  const validateForm =
    (): boolean => {
      if (
        !selectedProviderCode
      ) {
        toast({
          title:
            "Select a provider",
          description:
            "Please select a network or service provider first.",
          variant:
            "destructive",
        });

        return false;
      }

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
        [
          "airtime",
          "data",
          "airtime-card",
          "data-card",
          "waec",
          "jamb",
        ].includes(
          serviceType
        )
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
        needsPlans &&
        !selectedItemCode
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

      if (
        isAmountBased &&
        amountNumber <= 0
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
        needsPlans &&
        selectedItemPrice <=
          0
      ) {
        toast({
          title:
            "Invalid package price",
          description:
            "The selected package does not have a valid price.",
          variant:
            "destructive",
        });

        return false;
      }

      if (
        isData &&
        Math.abs(
          amountNumber -
            selectedItemPrice
        ) >
          0.01
      ) {
        toast({
          title:
            "Invalid data price",
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

      if (
        quantity < 1
      ) {
        toast({
          title:
            "Invalid quantity",
          description:
            "Quantity must be at least 1.",
          variant:
            "destructive",
        });

        return false;
      }

      /*
       * walletBalance is intentionally used only as a
       * validation guard. It is NOT displayed in the UI.
       */
      if (
        quantityTotal >
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

      if (
        [
          "waec",
          "jamb",
        ].includes(
          serviceType
        ) &&
        !examType
      ) {
        toast({
          title:
            "Select exam type",
          description:
            "Please select the examination type.",
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
    (): Record<
      string,
      any
    > => {
      const finalCustomer =
        normaliseCustomer();

      const providerCode =
        selectedProviderCode;

      const itemCode =
        selectedItemCode;

      const providerPrice =
        selectedItem
          ? getProviderPrice(
              selectedItem
            )
          : 0;

      const sellingPrice =
        selectedItem
          ? getSellingPrice(
              selectedItem
            )
          : amountNumber;

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

        phone:
          finalCustomer,

        phoneNumber:
          finalCustomer,

        mobile_number:
          finalCustomer,

        network_code:
          serviceUsesNetwork(
            serviceType
          )
            ? providerCode
            : "",

        networkCode:
          serviceUsesNetwork(
            serviceType
          )
            ? providerCode
            : "",

        biller_code:
          serviceUsesNetwork(
            serviceType
          )
            ? ""
            : providerCode,

        billerCode:
          serviceUsesNetwork(
            serviceType
          )
            ? ""
            : providerCode,

        item_code:
          itemCode,

        itemCode:
          itemCode,

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
          cleanString(
            selectedItem?.plan_code ??
              selectedItem?.planCode
          ),

        planCode:
          cleanString(
            selectedItem?.plan_code ??
              selectedItem?.planCode
          ),

        data_plan:
          cleanString(
            selectedItem?.data_plan ??
              selectedItem?.plan_code ??
              selectedItem?.planCode
          ),

        dataPlan:
          cleanString(
            selectedItem?.data_plan ??
              selectedItem?.plan_code ??
              selectedItem?.planCode
          ),

        amount:
          quantityTotal,

        selling_amount:
          quantityTotal,

        sellingAmount:
          quantityTotal,

        price:
          quantityTotal,

        provider_price:
          providerPrice,

        providerPrice:
          providerPrice,

        provider_amount:
          providerPrice,

        providerAmount:
          providerPrice,

        quantity:
          quantity,

        selected_item:
          selectedItem,

        selectedItem:
          selectedItem,

        selected_provider:
          selectedProvider,

        selectedProvider:
          selectedProvider,

        customerLabel:
          customerLabel,

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

        plan_type:
          cleanString(
            selectedItem?.plan_type ??
              selectedItem?.planType
          ),

        is_hot_deal:
          selectedItem
            ? isHotDeal(
                selectedItem
              )
            : false,

        markup:
          SERVICE_MARKUP[
            serviceType
          ] ?? 0,
      };

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

        details.electric_company =
          providerCode;

        details.electricity_company =
          providerCode;
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
          providerCode;

        details.cable_code =
          providerCode;

        details.cableCode =
          providerCode;

        details.package =
          selectedItem
            ? getItemName(
                selectedItem
              )
            : "";

        details.package_code =
          cleanString(
            selectedItem?.package_code ??
              selectedItem?.packageCode ??
              selectedItem?.item_code ??
              selectedItem?.itemCode
          );
      }

      if (
        serviceType ===
        "smile"
      ) {
        details.account_id =
          finalCustomer;

        details.accountId =
          finalCustomer;

        details.smile_account =
          finalCustomer;

        details.smileAccount =
          finalCustomer;
      }

      if (
        serviceType ===
          "waec" ||
        serviceType ===
          "jamb"
      ) {
        details.exam_type =
          examType;

        details.examType =
          examType;
      }

      return details;
    };

  // ==========================================================
  // OPEN PIN
  // ==========================================================

  const handlePurchase =
    () => {
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

  // ==========================================================
  // VERIFY PIN
  // ==========================================================

  const handlePinVerification =
    async () => {
      if (
        !service ||
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
          throw pinError;
        }

        if (
          !data ||
          data.success !==
            true
        ) {
          setPaymentPin("");

          toast({
            title:
              "Payment PIN",
            description:
              data?.message ||
              "Invalid payment PIN.",
            variant:
              "destructive",
          });

          return;
        }

        const details =
          buildPurchaseDetails();

        const total =
          quantityTotal;

        setShowPinPrompt(
          false
        );

        setPaymentPin("");

        setProcessingPayment(
          true
        );

        await onPurchase(
          total,
          details
        );

        resetForm();
      } catch (
        err
      ) {
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
  // NO SERVICE
  // ==========================================================

  if (!service) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F7F8FC] px-4">
        <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#4C1D95] to-[#2563EB] text-white">
            <Smartphone className="h-7 w-7" />
          </div>

          <p className="mb-5 font-medium text-slate-600">
            No payment service selected.
          </p>

          <Button
            onClick={
              onBack
            }
            className="w-full bg-gradient-to-r from-[#4C1D95] via-[#6D28D9] to-[#2563EB]"
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
    <div className="min-h-screen bg-[#F7F8FC] pb-10">
      {/* ======================================================
          HEADER
          ====================================================== */}

      <header className="sticky top-0 z-30 border-b border-white/10 bg-gradient-to-r from-[#4C1D95] via-[#6D28D9] to-[#2563EB] text-white shadow-lg">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <div className="flex h-16 items-center gap-3">
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
              className="rounded-xl text-white hover:bg-white/15 hover:text-white"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>

            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-black">
                {service.title}
              </p>

              <p className="text-[11px] font-medium text-white/70">
                Fast, secure service payment
              </p>
            </div>

            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10">
              <ShieldCheck className="h-5 w-5" />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-5 sm:px-6 sm:py-7">
        {/* ====================================================
            PIN SCREEN
            ==================================================== */}

        {showPinPrompt ? (
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="bg-gradient-to-r from-[#4C1D95] via-[#6D28D9] to-[#2563EB] px-5 py-7 text-center text-white sm:px-8">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15">
                <ShieldCheck className="h-8 w-8" />
              </div>

              <h2 className="text-xl font-black">
                Confirm Payment
              </h2>

              <p className="mt-1 text-sm text-white/75">
                Enter your 4-digit Payment PIN
              </p>
            </div>

            <div className="p-5 sm:p-7">
              <div className="mb-6 rounded-2xl border border-[#6D28D9]/10 bg-[#6D28D9]/[0.035] p-4">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm font-medium text-slate-500">
                    Service
                  </span>

                  <span className="text-right text-sm font-black text-slate-900">
                    {service.title}
                  </span>
                </div>

                <div className="mt-3 flex items-center justify-between gap-4">
                  <span className="text-sm font-medium text-slate-500">
                    Amount
                  </span>

                  <span className="text-lg font-black text-[#4C1D95]">
                    {formatNaira(
                      quantityTotal
                    )}
                  </span>
                </div>

                <div className="mt-3 flex items-center justify-between gap-4">
                  <span className="text-sm font-medium text-slate-500">
                    {customerLabel}
                  </span>

                  <span className="max-w-[60%] break-all text-right text-sm font-bold text-slate-900">
                    {normaliseCustomer()}
                  </span>
                </div>

                {selectedItem && (
                  <div className="mt-3 flex items-center justify-between gap-4">
                    <span className="text-sm font-medium text-slate-500">
                      Package
                    </span>

                    <span className="max-w-[60%] text-right text-sm font-bold text-slate-900">
                      {getItemName(
                        selectedItem
                      )}
                    </span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
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
                  className="h-14 text-center text-2xl tracking-[0.55em]"
                />
              </div>

              {error && (
                <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3">
                  <p className="text-sm font-medium text-red-700">
                    {error}
                  </p>
                </div>
              )}

              <div className="mt-6 space-y-3">
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
                  className="h-12 w-full rounded-xl bg-gradient-to-r from-[#4C1D95] via-[#6D28D9] to-[#2563EB] font-bold shadow-md"
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
                  className="h-12 w-full rounded-xl"
                >
                  Back
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {/* ==================================================
                STEP 1 — PROVIDER
                ================================================== */}

            <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
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
                          : "Choose Provider"}
                    </Label>
                  </div>

                  <p className="ml-8 mt-0.5 text-[10px] text-slate-500 sm:text-xs">
                    Select your preferred service provider.
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
                      verifyingPin
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
                      Loading providers...
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
                            provider.code ??
                            provider.ID ??
                            provider.id
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
                            verifyingPin
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
                    No providers are currently available.
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

            {/* ==================================================
                STEP 2 — CUSTOMER IDENTIFIER
                IMPORTANT: DIRECTLY AFTER PROVIDER
                ================================================== */}

            {selectedProviderCode && (
              <section className="rounded-3xl border border-[#6D28D9]/10 bg-white p-5 shadow-sm sm:p-6">
                <div className="mb-4 flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#6D28D9] text-xs font-black text-white">
                    2
                  </span>

                  <div>
                    <Label
                      htmlFor="serviceCustomer"
                      className="text-base font-black text-slate-900"
                    >
                      {customerLabel}
                    </Label>

                    <p className="text-xs text-slate-500">
                      Enter the details for your selected service.
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
                    className="h-13 rounded-xl border-slate-200 pr-4 text-base"
                  />
                </div>

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
              </section>
            )}

            {/* ==================================================
                STEP 3 — PACKAGE / DATA
                ================================================== */}

            {selectedProviderCode &&
              isData && (
                <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#2563EB] text-xs font-black text-white">
                        3
                      </span>

                      <div>
                        <Label className="text-base font-black text-slate-900">
                          Choose Data Plan
                        </Label>

                        <p className="text-xs text-slate-500">
                          Select from the live available plans.
                        </p>
                      </div>
                    </div>

                    {loadingItems && (
                      <Loader2 className="h-5 w-5 animate-spin text-[#6D28D9]" />
                    )}
                  </div>

                  <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
                    {DATA_TABS.map(
                      (tab) => {
                        const count =
                          dataGroups[
                            tab
                          ]?.length ??
                          0;

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
                              "shrink-0 rounded-full border px-3 py-2 text-[11px] font-extrabold transition-all",
                              dataTab ===
                              tab
                                ? "border-[#6D28D9] bg-[#6D28D9] text-white shadow-sm"
                                : "border-slate-200 bg-white text-slate-600 hover:border-[#6D28D9]/30",
                            ].join(
                              " "
                            )}
                          >
                            {tab ===
                              "HOT" && (
                              <Flame className="mr-1 inline h-3.5 w-3.5" />
                            )}

                            {tab}

                            <span className="ml-1 opacity-60">
                              ({count})
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
                        (
                          item
                        ) => (
                          <div
                            key={
                              item
                            }
                            className="h-32 animate-pulse rounded-2xl bg-slate-100"
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
                          <PlanCard
                            key={`${getItemCode(
                              item
                            )}-${index}`}
                            item={
                              item
                            }
                            selected={
                              getItemCode(
                                item
                              ) ===
                              selectedItemCode
                            }
                            onClick={() =>
                              handlePlanSelect(
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
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-7 text-center">
                      <p className="text-sm font-medium text-slate-500">
                        No plans are currently available in this category.
                      </p>
                    </div>
                  )}
                </section>
              )}

            {/* ==================================================
                STEP 3 — OTHER PACKAGES
                ================================================== */}

            {selectedProviderCode &&
              !isData &&
              needsPlans && (
                <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                  <div className="mb-4 flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#2563EB] text-xs font-black text-white">
                      3
                    </span>

                    <div>
                      <Label className="text-base font-black text-slate-900">
                        Choose Package
                      </Label>

                      <p className="text-xs text-slate-500">
                        Select the service package you want.
                      </p>
                    </div>

                    {loadingItems && (
                      <Loader2 className="ml-auto h-5 w-5 animate-spin text-[#6D28D9]" />
                    )}
                  </div>

                  <select
                    value={
                      selectedItemCode
                    }
                    onChange={(
                      event
                    ) => {
                      const code =
                        event.target.value;

                      const item =
                        items.find(
                          (
                            entry
                          ) =>
                            getItemCode(
                              entry
                            ) ===
                            code
                        );

                      setSelectedItemCode(
                        code
                      );

                      setAmount(
                        item
                          ? String(
                              getSellingPrice(
                                item
                              )
                            )
                          : ""
                      );

                      setError("");
                    }}
                    disabled={
                      loadingItems ||
                      processingPayment ||
                      verifyingPin ||
                      !items.length
                    }
                    className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium outline-none focus:border-[#6D28D9] focus:ring-2 focus:ring-[#6D28D9]/10"
                  >
                    <option value="">
                      {loadingItems
                        ? "Loading packages..."
                        : "Select package"}
                    </option>

                    {items.map(
                      (
                        item,
                        index
                      ) => {
                        const code =
                          getItemCode(
                            item
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
                            {getItemName(
                              item
                            )}{" "}
                            —{" "}
                            {formatNaira(
                              getSellingPrice(
                                item
                              )
                            )}
                          </option>
                        );
                      }
                    )}
                  </select>
                </section>
              )}

            {/* ==================================================
                EXAM TYPE
                ================================================== */}

            {selectedProviderCode &&
              [
                "waec",
                "jamb",
              ].includes(
                serviceType
              ) && (
                <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                  <div className="mb-4 flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#2563EB] text-xs font-black text-white">
                      3
                    </span>

                    <div>
                      <Label className="text-base font-black text-slate-900">
                        Examination Type
                      </Label>

                      <p className="text-xs text-slate-500">
                        Select the examination category.
                      </p>
                    </div>
                  </div>

                  <select
                    value={
                      examType
                    }
                    onChange={(
                      event
                    ) =>
                      setExamType(
                        event.target.value
                      )
                    }
                    disabled={
                      processingPayment ||
                      verifyingPin
                    }
                    className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium outline-none focus:border-[#6D28D9] focus:ring-2 focus:ring-[#6D28D9]/10"
                  >
                    <option value="">
                      Select examination type
                    </option>

                    {serviceType ===
                      "waec" && (
                      <option value="waec">
                        WAEC
                      </option>
                    )}

                    {serviceType ===
                      "jamb" && (
                      <>
                        <option value="de">
                          JAMB Direct Entry
                        </option>

                        <option value="utme-mock">
                          UTME Mock
                        </option>

                        <option value="utme-no-mock">
                          UTME No Mock
                        </option>
                      </>
                    )}
                  </select>
                </section>
              )}

            {/* ==================================================
                AMOUNT
                ================================================== */}

            {selectedProviderCode &&
              (isAmountBased ||
                usesQuantity) && (
                <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                  <div className="mb-4 flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#2563EB] text-xs font-black text-white">
                      3
                    </span>

                    <div>
                      <Label className="text-base font-black text-slate-900">
                        {usesQuantity
                          ? "Choose Amount"
                          : "Enter Amount"}
                      </Label>

                      <p className="text-xs text-slate-500">
                        Select or enter the amount you want.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {(isAirtime
                      ? AIRTIME_AMOUNTS
                      : GENERAL_AMOUNTS
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
                            "rounded-xl border p-3 text-center text-sm font-black transition-all",
                            amount ===
                            String(
                              value
                            )
                              ? "border-[#6D28D9] bg-[#6D28D9]/5 text-[#4C1D95] ring-1 ring-[#6D28D9]"
                              : "border-slate-200 text-slate-700 hover:border-[#6D28D9]/30 hover:bg-[#6D28D9]/[0.02]",
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
                        "rounded-xl border p-3 text-center text-sm font-black transition-all",
                        customAmountMode
                          ? "border-[#6D28D9] bg-[#6D28D9]/5 text-[#4C1D95] ring-1 ring-[#6D28D9]"
                          : "border-slate-200 text-slate-700 hover:border-[#6D28D9]/30",
                      ].join(
                        " "
                      )}
                    >
                      Enter Amount
                    </button>
                  </div>

                  {customAmountMode && (
                    <div className="mt-3">
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
                        className="h-12 rounded-xl"
                      />
                    </div>
                  )}

                  {usesQuantity && (
                    <div className="mt-5">
                      <Label>
                        Quantity
                      </Label>

                      <div className="mt-2 flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() =>
                            setQuantity(
                              (value) =>
                                Math.max(
                                  1,
                                  value -
                                    1
                                )
                            )
                          }
                          disabled={
                            processingPayment ||
                            verifyingPin ||
                            quantity <=
                              1
                          }
                          className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-lg font-black disabled:opacity-40"
                        >
                          −
                        </button>

                        <div className="flex h-11 min-w-[64px] items-center justify-center rounded-xl bg-slate-50 text-sm font-black text-slate-900">
                          {quantity}
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            setQuantity(
                              (value) =>
                                Math.min(
                                  100,
                                  value +
                                    1
                                )
                            )
                          }
                          disabled={
                            processingPayment ||
                            verifyingPin ||
                            quantity >=
                              100
                          }
                          className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-lg font-black disabled:opacity-40"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  )}

                  {(
                    itemMinimum >
                      0 ||
                    itemMaximum >
                      0
                  ) && (
                    <p className="mt-3 text-xs font-medium text-slate-500">
                      {itemMinimum >
                        0 &&
                        `Minimum: ${formatNaira(
                          itemMinimum
                        )}`}

                      {itemMinimum >
                        0 &&
                        itemMaximum >
                          0 &&
                        " • "}

                      {itemMaximum >
                        0 &&
                        `Maximum: ${formatNaira(
                          itemMaximum
                        )}`}
                    </p>
                  )}
                </section>
              )}

            {/* ==================================================
                SELECTED PACKAGE SUMMARY
                ================================================== */}

            {selectedItem && (
              <section className="rounded-3xl border border-[#6D28D9]/10 bg-white p-5 shadow-sm sm:p-6">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Selected
                    </p>

                    <h3 className="mt-1 text-base font-black text-slate-900">
                      {getItemName(
                        selectedItem
                      )}
                    </h3>
                  </div>

                  <span className="rounded-xl bg-[#6D28D9]/10 px-3 py-2 text-sm font-black text-[#4C1D95]">
                    {formatNaira(
                      getSellingPrice(
                        selectedItem
                      )
                    )}
                  </span>
                </div>

                <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                  <span className="text-sm font-medium text-slate-500">
                    Total
                  </span>

                  <span className="text-lg font-black text-[#4C1D95]">
                    {formatNaira(
                      quantityTotal
                    )}
                  </span>
                </div>
              </section>
            )}

            {/* ==================================================
                ERROR
                ================================================== */}

            {error && (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
                <p className="text-sm font-semibold text-red-700">
                  {error}
                </p>
              </div>
            )}

            {/* ==================================================
                PAYMENT SUMMARY
                ================================================== */}

            {selectedProviderCode &&
              customer.trim() &&
              ((isAmountBased &&
                amountNumber >
                  0) ||
                selectedItem) && (
                <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-100 bg-slate-50 px-5 py-4">
                    <p className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                      Payment Summary
                    </p>
                  </div>

                  <div className="space-y-4 p-5">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-sm text-slate-500">
                        Provider
                      </span>

                      <span className="text-sm font-black text-slate-900">
                        {selectedProvider
                          ? getProviderDisplayName(
                              selectedProvider,
                              serviceType
                            )
                          : "-"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-4">
                      <span className="text-sm text-slate-500">
                        {customerLabel}
                      </span>

                      <span className="max-w-[60%] break-all text-right text-sm font-bold text-slate-900">
                        {normaliseCustomer()}
                      </span>
                    </div>

                    <div className="border-t border-slate-100 pt-4">
                      <div className="flex items-end justify-between gap-4">
                        <span className="text-sm font-bold text-slate-600">
                          Amount to pay
                        </span>

                        <span className="text-2xl font-black text-[#4C1D95]">
                          {formatNaira(
                            quantityTotal
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                </section>
              )}

            {/* ==================================================
                PURCHASE BUTTON
                ================================================== */}

            <Button
              type="button"
              onClick={
                handlePurchase
              }
              disabled={
                loadingProviders ||
                loadingItems ||
                processingPayment ||
                verifyingPin ||
                !selectedProviderCode ||
                !customer.trim() ||
                (needsPlans &&
                  !selectedItemCode) ||
                (isAmountBased &&
                  amountNumber <=
                    0)
              }
              className="h-13 w-full rounded-2xl bg-gradient-to-r from-[#4C1D95] via-[#6D28D9] to-[#2563EB] text-sm font-black shadow-lg shadow-[#4C1D95]/15 transition-all hover:opacity-95"
            >
              {processingPayment ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  Continue to Payment
                  <ChevronRight className="ml-2 h-5 w-5" />
                </>
              )}
            </Button>

            <div className="flex items-center justify-center gap-2 pb-2 text-center text-[11px] font-medium text-slate-400">
              <ShieldCheck className="h-3.5 w-3.5" />
              Secure payment protected by your Payment PIN
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default ServicePayment;
