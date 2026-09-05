import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BASE_URL = "https://www.nellobytesystems.com";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

type JsonObject = Record<string, any>;
type State = "successful" | "failed" | "pending";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: CORS_HEADERS,
  });
}

function s(value: unknown): string {
  return String(value ?? "").trim();
}

function n(value: unknown): number {
  const valueNumber = Number(value);
  return Number.isFinite(valueNumber) ? valueNumber : 0;
}

function normalize(value: unknown): string {
  return s(value).toLowerCase().replace(/[\s-]+/g, "_");
}

function statusCode(body: JsonObject): number | null {
  const candidates = [
    body?.statuscode,
    body?.StatusCode,
    body?.statusCode,
    body?.code,
    body?.Code,
    body?.data?.statuscode,
    body?.data?.StatusCode,
  ];

  for (const value of candidates) {
    const parsed = Number(value);
    if (Number.isInteger(parsed)) return parsed;
  }

  return null;
}

function statusText(body: JsonObject): string {
  return s(
    body?.orderstatus ??
      body?.OrderStatus ??
      body?.status ??
      body?.Status ??
      body?.message ??
      body?.Message ??
      body?.orderremark ??
      body?.OrderRemark,
  ).toUpperCase();
}

function classify(body: JsonObject, httpOk: boolean): {
  state: State;
  code: number | null;
  text: string;
} {
  const code = statusCode(body);
  const text = statusText(body);

  if (httpOk && code === 200) {
    return { state: "successful", code, text };
  }

  if (code === 201 || code === 299) {
    return { state: "pending", code, text };
  }

  if (code === 100 || code === 199 || code === 300 || code === 399) {
    return { state: "pending", code, text };
  }

  if (code !== null && code >= 600 && code <= 699) {
    return { state: "pending", code, text };
  }

  if (code !== null && code >= 400 && code <= 599) {
    return { state: "failed", code, text };
  }

  const failed = new Set([
    "FAILED",
    "FAILURE",
    "ORDER_ERROR",
    "ORDER_CANCELLED",
    "CANCELLED",
    "CANCELED",
    "DECLINED",
    "REJECTED",
    "TRANSACTION_FAILED",
    "INVALID_TRANSACTION",
  ]);

  if (failed.has(text)) {
    return { state: "failed", code, text };
  }

  return { state: "pending", code, text };
}

function orderId(body: JsonObject): string | null {
  const value =
    body?.orderid ??
    body?.OrderID ??
    body?.orderId ??
    body?.data?.orderid ??
    body?.data?.OrderID;
  return s(value) || null;
}

function requestId(body: JsonObject): string | null {
  const value =
    body?.requestid ??
    body?.RequestID ??
    body?.requestId ??
    body?.data?.requestid ??
    body?.data?.RequestID;
  return s(value) || null;
}

function safeResponse(body: JsonObject): JsonObject {
  const output: JsonObject = {};
  for (const [key, value] of Object.entries(body ?? {})) {
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
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      (typeof value === "object" && value !== null)
    ) {
      output[key] = value;
    }
  }
  return output;
}

async function providerQuery(
  userId: string,
  apiKey: string,
  params: Record<string, string>,
) {
  const url = new URL(`${BASE_URL}/APIQueryV1.asp`);
  url.searchParams.set("UserID", userId);
  url.searchParams.set("APIKey", apiKey);

  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  const raw = await response.text();
  let body: JsonObject = {};

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      body = parsed;
    }
  } catch {
    body = { raw };
  }

  return { ok: response.ok, status: response.status, body };
}

async function isAdmin(admin: any, userId: string, write = false) {
  const allowedRoles = write
    ? ["super_admin", "operations_admin", "finance_admin"]
    : [
        "super_admin",
        "operations_admin",
        "finance_admin",
        "support_admin",
        "compliance_admin",
        "read_only_admin",
      ];

  const { data, error } = await admin
    .from("support_admins")
    .select("role, is_active")
    .eq("user_id", userId)
    .eq("is_active", true)
    .in("role", allowedRoles)
    .limit(1)
    .maybeSingle();

  return !error && !!data;
}

