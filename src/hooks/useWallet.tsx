import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Wallet {
  id: string;
  wallet_id: string;
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
          "id, wallet_id, balance, virtual_account_number"
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
          wallet_id: data.wallet_id || "",
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

          wallet_id:
            bootstrapData.wallet.wallet_id || "",

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
          "id, wallet_id, balance, virtual_account_number"
        )
        .eq("user_id", userId)
        .maybeSingle();

      if (refreshedError) {
        throw refreshedError;
      }

      if (refreshedWallet) {
        setWallet({
          id: refreshedWallet.id,

          wallet_id:
            refreshedWallet.wallet_id || "",

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
          "id, wallet_id, balance, virtual_account_number"
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

        wallet_id:
          data.wallet_id || "",

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
   */
  useEffect(() => {
    if (!userId) {
      return;
    }

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
            if (!current) {
              return current;
            }

            return {
              ...current,

              id:
                updated.id ??
                current.id,

              wallet_id:
                updated.wallet_id ??
                current.wallet_id,

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

    return () => {
      isMounted = false;

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

    updateBalance,

    refreshWallet,

    refetch: fetchWallet,
  };
};
