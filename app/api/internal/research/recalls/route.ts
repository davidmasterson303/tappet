import { NextRequest } from 'next/server';
import { requireInternalSecret } from '@/lib/internal-secret';
import { getServiceRoleClient } from '@/lib/supabase';
import { loadVehicleForResearch } from '@/lib/research-job';
import { fetchNHTSARecalls } from '@/lib/vehicle-research';

export const dynamic = 'force-dynamic';

/**
 * NHTSA, asked first.
 *
 * In-process the recall fetch runs after the dossier. On the phone's path it
 * runs before, because it answers in seconds and the research log turns the
 * answer into two true lines about the person's car while the Pro call
 * runs. `fetchNHTSARecalls` writes the row and its `lookup_status`; this
 * answers with what it wrote, so the function log says what NHTSA said.
 *
 * A failure here is not fatal to the job: the row carries `failed`, the log
 * says NHTSA did not answer, and the sweep asks again overnight.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const refused = requireInternalSecret(request);
  if (refused) return refused;
  let vehicleId = '';
  try {
    vehicleId = String(((await request.json()) as { vehicleId?: unknown }).vehicleId ?? '');
  } catch {
    return Response.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!vehicleId) return Response.json({ success: false, error: 'Missing vehicleId' }, { status: 400 });

  const loaded = await loadVehicleForResearch(vehicleId);
  if (!loaded) return Response.json({ success: false, error: 'No such vehicle' }, { status: 404 });

  const { vehicle } = loaded;
  await fetchNHTSARecalls(vehicle.id, vehicle.year, vehicle.make, vehicle.model);

  const { data } = await getServiceRoleClient()
    .from('nhtsa_data')
    .select('lookup_status, recalls')
    .eq('vehicle_id', vehicleId)
    .maybeSingle();
  const recalls = Array.isArray(data?.recalls) ? data!.recalls.length : 0;
  return Response.json({ success: true, lookup_status: data?.lookup_status ?? null, recalls });
}
