import React, { useState, useEffect } from 'react';
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
  Search
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface Transaction {
  id: string;
  transaction_type: string;
  amount: number;
  description: string;
  status: string;
  reference_number: string;
  created_at: string;
}

interface TransactionHistoryProps {
  onBack: () => void;
}

const TransactionHistory = ({ onBack }: TransactionHistoryProps) => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (user) {
      fetchTransactions();
    }
  }, [user]);

  const fetchTransactions = async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setTransactions(data || []);
    } catch (error: any) {
      console.error('Error fetching transactions:', error);

      toast({
        title: "Error",
        description: "Failed to load transaction history",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  /*
   * ============================================================
   * STATUS
   * ============================================================
   */

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
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
        return 'text-red-700 bg-red-100 border-red-200';

      default:
        return 'text-gray-700 bg-gray-100 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'completed':
      case 'successful':
      case 'success':
        return <CheckCircle2 className="h-3.5 w-3.5" />;

      case 'pending':
      case 'processing':
        return <Clock className="h-3.5 w-3.5" />;

      case 'failed':
      case 'cancelled':
      case 'canceled':
        return <XCircle className="h-3.5 w-3.5" />;

      default:
        return <Clock className="h-3.5 w-3.5" />;
    }
  };

  /*
   * ============================================================
   * TRANSACTION ICON
   * ============================================================
   */

  const getTransactionTypeIcon = (type: string) => {
    const icons: { [key: string]: string } = {
      airtime: '📱',
      data: '🌐',
      electricity: '⚡',
      cable: '📺',
      transfer: '💸',
      deposit: '💰',
      bills: '📄'
    };

    return icons[type?.toLowerCase()] || '💳';
  };

  /*
   * ============================================================
   * TRANSACTION DIRECTION
   * ============================================================
   */

  const isMoneyIn = (transaction: Transaction) => {
    const type = transaction.transaction_type?.toLowerCase();

    return (
      type === 'deposit' ||
      type === 'credit' ||
      type === 'funding' ||
      type === 'refund'
    );
  };

  /*
   * ============================================================
   * DATE FORMAT
   * ============================================================
   */

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-NG', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const formatTime = (date: string) => {
    return new Date(date).toLocaleTimeString('en-NG', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  /*
   * ============================================================
   * FILTER
   * ============================================================
   */

  const filteredTransactions = transactions.filter((transaction) => {
    const matchesFilter =
      filter === 'all' ||
      transaction.status?.toLowerCase() === filter;

    const searchText = search.toLowerCase();

    const matchesSearch =
      !searchText ||
      transaction.description?.toLowerCase().includes(searchText) ||
      transaction.transaction_type?.toLowerCase().includes(searchText) ||
      transaction.reference_number?.toLowerCase().includes(searchText);

    return matchesFilter && matchesSearch;
  });

  /*
   * ============================================================
   * LOADING
   * ============================================================
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
   * ============================================================
   * PAGE
   * ============================================================
   */

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50">

      <div className="w-full max-w-6xl mx-auto px-3 sm:px-4 md:px-6 py-4 sm:py-6">

        {/* =====================================================
            HEADER
        ====================================================== */}

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

          {/* Desktop actions */}

          <div className="hidden sm:flex gap-2 shrink-0">

            <Button
              variant="outline"
              size="sm"
            >
              <Filter className="h-4 w-4 mr-2" />
              Filter
            </Button>

            <Button
              variant="outline"
              size="sm"
            >
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>

          </div>

          {/* Mobile filter button */}

          <Button
            variant="outline"
            size="sm"
            className="sm:hidden shrink-0"
          >
            <Filter className="h-4 w-4" />
          </Button>

        </div>

        {/* =====================================================
            SEARCH
        ====================================================== */}

        <div className="relative mb-4 sm:mb-6">

          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search transactions..."
            className="w-full h-11 rounded-xl border border-gray-200 bg-white pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />

        </div>

        {/* =====================================================
            SUMMARY CARDS
        ====================================================== */}

        <div className="flex md:grid md:grid-cols-4 gap-3 mb-5 sm:mb-6 overflow-x-auto pb-1 md:overflow-visible">

          <Card className="min-w-[150px] md:min-w-0 shadow-sm">
            <CardContent className="p-4 text-center">
              <p className="text-xl sm:text-2xl font-bold text-green-600">
                {
                  transactions.filter(
                    t =>
                      t.status === 'completed' ||
                      t.status === 'successful' ||
                      t.status === 'success'
                  ).length
                }
              </p>

              <p className="text-xs sm:text-sm text-gray-600 mt-1">
                Completed
              </p>
            </CardContent>
          </Card>

          <Card className="min-w-[150px] md:min-w-0 shadow-sm">
            <CardContent className="p-4 text-center">
              <p className="text-xl sm:text-2xl font-bold text-yellow-600">
                {
                  transactions.filter(
                    t =>
                      t.status === 'pending' ||
                      t.status === 'processing'
                  ).length
                }
              </p>

              <p className="text-xs sm:text-sm text-gray-600 mt-1">
                Pending
              </p>
            </CardContent>
          </Card>

          <Card className="min-w-[150px] md:min-w-0 shadow-sm">
            <CardContent className="p-4 text-center">
              <p className="text-xl sm:text-2xl font-bold text-red-600">
                {
                  transactions.filter(
                    t =>
                      t.status === 'failed' ||
                      t.status === 'cancelled' ||
                      t.status === 'canceled'
                  ).length
                }
              </p>

              <p className="text-xs sm:text-sm text-gray-600 mt-1">
                Failed
              </p>
            </CardContent>
          </Card>

          <Card className="min-w-[180px] md:min-w-0 shadow-sm">
            <CardContent className="p-4 text-center">

              <p className="text-xl sm:text-2xl font-bold text-purple-600">
                ₦
                {transactions
                  .filter(
                    t =>
                      t.status === 'completed' ||
                      t.status === 'successful' ||
                      t.status === 'success'
                  )
                  .reduce(
                    (sum, t) =>
                      sum + Number(t.amount),
                    0
                  )
                  .toLocaleString()}
              </p>

              <p className="text-xs sm:text-sm text-gray-600 mt-1">
                Total Spent
              </p>

            </CardContent>
          </Card>

        </div>

        {/* =====================================================
            FILTER BUTTONS
        ====================================================== */}

        <div className="flex gap-2 mb-5 overflow-x-auto pb-1">

          {['all', 'completed', 'pending', 'failed'].map(
            (status) => (

              <Button
                key={status}
                variant={
                  filter === status
                    ? "default"
                    : "outline"
                }
                size="sm"
                onClick={() => setFilter(status)}
                className={`
                  shrink-0 rounded-full px-4
                  ${
                    filter === status
                      ? "bg-purple-600 hover:bg-purple-700"
                      : "bg-white"
                  }
                `}
              >
                {
                  status === 'all'
                    ? 'All'
                    : status.charAt(0).toUpperCase() +
                      status.slice(1)
                }
              </Button>

            )
          )}

        </div>

        {/* =====================================================
            TRANSACTIONS
        ====================================================== */}

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
                {/* =================================================
                    MOBILE TRANSACTION LIST
                ================================================== */}

                <div className="md:hidden divide-y divide-gray-100">

                  {filteredTransactions.map(
                    (transaction) => {

                      const moneyIn =
                        isMoneyIn(transaction);

                      return (

                        <div
                          key={transaction.id}
                          className="px-4 py-4 bg-white active:bg-gray-50 transition-colors"
                        >

                          <div className="flex items-center gap-3">

                            {/* Transaction icon */}

                            <div
                              className={`
                                h-11 w-11 rounded-full
                                flex items-center justify-center
                                shrink-0 text-lg
                                ${
                                  moneyIn
                                    ? "bg-green-50"
                                    : "bg-purple-50"
                                }
                              `}
                            >

                              {moneyIn ? (
                                <ArrowDownLeft
                                  className="h-5 w-5 text-green-600"
                                />
                              ) : (
                                <ArrowUpRight
                                  className="h-5 w-5 text-purple-600"
                                />
                              )}

                            </div>

                            {/* Main information */}

                            <div className="min-w-0 flex-1">

                              <div className="flex items-start justify-between gap-3">

                                <div className="min-w-0">

                                  <p className="font-semibold text-gray-900 text-sm truncate">

                                    <span className="mr-1">
                                      {getTransactionTypeIcon(
                                        transaction.transaction_type
                                      )}
                                    </span>

                                    <span className="capitalize">
                                      {transaction.transaction_type ||
                                        'Transaction'}
                                    </span>

                                  </p>

                                  <p className="text-xs text-gray-500 truncate mt-0.5">

                                    {transaction.description ||
                                      'Transaction'}

                                  </p>

                                </div>

                                {/* Amount */}

                                <div className="text-right shrink-0">

                                  <p
                                    className={`
                                      font-bold text-sm
                                      ${
                                        moneyIn
                                          ? "text-green-600"
                                          : "text-gray-900"
                                      }
                                    `}
                                  >

                                    {moneyIn
                                      ? '+'
                                      : '-'}
                                    ₦
                                    {Number(
                                      transaction.amount
                                    ).toLocaleString()}

                                  </p>

                                </div>

                              </div>

                              {/* Bottom row */}

                              <div className="flex items-center justify-between gap-2 mt-2">

                                <div className="flex items-center gap-1.5 min-w-0">

                                  <span className="text-[11px] text-gray-400 whitespace-nowrap">

                                    {formatDate(
                                      transaction.created_at
                                    )}

                                  </span>

                                  <span className="text-gray-300">
                                    •
                                  </span>

                                  <span className="text-[11px] text-gray-400 whitespace-nowrap">

                                    {formatTime(
                                      transaction.created_at
                                    )}

                                  </span>

                                </div>

                                <span
                                  className={`
                                    inline-flex items-center gap-1
                                    px-2 py-1 rounded-full
                                    border text-[10px]
                                    font-semibold capitalize
                                    whitespace-nowrap
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

                              </div>

                              {/* Reference */}

                              <div className="flex items-center justify-between mt-2">

                                <p className="text-[10px] text-gray-400 font-mono truncate max-w-[85%]">

                                  Ref: {transaction.reference_number}

                                </p>

                                <ChevronRight className="h-4 w-4 text-gray-300 shrink-0" />

                              </div>

                            </div>

                          </div>

                        </div>

                      );

                    }
                  )}

                </div>

                {/* =================================================
                    DESKTOP TABLE
                ================================================== */}

                <div className="hidden md:block overflow-x-auto">

                  <Table>

                    <TableHeader>

                      <TableRow>

                        <TableHead>
                          Type
                        </TableHead>

                        <TableHead>
                          Description
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
                            isMoneyIn(transaction);

                          return (

                            <TableRow
                              key={transaction.id}
                            >

                              <TableCell>

                                <div className="flex items-center gap-2">

                                  <span className="text-lg">
                                    {getTransactionTypeIcon(
                                      transaction.transaction_type
                                    )}
                                  </span>

                                  <span className="capitalize">
                                    {
                                      transaction.transaction_type
                                    }
                                  </span>

                                </div>

                              </TableCell>

                              <TableCell className="max-w-xs truncate">

                                {transaction.description}

                              </TableCell>

                              <TableCell
                                className={`
                                  font-medium
                                  ${
                                    moneyIn
                                      ? "text-green-600"
                                      : ""
                                  }
                                `}
                              >

                                {moneyIn ? '+' : '-'}
                                ₦
                                {Number(
                                  transaction.amount
                                ).toLocaleString()}

                              </TableCell>

                              <TableCell>

                                <span
                                  className={`
                                    inline-flex items-center gap-1
                                    px-2 py-1 rounded-full
                                    border text-xs font-medium
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

                              <TableCell className="font-mono text-sm max-w-[180px] truncate">

                                {transaction.reference_number}

                              </TableCell>

                              <TableCell>

                                {formatDate(
                                  transaction.created_at
                                )}

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

    </div>
  );
};

export default TransactionHistory;
