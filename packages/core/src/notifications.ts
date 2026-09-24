/**
 * What a notification says, and where tapping it lands.
 *
 * ── Why this is in core ─────────────────────────────────────────────────────
 *
 * The `data.url` on a push is a **contract between two codebases**. The server
 * writes it; `apps/mobile`'s `linking` config resolves it. Nothing checks that
 * they agree — a push whose url names a route the navigator does not have opens
 * the app to whatever screen was last on top, which reads as "the notification
 * is broken" and is invisible until someone taps a real one on a real phone.
 *
 * So the url is built here, once, from the same route strings the navigator
 * registers, and `push-notification-links.test.ts` reads both sides. That is
 * the same argument `push-tokens.ts` makes about the token format, applied to
 * the destination instead of the address.
 *
 * ── Why the copy lives here too, rather than at the send site ───────────────
 *
 * Because the copy and the url are one decision. The recall notice says "tap to
 * ask the advisor what it means" and the url carries that question in `?ask=` —
 * `RootStackParamList` records that a link arriving with its question is the
 * reason `ask` exists at all. Split them across two files and the next person
 * changes the sentence without changing the question, and the advisor opens
 * with a composer that asks something the notification did not.
 *
 * ── Deliberately not a template system ──────────────────────────────────────
 *
 * Three notification kinds, three functions. A generic
 * `notification(kind, params)` with a lookup table would be shorter and would
 * make the next kind a data change rather than a code change — but it also
 * makes every kind share one shape, and these do not: a recall is an event
 * that happened to a model, a service reminder is a threshold this particular
 * car crossed, and the tire rotation (20 Sep) is a threshold *the owner set* —
 * its sentence is licensed by who stated the interval, which neither of the
 * others has to think about. The third arrived and the answer was the same:
 * one more function, not a table.
 */

/**
 * The scheme the mobile client accepts. `push.ts` refuses everything else, on
 * purpose — see its header — so a url built with anything but this is a
 * notification that silently does nothing when tapped.
 */
const APP_SCHEME = 'tappet://';

/** What a push carries. `url` becomes `data.url` on the payload. */
export interface NotificationContent {
  title: string;
  body: string;
  url: string;
}

/**
 * The advisor, for one car, optionally arriving with a question already typed.
 *
 * Mirrors `Advisor: 'vehicle/:vehicleId/advisor'` in the navigator's `linking`
 * config. `ask` is encoded because a real question contains spaces and
 * punctuation and would otherwise truncate the url at the first space.
 */
export function advisorUrl(vehicleId: string, ask?: string): string {
  const base = `${APP_SCHEME}vehicle/${encodeURIComponent(vehicleId)}/advisor`;
  return ask ? `${base}?ask=${encodeURIComponent(ask)}` : base;
}

/** One car's detail screen. Mirrors `VehicleDetail: 'vehicle/:vehicleId'`. */
export function vehicleUrl(vehicleId: string): string {
  return `${APP_SCHEME}vehicle/${encodeURIComponent(vehicleId)}`;
}

/** The service milestone for one car. Mirrors `ServiceMilestone: 'vehicle/:vehicleId/service'`. */
export function serviceUrl(vehicleId: string): string {
  return `${APP_SCHEME}vehicle/${encodeURIComponent(vehicleId)}/service`;
}

/** The recall screen for one car. Mirrors `RecallDetail: 'vehicle/:vehicleId/recalls'`. */
export function recallsUrl(vehicleId: string): string {
  return `${APP_SCHEME}vehicle/${encodeURIComponent(vehicleId)}/recalls`;
}

/** The tire set for one car. Mirrors `Tires: 'vehicle/:vehicleId/tires'`. */
export function tiresUrl(vehicleId: string): string {
  return `${APP_SCHEME}vehicle/${encodeURIComponent(vehicleId)}/tires`;
}

/**
 * A recall was issued for this car.
 *
 * **Lands on the recall screen, not the advisor.** It opened the advisor with
 * the question pre-typed until 7 Aug 2026, which explained a notice well and
 * gave nobody a way to act on it. David's call: the point of the alert is to
 * drive an action. So the destination carries the notice, what it means, what
 * NHTSA says the remedy is, and the fact that the repair is free — and the
 * advisor is reachable from there, per recall, still carrying the question.
 *
 * The old reasoning was not wrong, only incomplete: "FMVSS 111 rear visibility"
 * genuinely does tell an owner nothing, and explaining it is the thing this
 * product does that a recall lookup does not. That explanation is now one tap
 * away from the answer instead of being the whole answer.
 *
 * `vehicleName` is what the owner calls the car, so the title reads as being
 * about *their* car rather than about a model. A notification that says
 * "Recall issued for 2018 Honda Accord" is indistinguishable from marketing;
 * one that names the car in their garage is not.
 */
