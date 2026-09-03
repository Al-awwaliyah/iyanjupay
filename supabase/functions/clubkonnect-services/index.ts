import {
  corsHeaders,
  json,
  adminClient,
  getUser,
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
  | "status"
  | "check_status"
  | "reconcile";

interface ProviderResponse {
  success: boolean;
  statusCode?: number;
  status?: string;
  orderId?: string;
  requestId?: string;
  message?: string;
  raw?: unknown;
}

interface CatalogItem {
  id: string;
  code: string;
  name: string;
  label: string;
  price: number;
  providerPrice: number;
  category?: string;
  validity?: string;
  network?: string;
  networkCode?: string;
  biller?: string;
  billerCode?: string;
  metadata?: Record<string, unknown>;
}

interface CatalogResponse {
  success: boolean;
  service: ServiceType;
  markup: number;
  networks: CatalogItem[];
  billers: CatalogItem[];
  plans: CatalogItem[];
  items: CatalogItem[];
}

const CLUBKONNECT_BASE_URL = "https://www.nellobytesystems.com";

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

const COMING_SOON_SERVICES = new Set([
  "internet",
  "insurance",
  "savings",
]);

const CALLBACK_URL =
  `${Deno.env.get("SUPABASE_URL") ?? ""}/functions/v1/clubkonnect-webhook`;

function getCredentials() {
  const userId = Deno.env.get("CLUBKONNECT_USER_ID")?.trim();
  const apiKey = Deno.env.get("CLUBKONNECT_API_KEY")?.trim();

  if (!userId || !apiKey) {
    throw new Error(
      "ClubKonnect credentials are not configured. Set CLUBKONNECT_USER_ID and CLUBKONNECT_API_KEY.",
    );
  }

  return {
    userId,
    apiKey,
  };
}

function normalizeAction(value: unknown): Action | null {
  if (typeof value !== "string") {
    return null;
  }

  const action = value.trim().toLowerCase();

  const allowed: Action[] = [
    "catalog",
    "get_catalog",
    "plans",
    "purchase",
    "buy",
    "pay",
    "verify_meter",
    "verify_cable",
    "status",
    "check_status",
    "reconcile",
  ];

  return allowed.includes(action as Action)
    ? (action as Action)
    : null;
}

function normalizeService(value: unknown): ServiceType | null {
  if (typeof value !== "string") {
    return null;
  }

  return SERVICE_ALIASES[value.trim().toLowerCase()] ?? null;
}

function markupFor(service: ServiceType): number {
  return PREMIUM_SERVICES.has(service)
    ? PREMIUM_MARKUP
    : REGULAR_MARKUP;
}

function sellingPrice(
  providerPrice: number,
  service: ServiceType,
): number {
  if (!Number.isFinite(providerPrice) || providerPrice < 0) {
    throw new Error("Invalid provider price.");
  }

  return Math.ceil(providerPrice * (1 + markupFor(service)));
}

function toNumber(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const cleaned = value.replace(/[₦,\s]/g, "");
    const number = Number(cleaned);
    return Number.isFinite(number) ? number : 0;
  }

  return 0;
}

function toStringValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function firstString(
  object: Record<string, unknown>,
  keys: string[],
): string {
  for (const key of keys) {
    const value = object[key];

    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ""
    ) {
      return String(value).trim();
    }
  }

  return "";
}

function firstNumber(
  object: Record<string, unknown>,
  keys: string[],
): number {
  for (const key of keys) {
    const value = object[key];
    const number = toNumber(value);

    if (number > 0) {
      return number;
    }
  }

  return 0;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  ) {
    return value as Record<string, unknown>;
  }

  return {};
}

function extractArray(
  payload: unknown,
  possibleKeys: string[] = [],
): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  const root = asRecord(payload);

  for (const key of possibleKeys) {
    if (Array.isArray(root[key])) {
      return root[key] as unknown[];
    }
  }

  for (const value of Object.values(root)) {
    if (Array.isArray(value)) {
      return value;
    }

    if (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value)
    ) {
      const nested = extractArray(value, possibleKeys);

      if (nested.length > 0) {
        return nested;
      }
    }
  }

  return [];
}

function extractProviderCode(payload: unknown): number | undefined {
  const root = asRecord(payload);

  const raw = firstString(root, [
    "statuscode",
    "statusCode",
    "StatusCode",
    "code",
    "Code",
  ]);

  if (!raw) {
    return undefined;
  }

  const number = Number(raw);

  return Number.isFinite(number) ? number : undefined;
}

function extractProviderStatus(payload: unknown): string {
  const root = asRecord(payload);

  return firstString(root, [
    "status",
    "Status",
    "orderstatus",
    "orderStatus",
    "OrderStatus",
  ]);
}

function extractOrderId(payload: unknown): string {
  const root = asRecord(payload);

  return firstString(root, [
    "orderid",
    "orderId",
    "OrderID",
    "order_id",
  ]);
}

function extractRequestId(payload: unknown): string {
  const root = asRecord(payload);

  return firstString(root, [
    "requestid",
    "requestId",
    "RequestID",
    "request_id",
  ]);
}

function extractMessage(payload: unknown): string {
  const root = asRecord(payload);

  return firstString(root, [
    "message",
    "Message",
    "remark",
    "Remark",
    "orderremark",
    "orderRemark",
    "error",
    "Error",
  ]);
}

function classifyProviderResponse(payload: unknown): ProviderResponse {
  const statusCode = extractProviderCode(payload);
  const status = extractProviderStatus(payload).toUpperCase();
  const orderId = extractOrderId(payload);
  const requestId = extractRequestId(payload);
  const message = extractMessage(payload);

  if (
    statusCode === 200 ||
    status === "ORDER_COMPLETED"
  ) {
    return {
      success: true,
      statusCode,
      status,
      orderId,
      requestId,
      message: message || "Transaction completed.",
      raw: payload,
    };
  }

  if (
    statusCode === 100 ||
    statusCode === 300 ||
    statusCode === 201 ||
    status === "ORDER_RECEIVED" ||
    status === "ORDER_PROCESSED"
  ) {
    return {
      success: true,
      statusCode,
      status,
      orderId,
      requestId,
      message: message || "Transaction is processing.",
      raw: payload,
    };
  }

  if (
    statusCode === 199 ||
    statusCode === 299 ||
    statusCode === 399 ||
    statusCode === 400 ||
    statusCode === 401 ||
    statusCode === 404 ||
    statusCode === 500 ||
    status?.includes("FAILED") ||
    status?.includes("ERROR") ||
    status?.includes("INVALID")
  ) {
    return {
      success: false,
      statusCode,
      status,
      orderId,
      requestId,
      message: message || "ClubKonnect rejected the transaction.",
      raw: payload,
    };
  }

  return {
    success: false,
    statusCode,
    status,
    orderId,
    requestId,
    message: message || "Unknown ClubKonnect response.",
    raw: payload,
  };
}

