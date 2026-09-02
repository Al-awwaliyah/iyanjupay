import {
  corsHeaders,
  json,
  adminClient,
  getUser,
} from "../_shared/auth.ts";



type DataService = "data";

type JsonObject = Record<string, any>;

type CatalogNetwork = {
  code: string;
  name: string;
  raw: JsonObject;
};

type CatalogPlan = {
  id: string;
  networkCode: string;
  name: string;
  price: number;
  validityDays: number | null;
  planType: string;
  period: string;
  isHotDeal: boolean;
  raw: JsonObject;
};

const CLUBKONNECT_BASE =
  "https://www.nellobytesystems.com";

const NETWORK_NAME_ALIASES: Record<string, string> = {
  "01": "MTN",
  "02": "Glo",
  "03": "9mobile",
  "04": "Airtel",
};

const DEFINITIVE_FAILURE_TEXT = new Set([
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
  "INSUFFICIENT_BALANCE",
  "INSUFFICIENT_FUNDS",
]);

const PENDING_TEXT = new Set([
  "ORDER_RECEIVED",
  "ORDER_ONHOLD",
  "ORDER_PROCESSED",
  "PROCESSING",
  "PENDING",
  "NETWORK_UNRESPONSIVE",
]);

function cleanString(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeStatus(value: unknown): string {
  return cleanString(value)
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

function normalizeAmount(value: unknown): number {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return 0;
  return Math.round(amount * 100) / 100;
}

function firstNonEmpty(...values: unknown[]): unknown {
  for (const value of values) {
    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ""
    ) {
      return value;
    }
  }
  return undefined;
}

function toObject(value: unknown): JsonObject {
  return value && typeof value === "object"
    ? (value as JsonObject)
    : {};
}

function getArray(body: unknown): any[] {
  if (Array.isArray(body)) return body;
  const object = toObject(body);
  const candidates = [
    object.data,
    object.Data,
    object.networks,
    object.Networks,
    object.plans,
    object.Plans,
    object.result,
    object.Result,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }

  return [];
}

function getProviderCredentials() {
  const userId = cleanString(
    Deno.env.get("CLUBKONNECT_USER_ID") ??
      Deno.env.get("CLUBKONNECT_USERID"),
  );

  const apiKey = cleanString(
    Deno.env.get("CLUBKONNECT_API_KEY") ??
      Deno.env.get("CLUBKONNECT_APIKEY"),
  );

  if (!userId || !apiKey) {
    throw new Error(
      "ClubKonnect credentials are not configured.",
    );
  }

  return { userId, apiKey };
}

function getCallbackUrl(): string {
  const configured = cleanString(
    Deno.env.get("CLUBKONNECT_CALLBACK_URL"),
  );

  if (configured) return configured;

  const supabaseUrl = cleanString(
    Deno.env.get("SUPABASE_URL"),
  );

  if (!supabaseUrl) return "";

  return `${supabaseUrl.replace(/\/$/, "")}/functions/v1/clubkonnect-webhook`;
}

function buildUrl(
  endpoint: string,
  params: Record<string, string | number | undefined>,
): string {
  const url = new URL(`${CLUBKONNECT_BASE}/${endpoint}`);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && String(value) !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

async function clubKonnectGet(
  endpoint: string,
  params: Record<string, string | number | undefined>,
) {
  const { userId, apiKey } = getProviderCredentials();

  const url = buildUrl(endpoint, {
    UserID: userId,
    APIKey: apiKey,
    ...params,
  });

  console.log(
    "ClubKonnect request:",
    JSON.stringify({
      endpoint,
      parameter_names: Object.keys(params),
    }),
  );

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  const text = await response.text();

  let body: any = {};

  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = {
      status: "NON_JSON_RESPONSE",
      message: "ClubKonnect returned a non-JSON response.",
      data: null,
    };
  }

  console.log(
    "ClubKonnect response:",
    JSON.stringify({
      endpoint,
      http_status: response.status,
      ok: response.ok,
      status: firstNonEmpty(
        body?.status,
        body?.Status,
        body?.orderstatus,
        body?.OrderStatus,
      ) ?? null,
      statuscode: firstNonEmpty(
        body?.statuscode,
        body?.statusCode,
        body?.StatusCode,
      ) ?? null,
      orderid: firstNonEmpty(
        body?.orderid,
        body?.orderId,
        body?.OrderID,
      ) ?? null,
    }),
  );

  return {
    ok: response.ok,
    status: response.status,
    body,
  };
}

function extractStatusCode(body: any): number | null {
  const value = Number(
    firstNonEmpty(
      body?.statuscode,
      body?.statusCode,
      body?.StatusCode,
      body?.data?.statuscode,
      body?.data?.statusCode,
    ),
  );

  return Number.isFinite(value) ? value : null;
}

function extractOrderId(body: any): string | null {
  const value = firstNonEmpty(
    body?.orderid,
    body?.orderId,
    body?.OrderID,
    body?.data?.orderid,
    body?.data?.orderId,
    body?.data?.OrderID,
  );

  return value ? cleanString(value) : null;
}

function extractRequestId(body: any): string | null {
  const value = firstNonEmpty(
    body?.requestid,
    body?.requestId,
    body?.RequestID,
    body?.data?.requestid,
    body?.data?.requestId,
    body?.data?.RequestID,
  );

  return value ? cleanString(value) : null;
}

function extractStatusText(body: any): string {
  return normalizeStatus(
    firstNonEmpty(
      body?.status,
      body?.Status,
      body?.orderstatus,
      body?.OrderStatus,
      body?.data?.status,
      body?.data?.orderstatus,
    ),
  );
}

function classifyProviderResponse(body: any, httpOk = true) {
  const statusCode = extractStatusCode(body);
  const statusText = extractStatusText(body);

  if (!httpOk) {
    return {
      state: "pending" as const,
      definitiveFailure: false,
      statusCode,
      statusText,
    };
  }

  if (
    statusCode === 200 ||
    statusText === "ORDER_COMPLETED" ||
    statusText === "SUCCESS" ||
    statusText === "SUCCESSFUL"
  ) {
    return {
      state: "successful" as const,
      definitiveFailure: false,
      statusCode,
      statusText,
    };
  }

  if (
    statusText &&
    DEFINITIVE_FAILURE_TEXT.has(statusText)
  ) {
    return {
      state: "failed" as const,
      definitiveFailure: true,
      statusCode,
      statusText,
    };
  }

  if (
    statusText &&
    PENDING_TEXT.has(statusText)
  ) {
    return {
      state: "pending" as const,
      definitiveFailure: false,
      statusCode,
      statusText,
    };
  }

  // ClubKonnect documents 100 as ORDER_RECEIVED and 300 as
  // ORDER_PROCESSED. Unknown/ambiguous states stay pending so a
  // provider request can never be incorrectly refunded.
  return {
    state: "pending" as const,
    definitiveFailure: false,
    statusCode,
    statusText,
  };
}

function parseValidityDays(text: string): number | null {
  const match = text.match(/(?:-|\b)(\d+)\s*day/i);
  if (match) return Number(match[1]);

  const monthMatch = text.match(/(?:-|\b)(\d+)\s*month/i);
  if (monthMatch) return Number(monthMatch[1]) * 30;

  const yearMatch = text.match(/(?:-|\b)(\d+)\s*year/i);
  if (yearMatch) return Number(yearMatch[1]) * 365;

  return null;
}

function inferPeriod(text: string, days: number | null): string {
  const lower = text.toLowerCase();

  if (lower.includes("daily") || days === 1) return "daily";
  if (lower.includes("weekly") || days === 7) return "weekly";
  if (lower.includes("monthly") || days === 30) return "monthly";

  return "other";
}

function inferPlanType(text: string, raw: JsonObject): string {
  return cleanString(
    firstNonEmpty(
      raw?.plantype,
      raw?.plan_type,
      raw?.planType,
      raw?.type,
      raw?.category,
      raw?.category_name,
      text.match(/\(([^)]+)\)/)?.[1],
      "Data",
    ),
  );
}

