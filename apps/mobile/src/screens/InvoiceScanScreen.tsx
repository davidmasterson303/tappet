import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Text from '../components/Text';

import {
  uploadInvoice,
  uploadInvoicePage,
  fileInvoicePages,
  discardInvoicePages,
  describeUploadError,
  diagnoseUploadError,
  PageMissingError,
  type ExtractedVehicle,
  type InvoiceFile,
  type InvoiceUploadResult,
} from '../api/documents';
import Button from '../components/Button';
import Viewfinder from '../components/Viewfinder';
import Working from '../components/Working';
import PageStrip, { type PageState } from '../components/PageStrip';
import PageReview from '../components/PageReview';
import { scanLine, scanStages, type ScanPhase, type ScanPages } from '../components/working-stages';
import { INVOICE_PAGE_LIMIT } from '@tappet/core/validation';
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
 * ── ⚠ 27 Sep · an invoice is pages, not a photograph ───────────────────────
 *
 * The scan took one photograph and filed it, so page 2 of a Dinan invoice
 * was a second invoice — its own row, its own model call, its own "Labor"
 * total counted again. Now the camera stays up after the shutter: each page
 * joins a strip under the frame (`PageStrip`) and uploads while the next is
 * lined up, the first page asks — in a sentence, not a dialog — whether the
 * invoice runs on, and DONE files every page as one document in one read
 * (`uploadInvoicePages` on the server). The canvas that settled it, with the
 * question-per-page alternative drawn beside it, is "Multi-page invoice scan"
 * in the design artifacts; `PageStrip`'s header says why the strip won.
 *
 * The one-photograph invoice costs nothing extra: CAPTURE, then DONE · 1 PAGE,
 * which is the first frame's own control row with the library swapped for
 * the verb that ends the scan.
 *
 * ── What is kept when something goes wrong ──────────────────────────────────
 *
 * The pages. Every failure path leaves them in the strip — on the phone and
 * in storage — so "Try again" re-files what was already photographed rather
 * than reopening the camera — the same rule as the advisor's composer, where
 * losing what someone produced is worse than any error message.
 * Re-photographing a bill you are standing next to is a small cost;
 * re-photographing one you have already thrown away is not. They are
 * discarded only when the person starts over, or leaves.
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
  | { status: 'done'; itemsExtracted: number; pageCount: number }
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

/** One page of the scan, as the screen holds it. */
interface Page {
  key: string;
  file: InvoiceFile;
  state: PageState;
  /** The stored page, once its upload has answered. */
  path?: string;
  /**
   * The API this phone talks to has no `/invoice-pages` (a 404 — §8's "new
   * route, unpromoted host"). A one-page scan then files the old way.
   */
  legacy?: boolean;
}

const two = (n: number) => String(n).padStart(2, '0');
const pagesWord = (n: number) => `${n} ${n === 1 ? 'page' : 'pages'}`;
let pageSerial = 0;

function describeVehicle(vehicle: ExtractedVehicle | null): string {
  if (!vehicle) return 'a car it could not identify';
  if (vehicle.label) return vehicle.label;
  const parts = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : 'a car it could not identify';
}

