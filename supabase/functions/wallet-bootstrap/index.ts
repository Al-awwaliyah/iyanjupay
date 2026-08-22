import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":
    "POST, OPTIONS",
};


Deno.serve(async (req) => {
  // ============================================================
  // CORS
  // ============================================================

  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  try {
    // ============================================================
    // ADMIN / SERVICE ROLE CLIENT
    // ============================================================

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // ============================================================
    // AUTHENTICATION
    // ============================================================

    const authHeader =
      req.headers.get("Authorization");

    if (!authHeader) {
      return new Response(
        JSON.stringify({
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

    // ============================================================
    // USER CLIENT
    // ============================================================

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      }
    );

    // ============================================================
    // VERIFY USER
    // ============================================================

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({
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

    // ============================================================
    // FIND EXISTING WALLET
    // ============================================================

    let {
      data: wallet,
      error: walletError,
    } = await supabase
      .from("wallets")
      .select(
        `
          id,
          wallet_id,
          user_id,
          balance,
          held_balance,
          virtual_account_number,
          currency,
          status,
          created_at,
          updated_at
        `
      )
      .eq("user_id", user.id)
      .maybeSingle();

    if (walletError) {
      throw walletError;
    }

    // ============================================================
    // CREATE WALLET IF IT DOES NOT EXIST
    // ============================================================

    if (!wallet) {
      const {
        data: newWallet,
        error: createWalletError,
      } = await supabase
        .from("wallets")
        .insert({
          user_id: user.id,
          balance: 0,
          held_balance: 0,
          currency: "NGN",
          status: "active",
        })
        .select(
          `
            id,
            wallet_id,
            user_id,
            balance,
            held_balance,
            virtual_account_number,
            currency,
            status,
            created_at,
            updated_at
          `
        )
        .single();

      if (createWalletError) {
        // ========================================================
        // RACE CONDITION
        // ========================================================

        if (
          createWalletError.code ===
          "23505"
        ) {
          const {
            data: existingWallet,
            error: retryError,
          } = await supabase
            .from("wallets")
            .select(
              `
                id,
                wallet_id,
                user_id,
                balance,
                held_balance,
                virtual_account_number,
                currency,
                status,
                created_at,
                updated_at
              `
            )
            .eq("user_id", user.id)
            .single();

          if (retryError) {
            throw retryError;
          }

          wallet = existingWallet;
        } else {
          throw createWalletError;
        }
      } else {
        wallet = newWallet;
      }
    }

    // ============================================================
    // SAFETY CHECK
    // ============================================================

    if (!wallet) {
      throw new Error(
        "Unable to create or retrieve wallet."
      );
    }

    // ============================================================
    // WALLET ID CHECK
    // ============================================================
    //
    // The database migration is responsible for generating
    // the numeric Wallet ID.
    //
    // Expected format:
    // - numeric only
    // - maximum 8 characters
    //
    // We DO NOT generate the Wallet ID here because the
    // database should remain the single source of truth.
    // ============================================================

    if (!wallet.wallet_id) {
      console.warn(
        `Wallet ${wallet.id} does not have a wallet_id yet.`
      );
    }

    // ============================================================
    // ENSURE WALLET LEDGER ACCOUNTS
    // ============================================================

    const {
      data: existingAccounts,
      error: accountsError,
    } = await supabase
      .from("ledger_accounts")
      .select(
        "id, code, account_type, purpose"
      )
      .eq("wallet_id", wallet.id);

    if (accountsError) {
      throw accountsError;
    }

    const accounts =
      existingAccounts ?? [];

    // ============================================================
    // WALLET MAIN ACCOUNT
    // ============================================================

    if (
      !accounts.some(
        (account) =>
          account.purpose ===
          "wallet_main"
      )
    ) {
      const {
        error: mainAccountError,
      } = await supabase
        .from("ledger_accounts")
        .insert({
          code:
            `WALLET_AVAILABLE_${user.id}`,

          name:
            "Wallet Available Balance",

          account_type:
            "liability",

          purpose:
            "wallet_main",

          wallet_id:
            wallet.id,

          user_id:
            user.id,

          currency:
            wallet.currency ||
            "NGN",
        });

      if (
        mainAccountError &&
        mainAccountError.code !==
          "23505"
      ) {
        throw mainAccountError;
      }
    }

    // ============================================================
    // WALLET HOLD ACCOUNT
    // ============================================================

    if (
      !accounts.some(
        (account) =>
          account.purpose ===
          "wallet_hold"
      )
    ) {
      const {
        error: holdAccountError,
      } = await supabase
        .from("ledger_accounts")
        .insert({
          code:
            `WALLET_HELD_${user.id}`,

          name:
            "Wallet Held Balance",

          account_type:
            "liability",

          purpose:
            "wallet_hold",

          wallet_id:
            wallet.id,

          user_id:
            user.id,

          currency:
            wallet.currency ||
            "NGN",
        });

      if (
        holdAccountError &&
        holdAccountError.code !==
          "23505"
      ) {
        throw holdAccountError;
      }
    }

    // ============================================================
    // REFRESH WALLET
    // ============================================================
    //
    // Re-read it after creation/account setup so the response
    // contains the latest database values.
    // ============================================================

    const {
      data: refreshedWallet,
      error: refreshedWalletError,
    } = await supabase
      .from("wallets")
      .select(
        `
          id,
          wallet_id,
          user_id,
          balance,
          held_balance,
          virtual_account_number,
          currency,
          status,
          created_at,
          updated_at
        `
      )
      .eq("id", wallet.id)
      .single();

    if (refreshedWalletError) {
      throw refreshedWalletError;
    }

    // ============================================================
    // RETURN WALLET
    // ============================================================

    return new Response(
      JSON.stringify({
        success: true,

        wallet: {
          // Internal database UUID
          id:
            refreshedWallet.id,

          // Public IyanjuPay Wallet ID
          // Example: "48372615"
          wallet_id:
            refreshedWallet.wallet_id
              ? String(
                  refreshedWallet.wallet_id
                )
              : "",

          balance:
            Number(
              refreshedWallet.balance
            ) || 0,

          held_balance:
            Number(
              refreshedWallet.held_balance
            ) || 0,

          virtual_account_number:
            refreshedWallet
              .virtual_account_number ||
            "",

          currency:
            refreshedWallet.currency ||
            "NGN",

          status:
            refreshedWallet.status,

          user_id:
            refreshedWallet.user_id,
        },
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
      "wallet-bootstrap error:",
      error
    );

    return new Response(
      JSON.stringify({
        success: false,

        error:
          error instanceof Error
            ? error.message
            : "Internal server error",
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
