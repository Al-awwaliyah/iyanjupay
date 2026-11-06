import { handleDepositWebhook } from "./flutterwave-deposit-handler.ts";
import { handleTransferWebhook } from "./flutterwave-transfer-handler.ts";
import { handleChargebackWebhook } from "./flutterwave-chargeback-handler.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

/** Routes an already signature-verified event to its existing business handler. */
export async function processFlutterwaveWebhookEvent(
  payload: any,
  supabase: any,
): Promise<Response> {
  const event = payload?.type ?? payload?.event ?? null;

  if (
    event === "transfer.disburse" ||
    event === "transfer.completed" ||
    event === "Transfer"
  ) {
    return await handleTransferWebhook(payload, supabase);
  }

  if (
    event === "chargeback" ||
    event === "chargeback.created" ||
    event === "chargeback.updated" ||
    event === "chargeback.completed"
  ) {
    return await handleChargebackWebhook(payload, supabase);
  }

  if (event && event !== "charge.completed") {
    return jsonResponse({ success: true, ignored: true, event });
  }

  return await handleDepositWebhook(payload, supabase);
}
