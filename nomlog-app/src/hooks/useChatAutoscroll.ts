import { useEffect, useRef, useState } from 'react';
import type { ScrollView, View } from 'react-native';

type UseChatAutoscrollArgs = {
  activeBotKey: string | null;
  bottomInset: number;
};

export const useChatAutoscroll = ({ activeBotKey, bottomInset }: UseChatAutoscrollArgs) => {
  const scrollViewRef = useRef<ScrollView | null>(null);
  const scrollContentRef = useRef<View | null>(null);
  const activeMessageRef = useRef<View | null>(null);

  const [contentHeight, setContentHeight] = useState(0);
  const [scrollHeight, setScrollHeight] = useState(0);

  useEffect(() => {
    if (!activeBotKey || !scrollViewRef.current) return;

    const scrollToActiveMessageTop = () => {
      try {
        const active = activeMessageRef.current;
        const content = scrollContentRef.current;
        if (!active || !content) {
          const availableHeight = scrollHeight - (bottomInset + 440);
          if (contentHeight > availableHeight && availableHeight > 0) {
            scrollViewRef.current?.scrollToEnd({ animated: true });
          }
          return;
        }
        active.measureLayout(
          content,
          (_left: number, top: number) => {
            const padding = 16;
            scrollViewRef.current?.scrollTo({
              y: Math.max(0, top - padding),
              animated: true,
            });
          },
          () => {
            scrollViewRef.current?.scrollToEnd({ animated: true });
          }
        );
      } catch {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }
    };

    const t = setTimeout(scrollToActiveMessageTop, 80);
    return () => clearTimeout(t);
  }, [activeBotKey, contentHeight, scrollHeight, bottomInset]);

  return {
    scrollViewRef,
    scrollContentRef,
    activeMessageRef,
    handleScrollLayout: (height: number) => setScrollHeight(height),
    handleContentSizeChange: (_w: number, h: number) => setContentHeight(h),
  };
};

