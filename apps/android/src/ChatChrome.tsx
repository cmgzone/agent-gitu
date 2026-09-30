import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Avatar, colors, Icon, styles } from './ui';

/** Transparent controls float over the conversation, with no header surface. */
export function ChatChrome({
  avatar,
  name,
  back,
  projects,
  details,
}: {
  avatar?: { shape: string; color: string };
  name: string;
  back: () => void;
  projects: () => void;
  details: () => void;
}) {
  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 76, zIndex: 5, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' }}
    >
      <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={back} style={[styles.iconButton, { position: 'absolute', left: 8, top: 10 }]}>
        <Icon name="back" />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`${name}, open details`} onPress={details}>
        <Avatar avatar={avatar} size={72} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Open projects" onPress={projects} style={[styles.iconButton, { position: 'absolute', right: 8, top: 10 }]}>
        <Icon name="sidebar" />
      </Pressable>
    </View>
  );
}

export function ChatMessage({
  user,
  name,
  avatar,
  timestamp,
  options,
  children,
}: {
  user?: boolean;
  name: string;
  avatar?: { shape: string; color: string };
  timestamp?: string;
  options?: () => void;
  children: ReactNode;
}) {
  return (
    <View style={{ width: '100%', minWidth: 0, marginBottom: 18, alignItems: user ? 'flex-end' : 'stretch' }}>
      <View
        style={{
          minWidth: 0,
          maxWidth: user ? '94%' : '100%',
          width: user ? undefined : '100%',
          padding: user ? 14 : 0,
          borderRadius: 20,
          backgroundColor: user ? '#282330' : 'transparent',
          marginLeft: 0,
        }}
      >
        <View style={[styles.row, { marginBottom: 8, gap: 8 }]}>
          {!user && <Avatar avatar={avatar} size={32} />}
          <Text numberOfLines={1} style={[styles.muted, { flex: 1, fontWeight: '600', color: user ? colors.muted : colors.text }]}>
            {name}
          </Text>
          {timestamp && <Text style={{ color: colors.muted, fontSize: 10 }}>{new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>}
          {options && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Message options"
              onPress={options}
              style={{ width: 36, height: 32, alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="more" size={18} />
            </Pressable>
          )}
        </View>
        {children}
      </View>
    </View>
  );
}
