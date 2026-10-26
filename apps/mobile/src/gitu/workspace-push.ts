import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import { type PushWorkspace } from './push-protocol';
export const PUSH_CHANNEL = 'gitu-workspace';
interface PushPreferences {
  deviceId: string;
  workspaces: Record<string, PushWorkspace>;
}
const preferencesFile = FileSystem.documentDirectory && FileSystem.documentDirectory + 'workspace-push.json';
let preferences: Promise<PushPreferences> | undefined;
let saves = Promise.resolve();

export function pushPreferences(): Promise<PushPreferences> {
  return (preferences ??= (async () => {
    try {
      const saved = JSON.parse(await FileSystem.readAsStringAsync(preferencesFile!)) as PushPreferences;
      if (/^[a-f0-9]{32}$/.test(saved.deviceId) && saved.workspaces && typeof saved.workspaces === 'object' && !Array.isArray(saved.workspaces)) return saved;
    } catch {
      /* First installation. No FCM token or sign-in secret is stored here. */
    }
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    return { deviceId: Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(''), workspaces: {} };
  })());
}
async function remember(server: string, enabled: boolean, workspaceId: string): Promise<void> {
  if (!/^[a-f0-9]{32}$/.test(workspaceId)) throw Error('Invalid notification workspace.');
  const saved = await pushPreferences();
  saved.workspaces[server] = { enabled, workspaceId };
  saves = saves
    .catch(() => {})
    .then(async () => {
      if (!preferencesFile) throw Error('Notification preferences cannot be saved on this device.');
      await FileSystem.writeAsStringAsync(preferencesFile, JSON.stringify(saved));
    });
  await saves;
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function nativePushAction(server: string, action: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const saved = await pushPreferences();
  if (action === 'remember') {
    if (typeof payload.enabled !== 'boolean' || typeof payload.workspaceId !== 'string') throw Error('Invalid notification preference.');
    await remember(server, payload.enabled, payload.workspaceId);
  }
  const supported = Constants.expoConfig?.extra?.fcmEnabled === true;
  if (action === 'enable' || action === 'token') {
    if (!supported) throw Error('This APK needs its Firebase google-services.json configuration. Rebuild the Android app after configuration.');
    await Notifications.setNotificationChannelAsync(PUSH_CHANNEL, {
      name: 'Gitu workspace',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    });
    let permission = await Notifications.getPermissionsAsync();
    if (!permission.granted && action === 'enable') permission = await Notifications.requestPermissionsAsync();
    if (!permission.granted) throw Error('Allow notifications in Android settings to receive Gitu alerts.');
    const token = await Notifications.getDevicePushTokenAsync();
    if (token.type !== 'android' || typeof token.data !== 'string') throw Error('An Android FCM token is unavailable.');
    return { deviceId: saved.deviceId, token: token.data };
  }
  if (action !== 'status' && action !== 'remember') throw Error('Unknown notification action.');
  const permission = await Notifications.getPermissionsAsync();
  return { deviceId: saved.deviceId, supported, enabled: saved.workspaces[server]?.enabled === true, permission: permission.status };
}
