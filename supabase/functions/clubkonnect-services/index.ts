import {
  adminClient,
  corsHeaders,
  getUser,
  json,
} from "../_shared/auth.ts";

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

type Action =
  | "catalog"
  | "get_catalog"
  | "plans"
  | "purchase"
  | "buy"
  | "pay"
  | "verify_meter"
  | "verify_cable"
  | "verify_smile"
  | "status"
  | "check_status"
  | "reconcile";

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

const PREMIUM_SERVICES = new Set<ServiceType>([
  "airtime-card",
  "data-card",
  "smile",
  "waec",
  "jamb",
]);

/*
 * IyanjuPay customer pricing:
 *
 * Airtime          = 0%
 * Data             = 15%
 * Electricity      = 15%
 * Cable TV         = 15%
 * Airtime E-PIN    = 20%
 * Data E-PIN       = 20%
 * Smile            = 20%
 * WAEC             = 20%
 * JAMB             = 20%
 */
const REGULAR_MARKUP = 0.15;
const PREMIUM_MARKUP = 0.20;

const CLUBKONNECT_BASE_URL = "https://www.nellobytesystems.com";

const CALLBACK_URL = (() => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  return supabaseUrl
    ? `${supabaseUrl.replace(/\/$/, "")}/functions/v1/clubkonnect-webhook`
    : "";
})();

const USER_ID = Deno.env.get("CLUBKONNECT_USER_ID") ?? "";
const API_KEY = Deno.env.get("CLUBKONNECT_API_KEY") ?? "";

const JSON_HEADERS = {
  Accept: "application/json",
};

interface AnyRecord {
  [key: string]: unknown;
}

interface NormalizedCatalogItem {
  code: string;
  name: string;
  providerPrice: number;
  price: number;
  networkCode?: string;
  billerCode?: string;
  productCode?: string;
  variationCode?: string;
  planCode?: string;
  category?: string;
  categoryName?: string;
  tab?: string;
  validity?: string;
  quantity?: number;
  raw?: unknown;
}

interface NormalizedNetwork {
  code: string;
  name: string;
  networkCode: string;
  billerCode?: string;
  logo?: string;
  raw?: unknown;
}

interface TransactionContext {
  userId: string;
  service: ServiceType;
  requestId: string;
  amount: number;
  providerAmount: number;
  details: AnyRecord;
  transactionId?: string;
}

