import { readFileSync } from 'node:fs';
import path from 'node:path';
import { summarizeEvaluations, type EvaluationScenario } from '../src/evaluation/metrics.js';

const suppliedPath = process.argv[2];
if (!suppliedPath) {
  console.error('Usage: npm run eval:summary -- <results.json>');
  process.exit(2);
}

try {
  const file = path.resolve(suppliedPath);
  const parsed = JSON.parse(readFileSync(file, 'utf8')) as Record<string, EvaluationScenario>;
  console.log(JSON.stringify(summarizeEvaluations(parsed), null, 2));
} catch (error) {
  console.error(`Could not summarize evaluation results: ${(error as Error).message}`);
  process.exit(1);
}
