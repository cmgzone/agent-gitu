import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SkillStore } from '../src/skills/skills.js';

const root = mkdtempSync(path.join(os.tmpdir(), 'agent-gitu-skills-v2-benchmark-'));
const skillsDir = SkillStore.projectSkillsDir(root);

function addSkill(name: string, description: string, keywords: string[]): void {
  const directory = path.join(skillsDir, name);
  mkdirSync(directory, { recursive: true });
  const instructions = `# ${name}\n\n${'Use this skill to make a careful, verified change.\n'.repeat(14)}`;
  writeFileSync(
    path.join(directory, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${description}\nversion: 1\nkeywords:\n${keywords.map((keyword) => `  - ${keyword}`).join('\n')}\nspecialists:\n  - frontend\n---\n\n${instructions}`,
  );
}

try {
  for (const name of ['react-ui', 'accessibility', 'forms', 'frontend-testing', 'responsive-layout']) {
    addSkill(name, `Build and verify ${name.replace(/-/g, ' ')} user experiences`, ['frontend', 'react', 'accessibility']);
  }
  for (let index = 0; index < 195; index += 1) addSkill(`library-skill-${index}`, `Maintain library skill ${index}`, ['library', `topic-${index}`]);

  const store = new SkillStore(skillsDir, path.join(root, 'global-skills'));
  const discoveryStarted = performance.now();
  const installed = store.list().length;
  const metadataContext = store.renderForPrompt([], { maxSkills: 8 });
  const discoveryMs = performance.now() - discoveryStarted;

  const selectionStarted = performance.now();
  const selection = store.resolver().resolve('Build an accessible responsive React form', { specialist: 'frontend', availableTools: ['read_file'] });
  const shortlisted = selection.allMatches.slice(0, 5);
  const selectionMs = performance.now() - selectionStarted;
  const loadedInstructions = shortlisted.slice(0, 2).map((match) => store.get(match.skill.name)?.instructions ?? '');

  console.log(
    JSON.stringify(
      {
        installed,
        metadataDiscovered: installed,
        shortlisted: shortlisted.length,
        fullBodiesLoaded: loadedInstructions.length,
        metadataContextChars: metadataContext.length,
        metadataContextEstimatedTokens: Math.ceil(metadataContext.length / 4),
        loadedInstructionChars: loadedInstructions.join('').length,
        loadedInstructionEstimatedTokens: Math.ceil(loadedInstructions.join('').length / 4),
        discoveryMs: Number(discoveryMs.toFixed(1)),
        selectionMs: Number(selectionMs.toFixed(1)),
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}
