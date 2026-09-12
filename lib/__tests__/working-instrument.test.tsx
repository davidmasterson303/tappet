/**
 * The wait instrument says what is happening, moves while it does, and
 * stops moving for anyone who asked it to.
 *
 * ── The three things this pins ──────────────────────────────────────────────
 *
 * 1. **Every state renders, and none of them is a number.** The instrument
 *    replaced three fake indicators and one un-analysed card drawn as a wait;
 *    the one thing it must never do is grow a percentage. Every variant is
 *    rendered and searched for one.
 *
 * 2. **Reduced motion is a designed state, not an accident of the blanket
 *    rule.** `globals.css` stops the CSS animation, and the component also
 *    reads the preference and marks itself still — so the stage marks stop
 *    breathing with it, and the state can be asserted here without a browser.
 *    `matchMedia` is mocked both ways, and the anti-vacuous half is that the
 *    live render really does carry the live class.
 *
 * 3. **The un-analysed mod card no longer borrows loading's clothes.** That
 *    card is the screenshot this work started from: two pulsing bars under a
 *    mod nobody had asked about. It renders no skeleton and no sweep until
 *    the button is pressed, and the instrument only once it is.
 *
 * `scanStages` is exercised directly because it is the only place a stage
 * list is assembled, and a stage that a timer could mark done is the defect
 * `scan-progress.ts` exists to prevent.
 */

import { act, render, screen } from '@testing-library/react';
import { Working, WorkingMark } from '@/components/Working';
import { scanStages } from '@/lib/working';
import ModificationDetailsCard from '@/components/ModificationDetailsCard';
import { Button } from '@/components/ui/button';

jest.mock('@/app/actions', () => ({
  generateModificationDetails: jest.fn(),
  addModificationToWishlist: jest.fn(),
}));

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

