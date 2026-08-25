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
 * Production bill-payment Edge Function.
 *
 * SUPPORTED:
 *   - Airtime
 *   - Data
 *   - Electricity
 *   - Cable
 *   - Internet
 *
 * ACTIONS:
 *   - categories
 *   - billers
 *   - items
 *   - validate
 *   - status
 *   - pay
 *   - service
 *
 * PRICING:
 *
 *   Flutterwave price = provider amount
 *   IyanjuPay price   = provider amount + ₦50
 *
 * Example:
 *
 *   Flutterwave: ₦500
 *   User pays:   ₦550
 *   Flutterwave receives: ₦500
 *   IyanjuPay markup: ₦50
 *
 * IMPORTANT:
 *   - Pricing is verified server-side.
 *   - Client cannot remove the ₦50 markup.
 *   - Wallet is debited for the CUSTOMER amount.
 *   - Flutterwave receives only the PROVIDER amount.
 *   - Definitive Flutterwave rejection => automatic refund.
 *   - Network/timeout/5xx/ambiguous response => PENDING.
 *   - Airtime/Data do NOT require customer validation.
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

/**
 * IyanjuPay markup.
 */
const BILL_MARKUP = 50;

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

// ============================================================
// HELPERS
// ============================================================

function cleanString(
  value: unknown,
): string {
  return String(
    value ?? "",
  ).trim();
}

