import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@tappet/core/utils';
import { WorkingMark } from '@/components/Working';

/**
 * The button primitive — v8 §8a.
 *
 * This was stock shadcn until 8 Aug, and `.field` had already made the argument
 * for fixing it here rather than at the call sites: **a call site that still
 * needs a colour is a bug in the primitive.** Five defects, each measured
 * rather than asserted:
 *
 *   - `rounded-md`. The radius happened to land near right, by coincidence —
 *     shadcn's `md` and this app's `md` are different numbers. `rounded-xl` was
 *     the design-system token every other control in the product used.
 *     ⚠ Superseded 4 Sep by brief B4: the control's shape is now the 45-degree
 *     cut, not a radius, so this carries `chamfer-sm rounded-none`. The defect
 *     described here was real and is still worth knowing — it is why the
 *     radius was ever a token rather than a literal — but do not read
 *     `rounded-xl` off this paragraph as current.
 *
 *   - `ring-offset-2`. **An offset gap on a dark surface reads as a hairline
 *     crack, not a ring.** Settled for fields in v7 and never applied here. The
 *     halo now touches the border.
 *
 *   - The `outline` variant filled with `bg-background` — surface-0 — so it
 *     rendered **darker than the card holding it**. A raised control darker
 *     than its container does not read as raised; it reads as a hole. It fills
 *     with nothing now and inherits whatever surface it sits on, so it cannot
 *     come out darker than its container on any of them.
 *
 *   - `h-10` = **40px**, under the 44px floor RB0 rule 3 states for any
 *     interactive target — on the primitive every button in the app is built
 *     from.
 *
 *   - `disabled:opacity-50`. A group alpha multiplies with any alpha inside it,
 *     which is how `ModificationsTab`'s badges reached an effective 0.30. The
 *     disabled state is an explicit fill and explicit ink now, so there is
 *     nothing to multiply and the contrast guard can measure it.
 *
 * ── Two deliberate departures from the design system's spec ─────────────────
 *
 * **44px everywhere, not 40 on a fine pointer.** `tokens/buttons.css` scopes
 * 40px to `(pointer: fine)` and 44px to coarse, arguing a mouse is precise
 * enough for 40. That is reasonable, and this repo's own RB0 rule 3 says 44 for
 * *any* interactive target with no pointer exception. Following the stricter of
 * the two rules costs 4px of desktop density and needs no new Tailwind variant.
 *
 * **Hover does not go up the ramp.** The spec says hover returns to cyan-600
 * (`#0891B2`). It is refused, and since 4 Sep for a second reason as well as
 * the original measured one: the rest fill is off-white and hover is the
 * sodium fill, so hover is the only place on a resting surface where a hue
 * fills an area. It has to be the hue that means "the thing you are about to
 * touch", not the one that means "information". The reasoning is in
 * `app/globals.css` beside `--primary`.
 *
 * ⚠ `hoverable:` and `focusable:`, not `hover:` and `focus-visible:`. They are
 * custom variants defined in `tailwind.config.ts` that compile to the real
 * pseudo-class **and** to `[data-force~="…"]`, so the design-system specimen
 * page can render a genuine hover state in a still screenshot without a second
 * copy of the declaration to drift from. Writing both spellings on one element
 * would emit two rules of equal specificity whose winner is decided by
 * generated source order — so these replace the originals rather than joining
 * them.
 */
