import React, {
  useEffect,
  useState,
} from "react";

import { useNavigate } from "react-router-dom";

import {
  ArrowLeft,
  Loader2,
  MailCheck,
  RefreshCw,
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

const VerifyPaymentPinResetOtp =
  () => {
    const navigate =
      useNavigate();

    const { toast } =
      useToast();

    const [email, setEmail] =
      useState("");

    const [otp, setOtp] =
      useState("");

    const [isLoading, setIsLoading] =
      useState(false);

    const [resendLoading, setResendLoading] =
      useState(false);

    /*
     * ==========================================================
     * LOAD EMAIL
     * ==========================================================
     */

    useEffect(() => {
      const storedEmail =
        sessionStorage.getItem(
          "iyanjupay_payment_pin_reset_email"
        );

      if (!storedEmail) {
        toast({
          title:
            "Reset session missing",
          description:
            "Please start the Payment PIN reset process again.",
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

      setEmail(
        storedEmail
      );
    }, [
      navigate,
      toast,
    ]);

    /*
     * ==========================================================
     * VERIFY OTP
     * ==========================================================
     */

    const handleVerify =
      async (
        e: React.FormEvent
      ) => {
        e.preventDefault();

        const cleanOtp =
          otp
            .trim();

        if (
          !/^\d{6}$/.test(
            cleanOtp
          )
        ) {
          toast({
            title:
              "Invalid code",
            description:
              "Enter the 6-digit code sent to your email.",
            variant:
              "destructive",
          });

          return;
        }

        if (!email) {
          toast({
            title:
              "Reset session missing",
            description:
              "Please start the Payment PIN reset process again.",
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

        setIsLoading(true);

        try {
          /*
           * ----------------------------------------------------
           * Call custom verification Edge Function.
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
                  otp: cleanOtp,
                },
              }
            );

          if (error) {
            console.error(
              "Payment PIN OTP verification error:",
              error
            );

            throw new Error(
              error.message ||
                "Unable to verify the reset code."
            );
          }

          if (
            !data ||
            data.success !== true
          ) {
            throw new Error(
              data?.message ||
                "The reset code is incorrect or expired."
            );
          }

          /*
           * ----------------------------------------------------
           * The Edge Function must return a short-lived
           * reset authorization token.
           * ----------------------------------------------------
           */

          const resetToken =
            data.reset_token;

          if (
            !resetToken ||
            typeof resetToken !==
              "string"
          ) {
            throw new Error(
              "Reset authorization could not be established."
            );
          }

          /*
           * ----------------------------------------------------
           * Store the short-lived reset token.
           *
           * It is temporary authorization, not the PIN itself.
           * ----------------------------------------------------
           */

          sessionStorage.setItem(
            "iyanjupay_payment_pin_reset_token",
            resetToken
          );

          /*
           * Email is no longer needed after verification.
           */

          sessionStorage.removeItem(
            "iyanjupay_payment_pin_reset_email"
          );

          setOtp("");

          toast({
            title:
              "Code verified",
            description:
              "You can now create your new Payment PIN.",
          });

          navigate(
            "/reset-payment-pin",
            {
              replace: true,
            }
          );
        } catch (error: any) {
          console.error(
            "Payment PIN recovery verification failed:",
            error
          );

          toast({
            title:
              "Verification failed",
            description:
              error?.message ||
              "The reset code is incorrect or expired.",
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
     * RESEND OTP
     * ==========================================================
     */

    const handleResend =
      async () => {
        if (
          resendLoading ||
          isLoading
        ) {
          return;
        }

        setResendLoading(
          true
        );

        try {
          /*
           * The request function identifies the authenticated
           * user itself.
           */

          const {
            data,
            error,
          } =
            await supabase.functions.invoke(
              "payment-pin-reset-request",
              {
                body: {},
              }
            );

          if (error) {
            console.error(
              "Payment PIN reset resend error:",
              error
            );

            throw new Error(
              error.message ||
                "Unable to resend the reset code."
            );
          }

          if (
            !data ||
            data.success !== true
          ) {
            throw new Error(
              data?.message ||
                "Unable to resend the reset code."
            );
          }

          setOtp("");

          toast({
            title:
              "New reset code sent",
            description:
              "A new 6-digit code has been sent to your email.",
          });
        } catch (error: any) {
          console.error(
            "Payment PIN reset resend failed:",
            error
          );

          toast({
            title:
              "Unable to resend code",
            description:
              error?.message ||
              "Please try again later.",
            variant:
              "destructive",
          });
        } finally {
          setResendLoading(
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
          isLoading ||
          resendLoading
        ) {
          return;
        }

        navigate(
          "/payment-pin",
          {
            replace: true,
          }
        );
      };

    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-blue-50 p-4">

        <Card className="w-full max-w-md shadow-lg">

          <CardHeader className="text-center">

            <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center">
              <MailCheck className="h-7 w-7 text-blue-700" />
            </div>

            <CardTitle className="text-2xl font-bold text-[#082A63]">
              Verify Payment PIN Reset
            </CardTitle>

            <CardDescription className="mt-2">
              Enter the 6-digit verification
              code sent to your account email.
            </CardDescription>

            {email && (
              <p className="mt-2 text-sm font-semibold text-[#082A63] break-all">
                {email}
              </p>
            )}

          </CardHeader>

          <CardContent>

            <form
              onSubmit={
                handleVerify
              }
              className="space-y-5"
            >

              {/* SECURITY */}

              <div className="rounded-lg border bg-blue-50 p-3">
                <div className="flex items-start gap-3">

                  <ShieldCheck className="h-5 w-5 text-blue-700 mt-0.5 shrink-0" />

                  <p className="text-xs text-blue-800">
                    For your security, this code
                    can only be used for your
                    Payment PIN reset and expires
                    after a short period.
                  </p>

                </div>
              </div>

              {/* OTP */}

              <div className="space-y-2">

                <Label htmlFor="payment-pin-reset-otp">
                  Verification Code
                </Label>

                <Input
                  id="payment-pin-reset-otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={otp}
                  onChange={(
                    e
                  ) =>
                    setOtp(
                      e.target.value
                        .replace(
                          /\D/g,
                          ""
                        )
                        .slice(
                          0,
                          6
                        )
                    )
                  }
                  placeholder="Enter 6-digit code"
                  className="text-center text-2xl tracking-[0.4em]"
                  disabled={
                    isLoading ||
                    resendLoading
                  }
                  required
                />

              </div>

              {/* VERIFY */}

              <Button
                type="submit"
                className="w-full bg-[#082A63] hover:bg-[#061F49]"
                disabled={
                  isLoading ||
                  resendLoading ||
                  !/^\d{6}$/.test(
                    otp
                  )
                }
              >

                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  "Verify Code"
                )}

              </Button>

              {/* RESEND */}

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={
                  handleResend
                }
                disabled={
                  isLoading ||
                  resendLoading
                }
              >

                {resendLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Resend Code
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
                  isLoading ||
                  resendLoading
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

export default VerifyPaymentPinResetOtp;
