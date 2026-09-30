import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Body, Button, colors, Field, styles } from './ui';

export interface FormField {
  key: string;
  label: string;
  value?: string;
  multiline?: boolean;
  secret?: boolean;
  required?: boolean;
  placeholder?: string;
}
export interface FormSpec {
  title: string;
  fields: FormField[];
  submit?: string;
  save: (values: Record<string, string>) => Promise<void>;
}
export function FormSheet({ spec, close }: { spec: FormSpec; close: () => void }) {
  const [values, setValues] = useState<Record<string, string>>(Object.fromEntries(spec.fields.map((field) => [field.key, field.value || ''])));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function save() {
    const missing = spec.fields.find((field) => field.required && !values[field.key]?.trim());
    if (missing) {
      setError(`Enter ${missing.label.toLowerCase()}.`);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await spec.save(values);
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save this change.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      animationType="slide"
      onRequestClose={() => {
        if (!busy) close();
      }}
    >
      <SafeAreaView style={styles.fill}>
        <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.header}>
            <Text style={[styles.heading, { flex: 1 }]}>{spec.title}</Text>
            <Button title="Close" disabled={busy} onPress={close} />
          </View>
          <Body>
            {spec.fields.map((field) => (
              <Field
                key={field.key}
                label={field.label}
                value={values[field.key] || ''}
                onChange={(value) => setValues((old) => ({ ...old, [field.key]: value }))}
                multiline={field.multiline}
                secret={field.secret}
                placeholder={field.placeholder}
              />
            ))}
            {error ? (
              <Text accessibilityRole="alert" style={{ color: colors.danger }}>
                {error}
              </Text>
            ) : null}
            <Button primary title={busy ? 'Saving…' : spec.submit || 'Save'} disabled={busy} onPress={() => void save()} />
          </Body>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
export function Toggle({ title, detail, value, onChange }: { title: string; detail?: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.text}>{title}</Text>
        {detail && <Text style={styles.muted}>{detail}</Text>}
      </View>
      <Switch accessibilityLabel={title} value={value} onValueChange={onChange} trackColor={{ false: colors.border, true: colors.accent }} />
    </View>
  );
}
