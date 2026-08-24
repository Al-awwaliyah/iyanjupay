import {
  corsHeaders,
  json,
  adminClient,
  getUser,
  flw,
} from "../_shared/auth.ts";

/**
 * ============================================================
 * IYANJUPAY — FLUTTERWAVE BILL PAYMENTS
 * ============================================================
 *
 * Supported:
 *   - Airtime
 *   - Data
 *   - Electricity
 *   - Cable
 *   - Internet
 *
 * PRICING:
 *
 *   DATA:
 *      Flutterwave provider amount + ₦50
 *
 *   OTHER SERVICES:
 *      Flutterwave provider amount
 *
 * IMPORTANT:
 *
 * The frontend is NEVER trusted for:
 *
 *   - biller code
 *   - item code price
 *   - provider amount
 *   - selling price
 *   - markup
 *
 * The backend always:
 *
 *   1. Fetches Flutterwave's catalogue
 *   2. Finds the selected item
 *   3. Reads the provider amount
 *   4. Calculates the customer's selling price
 *   5. Validates electricity/cable/internet customers
 *   6. Debits the wallet
 *   7. Sends ONLY provider amount to Flutterwave
 *   8. Reconciles ambiguous responses
 *   9. Refunds definitive failures
 *
 * ============================================================
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

const DATA_PLAN_MARKUP = 50;

/**
 * ============================================================
 * FLUTTERWAVE CATEGORIES
 * ============================================================
 */

const SERVICE_CATEGORY_MAP: Record<ServiceType, string> = {
  airtime: "AIRTIME",
  data: "MOBILEDATA",
  electricity: "UTILITYBILLS",
  cable: "CABLEBILLS",
  internet: "INTSERVICE",
};

/**
 * ============================================================
 * PROVIDER STATUSES
 * ============================================================
 */

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

/**
 * ============================================================
 * BASIC HELPERS
 * ============================================================
 */

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

function isPendingStatus(value: unknown): boolean {
  return PENDING_STATUSES.has(
    normalizeStatus(value),
  );
}

function normalizeAmount(
  value: unknown,
): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const amount = Number(value);

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    return null;
  }

  return Number(amount.toFixed(2));
}

/**
 * ============================================================
 * ITEM HELPERS
 * ============================================================
 */

function extractAmount(
  item: any,
): number | null {
  const candidates = [
    item?.amount,
    item?.price,
    item?.cost,
    item?.value,
    item?.provider_amount,
    item?.selling_price,
    item?.sellingPrice,
  ];

  for (const candidate of candidates) {
    const amount = normalizeAmount(candidate);

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
      item?.productCode ??
      item?.code ??
      item?.item_id ??
      item?.itemId,
  );
}

function extractBillerCode(
  item: any,
): string {
  return cleanString(
    item?.biller_code ??
      item?.billerCode ??
      item?.biller?.code ??
      item?.provider_code ??
      item?.providerCode,
  );
}

function extractItemName(
  item: any,
): string {
  return (
    cleanString(
      item?.item_name ??
        item?.itemName ??
        item?.name ??
        item?.description ??
        item?.product_name ??
        item?.productName ??
        item?.label ??
        item?.title,
    ) || "Bill Package"
  );
}

function extractValidity(
  item: any,
): string {
  return cleanString(
    item?.validity ??
      item?.validity_period ??
      item?.duration ??
      item?.duration_name ??
      item?.period ??
      item?.subscription_period ??
      item?.data_validity ??
      "",
  );
}

function extractProviderType(
  item: any,
): string {
  return cleanString(
    item?.type ??
      item?.item_type ??
      item?.service_type ??
      item?.product_type ??
      "",
  );
}

/**
 * ============================================================
 * DATA PLAN PERIOD
 * ============================================================
 */

type PlanPeriod =
  | "daily"
  | "weekly"
  | "monthly"
  | "other";

