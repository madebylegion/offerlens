// Firebase wiring. Config comes from an untracked firebase.local.json (see the example file).
// Without it the app still runs fully on-device with a placeholder config.

import { initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { GoogleAIBackend, getAI, type AI } from 'firebase/ai';

export interface LocalConfig extends FirebaseOptions {
  recaptchaSiteKey?: string;
}

const found = import.meta.glob('../firebase.local.json', { eager: true, import: 'default' }) as Record<string, LocalConfig>;
const local = Object.values(found)[0];

const PLACEHOLDER: LocalConfig = { apiKey: 'placeholder', projectId: 'placeholder', appId: '1:0:web:0' };

export const cloudConfigured = !!local?.apiKey && !/^YOUR_|^placeholder$/i.test(local.apiKey) && !!local.projectId;
export const config: LocalConfig = cloudConfigured ? (local as LocalConfig) : PLACEHOLDER;

let local_ai: AI | undefined;
let cloud_ai: AI | undefined;
let appCheckOn = false;

function makeApp(name: string): FirebaseApp {
  return initializeApp(config, name);
}

/** App instance with NO App Check: used for Private mode, so nothing in that path can reach the network. */
export function deviceAI(): AI {
  local_ai ??= getAI(makeApp('device'), { backend: new GoogleAIBackend() });
  return local_ai;
}

/** App instance with App Check (reCAPTCHA Enterprise; the debug provider only under `npm start`). */
export function cloudAI(): AI {
  if (cloud_ai) return cloud_ai;
  const app = makeApp('cloud');
  if (cloudConfigured && config.recaptchaSiteKey && !/^YOUR_/.test(config.recaptchaSiteKey)) {
    if (import.meta.env.DEV) {
      // The debug token is printed in the console once; register it in the Firebase console. Never commit it.
      (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN =
        (import.meta.env.VITE_APPCHECK_DEBUG_TOKEN as string | undefined) || true;
    }
    try {
      initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(config.recaptchaSiteKey), isTokenAutoRefreshEnabled: true });
      appCheckOn = true;
    } catch (e) {
      console.warn('App Check could not start', e);
    }
  }
  cloud_ai = getAI(app, { backend: new GoogleAIBackend() });
  return cloud_ai;
}

export const appCheckEnabled = () => appCheckOn;
