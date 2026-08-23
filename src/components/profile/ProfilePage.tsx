import React, {
  useCallback,
  useEffect,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Shield,
  CheckCircle,
  Loader2,
  Mail,
  Lock,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ProfileData {
  full_name: string;
  phone_number: string;
  nickname: string;
  gender: string;
  date_of_birth: string;
  email: string;
  address: string;
  nin: string;
}

interface KycState {
  verified: boolean;
  kyc_level: number;
  kyc_status: string;
  bvn_masked: string | null;
  fee: number;
}

interface ProfilePageProps {
  onBack: () => void;
}

const ProfilePage = ({
  onBack,
}: ProfilePageProps) => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] =
    useState(false);

  const [kyc, setKyc] =
    useState<KycState | null>(null);

  const [kycLoading, setKycLoading] =
    useState(true);

  const [bvn, setBvn] =
    useState("");

  const [verifying, setVerifying] =
    useState(false);

  // --------------------------------------------------
  // EMAIL CHANGE STATE
  // --------------------------------------------------

  const [
    emailChangeDialogOpen,
    setEmailChangeDialogOpen,
  ] = useState(false);

  const [newEmail, setNewEmail] =
    useState("");

  const [emailChangeOtp, setEmailChangeOtp] =
    useState("");

  const [emailChangeLoading, setEmailChangeLoading] =
    useState(false);

  const [
    emailChangeRequested,
    setEmailChangeRequested,
  ] = useState(false);

  // --------------------------------------------------
  // FORM
  // --------------------------------------------------

  const form = useForm<ProfileData>({
    defaultValues: {
      full_name: "",
      phone_number: "+234",
      nickname: "",
      gender: "",
      date_of_birth: "",
      email: user?.email || "",
      address: "",
      nin: "",
    },
  });

  // --------------------------------------------------
  // PROVN BVN EDGE FUNCTION
  // --------------------------------------------------

  const invokeBvn = useCallback(
    async (
      payload: Record<string, unknown>,
    ) => {
      const {
        data,
        error,
      } = await supabase.functions.invoke(
        "provn-bvn",
        {
          body: payload,
        },
      );

      if (error) {
        let message =
          error.message ||
          "BVN request failed.";

        const context =
          (error as any)?.context;

        if (
          context &&
          typeof context.json ===
            "function"
        ) {
          try {
            const responseBody =
              await context.json();

            if (
              responseBody?.error
            ) {
              message =
                responseBody.error;
            }
          } catch {
            // Keep original error.
          }
        }

        throw new Error(message);
      }

      if (
        data &&
        data.success === false
      ) {
        throw new Error(
          data.error ||
            "BVN verification failed.",
        );
      }

      return data;
    },
    [],
  );

  // --------------------------------------------------
  // FETCH KYC STATUS FROM PROFILE
  // --------------------------------------------------

  const fetchKyc = useCallback(
    async () => {
      if (!user?.id) {
        setKycLoading(false);
        return;
      }

      setKycLoading(true);

      try {
        /*
         * BVN verification state is stored in
         * the user's profile.
         *
         * We do NOT call PROVN just to check
         * whether a user has already verified.
         */

        const {
          data,
          error,
        } = await supabase
          .from("profiles")
          .select(
            "bvn_verified, bvn, kyc_level, kyc_status",
          )
          .eq("id", user.id)
          .maybeSingle();

        if (error) {
          throw error;
        }

        const verified =
          Boolean(
            data?.bvn_verified,
          );

        const storedBvn =
          String(
            data?.bvn ?? "",
          );

        const maskedBvn =
          storedBvn.length === 11
            ? `*******${storedBvn.slice(-4)}`
            : null;

        setKyc({
          verified,
          kyc_level:
            Number(
              data?.kyc_level ?? 1,
            ),
          kyc_status:
            String(
              data?.kyc_status ??
                (verified
                  ? "verified"
                  : "unverified"),
            ),
          bvn_masked:
            maskedBvn,
          fee: 0,
        });
      } catch (error) {
        console.error(
          "Unable to load KYC status:",
          error,
        );

        /*
         * If the BVN columns have not yet been
         * added, don't break the whole profile page.
         */

        setKyc({
          verified: false,
          kyc_level: 1,
          kyc_status:
            "unverified",
          bvn_masked: null,
          fee: 0,
        });
      } finally {
        setKycLoading(false);
      }
    },
    [user?.id],
  );

  // --------------------------------------------------
  // FETCH PROFILE
  // --------------------------------------------------

  const fetchProfile = useCallback(
    async () => {
      if (!user?.id) return;

      const {
        data,
        error,
      } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        console.error(
          "Error fetching profile:",
          error,
        );
        return;
      }

      if (data) {
        form.reset({
          full_name:
            data.full_name || "",

          phone_number:
            data.phone_number ||
            "+234",

          nickname:
            data.nickname || "",

          gender:
            data.gender || "",

          date_of_birth:
            data.date_of_birth || "",

          email:
            user.email || "",

          address:
            data.address || "",

          nin:
            data.nin || "",
        });
      }
    },
    [
      form,
      user?.id,
      user?.email,
    ],
  );

  // --------------------------------------------------
  // INITIAL LOAD
  // --------------------------------------------------

  useEffect(() => {
    if (user?.id) {
      fetchProfile();
      fetchKyc();
    }
  }, [
    user?.id,
    fetchProfile,
    fetchKyc,
  ]);

  // --------------------------------------------------
  // SAVE PROFILE
  // --------------------------------------------------

  const onSubmit = async (
    data: ProfileData,
  ) => {
    if (!user?.id) return;

    setLoading(true);

    try {
      const {
        error,
      } = await supabase
        .from("profiles")
        .upsert({
          id: user.id,

          full_name:
            data.full_name,

          phone_number:
            data.phone_number,

          nickname:
            data.nickname,

          gender:
            data.gender || null,

          date_of_birth:
            data.date_of_birth ||
            null,

          email:
            user.email,

          address:
            data.address,

          nin:
            data.nin || null,

          updated_at:
            new Date().toISOString(),
        });

      if (error) {
        throw error;
      }

      toast({
        title:
          "Profile Updated",

        description:
          "Your profile has been successfully updated.",
      });
    } catch (error: any) {
      console.error(
        "Error updating profile:",
        error,
      );

      toast({
        title: "Error",

        description:
          error.message ||
          "Failed to update profile.",

        variant:
          "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // --------------------------------------------------
  // START EMAIL CHANGE
  // --------------------------------------------------

  const handleStartEmailChange =
    () => {
      const currentEmail =
        user?.email ||
        form.getValues("email");

      setNewEmail(
        currentEmail || "",
      );

      setEmailChangeOtp("");
      setEmailChangeRequested(false);
      setEmailChangeDialogOpen(true);
    };

  // --------------------------------------------------
  // SEND EMAIL CHANGE OTP
  // --------------------------------------------------

  const handleSendEmailChangeOtp =
    async () => {
      const normalizedNewEmail =
        newEmail
          .trim()
          .toLowerCase();

      const currentEmail =
        user?.email
          ?.trim()
          .toLowerCase();

      if (
        !normalizedNewEmail
      ) {
        toast({
          title:
            "Email required",

          description:
            "Enter the new email address.",

          variant:
            "destructive",
        });

        return;
      }

      if (
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
          normalizedNewEmail,
        )
      ) {
        toast({
          title:
            "Invalid email",

          description:
            "Enter a valid email address.",

          variant:
            "destructive",
        });

        return;
      }

      if (
        currentEmail &&
        normalizedNewEmail ===
          currentEmail
      ) {
        toast({
          title:
            "Same email address",

          description:
            "Enter a different email address.",

          variant:
            "destructive",
        });

        return;
      }

      setEmailChangeLoading(
        true,
      );

      try {
        const {
          error,
        } =
          await supabase.auth.updateUser(
            {
              email:
                normalizedNewEmail,
            },
          );

        if (error) {
          throw error;
        }

        setNewEmail(
          normalizedNewEmail,
        );

        setEmailChangeRequested(
          true,
        );

        setEmailChangeOtp("");

        toast({
          title:
            "Verification code sent",

          description:
            "Check the new email address for your verification code.",
        });
      } catch (error: any) {
        console.error(
          "Email change request error:",
          error,
        );

        toast({
          title:
            "Unable to change email",

          description:
            error.message ||
            "Unable to send the verification code.",

          variant:
            "destructive",
        });
      } finally {
        setEmailChangeLoading(
          false,
        );
      }
    };

  // --------------------------------------------------
  // VERIFY EMAIL CHANGE OTP
  // --------------------------------------------------

  const handleVerifyEmailChange =
    async () => {
      const normalizedNewEmail =
        newEmail
          .trim()
          .toLowerCase();

      const code =
        emailChangeOtp.trim();

      if (
        !/^\d{6}$/.test(code)
      ) {
        toast({
          title:
            "Invalid verification code",

          description:
            "Enter the 6-digit code sent to your new email address.",

          variant:
            "destructive",
        });

        return;
      }

      setEmailChangeLoading(
        true,
      );

      try {
        const {
          data,
          error,
        } =
          await supabase.auth.verifyOtp(
            {
              email:
                normalizedNewEmail,

              token: code,

              type:
                "email_change",
            },
          );

        if (error) {
          throw error;
        }

        const updatedEmail =
          data?.user?.email ||
          normalizedNewEmail;

        form.setValue(
          "email",
          updatedEmail,
        );

        setEmailChangeDialogOpen(
          false,
        );

        setEmailChangeRequested(
          false,
        );

        setEmailChangeOtp("");

        toast({
          title:
            "Email changed successfully",

          description:
            "Your email address has been updated successfully.",
        });

        await fetchProfile();
      } catch (error: any) {
        console.error(
          "Email change verification error:",
          error,
        );

        toast({
          title:
            "Verification failed",

          description:
            error.message ||
            "The email verification code is incorrect or expired.",

          variant:
            "destructive",
        });
      } finally {
        setEmailChangeLoading(
          false,
        );
      }
    };

  // --------------------------------------------------
  // RESEND EMAIL CHANGE OTP
  // --------------------------------------------------

  const handleResendEmailChangeOtp =
    async () => {
      await handleSendEmailChangeOtp();
    };

  // --------------------------------------------------
  // CANCEL EMAIL CHANGE
  // --------------------------------------------------

  const handleCancelEmailChange =
    () => {
      setEmailChangeDialogOpen(
        false,
      );

      setEmailChangeRequested(
        false,
      );

      setEmailChangeOtp("");
    };

  // --------------------------------------------------
  // BVN VERIFICATION
  // --------------------------------------------------

  const handleVerifyBvn =
    async () => {
      const digits =
        bvn.replace(/\D/g, "");

      if (
        digits.length !== 11
      ) {
        toast({
          title:
            "Invalid BVN",

          description:
            "Your BVN must be exactly 11 digits.",

          variant:
            "destructive",
        });

        return;
      }

      const fullName =
        form
          .getValues(
            "full_name",
          )
          .trim();

      if (
        !fullName ||
        fullName.split(/\s+/)
          .length < 2
      ) {
        toast({
          title:
            "Full name required",

          description:
            "Enter your first and last name as they appear on your BVN, then save your profile first.",

          variant:
            "destructive",
        });

        return;
      }

      /*
       * Make sure the profile is saved before
       * sending the BVN verification request.
       */

      try {
        const {
          error:
            profileError,
        } = await supabase
          .from("profiles")
          .upsert({
            id: user?.id,

            full_name:
              fullName,

            phone_number:
              form.getValues(
                "phone_number",
              ),

            nickname:
              form.getValues(
                "nickname",
              ),

            gender:
              form.getValues(
                "gender",
              ) || null,

            date_of_birth:
              form.getValues(
                "date_of_birth",
              ) || null,

            email:
              user?.email,

            address:
              form.getValues(
                "address",
              ),

            nin:
              form.getValues(
                "nin",
              ) || null,

            updated_at:
              new Date().toISOString(),
          });

        if (profileError) {
          throw profileError;
        }
      } catch (error: any) {
        toast({
          title:
            "Save profile first",

          description:
            error.message ||
            "Unable to save your profile before BVN verification.",

          variant:
            "destructive",
        });

        return;
      }

      setVerifying(true);

      try {
        /*
         * IMPORTANT:
         *
         * This calls:
         *
         * supabase/functions/provn-bvn
         */

        const result =
          await invokeBvn({
            bvn: digits,
          });

        if (
          !result?.verified
        ) {
          throw new Error(
            result?.error ||
              "BVN verification was not successful.",
          );
        }

        /*
         * BVN verification succeeded.
         *
         * Store the verification state in the
         * user's profile.
         *
         * We store only the BVN itself here if
         * your database already has a protected
         * bvn column. The UI never displays the
         * complete BVN.
         */

        if (!user?.id) {
          throw new Error(
            "User session not found.",
          );
        }

        const {
          error:
            updateKycError,
        } = await supabase
          .from("profiles")
          .update({
            bvn: digits,

            bvn_verified:
              true,

            kyc_level: 2,

            kyc_status:
              "verified",

            updated_at:
              new Date().toISOString(),
          })
          .eq(
            "id",
            user.id,
          );

        if (updateKycError) {
          throw updateKycError;
        }

        /*
         * Optionally synchronize the verified
         * identity information returned by PROVN
         * with the profile.
         *
         * Only fill empty profile fields so
         * existing user-entered information is
         * not unexpectedly overwritten.
         */

        const verification =
          result?.verification;

        const currentProfile =
          form.getValues();

        const profileIdentityUpdate: Record<
          string,
          unknown
        > = {};

        if (
          !currentProfile.full_name &&
          verification?.first_name
        ) {
          profileIdentityUpdate.full_name =
            [
              verification.first_name,
              verification.middle_name,
              verification.last_name,
            ]
              .filter(Boolean)
              .join(" ");
        }

        if (
          !currentProfile.phone_number ||
          currentProfile.phone_number ===
            "+234"
        ) {
          if (
            verification?.phone_number
          ) {
            profileIdentityUpdate.phone_number =
              verification.phone_number;
          }
        }

        if (
          !currentProfile.date_of_birth &&
          verification?.date_of_birth
        ) {
          profileIdentityUpdate.date_of_birth =
            verification.date_of_birth;
        }

        if (
          Object.keys(
            profileIdentityUpdate,
          ).length > 0
        ) {
          await supabase
            .from("profiles")
            .update({
              ...profileIdentityUpdate,

              updated_at:
                new Date().toISOString(),
            })
            .eq(
              "id",
              user.id,
            );
        }

        /*
         * Refresh the displayed KYC state.
         */

        await fetchKyc();
        await fetchProfile();

        setBvn("");

        toast({
          title:
            "BVN verified successfully",

          description:
            "Your BVN has been verified and your account has been upgraded to KYC Level 2.",
        });
      } catch (error: any) {
        console.error(
          "BVN verification error:",
          error,
        );

        toast({
          title:
            "Verification failed",

          description:
            error.message ||
            "Unable to verify your BVN.",

          variant:
            "destructive",
        });
      } finally {
        setVerifying(false);
      }
    };

  // --------------------------------------------------
  // KYC LEVEL
  // --------------------------------------------------

  const getKYCLevelInfo =
    (level: number) => {
      switch (level) {
        case 2:
          return {
            text:
              "Verified (₦200,000 limit)",

            color:
              "text-blue-100",
          };

        case 3:
          return {
            text:
              "Premium (₦1,000,000 limit)",

            color:
              "text-blue-100",
          };

        default:
          return {
            text:
              "Basic (₦50,000 limit)",

            color:
              "text-blue-100",
          };
      }
    };

  const kycInfo =
    getKYCLevelInfo(
      kyc?.kyc_level ?? 1,
    );

  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-sky-50 to-indigo-50">
        <div className="max-w-4xl mx-auto px-4 py-6">

          {/* HEADER */}

          <div className="flex items-center gap-4 mb-6">
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
              className="text-blue-600"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>

            <h1 className="text-2xl font-bold text-gray-900">
              Personal Information
            </h1>
          </div>

          {/* KYC LEVEL CARD */}

          <Card className="mb-6 bg-gradient-to-r from-blue-600 to-indigo-600 text-primary-foreground">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold mb-1">
                    Account Level
                  </h3>

                  <p
                    className={`text-sm ${kycInfo.color}`}
                  >
                    {kycInfo.text}
                  </p>

                  <p className="text-xs mt-1 opacity-90">
                    {kycLoading
                      ? "Checking verification status..."
                      : kyc?.verified
                        ? `BVN verified ${
                            kyc.bvn_masked
                              ? `(${kyc.bvn_masked})`
                              : ""
                          }`
                        : `BVN status: ${
                            kyc?.kyc_status ??
                            "unverified"
                          }`}
                  </p>
                </div>

                {kyc?.verified ? (
                  <CheckCircle className="h-8 w-8" />
                ) : (
                  <Shield className="h-8 w-8" />
                )}
              </div>
            </CardContent>
          </Card>

          {/* BVN VERIFICATION */}

          <Card className="mb-6">
            <CardHeader>
              <CardTitle>
                BVN Verification
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
              {kyc?.verified ? (
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <CheckCircle className="h-4 w-4" />

                  Your BVN has been successfully
                  verified.
                </div>
              ) : (
                <>
                  <p className="text-sm text-gray-500">
                    Verify your BVN to upgrade your
                    IyanjuPay account to KYC Level 2.
                  </p>

                  <div className="space-y-2">
                    <Label htmlFor="bvnInput">
                      BVN
                    </Label>

                    <Input
                      id="bvnInput"
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={11}
                      placeholder="Enter your 11-digit BVN"
                      value={bvn}
                      onChange={(e) =>
                        setBvn(
                          e.target.value
                            .replace(
                              /\D/g,
                              "",
                            )
                            .slice(
                              0,
                              11,
                            ),
                        )
                      }
                    />
                  </div>

                  <Button
                    type="button"
                    className="bg-blue-600 hover:bg-blue-700"
                    onClick={
                      handleVerifyBvn
                    }
                    disabled={
                      verifying ||
                      kycLoading ||
                      bvn.length !== 11
                    }
                  >
                    {verifying ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Verifying BVN...
                      </>
                    ) : (
                      "Verify BVN"
                    )}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          {/* PROFILE FORM */}

          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(
                onSubmit,
              )}
              className="space-y-6"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* BASIC INFORMATION */}

                <Card>
                  <CardHeader>
                    <CardTitle>
                      Basic Information
                    </CardTitle>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    <FormField
                      control={
                        form.control
                      }
                      name="full_name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Full Name
                          </FormLabel>

                          <FormControl>
                            <Input
                              placeholder="Enter your full name"
                              {...field}
                            />
                          </FormControl>

                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={
                        form.control
                      }
                      name="nickname"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Nickname
                          </FormLabel>

                          <FormControl>
                            <Input
                              placeholder="Enter your nickname"
                              {...field}
                            />
                          </FormControl>

                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={
                        form.control
                      }
                      name="gender"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Gender
                          </FormLabel>

                          <Select
                            onValueChange={
                              field.onChange
                            }
                            value={
                              field.value
                            }
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select gender" />
                              </SelectTrigger>
                            </FormControl>

                            <SelectContent>
                              <SelectItem value="male">
                                Male
                              </SelectItem>

                              <SelectItem value="female">
                                Female
                              </SelectItem>

                              <SelectItem value="other">
                                Other
                              </SelectItem>
                            </SelectContent>
                          </Select>

                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={
                        form.control
                      }
                      name="date_of_birth"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Date of Birth
                          </FormLabel>

                          <FormControl>
                            <Input
                              type="date"
                              {...field}
                            />
                          </FormControl>

                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                {/* CONTACT INFORMATION */}

                <Card>
                  <CardHeader>
                    <CardTitle>
                      Contact Information
                    </CardTitle>
                  </CardHeader>

                  <CardContent className="space-y-4">

                    {/* PHONE */}

                    <FormField
                      control={
                        form.control
                      }
                      name="phone_number"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Mobile Number
                          </FormLabel>

                          <FormControl>
                            <Input
                              placeholder="+234XXXXXXXXXX"
                              {...field}
                              disabled
                            />
                          </FormControl>

                          <p className="text-xs text-muted-foreground">
                            Your verified phone number
                            is managed through OTP
                            verification.
                          </p>

                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* EMAIL */}

                    <div className="space-y-2">
                      <Label>
                        Email Address
                      </Label>

                      <div className="flex gap-2">
                        <Input
                          type="email"
                          value={
                            user?.email ||
                            form.watch(
                              "email",
                            )
                          }
                          disabled
                          className="flex-1"
                        />

                        <Button
                          type="button"
                          variant="outline"
                          onClick={
                            handleStartEmailChange
                          }
                        >
                          <Mail className="h-4 w-4 mr-2" />
                          Change
                        </Button>
                      </div>

                      <p className="text-xs text-muted-foreground">
                        Changing your email requires
                        OTP verification.
                      </p>
                    </div>

                    {/* ADDRESS */}

                    <FormField
                      control={
                        form.control
                      }
                      name="address"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Address
                          </FormLabel>

                          <FormControl>
                            <Input
                              placeholder="Enter your address"
                              {...field}
                            />
                          </FormControl>

                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* NIN */}

                    <FormField
                      control={
                        form.control
                      }
                      name="nin"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            NIN (National Identification Number)
                          </FormLabel>

                          <FormControl>
                            <Input
                              placeholder="Enter your NIN"
                              maxLength={11}
                              {...field}
                            />
                          </FormControl>

                          <FormMessage />
                        </FormItem>
                      )}
                    />

                  </CardContent>
                </Card>
              </div>

              {/* UPDATE PROFILE */}

              <Button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700"
                disabled={loading}
              >
                {loading
                  ? "Updating..."
                  : "Update Profile"}
              </Button>
            </form>
          </Form>
        </div>
      </div>

      {/* CHANGE EMAIL DIALOG */}

      <Dialog
        open={
          emailChangeDialogOpen
        }
        onOpenChange={(open) => {
          if (!emailChangeLoading) {
            if (!open) {
              handleCancelEmailChange();
            } else {
              setEmailChangeDialogOpen(
                true,
              );
            }
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <div className="space-y-5">

            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="rounded-full bg-blue-100 p-2">
                  <Lock className="h-5 w-5 text-blue-700" />
                </div>

                <h2 className="text-xl font-semibold text-[#082A63]">
                  Change Email Address
                </h2>
              </div>

              <p className="text-sm text-muted-foreground">
                Enter your new email address.
                IyanjuPay will send a verification
                code to confirm the change.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-email">
                New Email Address
              </Label>

              <Input
                id="new-email"
                type="email"
                value={newEmail}
                onChange={(e) =>
                  setNewEmail(
                    e.target.value,
                  )
                }
                placeholder="new@email.com"
                disabled={
                  emailChangeRequested
                }
              />
            </div>

            {!emailChangeRequested ? (
              <Button
                type="button"
                className="w-full bg-[#082A63] hover:bg-[#061F49]"
                onClick={
                  handleSendEmailChangeOtp
                }
                disabled={
                  emailChangeLoading
                }
              >
                {emailChangeLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending Code...
                  </>
                ) : (
                  "Send Verification Code"
                )}
              </Button>
            ) : (
              <>
                <div className="rounded-lg bg-blue-50 p-4">
                  <p className="text-sm text-gray-700">
                    We sent a verification code
                    to:
                  </p>

                  <p className="mt-1 font-semibold text-[#082A63] break-all">
                    {newEmail}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email-change-otp">
                    Verification Code
                  </Label>

                  <Input
                    id="email-change-otp"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={
                      emailChangeOtp
                    }
                    onChange={(e) =>
                      setEmailChangeOtp(
                        e.target.value
                          .replace(
                            /\D/g,
                            "",
                          )
                          .slice(
                            0,
                            6,
                          ),
                      )
                    }
                    placeholder="Enter 6-digit code"
                    className="text-center text-xl tracking-[0.35em]"
                  />
                </div>

                <Button
                  type="button"
                  className="w-full bg-[#082A63] hover:bg-[#061F49]"
                  onClick={
                    handleVerifyEmailChange
                  }
                  disabled={
                    emailChangeLoading ||
                    !/^\d{6}$/.test(
                      emailChangeOtp,
                    )
                  }
                >
                  {emailChangeLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    "Verify Email Change"
                  )}
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={
                    handleResendEmailChangeOtp
                  }
                  disabled={
                    emailChangeLoading
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
              onClick={
                handleCancelEmailChange
              }
              disabled={
                emailChangeLoading
              }
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ProfilePage;
