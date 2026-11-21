// validate(): a model-claimed number is kept only if it can be found in the message.
// reconcile(): rules win on numbers they can see; the model fills what rules cannot read.

import { DELIVERABLE_KINDS, RED_FLAGS, USAGE_MEDIA, type DealTerms, type EvidenceKey, type FlagInfo, type RedFlag } from './types';
import { DUR, detectFlags, findAmounts, guessBrand, num, sentenceAround, toDays, toMonths, type RuleResult } from './rules';
import { SCAM_FLAGS } from './rank';

const NUMBER_TOKEN = /(?<![\d,.])(\d[\d,]*(?:\.\d+)?)(?![\d])/g;

function standaloneNumbers(text: string): Set<number> {
  const out = new Set<number>();
  for (const m of text.matchAll(NUMBER_TOKEN)) out.add(Number((m[1] ?? '').replace(/,/g, '')));
  for (const w of ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'twelve']) {
    if (new RegExp(`\\b${w}\\b`, 'i').test(text)) out.add(num(w));
  }
  return out;
}

function durations(text: string): { n: number; unit: string }[] {
  return [...text.matchAll(new RegExp(`\\b${DUR}\\b`, 'gi'))].map((m) => ({ n: num(m[1] ?? '1'), unit: m[2] ?? 'days' }));
}

export function allowedDays(text: string): Set<number> {
  const s = standaloneNumbers(text);
  for (const d of durations(text)) s.add(toDays(d.n, d.unit));
  return s;
}

// Months must come from a duration ("3 months", "90 days"), never a bare number: Nano
// copies "90" out of "90 days" into usage_months, which would read as 90 months.
export function allowedMonths(text: string): Set<number> {
  const s = new Set<number>();
  for (const d of durations(text)) s.add(toMonths(d.n, d.unit));
  return s;
}

const PERPETUAL = /\b(?:perpetual(?:ly)?|in perpetuity|forever|unlimited (?:time|duration)|indefinite(?:ly)?)\b/i;

export interface Validated {
  terms: DealTerms;
  issues: string[];
}

/** Drop or repair anything in `claimed` that the message does not support. */
export function validate(claimed: DealTerms, text: string): Validated {
  const issues: string[] = [];
  const t: DealTerms = { ...claimed, deliverables: [...claimed.deliverables], red_flags: [...claimed.red_flags] };

  if (t.rate_amount > 0 && !findAmounts(text).some((a) => Math.abs(a.value - t.rate_amount) < 0.5)) {
    issues.push(`Model read a fee of ${t.rate_amount}, which is not in the message. Ignored.`);
    t.rate_amount = 0;
    t.currency = 'NONE';
  }
  if (t.rate_amount === 0) t.currency = 'NONE';
  if (t.usage_months === 'perpetual') {
    if (!PERPETUAL.test(text)) {
      issues.push('Model read "perpetual" usage, but the message does not say so. Ignored.');
      t.usage_months = 0;
    }
  } else if (t.usage_months > 0 && !allowedMonths(text).has(t.usage_months)) {
    issues.push(`Model read ${t.usage_months} months of usage, which is not in the message. Ignored.`);
    t.usage_months = 0;
  }
  const days = allowedDays(text);
  if (t.exclusivity_days > 0 && !days.has(t.exclusivity_days)) {
    issues.push(`Model read ${t.exclusivity_days} days of exclusivity, which is not in the message. Ignored.`);
    t.exclusivity_days = 0;
  }
  if (t.payment_days > 0 && !days.has(t.payment_days)) {
    issues.push(`Model read ${t.payment_days} days to pay, which is not in the message. Ignored.`);
    t.payment_days = 0;
  }
  if (!t.brand_alias || !text.toLowerCase().includes(t.brand_alias.toLowerCase())) {
    if (t.brand_alias) issues.push(`Brand "${t.brand_alias}" is not in the message. Replaced.`);
    t.brand_alias = guessBrand(text);
  }
  t.deliverables = t.deliverables.filter((d) => (DELIVERABLE_KINDS as readonly string[]).includes(d));
  t.red_flags = t.red_flags.filter((f) => (RED_FLAGS as readonly string[]).includes(f));
  if (!(USAGE_MEDIA as readonly string[]).includes(t.usage_media)) t.usage_media = 'unspecified';
  t.paid = t.rate_amount > 0 ? true : false;
  return { terms: t, issues };
}

