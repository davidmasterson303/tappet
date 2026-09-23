/** @type {import('next').NextConfig} */
const nextConfig = {
  /*
    `next build` and `next dev` share `.next` by default, and a build run while
    a dev server holds it leaves the app serving 404s for chunks that exist.
    This project has traced four separate "the app is dead" investigations to
    exactly that, and answered it with a standing rule not to do it.

    A rule is a poor guard for a mistake this easy to make -- especially with
    nine orphaned `next dev` processes on the machine as of 28 Jul, only one of
    which is listening. So the build can now be pointed somewhere else:

        NEXT_DIST_DIR=.next-verify npm run build

    Unset everywhere it matters, so CI and Netlify keep building into `.next`
    exactly as before. This only makes a safe local verification possible; it
    does not change any deployed behaviour.
  */
  distDir: process.env.NEXT_DIST_DIR || '.next',

  /*
    /demo and / had drifted into the same page: both rendered the same three
    is_demo cars behind the same garage door, and the door carried a "Take a
    Test Drive" button pointing at a near-copy of the page it sat on.

    / is the demo now, and /demo redirects to it. The redirect is not optional
    housekeeping — README.md advertises https://tappet-demo.davidmasterson.co
    and davidmasterson.co/ai-work.html links to the demo, so the path has to keep
    resolving. `packages/core/src/demo-contract.ts` still lists /demo among the
    routes an anonymous visitor must be able to reach, and scripts/verify-demo.mjs
    asserts it lands on / rather than on /login.

    Deliberately temporary: a 308 is cached hard by browsers and would make this
    awkward to reverse if /demo should ever become a distinct page again.
  */
  async redirects() {
    return [{ source: '/demo', destination: '/', permanent: false }];
  },
  /*
    ── 23 Sep · the headers `netlify.toml` promises were not on the pages ───

    Measured live on the product host: `/`, `/privacy` and `/api/version`
    carried only HSTS and `nosniff`. The `[[headers]] for = "/*"` block in
    `netlify.toml` is applied by Netlify to the assets it serves itself —
    `/_next/static/*` had the full set — and not to the responses the Next
    runtime function returns, which is every page and every API route.
    Next's own `headers()` is what reaches those.

    The framing, referrer and permissions headers are enforced: they cannot
    break a page. The Content-Security-Policy is **report-only** for now: no
    page had ever run under it, and a policy that is wrong in one directive
    turns a launch-week page blank with no error a user can report. Watch the
    console on the product host for violations, then move the same string to
    `Content-Security-Policy` in one commit. `netlify.toml` keeps its copy
    for the static assets.
  */
  async headers() {
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https://*.supabase.co",
      "media-src 'self' data: blob:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
      "worker-src 'self' blob:",
      "manifest-src 'self'",
    ].join('; ');
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
          },
          { key: 'Content-Security-Policy-Report-Only', value: csp },
        ],
      },
    ];
  },
  /*
    ⚠ **BLD-05 · `x-powered-by` is off.** Next sends `X-Powered-By: Next.js` by
    default, and it was measured live on both hostnames. It tells an attacker
    which framework and therefore which advisories to try, and it tells a user
    nothing. One line, no cost.
  */
  poweredByHeader: false,
  /*
    ⚠ `ignoreDuringBuilds` and no promote script runs `next lint`, so **`next
    lint` is dead in this pipeline** — noted by the 24 Aug audit (BLD-01). Kept
    for now rather than flipped in the same pass that added `build:verify` to
    both promotes: turning lint back on at build time would surface an unknown
    number of existing violations and could block a promote for reasons
    unrelated to the change being promoted, which is the opposite of what a gate
    is for.

    The honest sequence is to run `npm run lint` once, read what it says, fix or
    disable rules deliberately, and *then* remove this. Doing it the other way
    round is how a gate gets disabled again a week later.

    ⚠ There is deliberately no `typescript: { ignoreBuildErrors: true }` here,
    and there must not be. Type errors do fail the Netlify build, which is the
    one compile-time guarantee this pipeline has.
  */
  eslint: {
    ignoreDuringBuilds: true,
  },
  /*
    `unoptimized` stays, and that is now a decision rather than an oversight.

    The audit read this flag as the reason there are no modern formats and
    suggested dropping it so Netlify's Image CDN would take over. It would not
    have: the optimizer only ever sees what `next/image` renders, and this app
    renders no `next/image` at all. Its two photo surfaces are CSS backgrounds
    in VehicleIdentity — an over-scanned blurred fill under a contained sharp
    copy — which no image component can express. Dropping the flag would have
    changed nothing except to make the wildcard below live.

    AVIF and WebP arrive instead through `scripts/build-image-derivatives.mjs`
    and `image-set()`. 5.31 MB of JPEG to 1.46 MB of AVIF, committed, with the
    JPEG still there for browsers that want it. No per-request transform, no
    CDN dependency, and it works identically in `next dev`.

    The wildcard is the part that had to go regardless. `hostname: '**'` allows
    any HTTPS host, which is inert only for as long as `unoptimized` is true —
    the moment someone drops that flag, /_next/image becomes an open proxy that
    will fetch and re-serve arbitrary URLs on this domain's behalf. It was here
    for `lib/vehicle-images.ts`, which hotlinked Google image results and has
    been deleted; the only remote images left are Supabase signed URLs.

    Derived from the Supabase URL rather than hardcoded because the host
    differs per environment. If it cannot be parsed the list is empty, which
    fails closed — no remote image is optimizable — rather than falling back to
    the wildcard.
  */
  images: {
    unoptimized: true,
    remotePatterns: (() => {
      try {
        return [
          {
            protocol: 'https',
            hostname: new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname,
          },
        ];
      } catch {
        return [];
      }
    })(),
  },
  experimental: {
    serverActions: true,
    /*
      `jimp` (11 Sep, the generation plates' resizer) ships an ESM build whose
      re-exports of Node built-ins webpack 5 cannot rewrite — `next build`
      fails with "Cannot get final name for export 'existsSync'". It is only
      ever needed server-side, in `lib/plate-image.ts`, so it is left out of
      the server bundle and resolved from node_modules at runtime; output file
      tracing still carries it into the deploy. Found by the promote gate, on
      the first build after the package landed.
    */
    serverComponentsExternalPackages: ['jimp'],
  },
  /*
    Netlify sets COMMIT_REF, BRANCH and HEAD during the **build** and does not
    pass them to functions at runtime, so a route reading process.env at
    request time gets nothing. Proven rather than assumed: the CI site,
    deployed from git at main@fb5f7cb, still answered /api/version with
    {"commit":"unknown"}.

    This block inlines the values at build time, which is the only moment they
    exist. Without it the promote gate can never pass — it would refuse every
    deploy, correctly but uselessly.

    BUILD_TIME is evaluated when this config loads, i.e. once per build.
  */
  /*
    Defaulted to '' rather than left undefined, which is a lint fix and not a
    behaviour change. Next validates this block against `Record<string, string>`
    and printed two warnings on **every dev start and every build** off a
    machine without Netlify's variables:

      "env.COMMIT_REF" is missing, expected string
      "env.BRANCH" is missing, expected string

    Real noise with a real cost: a build log that always contains warnings is a
    build log nobody reads, which is how the next genuine warning gets missed.

    `/api/version` reads these with `|| 'unknown'` (route.ts:45 and :52), and an
    empty string is falsy, so it still answers "unknown" locally exactly as
    before.

    That citation is a file and a line rather than a test name on purpose: the
    first draft of this comment cited `version-endpoint.test.ts`, which **does
    not exist**. Two places in this repo already named a `ai-usage-purposes.test.ts`
    that was never written, and both were corrected on 3 Aug — adding a third
    phantom guard on the same day would have been careless in a way this project
    has a documented history with. There is no test on this; the fallback is
    verifiable by reading two lines, and that is what is claimed.
  */
  env: {
    COMMIT_REF: process.env.COMMIT_REF ?? '',
    BRANCH: process.env.BRANCH ?? '',
    BUILD_TIME: new Date().toISOString(),
    /*
      ⚠ Read at **build** time, from the file, for the same reason `COMMIT_REF`
      is inlined here: a route reading `package.json` at request time would need
      it in the function bundle, and Netlify does not put it there.

      `require` rather than an import — this file is CommonJS, and the version is
      wanted as a value now rather than as a module reference.
    */
    NEXT_PUBLIC_APP_VERSION: require('./package.json').version,
  },
};

module.exports = nextConfig;
