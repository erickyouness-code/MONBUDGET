import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * Notifications LOCALES (programmées sur le téléphone, sans serveur).
 * Elles fonctionnent dans Expo Go. Sur le web, tout est sans effet.
 */

export type NotificationAccess = 'granted' | 'denied' | 'undetermined' | 'unsupported';

const CHANNEL = 'reminders';
const supported = Platform.OS !== 'web';

if (supported) {
  // Afficher aussi le rappel quand l'application est ouverte.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

export async function getNotificationAccess(): Promise<NotificationAccess> {
  if (!supported) return 'unsupported';
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
}

/** Demande l'autorisation (une seule fois, au moment où c'est utile). */
export async function requestNotificationAccess(): Promise<NotificationAccess> {
  if (!supported) return 'unsupported';
  const current = await Notifications.getPermissionsAsync();
  if (current.status === 'granted') return 'granted';
  if (!current.canAskAgain) return 'denied';
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted' ? 'granted' : 'denied';
}

export type ReminderToSchedule = { date: string; title: string; body: string };

/**
 * Remplace tous les rappels programmés par la nouvelle liste (à 9 h, heure locale).
 * Les rappels déjà passés sont ignorés.
 */
export async function replaceScheduledReminders(reminders: ReminderToSchedule[]): Promise<number> {
  if (!supported) return 0;
  if ((await getNotificationAccess()) !== 'granted') return 0;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Rappels',
      importance: AndroidImportance.DEFAULT,
    });
  }

  await Notifications.cancelAllScheduledNotificationsAsync();
  const now = Date.now();
  let count = 0;
  for (const r of reminders) {
    const [y, m, d] = r.date.split('-').map(Number);
    const at = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 9, 0, 0);
    if (at.getTime() <= now + 60_000) continue;
    await Notifications.scheduleNotificationAsync({
      content: { title: r.title, body: r.body },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: CHANNEL },
    });
    count++;
  }
  return count;
}

export async function cancelAllReminders(): Promise<void> {
  if (supported) await Notifications.cancelAllScheduledNotificationsAsync();
}
