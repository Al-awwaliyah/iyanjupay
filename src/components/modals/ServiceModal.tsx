import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Loader2, Smartphone, Zap, Tv, Wifi } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

/**
 * ============================================================
 * TYPES
 * ============================================================
 */

type ServiceType =
  | "airtime"
  | "data"
  | "electricity"
  | "cable"
  | "internet";

type PlanPeriod =
  | "daily"
  | "weekly"
  | "monthly"
  | "other";

interface BillProvider {
  code?: string;
  biller_code?: string;
  billerCode?: string;
  name?: string;
  biller_name?: string;
  billerName?: string;
  description?: string;
  [key: string]: any;
}

interface BillPackage {
  item_code: string;
  biller_code: string;

  service: ServiceType;

  name: string;
  item_name?: string;
  description?: string;

  validity?: string;
  period?: PlanPeriod;
  period_label?: string;

  provider_amount: number;
  selling_price: number;
  profit?: number;
  markup?: number;

  currency?: string;

  provider_type?: string | null;

  provider_item?: any;

  [key: string]: any;
}

interface ServiceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  service: ServiceType;

  /**
   * Existing parent flow:
   *
   * onPurchase(finalAmount, details)
   *
   * The parent remains responsible for invoking the actual
   * Flutterwave bills Edge Function.
   */
  onPurchase: (
    amount: number,
    details: {
      service: ServiceType;
      country: string;

      biller_code: string;
      item_code: string;

      customer: string;

      phoneNumber?: string;

      meterNumber?: string;
      smartcardNumber?: string;
      accountNumber?: string;

      plan_name?: string;
      plan_validity?: string;
      period?: PlanPeriod;
      period_label?: string;

      provider_amount?: number;
      selling_price?: number;

      provider_type?: string | null;

      [key: string]: any;
    },
  ) => Promise<void> | void;

  /**
   * Optional initial provider.
   *
   * If omitted, providers are loaded automatically.
   */
  initialBillerCode?: string;

  /**
   * Optional initial customer.
   */
  initialCustomer?: string;
}

/**
 * ============================================================
 * SERVICE CONFIG
 * ============================================================
 */

const SERVICE_CONFIG: Record<
  ServiceType,
  {
    title: string;
    description: string;

    category: string;

    customerLabel: string;
    customerPlaceholder: string;

    customerType:
      | "phone"
      | "meter"
      | "smartcard"
      | "account";

    icon: React.ReactNode;
  }
> = {
  airtime: {
    title: "Airtime",
    description:
      "Buy airtime for any supported network.",

    category: "AIRTIME",

    customerLabel:
      "Phone Number",

    customerPlaceholder:
      "08012345678",

    customerType:
      "phone",

    icon: <Smartphone className="h-5 w-5" />,
  },

  data: {
    title: "Data",
    description:
      "Buy data bundles for any supported network.",

    category: "MOBILEDATA",

    customerLabel:
      "Phone Number",

    customerPlaceholder:
      "08012345678",

    customerType:
      "phone",

    icon: <Smartphone className="h-5 w-5" />,
  },

  electricity: {
    title: "Electricity",
    description:
      "Pay your electricity bill.",

    category: "UTILITYBILLS",

    customerLabel:
      "Meter Number",

    customerPlaceholder:
      "Enter meter number",

    customerType:
      "meter",

    icon: <Zap className="h-5 w-5" />,
  },

  cable: {
    title: "Cable TV",
    description:
      "Pay your cable TV subscription.",

    category: "CABLEBILLS",

    customerLabel:
      "Smartcard / Decoder Number",

    customerPlaceholder:
      "Enter smartcard number",

    customerType:
      "smartcard",

    icon: <Tv className="h-5 w-5" />,
  },

  internet: {
    title: "Internet",
    description:
      "Pay your internet subscription.",

    category: "INTSERVICE",

    customerLabel:
      "Account Number",

    customerPlaceholder:
      "Enter account number",

    customerType:
      "account",

    icon: <Wifi className="h-5 w-5" />,
  },
};

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function cleanString(
  value: unknown,
): string {
  return String(value ?? "").trim();
}

