import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  History,
  Loader2,
  RefreshCw,
  ShieldCheck,
  XCircle,
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

  /*
   * Kept for parent-component compatibility.
   *
   * Wallet authorization is handled securely by the backend.
   * This component intentionally does not display the wallet
   * balance.
   */
  walletBalance: number;

  onBack: () => void;

  onPurchase: (
    amount: number,
    details: Record<string, any>
  ) => Promise<void>;

  onHistory?: () => void;
}

interface CatalogItem {
  id?: string | number;

  code?: string;
  item_code?: string;
  product_code?: string;
  variation_code?: string;

  name?: string;
  product_name?: string;
  productname?: string;
  short_name?: string;
  description?: string;

  amount?: number | string;
  price?: number | string;
  cost?: number | string;
  value?: number | string;

  selling_price?: number | string;
  customer_price?: number | string;
  final_price?: number | string;

  minimum?: number | string;
  maximum?: number | string;

  validity?: string | number;
  duration?: string | number;

  category?: string;
  network?: string;
  network_code?: string;

  biller_code?: string;
  company_code?: string;

  meter_type?: string;
  metertype?: string;

  logo?: string | null;

  [key: string]: any;
}

interface CatalogResponse {
  success?: boolean;
  message?: string;
  error?: string;

  billers?: CatalogItem[];
  networks?: CatalogItem[];
  items?: CatalogItem[];
  plans?: CatalogItem[];

  [key: string]: any;
}

// ============================================================
// CONSTANTS
// ============================================================

const COMING_SOON_SERVICES = new Set([
  "internet",
  "insurance",
]);

const DATA_TABS = [
  "HOT",
  "Extra Night",
  "Daily",
  "Weekly",
  "Monthly",
] as const;

type DataTab = (typeof DATA_TABS)[number];

const AIRTIME_AMOUNTS = [
  50,
  100,
  200,
  500,
  1000,
  2000,
  5000,
];

const EPIN_VALUES = [
  100,
  200,
  500,
];

const DEFAULT_BILL_AMOUNTS = [
  500,
  1000,
  2000,
  5000,
  10000,
];

const SERVICE_LABELS: Record<string, string> = {
  airtime: "Airtime",
  data: "Data",
  electricity: "Electricity",
  cable: "Cable TV",
  "airtime-card": "Airtime E-PIN",
  "data-card": "Data E-PIN",
  smile: "Smile",
  waec: "WAEC",
  jamb: "JAMB",
  internet: "Internet",
  insurance: "Insurance",
};

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

function getCode(item: CatalogItem | null | undefined): string {
  if (!item) {
    return "";
  }

  return String(
    item.item_code ??
      item.product_code ??
      item.variation_code ??
      item.code ??
      item.biller_code ??
      item.company_code ??
      ""
  ).trim();
}

function getName(item: CatalogItem | null | undefined): string {
  if (!item) {
    return "";
  }

  return String(
    item.name ??
      item.product_name ??
      item.productname ??
      item.short_name ??
      item.description ??
      getCode(item)
  ).trim();
}

function getPrice(item: CatalogItem | null | undefined): number {
  if (!item) {
    return 0;
  }

  return numberValue(
    item.selling_price ??
      item.customer_price ??
      item.final_price ??
      item.amount ??
      item.price ??
      item.cost ??
      item.value
  );
}

function getProviderPrice(
  item: CatalogItem | null | undefined
): number {
  if (!item) {
    return 0;
  }

  return numberValue(
    item.amount ??
      item.price ??
      item.cost ??
      item.value
  );
}

function normalizePhone(value: string): string {
  const phone = value.replace(/\s+/g, "").trim();

  if (/^0\d{10}$/.test(phone)) {
    return `+234${phone.substring(1)}`;
  }

  if (/^\d{10}$/.test(phone)) {
    return `+234${phone}`;
  }

  if (/^234\d{10}$/.test(phone)) {
    return `+${phone}`;
  }

  if (/^\+234\d{10}$/.test(phone)) {
    return phone;
  }

  return phone;
}

function isValidNigeriaPhone(value: string): boolean {
  return /^\+234\d{10}$/.test(
    normalizePhone(value)
  );
}

function classifyDataTab(
  item: CatalogItem
): DataTab {
  const text = [
    item.name,
    item.product_name,
    item.productname,
    item.short_name,
    item.description,
    item.validity,
    item.duration,
    item.category,
  ]
    .filter(
      (value) =>
        value !== undefined &&
        value !== null &&
        String(value).trim() !== ""
    )
    .join(" ")
    .toLowerCase();

  if (
    /\bhot\b/.test(text) ||
    /\bpopular\b/.test(text) ||
    /\btrending\b/.test(text)
  ) {
    return "HOT";
  }

  if (
    /extra\s*night/.test(text) ||
    /night\s*plan/.test(text) ||
    /\bnight\b/.test(text)
  ) {
    return "Extra Night";
  }

  if (
    /\b(1|2|3)\s*(day|days)\b/.test(text) ||
    /\bdaily\b/.test(text) ||
    /\b24\s*hours?\b/.test(text)
  ) {
    return "Daily";
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
    /\b(30|31)\s*(day|days)\b/.test(text) ||
    /\bmonthly\b/.test(text) ||
    /\b1\s*month\b/.test(text) ||
    /\b2\s*months?\b/.test(text) ||
    /\b3\s*months?\b/.test(text)
  ) {
    return "Monthly";
  }

  /*
   * ClubKonnect catalogue data can have plans without an
   * explicit validity/category. Monthly is the safest
   * fallback so the plan remains visible.
   */
  return "Monthly";
}

function getCustomerLabel(
  serviceType: string
): string {
  switch (serviceType) {
    case "airtime":
    case "data":
    case "smile":
    case "waec":
    case "jamb":
      return "Phone Number";

    case "electricity":
      return "Meter Number";

    case "cable":
      return "Smart Card / Decoder Number";

    case "internet":
      return "Account Number";

    case "airtime-card":
    case "data-card":
      return "Recipient Phone Number (Optional)";

    case "insurance":
      return "Customer Information";

    default:
      return "Customer Information";
  }
}

