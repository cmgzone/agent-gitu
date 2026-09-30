import { useState } from 'react';
import { Text, View } from 'react-native';
import type { MobileServices } from './NativeWorkspace';
import { Button, Card, Field, styles } from './ui';
export function QuestionCard({
  id,
  questions,
  services: s,
  refresh,
}: {
  id: string;
  questions: { question: string; options: string[] }[];
  services: MobileServices;
  refresh: () => void;
}) {
  const [answers, setAnswers] = useState<Record<number, string>>({}),
    [sending, setSending] = useState(false);
  return (
    <Card>
      <Text style={styles.heading}>Your input is needed</Text>
      {questions.map((question, index) => (
        <View key={index} style={{ gap: 10 }}>
          <Text style={styles.text}>{question.question}</Text>
          <View style={styles.wrap}>
            {question.options.map((option) => (
              <Button key={option} primary={answers[index] === option} title={option} disabled={sending} onPress={() => setAnswers((old) => ({ ...old, [index]: option }))} />
            ))}
          </View>
          <Field
            label={questions.length > 1 ? `Your answer ${index + 1}` : 'Your answer'}
            placeholder="Choose an option or write your answer"
            multiline
            value={answers[index] || ''}
            onChange={(value) => setAnswers((old) => ({ ...old, [index]: value }))}
          />
        </View>
      ))}
      <Button
        primary
        disabled={sending || questions.some((_, index) => !answers[index]?.trim())}
        title={sending ? 'Sending…' : 'Send answers'}
        onPress={() => {
          setSending(true);
          void s
            .act(
              () =>
                s.api.request(`/api/answers/${id}`, 'POST', {
                  answer: questions.map((question, index) => (questions.length === 1 ? answers[index].trim() : `${question.question}\n${answers[index].trim()}`)).join('\n\n'),
                }),
              refresh,
            )
            .finally(() => setSending(false));
        }}
      />
    </Card>
  );
}
