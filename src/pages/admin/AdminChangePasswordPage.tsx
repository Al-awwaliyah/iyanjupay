import React, {
FormEvent,
useEffect,
useMemo,
useState,
} from "react";

import {
AlertCircle,
CheckCircle2,
Eye,
EyeOff,
KeyRound,
Loader2,
LockKeyhole,
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

type AdminState = {
is_admin?: boolean;
is_active?: boolean;
role?: AdminRole | string | null;
display_name?: string | null;
must_change_password?: boolean;
};

function extractError(error: unknown): string {
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
details?: string;
hint?: string;
};


return (
  value.message ??
  value.error_description ??
  value.details ??
  value.hint ??
  "An unexpected error occurred."
);


}

return "An unexpected error occurred.";
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

function validatePassword(password: string) {
const errors: string[] = [];

if (password.length < 8) {
errors.push("at least 8 characters");
}

if (!/[A-Z]/.test(password)) {
errors.push("one uppercase letter");
}

if (!/[a-z]/.test(password)) {
errors.push("one lowercase letter");
}

if (!/[0-9]/.test(password)) {
errors.push("one number");
}

return errors;
}

const AdminChangePasswordPage: React.FC = () => {
const navigate = useNavigate();

const [currentPassword, setCurrentPassword] =
useState("");

const [newPassword, setNewPassword] =
useState("");

const [confirmPassword, setConfirmPassword] =
useState("");

const [showCurrentPassword, setShowCurrentPassword] =
useState(false);

const [showNewPassword, setShowNewPassword] =
useState(false);

const [showConfirmPassword, setShowConfirmPassword] =
useState(false);

const [adminState, setAdminState] =
useState<AdminState | null>(null);

const [loading, setLoading] = useState(true);
const [submitting, setSubmitting] =
useState(false);

const [error, setError] =
useState<string | null>(null);

const [success, setSuccess] =
useState<string | null>(null);

const passwordErrors = useMemo(
() => validatePassword(newPassword),
[newPassword],
);

const passwordsMatch =
newPassword.length > 0 &&
confirmPassword.length > 0 &&
newPassword === confirmPassword;

const passwordIsValid =
newPassword.length > 0 &&
passwordErrors.length === 0;

const canSubmit =
!submitting &&
!loading &&
currentPassword.length > 0 &&
passwordIsValid &&
passwordsMatch;

useEffect(() => {
let mounted = true;


const loadAdminState = async () => {
  try {
    setLoading(true);
    setError(null);

    const {
      data: {
        session,
      },
    } = await supabase.auth.getSession();

    if (!mounted) {
      return;
    }

    if (!session) {
      navigate("/admin/login", {
        replace: true,
      });

      return;
    }

    const {
      data,
      error: stateError,
    } = await supabase.rpc(
      "admin_auth_get_state",
    );

    if (stateError) {
      throw stateError;
    }

    if (
      !data ||
      typeof data !== "object"
    ) {
      throw new Error(
        "Unable to verify administrator account.",
      );
    }

    const state =
      data as AdminState;

    if (
      state.is_admin !== true ||
      state.is_active !== true
    ) {
      await supabase.auth.signOut();

      navigate("/admin/login", {
        replace: true,
      });

      return;
    }

    if (
      state.must_change_password !== true
    ) {
      navigate("/admin/dashboard", {
        replace: true,
      });

      return;
    }

    if (mounted) {
      setAdminState(state);
    }
  } catch (loadError) {
    console.error(
      "Failed to load administrator password-change state:",
      loadError,
    );

    if (mounted) {
      setError(
        extractError(loadError),
      );
    }
  } finally {
    if (mounted) {
      setLoading(false);
    }
  }
};

void loadAdminState();

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

if (!currentPassword) {
  setError(
    "Enter your temporary password.",
  );
  return;
}

if (!newPassword) {
  setError(
    "Enter your new password.",
  );
  return;
}

if (passwordErrors.length > 0) {
  setError(
    `Password must contain ${passwordErrors.join(
      ", ",
    )}.`,
  );
  return;
}

if (newPassword === currentPassword) {
  setError(
    "Your new password must be different from your temporary password.",
  );
  return;
}

if (newPassword !== confirmPassword) {
  setError(
    "The new passwords do not match.",
  );
  return;
}

try {
  setSubmitting(true);

  /*
   * Verify the temporary/current password before
   * allowing the password-change operation.
   *
   * We deliberately use the authenticated user's
   * email from the Supabase session rather than
   * trusting an email supplied by the browser.
   */
  const {
    data: {
      user,
    },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    throw new Error(
      "Unable to determine the administrator email address.",
    );
  }

  /*
   * Re-authenticate with the current password.
   *
   * This protects the password-change operation if
   * an administrator's existing browser session has
   * been left open.
   */
  const {
    error: verificationError,
  } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });

  if (verificationError) {
    throw new Error(
      "The current temporary password is incorrect.",
    );
  }

  /*
   * Change the authenticated Supabase user's password.
   */
  const {
    error: passwordError,
  } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (passwordError) {
    throw passwordError;
  }

  /*
   * Only clear must_change_password AFTER the
   * Supabase password update succeeds.
   */
  const {
    data: clearData,
    error: clearError,
  } = await supabase.rpc(
    "admin_auth_complete_password_change",
  );

  if (clearError) {
    throw clearError;
  }

  if (
    !clearData ||
    typeof clearData !== "object"
  ) {
    throw new Error(
      "Password was changed, but administrator account state could not be updated.",
    );
  }

  const result =
    clearData as Record<
      string,
      unknown
    >;

  if (
    result.success !== true
  ) {
    throw new Error(
      typeof result.message === "string"
        ? result.message
        : "Administrator password-change completion failed.",
    );
  }

  setCurrentPassword("");
  setNewPassword("");
  setConfirmPassword("");

  setSuccess(
    "Your password has been changed successfully. Redirecting to the administrator dashboard...",
  );

  window.setTimeout(() => {
    navigate("/admin/dashboard", {
      replace: true,
    });
  }, 900);
} catch (submitError) {
  console.error(
    "Failed to change administrator password:",
    submitError,
  );

  setError(
    extractError(submitError),
  );
} finally {
  setSubmitting(false);
}


};

