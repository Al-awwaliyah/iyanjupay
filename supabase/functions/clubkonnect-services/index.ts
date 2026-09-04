import {
  corsHeaders,
  json,
  adminClient,
  getUser,
} from "../_shared/auth.ts";

/**
 * ============================================================
 * IYANJUPAY — CLUBKONNECT SERVICES
 * ============================================================
 *
 * Customer-facing services:
 *
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
 * Provider:
 *
 *   ClubKonnect / Nellobyte Systems
 *
 * IMPORTANT
 * ------------------------------------------------------------
 * Provider credentials are server-side only.
 *
 * Pricing:
 *   airtime       = 0%
 *   data         = 15%
 *   electricity  = 15%
 *   cable        = 15%
 *   airtime-card = 20%
 *   data-card    = 20%
 *   smile        = 20%
 *   waec         = 20%
 *   jamb         = 20%
 *
 * The frontend receives:
 *
 *   providerPrice = provider cost
 *   price         = IyanjuPay customer selling price
 *
 * The frontend MUST NOT apply markup again.
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
  service: ServiceType;
  period?: string;
  planType?: string;
  validityDays?: number | null;
  isHotDeal?: boolean;
  raw: JsonObject;
};

const BASE_URL =
  "https://www.nellobytesystems.com";

const NETWORKS: Record<string, string> = {
  "01": "MTN",
  "02": "Glo",
  "03": "9mobile",
  "04": "Airtel",
};

const STANDARD_MARKUP = 0.15;
const PREMIUM_MARKUP = 0.20;

const PREMIUM_SERVICES =
  new Set<ServiceType>([
    "airtime-card",
    "data-card",
    "smile",
    "waec",
    "jamb",
  ]);

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
  "INSUFFICIENT_BALANCE",
  "INSUFFICIENT_FUNDS",
  "QUANTITY_NOT_AVAILABLE",
  "PIN_NOT_AVAILABLE",
  "INVALID_PACKAGE",
  "INVALID_CABLETV",
  "INVALID_ELECTRICCOMPANY",
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

  const result = Number(text);

  return Number.isFinite(result) && result >= 0
    ? Math.round(result * 100) / 100
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
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    return value as JsonObject;
  }

  return {};
}

function normalizedKey(value: unknown): string {
  return s(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function pick(
  value: unknown,
  ...aliases: string[]
): unknown {
  const source = obj(value);

  const map = new Map<string, unknown>();

  for (const [key, val] of Object.entries(source)) {
    map.set(normalizedKey(key), val);
  }

  for (const alias of aliases) {
    const value = map.get(
      normalizedKey(alias)
    );

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

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function markupRate(
  service: ServiceType
): number {
  if (service === "airtime") {
    return 0;
  }

  if (PREMIUM_SERVICES.has(service)) {
    return PREMIUM_MARKUP;
  }

  return STANDARD_MARKUP;
}

function sellingPrice(
  service: ServiceType,
  providerPrice: number
): number {
  return roundMoney(
    providerPrice *
      (1 + markupRate(service))
  );
}

/* ============================================================
 * STATUS HELPERS
 * ========================================================== */

