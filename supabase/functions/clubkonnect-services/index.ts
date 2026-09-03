import {
  corsHeaders,
  json,
  adminClient,
  getUser,
} from "../_shared/auth.ts";

/**
 * IyanjuPay - ClubKonnect Service Gateway
 *
 * CUSTOMER-FACING CONTRACT
 * ------------------------
 * The frontend talks only to this function.
 * ClubKonnect credentials and provider pricing never leave
 * the Edge Function.
 *
 * Supported services:
 *   airtime
 *   data
 *   electricity
 *   cable
 *   airtime-card
 *   data-card
 *   smile
 *   waec
 *   jamb
 *
 * Coming soon:
 *   internet
 *   insurance
 *   savings
 *
 * Actions:
 *   catalog
 *   verify_meter
 *   verify_cable
 *   purchase
 *   status
 *   reconcile
 *
 * IMPORTANT:
 * - Customer price is calculated on the server.
 * - The frontend must never be trusted for provider price.
 * - ClubKonnect transactions can be asynchronous.
 * - ORDER_RECEIVED / pending states are NOT treated as failures.
 */

// ============================================================
// TYPES
// ============================================================

type ServiceType =
  | "airtime"
  | "data"
  | "electricity"
  | "cable"
  | "airtime-card"
  | "data-card"
  | "smile"
  | "waec"
  | "jamb";

type ProviderState =
  | "success"
  | "pending"
  | "failed";

interface ProviderResult {
  state: ProviderState;
  statusCode: number | null;
  status: string;
  message: string;
  orderId: string;
  requestId: string;
  raw: Record<string, any>;
}

interface CatalogItem {
  id?: string;
  code: string;
  name: string;

  provider_amount?: number;
  selling_price?: number;

  amount?: number;
  price?: number;
  value?: number;

  network_code?: string;
  network?: string;

  biller_code?: string;
  company_code?: string;

  validity?: string;
  duration?: string;

  category?: string;
  minimum?: number;
  maximum?: number;

  logo?: string | null;

  [key: string]: any;
}

// ============================================================
// CONSTANTS
// ============================================================

const CLUBKONNECT_BASE_URL =
  "https://www.nellobytesystems.com";

const REGULAR_MARKUP = 0.15;
const PREMIUM_MARKUP = 0.20;

const PREMIUM_SERVICES = new Set<ServiceType>([
  "airtime-card",
  "data-card",
  "smile",
  "waec",
  "jamb",
]);

const SUPPORTED_SERVICES = new Set<ServiceType>([
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

const COMING_SOON_SERVICES = new Set([
  "internet",
  "insurance",
  "savings",
]);

const SERVICE_ALIASES: Record<string, ServiceType> = {
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
};

// ============================================================
// ENVIRONMENT
// ============================================================

function getRequiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();

  if (!value) {
    throw new Error(
      `Missing required server configuration: ${name}`
    );
  }

  return value;
}

function getClubKonnectCredentials() {
  return {
    userId: getRequiredEnv(
      "CLUBKONNECT_USER_ID"
    ),
    apiKey: getRequiredEnv(
      "CLUBKONNECT_API_KEY"
    ),
  };
}

function getSupabaseUrl(): string {
  return (
    Deno.env.get("SUPABASE_URL")?.trim() ||
    ""
  );
}

function getCallbackUrl(): string {
  const configured =
    Deno.env.get(
      "CLUBKONNECT_CALLBACK_URL"
    )?.trim();

  if (configured) {
    return configured;
  }

  const supabaseUrl =
    getSupabaseUrl();

  if (!supabaseUrl) {
    return "";
  }

  return `${supabaseUrl}/functions/v1/clubkonnect-webhook`;
}

// ============================================================
// BASIC HELPERS
// ============================================================

function asString(
  value: unknown,
  fallback = ""
): string {
  if (
    value === undefined ||
    value === null
  ) {
    return fallback;
  }

  return String(value).trim();
}

function asNumber(
  value: unknown,
  fallback = 0
): number {
  const n =
    typeof value === "number"
      ? value
      : Number(value);

  return Number.isFinite(n)
    ? n
    : fallback;
}

function positiveNumber(
  value: unknown
): number {
  const n = asNumber(value);

  return n > 0 ? n : 0;
}

function roundMoney(
  value: number
): number {
  return Math.round(
    (value + Number.EPSILON) * 100
  ) / 100;
}

function normalizeService(
  value: unknown
): ServiceType | null {
  const raw =
    asString(value).toLowerCase();

  return (
    SERVICE_ALIASES[raw] ??
    null
  );
}

function isSupportedService(
  service: string
): service is ServiceType {
  return SUPPORTED_SERVICES.has(
    service as ServiceType
  );
}

function markupFor(
  service: ServiceType
): number {
  return PREMIUM_SERVICES.has(
    service
  )
    ? PREMIUM_MARKUP
    : REGULAR_MARKUP;
}

function sellingPrice(
  providerAmount: number,
  service: ServiceType
): number {
  if (
    !Number.isFinite(
      providerAmount
    ) ||
    providerAmount <= 0
  ) {
    return 0;
  }

  return roundMoney(
    providerAmount *
      (1 + markupFor(service))
  );
}

function normalizePhone(
  value: unknown
): string {
  const phone =
    asString(value)
      .replace(/\s+/g, "")
      .trim();

  if (/^0\d{10}$/.test(phone)) {
    return `+234${phone.slice(1)}`;
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

function isValidPhone(
  value: unknown
): boolean {
  return /^\+234\d{10}$/.test(
    normalizePhone(value)
  );
}

function uniqueStrings(
  values: string[]
): string[] {
  return [
    ...new Set(
      values
        .map((value) =>
          value.trim()
        )
        .filter(Boolean)
    ),
  ];
}

function makeRequestId(
  userId: string,
  service: string
): string {
  const random =
    crypto.randomUUID()
      .replace(/-/g, "")
      .slice(0, 16);

  return `IYJ-${service.toUpperCase()}-${userId
    .replace(/-/g, "")
    .slice(0, 8)}-${Date.now()}-${random}`;
}

// ============================================================
// JSON / RESPONSE
// ============================================================

function response(
  body: Record<string, any>,
  status = 200
): Response {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type":
          "application/json",
      },
    }
  );
}

function errorResponse(
  message: string,
  status = 400,
  extra: Record<string, any> = {}
): Response {
  return response(
    {
      success: false,
      error: message,
      message,
      ...extra,
    },
    status
  );
}

// ============================================================
// CLUBKONNECT HTTP
// ============================================================

