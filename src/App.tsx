import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import React, { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import AppSplash from "@/components/AppSplash";

import ResetPassword from "./pages/ResetPassword";
import Index from "./pages/Index";
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
   *
   * The splash screen is rendered before the main application.
   *
   * It uses AppSplash, so the splash itself can load from the
   * locally bundled /public/icon-180.png asset without requiring
   * the internet.
   *
   * Duration: 10 seconds
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

            {/* Password reset */}
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
