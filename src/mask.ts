// Deterministic masking of contact details. Everything handed to any model
// (on-device or cloud) goes through mask() first, so even a silent SDK
// fallback to the cloud cannot leak an email, handle, phone, link or account number.

export interface Masked {
  text: string;
  map: Record<string, string>; // token -> original
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const URL_RE =
  /\b(?:https?:\/\/|www\.)[^\s<>"')]+|\b(?:[a-z0-9-]+\.)+(?:com|net|org|io|co|ly|link|me|app|biz|info|xyz|site|top)\b(?:\/[^\s<>"')]*)?/gi;
const HANDLE = /(?<![\w@])@[A-Za-z0-9_.]{2,30}/g;
const IBAN = /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g;
const PHONE = /(?<![\w.])\+?\(?\d[\d\s().-]{7,}\d(?![\w])/g;

const digits = (s: string) => s.replace(/\D/g, '').length;
const looksLikeDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s.trim()) || /^\d{1,2}[/.]\d{1,2}[/.]\d{2,4}$/.test(s.trim());

export function mask(input: string): Masked {
  const map: Record<string, string> = {};
  const seen = new Map<string, string>();
  const counters: Record<string, number> = {};
  const token = (kind: string, original: string) => {
    const key = kind + '\u0000' + original;
    const hit = seen.get(key);
    if (hit) return hit;
    counters[kind] = (counters[kind] ?? 0) + 1;
    const t = `[${kind}_${counters[kind]}]`;
    seen.set(key, t);
    map[t] = original;
    return t;
  };
  let text = input;
  // order matters: emails before URLs (name@example.com), URLs before handles
  text = text.replace(EMAIL, (m) => token('EMAIL', m));
  text = text.replace(URL_RE, (m) => {
    const trail = /[.,;:!?]+$/.exec(m)?.[0] ?? '';
    const core = trail ? m.slice(0, -trail.length) : m;
    return token('URL', core) + trail;
  });
  text = text.replace(HANDLE, (m) => token('HANDLE', m));
  text = text.replace(IBAN, (m) => token('ACCOUNT', m));
  text = text.replace(PHONE, (m) => {
    if (digits(m) < 9 || looksLikeDate(m)) return m;
    return token('PHONE', m.trim()) + (/\s$/.test(m) ? ' ' : '');
  });
  return { text, map };
}

export function unmask(text: string, map: Record<string, string>): string {
  return text.replace(/\[(?:EMAIL|URL|HANDLE|ACCOUNT|PHONE)_\d+\]/g, (t) => map[t] ?? t);
}

/** True if the text still contains something that looks like a contact detail. */
export function hasContact(text: string): boolean {
  const probe = (re: RegExp) => new RegExp(re.source, re.flags.replace('g', '')).test(text);
  return probe(EMAIL) || probe(HANDLE) || probe(URL_RE) || probe(IBAN) || PHONE_HITS(text);
}
function PHONE_HITS(text: string): boolean {
  return [...text.matchAll(PHONE)].some((m) => digits(m[0]) >= 9 && !looksLikeDate(m[0]));
}
