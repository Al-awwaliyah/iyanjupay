import React, {
  useCallback,
  useEffect,
  useState,
} from "react";

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
  RefreshCw,
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

interface TransferLimitData {
  success: boolean;
  kyc_level: number;
  daily_limit: number;
  amount_used: number;
  amount_reserved: number;
  successful_amount: number;
  failed_amount: number;
  transfer_count: number;
  remaining: number;
  transfer_date: string;
  currency: string;
}

interface ProfileData {
  id: string;
  bvn: string | null;
  nin: string | null;
  bvn_verified: boolean | null;
  bvn_verified_at: string | null;
  kyc_level: number | null;
  kyc_status: string | null;
}

const TransactionLimitPage = ({
  onBack,
}: TransactionLimitPageProps) => {
  const { user } = useAuth();

  const [profile, setProfile] =
    useState<ProfileData | null>(null);

  const [limitData, setLimitData] =
    useState<TransferLimitData | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  // ============================================================
  // FORMAT MONEY
  // ============================================================

  const formatMoney = (
    amount: number | null | undefined,
  ) => {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(amount ?? 0));
  };

  // ============================================================
  // LOAD PROFILE
  // ============================================================

  const loadProfile =
    useCallback(
      async () => {
        if (!user?.id) {
          return;
        }

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
            `,
          )
          .eq("id", user.id)
          .maybeSingle();

        if (profileError) {
          throw profileError;
        }

        setProfile(data);
      },
      [user?.id],
    );

  // ============================================================
  // LOAD ACTUAL DAILY TRANSFER LIMIT
  //
  // Uses your EXISTING:
  //
  // get_my_daily_transfer_limit(_user_id uuid)
  //
  // ============================================================

  const loadTransferLimit =
    useCallback(
      async () => {
        if (!user?.id) {
          return;
        }

        const {
          data,
          error: rpcError,
        } =
          await supabase.rpc(
            "get_my_daily_transfer_limit",
            {
              _user_id: user.id,
            },
          );

        if (rpcError) {
          console.error(
            "get_my_daily_transfer_limit error:",
            rpcError,
          );

          throw rpcError;
        }

        if (!data) {
          throw new Error(
            "No transaction limit information was returned.",
          );
        }

        if (data.success === false) {
          throw new Error(
            data.error ??
              "Unable to load transaction limits.",
          );
        }

        setLimitData({
          success: true,

          kyc_level:
            Number(
              data.kyc_level ?? 1,
            ),

          daily_limit:
            Number(
              data.daily_limit ?? 0,
            ),

          amount_used:
            Number(
              data.amount_used ?? 0,
            ),

          amount_reserved:
            Number(
              data.amount_reserved ?? 0,
            ),

          successful_amount:
            Number(
              data.successful_amount ?? 0,
            ),

          failed_amount:
            Number(
              data.failed_amount ?? 0,
            ),

          transfer_count:
            Number(
              data.transfer_count ?? 0,
            ),

          remaining:
            Number(
              data.remaining ?? 0,
            ),

          transfer_date:
            String(
              data.transfer_date ??
                "",
            ),

          currency:
            String(
              data.currency ??
                "NGN",
            ),
        });
      },
      [user?.id],
    );

  // ============================================================
  // LOAD EVERYTHING
  // ============================================================

  const loadData =
    useCallback(
      async (
        showRefreshLoader = false,
      ) => {
        if (!user?.id) {
          setLoading(false);
          return;
        }

        if (showRefreshLoader) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setError(null);

        try {
          await Promise.all([
            loadProfile(),
            loadTransferLimit(),
          ]);
        } catch (err) {
          console.error(
            "Transaction limit loading error:",
            err,
          );

          setError(
            err instanceof Error
              ? err.message
              : "Unable to load your transaction limits.",
          );
        } finally {
          setLoading(false);
          setRefreshing(false);
        }
      },
      [
        user?.id,
        loadProfile,
        loadTransferLimit,
      ],
    );

  // ============================================================
  // INITIAL LOAD
  // ============================================================

  useEffect(() => {
    loadData();
  }, [
    user?.id,
    loadData,
  ]);

  // ============================================================
  // REALTIME PROFILE UPDATE
  //
  // If BVN/KYC updates profiles.kyc_level,
  // refresh this page automatically.
  // ============================================================

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    const channel =
      supabase
        .channel(
          `transaction-limit-profile-${user.id}`,
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "profiles",
            filter: `id=eq.${user.id}`,
          },
          async () => {
            console.log(
              "Profile KYC changed. Refreshing transaction limits...",
            );

            try {
              await Promise.all([
                loadProfile(),
                loadTransferLimit(),
              ]);
            } catch (error) {
              console.error(
                "Realtime KYC refresh error:",
                error,
              );
            }
          },
        )
        .subscribe();

    return () => {
      supabase.removeChannel(
        channel,
      );
    };
  }, [
    user?.id,
    loadProfile,
    loadTransferLimit,
  ]);

  // ============================================================
  // KYC VALUES
  //
  // Prefer the value returned by the RPC because that is the
  // actual value used to calculate the transfer limit.
  // ============================================================

  const kycLevel =
    Number(
      limitData?.kyc_level ??
        profile?.kyc_level ??
        1,
    );

  const kycStatus =
    String(
      profile?.kyc_status ??
        (kycLevel >= 2
          ? "verified"
          : "unverified"),
    ).toLowerCase();

  const hasBVN =
    Boolean(
      profile?.bvn?.trim(),
    );

  const hasNIN =
    Boolean(
      profile?.nin?.trim(),
    );

  const bvnVerified =
    profile?.bvn_verified === true;

  const isVerified =
    kycStatus === "verified" ||
    bvnVerified ||
    kycLevel >= 2;

  // ============================================================
  // KYC TITLE
  // ============================================================

  const getKycTitle = () => {
    if (kycLevel >= 3) {
      return "KYC Level 3";
    }

    if (kycLevel === 2) {
      return "KYC Level 2";
    }

    if (kycLevel === 1) {
      return "KYC Level 1";
    }

    return "KYC Not Completed";
  };

  // ============================================================
  // KYC DESCRIPTION
  // ============================================================

  const getKycDescription = () => {
    if (kycLevel >= 3) {
      return "Your account has premium transaction limits.";
    }

    if (kycLevel === 2) {
      return "Your identity has been verified and your account has a higher transaction limit.";
    }

    return "Complete your KYC verification to access higher transaction limits.";
  };

  // ============================================================
  // KYC DAILY LIMIT
  // ============================================================

  const dailyLimit =
    Number(
      limitData?.daily_limit ?? 0,
    );

  const amountUsed =
    Number(
      limitData?.amount_used ?? 0,
    );

  const amountReserved =
    Number(
      limitData?.amount_reserved ?? 0,
    );

  const remaining =
    Number(
      limitData?.remaining ??
        Math.max(
          dailyLimit -
            amountUsed -
            amountReserved,
          0,
        ),
    );

  const successfulAmount =
    Number(
      limitData?.successful_amount ?? 0,
    );

  const failedAmount =
    Number(
      limitData?.failed_amount ?? 0,
    );

  const transferCount =
    Number(
      limitData?.transfer_count ?? 0,
    );

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

        <div className="flex items-center justify-between mb-6">

          <div className="flex items-center gap-4">

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

          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              loadData(true)
            }
            disabled={refreshing}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${
                refreshing
                  ? "animate-spin"
                  : ""
              }`}
            />

            Refresh
          </Button>

        </div>

        {/* ======================================================
            ERROR
        ====================================================== */}

        {error && (
          <Card className="mb-6 border-red-200 bg-red-50">
            <CardContent className="p-5">

              <div className="flex gap-3">

                <ShieldAlert className="h-5 w-5 text-red-600 mt-0.5" />

                <div className="flex-1">

                  <h3 className="font-semibold text-red-900">
                    Unable to load transaction limits
                  </h3>

                  <p className="text-sm text-red-800 mt-1">
                    {error}
                  </p>

                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() =>
                      loadData(true)
                    }
                  >
                    Try Again
                  </Button>

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

              {/* KYC STATUS */}

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
            DAILY LIMIT SUMMARY
        ====================================================== */}

        <Card className="mb-6 border-purple-200 bg-white shadow-sm">

          <CardContent className="p-6">

            <div className="flex items-center justify-between mb-5">

              <div>
                <p className="text-sm text-gray-500">
                  Daily Transfer Limit
                </p>

                <p className="text-3xl font-bold text-gray-900 mt-1">
                  {formatMoney(
                    dailyLimit,
                  )}
                </p>
              </div>

              <div className="w-14 h-14 bg-purple-100 rounded-full flex items-center justify-center">
                <CreditCard className="h-7 w-7 text-purple-600" />
              </div>

            </div>

            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">

              <div
                className="h-full bg-purple-600 rounded-full transition-all duration-500"
                style={{
                  width: `${
                    dailyLimit > 0
                      ? Math.min(
                          (
                            (amountUsed +
                              amountReserved) /
                              dailyLimit) *
                              100,
                            100,
                          )
                      : 0
                  }%`,
                }}
              />

            </div>

            <div className="flex justify-between mt-2 text-xs text-gray-500">

              <span>
                Used:{" "}
                {formatMoney(
                  amountUsed,
                )}
              </span>

              <span>
                Remaining:{" "}
                {formatMoney(
                  remaining,
                )}
              </span>

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

          {/* DAILY TRANSFER */}

          <Card>

            <CardContent className="p-5">

              <div className="flex items-center gap-4">

                <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">

                  <ArrowUpRight className="h-6 w-6 text-purple-600" />

                </div>

                <div className="flex-1">

                  <p className="text-sm text-gray-600">
                    Daily Transfer
                  </p>

                  <p className="text-lg font-bold text-gray-900">
                    {formatMoney(
                      dailyLimit,
                    )}
                  </p>

                </div>

              </div>

            </CardContent>

          </Card>

          {/* AMOUNT USED */}

          <Card>

            <CardContent className="p-5">

              <div className="flex items-center gap-4">

                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">

                  <CreditCard className="h-6 w-6 text-blue-600" />

                </div>

                <div className="flex-1">

                  <p className="text-sm text-gray-600">
                    Used Today
                  </p>

                  <p className="text-lg font-bold text-gray-900">
                    {formatMoney(
                      amountUsed,
                    )}
                  </p>

                </div>

              </div>

            </CardContent>

          </Card>

          {/* RESERVED */}

          <Card>

            <CardContent className="p-5">

              <div className="flex items-center gap-4">

                <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center">

                  <Wallet className="h-6 w-6 text-yellow-600" />

                </div>

                <div className="flex-1">

                  <p className="text-sm text-gray-600">
                    Reserved Today
                  </p>

                  <p className="text-lg font-bold text-gray-900">
                    {formatMoney(
                      amountReserved,
                    )}
                  </p>

                </div>

              </div>

            </CardContent>

          </Card>

          {/* REMAINING */}

          <Card className="border-green-200 bg-green-50">

            <CardContent className="p-5">

              <div className="flex items-center gap-4">

                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">

                  <CheckCircle2 className="h-6 w-6 text-green-600" />

                </div>

                <div className="flex-1">

                  <p className="text-sm text-green-700">
                    Remaining Today
                  </p>

                  <p className="text-lg font-bold text-green-800">
                    {formatMoney(
                      remaining,
                    )}
                  </p>

                </div>

              </div>

            </CardContent>

          </Card>

          {/* SUCCESSFUL */}

          <Card>

            <CardContent className="p-5">

              <div className="flex items-center gap-4">

                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">

                  <ArrowUpRight className="h-6 w-6 text-green-600" />

                </div>

                <div className="flex-1">

                  <p className="text-sm text-gray-600">
                    Successful Transfers
                  </p>

                  <p className="text-lg font-bold text-gray-900">
                    {formatMoney(
                      successfulAmount,
                    )}
                  </p>

                  <p className="text-xs text-gray-500 mt-1">
                    {transferCount} transfer
                    {transferCount === 1
                      ? ""
                      : "s"} recorded today
                  </p>

                </div>

              </div>

            </CardContent>

          </Card>

          {/* FAILED */}

          <Card>

            <CardContent className="p-5">

              <div className="flex items-center gap-4">

                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">

                  <ShieldAlert className="h-6 w-6 text-red-600" />

                </div>

                <div className="flex-1">

                  <p className="text-sm text-gray-600">
                    Failed Transfer Amount
                  </p>

                  <p className="text-lg font-bold text-gray-900">
                    {formatMoney(
                      failedAmount,
                    )}
                  </p>

                </div>

              </div>

            </CardContent>

          </Card>

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
                  Your daily transfer limit is determined by
                  your KYC level. The limit and remaining amount
                  shown above are retrieved directly from your
                  IyanjuPay account and are updated as your
                  transaction activity changes.
                </p>

                <p className="text-xs text-blue-700 mt-2">
                  KYC Level {kycLevel} ·{" "}
                  {limitData?.currency ??
                    "NGN"}
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
