#!/usr/bin/env node
/*
 * Scans companies' careers pages and detects which job-board system they use
 * (Greenhouse, Lever, Ashby, Workable, SmartRecruiters, Workday, Comeet, Breezy, Recruitee, BambooHR).
 * For Comeet pages it also records how positions are embedded, so the collector can read them.
 *
 * Usage: node tools/probe.js   → tools/probe-report.json   (runs in GitHub Actions)
 */
const fs = require('fs');
const path = require('path');
const companies = JSON.parse(fs.readFileSync(path.join(__dirname, 'probe-companies.json'), 'utf8'));
const UA = 'Mozilla/5.0 (compatible; TechJobAI-probe/1.0)';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(url) {
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000);
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/json' }, redirect: 'follow', signal: ctl.signal });
    clearTimeout(t);
    const text = res.ok ? (await res.text()).slice(0, 3_000_000) : '';
    return { url, final: res.url, status: res.status, text };
  } catch (e) { return { url, status: 0, error: e.message, text: '' }; }
}

const FP = {
  greenhouse: [/boards(?:-api)?\.greenhouse\.io\/(?:embed\/job_board(?:\/js)?\?for=|v1\/boards\/)?([a-z0-9_-]+)/gi, /job-boards\.greenhouse\.io\/([a-z0-9_-]+)/gi, /greenhouse\.io\/embed\/job_board\/js\?for=([a-z0-9_-]+)/gi],
  greenhouse_eu: [/job-boards\.eu\.greenhouse\.io\/([a-z0-9_-]+)/gi, /boards\.eu\.greenhouse\.io\/([a-z0-9_-]+)/gi],
  lever: [/jobs\.lever\.co\/([a-z0-9_-]+)/gi, /api\.lever\.co\/v0\/postings\/([a-z0-9_-]+)/gi],
  lever_eu: [/jobs\.eu\.lever\.co\/([a-z0-9_-]+)/gi],
  ashby: [/jobs\.ashbyhq\.com\/([a-z0-9_.-]+)/gi, /ashbyhq\.com\/posting-api\/job-board\/([a-z0-9_.-]+)/gi],
  workable: [/apply\.workable\.com\/([a-z0-9_-]+)/gi, /([a-z0-9-]+)\.workable\.com/gi],
  smartrecruiters: [/(?:jobs|careers)\.smartrecruiters\.com\/([A-Za-z0-9_-]+)/g, /api\.smartrecruiters\.com\/v1\/companies\/([A-Za-z0-9_-]+)/g],
  workday: [/([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com\/(?:[a-z]{2}-[A-Z]{2}\/)?([A-Za-z0-9_-]+)/g],
  comeet: [/comeet\.com\/jobs\/([a-z0-9_.-]+)\/([A-Z0-9]{2}\.[A-Z0-9]{3})/gi, /comeet\.co\/jobs\/([a-z0-9_.-]+)\/([A-Z0-9]{2}\.[A-Z0-9]{3})/gi],
  breezy: [/([a-z0-9-]+)\.breezy\.hr/gi],
  recruitee: [/([a-z0-9-]+)\.recruitee\.com/gi],
  bamboohr: [/([a-z0-9-]+)\.bamboohr\.com/gi]
};
const IGNORE = new Set(['www', 'embed', 'js', 'api', 'assets', 'static', 'cdn', 'jobs', 'apply', 'v1', 'boards', 'job_board', 'resources', 'images']);

function fingerprints(text) {
  const out = {};
  for (const [ats, res] of Object.entries(FP)) {
    for (const re of res) {
      re.lastIndex = 0; let m;
      while ((m = re.exec(text))) {
        let token = ats === 'workday' ? `${m[1]}.${m[2]}.myworkdayjobs.com|${m[1]}|${m[3]}` : ats === 'comeet' ? `${m[1]}/${m[2]}` : m[1];
        if (!token || IGNORE.has(token.toLowerCase())) continue;
        (out[ats] = out[ats] || new Set()).add(token);
      }
    }
  }
  // Comeet widget tokens
  const tok = text.match(/comeet[\s\S]{0,400}?token["'\s:=]+["']?([A-F0-9]{12,})/i);
  if (tok) {
    (out.comeet_token = out.comeet_token || new Set()).add(tok[1]);
    const i = text.indexOf(tok[1]);
    const near = text.slice(Math.max(0, i - 1500), i + 1500);
    const uid = near.match(/(?:company[-_ ]?uid|companyUid|company_id|uid)["'\s:=]+["']?([0-9A-F]{2}\.[0-9A-F]{3})/i) || near.match(/["'\/]([0-9A-F]{2}\.[0-9A-F]{3})["'\/]/);
    if (uid) (out.comeet_uid = out.comeet_uid || new Set()).add(uid[1]);
    (out.comeet_snippet = out.comeet_snippet || new Set()).add(near.replace(/\s+/g, ' ').slice(1000, 2000));
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v].slice(0, 5)]));
}
function jobLinks(html, base) {
  const out = new Set();
  const re = /href=["']([^"'#]+)["']/gi; let m;
  while ((m = re.exec(html))) {
    try {
      const u = new URL(m[1], base);
      if (u.hostname.replace(/^www\./, '') !== new URL(base).hostname.replace(/^www\./, '')) continue;
      if (/(job|position|opening|open-roles|vacanc|join-us|careers\/[a-z])/i.test(u.pathname)) out.add(u.href.split('?')[0]);
    } catch (e) {}
  }
  return [...out].slice(0, 3);
}

async function comeetInfo(slugUid) {
  const r = await get(`https://www.comeet.com/jobs/${slugUid}`);
  const t = r.text || '';
  const marks = ['COMPANY_POSITIONS_DATA', 'COMPANY_DATA', 'positions', 'position_uid', '"uid"', 'url_active_page', 'careers-api', 'token'];
  const found = marks.filter(k => t.includes(k));
  const i = t.search(/COMPANY_POSITIONS_DATA|position_uid|url_active_page/);
  return { url: r.url, status: r.status, length: t.length, found, snippet: i >= 0 ? t.slice(Math.max(0, i - 200), i + 900) : t.slice(0, 600) };
}

(async () => {
  const report = [];
  for (const c of companies) {
    const urls = c.urls || [`https://www.${c.domain}/careers`, `https://${c.domain}/careers`, `https://careers.${c.domain}`, `https://www.${c.domain}/jobs`];
    const fetched = []; const merged = {};
    const add = fp => { for (const [k, v] of Object.entries(fp)) merged[k] = [...new Set([...(merged[k] || []), ...v])]; };
    for (const u of urls) {
      const r = await get(u); fetched.push([u, r.status, r.final && r.final !== u ? r.final : undefined].filter(Boolean));
      if (!r.text) continue;
      add(fingerprints(r.text));
      if (!Object.keys(merged).length) for (const l of jobLinks(r.text, r.final || u)) { const r2 = await get(l); fetched.push([l, r2.status]); add(fingerprints(r2.text || '')); }
      if (Object.keys(merged).length) break;
      await sleep(200);
    }
    const entry = { company: c.company, type: c.type, domain: c.domain, found: merged, fetched };
    if (merged.comeet) entry.comeetPage = await comeetInfo(merged.comeet[0]);
    report.push(entry);
    console.log(`${Object.keys(merged).length ? '✓' : '✗'} ${c.company.padEnd(24)} ${JSON.stringify(merged)}`);
  }
  fs.writeFileSync(path.join(__dirname, 'probe-report.json'), JSON.stringify({ ranAt: new Date().toISOString(), report }, null, 1));
})();
