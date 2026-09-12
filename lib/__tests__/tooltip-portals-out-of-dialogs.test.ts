/**
 * Tooltips render at the body, not inside the element that triggers them.
 *
 * ── ⚠ Why this exists ───────────────────────────────────────────────────────
 *
 * 11 Sep, David, on the live demo: "tooltip/popup is cut off on left side,
 * maybe z-index." It was the quote's cost breakdown, inside `DialogContent`,
 * which centres itself with `translate-x-[-50%]`. A transform makes that
 * element the containing block for Radix's `position: fixed` popper, so the
 * table wrapper's `overflow-hidden` clipped the bubble at the dialog's edge.
 * No z-index reaches that; a portal does. Pinned in source because the fix is
 * one wrapper element that a future shadcn re-copy of `tooltip.tsx` would
 * silently drop.
 */
import fs from 'fs';
import path from 'path';

const read = (rel: string) => {
  const text = fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
  expect(text.length).toBeGreaterThan(0);
  return text;
};

describe('TooltipContent is portaled', () => {
  it('wraps the Radix content in a Portal', () => {
    const src = read('components/ui/tooltip.tsx');
    const portal = src.indexOf('<TooltipPrimitive.Portal>');
    const content = src.indexOf('<TooltipPrimitive.Content');
    expect(portal).toBeGreaterThan(-1);
    expect(content).toBeGreaterThan(portal);
    expect(src).toMatch(/collisionPadding=\{collisionPadding\}/);
  });

  it('the reason still holds: the dialog centres itself with a transform', () => {
    // If this ever stops matching, the portal is still right — a bubble that
    // ignores every ancestor's overflow is the correct default — but the
    // docblock's stated cause should be updated rather than left stale.
    expect(read('components/ui/dialog.tsx')).toMatch(/translate-x-\[-50%\]/);
  });
});