if (loading) {
return ( <AdminLayout> <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-slate-50 px-4"> <div className="flex flex-col items-center text-center"> <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900"> <Loader2 className="h-7 w-7 animate-spin text-white" /> </div>


        <p className="mt-4 text-sm font-medium text-slate-700">
          Verifying administrator account...
        </p>
      </div>
    </div>
  </AdminLayout>
);


}

return ( <AdminLayout> <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-slate-50 px-4 py-10"> <div className="w-full max-w-lg"> <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"> <div className="bg-slate-900 px-6 py-8 text-white sm:px-8"> <div className="flex items-center gap-3"> <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20"> <KeyRound className="h-6 w-6" /> </div>


            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-300">
                IyanjuPay
              </p>

              <h1 className="mt-1 text-xl font-bold">
                Change Your Password
              </h1>
            </div>
          </div>

          <p className="mt-6 text-sm leading-6 text-slate-300">
            Your administrator account is using
            a temporary password. You must create
            a new password before accessing the
            administrator dashboard.
          </p>
        </div>

        <div className="p-6 sm:p-8">
          {adminState && (
            <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm">
                  <ShieldCheck className="h-5 w-5 text-slate-700" />
                </div>

                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">
                    Administrator Account
                  </p>

                  <p className="text-xs text-slate-500">
                    {getRoleLabel(
                      adminState.role,
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}

          {error && (
            <Alert
              variant="destructive"
              className="mb-5"
            >
              <AlertCircle className="h-4 w-4" />

              <AlertTitle>
                Password Change Failed
              </AlertTitle>

              <AlertDescription>
                {error}
              </AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert className="mb-5">
              <CheckCircle2 className="h-4 w-4" />

              <AlertTitle>
                Password Changed
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
              <Label htmlFor="current-admin-password">
                Temporary Password
              </Label>

              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                <Input
                  id="current-admin-password"
                  type={
                    showCurrentPassword
                      ? "text"
                      : "password"
                  }
                  value={currentPassword}
                  onChange={(event) => {
                    setCurrentPassword(
                      event.target.value,
                    );
                    setError(null);
                    setSuccess(null);
                  }}
                  placeholder="Enter your temporary password"
                  autoComplete="current-password"
                  disabled={submitting}
                  className="pr-11 pl-10"
                  required
                />

                <button
                  type="button"
                  aria-label={
                    showCurrentPassword
                      ? "Hide temporary password"
                      : "Show temporary password"
                  }
                  onClick={() =>
                    setShowCurrentPassword(
                      (current) =>
                        !current,
                    )
                  }
                  disabled={submitting}
                  className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:pointer-events-none disabled:opacity-50"
                >
                  {showCurrentPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>

              <p className="text-xs text-slate-500">
                Enter the temporary password
                provided when your administrator
                account was created.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-admin-password">
                New Password
              </Label>

              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                <Input
                  id="new-admin-password"
                  type={
                    showNewPassword
                      ? "text"
                      : "password"
                  }
                  value={newPassword}
                  onChange={(event) => {
                    setNewPassword(
                      event.target.value,
                    );
                    setError(null);
                    setSuccess(null);
                  }}
                  placeholder="Create a new password"
                  autoComplete="new-password"
                  disabled={submitting}
                  className="pr-11 pl-10"
                  required
                />

                <button
                  type="button"
                  aria-label={
                    showNewPassword
                      ? "Hide new password"
                      : "Show new password"
                  }
                  onClick={() =>
                    setShowNewPassword(
                      (current) =>
                        !current,
                    )
                  }
                  disabled={submitting}
                  className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:pointer-events-none disabled:opacity-50"
                >
                  {showNewPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>

              <div className="rounded-lg bg-slate-50 p-3 text-xs">
                <p className="font-medium text-slate-700">
                  Password requirements
                </p>

                <ul className="mt-2 space-y-1 text-slate-500">
                  <li
                    className={
                      newPassword.length >=
                      8
                        ? "text-emerald-600"
                        : ""
                    }
                  >
                    • At least 8 characters
                  </li>

                  <li
                    className={
                      /[A-Z]/.test(
                        newPassword,
                      )
                        ? "text-emerald-600"
                        : ""
                    }
                  >
                    • One uppercase letter
                  </li>

                  <li
                    className={
                      /[a-z]/.test(
                        newPassword,
                      )
                        ? "text-emerald-600"
                        : ""
                    }
                  >
                    • One lowercase letter
                  </li>

                  <li
                    className={
                      /[0-9]/.test(
                        newPassword,
                      )
                        ? "text-emerald-600"
                        : ""
                    }
                  >
                    • One number
                  </li>
                </ul>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-admin-password">
                Confirm New Password
              </Label>

              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                <Input
                  id="confirm-admin-password"
                  type={
                    showConfirmPassword
                      ? "text"
                      : "password"
                  }
                  value={confirmPassword}
                  onChange={(event) => {
                    setConfirmPassword(
                      event.target.value,
                    );
                    setError(null);
                    setSuccess(null);
                  }}
                  placeholder="Confirm your new password"
                  autoComplete="new-password"
                  disabled={submitting}
                  className="pr-11 pl-10"
                  required
                />

                <button
                  type="button"
                  aria-label={
                    showConfirmPassword
                      ? "Hide confirmation password"
                      : "Show confirmation password"
                  }
                  onClick={() =>
                    setShowConfirmPassword(
                      (current) =>
                        !current,
                    )
                  }
                  disabled={submitting}
                  className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:pointer-events-none disabled:opacity-50"
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>

              {confirmPassword.length > 0 && (
                <p
                  className={`text-xs ${
                    passwordsMatch
                      ? "text-emerald-600"
                      : "text-red-600"
                  }`}
                >
                  {passwordsMatch
                    ? "Passwords match."
                    : "Passwords do not match."}
                </p>
              )}
            </div>

            <Alert>
              <ShieldCheck className="h-4 w-4" />

              <AlertTitle>
                Secure administrator access
              </AlertTitle>

              <AlertDescription>
                After your password is changed,
                the temporary-password requirement
                will be removed and you will be
                redirected to the administrator
                dashboard.
              </AlertDescription>
            </Alert>

            <Button
              type="submit"
              className="h-11 w-full"
              disabled={!canSubmit}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Changing Password...
                </>
              ) : (
                <>
                  <KeyRound className="mr-2 h-4 w-4" />
                  Change Password & Continue
                </>
              )}
            </Button>
          </form>
        </div>
      </div>

      <p className="mt-5 text-center text-xs text-slate-400">
        IyanjuPay Administrator Portal
      </p>
    </div>
  </div>
</AdminLayout>


);
};

export default AdminChangePasswordPage;