function classifyPlanPeriod(
  item: any,
): PlanPeriod {
  const text = [
    item?.validity,
    item?.validity_period,
    item?.duration,
    item?.duration_name,
    item?.period,
    item?.subscription_period,
    item?.data_validity,
    item?.type,
    item?.item_name,
    item?.itemName,
    item?.name,
    item?.description,
    item?.product_name,
    item?.productName,
  ]
    .map((value) =>
      cleanString(value).toLowerCase(),
    )
    .filter(Boolean)
    .join(" ");

  if (
    /\bmonthly\b/.test(text) ||
    /\b30\s*days?\b/.test(text) ||
    /\b31\s*days?\b/.test(text) ||
    /\b4\s*weeks?\b/.test(text) ||
    /\b1\s*month\b/.test(text)
  ) {
    return "monthly";
  }

  if (
    /\bweekly\b/.test(text) ||
    /\b7\s*days?\b/.test(text) ||
    /\b1\s*week\b/.test(text) ||
    /\b2\s*weeks?\b/.test(text) ||
    /\b3\s*weeks?\b/.test(text)
  ) {
    return "weekly";
  }

  if (
    /\bdaily\b/.test(text) ||
    /\b24\s*hours?\b/.test(text) ||
    /\b1\s*day\b/.test(text) ||
    /\b2\s*days?\b/.test(text) ||
    /\b3\s*days?\b/.test(text)
  ) {
    return "daily";
  }

  return "other";
}

function periodLabel(
  period: PlanPeriod,
): string {
  switch (period) {
    case "daily":
      return "Daily";

    case "weekly":
      return "Weekly";

    case "monthly":
      return "Monthly";

    default:
      return "Other";
  }
}

/**
 * ============================================================
 * CATALOGUE ENRICHMENT
 * ============================================================
 */

function enrichBillPackage(
  item: any,
  billerCode: string,
  service: ServiceType,
) {
  const providerAmount =
    extractAmount(item);

  const itemCode =
    extractItemCode(item);

  if (!itemCode || providerAmount === null) {
    return null;
  }

  const markup =
    service === "data"
      ? DATA_PLAN_MARKUP
      : 0;

  const sellingPrice =
    Number(
      (
        providerAmount +
        markup
      ).toFixed(2),
    );

  const profit =
    Number(
      (
        sellingPrice -
        providerAmount
      ).toFixed(2),
    );

  const name =
    extractItemName(item);

  const validity =
    extractValidity(item);

  const providerType =
    extractProviderType(item);

  const period =
    service === "data"
      ? classifyPlanPeriod(item)
      : "other";

  return {
    item_code: itemCode,

    biller_code:
      extractBillerCode(item) ||
      billerCode,

    service,

    name,

    item_name: name,

    description:
      cleanString(item?.description) ||
      name,

    validity,

    period,

    period_label:
      periodLabel(period),

    provider_amount:
      providerAmount,

    selling_price:
      sellingPrice,

    profit,

    markup,

    currency: "NGN",

    provider_type:
      providerType || null,

    provider_item: item,
  };
}

function buildBillCatalogue(
  items: any[],
  billerCode: string,
  service: ServiceType,
) {
  const packages =
    items
      .map((item) =>
        enrichBillPackage(
          item,
          billerCode,
          service,
        ),
      )
      .filter(Boolean);

  const daily =
    packages.filter(
      (plan: any) =>
        plan.period === "daily",
    );

  const weekly =
    packages.filter(
      (plan: any) =>
        plan.period === "weekly",
    );

  const monthly =
    packages.filter(
      (plan: any) =>
        plan.period === "monthly",
    );

  const other =
    packages.filter(
      (plan: any) =>
        plan.period === "other",
    );

  return {
    packages,
    plans: packages,
    daily,
    weekly,
    monthly,
    other,

    counts: {
      total: packages.length,
      daily: daily.length,
      weekly: weekly.length,
      monthly: monthly.length,
      other: other.length,
    },
  };
}

/**
 * ============================================================
 * PROVIDER RESPONSE HELPERS
 * ============================================================
 */

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

  const status =
    normalizeStatus(
      data?.status ??
        data?.transaction_status ??
        data?.bill_status ??
        body?.status,
    );

  /**
   * response_code is NOT treated as a transaction status.
   *
   * A response code can be a numeric/business code and should
   * not accidentally make a successful/pending transaction
   * appear failed.
   */
  return status || "pending";
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

