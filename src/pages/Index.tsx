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

  const [checkingOnboarding, setCheckingOnboarding] =
    useState(true);

  /*
   * ============================================================
   * SILENT ONBOARDING CHECK
   * ============================================================
   *
   * The check happens in the background.
   *
   * We DO NOT display:
   *
   * "Checking your account setup..."
   *
   * to an already authenticated user.
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
     * Only perform this check on "/" and "/signup".
     *
     * Dedicated onboarding pages handle themselves.
     */

    if (
      location.pathname !== "/" &&
      location.pathname !== "/signup"
    ) {
      setCheckingOnboarding(false);
      return;
    }

    let cancelled = false;

    const checkOnboarding = async () => {
      try {
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

        /*
         * If the database request fails, don't redirect.
         */
        if (error) {
          console.error(
            "Onboarding profile check failed:",
            error,
          );

          return;
        }

        /*
         * ======================================================
         * NO PROFILE
         * ======================================================
         */

        if (!profile) {
          navigate("/onboarding", {
            replace: true,
          });

          return;
        }

        /*
         * ======================================================
         * PROFILE COMPLETENESS
         * ======================================================
         *
         * Nickname is intentionally OPTIONAL.
         * ======================================================
         */

        const fullName =
          String(
            profile.full_name ?? "",
          ).trim();

        const phoneNumber =
          String(
            profile.phone_number ?? "",
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
          ).replace(/\D/g, "");

        const isProfileComplete =
          fullName.length >= 2 &&
          phoneNumber.length >= 7 &&
          Boolean(gender) &&
          Boolean(dateOfBirth) &&
          address.length >= 5 &&
          nin.length === 11;

        /*
         * ======================================================
         * PERSONAL INFORMATION INCOMPLETE
         * ======================================================
         */

        if (!isProfileComplete) {
          navigate("/onboarding", {
            replace: true,
          });

          return;
        }

        /*
         * ======================================================
         * BVN / KYC STATUS
         * ======================================================
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
          kycStatus === "verified";

        /*
         * ======================================================
         * BVN NOT COMPLETED
         * ======================================================
         */

        if (!isBvnComplete) {
          navigate("/onboarding/bvn", {
            replace: true,
          });

          return;
        }

        /*
         * ======================================================
         * FULLY ONBOARDED
         * ======================================================
         *
         * Stay on "/".
         *
         * Index will render Dashboard.
         *
         * No additional page.
         *
         * No checking screen.
         *
         * ======================================================
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
         * Don't force the user into onboarding
         * because of a temporary error.
         */
      } finally {
        if (!cancelled) {
          setCheckingOnboarding(false);
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
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-600" />
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
   * SILENT PROFILE CHECK
   * ============================================================
   *
   * Do NOT show:
   *
   * "Checking your account setup..."
   *
   * Instead, keep the application visually neutral while
   * the very short database check completes.
   * ============================================================
   */

  if (checkingOnboarding) {
    return null;
  }

  /*
   * ============================================================
   * FULLY ONBOARDED USER
   * ============================================================
   */

  return <Dashboard />;
};

export default Index;
