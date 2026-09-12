/**
 * The retired hostnames redirect, to the right place, without a loop — and
 * nothing that talks to a host still names one that redirects.
 *
 * @jest-environment node
 *
 * ── Why a test for a config file ────────────────────────────────────────────
 *
 * `netlify.toml` is the file with a history here (the ignore rule, 7 Sep) and
 * a redirect is the kind of change that reads as right and is verified only
 * after the deploy. Two things can be decided from source, and this pins them:
 * that the rules say what the rename means — every retired demo host goes to
 * the demo primary, 301, forced, and no rule's target is itself a source —
 * and that the things this repo points at a host (the canary workflow, the
 * README's demo link) point at a host that answers 200 rather than one that
 * now answers with a `Location:`. A canary that POSTs to a 301 is downgraded
 * to a GET and fails loudly; a README link that 301s works and looks stale.
 *
 * ⚠ What this cannot prove is the deploy. `curl -sI` on each old host after
 * the promote is the check, and the roadmap says to run it.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');

const DEMO_PRIMARY = 'tappet-demo.davidmasterson.co';
const PRODUCT_PRIMARY = 'tappet.southmoordigital.com';

/** Retired on 12 Sep, and the primary each must land on. */
const RETIRED: Record<string, string> = {
  'crewchief-demo.davidmasterson.co': DEMO_PRIMARY,
  'wellkept-demo.davidmasterson.co': DEMO_PRIMARY,
};

/**
 * The product pair is not retired yet — its host takes the app's API writes
 * and a 301 turns a POST into a GET — but if a rule for either ever appears,
 * it may only point here.
 */
const PRODUCT_RETIRABLE: Record<string, string> = {
  'crewchief.davidmasterson.co': PRODUCT_PRIMARY,
  'wellkept.southmoordigital.com': PRODUCT_PRIMARY,
};

interface Rule {
  from: string;
  to: string;
  status: number | null;
  force: boolean;
}

/**
 * The `[[redirects]]` tables, read with a parser sized to the file: a table
 * header, then `key = value` lines until the next header. No TOML library is
 * installed and one is not worth adding for four keys.
 */
function readRedirects(source: string): Rule[] {
  const rules: Rule[] = [];
  let current: Record<string, string> | null = null;
  for (const raw of source.split('\n')) {
    const line = raw.replace(/#.*$/, '').trim();
    if (line === '') continue;
    if (/^\[\[redirects\]\]$/.test(line)) {
      current = {};
      rules.push(current as unknown as Rule);
      continue;
    }
    if (/^\[/.test(line)) {
      current = null;
      continue;
    }
    const match = line.match(/^([A-Za-z_]+)\s*=\s*(.+)$/);
    if (current && match) current[match[1]] = match[2].replace(/^"(.*)"$/, '$1');
  }
  return rules.map((r) => {
    const raw = r as unknown as Record<string, string>;
    return {
      from: raw.from ?? '',
      to: raw.to ?? '',
      status: raw.status ? Number(raw.status) : null,
      force: raw.force === 'true',
    };
  });
}

function host(url: string): string {
  return url.replace(/^https?:\/\//, '').split('/')[0];
}

const toml = readFileSync(join(ROOT, 'netlify.toml'), 'utf8');
const rules = readRedirects(toml);
const hostRules = rules.filter((r) => /^https?:\/\//.test(r.from));

describe('the retired hostnames redirect', () => {
  it('found host-level rules at all', () => {
    expect(hostRules.length).toBeGreaterThanOrEqual(Object.keys(RETIRED).length);
  });

  it('the parser reads a rule the way Netlify does, and sees a missing force', () => {
    const fixture = [
      '[[redirects]]',
      '  from = "https://old.example/*"   # trailing comment',
      '  to = "https://new.example/:splat"',
      '  status = 301',
      '',
      '[[redirects]]',
      '  from = "/demo"',
      '  to = "/"',
      '  status = 301',
      '  force = true',
      '[[headers]]',
      '  for = "/*"',
    ].join('\n');
    expect(readRedirects(fixture)).toEqual([
      { from: 'https://old.example/*', to: 'https://new.example/:splat', status: 301, force: false },
      { from: '/demo', to: '/', status: 301, force: true },
    ]);
  });

  it('sends every retired demo host to the demo primary, permanently and forced', () => {
    for (const [retired, primary] of Object.entries(RETIRED)) {
      const rule = hostRules.find((r) => host(r.from) === retired);
      expect(rule).toBeDefined();
      expect(rule!.from).toBe(`https://${retired}/*`);
      expect(rule!.to).toBe(`https://${primary}/:splat`);
      expect(rule!.status).toBe(301);
      // Without `force`, a host-level rule never fires: there is always a
      // file at the path.
      expect(rule!.force).toBe(true);
    }
  });

  it('never points a product host anywhere but the App Store hostname', () => {
    for (const rule of hostRules) {
      const from = host(rule.from);
      if (from in PRODUCT_RETIRABLE) expect(host(rule.to)).toBe(PRODUCT_RETIRABLE[from]);
      // And no rule may retire a primary.
      expect([DEMO_PRIMARY, PRODUCT_PRIMARY]).not.toContain(from);
    }
  });

  it('cannot loop: no rule lands on a host another rule leaves', () => {
    const sources = new Set(hostRules.map((r) => host(r.from)));
    for (const rule of hostRules) expect(sources.has(host(rule.to))).toBe(false);
  });

  it('the things that call a host call one that still answers 200', () => {
    /*
      The canary passes its hostname explicitly (CLAUDE.md §8: "move the line
      in the same change that retires the host"), and the README is what the
      portfolio and recruiters follow. Neither may name a host with a rule.
    */
    const retiredHosts = hostRules.map((r) => host(r.from));
    const canary = readFileSync(join(ROOT, '.github', 'workflows', 'consultant-canary.yml'), 'utf8');
    const canaryCall = canary.match(/node scripts\/consultant-canary\.mjs\s+(\S+)/);
    expect(canaryCall).not.toBeNull();
    expect(retiredHosts).not.toContain(host(canaryCall![1]));

    const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
    const demoLink = readme.match(/\*\*Live demo:\*\*\s+(\S+)/);
    expect(demoLink).not.toBeNull();
    expect(retiredHosts).not.toContain(host(demoLink![1]));
    expect(host(demoLink![1])).toBe(DEMO_PRIMARY);
  });
});
