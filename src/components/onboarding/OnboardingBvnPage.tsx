import React, {
  useCallback,
  useEffect,
  useState,
} from "react";

import { useNavigate } from "react-router-dom";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  CheckCircle2,
  Loader2,
  ShieldCheck,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface KycStatus {
  verified: boolean;
  kyc_level: number;
  kyc_status: string;
  bvn_masked: string | null;
  bvn_verified_at: string | null;
}

const OnboardingBvnPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);

  const [bvn, setBvn] = useState("");

  const [kyc, setKyc] =
    useState<KycStatus | null>(null);

  // ==========================================================
  // INVOKE PROVN BVN
  // ==========================================================

  const invokeBvn = useCallback(
    async (
      payload: Record<string, unknown>,
    ) => {
      const {
        data,
        error,
      } = await supabase.functions.invoke(
        "provn-bvn",
        {
          body: payload,
        },
      );

      if (error) {
        let message =
          error.message ||
          "BVN request failed.";

        const context =
          (error as any)?.context;

        if (
          context &&
          typeof context.json ===
            "function"
        ) {
          try {
            const body =
              await context.json();

            if (body?.error) {
              message = body.error;
            }
          } catch {
            // Keep original message.
          }
        }

        throw new Error(message);
      }

      if (
        data &&
        data.success === false
      ) {
        throw new Error(
          data.error ||
            "BVN verification failed.",
        );
      }

      return data;
    },
    [],
  );

  // ==========================================================
  // LOAD KYC STATUS
  // ==========================================================

  const loadKyc = useCallback(
    async () => {
      try {
        const {
          data: {
            user,
          },
          error: userError,
        } =
          await supabase.auth.getUser();

        if (userError) {
          throw userError;
        }

        if (!user) {
          navigate("/", {
            replace: true,
          });

          return;
        }

        const data =
          await invokeBvn({
            action: "status",
          });

        const verified =
          Boolean(data?.verified);

        const level =
          Number(
            data?.kyc_level ??
              (verified ? 2 : 1),
          );

        const status =
          String(
            data?.kyc_status ??
              (verified
                ? "verified"
                : "unverified"),
          );

        const statusData: KycStatus = {
          verified,
          kyc_level: level,
          kyc_status: status,
          bvn_masked:
            data?.bvn_masked ??
            null,
          bvn_verified_at:
            data?.bvn_verified_at ??
            null,
        };

        setKyc(statusData);

        // ------------------------------------------------------
        // Already verified
        // ------------------------------------------------------

        if (verified) {
          navigate("/", {
            replace: true,
          });

          return;
        }
      } catch (error: any) {
        console.error(
          "Unable to load KYC status:",
          error,
        );

        toast({
          title:
            "Unable to load verification status",
          description:
            error?.message ||
            "Please try again.",
          variant:
            "destructive",
        });
      } finally {
        setLoading(false);
      }
    },
    [
      invokeBvn,
      navigate,
      toast,
    ],
  );

  // ==========================================================
  // INITIAL LOAD
  // ==========================================================

  useEffect(() => {
    loadKyc();
  }, [loadKyc]);

  // ==========================================================
  // VERIFY BVN
  // ==========================================================

  const handleVerifyBvn =
    async () => {
      const digits =
        bvn
          .replace(/\D/g, "")
          .slice(0, 11);

      if (
        digits.length !== 11
      ) {
        toast({
          title: "Invalid BVN",
          description:
            "Your BVN must contain exactly 11 digits.",
          variant:
            "destructive",
        });

        return;
      }

      setVerifying(true);

      try {
        /*
         * IMPORTANT:
         *
         * We intentionally send ONLY the BVN.
         *
         * We do not send:
         * - full_name
         * - phone_number
         * - date_of_birth
         * - address
         *
         * PROVN is responsible for verifying the BVN.
         */

        const result =
          await invokeBvn({
            action: "verify",
            bvn: digits,
          });

        if (
          !result?.success ||
          !result?.verified
        ) {
          throw new Error(
            result?.error ||
              "BVN verification failed.",
          );
        }

        setKyc({
          verified: true,

          kyc_level:
            Number(
              result?.kyc_level ??
                2,
            ),

          kyc_status:
            String(
              result?.kyc_status ??
                "verified",
            ),

          bvn_masked:
            result?.bvn_masked ??
            `******${digits.slice(-4)}`,

          bvn_verified_at:
            result?.bvn_verified_at ??
            new Date().toISOString(),
        });

        setBvn("");

        toast({
          title:
            "BVN verified successfully",
          description:
            "Your account has been upgraded to KYC Tier 2.",
        });

        // ------------------------------------------------------
        // FINAL DATABASE STATUS CHECK
        // ------------------------------------------------------

        const status =
          await invokeBvn({
            action: "status",
          });

        if (
          !status?.verified ||
          Number(
            status?.kyc_level ?? 0,
          ) < 2
        ) {
          throw new Error(
            "BVN verification succeeded, but the saved KYC status could not be confirmed.",
          );
        }

        // ------------------------------------------------------
        // ONBOARDING COMPLETE
        // ------------------------------------------------------

        navigate("/", {
          replace: true,
        });
      } catch (error: any) {
        console.error(
          "Onboarding BVN verification error:",
          error,
        );

        toast({
          title:
            "Verification failed",
          description:
            error?.message ||
            "Unable to verify your BVN.",
          variant:
            "destructive",
        });
      } finally {
        setVerifying(false);
      }
    };

  // ==========================================================
  // LOADING
  // ==========================================================

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-blue-50 p-4">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-green-600" />

          <p className="text-sm text-gray-600">
            Checking your verification status...
          </p>
        </div>
      </div>
    );
  }

  // ==========================================================
  // UI
  // ==========================================================

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-blue-50 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-100">
            <ShieldCheck className="h-7 w-7 text-blue-600" />
          </div>

          <CardTitle className="text-2xl font-bold text-[#082A63]">
            Verify Your BVN
          </CardTitle>

          <CardDescription>
            Verify your Bank Verification Number
            to complete your IyanjuPay account
            setup and unlock KYC Tier 2.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {kyc?.verified ? (
            <div className="rounded-lg border border-green-200 bg-green-50 p-5">
              <div className="flex items-center gap-2 text-green-700">
                <CheckCircle2 className="h-5 w-5" />

                <span className="font-semibold">
                  BVN verified successfully
                </span>
              </div>

              {kyc.bvn_masked && (
                <p className="mt-2 text-sm text-green-700">
                  BVN: {kyc.bvn_masked}
                </p>
              )}

              <p className="mt-2 text-sm text-green-700">
                Your account is now KYC Tier 2.
              </p>
            </div>
          ) : (
            <>
              <div className="rounded-lg bg-blue-50 p-4">
                <p className="text-sm text-blue-800">
                  Your BVN is used only for identity
                  verification. We do not replace
                  the personal information you just
                  provided with provider test data.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="onboarding-bvn">
                  BVN
                </Label>

                <Input
                  id="onboarding-bvn"
                  value={bvn}
                  onChange={(e) => {
                    const value =
                      e.target.value
                        .replace(/\D/g, "")
                        .slice(0, 11);

                    setBvn(value);
                  }}
                  placeholder="Enter your 11-digit BVN"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={11}
                />

                <p className="text-xs text-gray-500">
                  Enter the 11-digit BVN linked
                  to your bank account.
                </p>
              </div>

              <Button
                type="button"
                className="w-full bg-blue-600 hover:bg-blue-700"
                onClick={
                  handleVerifyBvn
                }
                disabled={
                  verifying ||
                  bvn.length !== 11
                }
              >
                {verifying ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verifying BVN...
                  </>
                ) : (
                  "Verify BVN"
                )}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default OnboardingBvnPage;
