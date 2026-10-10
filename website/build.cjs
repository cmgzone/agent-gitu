/* Build the static marketing pages. No framework or browser runtime dependencies. */
const fs = require('node:fs');
const path = require('node:path');
const config = require('./site.config.json');
const pkg = require('../package.json');
const root = __dirname;
const esc = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const icon = (name, cls = '') => {
  const shapes = {
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    diagonal: '<path d="M7 17 17 7M7 7h10v10"/>',
    check: '<path d="m5 12 4 4 10-10"/>',
    code: '<path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-13-2 16"/>',
    team: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m2-15a3 3 0 0 1 0 6m1 3a5 5 0 0 1 3 5v1"/>',
    spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m3 6 9 7 9-7"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Zm0 0v6h6M8 14h8M8 17h5"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a18 18 0 0 1 0 18 18 18 0 0 1 0-18"/>',
    github:
      '<path d="M9 19c-4 1-4-2-6-2m12 4v-4c0-1 .1-2-1-3 3-.3 6-1.5 6-5 0-1-.4-2-1-3 .3-1 .3-2-.2-3-2 0-3 1-4 1a12 12 0 0 0-6 0c-1 0-2-1-4-1-.5 1-.5 2-.2 3-.6 1-1 2-1 3 0 3.5 3 4.7 6 5-1 1-1 2-1 3v4"/>',
  };
  return `<svg class="icon ${cls}" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[name] || shapes.spark}</svg>`;
};
const link = (href, label, kind = 'primary') => `<a class="button button-${kind}" href="${href}">${label}${icon(kind === 'text' ? 'diagonal' : 'arrow')}</a>`;
const eyebrow = (text) => `<p class="eyebrow"><span class="signal-dot"></span>${text}</p>`;
const heading = (label, title, text) => `<div class="section-heading" data-reveal>${eyebrow(label)}<h2>${title}</h2>${text ? `<p>${text}</p>` : ''}</div>`;
const pageHero = (label, title, text, visual = '', action = 'download.html', actionLabel = 'Get Agent Gitu') =>
  `<section class="page-hero wrap ${visual ? 'split' : 'page-hero-simple'}"><div data-reveal>${eyebrow(label)}<h1>${title}</h1><p class="hero-description">${text}</p><div class="actions">${link(action, actionLabel)}${link('docs.html', 'Explore the docs', 'secondary')}</div></div>${visual ? `<div class="page-visual" data-reveal>${visual}</div>` : ''}</section>`;
const card = (symbol, title, text, href, label) =>
  `<article class="feature-card" data-reveal><span class="feature-icon">${icon(symbol)}</span><h3>${title}</h3><p>${text}</p>${href ? link(href, label || 'Explore', 'text') : ''}</article>`;
const cta = () =>
  `<section class="closing wrap" data-reveal><div class="closing-glow" aria-hidden="true"></div>${eyebrow('START WITH ONE GOOD IDEA')}<h2>Your next project.<br><span class="blue-text">A little more possible.</span></h2><p>Give Gitu a goal. Keep your tools, your context, and your say.</p><div class="actions centered">${link('download.html', 'Get Agent Gitu')}${link(config.repository, 'View on GitHub', 'secondary')}</div><p class="small muted">Windows x64 · Open source · Bring your own model</p></section>`;
const featureList = (items) => `<ul class="check-list">${items.map((text) => `<li>${icon('check')}<span>${text}</span></li>`).join('')}</ul>`;
const codeBlock = (command, label = 'Terminal') =>
  `<div class="code-block"><div class="code-bar"><span>${label}</span><button type="button" class="copy-button" data-copy="${esc(command)}" aria-label="Copy ${esc(label)} commands">Copy</button></div><pre><code>${esc(command)}</code></pre></div>`;

function screenshot(name, alt, caption, eager = true) {
  return `<figure class="app-shot"><div class="shot-viewport"><img src="assets/${name}.jpg" width="1600" height="900" alt="${esc(alt)}" loading="${eager ? 'eager' : 'lazy'}" decoding="async"></div><figcaption><span>${caption}</span><a href="assets/${name}.jpg" target="_blank" rel="noopener">View full screenshot ${icon('diagonal')}</a></figcaption></figure>`;
}
function appDemo() {
  return `<div class="real-product-demo" data-demo data-reveal><div role="tablist" aria-label="Choose a real app screenshot" class="demo-tabs screenshot-tabs"><button id="tab-work" type="button" role="tab" aria-selected="true" aria-controls="demo-panel" data-demo-tab="work">Cowork</button><button id="tab-code" type="button" role="tab" aria-selected="false" aria-controls="demo-panel" tabindex="-1" data-demo-tab="code">Coding</button><button id="tab-connections" type="button" role="tab" aria-selected="false" aria-controls="demo-panel" tabindex="-1" data-demo-tab="connections">Connected apps</button></div><div id="demo-panel" role="tabpanel" aria-labelledby="tab-work" tabindex="0"><figure class="app-shot"><div class="shot-viewport"><img data-demo-image src="assets/gitu-cowork.jpg" width="1600" height="900" alt="Actual Agent Gitu Cowork chat with Mailbox, Gmail, and Google Calendar connection suggestions for Atlas" loading="eager" decoding="async"></div><figcaption><span data-demo-caption>Real app screenshot · Connections assigned to Atlas.</span><a data-demo-full href="assets/gitu-cowork.jpg" target="_blank" rel="noopener">View full screenshot ${icon('diagonal')}</a></figcaption></figure></div></div>`;
}
function teamVisual() {
  return screenshot('gitu-cowork', 'Actual Agent Gitu Cowork interface showing connected app suggestions scoped to Atlas', 'Your teammate. Its own connected accounts.');
}
function codingVisual() {
  return screenshot(
    'gitu-coding',
    'Actual dark-theme Agent Gitu coding conversation with repository reads and expanded command activity',
    'Real repository work and command activity.',
  );
}
const faq = [
  [
    'What can Agent Gitu do?',
    'Gitu can work with code, research information, create documents, use connected apps, and coordinate agent teammates. Available actions depend on your chosen model, tools, computer, and permissions.',
  ],
  [
    'Can I choose the AI model?',
    'Yes. Agent profiles can use different supported providers and models. The source supports OpenAI, OpenRouter, DeepSeek, Gemini, compatible endpoints, and a ChatGPT subscription connection through the local Codex runtime.',
  ],
  [
    'Does it keep working when I’m away?',
    'Assigned tasks, schedules, and permitted proactive reviews can run while the hosting runtime stays available. In the Windows desktop setup, keep Agent Gitu open and the computer awake and online. A hosted server is a separate deployment.',
  ],
  [
    'Will proactive updates fill my chat?',
    'Existing findings refresh their widgets silently. A new actionable finding can create one chat notice. Unchanged evidence and dismissed widgets do not generate repeat notices.',
  ],
  [
    'Is Agent Gitu free?',
    'The software is open source under the MIT license. Model API usage, subscriptions, Composio, and cloud hosting can have their own costs. Connect the services and plans that suit your needs.',
  ],
];

