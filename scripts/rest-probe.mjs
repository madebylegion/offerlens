// One REST generateContent call with a debug-token App Check token and a 60 s client timeout. Prints status + error reason + reply head only.
// Usage: node scripts/rest-probe.mjs <model> [firebase.local.json] [appcheck-debug-token]
import { readFileSync } from 'node:fs';
const [model, cfgPath = '../firebase.local.json', tokPath = '../appcheck-debug-token'] = process.argv.slice(2);
const c = JSON.parse(readFileSync(cfgPath, 'utf8'));
const debugToken = readFileSync(tokPath, 'utf8').trim();
const H = { 'content-type': 'application/json', 'x-goog-api-key': c.apiKey, referer: 'http://127.0.0.1:5190/', origin: 'http://127.0.0.1:5190' };
const sig = () => AbortSignal.timeout(60000);
const short = (t) => t.replace(c.apiKey, '<k>').replace(debugToken, '[REDACTED]').replace(/\s+/g, ' ').slice(0, 300);
const ex = await fetch(`https://firebaseappcheck.googleapis.com/v1/projects/${c.projectId}/apps/${c.appId}:exchangeDebugToken`, { method: 'POST', headers: H, body: JSON.stringify({ debugToken }), signal: sig() });
const exj = await ex.json().catch(() => ({}));
console.log('EXCHANGE', ex.status, exj.token ? 'token ok' : short(JSON.stringify(exj)));
if (!exj.token) process.exit(1);
const t0 = Date.now();
try {
  const r = await fetch(`https://firebasevertexai.googleapis.com/v1beta/projects/${c.projectId}/models/${model}:generateContent`, {
    method: 'POST',
    headers: { ...H, 'x-firebase-appcheck': exj.token },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Reply with one short friendly sentence.' }] }], generationConfig: { maxOutputTokens: 60 } }),
    signal: sig(),
  });
  console.log('GENERATE', model, r.status, Date.now() - t0, 'ms', short(await r.text()));
} catch (e) {
  console.log('GENERATE', model, 'CLIENT ERROR', e.name, Date.now() - t0, 'ms');
}
process.exit(0);
