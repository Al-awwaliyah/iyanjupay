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

import AdminLayout from "@/pages/admin/AdminLayout";
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

function extractError(error: unknown): string {
  if (!error) {
    return "Unable to sign in.";
  }

  if (typeof error === "string") {
    return error;
  }

  if (typeof error === "object") {
    const value = error as {
      message?: string;
      error_description?: string;
      details?: string;
    };

    return (
      value.message ??
      value.error_description ??
      value.details ??
      "Unable to sign in."
    );
  }

  return "Unable to sign in.";
}

function getRoleLabel(
  role: AdminRole | string | null | undefined,
) {
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

const AdminLoginPage: React.FC = () => {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [showPassword, setShowPassword] =
    useState(false);

  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] =
    useState(true);

  const [error, setError] = useState<string | null>(
    null,
  );

  const [success, setSuccess] = useState<string | null>(
    null,
  );

  /*
   * If an administrator already has a valid session,
   * do not unnecessarily display the login form.
   *
   * We verify the session against the admin state RPC
   * instead of trusting the existence of a Supabase
   * session alone.
   */
  useEffect(() => {
    let mounted = true;

    const checkExistingAdminSession =
      async () => {
        try {
          const {
            data: { session },
          } = await supabase.auth.getSession();

          if (!mounted) {
            return;
          }

          if (!session) {
            setCheckingSession(false);
            return;
          }

          const {
            data,
            error: stateError,
          } = await supabase.rpc(
            "admin_auth_get_state",
          );

          if (stateError) {
            await supabase.auth.signOut();

            if (mounted) {
              setCheckingSession(false);
            }

            return;
          }

          if (
            !data ||
            typeof data !== "object"
          ) {
            await supabase.auth.signOut();

            if (mounted) {
              setCheckingSession(false);
            }

            return;
          }

          const state =
            data as Record<string, unknown>;

          if (
            state.is_admin !== true ||
            state.is_active !== true
          ) {
            await supabase.auth.signOut();

            if (mounted) {
              setCheckingSession(false);
            }

            return;
          }

          if (!mounted) {
            return;
          }

          if (
            state.must_change_password === true
          ) {
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
            "Failed to check existing admin session:",
            existingSessionError,
          );

          if (mounted) {
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

    setError(null);
    setSuccess(null);

    const normalizedEmail =
      email.trim().toLowerCase();

    if (!normalizedEmail) {
      setError("Email address is required.");
      return;
    }

    if (!password) {
      setError("Password is required.");
      return;
    }

    try {
      setLoading(true);

      /*
       * IMPORTANT:
       *
       * Admin authentication goes through the dedicated
       * admin-login Edge Function.
       *
       * This keeps the administrator portal separate
       * from the normal user authentication flow.
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

      if (!response.success) {
        throw new Error(
          response.error ??
            response.message ??
            "Invalid administrator credentials.",
        );
      }

      /*
       * Make sure the Edge Function actually returned
       * a usable session.
       */
      const accessToken =
        response.session?.access_token;

      const refreshToken =
        response.session?.refresh_token;

      if (!accessToken || !refreshToken) {
        throw new Error(
          "Administrator authentication succeeded, but no valid session was returned.",
        );
      }

      /*
       * Store the authenticated Supabase session in the
       * browser so all subsequent admin RPC calls are
       * authenticated as this administrator.
       */
      const {
        error: sessionError,
      } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (sessionError) {
        throw sessionError;
      }

      /*
       * Validate the returned admin state before redirecting.
       */
      const admin =
        response.admin;

      if (!admin) {
        await supabase.auth.signOut();

        throw new Error(
          "Administrator information was not returned.",
        );
      }

      if (admin.is_active !== true) {
        await supabase.auth.signOut();

        throw new Error(
          "This administrator account is inactive.",
        );
      }

      const role =
        admin.role ?? null;

      const mustChangePassword =
        admin.must_change_password === true;

      /*
       * First-time administrators created by the
       * Super Admin receive a temporary password such as:
       *
       * Lastname@123
       *
       * They must change that password before entering
       * the administrator dashboard.
       */
      if (mustChangePassword) {
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
        }, 500);

        return;
      }

      setSuccess(
        `Welcome back. Signing you in as ${getRoleLabel(
          role,
        )}...`,
      );

      window.setTimeout(() => {
        navigate(
          "/admin/dashboard",
          {
            replace: true,
          },
        );
      }, 500);
    } catch (submitError) {
      console.error(
        "Administrator login failed:",
        submitError,
      );

      /*
       * Always clear any partially-created session
       * when the administrator verification fails.
       */
      try {
        await supabase.auth.signOut();
      } catch (signOutError) {
        console.error(
          "Failed to clear failed admin session:",
          signOutError,
        );
      }

      setError(
        extractError(submitError),
      );
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <AdminLayout>
        <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-slate-50 px-4">
          <div className="flex flex-col items-center text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900">
              <Loader2 className="h-7 w-7 animate-spin text-white" />
            </div>

            <p className="mt-4 text-sm font-medium text-slate-700">
              Checking administrator session...
            </p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-slate-50 px-4 py-10">
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
    </AdminLayout>
  );
};

export default AdminLoginPage;
