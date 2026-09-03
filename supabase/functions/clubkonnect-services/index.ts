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

type ActionType =
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

interface AnyRecord {
  [key: string]: unknown;
}

interface NormalizedItem {
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
  validity?: string;
  packageName?: string;
  examType?: string;
  quantity?: number;
  raw?: unknown;
  [key: string]: unknown;
}

interface ProviderResult {
  success: boolean;
  pending: boolean;
  message: string;
  statusCode?: string;
  orderId?: string;
  requestId?: string;
  raw: unknown;
}

const CLUBKONNECT_BASE_URL = "https://www.nellobytesystems.com";

const CALLBACK_URL =
  `${Deno.env.get("SUPABASE_URL") ?? ""}/functions/v1/clubkonnect-webhook`;

const SERVICE_MARKUPS: Record<ServiceType, number> = {
  airtime: 0,
  data: 0.15,
  electricity: 0.15,
  cable: 0.15,
  "airtime-card": 0.20,
  "data-card": 0.20,
  smile: 0.20,
  waec: 0.20,
  jamb: 0.20,
};

const SERVICE_ALIASES: Record<string, ServiceType> = {
  airtime: "airtime",
  voice: "airtime",
  airtime_purchase: "airtime",
  airtimepurchase: "airtime",

  data: "data",
  databundle: "data",
  databundles: "data",
  data_bundle: "data",
  data_purchase: "data",

  electricity: "electricity",
  electric: "electricity",
  power: "electricity",

  cable: "cable",
  cabletv: "cable",
  cable_tv: "cable",

  "airtime-card": "airtime-card",
  airtime_card: "airtime-card",
  airtime_epin: "airtime-card",
  airtime_epin: "airtime-card",
  airtimepin: "airtime-card",
  epin: "airtime-card",

  "data-card": "data-card",
  data_card: "data-card",
  data_epin: "data-card",
  data_epin_purchase: "data-card",

  smile: "smile",
  "smile-direct": "smile",

  waec: "waec",
  waec_result: "waec",

  jamb: "jamb",
};

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

function asRecord(value: unknown): AnyRecord {
  return value !== null && typeof value === "object"
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

function toNumber(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]/g, "");
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function firstNumber(...values: unknown[]): number {
  for (const value of values) {
    const number = toNumber(value);

    if (number > 0) {
      return number;
    }
  }

  return 0;
}

function normalizeService(value: unknown): ServiceType | null {
  const normalized = firstString(value)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_");

  return SERVICE_ALIASES[normalized] ?? null;
}

function getMarkup(service: ServiceType): number {
  return SERVICE_MARKUPS[service] ?? 0;
}

function calculateSellingPrice(
  providerPrice: number,
  service: ServiceType,
): number {
  const markup = getMarkup(service);

  if (!providerPrice || providerPrice <= 0) {
    return 0;
  }

  return Math.round(providerPrice * (1 + markup) * 100) / 100;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function flattenValues(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenValues(item));
  }

  if (value !== null && typeof value === "object") {
    const record = asRecord(value);

    return Object.values(record).flatMap((item) => flattenValues(item));
  }

  return [];
}

function findNestedArrays(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  const record = asRecord(value);

  for (const key of [
    "data",
    "items",
    "plans",
    "products",
    "packages",
    "networks",
    "providers",
    "billers",
    "MOBILE_NETWORK",
  ]) {
    if (record[key] !== undefined) {
      const result = findNestedArrays(record[key]);

      if (result.length > 0) {
        return result;
      }
    }
  }

  for (const value of Object.values(record)) {
    const result = findNestedArrays(value);

    if (result.length > 0) {
      return result;
    }
  }

  return [];
}

function extractArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  const record = asRecord(value);

  const directKeys = [
    "items",
    "plans",
    "products",
    "packages",
    "networks",
    "providers",
    "billers",
    "data",
    "MOBILE_NETWORK",
  ];

  for (const key of directKeys) {
    if (record[key] !== undefined) {
      const candidate = record[key];

      if (Array.isArray(candidate)) {
        return candidate;
      }

      if (candidate && typeof candidate === "object") {
        const flattened = flattenValues(candidate);

        if (flattened.length > 0) {
          return flattened;
        }
      }
    }
  }

  return findNestedArrays(value);
}

function normalizeNetwork(item: unknown): AnyRecord | null {
  const record = asRecord(item);

  const code = firstString(
    record.code,
    record.Code,
    record.network_code,
    record.networkCode,
    record.NETWORK_CODE,
    record.MobileNetwork,
    record.MOBILE_NETWORK,
    record.id,
    record.ID,
    record.value,
  );

  const name = firstString(
    record.name,
    record.Name,
    record.network,
    record.Network,
    record.company,
    record.Company,
    record.label,
    record.Label,
    record.title,
  );

  if (!code && !name) {
    return null;
  }

  return {
    ...record,
    code: code || name,
    name: name || code,
    networkCode: code || undefined,
    network_code: code || undefined,
    logo: firstString(
      record.logo,
      record.logo_url,
      record.logoUrl,
      record.image,
      record.image_url,
      record.imageUrl,
      record.icon,
    ) || undefined,
  };
}

