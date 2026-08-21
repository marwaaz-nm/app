"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";

type UnreadNotification = {
  id: number;
  href: string;
  read_at?: string | null;
};

type NotificationContextValue = {
  unreadCount: number;
  unreadCountFor: (href: string) => number;
  markAllRead: () => Promise<void>;
  markOneRead: (id: string | number) => void;
};

const NotificationContext = createContext<NotificationContextValue>({
  unreadCount: 0,
  unreadCountFor: () => 0,
  markAllRead: async () => {},
  markOneRead: () => {},
});

const routeMatches = (notificationHref: string, menuHref: string) => {
  const path = notificationHref.split("?")[0].split("#")[0];
  return path === menuHref || path.startsWith(`${menuHref}/`);
};

export function NotificationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const userId = user?.id;
  const [unread, setUnread] = useState<UnreadNotification[]>([]);

  useEffect(() => {
    if (loading || !userId) return;
    let active = true;
    void supabase
      .from("app_notifications")
      .select("id, href, read_at")
      .eq("recipient_id", userId)
      .is("read_at", null)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (active && !error) setUnread((data || []) as UnreadNotification[]);
      });

    const channel = supabase
      .channel(`notification-badges-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "app_notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const id = Number((payload.old as { id?: number }).id);
            setUnread((current) => current.filter((item) => item.id !== id));
            return;
          }
          const row = payload.new as UnreadNotification;
          setUnread((current) => {
            const withoutRow = current.filter((item) => item.id !== row.id);
            return row.read_at ? withoutRow : [row, ...withoutRow];
          });
        }
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [loading, userId]);

  const markOneRead = useCallback((id: string | number) => {
    const numericId = Number(id);
    setUnread((current) => current.filter((item) => item.id !== numericId));
  }, []);

  const markAllRead = useCallback(async () => {
    const ids = unread.map((item) => item.id);
    if (ids.length === 0) return;
    setUnread([]);
    const { error } = await supabase
      .from("app_notifications")
      .update({ read_at: new Date().toISOString() })
      .in("id", ids);
    if (error) {
      setUnread((current) => {
        const known = new Set(current.map((item) => item.id));
        return [...current, ...unread.filter((item) => !known.has(item.id))];
      });
    }
  }, [unread]);

  const value = useMemo<NotificationContextValue>(
    () => ({
      unreadCount: unread.length,
      unreadCountFor: (href) =>
        unread.filter((item) => routeMatches(item.href, href)).length,
      markAllRead,
      markOneRead,
    }),
    [markAllRead, markOneRead, unread]
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => useContext(NotificationContext);
