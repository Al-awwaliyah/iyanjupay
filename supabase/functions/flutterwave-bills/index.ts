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
 * Supported services:
 *   airtime
 *   data
 *   electricity
 *   cable
 *   internet
 *
 * Flow:
 *
 * categories
 *     ↓
 * billers
 *     ↓
 * items
 *     ↓
 * validate customer
 *     ↓
 * debit wallet
 *     ↓
 * Flutterwave payment
 *     ↓
 * success / refund
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

function cleanString(value: unknown): string {
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

Deno.serve(async (req) => {
  // ============================================================
  // 0. CORS / METHOD
  // ============================================================

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
    // ============================================================
    // 1. AUTHENTICATION
    // ============================================================

    const user = await getUser(req);

    if (!user) {
      return json(
        {
          success: false,
          error: "Unauthorized",
        },
        401,
      );
    }

    // ============================================================
    // 2. BODY
    // ============================================================

    const body = await req
      .json()
      .catch(() => ({}));

    const action = cleanString(
      body?.action || "service",
    ).toLowerCase();

    // ============================================================
    // 3. ADMIN CLIENT
    // ============================================================

    const admin = adminClient();

    // ============================================================
    // 4. CATEGORIES
    //
    // Flutterwave:
    // GET /bill-categories?country=NG
    //
    // ============================================================

    if (action === "categories") {
      const result = await flw(
        "/bill-categories?country=NG",
      );

      console.log(
        "Flutterwave categories response:",
        JSON.stringify({
          ok: result.ok,
          status: result.status,
          body: result.body,
        }),
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
          },
          502,
        );
      }

      return json({
        success: true,
        categories:
          result.body?.data ?? [],
      });
    }

    // ============================================================
    // 5. BILLERS
    //
    // IMPORTANT:
    //
    // Correct Flutterwave endpoint:
    //
    // GET /bills/{category}/billers?country=NG
    //
    // ============================================================

    if (action === "billers") {
      const category = cleanString(
        body?.category,
      ).toUpperCase();

      if (!category) {
        return json(
          {
            success: false,
            error: "category is required",
          },
          400,
        );
      }

      const result = await flw(
        `/bills/${encodeURIComponent(
          category,
        )}/billers?country=NG`,
      );

      console.log(
        "Flutterwave billers response:",
        JSON.stringify({
          category,
          ok: result.ok,
          status: result.status,
          body: result.body,
        }),
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

    // ============================================================
    // 6. BILL ITEMS
    //
    // Flutterwave's bill catalogue returns item_code
    // information. We retrieve the catalogue and filter
    // by biller_code.
    //
    // This is useful for Airtime/Data and fixed packages.
    // ============================================================

    if (action === "items") {
      const billerCode = cleanString(
        body?.biller_code,
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

      const categoriesResult =
        await flw(
          "/bill-categories?country=NG",
        );

      console.log(
        "Flutterwave bill catalogue response:",
        JSON.stringify({
          ok:
            categoriesResult.ok,
          status:
            categoriesResult.status,
        }),
      );

      if (
        !categoriesResult.ok ||
        categoriesResult.body?.status !==
          "success"
      ) {
        console.error(
          "Flutterwave bill catalogue failed:",
          JSON.stringify(
            categoriesResult.body,
          ),
        );

        return json(
          {
            success: false,
            error:
              categoriesResult.body?.message ??
              "Unable to load bill packages",
            provider_status:
              categoriesResult.status,
          },
          502,
        );
      }

      const allItems =
        Array.isArray(
          categoriesResult.body?.data,
        )
          ? categoriesResult.body.data
          : [];

      const items = allItems.filter(
        (item: any) =>
          cleanString(
            item?.biller_code,
          ) === billerCode,
      );

      return json({
        success: true,
        biller_code:
          billerCode,
        items,
      });
    }

    // ============================================================
    // 7. STATUS
    // ============================================================

    if (action === "status") {
      const reference = cleanString(
        body?.reference,
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
        error,
      } = await admin
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
          user.id,
        )
        .eq(
          "reference_number",
          reference,
        )
        .maybeSingle();

      if (error) {
        console.error(
          "Transaction status lookup failed:",
          error,
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

      return json({
        success: true,
        transaction:
          txn ?? null,
      });
    }

    // ============================================================
    // 8. NORMALISE SERVICE REQUEST
    // ============================================================

    let service =
      normaliseService(
        body?.service,
      );

    let amount = Number(
      body?.amount ?? 0,
    );

    const details =
      body?.details &&
      typeof body.details ===
        "object"
        ? body.details
        : {};

    let billerCode = cleanString(
      body?.biller_code ??
        details?.biller_code ??
        details?.billerCode,
    );

    let itemCode = cleanString(
      body?.item_code ??
        details?.item_code ??
        details?.itemCode,
    );

    let customer = cleanString(
      body?.customer ??
        details?.customer ??
        details?.phoneNumber ??
        details?.phone ??
        details?.meterNumber ??
        details?.meter_number ??
        details?.smartcardNumber ??
        details?.smartcard_number ??
        details?.accountNumber ??
        details?.account_number,
    );

    const country = cleanString(
      body?.country ??
        details?.country ??
        "NG",
    ).toUpperCase();

    // ============================================================
    // 9. SERVICE VALIDATION
    // ============================================================

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

    console.log(
      "IyanjuPay bill request:",
      JSON.stringify({
        user_id: user.id,
        service,
        category:
          expectedCategory,
        amount,
        biller_code:
          billerCode,
        item_code:
          itemCode,
      }),
    );

    // ============================================================
    // 10. AMOUNT
    // ============================================================

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      return json(
        {
          success: false,
          error:
            "Invalid amount",
        },
        400,
      );
    }

    amount = Number(
      amount.toFixed(2),
    );

    // ============================================================
    // 11. COUNTRY
    // ============================================================

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

    // ============================================================
    // 12. BILLER
    // ============================================================

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

    // ============================================================
    // 13. ITEM
    // ============================================================

    if (!itemCode) {
      return json(
        {
          success: false,
          error:
            "Please select a valid bill package.",
          service,
          category:
            expectedCategory,
        },
        400,
      );
    }

    // ============================================================
    // 14. CUSTOMER
    // ============================================================

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

    // ============================================================
    // 15. SERVICE-SPECIFIC CUSTOMER VALIDATION
    // ============================================================

    if (
      service === "airtime" ||
      service === "data"
    ) {
      const phone =
        customer.replace(
          /\s+/g,
          "",
        );

      if (
        !/^\+?[0-9]{10,15}$/.test(
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

      customer = phone;
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

    // ============================================================
    // 16. CUSTOMER VALIDATION
    //
    // Airtime/Data:
    // no separate validation request.
    //
    // Electricity/Cable/Internet:
    // validate customer with Flutterwave.
    // ============================================================

    if (
      service !== "airtime" &&
      service !== "data"
    ) {
      const validationUrl =
        `/bill-items/${encodeURIComponent(
          itemCode,
        )}/validate?customer=${encodeURIComponent(
          customer,
        )}`;

      try {
        const validation =
          await flw(
            validationUrl,
          );

        console.log(
          "Flutterwave customer validation:",
          JSON.stringify({
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
            },
            400,
          );
        }

        console.log(
          "Customer successfully validated:",
          JSON.stringify(
            validation.body?.data ??
              null,
          ),
        );
      } catch (
        validationError
      ) {
        console.error(
          "Bill customer validation error:",
          validationError,
        );

        return json(
          {
            success: false,
            error:
              "Unable to validate customer details.",
          },
          502,
        );
      }
    }

    // ============================================================
    // 17. UNIQUE REFERENCE
    // ============================================================

    const reference =
      `BILL_${crypto
        .randomUUID()
        .replace(
          /-/g,
          "",
        )}`;

    console.log(
      "Bill payment reference:",
      reference,
    );

    // ============================================================
    // 18. DEBIT WALLET
    // ============================================================

    const {
      data: debit,
      error: debitError,
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

    // ============================================================
    // 19. FLUTTERWAVE BILL PAYMENT
    //
    // Correct endpoint:
    //
    // POST
    // /billers/{biller_code}/items/{item_code}/payment
    //
    // ============================================================

    let providerOk =
      false;

    let providerBody:
      any = null;

    try {
      const providerPath =
        `/billers/${encodeURIComponent(
          billerCode,
        )}/items/${encodeURIComponent(
          itemCode,
        )}/payment`;

      console.log(
        "Calling Flutterwave bill endpoint:",
        providerPath,
      );

      const result =
        await flw(
          providerPath,
          {
            method:
              "POST",

            body:
              JSON.stringify({
                country,

                customer_id:
                  customer,

                amount,

                reference,
              }),
          },
        );

      providerBody =
        result.body;

      providerOk =
        result.ok &&
        result.body?.status ===
          "success";

      console.log(
        "Flutterwave bill payment response:",
        JSON.stringify({
          ok:
            result.ok,
          status:
            result.status,
          provider_status:
            result.body?.status,
          message:
            result.body?.message,
          reference,
        }),
      );
    } catch (
      providerError
    ) {
      console.error(
        "Flutterwave bill request failed:",
        providerError,
      );
    }

    // ============================================================
    // 20. PROVIDER FAILURE → REFUND
    // ============================================================

    if (!providerOk) {
      console.error(
        "Flutterwave bill payment failed:",
        JSON.stringify(
          providerBody,
        ),
      );

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

            biller_code:
              billerCode,

            item_code:
              itemCode,

            reason:
              "flutterwave_bill_failed",
          },
        },
      );

      if (refundError) {
        console.error(
          "CRITICAL: refund_wallet failed:",
          refundError,
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

      console.log(
        "Wallet refunded:",
        JSON.stringify({
          reference,
          amount,
        }),
      );

      return json(
        {
          success: false,
          error:
            providerBody?.message ??
            "Bill payment failed. Your wallet has been refunded.",
          refunded: true,
          reference,
          amount,
        },
        400,
      );
    }

    // ============================================================
    // 21. SUCCESS
    // ============================================================

    const providerData =
      providerBody?.data ??
      null;

    const providerReference =
      cleanString(
        providerData?.flw_ref ??
          providerData?.reference ??
          providerData?.tx_ref ??
          "",
      ) || null;

    console.log(
      "Bill payment accepted:",
      JSON.stringify({
        reference,
        provider_reference:
          providerReference,
        amount,
        service,
      }),
    );

    // ============================================================
    // 22. SUCCESS RESPONSE
    // ============================================================

    return json({
      success: true,

      message:
        providerBody?.message ??
        "Bill payment initiated successfully.",

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
        providerData?.status ??
        "pending",

      data:
        providerData,
    });
  } catch (
    error: any
  ) {
    console.error(
      "Bill payment error:",
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
