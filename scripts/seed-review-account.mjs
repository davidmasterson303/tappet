#!/usr/bin/env node
/**
 * Seed the App Review account so it demonstrates the product.
 *
 *   node scripts/seed-review-account.mjs            # dry run: prints the plan
 *   node scripts/seed-review-account.mjs --apply    # writes it
 *
 * ── Why a script, and why this one is allowed to write production ──────────
 *
 * Cowork's walk of the reviewer account (21 Sep): one 2003 Accord at 168,400
 * miles with **no service history, no document, no tire set** — three empty
 * states in a row on the surfaces being sold, indistinguishable to a reviewer
 * from "broken" (Guideline 2.1), under a health score that was the FN-01
 * constant. This is account-specific production data, not schema, so it is
 * not a migration; it is one script, dry-run by default, that refuses to touch
 * any vehicle but the reviewer's, and that can be re-run without doubling
 * anything — every row it writes is recognisable, and it skips what exists.
 *
 * ── The story it tells (a 7th-gen Accord EX-V6 at 168k) ─────────────────────
 *
 *   2024-03-16  147,120  timing belt, water pump, tensioner, drive belts    Maple Street Auto
 *   2024-11-02  152,900  ATF drain and fill                                  DIY
 *   2025-05-10  158,300  ATF drain and fill                                  DIY
 *   2025-06-21  159,004  front pads and rotors, tire rotation   ← the invoice Maple Street Auto
 *   2025-12-13  163,700  oil and filter, tire rotation                       Maple Street Auto
 *   2026-07-19  167,900  oil and filter, tire rotation                       DIY
 *   2026-09-06  168,400  power steering pump O-ring, fluid flushed          DIY
 *
 * "Maple Street Auto" is a name for the story, not a business. The invoice
 * image is rendered from the same rows (`scripts/review-account/…jpg`), so
 * what the reviewer opens matches what the lines say — a receipt for a
 * different car on this account would be worse than none.
 *
 * Tires: the same set the story rotates — 205/60R16 all round, installed with
 * the brakes at 159,004, the owner's 6,000-mile interval (`interval_source:
 * 'owner'`; only the warranty card licenses `'vehicle'`), two rotations at
 * the oil changes. Written only when the tire tables exist; until the 20 Sep
 * migrations are applied it says so and moves on.
 *
 * It does not regenerate the health summary. That is a model call from the
 * server's code path (`generateVehicleHealthSummary`), run after this, so the
 * score assesses this history rather than reporting that there isn't one.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes('--apply');

const REVIEW_USER = '5e3dcb0e-1740-4dbb-993e-d2eed56790fb';
const REVIEW_VEHICLE = '743bdd65-4b9f-4ca1-8b90-9eae9a22ab02';
const BUCKET = 'vehicle-documents';
const SHOP = 'Maple Street Auto';
const SEED_MARK = 'review-seed';

const env = Object.fromEntries(
  readFileSync(join(here, '..', '.env'), 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SECRET_KEY;
if (!URL_ || !KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env');
  process.exit(1);
}
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

async function get(path) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, { headers });
  if (res.status === 404) return { missing: true };
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${await res.text()}`);
  return res.json();
}
async function insert(table, rows) {
  const res = await fetch(`${URL_}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`INSERT ${table} → ${res.status} ${await res.text()}`);
  return res.json();
}
async function patch(table, filter, body) {
  const res = await fetch(`${URL_}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PATCH ${table} → ${res.status} ${await res.text()}`);
  return res.json();
}

/* ── The rows ──────────────────────────────────────────────────────────────── */

const V = REVIEW_VEHICLE;
const invoicePath = `${V}/invoices/${SEED_MARK}-maple-street-2025-06-21.jpg`;
const invoiceUrl = `placeholder://${invoicePath}`;

