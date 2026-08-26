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

import {
  supabase,
} from "@/integrations/supabase/client";

import {
  useToast,
} from "@/hooks/use-toast";

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

  const [isLoading, setIsLoading] =
    useState(false);

  const [checkingSession, setCheckingSession] =
    useState(true);

  /*
   * ==========================================================
   * VERIFY RECOVERY SESSION
   * ==========================================================
   */

  useEffect(() => {
    let mounted = true;

    const verifyRecoverySession =
      async () => {
        try {
          /*
           * getSession() returns the current session and
           * refreshes it when necessary.
           */

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
            throw new Error(
              "No active recovery session."
            );
          }

          /*
           * Get the actual authenticated user.
           */

          const {
            data: userData,
            error: userError,
          } =
            await supabase.auth.getUser();

          if (
            userError ||
            !userData.user
          ) {
            throw new Error(
              "Recovery authentication could not be verified."
            );
          }

          /*
           * --------------------------------------------------
           * IMPORTANT
           *
           * Ask Supabase for the JWT claims.
           *
           * The recovery session should contain:
           *
           * amr: [
           *   {
           *     method: "recovery"
           *   }
           * ]
           *
           * --------------------------------------------------
           */

          const {
            data: claimsData,
            error: claimsError,
          } =
            await supabase.auth.getClaims(
              data.session.access_token
            );

          if (
            claimsError ||
            !claimsData?.claims
          ) {
            throw new Error(
              "Unable to verify recovery authentication."
            );
          }

          const claims =
            claimsData.claims as {
              amr?: Array<{
                method?: string;
              }>;
            };

          const isRecovery =
            Array.isArray(
              claims.amr
            ) &&
            claims.amr.some(
              (method) =>
                method?.method ===
                "recovery"
            );

          console.log(
            "Payment PIN recovery claims:",
            {
              amr: claims.amr,
              isRecovery,
            }
          );

          if (!isRecovery) {
            throw new Error(
              "Payment PIN reset requires a verified recovery session."
            );
          }

          /*
           * Recovery session is valid.
           */

          setCheckingSession(false);
        } catch (error: any) {
          if (!mounted) {
            return;
          }

          console.error(
            "Payment PIN recovery session verification failed:",
            error
          );

          toast({
            title:
              "Recovery session invalid",
            description:
              error?.message ||
              "Please request a new Payment PIN recovery code.",
            variant: "destructive",
          });

          /*
           * Remove temporary recovery email.
           */

          sessionStorage.removeItem(
            "iyanjupay_payment_pin_reset_email"
          );

          navigate(
            "/payment-pin",
            {
              replace: true,
            }
          );
        }
      };

    verifyRecoverySession();

    return () => {
      mounted = false;
    };
  }, [
    navigate,
    toast,
  ]);

  /*
   * ==========================================================
   * HANDLE PIN INPUT
   * ==========================================================
   */

  const cleanPin = (
    value: string
  ) => {
    return value
      .replace(/\D/g, "")
      .slice(0, 4);
  };

  /*
   * ==========================================================
   * RESET PAYMENT PIN
   * ==========================================================
   */

  const handleReset = async (
    e: React.FormEvent
  ) => {
    e.preventDefault();

    if (checkingSession) {
      return;
    }

    if (isLoading) {
      return;
    }

    /*
     * --------------------------------------------------------
     * Validate new PIN
     * --------------------------------------------------------
     */

    if (
      !/^\d{4}$/.test(newPin)
    ) {
      toast({
        title: "Invalid PIN",
        description:
          "Your Payment PIN must contain exactly 4 digits.",
        variant: "destructive",
      });

      return;
    }

    /*
     * --------------------------------------------------------
     * Validate confirmation
     * --------------------------------------------------------
     */

    if (
      !/^\d{4}$/.test(confirmPin)
    ) {
      toast({
        title:
          "Invalid confirmation PIN",
        description:
          "Your confirmation PIN must contain exactly 4 digits.",
        variant: "destructive",
      });

      return;
    }

    /*
     * --------------------------------------------------------
     * PIN match
     * --------------------------------------------------------
     */

    if (
      newPin !== confirmPin
    ) {
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
       * ------------------------------------------------------
       * Get current session
       * ------------------------------------------------------
       */

      const {
        data: sessionData,
        error: sessionError,
      } =
        await supabase.auth.getSession();

      if (
        sessionError ||
        !sessionData.session
      ) {
        throw new Error(
          "Your recovery session has expired. Please request a new code."
        );
      }

      /*
       * ------------------------------------------------------
       * Verify the CURRENT JWT claims again immediately
       * before the sensitive database operation.
       * ------------------------------------------------------
       */

      const {
        data: claimsData,
        error: claimsError,
      } =
        await supabase.auth.getClaims(
          sessionData.session.access_token
        );

      if (
        claimsError ||
        !claimsData?.claims
      ) {
        throw new Error(
          "Unable to verify your recovery session."
        );
      }

      const claims =
        claimsData.claims as {
          amr?: Array<{
            method?: string;
          }>;
        };

      const isRecovery =
        Array.isArray(
          claims.amr
        ) &&
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
       * ------------------------------------------------------
       * Call secure database RPC
       * ------------------------------------------------------
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

      /*
       * ------------------------------------------------------
       * Validate RPC result
       * ------------------------------------------------------
       */

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
       * ------------------------------------------------------
       * Clear sensitive values
       * ------------------------------------------------------
       */

      setNewPin("");
      setConfirmPin("");

      sessionStorage.removeItem(
        "iyanjupay_payment_pin_reset_email"
      );

      /*
       * ------------------------------------------------------
       * IMPORTANT
       *
       * Do NOT call signOut() here.
       *
       * The recovery session is being replaced/managed by
       * Supabase Auth. We don't want to destroy a normal
       * application session unexpectedly.
       * ------------------------------------------------------
       */

      toast({
        title:
          "Payment PIN reset successfully",
        description:
          "Your new Payment PIN is now active.",
      });

      /*
       * Return to Payment PIN page.
       */

      navigate(
        "/payment-pin",
        {
          replace: true,
        }
      );
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
   * ==========================================================
   * BACK
   * ==========================================================
   */

  const handleBack = () => {
    if (isLoading) {
      return;
    }

    navigate(
      "/payment-pin",
      {
        replace: true,
      }
    );
  };

  /*
   * ==========================================================
   * UI
   * ==========================================================
   */

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-blue-50 p-4">
      <Card className="w-full max-w-md shadow-lg">

        <CardHeader className="text-center">

          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
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

          {checkingSession ? (
            <div className="flex flex-col items-center justify-center py-10">

              <Loader2 className="h-8 w-8 animate-spin text-[#082A63]" />

              <p className="mt-3 text-sm text-gray-600">
                Verifying secure recovery session...
              </p>

            </div>
          ) : (
            <form
              onSubmit={handleReset}
              className="space-y-5"
            >

              {/* =================================================
                  NEW PIN
                  ================================================= */}

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
                        cleanPin(
                          e.target.value
                        )
                      )
                    }
                    placeholder="••••"
                    disabled={isLoading}
                    className="pr-12 text-center text-2xl tracking-[0.5em]"
                    required
                  />

                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() =>
                      setShowNewPin(
                        (current) =>
                          !current
                      )
                    }
                    disabled={isLoading}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 disabled:opacity-50"
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

                <p className="text-xs text-gray-500">
                  Enter exactly 4 digits.
                </p>

              </div>

              {/* =================================================
                  CONFIRM PIN
                  ================================================= */}

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
                        cleanPin(
                          e.target.value
                        )
                      )
                    }
                    placeholder="••••"
                    disabled={isLoading}
                    className="pr-12 text-center text-2xl tracking-[0.5em]"
                    required
                  />

                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() =>
                      setShowConfirmPin(
                        (current) =>
                          !current
                      )
                    }
                    disabled={isLoading}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 disabled:opacity-50"
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

                <p className="text-xs text-gray-500">
                  Re-enter your new 4-digit PIN.
                </p>

              </div>

              {/* =================================================
                  SECURITY NOTICE
                  ================================================= */}

              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">

                <div className="flex gap-3">

                  <ShieldCheck className="h-5 w-5 shrink-0 text-[#082A63]" />

                  <p className="text-sm text-blue-800">
                    Your PIN is securely hashed and
                    never stored in plain text.
                  </p>

                </div>

              </div>

              {/* =================================================
                  RESET BUTTON
                  ================================================= */}

              <Button
                type="submit"
                className="w-full bg-[#082A63] hover:bg-[#061F49]"
                disabled={
                  isLoading ||
                  !/^\d{4}$/.test(
                    newPin
                  ) ||
                  !/^\d{4}$/.test(
                    confirmPin
                  ) ||
                  newPin !==
                    confirmPin
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

              {/* =================================================
                  BACK
                  ================================================= */}

              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={handleBack}
                disabled={isLoading}
              >
                ← Back
              </Button>

            </form>
          )}

        </CardContent>

      </Card>
    </div>
  );
};

export default ResetPaymentPin;
