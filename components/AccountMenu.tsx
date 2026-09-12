'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { User, Settings, LogOut } from 'lucide-react';
import { WorkingMark } from '@/components/Working';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { createBrowserSupabaseClient } from '@/lib/supabase';
import { queryClient } from '@tappet/core/query-client';
import { signOutAndClearCache } from '@/lib/sign-out';
import { toast } from 'sonner';

/**
 * Account menu — the only route to settings, and to signing out.
 *
 * Neither existed before. Settings matters beyond convenience: App Store
 * Guideline 5.1.1(v) requires account deletion to be genuinely discoverable,
 * and Apple's wording points at account settings specifically. A settings
 * page nothing links to would not have satisfied it.
 *
 * Sign-out clears the TanStack Query cache as well as the Supabase session —
 * see `lib/sign-out.ts` for why that is a privacy boundary and not tidiness.
 * Both sign-out paths go through that one helper so neither can drift.
 */
export function AccountMenu() {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);

    // Order matters: drop cached data before navigating, so nothing renders
    // another account's vehicles in the gap.
    await signOutAndClearCache(createBrowserSupabaseClient(), queryClient);

    toast.success('Signed out');
    router.push('/login');
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/*
          A square chip with the cut, not a circle — signed-in brief B4, and the
          critique's first AI tell: "circular avatar chip with the generic
          person glyph — component-library default".

          ⚠ The clip is on the inner span, deliberately. `clip-path` clips
          hit-testing as well as paint, so a clipped button loses the 44px
          hit area that `.tap-target-44` draws through a pseudo-element outside
          its box — a 36px chip would become a 36px target on a phone. The
          button stays unclipped and carries the target and the focus ring;
          the span inside it is the visible chip.
        */}
        <button
          type="button"
          aria-label="Account menu"
          className="tap-target-44 group/account flex h-9 w-9 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <span
            aria-hidden="true"
            className="chamfer-sm flex h-9 w-9 items-center justify-center border border-[color:var(--border-field)] bg-transparent transition-colors group-hover/account:border-[color:var(--border-field-hover)]"
          >
            <User className="h-4 w-4" />
          </span>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-52 border-border bg-card">
        <DropdownMenuItem asChild>
          <Link href="/settings" className="cursor-pointer">
            <Settings className="mr-2 h-4 w-4 text-info" aria-hidden="true" />
            Settings
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator className="bg-border" />

        <DropdownMenuItem
          onClick={handleSignOut}
          disabled={signingOut}
          className="cursor-pointer"
        >
          {signingOut ? (
            <WorkingMark className="mr-2 h-4 w-4" />
          ) : (
            <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
          )}
          {signingOut ? 'Signing out…' : 'Sign out'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
