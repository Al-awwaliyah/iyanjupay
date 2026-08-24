import React, { useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Smartphone,
  Wifi,
  Tv,
  Zap,
  ChevronDown,
  CheckCircle2,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

type BillItem = {
  item_code?: string;
  itemCode?: string;
  product_code?: string;
  productCode?: string;

  biller_code?: string;
  billerCode?: string;

  name?: string;
  item_name?: string;
  itemName?: string;
  description?: string;

  amount?: number | string;
  price?: number | string;
  cost?: number | string;
  value?: number | string;

  validity?: string;
  validity_period?: string;
  validityPeriod?: string;

  period?: string;
  period_label?: string;

  provider_amount?: number | string;
  selling_price?: number | string;
  profit?: number | string;

  currency?: string;

  [key: string]: any;
};

type Biller = {
  biller_code?: string;
  billerCode?: string;

  name?: string;
  biller_name?: string;
  billerName?: string;

  [key: string]: any;
};

interface ServiceModalProps {
  open: boolean;
  onClose: () => void;
  service: ServiceType;
  walletBalance?: number;
  onSuccess?: (result: any) => void;
}

const MARKUP = 50;

const SERVICE_LABELS: Record<ServiceType, string> = {
  airtime: "Airtime",
  data: "Data",
  electricity: "Electricity",
  cable: "Cable TV",
  internet: "Internet",
};

const SERVICE_ICONS: Record<ServiceType, React.ReactNode> = {
  airtime: <Smartphone className="h-5 w-5" />,
  data: <Wifi className="h-5 w-5" />,
  electricity: <Zap className="h-5 w-5" />,
  cable: <Tv className="h-5 w-5" />,
  internet: <Wifi className="h-5 w-5" />,
};

const CATEGORY_MAP: Record<ServiceType, string> = {
  airtime: "AIRTIME",
  data: "MOBILEDATA",
  electricity: "UTILITYBILLS",
  cable: "CABLEBILLS",
  internet: "INTSERVICE",
};

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function getItemCode(item: BillItem): string {
  return clean(
    item.item_code ??
      item.itemCode ??
      item.product_code ??
      item.productCode,
  );
}

function getBillerCode(item: BillItem): string {
  return clean(
    item.biller_code ??
      item.billerCode,
  );
}

function getItemName(item: BillItem): string {
  return clean(
    item.name ??
      item.item_name ??
      item.itemName ??
      item.description ??
      "Bill package",
  );
}

function getProviderAmount(item: BillItem): number {
  /*
   * The latest Edge Function returns provider_amount.
   * Fall back to Flutterwave's original catalogue fields
   * so the UI remains compatible with the raw `items` response.
   */
  const values = [
    item.provider_amount,
    item.amount,
    item.price,
    item.cost,
    item.value,
  ];

  for (const value of values) {
    const amount = Number(value);

    if (
      Number.isFinite(amount) &&
      amount > 0
    ) {
      return Number(amount.toFixed(2));
    }
  }

  return 0;
}

function getSellingPrice(item: BillItem): number {
  const serverSellingPrice =
    Number(item.selling_price);

  if (
    Number.isFinite(
      serverSellingPrice,
    ) &&
    serverSellingPrice > 0
  ) {
    return Number(
      serverSellingPrice.toFixed(2),
    );
  }

  const provider =
    getProviderAmount(item);

  return provider > 0
    ? Number(
        (provider + MARKUP).toFixed(2),
      )
    : 0;
}

function getProfit(item: BillItem): number {
  const serverProfit =
    Number(item.profit);

  if (
    Number.isFinite(serverProfit) &&
    serverProfit >= 0
  ) {
    return Number(
      serverProfit.toFixed(2),
    );
  }

  const provider =
    getProviderAmount(item);

  const selling =
    getSellingPrice(item);

  return provider > 0 && selling > 0
    ? Number(
        (selling - provider).toFixed(2),
      )
    : MARKUP;
}

function getBillerName(
  biller: Biller,
): string {
  return clean(
    biller.name ??
      biller.biller_name ??
      biller.billerName ??
      "Provider",
  );
}

function getValidity(
  item: BillItem,
): string {
  return clean(
    item.validity ??
      item.validity_period ??
      item.validityPeriod ??
      item.period_label ??
      "",
  );
}

function getPlanType(
  item: BillItem,
): PlanPeriod {
  /*
   * Prefer the server-provided period.
   */
  const serverPeriod =
    clean(item.period).toLowerCase();

  if (
    serverPeriod === "daily" ||
    serverPeriod === "weekly" ||
    serverPeriod === "monthly"
  ) {
    return serverPeriod;
  }

  const text =
    `${getItemName(item)} ${getValidity(item)}`
      .toLowerCase();

  if (
    text.includes("daily") ||
    /\b1\s*day\b/.test(text) ||
    /\b24\s*hour/.test(text)
  ) {
    return "daily";
  }

  if (
    text.includes("weekly") ||
    /\b7\s*day/.test(text) ||
    /\b14\s*day/.test(text)
  ) {
    return "weekly";
  }

  if (
    text.includes("monthly") ||
    /\b30\s*day/.test(text) ||
    /\b31\s*day/.test(text)
  ) {
    return "monthly";
  }

  return "other";
}

function normalizePhone(
  value: string,
): string {
  return value
    .replace(/\s+/g, "")
    .trim();
}

function formatMoney(
  value: number,
): string {
  return `₦${value.toLocaleString(
    "en-NG",
    {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    },
  )}`;
}

export default function ServiceModal({
  open,
  onClose,
  service,
  walletBalance = 0,
  onSuccess,
}: ServiceModalProps) {
  const [billers, setBillers] =
    useState<Biller[]>([]);

  const [items, setItems] =
    useState<BillItem[]>([]);

  const [
    selectedBiller,
    setSelectedBiller,
  ] = useState("");

  const [
    selectedItem,
    setSelectedItem,
  ] = useState<BillItem | null>(
    null,
  );

  const [
    phoneNumber,
    setPhoneNumber,
  ] = useState("");

  const [
    customer,
    setCustomer,
  ] = useState("");

  const [
    loadingBillers,
    setLoadingBillers,
  ] = useState(false);

  const [
    loadingItems,
    setLoadingItems,
  ] = useState(false);

  const [paying, setPaying] =
    useState(false);

  const [error, setError] =
    useState("");

  const [
    successMessage,
    setSuccessMessage,
  ] = useState("");

  const [
    planTab,
    setPlanTab,
  ] = useState<PlanPeriod>("daily");

  /*
   * Airtime and Data use phone numbers.
   */
  const isPhoneService =
    service === "airtime" ||
    service === "data";

  /*
   * ============================================================
   * RESET MODAL
   * ============================================================
   */
  useEffect(() => {
    if (!open) return;

    setBillers([]);
    setItems([]);
    setSelectedBiller("");
    setSelectedItem(null);
    setPhoneNumber("");
    setCustomer("");
    setError("");
    setSuccessMessage("");
    setPlanTab(
      service === "data"
        ? "daily"
        : "other",
    );
  }, [open, service]);

  /*
   * ============================================================
   * LOAD BILLERS
   * ============================================================
   */
  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    async function loadBillers() {
      setLoadingBillers(true);
      setError("");

      try {
        const {
          data,
          error,
        } =
          await supabase.functions.invoke(
            "flutterwave-bills",
            {
              body: {
                action: "billers",
                category:
                  CATEGORY_MAP[service],
              },
            },
          );

        if (error) {
          throw new Error(
            error.message ||
              "Unable to load bill providers.",
          );
        }

        if (!data?.success) {
          throw new Error(
            data?.error ||
              "Unable to load bill providers.",
          );
        }

        if (!cancelled) {
          setBillers(
            Array.isArray(
              data.billers,
            )
              ? data.billers
              : [],
          );
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(
            err?.message ||
              "Unable to load bill providers.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingBillers(false);
        }
      }
    }

    loadBillers();

    return () => {
      cancelled = true;
    };
  }, [open, service]);

  /*
   * ============================================================
   * LOAD FLUTTERWAVE ITEMS
   * ============================================================
   */
  useEffect(() => {
    if (!selectedBiller) {
      setItems([]);
      setSelectedItem(null);
      return;
    }

    let cancelled = false;

    async function loadItems() {
      setLoadingItems(true);
      setError("");
      setSelectedItem(null);

      try {
        const {
          data,
          error,
        } =
          await supabase.functions.invoke(
            "flutterwave-bills",
            {
              body: {
                action: "items",
                biller_code:
                  selectedBiller,
              },
            },
          );

        if (error) {
          throw new Error(
            error.message ||
              "Unable to load bill packages.",
          );
        }

        if (!data?.success) {
          throw new Error(
            data?.error ||
              "Unable to load bill packages.",
          );
        }

        if (!cancelled) {
          /*
           * Latest backend returns:
           *
           * data.items
           * data.plans
           * data.daily
           * data.weekly
           * data.monthly
           * data.other
           *
           * Prefer `plans` because those are already
           * enriched with provider_amount/selling_price.
           */
          const loadedItems =
            Array.isArray(
              data.plans,
            )
              ? data.plans
              : Array.isArray(
                    data.items,
                  )
                ? data.items
                : [];

          setItems(
            loadedItems,
          );

          if (
            service === "data"
          ) {
            const hasDaily =
              loadedItems.some(
                (item: BillItem) =>
                  getPlanType(
                    item,
                  ) === "daily",
              );

            const hasWeekly =
              loadedItems.some(
                (item: BillItem) =>
                  getPlanType(
                    item,
                  ) === "weekly",
              );

            const hasMonthly =
              loadedItems.some(
                (item: BillItem) =>
                  getPlanType(
                    item,
                  ) === "monthly",
              );

            if (hasDaily) {
              setPlanTab(
                "daily",
              );
            } else if (
              hasWeekly
            ) {
              setPlanTab(
                "weekly",
              );
            } else if (
              hasMonthly
            ) {
              setPlanTab(
                "monthly",
              );
            } else {
              setPlanTab(
                "other",
              );
            }
          }
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(
            err?.message ||
              "Unable to load bill packages.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingItems(false);
        }
      }
    }

    loadItems();

    return () => {
      cancelled = true;
    };
  }, [
    selectedBiller,
    service,
  ]);

  /*
   * ============================================================
   * GROUP DATA PLANS
   * ============================================================
   */
  const groupedItems =
    useMemo(() => {
      const groups: Record<
        PlanPeriod,
        BillItem[]
      > = {
        daily: [],
        weekly: [],
        monthly: [],
        other: [],
      };

      for (const item of items) {
        if (
          getProviderAmount(item) <=
          0
        ) {
          continue;
        }

        const type =
          getPlanType(item);

        groups[type].push(
          item,
        );
      }

      return groups;
    }, [items]);

  const visibleItems =
    service === "data"
      ? groupedItems[planTab]
      : items.filter(
          (item) =>
            getProviderAmount(
              item,
            ) > 0,
        );

  /*
   * ============================================================
   * CUSTOMER
   * ============================================================
   */
  const customerValue =
    isPhoneService
      ? normalizePhone(
          phoneNumber,
        )
      : customer.trim();

  /*
   * ============================================================
   * PHONE VALIDATION
   * ============================================================
   */
  const validPhone =
    !isPhoneService ||
    /^(?:\+?234|0)[0-9]{10}$/.test(
      customerValue,
    );

  /*
   * ============================================================
   * SELECT PLAN
   * ============================================================
   */
  function selectItem(
    item: BillItem,
  ) {
    if (paying) return;

    setSelectedItem(item);
    setError("");
    setSuccessMessage("");
  }

  /*
   * ============================================================
   * PAYMENT
   * ============================================================
   */
  async function handlePayment() {
    if (paying) return;

    setError("");
    setSuccessMessage("");

    if (!selectedBiller) {
      setError(
        "Please select a provider.",
      );
      return;
    }

    if (!selectedItem) {
      setError(
        "Please select a plan.",
      );
      return;
    }

    if (!customerValue) {
      setError(
        isPhoneService
          ? "Please enter a phone number."
          : "Please enter the customer number.",
      );
      return;
    }

    if (
      isPhoneService &&
      !validPhone
    ) {
      setError(
        "Please enter a valid Nigerian phone number.",
      );
      return;
    }

    const itemCode =
      getItemCode(
        selectedItem,
      );

    if (!itemCode) {
      setError(
        "The selected plan has no valid Flutterwave item code.",
      );
      return;
    }

    const providerAmount =
      getProviderAmount(
        selectedItem,
      );

    if (
      !Number.isFinite(
        providerAmount,
      ) ||
      providerAmount <= 0
    ) {
      setError(
        "The selected plan has an invalid provider price.",
      );
      return;
    }

    const sellingPrice =
      getSellingPrice(
        selectedItem,
      );

    if (
      !Number.isFinite(
        sellingPrice,
      ) ||
      sellingPrice <= 0
    ) {
      setError(
        "Unable to determine the selling price.",
      );
      return;
    }

    /*
     * This is only a UX check.
     *
     * The backend performs the authoritative
     * wallet balance/debit check.
     *
     * Do NOT use `walletBalance > 0` as a
     * requirement because a stale/undefined
     * dashboard balance must not disable
     * the Buy button.
     */
    if (
      Number.isFinite(
        walletBalance,
      ) &&
      walletBalance > 0 &&
      walletBalance <
        sellingPrice
    ) {
      setError(
        `Insufficient wallet balance. You need ${formatMoney(
          sellingPrice,
        )}.`,
      );
      return;
    }

    setPaying(true);

    try {
      /*
       * IMPORTANT:
       *
       * We send:
       *
       * provider_amount = Flutterwave catalogue price
       * selling_price   = provider price + ₦50
       *
       * The backend verifies these again against
       * Flutterwave's catalogue.
       */
      const {
        data,
        error,
      } =
        await supabase.functions.invoke(
          "flutterwave-bills",
          {
            body: {
              action: "pay",

              service,

              country: "NG",

              biller_code:
                selectedBiller,

              item_code:
                itemCode,

              customer:
                customerValue,

              /*
               * These are intentionally explicit.
               * The server remains authoritative.
               */
              provider_amount:
                providerAmount,

              selling_price:
                sellingPrice,

              /*
               * Keep `amount` for compatibility
               * with the current Edge Function.
               */
              amount:
                sellingPrice,

              details: {
                phone_number:
                  isPhoneService
                    ? customerValue
                    : "",

                customer:
                  customerValue,

                plan_name:
                  getItemName(
                    selectedItem,
                  ),

                plan_validity:
                  getValidity(
                    selectedItem,
                  ),

                period:
                  getPlanType(
                    selectedItem,
                  ),

                item_code:
                  itemCode,

                biller_code:
                  selectedBiller,

                provider_amount:
                  providerAmount,

                selling_price:
                  sellingPrice,

                profit:
                  getProfit(
                    selectedItem,
                  ),
              },
            },
          },
        );

      if (error) {
        throw new Error(
          error.message ||
            "Bill payment could not be initiated.",
        );
      }

      if (!data) {
        throw new Error(
          "No response was received from the bill payment service.",
        );
      }

      /*
       * The backend returns success:true for both
       * successful and pending transactions.
       *
       * Therefore do NOT reject a pending response
       * just because it is not `successful`.
       */
      if (
        data.success !== true
      ) {
        throw new Error(
          data.error ||
            "Bill payment failed.",
        );
      }

      if (
        data.status ===
        "failed"
      ) {
        throw new Error(
          data.error ||
            "Bill payment failed.",
        );
      }

      if (
        data.status ===
        "pending"
      ) {
        setSuccessMessage(
          "Payment is being verified. Your wallet has been debited.",
        );
      } else {
        setSuccessMessage(
          "Payment successful.",
        );
      }

      /*
       * Pass the complete backend response
       * back to Dashboard/parent.
       */
      onSuccess?.(data);

      /*
       * Close after a short delay.
       */
      window.setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      console.error(
        "Bill payment error:",
        err,
      );

      setError(
        err?.message ||
          "Unable to complete bill payment.",
      );
    } finally {
      setPaying(false);
    }
  }

  /*
   * ============================================================
   * DERIVED VALUES
   * ============================================================
   */
  const selectedProvider =
    billers.find(
      (biller) =>
        clean(
          biller.biller_code ??
            biller.billerCode,
        ) ===
        selectedBiller,
    );

  const selectedProviderName =
    selectedProvider
      ? getBillerName(
          selectedProvider,
        )
      : "";

  const providerAmount =
    selectedItem
      ? getProviderAmount(
          selectedItem,
        )
      : 0;

  const sellingPrice =
    selectedItem
      ? getSellingPrice(
          selectedItem,
        )
      : 0;

  const profit =
    selectedItem
      ? getProfit(
          selectedItem,
        )
      : 0;

  /*
   * This controls whether the button is disabled.
   *
   * Notice that we DON'T include walletBalance here.
   * The backend is responsible for the authoritative
   * balance check.
   */
  const canPay =
    !paying &&
    !loadingBillers &&
    !loadingItems &&
    Boolean(
      selectedBiller,
    ) &&
    Boolean(
      selectedItem,
    ) &&
    Boolean(
      customerValue,
    ) &&
    validPhone;

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div className="max-h-[95vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white shadow-xl sm:rounded-3xl">
        {/* ================================================== */}
        {/* HEADER */}
        {/* ================================================== */}

        <div className="sticky top-0 z-20 border-b bg-white px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-blue-50 p-2 text-blue-600">
                {SERVICE_ICONS[
                  service
                ]}
              </div>

              <div>
                <h2 className="font-semibold text-gray-900">
                  {
                    SERVICE_LABELS[
                      service
                    ]
                  }
                </h2>

                <p className="text-xs text-gray-500">
                  Select a provider and package
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={
                paying
                  ? undefined
                  : onClose
              }
              disabled={paying}
              className="rounded-full px-3 py-2 text-xl text-gray-400 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              ×
            </button>
          </div>
        </div>

        <div className="space-y-5 p-5">
          {/* ================================================== */}
          {/* ERROR */}
          {/* ================================================== */}

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* ================================================== */}
          {/* SUCCESS */}
          {/* ================================================== */}

          {successMessage && (
            <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700">
              <CheckCircle2 className="h-4 w-4 shrink-0" />

              <span>
                {successMessage}
              </span>
            </div>
          )}

          {/* ================================================== */}
          {/* PROVIDER */}
          {/* ================================================== */}

          <div className="space-y-2">
            <Label>
              Provider
            </Label>

            <div className="relative">
              <select
                value={
                  selectedBiller
                }
                onChange={(e) => {
                  setSelectedBiller(
                    e.target.value,
                  );
                  setSelectedItem(
                    null,
                  );
                  setError("");
                }}
                disabled={
                  loadingBillers ||
                  paying
                }
                className="h-11 w-full appearance-none rounded-xl border bg-white px-3 pr-10 text-sm outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100"
              >
                <option value="">
                  {loadingBillers
                    ? "Loading providers..."
                    : "Select provider"}
                </option>

                {billers.map(
                  (biller) => {
                    const code =
                      clean(
                        biller.biller_code ??
                          biller.billerCode,
                      );

                    if (!code)
                      return null;

                    return (
                      <option
                        key={code}
                        value={code}
                      >
                        {getBillerName(
                          biller,
                        )}
                      </option>
                    );
                  },
                )}
              </select>

              <ChevronDown className="pointer-events-none absolute right-3 top-3 h-5 w-5 text-gray-400" />
            </div>
          </div>

          {/* ================================================== */}
          {/* PHONE / CUSTOMER */}
          {/* ================================================== */}

          <div className="space-y-2">
            <Label>
              {isPhoneService
                ? "Phone Number"
                : service ===
                    "electricity"
                  ? "Meter Number"
                  : service ===
                      "cable"
                    ? "Smartcard / Decoder Number"
                    : "Account Number"}
            </Label>

            <Input
              value={
                isPhoneService
                  ? phoneNumber
                  : customer
              }
              onChange={(e) => {
                setError("");

                if (
                  isPhoneService
                ) {
                  setPhoneNumber(
                    e.target.value,
                  );
                } else {
                  setCustomer(
                    e.target.value,
                  );
                }
              }}
              type={
                isPhoneService
                  ? "tel"
                  : "text"
              }
              inputMode={
                isPhoneService
                  ? "tel"
                  : "text"
              }
              placeholder={
                isPhoneService
                  ? "08012345678"
                  : service ===
                      "electricity"
                    ? "Enter meter number"
                    : service ===
                        "cable"
                      ? "Enter smartcard number"
                      : "Enter account number"
              }
              disabled={paying}
              className="h-11 rounded-xl"
            />

            {isPhoneService &&
              phoneNumber &&
              !validPhone && (
                <p className="text-xs text-red-600">
                  Enter a valid Nigerian
                  phone number.
                </p>
              )}
          </div>

          {/* ================================================== */}
          {/* DATA PLAN TABS */}
          {/* ================================================== */}

          {selectedBiller &&
            service === "data" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>
                    {selectedProviderName ||
                      "Data Plans"}
                  </Label>

                  {loadingItems && (
                    <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                  )}
                </div>

                <div className="grid grid-cols-4 gap-2">
                  {(
                    [
                      [
                        "daily",
                        "Daily",
                      ],
                      [
                        "weekly",
                        "Weekly",
                      ],
                      [
                        "monthly",
                        "Monthly",
                      ],
                      [
                        "other",
                        "Other",
                      ],
                    ] as const
                  ).map(
                    ([
                      value,
                      label,
                    ]) => {
                      const count =
                        groupedItems[
                          value
                        ].length;

                      return (
                        <button
                          key={
                            value
                          }
                          type="button"
                          disabled={
                            paying ||
                            loadingItems ||
                            count ===
                              0
                          }
                          onClick={() => {
                            setPlanTab(
                              value,
                            );
                            setSelectedItem(
                              null,
                            );
                            setError("");
                          }}
                          className={`rounded-xl px-2 py-2 text-xs font-semibold transition ${
                            planTab ===
                            value
                              ? "bg-blue-600 text-white"
                              : "bg-gray-100 text-gray-600"
                          } ${
                            count ===
                            0
                              ? "cursor-not-allowed opacity-40"
                              : "hover:bg-blue-100"
                          }`}
                        >
                          {label}

                          <span className="ml-1 opacity-70">
                            ({count})
                          </span>
                        </button>
                      );
                    },
                  )}
                </div>
              </div>
            )}

          {/* ================================================== */}
          {/* PLANS */}
          {/* ================================================== */}

          {selectedBiller && (
            <div className="space-y-3">
              {service !==
                "data" && (
                <div className="flex items-center justify-between">
                  <Label>
                    {selectedProviderName ||
                      "Available Plans"}
                  </Label>

                  {loadingItems && (
                    <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                  )}
                </div>
              )}

              {loadingItems ? (
                <div className="flex items-center justify-center rounded-2xl bg-gray-50 p-8">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                </div>
              ) : visibleItems.length ===
                0 ? (
                <div className="rounded-xl bg-gray-50 p-5 text-center text-sm text-gray-500">
                  No plans available for
                  this provider.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {visibleItems.map(
                    (
                      item,
                      index,
                    ) => {
                      const code =
                        getItemCode(
                          item,
                        );

                      /*
                       * Some provider responses can
                       * occasionally have an empty item
                       * code. Avoid rendering an unusable
                       * button.
                       */
                      if (!code) {
                        return null;
                      }

                      const provider =
                        getProviderAmount(
                          item,
                        );

                      const selling =
                        getSellingPrice(
                          item,
                        );

                      const selected =
                        selectedItem &&
                        getItemCode(
                          selectedItem,
                        ) ===
                          code;

                      return (
                        <button
                          key={`${code}-${index}`}
                          type="button"
                          disabled={
                            paying ||
                            loadingItems
                          }
                          onClick={() =>
                            selectItem(
                              item,
                            )
                          }
                          className={`rounded-2xl border p-4 text-left transition ${
                            selected
                              ? "border-blue-600 bg-blue-50 ring-2 ring-blue-100"
                              : "border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/30"
                          } ${
                            paying
                              ? "cursor-not-allowed opacity-60"
                              : "cursor-pointer"
                          }`}
                        >
                          <div className="mb-2 flex items-start justify-between gap-2">
                            <span className="text-sm font-semibold text-gray-900">
                              {getItemName(
                                item,
                              )}
                            </span>

                            {selected && (
                              <CheckCircle2 className="h-5 w-5 shrink-0 text-blue-600" />
                            )}
                          </div>

                          {getValidity(
                            item,
                          ) && (
                            <p className="mb-2 text-xs text-gray-500">
                              {getValidity(
                                item,
                              )}
                            </p>
                          )}

                          <div className="font-bold text-blue-600">
                            {formatMoney(
                              selling,
                            )}
                          </div>

                          <div className="mt-1 space-y-0.5">
                            <p className="text-[10px] text-gray-400">
                              Provider:{" "}
                              {formatMoney(
                                provider,
                              )}
                            </p>

                            <p className="text-[10px] text-green-600">
                              +₦
                              {getProfit(
                                item,
                              )}{" "}
                              service charge
                            </p>
                          </div>
                        </button>
                      );
                    },
                  )}
                </div>
              )}
            </div>
          )}

          {/* ================================================== */}
          {/* PAYMENT SUMMARY */}
          {/* ================================================== */}

          {selectedItem &&
            providerAmount > 0 && (
              <div className="rounded-2xl bg-gray-50 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <span className="text-sm text-gray-500">
                    Plan
                  </span>

                  <span className="max-w-[65%] text-right text-sm font-medium text-gray-900">
                    {getItemName(
                      selectedItem,
                    )}
                  </span>
                </div>

                {isPhoneService && (
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="text-sm text-gray-500">
                      Phone
                    </span>

                    <span className="text-sm font-medium text-gray-900">
                      {customerValue}
                    </span>
                  </div>
                )}

                {getValidity(
                  selectedItem,
                ) && (
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="text-sm text-gray-500">
                      Validity
                    </span>

                    <span className="text-sm text-gray-700">
                      {getValidity(
                        selectedItem,
                      )}
                    </span>
                  </div>
                )}

                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm text-gray-500">
                    Provider price
                  </span>

                  <span className="text-sm text-gray-700">
                    {formatMoney(
                      providerAmount,
                    )}
                  </span>
                </div>

                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm text-gray-500">
                    Service charge
                  </span>

                  <span className="text-sm text-gray-700">
                    {formatMoney(
                      profit,
                    )}
                  </span>
                </div>

                <div className="mt-3 border-t pt-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-900">
                      You pay
                    </span>

                    <span className="text-xl font-bold text-blue-600">
                      {formatMoney(
                        sellingPrice,
                      )}
                    </span>
                  </div>
                </div>
              </div>
            )}

          {/* ================================================== */}
          {/* BUY BUTTON */}
          {/* ================================================== */}

          <Button
            type="button"
            onClick={
              handlePayment
            }
            disabled={
              !canPay
            }
            className="h-12 w-full rounded-xl text-base font-semibold"
          >
            {paying ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Processing...
              </>
            ) : selectedItem ? (
              `Buy ${formatMoney(
                sellingPrice,
              )}`
            ) : (
              "Select a plan"
            )}
          </Button>

          {/* ================================================== */}
          {/* PRICE NOTE */}
          {/* ================================================== */}

          {selectedItem && (
            <p className="text-center text-[11px] text-gray-400">
              Provider price + ₦50 service
              charge
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
