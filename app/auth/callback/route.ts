import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { logger } from '@tappet/core/logger';
import { readVisitorId } from '@/lib/funnel-visitor';
import { recordFunnelStepInBackground } from '@/lib/funnel';
import { claimScansForVisitor } from '@/lib/quote-check';
import { safeRedirect } from '@/lib/safe-redirect';

/*
 * Where a sign-in callback is allowed to send somebody: `lib/safe-redirect.ts`.
 *
 * ⚠ SEC-04 (24 Aug): this was an open redirect on the App Store hostname —
 * `new URL(redirectTo, requestUrl.origin)` uses its base only for relative
 * inputs, so `?redirect=https://evil.example` was followed with a fresh
 * session cookie set on the way out. The guard lived here, private, and the
 * password form at `/login` went on reading the same parameter raw until
 * audit 360 SEC-4 (1 Oct). One module now, imported by both.
 */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const redirectTo = safeRedirect(requestUrl.searchParams.get('redirect'));

  if (code) {
    const response = NextResponse.redirect(new URL(redirectTo, requestUrl.origin));

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, options);
            });
          },
        },
      }
    );

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    /*
      ── ⚠ SEC-04, second half · the redirect used to survive a failed exchange ─

      `response` is built **before** this line, because the Supabase client
      needs somewhere to write its cookies. That is fine; what was not fine is
      that it was then returned unconditionally — so a bad, expired or replayed
      code produced a 302 to the requested destination with no session, and the
      caller could not tell the difference between "signed in" and "not".

      A failed exchange goes to `/login` with the reason, which is the only
      honest answer and the one the sign-in page already knows how to render.
    */
    if (error) {
      logger.warn('AUTH:CALLBACK_EXCHANGE_FAILED', 'Could not exchange the code for a session', {
        message: error.message,
      });

      return NextResponse.redirect(new URL('/login?error=link_expired', requestUrl.origin));
    }

    /*
      Phase 2.97c. The email-verification path into an account, and the one the
      client-side claim cannot cover: the visitor may return here in a new tab,
      minutes or hours later, with the session established server-side and no
      signup component mounted to fire a request.

      Claimed here rather than redirected-then-claimed because the `cc_fv`
      cookie is httpOnly and this handler already holds it. Wrapped so a claim
      failure cannot break sign-in — arriving signed out because a scan could
      not be attached would be a far worse trade than an unclaimed scan.
    */
    if (data?.user && !error) {
      try {
        const visitorId = readVisitorId();
        if (visitorId) {
          const claimed = await claimScansForVisitor(visitorId, data.user.id);
          if (claimed > 0) {
            recordFunnelStepInBackground({ visitorId, step: 'saved' });
          }
        }
      } catch (err) {
        logger.warn('FRONT_DOOR:CLAIM_ON_CALLBACK_FAILED', 'Could not claim scans during verification', {
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return response;
  }

  return NextResponse.redirect(new URL('/login', requestUrl.origin));
}
