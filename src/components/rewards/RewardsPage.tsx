import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ArrowLeft,
  Gift,
  Users,
  Copy,
  Share,
  CheckCircle2,
  Clock3,
  Loader2,
  Link2,
} from "lucide-react";

import { Button } from "@/components/ui/button";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { Input } from "@/components/ui/input";

import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface RewardsPageProps {
  onBack: () => void;
}

interface ReferralStats {
  totalReferrals: number;
  completedReferrals: number;
  pendingReferrals: number;
  totalEarned: number;
  pendingRewards: number;
}

interface ReferralHistoryItem {
  id: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  referred_user_id: string;
  referral_code: string;
}

const REFERRAL_REWARD = 500;

const RewardsPage = ({
  onBack,
}: RewardsPageProps) => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [referralCode, setReferralCode] = useState("");
  const [referralStats, setReferralStats] =
    useState<ReferralStats>({
      totalReferrals: 0,
      completedReferrals: 0,
      pendingReferrals: 0,
      totalEarned: 0,
      pendingRewards: 0,
    });

  const [referralHistory, setReferralHistory] =
    useState<ReferralHistoryItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);

  const referralLink = useMemo(() => {
    if (!referralCode) {
      return "";
    }

    return `${window.location.origin}/signup?ref=${encodeURIComponent(
      referralCode
    )}`;
  }, [referralCode]);

  const loadReferralCode =
    useCallback(async () => {
      if (!user) {
        return;
      }

      const {
        data,
        error,
      } = await supabase.rpc(
        "get_or_create_referral_code",
        {
          p_user_id: user.id,
        }
      );

      if (error) {
        console.error(
          "Referral code error:",
          error
        );

        toast({
          title:
            "Unable to load referral code",
          description:
            error.message,
          variant:
            "destructive",
        });

        return;
      }

      setReferralCode(
        String(data ?? "")
      );
    }, [
      user,
      toast,
    ]);

  const loadReferralData =
    useCallback(async () => {
      if (!user) {
        return;
      }

      try {
        setLoading(true);

        const {
          data: referrals,
          error: referralsError,
        } = await supabase
          .from("referrals")
          .select(`
            id,
            status,
            created_at,
            completed_at,
            referred_user_id,
            referral_code
          `)
          .eq(
            "referrer_id",
            user.id
          )
          .order(
            "created_at",
            {
              ascending: false,
            }
          );

        if (referralsError) {
          throw referralsError;
        }

        const rows =
          (referrals ??
            []) as ReferralHistoryItem[];

        setReferralHistory(rows);

        const totalReferrals =
          rows.length;

        const completedReferrals =
          rows.filter(
            referral =>
              referral.status ===
              "completed"
          ).length;

        const pendingReferrals =
          rows.filter(
            referral =>
              referral.status ===
                "pending" ||
              referral.status ===
                "qualified"
          ).length;

        const {
          data: rewards,
          error: rewardsError,
        } = await supabase
          .from("referral_rewards")
          .select(`
            amount,
            status,
            user_id
          `)
          .eq(
            "user_id",
            user.id
          );

        if (rewardsError) {
          throw rewardsError;
        }

        const rewardRows =
          rewards ?? [];

        const totalEarned =
          rewardRows
            .filter(
              reward =>
                reward.status ===
                "paid"
            )
            .reduce(
              (
                total,
                reward
              ) =>
                total +
                Number(
                  reward.amount ??
                    0
                ),
              0
            );

        const pendingRewards =
          rewardRows
            .filter(
              reward =>
                reward.status ===
                  "pending" ||
                reward.status ===
                  "processing"
            )
            .reduce(
              (
                total,
                reward
              ) =>
                total +
                Number(
                  reward.amount ??
                    0
                ),
              0
            );

        setReferralStats({
          totalReferrals,
          completedReferrals,
          pendingReferrals,
          totalEarned,
          pendingRewards,
        });
      } catch (error: any) {
        console.error(
          "Referral data error:",
          error
        );

        toast({
          title:
            "Unable to load rewards",
          description:
            error?.message ??
            "Please try again.",
          variant:
            "destructive",
        });
      } finally {
        setLoading(false);
      }
    }, [
      user,
      toast,
    ]);

  useEffect(() => {
    if (!user) {
      return;
    }

    loadReferralCode();
    loadReferralData();
  }, [
    user,
    loadReferralCode,
    loadReferralData,
  ]);

  const copyReferralCode =
    async () => {
      if (!referralCode) {
        return;
      }

      try {
        await navigator.clipboard.writeText(
          referralCode
        );

        setCopied(true);

        toast({
          title: "Copied!",
          description:
            "Your referral code has been copied.",
        });

        setTimeout(() => {
          setCopied(false);
        }, 2000);
      } catch {
        toast({
          title:
            "Copy failed",
          description:
            "Please copy the referral code manually.",
          variant:
            "destructive",
        });
      }
    };

  const copyReferralLink =
    async () => {
      if (!referralLink) {
        return;
      }

      try {
        await navigator.clipboard.writeText(
          referralLink
        );

        toast({
          title:
            "Referral link copied!",
          description:
            "You can now send it to your friend.",
        });
      } catch {
        toast({
          title:
            "Copy failed",
          description:
            "Unable to copy referral link.",
          variant:
            "destructive",
        });
      }
    };

  const shareReferral =
    async () => {
      if (!referralLink) {
        return;
      }

      setSharing(true);

      const shareText =
        `Join me on IyanjuPay and get ₦${REFERRAL_REWARD} bonus when you complete your first transaction!`;

      try {
        if (
          navigator.share
        ) {
          await navigator.share({
            title:
              "Join IyanjuPay",
            text:
              shareText,
            url:
              referralLink,
          });
        } else {
          await navigator.clipboard.writeText(
            `${shareText}\n\n${referralLink}`
          );

          toast({
            title:
              "Referral link copied!",
            description:
              "Send the copied message to your friend.",
          });
        }
      } catch (error: any) {
        if (
          error?.name !==
          "AbortError"
        ) {
          toast({
            title:
              "Unable to share",
            description:
              "Please copy your referral link instead.",
            variant:
              "destructive",
          });
        }
      } finally {
        setSharing(false);
      }
    };

  const getStatusContent =
    (
      status: string
    ) => {
      switch (
        status
      ) {
        case "completed":
          return (
            <div className="flex items-center gap-1 text-green-600 text-sm font-medium">
              <CheckCircle2 className="h-4 w-4" />
              Completed
            </div>
          );

        case "qualified":
          return (
            <div className="flex items-center gap-1 text-blue-600 text-sm font-medium">
              <Loader2 className="h-4 w-4 animate-spin" />
              Processing
            </div>
          );

        case "cancelled":
          return (
            <div className="text-red-600 text-sm font-medium">
              Cancelled
            </div>
          );

        default:
          return (
            <div className="flex items-center gap-1 text-orange-600 text-sm font-medium">
              <Clock3 className="h-4 w-4" />
              Pending
            </div>
          );
      }
    };

  return (
    <>
      <style>{`
        /*
         * ============================================================
         * IYANJUPAY DASHBOARD THEME BRIDGE
         * ============================================================
         *
         * Dashboard remains the single source of truth.
         *
         * Dashboard already writes:
         *
         * document.documentElement.dataset.iyanjupayTheme
         *
         * RewardsPage only consumes that existing attribute.
         *
         * No independent theme state.
         * No ThemeProvider.
         * No localStorage reads/writes here.
         */

        .iyanjupay-rewards-page {
          background: #f7f8fc;
          color: #0f172a;
          transition:
            background-color 180ms ease,
            color 180ms ease;
        }

        /*
         * BLUE
         */
        [data-iyanjupay-theme="blue"]
          .iyanjupay-rewards-page {
          background: #f4f8ff;
        }

        /*
         * DARK
         */
        [data-iyanjupay-theme="dark"]
          .iyanjupay-rewards-page {
          background: #090d18;
          color: #f8fafc;
        }

        [data-iyanjupay-theme="dark"]
          .iyanjupay-rewards-page
          .bg-white {
          background-color: #111827 !important;
        }

        [data-iyanjupay-theme="dark"]
          .iyanjupay-rewards-page
          .bg-slate-50 {
          background-color: #090d18 !important;
        }

        [data-iyanjupay-theme="dark"]
          .iyanjupay-rewards-page
          .bg-slate-100 {
          background-color: #1e293b !important;
        }

        [data-iyanjupay-theme="dark"]
          .iyanjupay-rewards-page
          .bg-gray-50 {
          background-color: #090d18 !important;
        }

        [data-iyanjupay-theme="dark"]
          .iyanjupay-rewards-page
          .bg-gray-100 {
          background-color: #1e293b !important;
        }

        [data-iyanjupay-theme="dark"]
          .iyanjupay-rewards-page
          [class*="border-slate-200"] {
          border-color: #334155 !important;
        }

        [data-iyanjupay-theme="dark"]
          .iyanjupay-rewards-page
          [class*="border-gray-200"] {
          border-color: #334155 !important;
        }

        [data-iyanjupay-theme="dark"]
          .iyanjupay-rewards-page
          [class*="border-gray-100"] {
          border-color: #334155 !important;
        }

        [data-iyanjupay-theme="dark"]
          .iyanjupay-rewards-page
          .text-gray-900 {
          color: #f8fafc !important;
        }

        [data-iyanjupay-theme="dark"]
          .iyanjupay-rewards-page
          .text-gray-800 {
          color: #f1f5f9 !important;
        }

        [data-iyanjupay-theme="dark"]
          .iyanjupay-rewards-page
          .text-gray-700 {
          color: #e2e8f0 !important;
        }

        [data-iyanjupay-theme="dark"]
          .iyanjupay-rewards-page
          .text-gray-600 {
          color: #cbd5e1 !important;
        }

        [data-iyanjupay-theme="dark"]
          .iyanjupay-rewards-page
          .text-gray-500 {
          color: #94a3b8 !important;
        }

        [data-iyanjupay-theme="dark"]
          .iyanjupay-rewards-page
          .text-gray-400 {
          color: #64748b !important;
        }

        [data-iyanjupay-theme="dark"]
          .iyanjupay-rewards-page
          .bg-purple-50 {
          background-color: #312e81 !important;
        }

        [data-iyanjupay-theme="dark"]
          .iyanjupay-rewards-page
          .border-purple-100 {
          border-color: #4338ca !important;
        }

        [data-iyanjupay-theme="dark"]
          .iyanjupay-rewards-page
          .text-purple-900 {
          color: #ede9fe !important;
        }

        [data-iyanjupay-theme="dark"]
          .iyanjupay-rewards-page
          .text-purple-700,
        [data-iyanjupay-theme="dark"]
          .iyanjupay-rewards-page
          .text-purple-600 {
          color: #c4b5fd !important;
        }

        [data-iyanjupay-theme="dark"]
          .iyanjupay-rewards-page
          .bg-purple-100 {
          background-color: #312e81 !important;
        }

        [data-iyanjupay-theme="dark"]
          .iyanjupay-rewards-page
          input {
          background-color: #0f172a !important;
          border-color: #334155 !important;
          color: #f8fafc !important;
        }

        [data-iyanjupay-theme="dark"]
          .iyanjupay-rewards-page
          input::placeholder {
          color: #64748b !important;
        }

        /*
         * BLUE
         *
         * The existing Dashboard blue appearance changes the
         * purple accents to IyanjuPay blue.
         */
        [data-iyanjupay-theme="blue"]
          .iyanjupay-rewards-page
          .bg-purple-50 {
          background-color: #dbeafe !important;
        }

        [data-iyanjupay-theme="blue"]
          .iyanjupay-rewards-page
          .border-purple-100 {
          border-color: #bfdbfe !important;
        }

        [data-iyanjupay-theme="blue"]
          .iyanjupay-rewards-page
          .text-purple-900 {
          color: #1e3a8a !important;
        }

        [data-iyanjupay-theme="blue"]
          .iyanjupay-rewards-page
          .text-purple-700,
        [data-iyanjupay-theme="blue"]
          .iyanjupay-rewards-page
          .text-purple-600 {
          color: #1d4ed8 !important;
        }

        [data-iyanjupay-theme="blue"]
          .iyanjupay-rewards-page
          .bg-purple-100 {
          background-color: #dbeafe !important;
        }

        [data-iyanjupay-theme="blue"]
          .iyanjupay-rewards-page
          .bg-purple-600 {
          background-color: #2563eb !important;
        }

        [data-iyanjupay-theme="blue"]
          .iyanjupay-rewards-page
          [class*="hover:bg-purple-700"]:hover {
          background-color: #1d4ed8 !important;
        }

        /*
         * DARK + BLUE / PURPLE TEXT INSIDE THE REWARD HERO
         * remains readable because the hero itself stays a
         * deliberate gradient card.
         */
        [data-iyanjupay-theme="dark"]
          .iyanjupay-rewards-page
          .text-purple-100,
        [data-iyanjupay-theme="blue"]
          .iyanjupay-rewards-page
          .text-purple-100 {
          color: #dbeafe !important;
        }
      `}</style>

      <div className="iyanjupay-dashboard iyanjupay-rewards-page min-h-screen pb-20">
        <div className="max-w-4xl mx-auto px-4 py-6">
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
              Rewards
            </h1>
          </div>

          <Card className="mb-6 bg-gradient-to-r from-purple-600 to-blue-600 text-white border-0">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <p className="text-purple-100 text-sm">
                    Total Rewards Earned
                  </p>

                  <p className="text-3xl font-bold mt-1">
                    ₦
                    {referralStats.totalEarned.toLocaleString()}
                  </p>
                </div>

                <Gift className="h-12 w-12" />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-purple-100 text-sm">
                    Total Referrals
                  </p>

                  <p className="text-xl font-bold">
                    {referralStats.totalReferrals}
                  </p>
                </div>

                <div>
                  <p className="text-purple-100 text-sm">
                    Completed
                  </p>

                  <p className="text-xl font-bold">
                    {referralStats.completedReferrals}
                  </p>
                </div>

                <div>
                  <p className="text-purple-100 text-sm">
                    Pending
                  </p>

                  <p className="text-xl font-bold">
                    {referralStats.pendingReferrals}
                  </p>
                </div>

                <div>
                  <p className="text-purple-100 text-sm">
                    Pending Rewards
                  </p>

                  <p className="text-xl font-bold">
                    ₦
                    {referralStats.pendingRewards.toLocaleString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Invite Friends
              </CardTitle>
            </CardHeader>

            <CardContent>
              <div className="space-y-5">
                <div className="rounded-xl bg-purple-50 border border-purple-100 p-4">
                  <h4 className="font-semibold text-purple-900 mb-2">
                    Earn ₦500 for every successful referral
                  </h4>

                  <ul className="text-sm text-gray-600 space-y-2">
                    <li>
                      • Share your referral link.
                    </li>

                    <li>
                      • Your friend creates an IyanjuPay account.
                    </li>

                    <li>
                      • Your friend completes their first successful transaction.
                    </li>

                    <li>
                      • You receive ₦500.
                    </li>

                    <li>
                      • Your friend also receives ₦500.
                    </li>
                  </ul>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Your Referral Code
                  </label>

                  <div className="flex gap-2">
                    <Input
                      value={referralCode}
                      readOnly
                      className="font-mono text-lg font-bold text-center"
                    />

                    <Button
                      type="button"
                      onClick={copyReferralCode}
                      variant="outline"
                    >
                      {copied ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Your Referral Link
                  </label>

                  <div className="flex gap-2">
                    <Input
                      value={referralLink}
                      readOnly
                      className="text-sm"
                    />

                    <Button
                      type="button"
                      onClick={copyReferralLink}
                      variant="outline"
                    >
                      <Link2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <Button
                  type="button"
                  onClick={shareReferral}
                  disabled={
                    sharing ||
                    !referralLink
                  }
                  className="w-full bg-purple-600 hover:bg-purple-700 h-12"
                >
                  {sharing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Share className="h-4 w-4 mr-2" />
                  )}

                  Share Referral Link
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                Referral History
              </CardTitle>
            </CardHeader>

            <CardContent>
              {loading ? (
                <div className="py-10 text-center">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto text-purple-600" />

                  <p className="text-sm text-gray-500 mt-3">
                    Loading referrals...
                  </p>
                </div>
              ) : referralHistory.length === 0 ? (
                <div className="text-center py-10">
                  <Users className="h-12 w-12 mx-auto text-gray-400 mb-4" />

                  <p className="text-gray-500">
                    No referrals yet
                  </p>

                  <p className="text-sm text-gray-400 mt-1">
                    Start inviting friends to earn ₦500.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {referralHistory.map(
                    referral => (
                      <div
                        key={
                          referral.id
                        }
                        className="flex items-center justify-between border rounded-xl p-4"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center">
                            <Users className="h-5 w-5 text-purple-600" />
                          </div>

                          <div>
                            <p className="font-medium text-gray-900">
                              Referred User
                            </p>

                            <p className="text-xs text-gray-500">
                              {new Date(
                                referral.created_at
                              ).toLocaleDateString()}
                            </p>
                          </div>
                        </div>

                        <div className="text-right">
                          {getStatusContent(
                            referral.status
                          )}

                          {referral.status ===
                            "completed" && (
                            <p className="text-xs text-green-600 mt-1">
                              +₦500 earned
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
};

export default RewardsPage;