function asRecord(value: unknown): AnyRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as AnyRecord
    : {};
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return "";
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim()) {
      const cleaned = value.replace(/,/g, "").replace(/[₦N\s]/gi, "");
      const parsed = Number(cleaned);

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function positiveNumber(...values: unknown[]): number {
  const value = firstNumber(...values);
  return value !== null && value > 0 ? value : 0;
}

function normalizeService(value: unknown): ServiceType | null {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");

  const aliases: Record<string, ServiceType> = {
    airtime: "airtime",
    voice: "airtime",
    airtime-recharge: "airtime",

    data: "data",
    databundle: "data",
    data-bundle: "data",

    electricity: "electricity",
    power: "electricity",

    cable: "cable",
    cable-tv: "cable",
    television: "cable",
    tv: "cable",

    "airtime-card": "airtime-card",
    airtime-epin: "airtime-card",
    "airtime-epin": "airtime-card",
    epin: "airtime-card",
    "recharge-card": "airtime-card",

    "data-card": "data-card",
    data-epin: "data-card",
    "data-epin": "data-card",

    smile: "smile",
    "smile-direct": "smile",

    waec: "waec",
    "waec-pin": "waec",

    jamb: "jamb",
    "jamb-pin": "jamb",
  };

  return aliases[normalized] ?? null;
}

function normalizeAction(value: unknown): Action {
  const normalized = String(value ?? "catalog")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");

  if (
    normalized === "purchase" ||
    normalized === "buy" ||
    normalized === "pay"
  ) {
    return "purchase";
  }

  if (
    normalized === "plans" ||
    normalized === "get-catalog"
  ) {
    return normalized === "plans" ? "plans" : "get_catalog";
  }

  if (normalized === "verify-meter") return "verify_meter";
  if (normalized === "verify-cable") return "verify_cable";
  if (normalized === "verify-smile") return "verify_smile";

  if (
    normalized === "status" ||
    normalized === "check-status"
  ) {
    return normalized === "status" ? "status" : "check_status";
  }

  if (normalized === "reconcile") return "reconcile";

  return "catalog";
}

function getMarkup(service: ServiceType): number {
  if (service === "airtime") {
    return 0;
  }

  if (PREMIUM_SERVICES.has(service)) {
    return PREMIUM_MARKUP;
  }

  return REGULAR_MARKUP;
}

function getSellingPrice(
  service: ServiceType,
  providerPrice: number,
): number {
  if (!Number.isFinite(providerPrice) || providerPrice < 0) {
    return 0;
  }

  const markup = getMarkup(service);

  return Math.round(
    providerPrice * (1 + markup) * 100,
  ) / 100;
}

function getProviderPrice(
  details: AnyRecord,
): number {
  return positiveNumber(
    details.provider_price,
    details.providerPrice,
    details.provider_amount,
    details.providerAmount,
    details.cost_price,
    details.costPrice,
  );
}

function getSellingAmount(
  details: AnyRecord,
): number {
  return positiveNumber(
    details.selling_amount,
    details.sellingAmount,
    details.amount,
    details.price,
    details.sale_price,
    details.salePrice,
  );
}

function makeRequestId(
  prefix = "IYANJUPAY",
): string {
  return `${prefix}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}

function normalizeCode(value: unknown): string {
  return firstString(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

function getPathValue(
  record: AnyRecord,
  ...keys: string[]
): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) {
      return record[key];
    }
  }

  return undefined;
}

/**
 * ClubKonnect frequently returns nested object maps rather than arrays.
 *
 * Example:
 *
 * {
 *   "MOBILE_NETWORK": {
 *     "MTN": [
 *       {
 *         "ID": "01",
 *         "PRODUCT": [...]
 *       }
 *     ]
 *   }
 * }
 *
 * This function deliberately flattens nested arrays and object maps.
 */
function flattenValues(
  value: unknown,
  output: unknown[] = [],
  depth = 0,
): unknown[] {
  if (depth > 12 || value === null || value === undefined) {
    return output;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      flattenValues(item, output, depth + 1);
    }

    return output;
  }

  if (typeof value !== "object") {
    return output;
  }

  const record = asRecord(value);

  for (const nested of Object.values(record)) {
    if (Array.isArray(nested)) {
      flattenValues(nested, output, depth + 1);
    } else if (
      nested !== null &&
      typeof nested === "object"
    ) {
      flattenValues(nested, output, depth + 1);
    }
  }

  return output;
}

function extractArrays(
  value: unknown,
): unknown[][] {
  const arrays: unknown[][] = [];

  const walk = (node: unknown, depth = 0) => {
    if (depth > 12 || node === null || node === undefined) {
      return;
    }

    if (Array.isArray(node)) {
      arrays.push(node);
      for (const item of node) {
        walk(item, depth + 1);
      }
      return;
    }

    if (typeof node !== "object") {
      return;
    }

    for (const nested of Object.values(asRecord(node))) {
      walk(nested, depth + 1);
    }
  };

  walk(value);

  return arrays;
}

function looksLikeProduct(
  value: unknown,
): boolean {
  const record = asRecord(value);

  const code = firstString(
    record.PRODUCT_CODE,
    record.product_code,
    record.PRODUCT_ID,
    record.product_id,
    record.ID,
    record.id,
    record.CODE,
    record.code,
  );

  const name = firstString(
    record.PRODUCT_NAME,
    record.product_name,
    record.PRODUCT,
    record.product,
    record.NAME,
    record.name,
    record.DESCRIPTION,
    record.description,
  );

  const price = firstNumber(
    record.PRODUCT_AMOUNT,
    record.product_amount,
    record.AMOUNT,
    record.amount,
    record.PRICE,
    record.price,
  );

  return Boolean(
    code ||
      name ||
      price !== null,
  );
}

function normalizeNetworkItem(
  value: unknown,
): NormalizedNetwork | null {
  const record = asRecord(value);

  const code = firstString(
    record.ID,
    record.id,
    record.CODE,
    record.code,
    record.NETWORK_CODE,
    record.network_code,
    record.networkCode,
    record.VALUE,
    record.value,
  );

  const name = firstString(
    record.NAME,
    record.name,
    record.NETWORK,
    record.network,
    record.MOBILE_NETWORK,
    record.mobile_network,
    record.COMPANY,
    record.company,
    record.LABEL,
    record.label,
    code,
  );

  if (!code && !name) {
    return null;
  }

  const logo = firstString(
    record.LOGO,
    record.logo,
    record.LOGO_URL,
    record.logo_url,
    record.logoUrl,
    record.IMAGE,
    record.image,
    record.IMAGE_URL,
    record.image_url,
    record.imageUrl,
    record.ICON,
    record.icon,
  );

  const billerCode = firstString(
    record.BILLER_CODE,
    record.biller_code,
    record.billerCode,
    record.BILLER,
    record.biller,
  );

  return {
    code: code || name,
    name: name || code,
    networkCode: code || name,
    ...(billerCode ? { billerCode } : {}),
    ...(logo ? { logo } : {}),
    raw: value,
  };
}

function normalizeCatalogItem(
  value: unknown,
  service: ServiceType,
  context: {
    networkCode?: string;
    billerCode?: string;
  } = {},
): NormalizedCatalogItem | null {
  const record = asRecord(value);

  const providerPrice = positiveNumber(
    record.PRODUCT_AMOUNT,
    record.product_amount,
    record.PROVIDER_PRICE,
    record.provider_price,
    record.providerPrice,
    record.PROVIDER_AMOUNT,
    record.provider_amount,
    record.COST,
    record.cost,
    record.COST_PRICE,
    record.cost_price,
    record.AMOUNT,
    record.amount,
    record.PRICE,
    record.price,
    record.VALUE,
    record.value,
  );

  const code = firstString(
    record.PRODUCT_CODE,
    record.product_code,
    record.productCode,
    record.PRODUCT_ID,
    record.product_id,
    record.PLAN_CODE,
    record.plan_code,
    record.planCode,
    record.VARIATION_CODE,
    record.variation_code,
    record.variationCode,
    record.CODE,
    record.code,
    record.ID,
    record.id,
  );

  const name = firstString(
    record.PRODUCT_NAME,
    record.product_name,
    record.productName,
    record.PLAN_NAME,
    record.plan_name,
    record.planName,
    record.PACKAGE_NAME,
    record.package_name,
    record.packageName,
    record.NAME,
    record.name,
    record.DESCRIPTION,
    record.description,
    record.LABEL,
    record.label,
    code,
  );

  if (!code && !name && !providerPrice) {
    return null;
  }

  const networkCode = firstString(
    record.MOBILE_NETWORK,
    record.mobile_network,
    record.NETWORK_CODE,
    record.network_code,
    record.networkCode,
    record.NETWORK,
    record.network,
    context.networkCode,
  );

  const billerCode = firstString(
    record.BILLER_CODE,
    record.biller_code,
    record.billerCode,
    record.BILLER,
    record.biller,
    context.billerCode,
  );

  const productCode = firstString(
    record.PRODUCT_CODE,
    record.product_code,
    record.productCode,
    code,
  );

  const variationCode = firstString(
    record.VARIATION_CODE,
    record.variation_code,
    record.variationCode,
  );

  const planCode = firstString(
    record.PLAN_CODE,
    record.plan_code,
    record.planCode,
    code,
  );

  const category = firstString(
    record.CATEGORY,
    record.category,
    record.TYPE,
    record.type,
  );

  const categoryName = firstString(
    record.CATEGORY_NAME,
    record.category_name,
    record.categoryName,
  );

  const validity = firstString(
    record.VALIDITY,
    record.validity,
    record.DURATION,
    record.duration,
  );

  const tab = firstString(
    record.TAB,
    record.tab,
    record.CATEGORY,
    record.category,
  );

  const price = getSellingPrice(
    service,
    providerPrice,
  );

  return {
    code: code || productCode || planCode || name,
    name: name || code,
    providerPrice,
    price,
    ...(networkCode ? { networkCode } : {}),
    ...(billerCode ? { billerCode } : {}),
    ...(productCode ? { productCode } : {}),
    ...(variationCode ? { variationCode } : {}),
    ...(planCode ? { planCode } : {}),
    ...(category ? { category } : {}),
    ...(categoryName ? { categoryName } : {}),
    ...(tab ? { tab } : {}),
    ...(validity ? { validity } : {}),
    raw: value,
  };
}

function uniqueByCode<T extends { code: string }>(
  values: T[],
): T[] {
  const seen = new Set<string>();
  const output: T[] = [];

  for (const value of values) {
    const key = normalizeCode(value.code);

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(value);
  }

  return output;
}

function normalizeNetworkCode(
  value: unknown,
): string {
  const raw = firstString(value);

  const aliases: Record<string, string> = {
    mtn: "01",
    "mtn-ng": "01",
    glo: "02",
    globacom: "02",
    etisalat: "03",
    "9mobile": "03",
    "9mobile-ng": "03",
    airtel: "04",
  };

  return aliases[normalizeCode(raw)] ?? raw;
}

function normalizeCableCode(
  value: unknown,
): string {
  const raw = firstString(value);

  const aliases: Record<string, string> = {
    dstv: "dstv",
    gotv: "gotv",
    startimes: "startimes",
    showmax: "showmax",
  };

  return aliases[normalizeCode(raw)] ?? raw;
}

function cleanPhone(
  value: unknown,
): string {
  let phone = firstString(value).replace(/[^\d+]/g, "");

  if (phone.startsWith("+234")) {
    phone = `0${phone.slice(4)}`;
  } else if (phone.startsWith("234")) {
    phone = `0${phone.slice(3)}`;
  }

  return phone;
}

function getQueryUrl(
  endpoint: string,
  params: Record<string, string | number | undefined> = {},
): string {
  const url = new URL(`${CLUBKONNECT_BASE_URL}/${endpoint}`);

  url.searchParams.set("UserID", USER_ID);

  for (const [key, value] of Object.entries(params)) {
    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ""
    ) {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

async function clubKonnectGet(
  endpoint: string,
  params: Record<string, string | number | undefined> = {},
): Promise<unknown> {
  if (!USER_ID || !API_KEY) {
    throw new Error(
      "ClubKonnect credentials are not configured.",
    );
  }

  const url = getQueryUrl(endpoint, params);

  /*
   * ClubKonnect's APIs use UserID + APIKey.
   * Keep both credentials server-side.
   */
  const finalUrl = new URL(url);
  finalUrl.searchParams.set("APIKey", API_KEY);

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    30_000,
  );

  try {
    const response = await fetch(
      finalUrl.toString(),
      {
        method: "GET",
        headers: JSON_HEADERS,
        signal: controller.signal,
      },
    );

    const text = await response.text();

    let payload: unknown = text;

    try {
      payload = JSON.parse(text);
    } catch {
      // Keep raw text.
    }

    if (!response.ok) {
      throw new Error(
        `ClubKonnect HTTP ${response.status}: ${
          typeof payload === "string"
            ? payload
            : JSON.stringify(payload)
        }`,
      );
    }

    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function getProviderMessage(
  response: unknown,
): string {
  const record = asRecord(response);

  return firstString(
    record.message,
    record.MESSAGE,
    record.Message,
    record.remark,
    record.REMARK,
    record.REMARKS,
    record.orderremark,
    record.ORDERREMARK,
    record.description,
    record.DESCRIPTION,
    record.error,
    record.ERROR,
    typeof response === "string" ? response : "",
  );
}

function getProviderStatusCode(
  response: unknown,
): string {
  const record = asRecord(response);

  return firstString(
    record.statuscode,
    record.STATUSCODE,
    record.statusCode,
    record.STATUS,
    record.status,
    record.code,
    record.CODE,
    record.responsecode,
    record.RESPONSECODE,
  );
}

function classifyProviderResponse(
  response: unknown,
): {
  success: boolean;
  pending: boolean;
  failed: boolean;
  status: string;
  message: string;
  orderId: string;
} {
  const record = asRecord(response);

  const statusCode = getProviderStatusCode(response)
    .toUpperCase();

  const orderStatus = firstString(
    record.orderstatus,
    record.ORDERSTATUS,
    record.orderStatus,
    record.status,
    record.STATUS,
  ).toUpperCase();

  const orderId = firstString(
    record.orderid,
    record.ORDERID,
    record.orderId,
    record.OrderID,
    record.id,
    record.ID,
  );

  const message =
    getProviderMessage(response) ||
    "ClubKonnect response received.";

  const combined = `${statusCode} ${orderStatus} ${message}`
    .toUpperCase();

  const pending =
    statusCode === "100" ||
    statusCode === "300" ||
    statusCode === "ORDER_RECEIVED" ||
    statusCode === "ORDER_PROCESSED" ||
    combined.includes("PENDING") ||
    combined.includes("PROCESSING") ||
    combined.includes("RECEIVED");

  const success =
    statusCode === "200" ||
    statusCode === "ORDER_COMPLETED" ||
    orderStatus === "COMPLETED" ||
    orderStatus === "SUCCESS" ||
    combined.includes("SUCCESSFULL");

  const failed =
    !success &&
    !pending &&
    (
      statusCode === "400" ||
      statusCode === "401" ||
      statusCode === "402" ||
      statusCode === "403" ||
      statusCode === "404" ||
      statusCode === "500" ||
      orderStatus === "FAILED" ||
      orderStatus === "FAILURE" ||
      combined.includes("FAILED") ||
      combined.includes("INVALID") ||
      combined.includes("ERROR")
    );

  return {
    success,
    pending,
    failed,
    status: success
      ? "completed"
      : pending
      ? "pending"
      : "failed",
    message,
    orderId,
  };
}

function extractNetworkObjects(
  response: unknown,
): NormalizedNetwork[] {
  const record = asRecord(response);

  const candidates = [
    record.networks,
    record.NETWORKS,
    record.providers,
    record.PROVIDERS,
    record.data,
    record.DATA,
    record.MOBILE_NETWORK,
    record.mobile_network,
    record.network,
    record.NETWORK,
  ];

  const output: NormalizedNetwork[] = [];

  const walk = (
    value: unknown,
    inheritedName?: string,
    inheritedCode?: string,
    depth = 0,
  ) => {
    if (depth > 10 || value === null || value === undefined) {
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        walk(
          item,
          inheritedName,
          inheritedCode,
          depth + 1,
        );
      }
      return;
    }

    if (typeof value !== "object") {
      return;
    }

    const current = asRecord(value);

    const explicit = normalizeNetworkItem({
      ...current,
      ...(inheritedName
        ? {
            name: firstString(
              current.name,
              current.NAME,
              inheritedName,
            ),
          }
        : {}),
      ...(inheritedCode
        ? {
            code: firstString(
              current.code,
              current.CODE,
              current.ID,
              inheritedCode,
            ),
          }
        : {}),
    });

    if (explicit) {
      const hasNetworkIdentity =
        firstString(
          current.NETWORK_CODE,
          current.network_code,
          current.networkCode,
          current.MOBILE_NETWORK,
          current.mobile_network,
          current.NETWORK,
          current.network,
          current.NAME,
          current.name,
          inheritedName,
        );

      if (hasNetworkIdentity) {
        output.push(explicit);
      }
    }

    for (const [key, nested] of Object.entries(current)) {
      if (
        key === "PRODUCT" ||
        key === "PRODUCTS" ||
        key === "plans" ||
        key === "PLANS" ||
        key === "items" ||
        key === "ITEMS"
      ) {
        continue;
      }

      if (
        nested !== null &&
        typeof nested === "object"
      ) {
        const keyCode = normalizeNetworkCode(key);

        walk(
          nested,
          key,
          keyCode || key,
          depth + 1,
        );
      }
    }
  };

  for (const candidate of candidates) {
    walk(candidate);
  }

  return uniqueByCode(output);
}

function extractProductArrays(
  response: unknown,
): Array<{
  values: unknown[];
  networkCode?: string;
  billerCode?: string;
}> {
  const output: Array<{
    values: unknown[];
    networkCode?: string;
    billerCode?: string;
  }> = [];

  const walk = (
    value: unknown,
    context: {
      networkCode?: string;
      billerCode?: string;
    } = {},
    depth = 0,
  ) => {
    if (depth > 12 || value === null || value === undefined) {
      return;
    }

    if (Array.isArray(value)) {
      if (value.length > 0) {
        output.push({
          values: value,
          ...context,
        });
      }

      for (const item of value) {
        walk(item, context, depth + 1);
      }

      return;
    }

    if (typeof value !== "object") {
      return;
    }

    const record = asRecord(value);

    const networkCode = firstString(
      record.NETWORK_CODE,
      record.network_code,
      record.networkCode,
      record.MOBILE_NETWORK,
      record.mobile_network,
      record.NETWORK,
      record.network,
      context.networkCode,
    );

    const billerCode = firstString(
      record.BILLER_CODE,
      record.biller_code,
      record.billerCode,
      record.BILLER,
      record.biller,
      context.billerCode,
    );

    for (const [key, nested] of Object.entries(record)) {
      const keyLower = key.toLowerCase();

      if (
        keyLower === "product" ||
        keyLower === "products" ||
        keyLower === "plans" ||
        keyLower === "packages" ||
        keyLower === "items"
      ) {
        walk(
          nested,
          {
            networkCode:
              networkCode ||
              normalizeNetworkCode(key),
            billerCode,
          },
          depth + 1,
        );

        continue;
      }

      if (
        nested !== null &&
        typeof nested === "object"
      ) {
        let nextNetworkCode = networkCode;
        let nextBillerCode = billerCode;

        if (
          !nextNetworkCode &&
          (
            keyLower === "mtn" ||
            keyLower === "glo" ||
            keyLower === "airtel" ||
            keyLower === "etisalat" ||
            keyLower === "9mobile" ||
            keyLower === "m_9mobile"
          )
        ) {
          nextNetworkCode = normalizeNetworkCode(key);
        }

        walk(
          nested,
          {
            networkCode: nextNetworkCode,
            billerCode: nextBillerCode,
          },
          depth + 1,
        );
      }
    }
  };

  walk(response);

  return output;
}

async function catalogAirtime(): Promise<AnyRecord> {
  const response = await clubKonnectGet(
    "APIAirtimeNetworkV2.asp",
  );

  const networks = extractNetworkObjects(response);

  return {
    success: true,
    service: "airtime",
    markup: 0,
    networks,
    items: networks.map((network) => ({
      code: network.networkCode,
      name: network.name,
      networkCode: network.networkCode,
      ...(network.billerCode
        ? { billerCode: network.billerCode }
        : {}),
      price: 0,
      providerPrice: 0,
      logo: network.logo,
    })),
    raw: response,
  };
}

async function catalogData(
  networkCode?: string,
): Promise<AnyRecord> {
  const networkResponse = await clubKonnectGet(
    "APIDatabundleNetworkV2.asp",
  );

  const networks =
    extractNetworkObjects(networkResponse);

  const selectedCode =
    networkCode
      ? normalizeNetworkCode(networkCode)
      : "";

  const planResponse = await clubKonnectGet(
    "APIDatabundlePlansV2.asp",
  );

  const planGroups =
    extractProductArrays(planResponse);

  const plans: NormalizedCatalogItem[] = [];

  for (const group of planGroups) {
    const groupNetwork =
      normalizeNetworkCode(
        group.networkCode,
      );

    if (
      selectedCode &&
      groupNetwork &&
      groupNetwork !== selectedCode
    ) {
      continue;
    }

    for (const value of group.values) {
      const item = normalizeCatalogItem(
        value,
        "data",
        {
          networkCode:
            groupNetwork ||
            selectedCode ||
            undefined,
        },
      );

      if (item && item.providerPrice > 0) {
        plans.push(item);
      }
    }
  }

  const filteredNetworks = selectedCode
    ? networks.filter(
        (network) =>
          normalizeNetworkCode(
            network.networkCode,
          ) === selectedCode,
      )
    : networks;

  return {
    success: true,
    service: "data",
    markup: REGULAR_MARKUP,
    networks: filteredNetworks,
    plans: uniqueByCode(plans),
    items: uniqueByCode(plans),
    raw: {
      networks: networkResponse,
      plans: planResponse,
    },
  };
}

async function catalogCable(): Promise<AnyRecord> {
  const typeResponse = await clubKonnectGet(
    "APICableTVTypeV2.asp",
  );

  const packageResponse = await clubKonnectGet(
    "APICableTVPackagesV2.asp",
  );

  const billers: NormalizedNetwork[] = [];

  const networkCandidates =
    extractNetworkObjects(typeResponse);

  for (const network of networkCandidates) {
    const code = normalizeCableCode(
      network.networkCode,
    );

    if (!code) continue;

    billers.push({
      ...network,
      code,
      networkCode: code,
    });
  }

  if (billers.length === 0) {
    const flat = flattenValues(typeResponse);

    for (const value of flat) {
      const record = asRecord(value);

      const code = normalizeCableCode(
        firstString(
          record.ID,
          record.id,
          record.CODE,
          record.code,
          record.CABLETV,
          record.CableTV,
        ),
      );

      const name = firstString(
        record.NAME,
        record.name,
        record.CABLETV,
        record.CableTV,
        record.DESCRIPTION,
        record.description,
        code,
      );

      if (code || name) {
        billers.push({
          code: code || name,
          name: name || code,
          networkCode: code || name,
          raw: value,
        });
      }
    }
  }

  const packages: NormalizedCatalogItem[] = [];

  for (
    const group of extractProductArrays(
      packageResponse,
    )
  ) {
    const billerCode =
      normalizeCableCode(
        group.billerCode ||
          group.networkCode,
      );

    for (const value of group.values) {
      const item = normalizeCatalogItem(
        value,
        "cable",
        {
          billerCode:
            billerCode || undefined,
        },
      );

      if (item && item.providerPrice > 0) {
        packages.push(item);
      }
    }
  }

  return {
    success: true,
    service: "cable",
    markup: REGULAR_MARKUP,
    billers: uniqueByCode(billers),
    items: uniqueByCode(packages),
    plans: uniqueByCode(packages),
    raw: {
      types: typeResponse,
      packages: packageResponse,
    },
  };
}

async function catalogElectricity(): Promise<AnyRecord> {
  /*
   * ClubKonnect's public documentation confirms that electricity
   * companies are obtained from a live disco catalogue, but the
   * public documentation currently does not expose a concrete
   * catalogue URL.
   *
   * Therefore we do NOT fabricate an endpoint.
   *
   * The catalogue can be supplied securely through:
   *
   * CLUBKONNECT_ELECTRICITY_BILLERS_JSON
   *
   * Example shape:
   *
   * [
   *   {
   *     "code": "01",
   *     "name": "Eko Electricity Distribution Company"
   *   }
   * ]
   */
  const configured =
    Deno.env.get(
      "CLUBKONNECT_ELECTRICITY_BILLERS_JSON",
    );

  let billers: NormalizedNetwork[] = [];

  if (configured) {
    try {
      const parsed = JSON.parse(configured);
      const values = Array.isArray(parsed)
        ? parsed
        : flattenValues(parsed);

      billers = values
        .map((value) =>
          normalizeNetworkItem(value)
        )
        .filter(
          (
            value,
          ): value is NormalizedNetwork =>
            Boolean(value),
        );
    } catch {
      throw new Error(
        "CLUBKONNECT_ELECTRICITY_BILLERS_JSON is not valid JSON.",
      );
    }
  }

  /*
   * Verified sample from ClubKonnect's electricity
   * documentation: EKEDC uses code 01.
   *
   * We only expose this fallback when no custom catalogue
   * has been configured, rather than inventing unsupported
   * distributor codes.
   */
  if (billers.length === 0) {
    billers = [
      {
        code: "01",
        name:
          "Eko Electricity Distribution Company",
        networkCode: "01",
      },
    ];
  }

  return {
    success: true,
    service: "electricity",
    markup: REGULAR_MARKUP,
    billers,
    items: [],
    plans: [],
    message:
      "Electricity billers loaded.",
  };
}

async function catalogAirtimeCard(): Promise<AnyRecord> {
  const response = await clubKonnectGet(
    "APIEPINDiscountV2.asp",
  );

  const items: NormalizedCatalogItem[] = [];

  for (
    const group of extractProductArrays(response)
  ) {
    for (const value of group.values) {
      const item = normalizeCatalogItem(
        value,
        "airtime-card",
        {
          networkCode:
            group.networkCode ||
            undefined,
        },
      );

      if (item && item.providerPrice > 0) {
        items.push(item);
      }
    }
  }

  if (items.length === 0) {
    for (const value of flattenValues(response)) {
      const item = normalizeCatalogItem(
        value,
        "airtime-card",
      );

      if (item && item.providerPrice > 0) {
        items.push(item);
      }
    }
  }

  const networks = extractNetworkObjects(
    response,
  );

  return {
    success: true,
    service: "airtime-card",
    markup: PREMIUM_MARKUP,
    networks,
    items: uniqueByCode(items),
    plans: uniqueByCode(items),
    raw: response,
  };
}

async function catalogDataCard(): Promise<AnyRecord> {
  /*
   * ClubKonnect documents Data E-PIN catalogue through
   * the same APIDatabundlePlansV2.asp endpoint.
   *
   * We therefore use the verified endpoint and mark the
   * resulting catalogue as Data E-PIN.
   */
  const response = await clubKonnectGet(
    "APIDatabundlePlansV2.asp",
  );

  const items: NormalizedCatalogItem[] = [];

  for (
    const group of extractProductArrays(response)
  ) {
    for (const value of group.values) {
      const item = normalizeCatalogItem(
        value,
        "data-card",
        {
          networkCode:
            group.networkCode ||
            undefined,
        },
      );

      if (item && item.providerPrice > 0) {
        items.push(item);
      }
    }
  }

  return {
    success: true,
    service: "data-card",
    markup: PREMIUM_MARKUP,
    networks: extractNetworkObjects(
      response,
    ),
    items: uniqueByCode(items),
    plans: uniqueByCode(items),
    raw: response,
  };
}

async function catalogSmile(): Promise<AnyRecord> {
  const response = await clubKonnectGet(
    "APISmilePackagesV2.asp",
  );

  const items: NormalizedCatalogItem[] = [];

  for (
    const value of flattenValues(response)
  ) {
    const item = normalizeCatalogItem(
      value,
      "smile",
      {
        networkCode: "smile-direct",
      },
    );

    if (item && item.providerPrice > 0) {
      items.push(item);
    }
  }

  return {
    success: true,
    service: "smile",
    markup: PREMIUM_MARKUP,
    networks: [
      {
        code: "smile-direct",
        name: "Smile",
        networkCode: "smile-direct",
      },
    ],
    items: uniqueByCode(items),
    plans: uniqueByCode(items),
    raw: response,
  };
}

async function catalogWaec(): Promise<AnyRecord> {
  const response = await clubKonnectGet(
    "APIWAECPackagesV2.asp",
  );

  const items: NormalizedCatalogItem[] = [];

  for (
    const value of flattenValues(response)
  ) {
    const item = normalizeCatalogItem(
      value,
      "waec",
    );

    if (item && item.providerPrice > 0) {
      items.push(item);
    }
  }

  return {
    success: true,
    service: "waec",
    markup: PREMIUM_MARKUP,
    items: uniqueByCode(items),
    plans: uniqueByCode(items),
    raw: response,
  };
}

async function catalogJamb(): Promise<AnyRecord> {
  const response = await clubKonnectGet(
    "APIJAMBPackagesV2.asp",
  );

  const items: NormalizedCatalogItem[] = [];

  for (
    const value of flattenValues(response)
  ) {
    const item = normalizeCatalogItem(
      value,
      "jamb",
    );

    if (item && item.providerPrice > 0) {
      items.push(item);
    }
  }

  return {
    success: true,
    service: "jamb",
    markup: PREMIUM_MARKUP,
    items: uniqueByCode(items),
    plans: uniqueByCode(items),
    raw: response,
  };
}

async function loadCatalog(
  service: ServiceType,
  details: AnyRecord,
): Promise<AnyRecord> {
  switch (service) {
    case "airtime":
      return await catalogAirtime();

    case "data":
      return await catalogData(
        firstString(
          details.network_code,
          details.networkCode,
          details.mobile_network,
          details.mobileNetwork,
        ) || undefined,
      );

    case "electricity":
      return await catalogElectricity();

    case "cable":
      return await catalogCable();

    case "airtime-card":
      return await catalogAirtimeCard();

    case "data-card":
      return await catalogDataCard();

    case "smile":
      return await catalogSmile();

    case "waec":
      return await catalogWaec();

    case "jamb":
      return await catalogJamb();
  }
}

function findCatalogPrice(
  service: ServiceType,
  details: AnyRecord,
): {
  providerPrice: number;
  sellingPrice: number;
  item?: NormalizedCatalogItem;
} {
  const providerPriceDirect =
    getProviderPrice(details);

  if (providerPriceDirect > 0) {
    return {
      providerPrice: providerPriceDirect,
      sellingPrice:
        getSellingPrice(
          service,
          providerPriceDirect,
        ),
    };
  }

  return {
    providerPrice: 0,
    sellingPrice: 0,
  };
}

async function getWalletBalance(
  userId: string,
): Promise<number> {
  const { data, error } =
    await adminClient
      .from("wallets")
      .select("balance")
      .eq("user_id", userId)
      .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to read wallet: ${error.message}`,
    );
  }

  return positiveNumber(
    data?.balance,
  );
}