async function clubKonnectGet(
  endpoint: string,
  params: Record<string, string | number | undefined>,
): Promise<unknown> {
  const { userId, apiKey } = getCredentials();

  const url = new URL(`${CLUBKONNECT_BASE_URL}/${endpoint}`);

  url.searchParams.set("UserID", userId);
  url.searchParams.set("APIKey", apiKey);

  for (const [key, value] of Object.entries(params)) {
    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ""
    ) {
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

    let payload: unknown;

    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = {
        raw: text,
      };
    }

    if (!response.ok) {
      throw new Error(
        `ClubKonnect HTTP ${response.status}: ${
          extractMessage(payload) || text || "Request failed."
        }`,
      );
    }

    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeCatalogItem(
  value: unknown,
  service: ServiceType,
  index: number,
): CatalogItem | null {
  const object = asRecord(value);

  const code = firstString(object, [
    "code",
    "Code",
    "id",
    "ID",
    "plan_code",
    "planCode",
    "Package",
    "package",
    "package_code",
    "packageCode",
    "network_code",
    "networkCode",
    "NetworkCode",
    "ElectricCompany",
    "electricCompany",
  ]);

  const name = firstString(object, [
    "name",
    "Name",
    "network",
    "Network",
    "network_name",
    "networkName",
    "NetworkName",
    "description",
    "Description",
    "package_name",
    "packageName",
    "PackageName",
    "plan_name",
    "planName",
  ]);

  const providerPrice = firstNumber(object, [
    "price",
    "Price",
    "amount",
    "Amount",
    "selling_price",
    "sellingPrice",
    "cost",
    "Cost",
    "discounted_price",
    "discountedPrice",
    "value",
    "Value",
  ]);

  const category = firstString(object, [
    "category",
    "Category",
    "type",
    "Type",
    "plan_type",
    "planType",
  ]);

  const validity = firstString(object, [
    "validity",
    "Validity",
    "duration",
    "Duration",
    "days",
    "Days",
  ]);

  const networkCode = firstString(object, [
    "network_code",
    "networkCode",
    "NetworkCode",
    "MobileNetwork",
    "mobile_network",
  ]);

  const billerCode = firstString(object, [
    "biller_code",
    "billerCode",
    "BillerCode",
    "ElectricCompany",
    "electricCompany",
    "CableTV",
    "cableTV",
    "cable_code",
  ]);

  if (
    !code &&
    !name &&
    providerPrice <= 0
  ) {
    return null;
  }

  const finalCode = code || `${service}-${index + 1}`;
  const finalName = name || finalCode;

  return {
    id: finalCode,
    code: finalCode,
    name: finalName,
    label: finalName,
    price:
      providerPrice > 0
        ? sellingPrice(providerPrice, service)
        : 0,
    providerPrice,
    category: category || undefined,
    validity: validity || undefined,
    network: name || undefined,
    networkCode: networkCode || undefined,
    biller: name || undefined,
    billerCode: billerCode || undefined,
    metadata: object,
  };
}

async function getAirtimeNetworks(): Promise<CatalogItem[]> {
  const payload = await clubKonnectGet(
    "APIAirtimeNetworkV2.asp",
    {},
  );

  const array = extractArray(payload, [
    "airtime",
    "airtimeNetworks",
    "networks",
    "data",
    "result",
  ]);

  return array
    .map((item, index) =>
      normalizeCatalogItem(item, "airtime", index)
    )
    .filter((item): item is CatalogItem => Boolean(item));
}

async function getDataNetworks(): Promise<CatalogItem[]> {
  const payload = await clubKonnectGet(
    "APIDatabundleNetworkV2.asp",
    {},
  );

  const array = extractArray(payload, [
    "data",
    "databundle",
    "databundleNetworks",
    "networks",
    "result",
  ]);

  return array
    .map((item, index) =>
      normalizeCatalogItem(item, "data", index)
    )
    .filter((item): item is CatalogItem => Boolean(item));
}

async function getDataPlans(
  networkCode?: string,
): Promise<CatalogItem[]> {
  const payload = await clubKonnectGet(
    "APIDatabundlePlansV2.asp",
    networkCode
      ? {
          MobileNetwork: networkCode,
        }
      : {},
  );

  const array = extractArray(payload, [
    "plans",
    "dataPlans",
    "databundle",
    "databundles",
    "data",
    "result",
  ]);

  return array
    .map((item, index) =>
      normalizeCatalogItem(item, "data", index)
    )
    .filter((item): item is CatalogItem => Boolean(item));
}

async function getCableTypes(): Promise<CatalogItem[]> {
  const payload = await clubKonnectGet(
    "APICableTVTypeV2.asp",
    {},
  );

  const array = extractArray(payload, [
    "cabletv",
    "cableTV",
    "cableTypes",
    "types",
    "networks",
    "data",
    "result",
  ]);

  return array
    .map((item, index) =>
      normalizeCatalogItem(item, "cable", index)
    )
    .filter((item): item is CatalogItem => Boolean(item));
}

async function getCablePackages(
  cableCode?: string,
): Promise<CatalogItem[]> {
  const payload = await clubKonnectGet(
    "APICableTVPackagesV2.asp",
    cableCode
      ? {
          CableTV: cableCode,
        }
      : {},
  );

  const array = extractArray(payload, [
    "packages",
    "cablePackages",
    "cableTVPackages",
    "data",
    "result",
  ]);

  return array
    .map((item, index) =>
      normalizeCatalogItem(item, "cable", index)
    )
    .filter((item): item is CatalogItem => Boolean(item));
}

async function getSmilePackages(): Promise<CatalogItem[]> {
  const payload = await clubKonnectGet(
    "APISmilePackagesV2.asp",
    {},
  );

  const array = extractArray(payload, [
    "packages",
    "plans",
    "smile",
    "data",
    "result",
  ]);

  return array
    .map((item, index) =>
      normalizeCatalogItem(item, "smile", index)
    )
    .filter((item): item is CatalogItem => Boolean(item));
}

async function getWaecPackages(): Promise<CatalogItem[]> {
  const payload = await clubKonnectGet(
    "APIWAECPackagesV2.asp",
    {},
  );

  const array = extractArray(payload, [
    "packages",
    "plans",
    "waec",
    "data",
    "result",
  ]);

  return array
    .map((item, index) =>
      normalizeCatalogItem(item, "waec", index)
    )
    .filter((item): item is CatalogItem => Boolean(item));
}

async function getJambPackages(): Promise<CatalogItem[]> {
  const payload = await clubKonnectGet(
    "APIJAMBPackagesV2.asp",
    {},
  );

  const array = extractArray(payload, [
    "packages",
    "plans",
    "jamb",
    "data",
    "result",
  ]);

  return array
    .map((item, index) =>
      normalizeCatalogItem(item, "jamb", index)
    )
    .filter((item): item is CatalogItem => Boolean(item));
}

async function getAirtimePinCatalog(): Promise<CatalogItem[]> {
  const payload = await clubKonnectGet(
    "APIEPINDiscountV2.asp",
    {},
  );

  const array = extractArray(payload, [
    "epin",
    "airtimeEpin",
    "airtimePin",
    "networks",
    "data",
    "result",
  ]);

  return array
    .map((item, index) =>
      normalizeCatalogItem(item, "airtime-card", index)
    )
    .filter((item): item is CatalogItem => Boolean(item));
}

async function getDataPinCatalog(): Promise<CatalogItem[]> {
  const plans = await getDataPlans();

  return plans.map((plan) => ({
    ...plan,
    id: `data-card-${plan.id}`,
    metadata: {
      ...(plan.metadata ?? {}),
      source: "ClubKonnect data bundle catalogue",
    },
  }));
}

async function getElectricityCatalog(): Promise<CatalogItem[]> {
  /*
   * ClubKonnect's current electricity documentation confirms that
   * electricity-company options are loaded from their live catalogue,
   * but the public documentation does not expose a stable catalogue
   * endpoint in the rendered API documentation.
   *
   * Therefore we deliberately do NOT invent electricity biller codes.
   *
   * The frontend can still use a biller supplied through a configured
   * request, while this catalogue remains empty until ClubKonnect
   * exposes the live electricity catalogue endpoint to the account.
   */
  return [];
}

async function getCatalog(
  service: ServiceType,
  networkCode?: string,
  billerCode?: string,
): Promise<CatalogResponse> {
  let networks: CatalogItem[] = [];
  let billers: CatalogItem[] = [];
  let plans: CatalogItem[] = [];
  let items: CatalogItem[] = [];

  switch (service) {
    case "airtime": {
      networks = await getAirtimeNetworks();
      items = networks;
      break;
    }

    case "data": {
      networks = await getDataNetworks();
      plans = await getDataPlans(networkCode);
      items = plans;
      break;
    }

    case "cable": {
      billers = await getCableTypes();
      plans = await getCablePackages(billerCode);
      items = plans;
      break;
    }

    case "electricity": {
      billers = await getElectricityCatalog();
      items = billers;
      break;
    }

    case "airtime-card": {
      networks = await getAirtimeNetworks();
      plans = await getAirtimePinCatalog();

      if (plans.length === 0) {
        items = networks;
      } else {
        items = plans;
      }

      break;
    }

    case "data-card": {
      networks = await getDataNetworks();
      plans = await getDataPinCatalog();
      items = plans;
      break;
    }

    case "smile": {
      plans = await getSmilePackages();
      items = plans;
      break;
    }

    case "waec": {
      plans = await getWaecPackages();
      items = plans;
      break;
    }

    case "jamb": {
      plans = await getJambPackages();
      items = plans;
      break;
    }

    default:
      throw new Error(`Unsupported service: ${service}`);
  }

  return {
    success: true,
    service,
    markup: markupFor(service),
    networks,
    billers,
    plans,
    items,
  };
}

function requiredString(
  body: Record<string, unknown>,
  keys: string[],
  label: string,
): string {
  const value = firstString(body, keys);

  if (!value) {
    throw new Error(`${label} is required.`);
  }

  return value;
}

function optionalString(
  body: Record<string, unknown>,
  keys: string[],
): string {
  return firstString(body, keys);
}

function requiredPositiveAmount(
  body: Record<string, unknown>,
  keys: string[],
  label: string,
): number {
  const value = firstNumber(body, keys);

  if (value <= 0) {
    throw new Error(`${label} must be greater than zero.`);
  }

  return Math.round(value * 100) / 100;
}

function integerQuantity(
  body: Record<string, unknown>,
): number {
  const value = firstNumber(body, [
    "quantity",
    "qty",
  ]);

  const quantity = Math.floor(value || 1);

  if (quantity < 1 || quantity > 100) {
    throw new Error("Quantity must be between 1 and 100.");
  }

  return quantity;
}

function requestIdFrom(
  body: Record<string, unknown>,
): string {
  const provided = optionalString(body, [
    "request_id",
    "requestId",
    "RequestID",
  ]);

  if (provided) {
    return provided;
  }

  return crypto.randomUUID();
}

function phoneFrom(
  body: Record<string, unknown>,
): string {
  return requiredString(
    body,
    [
      "phone",
      "phoneNumber",
      "phone_number",
      "PhoneNo",
      "recipient_phone",
    ],
    "Phone number",
  );
}

function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/\s+/g, "");

  if (cleaned.startsWith("+234")) {
    return `0${cleaned.slice(4)}`;
  }

  if (cleaned.startsWith("234")) {
    return `0${cleaned.slice(3)}`;
  }

  return cleaned;
}

