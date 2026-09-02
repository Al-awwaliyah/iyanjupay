import React, { useEffect, useMemo, useState } from "react";

import {
  ArrowLeft,
  Check,
  ChevronDown,
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

  onHistory?: () => void;
}

interface Biller {
  id?: number | string;

  name?: string;
  biller_code?: string;
  category?: string;
  country?: string;
  country_code?: string;

  logo?: string | null;

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
  selling_price?: number | string;
  price?: number | string;

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
  plan_period?: string;

  period?: string;
  period_name?: string;

  type?: string;
  category?: string;
  category_name?: string;
  group_name?: string;

  data_type?: string;
  service_type?: string;

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

const AIRTIME_AMOUNTS = [
  50,
  100,
  200,
  500,
  1000,
  2000,
  5000,
];

const BILL_AMOUNTS = [
  500,
  1000,
  2000,
  5000,
  10000,
];

const DATA_TABS = [
  "HOT DEALS",
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "OTHER",
] as const;

type DataTab = (typeof DATA_TABS)[number];

// ============================================================
// PROVIDER LOGOS
// ============================================================
//
// Backend-provided logos are always preferred.
//
// These are fallback logos for common Nigerian providers.
// ============================================================

const PROVIDER_LOGOS: Record<string, string> = {
  mtn: "https://cdn.simpleicons.org/mtn",

  glo: "https://cdn.simpleicons.org/globacom",

  globacom: "https://cdn.simpleicons.org/globacom",

  airtel: "https://cdn.simpleicons.org/airtel",

  "9mobile": "https://cdn.simpleicons.org/9mobile",

  dstv: "https://cdn.simpleicons.org/dstv",

  gotv: "https://cdn.simpleicons.org/gotv",

  startimes: "https://cdn.simpleicons.org/startimes",

  smile: "https://cdn.simpleicons.org/smile",

  spectranet: "https://cdn.simpleicons.org/spectranet",
};

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

function getItemPrice(
  item: BillItem | null | undefined
): number {
  return numberValue(
    item?.selling_price ??
      item?.amount ??
      item?.price
  );
}

function getItemName(
  item: BillItem | null | undefined
): string {
  return cleanString(
    item?.name ??
      item?.short_name ??
      item?.data_plan ??
      "Package"
  );
}

// ============================================================
// GENERIC SEARCH TEXT
// ============================================================

function getItemSearchText(
  item: BillItem
): string {
  return [
    item.name,
    item.short_name,
    item.description,
    item.plan_type,
    item.plan_period,
    item.period,
    item.period_name,
    item.type,
    item.category,
    item.category_name,
    item.group_name,
    item.data_type,
    item.service_type,
    item.data_plan,
    item.validity,
    item.duration,
    item.plan,
    item.plan_name,
    item.bundle,
  ]
    .map(cleanString)
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

// ============================================================
// HOT DEAL DETECTION
// ============================================================

function isHotDeal(
  item: BillItem
): boolean {
  if (item.is_hot_deal === true) {
    return true;
  }

  const text = getItemSearchText(item);

  return (
    /\bsme\b/.test(text) ||
    /\bhot\s*deal\b/.test(text) ||
    /\bhotdeal\b/.test(text)
  );
}

// ============================================================
// PLAN TYPE
// ============================================================

function getPlanType(
  item: BillItem
): string {
  const explicit = cleanString(
    item.plan_type
  );

  if (explicit) {
    return explicit;
  }

  return isHotDeal(item)
    ? "SME"
    : "REGULAR";
}

// ============================================================
// DATA GROUP
// ============================================================

function getDataGroup(
  item: BillItem
):
  | "DAILY"
  | "WEEKLY"
  | "MONTHLY"
  | "OTHER" {
  /*
   * Prefer an explicit backend plan_period when available.
   */
  const explicitPeriod = cleanString(
    item.plan_period
  ).toUpperCase();

  if (
    explicitPeriod === "DAILY" ||
    explicitPeriod === "WEEKLY" ||
    explicitPeriod === "MONTHLY"
  ) {
    return explicitPeriod;
  }

  /*
   * Check every field that a provider/backend
   * may use to describe the plan duration.
   */
  const text = getItemSearchText(item);

  // MONTHLY
  if (
    /\bmonthly\b/.test(text) ||
    /\b30\s*(day|days)\b/.test(text) ||
    /\b31\s*(day|days)\b/.test(text) ||
    /\b1\s*month\b/.test(text) ||
    /\b2\s*months?\b/.test(text) ||
    /\b3\s*months?\b/.test(text) ||
    /\b4\s*months?\b/.test(text) ||
    /\b6\s*months?\b/.test(text) ||
    /\b12\s*months?\b/.test(text)
  ) {
    return "MONTHLY";
  }

  // WEEKLY
  if (
    /\bweekly\b/.test(text) ||
    /\b7\s*(day|days)\b/.test(text) ||
    /\b14\s*(day|days)\b/.test(text) ||
    /\b1\s*week\b/.test(text) ||
    /\b2\s*weeks?\b/.test(text) ||
    /\b3\s*weeks?\b/.test(text) ||
    /\b4\s*weeks?\b/.test(text)
  ) {
    return "WEEKLY";
  }

  // DAILY
  if (
    /\bdaily\b/.test(text) ||
    /\b1\s*(day|days)\b/.test(text) ||
    /\b2\s*(day|days)\b/.test(text) ||
    /\b3\s*(day|days)\b/.test(text) ||
    /\b24\s*hours?\b/.test(text)
  ) {
    return "DAILY";
  }

  return "OTHER";
}

// ============================================================
// PROVIDER KEY
// ============================================================

function normaliseProviderKey(
  value: unknown
): string {
  return cleanString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

// ============================================================
// PROVIDER LOGO
// ============================================================

function getProviderLogo(
  provider:
    | Biller
    | null
    | undefined
): string | null {
  /*
   * Backend logo always wins.
   */
  const backendLogo = cleanString(
    provider?.logo
  );

  if (backendLogo) {
    return backendLogo;
  }

  /*
   * Search all useful provider fields instead
   * of relying on only one field.
   */
  const providerText = [
    provider?.name,
    provider?.short_name,
    provider?.description,
    provider?.biller_code,
  ]
    .map(cleanString)
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const logoKey = Object.keys(
    PROVIDER_LOGOS
  ).find((providerName) =>
    providerText.includes(
      providerName.toLowerCase()
    )
  );

  return logoKey
    ? PROVIDER_LOGOS[logoKey]
    : null;
}

// ============================================================
// PROVIDER DISPLAY NAME
// ============================================================

function getProviderDisplayName(
  provider: Biller
): string {
  return cleanString(
    provider.short_name ??
      provider.name ??
      "Service Provider"
  );
}

// ============================================================
// VARIABLE AMOUNT ITEM
// ============================================================

function isVariableItem(
  item: BillItem
): boolean {
  const code = cleanString(
    item.item_code
  ).toLowerCase();

  const name = getItemName(
    item
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

// ============================================================
// CUSTOMER LABEL
// ============================================================

function getCustomerLabel(
  serviceType: string,
  selectedItem: BillItem | null
): string {
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
  const logo = getProviderLogo(
    provider
  );

  const name =
    getProviderDisplayName(
      provider
    );

  const [logoFailed, setLogoFailed] =
    useState(false);

  /*
   * Reset logo state if the provider changes.
   */
  useEffect(() => {
    setLogoFailed(false);
  }, [logo]);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={name}
      aria-label={`Select ${name}`}
      className={[
        /*
         * Small circular provider selector.
         *
         * Four fit comfortably across a mobile screen.
         */
        "group relative flex h-[64px] w-[64px] shrink-0 items-center justify-center rounded-full border bg-white transition-all sm:h-[72px] sm:w-[72px]",

        selected
          ? "border-[#082A63] bg-[#082A63]/[0.04] ring-2 ring-[#082A63]/15"
          : "border-slate-200 hover:border-[#082A63]/40 hover:shadow-sm",

        disabled
          ? "cursor-not-allowed opacity-60"
          : "",
      ].join(" ")}
    >
      {/* PROVIDER LOGO */}

      <div
        className={[
          "flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-slate-50 sm:h-14 sm:w-14",
          selected
            ? "bg-[#082A63]/5"
            : "",
        ].join(" ")}
      >
        {logo && !logoFailed ? (
          <img
            src={logo}
            alt=""
            aria-hidden="true"
            className="h-9 w-9 object-contain sm:h-10 sm:w-10"
            onError={() =>
              setLogoFailed(true)
            }
          />
        ) : (
          <span className="text-sm font-extrabold text-[#082A63]">
            {name
              .slice(0, 2)
              .toUpperCase()}
          </span>
        )}
      </div>

      {/* SELECTED CHECK */}

      {selected && (
        <span className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#082A63] text-white shadow-sm">
          <Check className="h-3 w-3" />
        </span>
      )}
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
    getItemPrice(item);

  const name =
    getItemName(item);

  const duration =
    cleanString(
      item.validity ??
        item.duration ??
        item.plan_period ??
        item.period
    );

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "relative overflow-hidden rounded-2xl border bg-white p-4 text-left transition-all",
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
        <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-orange-600">
          <Flame className="h-3 w-3" />
          Hot Deal
        </span>
      )}

      <div className="pr-16">
        <p className="line-clamp-2 min-h-[40px] text-sm font-bold text-slate-900">
          {name}
        </p>

        {duration && (
          <p className="mt-1 text-xs text-slate-500">
            {duration}
          </p>
        )}
      </div>

      <div className="mt-4 flex items-end justify-between gap-2">
        <span className="text-lg font-extrabold text-[#082A63]">
          {formatNaira(price)}
        </span>

        <span
          className={[
            "flex h-7 w-7 items-center justify-center rounded-full border",
            selected
              ? "border-[#082A63] bg-[#082A63] text-white"
              : "border-slate-200 text-slate-400",
          ].join(" ")}
        >
          {selected && (
            <Check className="h-4 w-4" />
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
  onHistory,
}: ServicePaymentProps) => {
  const { toast } =
    useToast();

  // ==========================================================
  // FORM
  // ==========================================================

  const [amount, setAmount] =
    useState("");

  const [customer, setCustomer] =
    useState("");

  const [
    customAmountMode,
    setCustomAmountMode,
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

  // ==========================================================
  // SERVICE
  // ==========================================================

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

  /*
   * Airtime and electricity are amount-based.
   *
   * They do NOT need customer-facing package cards.
   */
  const isAmountOnly =
    isAirtime ||
    isElectricity;

  // ==========================================================
  // SELECTED BILLER
  // ==========================================================

  const selectedBiller =
    useMemo(
      () =>
        billers.find(
          (biller) =>
            cleanString(
              biller.biller_code
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
          (item) =>
            cleanString(
              item.item_code
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
      const hot: BillItem[] =
        [];

      const daily: BillItem[] =
        [];

      const weekly: BillItem[] =
        [];

      const monthly: BillItem[] =
        [];

      const other: BillItem[] =
        [];

      items.forEach(
        (item) => {
          /*
           * Variable amount entries
           * must never appear as data packages.
           */
          if (
            !cleanString(
              item.item_code
            ) ||
            isVariableItem(item)
          ) {
            return;
          }

          /*
           * Explicit SME / Hot Deal plans
           * always go into Hot Deals.
           */
          if (
            isHotDeal(item)
          ) {
            hot.push(item);
            return;
          }

          const group =
            getDataGroup(item);

          if (
            group === "DAILY"
          ) {
            daily.push(item);
          } else if (
            group === "WEEKLY"
          ) {
            weekly.push(item);
          } else if (
            group === "MONTHLY"
          ) {
            monthly.push(item);
          } else {
            other.push(item);
          }
        }
      );

      /*
       * Keep catalogue ordering stable.
       * Cheaper plans appear first within each group.
       */
      const sortPlans = (
        plans: BillItem[]
      ) =>
        [...plans].sort(
          (a, b) =>
            getItemPrice(a) -
            getItemPrice(b)
        );

      return {
        hot: sortPlans(hot),
        daily: sortPlans(daily),
        weekly: sortPlans(weekly),
        monthly: sortPlans(monthly),
        other: sortPlans(other),
      };
    }, [items]);

  // ==========================================================
  // VISIBLE DATA PLANS
  // ==========================================================

  const visibleDataPlans =
    useMemo(() => {
      switch (dataTab) {
        case "HOT DEALS":
          return dataGroups.hot;

        case "DAILY":
          return dataGroups.daily;

        case "WEEKLY":
          return dataGroups.weekly;

        case "MONTHLY":
          return dataGroups.monthly;

        default:
          return dataGroups.other;
      }
    }, [
      dataGroups,
      dataTab,
    ]);

  // ==========================================================
  // CUSTOMER
  // ==========================================================

  const customerLabel =
    useMemo(
      () =>
        getCustomerLabel(
          serviceType,
          selectedItem
        ),
      [
        serviceType,
        selectedItem,
      ]
    );

  const customerPlaceholder =
    useMemo(() => {
      switch (
        serviceType
      ) {
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
    }, [
      serviceType,
    ]);

  // ==========================================================
  // AMOUNT VALUES
  // ==========================================================

  const amountNumber =
    Number(amount);

  const selectedItemPrice =
    getItemPrice(
      selectedItem
    );

  const itemMinimum =
    numberValue(
      selectedItem?.minimum
    );

  const itemMaximum =
    numberValue(
      selectedItem?.maximum
    );

  // ==========================================================
  // RESET
  // ==========================================================

  const resetForm =
    () => {
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
  // SERVICE CHANGE
  // ==========================================================

  useEffect(() => {
    setAmount("");

    setCustomer("");

    setBillers([]);

    setItems([]);

    setSelectedBillerCode("");

    setSelectedItemCode("");

    setError("");

    setCustomAmountMode(false);

    setShowPinPrompt(false);

    setPaymentPin("");

    setDataTab("HOT DEALS");
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

      setLoadingBillers(true);

      setError("");

      setSelectedBillerCode("");

      setSelectedItemCode("");

      setItems([]);

      setAmount("");

      setCustomAmountMode(false);

      try {
        const {
          data,
          error: functionError,
        } =
          await supabase.functions.invoke(
            "flutterwave-bills",
            {
              body: {
                action: "billers",

                service: serviceType,

                category,

                country: "NG",
              },
            }
          );

        if (functionError) {
          console.error(
            "Billers function error:",
            functionError
          );

          throw new Error(
            "Unable to load available options."
          );
        }

        if (
          !data ||
          data.success !== true
        ) {
          console.error(
            "Billers API response:",
            data
          );

          throw new Error(
            data?.error ||
              "Unable to load available options."
          );
        }

        const loadedBillers =
          Array.isArray(
            data?.billers
          )
            ? data.billers
            : Array.isArray(
                  data?.data
                )
              ? data.data
              : [];

        setBillers(
          loadedBillers
        );

        if (
          !loadedBillers.length
        ) {
          setError(
            "No options are currently available."
          );
        }
      } catch (err) {
        console.error(
          "Failed to load billers:",
          err
        );

        const message =
          "Unable to load available options.";

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
    };

  // ==========================================================
  // LOAD BILLERS WHEN SERVICE OPENS
  // ==========================================================

  useEffect(() => {
    if (category) {
      void loadBillers();
    }
  }, [category]);

  // ==========================================================
  // LOAD ITEMS
  // ==========================================================

  const loadItems =
    async (
      billerCode: string
    ) => {
      const cleanBillerCode =
        cleanString(
          billerCode
        );

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
            "flutterwave-bills",
            {
              body: {
                action: "items",

                service: serviceType,

                biller_code:
                  cleanBillerCode,

                category,

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
          Array.isArray(
            data?.items
          )
            ? data.items
            : [];

        /*
         * Preserve every backend field.
         *
         * The backend is responsible for providing:
         * - plan_period
         * - plan_type
         * - is_hot_deal
         *
         * We only provide safe frontend fallbacks.
         */
        const normalizedItems =
          loadedItems.map(
            (item: BillItem) => ({
              ...item,

              item_code:
                item.item_code !=
                null
                  ? String(
                      item.item_code
                    )
                  : undefined,

              plan_type:
                cleanString(
                  item.plan_type
                ) ||
                (isHotDeal(item)
                  ? "SME"
                  : "REGULAR"),

              plan_period:
                cleanString(
                  item.plan_period
                ) ||
                getDataGroup(item),

              is_hot_deal:
                item.is_hot_deal ===
                  true ||
                isHotDeal(item),
            })
          );

        setItems(
          normalizedItems
        );

        /*
         * Amount-only services don't show
         * package cards.
         *
         * We still select the backend item
         * internally because the provider may
         * require an item_code.
         */
        if (
          isAmountOnly
        ) {
          const variableItem =
            normalizedItems.find(
              isVariableItem
            );

          if (
            variableItem?.item_code
          ) {
            setSelectedItemCode(
              String(
                variableItem.item_code
              )
            );
          } else if (
            normalizedItems[0]
              ?.item_code
          ) {
            setSelectedItemCode(
              String(
                normalizedItems[0]
                  .item_code
              )
            );
          }
        } else if (
          !normalizedItems.length
        ) {
          setError(
            "No packages are currently available for this service."
          );
        }
      } catch (err) {
        console.error(
          "Failed to load bill items:",
          err
        );

        const message =
          "Unable to load bill packages.";

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

      await loadItems(value);
    };

  // ==========================================================
  // DATA PLAN
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

      const price =
        getItemPrice(item);

      if (
        !code ||
        price <= 0
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
  // CUSTOMER NORMALISATION
  // ==========================================================

  const normaliseCustomer =
    (): string => {
      let value =
        customer
          .trim()
          .replace(
            /\s+/g,
            ""
          );

      if (
        serviceType ===
          "airtime" ||
        serviceType ===
          "data"
      ) {
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
            "Select a network or biller",

          description:
            "Please select a network or biller.",

          variant:
            "destructive",
        });

        return false;
      }

      /*
       * Airtime/electricity may use a
       * variable amount item internally.
       */
      if (
        !selectedItemCode
      ) {
        toast({
          title:
            "Service not ready",

          description:
            "Please wait for the service options to finish loading.",

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

      // ======================================================
      // PHONE VALIDATION
      // ======================================================

      if (
        serviceType ===
          "airtime" ||
        serviceType ===
          "data"
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

      // ======================================================
      // AMOUNT
      // ======================================================

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

      // ======================================================
      // DATA
      // ======================================================

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
      }

      // ======================================================
      // MINIMUM
      // ======================================================

      if (
        !isData &&
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

      // ======================================================
      // MAXIMUM
      // ======================================================

      if (
        !isData &&
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

      // ======================================================
      // WALLET VALIDATION
      // ======================================================
      //
      // Wallet balance remains internal.
      //
      // It is deliberately NOT displayed in the UI.
      //

      if (
        amountNumber >
        Number(walletBalance)
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
          serviceType ===
              "airtime" ||
          serviceType ===
              "data"
            ? finalCustomer
            : "",

        phone:
          serviceType ===
              "airtime" ||
          serviceType ===
              "data"
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

        country:
          "NG",

        customerLabel,

        item:
          selectedItem,

        biller:
          selectedBiller,

        /*
         * Provider remains available internally
         * through the selected biller object.
         *
         * The customer UI never displays the
         * underlying integration/provider.
         */
        provider:
          selectedBiller?.short_name ??
          selectedBiller?.name ??
          "",

        selling_amount:
          amountNumber,

        plan_type:
          isData
            ? getPlanType(
                selectedItem ?? {}
              )
            : "",

        is_hot_deal:
          isData
            ? isHotDeal(
                selectedItem ?? {}
              )
            : false,

        plan_period:
          isData
            ? getDataGroup(
                selectedItem ?? {}
              )
            : "",
      };
    };

  // ==========================================================
  // PURCHASE
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
  // VERIFY PIN
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

            customer:
              details.customer,
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
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <p className="mb-4 text-gray-600">
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
  // AMOUNT PRESETS
  // ==========================================================

  const amountPresets =
    isAirtime
      ? AIRTIME_AMOUNTS
      : BILL_AMOUNTS;

  // ==========================================================
  // PAGE
  // ==========================================================

  return (
    <div className="min-h-screen bg-slate-50 pb-10">

      {/* ======================================================
          HEADER
          ====================================================== */}

      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#082A63] text-white shadow-sm">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">

          <div className="flex items-center gap-3">

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
              className="text-white hover:bg-white/10"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>

            <div>
              <h1 className="text-base font-bold sm:text-lg">
                {service.title}
              </h1>

              <p className="text-xs text-white/65">
                Secure service payment
              </p>
            </div>

          </div>

          {onHistory && (
            <Button
              type="button"
              variant="ghost"
              onClick={
                onHistory
              }
              className="text-white hover:bg-white/10"
            >
              History
            </Button>
          )}

        </div>
      </header>

      {/* ======================================================
          MAIN
          ====================================================== */}

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">

        {/* ====================================================
            PIN SCREEN
            ==================================================== */}

        {showPinPrompt ? (
          <div className="mx-auto max-w-xl rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">

            <div className="mb-6 text-center">

              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#082A63]/10">
                <ShieldCheck className="h-7 w-7 text-[#082A63]" />
              </div>

              <h2 className="text-xl font-extrabold text-slate-900">
                Confirm Payment
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Enter your 4-digit Payment PIN to confirm this payment.
              </p>

              <p className="mt-2 text-sm font-bold text-[#082A63]">
                {service.title}
              </p>

            </div>

            {/* SUMMARY */}

            <div className="mb-6 rounded-2xl bg-slate-50 p-4">

              <div className="flex justify-between gap-4">

                <span className="text-sm text-slate-500">
                  Amount
                </span>

                <span className="font-extrabold text-slate-900">
                  {formatNaira(
                    amountNumber
                  )}
                </span>

              </div>

              <div className="mt-3 flex justify-between gap-4">

                <span className="text-sm text-slate-500">
                  {customerLabel}
                </span>

                <span className="break-all text-right text-sm font-semibold text-slate-900">
                  {normaliseCustomer()}
                </span>

              </div>

              {selectedItem &&
                !isAmountOnly && (
                  <div className="mt-3 flex justify-between gap-4">

                    <span className="text-sm text-slate-500">
                      Package
                    </span>

                    <span className="text-right text-sm font-semibold text-slate-900">
                      {getItemName(
                        selectedItem
                      )}
                    </span>

                  </div>
                )}

            </div>

            {/* PIN */}

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

              <p className="text-center text-xs text-slate-500">
                Your Payment PIN is securely verified before the payment is processed.
              </p>

            </div>

            {error && (
              <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
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
                className="h-11 w-full bg-[#082A63] hover:bg-[#061f49]"
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

                  setPaymentPin("");

                  setError("");

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
             NORMAL PAYMENT FORM
             ================================================== */

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">

            {/* =================================================
                LEFT
                ================================================= */}

            <section className="space-y-6">

              {/* =================================================
                  PROVIDERS
                  ================================================= */}

              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">

                <div className="mb-5">

                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#082A63]">
                    Choose provider
                  </p>

                  <h2 className="mt-1 text-xl font-extrabold text-slate-900">
                    Select your{" "}
                    {isData ||
                    isAirtime
                      ? "network"
                      : "service provider"}
                  </h2>

                  <p className="mt-1 text-sm text-slate-500">
                    Choose a provider below to continue.
                  </p>

                </div>

                {loadingBillers ? (

                  <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-200 py-10 text-sm text-slate-500">

                    <Loader2 className="h-4 w-4 animate-spin" />

                    Loading providers...

                  </div>

                ) : billers.length ? (

                  /*
                   * SMALL CIRCULAR PROVIDER GRID
                   *
                   * 4 columns on mobile.
                   */
                  <div className="grid grid-cols-4 gap-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8">

                    {billers.map(
                      (
                        biller,
                        index
                      ) => {
                        const code =
                          cleanString(
                            biller.biller_code
                          );

                        if (!code) {
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

                  <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center">

                    <p className="text-sm text-slate-500">
                      No providers are currently available.
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
                  SERVICE PACKAGES
                  ================================================= */}

              {selectedBillerCode && (

                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">

                  {isData ? (

                    /* ===========================================
                       DATA
                       =========================================== */

                    <>

                      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">

                        <div>

                          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#082A63]">
                            Available packages
                          </p>

                          <h2 className="mt-1 text-xl font-extrabold text-slate-900">
                            Choose a data plan
                          </h2>

                          <p className="mt-1 text-sm text-slate-500">
                            Hot deals and regular plans are shown together.
                          </p>

                        </div>

                        {loadingItems && (
                          <Loader2 className="h-5 w-5 animate-spin text-[#082A63]" />
                        )}

                      </div>

                      {/* DATA TABS */}

                      <div className="mt-5 flex gap-2 overflow-x-auto pb-1">

                        {DATA_TABS.map(
                          (
                            tab
                          ) => {

                            const count =
                              tab ===
                              "HOT DEALS"
                                ? dataGroups.hot.length
                                : tab ===
                                    "DAILY"
                                  ? dataGroups.daily.length
                                  : tab ===
                                      "WEEKLY"
                                    ? dataGroups.weekly.length
                                    : tab ===
                                        "MONTHLY"
                                      ? dataGroups.monthly.length
                                      : dataGroups.other.length;

                            return (
                              <button
                                type="button"
                                key={tab}
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
                                  "whitespace-nowrap rounded-full border px-4 py-2 text-xs font-bold transition-colors",
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

                                {tab}

                                <span
                                  className={
                                    dataTab ===
                                    tab
                                      ? "ml-1 opacity-75"
                                      : "ml-1 text-slate-400"
                                  }
                                >
                                  (
                                  {count}
                                  )
                                </span>

                              </button>
                            );
                          }
                        )}

                      </div>

                      {/* DATA PLANS */}

                      {loadingItems ? (

                        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">

                          {[
                            1,
                            2,
                            3,
                          ].map(
                            (
                              number
                            ) => (
                              <div
                                key={
                                  number
                                }
                                className="h-32 animate-pulse rounded-2xl bg-slate-100"
                              />
                            )
                          )}

                        </div>

                      ) : visibleDataPlans.length ? (

                        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">

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

                        <div className="mt-5 rounded-2xl border border-dashed border-slate-200 p-8 text-center">

                          <p className="text-sm font-medium text-slate-600">

                            {dataTab ===
                            "HOT DEALS"
                              ? "No hot deals are currently available."
                              : "No packages are currently available in this category."}

                          </p>

                        </div>

                      )}

                    </>

                  ) : (

                    /* ===========================================
                       OTHER SERVICES
                       =========================================== */

                    <>

                      <div className="mb-5 flex items-center justify-between gap-3">

                        <div>

                          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#082A63]">
                            Service details
                          </p>

                          <h2 className="mt-1 text-xl font-extrabold text-slate-900">

                            {isAmountOnly
                              ? "Enter payment amount"
                              : "Choose a package"}

                          </h2>

                        </div>

                        {loadingItems && (
                          <Loader2 className="h-5 w-5 animate-spin text-[#082A63]" />
                        )}

                      </div>

                      {/* AMOUNT-ONLY SERVICES */}

                      {isAmountOnly ? (

                        <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">

                          {isAirtime
                            ? "Airtime is amount-based. Select the network above, then choose or enter the amount you want."
                            : "This service is amount-based. Enter the amount you want to pay."}

                        </div>

                      ) : (

                        /* PACKAGE SERVICE */

                        <div className="space-y-2">

                          <Label htmlFor="servicePackage">
                            Package
                          </Label>

                          <div className="relative">

                            <select
                              id="servicePackage"
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

                                if (
                                  item &&
                                  getItemPrice(
                                    item
                                  ) >
                                    0
                                ) {
                                  setAmount(
                                    String(
                                      getItemPrice(
                                        item
                                      )
                                    )
                                  );
                                }

                                setError("");
                              }}
                              disabled={
                                loadingItems ||
                                processingPayment ||
                                verifyingPin ||
                                !items.length
                              }
                              className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 pr-10 text-sm outline-none focus:border-[#082A63]"
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
                                        {getItemName(
                                          item
                                        )}
                                      </option>
                                    );
                                  }
                                )}

                            </select>

                            <ChevronDown className="pointer-events-none absolute right-3 top-3 h-5 w-5 text-slate-400" />

                          </div>

                        </div>
                      )}

                    </>

                  )}

                </div>
              )}

              {/* =================================================
                  CUSTOMER DETAILS
                  ================================================= */}

              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">

                <div className="mb-5">

                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#082A63]">
                    Customer details
                  </p>

                  <h2 className="mt-1 text-xl font-extrabold text-slate-900">
                    Where should we send the service?
                  </h2>

                </div>

                <div className="space-y-2">

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

              </div>

            </section>

            {/* =================================================
                PAYMENT SIDEBAR
                ================================================= */}

            <aside className="lg:sticky lg:top-24 lg:self-start">

              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">

                <div className="mb-5">

                  <div className="flex items-center gap-3">

                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#082A63]/10">
                      <ShieldCheck className="h-5 w-5 text-[#082A63]" />
                    </div>

                    <div>

                      <h3 className="text-base font-bold text-slate-900">
                        Payment
                      </h3>

                      <p className="text-xs text-slate-500">
                        Pay securely from your wallet
                      </p>

                    </div>

                  </div>

                </div>

                {/* SELECTED PLAN */}

                {selectedItem &&
                  !isAmountOnly && (
                    <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">

                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Selected package
                      </p>

                      <p className="mt-1 text-sm font-bold text-slate-900">
                        {getItemName(
                          selectedItem
                        )}
                      </p>

                      <p className="mt-1 text-lg font-extrabold text-[#082A63]">
                        {formatNaira(
                          selectedItemPrice
                        )}
                      </p>

                    </div>
                  )}

                {/* AMOUNT */}

                <div className="space-y-3">

                  <Label>
                    Amount (₦)
                  </Label>

                  {isData ? (

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">

                      <div className="flex items-center justify-between gap-4">

                        <span className="text-sm text-slate-500">
                          Plan price
                        </span>

                        <span className="text-xl font-extrabold text-slate-900">
                          {formatNaira(
                            amountNumber ||
                              0
                          )}
                        </span>

                      </div>

                    </div>

                  ) : (

                    <>

                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">

                        {amountPresets.map(
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
                                "rounded-xl border p-3 text-center text-sm font-bold transition-all",

                                amount ===
                                String(
                                  value
                                )
                                  ? "border-[#082A63] bg-[#082A63]/5 text-[#082A63] ring-1 ring-[#082A63]"
                                  : "border-slate-200 text-slate-700 hover:border-[#082A63]/40 hover:bg-slate-50",
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
                            "rounded-xl border p-3 text-center text-sm font-bold transition-all",

                            customAmountMode
                              ? "border-[#082A63] bg-[#082A63]/5 text-[#082A63] ring-1 ring-[#082A63]"
                              : "border-slate-200 text-slate-700 hover:border-[#082A63]/40 hover:bg-slate-50",
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

                    </>
                  )}

                  {/* LIMITS */}

                  {!isData &&
                    (itemMinimum >
                      0 ||
                      itemMaximum >
                        0) && (
                      <p className="text-xs text-slate-500">

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

                {/* =================================================
                    TOTAL
                    ================================================= */}

                <div className="mt-5 border-t border-slate-200 pt-5">

                  <div className="flex items-center justify-between gap-4">

                    <span className="text-sm font-medium text-slate-500">
                      Total
                    </span>

                    <span className="text-xl font-extrabold text-slate-900">
                      {formatNaira(
                        amountNumber ||
                          0
                      )}
                    </span>

                  </div>

                </div>

                {/* ERROR */}

                {error && (
                  <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3">

                    <p className="text-sm text-red-700">
                      {error}
                    </p>

                  </div>
                )}

                {/* PURCHASE */}

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
                    !selectedItemCode ||
                    !customer.trim() ||
                    !amount
                  }
                  className="mt-5 h-12 w-full bg-[#082A63] font-bold hover:bg-[#061f49]"
                >

                  {processingPayment ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    `Purchase ${service.title}`
                  )}

                </Button>

                {/* SECURITY */}

                <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-500">

                  <ShieldCheck className="h-4 w-4 text-emerald-600" />

                  Secure payment protected by your Payment PIN

                </div>

              </section>

            </aside>

          </div>
        )}

      </main>
    </div>
  );
};

export default ServicePayment;