const buttonVariants = cva(
  [
    'inline-flex items-center justify-center whitespace-nowrap',
    /*
      The cut, not a radius — brief B4. `--radius` is 5px now and the shape of
      the control is the 45-degree corner, which `.chamfer-sm` clips.

      ⚠ `ring-inset` is not a style choice and must not be removed. `clip-path`
      clips box-shadow, and Tailwind's `ring-2` is a box-shadow drawn OUTSIDE
      the border box — so a clipped control with an outside ring has no visible
      focus state at all. Nothing errors, nothing looks wrong to anyone using a
      mouse, and it is total for anyone on a keyboard. The ring is drawn inside
      the clip instead, which also lands it exactly where this file already
      argued a ring belongs: touching the border rather than floating off it.
    */
    'chamfer-sm rounded-none text-sm font-medium transition-colors',
    // RB0 rule 3. `min-h` rather than `h` so a button that wraps grows instead
    // of clipping its own label.
    'min-h-[44px]',
    /*
      No ring offset. The ring sits directly on the border, which is what makes
      it read as a halo on a dark surface rather than as a gap.
    */
    'focus-visible:outline-none focusable:ring-2 focusable:ring-inset focusable:ring-ring',
    /*
      A stated surface and stated ink. `disabled:opacity-50` is deliberately
      gone — see the docblock, and `text-contrast-floor.test.ts` for why an
      alpha the scan cannot composite is the problem rather than the value.
    */
    'disabled:pointer-events-none disabled:cursor-not-allowed',
    'disabled:bg-[var(--surface-disabled)] disabled:text-[var(--text-disabled)]',
    'disabled:border-[color:var(--border-subtle)]',
  ].join(' '),
  {
    variants: {
      variant: {
        /*
          Rest is the off-white fill; hover is the sodium one — brief B8/B10.

          ⚠ Not `hoverable:bg-primary/90`, which is what this was. That
          composited the fill toward the page ground and was correct while the
          rest state was mid-cyan; against an off-white rest state the same
          expression produces a dirty grey rather than a state change. The ink
          does not move, because both fills are light: 15.60:1 at rest, 8.46:1
          on hover, measured against `--primary-foreground`.
        */
        default:
          'bg-primary text-primary-foreground hoverable:bg-[var(--attention)]',
        destructive:
          'bg-destructive text-destructive-foreground hoverable:bg-destructive/90',
        /*
          `bg-transparent`, never `bg-background`. Inherits whatever surface it
          sits on, so it can never render darker than its container — the
          defect this variant shipped with.
        */
        outline:
          'border border-[color:var(--border-field)] bg-transparent hoverable:border-[color:var(--border-field-hover)] hoverable:bg-white/4',
        secondary:
          'bg-secondary text-secondary-foreground hoverable:bg-secondary/80',
        ghost: 'hoverable:bg-white/5 hoverable:text-foreground',
        /*
          A link is text, not a target — the 44px floor is about hit areas, and
          applying it here would put 44px of dead space around an inline word.
          `min-h-0` opts out explicitly so the exception is visible rather than
          looking like an oversight.
        */
        link: 'min-h-0 rounded-none text-primary underline-offset-4 hoverable:underline',
      },
      size: {
        default: 'px-4 py-2',
        /*
          `sm` is a DENSITY step, not a licence to go under the floor: it keeps
          the same 44px target and takes its compactness from padding. A control
          that must render smaller than its hit area wants `.tap-target-44`,
          which grows the area without inflating the glyph.
        */
        sm: 'px-3 text-xs',
        lg: 'px-8',
        icon: 'w-11 px-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /**
   * The control started work and is waiting on it — the wait instrument's
   * brief, line B7 (11 Sep).
   *
   * ── What a busy button is, and is not ─────────────────────────────────────
   *
   * Every busy control in the app used to swap its label for a spinning
   * glyph and its own label — `{loading ? <><Loader2/>Saving</> : 'Save'}` —
   * which changed the button's width mid-press and left the state in the
   * button's ordinary voice. A busy button now drops to the outlined form at
   * its rest width, and says what it is doing in the system's state voice:
   * the wait mark and a mono, uppercase, cyan status beside it.
   *
   * ⚠ Not `disabled`. A control that becomes `disabled` mid-press loses
   * keyboard focus, and its `disabled:` styles would paint the grey fill over
   * the outline. `aria-busy` and `aria-disabled` say the same thing to
   * assistive tech, the click is swallowed here, and pointer events are off —
   * so a double press cannot fire twice and focus stays where it was. Callers
   * should pass `busy`, not `disabled={loading}`.
   *
   * The rest label is kept in the same grid cell, invisible, so the button
   * is exactly as wide as its widest state and nothing beside it shifts.
   */
  busy?: boolean;
  /** What it is doing, present tense. Defaults to the children. */
  busyLabel?: React.ReactNode;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, busy = false, busyLabel, children, onClick, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';

    if (busy && !asChild) {
      return (
        <Comp
          className={cn(buttonVariants({ variant: 'outline', size, className }), 'pointer-events-none')}
          ref={ref}
          aria-busy="true"
          aria-disabled="true"
          onClick={(event: React.MouseEvent<HTMLButtonElement>) => event.preventDefault()}
          {...props}
        >
          <span className="grid place-items-center">
            {/* The rest label, holding the width; not for anyone to read. */}
            <span aria-hidden="true" className="invisible col-start-1 row-start-1 inline-flex items-center">
              {children}
            </span>
            <span className="col-start-1 row-start-1 inline-flex items-center gap-2 mono text-xs uppercase tracking-[0.08em] text-[color:var(--info-strong)]">
              <WorkingMark className="h-3.5 w-3.5" />
              {busyLabel ?? children}
            </span>
          </span>
        </Comp>
      );
    }

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        onClick={onClick}
        disabled={disabled}
        {...props}
      >
        {children}
      </Comp>
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
