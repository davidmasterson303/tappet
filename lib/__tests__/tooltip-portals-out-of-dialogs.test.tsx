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
 * No z-index reaches that; a portal does.
 *
 * Rendered rather than scanned: an open tooltip's content must be a child of
 * `document.body`, not of the box its trigger sits in. A future shadcn
 * re-copy of `tooltip.tsx` that dropped the Portal would put it back inside
 * the box, and the second case would fail.
 */
import { render, screen } from '@testing-library/react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

beforeAll(() => {
  // Radix's popper measures with ResizeObserver, which jsdom does not ship.
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

function Subject() {
  return (
    <div data-testid="clipping-box" style={{ overflow: 'hidden', transform: 'translateX(-50%)' }}>
      <TooltipProvider>
        <Tooltip open>
          <TooltipTrigger asChild>
            <span>Estimate details</span>
          </TooltipTrigger>
          <TooltipContent>
            <p>Requires ~6.9 quarts of BMW LL-01 approved full synthetic oil.</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

describe('TooltipContent is portaled', () => {
  it('renders an open tooltip at the body, outside the box that would clip it', () => {
    render(<Subject />);
    const bubbles = screen.getAllByText(/Requires ~6\.9 quarts/);
    // Radix renders a visible bubble plus a visually-hidden copy for the
    // accessible name; both live in the portal, and none in the box.
    expect(bubbles.length).toBeGreaterThan(0);
    const box = screen.getByTestId('clipping-box');
    for (const bubble of bubbles) {
      expect(box.contains(bubble)).toBe(false);
      expect(document.body.contains(bubble)).toBe(true);
    }
  });

  it('the trigger itself stays in the box — the anti-vacuous half', () => {
    render(<Subject />);
    const box = screen.getByTestId('clipping-box');
    expect(box.contains(screen.getByText('Estimate details'))).toBe(true);
  });

  it('the reason still holds: the dialog centres itself with a transform', () => {
    // If this ever stops matching, the portal is still right — a bubble that
    // ignores every ancestor's overflow is the correct default — but the
    // docblock's stated cause should be updated rather than left stale.
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const dialog = fs.readFileSync(path.join(process.cwd(), 'components/ui/dialog.tsx'), 'utf8');
    expect(dialog).toMatch(/translate-x-\[-50%\]/);
  });
});
