/**
 * The options for a toast that asks a question and carries its answer.
 *
 * Audit 360, UX-18 (1 Oct). The web's odometer refusal — "That is below the
 * 60,000 miles already recorded. Correcting an earlier mistake?" — put its
 * *Yes, correct it* on a sonner toast with no duration, and sonner dismisses
 * at four seconds: the answer vanished while the owner read the question. The
 * phone asks the same thing in an `Alert` that waits. A toast that asks waits
 * too, until it is answered or closed.
 */
export function questionToast(label: string, onClick: () => void) {
  return {
    action: { label, onClick },
    duration: Number.POSITIVE_INFINITY,
    closeButton: true,
  } as const;
}