function providerDebug(
  result: any,
) {
  return {
    ok: Boolean(result?.ok),

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

/**
 * ============================================================
 * TRANSACTION HELPERS
 * ============================================================
 */

function getTransactionMetadata(
  txn: any,
): Record<string, unknown> {
  if (
    txn?.metadata &&
    typeof txn.metadata === "object" &&
    !Array.isArray(txn.metadata)
  ) {
    return {
      ...txn.metadata,
    };
  }

  return {};
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
    } =
      await admin
        .from("transactions")
        .update(updates)
        .eq("user_id", userId)
        .eq("reference_number", reference)
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
  return await admin
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
    .eq("reference_number", reference)
    .maybeSingle();
}

/**
 * ============================================================
 * REFUND
 * ============================================================
 */

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
    } =
      await admin.rpc(
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

/**
 * ============================================================
 * FLUTTERWAVE API
 * ============================================================
 */

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

async function fetchBillStatus(
  reference: string,
) {
  return await flw(
    `/bills/${encodeURIComponent(
      reference,
    )}?verbose=1`,
  );
}

/**
 * ============================================================
 * CUSTOMER VALIDATION
 * ============================================================
 */

function shouldValidateCustomer(
  service: ServiceType,
): boolean {
  return !(
    service === "airtime" ||
    service === "data"
  );
}

/**
 * ============================================================
 * PHONE
 * ============================================================
 */

function normalizeNigeriaPhone(
  value: string,
): string | null {
  const phone =
    value.replace(/\s+/g, "");

  if (
    /^\+234[0-9]{10}$/.test(
      phone,
    )
  ) {
    return phone;
  }

  if (
    /^234[0-9]{10}$/.test(
      phone,
    )
  ) {
    return `+${phone}`;
  }

  if (
    /^0[0-9]{10}$/.test(
      phone,
    )
  ) {
    return `+234${phone.slice(1)}`;
  }

  return null;
}

/**
 * ============================================================
 * MAIN
 * ============================================================
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return json(
      {
        success: false,
        error: "Method not allowed",
      },
      405,
    );
  }

  try {
    /**
     * --------------------------------------------------------
     * AUTH
     * --------------------------------------------------------
     */

    const user =
      await getUser(req);

    if (!user) {
      return json(
        {
          success: false,
          error: "Unauthorized",
        },
        401,
      );
    }

    /**
     * --------------------------------------------------------
     * BODY
     * --------------------------------------------------------
     */

    const body =
      await req
        .json()
        .catch(() => ({}));

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body)
    ) {
      return json(
        {
          success: false,
          error: "Invalid request body",
        },
        400,
      );
    }

    const action =
      cleanString(
        body?.action ?? "service",
      ).toLowerCase();

    const admin =
      adminClient();

    console.log(
      "Flutterwave bills request:",
      JSON.stringify({
        action,
        user_id: user.id,
        service: body?.service,
        biller_code:
          body?.biller_code ??
          body?.billerCode,
        item_code:
          body?.item_code ??
          body?.itemCode,
      }),
    );

    /**
     * ========================================================
     * CATEGORIES
     * ========================================================
     */

    if (action === "categories") {
      const result =
        await flw(
          "/bill-categories?country=NG",
        );

      if (
        !result.ok ||
        result.body?.status !== "success"
      ) {
        return json(
          {
            success: false,
            error:
              result.body?.message ??
              "Unable to load bill categories",
            provider_status:
              result.status,
            provider_response:
              result.body ?? null,
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

    /**
     * ========================================================
     * BILLERS
     * ========================================================
     */

    if (action === "billers") {
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
        result.body?.status !== "success"
      ) {
        return json(
          {
            success: false,
            error:
              result.body?.message ??
              "Unable to load bill providers",
            category,
            provider_status:
              result.status,
            provider_response:
              result.body ?? null,
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

    /**
     * ========================================================
     * ITEMS
     * ========================================================
     */

    if (action === "items") {
      const billerCode =
        cleanString(
          body?.biller_code ??
            body?.billerCode,
        );

      const service =
        normalizeService(
          body?.service,
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

      if (!service) {
        return json(
          {
            success: false,
            error:
              "service is required when loading bill items.",
            supported_services:
              SUPPORTED_SERVICES,
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
        result.body?.status !== "success"
      ) {
        return json(
          {
            success: false,
            error:
              result.body?.message ??
              "Unable to load bill packages",
            biller_code:
              billerCode,
            service,
            provider_status:
              result.status,
            provider_response:
              result.body ?? null,
          },
          502,
        );
      }

      const rawItems =
        Array.isArray(
          result.body?.data,
        )
          ? result.body.data
          : [];

      const catalogue =
        buildBillCatalogue(
          rawItems,
          billerCode,
          service,
        );

      return json({
        success: true,

        service,

        biller_code:
          billerCode,

        items: rawItems,

        packages:
          catalogue.packages,

        plans:
          catalogue.plans,

        daily:
          catalogue.daily,

        weekly:
          catalogue.weekly,

        monthly:
          catalogue.monthly,

        other:
          catalogue.other,

        counts:
          catalogue.counts,

        markup:
          service === "data"
            ? DATA_PLAN_MARKUP
            : 0,

        currency: "NGN",
      });
    }

    /**
     * ========================================================
     * VALIDATE
     * ========================================================
     */

    if (action === "validate") {
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
              validation.body?.message ??
              "Unable to validate customer details.",
            provider_status:
              validation.status,
            data:
              validation.body?.data ??
              null,
            provider_response:
              validation.body ?? null,
          },
          400,
        );
      }

      return json({
        success: true,

        message:
          validation.body?.message ??
          "Customer validated successfully.",

        data:
          validation.body?.data ??
          null,
      });
    }

    /**
     * ========================================================
     * STATUS / RECONCILIATION
     * ========================================================
     */

    if (action === "status") {
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
        error: txnError,
      } =
        await getLocalTransaction(
          admin,
          user.id,
          reference,
        );

      if (txnError) {
        console.error(
          "Transaction lookup failed:",
          txnError,
        );

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

      const metadata =
        getTransactionMetadata(
          txn,
        );

      if (
        isSuccessfulStatus(
          txn.status,
        )
      ) {
        return json({
          success: true,
          reference,
          local_status:
            "successful",
          provider_status:
            "successful",
          transaction: txn,
        });
      }

      if (
        metadata.refunded === true ||
        Boolean(
          metadata.refund_reference,
        )
      ) {
        return json({
          success: true,
          reference,
          local_status:
            txn.status,
          provider_status:
            "failed",
          refunded: true,
          refund_reference:
            metadata.refund_reference ??
            null,
          transaction: txn,
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
        await fetchBillStatus(
          flutterwaveReference,
        );

      console.log(
        "Flutterwave bill status:",
        JSON.stringify({
          reference,
          flutterwave_reference:
            flutterwaveReference,
          ...providerDebug(
            providerResult,
          ),
        }),
      );

      /**
       * Provider unavailable:
       *
       * DO NOT refund.
       */
      if (!providerResult.ok) {
        return json({
          success: true,
          reference,
          local_status:
            txn.status,
          provider_status:
            "unavailable",
          reconciliation_required:
            true,
          transaction: txn,
          provider_response:
            providerResult.body ??
            null,
        });
      }

      const providerBody =
        providerResult.body ?? {};

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

      /**
       * SUCCESS
       */
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

      /**
       * FAILED
       */
      if (
        isFailedStatus(
          providerStatus,
        )
      ) {
        const amount =
          normalizeAmount(
            txn.amount,
          );

        if (amount === null) {
          await updateTransaction(
            admin,
            user.id,
            reference,
            {
              status:
                "failed",

              provider:
                "flutterwave",

              metadata: {
                ...metadata,

                flutterwave_status:
                  providerBody,

                refund_required:
                  true,

                refund_error:
                  "Invalid transaction amount",
              },
            },
          );

          return json(
            {
              success: false,
              error:
                "Provider failed the bill payment, but the refund requires manual review.",
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

        if (!refund.success) {
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

                refund_required:
                  true,

                refund_error:
                  String(
                    refund.error ??
                      "Unknown refund error",
                  ),
              },
            },
          );

          return json(
            {
              success: false,
              error:
                "Bill payment failed and automatic refund could not be completed. Please contact support.",
              reference,
              amount,
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

              refunded: true,

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

          refunded: true,

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

      /**
       * PENDING
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
          providerStatus ||
          "pending",

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

    /**
     * ========================================================
     * PAYMENT
     * ========================================================
     */

    if (
      action !== "pay" &&
      action !== "service"
    ) {
      return json(
        {
          success: false,

          error:
            `Unsupported action: ${action}`,

          supported_actions: [
            "categories",
            "billers",
            "items",
            "validate",
            "status",
            "pay",
            "service",
          ],
        },
        400,
      );
    }

    /**
     * ========================================================
     * SERVICE
     * ========================================================
     */

    const service =
      normalizeService(
        body?.service,
      );

    if (!service) {
      return json(
        {
          success: false,

          error:
            `The ${
              cleanString(
                body?.service,
              ) || "unknown"
            } service is not available.`,

          service:
            cleanString(
              body?.service,
            ) || "unknown",

          supported_services:
            SUPPORTED_SERVICES,
        },
        400,
      );
    }

    const details =
      body?.details &&
      typeof body.details ===
        "object" &&
      !Array.isArray(
        body.details,
      )
        ? body.details
        : {};

    const country =
      cleanString(
        body?.country ??
          details?.country ??
          "NG",
      ).toUpperCase();

    const billerCode =
      cleanString(
        body?.biller_code ??
          body?.billerCode ??
          details?.biller_code ??
          details?.billerCode,
      );

    const itemCode =
      cleanString(
        body?.item_code ??
          body?.itemCode ??
          details?.item_code ??
          details?.itemCode,
      );

    let customer =
      cleanString(
        body?.customer ??
          body?.customer_id ??
          body?.customerId ??
          details?.customer ??
          details?.customer_id ??
          details?.customerId ??
          details?.phoneNumber ??
          details?.phone ??
          details?.meterNumber ??
          details?.meter_number ??
          details?.smartcardNumber ??
          details?.smartCardNumber ??
          details?.smartcard_number ??
          details?.accountNumber ??
          details?.account_number,
      );

    const expectedCategory =
      SERVICE_CATEGORY_MAP[
        service
      ];

    /**
     * --------------------------------------------------------
     * COUNTRY
     * --------------------------------------------------------
     */

    if (country !== "NG") {
      return json(
        {
          success: false,
          error:
            "Flutterwave bill payments currently support NG billers only.",
        },
        400,
      );
    }

    /**
     * --------------------------------------------------------
     * BILLER
     * --------------------------------------------------------
     */

    if (!billerCode) {
      return json(
        {
          success: false,
          error:
            "Please select a valid bill provider.",
          service,
          category:
            expectedCategory,
        },
        400,
      );
    }

    /**
     * --------------------------------------------------------
     * ITEM
     * --------------------------------------------------------
     */

    if (!itemCode) {
      return json(
        {
          success: false,
          error:
            "Please select a valid bill package.",
          service,
          category:
            expectedCategory,
          biller_code:
            billerCode,
        },
        400,
      );
    }

    /**
     * --------------------------------------------------------
     * CUSTOMER
     * --------------------------------------------------------
     */

    if (!customer) {
      return json(
        {
          success: false,
          error:
            "Customer identifier is required.",
        },
        400,
      );
    }

    /**
     * --------------------------------------------------------
     * PHONE NORMALIZATION
     * --------------------------------------------------------
     */

    if (
      service === "airtime" ||
      service === "data"
    ) {
      const normalizedPhone =
        normalizeNigeriaPhone(
          customer,
        );

      if (!normalizedPhone) {
        return json(
          {
            success: false,
            error:
              "Please provide a valid Nigerian phone number.",
          },
          400,
        );
      }

      customer =
        normalizedPhone;
    }

    if (
      service === "electricity" &&
      customer.length < 5
    ) {
      return json(
        {
          success: false,
          error:
            "Please provide a valid meter number.",
        },
        400,
      );
    }

    if (
      service === "cable" &&
      customer.length < 5
    ) {
      return json(
        {
          success: false,
          error:
            "Please provide a valid smartcard or decoder number.",
        },
        400,
      );
    }

    if (
      service === "internet" &&
      customer.length < 3
    ) {
      return json(
        {
          success: false,
          error:
            "Please provide a valid internet account number.",
        },
        400,
      );
    }

    /**
     * ========================================================
     * FETCH CATALOGUE AGAIN
     * ========================================================
     *
     * This is deliberately done during payment.
     *
     * The frontend's displayed price is NEVER trusted.
     */

    const itemsResult =
      await fetchBillItems(
        billerCode,
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
            itemsResult.body?.message ??
            "Unable to verify selected bill package.",

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

    /**
     * ========================================================
     * FIND EXACT ITEM
     * ========================================================
     */

    const selectedItem =
      billItems.find(
        (item: any) =>
          extractItemCode(
            item,
          ) === itemCode,
      );

    if (!selectedItem) {
      return json(
        {
          success: false,

          error:
            "The selected bill package is not available for this provider.",

          biller_code:
            billerCode,

          item_code:
            itemCode,

          available_items:
            billItems.length,
        },
        400,
      );
    }

    /**
     * ========================================================
     * VERIFY ITEM BELONGS TO BILLER
     * ========================================================
     */

    const itemBiller =
      extractBillerCode(
        selectedItem,
      );

    if (
      itemBiller &&
      itemBiller !== billerCode
    ) {
      return json(
        {
          success: false,

          error:
            "The selected bill package does not belong to the selected provider.",

          biller_code:
            billerCode,

          item_code:
            itemCode,

          item_biller_code:
            itemBiller,
        },
        400,
      );
    }

    /**
     * ========================================================
     * AUTHORITATIVE PROVIDER AMOUNT
     * ========================================================
     */

    const providerAmount =
      extractAmount(
        selectedItem,
      );

    if (providerAmount === null) {
      return json(
        {
          success: false,

          error:
            "Flutterwave did not return a valid price for the selected bill package.",

          item_code:
            itemCode,

          biller_code:
            billerCode,

          provider_item:
            selectedItem,
        },
        400,
      );
    }

    /**
     * ========================================================
     * SELLING PRICE
     * ========================================================
     */

    const markup =
      service === "data"
        ? DATA_PLAN_MARKUP
        : 0;

    const sellingPrice =
      Number(
        (
          providerAmount +
          markup
        ).toFixed(2),
      );

    const profit =
      Number(
        (
          sellingPrice -
          providerAmount
        ).toFixed(2),
      );

    const planName =
      extractItemName(
        selectedItem,
      );

    const validity =
      extractValidity(
        selectedItem,
      );

    const providerType =
      extractProviderType(
        selectedItem,
      );

    const period =
      service === "data"
        ? classifyPlanPeriod(
            selectedItem,
          )
        : "other";

    /**
     * ========================================================
     * CUSTOMER VALIDATION
     * ========================================================
     */

    let validationData:
      any = null;

    if (
      shouldValidateCustomer(
        service,
      )
    ) {
      const validation =
        await validateBillCustomer(
          itemCode,
          customer,
        );

      console.log(
        "Flutterwave validation:",
        JSON.stringify({
          service,
          biller_code:
            billerCode,
          item_code:
            itemCode,
          customer,
          ok:
            validation.ok,
          status:
            validation.status,
          body:
            validation.body,
        }),
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
              validation.body?.message ??
              "Unable to validate customer details.",

            provider_status:
              validation.status,

            validation_data:
              validation.body?.data ??
              null,

            provider_response:
              validation.body ??
              null,
          },
          400,
        );
      }

      validationData =
        validation.body?.data ??
        null;
    }

    /**
     * ========================================================
     * UNIQUE REFERENCE
     * ========================================================
     */

    const reference =
      `BILL_${crypto
        .randomUUID()
        .replace(/-/g, "")}`;

    /**
     * ========================================================
     * TRANSACTION METADATA
     * ========================================================
     */

    const transactionMetadata = {
      phone: customer,

      customer,

      service,

      category:
        expectedCategory,

      provider:
        "flutterwave",

      biller_code:
        billerCode,

      item_code:
        itemCode,

      plan_name:
        planName,

      plan_validity:
        validity,

      plan_period:
        period,

      plan_period_label:
        periodLabel(period),

      provider_type:
        providerType || null,

      provider_amount:
        providerAmount,

      selling_price:
        sellingPrice,

      profit,

      markup,

      currency:
        "NGN",

      validation:
        validationData,

      reconciliation_required:
        true,
    };

    /**
     * ========================================================
     * DEBIT CUSTOMER WALLET
     * ========================================================
     *
     * IMPORTANT:
     *
     * Customer is charged sellingPrice.
     *
     * Flutterwave receives providerAmount.
     */

    const {
      data: debit,
      error: debitError,
    } =
      await admin.rpc(
        "debit_wallet",
        {
          _user_id:
            user.id,

          _amount:
            sellingPrice,

          _description:
            service === "data"
              ? `Data bundle - ${planName}`
              : `Bill payment (${service})`,

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

    if (debitError) {
      console.error(
        "debit_wallet failed:",
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

          details:
            debitError.message ??
            null,
        },
        400,
      );
    }

    /**
     * ========================================================
     * FLUTTERWAVE PAYMENT
     * ========================================================
     */

    const providerPath =
      `/billers/${encodeURIComponent(
        billerCode,
      )}/items/${encodeURIComponent(
        itemCode,
      )}/payment`;

    /**
     * Flutterwave requires the bill catalogue amount.
     *
     * Therefore:
     *
     * Customer:
     *   ₦550
     *
     * Flutterwave:
     *   ₦500
     *
     * The ₦50 difference is IyanjuPay's markup.
     */

    const paymentBody: Record<
      string,
      unknown
    > = {
      country,

      customer_id:
        customer,

      amount:
        providerAmount,

      reference,
    };

    /**
     * Do NOT invent the data type.
     *
     * Only forward it when Flutterwave supplied one.
     */

    if (
      service === "data" &&
      providerType
    ) {
      paymentBody.type =
        providerType;
    }

    const callbackUrl =
      Deno.env.get(
        "FLUTTERWAVE_BILL_CALLBACK_URL",
      );

    if (callbackUrl) {
      paymentBody.callback_url =
        callbackUrl;
    }

    console.log(
      "Sending Flutterwave bill payment:",
      JSON.stringify({
        path:
          providerPath,

        customer_id:
          customer,

        provider_amount:
          providerAmount,

        selling_price:
          sellingPrice,

        reference,

        type:
          paymentBody.type ??
          null,
      }),
    );

    /**
     * ========================================================
     * PROVIDER REQUEST
     * ========================================================
     */

    let providerResult:
      any = null;

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
      /**
       * Network failure is ambiguous.
       *
       * NEVER refund here.
       */

      console.error(
        "Flutterwave payment request exception:",
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
            "flutterwave",

          metadata: {
            ...transactionMetadata,

            provider_error:
              providerError instanceof
              Error
                ? providerError.message
                : String(
                    providerError,
                  ),

            reconciliation_required:
              true,

            last_checked_at:
              new Date().toISOString(),
          },
        },
      );

      return json(
        {
          success: true,

          message:
            "Bill payment is being verified. Your wallet has been debited and the transaction will be reconciled.",

          reference,

          transaction_id:
            debit?.id ??
            null,

          amount:
            sellingPrice,

          selling_price:
            sellingPrice,

          provider_amount:
            providerAmount,

          profit,

          currency:
            "NGN",

          service,

          biller_code:
            billerCode,

          item_code:
            itemCode,

          phone:
            customer,

          plan_name:
            planName,

          period,

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

    const providerHttpStatus =
      Number(
        providerResult?.status ??
          0,
      );

    console.log(
      "Flutterwave bill payment response:",
      JSON.stringify({
        reference,

        provider_amount:
          providerAmount,

        selling_price:
          sellingPrice,

        ...providerDebug(
          providerResult,
        ),
      }),
    );

    /**
     * ========================================================
     * SUCCESS
     * ========================================================
     */

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
            ...transactionMetadata,

            flutterwave:
              providerBody,

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
          ),

        reference,

        transaction_id:
          debit?.id ??
          null,

        provider_reference:
          providerReference,

        amount:
          sellingPrice,

        selling_price:
          sellingPrice,

        provider_amount:
          providerAmount,

        profit,

        currency:
          "NGN",

        service,

        biller_code:
          billerCode,

        item_code:
          itemCode,

        phone:
          customer,

        plan_name:
          planName,

        plan_validity:
          validity,

        period,

        period_label:
          periodLabel(period),

        status:
          "successful",

        data:
          providerData,
      });
    }

    /**
     * ========================================================
     * DEFINITIVE FAILURE
     * ========================================================
     *
     * A 4xx response is a definitive API rejection.
     *
     * 5xx/network/unknown:
     *   DO NOT refund immediately.
     *
     * Flutterwave may have processed the transaction.
     */

    const definitiveHttpFailure =
      providerHttpStatus >= 400 &&
      providerHttpStatus < 500;

    if (
      isFailedStatus(
        providerStatus,
      ) ||
      definitiveHttpFailure
    ) {
      console.error(
        "Flutterwave bill payment definitively failed:",
        JSON.stringify({
          reference,

          provider_status:
            providerStatus,

          provider_http_status:
            providerHttpStatus,

          provider_body:
            providerBody,
        }),
      );

      const refund =
        await refundBillTransaction(
          admin,
          user.id,
          sellingPrice,
          reference,
          {
            ...transactionMetadata,

            flutterwave:
              providerBody,
          },
        );

      if (!refund.success) {
        console.error(
          "CRITICAL: automatic refund failed:",
          refund.error,
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

              flutterwave:
                providerBody,

              refund_required:
                true,

              refund_error:
                String(
                  refund.error ??
                    "Unknown refund error",
                ),

              reconciliation_required:
                false,
            },
          },
        );

        return json(
          {
            success: false,

            error:
              "Bill payment failed and automatic refund could not be completed. Please contact support.",

            reference,

            amount:
              sellingPrice,

            refund_required:
              true,

            provider_status:
              providerStatus,

            provider_http_status:
              providerHttpStatus,
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
            ...transactionMetadata,

            flutterwave:
              providerBody,

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
            "Bill payment failed. Your wallet has been refunded.",

          refunded:
            true,

          refund_reference:
            refund.reference,

          reference,

          amount:
            sellingPrice,

          selling_price:
            sellingPrice,

          provider_amount:
            providerAmount,

          profit,

          service,

          biller_code:
            billerCode,

          item_code:
            itemCode,

          phone:
            customer,

          plan_name:
            planName,

          period,

          status:
            "failed",

          provider_status:
            providerStatus,

          provider_http_status:
            providerHttpStatus,

          provider_response:
            providerBody,
        },
        400,
      );
    }

    /**
     * ========================================================
     * PENDING / AMBIGUOUS
     * ========================================================
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

          flutterwave:
            providerBody,

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
          getProviderMessage(
            providerBody,
          ) ||
          "Bill payment is pending verification.",

        reference,

        transaction_id:
          debit?.id ??
          null,

        provider_reference:
          providerReference,

        amount:
          sellingPrice,

        selling_price:
          sellingPrice,

        provider_amount:
          providerAmount,

        profit,

        currency:
          "NGN",

        service,

        biller_code:
          billerCode,

        item_code:
          itemCode,

        phone:
          customer,

        plan_name:
          planName,

        plan_validity:
          validity,

        period,

        period_label:
          periodLabel(period),

        status:
          "pending",

        reconciliation_required:
          true,

        provider_http_status:
          providerHttpStatus,

        data:
          providerData,
      },
      202,
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
