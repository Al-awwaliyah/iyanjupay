import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  AlertCircle,
  Bell,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  Filter,
  Loader2,
  Mail,
  Megaphone,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Smartphone,
  X,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

import AdminLayout from "@/pages/admin/AdminLayout";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { Badge } from "@/components/ui/badge";

import { Textarea } from "@/components/ui/textarea";

import { useToast } from "@/components/ui/use-toast";


// ============================================================
// TYPES
// ============================================================

type NotificationChannel =
  | "in_app"
  | "email"
  | "sms"
  | "push"
  | "webhook";

type DeliveryStatus =
  | "pending"
  | "processing"
  | "delivered"
  | "failed"
  | "retrying";

type TransactionStatus =
  | "pending"
  | "processing"
  | "successful"
  | "completed"
  | "failed"
  | "cancelled"
  | "reversed"
  | "refunded"
  | "unknown";

type NotificationMetadata = Record<string, any>;

type NotificationRow = {
  id: string;

  user_id: string | null;

  transaction_id: string | null;

  type: string;

  title: string;

  message: string;

  amount: number | null;

  is_read: boolean;

  channel: NotificationChannel | string;

  delivery_status:
    | DeliveryStatus
    | string;

  delivery_attempts: number;

  last_attempt_at: string | null;

  delivered_at: string | null;

  failed_at: string | null;

  last_error: string | null;

  next_retry_at: string | null;

  broadcast_id: string | null;

  metadata:
    | NotificationMetadata
    | null;

  created_at: string;

  /*
   * The SQL RPC may return this directly when available.
   * The frontend also attempts to derive it from metadata.
   */
  transaction_status?:
    | TransactionStatus
    | string
    | null;
};

type NotificationSummary = {
  total: number;

  unread: number;

  read: number;

  delivery: {
    pending: number;
    processing: number;
    delivered: number;
    failed: number;
    retrying: number;
  };

  period?: {
    start_at: string;
    end_at: string;
  };

  generated_at?: string;
};

type NotificationListResponse = {
  items?: NotificationRow[];

  total?: number;

  limit?: number;

  offset?: number;

  generated_at?: string;
};

type BroadcastForm = {
  type: string;

  title: string;

  message: string;

  amount: string;
};


// ============================================================
// CONSTANTS
// ============================================================

const PAGE_SIZE = 50;


// ============================================================
// HELPERS
// ============================================================

function formatDate(
  value: string | null,
) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString(
    "en-NG",
    {
      dateStyle: "medium",
      timeStyle: "short",
    },
  );
}


function formatAmount(
  value: number | null,
) {
  if (
    value === null ||
    value === undefined
  ) {
    return "—";
  }

  return new Intl.NumberFormat(
    "en-NG",
    {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    },
  ).format(Number(value));
}


function shortenId(
  value: string | null,
  length = 14,
) {
  if (!value) {
    return "—";
  }

  if (value.length <= length) {
    return value;
  }

  return `${value.slice(
    0,
    length,
  )}…`;
}


function titleCase(
  value: string,
) {
  return value
    .replace(/_/g, " ")
    .replace(
      /\b\w/g,
      (letter) =>
        letter.toUpperCase(),
    );
}


function normalizeStatus(
  value: unknown,
): string {
  if (
    typeof value !== "string"
  ) {
    return "";
  }

  return value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}


// ============================================================
// TRANSACTION STATUS RESOLUTION
// ============================================================

/*
 * IMPORTANT:
 *
 * Notification delivery status and transaction status are
 * completely different things.
 *
 * delivery_status:
 *   pending / processing / delivered / failed / retrying
 *
 * transaction_status:
 *   pending / processing / successful / failed / etc.
 *
 * A notification can therefore be:
 *
 *   Transaction: successful
 *   Notification: delivered
 *
 * or:
 *
 *   Transaction: successful
 *   Notification: pending
 *
 * The old frontend was using `notification.type` as if it
 * represented the current transaction status.
 *
 * This resolver looks for the actual transaction status in
 * the RPC response or metadata.
 */

function getTransactionStatus(
  notification: NotificationRow,
): TransactionStatus {
  const directStatus =
    normalizeStatus(
      notification.transaction_status,
    );

  if (directStatus) {
    return normalizeTransactionStatus(
      directStatus,
    );
  }

  const metadata =
    notification.metadata;

  if (metadata) {
    const possibleStatuses = [
      metadata.transaction_status,
      metadata.transactionStatus,
      metadata.transfer_status,
      metadata.transferStatus,
      metadata.status,
      metadata.transaction?.status,
      metadata.transfer?.status,
      metadata.data?.status,
      metadata.result?.status,
    ];

    for (
      const candidate of possibleStatuses
    ) {
      const normalized =
        normalizeStatus(
          candidate,
        );

      if (normalized) {
        return normalizeTransactionStatus(
          normalized,
        );
      }
    }
  }

  /*
   * Some notification implementations put the transaction
   * state directly into the notification type.
   *
   * This is only a fallback. It is NOT used when a real
   * transaction_status is supplied.
   */
  const type =
    normalizeStatus(
      notification.type,
    );

  if (
    type.includes("successful") ||
    type.includes("success") ||
    type.includes("completed") ||
    type.includes("complete")
  ) {
    return "successful";
  }

  if (
    type.includes("failed") ||
    type.includes("failure")
  ) {
    return "failed";
  }

  if (
    type.includes("cancelled") ||
    type.includes("canceled")
  ) {
    return "cancelled";
  }

  if (
    type.includes("reversed") ||
    type.includes("reversal")
  ) {
    return "reversed";
  }

  if (
    type.includes("refunded") ||
    type.includes("refund")
  ) {
    return "refunded";
  }

  if (
    type.includes("processing")
  ) {
    return "processing";
  }

  if (
    type.includes("pending")
  ) {
    return "pending";
  }

  return "unknown";
}


function normalizeTransactionStatus(
  status: string,
): TransactionStatus {
  switch (status) {
    case "success":
    case "successful":
      return "successful";

    case "complete":
    case "completed":
      return "completed";

    case "pending":
      return "pending";

    case "processing":
      return "processing";

    case "failed":
    case "failure":
      return "failed";

    case "cancelled":
    case "canceled":
      return "cancelled";

    case "reversed":
    case "reversal":
      return "reversed";

    case "refunded":
    case "refund":
      return "refunded";

    default:
      return "unknown";
  }
}


