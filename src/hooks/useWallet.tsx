import {
  useCallback,
  useEffect,
  useState,
} from "react";

import { supabase } from "@/integrations/supabase/client";

import { useToast } from "@/hooks/use-toast";

interface Wallet {
  id: string;
  wallet_id: string;
  balance: number;
  virtual_account_number: string;
}

export const useWallet = (
  userId: string | undefined,
  enabled = true,
  ensureLedgerOnLoad = false,
) => {
  const [
    wallet,
    setWallet,
  ] =
    useState<Wallet | null>(null);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const { toast } =
    useToast();

  /*
   * ============================================================
   * FETCH WALLET
   * ============================================================
   */

  const fetchWallet =
    useCallback(async () => {
      if (!enabled || !userId) {
        setWallet(null);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // The customer Dashboard requests the full bootstrap once so the
        // wallet and its available/held ledger accounts are both ensured.
        // Other useWallet consumers keep the lightweight existing-wallet
        // lookup and only bootstrap when the wallet row is missing.
        if (ensureLedgerOnLoad) {
          const { data, error } = await supabase.functions.invoke(
            "wallet-bootstrap",
            { body: {} },
          );
          if (error) throw error;
          const item = data?.wallet;
          if (!item?.id) throw new Error("Wallet bootstrap returned no wallet.");
          setWallet({
            id: item.id,
            wallet_id: item.wallet_id || "",
            balance: Number(item.balance) || 0,
            virtual_account_number: item.virtual_account_number || "",
          });
          return;
        }

        const { data, error } = await supabase
          .from("wallets")
          .select("id, wallet_id, balance, virtual_account_number")
          .eq("user_id", userId)
          .maybeSingle();
        if (error) throw error;

        if (data) {
          setWallet({
            id: data.id,
            wallet_id: data.wallet_id || "",
            balance: Number(data.balance) || 0,
            virtual_account_number: data.virtual_account_number || "",
          });
          return;
        }

        const { data: bootstrapData, error: bootstrapError } =
          await supabase.functions.invoke("wallet-bootstrap", { body: {} });
        if (bootstrapError) throw bootstrapError;

        if (bootstrapData?.wallet?.id) {
          const item = bootstrapData.wallet;
          setWallet({
            id: item.id,
            wallet_id: item.wallet_id || "",
            balance: Number(item.balance) || 0,
            virtual_account_number: item.virtual_account_number || "",
          });
          return;
        }

        const { data: refreshedWallet, error: refreshedError } = await supabase
          .from("wallets")
          .select("id, wallet_id, balance, virtual_account_number")
          .eq("user_id", userId)
          .maybeSingle();
        if (refreshedError) throw refreshedError;
        setWallet(refreshedWallet ? {
          id: refreshedWallet.id,
          wallet_id: refreshedWallet.wallet_id || "",
          balance: Number(refreshedWallet.balance) || 0,
          virtual_account_number: refreshedWallet.virtual_account_number || "",
        } : null);
      } catch (error) {
        console.error("Error fetching wallet:", error);
        setWallet(null);
        toast({
          title: "Wallet Error",
          description: "Failed to load wallet information.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    }, [userId, enabled, ensureLedgerOnLoad, toast]);

  /*
   * ============================================================
   * INITIAL LOAD
   * ============================================================
   */

  useEffect(() => {
    fetchWallet();
  }, [fetchWallet]);

  /*
   * ============================================================
   * REFRESH WALLET
   * ============================================================
   */

  const refreshWallet =
    useCallback(async () => {
      if (!enabled || !userId) {
        return null;
      }

      try {
        const {
          data,
          error,
        } =
          await supabase
            .from("wallets")
            .select(
              "id, wallet_id, balance, virtual_account_number"
            )
            .eq(
              "user_id",
              userId
            )
            .maybeSingle();

        if (error) {
          throw error;
        }

        if (!data) {
          return null;
        }

        const updatedWallet: Wallet =
          {
            id: data.id,

            wallet_id:
              data.wallet_id || "",

            balance:
              Number(
                data.balance
              ) || 0,

            virtual_account_number:
              data.virtual_account_number ||
              "",
          };

        setWallet(
          updatedWallet
        );

        return updatedWallet;
      } catch (error) {
        console.error(
          "Error refreshing wallet:",
          error
        );

        return null;
      }
    }, [
      userId,
      enabled,
    ]);

  /*
   * ============================================================
   * REALTIME WALLET BALANCE
   * ============================================================
   */

  useEffect(() => {
    if (
      !enabled ||
      !userId
    ) {
      return;
    }

    const uniqueId =
      typeof crypto !==
        "undefined" &&
      typeof crypto.randomUUID ===
        "function"
        ? crypto.randomUUID()
        : Math.random()
            .toString(36)
            .substring(2);

    const channelName =
      `wallet-${userId}-${uniqueId}`;

    let isMounted = true;

    const channel =
      supabase
        .channel(channelName)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "wallets",
            filter:
              `user_id=eq.${userId}`,
          },
          payload => {
            if (!isMounted) {
              return;
            }

            const updated =
              payload.new as Partial<Wallet>;

            setWallet(
              current => {
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
                    updated.balance !==
                    undefined
                      ? Number(
                          updated.balance
                        ) || 0
                      : current.balance,

                  virtual_account_number:
                    updated.virtual_account_number ??
                    current.virtual_account_number,
                };
              }
            );
          }
        );

    channel.subscribe(
      status => {
        if (
          status ===
          "SUBSCRIBED"
        ) {
          console.log(
            "Wallet realtime subscribed:",
            channelName
          );
        }

        if (
          status ===
          "CHANNEL_ERROR"
        ) {
          console.error(
            "Wallet realtime channel error:",
            channelName
          );
        }

        if (
          status ===
          "TIMED_OUT"
        ) {
          console.error(
            "Wallet realtime subscription timed out:",
            channelName
          );
        }
      }
    );

    return () => {
      isMounted = false;

      supabase
        .removeChannel(
          channel
        )
        .catch(error => {
          console.error(
            "Failed to remove wallet realtime channel:",
            error
          );
        });
    };
  }, [
    userId,
    enabled,
  ]);

  /*
   * ============================================================
   * BACKWARD COMPATIBILITY
   * ============================================================
   */

  const updateBalance =
    async (
      _newBalance?: number
    ) => {
      return refreshWallet();
    };

  /*
   * ============================================================
   * RETURN
   * ============================================================
   */

  return {
    wallet,
    loading,

    updateBalance,

    refreshWallet,

    refetch:
      fetchWallet,
  };
};
