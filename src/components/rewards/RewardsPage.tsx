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


type DashboardTheme =
  | "light"
  | "blue"
  | "dark";


interface RewardsPageProps {
  onBack: () => void;
  dashboardTheme?: DashboardTheme;
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
  dashboardTheme = "light",
}: RewardsPageProps) => {

  const { user } = useAuth();

  const { toast } = useToast();


  const [referralCode, setReferralCode] =
    useState("");


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


  const [loading, setLoading] =
    useState(true);


  const [sharing, setSharing] =
    useState(false);


  const [copied, setCopied] =
    useState(false);


  // ============================================================
  // REFERRAL LINK
  // ============================================================

  const referralLink = useMemo(() => {

    if (!referralCode) {
      return "";
    }

    return `${window.location.origin}/signup?ref=${encodeURIComponent(
      referralCode
    )}`;

  }, [referralCode]);


  // ============================================================
  // LOAD REFERRAL CODE
  // ============================================================

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


  // ============================================================
  // LOAD REFERRAL DATA
  // ============================================================

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


        // ======================================================
        // STATS
        // ======================================================

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


        // ======================================================
        // REWARDS
        // ======================================================

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


  // ============================================================
  // INITIAL LOAD
  // ============================================================

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


  // ============================================================
  // COPY CODE
  // ============================================================

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


  // ============================================================
  // COPY LINK
  // ============================================================

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


  // ============================================================
  // SHARE
  // ============================================================

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


  // ============================================================
  // STATUS
  // ============================================================

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


  // ============================================================
  // THEME CLASSES
  // ============================================================

  const isDark =
    dashboardTheme === "dark";

  const isBlue =
    dashboardTheme === "blue";


  const pageBackground =
    isDark
      ? "bg-[#090d18] text-slate-100"
      : isBlue
        ? "bg-[#f4f8ff] text-slate-900"
        : "bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50";


  const standardCard =
    isDark
      ? "border-slate-700 bg-[#111827] text-slate-100"
      : "border-slate-200 bg-white text-slate-900";


  const standardMutedText =
    isDark
      ? "text-slate-400"
      : "text-gray-500";


  const standardHeading =
    isDark
      ? "text-slate-100"
      : "text-gray-900";


  const standardLabel =
    isDark
      ? "text-slate-300"
      : "text-gray-700";


  const inputClasses =
    isDark
      ? "border-slate-700 bg-slate-900 text-slate-100"
      : "bg-white";


  const inviteBoxClasses =
    isDark
      ? "border-indigo-900 bg-indigo-950/60"
      : isBlue
        ? "border-blue-100 bg-blue-50"
        : "border-purple-100 bg-purple-50";


  const inviteHeadingClasses =
    isDark
      ? "text-indigo-200"
      : isBlue
        ? "text-blue-900"
        : "text-purple-900";


  const primaryButtonClasses =
    isBlue
      ? "bg-blue-600 hover:bg-blue-700"
      : "bg-purple-600 hover:bg-purple-700";


  const historyRowClasses =
    isDark
      ? "border-slate-700 bg-slate-900/40"
      : "border-slate-200 bg-white";


  const historyIconClasses =
    isDark
      ? "bg-indigo-950 text-indigo-300"
      : "bg-purple-100 text-purple-600";


  return (

    <div
      className={`min-h-screen transition-colors duration-200 ${pageBackground}`}
    >

      <div className="max-w-4xl mx-auto px-4 py-6 pb-24">


        {/* ======================================================
            HEADER
        ====================================================== */}

        <div className="flex items-center gap-4 mb-6">

          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className={
              isDark
                ? "text-indigo-300 hover:bg-slate-800"
                : isBlue
                  ? "text-blue-600 hover:bg-blue-50"
                  : "text-purple-600"
            }
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>


          <h1
            className={`text-2xl font-bold ${standardHeading}`}
          >
            Rewards
          </h1>

        </div>


        {/* ======================================================
            REWARD OVERVIEW
        ====================================================== */}

        <Card
          className={`mb-6 bg-gradient-to-r ${
            isDark
              ? "from-[#111827] via-[#312e81] to-[#1e40af]"
              : isBlue
                ? "from-[#082A63] via-[#1554B8] to-[#2563EB]"
                : "from-purple-600 to-blue-600"
          } text-white border-0`}
        >

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


        {/* ======================================================
            INVITE
        ====================================================== */}

        <Card
          className={`mb-6 ${standardCard}`}
        >

          <CardHeader>

            <CardTitle
              className={`flex items-center gap-2 ${
                isDark
                  ? "text-slate-100"
                  : ""
              }`}
            >

              <Users className="h-5 w-5" />

              Invite Friends

            </CardTitle>

          </CardHeader>


          <CardContent>

            <div className="space-y-5">


              <div
                className={`rounded-xl border p-4 ${inviteBoxClasses}`}
              >

                <h4
                  className={`font-semibold mb-2 ${inviteHeadingClasses}`}
                >
                  Earn ₦500 for every successful referral
                </h4>

                <ul
                  className={`text-sm space-y-2 ${
                    isDark
                      ? "text-slate-300"
                      : "text-gray-600"
                  }`}
                >

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


              {/* CODE */}

              <div>

                <label
                  className={`block text-sm font-medium mb-2 ${standardLabel}`}
                >
                  Your Referral Code
                </label>

                <div className="flex gap-2">

                  <Input
                    value={
                      referralCode
                    }
                    readOnly
                    className={`font-mono text-lg font-bold text-center ${inputClasses}`}
                  />

                  <Button
                    type="button"
                    onClick={
                      copyReferralCode
                    }
                    variant="outline"
                    className={
                      isDark
                        ? "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
                        : ""
                    }
                  >

                    {copied ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}

                  </Button>

                </div>

              </div>


              {/* LINK */}

              <div>

                <label
                  className={`block text-sm font-medium mb-2 ${standardLabel}`}
                >
                  Your Referral Link
                </label>

                <div className="flex gap-2">

                  <Input
                    value={
                      referralLink
                    }
                    readOnly
                    className={`text-sm ${inputClasses}`}
                  />

                  <Button
                    type="button"
                    onClick={
                      copyReferralLink
                    }
                    variant="outline"
                    className={
                      isDark
                        ? "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
                        : ""
                    }
                  >

                    <Link2 className="h-4 w-4" />

                  </Button>

                </div>

              </div>


              {/* SHARE */}

              <Button
                type="button"
                onClick={
                  shareReferral
                }
                disabled={
                  sharing ||
                  !referralLink
                }
                className={`w-full h-12 ${primaryButtonClasses}`}
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


        {/* ======================================================
            REFERRAL HISTORY
        ====================================================== */}

        <Card
          className={standardCard}
        >

          <CardHeader>

            <CardTitle
              className={
                isDark
                  ? "text-slate-100"
                  : ""
              }
            >
              Referral History
            </CardTitle>

          </CardHeader>


          <CardContent>

            {loading ? (

              <div className="py-10 text-center">

                <Loader2 className="h-8 w-8 animate-spin mx-auto text-purple-600" />

                <p
                  className={`text-sm mt-3 ${standardMutedText}`}
                >
                  Loading referrals...
                </p>

              </div>

            ) : referralHistory.length === 0 ? (

              <div className="text-center py-10">

                <Users
                  className={`h-12 w-12 mx-auto mb-4 ${
                    isDark
                      ? "text-slate-600"
                      : "text-gray-400"
                  }`}
                />

                <p
                  className={standardMutedText}
                >
                  No referrals yet
                </p>

                <p
                  className={`text-sm mt-1 ${
                    isDark
                      ? "text-slate-500"
                      : "text-gray-400"
                  }`}
                >
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
                      className={`flex items-center justify-between border rounded-xl p-4 ${historyRowClasses}`}
                    >

                      <div className="flex items-center gap-3">

                        <div
                          className={`h-10 w-10 rounded-full flex items-center justify-center ${historyIconClasses}`}
                        >

                          <Users className="h-5 w-5" />

                        </div>


                        <div>

                          <p
                            className={`font-medium ${
                              isDark
                                ? "text-slate-100"
                                : "text-gray-900"
                            }`}
                          >
                            Referred User
                          </p>

                          <p
                            className={`text-xs ${standardMutedText}`}
                          >
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
  );
};


export default RewardsPage;
