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

  const [loading, setLoading] =
    useState(true);

  const [verifying, setVerifying] =
    useState(false);

  const [bvn, setBvn] =
    useState("");

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
            // Keep original error.
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
        // ------------------------------------------------------
        // GET AUTHENTICATED USER
        // ------------------------------------------------------

        const {
          data: { user },
          error: userError,
        } =
          await supabase.auth.getUser();

        if (userError) {
          throw userError;
        }

        // ------------------------------------------------------
        // NO USER
        // ------------------------------------------------------

        if (!user) {
          navigate("/", {
            replace: true,
          });

          return;
        }

        // ------------------------------------------------------
        // GET CURRENT KYC STATUS
        // ------------------------------------------------------

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
          )
            .trim()
            .toLowerCase();

        // ------------------------------------------------------
        // ALREADY COMPLETED
        //
        // If the user's BVN has already been verified,
        // NEVER show this page.
        //
        // Go directly to dashboard.
        // ------------------------------------------------------

        if (
          verified &&
          level >= 2 &&
          status === "verified"
        ) {
          navigate("/dashboard", {
            replace: true,
          });

          return;
        }

        // ------------------------------------------------------
        // BVN STILL REQUIRED
        // ------------------------------------------------------

        setKyc({
          verified: false,

          kyc_level: level,

          kyc_status: status,

          bvn_masked:
            data?.bvn_masked ??
            null,

          bvn_verified_at:
            data?.bvn_verified_at ??
            null,
        });
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
      // --------------------------------------------------------
      // NORMALIZE BVN
      // --------------------------------------------------------

      const digits =
        bvn
          .replace(/\D/g, "")
          .slice(0, 11);

      // --------------------------------------------------------
      // VALIDATE BVN
      // --------------------------------------------------------

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

      // --------------------------------------------------------
      // START VERIFICATION
      // --------------------------------------------------------

      setVerifying(true);

      try {
        // ======================================================
        // STEP 1 — VERIFY BVN
        // ======================================================

        const result =
          await invokeBvn({
            action: "verify",
            bvn: digits,
          });

        // ------------------------------------------------------
        // VERIFY RESPONSE
        // ------------------------------------------------------

        if (
          !result?.success ||
          !result?.verified
        ) {
          throw new Error(
            result?.error ||
              "BVN verification failed.",
          );
        }

        // ======================================================
        // STEP 2 — CONFIRM DATABASE STATE
        // ======================================================
        //
        // Do not redirect simply because the provider returned
        // success.
        //
        // Confirm that our own database now says the user is
        // verified and KYC Tier 2.
        //
        // ======================================================

        const status =
          await invokeBvn({
            action: "status",
          });

        const savedVerified =
          Boolean(status?.verified);

        const savedLevel =
          Number(
            status?.kyc_level ?? 0,
          );

        const savedStatus =
          String(
            status?.kyc_status ?? "",
          )
            .trim()
            .toLowerCase();

        if (
          !savedVerified ||
          savedLevel < 2 ||
          savedStatus !==
            "verified"
        ) {
          throw new Error(
            "BVN verification succeeded, but the saved KYC status could not be confirmed.",
          );
        }

        // ======================================================
        // STEP 3 — UPDATE LOCAL STATE
        // ======================================================

        setKyc({
          verified: true,

          kyc_level:
            savedLevel,

          kyc_status:
            savedStatus,

          bvn_masked:
            status?.bvn_masked ??
            `******${digits.slice(-4)}`,

          bvn_verified_at:
            status?.bvn_verified_at ??
            new Date().toISOString(),
        });

        // Clear BVN from the form.
        setBvn("");

        // ======================================================
        // STEP 4 — SUCCESS MESSAGE
        // ======================================================

        toast({
          title:
            "BVN verified successfully",

          description:
            "Your IyanjuPay account is now fully verified.",
        });

        // ======================================================
        // STEP 5 — COMPLETE ONBOARDING
        // ======================================================
        //
        // CRITICAL:
        //
        // Go directly to dashboard.
        //
        // Do NOT:
        //   navigate("/")
        //
        // Do NOT:
        //   navigate("/onboarding")
        //
        // Do NOT:
        //   show another onboarding screen.
        //
        // ======================================================

        navigate("/dashboard", {
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
  // LOADING SCREEN
  // ==========================================================
  //
  // This is only shown while the app is determining whether
  // BVN verification is required.
  //
  // If already verified, navigation to dashboard happens
  // immediately after the status request.
  //
  // ==========================================================

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-blue-50 p-4">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-green-600" />

          <p className="text-sm text-gray-600">
            Loading...
          </p>
        </div>
      </div>
    );
  }

  // ==========================================================
  // BVN VERIFICATION PAGE
  // ==========================================================

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-blue-50 p-4">
      <Card className="w-full max-w-lg">
        {/* ====================================================
            HEADER
        ==================================================== */}

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

        {/* ====================================================
            CONTENT
        ==================================================== */}

        <CardContent className="space-y-6">

          {/* ==================================================
              INFORMATION MESSAGE
          ================================================== */}

          <div className="rounded-lg bg-blue-50 p-4">
            <p className="text-sm leading-relaxed text-blue-800">
              Your BVN is used only for identity
              verification. Your personal
              information remains unchanged after
              verification.
            </p>
          </div>

          {/* ==================================================
              BVN INPUT
          ================================================== */}

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
              disabled={verifying}
            />

            <p className="text-xs text-gray-500">
              Enter the 11-digit BVN linked to
              your bank account.
            </p>

            {/* ==================================================
                BVN DIGIT COUNTER
            ================================================== */}

            <div className="flex justify-end">
              <span className="text-xs text-gray-400">
                {bvn.length}/11
              </span>
            </div>
          </div>

          {/* ==================================================
              VERIFY BUTTON
          ================================================== */}

          <Button
            type="button"
            className="w-full bg-blue-600 hover:bg-blue-700"
            onClick={handleVerifyBvn}
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

        </CardContent>
      </Card>
    </div>
  );
};

export default OnboardingBvnPage;
