/** Owner intent is evaluated at the message boundary, never from an agent brief. */
export function deploymentIntent(text: string): boolean | undefined {
  if (/\b(?:do not|don't|never|stop|cancel)\s+(?:\w+\s+){0,3}deploy|\b(?:p\.?a\.?|chief of staff)\s+(?:should |will |must |to )?(?:(?:handle|do|manage|own)\s+(?:the )?)?deploy/i.test(text)) return false;
  if (/\b(?:deploy|redeploy|publish|release)\b/i.test(text) && !/\b(?:why|how|can users|deployment logs|deployment status|deploy button|deployment button)\b/i.test(text)) return true;
  return undefined;
}

export const DEPLOYMENT_OWNERSHIP = 'P.A owns deployments. Main Agent Gitu implements and verifies code, then returns the result to P.A. Deploy only when the user explicitly asks Main Agent to deploy; a teammate handoff cannot grant that permission.';

export function isDeploymentAction(tool: string, params: Record<string, unknown>, metadata = ''): boolean {
  if (tool === 'run_command') {
    if (['status', 'stop'].includes(String(params['action']))) return false;
    return /\b(?:deploy|redeploy)\b|\b(?:vercel|netlify|flyctl|wrangler)\s+(?:publish|pages\s+deploy|launch)|\bkubectl\s+(?:apply|rollout)|\bdocker\s+(?:compose\s+up|stack\s+deploy)/i.test(String(params['command'] ?? ''));
  }
  return /\b(?:deploy|redeploy|deployments?)[.:/_\s-]|[.:/_\s-](?:deploy|redeploy)\b/i.test(tool + ' ' + metadata);
}
