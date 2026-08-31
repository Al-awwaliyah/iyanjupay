import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
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

const PREMIUM_SERVICES = new Set<SupportedService>([
  "airtime_epin",
  "data_epin",
  "smile",
  "waec",
  "jamb",
]);

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
        "Content-Type": "application/json",
      },
    },
  );
}

/**
 * Never expose provider credentials, raw URLs containing credentials,
 * stack traces, database errors, or other technical information.
 */
function safeErrorMessage(
  status?: string,
  fallback = "Unable to process the request.",
): string {
  const value = String(status ?? "").toUpperCase();

  const knownMessages: Record<string, string> = {
    INVALID_CREDENTIALS:
      "The ClubKonnect service credentials are invalid.",
    MISSING_CREDENTIALS:
      "The ClubKonnect service credentials are incomplete.",
    MISSING_USERID:
      "The ClubKonnect service credentials are incomplete.",
    MISSING_APIKEY:
      "The ClubKonnect service credentials are incomplete.",

    MISSING_MOBILENETWORK:
      "A mobile network is required.",
    MISSING_AMOUNT:
      "An amount is required.",
    INVALID_AMOUNT:
      "The amount provided is invalid.",
    MINIMUM_50:
      "The minimum airtime amount is ₦50.",
    MINIMUM_200000:
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

    MISSING_Electricity:
      "An electricity provider is required.",
    MISSING_MeterType:
      "A meter type is required.",
    INVALID_MeterNo:
      "The meter number is invalid.",
    MeterType_NOT_AVAILABLE:
      "The selected meter type is currently unavailable.",

    MISSING_VALUE:
      "An e-PIN value is required.",
    INVALID_VALUE:
      "The selected e-PIN value is invalid.",
    INVALID_QUANTITY:
      "The requested quantity is invalid.",
    VALUE_ALLOWED_100_200_500:
      "The selected e-PIN value is not available.",
    MINIMUM_QUANTITY_1:
      "The minimum quantity is 1.",
    MAXIMUM_QUANTITY_100:
      "The maximum quantity is 100.",
    QUANTITY_NOT_AVAILABLE:
      "The requested e-PIN quantity is unavailable.",
    PIN_NOT_AVAILABLE:
      "The requested e-PIN is currently unavailable.",

    MISSING_EXAMTYPE:
      "An examination package is required.",
    INVALID_PHONENO:
      "The phone number is invalid.",

    INVALID_ACCOUNTNO:
      "The Smile account number is invalid.",
    INVALID_ACCOUNT:
      "The account number is invalid.",

    ORDER_RECEIVED:
      "Your order has been received and is being processed.",
    ORDER_COMPLETED:
      "The order was completed successfully.",
    ORDER_FAILED:
      "The provider could not complete the order.",
    ORDER_CANCELLED:
      "The order was cancelled.",
    ORDER_ONHOLD:
      "The order is currently on hold.",
    REQUEST_QUEUED:
      "The request has been queued for processing.",
    REQUEST_PROCESSING:
      "The request is currently being processed.",
    INSUFFICIENT_WALLET_BALANCE:
      "The ClubKonnect provider balance is insufficient.",
  };

  return knownMessages[value] ?? fallback;
}

function sanitizeProviderResponse(
  value: unknown,
): unknown {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  if (typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeProviderResponse);
  }

  const source =
    value as Record<string, unknown>;

  const result: Record<string, unknown> = {};

  for (const [key, rawValue] of Object.entries(source)) {
    const normalizedKey =
      key.toLowerCase().replace(/[_\s-]/g, "");

    /*
     * Never return credentials.
     */
    if (
      normalizedKey.includes("apikey") ||
      normalizedKey.includes("userid") ||
      normalizedKey.includes("password") ||
      normalizedKey.includes("secret")
    ) {
      continue;
    }

    result[key] =
      sanitizeProviderResponse(rawValue);
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
  return typeof value === "string"
    ? value.trim()
    : "";
}

function requireString(
  value: unknown,
  field: string,
): string {
  const result = asString(value);

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
    typeof value === "number"
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
    .replace(/\s+/g, "")
    .replace(/^\+234/, "0")
    .replace(/^234/, "0");
}

function isValidNigerianPhone(
  phone: string,
): boolean {
  return /^0[789][01]\d{8}$/.test(phone);
}

function isSupportedService(
  value: unknown,
): value is SupportedService {
  return (
    typeof value === "string" &&
    SUPPORTED_SERVICES.includes(
      value as SupportedService,
    )
  );
}

