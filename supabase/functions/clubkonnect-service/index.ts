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
  | "sync_catalog"
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

/**
 * Never expose provider credentials, raw URLs containing
 * credentials, stack traces, database errors, or technical
 * implementation details to users.
 */
function safeErrorMessage(
  status?: string,
  fallback =
    "Unable to process the request.",
): string {
  const value =
    String(status ?? "").toUpperCase();

  const knownMessages: Record<
    string,
    string
  > = {
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

    PURCHASE_NOT_ENABLED_YET:
      "ClubKonnect purchases are not enabled yet.",
  };

  return (
    knownMessages[value] ??
    fallback
  );
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
    const [
      key,
      rawValue,
    ] of Object.entries(source)
  ) {
    const normalizedKey =
      key
        .toLowerCase()
        .replace(
          /[_\s-]/g,
          "",
        );

    if (
      normalizedKey.includes(
        "apikey",
      ) ||
      normalizedKey.includes(
        "userid",
      ) ||
      normalizedKey.includes(
        "password",
      ) ||
      normalizedKey.includes(
        "secret",
      )
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
    typeof value === "string" &&
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
  const markup =
    getMarkup(service);

  return Number(
    (
      providerCost *
      (1 + markup)
    ).toFixed(2),
  );
}

/**
 * ============================================================
 * GENERIC VALUE HELPERS
 * ============================================================
 */

function objectValue(
  value: unknown,
): Record<string, unknown> | null {
  return value &&
    typeof value ===
      "object" &&
    !Array.isArray(value)
    ? (value as Record<
        string,
        unknown
      >)
    : null;
}

function firstValue(
  object: Record<
    string,
    unknown
  >,
  keys: string[],
): unknown {
  for (const key of keys) {
    if (
      object[key] !==
        undefined &&
      object[key] !== null &&
      String(object[key])
        .trim() !== ""
    ) {
      return object[key];
    }
  }

  return undefined;
}

function firstString(
  object: Record<
    string,
    unknown
  >,
  keys: string[],
): string {
  return asString(
    firstValue(
      object,
      keys,
    ),
  );
}

function firstNumber(
  object: Record<
    string,
    unknown
  >,
  keys: string[],
): number {
  const value =
    firstValue(
      object,
      keys,
    );

  return asPositiveNumber(
    value,
  );
}

/**
 * ============================================================
 * CLUBKONNECT HTTP CLIENT
 * ============================================================
 */

function buildUrl(
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
    const [
      key,
      value,
    ] of Object.entries(
      params,
    )
  ) {
    if (
      value !== undefined &&
      value !== null &&
      String(value).length >
        0
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
  data:
    | Record<string, unknown>
    | unknown[];
}> {
  const userId =
    Deno.env
      .get(
        "CLUBKONNECT_USER_ID",
      )
      ?.trim();

  const apiKey =
    Deno.env
      .get(
        "CLUBKONNECT_API_KEY",
      )
      ?.trim();

  if (
    !userId ||
    !apiKey
  ) {
    console.error(
      "ClubKonnect credentials are missing.",
    );

    throw new Error(
      "MISSING_CREDENTIALS",
    );
  }

  const url =
    buildUrl(
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
          method:
            "GET",
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
      ? JSON.parse(
          rawText,
        )
      : {};
  } catch (error) {
    console.error(
      "ClubKonnect returned invalid JSON:",
      {
        http_status:
          response.status,
        parse_error:
          error instanceof
          Error
            ? error.message
            : String(
                error,
              ),
      },
    );

    throw new Error(
      "CLUBKONNECT_INVALID_RESPONSE",
    );
  }

  if (
    !data ||
    typeof data !==
      "object"
  ) {
    throw new Error(
      "CLUBKONNECT_INVALID_RESPONSE",
    );
  }

  const objectData =
    data as Record<
      string,
      unknown
    >;

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
    ok:
      response.ok,
    httpStatus:
      response.status,
    data:
      data as
        | Record<
            string,
            unknown
          >
        | unknown[],
  };
}

/**
 * ============================================================
 * CLUBKONNECT CATALOGUE ENDPOINTS
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
 */

async function checkProviderBalance() {
  const result =
    await clubKonnectGet(
      "APIWalletBalanceV1.asp",
      {},
    );

  const data =
    Array.isArray(
      result.data,
    )
      ? {}
      : result.data;

  const providerStatus =
    asString(
      data.status ??
        data.Status ??
        data.statuscode ??
        data.StatusCode,
    );

  const hasBalance =
    "balance" in data ||
    "Balance" in data;

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
 * TRANSACTION QUERY
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
 * LIVE CATALOG
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
    ] =
      await Promise.all([
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
        neco:
          "disabled",
      },
    };
  }

  switch (service) {
    case "airtime":
      return {
        service,
        markup_percent:
          getMarkup(service) *
          100,
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
          getMarkup(service) *
          100,
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
          getMarkup(service) *
          100,
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
          getMarkup(service) *
          100,
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
          getMarkup(service) *
          100,
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
          getMarkup(service) *
          100,
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
          getMarkup(service) *
          100,
        data:
          sanitizeProviderResponse(
            (
              await getJambPackages()
            ).data,
          ),
      };

    case "electricity":
      return {
        service,
        markup_percent:
          getMarkup(service) *
          100,
        catalogue_available:
          false,
        message:
          "Electricity purchase and meter verification are supported. The live electricity-company catalogue will be synchronized when the provider endpoint returns the live catalogue.",
      };

    default:
      throw new Error(
        "UNSUPPORTED_SERVICE",
      );
  }
}

