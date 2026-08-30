import React, {
ReactNode,
useCallback,
useEffect,
useState,
} from "react";

import {
AlertCircle,
Loader2,
ShieldAlert,
} from "lucide-react";

import {
Navigate,
useLocation,
} from "react-router-dom";

import {
supabase,
} from "@/integrations/supabase/client";

type AdminRole =
| "super_admin"
| "operations_admin"
| "support_admin"
| "finance_admin"
| "compliance_admin"
| "read_only_admin";

type AdminState = {
is_admin: boolean;
user_id?: string | null;
role?: AdminRole | string | null;
is_active: boolean;
must_change_password: boolean;
display_name?: string | null;
notes?: string | null;
};

type AdminRouteGuardProps = {
children: ReactNode;
};

type GuardStatus =
| "checking"
| "authenticated"
| "unauthenticated"
| "inactive"
| "password_change_required"
| "error";

function normalizeAdminState(
value: unknown,
): AdminState | null {
if (!value || typeof value !== "object") {
return null;
}

const state =
value as Record<string, unknown>;

return {
is_admin:
state.is_admin === true,


user_id:
  typeof state.user_id === "string"
    ? state.user_id
    : null,

role:
  typeof state.role === "string"
    ? state.role
    : null,

is_active:
  state.is_active === true,

must_change_password:
  state.must_change_password === true,

display_name:
  typeof state.display_name === "string"
    ? state.display_name
    : null,

notes:
  typeof state.notes === "string"
    ? state.notes
    : null,


};
}

function getErrorMessage(
error: unknown,
): string {
if (!error) {
return "Unable to verify administrator access.";
}

if (typeof error === "string") {
return error;
}

if (typeof error === "object") {
const value =
error as {
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
  "Unable to verify administrator access."
);


}

return "Unable to verify administrator access.";
}

const AdminRouteGuard: React.FC<
AdminRouteGuardProps