/** The line items the phone's HISTORY draws. `source: 'manual'` = logged by the owner; `'vision'` = read off the invoice. */
const lineItems = [
  { service_date: '2024-03-16', mileage_at_service: 147120, shop_name: SHOP, item_description: 'Timing belt, water pump, tensioner and drive belts', parts_cost: 320, labor_cost: 640, total_cost: 960, source: 'manual', category: 'combined' },
  { service_date: '2024-11-02', mileage_at_service: 152900, shop_name: 'DIY', item_description: 'Automatic transmission fluid drain and fill — Honda DW-1, 3 qt', parts_cost: 42, labor_cost: null, total_cost: 42, source: 'manual', category: 'parts' },
  { service_date: '2025-05-10', mileage_at_service: 158300, shop_name: 'DIY', item_description: 'Automatic transmission fluid drain and fill — Honda DW-1, 3 qt', parts_cost: 42, labor_cost: null, total_cost: 42, source: 'manual', category: 'parts' },
  // The invoice's lines — the receipt image is rendered from exactly these.
  { service_date: '2025-06-21', mileage_at_service: 159004, shop_name: SHOP, item_description: 'Front brake pads (ceramic) and rotors, replace', parts_cost: 185, labor_cost: 160, total_cost: 345, source: 'vision', category: 'combined', invoice_url: invoiceUrl },
  { service_date: '2025-06-21', mileage_at_service: 159004, shop_name: SHOP, item_description: 'Tire rotation', parts_cost: 0, labor_cost: 0, total_cost: 0, source: 'vision', category: 'labor', invoice_url: invoiceUrl },
  { service_date: '2025-06-21', mileage_at_service: 159004, shop_name: SHOP, item_description: 'Brake fluid top-up (DOT 3)', parts_cost: 6, labor_cost: 0, total_cost: 6, source: 'vision', category: 'parts', invoice_url: invoiceUrl },
  { service_date: '2025-12-13', mileage_at_service: 163700, shop_name: SHOP, item_description: 'Engine oil and filter change — 5W-20', parts_cost: 28, labor_cost: 40, total_cost: 68, source: 'manual', category: 'combined' },
  { service_date: '2025-12-13', mileage_at_service: 163700, shop_name: SHOP, item_description: 'Tire rotation', parts_cost: 0, labor_cost: 20, total_cost: 20, source: 'manual', category: 'labor' },
  { service_date: '2026-07-19', mileage_at_service: 167900, shop_name: 'DIY', item_description: 'Engine oil and filter change — 5W-20, OEM filter', parts_cost: 38, labor_cost: null, total_cost: 38, source: 'manual', category: 'parts' },
  { service_date: '2026-07-19', mileage_at_service: 167900, shop_name: 'DIY', item_description: 'Tire rotation', parts_cost: 0, labor_cost: null, total_cost: 0, source: 'manual', category: 'labor' },
  { service_date: '2026-09-06', mileage_at_service: 168400, shop_name: 'DIY', item_description: 'Power steering pump O-ring replaced, fluid flushed', parts_cost: 22, labor_cost: null, total_cost: 22, source: 'manual', category: 'parts' },
];

/** The web's planner and the health prompt's "service records": two done, one pending. */
const serviceItems = [
  { description: 'Timing belt, water pump and tensioner (V6, 105k interval)', category: 'maintenance', status: 'completed', estimated_labor_hours: 5, actual_labor_hours: 5.5, cost_parts: 320, cost_labor: 640, date_completed: '2024-03-16', shop_name: SHOP, notes: `${SEED_MARK}: done at 147,120 mi` },
  { description: 'Front brake pads and rotors', category: 'maintenance', status: 'completed', estimated_labor_hours: 1.5, actual_labor_hours: 1.5, cost_parts: 185, cost_labor: 160, date_completed: '2025-06-21', shop_name: SHOP, notes: `${SEED_MARK}: done at 159,004 mi` },
  { description: 'Spark plugs — NGK iridium, due at 170,000', category: 'maintenance', status: 'wishlist', estimated_labor_hours: 1, actual_labor_hours: null, cost_parts: 64, cost_labor: 90, date_completed: null, shop_name: null, notes: `${SEED_MARK}: pending` },
];

const tireSet = {
  vehicle_id: V, brand: 'Michelin', line: 'Defender T+H', size_front: '205/60R16', size_rear: '205/60R16',
  installed_on: '2025-06-21', install_odometer: 159004, purchase_place: SHOP,
  rotation_interval_miles: 6000, interval_source: 'owner', provenance: 'typed',
};
const rotations = [
  { rotated_on: '2025-12-13', odometer: 163700, provenance: 'typed' },
  { rotated_on: '2026-07-19', odometer: 167900, provenance: 'typed' },
];

/* ── The plan ──────────────────────────────────────────────────────────────── */

