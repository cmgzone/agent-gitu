import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

function getGitToken() {
  const out = execSync('git credential fill', { input: 'protocol=https\nhost=github.com\n' }).toString();
  const line = out.split('\n').find((l) => l.startsWith('password='));
  const token = line ? line.slice(9).trim() : '';
  if (!token) throw new Error('Could not find GitHub token in git credential manager');
  return token;
}

async function sha256File(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const version = pkg.version;
const owner = 'cmgzone';
const repo = 'agent-gitu';
const tag = `v${version}`;
const releaseName = `Agent Gitu v${version}`;

const setupName = `Agent-Gitu-Setup-${version}.exe`;
const portableName = `Agent-Gitu-Portable-${version}.exe`;
const blockmapName = `${setupName}.blockmap`;
const setupShaName = `${setupName}.sha256`;

const setupPath = path.join('release', setupName);
const portablePath = path.join('release', portableName);
const blockmapPath = path.join('release', blockmapName);
const sumsPath = path.join('release', 'SHA256SUMS.txt');
const setupShaPath = path.join('release', setupShaName);

async function main() {
  for (const required of [setupPath, portablePath, blockmapPath]) {
    if (!existsSync(required)) throw new Error(`Missing release artifact: ${required}. Run npm run dist first.`);
  }

  const setupSha = await sha256File(setupPath);
  const portableSha = await sha256File(portablePath);

  writeFileSync(setupShaPath, `${setupSha} *${setupName}\n`, 'utf8');
  writeFileSync(sumsPath, `${setupSha} *${setupName}\n${portableSha} *${portableName}\n`, 'utf8');

  const body = `## What's Changed in Agent Gitu v${version}

- **Astryx UI & Pikpam Console Redesign:** Upgraded Workspace, Cowork, Agents, Connections, Profile, and Settings views with Astryx components, Cowork-first navigation, cleaner coding reports, and collapsed tool stage file/line counts.
- **PikRouter & Pikpam Cloud Integration:** Added Pikpam hosted OAuth sign-in/register and credit top-up flow, dynamic live model catalog search, credit usage display, Composio connections, and verified Pikpam Cloud operations.
- **Chief of Staff & Workspace Cleanup:** Added persisted Chief of Staff authority controls, standing answer rules, and decision log; removed legacy Company mode and Company-only storage subsystem.
- **Cowork Teams & Live Voice:** Enabled parallel Cowork sub-agents, group handoffs, selected-project awareness, proactive P.A onboarding/app learning, and LiveKit voice mode with aura visualizer and background voice suppression.
- **Mobile Companion & Pairing:** Added QR phone pairing, third-party framing protection, and synced workspace theme support.
- **Desktop Startup & Large-Project Performance:** Faster Electron startup, hardened large-project indexing, and improved worktree recovery.

### Windows x64 Downloads

- **Setup Installer:** \`${setupName}\`
- **Portable Executable:** \`${portableName}\`

### Verification Checksums (SHA-256)
\`\`\`
${setupSha} *${setupName}
${portableSha} *${portableName}
\`\`\`
`;

  const token = getGitToken();
  const headers = {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    'User-Agent': 'agent-gitu-releaser',
  };

  console.log(`Creating release ${tag}...`);
  const createRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      tag_name: tag,
      target_commitish: 'main',
      name: releaseName,
      body,
      draft: false,
      prerelease: false,
    }),
  });

  const release = await createRes.json();
  if (!createRes.ok) {
    throw new Error(`Failed to create release: ${createRes.status} ${JSON.stringify(release)}`);
  }

  console.log(`Release created: ${release.html_url} (ID: ${release.id})`);

  const files = [
    { file: setupPath, contentType: 'application/octet-stream' },
    { file: portablePath, contentType: 'application/octet-stream' },
    { file: blockmapPath, contentType: 'application/octet-stream' },
    { file: sumsPath, contentType: 'text/plain; charset=utf-8' },
    { file: setupShaPath, contentType: 'text/plain; charset=utf-8' },
  ];

  for (const { file, contentType } of files) {
    const filename = path.basename(file);
    const stats = statSync(file);
    console.log(`Uploading ${filename} (${stats.size} bytes)...`);

    const uploadUrl = `https://uploads.github.com/repos/${owner}/${repo}/releases/${release.id}/assets?name=${encodeURIComponent(filename)}`;
    const buffer = readFileSync(file);

    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `token ${token}`,
        'Content-Type': contentType,
        'Content-Length': String(stats.size),
        'User-Agent': 'agent-gitu-releaser',
      },
      body: buffer,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      throw new Error(`Failed to upload ${filename}: ${uploadRes.status} ${errText}`);
    }
    const asset = await uploadRes.json();
    console.log(`Uploaded ${filename} -> ${asset.browser_download_url}`);
  }

  console.log('\nAll assets uploaded and release published successfully!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
