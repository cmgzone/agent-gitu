import path from 'node:path';
import { ensureGituHome } from '../workspace/home.js';
import { readJson, writeJson } from '../util.js';

export interface OnboardingPreferences {
  completed: boolean;
  theme: 'light' | 'dark' | 'system';
  mode: 'coding' | 'cowork';
  model: string;
}

export function readOnboarding(): OnboardingPreferences {
  const saved = readJson<Partial<OnboardingPreferences>>(path.join(ensureGituHome().settings, 'onboarding.json'));
  return {
    completed: saved?.completed === true,
    theme: saved?.theme === 'light' || saved?.theme === 'dark' ? saved.theme : 'system',
    mode: saved?.mode === 'cowork' ? 'cowork' : 'coding',
    model: typeof saved?.model === 'string' ? saved.model : '',
  };
}

export function saveOnboarding(body: Record<string, unknown>): OnboardingPreferences {
  if (!['light', 'dark', 'system'].includes(String(body['theme'])) || !['coding', 'cowork'].includes(String(body['mode']))) {
    throw new Error('Choose a valid theme and workspace mode.');
  }
  const model = body['model'] ?? '';
  if (typeof model !== 'string' || model.length > 500 || (model && !/^[^\s:]+::\S+$/.test(model))) throw new Error('Choose a valid model.');
  // Keep credentials out of preferences, even if a caller sends extra fields.
  const preferences: OnboardingPreferences = { completed: true, theme: body['theme'] as OnboardingPreferences['theme'], mode: body['mode'] as OnboardingPreferences['mode'], model };
  writeJson(path.join(ensureGituHome().settings, 'onboarding.json'), preferences);
  return preferences;
}
