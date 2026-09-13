import { StyleSheet } from 'react-native';
import { act, fireEvent, render, userEvent, waitFor } from '@testing-library/react-native';
import { Keyboard } from 'react-native';

import { AdvisorScreen } from '../AdvisorScreen';
import { askAdvisor, listAdvisorThreads, loadAdvisorThread } from '../../api/consultant';
import { auditText, belowFloor } from '../../test-support/contrast';
import { ApiRequestError } from '../../api/client';
import { onUpgradeRequested } from '../../purchases/upgrade-prompt';

/**
 * The advisor's answer, rendered.
 *
 * ── The defect this covers shipped and was found by eye ─────────────────────
 *
 * A real reply displayed literal `**$1,461**` and `* **Front Brakes &
 * Rotors:**` on screen. The web had a bold renderer; the phone had none, so
 * the flagship screen of a portfolio app showed its own markup.
 *
 * `lib/__tests__/answer-markup.test.ts` covers the tokeniser and is worth
 * keeping — it holds the parsing rules, including that a lone asterisk in
 * "25 ft-lb * 2" is arithmetic and must survive. But a correct tokeniser
 * wired to nothing renders exactly the same asterisks. **Only mounting the
 * screen tests the thing the user sees**, and nothing did until now.
 */

/*
  ── ⚠ LEG-02 · these tests are about answers, not about consent ─────────────

  Guideline 5.1.2(i) (amended Nov 2025) requires explicit permission before
  personal data reaches a third-party AI, so the advisor now asks before the
  first question leaves — including on the deep-link path, which a notification
  tap uses. Every case below assumes that question has been answered.

  Mocked rather than written to `secureStorage`, because the store is
  `expo-secure-store` and there is none in a test runner.
*/
let mockConsent: 'granted' | 'declined' | 'unknown' = 'granted';

jest.mock('../../onboarding/ai-consent', () => ({
  readAiConsent: jest.fn(async () => mockConsent),
  recordAiConsent: jest.fn(async () => {}),
}));

jest.mock('../../api/consultant', () => {
  const actual = jest.requireActual('../../api/consultant');
  return { ...actual, askAdvisor: jest.fn(), listAdvisorThreads: jest.fn(), loadAdvisorThread: jest.fn() };
});

const ask = askAdvisor as jest.MockedFunction<typeof askAdvisor>;
const listThreads = listAdvisorThreads as jest.MockedFunction<typeof listAdvisorThreads>;
const loadThread = loadAdvisorThread as jest.MockedFunction<typeof loadAdvisorThread>;

/** The shape of a real answer, including the exact strings that shipped raw. */
const ANSWER = [
  'That last trip to Blackmarket Motorsports ran you **$1,461** all-in.',
  '',
  '* **Front Brakes & Rotors:** $678',
  '* **NGK Spark Plugs:** $294',
].join('\n');

function renderAdvisor(question = 'What did my last service cost?') {
  return render(
    <AdvisorScreen
      vehicleId="db143cdc-e68c-46f0-849e-69f7a1873f58"
      initialQuestion={question}
      onSignOut={jest.fn()}
    />
  );
}

beforeEach(() => jest.clearAllMocks());

