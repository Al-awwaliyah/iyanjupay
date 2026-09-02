import {
  corsHeaders,
  json,
  adminClient,
  getUser,
  flw,
} from "../_shared/auth.ts";

import {
  clubKonnectAirtimeNetworks,
  clubKonnectDataNetworks,
  clubKonnectDataPlans,
  clubKonnectCableTypes,
  clubKonnectCablePackages,
  clubKonnectVerifyCable,
  clubKonnectVerifyElectricity,
  clubKonnectAirtime,
  clubKonnectData,
  clubKonnectCable,
  clubKonnectElectricity,
  clubKonnectQuery,
  clubKonnectQueryByRequestId,
} from "../_shared/clubkonnect.ts";

/**
 * ============================================================
 * IYANJUPAY - BILL PAYMENT
 * ============================================================
 *
 * EXISTING PROVIDER:
 *
 *   Flutterwave
 *
 * SERVICES:
 *   Airtime
 *   Data
 *   Electricity
 *   Cable TV
 *   Internet
 *
 *
 * ADDITIONAL PROVIDER:
 *
 *   ClubKonnect
 *
 * CLUBKONNECT PHASE 1:
 *
 *   Airtime       -> 15%
 *   Data          -> 15%
 *   Cable TV      -> 15%
 *   Electricity   -> 15%
 *
 *
 * IMPORTANT:
 *
 * - Flutterwave functionality remains supported.
 * - ClubKonnect credentials never reach the frontend.
 * - ClubKonnect selling price is calculated server-side.
 * - Provider amount and selling amount are stored separately.
 * - ClubKonnect ORDER_RECEIVED is NOT success.
 * - ClubKonnect ORDER_PROCESSED is NOT success.
 * - ClubKonnect 201 is treated as pending.
 * - Ambiguous provider responses remain pending.
 * - Definitive failures may be refunded.
 *
 * Future 20% services:
 *
 *   Airtime ePIN
 *   Data ePIN
 *   Smile
 *   WAEC
 *   JAMB
 *
 * These are intentionally not enabled in Phase 1.
 * ============================================================
 */

type ServiceType =
  | "airtime"
  | "data"
  | "electricity"
  | "cable"
  | "internet";

type ProviderId =
  | "flutterwave"
  | "clubkonnect";

const SUPPORTED_SERVICES: ServiceType[] = [
  "airtime",
  "data",
  "electricity",
  "cable",
  "internet",
];

const CLUBKONNECT_SERVICES: ServiceType[] = [
  "airtime",
  "data",
  "electricity",
  "cable",
];

const SERVICE_CATEGORY_MAP: Record<
  ServiceType,
  string
> = {
  airtime: "AIRTIME",
  data: "MOBILEDATA",
  electricity: "UTILITYBILLS",
  cable: "CABLEBILLS",
  internet: "INTSERVICE",
};

/*
 * Existing Flutterwave data markup.
 *
 * IMPORTANT:
 * This remains unchanged for Flutterwave.
 *
 * ClubKonnect uses its own 15% pricing.
 */
const FLUTTERWAVE_DATA_MARKUP = 50;

/*
 * ============================================================
 * CLUBKONNECT PRICING
 * ============================================================
 */

const CLUBKONNECT_STANDARD_MARKUP_RATE = 0.15;

const CLUBKONNECT_20_PERCENT_SERVICES = new Set([
  "airtime_epin",
  "data_epin",
  "smile",
  "waec",
  "jamb",
]);

/*
 * ============================================================
 * STATUS SETS
 * ============================================================
 */

const SUCCESS_STATUSES = new Set([
  "successful",
  "success",
  "completed",
  "complete",
  "succeeded",
]);

const FAILED_STATUSES = new Set([
  "failed",
  "failure",
  "declined",
  "rejected",
  "reversed",
  "reverse",
  "cancelled",
  "canceled",
]);

const PENDING_STATUSES = new Set([
  "pending",
  "processing",
  "queued",
  "initiated",
  "in_progress",
  "in-progress",
  "order_received",
  "order_processed",
]);

/*
 * ============================================================
 * GENERIC HELPERS
 * ============================================================
 */

function cleanString(
  value: unknown,
): string {
  return String(value ?? "").trim();
}

function normalizeService(
  value: unknown,
): ServiceType | null {
  const service =
    cleanString(value)
      .toLowerCase()
      .replace(/\s+/g, "_");

  if (
    SUPPORTED_SERVICES.includes(
      service as ServiceType,
    )
  ) {
    return service as ServiceType;
  }

  return null;
}

function normalizeStatus(
  value: unknown,
): string {
  return cleanString(value)
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function normalizeAmount(
  value: unknown,
): number {
  const amount = Number(value);

  if (
    !Number.isFinite(amount) ||
    amount < 0
  ) {
    return 0;
  }

  return Math.round(
    amount * 100,
  ) / 100;
}

function amountsMatch(
  a: number,
  b: number,
): boolean {
  return (
    Math.abs(a - b) < 0.01
  );
}

function isSuccessfulStatus(
  value: unknown,
): boolean {
  return SUCCESS_STATUSES.has(
    normalizeStatus(value),
  );
}

function isFailedStatus(
  value: unknown,
): boolean {
  return FAILED_STATUSES.has(
    normalizeStatus(value),
  );
}

function isPendingStatus(
  value: unknown,
): boolean {
  return PENDING_STATUSES.has(
    normalizeStatus(value),
  );
}

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
) {
  return json(
    body,
    status,
  );
}

function getNested(
  object: any,
  paths: string[][],
): unknown {
  for (
    const path of paths
  ) {
    let current = object;

    for (
      const key of path
    ) {
      if (
        current === null ||
        current === undefined
      ) {
        current = undefined;
        break;
      }

      current =
        current[key];
    }

    if (
      current !== null &&
      current !== undefined &&
      String(current).trim() !== ""
    ) {
      return current;
    }
  }

  return undefined;
}

function firstNonEmpty(
  ...values: unknown[]
): unknown {
  for (
    const value of values
  ) {
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

function roundMoney(
  value: number,
): number {
  return Math.round(
    value * 100,
  ) / 100;
}

/*
 * ============================================================
 * REQUEST FIELD EXTRACTION
 * ============================================================
 */

function extractAmount(
  body: any,
  details: any,
): number {
  return normalizeAmount(
    firstNonEmpty(
      body?.amount,
      details?.amount,
    ),
  );
}

function extractItemCode(
  body: any,
  details: any,
): string {
  /*
   * IMPORTANT:
   *
   * Do NOT convert ClubKonnect plan IDs
   * to Number.
   *
   * 1000 and 1000.00 must remain distinct
   * strings where supplied by the provider.
   */
  return cleanString(
    firstNonEmpty(
      body?.item_code,
      body?.itemCode,
      details?.item_code,
      details?.itemCode,
    ),
  );
}

function extractBillerCode(
  body: any,
  details: any,
): string {
  return cleanString(
    firstNonEmpty(
      body?.biller_code,
      body?.billerCode,
      details?.biller_code,
      details?.billerCode,
    ),
  );
}

function extractCustomer(
  body: any,
  details: any,
): string {
  return cleanString(
    firstNonEmpty(
      body?.customer,
      body?.customer_id,
      body?.customerId,
      body?.phoneNumber,
      body?.phone,
      body?.meterNumber,
      body?.meter_number,
      body?.smartCardNumber,
      body?.smartcardNumber,
      body?.smartcard_number,
      body?.accountNumber,
      body?.account_number,
      details?.customer,
      details?.customer_id,
      details?.customerId,
      details?.phoneNumber,
      details?.phone,
      details?.meterNumber,
      details?.meter_number,
      details?.smartCardNumber,
      details?.smartcardNumber,
      details?.smartcard_number,
      details?.accountNumber,
      details?.account_number,
    ),
  );
}

type ProviderCandidate = {
  provider_id: ProviderId;
  biller_code: string;
  item_code?: string;
};

async function getRouteTokenSecret(): Promise<CryptoKey> {
  const secret = cleanString(
    Deno.env.get("SERVICE_ROUTE_TOKEN_SECRET") ??
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
      "",
  );
  if (!secret) throw new Error("Service route secret is not configured.");
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function encodeRouteToken(value: unknown): Promise<string> {
  const payload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(value)));
  const key = await getRouteTokenSecret();
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return `${payload}.${base64UrlEncode(new Uint8Array(signature))}`;
}

async function decodeRouteToken<T>(value: unknown): Promise<T | null> {
  const token = cleanString(value);
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  try {
    const key = await getRouteTokenSecret();
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlDecode(signature),
      new TextEncoder().encode(payload),
    );
    if (!valid) return null;
    return JSON.parse(new TextDecoder().decode(base64UrlDecode(payload))) as T;
  } catch (error) {
    console.error("Invalid service route token:", error);
    return null;
  }
}

function normalizeCatalogKey(value: unknown): string {
  return cleanString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function providerSellingPrice(providerId: ProviderId, providerAmount: number, service: ServiceType): number {
  if (providerId === "clubkonnect") {
    return calculateClubKonnectPrice(providerAmount, service).sellingAmount;
  }
  return roundMoney(providerAmount + (service === "data" ? FLUTTERWAVE_DATA_MARKUP : 0));
}

function chooseCheapestCandidate(candidates: ProviderCandidate[], service: ServiceType): ProviderCandidate | null {
  if (!candidates.length) return null;
  if (service !== "data" && service !== "cable") {
    const flutterwave = candidates.find((candidate) => candidate.provider_id === "flutterwave");
    if (flutterwave) return flutterwave;
  }
  return candidates[0] ?? null;
}

function extractProviderId(
  body: any,
  details: any,
): ProviderId {
  const explicit =
    cleanString(
      firstNonEmpty(
        body?.provider_id,
        body?.providerId,
        details?.provider_id,
        details?.providerId,
      ),
    ).toLowerCase();

  if (
    explicit ===
    "clubkonnect"
  ) {
    return "clubkonnect";
  }

  return "flutterwave";
}

/*
 * We intentionally do NOT use a generic
 * details.provider === "clubkonnect" fallback.
 *
 * details.provider is normally the selected biller/network
 * display name, e.g. MTN, DSTV, Ikeja Electric.
 *
 * provider_id is the actual integration provider.
 */

function getProviderData(
  body: any,
): any {
  return (
    body?.details?.provider_response ??
    body?.provider_response ??
    body?.data ??
    null
  );
}

function getProviderMessage(
  body: any,
): string | null {
  const value =
    firstNonEmpty(
      body?.message,
      body?.error,
      body?.provider_message,
      body?.provider_response?.message,
      body?.provider_response?.data?.message,
      body?.data?.message,
    );

  return value
    ? cleanString(value)
    : null;
}

function extractProviderReference(
  body: any,
): string | null {
  const value =
    firstNonEmpty(
      body?.provider_reference,
      body?.providerReference,
      body?.provider_response?.data?.flw_ref,
      body?.provider_response?.data?.reference,
      body?.provider_response?.data?.id,
      body?.data?.flw_ref,
      body?.data?.reference,
      body?.data?.id,
    );

  return value
    ? cleanString(value)
    : null;
}

/*
 * ============================================================
 * FLUTTERWAVE HELPERS
 * ============================================================
 */

async function fetchBillItems(
  billerCode: string,
) {
  const response =
    await flw(
      `/billers/${encodeURIComponent(
        billerCode,
      )}/items`,
      {
        method: "GET",
      },
    );

  return response;
}

async function validateBillCustomer(
  itemCode: string,
  customer: string,
) {
  const response =
    await flw(
      `/bill-items/${encodeURIComponent(
        itemCode,
      )}/validate?customer=${encodeURIComponent(
        customer,
      )}`,
      {
        method: "GET",
      },
    );

  return response;
}

/*
 * ============================================================
 * LOCAL TRANSACTION HELPERS
 * ============================================================
 */

async function getLocalTransaction(
  admin: any,
  userId: string,
  reference: string,
) {
  const {
    data,
    error,
  } =
    await admin
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
      .eq(
        "user_id",
        userId,
      )
      .eq(
        "reference_number",
        reference,
      )
      .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function updateTransaction(
  admin: any,
  userId: string,
  reference: string,
  updates: Record<string, unknown>,
) {
  const {
    error,
  } =
    await admin
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
      "Transaction update failed:",
      error,
    );
  }
}

