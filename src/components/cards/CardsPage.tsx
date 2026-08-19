import React, { useCallback, useEffect, useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, CreditCard, Lock, Unlock, Trash2, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useWallet } from '@/hooks/useWallet';

interface CardsPageProps {
  onBack: () => void;
}

interface VirtualCard {
  id: string;
  provider_card_id: string;
  masked_pan: string | null;
  last4: string | null;
  currency: string;
  name_on_card: string | null;
  expiry_month: string | null;
  expiry_year: string | null;
  status: string;
  amount_funded: number;
}

const MIN_ISSUE_AMOUNT = 1000;

const CardsPage = ({ onBack }: CardsPageProps) => {
  const { toast } = useToast();
  const { refreshWallet } = useWallet();

  const [cards, setCards] = useState<VirtualCard[]>([]);
  const [loadingCards, setLoadingCards] = useState(true);
  const [issuing, setIssuing] = useState(false);
  const [busyCardId, setBusyCardId] = useState<string | null>(null);
  const [issueAmount, setIssueAmount] = useState('1000');
  const [fundAmounts, setFundAmounts] = useState<Record<string, string>>({});

  const callCards = useCallback(async (payload: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('flutterwave-card', {
      body: payload,
    });

    if (error) {
      // Edge functions return the JSON body on non-2xx responses.
      let message = error.message ?? 'Card request failed';
      const context = (error as any)?.context;
      if (context && typeof context.json === 'function') {
        try {
          const body = await context.json();
          if (body?.error) message = body.error;
        } catch {
          // keep the original message
        }
      }
      throw new Error(message);
    }

    if (data && data.success === false) {
      throw new Error(data.error ?? 'Card request failed');
    }

    return data;
  }, []);

  const loadCards = useCallback(async () => {
    setLoadingCards(true);
    try {
      const data = await callCards({ action: 'list' });
      setCards(Array.isArray(data?.cards) ? data.cards : []);
    } catch (error: any) {
      toast({
        title: 'Unable to load cards',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoadingCards(false);
    }
  }, [callCards, toast]);

  useEffect(() => {
    loadCards();
  }, [loadCards]);

  const handleIssue = async () => {
    const amount = Number(issueAmount);

    if (!Number.isFinite(amount) || amount < MIN_ISSUE_AMOUNT) {
      toast({
        title: 'Invalid amount',
        description: `Minimum initial funding is ₦${MIN_ISSUE_AMOUNT.toLocaleString()}`,
        variant: 'destructive',
      });
      return;
    }

    setIssuing(true);
    try {
      await callCards({ action: 'create', amount });
      toast({
        title: 'Card issued',
        description: `Your virtual card was created and funded with ₦${amount.toLocaleString()}.`,
      });
      setIssueAmount('1000');
      await Promise.all([loadCards(), refreshWallet()]);
    } catch (error: any) {
      toast({
        title: 'Card issuing failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIssuing(false);
    }
  };

  const handleFund = async (card: VirtualCard) => {
    const amount = Number(fundAmounts[card.provider_card_id] ?? '');

    if (!Number.isFinite(amount) || amount <= 0) {
      toast({
        title: 'Invalid amount',
        description: 'Enter the amount you want to add to this card.',
        variant: 'destructive',
      });
      return;
    }

    setBusyCardId(card.provider_card_id);
    try {
      await callCards({ action: 'fund', card_id: card.provider_card_id, amount });
      toast({
        title: 'Card funded',
        description: `₦${amount.toLocaleString()} added to your card.`,
      });
      setFundAmounts((prev) => ({ ...prev, [card.provider_card_id]: '' }));
      await Promise.all([loadCards(), refreshWallet()]);
    } catch (error: any) {
      toast({
        title: 'Funding failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setBusyCardId(null);
    }
  };

  const handleLifecycle = async (
    card: VirtualCard,
    action: 'freeze' | 'unfreeze' | 'terminate',
  ) => {
    if (action === 'terminate' && !window.confirm('Terminate this card permanently?')) {
      return;
    }

    setBusyCardId(card.provider_card_id);
    try {
      await callCards({ action, card_id: card.provider_card_id });
      toast({
        title:
          action === 'freeze'
            ? 'Card frozen'
            : action === 'unfreeze'
              ? 'Card unfrozen'
              : 'Card terminated',
      });
      await loadCards();
    } catch (error: any) {
      toast({
        title: `Unable to ${action} card`,
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setBusyCardId(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-sky-50 to-indigo-50">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="sm" onClick={onBack} className="text-blue-600">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <h1 className="text-2xl font-bold text-gray-900">Virtual Cards</h1>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto text-blue-600"
            onClick={loadCards}
            disabled={loadingCards}
          >
            <RefreshCw className={`h-4 w-4 ${loadingCards ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Create a new virtual card
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-500">
              Cards are issued instantly and funded from your IyanjuPay wallet. BVN
              verification is required before your first card.
            </p>

            <div className="space-y-2">
              <Label htmlFor="issueAmount">Initial funding amount (₦)</Label>
              <Input
                id="issueAmount"
                type="number"
                min={MIN_ISSUE_AMOUNT}
                value={issueAmount}
                onChange={(e) => setIssueAmount(e.target.value)}
                placeholder="1000"
              />
            </div>

            <Button
              className="w-full bg-blue-600 hover:bg-blue-700"
              onClick={handleIssue}
              disabled={issuing}
            >
              {issuing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Issuing card...
                </>
              ) : (
                'Issue Card'
              )}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>My Cards</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingCards ? (
              <div className="flex items-center justify-center py-8 text-gray-500">
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Loading cards...
              </div>
            ) : cards.length === 0 ? (
              <div className="text-center py-8">
                <CreditCard className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-500">No cards yet</p>
                <p className="text-sm text-gray-400">Issue a card to get started</p>
              </div>
            ) : (
              cards.map((card) => (
                <div
                  key={card.id}
                  className="rounded-xl border border-blue-100 p-4 space-y-4"
                >
                  <div className="rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 text-primary-foreground p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs uppercase tracking-wide opacity-80">
                        {card.currency} Virtual Card
                      </span>
                      <span className="text-xs capitalize opacity-90">{card.status}</span>
                    </div>
                    <p className="mt-4 text-lg font-mono tracking-widest">
                      {card.masked_pan ?? `**** **** **** ${card.last4 ?? '****'}`}
                    </p>
                    <div className="mt-3 flex items-center justify-between text-xs opacity-90">
                      <span>{card.name_on_card ?? 'IyanjuPay User'}</span>
                      <span>
                        {card.expiry_month ?? '--'}/{card.expiry_year ?? '--'}
                      </span>
                    </div>
                  </div>

                  <p className="text-sm text-gray-500">
                    Total funded: ₦{Number(card.amount_funded ?? 0).toLocaleString()}
                  </p>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                      type="number"
                      min={1}
                      placeholder="Amount to add"
                      value={fundAmounts[card.provider_card_id] ?? ''}
                      onChange={(e) =>
                        setFundAmounts((prev) => ({
                          ...prev,
                          [card.provider_card_id]: e.target.value,
                        }))
                      }
                    />
                    <Button
                      className="bg-blue-600 hover:bg-blue-700"
                      onClick={() => handleFund(card)}
                      disabled={busyCardId === card.provider_card_id}
                    >
                      Fund Card
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {card.status === 'frozen' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleLifecycle(card, 'unfreeze')}
                        disabled={busyCardId === card.provider_card_id}
                      >
                        <Unlock className="h-4 w-4 mr-2" />
                        Unfreeze
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleLifecycle(card, 'freeze')}
                        disabled={busyCardId === card.provider_card_id}
                      >
                        <Lock className="h-4 w-4 mr-2" />
                        Freeze
                      </Button>
                    )}

                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive"
                      onClick={() => handleLifecycle(card, 'terminate')}
                      disabled={busyCardId === card.provider_card_id}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Terminate
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CardsPage;