describe('an answer is rendered, not printed', () => {
  it('shows no markup syntax anywhere on screen', async () => {
    ask.mockResolvedValue({ sessionId: 's1', response: ANSWER, contextKinds: ['service'] });

    const view = await renderAdvisor();
    await view.findByText(/Blackmarket Motorsports/);

    /*
      The whole assertion, and the one that would have failed on 5 Aug: no
      rendered string may still contain `**`. Walking the audit rather than
      querying for a phrase, because the defect was *everywhere* in the answer
      rather than in one line.
    */
    for (const audit of auditText(view)) {
      expect(audit.text).not.toContain('**');
    }
  });

  it('emphasises the figure rather than showing its asterisks', async () => {
    ask.mockResolvedValue({ sessionId: 's1', response: ANSWER, contextKinds: [] });

    const view = await renderAdvisor();

    // The bold run is its own Text node with the amount as plain content.
    expect(await view.findByText('$1,461')).toBeTruthy();
    expect(view.queryByText(/\*\*\$1,461\*\*/)).toBeNull();
  });

  it('draws a bullet glyph instead of the asterisk the model wrote', async () => {
    ask.mockResolvedValue({ sessionId: 's1', response: ANSWER, contextKinds: [] });

    const view = await renderAdvisor();
    await view.findByText(/Blackmarket/);

    // The marker is consumed by the parser and redrawn, so it must appear
    // exactly once per bullet — not as a leading "*" as well.
    expect(view.getAllByText('•')).toHaveLength(2);
  });

  it('keeps a lone asterisk, because it is arithmetic', async () => {
    // "25 ft-lb * 2" is a multiplication sign. Stripping it would be a worse
    // failure than showing it, and only a render proves which happened.
    ask.mockResolvedValue({
      sessionId: 's1',
      response: 'Torque them to 25 ft-lb * 2 passes.',
      contextKinds: [],
    });

    const view = await renderAdvisor();
    expect(await view.findByText('Torque them to 25 ft-lb * 2 passes.')).toBeTruthy();
  });
});

describe('a link can arrive with its question', () => {
  it('asks it once, without anyone typing', async () => {
    // The notification promises an answer, so it carries the question. This is
    // also the only way this screen can be exercised without a human: synthetic
    // keystrokes do not reach a React Native TextInput.
    ask.mockResolvedValue({ sessionId: 's1', response: 'It cost $1,461.', contextKinds: [] });

    const view = await renderAdvisor('What did my last service cost?');

    expect(await view.findByText('It cost $1,461.')).toBeTruthy();
    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'What did my last service cost?' })
    );
  });

  it('starts a new thread for each arrival of a question, even the same words twice', async () => {
    /*
      13 Sep: every "Learn more" and "ask the advisor" lands in the Advisor tab
      now, where an Advisor may already be mounted with a thread open. The
      arrival is keyed (`questionKey`), and a new key is a new thread: the
      echo cleared, the server's session id dropped, the question asked
      again. Without the key the second arrival — same words, from a second
      tap — would be swallowed, which is the reason the old design pushed a
      second advisor instead.
    */
    ask
      .mockResolvedValueOnce({ sessionId: 's1', response: 'First answer.', contextKinds: [] })
      .mockResolvedValueOnce({ sessionId: 's2', response: 'Second answer.', contextKinds: [] });

    const view = await render(
      <AdvisorScreen
        vehicleId="db143cdc-e68c-46f0-849e-69f7a1873f58"
        initialQuestion="Tell me about the charge pipe"
        questionKey={1}
        onSignOut={jest.fn()}
      />
    );
    expect(await view.findByText('First answer.')).toBeTruthy();

    await view.rerender(
      <AdvisorScreen
        vehicleId="db143cdc-e68c-46f0-849e-69f7a1873f58"
        initialQuestion="Tell me about the charge pipe"
        questionKey={2}
        onSignOut={jest.fn()}
      />
    );
    expect(await view.findByText('Second answer.')).toBeTruthy();
    // A new thread, not a continuation: the first answer is gone and the
    // second send carried no session to continue.
    expect(view.queryByText('First answer.')).toBeNull();
    expect(ask).toHaveBeenCalledTimes(2);
    expect(ask.mock.calls[1][0]).toEqual(expect.objectContaining({ sessionId: null }));

    // And the same key a second time is the same arrival: nothing more is sent.
    await view.rerender(
      <AdvisorScreen
        vehicleId="db143cdc-e68c-46f0-849e-69f7a1873f58"
        initialQuestion="Tell me about the charge pipe"
        questionKey={2}
        onSignOut={jest.fn()}
      />
    );
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it('draws the way back to the tab the question came from, pinned under the band', async () => {
    ask.mockResolvedValue({ sessionId: 's1', response: 'An answer.', contextKinds: [] });
    const back = jest.fn();
    const view = await render(
      <AdvisorScreen
        vehicleId="db143cdc-e68c-46f0-849e-69f7a1873f58"
        vehicleTitle="2015 BMW M235i"
        initialQuestion="Tell me about the charge pipe"
        questionKey={1}
        origin={{ label: 'Plan', onPress: back }}
        onSignOut={jest.fn()}
      />
    );
    await view.findByText('An answer.');
    await userEvent.setup().press(view.getByLabelText('Back to Plan'));
    expect(back).toHaveBeenCalledTimes(1);
  });

  it('offers a way to put the keyboard away while it is up, and not otherwise', async () => {
    /*
      13 Sep, David: "i want an easy way / cta to collapse keyboard and chat
      bar so that i can more easily read thread." The control exists only
      while the composer is focused — a ghost word on its shoulder — and it
      dismisses the keyboard. Focus is what a keyboard's presence means in
      this runner; the control keys on it.
    */
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    const view = await render(
      <AdvisorScreen vehicleId="db143cdc-e68c-46f0-849e-69f7a1873f58" onSignOut={jest.fn()} />
    );
    await view.findByText('Ask about this car');
    expect(view.queryByLabelText('Hide keyboard')).toBeNull();

    await act(async () => {
      fireEvent(view.getByLabelText('Ask about this car'), 'focus');
    });
    await userEvent.setup().press(view.getByLabelText('Hide keyboard'));
    expect(dismiss).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent(view.getByLabelText('Ask about this car'), 'blur');
    });
    expect(view.queryByLabelText('Hide keyboard')).toBeNull();
    dismiss.mockRestore();
  });

  it('asks nothing when the link carried no question', async () => {
    const view = await render(
      <AdvisorScreen
        vehicleId="db143cdc-e68c-46f0-849e-69f7a1873f58"
        onSignOut={jest.fn()}
      />
    );

    await view.findByText('Ask about this car');
    expect(ask).not.toHaveBeenCalled();
  });
});

