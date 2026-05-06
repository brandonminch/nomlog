import React, { useEffect, useState } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet, Keyboard, Platform, Text, type KeyboardTypeOptions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type OnboardingInputBarProps = {
  value: string;
  onChange: (text: string) => void;
  onSubmit: () => void;
  isPending?: boolean;
  onSkip?: () => void;
  placeholder: string;
  keyboardType?: KeyboardTypeOptions;
  autoFocus?: boolean;
};

export const OnboardingInputBar: React.FC<OnboardingInputBarProps> = ({
  value,
  onChange,
  onSubmit,
  isPending = false,
  onSkip,
  placeholder,
  keyboardType,
  autoFocus = false,
}) => {
  const insets = useSafeAreaInsets();
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const keyboardShow = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const keyboardHide = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      keyboardShow?.remove();
      keyboardHide?.remove();
    };
  }, []);

  const trimmed = value.trim();
  const hasText = trimmed.length > 0;
  const isSubmitDisabled = !hasText || isPending;

  const bottom = keyboardHeight > 0 ? keyboardHeight + 8 : insets.bottom + 32;

  const handleSubmit = () => {
    if (isSubmitDisabled) return;
    onSubmit();
  };

  return (
    <View style={[styles.container, { bottom }]}>
      <View style={[styles.floatingNav, styles.floatingNavChat]}>
        <TextInput
          style={styles.navInput}
          placeholder={placeholder}
          placeholderTextColor="#A0A0A0"
          value={value}
          onChangeText={onChange}
          autoFocus={autoFocus}
          returnKeyType="default"
          // Only submit from the arrow button; the keyboard return key
          // should behave like a normal line break / dismiss, not a send action.
          onSubmitEditing={undefined}
          autoCapitalize="words"
          autoCorrect={false}
          keyboardType={keyboardType}
        />
        <TouchableOpacity
          style={[
            styles.submitButton,
            isSubmitDisabled && styles.submitButtonDisabled,
            hasText && !isSubmitDisabled && styles.submitButtonActive,
          ]}
          onPress={handleSubmit}
          disabled={isSubmitDisabled}
          activeOpacity={0.8}
        >
          {isPending ? (
            <Ionicons name="hourglass" size={16} color="white" />
          ) : (
            <Ionicons name="send" size={16} color="white" />
          )}
        </TouchableOpacity>
      </View>
      {onSkip && (
        <TouchableOpacity
          style={styles.skipButton}
          onPress={onSkip}
          disabled={isPending}
          activeOpacity={0.7}
        >
          <Text style={styles.skipButtonText}>Skip for now</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  floatingNav: {
    alignSelf: 'stretch',
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.1,
    shadowRadius: 15,
    elevation: 10,
    zIndex: 1000,
  },
  floatingNavChat: {
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 5,
    borderTopWidth: 0,
    borderBottomWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
  },
  navInput: {
    flex: 1,
    fontSize: 16,
    color: '#101828',
    paddingVertical: 8,
    paddingHorizontal: 0,
    minHeight: 40,
    maxHeight: 100,
  },
  submitButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    opacity: 0.5,
  },
  submitButtonActive: {
    opacity: 1,
  },
  submitButtonDisabled: {
    backgroundColor: '#d1d5dc',
    opacity: 0.3,
  },
  skipButton: {
    marginTop: 24,
    alignItems: 'center',
  },
  skipButtonText: {
    fontSize: 14,
    color: '#6b7280',
  },
});