const pages = [];
function page(file, title, description, body, extra = {}) {
  pages.push({ file, title, description, body, ...extra });
}
page(
  'index.html',
  'Agent Gitu — AI teammates for work, coding and research',
  'Meet Agent Gitu: an open-source AI workspace for coding, cowork teams, research and documents. Choose your models, connect your apps and stay in control.',
  `
<section class="hero wrap"><div class="hero-copy" data-reveal>${eyebrow('A LITTLE SPARK. A WORKING IDEA.')}<h1>Big ideas.<br><span class="blue-text">Real work.</span></h1><p class="hero-description">An AI workspace that helps you code, create, and get things done. One teammate or a whole team. Your tools. Your direction.</p><div class="actions">${link('download.html', 'Get Agent Gitu')}${link('#in-action', 'See it in action', 'secondary')}</div><div class="hero-footnote"><span>${icon('check')} Open source</span><span>${icon('check')} Choose your model</span><span>${icon('check')} Built for Windows</span></div></div>${'<div class="hero-app">' + screenshot('gitu-cowork', 'Agent Gitu’s actual Windows interface with connected app suggestions', 'A real workspace. Ready for your direction.', true) + '</div>'}</section>
<section class="demo-section wrap" id="in-action"><div class="demo-heading"><span class="mono">FROM A REQUEST TO A RESULT</span><a href="cowork.html">Meet your workspace ${icon('diagonal')}</a></div>${appDemo()}</section>
<section class="provider-strip wrap" aria-label="Supported provider examples"><p>Your intelligence, on your terms.</p><div><span>OpenAI</span><span>DeepSeek</span><span>OpenRouter</span><span>Gemini</span><span>ChatGPT</span><span class="mono">+ compatible APIs</span></div><p class="small">Connect a supported provider or subscription. Availability and usage limits vary.</p></section>
<section class="wrap section-space">${heading('ONE WORKSPACE. MORE POSSIBILITIES.', 'A place for the work<br>you actually do.', 'Start with a clear goal. Let Gitu work with the context, files, and tools you choose.')}<div class="feature-grid">${card('team', 'A team when you need one.', 'Give your teammates distinct roles, skills, models, and responsibilities. Bring their work together in one conversation.', 'cowork.html', 'Meet Cowork')}${card('code', 'From a bug to a better build.', 'Explore your repository, make focused changes, and inspect the checks that support the result.', 'coding.html', 'Explore coding')}${card('file', 'Ideas into something useful.', 'Research a question, prepare a brief, or create a document. Open the output, review it, and refine it together.', 'docs.html#first-task', 'Find your first task')}</div></section>
<section class="wrap section-space editorial-split"><div data-reveal>${eyebrow('CONTEXT MAKES THE DIFFERENCE')}<h2>Less repeating.<br><span class="blue-text">More understanding.</span></h2><p>Keep useful preferences, project context, and reusable skills close to the work. Gitu can use what you’ve shared to make the next task more informed.</p>${featureList(['Private memories scoped to your teammate.', 'Connected accounts assigned to the right agent.', 'Proactivity you can turn up—or turn off.'])}${link('connections.html', 'Connect your world', 'text')}</div><div class="context-visual" data-reveal><div class="context-row">${icon('mail')}<span>Your connected apps</span><b>Assigned</b></div><div class="context-row">${icon('spark')}<span>Your preferences</span><b>Remembered</b></div><div class="context-row">${icon('file')}<span>Your project context</span><b>In scope</b></div><div class="context-path" aria-hidden="true"></div><div class="context-result"><img src="assets/agent-gitu-mark.svg" width="44" height="44" alt=""><div>A useful next step.<small>Grounded in the context you provide.</small></div>${icon('arrow')}</div></div></section>
<section class="wrap section-space quiet-section"><div class="quiet-widget" data-reveal><div class="quiet-widget-head">${icon('mail')} Inbox snapshot <span class="live-badge">Quiet refresh</span></div><div class="quiet-widget-number">12 <span>unread emails</span></div><div class="quiet-chart" aria-hidden="true">${Array.from({ length: 14 }, (_, i) => `<i style="--bar:${[24, 40, 32, 55, 43, 68, 55, 80, 65, 90, 72, 60, 40, 32][i]}%;--delay:${i * 60}ms"></i>`).join('')}</div><div class="quiet-widget-footer">${icon('check')} Same widget. Fresh information.</div><p class="tiny-note">Example data</p></div><div data-reveal>${eyebrow('HELPFUL, WITHOUT THE NOISE')}<h2>Keep the update.<br>Skip the interruption.</h2><p>Permitted app reviews can spot useful changes when your agent is idle. Existing widgets update in place, so every refresh doesn’t become another chat message.</p><p class="small muted">Scheduled reviews require proactivity to be enabled and the runtime to stay available. “Follow my lead” keeps unsolicited app reviews off.</p>${link('quiet-proactivity.html', 'How quiet proactivity works', 'text')}</div></section>
<section class="wrap section-space">${heading('YOU SET THE BOUNDARIES', 'Capable by design.<br>Yours by choice.', 'Choose the model, computer, connected accounts, and permissions for each teammate.')}<div class="principles">${card('lock', 'Permissions with a purpose.', 'A suggestion gives you an option. It doesn’t grant permission to send, buy, delete, or change external data.')}${card('globe', 'Your workspace, your setup.', 'Work on your computer, use a private desktop, or connect a configured cloud computer. See where the work runs.')}${card('check', 'See what supports the answer.', 'Inspect tool results, task progress, and artifacts. Know what was checked and what still needs your input.')}</div>${link('security.html', 'Understand data and control', 'text')}</section>
<section class="wrap section-space faq-section">${heading('GOOD QUESTIONS', 'A few things to know.', '')}<div class="faq-list">${faq.map(([q, a]) => `<details><summary>${q}<span aria-hidden="true">+</span></summary><p>${a}</p></details>`).join('')}</div></section>${cta()}`,
  { faq },
);

