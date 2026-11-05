import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

export function patchPiAi() {
  const targetPath = path.resolve('node_modules/@earendil-works/pi-ai/dist/api/openai-completions.js');
  if (!existsSync(targetPath)) return;

  let code = readFileSync(targetPath, 'utf8');
  let modified = false;

  // 1. Ensure user content without images is sent as a string rather than an array of {type:"text", text}
  const needleUser = `params.push({\n                    role: "user",\n                    content,\n                });`;
  const replacementUser = `const hasImages = content.some((item) => item.type === "image_url");\n                params.push({\n                    role: "user",\n                    content: hasImages\n                        ? content\n                        : content.map((item) => item.text).join("\\n"),\n                });`;

  if (code.includes(needleUser)) {
    code = code.replace(needleUser, replacementUser);
    modified = true;
  }

  // 2. Ensure assistant content is string "" instead of null when empty
  const needleAssistant = `const assistantMsg = {\n                role: "assistant",\n                content: compat.requiresAssistantAfterToolResult ? "" : null,\n            };`;
  const replacementAssistant = `const assistantMsg = {\n                role: "assistant",\n                content: "",\n            };`;

  if (code.includes(needleAssistant)) {
    code = code.replace(needleAssistant, replacementAssistant);
    modified = true;
  }

  if (modified) {
    writeFileSync(targetPath, code, 'utf8');
    console.log('[patch-pi-ai] Applied string content compatibility patch to openai-completions.js');
  }
}

if (process.argv[1] && process.argv[1].endsWith('patch-pi-ai.mjs')) {
  patchPiAi();
}
