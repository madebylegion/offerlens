import './styles.css';
import { NeedsOnDevice, downloadOnDeviceModel, extract, isOnline, onDeviceAvailability } from './ai';
import { Coach } from './coach';
import { cloudConfigured } from './firebase';
import demo from '../demo/inbox.json';
import { onChange, state, update, type Row } from './state';
import { buildTriage, prepare } from './triage';
import type { InboxMessage } from './types';
import { howDialog, renderApp } from './view';

const app = document.getElementById('app') as HTMLElement;
const how = document.getElementById('how') as HTMLDialogElement;
how.innerHTML = howDialog;

// ------------------------------------------------------------------ render

function render() {
  const active = document.activeElement as HTMLElement | null;
  const focusId = active?.id || '';
  const sel = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement ? [active.selectionStart, active.selectionEnd] : null;
  const body = app.querySelector('.dbody');
  const bodyTop = body?.scrollTop ?? 0;
  const hadDrawer = !!app.querySelector('.drawer');
  const sharedWasOpen = (app.querySelector('details#shared') as HTMLDetailsElement | null)?.open ?? sharedOpen;
  sharedOpen = sharedWasOpen;
  // safe: view.ts passes every dynamic value (including pasted message text) through esc() or highlight()
  app.innerHTML = renderApp(state);
  if (sharedOpen) (app.querySelector('details#shared') as HTMLDetailsElement | null)?.setAttribute('open', '');
  const nb = app.querySelector('.dbody');
  if (nb && hadDrawer) nb.scrollTop = bodyTop;
  if (!hadDrawer && state.selectedId) (app.querySelector('#d-h') as HTMLElement | null)?.focus();
  else if (focusId) {
    const el = document.getElementById(focusId) as HTMLInputElement | null;
    if (el) {
      el.focus();
      if (sel && el.setSelectionRange && sel[0] !== null) el.setSelectionRange(sel[0], sel[1]);
    }
  }
  if (state.fresh.size) setTimeout(() => state.fresh.clear(), 400);
}
let sharedOpen = false;
onChange(render);

// ------------------------------------------------------------------ availability

async function refreshNano() {
  const a = await onDeviceAvailability();
  update((s) => {
    s.nano = a;
    if (a === 'available') s.downloadPct = null;
  });
  return a;
}

let poll: number | undefined;
async function download() {
  update((s) => (s.downloadPct = 0));
  window.clearInterval(poll);
  poll = window.setInterval(async () => {
    if ((await onDeviceAvailability()) === 'available') {
      window.clearInterval(poll);
      update((s) => ((s.nano = 'available'), (s.downloadPct = null)));
    }
  }, 4000);
  try {
    await downloadOnDeviceModel((p) => update((s) => (s.downloadPct = p)));
  } catch (e) {
    console.warn('download', e);
  }
  await refreshNano();
}

// ------------------------------------------------------------------ triage queue

const nextId = () => 'p' + Math.random().toString(36).slice(2, 8);

async function readRow(row: Row) {
  row.status = 'reading';
  update();
  const masked = prepare(row.message);
  try {
    const ext = await extract(masked.text, { privateMode: state.privateMode });
    row.triage = buildTriage(row.message, masked, ext.terms, ext.route, ext.ms);
    if (!ext.terms) row.triage.issues.unshift('The model reply could not be read, so rules alone made this result.');
    row.status = 'done';
    update((s) => {
      if (ext.route === 'ON_DEVICE') s.counter.device++;
      else s.counter.cloud++;
      s.fresh.add(row.message.id);
    });
  } catch (e) {
    if (e instanceof NeedsOnDevice) {
      row.status = 'blocked';
      row.error = e.message;
    } else {
      // the model path failed: the rules still produce a usable, honestly labelled result
      console.warn('read failed', e);
      row.triage = buildTriage(row.message, masked, null, 'RULES_ONLY', 0);
      row.triage.issues.unshift(`AI step failed (${(e as Error).message.replace(/https?:\/\/\S+/g, "<url>").slice(0, 140)}). Rules alone made this result.`);
      row.status = 'done';
      update((s) => {
        s.counter.rules++;
        s.fresh.add(row.message.id);
      });
    }
  }
}

async function runQueue() {
  if (state.queue.running) return;
  const todo = state.rows.filter((r) => r.status === 'queued' || r.status === 'blocked' || r.status === 'error');
  if (!todo.length) return;
  for (const r of todo) r.status = 'queued';
  update((s) => {
    s.queue = { running: true, done: 0, total: todo.length };
    s.view = 'board';
  });
  await refreshNano();
  for (const r of todo) {
    await readRow(r);
    update((s) => s.queue.done++);
  }
  update((s) => (s.queue.running = false));
}

// ------------------------------------------------------------------ coach

async function coachRun(row: Row, fn: (c: Coach) => Promise<unknown>) {
  row.coachBusy = true;
  row.coachError = undefined;
  update();
  try {
    await fn(row.coach as Coach);
  } catch (e) {
    const msg = String((e as Error).message ?? e);
    console.warn('coach', msg);
    row.coachError = /\b429\b|quota|rate.?limit|RESOURCE_EXHAUSTED/i.test(msg)
      ? 'The coach is busy right now (free-tier limit). Try again in a minute. Nothing was lost.'
      : /app.?check|403|permission/i.test(msg)
        ? 'The cloud rejected this request (App Check or key restriction).'
        : /network|fetch|offline/i.test(msg)
          ? 'Could not reach the cloud. Check your connection.'
          : 'The coach could not answer: ' + msg.slice(0, 140);
  }
  row.coachBusy = false;
  update();
}

