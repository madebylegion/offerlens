import { describe, expect, test } from 'vitest';
import inbox from '../demo/inbox.json';
import golden from './golden/rank.json';
import { hasContact, mask, unmask } from '../src/mask';
import { rank } from '../src/rank';
import { buildTriage, prepare, triageWithRules } from '../src/triage';
import { parseModelJson } from '../src/schema';
import { validate } from '../src/validate';
import type { DealTerms, InboxMessage } from '../src/types';

const messages = inbox as InboxMessage[];

const blank: DealTerms = {
  brand_alias: 'Northbay Bottle Co',
  paid: false,
  rate_amount: 0,
  currency: 'NONE',
  deliverables: [],
  usage_months: 0,
  usage_media: 'unspecified',
  exclusivity_days: 0,
  payment_days: 0,
  disclosure_required: false,
  red_flags: [],
};

describe('mask()', () => {
  test('known-bad control: a raw demo message still carries contacts, so the detector would fail it', () => {
    for (const m of messages.filter((x) => /@/.test(x.body))) expect(hasContact(m.body)).toBe(true);
  });
  test('masked text of all 12 demo messages (with subject) has no email, handle, link or phone', () => {
    for (const m of messages) {
      const p = prepare(m);
      expect(hasContact(p.text), `${m.id}: ${p.text}`).toBe(false);
      for (const original of Object.values(p.map)) expect(p.text).not.toContain(original);
    }
  });
  test('round trip and stable tokens', () => {
    const raw = 'Mail a@example.com, again a@example.com, call +1 555-010-0199 or @demo_x at www.demo.example.net/x?y=1.';
    const m = mask(raw);
    expect(m.text).toBe('Mail [EMAIL_1], again [EMAIL_1], call [PHONE_1] or [HANDLE_1] at [URL_1].');
    expect(unmask(m.text, m.map)).toBe(raw);
  });
  test('does not eat dates, money or durations', () => {
    const raw = 'Paid $1,800 on 2026-11-12, net 15, 60 days, 12 months.';
    expect(mask(raw).text).toBe(raw);
  });
  test('account-like numbers are masked', () => {
    expect(mask('Send to GB82WEST12345698765432 now').text).toContain('[ACCOUNT_1]');
  });
});

describe('validate()', () => {
  const text = 'We pay $1,800 for 1 Reel. Net 15. Usage 60 days. Exclusivity 7 days.';
  test('keeps numbers that are in the message (days, weeks and months convert)', () => {
    const v = validate({ ...blank, rate_amount: 1800, currency: 'USD', payment_days: 15, usage_months: 2, exclusivity_days: 7, brand_alias: 'Reel' }, text);
    expect(v.issues).toEqual([]);
    expect(v.terms.paid).toBe(true);
  });
  test('known-bad: an amount, term or day count that is not in the message is dropped', () => {
    const v = validate({ ...blank, rate_amount: 9999, currency: 'USD', payment_days: 45, usage_months: 9, exclusivity_days: 90, brand_alias: 'Reel' }, text);
    expect(v.terms.rate_amount).toBe(0);
    expect(v.terms.payment_days).toBe(0);
    expect(v.terms.usage_months).toBe(0);
    expect(v.terms.exclusivity_days).toBe(0);
    expect(v.issues.length).toBe(4);
  });
  test('"perpetual" needs the word', () => {
    expect(validate({ ...blank, usage_months: 'perpetual', brand_alias: 'Reel' }, text).terms.usage_months).toBe(0);
    expect(validate({ ...blank, usage_months: 'perpetual', brand_alias: 'Reel' }, text + ' Rights in perpetuity.').terms.usage_months).toBe('perpetual');
  });
  test('invented brand is replaced by one from the text', () => {
    expect(validate({ ...blank, brand_alias: 'Totally Made Up' }, 'Hi from Northbay Bottle Co. We pay $5.').terms.brand_alias).toBe('Northbay Bottle Co');
  });
});

describe('model reply parsing', () => {
  test('valid JSON maps to DealTerms; junk is null', () => {
    const t = parseModelJson('{"brand_alias":"X","paid":true,"rate_amount":500,"currency":"USD","deliverables":["reel","bogus"],"usage_perpetual":false,"usage_months":3,"usage_media":"organic_only","exclusivity_days":0,"payment_days":30,"disclosure_required":true,"red_flags":["slow_payment","nope"]}');
    expect(t?.deliverables).toEqual(['reel']);
    expect(t?.red_flags).toEqual(['slow_payment']);
    expect(t?.usage_months).toBe(3);
    expect(parseModelJson('not json')).toBeNull();
    expect(parseModelJson('[1,2]')).toBeNull();
  });
});