/**
 * ============================================================
 * CATALOGUE NORMALIZATION
 * ============================================================
 *
 * ClubKonnect returns different JSON structures for the
 * different services.
 *
 * We therefore normalize the provider response into the
 * common clubkonnect_products table.
 */

interface NormalizedProduct {
  service: SupportedService;
  provider: string | null;
  provider_id: string | null;
  product_id: string | null;
  product_code: string | null;
  product_sno: string | null;
  product_name: string | null;
  product_description: string | null;
  package_id: string | null;
  package_name: string | null;
  provider_amount: number | null;
  provider_discount_percent:
    number | null;
  provider_discount_amount:
    number | null;
  provider_cost: number | null;
  markup_percent: number;
  selling_price: number | null;
  metadata: Record<
    string,
    unknown
  >;
}

/**
 * Convert a possible percentage such as "3%" or "3.00"
 * into a number.
 */
function parsePercent(
  value: unknown,
): number | null {
  if (
    value ===
      undefined ||
    value === null
  ) {
    return null;
  }

  const text =
    String(value)
      .replace(
        "%",
        "",
      )
      .trim();

  const number =
    Number(text);

  return Number.isFinite(
    number,
  )
    ? number
    : null;
}

/**
 * ClubKonnect discount amount can be represented as:
 *
 * 0.970
 * 0.990
 * 97%
 *
 * We preserve the original value and only derive cost when
 * we have enough information.
 */
function deriveProviderCost(
  object: Record<
    string,
    unknown
  >,
): {
  amount: number | null;
  discountPercent:
    number | null;
  discountAmount:
    number | null;
  cost: number | null;
} {
  const amount =
    firstNumber(
      object,
      [
        "PRODUCT_AMOUNT",
        "PRODUCT_PRICE",
        "PRICE",
        "AMOUNT",
        "PACKAGE_AMOUNT",
        "PACKAGE_PRICE",
        "VALUE",
        "DENOMINATION",
      ],
    );

  const directCost =
    firstNumber(
      object,
      [
        "PRODUCT_COST",
        "COST",
        "SELLING_PRICE",
        "DISCOUNTED_AMOUNT",
      ],
    );

  const discountPercent =
    parsePercent(
      firstValue(
        object,
        [
          "PRODUCT_DISCOUNT",
          "DISCOUNT",
          "DISCOUNT_PERCENT",
          "DISCOUNT_PERCENTAGE",
        ],
      ),
    );

  const discountAmountRaw =
    firstValue(
      object,
      [
        "PRODUCT_DISCOUNT_AMOUNT",
        "DISCOUNT_AMOUNT",
      ],
    );

  const discountAmount =
    asPositiveNumber(
      discountAmountRaw,
    ) || null;

  /*
   * If the provider explicitly gives a cost,
   * use it.
   */
  if (
    directCost > 0
  ) {
    return {
      amount:
        amount > 0
          ? amount
          : null,
      discountPercent,
      discountAmount,
      cost: directCost,
    };
  }

  /*
   * Discount amount fields such as 0.990 mean
   * the customer/provider pays 99% of face value.
   */
  if (
    amount > 0 &&
    discountAmount !== null &&
    discountAmount > 0 &&
    discountAmount <= 1
  ) {
    return {
      amount,
      discountPercent,
      discountAmount,
      cost: Number(
        (
          amount *
          discountAmount
        ).toFixed(2),
      ),
    };
  }

  /*
   * Percentage discount such as 3%.
   */
  if (
    amount > 0 &&
    discountPercent !== null
  ) {
    return {
      amount,
      discountPercent,
      discountAmount,
      cost: Number(
        (
          amount *
          (1 -
            discountPercent /
              100)
        ).toFixed(2),
      ),
    };
  }

  /*
   * If no discount is supplied, the face amount
   * becomes the provider cost.
   */
  if (
    amount > 0
  ) {
    return {
      amount,
      discountPercent,
      discountAmount,
      cost: amount,
    };
  }

  return {
    amount:
      amount > 0
        ? amount
        : null,
    discountPercent,
    discountAmount,
    cost: null,
  };
}

