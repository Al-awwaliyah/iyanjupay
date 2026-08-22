import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import React, { useEffect, useState } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
} from "react-router-dom";

import AppSplash from "@/components/AppSplash";

import Index from "./pages/Index";
import ForgotPassword from "./pages/ForgotPassword";
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
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        {/* Toast notifications */}
        <Toaster />

        {/* Sonner notifications */}
        <Sonner />

        {/* Application Router */}
        <BrowserRouter>
          <Routes>
            {/* Main application */}
            <Route
              path="/"
              element={<Index />}
            />

            {/* Forgot password */}
            <Route
              path="/forgot-password"
              element={<ForgotPassword />}
            />

            {/* Password recovery OTP */}
            <Route
              path="/verify-recovery-otp"
              element={<VerifyRecoveryOtp />}
            />

            {/* Set new password */}
            <Route
              path="/reset-password"
              element={<ResetPassword />}
            />

            {/* 404 */}
            <Route
              path="*"
              element={<NotFound />}
            />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
