import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Keyboard,
  TouchableWithoutFeedback,
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { usePostHog } from 'posthog-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckCircle2 } from 'lucide-react-native';
import { useUserProfile, type PrimaryGoal } from '../hooks/useUserProfile';
import { useOnboardingFlow } from '../hooks/useOnboardingFlow';
import { OnboardingInputBar } from '../components/OnboardingInputBar';
import { useChatAutoscroll } from '../hooks/useChatAutoscroll';
import { OnboardingReviewSummary } from '../components/OnboardingReviewSummary';
import { SummaryOptionPicker } from '../components/SummaryOptionPicker';
import { SummaryWheelPicker } from '../components/SummaryWheelPicker';
import { DateOfBirthPickerModal } from '../components/DateOfBirthPickerModal';
import { useOnboardingMutations } from '../hooks/useOnboardingMutations';
import { patchWithOptionalNutritionRecalc } from '../lib/nutritionRecalcPrompt';
import { formatDateOfBirthDisplay } from '../lib/ageFromDateOfBirth';

type GoalOption = {
  id: PrimaryGoal;
  label: string;
  description: string;
};

const GOAL_OPTIONS: GoalOption[] = [
  {
    id: 'lose_weight',
    label: 'Lose weight',
    description: 'Create a gentle calorie deficit to steadily drop weight.',
  },
  {
    id: 'maintain_weight',
    label: 'Maintain weight',
    description: 'Stay around your current weight with balanced nutrition.',
  },
  {
    id: 'build_muscle',
    label: 'Build muscle',
    description: 'Eat to support strength and muscle gain over time.',
  },
  {
    id: 'track_intake',
    label: 'Track my intake',
    description: 'Simply see what you eat and how it adds up each day.',
  },
  {
    id: 'training_event',
    label: 'Training for an event',
    description: 'Fuel consistently for a race, competition, or big goal.',
  },
];

type BotMessageProps = {
  text: string;
  active: boolean;
  animate: boolean;
  onDone?: () => void;
};

const BotMessage: React.FC<BotMessageProps> = ({ text, active, animate, onDone }) => {
  const [displayed, setDisplayed] = useState('');
  const hasCalledDoneRef = useRef(false);
  const onDoneRef = useRef<(() => void) | undefined>(undefined);

  // Keep latest onDone in a ref so the animation effect doesn't depend on it.
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    // If we're not animating this message, or it's not the active one,
    // always show full text immediately without running the streaming animation.
    if (!animate || !active) {
      setDisplayed(text);
      return;
    }

    // Active + animate: run streaming animation from empty.
    setDisplayed('');
    hasCalledDoneRef.current = false;
    if (!text) return;

    const totalChars = text.length;
    const durationMs = Math.max(300, Math.min(800, totalChars * 16));
    const start = Date.now();

    const easeOutQuad = (t: number) => 1 - (1 - t) * (1 - t);

    const tick = () => {
      const elapsed = Date.now() - start;
      const t = Math.min(1, elapsed / durationMs);
      const eased = easeOutQuad(t);
      const charsToShow = Math.max(1, Math.floor(eased * totalChars));
      setDisplayed(text.slice(0, charsToShow));

      if (t < 1) {
        requestAnimationFrame(tick);
      } else if (!hasCalledDoneRef.current) {
        hasCalledDoneRef.current = true;
        onDoneRef.current?.();
      }
    };

    const id = requestAnimationFrame(tick);
    return () => {
      hasCalledDoneRef.current = true;
      cancelAnimationFrame(id);
    };
  }, [text, animate, active]);

  return <Text style={styles.botText}>{displayed}</Text>;
};

