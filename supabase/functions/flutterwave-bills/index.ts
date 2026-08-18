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
 * Supported:
 *   - Airtime
 *   - Data
 *   - Electricity
 *   - Cable
 *   - Internet
 *
 * Flow:
 *
 * categories
 *      ↓
 * billers
 *      ↓
 * items
 *      ↓
 * validate customer
 *      ↓
 * debit wallet
 *      ↓
 * Flutterwave payment
 *      ↓
 * pending / successful / failed
 *      ↓
 * status verification / webhook
 *      ↓
 * finalize or refund
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

const BILL_STATUS_SUCCESS = [
  "successful",
  "success",
  "completed",
];

const BILL_STATUS_FAILED = [
  "failed",
  "failure",
  "reversed",
  "cancelled",
  "canceled",
];

const BILL_STATUS_PENDING = [
  "pending",
  "processing",
  "queued",
  "initiated",
];

function cleanString(
  value: unknown,
): string {
  return String(value ?? "").trim();
}

function normaliseService(
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

function unsupportedServiceResponse(
  service: string,
) {
  return json(
    {
      success: false,
      error: `The ${service} service is not yet available.`,
      service,
    },
    400,
  );
}

function normaliseBillStatus(
  value: unknown,
): string {
  return cleanString(
    value,
  ).toLowerCase();
}

function isSuccessfulBillStatus(
  value: unknown,
): boolean {
  return BILL_STATUS_SUCCESS.includes(
    normaliseBillStatus(value),
  );
}

function isFailedBillStatus(
  value: unknown,
): boolean {
  return BILL_STATUS_FAILED.includes(
    normaliseBillStatus(value),
  );
}

function isPendingBillStatus(
  value: unknown,
): boolean {
  const status =
    normaliseBillStatus(value);

  return (
    BILL_STATUS_PENDING.includes(
      status,
    ) ||
    !status
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
    const value = Number(candidate);

    if (
      Number.isFinite(value) &&
      value > 0
    ) {
      return Number(
        value.toFixed(2),
      );
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
        data?.tx_ref ??
        data?.customer_reference ??
        body?.reference ??
        "",
    );

  return reference || null;
}

function getTransactionStatus(
  body: any,
): string {
  return (
    cleanString(
      body?.data?.status ??
        body?.data?.transaction_status ??
        body?.status,
    ) || "pending"
  );
}

async function updateTransaction(
  admin: any,
  userId: string,
  reference: string,
  updates: Record<
    string,
    unknown
  >,
) {
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

Deno.serve(
  async (req) => {
    // ============================================================
    // 0. CORS
    // ============================================================

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

    // ============================================================
    // 1. METHOD
    // ============================================================

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
      // ==========================================================
      // 2. AUTHENTICATION
      // ==========================================================

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

      // ==========================================================
      // 3. REQUEST BODY
      // ==========================================================

      const body =
        await req
          .json()
          .catch(
            () => ({}),
          );

      const action =
        cleanString(
          body?.action ||
            "service",
        ).toLowerCase();

      const admin =
        adminClient();

      // ==========================================================
      // 4. CATEGORIES
      // ==========================================================

      if (
        action ===
        "categories"
      ) {
        const result =
          await flw(
            "/bill-categories?country=NG",
          );

        console.log(
          "Flutterwave categories response:",
          JSON.stringify({
            ok:
              result.ok,
            status:
              result.status,
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
              success: false,
              error:
                result.body
                  ?.message ??
                "Unable to load bill categories",
              provider_status:
                result.status,
            },
            502,
          );
        }

        return json({
          success: true,
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

      // ==========================================================
      // 5. BILLERS
      //
      // GET:
      // /bills/{category}/billers?country=NG
      // ==========================================================

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

        console.log(
          "Flutterwave billers response:",
          JSON.stringify({
            category,
            ok:
              result.ok,
            status:
              result.status,
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
              success: false,
              error:
                result.body
                  ?.message ??
                "Unable to load bill providers",
              category,
              provider_status:
                result.status,
            },
            502,
          );
        }

        return json({
          success: true,
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

      // ==========================================================
      // 6. BILL ITEMS
      //
      // Correct Flutterwave endpoint:
      //
      // GET /billers/{biller_code}/items
      //
      // ==========================================================

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
          await flw(
            `/billers/${encodeURIComponent(
              billerCode,
            )}/items`,
          );

        console.log(
          "Flutterwave bill items response:",
          JSON.stringify({
            biller_code:
              billerCode,
            ok:
              result.ok,
            status:
              result.status,
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
              success: false,
              error:
                result.body
                  ?.message ??
                "Unable to load bill packages",
              biller_code:
                billerCode,
              provider_status:
                result.status,
            },
            502,
          );
        }

        const items =
          Array.isArray(
            result.body
              ?.data,
          )
            ? result.body
                .data
            : [];

        return json({
          success: true,
          biller_code:
            billerCode,
          items,
        });
      }

      // ==========================================================
      // 7. VALIDATE CUSTOMER
      //
      // This can also be called directly by the frontend before
      // the wallet is debited.
      // ==========================================================

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
          await flw(
            `/bill-items/${encodeURIComponent(
              itemCode,
            )}/validate?customer=${encodeURIComponent(
              customer,
            )}`,
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
            provider_status:
              validation.body
                ?.status,
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

      // ==========================================================
      // 8. TRANSACTION STATUS
      //
      // First checks local transaction.
      // Then optionally checks Flutterwave.
      //
      // Flutterwave:
      // GET /bills/{reference}?verbose=1
      // ==========================================================

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
          error: txnError,
        } = await admin
          .from(
            "transactions",
          )
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
            user.id,
          )
          .eq(
            "reference_number",
            reference,
          )
          .maybeSingle();

        if (
          txnError
        ) {
          console.error(
            "Local transaction lookup failed:",
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

        const providerReference =
          cleanString(
            txn.provider_reference ??
              "",
          );

        /*
         * Use the customer's reference first.
         * Flutterwave documents this endpoint as:
         *
         * GET /bills/{reference}
         */
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
          "Flutterwave bill status response:",
          JSON.stringify({
            reference,
            flutterwave_reference:
              flutterwaveReference,
            ok:
              providerResult.ok,
            status:
              providerResult.status,
            provider_status:
              providerResult.body
                ?.status,
          }),
        );

        if (
          !providerResult.ok
        ) {
          /*
           * Do not destroy the local transaction merely because
           * a temporary status query failed.
           */
          return json({
            success: true,
            local_status:
              txn.status,
            provider_status:
              "unavailable",
            transaction:
              txn,
          });
        }

        const providerData =
          providerResult.body
            ?.data ??
          null;

        const providerStatus =
          normaliseBillStatus(
            providerData
              ?.status ??
              providerData
                ?.transaction_status ??
              providerResult
                .body
                ?.status,
          );

        /*
         * Only finalize a local transaction when we have a
         * definitive provider result.
         */
        if (
          isSuccessfulBillStatus(
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
                cleanString(
                  providerData
                    ?.flw_ref ??
                    providerData
                      ?.reference ??
                    providerReference,
                ) ||
                null,

              metadata: {
                ...(txn.metadata ??
                  {}),
                flutterwave_status:
                  providerResult
                    .body,
                reconciled_at:
                  new Date().toISOString(),
              },
            },
          );
        } else if (
          isFailedBillStatus(
            providerStatus,
          )
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

              metadata: {
                ...(txn.metadata ??
                  {}),
                flutterwave_status:
                  providerResult
                    .body,
                reconciled_at:
                  new Date().toISOString(),
              },
            },
          );
        }

        return json({
          success: true,
          reference,
          local_status:
            txn.status,
          provider_status:
            providerStatus ||
            "pending",
          transaction:
            txn,
          provider_data:
            providerData,
        });
      }

      // ==========================================================
      // 9. NORMAL SERVICE PAYMENT
      // ==========================================================

      let service =
        normaliseService(
          body?.service,
        );

      const details =
        body?.details &&
        typeof body.details ===
          "object"
          ? body.details
          : {};

      const amountInput =
        body?.amount ??
        details?.amount;

      let amount =
        Number(
          amountInput ?? 0,
        );

      const country =
        cleanString(
          body?.country ??
            details?.country ??
            "NG",
        ).toUpperCase();

      let billerCode =
        cleanString(
          body?.biller_code ??
            body?.billerCode ??
            details?.biller_code ??
            details?.billerCode,
        );

      let itemCode =
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

      // ==========================================================
      // 10. SERVICE
      // ==========================================================

      if (!service) {
        return unsupportedServiceResponse(
          cleanString(
            body?.service,
          ) || "unknown",
        );
      }

      if (
        !SUPPORTED_SERVICES.includes(
          service,
        )
      ) {
        return unsupportedServiceResponse(
          service,
        );
      }

      const expectedCategory =
        SERVICE_CATEGORY_MAP[
          service
        ];

      // ==========================================================
      // 11. COUNTRY
      // ==========================================================

      if (
        country !== "NG"
      ) {
        return json(
          {
            success: false,
            error:
              "Flutterwave bill payments currently support NG billers only.",
          },
          400,
        );
      }

      // ==========================================================
      // 12. BILLER REQUIRED
      // ==========================================================

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

      // ==========================================================
      // 13. ITEM REQUIRED
      // ==========================================================

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

      // ==========================================================
      // 14. CUSTOMER REQUIRED
      // ==========================================================

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

      // ==========================================================
      // 15. CUSTOMER FORMAT
      // ==========================================================

      if (
        service ===
          "airtime" ||
        service === "data"
      ) {
        customer =
          customer.replace(
            /\s+/g,
            "",
          );

        /*
         * Nigerian numbers may be supplied as:
         *
         * 08012345678
         * +2348012345678
         * 2348012345678
         */
        if (
          !/^(?:\+?234|0)[0-9]{10}$/.test(
            customer,
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
      }

      if (
        service ===
          "electricity" &&
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
        service ===
          "internet" &&
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

      // ==========================================================
      // 16. FETCH SELECTED BILL ITEM
      //
      // This protects against users submitting arbitrary amounts
      // for fixed-price products.
      // ==========================================================

      const itemsResult =
        await flw(
          `/billers/${encodeURIComponent(
            billerCode,
          )}/items`,
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
            success: false,
            error:
              itemsResult.body
                ?.message ??
              "Unable to verify selected bill package.",
            provider_status:
              itemsResult.status,
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
            success: false,
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

      /*
       * Make sure the item belongs to the selected biller when
       * Flutterwave includes biller_code in the item response.
       */
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
            success: false,
            error:
              "The selected bill package does not belong to the selected provider.",
          },
          400,
        );
      }

      // ==========================================================
      // 17. AMOUNT
      // ==========================================================

      const itemAmount =
        extractAmount(
          selectedItem,
        );

      /*
       * Fixed-price items:
       *
       * Flutterwave expects the payment amount to match the bill
       * item amount.
       */
      if (
        itemAmount !== null
      ) {
        if (
          !Number.isFinite(
            amount,
          ) ||
          amount <= 0
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
              success: false,
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

      /*
       * Variable-price items such as Airtime may not expose a
       * fixed amount. In that case the customer-supplied amount
       * is required.
       */
      if (
        !Number.isFinite(
          amount,
        ) ||
        amount <= 0
      ) {
        return json(
          {
            success: false,
            error:
              "A valid amount is required.",
          },
          400,
        );
      }

      amount =
        Number(
          amount.toFixed(2),
        );

      // ==========================================================
      // 18. CUSTOMER VALIDATION
      // ==========================================================
      //
      // Flutterwave supports validation for customer identifiers
      // such as meter numbers, smartcard numbers and account
      // numbers. It also documents customer validation using the
      // item_code.
      //
      // We validate all bill types before debiting the wallet.
      // ==========================================================

      const validation =
        await flw(
          `/bill-items/${encodeURIComponent(
            itemCode,
          )}/validate?customer=${encodeURIComponent(
            customer,
          )}`,
        );

      console.log(
        "Flutterwave customer validation:",
        JSON.stringify({
          service,
          biller_code:
            billerCode,
          item_code:
            itemCode,
          ok:
            validation.ok,
          status:
            validation.status,
          provider_status:
            validation.body
              ?.status,
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
            success: false,
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
          },
          400,
        );
      }

      const validationData =
        validation.body
          ?.data ??
        null;

      // ==========================================================
      // 19. UNIQUE REFERENCE
      // ==========================================================

      const reference =
        `BILL_${crypto
          .randomUUID()
          .replace(
            /-/g,
            "",
          )}`;

      console.log(
        "Bill payment request:",
        JSON.stringify({
          user_id:
            user.id,
          service,
          category:
            expectedCategory,
          biller_code:
            billerCode,
          item_code:
            itemCode,
          amount,
          customer,
          reference,
        }),
      );

      // ==========================================================
      // 20. DEBIT WALLET
      // ==========================================================

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

      if (
        debitError
      ) {
        console.error(
          "debit_wallet failed:",
          debitError,
        );

        const message =
          String(
            debitError.message ??
              "",
          );

        return json(
          {
            success: false,
            error:
              message
                .toLowerCase()
                .includes(
                  "insufficient",
                )
                ? "Insufficient wallet balance"
                : "Unable to debit your wallet",
          },
          400,
        );
      }

      console.log(
        "Wallet debited:",
        JSON.stringify({
          transaction_id:
            debit?.id ??
            null,
          amount,
          reference,
        }),
      );

      // ==========================================================
      // 21. FLUTTERWAVE PAYMENT
      // ==========================================================

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

      /*
       * Optional callback URL.
       *
       * Set:
       *
       * FLUTTERWAVE_BILL_CALLBACK_URL
       *
       * in Supabase Edge Function secrets if you want Flutterwave
       * to call your callback endpoint.
       */
      const callbackUrl =
        Deno.env.get(
          "FLUTTERWAVE_BILL_CALLBACK_URL",
        );

      if (callbackUrl) {
        paymentBody.callback_url =
          callbackUrl;
      }

      /*
       * Some data integrations may supply a type.
       * Only send it when explicitly provided rather than guessing.
       */
      if (paymentType) {
        paymentBody.type =
          paymentType;
      }

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
          "Flutterwave bill payment request error:",
          providerError,
        );

        /*
         * IMPORTANT:
         *
         * Do NOT immediately refund here.
         *
         * A network/timeout error does not prove that Flutterwave
         * did not process the bill.
         *
         * The transaction must be reconciled using the bill status
         * endpoint before a refund is attempted.
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
            },
          },
        );

        return json(
          {
            success: true,
            message:
              "Bill payment is being verified. Your wallet has been debited and the transaction will be reconciled automatically.",
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

      const providerBody =
        providerResult?.body ??
        {};

      const providerData =
        providerBody?.data ??
        null;

      const providerStatus =
        getTransactionStatus(
          providerBody,
        );

      const providerReference =
        extractProviderReference(
          providerBody,
        );

      console.log(
        "Flutterwave bill payment response:",
        JSON.stringify({
          ok:
            providerResult?.ok,
          status:
            providerResult?.status,
          provider_status:
            providerStatus,
          provider_reference:
            providerReference,
          reference,
        }),
      );

      // ==========================================================
      // 22. DEFINITIVE SUCCESS
      // ==========================================================

      if (
        providerResult?.ok &&
        isSuccessfulBillStatus(
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
            },
          },
        );

        return json({
          success: true,

          message:
            providerBody?.message ??
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

      // ==========================================================
      // 23. PENDING
      // ==========================================================
      //
      // Flutterwave documents that the initial bill response can
      // be pending and that the final status should be obtained
      // through webhook/status verification.
      // ==========================================================

      if (
        providerResult?.status ===
          200 &&
        !isFailedBillStatus(
          providerStatus,
        )
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
            },
          },
        );

        return json(
          {
            success: true,

            message:
              providerBody?.message ??
              "Bill payment is being processed.",

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

            data:
              providerData,
          },
          202,
        );
      }

      // ==========================================================
      // 24. DEFINITIVE FAILURE
      // ==========================================================

      if (
        isFailedBillStatus(
          providerStatus,
        ) ||
        !providerResult?.ok
      ) {
        console.error(
          "Flutterwave bill payment failed:",
          JSON.stringify({
            reference,
            provider_status:
              providerStatus,
            provider_body:
              providerBody,
          }),
        );

        /*
         * We have a definitive provider failure, so refund the
         * customer's wallet.
         */
        const refundReference =
          `REFUND_${reference}`;

        const {
          error:
            refundError,
        } = await admin.rpc(
          "refund_wallet",
          {
            _user_id:
              user.id,

            _amount:
              amount,

            _description:
              "Bill payment reversal",

            _idempotency_key:
              refundReference,

            _reference:
              refundReference,

            _metadata: {
              original_reference:
                reference,

              service,

              category:
                expectedCategory,

              biller_code:
                billerCode,

              item_code:
                itemCode,

              customer,

              reason:
                "flutterwave_bill_failed",

              flutterwave_response:
                providerBody,
            },
          },
        );

        if (
          refundError
        ) {
          console.error(
            "CRITICAL: refund_wallet failed:",
            refundError,
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
                refund_required:
                  true,
                refund_error:
                  refundError,
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
                refundReference,
            },
          },
        );

        return json(
          {
            success: false,

            error:
              providerBody?.message ??
              "Bill payment failed. Your wallet has been refunded.",

            refunded:
              true,

            refund_reference:
              refundReference,

            reference,

            amount,

            service,
          },
          400,
        );
      }

      // ==========================================================
      // 25. UNKNOWN / UNCONFIRMED RESULT
      // ==========================================================
      //
      // Never refund an ambiguous result automatically.
      // Reconciliation must determine whether Flutterwave processed
      // the transaction.
      // ==========================================================

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
          },
        },
      );

      return json(
        {
          success: true,

          message:
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
          success: false,
          error:
            error?.message ??
            "Unexpected error",
        },
        500,
      );
    }
  },
);
