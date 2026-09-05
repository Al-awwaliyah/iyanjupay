import {
  corsHeaders,
  json,
  adminClient,
} from "../_shared/auth.ts";

import {
  createClient,
} from "https://esm.sh/@supabase/supabase-js@2";


/* ================================================================
   TYPES
   ================================================================ */

type ReconcileState =
  | "successful"
  | "failed"
  | "pending";

type JsonObject =
  Record<string, unknown>;


/* ================================================================
   ENVIRONMENT
   ================================================================ */

const SUPABASE_URL =
  Deno.env.get(
    "SUPABASE_URL",
  ) ?? "";

const SUPABASE_ANON_KEY =
  Deno.env.get(
    "SUPABASE_ANON_KEY",
  ) ?? "";

const CLUBKONNECT_BASE_URL =
  "https://www.nellobytesystems.com";


/* ================================================================
   RESPONSE
   ================================================================ */

function response(
  body: unknown,
  status = 200,
) {
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


/* ================================================================
   STRING
   ================================================================ */

function s(
  value: unknown,
): string {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value).trim();
}


/* ================================================================
   NUMBER
   ================================================================ */

function n(
  value: unknown,
): number | null {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}


/* ================================================================
   FIRST VALUE
   ================================================================ */

function first(
  ...values: unknown[]
): unknown {
  for (
    const value of values
  ) {
    if (
      value !== null &&
      value !== undefined &&
      s(value) !== ""
    ) {
      return value;
    }
  }

  return null;
}


/* ================================================================
   OBJECT
   ================================================================ */

function object(
  value: unknown,
): JsonObject {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    return value as JsonObject;
  }

  return {};
}


/* ================================================================
   STATUS CODE
   ================================================================ */

function statusCode(
  body: any,
): number | null {
  return n(
    first(
      body?.statuscode,
      body?.StatusCode,
      body?.statusCode,
      body?.STATUSCODE,
      body?.code,
      body?.Code,
    ),
  );
}


/* ================================================================
   STATUS TEXT
   ================================================================ */

function statusText(
  body: any,
): string {
  return s(
    first(
      body?.orderstatus,
      body?.OrderStatus,
      body?.status,
      body?.Status,
      body?.order_status,
      body?.message,
    ),
  ).toUpperCase();
}


/* ================================================================
   ORDER ID
   ================================================================ */

function orderId(
  body: any,
): string {
  return s(
    first(
      body?.orderid,
      body?.OrderID,
      body?.orderId,
      body?.order_id,
      body?.order,
    ),
  );
}


/* ================================================================
   REQUEST ID
   ================================================================ */

function requestId(
  body: any,
): string {
  return s(
    first(
      body?.requestid,
      body?.RequestID,
      body?.requestId,
      body?.request_id,
    ),
  );
}


/* ================================================================
   ORDER REMARK
   ================================================================ */

function orderRemark(
  body: any,
): string {
  return s(
    first(
      body?.orderremark,
      body?.OrderRemark,
      body?.remark,
      body?.Remark,
      body?.message,
    ),
  );
}


/* ================================================================
   CLASSIFICATION
   ================================================================ */

