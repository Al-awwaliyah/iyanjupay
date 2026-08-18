import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, verif-hash",
  "Access-Control-Allow-Methods":
    "GET, POST, PUT, PATCH, DELETE, OPTIONS",
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
    Deno.env.get("SUPABASE_URL") ?? "",
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
 * Validates the caller's Supabase JWT.
 */
export async function getUser(
  req: Request,
) {
  const authHeader =
    req.headers.get("Authorization");

  if (!authHeader) {
    return null;
  }

  const client = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
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
      "Supabase getUser error:",
      error,
    );

    return null;
  }

  return data.user;
}

export const FLW_BASE =
  "https://api.flutterwave.com/v3";

/**
 * Flutterwave API helper.
 *
 * Supports:
 *   GET
 *   POST
 *   PUT
 *   PATCH
 *   DELETE
 *
 * When FLUTTERWAVE_PROXY_URL is configured,
 * requests are first sent through the proxy.
 *
 * IMPORTANT:
 *
 * GET requests do NOT send a body.
 *
 * This prevents the proxy from incorrectly
 * interpreting catalogue requests such as:
 *
 * GET /bills/AIRTIME/billers?country=NG
 *
 * as bill-payment requests requiring an amount.
 */
export async function flw(
  path: string,
  init: RequestInit = {},
) {
  const secretKey =
    Deno.env.get(
      "FLUTTERWAVE_SECRET_KEY",
    );

  if (!secretKey) {
    throw new Error(
      "Flutterwave is not configured",
    );
  }

  const proxyUrl =
    Deno.env.get(
      "FLUTTERWAVE_PROXY_URL",
    );

  const proxySecret =
    Deno.env.get(
      "FLUTTERWAVE_PROXY_SECRET",
    );

  const method = (
    init.method ?? "GET"
  ).toUpperCase();

  /*
   * ============================================================
   * PREPARE REQUEST BODY
   * ============================================================
   */

  let requestBody:
    unknown = undefined;

  if (
    method !== "GET" &&
    method !== "HEAD"
  ) {
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
  }

  /*
   * ============================================================
   * PROXY REQUEST
   * ============================================================
   */

  if (proxyUrl) {
    try {
      const proxyPayload: Record<
        string,
        unknown
      > = {
        path,
        method,
      };

      /*
       * Only attach body for methods
       * that actually support a body.
       */
      if (
        method !== "GET" &&
        method !== "HEAD" &&
        requestBody !== undefined
      ) {
        proxyPayload.body =
          requestBody;
      }

      console.log(
        "Flutterwave proxy request:",
        JSON.stringify(
          proxyPayload,
        ),
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

            body: JSON.stringify(
              proxyPayload,
            ),
          },
        );

      const proxyBody =
        await proxyResponse
          .json()
          .catch(() => ({}));

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
       * IMPORTANT:
       *
       * Return the proxy response whenever
       * the proxy successfully reached
       * Flutterwave.
       *
       * We do not silently treat provider
       * errors as proxy transport errors.
       */
      if (
        proxyResponse.ok
      ) {
        return {
          ok: true,
          status:
            proxyResponse.status,
          body:
            proxyBody,
        };
      }

      /*
       * If the proxy itself returned a
       * provider response such as 400,
       * log it and fall back to direct
       * Flutterwave.
       *
       * This is useful while your proxy
       * configuration is being fixed.
       */
      console.error(
        "Flutterwave proxy failed, falling back to direct call:",
        JSON.stringify({
          status:
            proxyResponse.status,
          body:
            proxyBody,
        }),
      );
    } catch (
      proxyError
    ) {
      console.error(
        "Flutterwave proxy error, falling back to direct call:",
        proxyError,
      );
    }
  }

  /*
   * ============================================================
   * DIRECT FLUTTERWAVE REQUEST
   * ============================================================
   */

  const url =
    `${FLW_BASE}${path}`;

  const directInit: RequestInit = {
    ...init,

    method,

    headers: {
      Authorization:
        `Bearer ${secretKey}`,

      "Content-Type":
        "application/json",

      ...(init.headers ?? {}),
    },
  };

  /*
   * GET / HEAD must not have
   * a request body.
   */
  if (
    method === "GET" ||
    method === "HEAD"
  ) {
    delete (
      directInit as any
    ).body;
  }

  console.log(
    "Flutterwave direct request:",
    JSON.stringify({
      url,
      method,
    }),
  );

  const response =
    await fetch(
      url,
      directInit,
    );

  const body =
    await response
      .json()
      .catch(() => ({}));

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
