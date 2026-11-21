import { cloudConfigured } from './firebase';
import { FLAG_LABEL, FLAG_WHY } from './rank';
import { daysText, deliverablesText, esc, highlight, money, payText, usageText, when } from './format';
import { icon, logo } from './icons';
import type { Row, State } from './state';
import type { Column, Route, Triage } from './types';

const ROUTE_LABEL: Record<Route, string> = { ON_DEVICE: 'on this laptop', IN_CLOUD: 'cloud', RULES_ONLY: 'rules only' };
export const routeChip = (r: Route) =>
  `<span class="route" data-route="${r}">${r === 'ON_DEVICE' ? icon.bolt : r === 'IN_CLOUD' ? icon.cloud : icon.check}${ROUTE_LABEL[r]}</span>`;

const COLS: { id: Column; title: string; sub: string }[] = [
  { id: 'worth', title: 'Worth it', sub: 'fair terms, paid, short rights' },
  { id: 'negotiate', title: 'Negotiate', sub: 'real offer, some terms cost you' },
  { id: 'walk', title: 'Walk away', sub: 'traps and scams' },
];

const VERDICT_COPY: Record<Column, (t: Triage) => [string, string]> = {
  worth: () => ['Worth it', 'Paid, short rights and quick payment. Check the contract matches this message.'],
  negotiate: (t) => ['Negotiate', t.flags.length ? 'There is real money here, but some terms cost you. Push back on the items below.' : 'There is an offer, but fee, rights or payment timing could be better.'],
  walk: (t) => (t.verdict === 'scam' ? ['Walk away: scam signs', 'Do not click, pay or reply with details. Report and block the sender.'] : ['Walk away: a trap', 'The rights or payment terms would cost you more than the fee is worth.']),
};

// ---------------------------------------------------------------- header

function header(s: State): string {
  const nanoPill =
    s.nano === 'available'
      ? `<span class="pill ok" title="Gemini Nano is installed in this Chrome">${icon.bolt}Nano ready</span>`
      : s.nano === 'downloading' || s.downloadPct !== null
        ? `<span class="pill info">${icon.download}Nano downloading</span>`
        : s.nano === 'downloadable'
          ? `<span class="pill warn">${icon.download}Nano not downloaded</span>`
          : s.nano === 'checking'
            ? `<span class="pill info">Checking Nano</span>`
            : `<span class="pill warn">${icon.alert}No on-device AI</span>`;
  const net = s.online ? `<span class="pill ok" title="Network is reachable">${icon.wifi}Online</span>` : `<span class="pill off" role="status">${icon.wifiOff}Offline</span>`;
  const c = s.counter;
  return `<header class="top"><div class="top-in">
    <div class="brand">${logo}<span>OfferLens</span></div>
    <nav class="nav" aria-label="Views">
      <button data-act="nav" data-view="inbox" ${s.view === 'inbox' ? 'aria-current="page"' : ''}>Inbox</button>
      <button data-act="nav" data-view="board" ${s.view === 'board' ? 'aria-current="page"' : ''} ${s.rows.some((r) => r.triage) || s.queue.running ? '' : 'disabled'}>Board</button>
    </nav>
    <div class="top-end">
      <div class="meter" id="counter" role="status" aria-label="Where messages were read">
        <span class="dev">on-device: <b data-n="device">${c.device}</b></span><span aria-hidden="true">·</span>
        <span class="cld">cloud: <b data-n="cloud">${c.cloud}</b></span><span aria-hidden="true">·</span>
        <span>cost <b>$0.00</b></span>
      </div>
      ${nanoPill}${net}
      <label class="switch" title="Private mode reads only on this laptop. Nothing is ever sent.">
        <input type="checkbox" role="switch" data-act="private" ${s.privateMode ? 'checked' : ''} />
        <span class="track" aria-hidden="true"></span>
        <span>Private mode</span>
      </label>
      <button class="btn quiet small" data-act="how">How it routes</button>
    </div>
  </div></header>`;
}

