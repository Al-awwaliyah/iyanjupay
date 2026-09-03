import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ArrowLeft,
  ArrowRight,
  Check,
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
  UserRoundCheck,
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

const SERVICE_LABELS: Record<
  string,
  string
> = {
  airtime: "Airtime",
  data: "Mobile Data",
  electricity: "Electricity",
  cable: "Cable TV",
  "airtime-card": "Airtime E-Pin",
  "data-card": "Data E-Pin",
  smile: "Smile",
  waec: "WAEC",
  jamb: "JAMB",
  internet: "Internet",
  insurance: "Insurance",
  savings: "Savings",
};

const DATA_TABS = [
  "HOT",
  "Extra Night",
  "Daily",
  "Weekly",
  "Monthly",
];

const NETWORK_SERVICE_TYPES = new Set([
  "airtime",
  "data",
  "airtime-card",
  "data-card",
]);

const PREMIUM_SERVICE_TYPES = new Set([
  "airtime-card",
  "data-card",
  "smile",
  "waec",
  "jamb",
]);

const LIVE_SERVICE_TYPES = new Set([
  "airtime",
  "data",
  "electricity",
  "cable",
  "airtime-card",
  "data-card",
  "smile",
  "waec",
  "jamb",
]);

const money = (
  value: number,
): string => {
  return `₦${value.toLocaleString(
    "en-NG",
    {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    },
  )}`;
};

const numericValue = (
  value: unknown,
): number => {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (
    typeof value === "string" &&
    value.trim()
  ) {
    const parsed = Number(
      value
        .replace(/,/g, "")
        .replace(/[₦N\s]/gi, ""),
    );

    return Number.isFinite(parsed)
      ? parsed
      : 0;
  }

  return 0;
};

const cleanPhone = (
  value: string,
): string => {
  let phone = value.replace(
    /[^\d+]/g,
    "",
  );

  if (phone.startsWith("+234")) {
    phone = `0${phone.slice(4)}`;
  } else if (
    phone.startsWith("234")
  ) {
    phone = `0${phone.slice(3)}`;
  }

  return phone;
};

const normalizeServiceType = (
  value: string,
): string => {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");
};

const toCatalogueArray = (
  value: any,
): any[] => {
  if (Array.isArray(value)) {
    return value;
  }

  if (
    value &&
    typeof value === "object"
  ) {
    const result: any[] = [];

    for (const [key, item] of Object.entries(
      value,
    )) {
      if (Array.isArray(item)) {
        result.push(...item);
      } else if (
        item &&
        typeof item === "object"
      ) {
        const record =
          item as Record<string, any>;

        result.push({
          ...record,
          __mapKey: key,
        });
      }
    }

    return result;
  }

  return [];
};

const getItemCode = (
  item: CatalogueItem,
): string => {
  return String(
    item.code ??
      item.productCode ??
      item.product_code ??
      item.planCode ??
      item.plan_code ??
      item.variationCode ??
      item.variation_code ??
      item.code2 ??
      "",
  ).trim();
};

const getItemName = (
  item: CatalogueItem,
): string => {
  return String(
    item.name ??
      item.productName ??
      item.product_name ??
      item.planName ??
      item.plan_name ??
      item.packageName ??
      item.package_name ??
      item.title ??
      item.label ??
      getItemCode(item),
  ).trim();
};

const getItemProviderPrice = (
  item: CatalogueItem,
): number => {
  return numericValue(
    item.providerPrice ??
      item.provider_price ??
      item.providerAmount ??
      item.provider_amount ??
      item.amount ??
      item.value ??
      0,
  );
};

const getItemSellingPrice = (
  item: CatalogueItem,
): number => {
  const explicitSellingPrice =
    numericValue(
      item.price ??
        item.sellingPrice ??
        item.selling_price ??
        item.salePrice ??
        0,
    );

  if (explicitSellingPrice > 0) {
    return explicitSellingPrice;
  }

  return getItemProviderPrice(item);
};

const getNetworkCode = (
  network: CatalogueNetwork,
): string => {
  return String(
    network.networkCode ??
      network.network_code ??
      network.code ??
      network.id ??
      network.value ??
      "",
  ).trim();
};

const getNetworkName = (
  network: CatalogueNetwork,
): string => {
  return String(
    network.name ??
      network.network ??
      network.company ??
      network.label ??
      network.value ??
      getNetworkCode(network),
  ).trim();
};

const getBillerCode = (
  biller: CatalogueNetwork,
): string => {
  return String(
    biller.billerCode ??
      biller.biller_code ??
      biller.code ??
      biller.id ??
      biller.value ??
      "",
  ).trim();
};

const getBillerName = (
  biller: CatalogueNetwork,
): string => {
  return String(
    biller.name ??
      biller.company ??
      biller.network ??
      biller.label ??
      biller.value ??
      getBillerCode(biller),
  ).trim();
};

const getLogo = (
  network: CatalogueNetwork,
): string => {
  return String(
    network.logo ??
      network.logo_url ??
      network.logoUrl ??
      network.image ??
      network.image_url ??
      network.imageUrl ??
      network.icon ??
      "",
  ).trim();
};

const getInitials = (
  value: string,
): string => {
  const words = value
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 1) {
    return words[0]
      .slice(0, 2)
      .toUpperCase();
  }

  return words
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
};

const isInvalidCustomerName = (
  value: string,
): boolean => {
  const normalized =
    value.trim().toUpperCase();

  return (
    !normalized ||
    normalized.includes("INVALID") ||
    normalized.includes("NOT FOUND") ||
    normalized.includes("NOTFOUND") ||
    normalized.includes("ERROR")
  );
};

const getDataTab = (
  item: CatalogueItem,
): string => {
  const explicit = String(
    item.tab ??
      item.category ??
      item.categoryName ??
      item.category_name ??
      "",
  )
    .trim()
    .toLowerCase();

  const validity = String(
    item.validity ?? "",
  )
    .trim()
    .toLowerCase();

  const combined =
    `${explicit} ${validity} ${getItemName(item)}`.toLowerCase();

  if (
    combined.includes("night") ||
    combined.includes("midnight")
  ) {
    return "Extra Night";
  }

  if (
    combined.includes("weekly") ||
    /\b7\s*day/.test(combined)
  ) {
    return "Weekly";
  }

  if (
    combined.includes("monthly") ||
    /\b30\s*day/.test(combined) ||
    /\b30days?/.test(combined)
  ) {
    return "Monthly";
  }

  if (
    combined.includes("daily") ||
    /\b1\s*day/.test(combined) ||
    /\b24\s*hour/.test(combined)
  ) {
    return "Daily";
  }

  return "HOT";
};

const extractNetworks = (
  response: CatalogueResponse,
): CatalogueNetwork[] => {
  const direct =
    response.networks ??
    response.providers ??
    response.data?.networks ??
    response.data?.providers ??
    response.data?.network ??
    response.data?.MOBILE_NETWORK ??
    response.MOBILE_NETWORK ??
    [];

  const candidates =
    toCatalogueArray(direct);

  const result: CatalogueNetwork[] = [];

  for (const candidate of candidates) {
    if (
      !candidate ||
      typeof candidate !== "object"
    ) {
      continue;
    }

    const record =
      candidate as CatalogueNetwork;

    const code = getNetworkCode(record);
    const name = getNetworkName(record);

    if (!code && !name) {
      continue;
    }

    result.push({
      ...record,
      code: code || name,
      name: name || code,
    });
  }

  const seen = new Set<string>();

  return result.filter((item) => {
    const key =
      getNetworkCode(item) ||
      getNetworkName(item);

    if (
      !key ||
      seen.has(key.toLowerCase())
    ) {
      return false;
    }

    seen.add(
      key.toLowerCase(),
    );

    return true;
  });
};

