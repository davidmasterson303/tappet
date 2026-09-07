import { eventBus } from '@tappet/core/event-bus';

export interface FailedDeletion {
  vehicleId: string;
  attemptedAt: string;
  error: string;
  failedTables?: Array<{
    table: string;
    error: string;
  }>;
  retryCount: number;
}

class DeletionRecoveryQueue {
  private storageKey = 'tappet-failed-deletions';

  /*
    ── ⚠ Renaming this key strands whatever is queued under the old one ───────

    Every entry here is a deletion the server refused and the browser promised
    to retry. The key is the only handle on it: `localStorage` is not scanned,
    so an entry under a key nothing reads is not "stale data", it is a deletion
    the owner asked for that now silently never completes — and the owner was
    told it would.

    **This has already happened once.** The 6 Sep rename (`06af505`) moved the
    key from `crewchief-failed-deletions` to `wellkept-failed-deletions` as a
    plain string swap, with no migration. Anything queued before that date has
    been orphaned since, in every browser that held one.

    So the drain reads *both* dead names, oldest last, and it is a drain rather
    than a fallback chain: entries are adopted into the current key and the old
    one is removed, so this runs at most once per browser and cannot rot into a
    permanent alternative nobody can prove is still reachable.

    ⚠ Order matters. The current key wins on a vehicle-id collision, and the
    older names are read after it for the same reason — an adopted entry must
    never overwrite a newer attempt at the same deletion.

    The demo cookie renamed in the same commit deliberately gets no such
    treatment: it carries `max-age=86400`, so a compatibility read would be
    unreachable within a day of shipping.
  */
  private legacyStorageKeys = ['wellkept-failed-deletions', 'crewchief-failed-deletions'];

  private queue: Map<string, FailedDeletion> = new Map();

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    if (typeof window === 'undefined') return;

    this.adopt(this.storageKey);

    /*
      Drained after the current key, so a collision resolves in favour of the
      entry written most recently. `adopt` skips ids already present.
    */
    let adoptedAny = false;
    for (const key of this.legacyStorageKeys) {
      if (this.adopt(key)) {
        adoptedAny = true;
        try {
          localStorage.removeItem(key);
        } catch (error) {
          console.error('[DeletionRecovery] Failed to clear superseded key:', error);
        }
      }
    }

    // Persist under the current key, or the adoption is lost on reload.
    if (adoptedAny) this.saveToStorage();
  }

  /** Read one key into the queue. Returns whether it held anything. */
  private adopt(key: string): boolean {
    try {
      const stored = localStorage.getItem(key);
      if (!stored) return false;

      const parsed = JSON.parse(stored) as FailedDeletion[];
      if (!Array.isArray(parsed)) return false;

      parsed.forEach((item) => {
        if (!item?.vehicleId) return;
        if (this.queue.has(item.vehicleId)) return;
        this.queue.set(item.vehicleId, item);
      });
      return true;
    } catch (error) {
      console.error('[DeletionRecovery] Failed to load from storage:', error);
      return false;
    }
  }

  private saveToStorage() {
    if (typeof window === 'undefined') return;

    try {
      const items = Array.from(this.queue.values());
      localStorage.setItem(this.storageKey, JSON.stringify(items));
    } catch (error) {
      console.error('[DeletionRecovery] Failed to save to storage:', error);
    }
  }

  addFailedDeletion(
    vehicleId: string,
    error: string,
    failedTables?: Array<{ table: string; error: string }>
  ) {
    const existing = this.queue.get(vehicleId);
    const retryCount = existing ? existing.retryCount + 1 : 0;

    const failedDeletion: FailedDeletion = {
      vehicleId,
      attemptedAt: new Date().toISOString(),
      error,
      failedTables,
      retryCount,
    };

    this.queue.set(vehicleId, failedDeletion);
    this.saveToStorage();

    eventBus.emit('deletionFailed', vehicleId, error);
  }

  removeDeletion(vehicleId: string) {
    this.queue.delete(vehicleId);
    this.saveToStorage();
  }

  getFailedDeletion(vehicleId: string): FailedDeletion | undefined {
    return this.queue.get(vehicleId);
  }

  getAllFailedDeletions(): FailedDeletion[] {
    return Array.from(this.queue.values());
  }

  getFailedDeletionCount(): number {
    return this.queue.size;
  }

  clear() {
    this.queue.clear();
    this.saveToStorage();
  }
}

export const deletionRecoveryQueue = new DeletionRecoveryQueue();
