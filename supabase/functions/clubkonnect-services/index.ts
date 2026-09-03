import {
  corsHeaders,
  json,
  adminClient,
  getUser,
} from "../_shared/auth.ts";

/**
 * IyanjuPay - ClubKonnect service provider
 *
 * Customer-facing services:
 *   data
 *   education
 *   airtime-card
 *   data-card
 *
 * Provider names / provider implementation details remain server-side.
 */

type JsonObject = Record<string, any>;

type ClubService =
  | "data"
  | "education"
  | "airtime-card"
  | "data-card";

type CatalogItem = {
  id: string;
  code?: string;
  name: string;
  price: number;
  networkCode?: string;
  service: ClubService;
  period?: string;
  planType?: string;
  validityDays?: number | null;
  isHotDeal?: boolean;
  raw: JsonObject;
};

const BASE = "https://www.nellobytesystems.com";

const NETWORK_NAMES: Record<string, string> = {
  "01": "MTN",
  "02": "Glo",
  "03": "9mobile",
  "04": "Airtel",
};

const FAILURE_TEXT = new Set([
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
  "INVALID_EXAMTYPE",
  "MISSING_EXAMTYPE",
  "INSUFFICIENT_BALANCE",
  "INSUFFICIENT_FUNDS",
  "QUANTITY_NOT_AVAILABLE",
  "PIN_NOT_AVAILABLE",
]);

const PENDING_TEXT = new Set([
  "ORDER_RECEIVED",
  "ORDER_ONHOLD",
  "ORDER_PROCESSED",
  "PROCESSING",
  "PENDING",
  "REQUEST_QUEUED",
  "REQUEST_PROCESSING",
  "NETWORK_UNRESPONSIVE",
]);

// ============================================================
// BASIC HELPERS
// ============================================================

function s(value: unknown): string {
  return String(value ?? "").trim();
}

function n(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0
      ? Math.round(value * 100) / 100
      : 0;
  }

  const text = s(value)
    .replace(/[₦,\s]/g, "")
    .replace(/NGN/gi, "");

  if (!text) return 0;

  const x = Number(text);

  return Number.isFinite(x) && x >= 0
    ? Math.round(x * 100) / 100
    : 0;
}

