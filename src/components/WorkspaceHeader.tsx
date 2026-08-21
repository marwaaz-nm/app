"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { Bell, Search, ShieldAlert, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useMobileSearch } from "@/context/MobileSearchContext";
import ThemeToggle from "@/components/ThemeToggle";
import { useNotifications } from "@/context/NotificationContext";
import {
  requestPlatformNotificationPermission,
  showPlatformNotification,
} from "@/lib/platformNotifications";

type AlertItem = {
  id: string;
  level: "review" | "warning" | "info";
  title: string;
  detail: string;
  href: string;
  date?: string;
  notificationId?: string;
};

type NotificationRow = {
  id: number;
  title: string;
  body: string;
  href: string;
  created_at: string;
};

const notificationToAlert = (row: NotificationRow): AlertItem => ({
  id: `record-${row.id}`,
  notificationId: String(row.id),
  level: "info",
  title: row.title,
  detail: row.body,
  href: row.href,
  date: row.created_at,
});

const deliveredNotificationKey = (userId: string) =>
  `marwaazpn-delivered-notifications:${userId}`;

const readDeliveredNotificationIds = (userId: string): string[] => {
  try {
    const value = localStorage.getItem(deliveredNotificationKey(userId));
    return value ? (JSON.parse(value) as string[]) : [];
  } catch {
    return [];
  }
};

const markNotificationDelivered = (userId: string, notificationId: string) => {
  const ids = readDeliveredNotificationIds(userId);
  if (ids.includes(notificationId)) return;
  localStorage.setItem(
    deliveredNotificationKey(userId),
    JSON.stringify([notificationId, ...ids].slice(0, 100))
  );
};

async function showNativeNotificationOnce(userId: string, alert: AlertItem) {
  if (!Capacitor.isNativePlatform() || !alert.notificationId) return;
  if (readDeliveredNotificationIds(userId).includes(alert.notificationId))
    return;
  const displayed = await showPlatformNotification({
    id: alert.id,
    title: alert.title,
    body: alert.detail,
    href: alert.href,
  });
  if (displayed) markNotificationDelivered(userId, alert.notificationId);
}

const pageTitles: { match: string; title: string }[] = [
  { match: "/dashboard", title: "Dashboard" },
  { match: "/references", title: "Reference Records" },
  { match: "/explorer", title: "Map Explorer" },
  { match: "/records", title: "Diiwaanka Sahanka Dhulka" },
  { match: "/transfers", title: "Wareejinta Dhulka" },
  { match: "/financials", title: "Financial Management" },
  { match: "/reports", title: "Reports & Export" },
  { match: "/users", title: "Maamulka Isticmaalayaasha" },
  { match: "/settings", title: "Settings" },
];

const resolvePageTitle = (pathname: string) =>
  pageTitles.find(
    (entry) =>
      pathname === entry.match || pathname.startsWith(`${entry.match}/`)
  )?.title;

