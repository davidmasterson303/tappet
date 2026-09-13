import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  uploadInvoice,
  describeUploadError,
  diagnoseUploadError,
  type ExtractedVehicle,
  type InvoiceFile,
} from '../api/documents';
import Button from '../components/Button';
import Viewfinder from '../components/Viewfinder';
import Working from '../components/Working';
import { scanLine, scanStages, type ScanPhase } from '../components/working-stages';
import { ApiRequestError } from '../api/client';
import { requestUpgrade } from '../purchases/upgrade-prompt';
import { PAGE_BODY, space, text, type } from '../theme';
import AiConsentSheet from '../components/AiConsentSheet';
import { INVOICE_AI_CONSENT } from '@tappet/core/ai-consent-copy';
import { readAiConsent, recordAiConsent, type AiConsent } from '../onboarding/ai-consent';
import { interFace } from '../theme/fonts';

/**
 * Phase 3.3 — photograph an invoice and have its line items read.
 *
 * ── Why the library image is injected rather than imported ──────────────────
 *
 * This file never imports `expo-image-picker`. The library image arrives
 * through a `pickImage` prop, exactly as `GarageScreen` takes `onOpenVehicle`
 * rather than importing react-navigation.
 *
 * That began as a scheduling constraint and is now a design one. The dev client
 * was built before the picker was a dependency, so importing it anywhere in the
 * module graph would have crashed the app on launch — the screen was therefore
 * written, routed and rendered *before* build `29b4d76f` existed, and wiring the
 * real picker afterwards touched one file. The reason to keep the seam is what
 * it bought: this screen is an ordinary component that can be rendered with a
 * stub, which is the only reason it was ever looked at before the camera
 * existed.
 *
 * ── ⚠ 12 Sep · the camera is the screen now — brief B9 ─────────────────────
 *
 * The idle frame *is* the viewfinder (`components/Viewfinder.tsx`): the live
 * feed under the header, hairline brackets, a mono readout, a capture control,
 * and CHOOSE FROM LIBRARY beside it. The camera path no longer goes through
 * `pickImage` — the viewfinder captures with `expo-camera` and hands `send`
 * the same `InvoiceFile` the picker would have, at the same quality
 * (`media/invoice-image.ts`) — so the prop's source is the library alone. The
 * seam stays for that path, and for the reason above: the screen still mounts
 * with a stub. What changed is that `Viewfinder` imports its native modules
 * directly; its docblock says why that is safe on every runtime this app has
 * left, and which one it is not.
 *
 * ── The outcomes, and why two of them are not errors ────────────────────────
 *
 * `uploadInvoice` returns a discriminated result rather than throwing for the
 * two answers the server actually reached:
 *
 *   - **vehicle-mismatch** — the invoice reads as a different car. The owner is
 *     the one who knows, so this offers to send it again with the heuristic
 *     overridden. It is a question, not a failure, and it is phrased as one.
 *   - **not-an-invoice** — the photograph is not an automotive invoice.
 *
 * Both arrive as HTTP 200. A screen written against exceptions alone would show
 * "uploaded" for both, which is the defect `documents.ts` is shaped to prevent
 * and the reason that shape is worth the extra type.
 *
 * ── What is kept when something goes wrong ──────────────────────────────────
 *
 * The chosen file. Every failure path leaves `file` set, so "Try again" resends
 * what was already picked rather than reopening the camera — the same rule as
 * the advisor's composer, where losing what someone produced is worse than any
 * error message. Re-photographing a bill you are standing next to is a small
 * cost; re-photographing one you have already thrown away is not.
 */

/*
  ── 12 Sep · the wait carries its phase, not a sentence ─────────────────────

  `working` held a `note` — "Opening the camera…", "Reading the invoice…",
  "Filing it against this car…" — three boundaries this screen genuinely
  observes, written as three loose strings. They are a `ScanPhase` now, so the
  wait instrument can draw them as a ledger (`working-stages.ts` says which
  phases exist and why the third is only sometimes drawn) and the line and the
  ledger come from one mapping rather than two spellings.

  ⚠ `'camera'` never reaches the wait at `picking` any more: the viewfinder
  is the picking, on its own frame with its own readout (CAPTURING), and the
  wait begins once the file exists. The source still travels so the ledger's
  first row is named for what happened — "Photographing the invoice", done.
*/
type ScanSource = 'camera' | 'library';

