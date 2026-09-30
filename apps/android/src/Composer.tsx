import { useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { colors, Icon, styles } from './ui';

export interface Attachment { name: string; type: string; dataUrl: string }
export function Composer({ placeholder, onSend, options, busy, hint }: { placeholder: string; onSend: (text: string, files: Attachment[]) => Promise<void>; options?: () => void; busy?: boolean; hint?: string }) {
  const [text, setText] = useState(''), [files, setFiles] = useState<Attachment[]>([]), [sending, setSending] = useState(false);
  async function attach() {
    try {
      const picked = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
      if (picked.canceled) return;
      if (files.length + picked.assets.length > 4 || picked.assets.some(asset => (asset.size || 0) > 3_000_000)) throw new Error('Choose up to four files, smaller than 3 MB each.');
      const added: Attachment[] = [];
      for (const asset of picked.assets) {
        try {
          const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
          if (base64.length > 4_000_000) throw new Error('This file is too large. Choose a file smaller than 3 MB.');
          const type = asset.mimeType || 'application/octet-stream';
          added.push({ name: asset.name, type, dataUrl: `data:${type};base64,${base64}` });
        } finally { await FileSystem.deleteAsync(asset.uri, { idempotent: true }).catch(() => {}); }
      }
      setFiles(old => [...old, ...added]);
    } catch (error) { Alert.alert('Attachment unavailable', error instanceof Error ? error.message : 'Could not attach this file.'); }
  }
  async function send() {
    if ((!text.trim() && !files.length) || sending || busy) return;
    setSending(true);
    try { await onSend(text.trim(), files); setText(''); setFiles([]); }
    catch (error) { Alert.alert('Message could not be sent', error instanceof Error ? error.message : 'Try again.'); }
    finally { setSending(false); }
  }
  return <View style={{ padding: 12, gap: 8, backgroundColor: colors.bg }}>
    {files.length > 0 && <View style={styles.wrap}>{files.map((file, i) => <Pressable key={i} onPress={() => setFiles(old => old.filter((_, index) => i !== index))}><Text style={styles.muted}>{file.name} ×</Text></Pressable>)}</View>}
    <View style={[styles.card, { padding: 8, gap: 0, borderWidth: 1, borderColor: colors.border, borderRadius: 24 }]}><TextInput accessibilityLabel={placeholder} placeholder={placeholder} placeholderTextColor={colors.muted} value={text} onChangeText={setText} multiline style={{ color: colors.text, fontSize: 16, minHeight: 66, maxHeight: 150, padding: 12, textAlignVertical: 'top' }} editable={!sending} />
      <View style={[styles.row, { gap: 4 }]}><Pressable style={styles.iconButton} accessibilityLabel="Attach a file" disabled={sending} onPress={() => void attach()}><Icon name="plus" /></Pressable>{hint && <Pressable onPress={options} style={{ flex: 1, paddingVertical: 10 }}><Text numberOfLines={1} style={{ color: colors.muted, fontSize: 12 }}>{hint}</Text></Pressable>}{options && <Pressable style={styles.iconButton} accessibilityLabel="Conversation options" onPress={options}><Icon name="more" /></Pressable>}{!hint && <View style={{ flex: 1 }} />}<Pressable accessibilityLabel="Send message" accessibilityRole="button" disabled={sending || busy || (!text.trim() && !files.length)} onPress={() => void send()} style={[styles.iconButton, { backgroundColor: colors.accent, opacity: sending || busy || (!text.trim() && !files.length) ? .4 : 1 }]}><Icon name="send" color="#17121e" /></Pressable></View>
    </View>
  </View>;
}
