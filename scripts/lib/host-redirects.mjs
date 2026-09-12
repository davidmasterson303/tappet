/**
 * The retired hostnames' redirects: read from `netlify.toml`, verified on the
 * live hosts after a deploy.
 *
 * ── ⚠ Why a promote verifies a redirect at all ─────────────────────────────
 *
 * The 7 Sep rename added the Tappet hostnames as aliases and retired nothing.
 * On 12 Sep both projects' primary domains were flipped and *nothing
 * redirected* — Netlify only redirects apex↔`www`, never between subdomains —
 * so the redirect is the `[[redirects]]` rules in `netlify.toml`, and a rule
 * in a file is not a redirect on a host. The demo's old hostname is the link
 * recruiters hold; a 301 is sticky in browser caches; and the promote is the
 * moment the rule becomes live. So the promote reads what the file says
 * (`readHostRedirects`) and then, once the deploy is serving the merge
 * commit, asks each retired host what it actually does (`verifyHostRedirects`).
 *
 * Both halves are exported so `lib/__tests__/hostname-redirects.test.ts` can
 * pin the parser against fixtures and the verifier against a fake `fetch` —
 * there is no `curl` in a jest run and no second parser to drift.
 *
 * The parser is sized to the file: a `[[redirects]]` header, then
 * `key = value` lines until the next header. No TOML library is installed and
 * one is not worth adding for four keys.
 */

/**
 * Every `[[redirects]]` table whose `from` is a full URL — a host-level rule.
 * Path rules (`from = "/demo"`) are Next's business and are left out.
 */
export function readHostRedirects(toml) {
  const rules = [];
  let current = null;
  for (const raw of String(toml).split('\n')) {
    const line = raw.replace(/#.*$/, '').trim();
    if (line === '') continue;
    if (/^\[\[redirects\]\]$/.test(line)) {
      current = {};
      rules.push(current);
      continue;
    }
    if (/^\[/.test(line)) {
      current = null;
      continue;
    }
    const match = line.match(/^([A-Za-z_]+)\s*=\s*(.+)$/);
    if (current && match) current[match[1]] = match[2].replace(/^"(.*)"$/, '$1');
  }
  return rules
    .map((r) => ({
      from: r.from ?? '',
      to: r.to ?? '',
      status: r.status ? Number(r.status) : null,
      force: r.force === 'true',
    }))
    .filter((r) => /^https?:\/\//.test(r.from));
}

/** The hostname of a URL or of a `from`/`to` pattern. */
export function hostOf(url) {
  return String(url)
    .replace(/^https?:\/\//, '')
    .split('/')[0];
}

/** The retired hosts whose rule lands on `primary` (a URL or a hostname). */
export function retiredHostsFor(toml, primary) {
  const target = hostOf(primary);
  return readHostRedirects(toml)
    .filter((r) => hostOf(r.to) === target)
    .map((r) => hostOf(r.from));
}

/**
 * Ask the live hosts. Each retired host must answer `301` with a `Location`
 * on the primary; the primary itself must answer `200` with no `Location`,
 * which is the check against a loop. `redirect: 'manual'` because following
 * the redirect is exactly what would hide its absence — a `200` from the new
 * host after a silent hop looks like a `200` from the old one.
 *
 * Returns what was checked and what failed; the caller decides what a
 * failure costs. An empty `checked` is reported as such, never as success.
 */
export async function verifyHostRedirects({ toml, primary, fetchImpl = fetch }) {
  const target = hostOf(primary);
  const retired = retiredHostsFor(toml, primary);
  const checked = [];
  const failures = [];

  for (const host of retired) {
    try {
      const res = await fetchImpl(`https://${host}/`, { redirect: 'manual', cache: 'no-store' });
      const location = res.headers.get('location') ?? '';
      const landsOnPrimary = hostOf(location) === target;
      checked.push({ host, status: res.status, location });
      if (res.status !== 301) {
        failures.push(`${host} answered ${res.status}, not 301${location ? ` (Location: ${location})` : ''}`);
      } else if (!landsOnPrimary) {
        failures.push(`${host} redirects to ${location || '(no Location header)'}, not ${target}`);
      }
    } catch (e) {
      failures.push(`${host} could not be read (${e.message})`);
    }
  }

  if (retired.length > 0) {
    try {
      const res = await fetchImpl(`https://${target}/`, { redirect: 'manual', cache: 'no-store' });
      const location = res.headers.get('location') ?? '';
      checked.push({ host: target, status: res.status, location });
      if (res.status !== 200) {
        failures.push(
          `${target} answered ${res.status}${location ? ` (Location: ${location})` : ''} — the destination of every rule above is not serving`
        );
      }
    } catch (e) {
      failures.push(`${target} could not be read (${e.message})`);
    }
  }

  return { retired, checked, failures };
}
