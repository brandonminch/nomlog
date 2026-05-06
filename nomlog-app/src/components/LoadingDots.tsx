import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, ViewStyle } from 'react-native';

type LoadingDotsProps = {
  color?: string;
  dotSize?: number;
  gap?: number;
  style?: ViewStyle;
};

/**
 * Shared 3-dot loading indicator (used by chat + meal cards).
 * Matches the existing chat "TypingDots" animation.
 */
export const LoadingDots = ({
  color = '#6a7282',
  dotSize = 6,
  gap = 4,
  style,
}: LoadingDotsProps) => {
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const createAnimation = (dot: Animated.Value, delay: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.timing(dot, {
            toValue: 1,
            duration: 600,
            delay,
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0.3,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      );
    };

    const anim = Animated.parallel([
      createAnimation(dot1, 0),
      createAnimation(dot2, 200),
      createAnimation(dot3, 400),
    ]);

    anim.start();
    return () => {
      anim.stop();
    };
  }, [dot1, dot2, dot3]);

  return (
    <View style={[styles.container, { gap }, style]}>
      <Animated.View style={[styles.dot, { opacity: dot1, width: dotSize, height: dotSize, borderRadius: dotSize / 2, backgroundColor: color }]} />
      <Animated.View style={[styles.dot, { opacity: dot2, width: dotSize, height: dotSize, borderRadius: dotSize / 2, backgroundColor: color }]} />
      <Animated.View style={[styles.dot, { opacity: dot3, width: dotSize, height: dotSize, borderRadius: dotSize / 2, backgroundColor: color }]} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    // Size/color are set via inline style so consumers can customize.
  },
});

