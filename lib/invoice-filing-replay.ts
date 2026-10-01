/**
 * ── A filing whose answer was lost is answered, not filed again ─────────────
 *
 * Audit 360, TL-2 (1 Oct). `uploadInvoicePages` files a scan and then removes
 * its pages. When the phone never hears the answer — the app backgrounded
 * mid-request, a cell handoff, the platform's gateway answering 502/504 while
 * the function finished — it shows Try again, and Try again sends the same
 * page paths. Those pages are gone, the route answers `PAGE_MISSING`, the
 * phone re-uploads every page from disk and files them again: a second
 * document, every line item twice, a second model fee.
 *
 * The fix needs no column. Every pending page path is
 * `<vehicle>/invoices/pages/<ms>-<rand>-<name>`, so the first page's
 * `<ms>-<rand>` is unique to the scan, and the stored invoice's name now
 * carries it (`filedInvoiceName`) — the single page's name always did,
 * because a one-page scan is stored under the page's own file name. A filing
 * looks for a document already stored from that scan *before* reading a page:
 *
 *   - `completed` → the scan was filed. Answer with that document, exactly as
 *     the first filing would have. Phones already running build 2 get this on
 *     their Try again with no change on the phone.
 *   - `pending`, and recent (`FILING_IN_FLIGHT_MS`) → the first filing is
 *     still reading it (the retry overtook it). Refused with `FILING_IN_PROGRESS`; a later Try again gets
 *     the `completed` answer.
 *   - anything else (a stale `pending` from a filing the platform killed, a
 *     `failed` extraction) → filed normally. A refused parse deletes its own
 *     row, so it never blocks the retry it invites.
 *
 * ⚠ One scan per first page: the phone uploads each photograph once, so two
 * different scans never share a first page path.
 */

/**
 * How long a `pending` filing is taken to be still running.
 *
 * ⚠ Audit 360, TL-14 (1 Oct, round 2) · was ten minutes. A filing the
 * platform killed mid-model-call leaves its row `pending`, and every Try
 * again inside this window was told "still reading… check the service log in
 * a minute" about a filing that was dead — nine times over ten minutes.
 *
 * Two minutes: past the phone's own 90 s wait (`documents.ts`), so a retry
 * the phone makes while its first request could still be answered is
 * refused, and past any synchronous function ceiling Netlify sets (its
 * synchronous functions stop in seconds-to-a-minute, never minutes). The
 * measured `web-live` ceiling is held for David; if it is ever raised past
 * this, raise this with it — a filing still running when a retry files
 * afresh is a double filing. `FILING_IN_FLIGHT_MS > PHONE_FILING_WAIT_MS` is
 * pinned in the test.
 */
export const FILING_IN_FLIGHT_MS = 2 * 60 * 1000;

/** The phone's wait for a filing (`apps/mobile/src/api/documents.ts`). */
export const PHONE_FILING_WAIT_MS = 90_000;

/** The scan's identity: the first page's `<ms>-<rand>` stamp, or null. */
export function scanToken(firstPagePath: string): string | null {
  const name = firstPagePath.split('/').pop() ?? '';
  const match = /^(\d{10,})-([a-z0-9]{1,8})-/.exec(name);
  return match ? `${match[1]}-${match[2]}` : null;
}

/** The stored name of a multi-page scan — carries the scan's token. */
export function filedInvoiceName(firstPagePath: string, pageCount: number): string {
  const token = scanToken(firstPagePath);
  return token ? `scan-${token}-${pageCount}-pages.pdf` : `invoice-${pageCount}-pages.pdf`;
}

/** The narrow slice of a Supabase client this module reads through. */
type Query = PromiseLike<{ data: unknown; error: unknown; count?: number | null }> & {
  eq: (column: string, value: string) => Query;
  like: (column: string, pattern: string) => Query;
  order: (column: string, options: { ascending: boolean }) => Query;
  limit: (n: number) => Query;
};
export type ReplayClient = {
  from: (table: string) => { select: (columns: string, options?: { count: 'exact'; head: true }) => Query };
};

export type PriorFiling =
  | { state: 'filed'; documentId: string; itemsExtracted: number }
  | { state: 'in-flight' }
  | { state: 'none' };

/**
 * What became of an earlier filing of these pages, if there was one.
 *
 * A read failure answers `none`: the caller then files as it always did,
 * which is the shape that existed before this — never a refusal on a guess.
 */
export async function priorFiling(
  client: ReplayClient,
  vehicleId: string,
  pagePaths: string[],
  now: number = Date.now()
): Promise<PriorFiling> {
  const token = pagePaths[0] ? scanToken(pagePaths[0]) : null;
  if (!token) return { state: 'none' };
  return priorFilingOf(client, vehicleId, token, now);
}

