import React from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import LottieView from 'lottie-react-native';

const spinnerSource = require('../../assets/loading-spinner-lottie.json');

const ASPECT = 150 / 300;

type LottieLoadingSpinnerProps = {
  /** Width of the animation; height follows the asset aspect ratio (2:1). */
  width?: number;
  style?: StyleProp<ViewStyle>;
};

export function LottieLoadingSpinner({ width = 120, style }: LottieLoadingSpinnerProps) {
  const height = width * ASPECT;
  return (
    <View style={[styles.wrap, { width, height }, style]}>
      <LottieView
        source={spinnerSource}
        autoPlay
        loop
        style={styles.lottie}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
  },
  lottie: {
    width: '100%',
    height: '100%',
  },
});