/**
 * Recursively find objects that look like actual
 * ClubKonnect products.
 */
function collectProductObjects(
  value: unknown,
  output: Record<
    string,
    unknown
  >[] = [],
): Record<
  string,
  unknown
>[] {
  if (
    !value ||
    typeof value !==
      "object"
  ) {
    return output;
  }

  if (
    Array.isArray(value)
  ) {
    for (
      const item of value
    ) {
      collectProductObjects(
        item,
        output,
      );
    }

    return output;
  }

  const object =
    value as Record<
      string,
      unknown
    >;

  const normalizedKeys =
    Object.keys(
      object,
    ).map((key) =>
      key
        .toUpperCase()
        .replace(
          /[_\s-]/g,
          "",
        ),
    );

  const looksLikeProduct =
    normalizedKeys.some(
      (key) =>
        key.includes(
          "PRODUCTID",
        ) ||
        key.includes(
          "PRODUCTCODE",
        ) ||
        key.includes(
          "PRODUCTSNO",
        ) ||
        key.includes(
          "PACKAGEID",
        ) ||
        key.includes(
          "PACKAGECODE",
        ) ||
        key.includes(
          "PRODUCTDESCRIPTION",
        ) ||
        key.includes(
          "PACKAGENAME",
        ),
    );

  if (
    looksLikeProduct
  ) {
    output.push(
      object,
    );
  }

  for (
    const child of Object.values(
      object,
    )
  ) {
    if (
      child &&
      typeof child ===
        "object"
    ) {
      collectProductObjects(
        child,
        output,
      );
    }
  }

  return output;
}