function inferHotDeal(planType: string, text: string, raw: JsonObject): boolean {
  if (typeof raw?.is_hot_deal === "boolean") {
    return raw.is_hot_deal;
  }

  const normalizedType = planType.toLowerCase();
  const normalizedText = text.toLowerCase();

  // IyanjuPay business rule: SME plans are surfaced in HOT DEALS.
  // This is calculated on the server, not guessed by the frontend.
  return (
    normalizedType.includes("sme") ||
    normalizedText.includes("(sme)")
  );
}

function normalizeNetwork(raw: any): CatalogNetwork | null {
  const object = toObject(raw);

  const code = cleanString(
    firstNonEmpty(
      object?.networkid,
      object?.network_id,
      object?.networkCode,
      object?.network_code,
      object?.code,
      object?.id,
      object?.MobileNetwork,
      object?.mobilenetwork,
      object?.MobileNetworkID,
    ),
  );

  if (!code) return null;

  const name = cleanString(
    firstNonEmpty(
      object?.network,
      object?.Network,
      object?.name,
      object?.NetworkName,
      object?.network_name,
      NETWORK_NAME_ALIASES[code],
      code,
    ),
  );

  return {
    code,
    name,
    raw: object,
  };
}

function extractNetworkCodeFromPlan(raw: any): string {
  const object = toObject(raw);

  return cleanString(
    firstNonEmpty(
      object?.networkid,
      object?.network_id,
      object?.networkCode,
      object?.network_code,
      object?.MobileNetwork,
      object?.mobilenetwork,
      object?.MobileNetworkID,
      object?.network,
    ),
  );
}

