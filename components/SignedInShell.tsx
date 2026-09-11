'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BrandWordmark } from '@/components/brand/BrandLockup';
import { AccountMenu } from '@/components/AccountMenu';
import { useHomeHref } from '@/hooks/use-home-href';

/**
 * The room and the header every signed-in page stands in.
 *
 * ── Why one shell ───────────────────────────────────────────────────────────
 *
 * The 11 Sep critique of the three pages behind the middleware graded the
 * plate before anything else: "all three plates read pure black, no
 * vignette", and "the whole distance between A and B in the blind set is that
 * plate" — A being the signed-in garage and B the landing, on the same cards.
 * The garage sat on `bg-black` under a fixed `.vignette-frame`; onboarding on
 * `bg-black` alone; settings on `bg-background` with a nav of its own.
 *
 * The landing's plate is `.service-bay service-bay-dim` — the room drawn in
 * CSS at zero bytes, cyan ceiling wash turned down to a lit edge, a vignette
 * that deepens the corners. Every auth page already stands in it. This is that
 * plate and the landing's header, as one piece the three pages share, so they
 * cannot drift from each other or from the landing again.
 *
 * CC-142 §5 still holds: the plate is **drawn**, not photographed. A
 * photographic page background is what §5 removed from every app route, and
 * a CSS room is what it left.
 *
 * ── The header ──────────────────────────────────────────────────────────────
 *
 * Wordmark left, actions right, the account chip last. `actions` is a slot:
 * the garage and settings put "Add vehicle" in it, the add-a-vehicle page
 * puts nothing there, because a header inviting you to do the thing the page
 * is for is noise.
 *
 * ⚠ `nav` takes `--surface-nav` from a bare-element rule in `globals.css`
 * with `!important`, so the classes here describe the landing's intent and
 * the computed result is the same solid graphite either way.
 */
export function SignedInShell({ actions, children }: { actions?: ReactNode; children: ReactNode }) {
  const homeHref = useHomeHref();

  return (
    <div className="relative w-full min-h-screen">
      <div className="fixed inset-0 z-0 service-bay service-bay-dim" aria-hidden="true" />

      <div className="relative z-10">
        <nav className="relative border-b border-white/8 bg-black/80 backdrop-blur-xl">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 py-4">
            <div className="flex items-center justify-between">
              <Link href={homeHref} className="flex items-center group">
                {/* 21px mark — the small cut, switched inside the component. */}
                <BrandWordmark size={28} />
              </Link>
              <div className="flex items-center gap-3">
                {actions}
                <AccountMenu />
              </div>
            </div>
          </div>
        </nav>

        {children}
      </div>
    </div>
  );
}

/**
 * The header's "Add vehicle".
 *
 * ⚠ `from=garage` is load-bearing, not a tracking parameter. `/onboard`
 * redirects a user who already owns a vehicle back to the garage — task 1.6's
 * returning-user guard — and this marker is what tells it the visit is
 * deliberate. Without it, adding a second car would be impossible from the
 * one control that exists for it. `onboarding-guard.test.ts` reads this file
 * for the literal, so it stays spelled out here rather than composed.
 *
 * An outline, never a cyan one. This control carried `border-cyan-400
 * text-cyan-400` for a month: a cyan call to action on a system that reserves
 * cyan for information and focus. The primitive's outline variant is the
 * brief's "off-white hairline cut-corner" exactly.
 */
export function AddVehicleAction() {
  return (
    <Link href="/onboard?from=garage">
      <Button variant="outline" size="sm" className="font-semibold text-[color:var(--text-primary)]">
        <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
        Add vehicle
      </Button>
    </Link>
  );
}
