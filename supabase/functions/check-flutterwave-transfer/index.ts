const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":
    "POST, OPTIONS",
  "Content-Type": "application/json",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: corsHeaders,
  });
}

Deno.serve(async (req) => {
  // ---------------------------------------------------------
  // CORS
  // ---------------------------------------------------------

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  // ---------------------------------------------------------
  // METHOD
  // ---------------------------------------------------------

  if (req.method !== "POST") {
    return jsonResponse({
      success: false,
      error: "Method not allowed",
    }, 405);
  }

  try {
    // -------------------------------------------------------
    // FLUTTERWAVE SECRET
    // -------------------------------------------------------

    const flutterwaveSecret =
      Deno.env.get("FLUTTERWAVE_SECRET_KEY") ?? "";

    if (!flutterwaveSecret) {
      return jsonResponse({
        success: false,
        error:
          "FLUTTERWAVE_SECRET_KEY is not configured",
      }, 500);
    }

    // -------------------------------------------------------
    // REQUEST BODY
    // -------------------------------------------------------

    let body: any;

    try {
      body = await req.json();
    } catch {
      return jsonResponse({
        success: false,
        error: "Invalid JSON request body",
      }, 400);
    }

    const transferId = String(
      body?.transfer_id ?? ""
    ).trim();

    if (!transferId) {
      return jsonResponse({
        success: false,
        error: "transfer_id is required",
      }, 400);
    }

    // -------------------------------------------------------
    // VALIDATE TRANSFER ID
    // -------------------------------------------------------

    if (!/^\d+$/.test(transferId)) {
      return jsonResponse({
        success: false,
        error: "Invalid transfer_id",
      }, 400);
    }

    console.log(
      "Checking Flutterwave transfer:",
      transferId
    );

    // -------------------------------------------------------
    // FLUTTERWAVE STATUS REQUEST
    // -------------------------------------------------------

    const flutterwaveResponse = await fetch(
      `https://api.flutterwave.com/v3/transfers/${encodeURIComponent(
        transferId
      )}`,
      {
        method: "GET",

        headers: {
          Authorization:
            `Bearer ${flutterwaveSecret}`,

          Accept:
            "application/json",
        },
      }
    );

    // -------------------------------------------------------
    // READ RESPONSE
    // -------------------------------------------------------

    const responseText =
      await flutterwaveResponse.text();

    let flutterwaveData: any = null;

    try {
      flutterwaveData =
        responseText
          ? JSON.parse(responseText)
          : null;
    } catch {
      flutterwaveData = {
        raw_response:
          responseText,
      };
    }

    console.log(
      "Flutterwave HTTP status:",
      flutterwaveResponse.status
    );

    console.log(
      "Flutterwave transfer response:",
      JSON.stringify(
        flutterwaveData
      )
    );

    // -------------------------------------------------------
    // RETURN EXACT PROVIDER RESULT
    // -------------------------------------------------------

    return jsonResponse({
      success:
        flutterwaveResponse.ok,

      http_status:
        flutterwaveResponse.status,

      transfer_id:
        transferId,

      provider_status:
        flutterwaveData?.status ?? null,

      transfer_status:
        flutterwaveData?.data?.status ?? null,

      message:
        flutterwaveData?.message ?? null,

      flutterwave_response:
        flutterwaveData,
    });
  } catch (error) {
    console.error(
      "TRANSFER STATUS CHECK ERROR:",
      error
    );

    return jsonResponse({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Internal server error",
    }, 500);
  }
});