function normalizePlan(
  raw: any,
  fallbackNetworkCode = "",
): CatalogPlan | null {
  const object = toObject(raw);

  const id = cleanString(
    firstNonEmpty(
      object?.dataplan,
      object?.data_plan,
      object?.dataPlan,
      object?.planid,
      object?.plan_id,
      object?.planId,
      object?.id,
      object?.code,
      object?.DataPlan,
    ),
  );

  if (!id) return null;

  const name = cleanString(
    firstNonEmpty(
      object?.name,
      object?.plan,
      object?.plan_name,
      object?.planName,
      object?.description,
      object?.DataPlanName,
      id,
    ),
  );

  const price = normalizeAmount(
    firstNonEmpty(
      object?.price,
      object?.amount,
      object?.selling_price,
      object?.sellingPrice,
      object?.Price,
      object?.Amount,
    ),
  );

  if (price <= 0) return null;

  const networkCode = cleanString(
    extractNetworkCodeFromPlan(object) || fallbackNetworkCode,
  );

  if (!networkCode) return null;

  const validityDays =
    Number.isFinite(Number(object?.validity_days))
      ? Number(object.validity_days)
      : parseValidityDays(name);

  const planType = inferPlanType(name, object);
  const period = inferPeriod(name, validityDays);

  return {
    id,
    networkCode,
    name,
    price,
    validityDays,
    planType,
    period,
    isHotDeal: inferHotDeal(planType, name, object),
    raw: object,
  };
}

async function loadNetworks(): Promise<CatalogNetwork[]> {
  const response = await clubKonnectGet(
    "APIDatabundleNetworkV2.asp",
    {},
  );

  if (!response.ok) {
    throw new Error("ClubKonnect network catalog request failed.");
  }

  const source = getArray(response.body);
  const networks = source
    .map(normalizeNetwork)
    .filter(Boolean) as CatalogNetwork[];

  return networks;
}

async function loadPlans(): Promise<CatalogPlan[]> {
  const response = await clubKonnectGet(
    "APIDatabundlePlansV2.asp",
    {},
  );

  if (!response.ok) {
    throw new Error("ClubKonnect data plan catalog request failed.");
  }

  const source = getArray(response.body);
  const plans: CatalogPlan[] = [];

  let currentNetworkCode = "";

  for (const raw of source) {
    const object = toObject(raw);

    const possibleNetwork = normalizeNetwork(object);
    if (possibleNetwork) {
      currentNetworkCode = possibleNetwork.code;
    }

    const plan = normalizePlan(
      object,
      currentNetworkCode,
    );

    if (plan) plans.push(plan);
  }

  // Some ClubKonnect responses return a network-keyed object instead
  // of a flat array. Handle that shape too.
  if (!plans.length && response.body && typeof response.body === "object") {
    const root = toObject(response.body);

    for (const [key, value] of Object.entries(root)) {
      if (!Array.isArray(value)) continue;

      for (const raw of value) {
        const plan = normalizePlan(raw, key);
        if (plan) plans.push(plan);
      }
    }
  }

  const unique = new Map<string, CatalogPlan>();

  for (const plan of plans) {
    unique.set(`${plan.networkCode}:${plan.id}`, plan);
  }

  return Array.from(unique.values());
}

