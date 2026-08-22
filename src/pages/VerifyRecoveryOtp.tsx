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

const VerifyRecoveryOtp = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);

  useEffect(() => {
    const storedEmail = sessionStorage.getItem(
      "iyanjupay_recovery_email",
    );

    if (!storedEmail) {
      navigate("/forgot-password", { replace: true });
      return;
    }

    setEmail(storedEmail);
  }, [navigate]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();

    const cleanOtp = otp.trim();

    if (!email) {
      toast({
        title: "Recovery session missing",
        description:
          "Please request a new password recovery code.",
        variant: "destructive",
      });
      navigate("/forgot-password");
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
      } = await supabase.auth.verifyOtp({
        email,
        token: cleanOtp,
        type: "recovery",
      });

      if (error) {
        throw error;
      }

      if (!data.session) {
        throw new Error(
          "Recovery session could not be established.",
        );
      }

      toast({
        title: "Email verified",
        description:
          "You can now create your new password.",
      });

      navigate("/reset-password", {
        replace: true,
      });
    } catch (error: any) {
      console.error(
        "Recovery OTP verification error:",
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
    if (!email) {
      navigate("/forgot-password");
      return;
    }

    setResendLoading(true);

    try {
      const { error } =
        await supabase.auth.resetPasswordForEmail(
          email,
          {
            redirectTo:
              `${window.location.origin}/reset-password`,
          },
        );

      if (error) {
        throw error;
      }

      toast({
        title: "New code sent",
        description:
          "A new password recovery code has been sent to your email.",
      });
    } catch (error: any) {
      console.error(
        "Recovery resend error:",
        error,
      );

      toast({
        title: "Unable to resend code",
        description:
          error.message ||
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
          <CardTitle className="text-2xl font-bold text-blue-700">
            Verify Your Email
          </CardTitle>

          <CardDescription>
            Enter the 6-digit recovery code sent to
          </CardDescription>

          <p className="text-sm font-semibold break-all">
            {email}
          </p>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleVerify} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="recovery-otp">
                Verification Code
              </Label>

              <Input
                id="recovery-otp"
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
                className="text-center text-xl tracking-[0.35em]"
                required
              />
            </div>

            <Button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700"
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
              variant="ghost"
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
                navigate("/forgot-password")
              }
              disabled={isLoading || resendLoading}
            >
              ← Change Email
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default VerifyRecoveryOtp;
