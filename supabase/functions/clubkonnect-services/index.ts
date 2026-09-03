import {
  corsHeaders,
  json,
  adminClient,
  getUser,
} from "../_shared/auth.ts";

/**
 * IyanjuPay
 * ClubKonnect Service Gateway
 *
 * Provider:
 *   ClubKonnect / Nellobyte Systems
 *
 * Customer-facing provider names must NOT be exposed.
 *
 * Supported customer services:
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
 * Intentionally unsupported:
 *   internet
 *   insurance
 *   betting
 *
 * Markup:
 *   Regular services = 15%
 *   Premium services = 20%
 */

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

type TransactionState =
  | "pending"
  | "successful"
  | "failed";

type ProviderState =
  | "success"
  | "pending"
  | "failed"
  | "unknown";

interface ProviderResult {
  state: ProviderState;
  statusCode: string;
  status: string;
  remark?: string;
  orderId?: string;
  requestId?: string;
  raw: Record<string, unknown>;
}

interface CatalogItem {
  id: string;
  name: string;
  service: ServiceType;
  provider_amount: number;
  selling_price: number;
  metadata?: Record<string, unknown>;
}

const CLUBKONNECT_BASE_URL =
  "https://www.nellobytesystems.com";

const SUPABASE_URL =
  Deno.env.get("SUPABASE_URL") ?? "";

const CLUBKONNECT_USER_ID =
  Deno.env.get("CLUBKONNECT_USER_ID") ?? "";

const CLUBKONNECT_API_KEY =
  Deno.env.get("CLUBKONNECT_API_KEY") ?? "";

const CLUBKONNECT_CALLBACK_URL =
  Deno.env.get("CLUBKONNECT_CALLBACK_URL") ||
  (
    SUPABASE_URL
      ? `${SUPABASE_URL}/functions/v1/clubkonnect-webhook`
      : ""
  );

const REGULAR_MARKUP = 0.15;
const PREMIUM_MARKUP = 0.20;

const REGULAR_SERVICES = new Set<ServiceType>([
  "airtime",
  "data",
  "electricity",
  "cable",
]);

const PREMIUM_SERVICES = new Set<ServiceType>([
  "airtime-card",
  "data-card",
  "smile",
  "waec",
  "jamb",
]);

const SUPPORTED_SERVICES = new Set<ServiceType>([
  ...REGULAR_SERVICES,
  ...PREMIUM_SERVICES,
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
  "airtime-epin": "airtime-card",
  epin: "airtime-card",

  "data-card": "data-card",
  datacard: "data-card",
  "data-epin": "data-card",
  "data-epin": "data-card",

  smile: "smile",
  "smile-direct": "smile",

  waec: "waec",
  "waec-epin": "waec",

  jamb: "jamb",
  "jamb-epin": "jamb",
};

const COMING_SOON_SERVICES = new Set([
  "internet",
  "insurance",
]);

function normalizeService(value: unknown): ServiceType | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");

  return SERVICE_ALIASES[normalized] ?? null;
}

function isComingSoonService(value: unknown): boolean {
  if (typeof value !== "string") {
    return false;
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");

  return COMING_SOON_SERVICES.has(normalized);
}

function markupFor(service: ServiceType): number {
  return PREMIUM_SERVICES.has(service)
    ? PREMIUM_MARKUP
    : REGULAR_MARKUP;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function sellingPrice(
  providerAmount: number,
  service: ServiceType,
): number {
  return roundMoney(
    providerAmount * (1 + markupFor(service)),
  );
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const cleaned = value
      .replace(/,/g, "")
      .replace(/[₦]/g, "")
      .trim();

    if (!cleaned) {
      return null;
    }

    const parsed = Number(cleaned);

    return Number.isFinite(parsed)
      ? parsed
      : null;
  }

  return null;
}

function stringValue(value: unknown): string | null {
  if (
    typeof value === "string" &&
    value.trim()
  ) {
    return value.trim();
  }

  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return String(value);
  }

  return null;
}

function objectValue(
  value: unknown,
): Record<string, unknown> | null {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    return value as Record<string, unknown>;
  }

  return null;
}

function arrayValue(
  value: unknown,
): unknown[] {
  return Array.isArray(value)
    ? value
    : [];
}

function normalizePhone(
  value: unknown,
): string {
  if (typeof value !== "string") {
    return "";
  }

  let phone = value
    .trim()
    .replace(/[^\d+]/g, "");

  if (phone.startsWith("+234")) {
    phone = "234" + phone.slice(4);
  } else if (phone.startsWith("234")) {
    // Already international Nigerian format.
  } else if (phone.startsWith("0")) {
    phone = "234" + phone.slice(1);
  }

  return phone;
}

function isValidNigerianPhone(
  value: string,
): boolean {
  return /^234[789]\d{9}$/.test(value);
}

