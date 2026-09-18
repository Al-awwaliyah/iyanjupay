import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Bell, CheckCheck, Loader2, Megaphone } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

type AppNotification = {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
  amount: number | null;
  metadata: Record<string, any> | null;
  transaction_id: string | null;
};

function normalize(items: any[]): AppNotification[] {
  return items.map((item) => ({
    id: String(item.id),
    title: String(item.title ?? "IyanjuPay notification"),
    message: String(item.message ?? ""),
    type: String(item.type ?? "notification"),
    is_read: Boolean(item.is_read),
    created_at: String(item.created_at),
    amount: item.amount == null ? null : Number(item.amount),
    metadata: item.metadata ?? null,
    transaction_id: item.transaction_id ?? null,
  }));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatAmount(value: number | null) {
  if (value == null || Number.isNaN(value)) return null;
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 2,
  }).format(value);
}

export default function NotificationsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { data, error } = await db
        .from("notifications")
        .select("id,title,message,type,is_read,created_at,amount,metadata,transaction_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      setNotifications(normalize(data ?? []));
    } catch (error: any) {
      toast({ title: "Unable to load notifications", description: error?.message ?? "Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [user?.id, toast]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`user-notifications-page-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, (payload) => {
        const next = normalize([payload.new])[0];
        setNotifications((current) => [next, ...current.filter((n) => n.id !== next.id)].slice(0, 100));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, (payload) => {
        const updated = normalize([payload.new])[0];
        setNotifications((current) => current.map((n) => n.id === updated.id ? updated : n));
      })
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [user?.id]);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.is_read).length, [notifications]);

  const markAllRead = async () => {
    if (!user?.id || !unreadCount) return;
    const { error } = await db.from("notifications").update({ is_read: true }).eq("user_id", user.id).eq("is_read", false);
    if (error) {
      toast({ title: "Unable to mark notifications read", description: error.message, variant: "destructive" });
      return;
    }
    setNotifications((current) => current.map((n) => ({ ...n, is_read: true })));
  };

  const openNotification = (notification: AppNotification) => {
    navigate(`/notifications/${notification.id}`);
  };

  return (
    <div className="iyanjupay-dashboard min-h-screen px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="rounded-xl">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <div>
              <h1 className="text-2xl font-black text-foreground">Notifications</h1>
              <p className="text-sm text-muted-foreground">View your alerts and announcements.</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={markAllRead} disabled={!unreadCount} className="shrink-0">
            <CheckCheck className="mr-2 h-4 w-4" /> Mark all read
          </Button>
        </div>

        <Card className="border-border/60 bg-card/95 shadow-sm">
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" /> Loading notifications...
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-12 text-center">
                <Bell className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
                <p className="font-semibold text-foreground">No notifications yet</p>
                <p className="mt-1 text-sm text-muted-foreground">New alerts and announcements will appear here.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {notifications.map((notification) => {
                  const announcement = notification.metadata?.kind === "announcement";
                  const amount = formatAmount(notification.amount);
                  return (
                    <button
                      key={notification.id}
                      type="button"
                      onClick={() => openNotification(notification)}
                      className={`w-full px-4 py-4 text-left transition hover:bg-muted/60 sm:px-5 ${notification.is_read ? "bg-card" : "bg-primary/5"}`}
                    >
                      <div className="flex gap-3">
                        <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${announcement ? "bg-amber-100 text-amber-700" : "bg-primary/10 text-primary"}`}>
                          {announcement ? <Megaphone className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <p className="font-bold text-foreground">{notification.title}</p>
                            {!notification.is_read && <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                          </div>
                          <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">{notification.message}</p>
                          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span>{formatDate(notification.created_at)}</span>
                            <span className="capitalize">{notification.type.replace(/_/g, " ")}</span>
                            {amount && <span>{amount}</span>}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
