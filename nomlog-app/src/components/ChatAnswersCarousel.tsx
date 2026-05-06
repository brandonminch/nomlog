import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Keyboard,
  type TextInputSubmitEditingEventData,
  type NativeSyntheticEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Pencil } from 'lucide-react-native';

export type ChatAnswersCarouselQuestion = {
  id: string;
  text: string;
  suggestions?: string[] | null;
};

export type ChatAnswersCarouselAnswer = {
  questionId: string;
  question: string;
  answer: string;
};

type Props = {
  questions: ChatAnswersCarouselQuestion[];
  bottom: number;
  onHeight?: (height: number) => void;
  onClose: () => void;
  onComplete: (answers: ChatAnswersCarouselAnswer[]) => void;
};

function clampSuggestions(suggestions: string[] | null | undefined): string[] {
  const src = Array.isArray(suggestions) ? suggestions : [];
  return src
    .filter((s) => typeof s === 'string' && s.trim().length > 0)
    .filter((s) => {
      const normalized = s.trim().toLowerCase().replace(/[\s_\-()/:.]+/g, '');
      return (
        normalized !== 'other' &&
        normalized !== 'others' &&
        !normalized.startsWith('otherspecify') &&
        normalized !== 'somethingelse' &&
        normalized !== 'anythingelse' &&
        normalized !== 'custom'
      );
    })
    .slice(0, 5);
}

