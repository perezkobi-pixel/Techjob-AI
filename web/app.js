/*
 * TechJob AI — web app.
 * Jobs come from data/jobs.js (built by collector/collect.js).
 * Accounts and personal data use Supabase when config.js is filled in, otherwise this browser (local mode).
 */
(function () {
'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LS = {
  get(k, d) { try { const v = localStorage.getItem('tj_' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('tj_' + k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem('tj_' + k); } catch (e) {} }
};

/* ================= data ================= */
const DATA = window.TJ_DATA || { jobs: [], sources: [], generatedAt: null };
const { GROUPS, ROLES, ROLE } = window.TJ_ROLES;
const GROUP_NAME = Object.fromEntries(GROUPS);
const JOBS = DATA.jobs;
const JOB = Object.fromEntries(JOBS.map(j => [j.id, j]));
const ROLE_COUNT = {}; JOBS.forEach(j => j.roles.forEach(r => ROLE_COUNT[r] = (ROLE_COUNT[r] || 0) + 1));
const COMPANIES = new Set(JOBS.map(j => j.company)).size;

const REGIONS = [['all', 'כל הארץ'], ['north', 'צפון (כולל חיפה)'], ['haifa', 'חיפה והקריות'], ['sharon', 'שרון'], ['center', 'מרכז ותל אביב'], ['jerusalem', 'ירושלים והסביבה'], ['shfela', 'שפלה'], ['south', 'דרום']];
const REGION_NAME = Object.fromEntries(REGIONS);
const REGION_SET = { north: ['north', 'haifa'] };
const MODELS = [['any', 'כל המודלים'], ['office', 'משרד'], ['hybrid', 'היברידי'], ['remote', 'עבודה מרחוק']];
const MODEL_NAME = { any: 'כל המודלים', office: 'משרד', hybrid: 'היברידי', remote: 'מרחוק', unknown: 'לא צוין' };
const STATUSES = ['נשלח', 'ראיון', 'משימה', 'הצעה', 'נדחה'];
const PAGE = 25;

/* ================= backend (Supabase or local) ================= */
const CFG = window.TJ_CONFIG || {};
const SB = (CFG.supabaseUrl && CFG.supabaseAnonKey && window.supabase) ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey) : null;
const CLOUD = !!SB;
const HERE = location.href.split('#')[0].split('?')[0];

const blankProfile = () => ({ full_name: '', exp_years: null, skills: [], roles: [], region: 'all', work_model: 'any', salary_min: null, cv_name: null, cv_size_kb: null, cv_uploaded_at: null, cv_path: null, alerts_on: true, alerts_freq: 'יומית' });
const blankUserData = () => ({ profile: blankProfile(), searches: [], saved: {}, apps: {}, feedback: {}, seen: [] });

let me = null;          // {id, email, name, provider}
let U = null;           // user data cache (or guest data)
let guest = false;

const snap = j => ({ id: j.id, title: j.title, company: j.company, city: j.city, region: j.region, model: j.model, url: j.url, roles: j.roles, skills: j.skills, seniority: j.seniority, posted: j.posted, groups: j.groups });
const feats = j => ({ roles: j.roles || [], skills: j.skills || [], company: j.company, seniority: j.seniority, model: j.model, groups: j.groups || [] });

const Local = {
  accounts() { return LS.get('accounts', {}); },
  saveAcc(a) { LS.set('accounts', a); },
  async session() { const e = LS.get('session', null); const a = this.accounts(); return e && a[e] ? a[e].user : null; },
  async signUp(name, email, pw) {
    const a = this.accounts(); if (a[email]) throw new Error('כבר יש חשבון עם האימייל הזה במכשיר. עבור ל„כניסה”.');
    a[email] = { user: { id: 'local:' + email, email, name, provider: 'email' }, pw: await hash(pw), data: blankUserData() };
    a[email].data.profile.full_name = name; this.saveAcc(a); LS.set('session', email); return { user: a[email].user };
  },
  async signIn(email, pw) {
    const a = this.accounts(); if (!a[email]) throw new Error('לא נמצא חשבון עם האימייל הזה במכשיר הזה.');
    if (a[email].pw && a[email].pw !== await hash(pw)) throw new Error('הסיסמה שגויה.');
    LS.set('session', email); return a[email].user;
  },
  async signOut() { LS.del('session'); },
  async load() { const a = this.accounts(); return a[me.email].data; },
  async persist() { const a = this.accounts(); if (a[me.email]) { a[me.email].data = U; this.saveAcc(a); } },
  async deleteAccount() { const a = this.accounts(); delete a[me.email]; this.saveAcc(a); LS.del('session'); }
};
async function hash(s) { try { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('tj:' + s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); } catch (e) { return null; } }

const Cloud = {
  toUser(u) { return u ? { id: u.id, email: u.email, name: u.user_metadata?.full_name || u.user_metadata?.name || (u.email || '').split('@')[0], provider: u.app_metadata?.provider || 'email' } : null; },
  async session() { const { data } = await SB.auth.getSession(); return this.toUser(data.session?.user); },
  async signUp(name, email, pw) {
    const { data, error } = await SB.auth.signUp({ email, password: pw, options: { data: { full_name: name }, emailRedirectTo: HERE } });
    if (error) throw new Error(heError(error)); return { user: this.toUser(data.session?.user), needsConfirm: !data.session };
  },
  async signIn(email, pw) { const { data, error } = await SB.auth.signInWithPassword({ email, password: pw }); if (error) throw new Error(heError(error)); return this.toUser(data.user); },
  async google() { const { error } = await SB.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: HERE } }); if (error) throw new Error(heError(error)); },
  async reset(email) { const { error } = await SB.auth.resetPasswordForEmail(email, { redirectTo: HERE }); if (error) throw new Error(heError(error)); },
  async newPassword(pw) { const { error } = await SB.auth.updateUser({ password: pw }); if (error) throw new Error(heError(error)); },
  async signOut() { await SB.auth.signOut(); },
  async load() {
    const uid = me.id;
    const [p, s, sj, ap, fb, se] = await Promise.all([
      SB.from('profiles').select('*').eq('id', uid).maybeSingle(),
      SB.from('saved_searches').select('*').order('created_at', { ascending: false }),
      SB.from('saved_jobs').select('*'), SB.from('applications').select('*'), SB.from('job_feedback').select('*'), SB.from('alert_seen').select('job_id')
    ]);
    const err = [p, s, sj, ap, fb, se].find(r => r.error); if (err) throw new Error(err.error.message);
    const d = blankUserData();
    d.profile = Object.assign(blankProfile(), p.data || {});
    if (!d.profile.full_name) d.profile.full_name = me.name;
    d.searches = (s.data || []).map(r => ({ id: r.id, name: r.name, role: r.role, text: r.query_text, region: r.region, model: r.work_model }));
    (sj.data || []).forEach(r => d.saved[r.job_id] = { job: r.job, saved_at: r.saved_at });
    (ap.data || []).forEach(r => d.apps[r.job_id] = { job: r.job, status: r.status, created_at: r.created_at });
    (fb.data || []).forEach(r => d.feedback[r.job_id] = { value: r.value, features: r.features });
    d.seen = (se.data || []).map(r => r.job_id);
    return d;
  },
  async deleteAccount() {
    if (U.profile.cv_path) await SB.storage.from('cvs').remove([U.profile.cv_path]);
    const { error } = await SB.rpc('delete_my_account'); if (error) throw new Error(heError(error));
    await SB.auth.signOut();
  }
};
function heError(e) {
  const m = (e && (e.message || e.error_description)) || String(e);
  if (/invalid login/i.test(m)) return 'האימייל או הסיסמה שגויים.';
  if (/already registered|already exists/i.test(m)) return 'כבר יש חשבון עם האימייל הזה. עבור ל„כניסה”.';
  if (/email not confirmed/i.test(m)) return 'צריך לאשר את האימייל. בדוק את תיבת הדואר שלך.';
  if (/password should be at least|weak password/i.test(m)) return 'הסיסמה חלשה מדי. בחר לפחות 8 תווים.';
  if (/rate limit|too many/i.test(m)) return 'יותר מדי ניסיונות. נסה שוב בעוד כמה דקות.';
  if (/provider is not enabled/i.test(m)) return 'ההתחברות עם Google עוד לא הופעלה ב־Supabase (ראה המדריך).';
  if (/failed to fetch|network/i.test(m)) return 'אין חיבור לשרת. בדוק את החיבור לאינטרנט.';
  return m;
}
const Auth = CLOUD ? Cloud : Local;

