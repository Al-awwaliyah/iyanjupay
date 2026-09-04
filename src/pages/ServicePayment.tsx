import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ArrowLeft,
  BadgeCheck,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CreditCard,
  Flame,
  Loader2,
  LockKeyhole,
  Minus,
  Package,
  Phone,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Tv,
  WalletCards,
  X,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

/* ==========================================================================
   IYANJUPAY SERVICE PAYMENT
   --------------------------------------------------------------------------
   Premium customer-facing service experience.

   IMPORTANT:
   - Provider names are never exposed as backend/provider terminology.
   - Wallet balance is intentionally NOT displayed here.
   - Catalogue comes from clubkonnect-services.
   - Purchase is delegated to onPurchase().
   ========================================================================== */

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

  onHistory?: () => void;
}

interface CatalogueNetwork {
  code?: string | number;
  id?: string | number;
  value?: string | number;

  name?: string;
  label?: string;
  title?: string;
  network?: string;
  company?: string;
  provider?: string;
  provider_name?: string;
  providerName?: string;
  biller_name?: string;
  billerName?: string;

  short_name?: string;
  shortName?: string;

  network_code?: string | number;
  networkCode?: string | number;
  biller_code?: string | number;
  billerCode?: string | number;

  logo?: string;
  logo_url?: string;
  logoUrl?: string;
  image?: string;
  image_url?: string;
  imageUrl?: string;
  icon?: string;

  [key: string]: any;
}

interface CatalogueItem {
  id?: string | number;
  code?: string | number;

  item_code?: string | number;
  itemCode?: string | number;

  product_code?: string | number;
  productCode?: string | number;

  product_id?: string | number;
  productId?: string | number;

  variation_code?: string | number;
  variationCode?: string | number;

  plan_code?: string | number;
  planCode?: string | number;

  data_plan?: string | number;
  dataPlan?: string | number;

  name?: string;
  title?: string;
  label?: string;
  description?: string;

  plan_name?: string;
  planName?: string;

  package_name?: string;
  packageName?: string;

  product_name?: string;
  productName?: string;

  amount?: number | string;
  price?: number | string;

  selling_price?: number | string;
  sellingPrice?: number | string;

  sale_price?: number | string;
  salePrice?: number | string;

  provider_price?: number | string;
  providerPrice?: number | string;

  provider_amount?: number | string;
  providerAmount?: number | string;

  value?: number | string;
  denomination?: number | string;

  minimum?: number | string;
  maximum?: number | string;
  min_amount?: number | string;
  max_amount?: number | string;

  validity?: string | number;
  duration?: string | number;
  period?: string;
  plan_period?: string;
  planPeriod?: string;

  category?: string;
  category_name?: string;
  categoryName?: string;

  plan_type?: string;
  planType?: string;

  network_code?: string | number;
  networkCode?: string | number;

  biller_code?: string | number;
  billerCode?: string | number;

  exam_type?: string;
  examType?: string;

  quantity?: number | string;

  is_hot_deal?: boolean;
  isHotDeal?: boolean;

  [key: string]: any;
}

interface CatalogueResponse {
  success?: boolean;
  service?: string;
  message?: string;
  error?: string;

  networks?: CatalogueNetwork[];
  billers?: CatalogueNetwork[];
  providers?: CatalogueNetwork[];

  plans?: CatalogueItem[];
  items?: CatalogueItem[];
  packages?: CatalogueItem[];
  products?: CatalogueItem[];

  data?: any;

  markup?: number;

  [key: string]: any;
}

type ServiceKind =
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
  | "Extra Night"
  | "Daily"
  | "Weekly"
  | "Monthly";

const LIVE_SERVICES = new Set<ServiceKind>([
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

const COMING_SOON_SERVICES = new Set<ServiceKind>([
  "internet",
  "insurance",
  "savings",
]);

const DATA_TABS: DataTab[] = [
  "HOT",
  "Extra Night",
  "Daily",
  "Weekly",
  "Monthly",
];

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

const NETWORK_LOGOS: Record<string, string> = {
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

/* ==========================================================================
   Utilities
   ========================================================================== */

function cleanString(value: unknown): string {
  return String(value ?? "").trim();
}

function numberValue(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const cleaned = cleanString(value)
    .replace(/[₦,\s]/g, "")
    .replace(/NGN/gi, "");

  if (!cleaned) {
    return 0;
  }

  const result = Number(cleaned);

  return Number.isFinite(result) ? result : 0;
}

function formatNaira(value: number): string {
  return `₦${Math.max(0, value).toLocaleString("en-NG", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function firstValue(
  ...values: unknown[]
): unknown {
  for (const value of values) {
    if (
      value !== undefined &&
      value !== null &&
      cleanString(value) !== ""
    ) {
      return value;
    }
  }

  return undefined;
}

function objectValue(
  value: unknown
): Record<string, any> {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    return value as Record<string, any>;
  }

  return {};
}

function normalizeKey(value: unknown): string {
  return cleanString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function recursiveArrays(
  value: unknown,
  depth = 0
): any[][] {
  if (depth > 12) {
    return [];
  }

  if (Array.isArray(value)) {
    const arrays: any[][] = [value];

    for (const item of value) {
      arrays.push(
        ...recursiveArrays(item, depth + 1)
      );
    }

    return arrays;
  }

  if (
    value &&
    typeof value === "object"
  ) {
    const arrays: any[][] = [];

    for (const child of Object.values(
      value as Record<string, any>
    )) {
      arrays.push(
        ...recursiveArrays(child, depth + 1)
      );
    }

    return arrays;
  }

  return [];
}

function extractCatalogueNetworks(
  response: CatalogueResponse
): CatalogueNetwork[] {
  const candidates: any[] = [];

  const direct = [
    response.networks,
    response.billers,
    response.providers,
    response.data?.networks,
    response.data?.billers,
    response.data?.providers,
  ];

  for (const value of direct) {
    if (Array.isArray(value)) {
      candidates.push(...value);
    }
  }

  if (!candidates.length) {
    for (const array of recursiveArrays(response)) {
      for (const item of array) {
        if (
          !item ||
          typeof item !== "object" ||
          Array.isArray(item)
        ) {
          continue;
        }

        const obj = objectValue(item);

        const code = firstValue(
          obj.code,
          obj.id,
          obj.value,
          obj.network_code,
          obj.networkCode,
          obj.biller_code,
          obj.billerCode,
          obj.MobileNetwork,
          obj.MOBILE_NETWORK
        );

        const name = firstValue(
          obj.name,
          obj.label,
          obj.title,
          obj.network,
          obj.company,
          obj.provider,
          obj.biller_name,
          obj.billerName,
          obj.short_name
        );

        if (
          code !== undefined &&
          name !== undefined
        ) {
          candidates.push(item);
        }
      }
    }
  }

  const result: CatalogueNetwork[] = [];
  const seen = new Set<string>();

  for (const raw of candidates) {
    if (
      !raw ||
      typeof raw !== "object" ||
      Array.isArray(raw)
    ) {
      continue;
    }

    const item =
      raw as CatalogueNetwork;

    const code = cleanString(
      firstValue(
        item.code,
        item.biller_code,
        item.billerCode,
        item.network_code,
        item.networkCode,
        item.id,
        item.value,
        (item as any).MobileNetwork,
        (item as any).MOBILE_NETWORK
      )
    );

    const name = cleanString(
      firstValue(
        item.name,
        item.short_name,
        item.shortName,
        item.label,
        item.title,
        item.network,
        item.company,
        item.provider,
        item.provider_name,
        item.providerName,
        item.biller_name,
        item.billerName,
        code
      )
    );

    if (!code || !name) {
      continue;
    }

    const key = `${normalizeKey(code)}:${normalizeKey(name)}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);

    result.push({
      ...item,
      code,
      name,
      biller_code:
        item.biller_code ??
        item.billerCode ??
        code,
      network_code:
        item.network_code ??
        item.networkCode ??
        code,
    });
  }

  return result;
}

function extractCatalogueItems(
  response: CatalogueResponse
): CatalogueItem[] {
  const direct = [
    response.plans,
    response.items,
    response.packages,
    response.products,
    response.data?.plans,
    response.data?.items,
    response.data?.packages,
    response.data?.products,
  ];

  const result: CatalogueItem[] = [];

  for (const value of direct) {
    if (Array.isArray(value)) {
      result.push(...value);
    }
  }

  if (!result.length) {
    for (const array of recursiveArrays(response)) {
      for (const item of array) {
        if (
          !item ||
          typeof item !== "object" ||
          Array.isArray(item)
        ) {
          continue;
        }

        const obj = objectValue(item);

        const code = firstValue(
          obj.item_code,
          obj.itemCode,
          obj.product_code,
          obj.productCode,
          obj.product_id,
          obj.productId,
          obj.plan_code,
          obj.planCode,
          obj.PRODUCT_CODE,
          obj.PRODUCT_ID,
          obj.code,
          obj.id
        );

        const name = firstValue(
          obj.name,
          obj.title,
          obj.label,
          obj.product_name,
          obj.productName,
          obj.PRODUCT_NAME,
          obj.plan_name,
          obj.planName,
          obj.package_name,
          obj.packageName
        );

        const amount = firstValue(
          obj.price,
          obj.amount,
          obj.selling_price,
          obj.sellingPrice,
          obj.provider_price,
          obj.providerPrice,
          obj.PRODUCT_AMOUNT,
          obj.product_amount
        );

        if (
          code !== undefined &&
          (
            name !== undefined ||
            amount !== undefined
          )
        ) {
          result.push(item);
        }
      }
    }
  }

  const unique: CatalogueItem[] = [];
  const seen = new Set<string>();

  for (const raw of result) {
    if (
      !raw ||
      typeof raw !== "object" ||
      Array.isArray(raw)
    ) {
      continue;
    }

    const item =
      raw as CatalogueItem;

    const code = cleanString(
      firstValue(
        item.item_code,
        item.itemCode,
        item.product_code,
        item.productCode,
        item.product_id,
        item.productId,
        item.variation_code,
        item.variationCode,
        item.plan_code,
        item.planCode,
        item.data_plan,
        item.dataPlan,
        item.code,
        item.id,
        (item as any).PRODUCT_CODE,
        (item as any).PRODUCT_ID
      )
    );

    if (!code) {
      continue;
    }

    const key = code.toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);

    unique.push({
      ...item,
      item_code: code,
    });
  }

  return unique;
}

