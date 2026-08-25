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
  Loader2,
  RefreshCw,
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

  [key: string]: any;
}

// ============================================================
// CONSTANTS
// ============================================================

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

const DATA_MARKUP = 50;

// Airtime cards requested by user.
const AIRTIME_AMOUNTS = [
  50,
  100,
  200,
  500,
  1000,
];

// Common bill-payment amount cards.
// Customer can always choose "Enter Amount".
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

function numberValue(
  value: unknown
): number {
  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : 0;
}

function formatNaira(
  value: number
): string {
  return `₦${Number(value).toLocaleString(
    "en-NG"
  )}`;
}

function getItemProviderPrice(
  item: BillItem | null
): number {
  return numberValue(
    item?.amount ??
      item?.price ??
      item?.cost ??
      item?.value
  );
}

function getDataSellingPrice(
  item: BillItem
): number {
  return (
    getItemProviderPrice(item) +
    DATA_MARKUP
  );
}

/**
 * Try to determine the data-plan validity group.
 *
 * Examples:
 *  - "1 Day 100MB"       => Daily
 *  - "7 Days 2GB"        => Weekly
 *  - "30 Days 10GB"      => Monthly
 *  - "Night Plan"        => Other
 */
function getDataGroup(
  item: BillItem
): "Daily" | "Weekly" | "Monthly" | "Other" {
  const text = [
    item.name,
    item.short_name,
    item.description,
    item.validity,
    item.duration,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  // Monthly first because "30 days" should be monthly.
  if (
    /\b(30|31)\s*(day|days)\b/.test(
      text
    ) ||
    /\bmonthly\b/.test(text) ||
    /\b1\s*month\b/.test(text) ||
    /\b2\s*months?\b/.test(text) ||
    /\b3\s*months?\b/.test(text)
  ) {
    return "Monthly";
  }

  if (
    /\b(7|14)\s*(day|days)\b/.test(
      text
    ) ||
    /\bweekly\b/.test(text) ||
    /\b1\s*week\b/.test(text) ||
    /\b2\s*weeks?\b/.test(text)
  ) {
    return "Weekly";
  }

  if (
    /\b(1|2|3)\s*(day|days)\b/.test(
      text
    ) ||
    /\bdaily\b/.test(text) ||
    /\b24\s*hours?\b/.test(text) ||
    /\bday\b/.test(text)
  ) {
    return "Daily";
  }

  return "Other";
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
  // ==========================================================
  // FORM STATE
  // ==========================================================

  const [amount, setAmount] =
    useState("");

  const [customer, setCustomer] =
    useState("");

  const [customAmountMode, setCustomAmountMode] =
    useState(false);

  // ==========================================================
  // FLUTTERWAVE CATALOGUE
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

  const [error, setError] =
    useState("");

  const { toast } =
    useToast();

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

  const isData =
    serviceType === "data";

  const isAirtime =
    serviceType === "airtime";

  // ==========================================================
  // SELECTED BILLER
  // ==========================================================

  const selectedBiller =
    useMemo(
      () =>
        billers.find(
          (biller) =>
            String(
              biller.biller_code ?? ""
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
            String(
              item.item_code ?? ""
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
      const groups: Record<
        "Daily" |
          "Weekly" |
          "Monthly" |
          "Other",
        BillItem[]
      > = {
        Daily: [],
        Weekly: [],
        Monthly: [],
        Other: [],
      };

      items.forEach(
        (item) => {
          const group =
            getDataGroup(item);

          groups[group].push(
            item
          );
        }
      );

      return groups;
    }, [items]);

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

  const customerPlaceholder =
    useMemo(() => {
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
  };

  // ==========================================================
  // RESET WHEN SERVICE CHANGES
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

    setLoadingBillers(false);

    setLoadingItems(false);

    setProcessingPayment(false);
  }, [serviceType]);

  // ==========================================================
  // LOAD BILLERS
  // ==========================================================

  const loadBillers = async () => {
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
          data?.billers
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
    } catch (err: any) {
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
  // LOAD BILLERS WHEN MODAL OPENS
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

  const loadItems = async (
    billerCode: string
  ) => {
    const cleanBillerCode =
      String(
        billerCode ?? ""
      ).trim();

    if (
      !cleanBillerCode
    ) {
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
              biller_code:
                cleanBillerCode,
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

      const loadedItems =
        Array.isArray(
          data?.items
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
      }
    } catch (err: any) {
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

      await loadItems(
        value
      );
    };

  // ==========================================================
  // DATA PLAN SELECTION
  // ==========================================================

  const handleDataPlanSelect =
    (
      item: BillItem
    ) => {
      if (
        processingPayment
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

      const providerPrice =
        getItemProviderPrice(
          item
        );

      if (
        providerPrice <= 0
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
        String(
          getDataSellingPrice(
            item
          )
        )
      );

      setCustomAmountMode(
        false
      );

      setError("");
    };

  // ==========================================================
  // ITEM CHANGE FOR NON-DATA
  // ==========================================================

  const handleItemChange = (
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

    // Non-data bills don't automatically force a price.
    // The customer chooses the exact payment amount.
    setAmount("");

    setCustomAmountMode(
      false
    );
  };

  // ==========================================================
  // AMOUNT SELECTION
  // ==========================================================

  const handleAmountSelect =
    (
      value: number
    ) => {
      if (
        processingPayment
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
        processingPayment
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

  const providerItemAmount =
    getItemProviderPrice(
      selectedItem
    );

  const dataSellingAmount =
    isData &&
    selectedItem
      ? getDataSellingPrice(
          selectedItem
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
        serviceType ===
          "airtime" ||
        serviceType ===
          "data"
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
  // VALIDATE FORM
  // ==========================================================

  const validateForm =
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
        !selectedItemCode
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

      // ========================================================
      // PHONE VALIDATION
      // ========================================================

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

      // ========================================================
      // AMOUNT
      // ========================================================

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

      // ========================================================
      // DATA PRICE
      // ========================================================

      if (isData) {
        if (
          providerItemAmount <= 0
        ) {
          toast({
            title:
              "Invalid data plan",
            description:
              "The selected data plan does not have a valid provider price.",
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

      // ========================================================
      // NON-DATA MINIMUM
      // ========================================================

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

      // ========================================================
      // NON-DATA MAXIMUM
      // ========================================================

      if (
        !isData &&
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

      // ========================================================
      // WALLET
      // ========================================================

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

      if (!validateForm()) {
        return;
      }

      const finalCustomer =
        normaliseCustomer();

      const providerAmount =
        isData
          ? providerItemAmount
          : amountNumber;

      const sellingAmount =
        amountNumber;

      const details = {
        customer:
          finalCustomer,

        biller_code:
          selectedBillerCode,

        item_code:
          selectedItemCode,

        provider:
          selectedBiller?.name ??
          selectedBiller?.short_name ??
          "",

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

        // These are informational.
        // Backend recalculates the real data selling price.
        selling_amount:
          sellingAmount,

        provider_amount:
          providerAmount,

        data_markup:
          isData
            ? DATA_MARKUP
            : 0,
      };

      console.log(
        "Sending bill purchase details:",
        {
          service:
            serviceType,

          selling_amount:
            sellingAmount,

          provider_amount:
            providerAmount,

          data_markup:
            isData
              ? DATA_MARKUP
              : 0,

          biller_code:
            selectedBillerCode,

          item_code:
            selectedItemCode,

          customer:
            finalCustomer,

          details,
        }
      );

      try {
        setProcessingPayment(
          true
        );

        setError("");

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
          err?.message ||
          "Unable to complete this payment.";

        setError(
          message
        );
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

          {/* WALLET */}

          <div className="bg-green-50 p-3 rounded-lg">
            <p className="text-sm text-green-700">
              Wallet Balance:{" "}
              <strong>
                {formatNaira(
                  Number(
                    walletBalance
                  )
                )}
              </strong>
            </p>
          </div>

          {/* LOADING BILLERS */}

          {loadingBillers && (
            <div className="flex items-center justify-center gap-2 py-3 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading providers...
            </div>
          )}

          {/* PROVIDER */}

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
                    <RefreshCw className="h-3.5 w-3.5 mr-1" />
                    Refresh
                  </Button>
                )}

            </div>

            <select
              value={
                selectedBillerCode
              }
              onChange={(event) =>
                handleBillerChange(
                  event.target.value
                )
              }
              disabled={
                loadingBillers ||
                processingPayment ||
                billers.length ===
                  0
              }
              className="w-full h-10 rounded-md border bg-background px-3 text-sm"
            >
              <option value="">
                {loadingBillers
                  ? "Loading providers..."
                  : "Select provider"}
              </option>

              {billers.map(
                (
                  biller,
                  index
                ) => {
                  const code =
                    String(
                      biller.biller_code ??
                        ""
                    );

                  if (!code) {
                    return null;
                  }

                  return (
                    <option
                      key={`${code}-${index}`}
                      value={code}
                    >
                      {biller.name ??
                        biller.short_name ??
                        code}
                    </option>
                  );
                }
              )}
            </select>

          </div>

          {/* ==================================================
              DATA PLANS
              ================================================== */}

          {isData ? (
            <div className="space-y-3">

              <div className="flex items-center justify-between">
                <Label>
                  Data Plan
                </Label>

                {loadingItems && (
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Loading...
                  </div>
                )}
              </div>

              {!selectedBillerCode && (
                <div className="rounded-lg border border-dashed p-4 text-center text-sm text-gray-500">
                  Select a provider to view data plans.
                </div>
              )}

              {selectedBillerCode &&
                !loadingItems &&
                items.length === 0 && (
                  <div className="rounded-lg border border-dashed p-4 text-center text-sm text-gray-500">
                    No data plans are currently available.
                  </div>
                )}

              {(
                [
                  "Daily",
                  "Weekly",
                  "Monthly",
                  "Other",
                ] as const
              ).map(
                (group) => {
                  const groupItems =
                    dataGroups[
                      group
                    ];

                  if (
                    groupItems.length ===
                    0
                  ) {
                    return null;
                  }

                  return (
                    <div
                      key={group}
                      className="space-y-2"
                    >
                      <h3 className="text-sm font-semibold text-gray-700">
                        {group}
                      </h3>

                      <div className="grid grid-cols-2 gap-2">
                        {groupItems.map(
                          (
                            item,
                            index
                          ) => {
                            const code =
                              String(
                                item.item_code ??
                                  ""
                              );

                            if (!code) {
                              return null;
                            }

                            const providerPrice =
                              getItemProviderPrice(
                                item
                              );

                            const sellingPrice =
                              providerPrice +
                              DATA_MARKUP;

                            const selected =
                              selectedItemCode ===
                              code;

                            return (
                              <button
                                type="button"
                                key={`${code}-${index}`}
                                onClick={() =>
                                  handleDataPlanSelect(
                                    item
                                  )
                                }
                                disabled={
                                  processingPayment
                                }
                                className={[
                                  "text-left rounded-xl border p-3 transition-all",
                                  "hover:border-green-500 hover:bg-green-50",
                                  selected
                                    ? "border-green-600 bg-green-50 ring-1 ring-green-600"
                                    : "border-gray-200 bg-white",
                                ].join(
                                  " "
                                )}
                              >
                                <p className="text-sm font-medium text-gray-900 line-clamp-2">
                                  {item.name ??
                                    item.short_name ??
                                    "Data Plan"}
                                </p>

                                <div className="mt-2">
                                  <p className="text-base font-bold text-green-700">
                                    {formatNaira(
                                      sellingPrice
                                    )}
                                  </p>
                                </div>
                              </button>
                            );
                          }
                        )}
                      </div>
                    </div>
                  );
                }
              )}

            </div>
          ) : (
            /* =================================================
               NON-DATA PACKAGE / ITEM
               ================================================= */

            <div className="space-y-2">

              <Label>
                {isAirtime
                  ? "Airtime Type"
                  : "Bill Package"}
              </Label>

              <select
                value={
                  selectedItemCode
                }
                onChange={(event) =>
                  handleItemChange(
                    event.target.value
                  )
                }
                disabled={
                  loadingItems ||
                  processingPayment ||
                  !selectedBillerCode ||
                  items.length === 0
                }
                className="w-full h-10 rounded-md border bg-background px-3 text-sm"
              >
                <option value="">
                  {loadingItems
                    ? "Loading packages..."
                    : !selectedBillerCode
                      ? "Select provider first"
                      : "Select package"}
                </option>

                {items.map(
                  (
                    item,
                    index
                  ) => {
                    const code =
                      String(
                        item.item_code ??
                          ""
                      );

                    if (!code) {
                      return null;
                    }

                    return (
                      <option
                        key={`${code}-${index}`}
                        value={code}
                      >
                        {item.name ??
                          item.short_name ??
                          code}
                      </option>
                    );
                  }
                )}
              </select>

            </div>
          )}

          {/* ==================================================
              CUSTOMER
              ================================================== */}

          <div className="space-y-2">

            <Label htmlFor="billCustomer">
              {customerLabel}
            </Label>

            <Input
              id="billCustomer"
              value={customer}
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
                processingPayment
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

          {/* ==================================================
              DATA SELECTED PRICE
              ================================================== */}

          {isData &&
            selectedItem && (
              <div className="rounded-lg bg-green-50 border border-green-100 p-3">

                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">
                    Selected Plan
                  </span>

                  <span className="text-sm font-medium">
                    {selectedItem.name ??
                      selectedItem.short_name}
                  </span>
                </div>

                <div className="flex items-center justify-between mt-1">
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

          {/* ==================================================
              AMOUNT CARDS — NON DATA
              ================================================== */}

          {!isData && (
            <div className="space-y-2">

              <Label>
                Amount (₦)
              </Label>

              <div className="grid grid-cols-3 gap-2">

                {(isAirtime
                  ? AIRTIME_AMOUNTS
                  : BILL_AMOUNTS
                ).map(
                  (value) => (
                    <button
                      type="button"
                      key={value}
                      onClick={() =>
                        handleAmountSelect(
                          value
                        )
                      }
                      disabled={
                        processingPayment
                      }
                      className={[
                        "rounded-xl border p-3 text-center font-semibold transition-all",
                        "hover:border-green-500 hover:bg-green-50",
                        amount ===
                        String(value)
                          ? "border-green-600 bg-green-50 text-green-700 ring-1 ring-green-600"
                          : "border-gray-200",
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
                    processingPayment
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
                  value={amount}
                  onChange={(
                    event
                  ) =>
                    setAmount(
                      event.target.value
                    )
                  }
                  placeholder="Enter exact amount"
                  disabled={
                    processingPayment
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

          {/* ==================================================
              ERROR
              ================================================== */}

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3">
              <p className="text-sm text-red-700">
                {error}
              </p>
            </div>
          )}

          {/* ==================================================
              PURCHASE
              ================================================== */}

          <Button
            onClick={
              handlePurchase
            }
            disabled={
              loadingBillers ||
              loadingItems ||
              processingPayment ||
              !selectedBillerCode ||
              !selectedItemCode ||
              !customer.trim() ||
              !amount
            }
            className="w-full bg-green-600 hover:bg-green-700"
          >
            {processingPayment ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                Purchase{" "}
                {service.title}
              </>
            )}
          </Button>

          {processingPayment && (
            <p className="text-xs text-center text-gray-500">
              Please do not close this window
              while your payment is being
              processed.
            </p>
          )}

        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ServiceModal;
