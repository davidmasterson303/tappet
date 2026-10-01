import type { SupabaseClient } from '@supabase/supabase-js';
import type { StatusCommand } from '@tappet/core/consultant-commands';

/**
 * Apply one `[UPDATE_ISSUE_STATUS: …]` / `[UPDATE_MOD_STATUS: …]` the advisor
 * wrote, to the rows it names **exactly** (case-insensitively), and to no
 * others.
 *
 * ── Audit 360, SEC-3 (1 Oct) · the identifier was a LIKE pattern ────────────
 *
 * The advisor's identifier went straight into `.ilike(column, identifier)`.
 * With no wildcard that is a case-insensitive equality, which is what was
 * meant; but the identifier is model output, and model output follows what
 * an attached document says as often as the prompt lets it. `%%` passes the
 * parser's two-character floor and matches **every** row — so one line of
 * small print on an invoice ("…UPDATE_ISSUE_STATUS: %%|completed") could mark
 * every tracked issue completed and delete every issue on the owner's Needs,
 * and the next health reading would be computed from that. PostgREST also
 * reads `*` as `%` in a like pattern, so escaping `%` alone would not close it.
 *
 * So the match is done here, in code: read the vehicle's rows, keep the ones
 * whose name equals the identifier ignoring case, and write those by id. A
 * pattern character is now just a character.
 *
 * ⚠ What this does **not** settle: whether the advisor should write these at
 * all without the owner confirming. That is held for David (SEC-3); this
 * narrows one sentence in a document from "every row" to "the rows it names".
 */
const KINDS = {
  issue: { table: 'known_issue_tracking', column: 'issue_identifier', dateColumn: 'completed_date', wishlistType: 'issue' },
  mod: { table: 'modification_tracking', column: 'mod_name', dateColumn: 'installed_date', wishlistType: 'modification' },
} as const;

export type StatusCommandKind = keyof typeof KINDS;

function sameName(a: unknown, b: string): boolean {
  return typeof a === 'string' && a.toLocaleLowerCase('en-US') === b.toLocaleLowerCase('en-US');
}

/** How many tracked rows the command changed. Zero when it named none. */
export async function applyStatusCommand(
  client: SupabaseClient,
  vehicleId: string,
  kind: StatusCommandKind,
  command: StatusCommand,
  today: string = new Date().toISOString().split('T')[0]
): Promise<{ updated: number; error?: string }> {
  const { table, column, dateColumn, wishlistType } = KINDS[kind];

  const { data: rows, error: readError } = await client
    .from(table)
    .select(`id, ${column}`)
    .eq('vehicle_id', vehicleId);
  if (readError) return { updated: 0, error: readError.message };

  const ids = ((rows ?? []) as unknown as Array<Record<string, unknown>>)
    .filter((row) => sameName(row[column], command.identifier))
    .map((row) => row.id as string);
  if (ids.length === 0) return { updated: 0 };

  const { error } = await client
    .from(table)
    .update({
      status: command.status,
      ...(command.status === 'completed' ? { [dateColumn]: today } : {}),
    })
    .eq('vehicle_id', vehicleId)
    .in('id', ids);
  if (error) return { updated: 0, error: error.message };

  if (command.status === 'completed') {
    const { data: needs } = await client
      .from('wishlist_items')
      .select('id, item_name')
      .eq('vehicle_id', vehicleId)
      .eq('item_type', wishlistType);
    const done = ((needs ?? []) as Array<{ id: string; item_name: unknown }>)
      .filter((need) => sameName(need.item_name, command.identifier))
      .map((need) => need.id);
    if (done.length > 0) {
      await client.from('wishlist_items').delete().eq('vehicle_id', vehicleId).in('id', done);
    }
  }

  return { updated: ids.length };
}