> = ({
> children,
> }) => {
> const location = useLocation();

const [status, setStatus] =
useState<GuardStatus>("checking");

const [adminState, setAdminState] =
useState<AdminState | null>(null);

const [errorMessage, setErrorMessage] =
useState<string | null>(null);

const [checkingSession, setCheckingSession] =
useState(false);

const verifyAdminAccess =
useCallback(async () => {
try {
setCheckingSession(true);
setStatus("checking");
setErrorMessage(null);


    /*
     * First verify that a Supabase session exists.
     */
    const {
      data: {
        session,
      },
    } =
      await supabase.auth.getSession();

    if (!session) {
      setAdminState(null);
      setStatus("unauthenticated");
      return;
    }

    /*
     * Confirm that the session still represents
     * a valid authenticated user.
     */
    const {
      data: {
        user,
      },
      error: userError,
    } =
      await supabase.auth.getUser();

    if (userError || !user) {
      console.error(
        "Unable to verify authenticated user:",
        userError,
      );

      try {
        await supabase.auth.signOut();
      } catch (signOutError) {
        console.error(
          "Failed to clear invalid session:",
          signOutError,
        );
      }

      setAdminState(null);
      setStatus("unauthenticated");
      return;
    }

    /*
     * A Supabase session alone does NOT grant
     * administrator access.
     *
     * admin_auth_get_state() is the authoritative
     * database-side administrator access check.
     */
    const {
      data,
      error: stateError,
    } =
      await supabase.rpc(
        "admin_auth_get_state",
      );

    if (stateError) {
      console.error(
        "Administrator state verification failed:",
        stateError,
      );

      setAdminState(null);
      setErrorMessage(
        getErrorMessage(
          stateError,
        ),
      );
      setStatus("error");
      return;
    }

    const state =
      normalizeAdminState(data);

    if (!state) {
      setAdminState(null);
      setErrorMessage(
        "The administrator account state could not be verified.",
      );
      setStatus("error");
      return;
    }

    /*
     * Prevent ordinary IyanjuPay users from
     * accessing the administrator portal.
     */
    if (!state.is_admin) {
      setAdminState(state);
      setStatus("unauthenticated");
      return;
    }

    /*
     * Administrator accounts must be active.
     */
    if (!state.is_active) {
      setAdminState(state);
      setStatus("inactive");
      return;
    }

    /*
     * Temporary-password administrators must
     * complete the password-change process.
     */
    if (state.must_change_password) {
      setAdminState(state);
      setStatus(
        "password_change_required",
      );
      return;
    }

    /*
     * Administrator is fully authenticated,
     * registered, active, and cleared for access.
     */
    setAdminState(state);
    setStatus("authenticated");
  } catch (verificationError) {
    console.error(
      "Unexpected administrator access verification error:",
      verificationError,
    );

    setAdminState(null);
    setErrorMessage(
      getErrorMessage(
        verificationError,
      ),
    );
    setStatus("error");
  } finally {
    setCheckingSession(false);
  }
}, []);


/*

* Initial administrator verification.
  */
  useEffect(() => {
  let mounted = true;


const runVerification =



  async () => {
    if (!mounted) {
      return;
    }

    await verifyAdminAccess();
  };

void runVerification();

return () => {
  mounted = false;
};


}, [
verifyAdminAccess,
]);

/*

* Keep administrator access synchronized
* with Supabase authentication changes.
  */
  useEffect(() => {
  const {
  data: {
  subscription,
  },
  } =
  supabase.auth.onAuthStateChange(
  (
  event,
  session,
  ) => {
  /*
  * If the session disappears, immediately
  * remove administrator access.
  */
  if (
  event === "SIGNED_OUT" ||
  !session
  ) {
  setAdminState(null);
  setStatus("unauthenticated");
  setErrorMessage(null);
  return;
  }

  
   /*
    * Re-check administrator membership after
    * authentication/session changes.
    */
   if (
     event === "SIGNED_IN" ||
     event === "TOKEN_REFRESHED" ||
     event === "USER_UPDATED" ||
     event === "INITIAL_SESSION"
   ) {
     window.setTimeout(() => {
       void verifyAdminAccess();
     }, 0);
   }
  

  },
  );

return () => {



  subscription.unsubscribe();
};


}, [
verifyAdminAccess,
]);

/*

* Loading state while administrator access
* is being verified.
  */
  if (
  status === "checking" ||
  checkingSession
  ) {
  return (

   <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
     <div className="flex w-full max-w-sm flex-col items-center rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
       <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900">
         <Loader2 className="h-7 w-7 animate-spin text-white" />
       </div>

   <h1 className="mt-5 text-lg font-semibold text-slate-900">
     Verifying Administrator Access
   </h1>

   <p className="mt-2 text-sm leading-6 text-slate-500">
     Please wait while we securely verify
     your administrator account.
   </p>
  

     </div>
   </div>


);


}

/*

* No authenticated Supabase session or the
* authenticated user is not an administrator.
  */
  if (
  status === "unauthenticated"
  ) {
  return (
  <Navigate
  to="/admin/login"
  replace
  state={{
  from:
  `${location.pathname}${location.search}${location.hash}`,
  }}
  />
  );
  }

/*

* Administrator exists but is inactive.
  */
  if (
  status === "inactive"
  ) {
  return (

   <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
     <div className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-8 text-center shadow-sm">
       <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50">
         <ShieldAlert className="h-7 w-7 text-red-600" />
       </div>

  
   <h1 className="mt-5 text-xl font-bold text-slate-900">
     Administrator Access Disabled
   </h1>

   <p className="mt-3 text-sm leading-6 text-slate-600">
     Your administrator account is currently
     inactive. You cannot access the IyanjuPay
     administrator portal until your account is
     reactivated.
   </p>

   <button
     type="button"
     className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-slate-900 px-5 text-sm font-medium text-white transition-colors hover:bg-slate-800"
     onClick={async () => {
       try {
         await supabase.auth.signOut();
       } finally {
         window.location.replace(
           "/admin/login",
         );
       }
     }}
   >
     Return to Admin Login
   </button>
  

     </div>
   </div>


);


}

/*

* Administrator is active but still needs to
* change the temporary password.
*
* The password-change page itself is allowed so
* the administrator can complete the requirement.
  */
  if (
  status ===
  "password_change_required"
  ) {
  if (
  location.pathname ===
  "/admin/change-password"
  ) {
  return (
  <>
  {children}
  </>
  );
  }


return (



  <Navigate
    to="/admin/change-password"
    replace
    state={{
      from:
        `${location.pathname}${location.search}${location.hash}`,
    }}
  />
);


}

/*

* Verification failed.
*
* Fail closed: never render protected
* administrator content when access cannot
* be securely verified.
  */
  if (
  status === "error"
  ) {
  return (

   <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
     <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
       <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50">
         <AlertCircle className="h-7 w-7 text-amber-600" />
       </div>

  
   <h1 className="mt-5 text-xl font-bold text-slate-900">
     Unable to Verify Access
   </h1>

   <p className="mt-3 text-sm leading-6 text-slate-600">
     We could not securely verify your
     administrator privileges. For your
     protection, administrator functionality
     has been blocked.
   </p>

   {errorMessage && (
     <div className="mt-4 rounded-lg bg-slate-50 p-3 text-left text-xs text-slate-500">
       {errorMessage}
     </div>
   )}

   <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
     <button
       type="button"
       className="inline-flex h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
       onClick={() => {
         void verifyAdminAccess();
       }}
     >
       Try Again
     </button>

     <button
       type="button"
       className="inline-flex h-10 items-center justify-center rounded-md bg-slate-900 px-5 text-sm font-medium text-white transition-colors hover:bg-slate-800"
       onClick={async () => {
         try {
           await supabase.auth.signOut();
         } finally {
           window.location.replace(
             "/admin/login",
           );
         }
       }}
     >
       Return to Admin Login
     </button>
   </div>
  

     </div>
   </div>

);

}

/*

* Final security check.
*
* Protected children are rendered ONLY when:
*
* 1. The user is authenticated.
* 2. The user is a registered administrator.
* 3. The administrator is active.
* 4. The temporary password requirement is complete.
     */
     if (
     status !== "authenticated" ||
     !adminState?.is_admin ||
     !adminState.is_active ||
     adminState.must_change_password
     ) {
     return (
     <Navigate
     to="/admin/login"
     replace
     state={{
     from:
     `${location.pathname}${location.search}${location.hash}`,
     }}
     />
     );
     }

return (
<>
{children}
</>
);
};

export default AdminRouteGuard;
