import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { MobileServices } from './NativeWorkspace';
import type { Run } from './api';
import { useResource } from './hooks';
import { Button, colors, Icon, Loading, styles } from './ui';
import { ResourceError } from './chats';

export function projectKey(path = '') {
  const normalized = path.replace(/\\/g, '/').replace(/\/$/, '');
  return /^[a-z]:/i.test(normalized) ? normalized.toLowerCase() : normalized;
}
export function ProjectDrawer({ services: s, close }: { services: MobileServices; close: () => void }) {
  const home = useResource<{ projectsPath: string }>(s.api, '/api/home');
  const active = useResource<{ name: string; repoRoot: string }>(s.api, '/api/project');
  const projects = useResource<{ dirs: string[] }>(s.api, home.data ? `/api/browse?path=${encodeURIComponent(home.data.projectsPath)}` : '');
  const runs = useResource<Run[]>(s.api, '/api/runs', 5000);
  const [search, setSearch] = useState(''),
    [expanded, setExpanded] = useState(s.project);
  const paths = [
    ...new Map(
      [active.data?.repoRoot, ...(projects.data?.dirs || []), ...(runs.data || []).map((run) => run.projectPath)]
        .filter((path): path is string => Boolean(path))
        .map((path) => [projectKey(path), path]),
    ).values(),
  ];
  const matches = (text: string) => text.toLowerCase().includes(search.toLowerCase());
  return (
    <Modal transparent animationType="fade" onRequestClose={close}>
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: '#0009' }}>
        <SafeAreaView style={{ width: '86%', maxWidth: 360, height: '100%', backgroundColor: colors.bg, borderRightWidth: 1, borderRightColor: colors.border }}>
          <View style={[styles.row, { paddingHorizontal: 16, paddingTop: 10 }]}>
            <Text style={[styles.heading, { flex: 1 }]}>Projects & chats</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close projects" onPress={close} style={styles.iconButton}>
              <Icon name="close" />
            </Pressable>
          </View>
          <View style={{ padding: 16, gap: 10 }}>
            <TextInput
              accessibilityLabel="Search projects and chats"
              placeholder="Search projects and chats"
              placeholderTextColor={colors.muted}
              value={search}
              onChangeText={setSearch}
              style={styles.input}
            />
            <Button
              primary
              title="New chat"
              onPress={() => {
                close();
                s.home();
              }}
            />
            <Button
              title="Create project"
              onPress={() =>
                s.form({
                  title: 'Create project',
                  fields: [{ key: 'name', label: 'Project name', required: true }],
                  save: async (values) => {
                    const created = await s.api.request<{ path: string }>('/api/projects', 'POST', values);
                    s.setProject(created.path);
                    close();
                    s.home();
                  },
                })
              }
            />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 12, gap: 6 }}>
            <ResourceError
              error={home.error || active.error || projects.error || runs.error}
              retry={() => {
                home.refresh();
                active.refresh();
                projects.refresh();
                runs.refresh();
              }}
            />
            {(home.loading || active.loading) && <Loading />}
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                s.setProject('');
                close();
                s.home();
              }}
              style={[styles.row, { padding: 12 }]}
            >
              <Icon name="chat" />
              <Text style={styles.text}>All chats</Text>
            </Pressable>
            {paths.map((path) => {
              const chats = (runs.data || []).filter((run) => projectKey(run.projectPath) === projectKey(path));
              const name = path.split(/[\\/]/).pop() || path,
                filtered = chats.filter((run) => matches(run.goal));
              if (!matches(name) && !filtered.length) return null;
              const selected = projectKey(s.project) === projectKey(path),
                open = projectKey(expanded) === projectKey(path) || Boolean(search);
              return (
                <View key={path} style={{ gap: 4 }}>
                  <View style={[styles.row, { backgroundColor: selected ? '#292430' : 'transparent', borderRadius: 12, gap: 0 }]}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Select project ${name}`}
                      accessibilityState={{ selected }}
                      onPress={() => {
                        s.setProject(path);
                        setExpanded(path);
                      }}
                      style={[styles.row, { flex: 1, padding: 12 }]}
                    >
                      <Icon name="folder" color={selected ? colors.accent : colors.muted} />
                      <Text numberOfLines={2} style={[styles.text, { flex: 1 }]}>
                        {name}
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${open ? 'Collapse' : 'Expand'} ${name} chats`}
                      onPress={() => setExpanded(open ? '' : path)}
                      style={styles.iconButton}
                    >
                      <Icon name={open ? 'more' : 'plus'} size={18} />
                    </Pressable>
                  </View>
                  {open && (
                    <View style={{ paddingLeft: 20, gap: 5 }}>
                      {(search ? filtered : chats).map((run) => (
                        <Pressable
                          key={run.runId}
                          accessibilityRole="button"
                          onPress={() => {
                            s.setProject(path);
                            close();
                            s.go({ screen: 'chat', id: run.runId });
                          }}
                          style={[styles.row, { padding: 10, alignItems: 'flex-start' }]}
                        >
                          <Icon name="chat" size={17} />
                          <Text numberOfLines={2} style={[styles.muted, { flex: 1 }]}>
                            {run.goal}
                          </Text>
                        </Pressable>
                      ))}
                      {!chats.length && <Text style={[styles.muted, { padding: 10 }]}>No chats yet</Text>}
                      <Button
                        title={`New chat in ${name}`}
                        onPress={() => {
                          s.setProject(path);
                          close();
                          s.home();
                        }}
                      />
                    </View>
                  )}
                </View>
              );
            })}
            {(runs.data || [])
              .filter((run) => !run.projectPath && matches(run.goal))
              .map((run) => (
                <Pressable
                  key={run.runId}
                  accessibilityRole="button"
                  onPress={() => {
                    close();
                    s.go({ screen: 'chat', id: run.runId });
                  }}
                  style={[styles.row, { padding: 12 }]}
                >
                  <Icon name="chat" />
                  <Text numberOfLines={2} style={[styles.text, { flex: 1 }]}>
                    {run.goal}
                  </Text>
                </Pressable>
              ))}
          </ScrollView>
        </SafeAreaView>
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss projects" onPress={close} style={{ flex: 1 }} />
      </View>
    </Modal>
  );
}