async function refundWallet(admin: any, transaction: any, reason: string) {
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
  const amount = n(transaction?.amount);
  const reference = s(transaction?.reference_number);

  if (!userId || !reference || amount <= 0) {
    return { success: false, alreadyRefunded: false, error: "Invalid transaction refund data." };
  }

  const refundReference = `REFUND_${reference}`;

  const { error } = await admin.rpc("refund_wallet", {
    _user_id: userId,
    _amount: amount,
    _description: "ClubKonnect service payment reversal",
    _idempotency_key: refundReference,
    _reference: refundReference,
    _metadata: {
      original_reference: reference,
      refund_reference: refundReference,
      provider: "clubkonnect",
      reason,
    },
  });

  return {
    success: !error,
    alreadyRefunded: false,
    error: error?.message ?? null,
  };
}

async function findTransaction(admin: any, reference: string, transactionId?: string) {
  if (transactionId) {
    const { data } = await admin
      .from("transactions")
      .select("*")
      .eq("id", transactionId)
      .eq("provider", "clubkonnect")
      .maybeSingle();
    if (data) return data;
  }

  const { data: byReference } = await admin
    .from("transactions")
    .select("*")
    .eq("provider", "clubkonnect")
    .eq("reference_number", reference)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (byReference) return byReference;

  const { data: byProviderReference } = await admin
    .from("transactions")
    .select("*")
    .eq("provider", "clubkonnect")
    .eq("provider_reference", reference)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return byProviderReference ?? null;
}

