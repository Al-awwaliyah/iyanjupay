import { getUser, json } from "../_shared/auth.ts";

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
    // PROVN CREDENTIALS
    // ==========================================================

    const provnApiKey =
      Deno.env.get("PROVN_API_KEY");

    const provnAccessKey =
      Deno.env.get("PROVN_ACCESS_KEY");

    if (!provnApiKey || !provnAccessKey) {
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
      String(body?.action ?? "verify")
        .trim()
        .toLowerCase();

    // ==========================================================
    // STATUS
    //
    // IMPORTANT:
    // This does NOT call PROVN.
    // It only reports that the user has not been
    // marked verified by this function.
    //
    // If you already have a KYC table, you can later
    // connect this section to that table.
    // ==========================================================

    if (action === "status") {
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

    // ==========================================================
    // ONLY VERIFY ACTION IS SUPPORTED
    // ==========================================================

    if (action !== "verify") {
      return json(
        {
          success: false,
          error:
            "Unsupported action.",
        },
        400,
      );
    }

    // ==========================================================
    // BVN
    // ==========================================================

    const bvn = String(
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
        bvn_last_four: bvn.slice(-4),
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
    // READ PROVIDER RESPONSE
    // ==========================================================

    let providerData: any = null;

    try {
      providerData =
        await response.json();
    } catch {
      providerData = null;
    }

    // ==========================================================
    // LOG ONLY SAFE PROVIDER INFORMATION
    // ==========================================================

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
      providerData?.status !== "success"
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
    // SUCCESS
    //
    // IMPORTANT:
    //
    // PROVN TEST KEYS return dummy identity data.
    //
    // DO NOT:
    // - update profiles.full_name
    // - update profiles.phone_number
    // - update profiles.date_of_birth
    // - update profiles.address
    // - update any other user identity fields
    //
    // The frontend should simply treat this as:
    // "BVN verification successful."
    //
    // PROVN documentation confirms test keys return
    // dummy payload data rather than live registry data.
    // ==========================================================

    return json(
      {
        success: true,

        verified: true,

        message:
          providerData?.message ||
          "BVN verification successful.",

        /*
         * We intentionally DO NOT return the
         * dummy identity payload to the frontend.
         *
         * This prevents the React component from
         * accidentally replacing the user's profile
         * with PROVN test data.
         */

        verification: {
          verified: true,
        },

        test_mode:
          String(
            provnApiKey,
          ).startsWith("test_"),
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
