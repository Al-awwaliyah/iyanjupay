
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ArrowLeft,
  Loader2,
  RefreshCw,
  Flame,
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
  minimum?: number | string;
  maximum?: number | string;
  fee?: number | string;

  label_name?: string;
  label_name_2?: string;

  validity?: string | number;
  duration?: string | number;
  description?: string;

  is_airtime?: boolean;
  country?: string;


  data_plan?: string;
  network_code?: string;

  plan_type?: string;
  is_hot_deal?: boolean;

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
};

const CLUBKONNECT_SERVICES = new Set([
  "data",
  "education",
  "airtime-card",
  "data-card",
]);

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

// ============================================================
// HELPERS
// ============================================================

function cleanString(value: unknown): string {
  return String(value ?? "").trim();
}

function numberValue(value: unknown): number {
  const n = Number(value);

  return Number.isFinite(n) ? n : 0;
}

function formatNaira(value: number): string {
  return `₦${Number(value).toLocaleString("en-NG")}`;
}

function getDataGroup(
  item: BillItem
): "Daily" | "Weekly" | "Monthly" | "Other" {
  const explicit = cleanString(
    (item as any).plan_period ??
      (item as any).period ??
      (item as any).group_name ??
      (item as any).category
  ).toLowerCase();

  if (explicit.includes("month")) return "Monthly";
  if (explicit.includes("week")) return "Weekly";
  if (explicit.includes("day")) return "Daily";

  const text = [
    item.name,
    item.short_name,
    item.description,
    item.validity,
    item.duration,
    (item as any).plan_type,
    (item as any).plan_period,
    (item as any).period_name,
    (item as any).group_name,
  ]
    .filter((value) => value !== undefined && value !== null)
    .join(" ")
    .toLowerCase();

  if (
    /\b(30|31)\s*(day|days)\b/.test(text) ||
    /\bmonthly\b/.test(text) ||
    /\b1\s*month\b/.test(text) ||
    /\b2\s*months?\b/.test(text) ||
    /\b3\s*months?\b/.test(text)
  ) return "Monthly";

  if (
    /\b(7|14)\s*(day|days)\b/.test(text) ||
    /\bweekly\b/.test(text) ||
    /\b1\s*week\b/.test(text) ||
    /\b2\s*weeks?\b/.test(text)
  ) return "Weekly";

  if (
    /\b(1|2|3)\s*(day|days)\b/.test(text) ||
    /\bdaily\b/.test(text) ||
    /\b24\s*hours?\b/.test(text) ||
    /\bday\b/.test(text)
  ) return "Daily";

  return "Other";
}

