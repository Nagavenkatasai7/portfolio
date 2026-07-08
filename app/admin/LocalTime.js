'use client';
// Renders the viewer's LOCAL time for a UTC timestamp. Server components can't
// know the admin's timezone, so this hydrates client-side. Before hydration it
// renders nothing (the UTC value sits beside it server-side), avoiding any
// hydration mismatch.
import { useEffect, useState } from 'react';

export default function LocalTime({ iso }) {
  const [local, setLocal] = useState('');
  useEffect(() => {
    if (!iso) return;
    try {
      setLocal(new Date(iso).toLocaleString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      }));
    } catch { /* leave blank */ }
  }, [iso]);
  if (!local) return null;
  return <span className="local">{local} local</span>;
}
