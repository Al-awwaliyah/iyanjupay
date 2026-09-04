import { adminClient } from "../_shared/auth.ts";

/**
 * IYANJUPAY — CLUBKONNECT CALLBACK WEBHOOK
 *
 * This function is intentionally NOT authenticated with the customer's
 * Supabase JWT. ClubKonnect calls it directly after processing an order.
 *
 * Authentication is performed with CLUBKONNECT_CALLBACK_SECRET, which is
 * appended by the purchase function to the callback URL as ?secret=...
 *
 * Supported callback formats:
 *   GET  ?orderid=...&requestid=...&statuscode=...&orderstatus=...&orderremark=...
 *   POST JSON with the same fields
 *   POST x-www-form-urlencoded with the same fields
 */

type JsonObject = Record<string, any>;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json",
};

function s(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function n(value: unknown): number | null {
  const parsed = Number(s(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizedKey(value: unknown): string {
  return s(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function pick(value: unknown, ...aliases: string[]): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const source = value as JsonObject;
  const map = new Map<string, unknown>();

  for (const [key, val] of Object.entries(source)) {
    map.set(normalizedKey(key), val);
  }

  for (const alias of aliases) {
    const found = map.get(normalizedKey(alias));
    if (found !== undefined && found !== null && s(found) !== "") {
      return found;
    }
  }

  return undefined;
}

function json(body: JsonObject, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: CORS_HEADERS,
  });
}

function statusCode(body: JsonObject): number | null {
  return n(
    pick(
      body,
      "statuscode",
      "statusCode",
      "StatusCode",
      "code",
      "Code",
    ),
  );
}

function statusText(body: JsonObject): string {
  return s(
    pick(
      body,
      "orderstatus",
      "orderStatus",
      "OrderStatus",
      "status",
      "Status",
    ),
  ).toUpperCase();
}

function orderId(body: JsonObject): string {
  return s(
    pick(
      body,
      "orderid",
      "orderId",
      "OrderID",
    ),
  );
}

function requestId(body: JsonObject): string {
  return s(
    pick(
      body,
      "requestid",
      "requestId",
      "RequestID",
    ),
  );
}

function remark(body: JsonObject): string {
  return s(
    pick(
      body,
      "orderremark",
      "orderRemark",
      "OrderRemark",
      "remark",
      "Remark",
      "description",
      "Description",
    ),
  );
}

function classify(body: JsonObject) {
  const code = statusCode(body);
  const text = statusText(body);

  // ClubKonnect's numeric status code is authoritative.
  if (code === 200) {
    return "successful" as const;
  }

  // 602 explicitly says the API account was credited back for a failed
  // transaction, so it is safe to resolve the customer's debit as failed.
  if (code === 602) {
    return "failed" as const;
  }

  // Terminal provider error/cancellation codes.
  if (code !== null && code >= 400 && code <= 599) {
    return "failed" as const;
  }

  // These are not proof of successful fulfillment.
  if (
    code === 100 ||
    code === 199 ||
    code === 201 ||
    code === 299 ||
    code === 300 ||
    code === 399 ||
    (code !== null && code >= 600 && code <= 699)
  ) {
    return "pending" as const;
  }

  if (
    text === "ORDER_COMPLETED" &&
    code === null
  ) {
    // A callback without a numeric code is not strong enough to settle money.
    return "pending" as const;
  }

  if (
    text === "ORDER_ERROR" ||
    text === "ORDER_CANCELLED" ||
    text === "ORDER_FAILED" ||
    text === "FAILED" ||
    text === "FAILURE"
  ) {
    return "failed" as const;
  }

  return "pending" as const;
}

async function parseBody(req: Request): Promise<JsonObject> {
  const url = new URL(req.url);
  const fromQuery: JsonObject = {};

  for (const [key, value] of url.searchParams.entries()) {
    if (key.toLowerCase() === "secret") continue;
    fromQuery[key] = value;
  }

  if (req.method === "GET") {
    return fromQuery;
  }

  const raw = await req.text();
  if (!raw.trim()) return fromQuery;

  const contentType = (req.headers.get("content-type") || "").toLowerCase();

  let body: JsonObject = {};

  if (contentType.includes("application/json")) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        body = parsed;
      }
    } catch {
      // Fall through to query parameters.
    }
  } else if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    try {
      const params = new URLSearchParams(raw);
      for (const [key, value] of params.entries()) {
        body[key] = value;
      }
    } catch {
      // Fall through to query parameters.
    }
  } else {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        body = parsed;
      }
    } catch {
      try {
        const params = new URLSearchParams(raw);
        for (const [key, value] of params.entries()) {
          body[key] = value;
        }
      } catch {
        // Keep query parameters only.
      }
    }
  }

  return {
    ...fromQuery,
    ...body,
  };
}