const extractBillers = (
  response: CatalogueResponse,
): CatalogueNetwork[] => {
  const direct =
    response.billers ??
    response.data?.billers ??
    response.data?.companies ??
    response.data?.providers ??
    [];

  return toCatalogueArray(
    direct,
  ).filter(
    (item): item is CatalogueNetwork =>
      Boolean(
        item &&
          typeof item === "object",
      ),
  );
};

const extractItems = (
  response: CatalogueResponse,
): CatalogueItem[] => {
  const direct =
    response.items ??
    response.data?.items ??
    [];

  return toCatalogueArray(
    direct,
  ).filter(
    (item): item is CatalogueItem =>
      Boolean(
        item &&
          typeof item === "object",
      ),
  );
};

const extractPlans = (
  response: CatalogueResponse,
): CatalogueItem[] => {
  const direct =
    response.plans ??
    response.data?.plans ??
    response.data?.packages ??
    response.data?.products ??
    [];

  return toCatalogueArray(
    direct,
  ).filter(
    (item): item is CatalogueItem =>
      Boolean(
        item &&
          typeof item === "object",
      ),
  );
};

const normalizeNetwork = (
  network: CatalogueNetwork,
): CatalogueNetwork => {
  const code =
    getNetworkCode(network);

  const name =
    getNetworkName(network);

  return {
    ...network,
    code: code || name,
    name: name || code,
    networkCode:
      network.networkCode ??
      network.network_code ??
      code,
  };
};

const serviceIcon = (
  serviceType: string,
) => {
  switch (serviceType) {
    case "airtime":
      return Phone;

    case "data":
    case "data-card":
      return Wifi;

    case "electricity":
      return Zap;

    case "cable":
      return Tv;

    case "airtime-card":
      return Smartphone;

    case "smile":
      return Wifi;

    case "waec":
    case "jamb":
      return CheckCircle2;

    default:
      return Smartphone;
  }
};

const getServiceDescription = (
  serviceType: string,
): string => {
  switch (serviceType) {
    case "airtime":
      return "Recharge any Nigerian mobile line";

    case "data":
      return "Fast and affordable data bundles";

    case "electricity":
      return "Pay your electricity bill instantly";

    case "cable":
      return "Renew your TV subscription";

    case "airtime-card":
      return "Generate recharge PINs instantly";

    case "data-card":
      return "Generate data PINs instantly";

    case "smile":
      return "Recharge your Smile account";

    case "waec":
      return "Purchase your WAEC PIN securely";

    case "jamb":
      return "Purchase your JAMB service securely";

    default:
      return "Complete your service purchase";
  }
};

const getMarkupRate = (
  serviceType: string,
): number => {
  if (serviceType === "airtime") {
    return 0;
  }

  if (
    PREMIUM_SERVICE_TYPES.has(
      serviceType,
    )
  ) {
    return 0.2;
  }

  return 0.15;
};

