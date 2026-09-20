import { getSafeErrorMessage } from "@/lib/errorHandling";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Bell, CalendarDays, CircleDollarSign, FileText, Hash, Megaphone, Tag } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "short" }).format(new Date(value));
}

function formatAmount(value: number | null) {
  if (value == null || Number.isNaN(value)) return null;
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "NGN", minimumFractionDigits: 2 }).format(value);
}

function displayMetadataValue(value: unknown) {
  if (value == null) return "—";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

export default function NotificationDetailsPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const [notification, setNotification] = useState<AppNotification | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user?.id || !id) return;
    setLoading(true);
    try {
      const { data, error } = await db
        .from("notifications")
        .select("id,title,message,type,is_read,created_at,amount,metadata,transaction_id")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      setNotification(data as AppNotification | null);

      if (data && !data.is_read) {
        const { error: readError } = await db
          .from("notifications")
          .update({ is_read: true })
          .eq("id", id)
          .eq("user_id", user.id);
        if (!readError) setNotification((current) => current ? { ...current, is_read: true } : current);
      }
    } catch (error: any) {
      toast({ title: "Unable to open notification", description: getSafeErrorMessage(error) ?? "Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [id, user?.id, toast]);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return (
      <div className="iyanjupay-dashboard flex min-h-screen items-center justify-center px-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" /> Loading notification...
        </div>
      </div>
    );
  }

  if (!notification) {
    return (
      <div className="iyanjupay-dashboard min-h-screen px-4 py-8">
        <div className="mx-auto max-w-2xl">
          <Button variant="ghost" onClick={() => navigate("/notifications")} className="mb-6 rounded-xl">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to notifications
          </Button>
          <Card>
            <CardContent className="p-10 text-center">
              <Bell className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
              <h1 className="font-bold text-foreground">Notification not found</h1>
              <p className="mt-1 text-sm text-muted-foreground">This notification may no longer be available.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const announcement = notification.metadata?.kind === "announcement";
  const amount = formatAmount(notification.amount);
  const metadataEntries = notification.metadata
    ? Object.entries(notification.metadata).filter(([key]) => !["kind", "source"].includes(key))
    : [];

  return (
    <div className="iyanjupay-dashboard min-h-screen px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <Button variant="ghost" onClick={() => navigate("/notifications")} className="mb-5 rounded-xl">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to notifications
        </Button>

        <Card className="overflow-hidden border-border/60 bg-card/95 shadow-lg">
          <div className="border-b border-border bg-primary/5 px-5 py-6 sm:px-7">
            <div className="flex items-start gap-4">
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${announcement ? "bg-amber-100 text-amber-700" : "bg-primary/10 text-primary"}`}>
                {announcement ? <Megaphone className="h-6 w-6" /> : <Bell className="h-6 w-6" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold capitalize text-muted-foreground">
                    {notification.type.replace(/_/g, " ")}
                  </span>
                  {announcement && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">Announcement</span>}
                </div>
                <h1 className="mt-3 text-2xl font-black leading-tight text-foreground">{notification.title}</h1>
                <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                  <CalendarDays className="h-4 w-4" /> {formatDate(notification.created_at)}
                </div>
              </div>
            </div>
          </div>

          <CardContent className="space-y-6 p-5 sm:p-7">
            <section>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
                <FileText className="h-4 w-4" /> Message
              </h2>
              <p className="whitespace-pre-wrap text-[15px] leading-7 text-foreground">{notification.message || "No message provided."}</p>
            </section>

            {(amount || notification.transaction_id) && (
              <section className="grid gap-3 sm:grid-cols-2">
                {amount && (
                  <div className="rounded-2xl border border-border bg-muted/30 p-4">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><CircleDollarSign className="h-4 w-4" /> Amount</div>
                    <p className="mt-2 text-lg font-black text-foreground">{amount}</p>
                  </div>
                )}
                {notification.transaction_id && (
                  <div className="rounded-2xl border border-border bg-muted/30 p-4">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Hash className="h-4 w-4" /> Transaction ID</div>
                    <p className="mt-2 break-all font-mono text-sm text-foreground">{notification.transaction_id}</p>
                  </div>
                )}
              </section>
            )}

            <section className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border bg-muted/30 p-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Tag className="h-4 w-4" /> Type</div>
                <p className="mt-2 capitalize text-sm font-semibold text-foreground">{notification.type.replace(/_/g, " ")}</p>
              </div>
              <div className="rounded-2xl border border-border bg-muted/30 p-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Bell className="h-4 w-4" /> Status</div>
                <p className="mt-2 text-sm font-semibold text-foreground">{notification.is_read ? "Read" : "Unread"}</p>
              </div>
            </section>

            {metadataEntries.length > 0 && (
              <section>
                <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">Additional details</h2>
                <div className="overflow-hidden rounded-2xl border border-border">
                  {metadataEntries.map(([key, value]) => (
                    <div key={key} className="grid gap-1 border-b border-border p-4 last:border-b-0 sm:grid-cols-[160px_1fr] sm:gap-4">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{key.replace(/_/g, " ")}</span>
                      <pre className="whitespace-pre-wrap break-words font-sans text-sm text-foreground">{displayMetadataValue(value)}</pre>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