function getItemCode(
  item: CatalogueItem
): string {
  return cleanString(
    firstValue(
      item.item_code,
      item.itemCode,
      item.product_code,
      item.productCode,
      item.product_id,
      item.productId,
      item.variation_code,
      item.variationCode,
      item.plan_code,
      item.planCode,
      item.data_plan,
      item.dataPlan,
      item.code,
      item.id,
      (item as any).PRODUCT_CODE,
      (item as any).PRODUCT_ID
    )
  );
}

function getItemName(
  item: CatalogueItem
): string {
  return cleanString(
    firstValue(
      item.name,
      item.title,
      item.label,
      item.product_name,
      item.productName,
      item.plan_name,
      item.planName,
      item.package_name,
      item.packageName,
      item.description,
      (item as any).PRODUCT_NAME,
      getItemCode(item)
    )
  );
}

function getProviderPrice(
  item: CatalogueItem
): number {
  return numberValue(
    firstValue(
      item.provider_price,
      item.providerPrice,
      item.provider_amount,
      item.providerAmount,
      (item as any).PRODUCT_AMOUNT,
      (item as any).product_amount,
      item.amount,
      item.price
    )
  );
}

function getSellingPrice(
  item: CatalogueItem
): number {
  return numberValue(
    firstValue(
      item.selling_price,
      item.sellingPrice,
      item.sale_price,
      item.salePrice,
      item.price,
      item.amount,
      (item as any).PRODUCT_AMOUNT,
      (item as any).product_amount
    )
  );
}

function getItemValidity(
  item: CatalogueItem
): string {
  return cleanString(
    firstValue(
      item.validity,
      item.duration,
      item.period,
      item.plan_period,
      item.planPeriod
    )
  );
}

