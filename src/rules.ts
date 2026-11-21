// Rule-based reader. It is the cross-check and the floor under the model:
// every number it reports is a number that literally appears in the message.

import type { Currency, DealTerms, DeliverableKind, EvidenceKey, RedFlag, UsageMedia } from './types';

export interface RuleResult {
  terms: DealTerms;
  evidence: Partial<Record<EvidenceKey, string>>; // quotes from the (masked) text
  gifted: boolean;
}

const WORD_NUM: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12,
};
export const num = (s: string): number => {
  const w = WORD_NUM[s.toLowerCase()];
  return w ?? Number(s.replace(/,/g, ''));
};

export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** The sentence that contains the match, trimmed to a readable quote. */
export function sentenceAround(text: string, index: number): string {
  let pos = 0;
  for (const s of sentences(text)) {
    const at = text.indexOf(s, pos);
    if (index >= at && index <= at + s.length) return s.length > 220 ? s.slice(0, 217) + '...' : s;
    pos = at + s.length;
  }
  return text.slice(Math.max(0, index - 40), index + 80).trim();
}

const SYMBOL: Record<string, Currency> = { $: 'USD', '€': 'EUR', '£': 'GBP', RM: 'MYR', USD: 'USD', EUR: 'EUR', GBP: 'GBP', MYR: 'MYR' };
const AMOUNT = /(?:(USD|EUR|GBP|MYR|RM|[$€£])\s?(\d[\d,]*(?:\.\d+)?)\s?(k\b)?)|(?:(\d[\d,]*(?:\.\d+)?)\s?(k\b)?\s?(USD|EUR|GBP|MYR|RM)\b)/gi;
// An amount is not "the rate" when the creator would pay it, or it only describes a product or prize.
const NOT_RATE_BEFORE = /(verification|processing|registration|activation|unlock|insurance|shipping|handling|admin|deposit)\W+(?:\w+\W+){0,2}$|(?:worth|valued? at|value of|retail|rrp|prize of|win)\W+(?:\w+\W+){0,1}$/i;
const NOT_RATE_AFTER = /^\s*(?:\)|\bin\s+(?:value|product)|\bretail|\bvalue|\bworth|\bverification|\bprocessing|\bregistration|\bactivation|\bunlock|\binsurance|\bshipping|\bfee\b|\bdeposit)/i;