function normalizeProduct(
  service: SupportedService,
  object: Record<
    string,
    unknown
  >,
): NormalizedProduct {
  const pricing =
    deriveProviderCost(
      object,
    );

  const provider =
    firstString(
      object,
      [
        "NETWORK_NAME",
        "MOBILE_NETWORK",
        "NETWORK",
        "TV_NAME",
        "CABLETV_NAME",
        "PROVIDER",
        "COMPANY_NAME",
        "ELECTRICITY_COMPANY",
      ],
    ) ||
    firstString(
      object,
      [
        "NETWORK_ID",
        "TV_ID",
        "CABLETV_ID",
        "PROVIDER_ID",
        "ELECTRIC_COMPANY",
      ],
    ) ||
    null;

  const providerId =
    firstString(
      object,
      [
        "NETWORK_ID",
        "TV_ID",
        "CABLETV_ID",
        "PROVIDER_ID",
        "ELECTRIC_COMPANY",
      ],
    ) || null;

  const productId =
    firstString(
      object,
      [
        "PRODUCT_ID",
        "PRODUCTID",
        "ID",
      ],
    ) || null;

  const productCode =
    firstString(
      object,
      [
        "PRODUCT_CODE",
        "PRODUCTCODE",
        "PACKAGE_CODE",
        "PACKAGECODE",
        "EXAM_TYPE",
        "EXAMTYPE",
      ],
    ) || null;

  const productSno =
    firstString(
      object,
      [
        "PRODUCT_SNO",
        "PRODUCTSNO",
        "SNO",
      ],
    ) || null;

  const productName =
    firstString(
      object,
      [
        "PRODUCT_NAME",
        "PRODUCTNAME",
        "PACKAGE_NAME",
        "PACKAGENAME",
        "PRODUCT_DESCRIPTION",
        "PRODUCTDESCRIPTION",
        "EXAM_DESCRIPTION",
        "EXAMTYPE_DESCRIPTION",
      ],
    ) || null;

  const description =
    firstString(
      object,
      [
        "PRODUCT_DESCRIPTION",
        "PRODUCTDESCRIPTION",
        "DESCRIPTION",
        "PACKAGE_DESCRIPTION",
        "PACKAGEDESCRIPTION",
      ],
    ) || null;

  const packageId =
    firstString(
      object,
      [
        "PACKAGE_ID",
        "PACKAGEID",
      ],
    ) || null;

  const packageName =
    firstString(
      object,
      [
        "PACKAGE_NAME",
        "PACKAGENAME",
      ],
    ) || null;

  const providerCost =
    pricing.cost;

  const markupPercent =
    getMarkup(service) *
    100;

  const sellingPrice =
    providerCost !==
      null &&
    providerCost > 0
      ? calculateSellingPrice(
          providerCost,
          service,
        )
      : null;

  return {
    service,
    provider,
    provider_id:
      providerId,
    product_id:
      productId,
    product_code:
      productCode,
    product_sno:
      productSno,
    product_name:
      productName,
    product_description:
      description,
    package_id:
      packageId,
    package_name:
      packageName,
    provider_amount:
      pricing.amount,
    provider_discount_percent:
      pricing.discountPercent,
    provider_discount_amount:
      pricing.discountAmount,
    provider_cost:
      providerCost,
    markup_percent:
      markupPercent,
    selling_price:
      sellingPrice,
    metadata:
      sanitizeProviderResponse(
        object,
      ) as Record<
        string,
        unknown
      >,
  };
}

/**
 * ============================================================
 * SERVICE-SPECIFIC NORMALIZATION
 * ============================================================
 */

function normalizeCatalogData(
  service: SupportedService,
  data: unknown,
): NormalizedProduct[] {
  const objects =
    collectProductObjects(
      data,
    );

  const products =
    objects.map(
      (object) =>
        normalizeProduct(
          service,
          object,
        ),
    );

  /*
   * Remove completely empty records.
   */
  return products.filter(
    (product) =>
      Boolean(
        product.product_id ||
          product.product_code ||
          product.product_sno ||
          product.package_id ||
          product.package_name ||
          product.product_name,
      ),
  );
}

/**
 * ============================================================
 * DATABASE / SUPABASE
 * ============================================================
 */

function getServiceRoleClient() {
  const url =
    Deno.env.get(
      "SUPABASE_URL",
    );

  const serviceRoleKey =
    Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY",
    );

  if (
    !url ||
    !serviceRoleKey
  ) {
    console.error(
      "Supabase service-role configuration is missing.",
    );

    throw new Error(
      "SUPABASE_CONFIGURATION_ERROR",
    );
  }

  return createClient(
    url,
    serviceRoleKey,
    {
      auth: {
        persistSession:
          false,
        autoRefreshToken:
          false,
      },
    },
  );
}

/**
 * ============================================================
 * ADMIN CHECK FOR CATALOGUE SYNC
 * ============================================================
 *
 * Catalogue synchronization modifies provider data and is
 * therefore restricted to an active administrator.
 *
 * The service-role client is used only on the server.
 */

async function requireAdmin(
  userId: string,
): Promise<void> {
  const supabase =
    getServiceRoleClient();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "support_admins",
      )
      .select(
        "user_id, is_active",
      )
      .eq(
        "user_id",
        userId,
      )
      .eq(
        "is_active",
        true,
      )
      .maybeSingle();

  if (error) {
    console.error(
      "Admin authorization lookup failed:",
      error,
    );

    throw new Error(
      "ADMIN_AUTHORIZATION_FAILED",
    );
  }

  if (!data) {
    throw new Error(
      "ADMIN_REQUIRED",
    );
  }
}

/**
 =============================================================
 * UPSERT ONE PRODUCT
 * =============================================================
 */

