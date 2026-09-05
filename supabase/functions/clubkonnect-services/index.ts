import {
  corsHeaders,
  json,
  adminClient,
  getUser,
} from "../_shared/auth.ts";

import {
  clubKonnectRequest,
  clubKonnectCallbackUrl,
} from "../_shared/clubkonnect.ts";

/**
 * ============================================================
 * IYANJUPAY — CLUBKONNECT SERVICES
 * ============================================================
 *
 * Customer-facing service flows:
 *
 * AIRTIME
 *   Network → Phone Number → Amount → Purchase
 *
 * DATA
 *   Network → Data Package → Phone Number → Purchase
 *
 * AIRTIME E-PIN
 *   Network → Package/Denomination → Quantity → Purchase
 *
 * DATA E-PIN
 *   Network → Package → Quantity → Purchase
 *
 * CABLE TV
 *   Cable TV → Provider → SmartCard → Verification
 *   → Package → Purchase
 *
 * ELECTRICITY
 *   Electricity Company → Service Provider/Meter Type
 *   → Meter Number → Verification → Amount → Purchase
 *
 * SMILE
 *   Provider → Package → Phone Number → Purchase
 *
 * WAEC
 *   Service → Package → Phone Number → Purchase
 *
 * JAMB
 *   Exam Type → Profile Code → Verification
 *   → Phone Number → Purchase
 *
 * Provider:
 *   ClubKonnect / Nellobyte Systems
 *
 * API transport:
 *   ../_shared/clubkonnect.ts
 *
 * Pricing:
 *   all services = 10% markup
 *   selling price is rounded UP to the nearest ₦5
 *
 * SECURITY:
 *   ClubKonnect credentials remain server-side.
 *   Customer supplied prices are NEVER trusted.
 * ============================================================
 */

type JsonObject = Record<string, any>;

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

type CatalogItem = {
  id: string;
  code: string;
  name: string;

  price: number;
  providerPrice: number;

  networkCode?: string;
  billerCode?: string;

  packageCode?: string;
  packageName?: string;

  examType?: string;
  examTypeName?: string;

  meterType?: string;
  meterTypeName?: string;

  providerCode?: string;
  providerName?: string;

  value?: number;

  service: ServiceType;

  period?: string;
  planType?: string;
  validityDays?: number | null;

  isHotDeal?: boolean;

  raw: JsonObject;
};

const NETWORKS: Record<string, string> = {
  "01": "MTN",
  "02": "Glo",
  "03": "9mobile",
  "04": "Airtel",
};

const STANDARD_MARKUP = 0.10;
const PRICE_ROUNDING_UNIT = 5;

const SUPPORTED_SERVICES: ServiceType[] = [
  "airtime",
  "data",
  "electricity",
  "cable",
  "airtime-card",
  "data-card",
  "smile",
  "waec",
  "jamb",
];

const FAILURE_STATUSES = new Set([
  "ORDER_FAILED",
  "FAILED",
  "FAILURE",
  "TRANSACTION_FAILED",
  "INVALID_CREDENTIALS",
  "MISSING_CREDENTIALS",
  "MISSING_USERID",
  "MISSING_APIKEY",
  "MISSING_MOBILENETWORK",
  "MISSING_DATAPLAN",
  "INVALID_DATAPLAN",
  "INVALID_RECIPIENT",
  "INVALID_MOBILENUMBER",
  "INVALID_PHONENO",
  "INVALID_METERNO",
  "INVALID_METER_NUMBER",
  "INVALID_SMARTCARD",
  "INVALID_SMARTCARDNO",
  "INVALID_EXAMTYPE",
  "MISSING_EXAMTYPE",
  "INVALID_PROFILEID",
  "INVALID_PROFILE_ID",
  "INVALID_ACCOUNTNO",
  "INSUFFICIENT_BALANCE",
  "INSUFFICIENT_FUNDS",
  "QUANTITY_NOT_AVAILABLE",
  "PIN_NOT_AVAILABLE",
  "INVALID_PACKAGE",
  "INVALID_CABLETV",
  "INVALID_ELECTRICCOMPANY",
  "INVALID_ELECTRICITY",
]);

const PENDING_STATUSES = new Set([
  "ORDER_RECEIVED",
  "ORDER_ONHOLD",
  "ORDER_PROCESSED",
  "PROCESSING",
  "PENDING",
  "REQUEST_QUEUED",
  "REQUEST_PROCESSING",
  "NETWORK_UNRESPONSIVE",
]);

/* ============================================================
 * BASIC HELPERS
 * ========================================================== */

function s(value: unknown): string {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value).trim();
  }

  /*
   * NEVER return "[object Object]".
   */
  if (
    typeof value === "object"
  ) {
    const object = value as JsonObject;

    const nested = first(
      object.name,
      object.Name,
      object.label,
      object.Label,
      object.title,
      object.Title,
      object.code,
      object.Code,
      object.id,
      object.ID,
      object.value,
      object.Value,
    );

    if (
      nested !== undefined &&
      nested !== value
    ) {
      return s(nested);
    }

    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }

  return String(value).trim();
}

function n(value: unknown): number {
  if (
    typeof value === "number"
  ) {
    return Number.isFinite(value) &&
      value >= 0
      ? Math.round(value * 100) / 100
      : 0;
  }

  const text =
    s(value)
      .replace(/[₦,\s]/g, "")
      .replace(/NGN/gi, "");

  if (!text) {
    return 0;
  }

  const result =
    Number(text);

  return Number.isFinite(result) &&
    result >= 0
    ? Math.round(result * 100) / 100
    : 0;
}

function first(
  ...values: unknown[]
): unknown {
  for (
    const value of values
  ) {
    if (
      value !== undefined &&
      value !== null &&
      s(value) !== ""
    ) {
      return value;
    }
  }

  return undefined;
}

function obj(
  value: unknown
): JsonObject {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    return value as JsonObject;
  }

  return {};
}

