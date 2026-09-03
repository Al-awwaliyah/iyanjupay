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
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  CreditCard,
  History,
  Info,
  Loader2,
  LockKeyhole,
  Minus,
  Phone,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Tv,
  UserRound,
  Wifi,
  X,
  Zap,
  Plus,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface Service {
  title: string;
  type: string;
}

interface ServicePaymentProps {
  service: Service | null;
  walletBalance: number;
  onBack: () => void;
  onPurchase: (
    amount: number,
    details: Record<string, any>
  ) => Promise<void>;
  onHistory?: () => void;
}

interface CatalogueNetwork {
  code: string;
  name: string;
  id?: string;
  network_code?: string;
  networkCode?: string;
  biller_code?: string;
  billerCode?: string;
  value?: string;
  label?: string;
  network?: string;
  company?: string;
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
  code: string;
  name: string;
  provider_price?: number;
  providerPrice?: number;
  provider_amount?: number;
  providerAmount?: number;
  price?: number;
  selling_price?: number;
  sellingPrice?: number;
  salePrice?: number;
  amount?: number;
  value?: number | string;
  quantity?: number;
  network_code?: string;
  networkCode?: string;
  biller_code?: string;
  billerCode?: string;
  product_code?: string;
  productCode?: string;
  variation_code?: string;
  variationCode?: string;
  plan_code?: string;
  planCode?: string;
  code2?: string;
  category?: string;
  category_name?: string;
  categoryName?: string;
  tab?: string;
  validity?: string;
  label?: string;
  title?: string;
  plan_name?: string;
  planName?: string;
  package_name?: string;
  packageName?: string;
  exam_type?: string;
  examType?: string;
  description?: string;
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
  data?: any;
  markup?: number;
  [key: string]: any;
}

interface VerificationResponse {
  success?: boolean;
  message?: string;
  error?: string;
  customer_name?: string;
  customerName?: string;
  [key: string]: any;
}