function first(...values: unknown[]): unknown {
  for (const value of values) {
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

function obj(value: unknown): JsonObject {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value as JsonObject
    : {};
}

function normalizeStatus(value: unknown): string {
  return s(value)
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

// ============================================================
// CASE-INSENSITIVE PROPERTY LOOKUP
// ============================================================

function pick(
  value: unknown,
  ...aliases: string[]
): unknown {
  const source = obj(value);

  if (!Object.keys(source).length) {
    return undefined;
  }

  const normalized = new Map<string, unknown>();

  for (const [key, val] of Object.entries(source)) {
    normalized.set(
      key
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, ""),
      val,
    );
  }

  for (const alias of aliases) {
    const key = alias
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

    if (normalized.has(key)) {
      const value = normalized.get(key);

      if (
        value !== undefined &&
        value !== null &&
        s(value) !== ""
      ) {
        return value;
      }
    }
  }

  return undefined;
}

// ============================================================
// NETWORK
// ============================================================

function networkCode(value: unknown): string {
  const original = s(value);

  if (!original) return "";

  const key = original
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

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

  return original;
}

function extractNetworkFromObject(
  raw: unknown,
): string {
  const value = first(
    pick(
      raw,
      "MOBILENETWORK",
      "MobileNetwork",
      "mobilenetwork",
      "networkid",
      "network_id",
      "networkCode",
      "network_code",
      "network",
      "Network",
      "NetworkName",
      "network_name",
      "provider",
      "provider_name",
    ),
  );

  return networkCode(value);
}

// ============================================================
// STATUS HELPERS
// ============================================================

function statusCode(body: any): number | null {
  const x = Number(
    first(
      pick(body, "statuscode"),
      pick(body, "statusCode"),
      pick(body, "StatusCode"),
      pick(body?.data, "statuscode"),
      pick(body?.data, "statusCode"),
    ),
  );

  return Number.isFinite(x) ? x : null;
}

function statusText(body: any): string {
  return normalizeStatus(
    first(
      pick(body, "status"),
      pick(body, "orderstatus"),
      pick(body, "Status"),
      pick(body, "OrderStatus"),
      pick(body?.data, "status"),
      pick(body?.data, "orderstatus"),
    ),
  );
}

function orderId(body: any): string | null {
  const x = first(
    pick(body, "orderid"),
    pick(body, "orderId"),
    pick(body, "OrderID"),
    pick(body?.data, "orderid"),
    pick(body?.data, "orderId"),
    pick(body?.data, "OrderID"),
  );

  return x === undefined ? null : s(x);
}

function requestId(body: any): string | null {
  const x = first(
    pick(body, "requestid"),
    pick(body, "requestId"),
    pick(body, "RequestID"),
    pick(body?.data, "requestid"),
    pick(body?.data, "requestId"),
    pick(body?.data, "RequestID"),
  );

  return x === undefined ? null : s(x);
}

function classify(body: any, ok: boolean) {
  const code = statusCode(body);
  const text = statusText(body);

  if (
    ok &&
    (
      code === 200 ||
      text === "ORDER_COMPLETED" ||
      text === "SUCCESS" ||
      text === "SUCCESSFUL"
    )
  ) {
    return {
      state: "successful" as const,
      code,
      text,
    };
  }

  if (text && FAILURE_TEXT.has(text)) {
    return {
      state: "failed" as const,
      code,
      text,
    };
  }

  if (text && PENDING_TEXT.has(text)) {
    return {
      state: "pending" as const,
      code,
      text,
    };
  }

  return {
    state: "pending" as const,
    code,
    text,
  };
}

// ============================================================
// CREDENTIALS / PROVIDER REQUEST
// ============================================================

function credentials() {
  const userId = s(
    Deno.env.get("CLUBKONNECT_USER_ID") ??
    Deno.env.get("CLUBKONNECT_USERID"),
  );

  const apiKey = s(
    Deno.env.get("CLUBKONNECT_API_KEY") ??
    Deno.env.get("CLUBKONNECT_APIKEY"),
  );

  if (!userId || !apiKey) {
    throw new Error(
      "ClubKonnect credentials are not configured.",
    );
  }

  return {
    userId,
    apiKey,
  };
}

function callbackUrl(): string | undefined {
  const configured = s(
    Deno.env.get("CLUBKONNECT_CALLBACK_URL"),
  );

  if (configured) {
    return configured;
  }

  const supabaseUrl = s(
    Deno.env.get("SUPABASE_URL"),
  );

  return supabaseUrl
    ? `${supabaseUrl.replace(/\/$/, "")}/functions/v1/clubkonnect-webhook`
    : undefined;
}

async function ck(
  endpoint: string,
  params: Record<string, unknown> = {},
) {
  const { userId, apiKey } = credentials();

  const url = new URL(
    `${BASE}/${endpoint}`,
  );

  url.searchParams.set(
    "UserID",
    userId,
  );

  url.searchParams.set(
    "APIKey",
    apiKey,
  );

  for (const [key, value] of Object.entries(params)) {
    if (
      value !== undefined &&
      s(value) !== ""
    ) {
      url.searchParams.set(
        key,
        s(value),
      );
    }
  }

  console.log(
    "ClubKonnect request",
    {
      endpoint,
      parameter_names:
        Object.keys(params),
    },
  );

  const response = await fetch(
    url,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    },
  );

  const text = await response.text();

  let body: any = {};

  try {
    body = text
      ? JSON.parse(text)
      : {};
  } catch {
    body = {
      status: "NON_JSON_RESPONSE",
    };
  }

  console.log(
    "ClubKonnect response",
    {
      endpoint,
      http_status: response.status,
      ok: response.ok,
      status: first(
        pick(body, "status"),
        pick(body, "orderstatus"),
        pick(body, "Status"),
        pick(body, "OrderStatus"),
      ) ?? null,
      statuscode: statusCode(body),
      orderid: orderId(body),
      requestid: requestId(body),
    },
  );

  return {
    ok: response.ok,
    status: response.status,
    body,
  };
}

// ============================================================
// NETWORK CATALOGUE
// ============================================================

function normalizeNetwork(raw: any) {
  const code = extractNetworkFromObject(raw);

  if (!code) {
    return null;
  }

  const name = s(
    first(
      pick(raw, "network"),
      pick(raw, "Network"),
      pick(raw, "name"),
      pick(raw, "NetworkName"),
      pick(raw, "network_name"),
      NETWORK_NAMES[code],
      code,
    ),
  );

  return {
    code,
    name,
  };
}

function recursivelyFindNetworks(
  value: unknown,
  result: { code: string; name: string }[],
  depth = 0,
) {
  if (
    depth > 12 ||
    value === null ||
    value === undefined
  ) {
    return;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      recursivelyFindNetworks(
        entry,
        result,
        depth + 1,
      );
    }

    return;
  }

  if (
    typeof value !== "object"
  ) {
    return;
  }

  const raw = obj(value);

  const possible = normalizeNetwork(raw);

  if (possible) {
    result.push(possible);
  }

  for (const [
    key,
    child,
  ] of Object.entries(raw)) {
    if (
      child &&
      typeof child === "object"
    ) {
      recursivelyFindNetworks(
        child,
        result,
        depth + 1,
      );

      const keyNetwork =
        networkCode(key);

      if (keyNetwork) {
        result.push({
          code: keyNetwork,
          name:
            NETWORK_NAMES[keyNetwork] ??
            key,
        });
      }
    }
  }
}

async function networks() {
  const response = await ck(
    "APIDatabundleNetworkV2.asp",
  );

  if (!response.ok) {
    throw new Error(
      "Network catalogue unavailable.",
    );
  }

  const found: {
    code: string;
    name: string;
  }[] = [];

  recursivelyFindNetworks(
    response.body,
    found,
  );

  const fallback = Object.entries(
    NETWORK_NAMES,
  ).map(
    ([code, name]) => ({
      code,
      name,
    }),
  );

  const merged =
    new Map<
      string,
      {
        code: string;
        name: string;
      }
    >();

  for (
    const item of [
      ...found,
      ...fallback,
    ]
  ) {
    if (
      ["01", "02", "03", "04"]
        .includes(item.code)
    ) {
      merged.set(
        item.code,
        item,
      );
    }
  }

  const result =
    [...merged.values()];

  console.log(
    "ClubKonnect networks parsed",
    {
      count: result.length,
      networks: result.map(
        (x) => ({
          code: x.code,
          name: x.name,
        }),
      ),
    },
  );

  return result;
}

// ============================================================
// DATA PLAN PARSER
// ============================================================

function validity(
  text: string,
): number | null {
  const day =
    text.match(
      /\b(\d+)\s*days?\b/i,
    );

  if (day) {
    return Number(day[1]);
  }

  const month =
    text.match(
      /\b(\d+)\s*months?\b/i,
    );

  if (month) {
    return Number(month[1]) * 30;
  }

  const year =
    text.match(
      /\b(\d+)\s*years?\b/i,
    );

  if (year) {
    return Number(year[1]) * 365;
  }

  return null;
}

