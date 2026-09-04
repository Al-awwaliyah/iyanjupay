import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  Flame,
  History,
  Loader2,
  LockKeyhole,
  Receipt,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  XCircle,
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

  onHistory?: () => void;

  onPurchase: (
    amount: number,
    details: Record<string, any>
  ) => Promise<any>;
}

type Biller = Record<string, any>;
type Item = Record<string, any>;

type DataTab =
  | "HOT DEALS"
  | "DAILY"
  | "WEEKLY"
  | "MONTHLY"
  | "OTHER";

const SERVICE_ALIASES: Record<string, string> = {
  airtime_epin: "airtime-card",
  airtime_card: "airtime-card",
  data_epin: "data-card",
  data_card: "data-card",
};

const SERVICE_TITLES: Record<string, string> = {
  airtime: "Airtime",
  data: "Mobile Data",
  cable: "Cable TV",
  electricity: "Electricity",
  "airtime-card": "Airtime E-pin",
  "data-card": "Data E-pin",
  airtime_epin: "Airtime E-pin",
  data_epin: "Data E-pin",
  smile: "Smile",
  waec: "WAEC",
  jamb: "JAMB",
};

const CLUBKONNECT_SERVICES = new Set([
  "airtime",
  "data",
  "cable",
  "electricity",
  "airtime-card",
  "data-card",
  "smile",
  "waec",
  "jamb",
]);

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
  100,
  200,
  500,
  1000,
  2000,
  5000,
  10000,
];

const DATA_TABS: DataTab[] = [
  "HOT DEALS",
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "OTHER",
];

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function naira(value: unknown): string {
  return `₦${num(value).toLocaleString("en-NG", {
    maximumFractionDigits: 2,
  })}`;
}

function normaliseServiceType(type: string): string {
  const value = clean(type).toLowerCase();

  return SERVICE_ALIASES[value] ?? value;
}

function displayServiceTitle(
  service: {
    title: string;
    type: string;
  } | null
): string {
  if (!service) {
    return "Services";
  }

  return (
    SERVICE_TITLES[
      normaliseServiceType(service.type)
    ] ?? service.title
  );
}

/**
 * IMPORTANT:
 *
 * network_code/networkCode are checked before generic code/id.
 * This is important for Airtel and the other Nigerian networks
 * because ClubKonnect may return the network using network_code.
 */
function getCode(
  value: Biller | Item | null | undefined
): string {
  return clean(
    value?.biller_code ??
      value?.billerCode ??
      value?.network_code ??
      value?.networkCode ??
      value?.cable_code ??
      value?.cableCode ??
      value?.code ??
      value?.id ??
      value?.value
  );
}

function getName(
  value: Biller | Item | null | undefined
): string {
  return clean(
    value?.name ??
      value?.label ??
      value?.title ??
      value?.short_name ??
      value?.shortName ??
      value?.biller_name ??
      value?.billerName ??
      value?.network_name ??
      value?.networkName ??
      value?.description
  );
}

/**
 * Accept all common ClubKonnect/catalogue item-code names.
 */
function getItemCode(
  item: Item | null | undefined
): string {
  return clean(
    item?.item_code ??
      item?.itemCode ??
      item?.product_code ??
      item?.productCode ??
      item?.variation_code ??
      item?.variationCode ??
      item?.plan_code ??
      item?.planCode ??
      item?.package_code ??
      item?.packageCode ??
      item?.code ??
      item?.id ??
      item?.value
  );
}

function getItemPrice(
  item: Item | null | undefined
): number {
  return num(
    item?.selling_price ??
      item?.sellingPrice ??
      item?.price ??
      item?.amount ??
      item?.denomination ??
      item?.value
  );
}

function getProviderPrice(
  item: Item | null | undefined
): number {
  return num(
    item?.providerPrice ??
      item?.provider_price ??
      item?.cost ??
      item?.provider_amount ??
      item?.providerAmount
  );
}

function getPlanName(item: Item): string {
  return clean(
    item.name ??
      item.plan_name ??
      item.planName ??
      item.packageName ??
      item.package_name ??
      item.description ??
      getItemCode(item)
  );
}

/**
 * Determine the data-plan category.
 */
function planGroup(
  item: Item
): Exclude<DataTab, "HOT DEALS"> {
  const text = [
    item.period,
    item.plan_period,
    item.planPeriod,
    item.plan_type,
    item.planType,
    item.validity,
    item.validity_days,
    item.validityDays,
    item.duration,
    item.name,
    item.description,
  ]
    .map(clean)
    .join(" ")
    .toLowerCase();

  if (
    /monthly|\b30\s*days?\b|\b31\s*days?\b|\b1\s*month\b|\b2\s*months?\b|\b3\s*months?\b/.test(
      text
    )
  ) {
    return "MONTHLY";
  }

  if (
    /weekly|\b7\s*days?\b|\b14\s*days?\b|\b1\s*week\b|\b2\s*weeks?\b/.test(
      text
    )
  ) {
    return "WEEKLY";
  }

  if (
    /daily|\b1\s*day\b|\b2\s*days?\b|\b3\s*days?\b|\b24\s*hours?\b/.test(
      text
    )
  ) {
    return "DAILY";
  }

  return "OTHER";
}

/**
 * THIS IS THE IMPORTANT HOT-DEAL LOGIC FROM THE WORKING FILE,
 * expanded so it can handle the different response shapes that
 * ClubKonnect/backend normalization may return.
 */
function isHot(item: Item): boolean {
  const flags = [
    item.is_hot_deal,
    item.isHotDeal,
    item.hot_deal,
    item.hotDeal,
    item.is_hot,
    item.isHot,
  ];

  if (
    flags.some((value) => {
      if (typeof value === "boolean") {
        return value;
      }

      const normalized = clean(value).toLowerCase();

      return [
        "true",
        "1",
        "yes",
        "y",
        "hot",
      ].includes(normalized);
    })
  ) {
    return true;
  }

  const text = [
    item.name,
    item.title,
    item.description,
    item.plan_type,
    item.planType,
    item.plan_period,
    item.planPeriod,
    item.category,
    item.type,
    item.data_type,
    item.dataType,
    item.bundle_type,
    item.bundleType,
    item.product_type,
    item.productType,
    item.period,
    item.validity,
    item.duration,
  ]
    .map(clean)
    .join(" ")
    .toLowerCase();

  return /\bsme\+?\b|hot[ -]?deal|promo|bonus|special|corporate|gifting/.test(
    text
  );
}

/**
 * Variable/amount-based entries are not displayed as normal
 * data-plan cards.
 */
function isVariable(item: Item): boolean {
  const minimum = num(
    item.minimum ??
      item.min_amount ??
      item.minAmount
  );

  const maximum = num(
    item.maximum ??
      item.max_amount ??
      item.maxAmount
  );

  return (
    !!item.is_airtime ||
    (!!minimum && !getItemCode(item)) ||
    (!!maximum && !getItemCode(item))
  );
}

function firstArray(...values: any[]): any[] {
  for (const value of values) {
    if (Array.isArray(value)) {
      return value;
    }
  }

  return [];
}

/**
 * Provider logos.
 *
 * Google favicon is used as a lightweight fallback when the
 * backend does not provide a logo URL.
 */
