import { ChevronLeft, FileText, Folder, Save } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Button, Card, colors, ErrorNotice, s, Sheet } from '../ui';
import type { GituApi } from './client';
import type { FileListing, Project } from './types';

export function ProjectPicker({ projects, project, select }: { projects: Project[]; project: string; select: (path: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button icon={Folder} small onPress={() => setOpen(true)}>
        {projects.find((item) => item.path === project)?.name || 'Choose project'}
      </Button>
      {open && (
        <Sheet title="Choose a project" onClose={() => setOpen(false)}>
          {projects.map((item) => (
            <Pressable
              key={item.path}
              accessibilityRole="button"
              onPress={() => {
                select(item.path);
                setOpen(false);
              }}
              style={{ paddingVertical: 16 }}
            >
              <Text style={s.heading}>{item.name}</Text>
              <Text style={s.small}>{item.path}</Text>
            </Pressable>
          ))}
        </Sheet>
      )}
    </>
  );
}

export function Files({ api, projects, project, selectProject }: { api: GituApi; projects: Project[]; project: string; selectProject: (path: string) => void }) {
  const [path, setPath] = useState('');
  const [file, setFile] = useState<FileListing>();
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    setPath('');
    setFile(undefined);
  }, [project]);
  useEffect(() => {
    if (!project) return;
    const controller = new AbortController();
    setBusy(true);
    setError('');
    setFile(undefined);
    void api
      .files(project, path, controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) {
          setFile(next);
          setContent(next.content || '');
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Could not open this file.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [api, project, path, revision]);
  const parent = () => setPath((value) => value.split(/[\\/]/).slice(0, -1).join('/'));
  const save = async () => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      await api.saveFile(file, content);
      setConfirm(false);
      setRevision((value) => value + 1);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save your file.');
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  };
  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 22, gap: 16 }}>
      <View style={[s.between, { gap: 10 }]}>
        <Text style={s.title}>Project files</Text>
        <ProjectPicker projects={projects} project={project} select={selectProject} />
      </View>
      <Text style={s.muted}>Browse text files in your server’s project workspace.</Text>
      {!!path && (
        <Button small icon={ChevronLeft} onPress={parent}>
          Back to folder
        </Button>
      )}
      <Text selectable style={s.small}>
        {path || '/'}
      </Text>
      <ErrorNotice error={error} />
      {busy && <ActivityIndicator color={colors.blueDark} />}
      {!!error && <Button onPress={() => setRevision((value) => value + 1)}>Reload</Button>}
      {file?.entries?.map((entry) => (
        <Pressable
          key={entry.path}
          accessibilityRole="button"
          onPress={() => setPath(entry.path)}
          style={[s.row, { gap: 12, backgroundColor: colors.card, borderRadius: 16, padding: 16 }]}
        >
          {entry.directory ? <Folder size={20} color={colors.blueDark} /> : <FileText size={20} color={colors.muted} />}
          <Text style={s.text}>{entry.name}</Text>
        </Pressable>
      ))}
      {file?.entries?.length === 0 && (
        <Card>
          <Text style={s.muted}>This folder is empty.</Text>
        </Card>
      )}
      {file?.content !== undefined && (
        <>
          <Card>
            <TextInput
              accessibilityLabel="File contents"
              multiline
              editable={file.writable && !busy}
              value={content}
              onChangeText={setContent}
              autoCapitalize="none"
              autoCorrect={false}
              style={{ minHeight: 300, color: colors.text, fontFamily: 'monospace', fontSize: 13, lineHeight: 21, textAlignVertical: 'top' }}
            />
          </Card>
          <Button primary icon={Save} disabled={!file.writable || content === file.content || busy} onPress={() => setConfirm(true)}>
            Review changes
          </Button>
          {!file.writable && <Text style={s.small}>This workspace is read only.</Text>}
        </>
      )}
      {confirm && (
        <Sheet title="Save file changes?" subtitle={path} onClose={() => !busy && setConfirm(false)}>
          <Text style={s.muted}>This updates the file on your Gitu server. A file changed by another editor must be reloaded before saving.</Text>
          <Text selectable style={[s.text, { fontFamily: 'monospace', marginVertical: 16 }]}>
            {content}
          </Text>
          <Button primary busy={busy} onPress={() => void save()}>
            Save changes
          </Button>
        </Sheet>
      )}
    </ScrollView>
  );
}