describe('the threads — 13 Sep', () => {
  /*
    David: "i need some way to toggle between chat threads... or to view other
    threads and select one to enter, or start new thread." The THREADS control
    on the context row opens the sheet; the sheet lists what the server has;
    picking one makes its messages the transcript and its id the one the next
    question continues; NEW THREAD clears both.
  */
  const VEHICLE = 'db143cdc-e68c-46f0-849e-69f7a1873f58';

  it('lists the car’s threads, newest first as the server sends them, with a label for each', async () => {
    listThreads.mockResolvedValue([
      { id: 't2', title: 'Sport mode vs sport transmission', createdAt: '2026-09-12T10:00:00Z', updatedAt: '2026-09-13T08:40:00Z' },
      { id: 't1', title: null, createdAt: '2026-09-01T10:00:00Z', updatedAt: '2026-09-01T10:05:00Z' },
    ]);
    const view = await render(<AdvisorScreen vehicleId={VEHICLE} vehicleTitle="2015 BMW M235i" onSignOut={jest.fn()} />);
    await view.findByText('Ask about this car');

    await userEvent.setup().press(view.getByLabelText('Threads'));

    expect(await view.findByText('Sport mode vs sport transmission')).toBeTruthy();
    // A thread the server did not name is still a row, with its day beneath it.
    expect(view.getByText('Untitled thread')).toBeTruthy();
    expect(view.getByText('1 SEP')).toBeTruthy();
    expect(listThreads).toHaveBeenCalledWith(VEHICLE);
  });

  it('reopens a picked thread as the transcript, and continues it with its id', async () => {
    listThreads.mockResolvedValue([
      { id: 't2', title: 'Sport mode vs sport transmission', createdAt: null, updatedAt: '2026-09-13T08:40:00Z' },
    ]);
    loadThread.mockResolvedValue({
      id: 't2',
      title: 'Sport mode vs sport transmission',
      turns: [
        { role: 'user', content: 'What is the difference between the modes?' },
        { role: 'assistant', content: 'Sport sharpens the throttle map.' },
      ],
    });
    ask.mockResolvedValue({ sessionId: 't2', response: 'And Sport+ loosens the stability control.', contextKinds: [] });
    const user = userEvent.setup();
    const view = await render(<AdvisorScreen vehicleId={VEHICLE} onSignOut={jest.fn()} />);
    await view.findByText('Ask about this car');

    await user.press(view.getByLabelText('Threads'));
    await user.press(await view.findByLabelText('Open thread Sport mode vs sport transmission'));

    expect(await view.findByText('Sport sharpens the throttle map.')).toBeTruthy();
    expect(view.getByText('What is the difference between the modes?')).toBeTruthy();

    // The next question continues that thread, not a new one.
    await user.type(view.getByLabelText('Ask about this car'), 'And Sport+?');
    await user.press(view.getByLabelText('Send question to the advisor'));
    await view.findByText('And Sport+ loosens the stability control.');
    expect(ask).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 't2', message: 'And Sport+?' }));
  });

  it('starts a new thread from the sheet: the transcript clears and the next question carries no id', async () => {
    ask
      .mockResolvedValueOnce({ sessionId: 's1', response: 'First answer.', contextKinds: [] })
      .mockResolvedValueOnce({ sessionId: 's2', response: 'Fresh answer.', contextKinds: [] });
    listThreads.mockResolvedValue([]);
    const user = userEvent.setup();
    const view = await render(
      <AdvisorScreen vehicleId={VEHICLE} initialQuestion="First question" questionKey={1} onSignOut={jest.fn()} />
    );
    await view.findByText('First answer.');

    await user.press(view.getByLabelText('Threads'));
    await user.press(await view.findByLabelText('Start a new thread'));
    expect(view.queryByText('First answer.')).toBeNull();

    await user.type(view.getByLabelText('Ask about this car'), 'Second question');
    await user.press(view.getByLabelText('Send question to the advisor'));
    await view.findByText('Fresh answer.');
    expect(ask.mock.calls[1][0]).toEqual(expect.objectContaining({ sessionId: null, message: 'Second question' }));
  });
});

