import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Cable,
  Check,
  ChevronDown,
  CircleAlert,
  CreditCard,
  FileCheck2,
  Flame,
  GraduationCap,
  Landmark,
  Lightbulb,
  Loader2,
  Phone,
  RefreshCw,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Tv,
  Wifi,
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
  | "EXTRA_NIGHT"
  | "DAILY"
  | "WEEKLY"
  | "MONTHLY";

interface CatalogueItem {
  id?: string | number;
  code?: string;
  item_code?: string;
  itemCode?: string;

  name?: string;
  short_name?: string;
  description?: string;

  price?: number | string;
  amount?: number | string;

  selling_price?: number | string;
  sellingPrice?: number | string;

  provider_price?: number | string;
  providerPrice?: number | string;

  minimum?: number | string;
  maximum?: number | string;

  validity?: string | number;
  validity_days?: number | string;
  validityDays?: number | string;

  duration?: string | number;

  period?: string;
  plan_period?: string;
  planPeriod?: string;

  plan_type?: string;
  planType?: string;

  network_code?: string;
  networkCode?: string;

  biller_code?: string;
  billerCode?: string;

  product_code?: string;
  productCode?: string;

  variation_code?: string;
  variationCode?: string;

  data_plan?: string;
  dataPlan?: string;

  exam_type?: string;
  examType?: string;

  cable_code?: string;
  cableCode?: string;

  is_hot_deal?: boolean | string | number;
  isHotDeal?: boolean | string | number;

  label_name?: string;
  labelName?: string;

  logo?: string | null;
  logo_url?: string | null;
  logoUrl?: string | null;

  [key: string]: any;
}

interface Biller {
  id?: string | number;

  name?: string;
  short_name?: string;
  display_name?: string;
  displayName?: string;

  biller_code?: string;
  billerCode?: string;

  network_code?: string;
  networkCode?: string;

  logo?: string | null;
  logo_url?: string | null;
  logoUrl?: string | null;

  description?: string;

  [key: string]: any;
}

interface ServiceMeta {
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  accent: string;
  inputLabel: string;
  inputPlaceholder: string;
}

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

