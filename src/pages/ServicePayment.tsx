import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Clock3,
  History,
  Loader2,
  LockKeyhole,
  Phone,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Tv,
  Zap,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { Input } from "@/components/ui/input";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { Label } from "@/components/ui/label";

import { toast } from "sonner";

/* -------------------------------------------------------------------------- */
/* TYPES                                                                      */
/* -------------------------------------------------------------------------- */

interface Service {
  title: string;
  type: string;
}

interface ServicePaymentProps {
  service: Service | null;

  /*
   * Kept for compatibility with Dashboard.
   * The wallet balance is deliberately NOT displayed in this UI.
   */
  walletBalance: number;

  onBack: () => void;

  onPurchase: (
    amount: number,
    details: Record<string, any>
  ) => Promise<void>;

  onHistory?: () => void;
}

interface CatalogueNetwork {
  code: string;
  name: string;
  id?: string;
  network_code?: string;
  biller_code?: string;
  value?: string;
  label?: string;
  [key: string]: any;
}

interface CatalogueItem {
  code: string;
  name: string;

  provider_price?: number;
  price?: number;
  amount?: number;
  selling_price?: number;

  value?: number | string;
  quantity?: number;

  network_code?: string;
  biller_code?: string;
  code2?: string;

  category?: string;
  tab?: string;
  validity?: string;

  [key: string]: any;
}

interface CatalogueResponse {
  success?: boolean;
  service?: string;
  message?: string;
  error?: string;

  networks?: CatalogueNetwork[];
  billers?: CatalogueNetwork[];

  plans?: CatalogueItem[];
  items?: CatalogueItem[];

  markup?: number;

  [key: string]: any;
}

interface VerificationResponse {
  success?: boolean;
  message?: string;
  error?: string;

  customer_name?: string;
  customerName?: string;

  [key: string]: any;
}

/* -------------------------------------------------------------------------- */
/* CONSTANTS                                                                  */
/* -------------------------------------------------------------------------- */

const COMING_SOON_SERVICES = new Set([
  "internet",
  "insurance",
  "savings",
]);

const SERVICE_LABELS: Record<string, string> = {
  airtime: "Airtime",
  data: "Data",
  electricity: "Electricity",
  cable: "Cable TV",
  "airtime-card": "Airtime E-Pin",
  "data-card": "Data E-Pin",
  smile: "Smile",
  waec: "WAEC",
  jamb: "JAMB",
  internet: "Internet Bills",
  insurance: "Insurance",
  savings: "Savings",
};

const DATA_TABS = [
  "HOT",
  "Extra Night",
  "Daily",
  "Weekly",
  "Monthly",
] as const;

type DataTab = (typeof DATA_TABS)[number];

/* -------------------------------------------------------------------------- */
/* HELPERS                                                                    */
/* -------------------------------------------------------------------------- */

function normalizeServiceType(type?: string): string {
  const value = String(type || "")
    .trim()
    .toLowerCase();

  const aliases: Record<string, string> = {
    airtime: "airtime",
    voice: "airtime",

    data: "data",
    databundle: "data",
    "data-bundle": "data",

    electricity: "electricity",
    electric: "electricity",
    power: "electricity",

    cable: "cable",
    cabletv: "cable",
    "cable-tv": "cable",
    tv: "cable",

    "airtime-card": "airtime-card",
    airtimecard: "airtime-card",
    "airtime-epin": "airtime-card",
    epin: "airtime-card",

    "data-card": "data-card",
    datacard: "data-card",
    "data-epin": "data-card",

    smile: "smile",
    "smile-direct": "smile",

    waec: "waec",
    "waec-epin": "waec",

    jamb: "jamb",
    "jamb-epin": "jamb",

    internet: "internet",
    insurance: "insurance",
    savings: "savings",
  };

  return aliases[value] || value;
}