async function upsertReconciliation(
  admin: any,
  transaction: any,
  providerBody: JsonObject,
  classified: ReturnType<typeof classify>,
  providerOrder: string | null,
  providerRequest: string,
  state: State,
) {
  const providerReference = providerOrder ?? providerRequest ?? transaction.reference_number;
  const metadata =
    transaction?.metadata && typeof transaction.metadata === "object" && !Array.isArray(transaction.metadata)
      ? transaction.metadata
      : {};

  const reconciliationStatus =
    state === "successful"
      ? "matched"
      : state === "failed"
        ? "exception"
        : "pending";

  const { error } = await admin
    .from("reconciliation_records")
    .upsert(
      {
        source: "provider",
        provider: "clubkonnect",
        provider_reference: providerReference,
        transaction_id: transaction.id,
        internal_reference: transaction.reference_number,
        transaction_type: transaction.transaction_type,
        amount: n(transaction.amount),
        currency: transaction.currency ?? "NGN",
        provider_status: classified.text || String(classified.code ?? "UNKNOWN"),
        internal_status: transaction.status,
        reconciliation_status: reconciliationStatus,
        amount_difference: 0,
        provider_created_at: null,
        provider_completed_at: state === "successful" ? new Date().toISOString() : null,
        internal_created_at: transaction.created_at,
        internal_completed_at: transaction.completed_at ?? null,
        account_reference:
          metadata.account_reference ??
          metadata.phone_number ??
          metadata.smartcard_number ??
          metadata.meter_number ??
          null,
        metadata: {
          ...metadata,
          clubkonnect_order_id: providerOrder,
          clubkonnect_request_id: providerRequest,
          clubkonnect_statuscode: classified.code,
          clubkonnect_status: classified.text,
          clubkonnect_response: safeResponse(providerBody),
          reconciled_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "provider,provider_reference" },
    );

  if (error) {
    throw new Error(`Failed to update reconciliation record: ${error.message}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed." }, 405);

  const supabaseUrl = s(Deno.env.get("SUPABASE_URL"));
  const anonKey = s(Deno.env.get("SUPABASE_ANON_KEY"));
  const serviceRoleKey = s(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  const userId = s(Deno.env.get("CLUBKONNECT_USER_ID") ?? Deno.env.get("CLUBKONNECT_USERID"));
  const apiKey = s(Deno.env.get("CLUBKONNECT_API_KEY") ?? Deno.env.get("CLUBKONNECT_APIKEY"));

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ success: false, error: "Supabase function configuration is incomplete." }, 500);
  }

  if (!userId || !apiKey) {
    return json({ success: false, error: "ClubKonnect credentials are not configured." }, 500);
  }

  const authorization = req.headers.get("Authorization");
  if (!authorization) return json({ success: false, error: "Unauthorized." }, 401);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });

  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return json({ success: false, error: "Unauthorized." }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (!(await isAdmin(admin, authData.user.id, true))) {
    return json({ success: false, error: "Financial admin authorization required." }, 403);
  }

  let payload: JsonObject;
  try {
    payload = await req.json();
  } catch {
    return json({ success: false, error: "Invalid JSON body." }, 400);
  }

  const reference = s(payload.reference ?? payload.internal_reference);
  const transactionId = s(payload.transaction_id) || undefined;

  if (!reference && !transactionId) {
    return json({ success: false, error: "A transaction reference is required." }, 400);
  }

  const transaction = await findTransaction(admin, reference, transactionId);
  if (!transaction) {
    return json({ success: false, error: "ClubKonnect transaction not found." }, 404);
  }

  if (normalize(transaction.provider) !== "clubkonnect") {
    return json({ success: false, error: "This transaction is not a ClubKonnect transaction." }, 400);
  }

  const metadata =
    transaction.metadata && typeof transaction.metadata === "object" && !Array.isArray(transaction.metadata)
      ? transaction.metadata
      : {};

  const providerOrder = s(
    metadata.clubkonnect_order_id ?? transaction.provider_reference,
  ) || null;

  const providerRequest = s(
    metadata.clubkonnect_request_id ?? metadata.request_id ?? transaction.reference_number,
  );

  let providerResponse: { ok: boolean; status: number; body: JsonObject };
  try {
    providerResponse = await providerQuery(
      userId,
      apiKey,
      providerOrder ? { OrderID: providerOrder } : { RequestID: providerRequest },
    );
  } catch (error) {
    console.error("ClubKonnect reconciliation network error:", error);
    return json({
      success: true,
      state: "pending",
      reference: transaction.reference_number,
      transaction_id: transaction.id,
      message: "ClubKonnect could not be reached. The transaction remains pending.",
    }, 200);
  }

  const classified = classify(providerResponse.body, providerResponse.ok);
  const actualOrder = orderId(providerResponse.body) ?? providerOrder;
  const actualRequest = requestId(providerResponse.body) ?? providerRequest;
  const safe = safeResponse(providerResponse.body);

  try {
    if (classified.state === "successful") {
      const existingStatus = normalize(transaction.status);

      if (![
        "successful",
        "success",
        "completed",
        "complete",
        "succeeded",
      ].includes(existingStatus)) {
        const mergedMetadata = {
          ...metadata,
          clubkonnect_order_id: actualOrder,
          clubkonnect_request_id: actualRequest,
          clubkonnect_statuscode: classified.code,
          clubkonnect_status: classified.text,
          clubkonnect_response: safe,
          reconciliation_required: false,
          reconciled_at: new Date().toISOString(),
        };

        const { error: updateError } = await admin
          .from("transactions")
          .update({
            status: "successful",
            provider: "clubkonnect",
            provider_reference: actualOrder ?? actualRequest,
            completed_at: new Date().toISOString(),
            metadata: mergedMetadata,
          })
          .eq("id", transaction.id);

        if (updateError) throw updateError;
      }

      await upsertReconciliation(
        admin,
        transaction,
        providerResponse.body,
        classified,
        actualOrder,
        actualRequest,
        "successful",
      );

      return json({
        success: true,
        state: "successful",
        reference: transaction.reference_number,
        transaction_id: transaction.id,
        order_id: actualOrder,
        request_id: actualRequest,
        statuscode: classified.code,
        orderstatus: classified.text,
        orderremark: s(providerResponse.body?.orderremark ?? providerResponse.body?.OrderRemark) || null,
        already_successful: ["successful", "success", "completed", "complete", "succeeded"].includes(existingStatus),
        message: "ClubKonnect confirms the transaction as successful.",
      });
    }

    if (classified.state === "failed") {
      const existingStatus = normalize(transaction.status);

      if (["successful", "success", "completed", "complete", "succeeded"].includes(existingStatus)) {
        await upsertReconciliation(
          admin,
          transaction,
          providerResponse.body,
          { ...classified, state: "successful" },
          actualOrder,
          actualRequest,
          "successful",
        );

        return json({
          success: true,
          state: "successful",
          reference: transaction.reference_number,
          transaction_id: transaction.id,
          order_id: actualOrder,
          request_id: actualRequest,
          statuscode: classified.code,
          message: "The internal transaction was already successful; it was not downgraded.",
          already_successful: true,
        });
      }

      const refund = await refundWallet(
        admin,
        transaction,
        `Manual ClubKonnect reconciliation returned ${classified.code ?? classified.text}.`,
      );

      const mergedMetadata = {
        ...metadata,
        clubkonnect_order_id: actualOrder,
        clubkonnect_request_id: actualRequest,
        clubkonnect_statuscode: classified.code,
        clubkonnect_status: classified.text,
        clubkonnect_response: safe,
        refunded: refund.success || refund.alreadyRefunded,
        refund_pending: !refund.success && !refund.alreadyRefunded,
        reconciliation_required: !refund.success,
        reconciled_at: new Date().toISOString(),
      };

      const { error: updateError } = await admin
        .from("transactions")
        .update({
          status: "failed",
          provider: "clubkonnect",
          provider_reference: actualOrder ?? actualRequest,
          metadata: mergedMetadata,
        })
        .eq("id", transaction.id);

      if (updateError) throw updateError;

      await upsertReconciliation(
        admin,
        transaction,
        providerResponse.body,
        classified,
        actualOrder,
        actualRequest,
        "failed",
      );

      return json({
        success: refund.success || refund.alreadyRefunded,
        state: "failed",
        reference: transaction.reference_number,
        transaction_id: transaction.id,
        order_id: actualOrder,
        request_id: actualRequest,
        statuscode: classified.code,
        refunded: refund.success || refund.alreadyRefunded,
        message: refund.success || refund.alreadyRefunded
          ? "ClubKonnect confirms failure and the wallet refund is complete."
          : "ClubKonnect confirms failure, but the refund still requires retry.",
        error: refund.success || refund.alreadyRefunded ? undefined : refund.error,
      }, refund.success || refund.alreadyRefunded ? 200 : 503);
    }

    const mergedMetadata = {
      ...metadata,
      clubkonnect_order_id: actualOrder,
      clubkonnect_request_id: actualRequest,
      clubkonnect_statuscode: classified.code,
      clubkonnect_status: classified.text,
      clubkonnect_response: safe,
      reconciliation_required: true,
      last_reconciled_at: new Date().toISOString(),
    };

    const { error: pendingError } = await admin
      .from("transactions")
      .update({
        status: "pending",
        provider: "clubkonnect",
        provider_reference: actualOrder ?? actualRequest,
        metadata: mergedMetadata,
      })
      .eq("id", transaction.id);

    if (pendingError) throw pendingError;

    await upsertReconciliation(
      admin,
      transaction,
      providerResponse.body,
      classified,
      actualOrder,
      actualRequest,
      "pending",
    );

    return json({
      success: true,
      state: "pending",
      reference: transaction.reference_number,
      transaction_id: transaction.id,
      order_id: actualOrder,
      request_id: actualRequest,
      statuscode: classified.code,
      orderstatus: classified.text,
      orderremark: s(providerResponse.body?.orderremark ?? providerResponse.body?.OrderRemark) || null,
      message: "ClubKonnect has not returned a definitive final result. The transaction remains pending.",
    });
  } catch (error) {
    console.error("ClubKonnect reconciliation update failed:", error);
    return json({ success: false, error: "Unable to complete reconciliation safely." }, 500);
  }
});
