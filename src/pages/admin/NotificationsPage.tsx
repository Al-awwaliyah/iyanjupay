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

type InAppStatus =
  | "pending"
  | "delivered";

type PushStatus =
  | "pending"
  | "processing"
  | "delivered"
  | "failed"
  | "retrying"
  | "skipped";

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

  /*
   * NEW STAGE 4 LIFECYCLE FIELDS
   */
  in_app_status: InAppStatus | string;

  in_app_delivered_at: string | null;

  push_status: PushStatus | string;

  push_attempts: number;

  push_last_attempt_at: string | null;

  push_delivered_at: string | null;

  push_failed_at: string | null;

  push_last_error: string | null;

  push_next_retry_at: string | null;

  broadcast_id: string | null;

  metadata: NotificationMetadata | null;

  created_at: string;

  transaction_status?:
    | TransactionStatus
    | string
    | null;

  /*
   * LEGACY COMPATIBILITY FIELDS.
   *
   * These remain in the database during the migration,
   * but Stage 4 does not use them as the notification
   * delivery lifecycle.
   */
  delivery_status?: string | null;

  delivery_attempts?: number | null;

  last_attempt_at?: string | null;

  delivered_at?: string | null;

  failed_at?: string | null;

  last_error?: string | null;

  next_retry_at?: string | null;
};

