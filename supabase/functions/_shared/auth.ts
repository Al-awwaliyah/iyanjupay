import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/*
 * ============================================================
 * CORS
 * ============================================================
 */

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",

  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, verif-hash",

  "Access-Control-Allow-Methods":
    "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};

/*
 * ============================================================
 * JSON RESPONSE
 * ============================================================
 */

export const json = (
  body: unknown,
  status = 200,
) =>
  new Response(
    JSON.stringify(body),
    {
      status,

      headers: {
        ...corsHeaders,

        "Content-Type":
          "application/json",
      },
    },
  );

/*
 * ============================================================
 * SUPABASE ADMIN CLIENT
 * ============================================================
 */

export const adminClient = () =>
  createClient(
    Deno.env.get(
      "SUPABASE_URL",
    ) ?? "",

    Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY",
    ) ?? "",

    {
      auth: {
        persistSession:
          false,
      },
    },
  );

/*
 * ============================================================
 * AUTHENTICATED USER
 * ============================================================
 */

export async function getUser(
  req: Request,
) {
  const authHeader =
    req.headers.get(
      "Authorization",
    );

  if (!authHeader) {
    return null;
  }

  const supabaseUrl =
    Deno.env.get(
      "SUPABASE_URL",
    ) ?? "";

  const supabaseAnonKey =
    Deno.env.get(
      "SUPABASE_ANON_KEY",
    ) ?? "";

  if (
    !supabaseUrl ||
    !supabaseAnonKey
  ) {
    console.error(
      "Supabase authentication environment variables are missing",
    );

    return null;
  }

  const client =
    createClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        global: {
          headers: {
            Authorization:
              authHeader,
          },
        },

        auth: {
          persistSession:
            false,
        },
      },
    );

  const {
    data,
    error,
  } =
    await client.auth.getUser();

  if (error) {
    console.error(
      "Supabase getUser error:",
      error,
    );

    return null;
  }

  return data.user;
}

/*
 * ============================================================
 * FLUTTERWAVE
 * ============================================================
 */

export const FLW_BASE =
  "https://api.flutterwave.com/v3";

/*
 * ============================================================
 * FLUTTERWAVE API HELPER
 * ============================================================
 *
 * Production routing:
 *
 * Supabase Edge Function
 *          ↓
 * FLUTTERWAVE_PROXY_URL
 *          ↓
 * Fixed-IP server
 *          ↓
 * Flutterwave
 *
 * IMPORTANT:
 *
 * When a proxy URL is configured, there is NO direct fallback.
 *
 * This is intentional because Flutterwave services such as
 * bill payments require requests to originate from a
 * whitelisted server IP.
 * ============================================================
 */

