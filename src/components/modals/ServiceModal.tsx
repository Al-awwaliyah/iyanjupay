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

import {
  Loader2,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";

import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

// ============================================================
// TYPES
// ============================================================

interface ServiceModalProps {
  isOpen: boolean;

  onClose: () => void;

  service: {
    title: string;
    type: string;
  } | null;

  walletBalance: number;

  onPurchase: (
    amount: number,
    details: Record<string, any>
  ) => Promise<void>;
}

interface Biller {
  id?: number | string;

  name?: string;
  biller_name?: string;
  billerName?: string;
  short_name?: string;

  biller_code?: string;
  billerCode?: string;

  category?: string;
  country?: string;
  country_code?: string;

  logo?: string | null;
  description?: string;

  [key: string]: any;
}

interface BillItem {
  id?: number | string;

  biller_code?: string;
  billerCode?: string;

  item_code?: string;
  itemCode?: string;

  product_code?: string;
  productCode?: string;

  name?: string;
  item_name?: string;
  itemName?: string;
  short_name?: string;
  description?: string;

  amount?: number | string;
  price?: number | string;
  cost?: number | string;
  value?: number | string;

  provider_amount?: number | string;
  selling_price?: number | string;
  profit?: number | string;

  minimum?: number | string;
  maximum?: number | string;
  fee?: number | string;

  validity?: string;
  validity_period?: string;
  validityPeriod?: string;

  period?: string;
  period_label?: string;

  label_name?: string;
  label_name_2?: string;

  is_airtime?: boolean;

  country?: string;
  currency?: string;

  [key: string]: any;
}

// ============================================================
// CONSTANTS
// ============================================================

const MARKUP = 50;

const SERVICE_CATEGORY_MAP: Record<
  string,
  string
> = {
  airtime: "AIRTIME",
  data: "MOBILEDATA",
  electricity: "UTILITYBILLS",
  cable: "CABLEBILLS",
  internet: "INTSERVICE",
};

// ============================================================
// HELPERS
// ============================================================

function clean(
  value: unknown
): string {
  return String(
    value ?? ""
  ).trim();
}

function getBillerCode(
  biller: Biller
): string {
  return clean(
    biller.biller_code ??
      biller.billerCode
  );
}

function getBillerName(
  biller: Biller
): string {
  return clean(
    biller.name ??
      biller.biller_name ??
      biller.billerName ??
      biller.short_name ??
      "Provider"
  );
}

function getItemCode(
  item: BillItem
): string {
  return clean(
    item.item_code ??
      item.itemCode ??
      item.product_code ??
      item.productCode
  );
}

function getItemName(
  item: BillItem
): string {
  return clean(
    item.name ??
      item.item_name ??
      item.itemName ??
      item.short_name ??
      item.description ??
      "Bill package"
  );
}

function getProviderAmount(
  item: BillItem
): number {
  const values = [
    item.provider_amount,
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
      return Number(
        number.toFixed(2)
      );
    }
  }

  return 0;
}

function getValidity(
  item: BillItem
): string {
  return clean(
    item.validity ??
      item.validity_period ??
      item.validityPeriod ??
      item.period_label ??
      ""
  );
}