function ensureReasonableNigerianPhone(phone: string) {
  const normalized = normalizePhone(phone);

  if (!/^0\d{10}$/.test(normalized)) {
    throw new Error("Enter a valid Nigerian phone number.");
  }

  return normalized;
}

async function findCatalogPrice(
  service: ServiceType,
  code: string,
  networkCode?: string,
  billerCode?: string,
): Promise<{
  providerPrice: number;
  sellingPrice: number;
  item: CatalogItem;
}> {
  const catalog = await getCatalog(
    service,
    networkCode,
    billerCode,
  );

  const allItems = [
    ...catalog.items,
    ...catalog.plans,
    ...catalog.networks,
    ...catalog.billers,
  ];

  const item = allItems.find((entry) => {
    return (
      entry.code === code ||
      entry.id === code ||
      entry.metadata?.["code"] === code ||
      entry.metadata?.["Package"] === code ||
      entry.metadata?.["package"] === code
    );
  });

  if (!item) {
    throw new Error(
      `The selected ${service} product was not found in the current ClubKonnect catalogue.`,
    );
  }

  if (item.providerPrice <= 0) {
    throw new Error(
      `The selected ${service} product does not have a valid provider price.`,
    );
  }

  return {
    providerPrice: item.providerPrice,
    sellingPrice: sellingPrice(
      item.providerPrice,
      service,
    ),
    item,
  };
}

async function verifyPaymentPin(
  userId: string,
  paymentPin: string,
): Promise<void> {
  if (!paymentPin) {
    throw new Error("Payment PIN is required.");
  }

  const { error } = await adminClient.rpc(
    "verify_payment_pin",
    {
      p_user_id: userId,
      p_pin: paymentPin,
    },
  );

  if (error) {
    throw new Error(
      error.message || "Unable to verify payment PIN.",
    );
  }
}