page(
  'cowork.html',
  'AI cowork teams with roles, memory and tools — Agent Gitu',
  'Build your AI cowork team in Agent Gitu. Give teammates separate roles, models, skills and permissions, then collaborate in direct messages or group chats.',
  `${pageHero('MEET COWORK', 'Your ideas.<br><span class="blue-text">A team to move them.</span>', 'Some days you need a second pair of eyes. Others, a researcher, an engineer, and a writer. Build the team around the work.', teamVisual())}<section class="wrap section-space">${heading('MAKE THE TEAM YOUR OWN', 'Different strengths.<br>A shared direction.', 'These are examples, not fixed job titles. Name your agents and choose the responsibilities that fit your work.')}<div class="role-grid">${card('spark', 'The coordinator', 'Keeps the goal clear, brings teammate results together, and helps you decide what comes next.')}${card('globe', 'The researcher', 'Finds relevant information, checks sources, and turns a broad question into a useful brief.')}${card('code', 'The engineer', 'Works with the repository, tools, and computer you permit. Makes focused changes and checks the result.')}${card('file', 'The writer', 'Turns the shared context into documents, reports, and clear communication you can review.')}</div></section><section class="wrap section-space editorial-split"><div data-reveal>${eyebrow('A CONVERSATION THAT MOVES WORK')}<h2>Talk to one.<br>Bring in the team.</h2><p>Use a direct message for focused work. Start a group when a project needs several perspectives. Mention a teammate to target a request, or let your configured coordinator bring the work together.</p>${featureList(['Separate profiles, models, and skills.', 'Queued messages keep requests in order.', 'Shared artifacts make results easy to inspect.'])}</div><div class="conversation-card" data-reveal><span class="mono">EXAMPLE PROJECT / WEEKLY BRIEF</span><p class="chat-bubble chat-user">Scout, research the options. Scribe, turn the findings into a short brief.</p><div class="handoff-row"><span class="avatar avatar-cyan">S</span><div><b>Scout</b><p>Sources checked. Findings ready for review.</p></div>${icon('check')}</div><div class="handoff-row"><span class="avatar avatar-light">S</span><div><b>Scribe</b><p>A concise brief, based on the shared findings.</p></div>${icon('file')}</div><p class="small muted">Illustrative team workflow</p></div></section><section class="wrap section-space">${heading('A LITTLE CONTEXT GOES A LONG WAY', 'Teammates that fit<br>the way you work.', 'Profiles shape the tone and responsibilities. Memory preserves useful preferences. Permissions determine what each agent can actually do.')}<div class="feature-grid">${card('spark', 'Personality and roles', 'Set communication style and responsibilities. Choose “Follow my lead” or “Suggest useful next steps.”')}${card('clock', 'Schedules and follow-ups', 'Ask for recurring work or a follow-up. Due tasks run while the hosting runtime remains available.')}${card('lock', 'Control at every handoff', 'Assigned accounts and tool permissions remain scoped to the teammate. Blocking approvals pause dependent work.')}</div></section><section class="wrap section-space note-section"><h2>Start small. Get useful.</h2><p>Create one teammate. Give it one clear outcome. Connect only the tools that task needs. Add more roles as your work grows.</p>${link('docs.html#cowork-setup', 'Set up your first teammate', 'text')}</section>${cta()}`,
);