function banners(s: State): string {
  const out: string[] = [];
  if (s.nano === 'downloadable' && s.downloadPct === null) {
    out.push(`<div class="banner info" role="status">${icon.download}<div class="grow"><strong>The on-device model is not downloaded yet.</strong> It is a one-time download of about 4 GB, kept by Chrome. Until then, ${s.privateMode ? 'Private mode cannot read anything and nothing is sent.' : 'messages are read in the cloud after contact details are masked.'}</div><button class="btn small" data-act="download">Download model</button></div>`);
  } else if (s.downloadPct !== null || s.nano === 'downloading') {
    const pct = s.downloadPct === null ? null : Math.round(s.downloadPct * 100);
    out.push(`<div class="banner info" role="status">${icon.download}<div class="grow"><strong>Downloading the on-device model${pct === null ? '' : `: ${pct}%`}.</strong> Chrome keeps downloading in the background even if this number pauses. You can check <span class="mono">chrome://on-device-internals</span>.<div class="bar"><i style="width:${pct ?? 3}%"></i></div></div></div>`);
  } else if (s.nano === 'missing' || s.nano === 'unavailable') {
    out.push(`<div class="banner warn" role="status">${icon.alert}<div class="grow"><strong>On-device AI is not available in this browser.</strong> OfferLens still works: emails, @handles, phone numbers and links are masked first, then the message is read in the cloud. ${cloudConfigured ? '' : '<strong>The cloud is not configured here, so nothing can be read until you add firebase.local.json.</strong> '}For the on-device route use desktop Chrome with Gemini Nano.</div></div>`);
  }
  if (!s.online) {
    out.push(`<div class="banner info" role="status">${icon.wifiOff}<div class="grow"><strong>You are offline.</strong> Reading on this laptop still works. The negotiation coach needs a connection.</div></div>`);
  }
  if (s.privateMode) {
    out.push(`<div class="banner info" role="status">${icon.lock}<div class="grow"><strong>Private mode is on.</strong> Messages are read only on this laptop. The cloud coach is switched off until you turn Private mode off.</div></div>`);
  }
  return out.join('');
}

// ---------------------------------------------------------------- inbox

function inboxView(s: State): string {
  const pending = s.rows.filter((r) => r.status !== 'done').length;
  return `<div class="inbox">
    <section class="panel" aria-labelledby="add-h">
      <h1 id="add-h">Brand offers, read on your laptop</h1>
      <p class="lede">Paste the messages brands send you. Gemini Nano on this laptop pulls out the fee, usage rights, exclusivity and payment terms, flags traps, and ranks every offer. It costs nothing per message and works offline.</p>
      <div class="field"><label for="f-from">Sender (optional)</label><input class="input" id="f-from" data-field="from" value="${esc(s.form.from)}" placeholder="@demo_brand or name@example.com" autocomplete="off" /></div>
      <div class="field"><label for="f-body">Message</label><textarea class="input" id="f-body" data-field="body" placeholder="Paste a DM or email here">${esc(s.form.body)}</textarea>
        <span class="hint">Emails, handles, phone numbers and links are masked before any AI sees the text.</span></div>
      <div class="actions"><button class="btn primary" data-act="add" ${s.form.body.trim().length < 20 ? 'disabled' : ''}>Add to inbox</button><button class="btn" data-act="demo">Load demo inbox (12)</button></div>
    </section>
    <section class="panel" aria-labelledby="in-h">
      <h2 id="in-h">Inbox <span class="mono" style="font-weight:450">${s.rows.length}</span></h2>
      ${
        s.rows.length === 0
          ? `<div class="empty"><p>Nothing here yet. The demo inbox has 12 invented messages: three good offers, four to negotiate, three traps and two scams.</p><button class="btn" data-act="demo">Load demo inbox (12)</button></div>`
          : `<ul class="list">${s.rows
              .map(
                (r) =>
                  `<li><span class="ch">${r.message.channel}</span><div style="min-width:0"><div class="who">${esc(r.message.from_handle || r.message.from_email || 'Pasted message')}${r.message.subject ? ` <span style="font-weight:450;color:var(--ink-2)">${esc(r.message.subject)}</span>` : ''}</div><div class="snip">${esc(r.message.body.replace(/\s+/g, ' ').slice(0, 140))}</div></div><span class="stat ${r.status}">${statusText(r)}</span><button class="icon-btn" data-act="remove" data-id="${esc(r.message.id)}" aria-label="Remove message from ${esc(r.message.from_handle || r.message.from_email || 'pasted message')}">${icon.close}</button></li>`,
              )
              .join('')}</ul>
        <div class="actions"><button class="btn primary" data-act="triage" ${pending === 0 || s.queue.running ? 'disabled' : ''}>${s.queue.running ? 'Reading…' : `Read ${pending} message${pending === 1 ? '' : 's'}`}</button><button class="btn quiet" data-act="clear" ${s.queue.running ? 'disabled' : ''}>Clear inbox</button>${s.rows.some((r) => r.triage) ? '<button class="btn quiet" data-act="nav" data-view="board">Go to board</button>' : ''}</div>`
      }
    </section>
  </div>`;
}

