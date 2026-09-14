import { GoogleGenAI, ThinkingLevel, type GenerateContentConfig } from '@google/genai';
import { acceptsThinkingLevel, type ThinkingLevelName } from '@tappet/core/ai/models';

/**
 * ⚠ LEG-01 — the key below is what makes a published promise true or false.
 *
 * `app/terms/page.tsx:89` tells every reader **"We do not use your content to
 * train models"**. Nothing in this file enforces that; Google's terms do, and
 * only on one condition — the Gemini API is a Paid Service *"only when
 * accessing the API through a Cloud Project associated with an active billing
 * account."* Unbilled, Google's own terms say human reviewers may read and
 * annotate the input and output. Invoices here carry an owner's name, a shop's
 * street address and sometimes a VIN.
 *
 * So the sentence in the Terms is a claim about **billing state**, and it was
 * published unverified from 27 July. Checked in AI Studio on **25 Aug 2026**:
 *
 *   project           CrewChief · gen-lang-client-0876183667 (created 19 Jul 2026)
 *   billing account   011FAF-322A0D-84942D — Paid 1, postpay, active
 *   last charged      1 Aug 2026
 *
 * ⛔ **This is not a fact that stays true on its own.** The same check found
 * Google forcing that account off postpay — *"This account is required to use
 * prepay billing. Switch now and purchase credits to prevent service
 * disruption."* The account went **prepay on 25 Aug**, and that is a one-way
 * door: Google's own docs — *"switching from a Prepay billing plan to a
 * Postpay billing plan is not supported."*
 *
 * ── What $0 does (Cowork, 14 Sep, from Google's docs) ───────────────────────
 *
 * *"When your Prepay credit balance on the billing account hits $0, all API
 * keys in all projects linked to that billing account will stop working
 * simultaneously."* The Postpay path on the same billing account (a $100
 * threshold, a valid card) does **not** catch it. So the failure is loud, not
 * graceful, and not partial: every call in this file's callers — the advisor,
 * the scan, onboarding research, the sweep's regeneration, plates — throws at
 * once. Nothing in this tree degrades on billing; nothing should claim to.
 *
 * What that does to the product: the advisor route catches the throw and
 * answers **502** with a sentence; the phone shows "The advisor could not
 * answer that one … try again" and the web its `CLIENT_ERROR_FALLBACK`.
 * Neither says why, and "try again" is the wrong advice for a balance — the
 * one signal that names it is the canary (`consultant-health.ts` classes
 * Google's 429 as `degraded`; the workflow exits 3 and CI goes red, every
 * 5–8 h). A `RESOURCE_EXHAUSTED` from Google is not our 429: our own limiter
 * answers 429 to the client, Google's arrives here as a throw.
 *
 * The Terms sentence is *not* what fails first any more — at $0 nothing is
 * served, so nothing is served unbilled — which is the safer direction than
 * the paragraph above feared. Balance ~$11 on 14 Sep at ~$0.66/day, roughly
 * to the end of September; auto-reload is the only protection and is off.
 * Re-check the balance before each release; on submission day it is not
 * optional.
 */

const apiKey = process.env.GEMINI_API_KEY || '';

if (!apiKey) {
  const msg = '[Tappet] GEMINI_API_KEY is not set. Set it in your .env file (see .env.example). AI features will not work.';
  if (process.env.NODE_ENV === 'development') {
    throw new Error(msg);
  } else {
    console.error(msg);
  }
}

export const genAI = new GoogleGenAI({
  apiKey
});

/*
  Generation settings, by how much freedom the job should have.

  These pair with the model tiers in `@tappet/core/ai/models`: the model
  decides how much capability is brought to bear, these decide how much rope it
  gets. Both were previously flat — every call ran at temperature 0.3 or 0.7
  with an 8192-token ceiling, including a yes/no classification.

  `proConfig` used to exist here, was byte-for-byte identical to `flashConfig`,
  and was never imported by anything. It is gone; `proStructuredConfig` below
  is the real version of what it was reaching for.
*/

/** Prose a person reads: the consultant, an email draft. */
export const flashConfig = {
  temperature: 0.7,
  topK: 40,
  topP: 0.95,
  maxOutputTokens: 8192,
};

/** Structured extraction and estimation — JSON in, JSON out. */
export const flashStructuredConfig = {
  temperature: 0.3,
  topK: 20,
  topP: 0.9,
  maxOutputTokens: 8192,
};

/**
 * Dossier generation, and nothing else.
 *
 * The one call whose output is persisted and then read by every later answer,
 * so it is the one place worth paying for room. 8192 was truncating long
 * dossiers on vehicles with a lot of history — the failure is silent, because
 * a truncated dossier is still a dossier.
 */
export const proStructuredConfig = {
  temperature: 0.3,
  topK: 20,
  topP: 0.9,
  maxOutputTokens: 32768,
};

/**
 * Classification and lookup: a word, a short list, a small JSON verdict.
 *
 * Temperature 0 because these questions have right answers and creativity is
 * a defect. The output ceiling is the point — `validateConsultantDocument`
 * returns three short fields and was budgeted 8192 tokens, the same as a full
 * vehicle dossier.
 */
export const classificationConfig = {
  temperature: 0,
  topK: 1,
  topP: 0.1,
  maxOutputTokens: 512,
};

/**
 * Attach a thinking level to a generation config, when the model takes one.
 *
 * ── Why this is a function and not four more exported objects ───────────────
 *
 * The obvious version of 2.95a is to add `thinkingConfig` to `flashConfig` and
 * be done in ten minutes. That breaks production. These configs are shared
 * across model families — `flashConfig` is used with `FLASH_MODEL` *and* with
 * 2.5 Flash on the health route — and 2.5 answers a thinking level with a
 * 400, not with an ignore. Baking the level into the config would have taken
 * out the consultant canary and the performance-stats path together, and the
 * typecheck would have been perfectly happy about it.
 *
 * So the level is applied where the model is known, and `acceptsThinkingLevel`
 * decides. A call site that later moves to a 2.5 model degrades to the default
 * instead of failing.
 *
 * The base config is never mutated: these are module-level singletons shared
 * by every call, and one `Object.assign` into `flashConfig` would silently
 * re-tune every other caller.
 *
 * The level crosses from a plain name to the SDK's enum here, and only here.
 * `@tappet/core` states the *policy* — which job gets how much thinking —
 * and must not take a dependency on Google's client to do it.
 */
export function withThinking<T extends GenerateContentConfig>(
  base: T,
  model: string,
  level: ThinkingLevelName
): T & Pick<GenerateContentConfig, 'thinkingConfig'> {
  if (!acceptsThinkingLevel(model)) return base;
  return { ...base, thinkingConfig: { thinkingLevel: ThinkingLevel[level] } };
}