page(
  'coding.html',
  'AI coding agent with project context and verification — Agent Gitu',
  'Use Agent Gitu to explore repositories, fix bugs and build features. Keep project scope, inspect changes and verify results with relevant checks.',
  `${pageHero('BUILT FOR THE REPOSITORY', 'From “what if”<br><span class="blue-text">to working code.</span>', 'An AI coding workspace for understanding the project, making the change, and checking what comes back.', codingVisual())}<section class="wrap section-space">${heading('THE WORK, NOT JUST THE ANSWER', 'Context first.<br>Confidence earned.', 'Give Gitu a repository and a clear outcome. Its coding workflow keeps the project, task state, and evidence close to the change.')}<div class="workflow-grid">${[
    ['01', 'Understand', 'Read the relevant files and the project’s instructions before changing the code.'],
    ['02', 'Make the change', 'Work inside the selected project and keep the edit focused on the requested outcome.'],
    ['03', 'Check the result', 'Run meaningful tests or checks. Failed checks remain visible and inform the next action.'],
    ['04', 'Show the work', 'Review the changes, supporting results, and limitations before deciding what to ship.'],
  ]
    .map(([n, t, d]) => `<article data-reveal><span class="step-number">${n}</span><h3>${t}</h3><p>${d}</p></article>`)
    .join(
      '',
    )}</div></section><section class="wrap section-space editorial-split"><div data-reveal>${eyebrow('YOUR MODEL. YOUR TOOLCHAIN.')}<h2>Keep the setup<br>that works for you.</h2><p>Choose a supported model provider, work with your local tools, and use reusable skills for the workflows your project repeats.</p>${featureList(['Project-aware task state and memory.', 'Repository changes and tool evidence you can inspect.', 'A command-line interface alongside the desktop workspace.'])}</div><div data-reveal>${codeBlock('node dist/cli.js init\nnode dist/cli.js run "Fix the failing request handler" \\\n  --criteria "existing tests pass|request behavior is verified"', 'A real CLI starting point')}</div></section><section class="wrap section-space"><div class="feature-grid">${card('code', 'Explore unfamiliar code', 'Find the paths that matter, understand the current behavior, and build a grounded explanation.')}${card('check', 'Turn a bug into a checked change', 'Use a concrete failure and relevant verification to guide the edit. Inspect the result before shipping.')}${card('team', 'Bring in another perspective', 'Use specialist teammates for research or implementation, then bring their evidence back to the main task.')}</div></section><section class="wrap section-space note-section"><h2>Good checks matter.</h2><p>A successful command is useful only when it supports the requested outcome. Gitu’s task workflow tracks completion criteria and evidence; you can still inspect the code and decide whether the result is ready.</p>${link(`${config.repository}#the-control-loop`, 'Read the architecture', 'text')}</section>${cta()}`,
);

page(
  'connections.html',
  'Connected apps and scoped agent permissions — Agent Gitu',
  'Connect apps to Agent Gitu through Composio or native mail. Assign accounts to teammates, approve the tools they need and use your context for useful work.',
  `${pageHero('BRING YOUR WORLD INTO THE WORK', 'Your apps.<br><span class="blue-text">A useful connection.</span>', 'The best answer starts with the right context. Connect an account, assign it to a teammate, and choose the access that makes sense.', screenshot('gitu-connections', 'Actual Connections screen showing teammate-scoped apps, connection states, and proactive update controls', 'Your apps. Your teammate. Your update preferences.'))}<section class="wrap section-space">${heading('CONNECT WITH INTENT', 'Right account.<br>Right teammate.', 'Use Composio for supported connected services, or configure a native mailbox. Available integrations and actions depend on your provider and account.')}<div class="workflow-grid">${[
    ['01', 'Connect', 'Sign into the service through its supported connection flow. Sign-in stays with you.'],
    ['02', 'Assign', 'Choose which teammate can use the connected account. Another agent does not inherit that access.'],
    ['03', 'Allow', 'Review the requested action. Give a one-time approval or allow that exact tool for the assigned account.'],
    ['04', 'Use', 'Ask the teammate for an outcome. It uses the permitted tools and reports the result.'],
  ]
    .map(([n, t, d]) => `<article data-reveal><span class="step-number">${n}</span><h3>${t}</h3><p>${d}</p></article>`)
    .join(
      '',
    )}</div></section><section class="wrap section-space editorial-split"><div data-reveal>${eyebrow('SMALL REQUEST. DIRECT ANSWER.')}<h2>“How many unread<br>emails do I have?”</h2><p>A count request should stay a count request. Gitu is guided to use the smallest sufficient read, reuse successful results, and answer when the evidence is available.</p><p>When a provider returns thread counts or estimates, the agent should explain that distinction instead of presenting an unsupported exact email count.</p>${link('quiet-proactivity.html', 'Read the latest workflow improvements', 'text')}</div><div class="permission-example" data-reveal><span class="mono">EXAMPLE PERMISSION</span><h3>${icon('mail')} Read inbox information</h3><dl><div><dt>Account</dt><dd>Your assigned mailbox</dd></div><div><dt>Teammate</dt><dd>Gitu</dd></div><div><dt>Permission</dt><dd>Exact read tool</dd></div></dl><p>${icon('lock')} Sending or changing data requires its own permission.</p></div></section><section class="wrap section-space"><div class="feature-grid">${card('spark', 'Suggestions with context', 'When enabled, permitted reviews can combine app evidence, recent requests, and shared preferences to identify useful next steps.')}${card('clock', 'Reviews while idle', 'Eligible background app reviews are spaced about six hours apart and defer when the agent is working in another chat.')}${card('lock', 'Useful boundaries', 'Background app reviews use previously allowed read tools. A recommendation is not permission to perform an external action.')}</div></section>${cta()}`,
);

