import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ArrowLeft,
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
  Wifi,
  Zap,
} from "lucide-react";

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

import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

/*
 * ============================================================
 * TYPES
 * ============================================================
 */

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

/*
 * ============================================================
 * CONSTANTS
 * ============================================================
 */

const COMING_SOON_SERVICES = new Set([
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
] as const;

type DataTab = (typeof DATA_TABS)[number];

/*
 * IMPORTANT:
 *
 * Airtime = 0% markup
 * Data = 15%
 * Electricity = 15%
 * Cable = 15%
 * Airtime E-Pin = 20%
 * Data E-Pin = 20%
 * Smile = 20%
 * WAEC = 20%
 * JAMB = 20%
 *
 * Backend selling prices are authoritative.
 */

const PREMIUM_SERVICES = new Set([
  "airtime-card",
  "data-card",
  "smile",
  "waec",
  "jamb",
]);

const REGULAR_SERVICES = new Set([
  "data",
  "electricity",
  "cable",
]);

/*
 * ============================================================
 * SERVICE HELPERS
 * ============================================================
 */

const normalizeServiceType = (
  value: unknown
): string => {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/_/g, "-");
};

const money = (
  value: unknown
): string => {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return "₦0";
  }

  return `₦${amount.toLocaleString(
    "en-NG",
    {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }
  )}`;
};

const numericValue = (
  value: unknown
): number => {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  const parsed = Number(
    String(value ?? "")
      .replace(/,/g, "")
      .replace(/[₦$]/g, "")
      .trim()
  );

  return Number.isFinite(parsed)
    ? parsed
    : 0;
};

const cleanPhone = (
  value: string
): string => {
  return String(value ?? "")
    .replace(/\D/g, "")
    .slice(0, 11);
};

const normalizeName = (
  value: unknown
): string => {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
};

const isInvalidCustomerName = (
  value: unknown
): boolean => {
  const name = normalizeName(value).toUpperCase();

  return (
    !name ||
    name.includes("INVALID") ||
    name.includes("NOT FOUND") ||
    name.includes("NOTFOUND") ||
    name.includes("ERROR") ||
    name === "N/A" ||
    name === "-"
  );
};

/*
 * ============================================================
 * CATALOGUE NORMALIZATION
 * ============================================================
 */

const toCatalogueArray = (
  value: any
): any[] => {
  if (Array.isArray(value)) {
    return value;
  }

  if (
    value &&
    typeof value === "object"
  ) {
    /*
     * ClubKonnect Data Plans V2 returns
     *
     * MOBILE_NETWORK: {
     *   MTN: [
     *     {
     *       ID,
     *       PRODUCT: [...]
     *     }
     *   ]
     * }
     *
     * This helper deliberately walks nested catalogue
     * structures instead of assuming a flat response.
     */

    const directKeys = [
      "items",
      "plans",
      "products",
      "packages",
      "PRODUCT",
      "PRODUCTS",
      "data",
      "DATA",
      "results",
      "result",
    ];

    for (const key of directKeys) {
      if (
        value[key] !== undefined
      ) {
        const result =
          toCatalogueArray(
            value[key]
          );

        if (result.length) {
          return result;
        }
      }
    }

    const values =
      Object.values(value);

    const flattened: any[] = [];

    for (const entry of values) {
      if (
        Array.isArray(entry)
      ) {
        flattened.push(
          ...entry
        );
      } else if (
        entry &&
        typeof entry ===
          "object"
      ) {
        const nested =
          toCatalogueArray(
            entry
          );

        if (nested.length) {
          flattened.push(
            ...nested
          );
        }
      }
    }

    return flattened;
  }

  return [];
};

const getItemCode = (
  item: CatalogueItem
): string => {
  return String(
    item.code ??
      item.product_code ??
      item.productCode ??
      item.variation_code ??
      item.variationCode ??
      item.plan_code ??
      item.planCode ??
      item.code2 ??
      item.id ??
      ""
  ).trim();
};

const getItemName = (
  item: CatalogueItem
): string => {
  return String(
    item.name ??
      item.plan_name ??
      item.planName ??
      item.package_name ??
      item.packageName ??
      item.product_name ??
      item.PRODUCT_NAME ??
      item.label ??
      item.title ??
      item.description ??
      item.value ??
      ""
  ).trim();
};

const getItemProviderPrice = (
  item: CatalogueItem
): number => {
  return numericValue(
    item.providerPrice ??
      item.provider_price ??
      item.providerAmount ??
      item.provider_amount ??
      item.PRODUCT_AMOUNT ??
      item.product_amount ??
      item.amount ??
      item.value ??
      0
  );
};

const getItemSellingPrice = (
  item: CatalogueItem
): number => {
  /*
   * `price` is the backend customer selling price.
   *
   * Do NOT apply frontend markup to it.
   */

  const explicitSelling =
    [
      item.price,
      item.sellingPrice,
      item.selling_price,
      item.salePrice,
    ].find(
      (value) =>
        value !==
          undefined &&
        value !== null &&
        Number.isFinite(
          Number(value)
        )
    );

  if (
    explicitSelling !==
    undefined
  ) {
    return numericValue(
      explicitSelling
    );
  }

  return getItemProviderPrice(
    item
  );
};

const normalizeNetwork = (
  network: CatalogueNetwork,
  fallbackIndex = 0
): CatalogueNetwork => {
  const code = String(
    network.code ??
      network.network_code ??
      network.networkCode ??
      network.value ??
      network.id ??
      `network-${fallbackIndex}`
  ).trim();

  const name = String(
    network.name ??
      network.label ??
      network.network ??
      network.company ??
      code
  ).trim();

  return {
    ...network,
    code,
    name,
  };
};

const normalizeItem = (
  item: CatalogueItem,
  fallbackIndex = 0
): CatalogueItem => {
  const code =
    getItemCode(item) ||
    `item-${fallbackIndex}`;

  const name =
    getItemName(item) ||
    "Service option";

  const providerPrice =
    getItemProviderPrice(
      item
    );

  const sellingPrice =
    getItemSellingPrice(
      item
    );

  return {
    ...item,
    code,
    name,
    providerPrice,
    provider_price:
      providerPrice,
    price: sellingPrice,
    sellingPrice,
    selling_price:
      sellingPrice,
  };
};

/*
 * ============================================================
 * DEEP EXTRACTION
 * ============================================================
 */

const extractNetworks = (
  response: CatalogueResponse
): CatalogueNetwork[] => {
  const possible =
    response.networks ??
    response.providers ??
    response.data?.networks ??
    response.data?.providers ??
    response.data?.network ??
    response.data?.MOBILE_NETWORK ??
    response.MOBILE_NETWORK ??
    [];

  const result: CatalogueNetwork[] =
    [];

  if (
    possible &&
    typeof possible ===
      "object" &&
    !Array.isArray(possible)
  ) {
    for (const [
      key,
      value,
    ] of Object.entries(
      possible
    )) {
      if (
        Array.isArray(value)
      ) {
        result.push(
          normalizeNetwork(
            {
              code: key,
              name:
                key ===
                "m_9mobile"
                  ? "9mobile"
                  : key,
            },
            result.length
          )
        );
      } else if (
        value &&
        typeof value ===
          "object"
      ) {
        result.push(
          normalizeNetwork(
            {
              ...(value as any),
              code:
                (value as any)
                  .code ??
                key,
              name:
                (value as any)
                  .name ??
                key,
            },
            result.length
          )
        );
      }
    }
  } else {
    toCatalogueArray(
      possible
    ).forEach(
      (entry, index) => {
        result.push(
          normalizeNetwork(
            entry,
            index
          )
        );
      }
    );
  }

  const seen =
    new Set<string>();

  return result.filter(
    (network) => {
      const key =
        network.code
          .toLowerCase();

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);

      return true;
    }
  );
};