function classify(
  body: any,
  httpOk: boolean,
): {
  state: ReconcileState;
  code: number | null;
  text: string;
} {
  const code =
    statusCode(body);

  const text =
    statusText(body);

  /*
   * ClubKonnect's definitive success
   * response is status code 200.
   *
   * Never classify a generic HTTP 200 as
   * a successful financial transaction.
   */
  if (
    httpOk &&
    code === 200
  ) {
    return {
      state:
        "successful",
      code,
      text,
    };
  }

  /*
   * Explicit completed-but-network-
   * unresponsive / unspecified states
   * require reconciliation rather than
   * immediate wallet refund.
   */
  if (
    code === 201 ||
    code === 299
  ) {
    return {
      state:
        "pending",
      code,
      text,
    };
  }

  /*
   * Received / processing states.
   */
  if (
    code === 100 ||
    code === 199 ||
    code === 300 ||
    code === 399
  ) {
    return {
      state:
        "pending",
      code,
      text,
    };
  }

  /*
   * ClubKonnect's 600-range represents
   * on-hold/network conditions generally.
   *
   * Do not refund merely because the
   * transaction has a 600-series status.
   */
  if (
    code !== null &&
    code >= 600 &&
    code <= 699
  ) {
    /*
     * 602 specifically represents a
     * provider-side cancellation/refund
     * condition and is handled as failed.
     */
    if (code === 602) {
      return {
        state:
          "failed",
        code,
        text,
      };
    }

    return {
      state:
        "pending",
      code,
      text,
    };
  }

  /*
   * 400-599 are failure/cancellation
   * responses.
   */
  if (
    code !== null &&
    code >= 400 &&
    code <= 599
  ) {
    return {
      state:
        "failed",
      code,
      text,
    };
  }

  /*
   * Text fallback only applies when
   * numeric status is unavailable.
   */
  if (
    code === null
  ) {
    if (
      text.includes(
        "ORDER_COMPLETED",
      ) ||
      text === "SUCCESS" ||
      text === "SUCCESSFUL" ||
      text === "COMPLETED"
    ) {
      /*
       * Do not trust a textual completed
       * response alone unless the provider
       * explicitly supplies numeric 200.
       */
      return {
        state:
          "pending",
        code,
        text,
      };
    }

    if (
      text.includes(
        "ORDER_ERROR",
      ) ||
      text.includes(
        "ORDER_CANCELLED",
      ) ||
      text === "FAILED" ||
      text === "FAILURE" ||
      text === "CANCELLED"
    ) {
      return {
        state:
          "failed",
        code,
        text,
      };
    }
  }

  return {
    state:
      "pending",
    code,
    text,
  };
}


/* ================================================================
   CREDENTIALS
   ================================================================ */

function credentials() {
  const userId =
    s(
      Deno.env.get(
        "CLUBKONNECT_USER_ID",
      ) ??
      Deno.env.get(
        "CLUBKONNECT_USERID",
      ),
    );

  const apiKey =
    s(
      Deno.env.get(
        "CLUBKONNECT_API_KEY",
      ) ??
      Deno.env.get(
        "CLUBKONNECT_APIKEY",
      ),
    );

  if (
    !userId ||
    !apiKey
  ) {
    throw new Error(
      "ClubKonnect credentials are not configured.",
    );
  }

  return {
    userId,
    apiKey,
  };
}


/* ================================================================
   CLUBKONNECT REQUEST
   ================================================================ */

async function clubKonnectRequest(
  params: Record<
    string,
    unknown
  >,
) {
  const {
    userId,
    apiKey,
  } =
    credentials();

  const url =
    new URL(
      `${CLUBKONNECT_BASE_URL}/APIQueryV1.asp`,
    );

  url.searchParams.set(
    "UserID",
    userId,
  );

  url.searchParams.set(
    "APIKey",
    apiKey,
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
      value !== null &&
      value !== undefined &&
      s(value) !== ""
    ) {
      url.searchParams.set(
        key,
        s(value),
      );
    }
  }

  console.log(
    "ClubKonnect reconciliation request",
    {
      endpoint:
        "APIQueryV1.asp",
      parameter_names:
        Object.keys(params),
    },
  );

  const providerResponse =
    await fetch(
      url.toString(),
      {
        method:
          "GET",
        headers: {
          Accept:
            "application/json",
        },
      },
    );

  const text =
    await providerResponse.text();

  let body: any = {};

  try {
    body =
      text
        ? JSON.parse(text)
        : {};
  } catch {
    body = {
      status:
        "NON_JSON_RESPONSE",
      raw:
        text.slice(
          0,
          1000,
        ),
    };
  }

  console.log(
    "ClubKonnect reconciliation response",
    {
      http_status:
        providerResponse.status,

      ok:
        providerResponse.ok,

      status:
        statusText(body),

      statuscode:
        statusCode(body),

      orderid:
        orderId(body),

      requestid:
        requestId(body),
    },
  );

  return {
    ok:
      providerResponse.ok,

    status:
      providerResponse.status,

    body,
  };
}


/* ================================================================
   AUTHENTICATE ADMIN USER
   ================================================================ */

