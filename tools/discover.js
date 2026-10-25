#!/usr/bin/env node
/*
 * Finds which public job-board system each company uses.
 * For every company in tools/discover-candidates.json it tries name variants against
 * Greenhouse (US + EU), Lever (US + EU), Ashby, Workable and SmartRecruiters, plus any explicit
 * Workday / Comeet entries, and reports how many jobs (and how many in Israel) each one returns.
 *
 * Usage: node tools/discover.js            → writes tools/discover-report.json
 * Runs in GitHub Actions (.github/workflows/discover.yml), where the network is open.
 */
const fs = require('fs');
const path = require('path');
const { ADAPTERS, classifyRoles, locate } = require('../collector/collect.js');
const ONLY_EXPLICIT = c => !c.slugs || !c.slugs.length;

const candidates = JSON.parse(fs.readFileSync(path.join(__dirname, 'discover-candidates.json'), 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

function variants(c) {
  const base = (c.slugs || [c.company.toLowerCase().replace(/[^a-z0-9]/g, '')]);
  const out = new Set();
  for (const b of base) { out.add(b); }
  return [...out];
}
function attempts(c) {
  const list = [];
  for (const v of variants(c)) {
    list.push({ ats: 'greenhouse', token: v }, { ats: 'greenhouse', token: v, eu: true },
      { ats: 'lever', token: v }, { ats: 'lever', token: v, eu: true },
      { ats: 'ashby', token: v }, { ats: 'workable', token: v },
      { ats: 'smartrecruiters', token: v }, { ats: 'smartrecruiters', token: v.charAt(0).toUpperCase() + v.slice(1) });
  }
  for (const ats of ['workday', 'comeet', 'jsonld', 'eightfold', 'amazon', 'recruitee'])
    for (const t of c[ats] || []) list.push({ ats, token: t, explicit: true });
  return list;
}

async function tryOne(c, a) {
  const src = { company: c.company, ...a };
  try {
    const raws = await ADAPTERS[a.ats](src);
    let israel = 0, tech = 0;
    for (const r of raws) {
      const g = [r.location, ...(r.locations || [])].filter(Boolean).map(locate).find(x => x.inIsrael);
      if (!g) continue; israel++;
      if (classifyRoles(r.title || '', r.desc || '').length) tech++;
    }
    return { ...a, ok: true, total: raws.length, israel, tech };
  } catch (e) {
    return { ...a, ok: false, error: e.message };
  }
}

(async () => {
  const report = [];
  for (const c of candidates) {
    const found = []; const errors = [];
    const list = attempts(c);
    // a few at a time, politely
    for (let i = 0; i < list.length; i += 4) {
      const res = await Promise.all(list.slice(i, i + 4).map(a => tryOne(c, a)));
      found.push(...res.filter(r => r.ok && r.total > 0));
      errors.push(...res.filter(r => r.explicit && (!r.ok || !r.total)).map(r => ({ ats: r.ats, token: r.token, error: r.error || 'no jobs' })));
      await sleep(300);
    }
    found.sort((a, b) => b.israel - a.israel || b.total - a.total);
    const best = found[0] || null;
    report.push({ company: c.company, type: c.type, best, all: found, errors });
    console.log(`${best ? '✓' : '✗'} ${c.company.padEnd(24)} ${best ? `${best.ats}${best.eu ? ' (eu)' : ''}:${best.token}  total ${best.total}  israel ${best.israel}  tech ${best.tech}` : 'not found'}`);
  }
  fs.writeFileSync(path.join(__dirname, 'discover-report.json'), JSON.stringify({ ranAt: new Date().toISOString(), report }, null, 1));
})();
