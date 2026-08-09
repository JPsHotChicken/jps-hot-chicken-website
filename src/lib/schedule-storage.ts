import { emptyDoc, resizeWeek, type ScheduleDoc } from "@/lib/schedule";

/**
 * Persistence for the scheduler, exposed as an external store so components can
 * read it with `useSyncExternalStore` (no hydration mismatch, no setState in an
 * effect).
 *
 * Schedules currently live in this browser's localStorage — no account, no
 * server, nothing to set up. The trade-off is that they don't sync between
 * devices and are lost if site data is cleared, so export a PDF for anything
 * you need to keep. Everything goes through this module, so swapping in a
 * database later is a change to this file alone.
 */

const STORAGE_KEY = "jp-scheduler-v1";

function parse(raw: string | null): ScheduleDoc {
  const doc = emptyDoc();
  if (!raw) return doc;

  try {
    const parsed = JSON.parse(raw) as Partial<ScheduleDoc>;
    if (typeof parsed.rowCount === "number") doc.rowCount = parsed.rowCount;
    if (Array.isArray(parsed.employees)) doc.employees = parsed.employees;

    // Normalise every stored week to the current row count and hour range, so a
    // doc saved under different settings can't produce ragged arrays.
    if (parsed.weeks && typeof parsed.weeks === "object") {
      for (const [weekStart, week] of Object.entries(parsed.weeks)) {
        doc.weeks[weekStart] = resizeWeek(week, doc.rowCount);
      }
    }
    return doc;
  } catch {
    // Corrupt or unreadable storage shouldn't brick the dashboard.
    return emptyDoc();
  }
}

/**
 * `getSnapshot` must return a referentially stable value between changes, so
 * the parsed doc is cached and only replaced when it actually changes.
 */
let cache: ScheduleDoc | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Keep other tabs in sync — otherwise two open dashboards silently diverge.
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      cache = parse(event.newValue);
      emit();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function getSnapshot(): ScheduleDoc {
  cache ??= parse(window.localStorage.getItem(STORAGE_KEY));
  return cache;
}

/**
 * The server has no schedule to render. Returning `null` here (and on the first
 * client render) keeps hydration in step; the real doc arrives right after.
 */
export function getServerSnapshot(): null {
  return null;
}

/** Apply a change, persist it, and notify subscribers. */
export function updateDoc(updater: (current: ScheduleDoc) => ScheduleDoc): void {
  const next = updater(getSnapshot());
  if (next === cache) return;
  cache = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    console.error("[scheduler] Could not save to localStorage:", error);
  }
  emit();
}