function period(
  text: string,
  days: number | null,
): string {
  const x =
    text.toLowerCase();

  if (
    x.includes("daily") ||
    days === 1
  ) {
    return "daily";
  }

  if (
    x.includes("weekly") ||
    days === 7
  ) {
    return "weekly";
  }

  if (
    x.includes("monthly") ||
    days === 30
  ) {
    return "monthly";
  }

  return "other";
}

function planFromRaw(
  raw: any,
  fallbackNetwork = "",
): CatalogItem | null {
  const o = obj(raw);

  if (!Object.keys(o).length) {
    return null;
  }

  /*
   * ClubKonnect catalogue responses may use:
   *
   * PRODUCT_ID
   * PRODUCT_NAME
   * PRODUCT_AMOUNT
   *
   * or alternative casing/naming.
   */

  const id = s(
    first(
      pick(
        o,
        "PRODUCT_ID",
        "PRODUCT_IDNO",
        "product_id",
        "productId",
        "productid",
      ),
      pick(
        o,
        "dataplan",
        "data_plan",
        "dataPlan",
      ),
      pick(
        o,
        "planid",
        "plan_id",
        "planId",
      ),
      pick(
        o,
        "id",
        "code",
        "DataPlan",
        "DataPlanID",
      ),
    ),
  );

  if (!id) {
    return null;
  }

  const name = s(
    first(
      pick(
        o,
        "PRODUCT_NAME",
        "product_name",
        "productName",
        "productname",
      ),
      pick(
        o,
        "name",
        "plan",
        "plan_name",
        "planName",
      ),
      pick(
        o,
        "description",
        "DataPlanName",
      ),
      id,
    ),
  );

  const price = n(
    first(
      pick(
        o,
        "PRODUCT_AMOUNT",
        "product_amount",
        "productAmount",
      ),
      pick(
        o,
        "selling_price",
        "sellingPrice",
      ),
      pick(
        o,
        "price",
        "amount",
        "cost",
        "Price",
        "Amount",
      ),
    ),
  );

  const directNetwork =
    extractNetworkFromObject(o);

  const net =
    directNetwork ||
    networkCode(
      fallbackNetwork,
    );

  if (!net) {
    return null;
  }

  if (price <= 0) {
    return null;
  }

  const description = s(
    first(
      pick(
        o,
        "description",
      ),
      name,
    ),
  );

  const validityRaw =
    first(
      pick(
        o,
        "validity_days",
        "validityDays",
        "validity",
        "duration",
      ),
      "",
    );

  const validityText =
    s(validityRaw);

  const daysFromField =
    Number(validityRaw);

  const days =
    Number.isFinite(
      daysFromField,
    ) &&
    daysFromField > 0
      ? daysFromField
      : validity(
          [
            name,
            description,
            s(
              pick(
                o,
                "plan_period",
                "period",
                "period_name",
                "duration",
              ),
            ),
            validityText,
          ]
            .filter(Boolean)
            .join(" "),
        );

  const type = s(
    first(
      pick(
        o,
        "plan_type",
        "planType",
        "plantype",
      ),
      pick(
        o,
        "type",
        "category",
        "category_name",
      ),
      "Data",
    ),
  );

  const combinedText =
    [
      name,
      description,
      type,
      s(
        pick(
          o,
          "plan_period",
          "period",
          "period_name",
          "duration",
        ),
      ),
    ]
      .filter(Boolean)
      .join(" ");

  const hot =
    /\bsme\b/i.test(
      combinedText,
    ) ||
    /hot\s*deal/i.test(
      combinedText,
    ) ||
    /hotdeal/i.test(
      combinedText,
    );

  return {
    id,
    code: id,
    name,
    price,
    networkCode: net,
    service: "data",
    period: period(
      combinedText,
      days,
    ),
    planType: type,
    validityDays: days,
    isHotDeal: hot,
    raw: o,
  };
}

// ============================================================
// RECURSIVE DATA PLAN CATALOGUE
// ============================================================

function recursivelyFindPlans(
  value: unknown,
  result: CatalogItem[],
  fallbackNetwork = "",
  depth = 0,
) {
  if (
    depth > 15 ||
    value === null ||
    value === undefined
  ) {
    return;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      recursivelyFindPlans(
        entry,
        result,
        fallbackNetwork,
        depth + 1,
      );
    }

    return;
  }

  if (
    typeof value !== "object"
  ) {
    return;
  }

  const raw = obj(value);

  /*
   * If this object itself contains a known
   * network, use it for this object and
   * everything nested beneath it.
   */
  const directNetwork =
    extractNetworkFromObject(
      raw,
    );

  const inheritedNetwork =
    directNetwork ||
    fallbackNetwork;

  /*
   * Try to parse this object as a plan.
   */
  const item =
    planFromRaw(
      raw,
      inheritedNetwork,
    );

  if (item) {
    result.push(item);
  }

  /*
   * Continue recursively through every
   * nested object/array.
   *
   * This is deliberately not limited to
   * data/plans/catalog keys.
   */
  for (
    const [
      key,
      child,
    ] of Object.entries(raw)
  ) {
    if (
      child === null ||
      child === undefined
    ) {
      continue;
    }

    if (
      typeof child !== "object"
    ) {
      continue;
    }

    const keyNetwork =
      networkCode(key);

    recursivelyFindPlans(
      child,
      result,
      keyNetwork ||
        inheritedNetwork,
      depth + 1,
    );
  }
}