async function createTransaction(
  context: TransactionContext,
): Promise<string> {
  const metadata = {
    service: context.service,
    provider: "clubkonnect",
    request_id: context.requestId,
    provider_amount: context.providerAmount,
    selling_amount: context.amount,
    markup: getMarkup(context.service),
    details: context.details,
  };

  const referenceNumber =
    `IKP-${context.service.toUpperCase()}-${Date.now()}-${crypto
      .randomUUID()
      .slice(0, 8)}`;

  const { data, error } =
    await adminClient
      .from("transactions")
      .insert({
        user_id: context.userId,
        transaction_type: "service_purchase",
        amount: context.amount,
        status: "pending",
        provider: "clubkonnect",
        provider_reference: context.requestId,
        reference_number: referenceNumber,
        metadata,
      })
      .select("id")
      .single();

  if (error || !data?.id) {
    throw new Error(
      `Unable to create transaction: ${
        error?.message ?? "unknown error"
      }`,
    );
  }

  return data.id;
}

async function updateTransaction(
  transactionId: string,
  values: Record<string, unknown>,
): Promise<void> {
  const { error } =
    await adminClient
      .from("transactions")
      .update(values)
      .eq("id", transactionId);

  if (error) {
    console.error(
      "Transaction update failed:",
      error.message,
    );
  }
}

