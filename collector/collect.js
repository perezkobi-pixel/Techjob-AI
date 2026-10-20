#!/usr/bin/env node
/*
 * TechJob AI — job collector.
 *
 * Pulls open positions from companies' PUBLIC job-board APIs (Greenhouse, Lever, Ashby,
 * SmartRecruiters, Comeet), keeps jobs located in Israel that match a tech role,
 * classifies them (role, region, work model, seniority, skills), removes duplicates
 * and writes web/data/jobs.js + jobs.json for the app.
 *
 * Usage:
 *   node collector/collect.js                    # fetch all sources in sources.json
 *   node collector/collect.js --fixtures DIR     # read saved API responses instead of fetching (tests)
 *   node collector/collect.js --only riskified   # one source
 *
 * Only official public endpoints that companies publish for their own careers pages are used.
 * Nothing is scraped from sites that forbid it (LinkedIn, Facebook, job boards without an API).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ROLES } = require('../web/roles.js');
const { locate, norm } = require('./geo.js');
const { extractSkills } = require('./skills.js');

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const FIXTURES = arg('--fixtures', null);
const ONLY = arg('--only', null);
const OUT = path.resolve(__dirname, arg('--out', '../web/data'));
const UA = 'TechJobAI-collector/1.0 (job aggregator; contact via repository)';
const DESC_MAX = 1100;

/* ---------------- helpers ---------------- */
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', hellip: '…', bull: '•' };
const decode = s => String(s || '').replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => {
  if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return isNaN(n) ? m : String.fromCodePoint(n); }
  return ENT[e.toLowerCase()] ?? m;
});
function htmlToText(html) {
  let s = decode(html);                       // Greenhouse double-escapes its HTML
  s = s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\s*br\s*\/?>/gi, '\n').replace(/<\/(p|div|h\d|li|ul|ol|tr)>/gi, '\n').replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, ' ');
  s = decode(s).replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return s;
}
const clip = (s, n) => { if (!s || s.length <= n) return s || ''; const cut = s.slice(0, n); const i = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('\n')); return (i > n * 0.6 ? cut.slice(0, i + 1) : cut) + '…'; };
const shortId = s => crypto.createHash('sha1').update(s).digest('base64url').slice(0, 10);

async function getJSON(url, tries = 2) {
  for (let a = 1; a <= tries; a++) {
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 25000);
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: ctl.signal });
      clearTimeout(t);
      if (res.status === 404) throw Object.assign(new Error('board not found (404)'), { fatal: true });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (e) {
      if (e.fatal || a === tries) throw e;
      await sleep(1500 * a);
    }
  }
}
function readFixture(name) {
  const f = path.join(FIXTURES, name + '.json');
  if (!fs.existsSync(f)) throw Object.assign(new Error('no fixture ' + name), { fatal: true });
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}
const load = (fixtureName, url) => FIXTURES ? readFixture(fixtureName) : getJSON(url);

