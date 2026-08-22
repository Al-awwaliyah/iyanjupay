import React, { useState } from "react";
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

const ForgotPassword = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      toast({
        title: "Email required",
        description: "Enter the email address associated with your account.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        normalizedEmail,
        {
          redirectTo: `${window.location.origin}/reset-password`,
        },
      );

      if (error) {
        throw error;
      }

      // Keep the email only for the current recovery flow.
      sessionStorage.setItem(
        "iyanjupay_recovery_email",
        normalizedEmail,
      );

      toast({
        title: "Verification code sent",
        description:
          "Check your email for the password recovery code.",
      });

      navigate("/verify-recovery-otp");
    } catch (error: any) {
      console.error("Forgot password error:", error);

      toast({
        title: "Unable to send code",
        description:
          error.message ||
          "Please check the email address and try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-blue-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-blue-700">
            IyanjuPay
          </CardTitle>

          <CardDescription>
            Reset your password securely
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSendCode} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="forgot-email">
                Email Address
              </Label>

              <Input
                id="forgot-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </div>

            <Button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700"
              disabled={isLoading}
            >
              {isLoading
                ? "Sending Code..."
                : "Send Verification Code"}
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => navigate("/login")}
              disabled={isLoading}
            >
              ← Back to Sign In
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default ForgotPassword;