function safeCallbackBody(body: JsonObject): JsonObject {
  const output: JsonObject = {};

  for (const [key, value] of Object.entries(body)) {
    const lower = key.toLowerCase();
    if (
      lower.includes("apikey") ||
      lower.includes("secret") ||
      lower.includes("password") ||
      lower.includes("token")
    ) {
      continue;
    }

    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      output[key] = value;
    }
  }

  return output;
}

async function findTransaction(
  admin: any,
  providerOrderId: string,
  providerRequestId: string,
) {
  if (providerOrderId) {
    const { data, error } = await admin
      .from("transactions")
      .select("*")
      .eq("provider", "clubkonnect")
      .eq("provider_reference", providerOrderId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data) return data;
  }

  if (providerRequestId) {
    const { data, error } = await admin
      .from("transactions")
      .select("*")
      .eq("provider", "clubkonnect")
      .eq("reference_number", providerRequestId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data) return data;
  }

  if (providerRequestId) {
    const { data, error } = await admin
      .from("transactions")
      .select("*")
      .eq("provider", "clubkonnect")
      .contains("metadata", { request_id: providerRequestId })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data) return data;
  }

  return null;
}

async function refundWallet(
  admin: any,
  transaction: any,
  callback: JsonObject,
  reason: string,
) {
  const metadata =
    transaction?.metadata &&
    typeof transaction.metadata === "object" &&
    !Array.isArray(transaction.metadata)
      ? transaction.metadata
      : {};

  if (metadata.refunded === true || metadata.refund_completed === true) {
    return { success: true, alreadyRefunded: true };
  }

  const userId = s(transaction?.user_id);
  const amount = Number(transaction?.amount);
  const reference = s(transaction?.reference_number);

  if (!userId || !reference || !Number.isFinite(amount) || amount <= 0) {
    return {
      success: false,
      alreadyRefunded: false,
      error: "Transaction is missing a valid user, reference, or amount.",
    };
  }

  const refundReference = `REFUND_${reference}`;

  const { error } = await admin.rpc("refund_wallet", {
    _user_id: userId,
    _amount: amount,
    _description: "ClubKonnect service payment reversal",
    _idempotency_key: refundReference,
    _reference: refundReference,
    _metadata: {
      ...metadata,
      original_reference: reference,
      refund_reference: refundReference,
      provider: "clubkonnect",
      reason,
      clubkonnect_callback: safeCallbackBody(callback),
    },
  });

  return {
    success: !error,
    alreadyRefunded: false,
    error: error?.message ?? null,
  };
}

