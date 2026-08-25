import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

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

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type VerificationMethod = "phone" | "email" | null;

const AuthForm = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(false);

  // ============================================================
  // SIGNUP FIELDS
  // ============================================================

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");

  // Referral code entered by user or received from ?ref=
  const [referralCode, setReferralCode] = useState("");

  // ============================================================
  // SIGN-IN FIELD
  // ============================================================

  const [loginIdentifier, setLoginIdentifier] = useState("");

  // ============================================================
  // VERIFICATION STATE
  // ============================================================

  const [
    verificationDialogOpen,
    setVerificationDialogOpen,
  ] = useState(false);

  const [
    verificationMethod,
    setVerificationMethod,
  ] = useState<VerificationMethod>(null);

  const [otp, setOtp] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);

  const [phoneOtpSent, setPhoneOtpSent] = useState(false);

  // ============================================================
  // DETERMINE INITIAL TAB
  // ============================================================

  /*
   * If the user opens:
   *
   * /signup
   *
   * or:
   *
   * /signup?ref=AL12345678
   *
   * automatically show Sign Up.
   */
  const initialTab =
    location.pathname === "/signup"
      ? "signup"
      : "signin";

  // ============================================================
  // READ REFERRAL CODE FROM URL
  // ============================================================

  useEffect(() => {
    const params = new URLSearchParams(
      location.search,
    );

    const urlReferral =
      params.get("ref") ||
      params.get("referral") ||
      params.get("referral_code");

    if (urlReferral) {
      const cleanedReferral =
        urlReferral
          .trim()
          .toUpperCase()
          .slice(0, 32);

      setReferralCode(cleanedReferral);

      /*
       * Keep referral code available in case the
       * user refreshes the signup page.
       */
      sessionStorage.setItem(
        "iyanjupay_referral_code",
        cleanedReferral,
      );
    } else {
      /*
       * If there is no referral in the current URL,
       * recover a previously captured referral code.
       */
      const savedReferral =
        sessionStorage.getItem(
          "iyanjupay_referral_code",
        );

      if (savedReferral) {
        setReferralCode(
          savedReferral.toUpperCase(),
        );
      }
    }
  }, [location.pathname, location.search]);

  // ============================================================
  // EDGE FUNCTION ERROR HANDLER
  // ============================================================

  const getEdgeFunctionErrorMessage =
    async (
      error: any,
      fallback: string,
    ): Promise<string> => {
      try {
        if (error?.context) {
          const response =
            typeof error.context.clone ===
            "function"
              ? error.context.clone()
              : error.context;

          if (
            typeof response.json ===
            "function"
          ) {
            const data =
              await response.json();

            if (
              typeof data?.error ===
                "string" &&
              data.error.trim()
            ) {
              return data.error.trim();
            }

            if (
              typeof data?.message ===
                "string" &&
              data.message.trim()
            ) {
              return data.message.trim();
            }

            if (
              typeof data?.detail ===
                "string" &&
              data.detail.trim()
            ) {
              return data.detail.trim();
            }
          }
        }
      } catch (parseError) {
        console.error(
          "Unable to parse Edge Function error:",
          parseError,
        );
      }

      if (
        typeof error?.message ===
          "string" &&
        error.message.trim() &&
        error.message !==
          "Edge Function returned a non-2xx status code"
      ) {
        return error.message.trim();
      }

      return fallback;
    };

  // ============================================================
  // PHONE NORMALIZATION
  // ============================================================

  const normalizePhoneNumber = (
    phone: string,
  ) => {
    let cleaned = phone
      .trim()
      .replace(/[\s()-]/g, "");

    // 08012345678 -> +2348012345678
    if (cleaned.startsWith("0")) {
      cleaned = `+234${cleaned.substring(1)}`;
    }

    // 2348012345678 -> +2348012345678
    if (cleaned.startsWith("234")) {
      cleaned = `+${cleaned}`;
    }

    return cleaned;
  };

  // ============================================================
  // REFERRAL CODE NORMALIZATION
  // ============================================================

  const normalizeReferralCode = (
    code: string,
  ) => {
    return code
      .trim()
      .toUpperCase()
      .replace(/\s/g, "")
      .slice(0, 32);
  };

  // ============================================================
  // SIGN UP
  // ============================================================

  const handleSignUp = async (
    e: React.FormEvent,
  ) => {
    e.preventDefault();

    if (!fullName.trim()) {
      toast({
        title: "Full name required",
        description:
          "Please enter your full name.",
        variant: "destructive",
      });
      return;
    }

    if (!phoneNumber.trim()) {
      toast({
        title: "Phone number required",
        description:
          "Please enter your phone number.",
        variant: "destructive",
      });
      return;
    }

    if (!email.trim()) {
      toast({
        title: "Email required",
        description:
          "Please enter your email address.",
        variant: "destructive",
      });
      return;
    }

    if (!password) {
      toast({
        title: "Password required",
        description:
          "Please enter your password.",
        variant: "destructive",
      });
      return;
    }

    if (password.length < 6) {
      toast({
        title: "Password too short",
        description:
          "Your password must contain at least 6 characters.",
        variant: "destructive",
      });
      return;
    }

    const normalizedPhone =
      normalizePhoneNumber(
        phoneNumber,
      );

    if (
      !/^\+234\d{10}$/.test(
        normalizedPhone,
      )
    ) {
      toast({
        title:
          "Invalid Nigerian phone number",
        description:
          "Enter a valid Nigerian number such as +2348012345678.",
        variant: "destructive",
      });
      return;
    }

    const normalizedEmail =
      email.trim().toLowerCase();

    const normalizedReferral =
      normalizeReferralCode(
        referralCode,
      );

    /*
     * Basic referral code validation.
     *
     * Your generated codes currently look like:
     *
     * ALXXXXXXXX
     *
     * We allow letters and numbers generally so
     * this remains compatible with future codes.
     */
    if (
      normalizedReferral &&
      !/^[A-Z0-9_-]{4,32}$/.test(
        normalizedReferral,
      )
    ) {
      toast({
        title: "Invalid referral code",
        description:
          "Please check the referral code and try again.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      /*
       * Save referral code locally so it remains available
       * through the email/phone verification process.
       */
      if (normalizedReferral) {
        sessionStorage.setItem(
          "iyanjupay_referral_code",
          normalizedReferral,
        );
      }

      const { data, error } =
        await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            data: {
              full_name:
                fullName.trim(),

              phone_number:
                normalizedPhone,

              /*
               * The referral code is included in auth
               * metadata so the server-side signup/referral
               * process can use it.
               */
              referral_code:
                normalizedReferral || null,
            },
          },
        });

      if (error) {
        throw error;
      }

      if (!data.user) {
        throw new Error(
          "Unable to create your account.",
        );
      }

      /*
       * Profile is created server-side by your
       * auth.users -> profiles trigger.
       *
       * We do NOT insert profiles from the client.
       */

      setVerificationMethod(null);
      setOtp("");
      setPhoneOtpSent(false);
      setVerificationDialogOpen(true);

      toast({
        title: "Account created",
        description:
          normalizedReferral
            ? "Your referral code has been saved. Choose how you want to verify your account."
            : "Choose how you want to verify your IyanjuPay account.",
      });
    } catch (error: any) {
      console.error(
        "Signup error:",
        error,
      );

      const message =
        error?.message ||
        "Something went wrong.";

      toast({
        title:
          "Unable to create account",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // ============================================================
  // PHONE OTP - SEND
  // ============================================================

  const handleSendPhoneOTP =
    async () => {
      const normalizedPhone =
        normalizePhoneNumber(
          phoneNumber,
        );

      if (
        !/^\+234\d{10}$/.test(
          normalizedPhone,
        )
      ) {
        toast({
          title:
            "Invalid phone number",
          description:
            "Enter a valid Nigerian phone number.",
          variant: "destructive",
        });
        return;
      }

      setOtpLoading(true);

      try {
        const { data, error } =
          await supabase.functions.invoke(
            "termii-verify",
            {
              body: {
                action: "send",
                phone:
                  normalizedPhone,
              },
            },
          );

        if (error) {
          const message =
            await getEdgeFunctionErrorMessage(
              error,
              "Unable to send verification code.",
            );

          throw new Error(
            message,
          );
        }

        if (!data?.success) {
          throw new Error(
            data?.error ||
              "Unable to send verification code.",
          );
        }

        setPhoneOtpSent(true);
        setOtp("");

        toast({
          title:
            "Verification code sent",
          description:
            "An 8-digit verification code has been sent to your phone.",
        });
      } catch (error: any) {
        console.error(
          "Termii send OTP error:",
          error,
        );

        toast({
          title:
            "Unable to send code",
          description:
            error?.message ||
            "Please try again.",
          variant: "destructive",
        });
      } finally {
        setOtpLoading(false);
      }
    };

  // ============================================================
  // PHONE OTP - VERIFY
  // ============================================================

  const handleVerifyPhoneOTP =
    async () => {
      const normalizedPhone =
        normalizePhoneNumber(
          phoneNumber,
        );

      const enteredCode =
        otp.trim();

      if (
        !/^\d{8}$/.test(
          enteredCode,
        )
      ) {
        toast({
          title: "Invalid code",
          description:
            "Enter the 8-digit verification code you received.",
          variant: "destructive",
        });
        return;
      }

      setOtpLoading(true);

      try {
        const { data, error } =
          await supabase.functions.invoke(
            "termii-verify",
            {
              body: {
                action: "check",
                phone:
                  normalizedPhone,
                code:
                  enteredCode,
              },
            },
          );

        if (error) {
          const message =
            await getEdgeFunctionErrorMessage(
              error,
              "Invalid verification code.",
            );

          throw new Error(
            message,
          );
        }

        if (!data?.verified) {
          throw new Error(
            data?.error ||
              data?.message ||
              "Invalid verification code.",
          );
        }

        setVerificationDialogOpen(
          false,
        );

        setVerificationMethod(null);
        setOtp("");
        setPhoneOtpSent(false);

        toast({
          title:
            "Phone verified successfully",
          description:
            "Your phone number has been verified. You can now continue.",
        });

        /*
         * Do not remove referral information here.
         * It may still be needed by your server-side
         * referral completion logic.
         */
      } catch (error: any) {
        console.error(
          "Termii verify OTP error:",
          error,
        );

        toast({
          title:
            "Verification failed",
          description:
            error?.message ||
            "The 8-digit verification code is incorrect.",
          variant: "destructive",
        });
      } finally {
        setOtpLoading(false);
      }
    };

  // ============================================================
  // EMAIL OTP - SEND
  // ============================================================

  const handleSendEmailOTP =
    async () => {
      const normalizedEmail =
        email.trim().toLowerCase();

      if (!normalizedEmail) {
        toast({
          title: "Email required",
          description:
            "Your email address is required.",
          variant: "destructive",
        });
        return;
      }

      setOtpLoading(true);

      try {
        const { error } =
          await supabase.auth.resend({
            type: "signup",
            email:
              normalizedEmail,
          });

        if (error) {
          throw error;
        }

        sessionStorage.setItem(
          "iyanjupay_signup_email",
          normalizedEmail,
        );

        /*
         * Preserve referral code through email verification.
         */
        const normalizedReferral =
          normalizeReferralCode(
            referralCode,
          );

        if (normalizedReferral) {
          sessionStorage.setItem(
            "iyanjupay_referral_code",
            normalizedReferral,
          );
        }

        setVerificationDialogOpen(
          false,
        );

        setVerificationMethod(null);
        setOtp("");
        setPhoneOtpSent(false);

        toast({
          title:
            "Verification code sent",
          description:
            "Check your email for the verification code.",
        });

        navigate(
          "/verify-email-otp",
          {
            state: {
              email:
                normalizedEmail,
              referralCode:
                normalizedReferral ||
                null,
            },
          },
        );
      } catch (error: any) {
        console.error(
          "Email OTP send error:",
          error,
        );

        toast({
          title:
            "Unable to send verification code",
          description:
            error?.message ||
            "Please try again.",
          variant: "destructive",
        });
      } finally {
        setOtpLoading(false);
      }
    };

  // ============================================================
  // SIGN IN
  // ============================================================

  const handleSignIn = async (
    e: React.FormEvent,
  ) => {
    e.preventDefault();

    const identifier =
      loginIdentifier.trim();

    if (!identifier) {
      toast({
        title:
          "Email or phone required",
        description:
          "Enter your email address or phone number.",
        variant: "destructive",
      });
      return;
    }

    if (!password) {
      toast({
        title:
          "Password required",
        description:
          "Please enter your password.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const { data, error } =
        await supabase.functions.invoke(
          "login-with-identifier",
          {
            body: {
              identifier,
              password,
            },
          },
        );

      if (error) {
        const message =
          await getEdgeFunctionErrorMessage(
            error,
            "Invalid login credentials.",
          );

        throw new Error(
          message,
        );
      }

      if (
        !data?.success ||
        !data?.session
      ) {
        throw new Error(
          data?.error ||
            data?.message ||
            "Invalid login credentials.",
        );
      }

      const {
        error: sessionError,
      } =
        await supabase.auth.setSession(
          {
            access_token:
              data.session
                .access_token,

            refresh_token:
              data.session
                .refresh_token,
          },
        );

      if (sessionError) {
        throw sessionError;
      }

      toast({
        title:
          "Welcome back!",
        description:
          "You have successfully signed in.",
      });
    } catch (error: any) {
      console.error(
        "Sign-in error:",
        error,
      );

      toast({
        title:
          "Unable to sign in",
        description:
          error?.message ||
          "Invalid login credentials.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // ============================================================
  // UI
  // ============================================================

  return (
    <>
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-blue-50 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold text-blue-700">
              IyanjuPay
            </CardTitle>

            <CardDescription>
              Your trusted payment solution in Nigeria
            </CardDescription>
          </CardHeader>

          <CardContent>
            <Tabs
              key={initialTab}
              defaultValue={initialTab}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">
                  Sign In
                </TabsTrigger>

                <TabsTrigger value="signup">
                  Sign Up
                </TabsTrigger>
              </TabsList>

              {/* ==================================================
                  SIGN IN
              ================================================== */}

              <TabsContent value="signin">
                <form
                  onSubmit={handleSignIn}
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <Label htmlFor="login-identifier">
                      Email or Phone Number
                    </Label>

                    <Input
                      id="login-identifier"
                      type="text"
                      value={
                        loginIdentifier
                      }
                      onChange={(e) =>
                        setLoginIdentifier(
                          e.target.value,
                        )
                      }
                      placeholder="Email or +2348012345678"
                      autoComplete="username"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signin-password">
                      Password
                    </Label>

                    <Input
                      id="signin-password"
                      type="password"
                      value={password}
                      onChange={(e) =>
                        setPassword(
                          e.target.value,
                        )
                      }
                      autoComplete="current-password"
                      required
                    />
                  </div>

                  <Button
                    type="submit"
                    className="w-full bg-blue-600 hover:bg-blue-700"
                    disabled={
                      isLoading
                    }
                  >
                    {isLoading
                      ? "Signing In..."
                      : "Sign In"}
                  </Button>

                  <button
                    type="button"
                    onClick={() =>
                      navigate(
                        "/forgot-password",
                      )
                    }
                    disabled={
                      isLoading
                    }
                    className="w-full text-sm text-blue-600 hover:text-blue-700 hover:underline disabled:opacity-50"
                  >
                    Forgot password?
                  </button>
                </form>
              </TabsContent>

              {/* ==================================================
                  SIGN UP
              ================================================== */}

              <TabsContent value="signup">
                <form
                  onSubmit={handleSignUp}
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <Label htmlFor="fullName">
                      Full Name
                    </Label>

                    <Input
                      id="fullName"
                      type="text"
                      value={fullName}
                      onChange={(e) =>
                        setFullName(
                          e.target.value,
                        )
                      }
                      autoComplete="name"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phoneNumber">
                      Phone Number
                    </Label>

                    <Input
                      id="phoneNumber"
                      type="tel"
                      value={
                        phoneNumber
                      }
                      onChange={(e) =>
                        setPhoneNumber(
                          e.target.value,
                        )
                      }
                      placeholder="+2348012345678"
                      autoComplete="tel"
                      required
                    />

                    <p className="text-xs text-muted-foreground">
                      Enter a Nigerian number such as
                      +2348012345678.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-email">
                      Email
                    </Label>

                    <Input
                      id="signup-email"
                      type="email"
                      value={email}
                      onChange={(e) =>
                        setEmail(
                          e.target.value,
                        )
                      }
                      autoComplete="email"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-password">
                      Password
                    </Label>

                    <Input
                      id="signup-password"
                      type="password"
                      value={password}
                      onChange={(e) =>
                        setPassword(
                          e.target.value,
                        )
                      }
                      autoComplete="new-password"
                      required
                    />

                    <p className="text-xs text-muted-foreground">
                      Minimum 6 characters.
                    </p>
                  </div>

                  {/* ==================================================
                      REFERRAL CODE
                  ================================================== */}

                  <div className="space-y-2">
                    <Label htmlFor="referral-code">
                      Referral Code
                      <span className="text-muted-foreground font-normal">
                        {" "}
                        (Optional)
                      </span>
                    </Label>

                    <Input
                      id="referral-code"
                      type="text"
                      value={
                        referralCode
                      }
                      onChange={(e) =>
                        setReferralCode(
                          e.target.value
                            .toUpperCase()
                            .replace(
                              /\s/g,
                              "",
                            )
                            .slice(
                              0,
                              32,
                            ),
                        )
                      }
                      placeholder="Enter referral code"
                      autoComplete="off"
                      maxLength={32}
                      className="font-mono uppercase"
                    />

                    {referralCode && (
                      <p className="text-xs text-green-600">
                        Referral code applied:{" "}
                        <span className="font-semibold">
                          {referralCode}
                        </span>
                      </p>
                    )}

                    {!referralCode && (
                      <p className="text-xs text-muted-foreground">
                        If someone invited you, enter
                        their referral code here.
                      </p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    className="w-full bg-blue-600 hover:bg-blue-700"
                    disabled={
                      isLoading
                    }
                  >
                    {isLoading
                      ? "Creating Account..."
                      : "Create Account"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {/* ==========================================================
          VERIFICATION DIALOG
      ========================================================== */}

      <Dialog
        open={
          verificationDialogOpen
        }
        onOpenChange={(open) => {
          if (!otpLoading) {
            setVerificationDialogOpen(
              open,
            );

            if (!open) {
              setVerificationMethod(
                null,
              );

              setOtp("");

              setPhoneOtpSent(
                false,
              );
            }
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Verify Your IyanjuPay Account
            </DialogTitle>

            <DialogDescription>
              Choose how you want to verify your account.
            </DialogDescription>
          </DialogHeader>

          {/* ======================================================
              METHOD SELECTION
          ====================================================== */}

          {!verificationMethod && (
            <div className="space-y-3 pt-4">
              <Button
                type="button"
                variant="outline"
                className="w-full h-16 justify-start"
                onClick={() => {
                  setVerificationMethod(
                    "phone",
                  );

                  setOtp("");

                  setPhoneOtpSent(
                    false,
                  );
                }}
              >
                <span className="text-2xl mr-4">
                  📱
                </span>

                <div className="text-left">
                  <div className="font-semibold">
                    Verify with Phone Number
                  </div>

                  <div className="text-xs text-muted-foreground">
                    Receive an 8-digit verification code by SMS
                  </div>
                </div>
              </Button>

              <Button
                type="button"
                variant="outline"
                className="w-full h-16 justify-start"
                onClick={() => {
                  setVerificationMethod(
                    "email",
                  );
                }}
              >
                <span className="text-2xl mr-4">
                  ✉️
                </span>

                <div className="text-left">
                  <div className="font-semibold">
                    Verify with Email
                  </div>

                  <div className="text-xs text-muted-foreground">
                    Receive a verification code by email
                  </div>
                </div>
              </Button>
            </div>
          )}

          {/* ======================================================
              PHONE VERIFICATION
          ====================================================== */}

          {verificationMethod ===
            "phone" && (
            <div className="space-y-4 pt-4">
              <div className="rounded-lg bg-blue-50 p-4">
                <p className="text-sm">
                  We'll send an 8-digit
                  verification code to:
                </p>

                <p className="font-semibold mt-1">
                  {normalizePhoneNumber(
                    phoneNumber,
                  )}
                </p>
              </div>

              {!phoneOtpSent ? (
                <Button
                  type="button"
                  className="w-full bg-blue-600 hover:bg-blue-700"
                  onClick={
                    handleSendPhoneOTP
                  }
                  disabled={
                    otpLoading
                  }
                >
                  {otpLoading
                    ? "Sending Code..."
                    : "Send Verification Code"}
                </Button>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="phone-otp">
                      8-Digit Verification Code
                    </Label>

                    <Input
                      id="phone-otp"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={8}
                      value={otp}
                      onChange={(e) =>
                        setOtp(
                          e.target.value
                            .replace(
                              /\D/g,
                              "",
                            )
                            .slice(
                              0,
                              8,
                            ),
                        )
                      }
                      placeholder="Enter 8-digit code"
                      className="text-center text-xl tracking-[0.35em]"
                    />
                  </div>

                  <Button
                    type="button"
                    className="w-full bg-blue-600 hover:bg-blue-700"
                    onClick={
                      handleVerifyPhoneOTP
                    }
                    disabled={
                      otpLoading ||
                      !/^\d{8}$/.test(
                        otp,
                      )
                    }
                  >
                    {otpLoading
                      ? "Verifying..."
                      : "Verify Phone Number"}
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
                    onClick={
                      handleSendPhoneOTP
                    }
                    disabled={
                      otpLoading
                    }
                  >
                    Resend Code
                  </Button>
                </>
              )}

              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setVerificationMethod(
                    null,
                  );

                  setOtp("");

                  setPhoneOtpSent(
                    false,
                  );
                }}
                disabled={
                  otpLoading
                }
              >
                ← Choose another method
              </Button>
            </div>
          )}

          {/* ======================================================
              EMAIL VERIFICATION
          ====================================================== */}

          {verificationMethod ===
            "email" && (
            <div className="space-y-4 pt-4">
              <div className="rounded-lg bg-blue-50 p-4">
                <p className="text-sm">
                  We'll send a verification code
                  to:
                </p>

                <p className="font-semibold mt-1 break-all">
                  {email.trim()}
                </p>
              </div>

              <Button
                type="button"
                className="w-full bg-blue-600 hover:bg-blue-700"
                onClick={
                  handleSendEmailOTP
                }
                disabled={
                  otpLoading
                }
              >
                {otpLoading
                  ? "Sending Code..."
                  : "Send Verification Code"}
              </Button>

              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() =>
                  setVerificationMethod(
                    null,
                  )
                }
                disabled={
                  otpLoading
                }
              >
                ← Choose another method
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AuthForm;
