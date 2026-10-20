#!/usr/bin/env node
// Builds dist/TechJob-AI.html: the whole app (config, roles, jobs, code) in ONE file
// that opens directly on a phone or computer, no server needed.
// Usage: node tools/build-single.js
const fs = require('fs');
const path = require('path');
const web = path.join(__dirname, '..', 'web');
let html = fs.readFileSync(path.join(web, 'index.html'), 'utf8');
for (const f of ['config.js', 'roles.js', 'data/jobs.js', 'app.js']) {
  const code = fs.readFileSync(path.join(web, f), 'utf8').replace(/<\/script/gi, '<\\/script');
  html = html.replace(`<script src="${f}"></script>`, () => `<script>\n${code}\n</script>`);
}
const out = path.join(__dirname, '..', 'dist');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'TechJob-AI.html'), html);
console.log('dist/TechJob-AI.html', Math.round(html.length / 1024) + ' KB');
