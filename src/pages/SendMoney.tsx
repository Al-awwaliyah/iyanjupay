import React, {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Loader2,
  Search,
  Send,
  User,
} from "lucide-react";

import {
  useNavigate,
} from "react-router-dom";

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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  useToast,
} from "@/hooks/use-toast";

import {
  supabase,
} from "@/integrations/supabase/client";

import PaymentPinModal from "@/components/security/PaymentPinModal";


// ============================================================
// TYPES
// ============================================================

interface Bank {
  name: string;
  code: string;
}

interface ResolvedAccount {
  account_number: string;
  account_name: string;
  bank_code: string;
}

interface ResolvedIyanjuPayRecipient {
  wallet_id: string;
  name: string;
  full_name?: string | null;
  nickname?: string | null;
}

type TransferType =
  | "iyanjupay"
  | "bank";


// ============================================================
// FEES
// ============================================================

const IYANJUPAY_TRANSFER_FEE = 0;
const BANK_TRANSFER_FEE = 10;


// ============================================================
// SEND MONEY PAGE
// ============================================================

const SendMoney = () => {

  const navigate = useNavigate();

  const { toast } = useToast();


  // ==========================================================
  // TRANSFER TYPE
  // ==========================================================

  const [
    transferType,
    setTransferType,
  ] = useState<TransferType>(
    "iyanjupay"
  );


  // ==========================================================
  // WALLET BALANCE
  // ==========================================================

  const [
    walletBalance,
    setWalletBalance,
  ] = useState(0);

  const [
    balanceLoading,
    setBalanceLoading,
  ] = useState(true);


  // ==========================================================
  // FORM
  // ==========================================================

  const [
    amount,
    setAmount,
  ] = useState("");

  const [
    narration,
    setNarration,
  ] = useState("");


  // ==========================================================
  // IYANJUPAY
  // ==========================================================

  const [
    iyanjupayWalletId,
    setIyanjuPayWalletId,
  ] = useState("");

  const [
    resolvedIyanjuPayRecipient,
    setResolvedIyanjuPayRecipient,
  ] =
    useState<ResolvedIyanjuPayRecipient | null>(
      null
    );

  const [
    resolvingIyanjuPayRecipient,
    setResolvingIyanjuPayRecipient,
  ] = useState(false);


  const iyanjuPayResolveRequestRef =
    useRef(0);


  // ==========================================================
  // BANK
  // ==========================================================

  const [
    bank,
    setBank,
  ] = useState("");

  const [
    bankSearch,
    setBankSearch,
  ] = useState("");

  const [
    accountNumber,
    setAccountNumber,
  ] = useState("");

  const [
    banks,
    setBanks,
  ] = useState<Bank[]>([]);

  const [
    banksLoading,
    setBanksLoading,
  ] = useState(false);

  const [
    resolvedAccount,
    setResolvedAccount,
  ] =
    useState<ResolvedAccount | null>(
      null
    );

  const [
    resolving,
    setResolving,
  ] = useState(false);

  const resolveRequestRef =
    useRef(0);


  // ==========================================================
  // PAYMENT PIN
  // ==========================================================

  const [
    paymentPinOpen,
    setPaymentPinOpen,
  ] = useState(false);


  // ==========================================================
  // PROCESSING
  // ==========================================================

  const [
    processing,
    setProcessing,
  ] = useState(false);


  // ==========================================================
  // LOAD WALLET BALANCE
  // ==========================================================

  useEffect(() => {

    let mounted = true;

    const loadBalance =
      async () => {

        try {

          setBalanceLoading(true);

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
              "Your login session has expired."
            );
          }


          const {
            data,
            error,
          } =
            await supabase
              .from("wallets")
              .select("balance")
              .eq(
                "user_id",
                user.id
              )
              .maybeSingle();


          if (error) {
            throw error;
          }


          if (mounted) {

            setWalletBalance(
              Number(
                data?.balance ?? 0
              )
            );

          }

        } catch (error: any) {

          console.error(
            "Wallet balance loading error:",
            error
          );

          if (mounted) {

            toast({
              title:
                "Unable to load wallet balance",
              description:
                error?.message ||
                "Please try again.",
              variant:
                "destructive",
            });

          }

        } finally {

          if (mounted) {
            setBalanceLoading(false);
          }

        }

      };


    loadBalance();


    return () => {
      mounted = false;
    };

  }, [toast]);


  // ==========================================================
  // LOAD BANKS
  // ==========================================================

  useEffect(() => {

    const loadBanks =
      async () => {

        setBanksLoading(true);

        try {

          const {
            data,
            error,
          } =
            await supabase.functions.invoke(
              "flutterwave-banks"
            );


          if (error) {
            throw error;
          }


          if (
            !data?.success ||
            !Array.isArray(
              data?.banks
            )
          ) {

            throw new Error(
              data?.error ||
              "Unable to load banks."
            );

          }


          setBanks(
            data.banks
          );

        } catch (error: any) {

          console.error(
            "Bank loading error:",
            error
          );

          toast({
            title:
              "Unable to load banks",
            description:
              error?.message ||
              "Please try again later.",
            variant:
              "destructive",
          });

        } finally {

          setBanksLoading(false);

        }

      };


    loadBanks();

  }, [toast]);


  // ==========================================================
  // FILTER BANKS
  // ==========================================================

  const filteredBanks =
    banks.filter(
      (bankItem) =>
        bankItem.name
          .toLowerCase()
          .includes(
            bankSearch
              .trim()
              .toLowerCase()
          )
    );


  // ==========================================================
  // RESOLVE BANK ACCOUNT
  // ==========================================================

  useEffect(() => {

    if (
      transferType !==
      "bank"
    ) {
      return;
    }


    const cleanAccountNumber =
      accountNumber.replace(
        /\D/g,
        ""
      );


    if (
      !bank ||
      !/^\d{10}$/.test(
        cleanAccountNumber
      )
    ) {

      setResolvedAccount(null);
      setResolving(false);

      return;

    }


    const requestId =
      ++resolveRequestRef.current;


    const timeout =
      window.setTimeout(
        async () => {

          setResolving(true);
          setResolvedAccount(null);


          try {

            const {
              data,
              error,
            } =
              await supabase.functions.invoke(
                "resolve-bank-account",
                {
                  body: {
                    account_number:
                      cleanAccountNumber,

                    account_bank:
                      bank,
                  },
                }
              );


            if (
              requestId !==
              resolveRequestRef.current
            ) {
              return;
            }


            if (error) {

              let message =
                error.message ||
                "Unable to verify bank account.";

              try {

                if (
                  error.context &&
                  typeof error.context
                    .json ===
                    "function"
                ) {

                  const payload =
                    await error.context.json();

                  message =
                    payload?.error ||
                    payload?.message ||
                    message;

                }

              } catch {
                // Keep original error.
              }


              throw new Error(
                message
              );

            }


            if (
              !data?.success ||
              !data?.account
            ) {

              throw new Error(
                data?.error ||
                "Bank account could not be verified."
              );

            }


            setResolvedAccount({
              account_number:
                data.account
                  .account_number,

              account_name:
                data.account
                  .account_name,

              bank_code:
                data.account
                  .bank_code,
            });


            toast({
              title:
                "Account verified",
              description:
                data.account
                  .account_name,
            });

          } catch (error: any) {

            if (
              requestId !==
              resolveRequestRef.current
            ) {
              return;
            }


            console.error(
              "Account resolution failed:",
              error
            );


            setResolvedAccount(null);


            toast({
              title:
                "Account verification failed",
              description:
                error?.message ||
                "We could not verify this bank account.",
              variant:
                "destructive",
            });

          } finally {

            if (
              requestId ===
              resolveRequestRef.current
            ) {
              setResolving(false);
            }

          }

        },
        600
      );


    return () => {
      window.clearTimeout(
        timeout
      );
    };

  }, [
    accountNumber,
    bank,
    transferType,
    toast,
  ]);


  // ==========================================================
  // RESOLVE IYANJUPAY RECIPIENT
  // ==========================================================

  useEffect(() => {

    if (
      transferType !==
      "iyanjupay"
    ) {
      return;
    }


    const cleanWalletId =
      iyanjupayWalletId.replace(
        /\D/g,
        ""
      );


    if (
      !/^\d{8}$/.test(
        cleanWalletId
      )
    ) {

      iyanjuPayResolveRequestRef.current++;

      setResolvedIyanjuPayRecipient(
        null
      );

      setResolvingIyanjuPayRecipient(
        false
      );

      return;

    }


    const requestId =
      ++iyanjuPayResolveRequestRef.current;


    const timeout =
      window.setTimeout(
        async () => {

          setResolvingIyanjuPayRecipient(
            true
          );

          setResolvedIyanjuPayRecipient(
            null
          );


          try {

            const {
              data,
              error,
            } =
              await supabase.functions.invoke(
                "resolve-iyanjupay-recipient",
                {
                  body: {
                    wallet_id:
                      cleanWalletId,
                  },
                }
              );


            if (
              requestId !==
              iyanjuPayResolveRequestRef.current
            ) {
              return;
            }


            if (error) {

              let message =
                error.message ||
                "Unable to verify recipient.";

              try {

                if (
                  error.context &&
                  typeof error.context
                    .json ===
                    "function"
                ) {

                  const payload =
                    await error.context.json();

                  message =
                    payload?.error ||
                    payload?.message ||
                    message;

                }

              } catch {
                // Keep original error.
              }


              throw new Error(
                message
              );

            }


            if (
              !data?.success ||
              !data?.recipient
            ) {

              throw new Error(
                data?.error ||
                data?.message ||
                "IyanjuPay Wallet ID could not be verified."
              );

            }


            setResolvedIyanjuPayRecipient({
              wallet_id:
                data.recipient
                  .wallet_id,

              name:
                data.recipient
                  .name,

              full_name:
                data.recipient
                  .full_name ??
                null,

              nickname:
                data.recipient
                  .nickname ??
                null,
            });


            toast({
              title:
                "Recipient verified",
              description:
                data.recipient
                  .name,
            });

          } catch (error: any) {

            if (
              requestId !==
              iyanjuPayResolveRequestRef.current
            ) {
              return;
            }


            console.error(
              "IyanjuPay recipient verification failed:",
              error
            );


            setResolvedIyanjuPayRecipient(
              null
            );


            toast({
              title:
                "Wallet ID verification failed",
              description:
                error?.message ||
                "We could not find this IyanjuPay Wallet ID.",
              variant:
                "destructive",
            });

          } finally {

            if (
              requestId ===
              iyanjuPayResolveRequestRef.current
            ) {

              setResolvingIyanjuPayRecipient(
                false
              );

            }

          }

        },
        500
      );


    return () => {
      window.clearTimeout(
        timeout
      );
    };

  }, [
    iyanjupayWalletId,
    transferType,
    toast,
  ]);


  // ==========================================================
  // TRANSFER AMOUNT / FEES
  // ==========================================================

  const transferAmount =
    Number(amount) || 0;


  const transferFee =
    transferType ===
    "iyanjupay"
      ? IYANJUPAY_TRANSFER_FEE
      : transferAmount > 0
        ? BANK_TRANSFER_FEE
        : 0;


  const totalCharged =
    transferAmount +
    transferFee;


  const hasInsufficientBalance =
    transferAmount > 0 &&
    totalCharged >
      walletBalance;


  // ==========================================================
  // CHANGE TRANSFER TYPE
  // ==========================================================

  const handleTransferTypeChange =
    (
      type: TransferType
    ) => {

      resolveRequestRef.current++;

      iyanjuPayResolveRequestRef.current++;


      setTransferType(type);

      setAmount("");
      setNarration("");


      setIyanjuPayWalletId("");

      setResolvedIyanjuPayRecipient(
        null
      );

      setResolvingIyanjuPayRecipient(
        false
      );


      setBank("");
      setBankSearch("");
      setAccountNumber("");

      setResolvedAccount(null);
      setResolving(false);


      setPaymentPinOpen(false);

    };


  // ==========================================================
  // VALIDATE TRANSFER
  // ==========================================================

  const handleTransfer =
    () => {

      if (
        !Number.isFinite(
          transferAmount
        ) ||
        transferAmount <= 0
      ) {

        toast({
          title:
            "Invalid amount",
          description:
            "Please enter a valid transfer amount.",
          variant:
            "destructive",
        });

        return;
      }


      // ------------------------------------------------------
      // IYANJUPAY
      // ------------------------------------------------------

      if (
        transferType ===
        "iyanjupay"
      ) {

        const walletId =
          iyanjupayWalletId.trim();


        if (
          !/^\d{8}$/.test(
            walletId
          )
        ) {

          toast({
            title:
              "Invalid Wallet ID",
            description:
              "IyanjuPay Wallet ID must be exactly 8 digits.",
            variant:
              "destructive",
          });

          return;
        }


        if (
          !resolvedIyanjuPayRecipient ||
          resolvedIyanjuPayRecipient
            .wallet_id !==
            walletId
        ) {

          toast({
            title:
              "Recipient not verified",
            description:
              "Please enter a valid IyanjuPay Wallet ID and wait for verification.",
            variant:
              "destructive",
          });

          return;
        }

      }


      // ------------------------------------------------------
      // BANK
      // ------------------------------------------------------

      if (
        transferType ===
        "bank"
      ) {

        if (
          !resolvedAccount
        ) {

          toast({
            title:
              "Account not verified",
            description:
              "Please enter a valid bank account and wait for verification.",
            variant:
              "destructive",
          });

          return;
        }

      }


      // ------------------------------------------------------
      // BALANCE
      // ------------------------------------------------------

      if (
        totalCharged >
        walletBalance
      ) {

        toast({
          title:
            "Insufficient Balance",
          description:
            `You need ₦${totalCharged.toLocaleString()} to complete this transfer.`,
          variant:
            "destructive",
        });

        return;
      }


      // ------------------------------------------------------
      // REQUEST PAYMENT PIN
      // ------------------------------------------------------

      setPaymentPinOpen(true);

    };


  // ==========================================================
  // EXECUTE TRANSFER AFTER PIN
  // ==========================================================

  const handlePaymentPinVerified =
    async () => {

      setPaymentPinOpen(false);


      if (processing) {
        return;
      }


      setProcessing(true);


      try {

        let response: any;


        // ====================================================
        // IYANJUPAY TRANSFER
        // ====================================================

        if (
          transferType ===
          "iyanjupay"
        ) {

          const walletId =
            iyanjupayWalletId.trim();


          const idempotencyKey =
            `iyanjupay_${crypto.randomUUID()}`;


          const {
            data,
            error,
          } =
            await supabase.functions.invoke(
              "iyanjuPay-transfer",
              {
                body: {

                  wallet_id:
                    walletId,

                  amount:
                    transferAmount,

                  narration:
                    narration.trim() ||
                    "IyanjuPay transfer",

                  idempotency_key:
                    idempotencyKey,

                },
              }
            );


          if (error) {

            let message =
              error.message ||
              "Unable to process transfer.";

            try {

              if (
                error.context &&
                typeof error.context
                  .json ===
                  "function"
              ) {

                const payload =
                  await error.context.json();

                message =
                  payload?.error ||
                  payload?.message ||
                  message;

              }

            } catch {
              // Keep original error.
            }


            throw new Error(
              message
            );

          }


          response =
            data;

        }


        // ====================================================
        // BANK TRANSFER
        // ====================================================

        if (
          transferType ===
          "bank"
        ) {

          if (
            !resolvedAccount
          ) {

            throw new Error(
              "Bank account verification is required."
            );

          }


          const idempotencyKey =
            `bank_${crypto.randomUUID()}`;


          /*
           * IMPORTANT:
           *
           * Keep this function name identical
           * to the Edge Function already used
           * by your Dashboard.
           *
           * If your existing Dashboard uses a
           * different function name, we will use
           * that exact function.
           */

          const {
            data,
            error,
          } =
            await supabase.functions.invoke(
              "flutterwave-transfer",
              {
                body: {

                  amount:
                    transferAmount,

                  account_number:
                    resolvedAccount
                      .account_number,

                  account_bank:
                    resolvedAccount
                      .bank_code,

                  narration:
                    narration.trim() ||
                    "Bank transfer",

                  idempotency_key:
                    idempotencyKey,

                },
              }
            );


          if (error) {

            let message =
              error.message ||
              "Unable to process bank transfer.";

            try {

              if (
                error.context &&
                typeof error.context
                  .json ===
                  "function"
              ) {

                const payload =
                  await error.context.json();

                message =
                  payload?.error ||
                  payload?.message ||
                  message;

              }

            } catch {
              // Keep original error.
            }


            throw new Error(
              message
            );

          }


          response =
            data;

        }


        // ====================================================
        // CHECK RESULT
        // ====================================================

        if (
          !response
        ) {

          throw new Error(
            "No response was received from the transfer service."
          );

        }


        console.log(
          "Transfer response:",
          response
        );


        /*
         * We will connect this to the
         * transaction-status page next.
         *
         * For now, navigate to the
         * dashboard after successful
         * execution.
         */

        if (
          response.success ===
          true
        ) {

          toast({
            title:
              "Transfer Successful",
            description:
              response.message ||
              `₦${transferAmount.toLocaleString()} transfer completed successfully.`,
          });


          navigate(
            "/dashboard",
            {
              replace: true,
            }
          );


          return;

        }


        throw new Error(
          response.error ||
          response.message ||
          "Transfer could not be completed."
        );

      } catch (error: any) {

        console.error(
          "Transfer execution failed:",
          error
        );


        toast({
          title:
            "Transfer Failed",
          description:
            error?.message ||
            "Unable to complete the transfer.",
          variant:
            "destructive",
        });

      } finally {

        setProcessing(false);

      }

    };


  // ==========================================================
  // PAYMENT PIN CANCEL
  // ==========================================================

  const handlePaymentPinCancel =
    () => {

      if (processing) {
        return;
      }

      setPaymentPinOpen(false);

    };


  // ==========================================================
  // BACK
  // ==========================================================

  const handleBack =
    () => {

      if (processing) {
        return;
      }


      navigate(
        "/dashboard"
      );

    };


  // ==========================================================
  // DISABLED
  // ==========================================================

  const transferDisabled =
    balanceLoading ||
    banksLoading ||
    processing ||
    !amount ||
    transferAmount <= 0 ||
    hasInsufficientBalance ||
    (
      transferType ===
      "iyanjupay" &&
      (
        !/^\d{8}$/.test(
          iyanjupayWalletId
        ) ||
        resolvingIyanjuPayRecipient ||
        !resolvedIyanjuPayRecipient
      )
    ) ||
    (
      transferType ===
      "bank" &&
      (
        !bank ||
        !resolvedAccount ||
        resolving
      )
    );


  // ==========================================================
  // UI
  // ==========================================================

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50">

      <div className="max-w-md mx-auto px-4 py-8">

        {/* ================================================== */}
        {/* BACK */}
        {/* ================================================== */}

        <Button
          variant="ghost"
          onClick={handleBack}
          disabled={processing}
          className="mb-6 text-purple-600"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>


        {/* ================================================== */}
        {/* CARD */}
        {/* ================================================== */}

        <Card className="shadow-lg">

          <CardHeader>

            <div className="flex items-center gap-3">

              <div className="w-11 h-11 rounded-full bg-green-100 flex items-center justify-center">

                <Send className="h-6 w-6 text-green-600" />

              </div>


              <div>

                <CardTitle>
                  Send Money
                </CardTitle>

                <CardDescription>
                  Send money to an IyanjuPay user or bank account.
                </CardDescription>

              </div>

            </div>

          </CardHeader>


          <CardContent className="space-y-6">

            {/* ================================================== */}
            {/* BALANCE */}
            {/* ================================================== */}

            <div className="rounded-lg bg-green-50 border border-green-100 p-4">

              <p className="text-sm text-green-700">
                Wallet Balance
              </p>

              {balanceLoading ? (

                <div className="flex items-center gap-2 mt-1">

                  <Loader2 className="h-4 w-4 animate-spin text-green-600" />

                  <span className="text-sm text-green-700">
                    Loading balance...
                  </span>

                </div>

              ) : (

                <p className="text-xl font-bold text-green-800">

                  ₦
                  {walletBalance.toLocaleString(
                    undefined,
                    {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    }
                  )}

                </p>

              )}

            </div>


            {/* ================================================== */}
            {/* TRANSFER TYPE */}
            {/* ================================================== */}

            <div className="grid grid-cols-2 gap-2 p-1 bg-gray-100 rounded-lg">

              <Button
                type="button"
                variant={
                  transferType ===
                  "iyanjupay"
                    ? "default"
                    : "ghost"
                }
                onClick={() =>
                  handleTransferTypeChange(
                    "iyanjupay"
                  )
                }
                disabled={processing}
                className={
                  transferType ===
                  "iyanjupay"
                    ? "bg-green-600 hover:bg-green-700"
                    : ""
                }
              >

                <User className="h-4 w-4 mr-2" />

                IyanjuPay User

              </Button>


              <Button
                type="button"
                variant={
                  transferType ===
                  "bank"
                    ? "default"
                    : "ghost"
                }
                onClick={() =>
                  handleTransferTypeChange(
                    "bank"
                  )
                }
                disabled={processing}
                className={
                  transferType ===
                  "bank"
                    ? "bg-green-600 hover:bg-green-700"
                    : ""
                }
              >

                <Building2 className="h-4 w-4 mr-2" />

                Bank Account

              </Button>

            </div>


            {/* ================================================== */}
            {/* IYANJUPAY */}
            {/* ================================================== */}

            {transferType ===
              "iyanjupay" && (

              <div className="space-y-4">

                <div className="space-y-2">

                  <Label>
                    Recipient Wallet ID
                  </Label>

                  <Input
                    value={
                      iyanjupayWalletId
                    }
                    onChange={(e) => {

                      const value =
                        e.target.value
                          .replace(
                            /\D/g,
                            ""
                          );


                      iyanjuPayResolveRequestRef.current++;


                      setIyanjuPayWalletId(
                        value.slice(
                          0,
                          8
                        )
                      );


                      setResolvedIyanjuPayRecipient(
                        null
                      );

                    }}
                    placeholder="Enter 8-digit Wallet ID"
                    inputMode="numeric"
                    maxLength={8}
                    disabled={processing}
                  />


                  <p className="text-xs text-gray-500">
                    Enter the recipient's 8-digit IyanjuPay Wallet ID.
                  </p>


                  {resolvingIyanjuPayRecipient &&
                    iyanjupayWalletId.length ===
                      8 && (

                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">

                      <div className="flex items-center gap-2">

                        <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />

                        <p className="text-sm text-blue-700">
                          Verifying recipient...
                        </p>

                      </div>

                    </div>

                  )}


                  {resolvedIyanjuPayRecipient && (

                    <div className="rounded-lg border border-green-200 bg-green-50 p-4">

                      <div className="flex items-start gap-3">

                        <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />

                        <div>

                          <p className="text-xs text-green-700 font-medium">
                            VERIFIED RECIPIENT
                          </p>

                          <p className="font-semibold mt-1">
                            {
                              resolvedIyanjuPayRecipient.name
                            }
                          </p>

                          <p className="text-sm text-gray-600">
                            Wallet ID:{" "}
                            {
                              resolvedIyanjuPayRecipient.wallet_id
                            }
                          </p>

                        </div>

                      </div>

                    </div>

                  )}

                </div>

              </div>

            )}


            {/* ================================================== */}
            {/* BANK */}
            {/* ================================================== */}

            {transferType ===
              "bank" && (

              <div className="space-y-4">

                <div className="space-y-2">

                  <Label>
                    Recipient Bank
                  </Label>

                  <Select
                    value={bank}
                    onValueChange={(value) => {

                      resolveRequestRef.current++;

                      setBank(value);

                      setResolvedAccount(
                        null
                      );

                      setResolving(false);

                      setBankSearch("");

                    }}
                    disabled={
                      banksLoading ||
                      processing
                    }
                  >

                    <SelectTrigger>

                      <SelectValue
                        placeholder={
                          banksLoading
                            ? "Loading banks..."
                            : "Select bank"
                        }
                      />

                    </SelectTrigger>


                    <SelectContent>

                      <div
                        className="sticky top-0 z-10 bg-white p-2 border-b"
                        onPointerDown={(e) =>
                          e.stopPropagation()
                        }
                        onKeyDown={(e) =>
                          e.stopPropagation()
                        }
                      >

                        <div className="relative">

                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />

                          <Input
                            value={
                              bankSearch
                            }
                            onChange={(e) =>
                              setBankSearch(
                                e.target.value
                              )
                            }
                            onKeyDown={(e) =>
                              e.stopPropagation()
                            }
                            placeholder="Search bank name..."
                            className="pl-9"
                            autoComplete="off"
                          />

                        </div>

                      </div>


                      {filteredBanks.length >
                      0 ? (

                        filteredBanks.map(
                          (bankItem) => (

                            <SelectItem
                              key={
                                bankItem.code
                              }
                              value={
                                bankItem.code
                              }
                            >
                              {
                                bankItem.name
                              }
                            </SelectItem>

                          )
                        )

                      ) : (

                        <div className="p-4 text-center text-sm text-gray-500">

                          No bank found.

                        </div>

                      )}

                    </SelectContent>

                  </Select>

                </div>


                <div className="space-y-2">

                  <Label>
                    Account Number
                  </Label>

                  <Input
                    value={
                      accountNumber
                    }
                    onChange={(e) => {

                      const value =
                        e.target.value
                          .replace(
                            /\D/g,
                            ""
                          );


                      resolveRequestRef.current++;


                      setAccountNumber(
                        value.slice(
                          0,
                          10
                        )
                      );


                      setResolvedAccount(
                        null
                      );

                    }}
                    placeholder="Enter 10-digit account number"
                    inputMode="numeric"
                    maxLength={10}
                    disabled={processing}
                  />


                  {resolving && (

                    <div className="flex items-center gap-2 text-sm text-blue-600">

                      <Loader2 className="h-4 w-4 animate-spin" />

                      Verifying account...

                    </div>

                  )}

                </div>


                {resolvedAccount && (

                  <div className="rounded-lg border border-green-200 bg-green-50 p-4">

                    <div className="flex items-start gap-3">

                      <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />

                      <div>

                        <p className="text-xs text-green-700 font-medium">
                          VERIFIED ACCOUNT
                        </p>

                        <p className="font-semibold mt-1">
                          {
                            resolvedAccount.account_name
                          }
                        </p>

                        <p className="text-sm text-gray-600">
                          {
                            resolvedAccount.account_number
                          }
                        </p>

                      </div>

                    </div>

                  </div>

                )}

              </div>

            )}


            {/* ================================================== */}
            {/* AMOUNT */}
            {/* ================================================== */}

            <div className="space-y-2">

              <Label>
                Amount (₦)
              </Label>

              <Input
                type="number"
                value={amount}
                onChange={(e) =>
                  setAmount(
                    e.target.value
                  )
                }
                placeholder="Enter amount"
                min="1"
                step="0.01"
                disabled={processing}
              />

            </div>


            {/* ================================================== */}
            {/* FEES */}
            {/* ================================================== */}

            {transferAmount > 0 && (

              <div className="rounded-lg border bg-gray-50 p-4 space-y-3">

                <div className="flex justify-between text-sm">

                  <span className="text-gray-600">
                    Transfer amount
                  </span>

                  <span className="font-medium">

                    ₦
                    {transferAmount.toLocaleString(
                      undefined,
                      {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      }
                    )}

                  </span>

                </div>


                <div className="flex justify-between text-sm">

                  <span className="text-gray-600">
                    Transfer fee
                  </span>

                  <span className="font-medium">

                    ₦
                    {transferFee.toLocaleString(
                      undefined,
                      {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      }
                    )}

                  </span>

                </div>


                <div className="border-t pt-3 flex justify-between">

                  <span className="font-semibold">
                    Total to be deducted
                  </span>

                  <span className="font-bold text-green-700">

                    ₦
                    {totalCharged.toLocaleString(
                      undefined,
                      {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      }
                    )}

                  </span>

                </div>

              </div>

            )}


            {/* ================================================== */}
            {/* INSUFFICIENT BALANCE */}
            {/* ================================================== */}

            {hasInsufficientBalance && (

              <div className="rounded-md bg-red-50 border border-red-200 p-3">

                <p className="text-sm text-red-700">

                  Insufficient wallet balance.
                  You need ₦
                  {totalCharged.toLocaleString(
                    undefined,
                    {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    }
                  )}{" "}
                  to complete this transfer.

                </p>

              </div>

            )}


            {/* ================================================== */}
            {/* NARRATION */}
            {/* ================================================== */}

            <div className="space-y-2">

              <Label>
                Narration (Optional)
              </Label>

              <Input
                value={narration}
                onChange={(e) =>
                  setNarration(
                    e.target.value
                  )
                }
                placeholder="Enter transaction description"
                disabled={processing}
              />

            </div>


            {/* ================================================== */}
            {/* SEND BUTTON */}
            {/* ================================================== */}

            <Button
              type="button"
              onClick={
                handleTransfer
              }
              disabled={
                transferDisabled
              }
              className="w-full bg-green-600 hover:bg-green-700"
            >

              {processing ? (

                <>

                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />

                  Processing transfer...

                </>

              ) : (

                <>

                  <Send className="h-4 w-4 mr-2" />

                  Send ₦
                  {transferAmount > 0
                    ? transferAmount.toLocaleString()
                    : "Money"}

                </>

              )}

            </Button>


            <p className="text-xs text-gray-500 text-center">
              You will be asked to enter your Payment PIN before the transfer is processed.
            </p>

          </CardContent>

        </Card>

      </div>


      {/* ====================================================== */}
      {/* PAYMENT PIN */}
      {/* ====================================================== */}

      <PaymentPinModal
        open={
          paymentPinOpen
        }
        onCancel={
          handlePaymentPinCancel
        }
        onVerified={
          handlePaymentPinVerified
        }
        title="Authorize Transfer"
        description="Enter your 4-digit Payment PIN to authorize this transfer."
      />

    </div>
  );
};


export default SendMoney;
