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

/* ============================================================
 * TYPES
 * ========================================================== */

interface ServicePaymentProps {
  service: {
    title: string;
    type: string;
  } | null;

  /*
   * Kept for Dashboard compatibility.
   * Intentionally NOT rendered in the service UI.
   */
  walletBalance: number;

  onBack: () => void;

  onPurchase: (
    amount: number,
    details: Record<string, any>
  ) => Promise<void>;
}

interface CatalogItem {
  id?: string | number;
  code?: string | number;
  name?: string;
  label?: string;
  title?: string;
  description?: string;

  price?: number | string;
  providerPrice?: number | string;
  provider_price?: number | string;

  networkCode?: string | number;
  network_code?: string | number;

  billerCode?: string | number;
  biller_code?: string | number;

  packageCode?: string | number;
  package_code?: string | number;

  packageName?: string;
  package_name?: string;

  examType?: string;
  exam_type?: string;

  examTypeName?: string;
  exam_type_name?: string;

  meterType?: string;
  meter_type?: string;

  meterTypeName?: string;
  meter_type_name?: string;

  providerCode?: string;
  provider_code?: string;

  providerName?: string;
  provider_name?: string;

  value?: number | string;

  period?: string;
  planType?: string;
  plan_type?: string;

  validityDays?: number | null;
  validity_days?: number | null;

  isHotDeal?: boolean;
  is_hot_deal?: boolean;

  logo?: string;
  logo_url?: string;
  logoUrl?: string;

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

const ELECTRICITY_AMOUNTS = [
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

const NETWORK_LOGOS: Record<string, string> = {
  "01":
    "https://res.cloudinary.com/dqkq5y0qv/image/upload/v1710960600/mtn_t9c4vr.png",
  "02":
    "https://res.cloudinary.com/dqkq5y0qv/image/upload/v1710960600/glo_hqzv1m.png",
  "03":
    "https://res.cloudinary.com/dqkq5y0qv/image/upload/v1710960600/9mobile_nx7x8w.png",
  "04":
    "https://res.cloudinary.com/dqkq5y0qv/image/upload/v1710960600/airtel_yyg7d1.png",
};

const CABLE_NAMES: Record<string, string> = {
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
  "airtime-card": "AIRTIME",
  "data-card": "MOBILEDATA",
  smile: "MOBILEDATA",
  waec: "EDUCATION",
  jamb: "EDUCATION",
};

const cn = (
  ...classes: Array<string | false | null | undefined>
) => classes.filter(Boolean).join(" ");

const NAIRA = String.fromCharCode(8358);

/* ============================================================
 * BASIC HELPERS
 * ========================================================== */

function cleanString(value: unknown): string {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value).trim();
}

function numberValue(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value)
      ? value
      : 0;
  }

  if (typeof value === "string") {
    const cleaned = value
      .replace(/[₦,\s]/g, "")
      .replace(/NGN/gi, "");

    const parsed = Number(cleaned);

    return Number.isFinite(parsed)
      ? parsed
      : 0;
  }

  return 0;
}

function formatNaira(value: unknown): string {
  return `${NAIRA}${numberValue(value).toLocaleString(
    "en-NG",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }
  )}`;
}

function getItemCode(
  item: CatalogItem | null | undefined
): string {
  if (!item) {
    return "";
  }

  return cleanString(
    item.packageCode ??
      item.package_code ??
      item.code ??
      item.id
  );
}

function getItemName(
  item: CatalogItem | null | undefined
): string {
  if (!item) {
    return "";
  }

  return (
    cleanString(item.name) ||
    cleanString(item.label) ||
    cleanString(item.title) ||
    cleanString(item.description) ||
    getItemCode(item)
  );
}

function getSellingPrice(
  item: CatalogItem | null | undefined
): number {
  if (!item) {
    return 0;
  }

  return numberValue(
    item.price ??
      item.selling_price ??
      item.sellingPrice ??
      item.amount
  );
}

function getProviderPrice(
  item: CatalogItem | null | undefined
): number {
  if (!item) {
    return 0;
  }

  return numberValue(
    item.providerPrice ??
      item.provider_price ??
      item.provider_amount ??
      item.amount ??
      item.price
  );
}

function getNetworkCode(
  item: CatalogItem | null | undefined
): string {
  if (!item) {
    return "";
  }

  return cleanString(
    item.networkCode ??
      item.network_code ??
      item.code ??
      item.id
  );
}

function getBillerCode(
  item: CatalogItem | null | undefined
): string {
  if (!item) {
    return "";
  }

  return cleanString(
    item.billerCode ??
      item.biller_code ??
      item.code ??
      item.id
  );
}