function money(value: number): string {
  return `₦${Number(value || 0).toLocaleString("en-NG", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function numericValue(value: any): number {
  const number = Number(
    String(value ?? "")
      .replace(/,/g, "")
      .replace(/[₦N]/gi, "")
      .trim()
  );

  return Number.isFinite(number) ? number : 0;
}

function cleanPhone(value: string): string {
  return value.replace(/\s+/g, "").trim();
}

function getItemCode(item: CatalogueItem | null): string {
  if (!item) return "";

  return String(
    item.code ??
      item.network_code ??
      item.biller_code ??
      item.product_code ??
      item.variation_code ??
      item.plan_code ??
      ""
  ).trim();
}

function getItemName(item: CatalogueItem | null): string {
  if (!item) return "";

  return String(
    item.name ??
      item.label ??
      item.title ??
      item.plan_name ??
      item.package_name ??
      getItemCode(item)
  ).trim();
}

function getItemProviderPrice(item: CatalogueItem | null): number {
  if (!item) return 0;

  return numericValue(
    item.provider_price ??
      item.provider_amount ??
      item.price ??
      item.amount ??
      item.value ??
      0
  );
}

function getItemSellingPrice(item: CatalogueItem | null): number {
  if (!item) return 0;

  const selling = numericValue(item.selling_price);

  if (selling > 0) {
    return selling;
  }

  const provider = getItemProviderPrice(item);

  if (provider <= 0) {
    return 0;
  }

  return provider;
}

function normalizeNetwork(
  network: CatalogueNetwork,
  index: number
): CatalogueNetwork {
  const code = String(
    network.code ??
      network.network_code ??
      network.biller_code ??
      network.value ??
      network.id ??
      index
  ).trim();

  const name = String(
    network.name ??
      network.label ??
      network.network ??
      network.biller ??
      network.company ??
      code
  ).trim();

  return {
    ...network,
    code,
    name,
  };
}

function normalizeItem(
  item: CatalogueItem,
  index: number
): CatalogueItem {
  const code = getItemCode(item) || String(index);

  const name = getItemName(item) || code;

  return {
    ...item,
    code,
    name,
  };
}

function isInvalidCustomerName(name?: string): boolean {
  if (!name) return false;

  return [
    "INVALID_METERNO",
    "INVALID_SMARTCARDNO",
    "INVALID_ACCOUNTNO",
    "INVALID_PROFILEID",
  ].includes(name.trim().toUpperCase());
}

function getDataTab(item: CatalogueItem): DataTab {
  const raw = String(
    item.tab ??
      item.category ??
      item.category_name ??
      item.type ??
      item.validity ??
      ""
  ).toLowerCase();

  if (
    raw.includes("night") ||
    raw.includes("extra")
  ) {
    return "Extra Night";
  }

  if (raw.includes("daily")) {
    return "Daily";
  }

  if (raw.includes("weekly")) {
    return "Weekly";
  }

  if (
    raw.includes("monthly") ||
    raw.includes("30 day") ||
    raw.includes("30day")
  ) {
    return "Monthly";
  }

  /*
   * Important:
   * Anything that doesn't have a reliable category belongs to HOT.
   * HOT is intentionally not a subset — it represents ALL available
   * ClubKonnect data plans for the selected network.
   */
  return "HOT";
}

function isSuccessfulResponse(response: any): boolean {
  if (!response) return false;

  if (response.success === true) {
    return true;
  }

  const status = String(
    response.status ??
      response.orderstatus ??
      response.order_status ??
      ""
  ).toUpperCase();

  const code = Number(
    response.statuscode ??
      response.status_code ??
      response.code ??
      0
  );

  return (
    status === "ORDER_COMPLETED" ||
    code === 200
  );
}

/* -------------------------------------------------------------------------- */
/* COMPONENT                                                                  */
/* -------------------------------------------------------------------------- */

export default function ServicePayment({
  service,
  walletBalance: _walletBalance,
  onBack,
  onPurchase,
  onHistory,
}: ServicePaymentProps) {
  const serviceType = useMemo(
    () => normalizeServiceType(service?.type),
    [service?.type]
  );

  /* ------------------------------------------------------------------------ */
  /* STATE                                                                    */
  /* ------------------------------------------------------------------------ */

  const [loadingCatalogue, setLoadingCatalogue] =
    useState(false);

  const [catalogueError, setCatalogueError] =
    useState("");

  const [networks, setNetworks] = useState<
    CatalogueNetwork[]
  >([]);

  const [billers, setBillers] = useState<
    CatalogueNetwork[]
  >([]);

  const [items, setItems] = useState<CatalogueItem[]>(
    []
  );

  const [plans, setPlans] = useState<CatalogueItem[]>(
    []
  );

  const [selectedNetwork, setSelectedNetwork] =
    useState("");

  const [selectedBiller, setSelectedBiller] =
    useState("");

  const [selectedItemCode, setSelectedItemCode] =
    useState("");

  const [dataTab, setDataTab] =
    useState<DataTab>("HOT");

  const [phone, setPhone] = useState("");

  const [amount, setAmount] = useState("");

  const [quantity, setQuantity] = useState("1");

  const [meterType, setMeterType] = useState("");

  const [meterNumber, setMeterNumber] = useState("");

  const [smartcardNumber, setSmartcardNumber] =
    useState("");

  const [examType, setExamType] = useState("");

  const [accountId, setAccountId] = useState("");

  const [verifying, setVerifying] = useState(false);

  const [verifiedCustomer, setVerifiedCustomer] =
    useState("");

  const [verifiedType, setVerifiedType] =
    useState<"meter" | "cable" | "none">("none");

  const [purchaseLoading, setPurchaseLoading] =
    useState(false);

  const [showPinModal, setShowPinModal] =
    useState(false);

  const [paymentPin, setPaymentPin] = useState("");

  const [pinLoading, setPinLoading] =
    useState(false);

  const [recipientPhone, setRecipientPhone] =
    useState("");

  /* ------------------------------------------------------------------------ */
  /* SERVICE FLAGS                                                            */
  /* ------------------------------------------------------------------------ */

  const isAirtime = serviceType === "airtime";
  const isData = serviceType === "data";
  const isElectricity =
    serviceType === "electricity";
  const isCable = serviceType === "cable";
  const isAirtimeCard =
    serviceType === "airtime-card";
  const isDataCard =
    serviceType === "data-card";
  const isSmile = serviceType === "smile";
  const isWAEC = serviceType === "waec";
  const isJAMB = serviceType === "jamb";

  const isComingSoon =
    COMING_SOON_SERVICES.has(serviceType);

  /* ------------------------------------------------------------------------ */
  /* SELECTED ITEM                                                            */
  /* ------------------------------------------------------------------------ */

  const selectedItem = useMemo(() => {
    const source = [...items, ...plans];

    return (
      source.find(
        (item) =>
          getItemCode(item) === selectedItemCode
      ) || null
    );
  }, [items, plans, selectedItemCode]);

  const selectedProviderPrice = useMemo(
    () => getItemProviderPrice(selectedItem),
    [selectedItem]
  );

  const selectedSellingPrice = useMemo(
    () => getItemSellingPrice(selectedItem),
    [selectedItem]
  );

  /* ------------------------------------------------------------------------ */
  /* DATA PLANS                                                               */
  /* ------------------------------------------------------------------------ */

  const allDataPlans = useMemo(() => {
    const source =
      plans.length > 0
        ? plans
        : items;

    const seen = new Set<string>();

    return source
      .map(normalizeItem)
      .filter((item) => {
        const code = getItemCode(item);

        if (!code || seen.has(code)) {
          return false;
        }

        seen.add(code);

        return true;
      });
  }, [plans, items]);

  const visibleDataPlans = useMemo(() => {
    /*
     * HOT = every available ClubKonnect plan.
     */
    if (dataTab === "HOT") {
      return allDataPlans;
    }

    return allDataPlans.filter(
      (item) => getDataTab(item) === dataTab
    );
  }, [allDataPlans, dataTab]);

  /* ------------------------------------------------------------------------ */
  /* CATALOGUE REQUEST                                                        */
  /* ------------------------------------------------------------------------ */

  const invokeCatalogue = useCallback(
    async (
      extra: Record<string, any> = {}
    ): Promise<CatalogueResponse> => {
      const { data, error } =
        await supabase.functions.invoke(
          "clubkonnect-service",
          {
            body: {
              action: "catalog",
              service: serviceType,
              ...extra,
            },
          }
        );

      if (error) {
        throw new Error(
          error.message ||
            "Unable to load service catalogue."
        );
      }

      if (!data) {
        throw new Error(
          "No catalogue response was received."
        );
      }

      if (data.success === false) {
        throw new Error(
          data.error ||
            data.message ||
            "Unable to load service catalogue."
        );
      }

      return data as CatalogueResponse;
    },
    [serviceType]
  );

  /* ------------------------------------------------------------------------ */
  /* LOAD INITIAL CATALOGUE                                                   */
  /* ------------------------------------------------------------------------ */

  const loadCatalogue = useCallback(
    async () => {
      if (!serviceType || isComingSoon) {
        return;
      }

      setLoadingCatalogue(true);
      setCatalogueError("");

      try {
        setNetworks([]);
        setBillers([]);
        setItems([]);
        setPlans([]);

        setSelectedNetwork("");
        setSelectedBiller("");
        setSelectedItemCode("");

        const response =
          await invokeCatalogue();

        const rawNetworks =
          response.networks ||
          [];

        const rawBillers =
          response.billers ||
          [];

        const rawItems =
          response.items ||
          [];

        const rawPlans =
          response.plans ||
          [];

        const normalizedNetworks =
          rawNetworks.map(normalizeNetwork);

        const normalizedBillers =
          rawBillers.map(normalizeNetwork);

        const normalizedItems =
          rawItems.map(normalizeItem);

        const normalizedPlans =
          rawPlans.map(normalizeItem);

        setNetworks(normalizedNetworks);
        setBillers(normalizedBillers);
        setItems(normalizedItems);
        setPlans(normalizedPlans);

        /*
         * Smile is a special service.
         * It does not need a customer-visible provider selection.
         */
        if (isSmile) {
          const smileNetwork =
            normalizedNetworks[0];

          if (smileNetwork) {
            setSelectedNetwork(
              smileNetwork.code
            );
          }
        }

        if (
          isElectricity &&
          normalizedBillers.length === 1
        ) {
          setSelectedBiller(
            normalizedBillers[0].code
          );
        }

        if (
          isCable &&
          normalizedBillers.length === 1
        ) {
          setSelectedBiller(
            normalizedBillers[0].code
          );
        }

        /*
         * If a service returns plans immediately,
         * don't force another request.
         */
        if (
          !isData &&
          !isCable &&
          normalizedPlans.length > 0 &&
          normalizedPlans.length === 1
        ) {
          setSelectedItemCode(
            getItemCode(normalizedPlans[0])
          );
        }
      } catch (error: any) {
        console.error(
          "ClubKonnect catalogue error:",
          error
        );

        const message =
          error?.message ||
          "Unable to load available services.";

        setCatalogueError(message);

        toast.error(message);
      } finally {
        setLoadingCatalogue(false);
      }
    },
    [
      serviceType,
      isComingSoon,
      isSmile,
      isElectricity,
      isCable,
      isData,
      invokeCatalogue,
    ]
  );

  useEffect(() => {
    void loadCatalogue();
  }, [loadCatalogue]);

  /* ------------------------------------------------------------------------ */
  /* LOAD NETWORK-SPECIFIC CATALOGUE                                          */
  /* ------------------------------------------------------------------------ */

  const loadNetworkCatalogue = useCallback(
    async (
      code: string,
      billerCode?: string
    ) => {
      if (!code || !serviceType) {
        return;
      }

      setLoadingCatalogue(true);
      setCatalogueError("");
      setSelectedItemCode("");

      try {
        const response =
          await invokeCatalogue({
            network_code: code,
            biller_code:
              billerCode || undefined,
          });

        const nextItems = (
          response.items ||
          []
        ).map(normalizeItem);

        const nextPlans = (
          response.plans ||
          []
        ).map(normalizeItem);

        setItems(nextItems);
        setPlans(nextPlans);
      } catch (error: any) {
        console.error(
          "ClubKonnect network catalogue error:",
          error
        );

        const message =
          error?.message ||
          "Unable to load packages.";

        setCatalogueError(message);

        toast.error(message);
      } finally {
        setLoadingCatalogue(false);
      }
    },
    [serviceType, invokeCatalogue]
  );

  /* ------------------------------------------------------------------------ */
  /* NETWORK CHANGE                                                           */
  /* ------------------------------------------------------------------------ */

  const handleNetworkChange = async (
    value: string
  ) => {
    setSelectedNetwork(value);
    setSelectedItemCode("");

    setAmount("");

    setVerifiedCustomer("");
    setVerifiedType("none");

    const network =
      networks.find(
        (item) => item.code === value
      );

    await loadNetworkCatalogue(
      value,
      network?.biller_code ||
        selectedBiller ||
        undefined
    );
  };

  /* ------------------------------------------------------------------------ */
  /* BILLER CHANGE                                                            */
  /* ------------------------------------------------------------------------ */

  const handleBillerChange = async (
    value: string
  ) => {
    setSelectedBiller(value);
    setSelectedItemCode("");

    setAmount("");

    setVerifiedCustomer("");
    setVerifiedType("none");

    await loadNetworkCatalogue(
      value,
      value
    );
  };

  /* ------------------------------------------------------------------------ */
  /* ITEM CHANGE                                                              */
  /* ------------------------------------------------------------------------ */

  const handleItemChange = (
    value: string
  ) => {
    setSelectedItemCode(value);

    setVerifiedCustomer("");
    setVerifiedType("none");

    const source =
      serviceType === "data"
        ? allDataPlans
        : [...items, ...plans];

    const item =
      source.find(
        (entry) =>
          getItemCode(entry) === value
      ) || null;

    /*
     * Fixed-price services must use the catalogue
     * price. The customer cannot type a different
     * provider amount.
     */
    if (
      item &&
      !isAirtime &&
      !isElectricity
    ) {
      const price =
        getItemSellingPrice(item);

      if (price > 0) {
        setAmount(String(price));
      }
    }
  };

  /* ------------------------------------------------------------------------ */
  /* ELECTRICITY METER VERIFICATION                                           */
  /* ------------------------------------------------------------------------ */

  const verifyMeter = async () => {
    if (!selectedBiller) {
      toast.error(
        "Please select your electricity company."
      );
      return;
    }

    if (!meterNumber.trim()) {
      toast.error(
        "Please enter your meter number."
      );
      return;
    }

    if (!meterType) {
      toast.error(
        "Please select your meter type."
      );
      return;
    }

    setVerifying(true);
    setVerifiedCustomer("");
    setVerifiedType("none");

    try {
      const { data, error } =
        await supabase.functions.invoke(
          "clubkonnect-service",
          {
            body: {
              action: "verify_meter",
              service: "electricity",
              electric_company:
                selectedBiller,
              biller_code:
                selectedBiller,
              meter_type: meterType,
              meter_number:
                meterNumber.trim(),
              meter_no:
                meterNumber.trim(),
            },
          }
        );

      if (error) {
        throw new Error(
          error.message ||
            "Meter verification failed."
        );
      }

      const response =
        data as VerificationResponse;

      if (
        response.success === false ||
        response.error
      ) {
        throw new Error(
          response.error ||
            response.message ||
            "Invalid meter number."
        );
      }

      const customerName =
        response.customer_name ||
        response.customerName ||
        "";

      if (isInvalidCustomerName(customerName)) {
        throw new Error(
          "The meter number could not be verified."
        );
      }

      setVerifiedCustomer(
        customerName || "Meter verified"
      );

      setVerifiedType("meter");

      toast.success(
        customerName
          ? `Meter verified for ${customerName}.`
          : "Meter verified successfully."
      );
    } catch (error: any) {
      console.error(
        "Meter verification error:",
        error
      );

      toast.error(
        error?.message ||
          "Unable to verify meter."
      );
    } finally {
      setVerifying(false);
    }
  };

  /* ------------------------------------------------------------------------ */
  /* CABLE SMARTCARD VERIFICATION                                             */
  /* ------------------------------------------------------------------------ */

  const verifyCable = async () => {
    if (!selectedBiller) {
      toast.error(
        "Please select your TV service."
      );
      return;
    }

    if (!smartcardNumber.trim()) {
      toast.error(
        "Please enter your SmartCard/IUC number."
      );
      return;
    }

    setVerifying(true);
    setVerifiedCustomer("");
    setVerifiedType("none");

    try {
      const { data, error } =
        await supabase.functions.invoke(
          "clubkonnect-service",
          {
            body: {
              action: "verify_cable",
              service: "cable",
              cable_tv:
                selectedBiller,
              cable_code:
                selectedBiller,
              smartcard_number:
                smartcardNumber.trim(),
              smartCardNumber:
                smartcardNumber.trim(),
            },
          }
        );

      if (error) {
        throw new Error(
          error.message ||
            "SmartCard verification failed."
        );
      }

      const response =
        data as VerificationResponse;

      if (
        response.success === false ||
        response.error
      ) {
        throw new Error(
          response.error ||
            response.message ||
            "Invalid SmartCard/IUC number."
        );
      }

      const customerName =
        response.customer_name ||
        response.customerName ||
        "";

      if (isInvalidCustomerName(customerName)) {
        throw new Error(
          "The SmartCard/IUC number could not be verified."
        );
      }

      setVerifiedCustomer(
        customerName || "SmartCard verified"
      );

      setVerifiedType("cable");

      toast.success(
        customerName
          ? `SmartCard verified for ${customerName}.`
          : "SmartCard verified successfully."
      );
    } catch (error: any) {
      console.error(
        "Cable verification error:",
        error
      );

      toast.error(
        error?.message ||
          "Unable to verify SmartCard."
      );
    } finally {
      setVerifying(false);
    }
  };

  /* ------------------------------------------------------------------------ */
  /* AMOUNT                                                                   */
  /* ------------------------------------------------------------------------ */

  const amountNumber = numericValue(amount);

  const quantityNumber = Math.max(
    1,
    Math.floor(numericValue(quantity) || 1)
  );

  const totalBeforePurchase = useMemo(() => {
    if (isAirtime) {
      return amountNumber;
    }

    if (isElectricity) {
      return amountNumber;
    }

    if (isAirtimeCard) {
      return (
        selectedProviderPrice *
        quantityNumber
      );
    }

    if (isDataCard) {
      return (
        selectedProviderPrice *
        quantityNumber
      );
    }

    if (
      isData ||
      isCable ||
      isSmile ||
      isWAEC ||
      isJAMB
    ) {
      return selectedProviderPrice;
    }

    return amountNumber;
  }, [
    isAirtime,
    isElectricity,
    isAirtimeCard,
    isDataCard,
    isData,
    isCable,
    isSmile,
    isWAEC,
    isJAMB,
    amountNumber,
    selectedProviderPrice,
    quantityNumber,
  ]);

  /*
   * The Edge Function is the final pricing authority.
   * This is only a preview for the customer.
   */
  const markupRate =
    isAirtimeCard ||
    isDataCard ||
    isSmile ||
    isWAEC ||
    isJAMB
      ? 0.2
      : 0.15;

  const estimatedTotal =
    totalBeforePurchase > 0
      ? Math.round(
          totalBeforePurchase *
            (1 + markupRate) *
            100
        ) / 100
      : 0;

  /* ------------------------------------------------------------------------ */
  /* VALIDATION                                                               */
  /* ------------------------------------------------------------------------ */

  const validatePurchase = (): string | null => {
    if (!serviceType) {
      return "Please select a service.";
    }

    if (isComingSoon) {
      return `${SERVICE_LABELS[serviceType] || "This service"} is coming soon.`;
    }

    if (isAirtime) {
      if (!selectedNetwork) {
        return "Please select a network.";
      }

      if (!cleanPhone(phone)) {
        return "Please enter the recipient phone number.";
      }

      if (
        cleanPhone(phone).length < 10
      ) {
        return "Please enter a valid Nigerian phone number.";
      }

      if (
        amountNumber < 50 ||
        amountNumber > 200000
      ) {
        return "Airtime amount must be between ₦50 and ₦200,000.";
      }
    }

    if (isData) {
      if (!selectedNetwork) {
        return "Please select a network.";
      }

      if (!selectedItemCode) {
        return "Please select a data plan.";
      }

      if (!cleanPhone(phone)) {
        return "Please enter the recipient phone number.";
      }
    }

    if (isElectricity) {
      if (!selectedBiller) {
        return "Please select your electricity company.";
      }

      if (!meterType) {
        return "Please select your meter type.";
      }

      if (!meterNumber.trim()) {
        return "Please enter your meter number.";
      }

      if (verifiedType !== "meter") {
        return "Please verify your meter before continuing.";
      }

      if (
        amountNumber <= 0
      ) {
        return "Please enter a valid electricity amount.";
      }
    }

    if (isCable) {
      if (!selectedBiller) {
        return "Please select your TV service.";
      }

      if (!selectedItemCode) {
        return "Please select a package.";
      }

      if (!smartcardNumber.trim()) {
        return "Please enter your SmartCard/IUC number.";
      }

      if (verifiedType !== "cable") {
        return "Please verify your SmartCard before continuing.";
      }
    }

    if (isAirtimeCard) {
      if (!selectedNetwork) {
        return "Please select a network.";
      }

      if (!selectedItemCode) {
        return "Please select an E-Pin value.";
      }

      if (
        quantityNumber < 1 ||
        quantityNumber > 100
      ) {
        return "Quantity must be between 1 and 100.";
      }
    }

    if (isDataCard) {
      if (!selectedNetwork) {
        return "Please select a network.";
      }

      if (!selectedItemCode) {
        return "Please select a data E-Pin plan.";
      }

      if (
        quantityNumber < 1 ||
        quantityNumber > 100
      ) {
        return "Quantity must be between 1 and 100.";
      }
    }

    if (isSmile) {
      if (!accountId.trim()) {
        return "Please enter your Smile account number.";
      }

      if (!selectedItemCode) {
        return "Please select a Smile data plan.";
      }
    }

    if (isWAEC) {
      if (!selectedItemCode) {
        return "Please select a WAEC package.";
      }

      if (!cleanPhone(phone)) {
        return "Please enter the phone number that should receive the e-PIN.";
      }
    }

    if (isJAMB) {
      if (!examType) {
        return "Please select the JAMB exam type.";
      }

      if (!cleanPhone(phone)) {
        return "Please enter the phone number that should receive the e-PIN.";
      }
    }

    return null;
  };

  /* ------------------------------------------------------------------------ */
  /* BUILD PURCHASE DETAILS                                                   */
  /* ------------------------------------------------------------------------ */

  const buildPurchaseDetails =
    (): Record<string, any> => {
      const requestId =
        `IYANJUPAY-${crypto.randomUUID()}`;

      const itemCode =
        getItemCode(selectedItem);

      const itemName =
        getItemName(selectedItem);

      const providerPrice =
        selectedProviderPrice;

      const details: Record<string, any> = {
        type: serviceType,
        service: serviceType,

        country: "NG",

        request_id: requestId,
        requestId,

        customer:
          cleanPhone(phone) ||
          accountId.trim() ||
          recipientPhone.trim(),

        customer_id:
          accountId.trim() || undefined,

        selling_amount:
          estimatedTotal,

        provider_amount:
          providerPrice,

        provider_price:
          providerPrice,

        item_code:
          itemCode || undefined,

        product_code:
          itemCode || undefined,

        variation_code:
          itemCode || undefined,

        plan_code:
          itemCode || undefined,

        package_code:
          itemCode || undefined,

        package_name:
          itemName || undefined,

        network_code:
          selectedNetwork || undefined,

        biller_code:
          selectedBiller || undefined,

        mobile_network:
          selectedNetwork || undefined,

        quantity:
          quantityNumber,

        phone:
          cleanPhone(phone) || undefined,

        phoneNumber:
          cleanPhone(phone) || undefined,

        recipient_phone:
          cleanPhone(recipientPhone) || undefined,
      };

      /* ------------------------------ Airtime ----------------------------- */

      if (isAirtime) {
        details.amount =
          amountNumber;

        details.mobile_network =
          selectedNetwork;

        details.network_code =
          selectedNetwork;

        details.phone =
          cleanPhone(phone);

        details.phoneNumber =
          cleanPhone(phone);
      }

      /* ------------------------------- Data ------------------------------- */

      if (isData) {
        details.data_plan =
          itemCode;

        details.dataPlan =
          itemCode;

        details.mobile_network =
          selectedNetwork;

        details.network_code =
          selectedNetwork;

        details.phone =
          cleanPhone(phone);

        details.phoneNumber =
          cleanPhone(phone);
      }

      /* ---------------------------- Electricity --------------------------- */

      if (isElectricity) {
        details.electric_company =
          selectedBiller;

        details.company_code =
          selectedBiller;

        details.biller_code =
          selectedBiller;

        details.meter_type =
          meterType;

        details.meter_number =
          meterNumber.trim();

        details.meter_no =
          meterNumber.trim();

        details.amount =
          amountNumber;

        details.phone =
          cleanPhone(phone) || undefined;
      }

      /* ------------------------------- Cable ------------------------------ */

      if (isCable) {
        details.cable_tv =
          selectedBiller;

        details.cable_code =
          selectedBiller;

        details.biller_code =
          selectedBiller;

        details.package =
          itemCode;

        details.package_code =
          itemCode;

        details.smartcard_number =
          smartcardNumber.trim();

        details.smartCardNumber =
          smartcardNumber.trim();

        details.phone =
          cleanPhone(phone) || undefined;

        details.amount =
          providerPrice;
      }

      /* -------------------------- Airtime E-PIN --------------------------- */

      if (isAirtimeCard) {
        details.value =
          numericValue(
            selectedItem?.value ??
              selectedProviderPrice
          );

        details.quantity =
          quantityNumber;

        details.network_code =
          selectedNetwork;

        details.mobile_network =
          selectedNetwork;

        /*
         * ClubKonnect prints the PINs; a recipient
         * phone is not required by the provider.
         */
        delete details.phone;
        delete details.phoneNumber;
      }

      /* --------------------------- Data E-PIN ----------------------------- */

      if (isDataCard) {
        details.data_plan =
          itemCode;

        details.dataPlan =
          itemCode;

        details.quantity =
          quantityNumber;

        details.network_code =
          selectedNetwork;

        details.mobile_network =
          selectedNetwork;

        delete details.phone;
        delete details.phoneNumber;
      }

      /* ------------------------------- Smile ------------------------------ */

      if (isSmile) {
        details.mobile_network =
          "smile-direct";

        details.network_code =
          "smile-direct";

        details.account_id =
          accountId.trim();

        details.mobile_number =
          accountId.trim();

        details.data_plan =
          itemCode;

        details.dataPlan =
          itemCode;
      }

      /* -------------------------------- WAEC ------------------------------ */

      if (isWAEC) {
        details.exam_type =
          itemCode;

        details.examType =
          itemCode;

        details.phone =
          cleanPhone(phone);

        details.phoneNumber =
          cleanPhone(phone);
      }

      /* -------------------------------- JAMB ------------------------------ */

      if (isJAMB) {
        details.exam_type =
          examType;

        details.examType =
          examType;

        details.phone =
          cleanPhone(phone);

        details.phoneNumber =
          cleanPhone(phone);

        /*
         * If the selected package itself represents
         * the exam type, retain it as the package too.
         */
        if (itemCode) {
          details.package_code =
            itemCode;
        }
      }

      return details;
    };

  /* ------------------------------------------------------------------------ */
  /* PIN VERIFICATION                                                         */
  /* ------------------------------------------------------------------------ */

  const verifyPaymentPin = async (): Promise<boolean> => {
    if (!paymentPin.trim()) {
      toast.error(
        "Please enter your payment PIN."
      );

      return false;
    }

    if (paymentPin.trim().length !== 4) {
      toast.error(
        "Payment PIN must be 4 digits."
      );

      return false;
    }

    setPinLoading(true);

    try {
      const { data, error } =
        await supabase.rpc(
          "verify_payment_pin",
          {
            p_pin:
              paymentPin.trim(),
          }
        );

      if (error) {
        throw new Error(
          error.message ||
            "Unable to verify payment PIN."
        );
      }

      /*
       * Different versions of the RPC may return
       * boolean or an object.
       */
      if (
        data === false ||
        data?.success === false ||
        data?.valid === false
      ) {
        throw new Error(
          "Incorrect payment PIN."
        );
      }

      return true;
    } catch (error: any) {
      console.error(
        "Payment PIN verification error:",
        error
      );

      toast.error(
        error?.message ||
          "Unable to verify payment PIN."
      );

      return false;
    } finally {
      setPinLoading(false);
    }
  };

  /* ------------------------------------------------------------------------ */
  /* PURCHASE                                                                 */
  /* ------------------------------------------------------------------------ */

  const handlePurchase = async () => {
    const validation =
      validatePurchase();

    if (validation) {
      toast.error(validation);
      return;
    }

    setShowPinModal(true);
  };

  const confirmPurchase = async () => {
    const pinValid =
      await verifyPaymentPin();

    if (!pinValid) {
      return;
    }

    setPurchaseLoading(true);

    try {
      const details =
        buildPurchaseDetails();

      /*
       * The backend calculates the authoritative
       * provider cost and selling amount again.
       */
      await onPurchase(
        amountNumber ||
          selectedProviderPrice ||
          totalBeforePurchase,
        {
          ...details,

          payment_pin:
            paymentPin.trim(),
        }
      );

      setShowPinModal(false);
      setPaymentPin("");
    } catch (error: any) {
      console.error(
        "Service purchase error:",
        error
      );

      toast.error(
        error?.message ||
          "Unable to complete this purchase."
      );
    } finally {
      setPurchaseLoading(false);
    }
  };

  /* ------------------------------------------------------------------------ */
  /* UI HELPERS                                                               */
  /* ------------------------------------------------------------------------ */

  const title =
    service?.title ||
    SERVICE_LABELS[serviceType] ||
    "Service";

  const showNetworkSelector =
    isAirtime ||
    isData ||
    isAirtimeCard ||
    isDataCard;

  const showBillerSelector =
    isCable ||
    isElectricity;

  const itemList =
    isData
      ? visibleDataPlans
      : [...items, ...plans];

  const selectedNetworkObject =
    networks.find(
      (item) =>
        item.code === selectedNetwork
    ) || null;

  const selectedBillerObject =
    billers.find(
      (item) =>
        item.code === selectedBiller
    ) || null;

  /* ------------------------------------------------------------------------ */
  /* COMING SOON VIEW                                                         */
  /* ------------------------------------------------------------------------ */

  if (isComingSoon) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50">
        <div className="mx-auto w-full max-w-2xl px-4 pb-10 pt-5">
          <div className="mb-5 flex items-center justify-between">
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              className="rounded-full"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>

            <h1 className="text-lg font-bold text-slate-900">
              {title}
            </h1>

            {onHistory ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={onHistory}
                className="rounded-full"
              >
                <History className="h-5 w-5" />
              </Button>
            ) : (
              <div className="w-10" />
            )}
          </div>

          <Card className="overflow-hidden rounded-3xl border-0 shadow-xl">
            <CardContent className="flex min-h-[430px] flex-col items-center justify-center px-7 text-center">
              <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-indigo-100">
                <Clock3 className="h-10 w-10 text-indigo-600" />
              </div>

              <h2 className="text-2xl font-bold text-slate-900">
                Coming Soon
              </h2>

              <p className="mt-3 max-w-md text-sm leading-6 text-slate-500">
                {title} is currently being prepared.
                You will be able to use this service
                directly from IyanjuPay when it becomes
                available.
              </p>

              <Button
                onClick={onBack}
                className="mt-7 rounded-xl px-7"
              >
                Go Back
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------------------ */
  /* MAIN UI                                                                  */
  /* ------------------------------------------------------------------------ */

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50">
      <div className="mx-auto w-full max-w-2xl px-4 pb-10 pt-5">
        {/* HEADER ----------------------------------------------------------- */}

        <div className="mb-5 flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="rounded-full hover:bg-white"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>

          <div className="text-center">
            <h1 className="text-lg font-bold text-slate-900">
              {title}
            </h1>

            <p className="text-xs text-slate-500">
              Fast & secure
            </p>
          </div>

          {onHistory ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={onHistory}
              className="rounded-full hover:bg-white"
            >
              <History className="h-5 w-5" />
            </Button>
          ) : (
            <div className="w-10" />
          )}
        </div>

        {/* SERVICE CARD ---------------------------------------------------- */}

        <Card className="overflow-hidden rounded-3xl border-0 shadow-xl">
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-6 text-white">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
                {isAirtime ||
                isData ||
                isAirtimeCard ||
                isDataCard ||
                isSmile ? (
                  <Smartphone className="h-6 w-6" />
                ) : isCable ? (
                  <Tv className="h-6 w-6" />
                ) : isElectricity ? (
                  <Zap className="h-6 w-6" />
                ) : (
                  <ShieldCheck className="h-6 w-6" />
                )}
              </div>

              <div>
                <h2 className="font-bold">
                  {title}
                </h2>

                <p className="text-xs text-indigo-100">
                  Complete your {title.toLowerCase()} purchase
                  securely.
                </p>
              </div>
            </div>
          </div>

          <CardContent className="space-y-5 p-5 sm:p-6">
            {/* CATALOGUE ERROR --------------------------------------------- */}

            {catalogueError && (
              <div className="rounded-2xl border border-red-100 bg-red-50 p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    <RefreshCw className="h-5 w-5 text-red-500" />
                  </div>

                  <div className="flex-1">
                    <p className="text-sm font-semibold text-red-700">
                      Unable to load available options
                    </p>

                    <p className="mt-1 text-xs leading-5 text-red-600">
                      {catalogueError}
                    </p>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        void loadCatalogue()
                      }
                      className="mt-3 rounded-xl"
                    >
                      Try Again
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* LOADING ----------------------------------------------------- */}

            {loadingCatalogue &&
              networks.length === 0 &&
              billers.length === 0 &&
              items.length === 0 &&
              plans.length === 0 && (
                <div className="flex items-center justify-center rounded-2xl border bg-slate-50 py-10">
                  <div className="text-center">
                    <Loader2 className="mx-auto h-7 w-7 animate-spin text-indigo-600" />

                    <p className="mt-3 text-sm font-medium text-slate-700">
                      Loading available options...
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                      Please wait a moment.
                    </p>
                  </div>
                </div>
              )}

            {/* NETWORK ----------------------------------------------------- */}

            {showNetworkSelector &&
              networks.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-slate-700">
                    {isAirtimeCard ||
                    isDataCard
                      ? "Network"
                      : "Network"}
                  </Label>

                  <Select
                    value={selectedNetwork}
                    onValueChange={
                      handleNetworkChange
                    }
                  >
                    <SelectTrigger className="h-12 rounded-xl">
                      <SelectValue placeholder="Select network" />
                    </SelectTrigger>

                    <SelectContent>
                      {networks.map(
                        (network) => (
                          <SelectItem
                            key={network.code}
                            value={network.code}
                          >
                            {network.name}
                          </SelectItem>
                        )
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}

            {/* CABLE / ELECTRICITY BILLER --------------------------------- */}

            {showBillerSelector &&
              billers.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-slate-700">
                    {isCable
                      ? "TV Service"
                      : "Electricity Company"}
                  </Label>

                  <Select
                    value={selectedBiller}
                    onValueChange={
                      handleBillerChange
                    }
                  >
                    <SelectTrigger className="h-12 rounded-xl">
                      <SelectValue
                        placeholder={
                          isCable
                            ? "Select TV service"
                            : "Select electricity company"
                        }
                      />
                    </SelectTrigger>

                    <SelectContent>
                      {billers.map(
                        (biller) => (
                          <SelectItem
                            key={biller.code}
                            value={biller.code}
                          >
                            {biller.name}
                          </SelectItem>
                        )
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}

            {/* SMILE SINGLE SERVICE --------------------------------------- */}

            {isSmile &&
              networks.length === 0 && (
                <div className="rounded-2xl border bg-slate-50 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100">
                      <Smartphone className="h-5 w-5 text-indigo-600" />
                    </div>

                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        Smile
                      </p>

                      <p className="text-xs text-slate-500">
                        Select your Smile data plan below.
                      </p>
                    </div>
                  </div>
                </div>
              )}

            {/* DATA TABS -------------------------------------------------- */}

            {isData && (
              <div className="space-y-3">
                <Label className="text-sm font-semibold text-slate-700">
                  Data Plans
                </Label>

                <div className="grid grid-cols-5 gap-1 rounded-2xl bg-slate-100 p-1">
                  {DATA_TABS.map(
                    (tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() =>
                          setDataTab(tab)
                        }
                        className={`rounded-xl px-1 py-2 text-[10px] font-semibold transition sm:text-xs ${
                          dataTab === tab
                            ? "bg-white text-indigo-600 shadow-sm"
                            : "text-slate-500"
                        }`}
                      >
                        {tab}
                      </button>
                    )
                  )}
                </div>

                {selectedNetwork &&
                  loadingCatalogue && (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
                    </div>
                  )}

                {!loadingCatalogue &&
                  selectedNetwork &&
                  visibleDataPlans.length ===
                    0 && (
                    <div className="rounded-2xl border border-dashed bg-slate-50 px-4 py-7 text-center">
                      <p className="text-sm font-medium text-slate-700">
                        No plans found in this category.
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        Try the HOT tab to view all available plans.
                      </p>
                    </div>
                  )}

                {visibleDataPlans.length >
                  0 && (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {visibleDataPlans.map(
                      (item) => {
                        const code =
                          getItemCode(item);

                        const price =
                          getItemSellingPrice(
                            item
                          );

                        const active =
                          selectedItemCode ===
                          code;

                        return (
                          <button
                            type="button"
                            key={code}
                            onClick={() =>
                              handleItemChange(
                                code
                              )
                            }
                            className={`rounded-2xl border p-4 text-left transition ${
                              active
                                ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-100"
                                : "border-slate-200 bg-white hover:border-indigo-200 hover:bg-slate-50"
                            }`}
                          >
                            <p className="line-clamp-2 text-sm font-semibold text-slate-900">
                              {getItemName(
                                item
                              )}
                            </p>

                            {item.validity && (
                              <p className="mt-1 text-[11px] text-slate-500">
                                {String(
                                  item.validity
                                )}
                              </p>
                            )}

                            <p className="mt-3 text-base font-bold text-indigo-600">
                              {money(price)}
                            </p>
                          </button>
                        );
                      }
                    )}
                  </div>
                )}
              </div>
            )}

            {/* GENERAL PACKAGE SELECTOR ----------------------------------- */}

            {!isData &&
              (isCable ||
                isAirtimeCard ||
                isDataCard ||
                isSmile ||
                isWAEC ||
                isJAMB) &&
              itemList.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-slate-700">
                    {isCable
                      ? "Package"
                      : isAirtimeCard
                      ? "E-Pin Value"
                      : isDataCard
                      ? "Data E-Pin Plan"
                      : isSmile
                      ? "Data Plan"
                      : isWAEC
                      ? "WAEC Package"
                      : "JAMB Package"}
                  </Label>

                  <Select
                    value={selectedItemCode}
                    onValueChange={
                      handleItemChange
                    }
                  >
                    <SelectTrigger className="h-12 rounded-xl">
                      <SelectValue
                        placeholder={
                          isCable
                            ? "Select package"
                            : "Select an option"
                        }
                      />
                    </SelectTrigger>

                    <SelectContent>
                      {itemList.map(
                        (item) => {
                          const code =
                            getItemCode(item);

                          const price =
                            getItemSellingPrice(
                              item
                            );

                          return (
                            <SelectItem
                              key={code}
                              value={code}
                            >
                              <span className="flex items-center justify-between gap-5">
                                <span>
                                  {getItemName(
                                    item
                                  )}
                                </span>

                                {price > 0 && (
                                  <span className="text-xs text-slate-500">
                                    {money(
                                      price
                                    )}
                                  </span>
                                )}
                              </span>
                            </SelectItem>
                          );
                        }
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}

            {/* AIRTIME PHONE ---------------------------------------------- */}

            {isAirtime && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700">
                  Phone Number
                </Label>

                <div className="relative">
                  <Phone className="absolute left-3 top-3.5 h-5 w-5 text-slate-400" />

                  <Input
                    value={phone}
                    onChange={(event) =>
                      setPhone(
                        event.target.value
                      )
                    }
                    inputMode="tel"
                    placeholder="08012345678"
                    className="h-12 rounded-xl pl-11"
                  />
                </div>
              </div>
            )}

            {/* DATA PHONE ------------------------------------------------- */}

            {isData && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700">
                  Phone Number
                </Label>

                <div className="relative">
                  <Phone className="absolute left-3 top-3.5 h-5 w-5 text-slate-400" />

                  <Input
                    value={phone}
                    onChange={(event) =>
                      setPhone(
                        event.target.value
                      )
                    }
                    inputMode="tel"
                    placeholder="08012345678"
                    className="h-12 rounded-xl pl-11"
                  />
                </div>
              </div>
            )}

            {/* ELECTRICITY METER ------------------------------------------ */}

            {isElectricity && (
              <>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-slate-700">
                    Meter Type
                  </Label>

                  <Select
                    value={meterType}
                    onValueChange={(value) => {
                      setMeterType(value);
                      setVerifiedCustomer("");
                      setVerifiedType("none");
                    }}
                  >
                    <SelectTrigger className="h-12 rounded-xl">
                      <SelectValue placeholder="Select meter type" />
                    </SelectTrigger>

                    <SelectContent>
                      <SelectItem value="01">
                        Prepaid
                      </SelectItem>

                      <SelectItem value="02">
                        Postpaid
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-slate-700">
                    Meter Number
                  </Label>

                  <div className="flex gap-2">
                    <Input
                      value={meterNumber}
                      onChange={(event) => {
                        setMeterNumber(
                          event.target.value
                        );

                        setVerifiedCustomer("");
                        setVerifiedType("none");
                      }}
                      inputMode="numeric"
                      placeholder="Enter meter number"
                      className="h-12 rounded-xl"
                    />

                    <Button
                      type="button"
                      variant="outline"
                      onClick={
                        verifyMeter
                      }
                      disabled={
                        verifying
                      }
                      className="h-12 rounded-xl px-4"
                    >
                      {verifying &&
                      verifiedType ===
                        "none" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Verify"
                      )}
                    </Button>
                  </div>
                </div>

                {verifiedType ===
                  "meter" &&
                  verifiedCustomer && (
                    <div className="flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />

                      <div>
                        <p className="text-sm font-semibold text-emerald-800">
                          Meter verified
                        </p>

                        <p className="text-xs text-emerald-700">
                          {verifiedCustomer}
                        </p>
                      </div>
                    </div>
                  )}

                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-slate-700">
                    Amount
                  </Label>

                  <Input
                    value={amount}
                    onChange={(event) =>
                      setAmount(
                        event.target.value.replace(
                          /[^\d]/g,
                          ""
                        )
                      )
                    }
                    inputMode="numeric"
                    placeholder="Enter amount"
                    className="h-12 rounded-xl"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-slate-700">
                    Phone Number
                    <span className="ml-1 font-normal text-slate-400">
                      (optional)
                    </span>
                  </Label>

                  <Input
                    value={phone}
                    onChange={(event) =>
                      setPhone(
                        event.target.value
                      )
                    }
                    inputMode="tel"
                    placeholder="08012345678"
                    className="h-12 rounded-xl"
                  />
                </div>
              </>
            )}

            {/* CABLE SMARTCARD -------------------------------------------- */}

            {isCable && (
              <>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-slate-700">
                    SmartCard / IUC Number
                  </Label>

                  <div className="flex gap-2">
                    <Input
                      value={smartcardNumber}
                      onChange={(event) => {
                        setSmartcardNumber(
                          event.target.value
                        );

                        setVerifiedCustomer("");
                        setVerifiedType("none");
                      }}
                      inputMode="numeric"
                      placeholder="Enter SmartCard/IUC number"
                      className="h-12 rounded-xl"
                    />

                    <Button
                      type="button"
                      variant="outline"
                      onClick={
                        verifyCable
                      }
                      disabled={
                        verifying
                      }
                      className="h-12 rounded-xl px-4"
                    >
                      {verifying ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Verify"
                      )}
                    </Button>
                  </div>
                </div>

                {verifiedType ===
                  "cable" &&
                  verifiedCustomer && (
                    <div className="flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />

                      <div>
                        <p className="text-sm font-semibold text-emerald-800">
                          SmartCard verified
                        </p>

                        <p className="text-xs text-emerald-700">
                          {verifiedCustomer}
                        </p>
                      </div>
                    </div>
                  )}

                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-slate-700">
                    Phone Number
                    <span className="ml-1 font-normal text-slate-400">
                      (optional)
                    </span>
                  </Label>

                  <Input
                    value={phone}
                    onChange={(event) =>
                      setPhone(
                        event.target.value
                      )
                    }
                    inputMode="tel"
                    placeholder="08012345678"
                    className="h-12 rounded-xl"
                  />
                </div>

                {selectedSellingPrice >
                  0 && (
                  <div className="rounded-2xl bg-indigo-50 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">
                        Package price
                      </span>

                      <span className="font-bold text-indigo-700">
                        {money(
                          selectedSellingPrice
                        )}
                      </span>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* AIRTIME AMOUNT --------------------------------------------- */}

            {isAirtime && (
              <div className="space-y-3">
                <Label className="text-sm font-semibold text-slate-700">
                  Amount
                </Label>

                <div className="grid grid-cols-3 gap-2">
                  {[
                    100,
                    200,
                    500,
                    1000,
                    2000,
                    5000,
                  ].map(
                    (value) => (
                      <button
                        type="button"
                        key={value}
                        onClick={() =>
                          setAmount(
                            String(value)
                          )
                        }
                        className={`rounded-xl border py-3 text-sm font-semibold transition ${
                          amountNumber ===
                          value
                            ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                            : "border-slate-200 bg-white text-slate-700 hover:border-indigo-200"
                        }`}
                      >
                        {money(value)}
                      </button>
                    )
                  )}
                </div>

                <Input
                  value={amount}
                  onChange={(event) =>
                    setAmount(
                      event.target.value.replace(
                        /[^\d]/g,
                        ""
                      )
                    )
                  }
                  inputMode="numeric"
                  placeholder="Or enter another amount"
                  className="h-12 rounded-xl"
                />
              </div>
            )}

            {/* E-PIN QUANTITY ------------------------------------------------ */}

            {(isAirtimeCard ||
              isDataCard) && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700">
                  Quantity
                </Label>

                <Input
                  value={quantity}
                  onChange={(event) =>
                    setQuantity(
                      event.target.value.replace(
                        /[^\d]/g,
                        ""
                      )
                    )
                  }
                  inputMode="numeric"
                  min={1}
                  max={100}
                  placeholder="1"
                  className="h-12 rounded-xl"
                />

                <p className="text-xs text-slate-500">
                  You can purchase between 1 and 100
                  pins per request.
                </p>
              </div>
            )}

            {/* SMILE ACCOUNT ------------------------------------------------ */}

            {isSmile && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700">
                  Smile Account Number
                </Label>

                <Input
                  value={accountId}
                  onChange={(event) =>
                    setAccountId(
                      event.target.value
                    )
                  }
                  inputMode="numeric"
                  placeholder="Enter Smile account number"
                  className="h-12 rounded-xl"
                />
              </div>
            )}

            {/* WAEC PHONE -------------------------------------------------- */}

            {isWAEC && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700">
                  Phone Number
                </Label>

                <Input
                  value={phone}
                  onChange={(event) =>
                    setPhone(
                      event.target.value
                    )
                  }
                  inputMode="tel"
                  placeholder="08012345678"
                  className="h-12 rounded-xl"
                />
              </div>
            )}

            {/* JAMB EXAM TYPE --------------------------------------------- */}

            {isJAMB && (
              <>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-slate-700">
                    Exam Type
                  </Label>

                  <Select
                    value={examType}
                    onValueChange={
                      setExamType
                    }
                  >
                    <SelectTrigger className="h-12 rounded-xl">
                      <SelectValue placeholder="Select exam type" />
                    </SelectTrigger>

                    <SelectContent>
                      <SelectItem value="de">
                        Direct Entry (DE)
                      </SelectItem>

                      <SelectItem value="utme-mock">
                        UTME With Mock
                      </SelectItem>

                      <SelectItem value="utme-no-mock">
                        UTME Without Mock
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-slate-700">
                    Phone Number
                  </Label>

                  <Input
                    value={phone}
                    onChange={(event) =>
                      setPhone(
                        event.target.value
                      )
                    }
                    inputMode="tel"
                    placeholder="08012345678"
                    className="h-12 rounded-xl"
                  />
                </div>
              </>
            )}

            {/* OPTIONAL RECIPIENT ---------------------------------------- */}

            {(isAirtimeCard ||
              isDataCard) && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700">
                  Recipient Phone
                  <span className="ml-1 font-normal text-slate-400">
                    (optional)
                  </span>
                </Label>

                <Input
                  value={recipientPhone}
                  onChange={(event) =>
                    setRecipientPhone(
                      event.target.value
                    )
                  }
                  inputMode="tel"
                  placeholder="08012345678"
                  className="h-12 rounded-xl"
                />

                <p className="text-xs text-slate-500">
                  This is only for your record. The
                  provider generates the E-PIN itself.
                </p>
              </div>
            )}

            {/* SUMMARY ----------------------------------------------------- */}

            {(estimatedTotal > 0 ||
              selectedSellingPrice > 0) && (
              <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">
                    Estimated total
                  </span>

                  <span className="text-xl font-bold text-indigo-700">
                    {money(
                      estimatedTotal
                    )}
                  </span>
                </div>

                <p className="mt-2 text-[11px] leading-5 text-slate-500">
                  Final pricing is calculated securely
                  by IyanjuPay on the server.
                </p>
              </div>
            )}

            {/* SECURITY NOTE ------------------------------------------------ */}

            <div className="flex items-start gap-3 rounded-2xl bg-slate-50 p-4">
              <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" />

              <div>
                <p className="text-sm font-semibold text-slate-800">
                  Secure payment
                </p>

                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Your payment PIN is verified securely
                  before the transaction is submitted.
                </p>
              </div>
            </div>

            {/* PURCHASE BUTTON ------------------------------------------- */}

            <Button
              type="button"
              onClick={handlePurchase}
              disabled={
                purchaseLoading ||
                loadingCatalogue
              }
              className="h-13 w-full rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 text-base font-bold shadow-lg hover:from-indigo-700 hover:to-purple-700"
            >
              {purchaseLoading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <ShieldCheck className="mr-2 h-5 w-5" />
                  Continue to Payment
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* PAYMENT PIN ------------------------------------------------------- */}

      <Dialog
        open={showPinModal}
        onOpenChange={(open) => {
          if (
            !purchaseLoading &&
            !pinLoading
          ) {
            setShowPinModal(open);

            if (!open) {
              setPaymentPin("");
            }
          }
        }}
      >
        <DialogContent className="max-w-sm rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-center">
              Confirm Payment
            </DialogTitle>

            <DialogDescription className="text-center">
              Enter your 4-digit payment PIN to
              authorize this transaction.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 pt-3">
            <div className="rounded-2xl bg-indigo-50 p-4 text-center">
              <p className="text-xs text-slate-500">
                Amount
              </p>

              <p className="mt-1 text-2xl font-bold text-indigo-700">
                {money(
                  estimatedTotal ||
                    totalBeforePurchase
                )}
              </p>
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="payment-pin"
                className="text-sm font-semibold"
              >
                Payment PIN
              </Label>

              <Input
                id="payment-pin"
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={paymentPin}
                onChange={(event) =>
                  setPaymentPin(
                    event.target.value.replace(
                      /\D/g,
                      ""
                    )
                  )
                }
                placeholder="••••"
                className="h-14 rounded-xl text-center text-2xl tracking-[0.5em]"
                autoComplete="off"
              />
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowPinModal(false);
                  setPaymentPin("");
                }}
                disabled={
                  purchaseLoading ||
                  pinLoading
                }
                className="h-12 flex-1 rounded-xl"
              >
                Cancel
              </Button>

              <Button
                type="button"
                onClick={
                  confirmPurchase
                }
                disabled={
                  purchaseLoading ||
                  pinLoading ||
                  paymentPin.length !== 4
                }
                className="h-12 flex-1 rounded-xl bg-indigo-600 hover:bg-indigo-700"
              >
                {purchaseLoading ||
                pinLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  "Pay Now"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
