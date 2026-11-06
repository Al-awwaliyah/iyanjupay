import { adminClient } from "../_shared/auth.ts";
import { processFlutterwaveWebhookEvent } from "../_shared/flutterwave-event-router.ts";

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  let result = 0;
  for (let i = 0; i < aBytes.length; i++) result |= aBytes[i] ^ bBytes[i];
  return result === 0;
}

function parseResult(raw: string): Record<string, any> | null {
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

async function persistOutcome(
  supabase: any,
  event: any,
  workerId: string,
  status: "completed" | "ignored" | "needs_review",
  result: Record<string, unknown> | null,
  errorMessage: string | null,
) {
  const { data, error } = await supabase.rpc("finish_flutterwave_webhook_event", {
    p_event_key: event.event_key,
    p_worker_id: workerId,
    p_status: status,
    p_result: result,
    p_error: errorMessage,
  });

  if (error || data !== true) {
    throw error ?? new Error("Queue event lease was no longer owned by this worker");
  }
}

async function scheduleRetry(
  supabase: any,
  event: any,
  workerId: string,
  errorMessage: string,
) {
  const { data, error } = await supabase.rpc("retry_flutterwave_webhook_event", {
    p_event_key: event.event_key,
    p_worker_id: workerId,
    p_error: errorMessage.slice(0, 4000),
    p_retryable: true,
  });

  if (error || !data) {
    throw error ?? new Error("Queue retry state could not be saved");
  }
  return data as string;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  const expectedSecret = Deno.env.get("FLW_WORKER_SECRET") ?? "";
  const suppliedSecret = req.headers.get("x-worker-secret") ?? "";
  if (!expectedSecret || !safeEqual(expectedSecret, suppliedSecret)) {
    return jsonResponse({ success: false, error: "Unauthorized" }, 401);
  }

  let requestedBatchSize = 3;
  try {
    const body = await req.json();
    const parsed = Number(body?.batch_size ?? 3);
    if (Number.isFinite(parsed)) requestedBatchSize = Math.max(1, Math.min(5, Math.floor(parsed)));
  } catch {
    // An empty body is acceptable; the default batch size is used.
  }

  const workerId = crypto.randomUUID();
  const supabase = adminClient();

  const { data: events, error: claimError } = await supabase.rpc(
    "claim_flutterwave_webhook_events",
    {
      p_worker_id: workerId,
      p_limit: requestedBatchSize,
    },
  );

  if (claimError) {
    console.error("Could not claim Flutterwave webhook events:", claimError);
    return jsonResponse({ success: false, error: "Unable to claim webhook events" }, 503);
  }

  const summary = {
    success: true,
    claimed: Array.isArray(events) ? events.length : 0,
    completed: 0,
    ignored: 0,
    needs_review: 0,
    retrying: 0,
    failed: 0,
    queue_state_errors: 0,
  };

  for (const event of Array.isArray(events) ? events : []) {
    try {
      const response = await processFlutterwaveWebhookEvent(event.payload, supabase);
      const raw = await response.text();
      const result = parseResult(raw);

      if (!result) {
        const retryStatus = await scheduleRetry(
          supabase,
          event,
          workerId,
          `Handler returned non-JSON response (HTTP ${response.status})`,
        );
        if (retryStatus === "failed") summary.failed++;
        else summary.retrying++;
        console.error("Flutterwave handler returned invalid JSON:", event.event_key, retryStatus);
        continue;
      }

      // These responses indicate that money movement may already have happened
      // but a related record needs manual reconciliation. Do not repeat a
      // completed wallet debit/credit just to retry metadata repair.
      if (result.needs_review === true || result.pending_reconciliation === true || result.warning) {
        await persistOutcome(
          supabase,
          event,
          workerId,
          "needs_review",
          result,
          String(result.warning ?? result.error ?? "Manual reconciliation required"),
        );
        summary.needs_review++;
        continue;
      }

      if (response.status >= 500 || response.status === 429) {
        const retryStatus = await scheduleRetry(
          supabase,
          event,
          workerId,
          String(result.error ?? `Handler returned HTTP ${response.status}`),
        );
        if (retryStatus === "failed") summary.failed++;
        else summary.retrying++;
        console.warn("Flutterwave event scheduled for retry:", event.event_key, retryStatus);
        continue;
      }

      if (result.success === false) {
        await persistOutcome(
          supabase,
          event,
          workerId,
          "needs_review",
          result,
          String(result.error ?? "Handler rejected event; manual review required"),
        );
        summary.needs_review++;
        continue;
      }

      if (result.ignored === true) {
        await persistOutcome(supabase, event, workerId, "ignored", result, null);
        summary.ignored++;
        continue;
      }

      if (result.success === true) {
        await persistOutcome(supabase, event, workerId, "completed", result, null);
        summary.completed++;
        continue;
      }

      const retryStatus = await scheduleRetry(
        supabase,
        event,
        workerId,
        "Handler response did not contain a recognized outcome",
      );
      if (retryStatus === "failed") summary.failed++;
      else summary.retrying++;
      console.warn("Unrecognized Flutterwave handler outcome:", event.event_key, retryStatus);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown webhook worker error";
      try {
        const retryStatus = await scheduleRetry(supabase, event, workerId, message);
        if (retryStatus === "failed") summary.failed++;
        else summary.retrying++;
        console.error("Flutterwave event processing failed; retry scheduled:", event.event_key, retryStatus, error);
      } catch (queueError) {
        summary.queue_state_errors++;
        console.error("Could not persist Flutterwave event retry state:", event.event_key, queueError, "Original error:", error);
      }
    }
  }

  return jsonResponse(summary, summary.queue_state_errors > 0 ? 503 : 200);
});
