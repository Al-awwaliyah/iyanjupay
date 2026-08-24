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
  biller_code?: string;
  billerCode?: string;

  category?: string;
  country?: string;
  country_code?: string;

  logo?: string | null;
  description?: string;
  short_name?: string;

  biller_name?: string;
  billerName?: string;

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
  short_name?: string;
  item_name?: string;
  itemName?: string;
  description?: string;

  amount?: number | string;
  price?: number | string;
  cost?: number | string;
  value?: number | string;

  minimum?: number | string;
  maximum?: number | string;
  fee?: number | string;

  label_name?: string;
  label_name_2?: string;

  validity?: string;
  validity_period?: string;
  validityPeriod?: string;

  period?: string;
  period_label?: string;

  provider_amount?: number | string;
  selling_price?: number | string;
  profit?: number | string;

  is_airtime?: boolean;
  country?: string;

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

// ============================================================
// PROVIDER PRICE
// ============================================================

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

  for (
    const value of values
  ) {
    const number =
      Number(value);

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

// ============================================================
// SELLING PRICE
// ============================================================

function getSellingPrice(
  item: BillItem
): number {
  const serverPrice =
    Number(
      item.selling_price
    );

  if (
    Number.isFinite(
      serverPrice
    ) &&
    serverPrice > 0
  ) {
    return Number(
      serverPrice.toFixed(2)
    );
  }

  const provider =
    getProviderAmount(item);

  if (provider <= 0) {
    return 0;
  }

  return Number(
    (
      provider +
      MARKUP
    ).toFixed(2)
  );
}

// ============================================================
// PROFIT / MARKUP
// ============================================================

function getProfit(
  item: BillItem
): number {
  const serverProfit =
    Number(
      item.profit
    );

  if (
    Number.isFinite(
      serverProfit
    ) &&
    serverProfit >= 0
  ) {
    return Number(
      serverProfit.toFixed(2)
    );
  }

  const provider =
    getProviderAmount(item);

  const selling =
    getSellingPrice(item);

  if (
    provider > 0 &&
    selling > 0
  ) {
    return Number(
      (
        selling -
        provider
      ).toFixed(2)
    );
  }

  return MARKUP;
}

// ============================================================
// DATA PLAN TYPE
// ============================================================

type PlanPeriod =
  | "daily"
  | "weekly"
  | "monthly"
  | "other";

function getPlanType(
  item: BillItem
): PlanPeriod {
  const serverPeriod =
    clean(
      item.period
    ).toLowerCase();

  if (
    serverPeriod ===
      "daily" ||
    serverPeriod ===
      "weekly" ||
    serverPeriod ===
      "monthly"
  ) {
    return serverPeriod;
  }

  const text =
    `${getItemName(
      item
    )} ${getValidity(item)}`
      .toLowerCase();

  if (
    text.includes(
      "daily"
    ) ||
    /\b1\s*day\b/.test(
      text
    ) ||
    /\b24\s*hour/.test(
      text
    )
  ) {
    return "daily";
  }

  if (
    text.includes(
      "weekly"
    ) ||
    /\b7\s*day/.test(
      text
    ) ||
    /\b14\s*day/.test(
      text
    )
  ) {
    return "weekly";
  }

  if (
    text.includes(
      "monthly"
    ) ||
    /\b30\s*day/.test(
      text
    ) ||
    /\b31\s*day/.test(
      text
    )
  ) {
    return "monthly";
  }

  return "other";
}

// ============================================================
// PHONE NORMALIZATION
// ============================================================

function normalizePhone(
  value: string
): string {
  let phone =
    value
      .trim()
      .replace(
        /\s+/g,
        ""
      );

  if (
    /^0\d{10}$/.test(
      phone
    )
  ) {
    return `+234${phone.substring(
      1
    )}`;
  }

  if (
    /^\d{10}$/.test(
      phone
    )
  ) {
    return `+234${phone}`;
  }

  if (
    /^234\d{10}$/.test(
      phone
    )
  ) {
    return `+${phone}`;
  }

  if (
    /^\+234\d{10}$/.test(
      phone
    )
  ) {
    return phone;
  }

  return phone;
}

// ============================================================
// MONEY
// ============================================================

function formatMoney(
  value: number
): string {
  return `₦${value.toLocaleString(
    "en-NG",
    {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }
  )}`;
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
  const {
    toast,
  } = useToast();

  // ==========================================================
  // FORM
  // ==========================================================

  const [
    customer,
    setCustomer,
  ] = useState("");

  // ==========================================================
  // CATALOGUE
  // ==========================================================

  const [
    billers,
    setBillers,
  ] = useState<Biller[]>(
    []
  );

  const [
    items,
    setItems,
  ] = useState<BillItem[]>(
    []
  );

  const [
    selectedBillerCode,
    setSelectedBillerCode,
  ] = useState("");

  const [
    selectedItemCode,
    setSelectedItemCode,
  ] = useState("");

  // ==========================================================
  // DATA TABS
  // ==========================================================

  const [
    planTab,
    setPlanTab,
  ] = useState<PlanPeriod>(
    "daily"
  );

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
    successMessage,
    setSuccessMessage,
  ] = useState("");

  const [
    error,
    setError,
  ] = useState("");

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
    serviceType ===
      "airtime" ||
    serviceType ===
      "data";

  // ==========================================================
  // RESET
  // ==========================================================

  const resetForm =
    () => {
      setCustomer("");

      setBillers([]);

      setItems([]);

      setSelectedBillerCode(
        ""
      );

      setSelectedItemCode(
        ""
      );

      setPlanTab(
        serviceType ===
          "data"
          ? "daily"
          : "other"
      );

      setError("");

      setSuccessMessage("");

      setLoadingBillers(
        false
      );

      setLoadingItems(
        false
      );

      setProcessingPayment(
        false
      );
    };

  // ==========================================================
  // RESET SERVICE
  // ==========================================================

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setCustomer("");

    setBillers([]);

    setItems([]);

    setSelectedBillerCode(
      ""
    );

    setSelectedItemCode(
      ""
    );

    setError("");

    setSuccessMessage("");

    setPlanTab(
      serviceType ===
        "data"
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

      setLoadingBillers(
        true
      );

      setError("");

      setSelectedBillerCode(
        ""
      );

      setSelectedItemCode(
        ""
      );

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

        if (
          functionError
        ) {
          throw new Error(
            functionError.message ||
              "Unable to load bill providers."
          );
        }

        if (
          !data ||
          data.success !==
            true
        ) {
          throw new Error(
            data?.error ||
              data?.message ||
              "Unable to load bill providers."
          );
        }

        const loaded =
          Array.isArray(
            data.billers
          )
            ? data.billers
            : [];

        setBillers(
          loaded
        );

        if (
          loaded.length ===
          0
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
  // LOAD BILLERS ON OPEN
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
      const code =
        String(
          billerCode ??
            ""
        ).trim();

      if (!code) {
        setItems([]);
        return;
      }

      setLoadingItems(
        true
      );

      setError("");

      setItems([]);

      setSelectedItemCode(
        ""
      );

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
                  code,

                country:
                  "NG",
              },
            }
          );

        if (
          functionError
        ) {
          throw new Error(
            functionError.message ||
              "Unable to load bill packages."
          );
        }

        if (
          !data ||
          data.success !==
            true
        ) {
          throw new Error(
            data?.error ||
              data?.message ||
              "Unable to load bill packages."
          );
        }

        /*
         * Newer Edge Function:
         *
         * data.plans
         *
         * Older response:
         *
         * data.items
         */
        const loadedItems =
          Array.isArray(
            data.plans
          )
            ? data.plans
            : Array.isArray(
                  data.items
                )
              ? data.items
              : [];

        setItems(
          loadedItems
        );

        // ======================================================
        // AUTOMATICALLY SELECT FIRST AVAILABLE DATA TAB
        // ======================================================

        if (
          serviceType ===
          "data"
        ) {
          const groups =
            {
              daily:
                loadedItems.filter(
                  (
                    item: BillItem
                  ) =>
                    getPlanType(
                      item
                    ) ===
                    "daily"
                ),

              weekly:
                loadedItems.filter(
                  (
                    item: BillItem
                  ) =>
                    getPlanType(
                      item
                    ) ===
                    "weekly"
                ),

              monthly:
                loadedItems.filter(
                  (
                    item: BillItem
                  ) =>
                    getPlanType(
                      item
                    ) ===
                    "monthly"
                ),

              other:
                loadedItems.filter(
                  (
                    item: BillItem
                  ) =>
                    getPlanType(
                      item
                    ) ===
                    "other"
                ),
            };

          if (
            groups.daily
              .length > 0
          ) {
            setPlanTab(
              "daily"
            );
          } else if (
            groups.weekly
              .length > 0
          ) {
            setPlanTab(
              "weekly"
            );
          } else if (
            groups.monthly
              .length > 0
          ) {
            setPlanTab(
              "monthly"
            );
          } else {
            setPlanTab(
              "other"
            );
          }
        }

        if (
          loadedItems.length ===
          0
        ) {
          setError(
            "No packages are currently available for this provider."
          );
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

      setSelectedItemCode(
        ""
      );

      setCustomer("");

      setError("");

      await loadItems(
        value
      );
    };

  // ==========================================================
  // SELECTED BILLER
  // ==========================================================

  const selectedBiller =
    useMemo(
      () =>
        billers.find(
          (
            biller
          ) =>
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
          (
            item
          ) =>
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
  // GROUP DATA PLANS
  // ==========================================================

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

        groups[
          getPlanType(
            item
          )
        ].push(item);
      }

      return groups;
    }, [items]);

  const visibleItems =
    serviceType ===
    "data"
      ? groupedItems[
          planTab
        ]
      : items.filter(
          (
            item
          ) =>
            getProviderAmount(
              item
            ) > 0
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
  // NORMALIZE CUSTOMER
  // ==========================================================

  const normalizeCustomer =
    (): string => {
      const value =
        customer.trim();

      if (
        isPhoneService
      ) {
        return normalizePhone(
          value
        );
      }

      return value;
    };

  // ==========================================================
  // PRICES
  // ==========================================================

  const providerAmount =
    selectedItem
      ? getProviderAmount(
          selectedItem
        )
      : 0;

  const sellingPrice =
    selectedItem
      ? getSellingPrice(
          selectedItem
        )
      : 0;

  const profit =
    selectedItem
      ? getProfit(
          selectedItem
        )
      : 0;

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
        normalizeCustomer();

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

      // ========================================================
      // PHONE
      // ========================================================

      if (
        isPhoneService
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
      // PROVIDER PRICE
      // ========================================================

      if (
        !Number.isFinite(
          providerAmount
        ) ||
        providerAmount <= 0
      ) {
        toast({
          title:
            "Invalid package",
          description:
            "The selected package has no valid provider price.",
          variant:
            "destructive",
        });

        return false;
      }

      // ========================================================
      // SELLING PRICE
      // ========================================================

      if (
        !Number.isFinite(
          sellingPrice
        ) ||
        sellingPrice <= 0
      ) {
        toast({
          title:
            "Invalid price",
          description:
            "Unable to determine the package selling price.",
          variant:
            "destructive",
        });

        return false;
      }

      /*
       * IMPORTANT:
       *
       * Do NOT block the purchase here using walletBalance.
       *
       * Your Edge Function should perform the authoritative
       * balance check and debit.
       *
       * This prevents a stale dashboard balance from making
       * the Buy button appear unusable.
       */

      return true;
    };

  // ==========================================================
  // ITEM SELECT
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

      setSuccessMessage("");
    };

  // ==========================================================
  // PURCHASE
  // ==========================================================

  const handlePurchase =
    async () => {
      console.log(
        "BUY BUTTON CLICKED"
      );

      if (!service) {
        return;
      }

      if (
        processingPayment
      ) {
        return;
      }

      if (
        !validateForm()
      ) {
        return;
      }

      const finalCustomer =
        normalizeCustomer();

      const details = {
        // ======================================================
        // BASIC
        // ======================================================

        customer:
          finalCustomer,

        biller_code:
          selectedBillerCode,

        item_code:
          selectedItemCode,

        provider:
          getBillerName(
            selectedBiller ??
              {}
          ),

        type:
          serviceType,

        country:
          "NG",

        // ======================================================
        // PHONE
        // ======================================================

        phoneNumber:
          isPhoneService
            ? finalCustomer
            : "",

        phone:
          isPhoneService
            ? finalCustomer
            : "",

        phone_number:
          isPhoneService
            ? finalCustomer
            : "",

        // ======================================================
        // ELECTRICITY
        // ======================================================

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

        // ======================================================
        // CABLE
        // ======================================================

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

        // ======================================================
        // INTERNET
        // ======================================================

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

        // ======================================================
        // PLAN
        // ======================================================

        plan_name:
          selectedItem
            ? getItemName(
                selectedItem
              )
            : "",

        plan_validity:
          selectedItem
            ? getValidity(
                selectedItem
              )
            : "",

        period:
          selectedItem
            ? getPlanType(
                selectedItem
              )
            : "other",

        // ======================================================
        // PRICING
        // ======================================================

        provider_amount:
          providerAmount,

        selling_price:
          sellingPrice,

        profit,

        markup:
          MARKUP,

        // ======================================================
        // COMPLETE OBJECTS
        // ======================================================

        item:
          selectedItem,

        biller:
          selectedBiller,

        customerLabel,
      };

      console.log(
        "Sending bill purchase details:",
        {
          service:
            serviceType,

          amount:
            sellingPrice,

          provider_amount:
            providerAmount,

          selling_price:
            sellingPrice,

          markup:
            MARKUP,

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

        setSuccessMessage("");

        /*
         * IMPORTANT:
         *
         * The parent onPurchase remains responsible
         * for invoking your flutterwave-bills function.
         *
         * We pass the FINAL selling price here.
         *
         * Provider price + ₦50 markup.
         */
        await onPurchase(
          sellingPrice,
          details
        );

        setSuccessMessage(
          "Payment successful."
        );

        toast({
          title:
            "Payment successful",
          description:
            `${formatMoney(
              sellingPrice
            )} payment has been processed.`,
        });

        /*
         * Keep the successful dialog visible briefly
         * so the user sees confirmation.
         */
        window.setTimeout(
          () => {
            resetForm();
            onClose();
          },
          1200
        );
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

        setError(
          message
        );

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
  // BUY BUTTON STATE
  // ==========================================================

  /*
   * IMPORTANT:
   *
   * Do NOT use walletBalance here.
   *
   * The button becomes enabled once:
   *
   * provider selected
   * package selected
   * customer entered
   * phone valid when required
   * package has a valid price
   */

  const canPurchase =
    !processingPayment &&
    !loadingBillers &&
    !loadingItems &&
    Boolean(
      selectedBillerCode
    ) &&
    Boolean(
      selectedItemCode
    ) &&
    Boolean(
      customer.trim()
    ) &&
    providerAmount > 0 &&
    sellingPrice > 0 &&
    (
      !isPhoneService ||
      /^\+234\d{10}$/.test(
        normalizeCustomer()
      )
    );

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

        {/* ================================================== */}
        {/* HEADER */}
        {/* ================================================== */}

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
                  walletBalance ||
                    0
                )
              )}
            </p>
          </div>

          {/* ================================================== */}
          {/* SUCCESS */}
          {/* ================================================== */}

          {successMessage && (
            <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3">
              <CheckCircle2 className="h-4 w-4 text-green-600" />

              <p className="text-sm text-green-700">
                {successMessage}
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
          {/* CUSTOMER / PHONE */}
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

                setSuccessMessage(
                  ""
                );
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
              !/^(?:\+234|234|0)?\d{10}$/.test(
                customer
                  .replace(
                    /\s+/g,
                    ""
                  )
              ) && (
                <p className="text-xs text-red-600">
                  Enter a valid Nigerian
                  phone number.
                </p>
              )}

          </div>

          {/* ================================================== */}
          {/* DATA TABS */}
          {/* ================================================== */}

          {serviceType ===
            "data" &&
            selectedBillerCode && (
              <div className="space-y-3">

                <Label>
                  Data Plans
                </Label>

                <div className="grid grid-cols-4 gap-1.5">

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
                            loadingItems ||
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

                            setError("");
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
                              : "hover:bg-green-100"
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

            {serviceType ===
            "data" ? (

              loadingItems ? (
                <div className="flex items-center justify-center rounded-lg bg-gray-50 p-6">
                  <Loader2 className="h-5 w-5 animate-spin text-green-600" />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">

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

                      const provider =
                        getProviderAmount(
                          item
                        );

                      const selling =
                        getSellingPrice(
                          item
                        );

                      const selected =
                        selectedItemCode ===
                        code;

                      return (
                        <button
                          key={`${code}-${index}`}
                          type="button"
                          disabled={
                            processingPayment ||
                            loadingItems
                          }
                          onClick={() =>
                            handleItemChange(
                              code
                            )
                          }
                          className={`rounded-xl border p-3 text-left transition ${
                            selected
                              ? "border-green-600 bg-green-50 ring-2 ring-green-100"
                              : "border-gray-200 bg-white hover:border-green-300"
                          } ${
                            processingPayment
                              ? "cursor-not-allowed opacity-60"
                              : "cursor-pointer"
                          }`}
                        >

                          <div className="flex items-start justify-between gap-2">

                            <div className="min-w-0">

                              <p className="text-sm font-semibold text-gray-900">
                                {getItemName(
                                  item
                                )}
                              </p>

                              {getValidity(
                                item
                              ) && (
                                <p className="mt-1 text-xs text-gray-500">
                                  {getValidity(
                                    item
                                  )}
                                </p>
                              )}

                            </div>

                            {selected && (
                              <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
                            )}

                          </div>

                          <p className="mt-2 font-bold text-green-600">
                            {formatMoney(
                              selling
                            )}
                          </p>

                          <p className="mt-1 text-[10px] text-gray-400">
                            Provider:{" "}
                            {formatMoney(
                              provider
                            )}
                          </p>

                          <p className="text-[10px] text-green-600">
                            +₦50 service charge
                          </p>

                        </button>
                      );
                    }
                  )}

                </div>
              )

            ) : (

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
                  items.length ===
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
                          : "Select package"
                    }
                  />
                </SelectTrigger>

                <SelectContent>

                  {items.map(
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

                      const provider =
                        getProviderAmount(
                          item
                        );

                      const selling =
                        getSellingPrice(
                          item
                        );

                      return (
                        <SelectItem
                          key={`${code}-${index}`}
                          value={code}
                        >
                          {getItemName(
                            item
                          )}

                          {provider >
                            0
                            ? ` — ${formatMoney(
                                selling
                              )}`
                            : ""}
                        </SelectItem>
                      );
                    }
                  )}

                </SelectContent>
              </Select>

            )}

          </div>

          {/* ================================================== */}
          {/* PAYMENT SUMMARY */}
          {/* ================================================== */}

          {selectedItem &&
            providerAmount >
              0 && (
              <div className="rounded-xl bg-gray-50 p-4">

                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-sm text-gray-500">
                    Plan
                  </span>

                  <span className="text-right text-sm font-medium text-gray-900">
                    {getItemName(
                      selectedItem
                    )}
                  </span>
                </div>

                {isPhoneService && (
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="text-sm text-gray-500">
                      Phone
                    </span>

                    <span className="text-sm font-medium text-gray-900">
                      {normalizeCustomer()}
                    </span>
                  </div>
                )}

                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm text-gray-500">
                    Provider price
                  </span>

                  <span className="text-sm text-gray-700">
                    {formatMoney(
                      providerAmount
                    )}
                  </span>
                </div>

                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm text-gray-500">
                    Service charge
                  </span>

                  <span className="text-sm text-gray-700">
                    {formatMoney(
                      MARKUP
                    )}
                  </span>
                </div>

                <div className="mt-3 border-t pt-3">

                  <div className="flex items-center justify-between">

                    <span className="font-semibold text-gray-900">
                      You pay
                    </span>

                    <span className="text-xl font-bold text-green-600">
                      {formatMoney(
                        sellingPrice
                      )}
                    </span>

                  </div>

                </div>

              </div>
            )}

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
          {/* PURCHASE */}
          {/* ================================================== */}

          <Button
            type="button"
            onClick={
              handlePurchase
            }
            disabled={
              !canPurchase
            }
            className="w-full bg-green-600 hover:bg-green-700 disabled:cursor-not-allowed"
          >
            {processingPayment ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />

                Processing...
              </>
            ) : selectedItem ? (
              <>
                Purchase{" "}
                {formatMoney(
                  sellingPrice
                )}
              </>
            ) : (
              "Select a package"
            )}
          </Button>

          {/* ================================================== */}
          {/* PROCESSING NOTE */}
          {/* ================================================== */}

          {processingPayment && (
            <p className="text-center text-xs text-gray-500">
              Please do not close this
              window while your payment is
              being processed.
            </p>
          )}

          {selectedItem && (
            <p className="text-center text-[11px] text-gray-400">
              Provider price + ₦50 service
              charge
            </p>
          )}

        </div>

      </DialogContent>
    </Dialog>
  );
};

export default ServiceModal;