/* ---------------- adapters: each returns a list of raw postings ---------------- */
// raw = { extId, title, location, locations[], url, posted, desc, dept, workplace, employment, salary }
const ADAPTERS = {
  async greenhouse(src) {
    const data = await load('greenhouse_' + src.token, `https://boards-api.greenhouse.io/v1/boards/${src.token}/jobs?content=true`);
    return (data.jobs || []).map(j => ({
      extId: String(j.id), title: j.title, location: j.location?.name || '',
      locations: (j.offices || []).map(o => [o.name, o.location].filter(Boolean).join(', ')),
      url: j.absolute_url, posted: j.first_published || j.updated_at, updated: j.updated_at,
      desc: htmlToText(j.content || ''), dept: (j.departments || []).map(d => d.name).join(' / '),
      workplace: null, employment: null, salary: null
    }));
  },
  async lever(src) {
    const data = await load('lever_' + src.token, `https://api.lever.co/v0/postings/${src.token}?mode=json`);
    return (Array.isArray(data) ? data : []).map(j => ({
      extId: j.id, title: j.text, location: j.categories?.location || '', locations: j.categories?.allLocations || [],
      url: j.hostedUrl, posted: j.createdAt ? new Date(j.createdAt).toISOString() : null, updated: null,
      desc: [j.descriptionPlain, ...(j.lists || []).map(l => l.text + '\n' + htmlToText(l.content)), j.additionalPlain].filter(Boolean).join('\n\n'),
      dept: [j.categories?.department, j.categories?.team].filter(Boolean).join(' / '),
      workplace: j.workplaceType || null, employment: j.categories?.commitment || null,
      salary: j.salaryRange ? { min: j.salaryRange.min, max: j.salaryRange.max, currency: j.salaryRange.currency, interval: j.salaryRange.interval } : null
    }));
  },
  async ashby(src) {
    const data = await load('ashby_' + src.token, `https://api.ashbyhq.com/posting-api/job-board/${src.token}?includeCompensation=true`);
    return (data.jobs || []).filter(j => j.isListed !== false).map(j => ({
      extId: j.id, title: j.title, location: j.location || '', locations: (j.secondaryLocations || []).map(l => l.location),
      url: j.jobUrl, posted: j.publishedAt, updated: null, desc: j.descriptionPlain || htmlToText(j.descriptionHtml || ''),
      dept: [j.department, j.team].filter(Boolean).join(' / '),
      workplace: j.workplaceType || (j.isRemote ? 'Remote' : null), employment: j.employmentType || null,
      salary: j.compensation?.compensationTierSummary ? { text: j.compensation.compensationTierSummary } : null
    }));
  },
  async smartrecruiters(src) {
    const data = await load('smartrecruiters_' + src.token, `https://api.smartrecruiters.com/v1/companies/${src.token}/postings?country=il&limit=100`);
    return (data.content || []).map(j => ({
      extId: j.id, title: j.name, location: [j.location?.city, j.location?.region, j.location?.country === 'il' ? 'Israel' : j.location?.country].filter(Boolean).join(', '),
      locations: [], url: `https://jobs.smartrecruiters.com/${src.token}/${j.id}`, posted: j.releasedDate, updated: null, desc: '',
      dept: j.department?.label || '', workplace: j.location?.remote ? 'Remote' : (j.location?.hybrid ? 'Hybrid' : null),
      employment: j.typeOfEmployment?.label || null, salary: null
    }));
  },
  async comeet(src) {
    // token = "<company uid>:<public token>" — both appear in the company's Comeet careers page source
    const [uid, tok] = String(src.token).split(':');
    const data = await load('comeet_' + uid, `https://www.comeet.co/careers-api/2.0/company/${uid}/positions?token=${tok}&details=true`);
    return (Array.isArray(data) ? data : []).map(j => ({
      extId: j.uid, title: j.name, location: [j.location?.city, j.location?.name, j.location?.country === 'IL' ? 'Israel' : j.location?.country].filter(Boolean).join(', '),
      locations: [], url: j.url_active_page || j.url_comeet_hosted_page, posted: j.time_updated, updated: j.time_updated,
      desc: (j.details || []).map(d => (d.name ? d.name + '\n' : '') + htmlToText(d.value)).join('\n\n'),
      dept: j.department || '', workplace: j.workplace_type || (j.location?.is_remote ? 'Remote' : null), employment: j.employment_type || null, salary: null
    }));
  }
};

/* ---------------- classification ---------------- */
const DEV_GROUPS = new Set(['dev', 'data', 'infra', 'qa', 'mgmt', 'cyber']);
const NON_TECH = /recruit|talent acquisition|payroll|bookkeep|receptionist|office manager|account executive|\bsdr\b|\bbdr\b|sales (manager|director|representative)|business development|legal|counsel|paralegal|accountant|controller|fp&a|\bhr\b|people partner|executive assistant|stock administration|finance operations|treasury|tax |procurement/i;