function normalizeService(
  value: unknown,
): ServiceType | null {
  const service =
    cleanString(
      value,
    ).toLowerCase();

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

function normalizeStatus(
  value: unknown,
): string {
  return cleanString(
    value,
  ).toLowerCase();
}

function isSuccessfulStatus(
  value: unknown,
): boolean {
  return SUCCESS_STATUSES.has(
    normalizeStatus(
      value,
    ),
  );
}

function isFailedStatus(
  value: unknown,
): boolean {
  return FAILED_STATUSES.has(
    normalizeStatus(
      value,
    ),
  );
}

function isPendingStatus(
  value: unknown,
): boolean {
  const status =
    normalizeStatus(
      value,
    );

  return (
    !status ||
    PENDING_STATUSES.has(
      status,
    )
  );
}

function normalizeAmount(
  value: unknown,
): number | null {
  const amount =
    Number(value);

  if (
    !Number.isFinite(
      amount,
    ) ||
    amount <= 0
  ) {
    return null;
  }

  return Number(
    amount.toFixed(2),
  );
}

function addMarkup(
  amount: number,
): number {
  return Number(
    (
      amount +
      BILL_MARKUP
    ).toFixed(2),
  );
}

function removeMarkup(
  customerAmount: number,
): number {
  return Number(
    (
      customerAmount -
      BILL_MARKUP
    ).toFixed(2),
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

  for (
    const candidate of candidates
  ) {
    const amount =
      normalizeAmount(
        candidate,
      );

    if (
      amount !== null
    ) {
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

  return (
    reference ||
    null
  );
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
    ) ||
    "pending"
  );
}

function getProviderData(
  body: any,
): any {
  return (
    body?.data ??
    null
  );
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

// ============================================================
// TRANSACTION UPDATE
// ============================================================

async function updateTransaction(
  admin: any,
  userId: string,
  reference: string,
  updates: Record<
    string,
    unknown
  >,
): Promise<boolean> {
  try {
    const {
      data,
      error,
    } = await admin
      .from("transactions")
      .update(updates)
      .eq(
        "user_id",
        userId,
      )
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

// ============================================================
// GET LOCAL TRANSACTION
// ============================================================

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
    .eq(
      "user_id",
      userId,
    )
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

// ============================================================
// REFUND
// ============================================================

async function refundBillTransaction(
  admin: any,
  userId: string,
  amount: number,
  reference: string,
  metadata: Record<
    string,
    unknown
  >,
) {
  const refundReference =
    `REFUND_${reference}`;

  try {
    const {
      error,
    } = await admin.rpc(
      "refund_wallet",
      {
        _user_id:
          userId,

        _amount:
          amount,

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
      success:
        !error,

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
      success:
        false,

      reference:
        refundReference,

      error,
    };
  }
}

// ============================================================
// FLUTTERWAVE BILL HELPERS
// ============================================================

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
      Boolean(
        result?.ok,
      ),

    http_status:
      result?.status ??
      null,

    provider_status:
      extractProviderStatus(
        result?.body ??
          {},
      ),

    message:
      getProviderMessage(
        result?.body ??
          {},
      ),

    body:
      result?.body ??
      null,
  };
}

// ============================================================
// SERVER
// ============================================================

Deno.serve(
  async (req) => {
    // ========================================================
    // CORS
    // ========================================================

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

    // ========================================================
    // METHOD
    // ========================================================

    if (
      req.method !==
      "POST"
    ) {
      return json(
        {
          success:
            false,

          error:
            "Method not allowed",
        },
        405,
      );
    }

    try {
      // ======================================================
      // AUTH
      // ======================================================

      const user =
        await getUser(
          req,
        );

      if (!user) {
        return json(
          {
            success:
              false,

            error:
              "Unauthorized",
          },
          401,
        );
      }

      // ======================================================
      // BODY
      // ======================================================

      const body =
        await req
          .json()
          .catch(
            () => ({}),
          );

      if (
        !body ||
        typeof body !==
          "object" ||
        Array.isArray(
          body,
        )
      ) {
        return json(
          {
            success:
              false,

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

      console.log(
        "Flutterwave bills request:",
        JSON.stringify({
          action,

          user_id:
            user.id,

          service:
            body?.service,

          amount:
            body?.amount,

          biller_code:
            body?.biller_code ??
            body?.billerCode,

          item_code:
            body?.item_code ??
            body?.itemCode,

          country:
            body?.country,
        }),
      );

      // ======================================================
      // CATEGORIES
      // ======================================================

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
              success:
                false,

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
          success:
            true,

          categories:
            Array.isArray(
              result.body?.data,
            )
              ? result.body.data
              : [],
        });
      }

      // ======================================================
      // BILLERS
      // ======================================================

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
              success:
                false,

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
              success:
                false,

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
          success:
            true,

          category,

          billers:
            Array.isArray(
              result.body?.data,
            )
              ? result.body.data
              : [],
        });
      }

      // ======================================================
      // ITEMS
      // ======================================================

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
              success:
                false,

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
              success:
                false,

              error:
                result.body
                  ?.message ??
                "Unable to load bill packages",

              biller_code:
                billerCode,

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
          success:
            true,

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

      // ======================================================
      // MANUAL VALIDATION
      // ======================================================

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
              success:
                false,

              error:
                "item_code is required",
            },
            400,
          );
        }

        if (!customer) {
          return json(
            {
              success:
                false,

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
              success:
                false,

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

              provider_response:
                validation.body ??
                null,
            },
            400,
          );
        }

        return json({
          success:
            true,

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

      // ======================================================
      // STATUS
      // ======================================================

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
              success:
                false,

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
              success:
                false,

              error:
                "Unable to retrieve transaction",
            },
            500,
          );
        }

        if (!txn) {
          return json(
            {
              success:
                false,

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
            success:
              true,

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
            success:
              true,

            reference,

            local_status:
              txn.status,

            provider_status:
              "unavailable",

            reconciliation_required:
              true,

            transaction:
              txn,

            provider_response:
              providerResult.body ??
              null,
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

        // ----------------------------------------------------
        // SUCCESS
        // ----------------------------------------------------

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

                reconciled_at:
                  new Date().toISOString(),

                reconciliation_required:
                  false,
              },
            },
          );

          return json({
            success:
              true,

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

        // ----------------------------------------------------
        // FAILED
        // ----------------------------------------------------

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
                success:
                  false,

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
                    refund.error,
                },
              },
            );

            return json(
              {
                success:
                  false,

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
            success:
              true,

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

        // ----------------------------------------------------
        // PENDING
        // ----------------------------------------------------

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
          success:
            true,

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

      // ======================================================
      // NORMAL PAYMENT
      // ======================================================

      if (
        action !==
          "pay" &&
        action !==
          "service"
      ) {
        return json(
          {
            success:
              false,

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

      // ======================================================
      // SERVICE
      // ======================================================

      const service =
        normalizeService(
          body?.service,
        );

      if (!service) {
        return json(
          {
            success:
              false,

            error:
              `The ${
                cleanString(
                  body?.service,
                ) ||
                "unknown"
              } service is not available.`,

            service:
              cleanString(
                body?.service,
              ) ||
              "unknown",

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

      /**
       * The frontend amount is the CUSTOMER amount.
       *
       * Example:
       *
       * frontend amount = 550
       * provider amount = 500
       */
      const suppliedCustomerAmount =
        normalizeAmount(
          body?.amount ??
            details?.customer_amount ??
            details?.amount,
        );

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

      // ======================================================
      // COUNTRY
      // ======================================================

      if (
        country !==
        "NG"
      ) {
        return json(
          {
            success:
              false,

            error:
              "Flutterwave bill payments currently support NG billers only.",
          },
          400,
        );
      }

      // ======================================================
      // BILLER
      // ======================================================

      if (!billerCode) {
        return json(
          {
            success:
              false,

            error:
              "Please select a valid bill provider.",

            service,

            category:
              expectedCategory,
          },
          400,
        );
      }

      // ======================================================
      // ITEM
      // ======================================================

      if (!itemCode) {
        return json(
          {
            success:
              false,

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

      // ======================================================
      // CUSTOMER
      // ======================================================

      if (!customer) {
        return json(
          {
            success:
              false,

            error:
              "Customer identifier is required.",
          },
          400,
        );
      }

      // ======================================================
      // CUSTOMER FORMAT
      // ======================================================

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

        if (
          !/^(?:\+?234|0)[0-9]{10}$/.test(
            customer,
          )
        ) {
          return json(
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
          "electricity" &&
        customer.length <
          5
      ) {
        return json(
          {
            success:
              false,

            error:
              "Please provide a valid meter number.",
          },
          400,
        );
      }

      if (
        service ===
          "cable" &&
        customer.length <
          5
      ) {
        return json(
          {
            success:
              false,

            error:
              "Please provide a valid smartcard or decoder number.",
          },
          400,
        );
      }

      if (
        service ===
          "internet" &&
        customer.length <
          3
      ) {
        return json(
          {
            success:
              false,

            error:
              "Please provide a valid internet account number.",
          },
          400,
        );
      }

      // ======================================================
      // FETCH FRESH FLUTTERWAVE ITEMS
      // ======================================================

      const itemsResult =
        await fetchBillItems(
          billerCode,
        );

      console.log(
        "Selected biller items:",
        JSON.stringify({
          biller_code:
            billerCode,

          ok:
            itemsResult.ok,

          status:
            itemsResult.status,

          body:
            itemsResult.body,
        }),
      );

      if (
        !itemsResult.ok ||
        itemsResult.body?.status !==
          "success"
      ) {
        return json(
          {
            success:
              false,

            error:
              itemsResult.body
                ?.message ??
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

      // ======================================================
      // FIND SELECTED ITEM
      // ======================================================

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
            success:
              false,

            error:
              "The selected bill package is not available for this provider.",

            biller_code:
              billerCode,

            item_code:
              itemCode,
          },
          400,
        );
      }

      // ======================================================
      // VERIFY ITEM BELONGS TO BILLER
      // ======================================================

      const itemBiller =
        extractBillerCode(
          selectedItem,
        );

      if (
        itemBiller &&
        itemBiller !==
          billerCode
      ) {
        return json(
          {
            success:
              false,

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

      // ======================================================
      // GET TRUE FLUTTERWAVE PRICE
      // ======================================================

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
            success:
              false,

            error:
              "Flutterwave did not return a valid price for the selected package.",

            biller_code:
              billerCode,

            item_code:
              itemCode,
          },
          400,
        );
      }

      // ======================================================
      // CALCULATE CUSTOMER PRICE
      // ======================================================

      const customerAmount =
        addMarkup(
          providerAmount,
        );

      console.log(
        "Bill pricing:",
        JSON.stringify({
          provider_amount:
            providerAmount,

          markup:
            BILL_MARKUP,

          customer_amount:
            customerAmount,
        }),
      );

      // ======================================================
      // VERIFY FRONTEND AMOUNT
      // ======================================================

      if (
        suppliedCustomerAmount ===
        null
      ) {
        return json(
          {
            success:
              false,

            error:
              "A valid bill amount is required.",

            expected_amount:
              customerAmount,
          },
          400,
        );
      }

      if (
        Math.abs(
          suppliedCustomerAmount -
            customerAmount,
        ) >
        0.009
      ) {
        return json(
          {
            success:
              false,

            error:
              `The selected bill package costs ₦${customerAmount.toFixed(
                2,
              )} including the ₦${BILL_MARKUP} service markup.`,

            provider_amount:
              providerAmount,

            markup:
              BILL_MARKUP,

            expected_amount:
              customerAmount,

            supplied_amount:
              suppliedCustomerAmount,
          },
          400,
        );
      }

      // ======================================================
      // CUSTOMER VALIDATION
      // ======================================================

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
              success:
                false,

              error:
                validation.body
                  ?.message ??
                "Unable to validate customer details.",

              provider_status:
                validation.status,

              validation_data:
                validation.body
                  ?.data ??
                null,

              provider_response:
                validation.body ??
                null,
            },
            400,
          );
        }

        validationData =
          validation.body
            ?.data ??
          null;
      } else {
        console.log(
          "Skipping Flutterwave customer validation for Airtime/Data:",
          {
            service,
            item_code:
              itemCode,
            customer,
          },
        );
      }

      // ======================================================
      // UNIQUE REFERENCE
      // ======================================================

      const reference =
        `BILL_${crypto
          .randomUUID()
          .replace(
            /-/g,
            "",
          )}`;

      // ======================================================
      // DEBIT USER FOR CUSTOMER AMOUNT
      // ======================================================

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

            /**
             * IMPORTANT:
             *
             * Debit ₦550, not ₦500.
             */
            _amount:
              customerAmount,

            _description:
              `Bill payment (${service})`,

            _idempotency_key:
              reference,

            _reference:
              reference,

            _category:
              "bill_payment",

            _metadata: {
              service,

              category:
                expectedCategory,

              biller_code:
                billerCode,

              item_code:
                itemCode,

              customer,

              country,

              /**
               * Pricing breakdown.
               */
              provider_amount:
                providerAmount,

              markup:
                BILL_MARKUP,

              customer_amount:
                customerAmount,

              validation:
                validationData,
            },
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
            success:
              false,

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

      console.log(
        "Wallet debited for bill:",
        JSON.stringify({
          reference,

          debit,

          provider_amount:
            providerAmount,

          markup:
            BILL_MARKUP,

          customer_amount:
            customerAmount,

          service,
        }),
      );

      // ======================================================
      // FLUTTERWAVE PAYMENT BODY
      // ======================================================

      /**
       * VERY IMPORTANT:
       *
       * Flutterwave receives providerAmount.
       *
       * It does NOT receive customerAmount.
       *
       * Example:
       *
       * User wallet:
       *   ₦550
       *
       * Flutterwave:
       *   ₦500
       */

      const providerPath =
        `/billers/${encodeURIComponent(
          billerCode,
        )}/items/${encodeURIComponent(
          itemCode,
        )}/payment`;

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

      const callbackUrl =
        Deno.env.get(
          "FLUTTERWAVE_BILL_CALLBACK_URL",
        );

      if (
        callbackUrl
      ) {
        paymentBody.callback_url =
          callbackUrl;
      }

      console.log(
        "Sending Flutterwave bill payment:",
        JSON.stringify({
          path:
            providerPath,

          body:
            paymentBody,

          pricing: {
            provider_amount:
              providerAmount,

            markup:
              BILL_MARKUP,

            customer_amount:
              customerAmount,
          },
        }),
      );

      // ======================================================
      // FLUTTERWAVE PAYMENT
      // ======================================================

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
         * Network errors are ambiguous.
         *
         * DO NOT refund automatically.
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
              service,

              category:
                expectedCategory,

              biller_code:
                billerCode,

              item_code:
                itemCode,

              customer,

              provider_amount:
                providerAmount,

              markup:
                BILL_MARKUP,

              customer_amount:
                customerAmount,

              provider_error:
                providerError instanceof
                Error
                  ? providerError.message
                  : String(
                      providerError,
                    ),

              reconciliation_required:
                true,

              created_at:
                new Date().toISOString(),
            },
          },
        );

        return json(
          {
            success:
              true,

            message:
              "Bill payment is being verified. Your wallet has been debited and the transaction will be reconciled.",

            reference,

            transaction_id:
              debit?.id ??
              null,

            amount:
              customerAmount,

            provider_amount:
              providerAmount,

            markup:
              BILL_MARKUP,

            currency:
              "NGN",

            service,

            biller_code:
              billerCode,

            item_code:
              itemCode,

            customer,

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

      console.log(
        "Flutterwave bill payment response:",
        JSON.stringify({
          reference,

          provider_amount:
            providerAmount,

          customer_amount:
            customerAmount,

          ...providerDebug(
            providerResult,
          ),
        }),
      );

      // ======================================================
      // SUCCESS
      // ======================================================

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
              service,

              category:
                expectedCategory,

              biller_code:
                billerCode,

              item_code:
                itemCode,

              customer,

              provider_amount:
                providerAmount,

              markup:
                BILL_MARKUP,

              customer_amount:
                customerAmount,

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
          success:
            true,

          message:
            getProviderMessage(
              providerBody,
            ) ||
            "Bill payment successful.",

          reference,

          transaction_id:
            debit?.id ??
            null,

          provider_reference:
            providerReference,

          /**
           * Amount shown to user.
           */
          amount:
            customerAmount,

          /**
           * Actual Flutterwave amount.
           */
          provider_amount:
            providerAmount,

          markup:
            BILL_MARKUP,

          currency:
            "NGN",

          service,

          biller_code:
            billerCode,

          item_code:
            itemCode,

          customer,

          status:
            "successful",

          data:
            providerData,
        });
      }

      // ======================================================
      // DEFINITIVE FAILURE
      // ======================================================

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

        /**
         * Refund the FULL customer amount.
         *
         * Example:
         *
         * User was debited ₦550.
         * Flutterwave failed.
         * Refund = ₦550.
         */

        const refund =
          await refundBillTransaction(
            admin,
            user.id,
            customerAmount,
            reference,
            {
              service,

              category:
                expectedCategory,

              biller_code:
                billerCode,

              item_code:
                itemCode,

              customer,

              provider_amount:
                providerAmount,

              markup:
                BILL_MARKUP,

              customer_amount:
                customerAmount,

              flutterwave:
                providerBody,
            },
          );

        if (
          !refund.success
        ) {
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
                service,

                category:
                  expectedCategory,

                biller_code:
                  billerCode,

                item_code:
                  itemCode,

                customer,

                provider_amount:
                  providerAmount,

                markup:
                  BILL_MARKUP,

                customer_amount:
                  customerAmount,

                flutterwave:
                  providerBody,

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
              success:
                false,

              error:
                "Bill payment failed and automatic refund could not be completed. Please contact support.",

              reference,

              amount:
                customerAmount,

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
              service,

              category:
                expectedCategory,

              biller_code:
                billerCode,

              item_code:
                itemCode,

              customer,

              provider_amount:
                providerAmount,

              markup:
                BILL_MARKUP,

              customer_amount:
                customerAmount,

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
            success:
              false,

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
              customerAmount,

            provider_amount:
              providerAmount,

            markup:
              BILL_MARKUP,

            service,

            biller_code:
              billerCode,

            item_code:
              itemCode,

            customer,

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

      // ======================================================
      // PENDING / AMBIGUOUS
      // ======================================================

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
            service,

            category:
              expectedCategory,

            biller_code:
              billerCode,

            item_code:
              itemCode,

            customer,

            provider_amount:
              providerAmount,

            markup:
              BILL_MARKUP,

            customer_amount:
              customerAmount,

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
          success:
            true,

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
            customerAmount,

          provider_amount:
            providerAmount,

          markup:
            BILL_MARKUP,

          currency:
            "NGN",

          service,

          biller_code:
            billerCode,

          item_code:
            itemCode,

          customer,

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
          success:
            false,

          error:
            error?.message ??
            "Unexpected error",
        },
        500,
      );
    }
  },
);