async function upsertProduct(
  product: NormalizedProduct,
  syncedAt: string,
) {
  const supabase =
    getServiceRoleClient();

  const payload = {
    service:
      product.service,
    provider:
      product.provider,
    provider_id:
      product.provider_id,
    product_id:
      product.product_id,
    product_code:
      product.product_code,
    product_sno:
      product.product_sno,
    product_name:
      product.product_name,
    product_description:
      product.product_description,
    package_id:
      product.package_id,
    package_name:
      product.package_name,
    provider_amount:
      product.provider_amount,
    provider_discount_percent:
      product.provider_discount_percent,
    provider_discount_amount:
      product.provider_discount_amount,
    provider_cost:
      product.provider_cost,
    markup_percent:
      product.markup_percent,
    selling_price:
      product.selling_price,
    currency:
      "NGN",
    active:
      true,
    provider_service:
      "clubkonnect",
    metadata:
      product.metadata,
    last_synced_at:
      syncedAt,
  };

  /*
   * Use the same identity logic as the unique index.
   *
   * Since Postgres ON CONFLICT cannot directly reference
   * the expression index by name in a portable way, first
   * try to locate the existing record.
   */
  let query =
    supabase
      .from(
        "clubkonnect_products",
      )
      .select("id")
      .eq(
        "service",
        product.service,
      );

  if (
    product.provider
  ) {
    query =
      query.eq(
        "provider",
        product.provider,
      );
  } else {
    query =
      query.is(
        "provider",
        null,
      );
  }

  if (
    product.provider_id
  ) {
    query =
      query.eq(
        "provider_id",
        product.provider_id,
      );
  } else {
    query =
      query.is(
        "provider_id",
        null,
      );
  }

  if (
    product.product_id
  ) {
    query =
      query.eq(
        "product_id",
        product.product_id,
      );
  } else {
    query =
      query.is(
        "product_id",
        null,
      );
  }

  if (
    product.product_code
  ) {
    query =
      query.eq(
        "product_code",
        product.product_code,
      );
  } else {
    query =
      query.is(
        "product_code",
        null,
      );
  }

  if (
    product.product_sno
  ) {
    query =
      query.eq(
        "product_sno",
        product.product_sno,
      );
  } else {
    query =
      query.is(
        "product_sno",
        null,
      );
  }

  const {
    data: existing,
    error: lookupError,
  } =
    await query
      .limit(1)
      .maybeSingle();

  if (lookupError) {
    console.error(
      "ClubKonnect product lookup failed:",
      lookupError,
    );

    throw new Error(
      "CATALOG_LOOKUP_FAILED",
    );
  }

  if (existing?.id) {
    const {
      error: updateError,
    } =
      await supabase
        .from(
          "clubkonnect_products",
        )
        .update(
          payload,
        )
        .eq(
          "id",
          existing.id,
        );

    if (updateError) {
      console.error(
        "ClubKonnect product update failed:",
        updateError,
      );

      throw new Error(
        "CATALOG_UPDATE_FAILED",
      );
    }

    return "updated";
  }

  const {
    error: insertError,
  } =
    await supabase
      .from(
        "clubkonnect_products",
      )
      .insert(
        payload,
      );

  if (insertError) {
    console.error(
      "ClubKonnect product insert failed:",
      insertError,
    );

    throw new Error(
      "CATALOG_INSERT_FAILED",
    );
  }

  return "inserted";
}

/**
 * ============================================================
 * DEACTIVATE STALE PRODUCTS
 * ============================================================
 */

async function deactivateStaleProducts(
  service: SupportedService,
  syncedAt: string,
) {
  const supabase =
    getServiceRoleClient();

  const {
    error,
  } =
    await supabase
      .from(
        "clubkonnect_products",
      )
      .update({
        active:
          false,
        updated_at:
          syncedAt,
      })
      .eq(
        "service",
        service,
      )
      .neq(
        "last_synced_at",
        syncedAt,
      );

  if (error) {
    console.error(
      "Failed to deactivate stale ClubKonnect products:",
      {
        service,
        error,
      },
    );

    throw new Error(
      "CATALOG_DEACTIVATION_FAILED",
    );
  }
}

/**
 * ============================================================
 * SYNCHRONIZE CATALOG
 * ============================================================
 */

