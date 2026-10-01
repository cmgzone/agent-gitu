/** Isolated local preview: npx tsx tests/helpers/onboarding-preview.ts */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { HermesServer } from '../../src/server/server.js';
import { ScriptedMockLlm } from '../../src/llm/llm.js';
import { allProviderSpecs } from '../../src/llm/providers.js';

process.env.AGENT_GITU_HOME = mkdtempSync(path.join(tmpdir(), 'gitu-onboarding-preview-'));
for (const provider of Object.values(allProviderSpecs())) for (const key of provider.keyEnvVars) delete process.env[key];
delete process.env.HERMES_API_KEY;
const server = new HermesServer({ passwordRequired: false,
  cwd: process.env.AGENT_GITU_HOME,
  port: 0,
  llm: new ScriptedMockLlm([() => 'Preview complete.']),
  codexSubscriptionInfo: async () => ({ available: true, signedIn: false, models: [] }),
});
console.log(`Onboarding preview: http://127.0.0.1:${await server.start()}`);
process.on('SIGINT', () => { void server.stop().then(() => process.exit(0)); });
