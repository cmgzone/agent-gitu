import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Avatar, Card, colors, Icon, styles } from './ui';
import type { Agent } from './api';
export interface TaskItem {
  id: string;
  text?: string;
  title?: string;
  status: string;
  note?: string;
  agentId?: string;
}
export function taskProgress(items: TaskItem[]) {
  const active = items.filter((item) => item.status !== 'cancelled');
  const done = active.filter((item) => item.status === 'done' || item.status === 'completed').length;
  return { total: active.length, done, percent: active.length ? Math.round((done / active.length) * 100) : 0 };
}
export function ProgressBar({ percent, label }: { percent: number; label: string }) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: percent }}
      style={{ height: 5, borderRadius: 5, backgroundColor: '#37313f', overflow: 'hidden' }}
    >
      <View style={{ height: '100%', width: `${Math.min(100, Math.max(0, percent))}%`, backgroundColor: percent === 100 ? colors.success : colors.accent, borderRadius: 5 }} />
    </View>
  );
}
export function TaskCard({ items, agents = [], title = 'Task progress' }: { items: TaskItem[]; agents?: Agent[]; title?: string }) {
  const [showFinished, setShowFinished] = useState(false);
  if (!items.length) return null;
  const progress = taskProgress(items),
    finished = items.filter((item) => ['done', 'completed', 'cancelled'].includes(item.status));
  const groups = [
    { title: 'In progress', items: items.filter((item) => item.status === 'in_progress' || item.status === 'running') },
    { title: 'Needs attention', items: items.filter((item) => ['blocked', 'failed'].includes(item.status)) },
    { title: 'Up next', items: items.filter((item) => !['in_progress', 'running', 'done', 'completed', 'cancelled', 'blocked', 'failed'].includes(item.status)) },
    ...(showFinished ? [{ title: 'Finished', items: finished }] : []),
  ];
  return (
    <Card>
      <View style={styles.row}>
        <Icon name="check" color={colors.accent} />
        <Text style={[styles.heading, { flex: 1 }]}>{title}</Text>
        <Text style={styles.muted}>
          {progress.done}/{progress.total}
        </Text>
      </View>
      <ProgressBar percent={progress.percent} label={`${progress.done} of ${progress.total} tasks completed`} />
      {groups
        .filter((group) => group.items.length)
        .map((group) => (
          <View key={group.title} style={{ gap: 10 }}>
            <Text style={styles.label}>{group.title.toUpperCase()}</Text>
            {group.items.map((item) => {
              const agent = agents.find((member) => member.id === item.agentId),
                running = ['in_progress', 'running'].includes(item.status),
                done = ['done', 'completed'].includes(item.status),
                blocked = ['blocked', 'failed'].includes(item.status);
              return (
                <View key={item.id} style={[styles.row, { alignItems: 'flex-start', gap: 10, paddingVertical: 5 }]}>
                  <View style={{ paddingTop: 3 }}>
                    {running ? (
                      <ActivityIndicator size="small" color={colors.accent} />
                    ) : (
                      <Icon
                        name={done ? 'check' : blocked ? 'stop' : item.status === 'cancelled' ? 'close' : 'clock'}
                        size={18}
                        color={done ? colors.success : blocked ? colors.danger : colors.muted}
                      />
                    )}
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                    <Text style={[styles.text, done && { color: colors.muted }, item.status === 'cancelled' && { textDecorationLine: 'line-through', color: colors.muted }]}>
                      {item.text || item.title}
                    </Text>
                    {item.note && <Text style={styles.muted}>{item.note}</Text>}
                    {agent && (
                      <View style={[styles.row, { gap: 5 }]}>
                        <Avatar avatar={agent.avatar} size={20} />
                        <Text style={[styles.muted, { fontSize: 11 }]}>{agent.name}</Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        ))}
      {finished.length > 0 && (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: showFinished }}
          onPress={() => setShowFinished(!showFinished)}
          style={[styles.row, { minHeight: 44, justifyContent: 'space-between' }]}
        >
          <Text style={styles.muted}>
            {showFinished ? 'Hide' : 'Show'} {finished.length} finished {finished.length === 1 ? 'task' : 'tasks'}
          </Text>
          <Icon name={showFinished ? 'more' : 'plus'} size={16} />
        </Pressable>
      )}
    </Card>
  );
}