function providerLogo(
  name: string,
  code = ""
): string | null {
  const value = `${name} ${code}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ");

  if (value.includes("dstv")) {
    return "https://www.google.com/s2/favicons?domain=dstv.com&sz=128";
  }

  if (value.includes("gotv")) {
    return "https://www.google.com/s2/favicons?domain=gotvafrica.com&sz=128";
  }

  if (
    value.includes("startime") ||
    value.includes("startimes")
  ) {
    return "https://www.google.com/s2/favicons?domain=startimestv.com&sz=128";
  }

  if (value.includes("showmax")) {
    return "https://www.google.com/s2/favicons?domain=showmax.com&sz=128";
  }

  if (
    value.includes("mtn") ||
    /\b01\b/.test(value)
  ) {
    return "https://www.google.com/s2/favicons?domain=mtn.ng&sz=128";
  }

  if (
    value.includes("glo") ||
    /\b02\b/.test(value)
  ) {
    return "https://www.google.com/s2/favicons?domain=gloworld.com&sz=128";
  }

  if (
    value.includes("9mobile") ||
    value.includes("etisalat") ||
    /\b03\b/.test(value)
  ) {
    return "https://www.google.com/s2/favicons?domain=9mobile.com.ng&sz=128";
  }

  if (
    value.includes("airtel") ||
    /\b04\b/.test(value)
  ) {
    return "https://www.google.com/s2/favicons?domain=airtel.com.ng&sz=128";
  }

  if (value.includes("smile")) {
    return "https://www.google.com/s2/favicons?domain=smile.com.ng&sz=128";
  }

  return null;
}

/**
 * Customer-facing fallback catalogue.
 *
 * These do not expose ClubKonnect to the customer.
 * They only guarantee that standard service choices do not
 * disappear when the live catalogue omits an option.
 */
const OFFLINE_BILLERS: Record<
  string,
  Biller[]
> = {
  airtime: [
    {
      biller_code: "01",
      name: "MTN",
    },
    {
      biller_code: "02",
      name: "Glo",
    },
    {
      biller_code: "03",
      name: "9mobile",
    },
    {
      biller_code: "04",
      name: "Airtel",
    },
  ],

  data: [
    {
      biller_code: "01",
      name: "MTN",
    },
    {
      biller_code: "02",
      name: "Glo",
    },
    {
      biller_code: "03",
      name: "9mobile",
    },
    {
      biller_code: "04",
      name: "Airtel",
    },
  ],

  "airtime-card": [
    {
      biller_code: "01",
      name: "MTN",
    },
    {
      biller_code: "02",
      name: "Glo",
    },
    {
      biller_code: "03",
      name: "9mobile",
    },
    {
      biller_code: "04",
      name: "Airtel",
    },
  ],

  "data-card": [
    {
      biller_code: "01",
      name: "MTN",
    },
    {
      biller_code: "02",
      name: "Glo",
    },
    {
      biller_code: "03",
      name: "9mobile",
    },
    {
      biller_code: "04",
      name: "Airtel",
    },
  ],

  cable: [
    {
      biller_code: "dstv",
      name: "DStv",
    },
    {
      biller_code: "gotv",
      name: "GOtv",
    },
    {
      biller_code: "startimes",
      name: "Startimes",
    },
    {
      biller_code: "showmax",
      name: "Showmax",
    },
  ],

  electricity: [
    {
      biller_code: "01",
      name: "AEDC Abuja Disco",
    },
    {
      biller_code: "02",
      name: "BEDC Benin Disco",
    },
    {
      biller_code: "03",
      name: "EEDC Enugu Disco",
    },
    {
      biller_code: "04",
      name: "EKEDC Eko Disco",
    },
    {
      biller_code: "05",
      name: "IBEDC Ibadan Disco",
    },
    {
      biller_code: "06",
      name: "IKEDC Ikeja Disco",
    },
    {
      biller_code: "07",
      name: "JED Jos Disco",
    },
    {
      biller_code: "08",
      name: "KAEDCO Kaduna Disco",
    },
    {
      biller_code: "09",
      name: "KEDCO Kano Disco",
    },
    {
      biller_code: "10",
      name: "PHED Port Harcourt Disco",
    },
    {
      biller_code: "11",
      name: "YEDC Yola Disco",
    },
  ],
};

/**
 * Filters bad backend placeholders such as:
 *
 * TV
 * [TV]
 * {tv}
 * [[TV]]
 * [object Object]
 */
function isPlaceholderBiller(
  value: Biller
): boolean {
  const name = getName(value)
    .toLowerCase()
    .replace(/\s+/g, "");

  const code = getCode(value)
    .toLowerCase()
    .replace(/\s+/g, "");

  return [name, code].some((v) =>
    /^(\[?\[?\{?tv\}?\]?\]?|\[objectobject\])$/.test(
      v
    )
  );
}

/**
 * Merge live billers with the canonical customer-facing
 * service options.
 *
 * Live values are kept first because their code is the code
 * supplied by the backend and therefore the safest code for
 * the eventual purchase.
 */
function mergeBillers(
  service: string,
  live: Biller[]
): Biller[] {
  const cleaned = live.filter(
    (b) => !isPlaceholderBiller(b)
  );

  const result: Biller[] = [];
  const seen = new Set<string>();

  const canonicalName = (
    biller: Biller
  ): string => {
    const raw =
      `${getName(biller)} ${getCode(
        biller
      )}`.toLowerCase();

    if (
      raw.includes("mtn") ||
      /\b01\b/.test(raw)
    ) {
      return "mtn";
    }

    if (
      raw.includes("glo") ||
      /\b02\b/.test(raw)
    ) {
      return "glo";
    }

    if (
      raw.includes("9mobile") ||
      raw.includes("etisalat") ||
      /\b03\b/.test(raw)
    ) {
      return "9mobile";
    }

    if (
      raw.includes("airtel") ||
      /\b04\b/.test(raw)
    ) {
      return "airtel";
    }

    if (raw.includes("dstv")) {
      return "dstv";
    }

    if (raw.includes("gotv")) {
      return "gotv";
    }

    if (raw.includes("startime")) {
      return "startimes";
    }

    if (raw.includes("showmax")) {
      return "showmax";
    }

    return "";
  };

  const add = (biller: Biller) => {
    const code = getCode(biller)
      .toLowerCase();

    const name = getName(biller)
      .toLowerCase();

    const canonical =
      canonicalName(biller);

    const key =
      canonical ||
      code ||
      name;

    if (
      !key ||
      seen.has(key)
    ) {
      return;
    }

    seen.add(key);
    result.push(biller);
  };

  cleaned.forEach(add);

  (
    OFFLINE_BILLERS[service] ?? []
  ).forEach(add);

  return result;
}

function initials(name: string): string {
  const words = clean(name)
    .split(/\s+/)
    .filter(Boolean);

  return (
    words.length >= 2
      ? words[0][0] + words[1][0]
      : clean(name).slice(0, 2)
  ).toUpperCase();
}

type ProcessingSession = {
  amount: number;
  details: Record<string, any>;
  idempotencyKey: string;
};

type TransactionStatus =
  | "processing"
  | "success"
  | "pending"
  | "failed";

function createIdempotencyKey(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID ===
      "function"
  ) {
    return crypto.randomUUID();
  }

  return `svc-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 12)}`;
}

function transactionStatusFromResult(
  result: any
): Exclude<
  TransactionStatus,
  "processing"
> {
  const status = clean(
    result?.status ??
      result?.transaction_status ??
      result?.transactionStatus ??
      result?.data?.status
  ).toLowerCase();

  if (
    [
      "pending",
      "processing",
      "queued",
      "initiated",
      "in_progress",
      "in-progress",
    ].includes(status)
  ) {
    return "pending";
  }

  if (
    [
      "failed",
      "failure",
      "declined",
      "cancelled",
      "canceled",
      "reversed",
    ].includes(status)
  ) {
    return "failed";
  }

  if (
    result &&
    (
      result.success === false ||
      result.data?.success === false
    )
  ) {
    return "failed";
  }

  return "success";
}

function transactionReferenceFromResult(
  result: any
): string {
  return clean(
    result?.reference ??
      result?.transaction_reference ??
      result?.transactionReference ??
      result?.provider_reference ??
      result?.providerReference ??
      result?.data?.reference ??
      result?.data?.transaction_reference ??
      result?.data?.transactionReference ??
      result?.data?.provider_reference
  );
}

function ServiceTransactionProcessing({
  amount,
  details,
  execute,
  onDone,
  onBack,
}: {
  amount: number;
  details: Record<string, any>;
  execute: () => Promise<any>;
  onDone: () => void;
  onBack: () => void;
}) {
  const [status, setStatus] =
    useState<TransactionStatus>(
      "processing"
    );

  const [reference, setReference] =
    useState("");

  const [message, setMessage] =
    useState(
      "Your payment is being processed securely."
    );

  const [copied, setCopied] =
    useState(false);

  const startedRef =
    React.useRef(false);

  const serviceName =
    clean(
      details?.biller?.name ??
        details?.biller?.label ??
        details?.biller?.title
    ) ||
    clean(details?.service_title) ||
    "Service";

  const customerValue =
    clean(
      details?.smartCardNumber ||
        details?.smartcardNumber ||
        details?.meterNumber ||
        details?.profileCode ||
        details?.phoneNumber ||
        details?.customer
    );

  const itemName =
    clean(
      details?.item?.name ??
        details?.item?.plan_name ??
        details?.item?.packageName ??
        details?.item?.description
    );

  const run =
    useCallback(async () => {
      setStatus("processing");

      setMessage(
        "Your payment is being processed securely."
      );

      try {
        const result =
          await execute();

        const nextStatus =
          transactionStatusFromResult(
            result
          );

        setReference(
          transactionReferenceFromResult(
            result
          )
        );

        setMessage(
          nextStatus === "pending"
            ? "Your payment has been received and is still being processed."
            : nextStatus === "failed"
              ? "We could not complete this transaction."
              : "Your service purchase was completed successfully."
        );

        setStatus(nextStatus);
      } catch (error: any) {
        setMessage(
          error?.message ||
            "We could not complete this transaction."
        );

        setStatus("failed");
      }
    }, [execute]);

  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true;
      void run();
    }
  }, [run]);

  const copyReference =
    async () => {
      if (!reference) {
        return;
      }

      try {
        await navigator.clipboard.writeText(
          reference
        );

        setCopied(true);

        window.setTimeout(
          () => setCopied(false),
          1600
        );
      } catch {}
    };

  const isProcessing =
    status === "processing";

  const isSuccess =
    status === "success";

  const isPending =
    status === "pending";

  const isFailed =
    status === "failed";

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="sticky top-0 z-20 border-b border-violet-900/20 bg-gradient-to-r from-[#4C1D95] via-[#6D28D9] to-[#2563EB] shadow-md">
  <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3.5">
    <Button
      variant="ghost"
      size="icon"
      onClick={onBack}
      disabled={
        verifyingPin ||
        verifyingIdentifier
      }
      aria-label="Back"
      className="text-white hover:bg-white/15 hover:text-white"
    >
      <ArrowLeft className="h-5 w-5" />
    </Button>

    <div className="min-w-0 text-center">
      <h1 className="truncate text-base font-bold text-white sm:text-lg">
        {serviceTitle}
      </h1>

      <p className="text-[10px] text-violet-100 sm:text-xs">
        Secure service purchase
      </p>
    </div>

    {onHistory ? (
      <Button
        variant="ghost"
        size="sm"
        onClick={onHistory}
        className="text-white hover:bg-white/15 hover:text-white"
      >
        <History className="mr-1.5 h-4 w-4" />
        History
      </Button>
    ) : (
      <span className="w-9" />
    )}
  </div>
</header>

      <main className="mx-auto max-w-3xl px-4 py-6 pb-10">
        <section className="overflow-hidden rounded-[2rem] border bg-white shadow-sm">
          <div className="border-b bg-gradient-to-b from-gray-50 to-white px-5 py-8 text-center sm:px-8">
            <div
              className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full ${
                isFailed
                  ? "bg-red-50 text-red-600"
                  : isPending
                    ? "bg-amber-50 text-amber-600"
                    : "bg-green-50 text-green-600"
              }`}
            >
              {isProcessing ? (
                <Loader2 className="h-9 w-9 animate-spin" />
              ) : isSuccess ? (
                <Check className="h-10 w-10" />
              ) : isPending ? (
                <Clock3 className="h-9 w-9" />
              ) : (
                <XCircle className="h-10 w-10" />
              )}
            </div>

            <p className="mt-5 text-sm font-semibold text-gray-500">
              {isProcessing
                ? "Processing payment"
                : isSuccess
                  ? "Payment successful"
                  : isPending
                    ? "Payment pending"
                    : "Payment failed"}
            </p>

            <h2 className="mt-1 text-2xl font-extrabold tracking-tight">
              {isProcessing
                ? "Please wait..."
                : isSuccess
                  ? "Purchase completed"
                  : isPending
                    ? "We're still processing it"
                    : "We couldn't complete it"}
            </h2>

            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-gray-500">
              {message}
            </p>

            {isProcessing && (
              <div className="mx-auto mt-6 flex max-w-sm items-center justify-center gap-2 rounded-2xl border border-green-100 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
                <LockKeyhole className="h-4 w-4" />
                Securing your transaction...
              </div>
            )}
          </div>

          <div className="space-y-4 p-5 sm:p-7">
            <div className="rounded-2xl border bg-gray-50 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-bold">
                <Receipt className="h-4 w-4" />
                Transaction summary
              </div>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-gray-500">
                    Service
                  </span>

                  <span className="text-right font-semibold">
                    {serviceName}
                  </span>
                </div>

                {customerValue && (
                  <div className="flex justify-between gap-4">
                    <span className="text-gray-500">
                      Customer
                    </span>

                    <span className="max-w-[65%] break-all text-right font-semibold">
                      {customerValue}
                    </span>
                  </div>
                )}

                {itemName && (
                  <div className="flex justify-between gap-4">
                    <span className="text-gray-500">
                      Package
                    </span>

                    <span className="max-w-[65%] text-right font-semibold">
                      {itemName}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between border-t pt-3">
                  <span className="text-gray-500">
                    Amount
                  </span>

                  <span className="text-lg font-extrabold">
                    {naira(amount)}
                  </span>
                </div>
              </div>
            </div>

            {reference && (
              <div className="rounded-2xl border p-4">
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <Sparkles className="h-3.5 w-3.5" />
                  Transaction reference
                </div>

                <div className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-3">
                  <span className="min-w-0 flex-1 break-all text-sm font-semibold">
                    {reference}
                  </span>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      void copyReference()
                    }
                    aria-label="Copy reference"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            )}

            {isPending && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                <div className="flex items-start gap-3">
                  <Clock3 className="mt-0.5 h-5 w-5 shrink-0" />

                  <div>
                    <p className="font-bold">
                      Do not pay again yet
                    </p>

                    <p className="mt-1 leading-6">
                      The transaction has been submitted.
                      Check your transaction history before
                      trying again.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {isFailed && (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                <div className="flex items-start gap-3">
                  <XCircle className="mt-0.5 h-5 w-5 shrink-0" />

                  <div>
                    <p className="font-bold">
                      No successful purchase was confirmed
                    </p>

                    <p className="mt-1 leading-6">
                      You can retry this same transaction.
                      The same idempotency key is reused to
                      prevent accidental duplicate processing.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2 pt-1">
              {isFailed && (
                <Button
                  className="h-12 w-full bg-green-600 font-bold hover:bg-green-700"
                  onClick={() =>
                    void run()
                  }
                >
                  <ArrowUpRight className="mr-2 h-4 w-4" />
                  Retry transaction
                </Button>
              )}

              {!isProcessing && (
                <Button
                  variant={
                    isFailed
                      ? "outline"
                      : "default"
                  }
                  className={`h-12 w-full font-bold ${
                    !isFailed
                      ? "bg-green-600 hover:bg-green-700"
                      : ""
                  }`}
                  onClick={onDone}
                >
                  {isPending
                    ? "Continue to Services"
                    : "Done"}
                </Button>
              )}
            </div>

            <p className="flex items-center justify-center gap-1.5 text-center text-xs text-gray-400">
              <ShieldCheck className="h-3.5 w-3.5" />
              Your payment is protected by IyanjuPay's
              secure transaction flow.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}

export default function ServicePayment({
  service,
  walletBalance,
  onBack,
  onHistory,
  onPurchase,
}: ServicePaymentProps) {
  const { toast } = useToast();

  const rawServiceType =
    clean(service?.type).toLowerCase();

  const serviceType =
    normaliseServiceType(
      rawServiceType
    );

  const serviceTitle =
    displayServiceTitle(service);

  const serviceFunction =
    CLUBKONNECT_SERVICES.has(
      serviceType
    )
      ? "clubkonnect-services"
      : "flutterwave-bills";

  const isAirtime =
    serviceType === "airtime";

  const isData =
    serviceType === "data";

  const isCable =
    serviceType === "cable";

  const isElectricity =
    serviceType === "electricity";

  const isJamb =
    serviceType === "jamb";

  const isEpin =
    serviceType === "airtime-card" ||
    serviceType === "data-card";

  const isAmountOnly =
    isAirtime ||
    isElectricity;

  const requiresIdentifierVerification =
    isCable ||
    isElectricity ||
    isJamb;

  const [
    billers,
    setBillers,
  ] = useState<Biller[]>([]);

  const [
    items,
    setItems,
  ] = useState<Item[]>([]);

  const [
    selectedBillerCode,
    setSelectedBillerCode,
  ] = useState("");

  const [
    selectedItemCode,
    setSelectedItemCode,
  ] = useState("");

  const [
    customer,
    setCustomer,
  ] = useState("");

  const [
    profileCode,
    setProfileCode,
  ] = useState("");

  const [
    amount,
    setAmount,
  ] = useState("");

  const [
    meterType,
    setMeterType,
  ] = useState("");

  const [
    dataTab,
    setDataTab,
  ] = useState<DataTab>(
    "HOT DEALS"
  );

  const [
    customAmount,
    setCustomAmount,
  ] = useState(false);

  const [
    loadingBillers,
    setLoadingBillers,
  ] = useState(false);

  const [
    loadingItems,
    setLoadingItems,
  ] = useState(false);

  const [
    verifyingIdentifier,
    setVerifyingIdentifier,
  ] = useState(false);

  const [
    verified,
    setVerified,
  ] = useState(false);

  const [
    verifiedName,
    setVerifiedName,
  ] = useState("");

  const [
    showPin,
    setShowPin,
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
    processingSession,
    setProcessingSession,
  ] =
    useState<ProcessingSession | null>(
      null
    );

  const [
    error,
    setError,
  ] = useState("");

  const selectedBiller =
    useMemo(
      () =>
        billers.find(
          (b) =>
            getCode(b) ===
            selectedBillerCode
        ) ?? null,
      [
        billers,
        selectedBillerCode,
      ]
    );

  const selectedItem =
    useMemo(
      () =>
        items.find(
          (i) =>
            getItemCode(i) ===
            selectedItemCode
        ) ?? null,
      [
        items,
        selectedItemCode,
      ]
    );

  const customerLabel =
    isAirtime || isData
      ? "Phone Number"
      : isCable
        ? "SmartCard / IUC Number"
        : isElectricity
          ? "Meter Number"
          : isJamb
            ? "Phone Number"
            : isEpin
              ? "Phone Number"
              : "Customer Number";

  const customerPlaceholder =
    isAirtime ||
    isData ||
    isJamb ||
    isEpin
      ? "e.g. 08012345678"
      : isCable
        ? "Enter SmartCard / IUC number"
        : isElectricity
          ? "Enter meter number"
          : "Enter customer number";

  const resetVerification =
    useCallback(() => {
      setVerified(false);
      setVerifiedName("");
    }, []);

  const resetForm =
    useCallback(() => {
      setBillers([]);
      setItems([]);
      setSelectedBillerCode("");
      setSelectedItemCode("");
      setCustomer("");
      setProfileCode("");
      setAmount("");
      setMeterType("");
      setCustomAmount(false);
      setDataTab("HOT DEALS");
      resetVerification();
      setError("");
      setShowPin(false);
      setPaymentPin("");
    }, [resetVerification]);

  useEffect(() => {
    resetForm();
  }, [
    serviceType,
    resetForm,
  ]);

  const invoke =
    useCallback(
      async (
        body: Record<string, any>
      ) => {
        const {
          data,
          error: fnError,
        } =
          await supabase.functions.invoke(
            serviceFunction,
            {
              body,
            }
          );

        if (fnError) {
          throw new Error(
            fnError.message ||
              "Service request failed."
          );
        }

        if (
          !data ||
          data.success !== true
        ) {
          throw new Error(
            data?.error ||
              "Service request failed."
          );
        }

        return data;
      },
      [serviceFunction]
    );

  /**
   * Load service options/networks.
   *
   * The important part is that the live catalogue is merged
   * with canonical fallbacks. For Data this guarantees:
   *
   * MTN
   * Glo
   * 9mobile
   * Airtel
   */
  const loadBillers =
    useCallback(async () => {
      if (!serviceType) {
        return;
      }

      setLoadingBillers(true);
      setError("");

      try {
        const data =
          await invoke({
            action: "billers",
            service: serviceType,
            country: "NG",
          });

        const loaded =
          firstArray(
            data.billers,
            data.networks,
            data.providers,
            data.cableProviders,
            data.electricityCompanies,
            data.examTypes
          );

        const merged =
          mergeBillers(
            serviceType,
            loaded
          );

        setBillers(merged);

        if (
          !merged.length &&
          !isAmountOnly
        ) {
          setError(
            "No service options are currently available."
          );
        }
      } catch (e: any) {
        const message =
          e?.message ||
          "Unable to load service options.";

        setError(message);

        toast({
          title:
            "Unable to load services",
          description: message,
          variant:
            "destructive",
        });
      } finally {
        setLoadingBillers(false);
      }
    }, [
      invoke,
      isAmountOnly,
      serviceType,
      toast,
    ]);

  useEffect(() => {
    void loadBillers();
  }, [loadBillers]);

  /**
   * THIS IS THE OTHER CRITICAL PART.
   *
   * Every selected network gets its own items request using the
   * selected network's exact code.
   *
   * Airtel therefore gets:
   *
   * biller_code: "04"
   *
   * when ClubKonnect returns Airtel as network_code "04".
   */
  const loadItems =
    useCallback(
      async (
        billerCode: string
      ) => {
        if (!billerCode) {
          return;
        }

        setLoadingItems(true);
        setError("");
        setItems([]);
        setSelectedItemCode("");

        if (
          !isData &&
          !isJamb
        ) {
          setAmount("");
        }

        try {
          const data =
            await invoke({
              action: "items",
              service: serviceType,
              biller_code:
                billerCode,
              country: "NG",

              ...(isElectricity
                ? {
                    meter_type:
                      meterType ||
                      undefined,
                  }
                : {}),

              ...(isJamb
                ? {
                    exam_type:
                      billerCode,
                  }
                : {}),
            });

          const loaded =
            firstArray(
              data.items,
              data.plans,
              data.packages,
              data.data,
              data.catalog,
              data.products,
              data.results
            );

          setItems(loaded);

          /**
           * Always return to HOT DEALS when the user chooses
           * another network.
           */
          if (isData) {
            setDataTab("HOT DEALS");
          }

          if (
            !loaded.length &&
            !isAmountOnly
          ) {
            setError(
              "No packages are currently available for this option."
            );
          }
        } catch (e: any) {
          const message =
            e?.message ||
            "Unable to load packages.";

          setError(message);

          toast({
            title:
              "Unable to load packages",
            description: message,
            variant:
              "destructive",
          });
        } finally {
          setLoadingItems(false);
        }
      },
      [
        invoke,
        isAmountOnly,
        isData,
        isElectricity,
        isJamb,
        meterType,
        serviceType,
        toast,
      ]
    );

  /**
   * Select network/company/TV provider.
   */
  const handleBillerSelect =
    async (
      code: string
    ) => {
      if (
        processingSession ||
        verifyingPin
      ) {
        return;
      }

      setSelectedBillerCode(code);
      setSelectedItemCode("");
      setItems([]);
      setAmount("");
      setCustomer("");
      setCustomAmount(false);
      resetVerification();
      setError("");

      /**
       * Cable, JAMB and Electricity require verification
       * before their packages/amounts are loaded.
       */
      if (
        isCable ||
        isJamb ||
        isElectricity
      ) {
        return;
      }

      await loadItems(code);
    };

  const handleMeterType =
    (value: string) => {
      setMeterType(value);
      setCustomer("");
      setProfileCode("");
      setAmount("");
      resetVerification();
    };

  /**
   * Verify:
   *
   * Cable -> SmartCard/IUC
   * Electricity -> Meter
   * JAMB -> Profile Code
   */
  const verifyIdentifier =
    async () => {
      if (!selectedBillerCode) {
        toast({
          title:
            "Select an option",
          description:
            "Select the service option first.",
          variant:
            "destructive",
        });

        return;
      }

      if (isJamb) {
        if (!profileCode.trim()) {
          toast({
            title:
              "Profile Code required",
            description:
              "Enter your JAMB Profile Code.",
            variant:
              "destructive",
          });

          return;
        }
      } else if (!customer.trim()) {
        toast({
          title:
            "Number required",
          description: `Enter your ${customerLabel.toLowerCase()}.`,
          variant:
            "destructive",
        });

        return;
      }

      setVerifyingIdentifier(true);
      setError("");

      try {
        const data =
          await invoke(
            isCable
              ? {
                  action:
                    "verify_smartcard",
                  service:
                    "cable",
                  biller_code:
                    selectedBillerCode,
                  smartcard_number:
                    customer.trim(),
                  smartCardNumber:
                    customer.trim(),
                }
              : isElectricity
                ? {
                    action:
                      "verify_meter",
                    service:
                      "electricity",
                    biller_code:
                      selectedBillerCode,
                    electric_company:
                      selectedBillerCode,
                    meter_number:
                      customer.trim(),
                    meterNumber:
                      customer.trim(),
                    meter_type:
                      meterType,
                  }
                : {
                    action:
                      "verify_profile",
                    service:
                      "jamb",
                    exam_type:
                      selectedBillerCode,
                    profile_code:
                      profileCode.trim(),
                    profileCode:
                      profileCode.trim(),
                  }
          );

        setVerified(true);

        setVerifiedName(
          clean(
            data.customer_name ??
              data.customerName
          )
        );

        toast({
          title: "Verified",
          description:
            data.message ||
            "The number was verified successfully.",
        });

        /**
         * Packages are loaded ONLY after successful
         * Cable/JAMB verification.
         */
        if (
          isCable ||
          isJamb
        ) {
          await loadItems(
            selectedBillerCode
          );
        }
      } catch (e: any) {
        setVerified(false);
        setVerifiedName("");

        const message =
          e?.message ||
          "Unable to verify the number.";

        setError(message);

        toast({
          title:
            "Verification failed",
          description: message,
          variant:
            "destructive",
        });
      } finally {
        setVerifyingIdentifier(
          false
        );
      }
    };

  function normalisePhone(
    value: string
  ): string {
    const v = clean(value).replace(
      /\s+/g,
      ""
    );

    if (/^0\d{10}$/.test(v)) {
      return `+234${v.slice(1)}`;
    }

    if (/^\d{10}$/.test(v)) {
      return `+234${v}`;
    }

    if (/^234\d{10}$/.test(v)) {
      return `+${v}`;
    }

    return v;
  }

  const handleItemSelect =
    (item: Item) => {
      const code =
        getItemCode(item);

      const price =
        getItemPrice(item);

      if (!code) {
        return;
      }

      if (price <= 0) {
        toast({
          title:
            "Unavailable price",
          description:
            "This package does not have a valid selling price.",
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

  const amountMinimum =
    num(
      selectedItem?.minimum ??
        selectedItem?.min_amount ??
        selectedItem?.minAmount
    );

  const amountMaximum =
    num(
      selectedItem?.maximum ??
        selectedItem?.max_amount ??
        selectedItem?.maxAmount
    );

  /**
   * HOT DEAL DISPLAY LOGIC
   *
   * This is the exact behavior that made the old version useful:
   *
   * - remove variable entries
   * - find explicitly/implicitly hot plans
   * - HOT DEALS returns hot plans when available
   * - otherwise return all available plans
   *
   * Therefore the HOT DEALS tab doesn't become blank simply
   * because ClubKonnect failed to mark a plan as hot.
   */
  const visibleDataPlans =
    useMemo(() => {
      if (!isData) {
        return [];
      }

      const available =
        items.filter(
          (item) =>
            !isVariable(item)
        );

      const hot =
        available.filter(
          (item) =>
            isHot(item)
        );

      if (
        dataTab ===
        "HOT DEALS"
      ) {
        return hot.length
          ? hot
          : available;
      }

      return available.filter(
        (item) =>
          planGroup(item) ===
          dataTab
      );
    }, [
      dataTab,
      isData,
      items,
    ]);

  const meterTypes =
    useMemo(() => {
      const nested =
        firstArray(
          selectedBiller?.serviceProviders,
          selectedBiller?.meterTypes,
          selectedBiller?.meter_types
        );

      return nested;
    }, [selectedBiller]);

  useEffect(() => {
    if (
      isElectricity &&
      selectedBiller &&
      meterTypes.length &&
      !meterType
    ) {
      setMeterType(
        getCode(
          meterTypes[0]
        )
      );
    }
  }, [
    isElectricity,
    meterType,
    meterTypes,
    selectedBiller,
  ]);

  const canEnterAmount =
    isAirtime ||
    isElectricity;

  const needsItem =
    !canEnterAmount;

  const hasRequiredIdentifier =
    isCable ||
    isElectricity
      ? verified
      : isJamb
        ? verified &&
          !!customer.trim()
        : !!customer.trim();

  const hasAmount =
    num(amount) > 0;

  const hasItem =
    !needsItem ||
    !!selectedItemCode;

  const canPurchase =
    !!selectedBillerCode &&
    hasRequiredIdentifier &&
    hasAmount &&
    hasItem &&
    !loadingItems &&
    !verifyingIdentifier &&
    !processingSession;

  const validateBeforePin =
    () => {
      if (!selectedBillerCode) {
        return "Please select the service option.";
      }

      if (
        requiresIdentifierVerification &&
        !verified
      ) {
        return "Please verify the number before continuing.";
      }

      if (
        !hasRequiredIdentifier
      ) {
        return isJamb
          ? "Please verify your JAMB Profile Code first."
          : `Please enter the ${customerLabel.toLowerCase()}.`;
      }

      if (
        needsItem &&
        !selectedItemCode
      ) {
        return "Please select a package.";
      }

      if (!hasAmount) {
        return "Please select or enter a valid amount.";
      }

      if (
        isData &&
        selectedItem &&
        Math.abs(
          num(amount) -
            getItemPrice(
              selectedItem
            )
        ) > 0.01
      ) {
        return "The selected data plan price is no longer valid.";
      }

      if (
        amountMinimum > 0 &&
        num(amount) <
          amountMinimum
      ) {
        return `Minimum amount is ${naira(
          amountMinimum
        )}.`;
      }

      if (
        amountMaximum > 0 &&
        num(amount) >
          amountMaximum
      ) {
        return `Maximum amount is ${naira(
          amountMaximum
        )}.`;
      }

      if (
        num(amount) >
        num(walletBalance)
      ) {
        return "Insufficient wallet balance.";
      }

      if (
        (
          isAirtime ||
          isData ||
          isJamb ||
          isEpin
        ) &&
        !/^\+234\d{10}$/.test(
          normalisePhone(
            customer
          )
        )
      ) {
        return "Enter a valid Nigerian phone number.";
      }

      return "";
    };

  const buildDetails =
    () => {
      const phone =
        (
          isAirtime ||
          isData ||
          isJamb ||
          isEpin
        )
          ? normalisePhone(
              customer
            )
          : "";

      return {
        customer:
          phone ||
          customer.trim(),

        biller_code:
          selectedBillerCode,

        billerCode:
          selectedBillerCode,

        item_code:
          selectedItemCode,

        itemCode:
          selectedItemCode,

        phoneNumber:
          phone,

        phone,

        meterNumber:
          isElectricity
            ? customer.trim()
            : "",

        meter_number:
          isElectricity
            ? customer.trim()
            : "",

        meterType:
          isElectricity
            ? meterType
            : "",

        meter_type:
          isElectricity
            ? meterType
            : "",

        smartCardNumber:
          isCable
            ? customer.trim()
            : "",

        smartcardNumber:
          isCable
            ? customer.trim()
            : "",

        smartcard_number:
          isCable
            ? customer.trim()
            : "",

        profileCode:
          isJamb
            ? profileCode.trim()
            : "",

        profile_code:
          isJamb
            ? profileCode.trim()
            : "",

        examType:
          isJamb
            ? selectedBillerCode
            : "",

        exam_type:
          isJamb
            ? selectedBillerCode
            : "",

        type:
          serviceType,

        service:
          serviceType,

        country: "NG",

        selling_amount:
          num(amount),

        amount:
          num(amount),

        item:
          selectedItem,

        biller:
          selectedBiller,

        customer_name:
          verifiedName,

        verified,

        plan_type:
          isData
            ? clean(
                selectedItem?.plan_type ??
                  selectedItem?.planType
              )
            : "",

        is_hot_deal:
          isData
            ? isHot(
                selectedItem ?? {}
              )
            : false,
      };
    };

  const startPurchase =
    () => {
      const validationError =
        validateBeforePin();

      if (validationError) {
        toast({
          title:
            "Check your details",
          description:
            validationError,
          variant:
            "destructive",
        });

        return;
      }

      setPaymentPin("");
      setError("");
      setShowPin(true);
    };

  const confirmPurchase =
    async () => {
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

      setVerifyingPin(true);
      setError("");

      try {
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
          throw new Error(
            "Unable to verify payment PIN."
          );
        }

        if (!data?.success) {
          throw new Error(
            data?.message ||
              "Invalid payment PIN."
          );
        }

        const idempotencyKey =
          createIdempotencyKey();

        const details = {
          ...buildDetails(),

          idempotency_key:
            idempotencyKey,

          idempotencyKey,

          service_title:
            serviceTitle,
        };

        setShowPin(false);
        setPaymentPin("");

        setProcessingSession({
          amount: num(amount),
          details,
          idempotencyKey,
        });
      } catch (e: any) {
        const message =
          e?.message ||
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
      }
    };

  const executePurchase =
    useCallback(async () => {
      if (!processingSession) {
        return;
      }

      /**
       * We intentionally let the existing Dashboard/onPurchase
       * orchestration perform the actual purchase.
       *
       * This prevents ServicePayment from independently invoking
       * ClubKonnect and accidentally creating two purchases.
       */
      return await onPurchase(
        processingSession.amount,
        processingSession.details
      );
    }, [
      onPurchase,
      processingSession,
    ]);

  const renderBillerCard =
    (biller: Biller) => {
      const code =
        getCode(biller);

      if (!code) {
        return null;
      }

      const name =
        getName(biller) ||
        code;

      const selected =
        code ===
        selectedBillerCode;

      const logo =
        clean(
          biller.logo_url ??
            biller.logoUrl ??
            biller.logo
        ) ||
        providerLogo(
          name,
          code
        );

      return (
        <button
          key={`${code}-${name}`}
          type="button"
          onClick={() =>
            void handleBillerSelect(
              code
            )
          }
          disabled={
            loadingBillers ||
            !!processingSession ||
            verifyingPin
          }
          className={`flex min-w-[94px] flex-col items-center gap-2 rounded-2xl border bg-white p-3 transition ${
            selected
              ? "border-green-600 ring-2 ring-green-100"
              : "border-gray-200 hover:border-green-400"
          }`}
        >
          <span className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border bg-gray-50 text-sm font-bold text-gray-600">
            {logo ? (
              <img
                src={logo}
                alt=""
                aria-hidden="true"
                className="h-full w-full object-contain p-2"
                loading="eager"
                referrerPolicy="no-referrer"
                onError={(
                  event
                ) => {
                  event.currentTarget.style.display =
                    "none";
                }}
              />
            ) : (
              initials(name)
            )}
          </span>

          <span className="max-w-[78px] truncate text-xs font-semibold text-gray-800">
            {name}
          </span>
        </button>
      );
    };

  const renderPlan =
    (item: Item) => {
      const code =
        getItemCode(item);

      const price =
        getItemPrice(item);

      if (!code) {
        return null;
      }

      const selected =
        code ===
        selectedItemCode;

      const hot =
        isHot(item);

      const providerPrice =
        getProviderPrice(item);

      return (
        <button
          key={code}
          type="button"
          onClick={() =>
            handleItemSelect(item)
          }
          disabled={
            !!processingSession ||
            verifyingPin ||
            loadingItems
          }
          className={`relative rounded-2xl border bg-white p-4 text-left transition ${
            selected
              ? "border-green-600 ring-2 ring-green-100"
              : "border-gray-200 hover:border-green-400"
          }`}
        >
          {hot && (
            <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-1 text-[10px] font-bold text-orange-600">
              <Flame className="h-3 w-3" />
              HOT
            </span>
          )}

          {selected && (
            <span className="absolute left-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-green-600 text-white">
              <Check className="h-3 w-3" />
            </span>
          )}

          <div
            className={
              selected
                ? "pr-12 pl-7"
                : "pr-12"
            }
          >
            <div className="text-sm font-bold text-gray-900">
              {getPlanName(item)}
            </div>

            <div className="mt-2 text-lg font-extrabold text-green-700">
              {naira(price)}
            </div>

            {providerPrice > 0 &&
              providerPrice !==
                price && (
                <div className="mt-1 text-xs text-gray-400">
                  Provider price:{" "}
                  {naira(
                    providerPrice
                  )}
                </div>
              )}

            {item.validity_days ||
            item.validity ||
            item.duration ? (
              <div className="mt-1 text-xs text-gray-500">
                {clean(
                  item.validity ??
                    item.duration ??
                    `${item.validity_days} days`
                )}
              </div>
            ) : null}
          </div>
        </button>
      );
    };

  if (!service) {
    return null;
  }

  if (processingSession) {
    return (
      <ServiceTransactionProcessing
        amount={
          processingSession.amount
        }
        details={
          processingSession.details
        }
        execute={
          executePurchase
        }
        onDone={() => {
          setProcessingSession(
            null
          );
          resetForm();
        }}
        onBack={() => {
          setProcessingSession(
            null
          );
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="sticky top-0 z-20 border-b bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            disabled={
              verifyingPin ||
              verifyingIdentifier
            }
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>

          <div className="min-w-0 text-center">
            <h1 className="truncate text-base font-bold sm:text-lg">
              {serviceTitle}
            </h1>

            <p className="text-[10px] text-gray-500 sm:text-xs">
              Secure service purchase
            </p>
          </div>

          {onHistory ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onHistory}
            >
              <History className="mr-1.5 h-4 w-4" />
              History
            </Button>
          ) : (
            <span className="w-9" />
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-5 pb-10">
        {showPin ? (
          <section className="rounded-3xl border bg-white p-6 shadow-sm">
            <div className="mx-auto max-w-sm text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-50 text-green-700">
                <ShieldCheck className="h-7 w-7" />
              </div>

              <h2 className="text-xl font-bold">
                Confirm payment
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Enter your 4-digit payment PIN
                to continue.
              </p>

              <div className="mt-6">
                <Input
                  autoFocus
                  inputMode="numeric"
                  maxLength={4}
                  type="password"
                  value={paymentPin}
                  onChange={(e) =>
                    setPaymentPin(
                      e.target.value
                        .replace(
                          /\D/g,
                          ""
                        )
                        .slice(0, 4)
                    )
                  }
                  onKeyDown={(e) => {
                    if (
                      e.key ===
                      "Enter"
                    ) {
                      void confirmPurchase();
                    }
                  }}
                  placeholder="••••"
                  className="h-14 text-center text-2xl tracking-[0.5em]"
                  disabled={
                    verifyingPin
                  }
                />
              </div>

              {error && (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="mt-5 space-y-2">
                <Button
                  className="h-12 w-full bg-green-600 hover:bg-green-700"
                  onClick={() =>
                    void confirmPurchase()
                  }
                  disabled={
                    verifyingPin ||
                    paymentPin.length !==
                      4
                  }
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
                  variant="outline"
                  className="h-12 w-full"
                  onClick={() =>
                    setShowPin(false)
                  }
                  disabled={
                    verifyingPin
                  }
                >
                  Back
                </Button>
              </div>
            </div>
          </section>
        ) : (
          <>
            {/* SERVICE PROVIDERS / NETWORKS */}
            <section className="rounded-3xl border bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold">
                    Choose service option
                  </h2>

                  <p className="text-xs text-gray-500">
                    Select the network, company
                    or TV service you want.
                  </p>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    void loadBillers()
                  }
                  disabled={
                    loadingBillers
                  }
                >
                  <RefreshCw
                    className={`mr-1.5 h-4 w-4 ${
                      loadingBillers
                        ? "animate-spin"
                        : ""
                    }`}
                  />
                  Refresh
                </Button>
              </div>

              {loadingBillers ? (
                <div className="flex items-center justify-center py-8 text-sm text-gray-500">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading service options...
                </div>
              ) : billers.length ? (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                  {billers.map(
                    renderBillerCard
                  )}
                </div>
              ) : (
                <div className="rounded-2xl bg-gray-50 p-5 text-center text-sm text-gray-500">
                  No service options available
                  right now.
                </div>
              )}
            </section>

            {/* ELECTRICITY METER TYPE */}
            {isElectricity &&
              selectedBiller && (
                <section className="rounded-3xl border bg-white p-5 shadow-sm">
                  <Label className="text-sm font-bold">
                    Meter Type
                  </Label>

                  {meterTypes.length ? (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {meterTypes.map(
                        (
                          meter: Biller
                        ) => {
                          const code =
                            getCode(
                              meter
                            );

                          const name =
                            getName(
                              meter
                            );

                          return (
                            <button
                              key={
                                code
                              }
                              type="button"
                              onClick={() =>
                                handleMeterType(
                                  code
                                )
                              }
                              className={`rounded-xl border p-3 text-sm font-semibold ${
                                meterType ===
                                code
                                  ? "border-green-600 bg-green-50 text-green-700"
                                  : "border-gray-200"
                              }`}
                            >
                              {name}
                            </button>
                          );
                        }
                      )}
                    </div>
                  ) : (
                    <select
                      value={
                        meterType
                      }
                      onChange={(e) =>
                        handleMeterType(
                          e.target.value
                        )
                      }
                      className="mt-2 h-11 w-full rounded-xl border bg-white px-3 text-sm"
                    >
                      <option value="">
                        Select meter type
                      </option>

                      <option value="PREPAID">
                        Prepaid
                      </option>

                      <option value="POSTPAID">
                        Postpaid
                      </option>
                    </select>
                  )}
                </section>
              )}

            {/* CABLE / ELECTRICITY / JAMB VERIFICATION */}
            {(isCable ||
              isElectricity ||
              isJamb) &&
              selectedBillerCode && (
                <section className="rounded-3xl border bg-white p-5 shadow-sm">
                  <Label className="text-sm font-bold">
                    {isJamb
                      ? "JAMB Profile Code"
                      : customerLabel}
                  </Label>

                  {isJamb ? (
                    <>
                      <Input
                        value={
                          profileCode
                        }
                        onChange={(e) => {
                          setProfileCode(
                            e.target
                              .value
                          );

                          resetVerification();
                        }}
                        placeholder="Enter JAMB Profile Code"
                        className="mt-2 h-12"
                      />

                      <Label className="mt-4 block text-sm font-bold">
                        Phone Number
                      </Label>

                      <Input
                        value={
                          customer
                        }
                        onChange={(e) => {
                          setCustomer(
                            e.target.value
                          );

                          resetVerification();
                        }}
                        placeholder="e.g. 08012345678"
                        inputMode="tel"
                        className="mt-2 h-12"
                      />
                    </>
                  ) : (
                    <Input
                      value={
                        customer
                      }
                      onChange={(e) => {
                        setCustomer(
                          e.target.value.replace(
                            /\s+/g,
                            ""
                          )
                        );

                        resetVerification();
                      }}
                      placeholder={
                        customerPlaceholder
                      }
                      inputMode="numeric"
                      className="mt-2 h-12"
                    />
                  )}

                  <Button
                    className="mt-3 h-11 w-full bg-gray-900 hover:bg-gray-800"
                    onClick={() =>
                      void verifyIdentifier()
                    }
                    disabled={
                      verifyingIdentifier ||
                      (isElectricity &&
                        !meterType) ||
                      verified
                    }
                  >
                    {verifyingIdentifier ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Verifying...
                      </>
                    ) : verified ? (
                      <>
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Verified
                      </>
                    ) : (
                      "Verify"
                    )}
                  </Button>

                  {verified && (
                    <div className="mt-3 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                      <CheckCircle2 className="h-4 w-4 shrink-0" />

                      <span>
                        {verifiedName
                          ? `Verified: ${verifiedName}`
                          : "Number verified successfully."}
                      </span>
                    </div>
                  )}
                </section>
              )}

            {/* PHONE NUMBER FOR AIRTIME/DATA/EPIN */}
            {(isAirtime ||
              isData ||
              isEpin) &&
              selectedBillerCode && (
                <section className="rounded-3xl border bg-white p-5 shadow-sm">
                  <Label className="text-sm font-bold">
                    Phone Number
                  </Label>

                  <Input
                    value={
                      customer
                    }
                    onChange={(e) => {
                      setCustomer(
                        e.target.value
                      );

                      resetVerification();
                    }}
                    placeholder="e.g. 08012345678"
                    inputMode="tel"
                    className="mt-2 h-12"
                    disabled={
                      !!processingSession
                    }
                  />
                </section>
              )}

            {/* DATA PLANS */}
            {isData &&
              selectedBillerCode && (
                <section className="rounded-3xl border bg-white p-4 shadow-sm">
                  <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
                    {DATA_TABS.map(
                      (tab) => (
                        <button
                          key={tab}
                          type="button"
                          onClick={() =>
                            setDataTab(
                              tab
                            )
                          }
                          disabled={
                            loadingItems ||
                            !!processingSession
                          }
                          className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold ${
                            dataTab ===
                            tab
                              ? "bg-green-600 text-white"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {tab ===
                            "HOT DEALS" && (
                            <Flame className="mr-1 inline h-3.5 w-3.5" />
                          )}

                          {tab}
                        </button>
                      )
                    )}
                  </div>

                  {loadingItems ? (
                    <div className="flex items-center justify-center py-8 text-sm text-gray-500">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Loading data plans...
                    </div>
                  ) : visibleDataPlans.length ? (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {visibleDataPlans.map(
                        renderPlan
                      )}
                    </div>
                  ) : (
                    <div className="rounded-2xl bg-gray-50 p-5 text-center text-sm text-gray-500">
                      No plans in this category.
                    </div>
                  )}
                </section>
              )}

            {/* CABLE PACKAGES */}
            {isCable &&
              verified &&
              selectedBillerCode && (
                <section className="rounded-3xl border bg-white p-5 shadow-sm">
                  <div className="mb-3">
                    <h2 className="text-sm font-bold">
                      Choose Package
                    </h2>

                    <p className="text-xs text-gray-500">
                      Select your preferred cable package.
                    </p>
                  </div>

                  {loadingItems ? (
                    <div className="flex items-center justify-center py-8 text-sm text-gray-500">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Loading packages...
                    </div>
                  ) : items.filter(
                      (item) =>
                        !isVariable(
                          item
                        )
                    ).length ? (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {items
                        .filter(
                          (item) =>
                            !isVariable(
                              item
                            )
                        )
                        .map(
                          renderPlan
                        )}
                    </div>
                  ) : (
                    <div className="rounded-2xl bg-gray-50 p-5 text-center text-sm text-gray-500">
                      No cable packages available.
                    </div>
                  )}
                </section>
              )}

            {/* E-PIN PACKAGES */}
            {isEpin &&
              selectedBillerCode && (
                <section className="rounded-3xl border bg-white p-5 shadow-sm">
                  <div className="mb-3">
                    <h2 className="text-sm font-bold">
                      Choose Denomination
                    </h2>

                    <p className="text-xs text-gray-500">
                      Select the recharge card value.
                    </p>
                  </div>

                  {loadingItems ? (
                    <div className="flex items-center justify-center py-8 text-sm text-gray-500">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Loading denominations...
                    </div>
                  ) : items.filter(
                      (item) =>
                        !isVariable(
                          item
                        )
                    ).length ? (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {items
                        .filter(
                          (item) =>
                            !isVariable(
                              item
                            )
                        )
                        .map(
                          renderPlan
                        )}
                    </div>
                  ) : (
                    <div className="rounded-2xl bg-gray-50 p-5 text-center text-sm text-gray-500">
                      No denominations available.
                    </div>
                  )}
                </section>
              )}

            {/* JAMB PACKAGES */}
            {isJamb &&
              verified &&
              selectedBillerCode && (
                <section className="rounded-3xl border bg-white p-5 shadow-sm">
                  <div className="mb-3">
                    <h2 className="text-sm font-bold">
                      JAMB Package
                    </h2>

                    <p className="text-xs text-gray-500">
                      Select the available JAMB package.
                    </p>
                  </div>

                  {loadingItems ? (
                    <div className="flex items-center justify-center py-8 text-sm text-gray-500">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Loading JAMB package...
                    </div>
                  ) : items.filter(
                      (item) =>
                        !isVariable(
                          item
                        )
                    ).length ? (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {items
                        .filter(
                          (item) =>
                            !isVariable(
                              item
                            )
                        )
                        .map(
                          renderPlan
                        )}
                    </div>
                  ) : (
                    <div className="rounded-2xl bg-gray-50 p-5 text-center text-sm text-gray-500">
                      No JAMB packages available.
                    </div>
                  )}
                </section>
              )}

            {/* SMILE / WAEC */}
            {(serviceType ===
              "smile" ||
              serviceType ===
                "waec") &&
              selectedBillerCode && (
                <section className="rounded-3xl border bg-white p-5 shadow-sm">
                  <div className="mb-3">
                    <h2 className="text-sm font-bold">
                      Choose Package
                    </h2>

                    <p className="text-xs text-gray-500">
                      Select the package you want.
                    </p>
                  </div>

                  {loadingItems ? (
                    <div className="flex items-center justify-center py-8 text-sm text-gray-500">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Loading packages...
                    </div>
                  ) : items.length ? (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {items
                        .filter(
                          (item) =>
                            !isVariable(
                              item
                            )
                        )
                        .map(
                          renderPlan
                        )}
                    </div>
                  ) : (
                    <div className="rounded-2xl bg-gray-50 p-5 text-center text-sm text-gray-500">
                      No packages available.
                    </div>
                  )}
                </section>
              )}

            {/* AIRTIME AMOUNT */}
            {isAirtime &&
              selectedBillerCode && (
                <section className="rounded-3xl border bg-white p-5 shadow-sm">
                  <div className="mb-3">
                    <h2 className="text-sm font-bold">
                      Enter amount
                    </h2>

                    <p className="text-xs text-gray-500">
                      Choose an amount or enter a custom amount.
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {AIRTIME_AMOUNTS.map(
                      (value) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => {
                            setAmount(
                              String(
                                value
                              )
                            );
                            setCustomAmount(
                              false
                            );
                          }}
                          className={`rounded-xl border p-3 text-sm font-bold ${
                            amount ===
                              String(
                                value
                              ) &&
                            !customAmount
                              ? "border-green-600 bg-green-50 text-green-700"
                              : "border-gray-200"
                          }`}
                        >
                          {naira(
                            value
                          )}
                        </button>
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
                      className={`rounded-xl border p-3 text-sm font-bold ${
                        customAmount
                          ? "border-green-600 bg-green-50 text-green-700"
                          : "border-gray-200"
                      }`}
                    >
                      Custom
                    </button>
                  </div>

                  {customAmount && (
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      value={
                        amount
                      }
                      onChange={(e) =>
                        setAmount(
                          e.target
                            .value
                        )
                      }
                      placeholder="Enter amount"
                      className="mt-3 h-12"
                    />
                  )}
                </section>
              )}

            {/* ELECTRICITY AMOUNT */}
            {isElectricity &&
              verified &&
              selectedBillerCode && (
                <section className="rounded-3xl border bg-white p-5 shadow-sm">
                  <div className="mb-3">
                    <h2 className="text-sm font-bold">
                      Enter amount
                    </h2>

                    <p className="text-xs text-gray-500">
                      Choose an amount or enter a custom amount.
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {BILL_AMOUNTS.map(
                      (value) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => {
                            setAmount(
                              String(
                                value
                              )
                            );
                            setCustomAmount(
                              false
                            );
                          }}
                          className={`rounded-xl border p-3 text-sm font-bold ${
                            amount ===
                              String(
                                value
                              ) &&
                            !customAmount
                              ? "border-green-600 bg-green-50 text-green-700"
                              : "border-gray-200"
                          }`}
                        >
                          {naira(
                            value
                          )}
                        </button>
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
                      className={`rounded-xl border p-3 text-sm font-bold ${
                        customAmount
                          ? "border-green-600 bg-green-50 text-green-700"
                          : "border-gray-200"
                      }`}
                    >
                      Custom
                    </button>
                  </div>

                  {customAmount && (
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      value={
                        amount
                      }
                      onChange={(e) =>
                        setAmount(
                          e.target
                            .value
                        )
                      }
                      placeholder="Enter amount"
                      className="mt-3 h-12"
                    />
                  )}
                </section>
              )}

            {error && (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {error}
              </div>
            )}

            {/* PAYMENT ACTION */}
            <section className="rounded-3xl border bg-white p-5 shadow-sm">
              <Button
                className="h-12 w-full bg-green-600 text-base font-bold hover:bg-green-700"
                onClick={
                  startPurchase
                }
                disabled={
                  !canPurchase
                }
              >
                {`Continue to Pay ${
                  hasAmount
                    ? naira(
                        amount
                      )
                    : ""
                }`}
              </Button>

              <p className="mt-3 text-center text-xs text-gray-500">
                Your payment PIN is required
                before the purchase is processed.
              </p>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
