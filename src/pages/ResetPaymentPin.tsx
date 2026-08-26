import React, {
  useEffect,
  useState,
} from "react";

import { useNavigate } from "react-router-dom";

import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
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

import {
  Input,
} from "@/components/ui/input";

import {
  Label,
} from "@/components/ui/label";

import {
  useToast,
} from "@/hooks/use-toast";

import {
  supabase,
} from "@/integrations/supabase/client";

type PinInputProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

const PinInput = ({
  id,
  label,
  value,
  onChange,
  disabled = false,
}: PinInputProps) => {
  const [
    visible,
    setVisible,
  ] = useState(false);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const cleanValue =
      e.target.value
        .replace(/\D/g, "")
        .slice(0, 4);

    onChange(
      cleanValue
    );
  };

  return (
    <div className="space-y-2">

      <Label htmlFor={id}>
        {label}
      </Label>

      <div className="relative">

        <Input
          id={id}
          type={
            visible
              ? "text"
              : "password"
          }
          inputMode="numeric"
          autoComplete="new-password"
          maxLength={4}
          value={value}
          onChange={
            handleChange
          }
          placeholder="••••"
          disabled={disabled}
          className="pr-12 text-center text-2xl tracking-[0.5em]"
        />

        <button
          type="button"
          tabIndex={-1}
          onClick={() =>
            setVisible(
              current =>
                !current
            )
          }
          disabled={disabled}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 disabled:opacity-50"
          aria-label={
            visible
              ? "Hide PIN"
              : "Show PIN"
          }
        >

          {visible ? (
            <EyeOff className="h-5 w-5" />
          ) : (
            <Eye className="h-5 w-5" />
          )}

        </button>

      </div>

    </div>
  );
};

