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
  // ERROR HANDLING HELPERS
  // ============================================================

  const isOnline = (): boolean => {
    return typeof navigator === "undefined"
      ? true
      : navigator.onLine;
  };

  const isNetworkError = (error: unknown): boolean => {
    if (!error) {
      return false;
    }

    const errorObject =
      typeof error === "object"
        ? (error as {
            message?: string;
            name?: string;
            code?: string;
            status?: number;
            context?: Response;
          })
        : null;

    const message = String(
      errorObject?.message ?? error ?? "",
    ).toLowerCase();

    const name = String(
      errorObject?.name ?? "",
    ).toLowerCase();

    const code = String(
      errorObject?.code ?? "",
    ).toLowerCase();

    const status = errorObject?.status;

    if (
      message.includes("failed to fetch") ||
      message.includes("fetch failed") ||
      message.includes("network error") ||
      message.includes("network request failed") ||
      message.includes("networkerror") ||
      message.includes("internet") ||
      message.includes("connection refused") ||
      message.includes("connection reset") ||
      message.includes("connection timed out") ||
      message.includes("timed out") ||
      message.includes("offline") ||
      name.includes("networkerror") ||
      name.includes("typeerror") &&
        message.includes("fetch") ||
      code === "network_error" ||
      code === "err_network"
    ) {
      return true;
    }

    if (
      status === 0 ||
      status === 502 ||
      status === 503 ||
      status === 504
    ) {
      return true;
    }

    return false;
  };

  const getEdgeFunctionErrorMessage =
    async (
      error: unknown,
      fallback: string,
    ): Promise<string> => {
      if (!isOnline()) {
        return "No internet connection. Please check your internet connection and try again.";
      }

      if (isNetworkError(error)) {
        return "Unable to connect to the server. Please check your internet connection and try again.";
      }

      try {
        const errorObject =
          typeof error === "object" &&
          error !== null
            ? (error as {
                context?: unknown;
                message?: string;
                error_description?: string;
                details?: string;
                hint?: string;
                code?: string;
              })
            : null;

        if (errorObject?.context) {
          const response =
            errorObject.context instanceof Response
              ? errorObject.context.clone()
              : errorObject.context;

          if (
            response &&
            typeof (
              response as {
                json?: () => Promise<unknown>;
              }
            ).json === "function"
          ) {
            try {
              const data =
                await (
                  response as {
                    json: () => Promise<unknown>;
                  }
                ).json();

              if (
                data &&
                typeof data === "object"
              ) {
                const body =
                  data as {
                    error?: unknown;
                    message?: unknown;
                    detail?: unknown;
                    error_description?: unknown;
                  };

                if (
                  typeof body.error === "string" &&
                  body.error.trim()
                ) {
                  return body.error.trim();
                }

                if (
                  typeof body.message === "string" &&
                  body.message.trim()
                ) {
                  return body.message.trim();
                }

                if (
                  typeof body.detail === "string" &&
                  body.detail.trim()
                ) {
                  return body.detail.trim();
                }

                if (
                  typeof body.error_description ===
                    "string" &&
                  body.error_description.trim()
                ) {
                  return body.error_description.trim();
                }
              }
            } catch (jsonError) {
              console.warn(
                "Unable to parse Edge Function JSON error:",
                jsonError,
              );
            }

            try {
              if (
                typeof (
                  response as {
                    text?: () => Promise<string>;
                  }
                ).text === "function"
              ) {
                const text =
                  await (
                    response as {
                      text: () => Promise<string>;
                    }
                  ).text();

                if (text.trim()) {
                  try {
                    const parsed =
                      JSON.parse(text) as {
                        error?: unknown;
                        message?: unknown;
                        detail?: unknown;
                      };

                    if (
                      typeof parsed.error === "string" &&
                      parsed.error.trim()
                    ) {
                      return parsed.error.trim();
                    }

                    if (
                      typeof parsed.message ===
                        "string" &&
                      parsed.message.trim()
                    ) {
                      return parsed.message.trim();
                    }

                    if (
                      typeof parsed.detail === "string" &&
                      parsed.detail.trim()
                    ) {
                      return parsed.detail.trim();
                    }
                  } catch {
                    if (text.trim()) {
                      return text.trim();
                    }
                  }
                }
              }
            } catch (textError) {
              console.warn(
                "Unable to parse Edge Function text error:",
                textError,
              );
            }
          }
        }

        if (
          typeof errorObject?.error_description ===
            "string" &&
          errorObject.error_description.trim()
        ) {
          return errorObject.error_description.trim();
        }

        if (
          typeof errorObject?.message === "string" &&
          errorObject.message.trim() &&
          errorObject.message !==
            "Edge Function returned a non-2xx status code"
        ) {
          return errorObject.message.trim();
        }

        if (
          typeof errorObject?.details === "string" &&
          errorObject.details.trim()
        ) {
          return errorObject.details.trim();
        }

        if (
          typeof errorObject?.hint === "string" &&
          errorObject.hint.trim()
        ) {
          return errorObject.hint.trim();
        }
      } catch (parseError) {
        console.error(
          "Unable to extract Edge Function error:",
          parseError,
        );
      }

      return fallback;
    };

  const getGeneralErrorMessage = (
    error: unknown,
    fallback: string,
  ): string => {
    if (!isOnline()) {
      return "No internet connection. Please check your internet connection and try again.";
    }

    if (isNetworkError(error)) {
      return "Unable to connect to the server. Please check your internet connection and try again.";
    }

    if (
      error &&
      typeof error === "object"
    ) {
      const errorObject =
        error as {
          message?: unknown;
          error_description?: unknown;
          details?: unknown;
          hint?: unknown;
        };

      if (
        typeof errorObject.message === "string" &&
        errorObject.message.trim()
      ) {
        return errorObject.message.trim();
      }

      if (
        typeof errorObject.error_description ===
          "string" &&
        errorObject.error_description.trim()
      ) {
        return errorObject.error_description.trim();
      }

      if (
        typeof errorObject.details === "string" &&
        errorObject.details.trim()
      ) {
        return errorObject.details.trim();
      }

      if (
        typeof errorObject.hint === "string" &&
        errorObject.hint.trim()
      ) {
        return errorObject.hint.trim();
      }
    }

    if (typeof error === "string" && error.trim()) {
      return error.trim();
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
  // DETERMINE INITIAL TAB
  // ============================================================

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

      sessionStorage.setItem(
        "iyanjupay_referral_code",
        cleanedReferral,
      );
    } else {
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

    if (!isOnline()) {
      toast({
        title: "No internet connection",
        description:
          "Please check your internet connection and try again.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
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
              referral_code:
                normalizedReferral || null,
            },
          },
        });

      if (error) {
        const message =
          await getEdgeFunctionErrorMessage(
            error,
            "Unable to create your account. Please try again.",
          );

        throw new Error(message);
      }

      if (!data.user) {
        throw new Error(
          "Unable to create your account. Please try again.",
        );
      }

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
    } catch (error: unknown) {
      console.error(
        "Signup error:",
        error,
      );

      toast({
        title:
          isNetworkError(error) ||
          !isOnline()
            ? "Connection problem"
            : "Unable to create account",
        description:
          getGeneralErrorMessage(
            error,
            "Something went wrong while creating your account. Please try again.",
          ),
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

      if (!isOnline()) {
        toast({
          title: "No internet connection",
          description:
            "Please check your internet connection and try again.",
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
              data?.message ||
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
      } catch (error: unknown) {
        console.error(
          "Termii send OTP error:",
          error,
        );

        toast({
          title:
            isNetworkError(error) ||
            !isOnline()
              ? "Connection problem"
              : "Unable to send code",
          description:
            getGeneralErrorMessage(
              error,
              "Please check your connection and try again.",
            ),
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

      if (!isOnline()) {
        toast({
          title: "No internet connection",
          description:
            "Please check your internet connection and try again.",
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
      } catch (error: unknown) {
        console.error(
          "Termii verify OTP error:",
          error,
        );

        toast({
          title:
            isNetworkError(error) ||
            !isOnline()
              ? "Connection problem"
              : "Verification failed",
          description:
            getGeneralErrorMessage(
              error,
              "The 8-digit verification code is incorrect.",
            ),
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

      if (!isOnline()) {
        toast({
          title: "No internet connection",
          description:
            "Please check your internet connection and try again.",
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
          const message =
            await getEdgeFunctionErrorMessage(
              error,
              "Unable to send verification code.",
            );

          throw new Error(message);
        }

        sessionStorage.setItem(
          "iyanjupay_signup_email",
          normalizedEmail,
        );

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
      } catch (error: unknown) {
        console.error(
          "Email OTP send error:",
          error,
        );

        toast({
          title:
            isNetworkError(error) ||
            !isOnline()
              ? "Connection problem"
              : "Unable to send verification code",
          description:
            getGeneralErrorMessage(
              error,
              "Please check your connection and try again.",
            ),
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

    if (!isOnline()) {
      toast({
        title: "No internet connection",
        description:
          "Please check your internet connection and try again.",
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

      if (
        !data.session.access_token ||
        !data.session.refresh_token
      ) {
        throw new Error(
          "Login succeeded, but a valid session could not be established. Please try again.",
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
        const message =
          await getEdgeFunctionErrorMessage(
            sessionError,
            "Unable to establish your login session.",
          );

        throw new Error(message);
      }

      toast({
        title:
          "Welcome back!",
        description:
          "You have successfully signed in.",
      });
    } catch (error: unknown) {
      console.error(
        "Sign-in error:",
        error,
      );

      toast({
        title:
          isNetworkError(error) ||
          !isOnline()
            ? "Connection problem"
            : "Unable to sign in",
        description:
          getGeneralErrorMessage(
            error,
            "Invalid login credentials. Please check your details and try again.",
          ),
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