function normalizeName(value: unknown): string {
  return cleanString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function getCableName(
  item: CatalogItem | null | undefined
): string {
  if (!item) {
    return "";
  }

  const code = normalizeName(
    item.billerCode ??
      item.biller_code ??
      item.code ??
      item.id
  );

  if (CABLE_NAMES[code]) {
    return CABLE_NAMES[code];
  }

  const name = cleanString(
    item.name ??
      item.label ??
      item.title
  );

  const normalized = normalizeName(name);

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

  return name || cleanString(
    item.code ?? item.id
  );
}

function getDisplayName(
  item: CatalogItem,
  serviceType: string
): string {
  if (serviceType === "cable") {
    return getCableName(item);
  }

  if (
    serviceType === "airtime" ||
    serviceType === "data" ||
    serviceType === "airtime-card" ||
    serviceType === "data-card"
  ) {
    const code = getNetworkCode(item);

    return (
      NETWORK_NAMES[code] ||
      cleanString(item.name) ||
      code
    );
  }

  return (
    cleanString(item.name) ||
    cleanString(item.label) ||
    cleanString(item.title) ||
    cleanString(item.code) ||
    cleanString(item.id)
  );
}

function getLogo(
  item: CatalogItem,
  serviceType: string
): string {
  if (
    serviceType === "airtime" ||
    serviceType === "data" ||
    serviceType === "airtime-card" ||
    serviceType === "data-card"
  ) {
    return (
      NETWORK_LOGOS[getNetworkCode(item)] ||
      ""
    );
  }

  return cleanString(
    item.logo ??
      item.logo_url ??
      item.logoUrl
  );
}

function isHotDeal(
  item: CatalogItem
): boolean {
  if (
    item.isHotDeal === true ||
    item.is_hot_deal === true
  ) {
    return true;
  }

  const text = [
    item.name,
    item.label,
    item.title,
    item.description,
    item.planType,
    item.plan_type,
    item.period,
  ]
    .map(cleanString)
    .join(" ")
    .toLowerCase();

  return (
    /\bsme\b/i.test(text) ||
    text.includes("hot deal") ||
    text.includes("hotdeal")
  );
}

function getDataPeriod(
  item: CatalogItem
): DataTab | null {
  if (isHotDeal(item)) {
    return "HOT";
  }

  const text = [
    item.period,
    item.planType,
    item.plan_type,
    item.name,
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

  if (
    text.includes("daily") ||
    text.includes("1 day")
  ) {
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

function arrayFromPayload(
  payload: any,
  keys: string[] = []
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
    if (
      Array.isArray(payload?.[key])
    ) {
      return payload[key].filter(
        (item: any) =>
          item &&
          typeof item === "object"
      );
    }
  }

  const fallbackKeys = [
    "items",
    "plans",
    "packages",
    "billers",
    "providers",
    "networks",
    "examTypes",
    "exam_types",
    "data",
  ];

  for (const key of fallbackKeys) {
    if (
      Array.isArray(payload?.[key])
    ) {
      return payload[key].filter(
        (item: any) =>
          item &&
          typeof item === "object"
      );
    }
  }

  return [];
}

function responsePayload(
  response: any
): any {
  if (
    response?.data &&
    typeof response.data === "object"
  ) {
    return response.data;
  }

  return response || {};
}

function responseMessage(
  payload: any,
  fallback: string
): string {
  return (
    cleanString(payload?.error) ||
    cleanString(payload?.message) ||
    fallback
  );
}

function isSuccessful(
  payload: any
): boolean {
  if (!payload) {
    return false;
  }

  if (
    payload.success === true ||
    payload.validated === true
  ) {
    return true;
  }

  const status = cleanString(
    payload.status
  ).toLowerCase();

  return [
    "success",
    "successful",
    "validated",
    "valid",
    "completed",
    "complete",
  ].includes(status);
}

/* ============================================================
 * BACKEND SERVICE MAPPING
 * ========================================================== */

/*
 * Customer-facing services:
 *
 *   waec
 *   jamb
 *
 * are represented by the deployed backend as:
 *
 *   service = "education"
 *   biller_code = "waec" / "jamb"
 *
 * This mapping is essential because the backend explicitly
 * accepts "education" rather than direct "waec"/"jamb".
 */
function getBackendService(
  serviceType: string
): string {
  if (
    serviceType === "waec" ||
    serviceType === "jamb"
  ) {
    return "education";
  }

  return serviceType;
}

function getBackendBiller(
  serviceType: string,
  selectedProviderCode: string
): string {
  if (
    serviceType === "waec" ||
    serviceType === "jamb"
  ) {
    return serviceType;
  }

  return selectedProviderCode;
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
  provider: CatalogItem;
  selected: boolean;
  disabled: boolean;
  serviceType: string;
  onClick: () => void;
}) {
  const name = getDisplayName(
    provider,
    serviceType
  );

  const logo = getLogo(
    provider,
    serviceType
  );

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "group relative w-full overflow-hidden rounded-xl border bg-white p-2 text-center transition-all",
        "hover:-translate-y-0.5 hover:shadow-md",
        selected
          ? "border-[#4C1D95] bg-[#4C1D95]/[0.03] ring-2 ring-[#4C1D95]/10"
          : "border-slate-200 hover:border-[#4C1D95]/30",
        disabled &&
          "cursor-not-allowed opacity-60"
      )}
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

      <p className="mt-1.5 truncate px-0.5 text-[10px] font-bold leading-tight text-slate-700">
        {name}
      </p>
    </button>
  );
}

