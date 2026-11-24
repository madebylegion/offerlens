// The negotiation coach: the one cloud-only step. It is a multi-turn chat (not supported
// on-device) and it sees only the extracted DealTerms, never the message, handle or email.

import { InferenceMode, getGenerativeModel, type ChatSession, type GenerativeModel } from 'firebase/ai';
import { COACH_MODEL } from './ai';
import { cloudAI } from './firebase';
import { mask } from './mask';
import type { DealTerms } from './types';

export const COACH_SYSTEM =
  'You are a calm negotiation coach for independent content creators. You are given structured deal terms only; ' +
  'you never see the brand\'s original message. Draft short, polite, specific counter-offers the creator can paste into a reply. ' +
  'Point out clauses that cost the creator money or freedom (usage rights, exclusivity, payment delay) and propose a concrete alternative for each. ' +
  'Keep answers under 180 words. Remind the creator to disclose paid or gifted posts. Do not give legal advice. ' +
  'Write plain text; use at most **bold** and "- " bullets. Sign off without placeholders: never write bracketed tokens like [Your Name], and leave the signature out. ' +
  'If the terms include creator_minimum_fee, that is the creator\'s floor: never propose, accept or hint at any fee below it, and never call an offer below it (or a deal marked as a trap or scam) "fair". Say plainly that it is under the floor and counter at or above the floor.';

// Low temperature: the floor is a hard constraint, so we want the least creative reply.
export const COACH_TEMPERATURE = 0.25;

export interface SharedPayload {
  at: string; // ISO time
  kind: 'system' | 'terms' | 'turn';
  text: string; // exactly what was sent
}

let coachModel: GenerativeModel | undefined;

/** Exported so a test can assert the mode. */
export function buildCoachModel(): GenerativeModel {
  coachModel ??= getGenerativeModel(cloudAI(), {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: {
      model: COACH_MODEL,
      systemInstruction: COACH_SYSTEM,
      generationConfig: { temperature: COACH_TEMPERATURE, maxOutputTokens: 700 },
    },
  });
  return coachModel;
}

/** The seed turn: DealTerms JSON and the creator's own floor, nothing else. */
export function seedPrompt(terms: DealTerms, floor?: number): string {
  const payload: Record<string, unknown> = { ...terms };
  if (floor && floor > 0) payload.creator_minimum_fee = floor;
  return [
    'Deal terms (structured data only):',
    '```json',
    JSON.stringify(payload, null, 2),
    '```',
    floor && floor > 0
      ? `Hard rule: every fee you propose must be at least ${floor} (creator_minimum_fee). Never write a lower number. Do not call this offer fair if it is below ${floor}.`
      : 'No minimum fee was given; do not invent one.',
    'Draft a first counter-offer. Start with one sentence on which terms cost the creator money or freedom, then the counter-offer text.',
  ].join('\n');
}

export class Coach {
  private chat: ChatSession;
  readonly shared: SharedPayload[] = [];
  readonly turns: { from: 'coach' | 'you'; text: string; source?: string }[] = [];

  constructor(
    private terms: DealTerms,
    private floor?: number,
    private onShare?: (p: SharedPayload) => void,
  ) {
    this.chat = buildCoachModel().startChat();
  }

  private record(kind: SharedPayload['kind'], text: string) {
    const p = { at: new Date().toISOString(), kind, text };
    this.shared.push(p);
    this.onShare?.(p);
  }

  private async ask(text: string): Promise<string> {
    const r = await this.chat.sendMessage(text);
    const reply = r.response.text();
    this.turns.push({ from: 'coach', text: reply, source: String(r.response.inferenceSource ?? 'UNKNOWN') }); // IN_CLOUD expected (ONLY_IN_CLOUD)
    return reply;
  }

  /** First turn: sends the system line (recorded for transparency) and the DealTerms. */
  async start(): Promise<string> {
    this.record('system', COACH_SYSTEM);
    const seed = seedPrompt(this.terms, this.floor);
    this.record('terms', seed);
    return this.ask(seed);
  }

  /** Later turns: the creator's own words, masked in case they paste a contact detail. */
  async say(text: string): Promise<string> {
    const safe = mask(text).text;
    this.turns.push({ from: 'you', text });
    this.record('turn', safe);
    return this.ask(safe);
  }
}
