import React, { useEffect, useMemo, useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { ArrowLeft, Filter, Download, ChevronRight, Clock, CheckCircle2, XCircle, ArrowDownLeft, ArrowUpRight, Receipt, Search,  X, Copy, Printer, User, Building2,
  Hash,  CalendarDays,  FileText,  Wallet,  Banknote,  ShieldCheck } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';


/*
|--------------------------------------------------------------------------
| TYPES
|--------------------------------------------------------------------------
*/

interface TransactionMetadata {
  [key: string]: any;
}

interface TransactionParty {
  user_id?: string | null;
  wallet_id?: string | null;
  name?: string | null;
  full_name?: string | null;
  nickname?: string | null;
  phone_number?: string | null;
  email?: string | null;
}

interface Transaction {
  id: string;
  user_id: string;
  wallet_id?: string | null;

  transaction_type: string;
  amount: number;
  description?: string | null;

  status: string;

  reference_number?: string | null;
  reference?: string | null;

  provider?: string | null;
  provider_reference?: string | null;

  category?: string | null;

  metadata?: TransactionMetadata | null;

  created_at: string;

  fee?: number | null;
  currency?: string | null;
}

interface TransactionHistoryProps {
  onBack: () => void;
}


/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

const safeString = (
  value: any,
  fallback = ''
): string => {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  return String(value);
};


const firstValue = (
  metadata: TransactionMetadata | null | undefined,
  keys: string[],
  fallback = ''
) => {
  for (const key of keys) {

    const value =
      metadata?.[key];

    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ''
    ) {
      return value;
    }
  }

  return fallback;
};


const formatMoney = (
  amount:
    | number
    | string
    | null
    | undefined
) => {

  const value =
    Number(amount || 0);

  return `₦${value.toLocaleString(
    'en-NG',
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }
  )}`;
};


const normalizeStatus = (
  status?: string
) => {
  return safeString(
    status
  ).toLowerCase();
};


/*
|--------------------------------------------------------------------------
| COMPONENT
|--------------------------------------------------------------------------
*/

