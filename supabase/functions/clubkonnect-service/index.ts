import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * ============================================================
 * IYANJUPAY — CLUBKONNECT SERVICE
 * ============================================================
 *
 * PUBLIC ACTIONS:
 *
 *   health
 *   catalog
 *   balance
 *
 * AUTHENTICATED ACTIONS:
 *
 *   verify
 *   query
 *   purchase
 *
 * SUPPORTED SERVICES:
 *
 *   airtime
 *   data
 *   cable_tv
 *   electricity
 *   airtime_epin
 *   data_epin
 *   smile
 *   waec
 *   jamb
 *
 * NOT SUPPORTED:
 *
 *   betting
 *
 * PRICING:
 *
 *   Regular:
 *     airtime       15%
 *     data          15%
 *     cable_tv      15%
 *     electricity  15%
 *
 *   Premium:
 *     airtime_epin 20%
 *     data_epin    20%
 *     smile        20%
 *     waec         20%
 *     jamb         20%
 *
 * SECURITY:
 *
 *   - Public health/catalog/balance endpoints do not require login.
 *   - Verification/query/purchase require a valid Supabase user.
 *   - Provider credentials are never returned to clients.
 *   - Wallet is held before provider purchase.
 *   - Provider is called only after successful wallet HOLD.
 *   - Successful provider orders are finalized by RPC.
 *   - Failed provider orders release the HOLD.
 *   - Queued orders remain held.
 *   - Provider references are stored in transaction metadata/RPC.
 *   - Betting is permanently rejected.
 *
 * ============================================================
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":
    "POST, GET, OPTIONS",
};

const CLUBKONNECT_BASE_URL =
  "https://www.nellobytesystems.com";

const SUPPORTED_SERVICES = [
  "airtime",
  "data",
  "cable_tv",
  "electricity",
  "airtime_epin",
  "data_epin",
  "smile",
  "waec",
  "jamb",
] as const;

type SupportedService =
  (typeof SUPPORTED_SERVICES)[number];

type Action =
  | "health"
  | "balance"
  | "catalog"
  | "verify"
  | "query"
  | "purchase";

const REGULAR_MARKUP = 0.15;
const PREMIUM_MARKUP = 0.20;

const PREMIUM_SERVICES =
  new Set<SupportedService>([
    "airtime_epin",
    "data_epin",
    "smile",
    "waec",
    "jamb",
  ]);

const PURCHASE_SERVICES =
  new Set<SupportedService>(
    SUPPORTED_SERVICES,
  );

const PUBLIC_ACTIONS =
  new Set<Action>([
    "health",
    "balance",
    "catalog",
  ]);

const ACTIVE_ORDER_STATUSES =
  new Set([
    "ORDER_RECEIVED",
    "ORDER_PROCESSING",
    "ORDER_PROCESSED",
    "ORDER_ONHOLD",
    "PROCESSING",
    "PENDING",
    "QUEUED",
  ]);

const SUCCESS_ORDER_STATUSES =
  new Set([
    "ORDER_COMPLETED",
    "COMPLETED",
    "SUCCESS",
    "SUCCESSFUL",
  ]);

const FAILURE_ORDER_STATUSES =
  new Set([
    "ORDER_FAILED",
    "FAILED",
    "ORDER_CANCELLED",
    "CANCELLED",
    "CANCELED",
    "DECLINED",
    "REJECTED",
  ]);

/**
 * ============================================================
 * SUPABASE CONFIGURATION
 * ============================================================
 */

const SUPABASE_URL =
  Deno.env.get("SUPABASE_URL") ?? "";

const SUPABASE_ANON_KEY =
  Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get(
    "SUPABASE_SERVICE_ROLE_KEY",
  ) ?? "";

const supabaseAdmin =
  SUPABASE_URL &&
  SUPABASE_SERVICE_ROLE_KEY
    ? createClient(
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
        },
      )
    : null;

/**
 * ============================================================
 * RESPONSE HELPERS
 * ============================================================
 */

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
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
    },
  );
}

function safeErrorMessage(
  code?: string,
  fallback =
    "Unable to process the request.",
): string {
  const value =
    String(code ?? "")
      .toUpperCase()
      .trim();

  const known: Record<
    string,
    string
  > = {
    AUTHENTICATION_REQUIRED:
      "Authentication is required.",

    SUPABASE_CONFIGURATION_ERROR:
      "The service is temporarily unavailable.",

    CLUBKONNECT_CONFIGURATION_ERROR:
      "The ClubKonnect service is temporarily unavailable.",

    CLUBKONNECT_NETWORK_ERROR:
      "The ClubKonnect service could not be reached.",

    CLUBKONNECT_INVALID_RESPONSE:
      "The ClubKonnect service returned an invalid response.",

    INSUFFICIENT_FUNDS:
      "Insufficient wallet balance.",

    WALLET_NOT_ACTIVE:
      "Your wallet is not currently active.",

    CATALOG_NOT_FOUND:
      "The selected service plan is unavailable.",

    INVALID_CATALOG:
      "The selected service plan is invalid.",

    UNSUPPORTED_SERVICE:
      "This service is not supported.",

    BETTING_DISABLED:
      "This service is not supported by IyanjuPay.",

    PURCHASE_NOT_ALLOWED:
      "This purchase cannot be processed.",

    PURCHASE_SETTLEMENT_FAILED:
      "The transaction is being reconciled. Please check your transaction history.",

    MISSING_SERVICE:
      "A service is required.",

    MISSING_CATALOG_ID:
      "A service plan is required.",

    MISSING_MOBILENETWORK:
      "A mobile network is required.",

    MISSING_AMOUNT:
      "An amount is required.",

    INVALID_AMOUNT:
      "The amount provided is invalid.",

    MINIMUM_50:
      "The minimum airtime amount is ₦50.",

    MAXIMUM_200000:
      "The maximum airtime amount is ₦200,000.",

    INVALID_RECIPIENT:
      "The recipient phone number is invalid.",

    MISSING_DATAPLAN:
      "A data plan is required.",

    INVALID_DATAPLAN:
      "The selected data plan is invalid.",

    DATAPLAN_NOT_AVAILABLE:
      "The selected data plan is currently unavailable.",

    MISSING_CABLETV:
      "A cable TV provider is required.",

    MISSING_PACKAGE:
      "A cable TV package is required.",

    INVALID_SMARTCARDNO:
      "The smartcard/IUC number is invalid.",

    PACKAGE_NOT_AVAILABLE:
      "The selected cable TV package is currently unavailable.",

    MISSING_ELECTRICITY:
      "An electricity provider is required.",

    MISSING_METERTYPE:
      "A meter type is required.",

    INVALID_METERNO:
      "The meter number is invalid.",

    METER_NOT_AVAILABLE:
      "The selected meter type is currently unavailable.",

    MISSING_VALUE:
      "An e-PIN value is required.",

    INVALID_VALUE:
      "The selected e-PIN value is invalid.",

    INVALID_QUANTITY:
      "The requested quantity is invalid.",

    MINIMUM_QUANTITY_1:
      "The minimum quantity is 1.",

    MAXIMUM_QUANTITY_100:
      "The maximum quantity is 100.",

    QUANTITY_NOT_AVAILABLE:
      "The requested quantity is unavailable.",

    PIN_NOT_AVAILABLE:
      "The requested e-PIN is currently unavailable.",

    MISSING_EXAMTYPE:
      "An examination package is required.",

    INVALID_PHONENO:
      "The phone number is invalid.",

    INVALID_ACCOUNTNO:
      "The account number is invalid.",

    REQUEST_ID_OR_ORDER_ID_REQUIRED:
      "Request ID or Order ID is required.",

    VERIFICATION_NOT_SUPPORTED:
      "Customer verification is not supported for this service.",

    ORDER_RECEIVED:
      "Your order has been received and is being processed.",

    ORDER_ONHOLD:
      "Your order is currently on hold.",

    ORDER_PROCESSING:
      "Your order is being processed.",

    ORDER_COMPLETED:
      "Your order was completed successfully.",

    ORDER_FAILED:
      "The provider could not complete the order.",

    ORDER_CANCELLED:
      "The order was cancelled.",

    INSUFFICIENT_WALLET_BALANCE:
      "The ClubKonnect provider could not complete the order because of insufficient provider balance.",
  };

  return (
    known[value] ??
    fallback
  );
}