async function authenticateAdmin(
  req: Request,
) {
  const authorization =
    req.headers.get(
      "Authorization",
    );

  if (
    !authorization ||
    !authorization
      .toLowerCase()
      .startsWith(
        "bearer ",
      )
  ) {
    throw new Error(
      "Authentication required.",
    );
  }

  if (
    !SUPABASE_URL ||
    !SUPABASE_ANON_KEY
  ) {
    throw new Error(
      "Supabase authentication configuration is missing.",
    );
  }

  const userClient =
    createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
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
    await userClient.auth.getUser(
      authorization.replace(
        /^Bearer\s+/i,
        "",
      ),
    );

  if (
    error ||
    !data.user
  ) {
    throw new Error(
      "Authentication required.",
    );
  }

  const user =
    data.user;

  const admin =
    adminClient();

  /*
   * Match the application's existing
   * support_admins authorization model.
   */
  const {
    data: adminRecord,
    error:
      adminError,
  } =
    await admin
      .from(
        "support_admins",
      )
      .select(
        "id,user_id,role,is_active",
      )
      .eq(
        "user_id",
        user.id,
      )
      .eq(
        "is_active",
        true,
      )
      .maybeSingle();

  if (
    adminError
  ) {
    console.error(
      "Admin authorization lookup failed",
      adminError,
    );

    throw new Error(
      "Unable to verify administrator permissions.",
    );
  }

  if (
    !adminRecord
  ) {
    throw new Error(
      "Administrator access required.",
    );
  }

  const role =
    s(
      adminRecord.role,
    ).toLowerCase();

  /*
   * Read-only administrators can inspect
   * reconciliation records but cannot alter
   * transaction financial state.
   */
  if (
    role ===
    "read_only_admin"
  ) {
    throw new Error(
      "Read-only administrators cannot reconcile transactions.",
    );
  }

  const allowedRoles =
    new Set([
      "super_admin",
      "operations_admin",
      "finance_admin",
      "support_admin",
      "compliance_admin",
    ]);

  if (
    !allowedRoles.has(
      role,
    )
  ) {
    throw new Error(
      "You do not have permission to reconcile transactions.",
    );
  }

  return {
    user,
    adminRecord,
    role,
  };
}


/* ================================================================
   TRANSACTION LOOKUP
   ================================================================ */

async function findTransaction(
  admin: any,
  reference: string,
) {
  /*
   * The admin action accepts the internal
   * transaction reference, not an arbitrary
   * provider reference.
   */
  const {
    data,
    error,
  } =
    await admin
      .from(
        "transactions",
      )
      .select(
        "*",
      )
      .eq(
        "reference_number",
        reference,
      )
      .eq(
        "provider",
        "clubkonnect",
      )
      .maybeSingle();

  if (
    error
  ) {
    throw new Error(
      `Unable to load transaction: ${error.message}`,
    );
  }

  if (
    !data
  ) {
    throw new Error(
      "ClubKonnect transaction was not found.",
    );
  }

  return data;
}


/* ================================================================
   METADATA
   ================================================================ */

function transactionMetadata(
  transaction: any,
): JsonObject {
  return object(
    transaction?.metadata,
  );
}


/* ================================================================
   PROVIDER IDENTIFIERS
   ================================================================ */

function storedOrderId(
  transaction: any,
): string {
  const metadata =
    transactionMetadata(
      transaction,
    );

  return s(
    first(
      metadata.clubkonnect_order_id,
      metadata.order_id,
      metadata.provider_order_id,
      transaction.provider_reference,
    ),
  );
}


function storedRequestId(
  transaction: any,
): string {
  const metadata =
    transactionMetadata(
      transaction,
    );

  return s(
    first(
      metadata.clubkonnect_request_id,
      metadata.request_id,
      transaction.reference_number,
    ),
  );
}


/* ================================================================
   REFUND
   ================================================================ */

