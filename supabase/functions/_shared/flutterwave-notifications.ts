/**
 * Creates a Flutterwave transaction notification through a database RPC.
 * The RPC atomically deduplicates the notification before inserting it.
 * Existing public.notifications triggers remain responsible for in-app
 * delivery state and push fan-out.
 */
export async function createFlutterwaveNotification(
  supabase: any,
  params: {
    kind: "deposit" | "transfer" | "chargeback";
    userId: string;
    transactionId: string;
    type: string;
    title: string;
    message: string;
    amount: number;
    metadata: Record<string, unknown>;
  },
): Promise<void> {
  const idempotencyKey =
    `flutterwave:${params.kind}:${params.transactionId}:${params.type}`;

  const { data, error } = await supabase.rpc(
    "create_flutterwave_notification",
    {
      p_idempotency_key: idempotencyKey,
      p_user_id: params.userId,
      p_transaction_id: params.transactionId,
      p_type: params.type,
      p_title: params.title,
      p_message: params.message,
      p_amount: params.amount,
      p_metadata: params.metadata,
    },
  );

  if (error) {
    console.error("Flutterwave notification RPC failed:", error);
    throw new Error("Flutterwave notification could not be recorded");
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.notification_id) {
    console.error("Flutterwave notification RPC returned no notification ID:", data);
    throw new Error("Flutterwave notification could not be confirmed");
  }
}