/**
 * ============================================================
 * SANITIZE PROVIDER RESPONSE
 * ============================================================
 */

function sanitizeProviderResponse(
  value: unknown,
): unknown {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  if (
    typeof value !== "object"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(
      sanitizeProviderResponse,
    );
  }

  const source =
    value as Record<
      string,
      unknown
    >;

  const result: Record<
    string,
    unknown
  > = {};

  for (
    const [key, rawValue]
    of Object.entries(source)
  ) {
    const normalized =
      key
        .toLowerCase()
        .replace(
          /[_\s-]/g,
          "",
        );

    if (
      normalized.includes(
        "apikey",
      ) ||
      normalized.includes(
        "userid",
      ) ||
      normalized.includes(
        "password",
      ) ||
      normalized.includes(
        "secret",
      ) ||
      normalized.includes(
        "token",
      ) ||
      normalized ===
        "walletbalance"
    ) {
      continue;
    }

    result[key] =
      sanitizeProviderResponse(
        rawValue,
      );
  }

  return result;
}

/**
 * ============================================================
 * INPUT HELPERS
 * ============================================================
 */

function asString(
  value: unknown,
): string {
  return typeof value ===
    "string"
    ? value.trim()
    : "";
}

function requireString(
  value: unknown,
  field: string,
): string {
  const result =
    asString(value);

  if (!result) {
    throw new Error(
      `${field.toUpperCase()}_REQUIRED`,
    );
  }

  return result;
}

function asPositiveNumber(
  value: unknown,
): number {
  const number =
    typeof value ===
    "number"
      ? value
      : Number(value);

  if (
    !Number.isFinite(number) ||
    number <= 0
  ) {
    return 0;
  }

  return number;
}

function normalizePhone(
  value: unknown,
): string {
  return asString(value)
    .replace(
      /\s+/g,
      "",
    )
    .replace(
      /^\+234/,
      "0",
    )
    .replace(
      /^234/,
      "0",
    );
}

function isValidNigerianPhone(
  phone: string,
): boolean {
  return /^0[789][01]\d{8}$/.test(
    phone,
  );
}

function isSupportedService(
  value: unknown,
): value is SupportedService {
  return (
    typeof value ===
      "string" &&
    SUPPORTED_SERVICES.includes(
      value as SupportedService,
    )
  );
}

function getMarkup(
  service: SupportedService,
): number {
  return PREMIUM_SERVICES.has(
    service,
  )
    ? PREMIUM_MARKUP
    : REGULAR_MARKUP;
}

function calculateSellingPrice(
  providerCost: number,
  service: SupportedService,
): number {
  return Number(
    (
      providerCost *
      (1 + getMarkup(service))
    ).toFixed(2),
  );
}

function generateRequestId(): string {
  return (
    "IY_" +
    Date.now().toString(36) +
    "_" +
    crypto
      .randomUUID()
      .replace(
        /-/g,
        "",
      )
      .slice(0, 16)
  );
}

/**
 * ============================================================
 * CLUBKONNECT HTTP
 * ============================================================
 */

function buildProviderUrl(
  endpoint: string,
  params: Record<
    string,
    string | number | undefined
  >,
): URL {
  const url =
    new URL(
      `${CLUBKONNECT_BASE_URL}/${endpoint}`,
    );

  for (
    const [key, value]
    of Object.entries(params)
  ) {
    if (
      value !== undefined &&
      value !== null &&
      String(value).length > 0
    ) {
      url.searchParams.set(
        key,
        String(value),
      );
    }
  }

  return url;
}

