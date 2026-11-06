import { adminClient } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, flutterwave-signature, verif-hash",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  let result = 0;
  for (let i = 0; i < aBytes.length; i++) result |= aBytes[i] ^ bBytes[i];
  return result === 0;
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
  }
  return btoa(binary);
}

async function generateSignature(rawBody: string, secretHash: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secretHash),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  return arrayBufferToBase64(signature);
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function getSubjectKey(payload: any, eventType: string): string | null {
  const data = payload?.data ?? {};
  const event = eventType.toLowerCase();

  if (event.startsWith("transfer") || event === "transfer") {
    const id = data?.id ?? data?.reference ?? data?.tx_ref ?? data?.txRef;
    return id ? `transfer:${String(id)}`.slice(0, 200) : null;
  }

  if (event.startsWith("chargeback")) {
    const id = data?.charge_id ?? data?.chargeId ?? data?.transaction_id ?? data?.transactionId ?? data?.id;
    return id ? `charge:${String(id)}`.slice(0, 200) : null;
  }

  if (event === "charge.completed" || eventType === "unknown") {
    const id = data?.id;
    return id ? `charge:${String(id)}`.slice(0, 200) : null;
  }

  return null;
}

function requestWorkerInBackground() {
  const baseUrl = Deno.env.get("SUPABASE_URL");
  const workerSecret = Deno.env.get("FLW_WORKER_SECRET");
  if (!baseUrl || !workerSecret) return;

  const task = fetch(`${baseUrl.replace(/\/$/, "")}/functions/v1/flutterwave-webhook-worker`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-worker-secret": workerSecret,
    },
    body: JSON.stringify({ batch_size: 3 }),
  }).then(async (response) => {
    if (!response.ok) {
      console.error("Background Flutterwave worker invocation failed:", response.status, await response.text());
    }
  }).catch((error) => {
    console.error("Background Flutterwave worker invocation error:", error);
  });

  const edgeRuntime = (globalThis as any).EdgeRuntime;
  if (typeof edgeRuntime?.waitUntil === "function") {
    edgeRuntime.waitUntil(task);
  } else {
    // The GitHub Actions schedule is the durable fallback if background
    // execution is unavailable in this Edge Runtime.
    void task;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    const webhookSecret = Deno.env.get("FLW_SECRET_HASH") ?? "";
    if (!webhookSecret) {
      console.error("FLW_SECRET_HASH is not configured");
      return jsonResponse({ success: false, error: "Webhook verification is unavailable" }, 503);
    }

    const rawBody = await req.text();
    if (!rawBody) {
      return jsonResponse({ success: false, error: "Empty webhook body" }, 400);
    }

    const signature = req.headers.get("flutterwave-signature");
    const legacyHash = req.headers.get("verif-hash");

    if (signature) {
      const expected = await generateSignature(rawBody, webhookSecret);
      if (!safeEqual(expected, signature)) {
        console.error("Invalid Flutterwave signature");
        return jsonResponse({ success: false, error: "Invalid webhook signature" }, 401);
      }
    } else if (legacyHash) {
      if (!safeEqual(legacyHash, webhookSecret)) {
        console.error("Invalid Flutterwave legacy hash");
        return jsonResponse({ success: false, error: "Invalid webhook signature" }, 401);
      }
    } else {
      return jsonResponse({ success: false, error: "Missing Flutterwave webhook signature" }, 401);
    }

    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return jsonResponse({ success: false, error: "Invalid webhook JSON payload" }, 400);
    }

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return jsonResponse({ success: false, error: "Invalid webhook payload shape" }, 400);
    }

    const eventType = String(payload?.type ?? payload?.event ?? "unknown").slice(0, 120);
    const eventKey = await sha256Hex(rawBody);
    const subjectKey = getSubjectKey(payload, eventType);

    const supabase = adminClient();
    const { data, error } = await supabase.rpc("enqueue_flutterwave_webhook_event", {
      p_event_key: eventKey,
      p_event_type: eventType,
      p_subject_key: subjectKey,
      p_payload: payload,
    });

    if (error) {
      console.error("Could not persist Flutterwave webhook event:", error);
      return jsonResponse({ success: false, error: "Webhook could not be safely queued" }, 503);
    }

    const queued = Array.isArray(data) ? data[0] : data;
    if (!queued?.queued_event_key) {
      console.error("Flutterwave enqueue RPC returned no event row:", data);
      return jsonResponse({ success: false, error: "Webhook could not be safely queued" }, 503);
    }

    // The event is durable before we acknowledge Flutterwave. This kick is
    // best-effort; GitHub Actions also invokes the worker every five minutes.
    requestWorkerInBackground();

    return jsonResponse({
      success: true,
      queued: true,
      duplicate_delivery: Number(queued.delivery_count ?? 1) > 1,
      queue_status: queued.queue_status,
    }, 200);
  } catch (error) {
    console.error("Flutterwave webhook receiver error:", error);
    return jsonResponse({ success: false, error: "Webhook receiver failed" }, 503);
  }
});
