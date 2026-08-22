import React, { useState } from "react";
import {
  Button,
} from "@/components/ui/button";
import {
  Input,
} from "@/components/ui/input";
import {
  Label,
} from "@/components/ui/label";
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

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");

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

    // Nigerian local format:
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

    const normalizedPhone = normalizePhoneNumber(phoneNumber);

    setIsLoading(true);

    try {
      const { data, error } = await supabase.auth.signUp({
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
        throw new Error("Unable to create your account.");
      }

      // Store the phone number in profiles as well.
      const { error: profileError } = await supabase
        .from("profiles")
        .upsert(
          {
            id: data.user.id,
            full_name: fullName.trim(),
            phone_number: normalizedPhone,
            email: email.trim(),
          },
          {
            onConflict: "id",
          },
        );

      if (profileError) {
        console.error("Profile update error:", profileError);
      }

      // Open verification choice.
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
        description: error.message || "Something went wrong.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // --------------------------------------------------
  // PHONE OTP - SEND
  // --------------------------------------------------

  const handleSendPhoneOTP = async () => {
    const normalizedPhone = normalizePhoneNumber(phoneNumber);

    if (!normalizedPhone) {
      toast({
        title: "Phone number required",
        description: "Please enter a valid phone number.",
        variant: "destructive",
      });
      return;
    }

    setOtpLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke(
        "twilio-verify",
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
          data?.error || "Unable to send verification code.",
        );
      }

      setOtpSent(true);

      toast({
        title: "Verification code sent",
        description: `A verification code was sent to ${normalizedPhone}.`,
      });
    } catch (error: any) {
      console.error("Send OTP error:", error);

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
  // PHONE OTP - VERIFY
  // --------------------------------------------------

  const handleVerifyPhoneOTP = async () => {
    const normalizedPhone = normalizePhoneNumber(phoneNumber);

    if (!otp.trim()) {
      toast({
        title: "Code required",
        description: "Enter the verification code you received.",
        variant: "destructive",
      });
      return;
    }

    setOtpLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke(
        "twilio-verify",
        {
          body: {
            action: "check",
            phone: normalizedPhone,
            code: otp.trim(),
          },
        },
      );

      if (error) {
        throw error;
      }

      if (!data?.verified) {
        throw new Error(
          data?.message || "Invalid verification code.",
        );
      }

      // Get the currently authenticated user.
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error(
          "Your account session could not be found. Please sign in again.",
        );
      }

      // Mark phone as verified.
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          phone_verified: true,
          phone_verified_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (profileError) {
        throw profileError;
      }

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
      console.error("Verify OTP error:", error);

      toast({
        title: "Verification failed",
        description:
          error.message || "The verification code is incorrect.",
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
      console.error("Email verification error:", error);

      toast({
        title: "Unable to send email",
        description:
          error.message ||
          "Please try again.",
        variant: "destructive",
      });
    } finally {
      setOtpLoading(false);
    }
  };

  // --------------------------------------------------
  // SIGN IN
  // --------------------------------------------------

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { error } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

      if (error) throw error;

      toast({
        title: "Welcome back!",
        description:
          "You have successfully signed in.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
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
    if (!email.trim()) {
      toast({
        title: "Email required",
        description:
          "Please enter your email address first.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const { error } =
        await supabase.auth.resetPasswordForEmail(
          email.trim(),
          {
            redirectTo:
              `${window.location.origin}/reset-password`,
          },
        );

      if (error) throw error;

      toast({
        title: "Reset link sent",
        description:
          "Please check your email for the password reset link.",
      });
    } catch (error: any) {
      toast({
        title: "Unable to send reset link",
        description: error.message,
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

              {/* SIGN IN */}
              <TabsContent value="signin">
                <form
                  onSubmit={handleSignIn}
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <Label htmlFor="signin-email">
                      Email
                    </Label>

                    <Input
                      id="signin-email"
                      type="email"
                      value={email}
                      onChange={(e) =>
                        setEmail(e.target.value)
                      }
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
                        setPassword(e.target.value)
                      }
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
                    onClick={handleForgotPassword}
                    disabled={isLoading}
                    className="w-full text-sm text-blue-600 hover:text-blue-700 hover:underline disabled:opacity-50"
                  >
                    Forgot password?
                  </button>
                </form>
              </TabsContent>

              {/* SIGN UP */}
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
                        setFullName(e.target.value)
                      }
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
                        setPhoneNumber(e.target.value)
                      }
                      placeholder="+2348012345678"
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
                        setEmail(e.target.value)
                      }
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
                        setPassword(e.target.value)
                      }
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

      {/* VERIFICATION DIALOG */}
      <Dialog
        open={verificationDialogOpen}
        onOpenChange={(open) => {
          if (!otpLoading) {
            setVerificationDialogOpen(open);
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

          {/* METHOD SELECTION */}
          {!verificationMethod && (
            <div className="space-y-3 pt-4">
              <Button
                type="button"
                variant="outline"
                className="w-full h-16 justify-start"
                onClick={() => {
                  setVerificationMethod("phone");
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
                    Receive a verification code by SMS
                  </div>
                </div>
              </Button>

              <Button
                type="button"
                variant="outline"
                className="w-full h-16 justify-start"
                onClick={() => {
                  setVerificationMethod("email");
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

          {/* PHONE VERIFICATION */}
          {verificationMethod === "phone" && (
            <div className="space-y-4 pt-4">
              <div className="rounded-lg bg-blue-50 p-4">
                <p className="text-sm">
                  We'll send a verification code to:
                </p>

                <p className="font-semibold mt-1">
                  {normalizePhoneNumber(phoneNumber)}
                </p>
              </div>

              {!otpSent ? (
                <Button
                  type="button"
                  className="w-full bg-blue-600 hover:bg-blue-700"
                  onClick={handleSendPhoneOTP}
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
                      Verification Code
                    </Label>

                    <Input
                      id="otp"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={otp}
                      onChange={(e) =>
                        setOtp(
                          e.target.value.replace(
                            /\D/g,
                            "",
                          ),
                        )
                      }
                      placeholder="Enter 6-digit code"
                      className="text-center text-xl tracking-widest"
                    />
                  </div>

                  <Button
                    type="button"
                    className="w-full bg-blue-600 hover:bg-blue-700"
                    onClick={handleVerifyPhoneOTP}
                    disabled={
                      otpLoading ||
                      otp.length !== 6
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
                    onClick={handleSendPhoneOTP}
                    disabled={otpLoading}
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
                  setVerificationMethod(null);
                  setOtp("");
                  setOtpSent(false);
                }}
                disabled={otpLoading}
              >
                ← Choose another method
              </Button>
            </div>
          )}

          {/* EMAIL VERIFICATION */}
          {verificationMethod === "email" && (
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
                onClick={handleEmailVerification}
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
                  setVerificationMethod(null)
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
