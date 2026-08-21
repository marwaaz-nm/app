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
  menu_path: string;
  entity_id: number;
  read_at?: string | null;
};

type NotificationContextValue = {
  unreadCount: number;
  unreadCountFor: (href: string) => number;
  markAllRead: () => Promise<void>;
  markMenuRead: (href: string) => Promise<void>;
  markOneRead: (id: string | number) => void;
  newEntityIdsFor: (href: string) => Set<number>;
  dismissNewEntity: (entityId: number) => void;
};

const NotificationContext = createContext<NotificationContextValue>({
  unreadCount: 0,
  unreadCountFor: () => 0,
  markAllRead: async () => {},
  markMenuRead: async () => {},
  markOneRead: () => {},
  newEntityIdsFor: () => new Set(),
  dismissNewEntity: () => {},
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
  const { user, profile, loading } = useAuth();
  const userId = user?.id;
  const [unread, setUnread] = useState<UnreadNotification[]>([]);
  const [highlighted, setHighlighted] = useState<UnreadNotification[]>([]);
  const notificationsEnabled = profile?.notifications_enabled !== false;
  const menuPreferences = useMemo(
    () => profile?.notification_menu_preferences || {},
    [profile?.notification_menu_preferences]
  );
  const isAllowed = useCallback(
    (row: UnreadNotification) =>
      notificationsEnabled && menuPreferences[row.menu_path] !== false,
    [menuPreferences, notificationsEnabled]
  );

  useEffect(() => {
    if (loading || !userId) return;
    let active = true;
    void supabase
      .from("app_notifications")
      .select("id, href, menu_path, entity_id, read_at")
      .eq("recipient_id", userId)
      .is("read_at", null)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (active && !error) {
          const allowed = ((data || []) as UnreadNotification[]).filter(
            isAllowed
          );
          setUnread(allowed);
          setHighlighted(allowed);
        }
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
            return row.read_at || !isAllowed(row)
              ? withoutRow
              : [row, ...withoutRow];
          });
          if (!row.read_at && isAllowed(row)) {
            setHighlighted((current) => [
              row,
              ...current.filter((item) => item.id !== row.id),
            ]);
          }
        }
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [isAllowed, loading, userId]);

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
      .eq("recipient_id", userId)
      .in("id", ids);
    if (error) {
      setUnread((current) => {
        const known = new Set(current.map((item) => item.id));
        return [...current, ...unread.filter((item) => !known.has(item.id))];
      });
    }
  }, [unread, userId]);

  const markMenuRead = useCallback(
    async (href: string) => {
      const selected = unread.filter((item) => routeMatches(item.href, href));
      const ids = selected.map((item) => item.id);
      if (ids.length === 0) return;
      setUnread((current) => current.filter((item) => !ids.includes(item.id)));
      const { error } = await supabase
        .from("app_notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("recipient_id", userId)
        .in("id", ids);
      if (error) setUnread((current) => [...selected, ...current]);
    },
    [unread, userId]
  );

  const dismissNewEntity = useCallback((entityId: number) => {
    setHighlighted((current) =>
      current.filter((item) => item.entity_id !== entityId)
    );
  }, []);

  const value = useMemo<NotificationContextValue>(
    () => ({
      unreadCount: unread.length,
      unreadCountFor: (href) =>
        unread.filter((item) => routeMatches(item.href, href)).length,
      markAllRead,
      markMenuRead,
      markOneRead,
      newEntityIdsFor: (href) =>
        new Set(
          highlighted
            .filter((item) => routeMatches(item.href, href))
            .map((item) => item.entity_id)
        ),
      dismissNewEntity,
    }),
    [
      dismissNewEntity,
      highlighted,
      markAllRead,
      markMenuRead,
      markOneRead,
      unread,
    ]
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => useContext(NotificationContext);
