// Prints the console warnings from one cloud extraction + one coach turn (Prompt API hidden). Usage: node scripts/cloud-probe.mjs <port>
import { connect } from './cdp.mjs';
const p = await connect(Number(process.argv[2] ?? 9471), 'http://');
for (const o of ['http://127.0.0.1:4173', 'http://localhost:4173', new URL(process.env.BASE ?? 'http://127.0.0.1:4173/').origin]) await p.send('Storage.clearDataForOrigin', { origin: o, storageTypes: 'all' });
const id = await p.send('Page.addScriptToEvaluateOnNewDocument', { source: `Object.defineProperty(window, 'LanguageModel', { value: undefined, configurable: true });` });
await p.goto((process.env.BASE ?? 'http://127.0.0.1:4173/'));
await p.waitFor(`document.querySelector('.banner.warn')`, 15000);
p.events.length = 0;
await p.type('#f-body', 'Hello, Glowmint Labs here. We would pay $700 for 1 Reel, usage 60 days organic only, no exclusivity, payment net 15.');
await p.click('[data-act="add"]');
await p.click('[data-act="triage"]');
await p.waitFor(`document.querySelectorAll('.card').length === 1`, 60000);
await p.click('.card');
await p.sleep(300);
console.log('ISSUES', JSON.stringify(await p.eval(`[...document.querySelectorAll('.drawer .sec ul.nothing li')].map(e => e.textContent)`)));
await p.click('#tab-coach');
await p.click('[data-act="coach-start"]');
await p.waitFor(`document.querySelector('.drawer .err') || document.querySelector('.bubble.coach .who + *')`, 60000).catch(() => {});
await p.sleep(500);
for (const e of p.events) if (e.method === 'Runtime.consoleAPICalled') { const t = (e.params.args ?? []).map((a) => String(a.value ?? a.description ?? '').slice(0, 300)).join(' | ').replace(/debug token: \S+/i, 'debug token: <hidden>'); console.log('CONSOLE', e.params.type, t); }
console.log('UI', JSON.stringify(await p.eval(`({ err: document.querySelector('.drawer .err')?.textContent, bubbles: [...document.querySelectorAll('.bubble.coach')].map(b => b.textContent.slice(0, 120)) })`)));
await p.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: id.identifier });
p.close();