describe('provenance', () => {
  it('names its sources under the answer', async () => {
    ask.mockResolvedValue({
      sessionId: 's1',
      response: 'Looks fine.',
      contextKinds: ['service', 'recalls'],
    });

    const view = await renderAdvisor();
    await view.findByText('Looks fine.');

    /*
      "Based on", never "Sources" — the claim is what was put in front of the
      model, not what it used.

      Matched as one string rather than three nodes. Provenance was a "Based on"
      label followed by a chip per kind; it is now a single `ProvenanceRow` line,
      because a badge beside a generated answer borrows the appearance of a
      verified one — and because those chips rendered at 11px, under the type
      floor. The rule this asserts is unchanged; only the markup is.
    */
    expect(view.getByText(/^Based on/)).toBeTruthy();
    expect(view.getByText(/Service records/)).toBeTruthy();
    expect(view.getByText(/Recall data/)).toBeTruthy();
    expect(view.queryByText(/Sources/)).toBeNull();
  });

  it('claims nothing when the server sent no kinds', async () => {
    ask.mockResolvedValue({ sessionId: 's1', response: 'Looks fine.', contextKinds: [] });

    const view = await renderAdvisor();
    await view.findByText('Looks fine.');

    expect(view.queryByText('Based on')).toBeNull();
  });
});

describe('contrast', () => {
  it('holds the AA floor with an answer on screen', async () => {
    ask.mockResolvedValue({
      sessionId: 's1',
      response: ANSWER,
      contextKinds: ['knowledge', 'service'],
    });

    const view = await renderAdvisor();
    await view.findByText(/Blackmarket/);

    expect(belowFloor(auditText(view))).toEqual([]);
  });
});

