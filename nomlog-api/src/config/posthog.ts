import { PostHog } from 'posthog-node';

const apiKey = (process.env.POSTHOG_API_KEY || '').trim();

const posthog: Pick<PostHog, 'capture' | 'captureException' | 'shutdown'> = apiKey
  ? new PostHog(apiKey, {
      host: process.env.POSTHOG_HOST,
      enableExceptionAutocapture: true,
    })
  : {
      capture: () => {},
      captureException: () => {},
      shutdown: async () => {},
    };

process.on('SIGINT', async () => {
  await posthog.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await posthog.shutdown();
  process.exit(0);
});

export default posthog as PostHog;