async function dataPlans(): Promise<CatalogItem[]> {
  const response = await ck(
    "APIDatabundlePlansV2.asp",
  );

  if (!response.ok) {
    throw new Error(
      "Data catalogue unavailable.",
    );
  }

  const root =
    response.body;

  /*
   * Safe diagnostics only.
   *
   * Never log credentials or the
   * complete provider response.
   */
  console.log(
    "ClubKonnect data catalogue shape",
    {
      is_array:
        Array.isArray(root),

      top_level_keys:
        root &&
        typeof root === "object" &&
        !Array.isArray(root)
          ? Object.keys(root)
          : [],

      response_status:
        statusText(root),

      response_status_code:
        statusCode(root),
    },
  );

  const result: CatalogItem[] = [];

  recursivelyFindPlans(
    root,
    result,
  );

  const unique =
    new Map<
      string,
      CatalogItem
    >();

  for (
    const item of result
  ) {
    const key =
      `${item.networkCode}:${item.id}`;

    if (
      !unique.has(key)
    ) {
      unique.set(
        key,
        item,
      );
    }
  }

  const finalResult =
    [...unique.values()];

  console.log(
    "ClubKonnect data catalogue parsed",
    {
      plan_count:
        finalResult.length,

      networks:
        [
          ...new Set(
            finalResult.map(
              (x) =>
                x.networkCode,
            ),
          ),
        ],

      sample:
        finalResult
          .slice(0, 5)
          .map(
            (x) => ({
              id: x.id,
              name: x.name,
              price: x.price,
              network:
                x.networkCode,
              period:
                x.period,
              type:
                x.planType,
            }),
          ),
    },
  );

  return finalResult;
}

// ============================================================
// EDUCATION
// ============================================================

async function educationPackages(
  kind: "waec" | "jamb",
): Promise<CatalogItem[]> {
  const endpoint =
    kind === "jamb"
      ? "APIJAMBPackagesV2.asp"
      : "APIWAECPackagesV2.asp";

  const response =
    await ck(endpoint);

  if (!response.ok) {
    throw new Error(
      "Education catalogue unavailable.",
    );
  }

  const result: CatalogItem[] = [];

  const walk = (
    value: unknown,
    depth = 0,
  ) => {
    if (
      depth > 15 ||
      value === null ||
      value === undefined
    ) {
      return;
    }

    if (Array.isArray(value)) {
      for (
        const entry of value
      ) {
        walk(
          entry,
          depth + 1,
        );
      }

      return;
    }

    if (
      typeof value !== "object"
    ) {
      return;
    }

    const o = obj(value);

    const id = s(
      first(
        pick(
          o,
          "EXAMTYPE",
          "ExamType",
          "examtype",
          "exam_type",
        ),
        pick(
          o,
          "productid",
          "product_id",
          "PRODUCT_ID",
        ),
        pick(
          o,
          "code",
          "Code",
          "id",
          "package",
          "Package",
        ),
      ),
    );

    const name = s(
      first(
        pick(
          o,
          "PRODUCT_NAME",
          "product_name",
          "productName",
        ),
        pick(
          o,
          "name",
          "package_name",
          "packageName",
          "examname",
          "exam_name",
          "description",
          "ExamTypeName",
        ),
        id,
      ),
    );

    const price = n(
      first(
        pick(
          o,
          "PRODUCT_AMOUNT",
          "product_amount",
          "productAmount",
        ),
        pick(
          o,
          "price",
          "amount",
          "cost",
          "selling_price",
          "Price",
          "Amount",
        ),
      ),
    );

    if (
      id &&
      price > 0
    ) {
      result.push({
        id,
        code: id,
        name,
        price,
        service: "education",
        raw: o,
      });
    }

    for (
      const child of Object.values(o)
    ) {
      if (
        child &&
        typeof child === "object"
      ) {
        walk(
          child,
          depth + 1,
        );
      }
    }
  };

  walk(
    response.body,
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
      item,
    );
  }

  console.log(
    "ClubKonnect education catalogue parsed",
    {
      service: kind,
      package_count:
        unique.size,
    },
  );

  return [
    ...unique.values(),
  ];
}

// ============================================================
// AIRTIME PIN
// ============================================================

async function airtimePinCatalog(): Promise<CatalogItem[]> {
  const response =
    await ck(
      "APIEPINDiscountV2.asp",
    );

  if (!response.ok) {
    throw new Error(
      "Airtime PIN catalogue unavailable.",
    );
  }

  const result: CatalogItem[] = [];

  const walk = (
    value: unknown,
    depth = 0,
  ) => {
    if (
      depth > 15 ||
      value === null ||
      value === undefined
    ) {
      return;
    }

    if (Array.isArray(value)) {
      for (
        const entry of value
      ) {
        walk(
          entry,
          depth + 1,
        );
      }

      return;
    }

    if (
      typeof value !== "object"
    ) {
      return;
    }

    const o = obj(value);

    const net =
      extractNetworkFromObject(
        o,
      );

    const valueAmount =
      n(
        first(
          pick(
            o,
            "value",
            "Value",
            "denomination",
            "Denomination",
          ),
          pick(
            o,
            "amount",
            "Amount",
          ),
        ),
      );

    if (
      net &&
      valueAmount > 0
    ) {
      const discount =
        n(
          first(
            pick(
              o,
              "discount",
              "Discount",
              "discount_percent",
              "discountPercentage",
            ),
          ),
        );

      const price =
        n(
          first(
            pick(
              o,
              "price",
              "Price",
              "amount_payable",
              "AmountPayable",
            ),
          ),
        ) ||
        Math.max(
          0,
          valueAmount -
            (
              valueAmount *
              discount /
              100
            ),
        );

      result.push({
        id:
          `${net}-${valueAmount}`,
        code:
          `${net}-${valueAmount}`,
        name:
          `${NETWORK_NAMES[net] ?? net} ₦${valueAmount.toLocaleString()} Airtime PIN`,
        price:
          price || valueAmount,
        networkCode:
          net,
        service:
          "airtime-card",
        raw: o,
      });
    }

    for (
      const child of Object.values(o)
    ) {
      if (
        child &&
        typeof child === "object"
      ) {
        walk(
          child,
          depth + 1,
        );
      }
    }
  };

  walk(
    response.body,
  );

  if (!result.length) {
    /*
     * Do not fail the entire service if
     * ClubKonnect does not return a
     * denomination catalogue.
     */
    for (
      const [
        code,
        name,
      ] of Object.entries(
        NETWORK_NAMES,
      )
    ) {
      for (
        const value of [
          100,
          200,
          500,
        ]
      ) {
        result.push({
          id:
            `${code}-${value}`,
          code:
            `${code}-${value}`,
          name:
            `${name} ₦${value.toLocaleString()} Airtime PIN`,
          price:
            value,
          networkCode:
            code,
          service:
            "airtime-card",
          raw: {},
        });
      }
    }
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
      item,
    );
  }

  return [
    ...unique.values(),
  ];
}