async function createTransaction(
  userId: string,
  reference: string,
  amount: number,
  service: ServiceType,
  metadata: Record<string, unknown>,
) {
  const { data, error } = await adminClient
    .from("transactions")
    .insert({
      user_id: userId,
      reference_number: reference,
      transaction_type: "service_payment",
      amount,
      status: "pending",
      provider: "clubkonnect",
      metadata: {
        service,
        provider: "clubkonnect",
        ...metadata,
      },
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(
      error.message || "Unable to create service transaction.",
    );
  }

  return data;
}

async function updateTransaction(
  transactionId: string,
  values: Record<string, unknown>,
) {
  const { error } = await adminClient
    .from("transactions")
    .update(values)
    .eq("id", transactionId);

  if (error) {
    throw new Error(
      error.message || "Unable to update service transaction.",
    );
  }
}

async function debitWallet(
  userId: string,
  amount: number,
  reference: string,
  description: string,
) {
  const { data, error } = await adminClient.rpc(
    "debit_wallet",
    {
      p_user_id: userId,
      p_amount: amount,
      p_reference: reference,
      p_description: description,
    },
  );

  if (error) {
    throw new Error(
      error.message || "Unable to debit wallet.",
    );
  }

  return data;
}

async function refundWallet(
  userId: string,
  amount: number,
  reference: string,
  description: string,
) {
  const { data, error } = await adminClient.rpc(
    "refund_wallet",
    {
      p_user_id: userId,
      p_amount: amount,
      p_reference: reference,
      p_description: description,
    },
  );

  if (error) {
    throw new Error(
      error.message || "Unable to refund wallet.",
    );
  }

  return data;
}

async function purchaseAirtime(
  userId: string,
  body: Record<string, unknown>,
): Promise<ProviderResponse> {
  const networkCode = requiredString(
    body,
    [
      "network_code",
      "networkCode",
      "mobile_network",
      "mobileNetwork",
      "MobileNetwork",
    ],
    "Mobile network",
  );

  const phone = ensureReasonableNigerianPhone(
    phoneFrom(body),
  );

  const amount = requiredPositiveAmount(
    body,
    ["amount", "value"],
    "Airtime amount",
  );

  const reference = requestIdFrom(body);

  const total = sellingPrice(
    amount,
    "airtime",
  );

  const transaction = await createTransaction(
    userId,
    reference,
    total,
    "airtime",
    {
      network_code: networkCode,
      phone,
      provider_amount: amount,
      selling_amount: total,
      request_id: reference,
    },
  );

  try {
    await debitWallet(
      userId,
      total,
      reference,
      "Airtime purchase",
    );
  } catch (error) {
    await updateTransaction(transaction.id, {
      status: "failed",
      metadata: {
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
    });

    throw error;
  }

  try {
    const payload = await clubKonnectGet(
      "APIAirtimeV1.asp",
      {
        MobileNetwork: networkCode,
        MobileNumber: phone,
        Amount: amount,
        RequestID: reference,
        CallBackURL: CALLBACK_URL,
      },
    );

    const result = classifyProviderResponse(payload);

    await updateTransaction(transaction.id, {
      status: result.success
        ? "pending"
        : "failed",
      provider_reference:
        result.orderId || null,
      metadata: {
        network_code: networkCode,
        phone,
        provider_amount: amount,
        selling_amount: total,
        request_id: reference,
        provider_response: payload,
      },
    });

    if (!result.success) {
      await refundWallet(
        userId,
        total,
        reference,
        "Refund for failed airtime purchase",
      );

      await updateTransaction(transaction.id, {
        status: "failed",
      });
    }

    return result;
  } catch (error) {
    await updateTransaction(transaction.id, {
      status: "pending",
      metadata: {
        provider_error:
          error instanceof Error
            ? error.message
            : String(error),
        request_id: reference,
      },
    });

    return {
      success: true,
      status: "ORDER_RECEIVED",
      message:
        "Your airtime request was submitted and is being reconciled.",
      requestId: reference,
    };
  }
}

async function purchaseData(
  userId: string,
  body: Record<string, unknown>,
): Promise<ProviderResponse> {
  const networkCode = requiredString(
    body,
    [
      "network_code",
      "networkCode",
      "mobile_network",
      "mobileNetwork",
      "MobileNetwork",
    ],
    "Mobile network",
  );

  const planCode = requiredString(
    body,
    [
      "data_plan",
      "dataPlan",
      "plan_code",
      "planCode",
      "Package",
      "package",
    ],
    "Data plan",
  );

  const phone = ensureReasonableNigerianPhone(
    phoneFrom(body),
  );

  const product = await findCatalogPrice(
    "data",
    planCode,
    networkCode,
  );

  const reference = requestIdFrom(body);

  const transaction = await createTransaction(
    userId,
    reference,
    product.sellingPrice,
    "data",
    {
      network_code: networkCode,
      data_plan: planCode,
      phone,
      provider_amount: product.providerPrice,
      selling_amount: product.sellingPrice,
      request_id: reference,
    },
  );

  try {
    await debitWallet(
      userId,
      product.sellingPrice,
      reference,
      "Data bundle purchase",
    );
  } catch (error) {
    await updateTransaction(transaction.id, {
      status: "failed",
    });

    throw error;
  }

  try {
    const payload = await clubKonnectGet(
      "APIDatabundleV1.asp",
      {
        MobileNetwork: networkCode,
        DataPlan: planCode,
        MobileNumber: phone,
        RequestID: reference,
        CallBackURL: CALLBACK_URL,
      },
    );

    const result = classifyProviderResponse(payload);

    await updateTransaction(transaction.id, {
      status: result.success
        ? "pending"
        : "failed",
      provider_reference:
        result.orderId || null,
      metadata: {
        network_code: networkCode,
        data_plan: planCode,
        phone,
        provider_amount: product.providerPrice,
        selling_amount: product.sellingPrice,
        request_id: reference,
        provider_response: payload,
      },
    });

    if (!result.success) {
      await refundWallet(
        userId,
        product.sellingPrice,
        reference,
        "Refund for failed data purchase",
      );

      await updateTransaction(transaction.id, {
        status: "failed",
      });
    }

    return result;
  } catch (error) {
    await updateTransaction(transaction.id, {
      status: "pending",
      metadata: {
        provider_error:
          error instanceof Error
            ? error.message
            : String(error),
      },
    });

    return {
      success: true,
      status: "ORDER_RECEIVED",
      message:
        "Your data request was submitted and is being reconciled.",
      requestId: reference,
    };
  }
}

async function verifyMeter(
  body: Record<string, unknown>,
) {
  const company = requiredString(
    body,
    [
      "electric_company",
      "electricCompany",
      "company_code",
      "companyCode",
      "biller_code",
      "billerCode",
      "ElectricCompany",
    ],
    "Electricity company",
  );

  const meterType = requiredString(
    body,
    [
      "meter_type",
      "meterType",
      "MeterType",
    ],
    "Meter type",
  );

  const meterNumber = requiredString(
    body,
    [
      "meter_number",
      "meterNumber",
      "meter_no",
      "meterNo",
      "MeterNo",
    ],
    "Meter number",
  );

  const payload = await clubKonnectGet(
    "APIVerifyElectricityV1.asp",
    {
      ElectricCompany: company,
      MeterNo: meterNumber,
      MeterType: meterType,
    },
  );

  const root = asRecord(payload);

  const customerName = firstString(root, [
    "customer_name",
    "customerName",
    "CustomerName",
  ]);

  if (
    !customerName ||
    customerName.toUpperCase() === "INVALID_METERNO"
  ) {
    return {
      success: false,
      message:
        "The electricity meter could not be verified.",
      data: payload,
    };
  }

  return {
    success: true,
    message: "Meter verified successfully.",
    customer_name: customerName,
    data: payload,
  };
}

async function purchaseElectricity(
  userId: string,
  body: Record<string, unknown>,
): Promise<ProviderResponse> {
  const company = requiredString(
    body,
    [
      "electric_company",
      "electricCompany",
      "company_code",
      "companyCode",
      "biller_code",
      "billerCode",
      "ElectricCompany",
    ],
    "Electricity company",
  );

  const meterType = requiredString(
    body,
    [
      "meter_type",
      "meterType",
      "MeterType",
    ],
    "Meter type",
  );

  const meterNumber = requiredString(
    body,
    [
      "meter_number",
      "meterNumber",
      "meter_no",
      "meterNo",
      "MeterNo",
    ],
    "Meter number",
  );

  const amount = requiredPositiveAmount(
    body,
    ["amount", "Amount"],
    "Electricity amount",
  );

  const phone = optionalString(body, [
    "phone",
    "phoneNumber",
    "phone_number",
    "PhoneNo",
  ]);

  const reference = requestIdFrom(body);

  const verification = await verifyMeter(body);

  if (!verification.success) {
    throw new Error(
      verification.message ||
        "Electricity meter verification failed.",
    );
  }

  const total = sellingPrice(
    amount,
    "electricity",
  );

  const transaction = await createTransaction(
    userId,
    reference,
    total,
    "electricity",
    {
      electric_company: company,
      meter_type: meterType,
      meter_number: meterNumber,
      phone,
      provider_amount: amount,
      selling_amount: total,
      request_id: reference,
      customer_name:
        verification.customer_name || null,
    },
  );

  try {
    await debitWallet(
      userId,
      total,
      reference,
      "Electricity bill payment",
    );
  } catch (error) {
    await updateTransaction(transaction.id, {
      status: "failed",
    });

    throw error;
  }

  try {
    const payload = await clubKonnectGet(
      "APIElectricityV1.asp",
      {
        ElectricCompany: company,
        MeterType: meterType,
        MeterNo: meterNumber,
        Amount: amount,
        PhoneNo: phone || undefined,
        RequestID: reference,
        CallBackURL: CALLBACK_URL,
      },
    );

    const result = classifyProviderResponse(payload);

    await updateTransaction(transaction.id, {
      status: result.success
        ? "pending"
        : "failed",
      provider_reference:
        result.orderId || null,
      metadata: {
        electric_company: company,
        meter_type: meterType,
        meter_number: meterNumber,
        phone,
        provider_amount: amount,
        selling_amount: total,
        request_id: reference,
        provider_response: payload,
      },
    });

    if (!result.success) {
      await refundWallet(
        userId,
        total,
        reference,
        "Refund for failed electricity payment",
      );

      await updateTransaction(transaction.id, {
        status: "failed",
      });
    }

    return result;
  } catch (error) {
    await updateTransaction(transaction.id, {
      status: "pending",
      metadata: {
        provider_error:
          error instanceof Error
            ? error.message
            : String(error),
      },
    });

    return {
      success: true,
      status: "ORDER_RECEIVED",
      message:
        "Your electricity payment was submitted and is being reconciled.",
      requestId: reference,
    };
  }
}

async function verifyCable(
  body: Record<string, unknown>,
) {
  const cableCode = requiredString(
    body,
    [
      "cable_tv",
      "cableTV",
      "cable_code",
      "cableCode",
      "biller_code",
      "billerCode",
      "CableTV",
    ],
    "Cable TV service",
  );

  const smartcardNumber = requiredString(
    body,
    [
      "smartcard_number",
      "smartcardNumber",
      "smartCardNumber",
      "smartcard",
      "SmartCardNo",
    ],
    "Smartcard/IUC number",
  );

  const payload = await clubKonnectGet(
    "APIVerifyCableTVV1.asp",
    {
      CableTV: cableCode,
      SmartCardNo: smartcardNumber,
    },
  );

  const root = asRecord(payload);

  const customerName = firstString(root, [
    "customer_name",
    "customerName",
    "CustomerName",
  ]);

  if (
    !customerName ||
    customerName.toUpperCase() === "INVALID_SMARTCARDNO"
  ) {
    return {
      success: false,
      message:
        "The cable TV smartcard/IUC could not be verified.",
      data: payload,
    };
  }

  return {
    success: true,
    message: "Smartcard verified successfully.",
    customer_name: customerName,
    data: payload,
  };
}

async function purchaseCable(
  userId: string,
  body: Record<string, unknown>,
): Promise<ProviderResponse> {
  const cableCode = requiredString(
    body,
    [
      "cable_tv",
      "cableTV",
      "cable_code",
      "cableCode",
      "biller_code",
      "billerCode",
      "CableTV",
    ],
    "Cable TV service",
  );

  const packageCode = requiredString(
    body,
    [
      "package",
      "Package",
      "package_code",
      "packageCode",
    ],
    "Cable TV package",
  );

  const smartcardNumber = requiredString(
    body,
    [
      "smartcard_number",
      "smartcardNumber",
      "smartCardNumber",
      "smartcard",
      "SmartCardNo",
    ],
    "Smartcard/IUC number",
  );

  const phone = optionalString(body, [
    "phone",
    "phoneNumber",
    "phone_number",
    "PhoneNo",
  ]);

  const product = await findCatalogPrice(
    "cable",
    packageCode,
    undefined,
    cableCode,
  );

  const verification = await verifyCable(body);

  if (!verification.success) {
    throw new Error(
      verification.message ||
        "Cable TV smartcard verification failed.",
    );
  }

  const reference = requestIdFrom(body);

  const transaction = await createTransaction(
    userId,
    reference,
    product.sellingPrice,
    "cable",
    {
      cable_tv: cableCode,
      package: packageCode,
      smartcard_number: smartcardNumber,
      phone,
      provider_amount: product.providerPrice,
      selling_amount: product.sellingPrice,
      request_id: reference,
      customer_name:
        verification.customer_name || null,
    },
  );

  try {
    await debitWallet(
      userId,
      product.sellingPrice,
      reference,
      "Cable TV subscription",
    );
  } catch (error) {
    await updateTransaction(transaction.id, {
      status: "failed",
    });

    throw error;
  }

  try {
    const payload = await clubKonnectGet(
      "APICableTVV1.asp",
      {
        CableTV: cableCode,
        Package: packageCode,
        SmartCardNo: smartcardNumber,
        PhoneNo: phone || undefined,
        RequestID: reference,
        CallBackURL: CALLBACK_URL,
      },
    );

    const result = classifyProviderResponse(payload);

    await updateTransaction(transaction.id, {
      status: result.success
        ? "pending"
        : "failed",
      provider_reference:
        result.orderId || null,
      metadata: {
        cable_tv: cableCode,
        package: packageCode,
        smartcard_number: smartcardNumber,
        phone,
        provider_amount: product.providerPrice,
        selling_amount: product.sellingPrice,
        request_id: reference,
        provider_response: payload,
      },
    });

    if (!result.success) {
      await refundWallet(
        userId,
        product.sellingPrice,
        reference,
        "Refund for failed cable TV subscription",
      );

      await updateTransaction(transaction.id, {
        status: "failed",
      });
    }

    return result;
  } catch (error) {
    await updateTransaction(transaction.id, {
      status: "pending",
      metadata: {
        provider_error:
          error instanceof Error
            ? error.message
            : String(error),
      },
    });

    return {
      success: true,
      status: "ORDER_RECEIVED",
      message:
        "Your cable TV request was submitted and is being reconciled.",
      requestId: reference,
    };
  }
}

async function purchaseAirtimePin(
  userId: string,
  body: Record<string, unknown>,
): Promise<ProviderResponse> {
  const networkCode = requiredString(
    body,
    [
      "network_code",
      "networkCode",
      "mobile_network",
      "mobileNetwork",
      "MobileNetwork",
    ],
    "Mobile network",
  );

  const value = requiredPositiveAmount(
    body,
    ["value", "amount"],
    "Airtime E-PIN value",
  );

  const quantity = integerQuantity(body);

  const providerAmount = value * quantity;

  const total = sellingPrice(
    providerAmount,
    "airtime-card",
  );

  const reference = requestIdFrom(body);

  const transaction = await createTransaction(
    userId,
    reference,
    total,
    "airtime-card",
    {
      network_code: networkCode,
      value,
      quantity,
      provider_amount: providerAmount,
      selling_amount: total,
      request_id: reference,
    },
  );

  try {
    await debitWallet(
      userId,
      total,
      reference,
      "Airtime E-PIN purchase",
    );
  } catch (error) {
    await updateTransaction(transaction.id, {
      status: "failed",
    });

    throw error;
  }

  try {
    const payload = await clubKonnectGet(
      "APIEPINV1.asp",
      {
        MobileNetwork: networkCode,
        Value: value,
        Quantity: quantity,
        RequestID: reference,
        CallBackURL: CALLBACK_URL,
      },
    );

    const result = classifyProviderResponse(payload);

    await updateTransaction(transaction.id, {
      status: result.success
        ? "pending"
        : "failed",
      provider_reference:
        result.orderId || null,
      metadata: {
        network_code: networkCode,
        value,
        quantity,
        provider_amount: providerAmount,
        selling_amount: total,
        request_id: reference,
        provider_response: payload,
      },
    });

    if (!result.success) {
      await refundWallet(
        userId,
        total,
        reference,
        "Refund for failed Airtime E-PIN purchase",
      );

      await updateTransaction(transaction.id, {
        status: "failed",
      });
    }

    return result;
  } catch (error) {
    await updateTransaction(transaction.id, {
      status: "pending",
      metadata: {
        provider_error:
          error instanceof Error
            ? error.message
            : String(error),
      },
    });

    return {
      success: true,
      status: "ORDER_RECEIVED",
      message:
        "Your Airtime E-PIN request was submitted and is being reconciled.",
      requestId: reference,
    };
  }
}

async function purchaseDataPin(
  userId: string,
  body: Record<string, unknown>,
): Promise<ProviderResponse> {
  const networkCode = requiredString(
    body,
    [
      "network_code",
      "networkCode",
      "mobile_network",
      "mobileNetwork",
      "MobileNetwork",
    ],
    "Mobile network",
  );

  const planCode = requiredString(
    body,
    [
      "data_plan",
      "dataPlan",
      "plan_code",
      "planCode",
      "Package",
      "package",
    ],
    "Data E-PIN plan",
  );

  const quantity = integerQuantity(body);

  const product = await findCatalogPrice(
    "data-card",
    planCode,
    networkCode,
  );

  const providerAmount =
    product.providerPrice * quantity;

  const total = sellingPrice(
    providerAmount,
    "data-card",
  );

  const reference = requestIdFrom(body);

  const transaction = await createTransaction(
    userId,
    reference,
    total,
    "data-card",
    {
      network_code: networkCode,
      data_plan: planCode,
      quantity,
      provider_amount: providerAmount,
      selling_amount: total,
      request_id: reference,
    },
  );

  try {
    await debitWallet(
      userId,
      total,
      reference,
      "Data E-PIN purchase",
    );
  } catch (error) {
    await updateTransaction(transaction.id, {
      status: "failed",
    });

    throw error;
  }

  try {
    const payload = await clubKonnectGet(
      "APIDatabundleEPINV1.asp",
      {
        MobileNetwork: networkCode,
        DataPlan: planCode,
        Quantity: quantity,
        RequestID: reference,
        CallBackURL: CALLBACK_URL,
      },
    );

    const result = classifyProviderResponse(payload);

    await updateTransaction(transaction.id, {
      status: result.success
        ? "pending"
        : "failed",
      provider_reference:
        result.orderId || null,
      metadata: {
        network_code: networkCode,
        data_plan: planCode,
        quantity,
        provider_amount: providerAmount,
        selling_amount: total,
        request_id: reference,
        provider_response: payload,
      },
    });

    if (!result.success) {
      await refundWallet(
        userId,
        total,
        reference,
        "Refund for failed Data E-PIN purchase",
      );

      await updateTransaction(transaction.id, {
        status: "failed",
      });
    }

    return result;
  } catch (error) {
    await updateTransaction(transaction.id, {
      status: "pending",
      metadata: {
        provider_error:
          error instanceof Error
            ? error.message
            : String(error),
      },
    });

    return {
      success: true,
      status: "ORDER_RECEIVED",
      message:
        "Your Data E-PIN request was submitted and is being reconciled.",
      requestId: reference,
    };
  }
}

async function purchaseSmile(
  userId: string,
  body: Record<string, unknown>,
): Promise<ProviderResponse> {
  const planCode = requiredString(
    body,
    [
      "data_plan",
      "dataPlan",
      "plan_code",
      "planCode",
      "Package",
      "package",
    ],
    "Smile data plan",
  );

  const accountId = requiredString(
    body,
    [
      "account_id",
      "accountId",
      "mobile_number",
      "mobileNumber",
      "phone",
      "phoneNumber",
    ],
    "Smile account/mobile number",
  );

  const product = await findCatalogPrice(
    "smile",
    planCode,
  );

  const reference = requestIdFrom(body);

  const transaction = await createTransaction(
    userId,
    reference,
    product.sellingPrice,
    "smile",
    {
      mobile_network: "smile-direct",
      account_id: accountId,
      data_plan: planCode,
      provider_amount: product.providerPrice,
      selling_amount: product.sellingPrice,
      request_id: reference,
    },
  );

  try {
    await debitWallet(
      userId,
      product.sellingPrice,
      reference,
      "Smile data purchase",
    );
  } catch (error) {
    await updateTransaction(transaction.id, {
      status: "failed",
    });

    throw error;
  }

  try {
    const payload = await clubKonnectGet(
      "APISmileV1.asp",
      {
        MobileNetwork: "smile-direct",
        MobileNumber: accountId,
        DataPlan: planCode,
        RequestID: reference,
        CallBackURL: CALLBACK_URL,
      },
    );

    const result = classifyProviderResponse(payload);

    await updateTransaction(transaction.id, {
      status: result.success
        ? "pending"
        : "failed",
      provider_reference:
        result.orderId || null,
      metadata: {
        mobile_network: "smile-direct",
        account_id: accountId,
        data_plan: planCode,
        provider_amount: product.providerPrice,
        selling_amount: product.sellingPrice,
        request_id: reference,
        provider_response: payload,
      },
    });

    if (!result.success) {
      await refundWallet(
        userId,
        product.sellingPrice,
        reference,
        "Refund for failed Smile purchase",
      );

      await updateTransaction(transaction.id, {
        status: "failed",
      });
    }

    return result;
  } catch (error) {
    await updateTransaction(transaction.id, {
      status: "pending",
    });

    return {
      success: true,
      status: "ORDER_RECEIVED",
      message:
        "Your Smile request was submitted and is being reconciled.",
      requestId: reference,
    };
  }
}

async function purchaseWaec(
  userId: string,
  body: Record<string, unknown>,
): Promise<ProviderResponse> {
  const packageCode = requiredString(
    body,
    [
      "package_code",
      "packageCode",
      "package",
      "Package",
      "exam_type",
      "examType",
      "ExamType",
    ],
    "WAEC package",
  );

  const phone = ensureReasonableNigerianPhone(
    phoneFrom(body),
  );

  const product = await findCatalogPrice(
    "waec",
    packageCode,
  );

  const reference = requestIdFrom(body);

  const transaction = await createTransaction(
    userId,
    reference,
    product.sellingPrice,
    "waec",
    {
      package_code: packageCode,
      phone,
      provider_amount: product.providerPrice,
      selling_amount: product.sellingPrice,
      request_id: reference,
    },
  );

  try {
    await debitWallet(
      userId,
      product.sellingPrice,
      reference,
      "WAEC E-PIN purchase",
    );
  } catch (error) {
    await updateTransaction(transaction.id, {
      status: "failed",
    });

    throw error;
  }

  try {
    const payload = await clubKonnectGet(
      "APIWAECV1.asp",
      {
        Package: packageCode,
        PhoneNo: phone,
        RequestID: reference,
        CallBackURL: CALLBACK_URL,
      },
    );

    const result = classifyProviderResponse(payload);

    await updateTransaction(transaction.id, {
      status: result.success
        ? "pending"
        : "failed",
      provider_reference:
        result.orderId || null,
      metadata: {
        package_code: packageCode,
        phone,
        provider_amount: product.providerPrice,
        selling_amount: product.sellingPrice,
        request_id: reference,
        provider_response: payload,
      },
    });

    if (!result.success) {
      await refundWallet(
        userId,
        product.sellingPrice,
        reference,
        "Refund for failed WAEC purchase",
      );

      await updateTransaction(transaction.id, {
        status: "failed",
      });
    }

    return result;
  } catch (error) {
    await updateTransaction(transaction.id, {
      status: "pending",
    });

    return {
      success: true,
      status: "ORDER_RECEIVED",
      message:
        "Your WAEC request was submitted and is being reconciled.",
      requestId: reference,
    };
  }
}

async function purchaseJamb(
  userId: string,
  body: Record<string, unknown>,
): Promise<ProviderResponse> {
  const examType = requiredString(
    body,
    [
      "exam_type",
      "examType",
      "ExamType",
    ],
    "JAMB exam type",
  );

  const phone = ensureReasonableNigerianPhone(
    phoneFrom(body),
  );

  const validExamTypes = new Set([
    "de",
    "utme-mock",
    "utme-no-mock",
  ]);

  if (!validExamTypes.has(examType)) {
    throw new Error(
      "Invalid JAMB exam type. Use de, utme-mock or utme-no-mock.",
    );
  }

  const catalog = await getJambPackages();

  const matchingPackage = catalog.find((item) => {
    const code = item.code.toLowerCase();
    const name = item.name.toLowerCase();

    return (
      code === examType.toLowerCase() ||
      name.includes(examType.toLowerCase())
    );
  });

  if (!matchingPackage) {
    throw new Error(
      "The selected JAMB exam type is not available in the current ClubKonnect catalogue.",
    );
  }

  if (matchingPackage.providerPrice <= 0) {
    throw new Error(
      "The selected JAMB service has no valid provider price.",
    );
  }

  const total = sellingPrice(
    matchingPackage.providerPrice,
    "jamb",
  );

  const reference = requestIdFrom(body);

  const transaction = await createTransaction(
    userId,
    reference,
    total,
    "jamb",
    {
      exam_type: examType,
      phone,
      provider_amount: matchingPackage.providerPrice,
      selling_amount: total,
      request_id: reference,
    },
  );

  try {
    await debitWallet(
      userId,
      total,
      reference,
      "JAMB E-PIN purchase",
    );
  } catch (error) {
    await updateTransaction(transaction.id, {
      status: "failed",
    });

    throw error;
  }

  try {
    const payload = await clubKonnectGet(
      "APIJAMBV1.asp",
      {
        ExamType: examType,
        PhoneNo: phone,
        RequestID: reference,
        CallBackURL: CALLBACK_URL,
      },
    );

    const result = classifyProviderResponse(payload);

    await updateTransaction(transaction.id, {
      status: result.success
        ? "pending"
        : "failed",
      provider_reference:
        result.orderId || null,
      metadata: {
        exam_type: examType,
        phone,
        provider_amount:
          matchingPackage.providerPrice,
        selling_amount: total,
        request_id: reference,
        provider_response: payload,
      },
    });

    if (!result.success) {
      await refundWallet(
        userId,
        total,
        reference,
        "Refund for failed JAMB purchase",
      );

      await updateTransaction(transaction.id, {
        status: "failed",
      });
    }

    return result;
  } catch (error) {
    await updateTransaction(transaction.id, {
      status: "pending",
    });

    return {
      success: true,
      status: "ORDER_RECEIVED",
      message:
        "Your JAMB request was submitted and is being reconciled.",
      requestId: reference,
    };
  }
}

async function purchaseService(
  userId: string,
  service: ServiceType,
  body: Record<string, unknown>,
): Promise<ProviderResponse> {
  switch (service) {
    case "airtime":
      return await purchaseAirtime(userId, body);

    case "data":
      return await purchaseData(userId, body);

    case "electricity":
      return await purchaseElectricity(userId, body);

    case "cable":
      return await purchaseCable(userId, body);

    case "airtime-card":
      return await purchaseAirtimePin(userId, body);

    case "data-card":
      return await purchaseDataPin(userId, body);

    case "smile":
      return await purchaseSmile(userId, body);

    case "waec":
      return await purchaseWaec(userId, body);

    case "jamb":
      return await purchaseJamb(userId, body);

    default:
      throw new Error(
        `Unsupported service: ${service}`,
      );
  }
}

async function queryStatus(
  body: Record<string, unknown>,
) {
  const orderId = optionalString(body, [
    "order_id",
    "orderId",
    "OrderID",
  ]);

  const requestId = optionalString(body, [
    "request_id",
    "requestId",
    "RequestID",
  ]);

  if (!orderId && !requestId) {
    throw new Error(
      "order_id or request_id is required.",
    );
  }

  const payload = await clubKonnectGet(
    "APIQueryV1.asp",
    {
      OrderID: orderId || undefined,
      RequestID: requestId || undefined,
    },
  );

  return classifyProviderResponse(payload);
}

async function reconcileTransaction(
  userId: string,
  body: Record<string, unknown>,
) {
  const reference = optionalString(body, [
    "request_id",
    "requestId",
    "reference",
    "reference_number",
  ]);

  const orderId = optionalString(body, [
    "order_id",
    "orderId",
  ]);

  if (!reference && !orderId) {
    throw new Error(
      "request_id or order_id is required.",
    );
  }

  const payload = await clubKonnectGet(
    "APIQueryV1.asp",
    {
      OrderID: orderId || undefined,
      RequestID: reference || undefined,
    },
  );

  const result = classifyProviderResponse(payload);

  if (reference) {
    const { data: transaction } = await adminClient
      .from("transactions")
      .select(
        "id,user_id,amount,status,provider_reference",
      )
      .eq("reference_number", reference)
      .eq("user_id", userId)
      .maybeSingle();

    if (transaction) {
      if (result.success) {
        await updateTransaction(transaction.id, {
          status: "successful",
          provider_reference:
            result.orderId ||
            transaction.provider_reference ||
            null,
          metadata: {
            reconciliation: payload,
          },
        });
      }
    }
  }

  return result;
}

async function handler(
  request: Request,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (request.method !== "POST") {
    return json(
      {
        success: false,
        error: "Only POST requests are supported.",
      },
      405,
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

    let body: Record<string, unknown>;

    try {
      body = await request.json();
    } catch {
      return json(
        {
          success: false,
          error: "Invalid JSON request body.",
        },
        400,
      );
    }

    /*
     * IMPORTANT:
     *
     * This explicitly normalizes the action BEFORE routing.
     *
     * Therefore:
     *
     * { action: "catalog", service: "airtime" }
     *
     * will always enter the catalog branch.
     */
    const action =
      normalizeAction(body.action) ??
      "purchase";

    if (action === "catalog" ||
        action === "get_catalog" ||
        action === "plans") {
      const service = normalizeService(body.service);

      if (!service) {
        return json(
          {
            success: false,
            error: "A valid service is required.",
          },
          400,
        );
      }

      if (
        COMING_SOON_SERVICES.has(
          String(body.service ?? "")
            .trim()
            .toLowerCase(),
        )
      ) {
        return json(
          {
            success: false,
            error: "This service is coming soon.",
            service,
          },
          400,
        );
      }

      if (!SUPPORTED_SERVICES.has(service)) {
        return json(
          {
            success: false,
            error: `Unsupported service: ${service}`,
          },
          400,
        );
      }

      const networkCode = optionalString(body, [
        "network_code",
        "networkCode",
        "mobile_network",
        "mobileNetwork",
      ]);

      const billerCode = optionalString(body, [
        "biller_code",
        "billerCode",
        "electric_company",
        "electricCompany",
        "cable_tv",
        "cableTV",
        "cable_code",
        "cableCode",
      ]);

      const catalog = await getCatalog(
        service,
        networkCode || undefined,
        billerCode || undefined,
      );

      return json(catalog, 200);
    }

    if (
      action === "verify_meter"
    ) {
      const result = await verifyMeter(body);

      return json(result, result.success ? 200 : 400);
    }

    if (
      action === "verify_cable"
    ) {
      const result = await verifyCable(body);

      return json(result, result.success ? 200 : 400);
    }

    if (
      action === "status" ||
      action === "check_status"
    ) {
      const result = await queryStatus(body);

      return json(
        {
          success: result.success,
          ...result,
        },
        200,
      );
    }

    if (action === "reconcile") {
      const result = await reconcileTransaction(
        user.id,
        body,
      );

      return json(
        {
          success: result.success,
          ...result,
        },
        200,
      );
    }

    if (
      action === "purchase" ||
      action === "buy" ||
      action === "pay"
    ) {
      const service = normalizeService(body.service);

      if (!service) {
        return json(
          {
            success: false,
            error: "A valid service is required.",
          },
          400,
        );
      }

      if (!SUPPORTED_SERVICES.has(service)) {
        return json(
          {
            success: false,
            error: `Unsupported service: ${service}`,
          },
          400,
        );
      }

      const paymentPin = optionalString(body, [
        "payment_pin",
        "paymentPin",
        "pin",
      ]);

      if (paymentPin) {
        await verifyPaymentPin(
          user.id,
          paymentPin,
        );
      }

      const result = await purchaseService(
        user.id,
        service,
        body,
      );

      return json(
        {
          success: result.success,
          service,
          status: result.status,
          statusCode: result.statusCode,
          orderId: result.orderId,
          requestId: result.requestId,
          message: result.message,
        },
        result.success ? 200 : 400,
      );
    }

    return json(
      {
        success: false,
        error: `Unsupported action: ${String(body.action ?? "")}`,
      },
      400,
    );
  } catch (error) {
    console.error(
      "clubkonnect-service error:",
      error,
    );

    return json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred.",
      },
      500,
    );
  }
}

Deno.serve(handler);

export default handler;
