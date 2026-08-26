import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";

import React, {
  useEffect,
  useState,
} from "react";

import {
  BrowserRouter,
  Routes,
  Route,
} from "react-router-dom";

import AppSplash from "@/components/AppSplash";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";

import Index from "./pages/Index";
import ForgotPassword from "./pages/ForgotPassword";
import VerifyEmailOtp from "./pages/VerifyEmailOtp";
import OnboardingPage from "@/components/onboarding/OnboardingPage";
import OnboardingBvnPage from "@/components/onboarding/OnboardingBvnPage";
import Dashboard from "@/components/Dashboard";
import PaymentPinPage from "@/components/onboarding/PaymentPinPage";
import VerifyRecoveryOtp from "./pages/VerifyRecoveryOtp";
import VerifyPaymentPinResetOtp from "@/pages/VerifyPaymentPinResetOtp";
import ResetPaymentPin from "@/pages/ResetPaymentPin";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => {
  const [showSplash, setShowSplash] =
    useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setShowSplash(false);
    }, 10_000);

    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  /*
   * ============================================================
   * APP SPLASH SCREEN
   * ============================================================
   */

  if (showSplash) {
    return <AppSplash />;
  }

  /*
   * ============================================================
   * MAIN APPLICATION
   * ============================================================
   */

  return (
    <QueryClientProvider
      client={queryClient}
    >
      <TooltipProvider>
        <Toaster />

        <Sonner />

        <BrowserRouter>
          <Routes>

            {/* ==================================================
                MAIN APPLICATION
            ================================================== */}

            <Route
              path="/"
              element={<Index />}
            />

            {/* ==================================================
                SIGNUP
            ==================================================

            */}

            <Route
              path="/signup"
              element={<Index />}
            />

            <Route
              path="/payment-pin"
              element={<PaymentPinPage />}
            />
            
            <Route
              path="/dashboard"
              element={<Dashboard />}
            />

            {/* ==================================================
                EMAIL VERIFICATION
            ================================================== */}

            <Route
              path="/verify-email-otp"
              element={<VerifyEmailOtp />}
            />

            {/* ==================================================
                PROFILE ONBOARDING
            ==================================================

                New users are sent here after successful
                email verification when their profile is
                incomplete.

                Flow:

                Email verification
                    ↓
                Profile completion
                    ↓
                BVN verification
            */}

            <Route
              path="/onboarding"
              element={<OnboardingPage />}
            />

            <Route
              path="/onboarding/bvn"
              element={<OnboardingBvnPage />}
            />
            {/* ==================================================
                PASSWORD RECOVERY
            ================================================== */}

            <Route
              path="/forgot-password"
              element={<ForgotPassword />}
            />

            <Route
              path="/verify-recovery-otp"
              element={
                <VerifyRecoveryOtp />
              }
            />
            <Route
              path="/verify-payment-pin-reset"
              element={<VerifyPaymentPinResetOtp />}
            />

            <Route
              path="/reset-payment-pin"
              element={<ResetPaymentPin />}
            />

            <Route
              path="/reset-password"
              element={<ResetPassword />}
            />

            {/* ==================================================
                404
            ================================================== */}

            <Route
              path="*"
              element={<NotFound />}
            />

          </Routes>

          {/* ==================================================
              PWA INSTALL PROMPT
          ================================================== */}

          <PWAInstallPrompt />

        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