function normalizeCatalogItem(
  item: unknown,
  service: ServiceType,
  context?: {
    networkCode?: string;
    billerCode?: string;
  },
): NormalizedItem | null {
  const record = asRecord(item);

  const nestedProduct = asRecord(
    record.PRODUCT ??
      record.product ??
      record.Product ??
      record.package ??
      record.Package,
  );

  const source: AnyRecord = {
    ...record,
    ...nestedProduct,
  };

  const providerPrice = firstNumber(
    source.provider_price,
    source.providerPrice,
    source.provider_amount,
    source.providerAmount,
    source.PRODUCT_AMOUNT,
    source.ProductAmount,
    source.amount,
    source.Amount,
    source.price,
    source.Price,
    source.value,
    source.VALUE,
  );

  const code = firstString(
    source.code,
    source.Code,
    source.PRODUCT_CODE,
    source.product_code,
    source.productCode,
    source.PRODUCT_ID,
    source.product_id,
    source.plan_code,
    source.planCode,
    source.variation_code,
    source.variationCode,
    source.ID,
    source.id,
    source.value,
  );

  const name = firstString(
    source.name,
    source.Name,
    source.PRODUCT_NAME,
    source.product_name,
    source.productName,
    source.plan_name,
    source.planName,
    source.package_name,
    source.packageName,
    source.description,
    source.DESCRIPTION,
    source.label,
    source.Label,
    source.title,
    source.Title,
    source.code,
    source.Code,
  );

  if (!code && !name) {
    return null;
  }

  const networkCode = firstString(
    source.network_code,
    source.networkCode,
    source.MOBILE_NETWORK,
    source.mobile_network,
    source.MobileNetwork,
    context?.networkCode,
  );

  const billerCode = firstString(
    source.biller_code,
    source.billerCode,
    source.BillerCode,
    source.company_code,
    source.companyCode,
    source.ElectricCompany,
    source.CableTV,
    context?.billerCode,
  );

  const productCode = firstString(
    source.product_code,
    source.productCode,
    source.PRODUCT_CODE,
    source.PRODUCT_ID,
  );

  const variationCode = firstString(
    source.variation_code,
    source.variationCode,
    source.VARIATION_CODE,
  );

  const planCode = firstString(
    source.plan_code,
    source.planCode,
    source.PLAN_CODE,
    source.PRODUCT_CODE,
    source.PRODUCT_ID,
    code,
  );

  const categoryName = firstString(
    source.category_name,
    source.categoryName,
    source.category,
    source.CATEGORY,
    source.type,
    source.Type,
  );

  const validity = firstString(
    source.validity,
    source.Validity,
    source.duration,
    source.Duration,
  );

  const packageName = firstString(
    source.package_name,
    source.packageName,
    source.PACKAGE_NAME,
    source.PRODUCT_NAME,
    name,
  );

  const examType = firstString(
    source.exam_type,
    source.examType,
    source.ExamType,
    source.EXAM_TYPE,
    source.type,
  );

  const sellingPrice = calculateSellingPrice(providerPrice, service);

  return {
    ...source,
    code: code || name,
    name: name || code,
    providerPrice,
    price: sellingPrice,
    networkCode: networkCode || undefined,
    billerCode: billerCode || undefined,
    productCode: productCode || undefined,
    variationCode: variationCode || undefined,
    planCode: planCode || undefined,
    category: firstString(source.category),
    categoryName: categoryName || undefined,
    validity: validity || undefined,
    packageName: packageName || undefined,
    examType: examType || undefined,
    raw: item,
  };
}

function normalizeNetworkList(value: unknown): AnyRecord[] {
  const source = flattenValues(value);

  const result: AnyRecord[] = [];

  for (const item of source) {
    const normalized = normalizeNetwork(item);

    if (normalized) {
      result.push(normalized);
    }
  }

  const dedupe = new Map<string, AnyRecord>();

  for (const item of result) {
    const key = firstString(
      item.code,
      item.networkCode,
      item.network_code,
      item.name,
    ).toLowerCase();

    if (key && !dedupe.has(key)) {
      dedupe.set(key, item);
    }
  }

  return [...dedupe.values()];
}

function normalizeItems(
  value: unknown,
  service: ServiceType,
  context?: {
    networkCode?: string;
    billerCode?: string;
  },
): NormalizedItem[] {
  const source = flattenValues(value);

  const result: NormalizedItem[] = [];

  for (const item of source) {
    const normalized = normalizeCatalogItem(item, service, context);

    if (normalized) {
      result.push(normalized);
    }
  }

  const dedupe = new Map<string, NormalizedItem>();

  for (const item of result) {
    const key = [
      item.networkCode ?? "",
      item.billerCode ?? "",
      item.code,
      item.providerPrice,
    ]
      .join("|")
      .toLowerCase();

    if (!dedupe.has(key)) {
      dedupe.set(key, item);
    }
  }

  return [...dedupe.values()];
}

function responseStatus(value: unknown): string {
  const record = asRecord(value);

  return firstString(
    record.statuscode,
    record.statusCode,
    record.status,
    record.Status,
    record.orderstatus,
    record.orderStatus,
    record.ORDERSTATUS,
    record.responsecode,
    record.responseCode,
    record.code,
    record.Code,
  ).toUpperCase();
}

