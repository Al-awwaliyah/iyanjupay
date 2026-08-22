import React, { useState } from "react";
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
  const [isLoading, setIsLoading] = useState(false);

  // Signup fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");

  // Sign-in field
  const [loginIdentifier, setLoginIdentifier] = useState("");

  // Verification state
  const [verificationDialogOpen, setVerificationDialogOpen] =
    useState(false);

  const [verificationMethod, setVerificationMethod] =
    useState<VerificationMethod>(null);

  const [otp, setOtp] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);

  const { toast } = useToast();

  // --------------------------------------------------
  // PHONE NUMBER NORMALIZATION
  // --------------------------------------------------

  const normalizePhoneNumber = (phone: string) => {
    let cleaned = phone.trim().replace(/[\s()-]/g, "");

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

  // --------------------------------------------------
  // SIGN UP
  // --------------------------------------------------

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!fullName.trim()) {
      toast({
        title: "Full name required",
        description: "Please enter your full name.",
        variant: "destructive",
      });
      return;
    }

    if (!phoneNumber.trim()) {
      toast({
        title: "Phone number required",
        description: "Please enter your phone number.",
        variant: "destructive",
      });
      return;
    }

    if (!email.trim()) {
      toast({
        title: "Email required",
        description: "Please enter your email address.",
        variant: "destructive",
      });
      return;
    }

    if (!password) {
      toast({
        title: "Password required",
        description: "Please enter a password.",
        variant: "destructive",
      });
      return;
    }

    const normalizedPhone =
      normalizePhoneNumber(phoneNumber);

    if (!/^\+234\d{10}$/.test(normalizedPhone)) {
      toast({
        title: "Invalid Nigerian phone number",
        description:
          "Enter a valid Nigerian number such as +2348012345678.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const { data, error } =
        await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              full_name: fullName.trim(),
              phone_number: normalizedPhone,
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
       * The profile is created server-side by the
       * auth.users -> profiles database trigger.
       *
       * We intentionally do not insert/update profiles
       * from the client here because the new account may
       * not have an authenticated session yet.
       */

      setVerificationMethod(null);
      setOtp("");
      setOtpSent(false);
      setVerificationDialogOpen(true);

      toast({
        title: "Account created",
        description:
          "Choose how you want to verify your IyanjuPay account.",
      });
    } catch (error: any) {
      toast({
        title: "Unable to create account",
        description:
          error.message || "Something went wrong.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // --------------------------------------------------
  // PHONE OTP - SEND THROUGH TERMII
  // --------------------------------------------------

  const handleSendPhoneOTP = async () => {
    const normalizedPhone =
      normalizePhoneNumber(phoneNumber);

    if (!/^\+234\d{10}$/.test(normalizedPhone)) {
      toast({
        title: "Invalid phone number",
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
              phone: normalizedPhone,
            },
          },
        );

      if (error) {
        throw error;
      }

      if (!data?.success) {
        throw new Error(
          data?.error ||
            "Unable to send verification code.",
        );
      }

      setOtpSent(true);
      setOtp("");

      toast({
        title: "Verification code sent",
        description:
          "An 8-digit verification code has been sent to your phone.",
      });
    } catch (error: any) {
      console.error(
        "Termii send OTP error:",
        error,
      );

      toast({
        title: "Unable to send code",
        description:
          error.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setOtpLoading(false);
    }
  };

  // --------------------------------------------------
  // PHONE OTP - VERIFY THROUGH TERMII
  // --------------------------------------------------

  const handleVerifyPhoneOTP = async () => {
    const normalizedPhone =
      normalizePhoneNumber(phoneNumber);

    const enteredCode = otp.trim();

    if (!/^\d{8}$/.test(enteredCode)) {
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
              phone: normalizedPhone,
              code: enteredCode,
            },
          },
        );

      if (error) {
        throw error;
      }

      if (!data?.verified) {
        throw new Error(
          data?.error ||
            data?.message ||
            "Invalid verification code.",
        );
      }

      /*
       * termii-verify handles:
       * - OTP verification
       * - profiles.phone_verified = true
       * - profiles.phone_verified_at
       *
       * No Supabase auth session is required here.
       */

      setVerificationDialogOpen(false);
      setVerificationMethod(null);
      setOtp("");
      setOtpSent(false);

      toast({
        title: "Phone verified successfully",
        description:
          "Your phone number has been verified. You can now continue.",
      });
    } catch (error: any) {
      console.error(
        "Termii verify OTP error:",
        error,
      );

      toast({
        title: "Verification failed",
        description:
          error.message ||
          "The 8-digit verification code is incorrect.",
        variant: "destructive",
      });
    } finally {
      setOtpLoading(false);
    }
  };

  // --------------------------------------------------
  // EMAIL VERIFICATION
  // --------------------------------------------------

  const handleEmailVerification = async () => {
    setOtpLoading(true);

    try {
      const { error } =
        await supabase.auth.resend({
          type: "signup",
          email: email.trim(),
        });

      if (error) {
        throw error;
      }

      toast({
        title: "Verification email sent",
        description:
          "Check your email and click the verification link to verify your account.",
      });

      setVerificationDialogOpen(false);
    } catch (error: any) {
      console.error(
        "Email verification error:",
        error,
      );

      toast({
        title: "Unable to send email",
        description:
          error.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setOtpLoading(false);
    }
  };

  // --------------------------------------------------
  // SIGN IN - EMAIL OR PHONE
  // --------------------------------------------------

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();

    const identifier =
      loginIdentifier.trim();

    if (!identifier) {
      toast({
        title: "Email or phone required",
        description:
          "Enter your email address or phone number.",
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
        throw error;
      }

      if (
        !data?.success ||
        !data?.session
      ) {
        throw new Error(
          data?.error ||
            "Invalid login credentials.",
        );
      }

      // Install the session returned by the Edge Function
      // into the browser's Supabase client.
      const { error: sessionError } =
        await supabase.auth.setSession({
          access_token:
            data.session.access_token,
          refresh_token:
            data.session.refresh_token,
        });

      if (sessionError) {
        throw sessionError;
      }

      toast({
        title: "Welcome back!",
        description:
          "You have successfully signed in.",
      });
    } catch (error: any) {
      console.error(
        "Sign-in error:",
        error,
      );

      toast({
        title: "Unable to sign in",
        description:
          error.message ||
          "Invalid login credentials.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // --------------------------------------------------
  // FORGOT PASSWORD
  // --------------------------------------------------

  const handleForgotPassword = async () => {
    const value = loginIdentifier.trim();

    if (!value) {
      toast({
        title: "Email required",
        description:
          "Enter your email address in the login field first.",
        variant: "destructive",
      });
      return;
    }

    // Password reset through Supabase requires the email.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      toast({
        title: "Email required",
        description:
          "For password reset, enter your email address rather than your phone number.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const { error } =
        await supabase.auth.resetPasswordForEmail(
          value,
          {
            redirectTo:
              `${window.location.origin}/reset-password`,
          },
        );

      if (error) {
        throw error;
      }

      toast({
        title: "Reset link sent",
        description:
          "Please check your email for the password reset link.",
      });
    } catch (error: any) {
      toast({
        title: "Unable to send reset link",
        description:
          error.message ||
          "Unable to send reset link.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // --------------------------------------------------
  // UI
  // --------------------------------------------------

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
              defaultValue="signin"
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

              {/* ---------------------------------- */}
              {/* SIGN IN                            */}
              {/* ---------------------------------- */}

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
                      value={loginIdentifier}
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
                    disabled={isLoading}
                  >
                    {isLoading
                      ? "Signing In..."
                      : "Sign In"}
                  </Button>

                  <button
                    type="button"
                    onClick={
                      handleForgotPassword
                    }
                    disabled={isLoading}
                    className="w-full text-sm text-blue-600 hover:text-blue-700 hover:underline disabled:opacity-50"
                  >
                    Forgot password?
                  </button>
                </form>
              </TabsContent>

              {/* ---------------------------------- */}
              {/* SIGN UP                            */}
              {/* ---------------------------------- */}

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
                      value={phoneNumber}
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
                  </div>

                  <Button
                    type="submit"
                    className="w-full bg-blue-600 hover:bg-blue-700"
                    disabled={isLoading}
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

      {/* ------------------------------------------ */}
      {/* VERIFICATION DIALOG                       */}
      {/* ------------------------------------------ */}

      <Dialog
        open={verificationDialogOpen}
        onOpenChange={(open) => {
          if (!otpLoading) {
            setVerificationDialogOpen(
              open,
            );

            if (!open) {
              setVerificationMethod(null);
              setOtp("");
              setOtpSent(false);
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

          {/* -------------------------------------- */}
          {/* METHOD SELECTION                       */}
          {/* -------------------------------------- */}

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
                  setOtpSent(false);
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
                    Receive a verification link by email
                  </div>
                </div>
              </Button>
            </div>
          )}

          {/* -------------------------------------- */}
          {/* PHONE VERIFICATION                     */}
          {/* -------------------------------------- */}

          {verificationMethod ===
            "phone" && (
            <div className="space-y-4 pt-4">
              <div className="rounded-lg bg-blue-50 p-4">
                <p className="text-sm">
                  We'll send an 8-digit verification
                  code to:
                </p>

                <p className="font-semibold mt-1">
                  {normalizePhoneNumber(
                    phoneNumber,
                  )}
                </p>
              </div>

              {!otpSent ? (
                <Button
                  type="button"
                  className="w-full bg-blue-600 hover:bg-blue-700"
                  onClick={
                    handleSendPhoneOTP
                  }
                  disabled={otpLoading}
                >
                  {otpLoading
                    ? "Sending Code..."
                    : "Send Verification Code"}
                </Button>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="otp">
                      8-Digit Verification Code
                    </Label>

                    <Input
                      id="otp"
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
                  setOtpSent(false);
                }}
                disabled={otpLoading}
              >
                ← Choose another method
              </Button>
            </div>
          )}

          {/* -------------------------------------- */}
          {/* EMAIL VERIFICATION                     */}
          {/* -------------------------------------- */}

          {verificationMethod ===
            "email" && (
            <div className="space-y-4 pt-4">
              <div className="rounded-lg bg-blue-50 p-4">
                <p className="text-sm">
                  We'll send a verification email to:
                </p>

                <p className="font-semibold mt-1 break-all">
                  {email.trim()}
                </p>
              </div>

              <Button
                type="button"
                className="w-full bg-blue-600 hover:bg-blue-700"
                onClick={
                  handleEmailVerification
                }
                disabled={otpLoading}
              >
                {otpLoading
                  ? "Sending Email..."
                  : "Send Verification Email"}
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
                disabled={otpLoading}
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
