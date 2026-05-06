import type { ActivityExerciseSegment, ActivitySchemaType } from '../types/activityLog';

export const activitySchemaTypeOptions: ActivitySchemaType[] = [
  'running',
  'walking',
  'cycling',
  'swimming',
  'strength',
  'hiit',
  'custom',
];

function isPositive(n: number | undefined): boolean {
  return n != null && Number.isFinite(n) && n > 0;
}

export function inferActivitySchemaTypeFromText(title: string): ActivitySchemaType {
  const t = title.toLowerCase();
  if (/\b(run|jog|sprint|treadmill)\b/.test(t)) return 'running';
  if (/\bwalk|hike\b/.test(t)) return 'walking';
  if (/\b(cycle|cycling|bike|biking|peloton|spin)\b/.test(t)) return 'cycling';
  if (/\b(swim|swimming|lap)\b/.test(t)) return 'swimming';
  if (/\b(strength|lift|lifting|bench|squat|deadlift|press|row)\b/.test(t)) return 'strength';
  if (/\b(hiit|interval|circuit|emom|amrap|tabata)\b/.test(t)) return 'hiit';
  return 'custom';
}

export function schemaTypeLabel(schemaType: ActivitySchemaType): string {
  switch (schemaType) {
    case 'hiit':
      return 'HIIT';
    default:
      return schemaType.charAt(0).toUpperCase() + schemaType.slice(1);
  }
}

export function schemaMinimumHint(schemaType: ActivitySchemaType): string {
  if (schemaType === 'strength') {
    return 'Minimum for burn estimate: sets/reps/weight or duration.';
  }
  if (schemaType === 'custom') {
    return 'Minimum for burn estimate: distance, duration, reps, or weight.';
  }
  return 'Minimum for burn estimate: distance or duration.';
}

export function validateManualExerciseSegmentMinimums(
  seg: Extract<ActivityExerciseSegment, { kind: 'manual_exercise' }>
): string | null {
  const schemaType = seg.schemaType ?? inferActivitySchemaTypeFromText(seg.title);
  const hasDuration = isPositive(seg.durationSec);
  const hasDistance = isPositive(seg.distanceMiles) || isPositive(seg.distanceKm);
  const setSignal = (seg.sets ?? []).some((s) => isPositive(s.reps) || isPositive(s.weightLbs));
  const hasStrengthSignal = setSignal || isPositive(seg.reps);

  if (schemaType === 'running' || schemaType === 'walking' || schemaType === 'cycling' || schemaType === 'swimming' || schemaType === 'hiit') {
    if (hasDuration || hasDistance) return null;
    return `${schemaTypeLabel(schemaType)} requires at least distance or duration.`;
  }
  if (schemaType === 'strength') {
    if (hasStrengthSignal || hasDuration) return null;
    return 'Strength requires sets/reps/weight or duration.';
  }
  if (hasDuration || hasDistance || hasStrengthSignal) return null;
  return 'Custom activity requires at least one measurable field.';
}

export function validateManualExerciseSegments(exercises: ActivityExerciseSegment[]): string[] {
  const errors: string[] = [];
  for (let i = 0; i < exercises.length; i++) {
    const seg = exercises[i];
    if (seg.kind !== 'manual_exercise') continue;
    const err = validateManualExerciseSegmentMinimums(seg);
    if (err) errors.push(`Exercise ${i + 1}: ${err}`);
  }
  return errors;
}
