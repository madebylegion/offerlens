import { mask, unmask, type Masked } from './mask';
import { classify } from './rank';
import { readRules } from './rules';
import { reconcile } from './validate';
import type { DealTerms, EvidenceKey, InboxMessage, Route, Triage } from './types';

/** The only text a model ever receives for a message: subject + body, contacts masked. */
export function prepare(message: InboxMessage): Masked {
  return mask((message.subject ? message.subject + '\n' : '') + message.body);
}

export function buildTriage(message: InboxMessage, masked: Masked, model: DealTerms | null, route: Route, ms: number): Triage {
  const rules = readRules(masked.text);
  const rec = reconcile(rules, model, masked.text);
  const verdict = classify(rec.terms, rec.terms.red_flags);
  const evidence: Triage['evidence'] = {};
  for (const [k, v] of Object.entries(rec.evidence)) if (v) evidence[k as EvidenceKey] = unmask(v, masked.map);
  return {
    message,
    terms: rec.terms,
    flags: rec.flags,
    evidence,
    issues: rec.issues,
    score: verdict.score,
    column: verdict.column,
    verdict: verdict.verdict,
    route,
    ms,
  };
}

/** Rules-only triage: no model at all. Used by tests, the golden file and the eval baseline. */
export function triageWithRules(message: InboxMessage): Triage {
  return buildTriage(message, prepare(message), null, 'RULES_ONLY', 0);
}
