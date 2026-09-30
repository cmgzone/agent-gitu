import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, colors, Icon, styles } from './ui';

export interface Attachment {
  name: string;
  type: string;
  dataUrl: string;
}
export function Composer({
  placeholder,
  onSend,
  options,
  busy,
  hint,
  onModel,
  onProjects,
}: {
  placeholder: string;
  onSend: (text: string, files: Attachment[]) => Promise<void>;
  options?: () => void;
  busy?: boolean;
  hint?: string;
  onModel?: () => void;
  onProjects?: () => void;
}) {
  const [actions, setActions] = useState(false);
  const [text, setText] = useState(''),
    [files, setFiles] = useState<Attachment[]>([]),
    [sending, setSending] = useState(false);
  async function attach() {
    try {
      const picked = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
      if (picked.canceled) return;
      if (files.length + picked.assets.length > 4 || picked.assets.some((asset) => (asset.size || 0) > 3_000_000))
        throw new Error('Choose up to four files, smaller than 3 MB each.');
      const added: Attachment[] = [];
      for (const asset of picked.assets) {
        try {
          const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
          if (base64.length > 4_000_000) throw new Error('This file is too large. Choose a file smaller than 3 MB.');
          const type = asset.mimeType || 'application/octet-stream';
          added.push({ name: asset.name, type, dataUrl: `data:${type};base64,${base64}` });
        } finally {
          await FileSystem.deleteAsync(asset.uri, { idempotent: true }).catch(() => {});
        }
      }
      setFiles((old) => [...old, ...added]);
    } catch (error) {
      Alert.alert('Attachment unavailable', error instanceof Error ? error.message : 'Could not attach this file.');
    }
  }
  async function send() {
    if ((!text.trim() && !files.length) || sending || busy) return;
    setSending(true);
    try {
      await onSend(text.trim(), files);
      setText('');
      setFiles([]);
    } catch (error) {
      Alert.alert('Message could not be sent', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setSending(false);
    }
  }
  return (
    <View style={{ padding: 10, gap: 8, backgroundColor: colors.bg, width: '100%', maxWidth: 760, alignSelf: 'center', flexShrink: 0 }}>
      {files.length > 0 && (
        <View style={styles.wrap}>
          {files.map((file, i) => (
            <Pressable style={{ maxWidth: '100%' }} key={i} onPress={() => setFiles((old) => old.filter((_, index) => i !== index))}>
              <Text numberOfLines={1} style={styles.muted}>
                {file.name} ×
              </Text>
            </Pressable>
          ))}
        </View>
      )}
      <View style={[styles.card, { padding: 8, gap: 0, borderWidth: 1, borderColor: colors.border, borderRadius: 24 }]}>
        <TextInput
          accessibilityLabel={placeholder}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          value={text}
          onChangeText={setText}
          multiline
          style={{ color: colors.text, fontSize: 14, minHeight: 58, maxHeight: 120, width: '100%', padding: 12, textAlignVertical: 'top' }}
          editable={!sending}
        />
        <View style={[styles.row, { gap: 4 }]}>
          <Pressable
            style={[styles.iconButton, { width: 42, height: 44 }]}
            accessibilityRole="button"
            accessibilityLabel="Add files or tools"
            disabled={sending}
            onPress={() => setActions(true)}
          >
            <Icon name="plus" color={colors.text} />
          </Pressable>
          {options && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Conversation tools"
              onPress={options}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, minHeight: 44 }}
            >
              <Icon name="settings" size={16} color={colors.text} />
              <Text style={{ fontSize: 11, color: colors.text }}>Tools</Text>
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose model"
            onPress={onModel || options}
            style={{ flex: 1, minWidth: 0, paddingHorizontal: 6, minHeight: 44, justifyContent: 'center' }}
          >
            <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 11 }}>
              {hint || 'Model'}
            </Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Send message"
            accessibilityRole="button"
            disabled={sending || busy || (!text.trim() && !files.length)}
            onPress={() => void send()}
            style={[styles.iconButton, { width: 42, height: 42, backgroundColor: colors.accent, opacity: sending || busy || (!text.trim() && !files.length) ? 0.4 : 1 }]}
          >
            <Icon name="send" color="#17121e" />
          </Pressable>
        </View>
      </View>
      <Modal visible={actions} transparent animationType="slide" onRequestClose={() => setActions(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#0009' }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Dismiss message actions" onPress={() => setActions(false)} style={{ flex: 1 }} />
          <SafeAreaView style={{ maxHeight: '80%', backgroundColor: colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 10 }}>
              <Text style={styles.heading}>Message actions</Text>
              <Button
                title="Attach files"
                onPress={() => {
                  setActions(false);
                  void attach();
                }}
              />
              {options && (
                <Button
                  title="Conversation tools"
                  onPress={() => {
                    setActions(false);
                    options();
                  }}
                />
              )}
              {onModel && (
                <Button
                  title="Choose model"
                  onPress={() => {
                    setActions(false);
                    onModel();
                  }}
                />
              )}
              {onProjects && (
                <Button
                  title="Projects and chats"
                  onPress={() => {
                    setActions(false);
                    onProjects();
                  }}
                />
              )}
              <Button title="Close" onPress={() => setActions(false)} />
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    </View>
  );
}
