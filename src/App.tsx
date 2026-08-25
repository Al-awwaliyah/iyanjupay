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
import VerifyRecoveryOtp from "./pages/VerifyRecoveryOtp";
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

                This fixes:

                User attempted to access non-existent route:
                /signup

                It also allows:

                /signup?ref=ALXXXXXXXX

                AuthForm reads ?ref= automatically.
            */}

            <Route
              path="/signup"
              element={<Index />}
            />

            {/* ==================================================
                EMAIL VERIFICATION
            ================================================== */}

            <Route
              path="/verify-email-otp"
              element={<VerifyEmailOtp />}
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
