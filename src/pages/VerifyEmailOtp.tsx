import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
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

const VerifyEmailOtp = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);

  useEffect(() => {
    const stateEmail =
      (location.state as { email?: string } | null)?.email;

    const storedEmail =
      sessionStorage.getItem(
        "iyanjupay_signup_email",
      );

    const signupEmail =
      stateEmail || storedEmail || "";

    if (!signupEmail) {
      navigate("/", { replace: true });
      return;
    }

    setEmail(signupEmail);
    sessionStorage.setItem(
      "iyanjupay_signup_email",
      signupEmail,
    );
  }, [location.state, navigate]);

  const handleVerifyEmail = async (
    e: React.FormEvent,
  ) => {
    e.preventDefault();

    const normalizedEmail =
      email.trim().toLowerCase();

    const enteredCode = otp.trim();

    if (!normalizedEmail) {
      toast({
        title: "Email missing",
        description:
          "Please start the verification process again.",
        variant: "destructive",
      });

      navigate("/", { replace: true });
      return;
    }

    if (!/^\d{6}$/.test(enteredCode)) {
      toast({
        title: "Invalid verification code",
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
      } = await supabase.auth.verifyOtp({
        email: normalizedEmail,
        token: enteredCode,
        type: "email",
      });

      if (error) {
        throw error;
      }

      if (!data.user) {
        throw new Error(
          "Email verification could not be completed.",
        );
      }

      sessionStorage.removeItem(
        "iyanjupay_signup_email",
      );

      toast({
        title: "Email verified successfully",
        description:
          "Your email address has been verified.",
      });

      navigate("/", {
        replace: true,
      });
    } catch (error: any) {
      console.error(
        "Email OTP verification error:",
        error,
      );

      toast({
        title: "Verification failed",
        description:
          error.message ||
          "The verification code is incorrect or expired.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    const normalizedEmail =
      email.trim().toLowerCase();

    if (!normalizedEmail) {
      return;
    }

    setResendLoading(true);

    try {
      const { error } =
        await supabase.auth.resend({
          type: "signup",
          email: normalizedEmail,
        });

      if (error) {
        throw error;
      }

      setOtp("");

      toast({
        title: "New verification code sent",
        description:
          "Check your email for the new 6-digit code.",
      });
    } catch (error: any) {
      console.error(
        "Email OTP resend error:",
        error,
      );

      toast({
        title: "Unable to resend code",
        description:
          error.message ||
          "Please try again.",
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
          <CardTitle className="text-2xl font-bold text-blue-700">
            Verify Your Email
          </CardTitle>

          <CardDescription>
            Enter the 6-digit verification code sent to
          </CardDescription>

          <p className="mt-1 text-sm font-semibold text-[#082A63] break-all">
            {email}
          </p>
        </CardHeader>

        <CardContent>
          <form
            onSubmit={handleVerifyEmail}
            className="space-y-5"
          >
            <div className="space-y-2">
              <Label htmlFor="email-otp">
                Verification Code
              </Label>

              <Input
                id="email-otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={otp}
                onChange={(e) =>
                  setOtp(
                    e.target.value
                      .replace(/\D/g, "")
                      .slice(0, 6),
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
                : "Verify Email"}
            </Button>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleResend}
              disabled={
                isLoading || resendLoading
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
                navigate("/", {
                  replace: true,
                })
              }
              disabled={
                isLoading || resendLoading
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

export default VerifyEmailOtp;