function getCustomerPlaceholder(
  serviceType: string
): string {
  switch (serviceType) {
    case "airtime":
    case "data":
    case "smile":
    case "waec":
    case "jamb":
      return "e.g. 08012345678";

    case "electricity":
      return "Enter meter number";

    case "cable":
      return "Enter smart card number";

    case "airtime-card":
    case "data-card":
      return "Optional";

    case "internet":
      return "Enter account number";

    default:
      return "Enter customer information";
  }
}

function getCustomerInputMode(
  serviceType: string
): "numeric" | "text" {
  switch (serviceType) {
    case "airtime":
    case "data":
    case "smile":
    case "airtime-card":
    case "data-card":
    case "electricity":
    case "cable":
    case "waec":
    case "jamb":
      return "numeric";

    default:
      return "text";
  }
}

// ============================================================
// COMPONENT
// ============================================================

const ServicePayment = ({
  service,
  onBack,
  onPurchase,
  onHistory,
}: ServicePaymentProps) => {
  // ==========================================================
  // FORM
  // ==========================================================

  const [customer, setCustomer] = useState("");

  const [amount, setAmount] = useState("");

  const [customAmountMode, setCustomAmountMode] =
    useState(false);

  const [selectedNetworkCode, setSelectedNetworkCode] =
    useState("");

  const [selectedItemCode, setSelectedItemCode] =
    useState("");

  const [selectedMeterType, setSelectedMeterType] =
    useState("");

  const [quantity, setQuantity] =
    useState("1");

  const [dataTab, setDataTab] =
    useState<DataTab>("HOT");

  // ==========================================================
  // CATALOGUE
  // ==========================================================

  const [networks, setNetworks] =
    useState<CatalogItem[]>([]);

  const [items, setItems] =
    useState<CatalogItem[]>([]);

  const [catalogLoading, setCatalogLoading] =
    useState(false);

  const [itemsLoading, setItemsLoading] =
    useState(false);

  const [catalogError, setCatalogError] =
    useState("");

  // ==========================================================
  // ELECTRICITY VERIFICATION
  // ==========================================================

  const [meterName, setMeterName] =
    useState("");

  const [meterVerified, setMeterVerified] =
    useState(false);

  const [verifyingMeter, setVerifyingMeter] =
    useState(false);

  // ==========================================================
  // PAYMENT
  // ==========================================================

  const [showPinPrompt, setShowPinPrompt] =
    useState(false);

  const [paymentPin, setPaymentPin] =
    useState("");

  const [verifyingPin, setVerifyingPin] =
    useState(false);

  const [processingPayment, setProcessingPayment] =
    useState(false);

  const [error, setError] =
    useState("");

  const { toast } = useToast();

  // ==========================================================
  // SERVICE FLAGS
  // ==========================================================

  const serviceType =
    service?.type ?? "";

  const isComingSoon =
    COMING_SOON_SERVICES.has(
      serviceType
    );

  const isAirtime =
    serviceType === "airtime";

  const isData =
    serviceType === "data";

  const isElectricity =
    serviceType === "electricity";

  const isCable =
    serviceType === "cable";

  const isAirtimeCard =
    serviceType === "airtime-card";

  const isDataCard =
    serviceType === "data-card";

  const isSmile =
    serviceType === "smile";

  const isWAEC =
    serviceType === "waec";

  const isJAMB =
    serviceType === "jamb";

  /*
   * E-PIN services do not require a customer phone number
   * for the ClubKonnect purchase API.
   */
  const isEpin =
    isAirtimeCard ||
    isDataCard;

  const isPhoneService =
    isAirtime ||
    isData ||
    isSmile ||
    isWAEC ||
    isJAMB;

  const customerRequired =
    !isEpin &&
    !isComingSoon;

  const customerLabel =
    getCustomerLabel(
      serviceType
    );

  const customerPlaceholder =
    getCustomerPlaceholder(
      serviceType
    );

  // ==========================================================
  // SELECTED NETWORK
  // ==========================================================

  const selectedNetwork = useMemo(
    () =>
      networks.find(
        (item) =>
          getCode(item) ===
          selectedNetworkCode
      ) ?? null,
    [
      networks,
      selectedNetworkCode,
    ]
  );

  // ==========================================================
  // SELECTED ITEM
  // ==========================================================

  const selectedItem = useMemo(
    () =>
      items.find(
        (item) =>
          getCode(item) ===
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

  const dataGroups = useMemo(() => {
    const groups: Record<
      DataTab,
      CatalogItem[]
    > = {
      HOT: [],
      "Extra Night": [],
      Daily: [],
      Weekly: [],
      Monthly: [],
    };

    items.forEach((item) => {
      groups[
        classifyDataTab(item)
      ].push(item);
    });

    return groups;
  }, [items]);

  // ==========================================================
  // RESET
  // ==========================================================

  const resetForm = useCallback(() => {
    setCustomer("");
    setAmount("");
    setCustomAmountMode(false);

    setSelectedNetworkCode("");
    setSelectedItemCode("");
    setSelectedMeterType("");

    setQuantity("1");

    setDataTab("HOT");

    setNetworks([]);
    setItems([]);

    setCatalogLoading(false);
    setItemsLoading(false);
    setCatalogError("");

    setMeterName("");
    setMeterVerified(false);
    setVerifyingMeter(false);

    setShowPinPrompt(false);
    setPaymentPin("");

    setVerifyingPin(false);
    setProcessingPayment(false);

    setError("");
  }, []);

  // ==========================================================
  // SERVICE CHANGE
  // ==========================================================

  useEffect(() => {
    resetForm();
  }, [
    serviceType,
    resetForm,
  ]);

  // ==========================================================
  // INVOKE CLUBKONNECT SERVICE
  // ==========================================================

  const invokeService = useCallback(
    async (
      body: Record<string, any>
    ): Promise<CatalogResponse> => {
      const {
        data,
        error: functionError,
      } =
        await supabase.functions.invoke(
          "clubkonnect-service",
          {
            body,
          }
        );

      if (functionError) {
        throw new Error(
          functionError.message ||
            "Unable to communicate with the service."
        );
      }

      if (!data) {
        throw new Error(
          "No response was received from the service."
        );
      }

      if (data.success !== true) {
        throw new Error(
          data.error ||
            data.message ||
            "Unable to complete the service request."
        );
      }

      return data;
    },
    []
  );

  // ==========================================================
  // LOAD CATALOGUE
  // ==========================================================

  const loadCatalogue =
    useCallback(async () => {
      if (
        !service ||
        isComingSoon
      ) {
        return;
      }

      setCatalogLoading(true);
      setCatalogError("");

      setNetworks([]);
      setItems([]);

      setSelectedNetworkCode("");
      setSelectedItemCode("");

      setAmount("");
      setCustomAmountMode(false);

      try {
        const response =
          await invokeService({
            action: "catalog",
            service: serviceType,
          });

        const loadedNetworks =
          Array.isArray(
            response.networks
          )
            ? response.networks
            : Array.isArray(
                response.billers
              )
              ? response.billers
              : [];

        const loadedItems =
          Array.isArray(
            response.items
          )
            ? response.items
            : Array.isArray(
                response.plans
              )
              ? response.plans
              : [];

        setNetworks(
          loadedNetworks
        );

        setItems(
          loadedItems
        );

        /*
         * Some services such as electricity may have their
         * catalogue handled dynamically by the backend.
         */
        if (
          loadedNetworks.length === 0 &&
          loadedItems.length === 0 &&
          !isElectricity
        ) {
          setCatalogError(
            "No options are currently available for this service."
          );
        }
      } catch (err: any) {
        console.error(
          "ClubKonnect catalogue error:",
          err
        );

        const message =
          err?.message ||
          "Unable to load service options.";

        setCatalogError(
          message
        );

        toast({
          title:
            "Unable to load service",
          description:
            message,
          variant:
            "destructive",
        });
      } finally {
        setCatalogLoading(false);
      }
    }, [
      invokeService,
      service,
      serviceType,
      isComingSoon,
      isElectricity,
      toast,
    ]);

  // ==========================================================
  // INITIAL CATALOGUE
  // ==========================================================

  useEffect(() => {
    if (
      !service ||
      isComingSoon
    ) {
      return;
    }

    loadCatalogue();
  }, [
    service,
    serviceType,
    isComingSoon,
    loadCatalogue,
  ]);

  // ==========================================================
  // LOAD ITEMS FOR NETWORK
  // ==========================================================

  const loadItemsForNetwork =
    useCallback(
      async (
        networkCode: string
      ) => {
        const code =
          String(
            networkCode ?? ""
          ).trim();

        setSelectedNetworkCode(
          code
        );

        setSelectedItemCode("");
        setAmount("");
        setCustomAmountMode(false);

        setMeterName("");
        setMeterVerified(false);

        if (!code) {
          setItems([]);
          return;
        }

        /*
         * Airtime is amount-based and does not require a
         * package catalogue.
         */
        if (isAirtime) {
          setItems([]);
          return;
        }

        /*
         * Electricity company selection does not require
         * loading a package list here.
         */
        if (isElectricity) {
          return;
        }

        setItemsLoading(true);
        setCatalogError("");

        try {
          const response =
            await invokeService({
              action: "catalog",
              service: serviceType,
              network_code: code,
              biller_code: code,
            });

          const loadedItems =
            Array.isArray(
              response.items
            )
              ? response.items
              : Array.isArray(
                  response.plans
                )
                ? response.plans
                : [];

          if (
            loadedItems.length > 0
          ) {
            setItems(
              loadedItems
            );
          } else {
            /*
             * Do not erase an already-loaded catalogue if
             * the backend returned no filtered list.
             */
            toast({
              title:
                "No packages found",
              description:
                "No packages are currently available for this selection.",
            });
          }
        } catch (err: any) {
          console.error(
            "Service item loading error:",
            err
          );

          const message =
            err?.message ||
            "Unable to load service options.";

          setCatalogError(
            message
          );

          toast({
            title:
              "Unable to load options",
            description:
              message,
            variant:
              "destructive",
          });
        } finally {
          setItemsLoading(false);
        }
      },
      [
        invokeService,
        serviceType,
        isAirtime,
        isElectricity,
        toast,
      ]
    );

  // ==========================================================
  // NETWORK CHANGE
  // ==========================================================

  const handleNetworkChange = async (
    value: string
  ) => {
    if (
      processingPayment ||
      verifyingPin ||
      verifyingMeter
    ) {
      return;
    }

    await loadItemsForNetwork(
      value
    );
  };

  // ==========================================================
  // ITEM PRICE
  // ==========================================================

  const getSellingPriceForItem =
    useCallback(
      (
        item: CatalogItem | null
      ): number => {
        if (!item) {
          return 0;
        }

        return numberValue(
          item.selling_price ??
            item.customer_price ??
            item.final_price ??
            item.amount ??
            item.price ??
            item.cost ??
            item.value
        );
      },
      []
    );

  // ==========================================================
  // DATA PLAN
  // ==========================================================

  const handleDataPlanSelect = (
    item: CatalogItem
  ) => {
    if (
      processingPayment ||
      verifyingPin
    ) {
      return;
    }

    const code =
      getCode(item);

    if (!code) {
      toast({
        title:
          "Invalid data plan",
        description:
          "This data plan does not have a valid product code.",
        variant:
          "destructive",
      });

      return;
    }

    const sellingPrice =
      getSellingPriceForItem(
        item
      );

    if (
      sellingPrice <= 0
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
        sellingPrice
      )
    );

    setCustomAmountMode(
      false
    );

    setError("");
  };

  // ==========================================================
  // GENERIC ITEM
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

    setCustomAmountMode(
      false
    );

    setError("");

    const item =
      items.find(
        (entry) =>
          getCode(entry) ===
          value
      );

    /*
     * Fixed-price ClubKonnect products such as Smile,
     * WAEC, JAMB and Data E-PIN must automatically populate
     * the payment amount.
     */
    if (
      item
    ) {
      const price =
        getSellingPriceForItem(
          item
        );

      if (
        price > 0
      ) {
        setAmount(
          String(price)
        );
      } else {
        setAmount("");
      }
    } else {
      setAmount("");
    }
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
  // ELECTRICITY METER VERIFICATION
  // ==========================================================

  const verifyElectricityMeter =
    async () => {
      if (
        !selectedNetworkCode
      ) {
        toast({
          title:
            "Select electricity company",
          description:
            "Please select your electricity company first.",
          variant:
            "destructive",
        });

        return;
      }

      const meter =
        customer.trim();

      if (!meter) {
        toast({
          title:
            "Meter number required",
          description:
            "Enter your meter number first.",
          variant:
            "destructive",
        });

        return;
      }

      if (
        !selectedMeterType
      ) {
        toast({
          title:
            "Select meter type",
          description:
            "Please select the meter type.",
          variant:
            "destructive",
        });

        return;
      }

      try {
        setVerifyingMeter(
          true
        );

        setError("");
        setMeterName("");
        setMeterVerified(
          false
        );

        const response =
          await invokeService({
            action:
              "verify_meter",

            service:
              "electricity",

            electric_company:
              selectedNetworkCode,

            biller_code:
              selectedNetworkCode,

            meter_type:
              selectedMeterType,

            meter_number:
              meter,

            meter_no:
              meter,
          });

        const verifiedName =
          String(
            response.customer_name ??
              response.customerName ??
              response.customer ??
              ""
          ).trim();

        if (
          !verifiedName ||
          verifiedName.toUpperCase() ===
            "INVALID_METERNO"
        ) {
          throw new Error(
            "The meter number could not be verified."
          );
        }

        setMeterName(
          verifiedName
        );

        setMeterVerified(
          true
        );

        toast({
          title:
            "Meter verified",
          description:
            verifiedName,
        });
      } catch (err: any) {
        console.error(
          "Electricity meter verification error:",
          err
        );

        const message =
          err?.message ||
          "Unable to verify this meter.";

        setError(
          message
        );

        toast({
          title:
            "Meter verification failed",
          description:
            message,
          variant:
            "destructive",
        });
      } finally {
        setVerifyingMeter(
          false
        );
      }
    };

  // ==========================================================
  // AMOUNT RULES
  // ==========================================================

  const amountNumber =
    Number(amount);

  const selectedProviderPrice =
    getProviderPrice(
      selectedItem
    );

  const selectedMinimum =
    numberValue(
      selectedItem?.minimum
    );

  const selectedMaximum =
    numberValue(
      selectedItem?.maximum
    );

  const selectedSellingPrice =
    getSellingPriceForItem(
      selectedItem
    );

  const quantityNumber =
    Math.max(
      1,
      Number(quantity) || 1
    );

  // ==========================================================
  // CUSTOMER NORMALISATION
  // ==========================================================

  const finalCustomer =
    isPhoneService
      ? normalizePhone(
          customer
        )
      : customer.trim();

  // ==========================================================
  // SERVICE REQUIREMENTS
  // ==========================================================

  const requiresItem =
    isData ||
    isCable ||
    isDataCard ||
    isSmile ||
    isWAEC ||
    isJAMB;

  const requiresNetwork =
    isAirtime ||
    isData ||
    isElectricity ||
    isCable ||
    isAirtimeCard ||
    isDataCard ||
    isSmile;

  // ==========================================================
  // VALIDATION
  // ==========================================================

  const validateForm =
    (): boolean => {
      if (!service) {
        return false;
      }

      if (
        isComingSoon
      ) {
        return false;
      }

      if (
        requiresNetwork &&
        !selectedNetworkCode
      ) {
        toast({
          title:
            "Select an option",
          description:
            isAirtime ||
            isData ||
            isAirtimeCard ||
            isDataCard ||
            isSmile
              ? "Please select a network."
              : "Please select the required service option.",
          variant:
            "destructive",
        });

        return false;
      }

      if (
        requiresItem &&
        !selectedItemCode
      ) {
        toast({
          title:
            "Select a package",
          description:
            "Please select a package or service option.",
          variant:
            "destructive",
        });

        return false;
      }

      /*
       * E-PIN services do not require a customer number.
       */
      if (
        customerRequired &&
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
        !isValidNigeriaPhone(
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

      if (
        isElectricity &&
        !meterVerified
      ) {
        toast({
          title:
            "Verify meter first",
          description:
            "Please verify the meter number before continuing.",
          variant:
            "destructive",
        });

        return false;
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

      /*
       * Fixed-price services must use the catalogue price.
       */
      const fixedPriceService =
        isData ||
        isDataCard ||
        isSmile ||
        isCable ||
        isWAEC ||
        isJAMB;

      if (
        fixedPriceService &&
        selectedItem
      ) {
        if (
          selectedSellingPrice <= 0
        ) {
          toast({
            title:
              "Invalid service price",
            description:
              "The selected service option has no valid price.",
            variant:
              "destructive",
          });

          return false;
        }

        if (
          Math.abs(
            amountNumber -
              selectedSellingPrice
          ) > 0.01
        ) {
          toast({
            title:
              "Invalid service price",
            description:
              `This service costs ${formatNaira(
                selectedSellingPrice
              )}.`,
            variant:
              "destructive",
          });

          return false;
        }
      }

      if (
        !isData &&
        !fixedPriceService &&
        selectedMinimum > 0 &&
        amountNumber <
          selectedMinimum
      ) {
        toast({
          title:
            "Amount too low",
          description:
            `Minimum amount is ${formatNaira(
              selectedMinimum
            )}.`,
          variant:
            "destructive",
        });

        return false;
      }

      if (
        !isData &&
        !fixedPriceService &&
        selectedMaximum > 0 &&
        amountNumber >
          selectedMaximum
      ) {
        toast({
          title:
            "Amount too high",
          description:
            `Maximum amount is ${formatNaira(
              selectedMaximum
            )}.`,
          variant:
            "destructive",
        });

        return false;
      }

      if (
        (isAirtimeCard ||
          isDataCard) &&
        (quantityNumber < 1 ||
          quantityNumber > 100)
      ) {
        toast({
          title:
            "Invalid quantity",
          description:
            "E-PIN quantity must be between 1 and 100.",
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
      const details: Record<
        string,
        any
      > = {
        type:
          serviceType,

        service:
          serviceType,

        country:
          "NG",

        customer:
          finalCustomer,

        customer_id:
          finalCustomer,

        selling_amount:
          amountNumber,

        provider_amount:
          selectedProviderPrice,

        item_code:
          selectedItemCode,

        product_code:
          selectedItemCode,

        variation_code:
          selectedItemCode,

        network_code:
          selectedNetworkCode,

        biller_code:
          selectedNetworkCode,

        item:
          selectedItem,

        network:
          selectedNetwork,

        meter_type:
          selectedMeterType,

        meter_number:
          isElectricity
            ? finalCustomer
            : "",

        meter_no:
          isElectricity
            ? finalCustomer
            : "",

        smartcard_number:
          isCable
            ? finalCustomer
            : "",

        smartCardNumber:
          isCable
            ? finalCustomer
            : "",

        phone:
          isPhoneService
            ? finalCustomer
            : "",

        phoneNumber:
          isPhoneService
            ? finalCustomer
            : "",

        package_name:
          getName(
            selectedItem
          ),

        quantity:
          quantityNumber,
      };

      // --------------------------------------------------------
      // AIRTIME
      // --------------------------------------------------------

      if (
        isAirtime
      ) {
        details.amount =
          amountNumber;
      }

      // --------------------------------------------------------
      // AIRTIME E-PIN
      // --------------------------------------------------------

      if (
        isAirtimeCard
      ) {
        details.value =
          amountNumber;

        details.quantity =
          quantityNumber;

        details.network_code =
          selectedNetworkCode;

        details.mobile_network =
          selectedNetworkCode;
      }

      // --------------------------------------------------------
      // DATA E-PIN
      // --------------------------------------------------------

      if (
        isDataCard
      ) {
        details.data_plan =
          selectedItemCode;

        details.quantity =
          quantityNumber;

        details.network_code =
          selectedNetworkCode;

        details.mobile_network =
          selectedNetworkCode;
      }

      // --------------------------------------------------------
      // DATA
      // --------------------------------------------------------

      if (
        isData
      ) {
        details.data_plan =
          selectedItemCode;

        details.dataPlan =
          selectedItemCode;

        details.mobile_network =
          selectedNetworkCode;
      }

      // --------------------------------------------------------
      // SMILE
      // --------------------------------------------------------

      if (
        isSmile
      ) {
        /*
         * ClubKonnect uses smile-direct for the Smile
         * MobileNetwork parameter.
         */
        details.network_code =
          "smile-direct";

        details.mobile_network =
          "smile-direct";

        details.account_id =
          finalCustomer;

        details.mobile_number =
          finalCustomer;

        details.data_plan =
          selectedItemCode;
      }

      // --------------------------------------------------------
      // ELECTRICITY
      // --------------------------------------------------------

      if (
        isElectricity
      ) {
        details.electric_company =
          selectedNetworkCode;

        details.company_code =
          selectedNetworkCode;

        details.meter_type =
          selectedMeterType;

        details.meter_number =
          finalCustomer;

        details.meter_no =
          finalCustomer;

        details.amount =
          amountNumber;
      }

      // --------------------------------------------------------
      // CABLE TV
      // --------------------------------------------------------

      if (
        isCable
      ) {
        details.cable_tv =
          selectedNetworkCode;

        details.cable_code =
          selectedNetworkCode;

        details.package =
          selectedItemCode;

        details.package_code =
          selectedItemCode;

        details.smartcard_number =
          finalCustomer;

        details.smartCardNumber =
          finalCustomer;

        details.amount =
          amountNumber;
      }

      // --------------------------------------------------------
      // WAEC
      // --------------------------------------------------------

      if (
        isWAEC
      ) {
        details.exam_type =
          selectedItemCode;

        details.examType =
          selectedItemCode;

        details.phone =
          finalCustomer;

        details.phoneNumber =
          finalCustomer;
      }

      // --------------------------------------------------------
      // JAMB
      // --------------------------------------------------------

      if (
        isJAMB
      ) {
        details.exam_type =
          selectedItemCode;

        details.examType =
          selectedItemCode;

        details.phone =
          finalCustomer;

        details.phoneNumber =
          finalCustomer;
      }

      return details;
    };

  // ==========================================================
  // START PURCHASE
  // ==========================================================

  const handlePurchase =
    async () => {
      if (
        !service ||
        processingPayment ||
        verifyingPin
      ) {
        return;
      }

      if (
        !validateForm()
      ) {
        return;
      }

      setPaymentPin("");
      setError("");
      setShowPinPrompt(
        true
      );
    };

  // ==========================================================
  // PAYMENT PIN
  // ==========================================================

  const handlePinVerification =
    async () => {
      if (
        !service ||
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
          error:
            pinError,
        } =
          await supabase.rpc(
            "verify_payment_pin",
            {
              _pin:
                paymentPin,
            }
          );

        if (
          pinError
        ) {
          console.error(
            "Payment PIN verification error:",
            pinError
          );

          throw new Error(
            pinError.message ||
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

        setShowPinPrompt(
          false
        );

        setPaymentPin("");

        setProcessingPayment(
          true
        );

        console.log(
          "ClubKonnect service payment:",
          {
            service:
              serviceType,

            amount:
              amountNumber,

            network_code:
              selectedNetworkCode,

            item_code:
              selectedItemCode,

            customer:
              finalCustomer,

            quantity:
              quantityNumber,
          }
        );

        /*
         * Dashboard owns the actual service-payment
         * invocation. This keeps ServicePayment focused on
         * UI, validation and secure PIN confirmation.
         */
        await onPurchase(
          amountNumber,
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

  const handleBack =
    () => {
      if (
        processingPayment ||
        verifyingPin ||
        verifyingMeter
      ) {
        return;
      }

      resetForm();
      onBack();
    };

  // ==========================================================
  // SERVICE NOT SELECTED
  // ==========================================================

  if (!service) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50">
        <div className="text-center px-6">
          <p className="text-gray-600 mb-4">
            No payment service selected.
          </p>

          <Button
            type="button"
            onClick={onBack}
          >
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  // ==========================================================
  // COMING SOON
  // ==========================================================

  if (
    isComingSoon
  ) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50">
        <header className="bg-gradient-to-r from-purple-600 to-blue-600 text-white">
          <div className="max-w-3xl mx-auto px-4 sm:px-6">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleBack}
                  className="text-white hover:bg-white/20"
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>

                <h1 className="text-lg font-bold">
                  {service.title}
                </h1>
              </div>

              {onHistory && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onHistory}
                  className="text-white hover:bg-white/20"
                >
                  <History className="h-4 w-4 mr-1.5" />
                  History
                </Button>
              )}
            </div>
          </div>
        </header>

        <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
          <div className="bg-white rounded-2xl shadow-sm border p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-5">
              <Clock3 className="h-8 w-8 text-blue-600" />
            </div>

            <h2 className="text-xl font-bold text-gray-900">
              {service.title}
            </h2>

            <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
              This service is coming soon.
              We are working to make it
              available on IyanjuPay.
            </p>

            <Button
              type="button"
              onClick={handleBack}
              className="mt-6 bg-green-600 hover:bg-green-700"
            >
              Go Back
            </Button>
          </div>
        </main>
      </div>
    );
  }

  // ==========================================================
  // PAGE
  // ==========================================================

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50 pb-8">

      {/* =====================================================
          HEADER
      ====================================================== */}

      <header className="bg-gradient-to-r from-purple-600 to-blue-600 text-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">

            <div className="flex items-center gap-3 min-w-0">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleBack}
                disabled={
                  processingPayment ||
                  verifyingPin ||
                  verifyingMeter
                }
                className="text-white hover:bg-white/20 shrink-0"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>

              <h1 className="text-lg font-bold truncate">
                {service.title}
              </h1>
            </div>

            {onHistory && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onHistory}
                disabled={
                  processingPayment ||
                  verifyingPin
                }
                className="text-white hover:bg-white/20 shrink-0"
              >
                <History className="h-4 w-4 mr-1.5" />

                <span className="hidden sm:inline">
                  History
                </span>
              </Button>
            )}

          </div>
        </div>
      </header>

      {/* =====================================================
          CONTENT
      ====================================================== */}

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6">

        {/* ===================================================
            PIN CONFIRMATION
        ==================================================== */}

        {showPinPrompt ? (
          <div className="bg-white rounded-2xl shadow-sm border p-5 sm:p-6">

            <div className="text-center mb-6">

              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                <ShieldCheck className="h-7 w-7 text-green-600" />
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

              {selectedNetwork && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-gray-600">
                    {isElectricity ||
                    isCable
                      ? "Service"
                      : "Network"}
                  </span>

                  <span className="text-sm font-medium text-gray-900 text-right">
                    {getName(
                      selectedNetwork
                    )}
                  </span>
                </div>
              )}

              {selectedItem && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-gray-600">
                    Package
                  </span>

                  <span className="text-sm font-medium text-gray-900 text-right">
                    {getName(
                      selectedItem
                    )}
                  </span>
                </div>
              )}

              {quantityNumber > 1 && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-gray-600">
                    Quantity
                  </span>

                  <span className="text-sm font-medium text-gray-900">
                    {quantityNumber}
                  </span>
                </div>
              )}

              {customerRequired && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-gray-600">
                    {customerLabel}
                  </span>

                  <span className="text-sm font-medium text-gray-900 text-right break-all">
                    {finalCustomer}
                  </span>
                </div>
              )}

              {meterVerified &&
                meterName && (
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-gray-600">
                      Meter Name
                    </span>

                    <span className="text-sm font-semibold text-gray-900 text-right">
                      {meterName}
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

                  setPaymentPin("");
                  setError("");
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

          /* =================================================
             NORMAL SERVICE FORM
          ================================================== */

          <div className="bg-white rounded-2xl shadow-sm border p-5 sm:p-6">

            {/* =================================================
                LOADING
            ================================================== */}

            {catalogLoading && (
              <div className="flex items-center justify-center gap-2 py-3 mb-4 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading available options...
              </div>
            )}

            {/* =================================================
                NETWORK / SERVICE SELECTOR
            ================================================== */}

            {requiresNetwork && (
              <div className="space-y-2 mb-5">

                <div className="flex items-center justify-between">

                  <Label>
                    {isElectricity
                      ? "Electricity Company"
                      : isCable
                        ? "TV Service"
                        : "Network"}
                  </Label>

                  {!catalogLoading &&
                    !processingPayment &&
                    !verifyingPin &&
                    !verifyingMeter && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={
                          loadCatalogue
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
                    selectedNetworkCode
                  }
                  onChange={(event) =>
                    handleNetworkChange(
                      event.target.value
                    )
                  }
                  disabled={
                    catalogLoading ||
                    itemsLoading ||
                    processingPayment ||
                    verifyingPin ||
                    verifyingMeter ||
                    networks.length === 0
                  }
                  className="w-full h-11 rounded-md border bg-background px-3 text-sm"
                >

                  <option value="">
                    {catalogLoading
                      ? "Loading..."
                      : isElectricity
                        ? "Select electricity company"
                        : isCable
                          ? "Select TV service"
                          : "Select network"}
                  </option>

                  {networks.map(
                    (
                      network,
                      index
                    ) => {
                      const code =
                        getCode(
                          network
                        );

                      if (!code) {
                        return null;
                      }

                      return (
                        <option
                          key={`${code}-${index}`}
                          value={code}
                        >
                          {getName(
                            network
                          )}
                        </option>
                      );
                    }
                  )}

                </select>

              </div>
            )}

            {/* =================================================
                ELECTRICITY METER TYPE
            ================================================== */}

            {isElectricity && (
              <div className="space-y-2 mb-5">

                <Label>
                  Meter Type
                </Label>

                <select
                  value={
                    selectedMeterType
                  }
                  onChange={(event) => {
                    setSelectedMeterType(
                      event.target.value
                    );

                    setMeterVerified(
                      false
                    );

                    setMeterName(
                      ""
                    );
                  }}
                  disabled={
                    processingPayment ||
                    verifyingPin ||
                    verifyingMeter
                  }
                  className="w-full h-11 rounded-md border bg-background px-3 text-sm"
                >
                  <option value="">
                    Select meter type
                  </option>

                  <option value="01">
                    Prepaid
                  </option>

                  <option value="02">
                    Postpaid
                  </option>
                </select>

              </div>
            )}

            {/* =================================================
                DATA
            ================================================== */}

            {isData && (
              <div className="space-y-4 mb-5">

                <div className="flex items-center justify-between">

                  <Label>
                    Data Plan
                  </Label>

                  {itemsLoading && (
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Loading...
                    </div>
                  )}

                </div>

                {/* DATA TABS */}

                <div className="grid grid-cols-5 gap-1 rounded-xl bg-gray-100 p-1">

                  {DATA_TABS.map(
                    (tab) => (
                      <button
                        key={tab}
                        type="button"
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
                          "rounded-lg px-2 py-2 text-xs font-semibold transition-all",
                          dataTab ===
                          tab
                            ? "bg-white text-green-700 shadow-sm"
                            : "text-gray-500 hover:text-gray-900",
                        ].join(" ")}
                      >
                        {tab}
                      </button>
                    )
                  )}

                </div>

                {!selectedNetworkCode && (
                  <div className="rounded-lg border border-dashed p-5 text-center text-sm text-gray-500">
                    Select a network to view
                    available data plans.
                  </div>
                )}

                {selectedNetworkCode &&
                  !itemsLoading &&
                  items.length === 0 && (
                    <div className="rounded-lg border border-dashed p-5 text-center text-sm text-gray-500">
                      No data plans are
                      currently available.
                    </div>
                  )}

                {selectedNetworkCode &&
                  dataGroups[
                    dataTab
                  ].length === 0 &&
                  !itemsLoading &&
                  items.length > 0 && (
                    <div className="rounded-lg border border-dashed p-5 text-center text-sm text-gray-500">
                      No {dataTab.toLowerCase()} plans
                      are currently available.
                    </div>
                  )}

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">

                  {dataGroups[
                    dataTab
                  ].map(
                    (
                      item,
                      index
                    ) => {
                      const code =
                        getCode(
                          item
                        );

                      if (!code) {
                        return null;
                      }

                      const sellingPrice =
                        getSellingPriceForItem(
                          item
                        );

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
                            verifyingPin
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
                            {getName(
                              item
                            )}
                          </p>

                          {item.validity && (
                            <p className="text-xs text-gray-500 mt-1">
                              {String(
                                item.validity
                              )}
                            </p>
                          )}

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
            )}

            {/* =================================================
                GENERIC PACKAGE SELECTOR
            ================================================== */}

            {requiresItem &&
              !isData && (
                <div className="space-y-2 mb-5">

                  <div className="flex items-center justify-between">

                    <Label>
                      {isCable
                        ? "Package"
                        : isSmile
                          ? "Data Package"
                          : isDataCard
                            ? "Data E-PIN"
                            : isWAEC
                              ? "WAEC Service"
                              : isJAMB
                                ? "JAMB Service"
                                : "Service Option"}
                    </Label>

                    {itemsLoading && (
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Loading...
                      </div>
                    )}

                  </div>

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
                      itemsLoading ||
                      processingPayment ||
                      verifyingPin ||
                      (
                        requiresNetwork &&
                        !selectedNetworkCode
                      ) ||
                      items.length === 0
                    }
                    className="w-full h-11 rounded-md border bg-background px-3 text-sm"
                  >

                    <option value="">
                      {itemsLoading
                        ? "Loading..."
                        : (
                            requiresNetwork &&
                            !selectedNetworkCode
                          )
                          ? "Select option first"
                          : "Select option"}
                    </option>

                    {items.map(
                      (
                        item,
                        index
                      ) => {
                        const code =
                          getCode(
                            item
                          );

                        if (!code) {
                          return null;
                        }

                        const price =
                          getSellingPriceForItem(
                            item
                          );

                        return (
                          <option
                            key={`${code}-${index}`}
                            value={code}
                          >
                            {getName(
                              item
                            )}
                            {price > 0
                              ? ` — ${formatNaira(
                                  price
                                )}`
                              : ""}
                          </option>
                        );
                      }
                    )}

                  </select>

                </div>
              )}

            {/* =================================================
                AIRTIME / AIRTIME E-PIN AMOUNT
            ================================================== */}

            {(isAirtime ||
              isAirtimeCard) && (
              <div className="space-y-2 mb-5">

                <Label>
                  {isAirtimeCard
                    ? "E-PIN Value"
                    : "Airtime Amount"}
                </Label>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">

                  {(isAirtimeCard
                    ? EPIN_VALUES
                    : AIRTIME_AMOUNTS
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
                          processingPayment ||
                          verifyingPin
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
                        {formatNaira(
                          value
                        )}
                      </button>
                    )
                  )}

                  {isAirtime && (
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
                      ].join(" ")}
                    >
                      Enter Amount
                    </button>
                  )}

                </div>

                {customAmountMode && (
                  <Input
                    id="airtimeAmount"
                    type="number"
                    min="50"
                    max="200000"
                    step="1"
                    value={amount}
                    onChange={(event) =>
                      setAmount(
                        event.target.value
                      )
                    }
                    placeholder="Enter amount"
                    disabled={
                      processingPayment ||
                      verifyingPin
                    }
                    autoFocus
                  />
                )}

              </div>
            )}

            {/* =================================================
                E-PIN QUANTITY
            ================================================== */}

            {isEpin && (
              <div className="space-y-2 mb-5">

                <Label>
                  Quantity
                </Label>

                <Input
                  type="number"
                  min="1"
                  max="100"
                  step="1"
                  value={quantity}
                  onChange={(event) => {
                    setQuantity(
                      event.target.value
                    );
                  }}
                  disabled={
                    processingPayment ||
                    verifyingPin
                  }
                  placeholder="1"
                />

                <p className="text-xs text-gray-500">
                  Enter the number of E-PINs you want
                  to purchase. Maximum quantity is 100.
                </p>

              </div>
            )}

            {/* =================================================
                DATA E-PIN INFORMATION
            ================================================== */}

            {isDataCard && (
              <div className="rounded-xl bg-blue-50 border border-blue-100 p-4 mb-5">

                <p className="text-sm font-semibold text-gray-900">
                  Data E-PIN
                </p>

                <p className="text-xs text-gray-600 mt-1">
                  Select the network and E-PIN package.
                  The applicable price comes from the
                  service catalogue.
                </p>

              </div>
            )}

            {/* =================================================
                CUSTOMER
            ================================================== */}

            {customerRequired && (
              <div className="space-y-2 mb-5">

                <Label htmlFor="serviceCustomer">
                  {customerLabel}
                </Label>

                <Input
                  id="serviceCustomer"
                  value={customer}
                  onChange={(event) => {
                    setCustomer(
                      event.target.value
                    );

                    if (
                      isElectricity
                    ) {
                      setMeterVerified(
                        false
                      );

                      setMeterName(
                        ""
                      );
                    }
                  }}
                  placeholder={
                    customerPlaceholder
                  }
                  disabled={
                    processingPayment ||
                    verifyingPin ||
                    verifyingMeter
                  }
                  inputMode={
                    getCustomerInputMode(
                      serviceType
                    )}
                />

                {isPhoneService && (
                  <p className="text-xs text-gray-500">
                    Nigerian numbers are accepted
                    in 080..., 234... or +234...
                    format.
                  </p>
                )}

              </div>
            )}

            {/* =================================================
                E-PIN OPTIONAL RECIPIENT
            ================================================== */}

            {isEpin && (
              <div className="space-y-2 mb-5">

                <Label htmlFor="epinRecipient">
                  Recipient Phone Number (Optional)
                </Label>

                <Input
                  id="epinRecipient"
                  value={customer}
                  onChange={(event) => {
                    setCustomer(
                      event.target.value
                    );
                  }}
                  placeholder="e.g. 08012345678"
                  disabled={
                    processingPayment ||
                    verifyingPin
                  }
                  inputMode="numeric"
                />

                <p className="text-xs text-gray-500">
                  This is optional. The E-PIN will be
                  generated even if you leave this blank.
                </p>

              </div>
            )}

            {/* =================================================
                ELECTRICITY VERIFY
            ================================================== */}

            {isElectricity && (
              <div className="mb-5">

                <Button
                  type="button"
                  variant="outline"
                  onClick={
                    verifyElectricityMeter
                  }
                  disabled={
                    verifyingMeter ||
                    processingPayment ||
                    verifyingPin ||
                    !selectedNetworkCode ||
                    !selectedMeterType ||
                    !customer.trim()
                  }
                  className="w-full"
                >
                  {verifyingMeter ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Verifying Meter...
                    </>
                  ) : meterVerified ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-2 text-green-600" />
                      Meter Verified
                    </>
                  ) : (
                    "Verify Meter Number"
                  )}
                </Button>

                {meterVerified &&
                  meterName && (
                    <div className="rounded-xl bg-green-50 border border-green-100 p-4 mt-3">

                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />

                        <div>
                          <p className="text-xs text-green-700">
                            Verified Customer
                          </p>

                          <p className="font-semibold text-gray-900">
                            {meterName}
                          </p>
                        </div>
                      </div>

                    </div>
                  )}

              </div>
            )}

            {/* =================================================
                FIXED PACKAGE PRICE
            ================================================== */}

            {selectedItem &&
              (
                isData ||
                isDataCard ||
                isSmile ||
                isCable ||
                isWAEC ||
                isJAMB
              ) && (
                <div className="rounded-xl bg-green-50 border border-green-100 p-4 mb-5">

                  <div className="flex items-center justify-between gap-4">

                    <span className="text-sm text-gray-600">
                      Selected
                    </span>

                    <span className="text-sm font-medium text-right text-gray-900">
                      {getName(
                        selectedItem
                      )}
                    </span>

                  </div>

                  {selectedSellingPrice >
                    0 && (
                    <div className="flex items-center justify-between mt-2">

                      <span className="text-sm text-gray-600">
                        Amount
                      </span>

                      <span className="font-bold text-green-700">
                        {formatNaira(
                          selectedSellingPrice
                        )}
                      </span>

                    </div>
                  )}

                </div>
              )}

            {/* =================================================
                BILL / ELECTRICITY / CABLE AMOUNT
            ================================================== */}

            {(isElectricity ||
              isCable) && (
              <div className="space-y-2 mb-5">

                <Label>
                  Amount (₦)
                </Label>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">

                  {DEFAULT_BILL_AMOUNTS.map(
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
                          processingPayment ||
                          verifyingPin
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
                      processingPayment ||
                      verifyingPin
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
                    min="1"
                    step="1"
                    value={amount}
                    onChange={(event) =>
                      setAmount(
                        event.target.value
                      )
                    }
                    placeholder="Enter amount"
                    disabled={
                      processingPayment ||
                      verifyingPin
                    }
                    autoFocus
                  />
                )}

                {(
                  selectedMinimum >
                    0 ||
                  selectedMaximum >
                    0
                ) && (
                  <p className="text-xs text-gray-500">

                    {selectedMinimum >
                    0
                      ? `Minimum: ${formatNaira(
                          selectedMinimum
                        )}`
                      : ""}

                    {selectedMinimum >
                      0 &&
                    selectedMaximum >
                      0
                      ? " • "
                      : ""}

                    {selectedMaximum >
                    0
                      ? `Maximum: ${formatNaira(
                          selectedMaximum
                        )}`
                      : ""}

                  </p>
                )}

              </div>
            )}

            {/* =================================================
                WAEC / JAMB PRICE
            ================================================== */}

            {(isWAEC ||
              isJAMB) &&
              selectedItem && (
                <div className="rounded-xl bg-green-50 border border-green-100 p-4 mb-5">

                  <div className="flex items-center justify-between gap-4">

                    <span className="text-sm text-gray-600">
                      Amount
                    </span>

                    <span className="font-bold text-green-700">
                      {formatNaira(
                        selectedSellingPrice
                      )}
                    </span>

                  </div>

                </div>
              )}

            {/* =================================================
                ERROR
            ================================================== */}

            {(error ||
              catalogError) && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 mb-5">

                <div className="flex items-start gap-2">

                  <XCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />

                  <p className="text-sm text-red-700">
                    {error ||
                      catalogError}
                  </p>

                </div>

              </div>
            )}

            {/* =================================================
                PURCHASE BUTTON
            ================================================== */}

            <Button
              type="button"
              onClick={
                handlePurchase
              }
              disabled={
                catalogLoading ||
                itemsLoading ||
                processingPayment ||
                verifyingPin ||
                verifyingMeter ||
                (
                  customerRequired &&
                  !customer.trim()
                ) ||
                !amount ||
                (
                  requiresNetwork &&
                  !selectedNetworkCode
                ) ||
                (
                  requiresItem &&
                  !selectedItemCode
                ) ||
                (
                  isElectricity &&
                  !meterVerified
                )
              }
              className="w-full bg-green-600 hover:bg-green-700 h-11"
            >

              {processingPayment ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                `Purchase ${
                  SERVICE_LABELS[
                    serviceType
                  ] ??
                  service.title
                }`
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