async function debitWallet(
  userId: string,
  amount: number,
  idempotencyKey: string,
  description: string,
): Promise<void> {
  const { error } =
    await adminClient.rpc(
      "debit_wallet",
      {
        p_user_id: userId,
        p_amount: amount,
        p_idempotency_key: idempotencyKey,
        p_description: description,
      },
    );

  if (error) {
    throw new Error(
      `Wallet debit failed: ${error.message}`,
    );
  }
}

async function creditWallet(
  userId: string,
  amount: number,
  idempotencyKey: string,
  description: string,
): Promise<void> {
  const { error } =
    await adminClient.rpc(
      "credit_wallet",
      {
        p_user_id: userId,
        p_amount: amount,
        p_idempotency_key: idempotencyKey,
        p_description: description,
      },
    );

  if (error) {
    throw new Error(
      `Wallet refund failed: ${error.message}`,
    );
  }
}

function getString(
  details: AnyRecord,
  ...keys: string[]
): string {
  return firstString(
    ...keys.map((key) => details[key]),
  );
}

function getAmount(
  details: AnyRecord,
): number {
  return positiveNumber(
    details.amount,
    details.selling_amount,
    details.sellingAmount,
  );
}

function getQuantity(
  details: AnyRecord,
): number {
  const quantity = firstNumber(
    details.quantity,
    details.qty,
  );

  return quantity !== null && quantity >= 1
    ? Math.floor(quantity)
    : 1;
}