function responseMessage(value: unknown): string {
  const record = asRecord(value);

  return firstString(
    record.message,
    record.Message,
    record.remark,
    record.Remark,
    record.orderremark,
    record.orderRemark,
    record.ORDERREMARK,
    record.response,
    record.Response,
    record.description,
    record.Description,
    record.error,
    record.Error,
  );
}

function classifyProviderResponse(value: unknown): ProviderResult {
  const status = responseStatus(value);
  const message = responseMessage(value);

  const orderId = firstString(
    asRecord(value).orderid,
    asRecord(value).orderId,
    asRecord(value).OrderID,
    asRecord(value).ORDERID,
  );

  const requestId = firstString(
    asRecord(value).requestid,
    asRecord(value).requestId,
    asRecord(value).RequestID,
    asRecord(value).REQUESTID,
  );

  const successStatuses = new Set([
    "200",
    "SUCCESS",
    "COMPLETED",
    "ORDER_COMPLETED",
    "ORDER SUCCESSFUL",
    "ORDER_SUCCESSFUL",
  ]);

  const pendingStatuses = new Set([
    "100",
    "300",
    "PENDING",
    "PROCESSING",
    "ORDER_RECEIVED",
    "ORDER_PROCESSED",
    "QUEUED",
  ]);

  const failedStatuses = new Set([
    "FAILED",
    "FAIL",
    "ERROR",
    "INVALID",
    "400",
    "401",
    "402",
    "403",
    "404",
    "500",
  ]);

  if (successStatuses.has(status)) {
    return {
      success: true,
      pending: false,
      message: message || "Transaction completed successfully.",
      statusCode: status,
      orderId,
      requestId,
      raw: value,
    };
  }

  if (pendingStatuses.has(status)) {
    return {
      success: true,
      pending: true,
      message: message || "Transaction is being processed.",
      statusCode: status,
      orderId,
      requestId,
      raw: value,
    };
  }

  if (failedStatuses.has(status)) {
    return {
      success: false,
      pending: false,
      message: message || "The provider could not process the transaction.",
      statusCode: status,
      orderId,
      requestId,
      raw: value,
    };
  }

  const lowerMessage = message.toLowerCase();

  if (
    lowerMessage.includes("success") ||
    lowerMessage.includes("completed")
  ) {
    return {
      success: true,
      pending: false,
      message: message || "Transaction completed successfully.",
      statusCode: status || undefined,
      orderId,
      requestId,
      raw: value,
    };
  }

  if (
    lowerMessage.includes("received") ||
    lowerMessage.includes("processing") ||
    lowerMessage.includes("pending") ||
    lowerMessage.includes("queued")
  ) {
    return {
      success: true,
      pending: true,
      message: message || "Transaction is being processed.",
      statusCode: status || undefined,
      orderId,
      requestId,
      raw: value,
    };
  }

  return {
    success: false,
    pending: false,
    message: message || "Unable to determine provider transaction status.",
    statusCode: status || undefined,
    orderId,
    requestId,
    raw: value,
  };
}

async function clubKonnectGet(
  endpoint: string,
  params: Record<string, string | number | undefined>,
): Promise<unknown> {
  const userId = Deno.env.get("CLUBKONNECT_USER_ID");
  const apiKey = Deno.env.get("CLUBKONNECT_API_KEY");

  if (!userId || !apiKey) {
    throw new Error(
      "ClubKonnect credentials are not configured on the server.",
    );
  }

  const url = new URL(`${CLUBKONNECT_BASE_URL}/${endpoint}`);

  url.searchParams.set("UserID", userId);
  url.searchParams.set("APIKey", apiKey);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    const text = await response.text();

    let parsed: unknown;

    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = {
        success: response.ok,
        raw: text,
        message: text,
      };
    }

    if (!response.ok) {
      throw new Error(
        `ClubKonnect HTTP ${response.status}: ${
          responseMessage(parsed) || text
        }`,
      );
    }

    return parsed;
  } finally {
    clearTimeout(timeout);
  }
}

function getCatalogEndpoint(service: ServiceType): string {
  switch (service) {
    case "airtime":
      return "APIAirtimeNetworkV2.asp";

    case "data":
    case "data-card":
      return "APIDatabundlePlansV2.asp";

    case "electricity":
      return "";

    case "cable":
      return "APICableTVTypeV2.asp";

    case "airtime-card":
      return "APIEPINDiscountV2.asp";

    case "smile":
      return "APISmilePackagesV2.asp";

    case "waec":
      return "APIWAECPackagesV2.asp";

    case "jamb":
      return "APIJAMBPackagesV2.asp";

    default:
      return "";
  }
}