async function main() {
  console.log(APPLY ? 'APPLY — writing the App Review account' : 'DRY RUN — nothing is written (pass --apply)');

  const vehicle = await get(`vehicles?select=id,user_id,year,make,model,current_mileage&id=eq.${V}`);
  if (!Array.isArray(vehicle) || vehicle.length !== 1 || vehicle[0].user_id !== REVIEW_USER) {
    console.error('Refusing: the vehicle is not the App Review account\'s. Nothing written.');
    process.exit(2);
  }
  console.log(`vehicle ${vehicle[0].year} ${vehicle[0].make} ${vehicle[0].model} at ${vehicle[0].current_mileage} mi — the reviewer's`);

  /* 1. Line items — skip any (date, description) already there. */
  const existingLines = await get(`maintenance_line_items?select=service_date,item_description&vehicle_id=eq.${V}`);
  const have = new Set(existingLines.map((r) => `${r.service_date}|${r.item_description}`));
  const newLines = lineItems.filter((r) => !have.has(`${r.service_date}|${r.item_description}`));
  console.log(`maintenance_line_items: ${existingLines.length} on file, ${newLines.length} to write`);

  /* 2. The document and its object. */
  const existingDocs = await get(`vehicle_documents?select=id,file_url&vehicle_id=eq.${V}`);
  const docThere = existingDocs.find((d) => d.file_url === invoiceUrl);
  console.log(`vehicle_documents: ${existingDocs.length} on file, invoice ${docThere ? 'present' : 'to write (with its object)'}`);

  /* 3. Service items. */
  const existingItems = await get(`service_items?select=description&vehicle_id=eq.${V}`);
  const haveItems = new Set(existingItems.map((r) => r.description));
  const newItems = serviceItems.filter((r) => !haveItems.has(r.description));
  console.log(`service_items: ${existingItems.length} on file, ${newItems.length} to write`);

  /* 4. Tires, if the tables exist. */
  const sets = await get(`tire_sets?select=id&vehicle_id=eq.${V}&retired_at=is.null`);
  const tiresAvailable = !sets.missing;
  const setThere = tiresAvailable && sets.length > 0;
  console.log(
    tiresAvailable
      ? `tire_sets: ${setThere ? 'a current set is on file — left alone' : 'none — one set and two rotations to write'}`
      : 'tire_sets: TABLE MISSING — the 20 Sep migrations are not applied; skipping the tire seed'
  );

  /* 5. The profile's display name. */
  const [profile] = await get(`profiles?select=display_name&id=eq.${REVIEW_USER}`);
  const renameNeeded = /crewchief/i.test(profile?.display_name ?? '');
  console.log(`profiles.display_name: "${profile?.display_name}" ${renameNeeded ? '→ "App Review"' : '(fine)'}`);

  if (!APPLY) return;

  /* ── Write, in dependency order ── */
  let docId = docThere?.id ?? null;
  if (!docThere) {
    const image = readFileSync(join(here, 'review-account', 'maple-street-invoice.jpg'));
    const up = await fetch(`${URL_}/storage/v1/object/${BUCKET}/${invoicePath}`, {
      method: 'POST',
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' },
      body: image,
    });
    if (!up.ok) throw new Error(`upload → ${up.status} ${await up.text()}`);
    const [doc] = await insert('vehicle_documents', [{
      vehicle_id: V,
      document_type: 'invoice',
      file_url: invoiceUrl,
      extraction_status: 'completed',
      upload_date: '2025-06-21T18:12:00Z',
      extracted_data: { vendor_name: SHOP, service_date: '2025-06-21', item_count: 3, total_cost: 351, service_type: 'invoice' },
    }]);
    docId = doc.id;
    console.log(`  wrote the invoice object and document ${docId}`);
  }

  if (newLines.length > 0) {
    const rows = newLines.map((r) => ({
      vehicle_id: V,
      quantity: 1,
      unit_cost: r.parts_cost ?? 0,
      ...r,
      source_document_id: r.source === 'vision' ? docId : null,
    }));
    const written = await insert('maintenance_line_items', rows);
    console.log(`  wrote ${written.length} maintenance_line_items`);
  }

  if (newItems.length > 0) {
    const written = await insert('service_items', newItems.map((r) => ({ vehicle_id: V, ...r })));
    console.log(`  wrote ${written.length} service_items`);
  }

  if (tiresAvailable && !setThere) {
    const [set] = await insert('tire_sets', [tireSet]);
    const written = await insert('tire_rotations', rotations.map((r) => ({ set_id: set.id, vehicle_id: V, ...r })));
    console.log(`  wrote tire set ${set.id} and ${written.length} rotations`);
  }

  if (renameNeeded) {
    await patch('profiles', `id=eq.${REVIEW_USER}`, { display_name: 'App Review' });
    console.log('  renamed the profile to "App Review"');
  }

  console.log('Done. Now regenerate the health summary for this vehicle (see the header).');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