function ensureAmount(
  amount: number,
): void {
  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    throw new Error(
      "A valid amount is required.",
    );
  }
}

function ensurePhone(
  phone: string,
): void {
  if (!/^0\d{10}$/.test(phone)) {
    throw new Error(
      "A valid Nigerian phone number is required.",
    );
  }
}

async function purchaseAirtime(
  details: AnyRecord,
): Promise<unknown> {
  const network = normalizeNetworkCode(
    getString(
      details,
      "network_code",
      "networkCode",
      "mobile_network",
      "mobileNetwork",
    ),
  );

  const phone = cleanPhone(
    getString(
      details,
      "phone",
      "phoneNumber",
      "recipient_phone",
      "recipientPhone",
    ),
  );

  const amount = getAmount(details);

  if (!network) {
    throw new Error(
      "Mobile network is required.",
    );
  }

  ensurePhone(phone);
  ensureAmount(amount);

  return await clubKonnectGet(
    "APIAirtimeV1.asp",
    {
      APIKey: API_KEY,
      MobileNetwork: network,
      MobileNo: phone,
      Amount: amount,
      RequestID: getString(
        details,
        "request_id",
        "requestId",
      ),
      CallBackURL: CALLBACK_URL,
    },
  );
}

async function purchaseData(
  details: AnyRecord,
): Promise<unknown> {
  const network = normalizeNetworkCode(
    getString(
      details,
      "network_code",
      "networkCode",
      "mobile_network",
      "mobileNetwork",
    ),
  );

  const phone = cleanPhone(
    getString(
      details,
      "phone",
      "phoneNumber",
      "recipient_phone",
      "recipientPhone",
    ),
  );

  const plan = getString(
    details,
    "data_plan",
    "dataPlan",
    "plan_code",
    "planCode",
    "product_code",
    "productCode",
    "variation_code",
    "variationCode",
    "item_code",
    "itemCode",
  );

  if (!network) {
    throw new Error(
      "Mobile network is required.",
    );
  }

  if (!plan) {
    throw new Error(
      "Data plan is required.",
    );
  }

  ensurePhone(phone);

  return await clubKonnectGet(
    "APIDatabundleV1.asp",
    {
      APIKey: API_KEY,
      MobileNetwork: network,
      DataPlan: plan,
      MobileNo: phone,
      RequestID: getString(
        details,
        "request_id",
        "requestId",
      ),
      CallBackURL: CALLBACK_URL,
    },
  );
}