function normalizeStatus(
  value: unknown
): string {
  return s(value)
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

function statusText(body: any): string {
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
  const value = Number(
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
  const value = first(
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
  const value = first(
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
  const code = statusCode(body);
  const text = statusText(body);

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
      state: "successful" as const,
      code,
      text,
    };
  }

  if (
    FAILURE_STATUSES.has(text)
  ) {
    return {
      state: "failed" as const,
      code,
      text,
    };
  }

  if (
    PENDING_STATUSES.has(text)
  ) {
    return {
      state: "pending" as const,
      code,
      text,
    };
  }

  /*
   * Unknown provider responses are deliberately
   * treated as pending.
   *
   * We must never refund simply because the
   * provider returned an unfamiliar response.
   */
  return {
    state: "pending" as const,
    code,
    text,
  };
}

/* ============================================================
 * NETWORK / PHONE
 * ========================================================== */

function networkCode(
  value: unknown
): string {
  const raw = s(value);

  if (!raw) return "";

  const key = normalizedKey(raw);

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
    NETWORKS[networkCode(code)] ??
    s(code)
  );
}

function normalizePhone(
  value: unknown
): string {
  const raw = s(value)
    .replace(/[\s()-]/g, "");

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
  return /^234\d{10}$/.test(value);
}

/* ============================================================
 * CREDENTIALS / CLUBKONNECT REQUEST
 * ========================================================== */

function credentials() {
  const userId = s(
    Deno.env.get(
      "CLUBKONNECT_USER_ID"
    ) ??
      Deno.env.get(
        "CLUBKONNECT_USERID"
      )
  );

  const apiKey = s(
    Deno.env.get(
      "CLUBKONNECT_API_KEY"
    ) ??
      Deno.env.get(
        "CLUBKONNECT_APIKEY"
      )
  );

  if (!userId || !apiKey) {
    throw new Error(
      "ClubKonnect credentials are not configured."
    );
  }

  return {
    userId,
    apiKey,
  };
}

function callbackUrl():
  | string
  | undefined {
  const configured = s(
    Deno.env.get(
      "CLUBKONNECT_CALLBACK_URL"
    )
  );

  if (configured) {
    return configured;
  }

  const supabaseUrl = s(
    Deno.env.get(
      "SUPABASE_URL"
    )
  );

  if (!supabaseUrl) {
    return undefined;
  }

  return `${supabaseUrl.replace(
    /\/$/,
    ""
  )}/functions/v1/clubkonnect-webhook`;
}

async function clubKonnectRequest(
  endpoint: string,
  params: Record<
    string,
    unknown
  > = {}
) {
  const {
    userId,
    apiKey,
  } = credentials();

  const url = new URL(
    `${BASE_URL}/${endpoint}`
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
    const [key, value] of Object.entries(
      params
    )
  ) {
    if (
      value !== undefined &&
      value !== null &&
      s(value) !== ""
    ) {
      url.searchParams.set(
        key,
        s(value)
      );
    }
  }

  console.log(
    "ClubKonnect request",
    {
      endpoint,
      parameter_names:
        Object.keys(params),
    }
  );

  const response = await fetch(
    url.toString(),
    {
      method: "GET",
      headers: {
        Accept:
          "application/json",
      },
    }
  );

  const text =
    await response.text();

  let body: any = {};

  try {
    body = text
      ? JSON.parse(text)
      : {};
  } catch {
    body = {
      status:
        "NON_JSON_RESPONSE",
      raw: text.slice(0, 500),
    };
  }

  console.log(
    "ClubKonnect response",
    {
      endpoint,
      http_status:
        response.status,
      ok:
        response.ok,
      status:
        statusText(body),
      statuscode:
        statusCode(body),
      orderid:
        orderId(body),
      requestid:
        requestId(body),
    }
  );

  return {
    ok: response.ok,
    status: response.status,
    body,
  };
}

/* ============================================================
 * ARRAY / CATALOGUE HELPERS
 * ========================================================== */

function arraysAt(
  value: unknown,
  keys: string[]
): any[] {
  const source = obj(value);

  for (const key of keys) {
    const value = pick(
      source,
      key
    );

    if (
      Array.isArray(value)
    ) {
      return value;
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
    depth > 15 ||
    value === null ||
    value === undefined
  ) {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      walkObjects(
        item,
        callback,
        depth + 1
      );
    }

    return;
  }

  if (
    typeof value !== "object"
  ) {
    return;
  }

  const item = obj(value);

  callback(item);

  for (
    const child of Object.values(
      item
    )
  ) {
    if (
      child &&
      typeof child === "object"
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
 * DATA CATALOGUE
 * ========================================================== */

function normalizeDataPlan(
  raw: any,
  fallbackNetwork: string
): CatalogItem | null {
  const product =
    obj(raw);

  const id = s(
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

  const code = s(
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

  const name = s(
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
          "networkCode"
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

  const hot =
    /\bsme\b/i.test(name) ||
    /hot\s*deal/i.test(name) ||
    /hotdeal/i.test(name);

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
      hot,
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

  const root =
    response.body;

  const result:
    CatalogItem[] = [];

  /*
   * Official ClubKonnect structure:
   *
   * MOBILE_NETWORK:
   *   MTN:
   *     [
   *       {
   *         ID: "01",
   *         PRODUCT: [...]
   *       }
   *     ]
   *
   *   Glo:
   *   m_9mobile:
   *   Airtel:
   */

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
        const product of products
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

  /*
   * Defensive fallback for alternate
   * account response shapes.
   */
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
          const product of nestedProducts
        ) {
          const normalized =
            normalizeDataPlan(
              product,
              possibleNetwork
            );

          if (
            normalized
          ) {
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
 * NETWORK CATALOGUES
 * ========================================================== */

async function airtimeNetworks() {
  /*
   * ClubKonnect network catalogue.
   *
   * If the account response is unusual, we still
   * expose the canonical Nigerian network codes.
   */
  try {
    const response =
      await clubKonnectRequest(
        "APIAirtimeNetworkV2.asp"
      );

    const found =
      new Map<
        string,
        JsonObject
      >();

    if (response.ok) {
      walkObjects(
        response.body,
        (item) => {
          const code =
            networkCode(
              first(
                pick(
                  item,
                  "ID",
                  "id",
                  "MOBILENETWORK",
                  "MobileNetwork",
                  "network_code",
                  "networkCode",
                  "code",
                  "Code"
                ),
                pick(
                  item,
                  "name",
                  "Name",
                  "NetworkName",
                  "network_name"
                )
              )
            );

          if (
            NETWORKS[code]
          ) {
            found.set(
              code,
              item
            );
          }
        }
      );
    }

    return Object.entries(
      NETWORKS
    ).map(
      ([code, name]) => ({
        code,
        id: code,
        value: code,
        name,
        label: name,
        title: name,
        network: name,
        biller_code: code,
        billerCode: code,
        network_code: code,
        networkCode: code,
      })
    );
  } catch (error) {
    console.error(
      "Airtime network catalogue error:",
      error
    );

    return Object.entries(
      NETWORKS
    ).map(
      ([code, name]) => ({
        code,
        id: code,
        value: code,
        name,
        label: name,
        title: name,
        network: name,
        biller_code: code,
        billerCode: code,
        network_code: code,
        networkCode: code,
      })
    );
  }
}

/* ============================================================
 * ELECTRICITY
 * ========================================================== */

function electricityBillers(): Array<{
  code: string;
  name: string;
}> {
  const configured =
    s(
      Deno.env.get(
        "CLUBKONNECT_ELECTRICITY_BILLERS_JSON"
      )
    );

  if (configured) {
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
            : [];

      const result =
        list
          .map(
            (item: any) => {
              const code =
                s(
                  first(
                    pick(
                      item,
                      "biller_code",
                      "billerCode",
                      "code",
                      "id"
                    )
                  )
                );

              const name =
                s(
                  first(
                    pick(
                      item,
                      "name",
                      "biller_name",
                      "billerName",
                      "company",
                      "label"
                    ),
                    code
                  )
                );

              return code &&
                name
                ? {
                    code,
                    name,
                  }
                : null;
            }
          )
          .filter(
            Boolean
          ) as Array<{
            code: string;
            name: string;
          }>;

      if (
        result.length
      ) {
        return result;
      }
    } catch (error) {
      console.error(
        "Invalid CLUBKONNECT_ELECTRICITY_BILLERS_JSON:",
        error
      );
    }
  }

  /*
   * Do NOT invent undocumented electricity
   * provider codes.
   *
   * Configure this environment variable with
   * the electricity company codes supplied by
   * your ClubKonnect account:
   *
   * CLUBKONNECT_ELECTRICITY_BILLERS_JSON
   *
   * Example:
   *
   * [
   *   {"code":"01","name":"Ikeja Electric"}
   * ]
   *
   * Empty by default is safer than exposing
   * fabricated disco codes.
   */
  return [];
}

/* ============================================================
 * CABLE
 * ========================================================== */

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
    }> = [];

  walkObjects(
    response.body,
    (item) => {
      const code =
        s(
          first(
            pick(
              item,
              "CableTV",
              "cableTv",
              "cable_tv"
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

      const name =
        s(
          first(
            pick(
              item,
              "CableTVName",
              "cableTvName",
              "name",
              "Name",
              "label"
            ),
            code
          )
        );

      if (
        code &&
        name
      ) {
        result.push({
          code,
          name,
        });
      }
    }
  );

  const unique =
    new Map<
      string,
      {
        code: string;
        name: string;
      }
    >();

  for (
    const item of result
  ) {
    unique.set(
      item.code,
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
        s(
          first(
            pick(
              item,
              "CableTV",
              "cableTv",
              "cable_tv"
            ),
            pick(
              item,
              "biller_code",
              "billerCode"
            )
          )
        );

      /*
       * If the response identifies a different
       * cable service, ignore that package.
       */
      if (
        itemCable &&
        itemCable.toLowerCase() !==
          cableTv.toLowerCase()
      ) {
        return;
      }

      const id =
        s(
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
              "code",
              "Code",
              "id",
              "ID"
            ),
            pick(
              item,
              "Package",
              "package"
            )
          )
        );

      const name =
        s(
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
              "name",
              "Name",
              "description"
            ),
            id
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
        id &&
        providerPrice > 0
      ) {
        result.push({
          id,
          code: id,
          name,
          price:
            sellingPrice(
              "cable",
              providerPrice
            ),
          providerPrice,
          billerCode:
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
      item.id,
      item
    );
  }

  return [
    ...unique.values(),
  ];
}

/* ============================================================
 * AIRTIME E-PIN
 * ========================================================== */

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
              "networkCode"
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
        result.push({
          id: `${currentNetwork}-${denomination}`,
          code: `${currentNetwork}-${denomination}`,
          name: `${NETWORKS[currentNetwork]} ₦${denomination.toLocaleString()} Airtime E-PIN`,
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
      `${item.networkCode}:${item.id}`,
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
 * GENERIC PACKAGE CATALOGUES
 * ========================================================== */

async function genericPackages(
  endpoint: string,
  service:
    | "smile"
    | "waec"
    | "jamb"
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
        s(
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
        s(
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
              "Description",
              "ExamTypeName"
            ),
            id
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
        id &&
        providerPrice > 0
      ) {
        result.push({
          id,
          code: id,
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
 * CATALOGUE DISPATCH
 * ========================================================== */

async function getCatalog(
  service: ServiceType,
  code = ""
): Promise<CatalogItem[]> {
  switch (service) {
    case "airtime": {
      const networks =
        await airtimeNetworks();

      return networks.map(
        (item) => ({
          id:
            item.code,
          code:
            item.code,
          name:
            item.name,
          price:
            0,
          providerPrice:
            0,
          networkCode:
            item.code,
          service:
            "airtime",
          raw:
            item,
        })
      );
    }

    case "data": {
      const items =
        await dataPlans();

      const wanted =
        code
          ? networkCode(
              code
            )
          : "";

      return wanted
        ? items.filter(
            (item) =>
              item.networkCode ===
              wanted
          )
        : items;
    }

    case "electricity": {
      return electricityBillers()
        .map(
          (item) => ({
            id:
              item.code,
            code:
              item.code,
            name:
              item.name,
            price:
              0,
            providerPrice:
              0,
            billerCode:
              item.code,
            service:
              "electricity",
            raw:
              {},
          })
        );
    }

    case "cable": {
      if (!code) {
        return (
          await cableTypes()
        ).map(
          (item) => ({
            id:
              item.code,
            code:
              item.code,
            name:
              item.name,
            price:
              0,
            providerPrice:
              0,
            billerCode:
              item.code,
            service:
              "cable",
            raw:
              item,
          })
        );
      }

      return cablePackages(
        code
      );
    }

    case "airtime-card": {
      return airtimePinCatalog(
        code || undefined
      );
    }

    case "data-card": {
      const items =
        await dataPlans();

      const wanted =
        code
          ? networkCode(
              code
            )
          : "";

      return items
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

    case "smile":
      return genericPackages(
        "APISmilePackagesV2.asp",
        "smile"
      );

    case "waec":
      return genericPackages(
        "APIWAECPackagesV2.asp",
        "waec"
      );

    case "jamb":
      return genericPackages(
        "APIJAMBPackagesV2.asp",
        "jamb"
      );
  }
}

/* ============================================================
 * PUBLIC RESPONSE
 * ========================================================== */

function publicNetwork(
  code: string,
  name: string
) {
  return {
    code,
    id: code,
    value: code,
    name,
    label: name,
    title: name,
    network: name,
    short_name: name,

    /*
     * Kept because the supplied ServicePayment
     * understands these aliases.
     */
    biller_code: code,
    billerCode: code,
    network_code: code,
    networkCode: code,
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

    plan_code:
      item.code,

    planCode:
      item.code,

    data_plan:
      item.code,

    dataPlan:
      item.code,

    name:
      item.name,

    title:
      item.name,

    label:
      item.name,

    description:
      item.name,

    /*
     * IMPORTANT:
     *
     * price = customer selling price.
     * providerPrice = actual provider cost.
     */
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

/* ============================================================
 * PURCHASE INPUTS
 * ========================================================== */

function requestedBiller(
  body: JsonObject,
  details: JsonObject
): string {
  return s(
    first(
      body.biller_code,
      body.billerCode,
      details.biller_code,
      details.billerCode
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
      details.network_code,
      details.networkCode,
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
      body.variation_code,
      body.variationCode,
      body.data_plan,
      body.dataPlan,
      body.package,
      body.package_code,
      details.item_code,
      details.itemCode,
      details.product_code,
      details.productCode,
      details.plan_code,
      details.planCode,
      details.data_plan,
      details.dataPlan,
      details.package,
      details.package_code
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
      body.price,
      details.amount,
      details.value,
      details.selling_amount,
      details.sellingAmount,
      details.price
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
      details.smartcard_number,
      details.smartcardNumber,
      details.smartcard_no,
      details.smartcard,
      details.smartCardNumber
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
      details.meter_type,
      details.meterType,
      "prepaid"
    )
  );
}

/* ============================================================
 * SERVER-SIDE ITEM VALIDATION
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
        await dataPlans();

      return items
        .filter(
          (item) =>
            item.networkCode ===
            networkCode(
              biller
            )
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
        )
        .find(
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

    case "jamb":
      return (
        await genericPackages(
          "APIJAMBPackagesV2.asp",
          "jamb"
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

  /*
   * E-PIN information is only returned
   * after authenticated purchase.
   */
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

function airtimePinValue(
  item: CatalogItem
): number {
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

/* ============================================================
 * EDGE FUNCTION
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
          "This service is not available through this service.",
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
            body.network_code,
            body.networkCode,
            details.biller_code,
            details.billerCode,
            details.network_code,
            details.networkCode
          )
        );

      /*
       * NETWORK SERVICES
       */
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
        const networks =
          Object.entries(
            NETWORKS
          ).map(
            ([network, name]) =>
              publicNetwork(
                network,
                name
              )
          );

        const items =
          await getCatalog(
            service,
            networkCode(
              code
            )
          );

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
      }

      /*
       * ELECTRICITY
       */
      if (
        service ===
        "electricity"
      ) {
        const billers =
          electricityBillers()
            .map(
              (item) => ({
                code:
                  item.code,
                id:
                  item.code,
                name:
                  item.name,
                label:
                  item.name,
                title:
                  item.name,
                biller_code:
                  item.code,
                billerCode:
                  item.code,
              })
            );

        return json({
          success:
            true,
          service,
          billers,
          networks:
            billers,
          items: [],
          plans: [],
          packages: [],
          amount_based:
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
        if (!code) {
          const types =
            await cableTypes();

          const billers =
            types.map(
              (item) => ({
                code:
                  item.code,
                id:
                  item.code,
                name:
                  item.name,
                label:
                  item.name,
                title:
                  item.name,
                biller_code:
                  item.code,
                billerCode:
                  item.code,
              })
            );

          return json({
            success:
              true,
            service,
            billers,
            networks:
              billers,
            items: [],
            plans: [],
            packages: [],
          });
        }

        const items =
          await cablePackages(
            code
          );

        const typeName =
          (
            await cableTypes()
          ).find(
            (item) =>
              item.code ===
              code
          )?.name ??
          code;

        const billers =
          [
            {
              code,
              id:
                code,
              name:
                typeName,
              label:
                typeName,
              title:
                typeName,
              biller_code:
                code,
              billerCode:
                code,
            },
          ];

        return json({
          success:
            true,
          service,
          billers,
          networks:
            billers,

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
      }

      /*
       * SMILE / WAEC / JAMB
       *
       * ServicePayment first asks for a
       * provider/service option and then
       * requests packages.
       */
      const items =
        await getCatalog(
          service
        );

      const name =
        service ===
        "smile"
          ? "Smile"
          : service.toUpperCase();

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
   * LEGACY BILLERS / NETWORKS
   * ======================================================== */

  if (
    action ===
      "billers" ||
    action ===
      "networks"
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
          Object.entries(
            NETWORKS
          ).map(
            ([code, name]) =>
              publicNetwork(
                code,
                name
              )
          );

        return json({
          success:
            true,
          service,
          billers,
          networks:
            billers,
        });
      }

      if (
        service ===
        "electricity"
      ) {
        const billers =
          electricityBillers()
            .map(
              (item) => ({
                code:
                  item.code,
                id:
                  item.code,
                name:
                  item.name,
                label:
                  item.name,
                biller_code:
                  item.code,
                billerCode:
                  item.code,
              })
            );

        return json({
          success:
            true,
          service,
          billers,
          networks:
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
            (item) => ({
              code:
                item.code,
              id:
                item.code,
              name:
                item.name,
              label:
                item.name,
              biller_code:
                item.code,
              billerCode:
                item.code,
            })
          );

        return json({
          success:
            true,
          service,
          billers,
          networks:
            billers,
        });
      }

      const name =
        service ===
        "smile"
          ? "Smile"
          : service.toUpperCase();

      const option =
        {
          code:
            service,
          id:
            service,
          name,
          label:
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
   * ITEMS / PLANS
   * ======================================================== */

  if (
    action ===
      "items" ||
    action ===
      "plans"
  ) {
    const biller =
      requestedBiller(
        body,
        details
      );

    try {
      if (
        service ===
          "airtime" ||
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
        });
      }

      if (
        (
          service ===
            "data" ||
          service ===
            "airtime-card" ||
          service ===
            "data-card"
        ) &&
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

      if (
        service ===
          "cable" &&
        !biller
      ) {
        return json(
          {
            success:
              false,
            error:
              "Please select a cable TV service.",
          },
          400
        );
      }

      const code =
        service ===
            "data" ||
          service ===
            "airtime-card" ||
          service ===
            "data-card"
          ? networkCode(
              biller
            )
          : biller;

      const items =
        await getCatalog(
          service,
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
          networkCode(
            biller
          ),
        networkCode:
          networkCode(
            biller
          ),

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
      (
        service ===
          "data" ||
        service ===
          "airtime-card" ||
        service ===
          "data-card"
      ) &&
      !biller
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

    if (
      !itemCode &&
      service !==
        "airtime" &&
      service !==
        "electricity"
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
      if (
        service ===
          "airtime" ||
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
     * Cable.
     */
    if (
      service ===
        "cable" &&
      !biller
    ) {
      return json(
        {
          success:
            false,
          error:
            "Please select a cable TV service.",
        },
        400
      );
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
          "waec" ||
        service ===
          "jamb"
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

    /*
     * E-PIN quantities.
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
     * Services that use a Nigerian phone.
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
     * Cable and electricity use separate
     * customer identifiers.
     */
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

    if (
      service ===
        "cable" &&
      !smartcard
    ) {
      return json(
        {
          success:
            false,
          error:
            "Enter a valid SmartCard number.",
        },
        400
      );
    }

    if (
      service ===
        "electricity" &&
      !meterNumber
    ) {
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

    /*
     * Generate our own server-side transaction
     * reference.
     */
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

        /*
         * Airtime markup is explicitly 0%.
         */
        total =
          sellingPrice(
            "airtime",
            providerAmount
          );

        selected =
          {
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
            raw:
              {},
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

        if (
          !biller
        ) {
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

        providerAmount =
          roundMoney(
            amount
          );

        total =
          sellingPrice(
            "electricity",
            providerAmount
          );

        selected =
          {
            id:
              `${biller}-${amount}`,
            code:
              `${biller}-${amount}`,
            name:
              `${biller} Electricity`,
            price:
              total,
            providerPrice:
              providerAmount,
            billerCode:
              biller,
            service:
              "electricity",
            raw:
              {},
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

    /*
     * Preserve the exact customer price that
     * was independently calculated server-side.
     */
    const metadata =
      {
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

        item_code:
          selected.id,

        product_code:
          selected.code,

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

        customer:
          customer ||
          null,

        phone_number:
          customer ||
          null,

        smartcard:
          smartcard ||
          null,

        meter_number:
          meterNumber ||
          null,

        meter_type:
          meterType ||
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
        callbackUrl();

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
       */
      else {
        providerResponse =
          await clubKonnectRequest(
            "APIJAMBV1.asp",
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
    } catch (
      providerError
    ) {
      /*
       * IMPORTANT:
       *
       * A network exception does NOT prove that
       * ClubKonnect did not receive the request.
       *
       * Therefore we DO NOT refund here.
       *
       * The transaction remains pending and can
       * later be reconciled through APIQueryV1.
       */
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
     * CLASSIFY PROVIDER RESPONSE
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
     * PENDING / UNKNOWN
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

    /* ========================================================
     * RECONCILED SUCCESS
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

    /* ========================================================
     * RECONCILED FAILURE
     * ====================================================== */

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

    /* ========================================================
     * STILL PENDING
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
