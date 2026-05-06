import { useEffect } from 'react';
import {
  selectAutoLogHealthWorkoutsForPlatform,
  useAutoLogHealthStore,
} from '../store/autoLogHealthStore';

export { AUTO_LOG_HEALTH_WORKOUTS_KEY } from '../store/autoLogHealthStore';

export function useAutoLogHealthWorkouts(): {
  autoLogHealthWorkouts: boolean;
  setAutoLogHealthWorkouts: (value: boolean) => Promise<void>;
  ready: boolean;
} {
  const hydrate = useAutoLogHealthStore((s) => s.hydrate);
  const ready = useAutoLogHealthStore((s) => s.ready);
  const setAutoLogHealthWorkouts = useAutoLogHealthStore((s) => s.setAutoLogHealthWorkouts);
  const autoLogHealthWorkouts = useAutoLogHealthStore(selectAutoLogHealthWorkoutsForPlatform);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return {
    autoLogHealthWorkouts,
    setAutoLogHealthWorkouts,
    ready,
  };
}