function safeReference(
  value: unknown,
): string {
  if (
    typeof value === "string" &&
    value.trim()
  ) {
    return value
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .slice(0, 100);
  }

  return `IYJ_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
}

function requireCredentials(): void {
  if (
    !CLUBKONNECT_USER_ID ||
    !CLUBKONNECT_API_KEY
  ) {
    throw new Error(
      "ClubKonnect credentials are not configured.",
    );
  }
}

function withCredentials(
  endpoint: string,
  params: Record<string, string | number | undefined>,
): string {
  requireCredentials();

  const url = new URL(
    `${CLUBKONNECT_BASE_URL}/${endpoint}`,
  );

  url.searchParams.set(
    "UserID",
    CLUBKONNECT_USER_ID,
  );

  url.searchParams.set(
    "APIKey",
    CLUBKONNECT_API_KEY,
  );

  for (const [key, value] of Object.entries(params)) {
    if (
      value !== undefined &&
      value !== null &&
      String(value).length > 0
    ) {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

/**
 * Generic ClubKonnect GET request.
 *
 * ClubKonnect documents HTTPS GET + JSON responses.
 */
async function clubKonnectGet(
  endpoint: string,
  params: Record<string, string | number | undefined> = {},
): Promise<Record<string, unknown>> {
  const url = withCredentials(
    endpoint,
    params,
  );

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  const text = await response.text();

  let parsed: unknown;

  try {
    parsed = text
      ? JSON.parse(text)
      : {};
  } catch {
    throw new Error(
      `ClubKonnect returned a non-JSON response (${response.status}).`,
    );
  }

  const object = objectValue(parsed);

  if (!object) {
    throw new Error(
      `Invalid ClubKonnect response (${response.status}).`,
    );
  }

  if (!response.ok) {
    const status =
      stringValue(object.status) ??
      stringValue(object.Status) ??
      `HTTP_${response.status}`;

    throw new Error(
      `ClubKonnect request failed: ${status}`,
    );
  }

  return object;
}

function providerStatusCode(
  response: Record<string, unknown>,
): string {
  return (
    stringValue(response.statuscode) ??
    stringValue(response.statusCode) ??
    stringValue(response.StatusCode) ??
    stringValue(response.code) ??
    stringValue(response.Code) ??
    ""
  );
}

function providerStatus(
  response: Record<string, unknown>,
): string {
  return (
    stringValue(response.status) ??
    stringValue(response.Status) ??
    stringValue(response.orderstatus) ??
    stringValue(response.OrderStatus) ??
    ""
  ).toUpperCase();
}

function providerRemark(
  response: Record<string, unknown>,
): string | undefined {
  return (
    stringValue(response.orderremark) ??
    stringValue(response.OrderRemark) ??
    stringValue(response.remark) ??
    stringValue(response.Remark) ??
    undefined
  );
}

function classifyProviderResponse(
  response: Record<string, unknown>,
): ProviderResult {
  const statusCode =
    providerStatusCode(response);

  const status =
    providerStatus(response);

  const remark =
    providerRemark(response);

  const orderId =
    stringValue(response.orderid) ??
    stringValue(response.OrderID);

  const requestId =
    stringValue(response.requestid) ??
    stringValue(response.RequestID);

  const numericCode =
    Number(statusCode);

  /**
   * ClubKonnect documented:
   *
   * 200 = completed/success
   * 201 = completed but network unresponsive/retry
   * 100 = received
   * 300 = processed / awaiting network
   * 600+ = on hold
   * 500+ = cancelled
   *
   * We therefore never treat 201 as an immediate success.
   */
  if (
    numericCode === 200 ||
    status === "ORDER_COMPLETED"
  ) {
    if (numericCode === 201) {
      return {
        state: "pending",
        statusCode,
        status,
        remark,
        orderId,
        requestId,
        raw: response,
      };
    }

    return {
      state: "success",
      statusCode,
      status,
      remark,
      orderId,
      requestId,
      raw: response,
    };
  }

  if (
    numericCode === 100 ||
    numericCode === 300 ||
    numericCode === 201 ||
    numericCode >= 600
  ) {
    return {
      state: "pending",
      statusCode,
      status,
      remark,
      orderId,
      requestId,
      raw: response,
    };
  }

  if (
    numericCode >= 400 ||
    numericCode === 199 ||
    numericCode === 299 ||
    numericCode === 399 ||
    status.includes("FAILED") ||
    status.includes("CANCEL") ||
    status.includes("INVALID") ||
    status.includes("ERROR")
  ) {
    return {
      state: "failed",
      statusCode,
      status,
      remark,
      orderId,
      requestId,
      raw: response,
    };
  }

  if (
    status === "ORDER_RECEIVED" ||
    status === "ORDER_PROCESSED" ||
    status === "ORDER_ONHOLD"
  ) {
    return {
      state: "pending",
      statusCode,
      status,
      remark,
      orderId,
      requestId,
      raw: response,
    };
  }

  return {
    state: "unknown",
    statusCode,
    status,
    remark,
    orderId,
    requestId,
    raw: response,
  };
}

function extractArray(
  response: Record<string, unknown>,
  keys: string[],
): unknown[] {
  for (const key of keys) {
    const value = response[key];

    if (Array.isArray(value)) {
      return value;
    }

    const nested = objectValue(value);

    if (nested) {
      for (const nestedKey of keys) {
        if (Array.isArray(nested[nestedKey])) {
          return nested[nestedKey] as unknown[];
        }
      }
    }
  }

  return [];
}

function extractString(
  object: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = stringValue(object[key]);

    if (value !== null) {
      return value;
    }
  }

  return null;
}

function extractNumber(
  object: Record<string, unknown>,
  keys: string[],
): number | null {
  for (const key of keys) {
    const value = numberValue(object[key]);

    if (value !== null) {
      return value;
    }
  }

  return null;
}

function makeCatalogItem(
  service: ServiceType,
  id: string,
  name: string,
  providerAmount: number,
  metadata: Record<string, unknown> = {},
): CatalogItem {
  return {
    id,
    name,
    service,
    provider_amount: roundMoney(providerAmount),
    selling_price: sellingPrice(
      providerAmount,
      service,
    ),
    metadata,
  };
}

/* -------------------------------------------------------------------------- */
/* AIRTIME                                                                    */
/* -------------------------------------------------------------------------- */

async function getAirtimeNetworks(): Promise<CatalogItem[]> {
  const response =
    await clubKonnectGet(
      "APIAirtimeNetworkV2.asp",
    );

  const rows = extractArray(
    response,
    [
      "airtime",
      "airtime_networks",
      "networks",
      "data",
      "result",
      "results",
    ],
  );

  const items: CatalogItem[] = [];

  for (const row of rows) {
    const item = objectValue(row);

    if (!item) {
      continue;
    }

    const code =
      extractString(
        item,
        [
          "network",
          "networkcode",
          "network_code",
          "MobileNetwork",
          "mobile_network",
          "code",
          "id",
        ],
      );

    const name =
      extractString(
        item,
        [
          "networkname",
          "network_name",
          "name",
          "NetworkName",
        ],
      );

    if (!code || !name) {
      continue;
    }

    items.push({
      id: code,
      name,
      service: "airtime",
      provider_amount: 0,
      selling_price: 0,
      metadata: {
        network_code: code,
      },
    });
  }

  /**
   * Some ClubKonnect catalogue responses may be returned
   * as an object keyed by network code rather than an array.
   */
  if (items.length === 0) {
    for (const [key, value] of Object.entries(response)) {
      const item = objectValue(value);

      if (!item) {
        continue;
      }

      const name =
        extractString(
          item,
          [
            "networkname",
            "network_name",
            "name",
            "NetworkName",
          ],
        );

      if (!name) {
        continue;
      }

      items.push({
        id: key,
        name,
        service: "airtime",
        provider_amount: 0,
        selling_price: 0,
        metadata: {
          network_code: key,
        },
      });
    }
  }

  return items;
}

/* -------------------------------------------------------------------------- */
/* DATA                                                                       */
/* -------------------------------------------------------------------------- */

async function getDataNetworks(): Promise<CatalogItem[]> {
  const response =
    await clubKonnectGet(
      "APIDatabundleNetworkV2.asp",
    );

  const rows = extractArray(
    response,
    [
      "databundle",
      "data_networks",
      "networks",
      "data",
      "result",
      "results",
    ],
  );

  const items: CatalogItem[] = [];

  for (const row of rows) {
    const item = objectValue(row);

    if (!item) {
      continue;
    }

    const code =
      extractString(
        item,
        [
          "network",
          "networkcode",
          "network_code",
          "MobileNetwork",
          "mobile_network",
          "code",
          "id",
        ],
      );

    const name =
      extractString(
        item,
        [
          "networkname",
          "network_name",
          "name",
          "NetworkName",
        ],
      );

    if (!code || !name) {
      continue;
    }

    items.push({
      id: code,
      name,
      service: "data",
      provider_amount: 0,
      selling_price: 0,
      metadata: {
        network_code: code,
      },
    });
  }

  if (items.length === 0) {
    for (const [key, value] of Object.entries(response)) {
      const item = objectValue(value);

      if (!item) {
        continue;
      }

      const name =
        extractString(
          item,
          [
            "networkname",
            "network_name",
            "name",
            "NetworkName",
          ],
        );

      if (!name) {
        continue;
      }

      items.push({
        id: key,
        name,
        service: "data",
        provider_amount: 0,
        selling_price: 0,
        metadata: {
          network_code: key,
        },
      });
    }
  }

  return items;
}

async function getDataPlans(): Promise<CatalogItem[]> {
  const response =
    await clubKonnectGet(
      "APIDatabundlePlansV2.asp",
    );

  const rows = extractArray(
    response,
    [
      "databundle",
      "databundleplans",
      "data_plans",
      "plans",
      "products",
      "data",
      "result",
      "results",
    ],
  );

  const items: CatalogItem[] = [];

  for (const row of rows) {
    const item = objectValue(row);

    if (!item) {
      continue;
    }

    const productId =
      extractString(
        item,
        [
          "productid",
          "product_id",
          "variation_code",
          "variationcode",
          "planid",
          "plan_id",
          "id",
        ],
      );

    const productName =
      extractString(
        item,
        [
          "productname",
          "product_name",
          "planname",
          "plan_name",
          "name",
          "ProductName",
        ],
      );

    const network =
      extractString(
        item,
        [
          "network",
          "networkcode",
          "network_code",
          "MobileNetwork",
          "mobile_network",
        ],
      );

    const amount =
      extractNumber(
        item,
        [
          "price",
          "amount",
          "sellingprice",
          "selling_price",
          "cost",
          "discountedprice",
          "discounted_price",
        ],
      );

    if (
      !productId ||
      !productName ||
      !amount ||
      amount <= 0
    ) {
      continue;
    }

    items.push(
      makeCatalogItem(
        "data",
        productId,
        productName,
        amount,
        {
          network_code: network,
          raw_plan: item,
        },
      ),
    );
  }

  return items;
}

/* -------------------------------------------------------------------------- */
/* CABLE TV                                                                   */
/* -------------------------------------------------------------------------- */

async function getCableTypes(): Promise<CatalogItem[]> {
  const response =
    await clubKonnectGet(
      "APICableTVTypeV2.asp",
    );

  const rows = extractArray(
    response,
    [
      "cabletv",
      "cable_tv",
      "cabletypes",
      "cable_types",
      "types",
      "providers",
      "data",
      "result",
      "results",
    ],
  );

  const items: CatalogItem[] = [];

  for (const row of rows) {
    const item = objectValue(row);

    if (!item) {
      continue;
    }

    const code =
      extractString(
        item,
        [
          "cabletv",
          "cable_tv",
          "code",
          "id",
          "provider",
        ],
      );

    const name =
      extractString(
        item,
        [
          "cabletvname",
          "cable_tv_name",
          "name",
          "providername",
          "provider_name",
        ],
      );

    if (!code || !name) {
      continue;
    }

    items.push({
      id: code,
      name,
      service: "cable",
      provider_amount: 0,
      selling_price: 0,
      metadata: {
        cable_code: code,
      },
    });
  }

  return items;
}

async function getCablePackages(): Promise<CatalogItem[]> {
  const response =
    await clubKonnectGet(
      "APICableTVPackagesV2.asp",
    );

  const rows = extractArray(
    response,
    [
      "cabletvpackages",
      "cable_packages",
      "packages",
      "products",
      "data",
      "result",
      "results",
    ],
  );

  const items: CatalogItem[] = [];

  for (const row of rows) {
    const item = objectValue(row);

    if (!item) {
      continue;
    }

    const packageId =
      extractString(
        item,
        [
          "package",
          "packagecode",
          "package_code",
          "packageid",
          "package_id",
          "variation_code",
          "id",
        ],
      );

    const name =
      extractString(
        item,
        [
          "packagename",
          "package_name",
          "name",
          "productname",
          "product_name",
        ],
      );

    const amount =
      extractNumber(
        item,
        [
          "amount",
          "price",
          "sellingprice",
          "selling_price",
          "cost",
        ],
      );

    const cable =
      extractString(
        item,
        [
          "cabletv",
          "cable_tv",
          "provider",
          "cablecode",
          "cable_code",
        ],
      );

    if (
      !packageId ||
      !name ||
      amount === null ||
      amount <= 0
    ) {
      continue;
    }

    items.push(
      makeCatalogItem(
        "cable",
        packageId,
        name,
        amount,
        {
          cable_code: cable,
          raw_package: item,
        },
      ),
    );
  }

  return items;
}

/* -------------------------------------------------------------------------- */
/* ELECTRICITY                                                                */
/* -------------------------------------------------------------------------- */

/**
 * ClubKonnect's electricity documentation exposes the
 * available electricity companies dynamically.
 *
 * The purchase and verification endpoints are documented,
 * while the catalogue is account/live-data dependent.
 *
 * We therefore allow a caller to supply the company code
 * instead of fabricating a catalogue.
 */
async function verifyElectricityMeter(
  company: string,
  meterNumber: string,
  meterType: string,
): Promise<Record<string, unknown>> {
  return clubKonnectGet(
    "APIVerifyElectricityV1.asp",
    {
      ElectricCompany: company,
      MeterNo: meterNumber,
      MeterType: meterType,
    },
  );
}

/* -------------------------------------------------------------------------- */
/* SMILE                                                                      */
/* -------------------------------------------------------------------------- */

async function getSmilePackages(): Promise<CatalogItem[]> {
  const response =
    await clubKonnectGet(
      "APISmilePackagesV2.asp",
    );

  const rows = extractArray(
    response,
    [
      "smile",
      "smilepackages",
      "smile_packages",
      "packages",
      "products",
      "data",
      "result",
      "results",
    ],
  );

  const items: CatalogItem[] = [];

  for (const row of rows) {
    const item = objectValue(row);

    if (!item) {
      continue;
    }

    const id =
      extractString(
        item,
        [
          "productid",
          "product_id",
          "variation_code",
          "variationcode",
          "package",
          "packageid",
          "id",
        ],
      );

    const name =
      extractString(
        item,
        [
          "productname",
          "product_name",
          "packagename",
          "package_name",
          "name",
        ],
      );

    const amount =
      extractNumber(
        item,
        [
          "amount",
          "price",
          "sellingprice",
          "selling_price",
          "cost",
        ],
      );

    if (
      !id ||
      !name ||
      amount === null ||
      amount <= 0
    ) {
      continue;
    }

    items.push(
      makeCatalogItem(
        "smile",
        id,
        name,
        amount,
        {
          network_code: "smile-direct",
          raw_package: item,
        },
      ),
    );
  }

  return items;
}

/* -------------------------------------------------------------------------- */
/* WAEC                                                                       */
/* -------------------------------------------------------------------------- */

async function getWaecPackages(): Promise<CatalogItem[]> {
  const response =
    await clubKonnectGet(
      "APIWAECPackagesV2.asp",
    );

  const rows = extractArray(
    response,
    [
      "waec",
      "waecpackages",
      "waec_packages",
      "packages",
      "products",
      "data",
      "result",
      "results",
    ],
  );

  const items: CatalogItem[] = [];

  for (const row of rows) {
    const item = objectValue(row);

    if (!item) {
      continue;
    }

    const id =
      extractString(
        item,
        [
          "examtype",
          "exam_type",
          "productid",
          "product_id",
          "package",
          "packageid",
          "id",
        ],
      );

    const name =
      extractString(
        item,
        [
          "productname",
          "product_name",
          "packagename",
          "package_name",
          "name",
        ],
      );

    const amount =
      extractNumber(
        item,
        [
          "amount",
          "price",
          "sellingprice",
          "selling_price",
          "cost",
        ],
      );

    if (
      !id ||
      !name ||
      amount === null ||
      amount <= 0
    ) {
      continue;
    }

    items.push(
      makeCatalogItem(
        "waec",
        id,
        name,
        amount,
        {
          raw_package: item,
        },
      ),
    );
  }

  return items;
}

/* -------------------------------------------------------------------------- */
/* JAMB                                                                       */
/* -------------------------------------------------------------------------- */

async function getJambPackages(): Promise<CatalogItem[]> {
  const response =
    await clubKonnectGet(
      "APIJAMBPackagesV2.asp",
    );

  const rows = extractArray(
    response,
    [
      "jamb",
      "jambpackages",
      "jamb_packages",
      "packages",
      "products",
      "data",
      "result",
      "results",
    ],
  );

  const items: CatalogItem[] = [];

  for (const row of rows) {
    const item = objectValue(row);

    if (!item) {
      continue;
    }

    const id =
      extractString(
        item,
        [
          "examtype",
          "exam_type",
          "productid",
          "product_id",
          "package",
          "packageid",
          "id",
        ],
      );

    const name =
      extractString(
        item,
        [
          "productname",
          "product_name",
          "packagename",
          "package_name",
          "name",
        ],
      );

    const amount =
      extractNumber(
        item,
        [
          "amount",
          "price",
          "sellingprice",
          "selling_price",
          "cost",
        ],
      );

    if (
      !id ||
      !name ||
      amount === null ||
      amount <= 0
    ) {
      continue;
    }

    items.push(
      makeCatalogItem(
        "jamb",
        id,
        name,
        amount,
        {
          raw_package: item,
        },
      ),
    );
  }

  return items;
}

/* -------------------------------------------------------------------------- */
/* AIRTIME E-PIN                                                              */
/* -------------------------------------------------------------------------- */

async function getAirtimePinCatalog(): Promise<CatalogItem[]> {
  const response =
    await clubKonnectGet(
      "APIEPINDiscountV2.asp",
    );

  const rows = extractArray(
    response,
    [
      "epin",
      "airtime_epin",
      "airtimeepin",
      "products",
      "data",
      "result",
      "results",
    ],
  );

  const items: CatalogItem[] = [];

  for (const row of rows) {
    const item = objectValue(row);

    if (!item) {
      continue;
    }

    const network =
      extractString(
        item,
        [
          "mobilenetwork",
          "mobile_network",
          "network",
          "networkcode",
          "network_code",
        ],
      );

    const value =
      extractNumber(
        item,
        [
          "value",
          "facevalue",
          "face_value",
          "amount",
        ],
      );

    const discount =
      extractNumber(
        item,
        [
          "discount",
          "discountamount",
          "discount_amount",
        ],
      );

    if (
      !network ||
      value === null ||
      value <= 0
    ) {
      continue;
    }

    /**
     * For e-PIN we treat the actual provider purchase
     * amount as the amount required for the PIN.
     *
     * If ClubKonnect exposes a discounted provider amount,
     * use it; otherwise use face value.
     */
    const providerAmount =
      discount !== null &&
      discount > 0 &&
      discount < value
        ? roundMoney(value - discount)
        : value;

    items.push(
      makeCatalogItem(
        "airtime-card",
        `${network}_${value}`,
        `${network} ₦${value} Airtime PIN`,
        providerAmount,
        {
          network_code: network,
          face_value: value,
          discount,
          raw_product: item,
        },
      ),
    );
  }

  return items;
}

/* -------------------------------------------------------------------------- */
/* DATA E-PIN                                                                 */
/* -------------------------------------------------------------------------- */

async function getDataPinCatalog(): Promise<CatalogItem[]> {
  const plans =
    await getDataPlans();

  return plans.map((plan) => ({
    ...plan,
    service: "data-card",
    id: `DATA_EPIN_${plan.id}`,
    selling_price: sellingPrice(
      plan.provider_amount,
      "data-card",
    ),
    metadata: {
      ...(plan.metadata ?? {}),
      source_service: "data",
      epin: true,
    },
  }));
}

/* -------------------------------------------------------------------------- */
/* CATALOG                                                                    */
/* -------------------------------------------------------------------------- */

async function getCatalog(
  service: ServiceType,
): Promise<CatalogItem[]> {
  switch (service) {
    case "airtime":
      return getAirtimeNetworks();

    case "data": {
      const [
        networks,
        plans,
      ] = await Promise.all([
        getDataNetworks(),
        getDataPlans(),
      ]);

      return [
        ...networks,
        ...plans,
      ];
    }

    case "cable": {
      const [
        types,
        packages,
      ] = await Promise.all([
        getCableTypes(),
        getCablePackages(),
      ]);

      return [
        ...types,
        ...packages,
      ];
    }

    case "electricity":
      /**
       * Electricity companies are live/account-dependent.
       * We do not fabricate company codes.
       *
       * The frontend can use a known company code supplied
       * by its service configuration, while meter verification
       * happens through ClubKonnect before payment.
       */
      return [];

    case "airtime-card":
      return getAirtimePinCatalog();

    case "data-card":
      return getDataPinCatalog();

    case "smile":
      return getSmilePackages();

    case "waec":
      return getWaecPackages();

    case "jamb":
      return getJambPackages();

    default:
      return [];
  }
}

/* -------------------------------------------------------------------------- */
/* PROVIDER PURCHASES                                                         */
/* -------------------------------------------------------------------------- */

async function purchaseAirtime(args: {
  network: string;
  phone: string;
  amount: number;
  requestId: string;
}): Promise<ProviderResult> {
  const response =
    await clubKonnectGet(
      "APIAirtimeV1.asp",
      {
        MobileNetwork: args.network,
        Amount: args.amount,
        MobileNumber: args.phone,
        RequestID: args.requestId,
        CallBackURL:
          CLUBKONNECT_CALLBACK_URL || undefined,
      },
    );

  return classifyProviderResponse(
    response,
  );
}

async function purchaseData(args: {
  network: string;
  plan: string;
  phone: string;
  requestId: string;
  epin?: boolean;
}): Promise<ProviderResult> {
  const endpoint = args.epin
    ? "APIDatabundleEPINV1.asp"
    : "APIDatabundleV1.asp";

  const params: Record<
    string,
    string | number | undefined
  > = {
    MobileNetwork: args.network,
    DataPlan: args.plan,
    RequestID: args.requestId,
    CallBackURL:
      CLUBKONNECT_CALLBACK_URL || undefined,
  };

  if (args.epin) {
    params.Quantity = 1;
  } else {
    params.MobileNumber = args.phone;
  }

  const response =
    await clubKonnectGet(
      endpoint,
      params,
    );

  return classifyProviderResponse(
    response,
  );
}

async function purchaseElectricity(args: {
  company: string;
  meterType: string;
  meterNumber: string;
  amount: number;
  phone: string;
  requestId: string;
}): Promise<ProviderResult> {
  const response =
    await clubKonnectGet(
      "APIElectricityV1.asp",
      {
        ElectricCompany: args.company,
        MeterType: args.meterType,
        MeterNo: args.meterNumber,
        Amount: args.amount,
        PhoneNo: args.phone,
        RequestID: args.requestId,
        CallBackURL:
          CLUBKONNECT_CALLBACK_URL || undefined,
      },
    );

  return classifyProviderResponse(
    response,
  );
}

async function purchaseCable(args: {
  cable: string;
  packageCode: string;
  smartCard: string;
  phone: string;
  requestId: string;
}): Promise<ProviderResult> {
  const response =
    await clubKonnectGet(
      "APICableTVV1.asp",
      {
        CableTV: args.cable,
        Package: args.packageCode,
        SmartCardNo: args.smartCard,
        PhoneNo: args.phone,
        RequestID: args.requestId,
        CallBackURL:
          CLUBKONNECT_CALLBACK_URL || undefined,
      },
    );

  return classifyProviderResponse(
    response,
  );
}

async function purchaseAirtimePin(args: {
  network: string;
  value: number;
  quantity: number;
  requestId: string;
}): Promise<ProviderResult> {
  const response =
    await clubKonnectGet(
      "APIEPINV1.asp",
      {
        MobileNetwork: args.network,
        Value: args.value,
        Quantity: args.quantity,
        RequestID: args.requestId,
        CallBackURL:
          CLUBKONNECT_CALLBACK_URL || undefined,
      },
    );

  return classifyProviderResponse(
    response,
  );
}

async function purchaseDataPin(args: {
  network: string;
  plan: string;
  quantity: number;
  requestId: string;
}): Promise<ProviderResult> {
  const response =
    await clubKonnectGet(
      "APIDatabundleEPINV1.asp",
      {
        MobileNetwork: args.network,
        DataPlan: args.plan,
        Quantity: args.quantity,
        RequestID: args.requestId,
        CallBackURL:
          CLUBKONNECT_CALLBACK_URL || undefined,
      },
    );

  return classifyProviderResponse(
    response,
  );
}

async function purchaseSmile(args: {
  account: string;
  plan: string;
  requestId: string;
}): Promise<ProviderResult> {
  const response =
    await clubKonnectGet(
      "APISmileV1.asp",
      {
        MobileNetwork: "smile-direct",
        DataPlan: args.plan,
        MobileNumber: args.account,
        RequestID: args.requestId,
        CallBackURL:
          CLUBKONNECT_CALLBACK_URL || undefined,
      },
    );

  return classifyProviderResponse(
    response,
  );
}

async function purchaseWaec(args: {
  examType: string;
  phone: string;
  requestId: string;
}): Promise<ProviderResult> {
  const response =
    await clubKonnectGet(
      "APIWAECV1.asp",
      {
        ExamType: args.examType,
        PhoneNo: args.phone,
        RequestID: args.requestId,
        CallBackURL:
          CLUBKONNECT_CALLBACK_URL || undefined,
      },
    );

  return classifyProviderResponse(
    response,
  );
}

async function purchaseJamb(args: {
  examType: string;
  phone: string;
  requestId: string;
}): Promise<ProviderResult> {
  const response =
    await clubKonnectGet(
      "APIJAMBV1.asp",
      {
        ExamType: args.examType,
        PhoneNo: args.phone,
        RequestID: args.requestId,
        CallBackURL:
          CLUBKONNECT_CALLBACK_URL || undefined,
      },
    );

  return classifyProviderResponse(
    response,
  );
}

/* -------------------------------------------------------------------------- */
/* STATUS / RECONCILIATION                                                    */
/* -------------------------------------------------------------------------- */

async function queryProviderTransaction(args: {
  orderId?: string;
  requestId?: string;
}): Promise<ProviderResult> {
  if (!args.orderId && !args.requestId) {
    throw new Error(
      "Provider order ID or request ID is required.",
    );
  }

  const response =
    await clubKonnectGet(
      "APIQueryV1.asp",
      args.orderId
        ? {
            OrderID: args.orderId,
          }
        : {
            RequestID: args.requestId,
          },
    );

  return classifyProviderResponse(
    response,
  );
}

async function cancelProviderOrder(
  orderId: string,
): Promise<Record<string, unknown>> {
  return clubKonnectGet(
    "APICancelV1.asp",
    {
      OrderID: orderId,
    },
  );
}

/* -------------------------------------------------------------------------- */
/* FULFILLMENT                                                                */
/* -------------------------------------------------------------------------- */

function extractFulfillment(
  service: ServiceType,
  response: Record<string, unknown>,
): Record<string, unknown> | null {
  if (
    service === "airtime-card"
  ) {
    const pins =
      extractArray(
        response,
        [
          "TXN_EPIN",
          "txn_epin",
          "EPIN",
          "epin",
        ],
      );

    if (pins.length > 0) {
      return {
        type: "airtime_epin",
        items: pins,
      };
    }
  }

  if (
    service === "data-card"
  ) {
    const pins =
      extractArray(
        response,
        [
          "TXN_EPIN_DATABUNDLE",
          "txn_epin_databundle",
          "EPIN_DATABUNDLE",
          "epin_databundle",
        ],
      );

    if (pins.length > 0) {
      return {
        type: "data_epin",
        items: pins,
      };
    }
  }

  if (
    service === "waec" ||
    service === "jamb"
  ) {
    const cardDetails =
      response.carddetails ??
      response.cardDetails ??
      response.CardDetails;

    if (cardDetails !== undefined) {
      return {
        type: service,
        carddetails: cardDetails,
      };
    }
  }

  if (
    service === "electricity"
  ) {
    const token =
      extractString(
        response,
        [
          "metertoken",
          "meter_token",
          "token",
          "token_number",
        ],
      );

    if (token) {
      return {
        type: "electricity",
        meter_token: token,
      };
    }
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* WALLET HELPERS                                                             */
/* -------------------------------------------------------------------------- */

async function debitWallet(args: {
  userId: string;
  amount: number;
  reference: string;
  description: string;
}): Promise<Record<string, unknown>> {
  const { data, error } =
    await adminClient.rpc(
      "debit_wallet",
      {
        p_user_id: args.userId,
        p_amount: args.amount,
        p_reference: args.reference,
        p_description: args.description,
      },
    );

  if (error) {
    throw new Error(
      error.message ||
        "Unable to debit wallet.",
    );
  }

  const result =
    objectValue(data);

  if (
    result &&
    (
      result.success === false ||
      result.ok === false
    )
  ) {
    throw new Error(
      stringValue(result.message) ||
        "Wallet debit failed.",
    );
  }

  return result ?? {
    success: true,
  };
}

async function refundWallet(args: {
  userId: string;
  amount: number;
  reference: string;
  description: string;
}): Promise<void> {
  const { error } =
    await adminClient.rpc(
      "refund_wallet",
      {
        p_user_id: args.userId,
        p_amount: args.amount,
        p_reference: args.reference,
        p_description: args.description,
      },
    );

  if (error) {
    throw new Error(
      error.message ||
        "Wallet refund failed.",
    );
  }
}

/* -------------------------------------------------------------------------- */
/* TRANSACTION HELPERS                                                        */
/* -------------------------------------------------------------------------- */

async function createTransaction(args: {
  userId: string;
  reference: string;
  service: ServiceType;
  amount: number;
  providerAmount: number;
  metadata: Record<string, unknown>;
}): Promise<void> {
  const { error } =
    await adminClient
      .from("transactions")
      .insert({
        user_id: args.userId,
        reference_number: args.reference,
        transaction_type: "service_payment",
        amount: args.amount,
        status: "pending",
        provider: "clubkonnect",
        provider_reference: null,
        metadata: {
          service: args.service,
          provider_amount:
            args.providerAmount,
          ...args.metadata,
        },
      });

  if (error) {
    throw new Error(
      error.message ||
        "Unable to create transaction.",
    );
  }
}

async function updateTransaction(
  reference: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } =
    await adminClient
      .from("transactions")
      .update(patch)
      .eq(
        "reference_number",
        reference,
      );

  if (error) {
    throw new Error(
      error.message ||
        "Unable to update transaction.",
    );
  }
}

async function getTransaction(
  userId: string,
  reference: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } =
    await adminClient
      .from("transactions")
      .select("*")
      .eq("user_id", userId)
      .eq(
        "reference_number",
        reference,
      )
      .maybeSingle();

  if (error) {
    throw new Error(
      error.message ||
        "Unable to load transaction.",
    );
  }

  return objectValue(data);
}

/* -------------------------------------------------------------------------- */
/* PURCHASE VALIDATION                                                        */
/* -------------------------------------------------------------------------- */

function requirePositiveAmount(
  value: unknown,
  field = "amount",
): number {
  const amount =
    numberValue(value);

  if (
    amount === null ||
    amount <= 0
  ) {
    throw new Error(
      `${field} must be greater than zero.`,
    );
  }

  return roundMoney(amount);
}

function requireString(
  value: unknown,
  field: string,
): string {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new Error(
      `${field} is required.`,
    );
  }

  return value.trim();
}

/* -------------------------------------------------------------------------- */
/* PURCHASE                                                                   */
/* -------------------------------------------------------------------------- */

async function purchaseService(
  userId: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const serviceInput =
    body.service ??
    body.service_type ??
    body.type;

  if (isComingSoonService(serviceInput)) {
    return {
      success: false,
      status: "coming_soon",
      message:
        "This service is coming soon.",
    };
  }

  const service =
    normalizeService(serviceInput);

  if (!service) {
    throw new Error(
      "Unsupported service.",
    );
  }

  if (
    !SUPPORTED_SERVICES.has(service)
  ) {
    throw new Error(
      "Unsupported service.",
    );
  }

  const reference =
    safeReference(
      body.reference ??
      body.request_id ??
      body.requestId,
    );

  const requestId =
    reference;

  let providerAmount = 0;
  let total = 0;

  let providerResult:
    ProviderResult | null = null;

  let metadata:
    Record<string, unknown> = {};

  /* ------------------------------ AIRTIME ------------------------------ */

  if (service === "airtime") {
    const network =
      requireString(
        body.network ??
        body.mobile_network ??
        body.network_code,
        "network",
      );

    const phone =
      normalizePhone(
        body.phone ??
        body.phone_number ??
        body.mobile_number,
      );

    if (
      !isValidNigerianPhone(phone)
    ) {
      throw new Error(
        "A valid Nigerian phone number is required.",
      );
    }

    providerAmount =
      requirePositiveAmount(
        body.amount,
      );

    total =
      sellingPrice(
        providerAmount,
        service,
      );

    metadata = {
      network_code: network,
      phone,
    };

    await createTransaction({
      userId,
      reference,
      service,
      amount: total,
      providerAmount,
      metadata,
    });

    await debitWallet({
      userId,
      amount: total,
      reference,
      description:
        "Airtime purchase",
    });

    try {
      providerResult =
        await purchaseAirtime({
          network,
          phone,
          amount: providerAmount,
          requestId,
        });
    } catch (error) {
      /**
       * Network/timeout errors are deliberately NOT refunded
       * immediately because ClubKonnect may have received
       * the order.
       */
      await updateTransaction(
        reference,
        {
          status: "pending",
          metadata: {
            ...metadata,
            provider_state: "unknown",
            provider_error:
              error instanceof Error
                ? error.message
                : "Provider request failed.",
          },
        },
      );

      return {
        success: true,
        status: "pending",
        reference,
        message:
          "Your airtime request is being processed.",
      };
    }
  }

  /* -------------------------------- DATA -------------------------------- */

  if (service === "data") {
    const network =
      requireString(
        body.network ??
        body.mobile_network ??
        body.network_code,
        "network",
      );

    const plan =
      requireString(
        body.plan ??
        body.data_plan ??
        body.product_id ??
        body.variation_code,
        "data plan",
      );

    const phone =
      normalizePhone(
        body.phone ??
        body.phone_number ??
        body.mobile_number,
      );

    if (
      !isValidNigerianPhone(phone)
    ) {
      throw new Error(
        "A valid Nigerian phone number is required.",
      );
    }

    providerAmount =
      requirePositiveAmount(
        body.provider_amount ??
        body.amount ??
        body.price,
      );

    total =
      sellingPrice(
        providerAmount,
        service,
      );

    metadata = {
      network_code: network,
      plan,
      phone,
    };

    await createTransaction({
      userId,
      reference,
      service,
      amount: total,
      providerAmount,
      metadata,
    });

    await debitWallet({
      userId,
      amount: total,
      reference,
      description:
        "Data purchase",
    });

    try {
      providerResult =
        await purchaseData({
          network,
          plan,
          phone,
          requestId,
        });
    } catch (error) {
      await updateTransaction(
        reference,
        {
          status: "pending",
          metadata: {
            ...metadata,
            provider_state: "unknown",
            provider_error:
              error instanceof Error
                ? error.message
                : "Provider request failed.",
          },
        },
      );

      return {
        success: true,
        status: "pending",
        reference,
        message:
          "Your data request is being processed.",
      };
    }
  }

  /* ---------------------------- ELECTRICITY ---------------------------- */

  if (service === "electricity") {
    const company =
      requireString(
        body.company ??
        body.electric_company ??
        body.electricity_company ??
        body.disco,
        "electricity company",
      );

    const meterType =
      requireString(
        body.meter_type ??
        body.meterType,
        "meter type",
      );

    const meterNumber =
      requireString(
        body.meter_number ??
        body.meterNo ??
        body.meter,
        "meter number",
      );

    const phone =
      normalizePhone(
        body.phone ??
        body.phone_number,
      );

    if (
      phone &&
      !isValidNigerianPhone(phone)
    ) {
      throw new Error(
        "A valid Nigerian phone number is required.",
      );
    }

    providerAmount =
      requirePositiveAmount(
        body.amount,
      );

    total =
      sellingPrice(
        providerAmount,
        service,
      );

    metadata = {
      electric_company: company,
      meter_type: meterType,
      meter_number: meterNumber,
      phone,
    };

    /**
     * Verify the meter before taking the user's money.
     */
    let verification:
      Record<string, unknown>;

    try {
      verification =
        await verifyElectricityMeter(
          company,
          meterNumber,
          meterType,
        );
    } catch (error) {
      throw new Error(
        error instanceof Error
          ? error.message
          : "Unable to verify electricity meter.",
      );
    }

    const customerName =
      stringValue(
        verification.customer_name,
      );

    if (
      !customerName ||
      customerName.toUpperCase() ===
        "INVALID_METERNO"
    ) {
      throw new Error(
        "The electricity meter number could not be verified.",
      );
    }

    metadata.customer_name =
      customerName;

    await createTransaction({
      userId,
      reference,
      service,
      amount: total,
      providerAmount,
      metadata,
    });

    await debitWallet({
      userId,
      amount: total,
      reference,
      description:
        "Electricity bill payment",
    });

    try {
      providerResult =
        await purchaseElectricity({
          company,
          meterType,
          meterNumber,
          amount: providerAmount,
          phone,
          requestId,
        });
    } catch (error) {
      await updateTransaction(
        reference,
        {
          status: "pending",
          metadata: {
            ...metadata,
            provider_state: "unknown",
            provider_error:
              error instanceof Error
                ? error.message
                : "Provider request failed.",
          },
        },
      );

      return {
        success: true,
        status: "pending",
        reference,
        customer_name:
          customerName,
        message:
          "Your electricity payment is being processed.",
      };
    }
  }

  /* -------------------------------- CABLE ------------------------------- */

  if (service === "cable") {
    const cable =
      requireString(
        body.cable ??
        body.cable_tv ??
        body.cableTV ??
        body.provider,
        "cable service",
      );

    const packageCode =
      requireString(
        body.package ??
        body.package_code ??
        body.package_id ??
        body.variation_code,
        "package",
      );

    const smartCard =
      requireString(
        body.smartcard ??
        body.smart_card ??
        body.smartcard_number ??
        body.smartCardNo,
        "smartcard number",
      );

    const phone =
      normalizePhone(
        body.phone ??
        body.phone_number,
      );

    if (
      phone &&
      !isValidNigerianPhone(phone)
    ) {
      throw new Error(
        "A valid Nigerian phone number is required.",
      );
    }

    providerAmount =
      requirePositiveAmount(
        body.provider_amount ??
        body.amount ??
        body.price,
      );

    total =
      sellingPrice(
        providerAmount,
        service,
      );

    metadata = {
      cable_code: cable,
      package_code: packageCode,
      smartcard: smartCard,
      phone,
    };

    await createTransaction({
      userId,
      reference,
      service,
      amount: total,
      providerAmount,
      metadata,
    });

    await debitWallet({
      userId,
      amount: total,
      reference,
      description:
        "Cable TV subscription",
    });

    try {
      providerResult =
        await purchaseCable({
          cable,
          packageCode,
          smartCard,
          phone,
          requestId,
        });
    } catch (error) {
      await updateTransaction(
        reference,
        {
          status: "pending",
          metadata: {
            ...metadata,
            provider_state: "unknown",
            provider_error:
              error instanceof Error
                ? error.message
                : "Provider request failed.",
          },
        },
      );

      return {
        success: true,
        status: "pending",
        reference,
        message:
          "Your cable subscription is being processed.",
      };
    }
  }

  /* --------------------------- AIRTIME E-PIN --------------------------- */

  if (
    service === "airtime-card"
  ) {
    const network =
      requireString(
        body.network ??
        body.mobile_network ??
        body.network_code,
        "network",
      );

    const value =
      requirePositiveAmount(
        body.value ??
        body.amount ??
        body.face_value,
        "value",
      );

    const quantity =
      Math.max(
        1,
        Math.min(
          100,
          Math.floor(
            numberValue(
              body.quantity,
            ) ?? 1,
          ),
        ),
      );

    /**
     * For Airtime PINs the provider receives face value.
     * ClubKonnect may discount its own cost internally.
     */
    providerAmount =
      roundMoney(
        value * quantity,
      );

    total =
      sellingPrice(
        providerAmount,
        service,
      );

    metadata = {
      network_code: network,
      face_value: value,
      quantity,
    };

    await createTransaction({
      userId,
      reference,
      service,
      amount: total,
      providerAmount,
      metadata,
    });

    await debitWallet({
      userId,
      amount: total,
      reference,
      description:
        "Airtime PIN purchase",
    });

    try {
      providerResult =
        await purchaseAirtimePin({
          network,
          value,
          quantity,
          requestId,
        });
    } catch (error) {
      await updateTransaction(
        reference,
        {
          status: "pending",
          metadata: {
            ...metadata,
            provider_state: "unknown",
            provider_error:
              error instanceof Error
                ? error.message
                : "Provider request failed.",
          },
        },
      );

      return {
        success: true,
        status: "pending",
        reference,
        message:
          "Your airtime PIN request is being processed.",
      };
    }
  }

  /* ----------------------------- DATA E-PIN ---------------------------- */

  if (
    service === "data-card"
  ) {
    const network =
      requireString(
        body.network ??
        body.mobile_network ??
        body.network_code,
        "network",
      );

    const plan =
      requireString(
        body.plan ??
        body.data_plan ??
        body.product_id ??
        body.variation_code,
        "data plan",
      );

    const quantity =
      Math.max(
        1,
        Math.min(
          100,
          Math.floor(
            numberValue(
              body.quantity,
            ) ?? 1,
          ),
        ),
      );

    providerAmount =
      requirePositiveAmount(
        body.provider_amount ??
        body.amount ??
        body.price,
      );

    providerAmount =
      roundMoney(
        providerAmount * quantity,
      );

    total =
      sellingPrice(
        providerAmount,
        service,
      );

    metadata = {
      network_code: network,
      plan,
      quantity,
    };

    await createTransaction({
      userId,
      reference,
      service,
      amount: total,
      providerAmount,
      metadata,
    });

    await debitWallet({
      userId,
      amount: total,
      reference,
      description:
        "Data PIN purchase",
    });

    try {
      providerResult =
        await purchaseDataPin({
          network,
          plan,
          quantity,
          requestId,
        });
    } catch (error) {
      await updateTransaction(
        reference,
        {
          status: "pending",
          metadata: {
            ...metadata,
            provider_state: "unknown",
            provider_error:
              error instanceof Error
                ? error.message
                : "Provider request failed.",
          },
        },
      );

      return {
        success: true,
        status: "pending",
        reference,
        message:
          "Your data PIN request is being processed.",
      };
    }
  }

  /* -------------------------------- SMILE ------------------------------- */

  if (service === "smile") {
    const account =
      requireString(
        body.account ??
        body.account_id ??
        body.mobile_number ??
        body.phone,
        "Smile account",
      );

    const plan =
      requireString(
        body.plan ??
        body.data_plan ??
        body.product_id ??
        body.variation_code,
        "Smile plan",
      );

    providerAmount =
      requirePositiveAmount(
        body.provider_amount ??
        body.amount ??
        body.price,
      );

    total =
      sellingPrice(
        providerAmount,
        service,
      );

    metadata = {
      account,
      plan,
    };

    await createTransaction({
      userId,
      reference,
      service,
      amount: total,
      providerAmount,
      metadata,
    });

    await debitWallet({
      userId,
      amount: total,
      reference,
      description:
        "Smile data purchase",
    });

    try {
      providerResult =
        await purchaseSmile({
          account,
          plan,
          requestId,
        });
    } catch (error) {
      await updateTransaction(
        reference,
        {
          status: "pending",
          metadata: {
            ...metadata,
            provider_state: "unknown",
            provider_error:
              error instanceof Error
                ? error.message
                : "Provider request failed.",
          },
        },
      );

      return {
        success: true,
        status: "pending",
        reference,
        message:
          "Your Smile request is being processed.",
      };
    }
  }

  /* -------------------------------- WAEC -------------------------------- */

  if (service === "waec") {
    const examType =
      requireString(
        body.exam_type ??
        body.examType ??
        body.plan ??
        body.product_id,
        "WAEC package",
      );

    const phone =
      normalizePhone(
        body.phone ??
        body.phone_number,
      );

    if (
      !isValidNigerianPhone(phone)
    ) {
      throw new Error(
        "A valid Nigerian phone number is required.",
      );
    }

    providerAmount =
      requirePositiveAmount(
        body.provider_amount ??
        body.amount ??
        body.price,
      );

    total =
      sellingPrice(
        providerAmount,
        service,
      );

    metadata = {
      exam_type: examType,
      phone,
    };

    await createTransaction({
      userId,
      reference,
      service,
      amount: total,
      providerAmount,
      metadata,
    });

    await debitWallet({
      userId,
      amount: total,
      reference,
      description:
        "WAEC PIN purchase",
    });

    try {
      providerResult =
        await purchaseWaec({
          examType,
          phone,
          requestId,
        });
    } catch (error) {
      await updateTransaction(
        reference,
        {
          status: "pending",
          metadata: {
            ...metadata,
            provider_state: "unknown",
            provider_error:
              error instanceof Error
                ? error.message
                : "Provider request failed.",
          },
        },
      );

      return {
        success: true,
        status: "pending",
        reference,
        message:
          "Your WAEC PIN request is being processed.",
      };
    }
  }

  /* -------------------------------- JAMB -------------------------------- */

  if (service === "jamb") {
    const examType =
      requireString(
        body.exam_type ??
        body.examType ??
        body.plan ??
        body.product_id,
        "JAMB package",
      );

    const phone =
      normalizePhone(
        body.phone ??
        body.phone_number,
      );

    if (
      !isValidNigerianPhone(phone)
    ) {
      throw new Error(
        "A valid Nigerian phone number is required.",
      );
    }

    providerAmount =
      requirePositiveAmount(
        body.provider_amount ??
        body.amount ??
        body.price,
      );

    total =
      sellingPrice(
        providerAmount,
        service,
      );

    metadata = {
      exam_type: examType,
      phone,
    };

    await createTransaction({
      userId,
      reference,
      service,
      amount: total,
      providerAmount,
      metadata,
    });

    await debitWallet({
      userId,
      amount: total,
      reference,
      description:
        "JAMB PIN purchase",
    });

    try {
      providerResult =
        await purchaseJamb({
          examType,
          phone,
          requestId,
        });
    } catch (error) {
      await updateTransaction(
        reference,
        {
          status: "pending",
          metadata: {
            ...metadata,
            provider_state: "unknown",
            provider_error:
              error instanceof Error
                ? error.message
                : "Provider request failed.",
          },
        },
      );

      return {
        success: true,
        status: "pending",
        reference,
        message:
          "Your JAMB PIN request is being processed.",
      };
    }
  }

  if (!providerResult) {
    throw new Error(
      "Unable to process service request.",
    );
  }

  /* ---------------------------------------------------------------------- */
  /* PROVIDER RESULT                                                        */
  /* ---------------------------------------------------------------------- */

  const providerReference =
    providerResult.orderId ??
    providerResult.requestId ??
    null;

  const fulfillment =
    providerResult.state === "success"
      ? extractFulfillment(
          service,
          providerResult.raw,
        )
      : null;

  if (
    providerResult.state === "success"
  ) {
    await updateTransaction(
      reference,
      {
        status: "completed",
        provider: "clubkonnect",
        provider_reference:
          providerReference,
        metadata: {
          ...metadata,
          provider_status:
            providerResult.status,
          provider_status_code:
            providerResult.statusCode,
          provider_remark:
            providerResult.remark ?? null,
          fulfillment:
            fulfillment ?? null,
        },
      },
    );

    return {
      success: true,
      status: "successful",
      reference,
      amount: total,
      provider_amount:
        providerAmount,
      selling_price: total,
      fulfillment,
      message:
        "Service purchase successful.",
    };
  }

  if (
    providerResult.state === "pending" ||
    providerResult.state === "unknown"
  ) {
    await updateTransaction(
      reference,
      {
        status: "pending",
        provider: "clubkonnect",
        provider_reference:
          providerReference,
        metadata: {
          ...metadata,
          provider_status:
            providerResult.status,
          provider_status_code:
            providerResult.statusCode,
          provider_remark:
            providerResult.remark ?? null,
        },
      },
    );

    return {
      success: true,
      status: "pending",
      reference,
      amount: total,
      provider_amount:
        providerAmount,
      selling_price: total,
      message:
        "Your service request is being processed.",
    };
  }

  /**
   * Definite provider failure.
   *
   * Only now is it safe to refund immediately.
   */
  if (
    providerResult.state === "failed"
  ) {
    /**
     * If ClubKonnect supplied an order ID and the transaction
     * is in a cancellable state, make a best-effort cancellation.
     *
     * We do not allow cancellation errors to prevent the
     * customer's wallet refund because the provider has already
     * returned a terminal failure.
     */
    if (
      providerResult.orderId &&
      (
        providerResult.statusCode === "100" ||
        providerResult.statusCode === "600" ||
        providerResult.status ===
          "ORDER_RECEIVED" ||
        providerResult.status ===
          "ORDER_ONHOLD"
      )
    ) {
      try {
        await cancelProviderOrder(
          providerResult.orderId,
        );
      } catch {
        // Best effort only.
      }
    }

    await refundWallet({
      userId,
      amount: total,
      reference:
        `REFUND_${reference}`,
      description:
        "Refund for failed service purchase",
    });

    await updateTransaction(
      reference,
      {
        status: "failed",
        provider: "clubkonnect",
        provider_reference:
          providerReference,
        metadata: {
          ...metadata,
          provider_status:
            providerResult.status,
          provider_status_code:
            providerResult.statusCode,
          provider_remark:
            providerResult.remark ?? null,
          refunded: true,
        },
      },
    );

    return {
      success: false,
      status: "failed",
      reference,
      refunded: true,
      message:
        providerResult.remark ||
        "The service purchase failed and your wallet has been refunded.",
    };
  }

  throw new Error(
    "Unable to determine provider transaction status.",
  );
}

/* -------------------------------------------------------------------------- */
/* STATUS                                                                     */
/* -------------------------------------------------------------------------- */

async function reconcileTransaction(
  userId: string,
  reference: string,
): Promise<Record<string, unknown>> {
  const transaction =
    await getTransaction(
      userId,
      reference,
    );

  if (!transaction) {
    throw new Error(
      "Transaction not found.",
    );
  }

  const currentStatus =
    String(
      transaction.status ?? "",
    ).toLowerCase();

  if (
    currentStatus === "completed" ||
    currentStatus === "successful" ||
    currentStatus === "failed"
  ) {
    return {
      success:
        currentStatus === "completed" ||
        currentStatus === "successful",
      status:
        currentStatus === "completed"
          ? "successful"
          : currentStatus,
      reference,
      transaction,
    };
  }

  const metadata =
    objectValue(
      transaction.metadata,
    ) ?? {};

  const providerReference =
    stringValue(
      transaction.provider_reference,
    ) ??
    stringValue(
      metadata.provider_order_id,
    );

  let result:
    ProviderResult;

  try {
    result =
      await queryProviderTransaction({
        orderId:
          providerReference ??
          undefined,
        requestId:
          providerReference
            ? undefined
            : reference,
      });
  } catch (error) {
    return {
      success: true,
      status: "pending",
      reference,
      message:
        error instanceof Error
          ? error.message
          : "Unable to check provider status.",
    };
  }

  if (
    result.state === "success"
  ) {
    const service =
      normalizeService(
        metadata.service,
      );

    const fulfillment =
      service
        ? extractFulfillment(
            service,
            result.raw,
          )
        : null;

    await updateTransaction(
      reference,
      {
        status: "completed",
        provider: "clubkonnect",
        provider_reference:
          result.orderId ??
          result.requestId ??
          providerReference,
        metadata: {
          ...metadata,
          provider_status:
            result.status,
          provider_status_code:
            result.statusCode,
          provider_remark:
            result.remark ?? null,
          fulfillment:
            fulfillment ?? null,
        },
      },
    );

    return {
      success: true,
      status: "successful",
      reference,
      fulfillment,
    };
  }

  if (
    result.state === "pending" ||
    result.state === "unknown"
  ) {
    await updateTransaction(
      reference,
      {
        status: "pending",
        provider: "clubkonnect",
        provider_reference:
          result.orderId ??
          result.requestId ??
          providerReference,
        metadata: {
          ...metadata,
          provider_status:
            result.status,
          provider_status_code:
            result.statusCode,
          provider_remark:
            result.remark ?? null,
        },
      },
    );

    return {
      success: true,
      status: "pending",
      reference,
      message:
        "Transaction is still being processed.",
    };
  }

  /**
   * Terminal failure discovered during reconciliation.
   *
   * We only refund here if the transaction has not already
   * been marked refunded.
   */
  if (
    result.state === "failed"
  ) {
    const alreadyRefunded =
      metadata.refunded === true;

    if (!alreadyRefunded) {
      const amount =
        numberValue(
          transaction.amount,
        );

      if (
        amount !== null &&
        amount > 0
      ) {
        await refundWallet({
          userId,
          amount,
          reference:
            `REFUND_${reference}`,
          description:
            "Refund for failed service transaction",
        });
      }
    }

    await updateTransaction(
      reference,
      {
        status: "failed",
        provider: "clubkonnect",
        provider_reference:
          result.orderId ??
          result.requestId ??
          providerReference,
        metadata: {
          ...metadata,
          provider_status:
            result.status,
          provider_status_code:
            result.statusCode,
          provider_remark:
            result.remark ?? null,
          refunded: true,
        },
      },
    );

    return {
      success: false,
      status: "failed",
      reference,
      refunded: !alreadyRefunded,
      message:
        result.remark ||
        "The transaction failed and has been refunded.",
    };
  }

  return {
    success: true,
    status: "pending",
    reference,
  };
}

/* -------------------------------------------------------------------------- */
/* HTTP HANDLER                                                               */
/* -------------------------------------------------------------------------- */

Deno.serve(
  async (request: Request) => {
    if (
      request.method === "OPTIONS"
    ) {
      return new Response(
        "ok",
        {
          headers: corsHeaders,
        },
      );
    }

    if (
      request.method !== "POST"
    ) {
      return json(
        {
          success: false,
          message:
            "Method not allowed.",
        },
        405,
      );
    }

    try {
      const user =
        await getUser(request);

      if (!user?.id) {
        return json(
          {
            success: false,
            message:
              "Authentication required.",
          },
          401,
        );
      }

      let body:
        Record<string, unknown>;

      try {
        body =
          await request.json();
      } catch {
        return json(
          {
            success: false,
            message:
              "Invalid JSON request body.",
          },
          400,
        );
      }

      const action =
        typeof body.action === "string"
          ? body.action
              .trim()
              .toLowerCase()
          : "purchase";

      /* ------------------------------- CATALOG ------------------------------- */

      if (
        action === "catalog" ||
        action === "get_catalog" ||
        action === "plans"
      ) {
        const requestedService =
          body.service ??
          body.service_type;

        if (
          isComingSoonService(
            requestedService,
          )
        ) {
          return json({
            success: true,
            status: "coming_soon",
            service:
              String(
                requestedService,
              ),
            items: [],
            message:
              "This service is coming soon.",
          });
        }

        const service =
          normalizeService(
            requestedService,
          );

        if (!service) {
          return json(
            {
              success: false,
              message:
                "Unsupported service.",
            },
            400,
          );
        }

        const items =
          await getCatalog(
            service,
          );

        return json({
          success: true,
          service,
          markup:
            markupFor(service),
          items,
        });
      }

      /* --------------------------- ELECTRICITY VERIFY ------------------------ */

      if (
        action === "verify_meter" ||
        action === "verify_electricity_meter"
      ) {
        const company =
          requireString(
            body.company ??
            body.electric_company ??
            body.electricity_company,
            "electricity company",
          );

        const meterType =
          requireString(
            body.meter_type ??
            body.meterType,
            "meter type",
          );

        const meterNumber =
          requireString(
            body.meter_number ??
            body.meterNo ??
            body.meter,
            "meter number",
          );

        const result =
          await verifyElectricityMeter(
            company,
            meterNumber,
            meterType,
          );

        const customerName =
          stringValue(
            result.customer_name,
          );

        if (
          !customerName ||
          customerName.toUpperCase() ===
            "INVALID_METERNO"
        ) {
          return json(
            {
              success: false,
              valid: false,
              message:
                "Invalid electricity meter number.",
            },
            400,
          );
        }

        return json({
          success: true,
          valid: true,
          customer_name:
            customerName,
        });
      }

      /* ------------------------------- STATUS ------------------------------- */

      if (
        action === "status" ||
        action === "check_status" ||
        action === "reconcile"
      ) {
        const reference =
          requireString(
            body.reference ??
            body.request_id ??
            body.requestId,
            "reference",
          );

        return json(
          await reconcileTransaction(
            user.id,
            reference,
          ),
        );
      }

      /* ------------------------------ PURCHASE ------------------------------ */

      if (
        action === "purchase" ||
        action === "buy" ||
        action === "pay"
      ) {
        return json(
          await purchaseService(
            user.id,
            body,
          ),
        );
      }

      return json(
        {
          success: false,
          message:
            "Unsupported action.",
        },
        400,
      );
    } catch (error) {
      console.error(
        "clubkonnect-service error:",
        error instanceof Error
          ? error.message
          : error,
      );

      return json(
        {
          success: false,
          message:
            error instanceof Error
              ? error.message
              : "An unexpected error occurred.",
        },
        500,
      );
    }
  },
);