async function clubKonnectGet(
  endpoint: string,
  params: Record<
    string,
    string | number | undefined
  > = {}
): Promise<Record<string, any>> {
  const {
    userId,
    apiKey,
  } =
    getClubKonnectCredentials();

  const url =
    new URL(
      `${CLUBKONNECT_BASE_URL}/${endpoint}`
    );

  url.searchParams.set(
    "UserID",
    userId
  );

  url.searchParams.set(
    "APIKey",
    apiKey
  );

  for (
    const [
      key,
      value,
    ] of Object.entries(params)
  ) {
    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ""
    ) {
      url.searchParams.set(
        key,
        String(value)
      );
    }
  }

  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      30000
    );

  try {
    const result =
      await fetch(
        url.toString(),
        {
          method: "GET",
          headers: {
            Accept:
              "application/json",
          },
          signal:
            controller.signal,
        }
      );

    const text =
      await result.text();

    let parsed: any;

    try {
      parsed =
        text
          ? JSON.parse(text)
          : {};
    } catch {
      throw new Error(
        "ClubKonnect returned an invalid response."
      );
    }

    if (!result.ok) {
      const providerMessage =
        extractProviderMessage(
          parsed
        );

      throw new Error(
        providerMessage ||
          `ClubKonnect HTTP ${result.status}.`
      );
    }

    if (
      !parsed ||
      typeof parsed !==
        "object"
    ) {
      throw new Error(
        "ClubKonnect returned an unexpected response."
      );
    }

    return parsed;
  } catch (error) {
    if (
      error instanceof DOMException &&
      error.name ===
        "AbortError"
    ) {
      throw new Error(
        "ClubKonnect request timed out."
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// ============================================================
// PROVIDER RESPONSE HELPERS
// ============================================================

function extractProviderCode(
  value: any
): number | null {
  const candidates = [
    value?.statuscode,
    value?.statusCode,
    value?.code,
    value?.StatusCode,
  ];

  for (
    const candidate of candidates
  ) {
    if (
      candidate !== undefined &&
      candidate !== null &&
      String(candidate).trim() !== ""
    ) {
      const number =
        Number(candidate);

      if (
        Number.isFinite(number)
      ) {
        return number;
      }
    }
  }

  return null;
}

function extractProviderStatus(
  value: any
): string {
  return asString(
    value?.status ??
      value?.Status ??
      value?.orderstatus ??
      value?.orderStatus ??
      value?.OrderStatus ??
      value?.message ??
      value?.Message
  );
}

function extractProviderMessage(
  value: any
): string {
  return asString(
    value?.orderremark ??
      value?.orderRemark ??
      value?.OrderRemark ??
      value?.remark ??
      value?.message ??
      value?.Message ??
      value?.error ??
      value?.Error ??
      value?.status
  );
}

function extractOrderId(
  value: any
): string {
  return asString(
    value?.orderid ??
      value?.orderId ??
      value?.OrderID
  );
}

function extractRequestId(
  value: any
): string {
  return asString(
    value?.requestid ??
      value?.requestId ??
      value?.RequestID
  );
}

function classifyProviderResponse(
  value: Record<string, any>
): ProviderResult {
  const statusCode =
    extractProviderCode(value);

  const status =
    extractProviderStatus(
      value
    ).toUpperCase();

  const message =
    extractProviderMessage(
      value
    ) ||
    "ClubKonnect response received.";

  const orderId =
    extractOrderId(value);

  const requestId =
    extractRequestId(value);

  /*
   * ClubKonnect's normal asynchronous
   * lifecycle includes:
   *
   * 100 ORDER_RECEIVED
   * 200 ORDER_COMPLETED
   * 201 network/provider pending
   * 300 ORDER_PROCESSED
   *
   * We deliberately do NOT interpret 100
   * as failure.
   */

  if (
    statusCode === 200 ||
    status ===
      "ORDER_COMPLETED"
  ) {
    return {
      state: "success",
      statusCode,
      status:
        status ||
        "ORDER_COMPLETED",
      message,
      orderId,
      requestId,
      raw: value,
    };
  }

  if (
    statusCode === 100 ||
    statusCode === 201 ||
    statusCode === 300 ||
    status ===
      "ORDER_RECEIVED" ||
    status ===
      "ORDER_PROCESSED" ||
    status.includes(
      "PENDING"
    ) ||
    status.includes(
      "RECEIVED"
    ) ||
    status.includes(
      "ONHOLD"
    )
  ) {
    return {
      state: "pending",
      statusCode,
      status,
      message,
      orderId,
      requestId,
      raw: value,
    };
  }

  /*
   * Explicit terminal failure.
   */
  if (
    status.includes(
      "FAILED"
    ) ||
    status.includes(
      "ERROR"
    ) ||
    status.includes(
      "CANCEL"
    ) ||
    status.includes(
      "INVALID"
    ) ||
    statusCode === 199 ||
    statusCode === 299 ||
    statusCode === 399 ||
    (statusCode !== null &&
      statusCode >= 400 &&
      statusCode < 600)
  ) {
    return {
      state: "failed",
      statusCode,
      status,
      message,
      orderId,
      requestId,
      raw: value,
    };
  }

  /*
   * Unknown provider response:
   * safest financial behaviour is pending,
   * not automatic refund.
   */
  return {
    state: "pending",
    statusCode,
    status,
    message,
    orderId,
    requestId,
    raw: value,
  };
}

// ============================================================
// GENERIC CATALOG EXTRACTION
// ============================================================

function extractArray(
  value: any
): any[] {
  if (
    Array.isArray(value)
  ) {
    return value;
  }

  if (
    !value ||
    typeof value !==
      "object"
  ) {
    return [];
  }

  const possibleKeys = [
    "data",
    "Data",
    "items",
    "Items",
    "plans",
    "Plans",
    "networks",
    "Networks",
    "billers",
    "Billers",
    "packages",
    "Packages",
    "result",
    "Result",
  ];

  for (
    const key of possibleKeys
  ) {
    if (
      Array.isArray(
        value[key]
      )
    ) {
      return value[key];
    }
  }

  /*
   * Some ClubKonnect catalogue responses
   * are objects keyed by provider code.
   */
  const values =
    Object.values(value);

  if (
    values.length > 0 &&
    values.every(
      (entry) =>
        entry !== null &&
        typeof entry ===
          "object"
    )
  ) {
    return values;
  }

  return [];
}

function firstValue(
  item: any,
  keys: string[]
): any {
  for (
    const key of keys
  ) {
    if (
      item?.[key] !==
        undefined &&
      item?.[key] !== null &&
      String(
        item[key]
      ).trim() !== ""
    ) {
      return item[key];
    }
  }

  return undefined;
}

function itemCode(
  item: any
): string {
  return asString(
    firstValue(
      item,
      [
        "item_code",
        "ItemCode",
        "product_code",
        "ProductCode",
        "variation_code",
        "VariationCode",
        "code",
        "Code",
        "plan_code",
        "PlanCode",
        "package_code",
        "PackageCode",
        "value",
        "Value",
        "id",
        "ID",
      ]
    )
  );
}

function itemName(
  item: any
): string {
  return asString(
    firstValue(
      item,
      [
        "name",
        "Name",
        "product_name",
        "ProductName",
        "productname",
        "Productname",
        "description",
        "Description",
        "plan_name",
        "PlanName",
        "package_name",
        "PackageName",
        "network_name",
        "NetworkName",
        "company_name",
        "CompanyName",
        "biller_name",
        "BillerName",
      ]
    ),
    itemCode(item)
  );
}

function providerAmount(
  item: any
): number {
  return positiveNumber(
    firstValue(
      item,
      [
        "amount",
        "Amount",
        "price",
        "Price",
        "cost",
        "Cost",
        "discounted_price",
        "DiscountedPrice",
        "discount_price",
        "DiscountPrice",
        "value",
        "Value",
      ]
    )
  );
}

function networkCode(
  item: any
): string {
  return asString(
    firstValue(
      item,
      [
        "network_code",
        "NetworkCode",
        "network",
        "Network",
        "mobilenetwork",
        "MobileNetwork",
        "mobile_network",
        "Mobile_Network",
        "code",
        "Code",
        "id",
        "ID",
      ]
    )
  );
}

function billerCode(
  item: any
): string {
  return asString(
    firstValue(
      item,
      [
        "biller_code",
        "BillerCode",
        "company_code",
        "CompanyCode",
        "electric_company",
        "ElectricCompany",
        "code",
        "Code",
        "id",
        "ID",
      ]
    )
  );
}

function normalizeCatalogItem(
  item: any,
  service: ServiceType,
  index: number
): CatalogItem | null {
  const code =
    itemCode(item);

  if (!code) {
    return null;
  }

  const provider =
    providerAmount(item);

  const name =
    itemName(item);

  const network =
    networkCode(item);

  const biller =
    billerCode(item);

  const validity =
    asString(
      firstValue(
        item,
        [
          "validity",
          "Validity",
          "duration",
          "Duration",
          "days",
          "Days",
        ]
      )
    );

  const category =
    asString(
      firstValue(
        item,
        [
          "category",
          "Category",
          "type",
          "Type",
        ]
      )
    );

  const minimum =
    positiveNumber(
      firstValue(
        item,
        [
          "minimum",
          "Minimum",
          "min",
          "Min",
        ]
      )
    );

  const maximum =
    positiveNumber(
      firstValue(
        item,
        [
          "maximum",
          "Maximum",
          "max",
          "Max",
        ]
      )
    );

  const result: CatalogItem =
    {
      id: `${service}-${index}-${code}`,
      code,
      name,

      provider_amount:
        provider,

      selling_price:
        provider > 0
          ? sellingPrice(
              provider,
              service
            )
          : 0,

      amount:
        provider,

      price:
        provider,

      network_code:
        network || undefined,

      network:
        network || undefined,

      biller_code:
        biller || undefined,

      company_code:
        biller || undefined,

      validity:
        validity || undefined,

      duration:
        validity || undefined,

      category:
        category || undefined,

      minimum:
        minimum || undefined,

      maximum:
        maximum || undefined,

      logo:
        firstValue(
          item,
          [
            "logo",
            "Logo",
            "image",
            "Image",
          ]
        ) ??
        null,

      /*
       * Preserve original provider fields.
       * This is useful to the UI without trusting
       * them during purchase.
       */
      provider_item:
        item,
    };

  return result;
}

function deduplicateCatalog(
  items: CatalogItem[]
): CatalogItem[] {
  const map =
    new Map<
      string,
      CatalogItem
    >();

  for (
    const item of items
  ) {
    const key =
      `${item.code}|${
        item.network_code ??
        item.biller_code ??
        ""
      }`;

    if (!map.has(key)) {
      map.set(
        key,
        item
      );
    }
  }

  return [
    ...map.values(),
  ];
}

// ============================================================
// AIRTIME CATALOG
// ============================================================

async function getAirtimeNetworks() {
  const raw =
    await clubKonnectGet(
      "APIAirtimeNetworkV2.asp"
    );

  const source =
    extractArray(raw);

  const networks =
    source
      .map(
        (
          item,
          index
        ) => {
          const code =
            networkCode(item);

          const name =
            itemName(item);

          if (!code) {
            return null;
          }

          return {
            id:
              `airtime-network-${index}`,
            code,
            network_code:
              code,
            network:
              code,
            name,
            logo:
              firstValue(
                item,
                [
                  "logo",
                  "Logo",
                  "image",
                  "Image",
                ]
              ) ??
              null,
          };
        }
      )
      .filter(Boolean);

  return {
    networks:
      networks as any[],
    raw,
  };
}

// ============================================================
// DATA CATALOG
// ============================================================

async function getDataNetworks() {
  const raw =
    await clubKonnectGet(
      "APIDatabundleNetworkV2.asp"
    );

  const source =
    extractArray(raw);

  const networks =
    source
      .map(
        (
          item,
          index
        ) => {
          const code =
            networkCode(item);

          const name =
            itemName(item);

          if (!code) {
            return null;
          }

          return {
            id:
              `data-network-${index}`,
            code,
            network_code:
              code,
            network:
              code,
            name,
            logo:
              firstValue(
                item,
                [
                  "logo",
                  "Logo",
                  "image",
                  "Image",
                ]
              ) ??
              null,
          };
        }
      )
      .filter(Boolean);

  return {
    networks:
      networks as any[],
    raw,
  };
}

function normalizeDataPlans(
  raw: Record<string, any>
): any[] {
  const source =
    extractArray(raw);

  /*
   * The API can return either an array
   * or a network-keyed object.
   *
   * We deliberately preserve all plans.
   */
  const plans: any[] = [];

  for (
    const item of source
  ) {
    if (
      item === null ||
      item === undefined
    ) {
      continue;
    }

    if (
      typeof item ===
        "object" &&
      !Array.isArray(item)
    ) {
      const code =
        itemCode(item);

      const name =
        itemName(item);

      const provider =
        providerAmount(item);

      /*
       * Some catalogue responses contain
       * nested plans.
       */
      const nested =
        extractArray(
          firstValue(
            item,
            [
              "plans",
              "Plans",
              "data",
              "Data",
              "items",
              "Items",
            ]
          )
        );

      if (
        nested.length > 0
      ) {
        for (
          const nestedItem of nested
        ) {
          plans.push({
            ...nestedItem,

            network_code:
              networkCode(
                nestedItem
              ) ||
              networkCode(
                item
              ),

            network:
              networkCode(
                nestedItem
              ) ||
              networkCode(
                item
              ),
          });
        }

        continue;
      }

      if (
        code &&
        provider > 0
      ) {
        plans.push({
          ...item,

          network_code:
            networkCode(
              item
            ),

          network:
            networkCode(
              item
            ),
        });

        continue;
      }

      /*
       * If the object itself looks like a
       * network keyed container, flatten it.
       */
      for (
        const [
          key,
          nestedValue,
        ] of Object.entries(
          item
        )
      ) {
        if (
          nestedValue &&
          typeof nestedValue ===
            "object"
        ) {
          const nestedItems =
            Array.isArray(
              nestedValue
            )
              ? nestedValue
              : [
                  nestedValue,
                ];

          for (
            const nestedItem of nestedItems
          ) {
            plans.push({
              ...nestedItem,

              network_code:
                networkCode(
                  nestedItem
                ) ||
                key,

              network:
                networkCode(
                  nestedItem
                ) ||
                key,
            });
          }
        }
      }
    }
  }

  /*
   * If extractArray() did not discover
   * anything useful, recursively inspect
   * the original response.
   */
  if (
    plans.length === 0
  ) {
    const visit = (
      value: any,
      inheritedNetwork = ""
    ) => {
      if (
        value === null ||
        value === undefined
      ) {
        return;
      }

      if (
        Array.isArray(value)
      ) {
        for (
          const entry of value
        ) {
          visit(
            entry,
            inheritedNetwork
          );
        }

        return;
      }

      if (
        typeof value !==
          "object"
      ) {
        return;
      }

      const code =
        itemCode(value);

      const provider =
        providerAmount(value);

      if (
        code &&
        provider > 0
      ) {
        plans.push({
          ...value,

          network_code:
            networkCode(
              value
            ) ||
            inheritedNetwork,

          network:
            networkCode(
              value
            ) ||
            inheritedNetwork,
        });
      }

      for (
        const [
          key,
          child,
        ] of Object.entries(
          value
        )
      ) {
        if (
          child &&
          typeof child ===
            "object"
        ) {
          visit(
            child,
            inheritedNetwork ||
              key
          );
        }
      }
    };

    visit(raw);
  }

  return plans;
}

async function getDataPlans() {
  const raw =
    await clubKonnectGet(
      "APIDatabundlePlansV2.asp"
    );

  return {
    plans:
      normalizeDataPlans(
        raw
      ),
    raw,
  };
}

// ============================================================
// CABLE CATALOG
// ============================================================

async function getCableTypes() {
  const raw =
    await clubKonnectGet(
      "APICableTVTypeV2.asp"
    );

  const source =
    extractArray(raw);

  const billers =
    source
      .map(
        (
          item,
          index
        ) => {
          const code =
            billerCode(item);

          const name =
            itemName(item);

          if (!code) {
            return null;
          }

          return {
            id:
              `cable-${index}-${code}`,
            code,
            biller_code:
              code,
            cable_code:
              code,
            network_code:
              code,
            name,
            logo:
              firstValue(
                item,
                [
                  "logo",
                  "Logo",
                  "image",
                  "Image",
                ]
              ) ??
              null,
          };
        }
      )
      .filter(Boolean);

  return {
    billers:
      billers as any[],
    raw,
  };
}

async function getCablePackages() {
  const raw =
    await clubKonnectGet(
      "APICableTVPackagesV2.asp"
    );

  const source =
    extractArray(raw);

  const packages: any[] = [];

  for (
    const item of source
  ) {
    if (
      !item ||
      typeof item !==
        "object"
    ) {
      continue;
    }

    const parentNetwork =
      networkCode(item) ||
      billerCode(item);

    const nested =
      extractArray(
        firstValue(
          item,
          [
            "packages",
            "Packages",
            "data",
            "Data",
            "items",
            "Items",
          ]
        )
      );

    if (
      nested.length > 0
    ) {
      for (
        const nestedItem of nested
      ) {
        packages.push({
          ...nestedItem,

          network_code:
            networkCode(
              nestedItem
            ) ||
            parentNetwork,

          biller_code:
            billerCode(
              nestedItem
            ) ||
            parentNetwork,

          cable_tv:
            networkCode(
              nestedItem
            ) ||
            parentNetwork,
        });
      }
    } else {
      packages.push({
        ...item,

        network_code:
          networkCode(
            item
          ),

        biller_code:
          billerCode(
            item
          ),

        cable_tv:
          networkCode(
            item
          ) ||
          billerCode(
            item
          ),
      });
    }
  }

  return {
    plans:
      packages,
    raw,
  };
}

// ============================================================
// SMILE / WAEC / JAMB
// ============================================================

async function getSmilePackages() {
  const raw =
    await clubKonnectGet(
      "APISmilePackagesV2.asp"
    );

  return {
    plans:
      extractArray(raw),
    raw,
  };
}

async function getWaecPackages() {
  const raw =
    await clubKonnectGet(
      "APIWAECPackagesV2.asp"
    );

  return {
    plans:
      extractArray(raw),
    raw,
  };
}

async function getJambPackages() {
  const raw =
    await clubKonnectGet(
      "APIJAMBPackagesV2.asp"
    );

  return {
    plans:
      extractArray(raw),
    raw,
  };
}

// ============================================================
// AIRTIME E-PIN
// ============================================================

async function getAirtimePinCatalog() {
  const raw =
    await clubKonnectGet(
      "APIEPINDiscountV2.asp"
    );

  const source =
    extractArray(raw);

  const items =
    source
      .map(
        (
          item,
          index
        ) => {
          const code =
            itemCode(item);

          const value =
            positiveNumber(
              firstValue(
                item,
                [
                  "value",
                  "Value",
                  "amount",
                  "Amount",
                ]
              )
            );

          if (
            value <= 0
          ) {
            return null;
          }

          return {
            id:
              `airtime-epin-${index}`,
            code:
              code ||
              String(value),
            name:
              itemName(item) ||
              `₦${value.toLocaleString(
                "en-NG"
              )} Airtime E-PIN`,

            value,

            provider_amount:
              providerAmount(
                item
              ) ||
              value,

            selling_price:
              sellingPrice(
                providerAmount(
                  item
                ) ||
                  value,
                "airtime-card"
              ),

            network_code:
              networkCode(
                item
              ) ||
              undefined,

            network:
              networkCode(
                item
              ) ||
              undefined,

            provider_item:
              item,
          };
        }
      )
      .filter(Boolean);

  return {
    items:
      items as any[],
    raw,
  };
}

// ============================================================
// DATA E-PIN
// ============================================================

async function getDataPinCatalog() {
  const {
    plans,
    raw,
  } =
    await getDataPlans();

  /*
   * Data E-PIN uses the same ClubKonnect
   * data-plan catalogue, but the purchase
   * endpoint is different.
   */
  const items =
    plans.map(
      (
        item,
        index
      ) => {
        const normalized =
          normalizeCatalogItem(
            item,
            "data-card",
            index
          );

        if (!normalized) {
          return null;
        }

        return {
          ...normalized,

          data_plan:
            normalized.code,

          network_code:
            normalized.network_code,

          mobile_network:
            normalized.network_code,
        };
      }
    ).filter(Boolean);

  return {
    items:
      items as any[],
    plans:
      items as any[],
    raw,
  };
}

// ============================================================
// ELECTRICITY
// ============================================================

/**
 * ClubKonnect's current official electricity
 * documentation exposes the purchase and
 * verification APIs, while the published
 * "Available Electricity Companies" section
 * is dynamically loaded and does not expose a
 * usable catalogue URL in the documentation.
 *
 * Therefore we intentionally do not pretend that
 * APIDatabundleNetworkV2 or another unrelated endpoint
 * is the electricity catalogue.
 *
 * These are the commonly supported company codes
 * documented/used by ClubKonnect's electricity flow.
 *
 * The backend still validates the selected code by
 * asking ClubKonnect to verify the meter before debit.
 */
const ELECTRICITY_BILLERS = [
  {
    code: "01",
    biller_code: "01",
    company_code: "01",
    name: "Eko Electricity Distribution Company (EKEDC)",
  },
  {
    code: "02",
    biller_code: "02",
    company_code: "02",
    name: "Ikeja Electricity Distribution Company (IKEDC)",
  },
  {
    code: "03",
    biller_code: "03",
    company_code: "03",
    name: "Abuja Electricity Distribution Company (AEDC)",
  },
  {
    code: "04",
    biller_code: "04",
    company_code: "04",
    name: "Kano Electricity Distribution Company (KEDCO)",
  },
  {
    code: "05",
    biller_code: "05",
    company_code: "05",
    name: "Port Harcourt Electricity Distribution Company (PHEDC)",
  },
  {
    code: "06",
    biller_code: "06",
    company_code: "06",
    name: "Jos Electricity Distribution Company (JED)",
  },
  {
    code: "07",
    biller_code: "07",
    company_code: "07",
    name: "Kaduna Electricity Distribution Company (KAEDCO)",
  },
  {
    code: "08",
    biller_code: "08",
    company_code: "08",
    name: "Ibadan Electricity Distribution Company (IBEDC)",
  },
  {
    code: "09",
    biller_code: "09",
    company_code: "09",
    name: "Benin Electricity Distribution Company (BEDC)",
  },
  {
    code: "10",
    biller_code: "10",
    company_code: "10",
    name: "Yola Electricity Distribution Company (YEDC)",
  },
];

function getElectricityCatalog() {
  return ELECTRICITY_BILLERS.map(
    (
      item
    ) => ({
      ...item,

      network_code:
        item.code,

      network:
        item.code,

      minimum:
        100,

      maximum:
        1000000,
    })
  );
}

// ============================================================
// CATALOG NORMALIZATION
// ============================================================

function normalizeCatalogArray(
  rawItems: any[],
  service: ServiceType
): CatalogItem[] {
  return deduplicateCatalog(
    rawItems
      .map(
        (
          item,
          index
        ) =>
          normalizeCatalogItem(
            item,
            service,
            index
          )
      )
      .filter(
        (
          item
        ): item is CatalogItem =>
          Boolean(item)
      )
  );
}

function filterByNetwork(
  items: CatalogItem[],
  networkCode: string
): CatalogItem[] {
  const code =
    networkCode
      .trim()
      .toLowerCase();

  if (!code) {
    return items;
  }

  return items.filter(
    (
      item
    ) => {
      const candidates =
        [
          item.network_code,
          item.network,
          item.biller_code,
          item.company_code,
          item.cable_tv,
          item.mobile_network,
        ]
          .filter(Boolean)
          .map(
            (value) =>
              String(value)
                .trim()
                .toLowerCase()
          );

      return candidates.includes(
        code
      );
    }
  );
}

// ============================================================
// FULL CATALOG ACTION
// ============================================================

async function getCatalog(
  service: ServiceType,
  networkCode = "",
  billerCodeValue = ""
) {
  switch (
    service
  ) {
    case "airtime": {
      const {
        networks,
      } =
        await getAirtimeNetworks();

      return {
        networks,
        billers: [],
        plans: [],
        items: [],
      };
    }

    case "data": {
      const [
        networkResult,
        plansResult,
      ] =
        await Promise.all([
          getDataNetworks(),
          getDataPlans(),
        ]);

      const normalizedPlans =
        normalizeCatalogArray(
          plansResult.plans,
          "data"
        );

      const filtered =
        filterByNetwork(
          normalizedPlans,
          networkCode
        );

      return {
        networks:
          networkResult.networks,

        billers: [],

        plans:
          filtered,

        items:
          filtered,
      };
    }

    case "electricity": {
      const billers =
        getElectricityCatalog();

      return {
        networks:
          billers,

        billers,

        plans: [],

        items: [],
      };
    }

    case "cable": {
      const [
        typesResult,
        packagesResult,
      ] =
        await Promise.all([
          getCableTypes(),
          getCablePackages(),
        ]);

      const normalizedPackages =
        normalizeCatalogArray(
          packagesResult.plans,
          "cable"
        );

      const filterCode =
        networkCode ||
        billerCodeValue;

      const filtered =
        filterCode
          ? filterByNetwork(
              normalizedPackages,
              filterCode
            )
          : normalizedPackages;

      return {
        networks:
          typesResult.billers,

        billers:
          typesResult.billers,

        plans:
          filtered,

        items:
          filtered,
      };
    }

    case "airtime-card": {
      const result =
        await getAirtimePinCatalog();

      return {
        networks: [],
        billers: [],
        plans: [],
        items:
          result.items,
      };
    }

    case "data-card": {
      const result =
        await getDataPinCatalog();

      const filtered =
        networkCode
          ? filterByNetwork(
              result.items,
              networkCode
            )
          : result.items;

      return {
        networks: [],
        billers: [],
        plans:
          filtered,
        items:
          filtered,
      };
    }

    case "smile": {
      const result =
        await getSmilePackages();

      const normalized =
        normalizeCatalogArray(
          result.plans,
          "smile"
        );

      return {
        networks: [
          {
            code:
              "smile-direct",
            network_code:
              "smile-direct",
            network:
              "smile-direct",
            name:
              "Smile",
          },
        ],

        billers: [],

        plans:
          normalized,

        items:
          normalized,
      };
    }

    case "waec": {
      const result =
        await getWaecPackages();

      const normalized =
        normalizeCatalogArray(
          result.plans,
          "waec"
        );

      return {
        networks: [],
        billers: [],

        plans:
          normalized,

        items:
          normalized,
      };
    }

    case "jamb": {
      const result =
        await getJambPackages();

      const normalized =
        normalizeCatalogArray(
          result.plans,
          "jamb"
        );

      return {
        networks: [],
        billers: [],

        plans:
          normalized,

        items:
          normalized,
      };
    }

    default:
      throw new Error(
        "Unsupported service."
      );
  }
}

// ============================================================
// CATALOG PRICE LOOKUP
// ============================================================

async function findCatalogItem(
  service: ServiceType,
  selectedCode: string,
  networkCode = ""
): Promise<CatalogItem | null> {
  const catalog =
    await getCatalog(
      service,
      networkCode,
      networkCode
    );

  const allItems =
    [
      ...(Array.isArray(
        catalog.items
      )
        ? catalog.items
        : []),

      ...(Array.isArray(
        catalog.plans
      )
        ? catalog.plans
        : []),
    ];

  const code =
    selectedCode
      .trim()
      .toLowerCase();

  const found =
    allItems.find(
      (
        item
      ) =>
        String(
          item.code
        )
          .trim()
          .toLowerCase() ===
        code
    );

  return (
    found ?? null
  );
}

// ============================================================
// WALLET / TRANSACTION HELPERS
// ============================================================

function requireAdminClient() {
  if (!adminClient) {
    throw new Error(
      "Supabase admin client is unavailable."
    );
  }

  return adminClient;
}

async function createTransaction(
  userId: string,
  service: ServiceType,
  amount: number,
  reference: string,
  metadata: Record<string, any>
) {
  const client =
    requireAdminClient();

  const { data, error } =
    await client
      .from(
        "transactions"
      )
      .insert({
        user_id:
          userId,

        transaction_type:
          "service_payment",

        amount,

        reference_number:
          reference,

        status:
          "pending",

        provider:
          "clubkonnect",

        metadata,
      })
      .select(
        "id, reference_number, status"
      )
      .single();

  if (error) {
    throw new Error(
      `Unable to create service transaction: ${error.message}`
    );
  }

  return data;
}

async function getTransactionByReference(
  reference: string
) {
  const client =
    requireAdminClient();

  const { data, error } =
    await client
      .from(
        "transactions"
      )
      .select("*")
      .eq(
        "reference_number",
        reference
      )
      .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to read transaction: ${error.message}`
    );
  }

  return data;
}

async function updateTransaction(
  reference: string,
  updates: Record<string, any>
) {
  const client =
    requireAdminClient();

  const { error } =
    await client
      .from(
        "transactions"
      )
      .update(
        updates
      )
      .eq(
        "reference_number",
        reference
      );

  if (error) {
    throw new Error(
      `Unable to update transaction: ${error.message}`
    );
  }
}

async function debitWallet(
  userId: string,
  amount: number,
  reference: string,
  description: string
) {
  const client =
    requireAdminClient();

  const { data, error } =
    await client.rpc(
      "debit_wallet",
      {
        p_user_id:
          userId,

        p_amount:
          amount,

        p_reference:
          reference,

        p_description:
          description,
      }
    );

  if (error) {
    throw new Error(
      error.message ||
        "Unable to debit wallet."
    );
  }

  /*
   * The RPC may return either a
   * boolean or an object depending on
   * the installed database version.
   */
  if (
    data === false ||
    data?.success === false
  ) {
    throw new Error(
      data?.message ||
        "Insufficient wallet balance."
    );
  }

  return data;
}

async function refundWallet(
  userId: string,
  amount: number,
  reference: string,
  description: string
) {
  const client =
    requireAdminClient();

  const { data, error } =
    await client.rpc(
      "refund_wallet",
      {
        p_user_id:
          userId,

        p_amount:
          amount,

        p_reference:
          reference,

        p_description:
          description,
      }
    );

  if (error) {
    throw new Error(
      error.message ||
        "Unable to refund wallet."
    );
  }

  if (
    data === false ||
    data?.success === false
  ) {
    throw new Error(
      data?.message ||
        "Wallet refund failed."
    );
  }

  return data;
}

// ============================================================
// SAFE TRANSACTION CREATION
// ============================================================

async function createOrGetPendingTransaction(
  userId: string,
  service: ServiceType,
  amount: number,
  reference: string,
  metadata: Record<string, any>
) {
  const existing =
    await getTransactionByReference(
      reference
    );

  if (existing) {
    return {
      transaction:
        existing,

      created:
        false,
    };
  }

  try {
    const transaction =
      await createTransaction(
        userId,
        service,
        amount,
        reference,
        metadata
      );

    return {
      transaction,
      created:
        true,
    };
  } catch (error) {
    /*
     * A concurrent request may have
     * created the same reference.
     *
     * Read it again before failing.
     */
    const race =
      await getTransactionByReference(
        reference
      );

    if (race) {
      return {
        transaction:
          race,

        created:
          false,
      };
    }

    throw error;
  }
}

// ============================================================
// METER VERIFICATION
// ============================================================

async function verifyMeter(
  body: Record<string, any>
) {
  const company =
    asString(
      body.electric_company ??
        body.company_code ??
        body.biller_code
    );

  const meterType =
    asString(
      body.meter_type ??
        body.meterType
    );

  const meter =
    asString(
      body.meter_number ??
        body.meter_no ??
        body.meterNo
    );

  if (!company) {
    throw new Error(
      "Electricity company is required."
    );
  }

  if (!meterType) {
    throw new Error(
      "Meter type is required."
    );
  }

  if (!meter) {
    throw new Error(
      "Meter number is required."
    );
  }

  if (
    meterType !== "01" &&
    meterType !== "02"
  ) {
    throw new Error(
      "Invalid meter type."
    );
  }

  const raw =
    await clubKonnectGet(
      "APIVerifyElectricityV1.asp",
      {
        ElectricCompany:
          company,

        MeterNo:
          meter,

        MeterType:
          meterType,
      }
    );

  const customerName =
    asString(
      raw.customer_name ??
        raw.customerName ??
        raw.CustomerName
    );

  if (
    !customerName ||
    customerName.toUpperCase() ===
      "INVALID_METERNO"
  ) {
    return {
      success:
        false,

      verified:
        false,

      customer_name:
        customerName,

      error:
        "The meter number could not be verified.",

      raw,
    };
  }

  return {
    success:
      true,

    verified:
      true,

    customer_name:
      customerName,

    meter_number:
      meter,

    meter_type:
      meterType,

    electric_company:
      company,

    raw,
  };
}

// ============================================================
// CABLE VERIFICATION
// ============================================================

async function verifyCable(
  body: Record<string, any>
) {
  const cable =
    asString(
      body.cable_tv ??
        body.cable_code ??
        body.network_code ??
        body.biller_code
    );

  const smartCard =
    asString(
      body.smartcard_number ??
        body.smartCardNumber ??
        body.smartcard ??
        body.smartcard_no
    );

  if (!cable) {
    throw new Error(
      "TV service is required."
    );
  }

  if (!smartCard) {
    throw new Error(
      "Smart card number is required."
    );
  }

  const raw =
    await clubKonnectGet(
      "APIVerifyCableTVV1.asp",
      {
        CableTV:
          cable,

        SmartCardNo:
          smartCard,
      }
    );

  const customerName =
    asString(
      raw.customer_name ??
        raw.customerName ??
        raw.CustomerName
    );

  if (
    !customerName ||
    customerName.toUpperCase() ===
      "INVALID_SMARTCARDNO"
  ) {
    return {
      success:
        false,

      verified:
        false,

      customer_name:
        customerName,

      error:
        "The smart card number could not be verified.",

      raw,
    };
  }

  return {
    success:
      true,

    verified:
      true,

    customer_name:
      customerName,

    smartcard_number:
      smartCard,

    cable_tv:
      cable,

    raw,
  };
}

// ============================================================
// PURCHASE INPUT HELPERS
// ============================================================

function bodyString(
  body: Record<string, any>,
  ...keys: string[]
): string {
  for (
    const key of keys
  ) {
    const value =
      asString(
        body[key]
      );

    if (value) {
      return value;
    }
  }

  return "";
}

function getRequestedAmount(
  body: Record<string, any>
): number {
  return positiveNumber(
    body.amount ??
      body.value ??
      body.selling_amount
  );
}

function getQuantity(
  body: Record<string, any>
): number {
  const quantity =
    Math.floor(
      asNumber(
        body.quantity,
        1
      )
    );

  return quantity >= 1
    ? quantity
    : 1;
}

function assertQuantity(
  quantity: number
) {
  if (
    quantity < 1 ||
    quantity > 100
  ) {
    throw new Error(
      "E-PIN quantity must be between 1 and 100."
    );
  }
}

// ============================================================
// PURCHASE CATALOG PRICE RESOLUTION
// ============================================================

async function resolveFixedProduct(
  service: ServiceType,
  body: Record<string, any>,
  code: string,
  networkCode = ""
) {
  if (!code) {
    throw new Error(
      "A valid service option is required."
    );
  }

  const item =
    await findCatalogItem(
      service,
      code,
      networkCode
    );

  if (!item) {
    throw new Error(
      "The selected service option is no longer available. Please refresh and select it again."
    );
  }

  const provider =
    positiveNumber(
      item.provider_amount ??
        item.amount ??
        item.price ??
        item.value
    );

  if (
    provider <= 0
  ) {
    throw new Error(
      "The selected service option does not have a valid provider price."
    );
  }

  const selling =
    sellingPrice(
      provider,
      service
    );

  return {
    item,
    providerAmount:
      provider,
    sellingAmount:
      selling,
  };
}

// ============================================================
// PURCHASE PAYLOAD BUILDERS
// ============================================================

function callbackParams(
  requestId: string
) {
  const callback =
    getCallbackUrl();

  return {
    RequestID:
      requestId,

    ...(callback
      ? {
          CallBackURL:
            callback,
        }
      : {}),
  };
}

// ============================================================
// AIRTIME PURCHASE
// ============================================================

async function purchaseAirtime(
  body: Record<string, any>,
  requestId: string
) {
  const network =
    bodyString(
      body,
      "network_code",
      "mobile_network",
      "network"
    );

  const phone =
    normalizePhone(
      bodyString(
        body,
        "phone",
        "phoneNumber",
        "customer"
      )
    );

  const amount =
    getRequestedAmount(
      body
    );

  if (!network) {
    throw new Error(
      "Network is required."
    );
  }

  if (
    !isValidPhone(phone)
  ) {
    throw new Error(
      "Enter a valid Nigerian phone number."
    );
  }

  if (
    amount < 50 ||
    amount > 200000
  ) {
    throw new Error(
      "Airtime amount must be between ₦50 and ₦200,000."
    );
  }

  const raw =
    await clubKonnectGet(
      "APIAirtimeV1.asp",
      {
        MobileNetwork:
          network,

        Amount:
          amount,

        MobileNumber:
          phone,

        ...callbackParams(
          requestId
        ),
      }
    );

  return {
    raw,

    providerAmount:
      amount,

    purchaseAmount:
      amount,

    phone,

    network,
  };
}

// ============================================================
// DATA PURCHASE
// ============================================================

async function purchaseData(
  body: Record<string, any>,
  requestId: string
) {
  const network =
    bodyString(
      body,
      "network_code",
      "mobile_network",
      "network"
    );

  const phone =
    normalizePhone(
      bodyString(
        body,
        "phone",
        "phoneNumber",
        "customer"
      )
    );

  const plan =
    bodyString(
      body,
      "data_plan",
      "dataPlan",
      "item_code",
      "product_code",
      "variation_code"
    );

  if (!network) {
    throw new Error(
      "Network is required."
    );
  }

  if (
    !isValidPhone(phone)
  ) {
    throw new Error(
      "Enter a valid Nigerian phone number."
    );
  }

  if (!plan) {
    throw new Error(
      "Data plan is required."
    );
  }

  const resolved =
    await resolveFixedProduct(
      "data",
      body,
      plan,
      network
    );

  const raw =
    await clubKonnectGet(
      "APIDatabundleV1.asp",
      {
        MobileNetwork:
          network,

        DataPlan:
          plan,

        MobileNumber:
          phone,

        ...callbackParams(
          requestId
        ),
      }
    );

  return {
    raw,

    providerAmount:
      resolved.providerAmount,

    purchaseAmount:
      resolved.sellingAmount,

    phone,

    network,

    dataPlan:
      plan,

    item:
      resolved.item,
  };
}

// ============================================================
// ELECTRICITY PURCHASE
// ============================================================

async function purchaseElectricity(
  body: Record<string, any>,
  requestId: string
) {
  const company =
    bodyString(
      body,
      "electric_company",
      "company_code",
      "biller_code",
      "network_code"
    );

  const meterType =
    bodyString(
      body,
      "meter_type",
      "meterType"
    );

  const meter =
    bodyString(
      body,
      "meter_number",
      "meter_no",
      "meterNo",
      "customer"
    );

  const phoneRaw =
    bodyString(
      body,
      "phone",
      "phoneNumber"
    );

  const phone =
    phoneRaw
      ? normalizePhone(
          phoneRaw
        )
      : "";

  const amount =
    getRequestedAmount(
      body
    );

  if (!company) {
    throw new Error(
      "Electricity company is required."
    );
  }

  if (!meterType) {
    throw new Error(
      "Meter type is required."
    );
  }

  if (!meter) {
    throw new Error(
      "Meter number is required."
    );
  }

  if (
    meterType !== "01" &&
    meterType !== "02"
  ) {
    throw new Error(
      "Invalid meter type."
    );
  }

  if (
    amount <= 0
  ) {
    throw new Error(
      "Electricity amount is required."
    );
  }

  if (
    phone &&
    !isValidPhone(phone)
  ) {
    throw new Error(
      "Invalid notification phone number."
    );
  }

  /*
   * ALWAYS verify before charging.
   */
  const verification =
    await verifyMeter({
      electric_company:
        company,

      meter_type:
        meterType,

      meter_number:
        meter,
    });

  if (
    verification.success !==
      true
  ) {
    throw new Error(
      verification.error ||
        "The meter could not be verified."
    );
  }

  const raw =
    await clubKonnectGet(
      "APIElectricityV1.asp",
      {
        ElectricCompany:
          company,

        MeterType:
          meterType,

        MeterNo:
          meter,

        Amount:
          amount,

        ...(phone
          ? {
              PhoneNo:
                phone,
            }
          : {}),

        ...callbackParams(
          requestId
        ),
      }
    );

  return {
    raw,

    providerAmount:
      amount,

    purchaseAmount:
      sellingPrice(
        amount,
        "electricity"
      ),

    electricCompany:
      company,

    meterType,

    meterNumber:
      meter,

    customerName:
      verification.customer_name,
  };
}

// ============================================================
// CABLE PURCHASE
// ============================================================

async function purchaseCable(
  body: Record<string, any>,
  requestId: string
) {
  const cable =
    bodyString(
      body,
      "cable_tv",
      "cable_code",
      "network_code",
      "biller_code"
    );

  const packageCode =
    bodyString(
      body,
      "package",
      "package_code",
      "item_code",
      "product_code",
      "variation_code"
    );

  const smartCard =
    bodyString(
      body,
      "smartcard_number",
      "smartCardNumber",
      "smartcard",
      "smartcard_no",
      "customer"
    );

  const phoneRaw =
    bodyString(
      body,
      "phone",
      "phoneNumber"
    );

  const phone =
    phoneRaw
      ? normalizePhone(
          phoneRaw
        )
      : "";

  if (!cable) {
    throw new Error(
      "TV service is required."
    );
  }

  if (!packageCode) {
    throw new Error(
      "Cable package is required."
    );
  }

  if (!smartCard) {
    throw new Error(
      "Smart card number is required."
    );
  }

  if (
    phone &&
    !isValidPhone(phone)
  ) {
    throw new Error(
      "Invalid phone number."
    );
  }

  /*
   * Resolve package price server-side.
   */
  const resolved =
    await resolveFixedProduct(
      "cable",
      body,
      packageCode,
      cable
    );

  /*
   * Verify smartcard before charging.
   */
  const verification =
    await verifyCable({
      cable_tv:
        cable,

      smartcard_number:
        smartCard,
    });

  if (
    verification.success !==
      true
  ) {
    throw new Error(
      verification.error ||
        "The smart card could not be verified."
    );
  }

  const raw =
    await clubKonnectGet(
      "APICableTVV1.asp",
      {
        CableTV:
          cable,

        Package:
          packageCode,

        SmartCardNo:
          smartCard,

        ...(phone
          ? {
              PhoneNo:
                phone,
            }
          : {}),

        ...callbackParams(
          requestId
        ),
      }
    );

  return {
    raw,

    providerAmount:
      resolved.providerAmount,

    purchaseAmount:
      resolved.sellingAmount,

    cableTv:
      cable,

    package:
      packageCode,

    smartcard:
      smartCard,

    customerName:
      verification.customer_name,

    item:
      resolved.item,
  };
}

// ============================================================
// AIRTIME E-PIN PURCHASE
// ============================================================

async function purchaseAirtimeEpin(
  body: Record<string, any>,
  requestId: string
) {
  const network =
    bodyString(
      body,
      "network_code",
      "mobile_network",
      "network"
    );

  const value =
    positiveNumber(
      body.value ??
        body.amount
    );

  const quantity =
    getQuantity(
      body
    );

  assertQuantity(
    quantity
  );

  if (!network) {
    throw new Error(
      "Network is required."
    );
  }

  if (
    ![100, 200, 500].includes(
      value
    )
  ) {
    throw new Error(
      "Airtime E-PIN value must be ₦100, ₦200 or ₦500."
    );
  }

  const providerAmount =
    value * quantity;

  const purchaseAmount =
    sellingPrice(
      providerAmount,
      "airtime-card"
    );

  const raw =
    await clubKonnectGet(
      "APIEPINV1.asp",
      {
        MobileNetwork:
          network,

        Value:
          value,

        Quantity:
          quantity,

        ...callbackParams(
          requestId
        ),
      }
    );

  return {
    raw,

    providerAmount,

    purchaseAmount,

    network,

    value,

    quantity,
  };
}

// ============================================================
// DATA E-PIN PURCHASE
// ============================================================

async function purchaseDataEpin(
  body: Record<string, any>,
  requestId: string
) {
  const network =
    bodyString(
      body,
      "network_code",
      "mobile_network",
      "network"
    );

  const plan =
    bodyString(
      body,
      "data_plan",
      "dataPlan",
      "item_code",
      "product_code",
      "variation_code"
    );

  const quantity =
    getQuantity(
      body
    );

  assertQuantity(
    quantity
  );

  if (!network) {
    throw new Error(
      "Network is required."
    );
  }

  if (!plan) {
    throw new Error(
      "Data E-PIN plan is required."
    );
  }

  const resolved =
    await resolveFixedProduct(
      "data-card",
      body,
      plan,
      network
    );

  const providerAmount =
    resolved.providerAmount *
    quantity;

  const purchaseAmount =
    sellingPrice(
      providerAmount,
      "data-card"
    );

  const raw =
    await clubKonnectGet(
      "APIDatabundleEPINV1.asp",
      {
        MobileNetwork:
          network,

        DataPlan:
          plan,

        Quantity:
          quantity,

        ...callbackParams(
          requestId
        ),
      }
    );

  return {
    raw,

    providerAmount,

    purchaseAmount,

    network,

    dataPlan:
      plan,

    quantity,

    item:
      resolved.item,
  };
}

// ============================================================
// SMILE PURCHASE
// ============================================================

async function purchaseSmile(
  body: Record<string, any>,
  requestId: string
) {
  const account =
    bodyString(
      body,
      "account_id",
      "accountId",
      "mobile_number",
      "mobileNumber",
      "phone",
      "customer"
    );

  const plan =
    bodyString(
      body,
      "data_plan",
      "dataPlan",
      "item_code",
      "product_code",
      "variation_code"
    );

  if (!account) {
    throw new Error(
      "Smile account/mobile number is required."
    );
  }

  if (!plan) {
    throw new Error(
      "Smile data plan is required."
    );
  }

  /*
   * Smile account numbers may be
   * different from ordinary Nigerian
   * mobile numbers, so do not force
   * the generic +234 validator here.
   */
  const resolved =
    await resolveFixedProduct(
      "smile",
      body,
      plan
    );

  const raw =
    await clubKonnectGet(
      "APISmileV1.asp",
      {
        MobileNetwork:
          "smile-direct",

        DataPlan:
          plan,

        MobileNumber:
          account,

        ...callbackParams(
          requestId
        ),
      }
    );

  return {
    raw,

    providerAmount:
      resolved.providerAmount,

    purchaseAmount:
      resolved.sellingAmount,

    accountId:
      account,

    dataPlan:
      plan,

    item:
      resolved.item,
  };
}

// ============================================================
// WAEC PURCHASE
// ============================================================

async function purchaseWaec(
  body: Record<string, any>,
  requestId: string
) {
  const examType =
    bodyString(
      body,
      "exam_type",
      "examType",
      "item_code",
      "product_code",
      "variation_code"
    );

  const phone =
    normalizePhone(
      bodyString(
        body,
        "phone",
        "phoneNumber",
        "customer"
      )
    );

  if (!examType) {
    throw new Error(
      "WAEC service option is required."
    );
  }

  if (
    !isValidPhone(phone)
  ) {
    throw new Error(
      "Enter a valid Nigerian phone number."
    );
  }

  const resolved =
    await resolveFixedProduct(
      "waec",
      body,
      examType
    );

  const raw =
    await clubKonnectGet(
      "APIWAECV1.asp",
      {
        ExamType:
          examType,

        PhoneNo:
          phone,

        ...callbackParams(
          requestId
        ),
      }
    );

  return {
    raw,

    providerAmount:
      resolved.providerAmount,

    purchaseAmount:
      resolved.sellingAmount,

    examType,

    phone,

    item:
      resolved.item,
  };
}

// ============================================================
// JAMB PURCHASE
// ============================================================

async function purchaseJamb(
  body: Record<string, any>,
  requestId: string
) {
  const examType =
    bodyString(
      body,
      "exam_type",
      "examType",
      "item_code",
      "product_code",
      "variation_code"
    );

  const phone =
    normalizePhone(
      bodyString(
        body,
        "phone",
        "phoneNumber",
        "customer"
      )
    );

  if (!examType) {
    throw new Error(
      "JAMB service option is required."
    );
  }

  if (
    !isValidPhone(phone)
  ) {
    throw new Error(
      "Enter a valid Nigerian phone number."
    );
  }

  const resolved =
    await resolveFixedProduct(
      "jamb",
      body,
      examType
    );

  const raw =
    await clubKonnectGet(
      "APIJAMBV1.asp",
      {
        ExamType:
          examType,

        PhoneNo:
          phone,

        ...callbackParams(
          requestId
        ),
      }
    );

  return {
    raw,

    providerAmount:
      resolved.providerAmount,

    purchaseAmount:
      resolved.sellingAmount,

    examType,

    phone,

    item:
      resolved.item,
  };
}

// ============================================================
// PROVIDER PURCHASE DISPATCH
// ============================================================

async function executeProviderPurchase(
  service: ServiceType,
  body: Record<string, any>,
  requestId: string
) {
  switch (
    service
  ) {
    case "airtime":
      return purchaseAirtime(
        body,
        requestId
      );

    case "data":
      return purchaseData(
        body,
        requestId
      );

    case "electricity":
      return purchaseElectricity(
        body,
        requestId
      );

    case "cable":
      return purchaseCable(
        body,
        requestId
      );

    case "airtime-card":
      return purchaseAirtimeEpin(
        body,
        requestId
      );

    case "data-card":
      return purchaseDataEpin(
        body,
        requestId
      );

    case "smile":
      return purchaseSmile(
        body,
        requestId
      );

    case "waec":
      return purchaseWaec(
        body,
        requestId
      );

    case "jamb":
      return purchaseJamb(
        body,
        requestId
      );

    default:
      throw new Error(
        "Unsupported service."
      );
  }
}

// ============================================================
// PURCHASE ACTION
// ============================================================

async function handlePurchase(
  userId: string,
  body: Record<string, any>,
  service: ServiceType
) {
  /*
   * Generate the request ID ourselves.
   * The browser cannot choose a request ID
   * that could collide with another customer.
   */
  const requestId =
    makeRequestId(
      userId,
      service
    );

  /*
   * IMPORTANT:
   * Do NOT trust:
   *
   *   body.amount
   *   body.price
   *   body.provider_amount
   *   body.selling_amount
   *
   * for fixed-price products.
   *
   * Individual service handlers resolve
   * the real provider price from the
   * ClubKonnect catalogue.
   */

  /*
   * First execute a dry provider-resolution
   * path to determine the authoritative
   * amount.
   *
   * We do this before creating/debiting
   * the wallet.
   */
  let providerInfo:
    Awaited<
      ReturnType<
        typeof executeProviderPurchase
      >
    >;

  /*
   * For network calls that actually place
   * an order, we must NOT call them twice.
   *
   * Therefore each service handler below
   * currently performs its provider request.
   *
   * The safest wallet sequence is:
   *
   *   1. resolve catalogue/validation
   *   2. calculate price
   *   3. create transaction
   *   4. debit
   *   5. submit provider request
   *
   * For fixed products the handler resolves
   * the catalogue again immediately before
   * provider submission.
   *
   * For production retries, the request ID /
   * transaction reference is the reconciliation
   * anchor.
   */

  /*
   * We need the authoritative amount before
   * wallet debit. To avoid duplicating provider
   * purchases, use a dedicated amount resolver.
   */
  const resolved =
    await resolvePurchaseAmount(
      service,
      body
    );

  const total =
    resolved.sellingAmount;

  if (
    !Number.isFinite(total) ||
    total <= 0
  ) {
    throw new Error(
      "Unable to determine the service price."
    );
  }

  const reference =
    requestId;

  const metadata = {
    service,

    provider:
      "clubkonnect",

    request_id:
      requestId,

    customer:
      bodyString(
        body,
        "customer",
        "phone",
        "phoneNumber",
        "meter_number",
        "meter_no",
        "smartcard_number",
        "smartCardNumber",
        "account_id",
        "mobile_number"
      ),

    network_code:
      bodyString(
        body,
        "network_code",
        "mobile_network"
      ),

    item_code:
      bodyString(
        body,
        "item_code",
        "product_code",
        "variation_code",
        "data_plan",
        "exam_type",
        "package"
      ),

    provider_amount:
      resolved.providerAmount,

    selling_amount:
      total,

    quantity:
      getQuantity(
        body
      ),

    catalogue_item:
      resolved.item ??
      null,
  };

  const {
    transaction,
    created,
  } =
    await createOrGetPendingTransaction(
      userId,
      service,
      total,
      reference,
      metadata
    );

  /*
   * If the same request already exists,
   * never debit it a second time.
   */
  if (!created) {
    const status =
      asString(
        transaction?.status
      ).toLowerCase();

    if (
      status ===
        "completed" ||
      status ===
        "successful"
    ) {
      return {
        success:
          true,

        status:
          "success",

        message:
          "This service payment has already been completed.",

        reference,

        transaction_id:
          transaction.id,
      };
    }

    if (
      status ===
        "pending"
    ) {
      return {
        success:
          true,

        status:
          "pending",

        message:
          "This service payment is already being processed.",

        reference,

        transaction_id:
          transaction.id,
      };
    }

    if (
      status ===
        "failed"
    ) {
      /*
       * This should only occur if the reference
       * was reused after a terminal failure.
       */
      throw new Error(
        "This payment reference has already failed. Please start a new payment."
      );
    }
  }

  /*
   * Debit the customer's wallet exactly once.
   */
  await debitWallet(
    userId,
    total,
    reference,
    `ClubKonnect ${service} purchase`
  );

  await updateTransaction(
    reference,
    {
      status:
        "processing",

      metadata: {
        ...metadata,

        wallet_debited:
          true,
      },
    }
  );

  try {
    providerInfo =
      await executeProviderPurchase(
        service,
        body,
        requestId
      );
  } catch (providerError) {
    /*
     * A network/timeout failure after debit
     * is NOT automatically refunded because
     * ClubKonnect may have received the order.
     *
     * Mark pending and reconcile using
     * RequestID / callback.
     */
    const message =
      providerError instanceof
      Error
        ? providerError.message
        : "Unable to reach ClubKonnect.";

    await updateTransaction(
      reference,
      {
        status:
          "pending",

        provider_reference:
          requestId,

        metadata: {
          ...metadata,

          provider_error:
            message,

          provider_submission:
            "unknown",
        },
      }
    );

    return {
      success:
        true,

      status:
        "pending",

      message:
        "Your payment has been received and the service is being confirmed.",

      reference,

      transaction_id:
        transaction.id,

      request_id:
        requestId,
    };
  }

  const provider =
    classifyProviderResponse(
      providerInfo.raw
    );

  /*
   * PROVIDER SUCCESS
   */
  if (
    provider.state ===
    "success"
  ) {
    await updateTransaction(
      reference,
      {
        status:
          "completed",

        provider_reference:
          provider.orderId ||
          requestId,

        metadata: {
          ...metadata,

          provider_status:
            provider.status,

          provider_status_code:
            provider.statusCode,

          provider_message:
            provider.message,

          provider_order_id:
            provider.orderId,

          provider_response:
            provider.raw,

          provider_amount:
            providerInfo.providerAmount,
        },
      }
    );

    return {
      success:
        true,

      status:
        "success",

      message:
        provider.message ||
        "Service purchase completed successfully.",

      reference,

      transaction_id:
        transaction.id,

      provider_reference:
        provider.orderId ||
        requestId,

      provider_status:
        provider.status,

      provider_status_code:
        provider.statusCode,

      provider_response:
        provider.raw,

      service,
    };
  }

  /*
   * PROVIDER PENDING
   */
  if (
    provider.state ===
    "pending"
  ) {
    await updateTransaction(
      reference,
      {
        status:
          "pending",

        provider_reference:
          provider.orderId ||
          requestId,

        metadata: {
          ...metadata,

          provider_status:
            provider.status,

          provider_status_code:
            provider.statusCode,

          provider_message:
            provider.message,

          provider_order_id:
            provider.orderId,

          provider_response:
            provider.raw,
        },
      }
    );

    return {
      success:
        true,

      status:
        "pending",

      message:
        "Your payment was received and the service is being processed.",

      reference,

      transaction_id:
        transaction.id,

      provider_reference:
        provider.orderId ||
        requestId,

      provider_status:
        provider.status,

      provider_status_code:
        provider.statusCode,

      service,
    };
  }

  /*
   * DEFINITE PROVIDER FAILURE
   *
   * Because the provider gave us an explicit
   * terminal failure, refund the wallet.
   */
  let refundError:
    string | null =
      null;

  try {
    await refundWallet(
      userId,
      total,
      reference,
      `Refund for failed ClubKonnect ${service} purchase`
    );
  } catch (error) {
    refundError =
      error instanceof
      Error
        ? error.message
        : "Wallet refund failed.";
  }

  await updateTransaction(
    reference,
    {
      status:
        refundError
          ? "pending"
          : "failed",

      provider_reference:
        provider.orderId ||
        requestId,

      metadata: {
        ...metadata,

        provider_status:
          provider.status,

        provider_status_code:
          provider.statusCode,

        provider_message:
          provider.message,

        provider_order_id:
          provider.orderId,

        provider_response:
          provider.raw,

        refund_attempted:
          true,

        refund_error:
          refundError,
      },
    }
  );

  if (refundError) {
    return {
      success:
        false,

      status:
        "pending",

      error:
        "The provider rejected the service request, but the wallet refund is still being processed.",

      reference,

      transaction_id:
        transaction.id,
    };
  }

  return {
    success:
      false,

    status:
      "failed",

    error:
      provider.message ||
      "ClubKonnect could not complete this service.",

    message:
      provider.message ||
      "The service purchase failed and your wallet has been refunded.",

    reference,

    transaction_id:
      transaction.id,

    provider_status:
      provider.status,

    provider_status_code:
      provider.statusCode,
  };
}

// ============================================================
// PURCHASE AMOUNT RESOLUTION
// ============================================================

async function resolvePurchaseAmount(
  service: ServiceType,
  body: Record<string, any>
) {
  /*
   * Dynamic Airtime
   */
  if (
    service ===
    "airtime"
  ) {
    const amount =
      getRequestedAmount(
        body
      );

    if (
      amount < 50 ||
      amount > 200000
    ) {
      throw new Error(
        "Airtime amount must be between ₦50 and ₦200,000."
      );
    }

    return {
      providerAmount:
        amount,

      sellingAmount:
        sellingPrice(
          amount,
          service
        ),

      item:
        null,
    };
  }

  /*
   * Dynamic Electricity
   */
  if (
    service ===
    "electricity"
  ) {
    const amount =
      getRequestedAmount(
        body
      );

    if (
      amount <= 0
    ) {
      throw new Error(
        "Electricity amount is required."
      );
    }

    return {
      providerAmount:
        amount,

      sellingAmount:
        sellingPrice(
          amount,
          service
        ),

      item:
        null,
    };
  }

  /*
   * Airtime E-PIN is fixed by value
   * multiplied by quantity.
   */
  if (
    service ===
    "airtime-card"
  ) {
    const value =
      positiveNumber(
        body.value ??
          body.amount
      );

    const quantity =
      getQuantity(
        body
      );

    assertQuantity(
      quantity
    );

    if (
      ![100, 200, 500].includes(
        value
      )
    ) {
      throw new Error(
        "Airtime E-PIN value must be ₦100, ₦200 or ₦500."
      );
    }

    const providerAmount =
      value * quantity;

    return {
      providerAmount,

      sellingAmount:
        sellingPrice(
          providerAmount,
          service
        ),

      item:
        null,
    };
  }

  /*
   * Fixed-price services.
   */
  const code =
    bodyString(
      body,
      "item_code",
      "product_code",
      "variation_code",
      "data_plan",
      "dataPlan",
      "exam_type",
      "examType",
      "package",
      "package_code"
    );

  if (!code) {
    throw new Error(
      "A service package must be selected."
    );
  }

  const network =
    bodyString(
      body,
      "network_code",
      "mobile_network",
      "network",
      "cable_tv",
      "cable_code",
      "biller_code"
    );

  const resolved =
    await resolveFixedProduct(
      service,
      body,
      code,
      network
    );

  const quantity =
    service ===
      "data-card"
      ? getQuantity(
          body
        )
      : 1;

  if (
    service ===
    "data-card"
  ) {
    assertQuantity(
      quantity
    );
  }

  const providerAmount =
    resolved.providerAmount *
    quantity;

  /*
   * The resolved item price is already
   * provider price. Apply markup once.
   */
  const total =
    sellingPrice(
      providerAmount,
      service
    );

  return {
    providerAmount,

    sellingAmount:
      total,

    item:
      resolved.item,
  };
}

// ============================================================
// STATUS / RECONCILIATION
// ============================================================

async function queryProviderStatus(
  orderId?: string,
  requestId?: string
) {
  if (
    !orderId &&
    !requestId
  ) {
    throw new Error(
      "Order ID or Request ID is required."
    );
  }

  const raw =
    await clubKonnectGet(
      "APIQueryV1.asp",
      {
        ...(orderId
          ? {
              OrderID:
                orderId,
            }
          : {}),

        ...(requestId
          ? {
              RequestID:
                requestId,
            }
          : {}),
      }
    );

  return {
    provider:
      classifyProviderResponse(
        raw
      ),

    raw,
  };
}

async function handleStatus(
  userId: string,
  body: Record<string, any>
) {
  const reference =
    bodyString(
      body,
      "reference",
      "reference_number",
      "request_id",
      "requestId"
    );

  const orderId =
    bodyString(
      body,
      "order_id",
      "orderId",
      "OrderID"
    );

  let requestId =
    bodyString(
      body,
      "request_id",
      "requestId",
      "RequestID"
    );

  if (
    reference &&
    !requestId
  ) {
    const transaction =
      await getTransactionByReference(
        reference
      );

    if (
      transaction?.metadata
        ?.request_id
    ) {
      requestId =
        asString(
          transaction
            .metadata
            .request_id
        );
    }

    if (
      transaction?.provider_reference &&
      !orderId
    ) {
      const providerReference =
        asString(
          transaction.provider_reference
        );

      if (
        providerReference &&
        providerReference !==
          requestId
      ) {
        /*
         * Prefer provider order ID
         * when it is different.
         */
        const queried =
          await queryProviderStatus(
            providerReference
          );

        return {
          success:
            true,

          reference,

          transaction_id:
            transaction?.id,

          provider:
            queried.provider,

          raw:
            queried.raw,
        };
      }
    }
  }

  const queried =
    await queryProviderStatus(
      orderId,
      requestId
    );

  return {
    success:
      true,

    reference:
      reference || undefined,

    provider:
      queried.provider,

    raw:
      queried.raw,
  };
}

async function handleReconcile(
  body: Record<string, any>
) {
  const reference =
    bodyString(
      body,
      "reference",
      "reference_number"
    );

  const orderId =
    bodyString(
      body,
      "order_id",
      "orderId"
    );

  const requestId =
    bodyString(
      body,
      "request_id",
      "requestId"
    );

  const transaction =
    reference
      ? await getTransactionByReference(
          reference
        )
      : null;

  const providerOrder =
    orderId ||
    asString(
      transaction
        ?.provider_reference
    );

  const providerRequest =
    requestId ||
    asString(
      transaction
        ?.metadata
        ?.request_id
    );

  const queried =
    await queryProviderStatus(
      providerOrder ||
        undefined,
      providerRequest ||
        undefined
    );

  if (
    transaction
  ) {
    const provider =
      queried.provider;

    if (
      provider.state ===
      "success"
    ) {
      await updateTransaction(
        transaction.reference_number,
        {
          status:
            "completed",

          provider_reference:
            provider.orderId ||
            transaction.provider_reference,

          metadata: {
            ...(transaction.metadata ??
              {}),

            reconciled:
              true,

            provider_status:
              provider.status,

            provider_status_code:
              provider.statusCode,

            provider_message:
              provider.message,

            provider_response:
              provider.raw,
          },
        }
      );
    } else if (
      provider.state ===
      "pending"
    ) {
      await updateTransaction(
        transaction.reference_number,
        {
          status:
            "pending",

          provider_reference:
            provider.orderId ||
            transaction.provider_reference,

          metadata: {
            ...(transaction.metadata ??
              {}),

            reconciled:
              true,

            provider_status:
              provider.status,

            provider_status_code:
              provider.statusCode,

            provider_message:
              provider.message,

            provider_response:
              provider.raw,
          },
        }
      );
    }
  }

  return {
    success:
      true,

    reference:
      reference || undefined,

    transaction_id:
      transaction?.id,

    provider:
      queried.provider,

    raw:
      queried.raw,
  };
}

// ============================================================
// MAIN HANDLER
// ============================================================

Deno.serve(
  async (request) => {
    /*
     * CORS
     */
    if (
      request.method ===
      "OPTIONS"
    ) {
      return new Response(
        "ok",
        {
          headers:
            corsHeaders,
        }
      );
    }

    if (
      request.method !==
      "POST"
    ) {
      return errorResponse(
        "Method not allowed.",
        405
      );
    }

    try {
      /*
       * Authentication is required for
       * every operation.
       */
      const user =
        await getUser(
          request
        );

      if (!user?.id) {
        return errorResponse(
          "Authentication required.",
          401
        );
      }

      let body:
        Record<
          string,
          any
        >;

      try {
        body =
          await request.json();
      } catch {
        return errorResponse(
          "Invalid JSON request body."
        );
      }

      const action =
        asString(
          body.action ||
            "purchase"
        ).toLowerCase();

      /*
       * --------------------------------------------------------
       * CATALOG
       * --------------------------------------------------------
       */
      if (
        action ===
          "catalog" ||
        action ===
          "get_catalog" ||
        action ===
          "plans"
      ) {
        const service =
          normalizeService(
            body.service
          );

        if (
          !service
        ) {
          return errorResponse(
            "A valid service is required."
          );
        }

        if (
          COMING_SOON_SERVICES.has(
            asString(
              body.service
            ).toLowerCase()
          )
        ) {
          return response({
            success:
              true,

            service:
              asString(
                body.service
              ),

            networks: [],
            billers: [],
            plans: [],
            items: [],

            coming_soon:
              true,

            message:
              "This service is coming soon.",
          });
        }

        if (
          !isSupportedService(
            service
          )
        ) {
          return errorResponse(
            "This service is not currently supported."
          );
        }

        const networkCode =
          bodyString(
            body,
            "network_code",
            "mobile_network"
          );

        const billerCodeValue =
          bodyString(
            body,
            "biller_code",
            "company_code"
          );

        const catalog =
          await getCatalog(
            service,
            networkCode,
            billerCodeValue
          );

        /*
         * Canonical response contract used by
         * ServicePayment.tsx.
         */
        return response({
          success:
            true,

          service,

          markup:
            markupFor(
              service
            ),

          markup_percent:
            markupFor(
              service
            ) * 100,

          networks:
            catalog.networks ??
            [],

          billers:
            catalog.billers ??
            [],

          plans:
            catalog.plans ??
            [],

          items:
            catalog.items ??
            [],

          message:
            "Service catalogue loaded successfully.",
        });
      }

      /*
       * --------------------------------------------------------
       * METER VERIFICATION
       * --------------------------------------------------------
       */
      if (
        action ===
          "verify_meter" ||
        action ===
          "verify-electricity"
      ) {
        const service =
          normalizeService(
            body.service
          );

        if (
          service !==
          "electricity"
        ) {
          return errorResponse(
            "Meter verification is only available for electricity."
          );
        }

        const result =
          await verifyMeter(
            body
          );

        if (
          result.success !==
          true
        ) {
          return response(
            result,
            400
          );
        }

        return response(
          result
        );
      }

      /*
       * --------------------------------------------------------
       * CABLE VERIFICATION
       * --------------------------------------------------------
       */
      if (
        action ===
          "verify_cable" ||
        action ===
          "verify-smartcard" ||
        action ===
          "verify_smartcard"
      ) {
        const service =
          normalizeService(
            body.service
          );

        if (
          service !==
          "cable"
        ) {
          return errorResponse(
            "Cable verification is only available for Cable TV."
          );
        }

        const result =
          await verifyCable(
            body
          );

        if (
          result.success !==
          true
        ) {
          return response(
            result,
            400
          );
        }

        return response(
          result
        );
      }

      /*
       * --------------------------------------------------------
       * STATUS
       * --------------------------------------------------------
       */
      if (
        action ===
          "status" ||
        action ===
          "check_status"
      ) {
        return response(
          await handleStatus(
            user.id,
            body
          )
        );
      }

      /*
       * --------------------------------------------------------
       * RECONCILIATION
       * --------------------------------------------------------
       */
      if (
        action ===
        "reconcile"
      ) {
        return response(
          await handleReconcile(
            body
          )
        );
      }

      /*
       * --------------------------------------------------------
       * PURCHASE
       * --------------------------------------------------------
       */
      if (
        action ===
          "purchase" ||
        action ===
          "buy" ||
        action ===
          "pay"
      ) {
        const service =
          normalizeService(
            body.service ??
              body.type
          );

        if (
          !service
        ) {
          return errorResponse(
            "A valid service is required."
          );
        }

        if (
          COMING_SOON_SERVICES.has(
            asString(
              body.service ??
                body.type
            ).toLowerCase()
          )
        ) {
          return errorResponse(
            "This service is coming soon."
          );
        }

        if (
          !isSupportedService(
            service
          )
        ) {
          return errorResponse(
            "This service is not currently supported."
          );
        }

        const result =
          await handlePurchase(
            user.id,
            body,
            service
          );

        /*
         * A pending provider request is
         * still an accepted request.
         */
        if (
          result.status ===
          "pending"
        ) {
          return response(
            result,
            200
          );
        }

        if (
          result.success ===
          false
        ) {
          return response(
            result,
            400
          );
        }

        return response(
          result,
          200
        );
      }

      return errorResponse(
        `Unsupported action: ${action}`
      );
    } catch (error) {
      console.error(
        "clubkonnect-service error:",
        error
      );

      const message =
        error instanceof
        Error
          ? error.message
          : "Unable to process the ClubKonnect service request.";

      /*
       * Never expose:
       * - API key
       * - UserID
       * - raw credentials
       * - internal stack traces
       */
      return errorResponse(
        message,
        500
      );
    }
  }
);