async function syncCatalog() {
  const syncedAt =
    new Date().toISOString();

  const summary:
    Record<
      string,
      {
        fetched: number;
        inserted: number;
        updated: number;
        errors: number;
      }
    > = {};

  const results =
    await Promise.all([
      getAirtimeNetworks(),
      getDataPlans(),
      getCableTypes(),
      getCablePackages(),
      getSmilePackages(),
      getEpinServices(),
      getWaecPackages(),
      getJambPackages(),
    ]);

  /**
   * ----------------------------------------------------------
   * AIRTIME
   * ----------------------------------------------------------
   */

  const airtime =
    normalizeCatalogData(
      "airtime",
      results[0].data,
    );

  summary.airtime = {
    fetched:
      airtime.length,
    inserted: 0,
    updated: 0,
    errors: 0,
  };

  for (
    const product of airtime
  ) {
    try {
      const result =
        await upsertProduct(
          product,
          syncedAt,
        );

      if (
        result ===
        "inserted"
      ) {
        summary.airtime
          .inserted++;
      } else {
        summary.airtime
          .updated++;
      }
    } catch (error) {
      console.error(
        "Airtime catalogue item failed:",
        error,
      );

      summary.airtime
        .errors++;
    }
  }

  /**
   * ----------------------------------------------------------
   * DATA
   * ----------------------------------------------------------
   */

  const data =
    normalizeCatalogData(
      "data",
      results[1].data,
    );

  summary.data = {
    fetched:
      data.length,
    inserted: 0,
    updated: 0,
    errors: 0,
  };

  for (
    const product of data
  ) {
    try {
      const result =
        await upsertProduct(
          product,
          syncedAt,
        );

      if (
        result ===
        "inserted"
      ) {
        summary.data
          .inserted++;
      } else {
        summary.data
          .updated++;
      }
    } catch (error) {
      console.error(
        "Data catalogue item failed:",
        error,
      );

      summary.data
        .errors++;
    }
  }

  /**
   * ----------------------------------------------------------
   * CABLE TV
   * ----------------------------------------------------------
   *
   * The provider returns types and packages separately.
   * We combine both into the same catalogue table.
   */

  const cableTypes =
    normalizeCatalogData(
      "cable_tv",
      results[2].data,
    );

  const cablePackages =
    normalizeCatalogData(
      "cable_tv",
      results[3].data,
    );

  const cable =
    [
      ...cableTypes,
      ...cablePackages,
    ];

  summary.cable_tv = {
    fetched:
      cable.length,
    inserted: 0,
    updated: 0,
    errors: 0,
  };

  for (
    const product of cable
  ) {
    try {
      const result =
        await upsertProduct(
          product,
          syncedAt,
        );

      if (
        result ===
        "inserted"
      ) {
        summary.cable_tv
          .inserted++;
      } else {
        summary.cable_tv
          .updated++;
      }
    } catch (error) {
      console.error(
        "Cable TV catalogue item failed:",
        error,
      );

      summary.cable_tv
        .errors++;
    }
  }

  /**
   * ----------------------------------------------------------
   * SMILE
   * ----------------------------------------------------------
   */

  const smile =
    normalizeCatalogData(
      "smile",
      results[4].data,
    );

  summary.smile = {
    fetched:
      smile.length,
    inserted: 0,
    updated: 0,
    errors: 0,
  };

  for (
    const product of smile
  ) {
    try {
      const result =
        await upsertProduct(
          product,
          syncedAt,
        );

      if (
        result ===
        "inserted"
      ) {
        summary.smile
          .inserted++;
      } else {
        summary.smile
          .updated++;
      }
    } catch (error) {
      console.error(
        "Smile catalogue item failed:",
        error,
      );

      summary.smile
        .errors++;
    }
  }

  /**
   * ----------------------------------------------------------
   * E-PIN
   * ----------------------------------------------------------
   *
   * The provider endpoint contains both airtime and data
   * e-PIN catalogue information. We classify each product
   * based on its surrounding metadata.
   */

  const epinObjects =
    collectProductObjects(
      results[5].data,
    );

  const airtimeEpin =
    epinObjects
      .filter(
        (item) => {
          const text =
            JSON.stringify(
              item,
            ).toLowerCase();

          return (
            text.includes(
              "airtime",
            ) ||
            text.includes(
              "recharge",
            )
          );
        },
      )
      .map(
        (item) =>
          normalizeProduct(
            "airtime_epin",
            item,
          ),
      );

  const dataEpin =
    epinObjects
      .filter(
        (item) => {
          const text =
            JSON.stringify(
              item,
            ).toLowerCase();

          return (
            text.includes(
              "data",
            ) &&
            !text.includes(
              "airtime",
            )
          );
        },
      )
      .map(
        (item) =>
          normalizeProduct(
            "data_epin",
            item,
          ),
      );

  summary.airtime_epin = {
    fetched:
      airtimeEpin.length,
    inserted: 0,
    updated: 0,
    errors: 0,
  };

  summary.data_epin = {
    fetched:
      dataEpin.length,
    inserted: 0,
    updated: 0,
    errors: 0,
  };

  for (
    const product of airtimeEpin
  ) {
    try {
      const result =
        await upsertProduct(
          product,
          syncedAt,
        );

      if (
        result ===
        "inserted"
      ) {
        summary.airtime_epin
          .inserted++;
      } else {
        summary.airtime_epin
          .updated++;
      }
    } catch (error) {
      console.error(
        "Airtime e-PIN catalogue item failed:",
        error,
      );

      summary.airtime_epin
        .errors++;
    }
  }

  for (
    const product of dataEpin
  ) {
    try {
      const result =
        await upsertProduct(
          product,
          syncedAt,
        );

      if (
        result ===
        "inserted"
      ) {
        summary.data_epin
          .inserted++;
      } else {
        summary.data_epin
          .updated++;
      }
    } catch (error) {
      console.error(
        "Data e-PIN catalogue item failed:",
        error,
      );

      summary.data_epin
        .errors++;
    }
  }

  /**
   * ----------------------------------------------------------
   * WAEC
   * ----------------------------------------------------------
   */

  const waec =
    normalizeCatalogData(
      "waec",
      results[6].data,
    );

  summary.waec = {
    fetched:
      waec.length,
    inserted: 0,
    updated: 0,
    errors: 0,
  };

  for (
    const product of waec
  ) {
    try {
      const result =
        await upsertProduct(
          product,
          syncedAt,
        );

      if (
        result ===
        "inserted"
      ) {
        summary.waec
          .inserted++;
      } else {
        summary.waec
          .updated++;
      }
    } catch (error) {
      console.error(
        "WAEC catalogue item failed:",
        error,
      );

      summary.waec
        .errors++;
    }
  }

  /**
   * ----------------------------------------------------------
   * JAMB
   * ----------------------------------------------------------
   *
   * Your live test currently returned an empty EXAM_TYPE
   * catalogue. We therefore do not fabricate JAMB products.
   */

  const jamb =
    normalizeCatalogData(
      "jamb",
      results[7].data,
    );

  summary.jamb = {
    fetched:
      jamb.length,
    inserted: 0,
    updated: 0,
    errors: 0,
  };

  for (
    const product of jamb
  ) {
    try {
      const result =
        await upsertProduct(
          product,
          syncedAt,
        );

      if (
        result ===
        "inserted"
      ) {
        summary.jamb
          .inserted++;
      } else {
        summary.jamb
          .updated++;
      }
    } catch (error) {
      console.error(
        "JAMB catalogue item failed:",
        error,
      );

      summary.jamb
        .errors++;
    }
  }

  /**
   * ----------------------------------------------------------
   * ELECTRICITY
   * ----------------------------------------------------------
   *
   * We deliberately do not invent a catalogue endpoint.
   * Your existing live test showed that ClubKonnect currently
   * reports electricity catalogue availability as false.
   *
   * Purchase and meter verification can still be connected
   * later using the documented electricity endpoint.
   * ----------------------------------------------------------
   */

  summary.electricity = {
    fetched: 0,
    inserted: 0,
    updated: 0,
    errors: 0,
  };

  /**
   * ----------------------------------------------------------
   * DEACTIVATE STALE RECORDS
   * ----------------------------------------------------------
   *
   * Only deactivate services for which we successfully
   * received catalogue data.
   */

  const servicesWithCatalogue:
    SupportedService[] = [
      "airtime",
      "data",
      "cable_tv",
      "smile",
      "airtime_epin",
      "data_epin",
      "waec",
      "jamb",
    ];

  for (
    const service of
      servicesWithCatalogue
  ) {
    try {
      /*
       * If no products were returned, do not deactivate the
       * existing catalogue. This protects against temporary
       * provider/API failures.
       */
      if (
        summary[service]
          ?.fetched > 0
      ) {
        await deactivateStaleProducts(
          service,
          syncedAt,
        );
      }
    } catch (error) {
      console.error(
        "Stale catalogue cleanup failed:",
        {
          service,
          error,
        },
      );
    }
  }

  return {
    synced_at:
      syncedAt,
    markup_rules: {
      regular: {
        airtime: 15,
        data: 15,
        cable_tv: 15,
        electricity: 15,
      },
      premium: {
        smile: 20,
        airtime_epin: 20,
        data_epin: 20,
        waec: 20,
        jamb: 20,
      },
      excluded: [
        "betting",
        "neco",
      ],
    },
    summary,
  };
}

