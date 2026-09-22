import { NextRequest, NextResponse } from 'next/server';

import { logger } from '@tappet/core/logger';
import { normaliseRecalls, recallRecordDescription } from '@tappet/core/recalls';
import { authorizeVehicleAccess } from '@/lib/api-auth';
import { getServiceRoleClient } from '@/lib/supabase';
import { checkRateLimit, getClientIdentifier, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * What an owner has done about a recall.
 *
 * ── Why this route exists at all ────────────────────────────────────────────
 *
 * The phone could see recalls and could ask the advisor about them, and could
 * do nothing else. A safety notice you cannot ever clear is a notice that stops
 * being read: it sits on the garage chip and the detail banner forever, so
 * after the second week it is furniture rather than information — which is the
 * precise failure mode a permanent red badge has.
 *
 * ⚠ **The storage was already there and already used by the other client.**
 * `recall_actions` has existed since the 14 Mar migration, and `RecallAlerts`
 * on web writes to it from the browser through supabase-js. Mobile cannot do
 * that, and should not: `mobile-api-only.test.ts` forbids a Supabase client on
 * the device, for the reason that file records — a client that talks to tables
 * directly is a second answer to "who may see this", and the second answer is
 * the one that is wrong. So the phone gets a route, and the route is the same
 * authorization every other `/api/v1` path uses.
 *
 * ── ⚠ "Repaired" is the owner's claim, and this route never upgrades it ─────
 *
 * Nothing here verifies anything. NHTSA does not tell us a specific car was
 * fixed — recalls match on **year/make/model, not VIN** (`advice-range.ts`
 * carries that argument, and `CLAUDE.md` §10 makes it a standing rule), so the
 * most this product can honestly hold is *"you told us you had this done, on
 * this date"*.
 *
 * Three consequences, and all three are in the shape of this endpoint rather
 * than in a comment somewhere:
 *
 *   - The row stores `addressed_at`, a **date the owner asserted**, and the
 *     clients render it as such. There is no `verified` column and there must
 *     not be one until something can verify it.
 *   - `DELETE` exists and is a first-class operation, not an admin escape
 *     hatch. A claim someone can make and cannot unmake is a trap, and a
 *     mis-tap on a safety notice is exactly the tap worth being able to undo.
 *   - The recall itself is never deleted or hidden by this route. It returns
 *     *what has been marked*; deciding that a marked recall drops out of the
 *     open count is the client's business, and the notice stays readable.
 *
 * ── ⚠ 22 Sep · a mark files a service record, and an undo takes it back ────
 *
 * David: *"a recall should improve a score once fixed AND go into history."*
 * The score half is `recallDriver`, which subtracts marked campaigns as of
 * 22 Sep. This half is here: a mark writes one `maintenance_line_items` row —
 * the work was done on the car, and a score that rises with nothing in the
 * record to show for it is a rise an owner cannot check.
 *
 * Three decisions the row's shape carries:
 *
 *   - `source: 'manual'` — "a person in the app said this happened", the value
 *     `wishlist/complete` files a completion under. Not a new `'recall'`
 *     source: `maintenance_line_items_source_check` permits four values and a
 *     fifth is a migration, which is David's (probed 22 Sep — a `'recall'`
 *     insert is refused `23514`, `'manual'` walks every constraint and fails
 *     last on the FK).
 *   - **No cost and no shop.** Nobody told us either. A recall repair is free
 *     at a franchised dealer, but that is a fact about the campaign and not
 *     about this visit, and `0` would print as a price (§10). Both columns
 *     take null; the history screen omits what is absent.
 *   - The campaign number is **in the description** (`recallRecordDescription`
 *     in core), because there is no campaign column and the undo has to find
 *     this row again. One function writes it so the two halves cannot drift.
 *
 * ⚠ **The record is not the mark.** If the insert fails the mark still stands:
 * the safety claim is the thing being stored, and refusing it because a
 * history row could not be written would lose the more important half. The
 * failure is logged and the response says whether the record landed.
 *
 * ── The shape, and why GET returns a list rather than a count ───────────────
 *
 * A count would be enough for the garage chip and useless for the recall
 * screen, which has to know **which** campaign was marked and when. Returning
 * the rows lets one request serve both, and it means the chip's number is
 * derived from the same data the detail screen shows rather than from a second
 * number that can disagree with it.
 */

interface AddressedRecall {
  campaignNumber: string;
  /** `YYYY-MM-DD`, as the owner asserted it. Never a verification. */
  addressedAt: string;
}

