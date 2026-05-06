import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { LlmUsage } from '../hooks/useLlmUsage';

type UsageWidgetProps = {
  usage?: LlmUsage | null;
  isLoading?: boolean;
};

export const UsageWidget = ({ usage, isLoading = false }: UsageWidgetProps) => {
  const formatThousands = (value: number): string => `${Math.round(value / 1000)}k`;

  const usageSummary = useMemo(() => {
    if (!usage) return null;

    const usedTokens = Math.max(0, Number(usage.usedTokens || 0));
    const limitTokens =
      usage.limitTokens != null && Number.isFinite(Number(usage.limitTokens))
        ? Math.max(0, Number(usage.limitTokens))
        : null;
    const remainingTokens =
      limitTokens != null
        ? Math.max(
            0,
            usage.remainingTokens != null ? Number(usage.remainingTokens) : limitTokens - usedTokens
          )
        : null;
    const progress = limitTokens != null && limitTokens > 0 ? Math.min(1, usedTokens / limitTokens) : 0;

    return { usedTokens, limitTokens, remainingTokens, progress };
  }, [usage]);

  if (isLoading) {
    return (
      <View style={styles.card}>
        <Text style={styles.statusText}>Loading usage...</Text>
      </View>
    );
  }

  if (!usageSummary || !usage) {
    return (
      <View style={styles.card}>
        <Text style={styles.statusText}>Usage unavailable</Text>
      </View>
    );
  }

  const membershipLabel = usage.membershipTier === 'premium' ? 'Premium' : 'Free';
  const usedLabel = formatThousands(usageSummary.usedTokens);
  const limitLabel =
    usageSummary.limitTokens != null ? formatThousands(usageSummary.limitTokens) : 'Unlimited';
  const remainingLabel =
    usageSummary.remainingTokens != null ? formatThousands(usageSummary.remainingTokens) : 'Unlimited';

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.tierLabel}>{membershipLabel} tier</Text>
        <Text style={styles.usageLabel}>
          {usedLabel} / {limitLabel}
        </Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.round(usageSummary.progress * 100)}%` }]} />
      </View>
      <Text style={styles.remainingText}>{remainingLabel} tokens left today</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#f9fafb',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  tierLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#101828',
  },
  usageLabel: {
    fontSize: 13,
    color: '#4a5565',
  },
  progressTrack: {
    width: '100%',
    height: 8,
    borderRadius: 999,
    backgroundColor: '#e5e7eb',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#9810fa',
    borderRadius: 999,
  },
  remainingText: {
    marginTop: 10,
    fontSize: 13,
    color: '#364153',
  },
  statusText: {
    fontSize: 14,
    color: '#6a7282',
  },
});
