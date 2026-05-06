import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useImperativeHandle,
  useMemo,
} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  Keyboard,
  Platform,
  Modal,
  Image,
  ActivityIndicator,
  ScrollView,
  type NativeSyntheticEvent,
  type TextInputContentSizeChangeEventData,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Camera, Image as ImageIcon, Plus, X } from 'lucide-react-native';

const CHAT_INPUT_MIN_HEIGHT = 40;
const CHAT_INPUT_MAX_HEIGHT = 168;
/** Vertical padding in `styles.input` — added to RN contentSize to compare against max height. */
const INPUT_PADDING_V_TOTAL = 8;

export type ComposerPhotoAttachment = {
  localUri: string;
  status: 'uploading' | 'uploaded' | 'failed';
  error?: string | null;
};

type ChatComposerProps = {
  onSubmit: (text: string) => void;
  bottomInset: number;
  initialValue?: string;
  onInputChange?: (text: string) => void;
  onFocus?: () => void;
  isPending?: boolean;
  clearOnSubmit?: boolean;
  placeholder?: string;
  showPlusButton?: boolean;
  /** Reported height of the whole composer (input + send row) for scroll padding. */
  onComposerLayout?: (height: number) => void;
  /** When `isPending`, the send control becomes a stop button and invokes this callback. */
  onCancelPending?: () => void;
  photoAttachments?: ComposerPhotoAttachment[] | null;
  onOpenCamera?: () => void;
  onOpenPhotos?: () => void;
  onRemovePhoto?: (localUri: string) => void;
  onRetryPhotoUpload?: (localUri: string) => void;
  canSubmitWithoutText?: boolean;
  isSubmitBlocked?: boolean;
};

export type ChatComposerHandle = {
  focus: () => void;
  getValue: () => string;
};

