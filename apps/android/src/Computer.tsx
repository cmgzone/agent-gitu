import { useEffect, useState } from 'react';
import { Alert, AppState, Image, Text, View } from 'react-native';
import type { MobileServices } from './NativeWorkspace';
import { useResource } from './hooks';
import { Body, Button, Card, Empty, Loading, styles } from './ui';
import { ResourceError } from './chats';

interface ComputerState {
  state: string;
  useHostComputer: boolean;
  workspace?: string;
  error?: string;
}
export function Computer({ services: s, id }: { services: MobileServices; id: string }) {
  const base = `/api/cowork/agents/${id}/computer`;
  const resource = useResource<{ computer: ComputerState }>(s.api, base, 5000);
  const computer = resource.data?.computer;
  const [image, setImage] = useState(''),
    [ratio, setRatio] = useState(16 / 9),
    [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!computer || computer.useHostComputer || computer.state !== 'running') return;
    let live = true,
      pending = false;
    const controller = new AbortController();
    async function capture() {
      if (!live || pending || AppState.currentState === 'background') return;
      pending = true;
      try {
        const result = await s.api.request<{ pngBase64: string }>(base, 'POST', { action: 'desktop' }, controller.signal);
        if (!live) return;
        const uri = `data:image/png;base64,${result.pngBase64}`;
        setImage(uri);
        setError('');
        Image.getSize(
          uri,
          (width, height) => {
            if (live) setRatio(width / height);
          },
          () => {},
        );
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : 'Screen unavailable.');
      } finally {
        pending = false;
      }
    }
    void capture();
    const timer = setInterval(() => void capture(), 2500);
    const resume = AppState.addEventListener('change', (state) => {
      if (state === 'active') void capture();
    });
    return () => {
      live = false;
      controller.abort();
      clearInterval(timer);
      resume.remove();
    };
  }, [s.api, base, computer?.state, computer?.useHostComputer, revision]);
  return (
    <Body>
      <Text style={styles.title}>Computer</Text>
      <ResourceError
        error={resource.error || error}
        retry={() => {
          resource.refresh();
          setRevision((old) => old + 1);
        }}
      />
      {resource.loading && !computer && <Loading />}
      {computer?.useHostComputer ? (
        <>
          <Card>
            <Text style={styles.heading}>Connected computer</Text>
            <Text style={styles.muted}>Open the agent’s browser and workspace files on the computer running Agent Gitu.</Text>
            <Button primary title="Open live browser" onPress={() => s.go({ screen: 'browser', title: 'Live browser' })} />
            <Button title="Open workspace files" onPress={() => s.go({ screen: 'files', path: s.project })} />
          </Card>
          <Text style={styles.muted}>This connection shares the agent’s browser and files. It does not broadcast your entire computer screen.</Text>
        </>
      ) : (
        computer && (
          <>
            <Text style={styles.muted}>Private desktop · {computer.state.replace(/_/g, ' ')}</Text>
            {computer.error && <Text style={styles.muted}>{computer.error}</Text>}
            {image ? (
              <View style={{ borderRadius: 16, overflow: 'hidden', backgroundColor: '#19171c' }}>
                <Image accessibilityLabel="Live teammate desktop" source={{ uri: image }} style={{ width: '100%', aspectRatio: ratio }} resizeMode="contain" />
              </View>
            ) : (
              <Empty
                title={computer.state === 'running' ? 'Opening the live screen' : 'Start your teammate’s desktop'}
                detail="The screen updates while your teammate works. Rotate your phone for a larger view."
              />
            )}
            <View style={styles.wrap}>
              <Button
                primary
                title="Start desktop"
                disabled={['running', 'starting'].includes(computer.state)}
                onPress={() => void s.act(() => s.api.request(base, 'POST', { action: 'start' }), resource.refresh)}
              />
              <Button title="Refresh screen" disabled={computer.state !== 'running'} onPress={() => setRevision((old) => old + 1)} />
              <Button
                danger
                title="Stop desktop"
                disabled={computer.state !== 'running'}
                onPress={() =>
                  Alert.alert('Stop this desktop?', 'This also stops the teammate’s current task.', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Stop desktop', style: 'destructive', onPress: () => void s.act(() => s.api.request(base, 'POST', { action: 'stop' }), resource.refresh) },
                  ])
                }
              />
            </View>
          </>
        )
      )}
    </Body>
  );
}