function transactionStatusLabel(
  status: TransactionStatus,
) {
  switch (status) {
    case "successful":
    case "completed":
      return "Transaction Successful";

    case "processing":
      return "Transaction Processing";

    case "pending":
      return "Transaction Pending";

    case "failed":
      return "Transaction Failed";

    case "cancelled":
      return "Transaction Cancelled";

    case "reversed":
      return "Transaction Reversed";

    case "refunded":
      return "Transaction Refunded";

    default:
      return "Transaction Status Unknown";
  }
}


function transactionStatusBadgeClass(
  status: TransactionStatus,
) {
  switch (status) {
    case "successful":
    case "completed":
      return "border-emerald-200 bg-emerald-100 text-emerald-700";

    case "processing":
      return "border-blue-200 bg-blue-100 text-blue-700";

    case "pending":
      return "border-amber-200 bg-amber-100 text-amber-700";

    case "failed":
      return "border-red-200 bg-red-100 text-red-700";

    case "cancelled":
    case "reversed":
      return "border-orange-200 bg-orange-100 text-orange-700";

    case "refunded":
      return "border-purple-200 bg-purple-100 text-purple-700";

    default:
      return "border-slate-200 bg-slate-100 text-slate-700";
  }
}


// ============================================================
// DELIVERY HELPERS
// ============================================================

function getChannelIcon(
  channel: string,
) {
  switch (
    normalizeStatus(channel)
  ) {
    case "email":
      return Mail;

    case "sms":
      return MessageSquare;

    case "push":
      return Smartphone;

    case "webhook":
      return Send;

    case "in_app":
    default:
      return Bell;
  }
}


function deliveryBadgeClass(
  status: string,
) {
  switch (
    normalizeStatus(status)
  ) {
    case "delivered":
      return "border-emerald-200 bg-emerald-100 text-emerald-700";

    case "failed":
      return "border-red-200 bg-red-100 text-red-700";

    case "processing":
      return "border-blue-200 bg-blue-100 text-blue-700";

    case "retrying":
      return "border-amber-200 bg-amber-100 text-amber-700";

    case "pending":
    default:
      return "border-slate-200 bg-slate-100 text-slate-700";
  }
}


function getInitialSummary(): NotificationSummary {
  return {
    total: 0,

    unread: 0,

    read: 0,

    delivery: {
      pending: 0,
      processing: 0,
      delivered: 0,
      failed: 0,
      retrying: 0,
    },
  };
}


// ============================================================
// COMPONENT
// ============================================================

