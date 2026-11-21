// Tiny Chrome DevTools driver used by the end-to-end run. No dependencies (Node 22 WebSocket).
// Usage: import { connect } from './cdp.mjs'; const p = await connect(9471, 'http://127.0.0.1:4173');

import { readFileSync } from 'node:fs';
const secret = (() => { try { return readFileSync(new URL('../../appcheck-debug-token', import.meta.url), 'utf8').trim(); } catch { return ''; } })();
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
// Any UUID in a CDP message is replaced too: the token's own file may be absent in CI, and no probe output needs a UUID.
export const redact = (s) => (secret ? s.split(secret).join('[REDACTED]') : s).replace(UUID, '[REDACTED]');

export async function connect(port, urlPrefix) {
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const tab = tabs.find((t) => t.type === 'page' && t.url.startsWith(urlPrefix)) ?? tabs.find((t) => t.type === 'page');
  if (!tab) throw new Error('no page tab on port ' + port);
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((r, j) => ((ws.onopen = r), (ws.onerror = j)));
  let id = 0;
  const pending = new Map();
  const events = [];
  ws.onmessage = (m) => {
    // Redact the App Check debug token (the console and network text can carry it) before anything is stored or printed.
    const d = JSON.parse(redact(String(m.data)));
    if (d.id && pending.has(d.id)) {
      const { res, rej } = pending.get(d.id);
      pending.delete(d.id);
      d.error ? rej(new Error(d.error.message)) : res(d.result);
    } else if (d.method) events.push(d);
  };
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const i = ++id;
      pending.set(i, { res, rej });
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const api = {
    send,
    sleep,
    events,
    async eval(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, userGesture: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result.value;
    },
    async goto(url) {
      await send('Page.navigate', { url });
      await sleep(800);
    },
    async click(sel) {
      const ok = await api.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.click(); return true; })()`);
      if (!ok) throw new Error('no element ' + sel);
      await sleep(120);
    },
    async type(sel, text) {
      await api.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.focus(); e.value = ${JSON.stringify(text)}; e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
      await sleep(80);
    },
    async waitFor(expr, ms = 60000, step = 250) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        try {
          if (await api.eval(expr)) return true;
        } catch {}
        await sleep(step);
      }
      throw new Error('timeout waiting for ' + expr);
    },
    async shot(path, w = 1440, h = 900) {
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
      const r = await send('Page.captureScreenshot', { format: 'png' });
      (await import('node:fs')).writeFileSync(path, Buffer.from(r.data, 'base64'));
    },
    close: () => ws.close(),
  };
  await send('Page.enable');
  await send('Runtime.enable');
  return api;
}
