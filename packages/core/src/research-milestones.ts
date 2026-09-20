import { getHealthBandJudgement } from './health-band';
import { normaliseRecalls } from './recalls';

/**
 * What the research has *done* for a car, as lines a person can read while
 * it works — derived from the rows it has written, never from a clock.
 *
 * ── The rule, and why it is enforced here rather than promised ─────────────
 *
 * David's brief (20 Sep): no spinners; "engaging loading states, with
 * animations and text describing what's happening in the background." And
 * the product's standing rule for a wait, settled for the invoice scanner in
 * `scan-progress.ts` and repeated in both clients' `working` modules: a
 * stage may exist only where the client can **observe** the boundary. A bar
 * that reached 100 % while the request was in flight (the quote), a scan
 * sweep depicting an examination nobody performed, a hero timer that counted
 * nothing — three times this product has drawn work that was not happening,
 * and every one of them was a timer. So: **narrate real work, never elapsed
 * time.** A line lands because a step completed; if a step stalls, the log
 * stalls, visibly.
 *
 * This module is how that rule becomes unbreakable rather than remembered.
 * The only input is what the API has handed the client — the vehicle row,
 * its plate, the knowledge base, the NHTSA row, the health row — and every
 * answer line quotes a field from one of them. There is no way to produce
 * "24 on file" without a row that says 24. A screen that renders these
 * milestones cannot depict work that has not happened, because it has
 * nothing to depict it with.
 *
 * ── Why the log is interesting, and that is not decoration ─────────────────
 *
 * The dossier call is the slowest thing in the product — 23–60 s of a Pro
 * model — and it lands last. A person watching an unexplained wait that was
 * promised "a few seconds" decides the app is broken at about twelve. So the
 * research pipeline (`lib/research-job.ts`) asks NHTSA *first*, because it
 * answers in seconds, and this log turns that answer into two true things
 * about the person's own car before the long call has finished. By the third
 * line the app has told them something they did not know; the wait is the
 * product rather than a tax on it. That only works because the lines are
 * facts. A fabricated "fun fact" inches from a safety recall would spend the
 * exact credibility the product sells, which is why the marginalia
 * (`researchMarginalia`) quotes stored data or says nothing.
 *
 * ── Failure is a line, not a spinner ────────────────────────────────────────
 *
 * Every path terminates in a result or a stated failure: NHTSA not
 * answering, the research not finishing, the score not coming back, and the
 * client's own deadline passing (`stalled`) — that last one is the client's
 * to observe, since the server cannot report a wait it does not know is
 * being watched. No state may be `active` forever.
 */

export type MilestoneState = 'done' | 'active' | 'pending' | 'failed';

export type MilestoneKey = 'decode' | 'recalls' | 'sort' | 'dossier' | 'schedule' | 'score';

export interface ResearchMilestone {
  key: MilestoneKey;
  /** The asking, present tense, no full stop — the ledger's label. */
  label: string;
  /**
   * The answer, and it exists only once the data is in hand. A milestone
   * with an answer is `done` or `failed`; one without is `active` or
   * `pending`. That coupling is the whole rule.
   */
  answer?: string;
  state: MilestoneState;
}

export type ResearchStatus = 'pending' | 'completed' | 'failed' | 'unsupported';

/** Everything the log is allowed to know — the API's own rows, nothing else. */
export interface ResearchObservation {
  vehicle: {
    year: number;
    make: string;
    model: string;
    current_mileage?: number | null;
    next_service_label?: string | null;
    next_service_at_miles?: number | null;
  };
  /** The generation plate's own row, when the car has one. */
  plate?: { generation?: string | null; year_from?: number | null; year_to?: number | null } | null;
  knowledge?: {
    research_status?: ResearchStatus | string | null;
    engine_type?: string | null;
    transmission_type?: string | null;
    known_issues?: unknown;
    maintenance_schedule?: unknown;
  } | null;
  /** `null`/absent means NHTSA has not been asked yet — a row means it has. */
  nhtsa?: { recalls?: unknown; lookup_status?: string | null } | null;
  health?: { health_score?: number | null; last_generated?: string | null } | null;
  /** The client asked for a score and was refused — its message. */
  healthFailure?: string | null;
  /**
   * The client's own deadline has passed with something still active. The
   * server cannot know this; the client can, and must say so rather than
   * keep an animation running over nothing.
   */
  stalled?: boolean;
}

