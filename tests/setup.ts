import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Tests must never write sessions, projects, or settings into the real
// AgentGitu home, otherwise every test run litters the user's sidebar with
// phantom projects. Point the home at a throwaway temp directory.
process.env.HERMES_HOME_DIR = mkdtempSync(path.join(tmpdir(), 'hermes-test-home-'));
