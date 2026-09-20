/**
 * A screen that throws renders the recovery, reports, and comes back.
 */
import { render, userEvent } from '@testing-library/react-native';
import { Text } from 'react-native';
import CrashBoundary from '../CrashBoundary';
import { reportClientError } from '../../api/client-errors';

jest.mock('../../api/client-errors', () => ({ reportClientError: jest.fn().mockResolvedValue(undefined) }));
const report = reportClientError as jest.MockedFunction<typeof reportClientError>;

function Bomb({ armed }: { armed: boolean }) {
  if (armed) throw new Error('NHTSA record had no component');
  return <Text>The screen</Text>;
}

beforeEach(() => report.mockClear());

it('renders the recovery in place of the tree, and reports what it caught', async () => {
  const quiet = jest.spyOn(console, 'error').mockImplementation(() => {});
  const view = await render(
    <CrashBoundary where="garage">
      <Bomb armed />
    </CrashBoundary>
  );
  view.getByText('Something went wrong');
  expect(view.queryByText('The screen')).toBeNull();
  expect(report).toHaveBeenCalledTimes(1);
  expect(report.mock.calls[0][0]).toMatchObject({ message: 'NHTSA record had no component', where: 'garage' });
  expect(typeof report.mock.calls[0][0].componentStack).toBe('string');
  quiet.mockRestore();
});

it('“Try again” remounts the tree', async () => {
  const quiet = jest.spyOn(console, 'error').mockImplementation(() => {});
  let armed = true;
  function Flaky() {
    return <Bomb armed={armed} />;
  }
  const view = await render(
    <CrashBoundary>
      <Flaky />
    </CrashBoundary>
  );
  view.getByText('Something went wrong');
  armed = false;
  await userEvent.setup().press(view.getByText('Try again'));
  view.getByText('The screen');
  quiet.mockRestore();
});

it('is invisible when nothing throws', async () => {
  const view = await render(
    <CrashBoundary>
      <Bomb armed={false} />
    </CrashBoundary>
  );
  view.getByText('The screen');
  expect(report).not.toHaveBeenCalled();
});