const ChatComposerInner = (
  {
    onSubmit,
    bottomInset,
    initialValue = '',
    onInputChange,
    onFocus,
    isPending = false,
    clearOnSubmit = true,
    placeholder = 'What did you eat?',
    showPlusButton = false,
    onComposerLayout,
    onCancelPending,
    photoAttachments,
    onOpenCamera,
    onOpenPhotos,
    onRemovePhoto,
    onRetryPhotoUpload,
    canSubmitWithoutText = false,
    isSubmitBlocked = false,
  }: ChatComposerProps,
  ref: React.Ref<ChatComposerHandle>,
) => {
  const isControlled = typeof onInputChange === 'function';
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isPlusMenuOpen, setIsPlusMenuOpen] = useState(false);
  const [plusMenuAnchor, setPlusMenuAnchor] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const parentUpdateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textInputRef = useRef<TextInput>(null);
  const plusButtonRef = useRef<View>(null);
  const currentTextRef = useRef(initialValue);
  const [inputKey, setInputKey] = useState(0);
  /** When true, text exceeds max height and the field should scroll (avoid fixed height — it breaks growth on iOS). */
  const [multilineScrollEnabled, setMultilineScrollEnabled] = useState(false);
  const [hasText, setHasText] = useState(() => {
    const trimmed = (initialValue || '').trim();
    return trimmed.length > 0;
  });

  useImperativeHandle(
    ref,
    () => ({
      focus: () => {
        textInputRef.current?.focus();
      },
      getValue: () => currentTextRef.current,
    }),
    [],
  );

  useEffect(() => {
    setMultilineScrollEnabled(false);
  }, [inputKey]);

  useEffect(() => {
    if (initialValue !== currentTextRef.current) {
      currentTextRef.current = initialValue;
      setInputKey((prev) => prev + 1);
      const trimmed = (initialValue || '').trim();
      setHasText(trimmed.length > 0);
    }
  }, [initialValue]);

  useEffect(() => {
    if (!showPlusButton && isPlusMenuOpen) {
      setIsPlusMenuOpen(false);
    }
  }, [isPlusMenuOpen, showPlusButton]);

  const handleSubmit = useCallback(() => {
    if (parentUpdateTimerRef.current) {
      clearTimeout(parentUpdateTimerRef.current);
      parentUpdateTimerRef.current = null;
    }

    const trimmed = currentTextRef.current.trim();
    if (!trimmed && !canSubmitWithoutText) return;
    Keyboard.dismiss();
    onSubmit(trimmed);

    if (clearOnSubmit) {
      currentTextRef.current = '';
      setInputKey((prev) => prev + 1);
      setHasText(false);
      if (isControlled) {
        onInputChange?.('');
      }
    }
  }, [canSubmitWithoutText, clearOnSubmit, isControlled, onInputChange, onSubmit]);

  const handleInputChange = useCallback(
    (text: string) => {
      currentTextRef.current = text;

      const trimmed = text.trim();
      const newHasText = trimmed.length > 0;
      if (hasText !== newHasText) {
        setHasText(newHasText);
      }

      if (isControlled) {
        if (parentUpdateTimerRef.current) {
          clearTimeout(parentUpdateTimerRef.current);
        }
        parentUpdateTimerRef.current = setTimeout(() => {
          onInputChange?.(text);
        }, 300);
      }
    },
    [isControlled, onInputChange, hasText],
  );

  useEffect(() => {
    return () => {
      if (parentUpdateTimerRef.current) {
        clearTimeout(parentUpdateTimerRef.current);
      }
    };
  }, []);

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

  const hasSubmittableContent = hasText || canSubmitWithoutText;
  const sendDisabled = !hasSubmittableContent || isPending || isSubmitBlocked;
  const bottomPosition = useMemo(
    () => (keyboardHeight > 0 ? keyboardHeight + 8 : bottomInset + 16),
    [keyboardHeight, bottomInset],
  );

  const shellStyle = useMemo(
    () => [styles.shell, styles.shellChat, { bottom: bottomPosition }],
    [bottomPosition],
  );

  const inputStyles = useMemo(
    () => [
      styles.input,
      styles.inputGrow,
      keyboardHeight > 0 ? styles.inputKeyboardOpen : null,
    ],
    [keyboardHeight],
  );

  const submitButtonStyles = useMemo(
    () => [
      styles.sendButton,
      !isPending && sendDisabled && styles.sendButtonDisabled,
      (isPending || (hasSubmittableContent && !sendDisabled)) && styles.sendButtonActive,
    ],
    [isPending, sendDisabled, hasSubmittableContent],
  );

  const onPrimaryPress = useCallback(() => {
    if (isPending) {
      onCancelPending?.();
      return;
    }
    handleSubmit();
  }, [handleSubmit, isPending, onCancelPending]);

  const primaryDisabled = isPending ? !onCancelPending : sendDisabled;

  const handleContentSizeChange = useCallback(
    (e: NativeSyntheticEvent<TextInputContentSizeChangeEventData>) => {
      const rawBoxHeight = Math.ceil(e.nativeEvent.contentSize.height) + INPUT_PADDING_V_TOTAL;
      setMultilineScrollEnabled(rawBoxHeight > CHAT_INPUT_MAX_HEIGHT);
    },
    [],
  );

  const openPlusMenu = useCallback(() => {
    // Anchor using screen coordinates so a Modal can position correctly.
    plusButtonRef.current?.measureInWindow((x, y, width, height) => {
      setPlusMenuAnchor({ x, y, width, height });
      setIsPlusMenuOpen(true);
    });
  }, []);

  const closePlusMenu = useCallback(() => {
    setIsPlusMenuOpen(false);
  }, []);

  const togglePlusMenu = useCallback(() => {
    if (isPlusMenuOpen) {
      closePlusMenu();
      return;
    }
    openPlusMenu();
  }, [closePlusMenu, isPlusMenuOpen, openPlusMenu]);

  const plusMenuStyle = useMemo(() => {
    if (!plusMenuAnchor) return null;
    // Figma: menu is 160w, top offset ~8px above button, radius 16, shadow 10/15.
    const menuWidth = 160;
    const menuHeight = 135;
    const gapAbove = 8;

    const left = plusMenuAnchor.x;
    const top = Math.max(8, plusMenuAnchor.y - menuHeight - gapAbove);

    return {
      position: 'absolute' as const,
      left,
      top,
      width: menuWidth,
    };
  }, [plusMenuAnchor]);

  const attachments = photoAttachments ?? [];
  const hasAttachments = attachments.length > 0;

  return (
    <View style={shellStyle} onLayout={(e) => onComposerLayout?.(e.nativeEvent.layout.height)}>
      {hasAttachments ? (
        <View style={styles.attachmentStrip}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.attachmentStripContent}>
            {attachments.map((att) => {
              const statusLabel =
                att.status === 'uploading'
                  ? 'Uploading...'
                  : att.status === 'failed'
                    ? att.error || 'Upload failed'
                    : 'Ready';
              return (
                <View key={att.localUri} style={styles.attachmentTile}>
                  <Image source={{ uri: att.localUri }} style={styles.attachmentThumb} />
                  {att.status === 'uploading' ? (
                    <View style={styles.attachmentOverlay}>
                      <ActivityIndicator size="small" color="#ffffff" />
                    </View>
                  ) : null}
                  <TouchableOpacity
                    style={styles.attachmentRemoveButton}
                    onPress={() => onRemovePhoto?.(att.localUri)}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel="Remove attached photo"
                  >
                    <X size={12} color="#ffffff" strokeWidth={2.5} />
                  </TouchableOpacity>

                  {att.status === 'failed' && onRetryPhotoUpload ? (
                    <TouchableOpacity
                      style={styles.attachmentRetryPill}
                      onPress={() => onRetryPhotoUpload(att.localUri)}
                      activeOpacity={0.75}
                      accessibilityRole="button"
                      accessibilityLabel="Retry photo upload"
                    >
                      <Text style={styles.attachmentRetryPillText}>Retry</Text>
                    </TouchableOpacity>
                  ) : null}

                  <View style={styles.attachmentStatusPill}>
                    <Text
                      style={[
                        styles.attachmentStatusPillText,
                        att.status === 'failed' ? styles.attachmentStatusPillTextError : null,
                      ]}
                    >
                      {statusLabel}
                    </Text>
                  </View>
                </View>
              );
                       })}
          </ScrollView>
        </View>
      ) : null}

      <TextInput
        key={inputKey}
        ref={textInputRef}
        style={inputStyles}
        placeholder={placeholder}
        placeholderTextColor="#A0A0A0"
        defaultValue={isControlled ? currentTextRef.current : initialValue}
        onChangeText={handleInputChange}
        onFocus={onFocus}
        multiline
        textAlignVertical="top"
        returnKeyType="default"
        blurOnSubmit={false}
        underlineColorAndroid="transparent"
        scrollEnabled={multilineScrollEnabled}
        onContentSizeChange={handleContentSizeChange}
      />
      <View style={styles.actionsRow}>
        {showPlusButton ? (
          <View ref={plusButtonRef} collapsable={false}>
            <TouchableOpacity
              style={styles.plusButton}
              onPress={togglePlusMenu}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Add to chat"
            >
              <Plus size={20} color="#364153" strokeWidth={2.5} />
            </TouchableOpacity>
          </View>
        ) : (
          <View />
        )}

        <TouchableOpacity
          style={submitButtonStyles}
          onPress={onPrimaryPress}
          disabled={primaryDisabled}
          accessibilityLabel={isPending ? 'Stop generation' : 'Send message'}
        >
          {isPending ? (
            <Ionicons name="stop" size={14} color="white" />
          ) : (
            <Ionicons name="send" size={14} color="white" />
          )}
        </TouchableOpacity>
      </View>

      {showPlusButton ? (
        <Modal
          visible={isPlusMenuOpen}
          transparent
          animationType="fade"
          onRequestClose={closePlusMenu}
        >
          <Pressable style={styles.plusMenuBackdrop} onPress={closePlusMenu}>
            {/* Intentionally empty: backdrop dismiss */}
          </Pressable>
          {plusMenuStyle ? (
            <View style={[styles.plusMenuContainer, plusMenuStyle]}>
              <TouchableOpacity
                style={styles.plusMenuItem}
                activeOpacity={0.7}
                onPress={() => {
                  closePlusMenu();
                  onOpenCamera?.();
                }}
                accessibilityRole="button"
                accessibilityLabel="Camera"
              >
                <Camera size={18} color="#364153" strokeWidth={2.25} />
                <Text style={styles.plusMenuItemText}>Camera</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.plusMenuItem, styles.plusMenuItemDivider]}
                activeOpacity={0.7}
                onPress={() => {
                  closePlusMenu();
                  onOpenPhotos?.();
                }}
                accessibilityRole="button"
                accessibilityLabel="Photos"
              >
                <ImageIcon size={18} color="#364153" strokeWidth={2.25} />
                <Text style={styles.plusMenuItemText}>Photos</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </Modal>
      ) : null}
    </View>
  );
};