const statusText = (r: Row) => ({ queued: 'Waiting', reading: 'Reading…', done: 'Done', blocked: 'Needs on-device AI', error: 'Failed' })[r.status];

// ---------------------------------------------------------------- board

function card(r: Row, fresh: boolean): string {
  const t = r.triage as Triage;
  const x = t.terms;
  const flags = t.flags.slice(0, 3);
  return `<button class="card ${fresh ? 'fresh' : ''}" data-act="open" data-id="${esc(r.message.id)}" data-col="${t.column}" data-route="${t.route}" aria-label="${esc(x.brand_alias)}, ${t.column === 'worth' ? 'worth it' : t.column === 'walk' ? 'walk away' : 'negotiate'}, score ${t.score}">
    <div class="row1"><span class="name">${esc(x.brand_alias)}</span><span class="score" title="Score out of 100">${t.score}/100</span></div>
    <div class="fee">${x.rate_amount ? esc(money(x.rate_amount, x.currency)) : '<small>No cash fee</small>'}</div>
    <div class="what">${esc(deliverablesText(x.deliverables))}</div>
    <dl class="terms"><dt>Usage</dt><dd>${esc(usageText(x))}</dd><dt>Exclusive</dt><dd>${esc(daysText(x.exclusivity_days))}</dd><dt>Pays</dt><dd>${esc(payText(x.payment_days))}</dd></dl>
    ${flags.length ? `<div class="chips">${flags.map((f) => `<span class="flag ${['gifted_only', 'slow_payment', 'long_exclusivity'].includes(f.flag) ? 'soft' : ''}">${esc(FLAG_LABEL[f.flag])}</span>`).join('')}${t.flags.length > 3 ? `<span class="flag soft">+${t.flags.length - 3}</span>` : ''}</div>` : ''}
    <div class="foot">${routeChip(t.route)}<span class="ms">${t.route === 'RULES_ONLY' ? '' : `${(t.ms / 1000).toFixed(1)} s`}</span></div>
  </button>`;
}

