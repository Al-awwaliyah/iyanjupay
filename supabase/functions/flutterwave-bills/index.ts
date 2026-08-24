import {
  corsHeaders,
  json,
  adminClient,
  getUser,
  flw,
} from "../_shared/auth.ts";

/**
 * IyanjuPay — Flutterwave Bills
 *
 * DATA PLAN ARCHITECTURE
 *
 * Customer price:
 *   selling_price
 *
 * Flutterwave price:
 *   provider_amount
 *
 * IyanjuPay profit:
 *   selling_price - provider_amount
 *
 * SECURITY:
 *   - plan_id comes from frontend
 *   - Flutterwave item_code comes ONLY from server-side mapping
 *   - provider_amount comes from Flutterwave catalogue verification
 *   - wallet is debited by selling_price
 *   - Flutterwave receives provider_amount
 *
 * Supported:
 *   - Airtime
 *   - Data
 *   - Electricity
 *   - Cable
 *   - Internet
 */

type ServiceType =
  | "airtime"
  | "data"
  | "electricity"
  | "cable"
  | "internet";

const SUPPORTED_SERVICES: ServiceType[] = [
  "airtime",
  "data",
  "electricity",
  "cable",
  "internet",
];

const SERVICE_CATEGORY_MAP: Record<ServiceType, string> = {
  airtime: "AIRTIME",
  data: "MOBILEDATA",
  electricity: "UTILITYBILLS",
  cable: "CABLEBILLS",
  internet: "INTSERVICE",
};

const SUCCESS_STATUSES = new Set([
  "successful",
  "success",
  "completed",
]);

const FAILED_STATUSES = new Set([
  "failed",
  "failure",
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
]);

/* ============================================================
   DATA PLAN MAPPING
   ============================================================ */

/**
 * IMPORTANT:
 *
 * The frontend MUST NOT send item_code.
 *
 * The frontend sends only:
 *
 *   plan_id
 *
 * The server translates plan_id -> Flutterwave item_code.
 *
 * Replace the item_code values below with the actual Flutterwave
 * catalogue item codes for your selected providers.
 *
 * The selling_price is YOUR customer-facing price.
 *
 * provider_amount is NOT trusted from the frontend.
 *
 * The actual provider amount is verified against Flutterwave's
 * catalogue before payment.
 */

type DataPlan = {
  id: string;
  name: string;
  network: string;
  period: "daily" | "weekly" | "monthly";
  data: string;
  selling_price: number;
  biller_code: string;
  item_code: string;
};

/**
 * Example server-side plan catalogue.
 *
 * IMPORTANT:
 * Keep this on the server.
 *
 * The item codes below are placeholders for the actual codes
 * returned by your Flutterwave catalogue.
 */
