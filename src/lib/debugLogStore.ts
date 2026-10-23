import { useSyncExternalStore } from 'react';
import { formatDebugLogs, type DebugLogEvent } from './debugLogs';

const MAX_DEBUG_LOGS = 2000;
let debugLogs: DebugLogEvent[] = [];
const listeners = new Set<() => void>();

function emitChange() {
  for (const listener of listeners) {
    try {
      listener();
    } catch (e) {
      console.error('[DebugLogStore] Listener error:', e);
    }
  }
}

/**
 * Adds an entry to the persistent in-memory debug log (capped at 2000 entries).
 * Survives tab switches and component re-mounts.
 */
export function addDebugLog(stage: string, detail: string) {
  const time = new Date().toLocaleTimeString();
  const entry: DebugLogEvent = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    time,
    stage,
    detail,
  };

  debugLogs = [...debugLogs.slice(-(MAX_DEBUG_LOGS - 1)), entry];
  emitChange();
}

/**
 * Clears all debug logs.
 */
export function clearDebugLogs() {
  debugLogs = [];
  emitChange();
}

/**
 * Returns the current debug log entries.
 */
export function getDebugLogs(): DebugLogEvent[] {
  return debugLogs;
}

/**
 * Formats all debug logs for copying to clipboard.
 */
export function formatAllDebugLogsForCopy(count?: number): string {
  return formatDebugLogs(debugLogs, count);
}

export function subscribeDebugLogs(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * React hook to subscribe to the persistent debug log store.
 */
export function useDebugLogs(): DebugLogEvent[] {
  return useSyncExternalStore(subscribeDebugLogs, getDebugLogs, () => []);
}