async function refundWallet(
  admin: any,
  transaction: any,
  reason: string,
) {
  const reference =
    s(
      transaction.reference_number,
    );

  const userId =
    s(
      transaction.user_id,
    );

  const amount =
    Number(
      transaction.amount,
    );

  if (
    !reference ||
    !userId ||
    !Number.isFinite(
      amount,
    ) ||
    amount <= 0
  ) {
    throw new Error(
      "Transaction does not contain a valid refund amount or user.",
    );
  }

  const metadata =
    transactionMetadata(
      transaction,
    );

  /*
   * Idempotency is enforced through the
   * same refund reference used by the
   * existing ClubKonnect service.
   */
  const refundReference =
    `REFUND_${reference}`;

  /*
   * If our transaction metadata already
   * records the refund, do not issue it again.
   */
  if (
    metadata.refund_completed ===
    true ||
    metadata.refunded ===
    true
  ) {
    return {
      success:
        true,
      alreadyRefunded:
        true,
    };
  }

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
          "ClubKonnect service payment reversal",

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

          provider:
            "clubkonnect",

          reason,

          reconciliation_source:
            "admin_reconciliation",
        },
      },
    );

  if (
    error
  ) {
    console.error(
      "ClubKonnect reconciliation refund failed",
      error,
    );

    throw new Error(
      `Wallet refund failed: ${error.message}`,
    );
  }

  return {
    success:
      true,

    alreadyRefunded:
      false,

    data,
  };
}


/* ================================================================
   EVENT LOGGING
   ================================================================ */

async function recordReconciliationEvent(
  admin: any,
  transaction: any,
  payload: JsonObject,
) {
  /*
   * Reconciliation history tables differ
   * slightly between deployments. The
   * transaction metadata is therefore the
   * authoritative audit trail for this
   * operation.
   *
   * If reconciliation_events exists,
   * record the event there as well.
   */
  try {
    await admin
      .from(
        "reconciliation_events",
      )
      .insert({
        transaction_id:
          transaction.id,

        event_type:
          "provider_reconciliation",

        notes:
          s(
            payload.message,
          ) ||
          "ClubKonnect transaction reconciled by administrator.",

        metadata:
          payload,
      });
  } catch (error) {
    console.warn(
      "Optional reconciliation event insert failed",
      error,
    );
  }
}


/* ================================================================
   UPDATE SUCCESS
   ================================================================ */

async function markSuccessful(
  admin: any,
  transaction: any,
  providerBody: any,
  code: number | null,
) {
  const oldMetadata =
    transactionMetadata(
      transaction,
    );

  const providerOrderId =
    orderId(
      providerBody,
    ) ||
    storedOrderId(
      transaction,
    );

  const providerRequestId =
    requestId(
      providerBody,
    ) ||
    storedRequestId(
      transaction,
    );

  const providerStatus =
    statusText(
      providerBody,
    );

  const remark =
    orderRemark(
      providerBody,
    );

  /*
   * Never downgrade a successful transaction.
   */
  if (
    String(
      transaction.status ||
      "",
    ).toLowerCase() ===
    "successful"
  ) {
    const metadata = {
      ...oldMetadata,

      clubkonnect_order_id:
        providerOrderId ||
        oldMetadata.clubkonnect_order_id ||
        null,

      clubkonnect_request_id:
        providerRequestId ||
        oldMetadata.clubkonnect_request_id ||
        null,

      clubkonnect_statuscode:
        code,

      clubkonnect_status:
        providerStatus ||
        null,

      clubkonnect_orderremark:
        remark ||
        null,

      last_reconciled_at:
        new Date().toISOString(),

      last_reconciliation_state:
        "successful",

      reconciliation_required:
        false,
    };

    const {
      error,
    } =
      await admin
        .from(
          "transactions",
        )
        .update({
          provider_reference:
            providerOrderId ||
            transaction.provider_reference ||
            providerRequestId ||
            transaction.reference_number,

          metadata,
        })
        .eq(
          "id",
          transaction.id,
        );

    if (
      error
    ) {
      throw new Error(
        `Unable to record reconciliation: ${error.message}`,
      );
    }

    return {
      success:
        true,

      state:
        "successful" as const,

      alreadySuccessful:
        true,

      refunded:
        false,

      orderId:
        providerOrderId ||
        null,

      requestId:
        providerRequestId ||
        null,
    };
  }

  const metadata = {
    ...oldMetadata,

    clubkonnect_order_id:
      providerOrderId ||
      null,

    clubkonnect_request_id:
      providerRequestId ||
      null,

    clubkonnect_statuscode:
      code,

    clubkonnect_status:
      providerStatus ||
      null,

    clubkonnect_orderremark:
      remark ||
      null,

    clubkonnect_response:
      {
        statuscode:
          code,

        orderid:
          providerOrderId ||
          null,

        requestid:
          providerRequestId ||
          null,

        orderstatus:
          providerStatus ||
          null,

        orderremark:
          remark ||
          null,
      },

    fulfillment:
      oldMetadata.fulfillment ||
      {},

    reconciliation_required:
      false,

    last_reconciled_at:
      new Date().toISOString(),

    last_reconciliation_state:
      "successful",

    reconciliation_source:
      "admin",
  };

  const {
    error,
  } =
    await admin
      .from(
        "transactions",
      )
      .update({
        status:
          "successful",

        provider_reference:
          providerOrderId ||
          transaction.provider_reference ||
          providerRequestId ||
          transaction.reference_number,

        completed_at:
          transaction.completed_at ||
          new Date().toISOString(),

        metadata,
      })
      .eq(
        "id",
        transaction.id,
      );

  if (
    error
  ) {
    throw new Error(
      `Unable to mark transaction successful: ${error.message}`,
    );
  }

  await recordReconciliationEvent(
    admin,
    transaction,
    {
      state:
        "successful",

      statuscode:
        code,

      order_id:
        providerOrderId ||
        null,

      request_id:
        providerRequestId ||
        null,

      message:
        "ClubKonnect confirmed transaction completion during administrator reconciliation.",
    },
  );

  return {
    success:
      true,

    state:
      "successful" as const,

    alreadySuccessful:
      false,

    refunded:
      false,

    orderId:
      providerOrderId ||
      null,

    requestId:
      providerRequestId ||
      null,
  };
}


