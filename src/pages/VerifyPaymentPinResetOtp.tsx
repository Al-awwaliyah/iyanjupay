import React, {
  useEffect,
  useState,
} from "react";

import { useNavigate } from "react-router-dom";

import {
  ArrowLeft,
  Loader2,
  ShieldCheck,
  MailCheck,
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

import { useToast } from "@/hooks/use-toast";

import { supabase } from "@/integrations/supabase/client";


const VerifyPaymentPinResetOtp = () => {

  const navigate = useNavigate();

  const { toast } =
    useToast();


  const [email, setEmail] =
    useState("");

  const [challengeId, setChallengeId] =
    useState("");

  const [otp, setOtp] =
    useState("");

  const [isLoading, setIsLoading] =
    useState(false);

  const [resendLoading, setResendLoading] =
    useState(false);


  /*
   * ==========================================================
   * LOAD RECOVERY INFORMATION
   * ==========================================================
   */

  useEffect(() => {

    const storedEmail =
      sessionStorage.getItem(
        "iyanjupay_payment_pin_reset_email"
      );

    const storedChallengeId =
      sessionStorage.getItem(
        "iyanjupay_payment_pin_reset_challenge_id"
      );


    if (
      !storedEmail ||
      !storedChallengeId
    ) {

      toast({
        title:
          "Recovery request missing",
        description:
          "Please start the Payment PIN reset process again.",
        variant: "destructive",
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

    setChallengeId(
      storedChallengeId
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

  const handleVerify = async (
    event: React.FormEvent
  ) => {

    event.preventDefault();


    const cleanOtp =
      otp.trim();


    if (
      !challengeId
    ) {

      toast({
        title:
          "Recovery request missing",
        description:
          "Please request a new Payment PIN recovery code.",
        variant: "destructive",
      });

      navigate(
        "/payment-pin",
        {
          replace: true,
        }
      );

      return;
    }


    if (
      !/^\d{6}$/.test(
        cleanOtp
      )
    ) {

      toast({
        title:
          "Invalid code",
        description:
          "Enter the 6-digit recovery code sent to your email.",
        variant: "destructive",
      });

      return;
    }


    setIsLoading(true);


    try {

      /*
       * --------------------------------------------------------
       * Make sure the normal authenticated session exists.
       * --------------------------------------------------------
       */

      const {
        data: {
          user,
        },
        error: userError,
      } =
        await supabase.auth.getUser();


      if (
        userError ||
        !user
      ) {

        throw new Error(
          "Your login session has expired. Please sign in again."
        );
      }


      /*
       * --------------------------------------------------------
       * Call custom verification Edge Function.
       * --------------------------------------------------------
       */

      const {
        data,
        error,
      } =
        await supabase.functions.invoke(
          "payment-pin-reset-verify",
          {
            body: {
              challenge_id:
                challengeId,

              otp:
                cleanOtp,
            },
          }
        );


      if (error) {

        console.error(
          "Payment PIN recovery verification error:",
          error
        );

        throw new Error(
          error.message ||
            "Unable to verify recovery code."
        );
      }


      if (
        !data ||
        data.success !== true
      ) {

        throw new Error(
          data?.message ||
            "The recovery code could not be verified."
        );
      }


      /*
       * --------------------------------------------------------
       * The Edge Function has now created a
       * short-lived reset authorization.
       * --------------------------------------------------------
       */

      const authorizationToken =
        data.authorization_token;


      if (
        !authorizationToken
      ) {

        throw new Error(
          "Reset authorization was not returned."
        );
      }


      /*
       * --------------------------------------------------------
       * Store authorization temporarily.
       *
       * It is NOT the OTP.
       *
       * It is NOT the user's password.
       *
       * It is a short-lived authorization created
       * only after successful OTP verification.
       * --------------------------------------------------------
       */

      sessionStorage.setItem(
        "iyanjupay_payment_pin_reset_authorization",
        authorizationToken
      );


      /*
       * Challenge is no longer needed by
       * the reset page.
       */

      sessionStorage.removeItem(
        "iyanjupay_payment_pin_reset_challenge_id"
      );


      toast({
        title:
          "Email verified",
        description:
          "Your recovery code has been verified. You can now create a new Payment PIN.",
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
          "The recovery code is incorrect or expired.",
        variant: "destructive",
      });

    } finally {

      setIsLoading(false);

    }

  };


  /*
   * ==========================================================
   * RESEND CODE
   * ==========================================================
   */

  const handleResend = async () => {

    if (
      resendLoading ||
      isLoading
    ) {
      return;
    }


    setResendLoading(true);


    try {

      /*
       * Verify current login.
       */

      const {
        data: {
          user,
        },
        error: userError,
      } =
        await supabase.auth.getUser();


      if (
        userError ||
        !user
      ) {

        throw new Error(
          "Your login session has expired. Please sign in again."
        );
      }


      /*
       * Request a completely new challenge.
       */

      const {
        data,
        error,
      } =
        await supabase.functions.invoke(
          "request-payment-pin-reset",
          {
            body: {},
          }
        );


      if (error) {

        console.error(
          "Payment PIN recovery resend error:",
          error
        );

        throw new Error(
          error.message ||
            "Unable to send a new recovery code."
        );
      }


      if (
        !data ||
        data.success !== true
      ) {

        throw new Error(
          data?.message ||
            "Unable to send a new recovery code."
        );
      }


      /*
       * Save the new challenge.
       */

      if (
        data.challenge_id
      ) {

        sessionStorage.setItem(
          "iyanjupay_payment_pin_reset_challenge_id",
          data.challenge_id
        );

        setChallengeId(
          data.challenge_id
        );
      }


      if (
        user.email
      ) {

        const normalizedEmail =
          user.email
            .trim()
            .toLowerCase();

        setEmail(
          normalizedEmail
        );

        sessionStorage.setItem(
          "iyanjupay_payment_pin_reset_email",
          normalizedEmail
        );
      }


      /*
       * A previous authorization must never
       * remain usable after requesting a new code.
       */

      sessionStorage.removeItem(
        "iyanjupay_payment_pin_reset_authorization"
      );


      setOtp("");


      toast({
        title:
          "New code sent",
        description:
          "A new Payment PIN recovery code has been sent to your email.",
      });

    } catch (error: any) {

      console.error(
        "Payment PIN recovery resend failed:",
        error
      );


      toast({
        title:
          "Unable to resend code",
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
   * BACK
   * ==========================================================
   */

  const handleBack = () => {

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

            <ShieldCheck className="h-6 w-6 text-blue-700" />

          </div>


          <CardTitle className="text-2xl font-bold text-[#082A63]">

            Verify Payment PIN Reset

          </CardTitle>


          <CardDescription>

            Enter the 6-digit recovery code
            sent to your verified email.

          </CardDescription>


          <div className="mt-3 flex items-center justify-center gap-2">

            <MailCheck className="h-4 w-4 text-green-600" />

            <p className="text-sm font-semibold text-[#082A63] break-all">

              {email}

            </p>

          </div>

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
                onChange={(event) =>
                  setOtp(
                    event.target.value
                      .replace(/\D/g, "")
                      .slice(0, 6)
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


            <Button
              type="submit"
              className="w-full bg-[#082A63] hover:bg-[#061F49]"
              disabled={
                isLoading ||
                resendLoading ||
                !/^\d{6}$/.test(otp)
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

              {resendLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                "Resend Code"
              )}

            </Button>


            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={handleBack}
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
