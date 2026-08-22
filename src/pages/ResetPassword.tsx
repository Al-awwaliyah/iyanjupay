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

const ResetPassword = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] =
    useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [checkingSession, setCheckingSession] =
    useState(true);

  useEffect(() => {
    const checkRecoverySession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          toast({
            title: "Recovery session expired",
            description:
              "Please request a new password recovery code.",
            variant: "destructive",
          });

          navigate("/forgot-password", {
            replace: true,
          });

          return;
        }
      } catch (error) {
        console.error(
          "Recovery session check error:",
          error,
        );

        navigate("/forgot-password", {
          replace: true,
        });
      } finally {
        setCheckingSession(false);
      }
    };

    void checkRecoverySession();
  }, [navigate, toast]);

  const handleResetPassword = async (
    e: React.FormEvent,
  ) => {
    e.preventDefault();

    if (newPassword.length < 8) {
      toast({
        title: "Password too short",
        description:
          "Your new password must contain at least 8 characters.",
        variant: "destructive",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: "Passwords do not match",
        description:
          "Make sure both password fields match.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const { error } =
        await supabase.auth.updateUser({
          password: newPassword,
        });

      if (error) {
        throw error;
      }

      await supabase.auth.signOut();

      sessionStorage.removeItem(
        "iyanjupay_recovery_email",
      );

      toast({
        title: "Password changed successfully",
        description:
          "Your password has been updated. Please sign in with your new password.",
      });

      navigate("/login", {
        replace: true,
      });
    } catch (error: any) {
      console.error(
        "Password update error:",
        error,
      );

      toast({
        title: "Unable to change password",
        description:
          error.message ||
          "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-blue-50 p-4">
        <p className="text-sm text-muted-foreground">
          Checking recovery session...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-blue-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-blue-700">
            Create New Password
          </CardTitle>

          <CardDescription>
            Enter your new password below.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form
            onSubmit={handleResetPassword}
            className="space-y-5"
          >
            <div className="space-y-2">
              <Label htmlFor="new-password">
                New Password
              </Label>

              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) =>
                  setNewPassword(
                    e.target.value,
                  )
                }
                autoComplete="new-password"
                placeholder="At least 8 characters"
                minLength={8}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">
                Re-enter New Password
              </Label>

              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) =>
                  setConfirmPassword(
                    e.target.value,
                  )
                }
                autoComplete="new-password"
                placeholder="Enter password again"
                minLength={8}
                required
              />
            </div>

            <Button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700"
              disabled={isLoading}
            >
              {isLoading
                ? "Updating Password..."
                : "Set New Password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default ResetPassword;