// ============================================================
// CARD PLANS
// ============================================================

async function cardPlans(
  kind:
    | "airtime-card"
    | "data-card",
  network?: string,
): Promise<CatalogItem[]> {
  if (
    kind === "airtime-card"
  ) {
    return (
      await airtimePinCatalog()
    ).filter(
      (x) =>
        !network ||
        x.networkCode === network,
    );
  }

  const plans =
    await dataPlans();

  return plans
    .filter(
      (x) =>
        !network ||
        x.networkCode === network,
    )
    .map(
      (x) => ({
        ...x,
        service:
          "data-card" as const,
      }),
    );
}

// ============================================================
// PUBLIC CATALOGUE
// ============================================================

function publicNetwork(
  x: {
    code: string;
    name: string;
  },
) {
  return {
    biller_code:
      x.code,
    code:
      x.code,
    name:
      x.name,
    short_name:
      x.name,
  };
}

function publicItem(
  x: CatalogItem,
) {
  return {
    item_code:
      x.id,

    biller_code:
      x.networkCode ??
      x.code ??
      "",

    name:
      x.name,

    description:
      x.name,

    amount:
      x.price,

    selling_price:
      x.price,

    provider_amount:
      x.price,

    service:
      x.service,

    network_code:
      x.networkCode ??
      "",

    plan_period:
      x.period,

    plan_type:
      x.planType,

    validity_days:
      x.validityDays,

    is_hot_deal:
      !!x.isHotDeal,
  };
}

// ============================================================
// PURCHASE HELPERS
// ============================================================

function phone(
  body: JsonObject,
  details: JsonObject,
): string {
  let value = s(
    first(
      body.customer,
      body.phone,
      body.phone_number,
      body.phoneNumber,
      details.customer,
      details.phone,
      details.phone_number,
      details.phoneNumber,
    ),
  );

  value =
    value.replace(
      /[\s-]/g,
      "",
    );

  if (
    /^\+234\d{10}$/.test(
      value,
    )
  ) {
    return value.slice(1);
  }

  if (
    /^234\d{10}$/.test(
      value,
    )
  ) {
    return value;
  }

  if (
    /^0\d{10}$/.test(
      value,
    )
  ) {
    return `234${value.slice(1)}`;
  }

  return value;
}

function validPhone(
  value: string,
) {
  return /^234\d{10}$/.test(
    value,
  );
}

function quantity(
  body: JsonObject,
  details: JsonObject,
): number {
  const q =
    Number(
      first(
        body.quantity,
        details.quantity,
        1,
      ),
    );

  return Number.isInteger(q) &&
    q >= 1 &&
    q <= 100
    ? q
    : 0;
}

function airtimePinValue(item: CatalogItem): number {
  const raw = obj(item.raw);
  return n(
    first(
      pick(raw, "value", "Value", "denomination", "Denomination"),
      pick(raw, "amount", "Amount"),
      item.id.split("-").pop(),
    ),
  );
}

function publicReference(
  body: JsonObject,
  details: JsonObject,
): string {
  return s(
    first(
      body.reference,
      body.transaction_reference,
      details.reference,
    ),
  );
}

// ============================================================
// TRANSACTION HELPERS
// ============================================================

async function updateTxn(
  admin: any,
  userId: string,
  reference: string,
  updates: Record<string, unknown>,
) {
  const {
    error,
  } = await admin
    .from("transactions")
    .update(updates)
    .eq(
      "user_id",
      userId,
    )
    .eq(
      "reference_number",
      reference,
    );

  if (error) {
    console.error(
      "ClubKonnect transaction update failed",
      error,
    );
  }
}

async function refund(
  admin: any,
  userId: string,
  reference: string,
  amount: number,
  reason: string,
  metadata: JsonObject,
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
    },
  );

  if (error) {
    return {
      success:
        false,
      data:
        null,
      error,
    };
  }

  return {
    success:
      true,
    data,
    error:
      null,
  };
}

function safeProviderResponse(
  body: any,
) {
  return {
    status:
      first(
        pick(body, "status"),
        pick(body, "orderstatus"),
        pick(body, "Status"),
        pick(body, "OrderStatus"),
      ) ?? null,

    statuscode:
      statusCode(body),

    orderid:
      orderId(body),

    requestid:
      requestId(body),

    remark:
      first(
        pick(body, "remark"),
        pick(body, "orderremark"),
        pick(body, "OrderRemark"),
      ) ?? null,
  };
}