async function purchaseElectricity(
  details: AnyRecord,
): Promise<unknown> {
  const company = getString(
    details,
    "biller_code",
    "billerCode",
    "electric_company",
    "electricCompany",
    "company_code",
    "companyCode",
  );

  const meterType = getString(
    details,
    "meter_type",
    "meterType",
  );

  const meterNumber = getString(
    details,
    "meter_number",
    "meterNumber",
    "meter_no",
    "meterNo",
  );

  const phone = cleanPhone(
    getString(
      details,
      "phone",
      "phoneNumber",
    ),
  );

  const amount = getAmount(details);

  if (!company) {
    throw new Error(
      "Electricity company is required.",
    );
  }

  if (!meterType) {
    throw new Error(
      "Meter type is required.",
    );
  }

  if (!meterNumber) {
    throw new Error(
      "Meter number is required.",
    );
  }

  ensureAmount(amount);

  if (phone) {
    ensurePhone(phone);
  }

  return await clubKonnectGet(
    "APIElectricityV1.asp",
    {
      APIKey: API_KEY,
      ElectricCompany: company,
      MeterType: meterType,
      MeterNo: meterNumber,
      Amount: amount,
      PhoneNo: phone || undefined,
      RequestID: getString(
        details,
        "request_id",
        "requestId",
      ),
      CallBackURL: CALLBACK_URL,
    },
  );
}

async function purchaseCable(
  details: AnyRecord,
): Promise<unknown> {
  const cable = normalizeCableCode(
    getString(
      details,
      "biller_code",
      "billerCode",
      "cable_code",
      "cableCode",
      "cable_tv",
      "cableTV",
    ),
  );

  const packageCode = getString(
    details,
    "package_code",
    "packageCode",
    "package",
    "plan_code",
    "planCode",
    "product_code",
    "productCode",
    "item_code",
    "itemCode",
  );

  const smartcard = getString(
    details,
    "smartcard_number",
    "smartcardNumber",
    "smartCardNumber",
    "smartcard_no",
    "smartcardNo",
  );

  const phone = cleanPhone(
    getString(
      details,
      "phone",
      "phoneNumber",
    ),
  );

  if (!cable) {
    throw new Error(
      "Cable TV provider is required.",
    );
  }

  if (!packageCode) {
    throw new Error(
      "Cable TV package is required.",
    );
  }

  if (!smartcard) {
    throw new Error(
      "Smartcard number is required.",
    );
  }

  return await clubKonnectGet(
    "APICableTVV1.asp",
    {
      APIKey: API_KEY,
      CableTV: cable,
      Package: packageCode,
      SmartCardNo: smartcard,
      PhoneNo: phone || undefined,
      RequestID: getString(
        details,
        "request_id",
        "requestId",
      ),
      CallBackURL: CALLBACK_URL,
    },
  );
}

async function purchaseAirtimeCard(
  details: AnyRecord,
): Promise<unknown> {
  const network = normalizeNetworkCode(
    getString(
      details,
      "network_code",
      "networkCode",
      "mobile_network",
      "mobileNetwork",
    ),
  );

  const value = positiveNumber(
    details.value,
    details.amount,
    details.provider_price,
    details.providerPrice,
  );

  const quantity = getQuantity(details);

  if (!network) {
    throw new Error(
      "Mobile network is required.",
    );
  }

  ensureAmount(value);

  if (quantity < 1 || quantity > 100) {
    throw new Error(
      "Quantity must be between 1 and 100.",
    );
  }

  return await clubKonnectGet(
    "APIEPINV1.asp",
    {
      APIKey: API_KEY,
      MobileNetwork: network,
      Value: value,
      Quantity: quantity,
      RequestID: getString(
        details,
        "request_id",
        "requestId",
      ),
      CallBackURL: CALLBACK_URL,
    },
  );
}

async function purchaseDataCard(
  details: AnyRecord,
): Promise<unknown> {
  const network = normalizeNetworkCode(
    getString(
      details,
      "network_code",
      "networkCode",
      "mobile_network",
      "mobileNetwork",
    ),
  );

  const plan = getString(
    details,
    "data_plan",
    "dataPlan",
    "plan_code",
    "planCode",
    "product_code",
    "productCode",
    "item_code",
    "itemCode",
  );

  const quantity = getQuantity(details);

  if (!network) {
    throw new Error(
      "Mobile network is required.",
    );
  }

  if (!plan) {
    throw new Error(
      "Data plan is required.",
    );
  }

  if (quantity < 1 || quantity > 100) {
    throw new Error(
      "Quantity must be between 1 and 100.",
    );
  }

  return await clubKonnectGet(
    "APIDatabundleEPINV1.asp",
    {
      APIKey: API_KEY,
      MobileNetwork: network,
      DataPlan: plan,
      Quantity: quantity,
      RequestID: getString(
        details,
        "request_id",
        "requestId",
      ),
      CallBackURL: CALLBACK_URL,
    },
  );
}

async function purchaseSmile(
  details: AnyRecord,
): Promise<unknown> {
  const accountId = getString(
    details,
    "account_id",
    "accountId",
    "mobile_number",
    "mobileNumber",
    "phone",
    "phoneNumber",
  );

  const plan = getString(
    details,
    "data_plan",
    "dataPlan",
    "plan_code",
    "planCode",
    "product_code",
    "productCode",
    "item_code",
    "itemCode",
  );

  if (!accountId) {
    throw new Error(
      "Smile account/mobile number is required.",
    );
  }

  if (!plan) {
    throw new Error(
      "Smile package is required.",
    );
  }

  return await clubKonnectGet(
    "APISmileV1.asp",
    {
      APIKey: API_KEY,
      MobileNo: accountId,
      DataPlan: plan,
      RequestID: getString(
        details,
        "request_id",
        "requestId",
      ),
      CallBackURL: CALLBACK_URL,
    },
  );
}

async function purchaseWaec(
  details: AnyRecord,
): Promise<unknown> {
  const examType = getString(
    details,
    "exam_type",
    "examType",
    "product_code",
    "productCode",
    "item_code",
    "itemCode",
  );

  const phone = cleanPhone(
    getString(
      details,
      "phone",
      "phoneNumber",
    ),
  );

  if (!examType) {
    throw new Error(
      "WAEC package is required.",
    );
  }

  if (phone) {
    ensurePhone(phone);
  }

  return await clubKonnectGet(
    "APIWAECV1.asp",
    {
      APIKey: API_KEY,
      ExamType: examType,
      PhoneNo: phone || undefined,
      RequestID: getString(
        details,
        "request_id",
        "requestId",
      ),
      CallBackURL: CALLBACK_URL,
    },
  );
}