function isHotDeal(item: BillItem): boolean {
  if (item.is_hot_deal === true) return true;

  const text = [
    item.name,
    item.short_name,
    item.description,
    item.plan_type,
    (item as any).plan,
    (item as any).plan_name,
    (item as any).planName,
    (item as any).bundle,
    (item as any).Bundle,
    (item as any).category,
    (item as any).data_type,
    (item as any).dataType,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /\bsme\b/.test(text) || /hot\s*deal/.test(text) || /hotdeal/.test(text);
}

function getPlanType(item: BillItem): string {
  const explicit = cleanString(item.plan_type);
  if (explicit) return explicit;
  return isHotDeal(item) ? "SME" : "REGULAR";
}

function normaliseProviderKey(value: unknown): string {
  return cleanString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

const PROVIDER_LOGOS: Record<string, string> = {
  // Mobile networks
  mtn: "https://upload.wikimedia.org/wikipedia/commons/a/af/MTN_Logo.svg",
  glo: "https://upload.wikimedia.org/wikipedia/commons/8/86/GloLogo.png",
  airtel: "https://upload.wikimedia.org/wikipedia/commons/f/fb/Bharti_Airtel_Logo.svg",
  "9mobile": "https://images.seeklogo.com/logo-png/48/1/9mobile-logo-png_seeklogo-481168.png",

  // Cable TV / entertainment
  dstv: "https://res.cloudinary.com/paybeta/image/upload/v1714827633/Provider/Cable/dstv.jpg",
  gotv: "https://res.cloudinary.com/paybeta/image/upload/v1714828100/Provider/Cable/gotv.png",
  startimes: "https://res.cloudinary.com/paybeta/image/upload/v1714827913/Provider/Cable/startimes.jpg",
  showmax: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Showmax_Logo.svg",

  // Internet / ISP
  smile: "https://cdn.jsdelivr.net/gh/PaystackHQ/nigerialogos@master/public/logos/smile/smile.svg",
  spectranet: "https://cdn.jsdelivr.net/gh/PaystackHQ/nigerialogos@master/public/logos/spectranet/spectranet.svg",
  ipnx: "https://cdn.jsdelivr.net/gh/PaystackHQ/nigerialogos@master/public/logos/ipnx/ipnx.svg",
  ntel: "https://cdn.jsdelivr.net/gh/PaystackHQ/nigerialogos@master/public/logos/ntel/ntel.svg",
};

function getProviderLogo(provider: Biller): string | null {
  // Prefer a real logo supplied by the backend catalogue.
  // This is the safest source because it is already tied to the public biller.
  const backendLogo = cleanString(
    provider.logo ??
      provider.logo_url ??
      provider.logoUrl
  );

  if (backendLogo) {
    try {
      const url = new URL(backendLogo);

      // Never request the old guessed Simple Icons URLs that produced 404s.
      if (
        url.hostname !== "cdn.simpleicons.org" &&
        (url.protocol === "https:" || url.protocol === "http:")
      ) {
        return url.toString();
      }
    } catch {
      // Fall through to the public-name mapping below.
    }
  }

  const key = normaliseProviderKey(
    [
      provider.short_name,
      provider.name,
      (provider as any).display_name,
      (provider as any).displayName,
    ]
      .filter(Boolean)
      .join(" ")
  );

  // Mobile networks.
  if (key.includes("mtn")) return PROVIDER_LOGOS.mtn;
  if (key.includes("glo") || key.includes("globacom")) return PROVIDER_LOGOS.glo;
  if (key.includes("airtel")) return PROVIDER_LOGOS.airtel;
  if (key.includes("9mobile") || key.includes("etisalat")) return PROVIDER_LOGOS["9mobile"];

  // Cable TV / entertainment.
  if (key.includes("dstv") || key.includes("multichoice")) return PROVIDER_LOGOS.dstv;
  if (key.includes("gotv")) return PROVIDER_LOGOS.gotv;
  if (key.includes("startimes") || key.includes("startime")) return PROVIDER_LOGOS.startimes;
  if (key.includes("showmax")) return PROVIDER_LOGOS.showmax;

  // Internet / ISP.
  if (key.includes("smile")) return PROVIDER_LOGOS.smile;
  if (key.includes("spectranet")) return PROVIDER_LOGOS.spectranet;
  if (key.includes("ipnx")) return PROVIDER_LOGOS.ipnx;
  if (key.includes("ntel")) return PROVIDER_LOGOS.ntel;

  return null;
}


function getProviderDisplayName(provider: Biller): string {
  return cleanString(provider.short_name ?? provider.name ?? "Provider");
}

function isVariableItem(item: BillItem): boolean {
  const code = cleanString(item.item_code).toLowerCase();
  const name = cleanString(
    item.name ?? item.short_name ?? item.description
  ).toLowerCase();

  return (
    code === "__variable__" ||
    code === "variable" ||
    code === "variable_amount" ||
    /variable\s*amount/.test(name) ||
    /enter\s*amount/.test(name) ||
    /any\s*amount/.test(name)
  );
}

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
  const logo = getProviderLogo(provider);
  const name = getProviderDisplayName(provider);

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
        disabled ? "cursor-not-allowed opacity-60" : "",
      ].join(" ")}
    >
      {selected && (
        <span className="absolute right-1.5 top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-[#082A63] text-white">
          <span className="text-[10px] font-black">✓</span>
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
            onError={(event) => {
              event.currentTarget.style.display = "none";
              const fallback = event.currentTarget.nextElementSibling as HTMLElement | null;
              if (fallback) fallback.style.display = "flex";
            }}
          />
        ) : null}
        <span
          className="items-center justify-center text-sm font-extrabold text-[#082A63]"
          style={{ display: logo ? "none" : "flex" }}
        >
          {name.slice(0, 2).toUpperCase()}
        </span>
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
  onClick,
  disabled,
}: {
  item: BillItem;
  selected: boolean;
  onClick: () => void;
  disabled: boolean;
}) {
  const hot = isHotDeal(item);
  const price = numberValue(item.selling_price ?? item.amount ?? item.price);
  const name = cleanString(item.name ?? item.short_name ?? item.data_plan ?? "Data Plan");
  const duration = cleanString(item.validity ?? item.duration ?? (item as any).plan_period);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "relative min-w-0 overflow-hidden rounded-2xl border bg-white p-3 text-left transition-all sm:p-4",
        "hover:-translate-y-0.5 hover:shadow-md",
        selected ? "border-[#082A63] ring-2 ring-[#082A63]/10" : "border-slate-200",
        disabled ? "cursor-not-allowed opacity-60" : "",
      ].join(" ")}
    >
      {hot && (
        <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-orange-600">
          <Flame className="h-3 w-3" /> Hot Deal
        </span>
      )}

      <div className="pr-14">
        <p className="line-clamp-2 min-h-[38px] text-sm font-bold text-slate-900">
          {name}
        </p>
        {duration && <p className="mt-1 truncate text-xs text-slate-500">{duration}</p>}
      </div>

      <div className="mt-4 flex min-w-0 items-end justify-between gap-2">
        <span className="truncate text-base font-extrabold text-[#082A63] sm:text-lg">
          {formatNaira(price)}
        </span>
        <span
          className={[
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border",
            selected ? "border-[#082A63] bg-[#082A63] text-white" : "border-slate-200 text-slate-400",
          ].join(" ")}
        >
          {selected && <span className="text-xs font-black">✓</span>}
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

  const [amount, setAmount] = useState("");
  const [customer, setCustomer] = useState("");
  const [customAmountMode, setCustomAmountMode] =
    useState(false);

  // ==========================================================
  // PAYMENT PIN
  // ==========================================================

  const [showPinPrompt, setShowPinPrompt] =
    useState(false);

  const [paymentPin, setPaymentPin] =
    useState("");

  const [verifyingPin, setVerifyingPin] =
    useState(false);

  // ==========================================================
  // CATALOGUE
  // ==========================================================

  const [billers, setBillers] =
    useState<Biller[]>([]);

  const [items, setItems] =
    useState<BillItem[]>([]);

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

  const [loadingBillers, setLoadingBillers] =
    useState(false);

  const [loadingItems, setLoadingItems] =
    useState(false);

  const [processingPayment, setProcessingPayment] =
    useState(false);

  const [error, setError] = useState("");

  const [dataTab, setDataTab] = useState<"HOT DEALS" | "DAILY" | "WEEKLY" | "MONTHLY" | "OTHER">("HOT DEALS");

  const { toast } = useToast();

  // ==========================================================
  // SERVICE
  // ==========================================================

  const serviceType =
    service?.type ?? "";

  const category = useMemo(
    () =>
      SERVICE_CATEGORY_MAP[
        serviceType
      ] ?? "",
    [serviceType]
  );

  const isData =
    serviceType === "data";

  const serviceFunction = CLUBKONNECT_SERVICES.has(serviceType)
    ? "clubkonnect-services"
    : "flutterwave-bills";

  const isAirtime =
    serviceType === "airtime";

  const isInternet =
    serviceType === "internet";

  const isElectricity =
    serviceType === "electricity";

  const isAmountOnly =
    isAirtime || isElectricity;

  // ==========================================================
  // SELECTED BILLER
  // ==========================================================

  const selectedBiller = useMemo(
    () =>
      billers.find(
        (biller) =>
          String(
            biller.biller_code ?? ""
          ) === selectedBillerCode
      ) ?? null,
    [
      billers,
      selectedBillerCode,
    ]
  );

  // ==========================================================
  // SELECTED ITEM
  // ==========================================================

  const selectedItem = useMemo(
    () =>
      items.find(
        (item) =>
          String(
            item.item_code ?? ""
          ) === selectedItemCode
      ) ?? null,
    [
      items,
      selectedItemCode,
    ]
  );

  // ==========================================================
  // DATA GROUPS
  // ==========================================================

  const dataGroups = useMemo(() => {
    const groups: Record<"HOT DEALS" | "Daily" | "Weekly" | "Monthly" | "Other", BillItem[]> = {
      "HOT DEALS": [],
      Daily: [],
      Weekly: [],
      Monthly: [],
      Other: [],
    };

    items.forEach((item) => {
      if (!cleanString(item.item_code) || isVariableItem(item)) return;

      if (isHotDeal(item)) {
        groups["HOT DEALS"].push(item);
        return;
      }

      groups[getDataGroup(item)].push(item);
    });

    return groups;
  }, [items]);

  const visibleDataPlans = useMemo(() => {
    if (dataTab === "HOT DEALS") return dataGroups["HOT DEALS"];
    return dataGroups[dataTab === "DAILY" ? "Daily" : dataTab === "WEEKLY" ? "Weekly" : dataTab === "MONTHLY" ? "Monthly" : "Other"];
  }, [dataGroups, dataTab]);

  // ==========================================================
  // CUSTOMER LABEL
  // ==========================================================

  const customerLabel = useMemo(() => {
    if (selectedItem?.label_name) {
      return selectedItem.label_name;
    }

    switch (serviceType) {
      case "airtime":
      case "data":
        return "Phone Number";

      case "electricity":
        return "Meter Number";

      case "cable":
        return "Smart Card / Decoder Number";

      case "internet":
        return "Account Number";

      default:
        return "Customer ID";
    }
  }, [
    selectedItem,
    serviceType,
  ]);

  // ==========================================================
  // CUSTOMER PLACEHOLDER
  // ==========================================================

  const customerPlaceholder = useMemo(() => {
    switch (serviceType) {
      case "airtime":
      case "data":
        return "e.g. 08012345678";

      case "electricity":
        return "Enter meter number";

      case "cable":
        return "Enter smart card number";

      case "internet":
        return "Enter account number";

      default:
        return "Enter customer identifier";
    }
  }, [serviceType]);

  // ==========================================================
  // RESET FORM
  // ==========================================================

  const resetForm = () => {
    setAmount("");
    setCustomer("");

    setBillers([]);
    setItems([]);

    setSelectedBillerCode("");
    setSelectedItemCode("");

    setError("");

    setCustomAmountMode(false);

    setLoadingBillers(false);
    setLoadingItems(false);
    setProcessingPayment(false);

    setShowPinPrompt(false);
    setPaymentPin("");
    setVerifyingPin(false);
    setDataTab("HOT DEALS");
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

  const loadBillers = async () => {
    if (!category && !CLUBKONNECT_SERVICES.has(serviceType)) {
      setBillers([]);
      return;
    }

    setLoadingBillers(true);
    setError("");
    setSelectedBillerCode("");
    setSelectedItemCode("");
    setItems([]);
    setAmount("");
    setCustomAmountMode(false);

    try {
      const { data, error: functionError } =
        await supabase.functions.invoke(serviceFunction, {
          body: {
            action: "billers",
            service: serviceType,
            ...(category ? { category } : {}),
            country: "NG",
          },
        });

      if (functionError) {
        console.error("Billers function error:", functionError);
        throw new Error("Unable to load service providers.");
      }

      if (!data || data.success !== true) {
        console.error("Billers API response:", data);
        throw new Error(data?.error || "Unable to load service providers.");
      }

      const loadedBillers = Array.isArray(data?.billers)
        ? data.billers
        : Array.isArray(data?.data?.billers)
          ? data.data.billers
          : Array.isArray(data?.data)
            ? data.data
            : [];

      setBillers(loadedBillers);

      if (!loadedBillers.length) {
        setError("No service providers are currently available.");
      }
    } catch (err) {
      console.error("Failed to load billers:", err);
      const message = "Unable to load service providers.";
      setError(message);
      toast({
        title: "Unable to load services",
        description: message,
        variant: "destructive",
      });
    } finally {
      setLoadingBillers(false);
    }
  };

  // ==========================================================
  // LOAD BILLERS WHEN PAGE OPENS
  // ==========================================================

  useEffect(() => {
    if (category || CLUBKONNECT_SERVICES.has(serviceType)) {
      void loadBillers();
    }
  }, [category, serviceType, serviceFunction]);

  // ==========================================================
  // LOAD ITEMS
  // ==========================================================

  const loadItems = async (
    billerCode: string
  ) => {
    const cleanBillerCode =
      String(
        billerCode ?? ""
      ).trim();

    if (!cleanBillerCode) {
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
      const {
        data,
        error: functionError,
      } =
        await supabase.functions.invoke(
          serviceFunction,
          {
            body: {
              action: "items",
              service: serviceType,
              biller_code: cleanBillerCode,
              ...(category ? { category } : {}),
              country: "NG",
            },
          }
        );

      if (functionError) {
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
        data.success !== true
      ) {
        console.error(
          "Bill items API response:",
          data
        );

        throw new Error(
          data?.error ||
            data?.message ||
            "Unable to load bill packages."
        );
      }

      const loadedItems =
        Array.isArray(data?.items)
          ? data.items
          : Array.isArray(data?.data?.items)
            ? data.data.items
            : Array.isArray(data?.data)
              ? data.data
              : [];

      const normalizedItems = loadedItems
        .map((item: BillItem) => {
          const itemCode = cleanString(
            item.item_code ??
              (item as any).PRODUCT_ID ??
              (item as any).product_id ??
              (item as any).productId ??
              (item as any).code ??
              (item as any).id
          );

          if (!itemCode) return null;

          const rawPrice =
            item.selling_price ??
            item.amount ??
            (item as any).price ??
            (item as any).PRODUCT_AMOUNT ??
            (item as any).product_amount ??
            (item as any).Amount;

          const price = numberValue(rawPrice);
          const variable = isVariableItem({
            ...item,
            item_code: itemCode,
          });

          const name = cleanString(
            item.name ??
              item.short_name ??
              item.data_plan ??
              (item as any).PRODUCT_NAME ??
              (item as any).product_name ??
              (item as any).productName ??
              itemCode
          );

          return {
            ...item,
            item_code: itemCode,
            name,
            amount: price,
            selling_price: price,
            is_variable: variable,

            plan_type:
              item.plan_type ??
              (item as any).planType ??
              (isHotDeal(item) ? "SME" : "REGULAR"),
            plan_period:
              item.plan_period ??
              (item as any).planPeriod ??
              item.period ??
              item.group_name ??
              getDataGroup(item),
            is_hot_deal:
              item.is_hot_deal === true ||
              isHotDeal(item),
          };
        })
        .filter(Boolean) as BillItem[];

      if (isAmountOnly) {
        const variableItem =
          normalizedItems.find((item) => isVariableItem(item)) ??
          normalizedItems[0];

        if (variableItem?.item_code) {
          setSelectedItemCode(cleanString(variableItem.item_code));
        }
      }

      setItems(
        normalizedItems
      );

      if (
        normalizedItems.length === 0
      ) {
        setError(
          "No packages are currently available for this provider."
        );
      }
    } catch (err: any) {
      console.error(
        "Failed to load bill items:",
        err
      );

      const message =
        "Unable to load bill packages.";

      setError(message);

      toast({
        title: "Unable to load packages",
        description: message,
        variant: "destructive",
      });
    } finally {
      setLoadingItems(false);
    }
  };

  // ==========================================================
  // BILLER CHANGE
  // ==========================================================

  const handleBillerChange = async (
    value: string
  ) => {
    if (
      processingPayment ||
      verifyingPin
    ) {
      return;
    }

    setSelectedBillerCode(value);

    await loadItems(value);
  };

  // ==========================================================
  // DATA PLAN
  // ==========================================================

  const handleDataPlanSelect = (
    item: BillItem
  ) => {
    if (
      processingPayment ||
      verifyingPin
    ) {
      return;
    }

    const code =
      String(
        item.item_code ?? ""
      );

    if (!code) {
      return;
    }

    const sellingPrice = numberValue(
      item.selling_price ?? item.amount ?? item.price
    );

    if (sellingPrice <= 0) {
      toast({
        title: "Invalid data plan",
        description:
          "This data plan does not have a valid price.",
        variant: "destructive",
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

    setCustomAmountMode(false);
    setError("");
  };

  // ==========================================================
  // NON-DATA ITEM
  // ==========================================================

  const handleItemChange = (
    value: string
  ) => {
    if (
      processingPayment ||
      verifyingPin
    ) {
      return;
    }

    setSelectedItemCode(value);
    setError("");
    setAmount("");
    setCustomAmountMode(false);
  };

  // ==========================================================
  // AMOUNT
  // ==========================================================

  const handleAmountSelect = (
    value: number
  ) => {
    if (
      processingPayment ||
      verifyingPin
    ) {
      return;
    }

    const sellingPrice = value;

    setAmount(
      String(
        sellingPrice
      )
    );

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

  // ==========================================================
  // AMOUNT RULES
  // ==========================================================

  const amountNumber =
    Number(amount);

  const itemMinimum =
    Number(
      selectedItem?.minimum ?? 0
    );

  const itemMaximum =
    Number(
      selectedItem?.maximum ?? 0
    );

  const selectedItemPrice =
    numberValue(
      selectedItem?.selling_price ??
        selectedItem?.amount ??
        selectedItem?.price
    );

  const dataSellingAmount =
    isData && selectedItem
      ? numberValue(
          selectedItem.selling_price ??
            selectedItem.amount ??
            selectedItem.price
        )
      : 0;

  // ==========================================================
  // CUSTOMER NORMALISATION
  // ==========================================================

  const normaliseCustomer =
    (): string => {
      let value =
        customer.trim();

      if (
        serviceType === "airtime" ||
        serviceType === "data"
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
      if (!selectedBillerCode) {
        toast({
          title:
            "Select a network or biller",
          description:
            "Please select a network or biller.",
          variant:
            "destructive",
        });

        return false;
      }

      if (!selectedItemCode && !isAmountOnly) {
        toast({
          title: "Select a package",
          description: "Please select a service package.",
          variant: "destructive",
        });
        return false;
      }

      if (isAmountOnly && !selectedItemCode) {
        toast({
          title: "Service not ready",
          description: "Please wait for the service options to finish loading.",
          variant: "destructive",
        });
        return false;
      }

      const finalCustomer =
        normaliseCustomer();

      if (!finalCustomer) {
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
        serviceType ===
          "airtime" ||
        serviceType === "data"
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
        !Number.isFinite(
          amountNumber
        ) ||
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

      if (isData) {
        if (
          selectedItemPrice <=
          0
        ) {
          toast({
            title:
              "Invalid data plan",
            description:
              "The selected data plan does not have a valid price.",
            variant:
              "destructive",
          });

          return false;
        }

        if (
          Math.abs(
            amountNumber -
              dataSellingAmount
          ) > 0.01
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
      }
      if (
        !isData &&
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
        !isData &&
        !false &&
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
        amountNumber >
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

  const buildPurchaseDetails = () => {
    const finalCustomer = normaliseCustomer();

    return {
      customer: finalCustomer,
      biller_code: selectedBillerCode,
      item_code: selectedItemCode,
      phoneNumber:
        serviceType === "airtime" || serviceType === "data"
          ? finalCustomer
          : "",
      phone:
        serviceType === "airtime" || serviceType === "data"
          ? finalCustomer
          : "",
      meterNumber: serviceType === "electricity" ? finalCustomer : "",
      meter_number: serviceType === "electricity" ? finalCustomer : "",
      smartCardNumber: serviceType === "cable" ? finalCustomer : "",
      smartcardNumber: serviceType === "cable" ? finalCustomer : "",
      smartcard_number: serviceType === "cable" ? finalCustomer : "",
      accountNumber: serviceType === "internet" ? finalCustomer : "",
      account_number: serviceType === "internet" ? finalCustomer : "",
      type: serviceType,
      country: "NG",
      customerLabel,
      item: selectedItem,
      biller: selectedBiller,
      selling_amount: amountNumber,
      plan_type: isData ? getPlanType(selectedItem ?? {}) : "",
      is_hot_deal: isData ? isHotDeal(selectedItem ?? {}) : false,
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

      if (!validateForm()) {
        return;
      }

      setPaymentPin("");
      setError("");
      setShowPinPrompt(true);
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
        setVerifyingPin(true);
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

        if (pinError) {
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

        const sellingAmount =
          amountNumber;

        setShowPinPrompt(
          false
        );

        setPaymentPin("");
        setProcessingPayment(
          true
        );

        console.log(
          "Payment PIN verified. Sending bill purchase:",
          {
            service:
              serviceType,

            selling_amount:
              sellingAmount,

            biller_code:
              selectedBillerCode,

            item_code:
              selectedItemCode,

            customer:
              details.customer,

            details,
          }
        );

        await onPurchase(
          sellingAmount,
          details
        );

        resetForm();
      } catch (err: any) {
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

  // ==========================================================
  // BACK
  // ==========================================================

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
            onClick={onBack}
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

      {/* HEADER */}

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
              {service.title}
            </h1>

          </div>

        </div>
      </header>

      {/* CONTENT */}

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6">

        {/* PIN SCREEN */}

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
                Enter your 4-digit Payment PIN
                to confirm this payment.
              </p>

              <p className="text-lg font-semibold text-green-700 mt-2">
                {service.title}
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
                    amountNumber
                  )}
                </span>
              </div>

              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-gray-600">
                  {customerLabel}
                </span>

                <span className="text-sm font-medium text-gray-900 text-right break-all">
                  {normaliseCustomer()}
                </span>
              </div>

              {selectedItem && !isAmountOnly && (
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
                    handlePinVerification();
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
                Your Payment PIN is securely
                verified before the payment
                is processed.
              </p>

            </div>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 mb-5">
                <p className="text-sm text-red-700">
                  {error}
                </p>
              </div>
            )}

            <div className="space-y-3">

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
                className="w-full bg-green-600 hover:bg-green-700"
              >
                {verifyingPin ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
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

            {/* PROVIDER */}

            <div className="mb-5 space-y-2">
              <div className="flex items-center justify-between">
                <Label>{isAirtime || isData ? "Network" : "Provider"}</Label>

                {!loadingBillers && !processingPayment && !verifyingPin && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void loadBillers()}
                    className="h-7 px-2"
                  >
                    <RefreshCw className="mr-1 h-3.5 w-3.5" /> Refresh
                  </Button>
                )}
              </div>

              {loadingBillers ? (
                <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-200 py-8 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading providers...
                </div>
              ) : billers.length ? (
                <div className="grid w-full grid-cols-4 gap-2 sm:grid-cols-5 sm:gap-3 md:grid-cols-6">
                  {billers.map((biller, index) => {
                    const code = cleanString(biller.biller_code);
                    if (!code) return null;
                    return (
                      <ProviderCard
                        key={`${code}-${index}`}
                        provider={biller}
                        selected={code === selectedBillerCode}
                        disabled={processingPayment || verifyingPin}
                        onClick={() => void handleBillerChange(code)}
                      />
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 p-5 text-center">
                  <p className="text-sm text-slate-500">No providers are currently available.</p>
                  <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => void loadBillers()}>
                    <RefreshCw className="mr-2 h-4 w-4" /> Retry
                  </Button>
                </div>
              )}
            </div>

            {/* DATA / PACKAGE */}

            {selectedBillerCode && isData && (
              <div className="mb-5 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label>Data Plan</Label>
                    <p className="mt-1 text-xs text-gray-500">Choose from Hot Deals, Daily, Weekly, Monthly or Other plans.</p>
                  </div>
                  {loadingItems && <Loader2 className="h-4 w-4 animate-spin text-[#082A63]" />}
                </div>

                <div className="flex max-w-full gap-2 overflow-x-auto pb-1">
                  {(["HOT DEALS", "DAILY", "WEEKLY", "MONTHLY", "OTHER"] as const).map((tab) => {
                    const count = dataGroups[tab === "HOT DEALS" ? "HOT DEALS" : tab === "DAILY" ? "Daily" : tab === "WEEKLY" ? "Weekly" : tab === "MONTHLY" ? "Monthly" : "Other"].length;
                    return (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setDataTab(tab)}
                        disabled={processingPayment || verifyingPin}
                        className={[
                          "shrink-0 whitespace-nowrap rounded-full border px-3 py-2 text-[11px] font-bold transition-colors",
                          dataTab === tab
                            ? "border-[#082A63] bg-[#082A63] text-white"
                            : "border-slate-200 bg-white text-slate-600 hover:border-[#082A63]/30",
                        ].join(" ")}
                      >
                        {tab === "HOT DEALS" && <Flame className="mr-1 inline h-3.5 w-3.5" />}
                        {tab} <span className="ml-1 opacity-70">({count})</span>
                      </button>
                    );
                  })}
                </div>

                {loadingItems ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {[1, 2, 3].map((n) => <div key={n} className="h-28 animate-pulse rounded-2xl bg-slate-100" />)}
                  </div>
                ) : visibleDataPlans.length ? (
                  <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3">
                    {visibleDataPlans.map((item, index) => (
                      <DataPlanCard
                        key={`${cleanString(item.item_code)}-${index}`}
                        item={item}
                        selected={cleanString(item.item_code) === selectedItemCode}
                        onClick={() => handleDataPlanSelect(item)}
                        disabled={processingPayment || verifyingPin}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-slate-500">
                    {dataTab === "HOT DEALS" ? "No hot deals are currently available." : "No packages are currently available in this category."}
                  </div>
                )}
              </div>
            )}

            {selectedBillerCode && !isData && !isAmountOnly && (
              <div className="mb-5 space-y-2">
                <Label>Package</Label>
                <select
                  value={selectedItemCode}
                  onChange={(event) => {
                    const code = event.target.value;
                    setSelectedItemCode(code);
                    const item = items.find((entry) => cleanString(entry.item_code) === code);
                    setAmount(item ? String(numberValue(item.selling_price ?? item.amount ?? item.price)) : "");
                    setError("");
                  }}
                  disabled={loadingItems || processingPayment || verifyingPin || !items.length}
                  className="h-11 w-full rounded-md border bg-background px-3 text-sm"
                >
                  <option value="">{loadingItems ? "Loading packages..." : "Select package"}</option>
                  {items.filter((item) => !isVariableItem(item)).map((item, index) => {
                    const code = cleanString(item.item_code);
                    if (!code) return null;
                    return <option key={`${code}-${index}`} value={code}>{cleanString(item.name ?? item.short_name ?? code)}</option>;
                  })}
                </select>
              </div>
            )}

            {selectedBillerCode && isAmountOnly && (
              <div className="mb-5 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                {isAirtime
                  ? "Airtime is amount-based. Choose the network above, then select or enter the amount you want."
                  : "Electricity is amount-based. Choose the provider above, then select or enter the amount you want."}
              </div>
            )}

            {/* CUSTOMER */}

            <div className="space-y-2 mb-5">

              <Label htmlFor="billCustomer">
                {customerLabel}
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
                      "electricity" ||
                  serviceType ===
                      "cable"
                    ? "numeric"
                    : "text"
                }
              />

            </div>

            {/* DATA PRICE */}

            {isData &&
              selectedItem && (
                <div className="rounded-lg bg-green-50 border border-green-100 p-4 mb-5">

                  <div className="flex items-center justify-between gap-4">

                    <span className="text-sm text-gray-600">
                      Selected Plan
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

            {/* AMOUNT */}

            {!isData && (
              <div className="space-y-2 mb-5">

                <Label>
                  Amount (₦)
                </Label>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">

                  {(isAirtime
                    ? AIRTIME_AMOUNTS
                    : BILL_AMOUNTS
                  ).map(
                    (value) => {
                      const displayAmount = value;

                      return (
                        <button
                          type="button"
                          key={value}
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
                              displayAmount
                            )
                              ? "border-green-600 bg-green-50 text-green-700 ring-1 ring-green-600"
                              : "border-gray-200",
                          ].join(
                            " "
                          )}
                        >
                          {formatNaira(
                            displayAmount
                          )}
                        </button>
                      );
                    }
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
                    Enter Amount
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
                        event.target.value
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
            )}

            {/* ERROR */}

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 mb-5">
                <p className="text-sm text-red-700">
                  {error}
                </p>
              </div>
            )}

            {/* PURCHASE */}

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
                (!selectedItemCode && !isAmountOnly) ||
                !customer.trim() ||
                !amount
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
                Please do not leave this page
                while your payment is being
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
