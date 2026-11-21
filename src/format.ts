import type { Currency, DealTerms, DeliverableKind } from './types';

export const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

const SYM: Record<Currency, string> = { USD: '$', EUR: '€', GBP: '£', MYR: 'RM ', OTHER: '', NONE: '' };

export function money(n: number, cur: Currency): string {
  if (!n) return 'No cash fee';
  const s = n >= 1000 ? n.toLocaleString('en-US') : String(n);
  return `${SYM[cur]}${s}`;
}

const PLURAL: Record<DeliverableKind, [string, string]> = {
  reel: ['reel', 'reels'],
  story: ['story', 'stories'],
  post: ['post', 'posts'],
  video: ['video', 'videos'],
  short: ['short', 'shorts'],
  live: ['livestream', 'livestreams'],
  ugc: ['UGC asset', 'UGC assets'],
  other: ['item', 'items'],
};

export function deliverablesText(kinds: DeliverableKind[]): string {
  if (!kinds.length) return 'Deliverables not stated';
  const counts = new Map<DeliverableKind, number>();
  for (const k of kinds) counts.set(k, (counts.get(k) ?? 0) + 1);
  return [...counts].map(([k, n]) => `${n} ${PLURAL[k][n === 1 ? 0 : 1]}`).join(' · ');
}

const MEDIA = { organic_only: 'organic only', paid_ads: 'paid ads', all_media: 'all media', unspecified: 'media not stated' } as const;

export function usageText(t: DealTerms): string {
  if (t.usage_months === 'perpetual') return `forever, ${MEDIA[t.usage_media]}`;
  if (t.usage_months === 0) return t.usage_media === 'unspecified' ? 'not stated' : MEDIA[t.usage_media];
  return `${t.usage_months} mo, ${MEDIA[t.usage_media]}`;
}

export function daysText(d: number, none = 'none stated'): string {
  if (!d) return none;
  if (d >= 60 && d % 30 === 0) return `${d} days (${d / 30} mo)`;
  return `${d} days`;
}

export const payText = (d: number) => (d ? `net ${d}` : 'not stated');

export function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(+d) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function highlight(text: string, quotes: string[]): string {
  let out = esc(text);
  for (const q of quotes.filter((x) => x && x.length > 8)) {
    const e = esc(q);
    if (out.includes(e)) out = out.replace(e, `<mark>${e}</mark>`);
  }
  return out;
}
