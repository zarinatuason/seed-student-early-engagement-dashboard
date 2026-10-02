import { useEffect } from 'react';

const dirtyIds = new Set<string>();
const MESSAGE = 'You have unsaved changes. Leave without saving them?';
let lastUrl = typeof window !== 'undefined' ? window.location.href : '';

const guarding = () => dirtyIds.size > 0;
const onClick = (event: MouseEvent) => {
  if (!guarding()) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  const anchor = target.closest('a[href]') as HTMLAnchorElement | null;
  if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
  const dest = new URL(anchor.href, window.location.href);
  if (dest.origin !== window.location.origin || dest.pathname + dest.search === window.location.pathname + window.location.search) return;
  if (!window.confirm(MESSAGE)) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
};
const onBeforeUnload = (event: BeforeUnloadEvent) => {
  if (!guarding()) return;
  event.preventDefault();
  event.returnValue = '';
};
// Installed once at module import, so it is registered before wouter subscribes to popstate.
// Cancel: stop wouter ever seeing the event and put the URL back; the page (and draft) never unmounts.
const onPop = (event: PopStateEvent) => {
  if (!guarding()) {
    lastUrl = window.location.href;
    return;
  }
  if (window.confirm(MESSAGE)) {
    lastUrl = window.location.href;
    return;
  }
  event.stopImmediatePropagation();
  window.history.pushState(window.history.state, '', lastUrl);
};
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', onPop, true);
  document.addEventListener('click', onClick, true);
  window.addEventListener('beforeunload', onBeforeUnload);
}

/** Registers a form as holding unsaved changes: warns on link clicks, browser Back and unload. */
export function useDirtyGuard(id: string, dirty: boolean) {
  useEffect(() => {
    if (dirty) {
      dirtyIds.add(id);
      lastUrl = window.location.href;
    } else dirtyIds.delete(id);
    return () => {
      dirtyIds.delete(id);
    };
  }, [id, dirty]);
}

export const hasUnsavedChanges = () => dirtyIds.size > 0;
/** For session actions (start/resume/reset) which discard everything in the page. */
export const confirmDiscard = () => !hasUnsavedChanges() || window.confirm('You have unsaved changes on this page. Continue and discard them?');
