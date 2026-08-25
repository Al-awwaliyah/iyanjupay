import {
  corsHeaders,
  json,
  adminClient,
  getUser,
} from "../_shared/auth.ts";

const REFERRAL_REWARD = 500;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  try {
    const user = await getUser(req);

    if (!user) {
      return json(
        {
          success: false,
          error: "Authentication required.",
        },
        401
      );
    }

    const body = await req.json();

    const transactionId =
      String(
        body?.transaction_id ??
        body?.transactionId ??
        ""
      ).trim();

    if (!transactionId) {
      return json(
        {
          success: false,
          error: "Transaction ID is required.",
        },
        400
      );
    }

    const admin = adminClient();


    // ============================================================
    // GET TRANSACTION
    // ============================================================

    const {
      data: transaction,
      error: transactionError,
    } = await admin
      .from("transactions")
      .select(`
        id,
        user_id,
        amount,
        status,
        transaction_type,
        category,
        reference_number,
        currency,
        metadata,
        completed_at
      `)
      .eq("id", transactionId)
      .maybeSingle();

    if (transactionError) {
      console.error(
        "Transaction lookup failed:",
        transactionError
      );

      return json(
        {
          success: false,
          error: "Unable to verify transaction.",
        },
        500
      );
    }


    if (!transaction) {
      return json(
        {
          success: false,
          error: "Transaction not found.",
        },
        404
      );
    }


    // ============================================================
    // TRANSACTION MUST BELONG TO CURRENT USER
    // ============================================================

    if (transaction.user_id !== user.id) {
      return json(
        {
          success: false,
          error: "Unauthorized transaction.",
        },
        403
      );
    }


    // ============================================================
    // TRANSACTION MUST BE SUCCESSFUL
    // ============================================================

    const status =
      String(
        transaction.status ?? ""
      ).toLowerCase();

    if (
      status !== "successful" &&
      status !== "success" &&
      status !== "completed"
    ) {
      return json(
        {
          success: false,
          error:
            "Transaction has not successfully completed.",
        },
        400
      );
    }


    // ============================================================
    // DO NOT REWARD REFERRAL/CASHBACK TRANSACTIONS
    // ============================================================

    const transactionType =
      String(
        transaction.transaction_type ?? ""
      ).toLowerCase();

    const category =
      String(
        transaction.category ?? ""
      ).toLowerCase();

    const metadata =
      transaction.metadata ?? {};

    const excludedTypes = [
      "referral",
      "referral_reward",
      "cashback",
    ];

    if (
      excludedTypes.includes(transactionType) ||
      excludedTypes.includes(category) ||
      metadata?.is_referral_reward === true
    ) {
      return json({
        success: true,
        qualified: false,
        message:
          "This transaction cannot qualify a referral.",
      });
    }


    // ============================================================
    // FIND REFERRAL
    // ============================================================

    const {
      data: referral,
      error: referralError,
    } = await admin
      .from("referrals")
      .select(`
        id,
        referrer_id,
        referred_user_id,
        status,
        qualifying_transaction_id
      `)
      .eq("referred_user_id", user.id)
      .maybeSingle();


    if (referralError) {
      console.error(
        "Referral lookup failed:",
        referralError
      );

      return json(
        {
          success: false,
          error: "Unable to check referral.",
        },
        500
      );
    }


    if (!referral) {
      return json({
        success: true,
        qualified: false,
        message:
          "User does not have a referral.",
      });
    }


    // ============================================================
    // ALREADY COMPLETED
    // ============================================================

    if (referral.status === "completed") {
      return json({
        success: true,
        qualified: true,
        already_processed: true,
        message:
          "Referral reward has already been processed.",
      });
    }


    // ============================================================
    // LOCK / CLAIM REFERRAL
    // ============================================================

    const { data: claimedReferral, error: claimError } =
      await admin
        .from("referrals")
        .update({
          status: "qualified",
          qualifying_transaction_id:
            transaction.id,
          qualified_at: new Date().toISOString(),
        })
        .eq("id", referral.id)
        .eq("status", "pending")
        .select()
        .maybeSingle();


    if (claimError) {
      console.error(
        "Referral claim failed:",
        claimError
      );

      return json(
        {
          success: false,
          error: "Unable to claim referral.",
        },
        500
      );
    }


    /*
     * Another request may have processed this referral
     * between the SELECT and UPDATE.
     */
    if (!claimedReferral) {

      return json({
        success: true,
        qualified: true,
        already_processing: true,
        message:
          "Referral is already being processed.",
      });
    }


    // ============================================================
    // CREATE TWO REWARD RECORDS
    // ============================================================

    const referrerReference =
      `REFERRER_${referral.id}`;

    const referredReference =
      `REFERRED_${referral.id}`;


    const {
      data: rewardRows,
      error: rewardError,
    } = await admin
      .from("referral_rewards")
      .insert([
        {
          referral_id: referral.id,
          user_id: referral.referrer_id,
          reward_type: "referrer_bonus",
          amount: REFERRAL_REWARD,
          currency: "NGN",
          status: "pending",
          reference_number:
            referrerReference,
        },
        {
          referral_id: referral.id,
          user_id: referral.referred_user_id,
          reward_type: "referred_bonus",
          amount: REFERRAL_REWARD,
          currency: "NGN",
          status: "pending",
          reference_number:
            referredReference,
        },
      ])
      .select();


    if (rewardError) {
      console.error(
        "Reward creation failed:",
        rewardError
      );

      /*
       * Put referral back into pending so it can
       * safely be retried.
       */
      await admin
        .from("referrals")
        .update({
          status: "pending",
          qualifying_transaction_id: null,
          qualified_at: null,
        })
        .eq("id", referral.id)
        .eq("status", "qualified");


      return json(
        {
          success: false,
          error:
            "Unable to create referral rewards.",
        },
        500
      );
    }


    // ============================================================
    // IMPORTANT:
    //
    // At this point the two rewards exist.
    //
    // The actual ₦500 wallet credit MUST go through
    // your existing secure wallet/ledger credit mechanism.
    //
    // Do NOT directly update wallets.balance here.
    // ============================================================


    return json({
      success: true,
      qualified: true,
      referral_id: referral.id,
      rewards_created: rewardRows?.length ?? 0,
      reward_amount: REFERRAL_REWARD,
      message:
        "Referral qualified. Rewards are ready for wallet credit.",
    });

  } catch (error) {

    console.error(
      "process-referral-reward error:",
      error
    );

    return json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unexpected server error.",
      },
      500
    );
  }
});
