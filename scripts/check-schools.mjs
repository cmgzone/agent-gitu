import { readFileSync } from 'node:fs';

const s = readFileSync('public/schools.html', 'utf8');
const checks = [
  ['doctype', s.includes('<!DOCTYPE html>')],
  ['title', s.includes('<title>')],
  ['style', s.includes('<style>')],
  ['hero', s.includes('class="hero"')],
  ['schools-section', s.includes('id="schools"')],
  ['programs-section', s.includes('id="programs"')],
  ['visit-cta', s.includes('id="visit"')],
  ['contact-mailto', s.includes('mailto:')],
];

let ok = true;
for (const [name, pass] of checks) {
  console.log(name, pass ? 'PASS' : 'FAIL');
  if (!pass) ok = false;
}
process.exit(ok ? 0 : 1);