/* ================================================================
   UPDATE PENDING
   ================================================================ */

async function markPending(
  admin: any,
  transaction: any,
  providerBody: any,
  code: number | null,
) {
  const oldMetadata =
    transactionMetadata(
      transaction,
    );

  const providerOrderId =
    orderId(
      providerBody,
    ) ||
    storedOrderId(
      transaction,
    );

  const providerRequestId =
    requestId(
      providerBody,
    ) ||
    storedRequestId(
      transaction,
    );

  const providerStatus =
    statusText(
      providerBody,
    );

  const remark =
    orderRemark(
      providerBody,
    );

  const metadata = {
    ...oldMetadata,

    clubkonnect_order_id:
      providerOrderId ||
      null,

    clubkonnect_request_id:
      providerRequestId ||
      null,

    clubkonnect_statuscode:
      code,

    clubkonnect_status:
      providerStatus ||
      null,

    clubkonnect_orderremark:
      remark ||
      null,

    clubkonnect_response:
      {
        statuscode:
          code,

        orderid:
          providerOrderId ||
          null,

        requestid:
          providerRequestId ||
          null,

        orderstatus:
          providerStatus ||
          null,

        orderremark:
          remark ||
          null,
      },

    reconciliation_required:
      true,

    last_reconciled_at:
      new Date().toISOString(),

    last_reconciliation_state:
      "pending",

    reconciliation_source:
      "admin",
  };

  /*
   * Do not turn an already-successful
   * transaction back into pending.
   */
  if (
    String(
      transaction.status ||
      "",
    ).toLowerCase() ===
    "successful"
  ) {
    return {
      success:
        true,

      state:
        "successful" as const,

      alreadySuccessful:
        true,

      refunded:
        false,

      orderId:
        providerOrderId ||
        null,

      requestId:
        providerRequestId ||
        null,
    };
  }

  const {
    error,
  } =
    await admin
      .from(
        "transactions",
      )
      .update({
        status:
          "pending",

        provider_reference:
          providerOrderId ||
          transaction.provider_reference ||
          providerRequestId ||
          transaction.reference_number,

        metadata,
      })
      .eq(
        "id",
        transaction.id,
      );

  if (
    error
  ) {
    throw new Error(
      `Unable to update pending transaction: ${error.message}`,
    );
  }

  await recordReconciliationEvent(
    admin,
    transaction,
    {
      state:
        "pending",

      statuscode:
        code,

      order_id:
        providerOrderId ||
        null,

      request_id:
        providerRequestId ||
        null,

      message:
        "ClubKonnect did not return a final successful or failed state. Transaction remains pending.",
    },
  );

  return {
    success:
      true,

    state:
      "pending" as const,

    alreadySuccessful:
      false,

    refunded:
      false,

    orderId:
      providerOrderId ||
      null,

    requestId:
      providerRequestId ||
      null,
  };
}


