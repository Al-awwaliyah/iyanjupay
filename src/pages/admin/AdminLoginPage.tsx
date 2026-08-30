import React, {
  FormEvent,
  useEffect,
  useState,
} from "react";

import {
  AlertCircle,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  LogIn,
  ShieldCheck,
} from "lucide-react";

import { useNavigate } from "react-router-dom";

import { supabase } from "@/integrations/supabase/client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";

type AdminRole =
  | "super_admin"
  | "operations_admin"
  | "support_admin"
  | "finance_admin"
  | "compliance_admin"
  | "read_only_admin";

type AdminLoginResponse = {
  success?: boolean;

  user?: {
    id?: string;
    email?: string | null;
  };

  admin?: {
    user_id?: string;
    role?: AdminRole | string | null;
    is_active?: boolean;
    display_name?: string | null;
    must_change_password?: boolean;
  };

  session?: {
    access_token?: string;
    refresh_token?: string;
    expires_at?: number | null;
    expires_in?: number | null;
    token_type?: string | null;
  };

  redirect?: string;

  error?: string;
  message?: string;
};

/*
 * ============================================================
 * ERROR HANDLING
 * ============================================================
 */

function extractError(error: unknown): string {
  if (!error) {
    return "Unable to sign in.";
  }

  if (typeof error === "string") {
    return error.trim() || "Unable to sign in.";
  }

  if (error instanceof Error) {
    if (error.message?.trim()) {
      return error.message.trim();
    }

    return "Unable to sign in.";
  }

  if (typeof error === "object") {
    const value = error as {
      message?: unknown;
      error_description?: unknown;
      details?: unknown;
      hint?: unknown;
      error?: unknown;
      code?: unknown;
      status?: unknown;
      name?: unknown;
    };

    const candidates = [
      value.message,
      value.error_description,
      value.details,
      value.hint,
      value.error,
    ];

    for (const candidate of candidates) {
      if (
        typeof candidate === "string" &&
        candidate.trim()
      ) {
        return candidate.trim();
      }
    }

    /*
     * Some Supabase/Edge Function errors may expose a
     * structured response body rather than a useful message.
     */
    if (
      typeof value.error === "object" &&
      value.error !== null
    ) {
      const nested =
        value.error as {
          message?: unknown;
          error?: unknown;
          details?: unknown;
        };

      const nestedCandidates = [
        nested.message,
        nested.error,
        nested.details,
      ];

      for (const candidate of nestedCandidates) {
        if (
          typeof candidate === "string" &&
          candidate.trim()
        ) {
          return candidate.trim();
        }
      }
    }

    if (
      typeof value.code === "string" &&
      value.code.trim()
    ) {
      return `Authentication error (${value.code.trim()}).`;
    }

    if (
      typeof value.status === "number"
    ) {
      if (value.status === 401) {
        return "Invalid administrator email or password.";
      }

      if (value.status === 403) {
        return "You are not authorized to access the administrator portal.";
      }

      if (value.status >= 500) {
        return "The administrator authentication service is temporarily unavailable. Please try again.";
      }
    }
  }

  return "Unable to sign in. Please try again.";
}

