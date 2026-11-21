// One coach turn with network capture: prints model, HTTP status, error reason, and the reply head. Token redacted by cdp.mjs.
// Usage: BASE=http://127.0.0.1:5190/ node scripts/coach-net.mjs 9471 [turns=1]
import { connect } from './cdp.mjs';
const turns = Number(process.argv[3] ?? 1);
const p = await connect(Number(process.argv[2] ?? 9471), 'http://');
await p.send('Network.enable');
await p.send('Storage.clearDataForOrigin', { origin: new URL(process.env.BASE ?? 'http://127.0.0.1:5190/').origin, storageTypes: 'all' });
await p.goto(process.env.BASE ?? 'http://127.0.0.1:5190/');
await p.waitFor(`document.querySelector('[data-act="add"]')`, 15000);
p.events.length = 0;
await p.type('#f-body', 'Hello, Glowmint Labs here. We would pay $700 for 1 Reel, usage 60 days organic only, no exclusivity, payment net 15.');
await p.click('[data-act="add"]');
await p.click('[data-act="triage"]');
await p.waitFor(`document.querySelectorAll('.card').length === 1`, 60000);
await p.click('.card');
await p.sleep(300);
await p.click('#tab-coach');
const t0 = Date.now();
await p.click('[data-act="coach-start"]');
const turnDone = (n) => `document.querySelector('.drawer .err') || (document.querySelectorAll('.bubble.coach').length >= ${n} && !document.querySelector('.spin'))`;
await p.waitFor(turnDone(1), 70000).catch(() => console.log('TURN1 timeout 70s'));
console.log('TURN1', Date.now() - t0, 'ms');
if (turns > 1) {
  await p.sleep(500);
  const e1 = await p.eval(`!!document.querySelector('.drawer .err')`);
  if (!e1) {
    await p.click('[data-act="coach-quick"]');
    await p.waitFor(`document.querySelector('.drawer .err') || document.querySelectorAll('.bubble.coach').length >= 2 && !document.querySelector('.spin')`, 70000).catch(() => console.log('TURN2 timeout 70s'));
  }
}
await p.sleep(800);
const resp = new Map();
for (const e of p.events) {
  if (e.method === 'Network.responseReceived' && /googleapis|firebase/.test(e.params.response.url)) resp.set(e.params.requestId, e.params.response);
}
for (const [id, r] of resp) {
  if (!/generateContent|streamGenerate/.test(r.url)) continue;
  let body = '';
  try { body = (await p.send('Network.getResponseBody', { requestId: id })).body; } catch { body = '(no body)'; }
  console.log('NET', r.status, r.url.replace(/projects\/[^/]+/, 'projects/<p>').replace(/key=[^&]+/, 'key=<k>'), '|', body.replace(/\s+/g, ' ').slice(0, 260));
}
console.log('UI', JSON.stringify(await p.eval(`({ err: document.querySelector('.drawer .err')?.textContent ?? null, sources: [...document.querySelectorAll('.bubble.coach')].map(b => b.dataset.source), bubbles: [...document.querySelectorAll('.bubble')].map(b => b.innerText.replace(/\\s+/g,' ').slice(0, 200)), shared: document.querySelector('.drawer')?.innerText.split('Shared with cloud')[1]?.slice(0,150) })`)));
p.close();