function classifyRoles(title, desc) {
  const roles = [];
  for (const r of ROLES) if (r.re.test(title)) roles.push(r.id);
  if (!roles.length) return roles;
  // language / stack roles may come from the description, only for engineering jobs
  if (roles.some(id => DEV_GROUPS.has(ROLES.find(r => r.id === id).g))) {
    for (const r of ROLES) if (r.desc && !roles.includes(r.id) && r.desc.test(desc.slice(0, 3000))) roles.push(r.id);
  }
  // a specific role makes the generic "software engineer" redundant only when the title is not generic
  return roles;
}
function seniority(title) {
  const t = title.toLowerCase();
  if (/intern|student|סטודנט/.test(t)) return 'סטודנט/ית';
  if (/\b(vp|chief|ciso|cio|head of|director)\b|\bcto\b(?! office)|סמנכ/.test(t)) return 'מנהל/ת בכיר/ה';
  if (/team (lead|leader|manager)|group (manager|leader)|engineering manager|r&d,? manager|ראש צוות/.test(t)) return 'ראש צוות / מנהל/ת';
  if (/\b(manager)\b/.test(t) && !/(product|project|program|account|marketing|partner|success|solutions?|business operations) manager/.test(t)) return 'ראש צוות / מנהל/ת';
  if (/\b(staff|principal|architect|expert|distinguished)\b|tech lead/.test(t)) return 'מוביל/ה';
  if (/\b(senior|sr\.?|experienced)\b|בכיר/.test(t)) return 'בכיר/ה';
  if (/\b(junior|jr\.?|entry|graduate)\b|ג'וניור|ג׳וניור|מתחיל/.test(t)) return 'ג׳וניור';
  return 'ביניים';
}
function workModel(raw) {
  const w = String(raw.workplace || '').toLowerCase();
  if (w.includes('remote')) return 'remote';
  if (w.includes('hybrid')) return 'hybrid';
  if (w.includes('onsite') || w.includes('on-site') || w.includes('office')) return 'office';
  const head = `${raw.title} ${raw.location}`;
  if (/hybrid|היברידי/i.test(head)) return 'hybrid';
  if (/\bremote\b|מרחוק|מהבית/i.test(head)) return 'remote';
  const d = raw.desc.slice(0, 4000);
  if (/\bhybrid\b|היברידי/i.test(d)) return 'hybrid';
  if (/fully remote|100% remote|remote[- ]first|work from anywhere/i.test(d)) return 'remote';
  if (/on[- ]site|in the office \d|5 days (a week )?(in|at) the office/i.test(d)) return 'office';
  return 'unknown';
}
function employment(raw) {
  const e = `${raw.employment || ''} ${raw.title}`.toLowerCase();
  if (/part[- ]?time|חלקית/.test(e)) return 'חלקית';
  if (/contract|freelance|פרילנס/.test(e)) return 'חוזה / פרילנס';
  if (/temporary|temp |maternity|replacement|leave cover|זמני/.test(e)) return 'זמנית';
  if (/intern/.test(e)) return 'התמחות';
  return 'מלאה';
}

/* ---------------- main ---------------- */
async function main() {
  const sources = JSON.parse(fs.readFileSync(path.join(__dirname, 'sources.json'), 'utf8'))
    .filter(s => s.enabled !== false && (!ONLY || s.token === ONLY || s.company.toLowerCase() === ONLY.toLowerCase()));
  const report = []; const all = [];
  const stats = { fetched: 0, israel: 0, tech: 0, nonTech: 0, dupes: 0 };

  for (const src of sources) {
    const t0 = Date.now(); const rep = { company: src.company, ats: src.ats, token: src.token, ok: false, total: 0, israel: 0, kept: 0 };
    try {
      const adapter = ADAPTERS[src.ats];
      if (!adapter) throw new Error('unknown ats ' + src.ats);
      const raws = await adapter(src);
      rep.total = raws.length; stats.fetched += raws.length;
      for (const raw of raws) {
        if (!raw.title || !raw.url) continue;
        const locs = [raw.location, ...(raw.locations || [])].filter(Boolean);
        const geo = locs.map(locate).find(g => g.inIsrael);
        if (!geo) continue;
        rep.israel++; stats.israel++;
        const title = decode(raw.title).replace(/\s+/g, ' ').trim();
        if (NON_TECH.test(title) && !/engineer|developer|security|data/i.test(title)) { stats.nonTech++; continue; }
        const desc = raw.desc || '';
        const roles = classifyRoles(title, desc);
        if (!roles.length) { stats.nonTech++; continue; }
        stats.tech++; rep.kept++;
        const model = workModel(raw);
        const groups = [...new Set(roles.map(id => ROLES.find(r => r.id === id).g))];
        all.push({
          id: shortId(`${src.ats}:${src.token}:${raw.extId}`),
          title, company: src.company, companyType: src.type || null,
          city: geo.city, region: geo.region, model, roles, groups,
          seniority: seniority(title), employment: employment(raw),
          posted: raw.posted ? new Date(raw.posted).toISOString().slice(0, 10) : null,
          updated: raw.updated ? new Date(raw.updated).toISOString().slice(0, 10) : null,
          url: raw.url, source: src.ats, dept: raw.dept || null,
          skills: extractSkills(`${title}\n${desc}`), salary: raw.salary || null,
          desc: clip(desc, DESC_MAX)
        });
      }
      rep.ok = true;
    } catch (e) {
      rep.error = e.message;
    }
    rep.ms = Date.now() - t0;
    report.push(rep);
    console.log(`${rep.ok ? '✓' : '✗'} ${src.company.padEnd(22)} ${src.ats.padEnd(15)} total ${String(rep.total).padStart(4)}  israel ${String(rep.israel).padStart(4)}  kept ${String(rep.kept).padStart(4)}${rep.error ? '  — ' + rep.error : ''}`);
    if (!FIXTURES) await sleep(400);
  }

  // de-duplicate: same company + same title + same city (e.g. one job posted on two boards)
  const seen = new Map(); const jobs = [];
  for (const j of all) {
    const k = norm(j.company) + '|' + norm(j.title) + '|' + (j.city || '');
    if (seen.has(k)) { const o = seen.get(k); o.alsoAt = [...new Set([...(o.alsoAt || []), j.url])]; stats.dupes++; continue; }
    seen.set(k, j); jobs.push(j);
  }
  jobs.sort((a, b) => String(b.posted || '').localeCompare(String(a.posted || '')));

  const out = { generatedAt: new Date().toISOString(), count: jobs.length, sources: report, stats, jobs };
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'jobs.json'), JSON.stringify(out));
  fs.writeFileSync(path.join(OUT, 'jobs.js'), '/* generated by collector/collect.js — do not edit */\nwindow.TJ_DATA=' + JSON.stringify(out) + ';\n');
  console.log(`\n${jobs.length} tech jobs in Israel from ${report.filter(r => r.ok).length}/${report.length} sources ` +
    `(fetched ${stats.fetched}, in Israel ${stats.israel}, non-tech skipped ${stats.nonTech}, duplicates merged ${stats.dupes}) → ${path.relative(process.cwd(), OUT)}/jobs.js`);
  if (!report.some(r => r.ok)) process.exitCode = 1;
}
main().catch(e => { console.error(e); process.exit(1); });