const ResetPaymentPin =
  () => {
    const navigate =
      useNavigate();

    const { toast } =
      useToast();

    const [newPin, setNewPin] =
      useState("");

    const [confirmPin, setConfirmPin] =
      useState("");

    const [isLoading, setIsLoading] =
      useState(false);

    const [authorized, setAuthorized] =
      useState(false);

    const [
      checkingAuthorization,
      setCheckingAuthorization,
    ] = useState(true);

    const [success, setSuccess] =
      useState(false);

    /*
     * ==========================================================
     * VERIFY RESET AUTHORIZATION
     * ==========================================================
     */

    useEffect(() => {
      const verifyAuthorization =
        async () => {
          try {
            const resetToken =
              sessionStorage.getItem(
                "iyanjupay_payment_pin_reset_token"
              );

            if (
              !resetToken
            ) {
              toast({
                title:
                  "Reset authorization missing",
                description:
                  "Please verify your Payment PIN reset code again.",
                variant:
                  "destructive",
              });

              navigate(
                "/payment-pin",
                {
                  replace: true,
                }
              );

              return;
            }

            /*
             * --------------------------------------------------
             * We don't trust the token merely because it exists.
             *
             * Ask the server to validate it.
             *
             * The Edge Function should accept:
             *
             * {
             *   action: "validate",
             *   reset_token: "..."
             * }
             *
             * --------------------------------------------------
             */

            const {
              data,
              error,
            } =
              await supabase.functions.invoke(
                "payment-pin-reset-verify",
                {
                  body: {
                    action:
                      "validate",
                    reset_token:
                      resetToken,
                  },
                }
              );

            if (
              error ||
              !data ||
              data.success !==
                true
            ) {
              throw new Error(
                data?.message ||
                  error?.message ||
                  "Payment PIN reset authorization is invalid or expired."
              );
            }

            setAuthorized(
              true
            );
          } catch (error: any) {
            console.error(
              "Payment PIN reset authorization verification failed:",
              error
            );

            sessionStorage.removeItem(
              "iyanjupay_payment_pin_reset_token"
            );

            toast({
              title:
                "Reset authorization expired",
              description:
                error?.message ||
                "Please request a new Payment PIN reset code.",
              variant:
                "destructive",
            });

            navigate(
              "/payment-pin",
              {
                replace: true,
              }
            );
          } finally {
            setCheckingAuthorization(
              false
            );
          }
        };

      verifyAuthorization();
    }, [
      navigate,
      toast,
    ]);

    /*
     * ==========================================================
     * RESET PAYMENT PIN
     * ==========================================================
     */

    const handleReset =
      async (
        e: React.FormEvent
      ) => {
        e.preventDefault();

        if (
          isLoading ||
          !authorized
        ) {
          return;
        }

        if (
          !/^\d{4}$/.test(
            newPin
          )
        ) {
          toast({
            title:
              "Invalid Payment PIN",
            description:
              "Your Payment PIN must contain exactly 4 digits.",
            variant:
              "destructive",
          });

          return;
        }

        if (
          newPin !==
          confirmPin
        ) {
          toast({
            title:
              "PINs do not match",
            description:
              "The new Payment PIN and confirmation PIN must be identical.",
            variant:
              "destructive",
          });

          return;
        }

        const resetToken =
          sessionStorage.getItem(
            "iyanjupay_payment_pin_reset_token"
          );

        if (
          !resetToken
        ) {
          toast({
            title:
              "Reset authorization missing",
            description:
              "Please restart the Payment PIN recovery process.",
            variant:
              "destructive",
          });

          navigate(
            "/payment-pin",
            {
              replace: true,
            }
          );

          return;
        }

        setIsLoading(
          true
        );

        try {
          /*
           * ----------------------------------------------------
           * Call the secure reset Edge Function.
           * ----------------------------------------------------
           *
           * The Edge Function should:
           *
           * 1. Verify the reset token.
           * 2. Verify expiry.
           * 3. Verify the authenticated user.
           * 4. Hash the new PIN.
           * 5. Update payment_pins.
           * 6. Invalidate the reset token.
           * ----------------------------------------------------
           */

          const {
            data,
            error,
          } =
            await supabase.functions.invoke(
              "payment-pin-reset-verify",
              {
                body: {
                  action:
                    "reset",
                  reset_token:
                    resetToken,
                  new_pin:
                    newPin,
                },
              }
            );

          if (error) {
            console.error(
              "Payment PIN reset function error:",
              error
            );

            throw new Error(
              error.message ||
                "Unable to reset Payment PIN."
            );
          }

          if (
            !data ||
            data.success !==
              true
          ) {
            throw new Error(
              data?.message ||
                "Unable to reset Payment PIN."
            );
          }

          /*
           * ----------------------------------------------------
           * Clear sensitive client-side state.
           * ----------------------------------------------------
           */

          setNewPin("");
          setConfirmPin("");

          sessionStorage.removeItem(
            "iyanjupay_payment_pin_reset_token"
          );

          sessionStorage.removeItem(
            "iyanjupay_payment_pin_reset_email"
          );

          setSuccess(
            true
          );

          toast({
            title:
              "Payment PIN reset successfully",
            description:
              "Your new Payment PIN is now active.",
          });

          /*
           * ----------------------------------------------------
           * Give the user a moment to see success, then return
           * to the normal Payment PIN page.
           * ----------------------------------------------------
           */

          window.setTimeout(
            () => {
              navigate(
                "/payment-pin",
                {
                  replace: true,
                }
              );
            },
            1200
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
            variant:
              "destructive",
          });
        } finally {
          setIsLoading(
            false
          );
        }
      };

    /*
     * ==========================================================
     * BACK
     * ==========================================================
     */

    const handleBack =
      () => {
        if (
          isLoading
        ) {
          return;
        }

        /*
         * Do not leave an active reset token behind when the
         * user intentionally abandons the reset screen.
         */

        sessionStorage.removeItem(
          "iyanjupay_payment_pin_reset_token"
        );

        navigate(
          "/payment-pin",
          {
            replace: true,
          }
        );
      };

    /*
     * ==========================================================
     * LOADING
     * ==========================================================
     */

    if (
      checkingAuthorization
    ) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-blue-50 p-4">

          <Card className="w-full max-w-md">

            <CardContent className="p-8">

              <div className="flex flex-col items-center justify-center text-center">

                <Loader2 className="h-8 w-8 text-[#082A63] animate-spin mb-4" />

                <p className="font-medium text-gray-900">
                  Verifying reset authorization...
                </p>

                <p className="text-sm text-gray-500 mt-1">
                  Please wait.
                </p>

              </div>

            </CardContent>

          </Card>

        </div>
      );
    }

    /*
     * ==========================================================
     * SUCCESS
     * ==========================================================
     */

    if (
      success
    ) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-blue-50 p-4">

          <Card className="w-full max-w-md">

            <CardContent className="p-8">

              <div className="flex flex-col items-center text-center">

                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-5">

                  <CheckCircle2 className="h-9 w-9 text-green-600" />

                </div>

                <h1 className="text-2xl font-bold text-gray-900">
                  Payment PIN Reset
                </h1>

                <p className="text-gray-600 mt-2">
                  Your Payment PIN has been
                  successfully reset.
                </p>

                <p className="text-sm text-gray-500 mt-4">
                  Returning to Payment PIN settings...
                </p>

              </div>

            </CardContent>

          </Card>

        </div>
      );
    }

    /*
     * ==========================================================
     * MAIN UI
     * ==========================================================
     */

    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-blue-50 p-4">

        <Card className="w-full max-w-md shadow-lg">

          <CardHeader>

            <div className="flex items-center gap-3 mb-3">

              <div className="w-11 h-11 rounded-full bg-blue-100 flex items-center justify-center">

                <KeyRound className="h-5 w-5 text-blue-700" />

              </div>

              <div>

                <CardTitle className="text-2xl font-bold text-[#082A63]">
                  Reset Payment PIN
                </CardTitle>

                <CardDescription>
                  Create your new 4-digit Payment PIN.
                </CardDescription>

              </div>

            </div>

          </CardHeader>

          <CardContent>

            <form
              onSubmit={
                handleReset
              }
              className="space-y-5"
            >

              {/* SECURITY */}

              <div className="rounded-lg border bg-green-50 p-4">

                <div className="flex items-start gap-3">

                  <ShieldCheck className="h-5 w-5 text-green-700 mt-0.5 shrink-0" />

                  <div>

                    <p className="text-sm font-medium text-green-900">
                      Reset authorization verified
                    </p>

                    <p className="text-xs text-green-800 mt-1">
                      You can now create a new Payment PIN.
                    </p>

                  </div>

                </div>

              </div>

              {/* NEW PIN */}

              <PinInput
                id="new-payment-pin"
                label="New Payment PIN"
                value={newPin}
                onChange={
                  setNewPin
                }
                disabled={
                  isLoading
                }
              />

              <p className="text-xs text-gray-500 -mt-2">
                Your Payment PIN must contain
                exactly 4 digits.
              </p>

              {/* CONFIRM PIN */}

              <PinInput
                id="confirm-payment-pin"
                label="Confirm New Payment PIN"
                value={
                  confirmPin
                }
                onChange={
                  setConfirmPin
                }
                disabled={
                  isLoading
                }
              />

              {/* RESET BUTTON */}

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
                    Resetting PIN...
                  </>
                ) : (
                  <>
                    <KeyRound className="h-4 w-4 mr-2" />
                    Reset Payment PIN
                  </>
                )}

              </Button>

              {/* BACK */}

              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={
                  handleBack
                }
                disabled={
                  isLoading
                }
              >

                <ArrowLeft className="h-4 w-4 mr-2" />

                Back

              </Button>

            </form>

          </CardContent>

        </Card>

      </div>
    );
  };

export default ResetPaymentPin;