/* --- writes: update the cache first, then persist; show an error if it fails --- */
async function write(fn) {
  try { if (CLOUD) { const r = await fn(); if (r && r.error) throw r.error; } else await Local.persist(); }
  catch (e) { toast('השינוי לא נשמר: ' + heError(e)); }
}
const W = {
  profile(patch) { Object.assign(U.profile, patch); return write(() => SB.from('profiles').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', me.id)); },
  async addSearch(s) {
    if (!CLOUD) { s.id = 'l' + Date.now(); U.searches.unshift(s); return write(); }
    const { data, error } = await SB.from('saved_searches').insert({ name: s.name, role: s.role, query_text: s.text, region: s.region, work_model: s.model }).select().single();
    if (error) { toast('החיפוש לא נשמר: ' + heError(error)); return; }
    U.searches.unshift({ ...s, id: data.id });
  },
  delSearch(id) { U.searches = U.searches.filter(s => s.id !== id); return write(() => SB.from('saved_searches').delete().eq('id', id)); },
  save(j) { U.saved[j.id] = { job: snap(j), saved_at: new Date().toISOString() }; return write(() => SB.from('saved_jobs').upsert({ job_id: j.id, job: snap(j) })); },
  unsave(id) { delete U.saved[id]; return write(() => SB.from('saved_jobs').delete().eq('job_id', id)); },
  app(j, status) {
    const ex = U.apps[j.id]; U.apps[j.id] = { job: ex ? ex.job : snap(j), status, created_at: ex ? ex.created_at : new Date().toISOString() };
    return write(() => SB.from('applications').upsert({ job_id: j.id, job: U.apps[j.id].job, status, updated_at: new Date().toISOString() }));
  },
  unapp(id) { delete U.apps[id]; return write(() => SB.from('applications').delete().eq('job_id', id)); },
  feedback(j, value) {
    if (!value) { delete U.feedback[j.id]; } else U.feedback[j.id] = { value, features: feats(j) };
    if (guest) { LS.set('guest', U); return; }
    return write(() => value ? SB.from('job_feedback').upsert({ job_id: j.id, value, features: feats(j) }) : SB.from('job_feedback').delete().eq('job_id', j.id));
  },
  seen(ids) {
    const nw = ids.filter(id => !U.seen.includes(id)); if (!nw.length) return; U.seen.push(...nw);
    return write(() => SB.from('alert_seen').upsert(nw.map(job_id => ({ job_id }))));
  },
  async cv(file) {
    if (!CLOUD) return W.profile({ cv_name: file.name, cv_size_kb: Math.max(1, Math.round(file.size / 1024)), cv_uploaded_at: new Date().toISOString() });
    const safe = file.name.replace(/[^\w.\-]+/g, '_').slice(-80);
    const p = `${me.id}/${Date.now()}-${safe}`;
    const { error } = await SB.storage.from('cvs').upload(p, file, { contentType: file.type || undefined });
    if (error) { toast('ההעלאה נכשלה: ' + heError(error)); return; }
    if (U.profile.cv_path) SB.storage.from('cvs').remove([U.profile.cv_path]);
    await W.profile({ cv_path: p, cv_name: file.name, cv_size_kb: Math.max(1, Math.round(file.size / 1024)), cv_uploaded_at: new Date().toISOString() });
  }
};

/* ================= state ================= */
let screen = 'loading', accTab = null, authMode = 'signup', termsOk = !!LS.get('terms', false);
let Q = { role: null, text: '', region: 'all', model: 'any' };
let lastQ = null, results = [], shown = PAGE, sort = 'match', appFilter = 'all', delConfirm = false, recoveryMode = false;

/* ================= icons ================= */
const P = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4.3-4.3"/>', list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>', bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0"/>',
  bookmark: '<path d="M6 4h12v17l-6-4-6 4z"/>', star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z"/>',
  board: '<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="11" rx="1"/><rect x="17" y="4" width="4" height="7" rx="1"/>',
  doc: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>', x: '<path d="M6 6l12 12M18 6 6 18"/>', back: '<path d="m9 6 6 6-6 6"/>',
  chevL: '<path d="m15 6-6 6 6 6"/>', down: '<path d="m6 9 6 6 6-6"/>', ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/>',
  up: '<path d="M7 10v11"/><path d="M15 5.9 14 10h5.8a2 2 0 0 1 1.9 2.6l-2.3 8a2 2 0 0 1-1.9 1.4H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.8a2 2 0 0 0 1.8-1.1L12 2a3.1 3.1 0 0 1 3 3.9Z"/>',
  dn: '<path d="M17 14V3"/><path d="M9 18.1 10 14H4.2a2 2 0 0 1-1.9-2.6l2.3-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.8a2 2 0 0 0-1.8 1.1L12 22a3.1 3.1 0 0 1-3-3.9Z"/>',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>', target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".8"/>',
  chip: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', out: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>'
};
const ic = (n, f) => `<svg viewBox="0 0 24 24" fill="${f ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n]}</svg>`;

/* ================= helpers ================= */
let tt; function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 2800); }
const DAY = 864e5;
const daysAgo = d => d ? Math.max(0, Math.floor((Date.now() - new Date(d + 'T12:00:00').getTime()) / DAY)) : null;
const ago = d => { const n = daysAgo(d); return n == null ? '' : n === 0 ? 'היום' : n === 1 ? 'אתמול' : n < 31 ? `לפני ${n} ימים` : n < 365 ? `לפני ${Math.round(n / 30)} חודשים` : 'לפני יותר משנה'; };
const fmtDate = d => d ? new Date(d).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: '2-digit' }) : '';
const scls = s => s >= 80 ? 'hi' : s >= 60 ? 'mid' : 'lo';
const ringC = s => s >= 80 ? 'var(--good)' : s >= 60 ? 'var(--accent)' : 'var(--warn)';
const loc = j => j.model === 'remote' ? 'מרחוק' + (j.city && j.city !== 'ישראל' ? ` · ${j.city}` : '') : (j.city || 'ישראל');
const qLabel = q => q.role ? ROLE[q.role]?.he || q.role : q.text || 'כל המשרות';
const qSub = q => [REGION_NAME[q.region] || 'כל הארץ', MODEL_NAME[q.model]].join(' · ');
const norm = s => String(s || '').toLowerCase().replace(/[׳'"’]/g, '').replace(/\s+/g, ' ').trim();
// "מנהל/ת" should match both "מנהל" and "מנהלת"
const heForms = he => [he.replace(/\/(ית|ת|ה)(?=\s|$)/g, ''), he.replace(/(\S+)\/(ית|ת|ה)(?=\s|$)/g, (m, a, b) => a + b)];
const roleMatches = q => { q = norm(q); return q ? ROLES.filter(r => heForms(r.he).some(f => norm(f).includes(q)) || r.en.some(e => norm(e).includes(q))) : ROLES; };
const salaryText = s => !s ? '' : s.text ? s.text : (s.min || s.max) ? `${s.currency || ''} ${[s.min, s.max].filter(Boolean).map(n => Number(n).toLocaleString('he-IL')).join('–')}` : '';
const isFn = x => typeof x === 'function';

/* ================= learning from likes ================= */
function weights() {
  const Wt = {};
  for (const f of Object.values(U?.feedback || {})) {
    const v = f.value, x = f.features || {};
    (x.roles || []).forEach(r => Wt['r:' + r] = (Wt['r:' + r] || 0) + v);
    (x.skills || []).forEach(s => Wt['s:' + s] = (Wt['s:' + s] || 0) + v);
    (x.groups || []).forEach(g => Wt['g:' + g] = (Wt['g:' + g] || 0) + v);
    if (x.company) Wt['c:' + x.company] = (Wt['c:' + x.company] || 0) + v;
    if (x.seniority) Wt['l:' + x.seniority] = (Wt['l:' + x.seniority] || 0) + v;
    if (x.model) Wt['m:' + x.model] = (Wt['m:' + x.model] || 0) + v;
  }
  return Wt;
}
function boost(j, Wt) {
  let b = 0;
  j.roles.forEach(r => b += (Wt['r:' + r] || 0) * 4);
  j.skills.forEach(s => b += (Wt['s:' + s] || 0) * 1.2);
  (j.groups || []).forEach(g => b += (Wt['g:' + g] || 0) * 1.5);
  b += (Wt['c:' + j.company] || 0) * 2 + (Wt['l:' + j.seniority] || 0) * 2 + (Wt['m:' + j.model] || 0);
  return Math.round(Math.max(-20, Math.min(20, b)));
}
const fbCount = () => Object.keys(U?.feedback || {}).length;
const fbOf = id => U?.feedback?.[id]?.value || 0;

/* ================= search ================= */
function regionOk(j, region) {
  if (region === 'all' || j.model === 'remote') return true;
  return (REGION_SET[region] || [region]).includes(j.region);
}
function matchText(j, t) {
  const rs = roleMatches(t).map(r => r.id);
  if (j.roles.some(r => rs.includes(r))) return true;
  const hay = norm(`${j.title} ${j.company} ${j.skills.join(' ')} ${j.dept || ''}`);
  return t.split(' ').filter(Boolean).every(w => hay.includes(w));
}
function matchesQ(j, q) {
  if (q.role) { if (!j.roles.includes(q.role)) return false; }
  else if (q.text) { if (!matchText(j, norm(q.text))) return false; }
  if (!regionOk(j, q.region)) return false;
  if (q.model !== 'any' && j.model !== q.model && j.model !== 'unknown') return false;
  return true;
}
function score(j, q, Wt) {
  const prof = me ? U.profile : null; const R = []; let t = 0;
  const hasQ = !!(q.role || q.text);
  const r = !hasQ ? 22 : q.role ? (j.roles[0] === q.role ? 35 : 31) : (norm(j.title).includes(norm(q.text)) ? 33 : 27);
  R.push([!hasQ ? 'לא הוגדר תפקיד, כל התפקידים נכללים' : q.role ? `התפקיד תואם ל„${ROLE[q.role].he}”` : `המשרה תואמת לחיפוש „${q.text}”`, r, 35]); t += r;
  const regExact = q.region === 'all' || (REGION_SET[q.region] || [q.region]).includes(j.region);
  const rg = regExact ? 15 : 11;
  R.push([j.model === 'remote' ? 'עבודה מרחוק' : q.region === 'all' ? `מיקום: ${j.city || 'ישראל'}` : `${j.city || 'ישראל'} באזור ${REGION_NAME[q.region]}`, rg, 15]); t += rg;
  const md = q.model === 'any' ? 10 : j.model === q.model ? 10 : 5;
  R.push([j.model === 'unknown' ? 'מודל העסקה לא צוין במודעה' : `מודל העסקה: ${MODEL_NAME[j.model]}`, md, 10]); t += md;
  let sk = 12, have = [], miss = j.skills;
  if (prof && prof.skills.length && j.skills.length) {
    const ps = prof.skills.map(norm);
    have = j.skills.filter(s => ps.includes(norm(s))); miss = j.skills.filter(s => !ps.includes(norm(s)));
    sk = Math.round(8 + 17 * have.length / Math.min(j.skills.length, 8));
    sk = Math.min(25, sk);
    R.push([`${have.length} מתוך ${j.skills.length} כישורים מהמודעה קיימים בפרופיל שלך`, sk, 25]);
  } else R.push([me ? (j.skills.length ? 'מלא כישורים בפרופיל כדי לחשב התאמת כישורים' : 'במודעה לא פורטו כישורים') : 'הירשם ומלא פרופיל כדי לחשב התאמת כישורים', sk, 25]);
  t += sk;
  const n = daysAgo(j.posted);
  const fr = n == null ? 6 : n <= 7 ? 15 : n <= 30 ? 11 : n <= 60 ? 7 : 3;
  R.push([n == null ? 'תאריך פרסום לא ידוע' : `פורסמה ${ago(j.posted)}`, fr, 15]); t += fr;
  const b = boost(j, Wt); if (fbCount()) R.push(['למידה מהלייקים והדיסלייקים שלך', b, null]);
  t += b;
  return { score: Math.max(15, Math.min(98, Math.round(t))), reasons: R, have, miss, boost: b };
}
function runSearch(q) {
  const Wt = weights();
  results = JOBS.filter(j => fbOf(j.id) !== -1 && matchesQ(j, q)).map(j => ({ ...j, ...score(j, q, Wt) }));
  lastQ = { ...q }; shown = PAGE;
  if (guest) LS.set('guestQ', lastQ);
}
function sorted() {
  const r = results.slice();
  if (sort === 'match') r.sort((a, b) => b.score - a.score || String(b.posted).localeCompare(String(a.posted)));
  if (sort === 'date') r.sort((a, b) => String(b.posted || '').localeCompare(String(a.posted || '')));
  if (sort === 'company') r.sort((a, b) => a.company.localeCompare(b.company) || b.score - a.score);
  return r;
}
function alertJobs() {
  if (!me || !U.profile.alerts_on) return [];
  const qs = U.searches.map(s => ({ role: s.role, text: s.text, region: s.region, model: s.model }));
  U.profile.roles.forEach(r => qs.push({ role: r, text: '', region: U.profile.region || 'all', model: U.profile.work_model || 'any' }));
  if (!qs.length) return [];
  return JOBS.filter(j => { const n = daysAgo(j.posted); return n != null && n <= 7 && fbOf(j.id) !== -1 && qs.some(q => matchesQ(j, q)); })
    .sort((a, b) => String(b.posted).localeCompare(String(a.posted)));
}
const unseen = () => me ? alertJobs().filter(j => !U.seen.includes(j.id)).length : 0;

/* ================= navigation ================= */
function go(s, opts = {}) {
  const st = { s, acc: opts.acc || null };
  try { opts.replace ? history.replaceState(st, '') : history.pushState(st, ''); } catch (e) {}
  screen = s; accTab = opts.acc || null; delConfirm = false; render(); window.scrollTo(0, 0);
}
window.addEventListener('popstate', e => {
  if ($('#sheet').classList.contains('open')) { closeSheet(true); return; }
  const st = e.state || { s: (me || guest) ? 'search' : 'welcome' };
  const inside = me || guest;
  screen = (!inside && !['welcome', 'auth'].includes(st.s)) ? 'welcome' : (inside && ['welcome', 'auth'].includes(st.s) && !(guest && st.s === 'auth')) ? 'search' : st.s;
  accTab = st.acc || null; render();
});

/* ================= chrome ================= */
function renderChrome() {
  const inApp = !['welcome', 'auth', 'loading', 'newpw'].includes(screen);
  $('#top').hidden = !inApp; $('#bnav').hidden = !inApp;
  if (!inApp) return;
  const n = unseen();
  $('#topActions').innerHTML = me
    ? `<button class="icon-btn" data-go="account" data-acc="alerts" aria-label="התראות">${ic('bell')}${n ? `<span class="dot-badge">${n}</span>` : ''}</button><button class="icon-btn" data-go="account" aria-label="החשבון שלי"><span class="avatar">${esc((U.profile.full_name || me.name || '?').trim()[0] || '?')}</span></button>`
    : `<span class="guest-tag">אורח</span><button class="btn sm primary" data-act="toauth" data-mode="signup" style="min-height:36px">הרשמה</button>`;
  const items = [['search', 'חיפוש', 'search'], ['results', 'משרות', 'list'], ['account', 'החשבון שלי', 'user']];
  $('#bnavIn').innerHTML = items.map(([id, l, i]) => `<button data-go="${id}" ${screen === id ? 'aria-current="page"' : ''} ${id === 'results' && !lastQ ? 'disabled' : ''}>${ic(i)}<span>${l}</span>${id === 'account' && n ? `<span class="dot-badge">${n}</span>` : ''}</button>`).join('');
}

/* ================= screens ================= */
function vWelcome() {
  return `<div class="welcome">
   <section class="w-hero"><div class="w-hero-in">
     <div class="brand"><div class="brand-mark">TJ</div><div class="brand-name" style="color:var(--head-ink)">TechJob <b>AI</b></div></div>
     <h1>ברוך הבא ל־<span>TechJob AI</span></h1>
     <p>כל משרות ההייטק והטכנולוגיה בישראל במקום אחד, עם התאמה חכמה שלומדת מה אתה מחפש.</p>
     <ul class="w-points">
       <li>${ic('layers')}${JOBS.length ? `${JOBS.length.toLocaleString('he-IL')} משרות פעילות מ־${COMPANIES} חברות` : 'משרות מלוחות הדרושים של חברות הייטק'}</li>
       <li>${ic('target')}התאמה חכמה שמשתפרת עם כל לייק</li>
       <li>${ic('chip')}${ROLES.length} תפקידים מעולם הטכנולוגיה</li>
     </ul>
   </div></section>
   <section class="w-sheet"><div class="w-sheet-in">
     <div class="terms">
       <div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><h3>תנאי שימוש</h3><button class="link small" data-act="terms" aria-expanded="false" aria-controls="termsBody">קרא את התנאים</button></div>
       <div class="terms-body" id="termsBody"><ol>
         <li>TechJob AI מרכזת מודעות דרושים מלוחות הדרושים הציבוריים של חברות. האחריות לתוכן כל מודעה היא של החברה המפרסמת.</li>
         <li>ציון ההתאמה הוא הערכה ממוחשבת בלבד. הוא אינו מבטיח התאמה או קבלה לעבודה.</li>
         <li>הגשת מועמדות מתבצעת באתר החברה, דרך הקישור שבכל משרה.</li>
         <li>קורות חיים ונתונים אישיים נשמרים בחשבון שלך בלבד, משמשים להתאמת משרות ואינם נחשפים למשתמשים אחרים.</li>
         <li>סימוני לייק ודיסלייק משמשים לשיפור התוצאות שלך בלבד.</li>
         <li>אפשר למחוק את החשבון ואת כל הנתונים בכל עת מתוך החשבון האישי.</li>
       </ol></div>
       <label class="check"><input type="checkbox" id="agree" ${termsOk ? 'checked' : ''}><span>קראתי ואני מסכים לתנאי השימוש ולמדיניות הפרטיות</span></label>
     </div>
     <button class="btn primary big" data-act="toauth" data-mode="signup" ${termsOk ? '' : 'disabled'}>הרשמה</button>
     <button class="btn big" data-act="guest" ${termsOk ? '' : 'disabled'}>כניסה כאורח</button>
     <p class="small muted" style="text-align:center;margin:2px 0 0">כבר יש לך חשבון? <button class="link" data-act="toauth" data-mode="login" ${termsOk ? '' : 'disabled'}>התחברות</button></p>
     ${termsOk ? '' : '<p class="small muted" style="text-align:center;margin:0">יש לאשר את תנאי השימוש כדי להמשיך</p>'}
   </div></section></div>`;
}
function vAuth() {
  const su = authMode === 'signup', rs = authMode === 'reset';
  return `<main class="wrap" style="max-width:520px">
    <div class="subhead"><button class="icon-btn" data-act="back" aria-label="חזרה">${ic('back')}</button><div class="brand"><div class="brand-mark">TJ</div><div class="brand-name">TechJob <b>AI</b></div></div></div>
    <h1>${rs ? 'איפוס סיסמה' : su ? 'יצירת חשבון' : 'התחברות'}</h1>
    ${rs ? '' : `<div class="seg" role="tablist"><button role="tab" aria-selected="${su}" data-mode="signup" data-act="mode">הרשמה</button><button role="tab" aria-selected="${!su}" data-mode="login" data-act="mode">כניסה</button></div>
    <button class="btn big" data-act="google" ${CLOUD ? '' : 'disabled'}><span class="g-mark">G</span>המשך עם Google</button>
    ${CLOUD ? '' : '<p class="note" style="margin:-6px 0 0">התחברות עם Google תופעל אחרי חיבור Supabase (שלב 3 במדריך).</p>'}
    <div class="or">או עם אימייל</div>`}
    <form class="card" id="authForm" novalidate>
      ${su ? `<div class="field"><label for="aName">שם מלא</label><input class="input" id="aName" autocomplete="name" placeholder="איך לקרוא לך?"></div>` : ''}
      <div class="field"><label for="aEmail">אימייל</label><input class="input" id="aEmail" type="email" inputmode="email" autocomplete="email" dir="ltr" style="text-align:right" placeholder="name@example.com"></div>
      ${rs ? '' : `<div class="field"><label for="aPass">סיסמה</label><div class="pw"><input class="input" id="aPass" type="password" autocomplete="${su ? 'new-password' : 'current-password'}" dir="ltr" style="text-align:right" placeholder="${su ? 'לפחות 8 תווים' : ''}"><button type="button" class="icon-btn" data-act="pw" aria-label="הצג סיסמה">${ic('eye')}</button></div></div>`}
      <div class="err" id="aErr" role="alert"></div>
      <button class="btn primary big" type="submit" id="aSubmit">${rs ? 'שלח קישור לאיפוס' : su ? 'יצירת חשבון' : 'כניסה'}</button>
      ${!su && !rs && CLOUD ? `<button type="button" class="link small" data-act="mode" data-mode="reset" style="justify-self:start">שכחתי סיסמה</button>` : ''}
    </form>
    ${CLOUD ? '' : '<p class="note">מצב מקומי: החשבון נשמר רק בדפדפן במכשיר הזה. אחרי חיבור Supabase החשבונות יישמרו בענן ויעבדו מכל מכשיר.</p>'}
    ${su || rs ? '' : `<p class="small muted" style="text-align:center;margin:0">אין לך חשבון? <button class="link" data-act="mode" data-mode="signup">הרשמה</button></p>`}
  </main>`;
}
function vNewPw() {
  return `<main class="wrap" style="max-width:520px"><h1>סיסמה חדשה</h1>
    <form class="card" id="newPwForm"><div class="field"><label for="np">סיסמה חדשה</label><input class="input" id="np" type="password" autocomplete="new-password" dir="ltr" style="text-align:right" placeholder="לפחות 8 תווים"></div>
    <div class="err" id="npErr" role="alert"></div><button class="btn primary big" type="submit">שמור סיסמה</button></form></main>`;
}
function vSearch() {
  const r = Q.role ? ROLE[Q.role] : null;
  const upd = DATA.generatedAt ? new Date(DATA.generatedAt) : null;
  return `<main class="wrap">
    <div><h1>איזו משרה לחפש?</h1></div>
    <form class="card" id="searchForm" role="search">
      <div class="field"><label for="roleInput" id="roleLbl">תפקיד</label>
        <div class="combo"><input class="input" id="roleInput" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="roleList" aria-labelledby="roleLbl" autocomplete="off" enterkeyhint="search" placeholder="הקלד תפקיד, למשל: מנהל" value="${esc(r ? r.he : Q.text)}">
        <button type="button" class="icon-btn cbtn" id="comboBtn" aria-label="${r || Q.text ? 'נקה' : 'הצג את כל התפקידים'}" tabindex="-1">${ic(r || Q.text ? 'x' : 'down')}</button>
        <ul class="listbox" id="roleList" role="listbox" aria-labelledby="roleLbl" hidden></ul></div>
        <div class="syn" id="syn">${synText()}</div>
      </div>
      <div class="field"><label for="regionSel">אזור</label><select class="select" id="regionSel">${REGIONS.map(([k, v]) => `<option value="${k}" ${Q.region === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div class="field"><label for="modelSel">מודל העסקה</label><select class="select" id="modelSel">${MODELS.map(([k, v]) => `<option value="${k}" ${Q.model === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <button class="btn primary big" type="submit">${ic('search')}חפש משרות</button>
    </form>
    <p class="data-note">${JOBS.length.toLocaleString('he-IL')} משרות פעילות מ־${COMPANIES} חברות${upd ? ` · עודכן ${upd.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })}` : ''}</p>
  </main>`;
}
function synText() {
  const r = Q.role ? ROLE[Q.role] : null;
  if (r) return `מחפש גם: ${r.en.map(e => `<span>${esc(e)}</span>`).join(', ')}`;
  if (Q.text) return `מחפש כל משרה שקשורה ל„${esc(Q.text)}”`;
  return '';
}
function jobCard(j) {
  const fb = fbOf(j.id);
  if (fb === -1) return `<article class="job disliked"><div style="min-width:0"><div class="t" dir="auto">${esc(j.title)} · ${esc(j.company)}</div><div class="s">סימנת שזה לא הכיוון. משרות דומות ידורגו נמוך יותר בחיפוש הבא.</div></div><button class="btn sm ghost" data-fb="${j.id}" data-v="0">ביטול</button></article>`;
  const dir = !fb && j.boost >= 6;
  return `<article class="job ${fb === 1 ? 'liked' : ''}" data-open="${j.id}" tabindex="0">
    <div class="job-top"><div style="min-width:0"><h3 class="job-title" dir="auto">${esc(j.title)}</h3><div class="job-co">${esc(j.company)} · ${esc(loc(j))}${j.model === 'hybrid' || j.model === 'office' ? ' · ' + MODEL_NAME[j.model] : ''}</div></div><span class="score ${scls(j.score)}" title="ציון התאמה">${j.score}%</span></div>
    <div class="job-meta"><span>${ago(j.posted)}</span><span>${esc(j.seniority)}</span>${salaryText(j.salary) ? `<span class="sal" dir="ltr">${esc(salaryText(j.salary))}</span>` : ''}${dir ? `<span class="dir-tag">${ic('spark')}בכיוון שאהבת</span>` : ''}</div>
    <div class="job-actions">
      <button class="fb up" data-fb="${j.id}" data-v="1" aria-pressed="${fb === 1}" aria-label="לייק: זה הכיוון" title="זה הכיוון">${ic('up')}</button>
      <button class="fb down" data-fb="${j.id}" data-v="-1" aria-pressed="false" aria-label="דיסלייק: לא הכיוון" title="לא הכיוון">${ic('dn')}</button>
      <span class="grow"></span>
      <button class="btn sm" data-open="${j.id}">פרטים</button>
      <a class="btn sm primary" href="${esc(j.url)}" target="_blank" rel="noopener" data-link="${j.id}">${ic('ext')}למשרה</a>
    </div></article>`;
}
function vResults(loading) {
  if (!lastQ) return `<main class="wrap"><div class="empty"><h3>עוד לא חיפשת</h3><button class="btn primary" data-go="search">לחיפוש משרות</button></div></main>`;
  const r = sorted(); const n = fbCount();
  const savedAlready = me && U.searches.some(s => s.role === lastQ.role && (s.text || '') === (lastQ.text || '') && s.region === lastQ.region && s.model === lastQ.model);
  const unknownModel = lastQ.model !== 'any' && r.some(j => j.model === 'unknown');
  return `<main class="wrap">
    <div class="qbar"><div class="q"><b dir="auto">${esc(qLabel(lastQ))}</b><span>${qSub(lastQ)}</span></div>
      <button class="icon-btn" data-act="savesearch" aria-label="${savedAlready ? 'החיפוש שמור' : 'שמור חיפוש'}" title="${savedAlready ? 'החיפוש שמור' : 'שמור חיפוש'}" style="${savedAlready ? 'color:var(--accent)' : ''}">${ic('star', savedAlready)}</button>
      <button class="btn sm" data-go="search">שנה</button></div>
    <div class="rhead"><div><div class="rcount">${loading ? 'מחפש משרות…' : r.length.toLocaleString('he-IL') + ' משרות'}</div>${n ? `<span class="learn" id="learn">${ic('spark')}התוצאות מותאמות לפי ${n} סימונים שלך</span>` : `<span class="small muted" id="learn">סמן לייק או דיסלייק כדי שה־AI ילמד מה מתאים לך</span>`}</div>
      <select class="select" id="sort" aria-label="מיון" style="width:auto;min-height:40px;padding-block:6px;font-size:14px"><option value="match" ${sort === 'match' ? 'selected' : ''}>הכי מתאים</option><option value="date" ${sort === 'date' ? 'selected' : ''}>הכי חדש</option><option value="company" ${sort === 'company' ? 'selected' : ''}>לפי חברה</option></select></div>
    ${unknownModel && !loading ? `<p class="small muted" style="margin:-6px 0 0">כולל משרות שבהן מודל ההעסקה לא צוין במודעה.</p>` : ''}
    <div class="list" id="list">${loading ? '<div class="skel"></div><div class="skel"></div><div class="skel"></div>' : listHTML(r)}</div>
  </main>`;
}
function listHTML(r) {
  if (!r.length) return `<div class="empty"><h3>לא נמצאו משרות</h3><span>נסה אזור „כל הארץ”, מודל העסקה אחר, או תפקיד רחב יותר.</span><button class="btn" data-go="search">שנה חיפוש</button></div>`;
  return r.slice(0, shown).map(jobCard).join('') + (r.length > shown ? `<button class="btn more-btn" data-act="more">הצג עוד ${Math.min(PAGE, r.length - shown)} משרות (${(r.length - shown).toLocaleString('he-IL')} נוספות)</button>` : '');
}

/* ---- account ---- */
const ACC = [['searches', 'החיפושים שלי', 'star'], ['saved', 'משרות שמורות', 'bookmark'], ['alerts', 'התראות חכמות', 'bell'], ['profile', 'הפרופיל המקצועי שלי', 'doc'], ['apps', 'מעקב מועמדויות', 'board']];
function completeness(p) { let c = 0; if (p.cv_name) c += 25; if (p.exp_years != null && p.exp_years !== '') c += 15; if (p.skills.length >= 3) c += 25; else if (p.skills.length) c += 10; if (p.roles.length) c += 20; if (p.region !== 'all' || p.work_model !== 'any') c += 15; return c; }
function vAccount() {
  if (!me) return `<main class="wrap"><h1>החשבון האישי</h1>
    <div class="card"><h2>הירשם כדי לשמור ולעקוב</h2><p class="muted" style="margin:0">עם חשבון אישי תוכל:</p>
    <div class="menu">${ACC.map(([, l, i]) => `<button tabindex="-1" style="cursor:default;grid-template-columns:40px 1fr"><span class="ico">${ic(i)}</span><span class="t">${l}</span></button>`).join('')}</div>
    <button class="btn primary big" data-act="toauth" data-mode="signup">הרשמה</button><button class="btn" data-act="toauth" data-mode="login">כבר יש לי חשבון</button></div>
    <button class="btn ghost" data-act="logout">יציאה למסך הפתיחה</button></main>`;
  if (accTab) return vAccSub();
  const n = unseen(); const appsArr = Object.values(U.apps); const st = STATUSES.map(s => [s, appsArr.filter(x => x.status === s).length]).filter(x => x[1]);
  const desc = { searches: `${U.searches.length} חיפושים שמורים`, saved: `${Object.keys(U.saved).length} משרות לבדיקה`, alerts: U.profile.alerts_on ? (n ? `${n} משרות חדשות` : 'אין משרות חדשות') : 'כבויות', profile: `הושלם ${completeness(U.profile)}%`, apps: st.length ? st.map(([s, c]) => `${c} ${s}`).join(' · ') : 'אין מועמדויות במעקב' };
  return `<main class="wrap">
    <div class="acc-head"><span class="avatar">${esc((U.profile.full_name || me.name || '?').trim()[0] || '?')}</span><div style="min-width:0"><h1 style="font-size:26px">${esc(U.profile.full_name || me.name)}</h1><div class="small muted" dir="ltr" style="text-align:right">${esc(me.email)}</div></div></div>
    ${CLOUD ? '' : '<div class="banner info"><span>מצב מקומי: הנתונים נשמרים בדפדפן הזה בלבד.</span></div>'}
    <nav class="menu">${ACC.map(([id, l, i]) => `<button data-go="account" data-acc="${id}"><span class="ico">${ic(i)}</span><span><span class="t" style="display:block">${l}</span><span class="d">${desc[id]}</span></span><span>${id === 'alerts' && n ? `<span class="pill new">${n} חדשות</span>` : ''}</span><span class="chev">${ic('chevL')}</span></button>`).join('')}</nav>
    <div style="display:grid;gap:8px">
      <button class="btn" data-act="logout">${ic('out')}יציאה מהחשבון</button>
      ${delConfirm ? `<div class="card" style="gap:10px"><b>למחוק את החשבון?</b><span class="small muted">קורות החיים, החיפושים, המשרות השמורות, הלייקים והמועמדויות יימחקו לצמיתות.</span><div class="two"><button class="btn danger" data-act="delete">כן, מחק</button><button class="btn" data-act="nodelete">ביטול</button></div></div>` : `<button class="btn ghost" data-act="askdelete" style="color:var(--bad)">מחיקת החשבון וכל הנתונים</button>`}
    </div></main>`;
}
const subHead = t => `<div class="subhead"><button class="icon-btn" data-act="back" aria-label="חזרה">${ic('back')}</button><h1>${t}</h1></div>`;
const liveOrSnap = (id, s) => JOB[id] || s;
function vAccSub() {
  const title = ACC.find(x => x[0] === accTab)[1]; let body = '';
  if (accTab === 'searches') {
    body = U.searches.length ? `<div class="card" style="gap:0;padding-block:6px">${U.searches.map(s => `<div class="row"><div class="grow"><div class="t" dir="auto">${esc(s.name)}</div><div class="d">${esc(qLabel(s))} · ${qSub(s)} · ${JOBS.filter(j => matchesQ(j, s)).length} משרות כרגע</div></div><div class="row-actions"><button class="btn sm primary" data-runsearch="${esc(s.id)}">${ic('search')}הרץ</button><button class="icon-btn" data-delsearch="${esc(s.id)}" aria-label="מחק חיפוש">${ic('x')}</button></div></div>`).join('')}</div>`
      : `<div class="empty"><h3>אין חיפושים שמורים</h3><span>אחרי חיפוש, לחץ על הכוכב במסך המשרות כדי לשמור אותו.</span><button class="btn primary" data-go="search">לחיפוש</button></div>`;
  }
  if (accTab === 'saved') {
    const ids = Object.keys(U.saved).sort((a, b) => String(U.saved[b].saved_at).localeCompare(String(U.saved[a].saved_at)));
    body = ids.length ? `<div class="list">${ids.map(id => { const j = liveOrSnap(id, U.saved[id].job); const live = !!JOB[id]; return `<div class="app-card"><div class="top-row"><div style="min-width:0"><b dir="auto">${esc(j.title)}</b><div class="small muted">${esc(j.company)} · ${esc(loc(j))} · נשמרה ${fmtDate(U.saved[id].saved_at)}</div></div>${live ? '' : '<span class="pill stale">המשרה כבר לא מפורסמת</span>'}</div>
      <div class="row-actions">${live ? `<button class="btn sm" data-open="${id}">פרטים</button>` : ''}<a class="btn sm primary" href="${esc(j.url)}" target="_blank" rel="noopener">${ic('ext')}למשרה</a><span style="flex:1"></span><button class="btn sm ghost" data-unsave="${id}">הסר</button></div></div>`; }).join('')}</div>`
      : `<div class="empty"><h3>אין משרות שמורות</h3><span>פתח פרטי משרה ולחץ „שמור”.</span></div>`;
  }
  if (accTab === 'alerts') {
    const js = alertJobs();
    body = `<div class="card"><label class="toggle" for="alOn"><span>התראות על משרות חדשות</span><input type="checkbox" class="switch" id="alOn" ${U.profile.alerts_on ? 'checked' : ''}></label>
      ${U.profile.alerts_on ? `<div class="field"><label for="alFreq">תדירות</label><select class="select" id="alFreq">${['מיידית', 'יומית', 'שבועית'].map(f => `<option ${U.profile.alerts_freq === f ? 'selected' : ''}>${f}</option>`).join('')}</select><span class="hint">ההתראות מבוססות על החיפושים השמורים והתפקידים בפרופיל, ומציגות משרות מהשבוע האחרון.</span></div>` : ''}</div>
      ${U.profile.alerts_on ? (js.length ? `<div class="rhead"><h2>משרות חדשות בשבילך</h2>${js.some(j => !U.seen.includes(j.id)) ? `<button class="btn sm ghost" data-act="seenall">סמן הכל כנקרא</button>` : ''}</div><div class="list">${js.map(j => `<div class="app-card" data-open="${j.id}" style="cursor:pointer"><div class="top-row"><div style="min-width:0"><b dir="auto">${esc(j.title)}</b><div class="small muted">${esc(j.company)} · ${esc(loc(j))} · ${ago(j.posted)}</div></div>${U.seen.includes(j.id) ? '' : '<span class="pill new">חדש</span>'}</div></div>`).join('')}</div>`
      : `<div class="empty"><h3>אין עדיין משרות חדשות</h3><span>שמור חיפוש או הוסף תפקידים רצויים בפרופיל, ונציג כאן משרות חדשות שמתאימות.</span></div>`) : ''}`;
  }
  if (accTab === 'profile') {
    const p = U.profile; const c = completeness(p);
    const allSkills = [...new Set(JOBS.flatMap(j => j.skills))].sort();
    body = `<div class="card" style="gap:10px"><div style="display:flex;justify-content:space-between"><b>השלמת הפרופיל</b><span class="mono">${c}%</span></div><div class="meter"><i style="width:${c}%"></i></div><span class="small muted">פרופיל מלא משפר את ציון ההתאמה ואת ההתראות.</span></div>
    <div class="card"><h2>פרטים</h2><div class="field"><label for="pName">שם מלא</label><input class="input" id="pName" value="${esc(p.full_name || '')}"></div></div>
    <div class="card"><h2>קורות חיים</h2>
      <label class="drop" for="cv"><input type="file" id="cv" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document">${p.cv_name ? `<b style="color:var(--ink)">${esc(p.cv_name)}</b><br><span class="small">${p.cv_size_kb} KB · הועלה ${fmtDate(p.cv_uploaded_at)} · לחץ להחלפה</span>` : `<b style="color:var(--ink)">העלה קורות חיים</b><br><span class="small">PDF או DOCX, עד 10MB</span>`}</label>
      ${p.cv_path && CLOUD ? `<button class="btn sm" data-act="opencv" style="justify-self:start">${ic('ext')}פתח את הקובץ</button>` : ''}
      <span class="small muted">הקובץ נשמר בתיקייה פרטית שרק לך יש גישה אליה.</span></div>
    <div class="card"><h2>ניסיון ומיומנויות</h2>
      <div class="field"><label for="pExp">שנות ניסיון</label><input class="input mono" id="pExp" type="number" inputmode="numeric" min="0" max="50" value="${p.exp_years ?? ''}" placeholder="0"></div>
      <div class="field"><span class="fl">מיומנויות וטכנולוגיות</span><div class="chips">${p.skills.map(s => `<span class="chip tag">${esc(s)}<button data-rmskill="${esc(s)}" aria-label="הסר ${esc(s)}">×</button></span>`).join('') || '<span class="small muted">עוד לא הוספת מיומנויות</span>'}</div>
        <form id="skillForm" style="display:flex;gap:8px"><input class="input" id="pSkill" list="skillList" placeholder="למשל Python, Kubernetes" style="flex:1;min-width:0"><button class="btn" type="submit">הוסף</button></form>
        <datalist id="skillList">${allSkills.map(s => `<option value="${esc(s)}">`).join('')}</datalist></div></div>
    <div class="card"><h2>העדפות</h2>
      <div class="field"><span class="fl">תפקידים רצויים</span><div class="chips">${p.roles.filter(r => ROLE[r]).map(r => `<span class="chip tag">${esc(ROLE[r].he)}<button data-rmrole="${r}" aria-label="הסר">×</button></span>`).join('') || '<span class="small muted">עוד לא בחרת תפקידים</span>'}</div>
        <select class="select" id="pRoleAdd"><option value="">+ הוסף תפקיד</option>${GROUPS.map(([g, gn]) => `<optgroup label="${gn}">${ROLES.filter(r => r.g === g && !p.roles.includes(r.id)).map(r => `<option value="${r.id}">${esc(r.he)}</option>`).join('')}</optgroup>`).join('')}</select></div>
      <div class="two"><div class="field"><label for="pRegion">אזור מועדף</label><select class="select" id="pRegion">${REGIONS.map(([k, v]) => `<option value="${k}" ${p.region === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div class="field"><label for="pModel">מודל העסקה</label><select class="select" id="pModel">${MODELS.map(([k, v]) => `<option value="${k}" ${p.work_model === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div></div>
      <div class="field"><label for="pSal">שכר חודשי מבוקש (₪ ברוטו)</label><input class="input mono" id="pSal" inputmode="numeric" value="${p.salary_min ?? ''}" placeholder="למשל 20000"></div></div>
    <div class="card" style="gap:10px"><h2>למידה מהסימונים שלך</h2><span class="small muted">${fbCount() ? `ה־AI לומד מ־${Object.values(U.feedback).filter(v => v.value === 1).length} לייקים ו־${Object.values(U.feedback).filter(v => v.value === -1).length} דיסלייקים.` : 'עוד לא סימנת משרות.'}</span>${fbCount() ? `<button class="btn sm" data-act="resetfb" style="justify-self:start">איפוס הלמידה</button>` : ''}</div>`;
  }
  if (accTab === 'apps') {
    const all = Object.entries(U.apps).sort((a, b) => String(b[1].created_at).localeCompare(String(a[1].created_at)));
    const list = all.filter(([, a]) => appFilter === 'all' || a.status === appFilter);
    body = `<div class="hscroll"><button class="chip" data-appf="all" aria-pressed="${appFilter === 'all'}">הכל <span class="n">${all.length}</span></button>${STATUSES.map(s => `<button class="chip" data-appf="${s}" aria-pressed="${appFilter === s}">${s} <span class="n">${all.filter(([, a]) => a.status === s).length}</span></button>`).join('')}</div>
    ${list.length ? `<div class="list">${list.map(([id, a]) => { const j = liveOrSnap(id, a.job); return `<div class="app-card"><div class="top-row"><div style="min-width:0"><b dir="auto">${esc(j.title)}</b><div class="small muted">${esc(j.company)} · ${esc(loc(j))} · נוסף ${fmtDate(a.created_at)}</div></div><span class="st st-${a.status}">${a.status}</span></div>
      <div class="row-actions"><select class="select" data-appst="${id}" aria-label="סטטוס" style="min-height:40px;padding-block:6px;font-size:15px;flex:1">${STATUSES.map(s => `<option ${s === a.status ? 'selected' : ''}>${s}</option>`).join('')}</select>${JOB[id] ? `<button class="btn sm" data-open="${id}">פרטים</button>` : `<a class="btn sm" href="${esc(j.url)}" target="_blank" rel="noopener">למשרה</a>`}<button class="icon-btn" data-untrack="${id}" aria-label="הסר מהמעקב">${ic('x')}</button></div></div>`; }).join('')}</div>`
      : `<div class="empty"><h3>${all.length ? 'אין מועמדויות בסטטוס הזה' : 'אין מועמדויות במעקב'}</h3><span>אחרי שהגשת מועמדות באתר החברה, פתח את פרטי המשרה ולחץ „הוסף למעקב”.</span></div>`}`;
  }
  return `<main class="wrap">${subHead(title)}${body}</main>`;
}

/* ================= render ================= */
function render() {
  renderChrome();
  if (screen === 'loading') return;
  const v = { welcome: vWelcome, auth: vAuth, newpw: vNewPw, search: vSearch, results: () => vResults(false), account: vAccount }[screen] || vSearch;
  $('#view').innerHTML = v();
  if (screen === 'search') initCombo();
}
function refreshList() { const l = $('#list'); if (l) l.innerHTML = listHTML(sorted()); }

/* ================= combobox ================= */
let active = -1, opts = [];
function initCombo() {
  const inp = $('#roleInput'), lb = $('#roleList'), btn = $('#comboBtn');
  const open = () => { fill(); lb.hidden = false; inp.setAttribute('aria-expanded', 'true'); };
  const close = () => { lb.hidden = true; inp.setAttribute('aria-expanded', 'false'); inp.removeAttribute('aria-activedescendant'); active = -1; };
  const hl = (s, q) => { if (!q) return esc(s); const i = norm(s).indexOf(norm(q)); return i < 0 ? esc(s) : esc(s.slice(0, i)) + '<mark>' + esc(s.slice(i, i + q.length)) + '</mark>' + esc(s.slice(i + q.length)); };
  function fill() {
    const q = Q.role ? '' : inp.value.trim();
    opts = roleMatches(q).slice().sort((a, b) => GROUPS.findIndex(g => g[0] === a.g) - GROUPS.findIndex(g => g[0] === b.g));
    let html = '', g = '';
    opts.forEach((r, i) => {
      if (r.g !== g) { g = r.g; html += `<li class="grp" role="presentation">${GROUP_NAME[g]}</li>`; }
      const en = q ? (r.en.find(e => norm(e).includes(norm(q))) || r.en[0]) : r.en[0];
      html += `<li role="option" id="opt${i}" data-i="${i}" aria-selected="${i === active}"><span class="main">${hl(r.he, q)}<span class="cnt">${ROLE_COUNT[r.id] || 0}</span></span><span class="en">${hl(en, q)}</span></li>`;
    });
    if (q) html += `<li role="option" id="optfree" data-i="free" aria-selected="${active === opts.length}"><span class="free">חפש „${esc(q)}” בכל המשרות</span></li>`;
    lb.innerHTML = html;
  }
  function pick(i) {
    if (i === 'free' || i === opts.length) { Q.role = null; Q.text = inp.value.trim(); }
    else { const r = opts[i]; Q.role = r.id; Q.text = ''; inp.value = r.he; }
    close(); updSyn();
  }
  function updSyn() { $('#syn').innerHTML = synText(); btn.innerHTML = ic(Q.role || Q.text ? 'x' : 'down'); btn.setAttribute('aria-label', Q.role || Q.text ? 'נקה' : 'הצג את כל התפקידים'); }
  function setAD() { const el = lb.querySelector('[aria-selected="true"]'); if (el) { inp.setAttribute('aria-activedescendant', el.id); el.scrollIntoView({ block: 'nearest' }); } }
  inp.addEventListener('focus', () => { if (!Q.role) open(); });
  inp.addEventListener('click', () => { if (lb.hidden) open(); });
  inp.addEventListener('input', () => { Q.role = null; Q.text = inp.value.trim(); active = -1; open(); updSyn(); });
  inp.addEventListener('keydown', e => {
    const max = opts.length + (inp.value.trim() && !Q.role ? 1 : 0);
    if (e.key === 'ArrowDown') { e.preventDefault(); if (lb.hidden) open(); active = Math.min(active + 1, max - 1); fill(); setAD(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); fill(); setAD(); }
    else if (e.key === 'Enter') { if (!lb.hidden && active >= 0) { e.preventDefault(); pick(active === opts.length ? 'free' : active); } else close(); }
    else if (e.key === 'Escape') close();
  });
  lb.addEventListener('mousedown', e => e.preventDefault());
  lb.addEventListener('click', e => { const o = e.target.closest('[role="option"]'); if (o) pick(o.dataset.i === 'free' ? 'free' : +o.dataset.i); });
  inp.addEventListener('blur', () => setTimeout(close, 150));
  btn.addEventListener('mousedown', e => e.preventDefault());
  btn.addEventListener('click', () => { if (Q.role || Q.text) { Q.role = null; Q.text = ''; inp.value = ''; updSyn(); } open(); inp.focus(); });
  $('#searchForm').addEventListener('submit', e => { e.preventDefault(); if (!Q.role) Q.text = inp.value.trim(); close(); Q.region = $('#regionSel').value; Q.model = $('#modelSel').value; doSearch(); });
}
function doSearch() {
  runSearch(Q); sort = 'match'; go('results');
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) { $('#view').innerHTML = vResults(true); setTimeout(() => { if (screen === 'results') $('#view').innerHTML = vResults(false); }, 300); }
}

/* ================= sheet ================= */
let pushedSheet = false;
function openSheet(html, short) {
  const s = $('#sheet'); const wasOpen = s.classList.contains('open');
  s.innerHTML = `<div class="grab"></div>` + html; s.classList.toggle('short', !!short);
  s.classList.add('open'); $('#scrim').classList.add('open'); document.body.style.overflow = 'hidden';
  if (!wasOpen && !pushedSheet) { try { history.pushState({ sheet: 1, s: screen, acc: accTab }, ''); pushedSheet = true; } catch (e) {} }
}
function closeSheet(fromPop) {
  if (!fromPop && pushedSheet) { history.back(); return; }
  pushedSheet = false; $('#sheet').classList.remove('open'); $('#scrim').classList.remove('open'); document.body.style.overflow = '';
}
function closeSheetQuiet() { pushedSheet = false; $('#sheet').classList.remove('open'); $('#scrim').classList.remove('open'); document.body.style.overflow = ''; }
function openJob(id) {
  const base = JOB[id]; if (!base) return;
  const q = lastQ || { role: null, text: '', region: 'all', model: 'any' }; const j = { ...base, ...score(base, q, weights()) };
  const saved = me && U.saved[id]; const app = me && U.apps[id];
  if (me && screen === 'account' && accTab === 'alerts') W.seen([id]);
  const hasProf = me && U.profile.skills.length;
  openSheet(`<div class="sheet-head"><div class="ring" style="--p:${j.score};--c:${ringC(j.score)}"><div><span><b>${j.score}</b><small>התאמה</small></span></div></div>
    <div style="flex:1;min-width:0"><h2 id="dTitle" dir="auto" style="text-align:right">${esc(j.title)}</h2><div class="job-co">${esc(j.company)} · ${esc(loc(j))}</div><div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap"><span class="pill verified">פעילה בלוח הדרושים</span>${app ? `<span class="st st-${app.status}">${app.status}</span>` : ''}</div></div>
    <button class="icon-btn" data-close aria-label="סגור">${ic('x')}</button></div>
  <div class="sheet-body">
    <dl class="kv"><div><dt>מודל העסקה</dt><dd>${MODEL_NAME[j.model]}</dd></div><div><dt>שכר</dt><dd>${salaryText(j.salary) ? `<span dir="ltr">${esc(salaryText(j.salary))}</span>` : 'לא צוין'}</dd></div><div><dt>פורסם</dt><dd>${j.posted ? `${ago(j.posted)} (${fmtDate(j.posted)})` : 'לא ידוע'}</dd></div><div><dt>רמת תפקיד</dt><dd>${esc(j.seniority)}</dd></div><div><dt>היקף משרה</dt><dd>${esc(j.employment || 'מלאה')}</dd></div><div><dt>מחלקה</dt><dd>${esc(j.dept || '—')}</dd></div></dl>
    <div><h3>תחום</h3><div class="tagline" style="margin-top:6px">${j.roles.map(r => `<span class="chip">${esc(ROLE[r]?.he || r)}</span>`).join('')}</div></div>
    <div><h3>תיאור המשרה</h3>${j.desc ? `<p class="desc" dir="auto">${esc(j.desc)}</p><p class="disc">תקציר מתוך המודעה. התיאור המלא נמצא באתר החברה.</p>` : `<p class="muted" style="margin:6px 0 0">התיאור המלא נמצא במודעה באתר החברה.</p>`}</div>
    <div><h3>למה המשרה מתאימה</h3><ul class="reasons">${j.reasons.map(r => { const ok = r[2] === null ? (r[1] >= 0) : r[1] >= r[2] * .5; return `<li><span class="${r[2] === null ? 'mid' : ok ? 'ok' : 'no'}">${r[2] === null ? '✦' : ok ? '✓' : '✕'}</span><span>${esc(r[0])}</span><span class="pts">${r[2] === null ? (r[1] > 0 ? '+' : '') + r[1] : r[1] + '/' + r[2]}</span></li>`; }).join('')}</ul><p class="disc">ציון ההתאמה הוא הערכה בלבד ואינו מבטיח התאמה או קבלה לעבודה.</p></div>
    ${j.skills.length ? `<div class="gap"><h3>${hasProf ? 'כישורים: יש לך מול חסר' : 'כישורים שמוזכרים במודעה'}</h3><div class="chips" style="margin-top:8px">${hasProf ? j.have.map(s => `<span class="chip have">✓ ${esc(s)}</span>`).join('') + j.miss.map(s => `<span class="chip miss">${esc(s)}</span>`).join('') : j.skills.map(s => `<span class="chip">${esc(s)}</span>`).join('')}</div></div>` : ''}
    <div><h3>מקור</h3><p style="margin:4px 0 0;color:var(--muted);font-size:14px">לוח הדרושים של ${esc(j.company)} (${esc(j.source)})${j.alsoAt ? ` · פורסמה גם ב־${j.alsoAt.length} מקומות נוספים` : ''}</p></div>
  </div>
  <div class="sheet-foot"><a class="btn primary full" href="${esc(j.url)}" target="_blank" rel="noopener" data-link="${j.id}">${ic('ext')}מעבר למודעה והגשת מועמדות</a>
    <button class="btn" data-savejob="${j.id}" style="${saved ? 'color:var(--accent);border-color:var(--accent)' : ''}">${ic('bookmark', saved)}${saved ? 'שמורה' : 'שמור'}</button>
    <button class="btn" data-track="${j.id}" style="${app ? 'color:var(--good);border-color:var(--good)' : ''}">${ic('board')}${app ? 'במעקב' : 'הוסף למעקב'}</button></div>`);
  $('#sheet .sheet-body').scrollTop = 0;
}
function needAccount(what) {
  openSheet(`<div class="sheet-head"><div style="flex:1"><h2 id="dTitle">${what} דורש חשבון</h2><p class="muted" style="margin:6px 0 0">עם חשבון אישי תוכל לשמור חיפושים ומשרות, לקבל התראות חכמות ולעקוב אחרי מועמדויות.</p></div><button class="icon-btn" data-close aria-label="סגור">${ic('x')}</button></div>
  <div class="sheet-body"><button class="btn primary big" data-act="toauth" data-mode="signup">הרשמה</button><button class="btn" data-act="toauth" data-mode="login">כבר יש לי חשבון</button></div>`, true);
}
$('#scrim').addEventListener('click', () => closeSheet());
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#sheet').classList.contains('open')) closeSheet(); if (e.key === 'Enter' && e.target.matches('.job[data-open]')) openJob(e.target.dataset.open); });
let sy = null;
$('#sheet').addEventListener('touchstart', e => { sy = e.target.closest('.sheet-head,.grab') ? e.touches[0].clientY : null; }, { passive: true });
$('#sheet').addEventListener('touchend', e => { if (sy !== null && e.changedTouches[0].clientY - sy > 70) closeSheet(); sy = null; }, { passive: true });

/* ================= session ================= */
async function enter(user) {
  me = user; guest = false;
  try { U = await Auth.load(); } catch (e) { toast('טעינת החשבון נכשלה: ' + heError(e)); U = blankUserData(); }
  // carry over likes made as a guest
  const g = LS.get('guest', null);
  if (g && g.feedback) { for (const [id, f] of Object.entries(g.feedback)) if (!U.feedback[id] && JOB[id]) W.feedback(JOB[id], f.value); LS.del('guest'); }
  if (!CLOUD) await Local.persist();
}
function enterGuest() { me = null; guest = true; U = LS.get('guest', null) || blankUserData(); const q = LS.get('guestQ', null); if (q) { Q = { ...q }; } }
async function afterAuth(user, msg) { closeSheetQuiet(); await enter(user); toast(msg || `שלום ${U.profile.full_name || me.name}`); go(lastQ ? 'results' : 'search', { replace: true }); }

async function submitAuth(e) {
  e.preventDefault(); const err = $('#aErr'); err.textContent = '';
  const email = $('#aEmail').value.trim().toLowerCase(); const su = authMode === 'signup', rs = authMode === 'reset';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { err.textContent = 'כתובת האימייל לא תקינה. בדוק שיש בה @ ונקודה.'; $('#aEmail').focus(); return; }
  const btn = $('#aSubmit'); btn.disabled = true;
  try {
    if (rs) { await Cloud.reset(email); err.style.color = 'var(--good)'; err.textContent = 'שלחנו אליך מייל עם קישור לאיפוס הסיסמה.'; return; }
    const pass = $('#aPass').value; const name = su ? $('#aName').value.trim() : '';
    if (su && !name) { err.textContent = 'כתוב את שמך.'; $('#aName').focus(); return; }
    if (pass.length < 8) { err.textContent = 'הסיסמה צריכה להכיל לפחות 8 תווים.'; $('#aPass').focus(); return; }
    if (su) {
      const r = await Auth.signUp(name, email, pass);
      if (r.needsConfirm) { err.style.color = 'var(--good)'; err.textContent = 'כמעט סיימנו: שלחנו אליך מייל לאישור. לחץ על הקישור במייל ותחזור לכאן מחובר.'; return; }
      await afterAuth(r.user, `ברוך הבא ${name}, החשבון נוצר`);
    } else { const u = await Auth.signIn(email, pass); await afterAuth(u); }
  } catch (x) { err.style.color = ''; err.textContent = x.message; }
  finally { if (btn.isConnected) btn.disabled = false; }
}

/* ================= events ================= */
document.addEventListener('click', async e => {
  const t = e.target.closest('button,a,[data-open]'); if (!t || t.disabled) return; const d = t.dataset;
  if (d.close !== undefined) { closeSheet(); return; }
  if (d.link) { return; } // real link, opens in a new tab
  if (d.fb) {
    e.stopPropagation(); const id = d.fb, v = +d.v; const j = JOB[id]; if (!j) return;
    const prev = fbOf(id); const nv = (v === 0 || prev === v) ? 0 : v;
    W.feedback(j, nv);
    const Wt = weights(); results = results.map(x => ({ ...x, ...score(x, lastQ, Wt) }));
    refreshList();
    const n = fbCount(); const le = $('#learn'); if (le) le.outerHTML = n ? `<span class="learn" id="learn">${ic('spark')}התוצאות מותאמות לפי ${n} סימונים שלך</span>` : `<span class="small muted" id="learn">סמן לייק או דיסלייק כדי שה־AI ילמד מה מתאים לך</span>`;
    const b = document.querySelector(`.fb[data-fb="${id}"][data-v="${v}"]`); if (b) b.classList.add('fb-pop');
    if (nv === 1) toast('מעולה. נציג יותר משרות בכיוון הזה'); else if (nv === -1) toast('הבנתי. משרות כאלה ירדו בדירוג');
    return;
  }
  if (d.open) { openJob(d.open); return; }
  if (d.go) { if (t.closest('#sheet')) closeSheetQuiet(); if (d.go === 'results' && !lastQ) return; go(d.go, { acc: d.acc || null }); return; }
  if (d.savejob) { if (!me) { needAccount('שמירת משרה'); return; } const j = JOB[d.savejob]; if (U.saved[j.id]) { W.unsave(j.id); toast('הוסרה מהמשרות השמורות'); } else { W.save(j); toast('נשמרה במשרות השמורות'); } openJob(j.id); renderChrome(); return; }
  if (d.track) { if (!me) { needAccount('מעקב מועמדויות'); return; } const j = JOB[d.track]; if (!U.apps[j.id]) { W.app(j, 'נשלח'); toast('נוספה למעקב בסטטוס „נשלח”'); } else toast('המשרה כבר במעקב. אפשר לעדכן סטטוס בחשבון'); openJob(j.id); return; }
  if (d.unsave) { W.unsave(d.unsave); render(); return; }
  if (d.untrack) { W.unapp(d.untrack); render(); return; }
  if (d.runsearch) { const s = U.searches.find(x => String(x.id) === d.runsearch); if (s) { Q = { role: s.role, text: s.text || '', region: s.region, model: s.model }; doSearch(); } return; }
  if (d.delsearch) { W.delSearch(U.searches.find(x => String(x.id) === d.delsearch)?.id); render(); return; }
  if (d.rmskill) { W.profile({ skills: U.profile.skills.filter(s => s !== d.rmskill) }); render(); return; }
  if (d.rmrole) { W.profile({ roles: U.profile.roles.filter(r => r !== d.rmrole) }); render(); return; }
  if (d.appf) { appFilter = d.appf; render(); return; }
  switch (d.act) {
    case 'terms': { const b = $('#termsBody'); b.classList.toggle('open'); const o = b.classList.contains('open'); t.setAttribute('aria-expanded', o); t.textContent = o ? 'הסתר' : 'קרא את התנאים'; break; }
    case 'guest': enterGuest(); go('search', { replace: true }); break;
    case 'toauth': authMode = d.mode || 'signup'; if ($('#sheet').classList.contains('open')) closeSheetQuiet(); go('auth'); break;
    case 'mode': authMode = d.mode; render(); break;
    case 'back': history.back(); break;
    case 'more': shown += PAGE; refreshList(); break;
    case 'pw': { const i = $('#aPass'); i.type = i.type === 'password' ? 'text' : 'password'; t.setAttribute('aria-label', i.type === 'password' ? 'הצג סיסמה' : 'הסתר סיסמה'); break; }
    case 'google': try { await Cloud.google(); } catch (x) { $('#aErr').textContent = x.message; } break;
    case 'savesearch': {
      if (!me) { needAccount('שמירת חיפוש'); return; }
      const ex = U.searches.find(s => s.role === lastQ.role && (s.text || '') === (lastQ.text || '') && s.region === lastQ.region && s.model === lastQ.model);
      if (ex) { await W.delSearch(ex.id); toast('החיפוש הוסר מהחיפושים שלי'); }
      else { await W.addSearch({ name: `${qLabel(lastQ)} · ${REGION_NAME[lastQ.region]}`, ...lastQ }); toast('החיפוש נשמר. נציג לך משרות חדשות בהתראות'); }
      $('#view').innerHTML = vResults(false); break;
    }
    case 'logout': if (me) await Auth.signOut(); me = null; guest = false; U = null; lastQ = null; Q = { role: null, text: '', region: 'all', model: 'any' }; go('welcome', { replace: true }); break;
    case 'askdelete': delConfirm = true; render(); break;
    case 'nodelete': delConfirm = false; render(); break;
    case 'delete': try { await Auth.deleteAccount(); me = null; U = null; lastQ = null; toast('החשבון וכל הנתונים נמחקו'); go('welcome', { replace: true }); } catch (x) { toast('המחיקה נכשלה: ' + x.message); } break;
    case 'seenall': W.seen(alertJobs().map(j => j.id)); render(); break;
    case 'resetfb': for (const id of Object.keys(U.feedback)) W.feedback({ id }, 0); render(); toast('הלמידה אופסה'); break;
    case 'opencv': { const { data, error } = await SB.storage.from('cvs').createSignedUrl(U.profile.cv_path, 120); if (error) toast('לא ניתן לפתוח את הקובץ: ' + heError(error)); else window.open(data.signedUrl, '_blank', 'noopener'); break; }
  }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'agree') { termsOk = t.checked; LS.set('terms', termsOk); const y = window.scrollY; render(); window.scrollTo(0, y); return; }
  if (t.id === 'sort') { sort = t.value; shown = PAGE; refreshList(); return; }
  if (t.id === 'regionSel') { Q.region = t.value; return; }
  if (t.id === 'modelSel') { Q.model = t.value; return; }
  if (!me) return;
  if (t.id === 'alOn') { W.profile({ alerts_on: t.checked }); render(); }
  if (t.id === 'alFreq') { W.profile({ alerts_freq: t.value }); toast(`תדירות ההתראות: ${t.value}`); }
  if (t.id === 'pName') { W.profile({ full_name: t.value.trim() }); renderChrome(); }
  if (t.id === 'pExp') W.profile({ exp_years: t.value === '' ? null : Math.max(0, Math.min(60, +t.value)) });
  if (t.id === 'pRegion') { W.profile({ region: t.value }); render(); }
  if (t.id === 'pModel') { W.profile({ work_model: t.value }); render(); }
  if (t.id === 'pSal') W.profile({ salary_min: t.value.replace(/\D/g, '') ? +t.value.replace(/\D/g, '') : null });
  if (t.id === 'pRoleAdd' && t.value) { W.profile({ roles: [...U.profile.roles, t.value] }); render(); }
  if (t.dataset.appst) { const j = JOB[t.dataset.appst] || U.apps[t.dataset.appst].job; W.app(j, t.value); render(); toast(`הסטטוס עודכן ל„${t.value}”`); }
  if (t.id === 'cv' && t.files[0]) {
    const f = t.files[0];
    if (!/\.(pdf|docx)$/i.test(f.name)) { toast('אפשר להעלות רק קובץ PDF או DOCX'); return; }
    if (f.size > 10 * 1024 * 1024) { toast('הקובץ גדול מ־10MB'); return; }
    toast('מעלה…'); W.cv(f).then(() => { render(); toast('קורות החיים הועלו'); });
  }
});
document.addEventListener('submit', async e => {
  if (e.target.id === 'authForm') { submitAuth(e); return; }
  if (e.target.id === 'newPwForm') {
    e.preventDefault(); const pw = $('#np').value; if (pw.length < 8) { $('#npErr').textContent = 'לפחות 8 תווים.'; return; }
    try { await Cloud.newPassword(pw); toast('הסיסמה עודכנה'); recoveryMode = false; go('search', { replace: true }); } catch (x) { $('#npErr').textContent = x.message; }
    return;
  }
  if (e.target.id === 'skillForm') { e.preventDefault(); const v = $('#pSkill').value.trim(); if (v && !U.profile.skills.includes(v)) { W.profile({ skills: [...U.profile.skills, v] }); render(); setTimeout(() => $('#pSkill')?.focus(), 0); } }
});

/* ================= boot ================= */
(async function boot() {
  if (CLOUD) {
    SB.auth.onAuthStateChange(async (ev, session) => {
      if (ev === 'PASSWORD_RECOVERY') { recoveryMode = true; me = Cloud.toUser(session?.user); go('newpw', { replace: true }); return; }
      if (ev === 'SIGNED_IN' && session?.user && (!me || me.id !== session.user.id) && screen !== 'loading') { await afterAuth(Cloud.toUser(session.user)); }
    });
  }
  let user = null;
  try { user = await Auth.session(); } catch (e) {}
  if (recoveryMode) return;
  if (user) { await enter(user); screen = 'search'; }
  else if (LS.get('wasGuest', false) && termsOk) { enterGuest(); screen = 'search'; }
  else screen = 'welcome';
  try { history.replaceState({ s: screen }, ''); } catch (e) {}
  render();
})();
// remember guest mode between visits
window.addEventListener('pagehide', () => LS.set('wasGuest', !!guest));
})();