const DATA_PLANS: Record<string, DataPlan> = {
  /**
   * MTN DAILY
   */
  mtn_daily_100mb: {
    id: "mtn_daily_100mb",
    name: "100MB",
    network: "MTN",
    period: "daily",
    data: "100MB",
    selling_price: 100,
    biller_code: "MTN",
    item_code: "REPLACE_MTN_DAILY_100MB",
  },

  mtn_daily_200mb: {
    id: "mtn_daily_200mb",
    name: "200MB",
    network: "MTN",
    period: "daily",
    data: "200MB",
    selling_price: 250,
    biller_code: "MTN",
    item_code: "REPLACE_MTN_DAILY_200MB",
  },

  /**
   * MTN WEEKLY
   */
  mtn_weekly_500mb: {
    id: "mtn_weekly_500mb",
    name: "500MB",
    network: "MTN",
    period: "weekly",
    data: "500MB",
    selling_price: 750,
    biller_code: "MTN",
    item_code: "REPLACE_MTN_WEEKLY_500MB",
  },

  mtn_weekly_1gb: {
    id: "mtn_weekly_1gb",
    name: "1GB",
    network: "MTN",
    period: "weekly",
    data: "1GB",
    selling_price: 800,
    biller_code: "MTN",
    item_code: "REPLACE_MTN_WEEKLY_1GB",
  },

  /**
   * MTN MONTHLY
   */
  mtn_monthly_1gb: {
    id: "mtn_monthly_1gb",
    name: "1GB",
    network: "MTN",
    period: "monthly",
    data: "1GB",
    selling_price: 900,
    biller_code: "MTN",
    item_code: "REPLACE_MTN_MONTHLY_1GB",
  },

  mtn_monthly_2gb: {
    id: "mtn_monthly_2gb",
    name: "2GB",
    network: "MTN",
    period: "monthly",
    data: "2GB",
    selling_price: 1700,
    biller_code: "MTN",
    item_code: "REPLACE_MTN_MONTHLY_2GB",
  },

  /**
   * AIRTEL DAILY
   */
  airtel_daily_100mb: {
    id: "airtel_daily_100mb",
    name: "100MB",
    network: "Airtel",
    period: "daily",
    data: "100MB",
    selling_price: 100,
    biller_code: "AIRTEL",
    item_code: "REPLACE_AIRTEL_DAILY_100MB",
  },

  airtel_daily_200mb: {
    id: "airtel_daily_200mb",
    name: "200MB",
    network: "Airtel",
    period: "daily",
    data: "200MB",
    selling_price: 250,
    biller_code: "AIRTEL",
    item_code: "REPLACE_AIRTEL_DAILY_200MB",
  },

  /**
   * AIRTEL WEEKLY
   */
  airtel_weekly_500mb: {
    id: "airtel_weekly_500mb",
    name: "500MB",
    network: "Airtel",
    period: "weekly",
    data: "500MB",
    selling_price: 550,
    biller_code: "AIRTEL",
    item_code: "REPLACE_AIRTEL_WEEKLY_500MB",
  },

  airtel_weekly_1gb: {
    id: "airtel_weekly_1gb",
    name: "1GB",
    network: "Airtel",
    period: "weekly",
    data: "1GB",
    selling_price: 700,
    biller_code: "AIRTEL",
    item_code: "REPLACE_AIRTEL_WEEKLY_1GB",
  },

  /**
   * AIRTEL MONTHLY
   */
  airtel_monthly_1gb: {
    id: "airtel_monthly_1gb",
    name: "1GB",
    network: "Airtel",
    period: "monthly",
    data: "1GB",
    selling_price: 900,
    biller_code: "AIRTEL",
    item_code: "REPLACE_AIRTEL_MONTHLY_1GB",
  },

  airtel_monthly_2gb: {
    id: "airtel_monthly_2gb",
    name: "2GB",
    network: "Airtel",
    period: "monthly",
    data: "2GB",
    selling_price: 1700,
    biller_code: "AIRTEL",
    item_code: "REPLACE_AIRTEL_MONTHLY_2GB",
  },

  /**
   * 9MOBILE DAILY
   */
  nine_mobile_daily_100mb: {
    id: "nine_mobile_daily_100mb",
    name: "100MB",
    network: "9mobile",
    period: "daily",
    data: "100MB",
    selling_price: 100,
    biller_code: "9MOBILE",
    item_code: "REPLACE_9MOBILE_DAILY_100MB",
  },

  /**
   * 9MOBILE WEEKLY
   */
  nine_mobile_weekly_500mb: {
    id: "nine_mobile_weekly_500mb",
    name: "500MB",
    network: "9mobile",
    period: "weekly",
    data: "500MB",
    selling_price: 350,
    biller_code: "9MOBILE",
    item_code: "REPLACE_9MOBILE_WEEKLY_500MB",
  },

  /**
   * 9MOBILE MONTHLY
   */
  nine_mobile_monthly_1gb: {
    id: "nine_mobile_monthly_1gb",
    name: "1GB",
    network: "9mobile",
    period: "monthly",
    data: "1GB",
    selling_price: 900,
    biller_code: "9MOBILE",
    item_code: "REPLACE_9MOBILE_MONTHLY_1GB",
  },

  /**
   * GLO DAILY
   */
  glo_daily_100mb: {
    id: "glo_daily_100mb",
    name: "100MB",
    network: "Glo",
    period: "daily",
    data: "100MB",
    selling_price: 100,
    biller_code: "GLO",
    item_code: "REPLACE_GLO_DAILY_100MB",
  },

  /**
   * GLO WEEKLY
   */
  glo_weekly_500mb: {
    id: "glo_weekly_500mb",
    name: "500MB",
    network: "Glo",
    period: "weekly",
    data: "500MB",
    selling_price: 350,
    biller_code: "GLO",
    item_code: "REPLACE_GLO_WEEKLY_500MB",
  },

  /**
   * GLO MONTHLY
   */
  glo_monthly_1gb: {
    id: "glo_monthly_1gb",
    name: "1GB",
    network: "Glo",
    period: "monthly",
    data: "1GB",
    selling_price: 900,
    biller_code: "GLO",
    item_code: "REPLACE_GLO_MONTHLY_1GB",
  },
};

/* ============================================================
   HELPERS
   ============================================================ */

