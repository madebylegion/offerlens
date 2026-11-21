// Scoring is plain code. The model never decides alone where a deal lands.

import type { Column, DealTerms, FlagInfo, RedFlag } from './types';

export const SCAM_FLAGS: RedFlag[] = ['upfront_fee', 'suspicious_link', 'too_good_to_be_true', 'off_platform_payment'];

export const FLAG_PENALTY: Record<RedFlag, number> = {
  gifted_only: 35,
  perpetual_usage: 30,
  all_media_usage: 20,
  long_exclusivity: 15,
  slow_payment: 10,
  upfront_fee: 60,
  off_platform_payment: 40,
  urgency_pressure: 15,
  suspicious_link: 50,
  ad_account_access: 15,
  too_good_to_be_true: 35,
  vague_scope: 20,
};

export const FLAG_LABEL: Record<RedFlag, string> = {
  gifted_only: 'Free product only',
  perpetual_usage: 'Rights forever',
  all_media_usage: 'All-media rights',
  long_exclusivity: 'Long exclusivity',
  slow_payment: 'Slow payment',
  upfront_fee: 'Asks you to pay first',
  off_platform_payment: 'Odd payment method',
  urgency_pressure: 'Pressure to rush',
  suspicious_link: 'Suspicious link',
  ad_account_access: 'Wants ad-account access',
  too_good_to_be_true: 'Too good to be true',
  vague_scope: 'Vague offer',
};

export const FLAG_WHY: Record<RedFlag, string> = {
  gifted_only: 'No money is offered. Product alone rarely covers the work, and it still triggers a disclosure duty.',
  perpetual_usage: 'The brand keeps the right to use your content with no end date. Ask for a fixed term.',
  all_media_usage: 'Rights cover TV, out-of-home or "all media". That is priced far above organic reposting.',
  long_exclusivity: 'You could not work with competing brands for more than a month. Exclusivity should be paid for.',
  slow_payment: 'Net 60 or longer means you finance the brand for two months or more.',
  upfront_fee: 'Real brands pay creators. They do not ask creators to pay a fee to receive a deal.',
  off_platform_payment: 'Gift cards, crypto and money transfers are hard to trace or reverse.',
  urgency_pressure: 'A short deadline is a classic way to stop you from checking the sender.',
  suspicious_link: 'The message asks you to verify, claim or log in through a link.',
  ad_account_access: 'Access to your accounts or ad rights goes beyond posting a video.',
  too_good_to_be_true: 'Prizes, "selected" wording or a large payout with no brief is a common scam opener.',
  vague_scope: 'No deliverables or fee are stated, so there is nothing to price yet.',
};

export function score(t: DealTerms, flags: RedFlag[]): number {
  let s = 100;
  for (const f of new Set(flags)) s -= FLAG_PENALTY[f];
  if (t.exclusivity_days > 90) s -= 10;
  if (t.payment_days >= 90) s -= 8;
  if (t.usage_media === 'paid_ads') s -= 8;
  if (t.usage_media === 'unspecified' && t.usage_months !== 0) s -= 3;
  if (typeof t.usage_months === 'number' && t.usage_months > 6) s -= 6;
  if (typeof t.usage_months === 'number' && t.usage_months > 12) s -= 6;
  if (t.exclusivity_days > 14 && t.exclusivity_days <= 30) s -= 5;
  if (t.paid && t.payment_days > 30 && t.payment_days < 60) s -= 4;
  if (!t.paid) s -= 10;
  return Math.max(0, Math.min(100, s));
}

export function classify(t: DealTerms, flags: RedFlag[]): { column: Column; verdict: 'scam' | 'trap' | 'fair'; score: number } {
  const s = score(t, flags);
  const f = new Set(flags);
  const scam = SCAM_FLAGS.some((x) => f.has(x));
  const grabsRights = f.has('perpetual_usage') && (f.has('all_media_usage') || f.has('gifted_only'));
  if (scam) return { column: 'walk', verdict: 'scam', score: s };
  if (grabsRights || s < 40) return { column: 'walk', verdict: 'trap', score: s };
  const clean =
    t.paid &&
    f.size === 0 &&
    t.usage_media !== 'paid_ads' &&
    t.usage_media !== 'all_media' &&
    (t.usage_months === 0 || (typeof t.usage_months === 'number' && t.usage_months <= 3)) &&
    t.exclusivity_days <= 14 &&
    (t.payment_days === 0 || t.payment_days <= 30);
  return { column: clean ? 'worth' : 'negotiate', verdict: 'fair', score: s };
}

export const toFlagInfo = (flags: RedFlag[], by: 'rules' | 'model'): FlagInfo[] => flags.map((flag) => ({ flag, by }));

/** Board order: column first, then higher score first, then id for a stable sort. */
export function rank<T extends { column: Column; score: number; message: { id: string } }>(items: T[]): T[] {
  const order: Record<Column, number> = { worth: 0, negotiate: 1, walk: 2 };
  return [...items].sort((a, b) => order[a.column] - order[b.column] || b.score - a.score || a.message.id.localeCompare(b.message.id));
}
