'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { useWishlistData } from '@/hooks/useWishlistData';

/**
 * The two hand-offs at the foot of the dashboard.
 *
 * ── ⚠ 8 Sep · what this replaced, and why ───────────────────────────────────
 *
 * Two collapsibles stood here: "Vehicle dossier" — itself a card holding a tab
 * strip over Issues, Maintenance and Modifications — and "Wishlist". Both shut
 * by default, at the foot of a page 3,600px tall.
 *
 * An IA review of the rendered dashboard found what that cost, and it was not a
 * usability nitpick. Of the product's eight capabilities the page displayed
 * one; four more appeared only as a count or a clause of prose; and the
 * maintenance schedule — the reason invoices are read at all — could not be
 * reached at all without knowing to open a drawer named after its container.
 * A subscriber pricing the product read it as *"a health score with an AI note
 * attached"*. A capability nobody can find is one that was not built.
 *
 * Those bodies now live on the tabs that own their question. What stays here is
 * the smallest honest thing: **a count and a door**.
 *
 * ── ⚠ Why a summary and not the list ────────────────────────────────────────
 *
 * The temptation after un-burying something is to put all of it on the landing
 * page, which is how the dashboard got long enough to bury things in the first
 * place. A row that states a real number and opens the page that owns it is
 * navigation. The same row rendering the list is a second copy of a screen that
 * already exists, and two copies of one list is the defect this move was
 * fixing — see the note in `DashboardNextSteps`'s sibling, `PlanPage`.
 *
 * ⚠ **Every number here is `null`-safe, and that is load-bearing.** While the
 * queries are in flight there is no count, and the row says so rather than
 * rendering `0`. `CLAUDE.md` §6: a missing figure is "we cannot say", never a
 * reading — and "0 items" beside "Needs" is a claim that this car needs
 * nothing.
 */

function Row({
  href,
  title,
  detail,
  cta,
}: {
  href: string;
  title: string;
  detail: string | undefined;
  cta: string;
}) {
  return (
    <Link
      href={href}
      className="tap-target-44 flex items-center justify-between gap-4 rounded-xl border border-white/8 bg-white/[0.03] px-5 py-4 transition-colors hover:border-white/16 hover:bg-white/[0.05]"
    >
      <span className="min-w-0">
        <span className="label-uppercase block text-white">{title}</span>
        {/*
          `detail` is undefined until the data lands. Rendering nothing is the
          honest state; a dash or a zero would both read as an answer.
        */}
        {detail ? <span className="mt-1 block text-sm text-white/55">{detail}</span> : null}
      </span>
      <span className="flex shrink-0 items-center gap-1.5 text-sm text-white/70">
        {cta}
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </span>
    </Link>
  );
}

function pluralise(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export default function DashboardNextSteps({
  vehicleId,
  knowledge,
}: {
  vehicleId: string;
  knowledge: any;
}) {
  const { data: wishlistItems } = useWishlistData(vehicleId);

  const schedule: unknown[] = knowledge?.maintenance_schedule ?? [];
  /*
    ⚠ `knowledge` can be absent entirely — research pending, failed, or a car
    NHTSA does not recognise. An absent row is not an empty schedule, so the
    detail line stays undefined rather than claiming "0 intervals".
  */
  const dueDetail = knowledge
    ? schedule.length > 0
      ? `${pluralise(schedule.length, 'tracked interval')} · what's due and what's been done`
      : 'No schedule yet · your service history'
    : undefined;

  const needsDetail = (() => {
    if (!wishlistItems) return undefined;
    if (wishlistItems.length === 0) return 'Nothing on the list yet';
    const total = wishlistItems.reduce(
      (sum: number, item: any) => sum + (Number(item.estimated_cost) || 0),
      0
    );
    const items = pluralise(wishlistItems.length, 'job');
    // Only claim a total when there is one — every item priced at zero must not
    // read as "~$0", which looks like a bug rather than an absence.
    return total > 0 ? `${items} · ~$${Math.round(total).toLocaleString()}` : items;
  })();

  return (
    <div className="space-y-3">
      <Row href={`/documents/${vehicleId}`} title="Service" detail={dueDetail} cta="Due & history" />
      <Row href={`/plan/${vehicleId}`} title="Plan" detail={needsDetail} cta="Needs & mods" />
    </div>
  );
}
