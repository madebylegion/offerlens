// A2: the router with a stubbed SDK. Nothing here touches Firebase or Chrome.
import { beforeEach, describe, expect, test, vi } from 'vitest';

const calls: { params: any; ai: string }[] = [];
const sent: string[] = [];
const chatSent: string[] = [];
let inferenceSource: string | undefined = 'on_device';

vi.mock('firebase/ai', () => ({
  InferenceMode: { PREFER_ON_DEVICE: 'prefer_on_device', ONLY_ON_DEVICE: 'only_on_device', ONLY_IN_CLOUD: 'only_in_cloud', PREFER_IN_CLOUD: 'prefer_in_cloud' },
  Schema: new Proxy({}, { get: (_t, k) => (arg?: unknown) => ({ kind: String(k), arg }) }),
  getGenerativeModel: (ai: { name: string }, params: unknown) => {
    calls.push({ params, ai: ai.name });
    return {
      initializeDeviceModel: async () => {},
      generateContent: async (prompt: string) => {
        sent.push(prompt);
        return { response: { inferenceSource, text: () => '{"brand_alias":"Northbay Bottle Co","paid":true,"rate_amount":1800,"currency":"USD","deliverables":["reel"],"usage_perpetual":false,"usage_months":2,"usage_media":"organic_only","exclusivity_days":0,"payment_days":15,"disclosure_required":true,"red_flags":[]}' } };
      },
      startChat: () => ({
        sendMessage: async (t: string) => {
          chatSent.push(t);
          return { response: { text: () => 'ok' } };
        },
      }),
    };
  },
}));
vi.mock('../src/firebase', () => ({
  cloudConfigured: true,
  deviceAI: () => ({ name: 'device' }),
  cloudAI: () => ({ name: 'cloud' }),
}));

import inbox from '../demo/inbox.json';
import { COACH_MODEL, NeedsOnDevice, extract, extractionModel } from '../src/ai';
import { Coach, COACH_SYSTEM, buildCoachModel, seedPrompt } from '../src/coach';
import { hasContact } from '../src/mask';
import { prepare, triageWithRules } from '../src/triage';
import type { InboxMessage } from '../src/types';

const messages = inbox as InboxMessage[];
const setNano = (a: string | undefined) => {
  (globalThis as any).LanguageModel = a ? { availability: async () => a } : undefined;
};

beforeEach(() => {
  sent.length = 0;
  chatSent.length = 0;
  inferenceSource = 'on_device';
});

describe('extraction routing', () => {
  test('normal mode builds PREFER_ON_DEVICE with BOTH the on-device constraint and the cloud schema', async () => {
    setNano('available');
    const m = messages[0]!;
    const r = await extract(prepare(m).text, { privateMode: false });
    expect(r.route).toBe('ON_DEVICE');
    const c = calls.find((x) => x.params.mode === 'prefer_on_device')!;
    expect(c.ai).toBe('cloud');
    expect(c.params.onDeviceParams.promptOptions.responseConstraint.type).toBe('object');
    expect(c.params.inCloudParams.generationConfig.responseSchema).toBeTruthy();
    expect(c.params.inCloudParams.generationConfig.responseMimeType).toBe('application/json');
  });

  test('Private mode builds ONLY_ON_DEVICE on the app instance without App Check', async () => {
    setNano('available');
    await extract(prepare(messages[0]!).text, { privateMode: true });
    expect(extractionModel('ONLY_ON_DEVICE')).toBeTruthy();
    const c = calls.find((x) => x.params.mode === 'only_on_device')!;
    expect(c.ai).toBe('device');
  });

  test('known-bad control: Private mode with no Nano sends nothing and throws', async () => {
    setNano('downloadable');
    sent.length = 0;
    await expect(extract(prepare(messages[0]!).text, { privateMode: true })).rejects.toBeInstanceOf(NeedsOnDevice);
    setNano(undefined);
    await expect(extract(prepare(messages[0]!).text, { privateMode: true })).rejects.toBeInstanceOf(NeedsOnDevice);
    expect(sent).toEqual([]);
  });

  test('A5: with no Prompt API the call goes IN_CLOUD, and no request text has an email, handle, link or phone', async () => {
    setNano(undefined);
    inferenceSource = 'in_cloud';
    for (const m of messages) {
      const r = await extract(prepare(m).text, { privateMode: false });
      expect(r.route).toBe('IN_CLOUD');
    }
    expect(sent.length).toBe(12);
    for (const s of sent) expect(hasContact(s), s).toBe(false);
    // the raw bodies do contain contacts: the control that makes the line above meaningful
    expect(messages.some((m) => hasContact(m.body))).toBe(true);
  });

  test('the route shown is whatever response.inferenceSource says', async () => {
    setNano('available');
    inferenceSource = 'in_cloud';
    expect((await extract('x', { privateMode: false })).route).toBe('IN_CLOUD');
    inferenceSource = 'on_device';
    expect((await extract('x', { privateMode: false })).route).toBe('ON_DEVICE');
  });
});

describe('coach routing', () => {
  const terms = triageWithRules(messages[0]!).terms;

  test('coach model is ONLY_IN_CLOUD with the configured model', () => {
    buildCoachModel();
    const c = calls.find((x) => x.params.mode === 'only_in_cloud')!;
    expect(c.params.inCloudParams.model).toBe(COACH_MODEL);
    expect(c.params.inCloudParams.systemInstruction).toBe(COACH_SYSTEM);
    expect(c.ai).toBe('cloud');
  });

  test('every outbound coach payload has the DealTerms keys and nothing from any raw message', async () => {
    for (const m of messages) {
      const t = triageWithRules(m).terms;
      chatSent.length = 0;
      const coach = new Coach(t, 1500);
      await coach.start();
      const out = [COACH_SYSTEM, ...chatSent, ...coach.shared.map((p) => p.text)].join('\n');
      for (const key of Object.keys(t)) expect(out).toContain(`"${key}"`);
      expect(out).toContain('"creator_minimum_fee": 1500');
      expect(hasContact(out), out).toBe(false);
      // no 5-word run of the original message appears in what the cloud receives
      const words = m.body.split(/\s+/);
      for (let i = 0; i + 5 <= words.length; i++) expect(out).not.toContain(words.slice(i, i + 5).join(' '));
      for (const h of [m.from_handle, m.from_email].filter(Boolean) as string[]) expect(out).not.toContain(h);
    }
  });

  test('turns typed by the creator are masked before they leave', async () => {
    const coach = new Coach(terms);
    await coach.start();
    await coach.say('Make it friendlier, and sign it as me@example.com / @demo_me');
    const last = chatSent[chatSent.length - 1]!;
    expect(last).toContain('Make it friendlier');
    expect(hasContact(last)).toBe(false);
    expect(coach.shared.at(-1)!.text).toBe(last);
  });

  test('seedPrompt omits the floor when none is given', () => {
    expect(seedPrompt(terms)).not.toContain('creator_minimum_fee');
  });
});