function NotificationsPage() {
  const { toast } =
    useToast();


  // ==========================================================
  // DATA
  // ==========================================================

  const [rows, setRows] =
    useState<
      NotificationRow[]
    >([]);

  const [summary, setSummary] =
    useState<NotificationSummary>(
      getInitialSummary(),
    );

  const [total, setTotal] =
    useState(0);


  // ==========================================================
  // LOADING
  // ==========================================================

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [detailLoading, setDetailLoading] =
    useState(false);

  const [retrying, setRetrying] =
    useState(false);

  const [broadcasting, setBroadcasting] =
    useState(false);


  // ==========================================================
  // FILTERS
  // ==========================================================

  const [search, setSearch] =
    useState("");

  const [typeFilter, setTypeFilter] =
    useState("all");

  const [channelFilter, setChannelFilter] =
    useState("all");

  const [
    deliveryStatusFilter,
    setDeliveryStatusFilter,
  ] = useState("all");

  const [readFilter, setReadFilter] =
    useState("all");

  const [startDate, setStartDate] =
    useState("");

  const [endDate, setEndDate] =
    useState("");

  const [page, setPage] =
    useState(1);


  // ==========================================================
  // DETAIL
  // ==========================================================

  const [
    selectedNotification,
    setSelectedNotification,
  ] = useState<
    NotificationRow | null
  >(null);

  const [detailOpen, setDetailOpen] =
    useState(false);


  // ==========================================================
  // BROADCAST
  // ==========================================================

  const [broadcastOpen, setBroadcastOpen] =
    useState(false);

  const [broadcastForm, setBroadcastForm] =
    useState<BroadcastForm>({
      type: "system",
      title: "",
      message: "",
      amount: "",
    });


  // ==========================================================
  // RESET FILTERS
  // ==========================================================

  const resetFilters =
    useCallback(() => {
      setSearch("");

      setTypeFilter("all");

      setChannelFilter("all");

      setDeliveryStatusFilter(
        "all",
      );

      setReadFilter("all");

      setStartDate("");

      setEndDate("");

      setPage(1);
    }, []);


  // ==========================================================
  // FETCH SUMMARY
  // ==========================================================

  const fetchSummary =
    useCallback(
      async () => {
        const {
          data,
          error,
        } = await supabase.rpc(
          "admin_notifications_summary",
          {
            p_start_at: startDate
              ? new Date(
                  `${startDate}T00:00:00`,
                ).toISOString()
              : null,

            p_end_at: endDate
              ? new Date(
                  `${endDate}T23:59:59.999`,
                ).toISOString()
              : null,
          },
        );

        if (error) {
          throw error;
        }

        const result =
          data as
            | NotificationSummary
            | null;

        if (!result) {
          setSummary(
            getInitialSummary(),
          );

          return;
        }

        setSummary({
          total: Number(
            result.total || 0,
          ),

          unread: Number(
            result.unread || 0,
          ),

          read: Number(
            result.read || 0,
          ),

          delivery: {
            pending: Number(
              result.delivery
                ?.pending || 0,
            ),

            processing: Number(
              result.delivery
                ?.processing || 0,
            ),

            delivered: Number(
              result.delivery
                ?.delivered || 0,
            ),

            failed: Number(
              result.delivery
                ?.failed || 0,
            ),

            retrying: Number(
              result.delivery
                ?.retrying || 0,
            ),
          },

          period:
            result.period,

          generated_at:
            result.generated_at,
        });
      },
      [
        startDate,
        endDate,
      ],
    );


  // ==========================================================
  // FETCH ROWS
  // ==========================================================

  const fetchRows =
    useCallback(
      async (
        showRefresh = false,
      ) => {
        if (showRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        try {
          const {
            data,
            error,
          } = await supabase.rpc(
            "admin_notifications_list",
            {
              p_search:
                search.trim() ||
                null,

              p_type:
                typeFilter === "all"
                  ? null
                  : typeFilter,

              p_channel:
                channelFilter === "all"
                  ? null
                  : channelFilter,

              p_delivery_status:
                deliveryStatusFilter ===
                "all"
                  ? null
                  : deliveryStatusFilter,

              p_is_read:
                readFilter === "all"
                  ? null
                  : readFilter ===
                    "read",

              p_start_at:
                startDate
                  ? new Date(
                      `${startDate}T00:00:00`,
                    ).toISOString()
                  : null,

              p_end_at:
                endDate
                  ? new Date(
                      `${endDate}T23:59:59.999`,
                    ).toISOString()
                  : null,

              p_limit:
                PAGE_SIZE,

              p_offset:
                (page - 1) *
                PAGE_SIZE,
            },
          );

          if (error) {
            throw error;
          }

          const result =
            data as
              | NotificationListResponse
              | null;

          const items =
            Array.isArray(
              result?.items,
            )
              ? result.items
              : [];

          /*
           * Normalize every returned row.
           *
           * This deliberately DOES NOT change delivery_status.
           * Delivery belongs to the notification itself.
           *
           * Transaction status is kept separate.
           */
          const normalizedItems =
            items.map(
              (item) => ({
                ...item,

                transaction_status:
                  item.transaction_status ||
                  getTransactionStatus(
                    item,
                  ),
              }),
            );

          setRows(
            normalizedItems,
          );

          setTotal(
            Number(
              result?.total || 0,
            ),
          );
        } catch (error: any) {
          console.error(
            "Notifications fetch failed:",
            error,
          );

          toast({
            title:
              "Unable to load notifications",

            description:
              error?.message ||
              "Something went wrong while loading notifications.",

            variant:
              "destructive",
          });

          setRows([]);

          setTotal(0);
        } finally {
          setLoading(false);

          setRefreshing(false);
        }
      },
      [
        search,
        typeFilter,
        channelFilter,
        deliveryStatusFilter,
        readFilter,
        startDate,
        endDate,
        page,
        toast,
      ],
    );


  // ==========================================================
  // REFRESH ALL
  // ==========================================================

  const refreshAll =
    useCallback(
      async (
        showRefresh = true,
      ) => {
        try {
          await Promise.all([
            fetchRows(
              showRefresh,
            ),

            fetchSummary(),
          ]);
        } catch (error) {
          console.error(
            "Notification refresh failed:",
            error,
          );
        }
      },
      [
        fetchRows,
        fetchSummary,
      ],
    );


  // ==========================================================
  // LOAD
  // ==========================================================

  useEffect(() => {
    fetchRows(false);
  }, [fetchRows]);


  useEffect(() => {
    fetchSummary().catch(
      (error) => {
        console.error(
          "Notification summary failed:",
          error,
        );
      },
    );
  }, [fetchSummary]);


  // ==========================================================
  // DETAIL
  // ==========================================================

  const openDetail =
    useCallback(
      async (
        notificationId: string,
      ) => {
        setDetailOpen(true);

        setDetailLoading(true);

        setSelectedNotification(
          null,
        );

        try {
          const {
            data,
            error,
          } = await supabase.rpc(
            "admin_notification_get",
            {
              p_notification_id:
                notificationId,
            },
          );

          if (error) {
            throw error;
          }

          if (!data) {
            throw new Error(
              "Notification not found.",
            );
          }

          const notification =
            data as NotificationRow;

          setSelectedNotification({
            ...notification,

            transaction_status:
              notification.transaction_status ||
              getTransactionStatus(
                notification,
              ),
          });
        } catch (error: any) {
          console.error(
            "Notification detail failed:",
            error,
          );

          toast({
            title:
              "Unable to load notification",

            description:
              error?.message ||
              "The notification could not be loaded.",

            variant:
              "destructive",
          });

          setDetailOpen(false);
        } finally {
          setDetailLoading(false);
        }
      },
      [toast],
    );


  // ==========================================================
  // RETRY
  // ==========================================================

  const retryNotification =
    useCallback(
      async (
        notificationId: string,
      ) => {
        setRetrying(true);

        try {
          const {
            error,
          } = await supabase.rpc(
            "admin_notification_retry",
            {
              p_notification_id:
                notificationId,
            },
          );

          if (error) {
            throw error;
          }

          toast({
            title:
              "Notification queued",

            description:
              "The notification has been moved to retrying.",
          });

          setSelectedNotification(
            (current) => {
              if (
                !current ||
                current.id !==
                  notificationId
              ) {
                return current;
              }

              return {
                ...current,

                delivery_status:
                  "retrying",

                next_retry_at:
                  new Date().toISOString(),

                last_error:
                  null,
              };
            },
          );

          await refreshAll(true);
        } catch (error: any) {
          console.error(
            "Notification retry failed:",
            error,
          );

          toast({
            title:
              "Retry failed",

            description:
              error?.message ||
              "The notification could not be queued for retry.",

            variant:
              "destructive",
          });
        } finally {
          setRetrying(false);
        }
      },
      [
        refreshAll,
        toast,
      ],
    );


  // ==========================================================
  // BROADCAST
  // ==========================================================

  const updateBroadcast =
    useCallback(
      (
        field: keyof BroadcastForm,
        value: string,
      ) => {
        setBroadcastForm(
          (current) => ({
            ...current,

            [field]: value,
          }),
        );
      },
      [],
    );


  const resetBroadcast =
    useCallback(() => {
      setBroadcastForm({
        type: "system",
        title: "",
        message: "",
        amount: "",
      });
    }, []);


  const submitBroadcast =
    useCallback(
      async () => {
        const type =
          broadcastForm.type.trim();

        const title =
          broadcastForm.title.trim();

        const message =
          broadcastForm.message.trim();

        if (!type) {
          toast({
            title:
              "Notification type required",

            description:
              "Enter a notification type.",

            variant:
              "destructive",
          });

          return;
        }

        if (!title) {
          toast({
            title:
              "Notification title required",

            description:
              "Enter a notification title.",

            variant:
              "destructive",
          });

          return;
        }

        if (!message) {
          toast({
            title:
              "Notification message required",

            description:
              "Enter a notification message.",

            variant:
              "destructive",
          });

          return;
        }

        let amount:
          | number
          | null = null;

        if (
          broadcastForm.amount.trim()
        ) {
          const parsedAmount =
            Number(
              broadcastForm.amount,
            );

          if (
            !Number.isFinite(
              parsedAmount,
            ) ||
            parsedAmount < 0
          ) {
            toast({
              title:
                "Invalid amount",

              description:
                "Enter a valid non-negative amount.",

              variant:
                "destructive",
            });

            return;
          }

          amount = parsedAmount;
        }

        setBroadcasting(true);

        try {
          const {
            data,
            error,
          } = await supabase.rpc(
            "admin_notifications_broadcast",
            {
              p_type: type,

              p_title: title,

              p_message: message,

              p_amount: amount,

              p_metadata: {},
            },
          );

          if (error) {
            throw error;
          }

          const result =
            data as
              | {
                  created_count?: number;

                  broadcast_id?: string;
                }
              | null;

          const createdCount =
            Number(
              result?.created_count ||
                0,
            );

          toast({
            title:
              "Broadcast created",

            description:
              `${createdCount.toLocaleString()} customer notification${
                createdCount === 1
                  ? ""
                  : "s"
              } created.`,
          });

          setBroadcastOpen(
            false,
          );

          resetBroadcast();

          setPage(1);

          await refreshAll(true);
        } catch (error: any) {
          console.error(
            "Notification broadcast failed:",
            error,
          );

          toast({
            title:
              "Broadcast failed",

            description:
              error?.message ||
              "The broadcast could not be created.",

            variant:
              "destructive",
          });
        } finally {
          setBroadcasting(false);
        }
      },
      [
        broadcastForm,
        refreshAll,
        resetBroadcast,
        toast,
      ],
    );


  // ==========================================================
  // PAGINATION
  // ==========================================================

  const totalPages =
    Math.max(
      1,
      Math.ceil(
        total / PAGE_SIZE,
      ),
    );

  const hasPreviousPage =
    page > 1;

  const hasNextPage =
    page < totalPages;


  const goPrevious =
    useCallback(() => {
      if (!hasPreviousPage) {
        return;
      }

      setPage(
        (current) =>
          Math.max(
            1,
            current - 1,
          ),
      );
    }, [hasPreviousPage]);


  const goNext =
    useCallback(() => {
      if (!hasNextPage) {
        return;
      }

      setPage(
        (current) =>
          Math.min(
            totalPages,
            current + 1,
          ),
      );
    }, [
      hasNextPage,
      totalPages,
    ]);


  // ==========================================================
  // ACTIVE FILTERS
  // ==========================================================

  const filtersActive =
    useMemo(
      () =>
        Boolean(
          search.trim() ||
            typeFilter !==
              "all" ||
            channelFilter !==
              "all" ||
            deliveryStatusFilter !==
              "all" ||
            readFilter !==
              "all" ||
            startDate ||
            endDate,
        ),
      [
        search,
        typeFilter,
        channelFilter,
        deliveryStatusFilter,
        readFilter,
        startDate,
        endDate,
      ],
    );


  // ==========================================================
  // PAGE
  // ==========================================================

  return (
    <AdminLayout>
      <div className="space-y-6 p-4 md:p-6">

        {/* HEADER */}

        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">

          <div>
            <div className="flex items-center gap-3">

              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                <Bell className="h-5 w-5 text-primary" />
              </div>

              <div>
                <h1 className="text-2xl font-bold tracking-tight">
                  Notifications
                </h1>

                <p className="text-sm text-muted-foreground">
                  Monitor, inspect, retry and broadcast
                  customer notifications.
                </p>
              </div>

            </div>
          </div>


          <div className="flex flex-wrap gap-2">

            <Button
              variant="outline"
              onClick={() =>
                refreshAll(true)
              }
              disabled={
                refreshing
              }
            >
              {refreshing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}

              Refresh
            </Button>


            <Button
              onClick={() =>
                setBroadcastOpen(
                  true,
                )
              }
            >
              <Megaphone className="mr-2 h-4 w-4" />

              Broadcast
            </Button>

          </div>

        </div>


        {/* SUMMARY */}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Notifications
              </CardTitle>
            </CardHeader>

            <CardContent>
              <div className="flex items-center justify-between">

                <div className="text-2xl font-bold">
                  {summary.total.toLocaleString()}
                </div>

                <Bell className="h-5 w-5 text-muted-foreground" />

              </div>
            </CardContent>
          </Card>


          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Unread
              </CardTitle>
            </CardHeader>

            <CardContent>
              <div className="flex items-center justify-between">

                <div className="text-2xl font-bold">
                  {summary.unread.toLocaleString()}
                </div>

                <Eye className="h-5 w-5 text-muted-foreground" />

              </div>
            </CardContent>
          </Card>


          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Delivered
              </CardTitle>
            </CardHeader>

            <CardContent>
              <div className="flex items-center justify-between">

                <div className="text-2xl font-bold text-emerald-600">
                  {summary.delivery.delivered.toLocaleString()}
                </div>

                <Check className="h-5 w-5 text-emerald-600" />

              </div>
            </CardContent>
          </Card>


          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Failed
              </CardTitle>
            </CardHeader>

            <CardContent>
              <div className="flex items-center justify-between">

                <div className="text-2xl font-bold text-red-600">
                  {summary.delivery.failed.toLocaleString()}
                </div>

                <AlertCircle className="h-5 w-5 text-red-600" />

              </div>
            </CardContent>
          </Card>

        </div>


        {/* DELIVERY OVERVIEW */}

        <Card>

          <CardHeader>
            <CardTitle className="text-base">
              Delivery Overview
            </CardTitle>
          </CardHeader>

          <CardContent>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-5">

              <div className="rounded-lg border p-4">
                <div className="text-xs text-muted-foreground">
                  Pending
                </div>

                <div className="mt-1 text-xl font-semibold">
                  {summary.delivery.pending.toLocaleString()}
                </div>
              </div>


              <div className="rounded-lg border p-4">
                <div className="text-xs text-muted-foreground">
                  Processing
                </div>

                <div className="mt-1 text-xl font-semibold">
                  {summary.delivery.processing.toLocaleString()}
                </div>
              </div>


              <div className="rounded-lg border p-4">
                <div className="text-xs text-muted-foreground">
                  Delivered
                </div>

                <div className="mt-1 text-xl font-semibold text-emerald-600">
                  {summary.delivery.delivered.toLocaleString()}
                </div>
              </div>


              <div className="rounded-lg border p-4">
                <div className="text-xs text-muted-foreground">
                  Retrying
                </div>

                <div className="mt-1 text-xl font-semibold text-amber-600">
                  {summary.delivery.retrying.toLocaleString()}
                </div>
              </div>


              <div className="rounded-lg border p-4">
                <div className="text-xs text-muted-foreground">
                  Failed
                </div>

                <div className="mt-1 text-xl font-semibold text-red-600">
                  {summary.delivery.failed.toLocaleString()}
                </div>
              </div>

            </div>

          </CardContent>

        </Card>


        {/* FILTERS */}

        <Card>

          <CardHeader>

            <div className="flex items-center justify-between gap-4">

              <CardTitle className="flex items-center gap-2 text-base">
                <Filter className="h-4 w-4" />

                Filters
              </CardTitle>


              {filtersActive && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={
                    resetFilters
                  }
                >
                  <X className="mr-2 h-4 w-4" />

                  Clear
                </Button>
              )}

            </div>

          </CardHeader>


          <CardContent>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">

              <div className="space-y-2 lg:col-span-2">

                <Label>
                  Search
                </Label>

                <div className="relative">

                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

                  <Input
                    value={search}
                    onChange={(
                      event,
                    ) => {
                      setSearch(
                        event.target
                          .value,
                      );

                      setPage(1);
                    }}
                    placeholder="Title, message, type, user ID or transaction ID..."
                    className="pl-9"
                  />

                </div>

              </div>


              <div className="space-y-2">

                <Label>
                  Type
                </Label>

                <Select
                  value={
                    typeFilter
                  }
                  onValueChange={(
                    value,
                  ) => {
                    setTypeFilter(
                      value,
                    );

                    setPage(1);
                  }}
                >

                  <SelectTrigger>
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>

                  <SelectContent>

                    <SelectItem value="all">
                      All types
                    </SelectItem>

                    <SelectItem value="transfer">
                      Transfer
                    </SelectItem>

                    <SelectItem value="deposit">
                      Deposit
                    </SelectItem>

                    <SelectItem value="funding">
                      Funding
                    </SelectItem>

                    <SelectItem value="withdrawal">
                      Withdrawal
                    </SelectItem>

                    <SelectItem value="system">
                      System
                    </SelectItem>

                    <SelectItem value="security">
                      Security
                    </SelectItem>

                  </SelectContent>

                </Select>

              </div>


              <div className="space-y-2">

                <Label>
                  Channel
                </Label>

                <Select
                  value={
                    channelFilter
                  }
                  onValueChange={(
                    value,
                  ) => {
                    setChannelFilter(
                      value,
                    );

                    setPage(1);
                  }}
                >

                  <SelectTrigger>
                    <SelectValue placeholder="All channels" />
                  </SelectTrigger>

                  <SelectContent>

                    <SelectItem value="all">
                      All channels
                    </SelectItem>

                    <SelectItem value="in_app">
                      In-app
                    </SelectItem>

                    <SelectItem value="email">
                      Email
                    </SelectItem>

                    <SelectItem value="sms">
                      SMS
                    </SelectItem>

                    <SelectItem value="push">
                      Push
                    </SelectItem>

                    <SelectItem value="webhook">
                      Webhook
                    </SelectItem>

                  </SelectContent>

                </Select>

              </div>


              <div className="space-y-2">

                <Label>
                  Delivery status
                </Label>

                <Select
                  value={
                    deliveryStatusFilter
                  }
                  onValueChange={(
                    value,
                  ) => {
                    setDeliveryStatusFilter(
                      value,
                    );

                    setPage(1);
                  }}
                >

                  <SelectTrigger>
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>

                  <SelectContent>

                    <SelectItem value="all">
                      All statuses
                    </SelectItem>

                    <SelectItem value="pending">
                      Pending
                    </SelectItem>

                    <SelectItem value="processing">
                      Processing
                    </SelectItem>

                    <SelectItem value="delivered">
                      Delivered
                    </SelectItem>

                    <SelectItem value="retrying">
                      Retrying
                    </SelectItem>

                    <SelectItem value="failed">
                      Failed
                    </SelectItem>

                  </SelectContent>

                </Select>

              </div>


              <div className="space-y-2">

                <Label>
                  Read status
                </Label>

                <Select
                  value={
                    readFilter
                  }
                  onValueChange={(
                    value,
                  ) => {
                    setReadFilter(
                      value,
                    );

                    setPage(1);
                  }}
                >

                  <SelectTrigger>
                    <SelectValue placeholder="All notifications" />
                  </SelectTrigger>

                  <SelectContent>

                    <SelectItem value="all">
                      All notifications
                    </SelectItem>

                    <SelectItem value="unread">
                      Unread
                    </SelectItem>

                    <SelectItem value="read">
                      Read
                    </SelectItem>

                  </SelectContent>

                </Select>

              </div>


              <div className="space-y-2">

                <Label>
                  From
                </Label>

                <Input
                  type="date"
                  value={
                    startDate
                  }
                  onChange={(
                    event,
                  ) => {
                    setStartDate(
                      event.target
                        .value,
                    );

                    setPage(1);
                  }}
                />

              </div>


              <div className="space-y-2">

                <Label>
                  To
                </Label>

                <Input
                  type="date"
                  value={
                    endDate
                  }
                  onChange={(
                    event,
                  ) => {
                    setEndDate(
                      event.target
                        .value,
                    );

                    setPage(1);
                  }}
                />

              </div>

            </div>

          </CardContent>

        </Card>


        {/* NOTIFICATION TABLE */}

        <Card className="overflow-hidden">

          <CardHeader>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">

              <div>

                <CardTitle className="text-base">
                  Notification Records
                </CardTitle>

                <p className="text-sm text-muted-foreground">
                  {total.toLocaleString()} matching
                  notification
                  {total === 1
                    ? ""
                    : "s"}
                </p>

              </div>


              {loading && (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              )}

            </div>

          </CardHeader>


          <CardContent className="p-0">

            {loading &&
            rows.length === 0 ? (
              <div className="flex min-h-[300px] items-center justify-center">

                <div className="flex flex-col items-center gap-3 text-muted-foreground">

                  <Loader2 className="h-7 w-7 animate-spin" />

                  <span>
                    Loading notifications...
                  </span>

                </div>

              </div>
            ) : rows.length ===
              0 ? (
              <div className="flex min-h-[300px] flex-col items-center justify-center px-6 text-center">

                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">

                  <Bell className="h-6 w-6 text-muted-foreground" />

                </div>

                <h3 className="font-semibold">
                  No notifications found
                </h3>

                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                  There are no notifications matching
                  the current filters.
                </p>

                {filtersActive && (
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={
                      resetFilters
                    }
                  >
                    Clear filters
                  </Button>
                )}

              </div>
            ) : (
              <div className="overflow-x-auto">

                <table className="w-full min-w-[1250px] text-sm">

                  <thead className="border-y bg-muted/50">

                    <tr>

                      <th className="px-4 py-3 text-left font-medium">
                        Notification
                      </th>

                      <th className="px-4 py-3 text-left font-medium">
                        User
                      </th>

                      <th className="px-4 py-3 text-left font-medium">
                        Transaction Status
                      </th>

                      <th className="px-4 py-3 text-left font-medium">
                        Channel
                      </th>

                      <th className="px-4 py-3 text-left font-medium">
                        Delivery
                      </th>

                      <th className="px-4 py-3 text-right font-medium">
                        Amount
                      </th>

                      <th className="px-4 py-3 text-left font-medium">
                        Created
                      </th>

                      <th className="px-4 py-3 text-right font-medium">
                        Action
                      </th>

                    </tr>

                  </thead>


                  <tbody className="divide-y">

                    {rows.map(
                      (
                        notification,
                      ) => {
                        const ChannelIcon =
                          getChannelIcon(
                            notification.channel,
                          );

                        const transactionStatus =
                          getTransactionStatus(
                            notification,
                          );

                        return (
                          <tr
                            key={
                              notification.id
                            }
                            className="transition-colors hover:bg-muted/30"
                          >

                            {/* NOTIFICATION */}

                            <td className="max-w-[360px] px-4 py-4">

                              <div className="flex items-start gap-3">

                                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">

                                  <Bell className="h-4 w-4 text-primary" />

                                </div>

                                <div className="min-w-0">

                                  <div className="flex items-center gap-2">

                                    <span className="truncate font-medium">
                                      {
                                        notification.title
                                      }
                                    </span>

                                    {!notification.is_read && (
                                      <span
                                        className="h-2 w-2 shrink-0 rounded-full bg-primary"
                                        title="Unread"
                                      />
                                    )}

                                  </div>

                                  <p className="mt-1 truncate text-xs text-muted-foreground">
                                    {
                                      notification.message
                                    }
                                  </p>

                                </div>

                              </div>

                            </td>


                            {/* USER */}

                            <td className="px-4 py-4">

                              <span
                                className="font-mono text-xs"
                                title={
                                  notification.user_id ||
                                  ""
                                }
                              >
                                {shortenId(
                                  notification.user_id,
                                )}
                              </span>

                            </td>


                            {/* TRANSACTION STATUS */}

                            <td className="px-4 py-4">

                              <Badge
                                variant="outline"
                                className={transactionStatusBadgeClass(
                                  transactionStatus,
                                )}
                              >
                                {transactionStatusLabel(
                                  transactionStatus,
                                )}
                              </Badge>

                            </td>


                            {/* CHANNEL */}

                            <td className="px-4 py-4">

                              <div className="flex items-center gap-2">

                                <ChannelIcon className="h-4 w-4 text-muted-foreground" />

                                <span>
                                  {titleCase(
                                    notification.channel,
                                  )}
                                </span>

                              </div>

                            </td>


                            {/* DELIVERY */}

                            <td className="px-4 py-4">

                              <Badge
                                variant="outline"
                                className={deliveryBadgeClass(
                                  notification.delivery_status,
                                )}
                              >
                                {titleCase(
                                  notification.delivery_status,
                                )}
                              </Badge>

                            </td>


                            {/* AMOUNT */}

                            <td className="px-4 py-4 text-right font-medium">

                              {formatAmount(
                                notification.amount,
                              )}

                            </td>


                            {/* CREATED */}

                            <td className="px-4 py-4 text-xs text-muted-foreground">

                              {formatDate(
                                notification.created_at,
                              )}

                            </td>


                            {/* ACTION */}

                            <td className="px-4 py-4 text-right">

                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  openDetail(
                                    notification.id,
                                  )
                                }
                              >
                                <Eye className="mr-2 h-4 w-4" />

                                View
                              </Button>

                            </td>

                          </tr>
                        );
                      },
                    )}

                  </tbody>

                </table>

              </div>
            )}

          </CardContent>


          {/* PAGINATION */}

          {!loading &&
            rows.length > 0 && (
              <div className="flex flex-col gap-3 border-t px-4 py-4 sm:flex-row sm:items-center sm:justify-between">

                <div className="text-sm text-muted-foreground">

                  Showing{" "}

                  <span className="font-medium text-foreground">
                    {Math.min(
                      (page - 1) *
                        PAGE_SIZE +
                        1,
                      total,
                    )}
                  </span>

                  {" "}–{" "}

                  <span className="font-medium text-foreground">
                    {Math.min(
                      page *
                        PAGE_SIZE,
                      total,
                    )}
                  </span>

                  {" "}of{" "}

                  <span className="font-medium text-foreground">
                    {total.toLocaleString()}
                  </span>

                </div>


                <div className="flex items-center gap-2">

                  <span className="mr-2 text-sm text-muted-foreground">
                    Page{" "}
                    {page} of{" "}
                    {totalPages}
                  </span>

                  <Button
                    variant="outline"
                    size="icon"
                    onClick={
                      goPrevious
                    }
                    disabled={
                      !hasPreviousPage
                    }
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>

                  <Button
                    variant="outline"
                    size="icon"
                    onClick={
                      goNext
                    }
                    disabled={
                      !hasNextPage
                    }
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>

                </div>

              </div>
            )}

        </Card>


        {/* NOTIFICATION DETAIL */}

        <Dialog
          open={detailOpen}
          onOpenChange={
            setDetailOpen
          }
        >

          <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">

            <DialogHeader>

              <DialogTitle>
                Notification Details
              </DialogTitle>

              <DialogDescription>
                Complete notification, transaction and
                delivery information.
              </DialogDescription>

            </DialogHeader>


            {detailLoading ? (
              <div className="flex min-h-[250px] items-center justify-center">

                <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />

              </div>
            ) : selectedNotification ? (
              <div className="space-y-6">

                {/* MESSAGE */}

                <div className="rounded-xl border bg-muted/20 p-5">

                  <div className="flex items-start gap-4">

                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">

                      <Bell className="h-5 w-5 text-primary" />

                    </div>


                    <div className="min-w-0 flex-1">

                      <div className="flex flex-wrap items-center gap-2">

                        <h3 className="font-semibold">
                          {
                            selectedNotification.title
                          }
                        </h3>

                        {!selectedNotification.is_read && (
                          <Badge variant="secondary">
                            Unread
                          </Badge>
                        )}

                      </div>


                      <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                        {
                          selectedNotification.message
                        }
                      </p>

                    </div>

                  </div>

                </div>


                {/* STATUS */}

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

                  <div className="rounded-lg border p-4">

                    <div className="text-xs text-muted-foreground">
                      Transaction
                    </div>

                    <div className="mt-2">

                      <Badge
                        variant="outline"
                        className={transactionStatusBadgeClass(
                          getTransactionStatus(
                            selectedNotification,
                          ),
                        )}
                      >
                        {transactionStatusLabel(
                          getTransactionStatus(
                            selectedNotification,
                          ),
                        )}
                      </Badge>

                    </div>

                  </div>


                  <div className="rounded-lg border p-4">

                    <div className="text-xs text-muted-foreground">
                      Notification Type
                    </div>

                    <div className="mt-1 font-medium">
                      {titleCase(
                        selectedNotification.type,
                      )}
                    </div>

                  </div>


                  <div className="rounded-lg border p-4">

                    <div className="text-xs text-muted-foreground">
                      Channel
                    </div>

                    <div className="mt-1 font-medium">
                      {titleCase(
                        selectedNotification.channel,
                      )}
                    </div>

                  </div>


                  <div className="rounded-lg border p-4">

                    <div className="text-xs text-muted-foreground">
                      Delivery
                    </div>

                    <div className="mt-2">

                      <Badge
                        variant="outline"
                        className={deliveryBadgeClass(
                          selectedNotification.delivery_status,
                        )}
                      >
                        {titleCase(
                          selectedNotification.delivery_status,
                        )}
                      </Badge>

                    </div>

                  </div>

                </div>


                {/* AMOUNT */}

                <div className="grid gap-4 sm:grid-cols-2">

                  <div className="rounded-lg border p-4">

                    <div className="text-xs text-muted-foreground">
                      Amount
                    </div>

                    <div className="mt-1 text-lg font-semibold">
                      {formatAmount(
                        selectedNotification.amount,
                      )}
                    </div>

                  </div>


                  <div className="rounded-lg border p-4">

                    <div className="text-xs text-muted-foreground">
                      Created
                    </div>

                    <div className="mt-1 text-sm font-medium">
                      {formatDate(
                        selectedNotification.created_at,
                      )}
                    </div>

                  </div>

                </div>


                {/* IDENTIFIERS */}

                <div className="space-y-3">

                  <h3 className="font-semibold">
                    Identifiers
                  </h3>

                  <div className="grid gap-3 rounded-lg border p-4 text-sm">

                    <div className="grid gap-1 sm:grid-cols-[180px_1fr]">

                      <span className="text-muted-foreground">
                        Notification ID
                      </span>

                      <span className="break-all font-mono text-xs">
                        {
                          selectedNotification.id
                        }
                      </span>

                    </div>


                    <div className="grid gap-1 sm:grid-cols-[180px_1fr]">

                      <span className="text-muted-foreground">
                        User ID
                      </span>

                      <span className="break-all font-mono text-xs">
                        {
                          selectedNotification.user_id ||
                          "—"
                        }
                      </span>

                    </div>


                    <div className="grid gap-1 sm:grid-cols-[180px_1fr]">

                      <span className="text-muted-foreground">
                        Transaction ID
                      </span>

                      <span className="break-all font-mono text-xs">
                        {
                          selectedNotification.transaction_id ||
                          "—"
                        }
                      </span>

                    </div>


                    <div className="grid gap-1 sm:grid-cols-[180px_1fr]">

                      <span className="text-muted-foreground">
                        Broadcast ID
                      </span>

                      <span className="break-all font-mono text-xs">
                        {
                          selectedNotification.broadcast_id ||
                          "—"
                        }
                      </span>

                    </div>

                  </div>

                </div>


                {/* DELIVERY DETAILS */}

                <div className="space-y-3">

                  <h3 className="font-semibold">
                    Delivery Details
                  </h3>

                  <div className="grid gap-3 sm:grid-cols-2">

                    <div className="rounded-lg border p-4">

                      <div className="text-xs text-muted-foreground">
                        Delivery attempts
                      </div>

                      <div className="mt-1 text-lg font-semibold">
                        {Number(
                          selectedNotification.delivery_attempts ||
                            0,
                        )}
                      </div>

                    </div>


                    <div className="rounded-lg border p-4">

                      <div className="text-xs text-muted-foreground">
                        Created
                      </div>

                      <div className="mt-1 text-sm font-medium">
                        {formatDate(
                          selectedNotification.created_at,
                        )}
                      </div>

                    </div>


                    <div className="rounded-lg border p-4">

                      <div className="text-xs text-muted-foreground">
                        Last attempt
                      </div>

                      <div className="mt-1 text-sm font-medium">
                        {formatDate(
                          selectedNotification.last_attempt_at,
                        )}
                      </div>

                    </div>


                    <div className="rounded-lg border p-4">

                      <div className="text-xs text-muted-foreground">
                        Delivered
                      </div>

                      <div className="mt-1 text-sm font-medium">
                        {formatDate(
                          selectedNotification.delivered_at,
                        )}
                      </div>

                    </div>


                    <div className="rounded-lg border p-4">

                      <div className="text-xs text-muted-foreground">
                        Failed
                      </div>

                      <div className="mt-1 text-sm font-medium">
                        {formatDate(
                          selectedNotification.failed_at,
                        )}
                      </div>

                    </div>


                    <div className="rounded-lg border p-4">

                      <div className="text-xs text-muted-foreground">
                        Next retry
                      </div>

                      <div className="mt-1 text-sm font-medium">
                        {formatDate(
                          selectedNotification.next_retry_at,
                        )}
                      </div>

                    </div>

                  </div>

                </div>


                {/* LAST ERROR */}

                {selectedNotification.last_error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-4">

                    <div className="flex gap-3">

                      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />

                      <div>

                        <div className="font-medium text-red-700">
                          Last delivery error
                        </div>

                        <p className="mt-1 whitespace-pre-wrap text-sm text-red-700/90">
                          {
                            selectedNotification.last_error
                          }
                        </p>

                      </div>

                    </div>

                  </div>
                )}


                {/* METADATA */}

                {selectedNotification.metadata && (
                  <div className="space-y-3">

                    <h3 className="font-semibold">
                      Metadata
                    </h3>

                    <pre className="max-h-64 overflow-auto rounded-lg border bg-muted/30 p-4 text-xs">
                      {JSON.stringify(
                        selectedNotification.metadata,
                        null,
                        2,
                      )}
                    </pre>

                  </div>
                )}


                {/* RETRY */}

                {(
                  selectedNotification.delivery_status ===
                    "failed" ||
                  selectedNotification.delivery_status ===
                    "retrying"
                ) && (
                  <div className="flex justify-end border-t pt-4">

                    <Button
                      onClick={() =>
                        retryNotification(
                          selectedNotification.id,
                        )
                      }
                      disabled={
                        retrying
                      }
                    >

                      {retrying ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <RotateCcw className="mr-2 h-4 w-4" />
                      )}

                      Queue Retry

                    </Button>

                  </div>
                )}

              </div>
            ) : null}


            <DialogFooter>

              <Button
                variant="outline"
                onClick={() =>
                  setDetailOpen(
                    false,
                  )
                }
              >
                Close
              </Button>

            </DialogFooter>

          </DialogContent>

        </Dialog>


        {/* BROADCAST */}

        <Dialog
          open={broadcastOpen}
          onOpenChange={(open) => {
            if (broadcasting) {
              return;
            }

            setBroadcastOpen(
              open,
            );

            if (!open) {
              resetBroadcast();
            }
          }}
        >

          <DialogContent className="max-w-2xl">

            <DialogHeader>

              <DialogTitle className="flex items-center gap-2">

                <Megaphone className="h-5 w-5" />

                Broadcast Notification

              </DialogTitle>

              <DialogDescription>
                Create an in-app notification for every
                authenticated user.
              </DialogDescription>

            </DialogHeader>


            <div className="space-y-5">

              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">

                This action creates a notification record
                for every user in{" "}

                <code className="font-mono">
                  auth.users
                </code>

                . Make sure the message is intended for all
                customers before sending.

              </div>


              <div className="space-y-2">

                <Label htmlFor="broadcast-type">
                  Type
                </Label>

                <Input
                  id="broadcast-type"
                  value={
                    broadcastForm.type
                  }
                  onChange={(
                    event,
                  ) =>
                    updateBroadcast(
                      "type",
                      event.target
                        .value,
                    )
                  }
                  placeholder="system"
                  disabled={
                    broadcasting
                  }
                />

              </div>


              <div className="space-y-2">

                <Label htmlFor="broadcast-title">
                  Title
                </Label>

                <Input
                  id="broadcast-title"
                  value={
                    broadcastForm.title
                  }
                  onChange={(
                    event,
                  ) =>
                    updateBroadcast(
                      "title",
                      event.target
                        .value,
                    )
                  }
                  placeholder="Important announcement"
                  disabled={
                    broadcasting
                  }
                />

              </div>


              <div className="space-y-2">

                <Label htmlFor="broadcast-message">
                  Message
                </Label>

                <Textarea
                  id="broadcast-message"
                  value={
                    broadcastForm.message
                  }
                  onChange={(
                    event,
                  ) =>
                    updateBroadcast(
                      "message",
                      event.target
                        .value,
                    )
                  }
                  placeholder="Enter the notification message..."
                  className="min-h-[130px]"
                  disabled={
                    broadcasting
                  }
                />

              </div>


              <div className="space-y-2">

                <Label htmlFor="broadcast-amount">

                  Amount{" "}

                  <span className="text-muted-foreground">
                    (optional)
                  </span>

                </Label>

                <Input
                  id="broadcast-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={
                    broadcastForm.amount
                  }
                  onChange={(
                    event,
                  ) =>
                    updateBroadcast(
                      "amount",
                      event.target
                        .value,
                    )
                  }
                  placeholder="0.00"
                  disabled={
                    broadcasting
                  }
                />

              </div>

            </div>


            <DialogFooter>

              <Button
                variant="outline"
                onClick={() =>
                  setBroadcastOpen(
                    false,
                  )
                }
                disabled={
                  broadcasting
                }
              >
                Cancel
              </Button>


              <Button
                onClick={
                  submitBroadcast
                }
                disabled={
                  broadcasting
                }
              >

                {broadcasting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}

                Create Broadcast

              </Button>

            </DialogFooter>

          </DialogContent>

        </Dialog>

      </div>
    </AdminLayout>
  );
}

export default NotificationsPage;
