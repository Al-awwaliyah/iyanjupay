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

function isClubKonnectSME(
  item: any,
): boolean {
  const combined = [
    item?.name,
    item?.Name,
    item?.description,
    item?.Description,
    item?.plan,
    item?.Plan,
    item?.plan_name,
    item?.planName,
    item?.bundle,
    item?.Bundle,
  ]
    .map(cleanString)
    .join(" ")
    .toLowerCase();

  return combined.includes(
    "sme",
  );
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

function networkMatches(
  item: any,
  networkCode: string,
): boolean {
  const target =
    cleanString(
      networkCode,
    ).toLowerCase();

  if (!target) {
    return true;
  }

  const values = [
    item?.code,
    item?.Code,
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
  ]
    .map(cleanString)
    .filter(Boolean)
    .map(
      (value) =>
        value.toLowerCase(),
    );

  return values.includes(
    target,
  );
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
            provider:
              "flutterwave",
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
       */

      if (
        action ===
        "billers"
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

        /*
         * ------------------------------------------------------
         * CLUBKONNECT BILLERS
         * ------------------------------------------------------
         */

        if (
          provider ===
          "clubkonnect"
        ) {
          if (
            !service ||
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

          if (
            service ===
            "airtime"
          ) {
            const response =
              await clubKonnectAirtimeNetworks();

            if (
              !response.ok
            ) {
              console.error(
                "ClubKonnect airtime networks failed:",
                response.body,
              );

              return jsonResponse(
                {
                  success:
                    false,
                  error:
                    "Unable to load airtime networks.",
                },
                502,
              );
            }

            return jsonResponse(
              {
                success:
                  true,
                provider:
                  "clubkonnect",
                service,
                data:
                  normalizeClubKonnectNetworks(
                    response.body,
                  ),
              },
            );
          }

          if (
            service ===
            "data"
          ) {
            const response =
              await clubKonnectDataNetworks();

            if (
              !response.ok
            ) {
              console.error(
                "ClubKonnect data networks failed:",
                response.body,
              );

              return jsonResponse(
                {
                  success:
                    false,
                  error:
                    "Unable to load data networks.",
                },
                502,
              );
            }

            return jsonResponse(
              {
                success:
                  true,
                provider:
                  "clubkonnect",
                service,
                data:
                  normalizeClubKonnectNetworks(
                    response.body,
                  ),
              },
            );
          }

          if (
            service ===
            "cable"
          ) {
            const response =
              await clubKonnectCableTypes();

            if (
              !response.ok
            ) {
              console.error(
                "ClubKonnect cable types failed:",
                response.body,
              );

              return jsonResponse(
                {
                  success:
                    false,
                  error:
                    "Unable to load cable providers.",
                },
                502,
              );
            }

            return jsonResponse(
              {
                success:
                  true,
                provider:
                  "clubkonnect",
                service,
                data:
                  normalizeClubKonnectCableTypes(
                    response.body,
                  ),
              },
            );
          }

          /*
           * Electricity:
           *
           * The deployed ClubKonnect helper currently
           * exposes verification and purchase methods,
           * not a verified electricity-company catalog
           * endpoint.
           *
           * Therefore we do not invent one here.
           *
           * The frontend/backend can use the configured
           * provider code when supplied.
           */

          if (
            service ===
            "electricity"
          ) {
            return jsonResponse(
              {
                success:
                  true,
                provider:
                  "clubkonnect",
                service,
                data:
                  [],
                catalog_source:
                  "manual_provider_selection",
              },
            );
          }

          return jsonResponse(
            {
              success:
                true,
              provider:
                "clubkonnect",
              service,
              data:
                [],
            },
          );
        }

        /*
         * ------------------------------------------------------
         * FLUTTERWAVE BILLERS
         * ------------------------------------------------------
         */

        const category =
          cleanString(
            body?.category ??
              body?.details
                ?.category,
          );

        if (
          !category
        ) {
          return jsonResponse(
            {
              success:
                false,
              error:
                "Bill category is required.",
            },
            400,
          );
        }

        const response =
          await flw(
            `/bills/${encodeURIComponent(
              category,
            )}/billers?country=NG`,
            {
              method:
                "GET",
            },
          );

        if (
          !response.ok ||
          response.body?.status !==
            "success"
        ) {
          console.error(
            "Flutterwave billers request failed:",
            response.body,
          );

          return jsonResponse(
            {
              success:
                false,
              error:
                "Unable to load bill providers.",
            },
            502,
          );
        }

        return jsonResponse(
          {
            success:
              true,
            provider:
              "flutterwave",
            data:
              response.body
                ?.data ??
              [],
          },
        );
      }

      /*
       * ========================================================
       * ACTION: ITEMS
       * ========================================================
       */

      if (
        action ===
        "items"
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
          !billerCode
        ) {
          return jsonResponse(
            {
              success:
                false,
              error:
                "A valid bill provider is required.",
            },
            400,
          );
        }

        /*
         * ------------------------------------------------------
         * CLUBKONNECT DATA PLANS
         * ------------------------------------------------------
         */

        if (
          provider ===
            "clubkonnect" &&
          service ===
            "data"
        ) {
          const response =
            await clubKonnectDataPlans();

          if (
            !response.ok
          ) {
            console.error(
              "ClubKonnect data plans failed:",
              response.body,
            );

            return jsonResponse(
              {
                success:
                  false,
                error:
                  "Unable to load ClubKonnect data plans.",
              },
              502,
            );
          }

          const plans =
            normalizeClubKonnectDataPlans(
              response.body,
              billerCode,
            );

          return jsonResponse(
            {
              success:
                true,
              provider:
                "clubkonnect",
              service,
              biller_code:
                billerCode,
              data:
                plans,
            },
          );
        }

        /*
         * ------------------------------------------------------
         * CLUBKONNECT CABLE PACKAGES
         * ------------------------------------------------------
         */

        if (
          provider ===
            "clubkonnect" &&
          service ===
            "cable"
        ) {
          const response =
            await clubKonnectCablePackages();

          if (
            !response.ok
          ) {
            console.error(
              "ClubKonnect cable packages failed:",
              response.body,
            );

            return jsonResponse(
              {
                success:
                  false,
                error:
                  "Unable to load ClubKonnect cable packages.",
              },
              502,
            );
          }

          const packages =
            normalizeClubKonnectCablePackages(
              response.body,
              billerCode,
            );

          return jsonResponse(
            {
              success:
                true,
              provider:
                "clubkonnect",
              service,
              biller_code:
                billerCode,
              data:
                packages,
            },
          );
        }

        /*
         * ClubKonnect Airtime and Electricity
         * do not require a package catalog in
         * the same way.
         */

        if (
          provider ===
            "clubkonnect" &&
          (
            service ===
              "airtime" ||
            service ===
              "electricity"
          )
        ) {
          return jsonResponse(
            {
              success:
                true,
              provider:
                "clubkonnect",
              service,
              biller_code:
                billerCode,
              data:
                [],
            },
          );
        }

        /*
         * ClubKonnect Internet is not supported.
         */

        if (
          provider ===
            "clubkonnect"
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

        /*
         * ------------------------------------------------------
         * FLUTTERWAVE ITEMS
         * ------------------------------------------------------
         */

        const response =
          await fetchBillItems(
            billerCode,
          );

        if (
          !response.ok ||
          response.body?.status !==
            "success"
        ) {
          console.error(
            "Flutterwave bill items request failed:",
            response.body,
          );

          return jsonResponse(
            {
              success:
                false,
              error:
                "Unable to load bill packages.",
            },
            502,
          );
        }

        return jsonResponse(
          {
            success:
              true,
            provider:
              "flutterwave",
            service,
            biller_code:
              billerCode,
            data:
              response.body
                ?.data ??
              [],
          },
        );
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
              provider:
                "clubkonnect",
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
              provider:
                "clubkonnect",
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
              provider:
                "clubkonnect",
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
            provider:
              "flutterwave",
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
                provider:
                  "clubkonnect",
                provider_reference:
                  providerReference,
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
              provider:
                "clubkonnect",
              provider_reference:
                providerReference,
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
              provider:
                "flutterwave",
              provider_reference:
                providerReference,
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
            provider:
              "flutterwave",
            provider_reference:
              providerReference,
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

        const provider =
          extractProviderId(
            body,
            details,
          );

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

        const billerCode =
          extractBillerCode(
            body,
            details,
          );

        const itemCode =
          extractItemCode(
            body,
            details,
          );

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
            !details?.provider
          ) {
            return jsonResponse(
              {
                success:
                  false,
                error:
                  "Please select an internet provider.",
              },
              400,
            );
          }

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
                provider:
                  "clubkonnect",
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
                provider:
                  "clubkonnect",
                provider_reference:
                  providerReference,
                provider_amount:
                  providerAmount,
                markup_rate:
                  markupRate,
                markup_amount:
                  markupAmount,
                selling_amount:
                  sellingAmount,
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
              provider:
                "clubkonnect",
              provider_reference:
                providerReference,
              provider_amount:
                providerAmount,
              markup_rate:
                markupRate,
              markup_amount:
                markupAmount,
              selling_amount:
                sellingAmount,
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
              provider:
                "flutterwave",
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
              provider:
                "flutterwave",
              provider_reference:
                providerReference,
              provider_amount:
                providerAmount,
              selling_amount:
                sellingAmount,
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
            provider:
              "flutterwave",
            provider_reference:
              providerReference,
            provider_amount:
              providerAmount,
            selling_amount:
              sellingAmount,
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
