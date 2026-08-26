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

  /*
   * ==========================================================
   * LOAD RECOVERY EMAIL
   * ==========================================================
   */

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

    setEmail(storedEmail);
  }, [navigate]);

  /*
   * ==========================================================
   * VERIFY RECOVERY OTP
   * ==========================================================
   */

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
          "Please request a new Payment PIN reset code.",
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
          "Enter the 6-digit code sent to your email.",
        variant: "destructive",
      });

      return;
    }

    setIsLoading(true);

    try {
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

      if (!data.session) {
        throw new Error(
          "Recovery session could not be established."
        );
      }

      /*
       * Confirm the authenticated user.
       */

      const {
        data: userData,
        error: userError,
      } =
        await supabase.auth.getUser();

      if (userError || !userData.user) {
        throw new Error(
          "Recovery authentication could not be verified."
        );
      }

      /*
       * Keep the recovery email only temporarily.
       */

      sessionStorage.removeItem(
        "iyanjupay_payment_pin_reset_email"
      );

      toast({
        title: "Email verified",
        description:
          "You can now create a new Payment PIN.",
      });

      navigate(
        "/reset-payment-pin",
        {
          replace: true,
        }
      );
    } catch (error: any) {
      console.error(
        "Payment PIN recovery OTP error:",
        error
      );

      toast({
        title: "Verification failed",
        description:
          error?.message ||
          "The recovery code is incorrect or expired.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  /*
   * ==========================================================
   * RESEND RECOVERY CODE
   * ==========================================================
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
        title: "Unable to resend code",
        description:
          error?.message ||
          "Please try again later.",
        variant: "destructive",
      });
    } finally {
      setResendLoading(false);
    }
  };

  /*
   * ==========================================================
   * UI
   * ==========================================================
   */

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-blue-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-blue-700">
            Verify Payment PIN Reset
          </CardTitle>

          <CardDescription>
            Enter the 6-digit recovery code sent to
          </CardDescription>

          <p className="text-sm font-semibold text-[#082A63] break-all">
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
