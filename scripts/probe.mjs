// Quick state probe: node scripts/probe.mjs <port>
import { connect } from './cdp.mjs';
const p = await connect(Number(process.argv[2] ?? 9471), 'http://127.0.0.1:4173');
console.log(
  JSON.stringify(
    await p.eval(`(async () => ({
      url: location.href,
      lm: typeof LanguageModel,
      avail: typeof LanguageModel === 'undefined' ? null : await LanguageModel.availability({ expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] }),
      pills: [...document.querySelectorAll('.pill')].map((e) => e.textContent.trim()),
      counter: document.getElementById('counter')?.textContent.replace(/\\s+/g, ' '),
      cards: document.querySelectorAll('.card').length,
    }))()`),
    null,
    1,
  ),
);
p.close();