async function purchaseJamb(
  details: AnyRecord,
): Promise<unknown> {
  const examType = getString(
    details,
    "exam_type",
    "examType",
  );

  const phone = cleanPhone(
    getString(
      details,
      "phone",
      "phoneNumber",
    ),
  );

  const packageCode = getString(
    details,
    "package_code",
    "packageCode",
    "product_code",
    "productCode",
    "item_code",
    "itemCode",
  );

  if (!examType) {
    throw new Error(
      "JAMB examination type is required.",
    );
  }

  if (phone) {
    ensurePhone(phone);
  }

  return await clubKonnectGet(
    "APIJAMBV1.asp",
    {
      APIKey: API_KEY,
      ExamType: examType,
      ...(packageCode
        ? { Package: packageCode }
        : {}),
      PhoneNo: phone || undefined,
      RequestID: getString(
        details,
        "request_id",
        "requestId",
      ),
      CallBackURL: CALLBACK_URL,
    },
  );
}

async function executePurchase(
  service: ServiceType,
  details: AnyRecord,
): Promise<unknown> {
  switch (service) {
    case "airtime":
      return await purchaseAirtime(details);

    case "data":
      return await purchaseData(details);

    case "electricity":
      return await purchaseElectricity(
        details,
      );

    case "cable":
      return await purchaseCable(details);

    case "airtime-card":
      return await purchaseAirtimeCard(
        details,
      );

    case "data-card":
      return await purchaseDataCard(
        details,
      );

    case "smile":
      return await purchaseSmile(details);

    case "waec":
      return await purchaseWaec(details);

    case "jamb":
      return await purchaseJamb(details);
  }
}

async function verifyMeter(
  details: AnyRecord,
): Promise<AnyRecord> {
  const company = getString(
    details,
    "biller_code",
    "billerCode",
    "electric_company",
    "electricCompany",
    "company_code",
    "companyCode",
  );

  const meterType = getString(
    details,
    "meter_type",
    "meterType",
  );

  const meterNumber = getString(
    details,
    "meter_number",
    "meterNumber",
    "meter_no",
    "meterNo",
  );

  if (!company) {
    throw new Error(
      "Electricity company is required.",
    );
  }

  if (!meterType) {
    throw new Error(
      "Meter type is required.",
    );
  }

  if (!meterNumber) {
    throw new Error(
      "Meter number is required.",
    );
  }

  const response =
    await clubKonnectGet(
      "APIVerifyElectricityV1.asp",
      {
        APIKey: API_KEY,
        ElectricCompany: company,
        MeterNo: meterNumber,
        MeterType: meterType,
      },
    );

  const record = asRecord(response);

  const customerName = firstString(
    record.customer_name,
    record.customerName,
    record.CUSTOMER_NAME,
    record.name,
    record.NAME,
  );

  const invalid =
    !customerName ||
    customerName.toUpperCase() ===
      "INVALID_METERNO" ||
    customerName.toUpperCase() ===
      "INVALID_METERNUMBER";

  return {
    success: !invalid,
    customer_name:
      customerName || "INVALID_METERNO",
    customerName:
      customerName || "INVALID_METERNO",
    message: invalid
      ? "Invalid meter number."
      : "Meter verified successfully.",
    raw: response,
  };
}

async function verifyCable(
  details: AnyRecord,
): Promise<AnyRecord> {
  const cable = normalizeCableCode(
    getString(
      details,
      "biller_code",
      "billerCode",
      "cable_code",
      "cableCode",
      "cable_tv",
      "cableTV",
    ),
  );

  const smartcard = getString(
    details,
    "smartcard_number",
    "smartcardNumber",
    "smartCardNumber",
    "smartcard_no",
    "smartcardNo",
  );

  if (!cable) {
    throw new Error(
      "Cable TV provider is required.",
    );
  }

  if (!smartcard) {
    throw new Error(
      "Smartcard number is required.",
    );
  }

  const response =
    await clubKonnectGet(
      "APIVerifyCableTVV1.asp",
      {
        APIKey: API_KEY,
        CableTV: cable,
        SmartCardNo: smartcard,
      },
    );

  const record = asRecord(response);

  const customerName = firstString(
    record.customer_name,
    record.customerName,
    record.CUSTOMER_NAME,
    record.name,
    record.NAME,
  );

  const invalid =
    !customerName ||
    customerName.toUpperCase().includes(
      "INVALID",
    );

  return {
    success: !invalid,
    customer_name: customerName,
    customerName,
    message: invalid
      ? "Unable to verify this smartcard."
      : "Smartcard verified successfully.",
    raw: response,
  };
}

async function verifySmile(
  details: AnyRecord,
): Promise<AnyRecord> {
  const accountId = getString(
    details,
    "account_id",
    "accountId",
    "mobile_number",
    "mobileNumber",
  );

  if (!accountId) {
    throw new Error(
      "Smile account number is required.",
    );
  }

  const response =
    await clubKonnectGet(
      "APIVerifySmileV1.asp",
      {
        APIKey: API_KEY,
        MobileNo: accountId,
      },
    );

  return {
    success: true,
    account_id: accountId,
    accountId,
    raw: response,
  };
}

async function queryProvider(
  details: AnyRecord,
): Promise<AnyRecord> {
  const orderId = getString(
    details,
    "order_id",
    "orderId",
    "provider_order_id",
    "providerOrderId",
  );

  const requestId = getString(
    details,
    "request_id",
    "requestId",
  );

  if (!orderId && !requestId) {
    throw new Error(
      "Order ID or Request ID is required.",
    );
  }

  const response =
    await clubKonnectGet(
      "APIQueryV1.asp",
      {
        APIKey: API_KEY,
        ...(orderId
          ? { OrderID: orderId }
          : {}),
        ...(requestId
          ? { RequestID: requestId }
          : {}),
      },
    );

  const classification =
    classifyProviderResponse(response);

  return {
    success: true,
    status: classification.status,
    pending: classification.pending,
    completed: classification.success,
    failed: classification.failed,
    order_id:
      classification.orderId ||
      orderId,
    request_id: requestId,
    message: classification.message,
    raw: response,
  };
}

