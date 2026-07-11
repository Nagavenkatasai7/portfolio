'use client';
// Reusable unsaved-changes guard for the admin editors (Composer, EditForm,
// XStudio, NewsletterStudio). While `dirty` is true it attaches a `beforeunload`
// listener so a tab close, reload, or hard navigation (the Cancel/Back links are
// plain <a href> full navigations) triggers the browser's native "Leave site?"
// prompt — protecting long, unsaved writing from a misclick. The listener is
// removed the moment `dirty` goes false (e.g. after a successful save), so it
// never nags once there is nothing to lose.
import { useEffect } from 'react';

export function useUnsavedGuard(dirty) {
  useEffect(() => {
    if (!dirty) return undefined;
    const handler = (e) => {
      // The modern + legacy incantation required to trigger the native prompt.
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
}
