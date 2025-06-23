
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface Wallet {
  id: string;
  balance: number;
  virtual_account_number: string;
}

export const useWallet = (userId: string | undefined) => {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    fetchWallet();
  }, [userId]);

  const fetchWallet = async () => {
    try {
      const { data, error } = await supabase
        .from('wallets')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error) throw error;
      setWallet(data);
    } catch (error: any) {
      console.error('Error fetching wallet:', error);
      toast({
        title: "Error",
        description: "Failed to load wallet information",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const updateBalance = async (newBalance: number) => {
    if (!wallet) return;

    try {
      const { error } = await supabase
        .from('wallets')
        .update({ balance: newBalance })
        .eq('id', wallet.id);

      if (error) throw error;
      
      setWallet({ ...wallet, balance: newBalance });
    } catch (error: any) {
      console.error('Error updating balance:', error);
      throw error;
    }
  };

  return { wallet, loading, updateBalance, refetch: fetchWallet };
};
