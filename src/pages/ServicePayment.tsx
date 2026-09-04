import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Clock3,
  History,
  Loader2,
  LockKeyhole,
  Phone,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Tv,
  UserRound,
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
  DialogFooter,
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
    details: Record<string, any>,
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

  exam_type?: string;
  examType?: string;

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

const COMING_SOON_SERVICES =
  new Set([
    "internet",
    "insurance",
    "savings",
  ]);

const DATA_TABS = [
  "HOT",
  "Extra Night",
  "Daily",
  "Weekly",
  "Monthly",
];

const PREMIUM_SERVICES = new Set([
  "airtime-card",
  "data-card",
  "smile",
  "waec",
  "jamb",
]);

function normalizeServiceType(
  value: string,
): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/_/g, "-");
}

function money(
  value: number,
): string {
  return new Intl.NumberFormat(
    "en-NG",
    {
      style: "currency",
      currency: "NGN",
      maximumFractionDigits: 2,
    },
  ).format(
    Number.isFinite(value)
      ? value
      : 0,
  );
}

function numericValue(
  value: unknown,
): number {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (typeof value === "string") {
    const number = Number(
      value.replace(/[^0-9.-]/g, ""),
    );

    return Number.isFinite(number)
      ? number
      : 0;
  }

  return 0;
}

function cleanPhone(
  value: string,
): string {
  return value
    .replace(/\D/g, "")
    .replace(/^234/, "0")
    .slice(0, 11);
}

function toCatalogueArray(
  value: any,
): any[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (
    value &&
    typeof value === "object"
  ) {
    return Object.values(value).flatMap(
      (item) =>
        Array.isArray(item)
          ? item
          : item &&
              typeof item ===
                "object"
            ? toCatalogueArray(item)
            : [],
    );
  }

  return [];
}

function getItemCode(
  item: CatalogueItem,
): string {
  return String(
    item.code ??
      item.productCode ??
      item.product_code ??
      item.planCode ??
      item.plan_code ??
      item.variationCode ??
      item.variation_code ??
      item.code2 ??
      item.id ??
      "",
  );
}

function getItemName(
  item: CatalogueItem,
): string {
  return String(
    item.name ??
      item.planName ??
      item.plan_name ??
      item.packageName ??
      item.package_name ??
      item.productName ??
      item.product_name ??
      item.title ??
      item.label ??
      getItemCode(item),
  );
}

function getItemProviderPrice(
  item: CatalogueItem,
): number {
  return numericValue(
    item.providerPrice ??
      item.provider_price ??
      item.providerAmount ??
      item.provider_amount ??
      item.PRODUCT_AMOUNT ??
      item.amount ??
      item.value,
  );
}

function getItemSellingPrice(
  item: CatalogueItem,
): number {
  const explicitSellingPrice =
    numericValue(
      item.price ??
        item.sellingPrice ??
        item.selling_price ??
        item.salePrice,
    );

  if (explicitSellingPrice > 0) {
    return explicitSellingPrice;
  }

  return getItemProviderPrice(item);
}

function normalizeNetwork(
  network: CatalogueNetwork,
): CatalogueNetwork {
  const code = String(
    network.networkCode ??
      network.network_code ??
      network.code ??
      network.id ??
      network.value ??
      "",
  );

  const name = String(
    network.name ??
      network.network ??
      network.company ??
      network.label ??
      code,
  );

  return {
    ...network,
    code,
    name,
    networkCode: code,
    network_code: code,
  };
}

function getNetworkLogo(
  network: CatalogueNetwork,
): string {
  return String(
    network.logo ??
      network.logo_url ??
      network.logoUrl ??
      network.image ??
      network.image_url ??
      network.imageUrl ??
      network.icon ??
      "",
  );
}

function getNetworkInitials(
  name: string,
): string {
  const words = name
    .split(/\s+/)
    .filter(Boolean);

  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }

  return name
    .slice(0, 2)
    .toUpperCase();
}

function isInvalidCustomerName(
  value: string,
): boolean {
  const normalized =
    value
      .trim()
      .toUpperCase();

  return (
    !normalized ||
    normalized.includes("INVALID") ||
    normalized.includes("NOT FOUND") ||
    normalized.includes("NOTFOUND")
  );
}

