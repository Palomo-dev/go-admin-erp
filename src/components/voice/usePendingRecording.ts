'use client';

import { useCallback, useEffect, useState } from 'react';

export interface PendingRecordingAsset {
  id: string;
  status: string;
  duration_seconds?: number | null;
}

/** Lee audio pendiente acreditado por el caller; no crea ni reproduce audio. */
export function usePendingRecording(
  callId: string,
  enabled: boolean,
  onReady: (recordings: PendingRecordingAsset[]) => void,
) {
  const [revision, setRevision] = useState(0);
  const [stopped, setStopped] = useState(false);
  const refresh = useCallback(() => setRevision(value => value + 1), []);

  useEffect(() => {
    if (!enabled) return;
    const abort = new AbortController();
    let active = true;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = setTimeout(() => {
      active = false;
      abort.abort();
      if (timer) clearTimeout(timer);
      setStopped(true);
    }, 5 * 60 * 1000);
    setStopped(false);

    const read = async () => {
      attempts += 1;
      let retry = true;
      try {
        const response = await fetch(`/api/crm/calls/${callId}`, { signal: abort.signal });
        if ([401, 403, 404].includes(response.status)) {
          retry = false;
          if (active) setStopped(true);
          return;
        }
        if (!response.ok) return;
        const json = await response.json();
        if (!active || abort.signal.aborted || json.data?.id !== callId) return;
        const rows: PendingRecordingAsset[] = json.data.recordings ?? [];
        const ready = rows.filter(entry => ['ready', 'completed'].includes(entry.status));
        if (ready.length) { retry = false; onReady(ready); }
        else if (!rows.some(entry => entry.status === 'processing')) {
          retry = false;
          setStopped(true);
        }
      } catch { /* Reintenta la lectura sin crear motores de audio. */ }
      finally {
        if (active && !abort.signal.aborted) {
          if (attempts >= 60) { retry = false; setStopped(true); }
          if (retry) timer = setTimeout(read, 5000);
        }
      }
    };
    const changed = () => {
      active = false;
      abort.abort();
      if (timer) clearTimeout(timer);
      clearTimeout(deadline);
    };
    window.addEventListener('organization-changed', changed);
    timer = setTimeout(read, 5000);
    return () => { changed(); window.removeEventListener('organization-changed', changed); };
  }, [callId, enabled, revision, onReady]);

  return { stopped, refresh };
}
