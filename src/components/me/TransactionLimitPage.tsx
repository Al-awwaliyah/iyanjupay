import React, { useEffect, useState } from "react";

import {
  ArrowLeft,
  CreditCard,
  ArrowUpRight,
  Wallet,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  Info,
  Loader2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";

import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

interface TransactionLimitPageProps {
  onBack: () => void;
}

type Profile = {
  id: string;
  bvn: string | null;
  nin: string | null;
  bvn_verified: boolean | null;
  bvn_verified_at: string | null;
  kyc_level: number | null;
  kyc_status: string | null;
};

const TransactionLimitPage = ({
  onBack,
}: TransactionLimitPageProps) => {
  const { user } = useAuth();

  const [profile, setProfile] =
    useState<Profile | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  // ============================================================
  // LOAD KYC PROFILE
  // ============================================================

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const loadProfile = async () => {
      try {
        setLoading(true);
        setError(null);

        const {
          data,
          error: profileError,
        } = await supabase
          .from("profiles")
          .select(
            `
              id,
              bvn,
              nin,
              bvn_verified,
              bvn_verified_at,
              kyc_level,
              kyc_status
            `
          )
          .eq("id", user.id)
          .maybeSingle();

        if (cancelled) {
          return;
        }

        if (profileError) {
          console.error(
            "Transaction Limit profile error:",
            profileError
          );

          setError(
            "Unable to load your KYC information."
          );

          return;
        }

        setProfile(data);
      } catch (err) {
        if (cancelled) {
          return;
        }

        console.error(
          "Failed to load KYC profile:",
          err
        );

        setError(
          "Unable to load your KYC information."
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // ============================================================
  // KYC STATUS
  // ============================================================

  const kycLevel =
    Number(profile?.kyc_level ?? 0);

  const kycStatus =
    String(
      profile?.kyc_status ?? "unverified"
    ).toLowerCase();

  const hasBVN =
    Boolean(
      profile?.bvn?.trim()
    );

  const hasNIN =
    Boolean(
      profile?.nin?.trim()
    );

  const bvnVerified =
    profile?.bvn_verified === true;

  const isVerified =
    kycStatus === "verified" ||
    bvnVerified;

  // ============================================================
  // KYC LEVEL DISPLAY
  // ============================================================

  const getKycTitle = () => {
    if (kycLevel >= 2) {
      return "KYC Level 2";
    }

    if (kycLevel === 1) {
      return "KYC Level 1";
    }

    return "KYC Not Completed";
  };

  const getKycDescription = () => {
    if (kycLevel >= 2) {
      return "Your identity has been verified.";
    }

    if (kycLevel === 1) {
      return "Complete additional verification to access higher limits.";
    }

    return "Complete your KYC verification to access higher transaction limits.";
  };

  // ============================================================
  // TRANSACTION LIMITS
  //
  // IMPORTANT:
  // These values are based on KYC level.
  //
  // Once your backend has a dedicated transaction_limits table,
  // these values should be moved there.
  // ============================================================

  const getLimits = () => {
    /*
     * Level 2 is the KYC level currently assigned by your
     * existing successful BVN verification function.
     *
     * We intentionally don't invent a provider/account limit
     * that isn't currently stored in the project database.
     */

    if (kycLevel >= 2) {
      return [
        {
          title: "Single Transfer",
          value: "Based on your account limit",
          icon: ArrowUpRight,
        },
        {
          title: "Daily Transfer",
          value: "Based on your account limit",
          icon: CreditCard,
        },
        {
          title: "Daily Wallet Funding",
          value: "Based on your account limit",
          icon: Wallet,
        },
      ];
    }

    return [
      {
        title: "Single Transfer",
        value: "KYC required",
        icon: ArrowUpRight,
      },
      {
        title: "Daily Transfer",
        value: "KYC required",
        icon: CreditCard,
      },
      {
        title: "Daily Wallet Funding",
        value: "KYC required",
        icon: Wallet,
      },
    ];
  };

  const limits = getLimits();

  // ============================================================
  // LOADING
  // ============================================================

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50">

        <div className="text-center">

          <Loader2 className="h-10 w-10 animate-spin text-purple-600 mx-auto" />

          <p className="mt-4 text-gray-600">
            Loading your transaction limits...
          </p>

        </div>

      </div>
    );
  }

  // ============================================================
  // PAGE
  // ============================================================

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50 pb-20">

      <div className="max-w-4xl mx-auto px-4 py-6">

        {/* ======================================================
            HEADER
        ====================================================== */}

        <div className="flex items-center gap-4 mb-6">

          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="text-purple-600"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />

            Back
          </Button>

          <h1 className="text-2xl font-bold text-gray-900">
            Transaction Limit
          </h1>

        </div>

        {/* ======================================================
            ERROR
        ====================================================== */}

        {error && (
          <Card className="mb-6 border-red-200 bg-red-50">

            <CardContent className="p-5">

              <div className="flex gap-3">

                <ShieldAlert className="h-5 w-5 text-red-600 mt-0.5" />

                <div>

                  <h3 className="font-semibold text-red-900">
                    Unable to load KYC information
                  </h3>

                  <p className="text-sm text-red-800 mt-1">
                    {error}
                  </p>

                </div>

              </div>

            </CardContent>

          </Card>
        )}

        {/* ======================================================
            KYC CARD
        ====================================================== */}

        <Card className="mb-6 bg-gradient-to-r from-purple-600 to-blue-600 text-white border-0 shadow-lg">

          <CardContent className="p-6">

            <div className="flex items-center gap-4">

              <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center">

                {isVerified ? (
                  <ShieldCheck className="h-7 w-7" />
                ) : (
                  <ShieldAlert className="h-7 w-7" />
                )}

              </div>

              <div className="flex-1">

                <p className="text-purple-100 text-sm">
                  Verification Level
                </p>

                <h2 className="text-xl font-bold">
                  {getKycTitle()}
                </h2>

                <p className="text-purple-100 text-sm mt-1">
                  {getKycDescription()}
                </p>

              </div>

              <div>

                {isVerified ? (
                  <div className="flex items-center gap-1 text-green-100 text-sm">

                    <CheckCircle2 className="h-4 w-4" />

                    Verified

                  </div>
                ) : (
                  <div className="text-yellow-100 text-sm">
                    Pending
                  </div>
                )}

              </div>

            </div>

          </CardContent>

        </Card>

        {/* ======================================================
            KYC DETAILS
        ====================================================== */}

        <Card className="mb-6">

          <CardContent className="p-5">

            <h3 className="font-semibold text-gray-900 mb-4">
              KYC Information
            </h3>

            <div className="space-y-4">

              {/* BVN */}
              <div className="flex items-center justify-between">

                <div>

                  <p className="text-sm text-gray-600">
                    BVN
                  </p>

                  <p className="font-semibold text-gray-900">
                    {hasBVN
                      ? "Provided"
                      : "Not provided"}
                  </p>

                </div>

                {bvnVerified ? (
                  <div className="flex items-center gap-1 text-green-600 text-sm">

                    <CheckCircle2 className="h-4 w-4" />

                    Verified

                  </div>
                ) : (
                  <span className="text-gray-500 text-sm">
                    Not verified
                  </span>
                )}

              </div>

              {/* NIN */}
              <div className="flex items-center justify-between">

                <div>

                  <p className="text-sm text-gray-600">
                    NIN
                  </p>

                  <p className="font-semibold text-gray-900">
                    {hasNIN
                      ? "Provided"
                      : "Not provided"}
                  </p>

                </div>

                {hasNIN ? (
                  <div className="flex items-center gap-1 text-green-600 text-sm">

                    <CheckCircle2 className="h-4 w-4" />

                    Available

                  </div>
                ) : (
                  <span className="text-gray-500 text-sm">
                    Not provided
                  </span>
                )}

              </div>

              {/* KYC status */}
              <div className="flex items-center justify-between">

                <div>

                  <p className="text-sm text-gray-600">
                    KYC Status
                  </p>

                  <p className="font-semibold text-gray-900 capitalize">
                    {kycStatus}
                  </p>

                </div>

                <span className="text-sm font-medium text-purple-600">
                  Level {kycLevel}
                </span>

              </div>

            </div>

          </CardContent>

        </Card>

        {/* ======================================================
            LIMITS
        ====================================================== */}

        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Your Transaction Limits
        </h2>

        <div className="space-y-4">

          {limits.map((limit) => {
            const Icon =
              limit.icon;

            return (
              <Card key={limit.title}>

                <CardContent className="p-5">

                  <div className="flex items-center gap-4">

                    <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">

                      <Icon className="h-6 w-6 text-purple-600" />

                    </div>

                    <div className="flex-1">

                      <p className="text-sm text-gray-600">
                        {limit.title}
                      </p>

                      <p className="text-lg font-bold text-gray-900">
                        {limit.value}
                      </p>

                    </div>

                  </div>

                </CardContent>

              </Card>
            );
          })}

        </div>

        {/* ======================================================
            INFORMATION
        ====================================================== */}

        <Card className="mt-6 border-blue-200 bg-blue-50">

          <CardContent className="p-5">

            <div className="flex gap-3">

              <Info className="h-5 w-5 text-blue-600 mt-0.5" />

              <div>

                <h3 className="font-semibold text-blue-900">
                  About your limits
                </h3>

                <p className="text-sm text-blue-800 mt-1 leading-6">
                  Your transaction limits are connected to your
                  KYC verification level. As your account becomes
                  fully verified, the limits available to your
                  account can increase according to IyanjuPay's
                  applicable account rules.
                </p>

              </div>

            </div>

          </CardContent>

        </Card>

      </div>

    </div>
  );
};

export default TransactionLimitPage;