/* ================================================================
   UPDATE FAILED + REFUND
   ================================================================ */

async function markFailedAndRefund(
  admin: any,
  transaction: any,
  providerBody: any,
  code: number | null,
) {
  const oldMetadata =
    transactionMetadata(
      transaction,
    );

  /*
   * Never downgrade a successful
   * transaction even if an old provider
   * response is later replayed.
   */
  if (
    String(
      transaction.status ||
      "",
    ).toLowerCase() ===
    "successful"
  ) {
    return {
      success:
        true,

      state:
        "successful" as const,

      alreadySuccessful:
        true,

      refunded:
        false,

      orderId:
        orderId(
          providerBody,
        ) ||
        storedOrderId(
          transaction,
        ),

      requestId:
        requestId(
          providerBody,
        ) ||
        storedRequestId(
          transaction,
        ),
    };
  }

  const providerOrderId =
    orderId(
      providerBody,
    ) ||
    storedOrderId(
      transaction,
    );

  const providerRequestId =
    requestId(
      providerBody,
    ) ||
    storedRequestId(
      transaction,
    );

  const providerStatus =
    statusText(
      providerBody,
    );

  const remark =
    orderRemark(
      providerBody,
    );

  const refund =
    await refundWallet(
      admin,
      transaction,
      `ClubKonnect provider reconciliation confirmed failure. Status ${code ?? "unknown"}: ${providerStatus || remark || "provider failure"}`,
    );

  const metadata = {
    ...oldMetadata,

    clubkonnect_order_id:
      providerOrderId ||
      null,

    clubkonnect_request_id:
      providerRequestId ||
      null,

    clubkonnect_statuscode:
      code,

    clubkonnect_status:
      providerStatus ||
      null,

    clubkonnect_orderremark:
      remark ||
      null,

    clubkonnect_response:
      {
        statuscode:
          code,

        orderid:
          providerOrderId ||
          null,

        requestid:
          providerRequestId ||
          null,

        orderstatus:
          providerStatus ||
          null,

        orderremark:
          remark ||
          null,
      },

    refund_completed:
      true,

    refunded:
      true,

    refund_reference:
      `REFUND_${transaction.reference_number}`,

    refund_reason:
      "ClubKonnect provider reconciliation confirmed failure.",

    reconciliation_required:
      false,

    last_reconciled_at:
      new Date().toISOString(),

    last_reconciliation_state:
      "failed",

    reconciliation_source:
      "admin",
  };

  const {
    error,
  } =
    await admin
      .from(
        "transactions",
      )
      .update({
        status:
          "failed",

        provider_reference:
          providerOrderId ||
          transaction.provider_reference ||
          providerRequestId ||
          transaction.reference_number,

        metadata,
      })
      .eq(
        "id",
        transaction.id,
      );

  if (
    error
  ) {
    throw new Error(
      `Wallet was refunded but transaction status could not be updated: ${error.message}`,
    );
  }

  await recordReconciliationEvent(
    admin,
    transaction,
    {
      state:
        "failed",

      statuscode:
        code,

      order_id:
        providerOrderId ||
        null,

      request_id:
        providerRequestId ||
        null,

      refunded:
        true,

      message:
        "ClubKonnect confirmed failure and the customer's wallet was refunded.",
    },
  );

  return {
    success:
      true,

    state:
      "failed" as const,

    alreadySuccessful:
      false,

    refunded:
      !refund.alreadyRefunded,

    orderId:
      providerOrderId ||
      null,

    requestId:
      providerRequestId ||
      null,
  };
}


/* ================================================================
   MAIN RECONCILIATION
   ================================================================ */