/**
 * ── The empty state, after R50 / R52 / R53 / R54 ────────────────────────────
 *
 * The v8.3 review's four findings on this screen were one shape: three ragged
 * centred lines at the top of a mostly-empty screen, a car name jammed into the
 * nav title, and a composer that read as a field beside a button. These pin the
 * parts a render can see.
 */
describe('the advisor before anyone has asked anything', () => {
  it('offers its starters as rows that write into the composer', async () => {
    const view = await render(<AdvisorScreen vehicleId="v1" onSignOut={jest.fn()} />);

    const starter = view.getByLabelText(
      'Start with: What should I do at the next service?'
    );

    /*
      ⚠ Tapping **fills**, it does not send. `EmptyState`'s rule was that these
      must not become a menu on the first screen a new user meets; the question
      landing in the composer keeps asking it a deliberate second act. So the
      assertion is on the composer's value and on `askAdvisor` NOT having run.
    */
    await userEvent.press(starter);

    expect(view.getByLabelText('Ask about this car').props.value).toBe(
      'What should I do at the next service?'
    );
    expect(ask).not.toHaveBeenCalled();
  });

  it('reads left, all the way down', async () => {
    /*
      R53. The headline was centred while the starters and composer were left,
      so one screen carried two alignments. `align="start"` is what removes the
      `textAlign: 'center'` the primitive applies by default.
    */
    const view = await render(<AdvisorScreen vehicleId="v1" onSignOut={jest.fn()} />);

    const headline = view.getByText('Ask about this car');
    const flat = (StyleSheet.flatten(headline.props.style) ?? {}) as Record<string, unknown>;
    expect(flat.textAlign).toBe('left');
  });

  it('names the car under the nav rather than in it', async () => {
    // R52. The nav title is `Advisor` alone; the car is a line on the screen.
    const view = await render(
      <AdvisorScreen vehicleId="v1" vehicleTitle="2015 BMW M235i" onSignOut={jest.fn()} />
    );

    await view.findByText('About 2015 BMW M235i');
  });

  it('says nothing about a car it was not told about', async () => {
    // A deep link carries no name, and "About Vehicle" reads like a bug.
    const view = await render(<AdvisorScreen vehicleId="v1" onSignOut={jest.fn()} />);

    expect(view.queryByText(/^About /)).toBeNull();
  });
});

/**
 * ── LEG-02: explicit permission before a question reaches Google ────────────
 *
 * Apple amended Guideline 5.1.2(i) in November 2025 to require **explicit
 * permission** before personal data is shared with a third-party AI. Tappet
 * had the disclosure in its privacy policy; the only consent was sign-up wrap.
 */