function getDataTab(
  item: CatalogueItem,
): string {
  const text = [
    item.tab,
    item.category,
    item.categoryName,
    item.category_name,
    item.validity,
    item.label,
    item.name,
    item.planName,
    item.plan_name,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (
    text.includes("night") ||
    text.includes("extra")
  ) {
    return "Extra Night";
  }

  if (text.includes("daily")) {
    return "Daily";
  }

  if (text.includes("weekly")) {
    return "Weekly";
  }

  if (text.includes("monthly")) {
    return "Monthly";
  }

  return "HOT";
}

function extractNetworks(
  response: CatalogueResponse,
): CatalogueNetwork[] {
  const source =
    response.networks ??
    response.providers ??
    response.data?.networks ??
    response.data?.providers ??
    response.data?.network ??
    [];

  return toCatalogueArray(source)
    .map((item) =>
      normalizeNetwork(
        item as CatalogueNetwork,
      ),
    )
    .filter(
      (item) =>
        Boolean(
          item.code ||
            item.name,
        ),
    );
}

function extractBillers(
  response: CatalogueResponse,
): CatalogueNetwork[] {
  const source =
    response.billers ??
    response.data?.billers ??
    response.data?.companies ??
    response.data?.providers ??
    [];

  return toCatalogueArray(source)
    .map((item) =>
      normalizeNetwork(
        item as CatalogueNetwork,
      ),
    )
    .filter(
      (item) =>
        Boolean(
          item.code ||
            item.name,
        ),
    );
}

function extractItems(
  response: CatalogueResponse,
): CatalogueItem[] {
  const source =
    response.items ??
    response.data?.items ??
    [];

  return toCatalogueArray(
    source,
  ) as CatalogueItem[];
}

function extractPlans(
  response: CatalogueResponse,
): CatalogueItem[] {
  const source =
    response.plans ??
    response.data?.plans ??
    response.data?.packages ??
    response.data?.products ??
    [];

  return toCatalogueArray(
    source,
  ) as CatalogueItem[];
}

const ServicePayment = ({
  service,
  onBack,
  onPurchase,
  onHistory,
}: ServicePaymentProps) => {
  const serviceType = useMemo(
    () =>
      normalizeServiceType(
        service?.type ?? "",
      ),
    [service?.type],
  );

  const isComingSoon =
    COMING_SOON_SERVICES.has(
      serviceType,
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

  const isWaec =
    serviceType === "waec";

  const isJamb =
    serviceType === "jamb";

  const isPremium =
    PREMIUM_SERVICES.has(
      serviceType,
    );

  const [loadingCatalogue, setLoadingCatalogue] =
    useState(false);

  const [catalogueError, setCatalogueError] =
    useState("");

  const [networks, setNetworks] =
    useState<CatalogueNetwork[]>([]);

  const [billers, setBillers] =
    useState<CatalogueNetwork[]>([]);

  const [items, setItems] =
    useState<CatalogueItem[]>([]);

  const [plans, setPlans] =
    useState<CatalogueItem[]>([]);

  const [selectedNetwork, setSelectedNetwork] =
    useState("");

  const [selectedBiller, setSelectedBiller] =
    useState("");

  const [selectedItemCode, setSelectedItemCode] =
    useState("");

  const [dataTab, setDataTab] =
    useState("HOT");

  const [phone, setPhone] =
    useState("");

  const [amount, setAmount] =
    useState("");

  const [quantity, setQuantity] =
    useState("1");

  const [meterType, setMeterType] =
    useState("01");

  const [meterNumber, setMeterNumber] =
    useState("");

  const [smartcardNumber, setSmartcardNumber] =
    useState("");

  const [accountId, setAccountId] =
    useState("");

  const [examType, setExamType] =
    useState("");

  const [verifying, setVerifying] =
    useState(false);

  const [verifiedCustomer, setVerifiedCustomer] =
    useState("");

  const [verifiedType, setVerifiedType] =
    useState<
      "meter" | "cable" | ""
    >("");

  const [purchaseLoading, setPurchaseLoading] =
    useState(false);

  const [showPinModal, setShowPinModal] =
    useState(false);

  const [paymentPin, setPaymentPin] =
    useState("");

  const [pinLoading, setPinLoading] =
    useState(false);

  const [recipientPhone, setRecipientPhone] =
    useState("");

  const invokeCatalogue =
    useCallback(
      async (
        extra: Record<string, any> = {},
      ): Promise<CatalogueResponse> => {
        const { data, error } =
          await supabase.functions.invoke(
            "clubkonnect-services",
            {
              body: {
                action: "catalog",
                service: serviceType,
                ...extra,
              },
            },
          );

        if (error) {
          throw error;
        }

        return (
          data as CatalogueResponse
        ) ?? {};
      },
      [serviceType],
    );

  const loadCatalogue =
    useCallback(
      async () => {
        if (
          !service ||
          isComingSoon
        ) {
          return;
        }

        setLoadingCatalogue(true);
        setCatalogueError("");

        setNetworks([]);
        setBillers([]);
        setItems([]);
        setPlans([]);

        setSelectedNetwork("");
        setSelectedBiller("");
        setSelectedItemCode("");

        try {
          const response =
            await invokeCatalogue();

          if (
            response.success === false
          ) {
            throw new Error(
              response.error ??
                response.message ??
                "Unable to load service catalogue.",
            );
          }

          const nextNetworks =
            extractNetworks(
              response,
            );

          const nextBillers =
            extractBillers(
              response,
            );

          const nextItems =
            extractItems(
              response,
            );

          const nextPlans =
            extractPlans(
              response,
            );

          setNetworks(
            nextNetworks,
          );

          setBillers(
            nextBillers,
          );

          setItems(
            nextItems,
          );

          setPlans(
            nextPlans,
          );

          if (
            nextNetworks.length ===
            1
          ) {
            setSelectedNetwork(
              nextNetworks[0].code,
            );
          }

          if (
            nextBillers.length ===
            1
          ) {
            setSelectedBiller(
              nextBillers[0].code,
            );
          }

          const combined =
            [
              ...nextPlans,
              ...nextItems,
            ];

          if (
            combined.length ===
            1
          ) {
            setSelectedItemCode(
              getItemCode(
                combined[0],
              ),
            );
          }
        } catch (error) {
          setCatalogueError(
            error instanceof Error
              ? error.message
              : "Unable to load the service catalogue.",
          );
        } finally {
          setLoadingCatalogue(
            false,
          );
        }
      },
      [
        invokeCatalogue,
        isComingSoon,
        service,
      ],
    );

  useEffect(() => {
    void loadCatalogue();
  }, [loadCatalogue]);

  const loadNetworkCatalogue =
    useCallback(
      async (
        networkCode?: string,
        billerCode?: string,
      ) => {
        setLoadingCatalogue(true);
        setCatalogueError("");
        setSelectedItemCode("");

        try {
          const response =
            await invokeCatalogue({
              ...(networkCode
                ? {
                    network_code:
                      networkCode,
                  }
                : {}),
              ...(billerCode
                ? {
                    biller_code:
                      billerCode,
                  }
                : {}),
            });

          if (
            response.success === false
          ) {
            throw new Error(
              response.error ??
                response.message ??
                "Unable to load plans.",
            );
          }

          setItems(
            extractItems(
              response,
            ),
          );

          setPlans(
            extractPlans(
              response,
            ),
          );
        } catch (error) {
          setCatalogueError(
            error instanceof Error
              ? error.message
              : "Unable to load plans.",
          );
        } finally {
          setLoadingCatalogue(
            false,
          );
        }
      },
      [invokeCatalogue],
    );

  const handleNetworkChange =
    async (
      value: string,
    ) => {
      setSelectedNetwork(
        value,
      );

      setSelectedItemCode("");

      if (
        isData ||
        isDataCard
      ) {
        await loadNetworkCatalogue(
          value,
        );
      }
    };

  const handleBillerChange =
    async (
      value: string,
    ) => {
      setSelectedBiller(
        value,
      );

      setSelectedItemCode("");

      if (isCable) {
        await loadNetworkCatalogue(
          undefined,
          value,
        );
      }
    };

  const selectedItem =
    useMemo(() => {
      const combined =
        [
          ...items,
          ...plans,
        ];

      return (
        combined.find(
          (item) =>
            getItemCode(item) ===
            selectedItemCode,
        ) ?? null
      );
    }, [
      items,
      plans,
      selectedItemCode,
    ]);

  const allDataPlans =
    useMemo(() => {
      const seen =
        new Set<string>();

      return [
        ...plans,
        ...items,
      ].filter(
        (item) => {
          const key =
            getItemCode(item);

          if (
            !key ||
            seen.has(key)
          ) {
            return false;
          }

          seen.add(key);

          return true;
        },
      );
    }, [
      items,
      plans,
    ]);

  const visibleDataPlans =
    useMemo(() => {
      if (
        dataTab ===
        "HOT"
      ) {
        return allDataPlans;
      }

      return allDataPlans.filter(
        (item) =>
          getDataTab(item) ===
          dataTab,
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

  const selectedSellingPrice =
    selectedItem
      ? getItemSellingPrice(
          selectedItem,
        )
      : 0;

  const selectedProviderPrice =
    selectedItem
      ? getItemProviderPrice(
          selectedItem,
        )
      : 0;

  const amountNumber =
    numericValue(amount);

  const quantityNumber =
    Math.max(
      1,
      Math.min(
        100,
        Math.floor(
          numericValue(
            quantity,
          ) || 1,
        ),
      ),
    );

  const estimatedTotal =
    isAirtime
      ? amountNumber
      : isElectricity
        ? amountNumber
        : isAirtimeCard ||
            isDataCard
          ? selectedSellingPrice *
            quantityNumber
          : selectedSellingPrice;

  const selectedNetworkObject =
    networks.find(
      (network) =>
        network.code ===
        selectedNetwork,
    );

  const selectedBillerObject =
    billers.find(
      (biller) =>
        biller.code ===
        selectedBiller,
    );

  const verifyMeter =
    async () => {
      if (
        !selectedBiller ||
        !meterNumber.trim()
      ) {
        toast.error(
          "Select your electricity company and enter your meter number.",
        );
        return;
      }

      setVerifying(true);
      setVerifiedCustomer("");
      setVerifiedType("");

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
                biller_code:
                  selectedBiller,
                meter_type:
                  meterType,
                meter_number:
                  meterNumber.trim(),
              },
            },
          );

        if (error) {
          throw error;
        }

        const result =
          data as VerificationResponse;

        const name =
          String(
            result.customerName ??
              result.customer_name ??
              "",
          );

        if (
          !result.success ||
          isInvalidCustomerName(
            name,
          )
        ) {
          throw new Error(
            result.message ??
              result.error ??
              "Meter verification failed.",
          );
        }

        setVerifiedCustomer(
          name,
        );

        setVerifiedType(
          "meter",
        );

        toast.success(
          "Meter verified successfully.",
        );
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Unable to verify meter.",
        );
      } finally {
        setVerifying(
          false,
        );
      }
    };

  const verifyCable =
    async () => {
      if (
        !selectedBiller ||
        !smartcardNumber.trim()
      ) {
        toast.error(
          "Select your TV service and enter your smartcard number.",
        );
        return;
      }

      setVerifying(true);
      setVerifiedCustomer("");
      setVerifiedType("");

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
                biller_code:
                  selectedBiller,
                smartcard_number:
                  smartcardNumber.trim(),
              },
            },
          );

        if (error) {
          throw error;
        }

        const result =
          data as VerificationResponse;

        const name =
          String(
            result.customerName ??
              result.customer_name ??
              "",
          );

        if (
          !result.success ||
          isInvalidCustomerName(
            name,
          )
        ) {
          throw new Error(
            result.message ??
              result.error ??
              "Smartcard verification failed.",
          );
        }

        setVerifiedCustomer(
          name,
        );

        setVerifiedType(
          "cable",
        );

        toast.success(
          "Smartcard verified successfully.",
        );
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Unable to verify smartcard.",
        );
      } finally {
        setVerifying(
          false,
        );
      }
    };

  const validate =
    (): string | null => {
      if (isAirtime) {
        if (!selectedNetwork) {
          return "Select a network.";
        }

        if (
          cleanPhone(phone).length !==
          11
        ) {
          return "Enter a valid Nigerian phone number.";
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
          return "Select a network.";
        }

        if (!selectedItem) {
          return "Select a data plan.";
        }

        if (
          cleanPhone(phone).length !==
          11
        ) {
          return "Enter a valid Nigerian phone number.";
        }
      }

      if (isElectricity) {
        if (!selectedBiller) {
          return "Select an electricity company.";
        }

        if (!meterNumber.trim()) {
          return "Enter your meter number.";
        }

        if (
          !verifiedCustomer ||
          verifiedType !==
            "meter"
        ) {
          return "Please verify your meter before continuing.";
        }

        if (
          amountNumber < 100
        ) {
          return "Enter a valid electricity amount.";
        }
      }

      if (isCable) {
        if (!selectedBiller) {
          return "Select a TV service.";
        }

        if (!selectedItem) {
          return "Select a package.";
        }

        if (
          !smartcardNumber.trim()
        ) {
          return "Enter your smartcard number.";
        }

        if (
          !verifiedCustomer ||
          verifiedType !==
            "cable"
        ) {
          return "Please verify your smartcard before continuing.";
        }
      }

      if (
        isAirtimeCard ||
        isDataCard
      ) {
        if (!selectedNetwork) {
          return "Select a network.";
        }

        if (!selectedItem) {
          return "Select a product.";
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
        if (!accountId.trim()) {
          return "Enter your Smile account number.";
        }

        if (!selectedItem) {
          return "Select a Smile package.";
        }
      }

      if (isWaec) {
        if (!selectedItem) {
          return "Select a WAEC product.";
        }

        if (
          cleanPhone(phone).length !==
          11
        ) {
          return "Enter a valid Nigerian phone number.";
        }
      }

      if (isJamb) {
        if (!examType) {
          return "Select an examination type.";
        }

        if (
          cleanPhone(phone).length !==
          11
        ) {
          return "Enter a valid Nigerian phone number.";
        }
      }

      return null;
    };

  const buildPurchaseDetails =
    (): Record<
      string,
      any
    > => {
      const details: Record<
        string,
        any
      > = {
        type: serviceType,
        service: serviceType,

        country: "NG",

        item_code:
          selectedItem
            ? getItemCode(
                selectedItem,
              )
            : undefined,

        product_code:
          selectedItem?.productCode ??
          selectedItem?.product_code ??
          undefined,

        variation_code:
          selectedItem?.variationCode ??
          selectedItem?.variation_code ??
          undefined,

        plan_code:
          selectedItem?.planCode ??
          selectedItem?.plan_code ??
          getItemCode(
            selectedItem ??
              ({
                code: "",
              } as CatalogueItem),
          ),

        package_code:
          selectedItem
            ? getItemCode(
                selectedItem,
              )
            : undefined,

        package_name:
          selectedItem
            ? getItemName(
                selectedItem,
              )
            : undefined,

        provider_price:
          selectedProviderPrice,

        providerPrice:
          selectedProviderPrice,

        provider_amount:
          selectedProviderPrice,

        providerAmount:
          selectedProviderPrice,

        selling_amount:
          estimatedTotal,

        sellingAmount:
          estimatedTotal,

        price:
          estimatedTotal,

        amount:
          estimatedTotal,

        network_code:
          selectedNetwork ||
          undefined,

        networkCode:
          selectedNetwork ||
          undefined,

        mobile_network:
          selectedNetwork ||
          undefined,

        biller_code:
          selectedBiller ||
          undefined,

        billerCode:
          selectedBiller ||
          undefined,

        quantity:
          quantityNumber,

        phone:
          cleanPhone(phone),

        phoneNumber:
          cleanPhone(phone),

        recipient_phone:
          cleanPhone(
            recipientPhone ||
              phone,
          ),
      };

      if (isAirtime) {
        details.amount =
          amountNumber;

        details.selling_amount =
          amountNumber;

        details.sellingAmount =
          amountNumber;

        details.provider_price =
          amountNumber;

        details.providerPrice =
          amountNumber;
      }

      if (isData) {
        details.data_plan =
          getItemCode(
            selectedItem ??
              ({
                code: "",
              } as CatalogueItem),
          );

        details.dataPlan =
          details.data_plan;
      }

      if (isElectricity) {
        details.electric_company =
          selectedBiller;

        details.company_code =
          selectedBiller;

        details.meter_type =
          meterType;

        details.meter_number =
          meterNumber.trim();

        details.meter_no =
          meterNumber.trim();

        details.amount =
          amountNumber;
      }

      if (isCable) {
        details.cable_tv =
          selectedBiller;

        details.cable_code =
          selectedBiller;

        details.package =
          getItemCode(
            selectedItem ??
              ({
                code: "",
              } as CatalogueItem),
          );

        details.package_code =
          details.package;

        details.smartcard_number =
          smartcardNumber.trim();

        details.smartcard_no =
          smartcardNumber.trim();

        details.smartCardNumber =
          smartcardNumber.trim();

        details.amount =
          selectedSellingPrice;
      }

      if (
        isAirtimeCard ||
        isDataCard
      ) {
        details.value =
          numericValue(
            selectedItem?.value ??
              selectedProviderPrice,
          );

        delete details.phone;
        delete details.phoneNumber;
        delete details.recipient_phone;
      }

      if (isSmile) {
        details.smile =
          "smile-direct";

        details.account_id =
          accountId.trim();

        details.accountId =
          accountId.trim();

        details.mobile_number =
          accountId.trim();

        details.data_plan =
          getItemCode(
            selectedItem ??
              ({
                code: "",
              } as CatalogueItem),
          );

        details.dataPlan =
          details.data_plan;
      }

      if (isWaec) {
        details.exam_type =
          selectedItem?.examType ??
          selectedItem?.exam_type ??
          getItemCode(
            selectedItem ??
              ({
                code: "",
              } as CatalogueItem),
          );
      }

      if (isJamb) {
        details.exam_type =
          examType;

        details.examType =
          examType;
      }

      return details;
    };

  const verifyPaymentPin =
    async (
      pin: string,
    ) => {
      const {
        data,
        error,
      } =
        await supabase.rpc(
          "verify_payment_pin",
          {
            p_pin: pin,
          },
        );

      if (error) {
        throw error;
      }

      if (
        data === false ||
        data?.success === false
      ) {
        throw new Error(
          "Incorrect payment PIN.",
        );
      }

      return true;
    };

  const handlePurchase =
    () => {
      const validationError =
        validate();

      if (
        validationError
      ) {
        toast.error(
          validationError,
        );
        return;
      }

      if (
        estimatedTotal <= 0
      ) {
        toast.error(
          "Unable to determine the purchase amount.",
        );
        return;
      }

      setPaymentPin("");
      setShowPinModal(
        true,
      );
    };

  const confirmPurchase =
    async () => {
      if (
        paymentPin.length <
        4
      ) {
        toast.error(
          "Enter your payment PIN.",
        );
        return;
      }

      setPinLoading(true);

      try {
        await verifyPaymentPin(
          paymentPin,
        );

        setPinLoading(false);
        setPurchaseLoading(
          true,
        );

        const details =
          buildPurchaseDetails();

        details.payment_pin =
          paymentPin;

        await onPurchase(
          estimatedTotal,
          details,
        );

        setShowPinModal(
          false,
        );

        setPaymentPin("");

        toast.success(
          "Transaction submitted successfully.",
        );
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Unable to complete purchase.",
        );
      } finally {
        setPinLoading(
          false,
        );

        setPurchaseLoading(
          false,
        );
      }
    };

  if (!service) {
    return null;
  }

  if (isComingSoon) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto flex min-h-screen max-w-2xl items-center justify-center px-5 py-10">
          <Card className="w-full overflow-hidden rounded-[2rem] border-0 bg-white shadow-xl shadow-slate-200/70">
            <CardContent className="p-8 text-center sm:p-12">
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-slate-100">
                <Clock3 className="h-9 w-9 text-[#082A63]" />
              </div>

              <p className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-[#082A63]">
                Coming Soon
              </p>

              <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
                {service.title}
              </h1>

              <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-500">
                This service is being prepared
                and will be available on IyanjuPay
                soon.
              </p>

              <Button
                className="mt-8 rounded-xl bg-[#082A63] px-6 hover:bg-[#061f4a]"
                onClick={onBack}
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
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto w-full max-w-5xl px-4 pb-10 pt-4 sm:px-6 lg:px-8">
        <div className="mb-5 flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-2 rounded-xl px-2 py-2 text-sm font-semibold text-slate-600 transition hover:bg-white hover:text-slate-950"
          >
            <ArrowLeft className="h-5 w-5" />
            Back
          </button>

          {onHistory && (
            <button
              type="button"
              onClick={onHistory}
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-white hover:text-slate-950"
            >
              <History className="h-4 w-4" />
              History
            </button>
          )}
        </div>

        <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
          <div className="relative overflow-hidden bg-gradient-to-br from-[#082A63] via-[#0b367d] to-[#12499d] px-6 py-7 text-white sm:px-8">
            <div className="absolute -right-16 -top-20 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
            <div className="absolute -bottom-24 left-1/3 h-48 w-48 rounded-full bg-[#F4B400]/10 blur-3xl" />

            <div className="relative flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20 backdrop-blur">
                {isAirtime && (
                  <Phone className="h-7 w-7" />
                )}

                {isData && (
                  <Wifi className="h-7 w-7" />
                )}

                {isElectricity && (
                  <Zap className="h-7 w-7" />
                )}

                {isCable && (
                  <Tv className="h-7 w-7" />
                )}

                {isAirtimeCard && (
                  <Smartphone className="h-7 w-7" />
                )}

                {isDataCard && (
                  <Smartphone className="h-7 w-7" />
                )}

                {isSmile && (
                  <Wifi className="h-7 w-7" />
                )}

                {isWaec && (
                  <UserRound className="h-7 w-7" />
                )}

                {isJamb && (
                  <UserRound className="h-7 w-7" />
                )}
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/65">
                  IyanjuPay Services
                </p>

                <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
                  {service.title}
                </h1>

                <p className="mt-1 text-sm text-white/70">
                  {isPremium
                    ? "Premium service"
                    : "Fast, secure and convenient"}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-6 p-5 sm:p-8">
            {catalogueError && (
              <div className="flex items-start gap-3 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
                <div className="flex-1">
                  <p className="font-semibold">
                    Unable to load service details
                  </p>

                  <p className="mt-1 text-red-600/90">
                    {catalogueError}
                  </p>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-xl border-red-200 bg-white"
                  onClick={() =>
                    void loadCatalogue()
                  }
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Retry
                </Button>
              </div>
            )}

            {loadingCatalogue && (
              <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 py-12">
                <div className="flex items-center gap-3 text-sm font-medium text-slate-500">
                  <Loader2 className="h-5 w-5 animate-spin text-[#082A63]" />
                  Loading available options...
                </div>
              </div>
            )}

            {(isAirtime ||
              isData ||
              isAirtimeCard ||
              isDataCard) &&
              networks.length >
                0 && (
                <Card className="rounded-2xl border-slate-200 shadow-none">
                  <CardContent className="p-5">
                    <div className="mb-4">
                      <Label className="text-sm font-semibold text-slate-900">
                        Network
                      </Label>

                      <p className="mt-1 text-xs text-slate-500">
                        Choose the network for this service.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {networks.map(
                        (network) => {
                          const selected =
                            selectedNetwork ===
                            network.code;

                          const logo =
                            getNetworkLogo(
                              network,
                            );

                          return (
                            <button
                              key={
                                network.code
                              }
                              type="button"
                              onClick={() =>
                                void handleNetworkChange(
                                  network.code,
                                )
                              }
                              className={`group flex items-center gap-3 rounded-2xl border p-3 text-left transition-all ${
                                selected
                                  ? "border-[#082A63] bg-[#082A63]/5 ring-2 ring-[#082A63]/10"
                                  : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
                              }`}
                            >
                              <div
                                className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl ${
                                  selected
                                    ? "bg-[#082A63]"
                                    : "bg-slate-100"
                                }`}
                              >
                                {logo ? (
                                  <img
                                    src={
                                      logo
                                    }
                                    alt=""
                                    className="h-full w-full object-contain p-1.5"
                                  />
                                ) : (
                                  <span
                                    className={`text-xs font-bold ${
                                      selected
                                        ? "text-white"
                                        : "text-slate-600"
                                    }`}
                                  >
                                    {getNetworkInitials(
                                      network.name,
                                    )}
                                  </span>
                                )}
                              </div>

                              <div className="min-w-0">
                                <p
                                  className={`truncate text-sm font-semibold ${
                                    selected
                                      ? "text-[#082A63]"
                                      : "text-slate-800"
                                  }`}
                                >
                                  {
                                    network.name
                                  }
                                </p>

                                {selected && (
                                  <p className="text-[11px] font-medium text-[#082A63]/65">
                                    Selected
                                  </p>
                                )}
                              </div>
                            </button>
                          );
                        },
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

            {(isElectricity ||
              isCable) &&
              billers.length >
                0 && (
                <Card className="rounded-2xl border-slate-200 shadow-none">
                  <CardContent className="p-5">
                    <Label className="text-sm font-semibold text-slate-900">
                      {isElectricity
                        ? "Electricity company"
                        : "TV service"}
                    </Label>

                    <Select
                      value={
                        selectedBiller
                      }
                      onValueChange={(
                        value,
                      ) =>
                        void handleBillerChange(
                          value,
                        )
                      }
                    >
                      <SelectTrigger className="mt-2 h-12 rounded-xl border-slate-200 bg-slate-50">
                        <SelectValue
                          placeholder={
                            isElectricity
                              ? "Select electricity company"
                              : "Select TV service"
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
                          ),
                        )}
                      </SelectContent>
                    </Select>
                  </CardContent>
                </Card>
              )}

            {isData && (
              <Card className="rounded-2xl border-slate-200 shadow-none">
                <CardContent className="p-5">
                  <div className="mb-4">
                    <p className="text-sm font-semibold text-slate-900">
                      Choose a data plan
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                      HOT contains all available plans.
                    </p>
                  </div>

                  <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
                    {DATA_TABS.map(
                      (tab) => (
                        <button
                          key={tab}
                          type="button"
                          onClick={() =>
                            setDataTab(
                              tab,
                            )
                          }
                          className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold transition ${
                            dataTab ===
                            tab
                              ? "bg-[#082A63] text-white shadow-sm"
                              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                          }`}
                        >
                          {tab}
                        </button>
                      ),
                    )}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {visibleDataPlans.length ===
                      0 && (
                      <div className="sm:col-span-2 lg:col-span-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                        <p className="text-sm font-semibold text-slate-700">
                          No plans found
                        </p>

                        <p className="mt-1 text-xs text-slate-500">
                          Try another category or network.
                        </p>
                      </div>
                    )}

                    {visibleDataPlans.map(
                      (item) => {
                        const code =
                          getItemCode(
                            item,
                          );

                        const selected =
                          selectedItemCode ===
                          code;

                        return (
                          <button
                            key={`${code}-${getItemSellingPrice(item)}`}
                            type="button"
                            onClick={() =>
                              setSelectedItemCode(
                                code,
                              )
                            }
                            className={`group rounded-2xl border p-4 text-left transition-all ${
                              selected
                                ? "border-[#082A63] bg-[#082A63]/5 ring-2 ring-[#082A63]/10"
                                : "border-slate-200 bg-white hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-bold text-slate-900">
                                  {getItemName(
                                    item,
                                  )}
                                </p>

                                {item.validity && (
                                  <p className="mt-1 text-xs text-slate-500">
                                    {
                                      item.validity
                                    }
                                  </p>
                                )}
                              </div>

                              <ChevronRight
                                className={`h-5 w-5 shrink-0 ${
                                  selected
                                    ? "text-[#082A63]"
                                    : "text-slate-300"
                                }`}
                              />
                            </div>

                            <div className="mt-4 flex items-end justify-between">
                              <p className="text-lg font-bold text-[#082A63]">
                                {money(
                                  getItemSellingPrice(
                                    item,
                                  ),
                                )}
                              </p>

                              {selected && (
                                <CheckCircle2 className="h-5 w-5 text-[#082A63]" />
                              )}
                            </div>
                          </button>
                        );
                      },
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {!isData &&
              !isSmile &&
              itemList.length >
                0 &&
              !isAirtime &&
              !isElectricity && (
                <Card className="rounded-2xl border-slate-200 shadow-none">
                  <CardContent className="p-5">
                    <Label className="text-sm font-semibold text-slate-900">
                      Select product
                    </Label>

                    <Select
                      value={
                        selectedItemCode
                      }
                      onValueChange={
                        setSelectedItemCode
                      }
                    >
                      <SelectTrigger className="mt-2 h-12 rounded-xl border-slate-200 bg-slate-50">
                        <SelectValue placeholder="Choose an option" />
                      </SelectTrigger>

                      <SelectContent>
                        {itemList.map(
                          (item, index) => {
                            const code =
                              getItemCode(
                                item,
                              );

                            return (
                              <SelectItem
                                key={`${code}-${index}`}
                                value={
                                  code
                                }
                              >
                                <span>
                                  {getItemName(
                                    item,
                                  )}
                                </span>
                              </SelectItem>
                            );
                          },
                        )}
                      </SelectContent>
                    </Select>
                  </CardContent>
                </Card>
              )}

            {isAirtime && (
              <Card className="rounded-2xl border-slate-200 shadow-none">
                <CardContent className="space-y-5 p-5">
                  <div>
                    <Label className="text-sm font-semibold text-slate-900">
                      Phone number
                    </Label>

                    <Input
                      value={phone}
                      onChange={(
                        event,
                      ) =>
                        setPhone(
                          cleanPhone(
                            event
                              .target
                              .value,
                          ),
                        )
                      }
                      inputMode="numeric"
                      placeholder="08012345678"
                      className="mt-2 h-12 rounded-xl bg-slate-50"
                    />
                  </div>

                  <div>
                    <Label className="text-sm font-semibold text-slate-900">
                      Airtime amount
                    </Label>

                    <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
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
                            key={
                              value
                            }
                            type="button"
                            onClick={() =>
                              setAmount(
                                String(
                                  value,
                                ),
                              )
                            }
                            className={`rounded-xl border px-3 py-3 text-xs font-bold transition ${
                              amount ===
                              String(
                                value,
                              )
                                ? "border-[#082A63] bg-[#082A63] text-white"
                                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                            }`}
                          >
                            ₦
                            {value.toLocaleString()}
                          </button>
                        ),
                      )}
                    </div>

                    <Input
                      value={amount}
                      onChange={(
                        event,
                      ) =>
                        setAmount(
                          event
                            .target
                            .value
                            .replace(
                              /\D/g,
                              "",
                            ),
                        )
                      }
                      inputMode="numeric"
                      placeholder="Or enter another amount"
                      className="mt-3 h-12 rounded-xl bg-slate-50"
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {isData && (
              <Card className="rounded-2xl border-slate-200 shadow-none">
                <CardContent className="p-5">
                  <Label className="text-sm font-semibold text-slate-900">
                    Phone number
                  </Label>

                  <Input
                    value={phone}
                    onChange={(
                      event,
                    ) =>
                      setPhone(
                        cleanPhone(
                          event
                            .target
                            .value,
                        ),
                      )
                    }
                    inputMode="numeric"
                    placeholder="08012345678"
                    className="mt-2 h-12 rounded-xl bg-slate-50"
                  />
                </CardContent>
              </Card>
            )}

            {isElectricity && (
              <>
                <Card className="rounded-2xl border-slate-200 shadow-none">
                  <CardContent className="space-y-5 p-5">
                    <div>
                      <Label className="text-sm font-semibold text-slate-900">
                        Meter type
                      </Label>

                      <Select
                        value={
                          meterType
                        }
                        onValueChange={
                          (
                            value,
                          ) => {
                            setMeterType(
                              value,
                            );
                            setVerifiedCustomer(
                              "",
                            );
                            setVerifiedType(
                              "",
                            );
                          }
                        }
                      >
                        <SelectTrigger className="mt-2 h-12 rounded-xl bg-slate-50">
                          <SelectValue />
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

                    <div>
                      <Label className="text-sm font-semibold text-slate-900">
                        Meter number
                      </Label>

                      <div className="mt-2 flex gap-2">
                        <Input
                          value={
                            meterNumber
                          }
                          onChange={(
                            event,
                          ) => {
                            setMeterNumber(
                              event
                                .target
                                .value
                                .replace(
                                  /\D/g,
                                  "",
                                ),
                            );
                            setVerifiedCustomer(
                              "",
                            );
                            setVerifiedType(
                              "",
                            );
                          }}
                          inputMode="numeric"
                          placeholder="Enter meter number"
                          className="h-12 rounded-xl bg-slate-50"
                        />

                        <Button
                          type="button"
                          variant="outline"
                          onClick={() =>
                            void verifyMeter()
                          }
                          disabled={
                            verifying
                          }
                          className="h-12 shrink-0 rounded-xl"
                        >
                          {verifying ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            "Verify"
                          )}
                        </Button>
                      </div>
                    </div>

                    {verifiedCustomer &&
                      verifiedType ===
                        "meter" && (
                        <div className="flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                          <CheckCircle2 className="h-5 w-5 text-emerald-600" />

                          <div>
                            <p className="text-xs font-semibold text-emerald-700">
                              Meter verified
                            </p>

                            <p className="mt-0.5 text-sm font-bold text-emerald-900">
                              {
                                verifiedCustomer
                              }
                            </p>
                          </div>
                        </div>
                      )}

                    <div>
                      <Label className="text-sm font-semibold text-slate-900">
                        Amount
                      </Label>

                      <Input
                        value={
                          amount
                        }
                        onChange={(
                          event,
                        ) =>
                          setAmount(
                            event
                              .target
                              .value
                              .replace(
                                /\D/g,
                                "",
                              ),
                          )
                        }
                        inputMode="numeric"
                        placeholder="Enter amount"
                        className="mt-2 h-12 rounded-xl bg-slate-50"
                      />
                    </div>
                  </CardContent>
                </Card>
              </>
            )}

            {isCable && (
              <Card className="rounded-2xl border-slate-200 shadow-none">
                <CardContent className="space-y-5 p-5">
                  <div>
                    <Label className="text-sm font-semibold text-slate-900">
                      Smartcard number
                    </Label>

                    <div className="mt-2 flex gap-2">
                      <Input
                        value={
                          smartcardNumber
                        }
                        onChange={(
                          event,
                        ) => {
                          setSmartcardNumber(
                            event
                              .target
                              .value
                              .replace(
                                /\D/g,
                                "",
                              ),
                          );

                          setVerifiedCustomer(
                            "",
                          );

                          setVerifiedType(
                            "",
                          );
                        }}
                        inputMode="numeric"
                        placeholder="Enter smartcard number"
                        className="h-12 rounded-xl bg-slate-50"
                      />

                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          void verifyCable()
                        }
                        disabled={
                          verifying
                        }
                        className="h-12 shrink-0 rounded-xl"
                      >
                        {verifying ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Verify"
                        )}
                      </Button>
                    </div>
                  </div>

                  {verifiedCustomer &&
                    verifiedType ===
                      "cable" && (
                      <div className="flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                        <CheckCircle2 className="h-5 w-5 text-emerald-600" />

                        <div>
                          <p className="text-xs font-semibold text-emerald-700">
                            Smartcard verified
                          </p>

                          <p className="mt-0.5 text-sm font-bold text-emerald-900">
                            {
                              verifiedCustomer
                            }
                          </p>
                        </div>
                      </div>
                    )}
                </CardContent>
              </Card>
            )}

            {(isAirtimeCard ||
              isDataCard) && (
              <Card className="rounded-2xl border-slate-200 shadow-none">
                <CardContent className="p-5">
                  <Label className="text-sm font-semibold text-slate-900">
                    Quantity
                  </Label>

                  <Input
                    value={
                      quantity
                    }
                    onChange={(
                      event,
                    ) =>
                      setQuantity(
                        event
                          .target
                          .value
                          .replace(
                            /\D/g,
                            "",
                          ),
                      )
                    }
                    inputMode="numeric"
                    placeholder="1"
                    className="mt-2 h-12 rounded-xl bg-slate-50"
                  />

                  <p className="mt-2 text-xs text-slate-500">
                    You can purchase up to 100 units
                    in one transaction.
                  </p>
                </CardContent>
              </Card>
            )}

            {isSmile && (
              <Card className="rounded-2xl border-slate-200 shadow-none">
                <CardContent className="space-y-5 p-5">
                  <div>
                    <Label className="text-sm font-semibold text-slate-900">
                      Smile account / mobile number
                    </Label>

                    <Input
                      value={
                        accountId
                      }
                      onChange={(
                        event,
                      ) =>
                        setAccountId(
                          event
                            .target
                            .value,
                        )
                      }
                      placeholder="Enter Smile account"
                      className="mt-2 h-12 rounded-xl bg-slate-50"
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {(isWaec ||
              isJamb) && (
              <Card className="rounded-2xl border-slate-200 shadow-none">
                <CardContent className="space-y-5 p-5">
                  {isJamb && (
                    <div>
                      <Label className="text-sm font-semibold text-slate-900">
                        Examination type
                      </Label>

                      <Select
                        value={
                          examType
                        }
                        onValueChange={
                          setExamType
                        }
                      >
                        <SelectTrigger className="mt-2 h-12 rounded-xl bg-slate-50">
                          <SelectValue placeholder="Select examination type" />
                        </SelectTrigger>

                        <SelectContent>
                          <SelectItem value="de">
                            Direct Entry
                          </SelectItem>

                          <SelectItem value="utme-mock">
                            UTME Mock
                          </SelectItem>

                          <SelectItem value="utme-no-mock">
                            UTME
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div>
                    <Label className="text-sm font-semibold text-slate-900">
                      Phone number
                    </Label>

                    <Input
                      value={
                        phone
                      }
                      onChange={(
                        event,
                      ) =>
                        setPhone(
                          cleanPhone(
                            event
                              .target
                              .value,
                          ),
                        )
                      }
                      inputMode="numeric"
                      placeholder="08012345678"
                      className="mt-2 h-12 rounded-xl bg-slate-50"
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {estimatedTotal >
              0 && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-medium text-slate-500">
                      Amount to pay
                    </p>

                    <p className="mt-1 text-2xl font-bold tracking-tight text-[#082A63]">
                      {money(
                        estimatedTotal,
                      )}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-white p-3 shadow-sm">
                    <ShieldCheck className="h-6 w-6 text-[#082A63]" />
                  </div>
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-[#082A63]/5 p-2.5">
                  <LockKeyhole className="h-5 w-5 text-[#082A63]" />
                </div>

                <div>
                  <p className="text-sm font-bold text-slate-900">
                    Secure payment
                  </p>

                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Your payment is protected by
                    IyanjuPay's secure transaction
                    process. You will confirm this
                    purchase with your payment PIN.
                  </p>
                </div>
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
              className="h-14 w-full rounded-2xl bg-[#082A63] text-base font-bold shadow-lg shadow-[#082A63]/15 hover:bg-[#061f4a]"
            >
              {purchaseLoading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  Continue
                  <ChevronRight className="ml-2 h-5 w-5" />
                </>
              )}
            </Button>

            <p className="flex items-center justify-center gap-2 text-center text-[11px] text-slate-400">
              <ShieldCheck className="h-3.5 w-3.5" />
              Secure IyanjuPay service transaction
            </p>
          </div>
        </div>
      </div>

      <Dialog
        open={showPinModal}
        onOpenChange={
          setShowPinModal
        }
      >
        <DialogContent className="max-w-sm rounded-3xl">
          <DialogHeader>
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#082A63]/5">
              <LockKeyhole className="h-6 w-6 text-[#082A63]" />
            </div>

            <DialogTitle className="text-center">
              Confirm payment
            </DialogTitle>

            <DialogDescription className="text-center">
              Enter your payment PIN to authorize
              this transaction.
            </DialogDescription>
          </DialogHeader>

          <div className="py-3">
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
              maxLength={6}
              autoComplete="off"
              value={
                paymentPin
              }
              onChange={(
                event,
              ) =>
                setPaymentPin(
                  event.target.value.replace(
                    /\D/g,
                    "",
                  ),
                )
              }
              placeholder="••••••"
              className="mt-2 h-12 rounded-xl text-center text-lg tracking-[0.4em]"
            />

            <div className="mt-4 rounded-xl bg-slate-50 p-3 text-center">
              <p className="text-xs text-slate-500">
                Total payment
              </p>

              <p className="mt-1 text-lg font-bold text-[#082A63]">
                {money(
                  estimatedTotal,
                )}
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setShowPinModal(
                  false,
                )
              }
              disabled={
                pinLoading
              }
              className="rounded-xl"
            >
              Cancel
            </Button>

            <Button
              type="button"
              onClick={() =>
                void confirmPurchase()
              }
              disabled={
                pinLoading ||
                paymentPin.length <
                  4
              }
              className="rounded-xl bg-[#082A63] hover:bg-[#061f4a]"
            >
              {pinLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                "Confirm payment"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ServicePayment;
