import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const VerifyPaymentPinResetOtp = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");

  const [isLoading, setIsLoading] =
    useState(false);

  const [resendLoading, setResendLoading] =
    useState(false);

  useEffect(() => {
    const storedEmail =
      sessionStorage.getItem(
        "iyanjupay_payment_pin_reset_email"
      );

    if (!storedEmail) {
      navigate("/payment-pin", {
        replace: true,
      });

      return;
    }

    setEmail(
      storedEmail.trim().toLowerCase()
    );
  }, [navigate]);

  const handleVerify = async (
    e: React.FormEvent
  ) => {
    e.preventDefault();

    const cleanEmail =
      email.trim().toLowerCase();

    const cleanOtp =
      otp.trim();

    if (!cleanEmail) {
      toast({
        title: "Recovery session missing",
        description:
          "Please start the Payment PIN reset process again.",
        variant: "destructive",
      });

      navigate("/payment-pin", {
        replace: true,
      });

      return;
    }

    if (!/^\d{6}$/.test(cleanOtp)) {
      toast({
        title: "Invalid code",
        description:
          "Enter the 6-digit recovery code sent to your email.",
        variant: "destructive",
      });

      return;
    }

    setIsLoading(true);

    try {
      /*
       * ========================================================
       * VERIFY RECOVERY OTP
       * ========================================================
       */

      const {
        data,
        error,
      } =
        await supabase.auth.verifyOtp({
          email: cleanEmail,
          token: cleanOtp,
          type: "recovery",
        });

      if (error) {
        throw error;
      }

      /*
       * ========================================================
       * IMPORTANT
       *
       * verifyOtp() should return the new recovery session.
       * Do not rely only on the old session.
       * ========================================================
       */

      if (!data.session) {
        throw new Error(
          "Recovery session could not be established."
        );
      }

      /*
       * ========================================================
       * FORCE THE CLIENT TO USE THE NEW SESSION
       * ========================================================
       */

      await supabase.auth.setSession({
        access_token:
          data.session.access_token,

        refresh_token:
          data.session.refresh_token,
      });

      /*
       * ========================================================
       * VERIFY JWT CLAIMS
       * ========================================================
       */

      const {
        data: claimsData,
        error: claimsError,
      } =
        await supabase.auth.getClaims(
          data.session.access_token
        );

      if (claimsError) {
        console.error(
          "Recovery claims error:",
          claimsError
        );

        throw new Error(
          "Recovery authentication could not be verified."
        );
      }

      const claims =
        claimsData?.claims as
          | {
              amr?: Array<{
                method?: string;
                timestamp?: number;
              }>;
              sub?: string;
              email?: string;
            }
          | undefined;

      const isRecovery =
        Array.isArray(claims?.amr) &&
        claims.amr.some(
          (method) =>
            method?.method === "recovery"
        );

      if (!isRecovery) {
        console.error(
          "Unexpected recovery claims:",
          claims
        );

        throw new Error(
          "Payment PIN recovery authentication could not be verified."
        );
      }

      /*
       * ========================================================
       * VERIFY USER IDENTITY
       * ========================================================
       */

      if (
        !claims?.sub ||
        claims.sub !==
          data.session.user.id
      ) {
        throw new Error(
          "Recovery user identity could not be verified."
        );
      }

      /*
       * ========================================================
       * CLEAR TEMPORARY EMAIL
       * ========================================================
       */

      sessionStorage.removeItem(
        "iyanjupay_payment_pin_reset_email"
      );

      /*
       * ========================================================
       * SUCCESS
       * ========================================================
       */

      toast({
        title: "Email verified",
        description:
          "Your recovery session has been verified. You can now create a new Payment PIN.",
      });

      navigate(
        "/reset-payment-pin",
        {
          replace: true,
        }
      );
    } catch (error: any) {
      console.error(
        "Payment PIN recovery session verification failed:",
        error
      );

      toast({
        title:
          "Verification failed",
        description:
          error?.message ||
          "The recovery code is incorrect, expired, or could not establish a secure recovery session.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  /*
   * ============================================================
   * RESEND
   * ============================================================
   */

  const handleResend = async () => {
    const cleanEmail =
      email.trim().toLowerCase();

    if (!cleanEmail) {
      navigate("/payment-pin", {
        replace: true,
      });

      return;
    }

    setResendLoading(true);

    try {
      const {
        error,
      } =
        await supabase.auth.resetPasswordForEmail(
          cleanEmail,
          {
            redirectTo:
              `${window.location.origin}/reset-payment-pin`,
          }
        );

      if (error) {
        throw error;
      }

      setOtp("");

      toast({
        title: "New code sent",
        description:
          "A new Payment PIN recovery code has been sent to your email.",
      });
    } catch (error: any) {
      console.error(
        "Payment PIN recovery resend error:",
        error
      );

      toast({
        title:
          "Unable to resend code",
        description:
          error?.message ||
          "Please try again later.",
        variant: "destructive",
      });
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-blue-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-[#082A63]">
            Verify Payment PIN Reset
          </CardTitle>

          <CardDescription>
            Enter the 6-digit recovery code sent to
          </CardDescription>

          <p className="mt-1 text-sm font-semibold text-[#082A63] break-all">
            {email}
          </p>
        </CardHeader>

        <CardContent>
          <form
            onSubmit={handleVerify}
            className="space-y-5"
          >
            <div className="space-y-2">
              <Label htmlFor="payment-pin-reset-otp">
                Recovery Code
              </Label>

              <Input
                id="payment-pin-reset-otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={otp}
                onChange={(e) =>
                  setOtp(
                    e.target.value
                      .replace(/\D/g, "")
                      .slice(0, 6)
                  )
                }
                placeholder="Enter 6-digit code"
                className="text-center text-2xl tracking-[0.4em]"
                required
              />
            </div>

            <Button
              type="submit"
              className="w-full bg-[#082A63] hover:bg-[#061F49]"
              disabled={
                isLoading ||
                !/^\d{6}$/.test(otp)
              }
            >
              {isLoading
                ? "Verifying..."
                : "Verify Code"}
            </Button>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleResend}
              disabled={
                isLoading ||
                resendLoading
              }
            >
              {resendLoading
                ? "Sending..."
                : "Resend Code"}
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() =>
                navigate("/payment-pin", {
                  replace: true,
                })
              }
              disabled={
                isLoading ||
                resendLoading
              }
            >
              ← Back
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default VerifyPaymentPinResetOtp;
