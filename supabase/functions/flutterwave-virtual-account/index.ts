import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const secretKey = Deno.env.get("FLUTTERWAVE_SECRET_KEY");

    if (!secretKey) {
      return new Response(
        JSON.stringify({ error: "Flutterwave is not configured" }),
        { status: 500, headers: corsHeaders }
      );
    }

    const supabase = createClient(
  supabaseUrl,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);
    // 1. Authenticate user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: corsHeaders }
      );
    }

    // 2. Check if user already has a permanent virtual account
    const { data: existingAccount, error: existingError } = await supabase
      .from("virtual_accounts")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_permanent", true)
      .eq("status", "active")
      .maybeSingle();

    if (existingError) {
      console.error("Existing account lookup error:", existingError);

      return new Response(
        JSON.stringify({ error: "Failed to check virtual account" }),
        { status: 500, headers: corsHeaders }
      );
    }

    if (existingAccount) {
      return new Response(
        JSON.stringify({
          success: true,
          existing: true,
          account: existingAccount,
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    // 3. Get user's wallet
    const { data: wallet, error: walletError } = await supabase
      .from("wallets")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (walletError || !wallet) {
      return new Response(
        JSON.stringify({
          error: "Wallet not found. Please initialize your wallet first.",
        }),
        { status: 400, headers: corsHeaders }
      );
    }

    // 4. Get KYC/customer information
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("full_name, email, phone_number, bvn, nin")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: "Profile not found" }),
        { status: 400, headers: corsHeaders }
      );
    }

    // 5. Require BVN or NIN
    const bvn = profile.bvn?.trim();
    const nin = profile.nin?.trim();

    if (!bvn && !nin) {
      return new Response(
        JSON.stringify({
          error: "BVN or NIN is required to create your dedicated bank account",
          code: "KYC_REQUIRED",
        }),
        { status: 400, headers: corsHeaders }
      );
    }

    // 6. Split full name
    const nameParts = (profile.full_name || "IyanjuPay User")
      .trim()
      .split(/\s+/);

    const firstname = nameParts[0] || "IyanjuPay";
    const lastname =
      nameParts.slice(1).join(" ") || "User";

    // 7. Generate unique Flutterwave reference
    const txRef = `IYJ_VA_${user.id}_${crypto.randomUUID()}`;

    // 8. Create permanent Flutterwave virtual account
    const flutterwaveResponse = await fetch(
      "https://api.flutterwave.com/v3/virtual-account-numbers",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          email: profile.email || user.email,
          phonenumber: profile.phone_number,
          firstname,
          lastname,
          currency: "NGN",
          amount: 0,
          tx_ref: txRef,
          is_permanent: true,
          narration: `${firstname} ${lastname}`,
          ...(bvn ? { bvn } : {}),
          ...(nin && !bvn ? { nin } : {}),
        }),
      }
    );

    const flutterwaveData = await flutterwaveResponse.json();

    if (
      !flutterwaveResponse.ok ||
      flutterwaveData?.status !== "success"
    ) {
      console.error(
        "Flutterwave virtual account error:",
        JSON.stringify(flutterwaveData)
      );

      return new Response(
        JSON.stringify({
          error:
            flutterwaveData?.message ||
            "Failed to create virtual account",
        }),
        {
          status: 502,
          headers: corsHeaders,
        }
      );
    }

    const account = flutterwaveData.data;

    // 9. Save virtual account
    const { data: savedAccount, error: saveError } = await supabase
      .from("virtual_accounts")
      .insert({
        user_id: user.id,
        wallet_id: wallet.id,
        provider: "flutterwave",
        bank_name: account.bank_name,
        account_number: account.account_number,
        account_name:
          account.account_name ||
          `${firstname} ${lastname}`,
        provider_reference: account.flw_ref,
        order_reference: account.order_ref,
        is_permanent: true,
        status: "active",
      })
      .select()
      .single();

    if (saveError) {
      console.error("Virtual account save error:", saveError);

      return new Response(
        JSON.stringify({
          error: "Virtual account was created but could not be saved",
        }),
        {
          status: 500,
          headers: corsHeaders,
        }
      );
    }

    // 10. Return account details
    return new Response(
      JSON.stringify({
        success: true,
        existing: false,
        account: savedAccount,
      }),
      {
        status: 200,
        headers: corsHeaders,
      }
    );
  } catch (error) {
    console.error("Virtual account error:", error);

    return new Response(
      JSON.stringify({
        error:
          error instanceof Error
            ? error.message
            : "Internal server error",
      }),
      {
        status: 500,
        headers: corsHeaders,
      }
    );
  }
});
