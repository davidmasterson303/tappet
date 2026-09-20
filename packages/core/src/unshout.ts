/**
 * NHTSA's older campaigns arrive in capitals. This lowers them to sentences.
 *
 * ── The finding (QE 2.12, 20 Sep) ────────────────────────────────────────────
 *
 * On a 2003 Accord, 12 of 24 campaigns — every one filed before 2011 — carry
 * their summary, consequence and remedy as `K2 MOTOR IS RECALLING 1,921
 * AFTERMARKET HEADLAMPS…`, and the newer ones read as prose. The same
 * screen showed both, and the capitals are the harder half to read; a
 * screen reader can spell a capitalised word as initials.
 *
 * ── What it knows and what it cannot ─────────────────────────────────────────
 *
 * A capitalised source has thrown its proper nouns away, and nothing here
 * can get them all back. What survives, deliberately:
 *
 *   - a token with a digit is left as it is    (K2, 108, FMVSS-108, 1-909-…)
 *   - a short set of initialisms stays upper   (NHTSA, FMVSS, ABS, SRS, VIN…)
 *   - a short set of suffixes is title-cased   (Inc., Co., Corp., Ltd.)
 *   - names the caller knows are capitalised   (`keep`: the make, the model,
 *                                               the manufacturer's words)
 *   - the first word of each sentence is capitalised
 *
 * Everything else is lowered, so "TAKATA" mid-sentence becomes "takata"
 * unless the caller names it. That is the honest trade: a lowered proper
 * noun is legible and wrong in one letter; the capitals were illegible in
 * every letter. Text that is *not* shouting is returned untouched, so a
 * modern campaign's own casing is never rewritten — the test is a ratio of
 * upper-case letters, not the presence of one.
 *
 * ⚠ Display only. The raw string stays in the row, is what the advisor is
 * given, and is what a dealer's desk will recognise. `componentPlainName`
 * renames the headline; this reads the paragraphs beneath it.
 */

const INITIALISMS = new Set([
  'NHTSA', 'FMVSS', 'ABS', 'SRS', 'VIN', 'DOT', 'LED', 'HID', 'DRL', 'TPMS', 'ECU', 'ECM',
  'PCM', 'BCM', 'OEM', 'USA', 'U.S.', 'EPA', 'GM', 'BMW', 'VW', 'LLC', 'AWD', 'FWD', 'RWD',
  'CVT', 'MIL', 'OCS', 'ESC', 'EBD', 'ODS', 'HVAC', 'EV', 'PHEV', 'SUV', 'PSI', 'MPH',
]);

const SUFFIXES: Record<string, string> = {
  'INC': 'Inc', 'INC.': 'Inc.', 'CO': 'Co', 'CO.': 'Co.', 'CORP': 'Corp', 'CORP.': 'Corp.',
  'LTD': 'Ltd', 'LTD.': 'Ltd.', 'MFG': 'Mfg', 'MFG.': 'Mfg.',
};

/** Shouting is a paragraph, not a word: twenty letters and nine in ten upper. */
export function isShouting(value: string): boolean {
  const letters = value.replace(/[^A-Za-z]/g, '');
  if (letters.length < 20) return false;
  const upper = letters.replace(/[^A-Z]/g, '').length;
  return upper / letters.length >= 0.9;
}

export function unshout(value: string | null | undefined, keep: ReadonlyArray<string | null | undefined> = []): string | null {
  if (typeof value !== 'string') return null;
  if (!isShouting(value)) return value;

  const names = new Map<string, string>();
  for (const name of keep) {
    for (const word of (name ?? '').split(/\s+/)) {
      const bare = word.replace(/[^A-Za-z0-9']/g, '');
      if (bare.length > 1) names.set(bare.toUpperCase(), bare);
    }
  }

  let startOfSentence = true;
  return value
    .split(/(\s+)/)
    .map((token) => {
      if (/^\s+$/.test(token)) {
        if (token.includes('\n')) startOfSentence = true;
        return token;
      }
      if (token === '') return token;
      const out = caseToken(token, names, startOfSentence);
      startOfSentence = /[.!?]["')\]]?$/.test(token);
      return out;
    })
    .join('');
}

function caseToken(token: string, names: Map<string, string>, startOfSentence: boolean): string {
  // Split leading and trailing punctuation off so the word inside is what is matched.
  const match = /^([^A-Za-z0-9]*)([A-Za-z0-9][A-Za-z0-9.'/-]*?)([^A-Za-z0-9]*)$/.exec(token);
  if (!match) return token.toLowerCase();
  const [, lead, word, trail] = match;
  const upper = word.toUpperCase();

  let cased: string;
  if (/\d/.test(word)) cased = word;
  else if (INITIALISMS.has(upper) || INITIALISMS.has(upper + trail)) cased = upper;
  else if (SUFFIXES[upper]) cased = SUFFIXES[upper];
  else if (SUFFIXES[upper + trail]) return lead + SUFFIXES[upper + trail];
  else if (names.has(upper.replace(/[^A-Z0-9']/g, ''))) cased = names.get(upper.replace(/[^A-Z0-9']/g, ''))!;
  else if (upper === 'I') cased = 'I';
  else {
    const lower = word.toLowerCase();
    cased = startOfSentence ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
  }
  if (startOfSentence && cased.charAt(0) >= 'a' && cased.charAt(0) <= 'z') {
    cased = cased.charAt(0).toUpperCase() + cased.slice(1);
  }
  return lead + cased + trail;
}
