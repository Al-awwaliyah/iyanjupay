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

function getItemCode(item: BillItem): string {
  return String(
    item.item_code ??
      item.itemCode ??
      item.product_code ??
      item.productCode ??
      "",
  ).trim();
}

function getBillerCode(item: BillItem): string {
  return String(
    item.biller_code ??
      item.billerCode ??
      "",
  ).trim();
}

function getItemName(item: BillItem): string {
  return String(
    item.name ??
      item.item_name ??
      item.itemName ??
      item.description ??
      "Bill package",
  ).trim();
}

function getProviderAmount(item: BillItem): number {
  const values = [
    item.amount,
    item.price,
    item.cost,
    item.value,
  ];

  for (const value of values) {
    const number = Number(value);

    if (
      Number.isFinite(number) &&
      number > 0
    ) {
      return Number(number.toFixed(2));
    }
  }

  return 0;
}

function getBillerName(biller: Biller): string {
  return String(
    biller.name ??
      biller.biller_name ??
      biller.billerName ??
      "Provider",
  ).trim();
}

function getValidity(item: BillItem): string {
  return String(
    item.validity ??
      item.validity_period ??
      item.validityPeriod ??
      "",
  ).trim();
}

function getPlanType(item: BillItem): "daily" | "weekly" | "monthly" | "other" {
  const text = `${getItemName(item)} ${getValidity(item)}`.toLowerCase();

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

function normalizePhone(value: string): string {
  return value.replace(/\s+/g, "").trim();
}

function formatMoney(value: number): string {
  return `₦${value.toLocaleString("en-NG", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

export default function ServiceModal({
  open,
  onClose,
  service,
  walletBalance = 0,
  onSuccess,
}: ServiceModalProps) {
  const [billers, setBillers] = useState<Biller[]>([]);
  const [items, setItems] = useState<BillItem[]>([]);

  const [selectedBiller, setSelectedBiller] = useState("");
  const [selectedItem, setSelectedItem] =
    useState<BillItem | null>(null);

  const [phoneNumber, setPhoneNumber] =
    useState("");

  const [customer, setCustomer] =
    useState("");

  const [loadingBillers, setLoadingBillers] =
    useState(false);

  const [loadingItems, setLoadingItems] =
    useState(false);

  const [paying, setPaying] =
    useState(false);

  const [error, setError] =
    useState("");

  const [successMessage, setSuccessMessage] =
    useState("");

  const [planTab, setPlanTab] =
    useState<"daily" | "weekly" | "monthly" | "other">(
      "daily",
    );

  // ============================================================
  // RESET
  // ============================================================

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
    setPlanTab("daily");
  }, [open, service]);

  // ============================================================
  // LOAD FLUTTERWAVE BILLERS
  // ============================================================

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    async function loadBillers() {
      setLoadingBillers(true);
      setError("");

      try {
        const { data, error } =
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
            Array.isArray(data.billers)
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

  // ============================================================
  // LOAD FLUTTERWAVE ITEMS
  // ============================================================

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
        const { data, error } =
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
          const loadedItems =
            Array.isArray(data.items)
              ? data.items
              : [];

          setItems(loadedItems);

          if (
            loadedItems.length > 0
          ) {
            const firstDaily =
              loadedItems.find(
                (item: BillItem) =>
                  getPlanType(item) ===
                  "daily",
              );

            setPlanTab(
              firstDaily
                ? "daily"
                : "other",
            );
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
  }, [selectedBiller]);

  // ============================================================
  // GROUP PLANS
  // ============================================================

  const groupedItems = useMemo(() => {
    const groups = {
      daily: [] as BillItem[],
      weekly: [] as BillItem[],
      monthly: [] as BillItem[],
      other: [] as BillItem[],
    };

    for (const item of items) {
      const amount =
        getProviderAmount(item);

      if (amount <= 0) continue;

      const type =
        getPlanType(item);

      groups[type].push(item);
    }

    return groups;
  }, [items]);

  const visibleItems =
    groupedItems[planTab];

  // ============================================================
  // SELECT ITEM
  // ============================================================

  function selectItem(item: BillItem) {
    setSelectedItem(item);
    setError("");
  }

  // ============================================================
  // CUSTOMER VALUE
  // ============================================================

  const isPhoneService =
    service === "airtime" ||
    service === "data";

  const customerValue =
    isPhoneService
      ? normalizePhone(phoneNumber)
      : customer.trim();

  // ============================================================
  // PAYMENT
  // ============================================================

  async function handlePayment() {
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
        "Please select a bill package.",
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
      !/^(?:\+?234|0)[0-9]{10}$/.test(
        customerValue,
      )
    ) {
      setError(
        "Please enter a valid Nigerian phone number.",
      );
      return;
    }

    const providerAmount =
      getProviderAmount(
        selectedItem,
      );

    if (providerAmount <= 0) {
      setError(
        "This Flutterwave plan does not have a valid provider price.",
      );
      return;
    }

    const sellingPrice =
      Number(
        (
          providerAmount +
          MARKUP
        ).toFixed(2),
      );

    if (
      walletBalance > 0 &&
      walletBalance < sellingPrice
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
       * provider_amount = Flutterwave price
       * selling_price   = Flutterwave price + ₦50
       *
       * The backend will verify the provider amount
       * against Flutterwave's catalogue again.
       */

      const { data, error } =
        await supabase.functions.invoke(
          "flutterwave-bills",
          {
            body: {
              action: "pay",

              service,

              biller_code:
                selectedBiller,

              item_code:
                getItemCode(
                  selectedItem,
                ),

              customer:
                customerValue,

              /*
               * This is the amount the customer
               * actually pays.
               */
              selling_price:
                sellingPrice,

              /*
               * This is what Flutterwave's
               * catalogue says the plan costs.
               */
              provider_amount:
                providerAmount,

              /*
               * Keep amount for compatibility
               * with your current backend.
               */
              amount:
                sellingPrice,

              details: {
                phone_number:
                  isPhoneService
                    ? customerValue
                    : phoneNumber,

                plan_name:
                  getItemName(
                    selectedItem,
                  ),

                plan_validity:
                  getValidity(
                    selectedItem,
                  ),

                provider_amount:
                  providerAmount,

                selling_price:
                  sellingPrice,

                profit:
                  MARKUP,
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

      if (!data?.success) {
        throw new Error(
          data?.error ||
            "Bill payment failed.",
        );
      }

      if (
        data.status ===
        "failed"
      ) {
        throw new Error(
          data?.error ||
            "Bill payment failed.",
        );
      }

      setSuccessMessage(
        data.status ===
          "pending"
          ? "Payment is being verified."
          : "Payment successful.",
      );

      onSuccess?.(data);

      /*
       * Give the transaction response a moment
       * before closing the modal.
       */
      setTimeout(() => {
        onClose();
      }, 1000);
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

  if (!open) {
    return null;
  }

  const selectedProvider =
    billers.find(
      (biller) =>
        String(
          biller.biller_code ??
            biller.billerCode ??
            "",
        ) === selectedBiller,
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
    providerAmount > 0
      ? providerAmount +
        MARKUP
      : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div className="max-h-[95vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white shadow-xl sm:rounded-3xl">
        {/* HEADER */}
        <div className="sticky top-0 z-10 border-b bg-white px-5 py-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <div className="rounded-xl bg-blue-50 p-2 text-blue-600">
                  {SERVICE_ICONS[service]}
                </div>

                <div>
                  <h2 className="font-semibold text-gray-900">
                    {SERVICE_LABELS[service]}
                  </h2>

                  <p className="text-xs text-gray-500">
                    Select a provider and package
                  </p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-full px-3 py-2 text-xl text-gray-400 hover:bg-gray-100"
            >
              ×
            </button>
          </div>
        </div>

        <div className="space-y-5 p-5">
          {/* ERROR */}
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* SUCCESS */}
          {successMessage && (
            <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700">
              <CheckCircle2 className="h-4 w-4" />
              {successMessage}
            </div>
          )}

          {/* PROVIDER */}
          <div className="space-y-2">
            <Label>Provider</Label>

            <div className="relative">
              <select
                value={selectedBiller}
                onChange={(e) =>
                  setSelectedBiller(
                    e.target.value,
                  )
                }
                disabled={
                  loadingBillers ||
                  paying
                }
                className="h-11 w-full appearance-none rounded-xl border bg-white px-3 pr-10 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">
                  {loadingBillers
                    ? "Loading providers..."
                    : "Select provider"}
                </option>

                {billers.map(
                  (biller) => {
                    const code =
                      String(
                        biller.biller_code ??
                          biller.billerCode ??
                          "",
                      );

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

          {/* PHONE / CUSTOMER */}
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
            />
          </div>

          {/* PLANS */}
          {selectedBiller && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>
                  {selectedProviderName ||
                    "Available Plans"}
                </Label>

                {loadingItems && (
                  <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                )}
              </div>

              {service ===
                "data" && (
                <div className="flex gap-2 overflow-x-auto pb-1">
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

                      if (
                        count ===
                          0 &&
                        value !==
                          planTab
                      ) {
                        return null;
                      }

                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() =>
                            setPlanTab(
                              value,
                            )
                          }
                          className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium ${
                            planTab ===
                            value
                              ? "bg-blue-600 text-white"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {label}
                        </button>
                      );
                    },
                  )}
                </div>
              )}

              {!loadingItems &&
                visibleItems.length ===
                  0 && (
                  <div className="rounded-xl bg-gray-50 p-5 text-center text-sm text-gray-500">
                    No plans available for this provider.
                  </div>
                )}

              <div className="grid grid-cols-2 gap-3">
                {visibleItems.map(
                  (item) => {
                    const code =
                      getItemCode(
                        item,
                      );

                    const provider =
                      getProviderAmount(
                        item,
                      );

                    const selling =
                      provider +
                      MARKUP;

                    const selected =
                      selectedItem &&
                      getItemCode(
                        selectedItem,
                      ) === code;

                    return (
                      <button
                        key={code}
                        type="button"
                        onClick={() =>
                          selectItem(
                            item,
                          )
                        }
                        disabled={
                          paying
                        }
                        className={`rounded-2xl border p-4 text-left transition ${
                          selected
                            ? "border-blue-600 bg-blue-50 ring-2 ring-blue-100"
                            : "border-gray-200 bg-white hover:border-blue-300"
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

                        <p className="mt-1 text-[10px] text-gray-400">
                          Provider:{" "}
                          {formatMoney(
                            provider,
                          )}
                        </p>
                      </button>
                    );
                  },
                )}
              </div>
            </div>
          )}

          {/* PAYMENT SUMMARY */}
          {selectedItem &&
            providerAmount > 0 && (
              <div className="rounded-2xl bg-gray-50 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm text-gray-500">
                    Plan
                  </span>

                  <span className="max-w-[60%] text-right text-sm font-medium text-gray-900">
                    {getItemName(
                      selectedItem,
                    )}
                  </span>
                </div>

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
                      MARKUP,
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

          {/* BUY BUTTON */}
          <Button
            type="button"
            onClick={handlePayment}
            disabled={
              paying ||
              !selectedItem ||
              !selectedBiller ||
              !customerValue
            }
            className="h-12 w-full rounded-xl"
          >
            {paying ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Processing...
              </>
            ) : selectedItem ? (
              `Pay ${formatMoney(
                sellingPrice,
              )}`
            ) : (
              "Select a plan"
            )}
          </Button>

          
        </div>
      </div>
    </div>
  );
}