function getMarkup(
  service: SupportedService,
): number {
  return PREMIUM_SERVICES.has(service)
    ? PREMIUM_MARKUP
    : REGULAR_MARKUP;
}

function calculateSellingPrice(
  providerCost: number,
  service: SupportedService,
): number {
  const markup = getMarkup(service);

  /*
   * Keep kobo precision internally.
   * Customer-facing rounding can be applied later
   * by the catalogue/database layer.
   */
  return Number(
    (providerCost * (1 + markup)).toFixed(2),
  );
}

/**
 * ============================================================
 * CLUBKONNECT HTTP CLIENT
 * ============================================================
 */

function buildUrl(
  endpoint: string,
  params: Record<string, string | number | undefined>,
): URL {
  const url = new URL(
    `${CLUBKONNECT_BASE_URL}/${endpoint}`,
  );

  for (const [key, value] of Object.entries(params)) {
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
  params: Record<string, string | number | undefined>,
): Promise<{
  ok: boolean;
  httpStatus: number;
  data: Record<string, unknown> | unknown[];
}> {
  const userId =
    Deno.env.get("CLUBKONNECT_USER_ID")?.trim();

  const apiKey =
    Deno.env.get("CLUBKONNECT_API_KEY")?.trim();

  if (!userId || !apiKey) {
    console.error(
      "ClubKonnect credentials are missing.",
    );

    throw new Error(
      "CLUBKONNECT_CONFIGURATION_ERROR",
    );
  }

  const url = buildUrl(
    endpoint,
    {
      UserID: userId,
      APIKey: apiKey,
      ...params,
    },
  );

  /*
   * NEVER log the final URL.
   * It contains the API key.
   */

  let response: Response;

  try {
    response = await fetch(
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

  const rawText =
    await response.text();

  let data: unknown;

  try {
    data = rawText
      ? JSON.parse(rawText)
      : {};
  } catch (error) {
    console.error(
      "ClubKonnect returned invalid JSON:",
      {
        http_status:
          response.status,
        parse_error:
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
    !data ||
    typeof data !== "object"
  ) {
    console.error(
      "Unexpected ClubKonnect response:",
      {
        http_status:
          response.status,
        response_type:
          typeof data,
      },
    );

    throw new Error(
      "CLUBKONNECT_INVALID_RESPONSE",
    );
  }

  const objectData =
    data as Record<string, unknown>;

  const providerStatus =
    asString(
      objectData.status ??
        objectData.Status ??
        objectData.orderstatus ??
        objectData.OrderStatus ??
        objectData.statuscode ??
        objectData.StatusCode,
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
    ok: response.ok,
    httpStatus:
      response.status,
    data:
      data as
        | Record<string, unknown>
        | unknown[],
  };
}

/**
 * ============================================================
 * CATALOGUE HELPERS
 * ============================================================
 */

async function getAirtimeNetworks() {
  return clubKonnectGet(
    "APIAirtimeNetworkV2.asp",
    {},
  );
}

async function getDataNetworks() {
  return clubKonnectGet(
    "APIDatabundleNetworkV2.asp",
    {},
  );
}

async function getDataPlans() {
  return clubKonnectGet(
    "APIDatabundlePlansV2.asp",
    {},
  );
}

async function getCableTypes() {
  return clubKonnectGet(
    "APICableTVTypeV2.asp",
    {},
  );
}

async function getCablePackages() {
  return clubKonnectGet(
    "APICableTVPackagesV2.asp",
    {},
  );
}

async function getSmilePackages() {
  return clubKonnectGet(
    "APISmilePackagesV2.asp",
    {},
  );
}

async function getEpinServices() {
  return clubKonnectGet(
    "APIEPINDiscountV2.asp",
    {},
  );
}

async function getWaecPackages() {
  return clubKonnectGet(
    "APIWAECPackagesV2.asp",
    {},
  );
}

async function getJambPackages() {
  return clubKonnectGet(
    "APIJAMBPackagesV2.asp",
    {},
  );
}

/**
 * ============================================================
 * PROVIDER BALANCE
 * ============================================================
 *
 * The balance is deliberately NOT returned to normal users.
 * The request only proves that the credentials work.
 */

async function checkProviderBalance() {
  const result =
    await clubKonnectGet(
      "APIWalletBalanceV1.asp",
      {},
    );

  const data =
    Array.isArray(result.data)
      ? {}
      : result.data;

  const providerStatus =
    asString(
      data.status ??
        data.Status ??
        data.statuscode ??
        data.StatusCode,
    );

  /*
   * ClubKonnect's wallet endpoint normally returns:
   *
   * {
   *   date,
   *   id,
   *   phoneno,
   *   balance
   * }
   *
   * We deliberately do NOT return balance.
   */

  const hasBalance =
    "balance" in data ||
    "Balance" in data;

  return {
    connected:
      result.ok &&
      hasBalance,
    provider_status:
      providerStatus || null,
  };
}

/**
 * ============================================================
 * TRANSACTION QUERY
 * ============================================================
 */

async function queryTransaction(
  requestId?: string,
  orderId?: string,
) {
  if (!requestId && !orderId) {
    throw new Error(
      "REQUEST_ID_OR_ORDER_ID_REQUIRED",
    );
  }

  return clubKonnectGet(
    "APIQueryV1.asp",
    {
      RequestID:
        requestId || undefined,
      OrderID:
        orderId || undefined,
    },
  );
}

/**
 * ============================================================
 * VERIFICATION
 * ============================================================
 */

async function verifyCustomer(
  service: SupportedService,
  body: Record<string, unknown>,
) {
  switch (service) {
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

    case "electricity": {
      const company =
        requireString(
          body.electric_company ??
            body.electricCompany ??
            body.provider,
          "electric_company",
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
 * CATALOGUE
 * ============================================================
 */

async function getCatalog(
  service?: SupportedService,
) {
  if (!service) {
    const [
      airtimeNetworks,
      dataNetworks,
      dataPlans,
      cableTypes,
      cablePackages,
      smilePackages,
      epinServices,
      waecPackages,
      jambPackages,
    ] = await Promise.all([
      getAirtimeNetworks(),
      getDataNetworks(),
      getDataPlans(),
      getCableTypes(),
      getCablePackages(),
      getSmilePackages(),
      getEpinServices(),
      getWaecPackages(),
      getJambPackages(),
    ]);

    return {
      airtime_networks:
        sanitizeProviderResponse(
          airtimeNetworks.data,
        ),
      data_networks:
        sanitizeProviderResponse(
          dataNetworks.data,
        ),
      data_plans:
        sanitizeProviderResponse(
          dataPlans.data,
        ),
      cable_types:
        sanitizeProviderResponse(
          cableTypes.data,
        ),
      cable_packages:
        sanitizeProviderResponse(
          cablePackages.data,
        ),
      smile_packages:
        sanitizeProviderResponse(
          smilePackages.data,
        ),
      epin_services:
        sanitizeProviderResponse(
          epinServices.data,
        ),
      waec_packages:
        sanitizeProviderResponse(
          waecPackages.data,
        ),
      jamb_packages:
        sanitizeProviderResponse(
          jambPackages.data,
        ),
      markup_rules: {
        regular_services: {
          airtime: 15,
          data: 15,
          cable_tv: 15,
          electricity: 15,
        },
        premium_services: {
          airtime_epin: 20,
          data_epin: 20,
          smile: 20,
          waec: 20,
          jamb: 20,
        },
        betting:
          "disabled",
      },
    };
  }

  switch (service) {
    case "airtime":
      return {
        service,
        markup_percent:
          getMarkup(service) * 100,
        data:
          sanitizeProviderResponse(
            (
              await getAirtimeNetworks()
            ).data,
          ),
      };

    case "data":
      return {
        service,
        markup_percent:
          getMarkup(service) * 100,
        data:
          sanitizeProviderResponse(
            (
              await getDataPlans()
            ).data,
          ),
      };

    case "cable_tv":
      return {
        service,
        markup_percent:
          getMarkup(service) * 100,
        types:
          sanitizeProviderResponse(
            (
              await getCableTypes()
            ).data,
          ),
        packages:
          sanitizeProviderResponse(
            (
              await getCablePackages()
            ).data,
          ),
      };

    case "smile":
      return {
        service,
        markup_percent:
          getMarkup(service) * 100,
        data:
          sanitizeProviderResponse(
            (
              await getSmilePackages()
            ).data,
          ),
      };

    case "airtime_epin":
    case "data_epin":
      return {
        service,
        markup_percent:
          getMarkup(service) * 100,
        data:
          sanitizeProviderResponse(
            (
              await getEpinServices()
            ).data,
          ),
      };

    case "waec":
      return {
        service,
        markup_percent:
          getMarkup(service) * 100,
        data:
          sanitizeProviderResponse(
            (
              await getWaecPackages()
            ).data,
          ),
      };

    case "jamb":
      return {
        service,
        markup_percent:
          getMarkup(service) * 100,
        data:
          sanitizeProviderResponse(
            (
              await getJambPackages()
            ).data,
          ),
      };

    case "electricity":
      /*
       * ClubKonnect's current electricity documentation exposes
       * the purchase and verification endpoints, but its public
       * page does not expose a stable V2 electricity-company
       * catalogue URL in the documentation text.
       *
       * Therefore we do not invent one.
       *
       * The actual company/meter catalogue will be added once
       * we confirm the live endpoint from the provider.
       */
      return {
        service,
        markup_percent:
          getMarkup(service) * 100,
        catalogue_available:
          false,
        message:
          "Electricity purchase and meter verification are supported. The live electricity-company catalogue endpoint will be connected after provider endpoint confirmation.",
      };

    default:
      throw new Error(
        "UNSUPPORTED_SERVICE",
      );
  }
}

/**
 * ============================================================
 * PURCHASE GUARD
 * ============================================================
 *
 * IMPORTANT:
 *
 * Purchase is intentionally disabled in this first deployment.
 *
 * We must first connect:
 *
 * 1. IyanjuPay wallet debit
 * 2. idempotency
 * 3. transaction creation
 * 4. provider RequestID
 * 5. callback handling
 * 6. provider query/reconciliation
 * 7. refund handling
 *
 * before allowing a real purchase.
 */

function rejectPurchase(): never {
  throw new Error(
    "PURCHASE_NOT_ENABLED_YET",
  );
}

/**
 * ============================================================
 * AUTHENTICATION
 * ============================================================
 */

async function authenticateUser(
  request: Request,
): Promise<{
  id: string;
}> {
  const supabaseUrl =
    Deno.env.get(
      "SUPABASE_URL",
    );

  const supabaseAnonKey =
    Deno.env.get(
      "SUPABASE_ANON_KEY",
    );

  if (
    !supabaseUrl ||
    !supabaseAnonKey
  ) {
    console.error(
      "Supabase authentication configuration is missing.",
    );

    throw new Error(
      "SUPABASE_CONFIGURATION_ERROR",
    );
  }

  const authorization =
    request.headers.get(
      "Authorization",
    );

  if (!authorization) {
    throw new Error(
      "AUTHENTICATION_REQUIRED",
    );
  }

  const supabase =
    createClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        global: {
          headers: {
            Authorization:
              authorization,
          },
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
      "ClubKonnect user authentication failed:",
      error,
    );

    throw new Error(
      "AUTHENTICATION_REQUIRED",
    );
  }

  return {
    id: data.user.id,
  };
}

/**
 * ============================================================
 * MAIN HANDLER
 * ============================================================
 */

Deno.serve(
  async (request: Request) => {
    /*
     * ----------------------------------------------------------
     * CORS
     * ----------------------------------------------------------
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
          success: false,
          error:
            "Method not allowed",
        },
        405,
      );
    }

    /*
     * ----------------------------------------------------------
     * AUTHENTICATE
     * ----------------------------------------------------------
     */

    let user:
      | { id: string }
      | null = null;

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
        "Authentication error:",
        error,
      );

      if (
        code ===
        "AUTHENTICATION_REQUIRED"
      ) {
        return jsonResponse(
          {
            success: false,
            error:
              "Authentication is required.",
          },
          401,
        );
      }

      return jsonResponse(
        {
          success: false,
          error:
            "Unable to authenticate the request.",
        },
        500,
      );
    }

    /*
     * ----------------------------------------------------------
     * READ REQUEST
     * ----------------------------------------------------------
     */

    let body:
      Record<string, unknown> = {};

    try {
      if (
        request.method ===
        "POST"
      ) {
        const raw =
          await request.text();

        if (raw.trim()) {
          const parsed =
            JSON.parse(raw);

          if (
            !parsed ||
            typeof parsed !==
              "object" ||
            Array.isArray(parsed)
          ) {
            return jsonResponse(
              {
                success: false,
                error:
                  "Invalid request body.",
              },
              400,
            );
          }

          body =
            parsed as Record<
              string,
              unknown
            >;
        }
      } else {
        const url =
          new URL(
            request.url,
          );

        body =
          Object.fromEntries(
            url.searchParams.entries(),
          );
      }
    } catch (error) {
      console.error(
        "Request parsing error:",
        error,
      );

      return jsonResponse(
        {
          success: false,
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

    /*
     * ----------------------------------------------------------
     * DEFAULT ACTION
     * ----------------------------------------------------------
     */

    if (!action) {
      return jsonResponse(
        {
          success: true,
          provider:
            "clubkonnect",
          service:
            "clubkonnect-service",
          authenticated:
            true,
          user_id:
            user.id,
          supported_services:
            SUPPORTED_SERVICES,
          actions: [
            "health",
            "balance",
            "catalog",
            "verify",
            "query",
            "purchase",
          ],
          purchase_enabled:
            false,
        },
      );
    }

    /*
     * ----------------------------------------------------------
     * BETTING IS NEVER ACCEPTED
     * ----------------------------------------------------------
     */

    const requestedService =
      asString(
        body.service,
      );

    if (
      requestedService ===
        "betting" ||
      requestedService ===
        "betting_wallet" ||
      action ===
        ("betting" as Action)
    ) {
      return jsonResponse(
        {
          success: false,
          error:
            "This service is not supported by IyanjuPay.",
        },
        403,
      );
    }

    /*
     * ----------------------------------------------------------
     * ACTION: HEALTH
     * ----------------------------------------------------------
     *
     * Calls the ClubKonnect wallet endpoint to prove that:
     *
     * - UserID exists
     * - APIKey exists
     * - Supabase can reach ClubKonnect
     * - credentials are accepted
     *
     * Provider balance is deliberately not returned.
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
            false,
        });
      } catch (error) {
        console.error(
          "ClubKonnect health check failed:",
          error,
        );

        return jsonResponse(
          {
            success: false,
            connected:
              false,
            error:
              "Unable to connect to the ClubKonnect service.",
          },
          502,
        );
      }
    }

    /*
     * ----------------------------------------------------------
     * ACTION: BALANCE
     * ----------------------------------------------------------
     *
     * Deliberately does not expose the actual provider balance.
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
            success: false,
            error:
              "Unable to verify the ClubKonnect provider account.",
          },
          502,
        );
      }
    }

    /*
     * ----------------------------------------------------------
     * ACTION: CATALOG
     * ----------------------------------------------------------
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
                success: false,
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
            success: false,
            error:
              "Unable to retrieve the ClubKonnect service catalogue.",
          },
          502,
        );
      }
    }

    /*
     * ----------------------------------------------------------
     * ACTION: VERIFY
     * ----------------------------------------------------------
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
            success: false,
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

        const data =
          sanitizeProviderResponse(
            result.data,
          );

        return jsonResponse({
          success:
            true,
          provider:
            "clubkonnect",
          service:
            requestedService,
          data,
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

        if (
          code ===
          "VERIFICATION_NOT_SUPPORTED"
        ) {
          return jsonResponse(
            {
              success: false,
              error:
                "Verification is not available for this service.",
            },
            400,
          );
        }

        return jsonResponse(
          {
            success: false,
            error:
              "Unable to verify the customer information.",
          },
          502,
        );
      }
    }

    /*
     * ----------------------------------------------------------
     * ACTION: QUERY
     * ----------------------------------------------------------
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
            success: false,
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
            success: false,
            error:
              "Unable to query the ClubKonnect transaction.",
          },
          502,
        );
      }
    }

    /*
     * ----------------------------------------------------------
     * ACTION: PURCHASE
     * ----------------------------------------------------------
     *
     * Intentionally blocked during Stage 1.
     *
     * DO NOT remove this guard until the wallet transaction
     * and idempotency layer has been implemented.
     */

    if (
      action ===
      "purchase"
    ) {
      console.warn(
        "Blocked ClubKonnect purchase attempt:",
        {
          user_id:
            user.id,
          service:
            requestedService ||
            null,
        },
      );

      return jsonResponse(
        {
          success: false,
          error:
            "ClubKonnect purchases are not enabled yet. The provider connection is ready, but wallet debit and transaction protection must be connected first.",
        },
        403,
      );
    }

    /*
     * ----------------------------------------------------------
     * UNKNOWN ACTION
     * ----------------------------------------------------------
     */

    return jsonResponse(
      {
        success: false,
        error:
          "Unsupported ClubKonnect action.",
      },
      400,
    );
  },
);