/**
 * ── The web's single-file filing, given the same replay (TL-31, 1 Oct) ─────
 *
 * The multipart form (`uploadInvoice`) stored every call under a fresh
 * unique path, so it had nothing to replay on: a filing whose answer was
 * lost (a dropped connection, a gateway's 502/504 after the document and
 * its line items were written) was reported by the website as "could not be
 * uploaded… try again", and the retry filed the invoice a second time.
 *
 * The website now mints a **filing key** once per file the owner chose —
 * the same `<ms>-<rand>` shape a page path carries — and sends it with every
 * attempt at that file. The stored name carries it (`filedUploadName`), so
 * `priorFilingOf` finds the earlier filing exactly as it does for a scan.
 *
 * ⚠ The key is per *choice*, not per *content*. A retry of the file still in
 * the dialog sends the same key and is answered with what it filed; the same
 * invoice chosen again later (a new `File`, a new key) is a deliberate second
 * filing and is filed. Two different invoices never share a key. Hashing the
 * bytes instead would refuse the owner who means to file a copy twice, and
 * would answer the retry of a *reduced* copy differently from its original.
 *
 * No key (a caller older than this) files exactly as it always did.
 */
export function filingKeyToken(key: unknown): string | null {
  if (typeof key !== 'string') return null;
  return /^\d{10,}-[a-z0-9]{1,8}$/.test(key) ? key : null;
}

/** A filing key, minted once per chosen file — the shape `filingKeyToken` accepts. */
export function mintFilingKey(now: number = Date.now(), random: () => number = Math.random): string {
  const rand = random().toString(36).slice(2, 8) || '0';
  return `${now}-${rand}`;
}

/**
 * The name a keyed single-file filing is stored under: it carries the key.
 *
 * ⚠ The owner's file name is clipped first: `vehicleStoragePath` keeps the
 * last 120 characters, and a long name would otherwise push the key out of
 * the stored name — the replay would silently find nothing.
 */
export function filedUploadName(key: string, fileName: string): string {
  return `${key}-${fileName.slice(-90)}`;
}

/** What became of an earlier filing that carried `token`, if there was one. */
export async function priorFilingOf(
  client: ReplayClient,
  vehicleId: string,
  token: string,
  now: number = Date.now()
): Promise<PriorFiling> {
  const { data, error } = await client
    .from('vehicle_documents')
    .select('id, extraction_status, upload_date')
    .eq('vehicle_id', vehicleId)
    // `/invoices/` and not `/invoices/pages/`: the pages are never documents.
    .like('file_url', `%/invoices/%-${token}-%`)
    .order('upload_date', { ascending: false })
    .limit(1);
  if (error || !Array.isArray(data) || data.length === 0) return { state: 'none' };

  const row = data[0] as { id: string; extraction_status: string | null; upload_date: string | null };
  if (row.extraction_status === 'completed') {
    const { count } = await client
      .from('maintenance_line_items')
      .select('id', { count: 'exact', head: true })
      .eq('source_document_id', row.id);
    return { state: 'filed', documentId: row.id, itemsExtracted: typeof count === 'number' ? count : 0 };
  }

  const at = row.upload_date ? Date.parse(row.upload_date) : NaN;
  if (row.extraction_status === 'pending' && Number.isFinite(at) && now - at < FILING_IN_FLIGHT_MS) {
    return { state: 'in-flight' };
  }
  return { state: 'none' };
}

/** What a phone shows for `FILING_IN_PROGRESS` — the route sends it as `error`. */
export const FILING_IN_PROGRESS_MESSAGE =
  'Tappet is still reading this invoice. Check this car’s service history in a minute before scanning it again.';

/**
 * What the website shows for `FILING_IN_PROGRESS` — the phone's sentence says
 * "scanning", and the website uploads.
 */
export const FILING_IN_PROGRESS_WEB_MESSAGE =
  'Tappet is still reading this invoice. Check this car’s service history in a minute before uploading it again.';

/**
 * What the website says when a filing's answer never arrived — TL-31.
 *
 * ⚠ Never "could not be uploaded… try again": the document and its line
 * items may already be written. The dialog reloads the history before it
 * shows this, and keeps the file selected with its filing key, so the retry
 * this offers is answered with the filed copy rather than filed again.
 */
export function lostWebFilingAnswer(fileName: string): string {
  return `Tappet did not hear back about ${fileName}, so it may already be filed. Check this car’s service history, or upload it again from here: Tappet will not file it twice.`;
}

/** The website's wait for one filing — the phone's (`PHONE_FILING_WAIT_MS`). */
export const WEB_FILING_WAIT_MS = PHONE_FILING_WAIT_MS;