async function updateTransaction(
  admin: any,
  transaction: any,
  updates: JsonObject,
) {
  const { error } = await admin
    .from("transactions")
    .update(updates)
    .eq("id", transaction.id);

  if (error) {
    console.error("ClubKonnect webhook transaction update failed:", error);
  }

  return !error;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: CORS_HEADERS });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return json({ success: false, error: "Method not allowed." }, 405);
  }

  const url = new URL(req.url);
  const configuredSecret = s(
    Deno.env.get("CLUBKONNECT_CALLBACK_SECRET"),
  );
  const suppliedSecret = s(url.searchParams.get("secret"));

  if (!configuredSecret) {
    console.error(
      "CLUBKONNECT_CALLBACK_SECRET is not configured.",
    );
    return json(
      { success: false, error: "Webhook is not configured." },
      503,
    );
  }

  if (!suppliedSecret || suppliedSecret !== configuredSecret) {
    return json(
      { success: false, error: "Unauthorized callback." },
      401,
    );
  }

  let callback: JsonObject;
  try {
    callback = await parseBody(req);
  } catch (error) {
    console.error("ClubKonnect callback parsing failed:", error);
    return json(
      { success: false, error: "Invalid callback payload." },
      400,
    );
  }

  const providerOrderId = orderId(callback);
  const providerRequestId = requestId(callback);
  const code = statusCode(callback);
  const text = statusText(callback);
  const callbackRemark = remark(callback);

  if (!providerOrderId && !providerRequestId) {
    return json(
      {
        success: false,
        error: "Callback does not contain an OrderID or RequestID.",
      },
      400,
    );
  }

  console.log("ClubKonnect callback received", {
    orderid: providerOrderId || null,
    requestid: providerRequestId || null,
    statuscode: code,
    orderstatus: text || null,
  });

  const admin = adminClient();
  const transaction = await findTransaction(
    admin,
    providerOrderId,
    providerRequestId,
  );

  if (!transaction) {
    console.error("ClubKonnect callback transaction not found", {
      orderid: providerOrderId || null,
      requestid: providerRequestId || null,
    });

    // Returning 500 allows the provider to retry instead of silently losing
    // a callback during a temporary database/indexing problem.
    return json(
      {
        success: false,
        error: "Transaction not found; callback should be retried.",
      },
      500,
    );
  }

  const currentMetadata =
    transaction?.metadata &&
    typeof transaction.metadata === "object" &&
    !Array.isArray(transaction.metadata)
      ? transaction.metadata
      : {};

  const currentStatus = s(transaction?.status).toLowerCase();

  // Never downgrade a transaction that has already reached a terminal
  // successful state. ClubKonnect callbacks can be duplicated/out of order.
  if (currentStatus === "successful") {
    await updateTransaction(admin, transaction, {
      provider: "clubkonnect",
      provider_reference:
        providerOrderId || transaction.provider_reference || providerRequestId,
      metadata: {
        ...currentMetadata,
        clubkonnect_order_id:
          providerOrderId || currentMetadata.clubkonnect_order_id || null,
        clubkonnect_request_id:
          providerRequestId || currentMetadata.clubkonnect_request_id || null,
        clubkonnect_statuscode: code,
        clubkonnect_status: text,
        clubkonnect_remark: callbackRemark,
        clubkonnect_callback: safeCallbackBody(callback),
        reconciliation_required: false,
      },
    });

    return json({
      success: true,
      status: "successful",
      duplicate: true,
      reference: transaction.reference_number,
    });
  }

  const state = classify(callback);
  const safeCallback = safeCallbackBody(callback);

  if (state === "successful") {
    const updated = await updateTransaction(admin, transaction, {
      status: "successful",
      provider: "clubkonnect",
      provider_reference:
        providerOrderId || transaction.provider_reference || providerRequestId,
      completed_at: new Date().toISOString(),
      metadata: {
        ...currentMetadata,
        clubkonnect_order_id:
          providerOrderId || currentMetadata.clubkonnect_order_id || null,
        clubkonnect_request_id:
          providerRequestId || currentMetadata.clubkonnect_request_id || null,
        clubkonnect_statuscode: 200,
        clubkonnect_status: text || "ORDER_COMPLETED",
        clubkonnect_remark: callbackRemark,
        clubkonnect_callback: safeCallback,
        reconciliation_required: false,
        reconciled_at: new Date().toISOString(),
      },
    });

    if (!updated) {
      return json(
        { success: false, error: "Unable to settle transaction." },
        503,
      );
    }

    return json({
      success: true,
      status: "successful",
      reference: transaction.reference_number,
    });
  }

  if (state === "failed") {
    const refund = await refundWallet(
      admin,
      transaction,
      callback,
      `ClubKonnect callback reported failure: ${text || code || callbackRemark || "unknown failure"}`,
    );

    const updated = await updateTransaction(admin, transaction, {
      status: "failed",
      provider: "clubkonnect",
      provider_reference:
        providerOrderId || transaction.provider_reference || providerRequestId,
      completed_at: new Date().toISOString(),
      metadata: {
        ...currentMetadata,
        clubkonnect_order_id:
          providerOrderId || currentMetadata.clubkonnect_order_id || null,
        clubkonnect_request_id:
          providerRequestId || currentMetadata.clubkonnect_request_id || null,
        clubkonnect_statuscode: code,
        clubkonnect_status: text,
        clubkonnect_remark: callbackRemark,
        clubkonnect_callback: safeCallback,
        reconciliation_required: !refund.success,
        refunded: refund.success,
        refund_completed: refund.success,
        refund_pending: !refund.success,
        refund_error: refund.error || null,
      },
    });

    if (!updated || !refund.success) {
      return json(
        {
          success: false,
          status: "failed",
          reference: transaction.reference_number,
          refund_pending: !refund.success,
        },
        503,
      );
    }

    return json({
      success: true,
      status: "failed",
      reference: transaction.reference_number,
      refunded: true,
    });
  }

  const updated = await updateTransaction(admin, transaction, {
    status: "pending",
    provider: "clubkonnect",
    provider_reference:
      providerOrderId || transaction.provider_reference || providerRequestId,
    metadata: {
      ...currentMetadata,
      clubkonnect_order_id:
        providerOrderId || currentMetadata.clubkonnect_order_id || null,
      clubkonnect_request_id:
        providerRequestId || currentMetadata.clubkonnect_request_id || null,
      clubkonnect_statuscode: code,
      clubkonnect_status: text,
      clubkonnect_remark: callbackRemark,
      clubkonnect_callback: safeCallback,
      reconciliation_required: true,
      last_callback_at: new Date().toISOString(),
    },
  });

  if (!updated) {
    return json(
      { success: false, error: "Unable to record callback." },
      503,
    );
  }

  return json({
    success: true,
    status: "pending",
    reference: transaction.reference_number,
  });
};

Deno.serve(handler);