function quoteFor(text: string, needle: RegExp): string | undefined {
  const m = needle.exec(text);
  return m ? sentenceAround(text, m.index) : undefined;
}

export interface Reconciled {
  terms: DealTerms;
  flags: FlagInfo[];
  evidence: Partial<Record<EvidenceKey, string>>;
  issues: string[];
}

export function reconcile(rules: RuleResult, model: DealTerms | null, text: string): Reconciled {
  const issues: string[] = [];
  const r = rules.terms;
  const evidence = { ...rules.evidence };
  const final: DealTerms = { ...r, deliverables: [...r.deliverables], red_flags: [] };
  let modelFlags: RedFlag[] = [];
  let gifted = rules.gifted;

  if (model) {
    const v = validate(model, text);
    issues.push(...v.issues);
    const m = v.terms;
    if (r.brand_alias === 'Unknown brand' && m.brand_alias !== 'Unknown brand') final.brand_alias = m.brand_alias;
    if (r.rate_amount === 0 && m.rate_amount > 0) {
      final.rate_amount = m.rate_amount;
      final.currency = m.currency === 'NONE' ? 'OTHER' : m.currency;
      evidence.rate = quoteFor(text, new RegExp(String(m.rate_amount).replace(/(\d)(?=(\d{3})+$)/g, '$1,?'))) ?? evidence.rate;
    }
    if (final.deliverables.length === 0 && m.deliverables.length > 0) final.deliverables = m.deliverables;
    if (r.usage_months === 0 && m.usage_months !== 0) final.usage_months = m.usage_months;
    if (r.usage_media === 'unspecified' && m.usage_media !== 'unspecified') final.usage_media = m.usage_media;
    if (r.exclusivity_days === 0 && m.exclusivity_days > 0) final.exclusivity_days = m.exclusivity_days;
    if (r.payment_days === 0 && m.payment_days > 0) final.payment_days = m.payment_days;
    modelFlags = m.red_flags;
    if (m.red_flags.includes('gifted_only') && !final.rate_amount) gifted = true;
  }

  final.paid = final.rate_amount > 0;
  final.disclosure_required = final.paid || gifted;

  // rules re-derive flags from the FINAL numbers, so a model-supplied number still gets its flag
  const ruleHits = detectFlags(text, {
    paid: final.paid,
    gifted,
    usage: final.usage_months,
    media: final.usage_media,
    excl: final.exclusivity_days,
    pay: final.payment_days,
    deliverables: final.deliverables.length,
  });
  for (const h of ruleHits) evidence[h.flag] = h.quote;
  const flags: FlagInfo[] = ruleHits.map((h) => ({ flag: h.flag, by: 'rules' }));

  // the model may only ADD flags, and only ones its own numbers do not contradict
  const consistent: Partial<Record<RedFlag, boolean>> = {
    perpetual_usage: final.usage_months === 'perpetual',
    all_media_usage: final.usage_media === 'all_media',
    long_exclusivity: final.exclusivity_days > 30,
    slow_payment: final.payment_days >= 60,
    gifted_only: !final.paid,
  };
  for (const f of modelFlags) {
    if (flags.some((x) => x.flag === f)) continue;
    if (SCAM_FLAGS.includes(f)) {
      issues.push(`Model suggested "${f}" but no rule found it in the text. Not used.`);
      continue;
    }
    if (f in consistent && !consistent[f]) continue;
    flags.push({ flag: f, by: 'model' });
  }
  final.red_flags = flags.map((f) => f.flag);
  return { terms: final, flags, evidence, issues };
}