/**
 * The plate's generation, in words. The library keys a generation the way
 * the make does: Honda's Accord is `7th-generation`, Toyota's Camry is
 * `xv50` and BMW's 2 Series is `f22` — chassis codes, which owners use. An
 * ordinal reads as "7th generation"; a short code is set in capitals as the
 * maker writes it; anything else has its hyphens opened up.
 *
 * ⚠ Found live, 20 Sep, on the first car this log ran for: the first
 * version knew only the ordinal form, so the Camry's decode line stayed
 * *active* with every other step done — the very failure this module
 * exists to prevent, on its own first line. A generation this cannot phrase
 * still has years, and the line must settle on those.
 */
export function generationPhrase(generation: string | null | undefined): string | null {
  if (!generation) return null;
  const ordinal = /^(\d+)(st|nd|rd|th)-generation$/.exec(generation);
  if (ordinal) return `${ordinal[1]}${ordinal[2]} generation`;
  const plain = generation.replace(/-/g, ' ').trim();
  if (!plain) return null;
  // A chassis code: short, no spaces — F22, XV50, W205, and Mazda's bare BK
  // (found live on the 2009 Mazda3, whose key is `bk`: it read "Bk").
  if (/^[a-z]{1,3}\d{1,4}[a-z]?$/i.test(plain) || /^[a-z]{2,3}$/i.test(plain)) return plain.toUpperCase();
  return plain.replace(/\b\w/g, (c) => c.toUpperCase());
}

function miles(n: number): string {
  return `${n.toLocaleString('en-US')} mi`;
}

/**
 * The largest system among the campaigns, in the owner's words rather than
 * NHTSA's. `AIR BAGS:FRONTAL:DRIVER SIDE:INFLATOR MODULE` groups under its
 * first segment, and the ten Takata inflators on a 2003 Accord read as "10
 * involve the airbags" — which is the fact an owner needs, and true.
 */
export function largestRecallSystem(recalls: unknown): { system: string; count: number } | null {
  const groups = new Map<string, number>();
  for (const recall of normaliseRecalls(recalls)) {
    const head = (recall.component ?? '').split(':')[0].trim();
    if (!head) continue;
    groups.set(head, (groups.get(head) ?? 0) + 1);
  }
  // `Array.from`, not `for…of` on the Map: the root tsconfig's target cannot
  // iterate one (f7733d6).
  const best = Array.from(groups.entries()).reduce<{ system: string; count: number } | null>(
    (top, [system, count]) => (!top || count > top.count ? { system, count } : top),
    null
  );
  if (!best) return null;
  return { system: systemInPlainWords(best.system), count: best.count };
}

function systemInPlainWords(component: string): string {
  const lower = component.toLowerCase();
  if (lower.includes('air bag')) return 'the airbags';
  if (lower.includes('lighting')) return 'the exterior lighting';
  if (lower.includes('power train')) return 'the drivetrain';
  if (lower.includes('speed control')) return 'the throttle';
  if (lower.includes('steering')) return 'the steering';
  if (lower.includes('brake')) return 'the brakes';
  if (lower.includes('fuel')) return 'the fuel system';
  if (lower.includes('electrical')) return 'the electrics';
  if (lower.includes('engine')) return 'the engine';
  return lower;
}

/**
 * The milestones, in the order the pipeline lands them, each one's state
 * read off the rows. `active` is the first milestone without an answer;
 * everything after it is `pending` unless its own row has already landed —
 * a later fact stays true even when an earlier step has not finished.
 */