export function findAmounts(text: string): { value: number; currency: Currency; index: number; end: number }[] {
  const out: { value: number; currency: Currency; index: number; end: number }[] = [];
  for (const m of text.matchAll(AMOUNT)) {
    const sym = (m[1] ?? m[6] ?? '').toUpperCase();
    const raw = m[2] ?? m[4] ?? '';
    const k = m[3] ?? m[5];
    let value = Number(raw.replace(/,/g, ''));
    if (!Number.isFinite(value)) continue;
    if (k) value *= 1000;
    out.push({ value, currency: SYMBOL[sym] ?? SYMBOL[m[1] ?? ''] ?? 'OTHER', index: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
  }
  return out;
}

const KIND_WORDS: [RegExp, DeliverableKind][] = [
  [/reels?/, 'reel'],
  [/stories|story/, 'story'],
  [/tiktoks?|shorts?|short[- ]form videos?/, 'short'],
  [/(?:youtube )?(?:integrations?|dedicated videos?|videos?|vlogs?)/, 'video'],
  [/(?:feed |static |carousel )?posts?|carousels?/, 'post'],
  [/live ?streams?|lives?/, 'live'],
  [/ugc(?: assets?| clips?)?/, 'ugc'],
];
export const COUNT = '(?<![\\d,.$€£])(\\d{1,3}|a|an|one|two|three|four|five|six|seven|eight|nine|ten)(?![\\d,])';

function findDeliverables(text: string): { kinds: DeliverableKind[]; quote?: string } {
  const kinds: DeliverableKind[] = [];
  const quotes: string[] = [];
  const seen = new Set<number>();
  for (const [kindRe, kind] of KIND_WORDS) {
    const re = new RegExp(`\\b${COUNT}\\s*(?:x\\s*)?(?:[a-z]+\\s+){0,2}?(${kindRe.source})\\b`, 'gi');
    for (const m of text.matchAll(re)) {
      const at = m.index ?? 0;
      if (seen.has(at)) continue;
      // skip "a post" appearing as a figure of speech inside a gift sentence is fine; skip years
      const n = num(m[1] ?? '1');
      if (!Number.isFinite(n) || n < 1 || n > 12) continue;
      seen.add(at);
      for (let i = 0; i < n; i++) kinds.push(kind);
      quotes.push(m[0]);
    }
  }
  return { kinds, quote: quotes.length ? quotes.join(', ') : undefined };
}

const UNIT_DAYS: Record<string, number> = { day: 1, days: 1, week: 7, weeks: 7, month: 30, months: 30, year: 365, years: 365 };
export const toDays = (n: number, unit: string) => n * (UNIT_DAYS[unit.toLowerCase()] ?? 1);
export const toMonths = (n: number, unit: string) => Math.max(1, Math.round(toDays(n, unit) / 30));

export const DUR = `${COUNT}[- ]?(days?|weeks?|months?|years?)`;

function find(text: string, re: RegExp): RegExpExecArray | null {
  return new RegExp(re.source, re.flags.replace('g', '')).exec(text);
}

function findUsage(text: string): { months: number | 'perpetual'; quote?: string } {
  const perp = find(text, /\b(perpetual(?:ly)?|in perpetuity|forever|unlimited (?:time|duration)|no (?:time|expiry) limit|indefinite(?:ly)?)\b/i);
  if (perp) return { months: 'perpetual', quote: sentenceAround(text, perp.index) };
  const kw = '\\b(?:usage|use|rights?|licen[cs]e|repost(?:ing)?|reuse|whitelist(?:ing)?|amplif\\w+|run(?:ning)?|feature[ds]?|share|clip|link|display)';
  const a = find(text, new RegExp(`${kw}[^.\\n]{0,50}?\\b${DUR}\\b`, 'i'));
  const b = find(text, new RegExp(`\\b${DUR}\\b[^.\\n]{0,30}?${kw}`, 'i'));
  const hit = [a, b].filter(Boolean).sort((x, y) => x!.index - y!.index)[0];
  if (hit) {
    const n = num(hit[1] ?? '1');
    return { months: toMonths(n, hit[2] ?? 'months'), quote: sentenceAround(text, hit.index) };
  }
  return { months: 0 };
}

function findUsageMedia(text: string): { media: UsageMedia; quote?: string } {
  const all = find(text, /\b(?:all media|any media|all channels|any and all (?:media|channels|platforms)|tv\b|television|out[- ]of[- ]home|ooh\b|billboards?|all formats|worldwide[^.]{0,30}(?:all|any) )/i);
  if (all) return { media: 'all_media', quote: sentenceAround(text, all.index) };
  const paid = find(text, /\b(?:paid (?:ads?|social|media|usage|amplification|promotion)|whitelist(?:ing)?|spark ads?|partnership ads?|boost(?:ed|ing)?|run (?:it |the \w+ )?as (?:paid )?ads?|as ads?\b|ads? usage)/i);
  if (paid) return { media: 'paid_ads', quote: sentenceAround(text, paid.index) };
  const org = find(text, /\b(?:organic(?:ally)?(?: only| usage)?|(?:repost|share|feature)[^.]{0,30}(?:our|brand)[^.]{0,15}(?:channels?|social|page|account)|your own (?:channel|feed))/i);
  if (org) return { media: 'organic_only', quote: sentenceAround(text, org.index) };
  return { media: 'unspecified' };
}

function findExclusivity(text: string): { days: number; quote?: string } {
  if (find(text, /\bno exclusiv\w*|non[- ]exclusive|exclusivity (?:is )?not required/i)) return { days: 0 };
  const a = find(text, new RegExp(`exclusiv\\w*[^.\\n]{0,50}?\\b${DUR}\\b`, 'i'));
  const b = find(text, new RegExp(`\\b${DUR}\\b[^.\\n]{0,25}?exclusiv\\w*`, 'i'));
  // unlabelled category exclusivity: "avoid mentioning other coffee brands for 3 months"
  const c = find(text, new RegExp(`\\b(?:avoid|not (?:work|partner|collaborate|post)|no (?:posts?|content) for)[^.\\n]{0,60}?\\b(?:other|competing|rival)\\b[^.\\n]{0,40}?\\b${DUR}\\b`, 'i'));
  const hit = [a, b, c].filter(Boolean).sort((x, y) => x!.index - y!.index)[0];
  if (hit) return { days: toDays(num(hit[1] ?? '0'), hit[2] ?? 'days'), quote: sentenceAround(text, hit.index) };
  return { days: 0 };
}

function findPayment(text: string): { days: number; quote?: string } {
  const net = find(text, /\bnet[- ]?(\d{1,3})\b/i);
  if (net) return { days: Number(net[1]), quote: sentenceAround(text, net.index) };
  const within = find(text, new RegExp(`(?:paid|payment|pay|invoice|payout|settled|transferred)[^.\\n]{0,60}?(?:within|in|after|upon)\\s+(?:about\\s+)?${DUR}`, 'i'));
  if (within) return { days: toDays(num(within[1] ?? '0'), within[2] ?? 'days'), quote: sentenceAround(text, within.index) };
  const after = find(text, new RegExp(`\\b${DUR}\\s+(?:after|from)\\s+(?:the\\s+)?(?:post|publication|publishing|go[- ]live|invoice|delivery|campaign)`, 'i'));
  if (after) return { days: toDays(num(after[1] ?? '0'), after[2] ?? 'days'), quote: sentenceAround(text, after.index) };
  return { days: 0 };
}

const BRAND_CUES = [
  /\b(?:from|at|with|for|of)\s+((?:[A-Z][A-Za-z0-9&'-]+)(?:\s+(?:[A-Z][A-Za-z0-9&'-]+|Co\.?|Inc\.?|Ltd\.?|Labs|Studio|Studios)){0,3})/,
  /\b[Ww]e(?:'re| are) (?:the team at |)((?:[A-Z][A-Za-z0-9&'-]+)(?:\s+[A-Z][A-Za-z0-9&'-]+){0,2})/,
  /\bhere,\s+((?:[A-Z][A-Za-z0-9&'-]+)(?:\s+[A-Z][A-Za-z0-9&'-]+){0,2})/,
];
const NOT_BRAND = /^(?:Hi|Hello|Hey|Dear|Thanks|Thank|Best|Regards|Sincerely|Please|Reels?|Stories|Instagram|TikTok|YouTube|Net|Our|Your|The|We|You|I|My|This|That|These|Those|Reply|Let|Happy)\b/;

export function guessBrand(text: string): string {
  for (const re of BRAND_CUES) {
    for (const m of text.matchAll(new RegExp(re.source, 'g'))) {
      const name = (m[1] ?? '').replace(/,+$/, '').replace(/(?<!\b(?:Co|Inc|Ltd))\.+$/, '').trim();
      if (name && !NOT_BRAND.test(name)) return name.slice(0, 40);
    }
  }
  const sig = /(?:^|\n)\s*[-—–]\s*[A-Z][a-z]+(?: [A-Z][a-z]+)?,?\s*(?:@|from|at)?\s*([A-Z][A-Za-z0-9&' .-]{2,35})\s*$/m.exec(text);
  if (sig?.[1]) return sig[1].trim();
  return 'Unknown brand';
}

/** Mask-aware: [URL_1] tokens count as links. */
export function detectFlags(text: string, t: { paid: boolean; gifted: boolean; usage: number | 'perpetual'; media: UsageMedia; excl: number; pay: number; deliverables: number }): { flag: RedFlag; quote: string }[] {
  const out: { flag: RedFlag; quote: string }[] = [];
  // `force`: the flag follows from a number, so it stays even when no quote can be found
  const add = (flag: RedFlag, re: RegExp | null, fallback?: string, force = false) => {
    if (out.some((o) => o.flag === flag)) return;
    if (re) {
      const m = find(text, re);
      if (m) out.push({ flag, quote: sentenceAround(text, m.index) });
      else if (force) out.push({ flag, quote: '' });
    } else if (fallback !== undefined) out.push({ flag, quote: fallback });
  };
  if (t.gifted && !t.paid) add('gifted_only', /\b(?:gift(?:ed)?|free product|complimentary|product only|in exchange for (?:the )?product|send you (?:our|the|a) )/i);
  if (t.usage === 'perpetual') add('perpetual_usage', /\b(?:perpetual(?:ly)?|in perpetuity|forever|unlimited (?:time|duration)|indefinite(?:ly)?)\b/i);
  if (t.media === 'all_media') add('all_media_usage', /\b(?:all media|any media|all channels|any and all|tv\b|television|out[- ]of[- ]home|ooh\b|billboards?|all formats)/i);
  if (t.excl > 30) add('long_exclusivity', /exclusiv|avoid mentioning|other [\w -]{0,20}brands/i, undefined, true);
  if (t.pay >= 60) add('slow_payment', /\bnet[- ]?\d+|within \d+|\d+ days?/i, undefined, true);
  add('upfront_fee', /\b(?:verification|processing|registration|activation|unlock|insurance|admin|handling|release)\s+fee\b|\byou (?:will )?(?:need to |must |have to |should )?(?:pay|send|transfer|cover)\b[^.]{0,40}(?:fee|deposit|\$|€|£|RM)|\bpay (?:a |the |an )?(?:small )?(?:fee|deposit)\b/i);
  add('off_platform_payment', /\b(?:gift ?cards?|crypto(?:currency)?|bitcoin|usdt|western union|money (?:order|transfer)|cash ?app|zelle)\b/i);
  add('urgency_pressure', /\b(?:within (?:the next )?\d{1,2} hours|(?:in|next) 24 hours|act (?:now|fast)|expires? (?:today|tonight|soon)|last chance|immediately|urgent(?:ly)?|today only|before midnight)\b/i);
  add('suspicious_link', /(?:\b(?:verify|log ?in|sign ?in|claim|confirm|unlock|password|credentials?|re-?activate|validate)\b[^.\n]{0,60}\[URL_\d+\]|\[URL_\d+\][^.\n]{0,40}\b(?:verify|log ?in|claim|confirm|unlock|password)\b)/i);
  add('ad_account_access', /\b(?:access to your (?:ad|instagram|tiktok|account|page)|ad account|partnership ad code|ads? authori[sz]ation|whitelist(?:ing)? access|admin access)\b/i);
  add('too_good_to_be_true', /\b(?:you(?:'ve| have) been (?:selected|chosen)|you(?:'ve| have) won|exclusive(?:ly)? selected|guaranteed (?:payout|income|\$)|prize|winner)\b/i);
  if (!t.paid && !t.gifted && t.deliverables === 0) add('vague_scope', null, text.split(/\n/)[0]?.slice(0, 120) ?? '');
  return out;
}

export function readRules(maskedText: string): RuleResult {
  const text = maskedText;
  const evidence: RuleResult['evidence'] = {};

  const gift = find(text, /\b(?:gift(?:ed|ing)?|free product|complimentary|product only|in exchange for (?:the )?product|send you (?:our|the|a) [a-z ]{0,30}(?:kit|product|set|box|bundle)|pr (?:package|kit))\b/i);
  const gifted = !!gift;
  if (gift) evidence.gifted = sentenceAround(text, gift.index);

  const amounts = findAmounts(text).filter((a) => {
    const before = text.slice(Math.max(0, a.index - 40), a.index);
    const after = text.slice(a.end, a.end + 30);
    return !NOT_RATE_BEFORE.test(before) && !NOT_RATE_AFTER.test(after);
  });
  const rate = amounts[0];
  if (rate) evidence.rate = sentenceAround(text, rate.index);

  const del = findDeliverables(text);
  if (del.quote) evidence.deliverables = del.quote;
  const usage = findUsage(text);
  if (usage.quote) evidence.usage = usage.quote;
  const media = findUsageMedia(text);
  if (media.quote && !evidence.usage) evidence.usage = media.quote;
  const excl = findExclusivity(text);
  if (excl.quote) evidence.exclusivity = excl.quote;
  const pay = findPayment(text);
  if (pay.quote) evidence.payment = pay.quote;

  const paid = !!rate;
  const flagHits = detectFlags(text, { paid, gifted, usage: usage.months, media: media.media, excl: excl.days, pay: pay.days, deliverables: del.kinds.length });
  for (const f of flagHits) evidence[f.flag] = f.quote;

  const terms: DealTerms = {
    brand_alias: guessBrand(text),
    paid,
    rate_amount: rate?.value ?? 0,
    currency: rate?.currency ?? 'NONE',
    deliverables: del.kinds,
    usage_months: usage.months,
    usage_media: media.media,
    exclusivity_days: excl.days,
    payment_days: pay.days,
    disclosure_required: paid || gifted,
    red_flags: flagHits.map((f) => f.flag),
  };
  return { terms, evidence, gifted };
}
