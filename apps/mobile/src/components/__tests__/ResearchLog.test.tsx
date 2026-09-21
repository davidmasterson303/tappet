import { render, userEvent } from '@testing-library/react-native';
import ResearchLog from '../ResearchLog';
import type { ResearchRunner } from '../useResearchRunner';
import type { ResearchMilestone } from '@tappet/core/research-milestones';

/**
 * The research log folds once the work is done — 21 Sep, seen on the device.
 *
 * The first sticker-scanned car finished its research and the whole ledger
 * stayed above the car's page with nothing to close it. Settled, the log is
 * one row that opens on a tap; running or failed, it is the ledger.
 */

const DONE: ResearchMilestone[] = [
  { key: 'decode', label: 'Decoding the 2015 Subaru Forester', answer: 'SJ, 2014–2018.', state: 'done' },
  { key: 'recalls', label: 'Asking NHTSA about open campaigns', answer: '3 on file.', state: 'done' },
  { key: 'score', label: 'Scoring condition', answer: '65 · Fair.', state: 'done' },
];

function runner(over: Partial<ResearchRunner> = {}): ResearchRunner {
  return {
    visible: true,
    milestones: DONE,
    line: 'Research complete',
    marginalia: "NHTSA's record for this model runs 3 years, from 2016 to 2019.",
    settled: true,
    failed: false,
    retry: jest.fn(),
    ...over,
  };
}

describe('ResearchLog, settled', () => {
  it('draws one row and no ledger, and opens the ledger on a tap', async () => {
    const view = await render(<ResearchLog runner={runner()} />);

    const fold = view.getByTestId('research-log-fold');
    expect(view.getByText('RESEARCH COMPLETE')).toBeTruthy();
    expect(view.getByText('3 STEPS')).toBeTruthy();
    expect(view.queryByText(/SJ, 2014–2018/)).toBeNull();
    expect(view.queryByTestId('working-ledger')).toBeNull();
    expect(fold.props.accessibilityState).toEqual({ expanded: false });

    await userEvent.press(fold);

    view.getByText(/SJ, 2014–2018/);
    view.getByText(/3 on file/);
    view.getByTestId('working-ledger');
    expect(view.getByTestId('research-log-fold').props.accessibilityState).toEqual({ expanded: true });
    // The wait's instrument does not come back with the receipt.
    expect(view.queryByRole('progressbar')).toBeNull();

    await userEvent.press(view.getByTestId('research-log-fold'));
    expect(view.queryByText(/SJ, 2014–2018/)).toBeNull();
  });
});

describe('ResearchLog, not settled', () => {
  it('shows the ledger while running — the wait is the point', async () => {
    const running = runner({
      settled: false,
      line: 'Scoring condition',
      milestones: [DONE[0], DONE[1], { key: 'score', label: 'Scoring condition', state: 'active' }],
    });
    const view = await render(<ResearchLog runner={running} />);
    expect(view.queryByTestId('research-log-fold')).toBeNull();
    view.getByText(/SJ, 2014–2018/);
  });

  it('does not fold a failure — the failed line and its retry must be seen', async () => {
    const failed = runner({
      failed: true,
      line: 'Research stopped',
      milestones: [DONE[0], { key: 'recalls', label: 'Asking NHTSA about open campaigns', answer: 'NHTSA did not answer.', state: 'failed' }],
    });
    const view = await render(<ResearchLog runner={failed} />);
    expect(view.queryByTestId('research-log-fold')).toBeNull();
    view.getByText(/NHTSA did not answer/);
    view.getByText('Retry the research');
  });
});
