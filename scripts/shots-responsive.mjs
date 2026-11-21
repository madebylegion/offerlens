// Board and drawer at 1024, 768 and 390 px, plus a horizontal-overflow check. Usage: node scripts/shots-responsive.mjs <port> [dir]
import { connect } from './cdp.mjs';
const p = await connect(Number(process.argv[2] ?? 9471), 'http://127.0.0.1:4173');
const dir = process.argv[3] ?? 'shots';
await p.goto('http://127.0.0.1:4173/');
await p.waitFor(`document.querySelector('.pill.ok')`, 20000);
await p.click('[data-act="demo"]');
await p.click('[data-act="triage"]');
await p.waitFor(`document.querySelectorAll('.card').length === 12`, 240000, 500);
await p.sleep(500);
for (const w of [1024, 768, 390]) {
  await p.send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: w < 600 });
  await p.sleep(300);
  const over = await p.eval(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
  console.log(w, 'horizontal overflow px:', over);
  await p.shot(`${dir}/r${w}-board.png`, w, 900);
  await p.click('.card[data-col="walk"]');
  await p.sleep(250);
  console.log(w, 'drawer overflow px:', await p.eval(`document.documentElement.scrollWidth - document.documentElement.clientWidth`));
  await p.shot(`${dir}/r${w}-drawer.png`, w, 900);
  await p.click('[data-act="close"]');
}
await p.send('Emulation.clearDeviceMetricsOverride');
p.close();