const TransactionHistory = ({
  onBack
}: TransactionHistoryProps) => {

  const { user } = useAuth();

  const { toast } =
    useToast();


  /*
  |--------------------------------------------------------------------------
  | STATE
  |--------------------------------------------------------------------------
  */

  const [
    transactions,
    setTransactions
  ] = useState<Transaction[]>([]);

  const [
    loading,
    setLoading
  ] = useState(true);

  const [
    filter,
    setFilter
  ] = useState<string>('all');

  const [
    search,
    setSearch
  ] = useState('');

  const [
    selectedTransaction,
    setSelectedTransaction
  ] =
    useState<Transaction | null>(
      null
    );


  /*
  |--------------------------------------------------------------------------
  | FETCH TRANSACTIONS
  |--------------------------------------------------------------------------
  */

  useEffect(() => {

    if (!user?.id) {
      return;
    }

    fetchTransactions();

    const channel =
      supabase
        .channel(
          `transaction-history-${user.id}`
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'transactions',
            filter:
              `user_id=eq.${user.id}`
          },
          () => {
            fetchTransactions();
          }
        )
        .subscribe();

    return () => {
      supabase.removeChannel(
        channel
      );
    };

  }, [user?.id]);


  const fetchTransactions =
    async () => {

      if (!user?.id) {
        return;
      }

      try {

        setLoading(true);

        const {
          data,
          error
        } =
          await supabase
            .from('transactions')
            .select('*')
            .eq(
              'user_id',
              user.id
            )
            .order(
              'created_at',
              {
                ascending: false
              }
            );

        if (error) {
          throw error;
        }

        setTransactions(
          (data || []) as Transaction[]
        );

      } catch (error: any) {

        console.error(
          'Error fetching transactions:',
          error
        );

        toast({
          title: 'Error',
          description:
            error?.message ||
            'Failed to load transaction history',
          variant:
            'destructive'
        });

      } finally {

        setLoading(false);

      }
    };


  /*
  |--------------------------------------------------------------------------
  | METADATA
  |--------------------------------------------------------------------------
  */

  const getTransactionMetadata =
    (
      transaction: Transaction
    ): TransactionMetadata => {

      return (
        transaction.metadata ||
        {}
      );
    };


  /*
  |--------------------------------------------------------------------------
  | TRANSACTION TYPE
  |--------------------------------------------------------------------------
  */

  const getTransactionType =
    (
      transaction: Transaction
    ) => {

      const metadata =
        getTransactionMetadata(
          transaction
        );

      const rawType =
        safeString(
          firstValue(
            metadata,
            [
              'transaction_type',
              'type',
              'transactionType'
            ],
            transaction.transaction_type
          ),
          'transaction'
        ).toLowerCase();


      if (
        rawType ===
          'internal_transfer' ||
        rawType ===
          'wallet_to_wallet' ||
        rawType ===
          'transfer'
      ) {
        return 'transfer';
      }


      if (
        rawType ===
          'virtual_account_funding' ||
        rawType ===
          'wallet_funding' ||
        rawType ===
          'funding'
      ) {
        return 'funding';
      }


      return rawType;
    };


  /*
  |--------------------------------------------------------------------------
  | DIRECTION
  |--------------------------------------------------------------------------
  */

  const isMoneyIn =
    (
      transaction: Transaction
    ) => {

      const metadata =
        getTransactionMetadata(
          transaction
        );

      const direction =
        safeString(
          firstValue(
            metadata,
            [
              'direction',
              'transaction_direction'
            ]
          )
        ).toLowerCase();


      if (
        direction ===
          'incoming' ||
        direction ===
          'in' ||
        direction ===
          'credit' ||
        direction ===
          'money_in'
      ) {
        return true;
      }


      if (
        direction ===
          'outgoing' ||
        direction ===
          'out' ||
        direction ===
          'debit' ||
        direction ===
          'money_out'
      ) {
        return false;
      }


      const type =
        getTransactionType(
          transaction
        );


      return [
        'deposit',
        'credit',
        'funding',
        'refund',
        'cashback',
        'reversal',
        'money_in'
      ].includes(type);
    };


  /*
  |--------------------------------------------------------------------------
  | SENDER
  |--------------------------------------------------------------------------
  */

  const getSender =
    (
      transaction: Transaction
    ): TransactionParty => {

      const metadata =
        getTransactionMetadata(
          transaction
        );

      return (
        metadata.sender || {
          user_id:
            metadata.sender_user_id,

          wallet_id:
            metadata.sender_wallet_id,

          name:
            metadata.sender_name,

          full_name:
            metadata.sender_full_name,

          nickname:
            metadata.sender_nickname,

          phone_number:
            metadata.sender_phone_number,

          email:
            metadata.sender_email
        }
      );
    };


  /*
  |--------------------------------------------------------------------------
  | RECIPIENT
  |--------------------------------------------------------------------------
  */

  const getRecipient =
    (
      transaction: Transaction
    ): TransactionParty => {

      const metadata =
        getTransactionMetadata(
          transaction
        );

      return (
        metadata.recipient || {
          user_id:
            metadata.recipient_user_id,

          wallet_id:
            metadata.recipient_wallet_id,

          name:
            metadata.recipient_name,

          full_name:
            metadata.recipient_full_name,

          nickname:
            metadata.recipient_nickname,

          phone_number:
            metadata.recipient_phone_number,

          email:
            metadata.recipient_email
        }
      );
    };


  /*
  |--------------------------------------------------------------------------
  | COUNTERPARTY NAME
  |--------------------------------------------------------------------------
  */

  const getCounterpartyName =
    (
      transaction: Transaction
    ) => {

      const metadata =
        getTransactionMetadata(
          transaction
        );

      const moneyIn =
        isMoneyIn(
          transaction
        );

      const party =
        moneyIn
          ? getSender(transaction)
          : getRecipient(transaction);


      const partyName =
        safeString(
          party?.name ||
          party?.full_name ||
          party?.nickname
        );


      if (partyName) {
        return partyName;
      }


      if (moneyIn) {

        return safeString(
          firstValue(
            metadata,
            [
              'sender_name',
              'sender_full_name',
              'senderName',
              'from_name',
              'from_full_name',
              'account_name',
              'bank_account_name',
              'customer_name',
              'payer_name'
            ],
            'Funding source'
          )
        );
      }


      return safeString(
        firstValue(
          metadata,
          [
            'recipient_name',
            'recipient_full_name',
            'recipientName',
            'receiver_name',
            'receiver_full_name',
            'to_name',
            'to_full_name'
          ],
          'Recipient'
        )
      );
    };


  /*
  |--------------------------------------------------------------------------
  | COUNTERPARTY NICKNAME
  |--------------------------------------------------------------------------
  */

  const getCounterpartyNickname =
    (
      transaction: Transaction
    ) => {

      const party =
        isMoneyIn(transaction)
          ? getSender(transaction)
          : getRecipient(transaction);

      return safeString(
        party?.nickname ||
        ''
      );
    };


  /*
  |--------------------------------------------------------------------------
  | COUNTERPARTY WALLET
  |--------------------------------------------------------------------------
  */

  const getCounterpartyWallet =
    (
      transaction: Transaction
    ) => {

      const metadata =
        getTransactionMetadata(
          transaction
        );

      const party =
        isMoneyIn(transaction)
          ? getSender(transaction)
          : getRecipient(transaction);


      if (party?.wallet_id) {

        return safeString(
          party.wallet_id
        );
      }


      if (
        isMoneyIn(transaction)
      ) {

        return safeString(
          firstValue(
            metadata,
            [
              'sender_wallet_id',
              'senderWalletId',
              'from_wallet_id'
            ],
            ''
          )
        );
      }


      return safeString(
        firstValue(
          metadata,
          [
            'recipient_wallet_id',
            'recipientWalletId',
            'receiver_wallet_id',
            'to_wallet_id'
          ],
          ''
        )
      );
    };


  /*
  |--------------------------------------------------------------------------
  | BANK NAME
  |--------------------------------------------------------------------------
  */

  const getBankName =
    (
      transaction: Transaction
    ) => {

      const metadata =
        getTransactionMetadata(
          transaction
        );

      return safeString(
        firstValue(
          metadata,
          [
            'sender_bank_name',
            'bank_name',
            'bankName',
            'from_bank_name',
            'recipient_bank_name',
            'to_bank_name'
          ],
          ''
        )
      );
    };


  /*
  |--------------------------------------------------------------------------
  | ACCOUNT NUMBER
  |--------------------------------------------------------------------------
  */

  const getAccountNumber =
    (
      transaction: Transaction
    ) => {

      const metadata =
        getTransactionMetadata(
          transaction
        );

      return safeString(
        firstValue(
          metadata,
          [
            'sender_account_number',
            'account_number',
            'accountNumber',
            'from_account_number',
            'recipient_account_number',
            'to_account_number'
          ],
          ''
        )
      );
    };


  /*
  |--------------------------------------------------------------------------
  | NARRATION
  |--------------------------------------------------------------------------
  */

  const getNarration =
    (
      transaction: Transaction
    ) => {

      const metadata =
        getTransactionMetadata(
          transaction
        );

      return safeString(
        firstValue(
          metadata,
          [
            'narration',
            'description',
            'remark',
            'reason'
          ],
          transaction.description ||
            'Wallet transaction'
        )
      );
    };


  /*
  |--------------------------------------------------------------------------
  | REFERENCE
  |--------------------------------------------------------------------------
  */

  const getReference =
    (
      transaction: Transaction
    ) => {

      const metadata =
        getTransactionMetadata(
          transaction
        );

      return safeString(
        firstValue(
          metadata,
          [
            'reference',
            'transaction_reference',
            'transactionReference'
          ],
          transaction.reference_number ||
            transaction.reference ||
            transaction.id
        )
      );
    };


  /*
  |--------------------------------------------------------------------------
  | PROVIDER REFERENCE
  |--------------------------------------------------------------------------
  */

  const getProviderReference =
    (
      transaction: Transaction
    ) => {

      const metadata =
        getTransactionMetadata(
          transaction
        );

      return safeString(
        firstValue(
          metadata,
          [
            'provider_reference',
            'providerReference',
            'flutterwave_reference',
            'flw_reference'
          ],
          transaction.provider_reference ||
            ''
        )
      );
    };


  /*
  |--------------------------------------------------------------------------
  | FEE
  |--------------------------------------------------------------------------
  */

  const getFee =
    (
      transaction: Transaction
    ) => {

      const metadata =
        getTransactionMetadata(
          transaction
        );

      const fee =
        firstValue(
          metadata,
          [
            'fee',
            'transaction_fee',
            'charge',
            'transfer_fee'
          ],
          transaction.fee ?? 0
        );

      return Number(
        fee || 0
      );
    };


  /*
  |--------------------------------------------------------------------------
  | OPAY STYLE TITLE
  |--------------------------------------------------------------------------
  */

  const getTransactionTitle =
    (
      transaction: Transaction
    ) => {

      const type =
        getTransactionType(
          transaction
        );

      const moneyIn =
        isMoneyIn(
          transaction
        );


      switch (type) {

        case 'transfer':

          return moneyIn
            ? `Received from ${getCounterpartyName(transaction)}`
            : `Transfer to ${getCounterpartyName(transaction)}`;


        case 'funding':

          return 'Wallet Funding';


        case 'deposit':

          return 'Wallet Deposit';


        case 'refund':

          return 'Refund';


        case 'cashback':

          return 'Cashback';


        case 'airtime':

          return 'Airtime';


        case 'data':

          return 'Data';


        case 'electricity':

          return 'Electricity';


        case 'cable':

          return 'Cable TV';


        case 'withdrawal':

          return 'Withdrawal';


        default:

          return moneyIn
            ? `Money received from ${getCounterpartyName(transaction)}`
            : `Money sent to ${getCounterpartyName(transaction)}`;
      }
    };


  /*
  |--------------------------------------------------------------------------
  | SUBTITLE
  |--------------------------------------------------------------------------
  */

  const getTransactionSubtitle =
    (
      transaction: Transaction
    ) => {

      const type =
        getTransactionType(
          transaction
        );

      const moneyIn =
        isMoneyIn(
          transaction
        );


      if (type === 'transfer') {

        return moneyIn
          ? 'Money received'
          : 'Money sent';
      }


      if (type === 'funding') {

        const bank =
          getBankName(
            transaction
          );

        return bank
          ? `Funding via ${bank}`
          : 'Money added to wallet';
      }


      return getNarration(
        transaction
      );
    };


  /*
  |--------------------------------------------------------------------------
  | ICON
  |--------------------------------------------------------------------------
  */

  const getTransactionIcon =
    (
      transaction: Transaction
    ) => {

      const type =
        getTransactionType(
          transaction
        );

      const moneyIn =
        isMoneyIn(
          transaction
        );


      if (type === 'transfer') {

        return moneyIn ? (
          <ArrowDownLeft
            className="h-5 w-5 text-green-600"
          />
        ) : (
          <ArrowUpRight
            className="h-5 w-5 text-purple-600"
          />
        );
      }


      switch (type) {

        case 'funding':
        case 'deposit':
        case 'credit':

          return (
            <Banknote
              className="h-5 w-5 text-green-600"
            />
          );


        case 'airtime':

          return (
            <span className="text-lg">
              📱
            </span>
          );


        case 'data':

          return (
            <span className="text-lg">
              🌐
            </span>
          );


        case 'electricity':

          return (
            <span className="text-lg">
              ⚡
            </span>
          );


        case 'cable':

          return (
            <span className="text-lg">
              📺
            </span>
          );


        default:

          return (
            <Wallet
              className="h-5 w-5 text-purple-600"
            />
          );
      }
    };


  /*
  |--------------------------------------------------------------------------
  | ICON BACKGROUND
  |--------------------------------------------------------------------------
  */

  const getTransactionIconBackground =
    (
      transaction: Transaction
    ) => {

      return isMoneyIn(transaction)
        ? 'bg-green-50'
        : 'bg-purple-50';
    };


  /*
  |--------------------------------------------------------------------------
  | STATUS
  |--------------------------------------------------------------------------
  */

  const getStatusColor =
    (
      status: string
    ) => {

      switch (
        normalizeStatus(status)
      ) {

        case 'completed':
        case 'successful':
        case 'success':

          return 'text-green-700 bg-green-100 border-green-200';


        case 'pending':
        case 'processing':

          return 'text-yellow-700 bg-yellow-100 border-yellow-200';


        case 'failed':
        case 'cancelled':
        case 'canceled':
        case 'reversed':

          return 'text-red-700 bg-red-100 border-red-200';


        default:

          return 'text-gray-700 bg-gray-100 border-gray-200';
      }
    };


  const getStatusIcon =
    (
      status: string
    ) => {

      switch (
        normalizeStatus(status)
      ) {

        case 'completed':
        case 'successful':
        case 'success':

          return (
            <CheckCircle2
              className="h-3.5 w-3.5"
            />
          );


        case 'pending':
        case 'processing':

          return (
            <Clock
              className="h-3.5 w-3.5"
            />
          );


        case 'failed':
        case 'cancelled':
        case 'canceled':
        case 'reversed':

          return (
            <XCircle
              className="h-3.5 w-3.5"
            />
          );


        default:

          return (
            <Clock
              className="h-3.5 w-3.5"
            />
          );
      }
    };


  /*
  |--------------------------------------------------------------------------
  | DATE
  |--------------------------------------------------------------------------
  */

  const formatDate =
    (
      date: string
    ) => {

      return new Date(
        date
      ).toLocaleDateString(
        'en-NG',
        {
          day: 'numeric',
          month: 'short',
          year: 'numeric'
        }
      );
    };


  const formatTime =
    (
      date: string
    ) => {

      return new Date(
        date
      ).toLocaleTimeString(
        'en-NG',
        {
          hour: '2-digit',
          minute: '2-digit'
        }
      );
    };


  const formatFullDate =
    (
      date: string
    ) => {

      return new Date(
        date
      ).toLocaleString(
        'en-NG',
        {
          weekday: 'short',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }
      );
    };


  /*
  |--------------------------------------------------------------------------
  | COPY REFERENCE
  |--------------------------------------------------------------------------
  */

  const copyReference =
    async (
      transaction: Transaction
    ) => {

      const reference =
        getReference(
          transaction
        );

      try {

        await navigator.clipboard.writeText(
          reference
        );

        toast({
          title: 'Copied',
          description:
            'Transaction reference copied'
        });

      } catch {

        toast({
          title: 'Unable to copy',
          description:
            'Please copy the reference manually',
          variant:
            'destructive'
        });
      }
    };


  /*
  |--------------------------------------------------------------------------
  | PRINT RECEIPT
  |--------------------------------------------------------------------------
  */

  const printReceipt =
    (
      transaction: Transaction
    ) => {

      const moneyIn =
        isMoneyIn(
          transaction
        );

      const counterparty =
        getCounterpartyName(
          transaction
        );

      const wallet =
        getCounterpartyWallet(
          transaction
        );

      const bank =
        getBankName(
          transaction
        );

      const account =
        getAccountNumber(
          transaction
        );

      const narration =
        getNarration(
          transaction
        );

      const reference =
        getReference(
          transaction
        );

      const providerReference =
        getProviderReference(
          transaction
        );

      const fee =
        getFee(
          transaction
        );

      const title =
        getTransactionTitle(
          transaction
        );

      const status =
        transaction.status ||
        'completed';

      const currency =
        transaction.currency ||
        'NGN';

      const amount =
        Number(
          transaction.amount || 0
        );


      const receiptWindow =
        window.open(
          '',
          '_blank',
          'width=500,height=800'
        );


      if (!receiptWindow) {

        toast({
          title: 'Popup blocked',
          description:
            'Please allow popups to print the receipt',
          variant:
            'destructive'
        });

        return;
      }


      const escaped =
        (value: any) =>
          String(
            value ?? ''
          )
            .replace(
              /&/g,
              '&amp;'
            )
            .replace(
              /</g,
              '&lt;'
            )
            .replace(
              />/g,
              '&gt;'
            )
            .replace(
              /"/g,
              '&quot;'
            )
            .replace(
              /'/g,
              '&#039;'
            );


      receiptWindow.document.write(`
        <!DOCTYPE html>

        <html>

        <head>

          <title>
            IyanjuPay Transaction Receipt
          </title>

          <style>

            * {
              box-sizing: border-box;
            }

            body {
              margin: 0;
              padding: 30px;
              font-family:
                Arial,
                Helvetica,
                sans-serif;
              background: #f5f7fb;
              color: #111827;
            }

            .receipt {
              max-width: 430px;
              margin: 0 auto;
              background: white;
              border-radius: 18px;
              padding: 28px;
              box-shadow:
                0 10px 30px
                rgba(
                  0,
                  0,
                  0,
                  0.08
                );
            }

            .brand {
              text-align: center;
              font-size: 24px;
              font-weight: 800;
              color: #6d28d9;
              margin-bottom: 4px;
            }

            .subtitle {
              text-align: center;
              color: #6b7280;
              font-size: 12px;
            }

            .status {
              margin: 22px auto;
              width: 76px;
              height: 76px;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              background:
                ${
                  moneyIn
                    ? '#dcfce7'
                    : '#ede9fe'
                };
              color:
                ${
                  moneyIn
                    ? '#16a34a'
                    : '#7c3aed'
                };
              font-size: 36px;
            }

            .amount {
              text-align: center;
              font-size: 30px;
              font-weight: 800;
              margin-bottom: 4px;
            }

            .direction {
              text-align: center;
              color: #6b7280;
              font-size: 13px;
              margin-bottom: 24px;
            }

            .divider {
              border-top:
                1px solid #e5e7eb;
              margin: 20px 0;
            }

            .row {
              display: flex;
              justify-content: space-between;
              gap: 20px;
              padding: 9px 0;
              font-size: 13px;
            }

            .label {
              color: #6b7280;
            }

            .value {
              text-align: right;
              font-weight: 600;
              max-width: 60%;
              word-break: break-word;
            }

            .reference {
              font-family: monospace;
              font-size: 11px;
            }

            .footer {
              margin-top: 25px;
              padding-top: 18px;
              border-top:
                1px dashed #d1d5db;
              text-align: center;
              color: #9ca3af;
              font-size: 11px;
              line-height: 1.6;
            }

            @media print {

              body {
                background: white;
                padding: 0;
              }

              .receipt {
                box-shadow: none;
                max-width: 100%;
              }

            }

          </style>

        </head>

        <body>

          <div class="receipt">

            <div class="brand">
              IyanjuPay
            </div>

            <div class="subtitle">
              Transaction Receipt
            </div>

            <div class="status">

              ${
                normalizeStatus(
                  status
                ) === 'completed' ||
                normalizeStatus(
                  status
                ) === 'successful' ||
                normalizeStatus(
                  status
                ) === 'success'
                  ? '✓'
                  : normalizeStatus(
                      status
                    ) === 'failed'
                    ? '×'
                    : '⋯'
              }

            </div>

            <div class="amount">

              ${
                moneyIn
                  ? '+'
                  : '-'
              }

              ${escaped(currency)}

              ${amount.toLocaleString(
                'en-NG',
                {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2
                }
              )}

            </div>

            <div class="direction">

              ${
                moneyIn
                  ? 'Money received'
                  : 'Money sent'
              }

            </div>

            <div class="divider"></div>


            <div class="row">

              <span class="label">
                Status
              </span>

              <span class="value">
                ${escaped(status)}
              </span>

            </div>


            <div class="row">

              <span class="label">

                ${
                  moneyIn
                    ? 'From'
                    : 'To'
                }

              </span>

              <span class="value">
                ${escaped(counterparty)}
              </span>

            </div>


            ${
              wallet
                ? `
                  <div class="row">

                    <span class="label">
                      Wallet ID
                    </span>

                    <span class="value">
                      ${escaped(wallet)}
                    </span>

                  </div>
                `
                : ''
            }


            ${
              bank
                ? `
                  <div class="row">

                    <span class="label">
                      Bank
                    </span>

                    <span class="value">
                      ${escaped(bank)}
                    </span>

                  </div>
                `
                : ''
            }


            ${
              account
                ? `
                  <div class="row">

                    <span class="label">
                      Account
                    </span>

                    <span class="value">
                      ${escaped(account)}
                    </span>

                  </div>
                `
                : ''
            }


            <div class="row">

              <span class="label">
                Type
              </span>

              <span class="value">
                ${escaped(title)}
              </span>

            </div>


            <div class="row">

              <span class="label">
                Narration
              </span>

              <span class="value">
                ${escaped(narration)}
              </span>

            </div>


            ${
              fee > 0
                ? `
                  <div class="row">

                    <span class="label">
                      Fee
                    </span>

                    <span class="value">
                      ${formatMoney(fee)}
                    </span>

                  </div>
                `
                : ''
            }


            <div class="row">

              <span class="label">
                Date
              </span>

              <span class="value">
                ${escaped(
                  formatFullDate(
                    transaction.created_at
                  )
                )}
              </span>

            </div>


            <div class="row">

              <span class="label">
                Reference
              </span>

              <span class="value reference">
                ${escaped(reference)}
              </span>

            </div>


            ${
              providerReference
                ? `
                  <div class="row">

                    <span class="label">
                      Provider Ref.
                    </span>

                    <span class="value reference">
                      ${escaped(
                        providerReference
                      )}
                    </span>

                  </div>
                `
                : ''
            }


            <div class="footer">

              This is an electronically generated
              transaction receipt from IyanjuPay.

              <br />

              Keep this receipt for your records.

            </div>

          </div>


          <script>

            window.onload = function() {
              window.print();
            };

          </script>

        </body>

        </html>
      `);

      receiptWindow.document.close();
    };


  /*
  |--------------------------------------------------------------------------
  | FILTERED TRANSACTIONS
  |--------------------------------------------------------------------------
  */

  const filteredTransactions =
    useMemo(() => {

      return transactions.filter(
        (transaction) => {

          const status =
            normalizeStatus(
              transaction.status
            );


          const matchesFilter =
            filter === 'all' ||
            status === filter;


          const searchText =
            search
              .toLowerCase()
              .trim();


          const metadata =
            getTransactionMetadata(
              transaction
            );


          const searchableText = [

            transaction.description,

            transaction.transaction_type,

            transaction.reference_number,

            transaction.reference,

            transaction.provider_reference,

            getTransactionTitle(
              transaction
            ),

            getCounterpartyName(
              transaction
            ),

            getCounterpartyNickname(
              transaction
            ),

            getCounterpartyWallet(
              transaction
            ),

            getBankName(
              transaction
            ),

            getAccountNumber(
              transaction
            ),

            getNarration(
              transaction
            ),

            firstValue(
              metadata,
              [
                'sender_name',
                'recipient_name',
                'sender_account_name',
                'recipient_account_name'
              ]
            )

          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();


          const matchesSearch =
            !searchText ||
            searchableText.includes(
              searchText
            );


          return (
            matchesFilter &&
            matchesSearch
          );
        }
      );

    }, [
      transactions,
      filter,
      search
    ]);


  /*
  |--------------------------------------------------------------------------
  | SUMMARY
  |--------------------------------------------------------------------------
  */

  const completedTransactions =
    transactions.filter(
      (transaction) => {

        const status =
          normalizeStatus(
            transaction.status
          );

        return [
          'completed',
          'successful',
          'success'
        ].includes(status);
      }
    );


  const pendingTransactions =
    transactions.filter(
      (transaction) => {

        const status =
          normalizeStatus(
            transaction.status
          );

        return [
          'pending',
          'processing'
        ].includes(status);
      }
    );


  const failedTransactions =
    transactions.filter(
      (transaction) => {

        const status =
          normalizeStatus(
            transaction.status
          );

        return [
          'failed',
          'cancelled',
          'canceled'
        ].includes(status);
      }
    );


  const totalSpent =
    completedTransactions
      .filter(
        (transaction) =>
          !isMoneyIn(
            transaction
          )
      )
      .reduce(
        (
          sum,
          transaction
        ) =>
          sum +
          Number(
            transaction.amount || 0
          ),
        0
      );


  /*
  |--------------------------------------------------------------------------
  | LOADING
  |--------------------------------------------------------------------------
  */

  if (loading) {

    return (

      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50 px-4">

        <div className="text-center">

          <div className="animate-spin rounded-full h-12 w-12 sm:h-16 sm:w-16 border-b-2 border-purple-600 mx-auto" />

          <p className="mt-4 text-sm sm:text-base text-gray-600">
            Loading transactions...
          </p>

        </div>

      </div>
    );
  }


  /*
  |--------------------------------------------------------------------------
  | PAGE
  |--------------------------------------------------------------------------
  */

  return (

    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50">

      <div className="w-full max-w-6xl mx-auto px-3 sm:px-4 md:px-6 py-4 sm:py-6">


        {/* HEADER */}

        <div className="flex items-center justify-between gap-3 mb-5 sm:mb-6">

          <div className="flex items-center gap-2 sm:gap-4 min-w-0">

            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
              className="text-purple-600 shrink-0 px-2 sm:px-3"
            >

              <ArrowLeft className="h-4 w-4 sm:mr-2" />

              <span className="hidden sm:inline">
                Back
              </span>

            </Button>


            <h1 className="text-lg sm:text-2xl font-bold text-gray-900 truncate">
              Transaction History
            </h1>

          </div>


          <div className="hidden sm:flex gap-2 shrink-0">

            <Button
              variant="outline"
              size="sm"
              onClick={() => {

                setFilter(
                  filter === 'all'
                    ? 'completed'
                    : 'all'
                );

              }}
            >

              <Filter className="h-4 w-4 mr-2" />

              Filter

            </Button>


            <Button
              variant="outline"
              size="sm"
              onClick={() => {

                if (
                  filteredTransactions.length === 0
                ) {

                  toast({
                    title:
                      'No transactions',
                    description:
                      'There are no transactions to export.'
                  });

                  return;
                }


                const rows =
                  filteredTransactions.map(
                    (transaction) => ({
                      Date:
                        formatFullDate(
                          transaction.created_at
                        ),

                      Transaction:
                        getTransactionTitle(
                          transaction
                        ),

                      Direction:
                        isMoneyIn(
                          transaction
                        )
                          ? 'Money In'
                          : 'Money Out',

                      FromTo:
                        getCounterpartyName(
                          transaction
                        ),

                      Amount:
                        Number(
                          transaction.amount
                        ),

                      Status:
                        transaction.status,

                      Reference:
                        getReference(
                          transaction
                        ),

                      Narration:
                        getNarration(
                          transaction
                        )
                    })
                  );


                const headers =
                  Object.keys(
                    rows[0]
                  );


                const csv = [

                  headers.join(','),

                  ...rows.map(
                    (row) =>
                      headers
                        .map(
                          (header) =>
                            `"${String(
                              (row as any)[
                                header
                              ] ?? ''
                            ).replace(
                              /"/g,
                              '""'
                            )}"`
                        )
                        .join(',')
                  )

                ].join('\n');


                const blob =
                  new Blob(
                    [csv],
                    {
                      type:
                        'text/csv;charset=utf-8;'
                    }
                  );


                const url =
                  URL.createObjectURL(
                    blob
                  );


                const a =
                  document.createElement(
                    'a'
                  );

                a.href = url;

                a.download =
                  `iyanjupay-transactions-${new Date()
                    .toISOString()
                    .slice(0, 10)}.csv`;

                a.click();

                URL.revokeObjectURL(
                  url
                );

              }}
            >

              <Download className="h-4 w-4 mr-2" />

              Export

            </Button>

          </div>


          <Button
            variant="outline"
            size="sm"
            className="sm:hidden shrink-0"
            onClick={() => {

              setFilter(
                filter === 'all'
                  ? 'completed'
                  : 'all'
              );

            }}
          >

            <Filter className="h-4 w-4" />

          </Button>

        </div>


        {/* SEARCH */}

        <div className="relative mb-4 sm:mb-6">

          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />

          <input
            type="text"
            value={search}
            onChange={(e) =>
              setSearch(
                e.target.value
              )
            }
            placeholder="Search by name, wallet, reference..."
            className="w-full h-11 rounded-xl border border-gray-200 bg-white pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />

        </div>


        {/* SUMMARY */}

        <div className="flex md:grid md:grid-cols-4 gap-3 mb-5 sm:mb-6 overflow-x-auto pb-1 md:overflow-visible">

          <Card className="min-w-[150px] md:min-w-0 shadow-sm">

            <CardContent className="p-4 text-center">

              <p className="text-xl sm:text-2xl font-bold text-green-600">
                {completedTransactions.length}
              </p>

              <p className="text-xs sm:text-sm text-gray-600 mt-1">
                Completed
              </p>

            </CardContent>

          </Card>


          <Card className="min-w-[150px] md:min-w-0 shadow-sm">

            <CardContent className="p-4 text-center">

              <p className="text-xl sm:text-2xl font-bold text-yellow-600">
                {pendingTransactions.length}
              </p>

              <p className="text-xs sm:text-sm text-gray-600 mt-1">
                Pending
              </p>

            </CardContent>

          </Card>


          <Card className="min-w-[150px] md:min-w-0 shadow-sm">

            <CardContent className="p-4 text-center">

              <p className="text-xl sm:text-2xl font-bold text-red-600">
                {failedTransactions.length}
              </p>

              <p className="text-xs sm:text-sm text-gray-600 mt-1">
                Failed
              </p>

            </CardContent>

          </Card>


          <Card className="min-w-[180px] md:min-w-0 shadow-sm">

            <CardContent className="p-4 text-center">

              <p className="text-xl sm:text-2xl font-bold text-purple-600">
                {formatMoney(
                  totalSpent
                )}
              </p>

              <p className="text-xs sm:text-sm text-gray-600 mt-1">
                Total Sent
              </p>

            </CardContent>

          </Card>

        </div>


        {/* FILTER BUTTONS */}

        <div className="flex gap-2 mb-5 overflow-x-auto pb-1">

          {[
            'all',
            'completed',
            'pending',
            'failed'
          ].map(
            (status) => (

              <Button
                key={status}
                variant={
                  filter === status
                    ? 'default'
                    : 'outline'
                }
                size="sm"
                onClick={() =>
                  setFilter(status)
                }
                className={`
                  shrink-0 rounded-full px-4
                  ${
                    filter === status
                      ? 'bg-purple-600 hover:bg-purple-700'
                      : 'bg-white'
                  }
                `}
              >

                {status === 'all'
                  ? 'All'
                  : status
                      .charAt(0)
                      .toUpperCase() +
                    status.slice(1)}

              </Button>

            )
          )}

        </div>


        {/* TRANSACTIONS */}

        <Card className="shadow-sm border-gray-100 overflow-hidden">

          <CardHeader className="px-4 sm:px-6 py-4 border-b bg-white">

            <CardTitle className="text-base sm:text-lg">
              Recent Transactions
            </CardTitle>

          </CardHeader>


          <CardContent className="p-0">

            {filteredTransactions.length === 0 ? (

              <div className="text-center py-12 px-4">

                <div className="mx-auto h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">

                  <Receipt className="h-6 w-6 text-gray-400" />

                </div>

                <p className="text-gray-500 text-sm">
                  No transactions found
                </p>

                {search && (
                  <p className="text-xs text-gray-400 mt-1">
                    Try a different search term
                  </p>
                )}

              </div>

            ) : (

              <>

                {/* ======================================================
                    MOBILE
                ====================================================== */}

                <div className="md:hidden divide-y divide-gray-100">

                  {filteredTransactions.map(
                    (transaction) => {

                      const moneyIn =
                        isMoneyIn(
                          transaction
                        );

                      const status =
                        normalizeStatus(
                          transaction.status
                        );


                      return (

                        <button
                          key={
                            transaction.id
                          }
                          type="button"
                          onClick={() =>
                            setSelectedTransaction(
                              transaction
                            )
                          }
                          className="w-full text-left bg-white px-4 py-4 active:bg-gray-50 transition-colors"
                        >

                          <div className="flex items-center gap-3">

                            {/* ICON */}

                            <div
                              className={`
                                h-11 w-11 rounded-full
                                flex items-center justify-center
                                shrink-0
                                ${getTransactionIconBackground(
                                  transaction
                                )}
                              `}
                            >

                              {getTransactionIcon(
                                transaction
                              )}

                            </div>


                            {/* CONTENT */}

                            <div className="flex-1 min-w-0">

                              <div className="flex items-start justify-between gap-3">

                                <div className="min-w-0">

                                  <p className="text-sm font-semibold text-gray-900 truncate">

                                    {getTransactionTitle(
                                      transaction
                                    )}

                                  </p>

                                  <p className="text-xs text-gray-500 mt-1 truncate">

                                    {getTransactionSubtitle(
                                      transaction
                                    )}

                                  </p>

                                </div>


                                {/* AMOUNT */}

                                <div className="text-right shrink-0">

                                  <p
                                    className={`
                                      text-sm font-bold
                                      ${
                                        moneyIn
                                          ? 'text-green-600'
                                          : 'text-gray-900'
                                      }
                                    `}
                                  >

                                    {moneyIn
                                      ? '+'
                                      : '-'}

                                    {formatMoney(
                                      transaction.amount
                                    )}

                                  </p>

                                </div>

                              </div>


                              {/* DATE + STATUS */}

                              <div className="flex items-center justify-between mt-2">

                                <div className="flex items-center gap-1.5">

                                  <span className="text-[11px] text-gray-400">

                                    {formatDate(
                                      transaction.created_at
                                    )}

                                  </span>

                                  <span className="text-gray-300">
                                    •
                                  </span>

                                  <span className="text-[11px] text-gray-400">

                                    {formatTime(
                                      transaction.created_at
                                    )}

                                  </span>

                                </div>


                                <span
                                  className={`
                                    inline-flex items-center gap-1
                                    px-2 py-0.5 rounded-full
                                    text-[10px] font-semibold
                                    capitalize
                                    ${getStatusColor(
                                      transaction.status
                                    )}
                                  `}
                                >

                                  {getStatusIcon(
                                    transaction.status
                                  )}

                                  {status}

                                </span>

                              </div>


                              {/* REFERENCE */}

                              <div className="flex items-center justify-between mt-2">

                                <p className="text-[10px] text-gray-400 font-mono truncate max-w-[90%]">

                                  {getReference(
                                    transaction
                                  )}

                                </p>

                                <ChevronRight className="h-4 w-4 text-gray-300 shrink-0" />

                              </div>

                            </div>

                          </div>

                        </button>

                      );
                    }
                  )}

                </div>


                {/* ======================================================
                    DESKTOP
                ====================================================== */}

                <div className="hidden md:block">

                  <Table>

                    <TableHeader>

                      <TableRow className="bg-gray-50">

                        <TableHead>
                          Transaction
                        </TableHead>

                        <TableHead>
                          From / To
                        </TableHead>

                        <TableHead>
                          Amount
                        </TableHead>

                        <TableHead>
                          Status
                        </TableHead>

                        <TableHead>
                          Reference
                        </TableHead>

                        <TableHead>
                          Date
                        </TableHead>

                      </TableRow>

                    </TableHeader>


                    <TableBody>

                      {filteredTransactions.map(
                        (transaction) => {

                          const moneyIn =
                            isMoneyIn(
                              transaction
                            );


                          return (

                            <TableRow
                              key={
                                transaction.id
                              }
                              className="cursor-pointer hover:bg-gray-50"
                              onClick={() =>
                                setSelectedTransaction(
                                  transaction
                                )
                              }
                            >

                              {/* TRANSACTION */}

                              <TableCell>

                                <div className="flex items-center gap-3">

                                  <div
                                    className={`
                                      h-10 w-10 rounded-full
                                      flex items-center justify-center
                                      ${getTransactionIconBackground(
                                        transaction
                                      )}
                                    `}
                                  >

                                    {getTransactionIcon(
                                      transaction
                                    )}

                                  </div>


                                  <div className="min-w-0">

                                    <p className="font-semibold text-gray-900">

                                      {getTransactionTitle(
                                        transaction
                                      )}

                                    </p>

                                    <p className="text-xs text-gray-500 truncate max-w-[240px]">

                                      {getTransactionSubtitle(
                                        transaction
                                      )}

                                    </p>

                                  </div>

                                </div>

                              </TableCell>


                              {/* FROM / TO */}

                              <TableCell>

                                <div>

                                  <p className="font-medium text-gray-900">

                                    {moneyIn
                                      ? 'From '
                                      : 'To '}

                                    {getCounterpartyName(
                                      transaction
                                    )}

                                  </p>


                                  {getCounterpartyNickname(
                                    transaction
                                  ) && (

                                    <p className="text-xs text-gray-500">

                                      {getCounterpartyNickname(
                                        transaction
                                      )}

                                    </p>

                                  )}


                                  {getCounterpartyWallet(
                                    transaction
                                  ) && (

                                    <p className="text-[11px] text-gray-400 font-mono">

                                      Wallet:{' '}

                                      {getCounterpartyWallet(
                                        transaction
                                      )}

                                    </p>

                                  )}

                                </div>

                              </TableCell>


                              {/* AMOUNT */}

                              <TableCell>

                                <p
                                  className={`
                                    font-bold
                                    ${
                                      moneyIn
                                        ? 'text-green-600'
                                        : 'text-gray-900'
                                    }
                                  `}
                                >

                                  {moneyIn
                                    ? '+'
                                    : '-'}

                                  {formatMoney(
                                    transaction.amount
                                  )}

                                </p>

                              </TableCell>


                              {/* STATUS */}

                              <TableCell>

                                <span
                                  className={`
                                    inline-flex items-center gap-1
                                    px-2.5 py-1 rounded-full
                                    border text-xs font-semibold
                                    capitalize
                                    ${getStatusColor(
                                      transaction.status
                                    )}
                                  `}
                                >

                                  {getStatusIcon(
                                    transaction.status
                                  )}

                                  {transaction.status}

                                </span>

                              </TableCell>


                              {/* REFERENCE */}

                              <TableCell className="font-mono text-xs max-w-[180px]">

                                <span className="block truncate">

                                  {getReference(
                                    transaction
                                  )}

                                </span>

                              </TableCell>


                              {/* DATE */}

                              <TableCell>

                                <div>

                                  <p className="text-sm text-gray-700">

                                    {formatDate(
                                      transaction.created_at
                                    )}

                                  </p>

                                  <p className="text-xs text-gray-400">

                                    {formatTime(
                                      transaction.created_at
                                    )}

                                  </p>

                                </div>

                              </TableCell>

                            </TableRow>

                          );
                        }
                      )}

                    </TableBody>

                  </Table>

                </div>

              </>

            )}

          </CardContent>

        </Card>

      </div>


      {/* ================================================================
          TRANSACTION DETAILS / RECEIPT
      ================================================================ */}

      {selectedTransaction && (

        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4"
          onClick={() =>
            setSelectedTransaction(
              null
            )
          }
        >

          <div
            className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl"
            onClick={(e) =>
              e.stopPropagation()
            }
          >

            {/* HEADER */}

            <div className="sticky top-0 z-10 bg-white border-b px-5 py-4 flex items-center justify-between">

              <div className="flex items-center gap-2">

                <Receipt className="h-5 w-5 text-purple-600" />

                <div>

                  <h2 className="font-bold text-gray-900">

                    {getTransactionTitle(
                      selectedTransaction
                    )}

                  </h2>

                  <p className="text-[11px] text-gray-400">
                    Transaction Details
                  </p>

                </div>

              </div>


              <button
                type="button"
                onClick={() =>
                  setSelectedTransaction(
                    null
                  )
                }
                className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200"
              >

                <X className="h-4 w-4" />

              </button>

            </div>


            <div className="p-5">


              {/* SUCCESS ICON */}

              <div className="flex justify-center">

                <div
                  className={`
                    h-20 w-20 rounded-full
                    flex items-center justify-center
                    ${
                      normalizeStatus(
                        selectedTransaction.status
                      ) === 'failed'
                        ? 'bg-red-100'
                        : normalizeStatus(
                            selectedTransaction.status
                          ) === 'pending' ||
                          normalizeStatus(
                            selectedTransaction.status
                          ) === 'processing'
                        ? 'bg-yellow-100'
                        : isMoneyIn(
                            selectedTransaction
                          )
                        ? 'bg-green-100'
                        : 'bg-purple-100'
                    }
                  `}
                >

                  {normalizeStatus(
                    selectedTransaction.status
                  ) === 'failed' ? (

                    <XCircle className="h-10 w-10 text-red-600" />

                  ) : normalizeStatus(
                      selectedTransaction.status
                    ) === 'pending' ||
                    normalizeStatus(
                      selectedTransaction.status
                    ) === 'processing' ? (

                    <Clock className="h-10 w-10 text-yellow-600" />

                  ) : (

                    <CheckCircle2
                      className={`
                        h-10 w-10
                        ${
                          isMoneyIn(
                            selectedTransaction
                          )
                            ? 'text-green-600'
                            : 'text-purple-600'
                        }
                      `}
                    />

                  )}

                </div>

              </div>


              {/* AMOUNT */}

              <div className="text-center mt-5">

                <p
                  className={`
                    text-3xl font-bold
                    ${
                      isMoneyIn(
                        selectedTransaction
                      )
                        ? 'text-green-600'
                        : 'text-gray-900'
                    }
                  `}
                >

                  {isMoneyIn(
                    selectedTransaction
                  )
                    ? '+'
                    : '-'}

                  {formatMoney(
                    selectedTransaction.amount
                  )}

                </p>


                <p className="text-sm text-gray-500 mt-1">

                  {getTransactionSubtitle(
                    selectedTransaction
                  )}

                </p>

              </div>


              {/* STATUS */}

              <div className="flex justify-center mt-3">

                <span
                  className={`
                    inline-flex items-center gap-1.5
                    px-3 py-1.5 rounded-full
                    border text-xs font-semibold
                    capitalize
                    ${getStatusColor(
                      selectedTransaction.status
                    )}
                  `}
                >

                  {getStatusIcon(
                    selectedTransaction.status
                  )}

                  {selectedTransaction.status}

                </span>

              </div>


              {/* COUNTERPARTY */}

              <div className="mt-6 rounded-2xl bg-gray-50 p-4">

                <p className="text-[11px] font-semibold tracking-wide text-gray-400 mb-3">

                  {isMoneyIn(
                    selectedTransaction
                  )
                    ? 'MONEY RECEIVED FROM'
                    : 'MONEY SENT TO'}

                </p>


                <div className="flex items-center gap-3">

                  <div
                    className={`
                      h-12 w-12 rounded-full
                      flex items-center justify-center
                      border
                      ${
                        isMoneyIn(
                          selectedTransaction
                        )
                          ? 'bg-green-50 border-green-100'
                          : 'bg-purple-50 border-purple-100'
                      }
                    `}
                  >

                    {getBankName(
                      selectedTransaction
                    ) ? (

                      <Building2
                        className={`
                          h-5 w-5
                          ${
                            isMoneyIn(
                              selectedTransaction
                            )
                              ? 'text-green-600'
                              : 'text-purple-600'
                          }
                        `}
                      />

                    ) : (

                      <User
                        className={`
                          h-5 w-5
                          ${
                            isMoneyIn(
                              selectedTransaction
                            )
                              ? 'text-green-600'
                              : 'text-purple-600'
                          }
                        `}
                      />

                    )}

                  </div>


                  <div className="min-w-0 flex-1">

                    <p className="font-semibold text-gray-900 truncate">

                      {getCounterpartyName(
                        selectedTransaction
                      )}

                    </p>


                    {getCounterpartyNickname(
                      selectedTransaction
                    ) &&
                      getCounterpartyNickname(
                        selectedTransaction
                      ) !==
                        getCounterpartyName(
                          selectedTransaction
                        ) && (

                        <p className="text-xs text-gray-500">

                          @
                          {getCounterpartyNickname(
                            selectedTransaction
                          )}

                        </p>

                      )}


                    {getCounterpartyWallet(
                      selectedTransaction
                    ) && (

                      <p className="text-xs text-gray-500 font-mono mt-1">

                        Wallet ID:{' '}

                        {getCounterpartyWallet(
                          selectedTransaction
                        )}

                      </p>

                    )}


                    {getBankName(
                      selectedTransaction
                    ) && (

                      <p className="text-xs text-gray-500 mt-1">

                        {getBankName(
                          selectedTransaction
                        )}

                        {getAccountNumber(
                          selectedTransaction
                        )
                          ? ` • ${getAccountNumber(
                              selectedTransaction
                            )}`
                          : ''}

                      </p>

                    )}

                  </div>

                </div>

              </div>


              {/* DETAILS */}

              <div className="mt-5 space-y-1">


                {/* NARRATION */}

                <div className="flex items-center justify-between py-3 border-b">

                  <div className="flex items-center gap-2 text-gray-500">

                    <FileText className="h-4 w-4" />

                    <span className="text-sm">
                      Narration
                    </span>

                  </div>


                  <span className="text-sm font-medium text-gray-900 text-right max-w-[55%]">

                    {getNarration(
                      selectedTransaction
                    )}

                  </span>

                </div>


                {/* TYPE */}

                <div className="flex items-center justify-between py-3 border-b">

                  <div className="flex items-center gap-2 text-gray-500">

                    <Wallet className="h-4 w-4" />

                    <span className="text-sm">
                      Type
                    </span>

                  </div>


                  <span className="text-sm font-medium capitalize text-right max-w-[60%]">

                    {getTransactionTitle(
                      selectedTransaction
                    )}

                  </span>

                </div>


                {/* FEE */}

                {getFee(
                  selectedTransaction
                ) > 0 && (

                  <div className="flex items-center justify-between py-3 border-b">

                    <div className="flex items-center gap-2 text-gray-500">

                      <Banknote className="h-4 w-4" />

                      <span className="text-sm">
                        Fee
                      </span>

                    </div>


                    <span className="text-sm font-medium">

                      {formatMoney(
                        getFee(
                          selectedTransaction
                        )
                      )}

                    </span>

                  </div>

                )}


                {/* DATE */}

                <div className="flex items-center justify-between py-3 border-b">

                  <div className="flex items-center gap-2 text-gray-500">

                    <CalendarDays className="h-4 w-4" />

                    <span className="text-sm">
                      Date
                    </span>

                  </div>


                  <span className="text-sm font-medium text-right max-w-[60%]">

                    {formatFullDate(
                      selectedTransaction.created_at
                    )}

                  </span>

                </div>


                {/* REFERENCE */}

                <div className="flex items-center justify-between gap-3 py-3 border-b">

                  <div className="flex items-center gap-2 text-gray-500 shrink-0">

                    <Hash className="h-4 w-4" />

                    <span className="text-sm">
                      Reference
                    </span>

                  </div>


                  <div className="flex items-center gap-1 min-w-0">

                    <span className="text-xs font-mono truncate">

                      {getReference(
                        selectedTransaction
                      )}

                    </span>


                    <button
                      type="button"
                      onClick={() =>
                        copyReference(
                          selectedTransaction
                        )
                      }
                      className="h-7 w-7 rounded-md hover:bg-gray-100 flex items-center justify-center shrink-0"
                    >

                      <Copy className="h-3.5 w-3.5" />

                    </button>

                  </div>

                </div>


                {/* PROVIDER REFERENCE */}

                {getProviderReference(
                  selectedTransaction
                ) && (

                  <div className="flex items-center justify-between gap-3 py-3 border-b">

                    <div className="flex items-center gap-2 text-gray-500">

                      <ShieldCheck className="h-4 w-4" />

                      <span className="text-sm">
                        Provider Ref.
                      </span>

                    </div>


                    <span className="text-xs font-mono truncate max-w-[55%]">

                      {getProviderReference(
                        selectedTransaction
                      )}

                    </span>

                  </div>

                )}


                {/* TRANSACTION ID */}

                <div className="flex items-center justify-between gap-3 py-3">

                  <div className="flex items-center gap-2 text-gray-500">

                    <Hash className="h-4 w-4" />

                    <span className="text-sm">
                      Transaction ID
                    </span>

                  </div>


                  <span className="text-[10px] font-mono text-gray-400 truncate max-w-[55%]">

                    {selectedTransaction.id}

                  </span>

                </div>

              </div>


              {/* ACTIONS */}

              <div className="grid grid-cols-2 gap-3 mt-6">

                <Button
                  variant="outline"
                  onClick={() =>
                    copyReference(
                      selectedTransaction
                    )
                  }
                  className="rounded-xl"
                >

                  <Copy className="h-4 w-4 mr-2" />

                  Copy Ref

                </Button>


                <Button
                  onClick={() =>
                    printReceipt(
                      selectedTransaction
                    )
                  }
                  className="rounded-xl bg-purple-600 hover:bg-purple-700"
                >

                  <Printer className="h-4 w-4 mr-2" />

                  Receipt

                </Button>

              </div>

            </div>

          </div>

        </div>

      )}

    </div>
  );
};


export default TransactionHistory;