const install = `git clone ${config.repository}.git\ncd agent-gitu\nnpm install\nnpm run build\nnpm run app`;
page(
  'docs.html',
  'Agent Gitu documentation — install, models and cowork setup',
  'Get started with Agent Gitu. Install the Windows app or build from source, choose a model, create a teammate and configure connected apps and proactivity.',
  `<section class="wrap page-hero page-hero-simple">${eyebrow('THE DOCUMENTATION')}<h1>A good place<br><span class="blue-text">to get started.</span></h1><p class="hero-description">A short path from installing Gitu to giving your first teammate a useful task.</p></section><div class="wrap docs-layout"><aside class="docs-sidebar"><span class="mono">ON THIS PAGE</span><nav aria-label="Documentation contents"><a href="#installation">Installation</a><a href="#models">Choose a model</a><a href="#cowork-setup">Create a teammate</a><a href="#connections">Connect an app</a><a href="#proactivity">Set proactivity</a><a href="#first-task">Your first task</a><a href="#background">Background work</a><a href="#source-docs">Full documentation</a></nav></aside><article class="docs-content"><section id="installation"><h2>01 / Install Agent Gitu</h2><p>The desktop installers target Windows x64. Use the Setup installer for a normal installation, or choose Portable if you want to launch the packaged app without the installation wizard.</p>${link('download.html', 'Find Windows downloads', 'text')}<h3>Build from source</h3><p>Install Node.js ${pkg.engines.node.replace('>=', '')} or newer, then run:</p>${codeBlock(install, 'Source installation')}<p>For the web interface, start the server and open its local address:</p>${codeBlock('node dist/cli.js ui --port 8321', 'Web UI')}<p class="small muted">Local web UI: <code>http://localhost:8321</code>. The mobile companion has a separate setup described in the repository.</p></section><section id="models"><h2>02 / Choose your model</h2><p>Open the app’s provider settings and connect a supported model provider. You can set a provider and model for each cowork teammate.</p><p>Supported paths include OpenAI, OpenRouter, DeepSeek, Gemini, compatible API endpoints, and a ChatGPT subscription through the local Codex runtime. Provider access and costs depend on your account.</p><p>Start with a model that fits the task. A small lookup and a long coding project do not need the same amount of effort.</p></section><section id="cowork-setup"><h2>03 / Create a teammate</h2><p>Open Cowork, create an agent, and give it a name and a clear responsibility. Choose its model and computer. Enable shell, write, or configuration capabilities only when the work needs them.</p><p>Use a direct message for one teammate. Use a group chat when several roles should collaborate. You can mention a teammate by name to target a request.</p></section><section id="connections"><h2>04 / Connect the tools you need</h2><p>In Cowork → Connections, configure your Composio project or a native mailbox. Connect an account and assign it to the teammate that needs it.</p><p>When an action needs permission, review the actual account and tool. “Always allow” applies to that exact action tool for that teammate and account; it is not blanket permission for every action.</p>${link('connections.html', 'Understand connected apps', 'text')}</section><section id="proactivity"><h2>05 / Choose proactive behavior</h2><ol class="numbered-list"><li>Open Cowork and select the agent.</li><li>Go to Profile → Personality.</li><li>Under Proactivity, choose “Follow my lead” or “Suggest useful next steps.”</li><li>Click Save changes.</li></ol><p>“Follow my lead” keeps the agent focused on your requests and disables unsolicited app reviews. Suggestion mode allows relevant next steps from evidence already available; it should not trigger extra searches just to invent recommendations.</p><p>For automatic background reviews, also enable Proactive in the team Learning mode setting. Reviews require assigned accounts and previously allowed read tools.</p></section><section id="first-task"><h2>06 / Give it one clear outcome</h2><p>Describe the result you want, the context that matters, and any practical limits. Start with one task you can easily assess.</p><div class="prompt-examples"><blockquote>“Compare these three options using the attached notes. Give me a short table with sources.”</blockquote><blockquote>“Fix this bug in the current repository. Explain the change and run the relevant checks.”</blockquote><blockquote>“Tell me the unread email count. Explain whether the provider counts emails or threads.”</blockquote></div><p>Inspect the answer or artifact before expanding the workflow. Add roles and reusable skills when they solve a repeatable need.</p></section><section id="background"><h2>07 / Keep background work available</h2><p>Tasks you give the agent begin without waiting for a six-hour review interval. Saved schedules follow their own timing.</p><p>Background app reviews are eligible about every six hours per agent, while idle. For the Windows desktop setup, keep Agent Gitu open and the computer awake and online. Closing the app stops that local runtime. A cloud computer for tools does not, by itself, move the agent scheduler into the cloud.</p><p>Existing widgets refresh silently; new actionable findings can create a notice. Required approvals or missing sign-ins can pause dependent work until you return.</p></section><section id="source-docs"><h2>Keep exploring</h2><p>The repository contains detailed setup, architecture, provider, computer, and mobile companion documentation.</p><div class="actions">${link(`${config.repository}#readme`, 'Read the repository docs', 'secondary')}${link(`${config.repository}/issues`, 'Report an issue', 'secondary')}</div></section></article></div>${cta()}`,
);

