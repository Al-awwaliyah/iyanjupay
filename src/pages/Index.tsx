import React, {
  useEffect,
  useState,
} from "react";

import {
  useLocation,
  useNavigate,
} from "react-router-dom";

import { useAuth } from "@/hooks/useAuth";
import AuthForm from "@/components/auth/AuthForm";
import Dashboard from "@/components/Dashboard";

import { supabase } from "@/integrations/supabase/client";

const Index = () => {
  const {
    user,
    loading: authLoading,
  } = useAuth();

  const navigate = useNavigate();
  const location = useLocation();

  const [
    checkingOnboarding,
    setCheckingOnboarding,
  ] = useState(false);

  /*
   * ============================================================
   * ONBOARDING CHECK
   * ============================================================
   *
   * This is only performed on the main "/" route.
   *
   * The dedicated onboarding pages handle their own
   * authentication and state checks.
   *
   * Flow:
   *
   * Authenticated
   *      ↓
   * Profile complete?
   *      ↓
   * BVN verified?
   *      ↓
   * Dashboard
   *
   * ============================================================
   */

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!user) {
      setCheckingOnboarding(false);
      return;
    }

    /*
     * Only perform the central onboarding gate
     * on the main application route.
     *
     * This prevents accidental redirects while
     * the user is already inside onboarding pages.
     */

    if (
      location.pathname !== "/" &&
      location.pathname !== "/signup"
    ) {
      setCheckingOnboarding(false);
      return;
    }

    let cancelled = false;

    const checkOnboarding =
      async () => {
        setCheckingOnboarding(true);

        try {
          /*
           * ======================================================
           * LOAD PROFILE
           * ======================================================
           */

          const {
            data: profile,
            error,
          } = await supabase
            .from("profiles")
            .select(
              `
                id,
                full_name,
                phone_number,
                nickname,
                gender,
                date_of_birth,
                address,
                nin,
                bvn_verified,
                kyc_level,
                kyc_status
              `,
            )
            .eq("id", user.id)
            .maybeSingle();

          if (cancelled) {
            return;
          }

          if (error) {
            console.error(
              "Onboarding profile check failed:",
              error,
            );

            /*
             * Do not automatically send the user into
             * onboarding when the database request itself
             * failed.
             *
             * Otherwise a temporary database/RLS/network
             * problem could incorrectly make a completed
             * account appear incomplete.
             */

            return;
          }

          /*
           * ======================================================
           * PROFILE DOES NOT EXIST
           * ======================================================
           */

          if (!profile) {
            navigate(
              "/onboarding",
              {
                replace: true,
              },
            );

            return;
          }

          /*
           * ======================================================
           * PROFILE COMPLETENESS
           * ======================================================
           *
           * These requirements intentionally match
           * OnboardingPage.tsx.
           */

          const fullName =
            String(
              profile.full_name ?? "",
            ).trim();

          const phoneNumber =
            String(
              profile.phone_number ?? "",
            ).trim();

          const nickname =
            String(
              profile.nickname ?? "",
            ).trim();

          const gender =
            String(
              profile.gender ?? "",
            ).trim();

          const dateOfBirth =
            String(
              profile.date_of_birth ?? "",
            ).trim();

          const address =
            String(
              profile.address ?? "",
            ).trim();

          const nin =
            String(
              profile.nin ?? "",
            )
              .replace(/\D/g, "");

          const isProfileComplete =
            fullName.length >= 2 &&
            phoneNumber.length >= 7 &&
            nickname.length >= 2 &&
            Boolean(gender) &&
            Boolean(dateOfBirth) &&
            address.length >= 5 &&
            nin.length === 11;

          /*
           * ======================================================
           * PROFILE INCOMPLETE
           * ======================================================
           */

          if (!isProfileComplete) {
            navigate(
              "/onboarding",
              {
                replace: true,
              },
            );

            return;
          }

          /*
           * ======================================================
           * CHECK BVN / KYC
           * ======================================================
           *
           * The authoritative flag currently used by your
           * onboarding BVN flow is bvn_verified.
           *
           * We additionally require KYC Tier 2.
           */

          const bvnVerified =
            Boolean(
              profile.bvn_verified,
            );

          const kycLevel =
            Number(
              profile.kyc_level ?? 0,
            );

          const kycStatus =
            String(
              profile.kyc_status ?? "",
            )
              .trim()
              .toLowerCase();

          const isBvnComplete =
            bvnVerified &&
            kycLevel >= 2 &&
            kycStatus ===
              "verified";

          /*
           * ======================================================
           * BVN NOT COMPLETE
           * ======================================================
           */

          if (!isBvnComplete) {
            navigate(
              "/onboarding/bvn",
              {
                replace: true,
              },
            );

            return;
          }

          /*
           * ======================================================
           * FULLY ONBOARDED
           * ======================================================
           *
           * Nothing to do.
           *
           * Index will render Dashboard below.
           */

        } catch (error) {
          if (cancelled) {
            return;
          }

          console.error(
            "Onboarding gate error:",
            error,
          );

          /*
           * We intentionally do not redirect on an
           * unexpected error.
           *
           * This avoids trapping an existing user in
           * onboarding because of a temporary failure.
           */
        } finally {
          if (!cancelled) {
            setCheckingOnboarding(
              false,
            );
          }
        }
      };

    checkOnboarding();

    return () => {
      cancelled = true;
    };
  }, [
    user,
    authLoading,
    location.pathname,
    navigate,
  ]);

  /*
   * ============================================================
   * AUTH LOADING
   * ============================================================
   */

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-green-600 mx-auto" />

          <p className="mt-4 text-gray-600">
            Loading...
          </p>
        </div>
      </div>
    );
  }

  /*
   * ============================================================
   * NOT AUTHENTICATED
   * ============================================================
   */

  if (!user) {
    return <AuthForm />;
  }

  /*
   * ============================================================
   * ONBOARDING CHECK
   * ============================================================
   */

  if (checkingOnboarding) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-blue-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto" />

          <p className="mt-4 text-gray-600">
            Checking your account setup...
          </p>
        </div>
      </div>
    );
  }

  /*
   * ============================================================
   * FULLY ONBOARDED USER
   * ============================================================
   */

  return <Dashboard />;
};

export default Index;