/*
 * ============================================================
 * REFUND
 * ============================================================
 */

async function refundBillTransaction(
  admin: any,
  userId: string,
  reference: string,
  amount: number,
  provider: ProviderId,
  reason: string,
  metadata: Record<string, unknown> = {},
) {
  const refundReference =
    `REFUND_${reference}`;

  const {
    data,
    error,
  } =
    await admin.rpc(
      "refund_wallet",
      {
        _user_id:
          userId,

        _amount:
          amount,

        _description:
          `Bill payment reversal (${provider})`,

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

          provider,

          reason,
        },
      },
    );

  if (error) {
    console.error(
      "Bill refund failed:",
      error,
    );

    return {
      success: false,
      data: null,
      error,
    };
  }

  return {
    success: true,
    data,
    error: null,
  };
}

/*
 * ============================================================
 * CLUBKONNECT HELPERS
 * ============================================================
 */

function clubKonnectStatusCode(
  body: any,
): number | null {
  const raw =
    firstNonEmpty(
      body?.statuscode,
      body?.statusCode,
      body?.StatusCode,
      body?.code,
      body?.Code,
      body?.data?.statuscode,
      body?.data?.statusCode,
      body?.data?.StatusCode,
      body?.data?.code,
    );

  if (
    raw === undefined ||
    raw === null ||
    String(raw).trim() === ""
  ) {
    return null;
  }

  const number =
    Number(raw);

  return Number.isFinite(number)
    ? number
    : null;
}

function clubKonnectStatusText(
  body: any,
): string {
  return cleanString(
    firstNonEmpty(
      body?.status,
      body?.Status,
      body?.message,
      body?.Message,
      body?.data?.status,
      body?.data?.Status,
      body?.data?.message,
      body?.data?.Message,
    ),
  ).toUpperCase();
}

function clubKonnectOrderId(
  body: any,
): string | null {
  const value =
    firstNonEmpty(
      body?.orderid,
      body?.orderId,
      body?.OrderID,
      body?.order_id,
      body?.data?.orderid,
      body?.data?.orderId,
      body?.data?.OrderID,
      body?.data?.order_id,
    );

  return value
    ? cleanString(value)
    : null;
}

function clubKonnectReference(
  body: any,
): string | null {
  const value =
    firstNonEmpty(
      body?.requestid,
      body?.requestId,
      body?.RequestID,
      body?.reference,
      body?.Reference,
      body?.data?.requestid,
      body?.data?.requestId,
      body?.data?.RequestID,
      body?.data?.reference,
      body?.data?.Reference,
    );

  return value
    ? cleanString(value)
    : null;
}

function classifyClubKonnectResponse(
  body: any,
  httpOk: boolean,
): {
  state:
    | "successful"
    | "pending"
    | "failed";

  definitiveFailure: boolean;

  statusCode: number | null;

  statusText: string;
} {
  const statusCode =
    clubKonnectStatusCode(
      body,
    );

  const statusText =
    clubKonnectStatusText(
      body,
    );

  /*
   * ClubKonnect documented terminal success.
   */
  if (
    statusCode === 200 ||
    statusText ===
      "ORDER_COMPLETED"
  ) {
    /*
     * 201 means the provider/network is
     * still potentially retrying.
     *
     * It MUST NOT be refunded immediately.
     */
    if (
      statusCode === 201
    ) {
      return {
        state: "pending",
        definitiveFailure:
          false,
        statusCode,
        statusText,
      };
    }

    return {
      state: "successful",
      definitiveFailure:
        false,
      statusCode,
      statusText,
    };
  }

  /*
   * Documented pending states.
   */
  if (
    statusCode === 100 ||
    statusCode === 300 ||
    statusText ===
      "ORDER_RECEIVED" ||
    statusText ===
      "ORDER_PROCESSED"
  ) {
    return {
      state: "pending",
      definitiveFailure:
        false,
      statusCode,
      statusText,
    };
  }

  /*
   * HTTP failure with no evidence that the
   * provider accepted the transaction is
   * considered failed.
   */
  if (
    !httpOk &&
    statusCode === null
  ) {
    return {
      state: "failed",
      definitiveFailure:
        true,
      statusCode,
      statusText,
    };
  }

  /*
   * Explicit generic failure statuses.
   */
  if (
    isFailedStatus(
      statusText,
    )
  ) {
    return {
      state: "failed",
      definitiveFailure:
        true,
      statusCode,
      statusText,
    };
  }

  /*
   * ClubKonnect documents 199, 299 and 399
   * as unspecified errors.
   *
   * We deliberately DO NOT refund these
   * automatically because the provider result
   * is ambiguous.
   */
  if (
    statusCode === 199 ||
    statusCode === 299 ||
    statusCode === 399
  ) {
    return {
      state: "pending",
      definitiveFailure:
        false,
      statusCode,
      statusText,
    };
  }

  /*
   * Unknown response:
   *
   * safest financial state = pending.
   */
  return {
    state: "pending",
    definitiveFailure:
      false,
    statusCode,
    statusText,
  };
}

function getClubKonnectMarkupRate(
  service: ServiceType,
): number {
  /*
   * Phase 1:
   *
   * Airtime
   * Data
   * Cable
   * Electricity
   *
   * all use 15%.
   */

  if (
    CLUBKONNECT_SERVICES.includes(
      service,
    )
  ) {
    return CLUBKONNECT_STANDARD_MARKUP_RATE;
  }

  /*
   * Future services are documented here so
   * pricing remains centralized.
   */
  if (
    CLUBKONNECT_20_PERCENT_SERVICES.has(
      service,
    )
  ) {
    return 0.20;
  }

  return CLUBKONNECT_STANDARD_MARKUP_RATE;
}

function calculateClubKonnectPrice(
  providerAmount: number,
  service: ServiceType,
) {
  const markupRate =
    getClubKonnectMarkupRate(
      service,
    );

  const markupAmount =
    roundMoney(
      providerAmount *
        markupRate,
    );

  const sellingAmount =
    roundMoney(
      providerAmount +
        markupAmount,
    );

  return {
    markupRate,
    markupAmount,
    sellingAmount,
  };
}

function isClubKonnectSME(item: any): boolean {
  const combined = [
    item?.name, item?.Name,
    item?.description, item?.Description,
    item?.plan, item?.Plan,
    item?.plan_name, item?.planName,
    item?.bundle, item?.Bundle,
    item?.plan_type, item?.planType,
    item?.type, item?.Type,
    item?.category, item?.category_name, item?.categoryName,
    item?.data_type, item?.dataType,
    item?.service_type, item?.serviceType,
  ]
    .map(cleanString)
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /\bsme\b/.test(combined) || /hot\s*deal/.test(combined) || /hotdeal/.test(combined);
}

function getDataPlanPeriod(item: any): "Daily" | "Weekly" | "Monthly" | "Other" {
  const explicit = [
    item?.plan_period,
    item?.planPeriod,
    item?.period,
    item?.period_name,
    item?.periodName,
    item?.group_name,
    item?.groupName,
    item?.category,
    item?.plan_type,
    item?.type,
  ].map(cleanString).filter(Boolean).join(" ").toLowerCase();

  if (explicit.includes("month")) return "Monthly";
  if (explicit.includes("week")) return "Weekly";
  if (explicit.includes("day")) return "Daily";

  const text = [
    item?.validity, item?.duration,
    item?.name, item?.Name,
    item?.description, item?.Description,
    item?.plan, item?.Plan,
    item?.plan_name, item?.planName,
  ].map(cleanString).filter(Boolean).join(" ").toLowerCase();

  if (/\b(30|31)\s*(day|days)\b/.test(text) || /\bmonthly\b/.test(text) || /\b[1-3]\s*months?\b/.test(text)) return "Monthly";
  if (/\b(7|14)\s*(day|days)\b/.test(text) || /\bweekly\b/.test(text) || /\b[1-2]\s*weeks?\b/.test(text)) return "Weekly";
  if (/\b(1|2|3)\s*(day|days)\b/.test(text) || /\bdaily\b/.test(text) || /\b24\s*hours?\b/.test(text)) return "Daily";
  return "Other";
}

function extractClubKonnectItemAmount(
  item: any,
): number {
  return normalizeAmount(
    firstNonEmpty(
      item?.amount,
      item?.Amount,
      item?.price,
      item?.Price,
      item?.selling_price,
      item?.sellingPrice,
      item?.cost,
      item?.Cost,
      item?.data?.amount,
      item?.data?.price,
    ),
  );
}

function extractClubKonnectItemCode(
  item: any,
): string {
  /*
   * Never Number() this value.
   */
  return cleanString(
    firstNonEmpty(
      item?.item_code,
      item?.itemCode,
      item?.code,
      item?.Code,
      item?.plan_id,
      item?.planId,
      item?.DataPlan,
      item?.dataplan,
      item?.data_plan,
      item?.dataPlan,
      item?.id,
    ),
  );
}

function extractClubKonnectName(
  item: any,
): string {
  return cleanString(
    firstNonEmpty(
      item?.name,
      item?.Name,
      item?.description,
      item?.Description,
      item?.plan_name,
      item?.planName,
      item?.plan,
      item?.Plan,
      item?.bundle,
      item?.Bundle,
      item?.id,
    ),
  );
}

