import {
     adminClient,
     getUser,
     json,
     flw,
   } from "../_shared/auth.ts";

   /**
    * ============================================================
    * IYANJUPAY - FLUTTERWAVE BANK TRANSFER
    * ============================================================
    *
    * TRANSFER FEE:
    *
    * Requested transfer       ₦100
    * IyanjuPay fee              ₦10
    * --------------------------------
    * Wallet charged           ₦110
    *
    * Flutterwave receives      ₦100
    *
    * SENDER IDENTIFICATION:
    *
    * Sender name:
    *   Retrieved securely from the authenticated user's profile.
    *
    * Narration:
    *   "SENDER NAME - IyanjuPay"
    *
    * Meta:
    *   sender_name
    *   sender_platform = IyanjuPay
    *
    * IMPORTANT:
    *
    * - beneficiary_name remains the recipient's name.
    * - IyanjuPay is NOT pretending to be the originating bank.
    * - Flutterwave/MFB remains the actual payout institution.
    * - The IyanjuPay identity is communicated through narration/meta.
    * - Flutterwave balance check uses transfer amount only.
    * - Wallet debit uses transfer amount + IyanjuPay fee.
    * - Flutterwave receives only the requested transfer amount.
    * - Failed provider requests refund the complete wallet charge.
    * - Accepted transfers remain PENDING until webhook/status confirms
    *   the final provider result.
    * ============================================================
    */

   /*
    * ============================================================
    * IYANJUPAY TRANSFER FEE
    * ============================================================
    */

   const IYANJUPAY_TRANSFER_FEE = 10;