function boardView(s: State): string {
  const done = s.rows.filter((r) => r.triage);
  const pending = s.rows.filter((r) => r.status === 'queued' || r.status === 'reading');
  const blocked = s.rows.filter((r) => r.status === 'blocked' || r.status === 'error');
  const by = (c: Column) => done.filter((r) => r.triage!.column === c).sort((a, b) => b.triage!.score - a.triage!.score || a.message.id.localeCompare(b.message.id));
  const q = s.queue;
  const cloudRead = s.nano !== 'available' && !s.privateMode;
  return `<div class="board-head"><div><h1>Your board</h1><p>${done.length} of ${s.rows.length} read${done.length ? ` · ${by('worth').length} worth it · ${by('negotiate').length} to negotiate · ${by('walk').length} to walk away from` : ''}</p></div>
    </div>
  ${q.running ? `<div class="progress" role="status" aria-live="polite"><span class="spin" aria-hidden="true"></span><span>Reading ${Math.min(q.done + 1, q.total)} of ${q.total} ${cloudRead ? 'in the cloud, contacts masked' : 'on this laptop'}</span><div class="bar"><i style="width:${q.total ? Math.round((q.done / q.total) * 100) : 0}%"></i></div></div>` : ''}
  ${blocked.length ? `<div class="banner warn" role="status">${icon.alert}<div class="grow"><strong>${blocked.length} message${blocked.length === 1 ? '' : 's'} not read.</strong> ${esc(blocked[0]?.error ?? '')} <button class="link" data-act="retry-all">Try again</button></div></div>` : ''}
  <div class="cols">${COLS.map(
    (c) => `<section class="col" aria-labelledby="c-${c.id}"><h2 id="c-${c.id}">${c.title} <span class="n">${by(c.id).length}</span> <small>${c.sub}</small></h2><div class="stack">${
      by(c.id)
        .map((r) => card(r, s.fresh.has(r.message.id)))
        .join('') || `<div class="none">${pending.length ? 'Waiting for the next result…' : 'No offers here.'}</div>`
    }</div></section>`,
  ).join('')}</div>`;
}

// ---------------------------------------------------------------- drawer

function sharedBlock(r: Row): string {
  return `<details class="fold" id="shared"><summary>Shared with cloud <span class="by">${r.shared.length ? r.shared.length + ' item' + (r.shared.length === 1 ? '' : 's') : 'nothing yet'}</span></summary>
    ${
      r.shared.length
        ? `<p class="nothing">This is every byte sent to the cloud for this deal. No message text, sender, handle, email or link.</p>${r.shared.map((p) => `<div class="sent"><span class="when">${esc(p.kind)} · ${esc(p.at.slice(11, 19))} UTC</span><pre class="pre">${esc(p.text)}</pre></div>`).join('')}`
        : '<p class="nothing">Nothing from this deal has left this laptop. If you ask the coach for help, the exact text it receives will be listed here.</p>'
    }</details>`;
}

