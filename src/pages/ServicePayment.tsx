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

import PaymentModal from "@/components/security/PaymentModal";
import TransactionProcessingPage from "@/pages/TransactionProcessing";

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
  // PAYMENT MODAL
  // ==========================================================

  const [paymentModalOpen, setPaymentModalOpen] =
    useState(false);

  // ==========================================================
  // TRANSACTION PROCESSING
  // ==========================================================

  const [
    transactionProcessing,
    setTransactionProcessing,
  ] = useState(false);

  const [
    transactionAmount,
    setTransactionAmount,
  ] = useState(0);

  const [
    transactionDetails,
    setTransactionDetails,
  ] = useState<Record<string, any>>({});

  const [
    transactionIdempotencyKey,
    setTransactionIdempotencyKey,
  ] = useState("");

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

    setPaymentModalOpen(false);

    setTransactionProcessing(false);
    setTransactionAmount(0);
    setTransactionDetails({});
    setTransactionIdempotencyKey("");
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
      transactionProcessing
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
      transactionProcessing
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
      transactionProcessing
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
      transactionProcessing
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
      transactionProcessing
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
  // OPEN PAYMENT MODAL
  // ==========================================================

  const handlePurchase = () => {
    if (!service) {
      return;
    }

    if (
      processingPayment ||
      transactionProcessing
    ) {
      return;
    }

    if (!validateForm()) {
      return;
    }

    setError("");
    setPaymentModalOpen(true);
  };

  // ==========================================================
  // PAYMENT MODAL CONFIRMATION
  //
  // IMPORTANT:
  // PaymentModal handles the PIN.
  // ServicePayment does NOT send the PIN to
  // flutterwave-bills.
  // ==========================================================

  const handlePaymentConfirmed = async (
    ...args: any[]
  ) => {
    if (!service) {
      return;
    }

    if (
      processingPayment ||
      transactionProcessing
    ) {
      return;
    }

    try {
      setPaymentModalOpen(false);
      setProcessingPayment(true);
      setError("");

      const details =
        buildPurchaseDetails();

      const sellingAmount =
        amountNumber;

      /*
       * One idempotency key belongs to this
       * complete bill-payment attempt.
       *
       * TransactionProcessingPage and the
       * bill-payment Edge Function use it.
       */
      const idempotencyKey =
        `BILL_${crypto.randomUUID()}`;

      setTransactionAmount(
        sellingAmount
      );

      setTransactionDetails({
        ...details,

        service: serviceType,

        amount:
          sellingAmount,

        country: "NG",

        biller_code:
          selectedBillerCode,

        item_code:
          selectedItemCode,

        customer:
          details.customer,

        idempotency_key:
          idempotencyKey,
      });

      setTransactionIdempotencyKey(
        idempotencyKey
      );

      console.log(
        "Payment confirmed. Starting transaction processing:",
        {
          transactionType:
            "bill",

          amount:
            sellingAmount,

          idempotencyKey,

          details,
        }
      );

      setTransactionProcessing(true);
    } catch (err: any) {
      console.error(
        "Payment confirmation failed:",
        err
      );

      const message =
        err?.message ||
        "Unable to start payment processing.";

      setError(message);

      toast({
        title: "Payment failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setProcessingPayment(false);
    }
  };

  // ==========================================================
  // TRANSACTION DONE
  // ==========================================================

  const handleTransactionDone = async (
    result?: any
  ) => {
    console.log(
      "Bill transaction processing completed:",
      result
    );

    setTransactionProcessing(false);
    setProcessingPayment(false);

    /*
     * Keep the parent callback compatible with
     * the existing Dashboard implementation.
     *
     * TransactionProcessingPage has already
     * processed the bill through flutterwave-bills.
     */
    try {
      await onPurchase(
        transactionAmount,
        transactionDetails
      );
    } catch (error) {
      console.error(
        "Parent purchase callback failed:",
        error
      );
    }

    toast({
      title:
        result?.status === "pending"
          ? "Payment Processing"
          : "Payment Successful",

      description:
        result?.message ||
        (
          result?.status === "pending"
            ? `${service?.title ?? "Payment"} is being verified.`
            : `${service?.title ?? "Payment"} was completed successfully.`
        ),
    });

    resetForm();
  };

  // ==========================================================
  // TRANSACTION BACK
  // ==========================================================

  const handleTransactionBack = () => {
    if (processingPayment) {
      return;
    }

    setTransactionProcessing(false);
    setTransactionAmount(0);
    setTransactionDetails({});
    setTransactionIdempotencyKey("");

    setError("");
  };

  // ==========================================================
  // BACK
  // ==========================================================

  const handleBack = () => {
    if (
      processingPayment ||
      transactionProcessing
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
  // TRANSACTION PROCESSING SCREEN
  // ==========================================================

  if (
    transactionProcessing &&
    transactionIdempotencyKey
  ) {
    return (
      <TransactionProcessingPage
        transactionType="bill"
        amount={transactionAmount}
        details={{
          ...transactionDetails,

          /*
           * Explicitly identify the bill service.
           */
          service: serviceType,

          /*
           * Keep the exact provider/customer
           * information available to the
           * transaction processor.
           */
          biller_code:
            transactionDetails.biller_code,

          item_code:
            transactionDetails.item_code,

          customer:
            transactionDetails.customer,

          country: "NG",
        }}
        idempotencyKey={
          transactionIdempotencyKey
        }
        onDone={
          handleTransactionDone
        }
        onBack={
          handleTransactionBack
        }
      />
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
              onClick={handleBack}
              disabled={
                processingPayment ||
                transactionProcessing
              }
              className="text-white hover:bg-white/20"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>

            <h1 className="text-lg font-bold">
              {service.title}
            </h1>

          </div>

        </div>
      </header>

      {/* CONTENT */}

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6">

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
                !transactionProcessing && (
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
                transactionProcessing ||
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
                                transactionProcessing
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
                  transactionProcessing ||
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
                transactionProcessing
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
                      transactionProcessing
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
                    transactionProcessing
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
                    transactionProcessing
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
              transactionProcessing ||
              !selectedBillerCode ||
              !selectedItemCode ||
              !customer.trim() ||
              !amount
            }
            className="w-full bg-green-600 hover:bg-green-700 h-11"
          >

            {processingPayment ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Preparing Payment...
              </>
            ) : (
              `Purchase ${service.title}`
            )}

          </Button>

        </div>

      </main>

      {/* ======================================================
          PAYMENT MODAL

          PaymentModal is responsible for collecting and
          verifying the user's Payment PIN.

          The PIN is NOT forwarded to flutterwave-bills.
          ====================================================== */}

      {paymentModalOpen && (
        <PaymentModal
          open={paymentModalOpen}
          amount={amountNumber}
          title={`Confirm ${service.title}`}
          details={{
            service: serviceType,

            amount:
              amountNumber,

            provider:
              selectedBiller?.name ??
              selectedBiller?.short_name ??
              "",

            customer:
              normaliseCustomer(),

            biller_code:
              selectedBillerCode,

            item_code:
              selectedItemCode,

            country: "NG",

            item:
              selectedItem,

            biller:
              selectedBiller,
          }}
          onClose={() => {
            if (processingPayment) {
              return;
            }

            setPaymentModalOpen(false);
          }}
          onConfirm={
            handlePaymentConfirmed
          }
        />
      )}

    </div>
  );
};

export default ServicePayment;