/**
 * ============================================================
 * PURCHASE GUARD
 * ============================================================
 *
 * Purchase remains disabled until the wallet transaction,
 * idempotency, refund and reconciliation layers are connected.
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
    id:
      data.user.id,
  };
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
          success: false,
          error:
            "Method not allowed",
        },
        405,
      );
    }

    /**
     * --------------------------------------------------------
     * AUTHENTICATE
     * --------------------------------------------------------
     */

    let user:
      | {
          id: string;
        }
      | null = null;

    try {
      user =
        await authenticateUser(
          request,
        );
    } catch (error) {
      const code =
        error instanceof
        Error
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
            success:
              false,
            error:
              "Authentication is required.",
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
     * READ REQUEST
     * --------------------------------------------------------
     */

    let body:
      Record<
        string,
        unknown
      > = {};

    try {
      if (
        request.method ===
        "POST"
      ) {
        const raw =
          await request.text();

        if (
          raw.trim()
        ) {
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
            return jsonResponse(
              {
                success:
                  false,
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
     * DEFAULT ACTION
     * --------------------------------------------------------
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
          true,
        supported_services:
          SUPPORTED_SERVICES,
        actions: [
          "health",
          "balance",
          "catalog",
          "sync_catalog",
          "verify",
          "query",
          "purchase",
        ],
        purchase_enabled:
          false,
      });
    }

    /**
     * --------------------------------------------------------
     * BETTING / NECO
     * --------------------------------------------------------
     */

    if (
      requestedService ===
        "betting" ||
      requestedService ===
        "betting_wallet" ||
      requestedService ===
        "neco" ||
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
     * ACTION: HEALTH
     * --------------------------------------------------------
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
     * ACTION: BALANCE
     * --------------------------------------------------------
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
     * ACTION: LIVE CATALOG
     * --------------------------------------------------------
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
     * ACTION: SYNC CATALOG
     * --------------------------------------------------------
     *
     * ADMIN ONLY.
     *
     * This writes provider products into
     * public.clubkonnect_products.
     */

    if (
      action ===
      "sync_catalog"
    ) {
      try {
        await requireAdmin(
          user.id,
        );
      } catch (error) {
        const code =
          error instanceof
          Error
            ? error.message
            : "";

        console.error(
          "ClubKonnect sync authorization failed:",
          error,
        );

        if (
          code ===
          "ADMIN_REQUIRED"
        ) {
          return jsonResponse(
            {
              success:
                false,
              error:
                "Administrator access is required.",
            },
            403,
          );
        }

        return jsonResponse(
          {
            success:
              false,
            error:
              "Unable to authorize catalogue synchronization.",
          },
          500,
        );
      }

      try {
        const result =
          await syncCatalog();

        return jsonResponse({
          success:
            true,
          provider:
            "clubkonnect",
          action:
            "sync_catalog",
          ...result,
        });
      } catch (error) {
        console.error(
          "ClubKonnect catalogue synchronization failed:",
          error,
        );

        return jsonResponse(
          {
            success:
              false,
            error:
              "Unable to synchronize the ClubKonnect catalogue.",
          },
          502,
        );
      }
    }

    /**
     * --------------------------------------------------------
     * ACTION: VERIFY
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
        console.error(
          "ClubKonnect verification error:",
          error,
        );

        return jsonResponse(
          {
            success:
              false,
            error:
              "Unable to verify the customer information.",
          },
          502,
        );
      }
    }

    /**
     * --------------------------------------------------------
     * ACTION: QUERY
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
     * ACTION: PURCHASE
     * --------------------------------------------------------
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

      try {
        rejectPurchase();
      } catch (error) {
        return jsonResponse(
          {
            success:
              false,
            error:
              safeErrorMessage(
                error instanceof
                  Error
                  ? error.message
                  : "",
                "ClubKonnect purchases are not enabled yet.",
              ),
          },
          403,
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