const ServicePayment = ({
  service,
  walletBalance: _walletBalance,
  onBack,
  onPurchase,
  onHistory,
}: ServicePaymentProps) => {
  const serviceType =
    normalizeServiceType(
      service?.type ?? "",
    );

  const serviceTitle =
    service?.title ||
    SERVICE_LABELS[
      serviceType
    ] ||
    "Service";

  const Icon =
    serviceIcon(
      serviceType,
    );

  const comingSoon =
    COMING_SOON_SERVICES.has(
      serviceType,
    );

  const supported =
    LIVE_SERVICE_TYPES.has(
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

  const [recipientPhone, setRecipientPhone] =
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

  const [examType, setExamType] =
    useState("");

  const [accountId, setAccountId] =
    useState("");

  const [verifying, setVerifying] =
    useState(false);

  const [verifiedCustomer, setVerifiedCustomer] =
    useState("");

  const [verifiedType, setVerifiedType] =
    useState<
      "" |
      "meter" |
      "cable" |
      "smile"
    >("");

  const [purchaseLoading, setPurchaseLoading] =
    useState(false);

  const [showPinModal, setShowPinModal] =
    useState(false);

  const [paymentPin, setPaymentPin] =
    useState("");

  const [pinLoading, setPinLoading] =
    useState(false);

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

        if (
          !data ||
          typeof data !== "object"
        ) {
          throw new Error(
            "Invalid service catalogue response.",
          );
        }

        const response =
          data as CatalogueResponse;

        if (
          response.success === false
        ) {
          throw new Error(
            response.error ||
              response.message ||
              "Unable to load service catalogue.",
          );
        }

        return response;
      },
      [serviceType],
    );

  const resetCatalogueState =
    useCallback(() => {
      setNetworks([]);
      setBillers([]);
      setItems([]);
      setPlans([]);
      setSelectedNetwork("");
      setSelectedBiller("");
      setSelectedItemCode("");
      setDataTab("HOT");
      setCatalogueError("");
      setVerifiedCustomer("");
      setVerifiedType("");
    }, []);

  const loadCatalogue =
    useCallback(
      async () => {
        if (
          !supported ||
          comingSoon ||
          !serviceType
        ) {
          return;
        }

        setLoadingCatalogue(true);
        setCatalogueError("");

        try {
          const response =
            await invokeCatalogue();

          const extractedNetworks =
            extractNetworks(response)
              .map(normalizeNetwork);

          const extractedBillers =
            extractBillers(response)
              .map(normalizeNetwork);

          const extractedItems =
            extractItems(response);

          const extractedPlans =
            extractPlans(response);

          setNetworks(
            extractedNetworks,
          );

          setBillers(
            extractedBillers,
          );

          setItems(
            extractedItems,
          );

          setPlans(
            extractedPlans,
          );

          if (
            extractedNetworks.length > 0
          ) {
            if (
              serviceType === "smile"
            ) {
              setSelectedNetwork(
                getNetworkCode(
                  extractedNetworks[0],
                ),
              );
            }
          }

          if (
            extractedBillers.length === 1
          ) {
            setSelectedBiller(
              getBillerCode(
                extractedBillers[0],
              ),
            );
          }

          const combined = [
            ...extractedItems,
            ...extractedPlans,
          ];

          const unique =
            combined.filter(
              (
                item,
                index,
                array,
              ) => {
                const code =
                  getItemCode(item);

                return (
                  code &&
                  array.findIndex(
                    (candidate) =>
                      getItemCode(
                        candidate,
                      ) === code,
                  ) === index
                );
              },
            );

          if (
            unique.length === 1
          ) {
            setSelectedItemCode(
              getItemCode(
                unique[0],
              ),
            );
          }
        } catch (error) {
          console.error(
            "Catalogue loading error:",
            error,
          );

          setCatalogueError(
            error instanceof Error
              ? error.message
              : "Unable to load services right now.",
          );
        } finally {
          setLoadingCatalogue(
            false,
          );
        }
      },
      [
        comingSoon,
        invokeCatalogue,
        serviceType,
        supported,
      ],
    );

  useEffect(() => {
    resetCatalogueState();

    if (
      supported &&
      !comingSoon
    ) {
      void loadCatalogue();
    }
  }, [
    comingSoon,
    loadCatalogue,
    resetCatalogueState,
    serviceType,
    supported,
  ]);

  const loadNetworkCatalogue =
    useCallback(
      async (
        networkCode?: string,
        billerCode?: string,
      ) => {
        if (!serviceType) {
          return;
        }

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

          const extractedNetworks =
            extractNetworks(response)
              .map(normalizeNetwork);

          const extractedBillers =
            extractBillers(response)
              .map(normalizeNetwork);

          const extractedItems =
            extractItems(response);

          const extractedPlans =
            extractPlans(response);

          if (
            extractedNetworks.length > 0
          ) {
            setNetworks(
              extractedNetworks,
            );
          }

          if (
            extractedBillers.length > 0
          ) {
            setBillers(
              extractedBillers,
            );
          }

          setItems(
            extractedItems,
          );

          setPlans(
            extractedPlans,
          );

          const combined = [
            ...extractedItems,
            ...extractedPlans,
          ];

          if (
            combined.length === 1
          ) {
            setSelectedItemCode(
              getItemCode(
                combined[0],
              ),
            );
          }
        } catch (error) {
          console.error(
            "Catalogue filtering error:",
            error,
          );

          setCatalogueError(
            error instanceof Error
              ? error.message
              : "Unable to load the selected options.",
          );
        } finally {
          setLoadingCatalogue(
            false,
          );
        }
      },
      [
        invokeCatalogue,
        serviceType,
      ],
    );

  const handleNetworkChange =
    async (
      value: string,
    ) => {
      setSelectedNetwork(value);
      setSelectedItemCode("");
      setVerifiedCustomer("");
      setVerifiedType("");

      if (
        serviceType === "data" ||
        serviceType ===
          "data-card"
      ) {
        /*
         * Important:
         * Network selection sends network_code only.
         * It must not send biller_code as network_code.
         */
        await loadNetworkCatalogue(
          value,
          undefined,
        );
      }
    };

  const handleBillerChange =
    async (
      value: string,
    ) => {
      setSelectedBiller(value);
      setSelectedItemCode("");
      setVerifiedCustomer("");
      setVerifiedType("");

      await loadNetworkCatalogue(
        undefined,
        value,
      );
    };

  const selectedItem =
    useMemo(() => {
      const combined = [
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
      const source =
        plans.length > 0
          ? plans
          : items;

      const seen =
        new Set<string>();

      return source.filter(
        (item) => {
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
        },
      );
    }, [
      items,
      plans,
    ]);

  const visibleDataPlans =
    useMemo(() => {
      if (
        dataTab === "HOT"
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
    serviceType === "data"
      ? visibleDataPlans
      : [
          ...items,
          ...plans,
        ].filter(
          (
            item,
            index,
            array,
          ) =>
            array.findIndex(
              (candidate) =>
                getItemCode(
                  candidate,
                ) ===
                getItemCode(item),
            ) === index,
        );

  /*
   * Backend catalogue prices are already customer selling
   * prices. Never apply markup a second time here.
   */
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

  const quantityNumber = Math.max(
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
    serviceType === "airtime"
      ? amountNumber
      : serviceType ===
          "electricity"
      ? amountNumber
      : serviceType ===
            "airtime-card" ||
          serviceType ===
            "data-card"
      ? selectedSellingPrice *
        quantityNumber
      : selectedSellingPrice;

  const estimatedProviderTotal =
    serviceType ===
        "airtime-card" ||
      serviceType === "data-card"
      ? selectedProviderPrice *
        quantityNumber
      : serviceType === "airtime" ||
          serviceType ===
            "electricity"
      ? amountNumber
      : selectedProviderPrice;

  const markupRate =
    getMarkupRate(
      serviceType,
    );

  const hasNetworkSelector =
    NETWORK_SERVICE_TYPES.has(
      serviceType,
    );

  const hasBillerSelector =
    serviceType ===
      "electricity" ||
    serviceType === "cable";

  const showItemSelector =
    serviceType !==
      "airtime" &&
    serviceType !==
      "electricity" &&
    serviceType !==
      "smile";

  const validate =
    useCallback((): boolean => {
      if (!supported) {
        toast.error(
          "This service is not available yet.",
        );
        return false;
      }

      if (comingSoon) {
        toast.info(
          "This service is coming soon.",
        );
        return false;
      }

      if (
        serviceType === "airtime"
      ) {
        const cleaned =
          cleanPhone(
            phone,
          );

        if (
          !selectedNetwork
        ) {
          toast.error(
            "Select a network.",
          );
          return false;
        }

        if (
          !/^0\d{10}$/.test(
            cleaned,
          )
        ) {
          toast.error(
            "Enter a valid Nigerian phone number.",
          );
          return false;
        }

        if (
          amountNumber < 50 ||
          amountNumber > 200000
        ) {
          toast.error(
            "Airtime amount must be between ₦50 and ₦200,000.",
          );
          return false;
        }
      }

      if (
        serviceType === "data"
      ) {
        if (
          !selectedNetwork
        ) {
          toast.error(
            "Select a network.",
          );
          return false;
        }

        if (
          !selectedItem
        ) {
          toast.error(
            "Select a data plan.",
          );
          return false;
        }

        if (
          !/^0\d{10}$/.test(
            cleanPhone(phone),
          )
        ) {
          toast.error(
            "Enter a valid Nigerian phone number.",
          );
          return false;
        }
      }

      if (
        serviceType ===
        "electricity"
      ) {
        if (
          !selectedBiller
        ) {
          toast.error(
            "Select an electricity company.",
          );
          return false;
        }

        if (
          !meterType
        ) {
          toast.error(
            "Select a meter type.",
          );
          return false;
        }

        if (
          !meterNumber.trim()
        ) {
          toast.error(
            "Enter your meter number.",
          );
          return false;
        }

        if (
          !verifiedCustomer ||
          verifiedType !==
            "meter"
        ) {
          toast.error(
            "Verify your meter before continuing.",
          );
          return false;
        }

        if (
          amountNumber < 100
        ) {
          toast.error(
            "Enter a valid electricity amount.",
          );
          return false;
        }
      }

      if (
        serviceType === "cable"
      ) {
        if (
          !selectedBiller
        ) {
          toast.error(
            "Select a TV service.",
          );
          return false;
        }

        if (
          !selectedItem
        ) {
          toast.error(
            "Select a package.",
          );
          return false;
        }

        if (
          !smartcardNumber.trim()
        ) {
          toast.error(
            "Enter your smartcard number.",
          );
          return false;
        }

        if (
          !verifiedCustomer ||
          verifiedType !==
            "cable"
        ) {
          toast.error(
            "Verify your smartcard before continuing.",
          );
          return false;
        }
      }

      if (
        serviceType ===
          "airtime-card" ||
        serviceType ===
          "data-card"
      ) {
        if (
          !selectedNetwork
        ) {
          toast.error(
            "Select a network.",
          );
          return false;
        }

        if (
          !selectedItem
        ) {
          toast.error(
            "Select a product.",
          );
          return false;
        }

        if (
          quantityNumber < 1 ||
          quantityNumber > 100
        ) {
          toast.error(
            "Quantity must be between 1 and 100.",
          );
          return false;
        }
      }

      if (
        serviceType === "smile"
      ) {
        if (
          !accountId.trim()
        ) {
          toast.error(
            "Enter your Smile account number.",
          );
          return false;
        }

        if (
          !selectedItem
        ) {
          toast.error(
            "Select a Smile package.",
          );
          return false;
        }
      }

      if (
        serviceType === "waec"
      ) {
        if (
          !selectedItem
        ) {
          toast.error(
            "Select a WAEC package.",
          );
          return false;
        }

        if (
          phone &&
          !/^0\d{10}$/.test(
            cleanPhone(phone),
          )
        ) {
          toast.error(
            "Enter a valid Nigerian phone number.",
          );
          return false;
        }
      }

      if (
        serviceType === "jamb"
      ) {
        if (
          !examType
        ) {
          toast.error(
            "Select an examination type.",
          );
          return false;
        }

        if (
          phone &&
          !/^0\d{10}$/.test(
            cleanPhone(phone),
          )
        ) {
          toast.error(
            "Enter a valid Nigerian phone number.",
          );
          return false;
        }
      }

      if (
        estimatedTotal <= 0
      ) {
        toast.error(
          "Select a valid service option.",
        );
        return false;
      }

      return true;
    }, [
      accountId,
      amountNumber,
      comingSoon,
      estimatedTotal,
      examType,
      meterNumber,
      meterType,
      phone,
      quantityNumber,
      selectedBiller,
      selectedItem,
      selectedNetwork,
      serviceType,
      smartcardNumber,
      supported,
      verifiedCustomer,
      verifiedType,
    ]);

  const buildPurchaseDetails =
    useCallback(() => {
      const itemCode =
        selectedItem
          ? getItemCode(
              selectedItem,
            )
          : "";

      const itemName =
        selectedItem
          ? getItemName(
              selectedItem,
            )
          : "";

      const network =
        networks.find(
          (item) =>
            getNetworkCode(
              item,
            ) ===
            selectedNetwork,
        );

      const biller =
        billers.find(
          (item) =>
            getBillerCode(
              item,
            ) ===
            selectedBiller,
        );

      const details: Record<
        string,
        any
      > = {
        type: serviceType,
        service: serviceType,

        customer: serviceTitle,
        customer_id: accountId,

        /*
         * These are deliberately included together because
         * the Edge Function accepts both the modern camelCase
         * and legacy snake_case contract.
         */
        selling_amount:
          estimatedTotal,
        sellingAmount:
          estimatedTotal,

        provider_amount:
          estimatedProviderTotal,
        providerAmount:
          estimatedProviderTotal,

        provider_price:
          serviceType ===
              "airtime" ||
            serviceType ===
              "electricity"
            ? estimatedProviderTotal
            : selectedProviderPrice,
        providerPrice:
          serviceType ===
              "airtime" ||
            serviceType ===
              "electricity"
            ? estimatedProviderTotal
            : selectedProviderPrice,

        item_code:
          itemCode,
        itemCode,

        product_code:
          selectedItem?.productCode ??
          selectedItem?.product_code ??
          itemCode,

        variation_code:
          selectedItem?.variationCode ??
          selectedItem?.variation_code ??
          "",

        plan_code:
          selectedItem?.planCode ??
          selectedItem?.plan_code ??
          itemCode,

        package_code:
          itemCode,

        package_name:
          itemName,

        network_code:
          selectedNetwork,
        networkCode:
          selectedNetwork,

        mobile_network:
          selectedNetwork,

        biller_code:
          selectedBiller,
        billerCode:
          selectedBiller,

        quantity:
          quantityNumber,

        phone:
          cleanPhone(
            phone,
          ),
        phoneNumber:
          cleanPhone(
            phone,
          ),

        recipient_phone:
          cleanPhone(
            recipientPhone ||
              phone,
          ),

        markup:
          markupRate,
      };

      if (
        network
      ) {
        details.network_name =
          getNetworkName(
            network,
          );
      }

      if (
        biller
      ) {
        details.biller_name =
          getBillerName(
            biller,
          );
      }

      if (
        serviceType ===
        "airtime"
      ) {
        details.amount =
          amountNumber;
        details.selling_amount =
          amountNumber;
        details.sellingAmount =
          amountNumber;

        /*
         * Airtime has 0% markup.
         */
        details.provider_price =
          amountNumber;
        details.providerPrice =
          amountNumber;
        details.provider_amount =
          amountNumber;
        details.providerAmount =
          amountNumber;
      }

      if (
        serviceType === "data"
      ) {
        details.data_plan =
          itemCode;
        details.dataPlan =
          itemCode;

        details.amount =
          selectedProviderPrice;
      }

      if (
        serviceType ===
        "electricity"
      ) {
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

        details.phone =
          cleanPhone(
            phone,
          );
        details.phoneNumber =
          cleanPhone(
            phone,
          );
      }

      if (
        serviceType === "cable"
      ) {
        details.cable_tv =
          selectedBiller;

        details.cable_code =
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

        details.amount =
          selectedProviderPrice;
      }

      if (
        serviceType ===
        "airtime-card"
      ) {
        details.value =
          selectedProviderPrice;

        details.quantity =
          quantityNumber;

        delete details.phone;
        delete details.phoneNumber;
        delete details.recipient_phone;
      }

      if (
        serviceType ===
        "data-card"
      ) {
        details.data_plan =
          itemCode;

        details.dataPlan =
          itemCode;

        details.quantity =
          quantityNumber;

        delete details.phone;
        delete details.phoneNumber;
        delete details.recipient_phone;
      }

      if (
        serviceType ===
        "smile"
      ) {
        details.cable_tv =
          undefined;

        details.network_code =
          "smile-direct";

        details.networkCode =
          "smile-direct";

        details.mobile_network =
          "smile-direct";

        details.account_id =
          accountId.trim();

        details.accountId =
          accountId.trim();

        details.mobile_number =
          accountId.trim();

        details.mobileNumber =
          accountId.trim();

        details.data_plan =
          itemCode;

        details.dataPlan =
          itemCode;
      }

      if (
        serviceType === "waec"
      ) {
        details.exam_type =
          itemCode;

        details.examType =
          itemCode;
      }

      if (
        serviceType === "jamb"
      ) {
        details.exam_type =
          examType;

        details.examType =
          examType;

        if (
          itemCode
        ) {
          details.package_code =
            itemCode;
          details.packageCode =
            itemCode;
        }
      }

      return details;
    }, [
      accountId,
      amountNumber,
      billers,
      estimatedProviderTotal,
      estimatedTotal,
      itemName,
      markupRate,
      meterNumber,
      meterType,
      networks,
      phone,
      quantityNumber,
      recipientPhone,
      selectedBiller,
      selectedItem,
      selectedNetwork,
      selectedProviderPrice,
      serviceTitle,
      serviceType,
      smartcardNumber,
      examType,
    ]);

  const verifyMeter =
    async () => {
      if (
        !selectedBiller ||
        !meterType ||
        !meterNumber.trim()
      ) {
        toast.error(
          "Complete your meter details first.",
        );
        return;
      }

      setVerifying(true);
      setVerifiedCustomer("");
      setVerifiedType("");

      try {
        const { data, error } =
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

        const response =
          data as VerificationResponse;

        const customerName =
          String(
            response.customer_name ??
              response.customerName ??
              "",
          ).trim();

        if (
          response.success !==
            true ||
          isInvalidCustomerName(
            customerName,
          )
        ) {
          throw new Error(
            response.message ||
              response.error ||
              "Unable to verify this meter.",
          );
        }

        setVerifiedCustomer(
          customerName,
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
            : "Meter verification failed.",
        );
      } finally {
        setVerifying(false);
      }
    };

  const verifyCable =
    async () => {
      if (
        !selectedBiller ||
        !smartcardNumber.trim()
      ) {
        toast.error(
          "Enter your smartcard number first.",
        );
        return;
      }

      setVerifying(true);
      setVerifiedCustomer("");
      setVerifiedType("");

      try {
        const { data, error } =
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

        const response =
          data as VerificationResponse;

        const customerName =
          String(
            response.customer_name ??
              response.customerName ??
              "",
          ).trim();

        if (
          response.success !==
            true ||
          isInvalidCustomerName(
            customerName,
          )
        ) {
          throw new Error(
            response.message ||
              response.error ||
              "Unable to verify this smartcard.",
          );
        }

        setVerifiedCustomer(
          customerName,
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
            : "Smartcard verification failed.",
        );
      } finally {
        setVerifying(false);
      }
    };

  const verifyPaymentPin =
    async (
      pin: string,
    ): Promise<boolean> => {
      try {
        const { data, error } =
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
          data === true ||
          data?.success === true
        ) {
          return true;
        }

        toast.error(
          "Incorrect payment PIN.",
        );

        return false;
      } catch (error) {
        console.error(
          "PIN verification error:",
          error,
        );

        toast.error(
          "Unable to verify your payment PIN.",
        );

        return false;
      }
    };

  const handlePurchase =
    () => {
      if (
        !validate()
      ) {
        return;
      }

      setPaymentPin("");
      setShowPinModal(true);
    };

  const confirmPurchase =
    async () => {
      if (
        !/^\d{4,6}$/.test(
          paymentPin,
        )
      ) {
        toast.error(
          "Enter your payment PIN.",
        );
        return;
      }

      setPinLoading(true);

      try {
        const valid =
          await verifyPaymentPin(
            paymentPin,
          );

        if (!valid) {
          return;
        }

        setPinLoading(false);
        setShowPinModal(false);
        setPurchaseLoading(true);

        const details =
          buildPurchaseDetails();

        details.payment_pin =
          paymentPin;

        /*
         * onPurchase receives the customer selling amount.
         * For Airtime this is exactly the entered amount
         * because Airtime markup is 0%.
         */
        await onPurchase(
          estimatedTotal,
          details,
        );

        setPaymentPin("");
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Purchase could not be completed.",
        );
      } finally {
        setPinLoading(false);
        setPurchaseLoading(false);
      }
    };

  const networkOptions =
    networks.filter(
      (network) =>
        Boolean(
          getNetworkCode(
            network,
          ),
        ),
    );

  const billerOptions =
    billers.filter(
      (biller) =>
        Boolean(
          getBillerCode(
            biller,
          ),
        ),
    );

  const selectedNetworkObject =
    networkOptions.find(
      (network) =>
        getNetworkCode(
          network,
        ) === selectedNetwork,
    );

  const selectedBillerObject =
    billerOptions.find(
      (biller) =>
        getBillerCode(
          biller,
        ) === selectedBiller,
    );

  const renderNetworkIcon =
    (
      network: CatalogueNetwork,
    ) => {
      const logo =
        getLogo(network);

      if (logo) {
        return (
          <img
            src={logo}
            alt=""
            className="h-10 w-10 rounded-xl object-contain"
            onError={(event) => {
              event.currentTarget.style.display =
                "none";
            }}
          />
        );
      }

      return (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#082A63]/10 text-xs font-bold text-[#082A63]">
          {getInitials(
            getNetworkName(
              network,
            ),
          )}
        </div>
      );
    };

  if (
    !service
  ) {
    return null;
  }

  if (
    comingSoon
  ) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-3xl px-4 py-5 sm:px-6 lg:px-8">
          <div className="mb-6 flex items-center justify-between">
            <button
              type="button"
              onClick={onBack}
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50"
              aria-label="Go back"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>

            <span className="rounded-full bg-[#F4B400]/15 px-3 py-1.5 text-xs font-bold text-[#9A6A00]">
              Coming Soon
            </span>

            <div className="w-11" />
          </div>

          <Card className="overflow-hidden rounded-[2rem] border-0 bg-white shadow-xl shadow-slate-200/60">
            <div className="bg-gradient-to-br from-[#082A63] via-[#0B3A84] to-[#1453A6] px-6 py-10 text-white sm:px-10 sm:py-14">
              <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20">
                <Icon className="h-8 w-8" />
              </div>

              <p className="mb-2 text-sm font-medium text-blue-100">
                IyanjuPay Services
              </p>

              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                {serviceTitle}
              </h1>

              <p className="mt-3 max-w-xl text-sm leading-6 text-blue-100 sm:text-base">
                {getServiceDescription(
                  serviceType,
                )}
              </p>
            </div>

            <CardContent className="p-6 sm:p-10">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <div className="flex gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#F4B400]/15 text-[#A56F00]">
                    <Clock3 className="h-5 w-5" />
                  </div>

                  <div>
                    <h2 className="font-semibold text-slate-900">
                      We are preparing this service
                    </h2>

                    <p className="mt-1 text-sm leading-6 text-slate-500">
                      {serviceTitle} will be available
                      on IyanjuPay soon.
                    </p>
                  </div>
                </div>
              </div>

              <Button
                type="button"
                onClick={onBack}
                className="mt-6 h-12 w-full rounded-xl bg-[#082A63] font-semibold hover:bg-[#061F49]"
              >
                Back to Services
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-10">
      <div className="mx-auto max-w-5xl px-4 pt-4 sm:px-6 lg:px-8">
        <div className="mb-5 flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50"
            aria-label="Go back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          <div className="text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              IyanjuPay
            </p>
            <h1 className="mt-0.5 text-lg font-bold text-slate-900">
              {serviceTitle}
            </h1>
          </div>

          {onHistory ? (
            <button
              type="button"
              onClick={onHistory}
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50"
              aria-label="View history"
            >
              <History className="h-5 w-5" />
            </button>
          ) : (
            <div className="w-11" />
          )}
        </div>

        <div className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#082A63] via-[#0A397E] to-[#1557AA] shadow-xl shadow-[#082A63]/15">
          <div className="relative overflow-hidden px-5 py-7 text-white sm:px-8 sm:py-9">
            <div className="absolute -right-16 -top-20 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
            <div className="absolute -bottom-24 left-1/3 h-52 w-52 rounded-full bg-[#F4B400]/10 blur-3xl" />

            <div className="relative flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20 backdrop-blur">
                <Icon className="h-7 w-7" />
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-[0.15em] text-blue-100">
                  Secure service
                </p>

                <h2 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
                  {serviceTitle}
                </h2>

                <p className="mt-1 text-sm text-blue-100">
                  {getServiceDescription(
                    serviceType,
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>

        {catalogueError && (
          <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4">
            <div className="flex gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600">
                <RefreshCw className="h-5 w-5" />
              </div>

              <div className="min-w-0 flex-1">
                <p className="font-semibold text-red-900">
                  Unable to load the service
                </p>

                <p className="mt-1 text-sm leading-5 text-red-700">
                  {catalogueError}
                </p>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    void loadCatalogue()
                  }
                  className="mt-3 rounded-xl border-red-200 bg-white text-red-700 hover:bg-red-50"
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Try Again
                </Button>
              </div>
            </div>
          </div>
        )}

        {loadingCatalogue && (
          <div className="mt-5 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <Loader2 className="h-5 w-5 animate-spin text-[#082A63]" />
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Loading available options
              </p>
              <p className="text-xs text-slate-500">
                Getting the latest service catalogue…
              </p>
            </div>
          </div>
        )}

        <div className="mt-5 space-y-5">
          {hasNetworkSelector &&
            serviceType !== "smile" && (
              <Card className="rounded-[1.5rem] border-slate-200 bg-white shadow-sm">
                <CardContent className="p-5 sm:p-6">
                  <div className="mb-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#082A63]">
                      Network
                    </p>

                    <h3 className="mt-1 text-lg font-bold text-slate-900">
                      Choose your network
                    </h3>
                  </div>

                  {networkOptions.length ===
                  0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                      No networks are currently
                      available.
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {networkOptions.map(
                        (network) => {
                          const code =
                            getNetworkCode(
                              network,
                            );

                          const active =
                            selectedNetwork ===
                            code;

                          return (
                            <button
                              key={code}
                              type="button"
                              onClick={() =>
                                void handleNetworkChange(
                                  code,
                                )
                              }
                              className={`relative flex min-h-[88px] flex-col items-center justify-center rounded-2xl border p-3 transition ${
                                active
                                  ? "border-[#082A63] bg-[#082A63]/5 shadow-sm ring-2 ring-[#082A63]/10"
                                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                              }`}
                            >
                              {renderNetworkIcon(
                                network,
                              )}

                              <span className="mt-2 text-xs font-semibold text-slate-800">
                                {getNetworkName(
                                  network,
                                )}
                              </span>

                              {active && (
                                <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-[#082A63] text-white">
                                  <Check className="h-3 w-3" />
                                </span>
                              )}
                            </button>
                          );
                        },
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

          {hasBillerSelector && (
            <Card className="rounded-[1.5rem] border-slate-200 bg-white shadow-sm">
              <CardContent className="p-5 sm:p-6">
                <div className="mb-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#082A63]">
                    {serviceType ===
                    "electricity"
                      ? "Electricity company"
                      : "TV service"}
                  </p>

                  <h3 className="mt-1 text-lg font-bold text-slate-900">
                    Select a service
                  </h3>
                </div>

                <Select
                  value={
                    selectedBiller
                  }
                  onValueChange={
                    handleBillerChange
                  }
                >
                  <SelectTrigger className="h-14 rounded-xl border-slate-200 bg-slate-50">
                    <SelectValue
                      placeholder={
                        serviceType ===
                        "electricity"
                          ? "Choose electricity company"
                          : "Choose TV service"
                      }
                    />
                  </SelectTrigger>

                  <SelectContent>
                    {billerOptions.map(
                      (biller) => (
                        <SelectItem
                          key={getBillerCode(
                            biller,
                          )}
                          value={getBillerCode(
                            biller,
                          )}
                        >
                          {getBillerName(
                            biller,
                          )}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
          )}

          {serviceType ===
            "smile" && (
            <Card className="rounded-[1.5rem] border-slate-200 bg-white shadow-sm">
              <CardContent className="p-5 sm:p-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#082A63]/10 text-[#082A63]">
                    <Wifi className="h-5 w-5" />
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#082A63]">
                      Network
                    </p>
                    <h3 className="font-bold text-slate-900">
                      Smile
                    </h3>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {serviceType ===
            "data" && (
            <Card className="rounded-[1.5rem] border-slate-200 bg-white shadow-sm">
              <CardContent className="p-4 sm:p-6">
                <div className="mb-4 flex items-end justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#082A63]">
                      Data catalogue
                    </p>
                    <h3 className="mt-1 text-lg font-bold text-slate-900">
                      Choose a bundle
                    </h3>
                  </div>

                  {allDataPlans.length >
                    0 && (
                    <span className="text-xs font-medium text-slate-400">
                      {allDataPlans.length}{" "}
                      plans
                    </span>
                  )}
                </div>

                <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
                  {DATA_TABS.map(
                    (tab) => {
                      const active =
                        dataTab ===
                        tab;

                      return (
                        <button
                          key={tab}
                          type="button"
                          onClick={() =>
                            setDataTab(
                              tab,
                            )
                          }
                          className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold transition ${
                            active
                              ? "bg-[#082A63] text-white shadow-md shadow-[#082A63]/15"
                              : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                          }`}
                        >
                          {tab}
                        </button>
                      );
                    },
                  )}
                </div>

                {visibleDataPlans.length ===
                0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
                    <Wifi className="mx-auto h-8 w-8 text-slate-300" />

                    <p className="mt-3 text-sm font-semibold text-slate-700">
                      No plans in this category
                    </p>

                    <p className="mt-1 text-xs leading-5 text-slate-400">
                      Try another tab to see
                      available bundles.
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {visibleDataPlans.map(
                      (item) => {
                        const code =
                          getItemCode(
                            item,
                          );

                        const active =
                          selectedItemCode ===
                          code;

                        const selling =
                          getItemSellingPrice(
                            item,
                          );

                        const provider =
                          getItemProviderPrice(
                            item,
                          );

                        return (
                          <button
                            key={code}
                            type="button"
                            onClick={() =>
                              setSelectedItemCode(
                                code,
                              )
                            }
                            className={`relative overflow-hidden rounded-2xl border p-4 text-left transition ${
                              active
                                ? "border-[#082A63] bg-[#082A63]/5 shadow-md ring-2 ring-[#082A63]/10"
                                : "border-slate-200 bg-white hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
                            }`}
                          >
                            {active && (
                              <span className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-[#082A63] text-white">
                                <Check className="h-3.5 w-3.5" />
                              </span>
                            )}

                            <div className="pr-8">
                              <p className="text-sm font-bold leading-5 text-slate-900">
                                {getItemName(
                                  item,
                                )}
                              </p>

                              {item.validity && (
                                <p className="mt-1 text-xs text-slate-400">
                                  {
                                    item.validity
                                  }
                                </p>
                              )}
                            </div>

                            <div className="mt-4 flex items-end justify-between gap-3">
                              <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                                  You pay
                                </p>

                                <p className="mt-0.5 text-lg font-extrabold text-[#082A63]">
                                  {money(
                                    selling,
                                  )}
                                </p>
                              </div>

                              {provider >
                                0 &&
                                selling !==
                                  provider && (
                                  <span className="text-[10px] font-medium text-slate-400">
                                    {money(
                                      provider,
                                    )}{" "}
                                    base
                                  </span>
                                )}
                            </div>
                          </button>
                        );
                      },
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {showItemSelector &&
            serviceType !==
              "data" && (
              <Card className="rounded-[1.5rem] border-slate-200 bg-white shadow-sm">
                <CardContent className="p-5 sm:p-6">
                  <div className="mb-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#082A63]">
                      {serviceType ===
                        "cable" ||
                      serviceType ===
                        "smile"
                        ? "Package"
                        : "Product"}
                    </p>

                    <h3 className="mt-1 text-lg font-bold text-slate-900">
                      Choose an option
                    </h3>
                  </div>

                  {itemList.length ===
                  0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                      No options are currently
                      available.
                    </div>
                  ) : (
                    <Select
                      value={
                        selectedItemCode
                      }
                      onValueChange={
                        setSelectedItemCode
                      }
                    >
                      <SelectTrigger className="h-14 rounded-xl border-slate-200 bg-slate-50">
                        <SelectValue placeholder="Choose an option" />
                      </SelectTrigger>

                      <SelectContent className="max-h-80">
                        {itemList.map(
                          (item) => {
                            const code =
                              getItemCode(
                                item,
                              );

                            return (
                              <SelectItem
                                key={code}
                                value={code}
                              >
                                <div className="flex w-full items-center justify-between gap-5">
                                  <span className="max-w-[240px] truncate">
                                    {getItemName(
                                      item,
                                    )}
                                  </span>

                                  <span className="font-semibold text-[#082A63]">
                                    {money(
                                      getItemSellingPrice(
                                        item,
                                      ),
                                    )}
                                  </span>
                                </div>
                              </SelectItem>
                            );
                          },
                        )}
                      </SelectContent>
                    </Select>
                  )}
                </CardContent>
              </Card>
            )}

          {serviceType ===
            "airtime" && (
            <Card className="rounded-[1.5rem] border-slate-200 bg-white shadow-sm">
              <CardContent className="p-5 sm:p-6">
                <div className="mb-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#082A63]">
                    Recharge details
                  </p>

                  <h3 className="mt-1 text-lg font-bold text-slate-900">
                    Enter airtime details
                  </h3>
                </div>

                <div className="space-y-5">
                  <div>
                    <Label
                      htmlFor="airtime-phone"
                      className="text-sm font-semibold text-slate-700"
                    >
                      Phone number
                    </Label>

                    <div className="relative mt-2">
                      <Phone className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                      <Input
                        id="airtime-phone"
                        value={phone}
                        onChange={(event) =>
                          setPhone(
                            event.target
                              .value,
                          )
                        }
                        inputMode="tel"
                        placeholder="08012345678"
                        className="h-14 rounded-xl border-slate-200 bg-slate-50 pl-11"
                      />
                    </div>
                  </div>

                  <div>
                    <Label
                      htmlFor="airtime-amount"
                      className="text-sm font-semibold text-slate-700"
                    >
                      Amount
                    </Label>

                    <div className="relative mt-2">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                        ₦
                      </span>

                      <Input
                        id="airtime-amount"
                        value={amount}
                        onChange={(event) =>
                          setAmount(
                            event.target
                              .value
                              .replace(
                                /[^\d]/g,
                                "",
                              ),
                          )
                        }
                        inputMode="numeric"
                        placeholder="Enter amount"
                        className="h-14 rounded-xl border-slate-200 bg-slate-50 pl-9 text-lg font-semibold"
                      />
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {[100, 200, 500, 1000, 2000, 5000].map(
                        (value) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() =>
                              setAmount(
                                String(
                                  value,
                                ),
                              )
                            }
                            className="rounded-full bg-slate-100 px-3.5 py-2 text-xs font-semibold text-slate-600 transition hover:bg-[#082A63]/10 hover:text-[#082A63]"
                          >
                            ₦
                            {value.toLocaleString()}
                          </button>
                        ),
                      )}
                    </div>

                    <p className="mt-2 text-xs text-slate-400">
                      Minimum ₦50 · Maximum
                      ₦200,000
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {(serviceType ===
            "data" ||
            serviceType ===
              "waec" ||
            serviceType ===
              "jamb") && (
            <Card className="rounded-[1.5rem] border-slate-200 bg-white shadow-sm">
              <CardContent className="p-5 sm:p-6">
                <Label
                  htmlFor="service-phone"
                  className="text-sm font-semibold text-slate-700"
                >
                  Phone number
                  <span className="ml-1 font-normal text-slate-400">
                    {serviceType ===
                    "data"
                      ? "for this bundle"
                      : "optional"}
                  </span>
                </Label>

                <div className="relative mt-2">
                  <Phone className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                  <Input
                    id="service-phone"
                    value={phone}
                    onChange={(event) =>
                      setPhone(
                        event.target
                          .value,
                      )
                    }
                    inputMode="tel"
                    placeholder="08012345678"
                    className="h-14 rounded-xl border-slate-200 bg-slate-50 pl-11"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {serviceType ===
            "electricity" && (
            <Card className="rounded-[1.5rem] border-slate-200 bg-white shadow-sm">
              <CardContent className="space-y-5 p-5 sm:p-6">
                <div>
                  <Label
                    htmlFor="meter-type"
                    className="text-sm font-semibold text-slate-700"
                  >
                    Meter type
                  </Label>

                  <Select
                    value={meterType}
                    onValueChange={(
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
                    }}
                  >
                    <SelectTrigger className="mt-2 h-14 rounded-xl border-slate-200 bg-slate-50">
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
                  <Label
                    htmlFor="meter-number"
                    className="text-sm font-semibold text-slate-700"
                  >
                    Meter number
                  </Label>

                  <Input
                    id="meter-number"
                    value={meterNumber}
                    onChange={(event) => {
                      setMeterNumber(
                        event.target
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
                    className="mt-2 h-14 rounded-xl border-slate-200 bg-slate-50"
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
                    className="mt-3 h-11 w-full rounded-xl border-[#082A63]/20 text-[#082A63] hover:bg-[#082A63]/5"
                  >
                    {verifying ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <UserRoundCheck className="mr-2 h-4 w-4" />
                    )}

                    {verifying
                      ? "Verifying…"
                      : "Verify meter"}
                  </Button>
                </div>

                {verifiedCustomer &&
                  verifiedType ===
                    "meter" && (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                          <CheckCircle2 className="h-5 w-5" />
                        </div>

                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">
                            Verified customer
                          </p>

                          <p className="mt-1 font-bold text-emerald-900">
                            {verifiedCustomer}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                <div>
                  <Label
                    htmlFor="electricity-amount"
                    className="text-sm font-semibold text-slate-700"
                  >
                    Amount
                  </Label>

                  <div className="relative mt-2">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                      ₦
                    </span>

                    <Input
                      id="electricity-amount"
                      value={amount}
                      onChange={(event) =>
                        setAmount(
                          event.target
                            .value
                            .replace(
                              /[^\d]/g,
                              "",
                            ),
                        )
                      }
                      inputMode="numeric"
                      placeholder="Enter amount"
                      className="h-14 rounded-xl border-slate-200 bg-slate-50 pl-9 text-lg font-semibold"
                    />
                  </div>
                </div>

                <div>
                  <Label
                    htmlFor="electricity-phone"
                    className="text-sm font-semibold text-slate-700"
                  >
                    Phone number
                    <span className="ml-1 font-normal text-slate-400">
                      optional
                    </span>
                  </Label>

                  <Input
                    id="electricity-phone"
                    value={phone}
                    onChange={(event) =>
                      setPhone(
                        event.target
                          .value,
                      )
                    }
                    inputMode="tel"
                    placeholder="08012345678"
                    className="mt-2 h-14 rounded-xl border-slate-200 bg-slate-50"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {serviceType ===
            "cable" && (
            <Card className="rounded-[1.5rem] border-slate-200 bg-white shadow-sm">
              <CardContent className="space-y-5 p-5 sm:p-6">
                <div>
                  <Label
                    htmlFor="smartcard-number"
                    className="text-sm font-semibold text-slate-700"
                  >
                    Smartcard / IUC number
                  </Label>

                  <Input
                    id="smartcard-number"
                    value={smartcardNumber}
                    onChange={(event) => {
                      setSmartcardNumber(
                        event.target
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
                    className="mt-2 h-14 rounded-xl border-slate-200 bg-slate-50"
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
                    className="mt-3 h-11 w-full rounded-xl border-[#082A63]/20 text-[#082A63] hover:bg-[#082A63]/5"
                  >
                    {verifying ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <UserRoundCheck className="mr-2 h-4 w-4" />
                    )}

                    {verifying
                      ? "Verifying…"
                      : "Verify smartcard"}
                  </Button>
                </div>

                {verifiedCustomer &&
                  verifiedType ===
                    "cable" && (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                          <CheckCircle2 className="h-5 w-5" />
                        </div>

                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">
                            Verified customer
                          </p>

                          <p className="mt-1 font-bold text-emerald-900">
                            {verifiedCustomer}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
              </CardContent>
            </Card>
          )}

          {(serviceType ===
            "airtime-card" ||
            serviceType ===
              "data-card") && (
            <Card className="rounded-[1.5rem] border-slate-200 bg-white shadow-sm">
              <CardContent className="p-5 sm:p-6">
                <Label
                  htmlFor="pin-quantity"
                  className="text-sm font-semibold text-slate-700"
                >
                  Quantity
                </Label>

                <div className="mt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      setQuantity(
                        String(
                          Math.max(
                            1,
                            quantityNumber -
                              1,
                          ),
                        ),
                      )
                    }
                    className="h-14 w-14 shrink-0 rounded-xl border border-slate-200 bg-slate-50 text-xl font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    −
                  </button>

                  <Input
                    id="pin-quantity"
                    value={quantity}
                    onChange={(event) =>
                      setQuantity(
                        event.target
                          .value
                          .replace(
                            /\D/g,
                            "",
                          ),
                      )
                    }
                    inputMode="numeric"
                    className="h-14 rounded-xl border-slate-200 bg-slate-50 text-center text-lg font-bold"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setQuantity(
                        String(
                          Math.min(
                            100,
                            quantityNumber +
                              1,
                          ),
                        ),
                      )
                    }
                    className="h-14 w-14 shrink-0 rounded-xl border border-slate-200 bg-slate-50 text-xl font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    +
                  </button>
                </div>

                <p className="mt-2 text-xs text-slate-400">
                  Quantity: 1–100
                </p>
              </CardContent>
            </Card>
          )}

          {serviceType ===
            "smile" && (
            <Card className="rounded-[1.5rem] border-slate-200 bg-white shadow-sm">
              <CardContent className="p-5 sm:p-6">
                <Label
                  htmlFor="smile-account"
                  className="text-sm font-semibold text-slate-700"
                >
                  Smile account / mobile number
                </Label>

                <Input
                  id="smile-account"
                  value={accountId}
                  onChange={(event) =>
                    setAccountId(
                      event.target
                        .value,
                    )
                  }
                  inputMode="numeric"
                  placeholder="Enter Smile account number"
                  className="mt-2 h-14 rounded-xl border-slate-200 bg-slate-50"
                />
              </CardContent>
            </Card>
          )}

          {serviceType ===
            "jamb" && (
            <Card className="rounded-[1.5rem] border-slate-200 bg-white shadow-sm">
              <CardContent className="p-5 sm:p-6">
                <Label
                  htmlFor="jamb-exam-type"
                  className="text-sm font-semibold text-slate-700"
                >
                  Examination type
                </Label>

                <Select
                  value={examType}
                  onValueChange={
                    setExamType
                  }
                >
                  <SelectTrigger
                    id="jamb-exam-type"
                    className="mt-2 h-14 rounded-xl border-slate-200 bg-slate-50"
                  >
                    <SelectValue placeholder="Choose examination type" />
                  </SelectTrigger>

                  <SelectContent>
                    <SelectItem value="de">
                      Direct Entry
                    </SelectItem>

                    <SelectItem value="utme-mock">
                      UTME Mock
                    </SelectItem>

                    <SelectItem value="utme-no-mock">
                      UTME — No Mock
                    </SelectItem>
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
          )}

          <Card className="overflow-hidden rounded-[1.5rem] border-0 bg-white shadow-lg shadow-slate-200/50">
            <div className="bg-slate-900 px-5 py-5 text-white sm:px-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
                    Order summary
                  </p>

                  <h3 className="mt-1 text-lg font-bold">
                    Review payment
                  </h3>
                </div>

                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10">
                  <ShieldCheck className="h-5 w-5 text-[#F4B400]" />
                </div>
              </div>
            </div>

            <CardContent className="p-5 sm:p-6">
              <div className="space-y-4">
                {selectedItem && (
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs text-slate-400">
                        Selected
                      </p>

                      <p className="mt-1 text-sm font-semibold text-slate-800">
                        {getItemName(
                          selectedItem,
                        )}
                      </p>
                    </div>

                    <p className="text-sm font-bold text-slate-900">
                      {money(
                        selectedSellingPrice,
                      )}
                    </p>
                  </div>
                )}

                {serviceType ===
                  "airtime" && (
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs text-slate-400">
                        Recharge amount
                      </p>

                      <p className="mt-1 text-sm font-semibold text-slate-800">
                        {cleanPhone(
                          phone,
                        ) ||
                          "—"}
                      </p>
                    </div>

                    <p className="font-bold text-slate-900">
                      {money(
                        amountNumber,
                      )}
                    </p>
                  </div>
                )}

                {serviceType ===
                  "electricity" && (
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs text-slate-400">
                        Meter
                      </p>

                      <p className="mt-1 text-sm font-semibold text-slate-800">
                        {meterNumber ||
                          "—"}
                      </p>
                    </div>

                    <p className="font-bold text-slate-900">
                      {money(
                        amountNumber,
                      )}
                    </p>
                  </div>
                )}

                {serviceType ===
                    "airtime-card" ||
                  serviceType ===
                    "data-card" ? (
                  <div className="flex items-center justify-between border-t border-slate-100 pt-4">
                    <span className="text-sm text-slate-500">
                      Quantity
                    </span>

                    <span className="font-semibold text-slate-900">
                      {quantityNumber}
                    </span>
                  </div>
                ) : null}

                <div className="border-t border-slate-100 pt-4">
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                        Total
                      </p>

                      <p className="mt-1 text-2xl font-extrabold tracking-tight text-[#082A63]">
                        {money(
                          estimatedTotal,
                        )}
                      </p>
                    </div>

                    {markupRate ===
                      0 && (
                      <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">
                        No extra markup
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-[#082A63]/10 bg-[#082A63]/5 p-4">
                <div className="flex gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#082A63] shadow-sm">
                    <LockKeyhole className="h-4 w-4" />
                  </div>

                  <div>
                    <p className="text-sm font-bold text-slate-900">
                      Secure payment
                    </p>

                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Your payment is confirmed with
                      your IyanjuPay payment PIN.
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
                  loadingCatalogue ||
                  estimatedTotal <= 0
                }
                className="mt-5 h-14 w-full rounded-2xl bg-[#082A63] text-base font-bold shadow-lg shadow-[#082A63]/15 transition hover:bg-[#061F49]"
              >
                {purchaseLoading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Processing…
                  </>
                ) : (
                  <>
                    Continue to payment
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          <div className="flex items-center justify-center gap-2 px-4 text-center text-xs text-slate-400">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            <span>
              Your service purchase is protected by
              IyanjuPay's secure payment process.
            </span>
          </div>
        </div>
      </div>

      <Dialog
        open={showPinModal}
        onOpenChange={(
          open,
        ) => {
          if (
            !pinLoading &&
            !purchaseLoading
          ) {
            setShowPinModal(
              open,
            );
          }
        }}
      >
        <DialogContent className="w-[calc(100%-2rem)] max-w-md rounded-[1.75rem] border-0 p-0 shadow-2xl">
          <div className="overflow-hidden rounded-[1.75rem]">
            <div className="bg-gradient-to-br from-[#082A63] to-[#1557AA] px-6 py-7 text-white">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20">
                <LockKeyhole className="h-6 w-6" />
              </div>

              <DialogHeader className="mt-5 text-left">
                <DialogTitle className="text-xl font-bold text-white">
                  Confirm payment
                </DialogTitle>

                <DialogDescription className="mt-1 text-sm leading-5 text-blue-100">
                  Enter your IyanjuPay payment PIN
                  to authorize this purchase.
                </DialogDescription>
              </DialogHeader>
            </div>

            <div className="p-6">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs text-slate-400">
                      You're paying
                    </p>

                    <p className="mt-1 text-2xl font-extrabold text-[#082A63]">
                      {money(
                        estimatedTotal,
                      )}
                    </p>
                  </div>

                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-[#082A63] shadow-sm">
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
              </div>

              <div className="mt-5">
                <Label
                  htmlFor="payment-pin"
                  className="text-sm font-semibold text-slate-700"
                >
                  Payment PIN
                </Label>

                <Input
                  id="payment-pin"
                  type="password"
                  value={paymentPin}
                  onChange={(event) =>
                    setPaymentPin(
                      event.target
                        .value
                        .replace(
                          /\D/g,
                          "",
                        )
                        .slice(0, 6),
                    )
                  }
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="Enter PIN"
                  className="mt-2 h-14 rounded-xl border-slate-200 bg-slate-50 text-center text-xl tracking-[0.5em]"
                  onKeyDown={(event) => {
                    if (
                      event.key ===
                        "Enter" &&
                      !pinLoading
                    ) {
                      void confirmPurchase();
                    }
                  }}
                />
              </div>

              <div className="mt-4 flex items-start gap-3 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Never share your payment PIN with
                  anyone.
                </span>
              </div>

              <DialogFooter className="mt-6 flex-col gap-2 sm:flex-col">
                <Button
                  type="button"
                  onClick={
                    confirmPurchase
                  }
                  disabled={
                    pinLoading ||
                    purchaseLoading ||
                    paymentPin.length <
                      4
                  }
                  className="h-13 w-full rounded-xl bg-[#082A63] font-bold hover:bg-[#061F49]"
                >
                  {pinLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying PIN…
                    </>
                  ) : (
                    <>
                      Confirm & Pay
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    setShowPinModal(
                      false,
                    )
                  }
                  disabled={
                    pinLoading
                  }
                  className="h-11 w-full rounded-xl text-slate-500 hover:bg-slate-100"
                >
                  Cancel
                </Button>
              </DialogFooter>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ServicePayment;
