import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, CheckCheck, Loader2, Megaphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const db = supabase as any;

type AppNotification = {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
  amount?: number | null;
  metadata?: Record<string, any> | null;
  transaction_id?: string | null;
};

function normalizeRpcItems(data: any): AppNotification[] {
  const source = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
  return source.map((item: any) => ({
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

function relativeTime(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.floor(diff / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function NotificationCenter({ userId }: { userId: string }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.is_read).length, [notifications]);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { data, error } = await db
        .from("notifications")
        .select("id,title,message,type,is_read,created_at,amount,metadata,transaction_id")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      setNotifications(normalizeRpcItems(data));
    } catch (error) {
      console.error("Notification load failed:", error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase.channel(`user-notifications-${userId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}`,
      }, (payload) => {
        const row = payload.new as any;
        const next: AppNotification = {
          id: row.id,
          title: row.title,
          message: row.message,
          type: row.type,
          is_read: Boolean(row.is_read),
          created_at: row.created_at,
          amount: row.amount,
          metadata: row.metadata,
          transaction_id: row.transaction_id,
        };
        setNotifications((current) => [next, ...current.filter((n) => n.id !== next.id)].slice(0, 30));
        if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
          try { new Notification(next.title, { body: next.message, icon: "/icon-192.png" }); } catch {}
        }
      })
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${userId}`,
      }, (payload) => {
        const row = payload.new as any;
        setNotifications((current) => current.map((n) => n.id === row.id ? { ...n, ...row } : n));
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [userId]);

  const markRead = async (id: string) => {
    const { error } = await db.from("notifications").update({ is_read: true }).eq("id", id).eq("user_id", userId);
    if (error) {
      toast({ title: "Unable to update notification", description: error.message, variant: "destructive" });
      return;
    }
    setNotifications((current) => current.map((n) => n.id === id ? { ...n, is_read: true } : n));
  };

  const markAllRead = async () => {
    if (!unreadCount) return;
    const { error } = await db.from("notifications").update({ is_read: true }).eq("user_id", userId).eq("is_read", false);
    if (error) {
      toast({ title: "Unable to mark notifications read", description: error.message, variant: "destructive" });
      return;
    }
    setNotifications((current) => current.map((n) => ({ ...n, is_read: true })));
  };

  return (
    <div className="relative">
      <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)} className="relative h-10 w-10 rounded-full p-0 text-white hover:bg-white/15" aria-label="Notifications">
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && <span className="absolute -right-0.5 -top-0.5 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{unreadCount > 99 ? "99+" : unreadCount}</span>}
      </Button>

      {open && (
        <>
          <button className="fixed inset-0 z-40 cursor-default" aria-label="Close notifications" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-12 z-50 w-[min(92vw,390px)] overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div>
                <p className="font-bold">Notifications</p>
                <p className="text-xs text-slate-500">{unreadCount} unread</p>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={markAllRead} disabled={!unreadCount} className="text-xs"> <CheckCheck className="mr-1 h-3.5 w-3.5" /> Read all</Button>
                <Button variant="ghost" size="icon" onClick={() => setOpen(false)}><X className="h-4 w-4" /></Button>
              </div>
            </div>
            <div className="max-h-[430px] overflow-y-auto">
              {loading ? <div className="flex items-center justify-center gap-2 p-8 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading...</div> : notifications.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">No notifications yet.</div> : notifications.map((n) => (
                <button key={n.id} onClick={() => { if (!n.is_read) void markRead(n.id); }} className={`w-full border-b border-slate-100 px-4 py-3 text-left transition hover:bg-slate-50 ${n.is_read ? "bg-white" : "bg-blue-50/60"}`}>
                  <div className="flex gap-3">
                    <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${n.metadata?.kind === "announcement" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}`}>
                      {n.metadata?.kind === "announcement" ? <Megaphone className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2"><p className="truncate text-sm font-bold">{n.title}</p><span className="shrink-0 text-[10px] text-slate-400">{relativeTime(n.created_at)}</span></div>
                      <p className="mt-1 text-xs leading-5 text-slate-600">{n.message}</p>
                    </div>
                    {!n.is_read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-blue-600" />}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