function publicNetwork(network: CatalogNetwork) {
  return {
    code: network.code,
    name: network.name,
  };
}

function publicPlan(
  plan: CatalogPlan,
  publicNetworkCode: string,
) {
  return {
    item_code: plan.id,
    biller_code: publicNetworkCode,
    name: plan.name,
    description: plan.name,
    amount: plan.price,
    selling_price: plan.price,
    provider_amount: plan.price,
    provider_id: "clubkonnect",
    service: "data",
    network_code: publicNetworkCode,
    plan_period: plan.period,
    plan_type: plan.planType,
    validity_days: plan.validityDays,
    is_hot_deal: plan.isHotDeal,
  };
}

function extractPhone(body: JsonObject, details: JsonObject): string {
  return cleanString(
    firstNonEmpty(
      body?.customer,
      body?.phone,
      body?.phone_number,
      body?.phoneNumber,
      body?.mobile_number,
      body?.mobileNumber,
      details?.customer,
      details?.phone,
      details?.phone_number,
      details?.phoneNumber,
      details?.mobile_number,
      details?.mobileNumber,
    ),
  );
}

function validNigeriaMobile(phone: string): boolean {
  return /^(?:0\d{10}|234\d{10})$/.test(phone);
}

function normalizeNigeriaMobile(phone: string): string {
  const value = cleanString(phone).replace(/[\s-]/g, "");

  if (value.startsWith("234") && value.length === 13) {
    return `0${value.slice(3)}`;
  }

  return value;
}

function extractPublicReference(body: JsonObject, details: JsonObject): string {
  return cleanString(
    firstNonEmpty(
      body?.reference,
      body?.transaction_reference,
      details?.reference,
    ),
  );
}

