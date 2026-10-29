// Extracts contact details that a company itself published: in the job ad text,
// or on the company's own careers / contact page. Nothing is taken from LinkedIn or other third parties.
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Israeli phone numbers: mobile 05X, landlines 02/03/04/08/09, 07X, with or without +972
const PHONE = /(?:\+972[\s-]?|\b0)(?:5\d|7\d|[2-489])[\s-]?\d{3}[\s-]?\d{4}\b/g;
const SKIP_EMAIL = /askhr|hrhelp|helpdesk|payroll|noreply|no-reply|donotreply|privacy|gdpr|dpo@|dataprotection|legal@|accommodat|accessibility|security@|abuse@|support@|example\.|@(greenhouse|lever|ashbyhq|comeet|workable|smartrecruiters|myworkday)/i;
const PRIVACY_CTX = /privacy|personal data|data protection|gdpr|ccpa|accommodat|disabilit|equal (employment )?opportunit|fraud|scam|phishing|benefits|מדיניות פרטיות|הגנת הפרטיות|התאמות/i;
const NAME_PREFIX_EN = /(recruiter|talent partner|talent acquisition partner|hiring manager|contact person|point of contact|for (?:more )?(?:info(?:rmation)?|questions),? (?:please )?(?:contact|reach out to))/gi;
const NAME_EN = /^\s*(?:is|:|-|–)?\s*([A-Z][a-z]+(?:\s[A-Z][a-z']+){1,2})/;
const NAME_HE = /(?:איש קשר|אשת קשר|המגייס(?:ת)?|לפרטים(?: נוספים)?(?: ניתן לפנות)?(?: אל| ל)?)\s*[:\-–]?\s*([א-ת]{2,}(?:\s[א-ת]{2,}){1,2})/;
const NAME_STOP = /^(the|our|us|team|we|please|hr|talent|recruiting|ניתן|אנא|צוות|משאבי)/i;

function contextOk(text, idx) {
  const around = text.slice(Math.max(0, idx - 300), idx + 12);
  return !PRIVACY_CTX.test(around);
}
function extractFromAd(text) {
  if (!text) return null;
  const out = {};
  for (const m of text.matchAll(EMAIL)) {
    if (SKIP_EMAIL.test(m[0]) || !contextOk(text, m.index)) continue;
    out.email = m[0].replace(/[.,;]+$/, ''); break;
  }
  for (const m of text.matchAll(PHONE)) {
    if (!contextOk(text, m.index)) continue;
    const ctx = text.slice(Math.max(0, m.index - 40), m.index);
    if (/fax|פקס|id|req|#/i.test(ctx)) continue;
    out.phone = m[0].replace(/\s+/g, ' ').trim(); break;
  }
  for (const p of text.matchAll(NAME_PREFIX_EN)) {
    const m = text.slice(p.index + p[0].length, p.index + p[0].length + 50).match(NAME_EN);
    if (m && !NAME_STOP.test(m[1])) { out.name = m[1].trim(); break; }
  }
  if (!out.name) { const m = text.match(NAME_HE); if (m && !NAME_STOP.test(m[1])) out.name = m[1].trim(); }
  return Object.keys(out).length ? { ...out, from: 'ad' } : null;
}

// Careers e-mail on the company's own site (jobs@, careers@, hr@, cv@ ...)
const CAREERS_EMAIL = /^(jobs?|careers?|career|hr|recruit(ing|ment)?|talent|cv|hiring|join|work)[._-]?[a-z]*@/i;
function extractCareersEmail(html) {
  for (const m of String(html || '').matchAll(EMAIL)) {
    const e = m[0].replace(/[.,;]+$/, '');
    if (CAREERS_EMAIL.test(e) && !SKIP_EMAIL.test(e)) return e.toLowerCase();
  }
  return null;
}
module.exports = { extractFromAd, extractCareersEmail };
