import { getUser, json } from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PROVN_API_URL =
  "https://api.provn.ng/verification/bvn";

Deno.serve(async (req) => {
  // ============================================================
  // CORS
  // ============================================================

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

  // ============================================================
  // METHOD
  // ============================================================

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
    // ==========================================================
    // AUTHENTICATED USER
    // ==========================================================

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

    // ==========================================================
    // ENVIRONMENT VARIABLES
    // ==========================================================

    const provnApiKey =
      Deno.env.get("PROVN_API_KEY");

    const provnAccessKey =
      Deno.env.get("PROVN_ACCESS_KEY");

    const supabaseUrl =
      Deno.env.get("SUPABASE_URL");

    const serviceRoleKey =
      Deno.env.get(
        "SUPABASE_SERVICE_ROLE_KEY",
      );

    if (
      !provnApiKey ||
      !provnAccessKey
    ) {
      console.error(
        "PROVN credentials are not configured.",
      );

      return json(
        {
          success: false,
          error:
            "BVN verification service is not configured.",
        },
        500,
      );
    }

    if (
      !supabaseUrl ||
      !serviceRoleKey
    ) {
      console.error(
        "Supabase service credentials are not configured.",
      );

      return json(
        {
          success: false,
          error:
            "Server database configuration is incomplete.",
        },
        500,
      );
    }

    // ==========================================================
    // SUPABASE ADMIN CLIENT
    // ==========================================================

    const supabaseAdmin =
      createClient(
        supabaseUrl,
        serviceRoleKey,
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
          },
        },
      );

    // ==========================================================
    // REQUEST BODY
    // ==========================================================

    let body: any;

    try {
      body = await req.json();
    } catch {
      return json(
        {
          success: false,
          error:
            "Invalid JSON request body.",
        },
        400,
      );
    }

    // ==========================================================
    // ACTION
    // ==========================================================

    const action =
      String(
        body?.action ?? "verify",
      ).toLowerCase();

    // ==========================================================
    // KYC STATUS
    // ==========================================================

    if (action === "status") {
      const {
        data: profile,
        error: profileError,
      } = await supabaseAdmin
        .from("profiles")
        .select(
          "bvn, bvn_verified, kyc_level, kyc_status",
        )
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        console.error(
          "Unable to load KYC profile:",
          profileError,
        );

        /*
         * If the project does not yet have the KYC
         * columns, return a safe default instead of
         * exposing the database error to the user.
         */
        return json(
          {
            success: true,
            verified: false,
            kyc_level: 1,
            kyc_status: "unverified",
            bvn_masked: null,
            fee: 0,
          },
          200,
        );
      }

      const storedBvn =
        profile?.bvn
          ? String(profile.bvn)
          : "";

      const bvnMasked =
        storedBvn.length === 11
          ? `******${storedBvn.slice(-4)}`
          : null;

      return json(
        {
          success: true,

          verified:
            Boolean(
              profile?.bvn_verified,
            ),

          kyc_level:
            Number(
              profile?.kyc_level ?? 1,
            ),

          kyc_status:
            String(
              profile?.kyc_status ??
                "unverified",
            ),

          bvn_masked:
            bvnMasked,

          fee: 0,
        },
        200,
      );
    }

    // ==========================================================
    // ONLY VERIFY IS SUPPORTED AFTER THIS POINT
    // ==========================================================

    if (action !== "verify") {
      return json(
        {
          success: false,
          error:
            "Unsupported BVN action.",
        },
        400,
      );
    }

    // ==========================================================
    // BVN
    // ==========================================================

    const bvn =
      String(
        body?.bvn ?? "",
      ).replace(/\D/g, "");

    if (!/^\d{11}$/.test(bvn)) {
      return json(
        {
          success: false,
          verified: false,
          error:
            "BVN must contain exactly 11 digits.",
        },
        400,
      );
    }

    console.log(
      "Starting PROVN BVN verification:",
      JSON.stringify({
        user_id: user.id,
        bvn_last_four:
          bvn.slice(-4),
      }),
    );

    // ==========================================================
    // CALL PROVN
    // ==========================================================

    let response: Response;

    try {
      response = await fetch(
        PROVN_API_URL,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            "API-Key":
              provnApiKey,

            "Access-Key":
              provnAccessKey,
          },

          body: JSON.stringify({
            bvn,
          }),
        },
      );
    } catch (error) {
      console.error(
        "PROVN network error:",
        error,
      );

      return json(
        {
          success: false,
          verified: false,
          error:
            "Unable to connect to the BVN verification service.",
        },
        503,
      );
    }

    // ==========================================================
    // READ PROVN RESPONSE
    // ==========================================================

    let providerData: any = null;

    try {
      providerData =
        await response.json();
    } catch {
      providerData = null;
    }

    console.log(
      "PROVN BVN response:",
      JSON.stringify({
        http_status:
          response.status,

        ok:
          response.ok,

        provider_status:
          providerData?.status ??
          null,

        provider_code:
          providerData?.code ??
          null,

        message:
          providerData?.message ??
          providerData?.detail ??
          null,
      }),
    );

    // ==========================================================
    // PROVIDER ERROR
    // ==========================================================

    if (
      !response.ok ||
      providerData?.status !==
        "success"
    ) {
      const providerError =
        providerData?.detail ||
        providerData?.message ||
        "BVN verification failed.";

      return json(
        {
          success: false,

          verified: false,

          error:
            providerError,

          provider_status:
            providerData?.status ??
            null,

          provider_code:
            providerData?.code ??
            response.status,
        },
        response.status >= 400 &&
          response.status < 500
          ? 400
          : 503,
      );
    }

    // ==========================================================
    // EXTRACT VERIFIED DATA
    // ==========================================================

    const data =
      providerData?.data ?? {};

    const firstName =
      String(
        data?.first_name ?? "",
      ).trim();

    const lastName =
      String(
        data?.last_name ?? "",
      ).trim();

    const middleName =
      String(
        data?.middle_name ?? "",
      ).trim();

    const verifiedPhone =
      String(
        data?.phone_number ?? "",
      ).trim();

    const verifiedDob =
      String(
        data?.date_of_birth ?? "",
      ).trim();

    const stateOfOrigin =
      String(
        data?.state_of_origin ?? "",
      ).trim();

    // ==========================================================
    // BUILD VERIFIED FULL NAME
    // ==========================================================

    const verifiedFullName =
      [
        firstName,
        middleName,
        lastName,
      ]
        .filter(Boolean)
        .join(" ")
        .trim();

    // ==========================================================
    // UPDATE USER PROFILE
    // ==========================================================

    /*
     * BVN becomes the source of truth for the identity
     * fields that PROVN successfully returned.
     *
     * We DO NOT update:
     * - Supabase Auth email
     * - Supabase Auth password
     * - NIN
     * - user's address
     * - nickname
     * - gender
     *
     * Those remain separate profile information.
     */

    const profileUpdate: Record<
      string,
      unknown
    > = {
      bvn: bvn,
      bvn_verified: true,
      kyc_level: 2,
      kyc_status: "verified",
      updated_at:
        new Date().toISOString(),
    };

    if (verifiedFullName) {
      profileUpdate.full_name =
        verifiedFullName;
    }

    if (verifiedPhone) {
      profileUpdate.phone_number =
        verifiedPhone;
    }

    if (verifiedDob) {
      profileUpdate.date_of_birth =
        verifiedDob;
    }

    const {
      error: profileUpdateError,
    } = await supabaseAdmin
      .from("profiles")
      .update(profileUpdate)
      .eq("id", user.id);

    if (profileUpdateError) {
      console.error(
        "Failed to update verified profile:",
        profileUpdateError,
      );

      return json(
        {
          success: false,
          verified: false,
          error:
            "BVN was verified, but your profile could not be updated.",
        },
        500,
      );
    }

    // ==========================================================
    // SUCCESS
    // ==========================================================

    return json(
      {
        success: true,

        verified: true,

        message:
          providerData?.message ||
          "BVN verification successful.",

        verification: {
          first_name:
            firstName || null,

          last_name:
            lastName || null,

          middle_name:
            middleName || null,

          date_of_birth:
            verifiedDob || null,

          phone_number:
            verifiedPhone || null,

          state_of_origin:
            stateOfOrigin || null,
        },

        profile_updated: true,

        kyc: {
          level: 2,
          status: "verified",
        },
      },
      200,
    );
  } catch (error) {
    console.error(
      "PROVN BVN INTERNAL ERROR:",
      error,
    );

    return json(
      {
        success: false,

        verified: false,

        error:
          error instanceof Error
            ? error.message
            : "Internal server error.",
      },
      500,
    );
  }
});