export const OnboardingScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { data: profile } = useUserProfile();
  const router = useRouter();
  const posthog = usePostHog();
  const { patchStats } = useOnboardingMutations();

  const {
    step,
    preferredName,
    selectedGoal,
    dateOfBirthIso,
    height,
    weight,
    biologicalSex,
    activityLevel,
    nameError,
    goalError,
    hasName,
    hasCompletedName,
    isBotStreaming,
    activeBotKey,
    isSavingProfile,
    isSavingStats,
    isSummaryReady,
    setPreferredName,
    setDateOfBirthIso,
    setHeight,
    setWeight,
    setNameError,
    setGoalError,
    handleNameContinue,
    handleStatsContinue,
    handleSexSelect,
    setIsBotStreaming,
    setActiveBotKey,
    handleActivitySelect,
    handleGoalSelect,
    handleCompleteFromSummary,
    setSelectedGoal,
    setBiologicalSex,
    setActivityLevel,
  } = useOnboardingFlow(profile ?? null);
  const [editingSummaryField, setEditingSummaryField] = useState<
    'name' | 'age' | 'height' | 'weight' | null
  >(null);
  const [pickerField, setPickerField] = useState<
    'goal' | 'sex' | 'activity' | 'age' | 'height' | 'weight' | null
  >(null);
  const autoscrollKey = isSummaryReady ? null : activeBotKey;
  const { scrollViewRef, scrollContentRef, activeMessageRef, handleScrollLayout, handleContentSizeChange } =
    useChatAutoscroll({ activeBotKey: autoscrollKey, bottomInset: insets.bottom });

  const handleStartSummaryEdit = (field: 'name' | 'age' | 'height' | 'weight') => {
    setEditingSummaryField(field);
  };

  const handleSubmitSummaryEdit = async (field: 'name' | 'age' | 'height' | 'weight', value: string) => {
    if (field === 'name') {
      setPreferredName(value);
    } else if (field === 'age') {
      setDateOfBirthIso(value);
    } else if (field === 'height') {
      setHeight(value);
    } else if (field === 'weight') {
      setWeight(value);
    }
    setEditingSummaryField(null);
    Keyboard.dismiss();
  };

  const handleCancelSummaryEdit = () => {
    setEditingSummaryField(null);
    Keyboard.dismiss();
  };

  // When the summary view is active, disable bot auto-scrolling so the top
  // summary message stays pinned at the top after reload.
  useEffect(() => {
    if (isSummaryReady) {
      setIsBotStreaming(false);
      setActiveBotKey(null);
    }
  }, [isSummaryReady, setIsBotStreaming, setActiveBotKey]);

  // Hydration and step-to-bot mapping now live in useOnboardingFlow

  const renderBotBubble = (key: string, textOrLines: string | string[], animate: boolean = true) => {
    const fullText = Array.isArray(textOrLines) ? textOrLines.join('\n\n') : textOrLines;
    const isActive = activeBotKey === key;
    return (
      <View ref={isActive ? activeMessageRef : undefined} style={styles.botTextBlock}>
        <BotMessage
          text={fullText}
          active={activeBotKey === key}
          animate={animate}
          onDone={() => {
            if (activeBotKey === key) {
              setIsBotStreaming(false);
              setActiveBotKey(null);
            }
          }}
        />
      </View>
    );
  };

  const renderGoalOption = (option: GoalOption) => {
    const isSelected = selectedGoal === option.id;
    return (
      <TouchableOpacity
        key={option.id}
        style={[styles.goalOption, isSelected && styles.goalOptionSelected]}
        onPress={() => {
          void handleGoalSelect(option.id);
        }}
        activeOpacity={0.9}
      >
        <View style={styles.goalHeaderRow}>
          <Text style={styles.goalLabel}>{option.label}</Text>
          {isSelected && <CheckCircle2 size={22} color="#000000" />}
        </View>
        <Text style={styles.goalDescription}>{option.description}</Text>
      </TouchableOpacity>
    );
  };

  const goalLabel = useMemo(
    () => GOAL_OPTIONS.find((g) => g.id === selectedGoal)?.label ?? null,
    [selectedGoal]
  );

  const heightUnit = profile?.preferred_height_unit ?? 'ft_in';
  const weightUnit = profile?.preferred_weight_unit ?? 'lbs';

  const heightOptions = useMemo(() => {
    if (heightUnit === 'cm') {
      // 140–210 cm
      const opts = [];
      for (let cm = 140; cm <= 210; cm += 1) {
        const label = `${cm} cm`;
        opts.push({ id: label, label });
      }
      return opts;
    }

    // Default to feet/inches: 4'0"–7'0"
    const opts = [];
    for (let totalInches = 48; totalInches <= 84; totalInches += 1) {
      const feet = Math.floor(totalInches / 12);
      const inches = totalInches - feet * 12;
      const label = `${feet}'${inches}"`;
      opts.push({ id: label, label });
    }
    return opts;
  }, [heightUnit]);

  const weightOptions = useMemo(() => {
    if (weightUnit === 'kg') {
      // 40–200 kg
      const opts = [];
      for (let kg = 40; kg <= 200; kg += 1) {
        const label = `${kg} kg`;
        opts.push({ id: label, label });
      }
      return opts;
    }

    // Default to pounds: 80–400 lbs in 5 lb steps
    const opts = [];
    for (let lbs = 80; lbs <= 400; lbs += 5) {
      const label = `${lbs} lbs`;
      opts.push({ id: label, label });
    }
    return opts;
  }, [weightUnit]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <ScrollView
        ref={scrollViewRef}
        style={styles.scroll}
        onLayout={(e) => {
          handleScrollLayout(e.nativeEvent.layout.height);
        }}
        onContentSizeChange={(_w, h) => {
          handleContentSizeChange(_w, h);
        }}
        contentContainerStyle={[
          styles.scrollContent,
          {
            // Base padding to account for the floating input bar when the

            paddingBottom: insets.bottom + 440,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View ref={scrollContentRef} style={styles.stepContainer} collapsable={false}>
          {/* Show main onboarding flow until user has completed onboarding and the summary is ready */}
          {!profile?.has_completed_onboarding && !isSummaryReady && (
            <>
              {renderBotBubble(
                'intro',
                "Hey there! 👋\n\nWelcome to Nomlog. We want to help you track your meals in the most intuitive way possible.\n\nLet's get to know each other a bit.\n\nWhat should I call you? Feel free to use your first name, a nickname, or whatever you prefer!"
              )}

              {/* Only show the name bubble after the name step is completed.
                 During typing on the name step, we keep the chat transcript static. */}
              {hasName && step !== 'name' && (
                <>
                  <View style={styles.userRow}>
                    <View style={styles.userBubble}>
                      <Text style={styles.userText}>{preferredName.trim()}</Text>
                    </View>
                  </View>
                </>
              )}

              {/* Goal selection – show once name is complete; cards appear after prompt finishes streaming and then persist */}
              {hasCompletedName && (
                <>
                  {renderBotBubble(
                    'goalPrompt',
                    (preferredName.trim() || profile?.display_name)
                      ? `Nice to meet you, ${preferredName.trim()}! 🎉, what's your main goal right now?`
                      : "What's your main goal right now?"
                  )}
                  <Text style={styles.goalIntroText}>
                    Pick the one that feels most true right now.
                  </Text>
                  <View style={styles.goalList}>{GOAL_OPTIONS.map(renderGoalOption)}</View>
                  {goalError ? <Text style={styles.errorText}>{goalError}</Text> : null}
                </>
              )}

              {/* After goal is chosen, progress through age/height/weight, then sex/activity */}
              {goalLabel && (
                <>
                  {renderBotBubble('age', [
                    "Great! Let's gather some more information to tailor your experience.",
                    "What's your date of birth?",
                  ])}
                  {step === 'age' && goalError && (
                    <Text style={styles.errorText}>{goalError}</Text>
                  )}

                  {step !== 'age' && dateOfBirthIso.trim().length > 0 && (
                    <>
                      <View style={styles.userRow}>
                        <View style={styles.userBubble}>
                          <Text style={styles.userText}>
                            {formatDateOfBirthDisplay(dateOfBirthIso.trim())}
                          </Text>
                        </View>
                      </View>
                      {renderBotBubble('height', [
                        "What's your height?",
                        "You can enter in feet and inches (like 5'10\") or centimeters (like 178cm) – whatever works for you!",
                      ])}
                      {step === 'height' && goalError && (
                        <Text style={styles.errorText}>{goalError}</Text>
                      )}
                    </>
                  )}

                  {step !== 'height' && height.trim().length > 0 && (
                    <>
                      <View style={styles.userRow}>
                        <View style={styles.userBubble}>
                          <Text style={styles.userText}>{height.trim()}</Text>
                        </View>
                      </View>
                      {renderBotBubble('weight', [
                        "Great! Now, let's get your weight.",
                        'You can enter in pounds (like 150 lbs) or kilograms (like 68 kg) – whatever you prefer!',
                      ])}
                      {step === 'weight' && goalError && (
                        <Text style={styles.errorText}>{goalError}</Text>
                      )}
                    </>
                  )}

                  {step !== 'weight' && weight.trim().length > 0 && (
                    <>
                      <View style={styles.userRow}>
                        <View style={styles.userBubble}>
                          <Text style={styles.userText}>{weight.trim()}</Text>
                        </View>
                      </View>
                      {renderBotBubble(
                        'sexPrompt',
                        'I use biological sex plus your stats to make the calorie estimate more accurate. Which option fits best?'
                      )}
                      {!isBotStreaming && (
                        <>
                          <View style={styles.goalList}>
                            <TouchableOpacity
                              style={[
                                styles.goalOption,
                                biologicalSex === 'male' && styles.goalOptionSelected,
                              ]}
                              onPress={() => void handleSexSelect('male')}
                              activeOpacity={0.9}
                            >
                              <View style={styles.goalHeaderRow}>
                                <Text style={styles.goalLabel}>Male</Text>
                                {biologicalSex === 'male' && <CheckCircle2 size={22} color="#000000" />}
                              </View>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[
                                styles.goalOption,
                                biologicalSex === 'female' && styles.goalOptionSelected,
                              ]}
                              onPress={() => void handleSexSelect('female')}
                              activeOpacity={0.9}
                            >
                              <View style={styles.goalHeaderRow}>
                                <Text style={styles.goalLabel}>Female</Text>
                                {biologicalSex === 'female' && (
                                  <CheckCircle2 size={22} color="#000000" />
                                )}
                              </View>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[
                                styles.goalOption,
                                biologicalSex === 'prefer_not_to_say' &&
                                  styles.goalOptionSelected,
                              ]}
                              onPress={() => void handleSexSelect('prefer_not_to_say')}
                              activeOpacity={0.9}
                            >
                              <View style={styles.goalHeaderRow}>
                                <Text style={styles.goalLabel}>Prefer not to say</Text>
                                {biologicalSex === 'prefer_not_to_say' && (
                                  <CheckCircle2 size={22} color="#000000" />
                                )}
                              </View>
                            </TouchableOpacity>
                          </View>
                          {goalError && <Text style={styles.errorText}>{goalError}</Text>}
                        </>
                      )}
                    </>
                  )}

                  {biologicalSex && step !== 'weight' && weight.trim().length > 0 && (
                    <>
                      {renderBotBubble(
                        'activityPrompt',
                        "Next, how active are you day-to-day? This helps estimate how much energy you use."
                      )}
                      <View style={styles.goalList}>
                        <TouchableOpacity
                          style={[
                            styles.goalOption,
                            activityLevel === 'sedentary' && styles.goalOptionSelected,
                          ]}
                          onPress={() => void handleActivitySelect('sedentary')}
                          activeOpacity={0.9}
                        >
                          <View style={styles.goalHeaderRow}>
                            <Text style={styles.goalLabel}>Sedentary</Text>
                            {activityLevel === 'sedentary' && <CheckCircle2 size={22} color="#000000" />}
                          </View>
                          <Text style={styles.goalDescription}>
                            Mostly sitting, little to no exercise.
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.goalOption,
                            activityLevel === 'lightly_active' && styles.goalOptionSelected,
                          ]}
                          onPress={() => void handleActivitySelect('lightly_active')}
                          activeOpacity={0.9}
                        >
                          <View style={styles.goalHeaderRow}>
                            <Text style={styles.goalLabel}>Lightly active</Text>
                            {activityLevel === 'lightly_active' && <CheckCircle2 size={22} color="#000000" />}
                          </View>
                          <Text style={styles.goalDescription}>
                            Light exercise 1–3 days/week.
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.goalOption,
                            activityLevel === 'moderately_active' && styles.goalOptionSelected,
                          ]}
                          onPress={() => void handleActivitySelect('moderately_active')}
                          activeOpacity={0.9}
                        >
                          <View style={styles.goalHeaderRow}>
                            <Text style={styles.goalLabel}>Moderately active</Text>
                            {activityLevel === 'moderately_active' && <CheckCircle2 size={22} color="#000000" />}
                          </View>
                          <Text style={styles.goalDescription}>
                            Moderate exercise 3–5 days/week.
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.goalOption,
                            activityLevel === 'very_active' && styles.goalOptionSelected,
                          ]}
                          onPress={() => void handleActivitySelect('very_active')}
                          activeOpacity={0.9}
                        >
                          <View style={styles.goalHeaderRow}>
                            <Text style={styles.goalLabel}>Very active</Text>
                            {activityLevel === 'very_active' && <CheckCircle2 size={22} color="#000000" />}
                          </View>
                          <Text style={styles.goalDescription}>
                            Hard exercise 6–7 days/week.
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.goalOption,
                            activityLevel === 'extremely_active' && styles.goalOptionSelected,
                          ]}
                          onPress={() => void handleActivitySelect('extremely_active')}
                          activeOpacity={0.9}
                        >
                          <View style={styles.goalHeaderRow}>
                            <Text style={styles.goalLabel}>Extra active</Text>
                            {activityLevel === 'extremely_active' && <CheckCircle2 size={22} color="#000000" />}
                          </View>
                          <Text style={styles.goalDescription}>
                            Very hard exercise or physical job.
                          </Text>
                        </TouchableOpacity>
                      </View>
                      {goalError && <Text style={styles.errorText}>{goalError}</Text>}
                    </>
                  )}
                </>
              )}
            </>
          )}

          {/* Summary view – disable chat autoscroll and allow tap-outside to cancel inline edits */}
          {isSummaryReady && (
            <TouchableWithoutFeedback
              onPress={() => {
                if (editingSummaryField) {
                  handleCancelSummaryEdit();
                }
              }}
              accessible={false}
            >
              <View>
                <OnboardingReviewSummary
                  profile={profile}
                  preferredName={preferredName}
                  goalLabel={goalLabel}
                  biologicalSex={biologicalSex}
                  activityLevel={activityLevel}
                  dateOfBirthIso={dateOfBirthIso}
                  heightInput={height}
                  weightInput={weight}
                  editingField={editingSummaryField}
                  isSavingProfile={isSavingProfile}
                  isSavingStats={isSavingStats}
                  onStartEdit={handleStartSummaryEdit}
                  onSubmitEdit={handleSubmitSummaryEdit}
                  onCancelEdit={handleCancelSummaryEdit}
                  onStartSelectEdit={(field) => {
                    setPickerField(field);
                    setEditingSummaryField(null);
                    Keyboard.dismiss();
                  }}
                  onComplete={async () => {
                    try {
                      await handleCompleteFromSummary();
                      posthog.capture('onboarding_completed', {
                        goal: selectedGoal,
                        activity_level: activityLevel,
                        biological_sex: biologicalSex,
                      });
                      router.replace('/(tabs)/meal-logs');
                    } catch {
                      // error surfaced via goalError / nameError; stay on summary
                    }
                  }}
                />
              </View>
            </TouchableWithoutFeedback>
          )}
        </View>
      </ScrollView>

      {/* Bottom input bar: onboarding-specific component styled like chat input. */}
      {(step === 'height' || step === 'weight' || (step === 'name' && !profile?.display_name)) &&
        !isBotStreaming && (
        <OnboardingInputBar
          value={
            step === 'name'
              ? preferredName
              : step === 'height'
              ? height
              : weight
          }
          onChange={(text) => {
            if (step === 'name') {
              setPreferredName(text);
              if (nameError) setNameError(null);
            } else if (step === 'height') {
              setHeight(text);
              if (goalError) setGoalError(null);
            } else if (step === 'weight') {
              setWeight(text);
              if (goalError) setGoalError(null);
            }
          }}
          onSubmit={() => {
            if (step === 'name') {
              handleNameContinue();
            } else if (step === 'height' || step === 'weight') {
              void handleStatsContinue();
            }
          }}
          isPending={isSavingProfile || isSavingStats || isBotStreaming}
          onSkip={undefined}
          placeholder={
            step === 'name'
              ? 'Your name...'
              : step === 'height'
              ? "e.g., 5'10\" or 178cm"
              : 'e.g., 150 lbs or 68 kg'
          }
          keyboardType="default"
          autoFocus
        />
      )}

      {step === 'age' && !isBotStreaming && (
        <View style={[styles.dobBar, { paddingBottom: insets.bottom + 16 }]}>
          <DateTimePicker
            value={(() => {
              if (dateOfBirthIso && /^\d{4}-\d{2}-\d{2}$/.test(dateOfBirthIso)) {
                const [y, m, d] = dateOfBirthIso.split('-').map(Number);
                return new Date(y, m - 1, d);
              }
              const d = new Date();
              d.setFullYear(d.getFullYear() - 25);
              return d;
            })()}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(_, d) => {
              if (!d) return;
              const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
              setDateOfBirthIso(iso);
              if (goalError) setGoalError(null);
            }}
            maximumDate={new Date()}
            minimumDate={new Date(1920, 0, 1)}
          />
          <TouchableOpacity
            style={styles.dobContinue}
            activeOpacity={0.9}
            disabled={isSavingStats}
            onPress={() => void handleStatsContinue()}
          >
            <Text style={styles.dobContinueText}>Continue</Text>
          </TouchableOpacity>
        </View>
      )}

      <DateOfBirthPickerModal
        visible={pickerField === 'age'}
        initialIso={dateOfBirthIso || profile?.date_of_birth || ''}
        onClose={() => setPickerField(null)}
        onConfirm={async (iso) => {
          setDateOfBirthIso(iso);
          await patchWithOptionalNutritionRecalc(profile ?? null, (recalc) =>
            patchStats({ date_of_birth: iso, recalculate_nutrition_targets: recalc })
          );
        }}
      />
      <SummaryWheelPicker
        visible={pickerField === 'height'}
        title="Select height"
        options={heightOptions}
        selectedId={
          heightOptions.find((opt) => opt.id === height.trim())?.id ?? null
        }
        onSelect={(id) => {
          setHeight(id);
          void patchWithOptionalNutritionRecalc(profile ?? null, (recalc) =>
            patchStats({ height_input: id, recalculate_nutrition_targets: recalc })
          );
        }}
        onClose={() => setPickerField(null)}
      />
      <SummaryWheelPicker
        visible={pickerField === 'weight'}
        title="Select weight"
        options={weightOptions}
        selectedId={
          weightOptions.find((opt) => opt.id === weight.trim())?.id ?? null
        }
        onSelect={(id) => {
          setWeight(id);
          void patchWithOptionalNutritionRecalc(profile ?? null, (recalc) =>
            patchStats({ weight_input: id, recalculate_nutrition_targets: recalc })
          );
        }}
        onClose={() => setPickerField(null)}
      />
      <SummaryWheelPicker
        visible={pickerField === 'goal'}
        title="Select goal"
        options={GOAL_OPTIONS.map((opt) => ({ id: opt.id, label: opt.label }))}
        selectedId={selectedGoal}
        onSelect={(id) => void handleGoalSelect(id as PrimaryGoal)}
        onClose={() => setPickerField(null)}
      />
      <SummaryWheelPicker
        visible={pickerField === 'sex'}
        title="Select biological sex"
        options={[
          { id: 'male', label: 'Male' },
          { id: 'female', label: 'Female' },
          { id: 'prefer_not_to_say', label: 'Prefer not to say' },
        ]}
        selectedId={biologicalSex}
        onSelect={(id) => void handleSexSelect(id as any)}
        onClose={() => setPickerField(null)}
      />
      <SummaryWheelPicker
        visible={pickerField === 'activity'}
        title="Select activity level"
        options={[
          { id: 'sedentary', label: 'Sedentary' },
          { id: 'lightly_active', label: 'Lightly active' },
          { id: 'moderately_active', label: 'Moderately active' },
          { id: 'very_active', label: 'Very active' },
          { id: 'extremely_active', label: 'Extra active' },
        ]}
        selectedId={activityLevel}
        onSelect={(id) => void handleActivitySelect(id as any)}
        onClose={() => setPickerField(null)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
    paddingHorizontal: 16,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: 16,
  },
  stepContainer: {
    gap: 16,
  },
  botTextBlock: {
    paddingRight: 32,
  },
  botText: {
    fontSize: 14,
    color: '#111827',
    lineHeight: 20,
  },
  metaText: {
    fontSize: 12,
    color: '#6b7280',
  },
  userRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  userBubble: {
    maxWidth: '80%',
    backgroundColor: '#111827',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userText: {
    fontSize: 14,
    color: '#ffffff',
    lineHeight: 20,
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
  secondaryButton: {
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  secondaryButtonText: {
    fontSize: 14,
    color: '#6b7280',
  },
  errorText: {
    fontSize: 12,
    color: '#b91c1c',
  },
  goalIntroText: {
    fontSize: 13,
    color: '#4b5563',
    marginTop: 4,
  },
  goalList: {
    marginTop: 8,
    gap: 8,
  },
  reviewList: {
    marginTop: 24,
    gap: 8,
  },
  primaryCta: {
    marginTop: 24,
    backgroundColor: '#000000',
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryCtaText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  goalOption: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  goalOptionSelected: {
    borderColor: '#000000',
    backgroundColor: '#ffffff',
  },
  goalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  goalLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: '#111827',
  },
  goalDescription: {
    fontSize: 13,
    color: '#4b5563',
    lineHeight: 18,
  },
  bottomBar: {
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingHorizontal: 16,
    paddingTop: 8,
    backgroundColor: 'white',
  },
  primaryButtonFull: {
    backgroundColor: '#111827',
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dobBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e7eb',
    paddingHorizontal: 16,
    paddingTop: 8,
    backgroundColor: '#fff',
  },
  dobContinue: {
    marginTop: 8,
    backgroundColor: '#111827',
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
  },
  dobContinueText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

