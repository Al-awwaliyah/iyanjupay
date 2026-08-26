import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ArrowLeft,
  Loader2,
  RefreshCw,
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

const SERVICE_CATEGORY_MAP: Record<string, string> = {
  airtime: "AIRTIME",
  data: "MOBILEDATA",
  electricity: "UTILITYBILLS",
  cable: "CABLEBILLS",
  internet: "INTSERVICE",
};

const DATA_MARKUP = 50;

const AIRTIME_AMOUNTS = [
  50,
  100,
  200,
  500,
  1000,
];

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

function numberValue(value: unknown): number {
  const n = Number(value);

  return Number.isFinite(n) ? n : 0;
}

function formatNaira(value: number): string {
  return `₦${Number(value).toLocaleString("en-NG")}`;
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

// ============================================================
// COMPONENT
// ============================================================

const ServicePayment = ({
  service,
  walletBalance,
  onBack,
  onPurchase,
}: ServicePaymentProps) => {
  // ==========================================================
  // FORM STATE
  // ==========================================================

  const [amount, setAmount] = useState("");
  const [customer, setCustomer] = useState("");
  const [customAmountMode, setCustomAmountMode] =
    useState(false);

  // ==========================================================
  // PAYMENT PIN FLOW
  // ==========================================================

  const [pinStep, setPinStep] = useState<
    "none" | "create" | "confirm" | "authorize"
  >("none");

  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");

  const [paymentPin, setPaymentPin] =
    useState("");

  const [checkingPinStatus, setCheckingPinStatus] =
    useState(false);

  const [creatingPin, setCreatingPin] =
    useState(false);

  const [verifyingPin, setVerifyingPin] =
    useState(false);

  // ==========================================================
  // CATALOGUE
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

  const [loadingBillers, setLoadingBillers] =
    useState(false);

  const [loadingItems, setLoadingItems] =
    useState(false);

  const [processingPayment, setProcessingPayment] =
    useState(false);

  const [error, setError] = useState("");

  const { toast } = useToast();

  // ==========================================================
  // SERVICE
  // ==========================================================

  const serviceType =
    service?.type ?? "";

  const category = useMemo(
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

    items.forEach((item) => {
      const group = getDataGroup(item);

      groups[group].push(item);
    });

    return groups;
  }, [items]);

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

  const customerPlaceholder = useMemo(() => {
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

    setPinStep("none");

    setNewPin("");
    setConfirmPin("");
    setPaymentPin("");

    setCheckingPinStatus(false);
    setCreatingPin(false);
    setVerifyingPin(false);
  };

  // ==========================================================
  // RESET WHEN SERVICE CHANGES
  // ==========================================================

  useEffect(() => {
    resetForm();
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
        Array.isArray(data?.billers)
          ? data.billers
          : [];

      setBillers(loadedBillers);

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
        title: "Unable to load providers",
        description: message,
        variant: "destructive",
      });
    } finally {
      setLoadingBillers(false);
    }
  };

  // ==========================================================
  // LOAD BILLERS WHEN PAGE OPENS
  // ==========================================================

  useEffect(() => {
    if (!category) {
      return;
    }

    loadBillers();
  }, [category]);

  // ==========================================================
  // LOAD ITEMS
  // ==========================================================

  const loadItems = async (
    billerCode: string
  ) => {
    const cleanBillerCode =
      String(billerCode ?? "").trim();

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
        Array.isArray(data?.items)
          ? data.items
          : [];

      setItems(loadedItems);

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
        title: "Unable to load packages",
        description: message,
        variant: "destructive",
      });
    } finally {
      setLoadingItems(false);
    }
  };

  // ==========================================================
  // BILLER CHANGE
  // ==========================================================

  const handleBillerChange = async (
    value: string
  ) => {
    if (
      processingPayment ||
      verifyingPin ||
      creatingPin ||
      checkingPinStatus
    ) {
      return;
    }

    setSelectedBillerCode(value);

    await loadItems(value);
  };

  // ==========================================================
  // DATA PLAN
  // ==========================================================

  const handleDataPlanSelect = (
    item: BillItem
  ) => {
    if (
      processingPayment ||
      verifyingPin ||
      creatingPin ||
      checkingPinStatus
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
      getItemProviderPrice(item);

    if (providerPrice <= 0) {
      toast({
        title: "Invalid data plan",
        description:
          "This data plan does not have a valid price.",
        variant: "destructive",
      });

      return;
    }

    setSelectedItemCode(code);

    setAmount(
      String(
        getDataSellingPrice(item)
      )
    );

    setCustomAmountMode(false);
    setError("");
  };

  // ==========================================================
  // NON-DATA ITEM
  // ==========================================================

  const handleItemChange = (
    value: string
  ) => {
    if (
      processingPayment ||
      verifyingPin ||
      creatingPin ||
      checkingPinStatus
    ) {
      return;
    }

    setSelectedItemCode(value);
    setError("");
    setAmount("");
    setCustomAmountMode(false);
  };

  // ==========================================================
  // AMOUNT
  // ==========================================================

  const handleAmountSelect = (
    value: number
  ) => {
    if (
      processingPayment ||
      verifyingPin ||
      creatingPin ||
      checkingPinStatus
    ) {
      return;
    }

    setAmount(String(value));
    setCustomAmountMode(false);
    setError("");
  };

  const handleCustomAmount = () => {
    if (
      processingPayment ||
      verifyingPin ||
      creatingPin ||
      checkingPinStatus
    ) {
      return;
    }

    setCustomAmountMode(true);
    setAmount("");
    setError("");
  };

  // ==========================================================
  // AMOUNT RULES
  // ==========================================================

  const amountNumber = Number(amount);

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
    isData && selectedItem
      ? getDataSellingPrice(
          selectedItem
        )
      : 0;

  // ==========================================================
  // CUSTOMER NORMALISATION
  // ==========================================================

  const normaliseCustomer = (): string => {
    let value = customer.trim();

    if (
      serviceType === "airtime" ||
      serviceType === "data"
    ) {
      value = value.replace(
        /\s+/g,
        ""
      );

      if (
        /^0\d{10}$/.test(value)
      ) {
        return `+234${value.substring(1)}`;
      }

      if (
        /^\d{10}$/.test(value)
      ) {
        return `+234${value}`;
      }

      if (
        /^234\d{10}$/.test(value)
      ) {
        return `+${value}`;
      }

      if (
        /^\+234\d{10}$/.test(value)
      ) {
        return value;
      }
    }

    return value;
  };

  // ==========================================================
  // VALIDATION
  // ==========================================================

  const validateForm = (): boolean => {
    if (!selectedBillerCode) {
      toast({
        title: "Select a provider",
        description:
          "Please select a bill provider.",
        variant: "destructive",
      });

      return false;
    }

    if (!selectedItemCode) {
      toast({
        title: "Select a package",
        description:
          "Please select a bill package.",
        variant: "destructive",
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
        variant: "destructive",
      });

      return false;
    }

    if (
      serviceType === "airtime" ||
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
          variant: "destructive",
        });

        return false;
      }
    }

    if (
      !Number.isFinite(amountNumber) ||
      amountNumber <= 0
    ) {
      toast({
        title: "Invalid amount",
        description:
          "Please select or enter a valid amount.",
        variant: "destructive",
      });

      return false;
    }

    if (isData) {
      if (providerItemAmount <= 0) {
        toast({
          title:
            "Invalid data plan",
          description:
            "The selected data plan does not have a valid provider price.",
          variant: "destructive",
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
          variant: "destructive",
        });

        return false;
      }
    }

    if (
      !isData &&
      itemMinimum > 0 &&
      amountNumber < itemMinimum
    ) {
      toast({
        title: "Amount too low",
        description:
          `Minimum amount is ${formatNaira(
            itemMinimum
          )}.`,
        variant: "destructive",
      });

      return false;
    }

    if (
      !isData &&
      itemMaximum > 0 &&
      amountNumber > itemMaximum
    ) {
      toast({
        title: "Amount too high",
        description:
          `Maximum amount is ${formatNaira(
            itemMaximum
          )}.`,
        variant: "destructive",
      });

      return false;
    }

    if (
      amountNumber >
      Number(walletBalance)
    ) {
      toast({
        title: "Insufficient Balance",
        description:
          "Please fund your wallet to continue.",
        variant: "destructive",
      });

      return false;
    }

    return true;
  };

  // ==========================================================
  // PURCHASE DETAILS
  // ==========================================================

  const buildPurchaseDetails = () => {
    const finalCustomer =
      normaliseCustomer();

    const providerAmount =
      isData
        ? providerItemAmount
        : amountNumber;

    return {
      customer: finalCustomer,

      biller_code:
        selectedBillerCode,

      item_code:
        selectedItemCode,

      provider:
        selectedBiller?.name ??
        selectedBiller?.short_name ??
        "",

      phoneNumber:
        serviceType === "airtime" ||
        serviceType === "data"
          ? finalCustomer
          : "",

      phone:
        serviceType === "airtime" ||
        serviceType === "data"
          ? finalCustomer
          : "",

      meterNumber:
        serviceType === "electricity"
          ? finalCustomer
          : "",

      meter_number:
        serviceType === "electricity"
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
        serviceType === "internet"
          ? finalCustomer
          : "",

      account_number:
        serviceType === "internet"
          ? finalCustomer
          : "",

      type: serviceType,

      country: "NG",

      customerLabel,

      item: selectedItem,

      biller: selectedBiller,

      selling_amount:
        amountNumber,

      provider_amount:
        providerAmount,

      data_markup:
        isData
          ? DATA_MARKUP
          : 0,
    };
  };

  // ==========================================================
  // CHECK PAYMENT PIN STATUS
  // ==========================================================

  const checkPaymentPinStatus =
    async (): Promise<boolean> => {
      try {
        setCheckingPinStatus(true);
        setError("");

        /*
         * Expected RPC result:
         *
         * {
         *   has_payment_pin: true
         * }
         *
         * or:
         *
         * {
         *   has_payment_pin: false
         * }
         */

        const {
          data,
          error: rpcError,
        } =
          await supabase.rpc(
            "get_payment_pin_status"
          );

        if (rpcError) {
          console.error(
            "Payment PIN status error:",
            rpcError
          );

          throw new Error(
            rpcError.message ||
              "Unable to check Payment PIN status."
          );
        }

        const hasPaymentPin =
          Boolean(
            data?.has_payment_pin ??
              data?.hasPaymentPin ??
              data?.has_pin ??
              data?.hasPin ??
              false
          );

        return hasPaymentPin;
      } catch (err: any) {
        console.error(
          "Failed to check Payment PIN status:",
          err
        );

        const message =
          err?.message ||
          "Unable to check your Payment PIN.";

        setError(message);

        toast({
          title:
            "Payment PIN check failed",
          description: message,
          variant: "destructive",
        });

        return false;
      } finally {
        setCheckingPinStatus(false);
      }
    };

  // ==========================================================
  // CREATE PAYMENT PIN
  // ==========================================================

  const handleCreatePaymentPin =
    async () => {
      if (
        creatingPin ||
        verifyingPin ||
        processingPayment
      ) {
        return;
      }

      if (
        !/^\d{4}$/.test(newPin)
      ) {
        toast({
          title: "Invalid PIN",
          description:
            "Create a 4-digit Payment PIN.",
          variant: "destructive",
        });

        return;
      }

      if (
        !/^\d{4}$/.test(confirmPin)
      ) {
        toast({
          title: "Invalid PIN",
          description:
            "Confirm your 4-digit Payment PIN.",
          variant: "destructive",
        });

        return;
      }

      if (newPin !== confirmPin) {
        setConfirmPin("");

        toast({
          title: "PIN mismatch",
          description:
            "The Payment PINs do not match.",
          variant: "destructive",
        });

        return;
      }

      try {
        setCreatingPin(true);
        setError("");

        const {
          data,
          error: rpcError,
        } =
          await supabase.rpc(
            "create_payment_pin",
            {
              _pin: newPin,
            }
          );

        if (rpcError) {
          console.error(
            "Create Payment PIN error:",
            rpcError
          );

          throw new Error(
            rpcError.message ||
              "Unable to create Payment PIN."
          );
        }

        if (
          !data ||
          data.success !== true
        ) {
          throw new Error(
            data?.message ||
              data?.error ||
              "Unable to create Payment PIN."
          );
        }

        setNewPin("");
        setConfirmPin("");

        toast({
          title:
            "Payment PIN created",
          description:
            "Your Payment PIN has been created successfully.",
        });

        /*
         * Immediately continue to authorization.
         *
         * The newly created PIN is NOT automatically
         * accepted as authorization. The user must
         * explicitly enter it again.
         */

        setPaymentPin("");
        setPinStep("authorize");
      } catch (err: any) {
        console.error(
          "Payment PIN creation failed:",
          err
        );

        const message =
          err?.message ||
          "Unable to create Payment PIN.";

        setError(message);

        toast({
          title:
            "Unable to create Payment PIN",
          description: message,
          variant: "destructive",
        });
      } finally {
        setCreatingPin(false);
      }
    };

  // ==========================================================
  // SHOW PIN CREATION / AUTHORIZATION
  // ==========================================================

  const handlePurchase = async () => {
    if (!service) {
      return;
    }

    if (
      processingPayment ||
      verifyingPin ||
      creatingPin ||
      checkingPinStatus
    ) {
      return;
    }

    /*
     * 1. Validate payment details first.
     */
    if (!validateForm()) {
      return;
    }

    /*
     * 2. Check whether the user has a Payment PIN.
     */
    const hasPaymentPin =
      await checkPaymentPinStatus();

    if (!hasPaymentPin) {
      /*
       * No PIN exists.
       *
       * Show PIN creation screen.
       */
      setNewPin("");
      setConfirmPin("");
      setPaymentPin("");
      setError("");

      setPinStep("create");

      return;
    }

    /*
     * PIN already exists.
     *
     * Ask user to authorize the payment.
     */
    setPaymentPin("");
    setError("");
    setPinStep("authorize");
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
        verifyingPin ||
        creatingPin
      ) {
        return;
      }

      if (
        !/^\d{4}$/.test(
          paymentPin
        )
      ) {
        toast({
          title: "Invalid PIN",
          description:
            "Enter your 4-digit Payment PIN.",
          variant: "destructive",
        });

        return;
      }

      try {
        setVerifyingPin(true);
        setError("");

        /*
         * Verify the Payment PIN.
         */
        const {
          data,
          error: pinError,
        } =
          await supabase.rpc(
            "verify_payment_pin",
            {
              _pin: paymentPin,
            }
          );

        if (pinError) {
          console.error(
            "Payment PIN verification error:",
            pinError
          );

          throw new Error(
            pinError.message ||
              "Unable to verify Payment PIN."
          );
        }

        if (
          !data ||
          data.success !== true
        ) {
          const message =
            data?.message ||
            "Invalid Payment PIN.";

          setPaymentPin("");

          toast({
            title: "Payment PIN",
            description: message,
            variant: "destructive",
          });

          return;
        }

        /*
         * PIN is valid.
         *
         * Build the purchase details only after
         * successful authorization.
         */
        const details =
          buildPurchaseDetails();

        const sellingAmount =
          amountNumber;

        setPinStep("none");
        setPaymentPin("");
        setProcessingPayment(true);

        console.log(
          "Payment PIN verified. Sending bill purchase:",
          {
            service: serviceType,
            selling_amount:
              sellingAmount,
            provider_amount:
              details.provider_amount,
            data_markup:
              details.data_markup,
            biller_code:
              selectedBillerCode,
            item_code:
              selectedItemCode,
            customer:
              details.customer,
            details,
          }
        );

        /*
         * IMPORTANT:
         *
         * The actual wallet debit/provider payment
         * remains inside onPurchase / the
         * flutterwave-bills Edge Function.
         *
         * This component only authorizes the payment.
         */
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

        setError(message);

        toast({
          title: "Payment failed",
          description: message,
          variant: "destructive",
        });
      } finally {
        setVerifyingPin(false);
        setProcessingPayment(false);
      }
    };

  // ==========================================================
  // BACK FROM PIN FLOW
  // ==========================================================

  const handlePinBack = () => {
    if (
      processingPayment ||
      verifyingPin ||
      creatingPin
    ) {
      return;
    }

    setNewPin("");
    setConfirmPin("");
    setPaymentPin("");
    setError("");

    setPinStep("none");
  };

  // ==========================================================
  // BACK
  // ==========================================================

  const handleBack = () => {
    if (
      processingPayment ||
      verifyingPin ||
      creatingPin ||
      checkingPinStatus
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50">
        <div className="text-center">
          <p className="text-gray-600 mb-4">
            No payment service selected.
          </p>

          <Button onClick={onBack}>
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
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50 pb-8">

      {/* HEADER */}

      <header className="bg-gradient-to-r from-purple-600 to-blue-600 text-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">

          <div className="flex items-center gap-3 h-16">

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={
                pinStep !== "none"
                  ? handlePinBack
                  : handleBack
              }
              disabled={
                processingPayment ||
                verifyingPin ||
                creatingPin ||
                checkingPinStatus
              }
              className="text-white hover:bg-white/20"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>

            <h1 className="text-lg font-bold">
              {pinStep === "create"
                ? "Create Payment PIN"
                : pinStep === "authorize"
                  ? "Authorize Payment"
                  : service.title}
            </h1>

          </div>

        </div>
      </header>

      {/* CONTENT */}

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6">

        {/* ==================================================
            CREATE PAYMENT PIN
        ================================================== */}

        {pinStep === "create" ? (
          <div className="bg-white rounded-2xl shadow-sm border p-5 sm:p-6">

            <div className="text-center mb-6">

              <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-3">
                <span className="text-2xl">
                  🔐
                </span>
              </div>

              <h2 className="text-xl font-bold text-gray-900">
                Create Payment PIN
              </h2>

              <p className="text-sm text-gray-500 mt-2">
                You need a Payment PIN to
                authorize payments from your
                wallet.
              </p>

            </div>

            {/* PAYMENT SUMMARY */}

            <div className="rounded-xl bg-blue-50 border border-blue-100 p-4 space-y-3 mb-6">

              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-gray-600">
                  Service
                </span>

                <span className="text-sm font-semibold text-gray-900">
                  {service.title}
                </span>
              </div>

              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-gray-600">
                  Amount
                </span>

                <span className="font-bold text-blue-700">
                  {formatNaira(
                    amountNumber
                  )}
                </span>
              </div>

              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-gray-600">
                  {customerLabel}
                </span>

                <span className="text-sm font-medium text-gray-900 text-right break-all">
                  {normaliseCustomer()}
                </span>
              </div>

            </div>

            {/* NEW PIN */}

            <div className="space-y-2 mb-5">

              <Label htmlFor="newPaymentPin">
                Create 4-digit Payment PIN
              </Label>

              <Input
                id="newPaymentPin"
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                maxLength={4}
                value={newPin}
                onChange={(event) => {
                  const value =
                    event.target.value
                      .replace(/\D/g, "")
                      .slice(0, 4);

                  setNewPin(value);
                  setError("");
                }}
                placeholder="••••"
                disabled={creatingPin}
                autoFocus
                className="text-center text-2xl tracking-[0.5em]"
              />

            </div>

            {/* CONFIRM PIN */}

            <div className="space-y-2 mb-5">

              <Label htmlFor="confirmPaymentPin">
                Confirm Payment PIN
              </Label>

              <Input
                id="confirmPaymentPin"
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                maxLength={4}
                value={confirmPin}
                onChange={(event) => {
                  const value =
                    event.target.value
                      .replace(/\D/g, "")
                      .slice(0, 4);

                  setConfirmPin(value);
                  setError("");
                }}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    newPin.length === 4 &&
                    confirmPin.length === 4 &&
                    !creatingPin
                  ) {
                    handleCreatePaymentPin();
                  }
                }}
                placeholder="••••"
                disabled={creatingPin}
                className="text-center text-2xl tracking-[0.5em]"
              />

            </div>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 mb-5">
                <p className="text-sm text-red-700">
                  {error}
                </p>
              </div>
            )}

            <div className="space-y-3">

              <Button
                type="button"
                onClick={
                  handleCreatePaymentPin
                }
                disabled={
                  creatingPin ||
                  newPin.length !== 4 ||
                  confirmPin.length !== 4
                }
                className="w-full bg-blue-600 hover:bg-blue-700 h-11"
              >
                {creatingPin ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating PIN...
                  </>
                ) : (
                  "Create PIN"
                )}
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={
                  handlePinBack
                }
                disabled={creatingPin}
                className="w-full"
              >
                Cancel
              </Button>

            </div>

            <p className="text-xs text-gray-500 text-center mt-5">
              Never share your Payment PIN
              with anyone.
            </p>

          </div>

        ) : pinStep === "authorize" ? (

          /* ==================================================
             AUTHORIZE PAYMENT
          ================================================== */

          <div className="bg-white rounded-2xl shadow-sm border p-5 sm:p-6">

            <div className="text-center mb-6">

              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                <span className="text-2xl">
                  🔐
                </span>
              </div>

              <h2 className="text-xl font-bold text-gray-900">
                Authorize Payment
              </h2>

              <p className="text-sm text-gray-500 mt-1">
                Enter your 4-digit Payment PIN
                to authorize this payment.
              </p>

              <p className="text-lg font-semibold text-green-700 mt-2">
                {service.title}
              </p>

            </div>

            {/* SUMMARY */}

            <div className="rounded-xl bg-green-50 border border-green-100 p-4 space-y-3 mb-6">

              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-gray-600">
                  Amount
                </span>

                <span className="font-bold text-green-700">
                  {formatNaira(
                    amountNumber
                  )}
                </span>
              </div>

              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-gray-600">
                  Provider
                </span>

                <span className="text-sm font-medium text-gray-900 text-right">
                  {selectedBiller?.name ??
                    selectedBiller?.short_name ??
                    "-"}
                </span>
              </div>

              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-gray-600">
                  {customerLabel}
                </span>

                <span className="text-sm font-medium text-gray-900 text-right break-all">
                  {normaliseCustomer()}
                </span>
              </div>

              {selectedItem && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-gray-600">
                    Package
                  </span>

                  <span className="text-sm font-medium text-gray-900 text-right">
                    {selectedItem.name ??
                      selectedItem.short_name ??
                      "-"}
                  </span>
                </div>
              )}

            </div>

            {/* PIN */}

            <div className="space-y-2 mb-5">

              <Label htmlFor="servicePaymentPin">
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
                      .slice(0, 4);

                  setPaymentPin(value);
                  setError("");
                }}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    paymentPin.length === 4 &&
                    !verifyingPin
                  ) {
                    handlePinVerification();
                  }
                }}
                placeholder="••••"
                disabled={verifyingPin}
                autoFocus
                className="text-center text-2xl tracking-[0.5em]"
              />

              <p className="text-xs text-gray-500 text-center">
                Your Payment PIN is securely
                verified before the payment
                is processed.
              </p>

            </div>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 mb-5">
                <p className="text-sm text-red-700">
                  {error}
                </p>
              </div>
            )}

            <div className="space-y-3">

              <Button
                type="button"
                onClick={
                  handlePinVerification
                }
                disabled={
                  verifyingPin ||
                  paymentPin.length !== 4
                }
                className="w-full bg-green-600 hover:bg-green-700"
              >
                {verifyingPin ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Verifying PIN...
                  </>
                ) : (
                  "Authorize Payment"
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
                  setPinStep("none");
                }}
                disabled={verifyingPin}
                className="w-full"
              >
                Back
              </Button>

            </div>

          </div>

        ) : (

          /* ==================================================
             NORMAL FORM
          ================================================== */

          <div className="bg-white rounded-2xl shadow-sm border p-5 sm:p-6">

            {/* WALLET */}

            <div className="bg-green-50 border border-green-100 p-4 rounded-xl mb-5">

              <p className="text-sm text-green-700">
                Wallet Balance:{" "}
                <strong>
                  {formatNaira(
                    Number(walletBalance)
                  )}
                </strong>
              </p>

            </div>

            {/* LOADING BILLERS */}

            {loadingBillers && (
              <div className="flex items-center justify-center gap-2 py-4 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading providers...
              </div>
            )}

            {/* PROVIDER */}

            <div className="space-y-2 mb-5">

              <div className="flex items-center justify-between">

                <Label>
                  Provider
                </Label>

                {!loadingBillers &&
                  !processingPayment &&
                  !verifyingPin &&
                  !creatingPin &&
                  !checkingPinStatus && (
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
                  verifyingPin ||
                  creatingPin ||
                  checkingPinStatus ||
                  billers.length === 0
                }
                className="w-full h-11 rounded-md border bg-background px-3 text-sm"
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

            {/* DATA */}

            {isData ? (
              <div className="space-y-4 mb-5">

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
                  <div className="rounded-lg border border-dashed p-5 text-center text-sm text-gray-500">
                    Select a provider to view
                    data plans.
                  </div>
                )}

                {selectedBillerCode &&
                  !loadingItems &&
                  items.length === 0 && (
                    <div className="rounded-lg border border-dashed p-5 text-center text-sm text-gray-500">
                      No data plans are
                      currently available.
                    </div>
                  )}

                {(
                  [
                    "Daily",
                    "Weekly",
                    "Monthly",
                    "Other",
                  ] as const
                ).map((group) => {
                  const groupItems =
                    dataGroups[group];

                  if (
                    groupItems.length === 0
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

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">

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
                                  processingPayment ||
                                  verifyingPin ||
                                  creatingPin ||
                                  checkingPinStatus
                                }
                                className={[
                                  "text-left rounded-xl border p-3 transition-all",
                                  "hover:border-green-500 hover:bg-green-50",
                                  selected
                                    ? "border-green-600 bg-green-50 ring-1 ring-green-600"
                                    : "border-gray-200 bg-white",
                                ].join(" ")}
                              >

                                <p className="text-sm font-medium text-gray-900 line-clamp-2">
                                  {item.name ??
                                    item.short_name ??
                                    "Data Plan"}
                                </p>

                                <p className="text-base font-bold text-green-700 mt-2">
                                  {formatNaira(
                                    sellingPrice
                                  )}
                                </p>

                              </button>
                            );
                          }
                        )}

                      </div>

                    </div>
                  );
                })}

              </div>
            ) : (

              /* =================================================
                 NON-DATA PACKAGE
              ================================================= */

              <div className="space-y-2 mb-5">

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
                    verifyingPin ||
                    creatingPin ||
                    checkingPinStatus ||
                    !selectedBillerCode ||
                    items.length === 0
                  }
                  className="w-full h-11 rounded-md border bg-background px-3 text-sm"
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

            {/* CUSTOMER */}

            <div className="space-y-2 mb-5">

              <Label htmlFor="billCustomer">
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
                  verifyingPin ||
                  creatingPin ||
                  checkingPinStatus
                }
                inputMode={
                  serviceType ===
                      "airtime" ||
                  serviceType ===
                      "data" ||
                  serviceType ===
                      "electricity" ||
                  serviceType === "cable"
                    ? "numeric"
                    : "text"
                }
              />

            </div>

            {/* DATA PRICE */}

            {isData &&
              selectedItem && (
                <div className="rounded-lg bg-green-50 border border-green-100 p-4 mb-5">

                  <div className="flex items-center justify-between gap-4">

                    <span className="text-sm text-gray-600">
                      Selected Plan
                    </span>

                    <span className="text-sm font-medium text-right">
                      {selectedItem.name ??
                        selectedItem.short_name}
                    </span>

                  </div>

                  <div className="flex items-center justify-between mt-2">

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

            {/* AMOUNT */}

            {!isData && (
              <div className="space-y-2 mb-5">

                <Label>
                  Amount (₦)
                </Label>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">

                  {(isAirtime
                    ? AIRTIME_AMOUNTS
                    : BILL_AMOUNTS
                  ).map((value) => (
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
                        verifyingPin ||
                        creatingPin ||
                        checkingPinStatus
                      }
                      className={[
                        "rounded-xl border p-3 text-center font-semibold transition-all",
                        "hover:border-green-500 hover:bg-green-50",
                        amount ===
                        String(value)
                          ? "border-green-600 bg-green-50 text-green-700 ring-1 ring-green-600"
                          : "border-gray-200",
                      ].join(" ")}
                    >
                      {formatNaira(value)}
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={
                      handleCustomAmount
                    }
                    disabled={
                      processingPayment ||
                      verifyingPin ||
                      creatingPin ||
                      checkingPinStatus
                    }
                    className={[
                      "rounded-xl border p-3 text-center font-semibold transition-all",
                      "hover:border-green-500 hover:bg-green-50",
                      customAmountMode
                        ? "border-green-600 bg-green-50 text-green-700 ring-1 ring-green-600"
                        : "border-gray-200",
                    ].join(" ")}
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
                    onChange={(event) =>
                      setAmount(
                        event.target.value
                      )
                    }
                    placeholder="Enter exact amount"
                    disabled={
                      processingPayment ||
                      verifyingPin ||
                      creatingPin ||
                      checkingPinStatus
                    }
                    autoFocus
                  />
                )}

                {(itemMinimum > 0 ||
                  itemMaximum > 0) && (
                  <p className="text-xs text-gray-500">

                    {itemMinimum > 0
                      ? `Minimum: ${formatNaira(
                          itemMinimum
                        )}`
                      : ""}

                    {itemMinimum > 0 &&
                    itemMaximum > 0
                      ? " • "
                      : ""}

                    {itemMaximum > 0
                      ? `Maximum: ${formatNaira(
                          itemMaximum
                        )}`
                      : ""}

                  </p>
                )}

              </div>
            )}

            {/* ERROR */}

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 mb-5">
                <p className="text-sm text-red-700">
                  {error}
                </p>
              </div>
            )}

            {/* PURCHASE */}

            <Button
              type="button"
              onClick={
                handlePurchase
              }
              disabled={
                loadingBillers ||
                loadingItems ||
                processingPayment ||
                verifyingPin ||
                creatingPin ||
                checkingPinStatus ||
                !selectedBillerCode ||
                !selectedItemCode ||
                !customer.trim() ||
                !amount
              }
              className="w-full bg-green-600 hover:bg-green-700 h-11"
            >

              {checkingPinStatus ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Checking Payment PIN...
                </>
              ) : processingPayment ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                `Purchase ${service.title}`
              )}

            </Button>

            {processingPayment && (
              <p className="text-xs text-center text-gray-500 mt-3">
                Please do not leave this page
                while your payment is being
                processed.
              </p>
            )}

          </div>
        )}

      </main>
    </div>
  );
};

export default ServicePayment;
