'use client';

import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getSignedStorageUrl } from '@/app/actions';
import { getClientSupabase } from '@/lib/supabase';
import { platePublicUrl, type PlateStatus } from '@tappet/core/plates';
import { storagePathFromStoredUrl } from '@tappet/core/storage-paths';
import { isUnphotographedDemoVehicle } from '@tappet/core/demo';

/**
 * The client half of the private-bucket convention.
 *
 * Columns that used to hold a URL now hold a storage path (`storedUrl` in
 * `@tappet/core/storage-paths`). Nothing renderable can be persisted: a
 * public URL never resolves against a private bucket, and a signed one
 * expires. So the exchange happens per read, here.
 *
 * ── Why a query and not a `useEffect` ───────────────────────────────────────
 *
 * The garage renders one card per vehicle, each holding its own photo URL.
 * With an effect that is N server round trips per mount and N more on every
 * remount. React Query keys the exchange on the stored URL, so the cache is
 * shared across cards and survives navigation between the garage and a
 * dashboard — the same photo is signed once, not once per component.
 *
 * `staleTime` is deliberately well under the hour a signed URL lives. A cached
 * entry handed out at 55 minutes would be technically fresh and about to break
 * in the user's hands; refreshing at 30 leaves the whole second half of the
 * window as slack.
 */
const SIGNED_URL_STALE_MS = 30 * 60 * 1000;

/**
 * Resolve a stored URL for rendering.
 *
 * Returns:
 *   - the input unchanged, if it is not a stored path (demo `/vehicles/…`
 *     assets, external image URLs, and `null`/`undefined` pass straight
 *     through — no request is made);
 *   - `undefined` while a stored path is being signed, and if signing fails.
 *
 * Pending and failed collapse into `undefined` on purpose. Call sites render a
 * photo or they don't; there is no third state a broken `<img>` improves on,
 * and the alternative — showing a fallback for the ~200ms before the real
 * photo arrives — is a visible swap on every page load.
 */
export function useSignedUrl(url: string | null | undefined): string | undefined {
  const isStored = storagePathFromStoredUrl(url) !== null;

  const { data } = useQuery({
    queryKey: ['signed-url', url],
    enabled: isStored,
    staleTime: SIGNED_URL_STALE_MS,
    gcTime: SIGNED_URL_STALE_MS,
    // A failure here is an authorization answer far more often than a network
    // blip — the caller does not own the vehicle, or the object is gone.
    // Retrying re-asks a question already answered.
    retry: false,
    queryFn: async () => {
      const result = await getSignedStorageUrl(url as string);
      if (!result.success || !result.url) {
        throw new Error(result.error || 'Could not sign storage URL');
      }
      return result.url;
    },
  });

  if (!isStored) return url ?? undefined;
  return data;
}

interface VehicleImageFields {
  /**
   * Read only to honour the deliberately-unphotographed demo car.
   *
   * Optional because not every caller has it, and a caller without it simply
   * gets the ordinary resolution — the carve-out is a demo concern, not a
   * correctness one.
   */
  id?: string | null;
  /** The owner's uploaded photo, stored as a path. */
  custom_image_url?: string | null;
  /** The stock photo — a local `/vehicles/…` asset, already renderable. */
  image_url?: string | null;
  /** The generation plate the car stands on when it has neither (11 Sep). */
  plate_key?: string | null;
}

/** The columns the card reads off a `vehicle_plates` row. */
export interface PlateStatusRow {
  key: string;
  status: PlateStatus;
  hero_path: string | null;
}

/**
 * The library row for a plate key, read anonymously and re-read while it is
 * still drawing.
 *
 * ── Why the card polls, and how it stops ────────────────────────────────────
 *
 * A plate is asked for at VIN decode and drawn in the background; the card
 * that shows the car may mount before it is ready. Polling every five seconds
 * while the row says `pending`/`generating` is what lets the photograph
 * arrive without a reload — the same fade `VehicleIdentity` already uses for
 * a signed URL. It stops the moment the row is `ready` or `failed`, and after
 * three minutes it drops to a lazy thirty seconds so a stuck job never keeps
 * a tab busy. Keyed on the plate, so a garage of two of the same generation
 * asks once.
 */
export function usePlate(plateKey: string | null | undefined) {
  const startedAt = useRef(Date.now());
  return useQuery({
    queryKey: ['plate', plateKey ?? null],
    enabled: Boolean(plateKey),
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<PlateStatusRow | null> => {
      const supabase = getClientSupabase();
      const { data, error } = await supabase
        .from('vehicle_plates')
        .select('key,status,hero_path')
        .eq('key', plateKey as string)
        .maybeSingle();
      if (error) throw error;
      return (data as PlateStatusRow | null) ?? null;
    },
    refetchInterval: (query) => {
      const row = query.state.data;
      if (!row || row.status === 'ready' || row.status === 'failed') return false;
      return Date.now() - startedAt.current < 3 * 60 * 1000 ? 5_000 : 30_000;
    },
  });
}

/** The public URL of a ready plate's hero, or null. */
export function platePhotoUrl(row: PlateStatusRow | null | undefined): string | null {
  if (!row || row.status !== 'ready' || !row.hero_path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return platePublicUrl(base, row.hero_path);
}

/**
 * The photograph to render for a vehicle, resolved and ready for an `<img>`.
 *
 * Every surface that shows a car was writing `custom_image_url || image_url`
 * inline. That expression is now wrong in two ways at once — the first operand
 * needs signing, and the `||` picks the stock photo during the moment the
 * owner's is still resolving, producing a visible swap from a stranger's car
 * to theirs on every load. So the precedence rule lives here instead: an owner
 * photo, once one exists, is the only thing that surface will ever show.
 *
 * Accepts a nullable vehicle so callers can satisfy the rules of hooks before
 * their loading and error branches.
 */
export function useVehicleImage(
  vehicle: VehicleImageFields | null | undefined
): string | undefined {
  const signed = useSignedUrl(vehicle?.custom_image_url);

  /*
    One demo car is unphotographed on purpose, and the check belongs here rather
    than at a call site because "does this vehicle have a photograph" has to
    answer the same way everywhere. Putting it in VehicleCard alone gave the M3 a
    plate in the garage and a photograph on its dashboard — the seeded row still
    carries an `image_url`, so every other surface kept rendering it.

    Five screens resolve a vehicle photo through this hook. This is the only
    place all five agree.
  */
  /*
    The generation plate ranks last (11 Sep): after the owner's photograph
    and after a stock `image_url`, which only the demo cars carry. A car
    with none of the three stands on the house plate, exactly as before.
  */
  const plate = usePlate(
    vehicle?.custom_image_url || vehicle?.image_url ? null : vehicle?.plate_key,
  );

  if (vehicle?.id && isUnphotographedDemoVehicle(vehicle.id)) return undefined;

  if (vehicle?.custom_image_url) return signed;
  if (vehicle?.image_url) return vehicle.image_url;
  return platePhotoUrl(plate.data) ?? undefined;
}

/**
 * What the card may say about a plate that is not showing yet. Null when
 * there is nothing honest to add — no plate asked for, a photograph already
 * on screen, or a plate that is ready (the photograph speaks).
 */
export function useVehiclePlateStatus(
  vehicle: VehicleImageFields | null | undefined
): PlateStatus | null {
  const plate = usePlate(
    vehicle?.custom_image_url || vehicle?.image_url ? null : vehicle?.plate_key,
  );
  const status = plate.data?.status ?? null;
  return status === 'ready' ? null : status;
}
