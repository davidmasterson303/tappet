'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowRight, Camera } from 'lucide-react';
import { Working, WorkingMark } from '@/components/Working';
import { formatCurrency } from '@tappet/core/formatting-utils';

/**
 * The anonymous front door. Phase 2.97b, decision D9.
 *
 * One input, one answer, one call to action. No VIN, no wizard, no account —
 * onboarding is *"long considered flow, desk-shaped"* by the features doc's own
 * description, and this exists because nobody browses their way to caring.
 *
 * ── Advisory D2, scored 7.4: disclosure during the parse ────────────────────
 *
 * Parsing takes 5–30 seconds. `InvoiceProcessingLoader` narrates that for a
 * signed-in user who already cares; **an anonymous stranger will bounce on a
 * spinner**, and the panel rated this the single design decision most likely to
 * decide whether 2.97 converts.
 *
 * The honest constraint: this is one Gemini call, so there is no real token
 * stream to show — inventing fake line items resolving would be a lie about
 * work being done.
 *
 * ── ⚠ The timed stages are gone — 11 Sep ────────────────────────────────────
 *
 * The first answer to D2 was a four-stage list advancing on `setTimeout`s at
 * 2.2s, 4s and 6s, "calibrated to the real distribution", with the last stage
 * holding until the response landed. It never claimed to have *finished* the
 * request, which was the argument for it — but it claimed to have finished
 * "Reading the estimate" at 2.2 seconds and "Picking out the line items" at
 * 4, and the client cannot observe either. Those are the boundaries
 * `scan-progress.ts` refuses to draw for the signed-in scanner, and
 * `b1e2baa` removed the same shape from the quote panel on 30 Aug: a stage
 * ticked by a timer is a claim about work, made by a clock.
 *
 * D2's goal stands — a stranger must not be left on a spinner. What answers
 * it now is the wait instrument the whole product uses: visibly alive for as
 * long as the call runs, with one line that is true for the whole of it.
 *
 * ── B3 is enforced upstream, not here ───────────────────────────────────────
 *
 * The sentence is composed by `describeQuote` on the server so this component
 * cannot drift into writing its own copy. It renders what it is given.
 */

interface Answer {
  job: string;
  vehicle: string | null;
  quotedTotal: number | null;
  typical: { low: number; high: number };
  answer: string | null;
}

export default function CheckPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Object URLs are revoked on replace and unmount; without it, choosing a
  // different photo four times leaks four decoded images on a phone.
  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const submit = useCallback(async () => {
    if (!file && !text.trim()) return;
    setBusy(true);
    setError(null);
    setAnswer(null);

    const body = new FormData();
    if (file) body.append('file', file);
    if (text.trim()) body.append('text', text.trim());

    try {
      const res = await fetch('/api/v1/front-door/check', { method: 'POST', body });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.message || 'That could not be read. Try a clearer photo of the whole page.');
      } else {
        setAnswer(data as Answer);
      }
    } catch {
      setError('Something went wrong on our side. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  }, [file, text]);

  return (
    <main className="relative isolate min-h-screen flex flex-col items-center px-5 py-12 sm:py-20 bg-[#0b0a09]">
      {/*
        ── The room is photographed here, and drawn everywhere else ──────────

        Every other `.service-bay` surface keeps the CSS room: a cyan ceiling
        wash, a floor catch and a vignette, at zero bytes. A design critique
        cut it on this page specifically — "a centered card floating on a
        radial teal-green vignette", with the gradient doing an image's job —
        and it was right about this surface in a way it is not about the auth
        screens, because this is the one page a stranger arrives on from an ad.

        ⚠ `image-weight-budget.test.ts` is the guard that exists to stop
        exactly this, and it lists five pages that must ship no photograph.
        `/check` is not one of them, so this is permitted rather than smuggled
        — and the guard now carries a byte cap for this plate so the exemption
        is bounded rather than open. `app/page.tsx` IS on that list, which is
        why the landing keeps the drawn room and gets no plate.

        An `<img>` rather than a CSS `background-image`: the preload scanner
        can see it, which is the defect `.garage-door` was rebuilt to avoid.
      */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/design/check-plate-1920.webp"
        srcSet="/design/check-plate-1200.webp 1200w, /design/check-plate-1920.webp 1920w"
        sizes="100vw"
        width={2752}
        height={1536}
        loading="eager"
        decoding="async"
        alt=""
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 h-full w-full object-cover"
      />
      <div className="relative w-full max-w-xl">
        <header className="text-center mb-10">
          <h1 className="display-instrument display-instrument-tight text-5xl sm:text-6xl uppercase leading-[0.95] text-[color:var(--text-primary)]">
            Is this repair quote fair?
          </h1>
          <p className="mt-3 text-[color:var(--text-muted)] text-base leading-relaxed">
            Photograph the estimate. We&apos;ll tell you what that job typically costs.
            No account, no sign-up.
          </p>
        </header>

        {!answer && (
          <div className="cut-panel border border-[color:var(--border)] bg-[hsl(var(--card))]/95 p-5 sm:p-6">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="chamfer-sm w-full border border-[color:var(--border-field)] hover:border-[color:var(--border-field-hover)] hover:bg-white/4 transition-colors p-6 flex flex-col items-center gap-3 disabled:cursor-not-allowed min-h-[132px] justify-center"
            >
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview}
                  alt="The estimate you selected"
                  className="chamfer-sm max-h-44 object-contain"
                />
              ) : (
                <>
                  <Camera className="h-7 w-7 text-[color:var(--info-strong)]" aria-hidden />
                  <span className="text-[color:var(--text-primary)] font-medium">Take or choose a photo</span>
                  <span className="text-[color:var(--text-muted)] text-sm">of the written estimate</span>
                </>
              )}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              // `capture` is deliberately absent. It forces the camera and
              // removes the library, and most people already have a photo of
              // the estimate by the time they are asking this question.
              className="sr-only"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />

            <div className="flex items-center gap-3 my-4" aria-hidden>
              <div className="h-px flex-1 bg-white/10" />
              <span className="mono text-[color:var(--text-muted)] text-xs uppercase tracking-wider">or paste it</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>

            <label htmlFor="quote-text" className="sr-only">
              Paste the text of your estimate
            </label>
            <textarea
              id="quote-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={busy}
              rows={3}
              placeholder="Front brake pads and rotors — $1,180 …"
              className="field field-textarea resize-y"
            />

            <Button
              onClick={submit}
              disabled={busy || (!file && !text.trim())}
              className="w-full mt-4 text-base font-semibold"
            >
              {busy ? (
                <>
                  <WorkingMark className="mr-2 h-4 w-4" />
                  Checking…
                </>
              ) : (
                'Check this quote'
              )}
            </Button>

            {busy && <ParseProgress />}

            {error && (
              <p role="alert" className="mt-4 text-[15px] text-[color:var(--attention)] leading-relaxed">
                {error}
              </p>
            )}
          </div>
        )}

        {answer && <AnswerCard answer={answer} onReset={() => { setAnswer(null); setFile(null); setText(''); }} />}

        <p className="mt-8 text-center text-[color:var(--text-muted)] text-xs leading-relaxed">
          Typical prices are estimates for an independent shop in the US, not a quote.
          Your own shop&apos;s price can differ for good reasons.
        </p>
      </div>
    </main>
  );
}

