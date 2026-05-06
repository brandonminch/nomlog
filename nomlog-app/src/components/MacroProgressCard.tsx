import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

interface MacroProgressCardProps {
  current: number;
  goal: number | null;
  /** Logged-only total; ring uses `current` + `planned` vs goal. */
  planned?: number;
  label: string;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  iconColor: string;
  backgroundColor: string;
  progressColor: string;
  isActive?: boolean;
}

const SIZE = 80;
const STROKE_WIDTH = 8;
const RADIUS = (SIZE - STROKE_WIDTH) / 2;
const CENTER = SIZE / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const MacroProgressCardComponent: React.FC<MacroProgressCardProps> = ({
  current,
  goal,
  planned = 0,
  label,
  icon: Icon,
  iconColor,
  backgroundColor,
  progressColor,
}) => {
  const loggedG = Math.round(current);
  const plannedG = Math.round(planned);
  const g = goal && goal > 0 ? Math.round(goal) : 0;
  const loggedLen =
    g > 0 ? Math.min((loggedG / g) * CIRCUMFERENCE, CIRCUMFERENCE) : 0;
  const plannedLen =
    g > 0 && plannedG > 0
      ? Math.min((plannedG / g) * CIRCUMFERENCE, Math.max(0, CIRCUMFERENCE - loggedLen))
      : 0;
  const loggedSweepDeg = (loggedLen / CIRCUMFERENCE) * 360;
  const showPlannedLine = plannedG > 0;

  const loggedDash = `${loggedLen} ${CIRCUMFERENCE}`;
  const plannedDash = `${plannedLen} ${CIRCUMFERENCE}`;

  return (
    <View style={styles.card}>
      <View style={styles.progressContainer}>
        <View style={styles.wheelWrapper}>
          <Svg width={SIZE} height={SIZE}>
            <Circle
              cx={CENTER}
              cy={CENTER}
              r={RADIUS}
              stroke={backgroundColor}
              strokeWidth={STROKE_WIDTH}
              fill="transparent"
            />
            {loggedLen > 0 && (
              <Circle
                cx={CENTER}
                cy={CENTER}
                r={RADIUS}
                stroke={progressColor}
                strokeWidth={STROKE_WIDTH}
                fill="transparent"
                strokeDasharray={loggedDash}
                strokeLinecap="round"
                transform={`rotate(-90 ${CENTER} ${CENTER})`}
              />
            )}
            {plannedLen > 0 && (
              <Circle
                cx={CENTER}
                cy={CENTER}
                r={RADIUS}
                stroke={progressColor}
                strokeOpacity={0.32}
                strokeWidth={STROKE_WIDTH}
                fill="transparent"
                strokeDasharray={plannedDash}
                strokeLinecap="round"
                transform={`rotate(${-90 + loggedSweepDeg} ${CENTER} ${CENTER})`}
              />
            )}
          </Svg>
          <View style={[styles.iconContainer, { backgroundColor }]}>
            <Icon size={14} color={iconColor} />
          </View>
        </View>
      </View>
      <View style={styles.valueRow}>
        <Text style={styles.value}>{loggedG}g</Text>
        {g > 0 && (
          <Text style={styles.goalSuffix}>
            {' '}
            / {g}g
          </Text>
        )}
      </View>
      {showPlannedLine && (
        <Text style={[styles.plannedLine, { color: progressColor }]}>
          +{plannedG}g planned
        </Text>
      )}
      <Text style={styles.label}>{label}</Text>
    </View>
  );
};

MacroProgressCardComponent.displayName = 'MacroProgressCard';

export const MacroProgressCard = React.memo(MacroProgressCardComponent, (prevProps, nextProps) => {
  const prevG =
    prevProps.goal && prevProps.goal > 0 ? Math.round(prevProps.goal) : 0;
  const nextG =
    nextProps.goal && nextProps.goal > 0 ? Math.round(nextProps.goal) : 0;
  const prevPlanned = Math.round(prevProps.planned ?? 0);
  const nextPlanned = Math.round(nextProps.planned ?? 0);
  const prevLogged = Math.round(prevProps.current);
  const nextLogged = Math.round(nextProps.current);

  const ringEqual =
    prevG === nextG &&
    prevLogged === nextLogged &&
    prevPlanned === nextPlanned;

  return (
    ringEqual &&
    prevProps.goal === nextProps.goal &&
    prevProps.label === nextProps.label &&
    prevProps.progressColor === nextProps.progressColor &&
    prevProps.backgroundColor === nextProps.backgroundColor &&
    prevProps.iconColor === nextProps.iconColor
  );
});

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  progressContainer: {
    marginBottom: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  wheelWrapper: {
    width: SIZE,
    height: SIZE,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainer: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    flexWrap: 'wrap',
    marginBottom: 4,
  },
  value: {
    fontSize: 16,
    fontWeight: '700',
    color: '#101828',
  },
  goalSuffix: {
    fontSize: 16,
    fontWeight: '400',
    color: '#6a7282',
  },
  plannedLine: {
    fontSize: 12,
    fontWeight: '400',
    marginBottom: 4,
  },
  label: {
    fontSize: 12,
    color: '#6a7282',
  },
});
