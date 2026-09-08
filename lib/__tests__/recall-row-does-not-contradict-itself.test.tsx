/**
 * The recalls row, rendered, when its two voices disagree.
 *
 * ── The defect, observed 8 Sep in the rendered dashboard ────────────────────
 *
 * One row of the health summary on the demo Accord read, in this order:
 *
 *     RECALLS
 *     Recalls have not been checked for this vehicle.     <- the driver
 *     No open recalls.                                    <- the written claim
 *
 * Two sentences about one car that cannot both be true, and the second is an
 * all-clear about safety recalls on a vehicle nobody looked up. An IA review of
 * the page called it out as the row that makes a subscriber doubt everything
 * else on the screen: a product whose stated position is that it makes no claim
 * the data cannot support, contradicting itself inside a single row.
 *
 * ── ⚠ Why the fix is a third sentence and not a deletion ────────────────────
 *
 * The obvious repair is to drop the written claim when the lookup has not run.
 * That was tried and reverted, because `health-claims.ts` already decided the
 * opposite deliberately and its test states the case: a written status passes
 * through regardless of the flag, because "something produced that sentence"
 * and its worked example is **"Takata airbag inflator — do not drive"**. A
 * model can know that from its research into a model without any NHTSA lookup
 * having run, so suppressing the text would trade a visible contradiction for
 * an invisible silence — the failure in the dangerous direction.
 *
 * So the row names the disagreement instead, which is exactly what it already
 * does one row above when the schedule and the summary reach opposite
 * conclusions about maintenance.
 */

import { render, screen } from '@testing-library/react';
import HealthSummary from '@/components/HealthSummary';
import type { HealthDriver } from '@tappet/core/health-drivers';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn(), back: jest.fn() }),
}));

/*
  ⚠ `HealthSummary` imports one server action, which pulls `app/actions.ts` →
  `lib/gemini.ts` → `@google/genai`, an ESM package this runner cannot parse.
  That import chain — not the component — is why this page had no render test
  before today, and it is why the recalls row's two voices were only ever
  checked by reading the file.

  Mocked at the action boundary rather than at `@google/genai`, because the
  component's actual dependency is the one function below; stubbing the SDK
  would leave the whole of `actions.ts` loading for no reason.
*/
jest.mock('@/app/actions', () => ({
  generateVehicleHealthSummary: jest.fn(async () => ({ success: true })),
}));

/** The driver a car with no NHTSA lookup actually produces. */
const UNCHECKED_RECALLS: HealthDriver = {
  key: 'recalls',
  label: 'Recalls',
  score: null,
  detail: 'Recalls have not been checked for this vehicle.',
};

/** The same row once a lookup has run and found nothing. */
const CHECKED_CLEAN: HealthDriver = {
  key: 'recalls',
  label: 'Recalls',
  score: 100,
  detail: 'No recalls on record.',
  nothingOutstanding: true,
};

function renderRow(opts: {
  driver: HealthDriver;
  recallStatus: string | null;
  recallsChecked: boolean;
}) {
  render(
    <HealthSummary
      vehicleId="v1"
      healthSummary={{ recall_status: opts.recallStatus } as never}
      drivers={[opts.driver]}
      recalls={[]}
      recallsChecked={opts.recallsChecked}
    />
  );
}

const DISAGREEMENT = /these disagree/i;

describe('the recalls row does not quietly contradict itself', () => {
  it('names the disagreement when an all-clear sits under "not checked"', () => {
    renderRow({
      driver: UNCHECKED_RECALLS,
      recallStatus: 'No open recalls.',
      recallsChecked: false,
    });

    // Both voices still on screen — neither is suppressed.
    expect(screen.getByText(/have not been checked/i)).toBeInTheDocument();
    expect(screen.getByText(/no open recalls/i)).toBeInTheDocument();

    // …and the row says so, rather than leaving the reader to notice.
    expect(screen.getByText(DISAGREEMENT)).toBeInTheDocument();
    expect(screen.getByText(/no nhtsa lookup has run/i)).toBeInTheDocument();
  });

  it('keeps a real finding visible in that state, rather than trading it for silence', () => {
    /*
      The Takata case from `health-claims.test.ts`. The whole reason this is a
      third sentence and not a deletion — if this ever fails, the "fix" has
      become a suppression.
    */
    renderRow({
      driver: UNCHECKED_RECALLS,
      recallStatus: 'Takata airbag inflator — do not drive',
      recallsChecked: false,
    });

    expect(screen.getByText(/takata/i)).toBeInTheDocument();
    expect(screen.getByText(DISAGREEMENT)).toBeInTheDocument();
  });

  it('stays quiet when the two voices agree', () => {
    /*
      ⚠ §5's anti-vacuous half, and the one that matters most here: a sentence
      that renders on every recalls row is furniture, not a warning. If this
      passes while the case above fails, the guard is inverted.
    */
    renderRow({
      driver: CHECKED_CLEAN,
      recallStatus: null,
      recallsChecked: true,
    });

    expect(screen.queryByText(DISAGREEMENT)).not.toBeInTheDocument();
  });

  it('stays quiet when the lookup ran and found something', () => {
    // Checked plus a written finding is not a contradiction — it is the system
    // working, and a reconciling sentence there would be noise.
    renderRow({
      driver: { key: 'recalls', label: 'Recalls', score: 60, detail: '1 open recall.' },
      recallStatus: '1 active recall — fuel pump.',
      recallsChecked: true,
    });

    expect(screen.queryByText(DISAGREEMENT)).not.toBeInTheDocument();
  });
});
