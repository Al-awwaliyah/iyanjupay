import React from "react";

import { useAuth } from "@/hooks/useAuth";

import AuthForm from "@/components/auth/AuthForm";
import Dashboard from "@/components/Dashboard";

const Index = () => {
  const {
    user,
    loading: authLoading,
  } = useAuth();

  // ==========================================================
  // AUTH LOADING
  // ==========================================================

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto" />

          <p className="mt-4 text-gray-600">
            Loading...
          </p>
        </div>
      </div>
    );
  }

  // ==========================================================
  // NOT AUTHENTICATED
  // ==========================================================

  if (!user) {
    return <AuthForm />;
  }

  // ==========================================================
  // AUTHENTICATED
  //
  // IMPORTANT:
  // Do NOT perform another onboarding check here.
  //
  // OnboardingPage and OnboardingBvnPage are responsible
  // for onboarding routing.
  //
  // Once the user reaches "/":
  // authenticated users see Dashboard immediately.
  // ==========================================================

  return <Dashboard />;
};

export default Index;