function fulfillment(
  body: any,
) {
  /*
   * Deliberately return PIN/card
   * information only to the authenticated
   * purchaser.
   *
   * Never log this data.
   */
  const result:
    JsonObject = {};

  for (
    const key of [
      "carddetails",
      "cardDetails",
      "TXN_EPIN",
      "TXN_EPIN_DATABUNDLE",
      "pin",
      "serial",
      "sno",
      "batchno",
      "transactionid",
      "transactiondate",
      "productname",
      "mobilenetwork",
      "amount",
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

function errorResponse(
  message: string,
  status = 400,
) {
  return json(
    {
      success:
        false,
      error:
        message,
    },
    status,
  );
}

// ============================================================
// CATALOGUE DISPATCH
// ============================================================

async function getCatalog(
  service: ClubService,
  billerCode = "",
) {
  if (
    service === "data"
  ) {
    const code =
      networkCode(
        billerCode,
      );

    const plans =
      await dataPlans();

    return plans.filter(
      (x) =>
        x.networkCode ===
        code,
    );
  }

  if (
    service === "education"
  ) {
    return [];
  }

  return cardPlans(
    service,
    billerCode
      ? networkCode(
          billerCode,
        )
      : undefined,
  );
}

// ============================================================
// EDGE FUNCTION
// ============================================================

Deno.serve(
  async (
    req: Request,
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
        },
      );
    }

    if (
      req.method !==
      "POST"
    ) {
      return errorResponse(
        "Method not allowed.",
        405,
      );
    }

    const user =
      await getUser(req);

    if (!user) {
      return errorResponse(
        "Authentication required.",
        401,
      );
    }

    const admin =
      adminClient();

    let body:
      JsonObject;

    try {
      body =
        obj(
          await req.json(),
        );
    } catch {
      return errorResponse(
        "Invalid request body.",
      );
    }

    const action =
      s(body.action)
        .toLowerCase();

    const details =
      obj(
        body.details,
      );

    const service =
      s(
        first(
          body.service,
          details.service,
          "data",
        ),
      )
        .toLowerCase() as ClubService;

    if (
      ![
        "data",
        "education",
        "airtime-card",
        "data-card",
      ].includes(
        service,
      )
    ) {
      return errorResponse(
        "This service is not available through this provider.",
      );
    }

    console.log(
      "clubkonnect-services",
      {
        action,
        service,
        user_id:
          user.id,
      },
    );

    // ========================================================
    // BILLERS / NETWORKS
    // ========================================================

    if (
      action ===
        "billers" ||
      action ===
        "networks"
    ) {
      try {
        if (
          service ===
          "education"
        ) {
          return json({
            success:
              true,

            service,

            billers: [
              {
                biller_code:
                  "waec",
                code:
                  "waec",
                name:
                  "WAEC",
                short_name:
                  "WAEC",
              },

              {
                biller_code:
                  "jamb",
                code:
                  "jamb",
                name:
                  "JAMB",
                short_name:
                  "JAMB",
              },
            ],
          });
        }

        const list =
          await networks();

        return json({
          success:
            true,

          service,

          billers:
            list.map(
              publicNetwork,
            ),
        });
      } catch (
        error
      ) {
        console.error(
          "ClubKonnect billers error",
          error,
        );

        return errorResponse(
          "Unable to load available options right now.",
          502,
        );
      }
    }

    // ========================================================
    // ITEMS / PLANS
    // ========================================================

    if (
      action ===
        "items" ||
      action ===
        "plans"
    ) {
      const biller =
        s(
          first(
            body.biller_code,
            body.billerCode,
            body.network_code,
            body.networkCode,
            details.biller_code,
            details.billerCode,
            details.network_code,
            details.networkCode,
          ),
        );

      if (!biller) {
        return errorResponse(
          "Please select an option.",
        );
      }

      try {
        let items:
          CatalogItem[] =
          [];

        if (
          service ===
          "data"
        ) {
          items =
            await getCatalog(
              "data",
              networkCode(
                biller,
              ),
            );
        } else if (
          service ===
          "education"
        ) {
          const education =
            biller.toLowerCase();

          if (
            education !==
              "waec" &&
            education !==
              "jamb"
          ) {
            return errorResponse(
              "Invalid education service.",
            );
          }

          items =
            await educationPackages(
              education as
                | "waec"
                | "jamb",
            );
        } else {
          items =
            await getCatalog(
              service,
              networkCode(
                biller,
              ),
            );
        }

        console.log(
          "ClubKonnect items response",
          {
            service,
            biller_code:
              biller,
            normalized_biller_code:
              networkCode(
                biller,
              ),
            item_count:
              items.length,
          },
        );

        return json({
          success:
            true,

          service,

          biller_code:
            biller,

          items:
            items.map(
              publicItem,
            ),
        });
      } catch (
        error
      ) {
        console.error(
          "ClubKonnect items error",
          error,
        );

        return errorResponse(
          "Unable to load available packages right now.",
          502,
        );
      }
    }

    // ========================================================
    // VALIDATE
    // ========================================================

    if (
      action ===
      "validate"
    ) {
      const biller =
        s(
          first(
            body.biller_code,
            body.billerCode,
            details.biller_code,
            details.billerCode,
          ),
        );

      const itemCode =
        s(
          first(
            body.item_code,
            body.itemCode,
            details.item_code,
            details.itemCode,
          ),
        );

      if (
        !biller ||
        !itemCode
      ) {
        return errorResponse(
          "A valid option and package are required.",
        );
      }

      try {
        let item:
          | CatalogItem
          | undefined;

        if (
          service ===
          "data"
        ) {
          item =
            (
              await dataPlans()
            ).find(
              (x) =>
                x.networkCode ===
                  networkCode(
                    biller,
                  ) &&
                x.id ===
                  itemCode,
            );
        } else if (
          service ===
          "education"
        ) {
          item =
            (
              await educationPackages(
                biller as
                  | "waec"
                  | "jamb",
              )
            ).find(
              (x) =>
                x.id ===
                itemCode,
            );
        } else {
          item =
            (
              await cardPlans(
                service,
                networkCode(
                  biller,
                ),
              )
            ).find(
              (x) =>
                x.id ===
                itemCode,
            );
        }

        if (!item) {
          return errorResponse(
            "The selected package is no longer available.",
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
              item,
            ),
        });
      } catch (
        error
      ) {
        console.error(
          "ClubKonnect validation error",
          error,
        );

        return errorResponse(
          "Unable to verify the selected package.",
          502,
        );
      }
    }

    // ========================================================
    // PAY
    // ========================================================

    if (
      action ===
        "pay" ||
      action ===
        "service"
    ) {
      const biller =
        s(
          first(
            body.biller_code,
            body.billerCode,
            details.biller_code,
            details.billerCode,
          ),
        );

      const itemCode =
        s(
          first(
            body.item_code,
            body.itemCode,
            details.item_code,
            details.itemCode,
          ),
        );

      const qty =
        quantity(
          body,
          details,
        );

      if (
        !biller ||
        !itemCode
      ) {
        return errorResponse(
          "Please select a valid service option and package.",
        );
      }

      if (
        (
          service ===
            "airtime-card" ||
          service ===
            "data-card"
        ) &&
        !qty
      ) {
        return errorResponse(
          "Quantity must be between 1 and 100.",
        );
      }

      let selected:
        | CatalogItem
        | undefined;

      try {
        if (
          service ===
          "data"
        ) {
          selected =
            (
              await dataPlans()
            ).find(
              (x) =>
                x.networkCode ===
                  networkCode(
                    biller,
                  ) &&
                x.id ===
                  itemCode,
            );
        } else if (
          service ===
          "education"
        ) {
          selected =
            (
              await educationPackages(
                biller as
                  | "waec"
                  | "jamb",
              )
            ).find(
              (x) =>
                x.id ===
                itemCode,
            );
        } else {
          selected =
            (
              await cardPlans(
                service,
                networkCode(
                  biller,
                ),
              )
            ).find(
              (x) =>
                x.id ===
                itemCode,
            );
        }
      } catch (
        error
      ) {
        console.error(
          "ClubKonnect catalog verification error",
          error,
        );

        return errorResponse(
          "Unable to verify the selected package. Please try again.",
          502,
        );
      }

      if (!selected) {
        return errorResponse(
          "The selected package is no longer available.",
        );
      }

      const customerPhone =
        phone(
          body,
          details,
        );

      if (
        (
          service ===
            "data" ||
          service ===
            "education"
        ) &&
        !validPhone(
          customerPhone,
        )
      ) {
        return errorResponse(
          "Enter a valid Nigerian mobile number.",
        );
      }

      const total =
        Math.round(
          selected.price *
            (
              service ===
                "airtime-card" ||
              service ===
                "data-card"
                ? qty
                : 1
            ) *
            100,
        ) / 100;

      if (
        total <= 0
      ) {
        return errorResponse(
          "The selected package has an invalid price.",
        );
      }

      const reference =
        `CK_${service
          .replace(
            /[^a-z0-9]/gi,
            "_",
          )
          .toUpperCase()}_${crypto.randomUUID()}`;

      const metadata = {
        service,
        category:
          "bill_payment",
        provider:
          "clubkonnect",
        provider_id:
          "clubkonnect",
        biller_code:
          biller,
        item_code:
          selected.id,
        network_code:
          selected.networkCode ??
          null,
        customer:
          customerPhone ||
          null,
        provider_amount:
          selected.price,
        selling_amount:
          total,
        quantity:
          service ===
              "airtime-card" ||
            service ===
              "data-card"
            ? qty
            : 1,
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

      const {
        data: debitResult,
        error: debitError,
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
        },
      );

      if (debitError) {
        console.error(
          "ClubKonnect wallet debit failed",
          debitError,
        );

        return errorResponse(
          "Unable to process the payment from your wallet.",
        );
      }

      const transactionId =
        debitResult?.id ??
        null;

      let providerResponse:
        any;

      try {
        if (
          service ===
          "data"
        ) {
          providerResponse =
            await ck(
              "APIDatabundleV1.asp",
              {
                MobileNetwork:
                  networkCode(
                    biller,
                  ),
                DataPlan:
                  selected.id,
                MobileNumber:
                  customerPhone,
                RequestID:
                  reference,
                CallBackURL:
                  callbackUrl(),
              },
            );
        } else if (
          service ===
          "airtime-card"
        ) {
          providerResponse =
            await ck(
              "APIEPINV1.asp",
              {
                MobileNetwork:
                  networkCode(
                    biller,
                  ),
                Value:
                  airtimePinValue(selected),
                Quantity:
                  qty,
                RequestID:
                  reference,
                CallBackURL:
                  callbackUrl(),
              },
            );
        } else if (
          service ===
          "data-card"
        ) {
          providerResponse =
            await ck(
              "APIDatabundleEPINV1.asp",
              {
                MobileNetwork:
                  networkCode(
                    biller,
                  ),
                DataPlan:
                  selected.id,
                Quantity:
                  qty,
                RequestID:
                  reference,
                CallBackURL:
                  callbackUrl(),
              },
            );
        } else {
          providerResponse =
            await ck(
              biller.toLowerCase() ===
                "jamb"
                ? "APIJAMBV1.asp"
                : "APIWAECV1.asp",
              {
                ExamType:
                  selected.id,
                PhoneNo:
                  customerPhone,
                RequestID:
                  reference,
                CallBackURL:
                  callbackUrl(),
              },
            );
        }
      } catch (
        error
      ) {
        console.error(
          "ClubKonnect provider request exception",
          error,
        );

        await updateTxn(
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
              reconciliation_required:
                true,
            },
          },
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
            "Your purchase is being verified.",
        });
      }

      const classified =
        classify(
          providerResponse.body,
          providerResponse.ok,
        );

      const providerOrderId =
        orderId(
          providerResponse.body,
        );

      const providerRequestId =
        requestId(
          providerResponse.body,
        ) ??
        reference;

      const safe =
        safeProviderResponse(
          providerResponse.body,
        );

      if (
        classified.state ===
        "successful"
      ) {
        await updateTxn(
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
                fulfillment(
                  providerResponse.body,
                ),
              reconciliation_required:
                false,
              reconciled_at:
                new Date().toISOString(),
            },
          },
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
              : "Purchase completed successfully.",
          fulfillment:
            fulfillment(
              providerResponse.body,
            ),
        });
      }

      if (
        classified.state ===
        "failed"
      ) {
        const refundResult =
          await refund(
            admin,
            user.id,
            reference,
            total,
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
            },
          );

        await updateTxn(
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
          },
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
            503,
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

      await updateTxn(
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
          },
        },
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
          "Your purchase is being processed.",
      });
    }

    // ========================================================
    // STATUS
    // ========================================================

    if (
      action ===
      "status"
    ) {
      const reference =
        publicReference(
          body,
          details,
        );

      if (!reference) {
        return errorResponse(
          "Transaction reference is required.",
        );
      }

      const {
        data: txn,
        error: txnError,
      } = await admin
        .from("transactions")
        .select(
          "id, amount, status, provider, provider_reference, metadata",
        )
        .eq(
          "user_id",
          user.id,
        )
        .eq(
          "reference_number",
          reference,
        )
        .maybeSingle();

      if (
        txnError ||
        !txn
      ) {
        return errorResponse(
          "Transaction not found.",
          404,
        );
      }

      if (
        txn.status ===
        "successful"
      ) {
        return json({
          success:
            true,
          status:
            "successful",
          reference,
          transaction_id:
            txn.id,
          data:
            txn.metadata
              ?.fulfillment ??
            {},
        });
      }

      if (
        txn.status ===
        "failed"
      ) {
        return json({
          success:
            false,
          status:
            "failed",
          reference,
          transaction_id:
            txn.id,
        });
      }

      const metadata =
        obj(
          txn.metadata,
        );

      const order =
        s(
          first(
            metadata.clubkonnect_order_id,
            txn.provider_reference,
          ),
        );

      const request =
        s(
          first(
            metadata.clubkonnect_request_id,
            metadata.request_id,
            reference,
          ),
        );

      let providerResponse:
        any;

      try {
        providerResponse =
          await ck(
            "APIQueryV1.asp",
            order
              ? {
                  OrderID:
                    order,
                }
              : {
                  RequestID:
                    request,
                },
          );
      } catch (
        error
      ) {
        console.error(
          "ClubKonnect status request failed",
          error,
        );

        return json({
          success:
            true,
          status:
            "pending",
          reference,
          message:
            "Your purchase is still being verified.",
        });
      }

      const classified =
        classify(
          providerResponse.body,
          providerResponse.ok,
        );

      const providerOrderId =
        (
          orderId(
            providerResponse.body,
          ) ??
          order
        ) ||
        null;

      const providerRequestId =
        (
          requestId(
            providerResponse.body,
          ) ??
          request
        ) ||
        reference;

      const safe =
        safeProviderResponse(
          providerResponse.body,
        );

      if (
        classified.state ===
        "successful"
      ) {
        const result =
          fulfillment(
            providerResponse.body,
          );

        await updateTxn(
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
                result,
              reconciliation_required:
                false,
            },
          },
        );

        return json({
          success:
            true,
          status:
            "successful",
          reference,
          transaction_id:
            txn.id,
          message:
            "Purchase completed successfully.",
          fulfillment:
            result,
        });
      }

      if (
        classified.state ===
        "failed"
      ) {
        const amount =
          n(txn.amount);

        const refundResult =
          await refund(
            admin,
            user.id,
            reference,
            amount,
            "ClubKonnect transaction failed during reconciliation.",
            {
              ...metadata,
              clubkonnect_status:
                classified.text,
              clubkonnect_statuscode:
                classified.code,
              clubkonnect_response:
                safe,
            },
          );

        await updateTxn(
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
          },
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
            503,
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

      await updateTxn(
        admin,
        user.id,
        reference,
        {
          status:
            "pending",
          provider_reference:
            providerOrderId ??
            providerRequestId,
          metadata: {
            ...metadata,
            clubkonnect_status:
              classified.text,
            clubkonnect_statuscode:
              classified.code,
            clubkonnect_response:
              safe,
            reconciliation_required:
              true,
          },
        },
      );

      return json({
        success:
          true,
        status:
          "pending",
        reference,
        message:
          "Your purchase is still being verified.",
      });
    }

    return errorResponse(
      "Unsupported action.",
    );
  },
);
