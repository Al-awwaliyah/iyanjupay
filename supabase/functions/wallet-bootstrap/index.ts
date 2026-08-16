import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

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

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // Check existing wallet
    let { data: wallet, error: walletError } = await supabase
      .from("wallets")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (walletError) {
      throw walletError;
    }

    // Create wallet if it doesn't exist
    if (!wallet) {
      const { data: newWallet, error: createWalletError } =
        await supabase
          .from("wallets")
          .insert({
            user_id: user.id,
            balance: 0,
            held_balance: 0,
            currency: "NGN",
            status: "active",
          })
          .select()
          .single();

      if (createWalletError) {
        // Handle race condition where another request created it
        if (createWalletError.code === "23505") {
          const { data: existingWallet, error: retryError } =
            await supabase
              .from("wallets")
              .select("*")
              .eq("user_id", user.id)
              .single();

          if (retryError) throw retryError;

          wallet = existingWallet;
        } else {
          throw createWalletError;
        }
      } else {
        wallet = newWallet;
      }
    }

    // Check wallet ledger accounts
    const { data: existingAccounts, error: accountsError } =
      await supabase
        .from("ledger_accounts")
        .select("id, code, account_type, purpose")
        .eq("wallet_id", wallet.id);

    if (accountsError) {
      throw accountsError;
    }

    const accounts = existingAccounts ?? [];

    // Wallet available balance account
    if (!accounts.some((a) => a.purpose === "available_balance")) {
      const { error } = await supabase
        .from("ledger_accounts")
        .insert({
          code: `WALLET_AVAILABLE_${user.id}`,
          name: "Wallet Available Balance",
          account_type: "asset",
          purpose: "available_balance",
          wallet_id: wallet.id,
          user_id: user.id,
          currency: "NGN",
        });

      if (error && error.code !== "23505") {
        throw error;
      }
    }

    // Wallet held balance account
    if (!accounts.some((a) => a.purpose === "held_balance")) {
      const { error } = await supabase
        .from("ledger_accounts")
        .insert({
          code: `WALLET_HELD_${user.id}`,
          name: "Wallet Held Balance",
          account_type: "asset",
          purpose: "held_balance",
          wallet_id: wallet.id,
          user_id: user.id,
          currency: "NGN",
        });

      if (error && error.code !== "23505") {
        throw error;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        wallet,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("wallet-bootstrap error:", error);

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal server error",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
