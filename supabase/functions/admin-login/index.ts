import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":
    "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(
  body: Record<string, unknown>,
  status = 200,
) {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: corsHeaders,
    },
  );
}

function getErrorMessage(error: unknown): string {
  if (!error) {
    return "An unexpected error occurred.";
  }

  if (typeof error === "string") {
    return error;
  }

  if (typeof error === "object") {
    const value = error as {
      message?: string;
      error_description?: string;
    };

    return (
      value.message ??
      value.error_description ??
      "An unexpected error occurred."
    );
  }

  return "An unexpected error occurred.";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return json(
      {
        success: false,
        error: "Method not allowed",
      },
      405,
    );
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error(
      "Missing Supabase environment configuration.",
    );

    return json(
      {
        success: false,
        error: "Server configuration error.",
      },
      500,
    );
  }

  try {
    const body = await req.json();

    const email =
      typeof body?.email === "string"
        ? body.email.trim().toLowerCase()
        : "";

    const password =
      typeof body?.password === "string"
        ? body.password
        : "";

    if (!email) {
      return json(
        {
          success: false,
          error: "Email is required.",
        },
        400,
      );
    }

    if (!password) {
      return json(
        {
          success: false,
          error: "Password is required.",
        },
        400,
      );
    }

    /*
     * IMPORTANT:
     *
     * This client uses the public/anon key only for authentication.
     * We intentionally do NOT expose the service-role key here.
     */
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

    /*
     * Authenticate the supplied credentials against Supabase Auth.
     */
    const {
      data: authData,
      error: authError,
    } =
      await authClient.auth.signInWithPassword({
        email,
        password,
      });

    if (authError || !authData.session || !authData.user) {
      /*
       * Do not reveal whether the email exists.
       */
      return json(
        {
          success: false,
          error: "Invalid administrator credentials.",
        },
        401,
      );
    }

    const user = authData.user;
    const session = authData.session;

    /*
     * Create an authenticated Supabase client using the
     * newly-issued access token.
     */
    const userClient = createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      {
        global: {
          headers: {
            Authorization:
              `Bearer ${session.access_token}`,
          },
        },
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );

    /*
     * Verify that this authenticated account is actually
     * an administrator.
     *
     * admin_auth_get_state() uses auth.uid(), so the RPC
     * sees the authenticated administrator user.
     */
    const {
      data: state,
      error: stateError,
    } = await userClient.rpc(
      "admin_auth_get_state",
    );

    if (stateError) {
      console.error(
        "Failed to check administrator state:",
        stateError,
      );

      /*
       * Sign out the temporary authentication session.
       */
      await authClient.auth.signOut();

      return json(
        {
          success: false,
          error:
            "Unable to verify administrator access.",
        },
        500,
      );
    }

    if (
      !state ||
      typeof state !== "object" ||
      !(state as Record<string, unknown>).is_admin
    ) {
      /*
       * A normal IyanjuPay user may have valid credentials,
       * but those credentials must NOT grant administrator
       * portal access.
       */
      await authClient.auth.signOut();

      return json(
        {
          success: false,
          error:
            "This account does not have administrator access.",
        },
        403,
      );
    }

    const adminState =
      state as Record<string, unknown>;

    if (!adminState.is_active) {
      await authClient.auth.signOut();

      return json(
        {
          success: false,
          error:
            "This administrator account is inactive.",
        },
        403,
      );
    }

    /*
     * Record administrator activity.
     */
    const {
      error: activityError,
    } = await userClient.rpc(
      "admin_auth_touch_activity",
    );

    if (activityError) {
      /*
       * Activity tracking should not prevent a legitimate
       * administrator from logging in.
       *
       * The authentication itself has already succeeded.
       */
      console.error(
        "Failed to touch administrator activity:",
        activityError,
      );
    }

    const mustChangePassword =
      Boolean(
        adminState.must_change_password,
      );

    /*
     * Return only the information required by the
     * administrator frontend.
     *
     * Never return passwords or sensitive Auth internals.
     */
    return json({
      success: true,
      user: {
        id: user.id,
        email: user.email ?? null,
      },
      admin: {
        user_id:
          typeof adminState.user_id === "string"
            ? adminState.user_id
            : user.id,

        role:
          typeof adminState.role === "string"
            ? adminState.role
            : null,

        is_active: true,

        display_name:
          typeof adminState.display_name === "string"
            ? adminState.display_name
            : null,

        must_change_password:
          mustChangePassword,
      },
      session: {
        access_token:
          session.access_token,

        refresh_token:
          session.refresh_token,

        expires_at:
          session.expires_at ?? null,

        expires_in:
          session.expires_in ?? null,

        token_type:
          session.token_type ?? "bearer",
      },

      /*
       * The frontend uses this to decide whether to send
       * the administrator to the password-change page.
       */
      redirect:
        mustChangePassword
          ? "/admin/change-password"
          : "/admin/dashboard",
    });
  } catch (error) {
    console.error(
      "admin-login error:",
      error,
    );

    return json(
      {
        success: false,
        error: getErrorMessage(error),
      },
      500,
    );
  }
});
