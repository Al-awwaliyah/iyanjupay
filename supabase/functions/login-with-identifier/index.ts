import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function normalizePhoneNumber(phone: string): string {
  let cleaned = phone.trim().replace(/[\s()-]/g, "");

  if (cleaned.startsWith("0")) {
    cleaned = `+234${cleaned.substring(1)}`;
  }

  if (cleaned.startsWith("234")) {
    cleaned = `+${cleaned}`;
  }

  return cleaned;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  try {
    const {
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      SUPABASE_ANON_KEY,
    } = Deno.env.toObject();

    if (
      !SUPABASE_URL ||
      !SUPABASE_SERVICE_ROLE_KEY ||
      !SUPABASE_ANON_KEY
    ) {
      return jsonResponse(
        {
          success: false,
          error: "Supabase authentication secrets are not configured.",
        },
        500,
      );
    }

    const { identifier, password } = await req.json();

    if (!identifier?.trim()) {
      return jsonResponse(
        {
          success: false,
          error: "Email or phone number is required.",
        },
        400,
      );
    }

    if (!password) {
      return jsonResponse(
        {
          success: false,
          error: "Password is required.",
        },
        400,
      );
    }

    const value = identifier.trim();

    let email = value;

    // ---------------------------------------------
    // PHONE LOGIN
    // ---------------------------------------------

    const looksLikePhone =
      /^(\+234|234|0)\d+$/.test(
        value.replace(/[\s()-]/g, ""),
      );

    if (looksLikePhone) {
      const phone = normalizePhoneNumber(value);

      if (!/^\+234\d{10}$/.test(phone)) {
        return jsonResponse(
          {
            success: false,
            error: "Invalid Nigerian phone number.",
          },
          400,
        );
      }

      const adminClient = createClient(
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
          },
        },
      );

      const { data: profile, error: profileError } =
        await adminClient
          .from("profiles")
          .select("email, phone_verified")
          .eq("phone_number", phone)
          .maybeSingle();

      if (profileError) {
        console.error(
          "Phone lookup error:",
          profileError,
        );

        return jsonResponse(
          {
            success: false,
            error: "Unable to process login.",
          },
          500,
        );
      }

      if (!profile?.email) {
        return jsonResponse(
          {
            success: false,
            error: "Invalid login credentials.",
          },
          401,
        );
      }

      if (!profile.phone_verified) {
        return jsonResponse(
          {
            success: false,
            error:
              "Phone number has not been verified.",
          },
          403,
        );
      }

      email = profile.email;
    }

    // ---------------------------------------------
    // AUTHENTICATE WITH SUPABASE
    // ---------------------------------------------

    const authClient = createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );

    const { data, error } =
      await authClient.auth.signInWithPassword({
        email,
        password,
      });

    if (error || !data.session || !data.user) {
      return jsonResponse(
        {
          success: false,
          error: "Invalid login credentials.",
        },
        401,
      );
    }

    return jsonResponse({
      success: true,
      user: data.user,
      session: data.session,
    });
  } catch (error) {
    console.error(
      "login-with-identifier error:",
      error,
    );

    return jsonResponse(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to process login.",
      },
      500,
    );
  }
});