function getDataCategory(
  item: CatalogueItem
): string {
  const explicit = normalizeKey(
    firstValue(
      item.category,
      item.category_name,
      item.categoryName,
      item.plan_type,
      item.planType,
      item.period,
      item.plan_period,
      item.planPeriod
    )
  );

  const text = [
    getItemName(item),
    getItemValidity(item),
    item.description,
    item.category,
    item.category_name,
    item.plan_type,
    item.planType,
    item.period,
    item.plan_period,
    item.planPeriod,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (
    explicit.includes("extrnight") ||
    text.includes("extra night") ||
    text.includes("night")
  ) {
    return "Extra Night";
  }

  if (
    explicit.includes("daily") ||
    /\b(1|2|3)\s*days?\b/.test(text) ||
    /\b24\s*hours?\b/.test(text)
  ) {
    return "Daily";
  }

  if (
    explicit.includes("weekly") ||
    /\b(7|14)\s*days?\b/.test(text) ||
    /\b1\s*week\b/.test(text)
  ) {
    return "Weekly";
  }

  if (
    explicit.includes("monthly") ||
    /\b(30|31)\s*days?\b/.test(text) ||
    /\b1\s*month\b/.test(text)
  ) {
    return "Monthly";
  }

  return "HOT";
}

function isHotDeal(
  item: CatalogueItem
): boolean {
  if (
    item.is_hot_deal === true ||
    item.isHotDeal === true
  ) {
    return true;
  }

  const text = [
    getItemName(item),
    item.description,
    item.plan_type,
    item.planType,
    item.category,
    item.category_name,
    item.plan_name,
    item.planName,
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

function normalizeServiceType(
  value: unknown
): ServiceKind {
  const type = normalizeKey(value);

  if (
    type === "airtime" ||
    type === "recharge"
  ) {
    return "airtime";
  }

  if (
    type === "data" ||
    type === "databundle" ||
    type === "mobiledata"
  ) {
    return "data";
  }

  if (
    type === "electricity" ||
    type === "electric" ||
    type === "utilitybills"
  ) {
    return "electricity";
  }

  if (
    type === "cable" ||
    type === "cabletv" ||
    type === "cablebills"
  ) {
    return "cable";
  }

  if (
    type === "airtimecard" ||
    type === "airtimeepin" ||
    type === "epinairtime"
  ) {
    return "airtime-card";
  }

  if (
    type === "datacard" ||
    type === "dataepin" ||
    type === "epindata"
  ) {
    return "data-card";
  }

  if (type === "smile") {
    return "smile";
  }

  if (type === "waec") {
    return "waec";
  }

  if (type === "jamb") {
    return "jamb";
  }

  if (type === "internet") {
    return "internet";
  }

  if (type === "insurance") {
    return "insurance";
  }

  if (type === "savings") {
    return "savings";
  }

  return "data";
}

function normalizeNetworkCode(
  value: unknown
): string {
  const original = cleanString(value);

  if (!original) {
    return "";
  }

  const key = normalizeKey(original);

  if (
    key === "01" ||
    key === "mtn"
  ) {
    return "01";
  }

  if (
    key === "02" ||
    key === "glo" ||
    key === "globacom"
  ) {
    return "02";
  }

  if (
    key === "03" ||
    key === "9mobile" ||
    key === "etisalat" ||
    key === "t2mobile"
  ) {
    return "03";
  }

  if (
    key === "04" ||
    key === "airtel"
  ) {
    return "04";
  }

  return original;
}

function getNetworkName(
  network: CatalogueNetwork
): string {
  return cleanString(
    firstValue(
      network.name,
      network.short_name,
      network.shortName,
      network.label,
      network.title,
      network.network,
      network.company,
      network.provider,
      network.provider_name,
      network.providerName,
      network.biller_name,
      network.billerName,
      network.code,
      network.id
    )
  );
}

function getNetworkCode(
  network: CatalogueNetwork
): string {
  return cleanString(
    firstValue(
      network.biller_code,
      network.billerCode,
      network.network_code,
      network.networkCode,
      network.code,
      network.id,
      network.value
    )
  );
}

function getNetworkLogo(
  network: CatalogueNetwork
): string | null {
  const supplied = cleanString(
    firstValue(
      network.logo,
      network.logo_url,
      network.logoUrl,
      network.image,
      network.image_url,
      network.imageUrl,
      network.icon
    )
  );

  if (supplied) {
    return supplied;
  }

  const key = normalizeKey(
    getNetworkName(network)
  );

  if (key.includes("mtn")) {
    return NETWORK_LOGOS.mtn;
  }

  if (
    key.includes("glo") ||
    key.includes("globacom")
  ) {
    return NETWORK_LOGOS.glo;
  }

  if (key.includes("airtel")) {
    return NETWORK_LOGOS.airtel;
  }

  if (
    key.includes("9mobile") ||
    key.includes("etisalat") ||
    key.includes("t2mobile")
  ) {
    return NETWORK_LOGOS["9mobile"];
  }

  if (key.includes("dstv")) {
    return NETWORK_LOGOS.dstv;
  }

  if (key.includes("gotv")) {
    return NETWORK_LOGOS.gotv;
  }

  if (
    key.includes("startimes") ||
    key.includes("startime")
  ) {
    return NETWORK_LOGOS.startimes;
  }

  if (key.includes("showmax")) {
    return NETWORK_LOGOS.showmax;
  }

  if (key.includes("smile")) {
    return NETWORK_LOGOS.smile;
  }

  return null;
}

function getInitials(
  value: string
): string {
  const words = value
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) {
    return "?";
  }

  if (words.length === 1) {
    return words[0]
      .slice(0, 2)
      .toUpperCase();
  }

  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

function normalizePhone(
  value: string
): string {
  const input = value
    .replace(/[\s-]/g, "")
    .trim();

  if (/^\+234\d{10}$/.test(input)) {
    return input;
  }

  if (/^234\d{10}$/.test(input)) {
    return `+${input}`;
  }

  if (/^0\d{10}$/.test(input)) {
    return `+234${input.slice(1)}`;
  }

  if (/^\d{10}$/.test(input)) {
    return `+234${input}`;
  }

  return input;
}

function getServiceIcon(
  serviceType: ServiceKind
) {
  switch (serviceType) {
    case "airtime":
      return Phone;

    case "data":
    case "data-card":
      return Smartphone;

    case "electricity":
      return Zap;

    case "cable":
      return Tv;

    case "airtime-card":
      return CreditCard;

    case "smile":
      return Sparkles;

    case "waec":
    case "jamb":
      return Package;

    default:
      return WalletCards;
  }
}

function serviceUsesNetwork(
  serviceType: ServiceKind
): boolean {
  return (
    serviceType === "airtime" ||
    serviceType === "data" ||
    serviceType === "airtime-card" ||
    serviceType === "data-card"
  );
}

function serviceNeedsPlans(
  serviceType: ServiceKind
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
  serviceType: ServiceKind
): boolean {
  return (
    serviceType === "airtime" ||
    serviceType === "electricity"
  );
}

function serviceUsesQuantity(
  serviceType: ServiceKind
): boolean {
  return (
    serviceType === "airtime-card" ||
    serviceType === "data-card"
  );
}

function getCustomerLabel(
  serviceType: ServiceKind
): string {
  switch (serviceType) {
    case "airtime":
    case "data":
    case "airtime-card":
    case "data-card":
      return "Phone number";

    case "electricity":
      return "Meter number";

    case "cable":
      return "Smartcard number";

    case "smile":
      return "Smile account / phone";

    case "waec":
    case "jamb":
      return "Phone number";

    default:
      return "Customer information";
  }
}

function getCustomerPlaceholder(
  serviceType: ServiceKind
): string {
  switch (serviceType) {
    case "airtime":
    case "data":
    case "airtime-card":
    case "data-card":
    case "waec":
    case "jamb":
      return "080 1234 5678";

    case "electricity":
      return "Enter meter number";

    case "cable":
      return "Enter smartcard number";

    case "smile":
      return "Enter Smile account or phone";

    default:
      return "Enter customer information";
  }
}

function getProviderRequestService(
  serviceType: ServiceKind
): string {
  return serviceType;
}

/* ==========================================================================
   Presentational Components
   ========================================================================== */

function ServiceHeader({
  service,
  serviceType,
  ServiceIcon,
  disabled,
  onBack,
  onHistory,
}: {
  service: {
    title: string;
    type: string;
  };
  serviceType: ServiceKind;
  ServiceIcon: React.ElementType;
  disabled: boolean;
  onBack: () => void;
  onHistory?: () => void;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-[#F7F9FC]/90 backdrop-blur-2xl">
      <div className="mx-auto flex h-[68px] max-w-xl items-center justify-between px-4">
        <button
          type="button"
          onClick={onBack}
          disabled={disabled}
          aria-label="Go back"
          className="group flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200/80 bg-white shadow-[0_4px_18px_rgba(15,23,42,0.05)] transition-all duration-200 hover:-translate-x-0.5 hover:border-[#082A63]/20 hover:bg-[#082A63]/[0.03] active:scale-95 disabled:opacity-40"
        >
          <ArrowLeft className="h-5 w-5 text-[#071B3E]" />
        </button>

        <div className="flex min-w-0 items-center gap-3 px-3">
          <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#082A63] to-[#164B96] text-white shadow-[0_5px_16px_rgba(8,42,99,0.18)] sm:flex">
            <ServiceIcon className="h-4.5 w-4.5" />
          </div>

          <div className="min-w-0 text-center sm:text-left">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#082A63]/50">
              IyanjuPay
            </p>

            <h1 className="truncate text-[15px] font-black tracking-[-0.01em] text-[#071B3E]">
              {service.title}
            </h1>
          </div>
        </div>

        {onHistory ? (
          <button
            type="button"
            onClick={onHistory}
            disabled={disabled}
            aria-label="Payment history"
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200/80 bg-white shadow-[0_4px_18px_rgba(15,23,42,0.05)] transition-all duration-200 hover:border-[#082A63]/20 hover:bg-[#082A63]/[0.03] active:scale-95 disabled:opacity-40"
          >
            <RefreshCw className="h-[17px] w-[17px] text-[#071B3E]" />
          </button>
        ) : (
          <div className="h-11 w-11" />
        )}
      </div>
    </header>
  );
}

function PremiumHero({
  service,
  ServiceIcon,
  selectedProvider,
  estimatedTotal,
  selectedItem,
}: {
  service: {
    title: string;
    type: string;
  };
  ServiceIcon: React.ElementType;
  selectedProvider: CatalogueNetwork | null;
  estimatedTotal: number;
  selectedItem: CatalogueItem | null;
}) {
  const providerName = selectedProvider
    ? getNetworkName(selectedProvider)
    : "";

  const itemName = selectedItem
    ? getItemName(selectedItem)
    : "";

  return (
    <section className="relative overflow-hidden rounded-[30px] bg-[#071B3E] shadow-[0_18px_45px_rgba(7,27,62,0.18)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_12%,rgba(244,180,0,0.22),transparent_27%),radial-gradient(circle_at_0%_100%,rgba(37,99,235,0.32),transparent_42%)]" />

      <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full border-[32px] border-white/[0.035]" />
      <div className="absolute -bottom-32 -left-24 h-72 w-72 rounded-full border-[42px] border-white/[0.025]" />

      <div className="relative p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-[17px] border border-white/10 bg-white/[0.09] shadow-inner">
            <ServiceIcon className="h-5 w-5 text-white" />
          </div>

          <div className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.08] px-3 py-1.5 text-[10px] font-bold text-white/75 backdrop-blur-md">
            <ShieldCheck className="h-3.5 w-3.5 text-[#F4B400]" />
            Secure payment
          </div>
        </div>

        <div className="mt-7">
          <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-white/45">
            Pay for
          </p>

          <h2 className="mt-1 text-[23px] font-black tracking-[-0.025em] text-white">
            {service.title}
          </h2>
        </div>

        <div className="mt-7 flex items-end justify-between gap-4">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-white/40">
              Total
            </p>

            <p className="mt-1 text-[31px] font-black leading-none tracking-[-0.035em] text-white">
              {formatNaira(estimatedTotal)}
            </p>
          </div>

          {(providerName || itemName) && (
            <div className="max-w-[48%] text-right">
              <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-white/35">
                Selected
              </p>

              <p className="mt-1 truncate text-[12px] font-bold text-white/80">
                {providerName || itemName}
              </p>

              {providerName && itemName && (
                <p className="mt-0.5 truncate text-[10px] font-medium text-white/45">
                  {itemName}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#F4B400]/40 to-transparent" />
    </section>
  );
}

function SectionCard({
  step,
  title,
  subtitle,
  action,
  children,
}: {
  step?: string;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[26px] border border-slate-200/80 bg-white shadow-[0_5px_24px_rgba(15,23,42,0.045)]">
      <div className="px-4 pb-0 pt-5 sm:px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {step && (
              <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-[#082A63]/[0.055] px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-[#082A63]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#F4B400]" />
                {step}
              </div>
            )}

            <h2 className="text-[17px] font-black tracking-[-0.015em] text-[#071B3E]">
              {title}
            </h2>

            {subtitle && (
              <p className="mt-1 max-w-[320px] text-[12px] leading-5 text-slate-500">
                {subtitle}
              </p>
            )}
          </div>

          {action}
        </div>
      </div>

      <div className="px-4 pb-5 pt-4 sm:px-5">
        {children}
      </div>
    </section>
  );
}

function ProviderChip({
  provider,
  selected,
  loading,
  disabled,
  onClick,
}: {
  provider: CatalogueNetwork;
  selected: boolean;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const name = getNetworkName(provider);
  const logo = getNetworkLogo(provider);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={[
        "group relative flex w-[82px] shrink-0 flex-col items-center gap-2.5 rounded-[22px] px-2 py-3 transition-all duration-200",
        selected
          ? "bg-[#082A63]/[0.055]"
          : "bg-transparent hover:bg-slate-50",
        disabled || loading
          ? "cursor-not-allowed opacity-50"
          : "active:scale-95",
      ].join(" ")}
    >
      <div
        className={[
          "relative flex h-[60px] w-[60px] items-center justify-center rounded-[20px] bg-white transition-all duration-200",
          selected
            ? "border-2 border-[#082A63] shadow-[0_8px_22px_rgba(8,42,99,0.14)]"
            : "border border-slate-200 shadow-[0_4px_14px_rgba(15,23,42,0.06)] group-hover:-translate-y-0.5 group-hover:shadow-[0_8px_20px_rgba(15,23,42,0.09)]",
        ].join(" ")}
      >
        {logo ? (
          <img
            src={logo}
            alt=""
            className="h-8 w-8 object-contain"
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
          className="h-full w-full items-center justify-center rounded-[18px] bg-[#F1F5F9] text-[12px] font-black text-[#082A63]"
          style={{
            display: logo ? "none" : "flex",
          }}
        >
          {getInitials(name)}
        </span>

        {selected && (
          <span className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full border-[3px] border-white bg-[#082A63] text-white shadow-[0_3px_10px_rgba(8,42,99,0.22)]">
            <Check
              className="h-3 w-3"
              strokeWidth={3.5}
            />
          </span>
        )}
      </div>

      <span
        className={[
          "line-clamp-1 w-full text-center text-[10.5px] font-black",
          selected
            ? "text-[#082A63]"
            : "text-slate-600",
        ].join(" ")}
      >
        {name}
      </span>
    </button>
  );
}

function AmountButton({
  value,
  selected,
  onClick,
  disabled,
}: {
  value: number;
  selected: boolean;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "relative h-[58px] overflow-hidden rounded-[18px] border px-2 text-center transition-all duration-200",
        selected
          ? "border-[#082A63] bg-[#082A63] text-white shadow-[0_8px_20px_rgba(8,42,99,0.18)]"
          : "border-slate-200 bg-white text-[#071B3E] hover:-translate-y-0.5 hover:border-[#082A63]/20 hover:shadow-[0_7px_18px_rgba(15,23,42,0.07)]",
        disabled
          ? "cursor-not-allowed opacity-50"
          : "active:scale-[0.97]",
      ].join(" ")}
    >
      <span className="text-[13px] font-black">
        {formatNaira(value)}
      </span>

      {selected && (
        <span className="absolute right-1.5 top-1.5">
          <Check
            className="h-3 w-3 text-[#F4B400]"
            strokeWidth={3.5}
          />
        </span>
      )}
    </button>
  );
}

function PlanCard({
  item,
  selected,
  quantity,
  disabled,
  onClick,
}: {
  item: CatalogueItem;
  selected: boolean;
  quantity: number;
  disabled: boolean;
  onClick: () => void;
}) {
  const name = getItemName(item);
  const price = getSellingPrice(item);
  const validity = getItemValidity(item);
  const hot = isHotDeal(item);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "group relative min-h-[126px] overflow-hidden rounded-[22px] border p-4 text-left transition-all duration-200",
        selected
          ? "border-[#082A63] bg-gradient-to-br from-[#082A63]/[0.045] to-white shadow-[0_10px_26px_rgba(8,42,99,0.12)]"
          : "border-slate-200 bg-white hover:-translate-y-0.5 hover:border-[#082A63]/15 hover:shadow-[0_9px_24px_rgba(15,23,42,0.075)]",
        disabled
          ? "cursor-not-allowed opacity-60"
          : "active:scale-[0.985]",
      ].join(" ")}
    >
      {hot && (
        <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full border border-[#F4B400]/20 bg-[#FFF8DF] px-2 py-1 text-[8px] font-black uppercase tracking-[0.08em] text-[#8B6500]">
          <Flame className="h-2.5 w-2.5" />
          Hot
        </span>
      )}

      <div className="flex min-h-[40px] items-start justify-between gap-2 pr-8">
        <p className="line-clamp-2 text-[13px] font-black leading-[1.35] tracking-[-0.01em] text-[#071B3E]">
          {name}
        </p>

        {selected && (
          <span className="absolute left-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-[#082A63] text-white">
            <Check
              className="h-3 w-3"
              strokeWidth={3.5}
            />
          </span>
        )}
      </div>

      {validity && (
        <div className="mt-2 inline-flex items-center rounded-full bg-slate-100 px-2 py-1 text-[9px] font-bold text-slate-500">
          {validity}
        </div>
      )}

      <div className="mt-4 flex items-end justify-between gap-2">
        <span className="text-[16px] font-black tracking-[-0.02em] text-[#082A63]">
          {formatNaira(price)}
        </span>

        {quantity > 1 && (
          <span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-black text-slate-500">
            × {quantity}
          </span>
        )}
      </div>
    </button>
  );
}

function SearchBox({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabled: boolean;
}) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

      <Input
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        placeholder={placeholder}
        disabled={disabled}
        className="h-12 rounded-[17px] border-slate-200 bg-[#F8FAFC] pl-10 text-[13px] font-medium text-[#071B3E] shadow-none placeholder:text-slate-400 focus-visible:border-[#082A63]/40 focus-visible:ring-[#082A63]/10"
      />

      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          disabled={disabled}
          className="absolute right-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-slate-200/70 text-slate-500"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function LoadingPlans({
  count = 6,
}: {
  count?: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {Array.from({ length: count }).map(
        (_, index) => (
          <div
            key={index}
            className="h-[126px] animate-pulse rounded-[22px] bg-slate-100"
          />
        )
      )}
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-[22px] border border-dashed border-slate-200 bg-[#F8FAFC] px-5 py-9 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-[17px] bg-white shadow-[0_5px_16px_rgba(15,23,42,0.06)]">
        <Icon className="h-5 w-5 text-[#082A63]/60" />
      </div>

      <p className="mt-4 text-[13px] font-black text-[#071B3E]">
        {title}
      </p>

      <p className="mx-auto mt-1.5 max-w-[280px] text-[11.5px] leading-5 text-slate-500">
        {description}
      </p>

      {action && (
        <div className="mt-4">
          {action}
        </div>
      )}
    </div>
  );
}

function QuantitySelector({
  quantity,
  onDecrease,
  onIncrease,
  disabled,
}: {
  quantity: number;
  onDecrease: () => void;
  onIncrease: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-[20px] border border-slate-200 bg-[#F8FAFC] p-2">
      <button
        type="button"
        onClick={onDecrease}
        disabled={disabled || quantity <= 1}
        className="flex h-11 w-11 items-center justify-center rounded-[15px] bg-white text-[#071B3E] shadow-[0_3px_10px_rgba(15,23,42,0.06)] transition-all active:scale-95 disabled:opacity-30"
      >
        <Minus className="h-4 w-4" />
      </button>

      <div className="text-center">
        <p className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-400">
          Quantity
        </p>

        <p className="mt-0.5 text-[20px] font-black text-[#071B3E]">
          {quantity}
        </p>
      </div>

      <button
        type="button"
        onClick={onIncrease}
        disabled={disabled || quantity >= 100}
        className="flex h-11 w-11 items-center justify-center rounded-[15px] bg-[#082A63] text-white shadow-[0_6px_16px_rgba(8,42,99,0.16)] transition-all active:scale-95 disabled:opacity-30"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

function ErrorCard({
  message,
}: {
  message: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-[20px] border border-red-100 bg-red-50 p-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white">
        <CircleAlert className="h-4.5 w-4.5 text-red-600" />
      </div>

      <div>
        <p className="text-[12px] font-black text-red-800">
          Something went wrong
        </p>

        <p className="mt-1 text-[11.5px] leading-5 text-red-700/80">
          {message}
        </p>
      </div>
    </div>
  );
}

/* ==========================================================================
   Main Component
   ========================================================================== */

const ServicePayment = ({
  service,
  walletBalance,
  onBack,
  onPurchase,
  onHistory,
}: ServicePaymentProps) => {
  const { toast } = useToast();

  const serviceType = useMemo(
    () =>
      normalizeServiceType(
        service?.type
      ),
    [service?.type]
  );

  const ServiceIcon =
    getServiceIcon(serviceType);

  const isLive =
    LIVE_SERVICES.has(serviceType);

  const isComingSoon =
    COMING_SOON_SERVICES.has(serviceType);

  const isAmountBased =
    serviceIsAmountBased(serviceType);

  const needsPlans =
    serviceNeedsPlans(serviceType);

  const usesQuantity =
    serviceUsesQuantity(serviceType);

  const [providers, setProviders] =
    useState<CatalogueNetwork[]>([]);

  const [items, setItems] =
    useState<CatalogueItem[]>([]);

  const [
    selectedProviderCode,
    setSelectedProviderCode,
  ] = useState("");

  const [
    selectedItemCode,
    setSelectedItemCode,
  ] = useState("");

  const [amount, setAmount] =
    useState("");

  const [customer, setCustomer] =
    useState("");

  const [quantity, setQuantity] =
    useState(1);

  const [dataTab, setDataTab] =
    useState<DataTab>("HOT");

  const [searchTerm, setSearchTerm] =
    useState("");

  const [loadingProviders, setLoadingProviders] =
    useState(false);

  const [loadingItems, setLoadingItems] =
    useState(false);

  const [processingPayment, setProcessingPayment] =
    useState(false);

  const [showPinPrompt, setShowPinPrompt] =
    useState(false);

  const [paymentPin, setPaymentPin] =
    useState("");

  const [verifyingPin, setVerifyingPin] =
    useState(false);

  const [error, setError] =
    useState("");

  const [customAmount, setCustomAmount] =
    useState(false);

  const selectedProvider =
    useMemo(
      () =>
        providers.find(
          (provider) =>
            getNetworkCode(provider) ===
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

  const customerLabel =
    getCustomerLabel(serviceType);

  const customerPlaceholder =
    getCustomerPlaceholder(serviceType);

  const normalizedCustomer =
    normalizePhone(customer);

  const selectedPrice =
    selectedItem
      ? getSellingPrice(selectedItem)
      : 0;

  const estimatedTotal =
    isAmountBased
      ? numberValue(amount)
      : selectedItem
        ? selectedPrice *
          (usesQuantity
            ? quantity
            : 1)
        : 0;

  const balanceSufficient =
    estimatedTotal <=
    Number(walletBalance || 0);

  const dataGroups =
    useMemo(() => {
      const groups: Record<
        DataTab,
        CatalogueItem[]
      > = {
        HOT: [],
        "Extra Night": [],
        Daily: [],
        Weekly: [],
        Monthly: [],
      };

      for (const item of items) {
        if (!getItemCode(item)) {
          continue;
        }

        const category =
          getDataCategory(item);

        if (isHotDeal(item)) {
          groups.HOT.push(item);
        }

        if (
          category === "Extra Night"
        ) {
          groups["Extra Night"].push(item);
        } else if (
          category === "Daily"
        ) {
          groups.Daily.push(item);
        } else if (
          category === "Weekly"
        ) {
          groups.Weekly.push(item);
        } else if (
          category === "Monthly"
        ) {
          groups.Monthly.push(item);
        }
      }

      if (!groups.HOT.length) {
        groups.HOT =
          items.filter(
            (item) =>
              getSellingPrice(item) > 0
          );
      }

      return groups;
    }, [items]);

  const visibleItems =
    useMemo(() => {
      const source =
        serviceType === "data"
          ? dataGroups[dataTab]
          : items;

      const search =
        normalizeKey(searchTerm);

      if (!search) {
        return source;
      }

      return source.filter(
        (item) => {
          const haystack =
            normalizeKey(
              [
                getItemName(item),
                item.description,
                item.validity,
                item.duration,
                item.plan_type,
                item.planType,
              ]
                .filter(Boolean)
                .join(" ")
            );

          return haystack.includes(
            search
          );
        }
      );
    }, [
      dataGroups,
      dataTab,
      items,
      searchTerm,
      serviceType,
    ]);

  const resetForm =
    useCallback(() => {
      setProviders([]);
      setItems([]);

      setSelectedProviderCode("");
      setSelectedItemCode("");

      setAmount("");
      setCustomer("");

      setQuantity(1);
      setDataTab("HOT");

      setSearchTerm("");

      setLoadingProviders(false);
      setLoadingItems(false);

      setProcessingPayment(false);

      setShowPinPrompt(false);
      setPaymentPin("");
      setVerifyingPin(false);

      setCustomAmount(false);
      setError("");
    }, []);

  useEffect(() => {
    resetForm();
  }, [
    serviceType,
    resetForm,
  ]);

  const invokeCatalogue =
    useCallback(
      async ({
        action = "catalog",
        providerCode = "",
      }: {
        action?: string;
        providerCode?: string;
      } = {}) => {
        const requestService =
          getProviderRequestService(
            serviceType
          );

        const payload: Record<
          string,
          any
        > = {
          action,
          service:
            requestService,
          country: "NG",
        };

        if (providerCode) {
          if (
            serviceType === "data" ||
            serviceType === "airtime-card" ||
            serviceType === "data-card"
          ) {
            payload.network_code =
              providerCode;
          } else {
            payload.biller_code =
              providerCode;
          }
        }

        if (
          serviceType === "waec" ||
          serviceType === "jamb"
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

        if (functionError) {
          console.error(
            "ClubKonnect catalogue error:",
            functionError
          );

          throw new Error(
            "Unable to load service options right now."
          );
        }

        if (
          !data ||
          data.success === false
        ) {
          console.error(
            "ClubKonnect catalogue response:",
            data
          );

          throw new Error(
            data?.error ||
              data?.message ||
              "Unable to load service options."
          );
        }

        return data as CatalogueResponse;
      },
      [serviceType]
    );

  const loadProviders =
    useCallback(
      async () => {
        if (!service || !isLive) {
          return;
        }

        setLoadingProviders(true);
        setError("");

        setProviders([]);
        setItems([]);

        setSelectedProviderCode("");
        setSelectedItemCode("");

        setAmount("");
        setCustomAmount(false);

        try {
          let response:
            CatalogueResponse;

          try {
            response =
              await invokeCatalogue({
                action: "catalog",
              });

            const loaded =
              extractCatalogueNetworks(
                response
              );

            if (!loaded.length) {
              throw new Error(
                "No service options returned."
              );
            }

            setProviders(loaded);

            if (
              loaded.length === 1
            ) {
              const onlyCode =
                getNetworkCode(
                  loaded[0]
                );

              if (onlyCode) {
                setSelectedProviderCode(
                  onlyCode
                );
              }
            }

            return;
          } catch (catalogError) {
            console.warn(
              "Catalog option loading failed. Trying billers fallback.",
              catalogError
            );
          }

          response =
            await invokeCatalogue({
              action: "billers",
            });

          const loaded =
            extractCatalogueNetworks(
              response
            );

          if (!loaded.length) {
            throw new Error(
              "No service options are currently available."
            );
          }

          setProviders(loaded);

          if (
            loaded.length === 1
          ) {
            const onlyCode =
              getNetworkCode(
                loaded[0]
              );

            if (onlyCode) {
              setSelectedProviderCode(
                onlyCode
              );
            }
          }
        } catch (err: any) {
          console.error(
            "Failed to load service options:",
            err
          );

          const message =
            err?.message ||
            "Unable to load service options.";

          setError(message);

          toast({
            title:
              "Service options unavailable",
            description:
              message,
            variant:
              "destructive",
          });
        } finally {
          setLoadingProviders(false);
        }
      },
      [
        invokeCatalogue,
        isLive,
        service,
        toast,
      ]
    );

  const loadItems =
    useCallback(
      async (
        providerCode: string
      ) => {
        const code =
          cleanString(providerCode);

        if (
          !code ||
          !needsPlans
        ) {
          return;
        }

        setLoadingItems(true);
        setError("");

        setItems([]);
        setSelectedItemCode("");

        setAmount("");
        setCustomAmount(false);

        try {
          let response:
            CatalogueResponse;

          try {
            response =
              await invokeCatalogue({
                action: "catalog",
                providerCode: code,
              });

            let loaded =
              extractCatalogueItems(
                response
              );

            if (!loaded.length) {
              loaded =
                extractCatalogueItems({
                  ...response,
                  items:
                    response.data,
                });
            }

            const usable =
              loaded.filter(
                (item) =>
                  getSellingPrice(item) > 0
              );

            if (!usable.length) {
              throw new Error(
                "No packages were returned."
              );
            }

            setItems(usable);
            return;
          } catch (catalogError) {
            console.warn(
              "Catalog package loading failed. Trying items fallback.",
              catalogError
            );
          }

          response =
            await invokeCatalogue({
              action: "items",
              providerCode: code,
            });

          const loaded =
            extractCatalogueItems(
              response
            );

          const usable =
            loaded.filter(
              (item) =>
                getSellingPrice(item) > 0
            );

          if (!usable.length) {
            throw new Error(
              "No packages are currently available."
            );
          }

          setItems(usable);
        } catch (err: any) {
          console.error(
            "Failed to load packages:",
            err
          );

          const message =
            err?.message ||
            "Unable to load packages.";

          setError(message);

          toast({
            title:
              "Packages unavailable",
            description:
              message,
            variant:
              "destructive",
          });
        } finally {
          setLoadingItems(false);
        }
      },
      [
        invokeCatalogue,
        needsPlans,
        toast,
      ]
    );

  useEffect(() => {
    if (
      service &&
      isLive
    ) {
      void loadProviders();
    }
  }, [
    isLive,
    loadProviders,
    service,
  ]);

  useEffect(() => {
    if (
      selectedProviderCode &&
      needsPlans
    ) {
      void loadItems(
        selectedProviderCode
      );
    }
  }, [
    loadItems,
    needsPlans,
    selectedProviderCode,
  ]);

  const handleProviderSelect =
    async (
      providerCode: string
    ) => {
      if (
        processingPayment ||
        verifyingPin
      ) {
        return;
      }

      const code =
        cleanString(providerCode);

      if (!code) {
        return;
      }

      setSelectedProviderCode(code);
      setSelectedItemCode("");
      setItems([]);
      setAmount("");
      setCustomAmount(false);
      setError("");

      if (needsPlans) {
        await loadItems(code);
      }
    };

  const handleItemSelect =
    (
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

      if (
        !code ||
        price <= 0
      ) {
        toast({
          title:
            "Unavailable package",
          description:
            "This package does not have a valid price.",
          variant:
            "destructive",
        });

        return;
      }

      setSelectedItemCode(code);
      setAmount(String(price));
      setCustomAmount(false);
      setError("");
    };

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

      setAmount(String(value));
      setCustomAmount(false);
      setError("");
    };

  const validateForm =
    (): boolean => {
      if (!selectedProviderCode) {
        toast({
          title:
            "Choose an option",
          description:
            "Please select a network or service option.",
          variant:
            "destructive",
        });

        return false;
      }

      if (
        needsPlans &&
        !selectedItemCode
      ) {
        toast({
          title:
            "Choose a package",
          description:
            "Please select the package you want.",
          variant:
            "destructive",
        });

        return false;
      }

      if (!customer.trim()) {
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
          !/^\+234\d{10}$/.test(phone)
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

      const total =
        estimatedTotal;

      if (total <= 0) {
        toast({
          title:
            "Choose an amount",
          description:
            "Please select a valid amount or package.",
          variant:
            "destructive",
        });

        return false;
      }

      if (
        total >
        Number(walletBalance || 0)
      ) {
        toast({
          title:
            "Insufficient wallet balance",
          description:
            "Please fund your wallet before continuing.",
          variant:
            "destructive",
        });

        return false;
      }

      if (
        serviceType === "data" &&
        selectedItem
      ) {
        const price =
          getSellingPrice(
            selectedItem
          );

        if (
          Math.abs(
            numberValue(amount) -
              price
          ) > 0.01
        ) {
          toast({
            title:
              "Invalid plan price",
            description:
              `This plan costs ${formatNaira(price)}.`,
            variant:
              "destructive",
          });

          return false;
        }
      }

      return true;
    };

  const buildPurchaseDetails =
    () => {
      const finalCustomer =
        normalizePhone(customer);

      const item =
        selectedItem;

      const provider =
        selectedProvider;

      const providerPrice =
        item
          ? getProviderPrice(item)
          : estimatedTotal;

      return {
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
            ? normalizeNetworkCode(
                selectedProviderCode
              )
            : "",

        networkCode:
          serviceUsesNetwork(
            serviceType
          )
            ? normalizeNetworkCode(
                selectedProviderCode
              )
            : "",

        biller_code:
          selectedProviderCode,

        billerCode:
          selectedProviderCode,

        item_code:
          selectedItemCode,

        itemCode:
          selectedItemCode,

        product_code:
          cleanString(
            item?.product_code ??
              item?.productCode
          ),

        productCode:
          cleanString(
            item?.product_code ??
              item?.productCode
          ),

        variation_code:
          cleanString(
            item?.variation_code ??
              item?.variationCode
          ),

        variationCode:
          cleanString(
            item?.variation_code ??
              item?.variationCode
          ),

        plan_code:
          cleanString(
            item?.plan_code ??
              item?.planCode
          ),

        planCode:
          cleanString(
            item?.plan_code ??
              item?.planCode
          ),

        data_plan:
          cleanString(
            item?.data_plan ??
              item?.dataPlan ??
              getItemCode(
                item ?? {}
              )
          ),

        dataPlan:
          cleanString(
            item?.data_plan ??
              item?.dataPlan ??
              getItemCode(
                item ?? {}
              )
          ),

        amount:
          estimatedTotal,

        selling_amount:
          estimatedTotal,

        sellingAmount:
          estimatedTotal,

        price:
          estimatedTotal,

        provider_price:
          providerPrice,

        providerPrice:
          providerPrice,

        provider_amount:
          providerPrice,

        providerAmount:
          providerPrice,

        quantity:
          usesQuantity
            ? quantity
            : 1,

        smartcard_number:
          serviceType === "cable"
            ? finalCustomer
            : "",

        smartcardNumber:
          serviceType === "cable"
            ? finalCustomer
            : "",

        meter_number:
          serviceType ===
          "electricity"
            ? finalCustomer
            : "",

        meterNumber:
          serviceType ===
          "electricity"
            ? finalCustomer
            : "",

        meter_no:
          serviceType ===
          "electricity"
            ? finalCustomer
            : "",

        package:
          serviceType === "cable"
            ? selectedItemCode
            : "",

        package_code:
          serviceType === "cable"
            ? selectedItemCode
            : "",

        cable_code:
          serviceType === "cable"
            ? selectedProviderCode
            : "",

        cable_tv:
          serviceType === "cable"
            ? selectedProviderCode
            : "",

        exam_type:
          serviceType === "waec" ||
          serviceType === "jamb"
            ? serviceType
            : "",

        account_id:
          serviceType === "smile"
            ? finalCustomer
            : "",

        accountId:
          serviceType === "smile"
            ? finalCustomer
            : "",

        selected_item:
          item,

        selectedItem:
          item,

        selected_provider:
          provider,

        selectedProvider:
          provider,

        plan_name:
          item
            ? getItemName(item)
            : "",

        planName:
          item
            ? getItemName(item)
            : "",

        plan_type:
          item?.plan_type ??
          item?.planType ??
          "",

        is_hot_deal:
          item
            ? isHotDeal(item)
            : false,
      };
    };

  const openPin =
    () => {
      if (!validateForm()) {
        return;
      }

      setPaymentPin("");
      setError("");
      setShowPinPrompt(true);
    };

  const verifyPinAndPay =
    async () => {
      if (
        !/^\d{4}$/.test(
          paymentPin
        )
      ) {
        toast({
          title:
            "Invalid payment PIN",
          description:
            "Enter your 4-digit payment PIN.",
          variant:
            "destructive",
        });

        return;
      }

      if (
        verifyingPin ||
        processingPayment
      ) {
        return;
      }

      try {
        setVerifyingPin(true);
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

        if (pinError) {
          console.error(
            "Payment PIN verification error:",
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

        const total =
          estimatedTotal;

        setShowPinPrompt(false);
        setPaymentPin("");

        setProcessingPayment(true);

        await onPurchase(
          total,
          details
        );

        resetForm();
      } catch (err: any) {
        console.error(
          "Service payment failed:",
          err
        );

        const message =
          err?.message ||
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
        setVerifyingPin(false);
        setProcessingPayment(false);
      }
    };

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

  /* ==========================================================================
     No Service
     ========================================================================== */

  if (!service) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F7F9FC] px-5">
        <div className="w-full max-w-sm rounded-[30px] border border-slate-200 bg-white p-8 text-center shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[21px] bg-[#082A63]/[0.06]">
            <WalletCards className="h-7 w-7 text-[#082A63]" />
          </div>

          <h2 className="mt-5 text-xl font-black tracking-tight text-[#071B3E]">
            No service selected
          </h2>

          <p className="mt-2 text-[12.5px] leading-5 text-slate-500">
            Choose a service from IyanjuPay to continue.
          </p>

          <Button
            type="button"
            onClick={onBack}
            className="mt-7 h-12 w-full rounded-[17px] bg-[#082A63] text-[13px] font-black shadow-[0_8px_20px_rgba(8,42,99,0.18)] hover:bg-[#061F4B]"
          >
            Back to services
          </Button>
        </div>
      </div>
    );
  }

  /* ==========================================================================
     Coming Soon
     ========================================================================== */

  if (isComingSoon) {
    return (
      <div className="min-h-screen bg-[#F7F9FC]">
        <ServiceHeader
          service={service}
          serviceType={serviceType}
          ServiceIcon={ServiceIcon}
          disabled={processingPayment || verifyingPin}
          onBack={handleBack}
          onHistory={onHistory}
        />

        <main className="mx-auto flex min-h-[calc(100vh-68px)] max-w-xl items-center justify-center px-5 py-12">
          <div className="w-full overflow-hidden rounded-[32px] border border-slate-200 bg-white text-center shadow-[0_22px_60px_rgba(15,23,42,0.08)]">
            <div className="relative overflow-hidden bg-[#071B3E] px-7 py-10 text-white">
              <div className="absolute -right-16 -top-20 h-48 w-48 rounded-full border-[25px] border-white/[0.04]" />
              <div className="absolute -bottom-20 -left-14 h-44 w-44 rounded-full border-[22px] border-[#F4B400]/[0.06]" />

              <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-[22px] border border-white/10 bg-white/[0.08]">
                <ServiceIcon className="h-7 w-7" />
              </div>

              <span className="relative mt-5 inline-flex items-center gap-1.5 rounded-full border border-[#F4B400]/20 bg-[#F4B400]/10 px-3 py-1.5 text-[10px] font-black text-[#F4B400]">
                <Sparkles className="h-3 w-3" />
                Coming soon
              </span>

              <h2 className="relative mt-4 text-[23px] font-black tracking-tight">
                {service.title}
              </h2>
            </div>

            <div className="px-7 py-7">
              <p className="mx-auto max-w-sm text-[13px] leading-6 text-slate-500">
                We are preparing this service to give you a
                smooth and reliable experience inside IyanjuPay.
              </p>

              <Button
                type="button"
                onClick={handleBack}
                className="mt-7 h-12 w-full rounded-[17px] bg-[#082A63] text-[13px] font-black shadow-[0_8px_20px_rgba(8,42,99,0.16)] hover:bg-[#061F4B]"
              >
                Back to services
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  /* ==========================================================================
     Live Service
     ========================================================================== */

  return (
    <div className="min-h-screen bg-[#F7F9FC] text-[#071B3E]">
      <ServiceHeader
        service={service}
        serviceType={serviceType}
        ServiceIcon={ServiceIcon}
        disabled={processingPayment || verifyingPin}
        onBack={handleBack}
        onHistory={onHistory}
      />

      <main className="mx-auto max-w-xl space-y-4 px-4 pb-[185px] pt-4 sm:px-5 sm:pt-5">
        {/* ------------------------------------------------------------------
            Hero
            ------------------------------------------------------------------ */}

        <PremiumHero
          service={service}
          ServiceIcon={ServiceIcon}
          selectedProvider={selectedProvider}
          estimatedTotal={estimatedTotal}
          selectedItem={selectedItem}
        />

        {/* ------------------------------------------------------------------
            Step 1 — Service option
            ------------------------------------------------------------------ */}

        <SectionCard
          step="Step 1"
          title={
            serviceType === "airtime" ||
            serviceType === "data" ||
            serviceType === "airtime-card" ||
            serviceType === "data-card"
              ? "Select network"
              : "Select service"
          }
          subtitle={
            serviceType === "airtime" ||
            serviceType === "data"
              ? "Choose the network you want to use."
              : "Choose the option you want to pay for."
          }
          action={
            <button
              type="button"
              onClick={() =>
                void loadProviders()
              }
              disabled={
                loadingProviders ||
                processingPayment ||
                verifyingPin
              }
              aria-label="Refresh options"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-[#082A63] shadow-[0_3px_10px_rgba(15,23,42,0.04)] transition-all hover:border-[#082A63]/20 active:scale-95 disabled:opacity-40"
            >
              <RefreshCw
                className={[
                  "h-4 w-4",
                  loadingProviders
                    ? "animate-spin"
                    : "",
                ].join(" ")}
              />
            </button>
          }
        >
          {loadingProviders ? (
            <div className="flex gap-2 overflow-hidden">
              {[
                1,
                2,
                3,
                4,
                5,
              ].map((item) => (
                <div
                  key={item}
                  className="h-[103px] w-[82px] shrink-0 animate-pulse rounded-[22px] bg-slate-100"
                />
              ))}
            </div>
          ) : providers.length > 0 ? (
            <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 scrollbar-none">
              {providers.map(
                (
                  provider,
                  index
                ) => {
                  const code =
                    getNetworkCode(
                      provider
                    );

                  if (!code) {
                    return null;
                  }

                  return (
                    <ProviderChip
                      key={`${code}-${index}`}
                      provider={provider}
                      selected={
                        code ===
                        selectedProviderCode
                      }
                      loading={
                        loadingItems
                      }
                      disabled={
                        processingPayment ||
                        verifyingPin
                      }
                      onClick={() =>
                        void handleProviderSelect(
                          code
                        )
                      }
                    />
                  );
                }
              )}
            </div>
          ) : (
            <EmptyState
              icon={Search}
              title="No options available"
              description="We could not load the available options right now."
              action={
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    void loadProviders()
                  }
                  className="h-10 rounded-xl border-slate-200 bg-white text-[11px] font-black"
                >
                  <RefreshCw className="mr-2 h-3.5 w-3.5" />
                  Try again
                </Button>
              }
            />
          )}
        </SectionCard>

        {/* ------------------------------------------------------------------
            Package / Plan selection
            ------------------------------------------------------------------ */}

        {selectedProviderCode &&
          needsPlans && (
            <SectionCard
              step="Step 2"
              title="Choose a package"
              subtitle={
                selectedProvider
                  ? `Available for ${getNetworkName(
                      selectedProvider
                    )}`
                  : "Select the package you want."
              }
              action={
                loadingItems ? (
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#082A63]/[0.05]">
                    <Loader2 className="h-4 w-4 animate-spin text-[#082A63]" />
                  </div>
                ) : (
                  selectedItem && (
                    <div className="hidden rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-black text-emerald-700 sm:flex">
                      Selected
                    </div>
                  )
                )
              }
            >
              {serviceType ===
                "data" && (
                <div className="mb-4 overflow-x-auto pb-1 scrollbar-none">
                  <div className="flex min-w-max gap-2">
                    {DATA_TABS.map(
                      (tab) => {
                        const count =
                          dataGroups[
                            tab
                          ].length;

                        const active =
                          dataTab ===
                          tab;

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
                              "flex h-10 items-center gap-1.5 rounded-full px-3.5 text-[10.5px] font-black transition-all duration-200",
                              active
                                ? "bg-[#082A63] text-white shadow-[0_6px_16px_rgba(8,42,99,0.15)]"
                                : "border border-slate-200 bg-white text-slate-500 hover:border-[#082A63]/15 hover:text-[#082A63]",
                            ].join(" ")}
                          >
                            {tab ===
                              "HOT" && (
                              <Flame
                                className={[
                                  "h-3.5 w-3.5",
                                  active
                                    ? "text-[#F4B400]"
                                    : "text-[#D39A00]",
                                ].join(" ")}
                              />
                            )}

                            {tab}

                            <span
                              className={[
                                "rounded-full px-1.5 py-0.5 text-[8px]",
                                active
                                  ? "bg-white/10 text-white/70"
                                  : "bg-slate-100 text-slate-400",
                              ].join(" ")}
                            >
                              {count}
                            </span>
                          </button>
                        );
                      }
                    )}
                  </div>
                </div>
              )}

              {items.length > 0 && (
                <div className="mb-4">
                  <SearchBox
                    value={searchTerm}
                    onChange={
                      setSearchTerm
                    }
                    placeholder={
                      serviceType ===
                      "data"
                        ? "Search data plans..."
                        : "Search packages..."
                    }
                    disabled={
                      processingPayment ||
                      verifyingPin
                    }
                  />
                </div>
              )}

              {loadingItems ? (
                <LoadingPlans />
              ) : visibleItems.length > 0 ? (
                <div className="grid grid-cols-2 gap-3">
                  {visibleItems.map(
                    (
                      item,
                      index
                    ) => (
                      <PlanCard
                        key={`${getItemCode(
                          item
                        )}-${index}`}
                        item={item}
                        selected={
                          getItemCode(
                            item
                          ) ===
                          selectedItemCode
                        }
                        quantity={
                          usesQuantity
                            ? quantity
                            : 1
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
                <EmptyState
                  icon={Package}
                  title="No packages found"
                  description={
                    searchTerm
                      ? "Try a different search term."
                      : "Nothing is available for this selection right now."
                  }
                  action={
                    searchTerm ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          setSearchTerm(
                            ""
                          )
                        }
                        className="h-10 rounded-xl border-slate-200 bg-white text-[11px] font-black"
                      >
                        Clear search
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          void loadItems(
                            selectedProviderCode
                          )
                        }
                        className="h-10 rounded-xl border-slate-200 bg-white text-[11px] font-black"
                      >
                        <RefreshCw className="mr-2 h-3.5 w-3.5" />
                        Reload packages
                      </Button>
                    )
                  }
                />
              )}
            </SectionCard>
          )}

        {/* ------------------------------------------------------------------
            Amount selection
            ------------------------------------------------------------------ */}

        {selectedProviderCode &&
          isAmountBased && (
            <SectionCard
              step="Step 2"
              title="Choose amount"
              subtitle={
                serviceType ===
                "airtime"
                  ? "Select how much airtime you want."
                  : "Choose a bill amount or enter your own."
              }
            >
              <div className="grid grid-cols-3 gap-2.5">
                {(serviceType ===
                "airtime"
                  ? AIRTIME_AMOUNTS
                  : BILL_AMOUNTS
                ).map(
                  (value) => (
                    <AmountButton
                      key={value}
                      value={value}
                      selected={
                        amount ===
                        String(value)
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
                    />
                  )
                )}

                <button
                  type="button"
                  onClick={() => {
                    setCustomAmount(
                      true
                    );
                    setAmount("");
                  }}
                  disabled={
                    processingPayment ||
                    verifyingPin
                  }
                  className={[
                    "h-[58px] rounded-[18px] border text-[12px] font-black transition-all duration-200 active:scale-[0.97]",
                    customAmount
                      ? "border-[#F4B400] bg-[#FFF8DF] text-[#8B6500] shadow-[0_6px_16px_rgba(244,180,0,0.10)]"
                      : "border-slate-200 bg-white text-[#071B3E] hover:-translate-y-0.5 hover:border-[#F4B400]/50",
                  ].join(" ")}
                >
                  Custom
                </button>
              </div>

              {customAmount && (
                <div className="mt-4 rounded-[20px] border border-[#F4B400]/20 bg-[#FFFDF5] p-4">
                  <Label
                    htmlFor="customAmount"
                    className="text-[11px] font-black uppercase tracking-[0.08em] text-[#8B6500]"
                  >
                    Enter amount
                  </Label>

                  <div className="relative mt-2">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[16px] font-black text-[#8B6500]">
                      ₦
                    </span>

                    <Input
                      id="customAmount"
                      type="number"
                      min="50"
                      step="1"
                      value={amount}
                      onChange={(
                        event
                      ) =>
                        setAmount(
                          event.target
                            .value
                        )
                      }
                      placeholder="Enter amount"
                      disabled={
                        processingPayment ||
                        verifyingPin
                      }
                      className="h-12 rounded-[16px] border-[#F4B400]/25 bg-white pl-9 text-[15px] font-black text-[#071B3E] shadow-none focus-visible:border-[#F4B400] focus-visible:ring-[#F4B400]/10"
                    />
                  </div>
                </div>
              )}
            </SectionCard>
          )}

        {/* ------------------------------------------------------------------
            Quantity
            ------------------------------------------------------------------ */}

        {selectedProviderCode &&
          usesQuantity && (
            <SectionCard
              title="How many cards?"
              subtitle="Choose the quantity you want to purchase."
            >
              <QuantitySelector
                quantity={quantity}
                onDecrease={() =>
                  setQuantity(
                    Math.max(
                      1,
                      quantity - 1
                    )
                  )
                }
                onIncrease={() =>
                  setQuantity(
                    Math.min(
                      100,
                      quantity + 1
                    )
                  )
                }
                disabled={
                  processingPayment ||
                  verifyingPin
                }
              />
            </SectionCard>
          )}

        {/* ------------------------------------------------------------------
            Customer information
            ------------------------------------------------------------------ */}

        <SectionCard
          step={
            needsPlans ||
            isAmountBased
              ? "Step 3"
              : "Step 2"
          }
          title="Where should we send it?"
          subtitle={
            serviceType ===
            "electricity"
              ? "Enter the meter number for the electricity account."
              : serviceType ===
                  "cable"
                ? "Enter the smartcard number attached to the subscription."
                : serviceType ===
                    "smile"
                  ? "Enter the Smile account or phone number."
                  : "Enter the customer's details carefully."
          }
        >
          <div className="rounded-[20px] border border-slate-200 bg-[#F8FAFC] p-3">
            <div className="mb-2 flex items-center justify-between">
              <Label
                htmlFor="serviceCustomer"
                className="text-[11px] font-black uppercase tracking-[0.08em] text-slate-500"
              >
                {customerLabel}
              </Label>

              <span className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-600">
                <ShieldCheck className="h-3 w-3" />
                Protected
              </span>
            </div>

            <Input
              id="serviceCustomer"
              value={customer}
              onChange={(event) =>
                setCustomer(
                  event.target.value
                )
              }
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
              className="h-12 rounded-[16px] border-slate-200 bg-white text-[14px] font-bold text-[#071B3E] shadow-none placeholder:text-slate-400 focus-visible:border-[#082A63]/40 focus-visible:ring-[#082A63]/10"
            />
          </div>

          {customer.trim() && (
            <div className="mt-3 flex items-center gap-2 px-1 text-[10.5px] font-medium text-slate-400">
              <BadgeCheck className="h-3.5 w-3.5 text-emerald-500" />
              Double-check the details before payment.
            </div>
          )}
        </SectionCard>

        {/* ------------------------------------------------------------------
            Selected payment summary
            ------------------------------------------------------------------ */}

        {estimatedTotal > 0 && (
          <section className="rounded-[25px] border border-[#082A63]/10 bg-gradient-to-br from-[#082A63]/[0.035] to-white p-4 shadow-[0_5px_22px_rgba(8,42,99,0.035)]">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[#082A63] text-white shadow-[0_6px_15px_rgba(8,42,99,0.15)]">
                  <CreditCard className="h-4 w-4" />
                </div>

                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.12em] text-[#082A63]/50">
                    Payment summary
                  </p>

                  <p className="mt-0.5 text-[13px] font-black text-[#071B3E]">
                    Ready to pay
                  </p>
                </div>
              </div>

              <p className="text-[20px] font-black tracking-[-0.025em] text-[#082A63]">
                {formatNaira(
                  estimatedTotal
                )}
              </p>
            </div>

            {(selectedProvider ||
              selectedItem) && (
              <div className="mt-4 flex flex-wrap gap-2">
                {selectedProvider && (
                  <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-[9.5px] font-black text-slate-600">
                    {getNetworkName(
                      selectedProvider
                    )}
                  </span>
                )}

                {selectedItem && (
                  <span className="max-w-full truncate rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-[9.5px] font-black text-slate-600">
                    {getItemName(
                      selectedItem
                    )}
                  </span>
                )}

                {usesQuantity &&
                  quantity > 1 && (
                    <span className="rounded-full border border-[#F4B400]/20 bg-[#FFF8DF] px-2.5 py-1.5 text-[9.5px] font-black text-[#8B6500]">
                      {quantity} units
                    </span>
                  )}
              </div>
            )}
          </section>
        )}

        {error && (
          <ErrorCard message={error} />
        )}
      </main>

      {/* =========================================================================
          Sticky payment action
          ========================================================================= */}

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/80 bg-white/95 px-4 pb-[max(14px,env(safe-area-inset-bottom))] pt-3 shadow-[0_-12px_35px_rgba(15,23,42,0.08)] backdrop-blur-2xl">
        <div className="mx-auto max-w-xl">
          {!balanceSufficient &&
            estimatedTotal > 0 && (
              <div className="mb-2 flex items-center justify-center gap-1.5 text-[10.5px] font-black text-red-600">
                <CircleAlert className="h-3.5 w-3.5" />
                Insufficient wallet balance
              </div>
            )}

          <div className="flex items-center gap-3">
            <div className="min-w-[78px]">
              <p className="text-[8.5px] font-black uppercase tracking-[0.15em] text-slate-400">
                Total
              </p>

              <p className="mt-0.5 text-[19px] font-black leading-none tracking-[-0.025em] text-[#071B3E]">
                {formatNaira(
                  estimatedTotal
                )}
              </p>
            </div>

            <Button
              type="button"
              onClick={openPin}
              disabled={
                loadingProviders ||
                loadingItems ||
                processingPayment ||
                verifyingPin ||
                !selectedProviderCode ||
                (needsPlans &&
                  !selectedItemCode) ||
                !customer.trim() ||
                estimatedTotal <= 0 ||
                !balanceSufficient
              }
              className="h-[54px] flex-1 rounded-[18px] bg-[#082A63] text-[13px] font-black tracking-[-0.005em] shadow-[0_10px_25px_rgba(8,42,99,0.23)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#061F4B] hover:shadow-[0_13px_28px_rgba(8,42,99,0.26)] active:translate-y-0 disabled:translate-y-0 disabled:shadow-none"
            >
              {processingPayment ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing payment...
                </>
              ) : (
                <>
                  <LockKeyhole className="mr-2 h-4 w-4" />
                  Pay securely
                  <ChevronRight className="ml-auto h-4 w-4 opacity-60" />
                </>
              )}
            </Button>
          </div>

          <div className="mt-2 flex items-center justify-center gap-1.5 text-[9px] font-medium text-slate-400">
            <ShieldCheck className="h-3 w-3 text-emerald-500" />
            Protected by IyanjuPay secure payment
          </div>
        </div>
      </div>

      {/* =========================================================================
          PIN confirmation bottom sheet
          ========================================================================= */}

      {showPinPrompt && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-[#020B1C]/65 p-0 backdrop-blur-md">
          <div
            className="absolute inset-0"
            onClick={() => {
              if (!verifyingPin) {
                setShowPinPrompt(false);
                setPaymentPin("");
                setError("");
              }
            }}
          />

          <div className="relative w-full max-w-xl overflow-hidden rounded-t-[34px] bg-white pb-[max(18px,env(safe-area-inset-bottom))] shadow-[0_-20px_70px_rgba(0,0,0,0.22)]">
            <div className="mx-auto mt-3 h-1.5 w-11 rounded-full bg-slate-200" />

            <div className="px-5 pb-4 pt-5 sm:px-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-[17px] bg-[#082A63]/[0.07]">
                    <LockKeyhole className="h-5 w-5 text-[#082A63]" />
                  </div>

                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#082A63]/50">
                      Final step
                    </p>

                    <h2 className="mt-0.5 text-[19px] font-black tracking-tight text-[#071B3E]">
                      Confirm payment
                    </h2>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (
                      verifyingPin
                    ) {
                      return;
                    }

                    setShowPinPrompt(
                      false
                    );
                    setPaymentPin("");
                    setError("");
                  }}
                  disabled={
                    verifyingPin
                  }
                  aria-label="Close"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-all active:scale-95 disabled:opacity-40"
                >
                  <X className="h-4.5 w-4.5" />
                </button>
              </div>
            </div>

            <div className="max-h-[75vh] space-y-5 overflow-y-auto px-5 pb-7 sm:px-6">
              {/* Payment recap */}
              <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-[#F8FAFC]">
                <div className="bg-[#071B3E] px-4 py-4 text-white">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-[8.5px] font-black uppercase tracking-[0.15em] text-white/40">
                        You're paying
                      </p>

                      <p className="mt-1 text-[14px] font-black">
                        {service.title}
                      </p>
                    </div>

                    <p className="text-[22px] font-black tracking-[-0.03em]">
                      {formatNaira(
                        estimatedTotal
                      )}
                    </p>
                  </div>
                </div>

                <div className="divide-y divide-slate-200">
                  <div className="flex items-center justify-between gap-4 px-4 py-3.5">
                    <span className="text-[11px] font-medium text-slate-400">
                      {customerLabel}
                    </span>

                    <span className="max-w-[62%] break-all text-right text-[12px] font-black text-[#071B3E]">
                      {normalizedCustomer}
                    </span>
                  </div>

                  {selectedProvider && (
                    <div className="flex items-center justify-between gap-4 px-4 py-3.5">
                      <span className="text-[11px] font-medium text-slate-400">
                        Selected option
                      </span>

                      <span className="max-w-[62%] truncate text-right text-[12px] font-black text-[#071B3E]">
                        {getNetworkName(
                          selectedProvider
                        )}
                      </span>
                    </div>
                  )}

                  {selectedItem && (
                    <div className="flex items-start justify-between gap-4 px-4 py-3.5">
                      <span className="text-[11px] font-medium text-slate-400">
                        Package
                      </span>

                      <span className="max-w-[62%] text-right text-[12px] font-black leading-5 text-[#071B3E]">
                        {getItemName(
                          selectedItem
                        )}
                      </span>
                    </div>
                  )}

                  {usesQuantity && (
                    <div className="flex items-center justify-between gap-4 px-4 py-3.5">
                      <span className="text-[11px] font-medium text-slate-400">
                        Quantity
                      </span>

                      <span className="text-[12px] font-black text-[#071B3E]">
                        {quantity}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* PIN */}
              <div className="rounded-[24px] border border-[#082A63]/10 bg-gradient-to-br from-[#082A63]/[0.035] to-white p-5">
                <div className="text-center">
                  <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-[15px] bg-[#082A63] text-white shadow-[0_7px_18px_rgba(8,42,99,0.18)]">
                    <LockKeyhole className="h-4.5 w-4.5" />
                  </div>

                  <p className="mt-3 text-[14px] font-black text-[#071B3E]">
                    Enter your payment PIN
                  </p>

                  <p className="mt-1 text-[10.5px] leading-5 text-slate-400">
                    Your PIN confirms this transaction securely.
                  </p>
                </div>

                <div className="mt-5">
                  <Input
                    id="paymentPin"
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
                          4
                      ) {
                        void verifyPinAndPay();
                      }
                    }}
                    placeholder="••••"
                    disabled={
                      verifyingPin
                    }
                    autoFocus
                    className="h-[60px] rounded-[19px] border-slate-200 bg-white text-center text-[25px] font-black tracking-[0.65em] text-[#071B3E] shadow-[0_5px_16px_rgba(15,23,42,0.05)] focus-visible:border-[#082A63]/40 focus-visible:ring-[#082A63]/10"
                  />
                </div>

                <div className="mt-3 flex items-center justify-center gap-1.5 text-[9.5px] font-bold text-slate-400">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                  Your PIN is encrypted and protected.
                </div>
              </div>

              {error && (
                <ErrorCard
                  message={error}
                />
              )}

              <Button
                type="button"
                onClick={() =>
                  void verifyPinAndPay()
                }
                disabled={
                  verifyingPin ||
                  paymentPin.length !==
                    4
                }
                className="h-[54px] w-full rounded-[18px] bg-[#082A63] text-[13px] font-black shadow-[0_10px_24px_rgba(8,42,99,0.20)] hover:bg-[#061F4B] disabled:shadow-none"
              >
                {verifyingPin ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verifying payment...
                  </>
                ) : (
                  <>
                    <LockKeyhole className="mr-2 h-4 w-4" />
                    Confirm & pay{" "}
                    {formatNaira(
                      estimatedTotal
                    )}
                  </>
                )}
              </Button>

              <p className="flex items-center justify-center gap-1.5 text-[9px] font-medium text-slate-400">
                <BadgeCheck className="h-3 w-3 text-emerald-500" />
                You are authorizing this transaction yourself.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ServicePayment;