async function getCatalog(
  service: ServiceType,
  body: AnyRecord,
): Promise<AnyRecord> {
  if (service === "electricity") {
    return getElectricityCatalog();
  }

  if (service === "cable") {
    const response = await clubKonnectGet(
      "APICableTVTypeV2.asp",
      {},
    );

    const billers = normalizeNetworkList(response);

    return {
      success: true,
      service,
      markup: getMarkup(service),
      billers,
      items: billers,
      data: {
        billers,
        items: billers,
      },
    };
  }

  if (service === "data" || service === "data-card") {
    const response = await clubKonnectGet(
      "APIDatabundlePlansV2.asp",
      {},
    );

    const requestedNetworkCode = firstString(
      body.network_code,
      body.networkCode,
      body.mobile_network,
      body.MobileNetwork,
    );

    const source = asRecord(response);
    const mobileNetwork = source.MOBILE_NETWORK ??
      source.mobile_network ??
      source.MobileNetwork ??
      source.data ??
      response;

    const mobileNetworkRecord = asRecord(mobileNetwork);

    const networks = Object.entries(mobileNetworkRecord).map(
      ([key, value]) => {
        const networkCode = key;

        return {
          code: networkCode,
          name: key === "m_9mobile" ? "9mobile" : key,
          networkCode,
          network_code: networkCode,
          plans: value,
        };
      },
    );

    const selected = requestedNetworkCode
      ? mobileNetworkRecord[requestedNetworkCode] ??
        mobileNetworkRecord[
          Object.keys(mobileNetworkRecord).find(
            (key) =>
              key.toLowerCase() === requestedNetworkCode.toLowerCase(),
          ) ?? ""
        ]
      : undefined;

    const sourceForItems = selected ?? mobileNetwork;

    const items = normalizeItems(
      sourceForItems,
      service,
      requestedNetworkCode
        ? { networkCode: requestedNetworkCode }
        : undefined,
    );

    const normalizedNetworks = networks.map((network) => ({
      ...network,
      plans: undefined,
    }));

    return {
      success: true,
      service,
      markup: getMarkup(service),
      networks: normalizedNetworks,
      plans: items,
      items,
      data: {
        networks: normalizedNetworks,
        plans: items,
        items,
      },
    };
  }

  const endpoint = getCatalogEndpoint(service);

  if (!endpoint) {
    return {
      success: true,
      service,
      markup: getMarkup(service),
      networks: [],
      billers: [],
      plans: [],
      items: [],
      data: {
        networks: [],
        billers: [],
        plans: [],
        items: [],
      },
    };
  }

  const response = await clubKonnectGet(endpoint, {});

  const items = normalizeItems(response, service);

  const networks =
    service === "airtime" || service === "airtime-card"
      ? normalizeNetworkList(response)
      : [];

  return {
    success: true,
    service,
    markup: getMarkup(service),
    networks,
    plans: items,
    items,
    data: {
      networks,
      plans: items,
      items,
    },
  };
}

async function getNetworkSpecificCatalog(
  service: ServiceType,
  body: AnyRecord,
): Promise<AnyRecord> {
  const networkCode = firstString(
    body.network_code,
    body.networkCode,
    body.mobile_network,
    body.MobileNetwork,
  );

  const billerCode = firstString(
    body.biller_code,
    body.billerCode,
    body.company_code,
    body.companyCode,
    body.CableTV,
    body.ElectricCompany,
  );

  if (service === "data" || service === "data-card") {
    const response = await clubKonnectGet(
      "APIDatabundlePlansV2.asp",
      {},
    );

    const source = asRecord(response);
    const mobileNetwork = asRecord(
      source.MOBILE_NETWORK ??
        source.mobile_network ??
        source.MobileNetwork ??
        source.data ??
        response,
    );

    let selectedValue: unknown;

    if (networkCode) {
      const matchingKey = Object.keys(mobileNetwork).find(
        (key) =>
          key.toLowerCase() === networkCode.toLowerCase(),
      );

      selectedValue = matchingKey
        ? mobileNetwork[matchingKey]
        : undefined;
    }

    const items = normalizeItems(
      selectedValue ?? mobileNetwork,
      service,
      networkCode
        ? { networkCode }
        : undefined,
    );

    return {
      success: true,
      service,
      markup: getMarkup(service),
      plans: items,
      items,
      data: {
        plans: items,
        items,
      },
    };
  }

  if (service === "cable") {
    const response = await clubKonnectGet(
      "APICableTVPackagesV2.asp",
      {
        CableTV: billerCode || undefined,
      },
    );

    const items = normalizeItems(
      response,
      service,
      billerCode
        ? { billerCode }
        : undefined,
    );

    return {
      success: true,
      service,
      markup: getMarkup(service),
      plans: items,
      items,
      data: {
        plans: items,
        items,
      },
    };
  }

  if (service === "airtime" || service === "airtime-card") {
    const response = await clubKonnectGet(
      getCatalogEndpoint(service),
      networkCode
        ? {
            MobileNetwork: networkCode,
          }
        : {},
    );

    const items = normalizeItems(
      response,
      service,
      networkCode
        ? { networkCode }
        : undefined,
    );

    return {
      success: true,
      service,
      markup: getMarkup(service),
      plans: items,
      items,
      data: {
        plans: items,
        items,
      },
    };
  }

  return getCatalog(service, body);
}