async function authenticatedWorkspaceFetch(path: string, signal: AbortSignal) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("No active session");
  return fetch(path, {
    signal,
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
}

export default function WorkspaceHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, user, loading } = useAuth();
  const {
    isOpen: mobileSearchOpen,
    toggle: toggleMobileSearch,
    available: mobileSearchAvailable,
  } = useMobileSearch();
  const { unreadCount, markAllRead, markOneRead } = useNotifications();
  const userId = user?.id;
  const profileId = profile?.id;
  const schemaReady = Array.isArray(profile?.permitted_actions);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [showAlerts, setShowAlerts] = useState(false);
  const pageTitle = resolvePageTitle(pathname);

  useEffect(() => {
    if (loading || !userId || !profileId || !schemaReady) return;
    let active = true;
    const controller = new AbortController();
    void (async () => {
      try {
        const [response, notificationResult] = await Promise.all([
          authenticatedWorkspaceFetch("/api/workspace", controller.signal),
          supabase
            .from("app_notifications")
            .select("id, title, body, href, created_at")
            .eq("recipient_id", userId)
            .is("read_at", null)
            .order("created_at", { ascending: false })
            .limit(20),
        ]);
        const data = await response.json();
        if (active && response.ok) {
          const recordAlerts = notificationResult.error
            ? []
            : ((notificationResult.data || []) as NotificationRow[]).map(
                notificationToAlert
              );
          setAlerts([...recordAlerts, ...(data.alerts || [])]);
          if (Capacitor.isNativePlatform() && recordAlerts.length > 0) {
            const storageKey = deliveredNotificationKey(userId);
            if (localStorage.getItem(storageKey) === null) {
              // Establish a baseline on first install so old unread rows do not flood the phone.
              recordAlerts.forEach((alert) => {
                if (alert.notificationId)
                  markNotificationDelivered(userId, alert.notificationId);
              });
            } else {
              await requestPlatformNotificationPermission();
              for (const alert of [...recordAlerts].reverse()) {
                await showNativeNotificationOnce(userId, alert);
              }
            }
          }
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        // Alerts are non-critical; AuthContext handles session changes.
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [loading, profileId, schemaReady, userId]);

  useEffect(() => {
    if (loading || !userId || !schemaReady) return;
    const channel = supabase
      .channel(`record-notifications-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "app_notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as NotificationRow;
          const alert = notificationToAlert(row);
          setAlerts((current) => [
            alert,
            ...current.filter((item) => item.id !== alert.id),
          ]);
          if (Capacitor.isNativePlatform()) {
            void showNativeNotificationOnce(userId, alert);
          } else {
            void showPlatformNotification({
              id: alert.id,
              title: alert.title,
              body: alert.detail,
              href: alert.href,
            });
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loading, schemaReady, userId]);

  useEffect(() => {
    if (loading || !userId || !schemaReady || !Capacitor.isNativePlatform())
      return;
    void requestPlatformNotificationPermission();
  }, [loading, schemaReady, userId]);

  useEffect(() => {
    if (loading || !userId || !schemaReady || !Capacitor.isNativePlatform())
      return;
    let active = true;
    const listenerHandles: Array<{ remove: () => Promise<void> }> = [];

    void import("@capacitor/push-notifications").then(
      async ({ PushNotifications }) => {
        const registration = await PushNotifications.addListener(
          "registration",
          (token) => {
            if (!active) return;
            void supabase.auth
              .getSession()
              .then(async ({ data }) => {
                const accessToken = data.session?.access_token;
                if (!accessToken)
                  throw new Error(
                    "No authenticated session for push registration."
                  );
                const response = await fetch("/api/notifications/register", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${accessToken}`,
                  },
                  body: JSON.stringify({
                    token: token.value,
                    platform: Capacitor.getPlatform(),
                  }),
                });
                if (!response.ok)
                  throw new Error(
                    `Push registration failed (${response.status}).`
                  );
              })
              .catch((error) =>
                console.error("[Push] Device registration failed:", error)
              );
          }
        );
        const received = await PushNotifications.addListener(
          "pushNotificationReceived",
          (notification) => {
            const href =
              typeof notification.data?.href === "string"
                ? notification.data.href
                : "/dashboard";
            void showPlatformNotification({
              id: `push-${notification.id}`,
              title: notification.title || "Marwaazpn App",
              body: notification.body || "Ogeysiis cusub ayaa ku soo dhacay.",
              href,
            });
          }
        );
        const action = await PushNotifications.addListener(
          "pushNotificationActionPerformed",
          (event) => {
            const href = event.notification.data?.href;
            if (typeof href === "string" && href.startsWith("/"))
              router.push(href);
          }
        );
        listenerHandles.push(registration, received, action);

        const current = await PushNotifications.checkPermissions();
        const permission =
          current.receive === "prompt"
            ? await PushNotifications.requestPermissions()
            : current;
        if (permission.receive === "granted")
          await PushNotifications.register();
      }
    );

    return () => {
      active = false;
      listenerHandles.forEach((handle) => void handle.remove());
    };
  }, [loading, router, schemaReady, userId]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let active = true;
    let removeListener: (() => Promise<void>) | undefined;
    void import("@capacitor/local-notifications").then(
      async ({ LocalNotifications }) => {
        const handle = await LocalNotifications.addListener(
          "localNotificationActionPerformed",
          (event) => {
            const href = event.notification.extra?.href;
            if (typeof href === "string" && href.startsWith("/"))
              router.push(href);
          }
        );
        if (!active) await handle.remove();
        else removeListener = () => handle.remove();
      }
    );
    return () => {
      active = false;
      if (removeListener) void removeListener();
    };
  }, [router]);

  const visibleAlerts: AlertItem[] = schemaReady ? alerts : [];

  const navigate = (alert: AlertItem) => {
    setShowAlerts(false);
    if (alert.notificationId) {
      setAlerts((current) => current.filter((item) => item.id !== alert.id));
      markOneRead(alert.notificationId);
      void supabase
        .from("app_notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", alert.notificationId)
        .eq("recipient_id", userId);
    }
    router.push(alert.href);
  };

  const toggleAlerts = () => {
    const nextOpen = !showAlerts;
    setShowAlerts(nextOpen);
    if (nextOpen) {
      void requestPlatformNotificationPermission();
      void markAllRead();
    }
  };

  return (
    <header className="sticky top-0 z-[1200] flex h-16 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur-xl md:px-6">
      <h1 className="min-w-0 truncate text-sm font-black tracking-[-0.01em] text-slate-800 md:text-base">
        {pageTitle}
      </h1>

      <div className="flex shrink-0 items-center gap-3">
        {mobileSearchAvailable && (
          <button
            onClick={toggleMobileSearch}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 md:hidden"
            aria-label={mobileSearchOpen ? "Xir raadinta" : "Fur raadinta"}
          >
            {mobileSearchOpen ? (
              <X className="h-4 w-4" />
            ) : (
              <Search className="h-4 w-4" />
            )}
          </button>
        )}
        <ThemeToggle />
        <div className="relative">
          <button
            onClick={toggleAlerts}
            className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"
            aria-label="Ogeysiis"
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-rose-500 px-1 text-[8px] font-black text-white">
                {Math.min(unreadCount, 9)}
                {unreadCount > 9 ? "+" : ""}
              </span>
            )}
          </button>
          {showAlerts && (
            <div className="fixed left-3 right-3 top-[4.5rem] md:absolute md:left-auto md:right-0 md:top-12 md:w-[360px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <div>
                  <p className="text-xs font-black text-slate-900">
                    Ogeysiisyada shaqada
                  </p>
                  <p className="mt-0.5 text-[9px] font-semibold text-slate-400">
                    Waxyaabaha u baahan ficil
                  </p>
                </div>
                <span className="rounded-full bg-rose-50 px-2 py-1 text-[9px] font-black text-rose-600">
                  {unreadCount}
                </span>
              </div>
              <div className="max-h-96 overflow-y-auto p-2">
                {visibleAlerts.length === 0 ? (
                  <div className="p-8 text-center">
                    <Bell className="mx-auto h-7 w-7 text-slate-200" />
                    <p className="mt-2 text-xs font-bold text-slate-500">
                      Wax ogeysiis ah ma jiro.
                    </p>
                  </div>
                ) : (
                  visibleAlerts.map((alert) => (
                    <button
                      key={alert.id}
                      onClick={() => navigate(alert)}
                      className="flex w-full gap-3 rounded-xl p-3 text-left hover:bg-slate-50"
                    >
                      <span
                        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                          alert.level === "review"
                            ? "bg-amber-50 text-amber-600"
                            : alert.level === "warning"
                            ? "bg-rose-50 text-rose-600"
                            : "bg-blue-50 text-blue-600"
                        }`}
                      >
                        <ShieldAlert className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[11px] font-black text-slate-800">
                          {alert.title}
                        </span>
                        <span className="mt-1 block truncate text-[9px] font-semibold text-slate-500">
                          {alert.detail}
                        </span>
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 border-l border-slate-200 pl-3 md:hidden">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-teal-600 text-[10px] font-black text-white">
            {profile?.fullname
              ?.split(/\s+/)
              .slice(0, 2)
              .map((part) => part[0])
              .join("")
              .toUpperCase() || "GS"}
          </div>
        </div>
      </div>

      {showAlerts && (
        <button
          className="fixed inset-0 -z-10 cursor-default"
          onClick={() => setShowAlerts(false)}
          aria-label="Xir ogeysiisyada"
        />
      )}
    </header>
  );
}