page(
  'download.html',
  'Download Agent Gitu for Windows — Setup and Portable',
  'Get Agent Gitu for Windows x64 through GitHub Releases, or build the latest source yourself. Choose a Setup installer or a Portable executable.',
  `${pageHero('YOUR NEXT WORKSPACE', 'A little spark.<br><span class="blue-text">On your desktop.</span>', 'Get the Windows desktop app, connect your model, and put a useful teammate beside your work.', '', '#windows-downloads', 'Choose your download')}<section class="wrap download-grid" id="windows-downloads"><article class="download-card" data-reveal><span class="download-symbol">${icon('download')}</span><span class="tag">WINDOWS X64</span><h2>Setup installer</h2><p>A guided installation with a choice of installation directory. A straightforward home for your daily workspace.</p>${link(`${config.repository}/releases/latest`, 'Find Setup on GitHub')}<p class="small muted">Choose the Setup .exe in the release assets.</p></article><article class="download-card" data-reveal><span class="download-symbol">${icon('globe')}</span><span class="tag">WINDOWS X64</span><h2>Portable build</h2><p>The packaged desktop app in a Portable executable. Launch it without running the normal installation wizard.</p>${link(`${config.repository}/releases/latest`, 'Find Portable on GitHub', 'secondary')}<p class="small muted">Choose the Portable .exe in the release assets.</p></article></section><section class="wrap section-space editorial-split"><div data-reveal>${eyebrow('OPEN SOURCE. OPEN POSSIBILITIES.')}<h2>Prefer the source?<br>Make it yours.</h2><p>The current source version is ${pkg.version}. Published installers may follow a different release schedule; GitHub lists the version and assets available to download.</p><p>The software is MIT licensed. Model usage, subscriptions, connected services, and hosting can have separate costs.</p>${link('docs.html#installation', 'Build from source', 'text')}</div><div data-reveal>${codeBlock(install, 'Build the current source')}</div></section><section class="wrap section-space"><div class="feature-grid">${card('spark', 'Bring a model', 'Connect a supported API provider or subscription. The Windows installer does not include an unlimited model plan.')}${card('lock', 'Choose your permissions', 'Create a teammate and enable only the capabilities and connected accounts its work needs.')}${card('clock', 'Keep the runtime available', 'For local scheduled work, keep the application running and your computer awake and connected.')}</div></section><section class="wrap section-space note-section"><h2>Need a hand getting started?</h2><p>Follow the setup guide or report a concrete problem in the repository. Include what you expected and what happened; leave credentials and private messages out of issue reports.</p><div class="actions">${link('docs.html', 'Read the getting-started guide', 'secondary')}${link(`${config.repository}/issues`, 'Open GitHub Issues', 'secondary')}</div></section>`,
);

page(
  'blog.html',
  'Agent Gitu updates — product notes and practical workflows',
  'Read Agent Gitu product updates and workflow notes about AI cowork teams, connected apps and quiet proactive widgets.',
  `${pageHero('NOTES FROM THE WORKSPACE', 'Built in the open.<br><span class="blue-text">Made for real work.</span>', 'Product notes, practical workflows, and the decisions behind a more useful AI workspace.')}<section class="wrap section-space article-list"><a class="featured-article" href="quiet-proactivity.html" data-reveal><div class="article-art" aria-hidden="true"><img src="assets/gitu-signal.jpg" width="1774" height="887" loading="lazy" alt=""></div><div><span class="mono small">PRODUCT NOTES · OCTOBER 10, 2026</span><h2>Useful updates.<br>Without the chat noise.</h2><p>How Gitu’s connected-app reviews, scoped permissions, and quiet widget refreshes work together.</p><span class="article-link">Read the product note ${icon('arrow')}</span></div></a><div class="article-resources"><h2>More ways to explore</h2><div class="feature-grid">${card('team', 'Build your first cowork team', 'Start with a focused teammate and add roles when the work needs another perspective.', 'cowork.html', 'Explore Cowork')}${card('code', 'From repository to result', 'See how project context and relevant checks support a useful coding workflow.', 'coding.html', 'Explore coding')}${card('file', 'Set up your workspace', 'Connect a model, choose permissions, and give Gitu your first clear task.', 'docs.html', 'Read the guide')}</div></div></section>`,
);

page(
  'quiet-proactivity.html',
  'Quiet proactivity: useful widgets without repeated chat notices — Agent Gitu',
  'Learn how Agent Gitu reviews permitted apps while idle, uses personal context, refreshes existing widgets silently and respects Follow my lead.',
  `<section class="wrap article-hero">${eyebrow('PRODUCT NOTES / OCTOBER 10, 2026')}<h1>Useful updates.<br><span class="blue-text">Without the chat noise.</span></h1><p class="hero-description">The next step should help you move forward. It shouldn’t turn every small request into another project.</p><p class="small muted">Agent Gitu · Development notes · 5 minute read</p></section><div class="wrap article-banner"><img src="assets/gitu-signal.jpg" width="1774" height="887" alt="An original blue ribbon sculpture above a dark reflective surface" loading="lazy"></div><article class="article-content wrap"><h2>Start with the task you actually asked for</h2><p>An unread email count needs a count. A follow-up question about a selected product should reuse that product’s context. Gitu’s shared behavior guidance asks agents to gather enough evidence, answer directly, and avoid extra searches just to create suggestions.</p><p>The runtime also stops unchanged repeated reads. Connector schemas and large responses remain available without cutting structured data in the middle. These changes target unnecessary work; actual response time still depends on the model and connected service.</p><h2>Use context with permission</h2><p>A proactive app review can combine your recent requests, saved preferences, the agent’s responsibilities, and evidence from an assigned account. It uses previously allowed read tools. It does not gain permission to send a message, purchase something, or change an account just because it found a useful idea.</p><h2>One widget, updated quietly</h2><div class="article-callout"><strong>A new actionable finding:</strong> create a widget and post a notice.<br><strong>A useful change:</strong> refresh the same widget silently.<br><strong>Unchanged evidence:</strong> no repeat update or notice.<br><strong>A dismissed widget:</strong> keep it dismissed.</div><p>Provider execution IDs are not treated as new content. This matters because a fresh API call can return a different log ID even when the underlying information hasn’t changed.</p><h2>Let the foreground task finish</h2><p>Eligible app reviews are spaced about six hours apart and run while the agent is idle. They defer when that agent is busy in any conversation. If a task starts during a review, the review stops before producing a new finding.</p><p>The six-hour interval applies to background app reviews. Your requests start without that delay, and scheduled tasks use their own schedule.</p><h2>Make proactivity a choice</h2><p>Open Cowork → your agent → Profile → Personality. “Follow my lead” disables unsolicited app reviews. “Suggest useful next steps” permits relevant recommendations from evidence already available. Enable the team’s Proactive learning mode for automatic app reviews.</p><p>For the local Windows setup, the app must remain open and the computer awake and online. Selecting a remote computer for tools does not automatically host the scheduler there.</p><h2>Verify the behavior</h2><p>The October 10 update passed 67 targeted tests, including quiet refreshes across restarts, dismissal, changing execution metadata, profile preferences, and agents becoming busy in another conversation. The production build and targeted lint checks passed too.</p><p>Those checks verify the implementation’s behavior. They are not a live Gmail speed benchmark or a promise about every model’s latency.</p><div class="actions">${link('docs.html#proactivity', 'Set your proactivity preferences', 'secondary')}${link(`${config.repository}/commit/a079bb4e53ee6d8aba6007608e5f8a8e49a9e851`, 'Read the source change', 'secondary')}</div></article>${cta()}`,
  { type: 'article' },
);

