/**
 * How long an owner's string may be before it is refused, and how much of
 * any stored string a prompt will carry.
 *
 * ── Audit 360, SEC-2 (1 Oct) · the strings that feed every prompt ───────────
 *
 * `POST /api/v1/vehicles` took `make`/`model`/`trim` with `.trim()` and no
 * length; `POST /api/v1/wishlist` stored `item_name`, `description`, `notes`
 * and `source_data` whole. All of them land in the advisor's system prompt
 * on every turn. A free account could save a 500 KB `make`, then spend
 * ~125k input tokens a call — and the monthly fuse counted output only, so
 * it would not notice. Against Google's prepay (CLAUDE.md §9) that ends with
 * every model call for every customer answering 503.
 *
 * Three layers, each of which bounds the attack on its own:
 *
 *   1. **Refused at the door** — the limits below, on the routes that store
 *      them. Generous: they exist to stop an abuse, not to edit an owner.
 *      Wishlist text is often the model's own catalogue sentence sent back
 *      by the phone, so its limits sit far above anything that produces.
 *   2. **Clipped at the prompt** — `boundPromptContext`, for rows written
 *      before (1) or by a path (1) does not cover.
 *   3. **Counted at the fuse** — input tokens now count toward the monthly
 *      ceiling (`decideBudget`, `INPUT_TOKENS_PER_OUTPUT_EQUIVALENT`).
 */

/** `vehicleSchema`'s numbers (`validation.ts`), which the web form already applies. */
export const VEHICLE_NAME_MAX = 50;

export const WISHLIST_LIMITS = {
  itemName: 200,
  itemIdentifier: 300,
  category: 100,
  description: 4_000,
  notes: 4_000,
  /** Characters of `JSON.stringify(sourceData)`. */
  sourceData: 4_000,
} as const;

/** Per string, or per list item, as a prompt carries it. */
export const PROMPT_FIELD_MAX_CHARS = 1_000;

const LABELS: Record<string, string> = {
  make: 'Make',
  model: 'Model',
  trim: 'Trim',
  itemName: 'The name',
  itemIdentifier: 'The identifier',
  category: 'The category',
  description: 'The description',
  notes: 'The notes',
  sourceData: 'The attached detail',
};

function tooLong(field: string, max: number): string {
  return `${LABELS[field] ?? field} must be ${max.toLocaleString('en-US')} characters or fewer.`;
}

/** Null when every given name fits; otherwise the sentence to show. */
export function vehicleNameProblem(names: { make?: unknown; model?: unknown; trim?: unknown }): string | null {
  for (const field of ['make', 'model', 'trim'] as const) {
    const value = names[field];
    if (typeof value === 'string' && value.trim().length > VEHICLE_NAME_MAX) {
      return tooLong(field, VEHICLE_NAME_MAX);
    }
  }
  return null;
}

/**
 * A trim cut to `VEHICLE_NAME_MAX` rather than refused.
 *
 * ⚠ Audit 360, TL-20 (round 3). A trim is the one name a scan supplies that
 * the owner never typed: vPIC's `Trim` arrives unbounded, the answers screen
 * has no trim field, and the scan screen is already replaced. Refusing it
 * told the owner "Trim must be 50 characters or fewer" with nothing to edit.
 * Make and model are still refused (the describe screen has both fields);
 * a trim is clipped at the decode and at the route, which bounds the prompt
 * just the same.
 */
export function clipVehicleTrim(value: string): string {
  const trimmed = value.trim();
  return trimmed.length <= VEHICLE_NAME_MAX ? trimmed : trimmed.slice(0, VEHICLE_NAME_MAX).trimEnd();
}

/** Null when every given wishlist field fits; otherwise the sentence to show. */
export function wishlistFieldProblem(fields: {
  itemName?: unknown;
  itemIdentifier?: unknown;
  category?: unknown;
  description?: unknown;
  notes?: unknown;
  sourceData?: unknown;
}): string | null {
  for (const field of ['itemName', 'itemIdentifier', 'category', 'description', 'notes'] as const) {
    const value = fields[field];
    if (typeof value === 'string' && value.length > WISHLIST_LIMITS[field]) {
      return tooLong(field, WISHLIST_LIMITS[field]);
    }
  }
  if (fields.sourceData !== undefined && fields.sourceData !== null) {
    let size: number;
    try {
      size = JSON.stringify(fields.sourceData)?.length ?? 0;
    } catch {
      return 'The attached detail could not be read.';
    }
    if (size > WISHLIST_LIMITS.sourceData) return tooLong('sourceData', WISHLIST_LIMITS.sourceData);
  }
  return null;
}

/** A string cut to `max` characters, marked when it was cut. */
export function clipForPrompt(value: string, max: number = PROMPT_FIELD_MAX_CHARS): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

/**
 * Every string, and every string in a list, cut to `PROMPT_FIELD_MAX_CHARS`.
 * Numbers, booleans and nulls pass through. Lists keep every item — a long
 * service history is real; a 500 KB line in it is not.
 */
export function boundPromptContext<T extends Record<string, unknown>>(context: T): T {
  const bounded: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    if (typeof value === 'string') {
      bounded[key] = clipForPrompt(value);
    } else if (Array.isArray(value)) {
      bounded[key] = value.map((item) => (typeof item === 'string' ? clipForPrompt(item) : item));
    } else {
      bounded[key] = value;
    }
  }
  return bounded as T;
}