const extractBillers = (
  response: CatalogueResponse
): CatalogueNetwork[] => {
  const possible =
    response.billers ??
    response.data?.billers ??
    response.data?.companies ??
    response.data?.providers ??
    response.data?.electricity ??
    [];

  return toCatalogueArray(
    possible
  )
    .map(
      (
        entry,
        index
      ) =>
        normalizeNetwork(
          entry,
          index
        )
    )
    .filter(
      (item) =>
        Boolean(item.code)
    );
};

const extractItems = (
  response: CatalogueResponse
): CatalogueItem[] => {
  const possible =
    response.items ??
    response.data?.items ??
    response.data?.products ??
    response.data?.packages ??
    [];

  return toCatalogueArray(
    possible
  ).map(
    (
      item,
      index
    ) =>
      normalizeItem(
        item,
        index
      )
  );
};

const extractPlans = (
  response: CatalogueResponse
): CatalogueItem[] => {
  const possible =
    response.plans ??
    response.data?.plans ??
    response.data?.packages ??
    response.data?.products ??
    response.data?.PRODUCT ??
    response.data?.PRODUCTS ??
    response.MOBILE_NETWORK ??
    response.data?.MOBILE_NETWORK ??
    [];

  const result: CatalogueItem[] =
    [];

  /*
   * Handle:
   *
   * MOBILE_NETWORK -> MTN -> [{ ID, PRODUCT: [...] }]
   */

  const walk = (
    value: any,
    networkCode?: string
  ) => {
    if (Array.isArray(value)) {
      for (const entry of value) {
        walk(
          entry,
          networkCode
        );
      }

      return;
    }

    if (
      !value ||
      typeof value !==
        "object"
    ) {
      return;
    }

    if (
      Array.isArray(
        value.PRODUCT
      )
    ) {
      const currentNetwork =
        String(
          networkCode ??
            value.NETWORK ??
            value.network_code ??
            value.networkCode ??
            ""
        ).trim();

      for (const product of value.PRODUCT) {
        result.push({
          ...product,
          network_code:
            product.network_code ??
            product.networkCode ??
            currentNetwork,
          networkCode:
            product.networkCode ??
            product.network_code ??
            currentNetwork,
        });
      }

      return;
    }

    if (
      Array.isArray(
        value.products
      )
    ) {
      for (const product of value.products) {
        result.push({
          ...product,
          network_code:
            product.network_code ??
            product.networkCode ??
            networkCode,
          networkCode:
            product.networkCode ??
            product.network_code ??
            networkCode,
        });
      }

      return;
    }

    for (const [
      key,
      child,
    ] of Object.entries(
      value
    )) {
      if (
        child &&
        typeof child ===
          "object"
      ) {
        walk(
          child,
          networkCode ??
            key
        );
      }
    }
  };

  walk(possible);

  if (!result.length) {
    result.push(
      ...toCatalogueArray(
        possible
      )
    );
  }

  return result
    .map(
      (
        item,
        index
      ) =>
        normalizeItem(
          item,
          index
        )
    )
    .filter(
      (item) =>
        Boolean(
          getItemCode(item)
        )
    );
};

/*
 * ============================================================
 * VISUAL HELPERS
 * ============================================================
 */

const getNetworkLogo = (
  network: CatalogueNetwork
): string => {
  return String(
    network.logo ??
      network.logo_url ??
      network.logoUrl ??
      network.image ??
      network.image_url ??
      network.imageUrl ??
      network.icon ??
      ""
  ).trim();
};

const getInitials = (
  value: string
): string => {
  const words =
    value
      .trim()
      .split(/\s+/)
      .filter(Boolean);

  if (!words.length) {
    return "?";
  }

  if (words.length === 1) {
    return words[0]
      .slice(0, 2)
      .toUpperCase();
  }

  return (
    words[0][0] +
    words[1][0]
  ).toUpperCase();
};

const getDataTab = (
  item: CatalogueItem
): DataTab => {
  const raw = String(
    item.tab ??
      item.category ??
      item.category_name ??
      item.categoryName ??
      item.validity ??
      ""
  )
    .trim()
    .toLowerCase();

  if (
    raw.includes("extra") ||
    raw.includes("night")
  ) {
    return "Extra Night";
  }

  if (raw.includes("daily")) {
    return "Daily";
  }

  if (
    raw.includes("weekly") ||
    raw.includes("week")
  ) {
    return "Weekly";
  }

  if (
    raw.includes("monthly") ||
    raw.includes("month")
  ) {
    return "Monthly";
  }

  return "HOT";
};

/*
 * ============================================================
 * COMPONENT
 * ============================================================
 */

