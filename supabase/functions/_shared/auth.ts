import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, verif-hash",
};

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
        persistSession: false,
      },
    },
  );

/**
 * Validates the caller's JWT in-code
 * and returns the authenticated user.
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

  const client =
    createClient(
      Deno.env.get(
        "SUPABASE_URL",
      ) ?? "",
      Deno.env.get(
        "SUPABASE_ANON_KEY",
      ) ?? "",
      {
        global: {
          headers: {
            Authorization:
              authHeader,
          },
        },

        auth: {
          persistSession: false,
        },
      },
    );

  const {
    data,
    error,
  } = await client.auth.getUser();

  if (error) {
    console.error(
      "Supabase auth.getUser failed:",
      error,
    );

    return null;
  }

  return data.user;
};

// ============================================================
// FLUTTERWAVE
// ============================================================

export const FLW_BASE =
  "https://api.flutterwave.com/v3";

/**
 * Calls the Flutterwave v3 API.
 *
 * Supports:
 *
 * 1. Direct Flutterwave API
 *
 * 2. Optional fixed-IP proxy
 *
 * The proxy is useful for Flutterwave endpoints
 * that require server IP whitelisting.
 */
export async function flw(
  path: string,
  init: RequestInit = {},
) {
  // ============================================================
  // 1. FLUTTERWAVE SECRET KEY
  // ============================================================

  const secretKey =
    Deno.env.get(
      "FLUTTERWAVE_SECRET_KEY",
    );

  if (!secretKey) {
    throw new Error(
      "Flutterwave is not configured",
    );
  }

  // ============================================================
  // 2. PROXY CONFIGURATION
  // ============================================================

  const proxyUrl =
    Deno.env.get(
      "FLUTTERWAVE_PROXY_URL",
    );

  const proxySecret =
    Deno.env.get(
      "FLUTTERWAVE_PROXY_SECRET",
    );

  // ============================================================
  // 3. REQUEST DETAILS
  // ============================================================

  const method =
    init.method ?? "GET";

  let requestBody:
    | unknown
    | undefined = undefined;

  if (init.body) {
    try {
      requestBody =
        JSON.parse(
          String(init.body),
        );
    } catch {
      requestBody =
        String(init.body);
    }
  }

  // ============================================================
  // 4. PROXY REQUEST
  // ============================================================

  if (proxyUrl) {
    try {
      console.log(
        "Flutterwave proxy request:",
        JSON.stringify({
          path,
          method,
        }),
      );

      const proxyResponse =
        await fetch(
          proxyUrl.replace(
            /\/$/,
            "",
          ),
          {
            method: "POST",

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

            body: JSON.stringify({
              path,
              method,
              body:
                requestBody,
            }),
          },
        );

      const proxyBody =
        await proxyResponse
          .json()
          .catch(
            () => ({}),
          );

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

      // ========================================================
      // PROXY SUCCESS
      // ========================================================

      if (
        proxyResponse.ok
      ) {
        /*
         * Some proxy implementations return
         * Flutterwave's response directly.
         *
         * Others may return a successful HTTP
         * response with a Flutterwave error body.
         *
         * We therefore inspect the provider
         * status as well.
         */

        const providerSuccess =
          proxyBody?.status ===
            "success";

        /*
         * If Flutterwave explicitly says
         * "error", don't hide it.
         */
        if (
          proxyBody?.status ===
          "error"
        ) {
          console.error(
            "Flutterwave proxy returned provider error:",
            JSON.stringify(
              proxyBody,
            ),
          );

          return {
            ok: false,
            status:
              proxyResponse.status,
            body:
              proxyBody,
          };
        }

        return {
          ok:
            providerSuccess ||
            proxyBody?.status ===
              undefined,

          status:
            proxyResponse.status,

          body:
            proxyBody,
        };
      }

      // ========================================================
      // PROXY FAILURE
      // ========================================================

      console.error(
        "Flutterwave proxy failed, falling back to direct call:",
        JSON.stringify({
          status:
            proxyResponse.status,

          body:
            proxyBody,
        }),
      );
    } catch (error) {
      console.error(
        "Flutterwave proxy error, falling back to direct call:",
        error,
      );
    }
  }

  // ============================================================
  // 5. DIRECT FLUTTERWAVE REQUEST
  // ============================================================

  const url =
    `${FLW_BASE}${path}`;

  console.log(
    "Flutterwave direct request:",
    JSON.stringify({
      url,
      method,
    }),
  );

  try {
    const response =
      await fetch(
        url,
        {
          ...init,

          headers: {
            Authorization:
              `Bearer ${secretKey}`,

            "Content-Type":
              "application/json",

            ...(init.headers ??
              {}),
          },
        },
      );

    const responseBody =
      await response
        .json()
        .catch(
          () => ({}),
        );

    console.log(
      "Flutterwave direct response:",
      JSON.stringify({
        url,

        http_status:
          response.status,

        ok:
          response.ok,

        provider_status:
          responseBody?.status ??
          null,

        message:
          responseBody?.message ??
          null,
      }),
    );

    return {
      ok:
        response.ok,

      status:
        response.status,

      body:
        responseBody,
    };
  } catch (error) {
    console.error(
      "Flutterwave direct request error:",
      error,
    );

    throw error;
  }
}
