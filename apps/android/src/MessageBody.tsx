import { memo, useMemo, type ReactNode } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { messageTokens, safeMessageLink, wrapMessageText, type MarkdownToken } from './message-content';

const theme = StyleSheet.create({
  body: { minWidth: 0, maxWidth: '100%', gap: 9 },
  text: { color: '#eeeaf4', fontSize: 14, lineHeight: 22, flexShrink: 1 },
  heading: { color: '#faf8ff', fontWeight: '700', fontSize: 16, lineHeight: 23 },
  inlineCode: { fontFamily: 'monospace', backgroundColor: '#2a2730', color: '#e0d4ff', fontSize: 13 },
  code: { maxWidth: '100%', minWidth: 0, borderWidth: 1, borderColor: '#302c37', borderRadius: 12, overflow: 'hidden', backgroundColor: '#18161c' },
  codeLabel: { color: '#aaa5b3', fontSize: 11, paddingHorizontal: 12, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#302c37' },
  codeText: { fontFamily: 'monospace', fontSize: 12, lineHeight: 20, color: '#e4dced', padding: 12 },
  quote: { borderLeftWidth: 3, borderLeftColor: '#ab95ff', paddingLeft: 12, gap: 8 },
  list: { flexDirection: 'row', gap: 8, minWidth: 0 },
  cell: { width: 160, padding: 10, borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#39343f' },
});

function openLink(href: string) {
  const safe = safeMessageLink(href);
  if (safe) void Linking.openURL(safe).catch(() => Alert.alert('Link unavailable', 'This link could not be opened.'));
}

function inline(tokens: MarkdownToken[]): ReactNode[] {
  let at = 0;
  function read(end?: string): ReactNode[] {
    const result: ReactNode[] = [];
    while (at < tokens.length) {
      const key = at,
        token = tokens[at++];
      if (token.type === end) break;
      switch (token.type) {
        case 'strong_open':
          result.push(
            <Text key={key} style={{ fontWeight: '700' }}>
              {read('strong_close')}
            </Text>,
          );
          break;
        case 'em_open':
          result.push(
            <Text key={key} style={{ fontStyle: 'italic' }}>
              {read('em_close')}
            </Text>,
          );
          break;
        case 's_open':
          result.push(
            <Text key={key} style={{ textDecorationLine: 'line-through' }}>
              {read('s_close')}
            </Text>,
          );
          break;
        case 'link_open': {
          const href = String(token.attrGet('href') || ''),
            safe = safeMessageLink(href);
          result.push(
            <Text
              key={key}
              accessibilityRole={safe ? 'link' : undefined}
              onPress={safe ? () => openLink(href) : undefined}
              style={safe ? { color: '#bda9ff', textDecorationLine: 'underline' } : undefined}
            >
              {read('link_close')}
            </Text>,
          );
          break;
        }
        case 'code_inline':
          result.push(
            <Text key={key} style={theme.inlineCode}>
              {wrapMessageText(token.content)}
            </Text>,
          );
          break;
        case 'softbreak':
        case 'hardbreak':
          result.push('\n');
          break;
        case 'image': {
          const href = String(token.attrGet('src') || ''),
            safe = safeMessageLink(href);
          result.push(
            <Text key={key} accessibilityRole={safe ? 'link' : undefined} onPress={safe ? () => openLink(href) : undefined} style={{ color: '#bda9ff' }}>
              {wrapMessageText(token.content || 'Open image')}
            </Text>,
          );
          break;
        }
        default:
          if (token.content) result.push(wrapMessageText(token.content));
      }
    }
    return result;
  }
  return read();
}

function blocks(tokens: MarkdownToken[]): ReactNode[] {
  let at = 0;
  function read(end?: string): ReactNode[] {
    const result: ReactNode[] = [];
    while (at < tokens.length) {
      const key = at,
        token = tokens[at++];
      if (token.type === end) break;
      switch (token.type) {
        case 'inline':
          result.push(
            <Text key={key} selectable style={theme.text}>
              {inline(token.children || [])}
            </Text>,
          );
          break;
        case 'heading_open':
          result.push(
            <Text key={key} accessibilityRole="header" selectable style={[theme.text, theme.heading, token.tag === 'h1' && { fontSize: 18, lineHeight: 25 }]}>
              {inline(tokens[at++]?.children || [])}
            </Text>,
          );
          at++;
          break;
        case 'fence':
        case 'code_block':
          result.push(
            <View key={key} style={theme.code}>
              <Text style={theme.codeLabel}>{token.info.trim().split(/\s/)[0] || 'Code'} · scroll to read</Text>
              <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator contentContainerStyle={{ flexGrow: 1 }}>
                <Text selectable style={theme.codeText}>
                  {token.content.replace(/\n$/, '')}
                </Text>
              </ScrollView>
            </View>,
          );
          break;
        case 'blockquote_open':
          result.push(
            <View key={key} style={theme.quote}>
              {read('blockquote_close')}
            </View>,
          );
          break;
        case 'bullet_list_open':
        case 'ordered_list_open': {
          const ordered = token.type === 'ordered_list_open';
          let index = Number(token.attrGet('start') || 1);
          const rows: ReactNode[] = [];
          while (at < tokens.length && tokens[at].type !== (ordered ? 'ordered_list_close' : 'bullet_list_close')) {
            const rowKey = at,
              next = tokens[at++];
            if (next.type === 'list_item_open')
              rows.push(
                <View key={rowKey} style={theme.list}>
                  <Text style={theme.text}>{ordered ? `${index++}.` : '•'}</Text>
                  <View style={{ flex: 1, minWidth: 0, gap: 6 }}>{read('list_item_close')}</View>
                </View>,
              );
          }
          at++;
          result.push(
            <View key={key} style={{ gap: 8 }}>
              {rows}
            </View>,
          );
          break;
        }
        case 'table_open': {
          const rows: ReactNode[] = [];
          let cells: ReactNode[] = [],
            header = false;
          while (at < tokens.length && tokens[at].type !== 'table_close') {
            const cellKey = at,
              next = tokens[at++];
            if (next.type === 'thead_open') header = true;
            if (next.type === 'thead_close') header = false;
            if (next.type === 'tr_open') cells = [];
            if (next.type === 'th_open' || next.type === 'td_open')
              cells.push(
                <View key={cellKey} style={[theme.cell, header && { backgroundColor: '#2a2631' }]}>
                  <Text selectable style={[theme.text, { fontSize: 13, lineHeight: 20 }, header && { fontWeight: '700' }]}>
                    {inline(tokens[at++]?.children || [])}
                  </Text>
                </View>,
              );
            if (next.type === 'tr_close')
              rows.push(
                <View key={cellKey} style={{ flexDirection: 'row' }}>
                  {cells}
                </View>,
              );
          }
          at++;
          result.push(
            <View key={key} style={theme.code}>
              <Text style={theme.codeLabel}>Table · swipe to see all columns</Text>
              <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator>
                <View>{rows}</View>
              </ScrollView>
            </View>,
          );
          break;
        }
        case 'hr':
          result.push(<View key={key} style={{ height: 1, backgroundColor: '#39343f', marginVertical: 4 }} />);
          break;
      }
    }
    return result;
  }
  return read();
}

export const MessageBody = memo(function MessageBody({ text }: { text: string }) {
  const content = useMemo(() => blocks(messageTokens(text)), [text]);
  return <View style={theme.body}>{content}</View>;
});
