import { Text, View } from 'react-native';
import { Card, colors, Icon, Prose, styles } from './ui';
import { ProgressBar } from './TaskCard';
import { safeMessageLink } from './message-content';
export function WidgetCard({ widget }: { widget: { title: string; kind: string; data: Record<string, unknown> } }) {
  const rows = Array.isArray(widget.data.items) ? (widget.data.items as Record<string, unknown>[]) : [];
  return (
    <Card>
      <Text style={styles.heading}>{widget.title}</Text>
      {widget.kind === 'progress' ? (
        <>
          <View style={styles.row}>
            <Text style={[styles.muted, { flex: 1 }]}>{String(widget.data.label || 'Progress')}</Text>
            <Text style={styles.heading}>{Number(widget.data.value) || 0}%</Text>
          </View>
          <ProgressBar percent={Number(widget.data.value) || 0} label={widget.title} />
        </>
      ) : widget.kind === 'stats' ? (
        <View style={styles.wrap}>
          {rows.map((row, i) => (
            <View key={i} style={{ flexGrow: 1, flexBasis: '42%', minWidth: 0, gap: 5, padding: 10, backgroundColor: '#24212a', borderRadius: 12 }}>
              <Text style={styles.muted}>{String(row.label || '')}</Text>
              <Text style={styles.heading}>{String(row.value || '')}</Text>
            </View>
          ))}
        </View>
      ) : widget.kind === 'list' ? (
        rows.map((row, i) => (
          <View key={i} style={[styles.row, { alignItems: 'flex-start', gap: 8 }]}>
            <Icon name={row.done ? 'check' : 'clock'} size={18} color={row.done ? colors.success : colors.muted} />
            <Text style={[styles.text, { flex: 1 }, row.done === true && { color: colors.muted }]}>{String(row.text || '')}</Text>
          </View>
        ))
      ) : widget.kind === 'links' ? (
        rows.map((row, i) => (
          <Prose
            key={i}
            text={safeMessageLink(String(row.url)) ? `[${String(row.label).replace(/[\[\]]/g, '')}](<${String(row.url).replace(/[<>]/g, '')}>)` : String(row.label || '')}
          />
        ))
      ) : (
        <Prose text={String(widget.data.text || '')} />
      )}
    </Card>
  );
}
