import { apiRequest } from './client';

/**
 * Tell the server a screen threw.
 *
 * The app has no crash-reporting SDK (a native module — a build, and a
 * decision). This is the honest minimum until there is one: the boundary
 * posts what it caught to `/api/v1/client-errors`, which logs it at error
 * level where the function logs are read. Anonymous on purpose — a crash on
 * the sign-in screen is still a crash — and never awaited by the caller: a
 * report that fails to send changes nothing about the recovery.
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