export function ChatAnswersCarousel({ questions, bottom, onHeight, onClose, onComplete }: Props) {
  const [index, setIndex] = useState(0);
  const [answersById, setAnswersById] = useState<Record<string, string>>({});
  const [customValue, setCustomValue] = useState('');
  const inputRef = useRef<TextInput | null>(null);

  const safeQuestions = useMemo(() => (Array.isArray(questions) ? questions : []), [questions]);
  const count = safeQuestions.length;
  const current = safeQuestions[index] ?? null;

  const goTo = useCallback(
    (nextIndex: number) => {
      if (count === 0) return;
      const clamped = Math.max(0, Math.min(count - 1, nextIndex));
      setIndex(clamped);
      setCustomValue('');
    },
    [count],
  );

  const buildAnswersFromMap = useCallback(
    (map: Record<string, string>): ChatAnswersCarouselAnswer[] => {
      return safeQuestions
        .map((q) => ({
          questionId: q.id,
          question: q.text,
          answer: (map[q.id] ?? '').trim(),
        }))
        .filter((qa) => qa.answer.length > 0);
    },
    [safeQuestions],
  );

  const firstUnansweredIndexForMap = useCallback(
    (map: Record<string, string>): number => {
      for (let i = 0; i < safeQuestions.length; i += 1) {
        const q = safeQuestions[i];
        const a = map[q.id];
        if (!a || !a.trim()) return i;
      }
      return -1;
    },
    [safeQuestions],
  );

  const isAllAnsweredForMap = useCallback(
    (map: Record<string, string>): boolean => {
      if (count === 0) return false;
      return safeQuestions.every((q) => {
        const a = map[q.id];
        return typeof a === 'string' && a.trim().length > 0;
      });
    },
    [count, safeQuestions],
  );

  const recordAndAdvance = useCallback(
    (questionId: string, answer: string) => {
      const trimmed = answer.trim();
      if (!trimmed || count === 0) return;

      const nextMap = { ...answersById, [questionId]: trimmed };
      setAnswersById(nextMap);

      const nextIndex = index + 1;
      if (nextIndex < count) {
        goTo(nextIndex);
        return;
      }

      if (!isAllAnsweredForMap(nextMap)) {
        const firstMissing = firstUnansweredIndexForMap(nextMap);
        if (firstMissing >= 0) goTo(firstMissing);
        return;
      }

      Keyboard.dismiss();
      onComplete(buildAnswersFromMap(nextMap));
    },
    [
      answersById,
      buildAnswersFromMap,
      count,
      firstUnansweredIndexForMap,
      goTo,
      index,
      isAllAnsweredForMap,
      onComplete,
    ],
  );

  const handleTapSuggestion = useCallback(
    (suggestion: string) => {
      if (!current) return;
      recordAndAdvance(current.id, suggestion);
    },
    [current, recordAndAdvance],
  );

  const handleSubmitCustom = useCallback(() => {
    if (!current) return;
    const trimmed = customValue.trim();
    if (!trimmed) return;
    setCustomValue('');
    recordAndAdvance(current.id, trimmed);
  }, [customValue, current, recordAndAdvance]);

  const handleCustomSubmitEditing = useCallback(
    (_e: NativeSyntheticEvent<TextInputSubmitEditingEventData>) => {
      handleSubmitCustom();
    },
    [handleSubmitCustom],
  );

  const canGoPrev = index > 0;
  const canGoNext = index < count - 1;
  const suggestions = useMemo(() => clampSuggestions(current?.suggestions), [current?.suggestions]);

  if (!current || count === 0) return null;

  return (
    <View
      style={[styles.shell, { bottom }]}
      onLayout={(e) => {
        onHeight?.(e.nativeEvent.layout.height);
      }}
    >
      <View style={styles.headerRow}>
        <TouchableOpacity
          style={[styles.iconButton, !canGoPrev && styles.iconButtonDisabled]}
          onPress={() => goTo(index - 1)}
          disabled={!canGoPrev}
          accessibilityRole="button"
          accessibilityLabel="Previous question"
        >
          <Ionicons name="chevron-back" size={18} color={canGoPrev ? '#364153' : '#cbd5e1'} />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>
          {index + 1} of {count}
        </Text>

        <View style={styles.headerRight}>
          <TouchableOpacity
            style={[styles.iconButton, !canGoNext && styles.iconButtonDisabled]}
            onPress={() => goTo(index + 1)}
            disabled={!canGoNext}
            accessibilityRole="button"
            accessibilityLabel="Next question"
          >
            <Ionicons name="chevron-forward" size={18} color={canGoNext ? '#364153' : '#cbd5e1'} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.iconButton, styles.closeButton]}
            onPress={() => {
              Keyboard.dismiss();
              onClose();
            }}
            accessibilityRole="button"
            accessibilityLabel="Close clarifying questions"
          >
            <Ionicons name="close" size={18} color="#364153" />
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.questionText}>{current.text}</Text>

      <View style={styles.suggestionsList}>
        {suggestions.map((s, i) => (
          <TouchableOpacity
            key={s}
            style={styles.suggestionRow}
            onPress={() => handleTapSuggestion(s)}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={`Answer: ${s}`}
          >
            <View style={styles.suggestionNumberPill}>
              <Text style={styles.suggestionRowNumber}>{i + 1}</Text>
            </View>
            <Text style={styles.suggestionRowText}>{s}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.customRow}>
        <View style={styles.customIconPill} pointerEvents="none">
          <Pencil size={14} color="#6a7282" strokeWidth={2} />
        </View>
        <TextInput
          ref={(r) => {
            inputRef.current = r;
          }}
          value={customValue}
          onChangeText={setCustomValue}
          placeholder="Something else..."
          placeholderTextColor="#9ca3af"
          style={styles.customInput}
          returnKeyType="send"
          blurOnSubmit={false}
          onSubmitEditing={handleCustomSubmitEditing}
          autoCorrect
          autoCapitalize="sentences"
        />
        <TouchableOpacity
          style={[styles.sendButton, !customValue.trim() && styles.sendButtonDisabled]}
          onPress={handleSubmitCustom}
          disabled={!customValue.trim()}
          accessibilityRole="button"
          accessibilityLabel="Submit custom answer"
        >
          <Ionicons name="send" size={14} color="#ffffff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 0,
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 5,
    zIndex: 1000,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  headerTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    color: '#101828',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonDisabled: {
    backgroundColor: '#f8fafc',
  },
  closeButton: {
    backgroundColor: '#eef2ff',
  },
  questionText: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600',
    color: '#101828',
    marginBottom: 10,
  },
  suggestionsList: {
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    marginBottom: 10,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  suggestionNumberPill: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionRowNumber: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '500',
    color: '#111827',
    opacity: 0.8,
    textAlign: 'center',
  },
  suggestionRowText: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '500',
    color: '#111827',
    flex: 1,
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 2,
  },
  customIconPill: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  customInput: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    borderWidth: 0,
    paddingHorizontal: 12,
    fontSize: 16,
    color: '#101828',
    backgroundColor: '#ffffff',
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#d1d5dc',
  },
});

