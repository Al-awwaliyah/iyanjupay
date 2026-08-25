import React, { useEffect, useMemo, useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";

import {
  ArrowLeft,
  Filter,
  Download,
  ChevronRight,
  Clock,
  CheckCircle2,
  XCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Receipt,
  Search,
  X,
  Copy,
  Printer,
  User,
  Building2,
  Hash,
  CalendarDays,
  FileText,
  Wallet,
  Banknote,
  ShieldCheck,
  Phone,
  CreditCard
} from 'lucide-react';

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
  fallback: any = ''
): any => {

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

  const { user } =
    useAuth();

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
              'transactionType',
              'type',
              'category'
            ],
            transaction.transaction_type
          ),
          'transaction'
        )
          .toLowerCase()
          .trim();


      if (
        [
          'internal_transfer',
          'wallet_to_wallet',
          'wallet_transfer',
          'bank_transfer',
          'transfer'
        ].includes(rawType)
      ) {
        return 'transfer';
      }


      if (
        [
          'virtual_account_funding',
          'wallet_funding',
          'account_funding',
          'funding',
          'fund'
        ].includes(rawType)
      ) {
        return 'funding';
      }


      if (
        [
          'airtime',
          'data',
          'electricity',
          'cable',
          'bill_payment',
          'bill',
          'bills'
        ].includes(rawType)
      ) {
        return rawType;
      }


      return rawType;

    };


  /*
  |--------------------------------------------------------------------------
  | MONEY DIRECTION
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
              'transaction_direction',
              'transactionDirection',
              'flow'
            ]
          )
        )
          .toLowerCase()
          .trim();


      if (
        [
          'incoming',
          'in',
          'credit',
          'money_in',
          'received'
        ].includes(direction)
      ) {
        return true;
      }


      if (
        [
          'outgoing',
          'out',
          'debit',
          'money_out',
          'sent'
        ].includes(direction)
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

      const sender =
        metadata.sender ||
        metadata.from ||
        metadata.payer ||
        {};

      return {
        user_id:
          sender.user_id ||
          metadata.sender_user_id ||
          metadata.from_user_id ||
          metadata.payer_user_id ||
          null,

        wallet_id:
          sender.wallet_id ||
          metadata.sender_wallet_id ||
          metadata.senderWalletId ||
          metadata.from_wallet_id ||
          metadata.fromWalletId ||
          null,

        name:
          sender.name ||
          metadata.sender_name ||
          metadata.senderName ||
          metadata.from_name ||
          metadata.fromName ||
          metadata.payer_name ||
          null,

        full_name:
          sender.full_name ||
          metadata.sender_full_name ||
          metadata.from_full_name ||
          metadata.payer_full_name ||
          null,

        nickname:
          sender.nickname ||
          metadata.sender_nickname ||
          metadata.from_nickname ||
          null,

        phone_number:
          sender.phone_number ||
          metadata.sender_phone_number ||
          metadata.senderPhoneNumber ||
          metadata.from_phone_number ||
          metadata.payer_phone_number ||
          null,

        email:
          sender.email ||
          metadata.sender_email ||
          metadata.from_email ||
          metadata.payer_email ||
          null
      };

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

      const recipient =
        metadata.recipient ||
        metadata.receiver ||
        metadata.beneficiary ||
        metadata.to ||
        {};

      return {
        user_id:
          recipient.user_id ||
          metadata.recipient_user_id ||
          metadata.receiver_user_id ||
          metadata.to_user_id ||
          metadata.beneficiary_user_id ||
          null,

        wallet_id:
          recipient.wallet_id ||
          metadata.recipient_wallet_id ||
          metadata.recipientWalletId ||
          metadata.receiver_wallet_id ||
          metadata.receiverWalletId ||
          metadata.to_wallet_id ||
          metadata.beneficiary_wallet_id ||
          null,

        name:
          recipient.name ||
          metadata.recipient_name ||
          metadata.recipientName ||
          metadata.receiver_name ||
          metadata.receiverName ||
          metadata.to_name ||
          metadata.toName ||
          metadata.beneficiary_name ||
          null,

        full_name:
          recipient.full_name ||
          metadata.recipient_full_name ||
          metadata.receiver_full_name ||
          metadata.to_full_name ||
          metadata.beneficiary_full_name ||
          null,

        nickname:
          recipient.nickname ||
          metadata.recipient_nickname ||
          metadata.receiver_nickname ||
          metadata.beneficiary_nickname ||
          null,

        phone_number:
          recipient.phone_number ||
          metadata.recipient_phone_number ||
          metadata.recipientPhoneNumber ||
          metadata.receiver_phone_number ||
          metadata.receiverPhoneNumber ||
          metadata.to_phone_number ||
          metadata.beneficiary_phone_number ||
          null,

        email:
          recipient.email ||
          metadata.recipient_email ||
          metadata.receiver_email ||
          metadata.to_email ||
          metadata.beneficiary_email ||
          null
      };

    };


  /*
  |--------------------------------------------------------------------------
  | COUNTERPARTY BANK NAME
  |--------------------------------------------------------------------------
  */

  const getCounterpartyBankName =
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


      return safeString(
        firstValue(
          metadata,
          moneyIn
            ? [
                'sender_bank_name',
                'senderBankName',
                'from_bank_name',
                'fromBankName',
                'payer_bank_name',
                'payerBankName',
                'bank_name',
                'bankName'
              ]
            : [
                'recipient_bank_name',
                'recipientBankName',
                'receiver_bank_name',
                'receiverBankName',
                'to_bank_name',
                'toBankName',
                'beneficiary_bank_name',
                'beneficiaryBankName',
                'bank_name',
                'bankName'
              ],
          ''
        )
      );

    };


  /*
  |--------------------------------------------------------------------------
  | COUNTERPARTY ACCOUNT NAME
  |--------------------------------------------------------------------------
  */

  const getCounterpartyAccountName =
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


      if (moneyIn) {

        const sender =
          getSender(
            transaction
          );

        return safeString(
          firstValue(
            metadata,
            [
              'sender_account_name',
              'senderAccountName',
              'sender_name',
              'sender_full_name',
              'senderName',
              'from_account_name',
              'fromAccountName',
              'from_name',
              'from_full_name',
              'fromName',
              'payer_account_name',
              'payerAccountName',
              'payer_name',
              'account_name',
              'accountName',
              'customer_name'
            ],
            sender.name ||
              sender.full_name ||
              ''
          )
        );

      }


      const recipient =
        getRecipient(
          transaction
        );

      return safeString(
        firstValue(
          metadata,
          [
            'recipient_account_name',
            'recipientAccountName',
            'recipient_name',
            'recipient_full_name',
            'recipientName',
            'receiver_account_name',
            'receiverAccountName',
            'receiver_name',
            'receiver_full_name',
            'receiverName',
            'to_account_name',
            'toAccountName',
            'to_name',
            'to_full_name',
            'toName',
            'beneficiary_name',
            'beneficiary_account_name',
            'beneficiaryAccountName',
            'account_name',
            'accountName'
          ],
          recipient.name ||
            recipient.full_name ||
            ''
        )
      );

    };


  /*
  |--------------------------------------------------------------------------
  | COUNTERPARTY ACCOUNT NUMBER
  |--------------------------------------------------------------------------
  */

  const getCounterpartyAccountNumber =
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


      return safeString(
        firstValue(
          metadata,
          moneyIn
            ? [
                'sender_account_number',
                'senderAccountNumber',
                'from_account_number',
                'fromAccountNumber',
                'payer_account_number',
                'payerAccountNumber',
                'account_number',
                'accountNumber'
              ]
            : [
                'recipient_account_number',
                'recipientAccountNumber',
                'receiver_account_number',
                'receiverAccountNumber',
                'to_account_number',
                'toAccountNumber',
                'beneficiary_account_number',
                'beneficiaryAccountNumber',
                'account_number',
                'accountNumber'
              ],
          ''
        )
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
              'fromName',
              'payer_name',
              'payer_full_name',
              'sender_account_name',
              'from_account_name',
              'payer_account_name',
              'customer_name',
              'account_name'
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
            'receiverName',
            'to_name',
            'to_full_name',
            'toName',
            'beneficiary_name',
            'beneficiary_full_name',
            'recipient_account_name',
            'receiver_account_name',
            'to_account_name',
            'beneficiary_account_name'
          ],
          'Recipient'
        )
      );

    };


  /*
  |--------------------------------------------------------------------------
  | COUNTERPARTY PHONE
  |--------------------------------------------------------------------------
  */

  const getCounterpartyPhone =
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


      return safeString(
        party?.phone_number ||
        firstValue(
          metadata,
          moneyIn
            ? [
                'sender_phone_number',
                'senderPhoneNumber',
                'from_phone_number',
                'fromPhoneNumber',
                'payer_phone_number',
                'payerPhoneNumber',
                'phone_number',
                'phoneNumber'
              ]
            : [
                'recipient_phone_number',
                'recipientPhoneNumber',
                'receiver_phone_number',
                'receiverPhoneNumber',
                'to_phone_number',
                'toPhoneNumber',
                'beneficiary_phone_number',
                'beneficiaryPhoneNumber',
                'phone_number',
                'phoneNumber'
              ],
          ''
        )
      );

    };


  /*
  |--------------------------------------------------------------------------
  | BILL PAYMENT PHONE NUMBER
  |--------------------------------------------------------------------------
  */

  const getBillPhoneNumber =
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
            'phone_number',
            'phoneNumber',
            'customer_phone',
            'customerPhone',
            'beneficiary_phone',
            'beneficiaryPhone',
            'recipient_phone_number',
            'recipientPhoneNumber',
            'mobile_number',
            'mobileNumber',
            'subscriber_number',
            'subscriberNumber'
          ],
          getCounterpartyPhone(
            transaction
          )
        )
      );

    };


  /*
  |--------------------------------------------------------------------------
  | BILL PAYMENT AMOUNT
  |--------------------------------------------------------------------------
  */

  const getBillPaymentAmount =
    (
      transaction: Transaction
    ) => {

      const metadata =
        getTransactionMetadata(
          transaction
        );

      const amount =
        firstValue(
          metadata,
          [
            'bill_amount',
            'billAmount',
            'payment_amount',
            'paymentAmount',
            'amount_paid',
            'amountPaid',
            'billed_amount',
            'billedAmount'
          ],
          transaction.amount
        );

      return Number(
        amount || transaction.amount || 0
      );

    };


  /*
  |--------------------------------------------------------------------------
  | BILL PROVIDER
  |--------------------------------------------------------------------------
  */

  const getBillProvider =
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
            'provider',
            'biller',
            'biller_name',
            'billerName',
            'service_provider',
            'serviceProvider',
            'network',
            'network_name',
            'networkName',
            'disco',
            'disco_name',
            'cable_provider'
          ],
          transaction.provider ||
            ''
        )
      );

    };


  /*
  |--------------------------------------------------------------------------
  | CUSTOMER / METER / SMARTCARD NUMBER
  |--------------------------------------------------------------------------
  */

  const getCustomerIdentifier =
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
            'customer_number',
            'customerNumber',
            'meter_number',
            'meterNumber',
            'smartcard_number',
            'smartcardNumber',
            'decoder_number',
            'decoderNumber',
            'subscriber_id',
            'subscriberId',
            'account_number',
            'accountNumber'
          ],
          ''
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


      return safeString(
        firstValue(
          metadata,
          isMoneyIn(transaction)
            ? [
                'sender_wallet_id',
                'senderWalletId',
                'from_wallet_id',
                'fromWalletId'
              ]
            : [
                'recipient_wallet_id',
                'recipientWalletId',
                'receiver_wallet_id',
                'receiverWalletId',
                'to_wallet_id',
                'toWalletId'
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
            'reason',
            'message'
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
            'transactionReference',
            'reference_number'
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
            'flw_reference',
            'payment_reference'
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
            'transfer_fee',
            'service_fee'
          ],
          transaction.fee ?? 0
        );

      return Number(
        fee || 0
      );

    };


  /*
  |--------------------------------------------------------------------------
  | TRANSACTION TITLE
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

          return 'Airtime Purchase';


        case 'data':

          return 'Data Purchase';


        case 'electricity':

          return 'Electricity Payment';


        case 'cable':

          return 'Cable TV Payment';


        case 'bill_payment':

        case 'bill':

        case 'bills':

          return getBillProvider(transaction)
            ? `Bill Payment - ${getBillProvider(transaction)}`
            : 'Bill Payment';


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
  | TRANSACTION SUBTITLE
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
          getCounterpartyBankName(
            transaction
          );

        const accountName =
          getCounterpartyAccountName(
            transaction
          );

        if (bank && accountName) {
          return `${accountName} • ${bank}`;
        }

        if (bank) {
          return `Funding via ${bank}`;
        }

        return 'Money added to wallet';

      }


      if (
        [
          'airtime',
          'data',
          'electricity',
          'cable',
          'bill_payment',
          'bill',
          'bills'
        ].includes(type)
      ) {

        const phone =
          getBillPhoneNumber(
            transaction
          );

        const provider =
          getBillProvider(
            transaction
          );

        if (provider && phone) {
          return `${provider} • ${phone}`;
        }

        return provider ||
          phone ||
          getNarration(transaction);

      }


      return getNarration(
        transaction
      );

    };


  /*
  |--------------------------------------------------------------------------
  | TRANSACTION ICON
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
          <ArrowDownLeft className="h-5 w-5 text-green-600" />
        ) : (
          <ArrowUpRight className="h-5 w-5 text-purple-600" />
        );

      }


      switch (type) {

        case 'funding':
        case 'deposit':
        case 'credit':

          return (
            <Banknote className="h-5 w-5 text-green-600" />
          );


        case 'airtime':

          return (
            <span className="text-lg">📱</span>
          );


        case 'data':

          return (
            <span className="text-lg">🌐</span>
          );


        case 'electricity':

          return (
            <span className="text-lg">⚡</span>
          );


        case 'cable':

          return (
            <span className="text-lg">📺</span>
          );


        case 'bill_payment':
        case 'bill':
        case 'bills':

          return (
            <CreditCard className="h-5 w-5 text-purple-600" />
          );


        default:

          return (
            <Wallet className="h-5 w-5 text-purple-600" />
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
            <CheckCircle2 className="h-3.5 w-3.5" />
          );


        case 'pending':
        case 'processing':

          return (
            <Clock className="h-3.5 w-3.5" />
          );


        case 'failed':
        case 'cancelled':
        case 'canceled':
        case 'reversed':

          return (
            <XCircle className="h-3.5 w-3.5" />
          );


        default:

          return (
            <Clock className="h-3.5 w-3.5" />
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
        isMoneyIn(transaction);

      const type =
        getTransactionType(transaction);

      const counterparty =
        getCounterpartyName(transaction);

      const bank =
        getCounterpartyBankName(transaction);

      const accountName =
        getCounterpartyAccountName(transaction);

      const accountNumber =
        getCounterpartyAccountNumber(transaction);

      const narration =
        getNarration(transaction);

      const reference =
        getReference(transaction);

      const providerReference =
        getProviderReference(transaction);

      const fee =
        getFee(transaction);

      const billPhone =
        getBillPhoneNumber(transaction);

      const billProvider =
        getBillProvider(transaction);

      const customerIdentifier =
        getCustomerIdentifier(transaction);

      const title =
        getTransactionTitle(transaction);

      const status =
        transaction.status ||
        'completed';

      const currency =
        transaction.currency ||
        'NGN';

      const amount =
        Number(transaction.amount || 0);


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
          String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');


      receiptWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>IyanjuPay Transaction Receipt</title>

          <style>

            * {
              box-sizing: border-box;
            }

            body {
              margin: 0;
              padding: 30px;
              font-family: Arial, Helvetica, sans-serif;
              background: #f5f7fb;
              color: #111827;
            }

            .receipt {
              max-width: 430px;
              margin: 0 auto;
              background: white;
              border-radius: 18px;
              padding: 28px;
              box-shadow: 0 10px 30px rgba(0,0,0,0.08);
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
              background: ${moneyIn ? '#dcfce7' : '#ede9fe'};
              color: ${moneyIn ? '#16a34a' : '#7c3aed'};
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
              border-top: 1px solid #e5e7eb;
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
              border-top: 1px dashed #d1d5db;
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

            <div class="brand">IyanjuPay</div>

            <div class="subtitle">
              Transaction Receipt
            </div>

            <div class="status">

              ${
                [
                  'completed',
                  'successful',
                  'success'
                ].includes(normalizeStatus(status))
                  ? '✓'
                  : normalizeStatus(status) === 'failed'
                    ? '×'
                    : '⋯'
              }

            </div>

            <div class="amount">

              ${moneyIn ? '+' : '-'}

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

              ${moneyIn
                ? 'Money received'
                : 'Money sent'}

            </div>

            <div class="divider"></div>

            <div class="row">
              <span class="label">Status</span>
              <span class="value">${escaped(status)}</span>
            </div>

            <div class="row">
              <span class="label">
                ${moneyIn ? 'From' : 'To'}
              </span>
              <span class="value">
                ${escaped(counterparty)}
              </span>
            </div>

            ${
              accountName
                ? `
                <div class="row">
                  <span class="label">Account Name</span>
                  <span class="value">
                    ${escaped(accountName)}
                  </span>
                </div>
                `
                : ''
            }

            ${
              bank
                ? `
                <div class="row">
                  <span class="label">Bank</span>
                  <span class="value">
                    ${escaped(bank)}
                  </span>
                </div>
                `
                : ''
            }

            ${
              accountNumber
                ? `
                <div class="row">
                  <span class="label">Account Number</span>
                  <span class="value">
                    ${escaped(accountNumber)}
                  </span>
                </div>
                `
                : ''
            }

            ${
              billProvider
                ? `
                <div class="row">
                  <span class="label">Bill Provider</span>
                  <span class="value">
                    ${escaped(billProvider)}
                  </span>
                </div>
                `
                : ''
            }

            ${
              billPhone
                ? `
                <div class="row">
                  <span class="label">Phone Number</span>
                  <span class="value">
                    ${escaped(billPhone)}
                  </span>
                </div>
                `
                : ''
            }

            ${
              customerIdentifier
                ? `
                <div class="row">
                  <span class="label">Customer Number</span>
                  <span class="value">
                    ${escaped(customerIdentifier)}
                  </span>
                </div>
                `
                : ''
            }

            <div class="row">
              <span class="label">Type</span>
              <span class="value">
                ${escaped(title)}
              </span>
            </div>

            <div class="row">
              <span class="label">Narration</span>
              <span class="value">
                ${escaped(narration)}
              </span>
            </div>

            ${
              fee > 0
                ? `
                <div class="row">
                  <span class="label">Fee</span>
                  <span class="value">
                    ${formatMoney(fee)}
                  </span>
                </div>
                `
                : ''
            }

            <div class="row">
              <span class="label">Date</span>
              <span class="value">
                ${escaped(
                  formatFullDate(
                    transaction.created_at
                  )
                )}
              </span>
            </div>

            <div class="row">
              <span class="label">Reference</span>
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
                    ${escaped(providerReference)}
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
            (
              filter === 'completed' &&
              [
                'completed',
                'successful',
                'success'
              ].includes(status)
            ) ||
            (
              filter === 'pending' &&
              [
                'pending',
                'processing'
              ].includes(status)
            ) ||
            (
              filter === 'failed' &&
              [
                'failed',
                'cancelled',
                'canceled',
                'reversed'
              ].includes(status)
            );


          const searchText =
            search
              .toLowerCase()
              .trim();


          const searchableText = [

            transaction.description,
            transaction.transaction_type,
            transaction.reference_number,
            transaction.reference,
            transaction.provider_reference,

            getTransactionTitle(transaction),
            getTransactionSubtitle(transaction),

            getCounterpartyName(transaction),
            getCounterpartyAccountName(transaction),
            getCounterpartyNickname(transaction),
            getCounterpartyWallet(transaction),
            getCounterpartyBankName(transaction),
            getCounterpartyAccountNumber(transaction),
            getCounterpartyPhone(transaction),

            getBillPhoneNumber(transaction),
            getBillProvider(transaction),
            getCustomerIdentifier(transaction),

            getNarration(transaction)

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

        return [
          'completed',
          'successful',
          'success'
        ].includes(
          normalizeStatus(
            transaction.status
          )
        );

      }
    );


  const pendingTransactions =
    transactions.filter(
      (transaction) => {

        return [
          'pending',
          'processing'
        ].includes(
          normalizeStatus(
            transaction.status
          )
        );

      }
    );


  const failedTransactions =
    transactions.filter(
      (transaction) => {

        return [
          'failed',
          'cancelled',
          'canceled',
          'reversed'
        ].includes(
          normalizeStatus(
            transaction.status
          )
        );

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

          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto" />

          <p className="mt-4 text-sm text-gray-600">
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


          <div className="hidden sm:flex gap-2">

            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setFilter(
                  filter === 'all'
                    ? 'completed'
                    : 'all'
                )
              }
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
                    title: 'No transactions',
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
                        isMoneyIn(transaction)
                          ? 'Money In'
                          : 'Money Out',

                      Counterparty:
                        getCounterpartyName(
                          transaction
                        ),

                      AccountName:
                        getCounterpartyAccountName(
                          transaction
                        ),

                      Bank:
                        getCounterpartyBankName(
                          transaction
                        ),

                      AccountNumber:
                        getCounterpartyAccountNumber(
                          transaction
                        ),

                      PhoneNumber:
                        getBillPhoneNumber(
                          transaction
                        ),

                      BillProvider:
                        getBillProvider(
                          transaction
                        ),

                      CustomerIdentifier:
                        getCustomerIdentifier(
                          transaction
                        ),

                      Amount:
                        Number(
                          transaction.amount
                        ),

                      Fee:
                        getFee(
                          transaction
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
                              (row as any)[header] ?? ''
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
            placeholder="Search name, account, bank, phone or reference..."
            className="w-full h-11 rounded-xl border border-gray-200 bg-white pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-purple-500"
          />

        </div>


        {/* SUMMARY */}

        <div className="flex md:grid md:grid-cols-4 gap-3 mb-5 sm:mb-6 overflow-x-auto">

          <Card className="min-w-[150px] md:min-w-0 shadow-sm">

            <CardContent className="p-4 text-center">

              <p className="text-xl font-bold text-green-600">
                {completedTransactions.length}
              </p>

              <p className="text-xs text-gray-600 mt-1">
                Completed
              </p>

            </CardContent>

          </Card>


          <Card className="min-w-[150px] md:min-w-0 shadow-sm">

            <CardContent className="p-4 text-center">

              <p className="text-xl font-bold text-yellow-600">
                {pendingTransactions.length}
              </p>

              <p className="text-xs text-gray-600 mt-1">
                Pending
              </p>

            </CardContent>

          </Card>


          <Card className="min-w-[150px] md:min-w-0 shadow-sm">

            <CardContent className="p-4 text-center">

              <p className="text-xl font-bold text-red-600">
                {failedTransactions.length}
              </p>

              <p className="text-xs text-gray-600 mt-1">
                Failed
              </p>

            </CardContent>

          </Card>


          <Card className="min-w-[180px] md:min-w-0 shadow-sm">

            <CardContent className="p-4 text-center">

              <p className="text-xl font-bold text-purple-600">
                {formatMoney(totalSpent)}
              </p>

              <p className="text-xs text-gray-600 mt-1">
                Total Sent
              </p>

            </CardContent>

          </Card>

        </div>


        {/* FILTERS */}

        <div className="flex gap-2 mb-5 overflow-x-auto">

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
                className={
                  filter === status
                    ? 'shrink-0 rounded-full px-4 bg-purple-600 hover:bg-purple-700'
                    : 'shrink-0 rounded-full px-4 bg-white'
                }
              >

                {status === 'all'
                  ? 'All'
                  : status.charAt(0).toUpperCase() +
                    status.slice(1)}

              </Button>

            )
          )}

        </div>


        {/* TRANSACTION LIST */}

        <Card className="shadow-sm border-gray-100 overflow-hidden">

          <CardHeader className="px-4 sm:px-6 py-4 border-b bg-white">

            <CardTitle className="text-base sm:text-lg">
              Recent Transactions
            </CardTitle>

          </CardHeader>


          <CardContent className="p-0">

            {filteredTransactions.length === 0 ? (

              <div className="text-center py-12">

                <Receipt className="h-10 w-10 text-gray-300 mx-auto mb-3" />

                <p className="text-gray-500">
                  No transactions found
                </p>

              </div>

            ) : (

              <div className="divide-y">

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
                        key={transaction.id}
                        type="button"
                        onClick={() =>
                          setSelectedTransaction(
                            transaction
                          )
                        }
                        className="w-full text-left bg-white px-4 sm:px-6 py-4 hover:bg-gray-50"
                      >

                        <div className="flex items-center gap-3">

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


                          <div className="flex-1 min-w-0">

                            <div className="flex justify-between gap-3">

                              <div className="min-w-0">

                                <p className="font-semibold text-sm text-gray-900 truncate">

                                  {getTransactionTitle(
                                    transaction
                                  )}

                                </p>

                                <p className="text-xs text-gray-500 mt-1 truncate">

                                  {getTransactionSubtitle(
                                    transaction
                                  )}

                                </p>


                                {/* RECIPIENT / ACCOUNT DETAILS */}

                                {!isMoneyIn(transaction) && (
                                  <p className="text-[11px] text-gray-400 mt-1 truncate">

                                    {getCounterpartyAccountName(transaction) &&
                                      `${getCounterpartyAccountName(transaction)}`}

                                    {getCounterpartyBankName(transaction) &&
                                      ` • ${getCounterpartyBankName(transaction)}`}

                                  </p>
                                )}

                              </div>


                              <div className="text-right shrink-0">

                                <p
                                  className={`
                                    font-bold text-sm
                                    ${
                                      moneyIn
                                        ? 'text-green-600'
                                        : 'text-gray-900'
                                    }
                                  `}
                                >

                                  {moneyIn ? '+' : '-'}

                                  {formatMoney(
                                    transaction.amount
                                  )}

                                </p>

                              </div>

                            </div>


                            <div className="flex items-center justify-between mt-2">

                              <span className="text-[11px] text-gray-400">

                                {formatDate(
                                  transaction.created_at
                                )}

                                {' • '}

                                {formatTime(
                                  transaction.created_at
                                )}

                              </span>


                              <span
                                className={`
                                  inline-flex items-center gap-1
                                  px-2 py-0.5 rounded-full
                                  text-[10px] font-semibold capitalize
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

                          </div>


                          <ChevronRight className="h-4 w-4 text-gray-300" />

                        </div>

                      </button>

                    );

                  }
                )}

              </div>

            )}

          </CardContent>

        </Card>

      </div>


      {/* TRANSACTION DETAILS MODAL */}

      {selectedTransaction && (

        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
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
                className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center"
              >

                <X className="h-4 w-4" />

              </button>

            </div>


            <div className="p-5">


              {/* STATUS ICON */}

              <div className="flex justify-center">

                <div className="h-20 w-20 rounded-full bg-purple-100 flex items-center justify-center">

                  {normalizeStatus(
                    selectedTransaction.status
                  ) === 'failed' ? (

                    <XCircle className="h-10 w-10 text-red-600" />

                  ) : normalizeStatus(
                    selectedTransaction.status
                  ) === 'pending' ? (

                    <Clock className="h-10 w-10 text-yellow-600" />

                  ) : (

                    <CheckCircle2
                      className={`
                        h-10 w-10
                        ${
                          isMoneyIn(selectedTransaction)
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
                      isMoneyIn(selectedTransaction)
                        ? 'text-green-600'
                        : 'text-gray-900'
                    }
                  `}
                >

                  {isMoneyIn(selectedTransaction)
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
                    border text-xs font-semibold capitalize
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


              {/* COUNTERPARTY CARD */}

              <div className="mt-6 rounded-2xl bg-gray-50 p-4">

                <p className="text-[11px] font-semibold tracking-wide text-gray-400 mb-3">

                  {isMoneyIn(selectedTransaction)
                    ? 'MONEY RECEIVED FROM'
                    : 'MONEY SENT TO'}

                </p>


                <div className="flex items-start gap-3">

                  <div className="h-12 w-12 rounded-full bg-purple-50 flex items-center justify-center shrink-0">

                    {getCounterpartyBankName(selectedTransaction)
                      ? (
                        <Building2 className="h-5 w-5 text-purple-600" />
                      )
                      : (
                        <User className="h-5 w-5 text-purple-600" />
                      )}

                  </div>


                  <div className="min-w-0 flex-1">

                    {/* RECIPIENT / SENDER NAME */}

                    <p className="font-semibold text-gray-900 truncate">

                      {getCounterpartyName(
                        selectedTransaction
                      )}

                    </p>


                    {/* ACCOUNT NAME */}

                    {getCounterpartyAccountName(
                      selectedTransaction
                    ) && (

                      <p className="text-sm text-gray-700 mt-1 truncate">

                        Account Name:{' '}

                        {getCounterpartyAccountName(
                          selectedTransaction
                        )}

                      </p>

                    )}


                    {/* BANK NAME */}

                    {getCounterpartyBankName(
                      selectedTransaction
                    ) && (

                      <p className="text-sm text-gray-600 mt-1">

                        Bank:{' '}

                        {getCounterpartyBankName(
                          selectedTransaction
                        )}

                      </p>

                    )}


                    {/* ACCOUNT NUMBER */}

                    {getCounterpartyAccountNumber(
                      selectedTransaction
                    ) && (

                      <p className="text-xs text-gray-500 mt-1 font-mono">

                        Account:{' '}

                        {getCounterpartyAccountNumber(
                          selectedTransaction
                        )}

                      </p>

                    )}


                    {/* PHONE */}

                    {getCounterpartyPhone(
                      selectedTransaction
                    ) && (

                      <p className="text-xs text-gray-500 mt-1">

                        Phone:{' '}

                        {getCounterpartyPhone(
                          selectedTransaction
                        )}

                      </p>

                    )}

                  </div>

                </div>

              </div>


              {/* DETAILS */}

              <div className="mt-5 space-y-1">


                {/* BILL PROVIDER */}

                {getBillProvider(
                  selectedTransaction
                ) && (

                  <div className="flex items-center justify-between py-3 border-b">

                    <div className="flex items-center gap-2 text-gray-500">

                      <Building2 className="h-4 w-4" />

                      <span className="text-sm">
                        Bill Provider
                      </span>

                    </div>

                    <span className="text-sm font-medium text-right max-w-[60%]">

                      {getBillProvider(
                        selectedTransaction
                      )}

                    </span>

                  </div>

                )}


                {/* BILL PHONE */}

                {getBillPhoneNumber(
                  selectedTransaction
                ) && (

                  <div className="flex items-center justify-between py-3 border-b">

                    <div className="flex items-center gap-2 text-gray-500">

                      <Phone className="h-4 w-4" />

                      <span className="text-sm">
                        Phone Number
                      </span>

                    </div>

                    <span className="text-sm font-medium">

                      {getBillPhoneNumber(
                        selectedTransaction
                      )}

                    </span>

                  </div>

                )}


                {/* CUSTOMER NUMBER */}

                {getCustomerIdentifier(
                  selectedTransaction
                ) && (

                  <div className="flex items-center justify-between py-3 border-b">

                    <div className="flex items-center gap-2 text-gray-500">

                      <Hash className="h-4 w-4" />

                      <span className="text-sm">
                        Customer Number
                      </span>

                    </div>

                    <span className="text-sm font-medium max-w-[55%] truncate">

                      {getCustomerIdentifier(
                        selectedTransaction
                      )}

                    </span>

                  </div>

                )}


                {/* BILL AMOUNT */}

                {[
                  'airtime',
                  'data',
                  'electricity',
                  'cable',
                  'bill_payment',
                  'bill',
                  'bills'
                ].includes(
                  getTransactionType(
                    selectedTransaction
                  )
                ) && (

                  <div className="flex items-center justify-between py-3 border-b">

                    <div className="flex items-center gap-2 text-gray-500">

                      <Banknote className="h-4 w-4" />

                      <span className="text-sm">
                        Bill Payment Amount
                      </span>

                    </div>

                    <span className="text-sm font-bold text-gray-900">

                      {formatMoney(
                        getBillPaymentAmount(
                          selectedTransaction
                        )
                      )}

                    </span>

                  </div>

                )}


                {/* NARRATION */}

                <div className="flex items-center justify-between py-3 border-b gap-3">

                  <div className="flex items-center gap-2 text-gray-500">

                    <FileText className="h-4 w-4" />

                    <span className="text-sm">
                      Narration
                    </span>

                  </div>

                  <span className="text-sm font-medium text-right max-w-[55%]">

                    {getNarration(
                      selectedTransaction
                    )}

                  </span>

                </div>


                {/* TYPE */}

                <div className="flex items-center justify-between py-3 border-b gap-3">

                  <div className="flex items-center gap-2 text-gray-500">

                    <Wallet className="h-4 w-4" />

                    <span className="text-sm">
                      Type
                    </span>

                  </div>

                  <span className="text-sm font-medium text-right max-w-[60%]">

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

                <div className="flex items-center justify-between py-3 border-b gap-3">

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