async function getLocalTransaction(
  admin: any,
  userId: string,
  reference: string,
) {
  const { data, error } = await admin
    .from("transactions")
    .select(
      `
        id,
        user_id,
        wallet_id,
        amount,
        status,
        description,
        reference_number,
        provider,
        provider_reference,
        metadata,
        created_at
      `,
    )
    .eq("user_id", userId)
    .eq("reference_number", reference)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function updateTransaction(
  admin: any,
  userId: string,
  reference: string,
  updates: Record<string, unknown>,
) {
  const { error } = await admin
    .from("transactions")
    .update(updates)
    .eq("user_id", userId)
    .eq("reference_number", reference);

  if (error) {
    console.error("ClubKonnect transaction update failed:", error);
  }
}

async function refundTransaction(
  admin: any,
  userId: string,
  reference: string,
  amount: number,
  reason: string,
  metadata: Record<string, unknown> = {},
) {
  const refundReference = `REFUND_${reference}`;

  const { data, error } = await admin.rpc(
    "refund_wallet",
    {
      _user_id: userId,
      _amount: amount,
      _description: "ClubKonnect service payment reversal",
      _idempotency_key: refundReference,
      _reference: refundReference,
      _metadata: {
        ...metadata,
        original_reference: reference,
        refund_reference: refundReference,
        provider: "clubkonnect",
        reason,
      },
    },
  );

  if (error) {
    console.error("ClubKonnect refund failed:", error);
    return { success: false, data: null, error };
  }

  return { success: true, data, error: null };
}

async function verifySelectedPlan(
  networkCode: string,
  planId: string,
): Promise<CatalogPlan | null> {
  const plans = await loadPlans();

  return (
    plans.find(
      (plan) =>
        plan.networkCode === networkCode &&
        plan.id === planId,
    ) ?? null
  );
}

function getRouteCode(body: JsonObject, details: JsonObject): string {
  return cleanString(
    firstNonEmpty(
      body?.biller_code,
      body?.billerCode,
      body?.network_code,
      body?.networkCode,
      details?.biller_code,
      details?.billerCode,
      details?.network_code,
      details?.networkCode,
    ),
  );
}

function getPlanCode(body: JsonObject, details: JsonObject): string {
  return cleanString(
    firstNonEmpty(
      body?.item_code,
      body?.itemCode,
      body?.data_plan,
      body?.dataPlan,
      details?.item_code,
      details?.itemCode,
      details?.data_plan,
      details?.dataPlan,
    ),
  );
}

function providerMetadata(
  reference: string,
  networkCode: string,
  plan: CatalogPlan,
  phone: string,
) {
  return {
    service: "data",
    category: "MOBILEDATA",
    provider: "clubkonnect",
    provider_id: "clubkonnect",
    biller_code: networkCode,
    item_code: plan.id,
    network_code: networkCode,
    customer: phone,
    provider_amount: plan.price,
    selling_amount: plan.price,
    markup_amount: 0,
    markup_rate: 0,
    plan_name: plan.name,
    plan_period: plan.period,
    plan_type: plan.planType,
    validity_days: plan.validityDays,
    is_hot_deal: plan.isHotDeal,
    request_id: reference,
    reconciliation_required: true,
  };
}

function sanitizeProviderResponse(body: any) {
  return {
    status: firstNonEmpty(
      body?.status,
      body?.orderstatus,
      body?.Status,
      body?.OrderStatus,
    ) ?? null,
    statuscode: extractStatusCode(body),
    orderid: extractOrderId(body),
    requestid: extractRequestId(body),
    remark: firstNonEmpty(
      body?.remark,
      body?.orderremark,
      body?.OrderRemark,
    ) ?? null,
  };
}

function errorResponse(message: string, status = 400) {
  return json({ success: false, error: message }, status);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorResponse("Method not allowed.", 405);
  }

  const user = await getUser(req);

  if (!user) {
    return errorResponse("Authentication required.", 401);
  }

  const admin = adminClient();

  let body: JsonObject;

  try {
    body = toObject(await req.json());
  } catch {
    return errorResponse("Invalid request body.", 400);
  }

  const action = cleanString(body?.action).toLowerCase();
  const details = toObject(body?.details);

  console.log(
    "clubkonnect-services request:",
    JSON.stringify({
      action,
      user_id: user.id,
      service: body?.service ?? details?.service ?? "data",
    }),
  );

  /* ==========================================================
   * ACTION: BILLERS
   * ==========================================================
   *
   * Data billers are ClubKonnect mobile networks.
   */
  if (action === "billers" || action === "networks") {
    try {
      const networks = await loadNetworks();

      if (!networks.length) {
        return errorResponse(
          "No mobile networks are currently available.",
          502,
        );
      }

      return json({
        success: true,
        service: "data",
        billers: networks.map(publicNetwork),
      });
    } catch (error) {
      console.error("ClubKonnect networks error:", error);
      return errorResponse(
        "Unable to load mobile networks right now.",
        502,
      );
    }
  }

  /* ==========================================================
   * ACTION: ITEMS
   * ==========================================================
   */
  if (action === "items" || action === "plans") {
    const networkCode = getRouteCode(body, details);

    if (!networkCode) {
      return errorResponse("A valid mobile network is required.");
    }

    try {
      const networks = await loadNetworks();
      const network = networks.find(
        (entry) => entry.code === networkCode,
      );

      if (!network) {
        return errorResponse(
          "The selected mobile network is no longer available.",
          400,
        );
      }

      const plans = await loadPlans();
      const networkPlans = plans.filter(
        (plan) => plan.networkCode === networkCode,
      );

      return json({
        success: true,
        service: "data",
        biller_code: networkCode,
        biller: publicNetwork(network),
        items: networkPlans.map((plan) =>
          publicPlan(plan, networkCode),
        ),
      });
    } catch (error) {
      console.error("ClubKonnect data plans error:", error);
      return errorResponse(
        "Unable to load data plans right now.",
        502,
      );
    }
  }

  /* ==========================================================
   * ACTION: VALIDATE
   * ==========================================================
   *
   * Data does not require a provider account lookup. We instead
   * validate the network and plan against the live catalog.
   */
  if (action === "validate") {
    const networkCode = getRouteCode(body, details);
    const planId = getPlanCode(body, details);

    if (!networkCode || !planId) {
      return errorResponse(
        "A valid mobile network and data plan are required.",
      );
    }

    try {
      const plan = await verifySelectedPlan(
        networkCode,
        planId,
      );

      if (!plan) {
        return errorResponse(
          "The selected data plan is no longer available.",
          400,
        );
      }

      return json({
        success: true,
        service: "data",
        validated: true,
        status: "successful",
        data: publicPlan(plan, networkCode),
      });
    } catch (error) {
      console.error("ClubKonnect data validation error:", error);
      return errorResponse(
        "Unable to validate the selected data plan.",
        502,
      );
    }
  }

  /* ==========================================================
   * ACTION: PAY
   * ==========================================================
   */
  if (action === "pay" || action === "service") {
    const service = cleanString(
      body?.service ?? details?.service ?? "data",
    ).toLowerCase();

    if (service !== "data") {
      return errorResponse(
        "This ClubKonnect service currently supports data only.",
        400,
      );
    }

    const networkCode = getRouteCode(body, details);
    const planId = getPlanCode(body, details);
    const rawPhone = extractPhone(body, details);
    const phone = normalizeNigeriaMobile(rawPhone);

    if (!networkCode) {
      return errorResponse("A valid mobile network is required.");
    }

    if (!planId) {
      return errorResponse("A valid data plan is required.");
    }

    if (!validNigeriaMobile(phone)) {
      return errorResponse(
        "Enter a valid Nigerian mobile number.",
      );
    }

    /* --------------------------------------------------------
     * Re-read the live catalog BEFORE debiting the wallet.
     * Never trust amount/price sent by the browser.
     * -------------------------------------------------------- */
    let plan: CatalogPlan | null = null;

    try {
      plan = await verifySelectedPlan(
        networkCode,
        planId,
      );
    } catch (error) {
      console.error(
        "ClubKonnect live plan verification failed:",
        error,
      );

      return errorResponse(
        "Unable to verify the selected data plan. Please try again.",
        502,
      );
    }

    if (!plan) {
      return errorResponse(
        "The selected data plan is no longer available.",
        400,
      );
    }

    const sellingAmount = plan.price;
    const reference = `DATA_${crypto.randomUUID()}`;
    const metadata = providerMetadata(
      reference,
      networkCode,
      plan,
      phone,
    );

    /* --------------------------------------------------------
     * DEBIT WALLET
     * -------------------------------------------------------- */
    const { data: debitResult, error: debitError } =
      await admin.rpc("debit_wallet", {
        _user_id: user.id,
        _amount: sellingAmount,
        _description: "Data bundle payment",
        _idempotency_key: reference,
        _reference: reference,
        _category: "bill_payment",
        _metadata: metadata,
      });

    if (debitError) {
      console.error(
        "ClubKonnect data wallet debit failed:",
        debitError,
      );

      return errorResponse(
        "Unable to process the payment from your wallet.",
        400,
      );
    }

    const transactionId = debitResult?.id ?? null;

    /* --------------------------------------------------------
     * SUBMIT TO CLUBKONNECT
     * -------------------------------------------------------- */
    let providerResponse: any;

    try {
      providerResponse = await clubKonnectGet(
        "APIDatabundleV1.asp",
        {
          MobileNetwork: networkCode,
          DataPlan: plan.id,
          MobileNumber: phone,
          RequestID: reference,
          CallBackURL: getCallbackUrl() || undefined,
        },
      );
    } catch (error) {
      /*
       * A transport exception does NOT prove that ClubKonnect did
       * not receive the order. Keep the transaction pending and
       * reconcile using RequestID when possible.
       */
      console.error(
        "ClubKonnect data request exception:",
        error,
      );

      await updateTransaction(
        admin,
        user.id,
        reference,
        {
          status: "pending",
          provider: "clubkonnect",
          metadata: {
            ...metadata,
            provider_request_failed: true,
            provider_request_error:
              error instanceof Error
                ? error.message
                : String(error),
            reconciliation_required: true,
          },
        },
      );

      return json({
        success: true,
        status: "pending",
        reference,
        transaction_id: transactionId,
        message: "Your data purchase is being verified.",
      });
    }

    const classified = classifyProviderResponse(
      providerResponse.body,
      providerResponse.ok,
    );

    const orderId = extractOrderId(providerResponse.body);
    const requestId =
      extractRequestId(providerResponse.body) ?? reference;

    /* --------------------------------------------------------
     * SUCCESS
     * -------------------------------------------------------- */
    if (classified.state === "successful") {
      await updateTransaction(
        admin,
        user.id,
        reference,
        {
          status: "successful",
          provider: "clubkonnect",
          provider_reference: orderId ?? requestId,
          completed_at: new Date().toISOString(),
          metadata: {
            ...metadata,
            clubkonnect_order_id: orderId,
            clubkonnect_request_id: requestId,
            clubkonnect_statuscode:
              classified.statusCode,
            clubkonnect_status:
              classified.statusText,
            clubkonnect_response:
              sanitizeProviderResponse(
                providerResponse.body,
              ),
            reconciliation_required: false,
            reconciled_at: new Date().toISOString(),
          },
        },
      );

      return json({
        success: true,
        status: "successful",
        reference,
        transaction_id: transactionId,
        message: "Data purchase completed successfully.",
      });
    }

    /* --------------------------------------------------------
     * DEFINITIVE FAILURE
     * -------------------------------------------------------- */
    if (
      classified.state === "failed" &&
      classified.definitiveFailure
    ) {
      const refund = await refundTransaction(
        admin,
        user.id,
        reference,
        sellingAmount,
        "ClubKonnect data purchase failed.",
        {
          ...metadata,
          clubkonnect_order_id: orderId,
          clubkonnect_request_id: requestId,
          clubkonnect_statuscode:
            classified.statusCode,
          clubkonnect_status:
            classified.statusText,
          clubkonnect_response:
            sanitizeProviderResponse(
              providerResponse.body,
            ),
        },
      );

      await updateTransaction(
        admin,
        user.id,
        reference,
        {
          status: "failed",
          provider: "clubkonnect",
          provider_reference: orderId ?? requestId,
          metadata: {
            ...metadata,
            clubkonnect_order_id: orderId,
            clubkonnect_request_id: requestId,
            clubkonnect_statuscode:
              classified.statusCode,
            clubkonnect_status:
              classified.statusText,
            clubkonnect_response:
              sanitizeProviderResponse(
                providerResponse.body,
              ),
            refunded: refund.success,
            refund_pending: !refund.success,
            refund_error:
              refund.error?.message ?? null,
          },
        },
      );

      if (!refund.success) {
        return json(
          {
            success: false,
            status: "failed",
            reference,
            error:
              "The payment failed, but the automatic refund requires retry.",
          },
          503,
        );
      }

      return json({
        success: false,
        status: "failed",
        reference,
        refunded: true,
        message:
          "Data purchase failed. Your wallet has been refunded.",
      });
    }

    /* --------------------------------------------------------
     * PENDING / AMBIGUOUS
     * -------------------------------------------------------- */
    await updateTransaction(
      admin,
      user.id,
      reference,
      {
        status: "pending",
        provider: "clubkonnect",
        provider_reference: orderId ?? requestId,
        metadata: {
          ...metadata,
          clubkonnect_order_id: orderId,
          clubkonnect_request_id: requestId,
          clubkonnect_statuscode:
            classified.statusCode,
          clubkonnect_status:
            classified.statusText,
          clubkonnect_response:
            sanitizeProviderResponse(
              providerResponse.body,
            ),
          reconciliation_required: true,
          last_submitted_at: new Date().toISOString(),
        },
      },
    );

    return json({
      success: true,
      status: "pending",
      reference,
      transaction_id: transactionId,
      message: "Your data purchase is being processed.",
    });
  }

  /* ==========================================================
   * ACTION: STATUS
   * ==========================================================
   */
  if (action === "status") {
    const reference = extractPublicReference(
      body,
      details,
    );

    if (!reference) {
      return errorResponse(
        "Transaction reference is required.",
      );
    }

    let txn: any;

    try {
      txn = await getLocalTransaction(
        admin,
        user.id,
        reference,
      );
    } catch (error) {
      console.error(
        "ClubKonnect transaction lookup failed:",
        error,
      );

      return errorResponse(
        "Unable to retrieve the transaction right now.",
        500,
      );
    }

    if (!txn) {
      return errorResponse("Transaction not found.", 404);
    }

    const metadata = toObject(txn.metadata);
    const orderId = cleanString(
      firstNonEmpty(
        metadata?.clubkonnect_order_id,
        txn.provider_reference,
      ),
    );
    const requestId = cleanString(
      firstNonEmpty(
        metadata?.clubkonnect_request_id,
        metadata?.request_id,
        reference,
      ),
    );

    if (txn.status === "successful") {
      return json({
        success: true,
        status: "successful",
        reference,
        message: "Data purchase completed successfully.",
      });
    }

    if (txn.status === "failed" && metadata?.refunded) {
      return json({
        success: false,
        status: "failed",
        reference,
        refunded: true,
        message:
          "Data purchase failed. Your wallet has been refunded.",
      });
    }

    if (!orderId && !requestId) {
      return json({
        success: true,
        status: "pending",
        reference,
        message: "Your data purchase is still being verified.",
      });
    }

    let response: any;

    try {
      response = await clubKonnectGet(
        "APIQueryV1.asp",
        orderId
          ? { OrderID: orderId }
          : { RequestID: requestId },
      );
    } catch (error) {
      console.error(
        "ClubKonnect status request failed:",
        error,
      );

      await updateTransaction(
        admin,
        user.id,
        reference,
        {
          status: "pending",
          metadata: {
            ...metadata,
            reconciliation_required: true,
            last_status_check_failed: true,
            last_status_check_at:
              new Date().toISOString(),
          },
        },
      );

      return json({
        success: true,
        status: "pending",
        reference,
        message: "Your data purchase is still being verified.",
      });
    }

    const classified = classifyProviderResponse(
      response.body,
      response.ok,
    );

    const responseOrderId = extractOrderId(response.body);
    const resolvedOrderId =
      responseOrderId || orderId || requestId;

    if (classified.state === "successful") {
      await updateTransaction(
        admin,
        user.id,
        reference,
        {
          status: "successful",
          provider: "clubkonnect",
          provider_reference: resolvedOrderId,
          completed_at: new Date().toISOString(),
          metadata: {
            ...metadata,
            clubkonnect_order_id:
              responseOrderId ?? orderId ?? null,
            clubkonnect_request_id: requestId,
            clubkonnect_statuscode:
              classified.statusCode,
            clubkonnect_status:
              classified.statusText,
            clubkonnect_response:
              sanitizeProviderResponse(response.body),
            reconciliation_required: false,
            reconciled_at: new Date().toISOString(),
          },
        },
      );

      return json({
        success: true,
        status: "successful",
        reference,
        message: "Data purchase completed successfully.",
      });
    }

    if (
      classified.state === "failed" &&
      classified.definitiveFailure
    ) {
      const amount = normalizeAmount(txn.amount);

      const refund = await refundTransaction(
        admin,
        user.id,
        reference,
        amount,
        "ClubKonnect data purchase failed during reconciliation.",
        {
          ...metadata,
          clubkonnect_order_id:
            responseOrderId ?? orderId ?? null,
          clubkonnect_request_id: requestId,
          clubkonnect_statuscode:
            classified.statusCode,
          clubkonnect_status:
            classified.statusText,
          clubkonnect_response:
            sanitizeProviderResponse(response.body),
          refund_trigger: "status_reconciliation",
        },
      );

      await updateTransaction(
        admin,
        user.id,
        reference,
        {
          status: "failed",
          provider: "clubkonnect",
          provider_reference: resolvedOrderId,
          metadata: {
            ...metadata,
            clubkonnect_order_id:
              responseOrderId ?? orderId ?? null,
            clubkonnect_request_id: requestId,
            clubkonnect_statuscode:
              classified.statusCode,
            clubkonnect_status:
              classified.statusText,
            clubkonnect_response:
              sanitizeProviderResponse(response.body),
            refunded: refund.success,
            refund_pending: !refund.success,
            refund_error:
              refund.error?.message ?? null,
            reconciliation_required: !refund.success,
          },
        },
      );

      if (!refund.success) {
        return json(
          {
            success: false,
            status: "failed",
            reference,
            error:
              "The payment failed, but the automatic refund requires retry.",
          },
          503,
        );
      }

      return json({
        success: false,
        status: "failed",
        reference,
        refunded: true,
        message:
          "Data purchase failed. Your wallet has been refunded.",
      });
    }

    await updateTransaction(
      admin,
      user.id,
      reference,
      {
        status: "pending",
        provider: "clubkonnect",
        provider_reference: resolvedOrderId,
        metadata: {
          ...metadata,
          clubkonnect_order_id:
            responseOrderId ?? orderId ?? null,
          clubkonnect_request_id: requestId,
          clubkonnect_statuscode:
            classified.statusCode,
          clubkonnect_status:
            classified.statusText,
          clubkonnect_response:
            sanitizeProviderResponse(response.body),
          reconciliation_required: true,
          last_reconciled_at:
            new Date().toISOString(),
        },
      },
    );

    return json({
      success: true,
      status: "pending",
      reference,
      message: "Your data purchase is still being verified.",
    });
  }

  return errorResponse("Unsupported action.", 400);
});
