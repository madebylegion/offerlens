import type { Availability } from './ai';
import type { Coach, SharedPayload } from './coach';
import type { InboxMessage, Triage } from './types';

export interface Row {
  message: InboxMessage;
  status: 'queued' | 'reading' | 'done' | 'blocked' | 'error';
  triage?: Triage;
  error?: string;
  shared: SharedPayload[]; // everything the coach sent to the cloud for this deal
  coach?: Coach;
  coachBusy: boolean;
  coachError?: string;
  floor: string; // creator's minimum fee, as typed
  draft: string; // coach composer text
}

export interface State {
  view: 'inbox' | 'board';
  rows: Row[];
  nano: Availability | 'checking';
  downloadPct: number | null;
  online: boolean;
  privateMode: boolean;
  counter: { device: number; cloud: number; rules: number };
  queue: { running: boolean; done: number; total: number };
  selectedId?: string;
  tab: 'deal' | 'coach';
  form: { from: string; body: string };
  fresh: Set<string>;
}

export const state: State = {
  view: 'inbox',
  rows: [],
  nano: 'checking',
  downloadPct: null,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  privateMode: false,
  counter: { device: 0, cloud: 0, rules: 0 },
  queue: { running: false, done: 0, total: 0 },
  tab: 'deal',
  form: { from: '', body: '' },
  fresh: new Set(),
};

let listener: () => void = () => {};
export const onChange = (fn: () => void) => (listener = fn);
export function update(fn?: (s: State) => void) {
  fn?.(state);
  listener();
}