describe('asking before a question goes to Google', () => {
  afterEach(() => {
    mockConsent = 'granted';
  });

  it('asks before the first question leaves', async () => {
    mockConsent = 'unknown';
    const user = userEvent.setup();

    const view = await render(<AdvisorScreen vehicleId="v1" onSignOut={jest.fn()} />);

    await user.type(view.getByLabelText('Ask about this car'), 'Is the timing chain a worry?');
    await user.press(view.getByLabelText('Send question to the advisor'));

    await view.findByText('The advisor is Google’s AI');
    expect(ask).not.toHaveBeenCalled();
  });

  it('sends the held question once they agree', async () => {
    // A consent sheet that loses your work reads as an obstacle, not a question.
    mockConsent = 'unknown';
    const user = userEvent.setup();

    const view = await render(<AdvisorScreen vehicleId="v1" onSignOut={jest.fn()} />);

    await user.type(view.getByLabelText('Ask about this car'), 'Is the timing chain a worry?');
    await user.press(view.getByLabelText('Send question to the advisor'));
    await user.press(await view.findByText('Ask the advisor'));

    await waitFor(() =>
      expect(ask).toHaveBeenCalledWith(expect.objectContaining({ message: 'Is the timing chain a worry?' }))
    );
  });

  it('gates the deep-link path too', async () => {
    /*
      ⚠ The hole worth naming. This path is a **notification tap** — "Tap to ask
      the advisor what it means" — and it sends a question and this car's
      records to Google without anybody typing. A consent requirement that the
      app's own deep link walks around is not a consent requirement.
    */
    mockConsent = 'unknown';

    const view = await render(
      <AdvisorScreen vehicleId="v1" initialQuestion="What does this recall mean?" onSignOut={jest.fn()} />
    );

    await view.findByText('The advisor is Google’s AI');
    expect(ask).not.toHaveBeenCalled();

    // …and the question is not lost — it is in the composer to send by hand.
    expect(view.getByLabelText('Ask about this car').props.value).toBe(
      'What does this recall mean?'
    );
  });

  it('does not block the screen when they decline', async () => {
    /*
      Declining means "no AI features", never "no app". The transcript, the
      starters and the composer all stay; what changes is a line saying what is
      off and a way to turn it back on.
    */
    mockConsent = 'declined';

    const view = await render(<AdvisorScreen vehicleId="v1" onSignOut={jest.fn()} />);

    await view.findByText(/Everything else in Tappet works the same/);
    view.getByLabelText('Ask about this car');
    view.getByText('Change that');
  });

  it('names Google, and says what leaves', async () => {
    mockConsent = 'unknown';
    const user = userEvent.setup();

    const view = await render(<AdvisorScreen vehicleId="v1" onSignOut={jest.fn()} />);

    await user.type(view.getByLabelText('Ask about this car'), 'anything');
    await user.press(view.getByLabelText('Send question to the advisor'));

    await view.findByText(/this car’s records go to Google/);
    // ⚠ And says what does *not* — narrower than the invoice sheet on purpose.
    await view.findByText(/No photographs and no documents/);
  });
});

describe('when the advisor is refused as a paid feature — E6’s wire, off', () => {
  /*
    The server's gate answers `code: 'needs-subscription'` beside its sentence
    (`lib/feature-gate.ts`). The screen keys on the code, keeps the sentence,
    and asks for the paywall — rather than the 502 branch's "try again", which
    cannot help when the answer is a purchase.

    Reachable only with `PAID_FEATURES_ENFORCED` on, which it is not; this is
    the wire, tested while it is cold.
  */
  const refusal = () =>
    new ApiRequestError({
      status: 402,
      message: 'The advisor is part of Tappet Plus. Your garage, service log, mileage and recall alerts stay free.',
      code: 'needs-subscription',
    });

  it('keeps the server’s sentence and asks for the paywall', async () => {
    ask.mockRejectedValue(refusal());
    const upgrade = jest.fn();
    const stop = onUpgradeRequested(upgrade);

    const view = await renderAdvisor();

    expect(await view.findByText(/is part of Tappet Plus/)).toBeTruthy();
    expect(upgrade).toHaveBeenCalledWith({ feature: 'advisor' });
    // Not the retry advice: trying again cannot help here.
    expect(view.queryByText(/try again/i)).toBeNull();

    stop();
  });

  it('leaves the question in the composer, like every other refusal', async () => {
    ask.mockRejectedValue(refusal());
    const stop = onUpgradeRequested(jest.fn());

    const view = await renderAdvisor('Is this quote fair?');

    await view.findByText(/is part of Tappet Plus/);
    expect(view.getByDisplayValue('Is this quote fair?')).toBeTruthy();

    stop();
  });

  it('does not open the paywall on an ordinary 502', async () => {
    // Anti-vacuous: the code is the key, not the failure.
    ask.mockRejectedValue(new ApiRequestError({ status: 502, message: 'Failed to answer' }));
    const upgrade = jest.fn();
    const stop = onUpgradeRequested(upgrade);

    const view = await renderAdvisor();

    expect(await view.findByText(/try again/i)).toBeTruthy();
    expect(upgrade).not.toHaveBeenCalled();

    stop();
  });
});