const LIVE_SERVICES = new Set([
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

const DATA_TABS = [
  "HOT",
  "Extra Night",
  "Daily",
  "Weekly",
  "Monthly",
] as const;

type DataTab = (typeof DATA_TABS)[number];

const SERVICE_META: Record<
  string,
  {
    title: string;
    subtitle: string;
    icon: React.ElementType;
    accent: string;
  }
> = {
  airtime: {
    title: "Airtime",
    subtitle: "Recharge any mobile line instantly.",
    icon: Phone,
    accent: "from-blue-700 via-[#082A63] to-indigo-900",
  },
  data: {
    title: "Mobile Data",
    subtitle: "Choose the perfect plan for your line.",
    icon: Wifi,
    accent: "from-[#082A63] via-blue-800 to-indigo-950",
  },
  electricity: {
    title: "Electricity",
    subtitle: "Pay your electricity bill securely.",
    icon: Zap,
    accent: "from-amber-500 via-orange-500 to-[#082A63]",
  },
  cable: {
    title: "Cable TV",
    subtitle: "Keep your entertainment connected.",
    icon: Tv,
    accent: "from-purple-700 via-indigo-800 to-[#082A63]",
  },
  "airtime-card": {
    title: "Airtime E-Pin",
    subtitle: "Generate recharge PINs in seconds.",
    icon: CreditCard,
    accent: "from-[#082A63] via-blue-800 to-cyan-900",
  },
  "data-card": {
    title: "Data E-Pin",
    subtitle: "Generate data recharge PINs instantly.",
    icon: CreditCard,
    accent: "from-indigo-700 via-[#082A63] to-blue-950",
  },
  smile: {
    title: "Smile",
    subtitle: "Stay connected with Smile data bundles.",
    icon: Smartphone,
    accent: "from-pink-600 via-purple-700 to-[#082A63]",
  },
  waec: {
    title: "WAEC",
    subtitle: "Purchase your examination PIN securely.",
    icon: BadgeCheck,
    accent: "from-emerald-600 via-green-700 to-[#082A63]",
  },
  jamb: {
    title: "JAMB",
    subtitle: "Get your JAMB service quickly and securely.",
    icon: BadgeCheck,
    accent: "from-green-700 via-emerald-800 to-[#082A63]",
  },
  internet: {
    title: "Internet",
    subtitle: "Internet subscriptions are coming soon.",
    icon: Wifi,
    accent: "from-slate-700 via-slate-800 to-[#082A63]",
  },
  insurance: {
    title: "Insurance",
    subtitle: "Insurance services are coming soon.",
    icon: ShieldCheck,
    accent: "from-slate-700 via-slate-800 to-[#082A63]",
  },
  savings: {
    title: "Savings",
    subtitle: "Savings services are coming soon.",
    icon: Sparkles,
    accent: "from-slate-700 via-slate-800 to-[#082A63]",
  },
};

function normalizeServiceType(value?: string) {
  const type = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");

  const aliases: Record<string, string> = {
    airtime: "airtime",
    recharge: "airtime",
    "mobile-airtime": "airtime",

    data: "data",
    "mobile-data": "data",
    databundle: "data",
    "data-bundle": "data",

    electricity: "electricity",
    power: "electricity",
    "power-bill": "electricity",

    cable: "cable",
    "cable-tv": "cable",
    tv: "cable",

    "airtime-card": "airtime-card",
    airtimepin: "airtime-card",
    "airtime-epin": "airtime-card",
    "airtime-e-pin": "airtime-card",

    "data-card": "data-card",
    datapin: "data-card",
    "data-epin": "data-card",
    "data-e-pin": "data-card",

    smile: "smile",
    "smile-direct": "smile",

    waec: "waec",
    jamb: "jamb",

    internet: "internet",
    insurance: "insurance",
    savings: "savings",
  };

  return aliases[type] || type;
}

function money(value: number | string | null | undefined) {
  const numeric = Number(value || 0);

  return `₦${numeric.toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function numericValue(
  ...values: Array<number | string | null | undefined>
) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;

    const parsed = Number(
      String(value).replace(/[₦,\s]/g, "")
    );

    if (Number.isFinite(parsed)) return parsed;
  }

  return 0;
}

function cleanPhone(value: string) {
  return value.replace(/\D/g, "").slice(0, 11);
}

function getItemCode(item?: CatalogueItem | null) {
  if (!item) return "";

  return String(
    item.code ??
      item.productCode ??
      item.product_code ??
      item.variationCode ??
      item.variation_code ??
      item.planCode ??
      item.plan_code ??
      item.code2 ??
      item.id ??
      ""
  );
}

function getItemName(item?: CatalogueItem | null) {
  if (!item) return "";

  return String(
    item.name ??
      item.title ??
      item.label ??
      item.planName ??
      item.plan_name ??
      item.packageName ??
      item.package_name ??
      item.description ??
      "Service"
  );
}

function getItemProviderPrice(item?: CatalogueItem | null) {
  if (!item) return 0;

  return numericValue(
    item.providerPrice,
    item.provider_price,
    item.providerAmount,
    item.provider_amount,
    item.amount,
    item.price,
    item.value
  );
}

function getItemSellingPrice(item?: CatalogueItem | null) {
  if (!item) return 0;

  const explicit = numericValue(
    item.price,
    item.sellingPrice,
    item.selling_price,
    item.salePrice
  );

  if (explicit > 0) return explicit;

  return getItemProviderPrice(item);
}

function getNetworkCode(network?: CatalogueNetwork | null) {
  if (!network) return "";

  return String(
    network.code ??
      network.networkCode ??
      network.network_code ??
      network.id ??
      network.value ??
      ""
  );
}

function getBillerCode(biller?: CatalogueNetwork | null) {
  if (!biller) return "";

  return String(
    biller.billerCode ??
      biller.biller_code ??
      biller.code ??
      biller.id ??
      biller.value ??
      ""
  );
}

function getNetworkName(network?: CatalogueNetwork | null) {
  if (!network) return "Network";

  return String(
    network.name ??
      network.label ??
      network.network ??
      network.company ??
      "Network"
  );
}

function getLogo(network?: CatalogueNetwork | null) {
  if (!network) return "";

  return String(
    network.logoUrl ??
      network.logo_url ??
      network.logo ??
      network.imageUrl ??
      network.image_url ??
      network.image ??
      network.icon ??
      ""
  );
}

function getDataTab(item: CatalogueItem): DataTab {
  const explicit = String(
    item.tab ??
      item.category ??
      item.categoryName ??
      item.category_name ??
      ""
  ).toLowerCase();

  const name = getItemName(item).toLowerCase();

  if (
    explicit.includes("night") ||
    name.includes("night")
  ) {
    return "Extra Night";
  }

  if (
    explicit.includes("daily") ||
    name.includes("daily")
  ) {
    return "Daily";
  }

  if (
    explicit.includes("weekly") ||
    name.includes("weekly")
  ) {
    return "Weekly";
  }

  if (
    explicit.includes("monthly") ||
    name.includes("monthly") ||
    String(item.validity || "").toLowerCase().includes("30")
  ) {
    return "Monthly";
  }

  return "HOT";
}

function isInvalidCustomerName(name?: string) {
  const value = String(name || "").trim().toUpperCase();

  return (
    !value ||
    value.includes("INVALID") ||
    value.includes("NOT FOUND") ||
    value.includes("NOTFOUND") ||
    value === "N/A" ||
    value === "NULL"
  );
}

function toCatalogueArray(value: any): any[] {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) => {
      if (Array.isArray(child)) {
        return child.map((item) => {
          if (
            item &&
            typeof item === "object" &&
            !Array.isArray(item)
          ) {
            return {
              ...item,
              __parentKey: key,
            };
          }

          return {
            value: item,
            name: key,
            __parentKey: key,
          };
        });
      }

      if (
        child &&
        typeof child === "object" &&
        !Array.isArray(child)
      ) {
        return Object.entries(child).flatMap(
          ([nestedKey, nestedValue]) => {
            if (Array.isArray(nestedValue)) {
              return nestedValue.map((item) => ({
                ...(item &&
                typeof item === "object" &&
                !Array.isArray(item)
                  ? item
                  : { value: item }),
                __parentKey: key,
                __nestedKey: nestedKey,
              }));
            }

            if (
              nestedValue &&
              typeof nestedValue === "object"
            ) {
              return {
                ...nestedValue,
                __parentKey: key,
                __nestedKey: nestedKey,
              };
            }

            return {
              value: nestedValue,
              name: nestedKey,
              __parentKey: key,
            };
          }
        );
      }

      return [
        {
          value: child,
          name: key,
          __parentKey: key,
        },
      ];
    });
  }

  return [];
}

function normalizeNetwork(
  network: CatalogueNetwork,
  index: number
): CatalogueNetwork {
  const code =
    getNetworkCode(network) ||
    String(index + 1).padStart(2, "0");

  const name =
    getNetworkName(network) ||
    "Network";

  return {
    ...network,
    code,
    name,
  };
}

function normalizeItem(
  item: any,
  index: number,
  context: Partial<CatalogueItem> = {}
): CatalogueItem {
  const rawCode = String(
    item?.code ??
      item?.CODE ??
      item?.PRODUCT_CODE ??
      item?.PRODUCT_ID ??
      item?.PRODUCTID ??
      item?.variationCode ??
      item?.variation_code ??
      item?.PLAN_CODE ??
      item?.PLAN_ID ??
      item?.id ??
      item?.ID ??
      context.code ??
      `${index + 1}`
  );

  const rawName = String(
    item?.name ??
      item?.NAME ??
      item?.PRODUCT_NAME ??
      item?.PRODUCTNAME ??
      item?.planName ??
      item?.PLAN_NAME ??
      item?.PACKAGE_NAME ??
      item?.description ??
      item?.DESCRIPTION ??
      item?.title ??
      item?.TITLE ??
      item?.label ??
      item?.LABEL ??
      context.name ??
      `Plan ${index + 1}`
  );

  const providerPrice = numericValue(
    item?.providerPrice,
    item?.provider_price,
    item?.PRODUCT_AMOUNT,
    item?.PRODUCTAMOUNT,
    item?.amount,
    item?.AMOUNT,
    item?.price,
    item?.PRICE,
    item?.value,
    item?.VALUE
  );

  const explicitSellingPrice = numericValue(
    item?.sellingPrice,
    item?.selling_price,
    item?.salePrice,
    item?.price,
    item?.PRICE
  );

  return {
    ...item,
    ...context,
    code: rawCode,
    name: rawName,
    providerPrice,
    provider_price: providerPrice,
    providerAmount: providerPrice,
    provider_amount: providerPrice,
    price:
      explicitSellingPrice > 0
        ? explicitSellingPrice
        : providerPrice,
    networkCode:
      item?.networkCode ??
      item?.network_code ??
      context.networkCode ??
      context.network_code,
    network_code:
      item?.network_code ??
      item?.networkCode ??
      context.network_code ??
      context.networkCode,
    billerCode:
      item?.billerCode ??
      item?.biller_code ??
      context.billerCode ??
      context.biller_code,
    biller_code:
      item?.biller_code ??
      item?.billerCode ??
      context.biller_code ??
      context.billerCode,
  };
}

function extractNetworks(
  response: CatalogueResponse
): CatalogueNetwork[] {
  const direct =
    response.networks ??
    response.providers ??
    response.data?.networks ??
    response.data?.providers;

  if (Array.isArray(direct)) {
    return direct.map(normalizeNetwork);
  }

  const nested =
    response.networks ??
    response.data?.networks ??
    response.data?.MOBILE_NETWORK ??
    response.data?.mobile_network ??
    response.data;

  if (
    nested &&
    typeof nested === "object" &&
    !Array.isArray(nested)
  ) {
    return Object.entries(nested).map(
      ([key, value], index) => {
        const source =
          value &&
          typeof value === "object" &&
          !Array.isArray(value)
            ? value
            : {};

        const code = String(
          source.ID ??
            source.id ??
            source.CODE ??
            source.code ??
            source.networkCode ??
            source.network_code ??
            ""
        );

        return normalizeNetwork(
          {
            ...source,
            code,
            name:
              source.NAME ??
              source.name ??
              source.NETWORK_NAME ??
              source.network ??
              key,
            networkCode: code,
            network_code: code,
          },
          index
        );
      }
    );
  }

  return [];
}

function extractBillers(
  response: CatalogueResponse
): CatalogueNetwork[] {
  const direct =
    response.billers ??
    response.data?.billers ??
    response.data?.companies ??
    response.data?.discos;

  if (Array.isArray(direct)) {
    return direct.map(normalizeNetwork);
  }

  if (
    direct &&
    typeof direct === "object" &&
    !Array.isArray(direct)
  ) {
    return Object.entries(direct).map(
      ([key, value], index) =>
        normalizeNetwork(
          {
            ...(value &&
            typeof value === "object" &&
            !Array.isArray(value)
              ? value
              : {}),
            code:
              (value &&
              typeof value === "object" &&
              !Array.isArray(value)
                ? String(
                    value.code ??
                      value.id ??
                      value.billerCode ??
                      value.biller_code ??
                      ""
                  )
                : "") || String(index + 1),
            name:
              value &&
              typeof value === "object" &&
              !Array.isArray(value)
                ? String(
                    value.name ??
                      value.label ??
                      value.company ??
                      key
                  )
                : key,
          },
          index
        )
    );
  }

  return [];
}

function extractItems(
  response: CatalogueResponse
): CatalogueItem[] {
  const direct =
    response.items ??
    response.data?.items ??
    response.data?.products ??
    response.data?.packages;

  if (Array.isArray(direct)) {
    return direct.map(normalizeItem);
  }

  return toCatalogueArray(direct).map(normalizeItem);
}

function extractPlans(
  response: CatalogueResponse
): CatalogueItem[] {
  const direct =
    response.plans ??
    response.data?.plans ??
    response.data?.packages ??
    response.data?.products;

  if (Array.isArray(direct)) {
    return direct.map(normalizeItem);
  }

  const recursive = toCatalogueArray(
    direct ??
      response.data?.MOBILE_NETWORK ??
      response.data
  );

  return recursive.map((item, index) => {
    const network =
      item?.__parentKey ||
      item?.network ||
      item?.NETWORK ||
      "";

    return normalizeItem(item, index, {
      networkCode:
        item?.networkCode ??
        item?.network_code ??
        network,
      network_code:
        item?.network_code ??
        item?.networkCode ??
        network,
    });
  });
}

function getServiceMeta(serviceType: string) {
  return (
    SERVICE_META[serviceType] || {
      title: "Service",
      subtitle: "Complete your transaction securely.",
      icon: Smartphone,
      accent:
        "from-[#082A63] via-blue-800 to-indigo-950",
    }
  );
}

const NetworkCard = ({
  network,
  selected,
  onClick,
}: {
  network: CatalogueNetwork;
  selected: boolean;
  onClick: () => void;
}) => {
  const logo = getLogo(network);
  const name = getNetworkName(network);
  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "group relative flex min-h-[104px] flex-col items-center justify-center rounded-2xl border p-4 text-center transition-all duration-200",
        selected
          ? "border-[#082A63] bg-[#082A63]/[0.045] shadow-[0_10px_30px_rgba(8,42,99,0.12)]"
          : "border-slate-200 bg-white hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg",
      ].join(" ")}
    >
      {selected && (
        <span className="absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#082A63] text-white">
          <Check className="h-3 w-3" />
        </span>
      )}

      <div
        className={[
          "mb-2.5 flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border bg-white text-sm font-bold shadow-sm",
          selected
            ? "border-[#082A63]/20"
            : "border-slate-100",
        ].join(" ")}
      >
        {logo ? (
          <img
            src={logo}
            alt=""
            className="h-full w-full object-contain p-1.5"
            onError={(event) => {
              event.currentTarget.style.display = "none";
              const fallback =
                event.currentTarget.nextElementSibling;

              if (fallback instanceof HTMLElement) {
                fallback.style.display = "flex";
              }
            }}
          />
        ) : null}

        <span
          className="items-center justify-center text-[#082A63]"
          style={{
            display: logo ? "none" : "flex",
          }}
        >
          {initials}
        </span>
      </div>

      <span className="line-clamp-1 text-xs font-semibold text-slate-800">
        {name}
      </span>
    </button>
  );
};

const PlanCard = ({
  item,
  selected,
  onClick,
}: {
  item: CatalogueItem;
  selected: boolean;
  onClick: () => void;
}) => {
  const name = getItemName(item);
  const price = getItemSellingPrice(item);
  const validity = String(
    item.validity ||
      item.duration ||
      item.validity_period ||
      ""
  );

  const dataMatch = name.match(
    /(\d+(?:\.\d+)?)\s*(GB|MB)/i
  );

  const dataSize = dataMatch
    ? `${dataMatch[1]} ${dataMatch[2].toUpperCase()}`
    : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "group relative w-full overflow-hidden rounded-2xl border p-4 text-left transition-all duration-200 sm:p-5",
        selected
          ? "border-[#082A63] bg-[#082A63] text-white shadow-[0_16px_40px_rgba(8,42,99,0.2)]"
          : "border-slate-200 bg-white hover:-translate-y-0.5 hover:border-[#082A63]/30 hover:shadow-xl",
      ].join(" ")}
    >
      {selected && (
        <div className="absolute right-4 top-4 flex h-6 w-6 items-center justify-center rounded-full bg-white/15">
          <Check className="h-3.5 w-3.5 text-white" />
        </div>
      )}

      {!selected && (
        <div className="absolute right-0 top-0 h-16 w-16 overflow-hidden">
          <div className="absolute right-[-30px] top-[9px] rotate-45 bg-[#F4B400] px-7 py-0.5 text-[8px] font-bold text-[#082A63]">
            VALUE
          </div>
        </div>
      )}

      <div className="pr-8">
        {dataSize ? (
          <p
            className={[
              "text-2xl font-extrabold tracking-tight",
              selected ? "text-white" : "text-[#082A63]",
            ].join(" ")}
          >
            {dataSize}
          </p>
        ) : (
          <p
            className={[
              "line-clamp-2 text-base font-bold",
              selected ? "text-white" : "text-slate-900",
            ].join(" ")}
          >
            {name}
          </p>
        )}

        <p
          className={[
            "mt-1 line-clamp-2 text-xs leading-5",
            selected
              ? "text-white/70"
              : "text-slate-500",
          ].join(" ")}
        >
          {dataSize ? name : validity || "Available instantly"}
        </p>
      </div>

      <div className="mt-5 flex items-end justify-between gap-3">
        <div>
          <p
            className={[
              "text-xl font-extrabold tracking-tight",
              selected ? "text-white" : "text-slate-900",
            ].join(" ")}
          >
            {money(price)}
          </p>

          {validity && dataSize && (
            <p
              className={[
                "mt-0.5 text-[11px]",
                selected
                  ? "text-white/60"
                  : "text-slate-400",
              ].join(" ")}
            >
              {validity}
            </p>
          )}
        </div>

        <span
          className={[
            "flex h-8 w-8 items-center justify-center rounded-full transition-transform group-hover:translate-x-0.5",
            selected
              ? "bg-white/10"
              : "bg-slate-100",
          ].join(" ")}
        >
          <ArrowRight
            className={[
              "h-4 w-4",
              selected
                ? "text-white"
                : "text-[#082A63]",
            ].join(" ")}
          />
        </span>
      </div>
    </button>
  );
};

const SectionHeading = ({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description?: string;
}) => (
  <div className="mb-4 flex items-start gap-3">
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#082A63] text-xs font-bold text-white shadow-sm">
      {number}
    </div>

    <div>
      <h2 className="text-sm font-bold text-slate-900 sm:text-base">
        {title}
      </h2>

      {description && (
        <p className="mt-0.5 text-xs leading-5 text-slate-500">
          {description}
        </p>
      )}
    </div>
  </div>
);

const FieldLabel = ({
  children,
  optional,
}: {
  children: React.ReactNode;
  optional?: boolean;
}) => (
  <div className="mb-2 flex items-center justify-between">
    <Label className="text-xs font-semibold text-slate-700">
      {children}
    </Label>

    {optional && (
      <span className="text-[10px] text-slate-400">
        Optional
      </span>
    )}
  </div>
);

const ServicePayment = ({
  service,
  onBack,
  onPurchase,
  onHistory,
}: ServicePaymentProps) => {
  const serviceType = normalizeServiceType(service?.type);

  const meta = getServiceMeta(serviceType);
  const ServiceIcon = meta.icon;

  const isComingSoon =
    COMING_SOON_SERVICES.has(serviceType) ||
    !LIVE_SERVICES.has(serviceType);

  const isAirtime = serviceType === "airtime";
  const isData = serviceType === "data";
  const isElectricity = serviceType === "electricity";
  const isCable = serviceType === "cable";
  const isAirtimeCard = serviceType === "airtime-card";
  const isDataCard = serviceType === "data-card";
  const isSmile = serviceType === "smile";
  const isWaec = serviceType === "waec";
  const isJamb = serviceType === "jamb";

  const needsNetwork =
    isAirtime ||
    isData ||
    isAirtimeCard ||
    isDataCard;

  const [loadingCatalogue, setLoadingCatalogue] =
    useState(false);

  const [catalogueError, setCatalogueError] =
    useState("");

  const [networks, setNetworks] = useState<
    CatalogueNetwork[]
  >([]);

  const [billers, setBillers] = useState<
    CatalogueNetwork[]
  >([]);

  const [items, setItems] = useState<
    CatalogueItem[]
  >([]);

  const [plans, setPlans] = useState<
    CatalogueItem[]
  >([]);

  const [selectedNetwork, setSelectedNetwork] =
    useState("");

  const [selectedBiller, setSelectedBiller] =
    useState("");

  const [selectedItemCode, setSelectedItemCode] =
    useState("");

  const [dataTab, setDataTab] =
    useState<DataTab>("HOT");

  const [phone, setPhone] = useState("");

  const [amount, setAmount] = useState("");

  const [quantity, setQuantity] = useState(1);

  const [meterType, setMeterType] =
    useState("01");

  const [meterNumber, setMeterNumber] =
    useState("");

  const [smartcardNumber, setSmartcardNumber] =
    useState("");

  const [examType, setExamType] =
    useState("");

  const [accountId, setAccountId] =
    useState("");

  const [verifying, setVerifying] =
    useState(false);

  const [verifiedCustomer, setVerifiedCustomer] =
    useState("");

  const [verifiedType, setVerifiedType] =
    useState<"meter" | "cable" | "smile" | "">("");

  const [purchaseLoading, setPurchaseLoading] =
    useState(false);

  const [showPinModal, setShowPinModal] =
    useState(false);

  const [paymentPin, setPaymentPin] =
    useState("");

  const [pinLoading, setPinLoading] =
    useState(false);

  const [recipientPhone, setRecipientPhone] =
    useState("");

  const invokeCatalogue = useCallback(
    async (
      extra: Record<string, any> = {}
    ): Promise<CatalogueResponse> => {
      const { data, error } =
        await supabase.functions.invoke(
          "clubkonnect-services",
          {
            body: {
              action: "catalog",
              service: serviceType,
              ...extra,
            },
          }
        );

      if (error) {
        throw new Error(
          error.message || "Unable to load this service."
        );
      }

      const response =
        (data || {}) as CatalogueResponse;

      if (response.success === false) {
        throw new Error(
          response.message ||
            response.error ||
            "Unable to load this service."
        );
      }

      return response;
    },
    [serviceType]
  );

  const loadCatalogue = useCallback(
    async (
      extra: Record<string, any> = {}
    ) => {
      if (isComingSoon) return;

      setLoadingCatalogue(true);
      setCatalogueError("");

      try {
        const response =
          await invokeCatalogue(extra);

        const nextNetworks =
          extractNetworks(response);

        const nextBillers =
          extractBillers(response);

        const nextItems =
          extractItems(response);

        const nextPlans =
          extractPlans(response);

        setNetworks(nextNetworks);
        setBillers(nextBillers);
        setItems(nextItems);
        setPlans(nextPlans);

        if (
          !selectedNetwork &&
          nextNetworks.length === 1
        ) {
          setSelectedNetwork(
            getNetworkCode(nextNetworks[0])
          );
        }

        if (
          !selectedBiller &&
          nextBillers.length === 1
        ) {
          setSelectedBiller(
            getBillerCode(nextBillers[0])
          );
        }

        const combined = [
          ...nextItems,
          ...nextPlans,
        ];

        if (
          !selectedItemCode &&
          combined.length === 1
        ) {
          setSelectedItemCode(
            getItemCode(combined[0])
          );

          const nextExamType =
            combined[0]?.examType ??
            combined[0]?.exam_type;

          if (nextExamType) {
            setExamType(String(nextExamType));
          }
        }
      } catch (error: any) {
        const message =
          error?.message ||
          "Unable to load the service catalogue.";

        setCatalogueError(message);
      } finally {
        setLoadingCatalogue(false);
      }
    },
    [
      invokeCatalogue,
      isComingSoon,
      selectedBiller,
      selectedItemCode,
      selectedNetwork,
    ]
  );

  useEffect(() => {
    setSelectedNetwork("");
    setSelectedBiller("");
    setSelectedItemCode("");
    setDataTab("HOT");
    setPhone("");
    setAmount("");
    setQuantity(1);
    setMeterType("01");
    setMeterNumber("");
    setSmartcardNumber("");
    setExamType("");
    setAccountId("");
    setVerifiedCustomer("");
    setVerifiedType("");
    setCatalogueError("");
    setPaymentPin("");

    if (!isComingSoon) {
      void loadCatalogue();
    }
  }, [
    serviceType,
    isComingSoon,
    loadCatalogue,
  ]);

  const selectedNetworkObject =
    useMemo(
      () =>
        networks.find(
          (network) =>
            getNetworkCode(network) ===
            selectedNetwork
        ) || null,
      [networks, selectedNetwork]
    );

  const selectedBillerObject =
    useMemo(
      () =>
        billers.find(
          (biller) =>
            getBillerCode(biller) ===
            selectedBiller
        ) || null,
      [billers, selectedBiller]
    );

  const allDataPlans =
    useMemo(() => {
      const source =
        plans.length > 0 ? plans : items;

      const seen = new Set<string>();

      return source.filter((item) => {
        const code = getItemCode(item);

        if (!code || seen.has(code)) {
          return false;
        }

        seen.add(code);
        return true;
      });
    }, [plans, items]);

  const visibleDataPlans =
    useMemo(() => {
      if (!isData) return [];

      if (dataTab === "HOT") {
        return allDataPlans;
      }

      return allDataPlans.filter(
        (item) =>
          getDataTab(item) === dataTab
      );
    }, [
      allDataPlans,
      dataTab,
      isData,
    ]);

  const catalogueItems =
    useMemo(() => {
      if (isData) {
        return visibleDataPlans;
      }

      const source =
        items.length > 0 ? items : plans;

      const seen = new Set<string>();

      return source.filter((item) => {
        const code = getItemCode(item);

        if (!code || seen.has(code)) {
          return false;
        }

        seen.add(code);
        return true;
      });
    }, [
      isData,
      items,
      plans,
      visibleDataPlans,
    ]);

  const selectedItem =
    useMemo(() => {
      const all = [
        ...items,
        ...plans,
      ];

      return (
        all.find(
          (item) =>
            getItemCode(item) ===
            selectedItemCode
        ) || null
      );
    }, [
      items,
      plans,
      selectedItemCode,
    ]);

  const selectedSellingPrice =
    getItemSellingPrice(selectedItem);

  const selectedProviderPrice =
    getItemProviderPrice(selectedItem);

  const amountNumber =
    numericValue(amount);

  const computedTotal = useMemo(() => {
    if (isAirtime) {
      return amountNumber;
    }

    if (isElectricity) {
      return amountNumber;
    }

    if (
      isAirtimeCard ||
      isDataCard
    ) {
      return (
        selectedSellingPrice *
        quantity
      );
    }

    return selectedSellingPrice;
  }, [
    amountNumber,
    isAirtime,
    isAirtimeCard,
    isDataCard,
    isElectricity,
    quantity,
    selectedSellingPrice,
  ]);

  const serviceReady = useMemo(() => {
    if (isAirtime) {
      return (
        Boolean(selectedNetwork) &&
        phone.length >= 10 &&
        amountNumber >= 50
      );
    }

    if (isData) {
      return (
        Boolean(selectedNetwork) &&
        Boolean(selectedItemCode) &&
        phone.length >= 10
      );
    }

    if (isElectricity) {
      return (
        Boolean(selectedBiller) &&
        meterNumber.length >= 6 &&
        Boolean(verifiedCustomer) &&
        amountNumber >= 100
      );
    }

    if (isCable) {
      return (
        Boolean(selectedBiller) &&
        Boolean(selectedItemCode) &&
        smartcardNumber.length >= 6 &&
        Boolean(verifiedCustomer)
      );
    }

    if (isAirtimeCard) {
      return (
        Boolean(selectedNetwork) &&
        Boolean(selectedItemCode) &&
        quantity >= 1
      );
    }

    if (isDataCard) {
      return (
        Boolean(selectedNetwork) &&
        Boolean(selectedItemCode) &&
        quantity >= 1
      );
    }

    if (isSmile) {
      return (
        Boolean(accountId.trim()) &&
        Boolean(selectedItemCode)
      );
    }

    if (isWaec) {
      return (
        Boolean(selectedItemCode) &&
        phone.length >= 10
      );
    }

    if (isJamb) {
      return (
        Boolean(examType) &&
        phone.length >= 10
      );
    }

    return false;
  }, [
    accountId,
    amountNumber,
    examType,
    isAirtime,
    isAirtimeCard,
    isCable,
    isData,
    isDataCard,
    isElectricity,
    isJamb,
    isSmile,
    isWaec,
    meterNumber,
    phone,
    quantity,
    selectedBiller,
    selectedItemCode,
    selectedNetwork,
    smartcardNumber,
    verifiedCustomer,
  ]);

  const handleNetworkChange =
    async (value: string) => {
      setSelectedNetwork(value);
      setSelectedItemCode("");
      setCatalogueError("");

      if (isData || isAirtimeCard || isDataCard) {
        try {
          setLoadingCatalogue(true);

          const response =
            await invokeCatalogue({
              network_code: value,
            });

          const nextItems =
            extractItems(response);

          const nextPlans =
            extractPlans(response);

          setItems(nextItems);
          setPlans(nextPlans);

          if (
            nextItems.length === 1 &&
            !isData
          ) {
            setSelectedItemCode(
              getItemCode(nextItems[0])
            );
          }
        } catch (error: any) {
          setCatalogueError(
            error?.message ||
              "Unable to load plans for this network."
          );
        } finally {
          setLoadingCatalogue(false);
        }
      }
    };

  const handleBillerChange =
    async (value: string) => {
      setSelectedBiller(value);
      setSelectedItemCode("");
      setVerifiedCustomer("");
      setVerifiedType("");

      try {
        setLoadingCatalogue(true);
        setCatalogueError("");

        const response =
          await invokeCatalogue({
            biller_code: value,
          });

        const nextItems =
          extractItems(response);

        const nextPlans =
          extractPlans(response);

        setItems(nextItems);
        setPlans(nextPlans);

        const combined = [
          ...nextItems,
          ...nextPlans,
        ];

        if (combined.length === 1) {
          setSelectedItemCode(
            getItemCode(combined[0])
          );
        }
      } catch (error: any) {
        setCatalogueError(
          error?.message ||
            "Unable to load available packages."
        );
      } finally {
        setLoadingCatalogue(false);
      }
    };

  const verifyMeter = async () => {
    if (
      !selectedBiller ||
      meterNumber.trim().length < 6
    ) {
      toast.error(
        "Enter a valid meter number first."
      );
      return;
    }

    setVerifying(true);
    setVerifiedCustomer("");
    setVerifiedType("");

    try {
      const { data, error } =
        await supabase.functions.invoke(
          "clubkonnect-services",
          {
            body: {
              action: "verify_meter",
              service: "electricity",
              electric_company:
                selectedBiller,
              biller_code:
                selectedBiller,
              meter_type: meterType,
              meter_number:
                meterNumber.trim(),
              meter_no:
                meterNumber.trim(),
            },
          }
        );

      if (error) {
        throw new Error(
          error.message ||
            "Meter verification failed."
        );
      }

      const response =
        (data || {}) as VerificationResponse;

      const customerName =
        response.customerName ??
        response.customer_name ??
        "";

      if (
        response.success === false ||
        isInvalidCustomerName(customerName)
      ) {
        throw new Error(
          response.message ||
            response.error ||
            "The meter could not be verified."
        );
      }

      setVerifiedCustomer(
        String(customerName)
      );

      setVerifiedType("meter");

      toast.success("Meter verified successfully.");
    } catch (error: any) {
      toast.error(
        error?.message ||
          "Unable to verify this meter."
      );
    } finally {
      setVerifying(false);
    }
  };

  const verifyCable = async () => {
    if (
      !selectedBiller ||
      smartcardNumber.trim().length < 6
    ) {
      toast.error(
        "Enter a valid smartcard number first."
      );
      return;
    }

    setVerifying(true);
    setVerifiedCustomer("");
    setVerifiedType("");

    try {
      const { data, error } =
        await supabase.functions.invoke(
          "clubkonnect-services",
          {
            body: {
              action: "verify_cable",
              service: "cable",
              cable_tv:
                selectedBiller,
              cable_code:
                selectedBiller,
              biller_code:
                selectedBiller,
              smartcard_number:
                smartcardNumber.trim(),
              smartcard_no:
                smartcardNumber.trim(),
            },
          }
        );

      if (error) {
        throw new Error(
          error.message ||
            "Smartcard verification failed."
        );
      }

      const response =
        (data || {}) as VerificationResponse;

      const customerName =
        response.customerName ??
        response.customer_name ??
        "";

      if (
        response.success === false ||
        isInvalidCustomerName(customerName)
      ) {
        throw new Error(
          response.message ||
            response.error ||
            "The smartcard could not be verified."
        );
      }

      setVerifiedCustomer(
        String(customerName)
      );

      setVerifiedType("cable");

      toast.success(
        "Smartcard verified successfully."
      );
    } catch (error: any) {
      toast.error(
        error?.message ||
          "Unable to verify this smartcard."
      );
    } finally {
      setVerifying(false);
    }
  };

  const buildPurchaseDetails =
    (): Record<string, any> => {
      const networkCode =
        getNetworkCode(selectedNetworkObject);

      const billerCode =
        getBillerCode(selectedBillerObject);

      const itemCode =
        getItemCode(selectedItem);

      const itemName =
        getItemName(selectedItem);

      const details: Record<string, any> = {
        type: serviceType,
        service: serviceType,

        network_code: networkCode,
        networkCode: networkCode,
        mobile_network: networkCode,

        biller_code: billerCode,
        billerCode: billerCode,

        item_code: itemCode,
        product_code: itemCode,
        variation_code: itemCode,
        plan_code: itemCode,
        package_code: itemCode,

        item_name: itemName,
        package_name: itemName,

        provider_price:
          selectedProviderPrice,

        provider_amount:
          selectedProviderPrice,

        selling_price:
          computedTotal,

        selling_amount:
          computedTotal,

        quantity,

        phone,
        phoneNumber: phone,

        recipient_phone:
          recipientPhone || phone,
      };

      if (isAirtime) {
        details.amount = amountNumber;
        details.network_code =
          networkCode;
        details.networkCode =
          networkCode;
        details.MobileNetwork =
          networkCode;
        details.MobileNumber =
          phone;
      }

      if (isData) {
        details.data_plan =
          itemCode;
        details.dataPlan =
          itemCode;
        details.MobileNetwork =
          networkCode;
        details.MobileNumber =
          phone;
      }

      if (isElectricity) {
        details.electric_company =
          billerCode;
        details.company_code =
          billerCode;
        details.meter_type =
          meterType;
        details.meter_number =
          meterNumber.trim();
        details.meter_no =
          meterNumber.trim();
        details.amount =
          amountNumber;
        details.PhoneNo =
          phone;
        details.customer_name =
          verifiedCustomer;
      }

      if (isCable) {
        details.cable_tv =
          billerCode;
        details.cable_code =
          billerCode;
        details.package =
          itemCode;
        details.package_code =
          itemCode;
        details.smartcard_number =
          smartcardNumber.trim();
        details.smartcard_no =
          smartcardNumber.trim();
        details.smartCardNumber =
          smartcardNumber.trim();
        details.phone =
          phone;
        details.amount =
          selectedProviderPrice;
        details.customer_name =
          verifiedCustomer;
      }

      if (isAirtimeCard) {
        details.value =
          selectedProviderPrice;
        details.quantity =
          quantity;
        details.MobileNetwork =
          networkCode;

        delete details.phone;
        delete details.phoneNumber;
        delete details.recipient_phone;
      }

      if (isDataCard) {
        details.data_plan =
          itemCode;
        details.dataPlan =
          itemCode;
        details.MobileNetwork =
          networkCode;
        details.quantity =
          quantity;

        delete details.phone;
        delete details.phoneNumber;
        delete details.recipient_phone;
      }

      if (isSmile) {
        details.smile =
          "smile-direct";
        details.mobile_network =
          "smile-direct";
        details.network_code =
          "smile-direct";
        details.account_id =
          accountId.trim();
        details.mobile_number =
          accountId.trim();
        details.data_plan =
          itemCode;
        details.dataPlan =
          itemCode;
      }

      if (isWaec) {
        details.exam_type =
          examType || itemCode;
        details.phone =
          phone;
        details.phoneNumber =
          phone;
      }

      if (isJamb) {
        details.exam_type =
          examType;
        details.phone =
          phone;
        details.phoneNumber =
          phone;

        if (itemCode) {
          details.package_code =
            itemCode;
        }
      }

      return details;
    };

  const verifyPaymentPin =
    async () => {
      if (paymentPin.length !== 4) {
        toast.error(
          "Enter your 4-digit payment PIN."
        );
        return false;
      }

      setPinLoading(true);

      try {
        const { data, error } =
          await supabase.rpc(
            "verify_payment_pin",
            {
              p_pin: paymentPin,
            }
          );

        if (error) {
          throw new Error(
            error.message ||
              "Unable to verify payment PIN."
          );
        }

        if (!data) {
          throw new Error(
            "Incorrect payment PIN."
          );
        }

        return true;
      } catch (error: any) {
        toast.error(
          error?.message ||
            "Incorrect payment PIN."
        );

        return false;
      } finally {
        setPinLoading(false);
      }
    };

  const handleContinue = () => {
    if (purchaseLoading) return;

    if (!serviceReady) {
      toast.error(
        "Please complete the required information."
      );
      return;
    }

    if (computedTotal <= 0) {
      toast.error(
        "Unable to calculate the payment amount."
      );
      return;
    }

    setPaymentPin("");
    setShowPinModal(true);
  };

  const confirmPurchase = async () => {
    if (pinLoading || purchaseLoading) {
      return;
    }

    const verified =
      await verifyPaymentPin();

    if (!verified) return;

    setPurchaseLoading(true);

    try {
      const details =
        buildPurchaseDetails();

      details.payment_pin =
        paymentPin;

      await onPurchase(
        computedTotal,
        details
      );

      setShowPinModal(false);
      setPaymentPin("");

      toast.success(
        "Transaction submitted successfully."
      );
    } catch (error: any) {
      toast.error(
        error?.message ||
          "Unable to complete this transaction."
      );
    } finally {
      setPurchaseLoading(false);
    }
  };

  const displayPhone =
    phone ||
    recipientPhone ||
    "Not provided";

  const summaryTitle =
    isData && selectedItem
      ? getItemName(selectedItem)
      : meta.title;

  const summarySubtitle =
    selectedNetworkObject
      ? getNetworkName(selectedNetworkObject)
      : selectedBillerObject
        ? getNetworkName(selectedBillerObject)
        : isSmile
          ? "Smile"
          : "";

  if (isComingSoon) {
    return (
      <div className="min-h-screen bg-[#F7F9FC]">
        <div className="mx-auto max-w-4xl px-4 pb-12 pt-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={onBack}
            className="mb-5 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>

          <div
            className={[
              "relative overflow-hidden rounded-[28px] bg-gradient-to-br p-7 text-white shadow-2xl sm:p-10",
              meta.accent,
            ].join(" ")}
          >
            <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
            <div className="absolute -bottom-24 -left-10 h-52 w-52 rounded-full bg-white/10 blur-3xl" />

            <div className="relative">
              <div className="mb-8 flex items-center justify-between">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15 backdrop-blur">
                  <ServiceIcon className="h-7 w-7" />
                </div>

                <span className="rounded-full bg-[#F4B400] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#082A63]">
                  Coming Soon
                </span>
              </div>

              <p className="mb-2 text-sm font-medium text-white/60">
                IyanjuPay Services
              </p>

              <h1 className="text-3xl font-black tracking-tight sm:text-5xl">
                {meta.title}
              </h1>

              <p className="mt-3 max-w-xl text-sm leading-6 text-white/70 sm:text-base">
                {meta.subtitle}
              </p>
            </div>
          </div>

          <Card className="mt-5 overflow-hidden rounded-[28px] border-0 bg-white shadow-[0_15px_50px_rgba(15,23,42,0.07)]">
            <CardContent className="p-7 text-center sm:p-10">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#082A63]/5 text-[#082A63]">
                <Clock3 className="h-7 w-7" />
              </div>

              <h2 className="mt-5 text-xl font-bold text-slate-900">
                This service is on the way
              </h2>

              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                We're working on bringing you a smooth,
                reliable experience for this service.
              </p>

              <Button
                onClick={onBack}
                className="mt-7 h-12 rounded-xl bg-[#082A63] px-6 font-semibold shadow-lg shadow-[#082A63]/15 hover:bg-[#06204d]"
              >
                Explore other services
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F6F8FC]">
      <div className="mx-auto max-w-6xl px-3 pb-16 pt-3 sm:px-6 sm:pt-5 lg:px-8">
        {/* TOP NAVIGATION */}
        <div className="mb-4 flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="group inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
            <span>Back</span>
          </button>

          {onHistory && (
            <button
              type="button"
              onClick={onHistory}
              className="inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-2.5 text-sm font-semibold text-[#082A63] shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50"
            >
              <History className="h-4 w-4" />
              <span className="hidden sm:inline">
                History
              </span>
            </button>
          )}
        </div>

        {/* PREMIUM HERO */}
        <div
          className={[
            "relative overflow-hidden rounded-[28px] bg-gradient-to-br shadow-[0_20px_60px_rgba(8,42,99,0.2)]",
            meta.accent,
          ].join(" ")}
        >
          <div className="absolute -right-24 -top-32 h-72 w-72 rounded-full bg-white/[0.07] blur-3xl" />
          <div className="absolute -bottom-32 left-1/3 h-64 w-64 rounded-full bg-white/[0.06] blur-3xl" />

          <div className="relative flex flex-col gap-7 p-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between lg:p-10">
            <div className="flex items-start gap-4 sm:gap-5">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/10 shadow-inner ring-1 ring-white/15 backdrop-blur sm:h-20 sm:w-20 sm:rounded-[22px]">
                <ServiceIcon className="h-7 w-7 text-white sm:h-9 sm:w-9" />
              </div>

              <div>
                <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white/80 ring-1 ring-white/10">
                  <Sparkles className="h-3 w-3" />
                  IyanjuPay
                </div>

                <h1 className="text-2xl font-black tracking-tight text-white sm:text-4xl">
                  {meta.title}
                </h1>

                <p className="mt-1.5 max-w-lg text-xs leading-5 text-white/65 sm:text-sm">
                  {meta.subtitle}
                </p>
              </div>
            </div>

            <div className="hidden shrink-0 items-center gap-2 rounded-2xl bg-white/[0.08] px-4 py-3 ring-1 ring-white/10 backdrop-blur sm:flex">
              <ShieldCheck className="h-5 w-5 text-[#F4B400]" />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">
                  Secure
                </p>
                <p className="text-xs font-semibold text-white">
                  Protected payment
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* MAIN CONTENT */}
        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-5">
            {/* CATALOGUE ERROR */}
            {catalogueError && (
              <div className="flex items-start gap-3 rounded-2xl border border-red-100 bg-red-50 p-4 text-red-700">
                <Info className="mt-0.5 h-5 w-5 shrink-0" />

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">
                    Unable to load this service
                  </p>

                  <p className="mt-1 text-xs leading-5 text-red-600">
                    {catalogueError}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    void loadCatalogue()
                  }
                  className="rounded-lg p-1.5 transition hover:bg-red-100"
                  aria-label="Retry"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* LOADING */}
            {loadingCatalogue && (
              <div className="flex items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-[#082A63]">
                <Loader2 className="h-5 w-5 animate-spin" />

                <div>
                  <p className="text-sm font-bold">
                    Preparing your options
                  </p>

                  <p className="text-xs text-[#082A63]/60">
                    Loading the latest available options…
                  </p>
                </div>
              </div>
            )}

            {/* NETWORK */}
            {needsNetwork && networks.length > 0 && (
              <Card className="rounded-[26px] border-0 bg-white shadow-[0_12px_45px_rgba(15,23,42,0.06)]">
                <CardContent className="p-5 sm:p-6">
                  <SectionHeading
                    number="1"
                    title="Choose your network"
                    description="Select the mobile network for this transaction."
                  />

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {networks.map((network) => {
                      const code =
                        getNetworkCode(network);

                      return (
                        <NetworkCard
                          key={code}
                          network={network}
                          selected={
                            selectedNetwork === code
                          }
                          onClick={() =>
                            void handleNetworkChange(
                              code
                            )
                          }
                        />
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* DATA PLAN SELECTOR */}
            {isData && (
              <Card className="rounded-[26px] border-0 bg-white shadow-[0_12px_45px_rgba(15,23,42,0.06)]">
                <CardContent className="p-5 sm:p-6">
                  <SectionHeading
                    number={
                      networks.length > 0
                        ? "2"
                        : "1"
                    }
                    title="Choose your data plan"
                    description={
                      selectedNetworkObject
                        ? `${getNetworkName(selectedNetworkObject)} plans available for you.`
                        : "Choose a plan that matches your needs."
                    }
                  />

                  <div className="mb-5 flex gap-1 overflow-x-auto rounded-2xl bg-slate-100 p-1 scrollbar-none">
                    {DATA_TABS.map((tab) => (
                      <button
                        type="button"
                        key={tab}
                        onClick={() =>
                          setDataTab(tab)
                        }
                        className={[
                          "whitespace-nowrap rounded-xl px-3.5 py-2.5 text-xs font-bold transition-all",
                          dataTab === tab
                            ? "bg-white text-[#082A63] shadow-sm"
                            : "text-slate-500 hover:text-slate-800",
                        ].join(" ")}
                      >
                        {tab === "HOT" && (
                          <span className="mr-1.5">
                            🔥
                          </span>
                        )}
                        {tab}
                      </button>
                    ))}
                  </div>

                  {catalogueItems.length === 0 &&
                  !loadingCatalogue ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                      <Wifi className="mx-auto h-8 w-8 text-slate-300" />

                      <p className="mt-3 text-sm font-semibold text-slate-700">
                        No plans available
                      </p>

                      <p className="mt-1 text-xs text-slate-400">
                        Try another network or category.
                      </p>
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {catalogueItems.map(
                        (item) => {
                          const code =
                            getItemCode(item);

                          return (
                            <PlanCard
                              key={code}
                              item={item}
                              selected={
                                selectedItemCode ===
                                code
                              }
                              onClick={() => {
                                setSelectedItemCode(
                                  code
                                );

                                const nextExamType =
                                  item.examType ??
                                  item.exam_type;

                                if (
                                  nextExamType
                                ) {
                                  setExamType(
                                    String(
                                      nextExamType
                                    )
                                  );
                                }
                              }}
                            />
                          );
                        }
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* BILLER */}
            {(isElectricity || isCable) &&
              billers.length > 0 && (
                <Card className="rounded-[26px] border-0 bg-white shadow-[0_12px_45px_rgba(15,23,42,0.06)]">
                  <CardContent className="p-5 sm:p-6">
                    <SectionHeading
                      number="1"
                      title={
                        isElectricity
                          ? "Choose electricity company"
                          : "Choose TV service"
                      }
                      description={
                        isElectricity
                          ? "Select your electricity distribution company."
                          : "Select your television service."
                      }
                    />

                    <Select
                      value={selectedBiller}
                      onValueChange={(value) =>
                        void handleBillerChange(
                          value
                        )
                      }
                    >
                      <SelectTrigger className="h-14 rounded-2xl border-slate-200 bg-slate-50 px-4 text-sm font-semibold shadow-none focus:ring-[#082A63]/20">
                        <SelectValue
                          placeholder={
                            isElectricity
                              ? "Select electricity company"
                              : "Select TV service"
                          }
                        />
                      </SelectTrigger>

                      <SelectContent>
                        {billers.map((biller) => (
                          <SelectItem
                            key={getBillerCode(
                              biller
                            )}
                            value={getBillerCode(
                              biller
                            )}
                          >
                            {getNetworkName(biller)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </CardContent>
                </Card>
              )}

            {/* ELECTRICITY DETAILS */}
            {isElectricity && (
              <Card className="rounded-[26px] border-0 bg-white shadow-[0_12px_45px_rgba(15,23,42,0.06)]">
                <CardContent className="p-5 sm:p-6">
                  <SectionHeading
                    number="2"
                    title="Meter details"
                    description="Enter your meter information and verify it before paying."
                  />

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <FieldLabel>
                        Meter type
                      </FieldLabel>

                      <Select
                        value={meterType}
                        onValueChange={
                          setMeterType
                        }
                      >
                        <SelectTrigger className="h-14 rounded-2xl border-slate-200 bg-slate-50 shadow-none">
                          <SelectValue />
                        </SelectTrigger>

                        <SelectContent>
                          <SelectItem value="01">
                            Prepaid
                          </SelectItem>

                          <SelectItem value="02">
                            Postpaid
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <FieldLabel>
                        Meter number
                      </FieldLabel>

                      <div className="flex gap-2">
                        <Input
                          value={meterNumber}
                          onChange={(event) => {
                            setMeterNumber(
                              event.target.value.replace(
                                /\D/g,
                                ""
                              )
                            );
                            setVerifiedCustomer("");
                            setVerifiedType("");
                          }}
                          inputMode="numeric"
                          placeholder="Enter meter number"
                          className="h-14 rounded-2xl border-slate-200 bg-slate-50 px-4 shadow-none"
                        />

                        <Button
                          type="button"
                          onClick={
                            verifyMeter
                          }
                          disabled={
                            verifying ||
                            !selectedBiller ||
                            meterNumber.length < 6
                          }
                          className="h-14 shrink-0 rounded-2xl bg-[#082A63] px-4 hover:bg-[#06204d]"
                        >
                          {verifying &&
                          verifiedType === "" ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            "Verify"
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>

                  {verifiedCustomer &&
                    verifiedType === "meter" && (
                      <div className="mt-4 flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                          <CheckCircle2 className="h-5 w-5" />
                        </div>

                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">
                            Meter verified
                          </p>

                          <p className="mt-0.5 text-sm font-bold text-emerald-900">
                            {verifiedCustomer}
                          </p>
                        </div>
                      </div>
                    )}
                </CardContent>
              </Card>
            )}

            {/* CABLE DETAILS */}
            {isCable && (
              <Card className="rounded-[26px] border-0 bg-white shadow-[0_12px_45px_rgba(15,23,42,0.06)]">
                <CardContent className="p-5 sm:p-6">
                  <SectionHeading
                    number="2"
                    title="Smartcard details"
                    description="Verify the account before choosing your package."
                  />

                  <div>
                    <FieldLabel>
                      Smartcard number
                    </FieldLabel>

                    <div className="flex gap-2">
                      <Input
                        value={smartcardNumber}
                        onChange={(event) => {
                          setSmartcardNumber(
                            event.target.value.replace(
                              /\D/g,
                              ""
                            )
                          );
                          setVerifiedCustomer("");
                          setVerifiedType("");
                        }}
                        inputMode="numeric"
                        placeholder="Enter smartcard number"
                        className="h-14 rounded-2xl border-slate-200 bg-slate-50 px-4 shadow-none"
                      />

                      <Button
                        type="button"
                        onClick={
                          verifyCable
                        }
                        disabled={
                          verifying ||
                          !selectedBiller ||
                          smartcardNumber.length < 6
                        }
                        className="h-14 shrink-0 rounded-2xl bg-[#082A63] px-4 hover:bg-[#06204d]"
                      >
                        {verifying ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Verify"
                        )}
                      </Button>
                    </div>
                  </div>

                  {verifiedCustomer &&
                    verifiedType === "cable" && (
                      <div className="mt-4 flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                          <CheckCircle2 className="h-5 w-5" />
                        </div>

                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">
                            Account verified
                          </p>

                          <p className="mt-0.5 text-sm font-bold text-emerald-900">
                            {verifiedCustomer}
                          </p>
                        </div>
                      </div>
                    )}
                </CardContent>
              </Card>
            )}

            {/* NON-DATA CATALOGUE */}
            {!isData &&
              !isElectricity &&
              !isCable &&
              !isAirtime &&
              catalogueItems.length > 0 && (
                <Card className="rounded-[26px] border-0 bg-white shadow-[0_12px_45px_rgba(15,23,42,0.06)]">
                  <CardContent className="p-5 sm:p-6">
                    <SectionHeading
                      number="2"
                      title={
                        isSmile
                          ? "Choose a package"
                          : isWaec
                            ? "Choose examination service"
                            : isJamb
                              ? "Choose JAMB service"
                              : "Choose an option"
                      }
                      description="Select the option you want to purchase."
                    />

                    <div className="grid gap-3 sm:grid-cols-2">
                      {catalogueItems.map(
                        (item) => {
                          const code =
                            getItemCode(item);

                          return (
                            <PlanCard
                              key={code}
                              item={item}
                              selected={
                                selectedItemCode ===
                                code
                              }
                              onClick={() => {
                                setSelectedItemCode(
                                  code
                                );

                                const nextExamType =
                                  item.examType ??
                                  item.exam_type;

                                if (
                                  nextExamType
                                ) {
                                  setExamType(
                                    String(
                                      nextExamType
                                    )
                                  );
                                }
                              }}
                            />
                          );
                        }
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

            {/* AIRTIME */}
            {isAirtime && (
              <Card className="rounded-[26px] border-0 bg-white shadow-[0_12px_45px_rgba(15,23,42,0.06)]">
                <CardContent className="p-5 sm:p-6">
                  <SectionHeading
                    number={
                      networks.length > 0
                        ? "2"
                        : "1"
                    }
                    title="Enter recharge details"
                    description="Send airtime to the mobile number you choose."
                  />

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <FieldLabel>
                        Mobile number
                      </FieldLabel>

                      <div className="relative">
                        <Phone className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                        <Input
                          value={phone}
                          onChange={(event) =>
                            setPhone(
                              cleanPhone(
                                event.target
                                  .value
                              )
                            )
                          }
                          inputMode="numeric"
                          placeholder="0803 123 4567"
                          className="h-14 rounded-2xl border-slate-200 bg-slate-50 pl-11 shadow-none"
                        />
                      </div>
                    </div>

                    <div>
                      <FieldLabel>
                        Amount
                      </FieldLabel>

                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                          ₦
                        </span>

                        <Input
                          value={amount}
                          onChange={(event) =>
                            setAmount(
                              event.target.value.replace(
                                /[^\d]/g,
                                ""
                              )
                            )
                          }
                          inputMode="numeric"
                          placeholder="Enter amount"
                          className="h-14 rounded-2xl border-slate-200 bg-slate-50 pl-10 text-lg font-bold shadow-none"
                        />
                      </div>

                      <div className="mt-2 flex gap-2">
                        {[100, 200, 500, 1000].map(
                          (value) => (
                            <button
                              type="button"
                              key={value}
                              onClick={() =>
                                setAmount(
                                  String(value)
                                )
                              }
                              className={[
                                "rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition",
                                amount ===
                                String(value)
                                  ? "bg-[#082A63] text-white"
                                  : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                              ].join(" ")}
                            >
                              ₦{value}
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* DATA PHONE */}
            {isData && (
              <Card className="rounded-[26px] border-0 bg-white shadow-[0_12px_45px_rgba(15,23,42,0.06)]">
                <CardContent className="p-5 sm:p-6">
                  <SectionHeading
                    number="3"
                    title="Enter mobile number"
                    description="The selected data plan will be sent to this number."
                  />

                  <div className="relative">
                    <Phone className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                    <Input
                      value={phone}
                      onChange={(event) =>
                        setPhone(
                          cleanPhone(
                            event.target.value
                          )
                        )
                      }
                      inputMode="numeric"
                      placeholder="0803 123 4567"
                      className="h-14 rounded-2xl border-slate-200 bg-slate-50 pl-11 text-base font-semibold shadow-none"
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ELECTRICITY AMOUNT */}
            {isElectricity && (
              <Card className="rounded-[26px] border-0 bg-white shadow-[0_12px_45px_rgba(15,23,42,0.06)]">
                <CardContent className="p-5 sm:p-6">
                  <SectionHeading
                    number="3"
                    title="Payment amount"
                    description="Enter the amount you want to pay."
                  />

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <FieldLabel>
                        Amount
                      </FieldLabel>

                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                          ₦
                        </span>

                        <Input
                          value={amount}
                          onChange={(event) =>
                            setAmount(
                              event.target.value.replace(
                                /[^\d]/g,
                                ""
                              )
                            )
                          }
                          inputMode="numeric"
                          placeholder="Enter amount"
                          className="h-14 rounded-2xl border-slate-200 bg-slate-50 pl-10 text-lg font-bold shadow-none"
                        />
                      </div>
                    </div>

                    <div>
                      <FieldLabel>
                        Phone number
                      </FieldLabel>

                      <Input
                        value={phone}
                        onChange={(event) =>
                          setPhone(
                            cleanPhone(
                              event.target
                                .value
                            )
                          )
                        }
                        inputMode="numeric"
                        placeholder="0803 123 4567"
                        className="h-14 rounded-2xl border-slate-200 bg-slate-50 shadow-none"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* CABLE PACKAGE */}
            {isCable &&
              verifiedCustomer &&
              catalogueItems.length > 0 && (
                <Card className="rounded-[26px] border-0 bg-white shadow-[0_12px_45px_rgba(15,23,42,0.06)]">
                  <CardContent className="p-5 sm:p-6">
                    <SectionHeading
                      number="3"
                      title="Choose your package"
                      description="Select the subscription you want."
                    />

                    <div className="grid gap-3 sm:grid-cols-2">
                      {catalogueItems.map(
                        (item) => {
                          const code =
                            getItemCode(item);

                          return (
                            <PlanCard
                              key={code}
                              item={item}
                              selected={
                                selectedItemCode ===
                                code
                              }
                              onClick={() =>
                                setSelectedItemCode(
                                  code
                                )
                              }
                            />
                          );
                        }
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

            {/* EPIN QUANTITY */}
            {(isAirtimeCard ||
              isDataCard) &&
              selectedItem && (
                <Card className="rounded-[26px] border-0 bg-white shadow-[0_12px_45px_rgba(15,23,42,0.06)]">
                  <CardContent className="p-5 sm:p-6">
                    <SectionHeading
                      number="2"
                      title="Choose quantity"
                      description="How many PINs would you like?"
                    />

                    <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-4">
                      <div>
                        <p className="text-sm font-bold text-slate-900">
                          {getItemName(
                            selectedItem
                          )}
                        </p>

                        <p className="mt-1 text-xs text-slate-500">
                          {money(
                            selectedSellingPrice
                          )}{" "}
                          per PIN
                        </p>
                      </div>

                      <div className="flex items-center gap-2 rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-200">
                        <button
                          type="button"
                          onClick={() =>
                            setQuantity(
                              Math.max(
                                1,
                                quantity - 1
                              )
                            )
                          }
                          disabled={
                            quantity <= 1
                          }
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 disabled:opacity-30"
                        >
                          <Minus className="h-4 w-4" />
                        </button>

                        <span className="w-8 text-center text-sm font-black text-[#082A63]">
                          {quantity}
                        </span>

                        <button
                          type="button"
                          onClick={() =>
                            setQuantity(
                              Math.min(
                                100,
                                quantity + 1
                              )
                            )
                          }
                          disabled={
                            quantity >= 100
                          }
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 disabled:opacity-30"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

            {/* SMILE */}
            {isSmile && (
              <Card className="rounded-[26px] border-0 bg-white shadow-[0_12px_45px_rgba(15,23,42,0.06)]">
                <CardContent className="p-5 sm:p-6">
                  <SectionHeading
                    number="3"
                    title="Smile account"
                    description="Enter the Smile number associated with your account."
                  />

                  <div className="relative">
                    <Smartphone className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                    <Input
                      value={accountId}
                      onChange={(event) =>
                        setAccountId(
                          event.target.value
                        )
                      }
                      placeholder="Enter Smile account number"
                      className="h-14 rounded-2xl border-slate-200 bg-slate-50 pl-11 shadow-none"
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* WAEC/JAMB PHONE */}
            {(isWaec || isJamb) && (
              <Card className="rounded-[26px] border-0 bg-white shadow-[0_12px_45px_rgba(15,23,42,0.06)]">
                <CardContent className="p-5 sm:p-6">
                  <SectionHeading
                    number="3"
                    title={
                      isJamb
                        ? "Examination details"
                        : "Candidate details"
                    }
                    description="Provide the mobile number to associate with this purchase."
                  />

                  {isJamb && (
                    <div className="mb-4">
                      <FieldLabel>
                        Examination type
                      </FieldLabel>

                      <Select
                        value={examType}
                        onValueChange={
                          setExamType
                        }
                      >
                        <SelectTrigger className="h-14 rounded-2xl border-slate-200 bg-slate-50 shadow-none">
                          <SelectValue placeholder="Select examination type" />
                        </SelectTrigger>

                        <SelectContent>
                          <SelectItem value="utme">
                            UTME
                          </SelectItem>

                          <SelectItem value="utme-mock">
                            UTME Mock
                          </SelectItem>

                          <SelectItem value="de">
                            Direct Entry
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div>
                    <FieldLabel>
                      Phone number
                    </FieldLabel>

                    <div className="relative">
                      <Phone className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                      <Input
                        value={phone}
                        onChange={(event) =>
                          setPhone(
                            cleanPhone(
                              event.target
                                .value
                            )
                          )
                        }
                        inputMode="numeric"
                        placeholder="0803 123 4567"
                        className="h-14 rounded-2xl border-slate-200 bg-slate-50 pl-11 shadow-none"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* PHONE FOR EPIN */}
            {(isAirtimeCard ||
              isDataCard) &&
              false && (
                <Card>
                  <CardContent>
                    <Input />
                  </CardContent>
                </Card>
              )}

            {/* MOBILE SECURITY NOTE */}
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#082A63]/5 text-[#082A63]">
                <LockKeyhole className="h-4 w-4" />
              </div>

              <div>
                <p className="text-xs font-bold text-slate-800">
                  Secure transaction
                </p>

                <p className="mt-0.5 text-[11px] leading-5 text-slate-500">
                  Your transaction is protected and
                  requires your payment PIN before
                  authorization.
                </p>
              </div>
            </div>
          </div>

          {/* ORDER SUMMARY */}
          <aside className="lg:sticky lg:top-5 lg:self-start">
            <Card className="overflow-hidden rounded-[26px] border-0 bg-white shadow-[0_15px_55px_rgba(15,23,42,0.09)]">
              <div className="bg-[#082A63] p-5 text-white sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/45">
                      Transaction
                    </p>

                    <h2 className="mt-1 text-lg font-bold">
                      Order summary
                    </h2>
                  </div>

                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/10">
                    <CreditCard className="h-5 w-5" />
                  </div>
                </div>
              </div>

              <CardContent className="p-5 sm:p-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#082A63]/5 text-[#082A63]">
                    <ServiceIcon className="h-5 w-5" />
                  </div>

                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">
                      {summaryTitle}
                    </p>

                    {summarySubtitle && (
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {summarySubtitle}
                      </p>
                    )}
                  </div>
                </div>

                <div className="my-5 h-px bg-slate-100" />

                <div className="space-y-3">
                  {(isAirtime ||
                    isData ||
                    isWaec ||
                    isJamb) &&
                    phone && (
                      <div className="flex justify-between gap-4">
                        <span className="text-xs text-slate-400">
                          Mobile number
                        </span>

                        <span className="text-xs font-semibold text-slate-700">
                          {displayPhone}
                        </span>
                      </div>
                    )}

                  {isElectricity &&
                    meterNumber && (
                      <div className="flex justify-between gap-4">
                        <span className="text-xs text-slate-400">
                          Meter
                        </span>

                        <span className="text-xs font-semibold text-slate-700">
                          {meterNumber}
                        </span>
                      </div>
                    )}

                  {isCable &&
                    smartcardNumber && (
                      <div className="flex justify-between gap-4">
                        <span className="text-xs text-slate-400">
                          Smartcard
                        </span>

                        <span className="text-xs font-semibold text-slate-700">
                          {smartcardNumber}
                        </span>
                      </div>
                    )}

                  {selectedItem && (
                    <div className="flex justify-between gap-4">
                      <span className="text-xs text-slate-400">
                        Package
                      </span>

                      <span className="max-w-[190px] text-right text-xs font-semibold text-slate-700">
                        {getItemName(
                          selectedItem
                        )}
                      </span>
                    </div>
                  )}

                  {(isAirtime ||
                    isElectricity) &&
                    amountNumber > 0 && (
                      <div className="flex justify-between gap-4">
                        <span className="text-xs text-slate-400">
                          Amount
                        </span>

                        <span className="text-xs font-semibold text-slate-700">
                          {money(amountNumber)}
                        </span>
                      </div>
                    )}

                  {(isAirtimeCard ||
                    isDataCard) && (
                    <div className="flex justify-between gap-4">
                      <span className="text-xs text-slate-400">
                        Quantity
                      </span>

                      <span className="text-xs font-semibold text-slate-700">
                        {quantity}
                      </span>
                    </div>
                  )}
                </div>

                <div className="my-5 h-px bg-slate-100" />

                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                        Total to pay
                      </p>

                      <p className="mt-1 text-3xl font-black tracking-tight text-[#082A63]">
                        {money(computedTotal)}
                      </p>
                    </div>

                    <ShieldCheck className="mb-1 h-5 w-5 text-emerald-600" />
                  </div>
                </div>

                <Button
                  type="button"
                  onClick={handleContinue}
                  disabled={
                    !serviceReady ||
                    computedTotal <= 0 ||
                    purchaseLoading
                  }
                  className="mt-4 h-14 w-full rounded-2xl bg-[#082A63] text-sm font-bold shadow-[0_12px_25px_rgba(8,42,99,0.2)] transition-all hover:-translate-y-0.5 hover:bg-[#06204d] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {purchaseLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing…
                    </>
                  ) : (
                    <>
                      Continue securely
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>

                <div className="mt-4 flex items-center justify-center gap-1.5 text-[10px] font-medium text-slate-400">
                  <LockKeyhole className="h-3 w-3" />
                  Protected by IyanjuPay security
                </div>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>

      {/* PAYMENT PIN */}
      <Dialog
        open={showPinModal}
        onOpenChange={(open) => {
          if (
            !pinLoading &&
            !purchaseLoading
          ) {
            setShowPinModal(open);
          }
        }}
      >
        <DialogContent className="max-w-md overflow-hidden rounded-[28px] border-0 p-0 shadow-2xl">
          <div className="bg-[#082A63] px-6 pb-7 pt-7 text-white">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/10">
              <LockKeyhole className="h-6 w-6" />
            </div>

            <DialogHeader className="mt-5 text-center">
              <DialogTitle className="text-xl font-black text-white">
                Authorize payment
              </DialogTitle>

              <DialogDescription className="mt-2 text-xs leading-5 text-white/60">
                Enter your 4-digit payment PIN to
                securely authorize this transaction.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="p-6">
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                    You're paying for
                  </p>

                  <p className="mt-1 truncate text-sm font-bold text-slate-900">
                    {summaryTitle}
                  </p>
                </div>

                <p className="shrink-0 text-lg font-black text-[#082A63]">
                  {money(computedTotal)}
                </p>
              </div>
            </div>

            <div className="mt-6">
              <Label className="text-xs font-bold text-slate-700">
                Payment PIN
              </Label>

              <div className="mt-3 flex justify-center gap-2.5">
                {Array.from({
                  length: 4,
                }).map((_, index) => {
                  const filled =
                    paymentPin.length >
                    index;

                  return (
                    <div
                      key={index}
                      className={[
                        "flex h-14 w-14 items-center justify-center rounded-2xl border-2 transition-all",
                        filled
                          ? "border-[#082A63] bg-[#082A63]/5"
                          : "border-slate-200 bg-slate-50",
                      ].join(" ")}
                    >
                      {filled ? (
                        <div className="h-2.5 w-2.5 rounded-full bg-[#082A63]" />
                      ) : (
                        <div className="h-2 w-2 rounded-full bg-slate-200" />
                      )}
                    </div>
                  );
                })}
              </div>

              <Input
                autoFocus
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={paymentPin}
                onChange={(event) =>
                  setPaymentPin(
                    event.target.value
                      .replace(/\D/g, "")
                      .slice(0, 4)
                  )
                }
                className="absolute h-px w-px opacity-0"
                aria-label="Payment PIN"
              />

              <p className="mt-4 text-center text-[11px] text-slate-400">
                Your PIN is used only to authorize
                this transaction.
              </p>
            </div>

            <DialogFooter className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-2">
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setShowPinModal(false)
                }
                disabled={
                  pinLoading ||
                  purchaseLoading
                }
                className="h-12 rounded-xl border-slate-200 font-semibold"
              >
                Cancel
              </Button>

              <Button
                type="button"
                onClick={
                  confirmPurchase
                }
                disabled={
                  paymentPin.length !== 4 ||
                  pinLoading ||
                  purchaseLoading
                }
                className="h-12 rounded-xl bg-[#082A63] font-bold hover:bg-[#06204d]"
              >
                {pinLoading ||
                purchaseLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    Pay securely
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </DialogFooter>

            <div className="mt-5 flex items-center justify-center gap-2 text-[10px] font-semibold text-slate-400">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              Secure payment authorization
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ServicePayment;