const ELECTRONIC_FEE = 50;

   Deno.serve(async (req) => {
     /*
      * ==========================================================
      * CORS
      * ==========================================================
      */

     if (req.method === "OPTIONS") {
       return new Response(null, {
         status: 204,

         headers: {
           "Access-Control-Allow-Origin": "*",

           "Access-Control-Allow-Headers":
             "authorization, x-client-info, apikey, content-type",

           "Access-Control-Allow-Methods":
             "POST, OPTIONS",
         },
       });
     }

     /*
      * ==========================================================
      * METHOD
      * ==========================================================
      */

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
       /*
        * ========================================================
        * AUTHENTICATED USER
        * ========================================================
        */

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

       /*
        * ========================================================
        * ADMIN CLIENT
        * ========================================================
        */

       const supabase = adminClient();

       /*
        * ========================================================
        * GET SENDER PROFILE
        * ========================================================
        *
        * The sender is the authenticated IyanjuPay user.
        *
        * We intentionally DO NOT use beneficiary_name here.
        *
        * beneficiary_name = recipient
        * senderName       = authenticated IyanjuPay user
        */

       const {
         data: senderProfile,
         error: senderProfileError,
       } = await supabase
         .from("profiles")
         .select("full_name")
         .eq("id", user.id)
         .maybeSingle();

       if (senderProfileError) {
         console.error(
           "Unable to retrieve sender profile:",
           senderProfileError,
         );

         return json(
           {
             success: false,
             stage: "sender_profile",
             error:
               "Unable to retrieve your profile information.",
           },
           500,
         );
       }

       const senderName =
         String(
           senderProfile?.full_name ?? "",
         ).trim();

       if (!senderName) {
         return json(
           {
             success: false,
             stage: "sender_profile",
             error:
               "Your profile name is required before you can make a bank transfer.",
           },
           400,
         );
       }

       console.log(
         "IyanjuPay transfer sender:",
         JSON.stringify({
           user_id: user.id,
           sender_name: senderName,
           sender_platform: "IyanjuPay",
         }),
       );

       /*
        * ========================================================
        * REQUEST BODY
        * ========================================================
        */

       let body: any;

       try {
         body = await req.json();
       } catch {
         return json(
           {
             success: false,
             error: "Invalid JSON request body",
           },
           400,
         );
       }

       /*
        * ========================================================
        * INPUTS
        * ========================================================
        */

       const amount = Number(body?.amount);

       const accountNumber = String(
         body?.account_number ?? "",
       ).replace(/\D/g, "");

       const accountBank = String(
         body?.account_bank ?? "",
       ).trim();

       const beneficiaryName = String(
         body?.beneficiary_name ?? "",
       ).trim();

       /*
        * ========================================================
        * SENDER/APP NARRATION
        * ========================================================
        *
        * We intentionally generate this server-side.
        *
        * Example:
        *
        * Aremu Lawal - IyanjuPay
        *
        * This prevents the frontend from pretending to be
        * another sender.
        */

       const narration =
         `${senderName} - IyanjuPay`;

       const idempotencyKey = String(
         body?.idempotency_key ?? "",
       ).trim();

       /*
        * ========================================================
        * VALIDATION
        * ========================================================
        */

       if (
         !Number.isFinite(amount) ||
         amount <= 0
       ) {
         return json(
           {
             success: false,
             error: "Invalid transfer amount",
           },
           400,
         );
       }

       /*
        * Prevent floating-point monetary values.
        */

       if (
         Math.round(amount * 100) !==
         amount * 100
       ) {
         return json(
           {
             success: false,
             error:
               "Transfer amount cannot contain more than 2 decimal places",
           },
           400,
         );
       }

       if (!/^\d{10}$/.test(accountNumber)) {
         return json(
           {
             success: false,
             error:
               "Account number must contain exactly 10 digits",
           },
           400,
         );
       }

       if (!accountBank) {
         return json(
           {
             success: false,
             error: "Bank code is required",
           },
           400,
         );
       }

       if (!/^\d+$/.test(accountBank)) {
         return json(
           {
             success: false,
             error: "Invalid bank code",
           },
           400,
         );
       }

       if (!beneficiaryName) {
         return json(
           {
             success: false,
             error: "Beneficiary name is required",
           },
           400,
         );
       }

       /*
        * ========================================================
        * CALCULATE TRANSFER FEE
        * ========================================================
        *
        * amount       = amount Flutterwave sends
        * fee          = IyanjuPay charge
        * totalCharged = amount removed from user's wallet
        */

       const fee =
         IYANJUPAY_TRANSFER_FEE;

       const totalCharged =
         amount + fee;

       /*
        * Monetary sanity check.
        */

       if (
         !Number.isFinite(totalCharged) ||
         totalCharged <= 0
       ) {
         return json(
           {
             success: false,
             error:
               "Unable to calculate transfer charge",
           },
           400,
         );
       }

       console.log(
         "IyanjuPay transfer pricing:",
         JSON.stringify({
           transfer_amount: amount,
           iyanjupay_fee: fee,
           total_charged: totalCharged,
           currency: "NGN",
         }),
       );

       /*
        * ========================================================
        * REFERENCE
        * ========================================================
        */

       const transferKey =
         idempotencyKey ||
         `TRANSFER_${user.id}_${crypto.randomUUID()}`;

       const reference =
         `IYANJUPAY_${crypto
           .randomUUID()
           .replaceAll("-", "")
           .slice(0, 28)}`;

       console.log(
         "IyanjuPay transfer request:",
         JSON.stringify({
           user_id: user.id,

           sender_name:
             senderName,

           sender_platform:
             "IyanjuPay",

           transfer_amount:
             amount,

           iyanjupay_fee:
             fee,

           total_charged:
             totalCharged,

           account_number:
             accountNumber,

           account_bank:
             accountBank,

           beneficiary_name:
             beneficiaryName,

           narration,

           reference,

           idempotency_key:
             transferKey,
         }),
       );

       /*
        * ========================================================
        * STEP 1
        *
        * CHECK FLUTTERWAVE AVAILABLE NGN BALANCE
        * ========================================================
        *
        * Flutterwave only needs enough money to execute the
        * provider transfer.
        *
        * IyanjuPay's ₦10 fee is NOT sent to Flutterwave.
        *
        * Flutterwave balance requirement = amount
        */

       console.log(
         "Checking Flutterwave NGN available balance...",
       );

       let balanceResponse;

       try {
         balanceResponse = await flw(
           "/balances",
           {
             method: "GET",
           },
         );
       } catch (error) {
         console.error(
           "Flutterwave balance request failed:",
           error,
         );

         return json(
           {
             success: false,
             stage: "flutterwave_balance",
             error:
               "Unable to verify Flutterwave balance. Please try again later.",
           },
           503,
         );
       }

       /*
        * ========================================================
        * VALIDATE BALANCE RESPONSE
        * ========================================================
        */

       if (
         !balanceResponse.ok ||
         balanceResponse.body?.status !==
           "success"
       ) {
         console.error(
           "Flutterwave balance API failure:",
           JSON.stringify({
             http_status:
               balanceResponse.status,

             body:
               balanceResponse.body,
           }),
         );

         return json(
           {
             success: false,
             stage: "flutterwave_balance",
             error:
               "Unable to verify Flutterwave balance. Please try again later.",
             provider_error:
               balanceResponse.body?.message ??
               null,
           },
           503,
         );
       }

       /*
        * ========================================================
        * EXTRACT NGN BALANCE
        * ========================================================
        */

       const balanceData =
         balanceResponse.body?.data;

       let ngnBalance: any = null;

       if (Array.isArray(balanceData)) {
         ngnBalance =
           balanceData.find(
             (item: any) =>
               String(
                 item?.currency ?? "",
               ).toUpperCase() === "NGN",
           );
       } else if (
         balanceData &&
         typeof balanceData === "object"
       ) {
         if (
           String(
             balanceData?.currency ?? "",
           ).toUpperCase() === "NGN"
         ) {
           ngnBalance = balanceData;
         }
       }

       const flutterwaveAvailableBalance =
         Number(
           ngnBalance?.available_balance ?? 0,
         );

       const flutterwaveLedgerBalance =
         Number(
           ngnBalance?.ledger_balance ?? 0,
         );

       console.log(
         "Flutterwave NGN balance:",
         JSON.stringify({
           available_balance:
             flutterwaveAvailableBalance,

           ledger_balance:
             flutterwaveLedgerBalance,

           required_for_transfer:
             amount,

           iyanjupay_fee:
             fee,

           user_total_charge:
             totalCharged,
         }),
       );

       if (
         !Number.isFinite(
           flutterwaveAvailableBalance,
         )
       ) {
         return json(
           {
             success: false,
             stage: "flutterwave_balance",
             error:
               "Unable to determine Flutterwave available balance.",
           },
           503,
         );
       }

       /*
        * ========================================================
        * STEP 2
        *
        * INSUFFICIENT FLUTTERWAVE BALANCE
        * ========================================================
        *
        * User wallet is NOT debited.
        */

       if (
         flutterwaveAvailableBalance <
         amount
       ) {
         console.warn(
           "Insufficient Flutterwave balance:",
           JSON.stringify({
             required:
               amount,

             available:
               flutterwaveAvailableBalance,

             user_total_charge:
               totalCharged,

             currency:
               "NGN",
           }),
         );

         return json(
           {
             success: false,

             stage:
               "flutterwave_balance",

             error:
               "Insufficient Flutterwave balance. Please fund your Flutterwave account.",

             transfer_amount:
               amount,

             fee,

             total_charged:
               totalCharged,

             required:
               amount,

             available:
               flutterwaveAvailableBalance,

             currency:
               "NGN",
           },
           200,
         );
       }

       /*
        * ========================================================
        * STEP 3
        *
        * RESERVE KYC DAILY TRANSFER LIMIT
        * ========================================================
        */

       const { data: kycReservation, error: kycReservationError } = await supabase.rpc("reserve_kyc_daily_transfer", { _user_id: user.id, _amount: amount });
       if (kycReservationError) {
         console.error("KYC transfer reservation failed:", kycReservationError);
         return json({ success: false, stage: "kyc_limit", error: "Unable to reserve your daily transfer limit. Please try again." }, 503);
       }
       if (!kycReservation?.success || !kycReservation?.allowed) {
         return json({ success: false, stage: "kyc_limit", error: kycReservation?.error || "Daily transfer limit exceeded.", kyc_level: kycReservation?.kyc_level ?? null, daily_limit: kycReservation?.daily_limit ?? null, amount_used: kycReservation?.amount_used ?? null, amount_reserved: kycReservation?.amount_reserved ?? null, remaining: kycReservation?.remaining ?? null, requested_amount: amount, currency: "NGN" }, 400);
       }
       let kycReservationActive = true;
       const releaseKycReservation = async () => {
         if (!kycReservationActive) return true;
         const { data: releaseResult, error: releaseError } = await supabase.rpc("release_kyc_daily_transfer", { _user_id: user.id, _amount: amount });
         if (releaseError || !releaseResult?.success) { console.error("KYC reservation release failed:", releaseError || releaseResult); return false; }
         kycReservationActive = false; return true;
       };

       /*
        * ========================================================
        * STEP 4
        *
        * DEBIT USER WALLET
        * ========================================================
        *
        * Wallet is charged:
        *
        * transfer amount + IyanjuPay fee
        */

       console.log(
         "Flutterwave balance sufficient. Debiting user wallet:",
         JSON.stringify({
           transfer_amount:
             amount,

           iyanjupay_fee:
             fee,

           total_charged:
             totalCharged,
         }),
       );

       const {
         data: debitTransaction,
         error: debitError,
       } = await supabase.rpc(
         "wallet_operation",
         {
           _user_id:
             user.id,

           _operation:
             "DEBIT",

           _amount:
             totalCharged,

           _description:
             `Transfer to ${beneficiaryName} - ₦${amount} + ₦${fee} IyanjuPay fee`,

           _idempotency_key:
             transferKey,

           _reference:
             reference,

           _provider:
             "flutterwave",

           _category:
             "transfer",

           _metadata: {
             /*
              * SENDER
              */

             sender_name:
               senderName,

             sender_platform:
               "IyanjuPay",

             sender_user_id:
               user.id,

             /*
              * RECIPIENT
              */

             account_number:
               accountNumber,

             account_bank:
               accountBank,

             beneficiary_name:
               beneficiaryName,

             narration,

             /*
              * TRANSFER PRICING
              */

             transfer_amount:
               amount,

             iyanjupay_fee:
               fee,

             total_charged:
               totalCharged,

             fee_type:
               "iyanjupay_transfer_fee",

             fee_currency:
               "NGN",

             /*
              * PROVIDER
              */

             flutterwave_transfer_amount:
               amount,

             flutterwave_available_balance:
               flutterwaveAvailableBalance,

             flutterwave_ledger_balance:
               flutterwaveLedgerBalance,

             currency:
               "NGN",

             status:
               "pending",
           },
         },
       );

       if (debitError) {
         console.error(
           "Wallet debit error:",
           debitError,
         );

         return json(
           {
             success: false,
             stage: "wallet_debit",
             error:
               debitError.message ||
               "Unable to debit wallet",
           },
           400,
         );
       }

       if (!debitTransaction) {
         return json(
           {
             success: false,
             stage: "wallet_debit",
             error:
               "Wallet debit did not return a transaction",
           },
           500,
         );
       }

       const transactionId =
         debitTransaction.id;

       console.log(
         "Wallet debit successful:",
         JSON.stringify({
           transaction_id:
             transactionId,

           sender_name:
             senderName,

           transfer_amount:
             amount,

           fee,

           total_charged:
             totalCharged,
         }),
       );

       /*
        * ========================================================
        * STEP 4
        *
        * INITIATE FLUTTERWAVE TRANSFER
        * ========================================================
        *
        * Flutterwave receives ONLY the transfer amount.
        *
        * It does NOT receive the IyanjuPay ₦10 fee.
        *
        * beneficiary_name = recipient
        *
        * narration = sender + IyanjuPay
        */

       console.log(
         "Initiating Flutterwave transfer:",
         JSON.stringify({
           reference,

           sender_name:
             senderName,

           sender_platform:
             "IyanjuPay",

           beneficiary_name:
             beneficiaryName,

           narration,

           flutterwave_amount:
             amount,

           iyanjupay_fee:
             fee,

           wallet_total:
             totalCharged,
         }),
       );

       let flutterwaveResponse;

       try {
         flutterwaveResponse =
           await flw(
             "/transfers",
             {
               method: "POST",

               body:
                 JSON.stringify({
                   account_bank:
                     accountBank,

                   account_number:
                     accountNumber,

                   /*
                    * ONLY THE BENEFICIARY TRANSFER AMOUNT
                    */

                   amount,

                   currency:
                     "NGN",

                   debit_currency:
                     "NGN",

                   /*
                    * RECIPIENT NAME
                    *
                    * DO NOT put senderName here.
                    */

                   beneficiary_name:
                     beneficiaryName,

                   /*
                    * SENDER / PLATFORM IDENTIFICATION
                    *
                    * Example:
                    *
                    * Aremu Lawal - IyanjuPay
                    */

                   narration,

                   reference,

                   /*
                    * ADDITIONAL IYANJUPAY INFORMATION
                    */

                   meta: [
                     {
                       key:
                         "sender_name",

                       value:
                         senderName,
                     },

                     {
                       key:
                         "sender_platform",

                       value:
                         "IyanjuPay",
                     },

                     {
                       key:
                         "iyanjupay_user_id",

                       value:
                         user.id,
                     },

                     {
                       key:
                         "iyanjupay_transaction_id",

                       value:
                         transactionId,
                     },

                     {
                       key:
                         "iyanjupay_reference",

                       value:
                         reference,
                     },

                     {
                       key:
                         "iyanjupay_transfer_amount",

                       value:
                         String(amount),
                     },

                     {
                       key:
                         "iyanjupay_fee",

                       value:
                         String(fee),
                     },

                     {
                       key:
                         "iyanjupay_total_charged",

                       value:
                         String(totalCharged),
                     },
                   ],
                 }),
             },
           );
       } catch (error) {
         /*
          * ======================================================
          * NETWORK / PROXY FAILURE
          * ======================================================
          *
          * Flutterwave was NOT confirmed to have received the
          * request, so refund the COMPLETE wallet charge.
          */

         console.error(
           "Flutterwave transfer network/proxy error:",
           error,
         );

         const refundKey =
           `REFUND_${transactionId}`;

         const {
           error: refundError,
         } = await supabase.rpc(
           "wallet_operation",
           {
             _user_id:
               user.id,

             _operation:
               "REFUND",

             _amount:
               totalCharged,

             _description:
               `Refund for failed transfer to ${beneficiaryName} including IyanjuPay fee`,

             _idempotency_key:
               refundKey,

             _reference:
               `REFUND_${reference}`,

             _provider:
               "flutterwave",

             _category:
               "transfer_refund",

             _metadata: {
               original_transaction_id:
                 transactionId,

               original_reference:
                 reference,

               sender_name:
                 senderName,

               sender_platform:
                 "IyanjuPay",

               original_transfer_amount:
                 amount,

               original_fee:
                 fee,

               original_total_charged:
                 totalCharged,

               reason:
                 "Flutterwave proxy/network request failed",

               refunded:
                 true,

               refunded_amount:
                 totalCharged,
             },
           },
         );

         if (refundError) {
           console.error(
             "Automatic refund failed:",
             refundError,
           );

           await supabase
             .from("transactions")
             .update({
               metadata: {
                 sender_name:
                   senderName,

                 sender_platform:
                   "IyanjuPay",

                 account_number:
                   accountNumber,

                 account_bank:
                   accountBank,

                 beneficiary_name:
                   beneficiaryName,

                 narration,

                 transfer_amount:
                   amount,

                 iyanjupay_fee:
                   fee,

                 total_charged:
                   totalCharged,

                 refund_pending:
                   true,

                 refund_amount:
                   totalCharged,

                 refund_error:
                   refundError.message,

                 original_error:
                   "Flutterwave proxy/network request failed",
               },
             })
             .eq(
               "id",
               transactionId,
             );

           return json(
             {
               success: false,

               stage:
                 "refund_pending",

               error:
                 "Transfer could not be completed and automatic refund requires retry.",

               reference,

               transaction_id:
                 transactionId,

               transfer_amount:
                 amount,

               fee,

               total_charged:
                 totalCharged,
             },
             503,
           );
         }

         await supabase
           .from("transactions")
           .update({
             status:
               "failed",

             metadata: {
               sender_name:
                 senderName,

               sender_platform:
                 "IyanjuPay",

               account_number:
                 accountNumber,

               account_bank:
                 accountBank,

               beneficiary_name:
                 beneficiaryName,

               narration,

               transfer_amount:
                 amount,

               iyanjupay_fee:
                 fee,

               total_charged:
                 totalCharged,

               refunded:
                 true,

               refund_amount:
                 totalCharged,

               refund_reason:
                 "Flutterwave proxy/network request failed",
             },
           })
           .eq(
             "id",
             transactionId,
           );

         return json(
           {
             success: false,

             stage:
               "flutterwave_request",

             error:
               "Unable to connect to Flutterwave. Your wallet has been refunded.",

             refunded:
               true,

             reference,

             transaction_id:
               transactionId,

             transfer_amount:
               amount,

             fee,

             total_charged:
               totalCharged,
           },
           200,
         );
       }

       /*
        * ========================================================
        * READ FLUTTERWAVE RESPONSE
        * ========================================================
        */

       const flutterwaveData =
         flutterwaveResponse.body;

       console.log(
         "Flutterwave transfer initiation response:",
         JSON.stringify({
           http_status:
             flutterwaveResponse.status,

           ok:
             flutterwaveResponse.ok,

           body:
             flutterwaveData,
         }),
       );

       /*
        * ========================================================
        * TRANSFER REQUEST REJECTED
        * ========================================================
        */

       if (
         !flutterwaveResponse.ok ||
         flutterwaveData?.status !==
           "success"
       ) {
         const providerError =
           flutterwaveData?.message ||
           flutterwaveData?.error?.message ||
           flutterwaveData?.error ||
           "Flutterwave could not initiate the transfer";

         console.error(
           "Flutterwave transfer rejected:",
           providerError,
         );

         /*
          * ======================================================
          * DETECT INSUFFICIENT PROVIDER BALANCE
          * ======================================================
          */

         const lowerError =
           String(
             providerError,
           ).toLowerCase();

         const isInsufficientBalance =
           lowerError.includes(
             "insufficient",
           ) &&
           (
             lowerError.includes(
               "balance",
             ) ||
             lowerError.includes(
               "fund",
             ) ||
             lowerError.includes(
               "wallet",
             )
           );

         /*
          * ======================================================
          * REFUND COMPLETE WALLET CHARGE
          * ======================================================
          */

         const refundKey =
           `REFUND_${transactionId}`;

         const {
           error: refundError,
         } = await supabase.rpc(
           "wallet_operation",
           {
             _user_id:
               user.id,

             _operation:
               "REFUND",

             _amount:
               totalCharged,

             _description:
               `Refund for rejected transfer to ${beneficiaryName} including IyanjuPay fee`,

             _idempotency_key:
               refundKey,

             _reference:
               `REFUND_${reference}`,

             _provider:
               "flutterwave",

             _category:
               "transfer_refund",

             _metadata: {
               original_transaction_id:
                 transactionId,

               original_reference:
                 reference,

               sender_name:
                 senderName,

               sender_platform:
                 "IyanjuPay",

               original_transfer_amount:
                 amount,

               original_fee:
                 fee,

               original_total_charged:
                 totalCharged,

               reason:
                 providerError,

               flutterwave_response:
                 flutterwaveData,

               insufficient_flutterwave_balance:
                 isInsufficientBalance,

               refunded:
                 true,

               refunded_amount:
                 totalCharged,
             },
           },
         );

         if (refundError) {
           console.error(
             "Refund failed:",
             refundError,
           );

           await supabase
             .from("transactions")
             .update({
               metadata: {
                 sender_name:
                   senderName,

                 sender_platform:
                   "IyanjuPay",

                 account_number:
                   accountNumber,

                 account_bank:
                   accountBank,

                 beneficiary_name:
                   beneficiaryName,

                 narration,

                 transfer_amount:
                   amount,

                 iyanjupay_fee:
                   fee,

                 total_charged:
                   totalCharged,

                 refund_pending:
                   true,

                 refund_amount:
                   totalCharged,

                 refund_error:
                   refundError.message,

                 flutterwave_response:
                   flutterwaveData,
               },
             })
             .eq(
               "id",
               transactionId,
             );

           return json(
             {
               success: false,

               stage:
                 "refund_pending",

               error:
                 "Flutterwave rejected the transfer, but the automatic refund requires retry.",

               reference,

               transaction_id:
                 transactionId,

               transfer_amount:
                 amount,

               fee,

               total_charged:
                 totalCharged,
             },
             503,
           );
         }

         await supabase
           .from("transactions")
           .update({
             status:
               "failed",

             provider:
               "flutterwave",

             metadata: {
               sender_name:
                 senderName,

               sender_platform:
                 "IyanjuPay",

               account_number:
                 accountNumber,

               account_bank:
                 accountBank,

               beneficiary_name:
                 beneficiaryName,

               narration,

               transfer_amount:
                 amount,

               iyanjupay_fee:
                 fee,

               total_charged:
                 totalCharged,

               flutterwave_response:
                 flutterwaveData,

               insufficient_flutterwave_balance:
                 isInsufficientBalance,

               refunded:
                 true,

               refund_amount:
                 totalCharged,
             },
           })
           .eq(
             "id",
             transactionId,
           );

         return json(
           {
             success: false,

             stage:
               isInsufficientBalance
                 ? "flutterwave_balance"
                 : "flutterwave",

             error:
               isInsufficientBalance
                 ? "Insufficient Flutterwave balance. Your wallet has been refunded."
                 : providerError,

             refunded:
               true,

             reference,

             transaction_id:
               transactionId,

             transfer_amount:
               amount,

             fee,

             total_charged:
               totalCharged,
           },
           200,
         );
       }

       /*
        * ========================================================
        * TRANSFER ACCEPTED
        * ========================================================
        *
        * DO NOT mark as successful here.
        *
        * Flutterwave may return NEW/PENDING.
        *
        * Final state is handled by webhook/status reconciliation.
        */

       const flutterwaveTransferId =
         flutterwaveData
           ?.data
           ?.id
           ? String(
               flutterwaveData
                 .data
                 .id,
             )
           : null;

       const transferStatus =
         String(
           flutterwaveData
             ?.data
             ?.status ??
             "NEW",
         ).toUpperCase();

       /*
        * ========================================================
        * NO FLUTTERWAVE TRANSFER ID
        * ========================================================
        */

       if (!flutterwaveTransferId) {
         console.error(
           "Flutterwave accepted transfer but returned no transfer ID.",
         );

         /*
          * DO NOT refund.
          *
          * Flutterwave may already have received the transfer.
          * Reconciliation is required.
          */

         await supabase
           .from("transactions")
           .update({
             status:
               "pending",

             provider:
               "flutterwave",

             metadata: {
               sender_name:
                 senderName,

               sender_platform:
                 "IyanjuPay",

               account_number:
                 accountNumber,

               account_bank:
                 accountBank,

               beneficiary_name:
                 beneficiaryName,

               narration,

               transfer_amount:
                 amount,

               iyanjupay_fee:
                 fee,

               total_charged:
                 totalCharged,

               flutterwave_status:
                 transferStatus,

               flutterwave_response:
                 flutterwaveData,

               reconciliation_required:
                 true,
             },
           })
           .eq(
             "id",
             transactionId,
           );

         return json(
           {
             success: false,

             status:
               "pending",

             stage:
               "reconciliation",

             error:
               "Transfer was accepted but Flutterwave did not return a transfer ID. Manual reconciliation is required.",

             reference,

             transaction_id:
               transactionId,

             transfer_amount:
               amount,

             fee,

             total_charged:
               totalCharged,
           },
           503,
         );
       }

       /*
        * ========================================================
        * SAVE PENDING TRANSFER
        * ========================================================
        */

       const {
         error:
           transactionUpdateError,
       } = await supabase
         .from("transactions")
         .update({
           status:
             "pending",

           provider:
             "flutterwave",

           provider_reference:
             flutterwaveTransferId,

           metadata: {
             /*
              * SENDER
              */

             sender_name:
               senderName,

             sender_platform:
               "IyanjuPay",

             sender_user_id:
               user.id,

             /*
              * RECIPIENT
              */

             account_number:
               accountNumber,

             account_bank:
               accountBank,

             beneficiary_name:
               beneficiaryName,

             narration,

             /*
              * TRANSFER PRICING
              */

             transfer_amount:
               amount,

             iyanjupay_fee:
               fee,

             total_charged:
               totalCharged,

             /*
              * PROVIDER TRANSFER
              */

             flutterwave_status:
               transferStatus,

             flutterwave_transfer_id:
               flutterwaveTransferId,

             flutterwave_available_balance:
               flutterwaveAvailableBalance,

             flutterwave_response:
               flutterwaveData,
           },
         })
         .eq(
           "id",
           transactionId,
         );

       if (
         transactionUpdateError
       ) {
         console.error(
           "Transaction pending update failed:",
           transactionUpdateError,
         );

         /*
          * DO NOT refund here.
          *
          * Flutterwave may already have accepted the transfer.
          * Reconciliation/webhook can still update it.
          */
       }

       /*
        * ========================================================
        * RETURN PENDING
        * ========================================================
        */

       return json(
         {
           success: true,

           status:
             "pending",

           message:
             "Transfer has been initiated and is being processed.",

           reference,

           transaction_id:
             transactionId,

           flutterwave_transfer_id:
             flutterwaveTransferId,

           flutterwave_status:
             transferStatus,

           /*
            * SENDER INFORMATION
            */

           sender: {
             name:
               senderName,

             platform:
               "IyanjuPay",
           },

           /*
            * BENEFICIARY INFORMATION
            */

           beneficiary: {
             name:
               beneficiaryName,

             account_number:
               accountNumber,

             bank_code:
               accountBank,
           },

           /*
            * TRANSFER PRICING
            */

           transfer_amount:
             amount,

           fee,

           total_charged:
             totalCharged,

           currency:
             "NGN",
         },
         200,
       );
     } catch (error) {
       console.error(
         "FLUTTERWAVE TRANSFER INTERNAL ERROR:",
         error,
       );

       return json(
         {
           success: false,

           stage:
             "internal",

           error:
             error instanceof Error
               ? error.message
               : "Internal server error",
         },
         500,
       );
     }
   });