async function handlePurchase(
  userId: string,
  service: ServiceType,
  details: AnyRecord,
): Promise<Response> {
  const requestId =
    getString(
      details,
      "request_id",
      "requestId",
    ) || makeRequestId();

  details.request_id = requestId;
  details.requestId = requestId;

  /*
   * The frontend sends customer selling amount.
   * The backend remains authoritative.
   */
  let providerPrice =
    getProviderPrice(details);

  let sellingAmount =
    getSellingAmount(details);

  /*
   * For fixed catalogue services, provider_price
   * is preferred. When only selling_amount arrives,
   * infer provider cost from the service markup.
   */
  if (
    providerPrice <= 0 &&
    sellingAmount > 0
  ) {
    providerPrice =
      Math.round(
        (
          sellingAmount /
          (1 + getMarkup(service))
        ) * 100,
      ) / 100;
  }

  if (
    service === "airtime" &&
    sellingAmount > 0
  ) {
    /*
     * Airtime is explicitly 0% markup.
     * Therefore customer amount = provider amount.
     */
    providerPrice = sellingAmount;
  }

  if (
    providerPrice <= 0 &&
    service !== "airtime"
  ) {
    const catalogPrice =
      findCatalogPrice(
        service,
        details,
      );

    providerPrice =
      catalogPrice.providerPrice;

    if (
      sellingAmount <= 0
    ) {
      sellingAmount =
        catalogPrice.sellingPrice;
    }
  }

  if (
    service === "airtime" &&
    sellingAmount <= 0
  ) {
    throw new Error(
      "Airtime amount is required.",
    );
  }

  if (
    providerPrice <= 0 &&
    sellingAmount <= 0
  ) {
    throw new Error(
      "Unable to determine the service price.",
    );
  }

  if (sellingAmount <= 0) {
    sellingAmount =
      getSellingPrice(
        service,
        providerPrice,
      );
  }

  /*
   * Do not trust an arbitrary frontend selling amount
   * when a provider price is available.
   */
  if (providerPrice > 0) {
    const authoritativeSellingAmount =
      getSellingPrice(
        service,
        providerPrice,
      );

    /*
     * Airtime is exactly 0%, so this also guarantees
     * no hidden 15% markup.
     */
    sellingAmount =
      authoritativeSellingAmount;
  }

  sellingAmount =
    Math.round(
      sellingAmount * 100,
    ) / 100;

  providerPrice =
    Math.round(
      providerPrice * 100,
    ) / 100;

  ensureAmount(sellingAmount);

  const balance =
    await getWalletBalance(userId);

  if (balance < sellingAmount) {
    return json(
      {
        success: false,
        error: "INSUFFICIENT_BALANCE",
        message:
          "Insufficient wallet balance.",
      },
      400,
    );
  }

  const transactionId =
    await createTransaction({
      userId,
      service,
      requestId,
      amount: sellingAmount,
      providerAmount: providerPrice,
      details,
    });

  const debitKey =
    `service-debit:${transactionId}`;

  try {
    await debitWallet(
      userId,
      sellingAmount,
      debitKey,
      `IyanjuPay ${service} purchase`,
    );
  } catch (error) {
    await updateTransaction(
      transactionId,
      {
        status: "failed",
        metadata: {
          service,
          request_id: requestId,
          provider: "clubkonnect",
          provider_amount: providerPrice,
          selling_amount: sellingAmount,
          error:
            error instanceof Error
              ? error.message
              : String(error),
        },
      },
    );

    throw error;
  }

  try {
    const providerResponse =
      await executePurchase(
        service,
        {
          ...details,
          amount: providerPrice,
          provider_price: providerPrice,
          providerPrice,
          request_id: requestId,
          requestId,
        },
      );

    const classification =
      classifyProviderResponse(
        providerResponse,
      );

    await updateTransaction(
      transactionId,
      {
        status:
          classification.status,
        provider_reference:
          classification.orderId ||
          requestId,
        metadata: {
          service,
          provider: "clubkonnect",
          request_id: requestId,
          provider_order_id:
            classification.orderId ||
            null,
          provider_amount:
            providerPrice,
          selling_amount:
            sellingAmount,
          markup:
            getMarkup(service),
          provider_response:
            providerResponse,
        },
      },
    );

    if (classification.failed) {
      const refundKey =
        `service-refund:${transactionId}`;

      await creditWallet(
        userId,
        sellingAmount,
        refundKey,
        `Refund failed ${service} purchase`,
      );

      await updateTransaction(
        transactionId,
        {
          status: "failed",
        },
      );

      return json(
        {
          success: false,
          status: "failed",
          refunded: true,
          transaction_id:
            transactionId,
          transactionId,
          request_id: requestId,
          requestId,
          message:
            classification.message ||
            "Service purchase failed.",
          provider:
            "clubkonnect",
        },
        400,
      );
    }

    return json(
      {
        success: true,
        status:
          classification.status,
        pending:
          classification.pending,
        completed:
          classification.success,
        transaction_id:
          transactionId,
        transactionId,
        request_id: requestId,
        requestId,
        provider_order_id:
          classification.orderId ||
          null,
        providerOrderId:
          classification.orderId ||
          null,
        service,
        amount: sellingAmount,
        sellingAmount,
        providerPrice,
        message:
          classification.message,
        provider:
          "clubkonnect",
      },
      classification.pending
        ? 202
        : 200,
    );
  } catch (error) {
    /*
     * Do NOT refund on an unknown provider/network
     * exception. The provider may have accepted the
     * transaction even though the HTTP request failed.
     *
     * Leave the transaction pending so the webhook/query
     * reconciliation process can determine the final state.
     */
    await updateTransaction(
      transactionId,
      {
        status: "pending",
        metadata: {
          service,
          provider: "clubkonnect",
          request_id: requestId,
          provider_amount:
            providerPrice,
          selling_amount:
            sellingAmount,
          markup:
            getMarkup(service),
          provider_error:
            error instanceof Error
              ? error.message
              : String(error),
        },
      },
    );

    return json(
      {
        success: true,
        status: "pending",
        pending: true,
        transaction_id:
          transactionId,
        transactionId,
        request_id: requestId,
        requestId,
        amount: sellingAmount,
        sellingAmount,
        providerPrice,
        message:
          "Your service request was submitted and is being processed.",
      },
      202,
    );
  }
}

async function handleRequest(
  request: Request,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(
      "ok",
      {
        headers: corsHeaders,
      },
    );
  }

  if (request.method !== "POST") {
    return json(
      {
        success: false,
        error:
          "Only POST requests are supported.",
      },
      405,
    );
  }

  const user =
    await getUser(request);

  if (!user) {
    return json(
      {
        success: false,
        error: "Unauthorized",
      },
      401,
    );
  }

  let body: AnyRecord;

  try {
    body =
      await request.json();
  } catch {
    return json(
      {
        success: false,
        error: "Invalid JSON body.",
      },
      400,
    );
  }

  const action =
    normalizeAction(body.action);

  const service =
    normalizeService(
      body.service ??
        body.service_type ??
        body.serviceType,
    );

  if (!service) {
    return json(
      {
        success: false,
        error:
          "Unsupported or missing service.",
        supported_services:
          SUPPORTED_SERVICES,
      },
      400,
    );
  }

  try {
    if (
      action === "catalog" ||
      action === "get_catalog" ||
      action === "plans"
    ) {
      const catalogue =
        await loadCatalog(
          service,
          body,
        );

      return json(
        catalogue,
        200,
      );
    }

    if (
      action === "verify_meter"
    ) {
      if (service !== "electricity") {
        return json(
          {
            success: false,
            error:
              "Meter verification is only available for electricity.",
          },
          400,
        );
      }

      return json(
        await verifyMeter(body),
        200,
      );
    }

    if (
      action === "verify_cable"
    ) {
      if (service !== "cable") {
        return json(
          {
            success: false,
            error:
              "Cable verification is only available for Cable TV.",
          },
          400,
        );
      }

      return json(
        await verifyCable(body),
        200,
      );
    }

    if (
      action === "verify_smile"
    ) {
      if (service !== "smile") {
        return json(
          {
            success: false,
            error:
              "Smile verification is only available for Smile.",
          },
          400,
        );
      }

      return json(
        await verifySmile(body),
        200,
      );
    }

    if (
      action === "status" ||
      action === "check_status"
    ) {
      return json(
        await queryProvider(body),
        200,
      );
    }

    if (
      action === "purchase"
    ) {
      return await handlePurchase(
        user.id,
        service,
        body,
      );
    }

    return json(
      {
        success: false,
        error:
          "Unsupported action.",
      },
      400,
    );
  } catch (error) {
    console.error(
      "clubkonnect-services error:",
      error,
    );

    return json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Service request failed.",
      },
      500,
    );
  }
}

Deno.serve(handleRequest);