function cleanString(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeService(
  value: unknown,
): ServiceType | null {
  const service = cleanString(value).toLowerCase();

  if (
    service === "airtime" ||
    service === "data" ||
    service === "electricity" ||
    service === "cable" ||
    service === "internet"
  ) {
    return service;
  }

  return null;
}

function normalizeStatus(value: unknown): string {
  return cleanString(value).toLowerCase();
}

function isSuccessfulStatus(value: unknown): boolean {
  return SUCCESS_STATUSES.has(
    normalizeStatus(value),
  );
}

function isFailedStatus(value: unknown): boolean {
  return FAILED_STATUSES.has(
    normalizeStatus(value),
  );
}

function normalizeAmount(
  value: unknown,
): number | null {
  const amount = Number(value);

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    return null;
  }

  return Number(
    amount.toFixed(2),
  );
}

function extractAmount(
  item: any,
): number | null {
  const candidates = [
    item?.amount,
    item?.price,
    item?.cost,
    item?.value,
  ];

  for (const candidate of candidates) {
    const amount =
      normalizeAmount(candidate);

    if (amount !== null) {
      return amount;
    }
  }

  return null;
}

function extractItemCode(
  item: any,
): string {
  return cleanString(
    item?.item_code ??
      item?.itemCode ??
      item?.product_code ??
      item?.productCode,
  );
}

function extractBillerCode(
  item: any,
): string {
  return cleanString(
    item?.biller_code ??
      item?.billerCode,
  );
}

function extractProviderReference(
  body: any,
): string | null {
  const data =
    body?.data ?? {};

  const reference =
    cleanString(
      data?.flw_ref ??
        data?.reference ??
        data?.transaction_reference ??
        data?.tx_ref ??
        data?.customer_reference ??
        body?.flw_ref ??
        body?.reference ??
        "",
    );

  return reference || null;
}

function extractProviderStatus(
  body: any,
): string {
  const data =
    body?.data ?? {};

  return (
    normalizeStatus(
      data?.status ??
        data?.transaction_status ??
        data?.bill_status ??
        body?.status,
    ) || "pending"
  );
}

function getProviderData(
  body: any,
): any {
  return body?.data ?? null;
}

function getProviderMessage(
  body: any,
): string {
  return (
    cleanString(
      body?.message ??
        body?.data?.message ??
        body?.data?.response_message ??
        body?.error ??
        body?.data?.error,
    ) ||
    "Flutterwave did not provide a response message."
  );
}

function getTransactionMetadata(
  txn: any,
): Record<string, unknown> {
  if (
    txn?.metadata &&
    typeof txn.metadata ===
      "object" &&
    !Array.isArray(
      txn.metadata,
    )
  ) {
    return {
      ...txn.metadata,
    };
  }

  return {};
}

function shouldValidateCustomer(
  service: ServiceType,
): boolean {
  return !(
    service === "airtime" ||
    service === "data"
  );
}

async function updateTransaction(
  admin: any,
  userId: string,
  reference: string,
  updates: Record<string, unknown>,
): Promise<boolean> {
  try {
    const {
      data,
      error,
    } = await admin
      .from("transactions")
      .update(updates)
      .eq("user_id", userId)
      .eq(
        "reference_number",
        reference,
      )
      .select("id");

    if (error) {
      console.error(
        "Transaction update failed:",
        error,
      );

      return false;
    }

    if (
      !data ||
      data.length === 0
    ) {
      console.warn(
        "Transaction update matched no rows:",
        {
          userId,
          reference,
        },
      );
    }

    return true;
  } catch (error) {
    console.error(
      "Transaction update exception:",
      error,
    );

    return false;
  }
}

async function getLocalTransaction(
  admin: any,
  userId: string,
  reference: string,
) {
  const {
    data,
    error,
  } = await admin
    .from("transactions")
    .select(`
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
    `)
    .eq("user_id", userId)
    .eq(
      "reference_number",
      reference,
    )
    .maybeSingle();

  return {
    data,
    error,
  };
}

async function refundBillTransaction(
  admin: any,
  userId: string,
  amount: number,
  reference: string,
  metadata: Record<string, unknown>,
) {
  const refundReference =
    `REFUND_${reference}`;

  try {
    const {
      error,
    } = await admin.rpc(
      "refund_wallet",
      {
        _user_id: userId,
        _amount: amount,
        _description:
          "Bill payment reversal",
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
          reason:
            "flutterwave_bill_failed",
        },
      },
    );

    return {
      success: !error,
      reference:
        refundReference,
      error,
    };
  } catch (error) {
    console.error(
      "Refund exception:",
      error,
    );

    return {
      success: false,
      reference:
        refundReference,
      error,
    };
  }
}

