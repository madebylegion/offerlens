// The hybrid router. Which model runs where is decided here and nowhere else.
//
//   extraction, normal   PREFER_ON_DEVICE  Nano when it is "available", else cloud (text is masked either way)
//   extraction, private  ONLY_ON_DEVICE    never touches the network; throws when Nano is missing
//   coach                ONLY_IN_CLOUD     multi-turn chat is not supported on-device

import { InferenceMode, getGenerativeModel, type GenerativeModel } from 'firebase/ai';
import { cloudAI, cloudConfigured, deviceAI } from './firebase';
import { EXTRACT_SCHEMA, extractionPrompt, parseModelJson, toSdkSchema } from './schema';
import type { DealTerms, Route } from './types';

export const EXTRACT_CLOUD_MODEL = 'gemini-3.5-flash-lite';
export const COACH_MODEL = 'gemini-3.5-flash-lite'; // gemini-3.8-flash hangs (no reply in 60 s) on this path, see BUILD.md

export type Availability = 'available' | 'downloadable' | 'downloading' | 'unavailable' | 'missing';

const CREATE_OPTIONS = {
  expectedInputs: [{ type: 'text' as const, languages: ['en'] }],
  expectedOutputs: [{ type: 'text' as const, languages: ['en'] }],
};

export async function onDeviceAvailability(): Promise<Availability> {
  if (typeof LanguageModel === 'undefined') return 'missing';
  try {
    return (await LanguageModel.availability(CREATE_OPTIONS)) as Availability;
  } catch {
    return 'unavailable';
  }
}

export const isOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false;

export type ExtractMode = 'PREFER_ON_DEVICE' | 'ONLY_ON_DEVICE';

const modelCache = new Map<string, GenerativeModel>();

/** Build (and cache) the extraction model for a mode. Exported so tests can assert the mode. */
export function extractionModel(mode: ExtractMode): GenerativeModel {
  const hit = modelCache.get(mode);
  if (hit) return hit;
  const isPrivate = mode === 'ONLY_ON_DEVICE';
  const m = getGenerativeModel(isPrivate ? deviceAI() : cloudAI(), {
    mode: isPrivate ? InferenceMode.ONLY_ON_DEVICE : InferenceMode.PREFER_ON_DEVICE,
    // on-device JSON needs responseConstraint; the cloud needs responseSchema. Set both.
    onDeviceParams: { createOptions: CREATE_OPTIONS, promptOptions: { responseConstraint: EXTRACT_SCHEMA } },
    inCloudParams: {
      model: EXTRACT_CLOUD_MODEL,
      generationConfig: { responseMimeType: 'application/json', responseSchema: toSdkSchema(EXTRACT_SCHEMA), temperature: 0 },
    },
  });
  modelCache.set(mode, m);
  return m;
}

export class NeedsOnDevice extends Error {
  constructor() {
    super('Private mode needs on-device AI. Nothing was sent.');
    this.name = 'NeedsOnDevice';
  }
}

export interface Extraction {
  terms: DealTerms | null; // null when the model answered with something unusable
  route: Route;
  ms: number;
}

const sourceToRoute = (s: string | undefined, fallback: Route): Route => (s === 'on_device' ? 'ON_DEVICE' : s === 'in_cloud' ? 'IN_CLOUD' : fallback);

/**
 * `maskedText` must already be masked: even if the SDK silently falls back to the cloud, no contact detail is in it.
 */
export async function extract(maskedText: string, opts: { privateMode: boolean }): Promise<Extraction> {
  const avail = await onDeviceAvailability();
  const t0 = performance.now();
  if (opts.privateMode) {
    if (avail !== 'available') throw new NeedsOnDevice();
    const r = await extractionModel('ONLY_ON_DEVICE').generateContent(extractionPrompt(maskedText));
    return { terms: parseModelJson(r.response.text()), route: sourceToRoute(r.response.inferenceSource, 'ON_DEVICE'), ms: Math.round(performance.now() - t0) };
  }
  if (avail !== 'available' && (!isOnline() || !cloudConfigured)) {
    throw new Error(cloudConfigured ? 'No on-device AI and no connection.' : 'No on-device AI, and the cloud is not configured.');
  }
  const r = await extractionModel('PREFER_ON_DEVICE').generateContent(extractionPrompt(maskedText));
  return {
    terms: parseModelJson(r.response.text()),
    route: sourceToRoute(r.response.inferenceSource, avail === 'available' ? 'ON_DEVICE' : 'IN_CLOUD'),
    ms: Math.round(performance.now() - t0),
  };
}

/** One-time download of the on-device model. Needs a user gesture; progress is 0..1. */
export async function downloadOnDeviceModel(onProgress: (p: number) => void): Promise<void> {
  await extractionModel('ONLY_ON_DEVICE').initializeDeviceModel(onProgress);
}