/**
 * Advisory D2, answered without a clock. One call, one true sentence for the
 * whole of it, and the instrument to show the call is alive. What the answer
 * contains is knowable and is named; how far along the call is, is not.
 */
function ParseProgress() {
  return (
    <div className="mt-6">
      <Working
        panel={false}
        line="Reading the estimate"
        detail="One pass over the whole estimate, compared against typical prices for the job."
      />
    </div>
  );
}

function AnswerCard({ answer, onReset }: { answer: Answer; onReset: () => void }) {
  const { typical, quotedTotal, job, vehicle } = answer;

  return (
    <div className="cut-panel border border-[color:var(--border)] bg-[hsl(var(--card))]/95 p-6 sm:p-7">
      <p className="text-[color:var(--text-muted)] text-sm">
        {job}
        {vehicle ? ` · ${vehicle}` : ''}
      </p>

      <p className="mono mt-4 text-[color:var(--text-muted)] text-xs uppercase tracking-widest">Typically</p>
      <p className="display-instrument text-4xl sm:text-5xl text-[color:var(--text-primary)] tabular-nums">
        {formatCurrency(Math.round(typical.low))} – {formatCurrency(Math.round(typical.high))}
      </p>

      {quotedTotal !== null && (
        <p className="mono mt-4 text-[color:var(--text-primary)] text-base tabular-nums">
          Your quote: <span className="font-semibold text-[color:var(--text-primary)]">{formatCurrency(Math.round(quotedTotal))}</span>
        </p>
      )}

      {/*
        The composed sentence from `describeQuote`. Rendered as given — B3 is
        enforced on the server so this component cannot drift into writing its
        own judgement.
      */}
      {answer.answer && (
        <p className="mt-4 text-[color:var(--text-muted)] text-[15px] leading-relaxed">{answer.answer}</p>
      )}

      <div className="mt-7 pt-6 border-t border-white/10">
        <p className="text-[color:var(--text-primary)] font-medium">Want it to remember your car?</p>
        <p className="mt-1 text-[color:var(--text-muted)] text-sm leading-relaxed">
          Keep this estimate, track what you&apos;ve had done, and get answers that know your
          vehicle&apos;s history.
        </p>
        <Link href="/signup" className="block mt-4">
          <Button className="w-full font-semibold">
            Create a free account
            <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
          </Button>
        </Link>
        <button
          onClick={onReset}
          className="w-full mt-3 text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] text-sm transition-colors py-2"
        >
          Check another quote
        </button>
      </div>
    </div>
  );
}
