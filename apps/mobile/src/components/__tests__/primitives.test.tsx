import { Text, processColor } from 'react-native';
import { fireEvent, render, userEvent } from '@testing-library/react-native';

import AlertBanner from '../AlertBanner';
import BandRow from '../BandRow';
import Button from '../Button';
import Chip from '../Chip';
import EmptyState from '../EmptyState';
import Field from '../Field';
import ListRow from '../ListRow';
import ProvenanceRow from '../ProvenanceRow';
import RecallBand from '../RecallBand';
import {
  FIELD_FONT_MIN,
  SPEC_ROW,
  TARGET_MIN,
  TYPE_MIN,
  border,
  brand,
  register,
  status,
  surface,
  text,
} from '../../theme';

/**
 * The primitive set's invariants.
 *
 * These are the rules that cannot live in a docblock, because every one of them
 * has already been broken once in this product by someone who had read the
 * docblock. The handoff's phrasing is the standard: **states are not optional**.
 *
 * Deliberately not snapshots. A snapshot records what the component renders and
 * fails when anything changes, which trains people to re-record it; these
 * assert the handful of properties that must survive a redesign.
 */

const flat = (style: unknown) =>
  Object.assign({}, ...[style].flat(Infinity).filter(Boolean)) as Record<string, unknown>;


/**
 * The ground a control actually paints, now that the 45° cut moved it into SVG.
 *
 * ⚠ These assertions used to read `backgroundColor` off the `Pressable`. B4 put
 * the fill in a `CutSurface`, which paints an SVG path and **declares** the
 * colour with `auditSurface` so `test-support/contrast.ts` can still find it.
 * Reading that same declaration here keeps these guards checking the thing they
 * were written to check, rather than checking a property that moved.
 */
function groundOf(node: unknown): string | undefined {
  if (!node || typeof node !== 'object') return undefined;
  const host = node as { props?: Record<string, unknown>; children?: unknown[] };
  if (typeof host.props?.auditSurface === 'string') return host.props.auditSurface;
  for (const child of host.children ?? []) {
    const found = groundOf(child);
    if (found) return found;
  }
  return undefined;
}

/** The padded, centred box inside the control — where the sizing now lives. */
function boxStyleOf(node: unknown): Record<string, unknown> | undefined {
  if (!node || typeof node !== 'object') return undefined;
  const host = node as { props?: Record<string, unknown>; children?: unknown[] };
  if (typeof host.props?.auditSurface === 'string' || host.props?.auditSurface === undefined) {
    const style = flat(host.props?.style);
    if (style && typeof style.minHeight === 'number') return style;
  }
  for (const child of host.children ?? []) {
    const found = boxStyleOf(child);
    if (found) return found;
  }
  return undefined;
}

