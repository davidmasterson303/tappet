import { NextRequest, NextResponse } from 'next/server';
import { getServiceRoleClient, getServerClient } from '@/lib/supabase';
import { logger } from '@tappet/core/logger';
import { checkRateLimit, getClientIdentifier, rateLimitResponse } from '@/lib/rate-limit';
import { authorizeVehicleAccess, authorizeVehicleScopedRow } from '@/lib/api-auth';
import { isWishlistSource, WISHLIST_SOURCES } from '@tappet/core/wishlist-source';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const identifier = getClientIdentifier(request);
  const rateLimit = await checkRateLimit(identifier, 'default');
  if (!rateLimit.allowed) {
    logger.warn('WISHLIST_API:RATE_LIMIT', 'Rate limit exceeded', { identifier });
    return rateLimitResponse(rateLimit);
  }

  try {
    const { searchParams } = new URL(request.url);
    const vehicleId = searchParams.get('vehicleId');

    if (!vehicleId) {
      return NextResponse.json({ error: 'vehicleId is required' }, { status: 400 });
    }

    /*
      ── This was cookie-only, and that is the vehicles-route bug again ───────

      It hand-rolled `createServerActionClient()` + `auth.getUser()`, which reads
      `next/headers` cookies and nothing else. A React Native client presents
      `Authorization: Bearer <jwt>` and carries no cookies, so **GET returned 401
      to the mobile app** while POST and DELETE — which already used the shared
      helpers — worked. A wishlist you can add to and delete from but never read.

      `app/api/v1/vehicles/route.ts:43` records the identical defect being fixed
      there. The posture ratchet did not catch this one because the file *does*
      import and use `authorizeVehicleAccess` — just not in this handler.

      The helper already does everything the hand-rolled block did: demo ids get
      the anon client and are read-only, everything else resolves a caller from
      a cookie **or** a bearer token, and ownership is checked through the
      caller's own client so RLS applies to the check.
    */
    const access = await authorizeVehicleAccess(vehicleId, { intent: 'read' });
    if (!access.ok) {
      return access.response;
    }

    /*
      The data read deliberately keeps today's clients rather than adopting
      `access.client`.

      For a real vehicle `access.client` is the caller's RLS-scoped client, and
      whether `wishlist_items` carries a SELECT policy for an authenticated owner
      is not answerable from this repo: four migrations grant, revoke and drop
      policies on that table in sequence, and this project's standing rule is
      that the live database is the authority over its own migration files.

      Swapping the read as well would risk trading a 401 for a silently empty
      list, which is the worse failure — it looks like "you have no wishlist
      items" rather than like an error. Authorization is fixed here; adopting
      the caller's client is a separate change that needs the live policies read
      first.
    */
    const client = access.isDemo ? getServerClient() : getServiceRoleClient();

    const { data: wishlistItems, error } = await client
      .from('wishlist_items')
      .select('*')
      .eq('vehicle_id', vehicleId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('WISHLIST_API:GET', error as Error, { vehicleId });
      return NextResponse.json({ error: 'Could not load Needs' }, { status: 500 });
    }

    return NextResponse.json({ wishlistItems });
  } catch (error) {
    logger.error('WISHLIST_API:GET_EXCEPTION', error as Error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      vehicleId,
      itemType,
      itemName,
      itemIdentifier,
      description,
      category,
      estimatedCostParts,
      estimatedCostLabor,
      estimatedLaborHours,
      notes,
      source,
      sourceData,
    } = body;

    if (!vehicleId || !itemType || !itemName || !itemIdentifier) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!['issue', 'maintenance', 'modification'].includes(itemType)) {
      return NextResponse.json({ error: 'Invalid item type' }, { status: 400 });
    }

    /*
      ── 13 Sep · refuse an unknown source here, not in the database ────────

      `wishlist_items.source` is CHECKed to three words. A fourth one used to
      reach the insert, come back `23514`, and leave as a 500 that said
      "Failed to add item to wishlist" — which is what the phone's catalogue
      and Build ladder produced on every add, for weeks, with nothing in the
      message to say why. `@tappet/core/wishlist-source` carries the words;
      the client sends one of them or is told which it may send.
    */
    if (source !== undefined && !isWishlistSource(source)) {
      return NextResponse.json(
        { error: `Unknown source — one of ${WISHLIST_SOURCES.join(', ')}` },
        { status: 400 }
      );
    }

    const access = await authorizeVehicleAccess(vehicleId, { intent: 'write' });
    if (!access.ok) {
      return access.response;
    }

    const client = access.client;

    const { data: existingItem } = await client
      .from('wishlist_items')
      .select('id')
      .eq('vehicle_id', vehicleId)
      .eq('item_identifier', itemIdentifier)
      .maybeSingle();

    if (existingItem) {
      return NextResponse.json(
        { error: 'Already in Needs', itemId: existingItem.id },
        { status: 409 }
      );
    }

    const { data: wishlistItem, error } = await client
      .from('wishlist_items')
      .insert({
        vehicle_id: vehicleId,
        item_type: itemType,
        item_name: itemName,
        item_identifier: itemIdentifier,
        description: description || null,
        category: category || null,
        estimated_cost_parts: estimatedCostParts || 0,
        estimated_cost_labor: estimatedCostLabor || 0,
        estimated_labor_hours: estimatedLaborHours || 0,
        notes: notes || null,
        source: source || 'manual',
        source_data: sourceData || {},
      })
      .select()
      .single();

    if (error) {
      logger.error('WISHLIST_API:POST', error as Error, { vehicleId, itemType });
      return NextResponse.json({ error: 'Could not add that to Needs' }, { status: 500 });
    }

    return NextResponse.json({ wishlistItem }, { status: 201 });
  } catch (error) {
    logger.error('WISHLIST_API:POST_EXCEPTION', error as Error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const itemId = searchParams.get('itemId');

    const access = await authorizeVehicleScopedRow('wishlist_items', itemId, {
      intent: 'write',
    });
    if (!access.ok) {
      return access.response;
    }

    const { error, count } = await access.client
      .from('wishlist_items')
      .delete({ count: 'exact' })
      .eq('id', itemId);

    if (error) {
      logger.error('WISHLIST_API:DELETE', error as Error, { itemId });
      return NextResponse.json({ error: 'Could not remove that from Needs' }, { status: 400 });
    }

    // A delete that matched nothing must not report success — that is the
    // exact bug pattern found in delete-maintenance-item (task 0.7).
    if (count === 0) {
      return NextResponse.json({ error: 'That item is not in Needs' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('WISHLIST_API:DELETE_EXCEPTION', error as Error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
