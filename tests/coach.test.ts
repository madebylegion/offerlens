import { describe, expect, test } from 'vitest';
import { COACH_SYSTEM, COACH_TEMPERATURE, seedPrompt } from '../src/coach';
import type { DealTerms } from '../src/types';

const terms: DealTerms = {
  brand_alias: 'Northbay Bottle Co',
  paid: true,
  rate_amount: 300,
  currency: 'USD',
  deliverables: ['video'],
  usage_months: 12,
  usage_media: 'paid_ads',
  exclusivity_days: 90,
  payment_days: 90,
  disclosure_required: true,
  red_flags: [],
};

describe('coach floor', () => {
  test('the coach is told never to go under creator_minimum_fee and never to call it fair', () => {
    const seed = seedPrompt(terms, 1500);
    expect(seed).toContain('"creator_minimum_fee": 1500');
    expect(seed).toMatch(/at least 1500/);
    expect(seed).not.toMatch(/what is fair/i);
    expect(COACH_SYSTEM).toMatch(/never propose[^.]*below it/);
    expect(COACH_SYSTEM).toMatch(/never call an offer below it/);
    expect(COACH_TEMPERATURE).toBeLessThanOrEqual(0.25);
    // known-bad control: without a floor the hard rule must not name a number
    expect(seedPrompt(terms)).not.toMatch(/at least \d/);
  });
});