describe('rules + reconcile + rank on the 12 demo messages', () => {
  const triaged = messages.map(triageWithRules);

  test('rank() order is fixed by the golden file', () => {
    const got = rank(triaged).map((t) => ({ id: t.message.id, column: t.column, score: t.score }));
    expect(got).toEqual(golden);
  });
  test('known-bad: the golden file really bites (a swapped pair differs)', () => {
    const swapped = [...golden];
    [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
    expect(swapped).not.toEqual(golden);
  });
  test('three worth it, four negotiable, five walk-aways (3 traps + 2 scams)', () => {
    const count = (c: string) => triaged.filter((t) => t.column === c).length;
    expect([count('worth'), count('negotiate'), count('walk')]).toEqual([3, 4, 5]);
    expect(triaged.filter((t) => t.verdict === 'scam').map((t) => t.message.id)).toEqual(['m11', 'm12']);
    expect(triaged.filter((t) => t.verdict === 'trap').map((t) => t.message.id)).toEqual(['m08', 'm09', 'm10']);
  });
  test('every number the rules report appears in the message', () => {
    for (const t of triaged) {
      const text = t.message.body;
      if (t.terms.rate_amount) expect(text.replace(/,/g, '')).toContain(String(t.terms.rate_amount));
      if (t.terms.payment_days) expect(text).toMatch(new RegExp(`net ${t.terms.payment_days}\\b|${t.terms.payment_days} days`, 'i'));
    }
  });
  test('evidence quotes are unmasked source sentences', () => {
    const t = triaged.find((x) => x.message.id === 'm01')!;
    expect(t.evidence.rate).toContain('$1,800');
    const scam = triaged.find((x) => x.message.id === 'm11')!;
    expect(scam.evidence.suspicious_link).toContain('https://claim-orbitry.example.net/verify');
  });
});

describe('model can add flags, never scam verdicts, never numbers the text lacks', () => {
  const m = messages[0]!; // m01: clean
  const masked = prepare(m);
  test('a hallucinated scam flag and a fake number are ignored', () => {
    const t = buildTriage(m, masked, { ...blank, rate_amount: 99999, currency: 'USD', red_flags: ['upfront_fee', 'urgency_pressure'] }, 'ON_DEVICE', 10);
    expect(t.terms.rate_amount).toBe(1800);
    expect(t.column).toBe('negotiate'); // a model-only flag still removes "worth it"
    expect(t.flags.map((f) => f.flag)).toEqual(['urgency_pressure']);
    expect(t.flags[0]!.by).toBe('model');
    expect(t.issues.some((i) => i.includes('upfront_fee'))).toBe(true);
  });
  test('the model fills what rules cannot read (m07: "avoid other brands for 3 months")', () => {
    const m07 = messages.find((x) => x.id === 'm07')!;
    const t = buildTriage(m07, prepare(m07), { ...blank, brand_alias: 'Sunrow Coffee', exclusivity_days: 90 }, 'ON_DEVICE', 10);
    expect(t.terms.exclusivity_days).toBe(90);
    expect(t.flags.some((f) => f.flag === 'long_exclusivity')).toBe(true);
  });
});

describe('rules read an unlabelled category exclusivity', () => {
  test('m07: "avoid mentioning other coffee brands for 3 months" is 90 days, with rules alone', () => {
    const t = triageWithRules(messages.find((x) => x.id === 'm07')!);
    expect(t.terms.exclusivity_days).toBe(90);
    expect(t.flags.some((f) => f.flag === 'long_exclusivity')).toBe(true);
  });
});

describe('usage months are never a bare number', () => {
  const text = 'We would feature it on our own channels for 90 days. Payment net 30. $2,000 for 1 video.';
  test('known-bad: a model that copies "90" from "90 days" into months is rejected', () => {
    const v = validate({ ...blank, brand_alias: 'X', rate_amount: 2000, currency: 'USD', usage_months: 90 }, text);
    expect(v.terms.usage_months).toBe(0);
  });
  test('rules read "feature it ... for 90 days" as 3 months', () => {
    const t = triageWithRules({ id: 'x', channel: 'dm', received: '2026-11-01', body: text });
    expect(t.terms.usage_months).toBe(3);
  });
});