function normalizedKey(
  value: unknown
): string {
  return s(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function pick(
  value: unknown,
  ...aliases: string[]
): unknown {
  const source =
    obj(value);

  const map =
    new Map<string, unknown>();

  for (
    const [key, val]
      of Object.entries(source)
  ) {
    map.set(
      normalizedKey(key),
      val
    );
  }

  for (
    const alias of aliases
  ) {
    const found =
      map.get(
        normalizedKey(alias)
      );

    if (
      found !== undefined &&
      found !== null &&
      s(found) !== ""
    ) {
      return found;
    }
  }

  return undefined;
}

function roundMoney(
  value: number
): number {
  return Math.round(
    value * 100
  ) / 100;
}

function markupRate(
  _service: ServiceType
): number {
  // Every supported ClubKonnect service uses the same 10% markup.
  return STANDARD_MARKUP;
}

function sellingPrice(
  service: ServiceType,
  providerPrice: number
): number {
  const cost = Math.max(0, n(providerPrice));

  if (cost <= 0) {
    return 0;
  }

  const markedUp =
    cost * (1 + markupRate(service));

  // Always round the final selling price UP to the nearest ₦5.
  // Examples: ₦533 → ₦535 and ₦5,868.50 → ₦5,870.
  return (
    Math.ceil(
      (markedUp - Number.EPSILON) /
        PRICE_ROUNDING_UNIT
    ) * PRICE_ROUNDING_UNIT
  );
}

/* ============================================================
 * STATUS
 * ========================================================== */

function normalizeStatus(
  value: unknown
): string {
  return s(value)
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

function statusText(
  body: any
): string {
  return normalizeStatus(
    first(
      pick(
        body,
        "status",
        "Status",
        "orderstatus",
        "OrderStatus"
      ),
      pick(
        body?.data,
        "status",
        "Status",
        "orderstatus",
        "OrderStatus"
      )
    )
  );
}

function statusCode(
  body: any
): number | null {
  const value =
    Number(
      first(
        pick(
          body,
          "statuscode",
          "statusCode",
          "StatusCode"
        ),
        pick(
          body?.data,
          "statuscode",
          "statusCode",
          "StatusCode"
        )
      )
    );

  return Number.isFinite(value)
    ? value
    : null;
}

function orderId(
  body: any
): string | null {
  const value =
    first(
      pick(
        body,
        "orderid",
        "orderId",
        "OrderID"
      ),
      pick(
        body?.data,
        "orderid",
        "orderId",
        "OrderID"
      )
    );

  return value === undefined
    ? null
    : s(value);
}

function requestId(
  body: any
): string | null {
  const value =
    first(
      pick(
        body,
        "requestid",
        "requestId",
        "RequestID"
      ),
      pick(
        body?.data,
        "requestid",
        "requestId",
        "RequestID"
      )
    );

  return value === undefined
    ? null
    : s(value);
}

function classify(
  body: any,
  httpOk: boolean
) {
  const code =
    statusCode(body);

  const text =
    statusText(body);

  if (
    httpOk &&
    (
      code === 200 ||
      text === "ORDER_COMPLETED" ||
      text === "SUCCESS" ||
      text === "SUCCESSFUL" ||
      text === "COMPLETED"
    )
  ) {
    return {
      state:
        "successful" as const,
      code,
      text,
    };
  }

  if (
    FAILURE_STATUSES.has(text)
  ) {
    return {
      state:
        "failed" as const,
      code,
      text,
    };
  }

  if (
    PENDING_STATUSES.has(text)
  ) {
    return {
      state:
        "pending" as const,
      code,
      text,
    };
  }

  return {
    state:
      "pending" as const,
    code,
    text,
  };
}

/* ============================================================
 * NETWORK
 * ========================================================== */

function networkCode(
  value: unknown
): string {
  const raw =
    s(value);

  if (!raw) {
    return "";
  }

  const key =
    normalizedKey(raw);

  if (
    key === "01" ||
    key === "mtn" ||
    key.includes("mtn")
  ) {
    return "01";
  }

  if (
    key === "02" ||
    key === "glo" ||
    key === "globacom" ||
    key.includes("glo")
  ) {
    return "02";
  }

  if (
    key === "03" ||
    key === "9mobile" ||
    key === "etisalat" ||
    key === "t2mobile" ||
    key.includes("9mobile") ||
    key.includes("etisalat") ||
    key.includes("t2mobile")
  ) {
    return "03";
  }

  if (
    key === "04" ||
    key === "airtel" ||
    key.includes("airtel")
  ) {
    return "04";
  }

  return raw;
}

function networkName(
  code: string
): string {
  return (
    NETWORKS[
      networkCode(code)
    ] ??
    s(code)
  );
}

function normalizePhone(
  value: unknown
): string {
  const raw =
    s(value)
      .replace(
        /[\s()-]/g,
        ""
      );

  if (
    /^\+234\d{10}$/.test(raw)
  ) {
    return raw.slice(1);
  }

  if (
    /^234\d{10}$/.test(raw)
  ) {
    return raw;
  }

  if (
    /^0\d{10}$/.test(raw)
  ) {
    return `234${raw.slice(1)}`;
  }

  return raw;
}

function validPhone(
  value: string
): boolean {
  return /^234\d{10}$/.test(
    value
  );
}

/* ============================================================
 * CREDENTIALS
 * ========================================================== */

/* ============================================================
 * RECURSIVE CATALOGUE HELPERS
 * ========================================================== */

function arraysAt(
  value: unknown,
  keys: string[]
): any[] {
  const source =
    obj(value);

  for (
    const key of keys
  ) {
    const found =
      pick(
        source,
        key
      );

    if (
      Array.isArray(found)
    ) {
      return found;
    }
  }

  return [];
}

function walkObjects(
  value: unknown,
  callback: (
    item: JsonObject
  ) => void,
  depth = 0
): void {
  if (
    depth > 20 ||
    value === null ||
    value === undefined
  ) {
    return;
  }

  if (
    Array.isArray(value)
  ) {
    for (
      const item of value
    ) {
      walkObjects(
        item,
        callback,
        depth + 1
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

  const item =
    obj(value);

  callback(item);

  for (
    const child
      of Object.values(item)
  ) {
    if (
      child &&
      typeof child ===
        "object"
    ) {
      walkObjects(
        child,
        callback,
        depth + 1
      );
    }
  }
}

function parseValidity(
  text: string
): number | null {
  const days =
    text.match(
      /\b(\d+)\s*days?\b/i
    );

  if (days) {
    return Number(days[1]);
  }

  const weeks =
    text.match(
      /\b(\d+)\s*weeks?\b/i
    );

  if (weeks) {
    return Number(weeks[1]) * 7;
  }

  const months =
    text.match(
      /\b(\d+)\s*months?\b/i
    );

  if (months) {
    return Number(months[1]) * 30;
  }

  return null;
}

function planPeriod(
  name: string,
  days: number | null
): string {
  const text =
    name.toLowerCase();

  if (
    text.includes("extra night") ||
    text.includes("night")
  ) {
    return "extra-night";
  }

  if (
    text.includes("daily") ||
    days === 1
  ) {
    return "daily";
  }

  if (
    text.includes("weekly") ||
    days === 7
  ) {
    return "weekly";
  }

  if (
    text.includes("monthly") ||
    days === 30
  ) {
    return "monthly";
  }

  return "other";
}

/* ============================================================
 * DATA
 * ========================================================== */

function normalizeDataPlan(
  raw: any,
  fallbackNetwork: string
): CatalogItem | null {
  const product =
    obj(raw);

  const id =
    s(
      first(
        pick(
          product,
          "PRODUCT_ID"
        ),
        pick(
          product,
          "PRODUCT_CODE"
        ),
        pick(
          product,
          "product_id",
          "productId"
        ),
        pick(
          product,
          "code",
          "Code",
          "id",
          "ID"
        )
      )
    );

  const code =
    s(
      first(
        pick(
          product,
          "PRODUCT_CODE"
        ),
        pick(
          product,
          "product_code",
          "productCode"
        ),
        id
      )
    );

  const name =
    s(
      first(
        pick(
          product,
          "PRODUCT_NAME"
        ),
        pick(
          product,
          "product_name",
          "productName"
        ),
        pick(
          product,
          "name",
          "Name",
          "description",
          "Description"
        ),
        id
      )
    );

  const providerPrice =
    n(
      first(
        pick(
          product,
          "PRODUCT_AMOUNT"
        ),
        pick(
          product,
          "product_amount",
          "productAmount"
        ),
        pick(
          product,
          "provider_amount",
          "providerAmount"
        ),
        pick(
          product,
          "cost",
          "Cost"
        ),
        pick(
          product,
          "price",
          "Price",
          "amount",
          "Amount"
        )
      )
    );

  const network =
    networkCode(
      first(
        pick(
          product,
          "MOBILENETWORK",
          "MobileNetwork",
          "network_code",
          "networkCode",
          "network"
        ),
        fallbackNetwork
      )
    );

  if (
    !id ||
    !code ||
    !network ||
    !NETWORKS[network] ||
    providerPrice <= 0
  ) {
    return null;
  }

  const validityRaw =
    first(
      pick(
        product,
        "validity_days",
        "validityDays"
      ),
      pick(
        product,
        "duration",
        "Duration"
      )
    );

  const numericValidity =
    Number(validityRaw);

  const validityDays =
    Number.isFinite(
      numericValidity
    ) &&
    numericValidity > 0
      ? numericValidity
      : parseValidity(
          name
        );

  const planType =
    s(
      first(
        pick(
          product,
          "plan_type",
          "planType",
          "PLAN_TYPE"
        ),
        pick(
          product,
          "type",
          "Type",
          "category",
          "Category"
        ),
        "Data"
      )
    );

  return {
    id,
    code,
    name,
    price:
      sellingPrice(
        "data",
        providerPrice
      ),
    providerPrice,
    networkCode:
      network,
    service:
      "data",
    period:
      planPeriod(
        name,
        validityDays
      ),
    planType,
    validityDays,
    isHotDeal:
      /\bsme\b/i.test(name) ||
      /hot\s*deal/i.test(name) ||
      /hotdeal/i.test(name),
    raw:
      product,
  };
}

async function dataPlans(): Promise<
  CatalogItem[]
> {
  const response =
    await clubKonnectRequest(
      "APIDatabundlePlansV2.asp"
    );

  if (!response.ok) {
    throw new Error(
      "Data catalogue unavailable."
    );
  }

  const result:
    CatalogItem[] = [];

  const root =
    response.body;

  const mobileNetwork =
    obj(
      pick(
        root,
        "MOBILE_NETWORK",
        "mobile_network"
      )
    );

  for (
    const [
      networkKey,
      networkValue,
    ] of Object.entries(
      mobileNetwork
    )
  ) {
    const fallback =
      networkCode(
        networkKey
      );

    if (
      !NETWORKS[fallback]
    ) {
      continue;
    }

    const groups =
      Array.isArray(
        networkValue
      )
        ? networkValue
        : [networkValue];

    for (
      const group of groups
    ) {
      const groupObject =
        obj(group);

      const code =
        networkCode(
          first(
            pick(
              groupObject,
              "ID",
              "id",
              "network_id",
              "networkCode"
            ),
            fallback
          )
        );

      if (
        !NETWORKS[code]
      ) {
        continue;
      }

      const products =
        arraysAt(
          groupObject,
          [
            "PRODUCT",
            "product",
            "products",
            "plans",
          ]
        );

      for (
        const product
          of products
      ) {
        const item =
          normalizeDataPlan(
            product,
            code
          );

        if (item) {
          result.push(item);
        }
      }
    }
  }

  if (
    result.length === 0
  ) {
    walkObjects(
      root,
      (item) => {
        const possibleNetwork =
          networkCode(
            first(
              pick(
                item,
                "MOBILENETWORK",
                "MobileNetwork",
                "network_code",
                "networkCode",
                "network"
              )
            )
          );

        if (
          !NETWORKS[
            possibleNetwork
          ]
        ) {
          return;
        }

        const nestedProducts =
          arraysAt(
            item,
            [
              "PRODUCT",
              "product",
              "products",
              "plans",
            ]
          );

        for (
          const product
            of nestedProducts
        ) {
          const normalized =
            normalizeDataPlan(
              product,
              possibleNetwork
            );

          if (normalized) {
            result.push(
              normalized
            );
          }
        }
      }
    );
  }

  const unique =
    new Map<
      string,
      CatalogItem
    >();

  for (
    const item of result
  ) {
    unique.set(
      `${item.networkCode}:${item.id}`,
      item
    );
  }

  return [
    ...unique.values(),
  ];
}

/* ============================================================
 * NETWORK CATALOGUE
 * ========================================================== */

async function airtimeNetworks() {
  return Object.entries(
    NETWORKS
  ).map(
    ([code, name]) => ({
      code,
      id:
        code,
      value:
        code,
      name,
      label:
        name,
      title:
        name,
      network:
        name,
      biller_code:
        code,
      billerCode:
        code,
      network_code:
        code,
      networkCode:
        code,
    })
  );
}

/* ============================================================
 * CABLE
 * ========================================================== */

function safeDisplayName(
  value: unknown,
  fallback = ""
): string {
  const text =
    s(value);

  if (
    text &&
    text !== "[object Object]"
  ) {
    return text;
  }

  return fallback;
}

async function cableTypes() {
  const response =
    await clubKonnectRequest(
      "APICableTVTypeV2.asp"
    );

  if (!response.ok) {
    throw new Error(
      "Cable TV catalogue unavailable."
    );
  }

  const result:
    Array<{
      code: string;
      name: string;
      raw: JsonObject;
    }> = [];

  walkObjects(
    response.body,
    (item) => {
      const code =
        safeDisplayName(
          first(
            pick(
              item,
              "CableTV",
              "cableTv",
              "cable_tv",
              "CableTVID",
              "CableTVCode"
            ),
            pick(
              item,
              "ID",
              "id",
              "biller_code",
              "billerCode",
              "code",
              "Code"
            )
          )
        );

      const rawName =
        first(
          pick(
            item,
            "CableTVName",
            "cableTvName",
            "cable_tv_name"
          ),
          pick(
            item,
            "name",
            "Name",
            "label",
            "Label",
            "title",
            "Title"
          )
        );

      const name =
        safeDisplayName(
          rawName,
          code
        );

      if (
        code &&
        name &&
        !code.includes(
          "[object Object]"
        ) &&
        !name.includes(
          "[object Object]"
        )
      ) {
        result.push({
          code,
          name,
          raw:
            item,
        });
      }
    }
  );

  /*
   * Defensive canonical fallback.
   *
   * These are the documented CableTV IDs.
   * We only use them if the live type response
   * does not yield usable entries.
   */
  if (
    result.length === 0
  ) {
    return [
      {
        code:
          "dstv",
        name:
          "DSTV",
        raw: {},
      },
      {
        code:
          "gotv",
        name:
          "GOtv",
        raw: {},
      },
      {
        code:
          "startimes",
        name:
          "Startimes",
        raw: {},
      },
      {
        code:
          "showmax",
        name:
          "Showmax",
        raw: {},
      },
    ];
  }

  const unique =
    new Map<
      string,
      {
        code: string;
        name: string;
        raw: JsonObject;
      }
    >();

  for (
    const item of result
  ) {
    unique.set(
      item.code.toLowerCase(),
      item
    );
  }

  return [
    ...unique.values(),
  ];
}

async function cablePackages(
  cableTv: string
): Promise<CatalogItem[]> {
  const response =
    await clubKonnectRequest(
      "APICableTVPackagesV2.asp",
      {
        CableTV:
          cableTv,
      }
    );

  if (!response.ok) {
    throw new Error(
      "Cable TV packages unavailable."
    );
  }

  const result:
    CatalogItem[] = [];

  walkObjects(
    response.body,
    (item) => {
      const itemCable =
        safeDisplayName(
          first(
            pick(
              item,
              "CableTV",
              "cableTv",
              "cable_tv",
              "CableTVID",
              "CableTVCode"
            ),
            pick(
              item,
              "biller_code",
              "billerCode"
            )
          )
        );

      if (
        itemCable &&
        itemCable.toLowerCase() !==
          cableTv.toLowerCase()
      ) {
        return;
      }

      const packageCode =
        safeDisplayName(
          first(
            pick(
              item,
              "PackageCode",
              "packageCode",
              "package_code"
            ),
            pick(
              item,
              "PACKAGE_ID",
              "package_id",
              "PRODUCT_ID"
            ),
            pick(
              item,
              "PRODUCT_CODE",
              "product_code",
              "productCode"
            ),
            pick(
              item,
              "code",
              "Code",
              "id",
              "ID"
            )
          )
        );

      const packageName =
        safeDisplayName(
          first(
            pick(
              item,
              "PackageName",
              "packageName",
              "package_name"
            ),
            pick(
              item,
              "PRODUCT_NAME",
              "product_name",
              "productName"
            ),
            pick(
              item,
              "name",
              "Name",
              "description",
              "Description"
            ),
            packageCode
          )
        );

      const providerPrice =
        n(
          first(
            pick(
              item,
              "PackageAmount",
              "packageAmount",
              "package_amount"
            ),
            pick(
              item,
              "PRODUCT_AMOUNT",
              "product_amount",
              "productAmount"
            ),
            pick(
              item,
              "provider_amount",
              "providerAmount"
            ),
            pick(
              item,
              "price",
              "Price",
              "amount",
              "Amount",
              "cost",
              "Cost"
            )
          )
        );

      if (
        packageCode &&
        packageName &&
        providerPrice > 0
      ) {
        result.push({
          id:
            packageCode,
          code:
            packageCode,
          packageCode,
          packageName,
          name:
            packageName,
          price:
            sellingPrice(
              "cable",
              providerPrice
            ),
          providerPrice,
          billerCode:
            cableTv,
          providerCode:
            cableTv,
          providerName:
            cableTv,
          service:
            "cable",
          raw:
            item,
        });
      }
    }
  );

  const unique =
    new Map<
      string,
      CatalogItem
    >();

  for (
    const item of result
  ) {
    unique.set(
      item.packageCode ??
        item.id,
      item
    );
  }

  return [
    ...unique.values(),
  ];
}

/* ============================================================
 * ELECTRICITY
 * ========================================================== */

type ElectricityCompany = {
  code: string;
  name: string;
  meterTypes: Array<{
    code: string;
    name: string;
  }>;
};

function electricityFromEnv():
  ElectricityCompany[] {
  const configured =
    s(
      Deno.env.get(
        "CLUBKONNECT_ELECTRICITY_BILLERS_JSON"
      )
    );

  if (!configured) {
    return [];
  }

  try {
    const parsed =
      JSON.parse(
        configured
      );

    const list =
      Array.isArray(parsed)
        ? parsed
        : Array.isArray(
              parsed?.billers
            )
          ? parsed.billers
          : Array.isArray(
                parsed?.companies
              )
            ? parsed.companies
            : [];

    return list
      .map(
        (item: any) => {
          const code =
            safeDisplayName(
              first(
                pick(
                  item,
                  "biller_code",
                  "billerCode",
                  "ElectricCompany",
                  "electricCompany",
                  "electric_company",
                  "code",
                  "id",
                  "ID"
                )
              )
            );

          const name =
            safeDisplayName(
              first(
                pick(
                  item,
                  "name",
                  "Name",
                  "biller_name",
                  "billerName",
                  "company",
                  "companyName",
                  "label"
                ),
                code
              )
            );

          const meterTypeRaw =
            first(
              pick(
                item,
                "meterTypes",
                "meter_types",
                "MeterTypes"
              ),
              pick(
                item,
                "meter_types"
              )
            );

          const meterTypes =
            Array.isArray(
              meterTypeRaw
            )
              ? meterTypeRaw
                  .map(
                    (meter: any) => ({
                      code:
                        safeDisplayName(
                          first(
                            pick(
                              meter,
                              "code",
                              "Code",
                              "id",
                              "ID",
                              "MeterType",
                              "meterType"
                            )
                          )
                        ),
                      name:
                        safeDisplayName(
                          first(
                            pick(
                              meter,
                              "name",
                              "Name",
                              "label",
                              "Label",
                              "MeterTypeName",
                              "meterTypeName"
                            )
                          )
                        ),
                    })
                  )
                  .filter(
                    (
                      meter: {
                        code: string;
                        name: string;
                      }
                    ) =>
                      !!meter.code &&
                      !!meter.name
                  )
              : [];

          return code &&
            name
            ? {
                code,
                name,
                meterTypes,
              }
            : null;
        }
      )
      .filter(
        Boolean
      ) as ElectricityCompany[];
  } catch (error) {
    console.error(
      "Invalid CLUBKONNECT_ELECTRICITY_BILLERS_JSON:",
      error
    );

    return [];
  }
}

async function electricityCatalog(): Promise<
  ElectricityCompany[]
> {
  /*
   * ClubKonnect's current public documentation
   * describes the electricity companies and MeterType
   * as account catalogue data. If your ClubKonnect
   * account exposes this catalogue through a custom
   * endpoint, configure it through:
   *
   * CLUBKONNECT_ELECTRICITY_BILLERS_JSON
   *
   * The function does NOT fabricate disco codes.
   */
  return electricityFromEnv();
}

/* ============================================================
 * AIRTIME E-PIN
 * ========================================================== */

function airtimePinValue(
  item: CatalogItem
): number {
  if (
    item.value &&
    item.value > 0
  ) {
    return item.value;
  }

  const raw =
    obj(item.raw);

  return n(
    first(
      pick(
        raw,
        "Value",
        "value",
        "Denomination",
        "denomination"
      ),
      item.id
        .split("-")
        .pop()
    )
  );
}

async function airtimePinCatalog(
  network?: string
): Promise<CatalogItem[]> {
  const response =
    await clubKonnectRequest(
      "APIEPINDiscountV2.asp"
    );

  if (!response.ok) {
    throw new Error(
      "Airtime E-PIN catalogue unavailable."
    );
  }

  const result:
    CatalogItem[] = [];

  walkObjects(
    response.body,
    (item) => {
      const currentNetwork =
        networkCode(
          first(
            pick(
              item,
              "MOBILENETWORK",
              "MobileNetwork",
              "network_code",
              "networkCode",
              "NetworkCode"
            ),
            pick(
              item,
              "Network",
              "network",
              "NetworkName",
              "network_name"
            )
          )
        );

      const denomination =
        n(
          first(
            pick(
              item,
              "Value",
              "value",
              "Denomination",
              "denomination"
            ),
            pick(
              item,
              "Amount",
              "amount"
            )
          )
        );

      const discount =
        n(
          first(
            pick(
              item,
              "Discount",
              "discount",
              "discount_percent",
              "discountPercentage"
            ),
            0
          )
        );

      const explicitCost =
        n(
          first(
            pick(
              item,
              "provider_amount",
              "providerAmount",
              "cost",
              "Cost"
            ),
            pick(
              item,
              "price",
              "Price",
              "amount_payable",
              "AmountPayable"
            )
          )
        );

      const providerPrice =
        explicitCost > 0
          ? explicitCost
          : denomination > 0
            ? roundMoney(
                denomination *
                  Math.max(
                    0,
                    1 -
                      discount /
                        100
                  )
              )
            : 0;

      if (
        NETWORKS[
          currentNetwork
        ] &&
        denomination > 0 &&
        providerPrice > 0
      ) {
        /*
         * IMPORTANT:
         *
         * This is deliberately exposed as a
         * PACKAGE/EPIN item rather than an
         * amount-based service.
         */
        result.push({
          id:
            `${currentNetwork}-${denomination}`,
          code:
            `${currentNetwork}-${denomination}`,
          name:
            `${NETWORKS[currentNetwork]} ₦${denomination.toLocaleString()} E-PIN`,
          packageCode:
            `${currentNetwork}-${denomination}`,
          packageName:
            `${NETWORKS[currentNetwork]} ₦${denomination.toLocaleString()} E-PIN`,
          value:
            denomination,
          price:
            sellingPrice(
              "airtime-card",
              providerPrice
            ),
          providerPrice,
          networkCode:
            currentNetwork,
          service:
            "airtime-card",
          raw:
            item,
        });
      }
    }
  );

  const unique =
    new Map<
      string,
      CatalogItem
    >();

  for (
    const item of result
  ) {
    unique.set(
      `${item.networkCode}:${item.value}`,
      item
    );
  }

  const output =
    [
      ...unique.values(),
    ];

  if (
    network
  ) {
    const wanted =
      networkCode(
        network
      );

    return output.filter(
      (item) =>
        item.networkCode ===
        wanted
    );
  }

  return output;
}

/* ============================================================
 * DATA E-PIN
 * ========================================================== */

async function dataPinCatalog(
  network?: string
): Promise<CatalogItem[]> {
  const response =
    await clubKonnectRequest(
      "APIDatabundleEPINV1.asp"
    );

  /*
   * Some ClubKonnect accounts return the data
   * E-PIN catalogue through the same endpoint
   * used by the purchase API. If the response is
   * not catalogue-shaped, fall back to the data
   * bundle catalogue.
   */
  if (!response.ok) {
    const data =
      await dataPlans();

    const wanted =
      network
        ? networkCode(network)
        : "";

    return data
      .filter(
        (item) =>
          !wanted ||
          item.networkCode ===
            wanted
      )
      .map(
        (item) => ({
          ...item,
          service:
            "data-card" as const,
          price:
            sellingPrice(
              "data-card",
              item.providerPrice
            ),
        })
      );
  }

  const result:
    CatalogItem[] = [];

  walkObjects(
    response.body,
    (item) => {
      const currentNetwork =
        networkCode(
          first(
            pick(
              item,
              "MOBILENETWORK",
              "MobileNetwork",
              "network_code",
              "networkCode"
            ),
            pick(
              item,
              "Network",
              "network",
              "NetworkName"
            )
          )
        );

      const code =
        safeDisplayName(
          first(
            pick(
              item,
              "DataPlan",
              "dataPlan",
              "DATA_PLAN"
            ),
            pick(
              item,
              "PRODUCT_CODE",
              "product_code",
              "productCode"
            ),
            pick(
              item,
              "PackageCode",
              "packageCode",
              "package_code"
            ),
            pick(
              item,
              "code",
              "Code",
              "id",
              "ID"
            )
          )
        );

      const name =
        safeDisplayName(
          first(
            pick(
              item,
              "PRODUCT_NAME",
              "product_name",
              "productName"
            ),
            pick(
              item,
              "PackageName",
              "packageName",
              "package_name"
            ),
            pick(
              item,
              "name",
              "Name",
              "description",
              "Description"
            ),
            code
          )
        );

      const providerPrice =
        n(
          first(
            pick(
              item,
              "PRODUCT_AMOUNT",
              "product_amount",
              "productAmount"
            ),
            pick(
              item,
              "PackageAmount",
              "packageAmount",
              "package_amount"
            ),
            pick(
              item,
              "provider_amount",
              "providerAmount"
            ),
            pick(
              item,
              "price",
              "Price",
              "amount",
              "Amount",
              "cost",
              "Cost"
            )
          )
        );

      if (
        NETWORKS[
          currentNetwork
        ] &&
        code &&
        providerPrice > 0
      ) {
        result.push({
          id:
            code,
          code,
          packageCode:
            code,
          packageName:
            name,
          name,
          price:
            sellingPrice(
              "data-card",
              providerPrice
            ),
          providerPrice,
          networkCode:
            currentNetwork,
          service:
            "data-card",
          raw:
            item,
        });
      }
    }
  );

  /*
   * If the endpoint returned no usable
   * catalogue records, use the normal data
   * catalogue as a compatibility fallback.
   */
  if (
    result.length === 0
  ) {
    const data =
      await dataPlans();

    const wanted =
      network
        ? networkCode(network)
        : "";

    return data
      .filter(
        (item) =>
          !wanted ||
          item.networkCode ===
            wanted
      )
      .map(
        (item) => ({
          ...item,
          packageCode:
            item.code,
          packageName:
            item.name,
          service:
            "data-card" as const,
          price:
            sellingPrice(
              "data-card",
              item.providerPrice
            ),
        })
      );
  }

  const unique =
    new Map<
      string,
      CatalogItem
    >();

  for (
    const item of result
  ) {
    unique.set(
      `${item.networkCode}:${item.code}`,
      item
    );
  }

  const output =
    [
      ...unique.values(),
    ];

  if (
    network
  ) {
    const wanted =
      networkCode(
        network
      );

    return output.filter(
      (item) =>
        item.networkCode ===
        wanted
    );
  }

  return output;
}

/* ============================================================
 * JAMB
 * ========================================================== */

type JambExamType = {
  code: string;
  name: string;
  providerPrice: number;
  raw: JsonObject;
};

function jambExamTypeName(
  code: string
): string {
  const key =
    normalizedKey(code);

  if (
    key === "de" ||
    key === "directentry"
  ) {
    return "Direct Entry (DE)";
  }

  if (
    key === "utmemock"
  ) {
    return "UTME PIN (with mock)";
  }

  if (
    key === "utmenomock"
  ) {
    return "UTME PIN (without mock)";
  }

  if (
    key === "jamb"
  ) {
    return "JAMB PIN";
  }

  return code;
}

async function jambCatalog(): Promise<
  JambExamType[]
> {
  const response =
    await clubKonnectRequest(
      "APIJAMBPackagesV2.asp"
    );

  if (!response.ok) {
    throw new Error(
      "JAMB catalogue unavailable."
    );
  }

  const result:
    JambExamType[] = [];

  walkObjects(
    response.body,
    (item) => {
      const code =
        safeDisplayName(
          first(
            pick(
              item,
              "EXAMTYPE",
              "ExamType",
              "examtype",
              "exam_type"
            ),
            pick(
              item,
              "code",
              "Code",
              "id",
              "ID"
            )
          )
        );

      if (!code) {
        return;
      }

      const name =
        safeDisplayName(
          first(
            pick(
              item,
              "EXAMTYPENAME",
              "ExamTypeName",
              "examTypeName"
            ),
            pick(
              item,
              "name",
              "Name",
              "label",
              "Label",
              "description",
              "Description"
            ),
            jambExamTypeName(
              code
            )
          ),
          jambExamTypeName(
            code
          )
        );

      const providerPrice =
        n(
          first(
            pick(
              item,
              "PRODUCT_AMOUNT",
              "product_amount",
              "productAmount"
            ),
            pick(
              item,
              "PackageAmount",
              "packageAmount",
              "package_amount"
            ),
            pick(
              item,
              "amount",
              "Amount",
              "price",
              "Price",
              "cost",
              "Cost"
            )
          )
        );

      /*
       * A package catalogue may contain
       * nested EXAMTYPE records.
       *
       * Do not turn EXAMTYPE into a generic
       * package ID.
       */
      result.push({
        code,
        name,
        providerPrice,
        raw:
          item,
      });
    }
  );

  /*
   * If the dynamic catalogue has no usable
   * records, use ClubKonnect's documented
   * exam type codes.
   *
   * Price remains zero here because the
   * purchase must be price-verified from
   * the actual account catalogue.
   */
  if (
    result.length === 0
  ) {
    return [
      {
        code:
          "de",
        name:
          "Direct Entry (DE)",
        providerPrice:
          0,
        raw: {},
      },
      {
        code:
          "utme-mock",
        name:
          "UTME PIN (with mock)",
        providerPrice:
          0,
        raw: {},
      },
      {
        code:
          "utme-no-mock",
        name:
          "UTME PIN (without mock)",
        providerPrice:
          0,
        raw: {},
      },
    ];
  }

  const unique =
    new Map<
      string,
      JambExamType
    >();

  for (
    const item of result
  ) {
    unique.set(
      item.code.toLowerCase(),
      item
    );
  }

  return [
    ...unique.values(),
  ];
}

/* ============================================================
 * GENERIC PACKAGE SERVICES
 * ========================================================== */

async function genericPackages(
  endpoint: string,
  service:
    | "smile"
    | "waec"
): Promise<CatalogItem[]> {
  const response =
    await clubKonnectRequest(
      endpoint
    );

  if (!response.ok) {
    throw new Error(
      `${service.toUpperCase()} catalogue unavailable.`
    );
  }

  const result:
    CatalogItem[] = [];

  walkObjects(
    response.body,
    (item) => {
      const id =
        safeDisplayName(
          first(
            pick(
              item,
              "PRODUCT_ID",
              "product_id",
              "productId"
            ),
            pick(
              item,
              "PACKAGE_ID",
              "package_id",
              "packageId"
            ),
            pick(
              item,
              "PRODUCT_CODE",
              "product_code",
              "productCode"
            ),
            pick(
              item,
              "PackageCode",
              "packageCode",
              "package_code"
            ),
            pick(
              item,
              "code",
              "Code",
              "id",
              "ID"
            )
          )
        );

      const name =
        safeDisplayName(
          first(
            pick(
              item,
              "PRODUCT_NAME",
              "product_name",
              "productName"
            ),
            pick(
              item,
              "PackageName",
              "packageName",
              "package_name"
            ),
            pick(
              item,
              "name",
              "Name",
              "description",
              "Description"
            ),
            id
          ),
          id
        );

      const providerPrice =
        n(
          first(
            pick(
              item,
              "PRODUCT_AMOUNT",
              "product_amount",
              "productAmount"
            ),
            pick(
              item,
              "PackageAmount",
              "packageAmount",
              "package_amount"
            ),
            pick(
              item,
              "provider_amount",
              "providerAmount"
            ),
            pick(
              item,
              "price",
              "Price",
              "amount",
              "Amount",
              "cost",
              "Cost"
            )
          )
        );

      if (
        id &&
        providerPrice > 0
      ) {
        result.push({
          id,
          code:
            id,
          packageCode:
            id,
          packageName:
            name,
          name,
          price:
            sellingPrice(
              service,
              providerPrice
            ),
          providerPrice,
          service,
          raw:
            item,
        });
      }
    }
  );

  const unique =
    new Map<
      string,
      CatalogItem
    >();

  for (
    const item of result
  ) {
    unique.set(
      item.id,
      item
    );
  }

  return [
    ...unique.values(),
  ];
}

/* ============================================================
 * PUBLIC OBJECTS
 * ========================================================== */

function publicNetwork(
  code: string,
  name: string
) {
  return {
    code,
    id:
      code,
    value:
      code,
    name,
    label:
      name,
    title:
      name,
    network:
      name,
    short_name:
      name,
    biller_code:
      code,
    billerCode:
      code,
    network_code:
      code,
    networkCode:
      code,
  };
}

function publicItem(
  item: CatalogItem
) {
  return {
    id:
      item.id,

    code:
      item.code,

    item_code:
      item.id,

    itemCode:
      item.id,

    product_code:
      item.code,

    productCode:
      item.code,

    product_id:
      item.id,

    productId:
      item.id,

    plan_code:
      item.code,

    planCode:
      item.code,

    package_code:
      item.packageCode ??
      item.code,

    packageCode:
      item.packageCode ??
      item.code,

    package_name:
      item.packageName ??
      item.name,

    packageName:
      item.packageName ??
      item.name,

    name:
      item.name,

    title:
      item.name,

    label:
      item.name,

    description:
      item.name,

    price:
      item.price,

    selling_price:
      item.price,

    sellingPrice:
      item.price,

    selling_amount:
      item.price,

    sellingAmount:
      item.price,

    provider_price:
      item.providerPrice,

    providerPrice:
      item.providerPrice,

    provider_amount:
      item.providerPrice,

    providerAmount:
      item.providerPrice,

    network_code:
      item.networkCode ??
      "",

    networkCode:
      item.networkCode ??
      "",

    biller_code:
      item.billerCode ??
      item.networkCode ??
      "",

    billerCode:
      item.billerCode ??
      item.networkCode ??
      "",

    provider_code:
      item.providerCode ??
      item.billerCode ??
      "",

    providerCode:
      item.providerCode ??
      item.billerCode ??
      "",

    provider_name:
      item.providerName ??
      "",

    providerName:
      item.providerName ??
      "",

    exam_type:
      item.examType ??
      null,

    examType:
      item.examType ??
      null,

    exam_type_name:
      item.examTypeName ??
      null,

    examTypeName:
      item.examTypeName ??
      null,

    meter_type:
      item.meterType ??
      null,

    meterType:
      item.meterType ??
      null,

    meter_type_name:
      item.meterTypeName ??
      null,

    meterTypeName:
      item.meterTypeName ??
      null,

    value:
      item.value ??
      null,

    denomination:
      item.value ??
      null,

    epin_value:
      item.value ??
      null,

    epinValue:
      item.value ??
      null,

    service:
      item.service,

    period:
      item.period ??
      null,

    plan_period:
      item.period ??
      null,

    planPeriod:
      item.period ??
      null,

    plan_type:
      item.planType ??
      null,

    planType:
      item.planType ??
      null,

    validity_days:
      item.validityDays ??
      null,

    validityDays:
      item.validityDays ??
      null,

    is_hot_deal:
      !!item.isHotDeal,

    isHotDeal:
      !!item.isHotDeal,
  };
}

function publicCableProvider(
  item: {
    code: string;
    name: string;
  }
) {
  return {
    code:
      item.code,
    id:
      item.code,
    value:
      item.code,
    name:
      item.name,
    label:
      item.name,
    title:
      item.name,
    provider:
      item.name,
    provider_code:
      item.code,
    providerCode:
      item.code,
    biller_code:
      item.code,
    billerCode:
      item.code,
  };
}

function publicElectricityCompany(
  company: ElectricityCompany
) {
  return {
    code:
      company.code,
    id:
      company.code,
    value:
      company.code,
    name:
      company.name,
    label:
      company.name,
    title:
      company.name,
    company:
      company.name,
    electric_company:
      company.code,
    electricCompany:
      company.code,
    biller_code:
      company.code,
    billerCode:
      company.code,

    serviceProviders:
      company.meterTypes.map(
        (meter) => ({
          code:
            meter.code,
          id:
            meter.code,
          value:
            meter.code,
          name:
            meter.name,
          label:
            meter.name,
          title:
            meter.name,
          meter_type:
            meter.code,
          meterType:
            meter.code,
          meter_type_name:
            meter.name,
          meterTypeName:
            meter.name,
        })
      ),

    meterTypes:
      company.meterTypes.map(
        (meter) => ({
          code:
            meter.code,
          id:
            meter.code,
          value:
            meter.code,
          name:
            meter.name,
          label:
            meter.name,
          title:
            meter.name,
          meter_type:
            meter.code,
          meterType:
            meter.code,
          meter_type_name:
            meter.name,
          meterTypeName:
            meter.name,
        })
      ),
  };
}

/* ============================================================
 * INPUT HELPERS
 * ========================================================== */

function requestedBiller(
  body: JsonObject,
  details: JsonObject
): string {
  return s(
    first(
      body.biller_code,
      body.billerCode,
      body.provider_code,
      body.providerCode,
      body.electric_company,
      body.electricCompany,
      body.cable_tv,
      body.cableTv,
      details.biller_code,
      details.billerCode,
      details.provider_code,
      details.providerCode,
      details.electric_company,
      details.electricCompany,
      details.cable_tv,
      details.cableTv
    )
  );
}

function requestedNetwork(
  body: JsonObject,
  details: JsonObject
): string {
  return networkCode(
    first(
      body.network_code,
      body.networkCode,
      body.network,
      details.network_code,
      details.networkCode,
      details.network,
      requestedBiller(
        body,
        details
      )
    )
  );
}

function requestedItem(
  body: JsonObject,
  details: JsonObject
): string {
  return s(
    first(
      body.item_code,
      body.itemCode,
      body.product_code,
      body.productCode,
      body.plan_code,
      body.planCode,
      body.package_code,
      body.packageCode,
      body.package,
      body.variation_code,
      body.variationCode,
      body.data_plan,
      body.dataPlan,
      details.item_code,
      details.itemCode,
      details.product_code,
      details.productCode,
      details.plan_code,
      details.planCode,
      details.package_code,
      details.packageCode,
      details.package,
      details.data_plan,
      details.dataPlan
    )
  );
}

function requestedAmount(
  body: JsonObject,
  details: JsonObject
): number {
  return n(
    first(
      body.amount,
      body.value,
      body.selling_amount,
      body.sellingAmount,
      details.amount,
      details.value,
      details.selling_amount,
      details.sellingAmount
    )
  );
}

function requestedQuantity(
  body: JsonObject,
  details: JsonObject
): number {
  const value =
    Number(
      first(
        body.quantity,
        details.quantity,
        1
      )
    );

  if (
    !Number.isInteger(
      value
    ) ||
    value < 1 ||
    value > 100
  ) {
    return 0;
  }

  return value;
}

function requestedCustomer(
  body: JsonObject,
  details: JsonObject
): string {
  return s(
    first(
      body.customer,
      body.phone,
      body.phoneNumber,
      body.phone_no,
      body.mobile_number,
      details.customer,
      details.phone,
      details.phoneNumber,
      details.phone_no,
      details.mobile_number
    )
  );
}

function requestedSmartcard(
  body: JsonObject,
  details: JsonObject
): string {
  return s(
    first(
      body.smartcard_number,
      body.smartcardNumber,
      body.smartcard_no,
      body.smartcard,
      body.smartCardNumber,
      body.iuc,
      body.iucNumber,
      details.smartcard_number,
      details.smartcardNumber,
      details.smartcard_no,
      details.smartcard,
      details.smartCardNumber,
      details.iuc,
      details.iucNumber
    )
  );
}

function requestedMeter(
  body: JsonObject,
  details: JsonObject
): string {
  return s(
    first(
      body.meter_number,
      body.meterNumber,
      body.meter_no,
      body.meterNo,
      body.meter,
      details.meter_number,
      details.meterNumber,
      details.meter_no,
      details.meterNo,
      details.meter
    )
  );
}

function requestedMeterType(
  body: JsonObject,
  details: JsonObject
): string {
  return s(
    first(
      body.meter_type,
      body.meterType,
      body.service_provider,
      body.serviceProvider,
      body.provider_code,
      body.providerCode,
      details.meter_type,
      details.meterType,
      details.service_provider,
      details.serviceProvider,
      details.provider_code,
      details.providerCode,
      "01"
    )
  );
}

function requestedProfileCode(
  body: JsonObject,
  details: JsonObject
): string {
  return s(
    first(
      body.profile_code,
      body.profileCode,
      body.profile_id,
      body.profileId,
      body.ProfileID,
      details.profile_code,
      details.profileCode,
      details.profile_id,
      details.profileId,
      details.ProfileID
    )
  );
}

function requestedExamType(
  body: JsonObject,
  details: JsonObject
): string {
  return s(
    first(
      body.exam_type,
      body.examType,
      body.ExamType,
      details.exam_type,
      details.examType,
      details.ExamType
    )
  );
}

/* ============================================================
 * SELECTED PACKAGE
 * ========================================================== */

async function findSelectedItem(
  service: ServiceType,
  biller: string,
  itemCode: string
): Promise<
  CatalogItem | undefined
> {
  switch (service) {
    case "data": {
      const items =
        await dataPlans();

      return items.find(
        (item) =>
          item.networkCode ===
            networkCode(
              biller
            ) &&
          (
            item.id ===
              itemCode ||
            item.code ===
              itemCode
          )
      );
    }

    case "data-card": {
      const items =
        await dataPinCatalog(
          networkCode(
            biller
          )
        );

      return items.find(
        (item) =>
          item.id ===
            itemCode ||
          item.code ===
            itemCode
      );
    }

    case "airtime-card":
      return (
        await airtimePinCatalog(
          networkCode(
            biller
          )
        )
      ).find(
        (item) =>
          item.id ===
            itemCode ||
          item.code ===
            itemCode
      );

    case "cable":
      return (
        await cablePackages(
          biller
        )
      ).find(
        (item) =>
          item.id ===
            itemCode ||
          item.code ===
            itemCode ||
          item.packageCode ===
            itemCode
      );

    case "smile":
      return (
        await genericPackages(
          "APISmilePackagesV2.asp",
          "smile"
        )
      ).find(
        (item) =>
          item.id ===
            itemCode ||
          item.code ===
            itemCode
      );

    case "waec":
      return (
        await genericPackages(
          "APIWAECPackagesV2.asp",
          "waec"
        )
      ).find(
        (item) =>
          item.id ===
            itemCode ||
          item.code ===
            itemCode
      );

    default:
      return undefined;
  }
}

/* ============================================================
 * TRANSACTION HELPERS
 * ========================================================== */

async function updateTransaction(
  admin: any,
  userId: string,
  reference: string,
  updates: Record<
    string,
    unknown
  >
) {
  const {
    error,
  } = await admin
    .from(
      "transactions"
    )
    .update(
      updates
    )
    .eq(
      "user_id",
      userId
    )
    .eq(
      "reference_number",
      reference
    );

  if (error) {
    console.error(
      "ClubKonnect transaction update failed:",
      error
    );
  }
}

async function refundWallet(
  admin: any,
  userId: string,
  amount: number,
  reference: string,
  reason: string,
  metadata: JsonObject
) {
  const refundReference =
    `REFUND_${reference}`;

  const {
    data,
    error,
  } = await admin.rpc(
    "refund_wallet",
    {
      _user_id:
        userId,
      _amount:
        amount,
      _description:
        "ClubKonnect service payment reversal",
      _idempotency_key:
        refundReference,
      _reference:
        refundReference,
      _metadata: {
        ...metadata,
        original_reference:
          reference,
        refund_reference:
          refundReference,
        provider:
          "clubkonnect",
        reason,
      },
    }
  );

  return {
    success:
      !error,
    data:
      error
        ? null
        : data,
    error:
      error ??
      null,
  };
}

function safeProviderResponse(
  body: any
) {
  return {
    status:
      statusText(body) ||
      null,

    statuscode:
      statusCode(body),

    orderid:
      orderId(body),

    requestid:
      requestId(body),

    remark:
      first(
        pick(
          body,
          "remark",
          "Remark",
          "orderremark",
          "OrderRemark"
        ),
        pick(
          body?.data,
          "remark",
          "Remark",
          "orderremark",
          "OrderRemark"
        )
      ) ??
      null,
  };
}

function fulfillment(
  body: any
) {
  const result:
    JsonObject = {};

  for (
    const key of [
      "carddetails",
      "cardDetails",
      "TXN_EPIN",
      "TXN_EPIN_DATABUNDLE",
      "pin",
      "PIN",
      "serial",
      "sno",
      "batchno",
      "transactionid",
      "transactiondate",
      "productname",
      "mobilenetwork",
      "amount",
      "metertoken",
      "meterno",
    ]
  ) {
    if (
      body?.[key] !==
      undefined
    ) {
      result[key] =
        body[key];
    }
  }

  return result;
}

/* ============================================================
 * VERIFICATION HELPERS
 * ========================================================== */

function verificationSuccessful(
  body: any
): boolean {
  const text =
    normalizeStatus(
      first(
        pick(
          body,
          "status",
          "Status",
          "statuscode",
          "StatusCode"
        )
      )
    );

  const customerName =
    s(
      first(
        pick(
          body,
          "customer_name",
          "customerName",
          "CustomerName"
        ),
        pick(
          body?.data,
          "customer_name",
          "customerName",
          "CustomerName"
        )
      )
    );

  if (
    customerName &&
    ![
      "INVALID_ACCOUNTNO",
      "INVALID_METERNO",
      "INVALID_SMARTCARDNO",
      "INVALID_PROFILEID",
      "INVALID_PROFILE_ID",
    ].includes(
      normalizeStatus(
        customerName
      )
    )
  ) {
    return true;
  }

  return (
    text ===
      "SUCCESS" ||
    text ===
      "SUCCESSFUL" ||
    text ===
      "COMPLETED" ||
    text ===
      "VERIFIED" ||
    statusCode(body) ===
      200
  );
}

function verificationCustomerName(
  body: any
): string | null {
  const value =
    first(
      pick(
        body,
        "customer_name",
        "customerName",
        "CustomerName"
      ),
      pick(
        body?.data,
        "customer_name",
        "customerName",
        "CustomerName"
      )
    );

  const result =
    s(value);

  return result
    ? result
    : null;
}

/* ============================================================
 * HANDLER
 * ========================================================== */

const handler = async (
  req: Request
) => {
  if (
    req.method ===
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
    req.method !==
    "POST"
  ) {
    return json(
      {
        success:
          false,
        error:
          "Method not allowed.",
      },
      405
    );
  }

  const user =
    await getUser(
      req
    );

  if (!user) {
    return json(
      {
        success:
          false,
        error:
          "Authentication required.",
      },
      401
    );
  }

  const admin =
    adminClient();

  let body:
    JsonObject;

  try {
    body =
      obj(
        await req.json()
      );
  } catch {
    return json(
      {
        success:
          false,
        error:
          "Invalid request body.",
      },
      400
    );
  }

  const details =
    obj(
      body.details
    );

  const action =
    s(
      body.action
    ).toLowerCase();

  const service =
    s(
      first(
        body.service,
        details.service
      )
    ).toLowerCase() as ServiceType;

  if (
    !SUPPORTED_SERVICES.includes(
      service
    )
  ) {
    return json(
      {
        success:
          false,
        error:
          "This service is not available through ClubKonnect.",
      },
      400
    );
  }

  console.log(
    "clubkonnect-services",
    {
      action,
      service,
      user_id:
        user.id,
    }
  );

  /* ==========================================================
   * CATALOG
   * ======================================================== */

  if (
    action ===
      "catalog" ||
    action ===
      "get_catalog"
  ) {
    try {
      const code =
        s(
          first(
            body.biller_code,
            body.billerCode,
            body.provider_code,
            body.providerCode,
            body.network_code,
            body.networkCode,
            body.cable_tv,
            body.cableTv,
            details.biller_code,
            details.billerCode,
            details.provider_code,
            details.providerCode,
            details.network_code,
            details.networkCode,
            details.cable_tv,
            details.cableTv
          )
        );

      /*
       * AIRTIME / DATA / EPIN NETWORKS
       */
      if (
        service === "airtime" ||
        service === "data" ||
        service === "airtime-card" ||
        service === "data-card"
      ) {
        const networks =
          (
            await airtimeNetworks()
          );

        const items =
          service ===
            "airtime"
            ? []
            : service ===
                "airtime-card"
              ? await airtimePinCatalog(
                  code ||
                    undefined
                )
              : service ===
                  "data-card"
                ? await dataPinCatalog(
                    code ||
                      undefined
                  )
                : await dataPlans();

        const filtered =
          code &&
          service !==
            "airtime"
            ? items.filter(
                (item) =>
                  item.networkCode ===
                  networkCode(
                    code
                  )
              )
            : items;

        return json({
          success:
            true,

          service,

          networks,

          billers:
            networks,

          providers:
            networks,

          items:
            filtered.map(
              publicItem
            ),

          plans:
            filtered.map(
              publicItem
            ),

          packages:
            filtered.map(
              publicItem
            ),

          amount_based:
            service ===
            "airtime",
        });
      }

      /*
       * ELECTRICITY
       *
       * Company and MeterType are separate.
       */
      if (
        service ===
        "electricity"
      ) {
        const companies =
          await electricityCatalog();

        const billers =
          companies.map(
            publicElectricityCompany
          );

        return json({
          success:
            true,

          service,

          billers,

          networks:
            billers,

          providers:
            billers,

          electricityCompanies:
            billers,

          serviceProviders:
            billers,

          meterTypes:
            [],

          items: [],

          plans: [],

          packages: [],

          amount_based:
            true,

          requires_verification:
            true,
        });
      }

      /*
       * CABLE
       */
      if (
        service ===
        "cable"
      ) {
        const types =
          await cableTypes();

        if (!code) {
          const providers =
            types.map(
              publicCableProvider
            );

          return json({
            success:
              true,

            service,

            billers:
              providers,

            networks:
              providers,

            providers,

            cableProviders:
              providers,

            items: [],

            plans: [],

            packages: [],

            requires_verification:
              true,
          });
        }

        const items =
          await cablePackages(
            code
          );

        const selectedType =
          types.find(
            (item) =>
              item.code
                .toLowerCase() ===
              code.toLowerCase()
          );

        const provider =
          publicCableProvider(
            {
              code,
              name:
                selectedType?.name ??
                code,
            }
          );

        return json({
          success:
            true,

          service,

          billers:
            [provider],

          networks:
            [provider],

          providers:
            [provider],

          cableProviders:
            [provider],

          items:
            items.map(
              publicItem
            ),

          plans:
            items.map(
              publicItem
            ),

          packages:
            items.map(
              publicItem
            ),

          requires_verification:
            true,
        });
      }

      /*
       * JAMB
       *
       * ExamType is NOT treated as a package.
       */
      if (
        service ===
        "jamb"
      ) {
        const examTypes =
          await jambCatalog();

        const options =
          examTypes.map(
            (item) => ({
              code:
                item.code,
              id:
                item.code,
              value:
                item.code,
              name:
                item.name,
              label:
                item.name,
              title:
                item.name,
              exam_type:
                item.code,
              examType:
                item.code,
              exam_type_name:
                item.name,
              examTypeName:
                item.name,
              providerPrice:
                item.providerPrice,
              provider_price:
                item.providerPrice,
              price:
                item.providerPrice > 0
                  ? sellingPrice(
                      "jamb",
                      item.providerPrice
                    )
                  : 0,
            })
          );

        return json({
          success:
            true,

          service,

          examTypes:
            options,

          billers:
            options,

          networks:
            options,

          providers:
            options,

          items:
            options,

          plans: [],

          packages: [],

          requires_profile_verification:
            true,

          requires_phone:
            true,
        });
      }

      /*
       * SMILE / WAEC
       */
      const items =
        await genericPackages(
          service ===
            "smile"
            ? "APISmilePackagesV2.asp"
            : "APIWAECPackagesV2.asp",
          service ===
            "smile"
            ? "smile"
            : "waec"
        );

      const option =
        {
          code:
            service,
          id:
            service,
          value:
            service,
          name:
            service ===
            "smile"
              ? "Smile"
              : "WAEC",
          label:
            service ===
            "smile"
              ? "Smile"
              : "WAEC",
          title:
            service ===
            "smile"
              ? "Smile"
              : "WAEC",
          biller_code:
            service,
          billerCode:
            service,
        };

      return json({
        success:
          true,

        service,

        billers:
          [option],

        networks:
          [option],

        providers:
          [option],

        items:
          items.map(
            publicItem
          ),

        plans:
          items.map(
            publicItem
          ),

        packages:
          items.map(
            publicItem
          ),
      });
    } catch (error) {
      console.error(
        "ClubKonnect catalogue error:",
        error
      );

      return json(
        {
          success:
            false,
          error:
            "Unable to load available service options right now.",
        },
        502
      );
    }
  }

  /* ==========================================================
   * BILLERS / NETWORKS
   * ======================================================== */

  if (
    action ===
      "billers" ||
    action ===
      "networks" ||
    action ===
      "providers"
  ) {
    try {
      if (
        service ===
          "airtime" ||
        service ===
          "data" ||
        service ===
          "airtime-card" ||
        service ===
          "data-card"
      ) {
        const billers =
          await airtimeNetworks();

        return json({
          success:
            true,
          service,
          billers,
          networks:
            billers,
          providers:
            billers,
        });
      }

      if (
        service ===
        "electricity"
      ) {
        const billers =
          (
            await electricityCatalog()
          ).map(
            publicElectricityCompany
          );

        return json({
          success:
            true,
          service,
          billers,
          networks:
            billers,
          providers:
            billers,
          electricityCompanies:
            billers,
          serviceProviders:
            billers,
        });
      }

      if (
        service ===
        "cable"
      ) {
        const billers =
          (
            await cableTypes()
          ).map(
            publicCableProvider
          );

        return json({
          success:
            true,
          service,
          billers,
          networks:
            billers,
          providers:
            billers,
          cableProviders:
            billers,
        });
      }

      if (
        service ===
        "jamb"
      ) {
        const options =
          (
            await jambCatalog()
          ).map(
            (item) => ({
              code:
                item.code,
              id:
                item.code,
              value:
                item.code,
              name:
                item.name,
              label:
                item.name,
              title:
                item.name,
              exam_type:
                item.code,
              examType:
                item.code,
              exam_type_name:
                item.name,
              examTypeName:
                item.name,
              price:
                item.providerPrice > 0
                  ? sellingPrice(
                      "jamb",
                      item.providerPrice
                    )
                  : 0,
              providerPrice:
                item.providerPrice,
            })
          );

        return json({
          success:
            true,
          service,
          billers:
            options,
          networks:
            options,
          providers:
            options,
          examTypes:
            options,
        });
      }

      const name =
        service ===
        "smile"
          ? "Smile"
          : "WAEC";

      const option =
        {
          code:
            service,
          id:
            service,
          value:
            service,
          name,
          label:
            name,
          title:
            name,
          biller_code:
            service,
          billerCode:
            service,
        };

      return json({
        success:
          true,
        service,
        billers:
          [option],
        networks:
          [option],
        providers:
          [option],
      });
    } catch (error) {
      console.error(
        "ClubKonnect billers error:",
        error
      );

      return json(
        {
          success:
            false,
          error:
            "Unable to load available service options.",
        },
        502
      );
    }
  }

  /* ==========================================================
   * VERIFY CABLE SMARTCARD
   * ======================================================== */

  if (
    action ===
      "verify_smartcard" ||
    action ===
      "verify-smartcard" ||
    action ===
      "verify_cable" ||
    action ===
      "verify-cable"
  ) {
    if (
      service !==
      "cable"
    ) {
      return json(
        {
          success:
            false,
          error:
            "SmartCard verification is only available for Cable TV.",
        },
        400
      );
    }

    const cableTv =
      requestedBiller(
        body,
        details
      );

    const smartcard =
      requestedSmartcard(
        body,
        details
      );

    if (!cableTv) {
      return json(
        {
          success:
            false,
          error:
            "Please select a Cable TV provider.",
        },
        400
      );
    }

    if (!smartcard) {
      return json(
        {
          success:
            false,
          error:
            "Enter your SmartCard/IUC number.",
        },
        400
      );
    }

    try {
      const response =
        await clubKonnectRequest(
          "APIVerifyCableTVV1.asp",
          {
            CableTV:
              cableTv,

            SmartCardNo:
              smartcard,
          }
        );

      const customerName =
        verificationCustomerName(
          response.body
        );

      const verified =
        verificationSuccessful(
          response.body
        ) &&
        customerName !==
          "INVALID_SMARTCARDNO";

      if (!verified) {
        return json(
          {
            success:
              false,

            verified:
              false,

            error:
              customerName ===
              "INVALID_SMARTCARDNO"
                ? "The SmartCard/IUC number could not be verified."
                : "Unable to verify this SmartCard/IUC number.",

            provider_response:
              safeProviderResponse(
                response.body
              ),
          },
          400
        );
      }

      return json({
        success:
          true,

        verified:
          true,

        service:
          "cable",

        provider:
          cableTv,

        smartcardNumber:
          smartcard,

        customer_name:
          customerName,

        customerName:
          customerName,

        message:
          "SmartCard verified successfully. You can now choose a package.",
      });
    } catch (error) {
      console.error(
        "Cable SmartCard verification failed:",
        error
      );

      return json(
        {
          success:
            false,
          verified:
            false,
          error:
            "Unable to verify the SmartCard right now. Please try again.",
        },
        502
      );
    }
  }

  /* ==========================================================
   * VERIFY ELECTRICITY METER
   * ======================================================== */

  if (
    action ===
      "verify_meter" ||
    action ===
      "verify-meter" ||
    action ===
      "verify_electricity" ||
    action ===
      "verify-electricity"
  ) {
    if (
      service !==
      "electricity"
    ) {
      return json(
        {
          success:
            false,
          error:
            "Meter verification is only available for electricity.",
        },
        400
      );
    }

    const electricCompany =
      s(
        first(
          body.electric_company,
          body.electricCompany,
          body.biller_code,
          body.billerCode,
          details.electric_company,
          details.electricCompany,
          details.biller_code,
          details.billerCode
        )
      );

    const meterType =
      requestedMeterType(
        body,
        details
      );

    const meterNumber =
      requestedMeter(
        body,
        details
      );

    if (!electricCompany) {
      return json(
        {
          success:
            false,
          error:
            "Please select an electricity company.",
        },
        400
      );
    }

    if (!meterNumber) {
      return json(
        {
          success:
            false,
          error:
            "Enter your meter number.",
        },
        400
      );
    }

    try {
      const response =
        await clubKonnectRequest(
          "APIVerifyElectricityV1.asp",
          {
            ElectricCompany:
              electricCompany,

            MeterNo:
              meterNumber,

            MeterType:
              meterType,
          }
        );

      const customerName =
        verificationCustomerName(
          response.body
        );

      const normalizedCustomer =
        normalizeStatus(
          customerName ??
          ""
        );

      const verified =
        verificationSuccessful(
          response.body
        ) &&
        ![
          "INVALID_METERNO",
          "INVALID_ACCOUNTNO",
        ].includes(
          normalizedCustomer
        );

      if (!verified) {
        return json(
          {
            success:
              false,

            verified:
              false,

            error:
              [
                "INVALID_METERNO",
                "INVALID_ACCOUNTNO",
              ].includes(
                normalizedCustomer
              )
                ? "The meter number could not be verified."
                : "Unable to verify this meter number.",

            provider_response:
              safeProviderResponse(
                response.body
              ),
          },
          400
        );
      }

      return json({
        success:
          true,

        verified:
          true,

        service:
          "electricity",

        electricCompany:
          electricCompany,

        biller_code:
          electricCompany,

        meterType:
          meterType,

        meter_type:
          meterType,

        meterNumber:
          meterNumber,

        meter_number:
          meterNumber,

        customer_name:
          customerName,

        customerName:
          customerName,

        message:
          "Meter verified successfully. You can now enter the amount.",
      });
    } catch (error) {
      console.error(
        "Electricity meter verification failed:",
        error
      );

      return json(
        {
          success:
            false,
          verified:
            false,
          error:
            "Unable to verify the meter right now. Please try again.",
        },
        502
      );
    }
  }

  /* ==========================================================
   * VERIFY JAMB PROFILE
   * ======================================================== */

  if (
    action ===
      "verify_profile" ||
    action ===
      "verify-profile" ||
    action ===
      "verify_jamb" ||
    action ===
      "verify-jamb"
  ) {
    if (
      service !==
      "jamb"
    ) {
      return json(
        {
          success:
            false,
          error:
            "JAMB profile verification is only available for JAMB.",
        },
        400
      );
    }

    const examType =
      requestedExamType(
        body,
        details
      );

    const profileCode =
      requestedProfileCode(
        body,
        details
      );

    if (!examType) {
      return json(
        {
          success:
            false,
          error:
            "Please select an examination type.",
        },
        400
      );
    }

    if (!profileCode) {
      return json(
        {
          success:
            false,
          error:
            "Enter your JAMB Profile Code.",
        },
        400
      );
    }

    try {
      const response =
        await clubKonnectRequest(
          "APIVerifyJAMBV1.asp",
          {
            ExamType:
              examType,

            ProfileID:
              profileCode,
          }
        );

      const customerName =
        verificationCustomerName(
          response.body
        );

      const normalizedCustomer =
        normalizeStatus(
          customerName ??
          ""
        );

      const verified =
        verificationSuccessful(
          response.body
        ) &&
        ![
          "INVALID_ACCOUNTNO",
          "INVALID_PROFILEID",
          "INVALID_PROFILE_ID",
        ].includes(
          normalizedCustomer
        );

      if (!verified) {
        return json(
          {
            success:
              false,

            verified:
              false,

            error:
              [
                "INVALID_ACCOUNTNO",
                "INVALID_PROFILEID",
                "INVALID_PROFILE_ID",
              ].includes(
                normalizedCustomer
              )
                ? "The JAMB Profile Code could not be verified."
                : "Unable to verify this JAMB Profile Code.",

            provider_response:
              safeProviderResponse(
                response.body
              ),
          },
          400
        );
      }

      return json({
        success:
          true,

        verified:
          true,

        service:
          "jamb",

        examType:
          examType,

        exam_type:
          examType,

        profileCode:
          profileCode,

        profile_code:
          profileCode,

        profileId:
          profileCode,

        profile_id:
          profileCode,

        customer_name:
          customerName,

        customerName:
          customerName,

        message:
          "JAMB Profile Code verified successfully. Enter the phone number to continue.",
      });
    } catch (error) {
      console.error(
        "JAMB profile verification failed:",
        error
      );

      return json(
        {
          success:
            false,
          verified:
            false,
          error:
            "Unable to verify the JAMB Profile Code right now. Please try again.",
        },
        502
      );
    }
  }

  /* ==========================================================
   * ITEMS / PLANS / PACKAGES
   * ======================================================== */

  if (
    action ===
      "items" ||
    action ===
      "plans" ||
    action ===
      "packages"
  ) {
    const biller =
      requestedBiller(
        body,
        details
      );

    try {
      /*
       * AIRTIME
       */
      if (
        service ===
        "airtime"
      ) {
        return json({
          success:
            true,

          service,

          biller_code:
            biller,

          items: [],
          plans: [],
          packages: [],

          amount_based:
            true,
        });
      }

      /*
       * ELECTRICITY
       *
       * Amount comes after meter verification.
       */
      if (
        service ===
        "electricity"
      ) {
        return json({
          success:
            true,

          service,

          biller_code:
            biller,

          items: [],
          plans: [],
          packages: [],

          amount_based:
            true,

          requires_verification:
            true,
        });
      }

      /*
       * JAMB
       *
       * ExamType is the service option.
       * There is no generic package selector.
       */
      if (
        service ===
        "jamb"
      ) {
        const examType =
          requestedExamType(
            body,
            details
          );

        const catalog =
          await jambCatalog();

        const selected =
          examType
            ? catalog.find(
                (item) =>
                  item.code
                    .toLowerCase() ===
                  examType.toLowerCase()
              )
            : undefined;

        return json({
          success:
            true,

          service,

          examType:
            examType ??
            null,

          exam_type:
            examType ??
            null,

          items:
            selected
              ? [
                  {
                    id:
                      selected.code,
                    code:
                      selected.code,
                    name:
                      selected.name,
                    label:
                      selected.name,
                    examType:
                      selected.code,
                    exam_type:
                      selected.code,
                    providerPrice:
                      selected.providerPrice,
                    price:
                      selected.providerPrice > 0
                        ? sellingPrice(
                            "jamb",
                            selected.providerPrice
                          )
                        : 0,
                  },
                ]
              : [],

          plans: [],

          packages: [],

          requires_profile_verification:
            true,
        });
      }

      /*
       * Network services.
       */
      if (
        service ===
          "data" ||
        service ===
          "airtime-card" ||
        service ===
          "data-card"
      ) {
        if (
          !networkCode(
            biller
          )
        ) {
          return json(
            {
              success:
                false,
              error:
                "Please select a network.",
            },
            400
          );
        }

        const code =
          networkCode(
            biller
          );

        const items =
          service ===
            "data"
            ? await dataPlans()
            : service ===
                "airtime-card"
              ? await airtimePinCatalog(
                  code
                )
              : await dataPinCatalog(
                  code
                );

        const filtered =
          items.filter(
            (item) =>
              item.networkCode ===
              code
          );

        return json({
          success:
            true,

          service,

          biller_code:
            biller,

          billerCode:
            biller,

          network_code:
            code,

          networkCode:
            code,

          items:
            filtered.map(
              publicItem
            ),

          plans:
            filtered.map(
              publicItem
            ),

          packages:
            filtered.map(
              publicItem
            ),

          amount_based:
            false,

          quantity_based:
            service ===
              "airtime-card" ||
            service ===
              "data-card",
        });
      }

      /*
       * CABLE
       */
      if (
        service ===
        "cable"
      ) {
        if (!biller) {
          return json(
            {
              success:
                false,
              error:
                "Please select a Cable TV provider.",
            },
            400
          );
        }

        const items =
          await cablePackages(
            biller
          );

        return json({
          success:
            true,

          service,

          biller_code:
            biller,

          billerCode:
            biller,

          items:
            items.map(
              publicItem
            ),

          plans:
            items.map(
              publicItem
            ),

          packages:
            items.map(
              publicItem
            ),

          requires_verification:
            true,
        });
      }

      /*
       * SMILE / WAEC
       */
      const items =
        await genericPackages(
          service ===
            "smile"
            ? "APISmilePackagesV2.asp"
            : "APIWAECPackagesV2.asp",
          service ===
            "smile"
            ? "smile"
            : "waec"
        );

      return json({
        success:
          true,

        service,

        items:
          items.map(
            publicItem
          ),

        plans:
          items.map(
            publicItem
          ),

        packages:
          items.map(
            publicItem
          ),
      });
    } catch (error) {
      console.error(
        "ClubKonnect items error:",
        error
      );

      return json(
        {
          success:
            false,
          error:
            "Unable to load available packages right now.",
        },
        502
      );
    }
  }

  /* ==========================================================
   * VALIDATE
   * ======================================================== */

  if (
    action ===
    "validate"
  ) {
    const biller =
      requestedBiller(
        body,
        details
      );

    const itemCode =
      requestedItem(
        body,
        details
      );

    if (
      service ===
      "airtime"
    ) {
      return json({
        success:
          true,
        status:
          "successful",
        validated:
          true,
      });
    }

    if (
      service ===
      "electricity"
    ) {
      return json({
        success:
          true,
        status:
          "successful",
        validated:
          true,
      });
    }

    if (
      service ===
      "jamb"
    ) {
      const examType =
        requestedExamType(
          body,
          details
        );

      const profileCode =
        requestedProfileCode(
          body,
          details
        );

      if (!examType) {
        return json(
          {
            success:
              false,
            error:
              "Examination type is required.",
          },
          400
        );
      }

      if (!profileCode) {
        return json(
          {
            success:
              false,
            error:
              "JAMB Profile Code is required.",
          },
          400
        );
      }

      return json({
        success:
          true,
        status:
          "successful",
        validated:
          true,
        examType,
        exam_type:
          examType,
        profileCode,
        profile_code:
          profileCode,
      });
    }

    if (
      !itemCode
    ) {
      return json(
        {
          success:
            false,
          error:
            "A valid package is required.",
        },
        400
      );
    }

    try {
      const selected =
        await findSelectedItem(
          service,
          biller,
          itemCode
        );

      if (!selected) {
        return json(
          {
            success:
              false,
            error:
              "The selected package is no longer available.",
          },
          400
        );
      }

      return json({
        success:
          true,

        status:
          "successful",

        validated:
          true,

        data:
          publicItem(
            selected
          ),
      });
    } catch (error) {
      console.error(
        "ClubKonnect validation error:",
        error
      );

      return json(
        {
          success:
            false,
          error:
            "Unable to verify the selected package.",
        },
        502
      );
    }
  }

  /* ==========================================================
   * PURCHASE
   * ======================================================== */

  if (
    action ===
      "purchase" ||
    action ===
      "pay" ||
    action ===
      "buy" ||
    action ===
      "service"
  ) {
    const biller =
      requestedBiller(
        body,
        details
      );

    const network =
      requestedNetwork(
        body,
        details
      );

    const itemCode =
      requestedItem(
        body,
        details
      );

    const quantity =
      requestedQuantity(
        body,
        details
      );

    const customerRaw =
      requestedCustomer(
        body,
        details
      );

    const customer =
      normalizePhone(
        customerRaw
      );

    const smartcard =
      requestedSmartcard(
        body,
        details
      );

    const meterNumber =
      requestedMeter(
        body,
        details
      );

    const meterType =
      requestedMeterType(
        body,
        details
      );

    const profileCode =
      requestedProfileCode(
        body,
        details
      );

    const examType =
      requestedExamType(
        body,
        details
      );

    /*
     * Network services.
     */
    if (
      (
        service ===
          "airtime" ||
        service ===
          "data" ||
        service ===
          "airtime-card" ||
        service ===
          "data-card"
      ) &&
      !NETWORKS[
        network
      ]
    ) {
      return json(
        {
          success:
            false,
          error:
            "Please select a valid network.",
        },
        400
      );
    }

    /*
     * E-PIN quantity.
     */
    if (
      (
        service ===
          "airtime-card" ||
        service ===
          "data-card"
      ) &&
      !quantity
    ) {
      return json(
        {
          success:
            false,
          error:
            "Quantity must be between 1 and 100.",
        },
        400
      );
    }

    /*
     * Phone based services.
     */
    if (
      (
        service ===
          "airtime" ||
        service ===
          "data" ||
        service ===
          "airtime-card" ||
        service ===
          "data-card" ||
        service ===
          "smile" ||
        service ===
          "waec" ||
        service ===
          "jamb"
      ) &&
      !validPhone(
        customer
      )
    ) {
      return json(
        {
          success:
            false,
          error:
            "Enter a valid Nigerian mobile number.",
        },
        400
      );
    }

    /*
     * Cable.
     */
    if (
      service ===
      "cable"
    ) {
      if (!biller) {
        return json(
          {
            success:
              false,
            error:
              "Please select a Cable TV provider.",
          },
          400
        );
      }

      if (!smartcard) {
        return json(
          {
            success:
              false,
            error:
              "Enter a valid SmartCard/IUC number.",
          },
          400
        );
      }

      if (!itemCode) {
        return json(
          {
            success:
              false,
            error:
              "Please select a Cable TV package.",
          },
          400
        );
      }
    }

    /*
     * Electricity.
     */
    if (
      service ===
      "electricity"
    ) {
      if (!biller) {
        return json(
          {
            success:
              false,
            error:
              "Please select an electricity company.",
          },
          400
        );
      }

      if (!meterNumber) {
        return json(
          {
            success:
              false,
            error:
              "Enter a valid meter number.",
          },
          400
        );
      }

      if (!meterType) {
        return json(
          {
            success:
              false,
            error:
              "Please select a meter type/service provider.",
          },
          400
        );
      }
    }

    /*
     * JAMB.
     */
    if (
      service ===
      "jamb"
    ) {
      if (!examType) {
        return json(
          {
            success:
              false,
            error:
              "Please select an examination type.",
          },
          400
        );
      }

      if (!profileCode) {
        return json(
          {
            success:
              false,
            error:
              "Enter your JAMB Profile Code.",
          },
          400
        );
      }
    }

    /*
     * Package services.
     */
    if (
      (
        service ===
          "data" ||
        service ===
          "cable" ||
        service ===
          "airtime-card" ||
        service ===
          "data-card" ||
        service ===
          "smile" ||
        service ===
          "waec"
      ) &&
      !itemCode
    ) {
      return json(
        {
          success:
            false,
          error:
            "Please select a valid package.",
        },
        400
      );
    }

    const reference =
      `CK_${service
        .replace(
          /[^a-z0-9]/gi,
          "_"
        )
        .toUpperCase()}_${crypto.randomUUID()}`;

    let selected:
      | CatalogItem
      | undefined;

    let providerAmount =
      0;

    let total =
      0;

    /* ========================================================
     * PRICE VERIFICATION
     * ====================================================== */

    try {
      /*
       * AIRTIME
       */
      if (
        service ===
        "airtime"
      ) {
        const amount =
          requestedAmount(
            body,
            details
          );

        if (
          amount < 50 ||
          amount > 200000
        ) {
          return json(
            {
              success:
                false,
              error:
                "Airtime amount must be between ₦50 and ₦200,000.",
            },
            400
          );
        }

        providerAmount =
          roundMoney(
            amount
          );

        total =
          sellingPrice(
            "airtime",
            providerAmount
          );

        selected = {
          id:
            `${network}-${amount}`,
          code:
            `${network}-${amount}`,
          name:
            `${networkName(network)} Airtime`,
          price:
            total,
          providerPrice:
            providerAmount,
          networkCode:
            network,
          service:
            "airtime",
          raw: {},
        };
      }

      /*
       * ELECTRICITY
       */
      else if (
        service ===
        "electricity"
      ) {
        const amount =
          requestedAmount(
            body,
            details
          );

        if (
          amount <= 0
        ) {
          return json(
            {
              success:
                false,
              error:
                "Please enter a valid electricity amount.",
            },
            400
          );
        }

        providerAmount =
          roundMoney(
            amount
          );

        total =
          sellingPrice(
            "electricity",
            providerAmount
          );

        selected = {
          id:
            `${biller}-${meterType}-${amount}`,
          code:
            `${biller}-${meterType}-${amount}`,
          name:
            `${biller} Electricity`,
          price:
            total,
          providerPrice:
            providerAmount,
          billerCode:
            biller,
          providerCode:
            meterType,
          providerName:
            meterType,
          meterType:
            meterType,
          service:
            "electricity",
          raw: {},
        };
      }

      /*
       * JAMB
       *
       * JAMB purchase is priced from the
       * actual ExamType catalogue.
       */
      else if (
        service ===
        "jamb"
      ) {
        const catalog =
          await jambCatalog();

        const jamb =
          catalog.find(
            (item) =>
              item.code
                .toLowerCase() ===
              examType.toLowerCase()
          );

        if (
          !jamb ||
          jamb.providerPrice <= 0
        ) {
          return json(
            {
              success:
                false,
              error:
                "The selected JAMB examination type is currently unavailable.",
            },
            400
          );
        }

        providerAmount =
          jamb.providerPrice;

        total =
          sellingPrice(
            "jamb",
            providerAmount
          );

        selected = {
          id:
            examType,
          code:
            examType,
          name:
            jamb.name,
          packageCode:
            examType,
          packageName:
            jamb.name,
          examType:
            examType,
          examTypeName:
            jamb.name,
          price:
            total,
          providerPrice:
            providerAmount,
          service:
            "jamb",
          raw:
            jamb.raw,
        };
      }

      /*
       * PACKAGE SERVICES
       */
      else {
        selected =
          await findSelectedItem(
            service,
            biller ||
              network ||
              service,
            itemCode
          );

        if (!selected) {
          return json(
            {
              success:
                false,
              error:
                "The selected service package is no longer available.",
            },
            400
          );
        }

        providerAmount =
          selected.providerPrice;

        const units =
          (
            service ===
              "airtime-card" ||
            service ===
              "data-card"
          )
            ? quantity
            : 1;

        total =
          roundMoney(
            selected.price *
              units
          );
      }
    } catch (error) {
      console.error(
        "ClubKonnect price verification error:",
        error
      );

      return json(
        {
          success:
            false,
          error:
            "Unable to verify the selected service. Please try again.",
        },
        502
      );
    }

    if (
      !selected ||
      total <= 0 ||
      providerAmount <= 0
    ) {
      return json(
        {
          success:
            false,
          error:
            "The selected service has an invalid price.",
        },
        400
      );
    }

    const metadata:
      JsonObject = {
        service,

        category:
          "bill_payment",

        provider:
          "clubkonnect",

        provider_id:
          "clubkonnect",

        biller_code:
          biller ||
          selected.billerCode ||
          null,

        network_code:
          selected.networkCode ||
          network ||
          null,

        provider_code:
          selected.providerCode ||
          null,

        provider_name:
          selected.providerName ||
          null,

        item_code:
          selected.id,

        product_code:
          selected.code,

        package_code:
          selected.packageCode ??
          null,

        package_name:
          selected.packageName ??
          selected.name,

        exam_type:
          examType ||
          selected.examType ||
          null,

        profile_code:
          profileCode ||
          null,

        provider_amount:
          providerAmount,

        selling_amount:
          total,

        markup_rate:
          markupRate(
            service
          ),

        quantity:
          (
            service ===
              "airtime-card" ||
            service ===
              "data-card"
          )
            ? quantity
            : 1,

        epin_value:
          selected.value ??
          (
            service ===
            "airtime-card"
              ? airtimePinValue(
                  selected
                )
              : null
          ),

        customer:
          customer ||
          null,

        phone_number:
          customer ||
          null,

        smartcard:
          smartcard ||
          null,

        smartcard_number:
          smartcard ||
          null,

        meter_number:
          meterNumber ||
          null,

        meter_type:
          meterType ||
          selected.meterType ||
          null,

        plan_name:
          selected.name,

        plan_period:
          selected.period ??
          null,

        plan_type:
          selected.planType ??
          null,

        is_hot_deal:
          !!selected.isHotDeal,

        request_id:
          reference,

        reconciliation_required:
          true,
      };

    /* ========================================================
     * WALLET DEBIT
     * ====================================================== */

    const {
      data:
        debitResult,
      error:
        debitError,
    } = await admin.rpc(
      "debit_wallet",
      {
        _user_id:
          user.id,

        _amount:
          total,

        _description:
          `${service} purchase`,

        _idempotency_key:
          reference,

        _reference:
          reference,

        _category:
          "bill_payment",

        _metadata:
          metadata,
      }
    );

    if (
      debitError
    ) {
      console.error(
        "ClubKonnect wallet debit failed:",
        debitError
      );

      return json(
        {
          success:
            false,
          error:
            "Unable to process the payment from your wallet.",
        },
        400
      );
    }

    const transactionId =
      debitResult?.id ??
      null;

    /* ========================================================
     * PROVIDER PURCHASE
     * ====================================================== */

    let providerResponse:
      any;

    try {
      const callback =
        clubKonnectCallbackUrl();

      /*
       * AIRTIME
       */
      if (
        service ===
        "airtime"
      ) {
        providerResponse =
          await clubKonnectRequest(
            "APIAirtimeV1.asp",
            {
              MobileNetwork:
                networkCode(
                  selected.networkCode ||
                    network
                ),

              MobileNumber:
                customer,

              Amount:
                providerAmount,

              RequestID:
                reference,

              CallBackURL:
                callback,
            }
          );
      }

      /*
       * DATA
       */
      else if (
        service ===
        "data"
      ) {
        providerResponse =
          await clubKonnectRequest(
            "APIDatabundleV1.asp",
            {
              MobileNetwork:
                networkCode(
                  selected.networkCode ||
                    network
                ),

              MobileNumber:
                customer,

              DataPlan:
                selected.code ||
                selected.id,

              RequestID:
                reference,

              CallBackURL:
                callback,
            }
          );
      }

      /*
       * ELECTRICITY
       */
      else if (
        service ===
        "electricity"
      ) {
        providerResponse =
          await clubKonnectRequest(
            "APIElectricityV1.asp",
            {
              ElectricCompany:
                biller,

              MeterType:
                meterType,

              MeterNo:
                meterNumber,

              Amount:
                providerAmount,

              PhoneNo:
                customer,

              RequestID:
                reference,

              CallBackURL:
                callback,
            }
          );
      }

      /*
       * CABLE TV
       */
      else if (
        service ===
        "cable"
      ) {
        providerResponse =
          await clubKonnectRequest(
            "APICableTVV1.asp",
            {
              CableTV:
                biller,

              Package:
                selected.packageCode ||
                selected.code ||
                selected.id,

              SmartCardNo:
                smartcard,

              PhoneNo:
                customer,

              RequestID:
                reference,

              CallBackURL:
                callback,
            }
          );
      }

      /*
       * AIRTIME E-PIN
       */
      else if (
        service ===
        "airtime-card"
      ) {
        providerResponse =
          await clubKonnectRequest(
            "APIEPINV1.asp",
            {
              MobileNetwork:
                networkCode(
                  selected.networkCode ||
                    network
                ),

              Value:
                airtimePinValue(
                  selected
                ),

              Quantity:
                quantity,

              RequestID:
                reference,

              CallBackURL:
                callback,
            }
          );
      }

      /*
       * DATA E-PIN
       */
      else if (
        service ===
        "data-card"
      ) {
        providerResponse =
          await clubKonnectRequest(
            "APIDatabundleEPINV1.asp",
            {
              MobileNetwork:
                networkCode(
                  selected.networkCode ||
                    network
                ),

              DataPlan:
                selected.packageCode ||
                selected.code ||
                selected.id,

              Quantity:
                quantity,

              RequestID:
                reference,

              CallBackURL:
                callback,
            }
          );
      }

      /*
       * SMILE
       */
      else if (
        service ===
        "smile"
      ) {
        providerResponse =
          await clubKonnectRequest(
            "APISmileV1.asp",
            {
              MobileNumber:
                customer,

              DataPlan:
                selected.code ||
                selected.id,

              RequestID:
                reference,

              CallBackURL:
                callback,
            }
          );
      }

      /*
       * WAEC
       */
      else if (
        service ===
        "waec"
      ) {
        providerResponse =
          await clubKonnectRequest(
            "APIWAECV1.asp",
            {
              ExamType:
                selected.code ||
                selected.id,

              PhoneNo:
                customer,

              RequestID:
                reference,

              CallBackURL:
                callback,
            }
          );
      }

      /*
       * JAMB
       *
       * IMPORTANT:
       * ProfileID is verified before purchase,
       * but ClubKonnect's purchase API uses
       * ExamType + PhoneNo.
       */
      else {
        providerResponse =
          await clubKonnectRequest(
            "APIJAMBV1.asp",
            {
              ExamType:
                examType,

              PhoneNo:
                customer,

              RequestID:
                reference,

              CallBackURL:
                callback,
            }
          );
      }
    } catch (
      providerError
    ) {
      console.error(
        "ClubKonnect provider request exception:",
        providerError
      );

      await updateTransaction(
        admin,
        user.id,
        reference,
        {
          status:
            "pending",

          provider:
            "clubkonnect",

          provider_reference:
            reference,

          metadata: {
            ...metadata,

            provider_request_failed:
              true,

            provider_request_error:
              providerError instanceof
              Error
                ? providerError.message
                : String(
                    providerError
                  ),

            reconciliation_required:
              true,

            pending_reason:
              "provider_network_or_request_error",

            pending_since:
              new Date().toISOString(),
          },
        }
      );

      return json({
        success:
          true,

        status:
          "pending",

        reference,

        transaction_id:
          transactionId,

        message:
          "Your payment is being verified. Please wait while we confirm the provider result.",
      });
    }

    /* ========================================================
     * CLASSIFY
     * ====================================================== */

    const classified =
      classify(
        providerResponse.body,
        providerResponse.ok
      );

    const providerOrderId =
      orderId(
        providerResponse.body
      );

    const providerRequestId =
      requestId(
        providerResponse.body
      ) ??
      reference;

    const safe =
      safeProviderResponse(
        providerResponse.body
      );

    /* ========================================================
     * SUCCESS
     * ====================================================== */

    if (
      classified.state ===
      "successful"
    ) {
      const fulfilled =
        fulfillment(
          providerResponse.body
        );

      await updateTransaction(
        admin,
        user.id,
        reference,
        {
          status:
            "successful",

          provider:
            "clubkonnect",

          provider_reference:
            providerOrderId ??
            providerRequestId,

          completed_at:
            new Date().toISOString(),

          metadata: {
            ...metadata,

            clubkonnect_order_id:
              providerOrderId,

            clubkonnect_request_id:
              providerRequestId,

            clubkonnect_statuscode:
              classified.code,

            clubkonnect_status:
              classified.text,

            clubkonnect_response:
              safe,

            fulfillment:
              fulfilled,

            reconciliation_required:
              false,

            reconciled_at:
              new Date().toISOString(),
          },
        }
      );

      return json({
        success:
          true,

        status:
          "successful",

        reference,

        transaction_id:
          transactionId,

        message:
          service ===
          "data"
            ? "Data purchase completed successfully."
            : service ===
                "jamb"
              ? "JAMB e-PIN purchase completed successfully."
              : service ===
                  "cable"
                ? "Cable TV subscription completed successfully."
                : service ===
                    "electricity"
                  ? "Electricity payment completed successfully."
                  : service ===
                      "airtime-card" ||
                    service ===
                      "data-card"
                    ? "E-PIN purchase completed successfully."
                    : "Purchase completed successfully.",

        fulfillment:
          fulfilled,
      });
    }

    /* ========================================================
     * DEFINITIVE FAILURE
     * ====================================================== */

    if (
      classified.state ===
      "failed"
    ) {
      const refundResult =
        await refundWallet(
          admin,
          user.id,
          total,
          reference,
          `${service} purchase failed.`,
          {
            ...metadata,

            clubkonnect_order_id:
              providerOrderId,

            clubkonnect_request_id:
              providerRequestId,

            clubkonnect_statuscode:
              classified.code,

            clubkonnect_status:
              classified.text,

            clubkonnect_response:
              safe,
          }
        );

      await updateTransaction(
        admin,
        user.id,
        reference,
        {
          status:
            "failed",

          provider:
            "clubkonnect",

          provider_reference:
            providerOrderId ??
            providerRequestId,

          metadata: {
            ...metadata,

            clubkonnect_order_id:
              providerOrderId,

            clubkonnect_request_id:
              providerRequestId,

            clubkonnect_statuscode:
              classified.code,

            clubkonnect_status:
              classified.text,

            clubkonnect_response:
              safe,

            refunded:
              refundResult.success,

            refund_pending:
              !refundResult.success,
          },
        }
      );

      if (
        !refundResult.success
      ) {
        return json(
          {
            success:
              false,

            status:
              "failed",

            reference,

            error:
              "The payment failed, but the automatic refund requires retry.",
          },
          503
        );
      }

      return json({
        success:
          false,

        status:
          "failed",

        reference,

        error:
          "Purchase failed. Your wallet has been refunded.",
      });
    }

    /* ========================================================
     * PENDING
     * ====================================================== */

    await updateTransaction(
      admin,
      user.id,
      reference,
      {
        status:
          "pending",

        provider:
          "clubkonnect",

        provider_reference:
          providerOrderId ??
          providerRequestId,

        metadata: {
          ...metadata,

          clubkonnect_order_id:
            providerOrderId,

          clubkonnect_request_id:
            providerRequestId,

          clubkonnect_statuscode:
            classified.code,

          clubkonnect_status:
            classified.text,

          clubkonnect_response:
            safe,

          reconciliation_required:
            true,

          pending_since:
            new Date().toISOString(),
        },
      }
    );

    return json({
      success:
        true,

      status:
        "pending",

      reference,

      transaction_id:
        transactionId,

      message:
        "Your purchase is being processed. We are verifying the provider result.",
    });
  }

  /* ==========================================================
   * STATUS / RECONCILIATION
   * ======================================================== */

  if (
    action ===
      "status" ||
    action ===
      "check_status"
  ) {
    const reference =
      s(
        first(
          body.reference,
          body.transaction_reference,
          body.transactionReference,
          details.reference,
          details.transaction_reference,
          details.transactionReference
        )
      );

    if (!reference) {
      return json(
        {
          success:
            false,
          error:
            "Transaction reference is required.",
        },
        400
      );
    }

    const {
      data:
        transaction,
      error:
        transactionError,
    } = await admin
      .from(
        "transactions"
      )
      .select(
        "id, amount, status, provider, provider_reference, metadata"
      )
      .eq(
        "user_id",
        user.id
      )
      .eq(
        "reference_number",
        reference
      )
      .maybeSingle();

    if (
      transactionError ||
      !transaction
    ) {
      return json(
        {
          success:
            false,
          error:
            "Transaction not found.",
        },
        404
      );
    }

    if (
      transaction.status ===
      "successful"
    ) {
      return json({
        success:
          true,

        status:
          "successful",

        reference,

        transaction_id:
          transaction.id,

        data:
          transaction.metadata
            ?.fulfillment ??
          {},
      });
    }

    if (
      transaction.status ===
      "failed"
    ) {
      return json({
        success:
          false,

        status:
          "failed",

        reference,

        transaction_id:
          transaction.id,
      });
    }

    const metadata =
      obj(
        transaction.metadata
      );

    const providerOrder =
      s(
        first(
          metadata.clubkonnect_order_id,
          transaction.provider_reference
        )
      );

    const providerRequest =
      s(
        first(
          metadata.clubkonnect_request_id,
          metadata.request_id,
          reference
        )
      );

    let providerResponse:
      any;

    try {
      providerResponse =
        await clubKonnectRequest(
          "APIQueryV1.asp",
          providerOrder
            ? {
                OrderID:
                  providerOrder,
              }
            : {
                RequestID:
                  providerRequest,
              }
        );
    } catch (
      error
    ) {
      console.error(
        "ClubKonnect reconciliation request failed:",
        error
      );

      return json({
        success:
          true,

        status:
          "pending",

        reference,

        transaction_id:
          transaction.id,

        message:
          "Your purchase is still being verified.",
      });
    }

    const classified =
      classify(
        providerResponse.body,
        providerResponse.ok
      );

    const actualOrder =
      orderId(
        providerResponse.body
      ) ??
      providerOrder ??
      null;

    const actualRequest =
      requestId(
        providerResponse.body
      ) ??
      providerRequest ??
      reference;

    const safe =
      safeProviderResponse(
        providerResponse.body
      );

    if (
      classified.state ===
      "successful"
    ) {
      const fulfilled =
        fulfillment(
          providerResponse.body
        );

      await updateTransaction(
        admin,
        user.id,
        reference,
        {
          status:
            "successful",

          provider:
            "clubkonnect",

          provider_reference:
            actualOrder ??
            actualRequest,

          completed_at:
            new Date().toISOString(),

          metadata: {
            ...metadata,

            clubkonnect_order_id:
              actualOrder,

            clubkonnect_request_id:
              actualRequest,

            clubkonnect_statuscode:
              classified.code,

            clubkonnect_status:
              classified.text,

            clubkonnect_response:
              safe,

            fulfillment:
              fulfilled,

            reconciliation_required:
              false,

            reconciled_at:
              new Date().toISOString(),
          },
        }
      );

      return json({
        success:
          true,

        status:
          "successful",

        reference,

        transaction_id:
          transaction.id,

        message:
          "Purchase completed successfully.",

        fulfillment:
          fulfilled,
      });
    }

    if (
      classified.state ===
      "failed"
    ) {
      const amount =
        n(
          transaction.amount
        );

      const refundResult =
        await refundWallet(
          admin,
          user.id,
          amount,
          reference,
          "ClubKonnect transaction failed during reconciliation.",
          {
            ...metadata,

            clubkonnect_order_id:
              actualOrder,

            clubkonnect_request_id:
              actualRequest,

            clubkonnect_status:
              classified.text,

            clubkonnect_statuscode:
              classified.code,

            clubkonnect_response:
              safe,
          }
        );

      await updateTransaction(
        admin,
        user.id,
        reference,
        {
          status:
            "failed",

          provider:
            "clubkonnect",

          provider_reference:
            actualOrder ??
            actualRequest,

          metadata: {
            ...metadata,

            clubkonnect_order_id:
              actualOrder,

            clubkonnect_request_id:
              actualRequest,

            clubkonnect_status:
              classified.text,

            clubkonnect_statuscode:
              classified.code,

            clubkonnect_response:
              safe,

            refunded:
              refundResult.success,

            refund_pending:
              !refundResult.success,
          },
        }
      );

      if (
        !refundResult.success
      ) {
        return json(
          {
            success:
              false,

            status:
              "failed",

            reference,

            error:
              "The transaction failed and the automatic refund requires retry.",
          },
          503
        );
      }

      return json({
        success:
          false,

        status:
          "failed",

        reference,

        message:
          "Purchase failed. Your wallet has been refunded.",
      });
    }

    await updateTransaction(
      admin,
      user.id,
      reference,
      {
        status:
          "pending",

        provider:
          "clubkonnect",

        provider_reference:
          actualOrder ??
          actualRequest,

        metadata: {
          ...metadata,

          clubkonnect_order_id:
            actualOrder,

          clubkonnect_request_id:
            actualRequest,

          clubkonnect_status:
            classified.text,

          clubkonnect_statuscode:
            classified.code,

          clubkonnect_response:
            safe,

          reconciliation_required:
            true,
        },
      }
    );

    return json({
      success:
        true,

      status:
        "pending",

      reference,

      transaction_id:
        transaction.id,

      message:
        "Your purchase is still being verified.",
    });
  }

  return json(
    {
      success:
        false,
      error:
        "Unsupported action.",
    },
    400
  );
};

Deno.serve(
  handler
);

export default handler;