export async function flw(
  path: string,
  init: RequestInit = {},
) {
  /*
   * ----------------------------------------------------------
   * Environment
   * ----------------------------------------------------------
   */

  const secretKey =
    Deno.env.get(
      "FLUTTERWAVE_SECRET_KEY",
    );

  const proxyUrl =
    Deno.env.get(
      "FLUTTERWAVE_PROXY_URL",
    );

  const proxySecret =
    Deno.env.get(
      "FLUTTERWAVE_PROXY_SECRET",
    );

  if (!secretKey) {
    throw new Error(
      "Flutterwave is not configured: FLUTTERWAVE_SECRET_KEY is missing",
    );
  }

  /*
   * ----------------------------------------------------------
   * Validate path
   * ----------------------------------------------------------
   */

  if (
    typeof path !==
      "string" ||
    !path.trim()
  ) {
    throw new Error(
      "Flutterwave API path is required",
    );
  }

  if (
    !path.startsWith("/")
  ) {
    throw new Error(
      "Invalid Flutterwave API path",
    );
  }

  if (
    path.includes("://")
  ) {
    throw new Error(
      "External URLs are not allowed",
    );
  }

  /*
   * ----------------------------------------------------------
   * HTTP method
   * ----------------------------------------------------------
   */

  const method = String(
    init.method ??
      "GET",
  ).toUpperCase();

  /*
   * ----------------------------------------------------------
   * Prepare request body
   * ----------------------------------------------------------
   *
   * GET / HEAD:
   *     absolutely no body.
   *
   * POST / PUT / PATCH / DELETE:
   *     JSON body is allowed.
   * ----------------------------------------------------------
   */

  let requestBody:
    unknown = undefined;

  if (
    method !== "GET" &&
    method !== "HEAD"
  ) {
    if (
      init.body !==
      undefined &&
      init.body !== null
    ) {
      try {
        requestBody =
          JSON.parse(
            String(
              init.body,
            ),
          );
      } catch {
        requestBody =
          String(
            init.body,
          );
      }
    }
  }

  /*
   * ==========================================================
   * PROXY MODE
   * ==========================================================
   */

  if (proxyUrl) {
    /*
     * --------------------------------------------------------
     * Build proxy payload
     * --------------------------------------------------------
     */

    const proxyPayload: Record<
      string,
      unknown
    > = {
      path,
      method,
    };

    /*
     * Never send a body for GET/HEAD.
     */

    if (
      method !== "GET" &&
      method !== "HEAD" &&
      requestBody !==
        undefined
    ) {
      proxyPayload.body =
        requestBody;
    }

    console.log(
      "Flutterwave proxy request:",
      JSON.stringify({
        path,
        method,
        has_body:
          proxyPayload.body !==
          undefined,
      }),
    );

    try {
      /*
       * ------------------------------------------------------
       * Call fixed-IP proxy
       * ------------------------------------------------------
       */

      const proxyResponse =
        await fetch(
          proxyUrl.replace(
            /\/$/,
            "",
          ),
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",

              ...(proxySecret
                ? {
                    "x-proxy-secret":
                      proxySecret,
                  }
                : {}),
            },

            body:
              JSON.stringify(
                proxyPayload,
              ),
          },
        );

      /*
       * ------------------------------------------------------
       * Parse response
       * ------------------------------------------------------
       */

      const responseText =
        await proxyResponse.text();

      let proxyBody:
        any = {};

      try {
        proxyBody =
          responseText
            ? JSON.parse(
                responseText,
              )
            : {};
      } catch {
        proxyBody = {
          status:
            "error",

          message:
            responseText ||
            "Proxy returned a non-JSON response",

          data:
            null,
        };
      }

      console.log(
        "Flutterwave proxy response:",
        JSON.stringify({
          http_status:
            proxyResponse.status,

          ok:
            proxyResponse.ok,

          provider_status:
            proxyBody?.status ??
            null,

          message:
            proxyBody?.message ??
            null,
        }),
      );

      /*
       * ------------------------------------------------------
       * IMPORTANT
       *
       * Return the proxy result regardless of whether
       * Flutterwave returned 200, 400, 401, 403, etc.
       *
       * A provider error is NOT a transport error.
       *
       * NEVER fall back to direct Flutterwave.
       * ------------------------------------------------------
       */

      return {
        ok:
          proxyResponse.ok,

        status:
          proxyResponse.status,

        body:
          proxyBody,
      };
    } catch (
      proxyError
    ) {
      console.error(
        "Flutterwave proxy request failed:",
        proxyError,
      );

      /*
       * Do NOT bypass the fixed-IP proxy.
       */

      throw new Error(
        "Flutterwave proxy is unavailable. Please try again later.",
      );
    }
  }

  /*
   * ==========================================================
   * DIRECT MODE
   * ==========================================================
   *
   * This is only used if FLUTTERWAVE_PROXY_URL is NOT configured.
   *
   * For production bill/transfer/BVN/card issuing operations,
   * configure the proxy.
   * ==========================================================
   */

  const url =
    `${FLW_BASE}${path}`;

  const headers: Record<
    string,
    string
  > = {
    Authorization:
      `Bearer ${secretKey}`,

    Accept:
      "application/json",
  };

  const directInit:
    RequestInit = {
    method,

    headers,
  };

  /*
   * ----------------------------------------------------------
   * Direct request body
   * ----------------------------------------------------------
   */

  if (
    method !== "GET" &&
    method !== "HEAD"
  ) {
    headers[
      "Content-Type"
    ] =
      "application/json";

    if (
      requestBody !==
      undefined
    ) {
      directInit.body =
        JSON.stringify(
          requestBody,
        );
    }
  }

  console.warn(
    "Flutterwave direct request:",
    JSON.stringify({
      url,
      method,
      warning:
        "FLUTTERWAVE_PROXY_URL is not configured",
    }),
  );

  /*
   * ----------------------------------------------------------
   * Call Flutterwave directly
   * ----------------------------------------------------------
   */

  const response =
    await fetch(
      url,
      directInit,
    );

  const responseText =
    await response.text();

  let body:
    any = {};

  try {
    body =
      responseText
        ? JSON.parse(
            responseText,
          )
        : {};
  } catch {
    body = {
      status:
        "error",

      message:
        responseText ||
        "Flutterwave returned a non-JSON response",

      data:
        null,
    };
  }

  console.log(
    "Flutterwave direct response:",
    JSON.stringify({
      url,

      http_status:
        response.status,

      ok:
        response.ok,

      provider_status:
        body?.status ??
        null,

      message:
        body?.message ??
        null,
    }),
  );

  return {
    ok:
      response.ok,

    status:
      response.status,

    body,
  };
}
