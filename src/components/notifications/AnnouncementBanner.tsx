import { useCallback, useEffect, useState } from "react";
import { Megaphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

type Announcement = {
  id: string;
  title: string;
  message: string;
  created_at: string;
  metadata?: Record<string, unknown> | null;
};

function getExpiry(announcement: Announcement): number | null {
  const raw = announcement.metadata?.expires_at;
  if (typeof raw !== "string" || !raw) return null;
  const timestamp = new Date(raw).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function isActive(announcement: Announcement): boolean {
  const expiry = getExpiry(announcement);
  return expiry === null || expiry > Date.now();
}

export default function AnnouncementBanner({ userId }: { userId: string }) {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);

  const loadLatest = useCallback(async () => {
    if (!userId) return;

    const { data, error } = await db
      .from("notifications")
      .select("id,title,message,created_at,metadata")
      .eq("user_id", userId)
      .contains("metadata", { source: "admin", kind: "announcement" })
      .order("created_at", { ascending: false })
      .limit(25);

    if (error) {
      console.warn("Unable to load customer announcements:", error);
      return;
    }

    const active = (Array.isArray(data) ? data : []).find(isActive) ?? null;
    setAnnouncement(active);
  }, [userId]);

  useEffect(() => {
    void loadLatest();
  }, [loadLatest]);

  useEffect(() => {
    if (!userId || !announcement) return;
    const expiry = getExpiry(announcement);
    if (expiry === null) return;

    const delay = Math.max(0, expiry - Date.now());
    const timer = window.setTimeout(() => {
      void loadLatest();
    }, delay + 100);

    return () => window.clearTimeout(timer);
  }, [announcement, loadLatest]);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`customer-announcements-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => void loadLatest(),
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => void loadLatest(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, loadLatest]);

  if (!announcement) return null;

  return (
    <section
      className="mb-5 overflow-hidden rounded-2xl border border-purple-200 bg-gradient-to-r from-purple-50 to-white shadow-sm"
      aria-label="Announcement"
    >
      <div className="flex gap-3 p-4 sm:p-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-100 text-purple-700">
          <Megaphone className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1 overflow-hidden">
          <p className="text-[11px] font-bold uppercase tracking-wider text-purple-700">Announcement</p>
          <h2 className="mt-1 truncate text-base font-bold text-slate-950 sm:text-lg">{announcement.title}</h2>
          <div
            className="iyanjupay-announcement-marquee mt-2 overflow-hidden rounded-lg bg-white/60 py-1.5"
            tabIndex={0}
            aria-label={announcement.message}
          >
            <div className="iyanjupay-announcement-marquee-track">
              <span className="inline-block whitespace-nowrap pr-24 text-sm leading-6 text-slate-600">
                {announcement.message}
              </span>
              <span aria-hidden="true" className="inline-block whitespace-nowrap pr-24 text-sm leading-6 text-slate-600">
                {announcement.message}
              </span>
            </div>
          </div>
          <p className="mt-2 text-[11px] font-medium text-slate-400">
            {new Date(announcement.created_at).toLocaleString("en-NG")}
          </p>
        </div>
      </div>
    </section>
  );
}
