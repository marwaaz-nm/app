import { Capacitor } from '@capacitor/core';

export type PlatformNotification = {
  id: string;
  title: string;
  body: string;
  href: string;
};

const numericNotificationId = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.max(1, Math.abs(hash));
};

export async function requestPlatformNotificationPermission(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const current = await LocalNotifications.checkPermissions();
    if (current.display === 'granted') return true;
    const requested = await LocalNotifications.requestPermissions();
    return requested.display === 'granted';
  }

  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  return (await Notification.requestPermission()) === 'granted';
}

export async function showPlatformNotification(notification: PlatformNotification) {
  if (Capacitor.isNativePlatform()) {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const permission = await LocalNotifications.checkPermissions();
    if (permission.display !== 'granted') return;
    await LocalNotifications.schedule({
      notifications: [{
        id: numericNotificationId(notification.id),
        title: notification.title,
        body: notification.body,
        extra: { href: notification.href },
      }],
    });
    return;
  }

  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const nativeNotification = new Notification(notification.title, {
    body: notification.body,
    icon: '/icon.png',
    tag: notification.id,
  });
  nativeNotification.onclick = () => {
    window.focus();
    window.location.assign(notification.href);
    nativeNotification.close();
  };
}