export function researchMilestones(observed: ResearchObservation): ResearchMilestone[] {
  const { vehicle } = observed;
  const name = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
  const status = observed.knowledge?.research_status ?? 'pending';

  /*
    Always done: the car exists, so the decode has an answer the moment the
    screen opens — the plate's generation and years when the library has
    them, otherwise the fact that it is filed. It was `pending` for a plate
    without a phraseable generation until 20 Sep, which left the line active
    forever on the first car it ran for (see `generationPhrase`).
  */
  const decode: ResearchMilestone = { key: 'decode', label: `Decoding the ${name}`, state: 'done' };
  const generation = generationPhrase(observed.plate?.generation);
  if (observed.plate?.year_from && observed.plate?.year_to) {
    const span = `${observed.plate.year_from}–${observed.plate.year_to}`;
    decode.answer = generation ? `${generation}, ${span}.` : `A ${span} car, by its plate.`;
  } else if (generation) {
    decode.answer = `${generation}.`;
  } else {
    // No plate is not a failure: the car is on file under its own name.
    decode.answer = `Filed as a ${name}.`;
  }

  const recalls: ResearchMilestone = { key: 'recalls', label: 'Asking NHTSA about open campaigns', state: 'pending' };
  const sort: ResearchMilestone = { key: 'sort', label: 'Sorting them by system', state: 'pending' };
  const nhtsa = observed.nhtsa ?? null;
  const campaigns = nhtsa ? normaliseRecalls(nhtsa.recalls) : [];
  if (nhtsa) {
    const lookup = nhtsa.lookup_status ?? (campaigns.length > 0 ? 'matched' : null);
    if (lookup === 'matched') {
      recalls.answer = campaigns.length === 0 ? 'None on file for this model.' : `${campaigns.length} on file.`;
      recalls.state = 'done';
    } else if (lookup === 'no_match') {
      recalls.answer = 'NHTSA does not list this model, so nothing can be matched.';
      recalls.state = 'done';
    } else if (lookup === 'failed') {
      recalls.answer = 'NHTSA did not answer. It is asked again overnight.';
      recalls.state = 'failed';
    } else {
      // A row with no verdict is a lookup that has not finished — still working.
      recalls.state = 'pending';
    }
  }
  if (recalls.state === 'done' && campaigns.length > 0) {
    const largest = largestRecallSystem(nhtsa?.recalls);
    sort.answer = largest ? `${largest.count} involve ${largest.system}.` : `${campaigns.length} campaigns, across several systems.`;
    sort.state = 'done';
  } else if (recalls.state === 'done' || recalls.state === 'failed') {
    // Nothing to sort is not a step that failed — it is a step that has no work.
    sort.answer = 'Nothing to sort.';
    sort.state = 'done';
  }

  const dossier: ResearchMilestone = { key: 'dossier', label: 'Researching what this model is known for', state: 'pending' };
  if (status === 'completed') {
    const issues = Array.isArray(observed.knowledge?.known_issues) ? observed.knowledge!.known_issues.length : 0;
    const powertrain = [observed.knowledge?.engine_type, observed.knowledge?.transmission_type]
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      .join(', ');
    const parts = [`${issues} known ${issues === 1 ? 'issue' : 'issues'} on file for it`];
    if (powertrain) parts.push(powertrain);
    dossier.answer = `${parts.join('; ')}.`;
    dossier.state = 'done';
  } else if (status === 'unsupported') {
    dossier.answer = 'Not enough on record for this model to build a dossier.';
    dossier.state = 'done';
  } else if (status === 'failed') {
    dossier.answer = 'The research did not finish.';
    dossier.state = 'failed';
  }

  const schedule: ResearchMilestone = { key: 'schedule', label: 'Building the service schedule', state: 'pending' };
  if (vehicle.next_service_label) {
    schedule.answer = vehicle.next_service_at_miles
      ? `Next up: ${vehicle.next_service_label}, around ${miles(vehicle.next_service_at_miles)}.`
      : `Next up: ${vehicle.next_service_label}.`;
    schedule.state = 'done';
  } else if (status === 'completed' || status === 'unsupported') {
    const items = Array.isArray(observed.knowledge?.maintenance_schedule)
      ? observed.knowledge!.maintenance_schedule.length
      : 0;
    // The schedule is on file but nothing has been projected against the
    // odometer yet — say that, rather than "nothing due", which is a claim.
    schedule.answer = items > 0 ? `${items} services on the schedule; nothing projected yet.` : 'No schedule on record for this model.';
    schedule.state = 'done';
  } else if (status === 'failed') {
    schedule.answer = 'Waits on the research.';
    schedule.state = 'failed';
  }

  const score: ResearchMilestone = { key: 'score', label: 'Scoring condition', state: 'pending' };
  const health = observed.health ?? null;
  if (health && typeof health.health_score === 'number') {
    const band = getHealthBandJudgement(health.health_score);
    score.answer = `${health.health_score} · ${band.label}.`;
    score.state = 'done';
  } else if (health && health.last_generated) {
    // A row without a number is the honest "we could not say" the summary
    // writes on a parse failure (`generateVehicleHealthSummary`).
    score.answer = 'No reading could be made from the records on file.';
    score.state = 'done';
  } else if (observed.healthFailure) {
    score.answer = observed.healthFailure;
    score.state = 'failed';
  } else if (status === 'failed') {
    score.answer = 'Waits on the research.';
    score.state = 'failed';
  }

  const ordered = [decode, recalls, sort, dossier, schedule, score];

  // The first milestone without an answer is the one running; the stall is
  // reported on it, because that is the step that did not come back.
  const running = ordered.find((m) => m.state === 'pending');
  if (running) {
    if (observed.stalled) {
      running.state = 'failed';
      running.answer = 'Taking longer than it should. It carries on in the background — come back to this car, or retry.';
    } else {
      running.state = 'active';
    }
  }
  return ordered;
}