page(
  'security.html',
  'Data, models and agent permissions — Agent Gitu',
  'Understand where Agent Gitu runs, how model requests and connected apps use data, and how teammate permissions and memories keep work scoped.',
  `${pageHero('UNDERSTAND THE BOUNDARIES', 'Your workspace.<br><span class="blue-text">Your say.</span>', 'A useful agent needs context and tools. You should be able to see what you connect, where work runs, and what you permit.')}<section class="wrap section-space"><div class="feature-grid">${card('globe', 'Where work runs', 'The Windows app hosts the local agent runtime. Tools can use your computer, a private desktop, or a configured cloud computer. Remote execution is a deliberate setup choice.')}${card('spark', 'Where model requests go', 'Your selected provider receives the context needed for a model request. Local app storage does not mean every inference runs locally.')}${card('lock', 'What accounts can do', 'Connected accounts are assigned per teammate. Exact tool approvals determine which actions the agent can execute on those accounts.')}</div></section><section class="wrap section-space editorial-split"><div data-reveal>${eyebrow('CONTEXT YOU CAN MANAGE')}<h2>Remember what helps.<br>Review what stays.</h2><p>Agent profiles support scoped memory and useful preferences. Review or remove memories as your needs change, and avoid putting secrets into ordinary chat.</p><p>Sign-in flows and credential controls are separate from the agent’s conversation. The selected provider and connection service also have their own data policies and account settings.</p>${link(`${config.repository}#account-registration-and-connected-services`, 'Read connection handling details', 'text')}</div><div class="permission-example" data-reveal><span class="mono">A PRACTICAL CHECKLIST</span>${featureList(['Choose the teammate’s computer and model.', 'Assign only the accounts its work needs.', 'Inspect the tool and account in approval cards.', 'Review useful memories and saved artifacts.', 'Revoke account access when it is no longer needed.'])}</div></section><section class="wrap section-space note-section"><h2>Suggestions are options.</h2><p>A proactive finding can point out a deadline or issue. It does not authorize purchases, sending messages, deletions, or changes to external data. Required approvals remain part of the workflow.</p><p>This page explains current product behavior. For implementation details, inspect the source and the policies of the providers you connect.</p>${link(config.repository, 'Explore the source', 'text')}</section>${cta()}`,
);

