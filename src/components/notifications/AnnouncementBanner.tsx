import { useCallback, useEffect, useState } from "react";
import { Megaphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

type Announcement = {
  id: string;
  title: string;
  message: string;
  created_at: string;
};

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
      .limit(1)
      .maybeSingle();

    if (!error) {
      setAnnouncement(data ?? null);
    } else {
      console.warn("Unable to load customer announcements:", error);
    }
  }, [userId]);

  useEffect(() => {
    void loadLatest();
  }, [loadLatest]);

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
    <section className="mb-5 overflow-hidden rounded-2xl border border-purple-200 bg-gradient-to-r from-purple-50 to-white shadow-sm" aria-label="Announcement">
      <div className="flex gap-3 p-4 sm:p-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-100 text-purple-700">
          <Megaphone className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-purple-700">Announcement</p>
          <h2 className="mt-1 text-base font-bold text-slate-950 sm:text-lg">{announcement.title}</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-600">{announcement.message}</p>
          <p className="mt-2 text-[11px] font-medium text-slate-400">
            {new Date(announcement.created_at).toLocaleString("en-NG")}
          </p>
        </div>
      </div>
    </section>
  );
}