type NotificationSummary = {
  total: number;

  unread: number;

  read: number;

  in_app: {
    pending: number;
    delivered: number;
  };

  push: {
    pending: number;
    processing: number;
    delivered: number;
    failed: number;
    retrying: number;
    skipped: number;
  };

  /*
   * Legacy compatibility summary returned by the
   * Stage 5-compatible RPC.
   *
   * Not used as the source of truth by this UI.
   */
  delivery?: {
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

  announcement: boolean;

  expiresAt: string;
};


// ============================================================
// DEFAULTS
// ============================================================

function getDefaultAnnouncementExpiry(): string {
  const date = new Date(
    Date.now() + 24 * 60 * 60 * 1000,
  );

  const pad = (value: number) =>
    String(value).padStart(2, "0");

  return `${date.getFullYear()}-${pad(
    date.getMonth() + 1,
  )}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}


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
// SANITIZED FRONTEND ERRORS
// ============================================================

function getSafeErrorMessage(
  error: unknown,
  fallback: string,
): string {
  /*
   * Do not expose raw Supabase/Postgres/Edge Function
   * errors to the admin UI.
   *
   * The complete error is still logged locally for
   * development/diagnostics.
   */
  if (!error) {
    return fallback;
  }

  return fallback;
}


// ============================================================
// TRANSACTION STATUS
// ============================================================

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
// CHANNEL
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


// ============================================================
// IN-APP STATUS
// ============================================================

function inAppStatusBadgeClass(
  status: string,
) {
  switch (
    normalizeStatus(status)
  ) {
    case "delivered":
      return "border-emerald-200 bg-emerald-100 text-emerald-700";

    case "pending":
    default:
      return "border-slate-200 bg-slate-100 text-slate-700";
  }
}


function inAppStatusLabel(
  status: string,
) {
  switch (
    normalizeStatus(status)
  ) {
    case "delivered":
      return "Delivered";

    case "pending":
    default:
      return "Pending";
  }
}


// ============================================================
// PUSH STATUS
// ============================================================

function pushStatusBadgeClass(
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

    case "skipped":
      return "border-purple-200 bg-purple-100 text-purple-700";

    case "pending":
    default:
      return "border-slate-200 bg-slate-100 text-slate-700";
  }
}


function pushStatusLabel(
  status: string,
) {
  switch (
    normalizeStatus(status)
  ) {
    case "delivered":
      return "Delivered";

    case "failed":
      return "Failed";

    case "processing":
      return "Processing";

    case "retrying":
      return "Retrying";

    case "skipped":
      return "Skipped";

    case "pending":
    default:
      return "Pending";
  }
}


// ============================================================
// INITIAL SUMMARY
// ============================================================

function getInitialSummary(): NotificationSummary {
  return {
    total: 0,

    unread: 0,

    read: 0,

    in_app: {
      pending: 0,
      delivered: 0,
    },

    push: {
      pending: 0,
      processing: 0,
      delivered: 0,
      failed: 0,
      retrying: 0,
      skipped: 0,
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

  /*
   * This is now a PUSH status filter.
   *
   * The RPC parameter remains p_delivery_status for
   * backwards compatibility with the Stage 2 SQL function.
   */
  const [
    pushStatusFilter,
    setPushStatusFilter,
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
      announcement: true,
      expiresAt:
        getDefaultAnnouncementExpiry(),
    });


  // ==========================================================
  // RESET FILTERS
  // ==========================================================

  const resetFilters =
    useCallback(() => {
      setSearch("");

      setTypeFilter("all");

      setChannelFilter("all");

      setPushStatusFilter("all");

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

        const initial =
          getInitialSummary();

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

          in_app: {
            pending: Number(
              result.in_app?.pending ??
                initial.in_app.pending,
            ),

            delivered: Number(
              result.in_app?.delivered ??
                initial.in_app.delivered,
            ),
          },

          push: {
            pending: Number(
              result.push?.pending ??
                initial.push.pending,
            ),

            processing: Number(
              result.push?.processing ??
                initial.push.processing,
            ),

            delivered: Number(
              result.push?.delivered ??
                initial.push.delivered,
            ),

            failed: Number(
              result.push?.failed ??
                initial.push.failed,
            ),

            retrying: Number(
              result.push?.retrying ??
                initial.push.retrying,
            ),

            skipped: Number(
              result.push?.skipped ??
                initial.push.skipped,
            ),
          },

          /*
           * Keep compatibility data available if the RPC
           * still returns it.
           */
          delivery:
            result.delivery,

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

              /*
               * IMPORTANT:
               *
               * Stage 5-compatible SQL still exposes
               * p_delivery_status, but it maps internally
               * to push_status.
               */
              p_delivery_status:
                pushStatusFilter ===
                "all"
                  ? null
                  : pushStatusFilter,

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

          const normalizedItems =
            items.map(
              (item) => ({
                ...item,

                in_app_status:
                  item.in_app_status ||
                  "pending",

                push_status:
                  item.push_status ||
                  "pending",

                push_attempts:
                  Number(
                    item.push_attempts ||
                      0,
                  ),

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
        } catch (error: unknown) {
          console.error(
            "Notifications fetch failed:",
            error,
          );

          toast({
            title:
              "Unable to load notifications",

            description:
              getSafeErrorMessage(
                error,
                "Something went wrong while loading notifications.",
              ),

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
        pushStatusFilter,
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

            in_app_status:
              notification.in_app_status ||
              "pending",

            push_status:
              notification.push_status ||
              "pending",

            push_attempts:
              Number(
                notification.push_attempts ||
                  0,
              ),

            transaction_status:
              notification.transaction_status ||
              getTransactionStatus(
                notification,
              ),
          });
        } catch (error: unknown) {
          console.error(
            "Notification detail failed:",
            error,
          );

          toast({
            title:
              "Unable to load notification",

            description:
              getSafeErrorMessage(
                error,
                "The notification could not be loaded.",
              ),

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

          const retryQueuedAt =
            new Date().toISOString();

          toast({
            title:
              "Push retry queued",

            description:
              "The notification has been placed into the push retry state.",
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

                push_status:
                  "retrying",

                push_next_retry_at:
                  retryQueuedAt,

                push_last_error:
                  null,
              };
            },
          );

          await refreshAll(true);
        } catch (error: unknown) {
          console.error(
            "Notification retry failed:",
            error,
          );

          toast({
            title:
              "Unable to queue retry",

            description:
              getSafeErrorMessage(
                error,
                "The notification could not be queued for retry.",
              ),

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
        value: string | boolean,
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
        announcement: true,
        expiresAt:
          getDefaultAnnouncementExpiry(),
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

        let expiresAt:
          | string
          | null = null;

        if (
          broadcastForm.announcement
        ) {
          if (
            !broadcastForm.expiresAt
          ) {
            toast({
              title:
                "Announcement expiry required",

              description:
                "Choose when the announcement should disappear from customer dashboards.",

              variant:
                "destructive",
            });

            return;
          }

          const expiryDate =
            new Date(
              broadcastForm.expiresAt,
            );

          if (
            !Number.isFinite(
              expiryDate.getTime(),
            ) ||
            expiryDate.getTime() <=
              Date.now()
          ) {
            toast({
              title:
                "Invalid announcement expiry",

              description:
                "Choose a future date and time.",

              variant:
                "destructive",
            });

            return;
          }

          expiresAt =
            expiryDate.toISOString();
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

              p_metadata: {
                source: "admin",

                kind:
                  broadcastForm.announcement
                    ? "announcement"
                    : "notification",

                ...(expiresAt
                  ? {
                      expires_at:
                        expiresAt,
                    }
                  : {}),
              },
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
        } catch (error: unknown) {
          console.error(
            "Notification broadcast failed:",
            error,
          );

          toast({
            title:
              "Broadcast failed",

            description:
              getSafeErrorMessage(
                error,
                "The broadcast could not be created.",
              ),

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
            pushStatusFilter !==
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
        pushStatusFilter,
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
                Push Delivered
              </CardTitle>
            </CardHeader>

            <CardContent>
              <div className="flex items-center justify-between">

                <div className="text-2xl font-bold text-emerald-600">
                  {summary.push.delivered.toLocaleString()}
                </div>

                <Check className="h-5 w-5 text-emerald-600" />

              </div>
            </CardContent>
          </Card>


          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Push Failed
              </CardTitle>
            </CardHeader>

            <CardContent>
              <div className="flex items-center justify-between">

                <div className="text-2xl font-bold text-red-600">
                  {summary.push.failed.toLocaleString()}
                </div>

                <AlertCircle className="h-5 w-5 text-red-600" />

              </div>
            </CardContent>
          </Card>

        </div>


        {/* DELIVERY OVERVIEW */}

        <div className="grid gap-4 lg:grid-cols-2">

          {/* IN-APP */}

          <Card>

            <CardHeader>
              <CardTitle className="text-base">
                In-App Delivery
              </CardTitle>
            </CardHeader>

            <CardContent>

              <div className="grid grid-cols-2 gap-4">

                <div className="rounded-lg border p-4">
                  <div className="text-xs text-muted-foreground">
                    Pending
                  </div>

                  <div className="mt-1 text-xl font-semibold">
                    {summary.in_app.pending.toLocaleString()}
                  </div>
                </div>


                <div className="rounded-lg border p-4">
                  <div className="text-xs text-muted-foreground">
                    Delivered
                  </div>

                  <div className="mt-1 text-xl font-semibold text-emerald-600">
                    {summary.in_app.delivered.toLocaleString()}
                  </div>
                </div>

              </div>

            </CardContent>

          </Card>


          {/* PUSH */}

          <Card>

            <CardHeader>
              <CardTitle className="text-base">
                Push Delivery
              </CardTitle>
            </CardHeader>

            <CardContent>

              <div className="grid grid-cols-2 gap-4 md:grid-cols-3">

                <div className="rounded-lg border p-4">
                  <div className="text-xs text-muted-foreground">
                    Pending
                  </div>

                  <div className="mt-1 text-xl font-semibold">
                    {summary.push.pending.toLocaleString()}
                  </div>
                </div>


                <div className="rounded-lg border p-4">
                  <div className="text-xs text-muted-foreground">
                    Processing
                  </div>

                  <div className="mt-1 text-xl font-semibold">
                    {summary.push.processing.toLocaleString()}
                  </div>
                </div>


                <div className="rounded-lg border p-4">
                  <div className="text-xs text-muted-foreground">
                    Delivered
                  </div>

                  <div className="mt-1 text-xl font-semibold text-emerald-600">
                    {summary.push.delivered.toLocaleString()}
                  </div>
                </div>


                <div className="rounded-lg border p-4">
                  <div className="text-xs text-muted-foreground">
                    Retrying
                  </div>

                  <div className="mt-1 text-xl font-semibold text-amber-600">
                    {summary.push.retrying.toLocaleString()}
                  </div>
                </div>


                <div className="rounded-lg border p-4">
                  <div className="text-xs text-muted-foreground">
                    Failed
                  </div>

                  <div className="mt-1 text-xl font-semibold text-red-600">
                    {summary.push.failed.toLocaleString()}
                  </div>
                </div>


                <div className="rounded-lg border p-4">
                  <div className="text-xs text-muted-foreground">
                    Skipped
                  </div>

                  <div className="mt-1 text-xl font-semibold text-purple-600">
                    {summary.push.skipped.toLocaleString()}
                  </div>
                </div>

              </div>

            </CardContent>

          </Card>

        </div>


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
                  Push status
                </Label>

                <Select
                  value={
                    pushStatusFilter
                  }
                  onValueChange={(
                    value,
                  ) => {
                    setPushStatusFilter(
                      value,
                    );

                    setPage(1);
                  }}
                >

                  <SelectTrigger>
                    <SelectValue placeholder="All push statuses" />
                  </SelectTrigger>

                  <SelectContent>

                    <SelectItem value="all">
                      All push statuses
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

                    <SelectItem value="skipped">
                      Skipped
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

                <table className="w-full min-w-[1450px] text-sm">

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
                        In-App
                      </th>

                      <th className="px-4 py-3 text-left font-medium">
                        Push
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

                            <td className="max-w-[330px] px-4 py-4">

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


                            {/* IN-APP */}

                            <td className="px-4 py-4">

                              <Badge
                                variant="outline"
                                className={inAppStatusBadgeClass(
                                  notification.in_app_status,
                                )}
                              >
                                {inAppStatusLabel(
                                  notification.in_app_status,
                                )}
                              </Badge>

                            </td>


                            {/* PUSH */}

                            <td className="px-4 py-4">

                              <Badge
                                variant="outline"
                                className={pushStatusBadgeClass(
                                  notification.push_status,
                                )}
                              >
                                {pushStatusLabel(
                                  notification.push_status,
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
                      Read Status
                    </div>

                    <div className="mt-1 font-medium">
                      {selectedNotification.is_read
                        ? "Read"
                        : "Unread"}
                    </div>

                  </div>

                </div>


                {/* DELIVERY STATUS */}

                <div className="space-y-3">

                  <h3 className="font-semibold">
                    Notification Delivery
                  </h3>

                  <div className="grid gap-4 sm:grid-cols-2">

                    {/* IN-APP */}

                    <div className="rounded-lg border p-4">

                      <div className="text-xs text-muted-foreground">
                        In-App Status
                      </div>

                      <div className="mt-2">
                        <Badge
                          variant="outline"
                          className={inAppStatusBadgeClass(
                            selectedNotification.in_app_status,
                          )}
                        >
                          {inAppStatusLabel(
                            selectedNotification.in_app_status,
                          )}
                        </Badge>
                      </div>

                      <div className="mt-3 text-xs text-muted-foreground">
                        Delivered
                      </div>

                      <div className="mt-1 text-sm font-medium">
                        {formatDate(
                          selectedNotification.in_app_delivered_at,
                        )}
                      </div>

                    </div>


                    {/* PUSH */}

                    <div className="rounded-lg border p-4">

                      <div className="text-xs text-muted-foreground">
                        Push Status
                      </div>

                      <div className="mt-2">
                        <Badge
                          variant="outline"
                          className={pushStatusBadgeClass(
                            selectedNotification.push_status,
                          )}
                        >
                          {pushStatusLabel(
                            selectedNotification.push_status,
                          )}
                        </Badge>
                      </div>

                      <div className="mt-3 text-xs text-muted-foreground">
                        Attempts
                      </div>

                      <div className="mt-1 text-sm font-semibold">
                        {Number(
                          selectedNotification.push_attempts ||
                            0,
                        )}
                      </div>

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


                {/* PUSH DELIVERY DETAILS */}

                <div className="space-y-3">

                  <h3 className="font-semibold">
                    Push Delivery Details
                  </h3>

                  <div className="grid gap-3 sm:grid-cols-2">

                    <div className="rounded-lg border p-4">

                      <div className="text-xs text-muted-foreground">
                        Attempts
                      </div>

                      <div className="mt-1 text-lg font-semibold">
                        {Number(
                          selectedNotification.push_attempts ||
                            0,
                        )}
                      </div>

                    </div>


                    <div className="rounded-lg border p-4">

                      <div className="text-xs text-muted-foreground">
                        Last attempt
                      </div>

                      <div className="mt-1 text-sm font-medium">
                        {formatDate(
                          selectedNotification.push_last_attempt_at,
                        )}
                      </div>

                    </div>


                    <div className="rounded-lg border p-4">

                      <div className="text-xs text-muted-foreground">
                        Delivered
                      </div>

                      <div className="mt-1 text-sm font-medium">
                        {formatDate(
                          selectedNotification.push_delivered_at,
                        )}
                      </div>

                    </div>


                    <div className="rounded-lg border p-4">

                      <div className="text-xs text-muted-foreground">
                        Failed
                      </div>

                      <div className="mt-1 text-sm font-medium">
                        {formatDate(
                          selectedNotification.push_failed_at,
                        )}
                      </div>

                    </div>


                    <div className="rounded-lg border p-4">

                      <div className="text-xs text-muted-foreground">
                        Next retry
                      </div>

                      <div className="mt-1 text-sm font-medium">
                        {formatDate(
                          selectedNotification.push_next_retry_at,
                        )}
                      </div>

                    </div>

                  </div>

                </div>


                {/* PUSH ERROR */}

                {selectedNotification.push_last_error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-4">

                    <div className="flex gap-3">

                      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />

                      <div>

                        <div className="font-medium text-red-700">
                          Last push delivery error
                        </div>

                        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-red-700/90">
                          {
                            selectedNotification.push_last_error
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
                  selectedNotification.push_status ===
                    "failed" ||
                  selectedNotification.push_status ===
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

                      Queue Push Retry

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

          <DialogContent className="flex h-[100dvh] w-screen max-w-none flex-col overflow-hidden rounded-none p-0 sm:h-[96dvh] sm:w-[96vw] sm:max-w-5xl sm:rounded-2xl">

            <DialogHeader className="shrink-0 border-b px-5 py-4 sm:px-7">

              <DialogTitle className="flex items-center gap-2">

                <Megaphone className="h-5 w-5" />

                Broadcast Notification

              </DialogTitle>

              <DialogDescription>
                Create an in-app notification for every
                authenticated user.
              </DialogDescription>

            </DialogHeader>


            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-7">

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


                <label className="flex items-start gap-3 rounded-xl border p-3">

                  <input
                    type="checkbox"
                    checked={
                      broadcastForm.announcement
                    }
                    onChange={(
                      event,
                    ) =>
                      updateBroadcast(
                        "announcement",
                        event.target
                          .checked,
                      )
                    }
                    disabled={
                      broadcasting
                    }
                    className="mt-1 h-4 w-4"
                  />

                  <span>
                    <span className="block text-sm font-semibold">
                      Mark as customer announcement
                    </span>

                    <span className="block text-xs text-muted-foreground">
                      Shows an announcement icon in the
                      customer notification center.
                    </span>
                  </span>

                </label>


                {broadcastForm.announcement && (
                  <div className="space-y-2 rounded-xl border border-purple-200 bg-purple-50/60 p-3">

                    <Label htmlFor="broadcast-expires-at">
                      Show announcement until
                    </Label>

                    <Input
                      id="broadcast-expires-at"
                      type="datetime-local"
                      value={
                        broadcastForm.expiresAt
                      }
                      min={
                        new Date()
                          .toISOString()
                          .slice(
                            0,
                            16,
                          )
                      }
                      onChange={(
                        event,
                      ) =>
                        updateBroadcast(
                          "expiresAt",
                          event.target
                            .value,
                        )
                      }
                      disabled={
                        broadcasting
                      }
                    />

                    <p className="text-xs text-muted-foreground">
                      After this time, the announcement
                      automatically disappears from the customer
                      dashboard. It remains in Notification
                      Center/history.
                    </p>

                  </div>
                )}


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

            </div>


            <DialogFooter className="shrink-0 border-t bg-background px-5 py-4 sm:px-7">

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