function getElectricityBillers(): AnyRecord[] {
  const configured = Deno.env.get(
    "CLUBKONNECT_ELECTRICITY_BILLERS_JSON",
  );

  if (configured) {
    try {
      const parsed = JSON.parse(configured);

      if (Array.isArray(parsed)) {
        return parsed.map((item) => {
          const record = asRecord(item);

          const code = firstString(
            record.code,
            record.billerCode,
            record.biller_code,
            record.ElectricCompany,
            record.value,
          );

          const name = firstString(
            record.name,
            record.label,
            record.company,
            record.title,
          );

          return {
            ...record,
            code,
            name,
            billerCode: code,
            biller_code: code,
          };
        });
      }
    } catch {
      // Ignore malformed optional configuration.
    }
  }

  return [
    {
      code: "01",
      name: "EKEDC",
      billerCode: "01",
      biller_code: "01",
    },
  ];
}

async function getElectricityCatalog(): Promise<AnyRecord> {
  const billers = getElectricityBillers();

  return {
    success: true,
    service: "electricity",
    markup: getMarkup("electricity"),
    billers,
    items: billers,
    data: {
      billers,
      items: billers,
    },
    message:
      "Electricity billers are configured server-side.",
  };
}

function getPurchaseAmount(
  body: AnyRecord,
  service: ServiceType,
): number {
  if (
    service === "airtime" ||
    service === "electricity"
  ) {
    return firstNumber(
      body.amount,
      body.selling_amount,
      body.sellingAmount,
      body.price,
    );
  }

  if (
    service === "airtime-card" ||
    service === "data-card"
  ) {
    const quantity = Math.max(
      1,
      Math.floor(
        firstNumber(body.quantity) || 1,
      ),
    );

    const providerPrice = firstNumber(
      body.provider_price,
      body.providerPrice,
      body.provider_amount,
      body.providerAmount,
    );

    const sellingAmount = firstNumber(
      body.selling_amount,
      body.sellingAmount,
      body.price,
      body.amount,
    );

    if (sellingAmount > 0) {
      return sellingAmount * quantity;
    }

    return calculateSellingPrice(
      providerPrice,
      service,
    ) * quantity;
  }

  return firstNumber(
    body.selling_amount,
    body.sellingAmount,
    body.amount,
    body.price,
  );
}

function getProviderAmount(
  body: AnyRecord,
  service: ServiceType,
): number {
  const providerPrice = firstNumber(
    body.provider_price,
    body.providerPrice,
    body.provider_amount,
    body.providerAmount,
  );

  if (providerPrice > 0) {
    return providerPrice;
  }

  const sellingAmount = getPurchaseAmount(
    body,
    service,
  );

  const markup = getMarkup(service);

  if (markup <= 0) {
    return sellingAmount;
  }

  return Math.round(
    (sellingAmount / (1 + markup)) * 100,
  ) / 100;
}

