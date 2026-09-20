import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@tappet/core/logger';
import { checkRateLimit, getClientIdentifier, rateLimitResponse } from '@/lib/rate-limit';
import { authorizeVehicleScopedRow } from '@/lib/api-auth';
import { recomputePerformanceStats } from '@/lib/performance-stats';
import { projectNextService } from '@/lib/next-service';
import { validateMileageUpdate } from '@tappet/core/mileage-tracking';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const identifier = getClientIdentifier(request);
  const rateLimit = await checkRateLimit(identifier, 'default');
  if (!rateLimit.allowed) {
    logger.warn('WISHLIST_COMPLETE:RATE_LIMIT', 'Rate limit exceeded', { identifier });
    return rateLimitResponse(rateLimit);
  }

  try {
    const body = await request.json();
    const {
      itemId,
      serviceDate,
      shopName,
      isDIY,
      partsCost,
      laborCost,
      mileageAtService,
      notes,
      invoiceFile,
    } = body;

    // Resolves the item's parent vehicle and proves the caller owns it before
    // any privileged client is handed back. Demo items are rejected outright —
    // demo data is shared, so a write would corrupt it for every visitor.
    const access = await authorizeVehicleScopedRow('wishlist_items', itemId, {
      intent: 'write',
    });
    if (!access.ok) {
      return access.response;
    }

    const client = access.client;

    const { data: wishlistItem, error: fetchError } = await client
      .from('wishlist_items')
      .select('*')
      .eq('id', itemId)
      .maybeSingle();

    if (fetchError || !wishlistItem) {
      logger.error('WISHLIST_COMPLETE:FETCH', fetchError as Error, { itemId });
      return NextResponse.json(
        { error: 'That item is not in Needs' },
        { status: 404 }
      );
    }

    let documentId = null;
    if (invoiceFile) {
      const { data: document, error: docError } = await client
        .from('vehicle_documents')
        .insert({
          vehicle_id: wishlistItem.vehicle_id,
          document_type: 'invoice',
          file_url: invoiceFile.url,
          extraction_status: 'completed',
        })
        .select()
        .single();

      if (docError) {
        logger.error('WISHLIST_COMPLETE:DOC_INSERT', docError as Error, { itemId });
      } else {
        documentId = document.id;
      }
    }

    /*
      ── ⚠ Costs: null when not given, never 0 (20 Sep) ──────────────────────

      `partsCost || 0` stored a claim that the job was free for every blank
      field, and the sums above the history read it as one. CLAUDE.md §6:
      null is never 0. A cost is written only when one was sent; the total
      is the sum of what was sent, or null when nothing was.
    */
    const parts = typeof partsCost === 'number' && Number.isFinite(partsCost) ? partsCost : null;
    const labor = typeof laborCost === 'number' && Number.isFinite(laborCost) ? laborCost : null;
    const totalCost = parts === null && labor === null ? null : (parts ?? 0) + (labor ?? 0);

    /*
      ── The odometer, and why the record carries it (20 Sep) ─────────────────

      A record with no mileage cannot move a miles interval: the schedule
      counts from the last recorded mileage, so a service marked done today
      stayed "due in 2,500 mi" with ADD offered again. The sheet now sends
      the reading it showed (the car's current one, editable). A reading
      *newer* than the car's is the car's new reading — the owner is telling
      us where the odometer is — and it goes through the same rule every
      mileage write uses.
    */
    const mileage =
      typeof mileageAtService === 'number' && Number.isInteger(mileageAtService) && mileageAtService >= 0
        ? mileageAtService
        : null;

    const { data: maintenanceItem, error: insertError } = await client
      .from('maintenance_line_items')
      .insert({
        vehicle_id: wishlistItem.vehicle_id,
        service_date: serviceDate || new Date().toISOString().split('T')[0],
        shop_name: isDIY ? 'DIY' : shopName || 'Unknown',
        item_description: wishlistItem.item_name,
        category: wishlistItem.category || 'other',
        parts_cost: parts,
        labor_cost: labor,
        total_cost: totalCost,
        mileage_at_service: mileage,
        source_document_id: documentId,
        notes: notes || wishlistItem.notes,
        quantity: 1,
        unit_cost: totalCost,
        /*
          Attributed, because the history screen shows provenance per row and an
          unattributed one is indistinguishable from a record that predates the
          column. `'manual'` is the right value: a person in the app said this
          happened. Not `'vision'` — no document was read — and not
          `'owner-onboarding'`, which `20260808150000` reserved for a
          recollection given during sign-up.
        */
        source: 'manual',
      })
      .select()
      .single();

    if (insertError) {
      logger.error('WISHLIST_COMPLETE:MAINTENANCE_INSERT', insertError as Error, { itemId });
      return NextResponse.json(
        { error: 'Failed to create maintenance record' },
        { status: 500 }
      );
    }

    const { error: deleteError } = await client
      .from('wishlist_items')
      .delete()
      .eq('id', itemId);

    if (deleteError) {
      logger.error('WISHLIST_COMPLETE:DELETE', deleteError as Error, { itemId });
    }

    /*
      ── What a new record changes, changed here (20 Sep) ──────────────────────

      1. The odometer, when the record's reading is newer than the car's —
         validated by the rule the mileage PATCH uses, and refused silently
         (the record stands; the reading does not move) rather than failing
         a completion that already happened.
      2. The next service, re-projected from the schedule and the records —
         the sweep's maths, run now rather than at 3 am, so the due date
         moves the moment the job is marked done.
      3. The score, stamped stale the way an invoice upload stamps it: the
         phone and the web each refresh a stale reading when they next show
         the car, and a Flash call here would hold "Mark done" for it.
    */
    const vehicleId = wishlistItem.vehicle_id as string;
    if (mileage !== null) {
      const { data: car } = await client.from('vehicles').select('current_mileage').eq('id', vehicleId).maybeSingle();
      const current = typeof car?.current_mileage === 'number' ? car.current_mileage : null;
      if (current !== null && mileage > current) {
        const check = validateMileageUpdate({ current, next: mileage });
        if (check.ok) {
          const { error: odometerError } = await client
            .from('vehicles')
            .update({ current_mileage: mileage, last_mileage_update_date: new Date().toISOString() })
            .eq('id', vehicleId);
          if (odometerError) {
            logger.warn('WISHLIST_COMPLETE:ODOMETER', 'Could not move the reading', { vehicleId, error: odometerError.message });
          }
        } else {
          logger.warn('WISHLIST_COMPLETE:ODOMETER_REFUSED', check.message ?? 'refused', { vehicleId, mileage, current });
        }
      }
    }
    await projectNextService(vehicleId);
    const { error: staleError } = await client
      .from('vehicle_health_summary')
      .update({ last_generated: '2000-01-01T00:00:00.000Z' })
      .eq('vehicle_id', vehicleId);
    if (staleError) {
      logger.warn('WISHLIST_COMPLETE:STALE_SCORE', 'Could not mark the score stale', { vehicleId, error: staleError.message });
    }

    if (wishlistItem.item_type === 'modification') {
      /*
        Completing a mod changes the vehicle's service history, so its
        performance stats are now stale. Recomputed in process.

        This used to POST to `${request.nextUrl.origin}/api/performance-stats`
        with the caller's session cookie forwarded, so the inner route could
        authorize the hop. `nextUrl.origin` comes from the request's host
        headers, which made the destination of a request carrying a user's
        session cookie depend on a header the caller influences and on whether
        the platform in front of the app normalises it — a safety property
        owned by someone else's proxy config, invisible to every test here,
        and able to change without this code changing.

        Calling directly removes the question. `access` above already proved
        write access to this item's parent vehicle, which is strictly better
        evidence than a re-derived cookie, and `intent: 'write'` means a demo
        vehicle never reaches here.

        Best-effort and deliberately not awaited: the stats are derived display
        data, the dashboard recomputes on next view because the mod hash will
        differ, and marking an item complete should not wait on Gemini.
      */
      const rateLimit = await checkRateLimit(access.userId ?? identifier, 'ai');
      if (rateLimit.allowed) {
        recomputePerformanceStats({
          vehicleId: wishlistItem.vehicle_id,
          client,
          userId: access.userId,
          isDemo: false,
        }).catch(err => {
          logger.error('WISHLIST_COMPLETE:PERF_RECALC', err as Error, { vehicleId: wishlistItem.vehicle_id });
        });
      } else {
        logger.warn('WISHLIST_COMPLETE:PERF_RECALC_RATE_LIMIT', 'Skipped stat recompute', {
          vehicleId: wishlistItem.vehicle_id,
        });
      }
    }

    return NextResponse.json({
      success: true,
      maintenanceItem,
    });
  } catch (error) {
    logger.error('WISHLIST_COMPLETE:EXCEPTION', error as Error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
