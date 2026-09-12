'use client';

import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';

import { cn } from '@tappet/core/utils';

const TooltipProvider = TooltipPrimitive.Provider;

const Tooltip = TooltipPrimitive.Root;

const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, collisionPadding = 8, ...props }, ref) => (
  /*
    ── ⚠ Portaled, so a dialog cannot clip it (11 Sep) ─────────────────────

    The content used to render inline, inside whatever the trigger sits in.
    Radix positions it `position: fixed`, which escapes `overflow: hidden` —
    unless an ancestor carries a `transform`, and `DialogContent` centres
    itself with `translate-x-[-50%]`. Inside a dialog that transform becomes
    the tooltip's containing block, the table wrapper's `overflow-hidden`
    clips it, and "Estimate details" on the quote's cost breakdown lost its
    left third at the dialog edge. David read it as a z-index bug; it is a
    containing-block one, and z-index cannot fix it.

    The portal renders the bubble at the body, where the dialog's transform
    does not reach. It appends after the dialog's own portal, so at the same
    `z-50` it paints on top. `collisionPadding` keeps it off the viewport
    edge as well, which is the other way a bubble gets cut.
  */
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      collisionPadding={collisionPadding}
      className={cn(
        'z-50 overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
        className
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
