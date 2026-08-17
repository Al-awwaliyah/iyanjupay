import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Wallet {
  id: string;
  user_id?: string;
  balance: number;
  virtual_account_number: string;
}

export const useWallet = (
  userId: string | undefined
) => {
  const [wallet, setWallet] =
    useState<Wallet | null>(null);

  const [loading, setLoading] =
    useState(true);

  const { toast } = useToast();

  /**
   * ------------------------------------------------------------
   * FETCH WALLET
   * ------------------------------------------------------------
   *
   * IMPORTANT:
   *
   * The frontend is allowed to READ the wallet.
   *
   * The frontend must NOT directly INSERT or UPDATE wallet
   * balances.
   *
   * Wallet creation and balance changes are handled by secure
   * Supabase Edge Functions / RPC functions.
   * ------------------------------------------------------------
   */

  const fetchWallet = useCallback(async () => {
    if (!userId) {
      setWallet(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const {
        data,
        error,
      } = await supabase
        .from("wallets")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        console.error(
          "Wallet fetch error:",
          error
        );

        throw error;
      }

      if (data) {
        setWallet({
          ...data,
          balance: Number(data.balance) || 0,
        });

        return;
      }

      /**
       * --------------------------------------------------------
       * NO WALLET FOUND
       * --------------------------------------------------------
       *
       * Do NOT create the wallet directly from the browser.
       *
       * wallet-bootstrap is responsible for securely creating
       * the wallet.
       * --------------------------------------------------------
       */

      console.log(
        "No wallet found. Running wallet bootstrap..."
      );

      const {
        data: bootstrapData,
        error: bootstrapError,
      } =
        await supabase.functions.invoke(
          "wallet-bootstrap"
        );

      if (bootstrapError) {
        console.error(
          "Wallet bootstrap error:",
          bootstrapError
        );

        throw bootstrapError;
      }

      console.log(
        "Wallet bootstrap response:",
        bootstrapData
      );

      /**
       * --------------------------------------------------------
       * FETCH WALLET AGAIN
       * --------------------------------------------------------
       */

      const {
        data: bootstrappedWallet,
        error:
          bootstrappedWalletError,
      } =
        await supabase
          .from("wallets")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle();

      if (bootstrappedWalletError) {
        console.error(
          "Wallet fetch after bootstrap error:",
          bootstrappedWalletError
        );

        throw bootstrappedWalletError;
      }

      if (bootstrappedWallet) {
        setWallet({
          ...bootstrappedWallet,
          balance:
            Number(
              bootstrappedWallet.balance
            ) || 0,
        });
      } else {
        console.warn(
          "Wallet bootstrap completed but no wallet was found."
        );

        setWallet(null);
      }
    } catch (error: any) {
      console.error(
        "Error fetching wallet:",
        error
      );

      toast({
        title: "Wallet Error",
        description:
          error?.message ||
          "Failed to load wallet information.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [userId, toast]);

  /**
   * ------------------------------------------------------------
   * INITIAL LOAD
   * ------------------------------------------------------------
   */

  useEffect(() => {
    if (!userId) {
      setWallet(null);
      setLoading(false);
      return;
    }

    fetchWallet();
  }, [userId, fetchWallet]);

  /**
   * ------------------------------------------------------------
   * REFRESH BALANCE
   * ------------------------------------------------------------
   *
   * This replaces the old updateBalance() behavior.
   *
   * We NEVER do:
   *
   * supabase.from("wallets").update(...)
   *
   * from the browser.
   *
   * Instead, we simply re-read the balance after the secure
   * server-side wallet operation has completed.
   * ------------------------------------------------------------
   */

  const refreshWallet = useCallback(async () => {
    if (!userId) {
      return null;
    }

    try {
      const {
        data,
        error,
      } = await supabase
        .from("wallets")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        console.error(
          "Wallet refresh error:",
          error
        );

        throw error;
      }

      if (data) {
        const refreshedWallet: Wallet = {
          ...data,
          balance:
            Number(data.balance) || 0,
        };

        setWallet(refreshedWallet);

        return refreshedWallet;
      }

      return null;
    } catch (error: any) {
      console.error(
        "Error refreshing wallet:",
        error
      );

      throw error;
    }
  }, [userId]);

  /**
   * ------------------------------------------------------------
   * UPDATE BALANCE
   * ------------------------------------------------------------
   *
   * Kept for compatibility with existing Dashboard.tsx code.
   *
   * IMPORTANT:
   * This function does NOT update Supabase.
   *
   * It only updates the local React state.
   *
   * The actual database balance must be changed by:
   *
   * - wallet_operation RPC
   * - wallet-bootstrap
   * - secure Edge Functions
   *
   * This prevents the browser from attempting:
   *
   * PATCH /rest/v1/wallets
   *
   * which was causing the 403 error.
   * ------------------------------------------------------------
   */

  const updateBalance = useCallback(
    async (newBalance: number) => {
      if (!wallet) {
        return;
      }

      const numericBalance =
        Number(newBalance);

      if (
        !Number.isFinite(
          numericBalance
        )
      ) {
        console.error(
          "Invalid wallet balance:",
          newBalance
        );

        return;
      }

      setWallet((currentWallet) => {
        if (!currentWallet) {
          return currentWallet;
        }

        return {
          ...currentWallet,
          balance: numericBalance,
        };
      });
    },
    [wallet]
  );

  /**
   * ------------------------------------------------------------
   * RETURN
   * ------------------------------------------------------------
   */

  return {
    wallet,
    loading,

    /**
     * Compatibility function.
     * Only changes local state.
     */
    updateBalance,

    /**
     * Re-read wallet from Supabase.
     */
    refreshWallet,

    /**
     * Alias maintained for existing code.
     */
    refetch: fetchWallet,
  };
};
