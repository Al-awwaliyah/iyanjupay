import React, {
  useEffect,
  useState,
} from "react";

import {
  ArrowLeft,
  ShieldCheck,
  Loader2,
  MailCheck,
} from "lucide-react";

import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { Input } from "@/components/ui/input";

import { useToast } from "@/hooks/use-toast";

import { supabase } from "@/integrations/supabase/client";


const CHALLENGE_KEY =
  "iyanjupay_payment_pin_reset_challenge_id";

const EXPIRES_KEY =
  "iyanjupay_payment_pin_reset_expires_at";


const VerifyPaymentPinResetOtp =
  () => {

    const navigate =
      useNavigate();

    const { toast } =
      useToast();


    const [
      otp,
      setOtp,
    ] = useState("");


    const [
      challengeId,
      setChallengeId,
    ] = useState("");


    const [
      processing,
      setProcessing,
    ] = useState(false);


    const [
      email,
      setEmail,
    ] = useState("");


    // ========================================================
    // LOAD RECOVERY DATA
    // ========================================================

    useEffect(() => {

      const storedChallenge =
        sessionStorage.getItem(
          CHALLENGE_KEY
        );


      if (!storedChallenge) {

        toast({
          title:
            "Recovery session not found",
          description:
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

        return;
      }


      setChallengeId(
        storedChallenge
      );


      supabase.auth
        .getUser()
        .then(({
          data,
        }) => {

          if (data.user?.email) {

            setEmail(
              data.user.email
            );

          }

        });

    }, [
      navigate,
      toast,
    ]);


    // ========================================================
    // OTP INPUT
    // ========================================================

    const handleOtpChange =
      (
        event:
          React.ChangeEvent<HTMLInputElement>
      ) => {

        const value =
          event.target.value
            .replace(/\D/g, "")
            .slice(0, 6);

        setOtp(value);
      };


    // ========================================================
    // VERIFY OTP
    // ========================================================

    const handleVerify =
      async () => {

        if (processing) {
          return;
        }


        if (
          !challengeId
        ) {

          toast({
            title:
              "Recovery session missing",
            description:
              "Please request a new reset code.",
            variant:
              "destructive",
          });

          return;
        }


        if (
          !/^\d{6}$/.test(otp)
        ) {

          toast({
            title:
              "Invalid verification code",
            description:
              "Enter the 6-digit code sent to your email.",
            variant:
              "destructive",
          });

          return;
        }


        try {

          setProcessing(true);


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

                  otp,
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
            !data?.success ||
            !data?.authorization_token
          ) {

            throw new Error(
              data?.message ||
                "Payment PIN recovery verification failed."
            );
          }


          // ----------------------------------------------------
          // STORE AUTHORIZATION
          // ----------------------------------------------------

          sessionStorage.setItem(
            "iyanjupay_payment_pin_reset_authorization",
            data.authorization_token
          );


          if (
            data.authorization_expires_at
          ) {

            sessionStorage.setItem(
              "iyanjupay_payment_pin_reset_authorization_expires_at",
              data.authorization_expires_at
            );

          }


          // ----------------------------------------------------
          // Challenge is no longer needed by the reset page.
          // ----------------------------------------------------

          sessionStorage.removeItem(
            CHALLENGE_KEY
          );

          sessionStorage.removeItem(
            EXPIRES_KEY
          );


          toast({
            title:
              "Code verified",
            description:
              "You can now create a new Payment PIN.",
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
              "Unable to verify the recovery code.",
            variant:
              "destructive",
          });

        } finally {

          setProcessing(false);

        }
      };


    // ========================================================
    // BACK
    // ========================================================

    const handleBack =
      () => {

        if (processing) {
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
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50">

        <div className="max-w-md mx-auto px-4 py-8">

          <Button
            variant="ghost"
            onClick={handleBack}
            disabled={processing}
            className="mb-6 text-purple-600"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>


          <Card className="shadow-lg">

            <CardHeader>

              <div className="flex items-center gap-3">

                <div className="w-11 h-11 rounded-full bg-purple-100 flex items-center justify-center">
                  <ShieldCheck className="h-6 w-6 text-purple-600" />
                </div>

                <div>

                  <CardTitle>
                    Verify Payment PIN Reset
                  </CardTitle>

                  <CardDescription>
                    Enter the 6-digit code sent to your email.
                  </CardDescription>

                </div>

              </div>

            </CardHeader>


            <CardContent className="space-y-6">

              <div className="rounded-lg bg-blue-50 border border-blue-100 p-4">

                <div className="flex items-start gap-3">

                  <MailCheck className="h-5 w-5 text-blue-600 mt-0.5" />

                  <div>

                    <p className="text-sm font-medium text-blue-900">
                      Verification code sent
                    </p>

                    <p className="text-sm text-blue-700 mt-1">
                      {email
                        ? `We sent a 6-digit code to ${email}.`
                        : "We sent a 6-digit code to your verified email address."}
                    </p>

                  </div>

                </div>

              </div>


              <div className="space-y-2">

                <label
                  htmlFor="payment-pin-reset-otp"
                  className="text-sm font-medium"
                >
                  Verification Code
                </label>

                <Input
                  id="payment-pin-reset-otp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={otp}
                  onChange={handleOtpChange}
                  placeholder="000000"
                  disabled={processing}
                  className="text-center text-2xl tracking-[0.5em]"
                />

                <p className="text-xs text-gray-500 text-center">
                  The code expires in 10 minutes.
                </p>

              </div>


              <Button
                type="button"
                onClick={handleVerify}
                disabled={
                  processing ||
                  otp.length !== 6 ||
                  !challengeId
                }
                className="w-full bg-purple-600 hover:bg-purple-700"
              >

                {processing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4 mr-2" />
                    Verify Code
                  </>
                )}

              </Button>


              <p className="text-xs text-gray-500 text-center">
                Never share this verification code
                with anyone.
              </p>

            </CardContent>

          </Card>

        </div>

      </div>
    );
  };


export default VerifyPaymentPinResetOtp;