export function recallNotification(params: {
  vehicleId: string;
  vehicleName: string;
  recallSummary: string;
  /**
   * How many campaigns this one notification covers, including the one in the
   * body. Defaults to 1 — a single recall reads exactly as it always did.
   *
   * ⚠ Added 22 Aug, when a dry run showed 24 campaigns on one car queued as 24
   * separate pushes. See `digestRecalls`.
   */
  campaignCount?: number;
}): NotificationContent {
  const { vehicleId, vehicleName, recallSummary } = params;
  const count = params.campaignCount ?? 1;

  if (count <= 1) {
    return {
      title: `Recall notice — ${vehicleName}`,
      body: `${truncate(recallSummary, 140)} Tap to see what it means and what to do.`,
      url: recallsUrl(vehicleId),
    };
  }

  /*
    ⚠ "match your" rather than "affect your", and that is not hedging for its
    own sake. CLAUDE.md §10: recalls match on **year, make and model — not
    VIN**. Telling an owner that 24 recalls *affect their car* claims their
    specific vehicle was checked against each campaign, which is exactly the
    overclaim `advice-range.ts` argues against and `health-claims.ts` was
    written to undo one screen over.

    The count is still the headline, because it is the true and useful part:
    somebody whose car matches two dozen campaigns needs to open the screen,
    and that is what this notification is for.
  */
  return {
    title: `${count} recalls match your ${vehicleName}`,
    body: `Including: ${truncate(recallSummary, 120)} Tap to see all ${count} and what to do about them.`,
    url: recallsUrl(vehicleId),
  };
}

/**
 * A service item is due, by mileage or by date.
 *
 * **Lands on the vehicle screen, not the advisor**, and the asymmetry with the
 * recall above is the point. "Your oil change is due" is already understood;
 * there is nothing to explain, and opening a chat to be told what an oil change
 * is would be worse than opening the car. The advisor is for the notice nobody
 * can read, not for every notice.
 */
export function serviceDueNotification(params: {
  vehicleId: string;
  vehicleName: string;
  serviceName: string;
  reason: string;
}): NotificationContent {
  const { vehicleId, vehicleName, serviceName, reason } = params;

  return {
    title: `${serviceName} due — ${vehicleName}`,
    body: truncate(reason, 160),
    url: serviceUrl(vehicleId),
  };
}

/**
 * The tire set is past the rotation interval its owner entered.
 *
 * **The one place the obligation is a sentence.** On screen the same three
 * facts are the mono column — numeral, `YOUR INTERVAL`, `PAST n MI` — because
 * B1 forbids Inter prose with interpolated values on a screen. A push has no
 * type system and no mono slot, so here it is prose, verbatim from the
 * approved copy (design-loop/tires, §0.10):
 *
 *   `11,400 miles since the last rotation. Your interval is 6,000. You are
 *   currently outside your warranty's terms.`
 *
 * ⚠ **Tappet may say "outside your warranty's terms" only because the owner
 * entered the interval.** The caller proves that with `mayClaimWarrantyTerms`
 * before it gets here; this function refuses to build the sentence otherwise
 * rather than trusting the caller, because a push cannot be recalled. No
 * interval → no obligation, no notification, no overrun, no sodium.
 *
 * ⚠ "Since the last rotation" is false of a set that has never had one. The
 * first rotation is due at the install odometer plus the interval, so a set
 * with no rotation logged counts from the install and the sentence says so.
 *
 * **Lands on the tire set**, not the advisor: the screen behind the tap
 * carries the record, the axis and the way to log the rotation. The advisor
 * is reachable from the car for the judgement calls — "is this wear pattern
 * normal?" — which are the paid feature and are not this notification's job.
 */
export function tireRotationNotification(params: {
  vehicleId: string;
  vehicleName: string;
  /** Miles since the last rotation, or since the install when there is none. */
  sinceMiles: number;
  /** The interval the owner entered. */
  intervalMiles: number;
  /** What `sinceMiles` counts from. */
  sinceBasis: 'rotation' | 'install';
  /** `mayClaimWarrantyTerms(interval)` — the owner entered the interval. */
  ownerEntered: boolean;
}): NotificationContent | null {
  const { vehicleId, vehicleName, sinceMiles, intervalMiles, sinceBasis, ownerEntered } = params;
  if (!ownerEntered) return null;

  const since = Math.round(sinceMiles).toLocaleString('en-US');
  const interval = Math.round(intervalMiles).toLocaleString('en-US');
  const counted =
    sinceBasis === 'rotation'
      ? `${since} miles since the last rotation.`
      : `${since} miles since these tires were installed, with no rotation on record.`;

  return {
    title: `Tire rotation due — ${vehicleName}`,
    body: `${counted} Your interval is ${interval}. You are currently outside your warranty's terms.`,
    url: tiresUrl(vehicleId),
  };
}

/**
 * Cut to a whole word and mark it, rather than mid-syllable.
 *
 * iOS truncates a long body itself, so this is not about fitting the banner —
 * it is about what gets *stored* and what the expanded notification shows. An
 * NHTSA summary runs to several hundred words; the whole of one in a
 * notification payload is a wall of regulatory prose where two lines and a way
 * to ask about it is the product.
 */
function truncate(text: string, max: number): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  if (clean.length <= max) return clean;

  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[.,;:]$/, '')}…`;
}
