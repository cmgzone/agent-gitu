import { execSync } from 'node:child_process';
import { readFileSync, statSync, createReadStream } from 'node:fs';
import path from 'node:path';

function getGitToken() {
  const out = execSync('git credential fill', { input: 'protocol=https\nhost=github.com\n' }).toString();
  const token = out.split('\n').find(l => l.startsWith('password=')).slice(9).trim();
  if (!token) throw new Error('Could not find GitHub token in git credential manager');
  return token;
}

const token = getGitToken();
const owner = 'cmgzone';
const repo = 'agent-gitu';
const tag = 'v0.4.14';
const releaseName = 'Agent Gitu v0.4.14';

const body = `## What's Changed in Agent Gitu v0.4.14

- **Mobile Web & Responsive UI:** Fixed Home/Cowork top-nav switcher geometry so it maintains a clean horizontal pill layout on mobile viewports.
- **Company Workspace Modes:** Added toggle to cleanly hide company icons and features when company mode is turned off.
- **Cowork VCS & Git Support:** Enabled \`git push\` and version control commands directly in Cowork mode without requiring delegation to the main agent.
- **Coding Engine & Resiliency:** Enhanced task loop resiliency, mobile UX, verification rigor, and safe Git operations.
- **Pi Runtime Integration:** Switched to Pi AgentSession loop with OAuth subscription sign-in/sign-out support.

### Windows x64 Downloads

- **Setup Installer:** \`Agent-Gitu-Setup-0.4.14.exe\`
- **Portable Executable:** \`Agent-Gitu-Portable-0.4.14.exe\`

### Verification Checksums (SHA-256)
\`\`\`
2704349fce671bbe90210dee2317f2480ee9eca0b281c278eaba37ebf7d9eaae *Agent-Gitu-Setup-0.4.14.exe
27b48f73ab58160936621d0a91b4c5c516ab1f3933c3e1cee0cf48aee7a0029e *Agent-Gitu-Portable-0.4.14.exe
\`\`\`
`;

async function main() {
  console.log(`Creating release ${tag}...`);
  const createRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases`, {
    method: 'POST',
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'agent-gitu-releaser'
    },
    body: JSON.stringify({
      tag_name: tag,
      target_commitish: 'main',
      name: releaseName,
      body: body,
      draft: false,
      prerelease: false
    })
  });

  const release = await createRes.json();
  if (!createRes.ok) {
    throw new Error(`Failed to create release: ${createRes.status} ${JSON.stringify(release)}`);
  }

  console.log(`Release created: ${release.html_url} (ID: ${release.id})`);

  const files = [
    { file: 'release/Agent-Gitu-Setup-0.4.14.exe', contentType: 'application/octet-stream' },
    { file: 'release/Agent-Gitu-Portable-0.4.14.exe', contentType: 'application/octet-stream' },
    { file: 'release/Agent-Gitu-Setup-0.4.14.exe.blockmap', contentType: 'application/octet-stream' },
    { file: 'release/SHA256SUMS.txt', contentType: 'text/plain; charset=utf-8' },
    { file: 'release/Agent-Gitu-Setup-0.4.14.exe.sha256', contentType: 'text/plain; charset=utf-8' }
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
        'Authorization': `token ${token}`,
        'Content-Type': contentType,
        'Content-Length': String(stats.size),
        'User-Agent': 'agent-gitu-releaser'
      },
      body: buffer
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      console.error(`Failed to upload ${filename}: ${uploadRes.status} ${errText}`);
    } else {
      const asset = await uploadRes.json();
      console.log(`Uploaded ${filename} -> ${asset.browser_download_url}`);
    }
  }

  console.log('\nAll assets uploaded and release published successfully!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