async function fetchBillItems(
  billerCode: string,
) {
  return await flw(
    `/billers/${encodeURIComponent(
      billerCode,
    )}/items`,
  );
}

async function validateBillCustomer(
  itemCode: string,
  customer: string,
) {
  return await flw(
    `/bill-items/${encodeURIComponent(
      itemCode,
    )}/validate?customer=${encodeURIComponent(
      customer,
    )}`,
  );
}

function providerDebug(
  result: any,
) {
  return {
    ok:
      Boolean(result?.ok),
    http_status:
      result?.status ?? null,
    provider_status:
      extractProviderStatus(
        result?.body ?? {},
      ),
    message:
      getProviderMessage(
        result?.body ?? {},
      ),
    body:
      result?.body ?? null,
  };
}

/* ============================================================
   SERVER-SIDE DATA PLAN RESOLUTION
   ============================================================ */

function getDataPlan(
  planId: string,
): DataPlan | null {
  return (
    DATA_PLANS[
      planId
    ] ?? null
  );
}

/* ============================================================
   DATA CATALOGUE ACTION
   ============================================================ */

function getPublicDataPlans() {
  return Object.values(
    DATA_PLANS,
  ).map(
    (plan) => ({
      id: plan.id,
      name: plan.name,
      network: plan.network,
      period: plan.period,
      data: plan.data,
      selling_price:
        plan.selling_price,
    }),
  );
}

/* ============================================================
   SERVER
   ============================================================ */