async function clubKonnectGet(
  endpoint: string,
  params: Record<
    string,
    string | number | undefined
  >,
): Promise<{
  ok: boolean;
  httpStatus: number;
  data: Record<
    string,
    unknown
  >;
}> {
  const userId =
    Deno.env.get(
      "CLUBKONNECT_USER_ID",
    )?.trim();

  const apiKey =
    Deno.env.get(
      "CLUBKONNECT_API_KEY",
    )?.trim();

  if (
    !userId ||
    !apiKey
  ) {
    console.error(
      "ClubKonnect credentials are missing.",
    );

    throw new Error(
      "CLUBKONNECT_CONFIGURATION_ERROR",
    );
  }

  const url =
    buildProviderUrl(
      endpoint,
      {
        UserID:
          userId,
        APIKey:
          apiKey,
        ...params,
      },
    );

  let response: Response;

  try {
    response =
      await fetch(
        url.toString(),
        {
          method: "GET",
          headers: {
            Accept:
              "application/json",
            "User-Agent":
              "IyanjuPay-ClubKonnect-Integration/1.0",
          },
        },
      );
  } catch (error) {
    console.error(
      "ClubKonnect network error:",
      error,
    );

    throw new Error(
      "CLUBKONNECT_NETWORK_ERROR",
    );
  }

  const raw =
    await response.text();

  let parsed: unknown;

  try {
    parsed = raw
      ? JSON.parse(raw)
      : {};
  } catch (error) {
    console.error(
      "ClubKonnect invalid JSON response:",
      {
        status:
          response.status,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
    );

    throw new Error(
      "CLUBKONNECT_INVALID_RESPONSE",
    );
  }

  if (
    !parsed ||
    typeof parsed !==
      "object" ||
    Array.isArray(parsed)
  ) {
    throw new Error(
      "CLUBKONNECT_INVALID_RESPONSE",
    );
  }

  const data =
    parsed as Record<
      string,
      unknown
    >;

  const providerStatus =
    asString(
      data.status ??
        data.Status ??
        data.orderstatus ??
        data.OrderStatus ??
        data.statuscode ??
        data.StatusCode,
    );

  if (!response.ok) {
    console.error(
      "ClubKonnect HTTP error:",
      {
        http_status:
          response.status,
        provider_status:
          providerStatus,
      },
    );
  }

  return {
    ok:
      response.ok,
    httpStatus:
      response.status,
    data,
  };
}

/**
 * ============================================================
 * AUTHENTICATION
 * ============================================================
 *
 * IMPORTANT:
 *
 * Authentication is intentionally NOT performed globally.
 *
 * Public actions:
 *
 *   health
 *   catalog
 *   balance
 *
 * do not require a user JWT.
 *
 * Protected actions:
 *
 *   verify
 *   query
 *   purchase
 *
 * call authenticateUser() explicitly.
 *
 * This allows us to test the provider connection and
 * catalogue without having to obtain a Supabase user token.
 *
 * ============================================================
 */

async function authenticateUser(
  request: Request,
): Promise<{
  id: string;
}> {
  if (
    !SUPABASE_URL ||
    !SUPABASE_ANON_KEY
  ) {
    throw new Error(
      "SUPABASE_CONFIGURATION_ERROR",
    );
  }

  const authorization =
    request.headers.get(
      "Authorization",
    );

  if (
    !authorization ||
    !authorization
      .toLowerCase()
      .startsWith(
        "bearer ",
      )
  ) {
    throw new Error(
      "AUTHENTICATION_REQUIRED",
    );
  }

  const supabase =
    createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      {
        global: {
          headers: {
            Authorization:
              authorization,
          },
        },
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

  const {
    data,
    error,
  } =
    await supabase.auth.getUser();

  if (
    error ||
    !data.user
  ) {
    console.error(
      "ClubKonnect authentication failed:",
      error,
    );

    throw new Error(
      "AUTHENTICATION_REQUIRED",
    );
  }

  return {
    id:
      data.user.id,
  };
}

/**
 * ============================================================
 * CATALOGUE DATABASE
 * ============================================================
 */

const CATALOG_TABLE =
  Deno.env.get(
    "CLUBKONNECT_CATALOG_TABLE",
  )?.trim() ||
  "service_catalog";

async function getCatalogRow(
  catalogId: string,
  service: SupportedService,
) {
  if (!supabaseAdmin) {
    console.error(
      "Supabase service role configuration is missing.",
    );

    throw new Error(
      "SUPABASE_CONFIGURATION_ERROR",
    );
  }

  const {
    data,
    error,
  } =
    await supabaseAdmin
      .from(
        CATALOG_TABLE,
      )
      .select(
        [
          "id",
          "service",
          "provider",
          "provider_id",
          "product_id",
          "product_code",
          "product_sno",
          "product_name",
          "product_description",
          "package_id",
          "package_name",
          "provider_amount",
          "provider_discount_percent",
          "provider_discount_amount",
          "provider_cost",
          "markup_percent",
          "selling_price",
          "currency",
          "active",
          "provider_service",
          "metadata",
        ].join(","),
      )
      .eq(
        "id",
        catalogId,
      )
      .eq(
        "service",
        service,
      )
      .eq(
        "provider",
        "clubkonnect",
      )
      .eq(
        "active",
        true,
      )
      .maybeSingle();

  if (error) {
    console.error(
      "ClubKonnect catalogue lookup failed:",
      error,
    );

    throw new Error(
      "CATALOG_NOT_FOUND",
    );
  }

  if (!data) {
    throw new Error(
      "CATALOG_NOT_FOUND",
    );
  }

  return data as Record<
    string,
    unknown
  >;
}

/**
 * ============================================================
 * PUBLIC CATALOGUE SANITIZATION
 * ============================================================
 *
 * The catalogue endpoint is public for testing/frontend
 * discovery.
 *
 * Provider acquisition cost is NOT exposed.
 *
 * Selling price remains available because the frontend
 * needs the customer-facing price.
 *
 * ============================================================
 */

function sanitizeCatalogRow(
  row: Record<
    string,
    unknown
  >,
): Record<
  string,
  unknown
> {
  return {
    id:
      row.id ??
      null,

    service:
      row.service ??
      null,

    provider:
      row.provider ??
      "clubkonnect",

    provider_id:
      row.provider_id ??
      null,

    product_id:
      row.product_id ??
      null,

    product_code:
      row.product_code ??
      null,

    product_sno:
      row.product_sno ??
      null,

    product_name:
      row.product_name ??
      null,

    product_description:
      row.product_description ??
      null,

    package_id:
      row.package_id ??
      null,

    package_name:
      row.package_name ??
      null,

    currency:
      row.currency ??
      "NGN",

    selling_price:
      row.selling_price ??
      null,

    markup_percent:
      row.markup_percent ??
      null,

    active:
      row.active ??
      false,

    provider_service:
      row.provider_service ??
      null,

    metadata:
      row.metadata ??
      null,
  };
}

/**
 * ============================================================
 * PROVIDER STATUS HELPERS
 * ============================================================
 */

function extractOrderId(
  data: Record<
    string,
    unknown
  >,
): string {
  return asString(
    data.orderid ??
      data.OrderID ??
      data.order_id,
  );
}

function extractRequestId(
  data: Record<
    string,
    unknown
  >,
): string {
  return asString(
    data.requestid ??
      data.RequestID ??
      data.request_id,
  );
}

function extractStatus(
  data: Record<
    string,
    unknown
  >,
): string {
  return asString(
    data.orderstatus ??
      data.OrderStatus ??
      data.status ??
      data.Status,
  ).toUpperCase();
}

function extractRemark(
  data: Record<
    string,
    unknown
  >,
): string {
  return asString(
    data.orderremark ??
      data.OrderRemark ??
      data.remark ??
      data.Remark,
  );
}

function isSuccessStatus(
  status: string,
): boolean {
  return SUCCESS_ORDER_STATUSES.has(
    status,
  );
}

function isFailureStatus(
  status: string,
): boolean {
  return FAILURE_ORDER_STATUSES.has(
    status,
  );
}

function isActiveStatus(
  status: string,
): boolean {
  return ACTIVE_ORDER_STATUSES.has(
    status,
  );
}

/**
 * ============================================================
 * WALLET PURCHASE RPC HELPERS
 * ============================================================
 */

async function createPurchaseHold(
  userId: string,
  amount: number,
  service: SupportedService,
  requestId: string,
  description: string,
  metadata: Record<
    string,
    unknown
  >,
) {
  if (!supabaseAdmin) {
    throw new Error(
      "SUPABASE_CONFIGURATION_ERROR",
    );
  }

  const {
    data,
    error,
  } =
    await supabaseAdmin.rpc(
      "clubkonnect_create_purchase",
      {
        _user_id:
          userId,

        _amount:
          amount,

        _description:
          description,

        _provider_reference:
          requestId,

        _service:
          service,

        _metadata:
          metadata,
      },
    );

  if (error) {
    console.error(
      "ClubKonnect purchase HOLD failed:",
      error,
    );

    const message =
      String(
        error.message ??
          "",
      ).toLowerCase();

    if (
      message.includes(
        "insufficient",
      )
    ) {
      throw new Error(
        "INSUFFICIENT_FUNDS",
      );
    }

    if (
      message.includes(
        "not active",
      )
    ) {
      throw new Error(
        "WALLET_NOT_ACTIVE",
      );
    }

    throw new Error(
      "PURCHASE_NOT_ALLOWED",
    );
  }

  if (!data) {
    throw new Error(
      "PURCHASE_NOT_ALLOWED",
    );
  }

  return data;
}

async function finalizePurchase(
  transactionId: string,
  success: boolean,
  providerStatus: string,
  providerReference: string,
  providerRemark: string,
  providerPayload: Record<
    string,
    unknown
  >,
) {
  if (!supabaseAdmin) {
    throw new Error(
      "SUPABASE_CONFIGURATION_ERROR",
    );
  }

  const {
    data,
    error,
  } =
    await supabaseAdmin.rpc(
      "clubkonnect_finalize_purchase",
      {
        _transaction_id:
          transactionId,

        _success:
          success,

        _provider_status:
          providerStatus ||
          null,

        _provider_reference:
          providerReference ||
          null,

        _provider_remark:
          providerRemark ||
          null,

        _provider_payload:
          providerPayload ??
          {},
      },
    );

  if (error) {
    console.error(
      "ClubKonnect purchase finalization failed:",
      error,
    );

    throw new Error(
      "PURCHASE_SETTLEMENT_FAILED",
    );
  }

  return data;
}

/**
 * ============================================================
 * PURCHASE DESCRIPTION
 * ============================================================
 */

function getPurchaseDescription(
  service: SupportedService,
  catalog: Record<
    string,
    unknown
  >,
  body: Record<
    string,
    unknown
  >,
): string {
  const productName =
    asString(
      catalog.product_name,
    ) ||
    asString(
      catalog.package_name,
    ) ||
    asString(
      catalog.product_description,
    );

  const recipient =
    normalizePhone(
      body.mobile_number ??
        body.mobileNumber ??
        body.phone_number ??
        body.phoneNo ??
        body.phone,
    );

  if (
    service ===
      "airtime" ||
    service ===
      "data"
  ) {
    return (
      `ClubKonnect ${service} purchase` +
      (
        productName
          ? ` - ${productName}`
          : ""
      ) +
      (
        recipient
          ? ` - ${recipient}`
          : ""
      )
    );
  }

  return (
    `ClubKonnect ${service} purchase` +
    (
      productName
        ? ` - ${productName}`
        : ""
    )
  );
}

/**
 * ============================================================
 * PROVIDER PURCHASE BUILDERS
 * ============================================================
 */

function buildPurchaseRequest(
  service: SupportedService,
  body: Record<
    string,
    unknown
  >,
  catalog: Record<
    string,
    unknown
  >,
  requestId: string,
  callbackUrl: string,
): {
  endpoint: string;
  params: Record<
    string,
    string | number | undefined
  >;
} {
  switch (service) {
    /**
     * --------------------------------------------------------
     * AIRTIME
     * --------------------------------------------------------
     */

    case "airtime": {
      const mobileNetwork =
        requireString(
          body.mobile_network ??
            body.mobileNetwork ??
            catalog.provider_id ??
            catalog.product_id,
          "mobile_network",
        );

      const amount =
        asPositiveNumber(
          body.amount,
        );

      if (!amount) {
        throw new Error(
          "INVALID_AMOUNT",
        );
      }

      if (
        amount <
        50
      ) {
        throw new Error(
          "MINIMUM_50",
        );
      }

      if (
        amount >
        200000
      ) {
        throw new Error(
          "MAXIMUM_200000",
        );
      }

      const mobileNumber =
        normalizePhone(
          body.mobile_number ??
            body.mobileNumber ??
            body.phone_number ??
            body.phone,
        );

      if (
        !isValidNigerianPhone(
          mobileNumber,
        )
      ) {
        throw new Error(
          "INVALID_RECIPIENT",
        );
      }

      return {
        endpoint:
          "APIAirtimeV1.asp",

        params: {
          MobileNetwork:
            mobileNetwork,

          Amount:
            amount,

          MobileNumber:
            mobileNumber,

          RequestID:
            requestId,

          CallBackURL:
            callbackUrl,
        },
      };
    }

    /**
     * --------------------------------------------------------
     * DATA
     * --------------------------------------------------------
     */

    case "data": {
      const mobileNetwork =
        requireString(
          body.mobile_network ??
            body.mobileNetwork ??
            catalog.provider_id,
          "mobile_network",
        );

      const dataPlan =
        requireString(
          body.data_plan ??
            body.dataPlan ??
            catalog.product_id ??
            catalog.product_code,
          "data_plan",
        );

      const mobileNumber =
        normalizePhone(
          body.mobile_number ??
            body.mobileNumber ??
            body.phone_number ??
            body.phone,
        );

      if (
        !isValidNigerianPhone(
          mobileNumber,
        )
      ) {
        throw new Error(
          "INVALID_RECIPIENT",
        );
      }

      return {
        endpoint:
          "APIDatabundleV1.asp",

        params: {
          MobileNetwork:
            mobileNetwork,

          DataPlan:
            dataPlan,

          MobileNumber:
            mobileNumber,

          RequestID:
            requestId,

          CallBackURL:
            callbackUrl,
        },
      };
    }

    /**
     * --------------------------------------------------------
     * CABLE TV
     * --------------------------------------------------------
     */

    case "cable_tv": {
      const cableTv =
        requireString(
          body.cable_tv ??
            body.cableTV ??
            body.provider_id ??
            catalog.provider_id,
          "cable_tv",
        );

      const packageCode =
        requireString(
          body.package ??
            body.package_code ??
            body.packageCode ??
            catalog.package_id ??
            catalog.product_code ??
            catalog.product_id,
          "package",
        );

      const smartCardNo =
        requireString(
          body.smartcard_number ??
            body.smartCardNo ??
            body.smartcard ??
            body.iuc,
          "smartcard_number",
        );

      const phone =
        normalizePhone(
          body.phone_number ??
            body.phoneNo ??
            body.phone,
        );

      if (
        !isValidNigerianPhone(
          phone,
        )
      ) {
        throw new Error(
          "INVALID_PHONENO",
        );
      }

      return {
        endpoint:
          "APICableTVV1.asp",

        params: {
          CableTV:
            cableTv,

          Package:
            packageCode,

          SmartCardNo:
            smartCardNo,

          PhoneNo:
            phone,

          RequestID:
            requestId,

          CallBackURL:
            callbackUrl,
        },
      };
    }

    /**
     * --------------------------------------------------------
     * ELECTRICITY
     * --------------------------------------------------------
     */

    case "electricity": {
      const company =
        requireString(
          body.electric_company ??
            body.electricCompany ??
            body.electricity_company ??
            catalog.provider_id,
          "electricity",
        );

      const meterType =
        requireString(
          body.meter_type ??
            body.meterType,
          "meter_type",
        );

      const meterNo =
        requireString(
          body.meter_number ??
            body.meterNo,
          "meter_number",
        );

      const amount =
        asPositiveNumber(
          body.amount,
        );

      if (!amount) {
        throw new Error(
          "INVALID_AMOUNT",
        );
      }

      const phone =
        normalizePhone(
          body.phone_number ??
            body.phoneNo ??
            body.phone,
        );

      if (
        !isValidNigerianPhone(
          phone,
        )
      ) {
        throw new Error(
          "INVALID_PHONENO",
        );
      }

      return {
        endpoint:
          "APIElectricityV1.asp",

        params: {
          ElectricCompany:
            company,

          MeterType:
            meterType,

          MeterNo:
            meterNo,

          Amount:
            amount,

          PhoneNo:
            phone,

          RequestID:
            requestId,

          CallBackURL:
            callbackUrl,
        },
      };
    }

    /**
     * --------------------------------------------------------
     * AIRTIME EPIN
     * --------------------------------------------------------
     */

    case "airtime_epin": {
      const mobileNetwork =
        requireString(
          body.mobile_network ??
            body.mobileNetwork ??
            catalog.provider_id,
          "mobile_network",
        );

      const value =
        asPositiveNumber(
          body.value ??
            body.amount ??
            catalog.provider_amount,
        );

      if (
        ![
          100,
          200,
          500,
        ].includes(
          value,
        )
      ) {
        throw new Error(
          "INVALID_VALUE",
        );
      }

      const quantity =
        Math.floor(
          asPositiveNumber(
            body.quantity ??
              1,
          ),
        );

      if (
        quantity <
        1
      ) {
        throw new Error(
          "MINIMUM_QUANTITY_1",
        );
      }

      if (
        quantity >
        100
      ) {
        throw new Error(
          "MAXIMUM_QUANTITY_100",
        );
      }

      return {
        endpoint:
          "APIEPINV1.asp",

        params: {
          MobileNetwork:
            mobileNetwork,

          Value:
            value,

          Quantity:
            quantity,

          RequestID:
            requestId,

          CallBackURL:
            callbackUrl,
        },
      };
    }

    /**
     * --------------------------------------------------------
     * DATA EPIN
     * --------------------------------------------------------
     */

    case "data_epin": {
      const mobileNetwork =
        requireString(
          body.mobile_network ??
            body.mobileNetwork ??
            catalog.provider_id,
          "mobile_network",
        );

      const dataPlan =
        requireString(
          body.data_plan ??
            body.dataPlan ??
            catalog.product_id ??
            catalog.product_code,
          "data_plan",
        );

      const quantity =
        Math.floor(
          asPositiveNumber(
            body.quantity ??
              1,
          ),
        );

      if (
        quantity <
        1
      ) {
        throw new Error(
          "MINIMUM_QUANTITY_1",
        );
      }

      if (
        quantity >
        100
      ) {
        throw new Error(
          "MAXIMUM_QUANTITY_100",
        );
      }

      return {
        endpoint:
          "APIDatabundleEPINV1.asp",

        params: {
          MobileNetwork:
            mobileNetwork,

          DataPlan:
            dataPlan,

          Quantity:
            quantity,

          RequestID:
            requestId,

          CallBackURL:
            callbackUrl,
        },
      };
    }

    /**
     * --------------------------------------------------------
     * SMILE
     * --------------------------------------------------------
     */

    case "smile": {
      const dataPlan =
        requireString(
          body.data_plan ??
            body.dataPlan ??
            catalog.product_id ??
            catalog.product_code,
          "data_plan",
        );

      const mobileNumber =
        requireString(
          body.mobile_number ??
            body.mobileNumber ??
            body.account_number ??
            body.accountNumber,
          "account_number",
        );

      return {
        endpoint:
          "APISmileV1.asp",

        params: {
          MobileNetwork:
            "smile-direct",

          DataPlan:
            dataPlan,

          MobileNumber:
            mobileNumber,

          RequestID:
            requestId,

          CallBackURL:
            callbackUrl,
        },
      };
    }

    /**
     * --------------------------------------------------------
     * WAEC
     * --------------------------------------------------------
     */

    case "waec": {
      const examType =
        requireString(
          body.exam_type ??
            body.examType ??
            catalog.product_code ??
            catalog.product_id,
          "exam_type",
        );

      const phone =
        normalizePhone(
          body.phone_number ??
            body.phoneNo ??
            body.phone,
        );

      if (
        !isValidNigerianPhone(
          phone,
        )
      ) {
        throw new Error(
          "INVALID_PHONENO",
        );
      }

      return {
        endpoint:
          "APIWAECV1.asp",

        params: {
          ExamType:
            examType,

          PhoneNo:
            phone,

          RequestID:
            requestId,

          CallBackURL:
            callbackUrl,
        },
      };
    }

    /**
     * --------------------------------------------------------
     * JAMB
     * --------------------------------------------------------
     */

    case "jamb": {
      const examType =
        requireString(
          body.exam_type ??
            body.examType ??
            catalog.product_code ??
            catalog.product_id,
          "exam_type",
        );

      const phone =
        normalizePhone(
          body.phone_number ??
            body.phoneNo ??
            body.phone,
        );

      if (
        !isValidNigerianPhone(
          phone,
        )
      ) {
        throw new Error(
          "INVALID_PHONENO",
        );
      }

      return {
        endpoint:
          "APIJAMBV1.asp",

        params: {
          ExamType:
            examType,

          PhoneNo:
            phone,

          RequestID:
            requestId,

          CallBackURL:
            callbackUrl,
        },
      };
    }

    default:
      throw new Error(
        "UNSUPPORTED_SERVICE",
      );
  }
}

/**
 * ============================================================
 * CALLBACK URL
 * ============================================================
 */

function getCallbackUrl(): string {
  const configured =
    Deno.env.get(
      "CLUBKONNECT_CALLBACK_URL",
    )?.trim();

  if (configured) {
    return configured;
  }

  if (
    SUPABASE_URL
  ) {
    return (
      `${SUPABASE_URL}` +
      `/functions/v1/clubkonnect-callback`
    );
  }

  throw new Error(
    "SUPABASE_CONFIGURATION_ERROR",
  );
}

/**
 * ============================================================
 * CATALOGUE
 * ============================================================
 */

async function getCatalog(
  service?: SupportedService,
) {
  if (!supabaseAdmin) {
    throw new Error(
      "SUPABASE_CONFIGURATION_ERROR",
    );
  }

  let query =
    supabaseAdmin
      .from(
        CATALOG_TABLE,
      )
      .select("*")
      .eq(
        "provider",
        "clubkonnect",
      )
      .eq(
        "active",
        true,
      )
      .order(
        "product_name",
        {
          ascending:
            true,

          nullsFirst:
            false,
        },
      );

  if (service) {
    query =
      query.eq(
        "service",
        service,
      );
  }

  const {
    data,
    error,
  } =
    await query;

  if (error) {
    console.error(
      "Catalogue query failed:",
      error,
    );

    throw new Error(
      "CATALOG_NOT_FOUND",
    );
  }

  const rows =
    Array.isArray(data)
      ? data
      : [];

  return {
    service:
      service ??
      null,

    markup_rules: {
      regular_services: {
        airtime:
          15,

        data:
          15,

        cable_tv:
          15,

        electricity:
          15,
      },

      premium_services: {
        airtime_epin:
          20,

        data_epin:
          20,

        smile:
          20,

        waec:
          20,

        jamb:
          20,
      },

      betting:
        "disabled",
    },

    count:
      rows.length,

    data:
      rows.map(
        (row) =>
          sanitizeCatalogRow(
            row as Record<
              string,
              unknown
            >,
          ),
      ),
  };
}

/**
 * ============================================================
 * PROVIDER BALANCE / HEALTH
 * ============================================================
 */

async function checkProviderBalance() {
  const result =
    await clubKonnectGet(
      "APIWalletBalanceV1.asp",
      {},
    );

  const data =
    result.data;

  const hasBalance =
    "balance" in data ||
    "Balance" in data;

  const providerStatus =
    asString(
      data.status ??
        data.Status ??
        data.statuscode ??
        data.StatusCode,
    );

  return {
    connected:
      result.ok &&
      hasBalance,

    provider_status:
      providerStatus ||
      null,
  };
}

/**
 * ============================================================
 * QUERY
 * ============================================================
 */

async function queryTransaction(
  requestId?: string,
  orderId?: string,
) {
  if (
    !requestId &&
    !orderId
  ) {
    throw new Error(
      "REQUEST_ID_OR_ORDER_ID_REQUIRED",
    );
  }

  return clubKonnectGet(
    "APIQueryV1.asp",
    {
      RequestID:
        requestId ||
        undefined,

      OrderID:
        orderId ||
        undefined,
    },
  );
}

/**
 * ============================================================
 * CUSTOMER VERIFICATION
 * ============================================================
 */

async function verifyCustomer(
  service: SupportedService,
  body: Record<
    string,
    unknown
  >,
) {
  switch (service) {
    /**
     * --------------------------------------------------------
     * CABLE TV
     * --------------------------------------------------------
     */

    case "cable_tv": {
      const cableTv =
        requireString(
          body.cable_tv ??
            body.cableTV ??
            body.provider,
          "cable_tv",
        );

      const smartCardNo =
        requireString(
          body.smartcard_number ??
            body.smartCardNo ??
            body.iuc,
          "smartcard_number",
        );

      return clubKonnectGet(
        "APIVerifyCableTVV1.asp",
        {
          CableTV:
            cableTv,

          SmartCardNo:
            smartCardNo,
        },
      );
    }

    /**
     * --------------------------------------------------------
     * ELECTRICITY
     * --------------------------------------------------------
     */

    case "electricity": {
      const company =
        requireString(
          body.electric_company ??
            body.electricCompany ??
            body.provider,
          "electricity",
        );

      const meterNo =
        requireString(
          body.meter_number ??
            body.meterNo,
          "meter_number",
        );

      const meterType =
        requireString(
          body.meter_type ??
            body.meterType,
          "meter_type",
        );

      return clubKonnectGet(
        "APIVerifyElectricityV1.asp",
        {
          ElectricCompany:
            company,

          MeterNo:
            meterNo,

          MeterType:
            meterType,
        },
      );
    }

    /**
     * --------------------------------------------------------
     * SMILE
     * --------------------------------------------------------
     */

    case "smile": {
      const account =
        requireString(
          body.account_number ??
            body.mobile_number ??
            body.mobileNumber,
          "account_number",
        );

      return clubKonnectGet(
        "APIVerifySmileV1.asp",
        {
          MobileNetwork:
            "smile-direct",

          MobileNumber:
            account,
        },
      );
    }

    /**
     * --------------------------------------------------------
     * JAMB
     * --------------------------------------------------------
     */

    case "jamb": {
      const examType =
        requireString(
          body.exam_type ??
            body.examType,
          "exam_type",
        );

      const profileId =
        requireString(
          body.profile_id ??
            body.profileId,
          "profile_id",
        );

      return clubKonnectGet(
        "APIVerifyJAMBV1.asp",
        {
          ExamType:
            examType,

          ProfileID:
            profileId,
        },
      );
    }

    default:
      throw new Error(
        "VERIFICATION_NOT_SUPPORTED",
      );
  }
}

/**
 * ============================================================
 * PURCHASE
 * ============================================================
 */

async function purchaseService(
  userId: string,
  service: SupportedService,
  body: Record<
    string,
    unknown
  >,
) {
  if (
    !PURCHASE_SERVICES.has(
      service,
    )
  ) {
    throw new Error(
      "UNSUPPORTED_SERVICE",
    );
  }

  if (
    service ===
      ("betting" as SupportedService)
  ) {
    throw new Error(
      "BETTING_DISABLED",
    );
  }

  const catalogId =
    requireString(
      body.catalog_id ??
        body.catalogId,
      "catalog_id",
    );

  /**
   * ----------------------------------------------------------
   * AUTHORITATIVE CATALOGUE PRICE
   * ----------------------------------------------------------
   */

  const catalog =
    await getCatalogRow(
      catalogId,
      service,
    );

  const providerCost =
    Number(
      catalog.provider_cost ??
        0,
    );

  const storedSellingPrice =
    Number(
      catalog.selling_price ??
        0,
    );

  if (
    !Number.isFinite(
      providerCost,
    ) ||
    providerCost <= 0
  ) {
    throw new Error(
      "INVALID_CATALOG",
    );
  }

  /**
   * The frontend cannot choose the price.
   *
   * Selling price is calculated again on the server.
   */

  const calculatedSellingPrice =
    calculateSellingPrice(
      providerCost,
      service,
    );

  const sellingPrice =
    calculatedSellingPrice;

  if (
    !Number.isFinite(
      sellingPrice,
    ) ||
    sellingPrice <= 0
  ) {
    throw new Error(
      "INVALID_CATALOG",
    );
  }

  /**
   * ----------------------------------------------------------
   * REQUEST ID
   * ----------------------------------------------------------
   */

  const requestId =
    generateRequestId();

  const callbackUrl =
    getCallbackUrl();

  /**
   * ----------------------------------------------------------
   * VALIDATE CUSTOMER INPUT BEFORE HOLD
   * ----------------------------------------------------------
   */

  const providerRequest =
    buildPurchaseRequest(
      service,
      body,
      catalog,
      requestId,
      callbackUrl,
    );

  /**
   * ----------------------------------------------------------
   * DESCRIPTION
   * ----------------------------------------------------------
   */

  const description =
    getPurchaseDescription(
      service,
      catalog,
      body,
    );

  /**
   * ----------------------------------------------------------
   * WALLET HOLD
   * ----------------------------------------------------------
   */

  const holdMetadata: Record<
    string,
    unknown
  > = {
    provider:
      "clubkonnect",

    provider_service:
      service,

    catalog_id:
      catalog.id,

    product_id:
      catalog.product_id ??
      null,

    product_code:
      catalog.product_code ??
      null,

    product_name:
      catalog.product_name ??
      null,

    package_id:
      catalog.package_id ??
      null,

    package_name:
      catalog.package_name ??
      null,

    provider_cost:
      providerCost,

    markup_percent:
      getMarkup(service) *
      100,

    selling_price:
      sellingPrice,

    request_id:
      requestId,

    provider_endpoint:
      providerRequest.endpoint,

    purchase_state:
      "wallet_held",

    stored_catalog_selling_price:
      storedSellingPrice,
  };

  let holdTxn:
    Record<
      string,
      unknown
    >;

  try {
    holdTxn =
      await createPurchaseHold(
        userId,
        sellingPrice,
        service,
        requestId,
        description,
        holdMetadata,
      );
  } catch (error) {
    throw error;
  }

  const holdTransactionId =
    asString(
      holdTxn.id,
    );

  if (!holdTransactionId) {
    console.error(
      "Purchase HOLD returned no transaction ID.",
    );

    throw new Error(
      "PURCHASE_NOT_ALLOWED",
    );
  }

  /**
   * ----------------------------------------------------------
   * PROVIDER PURCHASE
   * ----------------------------------------------------------
   */

  let providerResult:
    | Awaited<
        ReturnType<
          typeof clubKonnectGet
        >
      >
    | null =
    null;

  try {
    providerResult =
      await clubKonnectGet(
        providerRequest.endpoint,
        providerRequest.params,
      );
  } catch (error) {
    /**
     * Provider request failed before we received a
     * trustworthy provider response.
     *
     * Release the wallet HOLD.
     */

    try {
      await finalizePurchase(
        holdTransactionId,
        false,
        "PROVIDER_NETWORK_ERROR",
        requestId,
        "Provider connection failed before order confirmation.",
        {},
      );
    } catch (releaseError) {
      console.error(
        "Failed to release HOLD after provider network error:",
        releaseError,
      );
    }

    throw error;
  }

  const providerData =
    providerResult.data;

  const orderId =
    extractOrderId(
      providerData,
    );

  const returnedRequestId =
    extractRequestId(
      providerData,
    );

  const status =
    extractStatus(
      providerData,
    );

  const remark =
    extractRemark(
      providerData,
    );

  /**
   * ----------------------------------------------------------
   * IMMEDIATE SUCCESS
   * ----------------------------------------------------------
   */

  const immediateEpinSuccess =
    service ===
      "airtime_epin" &&
    Array.isArray(
      providerData.TXN_EPIN,
    );

  const immediateSuccess =
    isSuccessStatus(
      status,
    ) ||
    immediateEpinSuccess;

  if (
    immediateSuccess
  ) {
    try {
      const finalTxn =
        await finalizePurchase(
          holdTransactionId,

          true,

          status ||
            "ORDER_COMPLETED",

          orderId ||
            returnedRequestId ||
            requestId,

          remark ||
            "TRANSACTION SUCCESSFUL",

          providerData,
        );

      return {
        success:
          true,

        status:
          "completed",

        provider:
          "clubkonnect",

        service,

        transaction:
          finalTxn,

        request_id:
          requestId,

        order_id:
          orderId ||
          null,

        provider_status:
          status ||
          "ORDER_COMPLETED",

        amount:
          sellingPrice,

        provider_cost:
          providerCost,

        markup_percent:
          getMarkup(service) *
          100,

        data:
          sanitizeProviderResponse(
            providerData,
          ),
      };
    } catch (error) {
      /**
       * Provider already confirmed success.
       *
       * NEVER release the wallet here.
       *
       * The callback/reconciliation process must settle it.
       */

      console.error(
        "Immediate ClubKonnect success could not be settled:",
        error,
      );

      return {
        success:
          true,

        status:
          "processing",

        provider:
          "clubkonnect",

        service,

        request_id:
          requestId,

        order_id:
          orderId ||
          null,

        provider_status:
          status ||
          "ORDER_COMPLETED",

        amount:
          sellingPrice,

        message:
          "The provider completed the request, but final wallet settlement is being reconciled.",
      };
    }
  }

  /**
   * ----------------------------------------------------------
   * IMMEDIATE FAILURE
   * ----------------------------------------------------------
   */

  if (
    isFailureStatus(
      status,
    )
  ) {
    try {
      await finalizePurchase(
        holdTransactionId,

        false,

        status,

        orderId ||
          returnedRequestId ||
          requestId,

        remark,

        providerData,
      );
    } catch (error) {
      console.error(
        "Failed to release wallet after provider failure:",
        error,
      );

      return {
        success:
          false,

        status:
          "reconciliation_required",

        provider:
          "clubkonnect",

        service,

        request_id:
          requestId,

        order_id:
          orderId ||
          null,

        error:
          "The provider rejected the order and wallet reconciliation is required.",
      };
    }

    return {
      success:
        false,

      status:
        "failed",

      provider:
        "clubkonnect",

      service,

      request_id:
        requestId,

      order_id:
        orderId ||
        null,

      provider_status:
        status,

      error:
        safeErrorMessage(
          status,
          "The provider could not complete the order.",
        ),
    };
  }

  /**
   * ----------------------------------------------------------
   * QUEUED / RECEIVED / PROCESSING
   * ----------------------------------------------------------
   */

  if (
    isActiveStatus(
      status,
    ) ||
    orderId
  ) {
    return {
      success:
        true,

      status:
        "processing",

      provider:
        "clubkonnect",

      service,

      request_id:
        requestId,

      order_id:
        orderId ||
        null,

      provider_status:
        status ||
        "ORDER_RECEIVED",

      amount:
        sellingPrice,

      provider_cost:
        providerCost,

      markup_percent:
        getMarkup(service) *
        100,

      message:
        "Your order has been received and is being processed. Your wallet amount is temporarily held until ClubKonnect confirms the final result.",
    };
  }

  /**
   * ----------------------------------------------------------
   * UNKNOWN PROVIDER RESPONSE
   * ----------------------------------------------------------
   *
   * NEVER release money when we cannot determine whether
   * ClubKonnect accepted the order.
   */

  console.error(
    "Unknown ClubKonnect purchase response:",
    {
      service,

      request_id:
        requestId,

      provider_status:
        status,

      has_order_id:
        Boolean(orderId),
    },
  );

  return {
    success:
      true,

    status:
      "processing",

    provider:
      "clubkonnect",

    service,

    request_id:
      requestId,

    order_id:
      orderId ||
      null,

    provider_status:
      status ||
      null,

    amount:
      sellingPrice,

    message:
      "Your order is being reconciled with the provider. Your wallet amount remains temporarily held.",
  };
}

/**
 * ============================================================
 * REQUEST BODY
 * ============================================================
 */

async function readRequestBody(
  request: Request,
): Promise<
  Record<
    string,
    unknown
  >
> {
  if (
    request.method ===
    "POST"
  ) {
    const raw =
      await request.text();

    if (
      !raw.trim()
    ) {
      return {};
    }

    const parsed =
      JSON.parse(
        raw,
      );

    if (
      !parsed ||
      typeof parsed !==
        "object" ||
      Array.isArray(
        parsed,
      )
    ) {
      throw new Error(
        "INVALID_REQUEST_BODY",
      );
    }

    return parsed as Record<
      string,
      unknown
    >;
  }

  const url =
    new URL(
      request.url,
    );

  return Object.fromEntries(
    url.searchParams.entries(),
  );
}

/**
 * ============================================================
 * MAIN HANDLER
 * ============================================================
 */

Deno.serve(
  async (
    request: Request,
  ) => {
    /**
     * --------------------------------------------------------
     * CORS
     * --------------------------------------------------------
     */

    if (
      request.method ===
      "OPTIONS"
    ) {
      return new Response(
        "ok",
        {
          status: 200,
          headers:
            corsHeaders,
        },
      );
    }

    if (
      request.method !==
        "POST" &&
      request.method !==
        "GET"
    ) {
      return jsonResponse(
        {
          success:
            false,

          error:
            "Method not allowed.",
        },
        405,
      );
    }

    /**
     * --------------------------------------------------------
     * READ REQUEST
     * --------------------------------------------------------
     */

    let body:
      Record<
        string,
        unknown
      > = {};

    try {
      body =
        await readRequestBody(
          request,
        );
    } catch (error) {
      console.error(
        "ClubKonnect request parsing error:",
        error,
      );

      return jsonResponse(
        {
          success:
            false,

          error:
            "Invalid request format.",
        },
        400,
      );
    }

    const action =
      asString(
        body.action,
      ) as Action;

    const requestedService =
      asString(
        body.service,
      );

    /**
     * --------------------------------------------------------
     * DEFAULT INFORMATION ENDPOINT
     * --------------------------------------------------------
     *
     * This endpoint is public.
     */

    if (!action) {
      return jsonResponse({
        success:
          true,

        provider:
          "clubkonnect",

        service:
          "clubkonnect-service",

        authenticated:
          false,

        supported_services:
          SUPPORTED_SERVICES,

        public_actions: [
          "health",
          "catalog",
          "balance",
        ],

        authenticated_actions: [
          "verify",
          "query",
          "purchase",
        ],

        actions: [
          "health",
          "balance",
          "catalog",
          "verify",
          "query",
          "purchase",
        ],

        markup_rules: {
          regular:
            15,

          premium:
            20,
        },

        betting:
          "disabled",
      });
    }

    /**
     * --------------------------------------------------------
     * BETTING — ALWAYS DISABLED
     * --------------------------------------------------------
     */

    if (
      requestedService ===
        "betting" ||
      requestedService ===
        "betting_wallet" ||
      requestedService ===
        "betting_wallet_funding" ||
      action ===
        ("betting" as Action)
    ) {
      return jsonResponse(
        {
          success:
            false,

          error:
            "This service is not supported by IyanjuPay.",
        },
        403,
      );
    }

    /**
     * --------------------------------------------------------
     * PUBLIC ACTIONS
     * --------------------------------------------------------
     *
     * IMPORTANT:
     *
     * There is NO authenticateUser() call here.
     *
     * This is the fix for the 401 problem.
     */

    if (
      action ===
      "health"
    ) {
      try {
        const result =
          await checkProviderBalance();

        return jsonResponse({
          success:
            true,

          provider:
            "clubkonnect",

          connected:
            result.connected,

          provider_status:
            result.provider_status,

          purchase_enabled:
            true,

          supported_services:
            SUPPORTED_SERVICES,

          betting:
            "disabled",
        });
      } catch (error) {
        console.error(
          "ClubKonnect health check failed:",
          error,
        );

        return jsonResponse(
          {
            success:
              false,

            connected:
              false,

            error:
              "Unable to connect to the ClubKonnect service.",
          },
          502,
        );
      }
    }

    /**
     * --------------------------------------------------------
     * BALANCE
     * --------------------------------------------------------
     *
     * Public connection test.
     *
     * The actual ClubKonnect wallet balance is NEVER returned.
     */

    if (
      action ===
      "balance"
    ) {
      try {
        const result =
          await checkProviderBalance();

        return jsonResponse({
          success:
            true,

          provider:
            "clubkonnect",

          connected:
            result.connected,

          provider_status:
            result.provider_status,

          balance:
            null,

          message:
            "Provider balance is intentionally not exposed through this endpoint.",
        });
      } catch (error) {
        console.error(
          "ClubKonnect balance check failed:",
          error,
        );

        return jsonResponse(
          {
            success:
              false,

            error:
              "Unable to verify the ClubKonnect provider account.",
          },
          502,
        );
      }
    }

    /**
     * --------------------------------------------------------
     * CATALOG
     * --------------------------------------------------------
     *
     * Public.
     */

    if (
      action ===
      "catalog"
    ) {
      try {
        let service:
          | SupportedService
          | undefined;

        if (
          requestedService
        ) {
          if (
            !isSupportedService(
              requestedService,
            )
          ) {
            return jsonResponse(
              {
                success:
                  false,

                error:
                  "Unsupported service.",
              },
              400,
            );
          }

          service =
            requestedService;
        }

        const catalog =
          await getCatalog(
            service,
          );

        return jsonResponse({
          success:
            true,

          provider:
            "clubkonnect",

          catalog,
        });
      } catch (error) {
        console.error(
          "ClubKonnect catalogue error:",
          error,
        );

        return jsonResponse(
          {
            success:
              false,

            error:
              "Unable to retrieve the ClubKonnect service catalogue.",
          },
          502,
        );
      }
    }

    /**
     * --------------------------------------------------------
     * FROM THIS POINT ON:
     *
     * AUTHENTICATION IS REQUIRED.
     *
     * --------------------------------------------------------
     */

    let user:
      | {
          id: string;
        }
      | null =
      null;

    try {
      user =
        await authenticateUser(
          request,
        );
    } catch (error) {
      const code =
        error instanceof Error
          ? error.message
          : "";

      console.error(
        "ClubKonnect protected endpoint authentication error:",
        error,
      );

      if (
        code ===
        "AUTHENTICATION_REQUIRED"
      ) {
        return jsonResponse(
          {
            success:
              false,

            error:
              safeErrorMessage(
                code,
              ),
          },
          401,
        );
      }

      return jsonResponse(
        {
          success:
            false,

          error:
            "Unable to authenticate the request.",
        },
        500,
      );
    }

    /**
     * --------------------------------------------------------
     * VERIFY
     * --------------------------------------------------------
     */

    if (
      action ===
      "verify"
    ) {
      if (
        !isSupportedService(
          requestedService,
        )
      ) {
        return jsonResponse(
          {
            success:
              false,

            error:
              "A supported service is required for verification.",
          },
          400,
        );
      }

      try {
        const result =
          await verifyCustomer(
            requestedService,
            body,
          );

        return jsonResponse({
          success:
            true,

          provider:
            "clubkonnect",

          service:
            requestedService,

          data:
            sanitizeProviderResponse(
              result.data,
            ),
        });
      } catch (error) {
        const code =
          error instanceof Error
            ? error.message
            : "";

        console.error(
          "ClubKonnect verification error:",
          error,
        );

        return jsonResponse(
          {
            success:
              false,

            error:
              safeErrorMessage(
                code,
                "Unable to verify the customer information.",
              ),
          },
          400,
        );
      }
    }

    /**
     * --------------------------------------------------------
     * QUERY
     * --------------------------------------------------------
     */

    if (
      action ===
      "query"
    ) {
      const requestId =
        asString(
          body.request_id ??
            body.requestId,
        );

      const orderId =
        asString(
          body.order_id ??
            body.orderId,
        );

      if (
        !requestId &&
        !orderId
      ) {
        return jsonResponse(
          {
            success:
              false,

            error:
              "Request ID or Order ID is required.",
          },
          400,
        );
      }

      try {
        const result =
          await queryTransaction(
            requestId ||
              undefined,

            orderId ||
              undefined,
          );

        return jsonResponse({
          success:
            true,

          provider:
            "clubkonnect",

          data:
            sanitizeProviderResponse(
              result.data,
            ),
        });
      } catch (error) {
        console.error(
          "ClubKonnect transaction query failed:",
          error,
        );

        return jsonResponse(
          {
            success:
              false,

            error:
              "Unable to query the ClubKonnect transaction.",
          },
          502,
        );
      }
    }

    /**
     * --------------------------------------------------------
     * PURCHASE
     * --------------------------------------------------------
     */

    if (
      action ===
      "purchase"
    ) {
      if (
        !isSupportedService(
          requestedService,
        )
      ) {
        return jsonResponse(
          {
            success:
              false,

            error:
              "A supported service is required.",
          },
          400,
        );
      }

      try {
        const result =
          await purchaseService(
            user.id,
            requestedService,
            body,
          );

        return jsonResponse(
          result,
        );
      } catch (error) {
        const code =
          error instanceof Error
            ? error.message
            : "";

        console.error(
          "ClubKonnect purchase error:",
          {
            code,

            service:
              requestedService,

            user_id:
              user.id,
          },
        );

        let statusCode =
          400;

        if (
          code ===
          "AUTHENTICATION_REQUIRED"
        ) {
          statusCode =
            401;
        } else if (
          code ===
          "CATALOG_NOT_FOUND"
        ) {
          statusCode =
            404;
        } else if (
          code ===
          "SUPABASE_CONFIGURATION_ERROR" ||
          code ===
          "CLUBKONNECT_CONFIGURATION_ERROR"
        ) {
          statusCode =
            503;
        } else if (
          code ===
          "CLUBKONNECT_NETWORK_ERROR"
        ) {
          statusCode =
            502;
        }

        return jsonResponse(
          {
            success:
              false,

            error:
              safeErrorMessage(
                code,
                "Unable to process the purchase.",
              ),
          },
          statusCode,
        );
      }
    }

    /**
     * --------------------------------------------------------
     * UNKNOWN ACTION
     * --------------------------------------------------------
     */

    return jsonResponse(
      {
        success:
          false,

        error:
          "Unsupported ClubKonnect action.",
      },
      400,
    );
  },
);
