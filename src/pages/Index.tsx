import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

import AuthForm from "@/components/auth/AuthForm";
import Dashboard from "@/components/Dashboard";
import AppLockGuard from "@/components/security/AppLockGuard";

const Index = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);
  const [onboardingComplete, setOnboardingComplete] = useState(false);

  useEffect(() => {
    let mounted = true;

    const checkOnboarding = async () => {
      if (authLoading) return;

      if (!user) {
        if (mounted) {
          setCheckingOnboarding(false);
          setOnboardingComplete(false);
        }
        return;
      }

      setCheckingOnboarding(true);

      try {
        const { data: profile, error } = await supabase
          .from("profiles")
          .select(
            "full_name, phone_number, gender, date_of_birth, address, nin, bvn_verified",
          )
          .eq("id", user.id)
          .maybeSingle();

        if (error) throw error;
        if (!mounted) return;

        const profileComplete = Boolean(profile) &&
          String(profile?.full_name ?? "").trim().length >= 2 &&
          String(profile?.phone_number ?? "").trim().length >= 7 &&
          Boolean(profile?.gender) &&
          Boolean(profile?.date_of_birth) &&
          String(profile?.address ?? "").trim().length >= 5 &&
          String(profile?.nin ?? "").replace(/\D/g, "").length === 11;

        if (!profileComplete) {
          setOnboardingComplete(false);
          navigate("/onboarding", { replace: true });
          return;
        }

        if (profile?.bvn_verified !== true) {
          setOnboardingComplete(false);
          navigate("/onboarding/bvn", { replace: true });
          return;
        }

        setOnboardingComplete(true);
      } catch (error) {
        console.error("Unable to verify onboarding completion:", error);
        if (!mounted) return;
        setOnboardingComplete(false);
        // Fail closed: users must not reach the dashboard when the
        // onboarding status cannot be confirmed.
        navigate("/onboarding", { replace: true });
      } finally {
        if (mounted) setCheckingOnboarding(false);
      }
    };

    void checkOnboarding();

    return () => {
      mounted = false;
    };
  }, [authLoading, user, navigate]);

  if (authLoading || (user && (checkingOnboarding || !onboardingComplete))) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#082A63] mx-auto" />
          <p className="mt-4 text-muted-foreground">Checking your account...</p>
        </div>
      </div>
    );
  }

  if (!user) return <AuthForm />;

  return (
    <AppLockGuard>
      <Dashboard />
    </AppLockGuard>
  );
};

export default Index;
