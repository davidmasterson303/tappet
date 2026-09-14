/**
 * Give every Needs row written before 13 Sep the reason and the figure a row
 * written today carries.
 *
 *   node --require sucrase/register scripts/backfill-needs-reasons.ts          # dry run
 *   node --require sucrase/register scripts/backfill-needs-reasons.ts --apply  # writes
 *
 * (TypeScript, because the lookup is core's own — `suggestionsFor` — and a
 * second implementation of it in a script is the class of bug this codebase
 * keeps finding. `sucrase` arrives with tailwind; there is no tsx here.)
 *
 * ── What it does, and only that ─────────────────────────────────────────────
 *
 * A Needs row has three things a person reads: the name, the reason beneath
 * it (`description`) and the figure at the rule (`source_data.value`, with
 * the sentence it came from in `.note`). The phone's catalogue has written
 * all three since 13 Sep and the web's dossier add since `25a182b`; every
 * `dossier` row written before that has the name alone — David's M235i has
 * one, the demo cars have eleven from the June reseed — and reads bare on
 * both clients.
 *
 * For each `source = 'dossier'` row with no `description`, the car's dossier
 * is read and core's suggestions searched for the row's identifier. A match
 * writes the reason and, where core has one, the figure. No match writes
 * nothing and says so. Nothing else on the row is touched, and rows that
 * already carry a reason are never revisited — a person may have edited it.
 *
 * ⚠ The demo rows are included on purpose: the demo refuses writes from its
 * clients, not from its maintainers, and the reasons are the cars' own
 * dossiers, not invented (CLAUDE.md §10). Dry run by default, like every
 * script here that writes.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { suggestionsFor } from '../packages/core/src/wishlist-suggestions';
import { wishlistItemIdentifier } from '../packages/core/src/wishlist-identifier';
import type { WishlistSourceData } from '../packages/core/src/wishlist-source';

const APPLY = process.argv.includes('--apply');

function env(name: string): string {
  if (process.env[name]) return process.env[name] as string;
  const line = readFileSync(join(__dirname, '..', '.env'), 'utf8')
    .split('\n')
    .find((l) => l.startsWith(`${name}=`));
  if (!line) throw new Error(`${name} is not set and not in .env`);
  return line.slice(name.length + 1).trim().replace(/^["']|["']$/g, '');
}

interface Row {
  id: string;
  vehicle_id: string;
  item_type: 'issue' | 'maintenance' | 'modification';
  item_name: string;
  item_identifier: string;
  description: string | null;
  source: string;
  source_data: Record<string, unknown> | null;
}

async function main(): Promise<number> {
  const client = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SECRET_KEY'), {
    auth: { persistSession: false },
  });

  const { data: rows, error } = await client
    .from('wishlist_items')
    .select('id,vehicle_id,item_type,item_name,item_identifier,description,source,source_data')
    .eq('source', 'dossier')
    .is('description', null)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`reading wishlist_items: ${error.message}`);

  const bare = (rows ?? []) as Row[];
  console.log(`${bare.length} dossier row(s) with no reason.`);
  if (bare.length === 0) return 0;

  const vehicleIds = Array.from(new Set(bare.map((r) => r.vehicle_id)));
  const { data: dossiers, error: dossierError } = await client
    .from('vehicle_knowledge_base')
    .select('vehicle_id,known_issues,maintenance_schedule,common_mods')
    .in('vehicle_id', vehicleIds);
  if (dossierError) throw new Error(`reading vehicle_knowledge_base: ${dossierError.message}`);

  const byVehicle = new Map<string, ReturnType<typeof suggestionsFor>>();
  for (const dossier of dossiers ?? []) {
    byVehicle.set(dossier.vehicle_id as string, suggestionsFor(dossier));
  }

  let written = 0;
  let unmatched = 0;
  for (const row of bare) {
    const suggestions = byVehicle.get(row.vehicle_id) ?? [];
    const identifier = row.item_identifier || wishlistItemIdentifier(row.item_type, row.item_name);
    const match =
      suggestions.find((s) => s.identifier === identifier) ??
      suggestions.find((s) => s.identifier === wishlistItemIdentifier(row.item_type, row.item_name));

    const car = row.vehicle_id.slice(0, 8);
    if (!match) {
      unmatched += 1;
      console.log(`  —  ${car}  ${row.item_type.padEnd(12)} ${row.item_name}  (not in this car's dossier; left alone)`);
      continue;
    }

    const sourceData: WishlistSourceData = {
      ...(match.note ? { note: match.note } : {}),
      ...(match.value ? { value: match.value } : {}),
    };
    const patch = {
      description: match.reason,
      ...(Object.keys(sourceData).length > 0 ? { source_data: { ...(row.source_data ?? {}), ...sourceData } } : {}),
    };
    console.log(`  ✓  ${car}  ${row.item_type.padEnd(12)} ${row.item_name}`);
    console.log(`       ${match.reason}${match.value ? `   [${match.value}]` : ''}`);

    if (!APPLY) continue;
    const { error: writeError } = await client.from('wishlist_items').update(patch).eq('id', row.id);
    if (writeError) throw new Error(`writing ${row.id}: ${writeError.message}`);
    written += 1;
  }

  console.log(
    APPLY
      ? `\nWrote ${written} row(s); ${unmatched} left alone.`
      : `\nDry run. ${bare.length - unmatched} row(s) would be written, ${unmatched} left alone. Re-run with --apply.`
  );
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