function getPlanType(
  item: BillItem
): "daily" | "weekly" | "monthly" | "other" {
  const explicitPeriod =
    clean(
      item.period
    ).toLowerCase();

  if (
    explicitPeriod === "daily" ||
    explicitPeriod === "weekly" ||
    explicitPeriod === "monthly"
  ) {
    return explicitPeriod;
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

function formatMoney(
  amount: number
): string {
  return `₦${Number(
    amount || 0
  ).toLocaleString(
    "en-NG",
    {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }
  )}`;
}

// ============================================================
// PHONE NORMALISATION
// ============================================================

function normalizeNigerianPhone(
  value: string
): string {
  let phone =
    value
      .replace(
        /\s+/g,
        ""
      )
      .trim();

  // 08012345678
  if (
    /^0\d{10}$/.test(phone)
  ) {
    return `+234${phone.slice(1)}`;
  }

  // 8012345678
  if (
    /^\d{10}$/.test(phone)
  ) {
    return `+234${phone}`;
  }

  // 2348012345678
  if (
    /^234\d{10}$/.test(phone)
  ) {
    return `+${phone}`;
  }

  // +2348012345678
  if (
    /^\+234\d{10}$/.test(phone)
  ) {
    return phone;
  }

  return phone;
}

// ============================================================
// COMPONENT
// ============================================================

const ServiceModal = ({
  isOpen,
  onClose,
  service,
  walletBalance,
  onPurchase,
}: ServiceModalProps) => {
  const { toast } =
    useToast();

  // ==========================================================
  // STATE
  // ==========================================================

  const [customer, setCustomer] =
    useState("");

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

  const [
    planTab,
    setPlanTab,
  ] = useState<
    "daily" |
    "weekly" |
    "monthly" |
    "other"
  >("daily");

  // ==========================================================
  // SERVICE
  // ==========================================================

  const serviceType =
    service?.type ?? "";

  const category =
    useMemo(
      () =>
        SERVICE_CATEGORY_MAP[
          serviceType
        ] ?? "",
      [serviceType]
    );

  const isPhoneService =
    serviceType === "airtime" ||
    serviceType === "data";

  // ==========================================================
  // SELECTED BILLER
  // ==========================================================

  const selectedBiller =
    useMemo(
      () =>
        billers.find(
          (biller) =>
            getBillerCode(
              biller
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
            getItemCode(
              item
            ) ===
            selectedItemCode
        ) ?? null,
      [
        items,
        selectedItemCode,
      ]
    );

  // ==========================================================
  // CUSTOMER LABEL
  // ==========================================================

  const customerLabel =
    useMemo(() => {
      if (
        selectedItem?.label_name
      ) {
        return selectedItem.label_name;
      }

      switch (
        serviceType
      ) {
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
          return "Customer Number";
      }
    }, [
      selectedItem,
      serviceType,
    ]);

  // ==========================================================
  // CUSTOMER PLACEHOLDER
  // ==========================================================

  const customerPlaceholder =
    useMemo(() => {
      switch (
        serviceType
      ) {
        case "airtime":
        case "data":
          return "08012345678";

        case "electricity":
          return "Enter meter number";

        case "cable":
          return "Enter smartcard number";

        case "internet":
          return "Enter account number";

        default:
          return "Enter customer number";
      }
    }, [serviceType]);

  // ==========================================================
  // RESET
  // ==========================================================

  const resetForm = () => {
    setCustomer("");

    setBillers([]);

    setItems([]);

    setSelectedBillerCode("");

    setSelectedItemCode("");

    setError("");

    setPlanTab("daily");

    setLoadingBillers(false);

    setLoadingItems(false);

    setProcessingPayment(false);
  };

  // ==========================================================
  // RESET WHEN MODAL/SERVICE CHANGES
  // ==========================================================

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setCustomer("");

    setBillers([]);

    setItems([]);

    setSelectedBillerCode("");

    setSelectedItemCode("");

    setError("");

    setPlanTab(
      serviceType === "data"
        ? "daily"
        : "other"
    );
  }, [
    isOpen,
    serviceType,
  ]);

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

      try {
        const {
          data,
          error:
            functionError,
        } =
          await supabase.functions.invoke(
            "flutterwave-bills",
            {
              body: {
                action:
                  "billers",

                category,

                country:
                  "NG",
              },
            }
          );

        if (functionError) {
          console.error(
            "Billers function error:",
            functionError
          );

          throw new Error(
            functionError.message ||
              "Unable to load bill providers."
          );
        }

        if (
          !data ||
          data.success !== true
        ) {
          throw new Error(
            data?.error ||
              data?.message ||
              "Unable to load bill providers."
          );
        }

        const loadedBillers =
          Array.isArray(
            data.billers
          )
            ? data.billers
            : [];

        setBillers(
          loadedBillers
        );

        if (
          loadedBillers.length === 0
        ) {
          setError(
            "No providers are currently available for this service."
          );
        }
      } catch (
        err: any
      ) {
        console.error(
          "Failed to load billers:",
          err
        );

        const message =
          err?.message ||
          "Unable to load bill providers.";

        setError(message);

        toast({
          title:
            "Unable to load providers",
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
  // LOAD BILLERS WHEN OPEN
  // ==========================================================

  useEffect(() => {
    if (
      !isOpen ||
      !category
    ) {
      return;
    }

    loadBillers();
  }, [
    isOpen,
    category,
  ]);

  // ==========================================================
  // LOAD ITEMS
  // ==========================================================

  const loadItems =
    async (
      billerCode: string
    ) => {
      const cleanCode =
        String(
          billerCode ?? ""
        ).trim();

      if (!cleanCode) {
        setItems([]);
        return;
      }

      setLoadingItems(true);

      setError("");

      setItems([]);

      setSelectedItemCode("");

      try {
        const {
          data,
          error:
            functionError,
        } =
          await supabase.functions.invoke(
            "flutterwave-bills",
            {
              body: {
                action:
                  "items",

                biller_code:
                  cleanCode,

                country:
                  "NG",
              },
            }
          );

        if (functionError) {
          console.error(
            "Bill items function error:",
            functionError
          );

          throw new Error(
            functionError.message ||
              "Unable to load bill packages."
          );
        }

        if (
          !data ||
          data.success !== true
        ) {
          throw new Error(
            data?.error ||
              data?.message ||
              "Unable to load bill packages."
          );
        }

        /*
         * IMPORTANT:
         *
         * Always use data.items.
         *
         * The Data grouping happens locally
         * AFTER receiving the catalogue.
         *
         * This fixes:
         *
         * "No packages are currently available"
         *
         * for Airtime, Electricity,
         * Cable and Internet.
         */
        const loadedItems =
          Array.isArray(
            data.items
          )
            ? data.items
            : [];

        setItems(
          loadedItems
        );

        if (
          loadedItems.length === 0
        ) {
          setError(
            "No packages are currently available for this provider."
          );
          return;
        }

        /*
         * Automatically select the first
         * available Data tab.
         */
        if (
          serviceType === "data"
        ) {
          const hasDaily =
            loadedItems.some(
              (item) =>
                getProviderAmount(
                  item
                ) > 0 &&
                getPlanType(
                  item
                ) === "daily"
            );

          const hasWeekly =
            loadedItems.some(
              (item) =>
                getProviderAmount(
                  item
                ) > 0 &&
                getPlanType(
                  item
                ) === "weekly"
            );

          const hasMonthly =
            loadedItems.some(
              (item) =>
                getProviderAmount(
                  item
                ) > 0 &&
                getPlanType(
                  item
                ) === "monthly"
            );

          const hasOther =
            loadedItems.some(
              (item) =>
                getProviderAmount(
                  item
                ) > 0 &&
                getPlanType(
                  item
                ) === "other"
            );

          if (hasDaily) {
            setPlanTab("daily");
          } else if (
            hasWeekly
          ) {
            setPlanTab("weekly");
          } else if (
            hasMonthly
          ) {
            setPlanTab("monthly");
          } else if (
            hasOther
          ) {
            setPlanTab("other");
          }
        }
      } catch (
        err: any
      ) {
        console.error(
          "Failed to load bill items:",
          err
        );

        const message =
          err?.message ||
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
        processingPayment
      ) {
        return;
      }

      setSelectedBillerCode(
        value
      );

      setSelectedItemCode("");

      setCustomer("");

      setError("");

      if (!value) {
        setItems([]);
        return;
      }

      await loadItems(
        value
      );
    };

  // ==========================================================
  // ITEM CHANGE
  // ==========================================================

  const handleItemChange =
    (
      value: string
    ) => {
      if (
        processingPayment
      ) {
        return;
      }

      setSelectedItemCode(
        value
      );

      setError("");
    };

  // ==========================================================
  // DATA GROUPING
  // ==========================================================

  const groupedItems =
    useMemo(() => {
      const groups: Record<
        "daily" |
          "weekly" |
          "monthly" |
          "other",
        BillItem[]
      > = {
        daily: [],
        weekly: [],
        monthly: [],
        other: [],
      };

      for (
        const item of items
      ) {
        if (
          getProviderAmount(
            item
          ) <= 0
        ) {
          continue;
        }

        const type =
          getPlanType(item);

        groups[type].push(
          item
        );
      }

      return groups;
    }, [items]);

  // ==========================================================
  // VISIBLE ITEMS
  // ==========================================================

  const visibleItems =
    serviceType === "data"
      ? groupedItems[
          planTab
        ]
      : items.filter(
          (item) =>
            getProviderAmount(
              item
            ) > 0
        );

  // ==========================================================
  // CUSTOMER VALUE
  // ==========================================================

  const finalCustomer =
    isPhoneService
      ? normalizeNigerianPhone(
          customer
        )
      : customer.trim();

  // ==========================================================
  // PHONE VALIDATION
  // ==========================================================

  const validPhone =
    !isPhoneService ||
    /^\+234\d{10}$/.test(
      finalCustomer
    );

  // ==========================================================
  // PROVIDER AMOUNT
  // ==========================================================

  const providerAmount =
    selectedItem
      ? getProviderAmount(
          selectedItem
        )
      : 0;

  // ==========================================================
  // FINAL SELLING PRICE
  //
  // Provider price + ₦50
  //
  // The ₦50 is NOT shown separately.
  // ==========================================================

  const finalAmount =
    providerAmount > 0
      ? Number(
          (
            providerAmount +
            MARKUP
          ).toFixed(2)
        )
      : 0;

  // ==========================================================
  // VALIDATE PURCHASE
  // ==========================================================

  const validatePurchase =
    (): boolean => {
      if (
        !selectedBillerCode
      ) {
        toast({
          title:
            "Select a provider",
          description:
            "Please select a bill provider.",
          variant:
            "destructive",
        });

        return false;
      }

      if (
        !selectedItemCode ||
        !selectedItem
      ) {
        toast({
          title:
            "Select a package",
          description:
            "Please select a bill package.",
          variant:
            "destructive",
        });

        return false;
      }

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

      if (
        isPhoneService &&
        !validPhone
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

      if (
        providerAmount <= 0
      ) {
        toast({
          title:
            "Invalid package",
          description:
            "The selected package has no valid price.",
          variant:
            "destructive",
        });

        return false;
      }

      if (
        finalAmount <= 0
      ) {
        toast({
          title:
            "Invalid amount",
          description:
            "Unable to determine the purchase amount.",
          variant:
            "destructive",
        });

        return false;
      }

      /*
       * UX balance check only.
       *
       * Backend remains authoritative.
       */
      if (
        Number.isFinite(
          walletBalance
        ) &&
        Number(
          walletBalance
        ) >= 0 &&
        finalAmount >
          Number(
            walletBalance
          )
      ) {
        toast({
          title:
            "Insufficient Balance",
          description:
            `You need ${formatMoney(
              finalAmount
            )} to complete this purchase.`,
          variant:
            "destructive",
        });

        return false;
      }

      return true;
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
        processingPayment
      ) {
        return;
      }

      if (
        !validatePurchase()
      ) {
        return;
      }

      /*
       * IMPORTANT:
       *
       * finalAmount already contains
       * provider price + ₦50.
       *
       * The UI never exposes the markup.
       */
      const details = {
        service:
          serviceType,

        type:
          serviceType,

        country:
          "NG",

        customer:
          finalCustomer,

        biller_code:
          selectedBillerCode,

        item_code:
          selectedItemCode,

        provider:
          getBillerName(
            selectedBiller!
          ),

        /*
         * Phone aliases for
         * Airtime/Data compatibility.
         */
        phone:
          isPhoneService
            ? finalCustomer
            : "",

        phoneNumber:
          isPhoneService
            ? finalCustomer
            : "",

        phone_number:
          isPhoneService
            ? finalCustomer
            : "",

        /*
         * Electricity
         */
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

        /*
         * Cable
         */
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

        /*
         * Internet
         */
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

        /*
         * Catalogue information.
         *
         * This is sent to the parent/Edge Function
         * for verification, but NOT displayed.
         */
        item:
          selectedItem,

        biller:
          selectedBiller,

        provider_amount:
          providerAmount,

        selling_price:
          finalAmount,

        /*
         * Keep markup explicit for server-side
         * verification.
         */
        markup:
          MARKUP,
      };

      console.log(
        "Sending bill purchase:",
        {
          service:
            serviceType,

          amount:
            finalAmount,

          biller_code:
            selectedBillerCode,

          item_code:
            selectedItemCode,

          customer:
            finalCustomer,
        }
      );

      try {
        setProcessingPayment(
          true
        );

        setError("");

        /*
         * This remains compatible with
         * your existing Dashboard handler.
         */
        await onPurchase(
          finalAmount,
          details
        );

        toast({
          title:
            "Payment successful",
          description:
            `${service.title} purchase has been processed.`,
        });

        resetForm();

        onClose();
      } catch (
        err: any
      ) {
        console.error(
          "Service purchase failed:",
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
        setProcessingPayment(
          false
        );
      }
    };

  // ==========================================================
  // CLOSE
  // ==========================================================

  const handleClose =
    () => {
      if (
        processingPayment
      ) {
        return;
      }

      resetForm();

      onClose();
    };

  // ==========================================================
  // NO SERVICE
  // ==========================================================

  if (!service) {
    return null;
  }

  // ==========================================================
  // UI
  // ==========================================================

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(
        open
      ) => {
        if (
          !open &&
          !processingPayment
        ) {
          handleClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">

        <DialogHeader>
          <DialogTitle className="text-center text-green-700">
            {service.title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">

          {/* ================================================== */}
          {/* WALLET */}
          {/* ================================================== */}

          <div className="rounded-lg bg-green-50 p-3">
            <p className="text-sm text-green-700">
              Wallet Balance:{" "}
              {formatMoney(
                Number(
                  walletBalance || 0
                )
              )}
            </p>
          </div>

          {/* ================================================== */}
          {/* ERROR */}
          {/* ================================================== */}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3">
              <p className="text-sm text-red-700">
                {error}
              </p>
            </div>
          )}

          {/* ================================================== */}
          {/* LOADING BILLERS */}
          {/* ================================================== */}

          {loadingBillers && (
            <div className="flex items-center justify-center gap-2 py-3 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading providers...
            </div>
          )}

          {/* ================================================== */}
          {/* PROVIDER */}
          {/* ================================================== */}

          <div className="space-y-2">

            <div className="flex items-center justify-between">

              <Label>
                Provider
              </Label>

              {!loadingBillers &&
                !processingPayment && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={
                      loadBillers
                    }
                    className="h-7 px-2"
                  >
                    <RefreshCw className="mr-1 h-3.5 w-3.5" />
                    Refresh
                  </Button>
                )}

            </div>

            <Select
              value={
                selectedBillerCode
              }
              onValueChange={
                handleBillerChange
              }
              disabled={
                loadingBillers ||
                processingPayment ||
                billers.length ===
                  0
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
                    index
                  ) => {
                    const code =
                      getBillerCode(
                        biller
                      );

                    if (!code) {
                      return null;
                    }

                    return (
                      <SelectItem
                        key={`${code}-${index}`}
                        value={code}
                      >
                        {getBillerName(
                          biller
                        )}
                      </SelectItem>
                    );
                  }
                )}

              </SelectContent>

            </Select>

          </div>

          {/* ================================================== */}
          {/* DATA TABS */}
          {/* ================================================== */}

          {serviceType ===
            "data" &&
            selectedBillerCode &&
            !loadingItems && (
              <div className="space-y-2">

                <Label>
                  Data Package
                </Label>

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
                            processingPayment ||
                            count ===
                              0
                          }
                          onClick={() => {
                            setPlanTab(
                              value
                            );

                            setSelectedItemCode(
                              ""
                            );

                            setError(
                              ""
                            );
                          }}
                          className={`rounded-lg px-2 py-2 text-xs font-semibold transition ${
                            planTab ===
                            value
                              ? "bg-green-600 text-white"
                              : "bg-gray-100 text-gray-600"
                          } ${
                            count ===
                            0
                              ? "cursor-not-allowed opacity-40"
                              : "hover:bg-green-50"
                          }`}
                        >
                          {label}

                          <span className="ml-1 opacity-70">
                            ({count})
                          </span>
                        </button>
                      );
                    }
                  )}

                </div>

              </div>
            )}

          {/* ================================================== */}
          {/* PACKAGE */}
          {/* ================================================== */}

          <div className="space-y-2">

            <div className="flex items-center justify-between">

              <Label>
                {serviceType ===
                "airtime"
                  ? "Airtime Type"
                  : serviceType ===
                      "data"
                    ? "Data Package"
                    : "Bill Package"}
              </Label>

              {loadingItems && (
                <Loader2 className="h-4 w-4 animate-spin text-green-600" />
              )}

            </div>

            <Select
              value={
                selectedItemCode
              }
              onValueChange={
                handleItemChange
              }
              disabled={
                loadingItems ||
                processingPayment ||
                !selectedBillerCode ||
                visibleItems.length ===
                  0
              }
            >

              <SelectTrigger>
                <SelectValue
                  placeholder={
                    loadingItems
                      ? "Loading packages..."
                      : !selectedBillerCode
                        ? "Select provider first"
                        : visibleItems.length ===
                            0
                          ? "No packages available"
                          : "Select package"
                  }
                />
              </SelectTrigger>

              <SelectContent>

                {visibleItems.map(
                  (
                    item,
                    index
                  ) => {
                    const code =
                      getItemCode(
                        item
                      );

                    if (!code) {
                      return null;
                    }

                    return (
                      <SelectItem
                        key={`${code}-${index}`}
                        value={code}
                      >
                        {getItemName(
                          item
                        )}
                      </SelectItem>
                    );
                  }
                )}

              </SelectContent>

            </Select>

            {!loadingItems &&
              selectedBillerCode &&
              visibleItems.length ===
                0 && (
                <p className="text-xs text-gray-500">
                  No packages are available in this category for the selected provider.
                </p>
              )}

          </div>

          {/* ================================================== */}
          {/* CUSTOMER */}
          {/* ================================================== */}

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
              ) => {
                setCustomer(
                  event.target.value
                );

                setError("");
              }}
              placeholder={
                customerPlaceholder
              }
              disabled={
                processingPayment
              }
              type={
                isPhoneService
                  ? "tel"
                  : "text"
              }
              inputMode={
                isPhoneService ||
                serviceType ===
                  "electricity" ||
                serviceType ===
                  "cable"
                  ? "numeric"
                  : "text"
              }
            />

            {isPhoneService &&
              customer &&
              !validPhone && (
                <p className="text-xs text-red-600">
                  Enter a valid Nigerian phone number.
                </p>
              )}

          </div>

          {/* ================================================== */}
          {/* PAYMENT SUMMARY */}
          {/* ================================================== */}

          {selectedItem &&
            finalAmount > 0 && (
              <div className="rounded-xl bg-gray-50 p-4">

                <div className="mb-3 flex items-center justify-between gap-3">

                  <span className="text-sm text-gray-500">
                    Package
                  </span>

                  <span className="max-w-[65%] text-right text-sm font-medium text-gray-900">
                    {getItemName(
                      selectedItem
                    )}
                  </span>

                </div>

                <div className="mb-3 flex items-center justify-between gap-3">

                  <span className="text-sm text-gray-500">
                    Customer
                  </span>

                  <span className="max-w-[65%] break-all text-right text-sm font-medium text-gray-900">
                    {finalCustomer}
                  </span>

                </div>

                {/* 
                 * IMPORTANT:
                 *
                 * No provider price.
                 * No ₦50 markup line.
                 * Only final amount.
                 */}

                <div className="border-t pt-3">

                  <div className="flex items-center justify-between">

                    <span className="font-semibold text-gray-900">
                      Total
                    </span>

                    <span className="text-xl font-bold text-green-600">
                      {formatMoney(
                        finalAmount
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
              handlePurchase
            }
            disabled={
              processingPayment ||
              loadingBillers ||
              loadingItems ||
              !selectedBillerCode ||
              !selectedItemCode ||
              !customer.trim() ||
              !validPhone ||
              finalAmount <= 0
            }
            className="w-full bg-green-600 hover:bg-green-700"
          >

            {processingPayment ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : selectedItem ? (
              <>
                Buy{" "}
                {formatMoney(
                  finalAmount
                )}
              </>
            ) : (
              "Select a package"
            )}

          </Button>

          {processingPayment && (
            <p className="text-center text-xs text-gray-500">
              Please do not close this window while your payment is being processed.
            </p>
          )}

        </div>

      </DialogContent>
    </Dialog>
  );
};

export default ServiceModal;
