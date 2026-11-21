// Shared types. Numeric fields use 0 for "not stated / none", so the model, the
// rules and the UI never have to agree on what null means.

export const DELIVERABLE_KINDS = ['reel', 'story', 'post', 'video', 'short', 'live', 'ugc', 'other'] as const;
export type DeliverableKind = (typeof DELIVERABLE_KINDS)[number];

export const USAGE_MEDIA = ['organic_only', 'paid_ads', 'all_media', 'unspecified'] as const;
export type UsageMedia = (typeof USAGE_MEDIA)[number];

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'MYR', 'OTHER', 'NONE'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const RED_FLAGS = [
  'gifted_only',
  'perpetual_usage',
  'all_media_usage',
  'long_exclusivity',
  'slow_payment',
  'upfront_fee',
  'off_platform_payment',
  'urgency_pressure',
  'suspicious_link',
  'ad_account_access',
  'too_good_to_be_true',
  'vague_scope',
] as const;
export type RedFlag = (typeof RED_FLAGS)[number];

export interface DealTerms {
  brand_alias: string;
  paid: boolean; // money is offered to the creator
  rate_amount: number; // headline fee as written, 0 = none
  currency: Currency;
  deliverables: DeliverableKind[]; // one entry per piece
  usage_months: number | 'perpetual'; // 0 = not stated
  usage_media: UsageMedia;
  exclusivity_days: number; // 0 = none / not stated
  payment_days: number; // 0 = not stated
  disclosure_required: boolean; // any pay or free product means a disclosure duty
  red_flags: RedFlag[];
}

export type Column = 'worth' | 'negotiate' | 'walk';

export type Route = 'ON_DEVICE' | 'IN_CLOUD' | 'RULES_ONLY';

export interface InboxMessage {
  id: string;
  channel: 'dm' | 'email';
  from_handle?: string;
  from_email?: string;
  subject?: string;
  received: string; // ISO date
  body: string;
}

export interface FlagInfo {
  flag: RedFlag;
  by: 'rules' | 'model';
}

export interface Triage {
  message: InboxMessage;
  terms: DealTerms;
  flags: FlagInfo[];
  evidence: Partial<Record<EvidenceKey, string>>; // unmasked source quotes
  issues: string[]; // validation notes, e.g. "rate not found in message"
  score: number; // 0-100
  column: Column;
  verdict: 'scam' | 'trap' | 'fair';
  route: Route;
  ms: number;
}

export type EvidenceKey =
  | 'rate'
  | 'usage'
  | 'exclusivity'
  | 'payment'
  | 'deliverables'
  | 'gifted'
  | RedFlag;