async function reconcile(
  admin: any,
  reference: string,
) {
  const transaction =
    await findTransaction(
      admin,
      reference,
    );

  /*
   * If the transaction is already successful,
   * return immediately but still perform a
   * provider query below when possible so the
   * administrator can see the current provider
   * record.
   */
  const currentStatus =
    String(
      transaction.status ||
      "",
    ).toLowerCase();

  const providerOrderId =
    storedOrderId(
      transaction,
    );

  const providerRequestId =
    storedRequestId(
      transaction,
    );

  /*
   * ClubKonnect's APIQueryV1 accepts OrderID
   * or RequestID. Prefer OrderID because it is
   * the provider's persistent order identifier.
   */
  const queryParams =
    providerOrderId
      ? {
          OrderID:
            providerOrderId,
        }
      : {
          RequestID:
            providerRequestId ||
            reference,
        };

  const provider =
    await clubKonnectRequest(
      queryParams,
    );

  const classification =
    classify(
      provider.body,
      provider.ok,
    );

  console.log(
    "ClubKonnect reconciliation classification",
    {
      reference,
      current_status:
        currentStatus,
      provider_status:
        classification.text,
      provider_statuscode:
        classification.code,
      state:
        classification.state,
    },
  );

  if (
    classification.state ===
    "successful"
  ) {
    return await markSuccessful(
      admin,
      transaction,
      provider.body,
      classification.code,
    );
  }

  if (
    classification.state ===
    "failed"
  ) {
    return await markFailedAndRefund(
      admin,
      transaction,
      provider.body,
      classification.code,
    );
  }

  return await markPending(
    admin,
    transaction,
    provider.body,
    classification.code,
  );
}


/* ================================================================
   REQUEST PARSING
   ================================================================ */

async function parseBody(
  req: Request,
): Promise<any> {
  const contentType =
    (
      req.headers.get(
        "content-type",
      ) || ""
    ).toLowerCase();

  if (
    contentType.includes(
      "application/json",
    )
  ) {
    return await req
      .json()
      .catch(() => ({}));
  }

  if (
    contentType.includes(
      "application/x-www-form-urlencoded",
    )
  ) {
    const text =
      await req.text();

    const params =
      new URLSearchParams(
        text,
      );

    return Object.fromEntries(
      params.entries(),
    );
  }

  const text =
    await req.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(
      text,
    );
  } catch {
    return {};
  }
}


/* ================================================================
   HANDLER
   ================================================================ */

Deno.serve(
  async (
    req,
  ) => {
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
      "POST" &&
      req.method !==
      "PUT"
    ) {
      return response(
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
       * Authenticate and authorize the
       * administrator before touching any
       * transaction.
       */
      await authenticateAdmin(
        req,
      );

      const body =
        await parseBody(
          req,
        );

      const reference =
        s(
          body?.reference ||
          body?.transaction_reference ||
          body?.internal_reference,
        );

      if (
        !reference
      ) {
        return response(
          {
            success:
              false,

            error:
              "Transaction reference is required.",
          },
          400,
        );
      }

      /*
       * Prevent arbitrary massive input.
       */
      if (
        reference.length >
        200
      ) {
        return response(
          {
            success:
              false,

            error:
              "Invalid transaction reference.",
          },
          400,
        );
      }

      const admin =
        adminClient();

      const result =
        await reconcile(
          admin,
          reference,
        );

      return response({
        success:
          true,

        state:
          result.state,

        reference,

        order_id:
          result.orderId ||
          null,

        request_id:
          result.requestId ||
          null,

        refunded:
          result.refunded ||
          false,

        already_successful:
          result.alreadySuccessful ||
          false,

        message:
          result.state ===
          "successful"
            ? result.alreadySuccessful
              ? "Transaction was already successful."
              : "ClubKonnect confirmed the transaction as successful."
            : result.state ===
                "failed"
              ? result.refunded
                ? "ClubKonnect confirmed failure and the customer's wallet was refunded."
                : "ClubKonnect confirmed transaction failure."
              : "ClubKonnect transaction remains pending.",
      });

    } catch (
      error
    ) {
      console.error(
        "clubkonnect-reconcile error",
        error,
      );

      const message =
        error instanceof Error
          ? error.message
          : "Unable to reconcile transaction.";

      const status =
        message.includes(
          "Authentication required",
        )
          ? 401
          : message.includes(
                "Administrator access required",
              ) ||
              message.includes(
                "do not have permission",
              ) ||
              message.includes(
                "Read-only administrators",
              )
            ? 403
            : message.includes(
                  "not found",
                )
              ? 404
              : 400;

      return response(
        {
          success:
            false,

          error:
            message,
        },
        status,
      );
    }
  },
);
