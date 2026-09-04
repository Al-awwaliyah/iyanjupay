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
  CreditCard,
  Flame,
  Loader2,
  LockKeyhole,
  Package,
  Phone,
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

/* ------------------------------------------------------------------ */
/*  Design tokens (IyanjuPay)                                          */
/*                                                                      */
/*  Ink       #071B3E  — deep navy, hero surfaces, primary text        */
/*  Brand     #082A63  — primary actions, links, focus rings           */
/*  Brand-2   #153B7A  — gradient partner for Brand                    */
/*  Gold      #F4B400  — single accent: hot deals, highlights          */
/*  Paper     #FAF8F4  — app background (warm, not clinical white)     */
/*  Line      #E7E3DA  — hairline borders on Paper                     */
/*  Success   #16794D  — sufficient balance / confirmations            */
/*  Danger    #C22E2E  — errors, insufficient balance                  */
/* ------------------------------------------------------------------ */

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

const COMING_SOON_SERVICES = new Set([
  "internet",
  "insurance",
  "savings",
]);

const PREMIUM_SERVICES = new Set([
  "airtime-card",
  "data-card",
  "smile",
  "waec",
  "jamb",
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

  if (!cleaned) return 0;

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

function getNestedArray(
  value: any,
  keys: string[]
): any[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (
    value &&
    typeof value === "object"
  ) {
    for (const key of keys) {
      if (Array.isArray(value[key])) {
        return value[key];
      }
    }
  }

  return [];
}

function recursiveArrays(
  value: unknown,
  depth = 0
): any[][] {
  if (depth > 12) return [];

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
          item &&
          typeof item === "object" &&
          !Array.isArray(item)
        ) {
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
            obj.billerName
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

    if (!code || !name) continue;

    const key = `${normalizeKey(code)}:${normalizeKey(name)}`;

    if (seen.has(key)) continue;

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
          item &&
          typeof item === "object" &&
          !Array.isArray(item)
        ) {
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
            (name !== undefined ||
              amount !== undefined)
          ) {
            result.push(item);
          }
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

    if (!code) continue;

    const key = code.toLowerCase();

    if (seen.has(key)) continue;

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

  if (!original) return "";

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

  if (supplied) return supplied;

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

  if (!words.length) return "?";

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

function phoneForProvider(
  value: string
): string {
  return normalizePhone(value)
    .replace(/^\+/, "");
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
      return "Phone number";

    case "electricity":
      return "Meter number";

    case "cable":
      return "Smartcard number";

    case "airtime-card":
    case "data-card":
      return "Phone number";

    case "smile":
      return "Smile account / phone";

    case "waec":
      return "Phone number";

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
      return "08012345678";

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
  /*
   * Keep the customer-facing service type intact whenever
   * possible. The edge function owns provider selection.
   *
   * WAEC/JAMB are also sent individually rather than exposing
   * "education" in the customer UI.
   */
  return serviceType;
}

/* ------------------------------------------------------------------ */
/*  Presentational subcomponents                                      */
/* ------------------------------------------------------------------ */

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
        "flex shrink-0 w-[76px] flex-col items-center gap-2 rounded-2xl px-1 py-3",
        "transition-transform duration-150 active:scale-95",
        disabled || loading
          ? "cursor-not-allowed opacity-50"
          : "",
      ].join(" ")}
    >
      <span
        className={[
          "relative flex h-[58px] w-[58px] items-center justify-center rounded-full bg-white",
          "shadow-[0_2px_10px_rgba(7,27,62,0.10)]",
          selected
            ? "ring-2 ring-[#082A63] ring-offset-2 ring-offset-[#FAF8F4]"
            : "ring-1 ring-[#E7E3DA]",
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
          className="items-center justify-center text-xs font-black text-[#082A63]"
          style={{
            display: logo ? "none" : "flex",
          }}
        >
          {getInitials(name)}
        </span>

        {selected && (
          <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-[#FAF8F4] bg-[#082A63] text-white">
            <Check className="h-2.5 w-2.5" strokeWidth={3} />
          </span>
        )}
      </span>

      <span
        className={[
          "line-clamp-1 w-full text-center text-[11px] font-bold",
          selected ? "text-[#082A63]" : "text-[#5B6472]",
        ].join(" ")}
      >
        {name}
      </span>
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
        "relative min-w-0 rounded-2xl border p-3.5 text-left",
        "transition-all duration-150 active:scale-[0.98]",
        selected
          ? "border-[#082A63] bg-white shadow-[0_6px_18px_rgba(8,42,99,0.14)]"
          : "border-[#E7E3DA] bg-white",
        disabled
          ? "cursor-not-allowed opacity-60"
          : "",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 min-h-[32px] text-[13px] font-extrabold leading-tight text-[#0B1830]">
          {name}
        </p>

        {selected && (
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#082A63] text-white">
            <Check className="h-3 w-3" strokeWidth={3} />
          </span>
        )}
      </div>

      {validity && (
        <p className="mt-1 text-[11px] font-medium text-[#8B93A1]">
          {validity}
        </p>
      )}

      <div className="mt-3 flex items-end justify-between gap-2">
        <p className="text-[15px] font-black text-[#082A63]">
          {formatNaira(price)}
        </p>

        {quantity > 1 && (
          <p className="text-[11px] font-bold text-[#8B93A1]">
            × {quantity}
          </p>
        )}
      </div>

      {hot && (
        <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-[#FDF4DA] px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wide text-[#8B6500]">
          <Flame className="h-2.5 w-2.5" />
          Hot
        </span>
      )}
    </button>
  );
}

function LoadingCards({
  count = 6,
}: {
  count?: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {Array.from({
        length: count,
      }).map((_, index) => (
        <div
          key={index}
          className="h-[92px] animate-pulse rounded-2xl bg-[#EFEBE3]"
        />
      ))}
    </div>
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
    <section className="rounded-[22px] border border-[#E7E3DA] bg-white p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          {step && (
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#082A63]/45">
              {step}
            </p>
          )}
          <h2 className="mt-0.5 text-[16px] font-extrabold text-[#0B1830]">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-0.5 text-[12.5px] leading-5 text-[#8B93A1]">
              {subtitle}
            </p>
          )}
        </div>
        {action}
      </div>

      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                    */
/* ------------------------------------------------------------------ */

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

  const isNetworkService =
    serviceUsesNetwork(serviceType);

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

  const [selectedProviderCode, setSelectedProviderCode] =
    useState("");

  const [selectedItemCode, setSelectedItemCode] =
    useState("");

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
          category ===
          "Extra Night"
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

      if (
        groups.HOT.length === 0
      ) {
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
          /*
           * IMPORTANT:
           * The backend should receive the correct
           * field for the selected customer-facing
           * service option.
           */
          if (
            serviceType === "data" ||
            serviceType ===
              "airtime-card" ||
            serviceType ===
              "data-card"
          ) {
            payload.network_code =
              providerCode;
          } else {
            payload.biller_code =
              providerCode;
          }
        }

        /*
         * WAEC/JAMB may be implemented by the edge
         * function under its education abstraction.
         *
         * We still send the exact customer service
         * first. The backend decides how to route it.
         */
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

  const extractProviders =
    useCallback(
      (
        response: CatalogueResponse
      ) =>
        extractCatalogueNetworks(
          response
        ),
      []
    );

  const extractItems =
    useCallback(
      (
        response: CatalogueResponse
      ) =>
        extractCatalogueItems(
          response
        ),
      []
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
          /*
           * PRIMARY CONTRACT
           *
           * New ClubKonnect abstraction:
           * action: catalog
           *
           * FALLBACK
           *
           * Older deployed edge-function:
           * action: billers
           *
           * This makes the frontend tolerant while the
           * backend is being migrated.
           */
          let response: CatalogueResponse;

          try {
            response =
              await invokeCatalogue({
                action: "catalog",
              });

            let loaded =
              extractProviders(
                response
              );

            if (
              loaded.length === 0 &&
              (
                response.billers ||
                response.networks ||
                response.providers
              )
            ) {
              loaded =
                extractProviders(
                  response
                );
            }

            if (
              loaded.length === 0
            ) {
              throw new Error(
                "No service providers returned."
              );
            }

            setProviders(
              loaded
            );

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
              "Primary catalogue provider request failed; trying legacy billers contract.",
              catalogError
            );
          }

          response =
            await invokeCatalogue({
              action: "billers",
            });

          const loaded =
            extractProviders(
              response
            );

          if (!loaded.length) {
            throw new Error(
              "No service providers are currently available."
            );
          }

          setProviders(
            loaded
          );

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
            "Failed to load service providers:",
            err
          );

          const message =
            err?.message ||
            "Unable to load service providers.";

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
          setLoadingProviders(
            false
          );
        }
      },
      [
        extractProviders,
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
        const cleanProvider =
          cleanString(
            providerCode
          );

        if (
          !cleanProvider ||
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
            | CatalogueResponse;

          /*
           * PRIMARY: catalog with provider
           */
          try {
            response =
              await invokeCatalogue({
                action: "catalog",
                providerCode:
                  cleanProvider,
              });

            let loaded =
              extractItems(
                response
              );

            /*
             * Some catalogue implementations
             * return the array directly under data.
             */
            if (
              !loaded.length
            ) {
              loaded =
                extractCatalogueItems(
                  {
                    ...response,
                    items:
                      response.data,
                  }
              );
            }

            if (
              !loaded.length
            ) {
              throw new Error(
                "No packages were returned."
              );
            }

            setItems(
              loaded.filter(
                (item) =>
                  getSellingPrice(
                    item
                  ) > 0
              )
            );

            return;
          } catch (catalogError) {
            console.warn(
              "Primary package catalogue request failed; trying legacy items contract.",
              catalogError
            );
          }

          /*
           * FALLBACK: legacy items contract
           */
          response =
            await invokeCatalogue({
              action: "items",
              providerCode:
                cleanProvider,
            });

          const loaded =
            extractItems(
              response
            );

          const usable =
            loaded.filter(
              (item) =>
                getSellingPrice(
                  item
                ) > 0
            );

          if (!usable.length) {
            throw new Error(
              "No packages are currently available for this option."
            );
          }

          setItems(
            usable
          );
        } catch (err: any) {
          console.error(
            "Failed to load service packages:",
            err
          );

          const message =
            err?.message ||
            "Unable to load service packages.";

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
          setLoadingItems(
            false
          );
        }
      },
      [
        extractItems,
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
        cleanString(
          providerCode
        );

      if (!code) return;

      setSelectedProviderCode(
        code
      );

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
            "This package does not have a valid customer price.",
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

      setAmount(
        String(value)
      );

      setCustomAmount(false);
      setError("");
    };

  const validateForm =
    (): boolean => {
      if (
        !selectedProviderCode
      ) {
        toast({
          title:
            "Select an option",
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
            "Select a package",
          description:
            "Please select a package before continuing.",
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
        serviceType ===
          "airtime-card" ||
        serviceType ===
          "data-card" ||
        serviceType === "waec" ||
        serviceType === "jamb"
      ) {
        const phone =
          normalizePhone(
            customer
          );

        if (
          !/^\+234\d{10}$/.test(
            phone
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

      const total =
        estimatedTotal;

      if (
        total <= 0
      ) {
        toast({
          title:
            "Invalid amount",
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
            "Please fund your wallet to continue.",
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
              `This plan costs ${formatNaira(
                price
              )}.`,
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
        normalizePhone(
          customer
        );

      const item =
        selectedItem;

      const provider =
        selectedProvider;

      const providerPrice =
        item
          ? getProviderPrice(item)
          : estimatedTotal;

      const sellingPrice =
        item
          ? getSellingPrice(item)
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
            ? selectedProviderCode
            : "",

        networkCode:
          serviceUsesNetwork(
            serviceType
          )
            ? selectedProviderCode
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
              getItemCode(item ?? {})
          ),

        dataPlan:
          cleanString(
            item?.data_plan ??
              item?.dataPlan ??
              getItemCode(item ?? {})
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
      if (
        !validateForm()
      ) {
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

        setProcessingPayment(
          true
        );

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

  /* ---------------------------------------------------------------- */
  /*  Empty state — no service selected                                */
  /* ---------------------------------------------------------------- */

  if (!service) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAF8F4] px-5">
        <div className="w-full max-w-sm rounded-[28px] border border-[#E7E3DA] bg-white p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#082A63]/[0.06]">
            <WalletCards className="h-7 w-7 text-[#082A63]" />
          </div>

          <h2 className="mt-5 text-lg font-extrabold text-[#0B1830]">
            No service selected
          </h2>

          <p className="mt-2 text-[13px] leading-5 text-[#8B93A1]">
            Choose a bill or top-up from your services list to
            continue.
          </p>

          <Button
            type="button"
            onClick={onBack}
            className="mt-6 h-12 w-full rounded-2xl bg-[#082A63] text-sm font-bold hover:bg-[#061f4b]"
          >
            Go back
          </Button>
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Coming-soon services                                             */
  /* ---------------------------------------------------------------- */

  if (isComingSoon) {
    return (
      <div className="min-h-screen bg-[#FAF8F4]">
        <header className="flex h-16 items-center gap-3 px-4">
          <button
            type="button"
            onClick={handleBack}
            className="flex h-10 w-10 items-center justify-center rounded-full text-[#0B1830] transition-colors hover:bg-black/5"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#082A63]/50">
              IyanjuPay
            </p>
            <h1 className="text-[15px] font-extrabold text-[#0B1830]">
              {service.title}
            </h1>
          </div>
        </header>

        <main className="flex items-center justify-center px-5 py-16">
          <div className="w-full max-w-sm rounded-[28px] border border-[#E7E3DA] bg-white p-8 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#082A63]/[0.06]">
              <Sparkles className="h-7 w-7 text-[#082A63]" />
            </div>

            <span className="mt-6 inline-flex rounded-full bg-[#FDF4DA] px-3 py-1 text-[11px] font-extrabold text-[#8B6500]">
              Coming soon
            </span>

            <h2 className="mt-4 text-xl font-extrabold tracking-tight text-[#0B1830]">
              {service.title}
            </h2>

            <p className="mx-auto mt-3 max-w-xs text-[13px] leading-5 text-[#8B93A1]">
              We're preparing this for your wallet. You'll be
              able to pay for it right here once it launches.
            </p>

            <Button
              type="button"
              onClick={handleBack}
              className="mt-7 h-12 w-full rounded-2xl bg-[#082A63] text-sm font-bold hover:bg-[#061f4b]"
            >
              Back to services
            </Button>
          </div>
        </main>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Live payment flow                                                 */
  /* ---------------------------------------------------------------- */

  return (
    <div className="min-h-screen bg-[#FAF8F4]">
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-[#E7E3DA]/70 bg-[#FAF8F4]/90 px-4 backdrop-blur-xl">
        <button
          type="button"
          onClick={handleBack}
          disabled={processingPayment || verifyingPin}
          className="flex h-10 w-10 items-center justify-center rounded-full text-[#0B1830] transition-colors hover:bg-black/5 disabled:opacity-40"
          aria-label="Go back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>

        <div className="min-w-0 flex-1 text-center">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#082A63]/50">
            IyanjuPay
          </p>
          <h1 className="truncate text-[15px] font-extrabold text-[#0B1830]">
            {service.title}
          </h1>
        </div>

        {onHistory ? (
          <button
            type="button"
            onClick={onHistory}
            disabled={processingPayment || verifyingPin}
            className="flex h-10 w-10 items-center justify-center rounded-full text-[#0B1830] transition-colors hover:bg-black/5 disabled:opacity-40"
            aria-label="Payment history"
          >
            <RefreshCw className="h-4.5 w-4.5" />
          </button>
        ) : (
          <div className="h-10 w-10" />
        )}
      </header>

      <main className="mx-auto max-w-md space-y-4 px-4 pb-[168px] pt-4">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-[26px] bg-gradient-to-br from-[#0B1E45] via-[#0E2657] to-[#17417F] p-5 text-white">
          <svg
            className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 opacity-[0.10]"
            viewBox="0 0 200 200"
          >
            <circle cx="100" cy="100" r="100" fill="#F4B400" />
          </svg>

          <svg
            className="pointer-events-none absolute -bottom-14 -left-10 h-32 w-32 opacity-[0.06]"
            viewBox="0 0 200 200"
          >
            <circle cx="100" cy="100" r="100" fill="#FFFFFF" />
          </svg>

          <div className="relative flex items-center justify-between">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10">
              <ServiceIcon className="h-5 w-5" />
            </div>

            <div className="rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-bold">
              Wallet · {formatNaira(walletBalance)}
            </div>
          </div>

          <p className="relative mt-5 text-[11px] font-semibold text-white/55">
            You're paying for
          </p>

          <p className="relative text-[19px] font-extrabold leading-tight">
            {service.title}
          </p>

          <div className="relative mt-4 flex items-end justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-white/45">
                Amount
              </p>
              <p className="text-[28px] font-black leading-none">
                {formatNaira(estimatedTotal)}
              </p>
            </div>

            {selectedProvider && (
              <p className="max-w-[46%] truncate text-right text-[12px] font-bold text-white/70">
                {getNetworkName(selectedProvider)}
              </p>
            )}
          </div>
        </div>

        {/* Step 1 — provider */}
        <SectionCard
          step="Step 1"
          title="Choose your option"
          subtitle="Network, biller or service option."
          action={
            <button
              type="button"
              onClick={() => void loadProviders()}
              disabled={
                loadingProviders ||
                processingPayment ||
                verifyingPin
              }
              className="flex h-8 w-8 items-center justify-center rounded-full text-[#082A63] transition-colors hover:bg-[#082A63]/[0.06] disabled:opacity-50"
              aria-label="Refresh options"
            >
              <RefreshCw
                className={[
                  "h-4 w-4",
                  loadingProviders ? "animate-spin" : "",
                ].join(" ")}
              />
            </button>
          }
        >
          {loadingProviders ? (
            <div className="flex gap-3 overflow-hidden">
              {[1, 2, 3, 4].map((item) => (
                <div
                  key={item}
                  className="h-[92px] w-[76px] shrink-0 animate-pulse rounded-2xl bg-[#EFEBE3]"
                />
              ))}
            </div>
          ) : providers.length > 0 ? (
            <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
              {providers.map((provider, index) => {
                const code = getNetworkCode(provider);

                if (!code) {
                  return null;
                }

                return (
                  <ProviderChip
                    key={`${code}-${index}`}
                    provider={provider}
                    selected={code === selectedProviderCode}
                    loading={loadingItems}
                    disabled={processingPayment || verifyingPin}
                    onClick={() =>
                      void handleProviderSelect(code)
                    }
                  />
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-[#DCD6C8] bg-[#FAF8F4] px-5 py-8 text-center">
              <Search className="mx-auto h-5 w-5 text-[#B7ADA0]" />

              <p className="mt-3 text-[13px] font-bold text-[#0B1830]">
                No options available
              </p>

              <p className="mt-1 text-[12px] leading-5 text-[#8B93A1]">
                We couldn't load the available service options.
              </p>

              <Button
                type="button"
                variant="outline"
                onClick={() => void loadProviders()}
                className="mt-4 h-9 rounded-xl border-[#E7E3DA] text-xs font-bold"
              >
                Try again
              </Button>
            </div>
          )}
        </SectionCard>

        {/* Step 2 — plans */}
        {selectedProviderCode && needsPlans && (
          <SectionCard
            step="Step 2"
            title="Choose a package"
            subtitle={
              selectedProvider
                ? `Available for ${getNetworkName(selectedProvider)}`
                : "Pick the package you want."
            }
            action={
              loadingItems ? (
                <Loader2 className="h-5 w-5 animate-spin text-[#082A63]" />
              ) : undefined
            }
          >
            {serviceType === "data" && (
              <div className="mb-4 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {DATA_TABS.map((tab) => {
                  const count = dataGroups[tab].length;

                  return (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setDataTab(tab)}
                      disabled={processingPayment || verifyingPin}
                      className={[
                        "shrink-0 rounded-full px-3.5 py-2 text-[12px] font-bold transition-all",
                        dataTab === tab
                          ? "bg-[#082A63] text-white"
                          : "bg-[#F1EEE6] text-[#5B6472]",
                      ].join(" ")}
                    >
                      {tab === "HOT" && (
                        <Flame className="mr-1 inline h-3 w-3 -mt-0.5" />
                      )}
                      {tab}
                      <span
                        className={
                          dataTab === tab
                            ? "ml-1 opacity-70"
                            : "ml-1 text-[#B7ADA0]"
                        }
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {items.length > 0 && (
              <div className="relative mb-4">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#B7ADA0]" />

                <Input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search packages..."
                  className="h-11 rounded-xl border-[#E7E3DA] bg-[#FAF8F4] pl-10 text-sm"
                />
              </div>
            )}

            {loadingItems ? (
              <LoadingCards />
            ) : visibleItems.length > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                {visibleItems.map((item, index) => (
                  <PlanCard
                    key={`${getItemCode(item)}-${index}`}
                    item={item}
                    selected={getItemCode(item) === selectedItemCode}
                    quantity={usesQuantity ? quantity : 1}
                    disabled={processingPayment || verifyingPin}
                    onClick={() => handleItemSelect(item)}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-[#DCD6C8] bg-[#FAF8F4] px-5 py-8 text-center">
                <Package className="mx-auto h-6 w-6 text-[#B7ADA0]" />

                <p className="mt-3 text-[13px] font-bold text-[#0B1830]">
                  No packages available
                </p>

                <p className="mt-1 text-[12px] leading-5 text-[#8B93A1]">
                  Nothing to show for this selection right now.
                </p>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void loadItems(selectedProviderCode)}
                  className="mt-4 h-9 rounded-xl border-[#E7E3DA] text-xs font-bold"
                >
                  <RefreshCw className="mr-2 h-3.5 w-3.5" />
                  Reload packages
                </Button>
              </div>
            )}
          </SectionCard>
        )}

        {/* Step 2 — amount */}
        {selectedProviderCode && isAmountBased && (
          <SectionCard
            step="Step 2"
            title="Choose amount"
            subtitle="Pick a value or enter a custom amount."
          >
            <div className="grid grid-cols-3 gap-2.5">
              {(serviceType === "airtime"
                ? AIRTIME_AMOUNTS
                : BILL_AMOUNTS
              ).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => handleAmountSelect(value)}
                  disabled={processingPayment || verifyingPin}
                  className={[
                    "rounded-2xl border px-3 py-3.5 text-center text-[13px] font-extrabold transition-all active:scale-95",
                    amount === String(value)
                      ? "border-[#082A63] bg-[#082A63] text-white"
                      : "border-[#E7E3DA] bg-white text-[#0B1830]",
                  ].join(" ")}
                >
                  {formatNaira(value)}
                </button>
              ))}

              <button
                type="button"
                onClick={() => {
                  setCustomAmount(true);
                  setAmount("");
                }}
                disabled={processingPayment || verifyingPin}
                className={[
                  "rounded-2xl border px-3 py-3.5 text-center text-[13px] font-extrabold transition-all active:scale-95",
                  customAmount
                    ? "border-[#F4B400] bg-[#FDF4DA] text-[#8B6500]"
                    : "border-[#E7E3DA] bg-white text-[#0B1830]",
                ].join(" ")}
              >
                Custom
              </button>
            </div>

            {customAmount && (
              <div className="mt-4">
                <Label
                  htmlFor="customAmount"
                  className="text-[13px] font-bold text-[#0B1830]"
                >
                  Enter amount
                </Label>

                <div className="relative mt-2">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-black text-[#B7ADA0]">
                    ₦
                  </span>

                  <Input
                    id="customAmount"
                    type="number"
                    min="50"
                    step="1"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder="Enter amount"
                    disabled={processingPayment || verifyingPin}
                    className="h-12 rounded-xl border-[#E7E3DA] pl-8"
                  />
                </div>
              </div>
            )}
          </SectionCard>
        )}

        {/* Step 2 — informational (no plans/amount) */}
        {selectedProviderCode && !needsPlans && !isAmountBased && (
          <SectionCard title={service.title}>
            <p className="text-[12.5px] leading-5 text-[#8B93A1]">
              Continue by entering the required customer
              information below.
            </p>
          </SectionCard>
        )}

        {/* Quantity */}
        {selectedProviderCode && usesQuantity && (
          <SectionCard title="Quantity" subtitle="How many units do you want?">
            <div className="flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                disabled={
                  processingPayment || verifyingPin || quantity <= 1
                }
                className="flex h-11 w-11 items-center justify-center rounded-full bg-[#F1EEE6] text-lg font-black text-[#0B1830] disabled:opacity-40"
              >
                −
              </button>

              <span className="w-10 text-center text-lg font-black text-[#0B1830]">
                {quantity}
              </span>

              <button
                type="button"
                onClick={() => setQuantity(Math.min(100, quantity + 1))}
                disabled={
                  processingPayment || verifyingPin || quantity >= 100
                }
                className="flex h-11 w-11 items-center justify-center rounded-full bg-[#F1EEE6] text-lg font-black text-[#0B1830] disabled:opacity-40"
              >
                +
              </button>
            </div>
          </SectionCard>
        )}

        {/* Customer details */}
        <SectionCard step="Step 3" title="Customer details">
          <div className="space-y-2">
            <Label
              htmlFor="serviceCustomer"
              className="text-[13px] font-bold text-[#0B1830]"
            >
              {customerLabel}
            </Label>

            <Input
              id="serviceCustomer"
              value={customer}
              onChange={(event) => setCustomer(event.target.value)}
              placeholder={customerPlaceholder}
              disabled={processingPayment || verifyingPin}
              inputMode={
                serviceType === "airtime" ||
                serviceType === "data" ||
                serviceType === "airtime-card" ||
                serviceType === "data-card" ||
                serviceType === "electricity" ||
                serviceType === "cable" ||
                serviceType === "waec" ||
                serviceType === "jamb"
                  ? "numeric"
                  : "text"
              }
              className="h-12 rounded-xl border-[#E7E3DA]"
            />
          </div>
        </SectionCard>

        {error && (
          <div className="flex items-start gap-3 rounded-2xl border border-[#F1C7C7] bg-[#FCEEEE] p-4">
            <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-[#C22E2E]" />

            <div>
              <p className="text-[13px] font-extrabold text-[#7A1E1E]">
                Something went wrong
              </p>
              <p className="mt-0.5 text-[12.5px] leading-5 text-[#9A3A3A]">
                {error}
              </p>
            </div>
          </div>
        )}
      </main>

      {/* Sticky pay bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#E7E3DA] bg-white/95 px-4 pb-[max(14px,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl">
        <div className="mx-auto max-w-md">
          {!balanceSufficient && estimatedTotal > 0 && (
            <p className="mb-2 text-center text-[11.5px] font-bold text-[#C22E2E]">
              Insufficient wallet balance for this transaction.
            </p>
          )}

          <div className="flex items-center gap-3">
            <div className="shrink-0">
              <p className="text-[9.5px] font-bold uppercase tracking-wide text-[#8B93A1]">
                Total
              </p>
              <p className="text-[18px] font-black leading-tight text-[#0B1830]">
                {formatNaira(estimatedTotal)}
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
                (needsPlans && !selectedItemCode) ||
                !customer.trim() ||
                estimatedTotal <= 0 ||
                !balanceSufficient
              }
              className="h-13 flex-1 rounded-2xl bg-[#082A63] text-[13.5px] font-extrabold shadow-[0_10px_24px_rgba(8,42,99,0.28)] hover:bg-[#061f4b] disabled:shadow-none"
            >
              {processingPayment ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <LockKeyhole className="mr-2 h-4 w-4" />
                  Pay securely
                  <ChevronRight className="ml-1.5 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* PIN bottom sheet */}
      {showPinPrompt && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#05132B]/55 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-t-[32px] bg-white pb-[max(20px,env(safe-area-inset-bottom))]">
            <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-[#E7E3DA]" />

            <div className="flex items-start justify-between px-6 pt-5">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#082A63]/[0.06]">
                  <LockKeyhole className="h-5 w-5 text-[#082A63]" />
                </div>

                <div>
                  <p className="text-[10.5px] font-bold uppercase tracking-wide text-[#8B93A1]">
                    Secure confirmation
                  </p>
                  <h2 className="text-[17px] font-extrabold text-[#0B1830]">
                    Confirm payment
                  </h2>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (verifyingPin) return;
                  setShowPinPrompt(false);
                  setPaymentPin("");
                  setError("");
                }}
                disabled={verifyingPin}
                className="flex h-9 w-9 items-center justify-center rounded-full text-[#8B93A1] transition-colors hover:bg-black/5 disabled:opacity-40"
                aria-label="Close"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            <div className="space-y-5 px-6 pb-8 pt-5">
              <div className="rounded-2xl bg-[#FAF8F4] p-4">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[12.5px] font-semibold text-[#8B93A1]">
                    Service
                  </span>
                  <span className="text-[13px] font-extrabold text-[#0B1830]">
                    {service.title}
                  </span>
                </div>

                <div className="my-3 h-px bg-[#E7E3DA]" />

                <div className="flex items-center justify-between gap-4">
                  <span className="text-[12.5px] font-semibold text-[#8B93A1]">
                    Amount
                  </span>
                  <span className="text-[19px] font-black text-[#082A63]">
                    {formatNaira(estimatedTotal)}
                  </span>
                </div>

                <div className="mt-3 flex items-start justify-between gap-4">
                  <span className="text-[12.5px] font-semibold text-[#8B93A1]">
                    {customerLabel}
                  </span>
                  <span className="break-all text-right text-[13px] font-bold text-[#0B1830]">
                    {normalizedCustomer}
                  </span>
                </div>

                {selectedItem && (
                  <div className="mt-3 flex items-start justify-between gap-4">
                    <span className="text-[12.5px] font-semibold text-[#8B93A1]">
                      Package
                    </span>
                    <span className="max-w-[65%] text-right text-[13px] font-bold text-[#0B1830]">
                      {getItemName(selectedItem)}
                    </span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="paymentPin"
                  className="text-[13px] font-bold text-[#0B1830]"
                >
                  Payment PIN
                </Label>

                <Input
                  id="paymentPin"
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={4}
                  value={paymentPin}
                  onChange={(event) => {
                    setPaymentPin(
                      event.target.value.replace(/\D/g, "").slice(0, 4)
                    );
                    setError("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && paymentPin.length === 4) {
                      void verifyPinAndPay();
                    }
                  }}
                  placeholder="••••"
                  disabled={verifyingPin}
                  autoFocus
                  className="h-14 rounded-2xl border-[#E7E3DA] bg-[#FAF8F4] text-center text-2xl font-black tracking-[0.6em]"
                />

                <div className="flex items-center justify-center gap-2 pt-1 text-[11px] font-medium text-[#8B93A1]">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Your PIN is verified securely.
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-3 rounded-2xl border border-[#F1C7C7] bg-[#FCEEEE] p-4">
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#C22E2E]" />
                  <p className="text-[12.5px] font-medium leading-5 text-[#7A1E1E]">
                    {error}
                  </p>
                </div>
              )}

              <Button
                type="button"
                onClick={() => void verifyPinAndPay()}
                disabled={verifyingPin || paymentPin.length !== 4}
                className="h-13 w-full rounded-2xl bg-[#082A63] text-[13.5px] font-extrabold hover:bg-[#061f4b]"
              >
                {verifyingPin ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    <LockKeyhole className="mr-2 h-4 w-4" />
                    Confirm payment
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ServicePayment;
