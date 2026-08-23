import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

   const corsHeaders = {
     "Access-Control-Allow-Origin": "*",

     "Access-Control-Allow-Headers":
       "authorization, x-client-info, apikey, content-type",

     "Access-Control-Allow-Methods":
       "POST, OPTIONS",
   };

   Deno.serve(async (req) => {
     // ==========================================================
     // CORS
     // ==========================================================

     if (req.method === "OPTIONS") {
       return new Response("ok", {
         headers: corsHeaders,
       });
     }

     if (req.method !== "POST") {
       return new Response(
         JSON.stringify({
           success: false,
           error: "Method not allowed",
         }),
         {
           status: 405,
           headers: {
             ...corsHeaders,
             "Content-Type":
               "application/json",
           },
         }
       );
     }

     try {
       // ==========================================================
       // ENVIRONMENT
       // ==========================================================

       const supabaseUrl =
         Deno.env.get(
           "SUPABASE_URL"
         ) ?? "";

       const serviceRoleKey =
         Deno.env.get(
           "SUPABASE_SERVICE_ROLE_KEY"
         ) ?? "";

       const anonKey =
         Deno.env.get(
           "SUPABASE_ANON_KEY"
         ) ?? "";

       if (
         !supabaseUrl ||
         !serviceRoleKey ||
         !anonKey
       ) {
         throw new Error(
           "Supabase environment variables are not configured."
         );
       }

       // ==========================================================
       // AUTHORIZATION
       // ==========================================================

       const authHeader =
         req.headers.get(
           "Authorization"
         );

       if (!authHeader) {
         return new Response(
           JSON.stringify({
             success: false,
             error: "Unauthorized",
           }),
           {
             status: 401,
             headers: {
               ...corsHeaders,
               "Content-Type":
                 "application/json",
             },
           }
         );
       }

       // ==========================================================
       // USER CLIENT
       // ==========================================================

       const userClient =
         createClient(
           supabaseUrl,
           anonKey,
           {
             global: {
               headers: {
                 Authorization:
                   authHeader,
               },
             },
           }
         );

       const {
         data: {
           user,
         },
         error: userError,
       } =
         await userClient.auth.getUser();

       if (
         userError ||
         !user
       ) {
         return new Response(
           JSON.stringify({
             success: false,
             error: "Unauthorized",
           }),
           {
             status: 401,
             headers: {
               ...corsHeaders,
               "Content-Type":
                 "application/json",
             },
           }
         );
       }

       // ==========================================================
       // ADMIN CLIENT
       // ==========================================================

       const admin =
         createClient(
           supabaseUrl,
           serviceRoleKey,
           {
             auth: {
               autoRefreshToken:
                 false,

               persistSession:
                 false,
             },
           }
         );

       // ==========================================================
       // REQUEST BODY
       // ==========================================================

       let body: any;

       try {
         body =
           await req.json();
       } catch {
         return new Response(
           JSON.stringify({
             success: false,
             error:
               "Invalid request body.",
           }),
           {
             status: 400,
             headers: {
               ...corsHeaders,
               "Content-Type":
                 "application/json",
             },
           }
         );
       }

       const walletId =
         String(
           body?.wallet_id ??
             body?.walletId ??
             ""
         ).trim();

       const amount =
         Number(
           body?.amount
         );

       const narration =
         String(
           body?.narration ??
             "IyanjuPay transfer"
         ).trim();

       const idempotencyKey =
         String(
           body?.idempotency_key ??
             body?.idempotencyKey ??
             ""
         ).trim();

       // ==========================================================
       // WALLET ID VALIDATION
       // ==========================================================

       if (
         !/^[0-9]{8}$/.test(
           walletId
         )
       ) {
         return new Response(
           JSON.stringify({
             success: false,
             error:
               "Invalid Wallet ID. Wallet ID must be exactly 8 digits.",
           }),
           {
             status: 400,
             headers: {
               ...corsHeaders,
               "Content-Type":
                 "application/json",
             },
           }
         );
       }

       // ==========================================================
       // AMOUNT VALIDATION
       // ==========================================================

       if (
         !Number.isFinite(
           amount
         ) ||
         amount <= 0
       ) {
         return new Response(
           JSON.stringify({
             success: false,
             error:
               "Transfer amount must be greater than zero.",
           }),
           {
             status: 400,
             headers: {
               ...corsHeaders,
               "Content-Type":
                 "application/json",
             },
           }
         );
       }

       // ==========================================================
       // TWO DECIMAL PLACES
       // ==========================================================

       const roundedAmount =
         Math.round(
           amount * 100
         ) / 100;

       if (
         roundedAmount !==
         amount
       ) {
         return new Response(
           JSON.stringify({
             success: false,
             error:
               "Transfer amount cannot have more than 2 decimal places.",
           }),
           {
             status: 400,
             headers: {
               ...corsHeaders,
               "Content-Type":
                 "application/json",
             },
           }
         );
       }

       // ==========================================================
       // FIND SENDER
       // ==========================================================

       const {
         data: senderWallet,
         error:
           senderWalletError,
       } = await admin
         .from("wallets")
         .select(
           "id, user_id, wallet_id, balance, held_balance, currency, status"
         )
         .eq(
           "user_id",
           user.id
         )
         .maybeSingle();

       if (
         senderWalletError
       ) {
         console.error(
           "Sender wallet lookup failed:",
           senderWalletError
         );

         throw senderWalletError;
       }

       if (
         !senderWallet
       ) {
         return new Response(
           JSON.stringify({
             success: false,
             error:
               "Sender wallet could not be found.",
           }),
           {
             status: 404,
             headers: {
               ...corsHeaders,
               "Content-Type":
                 "application/json",
             },
           }
         );
       }

       // ==========================================================
       // SENDER STATUS
       // ==========================================================

       if (
         senderWallet.status !==
         "active"
       ) {
         return new Response(
           JSON.stringify({
             success: false,
             error:
               "Your wallet is not active.",
           }),
           {
             status: 403,
             headers: {
               ...corsHeaders,
               "Content-Type":
                 "application/json",
             },
           }
         );
       }

       // ==========================================================
       // FIND RECIPIENT
       // ==========================================================

       const {
         data: recipientWallet,
         error:
           recipientWalletError,
       } = await admin
         .from("wallets")
         .select(
           "id, user_id, wallet_id, balance, held_balance, currency, status"
         )
         .eq(
           "wallet_id",
           walletId
         )
         .maybeSingle();

       if (
         recipientWalletError
       ) {
         console.error(
           "Recipient wallet lookup failed:",
           recipientWalletError
         );

         throw recipientWalletError;
       }

       if (
         !recipientWallet
       ) {
         return new Response(
           JSON.stringify({
             success: false,
             error:
               "IyanjuPay Wallet ID not found.",
           }),
           {
             status: 404,
             headers: {
               ...corsHeaders,
               "Content-Type":
                 "application/json",
             },
           }
         );
       }

       // ==========================================================
       // SELF TRANSFER
       // ==========================================================

       if (
         recipientWallet.user_id ===
         user.id
       ) {
         return new Response(
           JSON.stringify({
             success: false,
             error:
               "You cannot transfer money to your own wallet.",
           }),
           {
             status: 400,
             headers: {
               ...corsHeaders,
               "Content-Type":
                 "application/json",
             },
           }
         );
       }

       // ==========================================================
       // RECIPIENT STATUS
       // ==========================================================

       if (
         recipientWallet.status !==
         "active"
       ) {
         return new Response(
           JSON.stringify({
             success: false,
             error:
               "Recipient wallet is not active.",
           }),
           {
             status: 400,
             headers: {
               ...corsHeaders,
               "Content-Type":
                 "application/json",
             },
           }
         );
       }

       // ==========================================================
       // CURRENCY
       // ==========================================================

       if (
         senderWallet.currency !==
         recipientWallet.currency
       ) {
         return new Response(
           JSON.stringify({
             success: false,
             error:
               "Sender and recipient wallets must use the same currency.",
           }),
           {
             status: 400,
             headers: {
               ...corsHeaders,
               "Content-Type":
                 "application/json",
             },
           }
         );
       }

       // ==========================================================
       // RESERVE KYC DAILY TRANSFER LIMIT
       const { data: kycReservation, error: kycReservationError } = await admin.rpc("reserve_kyc_daily_transfer", { _user_id: user.id, _amount: roundedAmount });
       if (kycReservationError) {
         return new Response(JSON.stringify({ success: false, stage: "kyc_limit", error: "Unable to reserve your daily transfer limit. Please try again." }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
       }
       if (!kycReservation?.success || !kycReservation?.allowed) {
         return new Response(JSON.stringify({ success: false, stage: "kyc_limit", error: kycReservation?.error || "Daily transfer limit exceeded.", kyc_level: kycReservation?.kyc_level ?? null, daily_limit: kycReservation?.daily_limit ?? null, remaining: kycReservation?.remaining ?? null, requested_amount: roundedAmount, currency: "NGN" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
       }
       let kycReservationActive = true;
       const releaseKycReservation = async () => {
         if (!kycReservationActive) return true;
         const { data: r, error: e } = await admin.rpc("release_kyc_daily_transfer", { _user_id: user.id, _amount: roundedAmount });
         if (e || !r?.success) { console.error("KYC reservation release failed:", e || r); return false; }
         kycReservationActive = false; return true;
       };

       // CALL ATOMIC INTERNAL TRANSFER RPC
       // ==========================================================

       const {
         data,
         error,
       } = await admin.rpc(
         "execute_internal_transfer",
         {
           _sender_user_id:
             user.id,

           _recipient_wallet_id:
             walletId,

           _amount:
             roundedAmount,

           _narration:
             narration ||
             "IyanjuPay transfer",

           _idempotency_key:
             idempotencyKey ||
             null,
         }
       );

       if (error) {
         await releaseKycReservation();
         console.error(
           "Atomic internal transfer failed:",
           error
         );

         const message =
           error.message ||
           "Unable to complete IyanjuPay transfer.";

         const lowerMessage =
           message.toLowerCase();

         let status = 400;

         if (
           lowerMessage.includes(
             "not found"
           )
         ) {
           status = 404;
         }

         if (
           lowerMessage.includes(
             "not active"
           )
         ) {
           status = 403;
         }

         return new Response(
           JSON.stringify({
             success: false,
             error: message,
           }),
           {
             status,
             headers: {
               ...corsHeaders,
               "Content-Type":
                 "application/json",
             },
           }
         );
       }

       // ==========================================================
       // RPC RETURNS JSON
       // ==========================================================

       const result =
         data ?? {};

       // ==========================================================
       const { data: kycCompletion, error: kycCompletionError } = await admin.rpc("complete_kyc_daily_transfer", { _user_id: user.id, _amount: roundedAmount });
       if (kycCompletionError || !kycCompletion?.success) {
         console.error("KYC completion failed after successful internal transfer:", kycCompletionError || kycCompletion);
         return new Response(JSON.stringify({ success: true, transfer_type: "iyanjupay", status: "completed", kyc_status: "completion_pending", transaction_id: result.transaction_id ?? null, amount: Number(result.amount ?? roundedAmount), fee: 0, total_charged: Number(result.total_charged ?? roundedAmount), recipient_wallet_id: walletId, message: result.message ?? `₦${roundedAmount.toLocaleString()} sent successfully.` }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
       }
       kycReservationActive = false;

       const electronicFee = roundedAmount >= 10000 ? 50 : 0;
       let electronicFeeCharged = false;
       let electronicFeePending = false;
       let electronicFeeError: string | null = null;
       if (electronicFee > 0) {
         const feeKey = `ELECTRONIC_FEE_${result.transaction_id ?? idempotencyKey ?? walletId + "_" + roundedAmount}`;
         const { data: feeResult, error: feeError } = await admin.rpc("wallet_operation", { _user_id: user.id, _operation: "DEBIT", _amount: electronicFee, _description: `Electronic transfer fee for IyanjuPay transfer of ₦${roundedAmount.toLocaleString()}`, _idempotency_key: feeKey, _reference: `ELECTRONIC_FEE_${result.transaction_id ?? idempotencyKey ?? crypto.randomUUID()}`, _provider: "iyanjupay", _category: "electronic_transfer_fee", _metadata: { original_transaction_id: result.transaction_id ?? null, transfer_amount: roundedAmount, electronic_fee: electronicFee, currency: "NGN" } });
         if (feeError || !feeResult) { electronicFeePending = true; electronicFeeError = feeError?.message || "Electronic transfer fee could not be charged."; console.error("Electronic fee debit failed:", feeError || feeResult); } else electronicFeeCharged = true;
       }

       // SUCCESS

       // ==========================================================

       return new Response(
         JSON.stringify({
           success: true,

           transfer_type:
             "iyanjupay",

           status:
             "completed",

           reference:
             result.reference ??
             null,

           transaction_id:
             result.transaction_id ??
             null,

           credit_transaction_id:
             result.credit_transaction_id ??
             null,

           amount:
             Number(
               result.amount ??
                 roundedAmount
             ),

           fee:
             electronicFeeCharged ? electronicFee : 0,

           total_charged:
             Number(result.total_charged ?? roundedAmount) + (electronicFeeCharged ? electronicFee : 0),

           electronic_fee: electronicFee,
           electronic_fee_charged: electronicFeeCharged,
           electronic_fee_pending: electronicFeePending,
           electronic_fee_error: electronicFeeError,

           recipient_wallet_id:
             walletId,

           message:
             result.message ??
             `₦${roundedAmount.toLocaleString()} sent successfully.`,
         }),
         {
           status: 200,

           headers: {
             ...corsHeaders,
             "Content-Type":
               "application/json",
           },
         }
       );
     } catch (error) {
       console.error(
         "iyanjuPay-transfer error:",
         error
       );

       return new Response(
         JSON.stringify({
           success: false,

           error:
             error instanceof Error
               ? error.message
               : "Internal server error.",
         }),
         {
           status: 500,

           headers: {
             ...corsHeaders,
             "Content-Type":
               "application/json",
           },
         }
       );
     }
   });
