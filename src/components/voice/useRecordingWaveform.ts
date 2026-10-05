'use client';
import { useEffect, useState } from 'react';

/** La onda sale del audio real. Si no se puede decodificar se muestra sólo el progreso. */
export function useRecordingWaveform(recordingId: string | null) {
  const [peaks, setPeaks] = useState<number[]>([]);
  useEffect(() => {
    const abort = new AbortController();
    setPeaks([]);
    if (!recordingId || typeof AudioContext === 'undefined') return;
    const decoder = new AudioContext();
    void fetch(`/api/voice/recording/${recordingId}/stream`, { signal: abort.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('recording_unavailable');
        const buffer = await decoder.decodeAudioData(await response.arrayBuffer());
        const samples = buffer.getChannelData(0);
        const result = Array.from({ length: 80 }, (_, index) => {
          const start = Math.floor(index * samples.length / 80), end = Math.floor((index + 1) * samples.length / 80);
          let peak = 0;
          for (let sample = start; sample < end; sample++) peak = Math.max(peak, Math.abs(samples[sample]));
          return peak;
        });
        const maximum = Math.max(...result, 0.001);
        if (!abort.signal.aborted) setPeaks(result.map((peak) => peak / maximum));
      }).catch(() => { /* El reproductor nativo sigue disponible sin onda. */ })
      .finally(() => { void decoder.close().catch(() => undefined); });
    return () => { abort.abort(); void decoder.close().catch(() => undefined); };
  }, [recordingId]);
  return peaks;
}
