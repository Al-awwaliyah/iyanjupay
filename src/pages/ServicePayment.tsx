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
  LockKeyhole,
  Phone,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Tv,
  Wifi,
  Zap,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

import { Button } from "@/components/ui/button";

import {
  Card,
  CardContent,
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

interface Service {
  title: string;
  type: string;
}

interface ServicePaymentProps {
  service: Service | null;
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
  networkCode?: string;
  biller_code?: string;
  billerCode?: string;
  value?: string;
  label?: string;
  network?: string;
  company?: string;
  logo?: string;
  logo_url?: string;
  logoUrl?: string;
  image?: string;
  image_url?: string;
  imageUrl?: string;
  icon?: string;
  [key: string]: any;
}

interface CatalogueItem {
  code: string;
  name: string;

  provider_price?: number;
  providerPrice?: number;
  provider_amount?: number;
  providerAmount?: number;

  price?: number;
  selling_price?: number;
  sellingPrice?: number;
  salePrice?: number;

  amount?: number;
  value?: number | string;
  quantity?: number;

  network_code?: string;
  networkCode?: string;

  biller_code?: string;
  billerCode?: string;

  product_code?: string;
  productCode?: string;

  variation_code?: string;
  variationCode?: string;

  plan_code?: string;
  planCode?: string;

  code2?: string;

  category?: string;
  category_name?: string;
  categoryName?: string;

  tab?: string;
  validity?: string;

  label?: string;
  title?: string;
  plan_name?: string;
  planName?: string;
  package_name?: string;
  packageName?: string;

  [key: string]: any;
}

interface CatalogueResponse {
  success?: boolean;
  service?: string;
  message?: string;
  error?: string;

  networks?: CatalogueNetwork[];
  billers?: CatalogueNetwork[];
  providers?: CatalogueNetwork[];

  plans?: CatalogueItem[];
  items?: CatalogueItem[];

  data?: any;

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

type DataTab =
  (typeof DATA_TABS)[number];

function normalizeServiceType(
  type?: string
): string {
  const value = String(type || "")
    .trim()
    .toLowerCase();

  const aliases: Record<
    string,
    string
  > = {
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

function money(
  value: number
): string {
  return `₦${Number(value || 0).toLocaleString(
    "en-NG",
    {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }
  )}`;
}

function numericValue(
  value: any
): number {
  const number = Number(
    String(value ?? "")
      .replace(/,/g, "")
      .replace(/[₦N]/gi, "")
      .trim()
  );

  return Number.isFinite(number)
    ? number
    : 0;
}

function cleanPhone(
  value: string
): string {
  return value
    .replace(/\s+/g, "")
    .trim();
}

function toCatalogueArray(
  value: any
): any[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (
    value &&
    typeof value === "object"
  ) {
    return Object.entries(value).map(
      ([key, entry]) => {
        if (
          entry &&
          typeof entry === "object" &&
          !Array.isArray(entry)
        ) {
          return {
            ...(entry as Record<
              string,
              any
            >
          },
            code:
              (entry as any).code ??
              (entry as any)
                .networkCode ??
              (entry as any)
                .network_code ??
              key,
          };
        }

        return {
          code: key,
          name: String(entry ?? key),
        };
      }
    );
  }

  return [];
}

function getItemCode(
  item: CatalogueItem | null
): string {
  if (!item) {
    return "";
  }

  return String(
    item.code ??
      item.networkCode ??
      item.network_code ??
      item.billerCode ??
      item.biller_code ??
      item.productCode ??
      item.product_code ??
      item.variationCode ??
      item.variation_code ??
      item.planCode ??
      item.plan_code ??
      ""
  ).trim();
}

function getItemName(
  item: CatalogueItem | null
): string {
  if (!item) {
    return "";
  }

  return String(
    item.name ??
      item.label ??
      item.title ??
      item.planName ??
      item.plan_name ??
      item.packageName ??
      item.package_name ??
      getItemCode(item)
  ).trim();
}

function getItemProviderPrice(
  item: CatalogueItem | null
): number {
  if (!item) {
    return 0;
  }

  return numericValue(
    item.providerPrice ??
      item.provider_price ??
      item.providerAmount ??
      item.provider_amount ??
      item.cost ??
      item.cost_price ??
      item.costPrice ??
      item.amount ??
      item.value ??
      0
  );
}

function getItemSellingPrice(
  item: CatalogueItem | null
): number {
  if (!item) {
    return 0;
  }

  const sellingPrice =
    numericValue(
      item.price ??
        item.sellingPrice ??
        item.selling_price ??
        item.salePrice ??
        0
    );

  if (sellingPrice > 0) {
    return sellingPrice;
  }

  return getItemProviderPrice(item);
}

function normalizeNetwork(
  network: CatalogueNetwork,
  index: number
): CatalogueNetwork {
  const code = String(
    network.code ??
      network.networkCode ??
      network.network_code ??
      network.billerCode ??
      network.biller_code ??
      network.value ??
      network.id ??
      index
  ).trim();

  const name = String(
    network.name ??
      network.networkName ??
      network.network_name ??
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
  const code =
    getItemCode(item) ||
    String(index);

  const name =
    getItemName(item) ||
    code;

  return {
    ...item,
    code,
    name,
  };
}

function getNetworkLogo(
  network: CatalogueNetwork
): string {
  return String(
    network.logoUrl ??
      network.logo_url ??
      network.logo ??
      network.imageUrl ??
      network.image_url ??
      network.image ??
      network.icon ??
      ""
  ).trim();
}

function getNetworkBadgeText(
  name: string
): string {
  const value = String(name || "")
    .trim()
    .toLowerCase();

  if (value.includes("mtn")) {
    return "MTN";
  }

  if (value.includes("airtel")) {
    return "A";
  }

  if (value.includes("glo")) {
    return "GLO";
  }

  if (
    value.includes("9mobile") ||
    value.includes("9 mobile") ||
    value.includes("etisalat")
  ) {
    return "9M";
  }

  if (value.includes("smile")) {
    return "SM";
  }

  const words = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }

  return String(name || "NW")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 3)
    .toUpperCase();
}

function getNetworkAccent(
  name: string
): string {
  const value = String(name || "")
    .trim()
    .toLowerCase();

  if (value.includes("mtn")) {
    return "bg-yellow-400 text-slate-900";
  }

  if (value.includes("airtel")) {
    return "bg-red-500 text-white";
  }

  if (value.includes("glo")) {
    return "bg-green-500 text-white";
  }

  if (
    value.includes("9mobile") ||
    value.includes("9 mobile") ||
    value.includes("etisalat")
  ) {
    return "bg-green-600 text-white";
  }

  if (value.includes("smile")) {
    return "bg-blue-500 text-white";
  }

  return "bg-indigo-100 text-indigo-700";
}

function isInvalidCustomerName(
  name?: string
): boolean {
  if (!name) {
    return false;
  }

  return [
    "INVALID_METERNO",
    "INVALID_SMARTCARDNO",
    "INVALID_ACCOUNTNO",
    "INVALID_PROFILEID",
  ].includes(
    name.trim().toUpperCase()
  );
}

function getDataTab(
  item: CatalogueItem
): DataTab {
  const raw = String(
    item.tab ??
      item.category ??
      item.category_name ??
      item.categoryName ??
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

  return "HOT";
}

function extractNetworks(
  response: CatalogueResponse
): CatalogueNetwork[] {
  const source =
    response.networks ??
    response.providers ??
    response.data?.networks ??
    response.data?.providers ??
    response.data?.network ??
    [];

  return toCatalogueArray(source)
    .map((item, index) =>
      normalizeNetwork(
        item as CatalogueNetwork,
        index
      )
    )
    .filter(
      (item) =>
        Boolean(item.code)
    );
}

function extractBillers(
  response: CatalogueResponse
): CatalogueNetwork[] {
  const source =
    response.billers ??
    response.data?.billers ??
    response.data?.companies ??
    response.data?.providers ??
    [];

  return toCatalogueArray(source)
    .map((item, index) =>
      normalizeNetwork(
        item as CatalogueNetwork,
        index
      )
    )
    .filter(
      (item) =>
        Boolean(item.code)
    );
}

function extractItems(
  response: CatalogueResponse
): CatalogueItem[] {
  const source =
    response.items ??
    response.data?.items ??
    [];

  return toCatalogueArray(source)
    .map((item, index) =>
      normalizeItem(
        item as CatalogueItem,
        index
      )
    );
}

function extractPlans(
  response: CatalogueResponse
): CatalogueItem[] {
  const source =
    response.plans ??
    response.data?.plans ??
    response.data?.packages ??
    response.data?.products ??
    [];

  return toCatalogueArray(source)
    .map((item, index) =>
      normalizeItem(
        item as CatalogueItem,
        index
      )
    );
}

const ServicePayment = ({
  service,
  walletBalance: _walletBalance,
  onBack,
  onPurchase,
  onHistory,
}: ServicePaymentProps) => {
  const serviceType = useMemo(
    () =>
      normalizeServiceType(
        service?.type
      ),
    [service?.type]
  );

  const [
    loadingCatalogue,
    setLoadingCatalogue,
  ] = useState(false);

  const [
    catalogueError,
    setCatalogueError,
  ] = useState("");

  const [
    networks,
    setNetworks,
  ] = useState<
    CatalogueNetwork[]
  >([]);

  const [
    billers,
    setBillers,
  ] = useState<
    CatalogueNetwork[]
  >([]);

  const [
    items,
    setItems,
  ] = useState<
    CatalogueItem[]
  >([]);

  const [
    plans,
    setPlans,
  ] = useState<
    CatalogueItem[]
  >([]);

  const [
    selectedNetwork,
    setSelectedNetwork,
  ] = useState("");

  const [
    selectedBiller,
    setSelectedBiller,
  ] = useState("");

  const [
    selectedItemCode,
    setSelectedItemCode,
  ] = useState("");

  const [
    dataTab,
    setDataTab,
  ] = useState<DataTab>("HOT");

  const [
    phone,
    setPhone,
  ] = useState("");

  const [
    amount,
    setAmount,
  ] = useState("");

  const [
    quantity,
    setQuantity,
  ] = useState("1");

  const [
    meterType,
    setMeterType,
  ] = useState("");

  const [
    meterNumber,
    setMeterNumber,
  ] = useState("");

  const [
    smartcardNumber,
    setSmartcardNumber,
  ] = useState("");

  const [
    examType,
    setExamType,
  ] = useState("");

  const [
    accountId,
    setAccountId,
  ] = useState("");

  const [
    verifying,
    setVerifying,
  ] = useState(false);

  const [
    verifiedCustomer,
    setVerifiedCustomer,
  ] = useState("");

  const [
    verifiedType,
    setVerifiedType,
  ] = useState<
    "meter" | "cable" | "none"
  >("none");

  const [
    purchaseLoading,
    setPurchaseLoading,
  ] = useState(false);

  const [
    showPinModal,
    setShowPinModal,
  ] = useState(false);

  const [
    paymentPin,
    setPaymentPin,
  ] = useState("");

  const [
    pinLoading,
    setPinLoading,
  ] = useState(false);

  const [
    recipientPhone,
    setRecipientPhone,
  ] = useState("");

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

  const isComingSoon =
    COMING_SOON_SERVICES.has(
      serviceType
    );

  const selectedItem = useMemo(() => {
    const source = [
      ...items,
      ...plans,
    ];

    return (
      source.find(
        (item) =>
          getItemCode(item) ===
          selectedItemCode
      ) ?? null
    );
  }, [
    items,
    plans,
    selectedItemCode,
  ]);

  const selectedProviderPrice =
    useMemo(
      () =>
        getItemProviderPrice(
          selectedItem
        ),
      [selectedItem]
    );

  const selectedSellingPrice =
    useMemo(
      () =>
        getItemSellingPrice(
          selectedItem
        ),
      [selectedItem]
    );

  const allDataPlans =
    useMemo(() => {
      const source =
        plans.length > 0
          ? plans
          : items;

      const seen =
        new Set<string>();

      return source
        .map((item) =>
          normalizeItem(item, 0)
        )
        .filter((item) => {
          const code =
            getItemCode(item);

          if (
            !code ||
            seen.has(code)
          ) {
            return false;
          }

          seen.add(code);

          return true;
        });
    }, [plans, items]);

  const visibleDataPlans =
    useMemo(() => {
      if (dataTab === "HOT") {
        return allDataPlans;
      }

      return allDataPlans.filter(
        (item) =>
          getDataTab(item) ===
          dataTab
      );
    }, [
      allDataPlans,
      dataTab,
    ]);

  const itemList =
    isData
      ? visibleDataPlans
      : [
          ...items,
          ...plans,
        ];

  const amountNumber =
    numericValue(amount);

  const quantityNumber =
    Math.max(
      1,
      Math.floor(
        numericValue(quantity) ||
          1
      )
    );

  /*
   * For catalogue-based services, `price` is already the
   * customer-facing selling price returned by the backend.
   *
   * Do not apply the markup again.
   */

  const estimatedTotal =
    useMemo(() => {
      if (
        isAirtime ||
        isElectricity
      ) {
        if (
          amountNumber <= 0
        ) {
          return 0;
        }

        /*
         * Airtime and electricity amounts are entered by the
         * customer. The backend remains authoritative.
         *
         * This is only a customer-side estimate.
         */

        const markupRate =
          0.15;

        return (
          Math.round(
            amountNumber *
              (1 +
                markupRate) *
              100
          ) / 100
        );
      }

      if (
        isAirtimeCard ||
        isDataCard
      ) {
        return (
          selectedSellingPrice *
          quantityNumber
        );
      }

      return selectedSellingPrice;
    }, [
      isAirtime,
      isElectricity,
      isAirtimeCard,
      isDataCard,
      amountNumber,
      selectedSellingPrice,
      quantityNumber,
    ]);

  const invokeCatalogue =
    useCallback(
      async (
        extra: Record<
          string,
          any
        > = {}
      ): Promise<CatalogueResponse> => {
        const {
          data,
          error,
        } =
          await supabase.functions.invoke(
            "clubkonnect-services",
            {
              body: {
                action: "catalog",
                service:
                  serviceType,
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

        if (
          data.success ===
          false
        ) {
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

  const loadCatalogue =
    useCallback(
      async () => {
        if (
          !serviceType ||
          isComingSoon
        ) {
          return;
        }

        setLoadingCatalogue(
          true
        );

        setCatalogueError("");

        try {
          setNetworks([]);
          setBillers([]);
          setItems([]);
          setPlans([]);

          setSelectedNetwork(
            ""
          );

          setSelectedBiller(
            ""
          );

          setSelectedItemCode(
            ""
          );

          const response =
            await invokeCatalogue();

          const normalizedNetworks =
            extractNetworks(
              response
            );

          const normalizedBillers =
            extractBillers(
              response
            );

          const normalizedItems =
            extractItems(
              response
            );

          const normalizedPlans =
            extractPlans(
              response
            );

          setNetworks(
            normalizedNetworks
          );

          setBillers(
            normalizedBillers
          );

          setItems(
            normalizedItems
          );

          setPlans(
            normalizedPlans
          );

          /*
           * Smile does not need a customer-visible network
           * selector.
           */

          if (
            isSmile &&
            normalizedNetworks.length >
              0
          ) {
            setSelectedNetwork(
              normalizedNetworks[0]
                .code
            );
          }

          if (
            isElectricity &&
            normalizedBillers.length ===
              1
          ) {
            setSelectedBiller(
              normalizedBillers[0]
                .code
            );
          }

          if (
            isCable &&
            normalizedBillers.length ===
              1
          ) {
            setSelectedBiller(
              normalizedBillers[0]
                .code
            );
          }

          if (
            !isData &&
            !isCable &&
            normalizedPlans.length ===
              1
          ) {
            setSelectedItemCode(
              getItemCode(
                normalizedPlans[0]
              )
            );
          }
        } catch (
          error: any
        ) {
          console.error(
            "ClubKonnect catalogue error:",
            error
          );

          const message =
            error?.message ||
            "Unable to load available services.";

          setCatalogueError(
            message
          );

          toast.error(message);
        } finally {
          setLoadingCatalogue(
            false
          );
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

  const loadNetworkCatalogue =
    useCallback(
      async (
        networkCode?: string,
        billerCode?: string
      ) => {
        if (
          !serviceType
        ) {
          return;
        }

        if (
          !networkCode &&
          !billerCode
        ) {
          return;
        }

        setLoadingCatalogue(
          true
        );

        setCatalogueError("");

        setSelectedItemCode(
          ""
        );

        try {
          const payload: Record<
            string,
            any
          > = {};

          if (networkCode) {
            payload.network_code =
              networkCode;
          }

          if (billerCode) {
            payload.biller_code =
              billerCode;
          }

          const response =
            await invokeCatalogue(
              payload
            );

          const nextItems =
            extractItems(
              response
            );

          const nextPlans =
            extractPlans(
              response
            );

          setItems(
            nextItems
          );

          setPlans(
            nextPlans
          );
        } catch (
          error: any
        ) {
          console.error(
            "ClubKonnect network catalogue error:",
            error
          );

          const message =
            error?.message ||
            "Unable to load packages.";

          setCatalogueError(
            message
          );

          toast.error(message);
        } finally {
          setLoadingCatalogue(
            false
          );
        }
      },
      [
        serviceType,
        invokeCatalogue,
      ]
    );

  const handleNetworkChange =
    async (
      value: string
    ) => {
      setSelectedNetwork(
        value
      );

      setSelectedItemCode(
        ""
      );

      setAmount("");

      setVerifiedCustomer(
        ""
      );

      setVerifiedType(
        "none"
      );

      const network =
        networks.find(
          (item) =>
            item.code === value
        );

      await loadNetworkCatalogue(
        value,
        network?.billerCode ??
          network?.biller_code ??
          undefined
      );
    };

  const handleBillerChange =
    async (
      value: string
    ) => {
      setSelectedBiller(
        value
      );

      setSelectedItemCode(
        ""
      );

      setAmount("");

      setVerifiedCustomer(
        ""
      );

      setVerifiedType(
        "none"
      );

      await loadNetworkCatalogue(
        undefined,
        value
      );
    };

  const handleItemChange =
    (
      value: string
    ) => {
      setSelectedItemCode(
        value
      );

      setVerifiedCustomer(
        ""
      );

      setVerifiedType(
        "none"
      );

      const source =
        isData
          ? allDataPlans
          : [
              ...items,
              ...plans,
            ];

      const item =
        source.find(
          (entry) =>
            getItemCode(entry) ===
            value
        ) ?? null;

      if (
        item &&
        !isAirtime &&
        !isElectricity
      ) {
        const price =
          getItemSellingPrice(
            item
          );

        if (price > 0) {
          setAmount(
            String(price)
          );
        }
      }
    };

  const verifyMeter =
    async () => {
      if (
        !selectedBiller
      ) {
        toast.error(
          "Please select your electricity company."
        );

        return;
      }

      if (
        !meterNumber.trim()
      ) {
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

      setVerifiedCustomer(
        ""
      );

      setVerifiedType(
        "none"
      );

      try {
        const {
          data,
          error,
        } =
          await supabase.functions.invoke(
            "clubkonnect-services",
            {
              body: {
                action:
                  "verify_meter",

                service:
                  "electricity",

                electric_company:
                  selectedBiller,

                biller_code:
                  selectedBiller,

                meter_type:
                  meterType,

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
          response.success ===
            false ||
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

        if (
          isInvalidCustomerName(
            customerName
          )
        ) {
          throw new Error(
            "The meter number could not be verified."
          );
        }

        setVerifiedCustomer(
          customerName ||
            "Meter verified"
        );

        setVerifiedType(
          "meter"
        );

        toast.success(
          customerName
            ? `Meter verified for ${customerName}.`
            : "Meter verified successfully."
        );
      } catch (
        error: any
      ) {
        console.error(
          "Meter verification error:",
          error
        );

        toast.error(
          error?.message ||
            "Unable to verify meter."
        );
      } finally {
        setVerifying(
          false
        );
      }
    };

  const verifyCable =
    async () => {
      if (
        !selectedBiller
      ) {
        toast.error(
          "Please select your TV service."
        );

        return;
      }

      if (
        !smartcardNumber.trim()
      ) {
        toast.error(
          "Please enter your SmartCard/IUC number."
        );

        return;
      }

      setVerifying(true);

      setVerifiedCustomer(
        ""
      );

      setVerifiedType(
        "none"
      );

      try {
        const {
          data,
          error,
        } =
          await supabase.functions.invoke(
            "clubkonnect-services",
            {
              body: {
                action:
                  "verify_cable",

                service:
                  "cable",

                cable_tv:
                  selectedBiller,

                cable_code:
                  selectedBiller,

                biller_code:
                  selectedBiller,

                smartcard_number:
                  smartcardNumber.trim(),

                smartcard_no:
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
          response.success ===
            false ||
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

        if (
          isInvalidCustomerName(
            customerName
          )
        ) {
          throw new Error(
            "The SmartCard/IUC number could not be verified."
          );
        }

        setVerifiedCustomer(
          customerName ||
            "SmartCard verified"
        );

        setVerifiedType(
          "cable"
        );

        toast.success(
          customerName
            ? `SmartCard verified for ${customerName}.`
            : "SmartCard verified successfully."
        );
      } catch (
        error: any
      ) {
        console.error(
          "Cable verification error:",
          error
        );

        toast.error(
          error?.message ||
            "Unable to verify SmartCard."
        );
      } finally {
        setVerifying(
          false
        );
      }
    };

  const validatePurchase =
    (): string | null => {
      if (!serviceType) {
        return "Please select a service.";
      }

      if (isComingSoon) {
        return `${
          SERVICE_LABELS[
            serviceType
          ] ||
          "This service"
        } is coming soon.`;
      }

      if (isAirtime) {
        if (
          !selectedNetwork
        ) {
          return "Please select a network.";
        }

        if (
          !cleanPhone(phone)
        ) {
          return "Please enter the recipient phone number.";
        }

        if (
          cleanPhone(phone)
            .length < 10
        ) {
          return "Please enter a valid Nigerian phone number.";
        }

        if (
          amountNumber < 50 ||
          amountNumber >
            200000
        ) {
          return "Airtime amount must be between ₦50 and ₦200,000.";
        }
      }

      if (isData) {
        if (
          !selectedNetwork
        ) {
          return "Please select a network.";
        }

        if (
          !selectedItemCode
        ) {
          return "Please select a data plan.";
        }

        if (
          !cleanPhone(phone)
        ) {
          return "Please enter the recipient phone number.";
        }

        if (
          cleanPhone(phone)
            .length < 10
        ) {
          return "Please enter a valid Nigerian phone number.";
        }
      }

      if (
        isElectricity
      ) {
        if (
          !selectedBiller
        ) {
          return "Please select your electricity company.";
        }

        if (!meterType) {
          return "Please select your meter type.";
        }

        if (
          !meterNumber.trim()
        ) {
          return "Please enter your meter number.";
        }

        if (
          verifiedType !==
          "meter"
        ) {
          return "Please verify your meter before continuing.";
        }

        if (
          amountNumber <= 0
        ) {
          return "Please enter a valid electricity amount.";
        }
      }

      if (isCable) {
        if (
          !selectedBiller
        ) {
          return "Please select your TV service.";
        }

        if (
          !selectedItemCode
        ) {
          return "Please select a package.";
        }

        if (
          !smartcardNumber.trim()
        ) {
          return "Please enter your SmartCard/IUC number.";
        }

        if (
          verifiedType !==
          "cable"
        ) {
          return "Please verify your SmartCard before continuing.";
        }
      }

      if (
        isAirtimeCard
      ) {
        if (
          !selectedNetwork
        ) {
          return "Please select a network.";
        }

        if (
          !selectedItemCode
        ) {
          return "Please select an E-Pin value.";
        }

        if (
          quantityNumber <
            1 ||
          quantityNumber >
            100
        ) {
          return "Quantity must be between 1 and 100.";
        }
      }

      if (isDataCard) {
        if (
          !selectedNetwork
        ) {
          return "Please select a network.";
        }

        if (
          !selectedItemCode
        ) {
          return "Please select a data E-Pin plan.";
        }

        if (
          quantityNumber <
            1 ||
          quantityNumber >
            100
        ) {
          return "Quantity must be between 1 and 100.";
        }
      }

      if (isSmile) {
        if (
          !accountId.trim()
        ) {
          return "Please enter your Smile account number.";
        }

        if (
          !selectedItemCode
        ) {
          return "Please select a Smile data plan.";
        }
      }

      if (isWAEC) {
        if (
          !selectedItemCode
        ) {
          return "Please select a WAEC package.";
        }

        if (
          !cleanPhone(phone)
        ) {
          return "Please enter the phone number that should receive the e-PIN.";
        }
      }

      if (isJAMB) {
        if (!examType) {
          return "Please select the JAMB exam type.";
        }

        if (
          !cleanPhone(phone)
        ) {
          return "Please enter the phone number that should receive the e-PIN.";
        }
      }

      return null;
    };

  const buildPurchaseDetails =
    (): Record<
      string,
      any
    > => {
      const requestId =
        `IYANJUPAY-${crypto.randomUUID()}`;

      const itemCode =
        getItemCode(
          selectedItem
        );

      const itemName =
        getItemName(
          selectedItem
        );

      const details: Record<
        string,
        any
      > = {
        type:
          serviceType,

        service:
          serviceType,

        country: "NG",

        request_id:
          requestId,

        requestId,

        customer:
          cleanPhone(phone) ||
          accountId.trim() ||
          recipientPhone.trim(),

        customer_id:
          accountId.trim() ||
          undefined,

        selling_amount:
          estimatedTotal,

        provider_amount:
          selectedProviderPrice,

        provider_price:
          selectedProviderPrice,

        item_code:
          itemCode ||
          undefined,

        product_code:
          itemCode ||
          undefined,

        variation_code:
          itemCode ||
          undefined,

        plan_code:
          itemCode ||
          undefined,

        package_code:
          itemCode ||
          undefined,

        package_name:
          itemName ||
          undefined,

        network_code:
          selectedNetwork ||
          undefined,

        networkCode:
          selectedNetwork ||
          undefined,

        biller_code:
          selectedBiller ||
          undefined,

        billerCode:
          selectedBiller ||
          undefined,

        mobile_network:
          selectedNetwork ||
          undefined,

        quantity:
          quantityNumber,

        phone:
          cleanPhone(phone) ||
          undefined,

        phoneNumber:
          cleanPhone(phone) ||
          undefined,

        recipient_phone:
          cleanPhone(
            recipientPhone
          ) ||
          undefined,
      };

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

      if (
        isElectricity
      ) {
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
          cleanPhone(phone) ||
          undefined;
      }

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

        details.smartcard_no =
          smartcardNumber.trim();

        details.smartCardNumber =
          smartcardNumber.trim();

        details.phone =
          cleanPhone(phone) ||
          undefined;

        details.amount =
          selectedProviderPrice;
      }

      if (
        isAirtimeCard
      ) {
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

        delete details.phone;
        delete details.phoneNumber;
      }

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

      if (isJAMB) {
        details.exam_type =
          examType;

        details.examType =
          examType;

        details.phone =
          cleanPhone(phone);

        details.phoneNumber =
          cleanPhone(phone);

        if (itemCode) {
          details.package_code =
            itemCode;
        }
      }

      return details;
    };

  const verifyPaymentPin =
    async (): Promise<boolean> => {
      if (
        !paymentPin.trim()
      ) {
        toast.error(
          "Please enter your payment PIN."
        );

        return false;
      }

      if (
        paymentPin.trim()
          .length !== 4
      ) {
        toast.error(
          "Payment PIN must be 4 digits."
        );

        return false;
      }

      setPinLoading(true);

      try {
        const {
          data,
          error,
        } =
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

        if (
          data === false ||
          data?.success ===
            false ||
          data?.valid ===
            false
        ) {
          throw new Error(
            "Incorrect payment PIN."
          );
        }

        return true;
      } catch (
        error: any
      ) {
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
        setPinLoading(
          false
        );
      }
    };

  const handlePurchase =
    async () => {
      const validation =
        validatePurchase();

      if (validation) {
        toast.error(
          validation
        );

        return;
      }

      setShowPinModal(true);
    };

  const confirmPurchase =
    async () => {
      const pinValid =
        await verifyPaymentPin();

      if (!pinValid) {
        return;
      }

      setPurchaseLoading(
        true
      );

      try {
        const details =
          buildPurchaseDetails();

        const purchaseAmount =
          isAirtime ||
          isElectricity
            ? amountNumber
            : isAirtimeCard ||
                isDataCard
            ? selectedProviderPrice *
              quantityNumber
            : selectedProviderPrice;

        await onPurchase(
          purchaseAmount,
          {
            ...details,
            payment_pin:
              paymentPin.trim(),
          }
        );

        setShowPinModal(
          false
        );

        setPaymentPin("");
      } catch (
        error: any
      ) {
        console.error(
          "Service purchase error:",
          error
        );

        toast.error(
          error?.message ||
            "Unable to complete this purchase."
        );
      } finally {
        setPurchaseLoading(
          false
        );
      }
    };

  const title =
    service?.title ||
    SERVICE_LABELS[
      serviceType
    ] ||
    "Service";

  const showNetworkSelector =
    isAirtime ||
    isData ||
    isAirtimeCard ||
    isDataCard;

  const showBillerSelector =
    isCable ||
    isElectricity;

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
                onClick={
                  onHistory
                }
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50">
      <div className="mx-auto w-full max-w-2xl px-4 pb-10 pt-5">
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
              onClick={
                onHistory
              }
              className="rounded-full hover:bg-white"
            >
              <History className="h-5 w-5" />
            </Button>
          ) : (
            <div className="w-10" />
          )}
        </div>

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
                  Complete your{" "}
                  {title.toLowerCase()}{" "}
                  purchase securely.
                </p>
              </div>
            </div>
          </div>

          <CardContent className="space-y-5 p-5 sm:p-6">
            {catalogueError && (
              <div className="rounded-2xl border border-red-100 bg-red-50 p-4">
                <div className="flex items-start gap-3">
                  <RefreshCw className="mt-0.5 h-5 w-5 text-red-500" />

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

            {loadingCatalogue &&
              networks.length ===
                0 &&
              billers.length ===
                0 &&
              items.length ===
                0 &&
              plans.length ===
                0 && (
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

            {showNetworkSelector && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold text-slate-700">
                    Select Network
                  </Label>

                  {selectedNetwork && (
                    <span className="text-xs font-medium text-indigo-600">
                      {
                        networks.find(
                          (network) =>
                            network.code ===
                            selectedNetwork
                        )?.name
                      }
                    </span>
                  )}
                </div>

                {networks.length >
                  0 ? (
                  <div className="flex gap-4 overflow-x-auto pb-2 pt-1">
                    {networks.map(
                      (network) => {
                        const active =
                          selectedNetwork ===
                          network.code;

                        const logo =
                          getNetworkLogo(
                            network
                          );

                        const badge =
                          getNetworkBadgeText(
                            network.name
                          );

                        const accent =
                          getNetworkAccent(
                            network.name
                          );

                        return (
                          <button
                            key={
                              network.code
                            }
                            type="button"
                            onClick={() =>
                              void handleNetworkChange(
                                network.code
                              )
                            }
                            aria-pressed={
                              active
                            }
                            className="flex min-w-[72px] flex-col items-center gap-2 outline-none"
                          >
                            <div
                              className={`relative flex h-16 w-16 items-center justify-center rounded-full border-2 bg-white shadow-sm transition-all ${
                                active
                                  ? "border-indigo-600 shadow-md ring-4 ring-indigo-100"
                                  : "border-slate-200 hover:border-indigo-300 hover:shadow-md"
                              }`}
                            >
                              <div
                                className={`flex h-12 w-12 items-center justify-center overflow-hidden rounded-full text-xs font-extrabold ${accent}`}
                              >
                                <span className="absolute inset-0 flex items-center justify-center">
                                  {
                                    badge
                                  }
                                </span>

                                {logo && (
                                  <img
                                    src={
                                      logo
                                    }
                                    alt=""
                                    className="relative z-10 h-full w-full rounded-full object-cover"
                                    onError={(
                                      event
                                    ) => {
                                      event.currentTarget.style.display =
                                        "none";
                                    }}
                                  />
                                )}
                              </div>

                              {active && (
                                <span className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-white">
                                  <CheckCircle2 className="h-4 w-4" />
                                </span>
                              )}
                            </div>

                            <span
                              className={`max-w-[72px] truncate text-center text-xs font-semibold ${
                                active
                                  ? "text-indigo-700"
                                  : "text-slate-600"
                              }`}
                            >
                              {
                                network.name
                              }
                            </span>
                          </button>
                        );
                      }
                    )}
                  </div>
                ) : (
                  !loadingCatalogue && (
                    <div className="rounded-2xl border border-dashed bg-slate-50 px-4 py-6 text-center">
                      <p className="text-sm font-medium text-slate-700">
                        No networks available.
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        Please refresh and try again.
                      </p>
                    </div>
                  )
                )}
              </div>
            )}

            {showBillerSelector &&
              billers.length >
                0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-slate-700">
                    {isCable
                      ? "TV Service"
                      : "Electricity Company"}
                  </Label>

                  <Select
                    value={
                      selectedBiller
                    }
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
                            key={
                              biller.code
                            }
                            value={
                              biller.code
                            }
                          >
                            {
                              biller.name
                            }
                          </SelectItem>
                        )
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}

            {isSmile &&
              networks.length ===
                0 && (
                <div className="rounded-2xl border bg-slate-50 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100">
                      <Wifi className="h-5 w-5 text-indigo-600" />
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
                          setDataTab(
                            tab
                          )
                        }
                        className={`rounded-xl px-1 py-2 text-[10px] font-semibold transition sm:text-xs ${
                          dataTab ===
                          tab
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
                          getItemCode(
                            item
                          );

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
                            key={
                              code
                            }
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
                              {money(
                                price
                              )}
                            </p>
                          </button>
                        );
                      }
                    )}
                  </div>
                )}
              </div>
            )}

            {!isData &&
              (isCable ||
                isAirtimeCard ||
                isDataCard ||
                isSmile ||
                isWAEC ||
                isJAMB) &&
              itemList.length >
                0 && (
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
                    value={
                      selectedItemCode
                    }
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
                        (item, index) => {
                          const code =
                            getItemCode(
                              item
                            ) ||
                            String(
                              index
                            );

                          const price =
                            getItemSellingPrice(
                              item
                            );

                          return (
                            <SelectItem
                              key={
                                `${code}-${index}`
                              }
                              value={
                                code
                              }
                            >
                              <span className="flex items-center justify-between gap-5">
                                <span>
                                  {getItemName(
                                    item
                                  )}
                                </span>

                                {price >
                                  0 && (
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

            {isAirtime && (
              <>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-slate-700">
                    Phone Number
                  </Label>

                  <div className="relative">
                    <Phone className="absolute left-3 top-3.5 h-5 w-5 text-slate-400" />

                    <Input
                      value={
                        phone
                      }
                      onChange={(
                        event
                      ) =>
                        setPhone(
                          event
                            .target
                            .value
                        )
                      }
                      inputMode="tel"
                      placeholder="08012345678"
                      className="h-12 rounded-xl pl-11"
                    />
                  </div>
                </div>

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
                          key={
                            value
                          }
                          onClick={() =>
                            setAmount(
                              String(
                                value
                              )
                            )
                          }
                          className={`rounded-xl border py-3 text-sm font-semibold transition ${
                            amountNumber ===
                            value
                              ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                              : "border-slate-200 bg-white text-slate-700 hover:border-indigo-200"
                          }`}
                        >
                          {money(
                            value
                          )}
                        </button>
                      )
                    )}
                  </div>

                  <Input
                    value={
                      amount
                    }
                    onChange={(
                      event
                    ) =>
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
              </>
            )}

            {isData && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700">
                  Phone Number
                </Label>

                <div className="relative">
                  <Phone className="absolute left-3 top-3.5 h-5 w-5 text-slate-400" />

                  <Input
                    value={
                      phone
                    }
                    onChange={(
                      event
                    ) =>
                      setPhone(
                        event
                          .target
                          .value
                      )
                    }
                    inputMode="tel"
                    placeholder="08012345678"
                    className="h-12 rounded-xl pl-11"
                  />
                </div>
              </div>
            )}

            {isElectricity && (
              <>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-slate-700">
                    Meter Type
                  </Label>

                  <Select
                    value={
                      meterType
                    }
                    onValueChange={(
                      value
                    ) => {
                      setMeterType(
                        value
                      );

                      setVerifiedCustomer(
                        ""
                      );

                      setVerifiedType(
                        "none"
                      );
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
                      value={
                        meterNumber
                      }
                      onChange={(
                        event
                      ) => {
                        setMeterNumber(
                          event
                            .target
                            .value
                        );

                        setVerifiedCustomer(
                          ""
                        );

                        setVerifiedType(
                          "none"
                        );
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
                        {
                          verifiedCustomer
                        }
                      </p>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-slate-700">
                    Amount
                  </Label>

                  <Input
                    value={
                      amount
                    }
                    onChange={(
                      event
                    ) =>
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
                    value={
                      phone
                    }
                    onChange={(
                      event
                    ) =>
                      setPhone(
                        event
                          .target
                          .value
                      )
                    }
                    inputMode="tel"
                    placeholder="08012345678"
                    className="h-12 rounded-xl"
                  />
                </div>
              </>
            )}

            {isCable && (
              <>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-slate-700">
                    SmartCard / IUC Number
                  </Label>

                  <div className="flex gap-2">
                    <Input
                      value={
                        smartcardNumber
                      }
                      onChange={(
                        event
                      ) => {
                        setSmartcardNumber(
                          event
                            .target
                            .value
                        );

                        setVerifiedCustomer(
                          ""
                        );

                        setVerifiedType(
                          "none"
                        );
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
                        {
                          verifiedCustomer
                        }
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
                    value={
                      phone
                    }
                    onChange={(
                      event
                    ) =>
                      setPhone(
                        event
                          .target
                          .value
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

            {(isAirtimeCard ||
              isDataCard) && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700">
                  Quantity
                </Label>

                <Input
                  value={
                    quantity
                  }
                  onChange={(
                    event
                  ) =>
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

            {isSmile && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700">
                  Smile Account Number
                </Label>

                <Input
                  value={
                    accountId
                  }
                  onChange={(
                    event
                  ) =>
                    setAccountId(
                      event
                        .target
                        .value
                    )
                  }
                  inputMode="numeric"
                  placeholder="Enter Smile account number"
                  className="h-12 rounded-xl"
                />
              </div>
            )}

            {isWAEC && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700">
                  Phone Number
                </Label>

                <Input
                  value={
                    phone
                  }
                  onChange={(
                    event
                  ) =>
                    setPhone(
                      event
                        .target
                        .value
                    )
                  }
                  inputMode="tel"
                  placeholder="08012345678"
                  className="h-12 rounded-xl"
                />
              </div>
            )}

            {isJAMB && (
              <>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-slate-700">
                    Exam Type
                  </Label>

                  <Select
                    value={
                      examType
                    }
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
                    value={
                      phone
                    }
                    onChange={(
                      event
                    ) =>
                      setPhone(
                        event
                          .target
                          .value
                      )
                    }
                    inputMode="tel"
                    placeholder="08012345678"
                    className="h-12 rounded-xl"
                  />
                </div>
              </>
            )}

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
                  value={
                    recipientPhone
                  }
                  onChange={(
                    event
                  ) =>
                    setRecipientPhone(
                      event
                        .target
                        .value
                    )
                  }
                  inputMode="tel"
                  placeholder="08012345678"
                  className="h-12 rounded-xl"
                />

                <p className="text-xs text-slate-500">
                  This is only for your record. The PIN is
                  generated by the service.
                </p>
              </div>
            )}

            {(estimatedTotal >
              0 ||
              selectedSellingPrice >
                0) && (
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
                  Final pricing is calculated securely by
                  IyanjuPay on the server.
                </p>
              </div>
            )}

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

            <Button
              type="button"
              onClick={
                handlePurchase
              }
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

      <Dialog
        open={
          showPinModal
        }
        onOpenChange={(
          open
        ) => {
          if (
            !purchaseLoading &&
            !pinLoading
          ) {
            setShowPinModal(
              open
            );

            if (!open) {
              setPaymentPin(
                ""
              );
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
                    selectedSellingPrice ||
                    amountNumber
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
                value={
                  paymentPin
                }
                onChange={(
                  event
                ) =>
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
                  setShowPinModal(
                    false
                  );

                  setPaymentPin(
                    ""
                  );
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
                  paymentPin.length !==
                    4
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
};

export default ServicePayment;
