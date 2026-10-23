import { useSyncExternalStore } from 'react';
import { ContentMode } from './persona';

const STORAGE_KEY = 'sierra_content_mode';

let currentMode: ContentMode = (() => {
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem(STORAGE_KEY) as ContentMode;
    if (saved === 'sfw' || saved === 'mature') return saved;
  }
  return 'sfw';
})();

const listeners = new Set<() => void>();

function emitChange() {
  for (const listener of listeners) {
    try {
      listener();
    } catch (e) {
      console.error('[ContentModeStore] Listener error:', e);
    }
  }
}

/**
 * Gets the current active content mode ('sfw' | 'mature').
 */
export function getContentMode(): ContentMode {
  return currentMode;
}

/**
 * Updates the shared content mode, saving to localStorage and notifying all subscribers.
 */
export function setContentMode(mode: ContentMode) {
  if (currentMode === mode) return;
  currentMode = mode;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, mode);
  }
  emitChange();
}

/**
 * Subscribes to content mode updates.
 */
export function subscribeContentMode(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * React hook for shared, synchronized content mode across all screens.
 */
export function useContentMode(): [ContentMode, (mode: ContentMode) => void] {
  const mode: ContentMode = useSyncExternalStore(subscribeContentMode, getContentMode, () => 'sfw' as ContentMode);
  return [mode, setContentMode];
}
