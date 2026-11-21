// End-to-end run against a real Chrome with Nano. Usage: node scripts/e2e.mjs <debugPort> [shotsDir]
// Starts from a fresh load of the preview server, loads the demo inbox, reads all 12 on-device,
// checks the board, opens a deal, and saves screenshots.
import { mkdirSync, writeFileSync } from 'node:fs';
import { connect } from './cdp.mjs';

const port = Number(process.argv[2] ?? 9471);
const shots = process.argv[3] ?? 'shots';
mkdirSync(shots, { recursive: true });
const p = await connect(port, 'http://127.0.0.1:4173');
const log = [];
const ok = (name, cond, extra = '') => {
  log.push({ name, pass: !!cond, extra });
  console.log(cond ? 'PASS' : 'FAIL', name, extra);
};

await p.goto('http://127.0.0.1:4173/');
await p.waitFor(`document.querySelector('.pill.ok')?.textContent.includes('Nano ready')`, 20000);
await p.shot(`${shots}/01-inbox-empty.png`);

await p.click('[data-act="demo"]');
await p.sleep(300);
await p.shot(`${shots}/01b-inbox-12-loaded.png`, 1440, 1100);
await p.click('[data-act="triage"]');
const t0 = Date.now();
await p.waitFor(`document.querySelectorAll('.card').length === 12`, 240000, 500);
const secs = Math.round((Date.now() - t0) / 1000);
ok('12 cards on board', true, `${secs}s`);
await p.sleep(600);
await p.shot(`${shots}/02-board-12.png`, 1440, 1100);

const board = await p.eval(`(() => ({
  counter: document.getElementById('counter').textContent.replace(/\\s+/g, ' ').trim(),
  routes: [...document.querySelectorAll('.card')].map((c) => c.dataset.route),
  cols: ['worth','negotiate','walk'].map((k) => document.querySelectorAll('.card[data-col=' + k + ']').length),
  cards: [...document.querySelectorAll('.card')].map((c) => c.getAttribute('aria-label')),
}))()`);
console.log(JSON.stringify(board));
ok('all 12 read ON_DEVICE', board.routes.every((r) => r === 'ON_DEVICE'), board.routes.join(','));
ok('counter 12 on-device / 0 cloud', /on-device: 12.*cloud: 0/.test(board.counter), board.counter);
ok('columns 3/4/5', board.cols.join() === '3,4,5', board.cols.join('/'));

await p.click('.card[data-col="walk"]');
await p.sleep(300);
await p.shot(`${shots}/03-deal-walk.png`);
await p.click('[data-act="close"]');
await p.click('.card[data-col="negotiate"]');
await p.sleep(300);
await p.shot(`${shots}/04-deal-negotiate.png`);
await p.click('#shared summary');
await p.sleep(200);
ok('shared panel says nothing left', await p.eval(`document.querySelector('#shared').textContent.includes('Nothing from this deal has left')`));

writeFileSync(`${shots}/e2e-result.json`, JSON.stringify({ board, secs, log }, null, 2));
p.close();
