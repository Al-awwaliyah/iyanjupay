import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

type Props = { children: React.ReactNode };

const OnboardingAccessGuard = ({ children }: Props) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [checking, setChecking] = useState(true);
  const [checkError, setCheckError] = useState(false);

  useEffect(() => {
    let active = true;

    const checkOnboarding = async () => {
      setChecking(true);
      setCheckError(false);

      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!user) {
          if (active) setChecking(false);
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("full_name, phone_number, gender, date_of_birth, address, bvn_verified")
          .eq("id", user.id)
          .maybeSingle();
        if (profileError) throw profileError;

        const personalComplete = Boolean(profile) &&
          String(profile?.full_name ?? "").trim().length >= 2 &&
          String(profile?.phone_number ?? "").trim().length >= 7 &&
          Boolean(profile?.gender) &&
          Boolean(profile?.date_of_birth) &&
          String(profile?.address ?? "").trim().length >= 5;

        if (!active) return;
        if (!personalComplete) {
          navigate("/onboarding", { replace: true, state: { from: location.pathname } });
          return;
        }
        if (profile?.bvn_verified !== true) {
          navigate("/onboarding/bvn", { replace: true, state: { from: location.pathname } });
          return;
        }
        setChecking(false);
      } catch (error) {
        console.error("Onboarding access check failed:", error);
        if (active) {
          setCheckError(true);
          setChecking(false);
        }
      }
    };

    void checkOnboarding();
    return () => { active = false; };
  }, [navigate, location.pathname]);

  if (checking) {
    return <div className="min-h-screen flex items-center justify-center bg-background text-foreground">Checking your onboarding status…</div>;
  }

  if (checkError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background px-6 text-center text-foreground">
        <p>We couldn’t verify your onboarding status, so dashboard access is temporarily blocked.</p>
        <button className="rounded-md border px-4 py-2" onClick={() => window.location.reload()}>Try again</button>
      </div>
    );
  }

  return <>{children}</>;
};

export default OnboardingAccessGuard;