const ServicePayment = ({
  service,
  walletBalance: _walletBalance,
  onBack,
  onPurchase,
  onHistory,
}: ServicePaymentProps) => {
  const { toast } =
    useToast();

  const serviceType =
    normalizeServiceType(
      service?.type
    );

  /*
   * ----------------------------------------------------------
   * CATALOGUE
   * ----------------------------------------------------------
   */

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

  /*
   * ----------------------------------------------------------
   * CUSTOMER INPUTS
   * ----------------------------------------------------------
   */

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
  ] = useState("01");

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

  /*
   * ----------------------------------------------------------
   * VERIFICATION
   * ----------------------------------------------------------
   */

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
    "" | "meter" | "cable" | "smile"
  >("");

  /*
   * ----------------------------------------------------------
   * PAYMENT
   * ----------------------------------------------------------
   */

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

  /*
   * ----------------------------------------------------------
   * DERIVED SERVICE FLAGS
   * ----------------------------------------------------------
   */

  const isAirtime =
    serviceType ===
    "airtime";

  const isData =
    serviceType === "data";

  const isElectricity =
    serviceType ===
    "electricity";

  const isCable =
    serviceType === "cable";

  const isAirtimeCard =
    serviceType ===
    "airtime-card";

  const isDataCard =
    serviceType ===
    "data-card";

  const isSmile =
    serviceType === "smile";

  const isWaec =
    serviceType === "waec";

  const isJamb =
    serviceType === "jamb";

  const isComingSoon =
    COMING_SOON_SERVICES.has(
      serviceType
    );

  /*
   * ----------------------------------------------------------
   * SELECTED ITEM
   * ----------------------------------------------------------
   */

  const allCatalogueItems =
    useMemo(() => {
      const map =
        new Map<
          string,
          CatalogueItem
        >();

      [
        ...items,
        ...plans,
      ].forEach(
        (item, index) => {
          const normalized =
            normalizeItem(
              item,
              index
            );

          const code =
            getItemCode(
              normalized
            );

          if (
            code &&
            !map.has(code)
          ) {
            map.set(
              code,
              normalized
            );
          }
        }
      );

      return Array.from(
        map.values()
      );
    }, [items, plans]);

  const allDataPlans =
    useMemo(() => {
      return allCatalogueItems;
    }, [allCatalogueItems]);

  const visibleDataPlans =
    useMemo(() => {
      if (!isData) {
        return [];
      }

      if (
        dataTab === "HOT"
      ) {
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
      isData,
    ]);

  const itemList =
    isData
      ? visibleDataPlans
      : allCatalogueItems;

  const selectedItem =
    useMemo(() => {
      return itemList.find(
        (item) =>
          getItemCode(item) ===
          selectedItemCode
      ) ??
        allCatalogueItems.find(
          (item) =>
            getItemCode(item) ===
            selectedItemCode
        ) ??
        null;
    }, [
      itemList,
      allCatalogueItems,
      selectedItemCode,
    ]);

  const selectedProviderPrice =
    selectedItem
      ? getItemProviderPrice(
          selectedItem
        )
      : 0;

  const selectedSellingPrice =
    selectedItem
      ? getItemSellingPrice(
          selectedItem
        )
      : 0;

  /*
   * Backend price is the customer price.
   *
   * Never add another markup here.
   */

  const selectedCustomerPrice =
    selectedSellingPrice ||
    selectedProviderPrice;

  const quantityNumber = Math.max(
    1,
    Math.min(
      100,
      numericValue(
        quantity
      ) || 1
    )
  );

  const amountNumber =
    numericValue(amount);

  const estimatedTotal =
    isAirtime
      ? amountNumber
      : isElectricity
      ? amountNumber
      : isAirtimeCard ||
        isDataCard
      ? selectedCustomerPrice *
        quantityNumber
      : selectedCustomerPrice;

  /*
   * ----------------------------------------------------------
   * SERVICE DISPLAY
   * ----------------------------------------------------------
   */

  const serviceIcon =
    isAirtime
      ? Smartphone
      : isData ||
        isSmile
      ? Wifi
      : isElectricity
      ? Zap
      : isCable
      ? Tv
      : Smartphone;

  const ServiceIcon =
    serviceIcon;

  /*
   * ============================================================
   * EDGE FUNCTION ERROR
   * ============================================================
   */

  const extractFunctionError =
    async (
      error: any,
      fallback = "Unable to process your request."
    ): Promise<string> => {
      console.error(
        "Supabase function error:",
        error
      );

      try {
        if (
          error?.context &&
          typeof error.context
            .json ===
            "function"
        ) {
          const response =
            error.context;

          let payload: any =
            null;

          try {
            payload =
              await response.json();
          } catch {
            payload = null;
          }

          console.error(
            "Edge Function response:",
            payload
          );

          if (
            payload?.error
          ) {
            return String(
              payload.error
            );
          }

          if (
            payload?.message
          ) {
            return String(
              payload.message
            );
          }

          if (
            payload?.provider_message
          ) {
            return String(
              payload.provider_message
            );
          }

          if (
            payload?.provider_response
              ?.message
          ) {
            return String(
              payload
                .provider_response
                .message
            );
          }

          if (
            payload?.provider_response
              ?.data?.message
          ) {
            return String(
              payload
                .provider_response
                .data
                .message
            );
          }
        }
      } catch (parseError) {
        console.error(
          "Could not parse Edge Function error:",
          parseError
        );
      }

      if (
        error?.message &&
        error.message !==
          "Edge Function returned a non-2xx status code"
      ) {
        return String(
          error.message
        );
      }

      return fallback;
    };

  /*
   * ============================================================
   * CATALOGUE INVOCATION
   * ============================================================
   */

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
                action:
                  "catalog",
                service:
                  serviceType,
                ...extra,
              },
            }
          );

        if (error) {
          const message =
            await extractFunctionError(
              error,
              "Unable to load this service."
            );

          throw new Error(
            message
          );
        }

        if (!data) {
          throw new Error(
            "No catalogue data was returned."
          );
        }

        if (
          data.success ===
            false
        ) {
          throw new Error(
            data.error ||
              data.message ||
              "Unable to load this service."
          );
        }

        return data as CatalogueResponse;
      },
      [serviceType]
    );

  /*
   * ============================================================
   * LOAD CATALOGUE
   * ============================================================
   */

  const loadCatalogue =
    useCallback(
      async () => {
        if (
          !service ||
          isComingSoon
        ) {
          return;
        }

        setLoadingCatalogue(
          true
        );
        setCatalogueError(
          ""
        );

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

        setVerifiedCustomer(
          ""
        );
        setVerifiedType("");

        try {
          const response =
            await invokeCatalogue();

          const extractedNetworks =
            extractNetworks(
              response
            );

          const extractedBillers =
            extractBillers(
              response
            );

          const extractedItems =
            extractItems(
              response
            );

          const extractedPlans =
            extractPlans(
              response
            );

          setNetworks(
            extractedNetworks
          );

          setBillers(
            extractedBillers
          );

          setItems(
            extractedItems
          );

          setPlans(
            extractedPlans
          );

          /*
           * Smile has a fixed network identity in ClubKonnect.
           */

          if (
            isSmile &&
            extractedNetworks.length
          ) {
            const smileNetwork =
              extractedNetworks.find(
                (network) =>
                  normalizeText(
                    network.code
                  ) ===
                    "smile-direct" ||
                  normalizeText(
                    network.name
                  ).includes(
                    "smile"
                  )
              );

            if (
              smileNetwork
            ) {
              setSelectedNetwork(
                smileNetwork.code
              );
            }
          }

          if (
            extractedBillers.length ===
            1
          ) {
            setSelectedBiller(
              extractedBillers[0]
                .code
            );
          }

          const initialItems =
            extractedPlans.length
              ? extractedPlans
              : extractedItems;

          if (
            initialItems.length ===
            1
          ) {
            setSelectedItemCode(
              getItemCode(
                initialItems[0]
              )
            );
          }
        } catch (error: any) {
          console.error(
            "Catalogue loading error:",
            error
          );

          setCatalogueError(
            error?.message ||
              "Unable to load this service."
          );
        } finally {
          setLoadingCatalogue(
            false
          );
        }
      },
      [
        service,
        isComingSoon,
        invokeCatalogue,
        isSmile,
      ]
    );

  useEffect(() => {
    void loadCatalogue();
  }, [loadCatalogue]);

  /*
   * ============================================================
   * LOAD NETWORK-SPECIFIC CATALOGUE
   * ============================================================
   */

  const loadNetworkCatalogue =
    useCallback(
      async (
        networkCode?: string,
        billerCode?: string
      ) => {
        if (
          !service ||
          isComingSoon
        ) {
          return;
        }

        setLoadingCatalogue(
          true
        );
        setCatalogueError(
          ""
        );
        setSelectedItemCode(
          ""
        );

        try {
          const extra: Record<
            string,
            any
          > = {};

          if (
            networkCode
          ) {
            extra.network_code =
              networkCode;
          }

          if (
            billerCode
          ) {
            /*
             * IMPORTANT:
             * Electricity billers use biller_code.
             * Do not send biller as network_code.
             */
            extra.biller_code =
              billerCode;
          }

          const response =
            await invokeCatalogue(
              extra
            );

          const extractedItems =
            extractItems(
              response
            );

          const extractedPlans =
            extractPlans(
              response
            );

          if (
            extractedItems.length
          ) {
            setItems(
              extractedItems
            );
          }

          if (
            extractedPlans.length
          ) {
            setPlans(
              extractedPlans
            );
          }

          const nextItems =
            extractedPlans.length
              ? extractedPlans
              : extractedItems;

          if (
            nextItems.length ===
            1
          ) {
            setSelectedItemCode(
              getItemCode(
                nextItems[0]
              )
            );
          }
        } catch (error: any) {
          console.error(
            "Network catalogue error:",
            error
          );

          setCatalogueError(
            error?.message ||
              "Unable to load options for this network."
          );
        } finally {
          setLoadingCatalogue(
            false
          );
        }
      },
      [
        service,
        isComingSoon,
        invokeCatalogue,
      ]
    );

  /*
   * ============================================================
   * NETWORK CHANGE
   * ============================================================
   */

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

      if (
        isData ||
        isAirtimeCard ||
        isDataCard ||
        isSmile
      ) {
        await loadNetworkCatalogue(
          value
        );
      }
    };

  /*
   * ============================================================
   * BILLER CHANGE
   * ============================================================
   */

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
      setVerifiedCustomer(
        ""
      );
      setVerifiedType("");

      if (
        isElectricity ||
        isCable
      ) {
        await loadNetworkCatalogue(
          undefined,
          value
        );
      }
    };

  /*
   * ============================================================
   * METER VERIFICATION
   * ============================================================
   */

  const verifyMeter =
    async () => {
      if (
        !selectedBiller
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

      if (
        meterNumber.trim()
          .length < 5
      ) {
        toast({
          title:
            "Invalid meter number",
          description:
            "Enter a valid meter number.",
          variant:
            "destructive",
        });

        return;
      }

      setVerifying(true);

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
          const message =
            await extractFunctionError(
              error,
              "Unable to verify meter."
            );

          throw new Error(
            message
          );
        }

        const result =
          data as VerificationResponse;

        const customerName =
          normalizeName(
            result?.customer_name ??
              result?.customerName
          );

        if (
          !result?.success ||
          isInvalidCustomerName(
            customerName
          )
        ) {
          throw new Error(
            result?.error ||
              result?.message ||
              "Meter verification failed."
          );
        }

        setVerifiedCustomer(
          customerName
        );
        setVerifiedType(
          "meter"
        );

        toast({
          title:
            "Meter verified",
          description:
            customerName,
        });
      } catch (error: any) {
        console.error(
          "Meter verification error:",
          error
        );

        setVerifiedCustomer(
          ""
        );
        setVerifiedType("");

        toast({
          title:
            "Verification failed",
          description:
            error?.message ||
            "Unable to verify this meter.",
          variant:
            "destructive",
        });
      } finally {
        setVerifying(
          false
        );
      }
    };

  /*
   * ============================================================
   * CABLE VERIFICATION
   * ============================================================
   */

  const verifyCable =
    async () => {
      if (
        !selectedBiller
      ) {
        toast({
          title:
            "Select TV service",
          description:
            "Please select your TV service first.",
          variant:
            "destructive",
        });

        return;
      }

      if (
        smartcardNumber.trim()
          .length < 5
      ) {
        toast({
          title:
            "Invalid smartcard number",
          description:
            "Enter a valid smartcard number.",
          variant:
            "destructive",
        });

        return;
      }

      setVerifying(true);

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
              },
            }
          );

        if (error) {
          const message =
            await extractFunctionError(
              error,
              "Unable to verify smartcard."
            );

          throw new Error(
            message
          );
        }

        const result =
          data as VerificationResponse;

        const customerName =
          normalizeName(
            result?.customer_name ??
              result?.customerName
          );

        if (
          !result?.success ||
          isInvalidCustomerName(
            customerName
          )
        ) {
          throw new Error(
            result?.error ||
              result?.message ||
              "Smartcard verification failed."
          );
        }

        setVerifiedCustomer(
          customerName
        );
        setVerifiedType(
          "cable"
        );

        toast({
          title:
            "Smartcard verified",
          description:
            customerName,
        });
      } catch (error: any) {
        console.error(
          "Cable verification error:",
          error
        );

        setVerifiedCustomer(
          ""
        );
        setVerifiedType("");

        toast({
          title:
            "Verification failed",
          description:
            error?.message ||
            "Unable to verify this smartcard.",
          variant:
            "destructive",
        });
      } finally {
        setVerifying(
          false
        );
      }
    };

  /*
   * ============================================================
   * VALIDATION
   * ============================================================
   */

  const validatePurchase =
    (): string | null => {
      if (!service) {
        return "Please select a service.";
      }

      if (isComingSoon) {
        return `${service.title} is not yet available.`;
      }

      if (
        isAirtime
      ) {
        if (
          !selectedNetwork
        ) {
          return "Please select a network.";
        }

        const normalizedPhone =
          cleanPhone(phone);

        if (
          normalizedPhone.length !==
          11
        ) {
          return "Enter a valid 11-digit phone number.";
        }

        if (
          amountNumber <
            50 ||
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
          !selectedItem
        ) {
          return "Please select a data plan.";
        }

        if (
          cleanPhone(phone)
            .length !==
          11
        ) {
          return "Enter a valid 11-digit phone number.";
        }
      }

      if (isElectricity) {
        if (
          !selectedBiller
        ) {
          return "Please select an electricity company.";
        }

        if (
          !meterNumber.trim()
        ) {
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
          amountNumber <
          100
        ) {
          return "Electricity amount must be at least ₦100.";
        }
      }

      if (isCable) {
        if (
          !selectedBiller
        ) {
          return "Please select a TV service.";
        }

        if (
          !selectedItem
        ) {
          return "Please select a package.";
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
        isAirtimeCard
      ) {
        if (
          !selectedNetwork
        ) {
          return "Please select a network.";
        }

        if (
          !selectedItem
        ) {
          return "Please select an airtime PIN value.";
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
          !selectedItem
        ) {
          return "Please select a data PIN.";
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
          return "Enter your Smile account or phone number.";
        }

        if (
          !selectedItem
        ) {
          return "Please select a Smile package.";
        }
      }

      if (isWaec) {
        if (
          !selectedItem
        ) {
          return "Please select a WAEC package.";
        }

        if (
          cleanPhone(phone)
            .length !==
          11
        ) {
          return "Enter a valid 11-digit phone number.";
        }
      }

      if (isJamb) {
        if (
          !examType
        ) {
          return "Please select an examination type.";
        }

        if (
          cleanPhone(phone)
            .length !==
          11
        ) {
          return "Enter a valid 11-digit phone number.";
        }
      }

      if (
        estimatedTotal <=
        0
      ) {
        return "Please select a valid service amount.";
      }

      return null;
    };

  /*
   * ============================================================
   * PURCHASE DETAILS
   * ============================================================
   */

  const buildPurchaseDetails =
    (): Record<
      string,
      any
    > => {
      const itemCode =
        selectedItem
          ? getItemCode(
              selectedItem
            )
          : "";

      const itemName =
        selectedItem
          ? getItemName(
              selectedItem
            )
          : "";

      const providerPrice =
        isAirtime
          ? amountNumber
          : isElectricity
          ? amountNumber
          : selectedProviderPrice;

      const customerPrice =
        isAirtime
          ? amountNumber
          : isElectricity
          ? amountNumber
          : selectedCustomerPrice;

      const details: Record<
        string,
        any
      > = {
        type:
          serviceType,

        service:
          serviceType,

        country: "NG",

        customer:
          phone ||
          accountId ||
          undefined,

        customer_id:
          accountId ||
          undefined,

        selling_amount:
          customerPrice,

        selling_price:
          customerPrice,

        provider_amount:
          providerPrice,

        provider_price:
          providerPrice,

        price:
          customerPrice,

        item_code:
          itemCode,

        product_code:
          String(
            selectedItem
              ?.productCode ??
              selectedItem
                ?.product_code ??
              itemCode
          ),

        variation_code:
          String(
            selectedItem
              ?.variationCode ??
              selectedItem
                ?.variation_code ??
              ""
          ),

        plan_code:
          String(
            selectedItem
              ?.planCode ??
              selectedItem
                ?.plan_code ??
              itemCode
          ),

        package_code:
          itemCode,

        package_name:
          itemName,

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

        phone_no:
          cleanPhone(phone) ||
          undefined,

        recipient_phone:
          cleanPhone(phone) ||
          undefined,
      };

      /*
       * Airtime
       */

      if (isAirtime) {
        details.amount =
          amountNumber;

        details.value =
          amountNumber;
      }

      /*
       * Data
       */

      if (isData) {
        details.data_plan =
          itemCode;

        details.dataPlan =
          itemCode;

        details.mobile_network =
          selectedNetwork;

        details.network_code =
          selectedNetwork;
      }

      /*
       * Electricity
       */

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
      }

      /*
       * Cable TV
       */

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

        details.amount =
          selectedProviderPrice;
      }

      /*
       * Airtime E-PIN
       */

      if (
        isAirtimeCard
      ) {
        details.value =
          selectedItem
            ?.value ??
          selectedProviderPrice;

        details.quantity =
          quantityNumber;

        details.network =
          selectedNetwork;

        delete details.phone;
        delete details.phoneNumber;
        delete details.phone_no;
        delete details.recipient_phone;
      }

      /*
       * Data E-PIN
       */

      if (isDataCard) {
        details.data_plan =
          itemCode;

        details.dataPlan =
          itemCode;

        details.quantity =
          quantityNumber;

        details.network =
          selectedNetwork;

        details.mobile_network =
          selectedNetwork;

        delete details.phone;
        delete details.phoneNumber;
        delete details.phone_no;
        delete details.recipient_phone;
      }

      /*
       * Smile
       */

      if (isSmile) {
        details.smile =
          "smile-direct";

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

      /*
       * WAEC
       */

      if (isWaec) {
        details.exam_type =
          itemCode;

        details.package_code =
          itemCode;

        details.phone =
          cleanPhone(phone);

        details.phoneNumber =
          cleanPhone(phone);
      }

      /*
       * JAMB
       */

      if (isJamb) {
        details.exam_type =
          examType;

        if (
          itemCode
        ) {
          details.package_code =
            itemCode;
        }

        details.phone =
          cleanPhone(phone);

        details.phoneNumber =
          cleanPhone(phone);
      }

      return details;
    };

  /*
   * ============================================================
   * PAYMENT PIN
   * ============================================================
   */

  const verifyPaymentPin =
    async (
      pin: string
    ): Promise<boolean> => {
      const normalizedPin =
        String(pin ?? "")
          .trim();

      if (
        normalizedPin.length !==
        4
      ) {
        throw new Error(
          "Enter your 4-digit payment PIN."
        );
      }

      const {
        data,
        error,
      } =
        await supabase.rpc(
          "verify_payment_pin",
          {
            p_pin:
              normalizedPin,
          }
        );

      if (error) {
        throw error;
      }

      if (
        data === false ||
        data?.success === false
      ) {
        throw new Error(
          data?.message ||
            "Incorrect payment PIN."
        );
      }

      return true;
    };

  /*
   * ============================================================
   * OPEN PURCHASE
   * ============================================================
   */

  const handlePurchaseClick =
    () => {
      const validation =
        validatePurchase();

      if (validation) {
        toast({
          title:
            "Check your details",
          description:
            validation,
          variant:
            "destructive",
        });

        return;
      }

      setPaymentPin("");
      setShowPinModal(
        true
      );
    };

  /*
   * ============================================================
   * CONFIRM PURCHASE
   * ============================================================
   */

  const confirmPurchase =
    async () => {
      if (
        pinLoading ||
        purchaseLoading
      ) {
        return;
      }

      const validation =
        validatePurchase();

      if (validation) {
        toast({
          title:
            "Check your details",
          description:
            validation,
          variant:
            "destructive",
        });

        return;
      }

      if (
        paymentPin.length !==
        4
      ) {
        toast({
          title:
            "Enter your PIN",
          description:
            "Enter your 4-digit payment PIN.",
          variant:
            "destructive",
        });

        return;
      }

      setPinLoading(true);

      try {
        await verifyPaymentPin(
          paymentPin
        );

        setPinLoading(false);
        setPurchaseLoading(
          true
        );

        const details =
          buildPurchaseDetails();

        /*
         * IMPORTANT:
         *
         * onPurchase receives CUSTOMER SELLING PRICE.
         * The Edge Function decides provider cost and
         * performs the authoritative wallet debit.
         */

        const purchaseAmount =
          isAirtime ||
          isElectricity
            ? amountNumber
            : isAirtimeCard ||
              isDataCard
            ? selectedCustomerPrice *
              quantityNumber
            : selectedCustomerPrice;

        await onPurchase(
          purchaseAmount,
          {
            ...details,
            payment_pin:
              paymentPin,
          }
        );

        setShowPinModal(
          false
        );
        setPaymentPin("");

        toast({
          title:
            "Payment successful",
          description:
            `${service?.title ?? "Service"} payment has been submitted successfully.`,
        });
      } catch (error: any) {
        console.error(
          "Purchase confirmation failed:",
          error
        );

        toast({
          title:
            "Payment failed",
          description:
            error?.message ||
            "Unable to complete this payment.",
          variant:
            "destructive",
        });
      } finally {
        setPinLoading(
          false
        );
        setPurchaseLoading(
          false
        );
      }
    };

  /*
   * ============================================================
   * NETWORK SELECTOR
   * ============================================================
   */

  const renderNetworkSelector =
    (
      label = "Network"
    ) => {
      if (
        !networks.length
      ) {
        return null;
      }

      return (
        <div className="space-y-2">
          <Label className="text-xs font-semibold text-slate-600">
            {label}
          </Label>

          <Select
            value={
              selectedNetwork
            }
            onValueChange={
              handleNetworkChange
            }
          >
            <SelectTrigger className="h-12 rounded-xl border-slate-200 bg-white text-sm shadow-none">
              <SelectValue placeholder="Select network" />
            </SelectTrigger>

            <SelectContent>
              {networks.map(
                (
                  network,
                  index
                ) => {
                  const logo =
                    getNetworkLogo(
                      network
                    );

                  return (
                    <SelectItem
                      key={`${network.code}-${index}`}
                      value={
                        network.code
                      }
                    >
                      <span className="flex items-center gap-2">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-50 text-[9px] font-black text-slate-600">
                          {logo ? (
                            <img
                              src={
                                logo
                              }
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            getInitials(
                              network.name
                            )
                          )}
                        </span>

                        <span>
                          {
                            network.name
                          }
                        </span>
                      </span>
                    </SelectItem>
                  );
                }
              )}
            </SelectContent>
          </Select>
        </div>
      );
    };

  /*
   * ============================================================
   * BILLER SELECTOR
   * ============================================================
   */

  const renderBillerSelector =
    (
      label: string
    ) => {
      if (
        !billers.length
      ) {
        return (
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-slate-600">
              {label}
            </Label>

            <div className="flex h-12 items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500">
              <span>
                No options available
              </span>

              <RefreshCw className="h-4 w-4" />
            </div>
          </div>
        );
      }

      return (
        <div className="space-y-2">
          <Label className="text-xs font-semibold text-slate-600">
            {label}
          </Label>

          <Select
            value={
              selectedBiller
            }
            onValueChange={
              handleBillerChange
            }
          >
            <SelectTrigger className="h-12 rounded-xl border-slate-200 bg-white text-sm shadow-none">
              <SelectValue
                placeholder={`Select ${label.toLowerCase()}`}
              />
            </SelectTrigger>

            <SelectContent>
              {billers.map(
                (
                  biller,
                  index
                ) => {
                  const logo =
                    getNetworkLogo(
                      biller
                    );

                  return (
                    <SelectItem
                      key={`${biller.code}-${index}`}
                      value={
                        biller.code
                      }
                    >
                      <span className="flex items-center gap-2">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-50 text-[9px] font-black text-slate-600">
                          {logo ? (
                            <img
                              src={
                                logo
                              }
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            getInitials(
                              biller.name
                            )
                          )}
                        </span>

                        <span>
                          {
                            biller.name
                          }
                        </span>
                      </span>
                    </SelectItem>
                  );
                }
              )}
            </SelectContent>
          </Select>
        </div>
      );
    };

  /*
   * ============================================================
   * ITEM SELECTOR
   * ============================================================
   */

  const renderItemSelector =
    (
      label: string,
      placeholder: string
    ) => {
      return (
        <div className="space-y-2">
          <Label className="text-xs font-semibold text-slate-600">
            {label}
          </Label>

          <Select
            value={
              selectedItemCode
            }
            onValueChange={
              setSelectedItemCode
            }
            disabled={
              loadingCatalogue ||
              !itemList.length
            }
          >
            <SelectTrigger className="h-12 rounded-xl border-slate-200 bg-white text-sm shadow-none">
              <SelectValue
                placeholder={
                  loadingCatalogue
                    ? "Loading options..."
                    : placeholder
                }
              />
            </SelectTrigger>

            <SelectContent>
              {itemList.map(
                (
                  item,
                  index
                ) => {
                  const code =
                    getItemCode(
                      item
                    );

                  const name =
                    getItemName(
                      item
                    );

                  const price =
                    getItemSellingPrice(
                      item
                    );

                  return (
                    <SelectItem
                      key={`${code}-${index}`}
                      value={
                        code
                      }
                    >
                      <span className="flex w-full items-center justify-between gap-5">
                        <span className="max-w-[220px] truncate">
                          {
                            name
                          }
                        </span>

                        {price >
                          0 && (
                          <span className="font-semibold text-slate-700">
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
      );
    };

  /*
   * ============================================================
   * DATA PLAN GRID
   * ============================================================
   */

  const renderDataPlans =
    () => {
      if (
        loadingCatalogue &&
        !allDataPlans.length
      ) {
        return (
          <div className="flex items-center justify-center py-8 text-sm text-slate-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading data plans...
          </div>
        );
      }

      if (
        !visibleDataPlans.length
      ) {
        return (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-7 text-center">
            <Wifi className="mx-auto h-6 w-6 text-slate-400" />

            <p className="mt-2 text-sm font-semibold text-slate-700">
              No plans in this category
            </p>

            <p className="mt-1 text-xs text-slate-500">
              Try another tab.
            </p>
          </div>
        );
      }

      return (
        <div className="grid grid-cols-2 gap-2">
          {visibleDataPlans.map(
            (
              item,
              index
            ) => {
              const code =
                getItemCode(
                  item
                );

              const name =
                getItemName(
                  item
                );

              const price =
                getItemSellingPrice(
                  item
                );

              const isSelected =
                code ===
                selectedItemCode;

              const tab =
                getDataTab(
                  item
                );

              return (
                <button
                  type="button"
                  key={`${code}-${index}`}
                  onClick={() =>
                    setSelectedItemCode(
                      code
                    )
                  }
                  className={`min-w-0 rounded-xl border p-3 text-left transition ${
                    isSelected
                      ? "border-purple-600 bg-purple-50 ring-1 ring-purple-600/10"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-slate-900">
                        {
                          name
                        }
                      </span>

                      {tab !==
                        "HOT" && (
                        <span className="mt-1 block text-[10px] font-medium text-slate-400">
                          {
                            tab
                          }
                        </span>
                      )}
                    </span>

                    {isSelected && (
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#4c1d95] via-[#6d28d9] to-[#2563eb] text-white">
                        <Check className="h-3 w-3" />
                      </span>
                    )}
                  </div>

                  <p className="mt-3 text-sm font-black text-purple-700">
                    {money(
                      price
                    )}
                  </p>
                </button>
              );
            }
          )}
        </div>
      );
    };

  /*
   * ============================================================
   * SERVICE BODY
   * ============================================================
   */

  const renderServiceBody =
    () => {
      if (
        loadingCatalogue &&
        !networks.length &&
        !billers.length &&
        !itemList.length
      ) {
        return (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-50">
              <Loader2 className="h-5 w-5 animate-spin text-purple-600" />
            </div>

            <p className="mt-3 text-sm font-semibold text-slate-700">
              Loading {service?.title?.toLowerCase() ?? "service"}...
            </p>

            <p className="mt-1 text-xs text-slate-500">
              Getting the latest available options.
            </p>
          </div>
        );
      }

      if (
        catalogueError
      ) {
        return (
          <div className="rounded-xl border border-red-100 bg-red-50 p-4">
            <p className="text-sm font-semibold text-red-700">
              Unable to load this service
            </p>

            <p className="mt-1 text-xs leading-5 text-red-600">
              {catalogueError}
            </p>

            <Button
              type="button"
              variant="outline"
              onClick={() =>
                void loadCatalogue()
              }
              className="mt-3 h-9 rounded-lg border-red-200 bg-white text-xs font-semibold text-red-700 hover:bg-red-50"
            >
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
              Try again
            </Button>
          </div>
        );
      }

      /*
       * AIRTIME
       */

      if (isAirtime) {
        return (
          <div className="space-y-4">
            {renderNetworkSelector()}

            <div className="space-y-2">
              <Label className="text-xs font-semibold text-slate-600">
                Phone number
              </Label>

              <div className="relative">
                <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                <Input
                  inputMode="numeric"
                  value={
                    phone
                  }
                  onChange={(
                    event
                  ) =>
                    setPhone(
                      cleanPhone(
                        event
                          .target
                          .value
                      )
                    )
                  }
                  placeholder="08012345678"
                  className="h-12 rounded-xl border-slate-200 pl-10 shadow-none"
                  maxLength={
                    11
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold text-slate-600">
                Amount
              </Label>

              <Input
                inputMode="decimal"
                value={
                  amount
                }
                onChange={(
                  event
                ) =>
                  setAmount(
                    event
                      .target
                      .value
                  )
                }
                placeholder="Enter amount"
                className="h-12 rounded-xl border-slate-200 shadow-none"
              />

              <div className="grid grid-cols-4 gap-2 pt-1">
                {[100, 200, 500, 1000].map(
                  (value) => (
                    <button
                      key={
                        value
                      }
                      type="button"
                      onClick={() =>
                        setAmount(
                          String(
                            value
                          )
                        )
                      }
                      className={`rounded-lg border px-2 py-2 text-xs font-bold transition ${
                        Number(
                          amount
                        ) ===
                        value
                          ? "border-purple-600 bg-purple-50 text-purple-700"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      ₦
                      {value.toLocaleString()}
                    </button>
                  )
                )}
              </div>
            </div>
          </div>
        );
      }

      /*
       * DATA
       */

      if (isData) {
        return (
          <div className="space-y-4">
            {renderNetworkSelector()}

            <div>
              <div className="mb-2 flex items-center justify-between">
                <Label className="text-xs font-semibold text-slate-600">
                  Data plan
                </Label>

                {loadingCatalogue && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-purple-600" />
                )}
              </div>

              <div className="mb-3 grid grid-cols-5 gap-1 rounded-xl bg-slate-100 p-1">
                {DATA_TABS.map(
                  (
                    tab
                  ) => (
                    <button
                      key={
                        tab
                      }
                      type="button"
                      onClick={() =>
                        setDataTab(
                          tab
                        )}
                      className={`rounded-lg px-1 py-2 text-[9px] font-bold transition sm:text-[10px] ${
                        dataTab ===
                        tab
                          ? "bg-white text-purple-700 shadow-sm"
                          : "text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      {
                        tab
                      }
                    </button>
                  )
                )}
              </div>

              {renderDataPlans()}
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold text-slate-600">
                Phone number
              </Label>

              <div className="relative">
                <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                <Input
                  inputMode="numeric"
                  value={
                    phone
                  }
                  onChange={(
                    event
                  ) =>
                    setPhone(
                      cleanPhone(
                        event
                          .target
                          .value
                      )
                    )
                  }
                  placeholder="08012345678"
                  className="h-12 rounded-xl border-slate-200 pl-10 shadow-none"
                  maxLength={
                    11
                  }
                />
              </div>
            </div>
          </div>
        );
      }

      /*
       * ELECTRICITY
       */

      if (
        isElectricity
      ) {
        return (
          <div className="space-y-4">
            {renderBillerSelector(
              "Electricity company"
            )}

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-slate-600">
                  Meter type
                </Label>

                <Select
                  value={
                    meterType
                  }
                  onValueChange={
                    (
                      value
                    ) =>
                      setMeterType(
                        value
                      )
                  }
                >
                  <SelectTrigger className="h-12 rounded-xl border-slate-200 bg-white shadow-none">
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

              <div className="space-y-2">
                <Label className="text-xs font-semibold text-slate-600">
                  Meter number
                </Label>

                <Input
                  inputMode="numeric"
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
                      ""
                    );
                  }}
                  placeholder="Meter number"
                  className="h-12 rounded-xl border-slate-200 shadow-none"
                />
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={
                verifyMeter
              }
              disabled={
                verifying
              }
              className="h-10 w-full rounded-xl border-purple-200 text-xs font-bold text-purple-700 hover:bg-purple-50"
            >
              {verifying ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="mr-2 h-4 w-4" />
              )}

              {verifying
                ? "Verifying..."
                : "Verify meter"}
            </Button>

            {verifiedCustomer &&
              verifiedType ===
                "meter" && (
                <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />

                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600">
                      Verified customer
                    </p>

                    <p className="truncate text-sm font-bold text-emerald-800">
                      {
                        verifiedCustomer
                      }
                    </p>
                  </div>
                </div>
              )}

            <div className="space-y-2">
              <Label className="text-xs font-semibold text-slate-600">
                Amount
              </Label>

              <Input
                inputMode="decimal"
                value={
                  amount
                }
                onChange={(
                  event
                ) =>
                  setAmount(
                    event
                      .target
                      .value
                  )
                }
                placeholder="Enter amount"
                className="h-12 rounded-xl border-slate-200 shadow-none"
              />
            </div>
          </div>
        );
      }

      /*
       * CABLE
       */

      if (isCable) {
        return (
          <div className="space-y-4">
            {renderBillerSelector(
              "TV service"
            )}

            <div className="space-y-2">
              <Label className="text-xs font-semibold text-slate-600">
                Smartcard number
              </Label>

              <Input
                inputMode="numeric"
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
                    ""
                  );
                }}
                placeholder="Enter smartcard number"
                className="h-12 rounded-xl border-slate-200 shadow-none"
              />
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={
                verifyCable
              }
              disabled={
                verifying
              }
              className="h-10 w-full rounded-xl border-purple-200 text-xs font-bold text-purple-700 hover:bg-purple-50"
            >
              {verifying ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="mr-2 h-4 w-4" />
              )}

              {verifying
                ? "Verifying..."
                : "Verify smartcard"}
            </Button>

            {verifiedCustomer &&
              verifiedType ===
                "cable" && (
                <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />

                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600">
                      Verified customer
                    </p>

                    <p className="truncate text-sm font-bold text-emerald-800">
                      {
                        verifiedCustomer
                      }
                    </p>
                  </div>
                </div>
              )}

            {renderItemSelector(
              "Package",
              "Select package"
            )}
          </div>
        );
      }

      /*
       * AIRTIME E-PIN
       */

      if (
        isAirtimeCard
      ) {
        return (
          <div className="space-y-4">
            {renderNetworkSelector()}

            {renderItemSelector(
              "PIN value",
              "Select PIN value"
            )}

            <div className="space-y-2">
              <Label className="text-xs font-semibold text-slate-600">
                Quantity
              </Label>

              <Input
                inputMode="numeric"
                value={
                  quantity
                }
                onChange={(
                  event
                ) =>
                  setQuantity(
                    event
                      .target
                      .value
                      .replace(
                        /\D/g,
                        ""
                      )
                      .slice(
                        0,
                        3
                      )
                  )
                }
                placeholder="1"
                className="h-12 rounded-xl border-slate-200 shadow-none"
                maxLength={
                  3
                }
              />

              <p className="text-[11px] text-slate-400">
                You can purchase up to 100 PINs at once.
              </p>
            </div>
          </div>
        );
      }

      /*
       * DATA E-PIN
       */

      if (isDataCard) {
        return (
          <div className="space-y-4">
            {renderNetworkSelector()}

            {renderItemSelector(
              "Data PIN",
              "Select data PIN"
            )}

            <div className="space-y-2">
              <Label className="text-xs font-semibold text-slate-600">
                Quantity
              </Label>

              <Input
                inputMode="numeric"
                value={
                  quantity
                }
                onChange={(
                  event
                ) =>
                  setQuantity(
                    event
                      .target
                      .value
                      .replace(
                        /\D/g,
                        ""
                      )
                      .slice(
                        0,
                        3
                      )
                  )
                }
                placeholder="1"
                className="h-12 rounded-xl border-slate-200 shadow-none"
                maxLength={
                  3
                }
              />

              <p className="text-[11px] text-slate-400">
                You can purchase up to 100 PINs at once.
              </p>
            </div>
          </div>
        );
      }

      /*
       * SMILE
       */

      if (isSmile) {
        return (
          <div className="space-y-4">
            {renderItemSelector(
              "Smile package",
              "Select package"
            )}

            <div className="space-y-2">
              <Label className="text-xs font-semibold text-slate-600">
                Smile account / phone
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
                placeholder="Enter Smile account or phone"
                className="h-12 rounded-xl border-slate-200 shadow-none"
              />
            </div>
          </div>
        );
      }

      /*
       * WAEC
       */

      if (isWaec) {
        return (
          <div className="space-y-4">
            {renderItemSelector(
              "WAEC service",
              "Select WAEC package"
            )}

            <div className="space-y-2">
              <Label className="text-xs font-semibold text-slate-600">
                Phone number
              </Label>

              <Input
                inputMode="numeric"
                value={
                  phone
                }
                onChange={(
                  event
                ) =>
                  setPhone(
                    cleanPhone(
                      event
                        .target
                        .value
                    )
                  )
                }
                placeholder="08012345678"
                className="h-12 rounded-xl border-slate-200 shadow-none"
                maxLength={
                  11
                }
              />
            </div>
          </div>
        );
      }

      /*
       * JAMB
       */

      if (isJamb) {
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-slate-600">
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
                <SelectTrigger className="h-12 rounded-xl border-slate-200 bg-white shadow-none">
                  <SelectValue placeholder="Select examination type" />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="de">
                    JAMB UTME
                  </SelectItem>

                  <SelectItem value="utme-mock">
                    UTME Mock
                  </SelectItem>

                  <SelectItem value="utme-no-mock">
                    UTME No Mock
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {renderItemSelector(
              "JAMB service",
              "Select package"
            )}

            <div className="space-y-2">
              <Label className="text-xs font-semibold text-slate-600">
                Phone number
              </Label>

              <Input
                inputMode="numeric"
                value={
                  phone
                }
                onChange={(
                  event
                ) =>
                  setPhone(
                    cleanPhone(
                      event
                        .target
                        .value
                    )
                  )
                }
                placeholder="08012345678"
                className="h-12 rounded-xl border-slate-200 shadow-none"
                maxLength={
                  11
                }
              />
            </div>
          </div>
        );
      }

      return (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-center">
          <p className="text-sm font-semibold text-slate-700">
            This service is not available yet.
          </p>
        </div>
      );
    };

  /*
   * ============================================================
   * PRICE SUMMARY
   * ============================================================
   */

  const renderSummary =
    () => {
      if (
        estimatedTotal <=
        0
      ) {
        return null;
      }

      const quantityLabel =
        isAirtimeCard ||
        isDataCard
          ? ` × ${quantityNumber}`
          : "";

      return (
        <div className="rounded-xl bg-slate-50 px-3.5 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Total
              </p>

              <p className="mt-0.5 truncate text-xs font-medium text-slate-600">
                {selectedItem
                  ? getItemName(
                      selectedItem
                    )
                  : isAirtime
                  ? "Airtime"
                  : isElectricity
                  ? "Electricity payment"
                  : service?.title}
                {quantityLabel}
              </p>
            </div>

            <p className="shrink-0 text-lg font-black text-slate-950">
              {money(
                estimatedTotal
              )}
            </p>
          </div>
        </div>
      );
    };

  /*
   * ============================================================
   * PIN DIALOG
   * ============================================================
   */

  const renderPinDialog =
    () => (
      <Dialog
        open={
          showPinModal
        }
        onOpenChange={(
          open
        ) => {
          if (
            !pinLoading &&
            !purchaseLoading
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
        <DialogContent className="w-[calc(100%-24px)] max-w-sm rounded-2xl border-0 p-5">
          <DialogHeader className="text-left">
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-purple-50 text-purple-700">
              <LockKeyhole className="h-5 w-5" />
            </div>

            <DialogTitle className="text-lg font-black text-slate-950">
              Authorize payment
            </DialogTitle>

            <DialogDescription className="text-xs leading-5 text-slate-500">
              Enter your 4-digit payment PIN to confirm this transaction.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-3">
            <Input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              value={
                paymentPin
              }
              onChange={(
                event
              ) =>
                setPaymentPin(
                  event.target.value
                    .replace(
                      /\D/g,
                      ""
                    )
                    .slice(
                      0,
                      4
                    )
                )
              }
              placeholder="••••"
              className="h-12 rounded-xl border-slate-200 text-center text-xl font-black tracking-[0.5em] shadow-none"
              onKeyDown={(
                event
              ) => {
                if (
                  event.key ===
                    "Enter" &&
                  paymentPin.length ===
                    4
                ) {
                  void confirmPurchase();
                }
              }}
            />

            <div className="mt-3 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
              <span className="text-xs text-slate-500">
                Amount
              </span>

              <span className="text-sm font-black text-slate-900">
                {money(
                  estimatedTotal
                )}
              </span>
            </div>
          </div>

          <DialogFooter className="mt-2 grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setShowPinModal(
                  false
                )
              }
              disabled={
                pinLoading ||
                purchaseLoading
              }
              className="h-11 rounded-xl border-slate-200 text-xs font-bold"
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
                purchaseLoading ||
                paymentPin.length !==
                  4
              }
              className="h-11 rounded-xl bg-gradient-to-r from-[#4c1d95] via-[#6d28d9] to-[#2563eb] text-xs font-bold text-white shadow-md hover:opacity-95"
            >
              {pinLoading ||
              purchaseLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}

              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );

  /*
   * ============================================================
   * COMING SOON
   * ============================================================
   */

  if (
    !service ||
    isComingSoon
  ) {
    return (
      <div className="min-h-screen bg-[#f7f8fc]">
        <header className="sticky top-0 z-30 border-b border-white/10 bg-gradient-to-r from-[#4c1d95] via-[#6d28d9] to-[#2563eb] text-white shadow-lg">
          <div className="mx-auto flex h-16 max-w-xl items-center justify-between px-4">
            <Button
              variant="ghost"
              onClick={
                onBack
              }
              className="h-10 w-10 rounded-full p-0 text-white hover:bg-white/15"
              aria-label="Go back"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>

            <p className="text-sm font-black">
              Service
            </p>

            <div className="w-10" />
          </div>
        </header>

        <main className="mx-auto max-w-xl px-4 py-8">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-purple-50 text-purple-700">
              <Clock3 className="h-5 w-5" />
            </div>

            <h1 className="mt-4 text-lg font-black text-slate-950">
              Coming soon
            </h1>

            <p className="mx-auto mt-2 max-w-xs text-xs leading-5 text-slate-500">
              {service?.title ??
                "This service"}{" "}
              is being prepared and will be available soon.
            </p>

            <Button
              type="button"
              onClick={
                onBack
              }
              className="mt-5 h-10 rounded-xl bg-gradient-to-r from-[#4c1d95] via-[#6d28d9] to-[#2563eb] px-5 text-xs font-bold text-white"
            >
              Back to services
            </Button>
          </div>
        </main>
      </div>
    );
  }

  /*
   * ============================================================
   * MAIN SERVICE PAYMENT UI
   * ============================================================
   */

  return (
    <div className="min-h-screen bg-[#f7f8fc] pb-6">
      {/* HEADER */}

      <header className="sticky top-0 z-30 border-b border-white/10 bg-gradient-to-r from-[#4c1d95] via-[#6d28d9] to-[#2563eb] text-white shadow-lg">
        <div className="mx-auto flex h-16 w-full max-w-xl items-center justify-between px-4">
          <Button
            variant="ghost"
            onClick={
              onBack
            }
            className="h-10 w-10 rounded-full p-0 text-white hover:bg-white/15"
            aria-label="Go back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>

          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15">
              <ServiceIcon className="h-4 w-4 text-white" />
            </div>

            <h1 className="truncate text-sm font-black">
              {service.title}
            </h1>
          </div>

          {onHistory ? (
            <Button
              variant="ghost"
              onClick={
                onHistory
              }
              className="h-10 w-10 rounded-full p-0 text-white hover:bg-white/15"
              aria-label="View transaction history"
            >
              <History className="h-5 w-5" />
            </Button>
          ) : (
            <div className="w-10" />
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-xl px-4 py-4 sm:py-5">
        {/* COMPACT SERVICE INTRO */}

        <div className="mb-4 flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-purple-600">
              IyanjuPay
            </p>

            <h2 className="mt-0.5 truncate text-lg font-black tracking-tight text-slate-950">
              {isAirtime
                ? "Buy Airtime"
                : isData
                ? "Buy Data"
                : isElectricity
                ? "Pay Electricity"
                : isCable
                ? "Cable TV"
                : isAirtimeCard
                ? "Airtime E-Pin"
                : isDataCard
                ? "Data E-Pin"
                : isSmile
                ? "Smile"
                : isWaec
                ? "WAEC"
                : isJamb
                ? "JAMB"
                : service.title}
            </h2>
          </div>

          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-slate-200">
            <ShieldCheck className="h-4 w-4 text-purple-600" />
          </div>
        </div>

        {/* MAIN FORM */}

        <Card className="rounded-2xl border-slate-200/80 bg-white shadow-sm">
          <CardContent className="p-4 sm:p-5">
            {renderServiceBody()}

            {renderSummary()}

            {/* PAYMENT BUTTON */}

            <Button
              type="button"
              onClick={
                handlePurchaseClick
              }
              disabled={
                purchaseLoading ||
                loadingCatalogue
              }
              className="mt-4 h-12 w-full rounded-xl bg-gradient-to-r from-[#4c1d95] via-[#6d28d9] to-[#2563eb] text-sm font-black text-white shadow-[0_8px_22px_rgba(109,40,217,0.22)] transition hover:opacity-95"
            >
              {purchaseLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <LockKeyhole className="mr-2 h-4 w-4" />
              )}

              {estimatedTotal >
              0
                ? `Pay ${money(
                    estimatedTotal
                  )}`
                : "Continue"}
            </Button>
          </CardContent>
        </Card>

        {/* TRUST NOTE */}

        <div className="mt-3 flex items-center justify-center gap-2 px-3 text-center">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" />

          <p className="text-[10px] leading-4 text-slate-400">
            Your payment is protected by secure payment authorization.
          </p>
        </div>

        {/* REFRESH */}

        {catalogueError && (
          <button
            type="button"
            onClick={() =>
              void loadCatalogue()
            }
            className="mx-auto mt-3 flex items-center gap-1.5 text-[11px] font-semibold text-purple-600"
          >
            <RefreshCw className="h-3 w-3" />
            Refresh service
          </button>
        )}
      </main>

      {renderPinDialog()}
    </div>
  );
};

export default ServicePayment;