function dealTab(r: Row, s: State): string {
  const t = r.triage as Triage;
  const x = t.terms;
  const ev = t.evidence;
  const [vt, vp] = VERDICT_COPY[t.column](t);
  const shown = new Set<string>();
  const q = (k: keyof typeof ev) => {
    const v = ev[k];
    if (!v || shown.has(v)) return '';
    shown.add(v);
    return `<blockquote>${esc(v)}</blockquote>`;
  };
  const quotes = Object.values(ev).filter(Boolean) as string[];
  return `<div class="verdict" data-col="${t.column}">${esc(vt)}<p>${esc(vp)}</p>${t.verdict === "scam" ? "" : `<button class="btn small" data-act="tab" data-tab="coach">${icon.cloud}Draft a counter-offer</button>`}</div>
  <dl class="fields">
    <div><dt>Fee</dt><dd class="mono">${x.rate_amount ? esc(money(x.rate_amount, x.currency)) : 'No cash fee'}</dd>${q('rate') || q('gifted')}</div>
    <div><dt>Deliverables</dt><dd>${esc(deliverablesText(x.deliverables))}</dd>${q('deliverables')}</div>
    <div><dt>Usage rights</dt><dd>${esc(usageText(x))}</dd>${q('usage')}</div>
    <div><dt>Exclusivity</dt><dd class="${x.exclusivity_days ? "" : "unset"}">${esc(daysText(x.exclusivity_days))}</dd>${q('exclusivity')}</div>
    <div><dt>Payment</dt><dd>${esc(payText(x.payment_days))}</dd>${q('payment')}</div>
  </dl>
  <div class="sec"><h3>Red flags</h3>${
    t.flags.length
      ? `<ul class="flags-list">${t.flags.map((f) => `<li class="${['gifted_only', 'slow_payment', 'long_exclusivity'].includes(f.flag) ? 'soft' : ''}"><div class="t">${esc(FLAG_LABEL[f.flag])}<span class="by ${f.by === 'model' ? 'model' : ''}">${f.by === 'model' ? 'spotted by Nano' : 'rule check'}</span></div><p>${esc(FLAG_WHY[f.flag])}</p>${ev[f.flag] ? `<blockquote style="margin:6px 0 0;padding-left:12px;border-left:2px solid var(--line);font-size:14px;color:var(--ink-2)">${esc(ev[f.flag])}</blockquote>` : ''}</li>`).join('')}</ul>`
      : '<p class="nothing">No red flags found.</p>'
  }</div>
  ${x.disclosure_required ? `<div class="sec"><div class="note"><strong>Disclosure.</strong> Paid or gifted posts must be clearly disclosed (FTC 16 CFR 255.5). Use the platform's paid-partnership label and say it in the post, for example "#ad".</div></div>` : ''}
  ${t.issues.length ? `<div class="sec"><h3>Checks</h3><ul class="nothing" style="padding-left:18px">${t.issues.map((i) => `<li>${esc(i)}</li>`).join('')}</ul></div>` : ''}
  <div class="sec">${sharedBlock(r)}
    <details class="fold"><summary>Original message</summary><p class="nothing">Stays on this laptop. ${t.route === 'IN_CLOUD' ? 'A masked copy was read in the cloud.' : ''}</p><div class="msgtxt">${highlight((r.message.subject ? r.message.subject + '\n\n' : '') + r.message.body, quotes)}</div></details></div>`;
}

function coachTab(r: Row, s: State): string {
  const t = r.triage as Triage;
  const c = r.coach;
  let why = '';
  if (s.privateMode) why = 'Private mode is on, so nothing can be sent to the cloud. Turn it off to use the coach.';
  else if (!s.online) why = 'The coach needs a connection.';
  else if (!cloudConfigured) why = 'The cloud is not configured in this build (add firebase.local.json).';
  const gate = !!why;
  return `<p class="lede" style="margin-top:0">The coach is the one step that runs in the cloud: a multi-turn chat is not supported on-device. It receives only the structured terms below, never the message.</p>
  ${
    !c
      ? `<div class="field"><label for="floor">Your minimum fee (optional)</label><input class="input mono" id="floor" data-field="floor" inputmode="numeric" value="${esc(r.floor)}" placeholder="e.g. 2000" ${gate ? 'disabled' : ''} /><span class="hint">Shared with the coach as a number.</span></div>
         <div class="actions"><button class="btn primary" data-act="coach-start" data-id="${esc(r.message.id)}" ${gate || r.coachBusy ? 'disabled' : ''}>${icon.cloud}${r.coachBusy ? 'Asking the coach…' : 'Draft a counter-offer'}</button></div>
         ${gate ? `<p class="err" role="status" style="color:var(--ink-2)">${esc(why)}</p>` : ''}`
      : ''
  }
  ${r.coachError ? `<p class="err" role="alert">${esc(r.coachError)}</p>` : ''}
  <div class="chat" aria-live="polite">${(c?.turns ?? []).map((m) => `<div class="bubble ${m.from}" data-source="${esc(m.source ?? '')}"><div class="who">${m.from === 'coach' ? icon.cloud + 'Coach (cloud)' : 'You'}</div>${esc(m.text)}</div>`).join('')}${r.coachBusy && c ? `<div class="bubble coach"><div class="who">${icon.cloud}Coach (cloud)</div><span class="spin" role="status" aria-label="Thinking"></span></div>` : ''}</div>
  ${
    c
      ? `<div class="composer"><div class="quick">${['Ask for a higher fee', 'Cut usage to 3 months', 'Make it friendlier', 'Shorten it'].map((q) => `<button data-act="coach-quick" data-id="${esc(r.message.id)}" data-q="${esc(q)}" ${gate || r.coachBusy ? 'disabled' : ''}>${q}</button>`).join('')}</div>
         <div class="row"><label class="sr-only" for="say">Reply to the coach</label><input class="input" id="say" data-field="draft" value="${esc(r.draft)}" placeholder="Tell the coach what to change" autocomplete="off" ${gate ? 'disabled' : ''} /><button class="btn primary" data-act="coach-send" data-id="${esc(r.message.id)}" ${gate || r.coachBusy || !r.draft.trim() ? 'disabled' : ''}>${icon.send}Send</button></div></div>`
      : ''
  }
  <div class="sec">${sharedBlock(r)}</div>`;
}

function drawer(s: State): string {
  const r = s.rows.find((x) => x.message.id === s.selectedId);
  if (!r || !r.triage) return '';
  const t = r.triage;
  return `<div class="scrim" data-act="close"></div>
  <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="d-h">
    <header><div class="hd"><div><h2 id="d-h" tabindex="-1">${esc(t.terms.brand_alias)}</h2>
      <div class="sub">${routeChip(t.route)}<span>${esc(r.message.from_handle || r.message.from_email || 'Pasted message')} · ${esc(when(r.message.received))}</span><span class="mono">score ${t.score}/100</span></div></div>
      <button class="icon-btn" data-act="close" aria-label="Close deal">${icon.close}</button></div>
      <div class="tabs" role="tablist" style="box-shadow:0 1px 0 var(--line)"><button role="tab" id="tab-deal" aria-selected="${s.tab === 'deal'}" data-act="tab" data-tab="deal">Deal</button><button role="tab" id="tab-coach" aria-selected="${s.tab === 'coach'}" data-act="tab" data-tab="coach">Coach</button></div></header>
    <div class="dbody" role="tabpanel" aria-labelledby="tab-${s.tab}">${s.tab === 'deal' ? dealTab(r, s) : coachTab(r, s)}</div>
  </aside>`;
}

export function renderApp(s: State): string {
  return `${header(s)}<main id="main">${banners(s)}${s.view === 'board' ? boardView(s) : inboxView(s)}</main>
  <footer class="site"><span>Demo messages are invented. Fees, brands and people in them do not exist.</span><span>Not legal advice. Check any contract before you sign.</span></footer>${drawer(s)}`;
}

export const howDialog = `<div class="in"><h2 style="font-size:20px;font-weight:650;letter-spacing:-.01em">How OfferLens routes each step</h2>
<p class="lede">Firebase AI Logic hybrid inference picks where a model call runs. Plain code decides everything that matters: scoring, checks and what may leave this laptop.</p>
<table><thead><tr><th>Step</th><th>Mode</th><th>Where</th><th>Why</th></tr></thead><tbody>
<tr><td>Read each message</td><td><code>PREFER_ON_DEVICE</code></td><td>On this laptop (Nano). Cloud only if Nano is missing.</td><td>Free per message, private, works offline</td></tr>
<tr><td>Read with Private mode on</td><td><code>ONLY_ON_DEVICE</code></td><td>On this laptop, always</td><td>Nothing is ever sent. No Nano means no result.</td></tr>
<tr><td>Mask contacts</td><td>plain code</td><td>On this laptop</td><td>Emails, handles, phones and links never reach any model</td></tr>
<tr><td>Check numbers, flag scams, rank</td><td>plain code</td><td>On this laptop</td><td>A model reading is kept only if the message backs it up</td></tr>
<tr><td>Negotiation coach</td><td><code>ONLY_IN_CLOUD</code></td><td>Cloud (multi-turn chat)</td><td>Chat is not supported on-device. It sees only the extracted terms.</td></tr>
</tbody></table>
<div class="actions"><button class="btn primary" data-act="how-close">Close</button></div></div>`;
