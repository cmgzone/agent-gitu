const fs = require('node:fs');
const path = require('node:path');

// Run from the generated android directory on the short, mapped Windows drive.
if (process.platform !== 'win32') throw new Error('This workaround is only for Windows mapped-drive builds.');
const android = process.cwd();
const mobile = path.dirname(android);
if (path.basename(android) !== 'android' || require(path.join(mobile, 'package.json')).name !== '@agent-gitu/mobile') {
  throw new Error('Run this script from the mobile android directory.');
}
const original = fs.realpathSync.native(mobile);
const file = path.join(android, 'build/generated/autolinking/autolinking.json');
if (!fs.existsSync(file)) throw new Error('Run Gradle once to generate the autolinking file, then retry.');
const config = JSON.parse(fs.readFileSync(file, 'utf8'));
let changed = 0;
function normalize(value) {
  if (typeof value === 'string') {
    const forward = value.includes('/');
    const source = forward ? original.replaceAll('\\', '/') : original;
    if (value.toLowerCase() === source.toLowerCase() || value.toLowerCase().startsWith(source.toLowerCase() + (forward ? '/' : '\\'))) {
      const replacement = (forward ? mobile.replaceAll('\\', '/') : mobile) + value.slice(source.length);
      if (replacement !== value) changed++;
      return replacement;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalize(item)]));
  return value;
}
const result = normalize(config);
if (changed) fs.writeFileSync(file, JSON.stringify(result) + '\n');
console.log(`Normalized ${changed} generated Android paths to ${mobile}.`);
