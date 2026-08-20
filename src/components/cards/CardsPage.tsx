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
   * ============================================================
   * FETCH WALLET
   * ============================================================
   *
   * The browser only READS the wallet.
   *
   * Wallet balance changes must happen through secure
   * server-side Edge Functions.
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
        .select(
          "id, balance, virtual_account_number"
        )
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      /**
       * --------------------------------------------------------
       * Wallet exists
       * --------------------------------------------------------
       */
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
       * Wallet does not exist.
       *
       * Let the secure Edge Function create it.
       * --------------------------------------------------------
       */
      const {
        data: bootstrapData,
        error: bootstrapError,
      } = await supabase.functions.invoke(
        "wallet-bootstrap",
        {
          body: {},
        }
      );

      if (bootstrapError) {
        throw bootstrapError;
      }

      /**
       * --------------------------------------------------------
       * wallet-bootstrap returned wallet directly
       * --------------------------------------------------------
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
       * --------------------------------------------------------
       * Fetch wallet again after bootstrap
       * --------------------------------------------------------
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
            Number(
              refreshedWallet.balance
            ) || 0,
          virtual_account_number:
            refreshedWallet
              .virtual_account_number || "",
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
   * ============================================================
   * INITIAL LOAD
   * ============================================================
   */
  useEffect(() => {
    fetchWallet();
  }, [fetchWallet]);

  /**
   * ============================================================
   * REFRESH WALLET
   * ============================================================
   *
   * This ONLY reads the latest wallet information.
   *
   * It never directly updates the wallet balance.
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
        .select(
          "id, balance, virtual_account_number"
        )
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data) {
        return null;
      }

      const updatedWallet: Wallet = {
        id: data.id,
        balance:
          Number(data.balance) || 0,
        virtual_account_number:
          data.virtual_account_number || "",
      };

      setWallet(updatedWallet);

      return updatedWallet;
    } catch (error) {
      console.error(
        "Error refreshing wallet:",
        error
      );

      return null;
    }
  }, [userId]);

  /**
   * ============================================================
   * REALTIME WALLET BALANCE
   * ============================================================
   *
   * IMPORTANT:
   *
   * We use a UNIQUE channel name for every hook instance.
   *
   * This prevents multiple components/hooks from accidentally
   * sharing the same Supabase Realtime channel.
   *
   * It also prevents:
   *
   * "cannot add postgres_changes callbacks ... after subscribe()"
   *
   * errors.
   */
  useEffect(() => {
    if (!userId) {
      return;
    }

    /**
     * Create a genuinely unique channel name.
     */
    const uniqueId =
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : Math.random()
            .toString(36)
            .substring(2);

    const channelName =
      `wallet-${userId}-${uniqueId}`;

    let isMounted = true;

    /**
     * Create channel.
     *
     * The postgres_changes callback MUST be registered
     * BEFORE subscribe().
     */
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "wallets",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if (!isMounted) {
            return;
          }

          const updated =
            payload.new as Partial<Wallet>;

          setWallet((current) => {
            /**
             * If the wallet has not loaded yet,
             * do not create an incomplete wallet.
             */
            if (!current) {
              return current;
            }

            return {
              ...current,

              id:
                updated.id ??
                current.id,

              balance:
                updated.balance !== undefined
                  ? Number(
                      updated.balance
                    ) || 0
                  : current.balance,

              virtual_account_number:
                updated.virtual_account_number ??
                current.virtual_account_number,
            };
          });
        }
      );

    /**
     * Subscribe AFTER .on()
     */
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        console.log(
          "Wallet realtime subscribed:",
          channelName
        );
      }

      if (status === "CHANNEL_ERROR") {
        console.error(
          "Wallet realtime channel error:",
          channelName
        );
      }

      if (status === "TIMED_OUT") {
        console.error(
          "Wallet realtime subscription timed out:",
          channelName
        );
      }
    });

    /**
     * ----------------------------------------------------------
     * CLEANUP
     * ----------------------------------------------------------
     */
    return () => {
      isMounted = false;

      /**
       * Remove THIS exact channel instance.
       */
      supabase
        .removeChannel(channel)
        .then(() => {
          console.log(
            "Wallet realtime channel removed:",
            channelName
          );
        })
        .catch((error) => {
          console.error(
            "Failed to remove wallet realtime channel:",
            error
          );
        });
    };
  }, [userId]);

  /**
   * ============================================================
   * BACKWARD COMPATIBILITY
   * ============================================================
   *
   * Existing code may still call:
   *
   * updateBalance(...)
   *
   * We keep it so existing components don't break.
   *
   * It DOES NOT directly modify the database.
   */
  const updateBalance = async (
    _newBalance?: number
  ) => {
    return refreshWallet();
  };

  /**
   * ============================================================
   * RETURN
   * ============================================================
   */
  return {
    wallet,
    loading,

    /**
     * Legacy compatibility.
     */
    updateBalance,

    /**
     * Preferred wallet refresh method.
     */
    refreshWallet,

    /**
     * Existing Dashboard compatibility.
     */
    refetch: fetchWallet,
  };
};
