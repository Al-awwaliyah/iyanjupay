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

const ResetPaymentPin = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] =
    useState("");

  const [isLoading, setIsLoading] =
    useState(false);

  /*
   * ==========================================================
   * VERIFY RECOVERY SESSION
   * ==========================================================
   */

  useEffect(() => {
    let mounted = true;

    const verifyRecoverySession =
      async () => {
        const {
          data,
          error,
        } =
          await supabase.auth.getSession();

        if (!mounted) {
          return;
        }

        if (
          error ||
          !data.session
        ) {
          toast({
            title:
              "Recovery session expired",
            description:
              "Please request a new Payment PIN reset code.",
            variant: "destructive",
          });

          navigate("/payment-pin", {
            replace: true,
          });
        }
      };

    verifyRecoverySession();

    return () => {
      mounted = false;
    };
  }, [navigate, toast]);

  /*
   * ==========================================================
   * RESET PAYMENT PIN
   * ==========================================================
   */

  const handleReset = async (
    e: React.FormEvent
  ) => {
    e.preventDefault();

    if (!/^\d{4}$/.test(newPin)) {
      toast({
        title: "Invalid PIN",
        description:
          "Payment PIN must contain exactly 4 digits.",
        variant: "destructive",
      });

      return;
    }

    if (newPin !== confirmPin) {
      toast({
        title: "PINs do not match",
        description:
          "Make sure both PIN fields contain the same 4 digits.",
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
        await supabase.rpc(
          "reset_payment_pin",
          {
            _new_pin: newPin,
          }
        );

      if (error) {
        console.error(
          "Payment PIN reset RPC error:",
          error
        );

        throw new Error(
          error.message ||
            "Unable to reset Payment PIN."
        );
      }

      if (
        !data ||
        data.success !== true
      ) {
        throw new Error(
          data?.message ||
            "Unable to reset Payment PIN."
        );
      }

      /*
       * Clear the PIN fields immediately.
       */

      setNewPin("");
      setConfirmPin("");

      toast({
        title:
          "Payment PIN reset successfully",
        description:
          "Your new Payment PIN is now active.",
      });

      /*
       * End the recovery session.
       *
       * This is important because the recovery
       * session was only needed for the reset.
       */

      await supabase.auth.signOut();

      navigate("/payment-pin", {
        replace: true,
      });
    } catch (error: any) {
      console.error(
        "Payment PIN reset failed:",
        error
      );

      toast({
        title: "Payment PIN reset failed",
        description:
          error?.message ||
          "Unable to reset your Payment PIN.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
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
          <CardTitle className="text-2xl font-bold text-[#082A63]">
            Reset Payment PIN
          </CardTitle>

          <CardDescription>
            Create a new 4-digit Payment PIN.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form
            onSubmit={handleReset}
            className="space-y-5"
          >
            <div className="space-y-2">
              <Label htmlFor="new-payment-pin">
                New Payment PIN
              </Label>

              <Input
                id="new-payment-pin"
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                maxLength={4}
                value={newPin}
                onChange={(e) =>
                  setNewPin(
                    e.target.value
                      .replace(/\D/g, "")
                      .slice(0, 4)
                  )
                }
                placeholder="••••"
                className="text-center text-2xl tracking-[0.5em]"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-payment-pin">
                Confirm New Payment PIN
              </Label>

              <Input
                id="confirm-payment-pin"
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                maxLength={4}
                value={confirmPin}
                onChange={(e) =>
                  setConfirmPin(
                    e.target.value
                      .replace(/\D/g, "")
                      .slice(0, 4)
                  )
                }
                placeholder="••••"
                className="text-center text-2xl tracking-[0.5em]"
                required
              />
            </div>

            <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
              Your Payment PIN must contain
              exactly 4 digits.
            </div>

            <Button
              type="submit"
              className="w-full bg-[#082A63] hover:bg-[#061F49]"
              disabled={
                isLoading ||
                !/^\d{4}$/.test(newPin) ||
                !/^\d{4}$/.test(confirmPin) ||
                newPin !== confirmPin
              }
            >
              {isLoading
                ? "Resetting..."
                : "Reset Payment PIN"}
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
              disabled={isLoading}
            >
              ← Back
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default ResetPaymentPin;
