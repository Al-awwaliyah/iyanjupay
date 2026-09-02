import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ArrowLeft,
  Check,
  ChevronDown,
  Flame,
  History,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Tv,
  Wifi,
  Zap,
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

  /**
   * Optional history handler.
   *
   * The existing parent does not need to provide this.
   * If supplied, the History button will use it.
   */
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
];

const BILL_AMOUNTS = [
  500,
  1000,
  2000,
  5000,
  10000,
];

const DATA_TABS = [
  "HOT",
  "Extra Night",
  "Daily",
  "Weekly",
  "Monthly",
] as const;

type DataTab = (typeof DATA_TABS)[number];

type DataGroup =
  | "Daily"
  | "Weekly"
  | "Monthly"
  | "Other";

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
  return `₦${Number(value || 0).toLocaleString("en-NG")}`;
}

function getItemName(item: BillItem): string {
  return (
    cleanString(item.name) ||
    cleanString(item.short_name) ||
    cleanString(item.data_plan) ||
    "Service Plan"
  );
}

function getItemPrice(item: BillItem): number {
  return numberValue(
    item.selling_price ??
      item.amount ??
      item.price
  );
}

function getDataText(item: BillItem): string {
  return [
    item.name,
    item.short_name,
    item.description,
    item.validity,
    item.duration,
    item.data_plan,
    item.plan_type,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function isHotDeal(item: BillItem): boolean {
  if (item.is_hot_deal === true) {
    return true;
  }

  const text = getDataText(item);

  return (
    /\bsme\b/.test(text) ||
    /\bhot\b/.test(text) ||
    /\bhot deal\b/.test(text) ||
    /\bextra\s*value\b/.test(text)
  );
}

function isExtraNight(item: BillItem): boolean {
  const text = getDataText(item);

  return (
    /\bnight\b/.test(text) ||
    /\bmidnight\b/.test(text) ||
    /\bextra\s*night\b/.test(text)
  );
}

function getDataGroup(item: BillItem): DataGroup {
  const text = getDataText(item);

  if (
    /\b(30|31)\s*(day|days)\b/.test(text) ||
    /\bmonthly\b/.test(text) ||
    /\b1\s*month\b/.test(text) ||
    /\b2\s*months?\b/.test(text) ||
    /\b3\s*months?\b/.test(text)
  ) {
    return "Monthly";
  }

  if (
    /\b(7|14)\s*(day|days)\b/.test(text) ||
    /\bweekly\b/.test(text) ||
    /\b1\s*week\b/.test(text) ||
    /\b2\s*weeks?\b/.test(text)
  ) {
    return "Weekly";
  }

  if (
    /\b(1|2|3)\s*(day|days)\b/.test(text) ||
    /\bdaily\b/.test(text) ||
    /\b24\s*hours?\b/.test(text) ||
    /\bday\b/.test(text)
  ) {
    return "Daily";
  }

  return "Other";
}

function getPlanType(item: BillItem): string {
  if (cleanString(item.plan_type)) {
    return cleanString(item.plan_type);
  }

  return isHotDeal(item)
    ? "HOT"
    : "REGULAR";
}

function getServiceIcon(type: string) {
  switch (type) {
    case "airtime":
      return Smartphone;

    case "data":
      return Wifi;

    case "electricity":
      return Zap;

    case "cable":
      return Tv;

    case "internet":
      return Wifi;

    default:
      return Smartphone;
  }
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
  // DATA TAB
  // ==========================================================

  const [dataTab, setDataTab] =
    useState<DataTab>("HOT");

  // ==========================================================
  // PIN
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

  const [selectedBillerCode, setSelectedBillerCode] =
    useState("");

  const [selectedItemCode, setSelectedItemCode] =
    useState("");

  // ==========================================================
  // LOADING
  // ==========================================================

  const [loadingBillers, setLoadingBillers] =
    useState(false);

  const [loadingItems, setLoadingItems] =
    useState(false);

  const [processingPayment, setProcessingPayment] =
    useState(false);

  const [error, setError] =
    useState("");

  const { toast } = useToast();

  // ==========================================================
  // SERVICE
  // ==========================================================

  const serviceType =
    service?.type ?? "";

  const category =
    SERVICE_CATEGORY_MAP[serviceType] ?? "";

  const isData =
    serviceType === "data";

  const isAirtime =
    serviceType === "airtime";

  const isElectricity =
    serviceType === "electricity";

  const isCable =
    serviceType === "cable";

  const isInternet =
    serviceType === "internet";

  const ServiceIcon =
    getServiceIcon(serviceType);

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
    const groups: Record<
      DataGroup,
      BillItem[]
    > = {
      Daily: [],
      Weekly: [],
      Monthly: [],
      Other: [],
    };

    items.forEach((item) => {
      const group =
        getDataGroup(item);

      groups[group].push(item);
    });

    return groups;
  }, [items]);

  // ==========================================================
  // FILTERED DATA PLANS
  // ==========================================================

  const visibleDataPlans =
    useMemo(() => {
      if (!isData) {
        return [];
      }

      switch (dataTab) {
        case "HOT":
          return items.filter(
            (item) =>
              isHotDeal(item)
          );

        case "Extra Night":
          return items.filter(
            (item) =>
              isExtraNight(item)
          );

        case "Daily":
          return dataGroups.Daily;

        case "Weekly":
          return dataGroups.Weekly;

        case "Monthly":
          return dataGroups.Monthly;

        default:
          return [];
      }
    }, [
      dataTab,
      dataGroups,
      isData,
      items,
    ]);

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
        return "Smart Card Number";

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
      switch (serviceType) {
        case "airtime":
        case "data":
          return "08012345678";

        case "electricity":
          return "Enter meter number";

        case "cable":
          return "Enter smart card number";

        case "internet":
          return "Enter account number";

        default:
          return "Enter customer number";
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

    setDataTab("HOT");

    setLoadingBillers(false);
    setLoadingItems(false);

    setProcessingPayment(false);

    setShowPinPrompt(false);
    setPaymentPin("");
    setVerifyingPin(false);
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
    setDataTab("HOT");
    setShowPinPrompt(false);
    setPaymentPin("");
  }, [serviceType]);

  // ==========================================================
  // LOAD BILLERS / NETWORKS
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
          "Unable to load available options."
        );
      }

      const loadedBillers =
        Array.isArray(data?.billers)
          ? data.billers
          : Array.isArray(data?.data)
            ? data.data
            : [];

      setBillers(
        loadedBillers
      );

      if (!loadedBillers.length) {
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
          "Unable to load options",
        description: message,
        variant: "destructive",
      });
    } finally {
      setLoadingBillers(false);
    }
  };

  // ==========================================================
  // LOAD ON PAGE OPEN
  // ==========================================================

  useEffect(() => {
    if (category) {
      void loadBillers();
    }
  }, [category]);

  // ==========================================================
  // LOAD SERVICE ITEMS
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
          "flutterwave-bills",
          {
            body: {
              action: "items",
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
          "Unable to load available packages."
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
          "Unable to load available packages."
        );
      }

      const loadedItems =
        Array.isArray(data?.items)
          ? data.items
          : [];

      const normalizedItems =
        loadedItems.map(
          (item: BillItem) => ({
            ...item,

            item_code:
              item.item_code !==
                undefined &&
              item.item_code !== null
                ? String(
                    item.item_code
                  )
                : undefined,

            plan_type:
              item.plan_type ??
              (isHotDeal(item)
                ? "HOT"
                : "REGULAR"),

            is_hot_deal:
              item.is_hot_deal === true ||
              isHotDeal(item),
          })
        );

      setItems(
        normalizedItems
      );

      if (
        normalizedItems.length === 0
      ) {
        setError(
          "No packages are currently available."
        );
      }
    } catch (err) {
      console.error(
        "Failed to load bill items:",
        err
      );

      const message =
        "Unable to load available packages.";

      setError(message);

      toast({
        title:
          "Unable to load packages",
        description: message,
        variant: "destructive",
      });
    } finally {
      setLoadingItems(false);
    }
  };

  // ==========================================================
  // BILLER / NETWORK CHANGE
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

    setSelectedBillerCode(
      value
    );

    await loadItems(value);
  };

  // ==========================================================
  // DATA PLAN SELECT
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

    const sellingPrice =
      getItemPrice(item);

    if (sellingPrice <= 0) {
      toast({
        title:
          "Invalid data plan",
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

    setCustomAmountMode(
      false
    );

    setError("");
  };

  // ==========================================================
  // NORMAL ITEM SELECT
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

    setSelectedItemCode(
      value
    );

    setError("");
    setAmount("");
    setCustomAmountMode(
      false
    );
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

    setAmount(
      String(value)
    );

    setCustomAmountMode(
      false
    );

    setError("");
  };

  const handleCustomAmount = () => {
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
  // AMOUNT VALUES
  // ==========================================================

  const amountNumber =
    Number(amount);

  const itemMinimum =
    numberValue(
      selectedItem?.minimum
    );

  const itemMaximum =
    numberValue(
      selectedItem?.maximum
    );

  const selectedItemPrice =
    getItemPrice(
      selectedItem ?? {}
    );

  const dataSellingAmount =
    isData && selectedItem
      ? getItemPrice(
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
            isAirtime || isData
              ? "Select a network"
              : "Select a service",
          description:
            isAirtime || isData
              ? "Please select your network."
              : "Please select the service you want to use.",
          variant:
            "destructive",
        });

        return false;
      }

      if (!selectedItemCode) {
        toast({
          title:
            isData
              ? "Select a data plan"
              : "Select a package",
          description:
            isData
              ? "Please select a data plan."
              : "Please select a service package.",
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
            "Information required",
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
          serviceType === "data"
            ? finalCustomer
            : "",

        phone:
          serviceType ===
              "airtime" ||
          serviceType === "data"
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
          serviceType === "cable"
            ? finalCustomer
            : "",

        smartcardNumber:
          serviceType === "cable"
            ? finalCustomer
            : "",

        smartcard_number:
          serviceType === "cable"
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

        selling_amount:
          amountNumber,

        plan_type:
          isData
            ? getPlanType(
                selectedItem ??
                  {}
              )
            : "",

        is_hot_deal:
          isData
            ? isHotDeal(
                selectedItem ??
                  {}
              )
            : false,
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
      setShowPinPrompt(
        true
      );
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
  // NETWORK / SERVICE SELECTOR LABEL
  // ==========================================================

  const selectorLabel =
    isAirtime || isData
      ? "Network"
      : isElectricity
        ? "Electricity Company"
        : isCable
          ? "TV Service"
          : isInternet
            ? "Internet Service"
            : "Service";

  // ==========================================================
  // EMPTY STATE
  // ==========================================================

  if (!service) {
    return (
      <div className="min-h-screen bg-[#f7f9fc] flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#082A63]/10">
            <Smartphone className="h-7 w-7 text-[#082A63]" />
          </div>

          <h2 className="text-lg font-bold text-slate-900">
            No payment service selected
          </h2>

          <p className="mt-2 text-sm text-slate-500">
            Please select a service to continue.
          </p>

          <Button
            onClick={onBack}
            className="mt-6 w-full rounded-xl bg-[#082A63] hover:bg-[#061f4a]"
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
    <div className="min-h-screen bg-[#f7f9fc] pb-10">

      {/* ======================================================
          TOP BAR
          ====================================================== */}

      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">

          <div className="flex min-w-0 items-center gap-3">

            <button
              type="button"
              onClick={handleBack}
              disabled={
                processingPayment ||
                verifyingPin
              }
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:border-[#082A63] hover:bg-[#082A63]/5 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Go back"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>

            <div className="flex min-w-0 items-center gap-3">

              <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#082A63] text-white sm:flex">
                <ServiceIcon className="h-5 w-5" />
              </div>

              <div className="min-w-0">
                <h1 className="truncate text-base font-bold text-slate-900 sm:text-lg">
                  {service.title}
                </h1>

                <p className="hidden text-xs text-slate-500 sm:block">
                  Secure service payment
                </p>
              </div>

            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (onHistory) {
                onHistory();
              }
            }}
            disabled={!onHistory}
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-[#082A63] transition hover:bg-[#082A63]/5 disabled:cursor-default disabled:opacity-100"
          >
            <History className="h-4 w-4" />
            <span>History</span>
          </button>

        </div>
      </header>

      {/* ======================================================
          CONTENT
          ====================================================== */}

      <main className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 sm:py-7">

        {/* ====================================================
            PIN CONFIRMATION
            ==================================================== */}

        {showPinPrompt ? (
          <div className="mx-auto max-w-lg">

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">

              <div className="text-center">

                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#082A63]/10">
                  <ShieldCheck className="h-8 w-8 text-[#082A63]" />
                </div>

                <h2 className="mt-5 text-xl font-bold text-slate-900">
                  Confirm Payment
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Enter your 4-digit Payment PIN to confirm this payment.
                </p>

              </div>

              {/* SUMMARY */}

              <div className="mt-6 rounded-2xl border border-slate-200 bg-[#f8fafc] p-4">

                <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-3">
                  <span className="text-sm text-slate-500">
                    Service
                  </span>

                  <span className="text-sm font-semibold text-slate-900">
                    {service.title}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-4 border-b border-slate-200 py-3">
                  <span className="text-sm text-slate-500">
                    Amount
                  </span>

                  <span className="font-bold text-[#082A63]">
                    {formatNaira(
                      amountNumber
                    )}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-4 pt-3">
                  <span className="text-sm text-slate-500">
                    {customerLabel}
                  </span>

                  <span className="max-w-[62%] break-all text-right text-sm font-semibold text-slate-900">
                    {normaliseCustomer()}
                  </span>
                </div>

                {selectedItem && (
                  <div className="mt-3 flex items-center justify-between gap-4 border-t border-slate-200 pt-3">
                    <span className="text-sm text-slate-500">
                      Package
                    </span>

                    <span className="max-w-[62%] text-right text-sm font-semibold text-slate-900">
                      {getItemName(
                        selectedItem
                      )}
                    </span>
                  </div>
                )}

              </div>

              {/* PIN */}

              <div className="mt-6">

                <Label
                  htmlFor="servicePaymentPin"
                  className="text-sm font-semibold text-slate-800"
                >
                  Payment PIN
                </Label>

                <Input
                  id="servicePaymentPin"
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={4}
                  value={paymentPin}
                  onChange={(event) => {
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
                  onKeyDown={(event) => {
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
                  className="mt-2 h-14 rounded-xl border-slate-200 text-center text-2xl tracking-[0.6em] focus:border-[#082A63] focus:ring-[#082A63]/20"
                />

                <p className="mt-2 text-center text-xs text-slate-500">
                  Your PIN is securely verified before your payment is processed.
                </p>

              </div>

              {error && (
                <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3">
                  <p className="text-sm text-red-700">
                    {error}
                  </p>
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
                  className="h-12 w-full rounded-xl bg-[#082A63] font-semibold hover:bg-[#061f4a]"
                >
                  {verifyingPin ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying PIN...
                    </>
                  ) : (
                    <>
                      <Check className="mr-2 h-4 w-4" />
                      Confirm Payment
                    </>
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
                  className="h-12 w-full rounded-xl border-slate-200"
                >
                  Back
                </Button>

              </div>

            </div>
          </div>
        ) : (

          /* ==================================================
             NORMAL SERVICE PAGE
             ================================================== */

          <div className="grid gap-5 lg:grid-cols-[1fr_360px]">

            {/* ==================================================
                LEFT / MAIN
                ================================================== */}

            <div className="space-y-5">

              {/* SERVICE INTRO */}

              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">

                <div className="flex items-center gap-4">

                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#082A63]/10">
                    <ServiceIcon className="h-7 w-7 text-[#082A63]" />
                  </div>

                  <div>
                    <h2 className="text-lg font-bold text-slate-900">
                      {service.title}
                    </h2>

                    <p className="mt-1 text-sm text-slate-500">
                      Select your details below to continue.
                    </p>
                  </div>

                </div>

              </div>

              {/* ==================================================
                  NETWORK / CUSTOMER SERVICE
                  ================================================== */}

              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">

                <div className="mb-4 flex items-center justify-between gap-3">

                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      {selectorLabel}
                    </h3>

                    <p className="mt-1 text-xs text-slate-500">
                      Choose the option you want to use.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      void loadBillers()
                    }
                    disabled={
                      loadingBillers ||
                      processingPayment ||
                      verifyingPin
                    }
                    className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-[#082A63] hover:bg-[#082A63]/5 disabled:opacity-50"
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${
                        loadingBillers
                          ? "animate-spin"
                          : ""
                      }`}
                    />
                    Refresh
                  </button>

                </div>

                {loadingBillers ? (
                  <div className="flex min-h-24 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50">
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading available options...
                    </div>
                  </div>
                ) : billers.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
                    <p className="text-sm font-medium text-slate-700">
                      No options available
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                      Please refresh and try again.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">

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

                        const selected =
                          selectedBillerCode ===
                          code;

                        return (
                          <button
                            type="button"
                            key={`${code}-${index}`}
                            onClick={() =>
                              void handleBillerChange(
                                code
                              )
                            }
                            disabled={
                              processingPayment ||
                              verifyingPin
                            }
                            className={[
                              "group relative min-h-[76px] rounded-2xl border p-3 text-left transition-all",
                              "hover:-translate-y-0.5 hover:border-[#082A63]/40 hover:bg-[#082A63]/[0.025]",
                              selected
                                ? "border-[#082A63] bg-[#082A63]/[0.05] ring-2 ring-[#082A63]/10"
                                : "border-slate-200 bg-white",
                            ].join(" ")}
                          >

                            {selected && (
                              <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-[#082A63] text-white">
                                <Check className="h-3 w-3" />
                              </span>
                            )}

                            {biller.logo ? (
                              <img
                                src={
                                  biller.logo
                                }
                                alt=""
                                className="mb-2 h-7 w-7 rounded-lg object-contain"
                              />
                            ) : (
                              <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100">
                                <Smartphone className="h-4 w-4 text-slate-500" />
                              </div>
                            )}

                            <p
                              className={[
                                "pr-5 text-sm font-semibold",
                                selected
                                  ? "text-[#082A63]"
                                  : "text-slate-800",
                              ].join(" ")}
                            >
                              {biller.name ??
                                biller.short_name ??
                                "Service"}
                            </p>

                          </button>
                        );
                      }
                    )}

                  </div>
                )}

              </section>

              {/* ==================================================
                  DATA
                  ================================================== */}

              {isData && (
                <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">

                  <div className="mb-4">

                    <h3 className="text-base font-bold text-slate-900">
                      Choose Data Plan
                    </h3>

                    <p className="mt-1 text-xs text-slate-500">
                      Select the plan that works best for you.
                    </p>

                  </div>

                  {!selectedBillerCode ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-7 text-center">
                      <Wifi className="mx-auto h-7 w-7 text-slate-400" />

                      <p className="mt-3 text-sm font-semibold text-slate-700">
                        Select a network first
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        Available data plans will appear here.
                      </p>
                    </div>
                  ) : loadingItems ? (
                    <div className="flex min-h-32 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50">
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading data plans...
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* DATA TABS */}

                      <div className="mb-5 overflow-x-auto pb-1">
                        <div className="flex min-w-max gap-2">

                          {DATA_TABS.map(
                            (tab) => {
                              const count =
                                tab === "HOT"
                                  ? items.filter(
                                      isHotDeal
                                    ).length
                                  : tab ===
                                      "Extra Night"
                                    ? items.filter(
                                        isExtraNight
                                      ).length
                                    : tab ===
                                        "Daily"
                                      ? dataGroups
                                          .Daily
                                          .length
                                      : tab ===
                                          "Weekly"
                                        ? dataGroups
                                            .Weekly
                                            .length
                                        : dataGroups
                                            .Monthly
                                            .length;

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
                                    "rounded-xl px-4 py-2.5 text-sm font-semibold transition",
                                    dataTab ===
                                    tab
                                      ? "bg-[#082A63] text-white shadow-sm"
                                      : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                                  ].join(
                                    " "
                                  )}
                                >
                                  <span className="flex items-center gap-1.5">
                                    {tab ===
                                      "HOT" && (
                                      <Flame className="h-3.5 w-3.5" />
                                    )}

                                    {tab}

                                    {count >
                                      0 && (
                                      <span
                                        className={
                                          dataTab ===
                                          tab
                                            ? "text-white/70"
                                            : "text-slate-400"
                                        }
                                      >
                                        {count}
                                      </span>
                                    )}
                                  </span>
                                </button>
                              );
                            }
                          )}

                        </div>
                      </div>

                      {/* DATA PLAN CARDS */}

                      {visibleDataPlans.length ===
                      0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-7 text-center">

                          {dataTab ===
                          "HOT" ? (
                            <Flame className="mx-auto h-7 w-7 text-orange-400" />
                          ) : (
                            <Wifi className="mx-auto h-7 w-7 text-slate-400" />
                          )}

                          <p className="mt-3 text-sm font-semibold text-slate-700">
                            No plans available in this category
                          </p>

                          <p className="mt-1 text-xs text-slate-500">
                            Try another plan category.
                          </p>

                        </div>
                      ) : (
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">

                          {visibleDataPlans.map(
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

                              const price =
                                getItemPrice(
                                  item
                                );

                              const selected =
                                selectedItemCode ===
                                code;

                              const hot =
                                isHotDeal(
                                  item
                                );

                              const night =
                                isExtraNight(
                                  item
                                );

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
                                    processingPayment ||
                                    verifyingPin
                                  }
                                  className={[
                                    "relative overflow-hidden rounded-2xl border p-4 text-left transition-all",
                                    "hover:-translate-y-0.5 hover:border-[#082A63]/40",
                                    selected
                                      ? "border-[#082A63] bg-[#082A63]/[0.035] ring-2 ring-[#082A63]/10"
                                      : "border-slate-200 bg-white",
                                  ].join(
                                    " "
                                  )}
                                >

                                  {(hot ||
                                    night) && (
                                    <span
                                      className={[
                                        "absolute right-3 top-3 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold",
                                        hot
                                          ? "bg-orange-50 text-orange-600"
                                          : "bg-indigo-50 text-indigo-600",
                                      ].join(
                                        " "
                                      )}
                                    >
                                      {hot ? (
                                        <Flame className="h-3 w-3" />
                                      ) : null}

                                      {hot
                                        ? "HOT"
                                        : "NIGHT"}
                                    </span>
                                  )}

                                  <div className="pr-10">

                                    <p className="line-clamp-2 text-sm font-bold text-slate-900">
                                      {getItemName(
                                        item
                                      )}
                                    </p>

                                    {(item.validity ||
                                      item.duration) && (
                                      <p className="mt-1 text-xs text-slate-500">
                                        {cleanString(
                                          item.validity ??
                                            item.duration
                                        )}
                                      </p>
                                    )}

                                  </div>

                                  <div className="mt-4 flex items-end justify-between gap-3">

                                    <div>
                                      <p className="text-xs text-slate-500">
                                        Price
                                      </p>

                                      <p className="mt-0.5 text-lg font-extrabold text-[#082A63]">
                                        {formatNaira(
                                          price
                                        )}
                                      </p>
                                    </div>

                                    <span
                                      className={[
                                        "flex h-8 w-8 items-center justify-center rounded-full border",
                                        selected
                                          ? "border-[#082A63] bg-[#082A63] text-white"
                                          : "border-slate-200 text-slate-400",
                                      ].join(
                                        " "
                                      )}
                                    >
                                      {selected ? (
                                        <Check className="h-4 w-4" />
                                      ) : (
                                        <ChevronDown className="h-4 w-4" />
                                      )}
                                    </span>

                                  </div>

                                </button>
                              );
                            }
                          )}

                        </div>
                      )}

                    </>
                  )}

                </section>
              )}

              {/* ==================================================
                  NON-DATA PACKAGE
                  ================================================== */}

              {!isData && (
                <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">

                  <div className="mb-4">

                    <h3 className="text-base font-bold text-slate-900">
                      {isAirtime
                        ? "Airtime Type"
                        : "Package"}
                    </h3>

                    <p className="mt-1 text-xs text-slate-500">
                      {loadingItems
                        ? "Loading available options..."
                        : "Select an option to continue."}
                    </p>

                  </div>

                  {loadingItems ? (
                    <div className="flex min-h-24 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50">
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading packages...
                      </div>
                    </div>
                  ) : !selectedBillerCode ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
                      <p className="text-sm text-slate-500">
                        Select a service above first.
                      </p>
                    </div>
                  ) : items.length ===
                    0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
                      <p className="text-sm font-medium text-slate-700">
                        No packages available
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">

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

                          const selected =
                            selectedItemCode ===
                            code;

                          const price =
                            getItemPrice(
                              item
                            );

                          return (
                            <button
                              type="button"
                              key={`${code}-${index}`}
                              onClick={() =>
                                handleItemChange(
                                  code
                                )
                              }
                              disabled={
                                processingPayment ||
                                verifyingPin
                              }
                              className={[
                                "relative rounded-2xl border p-4 text-left transition-all",
                                "hover:border-[#082A63]/40 hover:bg-[#082A63]/[0.025]",
                                selected
                                  ? "border-[#082A63] bg-[#082A63]/[0.04] ring-2 ring-[#082A63]/10"
                                  : "border-slate-200",
                              ].join(
                                " "
                              )}
                            >

                              {selected && (
                                <span className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-[#082A63] text-white">
                                  <Check className="h-3.5 w-3.5" />
                                </span>
                              )}

                              <p className="pr-8 text-sm font-bold text-slate-900">
                                {getItemName(
                                  item
                                )}
                              </p>

                              {item.description && (
                                <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                                  {item.description}
                                </p>
                              )}

                              {price > 0 && (
                                <p className="mt-3 text-base font-extrabold text-[#082A63]">
                                  {formatNaira(
                                    price
                                  )}
                                </p>
                              )}

                            </button>
                          );
                        }
                      )}

                    </div>
                  )}

                </section>
              )}

              {/* ==================================================
                  CUSTOMER DETAILS
                  ================================================== */}

              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">

                <div className="mb-4">

                  <h3 className="text-base font-bold text-slate-900">
                    Customer Details
                  </h3>

                  <p className="mt-1 text-xs text-slate-500">
                    Enter the details for this payment.
                  </p>

                </div>

                <div className="space-y-2">

                  <Label
                    htmlFor="billCustomer"
                    className="text-sm font-semibold text-slate-800"
                  >
                    {customerLabel}
                  </Label>

                  <Input
                    id="billCustomer"
                    value={customer}
                    onChange={(event) =>
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
                    className="h-12 rounded-xl border-slate-200 focus:border-[#082A63] focus:ring-[#082A63]/20"
                  />

                </div>

              </section>

            </div>

            {/* ==================================================
                RIGHT / PAYMENT
                ================================================== */}

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

                {/* WALLET */}

                <div className="rounded-2xl bg-[#082A63] p-4 text-white">

                  <div className="flex items-center justify-between">

                    <span className="text-xs text-white/70">
                      Wallet Balance
                    </span>

                    <span className="text-xs font-semibold text-white/70">
                      Available
                    </span>

                  </div>

                  <p className="mt-2 text-2xl font-extrabold tracking-tight">
                    {formatNaira(
                      Number(
                        walletBalance
                      )
                    )}
                  </p>

                </div>

                {/* SELECTED PLAN */}

                {selectedItem && (
                  <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">

                    <div className="flex items-start justify-between gap-4">

                      <div className="min-w-0">

                        <p className="text-xs text-slate-500">
                          Selected
                        </p>

                        <p className="mt-1 line-clamp-2 text-sm font-bold text-slate-900">
                          {getItemName(
                            selectedItem
                          )}
                        </p>

                      </div>

                      <p className="shrink-0 text-sm font-bold text-[#082A63]">
                        {formatNaira(
                          amountNumber
                        )}
                      </p>

                    </div>

                  </div>
                )}

                {/* AMOUNT */}

                {!isData && (
                  <div className="mt-5">

                    <div className="mb-3 flex items-center justify-between">

                      <div>
                        <p className="text-sm font-bold text-slate-900">
                          Amount
                        </p>

                        <p className="text-xs text-slate-500">
                          Select an amount
                        </p>
                      </div>

                    </div>

                    <div className="grid grid-cols-2 gap-2">

                      {(isAirtime
                        ? AIRTIME_AMOUNTS
                        : BILL_AMOUNTS
                      ).map(
                        (value) => {
                          const selected =
                            amount ===
                            String(
                              value
                            );

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
                                "rounded-xl border px-3 py-3 text-sm font-bold transition",
                                selected
                                  ? "border-[#082A63] bg-[#082A63]/[0.05] text-[#082A63] ring-1 ring-[#082A63]"
                                  : "border-slate-200 text-slate-700 hover:border-[#082A63]/40 hover:bg-slate-50",
                              ].join(
                                " "
                              )}
                            >
                              {formatNaira(
                                value
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
                          "col-span-2 rounded-xl border px-3 py-3 text-sm font-bold transition",
                          customAmountMode
                            ? "border-[#082A63] bg-[#082A63]/[0.05] text-[#082A63] ring-1 ring-[#082A63]"
                            : "border-slate-200 text-slate-700 hover:border-[#082A63]/40 hover:bg-slate-50",
                        ].join(
                          " "
                        )}
                      >
                        Enter Custom Amount
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
                            event.target
                              .value
                          )
                        }
                        placeholder="Enter amount"
                        disabled={
                          processingPayment ||
                          verifyingPin
                        }
                        autoFocus
                        className="mt-3 h-12 rounded-xl border-slate-200"
                      />
                    )}

                    {(itemMinimum >
                      0 ||
                      itemMaximum >
                        0) && (
                      <p className="mt-2 text-xs text-slate-500">
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

                {/* DATA PRICE */}

                {isData &&
                  selectedItem && (
                    <div className="mt-5 rounded-2xl border border-[#082A63]/10 bg-[#082A63]/[0.035] p-4">

                      <div className="flex items-center justify-between gap-3">

                        <span className="text-sm text-slate-500">
                          Plan Price
                        </span>

                        <span className="text-lg font-extrabold text-[#082A63]">
                          {formatNaira(
                            dataSellingAmount
                          )}
                        </span>

                      </div>

                    </div>
                  )}

                {/* PAYMENT TOTAL */}

                <div className="mt-5 border-t border-slate-200 pt-5">

                  <div className="flex items-center justify-between">

                    <span className="text-sm font-medium text-slate-500">
                      Total
                    </span>

                    <span className="text-xl font-extrabold text-slate-900">
                      {formatNaira(
                        amountNumber
                      )}
                    </span>

                  </div>

                  {Number(
                    walletBalance
                  ) >=
                    amountNumber &&
                    amountNumber > 0 && (
                      <p className="mt-2 text-right text-xs font-medium text-emerald-600">
                        Sufficient wallet balance
                      </p>
                    )}

                </div>

                {/* ERROR */}

                {error && (
                  <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3">
                    <p className="text-sm text-red-700">
                      {error}
                    </p>
                  </div>
                )}

                {/* PAY BUTTON */}

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
                  className="mt-5 h-13 w-full rounded-xl bg-[#082A63] py-6 text-sm font-bold hover:bg-[#061f4a] disabled:opacity-50"
                >
                  {processingPayment ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing Payment...
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="mr-2 h-4 w-4" />
                      Pay {formatNaira(
                        amountNumber
                      )}
                    </>
                  )}
                </Button>

                <div className="mt-4 flex items-center justify-center gap-2 text-center text-[11px] text-slate-400">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Payment is protected by your Payment PIN
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
