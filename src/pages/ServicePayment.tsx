import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ArrowLeft,
  Loader2,
  RefreshCw,
  Flame,
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

  provider?: string;
  provider_id?: string;

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

  provider?: string;
  provider_id?: string;
  provider_amount?: number | string;

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

const DATA_MARKUP = 50;

const CLUBKONNECT_MARKUP_RATE = 0.15;

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

const PROVIDER_FLUTTERWAVE = "flutterwave";
const PROVIDER_CLUBKONNECT = "clubkonnect";

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
  return `₦${Number(value).toLocaleString("en-NG")}`;
}

function getProviderId(
  biller: Biller | null
): string {
  return cleanString(
    biller?.provider_id ??
      biller?.provider ??
      PROVIDER_FLUTTERWAVE
  ).toLowerCase();
}

function getItemProviderId(
  item: BillItem | null
): string {
  return cleanString(
    item?.provider_id ??
      item?.provider ??
      PROVIDER_FLUTTERWAVE
  ).toLowerCase();
}

function getItemProviderPrice(
  item: BillItem | null
): number {
  return numberValue(
    item?.provider_amount ??
      item?.amount ??
      item?.price ??
      item?.cost ??
      item?.value
  );
}

function isClubKonnect(
  providerId: string
): boolean {
  return (
    providerId.toLowerCase() ===
    PROVIDER_CLUBKONNECT
  );
}

function getClubKonnectSellingPrice(
  providerAmount: number
): number {
  return Math.ceil(
    providerAmount *
      (1 + CLUBKONNECT_MARKUP_RATE)
  );
}

function getDataSellingPrice(
  item: BillItem,
  providerId: string
): number {
  const providerPrice =
    getItemProviderPrice(item);

  if (
    isClubKonnect(providerId)
  ) {
    return getClubKonnectSellingPrice(
      providerPrice
    );
  }

  return providerPrice + DATA_MARKUP;
}

