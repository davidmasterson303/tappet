import { PixelRatio, StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import Text, { TYPE_SCALE_MAX, TextInput, typeScale } from '../Text';

/**
 * The app's text honours Larger Text up to xxx-Large and never below the
 * design size — 21 Sep, after the device showed every row clipped at both
 * ends of the setting.
 */
const flat = (style: unknown) => StyleSheet.flatten(style as never) as Record<string, unknown>;

describe('typeScale', () => {
  const original = PixelRatio.getFontScale;
  afterEach(() => {
    PixelRatio.getFontScale = original;
  });

  it('is the system multiplier through the standard range, and 1.35 at the top of it', () => {
    PixelRatio.getFontScale = () => 1.12;
    expect(typeScale()).toBe(1.12);
    PixelRatio.getFontScale = () => 1.35;
    expect(typeScale()).toBe(1.35);
  });

  it('holds at 1.35 for the accessibility sizes — a stated cap, not a broken row', () => {
    PixelRatio.getFontScale = () => 2.35;
    expect(typeScale()).toBe(TYPE_SCALE_MAX);
  });

  it('never shrinks below the design size', () => {
    PixelRatio.getFontScale = () => 0.82;
    expect(typeScale()).toBe(1);
  });

  it('scales fontSize and lineHeight together, with the platform scaling off', async () => {
    PixelRatio.getFontScale = () => 1.6;
    const view = await render(<Text style={{ fontSize: 14, lineHeight: 20 }}>Maple Street Auto</Text>);
    const node = view.getByText('Maple Street Auto');
    expect(node.props.allowFontScaling).toBe(false);
    expect(flat(node.props.style)).toMatchObject({ fontSize: 19, lineHeight: 27 });
  });

  it('leaves a style with no size to the platform, and passes the design size through at ×1', async () => {
    PixelRatio.getFontScale = () => 1.6;
    const bare = (await render(<Text>Bare</Text>)).getByText('Bare');
    expect(flat(bare.props.style).fontSize).toBeUndefined();

    PixelRatio.getFontScale = () => 1;
    const design = (await render(<Text style={{ fontSize: 13 }}>Design</Text>)).getByText('Design');
    expect(flat(design.props.style)).toEqual({ fontSize: 13 });
  });

  it('applies the same rule to a field', async () => {
    PixelRatio.getFontScale = () => 1.24;
    const view = await render(<TextInput accessibilityLabel="VIN" style={{ fontSize: 16 }} />);
    const input = view.getByLabelText('VIN');
    expect(input.props.allowFontScaling).toBe(false);
    expect(flat(input.props.style).fontSize).toBe(20);
  });
});
