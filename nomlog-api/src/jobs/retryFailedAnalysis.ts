import 'dotenv/config';
import { RetryAnalysisService } from '../services/retryAnalysisService';

async function main() {
  try {
    // Optional limit on number of failed analyses to retry per run
    // Set via environment variable, or leave undefined for no limit
    const limit = process.env.RETRY_ANALYSIS_LIMIT
      ? parseInt(process.env.RETRY_ANALYSIS_LIMIT, 10)
      : undefined;

    const service = new RetryAnalysisService();
    const result = await service.run(limit);
    console.log(JSON.stringify({ ok: true, ...result }));
    process.exit(0);
  } catch (error) {
    console.error('Retry analysis job failed:', error);
    process.exit(1);
  }
}

main();

