// One schema definition, two encodings: the Prompt API needs a plain JSON Schema in
// onDeviceParams.promptOptions.responseConstraint, the cloud needs the SDK's Schema
// objects in generationConfig.responseSchema. Chrome's on-device model ignores the second.

import { Schema, type TypedSchema } from 'firebase/ai';
import {
  CURRENCIES,
  DELIVERABLE_KINDS,
  RED_FLAGS,
  USAGE_MEDIA,
  type Currency,
  type DealTerms,
  type DeliverableKind,
  type RedFlag,
  type UsageMedia,
} from './types';

export const EXTRACT_SCHEMA = {
  type: 'object',
  properties: {
    brand_alias: { type: 'string' },
    paid: { type: 'boolean' },
    rate_amount: { type: 'number' },
    currency: { type: 'string', enum: [...CURRENCIES] },
    deliverables: { type: 'array', items: { type: 'string', enum: [...DELIVERABLE_KINDS] } },
    usage_perpetual: { type: 'boolean' },
    usage_months: { type: 'integer' },
    usage_media: { type: 'string', enum: [...USAGE_MEDIA] },
    exclusivity_days: { type: 'integer' },
    payment_days: { type: 'integer' },
    disclosure_required: { type: 'boolean' },
    red_flags: { type: 'array', items: { type: 'string', enum: [...RED_FLAGS] } },
  },
  required: [
    'brand_alias',
    'paid',
    'rate_amount',
    'currency',
    'deliverables',
    'usage_perpetual',
    'usage_months',
    'usage_media',
    'exclusivity_days',
    'payment_days',
    'disclosure_required',
    'red_flags',
  ],
} as const;

type JsonSchema = { type: string; enum?: readonly string[]; items?: JsonSchema; properties?: Record<string, JsonSchema>; required?: readonly string[] };

export function toSdkSchema(s: JsonSchema): TypedSchema {
  switch (s.type) {
    case 'string':
      return s.enum ? Schema.enumString({ enum: [...s.enum] }) : (Schema.string());
    case 'boolean':
      return Schema.boolean();
    case 'integer':
      return Schema.integer();
    case 'number':
      return Schema.number();
    case 'array':
      return Schema.array({ items: toSdkSchema(s.items as JsonSchema) });
    default: {
      const props: Record<string, TypedSchema> = {};
      for (const [k, v] of Object.entries(s.properties ?? {})) props[k] = toSdkSchema(v);
      return Schema.object({ properties: props, optionalProperties: [] });
    }
  }
}

export function extractionPrompt(maskedMessage: string): string {
  return [
    'You read one message that a brand sent to a content creator and fill in a form about the deal.',
    'Use only what the message says. Use 0 for any number that is not stated.',
    'paid is true only when money is offered to the creator. deliverables has one entry per piece of content.',
    'usage_months is a number of MONTHS: convert days and weeks (30 days is 1, 90 days is 3, 8 weeks is 2). exclusivity_days and payment_days are DAYS.',
    'usage_perpetual is true only for words like "perpetual" or "forever". red_flags lists only problems the message really shows.',
    'Message:',
    '"""',
    maskedMessage,
    '"""',
  ].join('\n');
}

const asNum = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);

/** Defensive parse of whatever the model returned. Returns null when it is not a JSON object. */
export function parseModelJson(text: string): DealTerms | null {
  const clean = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let raw: unknown;
  try {
    raw = JSON.parse(clean);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const list = <T extends string>(v: unknown, allowed: readonly T[]): T[] => (Array.isArray(v) ? v.filter((x): x is T => allowed.includes(x as T)) : []);
  const rate = asNum(o.rate_amount);
  const months = asNum(o.usage_months);
  return {
    brand_alias: typeof o.brand_alias === 'string' ? o.brand_alias.trim().slice(0, 60) : '',
    paid: rate > 0 && o.paid !== false,
    rate_amount: rate,
    currency: pick<Currency>(o.currency, CURRENCIES, 'NONE'),
    deliverables: list<DeliverableKind>(o.deliverables, DELIVERABLE_KINDS).slice(0, 12),
    usage_months: o.usage_perpetual === true ? 'perpetual' : Math.round(months),
    usage_media: pick<UsageMedia>(o.usage_media, USAGE_MEDIA, 'unspecified'),
    exclusivity_days: Math.round(asNum(o.exclusivity_days)),
    payment_days: Math.round(asNum(o.payment_days)),
    disclosure_required: o.disclosure_required === true,
    red_flags: list<RedFlag>(o.red_flags, RED_FLAGS),
  };
}