type State =
  | { status: 'idle' }
  | { status: 'working'; phase: ScanPhase; source: ScanSource }
  | { status: 'done'; itemsExtracted: number }
  | {
      status: 'mismatch';
      message: string;
      extracted: ExtractedVehicle | null;
      expected: ExtractedVehicle | null;
    }
  | { status: 'not-invoice'; message: string }
  /*
    `retryable` is the fix for the 5 Aug dead end. A client-side rejection —
    wrong type, too large — fails identically no matter how many times the same
    file is resent, so offering "Try again" there stranded the user on an error
    screen with no way back to the picker. Only a failure that *might* pass on a
    second attempt gets a retry.
  */
  | {
      status: 'error';
      /**
       * The title says which act failed. Absent, it is the upload's — "That
       * did not upload" — which is wrong for the one failure that happens
       * before there is anything to upload: the viewfinder's shutter.
       */
      heading?: string;
      message: string;
      retryable: boolean;
      signInMayHelp?: boolean;
      /** `__DEV__` only — kind, origin, status, elapsed ms, and the raw cause. */
      diagnostic?: string;
    };

function describeVehicle(vehicle: ExtractedVehicle | null): string {
  if (!vehicle) return 'an unrecognised vehicle';
  const parts = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : 'an unrecognised vehicle';
}