function normalizeClubKonnectList(
  responseBody: any,
): any[] {
  if (
    Array.isArray(
      responseBody,
    )
  ) {
    return responseBody;
  }

  const candidates = [
    responseBody?.data,
    responseBody?.Data,
    responseBody?.plans,
    responseBody?.Plans,
    responseBody?.items,
    responseBody?.Items,
    responseBody?.networks,
    responseBody?.Networks,
    responseBody?.packages,
    responseBody?.Packages,
    responseBody?.result,
    responseBody?.Result,
  ];

  for (
    const candidate of candidates
  ) {
    if (
      Array.isArray(
        candidate,
      )
    ) {
      return candidate;
    }
  }

  if (
    responseBody &&
    typeof responseBody ===
      "object"
  ) {
    return Object.entries(
      responseBody,
    ).map(
      ([key, value]) => {
        if (
          value &&
          typeof value ===
            "object"
        ) {
          return {
            code: key,
            ...(value as Record<
              string,
              unknown
            >),
          };
        }

        return {
          code: key,
          name: String(
            value ?? key,
          ),
        };
      },
    );
  }

  return [];
}

function normalizeNetworkName(value: unknown): string {
  return cleanString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .replace(/^0+/, "");
}

function networkAliases(value: unknown): Set<string> {
  const raw = normalizeNetworkName(value);
  const aliases = new Set<string>([raw]);

  if (raw === "01" || raw === "1" || raw === "mtn" || raw === "mtnnigeria") {
    aliases.add("mtn"); aliases.add("01"); aliases.add("1");
  }
  if (raw === "02" || raw === "2" || raw === "glo" || raw === "globacom") {
    aliases.add("glo"); aliases.add("globacom"); aliases.add("02"); aliases.add("2");
  }
  if (raw === "03" || raw === "3" || raw === "airtel" || raw === "airtelnigeria") {
    aliases.add("airtel"); aliases.add("03"); aliases.add("3");
  }
  if (raw === "04" || raw === "4" || raw === "9mobile" || raw === "etisalat") {
    aliases.add("9mobile"); aliases.add("etisalat"); aliases.add("04"); aliases.add("4");
  }

  return aliases;
}

function networkMatches(item: any, networkCode: string): boolean {
  const targetAliases = networkAliases(networkCode);
  if (!targetAliases.size) return true;

  // Only inspect fields that actually describe a mobile network.
  // Do NOT use plan/code/id because those are commonly product IDs.
  const values = [
    item?.network,
    item?.Network,
    item?.network_code,
    item?.networkCode,
    item?.MobileNetwork,
    item?.mobilenetwork,
    item?.mobile_network,
    item?.mobileNetwork,
    item?.network_id,
    item?.networkId,
    item?.mobile_network_id,
    item?.mobileNetworkId,
  ].map(normalizeNetworkName).filter(Boolean);

  // If ClubKonnect did not include a network field, do not discard the plan.
  if (!values.length) return true;

  return values.some((value) => {
    const aliases = networkAliases(value);
    return Array.from(aliases).some((alias) => targetAliases.has(alias));
  });
}

function normalizeClubKonnectNetworks(
  body: any,
): any[] {
  return normalizeClubKonnectList(
    body,
  ).map(
    (item) => {
      const code =
        cleanString(
          firstNonEmpty(
            item?.code,
            item?.Code,
            item?.network_code,
            item?.networkCode,
            item?.MobileNetwork,
            item?.mobilenetwork,
            item?.id,
          ),
        );

      const name =
        extractClubKonnectName(
          item,
        );

      return {
        ...item,
        biller_code:
          code,
        billerCode:
          code,
        code,
        name:
          name || code,
        provider:
          "clubkonnect",
        provider_id:
          "clubkonnect",
      };
    },
  );
}

function normalizeClubKonnectDataPlans(
  body: any,
  networkCode: string,
): any[] {
  return normalizeClubKonnectList(
    body,
  )
    .filter(
      (item) =>
        networkMatches(
          item,
          networkCode,
        ),
    )
    .map(
      (item) => {
        /*
         * IMPORTANT:
         * item_code remains a string.
         */
        const itemCode =
          extractClubKonnectItemCode(
            item,
          );

        const providerAmount =
          extractClubKonnectItemAmount(
            item,
          );

        const name =
          extractClubKonnectName(
            item,
          );

        const isSME =
          isClubKonnectSME(
            item,
          );

        return {
          ...item,

          item_code:
            itemCode,

          itemCode:
            itemCode,

          data_plan:
            itemCode,

          dataPlan:
            itemCode,

          name:
            name ||
            itemCode,

          amount:
            providerAmount,

          provider_amount:
            providerAmount,

          provider:
            "clubkonnect",

          provider_id:
            "clubkonnect",

          plan_type:
            isSME
              ? "SME"
              : "REGULAR",

          is_hot_deal:
            isSME,
        };
      },
    )
    .filter(
      (item) =>
        Boolean(
          item.item_code,
        ),
    );
}

function normalizeClubKonnectCableTypes(
  body: any,
): any[] {
  return normalizeClubKonnectList(
    body,
  ).map(
    (item) => {
      const code =
        cleanString(
          firstNonEmpty(
            item?.code,
            item?.Code,
            item?.CableTV,
            item?.cableTv,
            item?.cable_tv,
            item?.id,
          ),
        );

      const name =
        extractClubKonnectName(
          item,
        );

      return {
        ...item,

        biller_code:
          code,

        billerCode:
          code,

        code,

        name:
          name || code,

        provider:
          "clubkonnect",

        provider_id:
          "clubkonnect",
      };
    },
  );
}

function normalizeClubKonnectCablePackages(
  body: any,
  cableTv: string,
): any[] {
  return normalizeClubKonnectList(
    body,
  )
    .filter(
      (item) => {
        const values = [
          item?.CableTV,
          item?.cableTv,
          item?.cable_tv,
          item?.cable_code,
          item?.cableCode,
          item?.network,
          item?.network_code,
          item?.provider,
        ]
          .map(cleanString)
          .filter(Boolean)
          .map(
            (value) =>
              value.toLowerCase(),
          );

        /*
         * If the package contains an explicit
         * cable provider field, filter by it.
         *
         * If it does not, leave it available.
         */
        if (
          values.length === 0
        ) {
          return true;
        }

        return (
          values.includes(
            cleanString(
              cableTv,
            ).toLowerCase(),
          ) ||
          values.length === 0
        );
      },
    )
    .map(
      (item) => {
        const itemCode =
          cleanString(
            firstNonEmpty(
              item?.package,
              item?.Package,
              item?.package_code,
              item?.packageCode,
              item?.code,
              item?.Code,
              item?.id,
            ),
          );

        const amount =
          extractClubKonnectItemAmount(
            item,
          );

        const name =
          extractClubKonnectName(
            item,
          );

        return {
          ...item,

          item_code:
            itemCode,

          itemCode:
            itemCode,

          amount,

          provider_amount:
            amount,

          name:
            name || itemCode,

          provider:
            "clubkonnect",

          provider_id:
            "clubkonnect",
        };
      },
    )
    .filter(
      (item) =>
        Boolean(
          item.item_code,
        ),
    );
}

/*
 * ============================================================
 * CATALOG VALIDATION
 * ============================================================
 */

async function validateFlutterwaveSelectedItem(
  billerCode: string,
  itemCode: string,
) {
  const response =
    await fetchBillItems(
      billerCode,
    );

  if (
    !response.ok ||
    response.body?.status !==
      "success"
  ) {
    throw new Error(
      "Unable to verify the selected bill package.",
    );
  }

  const items =
    Array.isArray(
      response.body?.data,
    )
      ? response.body.data
      : [];

  const selected =
    items.find(
      (item: any) =>
        cleanString(
          item?.item_code ??
            item?.itemCode ??
            item?.code,
        ) === itemCode,
    );

  if (!selected) {
    throw new Error(
      "The selected bill package is no longer available.",
    );
  }

  return {
    selected,
    response,
  };
}

/*
 * ============================================================
 * FLUTTERWAVE STATUS
 * ============================================================
 */

async function getFlutterwaveBillStatus(
  reference: string,
) {
  return flw(
    `/bills/${encodeURIComponent(
      reference,
    )}?verbose=1`,
    {
      method: "GET",
    },
  );
}

/*
 * ============================================================
 * MAIN HANDLER
 * ============================================================
 */

function providerFallbackLogo(name: string): string | null {
  const key = normalizeCatalogKey(name).replace(/\s+/g, " ");
  if (key.includes("mtn")) return "https://cdn.simpleicons.org/mtn/FFCC00";
  if (key.includes("glo") || key.includes("globacom")) return "https://cdn.simpleicons.org/globacom/00A651";
  if (key.includes("airtel")) return "https://cdn.simpleicons.org/airtel/E4002B";
  if (key.includes("9mobile") || key.includes("etisalat")) return "https://cdn.simpleicons.org/9mobile/008751";
  if (key.includes("dstv")) return "https://cdn.simpleicons.org/dstv/00A4E4";
  if (key.includes("gotv")) return "https://cdn.simpleicons.org/gotv/00A4E4";
  if (key.includes("startimes")) return "https://cdn.simpleicons.org/startimes/FF6A00";
  if (key.includes("smile")) return "https://cdn.simpleicons.org/smile/EC008C";
  if (key.includes("spectranet")) return "https://cdn.simpleicons.org/spectranet/0057B8";
  return null;
}

