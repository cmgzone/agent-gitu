import { loadEnvFile } from 'node:process';

/** Explicit environment values take precedence over the local development file. */
export function loadEnvironment(file = '.env'): void {
  try {
    loadEnvFile(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Could not load the environment file. Check its path and permissions.');
  }
}