export function InvoiceScanScreen({
  vehicleId,
  pickImage,
  onSignOut,
  onFiled,
}: {
  vehicleId: string;
  /**
   * Resolves to the chosen image, or `null` if the picker was dismissed.
   *
   * Injected so this file stays free of native imports — see the header.
   * `src/media/pick-image.ts` is the real implementation and the only
   * module that imports `expo-image-picker`.
   *
   * ⚠ `'library'` only, since 12 Sep. The camera is the viewfinder's, and
   * narrowing the type here is what stops a future "Take a photo" reaching
   * for the system sheet again by habit.
   */
  pickImage: (source: 'library') => Promise<InvoiceFile | null>;
  onSignOut: () => void;
  /** Lets the caller refresh the vehicle once line items have changed. */
  onFiled?: () => void;
}) {
  const [state, setState] = useState<State>({ status: 'idle' });

  /**
   * Whether this person has agreed their invoice may go to Google — LEG-02.
   *
   * ⚠ **Guideline 5.1.2(i), amended November 2025**, requires explicit
   * permission before personal data reaches a third-party AI. This screen
   * photographs a document carrying a shop's name and business address —
   * sometimes a VIN — sends it to Gemini, and said nothing about Google at all.
   *
   * `unknown` until the read resolves, so the sheet does not flash for somebody
   * who already answered.
   *
   * ── ⚠ 12 Sep · asked at the door, because the viewfinder is the picker ─────
   *
   * The sheet used to open when TAKE A PHOTO was pressed, holding the source
   * so that agreeing continued into the camera. There is no such press now:
   * the screen *opens* on the camera. So the question is asked as the screen
   * opens — the viewfinder is held (`live={false}`, nothing filmed, no
   * permission alert stacked under the sheet) until it is answered, and
   * agreeing arms it, which is the thing the person came to do. The ordering
   * the old comment argued for is kept exactly: consent before the camera
   * points at anything, never after the photograph exists.
   */
  /*
    ⚠ `null` is **"still reading"**, which is not the same as `'unknown'`
    ("asked nobody yet"). `readAiConsent` is async, so for the first frames the
    screen does not know the answer — and treating that as "not answered" fired
    the sheet at somebody who had already agreed, and on the advisor's
    deep-link path consumed the one-shot ref before consent had resolved,
    leaving the question unasked forever.
  */
  const [consent, setConsent] = useState<AiConsent | null>(null);
  /*
    "Change that" from the declined state re-opens the sheet without
    forgetting the answer it is revisiting — declining twice must still read
    as declined, not as unknown.
  */
  const [reasking, setReasking] = useState(false);

  useEffect(() => {
    let live = true;
    void readAiConsent().then((answer) => {
      if (live) setConsent(answer);
    });

    return () => {
      live = false;
    };
  }, []);
  const [file, setFile] = useState<InvoiceFile | null>(null);
  /*
    Where the file came from, for the ledger's first row. A ref rather than
    state: it is read inside `send`, which "Try again" and "Yes, file it here"
    both call without a source in scope, and it never needs to redraw anything
    on its own.
  */
  const source = useRef<ScanSource>('library');

  const send = useCallback(
    async (chosen: InvoiceFile, confirmVehicle: boolean) => {
      /*
        Two different waits, and the second is the long one — the model is
        reading the document. `filing` is the confirm path only: the file is
        being sent again with the vehicle check overridden, after the question
        the first send came back with. See `scanStages`.
      */
      setState({
        status: 'working',
        phase: confirmVehicle ? 'filing' : 'reading',
        source: source.current,
      });

      try {
        const result = await uploadInvoice({ vehicleId, file: chosen, confirmVehicle });

        if (result.status === 'vehicle-mismatch') {
          setState({
            status: 'mismatch',
            message: result.message,
            extracted: result.extracted,
            expected: result.expected,
          });
          return;
        }

        if (result.status === 'not-an-invoice') {
          setState({ status: 'not-invoice', message: result.message });
          return;
        }

        setState({ status: 'done', itemsExtracted: result.itemsExtracted });
        onFiled?.();
      } catch (caught) {
        if (caught instanceof ApiRequestError && caught.needsSubscription) {
          /*
            ── E6's wire · a refusal is not a failure ─────────────────────────

            The gate said invoice scanning is part of the subscription
            (`lib/feature-gate.ts`, forwarded by `/upload-document` as 402
            with `code: 'needs-subscription'`). The server's sentence is the
            message — it names the feature and what stays free — under a
            heading that is not "That did not upload", because it did not
            fail; and it is not retryable, because trying again cannot help
            when the answer is a purchase. The paywall opens over it, the same
            way the advisor's refusal does.

            ⚠ Off today. `PAID_FEATURES_ENFORCED` is what makes this branch
            reachable, and it stays off until a sandbox purchase has been
            through Restore.
          */
          setState({
            status: 'error',
            heading: 'Part of Tappet Plus',
            message: caught.message,
            retryable: false,
          });
          requestUpgrade('invoice-scanning');
          return;
        }

        const message = describeUploadError(caught);
        /*
          Reached only from `uploadInvoice`'s network and server paths — a
          timeout, a 500, a rate limit — all of which can succeed on a second
          attempt with the same file.
        */
        setState({
          status: 'error',
          message,
          retryable: true,
          // Instructing someone to sign in without giving them a way to is the
          // defect this pairs with — see the button below.
          signInMayHelp: caught instanceof ApiRequestError && caught.status === 401,
          // Unconditional. Gating this on the error *type* is what left the
          // one unanticipated branch with nothing to report.
          diagnostic: diagnoseUploadError(caught),
        });

        /*
          **No longer signs the user out on any 401.** It used to, and that was
          wrong twice over: a *server* 401 may be a token the server would
          accept a second later, so clearing the session destroys a working one
          over a single response — and when `signOut()` itself then failed, the
          app sat on an error saying "sign in again" while every other screen
          stayed happily authenticated. That is exactly what a real tester hit
          on 5 Aug, three times out of three.

          Only a device-side 401 — this client knowing it holds no session — is
          acted on automatically, because there is nothing to preserve. Anything
          else offers the button below and lets the person decide.
        */
        if (caught instanceof ApiRequestError && caught.isLocallySignedOut) onSignOut();
      }
    },
    [vehicleId, onSignOut, onFiled]
  );

  /**
   * Open the library and run the upload. **No consent check** — see `choose`.
   *
   * ⚠ Split out on purpose, and still so: `choose` closes over `consent`, and
   * the work must not re-read the gate that just admitted it.
   */
  const openPicker = useCallback(async () => {
    source.current = 'library';
    setState({ status: 'working', phase: 'picking', source: 'library' });

    try {
      const chosen = await pickImage('library');
      if (!chosen) {
        // Dismissing the picker is not a failure and must not read as one.
        setState({ status: 'idle' });
        return;
      }
      setFile(chosen);
      await send(chosen, false);
    } catch (caught) {
      /*
        A refused permission or a rejected file type. Resending changes
        nothing, so this offers a different file rather than a doomed retry.
      */
      setState({
        status: 'error',
        message: describeUploadError(caught),
        retryable: false,
        diagnostic: diagnoseUploadError(caught),
      });
    }
  }, [pickImage, send]);

  /**
   * The consent gate in front of the library — LEG-02.
   *
   * The sheet is at the door (see `consent`), so by the time this control can
   * be pressed the answer is `granted` or `declined` — and declined stands the
   * control down. The guard is kept for the state it cannot see from here:
   * anything but a yes re-opens the sheet rather than opening the library.
   */
  const choose = useCallback(async () => {
    if (consent !== 'granted') {
      setReasking(true);
      return;
    }

    await openPicker();
  }, [consent, openPicker]);

  /**
   * The viewfinder's capture, as the upload wants it.
   *
   * The haptic has already fired and the file is on disk; what remains is the
   * same `send` the library path calls, with the ledger's first row named for
   * the camera (`scanStages`).
   */
  const captured = useCallback(
    async (chosen: InvoiceFile) => {
      source.current = 'camera';
      setFile(chosen);
      await send(chosen, false);
    },
    [send]
  );

  /*
    `takePictureAsync` rejected. Nothing was uploaded, so neither the upload's
    title nor its generic sentence is true here; the screen's error state
    carries the photograph's own words, and both ways forward — the frame
    again, or the library — are on it. Not retryable: there is no file to
    resend.
  */
  const captureFailed = useCallback((caught: unknown) => {
    setState({
      status: 'error',
      heading: 'That photograph did not take',
      message:
        'The camera could not take the photograph. Try again, or choose a photo from your library.',
      retryable: false,
      diagnostic: diagnoseUploadError(caught),
    });
  }, []);

  /*
    ── ⚠ LEG-02 · declining means "no AI features", never "no app" ──────────

    The controls stand down rather than the screen refusing: the viewfinder is
    held, the line below says what declining cost and how to change it, and
    the frame stays where it was. Blocking the product on a privacy refusal
    would trade a 5.1.2 problem for a 5.1.1(v)-shaped one — and the garage,
    the history and the recall list are all useful without a model.
  */
  const idleFoot =
    consent === 'declined' ? (
      <View style={styles.block}>
        <Text style={styles.body_}>{INVOICE_AI_CONSENT.declineNote}</Text>
        <Button
          label="Change that"
          variant="outline"
          size="small"
          onPress={() => setReasking(true)}
          style={styles.onMargin}
        />
      </View>
    ) : (
      /*
        ── R49 · what happens next, stated before it happens ────────────────

        A model reads the photograph and writes rows into the owner's
        permanent service record, and the system's rule is that AI
        uncertainty is stated plainly, before the act.

        ⚠ The review's suggested line was *"You review them before anything
        is saved."* **That is not true** and is not written here. Line items
        are written by `uploadInvoice` as soon as extraction succeeds; the
        only thing held back for confirmation is a vehicle mismatch. What is
        promised is what actually happens.

        ⚠ 12 Sep · one line, and it stays *before* the photograph. Two
        critiques asked for the caveat to move to "the post-capture review,
        where the lines are actually shown" — there is no such review (the
        lines are filed as they are read), and R49's point is that consent to
        a model reading a document is given before the document is
        photographed, not after. What the viewfinder took from the ask is the
        length: an explainer page became one line at the frame's foot.
      */
      <Text style={styles.caveat}>
        A model reads the line items into this car's history — check them afterwards.
      </Text>
    );

  return (
    <>
    <AiConsentSheet
      visible={consent === 'unknown' || reasking}
      copy={INVOICE_AI_CONSENT}
      onAccept={() => {
        setReasking(false);
        setConsent('granted');
        void recordAiConsent('granted');
        /*
          Nothing else to do: `granted` arms the viewfinder, which asks for
          the camera and comes up ready. That is the thing they came to do,
          continued into rather than pressed for again.
        */
      }}
      onDecline={() => {
        setReasking(false);
        setConsent('declined');
        void recordAiConsent('declined');
      }}
    />

    {state.status === 'idle' ? (
      /*
        ── ⚠ 12 Sep · the first frame is the viewfinder — brief B9 ───────────

        Outside the scroller and full height: a viewfinder is a frame, not a
        band, and the feed fills what the header and the tab bar leave. R47
        still holds — the nav says SCAN INVOICE and the screen does not
        repeat it; the readout names the act instead.

        **No PDF claim.** An earlier frame said "A PDF works too", which the
        server supports and this screen does not: the picker is `mediaTypes:
        ['images']`, so a PDF cannot be selected at all. Promising a
        capability the control in front of you cannot reach is worse than
        not mentioning it. Picking documents needs `expo-document-picker` —
        another native module, another cloud build.

        `live` only once the person has agreed: `null` is still reading,
        `unknown` has the sheet up, and `declined` stands the controls down
        — see `consent`.
      */
      <Viewfinder
        live={consent === 'granted'}
        onCapture={captured}
        onCaptureFailed={captureFailed}
        beside={
          /*
            Not a fallback. Plenty of invoices arrive as an emailed PDF or a
            photo taken days ago — and the simulator has no camera at all, so
            a camera-only flow could never be exercised on the machine this is
            developed on. Beside the capture control at the same height, as
            the critique placed it.

            ⚠ `outline`, not `ghost` (round 35): a bare word beside a boxed
            CAPTURE read as *"a half-built button row"*. The brief's own pair
            — *"primary off-white fill … secondary off-white hairline"* — at
            one height, the odometer gate's grammar. The ghost was right when
            the word sat *under* a paragraph and a primary (rounds 32–33);
            beside a primary it is the secondary, and the secondary has a box.
          */
          <Button
            label="Choose from library"
            variant="outline"
            size="small"
            onPress={() => void choose()}
          />
        }
        foot={idleFoot}
      />
    ) : (
    <ScrollView
      /*
        ── ⚠ 12 Sep · top-aligned; R57's optical centre is superseded here ────

        R57 centred every state of this screen (*"a single-question screen with
        its question at the very top of a black field reads as a page that
        failed to finish loading"*), and it was right about the screen it
        graded — a bold sans H1 and two pill buttons floating on black. Under
        the locked brief the screen is a band on one graphite surface, read
        from the left margin like every other, and the critique of round 30
        named the centring's remainder for what it had become: *"copy floating
        mid-screen above dead black — a placeholder layout"*, with 40% of the
        display empty above the first word. The roots superseded R57 on 11 Sep
        for the same reason (`docs/design-system-drift.md` §6.9); this screen
        joins them. One rule for every state, so the block does not jump
        between the first frame and the wait.
      */
      contentContainerStyle={styles.body}
    >
      {state.status === 'working' && (
        /*
          ── 12 Sep · the full instrument with a ledger ──────────────────────

          Web's scanner is the one wait with a stage list, because it is the
          one wait with two real awaits; the phone's has two as well — the
          picker or the viewfinder's shutter, then the upload — and a third
          on the confirm path. Every mark comes from this screen's own state,
          never from a timer. The line beneath is the file's name — a value,
          so mono (B1) — which is a fact the screen was handed; it is not
          printed while the picker is still open, because there is no file
          yet.

          Not `delay`ed: this wait was started by a press and wants its
          feedback at once. Left-anchored on the page's own gutter rather than
          centred (brief B3), which is what `OPTICAL_CENTRE` still leaves room
          for above.
        */
        <Working
          line={scanLine(state.phase, state.source)}
          value={state.phase === 'picking' ? undefined : file?.name}
          stages={scanStages(state.phase, state.source)}
        />
      )}

      {state.status === 'done' && (
        <View style={styles.block}>
          <Text style={styles.title}>Filed</Text>
          <Text style={styles.body_}>
            {state.itemsExtracted > 0
              ? `${state.itemsExtracted} line ${state.itemsExtracted === 1 ? 'item' : 'items'} added to this car's history.`
              : /*
                  Zero is honest and not a failure — the document is stored, its
                  lines just could not be itemised. Claiming a number here would
                  be the overclaim the provenance work removed elsewhere.
                */
                'The invoice is stored. No line items could be read from it.'}
          </Text>
          <Button
            label="Scan another"
            variant="outline"
            onPress={() => setState({ status: 'idle' })}
          />
        </View>
      )}

      {state.status === 'mismatch' && (
        <View style={styles.block}>
          <Text style={styles.title}>Is this the right car?</Text>
          <Text style={styles.body_}>
            This invoice looks like it is for {describeVehicle(state.extracted)}, but you are adding
            it to {describeVehicle(state.expected)}.
          </Text>
          {/*
            The owner decides. The extractor is a heuristic and is wrong often
            enough that refusing outright would be worse than asking — but
            filing silently would be worse still, because a service record on
            the wrong car corrupts the history the advisor reasons from.
          */}
          <Button
            label="Yes, file it here"
            variant="primary"
            onPress={() => file && void send(file, true)}
            disabled={!file}
          />
          <Button
            label="No, cancel"
            variant="outline"
            onPress={() => setState({ status: 'idle' })}
          />
        </View>
      )}

      {state.status === 'not-invoice' && (
        <View style={styles.block}>
          <Text style={styles.title}>That does not look like an invoice</Text>
          <Text style={styles.body_}>{state.message}</Text>
          {/*
            Back to the viewfinder — "another photo" is the frame, not the
            system sheet, since 12 Sep. Every camera route on this screen
            lands on `idle` for the same reason.
          */}
          <Button
            label="Try another photo"
            variant="primary"
            onPress={() => setState({ status: 'idle' })}
          />
          <Button
            label="Choose from library"
            variant="outline"
            onPress={() => void choose()}
          />
        </View>
      )}

      {state.status === 'error' && (
        <View style={styles.block}>
          <Text style={styles.title}>{state.heading ?? 'That did not upload'}</Text>
          <Text style={styles.body_}>{state.message}</Text>

          {/*
            The line that ends the guessing. Three rounds of testing could not
            answer "did the request reach the server, and how long did it take"
            from this screen, so every report had to describe symptoms and every
            reply had to hypothesise. `__DEV__` only — it is diagnostic text,
            not product copy, and it compiles out exactly as the token panel
            does.
          */}
          {__DEV__ && state.diagnostic ? (
            <Text style={styles.diagnostic}>{state.diagnostic}</Text>
          ) : null}
          {/*
            Retry resends the file already chosen rather than reopening the
            camera — the photograph may be of a bill no longer in front of the
            person holding the phone. But it is offered **only when a second
            attempt could differ**: a rejected file type fails the same way
            forever, and offering it there is what stranded a real tester.

            A way back to the picker is always present, in every branch.
          */}
          {/*
            The affordance the copy used to assume. An error that says "sign in
            again" while offering only Try again / Choose a file / Take a photo
            is an instruction with nowhere to follow it — `onSignOut` clears the
            session, which is what makes `App.tsx` show the sign-in screen.
          */}
          {state.signInMayHelp ? (
            <Button label="Sign in again" variant="primary" onPress={onSignOut} />
          ) : null}

          {state.retryable && file ? (
            <Button
              label="Try again"
              /*
                One filled control per screen. When "Sign in again" is showing
                it is the verb, so this steps down to outline — the ladder the
                variant names rather than two whites competing.
              */
              variant={state.signInMayHelp ? 'outline' : 'primary'}
              onPress={() => void send(file, false)}
            />
          ) : null}

          <Button
            label="Choose a different file"
            variant={state.retryable && file ? 'outline' : 'primary'}
            onPress={() => void choose()}
          />

          <Button
            label="Take a photo"
            variant="outline"
            onPress={() => setState({ status: 'idle' })}
          />
        </View>
      )}
    </ScrollView>
    )}
    </>
  );
}

const styles = StyleSheet.create({
  body: { ...PAGE_BODY },
  block: { gap: 12 },
  title: { color: text.primary, fontSize: 22, fontFamily: interFace('700'), fontWeight: '700', letterSpacing: -0.3 },
  /* `body_` because `body` is the container above. */
  body_: { color: text.muted, fontFamily: interFace('400'),
    fontSize: 15, lineHeight: 22 },
  /*
    Left, on the page's own margin: a centred word under left-aligned copy was
    the one thing on the old frame not reading from the margin (round 32's
    AI-tell list). The small size's 12pt of padding is pulled back so the
    word starts where the sentences do.
  */
  onMargin: { alignSelf: 'flex-start', marginLeft: -space.md },
  /*
    R49's line, at the viewfinder's foot. Muted, and the 13pt sans — the Due
    row's meta scale — because it is a caveat under the act, not the act.
  */
  caveat: { ...type.value, color: text.muted },

  /* Monospace so an elapsed figure is scannable; dev builds only. */
  diagnostic: {
    color: text.muted,
    fontSize: 12,
    fontFamily: 'Menlo',
    marginTop: -4,
  },
});
