import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import type { ToolActivity } from './live-events';
import { colors, Icon, Prose, styles } from './ui';
export function LiveActivity({ reasoning, tools = [], busy, label }: { reasoning?: string; tools?: ToolActivity[]; busy?: boolean; label?: string }) {
  const [thoughtsOpen, setThoughtsOpen] = useState(false),
    [toolsOpen, setToolsOpen] = useState(false);
  if (!reasoning && !tools.length && !busy) return null;
  return (
    <View style={{ gap: 8, marginBottom: 16, borderLeftWidth: 2, borderLeftColor: '#38303f', paddingLeft: 12, minWidth: 0 }}>
      {busy && (
        <View style={styles.row}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={[styles.muted, { flex: 1 }]}>
            {label || (tools.some((tool) => tool.state === 'running') ? 'Working with tools' : reasoning ? 'Thinking' : 'Preparing a response')}
          </Text>
        </View>
      )}
      {Boolean(reasoning) && (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Thinking details"
            accessibilityState={{ expanded: thoughtsOpen }}
            onPress={() => setThoughtsOpen(!thoughtsOpen)}
            style={[styles.row, { minHeight: 44 }]}
          >
            <Icon name="spark" size={17} />
            <Text style={[styles.muted, { flex: 1 }]}>Thinking</Text>
            <Icon name={thoughtsOpen ? 'more' : 'plus'} size={16} />
          </Pressable>
          {thoughtsOpen && <Prose text={reasoning!} />}
        </>
      )}
      {tools.length > 0 && (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tool activity"
            accessibilityState={{ expanded: toolsOpen }}
            onPress={() => setToolsOpen(!toolsOpen)}
            style={[styles.row, { minHeight: 44 }]}
          >
            <Icon name="settings" size={17} />
            <Text style={[styles.muted, { flex: 1 }]}>
              {tools.length} tool {tools.length === 1 ? 'action' : 'actions'}
            </Text>
            <Icon name={toolsOpen ? 'more' : 'plus'} size={16} />
          </Pressable>
          {(toolsOpen ? tools : tools.slice(-1)).map((tool) => (
            <View key={tool.id} style={[styles.row, { alignItems: 'flex-start', paddingBottom: 8 }]}>
              {tool.state === 'running' ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Icon name={tool.state === 'failed' ? 'close' : 'check'} size={17} color={tool.state === 'failed' ? colors.danger : colors.success} />
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.muted}>{tool.title}</Text>
                {tool.detail && (
                  <Text selectable numberOfLines={toolsOpen ? undefined : 2} style={[styles.muted, { fontSize: 12 }]}>
                    {tool.detail}
                  </Text>
                )}
              </View>
            </View>
          ))}
        </>
      )}
    </View>
  );
}