/**
 * A campaign number, or `null`.
 *
 * ⚠ Bounded and character-checked before it reaches the database. NHTSA's
 * numbers are short (`23V-441`, `PE24-012`), and this string arrives from a
 * client and is written to a `TEXT` column with a `UNIQUE` constraint on it —
 * so an unbounded value is a client choosing how much of our storage one row
 * occupies. The check is deliberately loose about *format*: NHTSA has changed
 * its numbering more than once, and a route that refused a genuine campaign
 * because it did not match a regex would be refusing the safety notice.
 */
function readCampaignNumber(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 40) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9 ._/-]*$/.test(trimmed)) return null;

  return trimmed;
}

function rows(data: unknown): AddressedRecall[] {
  if (!Array.isArray(data)) return [];

  return data.flatMap((row) => {
    const record = row as { campaign_number?: unknown; addressed_at?: unknown };
    if (typeof record.campaign_number !== 'string') return [];

    return [
      {
        campaignNumber: record.campaign_number,
        addressedAt:
          typeof record.addressed_at === 'string'
            ? record.addressed_at
            : /*
                The column is `NOT NULL DEFAULT CURRENT_DATE`, so this branch
                should be unreachable — and it is here rather than as a `!`
                because "should be unreachable" is what every stale docblock in
                this repository said about something. An empty string renders as
                a missing date; a crash renders as a broken recall screen.
              */
              '',
      },
    ];
  });
}

/** Everything this owner has marked on this vehicle. */
export async function GET(request: NextRequest): Promise<Response> {
  const rateLimit = await checkRateLimit(getClientIdentifier(request), 'default');
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  const vehicleId = new URL(request.url).searchParams.get('vehicleId');

  const access = await authorizeVehicleAccess(vehicleId, { intent: 'read' });
  if (!access.ok) return access.response;

  /*
    The service-role client, matching `wishlist/route.ts` and for the reason
    written there: whether `recall_actions` carries a SELECT policy for an
    authenticated owner is a question about the live database rather than about
    the migrations folder, and reading through the caller's client would trade a
    clear 401 for a silently empty list. Ownership has already been established
    above, through the caller's own client, so RLS did apply to the check that
    matters.

    ⚠ A demo vehicle reaches here with `isDemo` and no user. It has no marks and
    cannot gain any — `intent: 'write'` refuses it below — so it reads as an
    empty list, which is the truth rather than a special case.
  */
  const { data, error } = await getServiceRoleClient()
    .from('recall_actions')
    .select('campaign_number,addressed_at')
    .eq('vehicle_id', vehicleId)
    .order('addressed_at', { ascending: false });

  if (error) {
    logger.error('RECALLS_API:GET', new Error(error.message), { vehicleId });
    return NextResponse.json({ error: 'Failed to read recall history' }, { status: 500 });
  }

  return NextResponse.json({ addressed: rows(data) });
}

/**
 * Mark a recall repaired.
 *
 * An upsert on `(vehicle_id, campaign_number)`, which the table already
 * constrains as unique — so marking the same campaign twice moves the date
 * rather than failing, and a double-tap on a slow connection is not an error
 * anybody has to see.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const rateLimit = await checkRateLimit(getClientIdentifier(request), 'default');
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body' }, { status: 400 });
  }

  const vehicleId = typeof body.vehicleId === 'string' ? body.vehicleId : null;
  const campaignNumber = readCampaignNumber(body.campaignNumber);

  const access = await authorizeVehicleAccess(vehicleId, { intent: 'write' });
  if (!access.ok) return access.response;

  if (!campaignNumber) {
    return NextResponse.json({ error: 'A campaign number is required' }, { status: 400 });
  }

  /*
    The date is **the server's**, not the client's.

    A body-supplied date would let a phone with a wrong clock write "repaired
    in 2019" onto a 2024 campaign, and this is a safety record. If backdating
    ever becomes a feature — "I had this done last spring" is a reasonable thing
    to want to say — it needs its own bounded field and its own argument, not a
    field this route happens to trust.
  */
  const addressedAt = new Date().toISOString().slice(0, 10);

  const { error } = await getServiceRoleClient()
    .from('recall_actions')
    .upsert(
      { vehicle_id: vehicleId, campaign_number: campaignNumber, addressed_at: addressedAt },
      { onConflict: 'vehicle_id,campaign_number' }
    );

  if (error) {
    logger.error('RECALLS_API:POST', new Error(error.message), { vehicleId });
    return NextResponse.json({ error: 'Could not save that' }, { status: 500 });
  }

  logger.info('RECALLS_API:MARKED', 'Recall marked as repaired by its owner', { vehicleId });

  const recorded = await fileRecallRecord(vehicleId as string, campaignNumber, addressedAt);

  return NextResponse.json({ addressed: { campaignNumber, addressedAt }, recorded });
}

/**
 * The description this vehicle's row for a campaign carries — written once,
 * read by the insert and by the undo, from our own NHTSA row.
 *
 * ⚠ The component name comes from **our** `nhtsa_data`, never the request: a
 * client sends a campaign number and nothing else, and a description taken
 * from a body would be free text written into the service history. A car
 * whose NHTSA row is missing gets the number alone, which is true.
 */
