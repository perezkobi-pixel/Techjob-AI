#!/usr/bin/env node
// Diagnoses why a custom careers site yields no jobs: robots.txt, sitemaps, sample URLs, JSON-LD on a job page.
const fs = require('fs'); const path = require('path');
const sites = JSON.parse(fs.readFileSync(path.join(__dirname, 'sitemap-debug-sites.json'), 'utf8'));
const UA = 'TechJobAI-collector/1.0 (job aggregator; contact via repository)';
async function get(u) { try { const c = new AbortController(); const t = setTimeout(() => c.abort(), 20000); const r = await fetch(u, { headers: { 'User-Agent': UA }, signal: c.signal, redirect: 'follow' }); clearTimeout(t); return { s: r.status, f: r.url, t: (await r.text()).slice(0, 2000000) }; } catch (e) { return { s: 0, e: e.message, t: '' }; } }
(async () => {
  const out = [];
  for (const site of sites) {
    const o = { site }; const robots = await get(site + '/robots.txt');
    o.robots = { s: robots.s, text: robots.t.slice(0, 800) };
    const maps = [...robots.t.matchAll(/^sitemap:\s*(\S+)/gim)].map(m => m[1]); if (!maps.length) maps.push(site + '/sitemap.xml');
    o.maps = [];
    for (const m of maps.slice(0, 3)) { const r = await get(m); const locs = [...r.t.matchAll(/<loc>\s*([^<\s]+)/gi)].map(x => x[1]); o.maps.push({ url: m, s: r.s, final: r.f, count: locs.length, sample: locs.slice(0, 6), head: r.t.slice(0, 300) }); }
    const home = await get(site); o.home = { s: home.s, final: home.f, len: home.t.length, jobLinks: [...new Set([...home.t.matchAll(/href=["']([^"']*\/job[^"']*)["']/gi)].map(m => m[1]))].slice(0, 6), apis: [...new Set([...home.t.matchAll(/["'](\/?api\/[^"']{3,80})["']/gi)].map(m => m[1]))].slice(0, 8) };
    const sample = (o.maps.flatMap(m => m.sample).find(u => /job/i.test(u) && !/\.xml/i.test(u))) || (o.home.jobLinks[0] && new URL(o.home.jobLinks[0], site).href);
    if (sample) { const p = await get(sample); o.samplePage = { url: sample, s: p.s, len: p.t.length, hasJsonLd: /application\/ld\+json/i.test(p.t), hasJobPosting: /JobPosting/.test(p.t), ld: (p.t.match(/<script[^>]+ld\+json[^>]*>([\s\S]{0,600})/i) || [])[1] }; }
    out.push(o); console.log(site, JSON.stringify(o).slice(0, 300));
  }
  fs.writeFileSync(path.join(__dirname, 'sitemap-debug-report.json'), JSON.stringify(out, null, 1));
})();
