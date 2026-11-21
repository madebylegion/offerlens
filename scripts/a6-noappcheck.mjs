// A6: the same generateContent call WITHOUT an App Check token must be rejected. Usage: node scripts/a6-noappcheck.mjs [firebase.local.json]
import { readFileSync } from 'node:fs';
const c = JSON.parse(readFileSync(process.argv[2] ?? '../firebase.local.json', 'utf8'));
const r = await fetch(`https://firebasevertexai.googleapis.com/v1beta/projects/${c.projectId}/models/gemini-3.5-flash-lite:generateContent`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-goog-api-key': c.apiKey, referer: 'http://127.0.0.1:5190/' },
  body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Hi' }] }] }),
  signal: AbortSignal.timeout(60000),
});
const t = (await r.text()).replace(c.apiKey, '<k>').replace(/\s+/g, ' ').slice(0, 200);
console.log('A6', r.status, t, r.status >= 400 && /App Check/i.test(t) ? 'PASS' : 'FAIL');
process.exit(r.status >= 400 && /App Check/i.test(t) ? 0 : 1);
