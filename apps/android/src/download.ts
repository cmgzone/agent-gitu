import { Alert, Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import type { AgentApi } from './api';

export async function saveDownload(api: AgentApi, route: string, name: string, mime: string) {
  if (Platform.OS !== 'android') { Alert.alert('Save on your phone', 'Document downloads use the Android folder picker.'); return; }
  if (!route.startsWith('/api/') || !FileSystem.cacheDirectory) throw new Error('This document is unavailable.');
  const folder = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!folder.granted) return;
  const cache = `${FileSystem.cacheDirectory}gitu-download-${Date.now()}`;
  try {
    const result = await FileSystem.downloadAsync(api.connection.url + route, cache, { headers: { Authorization: `Bearer ${api.connection.key}` } });
    if (result.status !== 200) throw new Error('Could not download this document.');
    const info = await FileSystem.getInfoAsync(cache);
    if (!info.exists || info.size > 20_000_000) throw new Error('Phone downloads support files smaller than 20 MB.');
    const bytes = await FileSystem.readAsStringAsync(cache, { encoding: FileSystem.EncodingType.Base64 });
    const target = await FileSystem.StorageAccessFramework.createFileAsync(folder.directoryUri, name.replace(/[\\/:*?"<>|]/g, '_'), mime);
    await FileSystem.writeAsStringAsync(target, bytes, { encoding: FileSystem.EncodingType.Base64 });
    Alert.alert('Document saved', name);
  } finally { await FileSystem.deleteAsync(cache, { idempotent: true }).catch(() => {}); }
}