function startCoach(row: Row) {
  if (!row.triage) return;
  const floor = Number(row.floor.replace(/[^\d.]/g, '')) || undefined;
  row.coach = new Coach(row.triage.terms, floor, (p) => row.shared.push(p));
  return coachRun(row, (c) => c.start());
}

async function say(row: Row, text: string) {
  if (!row.coach || !text.trim()) return;
  row.draft = '';
  await coachRun(row, (c) => c.say(text));
}

// ------------------------------------------------------------------ events

const find = (id?: string) => state.rows.find((r) => r.message.id === id);

app.addEventListener('click', (ev) => {
  const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  const id = el.dataset.id;
  switch (act) {
    case 'nav':
      update((s) => ((s.view = el.dataset.view as 'inbox' | 'board'), (s.selectedId = undefined)));
      break;
    case 'demo':
      loadDemo();
      break;
    case 'add': {
      const from = state.form.from.trim();
      const m: InboxMessage = {
        id: nextId(),
        channel: from.includes('@') && !from.startsWith('@') ? 'email' : 'dm',
        from_handle: from.startsWith('@') ? from : undefined,
        from_email: from.includes('@') && !from.startsWith('@') ? from : undefined,
        received: new Date().toISOString(),
        body: state.form.body.trim(),
      };
      update((s) => {
        s.rows.push(newRow(m));
        s.form = { from: '', body: '' };
      });
      break;
    }
    case 'remove':
      update((s) => (s.rows = s.rows.filter((r) => r.message.id !== id)));
      break;
    case 'clear':
      update((s) => ((s.rows = []), (s.counter = { device: 0, cloud: 0, rules: 0 }), (s.view = 'inbox')));
      break;
    case 'triage':
    case 'retry-all':
      void runQueue();
      break;
    case 'open':
      update((s) => ((s.selectedId = id), (s.tab = 'deal')));
      break;
    case 'close':
      update((s) => (s.selectedId = undefined));
      break;
    case 'tab':
      update((s) => (s.tab = el.dataset.tab as 'deal' | 'coach'));
      break;
    case 'download':
      void download();
      break;
    case 'how':
      how.showModal();
      break;
    case 'coach-start': {
      const r = find(id);
      if (r) void startCoach(r);
      break;
    }
    case 'coach-send': {
      const r = find(id);
      if (r) void say(r, r.draft);
      break;
    }
    case 'coach-quick': {
      const r = find(id);
      if (r) void say(r, el.dataset.q ?? '');
      break;
    }
  }
});

how.addEventListener('click', (ev) => {
  const t = ev.target as HTMLElement;
  if (t === how || t.closest('[data-act="how-close"]')) how.close();
});

app.addEventListener('change', (ev) => {
  const el = ev.target as HTMLInputElement;
  if (el.dataset.act === 'private') update((s) => (s.privateMode = el.checked));
});

app.addEventListener('input', (ev) => {
  const el = ev.target as HTMLInputElement | HTMLTextAreaElement;
  const f = el.dataset.field;
  if (!f) return;
  if (f === 'from' || f === 'body') {
    state.form[f] = el.value;
    // only the "Add" button's enabled state depends on the text: patch it in place so typing never loses focus
    const add = app.querySelector<HTMLButtonElement>('[data-act="add"]');
    if (add) add.disabled = state.form.body.trim().length < 20;
  } else {
    const r = find(state.selectedId);
    if (r && (f === 'floor' || f === 'draft')) {
      r[f] = el.value;
      if (f === 'draft') {
        const send = app.querySelector<HTMLButtonElement>('[data-act="coach-send"]');
        if (send) send.disabled = r.coachBusy || !el.value.trim();
      }
    }
  }
});

app.addEventListener('keydown', (ev) => {
  const el = ev.target as HTMLElement;
  if (ev.key === 'Enter' && el.id === 'say') {
    ev.preventDefault();
    const r = find(state.selectedId);
    if (r) void say(r, r.draft);
  }
});

app.addEventListener(
  'toggle',
  (ev) => {
    const d = ev.target as HTMLDetailsElement;
    if (d.id === 'shared') sharedOpen = d.open;
  },
  true,
);

document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && state.selectedId && !how.open) update((s) => (s.selectedId = undefined));
});

window.addEventListener('online', () => update((s) => (s.online = true)));
window.addEventListener('offline', () => update((s) => (s.online = false)));
window.addEventListener('focus', () => void refreshNano());

// ------------------------------------------------------------------ boot

function newRow(m: InboxMessage): Row {
  return { message: m, status: 'queued', shared: [], coachBusy: false, floor: '', draft: '' };
}

function loadDemo() {
  update((s) => {
    s.rows = (demo as InboxMessage[]).map(newRow);
    s.counter = { device: 0, cloud: 0, rules: 0 };
  });
}

update((s) => (s.online = isOnline()));
void refreshNano();
console.info(`OfferLens: cloud ${cloudConfigured ? 'configured' : 'not configured (on-device only)'}`);

// Test hook for scripts/eval.mjs: runs the same pipeline as the UI on one message, off-screen.
(window as unknown as { __ol: unknown }).__ol = {
  async read(body: string, privateMode = true) {
    const m: InboxMessage = { id: 'eval', channel: 'dm', received: new Date().toISOString(), body };
    const masked = prepare(m);
    const ext = await extract(masked.text, { privateMode });
    const t = buildTriage(m, masked, ext.terms, ext.route, ext.ms);
    return { model: ext.terms, final: t.terms, column: t.column, route: ext.route, ms: ext.ms };
  },
};
