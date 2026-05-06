export interface EvalCase {
  description: string;
  input: unknown;
  check: (output: unknown) => boolean;
}

export interface EvalSummary {
  service: string;
  passed: number;
  total: number;
  failures: { description: string; output?: unknown; error?: string }[];
}

export async function runEvals(
  serviceName: string,
  cases: EvalCase[],
  handler: (input: unknown) => Promise<unknown>
): Promise<EvalSummary> {
  console.log(`\nRunning evals: ${serviceName}`);
  console.log('─'.repeat(40));

  const summary: EvalSummary = {
    service: serviceName,
    passed: 0,
    total: cases.length,
    failures: [],
  };

  for (const c of cases) {
    try {
      const output = await handler(c.input);
      if (c.check(output)) {
        summary.passed++;
        console.log(`✅ ${c.description}`);
      } else {
        summary.failures.push({ description: c.description, output });
        console.log(`❌ ${c.description}`);
        console.log('   Output:', JSON.stringify(output, null, 2));
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      summary.failures.push({ description: c.description, error: message });
      console.log(`❌ ${c.description} — ERROR: ${message}`);
    }
  }

  console.log(`\n${summary.passed}/${summary.total} passed\n`);
  return summary;
}