function getNonDataSellingPrice(
  providerAmount: number,
  providerId: string
): number {
  if (
    isClubKonnect(providerId)
  ) {
    return getClubKonnectSellingPrice(
      providerAmount
    );
  }

  return providerAmount;
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

function isHotDeal(
  item: BillItem
): boolean {
  if (
    item.is_hot_deal === true
  ) {
    return true;
  }

  const text = [
    item.name,
    item.short_name,
    item.description,
    item.plan_type,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /\bsme\b/.test(text);
}

function getPlanType(
  item: BillItem
): string {
  if (
    cleanString(
      item.plan_type
    )
  ) {
    return cleanString(
      item.plan_type
    );
  }

  return isHotDeal(item)
    ? "SME"
    : "REGULAR";
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
  // PAYMENT PIN
  // ==========================================================

  const [showPinPrompt, setShowPinPrompt] =
    useState(false);

  const [paymentPin, setPaymentPin] =
    useState("");

  const [verifyingPin, setVerifyingPin] =
    useState(false);

  // ==========================================================
  // PROVIDER
  // ==========================================================

  const [selectedProviderId, setSelectedProviderId] =
    useState(PROVIDER_FLUTTERWAVE);

  const [availableProviders, setAvailableProviders] =
    useState<string[]>([
      PROVIDER_FLUTTERWAVE,
    ]);

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

  const isInternet =
    serviceType === "internet";

  // ==========================================================
  // SELECTED PROVIDER
  // ==========================================================

  const isSelectedClubKonnect =
    selectedProviderId ===
    PROVIDER_CLUBKONNECT;

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
  // PROVIDER DISPLAY NAME
  // ==========================================================

  const providerDisplayName =
    isSelectedClubKonnect
      ? "ClubKonnect"
      : "Flutterwave";

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

    setSelectedProviderId(
      serviceType === "internet"
        ? PROVIDER_FLUTTERWAVE
        : PROVIDER_FLUTTERWAVE
    );

    setAvailableProviders([
      PROVIDER_FLUTTERWAVE,
    ]);

    setError("");

    setCustomAmountMode(false);

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
    resetForm();
  }, [serviceType]);

  // ==========================================================
  // LOAD BILLERS
  // ==========================================================

  const loadBillers = async (
    providerId = selectedProviderId
  ) => {
    if (!category) {
      setBillers([]);
      return;
    }

    if (
      serviceType === "internet" &&
      providerId === PROVIDER_CLUBKONNECT
    ) {
      setBillers([]);
      setItems([]);
      setSelectedBillerCode("");
      setSelectedItemCode("");
      setError(
        "ClubKonnect does not currently provide Internet service through this integration."
      );
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
              provider_id: providerId,
            },
          }
        );

      if (functionError) {
        console.error(
          "Billers function error:",
          functionError
        );

        throw new Error(
          "Unable to load bill providers."
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
          data?.error ||
            data?.message ||
            "Unable to load bill providers."
        );
      }

      const loadedBillers =
        Array.isArray(data?.billers)
          ? data.billers
          : [];

      const normalizedBillers =
        loadedBillers.map(
          (biller: Biller) => ({
            ...biller,
            provider_id:
              cleanString(
                biller.provider_id ??
                  providerId
              ).toLowerCase(),
          })
        );

      setBillers(
        normalizedBillers
      );

      if (
        normalizedBillers.length === 0
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
        err?.message ===
          "No providers are currently available for this service."
          ? err.message
          : "Unable to load bill providers.";

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

    const initialProvider =
      serviceType === "internet"
        ? PROVIDER_FLUTTERWAVE
        : PROVIDER_FLUTTERWAVE;

    setSelectedProviderId(
      initialProvider
    );

    loadBillers(
      initialProvider
    );
  }, [category]);

  // ==========================================================
  // PROVIDER OPTIONS
  // ==========================================================

  useEffect(() => {
    if (serviceType === "internet") {
      setAvailableProviders([
        PROVIDER_FLUTTERWAVE,
      ]);

      setSelectedProviderId(
        PROVIDER_FLUTTERWAVE
      );

      return;
    }

    if (
      serviceType === "airtime" ||
      serviceType === "data" ||
      serviceType === "electricity" ||
      serviceType === "cable"
    ) {
      setAvailableProviders([
        PROVIDER_FLUTTERWAVE,
        PROVIDER_CLUBKONNECT,
      ]);

      return;
    }

    setAvailableProviders([
      PROVIDER_FLUTTERWAVE,
    ]);
  }, [serviceType]);

  // ==========================================================
  // PROVIDER CHANGE
  // ==========================================================

  const handleProviderChange = async (
    providerId: string
  ) => {
    if (
      processingPayment ||
      verifyingPin
    ) {
      return;
    }

    const normalized =
      cleanString(
        providerId
      ).toLowerCase();

    setSelectedProviderId(
      normalized
    );

    setSelectedBillerCode("");
    setSelectedItemCode("");
    setItems([]);
    setAmount("");
    setCustomAmountMode(false);
    setError("");

    await loadBillers(
      normalized
    );
  };

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
              provider_id:
                selectedProviderId,
            },
          }
        );

      if (functionError) {
        console.error(
          "Bill items function error:",
          functionError
        );

        throw new Error(
          "Unable to load bill packages."
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
          data?.error ||
            data?.message ||
            "Unable to load bill packages."
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

            provider_id:
              cleanString(
                item.provider_id ??
                  selectedProviderId
              ).toLowerCase(),

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
                ? "SME"
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
          "No packages are currently available for this provider."
        );
      }
    } catch (err: any) {
      console.error(
        "Failed to load bill items:",
        err
      );

      const message =
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
      verifyingPin
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

    const itemProviderId =
      getItemProviderId(
        item
      );

    const sellingPrice =
      getDataSellingPrice(
        item,
        itemProviderId
      );

    setSelectedItemCode(
      code
    );

    setAmount(
      String(
        sellingPrice
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
      verifyingPin
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
      verifyingPin
    ) {
      return;
    }

    const sellingPrice =
      isSelectedClubKonnect
        ? getClubKonnectSellingPrice(
            value
          )
        : value;

    setAmount(
      String(
        sellingPrice
      )
    );

    setCustomAmountMode(false);
    setError("");
  };

  const handleCustomAmount = () => {
    if (
      processingPayment ||
      verifyingPin
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

  const selectedItemProviderId =
    getItemProviderId(
      selectedItem
    );

  const dataSellingAmount =
    isData &&
    selectedItem
      ? getDataSellingPrice(
          selectedItem,
          selectedItemProviderId
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
        serviceType === "airtime" ||
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
            "Select a provider",
          description:
            "Please select a bill provider.",
          variant:
            "destructive",
        });

        return false;
      }

      if (!selectedItemCode) {
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
          providerItemAmount <=
          0
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

      if (
        !isData &&
        isSelectedClubKonnect
      ) {
        const expectedSellingPrice =
          getNonDataSellingPrice(
            providerItemAmount > 0
              ? providerItemAmount
              : amountNumber,
            PROVIDER_CLUBKONNECT
          );

        if (
          providerItemAmount > 0 &&
          Math.abs(
            amountNumber -
              expectedSellingPrice
          ) > 0.01
        ) {
          toast({
            title:
              "Invalid service price",
            description:
              `This service costs ${formatNaira(
                expectedSellingPrice
              )}.`,
            variant:
              "destructive",
          });

          return false;
        }
      }

      if (
        !isData &&
        !isSelectedClubKonnect &&
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
        !isSelectedClubKonnect &&
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

      const providerAmount =
        isData
          ? providerItemAmount
          : isSelectedClubKonnect &&
              providerItemAmount > 0
            ? providerItemAmount
            : amountNumber;

      return {
        customer:
          finalCustomer,

        biller_code:
          selectedBillerCode,

        item_code:
          selectedItemCode,

        provider:
          selectedBiller?.name ??
          selectedBiller?.short_name ??
          providerDisplayName,

        provider_id:
          selectedProviderId,

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

        country: "NG",

        customerLabel,

        item:
          selectedItem,

        biller:
          selectedBiller,

        selling_amount:
          amountNumber,

        provider_amount:
          providerAmount,

        provider_markup_rate:
          isSelectedClubKonnect
            ? CLUBKONNECT_MARKUP_RATE
            : isData
              ? DATA_MARKUP
              : 0,

        data_markup:
          isData &&
          !isSelectedClubKonnect
            ? DATA_MARKUP
            : 0,

        clubkonnect_markup:
          isSelectedClubKonnect
            ? amountNumber -
              providerAmount
            : 0,

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
      setShowPinPrompt(true);
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
        setVerifyingPin(true);
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

            provider_id:
              details.provider_id,

            selling_amount:
              sellingAmount,

            provider_amount:
              details.provider_amount,

            data_markup:
              details.data_markup,

            clubkonnect_markup:
              details.clubkonnect_markup,

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
      } catch (err: any) {
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
  // NO SERVICE
  // ==========================================================

  if (!service) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50">
        <div className="text-center">
          <p className="text-gray-600 mb-4">
            No payment service selected.
          </p>

          <Button
            onClick={onBack}
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
                handleBack
              }
              disabled={
                processingPayment ||
                verifyingPin
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

        {/* PIN SCREEN */}

        {showPinPrompt ? (
          <div className="bg-white rounded-2xl shadow-sm border p-5 sm:p-6">

            <div className="text-center mb-6">

              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                <span className="text-2xl">
                  🔐
                </span>
              </div>

              <h2 className="text-xl font-bold text-gray-900">
                Confirm Payment
              </h2>

              <p className="text-sm text-gray-500 mt-1">
                Enter your 4-digit Payment PIN
                to confirm this payment.
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
                  {providerDisplayName}
                  {selectedBiller?.name
                    ? ` • ${selectedBiller.name}`
                    : ""}
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

              {isSelectedClubKonnect && (
                <div className="flex items-center justify-between gap-4 pt-2 border-t border-green-100">
                  <span className="text-sm text-gray-600">
                    Service markup
                  </span>

                  <span className="text-sm font-semibold text-green-700">
                    15%
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
                onChange={(
                  event
                ) => {
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
                onKeyDown={(
                  event
                ) => {
                  if (
                    event.key ===
                      "Enter" &&
                    paymentPin.length ===
                      4 &&
                    !verifyingPin
                  ) {
                    handlePinVerification();
                  }
                }}
                placeholder="••••"
                disabled={
                  verifyingPin
                }
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
                  paymentPin.length !==
                    4
                }
                className="w-full bg-green-600 hover:bg-green-700"
              >
                {verifyingPin ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Verifying PIN...
                  </>
                ) : (
                  "Confirm Payment"
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

                  setPaymentPin(
                    ""
                  );

                  setError(
                    ""
                  );

                  setShowPinPrompt(
                    false
                  );
                }}
                disabled={
                  verifyingPin
                }
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
                    Number(
                      walletBalance
                    )
                  )}
                </strong>
              </p>

            </div>

            {/* PROVIDER */}

            {availableProviders.length >
              1 && (
              <div className="space-y-2 mb-5">

                <Label>
                  Service Provider
                </Label>

                <select
                  value={
                    selectedProviderId
                  }
                  onChange={(
                    event
                  ) =>
                    handleProviderChange(
                      event.target.value
                    )
                  }
                  disabled={
                    loadingBillers ||
                    processingPayment ||
                    verifyingPin
                  }
                  className="w-full h-11 rounded-md border bg-background px-3 text-sm"
                >

                  {availableProviders.map(
                    (
                      provider
                    ) => (
                      <option
                        key={
                          provider
                        }
                        value={
                          provider
                        }
                      >
                        {provider ===
                        PROVIDER_CLUBKONNECT
                          ? "ClubKonnect"
                          : "Flutterwave"}
                      </option>
                    )
                  )}

                </select>

                {isSelectedClubKonnect && (
                  <div className="rounded-lg bg-orange-50 border border-orange-100 p-3">
                    <p className="text-xs text-orange-700">
                      ClubKonnect services are
                      priced with a 15% service
                      markup.
                    </p>
                  </div>
                )}

              </div>
            )}

            {/* LOADING BILLERS */}

            {loadingBillers && (
              <div className="flex items-center justify-center gap-2 py-4 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading providers...
              </div>
            )}

            {/* BILLER / NETWORK */}

            <div className="space-y-2 mb-5">

              <div className="flex items-center justify-between">

                <Label>
                  {isAirtime ||
                  isData
                    ? "Network"
                    : "Provider"}
                </Label>

                {!loadingBillers &&
                  !processingPayment &&
                  !verifyingPin && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        loadBillers(
                          selectedProviderId
                        )
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
                onChange={(
                  event
                ) =>
                  handleBillerChange(
                    event.target.value
                  )
                }
                disabled={
                  loadingBillers ||
                  processingPayment ||
                  verifyingPin ||
                  billers.length ===
                    0
                }
                className="w-full h-11 rounded-md border bg-background px-3 text-sm"
              >

                <option value="">
                  {loadingBillers
                    ? "Loading..."
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
                    Select a network to view
                    data plans.
                  </div>
                )}

                {selectedBillerCode &&
                  !loadingItems &&
                  items.length ===
                    0 && (
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

                              if (
                                !code
                              ) {
                                return null;
                              }

                              const itemProviderId =
                                getItemProviderId(
                                  item
                                );

                              const providerPrice =
                                getItemProviderPrice(
                                  item
                                );

                              const sellingPrice =
                                getDataSellingPrice(
                                  item,
                                  itemProviderId
                                );

                              const selected =
                                selectedItemCode ===
                                code;

                              const hotDeal =
                                isHotDeal(
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
                                    "relative text-left rounded-xl border p-3 transition-all",
                                    "hover:border-green-500 hover:bg-green-50",
                                    selected
                                      ? "border-green-600 bg-green-50 ring-1 ring-green-600"
                                      : "border-gray-200 bg-white",
                                  ].join(
                                    " "
                                  )}
                                >

                                  {hotDeal && (
                                    <span className="absolute -top-2 -right-2 inline-flex items-center gap-1 rounded-full bg-orange-500 text-white px-2 py-1 text-[10px] font-bold shadow-sm">
                                      <Flame className="h-3 w-3" />
                                      HOT DEAL
                                    </span>
                                  )}

                                  <p className="text-sm font-medium text-gray-900 line-clamp-2">
                                    {item.name ??
                                      item.short_name ??
                                      "Data Plan"}
                                  </p>

                                  {item.plan_type && (
                                    <p className="text-[10px] text-gray-500 mt-1 uppercase">
                                      {item.plan_type}
                                    </p>
                                  )}

                                  <p className="text-base font-bold text-green-700 mt-2">
                                    {formatNaira(
                                      sellingPrice
                                    )}
                                  </p>

                                  {isSelectedClubKonnect && (
                                    <p className="text-[10px] text-gray-400 mt-1">
                                      Includes 15% service markup
                                    </p>
                                  )}

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
                  onChange={(
                    event
                  ) =>
                    handleItemChange(
                      event.target.value
                    )
                  }
                  disabled={
                    loadingItems ||
                    processingPayment ||
                    verifyingPin ||
                    !selectedBillerCode ||
                    items.length ===
                      0
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
                value={
                  customer
                }
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

                  {isSelectedClubKonnect && (
                    <div className="flex items-center justify-between mt-2">

                      <span className="text-sm text-gray-600">
                        Markup
                      </span>

                      <span className="text-sm font-semibold text-green-700">
                        15%
                      </span>

                    </div>
                  )}

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
                  ).map(
                    (value) => {
                      const displayAmount =
                        isSelectedClubKonnect
                          ? getClubKonnectSellingPrice(
                              value
                            )
                          : value;

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
                            "rounded-xl border p-3 text-center font-semibold transition-all",
                            "hover:border-green-500 hover:bg-green-50",
                            amount ===
                            String(
                              displayAmount
                            )
                              ? "border-green-600 bg-green-50 text-green-700 ring-1 ring-green-600"
                              : "border-gray-200",
                          ].join(
                            " "
                          )}
                        >
                          {formatNaira(
                            displayAmount
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

                {isSelectedClubKonnect && (
                  <p className="text-xs text-gray-500">
                    ClubKonnect services include a
                    15% service markup.
                  </p>
                )}

                {customAmountMode && (
                  <Input
                    id="billAmount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={
                      amount
                    }
                    onChange={(
                      event
                    ) =>
                      setAmount(
                        event.target.value
                      )
                    }
                    placeholder={
                      isSelectedClubKonnect
                        ? "Enter selling amount"
                        : "Enter exact amount"
                    }
                    disabled={
                      processingPayment ||
                      verifyingPin
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
