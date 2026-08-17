import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Wallet {
  id: string;
  balance: number;
  virtual_account_number: string;
}

export const useWallet = (userId: string | undefined) => {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  /**
   * ------------------------------------------------------------
   * FETCH WALLET
   * ------------------------------------------------------------
   *
   * The browser is allowed to READ the user's wallet.
   *
   * It must NOT directly UPDATE the wallet balance.
   * All balance changes must happen through secure
   * server-side wallet operations.
   */

  const fetchWallet = useCallback(async () => {
    if (!userId) {
      setWallet(null);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("wallets")
        .select(
          "id, balance, virtual_account_number"
        )
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (data) {
        setWallet({
          id: data.id,
          balance: Number(data.balance) || 0,
          virtual_account_number:
            data.virtual_account_number || "",
        });

        return;
      }

      /**
       * --------------------------------------------------------
       * No wallet found.
       *
       * Wallet creation is delegated to the secure
       * wallet-bootstrap Edge Function.
       * --------------------------------------------------------
       */

      const {
        data: bootstrapData,
        error: bootstrapError,
      } = await supabase.functions.invoke(
        "wallet-bootstrap"
      );

      if (bootstrapError) {
        throw bootstrapError;
      }

      /**
       * wallet-bootstrap may return the wallet directly.
       */

      if (bootstrapData?.wallet) {
        setWallet({
          id: bootstrapData.wallet.id,
          balance:
            Number(
              bootstrapData.wallet.balance
            ) || 0,
          virtual_account_number:
            bootstrapData.wallet
              .virtual_account_number || "",
        });

        return;
      }

      /**
       * Otherwise fetch it again after bootstrap.
       */

      const {
        data: refreshedWallet,
        error: refreshedError,
      } = await supabase
        .from("wallets")
        .select(
          "id, balance, virtual_account_number"
        )
        .eq("user_id", userId)
        .maybeSingle();

      if (refreshedError) {
        throw refreshedError;
      }

      if (refreshedWallet) {
        setWallet({
          id: refreshedWallet.id,
          balance:
            Number(refreshedWallet.balance) || 0,
          virtual_account_number:
            refreshedWallet.virtual_account_number ||
            "",
        });
      } else {
        setWallet(null);
      }
    } catch (error: any) {
      console.error(
        "Error fetching wallet:",
        error
      );

      toast({
        title: "Error",
        description:
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
    fetchWallet();
  }, [fetchWallet]);

  /**
   * ------------------------------------------------------------
   * REFRESH BALANCE
   * ------------------------------------------------------------
   *
   * This replaces the old updateBalance() function.
   *
   * IMPORTANT:
   *
   * It does NOT write to wallets.
   * It only reads the latest balance from Supabase.
   */

  const refreshWallet = useCallback(async () => {
    if (!userId) return null;

    try {
      const {
        data,
        error,
      } = await supabase
        .from("wallets")
        .select(
          "id, balance, virtual_account_number"
        )
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (data) {
        const updatedWallet: Wallet = {
          id: data.id,
          balance:
            Number(data.balance) || 0,
          virtual_account_number:
            data.virtual_account_number || "",
        };

        setWallet(updatedWallet);

        return updatedWallet;
      }

      return null;
    } catch (error) {
      console.error(
        "Error refreshing wallet:",
        error
      );

      return null;
    }
  }, [userId]);

  /**
   * ------------------------------------------------------------
   * REALTIME WALLET BALANCE
   * ------------------------------------------------------------
   *
   * When a secure Edge Function credits/debits the wallet,
   * Supabase Realtime can notify the dashboard.
   *
   * This means the displayed balance can update without
   * directly modifying wallets from the browser.
   */

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(
        `wallet-${userId}`
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "wallets",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const updated =
            payload.new as Partial<Wallet>;

          setWallet((current) => {
            if (!current) {
              return current;
            }

            return {
              ...current,

              id:
                updated.id ||
                current.id,

              balance:
                updated.balance !==
                undefined
                  ? Number(
                      updated.balance
                    ) || 0
                  : current.balance,

              virtual_account_number:
                updated.virtual_account_number ||
                current.virtual_account_number,
            };
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  /**
   * ------------------------------------------------------------
   * BACKWARD COMPATIBILITY
   * ------------------------------------------------------------
   *
   * Existing Dashboard code currently calls:
   *
   * updateBalance(...)
   *
   * We keep the function name so the rest of the application
   * does not immediately break.
   *
   * BUT it no longer writes the supplied value into the
   * database.
   *
   * It simply refreshes the wallet securely.
   */

  const updateBalance = async (
    _newBalance?: number
  ) => {
    return refreshWallet();
  };

  return {
    wallet,
    loading,

    /**
     * Legacy compatibility.
     * Use refreshWallet() in new code.
     */
    updateBalance,

    /**
     * Preferred method.
     */
    refreshWallet,

    /**
     * Existing Dashboard compatibility.
     */
    refetch: fetchWallet,
  };
};