/** Install a `matchMedia` that answers the reduced-motion query one way. */
function preferReducedMotion(reduce: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: reduce && query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

const PERCENT = /\d\s*%/;

describe('the wait instrument renders every state', () => {
  beforeEach(() => preferReducedMotion(false));

  it('full: the line, the detail, and no number', () => {
    const { container } = render(
      <Working line="Researching this car" detail="Common issues and recalls for a 2018 Honda Accord." />
    );
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveAttribute('data-working', 'full');
    expect(status.textContent).toContain('Researching this car');
    expect(status.textContent).toContain('2018 Honda Accord');
    expect(container.textContent).not.toMatch(PERCENT);
    // The dial is drawing, not reading: a sweep and a track, no needle.
    expect(container.querySelector('.working-sweep')).not.toBeNull();
    expect(container.querySelector('.working-track')).not.toBeNull();
  });

  it('compact: the same instrument at row size', () => {
    const { container } = render(<Working variant="compact" line="Analyzing this mod" />);
    expect(screen.getByRole('status')).toHaveAttribute('data-working', 'compact');
    expect(container.querySelector('.working-sweep')).not.toBeNull();
    // Filled terminals at both ends of the scale — brief B1 — on the compact
    // face too; only the mark goes without them.
    expect(container.querySelectorAll('.working-terminal').length).toBe(2);
    expect(container.querySelector('.working-dial')).toHaveAttribute('data-face', 'compact');
    expect(container.textContent).not.toMatch(PERCENT);
  });

  it('stages: each one is spoken with its state, and none is a number', () => {
    const { container } = render(
      <Working
        line="Reading the invoice"
        stages={[
          { label: 'Preparing the file', state: 'done' },
          { label: 'Reading the invoice', state: 'active' },
        ]}
      />
    );
    const rows = container.querySelectorAll('.working-stage');
    expect(rows.length).toBe(2);
    expect(rows[0]).toHaveAttribute('data-state', 'done');
    expect(rows[0]).toHaveAttribute('aria-label', 'Preparing the file — done');
    expect(rows[1]).toHaveAttribute('data-state', 'active');
    expect(rows[1]).toHaveAttribute('aria-label', 'Reading the invoice — in progress');
    expect(container.textContent).not.toMatch(PERCENT);
  });

  it('mark: hidden from assistive tech, in the control’s own ink', () => {
    const { container } = render(
      <button>
        <WorkingMark className="h-4 w-4" />
        Saving
      </button>
    );
    const mark = container.querySelector('svg.working-mark');
    expect(mark).not.toBeNull();
    expect(mark).toHaveAttribute('aria-hidden', 'true');
    expect(mark!.querySelector('.working-sweep')).toHaveAttribute('stroke', 'currentColor');
    // No terminals at 14px — two dots on a 5px arc read as a face.
    expect(mark!.querySelector('.working-terminal')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('is live by default — the anti-vacuous half of the still case below', () => {
    const { container } = render(<Working line="Opening the plan" />);
    expect(screen.getByRole('status')).toHaveAttribute('data-motion', 'live');
    expect(container.querySelector('.working-sweep.is-live')).not.toBeNull();
  });

  it('frozen: the still frame, chosen', () => {
    const { container } = render(<Working frozen line="Opening the plan" />);
    expect(screen.getByRole('status')).toHaveAttribute('data-motion', 'still');
    expect(container.querySelector('.working-sweep.is-frozen')).not.toBeNull();
    expect(container.querySelector('.working-sweep.is-live')).toBeNull();
  });

  it('owns no clock: identical markup after twenty seconds', () => {
    /*
      The same assertion `quote-progress-is-real` makes of the panel this now
      sits inside. A component with a `setInterval` in it is how every fake
      indicator in this codebase began.
    */
    jest.useFakeTimers();
    try {
      const { container } = render(
        <Working line="Pricing 3 service items" stages={[{ label: 'One', state: 'active' }]} />
      );
      const atStart = container.innerHTML;
      act(() => {
        jest.advanceTimersByTime(20_000);
      });
      expect(container.innerHTML).toBe(atStart);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('a busy button keeps its name, its width and its manners', () => {
  beforeEach(() => preferReducedMotion(false));

  it('drops to the outline, says what it is doing in the state voice, and holds the rest label', () => {
    /*
      Brief B7: the button that started the work drops to its outlined form at
      constant width, with the cyan mono status beside the mark. The rest
      label stays in the cell, invisible, which is what holds the width — and
      it is `aria-hidden`, so the control's accessible name is the status.
    */
    const onClick = jest.fn();
    render(
      <Button busy busyLabel="Decoding the VIN" onClick={onClick}>
        Continue
      </Button>
    );
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).not.toBeDisabled();
    expect(button.className).toMatch(/border-\[color:var\(--border-field\)\]/);
    expect(button.className).not.toMatch(/bg-primary/);
    expect(button.querySelector('svg.working-mark')).not.toBeNull();
    expect(screen.getByText('Decoding the VIN').className).toMatch(/mono/);
    expect(screen.getByText('Decoding the VIN').className).toMatch(/--info-strong/);
    const held = screen.getByText('Continue');
    expect(held).toHaveAttribute('aria-hidden', 'true');
    expect(held.className).toMatch(/invisible/);
  });

  it('swallows the click while busy, so a double press cannot fire twice', () => {
    const onClick = jest.fn();
    render(
      <Button busy busyLabel="Saving" onClick={onClick}>
        Save
      </Button>
    );
    screen.getByRole('button').click();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('is an ordinary button when it is not busy — the anti-vacuous half', () => {
    const onClick = jest.fn();
    render(
      <Button busyLabel="Saving" onClick={onClick}>
        Save
      </Button>
    );
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).not.toHaveAttribute('aria-busy');
    expect(button.querySelector('svg.working-mark')).toBeNull();
    button.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('reduced motion is a designed state', () => {
  it('marks itself still and drops the live class when the visitor asked for less motion', () => {
    preferReducedMotion(true);
    const { container } = render(
      <Working line="Reading the invoice" stages={[{ label: 'Reading', state: 'active' }]} />
    );
    expect(screen.getByRole('status')).toHaveAttribute('data-motion', 'still');
    expect(container.querySelector('.working-sweep.is-live')).toBeNull();
    // Still rendered, still says what it is doing — a still is not a blank.
    expect(container.querySelector('.working-sweep')).not.toBeNull();
    expect(container.textContent).toContain('Reading the invoice');
  });

  it('the mark follows the same preference', () => {
    preferReducedMotion(true);
    const { container } = render(<WorkingMark />);
    expect(container.querySelector('svg.working-mark')).toHaveAttribute('data-motion', 'still');
    expect(container.querySelector('.working-sweep.is-live')).toBeNull();
  });
});

describe('the scanner’s stages come from its state', () => {
  const base = { fileName: 'invoice.jpg', fileIndex: 1, fileCount: 1, itemsExtracted: 0 } as const;

  it('preparing: first active, second not started', () => {
    expect(scanStages({ ...base, stage: 'preparing' }).map((s) => s.state)).toEqual([
      'active',
      'pending',
    ]);
  });

  it('reading: first done because the loop moved past it, second active', () => {
    expect(scanStages({ ...base, stage: 'reading' }).map((s) => s.state)).toEqual([
      'done',
      'active',
    ]);
  });

  it('done: both done, and nothing else', () => {
    const stages = scanStages({ ...base, stage: 'done' });
    expect(stages.map((s) => s.state)).toEqual(['done', 'done']);
    expect(stages.length).toBe(2);
  });
});

describe('the un-analysed mod card is an empty state, not a wait', () => {
  beforeEach(() => preferReducedMotion(false));

  const vehicle = { id: 'v1', year: 2018, make: 'Honda', model: 'Accord', performance_mindedness: 'mild' };

  it('renders no skeleton, no sweep, and the action', () => {
    const { container } = render(
      <ModificationDetailsCard vehicleId="v1" modName="Cat-back Exhaust System" vehicle={vehicle} />
    );
    expect(container.querySelector('.animate-pulse')).toBeNull();
    expect(container.querySelector('.skeleton-shimmer')).toBeNull();
    expect(container.querySelector('.working-sweep')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByText(/not analyzed yet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /analyze mod/i })).toBeEnabled();
  });

  it('shows the instrument only once the analysis is running', async () => {
    const { generateModificationDetails } = jest.requireMock('@/app/actions') as {
      generateModificationDetails: jest.Mock;
    };
    let settle: (value: unknown) => void = () => {};
    generateModificationDetails.mockReturnValue(new Promise((resolve) => (settle = resolve)));

    const { container } = render(
      <ModificationDetailsCard vehicleId="v1" modName="Cat-back Exhaust System" vehicle={vehicle} />
    );

    await act(async () => {
      screen.getByRole('button', { name: /analyze mod/i }).click();
    });

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('data-working', 'compact');
    // The facts the card holds, and no number.
    expect(status.textContent).toContain('Cat-back Exhaust System on a 2018 Honda Accord');
    expect(container.textContent).not.toMatch(PERCENT);
    expect(container.querySelector('svg.working-mark')).not.toBeNull();

    await act(async () => {
      settle({ success: false });
    });
    expect(screen.queryByRole('status')).toBeNull();
  });
});