function getFriendlyAdminLoginError(
  error: unknown,
): string {
  const message =
    extractError(error);

  const normalized =
    message.toLowerCase();

  /*
   * Authentication-related errors.
   */
  if (
    normalized.includes(
      "invalid login credentials",
    ) ||
    normalized.includes(
      "invalid credentials",
    ) ||
    normalized.includes(
      "invalid email or password",
    ) ||
    normalized.includes(
      "invalid administrator credentials",
    )
  ) {
    return "Invalid administrator email or password.";
  }

  /*
   * Authorization-related errors.
   */
  if (
    normalized.includes(
      "not authorized",
    ) ||
    normalized.includes(
      "unauthorized",
    ) ||
    normalized.includes(
      "access denied",
    ) ||
    normalized.includes(
      "permission denied",
    )
  ) {
    return "You are not authorized to access the administrator portal.";
  }

  /*
   * Network / connectivity errors.
   */
  if (
    normalized.includes(
      "failed to fetch",
    ) ||
    normalized.includes(
      "network error",
    ) ||
    normalized.includes(
      "network request failed",
    ) ||
    normalized.includes(
      "fetch failed",
    ) ||
    normalized.includes(
      "load failed",
    ) ||
    normalized.includes(
      "connection refused",
    ) ||
    normalized.includes(
      "connection reset",
    ) ||
    normalized.includes(
      "timeout",
    )
  ) {
    return "Unable to connect to the administrator authentication service. Please check your internet connection and try again.";
  }

  /*
   * Edge Function availability/errors.
   */
  if (
    normalized.includes(
      "failed to invoke function",
    ) ||
    normalized.includes(
      "edge function",
    ) ||
    normalized.includes(
      "functionshttp",
    ) ||
    normalized.includes(
      "function invocation",
    )
  ) {
    return "The administrator authentication service is temporarily unavailable. Please try again.";
  }

  /*
   * Session establishment errors.
   */
  if (
    normalized.includes(
      "session could not be established",
    ) ||
    normalized.includes(
      "session could not be established",
    ) ||
    normalized.includes(
      "invalid session",
    )
  ) {
    return "Administrator authentication succeeded, but your secure session could not be established. Please try again.";
  }

  /*
   * Administrator verification errors.
   */
  if (
    normalized.includes(
      "administrator privileges could not be verified",
    ) ||
    normalized.includes(
      "administrator session could not be verified",
    ) ||
    normalized.includes(
      "administrator identity verification failed",
    )
  ) {
    return "Your administrator account could not be verified. Please try signing in again.";
  }

  /*
   * Keep deliberate server-side messages such as:
   * - account inactive
   * - administrator information missing
   * - temporary password requirements
   *
   * rather than hiding them behind a generic message.
   */
  return message;
}

function getRoleLabel(
  role: AdminRole | string | null | undefined,
): string {
  switch (role) {
    case "super_admin":
      return "Super Admin";

    case "operations_admin":
      return "Operations Admin";

    case "support_admin":
      return "Support Admin";

    case "finance_admin":
      return "Finance Admin";

    case "compliance_admin":
      return "Compliance Admin";

    case "read_only_admin":
      return "Read Only Admin";

    default:
      return "Administrator";
  }
}

function getSafeAdminRedirect(
  redirect: unknown,
  mustChangePassword: boolean,
): string {
  /*
   * Never trust an arbitrary redirect returned by the
   * authentication service.
   *
   * Only allow internal administrator routes.
   */
  if (
    typeof redirect === "string" &&
    redirect.startsWith("/admin/") &&
    !redirect.startsWith("//")
  ) {
    return redirect;
  }

  if (mustChangePassword) {
    return "/admin/change-password";
  }

  return "/admin/dashboard";
}

