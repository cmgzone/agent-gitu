/**
 * PikRouter Client Integration Examples
 * =====================================
 * This file illustrates:
 * 1. Web/Client-side login form submission and localStorage persistence.
 * 2. OpenAI SDK integration with the user token (dangerouslyAllowBrowser: true).
 * 3. Native Agent Gitu integration using loginPikRouter & createPikRouterClient.
 */

import {
  loginPikRouter,
  createPikRouterClient,
  streamPikRouterCompletion,
  DEFAULT_PIKROUTER_AUTH_URL,
  DEFAULT_PIKROUTER_BASE_URL,
} from '../src/llm/pikrouter.js';

// ============================================================================
// 1. Browser Client Authentication & OpenAI SDK Call (Snippet 1 & 2)
// ============================================================================

/**
 * Example browser login handler.
 * Typically called from your React / Vue / HTML form submit event handler.
 */
export async function handleBrowserLogin(userEmail: string, userPassword: string) {
  // 1. Authenticate user on client
  const res = await fetch(DEFAULT_PIKROUTER_AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: userEmail, password: userPassword }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || errorData.message || 'Login failed');
  }

  const { token, user } = (await res.json()) as { token: string; user?: unknown };

  // Store token in localStorage or secure cookie
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('auth_token', token);
  }

  return { token, user };
}

/**
 * Example OpenAI SDK query using the stored auth token.
 * Can be run in browser or Node.js.
 */
export async function queryPikRouterWithOpenAi(
  token: string,
  prompt = 'Hello AI Router!',
  model = 'gpt-4o-mini',
) {
  // Dynamically import OpenAI or use the global / imported instance
  const { default: OpenAI } = await import('openai');

  const client = new OpenAI({
    apiKey: token, // Direct user sign-in token!
    baseURL: DEFAULT_PIKROUTER_BASE_URL,
    dangerouslyAllowBrowser: true, // Safe because no master API key is exposed!
  });

  const response = await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
    stream: true,
  });

  for await (const chunk of response) {
    process.stdout.write(chunk.choices[0]?.delta?.content || '');
  }
  process.stdout.write('\n');
}

// ============================================================================
// 2. Node.js / Agent Gitu Integrated Flow
// ============================================================================

export async function runPikRouterIntegrated(
  email = 'customer@app.com',
  password = 'password123',
  prompt = 'How does sign-in auth work?',
  model = 'gemini-1.5-flash',
) {
  // 1. Authenticate and persist token in Agent Gitu's secure storage
  console.log(`Authenticating with PikRouter as ${email}...`);
  const auth = await loginPikRouter({ email, password, saveKey: true });
  console.log(`Authenticated! User: ${auth.user?.name || auth.user?.email || 'N/A'}`);

  // 2. Query through zero-dependency stream generator
  console.log(`Streaming response for: "${prompt}" using ${model}...\n`);
  for await (const delta of streamPikRouterCompletion({
    token: auth.token,
    model,
    messages: [{ role: 'user', content: prompt }],
  })) {
    process.stdout.write(delta);
  }
  process.stdout.write('\n');

  // 3. Or query via Agent Gitu's OpenAiCompatClient:
  const client = createPikRouterClient({ token: auth.token, model });
  const turnResult = await client.completeTurn([
    { role: 'user', content: 'Give a 1-sentence confirmation.' },
  ]);
  console.log('\nCompat client turn result:', turnResult);
}

if (process.argv[1] && process.argv[1].endsWith('pikrouter-example.ts')) {
  runPikRouterIntegrated().catch((err) => {
    console.error('PikRouter error:', err.message);
  });
}
