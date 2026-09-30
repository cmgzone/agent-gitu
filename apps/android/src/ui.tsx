import { useId, type ReactNode } from 'react';
import { MessageBody } from './MessageBody';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { SvgXml } from 'react-native-svg';
import { HOME_BLOB_HTML } from '../../../src/server/ui-home';

export const colors = { bg: '#111111', card: '#1d1c20', border: '#343238', text: '#f6f4fa', muted: '#aaa5b3', accent: '#ab95ff', success: '#8cd6b2', danger: '#ff9b9b' };
export const styles = StyleSheet.create({
  fill: { flex: 1, minWidth: 0, minHeight: 0, backgroundColor: colors.bg },
  content: { padding: 16, gap: 14, paddingBottom: 24, width: '100%', maxWidth: 760, alignSelf: 'center', flexGrow: 1 },
  row: { minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  card: { minWidth: 0, maxWidth: '100%', backgroundColor: colors.card, borderRadius: 20, padding: 18, gap: 10 },
  title: { color: colors.text, fontSize: 24, fontWeight: '700', letterSpacing: -0.6 },
  heading: { color: colors.text, fontSize: 16, fontWeight: '600' },
  text: { color: colors.text, fontSize: 14, lineHeight: 22 },
  muted: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  label: { color: colors.muted, fontSize: 12, fontWeight: '600', letterSpacing: 1, marginTop: 8 },
  input: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 14, color: colors.text, fontSize: 15, minHeight: 50 },
  button: {
    maxWidth: '100%',
    flexShrink: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  primary: { backgroundColor: colors.accent },
  iconButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 16 },
  header: { paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: { maxWidth: '100%', alignSelf: 'flex-start', flexShrink: 1, backgroundColor: '#292631', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
});
const paths: Record<string, string> = {
  chat: 'M4 4h16v12H9l-5 4Z',
  team: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87M16 3a4 4 0 0 1 0 8M9 3a4 4 0 1 0 0 8a4 4 0 0 0 0-8',
  folder: 'M3 7V4h6l2 3h10v13H3Z',
  settings: 'M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2',
  sidebar: 'M3 4h18v16H3ZM9 4v16',
  close: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  back: 'M15 5l-7 7l7 7',
  send: 'M12 19V5M5 12l7-7l7 7',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  globe: 'M3 12h18M12 3c6 6 6 12 0 18c-6-6-6-12 0-18',
  git: 'M6 3v12a6 6 0 0 0 12 0V9M6 7a2 2 0 1 0 0-4a2 2 0 0 0 0 4M18 9a2 2 0 1 0 0-4a2 2 0 0 0 0 4',
  clock: 'M12 8v5l3 2',
  check: 'M5 12l4 4L19 6',
  stop: 'M6 6h12v12H6Z',
  file: 'M5 3h9l5 5v13H5ZM14 3v5h5M8 13h8M8 17h8',
  spark: 'M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z',
  link: 'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2',
};
export function Icon({ name, color = colors.muted, size = 22 }: { name: string; color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <Path d={paths[name] || paths.spark} />
      {['globe', 'clock'].includes(name) && <Circle cx="12" cy="12" r="9" />}
    </Svg>
  );
}
export function Avatar({ avatar, size = 68 }: { avatar?: { color: string; shape: string }; size?: number }) {
  const gradientId = useId().replace(/[^a-zA-Z0-9]/g, '');
  const color = /^#[0-9a-f]{6}$/i.test(avatar?.color || '') ? avatar!.color : '#8f80ff';
  let xml = HOME_BLOB_HTML;
  if (avatar && avatar.shape !== 'home-blob') {
    const shape = avatar.shape;
    const body =
      shape === 'cube'
        ? '<rect x="6" y="6" width="28" height="28" rx="6"'
        : shape === 'diamond'
          ? '<path d="M20 2L37 19L20 37L3 19Z"'
          : shape === 'pyramid'
            ? '<path d="M20 3L38 35H2Z"'
            : '<ellipse cx="20" cy="21" rx="17" ry="16"';
    xml = `<svg viewBox="0 0 40 40"><defs><radialGradient id="face" cx="28%" cy="18%" r="85%"><stop stop-color="#eee8ff"/><stop offset=".5" stop-color="${color}"/><stop offset="1" stop-color="${color}" stop-opacity=".8"/></radialGradient></defs>${body} fill="url(#face)"/><ellipse cx="15" cy="20" rx="1.9" ry="3.1" fill="#262144"/>${shape === 'diamond' ? '<path d="M23 20Q25 22 27 20" stroke="#262144" stroke-width="1.7" fill="none"/>' : '<ellipse cx="25" cy="20" rx="1.9" ry="3.1" fill="#262144"/><circle cx="25.6" cy="19" r=".7" fill="white"/>'}<circle cx="15.6" cy="19" r=".7" fill="white"/><ellipse cx="11" cy="25" rx="2.5" ry="1.3" fill="#f4a4d2"/><ellipse cx="29" cy="25" rx="2.5" ry="1.3" fill="#f4a4d2"/><path d="M16 26Q20 33 24 26Z" fill="#36234e"/><path d="M19 29Q23 28 22 31Q20 34 19 31Z" fill="#ff91bd"/></svg>`;
  } else if (color !== '#8f80ff') xml = xml.replace('#9580ff', color).replace('#cbbdff', 'white').replace('#6550cf', color);
  xml = xml.replace(/id="([^"]+)"/g, (_, id) => `id="${gradientId}${id}"`).replace(/url\(#([^)]*)\)/g, (_, id) => `url(#${gradientId}${id})`);
  return (
    <View style={{ width: size, height: size, flexShrink: 0, backgroundColor: 'transparent' }}>
      <SvgXml xml={xml} width={size} height={size} accessibilityLabel="Agent character" />
    </View>
  );
}
export function Button({ title, onPress, primary, disabled, danger }: { title: string; onPress: () => void; primary?: boolean; disabled?: boolean; danger?: boolean }) {
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button, primary && styles.primary, disabled && { opacity: 0.45 }]}>
      <Text style={{ color: primary ? '#17121e' : danger ? colors.danger : colors.text, fontSize: 14, fontWeight: '600', textAlign: 'center', flexShrink: 1 }}>{title}</Text>
    </Pressable>
  );
}
export function Field({
  label,
  value,
  onChange,
  multiline = false,
  secret = false,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  secret?: boolean;
  placeholder?: string;
}) {
  return (
    <View style={{ gap: 7 }}>
      <Text style={styles.muted}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        multiline={multiline}
        secureTextEntry={secret}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoCorrect={!secret}
        style={[styles.input, multiline && { minHeight: 100, textAlignVertical: 'top' }]}
      />
    </View>
  );
}
export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}
export function Body({ children }: { children: ReactNode }) {
  return (
    <ScrollView style={{ flex: 1, minWidth: 0 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.content}>
      {children}
    </ScrollView>
  );
}
export function Empty({ title, detail }: { title: string; detail?: string }) {
  return (
    <View style={{ padding: 24, gap: 8 }}>
      <Text style={styles.heading}>{title}</Text>
      {detail && <Text style={styles.muted}>{detail}</Text>}
    </View>
  );
}
export function Loading() {
  return <ActivityIndicator style={{ padding: 24 }} color={colors.accent} />;
}
export function Badge({ text }: { text: string }) {
  return (
    <View style={styles.badge}>
      <Text style={styles.muted}>{text.replace(/_/g, ' ')}</Text>
    </View>
  );
}

export const Prose = MessageBody;
