import { expect, it } from 'vitest';
import { deploymentIntent, isDeploymentAction } from '../src/coding/deployment-authority.js';

it('recognizes direct deployment requests while respecting ownership, revocation and questions', () => {
  expect(deploymentIntent('Main Agent, deploy this to Coolify')).toBe(true);
  expect(deploymentIntent('Can you deploy the tested project now?')).toBe(true);
  expect(deploymentIntent('Do not deploy this')).toBe(false);
  expect(deploymentIntent('Let P.A deploy it')).toBe(false);
  expect(deploymentIntent('P.A should handle deployment')).toBe(false);
  expect(deploymentIntent('How does deploy work?')).toBeUndefined();
  expect(deploymentIntent('Fix the deploy button')).toBeUndefined();
  expect(deploymentIntent('Run tests')).toBeUndefined();
});

it('recognizes deployment operations without blocking builds, tests and process status', () => {
  expect(isDeploymentAction('run_command', { command: 'npm run deploy' })).toBe(true);
  expect(isDeploymentAction('connection_operation', {}, 'launch deployments.write')).toBe(true);
  expect(isDeploymentAction('run_command', { command: 'npm test && npm run build' })).toBe(false);
  expect(isDeploymentAction('run_command', { action: 'status', id: 'cmd-1' })).toBe(false);
});