/* ============================================================
 * PLAN CARD
 * ========================================================== */

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
  const name = getItemName(item);

  const validity =
    item.validityDays
      ? `${item.validityDays} day${
          item.validityDays === 1
            ? ""
            : "s"
        }`
      : cleanString(
          item.period ??
            item.planType ??
            item.plan_type
        );

  const hot = isHotDeal(item);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "relative w-full rounded-2xl border bg-white p-3 text-left transition-all",
        "hover:-translate-y-0.5 hover:shadow-md",
        selected
          ? "border-[#4C1D95] bg-[#4C1D95]/[0.025] ring-2 ring-[#4C1D95]/10"
          : "border-slate-200 hover:border-[#4C1D95]/30",
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
        </div>
      </div>
    </button>
  );
}

/* ============================================================
 * COMPONENT
 * ========================================================== */

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

  const backendService =
    getBackendService(serviceType);

  const category =
    SERVICE_CATEGORY_MAP[
      serviceType
    ] || serviceType.toUpperCase();

  const isAirtime =
    serviceType === "airtime";

  const isData =
    serviceType === "data";

  const isElectricity =
    serviceType === "electricity";

  const isCable =
    serviceType === "cable";

  const isAirtimeCard =
    serviceType === "airtime-card";

  const isDataCard =
    serviceType === "data-card";

  const isEpin =
    isAirtimeCard ||
    isDataCard;

  const isSmile =
    serviceType === "smile";

  const isWaec =
    serviceType === "waec";

  const isJamb =
    serviceType === "jamb";

  const isEducation =
    isWaec || isJamb;

  const [providers, setProviders] =
    useState<CatalogItem[]>([]);

  const [
    selectedProviderCode,
    setSelectedProviderCode,
  ] = useState("");

  const [
    selectedProvider,
    setSelectedProvider,
  ] = useState<CatalogItem | null>(
    null
  );

  const [items, setItems] =
    useState<CatalogItem[]>([]);

  const [
    selectedItem,
    setSelectedItem,
  ] = useState<CatalogItem | null>(
    null
  );

  const [
    selectedItemCode,
    setSelectedItemCode,
  ] = useState("");

  const [customer, setCustomer] =
    useState("");

  const [profileCode, setProfileCode] =
    useState("");

  const [quantity, setQuantity] =
    useState(1);

  const [
    selectedAmount,
    setSelectedAmount,
  ] = useState<number | null>(null);

  const [
    electricityAmount,
    setElectricityAmount,
  ] = useState<number | null>(null);

  const [meterType, setMeterType] =
    useState("prepaid");

  const [examType, setExamType] =
    useState("");

  const [dataTab, setDataTab] =
    useState<DataTab>("HOT");

  const [
    loadingProviders,
    setLoadingProviders,
  ] = useState(false);

  const [
    loadingItems,
    setLoadingItems,
  ] = useState(false);

  const [validating, setValidating] =
    useState(false);

  const [
    processingPayment,
    setProcessingPayment,
  ] = useState(false);

  const [error, setError] =
    useState("");

  const [
    validationMessage,
    setValidationMessage,
  ] = useState("");

  const [validated, setValidated] =
    useState(false);

  const [verified, setVerified] =
    useState(false);

  /* ==========================================================
   * RESET
   * ======================================================== */

  const resetValidation =
    useCallback(() => {
      setValidated(false);
      setVerified(false);
      setValidationMessage("");
    }, []);

  const resetForm =
    useCallback(() => {
      setProviders([]);
      setSelectedProvider(null);
      setSelectedProviderCode("");

      setItems([]);
      setSelectedItem(null);
      setSelectedItemCode("");

      setCustomer("");
      setProfileCode("");
      setQuantity(1);

      setSelectedAmount(null);
      setElectricityAmount(null);

      setMeterType("prepaid");
      setExamType("");

      setDataTab("HOT");

      setValidated(false);
      setVerified(false);
      setValidationMessage("");

      setError("");
    }, []);

  /* ==========================================================
   * INVOKE BACKEND
   * ======================================================== */

  const invoke =
    useCallback(
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

        const payload =
          responsePayload(
            result.data
          );

        if (
          payload?.success === false &&
          !payload?.status
        ) {
          throw new Error(
            responseMessage(
              payload,
              "Unable to complete the request."
            )
          );
        }

        return payload;
      },
      []
    );

  /* ==========================================================
   * LOAD PROVIDERS / NETWORKS
   * ======================================================== */

  const loadProviders =
    useCallback(async () => {
      if (!serviceType) {
        return;
      }

      setLoadingProviders(true);
      setError("");

      try {
        let requestService =
          backendService;

        /*
         * WAEC/JAMB are exposed by the backend
         * through the education service.
         */
        const payload =
          await invoke({
            action: "billers",
            service: requestService,
            category,
          });

        const source =
          arrayFromPayload(
            payload,
            [
              "billers",
              "providers",
              "networks",
              "electricityCompanies",
              "cableProviders",
              "examTypes",
            ]
          );

        let normalized =
          dedupeItems(source);

        /*
         * For WAEC/JAMB, the backend returns
         * education billers. We intentionally
         * don't expose the backend implementation.
         */
        if (isEducation) {
          normalized =
            normalized.filter(
              (item) => {
                const code =
                  cleanString(
                    item.biller_code ??
                      item.billerCode ??
                      item.code ??
                      item.id
                  ).toLowerCase();

                return (
                  code === serviceType
                );
              }
            );

          /*
           * If the backend does not return the
           * education biller in this shape,
           * create the customer-facing service
           * option locally. No provider credential
           * or implementation detail is exposed.
           */
          if (!normalized.length) {
            normalized = [
              {
                id: serviceType,
                code: serviceType,
                name:
                  isWaec
                    ? "WAEC"
                    : "JAMB",
                biller_code:
                  serviceType,
                service:
                  backendService,
                price: 0,
              },
            ];
          }
        }

        setProviders(normalized);

        if (
          !normalized.length &&
          isElectricity
        ) {
          setError(
            "No electricity companies are currently available."
          );
        }
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Unable to load available options.";

        setProviders([]);
        setError(message);
      } finally {
        setLoadingProviders(false);
      }
    }, [
      backendService,
      category,
      invoke,
      isEducation,
      isElectricity,
      isWaec,
      serviceType,
    ]);

  /* ==========================================================
   * LOAD ITEMS
   * ======================================================== */

  const loadItems =
    useCallback(
      async (
        providerCode: string
      ) => {
        if (!serviceType) {
          return;
        }

        setLoadingItems(true);
        setError("");

        try {
          const biller =
            getBackendBiller(
              serviceType,
              providerCode
            );

          const payload =
            await invoke({
              action: "items",
              service:
                backendService,
              category,

              biller_code:
                biller,

              billerCode:
                biller,

              network_code:
                providerCode,

              networkCode:
                providerCode,

              details: {
                service:
                  backendService,
                biller_code:
                  biller,
                network_code:
                  providerCode,
              },
            });

          const result =
            dedupeItems(
              arrayFromPayload(
                payload,
                [
                  "items",
                  "plans",
                  "packages",
                ]
              )
            );

          setItems(result);
          setSelectedItem(null);
          setSelectedItemCode("");

          if (!result.length) {
            setError(
              "No packages are currently available."
            );
          }
        } catch (err) {
          const message =
            err instanceof Error
              ? err.message
              : "Unable to load available packages.";

          setItems([]);
          setError(message);
        } finally {
          setLoadingItems(false);
        }
      },
      [
        backendService,
        category,
        invoke,
        serviceType,
      ]
    );

  /* ==========================================================
   * INITIAL LOAD
   * ======================================================== */

  useEffect(() => {
    resetForm();

    if (!serviceType) {
      return;
    }

    void loadProviders();
  }, [
    loadProviders,
    resetForm,
    serviceType,
  ]);

  /* ==========================================================
   * PROVIDER SELECTION
   * ======================================================== */

  const handleProviderSelect =
    useCallback(
      async (
        provider: CatalogItem
      ) => {
        const code =
          getBillerCode(provider);

        if (!code) {
          return;
        }

        setSelectedProvider(
          provider
        );

        setSelectedProviderCode(
          code
        );

        setSelectedItem(null);
        setSelectedItemCode("");

        setCustomer("");

        resetValidation();
        setError("");

        /*
         * Airtime and electricity are amount based.
         * They do not need catalogue items.
         */
        if (
          isAirtime ||
          isElectricity
        ) {
          return;
        }

        /*
         * JAMB/WAEC use education billers.
         * Select the customer-facing service
         * option and then load its packages.
         */
        await loadItems(code);
      },
      [
        isAirtime,
        isElectricity,
        loadItems,
        resetValidation,
      ]
    );

  /* ==========================================================
   * ITEM SELECTION
   * ======================================================== */

  const handleItemSelect =
    useCallback(
      (
        item: CatalogItem
      ) => {
        const code =
          getItemCode(item);

        if (!code) {
          return;
        }

        setSelectedItem(item);
        setSelectedItemCode(code);

        resetValidation();
        setError("");
      },
      [resetValidation]
    );

  /* ==========================================================
   * DATA FILTERING
   * ======================================================== */

  const filteredDataItems =
    useMemo(() => {
      if (!isData) {
        return [];
      }

      if (dataTab === "HOT") {
        const hot =
          items.filter(
            isHotDeal
          );

        return hot.length
          ? hot
          : items;
      }

      return items.filter(
        (item) =>
          getDataPeriod(item) ===
          dataTab
      );
    }, [
      dataTab,
      isData,
      items,
    ]);

  /* ==========================================================
   * AMOUNT
   * ======================================================== */

  const selectedPackagePrice =
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
          ? selectedPackagePrice *
            quantity
          : selectedPackagePrice;

  /* ==========================================================
   * FIELD VALIDATION
   * ======================================================== */

  const validPhone =
    /^\+?234\d{10}$|^0\d{10}$/.test(
      customer.replace(
        /\s+/g,
        ""
      )
    );

  const canContinue =
    Boolean(
      serviceType &&
      (
        isAirtime
          ? Boolean(
              selectedProviderCode &&
              customer &&
              selectedAmount &&
              validPhone
            )
          : isElectricity
            ? Boolean(
                selectedProviderCode &&
                customer &&
                electricityAmount
              )
            : isJamb
              ? Boolean(
                  selectedProviderCode &&
                  examType &&
                  profileCode &&
                  customer &&
                  selectedItemCode &&
                  validPhone
                )
              : isCable
                ? Boolean(
                    selectedProviderCode &&
                    customer &&
                    selectedItemCode
                  )
                : isEpin
                  ? Boolean(
                      selectedProviderCode &&
                      selectedItemCode &&
                      quantity >= 1 &&
                      customer &&
                      validPhone
                    )
                  : isSmile
                    ? Boolean(
                        selectedProviderCode &&
                        selectedItemCode &&
                        customer
                      )
                    : isWaec
                      ? Boolean(
                          selectedProviderCode &&
                          selectedItemCode &&
                          customer &&
                          validPhone
                        )
                      : Boolean(
                          selectedProviderCode &&
                          selectedItemCode &&
                          customer
                        )
      )
    );

  /* ==========================================================
   * BACKEND VALIDATION
   * ======================================================== */

  const handleValidate =
    useCallback(async () => {
      if (!canContinue) {
        setError(
          "Please complete all required fields first."
        );
        return false;
      }

      /*
       * Airtime and electricity are amount-based.
       * The deployed validate endpoint is catalogue/
       * package based, so don't send an invalid
       * validation request for these services.
       */
      if (
        isAirtime ||
        isElectricity
      ) {
        setValidated(true);
        setVerified(false);

        setValidationMessage(
          isAirtime
            ? "Your airtime details are ready for purchase."
            : "Your electricity details are ready for purchase."
        );

        return true;
      }

      setValidating(true);
      setError("");
      setValidationMessage("");
      setValidated(false);
      setVerified(false);

      try {
        const biller =
          getBackendBiller(
            serviceType,
            selectedProviderCode
          );

        const payload =
          await invoke({
            action: "validate",

            service:
              backendService,

            category,

            biller_code:
              biller,

            billerCode:
              biller,

            item_code:
              selectedItemCode,

            itemCode:
              selectedItemCode,

            network_code:
              selectedProviderCode,

            networkCode:
              selectedProviderCode,

            customer:
              customer,

            phone:
              customer,

            phone_number:
              customer,

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

            details: {
              service:
                backendService,

              customer_service:
                serviceType,

              biller_code:
                biller,

              item_code:
                selectedItemCode,

              network_code:
                selectedProviderCode,

              customer:
                customer,

              phone:
                customer,

              profile_code:
                isJamb
                  ? profileCode
                  : undefined,

              exam_type:
                isJamb
                  ? examType
                  : undefined,

              quantity:
                isEpin
                  ? quantity
                  : undefined,
            },
          });

        if (
          !isSuccessful(payload)
        ) {
          throw new Error(
            responseMessage(
              payload,
              "The selected package could not be validated."
            )
          );
        }

        setValidated(true);

        /*
         * The current deployed backend returns
         * validated=true but does not return an
         * external customer verification flag.
         *
         * Therefore we deliberately do NOT claim
         * SmartCard/meter/profile verification here.
         */
        setVerified(
          payload?.verified === true
        );

        const message =
          cleanString(
            payload?.message
          ) ||
          (
            payload?.verified === true
              ? "Details verified successfully."
              : "Selected package is available and your details are ready."
          );

        setValidationMessage(
          message
        );

        toast({
          title:
            payload?.verified === true
              ? "Details verified"
              : "Details confirmed",
          description:
            message,
        });

        return true;
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Unable to validate the selected details.";

        setError(message);
        return false;
      } finally {
        setValidating(false);
      }
    }, [
      amountForPurchase,
      backendService,
      canContinue,
      category,
      customer,
      examType,
      invoke,
      isAirtime,
      isCable,
      isElectricity,
      isEpin,
      isJamb,
      meterType,
      profileCode,
      quantity,
      selectedItemCode,
      selectedProviderCode,
      serviceType,
      toast,
    ]);

  /* ==========================================================
   * PURCHASE DETAILS
   * ======================================================== */

  const buildPurchaseDetails =
    useCallback(() => {
      const providerName =
        selectedProvider
          ? getDisplayName(
              selectedProvider,
              serviceType
            )
          : "";

      const planName =
        selectedItem
          ? getItemName(
              selectedItem
            )
          : "";

      const biller =
        getBackendBiller(
          serviceType,
          selectedProviderCode
        );

      return {
        /*
         * IMPORTANT:
         *
         * `service` is the backend service.
         *
         * WAEC/JAMB therefore use:
         *     service = "education"
         *
         * while `customer_service` preserves
         * the customer-facing service identity.
         */
        service:
          backendService,

        service_type:
          serviceType,

        customer_service:
          serviceType,

        category,

        biller_code:
          biller,

        billerCode:
          biller,

        provider_code:
          selectedProviderCode,

        /*
         * This is the selected customer-facing
         * network/company/service.
         */
        provider_name:
          providerName,

        network_code:
          (
            serviceType ===
              "airtime" ||
            serviceType ===
              "data" ||
            serviceType ===
              "airtime-card" ||
            serviceType ===
              "data-card"
          )
            ? selectedProviderCode
            : undefined,

        network:
          (
            serviceType ===
              "airtime" ||
            serviceType ===
              "data" ||
            serviceType ===
              "airtime-card" ||
            serviceType ===
              "data-card"
          )
            ? providerName
            : undefined,

        item_code:
          selectedItemCode ||
          undefined,

        itemCode:
          selectedItemCode ||
          undefined,

        package_code:
          selectedItemCode ||
          undefined,

        packageCode:
          selectedItemCode ||
          undefined,

        plan_code:
          selectedItemCode ||
          undefined,

        plan_name:
          planName ||
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
          amountForPurchase,

        plan_period:
          selectedItem?.period ??
          undefined,

        plan_type:
          selectedItem?.planType ??
          selectedItem?.plan_type ??
          undefined,

        is_hot_deal:
          selectedItem
            ? isHotDeal(
                selectedItem
              )
            : false,
      };
    }, [
      amountForPurchase,
      backendService,
      category,
      customer,
      examType,
      isCable,
      isEpin,
      isElectricity,
      isJamb,
      meterType,
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

  /* ==========================================================
   * PURCHASE
   * ======================================================== */

  const handlePurchase =
    useCallback(async () => {
      if (!canContinue) {
        setError(
          "Please complete all required fields."
        );
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

      /*
       * Package services must first pass the
       * backend catalogue validation.
       *
       * Airtime/electricity are amount based
       * and are locally confirmed above.
       */
      if (
        !validated
      ) {
        const success =
          await handleValidate();

        if (!success) {
          return;
        }

        /*
         * React state is asynchronous.
         * Stop here and let the user press
         * Purchase after validation.
         */
        return;
      }

      setProcessingPayment(true);
      setError("");

      try {
        const details =
          buildPurchaseDetails();

        await onPurchase(
          amountForPurchase,
          details
        );

        toast({
          title:
            "Purchase submitted",
          description:
            "Your service purchase has been submitted for processing.",
        });
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Unable to continue with the purchase.";

        setError(message);

        toast({
          title:
            "Purchase failed",
          description:
            message,
          variant:
            "destructive",
        });
      } finally {
        setProcessingPayment(false);
      }
    }, [
      amountForPurchase,
      buildPurchaseDetails,
      canContinue,
      handleValidate,
      onPurchase,
      toast,
      validated,
    ]);

  /* ==========================================================
   * DISPLAY LABELS
   * ======================================================== */

  const customerLabel =
    isElectricity
      ? "Meter Number"
      : isCable
        ? "SmartCard Number"
        : isSmile
          ? "Smile Number"
          : "Phone Number";

  const customerPlaceholder =
    isElectricity
      ? "Enter meter number"
      : isCable
        ? "Enter SmartCard number"
        : isSmile
          ? "Enter Smile number"
          : "Enter phone number";

  const providerHeading =
    serviceType === "cable"
      ? "Choose Cable TV"
      : serviceType ===
          "electricity"
        ? "Choose Electricity Company"
        : (
            serviceType ===
              "airtime" ||
            serviceType ===
              "data" ||
            serviceType ===
              "airtime-card" ||
            serviceType ===
              "data-card"
          )
          ? "Choose Network"
          : "Choose Service";

  const showProviders =
    providers.length > 0;

  /* ==========================================================
   * NO SERVICE
   * ======================================================== */

  if (!service) {
    return (
      <div className="min-h-full bg-slate-50">
        <div className="mx-auto flex min-h-[60vh] max-w-xl items-center justify-center px-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
            <p className="text-sm font-semibold text-slate-700">
              No payment service selected.
            </p>

            <Button
              type="button"
              onClick={onBack}
              className="mt-4 rounded-xl bg-[#4C1D95] text-white hover:bg-[#3B1776]"
            >
              Go Back
            </Button>
          </div>
        </div>
      </div>
    );
  }

  /* ==========================================================
   * PAGE
   * ======================================================== */

  return (
    <div className="min-h-full bg-slate-50 pb-10">
      <div className="mx-auto w-full max-w-3xl px-3 py-4 sm:px-5 sm:py-6">

        {/* ====================================================
         * HEADER
         * ================================================== */}

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
              {service.title}
            </h1>

            <p className="text-[10px] text-slate-500 sm:text-xs">
              Secure service purchase
            </p>
          </div>

          <Button
            type="button"
            variant="ghost"
            onClick={() =>
              toast({
                title:
                  "Transaction History",
                description:
                  "Your service transactions are available in your transaction history.",
              })
            }
            className="h-9 rounded-xl px-2 text-[#4C1D95] hover:bg-white"
          >
            History
          </Button>
        </div>

        {/* ====================================================
         * ERROR
         * ================================================== */}

        {error && (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* ====================================================
         * PROVIDER / NETWORK / BILLER
         * ================================================== */}

        <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#4C1D95] text-[11px] font-black text-white">
                1
              </span>

              <div className="min-w-0">
                <Label className="block truncate text-sm font-black text-slate-900 sm:text-base">
                  {providerHeading}
                </Label>

                <p className="text-[10px] text-slate-500 sm:text-xs">
                  Select the service option you want.
                </p>
              </div>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                void loadProviders()
              }
              disabled={
                loadingProviders ||
                processingPayment ||
                validating
              }
              className="h-7 shrink-0 rounded-lg px-2 text-xs text-[#4C1D95]"
            >
              <RefreshCw
                className={cn(
                  "mr-1 h-3 w-3",
                  loadingProviders &&
                    "animate-spin"
                )}
              />
              Refresh
            </Button>
          </div>

          {loadingProviders ? (
            <div className="flex min-h-[90px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50">
              <div className="text-center">
                <Loader2 className="mx-auto h-5 w-5 animate-spin text-[#4C1D95]" />

                <p className="mt-1.5 text-xs text-slate-500">
                  Loading available options...
                </p>
              </div>
            </div>
          ) : showProviders ? (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-6">
              {providers.map(
                (
                  provider,
                  index
                ) => (
                  <ProviderCard
                    key={`${getBillerCode(provider)}-${index}`}
                    provider={
                      provider
                    }
                    selected={
                      getBillerCode(
                        provider
                      ) ===
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
                )
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center">
              <p className="text-xs font-medium text-slate-500">
                No service options are currently available.
              </p>
            </div>
          )}
        </section>

        {/* ====================================================
         * JAMB EXAM TYPE
         * ================================================== */}

        {isJamb && (
          <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#4C1D95] text-xs font-black text-white">
                2
              </span>

              <div>
                <p className="text-sm font-black text-slate-900">
                  Exam Type
                </p>

                <p className="text-[10px] text-slate-500">
                  Select your JAMB examination type.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {[
                {
                  code:
                    "utme-no-mock",
                  name:
                    "UTME",
                },
                {
                  code:
                    "utme-mock",
                  name:
                    "UTME Mock",
                },
                {
                  code:
                    "de",
                  name:
                    "Direct Entry",
                },
              ].map(
                (exam) => (
                  <button
                    key={
                      exam.code
                    }
                    type="button"
                    disabled={
                      processingPayment ||
                      validating
                    }
                    onClick={() => {
                      setExamType(
                        exam.code
                      );

                      setSelectedItem(
                        null
                      );

                      setSelectedItemCode(
                        ""
                      );

                      resetValidation();
                      setError("");
                    }}
                    className={cn(
                      "rounded-xl border p-3 text-left transition",
                      examType ===
                        exam.code
                        ? "border-[#4C1D95] bg-[#4C1D95]/5 ring-2 ring-[#4C1D95]/10"
                        : "border-slate-200 hover:border-[#4C1D95]/30"
                    )}
                  >
                    <p className="text-sm font-black text-slate-900">
                      {exam.name}
                    </p>

                    <p className="mt-1 text-[10px] text-slate-500">
                      {exam.code}
                    </p>
                  </button>
                )
              )}
            </div>
          </section>
        )}

        {/* ====================================================
         * DATA PLANS
         * ================================================== */}

        {isData &&
          selectedProviderCode && (
            <section className="mb-4">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <p className="text-sm font-black text-slate-900">
                    Data Plans
                  </p>

                  <p className="text-[10px] text-slate-500">
                    Choose the data package you want.
                  </p>
                </div>

                {loadingItems && (
                  <Loader2 className="h-4 w-4 animate-spin text-[#4C1D95]" />
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
                        setDataTab(
                          tab
                        )
                      }
                      className={cn(
                        "shrink-0 rounded-full px-3 py-2 text-[10px] font-black transition sm:text-xs",
                        dataTab ===
                          tab
                          ? "bg-[#4C1D95] text-white shadow-sm"
                          : "bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-[#4C1D95]/30"
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
                  <Loader2 className="h-6 w-6 animate-spin text-[#4C1D95]" />
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
                  <p className="text-xs text-slate-500">
                    No plans are currently available in this category.
                  </p>
                </div>
              )}
            </section>
          )}

        {/* ====================================================
         * CABLE PACKAGES
         * ================================================== */}

        {isCable &&
          selectedProviderCode && (
            <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
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

              {loadingItems ? (
                <div className="flex min-h-[120px] items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-[#4C1D95]" />
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

        {/* ====================================================
         * E-PIN PACKAGES
         * ================================================== */}

        {isEpin &&
          selectedProviderCode && (
            <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <Smartphone className="h-5 w-5 text-[#4C1D95]" />

                <div>
                  <p className="text-sm font-black text-slate-900">
                    {isAirtimeCard
                      ? "Choose Denomination"
                      : "Choose Data Package"}
                  </p>

                  <p className="text-[10px] text-slate-500">
                    Select the package you want.
                  </p>
                </div>
              </div>

              {loadingItems ? (
                <div className="flex min-h-[120px] items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-[#4C1D95]" />
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
                    No packages are currently available.
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
                        quantity >= 100 ||
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

        {/* ====================================================
         * GENERIC PACKAGES
         * ================================================== */}

        {(isSmile ||
          isWaec) &&
          selectedProviderCode &&
          items.length > 0 && (
            <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3">
                <p className="text-sm font-black text-slate-900">
                  Choose Package
                </p>

                <p className="text-[10px] text-slate-500">
                  Select the package you want.
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

        {/* ====================================================
         * JAMB PACKAGE
         * ================================================== */}

        {isJamb &&
          examType &&
          selectedProviderCode && (
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

              {loadingItems ? (
                <div className="flex min-h-[120px] items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-[#4C1D95]" />
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
                    No JAMB packages are currently available.
                  </p>
                </div>
              )}
            </section>
          )}

        {/* ====================================================
         * CUSTOMER DETAILS
         * ================================================== */}

        {selectedProviderCode && (
          <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-4 flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#4C1D95] text-xs font-black text-white">
                2
              </span>

              <div>
                <Label className="text-base font-black text-slate-900">
                  {isJamb
                    ? "JAMB Details"
                    : "Customer Details"}
                </Label>

                <p className="text-xs text-slate-500">
                  Enter the details required for this service.
                </p>
              </div>
            </div>

            {/* JAMB PROFILE CODE */}

            {isJamb && (
              <div className="mb-3">
                <Label
                  htmlFor="jambProfileCode"
                  className="mb-1.5 block text-xs font-bold text-slate-700"
                >
                  Profile Code
                </Label>

                <Input
                  id="jambProfileCode"
                  value={
                    profileCode
                  }
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
                  className="h-12 rounded-xl border-slate-200"
                />
              </div>
            )}

            {/* CUSTOMER / PHONE / METER / SMARTCARD */}

            <div>
              <Label
                htmlFor="serviceCustomer"
                className="mb-1.5 block text-xs font-bold text-slate-700"
              >
                {isJamb
                  ? "Phone Number"
                  : customerLabel}
              </Label>

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
                  isJamb
                    ? "Enter phone number"
                    : customerPlaceholder
                }
                disabled={
                  processingPayment ||
                  validating
                }
                inputMode={
                  isElectricity ||
                  isCable ||
                  !isSmile
                    ? "numeric"
                    : "text"
                }
                className="h-12 rounded-xl border-slate-200"
              />
            </div>

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
                            ? "border-[#4C1D95] bg-[#4C1D95]/5 text-[#4C1D95]"
                            : "border-slate-200 text-slate-700 hover:border-[#4C1D95]/30"
                        )}
                      >
                        {
                          option.label
                        }
                      </button>
                    )
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        {/* ====================================================
         * AIRTIME AMOUNT
         * ================================================== */}

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
                          ? "border-[#4C1D95] bg-[#4C1D95]/5 text-[#4C1D95] ring-2 ring-[#4C1D95]/10"
                          : "border-slate-200 text-slate-700 hover:border-[#4C1D95]/30"
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

        {/* ====================================================
         * ELECTRICITY AMOUNT
         * ================================================== */}

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
                {ELECTRICITY_AMOUNTS.map(
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
                        setError("");
                      }}
                      className={cn(
                        "rounded-xl border px-2 py-3 text-xs font-black transition",
                        electricityAmount ===
                          amount
                          ? "border-[#4C1D95] bg-[#4C1D95]/5 text-[#4C1D95] ring-2 ring-[#4C1D95]/10"
                          : "border-slate-200 text-slate-700 hover:border-[#4C1D95]/30"
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
                  htmlFor="customElectricityAmount"
                  className="mb-1.5 block text-xs font-bold text-slate-700"
                >
                  Custom Amount
                </Label>

                <Input
                  id="customElectricityAmount"
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

        {/* ====================================================
         * VALIDATION / CONFIRMATION
         * ================================================== */}

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
                    : "Details confirmed"}
                </p>

                <p className="mt-0.5 text-xs text-green-700">
                  {validationMessage ||
                    "Your service details are ready for purchase."}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ====================================================
         * SUMMARY
         * ================================================== */}

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

                <span className="text-right text-xs font-black text-slate-900">
                  {service.title}
                </span>
              </div>

              {selectedProvider && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-slate-500">
                    Network / Company
                  </span>

                  <span className="text-right text-xs font-black text-slate-900">
                    {getDisplayName(
                      selectedProvider,
                      serviceType
                    )}
                  </span>
                </div>
              )}

              {isJamb &&
                examType && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-slate-500">
                      Exam Type
                    </span>

                    <span className="text-right text-xs font-black text-slate-900">
                      {examType ===
                        "de"
                        ? "Direct Entry"
                        : examType ===
                            "utme-mock"
                          ? "UTME Mock"
                          : "UTME"}
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

        {/* ====================================================
         * ACTION
         * ================================================== */}

        <div className="sticky bottom-3 z-20">
          {!validated ? (
            <Button
              type="button"
              onClick={() =>
                void handleValidate()
              }
              disabled={
                !canContinue ||
                validating ||
                processingPayment
              }
              className="h-12 w-full rounded-2xl bg-[#4C1D95] text-sm font-black text-white shadow-lg hover:bg-[#3B1776] disabled:opacity-50"
            >
              {validating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Confirming...
                </>
              ) : (
                <>
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Continue
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