const LIVE_SERVICES = new Set<ServiceType>([
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

const COMING_SOON_SERVICES = new Set<ServiceType>([
  "internet",
  "insurance",
  "savings",
]);

const NETWORK_SERVICES = new Set<ServiceType>([
  "airtime",
  "data",
  "airtime-card",
  "data-card",
]);

const PLAN_SERVICES = new Set<ServiceType>([
  "data",
  "cable",
  "airtime-card",
  "data-card",
  "smile",
  "waec",
  "jamb",
]);

const AMOUNT_SERVICES = new Set<ServiceType>([
  "airtime",
  "electricity",
]);

const QUANTITY_SERVICES = new Set<ServiceType>([
  "airtime-card",
  "data-card",
]);

const PREMIUM_SERVICES = new Set<ServiceType>([
  "airtime-card",
  "data-card",
  "smile",
  "waec",
  "jamb",
]);

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
  "EXTRA_NIGHT",
  "DAILY",
  "WEEKLY",
  "MONTHLY",
];

const SERVICE_META: Record<ServiceType, ServiceMeta> = {
  airtime: {
    icon: Smartphone,
    description: "Recharge any Nigerian mobile line instantly.",
    accent: "from-[#5b21b6] to-[#2563eb]",
    inputLabel: "Phone Number",
    inputPlaceholder: "08012345678",
  },
  data: {
    icon: Wifi,
    description: "Choose a data bundle that fits your needs.",
    accent: "from-[#5b21b6] to-[#2563eb]",
    inputLabel: "Phone Number",
    inputPlaceholder: "08012345678",
  },
  electricity: {
    icon: Lightbulb,
    description: "Pay your electricity bill securely.",
    accent: "from-[#6d28d9] to-[#2563eb]",
    inputLabel: "Meter Number",
    inputPlaceholder: "Enter meter number",
  },
  cable: {
    icon: Tv,
    description: "Renew your TV subscription in seconds.",
    accent: "from-[#4c1d95] to-[#2563eb]",
    inputLabel: "Smartcard Number",
    inputPlaceholder: "Enter smartcard number",
  },
  "airtime-card": {
    icon: CreditCard,
    description: "Generate airtime recharge cards instantly.",
    accent: "from-[#5b21b6] to-[#2563eb]",
    inputLabel: "Phone Number",
    inputPlaceholder: "08012345678",
  },
  "data-card": {
    icon: CreditCard,
    description: "Generate data recharge cards instantly.",
    accent: "from-[#5b21b6] to-[#2563eb]",
    inputLabel: "Phone Number",
    inputPlaceholder: "08012345678",
  },
  smile: {
    icon: Wifi,
    description: "Purchase Smile internet packages.",
    accent: "from-[#4c1d95] to-[#2563eb]",
    inputLabel: "Smile Account",
    inputPlaceholder: "Enter Smile account",
  },
  waec: {
    icon: GraduationCap,
    description: "Purchase WAEC examination PINs.",
    accent: "from-[#5b21b6] to-[#2563eb]",
    inputLabel: "Phone Number",
    inputPlaceholder: "08012345678",
  },
  jamb: {
    icon: GraduationCap,
    description: "Purchase JAMB examination services.",
    accent: "from-[#4c1d95] to-[#2563eb]",
    inputLabel: "Phone Number",
    inputPlaceholder: "08012345678",
  },
  internet: {
    icon: Wifi,
    description: "Internet subscriptions are coming soon.",
    accent: "from-[#5b21b6] to-[#2563eb]",
    inputLabel: "Account Number",
    inputPlaceholder: "Enter account number",
  },
  insurance: {
    icon: ShieldCheck,
    description: "Insurance services are coming soon.",
    accent: "from-[#5b21b6] to-[#2563eb]",
    inputLabel: "Customer ID",
    inputPlaceholder: "Enter customer ID",
  },
  savings: {
    icon: Landmark,
    description: "Savings services are coming soon.",
    accent: "from-[#5b21b6] to-[#2563eb]",
    inputLabel: "Customer ID",
    inputPlaceholder: "Enter customer ID",
  },
};

const NETWORK_LOGOS: Record<string, string> = {
  mtn: "https://upload.wikimedia.org/wikipedia/commons/a/af/MTN_Logo.svg",
  glo: "https://upload.wikimedia.org/wikipedia/commons/8/86/GloLogo.png",
  airtel:
    "https://upload.wikimedia.org/wikipedia/commons/f/fb/Bharti_Airtel_Logo.svg",
  "9mobile":
    "https://images.seeklogo.com/logo-png/48/1/9mobile-logo-png_seeklogo-481168.png",
};

const BILLER_LOGOS: Record<string, string> = {
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

function cleanString(value: unknown): string {
  return String(value ?? "").trim();
}

function numberValue(value: unknown): number {
  const result = Number(value);

  return Number.isFinite(result) ? result : 0;
}

function formatNaira(value: number): string {
  return `₦${Number(value).toLocaleString("en-NG")}`;
}

function isTrueFlag(value: unknown): boolean {
  if (value === true) return true;

  if (typeof value === "number") {
    return value === 1;
  }

  if (typeof value === "string") {
    return ["true", "1", "yes"].includes(
      value.trim().toLowerCase()
    );
  }

  return false;
}

function getItemCode(item: CatalogueItem): string {
  return cleanString(
    item.item_code ??
      item.itemCode ??
      item.product_code ??
      item.productCode ??
      item.code ??
      item.id
  );
}

function getItemName(item: CatalogueItem): string {
  return cleanString(
    item.name ??
      item.short_name ??
      item.description ??
      item.data_plan ??
      item.dataPlan ??
      getItemCode(item)
  );
}

function getSellingPrice(item: CatalogueItem): number {
  return numberValue(
    item.selling_price ??
      item.sellingPrice ??
      item.price ??
      item.amount
  );
}

function getProviderPrice(item: CatalogueItem): number {
  return numberValue(
    item.provider_price ??
      item.providerPrice ??
      item.amount ??
      item.price
  );
}

function getBillerCode(item: Biller | CatalogueItem): string {
  return cleanString(
    item.biller_code ??
      item.billerCode ??
      item.network_code ??
      item.networkCode
  );
}

function getNetworkCode(item: Biller | CatalogueItem): string {
  return cleanString(
    item.network_code ??
      item.networkCode ??
      item.biller_code ??
      item.billerCode
  );
}

function normalizeNetworkName(value: unknown): string {
  const key = cleanString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

  if (key.includes("mtn")) return "MTN";
  if (key.includes("glo") || key.includes("globacom")) return "Glo";
  if (key.includes("airtel")) return "Airtel";
  if (
    key.includes("9mobile") ||
    key.includes("etisalat") ||
    key.includes("m9mobile")
  ) {
    return "9mobile";
  }

  return cleanString(value);
}

function networkLogo(value: unknown): string | null {
  const name = normalizeNetworkName(value).toLowerCase();

  if (name === "mtn") return NETWORK_LOGOS.mtn;
  if (name === "glo") return NETWORK_LOGOS.glo;
  if (name === "airtel") return NETWORK_LOGOS.airtel;
  if (name === "9mobile") return NETWORK_LOGOS["9mobile"];

  return null;
}

function billerLogo(value: unknown): string | null {
  const key = cleanString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

  if (key.includes("dstv")) return BILLER_LOGOS.dstv;
  if (key.includes("gotv")) return BILLER_LOGOS.gotv;
  if (key.includes("startime")) return BILLER_LOGOS.startimes;
  if (key.includes("showmax")) return BILLER_LOGOS.showmax;
  if (key.includes("smile")) return BILLER_LOGOS.smile;

  return null;
}

function isVariableItem(item: CatalogueItem): boolean {
  const code = getItemCode(item).toLowerCase();

  const text = [
    item.name,
    item.short_name,
    item.description,
    item.data_plan,
    item.dataPlan,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    code === "__variable__" ||
    code === "variable" ||
    code === "variable_amount" ||
    /variable\s*amount/.test(text) ||
    /enter\s*amount/.test(text) ||
    /any\s*amount/.test(text)
  );
}

function getDataPeriod(item: CatalogueItem): DataTab | "OTHER" {
  const explicit = cleanString(
    item.plan_period ??
      item.planPeriod ??
      item.period
  ).toLowerCase();

  const text = [
    item.name,
    item.short_name,
    item.description,
    item.validity,
    item.duration,
    item.plan_type,
    item.planType,
    explicit,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (
    isTrueFlag(item.is_hot_deal ?? item.isHotDeal) ||
    /\bsme\b/.test(text) ||
    /hot\s*deal/.test(text) ||
    /hotdeal/.test(text)
  ) {
    return "HOT";
  }

  if (
    explicit.includes("night") ||
    text.includes("extra night") ||
    text.includes("night plan")
  ) {
    return "EXTRA_NIGHT";
  }

  if (
    explicit.includes("daily") ||
    /\b1\s*day\b/.test(text) ||
    /\b2\s*days?\b/.test(text) ||
    /\b3\s*days?\b/.test(text)
  ) {
    return "DAILY";
  }

  if (
    explicit.includes("weekly") ||
    /\b7\s*days?\b/.test(text) ||
    /\b14\s*days?\b/.test(text)
  ) {
    return "WEEKLY";
  }

  if (
    explicit.includes("monthly") ||
    /\b30\s*days?\b/.test(text) ||
    /\b31\s*days?\b/.test(text) ||
    /\bmonth\b/.test(text)
  ) {
    return "MONTHLY";
  }

  return "OTHER";
}

function normalizePhone(value: string): string {
  const cleaned = value.replace(/\s+/g, "").trim();

  if (/^\+234\d{10}$/.test(cleaned)) {
    return cleaned;
  }

  if (/^234\d{10}$/.test(cleaned)) {
    return `+${cleaned}`;
  }

  if (/^0\d{10}$/.test(cleaned)) {
    return `+234${cleaned.slice(1)}`;
  }

  if (/^\d{10}$/.test(cleaned)) {
    return `+234${cleaned}`;
  }

  return cleaned;
}

function serviceInputLabel(
  serviceType: ServiceType,
  selectedItem?: CatalogueItem | null
): string {
  const custom = cleanString(
    selectedItem?.label_name ??
      selectedItem?.labelName
  );

  if (custom) return custom;

  return SERVICE_META[serviceType]?.inputLabel ?? "Customer ID";
}

function serviceInputPlaceholder(
  serviceType: ServiceType
): string {
  return (
    SERVICE_META[serviceType]?.inputPlaceholder ??
    "Enter customer information"
  );
}

function getServiceIcon(serviceType: ServiceType) {
  return SERVICE_META[serviceType]?.icon ?? Sparkles;
}

function getServiceTitle(service: ServicePaymentProps["service"]): string {
  return cleanString(service?.title) || "Service";
}

function getPlanDescription(item: CatalogueItem): string {
  return cleanString(
    item.validity ??
      item.duration ??
      item.plan_period ??
      item.planPeriod ??
      item.plan_type ??
      item.planType
  );
}

function getPlanBadge(item: CatalogueItem): string {
  if (isTrueFlag(item.is_hot_deal ?? item.isHotDeal)) {
    return "HOT DEAL";
  }

  const type = cleanString(
    item.plan_type ?? item.planType
  );

  if (type) return type;

  const period = getDataPeriod(item);

  if (period === "EXTRA_NIGHT") return "EXTRA NIGHT";
  if (period === "DAILY") return "DAILY";
  if (period === "WEEKLY") return "WEEKLY";
  if (period === "MONTHLY") return "MONTHLY";

  return "";
}

function isComingSoon(type: ServiceType): boolean {
  return COMING_SOON_SERVICES.has(type);
}

function ServiceHero({
  serviceType,
  title,
}: {
  serviceType: ServiceType;
  title: string;
}) {
  const Icon = getServiceIcon(serviceType);
  const meta = SERVICE_META[serviceType];

  return (
    <div className="relative overflow-hidden rounded-[28px] bg-white shadow-[0_16px_50px_rgba(76,29,149,0.10)] ring-1 ring-slate-100">
      <div
        className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${meta.accent}`}
      />

      <div className="relative flex items-center gap-4 p-5 sm:p-6">
        <div
          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${meta.accent} text-white shadow-lg shadow-purple-500/20`}
        >
          <Icon className="h-7 w-7" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-xl font-extrabold tracking-tight text-slate-950 sm:text-2xl">
              {title}
            </h1>

            {PREMIUM_SERVICES.has(serviceType) && (
              <span className="hidden shrink-0 items-center gap-1 rounded-full bg-purple-50 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-purple-700 sm:inline-flex">
                <Sparkles className="h-3 w-3" />
                Premium
              </span>
            )}
          </div>

          <p className="mt-1 text-sm leading-5 text-slate-500">
            {meta.description}
          </p>
        </div>
      </div>
    </div>
  );
}

function SelectorCard({
  item,
  selected,
  disabled,
  onClick,
  networkMode,
}: {
  item: Biller | CatalogueItem;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
  networkMode?: boolean;
}) {
  const rawName =
    item.name ??
    item.short_name ??
    item.display_name ??
    item.displayName ??
    item.biller_code ??
    item.network_code ??
    "Service";

  const name = networkMode
    ? normalizeNetworkName(rawName)
    : cleanString(rawName);

  const logo =
    cleanString(
      item.logo ??
        item.logo_url ??
        item.logoUrl
    ) ||
    (networkMode
      ? networkLogo(rawName)
      : billerLogo(rawName));

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={[
        "group relative min-w-0 overflow-hidden rounded-2xl border bg-white p-3 text-left transition-all duration-200",
        "hover:-translate-y-0.5 hover:border-purple-300 hover:shadow-[0_10px_28px_rgba(91,33,182,0.10)]",
        selected
          ? "border-purple-500 bg-purple-50/60 ring-2 ring-purple-500/15"
          : "border-slate-200",
        disabled ? "cursor-not-allowed opacity-60" : "",
      ].join(" ")}
    >
      {selected && (
        <span className="absolute right-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-[#5b21b6] to-[#2563eb] text-white shadow-sm">
          <Check className="h-3 w-3 stroke-[3]" />
        </span>
      )}

      <div className="flex justify-center">
        <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
          {logo ? (
            <img
              src={logo}
              alt=""
              aria-hidden="true"
              className="h-9 w-9 object-contain"
              loading="eager"
              referrerPolicy="no-referrer"
              onError={(event) => {
                event.currentTarget.style.display = "none";

                const fallback =
                  event.currentTarget
                    .nextElementSibling as HTMLElement | null;

                if (fallback) {
                  fallback.style.display = "flex";
                }
              }}
            />
          ) : null}

          <span
            className="items-center justify-center text-sm font-black text-purple-700"
            style={{
              display: logo ? "none" : "flex",
            }}
          >
            {name
              .slice(0, 2)
              .toUpperCase()}
          </span>
        </div>
      </div>

      <p className="mt-2 truncate text-center text-[11px] font-bold text-slate-700 sm:text-xs">
        {name}
      </p>
    </button>
  );
}

function DataPlanCard({
  item,
  selected,
  disabled,
  onClick,
}: {
  item: CatalogueItem;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const name = getItemName(item);
  const price = getSellingPrice(item);
  const description = getPlanDescription(item);
  const badge = getPlanBadge(item);
  const hot =
    badge === "HOT DEAL" ||
    isTrueFlag(item.is_hot_deal ?? item.isHotDeal);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={[
        "relative min-w-0 overflow-hidden rounded-[22px] border bg-white p-4 text-left transition-all duration-200",
        "hover:-translate-y-0.5 hover:shadow-[0_14px_35px_rgba(76,29,149,0.10)]",
        selected
          ? "border-purple-500 bg-purple-50/50 ring-2 ring-purple-500/15"
          : "border-slate-200",
        disabled ? "cursor-not-allowed opacity-60" : "",
      ].join(" ")}
    >
      {hot && (
        <div className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-orange-50 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-orange-600">
          <Flame className="h-3 w-3" />
          Hot
        </div>
      )}

      <div className="pr-14">
        <p className="line-clamp-2 min-h-[40px] text-sm font-extrabold leading-5 text-slate-950">
          {name}
        </p>

        {description && (
          <p className="mt-1 line-clamp-1 text-[11px] font-medium text-slate-500">
            {description}
          </p>
        )}

        {badge && !hot && (
          <span className="mt-2 inline-flex rounded-full bg-purple-50 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-purple-700">
            {badge}
          </span>
        )}
      </div>

      <div className="mt-5 flex items-end justify-between gap-2">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
            Price
          </p>

          <p className="mt-0.5 text-lg font-black tracking-tight text-purple-700">
            {formatNaira(price)}
          </p>
        </div>

        <span
          className={[
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-all",
            selected
              ? "border-purple-600 bg-gradient-to-br from-[#5b21b6] to-[#2563eb] text-white"
              : "border-slate-200 bg-white text-slate-300",
          ].join(" ")}
        >
          {selected && (
            <Check className="h-4 w-4 stroke-[3]" />
          )}
        </span>
      </div>
    </button>
  );
}

function AmountButton({
  amount,
  selected,
  disabled,
  onClick,
}: {
  amount: number;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={[
        "rounded-2xl border px-3 py-3.5 text-sm font-extrabold transition-all",
        "hover:-translate-y-0.5 hover:border-purple-300 hover:shadow-sm",
        selected
          ? "border-purple-500 bg-purple-50 text-purple-700 ring-2 ring-purple-500/10"
          : "border-slate-200 bg-white text-slate-700",
        disabled ? "cursor-not-allowed opacity-60" : "",
      ].join(" ")}
    >
      {formatNaira(amount)}
    </button>
  );
}

const ServicePayment = ({
  service,
  onBack,
  onPurchase,
}: ServicePaymentProps) => {
  const { toast } = useToast();

  const serviceType = cleanString(
    service?.type
  ) as ServiceType;

  const category =
    SERVICE_CATEGORY_MAP[serviceType] ?? "";

  const [customer, setCustomer] =
    useState("");

  const [amount, setAmount] =
    useState("");

  const [quantity, setQuantity] =
    useState("1");

  const [customAmountMode, setCustomAmountMode] =
    useState(false);

  const [billers, setBillers] =
    useState<Biller[]>([]);

  const [items, setItems] =
    useState<CatalogueItem[]>([]);

  const [
    selectedBillerCode,
    setSelectedBillerCode,
  ] = useState("");

  const [
    selectedItemCode,
    setSelectedItemCode,
  ] = useState("");

  const [dataTab, setDataTab] =
    useState<DataTab>("HOT");

  const [search, setSearch] =
    useState("");

  const [loadingBillers, setLoadingBillers] =
    useState(false);

  const [loadingItems, setLoadingItems] =
    useState(false);

  const [processingPayment, setProcessingPayment] =
    useState(false);

  const [verifyingPin, setVerifyingPin] =
    useState(false);

  const [showPinPrompt, setShowPinPrompt] =
    useState(false);

  const [paymentPin, setPaymentPin] =
    useState("");

  const [error, setError] =
    useState("");

  const isLive =
    LIVE_SERVICES.has(serviceType);

  const isData =
    serviceType === "data";

  const isAirtime =
    serviceType === "airtime";

  const isElectricity =
    serviceType === "electricity";

  const isCable =
    serviceType === "cable";

  const isAmountBased =
    AMOUNT_SERVICES.has(serviceType);

  const usesNetwork =
    NETWORK_SERVICES.has(serviceType);

  const needsPlans =
    PLAN_SERVICES.has(serviceType);

  const usesQuantity =
    QUANTITY_SERVICES.has(serviceType);

  const selectedBiller = useMemo(
    () =>
      billers.find(
        (entry) =>
          getBillerCode(entry) ===
          selectedBillerCode
      ) ?? null,
    [billers, selectedBillerCode]
  );

  const selectedItem = useMemo(
    () =>
      items.find(
        (entry) =>
          getItemCode(entry) ===
          selectedItemCode
      ) ?? null,
    [items, selectedItemCode]
  );

  const filteredBillers = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return billers;

    return billers.filter((item) =>
      [
        item.name,
        item.short_name,
        item.display_name,
        item.displayName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [billers, search]);

  const dataGroups = useMemo(() => {
    const groups: Record<
      DataTab,
      CatalogueItem[]
    > = {
      HOT: [],
      EXTRA_NIGHT: [],
      DAILY: [],
      WEEKLY: [],
      MONTHLY: [],
    };

    items.forEach((item) => {
      if (!getItemCode(item)) return;
      if (isVariableItem(item)) return;

      const period = getDataPeriod(item);

      if (
        period === "HOT" ||
        period === "EXTRA_NIGHT" ||
        period === "DAILY" ||
        period === "WEEKLY" ||
        period === "MONTHLY"
      ) {
        groups[period].push(item);
      }
    });

    return groups;
  }, [items]);

  const visibleDataPlans =
    dataGroups[dataTab];

  const amountNumber =
    Number(amount);

  const selectedItemPrice =
    selectedItem
      ? getSellingPrice(selectedItem)
      : 0;

  const minimumAmount =
    selectedItem
      ? numberValue(selectedItem.minimum)
      : 0;

  const maximumAmount =
    selectedItem
      ? numberValue(selectedItem.maximum)
      : 0;

  const meta =
    SERVICE_META[serviceType] ??
    SERVICE_META.airtime;

  const inputLabel =
    serviceInputLabel(
      serviceType,
      selectedItem
    );

  const inputPlaceholder =
    serviceInputPlaceholder(serviceType);

  const resetForm = useCallback(() => {
    setCustomer("");
    setAmount("");
    setQuantity("1");
    setCustomAmountMode(false);

    setBillers([]);
    setItems([]);

    setSelectedBillerCode("");
    setSelectedItemCode("");

    setDataTab("HOT");
    setSearch("");

    setError("");

    setShowPinPrompt(false);
    setPaymentPin("");

    setProcessingPayment(false);
    setVerifyingPin(false);
  }, []);

  useEffect(() => {
    resetForm();
  }, [serviceType, resetForm]);

  const invokeCatalogue = useCallback(
    async (
      payload: Record<string, any>
    ) => {
      const { data, error: functionError } =
        await supabase.functions.invoke(
          "clubkonnect-services",
          {
            body: {
              country: "NG",
              ...payload,
            },
          }
        );

      if (functionError) {
        console.error(
          "clubkonnect-services error:",
          functionError
        );

        throw new Error(
          "Unable to load this service right now."
        );
      }

      if (!data || data.success !== true) {
        console.error(
          "clubkonnect-services response:",
          data
        );

        throw new Error(
          data?.error ??
            data?.message ??
            "Unable to load service information."
        );
      }

      return data;
    },
    []
  );

  const loadBillers = useCallback(
    async () => {
      if (!category || !isLive) {
        return;
      }

      setLoadingBillers(true);
      setError("");
      setSearch("");

      try {
        let data: any;

        try {
          data = await invokeCatalogue({
            action: "catalog",
            service: serviceType,
          });
        } catch {
          data = await invokeCatalogue({
            action: "billers",
            service: serviceType,
            category,
          });
        }

        const raw =
          Array.isArray(data?.billers)
            ? data.billers
            : Array.isArray(data?.data)
              ? data.data
              : Array.isArray(data?.items)
                ? data.items
                : [];

        const normalized =
          raw.filter(
            (entry: Biller) =>
              Boolean(
                getBillerCode(entry)
              )
          );

        setBillers(normalized);

        if (!normalized.length) {
          setError(
            "No service options are currently available."
          );
        }
      } catch (err) {
        console.error(
          "Failed to load billers:",
          err
        );

        const message =
          "Unable to load service options.";

        setError(message);

        toast({
          title: "Service unavailable",
          description: message,
          variant: "destructive",
        });
      } finally {
        setLoadingBillers(false);
      }
    },
    [
      category,
      invokeCatalogue,
      isLive,
      serviceType,
      toast,
    ]
  );

  useEffect(() => {
    if (isLive && category) {
      void loadBillers();
    }
  }, [category, isLive, loadBillers]);

  const loadItems = useCallback(
    async (
      code: string
    ) => {
      const cleanCode =
        cleanString(code);

      if (!cleanCode) {
        setItems([]);
        return;
      }

      setLoadingItems(true);
      setError("");
      setItems([]);
      setSelectedItemCode("");
      setAmount("");
      setCustomAmountMode(false);

      try {
        const payload: Record<string, any> = {
          action: "catalog",
          service: serviceType,
        };

        if (usesNetwork) {
          payload.network_code =
            cleanCode;
        } else {
          payload.biller_code =
            cleanCode;
        }

        if (
          serviceType === "waec" ||
          serviceType === "jamb"
        ) {
          payload.exam_type =
            serviceType;
        }

        let data: any;

        try {
          data =
            await invokeCatalogue(
              payload
            );
        } catch {
          data =
            await invokeCatalogue({
              ...payload,
              action: "items",
            });
        }

        const raw =
          Array.isArray(data?.items)
            ? data.items
            : Array.isArray(data?.plans)
              ? data.plans
              : Array.isArray(data?.packages)
                ? data.packages
                : Array.isArray(data?.data)
                  ? data.data
                  : [];

        const normalized =
          raw
            .map(
              (
                item: CatalogueItem
              ) => ({
                ...item,
                item_code:
                  getItemCode(item),
                price:
                  getSellingPrice(item),
                selling_price:
                  getSellingPrice(item),
                provider_price:
                  getProviderPrice(item),
                network_code:
                  item.network_code ??
                  item.networkCode ??
                  (usesNetwork
                    ? cleanCode
                    : undefined),
                biller_code:
                  item.biller_code ??
                  item.billerCode ??
                  (!usesNetwork
                    ? cleanCode
                    : undefined),
                is_hot_deal:
                  isTrueFlag(
                    item.is_hot_deal ??
                      item.isHotDeal
                  ),
              })
            )
            .filter(
              (
                item: CatalogueItem
              ) =>
                Boolean(
                  getItemCode(item)
                )
            );

        setItems(normalized);

        if (!normalized.length) {
          setError(
            "No packages are currently available."
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
          title: "Packages unavailable",
          description: message,
          variant: "destructive",
        });
      } finally {
        setLoadingItems(false);
      }
    },
    [
      invokeCatalogue,
      serviceType,
      toast,
      usesNetwork,
    ]
  );

  const handleBillerSelect = async (
    code: string
  ) => {
    if (
      processingPayment ||
      verifyingPin
    ) {
      return;
    }

    setSelectedBillerCode(code);
    setSelectedItemCode("");
    setAmount("");
    setCustomAmountMode(false);
    setError("");

    if (
      needsPlans ||
      serviceType === "airtime-card" ||
      serviceType === "data-card" ||
      serviceType === "smile" ||
      serviceType === "waec" ||
      serviceType === "jamb"
    ) {
      await loadItems(code);
    }
  };

  const handlePlanSelect = (
    item: CatalogueItem
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

    if (!code || price <= 0) {
      toast({
        title: "Unavailable plan",
        description:
          "This option does not have a valid price.",
        variant: "destructive",
      });

      return;
    }

    setSelectedItemCode(code);
    setAmount(String(price));
    setCustomAmountMode(false);
    setError("");
  };

  const handleAmountSelect = (
    value: number
  ) => {
    if (
      processingPayment ||
      verifyingPin
    ) {
      return;
    }

    setAmount(String(value));
    setCustomAmountMode(false);
    setError("");
  };

  const handleCustomAmount = () => {
    if (
      processingPayment ||
      verifyingPin
    ) {
      return;
    }

    setCustomAmountMode(true);
    setAmount("");
    setError("");
  };

  const validateForm = (): boolean => {
    if (!isLive) {
      toast({
        title: "Coming soon",
        description:
          "This service is not available yet.",
        variant: "destructive",
      });

      return false;
    }

    if (!selectedBillerCode) {
      toast({
        title: "Choose an option",
        description:
          "Please select the network or service option you want to use.",
        variant: "destructive",
      });

      return false;
    }

    if (
      needsPlans &&
      !selectedItemCode
    ) {
      toast({
        title: "Choose a package",
        description:
          "Please select a package before continuing.",
        variant: "destructive",
      });

      return false;
    }

    if (!customer.trim()) {
      toast({
        title: "Information required",
        description:
          `Please enter your ${inputLabel.toLowerCase()}.`,
        variant: "destructive",
      });

      return false;
    }

    if (
      serviceType === "airtime" ||
      serviceType === "data" ||
      serviceType === "airtime-card" ||
      serviceType === "data-card" ||
      serviceType === "waec" ||
      serviceType === "jamb"
    ) {
      const phone =
        normalizePhone(customer);

      if (
        !/^\+234\d{10}$/.test(
          phone
        )
      ) {
        toast({
          title: "Invalid phone number",
          description:
            "Enter a valid Nigerian phone number.",
          variant: "destructive",
        });

        return false;
      }
    }

    if (
      !Number.isFinite(amountNumber) ||
      amountNumber <= 0
    ) {
      toast({
        title: "Choose an amount",
        description:
          "Please select or enter a valid amount.",
        variant: "destructive",
      });

      return false;
    }

    if (
      needsPlans &&
      selectedItem &&
      selectedItemPrice > 0 &&
      Math.abs(
        amountNumber -
          selectedItemPrice
      ) > 0.01
    ) {
      toast({
        title: "Price changed",
        description:
          `This option costs ${formatNaira(
            selectedItemPrice
          )}.`,
        variant: "destructive",
      });

      return false;
    }

    if (
      minimumAmount > 0 &&
      amountNumber <
        minimumAmount
    ) {
      toast({
        title: "Amount too low",
        description:
          `Minimum amount is ${formatNaira(
            minimumAmount
          )}.`,
        variant: "destructive",
      });

      return false;
    }

    if (
      maximumAmount > 0 &&
      amountNumber >
        maximumAmount
    ) {
      toast({
        title: "Amount too high",
        description:
          `Maximum amount is ${formatNaira(
            maximumAmount
          )}.`,
        variant: "destructive",
      });

      return false;
    }

    if (usesQuantity) {
      const parsedQuantity =
        Number(quantity);

      if (
        !Number.isInteger(
          parsedQuantity
        ) ||
        parsedQuantity < 1 ||
        parsedQuantity > 100
      ) {
        toast({
          title: "Invalid quantity",
          description:
            "Quantity must be between 1 and 100.",
          variant: "destructive",
        });

        return false;
      }
    }

    return true;
  };

  const buildPurchaseDetails =
    (): Record<string, any> => {
      const normalizedCustomer =
        serviceType === "airtime" ||
        serviceType === "data" ||
        serviceType === "airtime-card" ||
        serviceType === "data-card" ||
        serviceType === "waec" ||
        serviceType === "jamb"
          ? normalizePhone(customer)
          : customer.trim();

      const selectedNetworkCode =
        selectedBillerCode ||
        getNetworkCode(
          selectedItem ?? {}
        );

      const selectedBiller =
        selectedBillerCode;

      const selectedItemCodeValue =
        selectedItemCode;

      const selectedProductCode =
        cleanString(
          selectedItem?.product_code ??
            selectedItem?.productCode ??
            selectedItem?.code
        );

      const selectedVariationCode =
        cleanString(
          selectedItem?.variation_code ??
            selectedItem?.variationCode
        );

      const details: Record<
        string,
        any
      > = {
        type: serviceType,
        service: serviceType,
        country: "NG",

        customer:
          normalizedCustomer,

        phone:
          normalizedCustomer,

        phoneNumber:
          normalizedCustomer,

        mobile_number:
          normalizedCustomer,

        network_code:
          usesNetwork
            ? selectedNetworkCode
            : "",

        networkCode:
          usesNetwork
            ? selectedNetworkCode
            : "",

        biller_code:
          usesNetwork
            ? ""
            : selectedBiller,

        billerCode:
          usesNetwork
            ? ""
            : selectedBiller,

        item_code:
          selectedItemCodeValue,

        itemCode:
          selectedItemCodeValue,

        product_code:
          selectedProductCode,

        productCode:
          selectedProductCode,

        variation_code:
          selectedVariationCode,

        variationCode:
          selectedVariationCode,

        plan_code:
          selectedItemCodeValue,

        planCode:
          selectedItemCodeValue,

        data_plan:
          cleanString(
            selectedItem?.data_plan ??
              selectedItem?.dataPlan ??
              selectedItem?.name
          ),

        dataPlan:
          cleanString(
            selectedItem?.data_plan ??
              selectedItem?.dataPlan ??
              selectedItem?.name
          ),

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
            : amountNumber,

        providerPrice:
          selectedItem
            ? getProviderPrice(
                selectedItem
              )
            : amountNumber,

        provider_amount:
          selectedItem
            ? getProviderPrice(
                selectedItem
              )
            : amountNumber,

        providerAmount:
          selectedItem
            ? getProviderPrice(
                selectedItem
              )
            : amountNumber,

        quantity:
          usesQuantity
            ? Number(quantity)
            : 1,

        selected_item:
          selectedItem,

        selectedItem:
          selectedItem,

        selected_provider:
          selectedBiller,

        selectedProvider:
          selectedBiller,

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

        planType:
          cleanString(
            selectedItem?.plan_type ??
              selectedItem?.planType
          ),

        is_hot_deal:
          selectedItem
            ? isTrueFlag(
                selectedItem.is_hot_deal ??
                  selectedItem.isHotDeal
              )
            : false,

        isHotDeal:
          selectedItem
            ? isTrueFlag(
                selectedItem.is_hot_deal ??
                  selectedItem.isHotDeal
              )
            : false,

        customerLabel:
          inputLabel,
      };

      if (
        serviceType ===
        "electricity"
      ) {
        details.meter_number =
          normalizedCustomer;

        details.meterNumber =
          normalizedCustomer;

        details.meter_no =
          normalizedCustomer;

        details.meterNo =
          normalizedCustomer;

        details.electric_company =
          selectedBillerCode;

        details.electricCompany =
          selectedBillerCode;
      }

      if (
        serviceType === "cable"
      ) {
        details.smartcard_number =
          normalizedCustomer;

        details.smartCardNumber =
          normalizedCustomer;

        details.smartcardNumber =
          normalizedCustomer;

        details.cable_tv =
          selectedBillerCode;

        details.cableTV =
          selectedBillerCode;

        details.cable_code =
          selectedBillerCode;

        details.cableCode =
          selectedBillerCode;

        details.package =
          selectedItem
            ? getItemName(
                selectedItem
              )
            : "";

        details.package_code =
          selectedItemCodeValue;
      }

      if (
        serviceType === "smile"
      ) {
        details.account_id =
          normalizedCustomer;

        details.accountId =
          normalizedCustomer;

        details.phone_no =
          normalizedCustomer;

        details.phoneNo =
          normalizedCustomer;
      }

      if (
        serviceType === "waec" ||
        serviceType === "jamb"
      ) {
        details.exam_type =
          cleanString(
            selectedItem?.exam_type ??
              selectedItem?.examType ??
              serviceType
          );

        details.examType =
          details.exam_type;
      }

      return details;
    };

  const handleContinue =
    async () => {
      if (
        processingPayment ||
        verifyingPin
      ) {
        return;
      }

      if (!validateForm()) {
        return;
      }

      setPaymentPin("");
      setError("");
      setShowPinPrompt(true);
    };

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
          title: "Invalid PIN",
          description:
            "Enter your 4-digit payment PIN.",
          variant: "destructive",
        });

        return;
      }

      try {
        setVerifyingPin(true);
        setError("");

        const {
          data,
          error: pinError,
        } = await supabase.rpc(
          "verify_payment_pin",
          {
            _pin: paymentPin,
          }
        );

        if (pinError) {
          console.error(
            "Payment PIN error:",
            pinError
          );

          throw new Error(
            "Unable to verify your payment PIN."
          );
        }

        if (
          !data ||
          data.success !== true
        ) {
          const message =
            data?.message ??
            "Invalid payment PIN.";

          setPaymentPin("");

          toast({
            title: "Payment PIN",
            description: message,
            variant: "destructive",
          });

          return;
        }

        const details =
          buildPurchaseDetails();

        const finalAmount =
          amountNumber;

        setShowPinPrompt(false);
        setPaymentPin("");
        setProcessingPayment(true);

        await onPurchase(
          finalAmount,
          details
        );

        resetForm();
      } catch (err) {
        console.error(
          "Service payment failed:",
          err
        );

        const message =
          err instanceof Error
            ? err.message
            : "Unable to complete this payment.";

        setError(message);

        toast({
          title: "Payment failed",
          description: message,
          variant: "destructive",
        });
      } finally {
        setVerifyingPin(false);
        setProcessingPayment(false);
      }
    };

  const handleBack = () => {
    if (
      processingPayment ||
      verifyingPin
    ) {
      return;
    }

    resetForm();
    onBack();
  };

  const renderComingSoon =
    () => {
      const Icon =
        getServiceIcon(
          serviceType
        );

      return (
        <div className="rounded-[28px] bg-white p-8 text-center shadow-[0_18px_55px_rgba(76,29,149,0.10)] ring-1 ring-slate-100 sm:p-12">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[26px] bg-gradient-to-br from-[#5b21b6] to-[#2563eb] text-white shadow-xl shadow-purple-500/20">
            <Icon className="h-9 w-9" />
          </div>

          <div className="mx-auto mt-6 max-w-md">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-purple-700">
              <Sparkles className="h-3 w-3" />
              Coming Soon
            </span>

            <h2 className="mt-4 text-2xl font-black tracking-tight text-slate-950">
              {getServiceTitle(
                service
              )}
            </h2>

            <p className="mt-2 text-sm leading-6 text-slate-500">
              {meta.description} We are
              preparing a seamless experience
              for this service.
            </p>
          </div>

          <Button
            type="button"
            onClick={handleBack}
            className="mt-7 h-12 rounded-2xl bg-gradient-to-r from-[#5b21b6] to-[#2563eb] px-7 font-bold shadow-lg shadow-purple-500/20 hover:opacity-95"
          >
            Explore Other Services
          </Button>
        </div>
      );
    };

  const renderPinConfirmation =
    () => (
      <div className="overflow-hidden rounded-[30px] bg-white shadow-[0_22px_70px_rgba(76,29,149,0.13)] ring-1 ring-slate-100">
        <div className="bg-gradient-to-br from-[#4c1d95] via-[#6d28d9] to-[#2563eb] px-6 py-8 text-white sm:px-8">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
              <ShieldCheck className="h-7 w-7" />
            </div>

            <div>
              <p className="text-xs font-semibold text-white/70">
                SECURE CHECKOUT
              </p>

              <h2 className="mt-1 text-2xl font-black">
                Confirm payment
              </h2>
            </div>
          </div>

          <p className="mt-5 max-w-md text-sm leading-6 text-white/75">
            Review your transaction and enter
            your Payment PIN to securely authorize
            this purchase.
          </p>
        </div>

        <div className="p-5 sm:p-8">
          <div className="rounded-2xl border border-purple-100 bg-purple-50/60 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-medium text-slate-500">
                Service
              </span>

              <span className="text-right text-sm font-bold text-slate-950">
                {getServiceTitle(
                  service
                )}
              </span>
            </div>

            <div className="my-4 h-px bg-purple-100" />

            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-medium text-slate-500">
                {inputLabel}
              </span>

              <span className="max-w-[60%] break-all text-right text-sm font-bold text-slate-950">
                {serviceType ===
                  "airtime" ||
                serviceType ===
                  "data" ||
                serviceType ===
                  "airtime-card" ||
                serviceType ===
                  "data-card" ||
                serviceType === "waec" ||
                serviceType === "jamb"
                  ? normalizePhone(
                      customer
                    )
                  : customer}
              </span>
            </div>

            {selectedItem && (
              <>
                <div className="my-4 h-px bg-purple-100" />

                <div className="flex items-start justify-between gap-4">
                  <span className="text-sm font-medium text-slate-500">
                    Package
                  </span>

                  <span className="max-w-[60%] text-right text-sm font-bold text-slate-950">
                    {getItemName(
                      selectedItem
                    )}
                  </span>
                </div>
              </>
            )}

            {usesQuantity && (
              <>
                <div className="my-4 h-px bg-purple-100" />

                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm font-medium text-slate-500">
                    Quantity
                  </span>

                  <span className="text-sm font-bold text-slate-950">
                    {quantity}
                  </span>
                </div>
              </>
            )}

            <div className="my-4 h-px bg-purple-100" />

            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-medium text-slate-500">
                Total
              </span>

              <span className="text-xl font-black text-purple-700">
                {formatNaira(
                  amountNumber
                )}
              </span>
            </div>
          </div>

          <div className="mt-6">
            <Label
              htmlFor="servicePaymentPin"
              className="text-sm font-bold text-slate-800"
            >
              Payment PIN
            </Label>

            <div className="relative mt-2">
              <Input
                id="servicePaymentPin"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                value={paymentPin}
                onChange={(event) => {
                  const value =
                    event.target.value
                      .replace(
                        /\D/g,
                        ""
                      )
                      .slice(0, 4);

                  setPaymentPin(
                    value
                  );
                  setError("");
                }}
                onKeyDown={(event) => {
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
                disabled={verifyingPin}
                autoFocus
                className="h-14 rounded-2xl border-slate-200 text-center text-2xl font-bold tracking-[0.55em] focus:border-purple-500 focus:ring-purple-500/20"
              />
            </div>

            <div className="mt-3 flex items-start gap-2 rounded-xl bg-slate-50 p-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-purple-600" />

              <p className="text-[11px] leading-5 text-slate-500">
                Your Payment PIN is verified
                securely before the service
                purchase is submitted.
              </p>
            </div>
          </div>

          {error && (
            <div className="mt-5 flex items-start gap-2 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_1.4fr]">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (verifyingPin) return;

                setPaymentPin("");
                setError("");
                setShowPinPrompt(false);
              }}
              disabled={verifyingPin}
              className="h-13 rounded-2xl border-slate-200 font-bold"
            >
              Go Back
            </Button>

            <Button
              type="button"
              onClick={() =>
                void handlePinVerification()
              }
              disabled={
                verifyingPin ||
                paymentPin.length !== 4
              }
              className="h-13 rounded-2xl bg-gradient-to-r from-[#5b21b6] via-[#6d28d9] to-[#2563eb] font-black shadow-lg shadow-purple-500/20 hover:opacity-95"
            >
              {verifyingPin ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Verifying PIN...
                </>
              ) : (
                <>
                  Confirm & Pay
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    );

  if (!service) {
    return (
      <div className="min-h-screen bg-[#F7F8FC] px-4 py-10">
        <div className="mx-auto flex min-h-[70vh] max-w-xl items-center justify-center">
          <div className="w-full rounded-[28px] bg-white p-8 text-center shadow-xl ring-1 ring-slate-100">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-purple-50 text-purple-700">
              <CircleAlert className="h-8 w-8" />
            </div>

            <h2 className="mt-5 text-xl font-black text-slate-950">
              No service selected
            </h2>

            <p className="mt-2 text-sm text-slate-500">
              Please return to the services page
              and select a service.
            </p>

            <Button
              type="button"
              onClick={onBack}
              className="mt-6 rounded-2xl bg-gradient-to-r from-[#5b21b6] to-[#2563eb] px-7 font-bold"
            >
              Go Back
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F8FC] pb-12">
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <button
            type="button"
            onClick={handleBack}
            disabled={
              processingPayment ||
              verifyingPin
            }
            className="group flex items-center gap-2 rounded-xl px-2 py-2 text-sm font-bold text-slate-700 transition-colors hover:bg-purple-50 hover:text-purple-700 disabled:opacity-50"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 transition-colors group-hover:bg-purple-100">
              <ArrowLeft className="h-4 w-4" />
            </span>

            <span className="hidden sm:inline">
              Back
            </span>
          </button>

          <div className="flex items-center gap-2">
            <div className="hidden h-8 w-px bg-slate-200 sm:block" />

            <span className="text-sm font-extrabold text-slate-950">
              {getServiceTitle(
                service
              )}
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              toast({
                title: "Transaction history",
                description:
                  "Your service transaction history is available from the transaction history section.",
              });
            }}
            className="flex h-10 items-center gap-2 rounded-xl px-2 text-sm font-bold text-purple-700 transition-colors hover:bg-purple-50"
          >
            <span className="hidden sm:inline">
              History
            </span>

            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-50">
              <FileCheck2 className="h-4 w-4" />
            </span>
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-5 sm:px-6 sm:py-7">
        {!showPinPrompt && (
          <div className="mb-5">
            <ServiceHero
              serviceType={
                serviceType
              }
              title={getServiceTitle(
                service
              )}
            />
          </div>
        )}

        {showPinPrompt ? (
          renderPinConfirmation()
        ) : isComingSoon(
            serviceType
          ) ? (
          renderComingSoon()
        ) : (
          <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
            <section className="min-w-0">
              <div className="rounded-[28px] bg-white p-4 shadow-[0_16px_50px_rgba(76,29,149,0.08)] ring-1 ring-slate-100 sm:p-6">
                <div className="mb-6 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-purple-600">
                      SERVICE SETUP
                    </p>

                    <h2 className="mt-1 text-lg font-black tracking-tight text-slate-950">
                      Complete your purchase
                    </h2>
                  </div>

                  {!loadingBillers &&
                    !processingPayment &&
                    !verifyingPin && (
                      <button
                        type="button"
                        onClick={() =>
                          void loadBillers()
                        }
                        className="flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-600 transition-colors hover:border-purple-200 hover:bg-purple-50 hover:text-purple-700"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">
                          Refresh
                        </span>
                      </button>
                    )}
                </div>

                <div className="space-y-7">
                  <div>
                    <div className="mb-3 flex items-end justify-between gap-3">
                      <div>
                        <Label className="text-sm font-extrabold text-slate-900">
                          {usesNetwork
                            ? "Choose network"
                            : "Choose service"}
                        </Label>

                        <p className="mt-1 text-xs text-slate-500">
                          Select the option you want to use.
                        </p>
                      </div>

                      {billers.length >
                        5 && (
                        <div className="relative hidden sm:block">
                          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />

                          <Input
                            value={
                              search
                            }
                            onChange={(
                              event
                            ) =>
                              setSearch(
                                event
                                  .target
                                  .value
                              )
                            }
                            placeholder="Search..."
                            className="h-9 w-36 rounded-xl pl-8 text-xs"
                          />
                        </div>
                      )}
                    </div>

                    {loadingBillers ? (
                      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-6">
                        {[
                          1, 2, 3, 4, 5, 6,
                        ].map(
                          (item) => (
                            <div
                              key={item}
                              className="h-24 animate-pulse rounded-2xl bg-slate-100"
                            />
                          )
                        )}
                      </div>
                    ) : filteredBillers.length ? (
                      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 sm:gap-3 md:grid-cols-6">
                        {filteredBillers.map(
                          (
                            biller,
                            index
                          ) => {
                            const code =
                              getBillerCode(
                                biller
                              );

                            if (!code)
                              return null;

                            return (
                              <SelectorCard
                                key={`${code}-${index}`}
                                item={
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
                                  void handleBillerSelect(
                                    code
                                  )
                                }
                                networkMode={
                                  usesNetwork
                                }
                              />
                            );
                          }
                        )}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center">
                        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-white text-purple-600 shadow-sm">
                          <RefreshCw className="h-5 w-5" />
                        </div>

                        <p className="mt-3 text-sm font-bold text-slate-700">
                          No options available
                        </p>

                        <p className="mt-1 text-xs text-slate-500">
                          Refresh and try again.
                        </p>

                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            void loadBillers()
                          }
                          className="mt-4 rounded-xl"
                        >
                          Try Again
                        </Button>
                      </div>
                    )}
                  </div>

                  {selectedBillerCode &&
                    isData && (
                      <div>
                        <div className="mb-3">
                          <Label className="text-sm font-extrabold text-slate-900">
                            Choose data plan
                          </Label>

                          <p className="mt-1 text-xs text-slate-500">
                            Find the bundle that works best for you.
                          </p>
                        </div>

                        <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
                          {DATA_TABS.map(
                            (tab) => {
                              const count =
                                dataGroups[
                                  tab
                                ]
                                  .length;

                              const label =
                                tab ===
                                "EXTRA_NIGHT"
                                  ? "Extra Night"
                                  : tab ===
                                      "HOT"
                                    ? "Hot"
                                    : tab
                                        .charAt(
                                          0
                                        )
                                        .toUpperCase() +
                                      tab
                                        .slice(
                                          1
                                        )
                                        .toLowerCase();

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
                                    "flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-[11px] font-black transition-all",
                                    dataTab ===
                                      tab
                                      ? "border-purple-600 bg-gradient-to-r from-[#5b21b6] to-[#2563eb] text-white shadow-md shadow-purple-500/15"
                                      : "border-slate-200 bg-white text-slate-600 hover:border-purple-200 hover:bg-purple-50 hover:text-purple-700",
                                  ].join(
                                    " "
                                  )}
                                >
                                  {tab ===
                                    "HOT" && (
                                    <Flame className="h-3.5 w-3.5" />
                                  )}

                                  {label}

                                  <span
                                    className={
                                      dataTab ===
                                      tab
                                        ? "opacity-75"
                                        : "text-slate-400"
                                    }
                                  >
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
                              1, 2, 3, 4,
                              5, 6,
                            ].map(
                              (item) => (
                                <div
                                  key={
                                    item
                                  }
                                  className="h-32 animate-pulse rounded-[22px] bg-slate-100"
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
                                    handlePlanSelect(
                                      item
                                    )
                                  }
                                />
                              )
                            )}
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-7 text-center">
                            <Wifi className="mx-auto h-7 w-7 text-slate-300" />

                            <p className="mt-2 text-sm font-bold text-slate-600">
                              No plans in this category
                            </p>

                            <p className="mt-1 text-xs text-slate-400">
                              Try another category.
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                  {selectedBillerCode &&
                    !isData &&
                    needsPlans && (
                      <div>
                        <div className="mb-3">
                          <Label className="text-sm font-extrabold text-slate-900">
                            Choose package
                          </Label>

                          <p className="mt-1 text-xs text-slate-500">
                            Select the package you want to purchase.
                          </p>
                        </div>

                        {loadingItems ? (
                          <div className="flex h-14 items-center justify-center rounded-2xl bg-slate-50 text-xs font-semibold text-slate-500">
                            <Loader2 className="mr-2 h-4 w-4 animate-spin text-purple-600" />
                            Loading packages...
                          </div>
                        ) : items.length ? (
                          <div className="relative">
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

                                setError(
                                  ""
                                );
                              }}
                              disabled={
                                processingPayment ||
                                verifyingPin
                              }
                              className="h-13 w-full appearance-none rounded-2xl border border-slate-200 bg-white px-4 pr-10 text-sm font-semibold text-slate-800 outline-none transition focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10"
                            >
                              <option value="">
                                Select package
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
                                  ) => (
                                    <option
                                      key={`${getItemCode(item)}-${index}`}
                                      value={getItemCode(
                                        item
                                      )}
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
                                  )
                                )}
                            </select>

                            <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-sm text-slate-500">
                            No packages are currently available.
                          </div>
                        )}
                      </div>
                    )}

                  {selectedBillerCode &&
                    isAmountBased && (
                      <div>
                        <div className="mb-3">
                          <Label className="text-sm font-extrabold text-slate-900">
                            Choose amount
                          </Label>

                          <p className="mt-1 text-xs text-slate-500">
                            Select an amount or enter a custom amount.
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                          {(isAirtime
                            ? AIRTIME_AMOUNTS
                            : BILL_AMOUNTS
                          ).map(
                            (value) => (
                              <AmountButton
                                key={
                                  value
                                }
                                amount={
                                  value
                                }
                                selected={
                                  amount ===
                                  String(
                                    value
                                  )
                                }
                                disabled={
                                  processingPayment ||
                                  verifyingPin
                                }
                                onClick={() =>
                                  handleAmountSelect(
                                    value
                                  )
                                }
                              />
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
                              "rounded-2xl border px-3 py-3.5 text-sm font-extrabold transition-all",
                              "hover:-translate-y-0.5 hover:border-purple-300 hover:bg-purple-50",
                              customAmountMode
                                ? "border-purple-500 bg-purple-50 text-purple-700 ring-2 ring-purple-500/10"
                                : "border-slate-200 bg-white text-slate-700",
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
                              className="h-13 rounded-2xl border-slate-200 focus:border-purple-500 focus:ring-purple-500/10"
                            />
                          </div>
                        )}
                      </div>
                    )}

                  {selectedBillerCode &&
                    usesQuantity && (
                      <div>
                        <div className="mb-3">
                          <Label className="text-sm font-extrabold text-slate-900">
                            Quantity
                          </Label>

                          <p className="mt-1 text-xs text-slate-500">
                            Choose how many cards you want.
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          {[
                            "1",
                            "2",
                            "5",
                            "10",
                            "20",
                          ].map(
                            (value) => (
                              <button
                                key={
                                  value
                                }
                                type="button"
                                onClick={() =>
                                  setQuantity(
                                    value
                                  )
                                }
                                disabled={
                                  processingPayment ||
                                  verifyingPin
                                }
                                className={[
                                  "h-11 min-w-11 rounded-xl border px-3 text-sm font-black transition-all",
                                  quantity ===
                                    value
                                    ? "border-purple-600 bg-purple-50 text-purple-700 ring-2 ring-purple-500/10"
                                    : "border-slate-200 bg-white text-slate-600 hover:border-purple-200",
                                ].join(
                                  " "
                                )}
                              >
                                {value}
                              </button>
                            )
                          )}

                          <Input
                            type="number"
                            min="1"
                            max="100"
                            value={
                              quantity
                            }
                            onChange={(
                              event
                            ) =>
                              setQuantity(
                                event
                                  .target
                                  .value
                              )
                            }
                            className="h-11 w-24 rounded-xl text-center font-bold"
                          />
                        </div>
                      </div>
                    )}

                  <div>
                    <div className="mb-3">
                      <Label
                        htmlFor="serviceCustomer"
                        className="text-sm font-extrabold text-slate-900"
                      >
                        {inputLabel}
                      </Label>

                      <p className="mt-1 text-xs text-slate-500">
                        Enter the details where the service should be delivered.
                      </p>
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
                            event
                              .target
                              .value
                          );
                          setError(
                            ""
                          );
                        }}
                        placeholder={
                          inputPlaceholder
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
                            "electricity" ||
                          serviceType ===
                            "cable" ||
                          serviceType ===
                            "airtime-card" ||
                          serviceType ===
                            "data-card" ||
                          serviceType ===
                            "waec" ||
                          serviceType ===
                            "jamb"
                            ? "numeric"
                            : "text"
                        }
                        className="h-13 rounded-2xl border-slate-200 pl-11 font-medium focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10"
                      />

                      <Phone className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-purple-500" />
                    </div>
                  </div>

                  {error && (
                    <div className="flex items-start gap-3 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
                      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />

                      <p className="leading-5">
                        {error}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </section>

            <aside className="lg:sticky lg:top-24 lg:h-fit">
              <div className="overflow-hidden rounded-[28px] bg-white shadow-[0_16px_50px_rgba(76,29,149,0.09)] ring-1 ring-slate-100">
                <div className="bg-gradient-to-br from-[#4c1d95] via-[#6d28d9] to-[#2563eb] p-5 text-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/65">
                        ORDER SUMMARY
                      </p>

                      <p className="mt-1 text-lg font-black">
                        {getServiceTitle(
                          service
                        )}
                      </p>
                    </div>

                    <BadgeCheck className="h-6 w-6 text-white/80" />
                  </div>
                </div>

                <div className="space-y-4 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-xs font-medium text-slate-500">
                      {usesNetwork
                        ? "Network"
                        : "Service"}
                    </span>

                    <span className="text-right text-xs font-bold text-slate-900">
                      {selectedBiller
                        ? cleanString(
                            selectedBiller.short_name ??
                              selectedBiller.name ??
                              selectedBiller.display_name
                          )
                        : "Not selected"}
                    </span>
                  </div>

                  {selectedItem && (
                    <div className="flex items-start justify-between gap-4">
                      <span className="text-xs font-medium text-slate-500">
                        Package
                      </span>

                      <span className="max-w-[58%] text-right text-xs font-bold text-slate-900">
                        {getItemName(
                          selectedItem
                        )}
                      </span>
                    </div>
                  )}

                  {customer && (
                    <div className="flex items-start justify-between gap-4">
                      <span className="text-xs font-medium text-slate-500">
                        {inputLabel}
                      </span>

                      <span className="max-w-[58%] break-all text-right text-xs font-bold text-slate-900">
                        {serviceType ===
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
                          ? normalizePhone(
                              customer
                            )
                          : customer}
                      </span>
                    </div>
                  )}

                  {usesQuantity && (
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-xs font-medium text-slate-500">
                        Quantity
                      </span>

                      <span className="text-xs font-bold text-slate-900">
                        {quantity}
                      </span>
                    </div>
                  )}

                  <div className="h-px bg-slate-100" />

                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className="text-xs font-medium text-slate-500">
                        Total
                      </p>

                      <p className="mt-1 text-2xl font-black tracking-tight text-slate-950">
                        {amountNumber >
                        0
                          ? formatNaira(
                              amountNumber
                            )
                          : "₦0"}
                      </p>
                    </div>

                    <span className="rounded-xl bg-purple-50 px-2.5 py-1.5 text-[9px] font-black uppercase tracking-wide text-purple-700">
                      Secure
                    </span>
                  </div>

                  <Button
                    type="button"
                    onClick={() =>
                      void handleContinue()
                    }
                    disabled={
                      loadingBillers ||
                      loadingItems ||
                      processingPayment ||
                      verifyingPin ||
                      !selectedBillerCode ||
                      (needsPlans &&
                        !selectedItemCode) ||
                      !customer.trim() ||
                      !amount
                    }
                    className="h-13 w-full rounded-2xl bg-gradient-to-r from-[#5b21b6] via-[#6d28d9] to-[#2563eb] font-black shadow-lg shadow-purple-500/20 transition-all hover:-translate-y-0.5 hover:opacity-95 disabled:translate-y-0"
                  >
                    {processingPayment ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        Continue
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </Button>

                  <div className="flex items-center justify-center gap-2 pt-1">
                    <ShieldCheck className="h-3.5 w-3.5 text-purple-600" />

                    <p className="text-center text-[10px] font-medium text-slate-400">
                      Protected by IyanjuPay secure payment verification
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-start gap-3 rounded-2xl border border-purple-100 bg-purple-50/60 p-4">
                <Zap className="mt-0.5 h-4 w-4 shrink-0 text-purple-600" />

                <div>
                  <p className="text-xs font-bold text-purple-900">
                    Fast & reliable
                  </p>

                  <p className="mt-1 text-[10px] leading-5 text-purple-700/70">
                    Your request is securely
                    submitted after your Payment
                    PIN is verified.
                  </p>
                </div>
              </div>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
};

export default ServicePayment;
