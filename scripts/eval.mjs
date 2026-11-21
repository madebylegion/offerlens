// A3: field accuracy of on-device extraction on eval/labelled.json, in real Chrome with Nano.
// Usage: node scripts/eval.mjs [debugPort]   (needs `npm run preview` and Chrome with the model)
import { readFileSync, writeFileSync } from 'node:fs';
import { connect } from './cdp.mjs';

const data = JSON.parse(readFileSync(new URL('../eval/labelled.json', import.meta.url)));
const p = await connect(Number(process.argv[2] ?? 9471), 'http://127.0.0.1:4173');
await p.goto('http://127.0.0.1:4173/');
await p.waitFor(`typeof window.__ol === 'object'`, 20000);

const FIELDS = ['paid', 'rate_amount', 'currency', 'deliverables', 'usage_months', 'usage_media', 'exclusivity_days', 'payment_days'];
const norm = (t, f) => (f === 'deliverables' ? [...(t?.[f] ?? [])].sort().join('+') : String(t?.[f]));
const rows = [];
for (const m of data) {
  let r, retried = 0;
  for (;;) {
    try {
      r = await p.eval(`window.__ol.read(${JSON.stringify(m.body)}, true)`);
      break;
    } catch (e) {
      if (retried++ >= 2) throw e;
      console.log('retry', m.id, String(e.message).slice(0, 80));
      await p.sleep(2000);
    }
  }
  const miss = (t) => FIELDS.filter((f) => norm(t, f) !== norm(m.expect, f));
  rows.push({ id: m.id, retried, route: r.route, ms: r.ms, column: r.column, wantColumn: m.expect.column, missModel: r.model ? miss(r.model) : FIELDS, missFinal: miss(r.final), final: r.final, model: r.model });
}
const total = rows.length * FIELDS.length;
const score = (k) => total - rows.reduce((n, r) => n + r[k].length, 0);
const ms = rows.map((r) => r.ms).sort((a, b) => a - b);
const q = (x) => ms[Math.min(ms.length - 1, Math.floor(x * ms.length))];
console.log('id   route       ms     model-misses            final-misses            column');
for (const r of rows) console.log(r.id.padEnd(4), r.route.padEnd(10), String(r.ms).padStart(6), r.missModel.join(',').padEnd(24), r.missFinal.join(',').padEnd(24), r.column === r.wantColumn ? 'ok' : `${r.column} (want ${r.wantColumn})`);
const pct = (n) => ((100 * n) / total).toFixed(1) + '%';
const summary = {
  messages: rows.length,
  fields: total,
  nano_alone_accuracy: pct(score('missModel')),
  final_accuracy: pct(score('missFinal')),
  all_on_device: rows.every((r) => r.route === 'ON_DEVICE'),
  column_agreement: `${rows.filter((r) => r.column === r.wantColumn).length}/${rows.length}`,
  latency_ms: { p50: q(0.5), p95: q(0.95), max: ms.at(-1) },
};
console.log(JSON.stringify(summary, null, 1));
writeFileSync(new URL('../eval/last-run.json', import.meta.url), JSON.stringify({ summary, rows }, null, 1));
p.close();
