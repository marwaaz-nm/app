import { Capacitor } from '@capacitor/core';

export type PlatformNotification = {
  id: string;
  title: string;
  body: string;
  href: string;
};

const ANDROID_CHANNEL_ID = 'record-updates';

async function prepareNativeNotificationChannel() {
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  if (Capacitor.getPlatform() === 'android') {
    await LocalNotifications.createChannel({
      id: ANDROID_CHANNEL_ID,
      name: 'Record updates',
      description: 'Ogeysiisyada records-ka cusub',
      importance: 5,
      visibility: 1,
      vibration: true,
    });
  }
  return LocalNotifications;
}

const numericNotificationId = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.max(1, Math.abs(hash));
};

export async function requestPlatformNotificationPermission(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    const LocalNotifications = await prepareNativeNotificationChannel();
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

export async function showPlatformNotification(notification: PlatformNotification): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    const LocalNotifications = await prepareNativeNotificationChannel();
    const permission = await LocalNotifications.checkPermissions();
    if (permission.display !== 'granted') return false;
    await LocalNotifications.schedule({
      notifications: [{
        id: numericNotificationId(notification.id),
        title: notification.title,
        body: notification.body,
        channelId: ANDROID_CHANNEL_ID,
        smallIcon: 'notification_logo',
        largeIcon: 'notification_logo',
        iconColor: '#159447',
        schedule: { at: new Date(Date.now() + 500) },
        extra: { href: notification.href },
      }],
    });
    return true;
  }

  if (!('Notification' in window) || Notification.permission !== 'granted') return false;
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
  return true;
}