export function InvoiceScanScreen({
  vehicleId,
  pickImages,
  startWith = 'camera',
  onSignOut,
  onFiled,
}: {
  vehicleId: string;
  /**
   * `library` opens the picker as soon as consent allows (21 Sep) — the
   * Service tab's UPLOAD, for a receipt already photographed. The camera is
   * still behind it when the picker is dismissed. Never before consent: the
   * sheet at the door stays the first thing a first-time scanner meets.
   */
  startWith?: 'camera' | 'library';
  /**
   * Resolves to the chosen images in the order they were tapped — up to
   * `limit` — or `[]` if the picker was dismissed.
   *
   * Injected so this file stays free of native imports — see the header.
   * `src/media/pick-image.ts` (`pickInvoiceImages`) is the real
   * implementation and the only module that imports `expo-image-picker`.
   *
   * ⚠ The library only, since 12 Sep. The camera is the viewfinder's, and
   * there is no source argument so a future "Take a photo" cannot reach for
   * the system sheet again by habit. Plural since 27 Sep: several photos of
   * one invoice are its pages.
   */
  pickImages: (limit: number) => Promise<InvoiceFile[]>;
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
  /*
    ── The pages (27 Sep) ─────────────────────────────────────────────────────

    State for drawing, and a ref mirroring it for the work: an upload that
    answers after three more photographs must update the page it was for,
    and Done must read the pages as they are when it runs, not as they were
    when the handler was made.
  */
  const [pages, setPagesState] = useState<Page[]>([]);
  const pagesRef = useRef<Page[]>([]);
  const setPages = useCallback((next: (current: Page[]) => Page[]) => {
    pagesRef.current = next(pagesRef.current);
    setPagesState(pagesRef.current);
  }, []);
  /** The upload in flight for each page, so Done can wait for exactly those. */
  const uploads = useRef(new Map<string, Promise<void>>());
  /** The page the next capture replaces, when a retake is under way. */
  const [retaking, setRetaking] = useState<string | null>(null);
  /** The page open in `PageReview`. */
  const [reviewing, setReviewing] = useState<string | null>(null);
  const mounted = useRef(true);

  /*
    Where the pages came from, for the ledger's first row. A ref rather than
    state: it is read inside `fileScan`, which "Try again" and "Yes, file it here"
    both call without a source in scope, and it never needs to redraw anything
    on its own.
  */
  const source = useRef<ScanSource>('library');

  /**
   * Send one page, now — while the next is being lined up. Resolves whatever
   * happens; the page's own `state` carries the answer.
   */
  const sendPage = useCallback(
    (key: string) => {
      const page = pagesRef.current.find((p) => p.key === key);
      if (!page) return Promise.resolve();
      setPages((all) => all.map((p) => (p.key === key ? { ...p, state: 'sending', legacy: false } : p)));

      const upload = uploadInvoicePage(vehicleId, page.file).then(
        (path) => {
          if (!pagesRef.current.some((p) => p.key === key) || !mounted.current) {
            // Removed, or the screen left, while it was on its way: nobody is filing it.
            void discardInvoicePages(vehicleId, [path]);
            return;
          }
          setPages((all) => all.map((p) => (p.key === key ? { ...p, state: 'sent', path } : p)));
        },
        (caught) => {
          const legacy = caught instanceof ApiRequestError && caught.status === 404;
          setPages((all) =>
            all.map((p) => (p.key === key ? { ...p, state: legacy ? 'sent' : 'failed', legacy } : p))
          );
        }
      );
      uploads.current.set(key, upload);
      void upload.finally(() => {
        if (uploads.current.get(key) === upload) uploads.current.delete(key);
      });
      return upload;
    },
    [vehicleId, setPages]
  );

  /** Put photographs in the strip — appended, or in place of the page being retaken. */
  const addPages = useCallback(
    (files: InvoiceFile[]) => {
      const room = INVOICE_PAGE_LIMIT - pagesRef.current.length + (retaking ? 1 : 0);
      const fresh = files.slice(0, Math.max(0, room)).map<Page>((file) => ({
        key: `page-${++pageSerial}`,
        file,
        state: 'sending',
      }));
      if (fresh.length === 0) return [];

      if (retaking && pagesRef.current.some((p) => p.key === retaking)) {
        const old = pagesRef.current.find((p) => p.key === retaking);
        if (old?.path) void discardInvoicePages(vehicleId, [old.path]);
        const [first, ...rest] = fresh;
        setPages((all) => {
          const at = all.findIndex((p) => p.key === retaking);
          const next = [...all];
          next.splice(at, 1, first, ...rest);
          return next;
        });
        setRetaking(null);
      } else {
        setPages((all) => [...all, ...fresh]);
      }
      fresh.forEach((page) => void sendPage(page.key));
      return fresh;
    },
    [retaking, vehicleId, sendPage, setPages]
  );

  /** Throw the scan away — on the phone and in storage. */
  const discardAll = useCallback(() => {
    const paths = pagesRef.current.flatMap((p) => (p.path ? [p.path] : []));
    setPages(() => []);
    setRetaking(null);
    setReviewing(null);
    void discardInvoicePages(vehicleId, paths);
  }, [vehicleId, setPages]);

  /*
    Leaving mid-scan discards what was sent. Best-effort — the screen is going
    and nobody is left to tell; a page this misses sits under the car's own
    prefix, where the account sweep reaches it. An upload still out when the
    screen goes discards itself when it lands (`sendPage`).
  */
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const paths = pagesRef.current.flatMap((p) => (p.path ? [p.path] : []));
      void discardInvoicePages(vehicleId, paths);
    };
  }, [vehicleId]);

  /**
   * A failure, as this screen reports it. Shared by every await in `file`.
   */
  const report = useCallback(
    (caught: unknown) => {
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
    },
    [onSignOut]
  );

  const settle = useCallback(
    (result: InvoiceUploadResult) => {
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

      const pageCount = result.pageCount ?? pagesRef.current.length;
      // Filed: the server has removed its copies of the pages; drop ours.
      setPages(() => []);
      setState({ status: 'done', itemsExtracted: result.itemsExtracted, pageCount });
      onFiled?.();
    },
    [onFiled, setPages]
  );

  /**
   * DONE — file every page as one invoice.
   *
   * Waits for any upload still out (the ledger's SENDING row, counted from
   * the pages themselves), sends a failed page once more, then files the
   * paths in strip order. `confirmVehicle` is the mismatch's second send:
   * the same paths, the heuristic overridden.
   */
  const fileScan = useCallback(
    async (confirmVehicle: boolean) => {
      setReviewing(null);
      setRetaking(null);
      setState({ status: 'working', phase: confirmVehicle ? 'filing' : 'sending', source: source.current });

      try {
        await Promise.all([...uploads.current.values()]);
        const unsent = pagesRef.current.filter((p) => p.state === 'failed' || (!p.path && !p.legacy));
        await Promise.all(unsent.map((p) => sendPage(p.key)));

        const current = pagesRef.current;
        if (current.length === 0) {
          setState({ status: 'idle' });
          return;
        }

        if (current.some((p) => p.legacy)) {
          /*
            The API this phone is talking to predates pages. One page files
            the way it always did; more cannot be filed as one invoice there,
            and saying so beats filing them as several.
          */
          if (current.length === 1) {
            if (!confirmVehicle) setState({ status: 'working', phase: 'reading', source: source.current });
            settle(await uploadInvoice({ vehicleId, file: current[0].file, confirmVehicle }));
            return;
          }
          setState({
            status: 'error',
            heading: 'That did not upload',
            message:
              'Filing more than one page needs a newer version of the Tappet API than this app is talking to. Remove all but one page, or try again later.',
            retryable: false,
          });
          return;
        }

        const failed = current.filter((p) => p.state === 'failed' || !p.path);
        if (failed.length > 0) {
          setState({
            status: 'error',
            heading: failed.length === 1 ? `Page ${two(current.indexOf(failed[0]) + 1)} did not send` : 'Some pages did not send',
            message:
              'Your pages are still here. Check your connection and try again — nothing has been filed yet.',
            retryable: true,
          });
          return;
        }

        if (!confirmVehicle) setState({ status: 'working', phase: 'reading', source: source.current });
        const paths = current.map((p) => p.path as string);
        try {
          settle(await fileInvoicePages({ vehicleId, pagePaths: paths, confirmVehicle }));
        } catch (caught) {
          if (!(caught instanceof PageMissingError)) throw caught;
          /*
            The server no longer holds a page the phone does — a discard that
            raced, a sweep. Send every page again, once, and file those.
          */
          setPages((all) => all.map((p) => ({ ...p, path: undefined })));
          await Promise.all(pagesRef.current.map((p) => sendPage(p.key)));
          const again = pagesRef.current;
          if (again.some((p) => !p.path)) throw caught;
          settle(
            await fileInvoicePages({ vehicleId, pagePaths: again.map((p) => p.path as string), confirmVehicle })
          );
        }
      } catch (caught) {
        report(caught);
      }
    },
    [vehicleId, sendPage, settle, report, setPages]
  );

  /**
   * Open the library. **No consent check** — see `choose`.
   *
   * `thenFile` is UPLOAD from the Service tab: the photographs chosen *are*
   * the invoice, and choosing them is the Done. From the viewfinder they
   * join the strip instead, beside anything already photographed.
   *
   * ⚠ Split out on purpose, and still so: `choose` closes over `consent`, and
   * the work must not re-read the gate that just admitted it.
   */
  const openPicker = useCallback(
    async (thenFile: boolean) => {
      const room = INVOICE_PAGE_LIMIT - pagesRef.current.length + (retaking ? 1 : 0);
      if (room <= 0) return;
      source.current = 'library';
      setState({ status: 'working', phase: 'picking', source: 'library' });

      try {
        const chosen = await pickImages(room);
        if (chosen.length === 0) {
          // Dismissing the picker is not a failure and must not read as one.
          setState({ status: 'idle' });
          return;
        }
        addPages(chosen);
        if (thenFile) await fileScan(false);
        else setState({ status: 'idle' });
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
    },
    [pickImages, addPages, fileScan, retaking]
  );

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

    await openPicker(false);
  }, [consent, openPicker]);

  /* UPLOAD from the Service tab: the picker, once, the moment consent is known to be granted. */
  const openedForUpload = useRef(false);
  useEffect(() => {
    if (startWith !== 'library' || consent !== 'granted' || openedForUpload.current) return;
    openedForUpload.current = true;
    void openPicker(true);
  }, [startWith, consent, openPicker]);

  /**
   * The viewfinder's capture, as the scan wants it: one more page in the
   * strip, sending at once. The haptic has already fired and the file is on
   * disk; the camera stays up for the next page.
   */
  const captured = useCallback(
    async (chosen: InvoiceFile) => {
      source.current = 'camera';
      addPages([chosen]);
    },
    [addPages]
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

  /*
    ── 27 Sep · once a page is in, the foot asks the question ────────────────

    The ask David described — "after the first page, ask if there are more,
    or Done" — as a sentence under the readout, not a dialog over the frame:
    the frame is where the next page would be lined up, and a question per
    page is the pattern the strip was chosen over (`PageStrip`). It is asked
    once, after the first page, which is the only moment it is news; from the
    second page on the controls speak for themselves and the line says what
    a tap on a page does.
  */
  const count = pages.length;
  const full = count >= INVOICE_PAGE_LIMIT && !retaking;
  const retakeIndex = retaking ? pages.findIndex((p) => p.key === retaking) : -1;
  const nextNumber = retakeIndex >= 0 ? retakeIndex + 1 : count + 1;
  const scanFoot =
    retakeIndex >= 0 ? (
      <Text style={styles.body_}>{`Photograph page ${two(nextNumber)} again. It replaces the one in the strip.`}</Text>
    ) : full ? (
      <Text style={styles.body_}>
        {`${pagesWord(INVOICE_PAGE_LIMIT)} is the most one scan reads. Press Done to file these — a longer invoice goes in as a second scan.`}
      </Text>
    ) : count === 1 ? (
      <Text style={styles.body_}>
        Page 01 is in. If the invoice runs on, photograph the next page. If that was all of it, press Done.
      </Text>
    ) : (
      <Text style={styles.body_}>Tap a page to retake or remove it.</Text>
    );

  const reviewed = reviewing ? pages.findIndex((p) => p.key === reviewing) : -1;
  const sentCount = pages.filter((p) => p.state === 'sent').length;
  const scanPages: ScanPages | undefined = count > 0 ? { count, sent: sentCount } : undefined;

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
        label={
          count === 0
            ? undefined
            : full
              ? // The act, not the count — the strip already says 6 OF 6.
                'Ready to file'
              : retakeIndex >= 0
                ? `Retake page ${two(nextNumber)}`
                : `Photograph page ${two(nextNumber)}`
        }
        captureLabel={count === 0 ? undefined : full ? 'Capture' : retakeIndex >= 0 ? `Retake page ${two(nextNumber)}` : `Capture page ${two(nextNumber)}`}
        captureDisabled={full}
        disabledWord="Full"
        strip={
          count > 0 ? (
            <PageStrip
              pages={pages.map((p) => ({ key: p.key, uri: p.file.uri, state: p.state }))}
              current={retaking ?? pages[count - 1]?.key ?? null}
              onOpen={setReviewing}
              onAddFromLibrary={full || retaking ? undefined : () => void choose()}
              limit={INVOICE_PAGE_LIMIT}
            />
          ) : null
        }
        beside={
          retakeIndex >= 0 ? (
            /*
              While a page is being retaken DONE cannot be pressed, so its slot
              holds the way out of the retake instead — one control row, and
              the frame keeps its height (round 53: a ghost line under the
              sentence pushed the brackets up, and DONE sat there disabled).
            */
            <Button label="Keep the old page" variant="outline" size="small" onPress={() => setRetaking(null)} />
          ) : count > 0 ? (
            /*
              DONE takes the library's place once there is something to file —
              the library moves into the strip as its last tile. Outline beside
              the shutter, which is still the thing most scans press next; the
              filled control only when the shutter can no longer be pressed.
            */
            <Button
              label={`Done · ${pagesWord(count)}`}
              variant={full ? 'primary' : 'outline'}
              size="small"
              onPress={() => void fileScan(false)}
              style={full ? styles.grow : undefined}
            />
          ) : (
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
          )
        }
        foot={count > 0 && consent === 'granted' ? scanFoot : idleFoot}
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
          line={scanLine(state.phase, state.source, scanPages)}
          value={state.phase === 'picking' || count !== 1 ? undefined : pages[0]?.file.name}
          stages={scanStages(state.phase, state.source, scanPages)}
        />
      )}

      {state.status === 'done' && (
        <View style={styles.block}>
          <Text style={styles.title}>Filed</Text>
          <Text style={styles.body_}>
            {state.itemsExtracted > 0
              ? `${state.itemsExtracted} line ${state.itemsExtracted === 1 ? 'item' : 'items'}${state.pageCount > 1 ? ` from ${state.pageCount} pages` : ''} added to this car's history.`
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
            onPress={() => void fileScan(true)}
            disabled={count === 0}
          />
          <Button
            label="No, cancel"
            variant="outline"
            onPress={() => {
              discardAll();
              setState({ status: 'idle' });
            }}
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
            onPress={() => {
              discardAll();
              setState({ status: 'idle' });
            }}
          />
          <Button
            label="Choose from library"
            variant="outline"
            onPress={() => {
              discardAll();
              void choose();
            }}
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

          {state.retryable && count > 0 ? (
            <Button
              label="Try again"
              /*
                One filled control per screen. When "Sign in again" is showing
                it is the verb, so this steps down to outline — the ladder the
                variant names rather than two whites competing.
              */
              variant={state.signInMayHelp ? 'outline' : 'primary'}
              onPress={() => void fileScan(false)}
            />
          ) : null}

          {count > 0 ? (
            /*
              With pages in hand the way back is to them, not to a fresh
              picker — they are what "Try again" files. Starting over is
              offered, and is the one control here that throws them away.
            */
            <>
              <Button
                label="Back to the pages"
                variant={state.retryable ? 'outline' : 'primary'}
                onPress={() => setState({ status: 'idle' })}
              />
              <Button
                label="Start over"
                variant="ghost"
                onPress={() => {
                  discardAll();
                  setState({ status: 'idle' });
                }}
              />
            </>
          ) : (
            <>
              <Button label="Choose a different file" variant="primary" onPress={() => void choose()} />
              <Button label="Take a photo" variant="outline" onPress={() => setState({ status: 'idle' })} />
            </>
          )}
        </View>
      )}
    </ScrollView>
    )}

    {reviewed >= 0 ? (
      <PageReview
        key={pages[reviewed].key}
        uri={pages[reviewed].file.uri}
        number={reviewed + 1}
        total={count}
        state={pages[reviewed].state}
        onClose={() => setReviewing(null)}
        onRetake={() => {
          setRetaking(pages[reviewed].key);
          setReviewing(null);
        }}
        onRemove={() => {
          const gone = pages[reviewed];
          if (gone.path) void discardInvoicePages(vehicleId, [gone.path]);
          setPages((all) => all.filter((p) => p.key !== gone.key));
          if (retaking === gone.key) setRetaking(null);
          setReviewing(null);
        }}
        onResend={() => void sendPage(pages[reviewed].key)}
      />
    ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  body: { ...PAGE_BODY },
  block: { gap: 12 },
  grow: { flex: 1 },
  /*
    B1: a title in the condensed grotesk, caps — `displaySection`, the step
    under a screen's own name, since the nav already carries that. It was
    Inter 22 bold, which round 53 read as "a system alert" on FILED.
  */
  title: { ...type.displaySection, color: text.primary },
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