function normalizeServiceName(
  value: unknown,
): string {
  return cleanString(value)
    .toLowerCase();
}

function extractBillerCode(
  biller: BillProvider,
): string {
  return cleanString(
    biller?.biller_code ??
      biller?.billerCode ??
      biller?.code,
  );
}

function extractBillerName(
  biller: BillProvider,
): string {
  return (
    cleanString(
      biller?.name ??
        biller?.biller_name ??
        biller?.billerName ??
        biller?.description,
    ) ||
    extractBillerCode(biller)
  );
}

function extractItemCode(
  item: any,
): string {
  return cleanString(
    item?.item_code ??
      item?.itemCode ??
      item?.product_code ??
      item?.productCode ??
      item?.code ??
      item?.item_id ??
      item?.itemId,
  );
}

function extractItemName(
  item: any,
): string {
  return (
    cleanString(
      item?.item_name ??
        item?.itemName ??
        item?.name ??
        item?.description ??
        item?.product_name ??
        item?.productName ??
        item?.label ??
        item?.title,
    ) ||
    "Bill Package"
  );
}

function extractProviderAmount(
  item: any,
): number | null {
  const values = [
    item?.provider_amount,
    item?.amount,
    item?.price,
    item?.cost,
    item?.value,
    item?.selling_price,
    item?.sellingPrice,
  ];

  for (const value of values) {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      continue;
    }

    const numberValue =
      Number(value);

    if (
      Number.isFinite(
        numberValue,
      ) &&
      numberValue > 0
    ) {
      return Number(
        numberValue.toFixed(2),
      );
    }
  }

  return null;
}

function extractValidity(
  item: any,
): string {
  return cleanString(
    item?.validity ??
      item?.validity_period ??
      item?.duration ??
      item?.duration_name ??
      item?.period ??
      item?.subscription_period ??
      item?.data_validity ??
      "",
  );
}

function extractPeriod(
  item: any,
): PlanPeriod {
  const direct =
    cleanString(
      item?.period,
    ).toLowerCase();

  if (
    direct === "daily" ||
    direct === "weekly" ||
    direct === "monthly"
  ) {
    return direct;
  }

  const text = [
    item?.validity,
    item?.validity_period,
    item?.duration,
    item?.duration_name,
    item?.period,
    item?.subscription_period,
    item?.data_validity,
    item?.type,
    item?.item_name,
    item?.itemName,
    item?.name,
    item?.description,
    item?.product_name,
    item?.productName,
  ]
    .map((value) =>
      cleanString(value).toLowerCase(),
    )
    .filter(Boolean)
    .join(" ");

  if (
    /\bmonthly\b/.test(text) ||
    /\b30\s*days?\b/.test(text) ||
    /\b31\s*days?\b/.test(text) ||
    /\b4\s*weeks?\b/.test(text) ||
    /\b1\s*month\b/.test(text)
  ) {
    return "monthly";
  }

  if (
    /\bweekly\b/.test(text) ||
    /\b7\s*days?\b/.test(text) ||
    /\b1\s*week\b/.test(text) ||
    /\b2\s*weeks?\b/.test(text) ||
    /\b3\s*weeks?\b/.test(text)
  ) {
    return "weekly";
  }

  if (
    /\bdaily\b/.test(text) ||
    /\b24\s*hours?\b/.test(text) ||
    /\b1\s*day\b/.test(text) ||
    /\b2\s*days?\b/.test(text) ||
    /\b3\s*days?\b/.test(text)
  ) {
    return "daily";
  }

  return "other";
}

function formatNaira(
  amount: number,
): string {
  return new Intl.NumberFormat(
    "en-NG",
    {
      style: "currency",
      currency: "NGN",
      maximumFractionDigits: 0,
    },
  ).format(amount);
}

