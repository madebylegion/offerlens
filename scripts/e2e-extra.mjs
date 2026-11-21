// A4 (offline), A5 (no Prompt API, masked cloud fallback) and the coach error path.
// Usage: node scripts/e2e-extra.mjs <debugPort> [shotsDir]
import { mkdirSync, writeFileSync } from 'node:fs';
import { connect } from './cdp.mjs';

const port = Number(process.argv[2] ?? 9471);
const shots = process.argv[3] ?? 'shots';
mkdirSync(shots, { recursive: true });
const URL0 = process.env.BASE ?? 'http://127.0.0.1:4173/';
const p = await connect(port, new URL(URL0).origin);
const log = [];
const ok = (name, cond, extra = '') => {
  extra = String(extra).replace(/projects\/[^/\s"]+/g, 'projects/<project>');
  log.push({ name, pass: !!cond, extra });
  console.log(cond ? 'PASS' : 'FAIL', name, extra);
};
await p.send('Network.enable');
for (const o of [new URL(URL0).origin]) await p.send('Storage.clearDataForOrigin', { origin: o, storageTypes: 'all' });

// ---------------------------------------------------------------- A4: offline
await p.goto(URL0);
await p.waitFor(`document.querySelector('.pill.ok')?.textContent.includes('Nano ready')`, 20000);
await p.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
await p.sleep(500);
ok('offline indicator shown', await p.eval(`!!document.querySelector('.pill.off')?.textContent.includes('Offline')`));
await p.type('#f-from', '@demo_offlinetest');
await p.type('#f-body', 'Hello, Glowmint Labs here. We would pay $700 for 1 Reel, usage 60 days organic only, no exclusivity, payment net 15. Contact @demo_glow or glow@example.com.');
await p.click('[data-act="add"]');
await p.click('[data-act="triage"]');
await p.waitFor(`document.querySelectorAll('.card').length === 1`, 60000);
const off = await p.eval(`({ route: document.querySelector('.card').dataset.route, col: document.querySelector('.card').dataset.col, counter: document.getElementById('counter').textContent.replace(/\\s+/g, ' ').trim() })`);
ok('offline triage completes ON_DEVICE', off.route === 'ON_DEVICE', JSON.stringify(off));
await p.sleep(400);
await p.shot(`${shots}/05-offline-board.png`);
await p.click('.card');
await p.click('#tab-coach');
await p.sleep(300);
const coachOff = await p.eval(`({ btn: document.querySelector('[data-act="coach-start"]')?.disabled, msg: document.querySelector('.drawer .err')?.textContent })`);
ok('coach disabled offline with "needs a connection"', coachOff.btn === true && /needs a connection/i.test(coachOff.msg ?? ''), JSON.stringify(coachOff));
await p.shot(`${shots}/06-offline-coach-disabled.png`);
await p.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

// ---------------------------------------------------------------- A5: no Prompt API
const reqs = [];
const seenIds = new Set();
const grab = () => {
  for (const e of p.events) {
    if (e.method === 'Network.requestWillBeSent' && !seenIds.has(e.params.requestId)) {
      seenIds.add(e.params.requestId);
      const u = e.params.request.url;
      if (/googleapis\.com|firebase/.test(u) && e.params.request.method === 'POST') reqs.push({ url: u.replace(/key=[^&]+/, 'key=…'), body: e.params.request.postData ?? '' });
    }
  }
};
const inject = await p.send('Page.addScriptToEvaluateOnNewDocument', { source: `Object.defineProperty(window, 'LanguageModel', { value: undefined, configurable: true });` });
await p.goto(URL0);
await p.waitFor(`document.querySelector('.banner.warn')?.textContent.includes('On-device AI is not available')`, 20000);
ok('no-Nano banner shown', true);
p.events.length = 0;
seenIds.clear();
await p.click('[data-act="demo"]');
await p.click('[data-act="triage"]');
await p.waitFor(`document.querySelectorAll('.card').length === 12`, 180000, 500);
await p.sleep(500);
grab();
const routes = await p.eval(`[...document.querySelectorAll('.card')].map((c) => c.dataset.route)`);
const issues = await p.eval(`document.querySelector('.banner.warn')?.textContent ?? ''`);
await p.shot(`${shots}/07-no-nano-board.png`, 1440, 1100);
const demo = JSON.parse((await import('node:fs')).readFileSync(new URL('../demo/inbox.json', import.meta.url)));
const leaks = [];
for (const m of demo) for (const v of [m.from_email, m.from_handle].filter(Boolean)) for (const r of reqs) if (r.body.includes(v)) leaks.push(`${m.id}:${v}`);
const generic = reqs.filter((r) => /@[\w.-]+\.[a-z]{2,}|\+?\d[\d ()-]{8,}\d|@demo_/i.test(r.body));
ok('cloud requests were made for extraction', reqs.length >= 12, `${reqs.length} POSTs`);
ok('no demo email or handle in any request body', leaks.length === 0, leaks.join(',') || 'none');
ok('no email/phone/handle pattern in any request body', generic.length === 0, `${generic.length} hits`);
ok('every card is IN_CLOUD or RULES_ONLY, none ON_DEVICE', routes.every((r) => r !== 'ON_DEVICE'), [...new Set(routes)].join(','));
writeFileSync(`${shots}/a5-requests.json`, JSON.stringify({ count: reqs.length, routes, sample: reqs.filter((r) => /generateContent/.test(r.url)).slice(0, 2).map((r) => ({ url: r.url.replace(/projects\/[^/]+/, 'projects/<project>'), body: r.body.slice(0, 900) })) }, null, 1));

// ---------------------------------------------------------------- coach, real cloud call (expect App Check rejection until a debug token is registered)
await p.click('.card[data-col="negotiate"]');
await p.click('#tab-coach');
await p.click('[data-act="coach-start"]');
await p.waitFor(`document.querySelector('.drawer .err') || document.querySelector('.bubble.coach')`, 60000);
const coach = await p.eval(`({ err: document.querySelector('.drawer .err')?.textContent ?? null })`);
grab();
console.log('COACH_RESULT', JSON.stringify(coach));
const coachReq = reqs.filter((r) => /generateContent|streamGenerateContent/.test(r.url) && /gemini-3\.5/.test(r.url));
ok('coach request went to the coach model', coachReq.length > 0, coachReq[0]?.url ?? 'none');
const cb = coachReq.map((r) => r.body).join('\n');
ok('coach request has DealTerms keys and no contact detail', /brand_alias/.test(cb) && !/@[\w.-]+\.[a-z]{2,}|@demo_/.test(cb));
await p.sleep(300);
await p.shot(`${shots}/08-coach-cloud-result.png`);

await p.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: inject.identifier });
writeFileSync(`${shots}/e2e-extra-result.json`, JSON.stringify({ off, coachOff, routes, coach, log }, null, 2));
p.close();
