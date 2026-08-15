const fs = require('fs');
const html = fs.readFileSync('public/coffeeshop.html', 'utf8');
const checks = [
  ['hero section', html.includes('class="hero"')],
  ['hero headline', html.includes('The Daily Grind')],
  ['menu section', html.includes('id="menu"')],
  ['coffee items', html.includes('Espresso') && html.includes('Latte') && html.includes('Cold Brew')],
  ['about section', html.includes('id="about"') && html.includes('Our Story')],
  ['visit/contact section', html.includes('id="visit"') && html.includes('Location') && html.includes('Contact')],
  ['embedded CSS', html.includes('<style>')],
  ['no external CSS', !html.includes('<link rel="stylesheet"')],
  ['no external JS', !html.includes('<script src=')]
];
let all = true;
checks.forEach(([name, pass]) => {
  console.log((pass ? 'PASS' : 'FAIL') + ' - ' + name);
  if (!pass) all = false;
});
if (!all) { process.exit(1); }
console.log('All checks passed!');