function generateRequestId(userId: string): string {
  return `IYANJUPAY-${userId.slice(0, 8)}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}

async function createPendingTransaction(
  userId: string,
  service: ServiceType,
  amount: number,
  body: AnyRecord,
  requestId: string,
): Promise<string> {
  const { data, error } = await adminClient
    .from("transactions")
    .insert({
      user_id: userId,
      transaction_type: "service_purchase",
      amount,
      status: "pending",
      reference_number: requestId,
      provider: "clubkonnect",
      provider_reference: requestId,
      metadata: {
        service,
        request_id: requestId,
        ...body,
      },
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(
      `Unable to create transaction: ${error.message}`,
    );
  }

  return String(data.id);
}

async function updateTransaction(
  transactionId: string,
  updates: Record<string, unknown>,
): Promise<void> {
  const { error } = await adminClient
    .from("transactions")
    .update(updates)
    .eq("id", transactionId);

  if (error) {
    console.error(
      "Failed to update transaction:",
      error,
    );
  }
}

async function debitWallet(
  userId: string,
  amount: number,
  reference: string,
): Promise<void> {
  const { error } = await adminClient.rpc(
    "debit_wallet",
    {
      p_user_id: userId,
      p_amount: amount,
      p_reference: reference,
      p_description: "Service purchase",
    },
  );

  if (error) {
    throw new Error(
      `Wallet debit failed: ${error.message}`,
    );
  }
}

async function refundWallet(
  userId: string,
  amount: number,
  reference: string,
): Promise<void> {
  const { error } = await adminClient.rpc(
    "credit_wallet",
    {
      p_user_id: userId,
      p_amount: amount,
      p_reference: `REFUND-${reference}`,
      p_description: "Service purchase refund",
    },
  );

  if (error) {
    console.error(
      "Wallet refund failed:",
      error,
    );
  }
}

async function purchaseAirtime(
  body: AnyRecord,
  requestId: string,
): Promise<unknown> {
  return clubKonnectGet(
    "APIAirtimeV1.asp",
    {
      MobileNetwork: firstString(
        body.network_code,
        body.networkCode,
        body.mobile_network,
        body.MobileNetwork,
      ),
      MobileNumber: firstString(
        body.phone,
        body.phoneNumber,
        body.mobile_number,
        body.mobileNumber,
      ),
      Amount: firstNumber(
        body.amount,
        body.selling_amount,
        body.sellingAmount,
      ),
      RequestID: requestId,
      CallBackURL: CALLBACK_URL,
    },
  );
}

async function purchaseData(
  body: AnyRecord,
  requestId: string,
): Promise<unknown> {
  return clubKonnectGet(
    "APIDatabundleV1.asp",
    {
      MobileNetwork: firstString(
        body.network_code,
        body.networkCode,
        body.mobile_network,
        body.MobileNetwork,
      ),
      MobileNumber: firstString(
        body.phone,
        body.phoneNumber,
        body.mobile_number,
        body.mobileNumber,
      ),
      DataPlan: firstString(
        body.data_plan,
        body.dataPlan,
        body.plan_code,
        body.planCode,
        body.product_code,
        body.productCode,
        body.item_code,
        body.itemCode,
      ),
      RequestID: requestId,
      CallBackURL: CALLBACK_URL,
    },
  );
}

async function purchaseElectricity(
  body: AnyRecord,
  requestId: string,
): Promise<unknown> {
  return clubKonnectGet(
    "APIElectricityV1.asp",
    {
      ElectricCompany: firstString(
        body.biller_code,
        body.billerCode,
        body.company_code,
        body.companyCode,
        body.electric_company,
        body.ElectricCompany,
      ),
      MeterType: firstString(
        body.meter_type,
        body.meterType,
      ),
      MeterNo: firstString(
        body.meter_number,
        body.meterNumber,
        body.meter_no,
        body.meterNo,
      ),
      Amount: firstNumber(
        body.amount,
        body.selling_amount,
        body.sellingAmount,
      ),
      PhoneNo: firstString(
        body.phone,
        body.phoneNumber,
      ),
      RequestID: requestId,
      CallBackURL: CALLBACK_URL,
    },
  );
}

async function purchaseCable(
  body: AnyRecord,
  requestId: string,
): Promise<unknown> {
  return clubKonnectGet(
    "APICableTVV1.asp",
    {
      CableTV: firstString(
        body.biller_code,
        body.billerCode,
        body.cable_code,
        body.cableCode,
        body.cable_tv,
        body.cableTV,
      ),
      Package: firstString(
        body.package_code,
        body.packageCode,
        body.package,
        body.plan_code,
        body.planCode,
      ),
      SmartCardNo: firstString(
        body.smartcard_number,
        body.smartcardNumber,
        body.smartCardNumber,
        body.smartcard_no,
      ),
      PhoneNo: firstString(
        body.phone,
        body.phoneNumber,
      ),
      RequestID: requestId,
      CallBackURL: CALLBACK_URL,
    },
  );
}

async function purchaseAirtimeCard(
  body: AnyRecord,
  requestId: string,
): Promise<unknown> {
  return clubKonnectGet(
    "APIEPINV1.asp",
    {
      MobileNetwork: firstString(
        body.network_code,
        body.networkCode,
        body.mobile_network,
      ),
      Value: firstNumber(
        body.value,
        body.amount,
        body.provider_price,
        body.providerPrice,
      ),
      Quantity: Math.max(
        1,
        Math.floor(
          firstNumber(body.quantity) || 1,
        ),
      ),
      RequestID: requestId,
      CallBackURL: CALLBACK_URL,
    },
  );
}

async function purchaseDataCard(
  body: AnyRecord,
  requestId: string,
): Promise<unknown> {
  return clubKonnectGet(
    "APIDatabundleEPINV1.asp",
    {
      MobileNetwork: firstString(
        body.network_code,
        body.networkCode,
        body.mobile_network,
      ),
      DataPlan: firstString(
        body.data_plan,
        body.dataPlan,
        body.plan_code,
        body.planCode,
        body.product_code,
        body.productCode,
        body.item_code,
        body.itemCode,
      ),
      Quantity: Math.max(
        1,
        Math.floor(
          firstNumber(body.quantity) || 1,
        ),
      ),
      RequestID: requestId,
      CallBackURL: CALLBACK_URL,
    },
  );
}

async function purchaseSmile(
  body: AnyRecord,
  requestId: string,
): Promise<unknown> {
  return clubKonnectGet(
    "APISmileV1.asp",
    {
      MobileNumber: firstString(
        body.account_id,
        body.accountId,
        body.mobile_number,
        body.mobileNumber,
        body.phone,
      ),
      DataPlan: firstString(
        body.data_plan,
        body.dataPlan,
        body.plan_code,
        body.planCode,
        body.product_code,
        body.productCode,
        body.item_code,
        body.itemCode,
      ),
      RequestID: requestId,
      CallBackURL: CALLBACK_URL,
    },
  );
}

async function purchaseWaec(
  body: AnyRecord,
  requestId: string,
): Promise<unknown> {
  return clubKonnectGet(
    "APIWAECV1.asp",
    {
      ExamType: firstString(
        body.exam_type,
        body.examType,
        body.item_code,
        body.itemCode,
        body.product_code,
        body.productCode,
      ),
      PhoneNo: firstString(
        body.phone,
        body.phoneNumber,
      ),
      RequestID: requestId,
      CallBackURL: CALLBACK_URL,
    },
  );
}

async function purchaseJamb(
  body: AnyRecord,
  requestId: string,
): Promise<unknown> {
  return clubKonnectGet(
    "APIJAMBV1.asp",
    {
      ExamType: firstString(
        body.exam_type,
        body.examType,
        body.item_code,
        body.itemCode,
        body.product_code,
        body.productCode,
        body.plan_code,
        body.planCode,
      ),
      PhoneNo: firstString(
        body.phone,
        body.phoneNumber,
      ),
      RequestID: requestId,
      CallBackURL: CALLBACK_URL,
    },
  );
}

async function purchaseService(
  service: ServiceType,
  body: AnyRecord,
  userId: string,
): Promise<Response> {
  const amount = getPurchaseAmount(
    body,
    service,
  );

  const providerAmount = getProviderAmount(
    body,
    service,
  );

  if (amount <= 0) {
    return json(
      {
        success: false,
        error: "Invalid service amount.",
      },
      400,
    );
  }

  const requestId = generateRequestId(userId);

  let transactionId = "";

  try {
    transactionId = await createPendingTransaction(
      userId,
      service,
      amount,
      {
        ...body,
        provider_amount: providerAmount,
        provider_price: providerAmount,
      },
      requestId,
    );

    await debitWallet(
      userId,
      amount,
      requestId,
    );

    let providerResponse: unknown;

    switch (service) {
      case "airtime":
        providerResponse = await purchaseAirtime(
          body,
          requestId,
        );
        break;

      case "data":
        providerResponse = await purchaseData(
          body,
          requestId,
        );
        break;

      case "electricity":
        providerResponse =
          await purchaseElectricity(
            body,
            requestId,
          );
        break;

      case "cable":
        providerResponse = await purchaseCable(
          body,
          requestId,
        );
        break;

      case "airtime-card":
        providerResponse =
          await purchaseAirtimeCard(
            body,
            requestId,
          );
        break;

      case "data-card":
        providerResponse =
          await purchaseDataCard(
            body,
            requestId,
          );
        break;

      case "smile":
        providerResponse = await purchaseSmile(
          body,
          requestId,
        );
        break;

      case "waec":
        providerResponse = await purchaseWaec(
          body,
          requestId,
        );
        break;

      case "jamb":
        providerResponse = await purchaseJamb(
          body,
          requestId,
        );
        break;

      default:
        throw new Error(
          "Unsupported service.",
        );
    }

    const classified =
      classifyProviderResponse(
        providerResponse,
      );

    if (classified.success) {
      await updateTransaction(
        transactionId,
        {
          status: classified.pending
            ? "pending"
            : "completed",
          provider_reference:
            classified.orderId ||
            classified.requestId ||
            requestId,
          metadata: {
            service,
            request_id: requestId,
            provider_response:
              providerResponse,
            provider_status:
              classified.statusCode,
            provider_amount: providerAmount,
            selling_amount: amount,
          },
        },
      );

      return json({
        success: true,
        pending: classified.pending,
        transactionId,
        reference: requestId,
        orderId:
          classified.orderId ||
          classified.requestId ||
          requestId,
        amount,
        providerAmount,
        service,
        message: classified.message,
        providerResponse,
      });
    }

    await updateTransaction(
      transactionId,
      {
        status: "failed",
        metadata: {
          service,
          request_id: requestId,
          provider_response:
            providerResponse,
          provider_status:
            classified.statusCode,
          provider_amount: providerAmount,
          selling_amount: amount,
        },
      },
    );

    await refundWallet(
      userId,
      amount,
      requestId,
    );

    return json(
      {
        success: false,
        transactionId,
        reference: requestId,
        amount,
        message:
          classified.message ||
          "Service purchase failed. Your wallet has been refunded.",
        providerResponse,
      },
      400,
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Service purchase failed.";

    if (transactionId) {
      await updateTransaction(
        transactionId,
        {
          status: "pending",
          metadata: {
            service,
            request_id: requestId,
            error: message,
            provider_amount: providerAmount,
            selling_amount: amount,
          },
        },
      );
    }

    return json(
      {
        success: false,
        pending: true,
        transactionId: transactionId || null,
        reference: requestId,
        amount,
        message:
          "Your transaction could not be confirmed immediately. It has been left pending for reconciliation.",
      },
      202,
    );
  }
}

async function verifyMeter(
  body: AnyRecord,
): Promise<Response> {
  const company = firstString(
    body.biller_code,
    body.billerCode,
    body.company_code,
    body.companyCode,
    body.electric_company,
    body.ElectricCompany,
  );

  const meterType = firstString(
    body.meter_type,
    body.meterType,
  );

  const meterNumber = firstString(
    body.meter_number,
    body.meterNumber,
    body.meter_no,
    body.meterNo,
  );

  if (!company || !meterType || !meterNumber) {
    return json(
      {
        success: false,
        error:
          "Electricity company, meter type and meter number are required.",
      },
      400,
    );
  }

  const response = await clubKonnectGet(
    "APIVerifyElectricityV1.asp",
    {
      ElectricCompany: company,
      MeterType: meterType,
      MeterNo: meterNumber,
    },
  );

  const record = asRecord(response);

  const customerName = firstString(
    record.customer_name,
    record.customerName,
    record.CustomerName,
    record.name,
    record.Name,
  );

  const invalid =
    customerName.toUpperCase() ===
      "INVALID_METERNO" ||
    customerName.toUpperCase() ===
      "INVALID METERNO";

  return json({
    success: !invalid && Boolean(customerName),
    customer_name: customerName,
    customerName,
    providerResponse: response,
    message: invalid
      ? "Invalid meter number."
      : customerName
        ? "Meter verified successfully."
        : "Unable to verify this meter.",
  });
}

async function verifyCable(
  body: AnyRecord,
): Promise<Response> {
  const cable = firstString(
    body.biller_code,
    body.billerCode,
    body.cable_code,
    body.cableCode,
    body.cable_tv,
    body.cableTV,
  );

  const smartcard = firstString(
    body.smartcard_number,
    body.smartcardNumber,
    body.smartCardNumber,
    body.smartcard_no,
  );

  if (!cable || !smartcard) {
    return json(
      {
        success: false,
        error:
          "Cable provider and smartcard number are required.",
      },
      400,
    );
  }

  const response = await clubKonnectGet(
    "APIVerifyCableTVV1.asp",
    {
      CableTV: cable,
      SmartCardNo: smartcard,
    },
  );

  const record = asRecord(response);

  const customerName = firstString(
    record.customer_name,
    record.customerName,
    record.CustomerName,
    record.name,
    record.Name,
  );

  const invalid =
    customerName.toUpperCase().includes(
      "INVALID",
    );

  return json({
    success: !invalid && Boolean(customerName),
    customer_name: customerName,
    customerName,
    providerResponse: response,
    message: invalid
      ? "Invalid smartcard number."
      : customerName
        ? "Smartcard verified successfully."
        : "Unable to verify this smartcard.",
  });
}

async function providerStatus(
  body: AnyRecord,
): Promise<Response> {
  const orderId = firstString(
    body.order_id,
    body.orderId,
    body.OrderID,
  );

  const requestId = firstString(
    body.request_id,
    body.requestId,
    body.RequestID,
  );

  if (!orderId && !requestId) {
    return json(
      {
        success: false,
        error:
          "Order ID or Request ID is required.",
      },
      400,
    );
  }

  const response = await clubKonnectGet(
    "APIQueryV1.asp",
    {
      OrderID: orderId || undefined,
      RequestID: requestId || undefined,
    },
  );

  const classified =
    classifyProviderResponse(response);

  return json({
    success: true,
    pending: classified.pending,
    status: classified.statusCode,
    message: classified.message,
    orderId:
      classified.orderId || orderId,
    requestId:
      classified.requestId || requestId,
    providerResponse: response,
  });
}

function getAction(value: unknown): ActionType {
  const action = firstString(value)
    .toLowerCase()
    .trim();

  switch (action) {
    case "catalog":
    case "get_catalog":
      return action;

    case "plans":
      return "plans";

    case "purchase":
    case "buy":
    case "pay":
      return "purchase";

    case "verify_meter":
      return "verify_meter";

    case "verify_cable":
      return "verify_cable";

    case "verify_smile":
      return "verify_smile";

    case "status":
    case "check_status":
      return action;

    case "reconcile":
      return "reconcile";

    default:
      return "catalog";
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response(
      "ok",
      {
        headers: corsHeaders,
      },
    );
  }

  try {
    const user = await getUser(request);

    if (!user) {
      return json(
        {
          success: false,
          error: "Unauthorized.",
        },
        401,
      );
    }

    const body =
      (await request.json()) as AnyRecord;

    const action = getAction(body.action);

    if (
      action === "verify_meter"
    ) {
      return await verifyMeter(body);
    }

    if (
      action === "verify_cable"
    ) {
      return await verifyCable(body);
    }

    if (
      action === "status" ||
      action === "check_status"
    ) {
      return await providerStatus(body);
    }

    const service = normalizeService(
      body.service ??
        body.service_type ??
        body.serviceType ??
        body.type,
    );

    if (!service) {
      return json(
        {
          success: false,
          error:
            "A valid service is required.",
          supportedServices:
            SUPPORTED_SERVICES,
        },
        400,
      );
    }

    if (
      !SUPPORTED_SERVICES.includes(service)
    ) {
      return json(
        {
          success: false,
          error:
            "This service is not supported.",
          service,
          supportedServices:
            SUPPORTED_SERVICES,
        },
        400,
      );
    }

    if (
      action === "catalog" ||
      action === "get_catalog" ||
      action === "plans"
    ) {
      const hasNetwork =
        Boolean(
          firstString(
            body.network_code,
            body.networkCode,
            body.mobile_network,
            body.MobileNetwork,
          ),
        );

      const hasBiller =
        Boolean(
          firstString(
            body.biller_code,
            body.billerCode,
            body.company_code,
            body.companyCode,
            body.CableTV,
            body.ElectricCompany,
          ),
        );

      const response =
        hasNetwork || hasBiller
          ? await getNetworkSpecificCatalog(
              service,
              body,
            )
          : await getCatalog(
              service,
              body,
            );

      return json(response);
    }

    if (action === "purchase") {
      return await purchaseService(
        service,
        body,
        user.id,
      );
    }

    if (action === "reconcile") {
      return json({
        success: true,
        message:
          "Reconciliation should be performed through the transaction reconciliation workflow.",
      });
    }

    return json(
      {
        success: false,
        error: "Unsupported action.",
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
            : "Internal server error.",
      },
      500,
    );
  }
});

export default Deno;
