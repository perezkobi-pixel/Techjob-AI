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
const { extractFromAd, extractCareersEmail } = require('./contacts.js');

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

async function request(url, { method = 'GET', body = null, tries = 2, as = 'json', timeout = 25000 } = {}) {
  for (let a = 1; a <= tries; a++) {
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
      const headers = { 'User-Agent': UA, Accept: as === 'json' ? 'application/json' : 'text/html' };
      if (body) headers['Content-Type'] = 'application/json';
      const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: ctl.signal });
      clearTimeout(t);
      if (res.status === 404 || res.status === 410) throw Object.assign(new Error('board not found (' + res.status + ')'), { fatal: true });
      if (res.status === 401 || res.status === 403) throw Object.assign(new Error('access denied (' + res.status + ')'), { fatal: true });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return as === 'json' ? await res.json() : await res.text();
    } catch (e) {
      if (e.fatal || a === tries) throw e;
      await sleep(1500 * a);
    }
  }
}
const getJSON = (url, tries) => request(url, { tries });
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
    const host = src.eu ? 'boards-api.eu.greenhouse.io' : 'boards-api.greenhouse.io';
    const data = await load('greenhouse_' + src.token, `https://${host}/v1/boards/${src.token}/jobs?content=true`);
    return (data.jobs || []).map(j => ({
      extId: String(j.id), title: j.title, location: j.location?.name || '',
      locations: (j.offices || []).map(o => [o.name, o.location].filter(Boolean).join(', ')),
      url: j.absolute_url, posted: j.first_published || j.updated_at, updated: j.updated_at,
      desc: htmlToText(j.content || ''), dept: (j.departments || []).map(d => d.name).join(' / '),
      workplace: null, employment: null, salary: null
    }));
  },
  async lever(src) {
    const data = await load('lever_' + src.token, `https://${src.eu ? 'api.eu.lever.co' : 'api.lever.co'}/v0/postings/${src.token}?mode=json`);
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
    // token = "<company uid>:<public token>"  → official careers API
    //      or "<company-slug>/<company uid>"  → reads the positions embedded in the public Comeet jobs page
    const mapPos = j => ({
      extId: j.uid, title: j.name, location: [j.location?.city, j.location?.name, j.location?.country === 'IL' ? 'Israel' : j.location?.country].filter(Boolean).join(', '),
      locations: [], url: j.url_active_page || j.url_comeet_hosted_page || j.url_detected_page, posted: j.time_updated, updated: j.time_updated,
      desc: (j.details || []).map(d => (d.name ? d.name + '\n' : '') + htmlToText(d.value)).join('\n\n'),
      dept: j.department || '', workplace: j.workplace_type || (j.location?.is_remote ? 'Remote' : null), employment: j.employment_type || null, salary: null
    });
    if (String(src.token).includes('/')) {
      const [slug, uid] = String(src.token).split('/');
      const html = FIXTURES ? JSON.stringify(readFixture('comeet_' + uid)) : await request(`https://www.comeet.com/jobs/${slug}/${uid}`, { as: 'text' });
      const m = html.match(/COMPANY_POSITIONS_DATA\s*=\s*(\[[\s\S]*?\]);\s*\n/) || html.match(/"positions"\s*:\s*(\[[\s\S]*?\])\s*[,}]/);
      if (!m) throw Object.assign(new Error('no positions found on Comeet page'), { fatal: true });
      return JSON.parse(m[1]).map(mapPos);
    }
    const [uid, tok] = String(src.token).split(':');
    const data = await load('comeet_' + uid, `https://www.comeet.co/careers-api/2.0/company/${uid}/positions?token=${tok}&details=true`);
    return (Array.isArray(data) ? data : []).map(mapPos);
  },
  async workable(src) {
    const data = await load('workable_' + src.token, `https://apply.workable.com/api/v1/widget/accounts/${src.token}?details=true`);
    return (data.jobs || []).map(j => ({
      extId: j.shortcode || j.id, title: j.title,
      location: [j.city, j.state, j.country].filter(Boolean).join(', '),
      locations: (j.locations || []).map(l => [l.city, l.region, l.country].filter(Boolean).join(', ')),
      url: j.url || j.shortlink || `https://apply.workable.com/${src.token}/j/${j.shortcode}/`, posted: j.published_on || j.created_at, updated: null,
      desc: htmlToText(j.description || ''), dept: j.department || '', workplace: j.telecommuting ? 'Remote' : null, employment: j.employment_type || null, salary: null
    }));
  },
  async recruitee(src) {
    const data = await load('recruitee_' + src.token, `https://${src.token}.recruitee.com/api/offers/`);
    return (data.offers || []).map(j => ({
      extId: String(j.id), title: j.title, location: [j.city, j.state_name || j.state, j.country].filter(Boolean).join(', ') || j.location || '',
      locations: (j.locations || []).map(l => [l.city, l.country].filter(Boolean).join(', ')),
      url: j.careers_url || j.careers_apply_url, posted: j.published_at || j.created_at, updated: j.updated_at || null,
      desc: htmlToText([j.description, j.requirements].filter(Boolean).join('\n')), dept: j.department || '',
      workplace: j.remote ? 'Remote' : (j.hybrid ? 'Hybrid' : null), employment: j.employment_type_code || null, salary: null
    }));
  },
  async jsonld(src) {
    // Custom careers sites: read the job URLs from the site's sitemap and the schema.org JobPosting
    // data each job page publishes for Google Jobs. Respects robots.txt.
    // token = site origin, e.g. "https://careers.cyberark.com"; optional src.sitemap, src.match, src.max
    if (FIXTURES) return readFixture('jsonld_' + new URL(src.token).hostname);
    const origin = new URL(src.token).origin;
    const robots = await request(origin + '/robots.txt', { as: 'text', tries: 1 }).catch(() => '');
    const disallow = []; let applies = false; const maps = [];
    for (const line of robots.split(/\r?\n/)) {
      const [k, ...rest] = line.split(':'); const v = rest.join(':').trim(); const key = (k || '').trim().toLowerCase();
      if (key === 'user-agent') applies = v === '*';
      else if (key === 'disallow' && applies && v) disallow.push(v);
      else if (key === 'sitemap' && v) maps.push(v);
    }
    const allowed = u => { const p = new URL(u).pathname; return !disallow.some(d => p.startsWith(d.replace(/\*.*$/, ''))); };
    const queue = src.sitemap ? [src.sitemap] : (maps.length ? maps : [origin + '/sitemap.xml']);
    const jobRe = new RegExp(src.match || '/(job|jobs|position|positions|vacanc|opening)s?/[^/]+', 'i');
    const urls = new Set(); let seenMaps = 0;
    while (queue.length && seenMaps < 15) {
      const sm = queue.shift(); seenMaps++;
      const xml = await request(sm, { as: 'text', tries: 1 }).catch(() => '');
      for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
        const u = decode(m[1]);
        if (/\.xml(\.gz)?$/i.test(u) || /<sitemap>/i.test(xml) && !jobRe.test(u)) { if (/\.xml/i.test(u)) queue.push(u); continue; }
        if (jobRe.test(u) && allowed(u)) urls.add(u);
      }
    }
    const out = []; const max = src.max || 400;
    for (const u of [...urls].slice(0, max)) {
      const html = await request(u, { as: 'text', tries: 1 }).catch(() => '');
      for (const b of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
        let data; try { data = JSON.parse(b[1].trim()); } catch (e) { continue; }
        const items = [].concat(data['@graph'] || data).filter(x => x && /JobPosting/i.test([].concat(x['@type']).join(',')));
        for (const j of items) {
          if (j.validThrough && new Date(j.validThrough) < new Date()) continue;
          const locs = [].concat(j.jobLocation || []).map(l => { const a = l.address || l; return [a.addressLocality, a.addressRegion, a.addressCountry && (a.addressCountry.name || a.addressCountry)].filter(Boolean).join(', '); });
          const remote = /TELECOMMUTE/i.test(j.jobLocationType || '');
          out.push({
            extId: String(j.identifier?.value || j.identifier || u), title: decode(j.title || ''), location: locs[0] || (remote ? 'Remote' : ''), locations: locs.slice(1),
            url: j.url || u, posted: j.datePosted || null, updated: null, desc: htmlToText(j.description || ''),
            dept: j.occupationalCategory || '', workplace: remote ? 'Remote' : null, employment: [].concat(j.employmentType || []).join(', ') || null, salary: null
          });
        }
      }
      await sleep(300);
    }
    return out;
  },
  async eightfold(src) {
    // token = "<host>|<domain>", e.g. "apply.careers.microsoft.com|microsoft.com"
    const [host, domain] = String(src.token).split('|');
    if (FIXTURES) return readFixture('eightfold_' + domain);
    const out = [];
    for (let start = 0; start < 1000; start += 10) {
      const d = await request(`https://${host}/api/apply/v2/jobs?domain=${encodeURIComponent(domain)}&location=${encodeURIComponent(src.search || 'Israel')}&start=${start}&num=10&sort_by=relevance`);
      const ps = d.positions || [];
      for (const p of ps) out.push({
        extId: String(p.id), title: p.name, location: p.location || '', locations: p.locations || [],
        url: p.canonicalPositionUrl || `https://${host}/careers/job/${p.id}`, posted: p.t_create ? new Date(p.t_create * 1000).toISOString() : null, updated: null,
        desc: htmlToText(p.job_description || ''), dept: p.department || '', workplace: p.work_location_option || null, employment: null, salary: null
      });
      if (ps.length < 10 || out.length >= (d.count || 0)) break;
      await sleep(250);
    }
    return out;
  },
  async amazon(src) {
    if (FIXTURES) return readFixture('amazon_' + src.token);
    const out = [];
    for (let offset = 0; offset < 1000; offset += 100) {
      const d = await request(`https://www.amazon.jobs/en/search.json?normalized_country_code%5B%5D=${src.token}&result_limit=100&offset=${offset}&sort=recent`);
      const js = d.jobs || [];
      for (const j of js) out.push({
        extId: String(j.id_icims || j.id), title: j.title, location: [j.city, j.normalized_location, j.location].filter(Boolean).join(', ') + ', Israel', locations: [],
        url: 'https://www.amazon.jobs' + j.job_path, posted: j.posted_date ? new Date(j.posted_date).toISOString() : null, updated: null,
        desc: htmlToText([j.description, j.basic_qualifications, j.preferred_qualifications].filter(Boolean).join('\n\n')), dept: j.business_category || j.job_category || '',
        workplace: null, employment: j.job_schedule_type || null, salary: null
      });
      if (js.length < 100) break;
      await sleep(300);
    }
    return out;
  },
  async workday(src) {
    // token = "<host>|<tenant>|<site>", e.g. "nvidia.wd5.myworkdayjobs.com|nvidia|NVIDIAExternalCareerSite"
    const [host, tenant, site] = String(src.token).split('|');
    const base = `https://${host}/wday/cxs/${tenant}/${site}`;
    if (FIXTURES) return readFixture('workday_' + tenant);
    const list = []; let total = Infinity;
    for (let offset = 0; offset < Math.min(total, 1000); offset += 20) {
      const page = await request(base + '/jobs', { method: 'POST', body: { appliedFacets: {}, limit: 20, offset, searchText: src.search || 'Israel' } });
      if (offset === 0) total = page.total ?? 0;   // Workday sends the total only on the first page
      list.push(...(page.jobPostings || []));
      if (!(page.jobPostings || []).length) break;
      await sleep(250);
    }
    const out = [];
    for (const p of list) {
      const lt = p.locationsText || '';
      if (!locate(lt).inIsrael && !/\d+ locations/i.test(lt)) continue;
      try {
        const d = await request(base + p.externalPath);
        const info = d.jobPostingInfo || {};
        out.push({
          extId: info.jobReqId || p.externalPath, title: info.title || p.title,
          location: info.location || lt, locations: info.additionalLocations || [],
          url: info.externalUrl || `https://${host}/${site}${p.externalPath}`, posted: info.startDate || null, updated: null,
          desc: htmlToText(info.jobDescription || ''), dept: '', workplace: info.remoteType || null, employment: info.timeType || null, salary: null
        });
      } catch (e) { /* skip a posting that fails to load */ }
      await sleep(150);
    }
    return out;
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
          contact: extractFromAd(desc), _host: (() => { try { return new URL(raw.url).hostname; } catch (e) { return null; } })(),
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
  // careers e-mail published on each company's own website (fallback when the ad has no contact)
  if (!FIXTURES) {
    const ATS_HOST = /greenhouse|lever\.co|ashbyhq|comeet|workable|smartrecruiters|myworkdayjobs|recruitee|amazon\.jobs|eightfold/i;
    const hostsByCompany = new Map();
    for (const j of jobs) if (j._host && !ATS_HOST.test(j._host) && !hostsByCompany.has(j.company)) hostsByCompany.set(j.company, j._host.replace(/^(careers|jobs|join|apply)\./, 'www.'));
    const careersEmail = new Map();
    const started = Date.now();
    const lookup = async ([company, host]) => {
      const origin = 'https://' + host;
      const robots = await request(origin + '/robots.txt', { as: 'text', tries: 1, timeout: 6000 }).catch(() => '');
      const blocked = p => /user-agent:\s*\*\s*\n(?:[^\n]*\n)*?disallow:\s*\/\s*$/im.test(robots) || robots.toLowerCase().includes('disallow: ' + p);
      for (const p of ['/careers', '/contact', '/contact-us', '/jobs']) {
        if (Date.now() - started > 4 * 60 * 1000) return;      // never spend more than 4 minutes on this
        if (blocked(p)) continue;
        const html = await request(origin + p, { as: 'text', tries: 1, timeout: 8000 }).catch(() => '');
        const e = extractCareersEmail(html);
        if (e) { careersEmail.set(company, { email: e, page: origin + p }); return; }
      }
    };
    const entries = [...hostsByCompany];
    for (let i = 0; i < entries.length; i += 6) await Promise.all(entries.slice(i, i + 6).map(lookup));
    for (const j of jobs) {
      const c = careersEmail.get(j.company);
      if (c && !(j.contact && j.contact.email)) j.contact = { ...(j.contact || {}), email: c.email, from: j.contact ? 'ad+site' : 'site', page: c.page };
    }
    stats.careersEmails = careersEmail.size;
  }
  for (const j of jobs) { delete j._host; if (!j.contact) delete j.contact; }
  stats.withContact = jobs.filter(j => j.contact).length;
  jobs.sort((a, b) => String(b.posted || '').localeCompare(String(a.posted || '')));

  const out = { generatedAt: new Date().toISOString(), count: jobs.length, sources: report, stats, jobs };
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'jobs.json'), JSON.stringify(out));
  fs.writeFileSync(path.join(OUT, 'jobs.js'), '/* generated by collector/collect.js — do not edit */\nwindow.TJ_DATA=' + JSON.stringify(out) + ';\n');
  console.log(`\n${jobs.length} tech jobs in Israel from ${report.filter(r => r.ok).length}/${report.length} sources ` +
    `(fetched ${stats.fetched}, in Israel ${stats.israel}, non-tech skipped ${stats.nonTech}, duplicates merged ${stats.dupes}) → ${path.relative(process.cwd(), OUT)}/jobs.js`);
  if (!report.some(r => r.ok)) process.exitCode = 1;
}
module.exports = { ADAPTERS, classifyRoles, locate };
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
