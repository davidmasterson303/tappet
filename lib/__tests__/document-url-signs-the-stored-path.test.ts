/**
 * The signed-URL route reads the row's stored URL the way the writer wrote it.
 *
 * @jest-environment node
 *
 * ── 23 Sep · every invoice opened from the phone was "not found" ────────────
 *
 * `vehicle_documents.file_url` is `placeholder://<vehicleId>/invoices/<file>`
 * for every real upload (`storedUrl`). `/api/v1/document-url` handed that
 * string to `vehicleIdFromStoragePath`, which split on `/`, read
 * `placeholder:` as the first segment, answered `null`, and the ownership
 * check refused the owner's own invoice with a 404. Verified against the
 * review account's row and three product rows before the fix.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { storagePathFromStoredUrl, storedUrl, vehicleIdFromStoragePath } from '@tappet/core/storage-paths';

const ROUTE = join(__dirname, '..', '..', 'app', 'api', 'v1', 'document-url', 'route.ts');
const code = readFileSync(ROUTE, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

const VEHICLE = '743bdd65-4b9f-4ca1-8b90-9eae9a22ab02';
const ROW = storedUrl(`${VEHICLE}/invoices/review-seed-maple-street-2025-06-21.jpg`);

describe('document-url resolves the stored URL before checking ownership', () => {
  it('the shipped row shape, read the right way, names the vehicle', () => {
    const path = storagePathFromStoredUrl(ROW);
    expect(path).toBe(`${VEHICLE}/invoices/review-seed-maple-street-2025-06-21.jpg`);
    expect(vehicleIdFromStoragePath(path as string)).toBe(VEHICLE);
  });

  it('read raw, the same row names nobody — the defect', () => {
    // Anti-vacuous: this is exactly what the route did, and why it 404'd.
    expect(vehicleIdFromStoragePath(ROW)).toBeNull();
  });

  it('the route resolves the URL first and never signs file_url raw', () => {
    expect(code).toMatch(/storagePathFromStoredUrl\(document\?\.file_url\)/);
    expect(code).not.toMatch(/const filePath = document\?\.file_url/);
    expect(code).toMatch(/createSignedUrl\(filePath/);
  });
});