async function describeRecallRecord(vehicleId: string, campaignNumber: string): Promise<string> {
  const { data } = await getServiceRoleClient()
    .from('nhtsa_data')
    .select('recalls')
    .eq('vehicle_id', vehicleId)
    .maybeSingle();

  const match = normaliseRecalls((data as { recalls?: unknown } | null)?.recalls).find(
    (recall) => recall.campaignNumber === campaignNumber
  );

  return recallRecordDescription(campaignNumber, match?.component);
}

/**
 * File the service record for a marked campaign. Returns whether it landed.
 *
 * ⚠ Never throws and never fails the mark — see the header.
 *
 * Idempotent with the upsert above it: marking a campaign twice must not file
 * the record twice, so it looks for its own row first. The description is the
 * key, which is what makes that lookup possible at all.
 */
async function fileRecallRecord(
  vehicleId: string,
  campaignNumber: string,
  addressedAt: string
): Promise<boolean> {
  try {
    const client = getServiceRoleClient();
    const description = await describeRecallRecord(vehicleId, campaignNumber);

    const { data: existing } = await client
      .from('maintenance_line_items')
      .select('id')
      .eq('vehicle_id', vehicleId)
      .eq('item_description', description)
      .limit(1);

    if (Array.isArray(existing) && existing.length > 0) return true;

    const { error } = await client.from('maintenance_line_items').insert({
      vehicle_id: vehicleId,
      service_date: addressedAt,
      item_description: description,
      category: 'other',
      quantity: 1,
      /* Nobody told us either of these, and a 0 prints as a price (§10). */
      shop_name: null,
      total_cost: null,
      unit_cost: null,
      mileage_at_service: null,
      notes: 'Marked repaired by the owner. Recalls are matched on year, make and model, not this VIN.',
      source: 'manual',
    });

    if (error) {
      logger.error('RECALLS_API:RECORD', new Error(error.message), { vehicleId, campaignNumber });
      return false;
    }

    return true;
  } catch (cause) {
    logger.error('RECALLS_API:RECORD', cause as Error, { vehicleId, campaignNumber });
    return false;
  }
}

/**
 * Undo a mark.
 *
 * ⚠ First-class, not an escape hatch — see the header. The one thing an owner
 * can assert here is a claim about their own car, and a claim that cannot be
 * withdrawn is a trap on the one screen where a mis-tap matters most.
 */
export async function DELETE(request: NextRequest): Promise<Response> {
  const rateLimit = await checkRateLimit(getClientIdentifier(request), 'default');
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  const params = new URL(request.url).searchParams;
  const vehicleId = params.get('vehicleId');
  const campaignNumber = readCampaignNumber(params.get('campaignNumber'));

  const access = await authorizeVehicleAccess(vehicleId, { intent: 'write' });
  if (!access.ok) return access.response;

  if (!campaignNumber) {
    return NextResponse.json({ error: 'A campaign number is required' }, { status: 400 });
  }

  const { error } = await getServiceRoleClient()
    .from('recall_actions')
    .delete()
    .eq('vehicle_id', vehicleId)
    .eq('campaign_number', campaignNumber);

  if (error) {
    logger.error('RECALLS_API:DELETE', new Error(error.message), { vehicleId });
    return NextResponse.json({ error: 'Could not undo that' }, { status: 500 });
  }

  /*
    ⚠ And the record the mark filed goes with it (22 Sep). A withdrawn claim
    that leaves a service record behind is worse than never filing one: the
    history would carry a repair the owner has just said did not happen, and
    the score would keep the credit for it.

    Both spellings are removed — the number alone and the number with its
    component — because the row may have been filed while our NHTSA read was
    missing and the component named later. A row an owner typed themselves
    cannot collide: the description is generated and nothing in the app types
    one.
  */
  try {
    const described = await describeRecallRecord(vehicleId as string, campaignNumber);
    /* Two spellings at most, and `Set` cannot be spread at this target. */
    const bare = recallRecordDescription(campaignNumber);
    const descriptions = described === bare ? [bare] : [described, bare];

    const { error: recordError } = await getServiceRoleClient()
      .from('maintenance_line_items')
      .delete()
      .eq('vehicle_id', vehicleId as string)
      .in('item_description', descriptions);

    if (recordError) {
      logger.error('RECALLS_API:RECORD_UNDO', new Error(recordError.message), { vehicleId, campaignNumber });
    }
  } catch (cause) {
    logger.error('RECALLS_API:RECORD_UNDO', cause as Error, { vehicleId, campaignNumber });
  }

  return NextResponse.json({ removed: campaignNumber });
}