Deno.serve(async (req) => {
  if (
    req.method ===
    "OPTIONS"
  ) {
    return new Response(
      "ok",
      {
        headers:
          corsHeaders,
      },
    );
  }

  if (
    req.method !==
    "POST"
  ) {
    return json(
      {
        success: false,
        error:
          "Method not allowed",
      },
      405,
    );
  }

  try {
    const user =
      await getUser(req);

    if (!user) {
      return json(
        {
          success: false,
          error:
            "Unauthorized",
        },
        401,
      );
    }

    const body =
      await req
        .json()
        .catch(() => ({}));

    if (
      !body ||
      typeof body !==
        "object" ||
      Array.isArray(body)
    ) {
      return json(
        {
          success: false,
          error:
            "Invalid request body",
        },
        400,
      );
    }

    const action =
      cleanString(
        body?.action ??
          "service",
      ).toLowerCase();

    const admin =
      adminClient();

    /* ========================================================
       DATA PLANS
       ======================================================== */

    if (
      action ===
      "data_plans"
    ) {
      return json({
        success: true,
        plans:
          getPublicDataPlans(),
      });
    }

    /* ========================================================
       CATEGORIES
       ======================================================== */

    if (
      action ===
      "categories"
    ) {
      const result =
        await flw(
          "/bill-categories?country=NG",
        );

      if (
        !result.ok ||
        result.body?.status !==
          "success"
      ) {
        return json(
          {
            success: false,
            error:
              result.body
                ?.message ??
              "Unable to load bill categories",
            provider_status:
              result.status,
            provider_response:
              result.body ??
              null,
          },
          502,
        );
      }

      return json({
        success: true,
        categories:
          Array.isArray(
            result.body?.data,
          )
            ? result.body.data
            : [],
      });
    }

    /* ========================================================
       BILLERS
       ======================================================== */

    if (
      action ===
      "billers"
    ) {
      const category =
        cleanString(
          body?.category,
        ).toUpperCase();

      if (!category) {
        return json(
          {
            success: false,
            error:
              "category is required",
          },
          400,
        );
      }

      const result =
        await flw(
          `/bills/${encodeURIComponent(
            category,
          )}/billers?country=NG`,
        );

      if (
        !result.ok ||
        result.body?.status !==
          "success"
      ) {
        return json(
          {
            success: false,
            error:
              result.body
                ?.message ??
              "Unable to load bill providers",
            category,
            provider_status:
              result.status,
            provider_response:
              result.body ??
              null,
          },
          502,
        );
      }

      return json({
        success: true,
        category,
        billers:
          Array.isArray(
            result.body?.data,
          )
            ? result.body.data
            : [],
      });
    }

    /* ========================================================
       ITEMS
       ======================================================== */

    if (
      action ===
      "items"
    ) {
      const billerCode =
        cleanString(
          body?.biller_code ??
            body?.billerCode,
        );

      if (!billerCode) {
        return json(
          {
            success: false,
            error:
              "biller_code is required",
          },
          400,
        );
      }

      const result =
        await fetchBillItems(
          billerCode,
        );

      if (
        !result.ok ||
        result.body?.status !==
          "success"
      ) {
        return json(
          {
            success: false,
            error:
              result.body
                ?.message ??
              "Unable to load bill packages",
            provider_status:
              result.status,
            provider_response:
              result.body ??
              null,
          },
          502,
        );
      }

      return json({
        success: true,
        biller_code:
          billerCode,
        items:
          Array.isArray(
            result.body?.data,
          )
            ? result.body.data
            : [],
      });
    }

    /* ========================================================
       VALIDATION
       ======================================================== */

    if (
      action ===
      "validate"
    ) {
      const itemCode =
        cleanString(
          body?.item_code ??
            body?.itemCode,
        );

      const customer =
        cleanString(
          body?.customer ??
            body?.customer_id ??
            body?.customerId,
        );

      if (!itemCode) {
        return json(
          {
            success: false,
            error:
              "item_code is required",
          },
          400,
        );
      }

      if (!customer) {
        return json(
          {
            success: false,
            error:
              "customer is required",
          },
          400,
        );
      }

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
        return json(
          {
            success: false,
            error:
              validation.body
                ?.message ??
              "Unable to validate customer details.",
            provider_status:
              validation.status,
            data:
              validation.body
                ?.data ??
              null,
          },
          400,
        );
      }

      return json({
        success: true,
        message:
          validation.body
            ?.message ??
          "Customer validated successfully.",
        data:
          validation.body
            ?.data ??
          null,
      });
    }

    /* ========================================================
       STATUS
       ======================================================== */

    if (
      action ===
      "status"
    ) {
      const reference =
        cleanString(
          body?.reference ??
            body?.tx_ref,
        );

      if (!reference) {
        return json(
          {
            success: false,
            error:
              "reference is required",
          },
          400,
        );
      }

      const {
        data: txn,
        error:
          txnError,
      } =
        await getLocalTransaction(
          admin,
          user.id,
          reference,
        );

      if (txnError) {
        return json(
          {
            success: false,
            error:
              "Unable to retrieve transaction",
          },
          500,
        );
      }

      if (!txn) {
        return json(
          {
            success: false,
            error:
              "Transaction not found",
          },
          404,
        );
      }

      if (
        normalizeStatus(
          txn.status,
        ) ===
        "successful"
      ) {
        return json({
          success: true,
          reference,
          local_status:
            txn.status,
          provider_status:
            "successful",
          transaction:
            txn,
        });
      }

      const providerReference =
        cleanString(
          txn.provider_reference ??
            "",
        );

      const flutterwaveReference =
        providerReference ||
        reference;

      const providerResult =
        await flw(
          `/bills/${encodeURIComponent(
            flutterwaveReference,
          )}?verbose=1`,
        );

      if (
        !providerResult.ok
      ) {
        return json({
          success: true,
          reference,
          local_status:
            txn.status,
          provider_status:
            "unavailable",
          reconciliation_required:
            true,
          transaction:
            txn,
        });
      }

      const providerBody =
        providerResult.body ??
        {};

      const providerData =
        getProviderData(
          providerBody,
        );

      const providerStatus =
        extractProviderStatus(
          providerBody,
        );

      const newProviderReference =
        extractProviderReference(
          providerBody,
        );

      const metadata =
        getTransactionMetadata(
          txn,
        );

      /* SUCCESS */

      if (
        isSuccessfulStatus(
          providerStatus,
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
              newProviderReference ||
              providerReference ||
              null,
            metadata: {
              ...metadata,
              flutterwave_status:
                providerBody,
              reconciliation_required:
                false,
              reconciled_at:
                new Date().toISOString(),
            },
          },
        );

        return json({
          success: true,
          reference,
          local_status:
            "successful",
          provider_status:
            providerStatus,
          transaction: {
            ...txn,
            status:
              "successful",
          },
          provider_data:
            providerData,
        });
      }

      /* FAILED */

      if (
        isFailedStatus(
          providerStatus,
        )
      ) {
        const amount =
          normalizeAmount(
            txn.amount,
          );

        if (
          amount ===
          null
        ) {
          return json(
            {
              success: false,
              error:
                "Invalid transaction amount. Manual refund required.",
              reference,
              refund_required:
                true,
            },
            500,
          );
        }

        const refund =
          await refundBillTransaction(
            admin,
            user.id,
            amount,
            reference,
            {
              ...metadata,
              flutterwave_status:
                providerBody,
            },
          );

        if (
          !refund.success
        ) {
          await updateTransaction(
            admin,
            user.id,
            reference,
            {
              status:
                "failed",
              metadata: {
                ...metadata,
                refund_required:
                  true,
                refund_error:
                  refund.error,
              },
            },
          );

          return json(
            {
              success: false,
              error:
                "Bill payment failed and automatic refund could not be completed. Please contact support.",
              reference,
              refund_required:
                true,
            },
            500,
          );
        }

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
              newProviderReference ||
              providerReference ||
              null,
            metadata: {
              ...metadata,
              flutterwave_status:
                providerBody,
              refunded:
                true,
              refund_reference:
                refund.reference,
              reconciliation_required:
                false,
              reconciled_at:
                new Date().toISOString(),
            },
          },
        );

        return json({
          success: true,
          reference,
          local_status:
            "failed",
          provider_status:
            providerStatus,
          refunded:
            true,
          refund_reference:
            refund.reference,
          transaction: {
            ...txn,
            status:
              "failed",
          },
          provider_data:
            providerData,
        });
      }

      /* PENDING */

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
            newProviderReference ||
            providerReference ||
            null,
          metadata: {
            ...metadata,
            flutterwave_status:
              providerBody,
            reconciliation_required:
              true,
            last_checked_at:
              new Date().toISOString(),
          },
        },
      );

      return json({
        success: true,
        reference,
        local_status:
          "pending",
        provider_status:
          providerStatus,
        reconciliation_required:
          true,
        transaction: {
          ...txn,
          status:
            "pending",
        },
        provider_data:
          providerData,
      });
    }

    /* ========================================================
       PAY / SERVICE
       ======================================================== */

    if (
      action !== "pay" &&
      action !== "service"
    ) {
      return json(
        {
          success: false,
          error:
            `Unsupported action: ${action}`,
        },
        400,
      );
    }

    const service =
      normalizeService(
        body?.service,
      );

    if (!service) {
      return json(
        {
          success: false,
          error:
            "Unsupported bill service.",
          supported_services:
            SUPPORTED_SERVICES,
        },
        400,
      );
    }

    /* ========================================================
       DATA PAYMENT
       ======================================================== */

    if (
      service ===
      "data"
    ) {
      const planId =
        cleanString(
          body?.plan_id ??
            body?.planId,
        );

      const phone =
        cleanString(
          body?.phone ??
            body?.phoneNumber ??
            body?.customer,
        ).replace(
          /\s+/g,
          "",
        );

      if (!planId) {
        return json(
          {
            success: false,
            error:
              "Data plan is required.",
          },
          400,
        );
      }

      if (
        !/^(?:\+?234|0)[0-9]{10}$/.test(
          phone,
        )
      ) {
        return json(
          {
            success: false,
            error:
              "Please provide a valid Nigerian phone number.",
          },
          400,
        );
      }

      /* -----------------------------------------------
         Resolve plan ONLY from server-side mapping
         ----------------------------------------------- */

      const plan =
        getDataPlan(
          planId,
        );

      if (!plan) {
        return json(
          {
            success: false,
            error:
              "The selected data plan is not available.",
          },
          400,
        );
      }

      /* -----------------------------------------------
         Get Flutterwave catalogue
         ----------------------------------------------- */

      const itemsResult =
        await fetchBillItems(
          plan.biller_code,
        );

      if (
        !itemsResult.ok ||
        itemsResult.body?.status !==
          "success"
      ) {
        return json(
          {
            success: false,
            error:
              "Unable to verify the selected data plan with Flutterwave.",
            provider_status:
              itemsResult.status,
            provider_response:
              itemsResult.body ??
              null,
          },
          502,
        );
      }

      const billItems =
        Array.isArray(
          itemsResult.body?.data,
        )
          ? itemsResult.body.data
          : [];

      /* -----------------------------------------------
         Find mapped Flutterwave item
         ----------------------------------------------- */

      const selectedItem =
        billItems.find(
          (item: any) =>
            extractItemCode(
              item,
            ) ===
            plan.item_code,
        );

      if (!selectedItem) {
        return json(
          {
            success: false,
            error:
              "The selected data plan could not be verified against Flutterwave's current catalogue.",
            plan_id:
              plan.id,
            item_code:
              plan.item_code,
            biller_code:
              plan.biller_code,
          },
          400,
        );
      }

      /* -----------------------------------------------
         Provider amount comes from Flutterwave
         ----------------------------------------------- */

      const providerAmount =
        extractAmount(
          selectedItem,
        );

      if (
        providerAmount ===
        null
      ) {
        return json(
          {
            success: false,
            error:
              "Flutterwave did not return a valid provider amount for this plan.",
          },
          502,
        );
      }

      /* -----------------------------------------------
         Selling price comes from YOUR server catalogue
         ----------------------------------------------- */

      const sellingPrice =
        normalizeAmount(
          plan.selling_price,
        );

      if (
        sellingPrice ===
        null
      ) {
        return json(
          {
            success: false,
            error:
              "Invalid selling price configured for this plan.",
          },
          500,
        );
      }

      /* -----------------------------------------------
         Profit
         ----------------------------------------------- */

      const profit =
        Number(
          (
            sellingPrice -
            providerAmount
          ).toFixed(2),
        );

      if (
        profit <
        0
      ) {
        return json(
          {
            success: false,
            error:
              "This data plan has an invalid selling price configuration.",
          },
          500,
        );
      }

      /* -----------------------------------------------
         Unique transaction reference
         ----------------------------------------------- */

      const reference =
        `DATA_${crypto
          .randomUUID()
          .replace(
            /-/g,
            "",
          )}`;

      /* -----------------------------------------------
         Debit WALLET by SELLING PRICE
         ----------------------------------------------- */

      const {
        data: debit,
        error:
          debitError,
      } =
        await admin.rpc(
          "debit_wallet",
          {
            _user_id:
              user.id,

            _amount:
              sellingPrice,

            _description:
              `Data bundle (${plan.network} ${plan.data})`,

            _idempotency_key:
              reference,

            _reference:
              reference,

            _category:
              "bill_payment",

            _metadata: {
              service:
                "data",

              plan_id:
                plan.id,

              plan_name:
                plan.name,

              network:
                plan.network,

              period:
                plan.period,

              data:
                plan.data,

              phone,

              selling_price:
                sellingPrice,

              provider_amount:
                providerAmount,

              profit,

              biller_code:
                plan.biller_code,

              item_code:
                plan.item_code,
            },
          },
        );

      if (debitError) {
        console.error(
          "Data wallet debit failed:",
          debitError,
        );

        const message =
          String(
            debitError.message ??
              "",
          ).toLowerCase();

        return json(
          {
            success: false,
            error:
              message.includes(
                "insufficient",
              )
                ? "Insufficient wallet balance"
                : "Unable to debit your wallet",
          },
          400,
        );
      }

      /* -----------------------------------------------
         Provider payment
         ----------------------------------------------- */

      const providerPath =
        `/billers/${encodeURIComponent(
          plan.biller_code,
        )}/items/${encodeURIComponent(
          plan.item_code,
        )}/payment`;

      /**
       * CRITICAL:
       *
       * Flutterwave receives providerAmount,
       * NOT sellingPrice.
       */

      const paymentBody = {
        country:
          "NG",

        customer_id:
          phone,

        amount:
          providerAmount,

        reference,
      };

      console.log(
        "Sending DATA payment to Flutterwave:",
        JSON.stringify({
          reference,
          plan_id:
            plan.id,
          phone,
          selling_price:
            sellingPrice,
          provider_amount:
            providerAmount,
          profit,
          provider_path:
            providerPath,
          payment_body:
            paymentBody,
        }),
      );

      let providerResult;

      try {
        providerResult =
          await flw(
            providerPath,
            {
              method:
                "POST",
              body:
                JSON.stringify(
                  paymentBody,
                ),
            },
          );
      } catch (
        providerError
      ) {
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
              service:
                "data",

              phone,

              plan_id:
                plan.id,

              plan_name:
                plan.name,

              network:
                plan.network,

              period:
                plan.period,

              data:
                plan.data,

              selling_price:
                sellingPrice,

              provider_amount:
                providerAmount,

              profit,

              biller_code:
                plan.biller_code,

              item_code:
                plan.item_code,

              provider_error:
                providerError instanceof
                Error
                  ? providerError.message
                  : String(
                      providerError,
                    ),

              reconciliation_required:
                true,
            },
          },
        );

        return json(
          {
            success: true,
            message:
              "Your data purchase is being verified.",
            reference,
            transaction_id:
              debit?.id ??
              null,
            phone,
            plan: {
              id:
                plan.id,
              name:
                plan.name,
              network:
                plan.network,
              period:
                plan.period,
              data:
                plan.data,
            },
            selling_price:
              sellingPrice,
            provider_amount:
              providerAmount,
            status:
              "pending",
            reconciliation_required:
              true,
          },
          202,
        );
      }

      const providerBody =
        providerResult?.body ??
        {};

      const providerData =
        getProviderData(
          providerBody,
        );

      const providerStatus =
        extractProviderStatus(
          providerBody,
        );

      const providerReference =
        extractProviderReference(
          providerBody,
        );

      const metadata = {
        service:
          "data",

        phone,

        plan_id:
          plan.id,

        plan_name:
          plan.name,

        network:
          plan.network,

        period:
          plan.period,

        data:
          plan.data,

        selling_price:
          sellingPrice,

        provider_amount:
          providerAmount,

        profit,

        biller_code:
          plan.biller_code,

        item_code:
          plan.item_code,

        flutterwave:
          providerBody,
      };

      /* -----------------------------------------------
         SUCCESS
         ----------------------------------------------- */

      if (
        providerResult?.ok &&
        isSuccessfulStatus(
          providerStatus,
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

            metadata: {
              ...metadata,

              reconciliation_required:
                false,

              completed_at:
                new Date().toISOString(),
            },
          },
        );

        return json({
          success: true,

          message:
            getProviderMessage(
              providerBody,
            ) ||
            "Data purchase successful.",

          reference,

          transaction_id:
            debit?.id ??
            null,

          provider_reference:
            providerReference,

          phone,

          plan: {
            id:
              plan.id,
            name:
              plan.name,
            network:
              plan.network,
            period:
              plan.period,
            data:
              plan.data,
          },

          selling_price:
            sellingPrice,

          provider_amount:
            providerAmount,

          profit,

          currency:
            "NGN",

          status:
            "successful",

          data:
            providerData,
        });
      }

      /* -----------------------------------------------
         DEFINITIVE FAILURE
         ----------------------------------------------- */

      const providerHttpStatus =
        Number(
          providerResult?.status ??
            0,
        );

      const definitiveHttpFailure =
        providerHttpStatus >=
          400 &&
        providerHttpStatus <
          500;

      if (
        isFailedStatus(
          providerStatus,
        ) ||
        definitiveHttpFailure
      ) {
        const refund =
          await refundBillTransaction(
            admin,
            user.id,
            sellingPrice,
            reference,
            metadata,
          );

        if (
          !refund.success
        ) {
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

                refund_required:
                  true,

                refund_error:
                  refund.error,

                reconciliation_required:
                  false,
              },
            },
          );

          return json(
            {
              success: false,
              error:
                "Data purchase failed and automatic refund could not be completed. Please contact support.",
              reference,
              refund_required:
                true,
            },
            500,
          );
        }

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

              refunded:
                true,

              refund_reference:
                refund.reference,

              reconciliation_required:
                false,

              completed_at:
                new Date().toISOString(),
            },
          },
        );

        return json(
          {
            success: false,

            error:
              getProviderMessage(
                providerBody,
              ) ||
              "Data purchase failed. Your wallet has been refunded.",

            refunded:
              true,

            refund_reference:
              refund.reference,

            reference,

            phone,

            plan: {
              id:
                plan.id,
              name:
                plan.name,
              network:
                plan.network,
              period:
                plan.period,
              data:
                plan.data,
            },

            selling_price:
              sellingPrice,

            provider_amount:
              providerAmount,

            status:
              "failed",
          },
          400,
        );
      }

      /* -----------------------------------------------
         AMBIGUOUS / PENDING
         ----------------------------------------------- */

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
            ...metadata,

            reconciliation_required:
              true,

            last_provider_status:
              providerStatus,

            provider_http_status:
              providerHttpStatus,

            last_checked_at:
              new Date().toISOString(),
          },
        },
      );

      return json(
        {
          success: true,

          message:
            "Data purchase is pending verification.",

          reference,

          transaction_id:
            debit?.id ??
            null,

          provider_reference:
            providerReference,

          phone,

          plan: {
            id:
              plan.id,
            name:
              plan.name,
            network:
              plan.network,
            period:
              plan.period,
            data:
              plan.data,
          },

          selling_price:
            sellingPrice,

          provider_amount:
            providerAmount,

          status:
            "pending",

          reconciliation_required:
            true,

          data:
            providerData,
        },
        202,
      );
    }

    /* ========================================================
       EXISTING AIRTIME / ELECTRICITY / CABLE / INTERNET FLOW
       ======================================================== */

    /**
     * Keep your existing non-data implementation here.
     *
     * The DATA flow above is now completely separated so the
     * custom Daily / Weekly / Monthly UI cannot manipulate the
     * Flutterwave item code or provider price.
     */

    return json(
      {
        success: false,
        error:
          `${service} payment flow is not included in this replacement block. Use the existing service implementation below the DATA flow.`,
      },
      400,
    );
  } catch (error: any) {
    console.error(
      "Flutterwave bills function error:",
      error,
    );

    return json(
      {
        success: false,
        error:
          error?.message ??
          "Unexpected error",
      },
      500,
    );
  }
});
