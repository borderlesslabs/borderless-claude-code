// src/dedupe.ts
// In-memory dedupe on event id. Swap for a unique DB constraint in production.

const seen = new Map<string, number>();
const MAX_ENTRIES = 10_000;

/**
 * Returns true if this event id has not been seen before (first delivery).
 * Returns false if it has (retry — skip processing).
 */
export function markSeen(eventId: string): boolean {
  if (seen.has(eventId)) return false;

  if (seen.size >= MAX_ENTRIES) {
    // Drop the oldest entry. For a real deployment this is a DB row, not a
    // process-local Map, so this eviction logic wouldn't apply.
    const firstKey = seen.keys().next().value;
    if (firstKey !== undefined) seen.delete(firstKey);
  }

  seen.set(eventId, Date.now());
  return true;
}