const navigation = [
  ['cowork.html', 'Cowork'],
  ['coding.html', 'Coding'],
  ['connections.html', 'Connections'],
  ['docs.html', 'Docs'],
];
function header(current) {
  return `<a class="skip-link" href="#main">Skip to content</a><header class="site-header"><div class="wrap nav-inner"><a class="brand" href="index.html" aria-label="Agent Gitu home"><img src="assets/agent-gitu-mark.svg" width="34" height="34" alt=""><span>Agent Gitu<span class="brand-dot">.</span></span></a><button class="nav-toggle" type="button" aria-controls="main-navigation" aria-expanded="false" aria-label="Open navigation"><span></span><span></span></button><nav id="main-navigation" class="main-navigation" aria-label="Main navigation">${navigation.map(([url, label]) => `<a href="${url}"${current === url ? ' aria-current="page"' : ''}>${label}</a>`).join('')}<a class="nav-github" href="${config.repository}" aria-label="Agent Gitu on GitHub">${icon('github')}</a>${link('download.html', 'Get Gitu', 'nav')}</nav></div></header>`;
}
function footer() {
  return `<footer class="site-footer wrap"><div class="footer-top"><div><a class="brand" href="index.html"><img src="assets/agent-gitu-mark.svg" width="34" height="34" alt=""><span>Agent Gitu<span class="brand-dot">.</span></span></a><p>A little spark.<br>A working idea.</p></div><div class="footer-column"><h2>Workspace</h2><a href="cowork.html">Cowork</a><a href="coding.html">Coding</a><a href="connections.html">Connected apps</a><a href="download.html">Download</a></div><div class="footer-column"><h2>Explore</h2><a href="docs.html">Documentation</a><a href="blog.html">Product notes</a><a href="security.html">Data &amp; control</a><a href="${config.repository}/issues">GitHub Issues</a></div><div class="footer-column"><h2>Build with us</h2><a href="${config.repository}">Source code ${icon('diagonal')}</a><a href="${config.repository}/releases">Releases ${icon('diagonal')}</a><span class="footer-license">Open source · MIT</span></div></div><div class="footer-bottom"><span>© ${config.updated.slice(0, 4)} Agent Gitu</span><span>Model and connected-service costs may apply.</span><a href="#main">Back to top ↑</a></div></footer>`;
}
function document(p) {
  const preview = p.file === 'coding.html' ? 'gitu-coding' : p.file === 'connections.html' ? 'gitu-connections' : 'gitu-cowork';
  const url = config.origin + (p.file === 'index.html' ? '/' : '/' + p.file);
  const graph = [
    {
      '@type': 'Organization',
      '@id': config.origin + '/#organization',
      name: config.name,
      url: config.origin + '/',
      logo: config.origin + '/assets/agent-gitu-icon.png',
      sameAs: [config.repository],
    },
    {
      '@type': p.type === 'article' ? 'Article' : 'WebPage',
      '@id': url + '#page',
      url,
      name: p.title,
      headline: p.title,
      description: p.description,
      inLanguage: 'en',
      publisher: { '@id': config.origin + '/#organization' },
      image: config.origin + '/assets/' + preview + '.jpg',
      ...(p.type === 'article' ? { datePublished: config.updated, dateModified: config.updated, author: { '@id': config.origin + '/#organization' } } : {}),
    },
  ];
  if (p.file === 'index.html')
    graph.push({
      '@type': 'SoftwareApplication',
      name: config.name,
      applicationCategory: 'ProductivityApplication',
      operatingSystem: 'Windows',
      url: config.origin + '/',
      downloadUrl: config.origin + '/download.html',
      license: 'https://opensource.org/license/mit',
      softwareVersion: pkg.version,
      description: p.description,
    });
  else
    graph.push({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: config.origin + '/' },
        { '@type': 'ListItem', position: 2, name: p.title.split(' — ')[0], item: url },
      ],
    });
  if (p.faq) graph.push({ '@type': 'FAQPage', mainEntity: p.faq.map(([name, text]) => ({ '@type': 'Question', name, acceptedAnswer: { '@type': 'Answer', text } })) });
  return `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${esc(p.title)}</title>\n<meta name="description" content="${esc(p.description)}">\n<meta name="robots" content="index,follow,max-image-preview:large">\n<meta name="theme-color" content="#06080d">\n<link rel="canonical" href="${url}">\n<meta property="og:site_name" content="Agent Gitu">\n<meta property="og:title" content="${esc(p.title)}">\n<meta property="og:description" content="${esc(p.description)}">\n<meta property="og:type" content="${p.type === 'article' ? 'article' : 'website'}">\n<meta property="og:url" content="${url}">\n<meta property="og:image" content="${config.origin}/assets/${preview}.jpg">\n<meta property="og:image:width" content="1600">\n<meta property="og:image:height" content="900">\n<meta property="og:image:alt" content="Agent Gitu’s actual Windows app interface">\n<meta name="twitter:card" content="summary_large_image">\n<meta name="twitter:title" content="${esc(p.title)}">\n<meta name="twitter:description" content="${esc(p.description)}">\n<meta name="twitter:image" content="${config.origin}/assets/${preview}.jpg">\n<link rel="icon" type="image/svg+xml" href="assets/agent-gitu-mark.svg">\n<link rel="apple-touch-icon" href="assets/agent-gitu-icon.png">\n<link rel="preload" href="assets/fonts/inter-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>\n<link rel="preload" href="assets/fonts/inter-latin-600-normal.woff2" as="font" type="font/woff2" crossorigin>\n<link rel="stylesheet" href="styles.css">\n<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c')}</script>\n<script src="script.js" defer></script>\n</head>\n<body data-page="${p.file.replace('.html', '')}">\n${header(p.file)}\n<main id="main">${p.body}</main>\n${footer()}\n</body>\n</html>\n`;
}
for (const p of pages) fs.writeFileSync(path.join(root, p.file), document(p));
fs.writeFileSync(
  path.join(root, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map((p) => `  <url><loc>${config.origin}${p.file === 'index.html' ? '/' : '/' + p.file}</loc><lastmod>${config.updated}</lastmod></url>`).join('\n')}\n</urlset>\n`,
);
fs.writeFileSync(path.join(root, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /build.cjs\nDisallow: /site.config.json\nSitemap: ${config.origin}/sitemap.xml\n`);
fs.writeFileSync(
  path.join(root, 'github.html'),
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Download Agent Gitu</title><meta name="robots" content="noindex,follow"><meta http-equiv="refresh" content="0;url=download.html"><link rel="canonical" href="${config.origin}/download.html"></head><body><p>Continue to <a href="download.html">Agent Gitu downloads</a>.</p></body></html>\n`,
);
fs.writeFileSync(
  path.join(root, '404.html'),
  document({
    file: '404.html',
    title: 'Page not found — Agent Gitu',
    description: 'Return to the Agent Gitu workspace website.',
    body: `<section class="wrap page-hero page-hero-simple">${eyebrow('404 / A SMALL DETOUR')}<h1>Let’s find<br><span class="blue-text">your way back.</span></h1><p class="hero-description">This page isn’t here. Your next idea still is.</p>${link('index.html', 'Back to the workspace')}</section>`,
  })
    .replace('index,follow,max-image-preview:large', 'noindex,follow')
    .replace(/(href|src)="(?!https?:|#|\/)([^"]+)"/g, '$1="/$2"'),
);
console.log(`Built ${pages.length} SEO pages, sitemap, robots.txt, and fallback pages for ${config.origin}.`);
