import React, {
  useEffect,
  useState,
} from "react";

import { useNavigate } from "react-router-dom";

import {
  Eye,
  EyeOff,
  LockKeyhole,
  Loader2,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const ResetPaymentPin = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [newPin, setNewPin] =
    useState("");

  const [confirmPin, setConfirmPin] =
    useState("");

  const [showNewPin, setShowNewPin] =
    useState(false);

  const [showConfirmPin, setShowConfirmPin] =
    useState(false);

  const [sessionChecking, setSessionChecking] =
    useState(true);

  const [isLoading, setIsLoading] =
    useState(false);

  /*
   * ============================================================
   * VERIFY RECOVERY SESSION
   * ============================================================
   */

  useEffect(() => {
    let mounted = true;

    const verifyRecoverySession =
      async () => {
        try {
          /*
           * Get current session.
           */

          const {
            data: sessionData,
            error: sessionError,
          } =
            await supabase.auth.getSession();

          if (sessionError) {
            throw sessionError;
          }

          const session =
            sessionData.session;

          if (!session) {
            throw new Error(
              "No active recovery session."
            );
          }

          /*
           * Verify the actual JWT claims.
           */

          const {
            data: claimsData,
            error: claimsError,
          } =
            await supabase.auth.getClaims(
              session.access_token
            );

          if (claimsError) {
            throw claimsError;
          }

          const claims =
            claimsData?.claims as
              | {
                  amr?: Array<{
                    method?: string;
                  }>;
                  sub?: string;
                }
              | undefined;

          const isRecovery =
            Array.isArray(claims?.amr) &&
            claims.amr.some(
              (method) =>
                method?.method ===
                "recovery"
            );

          if (!isRecovery) {
            throw new Error(
              "Payment PIN reset requires a verified recovery session."
            );
          }

          /*
           * Make sure the session belongs
           * to a real authenticated user.
           */

          if (
            !claims?.sub ||
            claims.sub !== session.user.id
          ) {
            throw new Error(
              "Recovery user could not be verified."
            );
          }

          if (mounted) {
            setSessionChecking(false);
          }
        } catch (error: any) {
          console.error(
            "Payment PIN recovery session verification failed:",
            error
          );

          if (!mounted) {
            return;
          }

          toast({
            title:
              "Recovery session invalid",
            description:
              error?.message ||
              "Please request a new Payment PIN recovery code.",
            variant: "destructive",
          });

          await supabase.auth.signOut();

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
   * ============================================================
   * RESET PIN
   * ============================================================
   */

  const handleReset = async (
    e: React.FormEvent
  ) => {
    e.preventDefault();

    if (isLoading) {
      return;
    }

    if (!/^\d{4}$/.test(newPin)) {
      toast({
        title: "Invalid PIN",
        description:
          "Your Payment PIN must contain exactly 4 digits.",
        variant: "destructive",
      });

      return;
    }

    if (newPin !== confirmPin) {
      toast({
        title: "PINs do not match",
        description:
          "The new PIN and confirmation PIN must be identical.",
        variant: "destructive",
      });

      return;
    }

    setIsLoading(true);

    try {
      /*
       * ========================================================
       * GET FRESH SESSION
       * ========================================================
       */

      const {
        data: sessionData,
        error: sessionError,
      } =
        await supabase.auth.getSession();

      if (sessionError) {
        throw sessionError;
      }

      const session =
        sessionData.session;

      if (!session) {
        throw new Error(
          "Recovery session has expired."
        );
      }

      /*
       * ========================================================
       * VERIFY FRESH JWT
       * ========================================================
       */

      const {
        data: claimsData,
        error: claimsError,
      } =
        await supabase.auth.getClaims(
          session.access_token
        );

      if (claimsError) {
        throw claimsError;
      }

      const claims =
        claimsData?.claims as
          | {
              amr?: Array<{
                method?: string;
              }>;
            }
          | undefined;

      const isRecovery =
        Array.isArray(claims?.amr) &&
        claims.amr.some(
          (method) =>
            method?.method === "recovery"
        );

      if (!isRecovery) {
        throw new Error(
          "Payment PIN reset requires a verified recovery session."
        );
      }

      /*
       * ========================================================
       * CALL SECURE RPC
       * ========================================================
       */

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
       * ========================================================
       * CLEAR PIN VALUES
       * ========================================================
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
       * ========================================================
       * END RECOVERY SESSION
       * ========================================================
       */

      await supabase.auth.signOut();

      /*
       * ========================================================
       * RETURN TO LOGIN
       *
       * Because the recovery session was intentionally
       * terminated.
       * ========================================================
       */

      navigate("/", {
        replace: true,
      });
    } catch (error: any) {
      console.error(
        "Payment PIN reset failed:",
        error
      );

      toast({
        title:
          "Payment PIN reset failed",
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
   * ============================================================
   * LOADING
   * ============================================================
   */

  if (sessionChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-blue-50">
        <div className="flex items-center gap-3 text-[#082A63]">
          <Loader2 className="h-5 w-5 animate-spin" />

          <span className="font-medium">
            Verifying secure recovery session...
          </span>
        </div>
      </div>
    );
  }

  /*
   * ============================================================
   * UI
   * ============================================================
   */

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-blue-50 p-4">
      <Card className="w-full max-w-md shadow-lg">

        <CardHeader className="text-center">

          <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
            <ShieldCheck className="h-6 w-6 text-[#082A63]" />
          </div>

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

            {/* NEW PIN */}

            <div className="space-y-2">

              <Label htmlFor="new-payment-pin">
                New Payment PIN
              </Label>

              <div className="relative">

                <Input
                  id="new-payment-pin"
                  type={
                    showNewPin
                      ? "text"
                      : "password"
                  }
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
                  disabled={isLoading}
                  className="pr-12 text-center text-2xl tracking-[0.5em]"
                />

                <button
                  type="button"
                  onClick={() =>
                    setShowNewPin(
                      (value) => !value
                    )
                  }
                  disabled={isLoading}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"
                  aria-label={
                    showNewPin
                      ? "Hide PIN"
                      : "Show PIN"
                  }
                >
                  {showNewPin ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>

              </div>

            </div>

            {/* CONFIRM PIN */}

            <div className="space-y-2">

              <Label htmlFor="confirm-payment-pin">
                Confirm New Payment PIN
              </Label>

              <div className="relative">

                <Input
                  id="confirm-payment-pin"
                  type={
                    showConfirmPin
                      ? "text"
                      : "password"
                  }
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
                  disabled={isLoading}
                  className="pr-12 text-center text-2xl tracking-[0.5em]"
                />

                <button
                  type="button"
                  onClick={() =>
                    setShowConfirmPin(
                      (value) => !value
                    )
                  }
                  disabled={isLoading}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"
                  aria-label={
                    showConfirmPin
                      ? "Hide PIN"
                      : "Show PIN"
                  }
                >
                  {showConfirmPin ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>

              </div>

            </div>

            {/* SECURITY MESSAGE */}

            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">

              <div className="flex gap-3">

                <LockKeyhole className="h-5 w-5 text-[#082A63] shrink-0 mt-0.5" />

                <p className="text-sm text-blue-900">
                  Your new Payment PIN must contain
                  exactly 4 digits. Never share your
                  Payment PIN with anyone.
                </p>

              </div>

            </div>

            {/* SUBMIT */}

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
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Resetting Payment PIN...
                </>
              ) : (
                <>
                  <LockKeyhole className="h-4 w-4 mr-2" />
                  Reset Payment PIN
                </>
              )}
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