const AdminLoginPage: React.FC = () => {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [showPassword, setShowPassword] =
    useState(false);

  const [loading, setLoading] = useState(false);

  const [checkingSession, setCheckingSession] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const [success, setSuccess] =
    useState<string | null>(null);

  /*
   * Check whether the browser already contains a valid
   * administrator session.
   *
   * IMPORTANT:
   *
   * This page intentionally does NOT use AdminLayout.
   *
   * Admin login must remain outside the protected
   * administrator layout/guard.
   */
  useEffect(() => {
    let mounted = true;

    const checkExistingAdminSession =
      async () => {
        try {
          setCheckingSession(true);

          const {
            data: {
              session,
            },
          } = await supabase.auth.getSession();

          if (!mounted) {
            return;
          }

          /*
           * No existing Supabase session.
           *
           * Keep the login form visible.
           */
          if (!session) {
            setCheckingSession(false);
            return;
          }

          /*
           * A session alone does NOT make somebody an
           * administrator.
           *
           * Verify the admin state through the database RPC.
           */
          const {
            data,
            error: stateError,
          } =
            await supabase.rpc(
              "admin_auth_get_state",
            );

          if (!mounted) {
            return;
          }

          if (stateError) {
            console.error(
              "Failed to verify existing administrator session:",
              stateError,
            );

            /*
             * Existing behavior is preserved:
             * an unverified administrator session is cleared.
             */
            try {
              await supabase.auth.signOut();
            } catch (signOutError) {
              console.error(
                "Failed to clear invalid administrator session:",
                signOutError,
              );
            }

            if (mounted) {
              setError(
                getFriendlyAdminLoginError(
                  stateError,
                ),
              );
              setCheckingSession(false);
            }

            return;
          }

          if (
            !data ||
            typeof data !== "object"
          ) {
            console.error(
              "Administrator state RPC returned an invalid response:",
              data,
            );

            try {
              await supabase.auth.signOut();
            } catch (signOutError) {
              console.error(
                "Failed to clear invalid administrator session:",
                signOutError,
              );
            }

            if (mounted) {
              setError(
                "Unable to verify your administrator session. Please sign in again.",
              );
              setCheckingSession(false);
            }

            return;
          }

          const state =
            data as Record<string, unknown>;

          const isAdmin =
            state.is_admin === true;

          const isActive =
            state.is_active === true;

          const mustChangePassword =
            state.must_change_password === true;

          /*
           * A normal IyanjuPay user must never be allowed
           * to keep an ordinary user session and then enter
           * the administrator portal.
           */
          if (!isAdmin || !isActive) {
            try {
              await supabase.auth.signOut();
            } catch (signOutError) {
              console.error(
                "Failed to clear non-admin session:",
                signOutError,
              );
            }

            if (mounted) {
              setCheckingSession(false);
            }

            return;
          }

          /*
           * Existing administrator session is valid.
           *
           * Redirect directly to the appropriate protected
           * admin page.
           */
          if (mustChangePassword) {
            navigate(
              "/admin/change-password",
              {
                replace: true,
              },
            );
          } else {
            navigate(
              "/admin/dashboard",
              {
                replace: true,
              },
            );
          }
        } catch (existingSessionError) {
          console.error(
            "Failed to check existing administrator session:",
            existingSessionError,
          );

          if (mounted) {
            setError(
              getFriendlyAdminLoginError(
                existingSessionError,
              ),
            );

            setCheckingSession(false);
          }
        }
      };

    void checkExistingAdminSession();

    return () => {
      mounted = false;
    };
  }, [navigate]);

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    if (loading) {
      return;
    }

    setError(null);
    setSuccess(null);

    const normalizedEmail =
      email.trim().toLowerCase();

    if (!normalizedEmail) {
      setError(
        "Administrator email address is required.",
      );
      return;
    }

    if (!password) {
      setError(
        "Administrator password is required.",
      );
      return;
    }

    try {
      setLoading(true);

      /*
       * Always clear any stale browser session before
       * attempting administrator authentication.
       *
       * This prevents an existing normal-user session
       * from interfering with the admin-login function.
       */
      try {
        await supabase.auth.signOut();
      } catch (signOutError) {
        /*
         * This cleanup failure should not prevent the
         * administrator from attempting to authenticate.
         */
        console.warn(
          "Unable to clear previous session before administrator login:",
          signOutError,
        );
      }

      /*
       * Authenticate through the dedicated admin-login
       * Edge Function.
       */
      const {
        data,
        error: functionError,
      } =
        await supabase.functions.invoke(
          "admin-login",
          {
            body: {
              email: normalizedEmail,
              password,
            },
          },
        );

      if (functionError) {
        throw functionError;
      }

      if (!data) {
        throw new Error(
          "No response was received from the administrator authentication service.",
        );
      }

      const response =
        data as AdminLoginResponse;

      if (response.success !== true) {
        throw new Error(
          response.error ??
            response.message ??
            "Invalid administrator credentials.",
        );
      }

      /*
       * The admin-login Edge Function must return a real
       * Supabase session.
       */
      const accessToken =
        response.session?.access_token;

      const refreshToken =
        response.session?.refresh_token;

      if (
        !accessToken ||
        !refreshToken
      ) {
        throw new Error(
          "Administrator authentication succeeded, but no valid session was returned.",
        );
      }

      /*
       * Establish the returned Supabase session in the
       * browser.
       */
      const {
        data: sessionData,
        error: sessionError,
      } =
        await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

      if (sessionError) {
        throw sessionError;
      }

      if (!sessionData.session) {
        throw new Error(
          "Administrator session could not be established.",
        );
      }

      /*
       * Validate the administrator object returned by the
       * authentication function.
       */
      const admin =
        response.admin;

      if (!admin) {
        try {
          await supabase.auth.signOut();
        } catch (signOutError) {
          console.error(
            "Failed to clear session after missing administrator information:",
            signOutError,
          );
        }

        throw new Error(
          "Administrator information was not returned by the authentication service.",
        );
      }

      if (!admin.user_id) {
        try {
          await supabase.auth.signOut();
        } catch (signOutError) {
          console.error(
            "Failed to clear session after missing administrator identity:",
            signOutError,
          );
        }

        throw new Error(
          "Administrator user identity was not returned.",
        );
      }

      if (admin.is_active !== true) {
        try {
          await supabase.auth.signOut();
        } catch (signOutError) {
          console.error(
            "Failed to clear inactive administrator session:",
            signOutError,
          );
        }

        throw new Error(
          "This administrator account is inactive.",
        );
      }

      const role =
        admin.role ?? null;

      const mustChangePassword =
        admin.must_change_password === true;

      /*
       * Final server-side verification after the Supabase
       * session has been established.
       *
       * This is important because the frontend should not
       * rely solely on the JSON response from admin-login.
       */
      const {
        data: verifiedState,
        error: verifiedStateError,
      } =
        await supabase.rpc(
          "admin_auth_get_state",
        );

      if (verifiedStateError) {
        try {
          await supabase.auth.signOut();
        } catch (signOutError) {
          console.error(
            "Failed to clear session after administrator verification failure:",
            signOutError,
          );
        }

        throw verifiedStateError;
      }

      if (
        !verifiedState ||
        typeof verifiedState !== "object"
      ) {
        try {
          await supabase.auth.signOut();
        } catch (signOutError) {
          console.error(
            "Failed to clear session after invalid administrator verification response:",
            signOutError,
          );
        }

        throw new Error(
          "The administrator session could not be verified.",
        );
      }

      const verified =
        verifiedState as Record<
          string,
          unknown
        >;

      if (
        verified.is_admin !== true ||
        verified.is_active !== true
      ) {
        try {
          await supabase.auth.signOut();
        } catch (signOutError) {
          console.error(
            "Failed to clear unauthorized administrator session:",
            signOutError,
          );
        }

        throw new Error(
          "Administrator privileges could not be verified.",
        );
      }

      const verifiedMustChangePassword =
        verified.must_change_password === true;

      /*
       * Password-change requirement takes priority over
       * every normal administrator destination.
       */
      if (
        mustChangePassword ||
        verifiedMustChangePassword
      ) {
        setSuccess(
          "Administrator login successful. Redirecting you to change your temporary password...",
        );

        window.setTimeout(() => {
          navigate(
            "/admin/change-password",
            {
              replace: true,
            },
          );
        }, 400);

        return;
      }

      const destination =
        getSafeAdminRedirect(
          response.redirect,
          false,
        );

      setSuccess(
        `Welcome back. Signing you in as ${getRoleLabel(
          role,
        )}...`,
      );

      /*
       * Use React Router navigation rather than
       * window.location so the SPA remains inside the
       * administrator route tree.
       */
      window.setTimeout(() => {
        navigate(
          destination,
          {
            replace: true,
          },
        );
      }, 400);
    } catch (submitError) {
      console.error(
        "Administrator login failed:",
        submitError,
      );

      /*
       * Never leave a partially-created session behind
       * after authentication/verification failure.
       */
      try {
        await supabase.auth.signOut();
      } catch (signOutError) {
        /*
         * The original authentication error is more important
         * than a cleanup failure, so only log this error.
         */
        console.error(
          "Failed to clear failed administrator session:",
          signOutError,
        );
      }

      if (submitError instanceof Response) {
        try {
          const responseText =
            await submitError.text();

          if (responseText) {
            console.error(
              "Administrator authentication HTTP response:",
              responseText,
            );
          }
        } catch (responseReadError) {
          console.error(
            "Failed to read administrator authentication error response:",
            responseReadError,
          );
        }
      }

      setError(
        getFriendlyAdminLoginError(
          submitError,
        ),
      );

      setSuccess(null);
    } finally {
      setLoading(false);
    }
  };

  /*
   * IMPORTANT:
   *
   * Do NOT wrap this page with AdminLayout.
   *
   * AdminLayout should be used only after the user has
   * successfully authenticated and passed AdminRouteGuard.
   */
  if (checkingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="flex w-full max-w-sm flex-col items-center rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900">
            <Loader2 className="h-7 w-7 animate-spin text-white" />
          </div>

          <h1 className="mt-5 text-lg font-semibold text-slate-900">
            Checking Administrator Session
          </h1>

          <p className="mt-2 text-sm leading-6 text-slate-500">
            Please wait while we verify your
            administrator session.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="flex min-h-screen items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="bg-slate-900 px-6 py-8 text-white sm:px-8">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20">
                  <ShieldCheck className="h-6 w-6" />
                </div>

                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-300">
                    IyanjuPay
                  </p>

                  <h1 className="mt-1 text-xl font-bold">
                    Administrator Portal
                  </h1>
                </div>
              </div>

              <p className="mt-6 text-sm leading-6 text-slate-300">
                Sign in with your administrator
                credentials to access the secure
                management portal.
              </p>
            </div>

            <div className="p-6 sm:p-8">
              {error && (
                <Alert
                  variant="destructive"
                  className="mb-5"
                >
                  <AlertCircle className="h-4 w-4" />

                  <AlertTitle>
                    Administrator Login Failed
                  </AlertTitle>

                  <AlertDescription>
                    {error}
                  </AlertDescription>
                </Alert>
              )}

              {success && (
                <Alert className="mb-5">
                  <ShieldCheck className="h-4 w-4" />

                  <AlertTitle>
                    Authentication Successful
                  </AlertTitle>

                  <AlertDescription>
                    {success}
                  </AlertDescription>
                </Alert>
              )}

              <form
                onSubmit={handleSubmit}
                className="space-y-5"
              >
                <div className="space-y-2">
                  <Label htmlFor="admin-login-email">
                    Administrator Email
                  </Label>

                  <Input
                    id="admin-login-email"
                    type="email"
                    value={email}
                    onChange={(event) => {
                      setEmail(
                        event.target.value,
                      );
                      setError(null);
                      setSuccess(null);
                    }}
                    placeholder="admin@example.com"
                    autoComplete="username"
                    autoFocus
                    disabled={loading}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="admin-login-password">
                    Password
                  </Label>

                  <div className="relative">
                    <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                    <Input
                      id="admin-login-password"
                      type={
                        showPassword
                          ? "text"
                          : "password"
                      }
                      value={password}
                      onChange={(event) => {
                        setPassword(
                          event.target.value,
                        );
                        setError(null);
                        setSuccess(null);
                      }}
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      disabled={loading}
                      required
                      className="pr-11 pl-10"
                    />

                    <button
                      type="button"
                      aria-label={
                        showPassword
                          ? "Hide password"
                          : "Show password"
                      }
                      onClick={() =>
                        setShowPassword(
                          (current) =>
                            !current,
                        )
                      }
                      disabled={loading}
                      className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:pointer-events-none disabled:opacity-50"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="h-11 w-full"
                  disabled={
                    loading ||
                    !email.trim() ||
                    !password
                  }
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Authenticating...
                    </>
                  ) : (
                    <>
                      <LogIn className="mr-2 h-4 w-4" />
                      Sign In to Admin Portal
                    </>
                  )}
                </Button>
              </form>

              <div className="mt-6 border-t border-slate-100 pt-5">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />

                  <p className="text-xs leading-5 text-slate-500">
                    This portal is restricted to
                    authorized IyanjuPay administrators.
                    Regular user accounts cannot access
                    administrator functionality.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <p className="mt-5 text-center text-xs text-slate-400">
            IyanjuPay Administrator Access
          </p>
        </div>
      </div>
    </div>
  );
};

export default AdminLoginPage;
