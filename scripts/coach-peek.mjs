// Prints the coach tab text of the open page (after cloud-probe or a manual run). Usage: node scripts/coach-peek.mjs <port>
import { connect } from './cdp.mjs';
const p = await connect(Number(process.argv[2] ?? 9471), 'http://');
console.log(JSON.stringify(await p.eval(`document.querySelector('.drawer')?.innerText.slice(-1200)`)));
p.close();
