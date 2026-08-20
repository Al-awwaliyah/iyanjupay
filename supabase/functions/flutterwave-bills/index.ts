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
 * Supported:
 *   - Airtime
 *   - Data
 *   - Electricity
 *   - Cable
 *   - Internet
 *
 * Actions:
 *   categories
 *   billers
 *   items
 *   validate
 *   status
 *   service
 *
 * Payment flow:
 *
 *   1. Validate request
 *   2. Validate customer
 *   3. Debit IyanjuPay wallet
 *   4. Send payment to Flutterwave
 *   5. Successful provider response → successful
 *   6. Definitive provider failure → refund
 *   7. Ambiguous/network response → pending
 *   8. Status endpoint reconciles pending transactions
 */

// ============================================================
// TYPES
// ============================================================

type ServiceType =
  | "airtime"
  | "data"
  | "electricity"
  | "cable"
  | "internet";

// ============================================================
// CONSTANTS
// ============================================================

const SUPPORTED_SERVICES: ServiceType[] = [
  "airtime",
  "data",
  "electricity",
  "cable",
  "internet",
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

const SUCCESS_STATUSES = new Set([
  "successful",
  "success",
  "completed",
]);

const FAILED_STATUSES = new Set([
  "failed",
  "failure",
  "error",
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
    cleanString(value).toLowerCase();

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
  const status =
    normalizeStatus(value);

  return (
    !status ||
    PENDING_STATUSES.has(status)
  );
}

function normalizeAmount(
  value: unknown,
): number | null {
  const amount =
    Number(value);

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
    reference || null
  );
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

  return (
    status || "pending"
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

// ============================================================
// DATABASE HELPERS
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
      );

    if (error) {
      console.error(
        "Transaction update failed:",
        error,
      );

      return false;
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
}

// ============================================================
// FLUTTERWAVE HELPERS
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

// ============================================================
// MAIN FUNCTION
// ============================================================

Deno.serve(
  async (req) => {
    // ========================================================
    // 0. CORS
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
    // 1. METHOD
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
      // 2. AUTHENTICATION
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
      // 3. REQUEST BODY
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

      // ======================================================
      // 4. CATEGORIES
      // ======================================================

      if (
        action ===
        "categories"
      ) {
        const result =
          await flw(
            "/bill-categories?country=NG",
          );

        console.log(
          "Flutterwave categories:",
          JSON.stringify({
            ok:
              result.ok,
            status:
              result.status,
            body:
              result.body,
          }),
        );

        if (
          !result.ok ||
          result.body
            ?.status !==
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

              provider_body:
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
              result.body
                ?.data,
            )
              ? result.body
                  .data
              : [],
        });
      }

      // ======================================================
      // 5. BILLERS
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

        console.log(
          "Flutterwave billers:",
          JSON.stringify({
            category,
            ok:
              result.ok,
            status:
              result.status,
            body:
              result.body,
          }),
        );

        if (
          !result.ok ||
          result.body
            ?.status !==
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

              provider_body:
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
              result.body
                ?.data,
            )
              ? result.body
                  .data
              : [],
        });
      }

      // ======================================================
      // 6. BILL ITEMS
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

        console.log(
          "Flutterwave bill items:",
          JSON.stringify({
            biller_code:
              billerCode,
            ok:
              result.ok,
            status:
              result.status,
            body:
              result.body,
          }),
        );

        if (
          !result.ok ||
          result.body
            ?.status !==
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

              provider_body:
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
              result.body
                ?.data,
            )
              ? result.body
                  .data
              : [],
        });
      }

      // ======================================================
      // 7. VALIDATE CUSTOMER
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

        console.log(
          "Flutterwave customer validation:",
          JSON.stringify({
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
          validation.body
            ?.status !==
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
      // 8. STATUS
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
          console.error(
            "Transaction lookup failed:",
            txnError,
          );

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

        console.log(
          "Flutterwave bill status:",
          JSON.stringify({
            reference,

            flutterwave_reference:
              flutterwaveReference,

            ok:
              providerResult.ok,

            status:
              providerResult.status,

            body:
              providerResult.body,
          }),
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

        // ====================================================
        // STATUS SUCCESS
        // ====================================================

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

              provider:
                "flutterwave",

              provider_reference:
                newProviderReference ||
                providerReference ||
                null,
            },

            provider_data:
              providerData,
          });
        }

        // ====================================================
        // STATUS FAILED
        // ====================================================

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
            amount === null
          ) {
            console.error(
              "CRITICAL: transaction has invalid amount during refund:",
              txn,
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
                    "Invalid transaction amount",
                },
              },
            );

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

        // ====================================================
        // STATUS PENDING
        // ====================================================

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
      // 9. NORMAL SERVICE PAYMENT
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
              `The ${cleanString(
                body?.service,
              ) || "unknown"} service is not available.`,

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

      let amount =
        normalizeAmount(
          body?.amount ??
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
            details?.smartcard_number ??
            details?.accountNumber ??
            details?.account_number,
        );

      const paymentType =
        cleanString(
          body?.type ??
            details?.type,
        );

      const expectedCategory =
        SERVICE_CATEGORY_MAP[
          service
        ];

      // ======================================================
      // DEBUG REQUEST
      // ======================================================

      console.log(
        "Flutterwave bill payment request:",
        JSON.stringify({
          action,
          service,
          amount,
          country,
          biller_code:
            billerCode,
          item_code:
            itemCode,
          customer,
          payment_type:
            paymentType,
          category:
            expectedCategory,
        }),
      );

      // ======================================================
      // 10. COUNTRY
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
      // 11. BILLER
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
      // 12. ITEM
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
      // 13. CUSTOMER
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
      // 14. CUSTOMER FORMAT
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

        // Normalize to +234 format
        if (
          /^0\d{10}$/.test(
            customer,
          )
        ) {
          customer =
            `+234${customer.substring(
              1,
            )}`;
        } else if (
          /^234\d{10}$/.test(
            customer,
          )
        ) {
          customer =
            `+${customer}`;
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
      // 15. FETCH BILL ITEMS
      // ======================================================

      const itemsResult =
        await fetchBillItems(
          billerCode,
        );

      console.log(
        "Flutterwave selected biller items response:",
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
        itemsResult.body
          ?.status !==
          "success"
      ) {
        console.error(
          "Unable to retrieve bill items:",
          JSON.stringify(
            itemsResult.body,
          ),
        );

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

            provider_body:
              itemsResult.body ??
              null,
          },
          502,
        );
      }

      const billItems =
        Array.isArray(
          itemsResult.body
            ?.data,
        )
          ? itemsResult.body
              .data
          : [];

      const selectedItem =
        billItems.find(
          (item: any) =>
            extractItemCode(
              item,
            ) ===
            itemCode,
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
      // 16. VERIFY ITEM BELONGS TO BILLER
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
          },
          400,
        );
      }

      // ======================================================
      // 17. VERIFY AMOUNT
      // ======================================================

      const itemAmount =
        extractAmount(
          selectedItem,
        );

      if (
        itemAmount !==
        null
      ) {
        if (
          amount ===
          null
        ) {
          amount =
            itemAmount;
        } else if (
          Math.abs(
            amount -
              itemAmount,
          ) > 0.009
        ) {
          return json(
            {
              success:
                false,

              error:
                `The selected bill package costs ₦${itemAmount.toFixed(
                  2,
                )}.`,

              expected_amount:
                itemAmount,

              supplied_amount:
                amount,
            },
            400,
          );
        }
      }

      if (
        amount ===
        null
      ) {
        return json(
          {
            success:
              false,

            error:
              "A valid amount is required.",
          },
          400,
        );
      }

      // ======================================================
      // 18. CUSTOMER VALIDATION
      // ======================================================

      const validation =
        await validateBillCustomer(
          itemCode,
          customer,
        );

      console.log(
        "Flutterwave customer validation:",
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
        validation.body
          ?.status !==
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

            provider_body:
              validation.body ??
              null,
          },
          400,
        );
      }

      const validationData =
        validation.body
          ?.data ??
        null;

      // ======================================================
      // 19. CREATE UNIQUE REFERENCE
      // ======================================================

      const reference =
        `BILL_${crypto
          .randomUUID()
          .replace(
            /-/g,
            "",
          )}`;

      // ======================================================
      // 20. DEBIT WALLET
      // ======================================================

      const {
        data: debit,
        error:
          debitError,
      } = await admin.rpc(
        "debit_wallet",
        {
          _user_id:
            user.id,

          _amount:
            amount,

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

            amount,

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
          },
          400,
        );
      }

      console.log(
        "IyanjuPay wallet debited:",
        JSON.stringify({
          reference,

          transaction_id:
            debit?.id ??
            null,

          user_id:
            user.id,

          amount,

          service,
        }),
      );

      // ======================================================
      // 21. PAYMENT BODY
      // ======================================================

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

        amount,

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

      if (
        paymentType
      ) {
        paymentBody.type =
          paymentType;
      }

      // ======================================================
      // 22. LOG EXACT PROVIDER REQUEST
      // ======================================================

      console.log(
        "Flutterwave bill payment REQUEST:",
        JSON.stringify({
          path:
            providerPath,

          body:
            paymentBody,
        }),
      );

      // ======================================================
      // 23. FLUTTERWAVE PAYMENT
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

              amount,

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

            amount,

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

      // ======================================================
      // 24. PROVIDER RESPONSE
      // ======================================================

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

      const providerMessage =
        getProviderMessage(
          providerBody,
        );

      const providerHttpOk =
        providerResult?.ok ===
        true;

      // ======================================================
      // CRITICAL DEBUG LOG
      // ======================================================

      console.log(
        "Flutterwave bill payment FULL RESPONSE:",
        JSON.stringify({
          ok:
            providerHttpOk,

          http_status:
            providerResult?.status,

          provider_status:
            providerStatus,

          provider_reference:
            providerReference,

          reference,

          message:
            providerMessage,

          payment_path:
            providerPath,

          payment_body:
            paymentBody,

          provider_body:
            providerBody,
        }),
      );

      // ======================================================
      // 25. SUCCESS
      // ======================================================

      if (
        providerHttpOk &&
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

              amount,

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
            providerMessage ||
            "Bill payment successful.",

          reference,

          transaction_id:
            debit?.id ??
            null,

          provider_reference:
            providerReference,

          amount,

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
      // 26. DEFINITIVE FAILURE
      // ======================================================

      if (
        isFailedStatus(
          providerStatus,
        )
      ) {
        console.error(
          "Flutterwave bill payment DEFINITIVE FAILURE:",
          JSON.stringify({
            reference,

            provider_http_status:
              providerResult?.status,

            provider_status:
              providerStatus,

            provider_message:
              providerMessage,

            provider_body:
              providerBody,
          }),
        );

        const refund =
          await refundBillTransaction(
            admin,
            user.id,
            amount,
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

              flutterwave:
                providerBody,
            },
          );

        // ====================================================
        // REFUND FAILED
        // ====================================================

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

                amount,

                flutterwave:
                  providerBody,

                refunded:
                  false,

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

              provider_error:
                providerMessage,

              reference,

              amount,

              refund_required:
                true,
            },
            500,
          );
        }

        // ====================================================
        // REFUND SUCCESS
        // ====================================================

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

              amount,

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
              providerMessage ||
              "Bill payment failed. Your wallet has been refunded.",

            provider_error:
              providerMessage,

            refunded:
              true,

            refund_reference:
              refund.reference,

            reference,

            amount,

            service,

            status:
              "failed",
          },
          400,
        );
      }

      // ======================================================
      // 27. PENDING / AMBIGUOUS
      // ======================================================

      console.warn(
        "Flutterwave bill payment is ambiguous/pending:",
        JSON.stringify({
          reference,

          provider_http_status:
            providerResult?.status,

          provider_status:
            providerStatus,

          provider_message:
            providerMessage,

          provider_body:
            providerBody,
        }),
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

            amount,

            flutterwave:
              providerBody,

            reconciliation_required:
              true,

            last_provider_status:
              providerStatus,

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
            providerMessage ||
            "Bill payment is pending verification.",

          reference,

          transaction_id:
            debit?.id ??
            null,

          provider_reference:
            providerReference,

          amount,

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

          data:
            providerData,
        },
        202,
      );
    } catch (
      error: any
    ) {
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