describe('Button', () => {
  it('keeps its accessible name while working', async () => {
    // The <Text> naming it is swapped for a spinner, so a control named by its
    // child goes anonymous exactly when it has something to say.
    const view = await render(<Button label="Saving" busy onPress={jest.fn()} />);

    const control = view.getByLabelText('Saving');
    expect(control.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
  });

  it('does not fire while busy', async () => {
    const onPress = jest.fn();
    const user = userEvent.setup();
    const view = await render(<Button label="Save" busy onPress={onPress} />);

    await user.press(view.getByLabelText('Save'));

    expect(onPress).not.toHaveBeenCalled();
  });

  it('disables with an explicit fill rather than a group opacity', async () => {
    /*
      The 1.61:1 defect. An `opacity` on the container composites everything
      beneath it including ink that was compliant at full strength, and both
      contrast guards were blind to it.
    */
    const view = await render(<Button label="Delete" disabled onPress={jest.fn()} />);
    const style = flat(view.getByLabelText('Delete').props.style);

    expect(style.opacity).toBeUndefined();
    expect(groundOf(view.toJSON())).toBe(surface.disabled);
  });

  it('keeps the small size on the 44pt floor', async () => {
    // "Small" is narrower and lighter in type. It is not shorter — the floor is
    // a coarse-pointer target, not a style.
    const view = await render(<Button label="Add" size="small" onPress={jest.fn()} />);

    // ⚠ The height moved onto the cut surface, so the fill reaches the control's
    // edges. The floor is unchanged and is still the thing being asserted.
    expect(boxStyleOf(view.toJSON())?.minHeight).toBeGreaterThanOrEqual(TARGET_MIN);
  });

  it('renders every variant', async () => {
    for (const variant of ['primary', 'outline', 'ghost', 'delete'] as const) {
      const view = await render(<Button label={variant} variant={variant} onPress={jest.fn()} />);
      expect(view.getByLabelText(variant)).toBeTruthy();
    }
  });
});

describe('Chip', () => {
  it('cannot render below the type floor', async () => {
    /*
      The design system's own stylesheet ships `.chip` at 11px and every chip on
      the board overrides it back. Encoded here so a call site cannot repeat it:
      there is no size prop.
    */
    const view = await render(<Chip label="Overdue" tone="critical" />);
    const style = flat(view.getByText('Overdue').props.style);

    expect(style.fontSize).toBeGreaterThanOrEqual(TYPE_MIN);
  });
});

describe('Field', () => {
  it('holds the 16px floor against a caller trying to lower it', async () => {
    // Under 16px iOS zooms on focus and never zooms back, stranding someone
    // mid-form at 1.3x. The floor is applied after the caller's style.
    const view = await render(
      <Field label="Current mileage" value="48210" style={{ fontSize: 11 }} />
    );
    const style = flat(view.getByLabelText('Current mileage').props.style);

    expect(style.fontSize).toBe(FIELD_FONT_MIN);
  });

  it('names the input by its visible label, not its placeholder', async () => {
    // VoiceOver reads a placeholder as the field's *value* when empty, and it
    // disappears once someone types.
    const view = await render(<Field label="VIN" placeholder="17 characters" value="" />);

    expect(view.getByLabelText('VIN')).toBeTruthy();
  });

  it('describes a problem rather than only colouring the edge', async () => {
    const view = await render(
      <Field label="VIN" value="JF1VA1E6XJ98" problem="A VIN is 17 characters. This one has 12." />
    );

    expect(view.getByText(/17 characters/)).toBeTruthy();
    expect(view.getByLabelText('VIN').props['aria-invalid']).toBe(true);
  });

  /*
    ── 12 Sep · focus is cyan, and so is the caret — B7 ────────────────────

    The brief: *"cyan hairline on focus"*, and *"no system blue"*. A field
    had no focus state, and the caret — the one thing that did change on
    focus — was iOS's blue. The stroke is read off the rendered `RNSVGPath`,
    which only exists once the surface has measured itself, so the layout
    event is fired by hand; the caret is the `TextInput`'s own prop.
  */
  const strokeOf = (view: Awaited<ReturnType<typeof render>>): number | null => {
    const found: number[] = [];
    const walk = (node: unknown) => {
      if (!node || typeof node !== 'object') return;
      const host = node as { type?: unknown; props?: Record<string, unknown>; children?: unknown[] };
      const stroke = host.props?.stroke as { payload?: unknown } | undefined;
      if (host.type === 'RNSVGPath' && stroke && typeof stroke === 'object' && 'payload' in stroke) {
        found.push(Number(stroke.payload));
      }
      for (const child of host.children ?? []) walk(child);
    };
    walk(view.toJSON());
    return found[0] ?? null;
  };

  const measured = async (element: React.ReactElement, label: string) => {
    const view = await render(element);
    /*
      The input carries no `onLayout`; `fireEvent` walks up to the first
      ancestor that does, which is the `CutSurface` painting the field.
    */
    await fireEvent(view.getByLabelText(label), 'layout', {
      nativeEvent: { layout: { width: 320, height: 48 } },
    });
    return view;
  };

  it('draws the hairline at rest and steps it to cyan while focused', async () => {
    const view = await measured(<Field label="Odometer" value="66000" />, 'Odometer');

    expect(strokeOf(view)).toBe(Number(processColor(border.field)));

    await fireEvent(view.getByLabelText('Odometer'), 'focus');
    expect(strokeOf(view)).toBe(Number(processColor(brand.accent)));

    await fireEvent(view.getByLabelText('Odometer'), 'blur');
    expect(strokeOf(view)).toBe(Number(processColor(border.field)));
  });

  it('keeps a problem sodium even under focus, because that is the signal the sentence is about', async () => {
    const view = await measured(
      <Field label="VIN" value="JF1" problem="A VIN is 17 characters." />,
      'VIN'
    );

    await fireEvent(view.getByLabelText('VIN'), 'focus');
    expect(strokeOf(view)).toBe(Number(processColor(status.dangerBorder)));
  });

  it('never leaves the caret to the system', async () => {
    const view = await render(<Field label="Odometer" value="66000" />);
    const input = view.getByLabelText('Odometer');

    // Processed by the host, so both sides go through the same conversion.
    expect(Number(processColor(input.props.selectionColor))).toBe(Number(processColor(brand.accent)));
  });
});

describe('AlertBanner', () => {
  it('announces headline and body as one utterance', async () => {
    const view = await render(
      <AlertBanner tone="critical" headline="Do not drive" body="Fuel pump assembly" />
    );

    expect(view.getByLabelText('Do not drive. Fuel pump assembly')).toBeTruthy();
    expect(view.getByLabelText('Do not drive. Fuel pump assembly').props.accessibilityRole).toBe(
      'alert'
    );
  });
});

describe('ListRow', () => {
  it('renders a missing value as an em dash rather than dropping the row', async () => {
    /*
      If the row exists, its label is a promise that the fact is tracked.
      Dropping it silently rewrites what the product claims to know.
    */
    const view = await render(<ListRow label="Average per month" value={null} />);

    expect(view.getByText('—')).toBeTruthy();
    expect(view.getByText('Average per month')).toBeTruthy();
  });

  it('reads a tappable row as one sentence', async () => {
    const view = await render(
      <ListRow label="Mileage" value="66,000 mi" detail="Read 4 days ago" onPress={jest.fn()} />
    );

    expect(view.getByLabelText('Mileage, 66,000 mi, Read 4 days ago')).toBeTruthy();
  });
});

describe('BandRow', () => {
  /*
    The spec-table destination row — `RecallBand` with the recall taken out of
    it (12 Sep). The invariants are the ones that separated it from the
    `NavRow` it replaced:
    the label is a section head in the condensed grotesk, the only glyph it
    can carry is the warning, and a stack of them reads as one table.
  */
  it('sets the label as a condensed-grotesk section head, with a chevron and no glyph', async () => {
    const view = await render(<BandRow label="What is driving this score" onPress={jest.fn()} />);

    const label = flat(view.getByText('What is driving this score').props.style);
    // B1: the section head slot, not the body sans the old `NavRow` used.
    expect(label.textTransform).toBe('uppercase');
    expect(String(label.fontFamily)).toMatch(/Archivo/i);
    // The mark is hidden from the reader, so the query has to look past that
    // — otherwise this passes on a row that draws the triangle everywhere.
    expect(view.queryByText('△', { includeHiddenElements: true })).toBeNull();
  });

  it('draws the sodium triangle only for a warning', async () => {
    // B7: sodium is a hairline triangle beside a genuine warning, and the row
    // has no other glyph slot — `warning` is the one door, and it is a boolean.
    const view = await render(<BandRow label="Open recalls" warning onPress={jest.fn()} />);

    const mark = flat(view.getByText('△', { includeHiddenElements: true }).props.style);
    expect(mark.color).toBe(status.attention);
  });

  it('closes the table under the last row and not under the others', async () => {
    const last = await render(<BandRow label="Open recalls" onPress={jest.fn()} last />);
    const middle = await render(<BandRow label="What is driving this score" onPress={jest.fn()} />);

    const rule = (view: typeof last, label: string) => flat(view.getByLabelText(label).props.style);

    expect(rule(last, 'Open recalls').borderBottomWidth).toBeGreaterThan(0);
    expect(rule(middle, 'What is driving this score').borderBottomWidth).toBeUndefined();
    // Every row rules its own top edge; B6's 56pt from rule to rule.
    expect(rule(middle, 'What is driving this score').borderTopWidth).toBeGreaterThan(0);
    expect(rule(middle, 'What is driving this score').minHeight).toBe(SPEC_ROW);
  });

  it('reads as one utterance, and lets a caller write the sentence', async () => {
    const plain = await render(
      <BandRow label="Open recalls" count="2" detail="Fuel system" onPress={jest.fn()} />
    );
    expect(plain.getByLabelText('Open recalls, 2, Fuel system')).toBeTruthy();

    const recall = await render(<RecallBand count={1} worst="Airbags." onPress={jest.fn()} />);
    // `RecallBand` owns the noun and the reader's sentence; the row draws.
    expect(recall.getByLabelText('View 1 open recall. Airbags.')).toBeTruthy();
    expect(recall.getByText('△', { includeHiddenElements: true })).toBeTruthy();
    expect(recall.getByText('1')).toBeTruthy();
  });

  it('opens where it says it goes', async () => {
    const onPress = jest.fn();
    const view = await render(<BandRow label="What is driving this score" onPress={onPress} />);

    await userEvent.setup().press(view.getByText('What is driving this score'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('ProvenanceRow', () => {
  it('says "Based on", never "Sources"', async () => {
    const view = await render(<ProvenanceRow kinds={['service history', 'open recalls']} />);

    expect(view.getByText(/^Based on/)).toBeTruthy();
    expect(view.queryByText(/Sources/)).toBeNull();
  });

  it('is never confirm-coloured, because nothing here is verified', async () => {
    // A green badge beside a generated answer reads as verified. It is a quiet
    // line of muted text on purpose, and deliberately not a Chip.
    const view = await render(<ProvenanceRow kinds={['service history']} />);
    const style = flat(view.getByText(/^Based on/).props.style);

    expect(style.color).toBe(text.muted);
  });

  it('renders nothing when there is no provenance to state', async () => {
    const view = await render(<ProvenanceRow kinds={[]} />);

    expect(view.queryByText(/Based on/)).toBeNull();
  });
});

describe('pressed states', () => {
  /*
    ⚠ Only one of these three claims can be made here, and the missing two are
    the interesting ones.

    React Native's `Pressable` drives its pressed state through `usePressability`
    and the responder system, not through a prop this runner can fire at: a
    synthetic `pressIn` on the host node leaves `style` resolved for
    `pressed: false`, so the tree only ever shows the resting state. Measured —
    both a `props.style` read and a `fireEvent(row, 'pressIn')` returned the
    resting value.

    So "a pressed style must change something" lives in
    `lib/__tests__/mobile-pressed-states.test.ts` as a source rule instead. That
    is a weaker kind of check and it is the kind available: the defect it exists
    for — `ListRow`'s `pressed: { opacity: 1 }`, a declaration that changes
    nothing while looking like feedback — is visible in source and invisible
    here.
  */
  it('leaves an untappable row alone', async () => {
    // No handler, no button role, and nothing to acknowledge.
    const view = await render(<ListRow label="Mileage" value="66,000 mi" />);

    expect(view.queryByRole('button')).toBeNull();
  });

  it('gives a tappable one the role that says it can be pressed', async () => {
    const view = await render(<ListRow label="Mileage" value="66,000 mi" onPress={jest.fn()} />);

    expect(view.getByRole('button')).toBeTruthy();
  });
});

describe('Button — one filled treatment', () => {
  /*
    ── The white variant is retired, 23 Aug ──────────────────────────────────

    `inverse` was a sixth variant: white fill, near-black ink, four dedicated
    tokens, four measured states. It was against the system the whole time —
    the readme's override register says *"a white button is a foreign colour
    here"* — and the v8.3 review found what that cost: `Take a photo`, `That is
    right` and `Ask` were white while `See suggestions` was cyan, so the app had
    two filled primaries and the commoner one was the forbidden one.

    These cases replace its four. They are the same properties, asserted of the
    treatment that survived, and they exist so the retirement is a fact a test
    holds rather than a commit message.
  */
  it('wears the off-white fill, and still never pure white', async () => {
    /*
      ── ⚠ 6 Sep: this asserted `brand.primary` until today ───────────────────

      It read "wears the brand fill, not white", and it was right for the system
      that existed when it was written: on 23 Aug `surface.inverse` was deleted
      because "a white button is a foreign colour here", leaving the cyan fill as
      the app's only filled control.

      The system moved. Under the two-hue collapse a *hue* fill is what is
      reserved for hover and critical, and good news — the primary action
      included — is off-white ink. A teal block is now the foreign colour. Locked
      brief B7 and the studio paragraph both say so; `docs/design-system-drift.md`
      §6.7 records the reversal for Design.

      ⚠ **The half that did not change is the half worth keeping.** Pure
      `#FFFFFF` was the retired token and is still banned; this is `text.primary`,
      the system's own ink used as a ground. The next case checks the retired
      tokens are still absent, which is what stops the old white control
      returning through this door.
    */
    const view = await render(<Button label="Sign in" onPress={jest.fn()} />);

    const fill = groundOf(view.toJSON());
    expect(fill).toBe(text.primary);
    expect(fill).not.toBe('#FFFFFF');

    // Graphite ink on it, never the old `onPrimary` cyan-white.
    expect(flat(view.getByText('Sign in').props.style).color).toBe(surface.page);
  });

  it('has no white fill left to reach for', async () => {
    /*
      The other direction, and the one with no visible symptom: a retired
      variant whose tokens survive comes back one call site at a time, with its
      argument already written beside it. So the theme must not still carry
      them — asserted here rather than only in the source scan, because this is
      where somebody restoring the variant would be working.
    */
    const carried = surface as Record<string, unknown>;
    expect(carried.inverse).toBeUndefined();
    expect(carried.inverseDisabled).toBeUndefined();
    expect((text as Record<string, unknown>).onInverse).toBeUndefined();
  });

  it('stays a fill swap when disabled, never a group opacity', async () => {
    /*
      An `opacity` on the container composites everything beneath it, including
      ink that was compliant at full strength. This app put a near-black "Ask"
      label at 1.61:1 exactly that way, invisible to both guards.
    */
    const view = await render(<Button label="Sign in" disabled onPress={jest.fn()} />);
    const control = view.getByLabelText('Sign in');

    expect(groundOf(view.toJSON())).toBe(surface.disabled);
    expect(flat(control.props.style).opacity).toBeUndefined();
    expect(flat(view.getByText('Sign in').props.style).color).toBe(text.disabled);
  });

  it('keeps its accessible name while working', async () => {
    // The label is hidden behind the busy form, so a control named by its
    // child would go anonymous exactly when it has something to say.
    const view = await render(<Button label="Create account" busy onPress={jest.fn()} />);

    const control = view.getByLabelText('Create account');
    expect(control.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
  });

  /*
    ── 12 Sep · the busy form is the wait instrument's — brief B7 ────────────

    This case used to find exactly one `ActivityIndicator` and check its ink
    against the fill. There is no spinner any more: a busy button drops to the
    outlined form at its rest width and says what it is doing in the state
    voice — the 14pt wait mark and a mono status, both in the lit info blue.
    The claims that survive: the control paints no fill while busy (so the
    disabled grey cannot read as "switched off under the finger"), the status
    is in the token web sets it in, the rest label is still in the tree
    holding the width, and the mark is drawn.
  */
  it('drops to the outlined form and says what it is doing, in the state voice', async () => {
    const view = await render(
      <Button label="Add to my garage" busy busyLabel="Saving your car" onPress={jest.fn()} />
    );

    // No fill — the outline is the busy form's whole surface.
    expect(groundOf(view.toJSON())).toBeUndefined();

    // The status, in mono caps and the lit info blue.
    const status = view.getByText('Saving your car');
    const statusStyle = flat(status.props.style);
    expect(statusStyle.color).toBe(register.accentStrong);
    expect(statusStyle.textTransform).toBe('uppercase');
    expect(String(statusStyle.fontFamily)).toMatch(/JetBrainsMono/);

    // The rest label holds the width, invisibly — and is hidden from
    // assistive technology, which is why the query has to be told to look.
    const rest = view.getByText('Add to my garage', { includeHiddenElements: true });
    expect(flat(rest.props.style).opacity).toBe(0);
    expect(view.queryByText('Add to my garage')).toBeNull();

    // The mark: the instrument's two paths — track and pip — and no spinner.
    const paths = hostTypes(view.toJSON()).filter((type) => type === 'RNSVGPath');
    expect(paths).toHaveLength(2);
    expect(hostTypes(view.toJSON()).some((type) => type.includes('ActivityIndicator'))).toBe(false);
  });

  it('carries the bare mark when the status is empty, for a control too narrow for a word', async () => {
    const view = await render(<Button label="Ask" busy busyLabel="" onPress={jest.fn()} />);

    expect(view.getByLabelText('Ask').props.accessibilityState).toMatchObject({ busy: true });
    expect(hostTypes(view.toJSON()).filter((type) => type === 'RNSVGPath')).toHaveLength(2);
    // Only the rest label is in the tree — no second, empty status string.
    expect(view.getAllByText(/./, { includeHiddenElements: true })).toHaveLength(1);
  });

  it('defaults the status to the label', async () => {
    const view = await render(<Button label="Save" busy onPress={jest.fn()} />);
    // Both: the invisible rest label and the visible status.
    expect(view.getAllByText('Save', { includeHiddenElements: true })).toHaveLength(2);
    expect(view.getAllByText('Save')).toHaveLength(1);
  });
});

/** Every host node type in a rendered tree, in document order. */
function hostTypes(node: unknown, acc: string[] = []): string[] {
  if (!node || typeof node !== 'object') return acc;
  const host = node as { type?: unknown; children?: unknown[] };
  if (typeof host.type === 'string') acc.push(host.type);
  for (const child of host.children ?? []) hostTypes(child, acc);
  return acc;
}

describe('EmptyState', () => {
  /*
    Zero callers until 16 Aug, while four screens rolled their own — the garage,
    the advisor, service history and the wishlist, at three different title
    sizes.

    ⚠ The advisor's was the reason the gap survived an audit: it was a local
    function *named `EmptyState`*, shadowing the import that would have replaced
    it. A private copy called `emptyBlock` is easy to spot; one wearing the
    primitive's own name is invisible.
  */
  it('says what, says why, and offers the door', async () => {
    const onAction = jest.fn();
    const view = await render(
      <EmptyState
        headline="No vehicles yet"
        body="Add your first car and Tappet gets to work on it."
        actionLabel="Add a car"
        onAction={onAction}
      />
    );

    view.getByText('No vehicles yet');
    view.getByText('Add your first car and Tappet gets to work on it.');
    await userEvent.setup().press(view.getByLabelText('Add a car'));
    expect(onAction).toHaveBeenCalled();
  });

  it('lets the action carry its own spoken name', async () => {
    /*
      The garage needs it: the header already has an "Add a car" control, and
      two controls with the same spoken name on one screen are ambiguous to a
      screen reader in a way they are not to the eye, which has position to go
      on. The visible label stays short.
    */
    const view = await render(
      <EmptyState
        headline="No vehicles yet"
        body="Add your first car."
        actionLabel="Add a car"
        actionAccessibilityLabel="Add your first car"
        onAction={jest.fn()}
      />
    );

    view.getByLabelText('Add your first car');
    view.getByText('Add a car');
  });

  it('renders quiet extra content without turning it into controls', async () => {
    /*
      The advisor's three example questions. Its own note is the rule: they are
      examples, not prompts, and making them buttons would turn a conversation
      into a menu on the first screen a new user meets.
    */
    const view = await render(
      <EmptyState headline="Ask about this car" body="It already knows the history.">
        <Text>“What should I do at the next service?”</Text>
      </EmptyState>
    );

    view.getByText('“What should I do at the next service?”');
    expect(view.queryByRole('button')).toBeNull();
  });

  it('offers no door when there is nowhere to go', async () => {
    // Service history has no navigation callbacks, so an action there could
    // not lead anywhere. The body names the routes in instead.
    const view = await render(
      <EmptyState headline="Nothing recorded yet" body="Scan an invoice and it appears here." />
    );

    expect(view.queryByRole('button')).toBeNull();
  });
});