Deno.serve(
  async (req) => {
    /*
     * ==========================================================
     * CORS
     * ==========================================================
     */

    if (
      req.method ===
      "OPTIONS"
    ) {
      return new Response(
        null,
        {
          status: 204,
          headers:
            corsHeaders,
        },
      );
    }

    /*
     * ==========================================================
     * METHOD
     * ==========================================================
     */

    if (
      req.method !==
      "POST"
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

    try {
      /*
       * ========================================================
       * AUTHENTICATION
       * ========================================================
       */

      const user =
        await getUser(
          req,
        );

      if (!user) {
        return jsonResponse(
          {
            success:
              false,
            error:
              "Authentication required.",
          },
          401,
        );
      }

      /*
       * ========================================================
       * REQUEST BODY
       * ========================================================
       */

      let body: any;

      try {
        body =
          await req.json();
      } catch {
        return jsonResponse(
          {
            success:
              false,
            error:
              "Invalid request.",
          },
          400,
        );
      }

      const action =
        cleanString(
          body?.action ||
            "service",
        ).toLowerCase();

      const admin =
        adminClient();

      console.log(
        "flutterwave-bills request:",
        JSON.stringify({
          action,
          user_id:
            user.id,
          service:
            body?.service ??
            body?.details?.service ??
            null,
          provider_id:
            body?.provider_id ??
            body?.details?.provider_id ??
            "flutterwave",
          biller_code:
            body?.biller_code ??
            body?.details?.biller_code ??
            null,
          item_code:
            body?.item_code ??
            body?.details?.item_code ??
            null,
        }),
      );

      /*
       * ========================================================
       * ACTION: CATEGORIES
       * ========================================================
       *
       * Flutterwave categories remain unchanged.
       *
       * ClubKonnect does not use Flutterwave categories.
       */

      if (
        action ===
        "categories"
      ) {
        const response =
          await flw(
            "/bill-categories?country=NG",
            {
              method:
                "GET",
            },
          );

        if (
          !response.ok
        ) {
          console.error(
            "Flutterwave categories request failed:",
            response.body,
          );

          return jsonResponse(
            {
              success:
                false,
              error:
                "Unable to load bill categories.",
            },
            502,
          );
        }

        return jsonResponse(
          {
            success:
              true,
            data:
              response.body
                ?.data ??
              [],
          },
        );
      }

      /*
       * ========================================================
       * ACTION: BILLERS
       * ========================================================
       *
       * The client never selects an integration provider.
       * We merge the available billers from all supported
       * integrations and return an opaque route token.
       */

      if (action === "billers") {
        const service = normalizeService(
          body?.service ?? body?.details?.service,
        );
        const category = cleanString(
          body?.category ?? body?.details?.category ??
            (service ? SERVICE_CATEGORY_MAP[service] : ""),
        );

        if (!service) {
          return jsonResponse({ success: false, error: "A valid service is required." }, 400);
        }

        const grouped = new Map<string, { name: string; candidates: ProviderCandidate[]; raw?: any }>();

        const addBiller = (name: string, candidate: ProviderCandidate, raw?: any) => {
          const displayName = cleanString(name) || candidate.biller_code;
          const key = normalizeCatalogKey(displayName);
          if (!key) return;
          const existing = grouped.get(key);
          if (existing) {
            if (!existing.candidates.some((c) => c.provider_id === candidate.provider_id && c.biller_code === candidate.biller_code)) {
              existing.candidates.push(candidate);
            }
            return;
          }
          grouped.set(key, { name: displayName, candidates: [candidate], raw });
        };

        // Flutterwave is queried for every supported service.
        if (category) {
          try {
            const response = await flw(
              `/bills/${encodeURIComponent(category)}/billers?country=NG`,
              { method: "GET" },
            );
            if (response.ok && response.body?.status === "success") {
              for (const biller of Array.isArray(response.body?.data) ? response.body.data : []) {
                const code = cleanString(biller?.biller_code ?? biller?.code ?? biller?.id);
                const name = cleanString(biller?.name ?? biller?.short_name ?? biller?.biller_name ?? code);
                if (code) addBiller(name, { provider_id: "flutterwave", biller_code: code }, biller);
              }
            } else {
              console.error("Flutterwave billers request failed:", response.body);
            }
          } catch (error) {
            console.error("Flutterwave billers request exception:", error);
          }
        }

        // ClubKonnect catalogs are added where the integration has an authoritative list.
        if (service === "airtime" || service === "data") {
          try {
            const response = await clubKonnectDataNetworks();
            if (response.ok) {
              for (const biller of normalizeClubKonnectNetworks(response.body)) {
                const code = cleanString(biller?.biller_code ?? biller?.code);
                if (code) addBiller(cleanString(biller?.name ?? code), { provider_id: "clubkonnect", biller_code: code }, biller);
              }
            }
          } catch (error) {
            console.error("ClubKonnect data networks exception:", error);
          }
        }

        if (service === "airtime") {
          try {
            const response = await clubKonnectAirtimeNetworks();
            if (response.ok) {
              for (const biller of normalizeClubKonnectNetworks(response.body)) {
                const code = cleanString(biller?.biller_code ?? biller?.code);
                if (code) addBiller(cleanString(biller?.name ?? code), { provider_id: "clubkonnect", biller_code: code }, biller);
              }
            }
          } catch (error) {
            console.error("ClubKonnect airtime networks exception:", error);
          }
        }

        if (service === "cable") {
          try {
            const response = await clubKonnectCableTypes();
            if (response.ok) {
              for (const biller of normalizeClubKonnectCableTypes(response.body)) {
                const code = cleanString(biller?.biller_code ?? biller?.code);
                if (code) addBiller(cleanString(biller?.name ?? code), { provider_id: "clubkonnect", biller_code: code }, biller);
              }
            }
          } catch (error) {
            console.error("ClubKonnect cable types exception:", error);
          }
        }

        const billers = await Promise.all(
          Array.from(grouped.values()).map(async (entry) => {
            const publicBiller =
              entry.raw && typeof entry.raw === "object"
                ? { ...(entry.raw as Record<string, unknown>) }
                : {};

            // Never expose integration/provider metadata to the customer.
            delete publicBiller.provider;
            delete publicBiller.provider_id;
            delete publicBiller.provider_amount;
            delete publicBiller.selling_amount;
            delete publicBiller.markup_rate;
            delete publicBiller.markup_amount;

            return {
              ...publicBiller,
              name: entry.name,
              short_name: cleanString(entry.raw?.short_name ?? entry.name),
              logo: cleanString(entry.raw?.logo ?? entry.raw?.logo_url ?? entry.raw?.logoUrl) || providerFallbackLogo(entry.name),
              biller_code: await encodeRouteToken({ version: 1, service, candidates: entry.candidates }),
              category,
              country: "NG",
            };
          }),
        );

        if (!billers.length) {
          return jsonResponse({ success: false, error: "No service providers are currently available." }, 502);
        }

        return jsonResponse({ success: true, service, billers });
      }

      /*
       * ========================================================
       * ACTION: ITEMS
       * ========================================================
       */

      if (action === "items") {
        const service = normalizeService(body?.service ?? body?.details?.service);
        const publicBillerCode = extractBillerCode(body, body?.details ?? {});
        if (!service) return jsonResponse({ success: false, error: "A valid service is required." }, 400);
        if (!publicBillerCode) return jsonResponse({ success: false, error: "A valid biller is required." }, 400);

        const route = await decodeRouteToken<{ version: number; service: ServiceType; candidates: ProviderCandidate[] }>(publicBillerCode);
        const candidates = route?.candidates ?? [];
        if (!candidates.length) return jsonResponse({ success: false, error: "The selected service provider is no longer available." }, 400);

        const output = new Map<string, any>();

        const addItem = async (item: any, candidate: ProviderCandidate) => {
          const originalCode = cleanString(item?.item_code ?? item?.itemCode ?? item?.code ?? item?.id);
          if (!originalCode) return;
          const providerAmount = normalizeAmount(item?.provider_amount ?? item?.amount ?? item?.price ?? item?.selling_price ?? item?.cost ?? item?.value);
          if (providerAmount <= 0) return;
          const name = cleanString(item?.name ?? item?.short_name ?? item?.description ?? originalCode);
          const hotFlag =
            item?.is_hot_deal === true ||
            (service === "data" && isClubKonnectSME(item));
          const period =
            service === "data"
              ? cleanString(item?.plan_period) || getDataPlanPeriod(item)
              : "";
          const identity = normalizeCatalogKey(
            `${name}|${item?.validity ?? item?.duration ?? ""}|${item?.label_name ?? ""}|${period}|${hotFlag ? "HOT" : "REGULAR"}`
          ) || originalCode.toLowerCase();
          const sellingPrice = providerSellingPrice(candidate.provider_id, providerAmount, service);
          const routeCode = await encodeRouteToken({ version: 1, provider_id: candidate.provider_id, biller_code: candidate.biller_code, item_code: originalCode });
          const publicItem = {
            ...item,
            name,
            item_code: routeCode,
            amount: sellingPrice,
            selling_price: sellingPrice,
            plan_period: service === "data" ? period : item?.plan_period,
            plan_type: service === "data" ? (item?.plan_type ?? (hotFlag ? "SME" : "REGULAR")) : item?.plan_type,
            is_hot_deal: service === "data" ? hotFlag : item?.is_hot_deal === true,
            provider_id: undefined,
            provider: undefined,
          };
          const existing = output.get(identity);
          if (!existing || sellingPrice < normalizeAmount(existing.selling_price)) output.set(identity, publicItem);
        };

        // ClubKonnect airtime/electricity are variable-amount services and do not
        // have a package catalog. Expose one neutral selectable service entry so
        // the customer can choose an amount while routing remains server-side.
        for (const candidate of candidates) {
          if (candidate.provider_id === "clubkonnect" &&
              (service === "airtime" || service === "electricity")) {
            await addItem(
              {
                item_code: "__variable__",
                name: service === "airtime" ? "Airtime Recharge" : "Electricity Payment",
                amount: 1,
              },
              candidate,
            );
          }
        }

        for (const candidate of candidates) {
          try {
            if (service === "data" && candidate.provider_id === "clubkonnect") {
              const response = await clubKonnectDataPlans();
              if (response.ok) {
                for (const item of normalizeClubKonnectDataPlans(response.body, candidate.biller_code)) await addItem(item, candidate);
              }
            } else if (service === "cable" && candidate.provider_id === "clubkonnect") {
              const response = await clubKonnectCablePackages();
              if (response.ok) {
                for (const item of normalizeClubKonnectCablePackages(response.body, candidate.biller_code)) await addItem(item, candidate);
              }
            } else if (candidate.provider_id === "flutterwave") {
              const response = await fetchBillItems(candidate.biller_code);
              if (response.ok && response.body?.status === "success") {
                for (const item of Array.isArray(response.body?.data) ? response.body.data : []) await addItem(item, candidate);
              }
            }
          } catch (error) {
            console.error("Service item catalog exception:", error);
          }
        }

        return jsonResponse({
          success: true,
          service,
          biller_code: publicBillerCode,
          items: Array.from(output.values()),
        });
      }

      /*
       * ========================================================
       * ACTION: VALIDATE
       * ========================================================
       */

      if (
        action ===
        "validate"
      ) {
        const provider =
          extractProviderId(
            body,
            body?.details ??
              {},
          );

        const service =
          normalizeService(
            body?.service ??
              body?.details
                ?.service,
          );

        const billerCode =
          extractBillerCode(
            body,
            body?.details ??
              {},
          );

        const itemCode =
          extractItemCode(
            body,
            body?.details ??
              {},
          );

        const customer =
          extractCustomer(
            body,
            body?.details ??
              {},
          );

        if (
          !service
        ) {
          return jsonResponse(
            {
              success:
                false,
              error:
                "A valid service is required.",
            },
            400,
          );
        }

        if (
          !customer
        ) {
          return jsonResponse(
            {
              success:
                false,
              error:
                "Customer information is required.",
            },
            400,
          );
        }

        /*
         * ------------------------------------------------------
         * CLUBKONNECT CABLE VALIDATION
         * ------------------------------------------------------
         */

        if (
          provider ===
            "clubkonnect" &&
          service ===
            "cable"
        ) {
          if (
            !billerCode
          ) {
            return jsonResponse(
              {
                success:
                  false,
                error:
                  "Cable provider is required.",
              },
              400,
            );
          }

          const response =
            await clubKonnectVerifyCable(
              {
                cableTv:
                  billerCode,
                smartCard:
                  customer,
              },
            );

          if (
            !response.ok
          ) {
            console.error(
              "ClubKonnect cable validation failed:",
              response.body,
            );

            return jsonResponse(
              {
                success:
                  false,
                error:
                  "Unable to validate the cable account.",
              },
              502,
            );
          }

          const status =
            classifyClubKonnectResponse(
              response.body,
              response.ok,
            );

          return jsonResponse(
            {
              success:
                status.state !==
                "failed",
              service,
              validated:
                status.state !==
                "failed",
              status:
                status.state,
              data:
                response.body,
            },
            status.state ===
              "failed"
              ? 400
              : 200,
          );
        }

        /*
         * ------------------------------------------------------
         * CLUBKONNECT ELECTRICITY VALIDATION
         * ------------------------------------------------------
         */

        if (
          provider ===
            "clubkonnect" &&
          service ===
            "electricity"
        ) {
          if (
            !billerCode
          ) {
            return jsonResponse(
              {
                success:
                  false,
                error:
                  "Electricity provider is required.",
              },
              400,
            );
          }

          const details =
            body?.details ??
            {};

          const meterType =
            cleanString(
              firstNonEmpty(
                details?.meter_type,
                details?.meterType,
                body?.meter_type,
                body?.meterType,
                "prepaid",
              ),
            );

          const response =
            await clubKonnectVerifyElectricity(
              {
                company:
                  billerCode,
                meterType,
                meterNumber:
                  customer,
              },
            );

          if (
            !response.ok
          ) {
            console.error(
              "ClubKonnect electricity validation failed:",
              response.body,
            );

            return jsonResponse(
              {
                success:
                  false,
                error:
                  "Unable to validate the electricity meter.",
              },
              502,
            );
          }

          const status =
            classifyClubKonnectResponse(
              response.body,
              response.ok,
            );

          return jsonResponse(
            {
              success:
                status.state !==
                "failed",
              service,
              validated:
                status.state !==
                "failed",
              status:
                status.state,
              data:
                response.body,
            },
            status.state ===
              "failed"
              ? 400
              : 200,
          );
        }

        /*
         * ClubKonnect does not need separate
         * validation for Airtime/Data.
         */

        if (
          provider ===
            "clubkonnect"
        ) {
          if (
            !CLUBKONNECT_SERVICES.includes(
              service,
            )
          ) {
            return jsonResponse(
              {
                success:
                  false,
                error:
                  "ClubKonnect does not support this service.",
              },
              400,
            );
          }

          return jsonResponse(
            {
              success:
                true,
              service,
              validated:
                true,
              data:
                null,
            },
          );
        }

        /*
         * ------------------------------------------------------
         * FLUTTERWAVE VALIDATION
         * ------------------------------------------------------
         */

        if (
          !itemCode
        ) {
          return jsonResponse(
            {
              success:
                false,
              error:
                "A valid bill package is required.",
            },
            400,
          );
        }

        const response =
          await validateBillCustomer(
            itemCode,
            customer,
          );

        if (
          !response.ok ||
          response.body?.status !==
            "success"
        ) {
          console.error(
            "Flutterwave customer validation failed:",
            response.body,
          );

          return jsonResponse(
            {
              success:
                false,
              error:
                "Unable to validate the customer account.",
            },
            400,
          );
        }

        return jsonResponse(
          {
            success:
              true,
            service,
            validated:
              true,
            data:
              response.body
                ?.data ??
              null,
          },
        );
      }

      /*
       * ========================================================
       * ACTION: STATUS
       * ========================================================
       */

      if (
        action ===
        "status"
      ) {
        const reference =
          cleanString(
            body?.reference ??
              body?.transaction_reference ??
              body?.details
                ?.reference,
          );

        if (
          !reference
        ) {
          return jsonResponse(
            {
              success:
                false,
              error:
                "Transaction reference is required.",
            },
            400,
          );
        }

        const txn =
          await getLocalTransaction(
            admin,
            user.id,
            reference,
          );

        if (!txn) {
          return jsonResponse(
            {
              success:
                false,
              error:
                "Transaction not found.",
            },
            404,
          );
        }

        const metadata =
          txn.metadata &&
          typeof txn.metadata ===
            "object"
            ? txn.metadata
            : {};

        const provider =
          cleanString(
            txn.provider ??
              metadata?.provider_id ??
              "flutterwave",
          ).toLowerCase();

        /*
         * ------------------------------------------------------
         * CLUBKONNECT STATUS
         * ------------------------------------------------------
         */

        if (
          provider ===
          "clubkonnect"
        ) {
          const requestId =
            cleanString(
              metadata?.clubkonnect_request_id ??
                metadata?.request_id,
            );

          const orderId =
            cleanString(
              metadata?.clubkonnect_order_id ??
                txn.provider_reference ??
                "",
            );

          let response;

          try {
            if (
              orderId
            ) {
              response =
                await clubKonnectQuery(
                  orderId,
                );
            } else if (
              requestId
            ) {
              response =
                await clubKonnectQueryByRequestId(
                  requestId,
                );
            } else {
              return jsonResponse(
                {
                  success:
                    false,
                  error:
                    "Transaction status cannot be verified yet.",
                },
                409,
              );
            }
          } catch (
            error
          ) {
            console.error(
              "ClubKonnect status request failed:",
              error,
            );

            await updateTransaction(
              admin,
              user.id,
              reference,
              {
                status:
                  "pending",

                metadata: {
                  ...metadata,

                  provider:
                    "clubkonnect",

                  provider_id:
                    "clubkonnect",

                  reconciliation_required:
                    true,

                  last_status_check_failed:
                    true,

                  last_status_check_at:
                    new Date().toISOString(),
                },
              },
            );

            return jsonResponse(
              {
                success:
                  true,
                status:
                  "pending",
                reference,
                message:
                  "Your payment is still being verified.",
              },
            );
          }

          const classified =
            classifyClubKonnectResponse(
              response.body,
              response.ok,
            );

          const responseOrderId =
            clubKonnectOrderId(
              response.body,
            );

          const providerReference =
            responseOrderId ||
            clubKonnectReference(
              response.body,
            ) ||
            txn.provider_reference ||
            null;

          /*
           * SUCCESS
           */

          if (
            classified.state ===
            "successful"
          ) {
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
                  providerReference,

                completed_at:
                  new Date().toISOString(),

                metadata: {
                  ...metadata,

                  provider_id:
                    "clubkonnect",

                  clubkonnect_statuscode:
                    classified.statusCode,

                  clubkonnect_status:
                    classified.statusText,

                  clubkonnect_order_id:
                    responseOrderId ??
                    metadata?.clubkonnect_order_id ??
                    null,

                  clubkonnect_response:
                    response.body,

                  reconciliation_required:
                    false,

                  reconciled_at:
                    new Date().toISOString(),
                },
              },
            );

            return jsonResponse(
              {
                success:
                  true,
                status:
                  "successful",
                reference,
                message:
                  "Payment completed successfully.",
              },
            );
          }

          /*
           * DEFINITIVE FAILURE
           */

          if (
            classified.state ===
              "failed" &&
            classified.definitiveFailure
          ) {
            const refund =
              await refundBillTransaction(
                admin,
                user.id,
                reference,
                normalizeAmount(
                  txn.amount,
                ),
                "clubkonnect",
                "ClubKonnect payment failed.",
                {
                  clubkonnect_statuscode:
                    classified.statusCode,

                  clubkonnect_status:
                    classified.statusText,

                  clubkonnect_response:
                    response.body,

                  refund_trigger:
                    "status_reconciliation",
                },
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
                  providerReference,

                metadata: {
                  ...metadata,

                  provider_id:
                    "clubkonnect",

                  clubkonnect_statuscode:
                    classified.statusCode,

                  clubkonnect_status:
                    classified.statusText,

                  clubkonnect_response:
                    response.body,

                  refunded:
                    refund.success,

                  refund_pending:
                    !refund.success,

                  refund_error:
                    refund.error?.message ??
                    null,
                },
              },
            );

            if (
              !refund.success
            ) {
              return jsonResponse(
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

            return jsonResponse(
              {
                success:
                  false,
                status:
                  "failed",
                reference,
                refunded:
                  true,
                message:
                  "Payment failed. Your wallet has been refunded.",
              },
            );
          }

          /*
           * PENDING / AMBIGUOUS
           */

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
                providerReference,

              metadata: {
                ...metadata,

                provider_id:
                  "clubkonnect",

                clubkonnect_statuscode:
                  classified.statusCode,

                clubkonnect_status:
                  classified.statusText,

                clubkonnect_order_id:
                  responseOrderId ??
                  metadata?.clubkonnect_order_id ??
                  null,

                clubkonnect_response:
                  response.body,

                reconciliation_required:
                  true,

                last_reconciled_at:
                  new Date().toISOString(),
              },
            },
          );

          return jsonResponse(
            {
              success:
                true,
              status:
                "pending",
              reference,
              message:
                "Your payment is still being verified.",
            },
          );
        }

        /*
         * ------------------------------------------------------
         * FLUTTERWAVE STATUS
         * ------------------------------------------------------
         */

        const providerReference =
          cleanString(
            txn.provider_reference ??
              reference,
          );

        let response;

        try {
          response =
            await getFlutterwaveBillStatus(
              providerReference,
            );
        } catch (
          error
        ) {
          console.error(
            "Flutterwave bill status request failed:",
            error,
          );

          await updateTransaction(
            admin,
            user.id,
            reference,
            {
              status:
                "pending",

              metadata: {
                ...metadata,

                reconciliation_required:
                  true,

                status_check_failed:
                  true,

                status_check_at:
                  new Date().toISOString(),
              },
            },
          );

          return jsonResponse(
            {
              success:
                true,
              status:
                "pending",
              reference,
              message:
                "Your payment is still being verified.",
            },
          );
        }

        const providerStatus =
          normalizeStatus(
            getNested(
              response.body,
              [
                [
                  "data",
                  "status",
                ],
                [
                  "status",
                ],
              ],
            ),
          );

        /*
         * Flutterwave SUCCESS
         */

        if (
          response.ok &&
          (
            providerStatus ===
              "successful" ||
            providerStatus ===
              "success" ||
            providerStatus ===
              "completed"
          )
        ) {
          await updateTransaction(
            admin,
            user.id,
            reference,
            {
              status:
                "successful",

              provider:
                "flutterwave",

              provider_reference:
                providerReference,

              completed_at:
                new Date().toISOString(),

              metadata: {
                ...metadata,

                flutterwave_status:
                  providerStatus,

                flutterwave_response:
                  response.body,

                reconciliation_required:
                  false,

                reconciled_at:
                  new Date().toISOString(),
              },
            },
          );

          return jsonResponse(
            {
              success:
                true,
              status:
                "successful",
              reference,
              message:
                "Payment completed successfully.",
            },
          );
        }

        /*
         * Flutterwave FAILURE
         */

        if (
          response.ok &&
          (
            providerStatus ===
              "failed" ||
            providerStatus ===
              "cancelled" ||
            providerStatus ===
              "reversed" ||
            providerStatus ===
              "declined"
          )
        ) {
          const refund =
            await refundBillTransaction(
              admin,
              user.id,
              reference,
              normalizeAmount(
                txn.amount,
              ),
              "flutterwave",
              "Flutterwave bill payment failed.",
              {
                flutterwave_status:
                  providerStatus,

                flutterwave_response:
                  response.body,

                refund_trigger:
                  "status_reconciliation",
              },
            );

          await updateTransaction(
            admin,
            user.id,
            reference,
            {
              status:
                "failed",

              provider:
                "flutterwave",

              provider_reference:
                providerReference,

              metadata: {
                ...metadata,

                flutterwave_status:
                  providerStatus,

                flutterwave_response:
                  response.body,

                refunded:
                  refund.success,

                refund_pending:
                  !refund.success,

                refund_error:
                  refund.error?.message ??
                  null,
              },
            },
          );

          if (
            !refund.success
          ) {
            return jsonResponse(
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

          return jsonResponse(
            {
              success:
                false,
              status:
                "failed",
              reference,
              refunded:
                true,
              message:
                "Payment failed. Your wallet has been refunded.",
            },
          );
        }

        /*
         * Flutterwave PENDING / UNKNOWN
         */

        await updateTransaction(
          admin,
          user.id,
          reference,
          {
            status:
              "pending",

            metadata: {
              ...metadata,

              flutterwave_status:
                providerStatus,

              flutterwave_response:
                response.body,

              reconciliation_required:
                true,

              reconciled_at:
                new Date().toISOString(),
            },
          },
        );

        return jsonResponse(
          {
            success:
              true,
            status:
              "pending",
            reference,
            message:
              "Your payment is still being verified.",
          },
        );
      }

      /*
       * ========================================================
       * ACTION: PAY / SERVICE
       * ========================================================
       */

      if (
        action ===
          "pay" ||
        action ===
          "service"
      ) {
        const details =
          body?.details ??
          {};

        const service =
          normalizeService(
            body?.service ??
              details?.service,
          );

        if (
          !service
        ) {
          return jsonResponse(
            {
              success:
                false,
              error:
                "Please select a valid service.",
            },
            400,
          );
        }

        let provider = extractProviderId(body, details);

        // Provider routing is server-controlled. Public biller/item codes are opaque route tokens.
        const publicBillerCode = extractBillerCode(body, details);
        const publicItemCode = extractItemCode(body, details);
        const billerRoute = await decodeRouteToken<{ version: number; service: ServiceType; candidates: ProviderCandidate[] }>(publicBillerCode);
        const itemRoute = await decodeRouteToken<{ version: number; provider_id: ProviderId; biller_code: string; item_code: string }>(publicItemCode);

        if (itemRoute?.provider_id && itemRoute.biller_code && itemRoute.item_code) {
          provider = itemRoute.provider_id;
        } else if (billerRoute?.candidates?.length) {
          const selected = chooseCheapestCandidate(billerRoute.candidates, service);
          if (selected) provider = selected.provider_id;
        } else {
          return jsonResponse({ success: false, error: "The selected service is no longer available." }, 400);
        }

        const billerCode = itemRoute?.biller_code ??
          (billerRoute?.candidates?.find((candidate) => candidate.provider_id === provider)?.biller_code ??
            publicBillerCode);

        const itemCode = itemRoute?.item_code ?? publicItemCode;

        const country =
          cleanString(
            firstNonEmpty(
              body?.country,
              details?.country,
              "NG",
            ),
          ).toUpperCase();

        if (
          country !==
          "NG"
        ) {
          return jsonResponse(
            {
              success:
                false,
              error:
                "Bill payments currently support Nigeria only.",
            },
            400,
          );
        }

        let customer =
          extractCustomer(
            body,
            details,
          );

        if (
          service ===
            "airtime" ||
          service ===
            "data"
        ) {
          customer =
            customer.replace(
              /\s+/g,
              "",
            );
        }

        if (
          !customer
        ) {
          return jsonResponse(
            {
              success:
                false,
              error:
                "Customer information is required.",
            },
            400,
          );
        }

        if (
          service ===
            "airtime" ||
          service ===
            "data"
        ) {
          if (
            !billerCode
          ) {
            return jsonResponse(
              {
                success:
                  false,
                error:
                  "Please select a network provider.",
              },
              400,
            );
          }

          if (
            !/^(?:\+?234|0)[0-9]{10}$/.test(
              customer,
            )
          ) {
            return jsonResponse(
              {
                success:
                  false,
                error:
                  "Please provide a valid Nigerian phone number.",
              },
              400,
            );
          }
        }

        if (
          service ===
          "electricity"
        ) {
          if (
            !billerCode
          ) {
            return jsonResponse(
              {
                success:
                  false,
                error:
                  "Please select an electricity provider.",
              },
              400,
            );
          }

          if (
            customer.length <
            5
          ) {
            return jsonResponse(
              {
                success:
                  false,
                error:
                  "Please provide a valid meter number.",
              },
              400,
            );
          }
        }

        if (
          service ===
          "cable"
        ) {
          if (
            !billerCode
          ) {
            return jsonResponse(
              {
                success:
                  false,
                error:
                  "Please select a cable provider.",
              },
              400,
            );
          }

          if (
            customer.length <
            5
          ) {
            return jsonResponse(
              {
                success:
                  false,
                error:
                  "Please provide a valid smartcard or decoder number.",
              },
              400,
            );
          }
        }

        if (
          service ===
          "internet"
        ) {
          if (
            customer.length <
            3
          ) {
            return jsonResponse(
              {
                success:
                  false,
                error:
                  "Please provide a valid internet account number.",
              },
              400,
            );
          }
        }

        /*
         * ======================================================
         * CLUBKONNECT PAYMENT
         * ======================================================
         */

        if (
          provider ===
          "clubkonnect"
        ) {
          if (
            !CLUBKONNECT_SERVICES.includes(
              service,
            )
          ) {
            return jsonResponse(
              {
                success:
                  false,
                error:
                  "ClubKonnect does not support this service yet.",
              },
              400,
            );
          }

          if (
            !billerCode
          ) {
            return jsonResponse(
              {
                success:
                  false,
                error:
                  "Please select a valid ClubKonnect provider.",
              },
              400,
            );
          }

          /*
           * Internet is explicitly not enabled
           * for ClubKonnect in Phase 1.
           */

          if (
            service ===
            "internet"
          ) {
            return jsonResponse(
              {
                success:
                  false,
                error:
                  "ClubKonnect Internet service is not enabled yet.",
              },
              400,
            );
          }

          /*
           * Provider amount:
           *
           * For Data and Cable, itemCode identifies
           * the provider product.
           *
           * For Airtime/Electricity, amount comes
           * from the request but the backend remains
           * responsible for calculating selling price.
           */

          let providerAmount =
            0;

          let selectedCatalogItem:
            any = null;

          /*
           * ----------------------------------------------------
           * CLUBKONNECT DATA
           * ----------------------------------------------------
           */

          if (
            service ===
            "data"
          ) {
            if (
              !itemCode
            ) {
              return jsonResponse(
                {
                  success:
                    false,
                  error:
                    "Please select a valid ClubKonnect data plan.",
                },
                400,
              );
            }

            /*
             * Fetch the authoritative ClubKonnect
             * plan catalog.
             *
             * This prevents the client from changing
             * the provider price.
             */

            const plansResponse =
              await clubKonnectDataPlans();

            if (
              !plansResponse.ok
            ) {
              console.error(
                "ClubKonnect data catalog failed:",
                plansResponse.body,
              );

              return jsonResponse(
                {
                  success:
                    false,
                  error:
                    "Unable to verify the selected data plan.",
                },
                502,
              );
            }

            const plans =
              normalizeClubKonnectDataPlans(
                plansResponse.body,
                billerCode,
              );

            selectedCatalogItem =
              plans.find(
                (item) =>
                  String(
                    item?.item_code ??
                      "",
                  ) ===
                  itemCode,
              );

            if (
              !selectedCatalogItem
            ) {
              return jsonResponse(
                {
                  success:
                    false,
                  error:
                    "The selected data plan is no longer available.",
                },
                400,
              );
            }

            providerAmount =
              normalizeAmount(
                selectedCatalogItem.provider_amount,
              );
          }

          /*
           * ----------------------------------------------------
           * CLUBKONNECT CABLE
           * ----------------------------------------------------
           */

          if (
            service ===
            "cable"
          ) {
            if (
              !itemCode
            ) {
              return jsonResponse(
                {
                  success:
                    false,
                  error:
                    "Please select a valid cable package.",
                },
                400,
              );
            }

            const packagesResponse =
              await clubKonnectCablePackages();

            if (
              !packagesResponse.ok
            ) {
              console.error(
                "ClubKonnect cable catalog failed:",
                packagesResponse.body,
              );

              return jsonResponse(
                {
                  success:
                    false,
                  error:
                    "Unable to verify the selected cable package.",
                },
                502,
              );
            }

            const packages =
              normalizeClubKonnectCablePackages(
                packagesResponse.body,
                billerCode,
              );

            selectedCatalogItem =
              packages.find(
                (item) =>
                  String(
                    item?.item_code ??
                      "",
                  ) ===
                  itemCode,
              );

            if (
              !selectedCatalogItem
            ) {
              return jsonResponse(
                {
                  success:
                    false,
                  error:
                    "The selected cable package is no longer available.",
                },
                400,
              );
            }

            providerAmount =
              normalizeAmount(
                selectedCatalogItem.provider_amount,
              );
          }

          /*
           * ----------------------------------------------------
           * CLUBKONNECT AIRTIME
           * ----------------------------------------------------
           */

          if (
            service ===
            "airtime"
          ) {
            providerAmount =
              extractAmount(
                body,
                details,
              );

            if (
              !Number.isFinite(
                providerAmount,
              ) ||
              providerAmount <
                50 ||
              providerAmount >
                200000
            ) {
              return jsonResponse(
                {
                  success:
                    false,
                  error:
                    "Airtime amount must be between ₦50 and ₦200,000.",
                },
                400,
              );
            }
          }

          /*
           * ----------------------------------------------------
           * CLUBKONNECT ELECTRICITY
           * ----------------------------------------------------
           */

          if (
            service ===
            "electricity"
          ) {
            providerAmount =
              extractAmount(
                body,
                details,
              );

            if (
              !Number.isFinite(
                providerAmount,
              ) ||
              providerAmount <=
                0
            ) {
              return jsonResponse(
                {
                  success:
                    false,
                  error:
                    "Please enter a valid electricity amount.",
                },
                400,
              );
            }
          }

          if (
            providerAmount <=
            0
          ) {
            return jsonResponse(
              {
                success:
                  false,
                error:
                  "Unable to determine the provider price.",
              },
              400,
            );
          }

          /*
           * ====================================================
           * CLUBKONNECT 15% MARKUP
           * ====================================================
           */

          const pricing =
            calculateClubKonnectPrice(
              providerAmount,
              service,
            );

          const sellingAmount =
            pricing.sellingAmount;

          const markupRate =
            pricing.markupRate;

          const markupAmount =
            pricing.markupAmount;

          /*
           * ====================================================
           * WALLET DEBIT
           * ====================================================
           */

          const reference =
            `BILL_${crypto.randomUUID()}`;

          const requestId =
            reference;

          const callbackUrl =
            cleanString(
              Deno.env.get(
                "CLUBKONNECT_CALLBACK_URL",
              ),
            );

          const baseMetadata = {
            service,

            category:
              SERVICE_CATEGORY_MAP[
                service
              ],

            biller_code:
              billerCode,

            item_code:
              itemCode,

            customer,

            country,

            provider:
              "clubkonnect",

            provider_id:
              "clubkonnect",

            provider_amount:
              providerAmount,

            selling_amount:
              sellingAmount,

            markup_rate:
              markupRate,

            markup_amount:
              markupAmount,

            markup_percentage:
              markupRate *
              100,

            clubkonnect_request_id:
              requestId,

            request_id:
              requestId,

            plan_type:
              selectedCatalogItem
                ?.plan_type ??
              null,

            is_hot_deal:
              selectedCatalogItem
                ?.is_hot_deal ??
              false,

            selected_item:
              selectedCatalogItem,

            status:
              "pending",

            reconciliation_required:
              true,
          };

          console.log(
            "ClubKonnect bill payment pricing:",
            JSON.stringify({
              service,
              provider_amount:
                providerAmount,
              markup_rate:
                markupRate,
              markup_amount:
                markupAmount,
              selling_amount:
                sellingAmount,
            }),
          );

          const {
            data:
              debitResult,
            error:
              debitError,
          } =
            await admin.rpc(
              "debit_wallet",
              {
                _user_id:
                  user.id,

                _amount:
                  sellingAmount,

                _description:
                  `Bill payment (${service})`,

                _idempotency_key:
                  reference,

                _reference:
                  reference,

                _category:
                  "bill_payment",

                _metadata:
                  baseMetadata,
              },
            );

          if (
            debitError
          ) {
            console.error(
              "ClubKonnect wallet debit failed:",
              debitError,
            );

            return jsonResponse(
              {
                success:
                  false,
                error:
                  "Unable to process the payment from your wallet.",
              },
              400,
            );
          }

          const transactionId =
            debitResult?.id ??
            null;

          /*
           * ====================================================
           * PROVIDER PURCHASE
           * ====================================================
           */

          let providerResponse:
            any = null;

          try {
            if (
              service ===
              "airtime"
            ) {
              providerResponse =
                await clubKonnectAirtime(
                  {
                    network:
                      billerCode,

                    amount:
                      providerAmount,

                    phone:
                      customer,

                    requestId,

                    callbackUrl:
                      callbackUrl ||
                      undefined,
                  },
                );
            }

            if (
              service ===
              "data"
            ) {
              providerResponse =
                await clubKonnectData(
                  {
                    network:
                      billerCode,

                    dataPlan:
                      itemCode,

                    phone:
                      customer,

                    requestId,

                    callbackUrl:
                      callbackUrl ||
                      undefined,
                  },
                );
            }

            if (
              service ===
              "cable"
            ) {
              const phone =
                cleanString(
                  firstNonEmpty(
                    details?.phone,
                    details?.phoneNumber,
                    customer,
                  ),
                );

              providerResponse =
                await clubKonnectCable(
                  {
                    cableTv:
                      billerCode,

                    packageCode:
                      itemCode,

                    smartCard:
                      customer,

                    phone,

                    requestId,

                    callbackUrl:
                      callbackUrl ||
                      undefined,
                  },
                );
            }

            if (
              service ===
              "electricity"
            ) {
              const meterType =
                cleanString(
                  firstNonEmpty(
                    details?.meter_type,
                    details?.meterType,
                    "prepaid",
                  ),
                );

              const phone =
                cleanString(
                  firstNonEmpty(
                    details?.phone,
                    details?.phoneNumber,
                    customer,
                  ),
                );

              providerResponse =
                await clubKonnectElectricity(
                  {
                    company:
                      billerCode,

                    meterType,

                    meterNumber:
                      customer,

                    amount:
                      providerAmount,

                    phone,

                    requestId,

                    callbackUrl:
                      callbackUrl ||
                      undefined,
                  },
                );
            }
          } catch (
            providerError
          ) {
            /*
             * IMPORTANT:
             *
             * A network error does NOT automatically prove
             * ClubKonnect did not receive the request.
             *
             * Because the request may have reached the provider,
             * we keep the transaction pending and require
             * reconciliation.
             */

            console.error(
              "ClubKonnect purchase request failed:",
              providerError,
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

                metadata: {
                  ...baseMetadata,

                  provider_request_failed:
                    true,

                  provider_request_error:
                    providerError instanceof
                    Error
                      ? providerError.message
                      : String(
                          providerError,
                        ),

                  reconciliation_required:
                    true,

                  pending_reason:
                    "provider_network_or_request_error",

                  pending_since:
                    new Date().toISOString(),
                },
              },
            );

            return jsonResponse(
              {
                success:
                  true,
                status:
                  "pending",
                reference,
                transaction_id:
                  transactionId,
                message:
                  "Your payment is being verified. Please wait while we confirm the provider result.",
              },
            );
          }

          console.log(
            "ClubKonnect purchase response:",
            JSON.stringify({
              http_status:
                providerResponse?.http_status,
              ok:
                providerResponse?.ok,
              body:
                providerResponse?.body,
            }),
          );

          const providerBody =
            providerResponse?.body ??
            null;

          const classified =
            classifyClubKonnectResponse(
              providerBody,
              providerResponse?.ok ===
                true,
            );

          const orderId =
            clubKonnectOrderId(
              providerBody,
            );

          const providerReference =
            orderId ||
            clubKonnectReference(
              providerBody,
            ) ||
            null;

          /*
           * ====================================================
           * SUCCESS
           * ====================================================
           */

          if (
            classified.state ===
            "successful"
          ) {
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
                  providerReference,

                completed_at:
                  new Date().toISOString(),

                metadata: {
                  ...baseMetadata,

                  status:
                    "successful",

                  clubkonnect_statuscode:
                    classified.statusCode,

                  clubkonnect_status:
                    classified.statusText,

                  clubkonnect_order_id:
                    orderId,

                  clubkonnect_reference:
                    providerReference,

                  clubkonnect_response:
                    providerBody,

                  reconciliation_required:
                    false,

                  reconciled_at:
                    new Date().toISOString(),
                },
              },
            );

            return jsonResponse(
              {
                success:
                  true,
                status:
                  "successful",
                reference,
                transaction_id:
                  transactionId,
                message:
                  "Payment completed successfully.",
              },
            );
          }

          /*
           * ====================================================
           * DEFINITIVE FAILURE
           * ====================================================
           */

          if (
            classified.state ===
              "failed" &&
            classified.definitiveFailure
          ) {
            console.error(
              "ClubKonnect definitive payment failure:",
              JSON.stringify({
                statusCode:
                  classified.statusCode,
                statusText:
                  classified.statusText,
                response:
                  providerBody,
              }),
            );

            const refund =
              await refundBillTransaction(
                admin,
                user.id,
                reference,
                sellingAmount,
                "clubkonnect",
                "ClubKonnect payment failed.",
                {
                  ...baseMetadata,

                  clubkonnect_statuscode:
                    classified.statusCode,

                  clubkonnect_status:
                    classified.statusText,

                  clubkonnect_response:
                    providerBody,

                  refunded:
                    true,
                },
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
                  providerReference,

                metadata: {
                  ...baseMetadata,

                  status:
                    "failed",

                  clubkonnect_statuscode:
                    classified.statusCode,

                  clubkonnect_status:
                    classified.statusText,

                  clubkonnect_order_id:
                    orderId,

                  clubkonnect_response:
                    providerBody,

                  refunded:
                    refund.success,

                  refund_pending:
                    !refund.success,

                  refund_error:
                    refund.error?.message ??
                    null,

                  reconciliation_required:
                    false,
                },
              },
            );

            if (
              !refund.success
            ) {
              return jsonResponse(
                {
                  success:
                    false,
                  status:
                    "failed",
                  reference,
                  transaction_id:
                    transactionId,
                  error:
                    "The payment failed, but the automatic refund requires retry.",
                },
                503,
              );
            }

            return jsonResponse(
              {
                success:
                  false,
                status:
                  "failed",
                reference,
                transaction_id:
                  transactionId,
                refunded:
                  true,
                message:
                  "Payment failed. Your wallet has been refunded.",
              },
            );
          }

          /*
           * ====================================================
           * PENDING / AMBIGUOUS
           * ====================================================
           *
           * Includes:
           *
           * 100 ORDER_RECEIVED
           * 300 ORDER_PROCESSED
           * 201 ORDER_COMPLETED/network retry state
           * 199 unspecified error
           * 299 unspecified error
           * 399 unspecified error
           * unknown responses
           */

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
                providerReference,

              metadata: {
                ...baseMetadata,

                status:
                  "pending",

                clubkonnect_statuscode:
                  classified.statusCode,

                clubkonnect_status:
                  classified.statusText,

                clubkonnect_order_id:
                  orderId,

                clubkonnect_reference:
                  providerReference,

                clubkonnect_response:
                  providerBody,

                reconciliation_required:
                  true,

                pending_since:
                  new Date().toISOString(),
              },
            },
          );

          return jsonResponse(
            {
              success:
                true,
              status:
                "pending",
              reference,
              transaction_id:
                transactionId,
              message:
                "Your payment has been initiated and is being verified.",
            },
          );
        }

        /*
         * ======================================================
         * FLUTTERWAVE PAYMENT
         * ======================================================
         */

        if (
          !billerCode
        ) {
          return jsonResponse(
            {
              success:
                false,
              error:
                "Please select a valid bill provider.",
            },
            400,
          );
        }

        if (
          !itemCode
        ) {
          return jsonResponse(
            {
              success:
                false,
              error:
                "Please select a valid bill package.",
            },
            400,
          );
        }

        /*
         * ======================================================
         * FLUTTERWAVE CATALOG VERIFICATION
         * ======================================================
         */

        let selectedItem:
          any = null;

        let providerAmount =
          0;

        const catalog =
          await validateFlutterwaveSelectedItem(
            billerCode,
            itemCode,
          );

        selectedItem =
          catalog.selected;

        providerAmount =
          normalizeAmount(
            firstNonEmpty(
              selectedItem?.amount,
              selectedItem?.price,
              selectedItem?.selling_price,
            ),
          );

        if (
          providerAmount <=
          0
        ) {
          return jsonResponse(
            {
              success:
                false,
              error:
                "Unable to determine the bill package price.",
            },
            400,
          );
        }

        /*
         * Existing Flutterwave pricing:
         *
         * Data = provider amount + ₦50
         * Other services = provider amount
         */

        const sellingAmount =
          service ===
          "data"
            ? roundMoney(
                providerAmount +
                  FLUTTERWAVE_DATA_MARKUP,
              )
            : providerAmount;

        /*
         * ======================================================
         * SERVICE-SPECIFIC VALIDATION
         * ======================================================
         */

        let validationData:
          any = null;

        const shouldValidateCustomer =
          service ===
            "electricity" ||
          service ===
            "cable" ||
          service ===
            "internet";

        if (
          shouldValidateCustomer
        ) {
          try {
            const validation =
              await validateBillCustomer(
                itemCode,
                customer,
              );

            if (
              !validation.ok ||
              validation.body?.status !==
                "success"
            ) {
              console.error(
                "Flutterwave bill customer validation failed:",
                validation.body,
              );

              return jsonResponse(
                {
                  success:
                    false,
                  error:
                    "Unable to validate the customer account.",
                },
                400,
              );
            }

            validationData =
              validation.body
                ?.data ??
              null;
          } catch (
            error
          ) {
            console.error(
              "Flutterwave customer validation error:",
              error,
            );

            return jsonResponse(
              {
                success:
                  false,
                error:
                  "Unable to validate the customer account.",
              },
              502,
            );
          }
        }

        /*
         * ======================================================
         * TRANSACTION REFERENCE
         * ======================================================
         */

        const reference =
          `BILL_${crypto.randomUUID()}`;

        const transactionMetadata = {
          service,

          category:
            SERVICE_CATEGORY_MAP[
              service
            ],

          biller_code:
            billerCode,

          item_code:
            itemCode,

          customer,

          country,

          provider:
            "flutterwave",

          provider_id:
            "flutterwave",

          provider_amount:
            providerAmount,

          selling_amount:
            sellingAmount,

          data_markup:
            service ===
            "data"
              ? FLUTTERWAVE_DATA_MARKUP
              : 0,

          markup_rate:
            service ===
            "data"
              ? FLUTTERWAVE_DATA_MARKUP /
                providerAmount
              : 0,

          markup_amount:
            service ===
            "data"
              ? FLUTTERWAVE_DATA_MARKUP
              : 0,

          selected_item:
            selectedItem,

          validation:
            validationData,

          reconciliation_required:
            true,
        };

        /*
         * ======================================================
         * DEBIT WALLET
         * ======================================================
         */

        const {
          data:
            debitResult,
          error:
            debitError,
        } =
          await admin.rpc(
            "debit_wallet",
            {
              _user_id:
                user.id,

              _amount:
                sellingAmount,

              _description:
                `Bill payment (${service})`,

              _idempotency_key:
                reference,

              _reference:
                reference,

              _category:
                "bill_payment",

              _metadata:
                transactionMetadata,
            },
          );

        if (
          debitError
        ) {
          console.error(
            "Flutterwave bill wallet debit failed:",
            debitError,
          );

          return jsonResponse(
            {
              success:
                false,
              error:
                "Unable to process the payment from your wallet.",
            },
            400,
          );
        }

        const transactionId =
          debitResult?.id ??
          null;

        /*
         * ======================================================
         * FLUTTERWAVE PAYMENT REQUEST
         * ======================================================
         */

        let flutterwaveResponse:
          any = null;

        try {
          flutterwaveResponse =
            await flw(
              `/billers/${encodeURIComponent(
                billerCode,
              )}/items/${encodeURIComponent(
                itemCode,
              )}/payment`,
              {
                method:
                  "POST",

                body:
                  JSON.stringify({
                    country:
                      "NG",

                    customer_id:
                      customer,

                    amount:
                      providerAmount,

                    type:
                      selectedItem?.type ??
                      service,

                    reference,

                    biller_code:
                      billerCode,

                    item_code:
                      itemCode,

                    phone_number:
                      details?.phone ??
                      details?.phoneNumber ??
                      customer,
                  }),
              },
            );
        } catch (
          error
        ) {
          /*
           * IMPORTANT:
           *
           * Do NOT refund immediately.
           *
           * The request may have reached Flutterwave.
           */

          console.error(
            "Flutterwave bill request failed:",
            error,
          );

          await updateTransaction(
            admin,
            user.id,
            reference,
            {
              status:
                "pending",

              provider:
                "flutterwave",

              metadata: {
                ...transactionMetadata,

                provider_request_failed:
                  true,

                provider_request_error:
                  error instanceof
                  Error
                    ? error.message
                    : String(
                        error,
                      ),

                reconciliation_required:
                  true,
              },
            },
          );

          return jsonResponse(
            {
              success:
                true,
              status:
                "pending",
              reference,
              transaction_id:
                transactionId,
              message:
                "Your payment is being verified.",
            },
          );
        }

        const flutterwaveData =
          flutterwaveResponse?.body ??
          null;

        console.log(
          "Flutterwave bill payment response:",
          JSON.stringify({
            http_status:
              flutterwaveResponse?.status,
            ok:
              flutterwaveResponse?.ok,
            body:
              flutterwaveData,
          }),
        );

        const flutterwaveStatus =
          normalizeStatus(
            firstNonEmpty(
              flutterwaveData?.data
                ?.status,
              flutterwaveData?.status,
            ),
          );

        const providerReference =
          extractProviderReference(
            {
              provider_response:
                flutterwaveData,
            },
          );

        /*
         * ======================================================
         * FLUTTERWAVE SUCCESS
         * ======================================================
         */

        if (
          flutterwaveResponse?.ok &&
          flutterwaveData?.status ===
            "success" &&
          (
            !flutterwaveData?.data?.status ||
            isSuccessfulStatus(
              flutterwaveData?.data?.status,
            )
          )
        ) {
          await updateTransaction(
            admin,
            user.id,
            reference,
            {
              status:
                "successful",

              provider:
                "flutterwave",

              provider_reference:
                providerReference,

              completed_at:
                new Date().toISOString(),

              metadata: {
                ...transactionMetadata,

                flutterwave_status:
                  flutterwaveStatus,

                flutterwave_response:
                  flutterwaveData,

                reconciliation_required:
                  false,

                reconciled_at:
                  new Date().toISOString(),
              },
            },
          );

          return jsonResponse(
            {
              success:
                true,
              status:
                "successful",
              reference,
              transaction_id:
                transactionId,
              message:
                "Payment completed successfully.",
            },
          );
        }

        /*
         * ======================================================
         * FLUTTERWAVE DEFINITIVE FAILURE
         * ======================================================
         */

        const flutterwaveFailure =
          !flutterwaveResponse?.ok ||
          isFailedStatus(
            flutterwaveStatus,
          );

        if (
          flutterwaveFailure
        ) {
          const providerMessage =
            getProviderMessage(
              {
                provider_response:
                  flutterwaveData,
              },
            );

          console.error(
            "Flutterwave bill payment failed:",
            JSON.stringify({
              status:
                flutterwaveStatus,
              message:
                providerMessage,
              response:
                flutterwaveData,
            }),
          );

          const refund =
            await refundBillTransaction(
              admin,
              user.id,
              reference,
              sellingAmount,
              "flutterwave",
              "Flutterwave bill payment failed.",
              {
                ...transactionMetadata,

                flutterwave_status:
                  flutterwaveStatus,

                flutterwave_response:
                  flutterwaveData,
              },
            );

          await updateTransaction(
            admin,
            user.id,
            reference,
            {
              status:
                "failed",

              provider:
                "flutterwave",

              provider_reference:
                providerReference,

              metadata: {
                ...transactionMetadata,

                flutterwave_status:
                  flutterwaveStatus,

                flutterwave_response:
                  flutterwaveData,

                refunded:
                  refund.success,

                refund_pending:
                  !refund.success,

                refund_error:
                  refund.error?.message ??
                  null,

                reconciliation_required:
                  false,
              },
            },
          );

          if (
            !refund.success
          ) {
            return jsonResponse(
              {
                success:
                  false,
                status:
                  "failed",
                reference,
                transaction_id:
                  transactionId,
                error:
                  "The payment failed, but the automatic refund requires retry.",
              },
              503,
            );
          }

          return jsonResponse(
            {
              success:
                false,
              status:
                "failed",
              reference,
              transaction_id:
                transactionId,
              refunded:
                true,
              message:
                "Payment failed. Your wallet has been refunded.",
            },
          );
        }

        /*
         * ======================================================
         * FLUTTERWAVE PENDING / UNKNOWN
         * ======================================================
         */

        await updateTransaction(
          admin,
          user.id,
          reference,
          {
            status:
              "pending",

            provider:
              "flutterwave",

            provider_reference:
              providerReference,

            metadata: {
              ...transactionMetadata,

              flutterwave_status:
                flutterwaveStatus,

              flutterwave_response:
                flutterwaveData,

              reconciliation_required:
                true,

              pending_since:
                new Date().toISOString(),
            },
          },
        );

        return jsonResponse(
          {
            success:
              true,
            status:
              "pending",
            reference,
            transaction_id:
              transactionId,
            message:
              "Your payment has been initiated and is being verified.",
          },
        );
      }

      /*
       * ========================================================
       * UNKNOWN ACTION
       * ========================================================
       */

      return jsonResponse(
        {
          success:
            false,
          error:
            "Unsupported bill payment action.",
        },
        400,
      );
    } catch (
      error
    ) {
      /*
       * ========================================================
       * INTERNAL ERROR
       * ========================================================
       *
       * Technical details are logged only.
       * They are NOT returned to the customer.
       */

      console.error(
        "FLUTTERWAVE-BILLS INTERNAL ERROR:",
        error,
      );

      return jsonResponse(
        {
          success:
            false,
          error:
            "Unable to process your bill payment right now. Please try again.",
        },
        500,
      );
    }
  },
);
