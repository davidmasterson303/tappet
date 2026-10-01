import { apiRequest } from './client';

/**
 * Tell the server a screen threw.
 *
 * The app has no crash-reporting SDK (a native module — a build, and a
 * decision). This is the honest minimum until there is one: the boundary
 * posts what it caught to `/api/v1/client-errors`, which logs it at error
 * level where the function logs are read. Never awaited by the caller: a
 * report that fails to send changes nothing about the recovery.
 *
 * ── Linked, not anonymous ───────────────────────────────────────────────────
 *
 * `allowAnonymous` means a token is *not required* — a crash on the sign-in
 * screen is still a crash — not that none is sent: `client.ts` attaches the
 * bearer whenever there is a session, and the route logs the report with
 * `reporter` = the account id (SEC-7). So a signed-in report is linked to the
 * account, and only a signed-out one is anonymous. `app.json` declares Crash
 * Data **Linked** for that reason, and the App Store label must say the same
 * (audit 360, LEGAL-18; `privacy-manifest.test.ts` pins the three together).
 */
export interface ClientErrorReport {
  message: string;
  stack: string | null;
  componentStack: string | null;
  where: string;
  version: string | null;
}

export async function reportClientError(report: ClientErrorReport): Promise<void> {
  try {
    await apiRequest('/client-errors', {
      method: 'POST',
      allowAnonymous: true,
      timeoutMs: 8_000,
      body: {
        ...report,
        // Bounded: a stack is a few kilobytes at most and the route refuses more.
        stack: report.stack?.slice(0, 4_000) ?? null,
        componentStack: report.componentStack?.slice(0, 4_000) ?? null,
      },
    });
  } catch {
    // Nothing to do: the owner is looking at the recovery screen, not this.
  }
}