function normalizePhoneForDisplay(
  value: string,
): string {
  const cleaned =
    value.replace(
      /\s+/g,
      "",
    );

  if (
    /^234[0-9]{10}$/.test(
      cleaned,
    )
  ) {
    return `+${cleaned}`;
  }

  if (
    /^0[0-9]{10}$/.test(
      cleaned,
    )
  ) {
    return `+234${cleaned.slice(
      1,
    )}`;
  }

  return cleaned;
}

/**
 * ============================================================
 * COMPONENT
 * ============================================================
 */

export default function ServiceModal({
  open,
  onOpenChange,
  service,
  onPurchase,
  initialBillerCode,
  initialCustomer,
}: ServiceModalProps) {
  const config =
    SERVICE_CONFIG[service];

  /**
   * ==========================================================
   * STATE
   * ==========================================================
   */

  const [
    billers,
    setBillers,
  ] = useState<BillProvider[]>([]);

  const [
    packages,
    setPackages,
  ] = useState<BillPackage[]>([]);

  const [
    selectedBillerCode,
    setSelectedBillerCode,
  ] = useState(
    initialBillerCode ?? "",
  );

  const [
    selectedItemCode,
    setSelectedItemCode,
  ] = useState("");

  const [
    customer,
    setCustomer,
  ] = useState(
    initialCustomer ?? "",
  );

  const [
    planTab,
    setPlanTab,
  ] = useState<
    PlanPeriod
  >("daily");

  const [
    loadingBillers,
    setLoadingBillers,
  ] = useState(false);

  const [
    loadingPackages,
    setLoadingPackages,
  ] = useState(false);

  const [
    submitting,
    setSubmitting,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  /**
   * ==========================================================
   * RESET WHEN SERVICE CHANGES
   * ==========================================================
   */

  useEffect(() => {
    if (!open) {
      return;
    }

    setBillers([]);
    setPackages([]);

    setSelectedBillerCode(
      initialBillerCode ?? "",
    );

    setSelectedItemCode("");

    setCustomer(
      initialCustomer ?? "",
    );

    setPlanTab(
      service === "data"
        ? "daily"
        : "other",
    );

    setError("");
  }, [
    open,
    service,
    initialBillerCode,
    initialCustomer,
  ]);

  /**
   * ==========================================================
   * LOAD BILLERS
   * ==========================================================
   *
   * IMPORTANT:
   *
   * We use the biller code returned by Flutterwave.
   *
   * We NEVER invent the biller code based on the network name.
   * ==========================================================
   */

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled =
      false;

    async function loadBillers() {
      setLoadingBillers(
        true,
      );

      setError("");

      try {
        const {
          data,
          error: invokeError,
        } =
          await supabase.functions.invoke(
            "flutterwave-bills",
            {
              body: {
                action:
                  "billers",

                category:
                  config.category,
              },
            },
          );

        if (
          invokeError
        ) {
          throw new Error(
            invokeError.message ||
              "Unable to load bill providers.",
          );
        }

        if (
          !data?.success
        ) {
          throw new Error(
            data?.error ||
              "Unable to load bill providers.",
          );
        }

        if (
          cancelled
        ) {
          return;
        }

        const loadedBillers =
          Array.isArray(
            data?.billers,
          )
            ? data.billers
            : [];

        setBillers(
          loadedBillers,
        );

        /**
         * If an initial biller exists and is still available,
         * keep it.
         */
        const initialExists =
          loadedBillers.some(
            (biller: BillProvider) =>
              extractBillerCode(
                biller,
              ) ===
              (
                initialBillerCode ??
                ""
              ),
          );

        if (
          initialExists
        ) {
          setSelectedBillerCode(
            initialBillerCode!,
          );
        } else {
          /**
           * Do not blindly select a provider when the user has
           * not selected one. This prevents the wrong provider
           * code from being submitted.
           */
          setSelectedBillerCode("");
        }
      } catch (err: any) {
        if (
          cancelled
        ) {
          return;
        }

        console.error(
          "Failed to load billers:",
          err,
        );

        setBillers([]);

        setError(
          err?.message ||
            "Unable to load bill providers.",
        );
      } finally {
        if (
          !cancelled
        ) {
          setLoadingBillers(
            false,
          );
        }
      }
    }

    loadBillers();

    return () => {
      cancelled = true;
    };
  }, [
    open,
    config.category,
    initialBillerCode,
  ]);

  /**
   * ==========================================================
   * LOAD ITEMS
   * ==========================================================
   *
   * CRITICAL FIX:
   *
   * The service MUST be included.
   *
   * Previous implementation could call:
   *
   * {
   *   action: "items",
   *   biller_code
   * }
   *
   * but the backend now intentionally requires:
   *
   * {
   *   action: "items",
   *   service,
   *   biller_code
   * }
   *
   * ==========================================================
   */

  useEffect(() => {
    if (
      !open ||
      !selectedBillerCode
    ) {
      setPackages([]);
      setSelectedItemCode("");
      return;
    }

    let cancelled =
      false;

    async function loadItems() {
      setLoadingPackages(
        true,
      );

      setError("");

      setPackages([]);
      setSelectedItemCode("");

      try {
        const {
          data,
          error: invokeError,
        } =
          await supabase.functions.invoke(
            "flutterwave-bills",
            {
              body: {
                action:
                  "items",

                service,

                biller_code:
                  selectedBillerCode,
              },
            },
          );

        if (
          invokeError
        ) {
          throw new Error(
            invokeError.message ||
              "Unable to load bill packages.",
          );
        }

        if (
          !data?.success
        ) {
          throw new Error(
            data?.error ||
              "Unable to load bill packages.",
          );
        }

        if (
          cancelled
        ) {
          return;
        }

        /**
         * Prefer the already-enriched `packages` returned by
         * the Edge Function.
         */
        const loadedPackages =
          Array.isArray(
            data?.packages,
          )
            ? data.packages
            : [];

        /**
         * Only retain packages with valid item codes.
         */
        const validPackages =
          loadedPackages.filter(
            (item: any) =>
              Boolean(
                extractItemCode(
                  item,
                ),
              ),
          );

        setPackages(
          validPackages,
        );
      } catch (err: any) {
        if (
          cancelled
        ) {
          return;
        }

        console.error(
          "Failed to load bill packages:",
          err,
        );

        setPackages([]);

        setError(
          err?.message ||
            "Unable to load bill packages.",
        );
      } finally {
        if (
          !cancelled
        ) {
          setLoadingPackages(
            false,
          );
        }
      }
    }

    loadItems();

    return () => {
      cancelled = true;
    };
  }, [
    open,
    selectedBillerCode,
    service,
  ]);

  /**
   * ==========================================================
   * DATA PLAN GROUPS
   * ==========================================================
   *
   * IMPORTANT:
   *
   * DATA:
   *   Daily
   *   Weekly
   *   Monthly
   *   Other
   *
   * NON-DATA:
   *
   * We DO NOT filter them using `planTab`.
   *
   * This fixes the previous bug where Airtime,
   * Electricity, Cable and Internet could disappear because
   * their period was "other" while the UI was on "daily".
   * ==========================================================
   */

  const dailyPlans =
    useMemo(
      () =>
        packages.filter(
          (item) =>
            item.period ===
            "daily",
        ),
      [packages],
    );

  const weeklyPlans =
    useMemo(
      () =>
        packages.filter(
          (item) =>
            item.period ===
            "weekly",
        ),
      [packages],
    );

  const monthlyPlans =
    useMemo(
      () =>
        packages.filter(
          (item) =>
            item.period ===
            "monthly",
        ),
      [packages],
    );

  const otherPlans =
    useMemo(
      () =>
        packages.filter(
          (item) =>
            ![
              "daily",
              "weekly",
              "monthly",
            ].includes(
              item.period as string,
            ),
        ),
      [packages],
    );

  const visiblePackages =
    useMemo(() => {
      /**
       * NON-DATA SERVICES:
       *
       * Show every valid package.
       */
      if (
        service !== "data"
      ) {
        return packages;
      }

      /**
       * DATA SERVICES:
       *
       * Filter according to the selected tab.
       */
      switch (planTab) {
        case "daily":
          return dailyPlans;

        case "weekly":
          return weeklyPlans;

        case "monthly":
          return monthlyPlans;

        case "other":
        default:
          return otherPlans;
      }
    }, [
      service,
      packages,
      planTab,
      dailyPlans,
      weeklyPlans,
      monthlyPlans,
      otherPlans,
    ]);

  /**
   * ==========================================================
   * SELECTED PACKAGE
   * ==========================================================
   */

  const selectedPackage =
    useMemo(
      () =>
        packages.find(
          (item) =>
            extractItemCode(
              item,
            ) ===
            selectedItemCode,
        ) ?? null,
      [
        packages,
        selectedItemCode,
      ],
    );

  /**
   * ==========================================================
   * SELECTED PROVIDER
   * ==========================================================
   */

  const selectedBiller =
    useMemo(
      () =>
        billers.find(
          (biller) =>
            extractBillerCode(
              biller,
            ) ===
            selectedBillerCode,
        ) ?? null,
      [
        billers,
        selectedBillerCode,
      ],
    );

  /**
   * ==========================================================
   * CUSTOMER VALIDATION
   * ==========================================================
   */

  const customerError =
    useMemo(() => {
      const value =
        customer.trim();

      if (!value) {
        return "";
      }

      if (
        service === "airtime" ||
        service === "data"
      ) {
        const cleaned =
          value.replace(
            /\s+/g,
            "",
          );

        const valid =
          /^\+234[0-9]{10}$/.test(
            cleaned,
          ) ||
          /^234[0-9]{10}$/.test(
            cleaned,
          ) ||
          /^0[0-9]{10}$/.test(
            cleaned,
          );

        return valid
          ? ""
          : "Enter a valid Nigerian phone number.";
      }

      if (
        service === "electricity" &&
        value.length < 5
      ) {
        return "Enter a valid meter number.";
      }

      if (
        service === "cable" &&
        value.length < 5
      ) {
        return "Enter a valid smartcard or decoder number.";
      }

      if (
        service === "internet" &&
        value.length < 3
      ) {
        return "Enter a valid internet account number.";
      }

      return "";
    }, [
      customer,
      service,
    ]);

  /**
   * ==========================================================
   * SUBMIT
   * ==========================================================
   */

  async function handlePurchase() {
    setError("");

    /**
     * Provider is mandatory.
     */
    if (
      !selectedBillerCode
    ) {
      setError(
        "Please select a bill provider.",
      );
      return;
    }

    /**
     * Package is mandatory because the Edge Function requires
     * an item_code for every bill payment.
     */
    if (
      !selectedItemCode ||
      !selectedPackage
    ) {
      setError(
        "Please select a bill package.",
      );
      return;
    }

    /**
     * Customer identifier is mandatory.
     */
    if (
      !customer.trim()
    ) {
      setError(
        `Please enter your ${config.customerLabel.toLowerCase()}.`,
      );
      return;
    }

    if (
      customerError
    ) {
      setError(
        customerError,
      );
      return;
    }

    setSubmitting(true);

    try {
      /**
       * Normalize phone numbers before sending them to the
       * parent. The Edge Function also normalizes them again,
       * so the backend remains authoritative.
       */
      let finalCustomer =
        customer.trim();

      if (
        service === "airtime" ||
        service === "data"
      ) {
        finalCustomer =
          normalizePhoneForDisplay(
            finalCustomer,
          );
      }

      /**
       * IMPORTANT:
       *
       * The frontend does NOT calculate the final customer
       * selling price.
       *
       * The backend owns:
       *
       * provider amount
       * + ₦50 DATA markup
       * = selling price
       *
       * We only pass the catalogue information through.
       */
      const providerAmount =
        extractProviderAmount(
          selectedPackage,
        );

      const planName =
        extractItemName(
          selectedPackage,
        );

      const validity =
        extractValidity(
          selectedPackage,
        );

      const period =
        service === "data"
          ? (
              selectedPackage.period ??
              extractPeriod(
                selectedPackage,
              )
            )
          : "other";

      const periodLabel =
        service === "data"
          ? (
              selectedPackage.period_label ??
              (
                period === "daily"
                  ? "Daily"
                  : period ===
                      "weekly"
                    ? "Weekly"
                    : period ===
                        "monthly"
                      ? "Monthly"
                      : "Other"
              )
            )
          : "Other";

      /**
       * This is intentionally passed as the amount argument
       * expected by the existing parent.
       *
       * The parent MUST NOT trust this value for the actual
       * debit. The Edge Function calculates the authoritative
       * selling price from Flutterwave's catalogue.
       *
       * If the catalogue already contains selling_price from
       * the Edge Function, use it; otherwise use provider
       * amount as a display/fallback value.
       */
      const displayAmount =
        Number(
          selectedPackage
            ?.selling_price ??
            providerAmount ??
            0,
        );

      await onPurchase(
        displayAmount,
        {
          service,

          country: "NG",

          /**
           * CRITICAL:
           * Use the exact Flutterwave biller code.
           */
          biller_code:
            selectedBillerCode,

          /**
           * CRITICAL:
           * Use the exact Flutterwave item code.
           */
          item_code:
            selectedItemCode,

          /**
           * Backend accepts `customer`.
           */
          customer:
            finalCustomer,

          /**
           * Convenience fields for the existing UI/parent.
           */
          phoneNumber:
            service === "airtime" ||
            service === "data"
              ? finalCustomer
              : undefined,

          meterNumber:
            service ===
            "electricity"
              ? finalCustomer
              : undefined,

          smartcardNumber:
            service === "cable"
              ? finalCustomer
              : undefined,

          accountNumber:
            service === "internet"
              ? finalCustomer
              : undefined,

          plan_name:
            planName,

          plan_validity:
            validity,

          period,

          period_label:
            periodLabel,

          /**
           * These are informational only.
           *
           * The Edge Function fetches Flutterwave's catalogue
           * again and calculates the authoritative amount.
           */
          provider_amount:
            providerAmount ??
            undefined,

          selling_price:
            Number(
              selectedPackage
                ?.selling_price ??
                0,
            ) || undefined,

          provider_type:
            selectedPackage
              ?.provider_type ??
            null,

          provider:
            "flutterwave",

          biller_name:
            selectedBiller
              ? extractBillerName(
                  selectedBiller,
                )
              : "",

          item_name:
            planName,

          description:
            selectedPackage
              ?.description ??
            planName,
        },
      );

      /**
       * Do not close the modal here.
       *
       * The parent can decide whether the transaction was:
       *
       * successful
       * pending
       * failed/refunded
       *
       * and then close the modal appropriately.
       */
    } catch (err: any) {
      console.error(
        "Bill purchase failed:",
        err,
      );

      setError(
        err?.message ||
          "Unable to complete bill payment.",
      );
    } finally {
      setSubmitting(
        false,
      );
    }
  }

  /**
   * ==========================================================
   * RENDER
   * ==========================================================
   */

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (
          submitting
        ) {
          return;
        }

        onOpenChange(
          value,
        );
      }}
    >
      <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {config.icon}

            <span>
              {config.title}
            </span>
          </DialogTitle>

          <DialogDescription>
            {config.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* ================================================= */}
          {/* ERROR */}
          {/* ================================================= */}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* ================================================= */}
          {/* PROVIDER */}
          {/* ================================================= */}

          <div className="space-y-2">
            <Label>
              Provider
            </Label>

            <Select
              value={
                selectedBillerCode
              }
              onValueChange={(
                value,
              ) => {
                setSelectedBillerCode(
                  value,
                );

                setSelectedItemCode(
                  "",
                );

                setError("");
              }}
              disabled={
                loadingBillers ||
                submitting
              }
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    loadingBillers
                      ? "Loading providers..."
                      : "Select provider"
                  }
                />
              </SelectTrigger>

              <SelectContent>
                {billers.map(
                  (
                    biller,
                    index,
                  ) => {
                    const code =
                      extractBillerCode(
                        biller,
                      );

                    const name =
                      extractBillerName(
                        biller,
                      );

                    if (!code) {
                      return null;
                    }

                    return (
                      <SelectItem
                        key={`${code}-${index}`}
                        value={code}
                      >
                        {name}
                      </SelectItem>
                    );
                  },
                )}
              </SelectContent>
            </Select>
          </div>

          {/* ================================================= */}
          {/* CUSTOMER */}
          {/* ================================================= */}

          <div className="space-y-2">
            <Label htmlFor="bill-customer">
              {config.customerLabel}
            </Label>

            <Input
              id="bill-customer"
              value={customer}
              onChange={(
                event,
              ) => {
                setCustomer(
                  event.target
                    .value,
                );

                setError("");
              }}
              placeholder={
                config.customerPlaceholder
              }
              disabled={
                submitting
              }
              inputMode={
                config.customerType ===
                "phone"
                  ? "tel"
                  : "numeric"
              }
            />

            {customerError && (
              <p className="text-xs text-red-600">
                {customerError}
              </p>
            )}

            {(service ===
              "electricity" ||
              service ===
                "cable" ||
              service ===
                "internet") && (
              <p className="text-xs text-muted-foreground">
                Your details will be
                verified with the
                service provider before
                payment.
              </p>
            )}
          </div>

          {/* ================================================= */}
          {/* DATA PERIOD TABS */}
          {/* ================================================= */}

          {service ===
            "data" && (
            <div className="space-y-3">
              <Label>
                Data Plans
              </Label>

              <div className="grid grid-cols-4 gap-1 rounded-lg bg-muted p-1">
                <button
                  type="button"
                  onClick={() =>
                    setPlanTab(
                      "daily",
                    )
                  }
                  disabled={
                    submitting
                  }
                  className={`rounded-md px-2 py-2 text-xs font-medium transition ${
                    planTab ===
                    "daily"
                      ? "bg-background shadow"
                      : "text-muted-foreground"
                  }`}
                >
                  Daily
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setPlanTab(
                      "weekly",
                    )
                  }
                  disabled={
                    submitting
                  }
                  className={`rounded-md px-2 py-2 text-xs font-medium transition ${
                    planTab ===
                    "weekly"
                      ? "bg-background shadow"
                      : "text-muted-foreground"
                  }`}
                >
                  Weekly
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setPlanTab(
                      "monthly",
                    )
                  }
                  disabled={
                    submitting
                  }
                  className={`rounded-md px-2 py-2 text-xs font-medium transition ${
                    planTab ===
                    "monthly"
                      ? "bg-background shadow"
                      : "text-muted-foreground"
                  }`}
                >
                  Monthly
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setPlanTab(
                      "other",
                    )
                  }
                  disabled={
                    submitting
                  }
                  className={`rounded-md px-2 py-2 text-xs font-medium transition ${
                    planTab ===
                    "other"
                      ? "bg-background shadow"
                      : "text-muted-foreground"
                  }`}
                >
                  Other
                </button>
              </div>
            </div>
          )}

          {/* ================================================= */}
          {/* PACKAGE LIST */}
          {/* ================================================= */}

          <div className="space-y-2">
            <Label>
              {service ===
              "data"
                ? "Select Data Plan"
                : service ===
                    "airtime"
                  ? "Select Airtime Amount"
                  : "Select Package"}
            </Label>

            {loadingPackages ? (
              <div className="flex items-center justify-center rounded-lg border p-8">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />

                <span className="text-sm text-muted-foreground">
                  Loading packages...
                </span>
              </div>
            ) : !selectedBillerCode ? (
              <div className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
                Select a provider first.
              </div>
            ) : visiblePackages.length ===
              0 ? (
              <div className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
                No packages are currently
                available for this provider.
              </div>
            ) : (
              <div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto pr-1">
                {visiblePackages.map(
                  (
                    item,
                    index,
                  ) => {
                    const itemCode =
                      extractItemCode(
                        item,
                      );

                    const name =
                      extractItemName(
                        item,
                      );

                    const providerAmount =
                      extractProviderAmount(
                        item,
                      );

                    const sellingPrice =
                      Number(
                        item?.selling_price ??
                          0,
                      ) || null;

                    const validity =
                      extractValidity(
                        item,
                      );

                    const isSelected =
                      selectedItemCode ===
                      itemCode;

                    return (
                      <button
                        key={`${itemCode}-${index}`}
                        type="button"
                        disabled={
                          submitting
                        }
                        onClick={() => {
                          setSelectedItemCode(
                            itemCode,
                          );

                          setError("");
                        }}
                        className={`rounded-xl border p-3 text-left transition ${
                          isSelected
                            ? "border-primary bg-primary/5 ring-1 ring-primary"
                            : "hover:border-primary/50"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">
                              {name}
                            </p>

                            {validity && (
                              <p className="mt-1 text-xs text-muted-foreground">
                                {validity}
                              </p>
                            )}
                          </div>

                          {isSelected && (
                            <div className="shrink-0 text-xs font-semibold text-primary">
                              ✓
                            </div>
                          )}
                        </div>

                        <div className="mt-2">
                          <p className="text-sm font-bold">
                            {formatNaira(
                              sellingPrice ??
                                providerAmount ??
                                0,
                            )}
                          </p>

                          {service ===
                            "data" && (
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              Includes ₦50
                              service
                              charge
                            </p>
                          )}
                        </div>
                      </button>
                    );
                  },
                )}
              </div>
            )}
          </div>

          {/* ================================================= */}
          {/* SELECTED PACKAGE */}
          {/* ================================================= */}

          {selectedPackage && (
            <div className="rounded-xl border bg-muted/30 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">
                    {extractItemName(
                      selectedPackage,
                    )}
                  </p>

                  {selectedBiller && (
                    <p className="text-xs text-muted-foreground">
                      {extractBillerName(
                        selectedBiller,
                      )}
                    </p>
                  )}
                </div>

                <p className="text-lg font-bold">
                  {formatNaira(
                    Number(
                      selectedPackage
                        .selling_price ??
                        extractProviderAmount(
                          selectedPackage,
                        ) ??
                        0,
                    ),
                  )}
                </p>
              </div>

              {service ===
                "data" && (
                <div className="mt-3 flex items-center justify-between border-t pt-3 text-xs">
                  <span className="text-muted-foreground">
                    Provider price
                  </span>

                  <span>
                    {formatNaira(
                      Number(
                        selectedPackage
                          .provider_amount ??
                          extractProviderAmount(
                            selectedPackage,
                          ) ??
                          0,
                      ),
                    )}
                  </span>
                </div>
              )}

              {service ===
                "data" && (
                <div className="mt-1 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    Service charge
                  </span>

                  <span>
                    ₦50
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ================================================= */}
          {/* PURCHASE BUTTON */}
          {/* ================================================= */}

          <Button
            type="button"
            className="w-full"
            disabled={
              submitting ||
              loadingBillers ||
              loadingPackages ||
              !selectedBillerCode ||
              !selectedItemCode ||
              !customer.trim() ||
              Boolean(
                customerError,
              )
            }
            onClick={
              handlePurchase
            }
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />

                Processing...
              </>
            ) : selectedPackage ? (
              <>
                Pay{" "}
                {formatNaira(
                  Number(
                    selectedPackage
                      .selling_price ??
                      extractProviderAmount(
                        selectedPackage,
                      ) ??
                      0,
                  ),
                )}
              </>
            ) : (
              "Continue"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
