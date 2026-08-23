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
  let cleaned = phone
    .trim()
    .replace(/[\s()-]/g, "");

  // 08012345678 -> +2348012345678
  if (cleaned.startsWith("0")) {
    cleaned = `+234${cleaned.substring(1)}`;
  }

  // 2348012345678 -> +2348012345678
  if (cleaned.startsWith("234")) {
    cleaned = `+${cleaned}`;
  }

  return cleaned;
}

serve(async (req) => {
  // --------------------------------------------------
  // CORS
  // --------------------------------------------------

  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  // --------------------------------------------------
  // Only POST allowed
  // --------------------------------------------------

  if (req.method !== "POST") {
    return jsonResponse(
      {
        success: false,
        error: "Method not allowed.",
      },
      405,
    );
  }

  try {
    // --------------------------------------------------
    // 1. SUPABASE CONFIGURATION
    // --------------------------------------------------

    const SUPABASE_URL =
      Deno.env.get("SUPABASE_URL") ?? "";

    const SUPABASE_SERVICE_ROLE_KEY =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const SUPABASE_ANON_KEY =
      Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    if (
      !SUPABASE_URL ||
      !SUPABASE_SERVICE_ROLE_KEY ||
      !SUPABASE_ANON_KEY
    ) {
      console.error(
        "Supabase authentication secrets are not configured.",
      );

      return jsonResponse(
        {
          success: false,
          error:
            "Authentication service is temporarily unavailable.",
        },
        500,
      );
    }

    // --------------------------------------------------
    // 2. READ REQUEST BODY
    // --------------------------------------------------

    let body: {
      identifier?: string;
      password?: string;
    };

    try {
      body = await req.json();
    } catch {
      return jsonResponse(
        {
          success: false,
          error: "Invalid request.",
        },
        200,
      );
    }

    const identifier =
      typeof body.identifier === "string"
        ? body.identifier.trim()
        : "";

    const password =
      typeof body.password === "string"
        ? body.password
        : "";

    // --------------------------------------------------
    // 3. VALIDATE INPUT
    //
    // IMPORTANT:
    // These are returned as HTTP 200 so the frontend
    // does not receive FunctionsHttpError.
    // --------------------------------------------------

    if (!identifier) {
      return jsonResponse(
        {
          success: false,
          error:
            "Email or phone number is required.",
        },
        200,
      );
    }

    if (!password) {
      return jsonResponse(
        {
          success: false,
          error: "Password is required.",
        },
        200,
      );
    }

    // --------------------------------------------------
    // 4. DETERMINE EMAIL OR PHONE LOGIN
    // --------------------------------------------------

    let email = identifier;

    const cleanedIdentifier =
      identifier.replace(/[\s()-]/g, "");

    const looksLikePhone =
      /^(\+234|234|0)\d+$/.test(
        cleanedIdentifier,
      );

    // --------------------------------------------------
    // 5. PHONE LOGIN
    // --------------------------------------------------

    if (looksLikePhone) {
      const phone =
        normalizePhoneNumber(identifier);

      if (!/^\+234\d{10}$/.test(phone)) {
        return jsonResponse(
          {
            success: false,
            error:
              "Invalid Nigerian phone number.",
          },
          200,
        );
      }

      // ------------------------------------------------
      // ADMIN CLIENT
      // Used only for looking up the phone profile.
      // ------------------------------------------------

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

      const {
        data: profile,
        error: profileError,
      } = await adminClient
        .from("profiles")
        .select(
          "email, phone_verified",
        )
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
            error:
              "Unable to process login. Please try again.",
          },
          500,
        );
      }

      // ------------------------------------------------
      // DO NOT reveal whether the phone exists.
      // ------------------------------------------------

      if (!profile?.email) {
        return jsonResponse(
          {
            success: false,
            error:
              "Invalid login credentials.",
          },
          200,
        );
      }

      // ------------------------------------------------
      // PHONE MUST BE VERIFIED
      // ------------------------------------------------

      if (!profile.phone_verified) {
        return jsonResponse(
          {
            success: false,
            error:
              "Phone number has not been verified.",
          },
          200,
        );
      }

      email = profile.email;
    }

    // --------------------------------------------------
    // 6. EMAIL LOGIN
    // --------------------------------------------------

    /*
     * If the identifier is not a phone number,
     * Supabase will authenticate it as an email.
     *
     * We intentionally do not expose whether an
     * email exists in the database.
     */

    // --------------------------------------------------
    // 7. AUTH CLIENT
    // --------------------------------------------------

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

    // --------------------------------------------------
    // 8. AUTHENTICATE WITH SUPABASE
    // --------------------------------------------------

    const {
      data,
      error,
    } = await authClient.auth.signInWithPassword({
      email,
      password,
    });

    // --------------------------------------------------
    // 9. INVALID CREDENTIALS
    //
    // IMPORTANT:
    // Return HTTP 200 here instead of 401.
    //
    // This prevents:
    // FunctionsHttpError:
    // Edge Function returned a non-2xx status code
    // --------------------------------------------------

    if (
      error ||
      !data?.session ||
      !data?.user
    ) {
      console.warn(
        "Login failed:",
        error?.message || "Invalid credentials",
      );

      return jsonResponse(
        {
          success: false,
          error: "Invalid login credentials.",
        },
        200,
      );
    }

    // --------------------------------------------------
    // 10. SUCCESS
    // --------------------------------------------------

    console.log(
      "Login successful:",
      data.user.id,
    );

    return jsonResponse(
      {
        success: true,
        user: data.user,
        session: data.session,
      },
      200,
    );
  } catch (error) {
    console.error(
      "login-with-identifier unexpected error:",
      error,
    );

    return jsonResponse(
      {
        success: false,
        error:
          "Unable to process login. Please try again.",
      },
      500,
    );
  }
});
