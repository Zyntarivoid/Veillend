import { Platform } from 'react-native';
import api from './api';
import { navigationRef } from '../navigation/navigationRef';

type NotificationResponse = { notification: { request: { content: { data?: Record<string, unknown> } } } };

/** Register the device with the backend. Importing Expo Notifications lazily keeps web tests safe. */
export async function registerPush(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Notifications = require('expo-notifications') as typeof import('expo-notifications');
  const permissions = await Notifications.getPermissionsAsync();
  if (permissions.status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    if (requested.status !== 'granted') return;
  }
  const token = (await Notifications.getExpoPushTokenAsync()).data;
  await api.post('/users/me/push-token', {
    token,
    platform: Platform.OS === 'ios' ? 'IOS' : 'ANDROID',
  });
}

export function handleNotification(response: NotificationResponse): void {
  const data = response.notification.request.content.data ?? {};
  const positionId = typeof data.positionId === 'string' ? data.positionId : undefined;
  if (positionId && navigationRef.isReady()) {
    navigationRef.navigate('LiquidationReview', { positionId });
  }
}