/** True when nothing is running any more — every line has its answer. */
export function researchSettled(milestones: ResearchMilestone[]): boolean {
  return milestones.every((m) => m.state === 'done' || m.state === 'failed');
}

/** True when any step ended in a stated failure. */
export function researchHasFailure(milestones: ResearchMilestone[]): boolean {
  return milestones.some((m) => m.state === 'failed');
}

/**
 * The line the instrument prints above the ledger: the running step's own
 * label, so the status and the ledger never disagree about what is happening.
 */
export function researchLine(milestones: ResearchMilestone[]): string {
  const running = milestones.find((m) => m.state === 'active');
  if (running) return running.label;
  return researchHasFailure(milestones) ? 'Research stopped' : 'Research complete';
}

/**
 * A true thing about this car for the margin while the long call runs — or
 * nothing.
 *
 * ⚠ **Sourced or absent.** The brief is explicit that a fabricated fact on a
 * car-facts screen destroys the credibility the product sells, and would sit
 * inches from a safety recall. So this quotes only rows already written —
 * the plate's generation and NHTSA's own campaign record — and never a model
 * at request time. When neither is on file it returns `null`, and the margin
 * stays empty: "Did you know cars need oil?" is worse than silence.
 */
export function researchMarginalia(observed: ResearchObservation): string | null {
  const campaigns = observed.nhtsa ? normaliseRecalls(observed.nhtsa.recalls) : [];
  const dated = campaigns.filter((c) => c.reportedOn).sort((a, b) => (a.reportedOn! < b.reportedOn! ? -1 : 1));
  if (dated.length >= 2) {
    const first = dated[0];
    const last = dated[dated.length - 1];
    const years = Number(last.reportedOn!.slice(0, 4)) - Number(first.reportedOn!.slice(0, 4));
    if (years >= 1) {
      return `NHTSA's record for this model runs ${years} years, from ${first.reportedOn!.slice(0, 4)} to ${last.reportedOn!.slice(0, 4)}.`;
    }
  }
  const generation = generationPhrase(observed.plate?.generation);
  if (generation && observed.plate?.year_from && observed.plate?.year_to) {
    const span = observed.plate.year_to - observed.plate.year_from + 1;
    return `The ${generation} ${observed.vehicle.make} ${observed.vehicle.model} ran ${span} model years, ${observed.plate.year_from} to ${observed.plate.year_to}.`;
  }
  return null;
}