export const ChatComposer = React.memo(React.forwardRef(ChatComposerInner));

ChatComposer.displayName = 'ChatComposer';

const styles = StyleSheet.create({
  shell: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 4,
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
  shellChat: {
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 5,
  },
  input: {
    width: '100%',
    fontSize: 16,
    lineHeight: 22,
    color: '#101828',
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  inputGrow: {
    minHeight: CHAT_INPUT_MIN_HEIGHT,
    maxHeight: CHAT_INPUT_MAX_HEIGHT,
    alignSelf: 'stretch',
  },
  inputKeyboardOpen: {
    paddingLeft: 8,
  },
  attachmentStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#f0f2f5',
    backgroundColor: '#f8f9fb',
    paddingVertical: 8,
    paddingHorizontal: 8,
    gap: 10,
  },
  attachmentStripContent: {
    gap: 10,
    paddingRight: 8,
  },
  attachmentTile: {
    width: 72,
    height: 72,
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#e5e7eb',
  },
  attachmentThumb: {
    width: '100%',
    height: '100%',
  },
  attachmentOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachmentRemoveButton: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachmentStatusPill: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  attachmentStatusPillText: {
    color: '#ffffff',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
  },
  attachmentStatusPillTextError: {
    color: '#fecaca',
  },
  attachmentRetryPill: {
    position: 'absolute',
    left: 6,
    top: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(79, 70, 229, 0.85)',
  },
  attachmentRetryPillText: {
    color: '#ffffff',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  plusButton: {
    width: 32,
    height: 32,
    borderRadius: 18,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    opacity: 0.5,
  },
  sendButtonActive: {
    opacity: 1,
  },
  sendButtonDisabled: {
    backgroundColor: '#d1d5dc',
    opacity: 0.3,
  },
  plusMenuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  plusMenuContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 15,
    elevation: 12,
  },
  plusMenuItem: {
    height: 44,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  plusMenuItemDivider: {
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  plusMenuItemText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
    color: '#364153',
    letterSpacing: -0.15,
  },
});
