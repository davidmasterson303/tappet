import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@tappet/core/utils';

/*
 * ⚠ `rounded-full` -> `chamfer-sm rounded-none` on 4 Sep, brief B4.
 *
 * The chip is one of the three shapes B4 names, and it is the one where the
 * change is most visible: a pill and a cut rectangle are read as different
 * kinds of object, not as the same object with a different corner.
 *
 * This is a deliberate narrowing of the sport register's own argument, which
 * declined to collapse `--radius-full` because "a 3px radius reads as a
 * rendering fault rather than a decision" on 94 pill and avatar sites. That
 * reasoning is about a *radius*, and it still holds — `--radius-full` is
 * untouched and avatars and status dots are still round. A chamfer is a shape
 * somebody chose, which is the opposite of the failure it describes.
 *
 * ⚠ The ring goes inset, and `ring-offset-2` goes entirely. `clip-path` clips
 * box-shadow, so an outside ring on a clipped chip is invisible — see the
 * longer note in `button.tsx`. The offset was already wrong here for the
 * reason that file's header gives about hairline cracks on dark surfaces; it
 * survived only because nothing focuses a badge often enough to notice.
 */
const badgeVariants = cva(
  'inline-flex items-center chamfer-sm rounded-none border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-ring',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-primary text-primary-foreground hover:bg-primary/80',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive:
          'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80',
        outline: 'text-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
