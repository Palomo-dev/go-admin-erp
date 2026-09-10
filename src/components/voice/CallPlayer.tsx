'use client';

/**
 * CallPlayer — Reproductor de grabaciones de llamadas.
 * GO Admin ERP — Fase 3 (Telefonía CRM) · Fase 4 (seek desde la transcripción).
 *
 * Obtiene las grabaciones vía /api/crm/calls/[id] y reproduce el audio desde
 * /api/voice/recording/[id]/stream. Props nuevas F4:
 *  - `seekToMs`: al cambiar, salta a ese instante y reproduce (clic en un segmento).
 *  - `onTimeUpdate(ms)`: posición actual (resalta el segmento activo).
 *  - `variant='full'`: barra de progreso + tiempos (fila expandida).
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/utils/Utils';

interface CallPlayerProps {
  callId: string;
  recordingEnabled: boolean;
  className?: string;
  /** Instante (ms) al que saltar; cada cambio de valor dispara el seek. */
  seekToMs?: number | null;
  onTimeUpdate?: (ms: number) => void;
  variant?: 'icon' | 'full';
}

interface Recording {
  id: string;
  status: string;
}

function fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function CallPlayer({ callId, recordingEnabled, className, seekToMs, onTimeUpdate, variant = 'icon' }: CallPlayerProps) {
  const { toast } = useToast();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const pendingSeek = useRef<number | null>(null);

  const fetchRecordings = useCallback(async (): Promise<Recording[]> => {
    if (fetched) return recordings;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/crm/calls/${callId}`);
      if (!res.ok) throw new Error('Error al obtener grabaciones');
      const data = await res.json();
      const recs: Recording[] = (data?.data?.recordings ?? []).filter((r: Recording) => r.status === 'ready' || r.status === 'completed');
      setRecordings(recs);
      setFetched(true);
      return recs;
    } catch (err) {
      console.error('[CallPlayer] Error:', err);
      setHasError(true);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [callId, fetched, recordings]);

  const ensureAudio = useCallback(async (): Promise<HTMLAudioElement | null> => {
    if (audioRef.current) return audioRef.current;
    const recs = await fetchRecordings();
    if (recs.length === 0) {
      toast({ title: 'Sin grabación', description: 'Esta llamada no tiene grabaciones disponibles', variant: 'destructive' });
      return null;
    }
    const audio = new Audio(`/api/voice/recording/${recs[0].id}/stream`);
    audio.preload = 'metadata';
    audio.onplay = () => setIsPlaying(true);
    audio.onpause = () => setIsPlaying(false);
    audio.onended = () => setIsPlaying(false);
    audio.onloadedmetadata = () => setDurationMs(Number.isFinite(audio.duration) ? audio.duration * 1000 : 0);
    audio.ontimeupdate = () => {
      const ms = audio.currentTime * 1000;
      setCurrentMs(ms);
      onTimeUpdate?.(ms);
    };
    audio.onerror = () => {
      setIsPlaying(false);
      setHasError(true);
    };
    audioRef.current = audio;
    return audio;
  }, [fetchRecordings, onTimeUpdate, toast]);

  const play = useCallback(async () => {
    const audio = await ensureAudio();
    if (!audio) return;
    audio.play().catch((err) => {
      console.error('[CallPlayer] Error reproduciendo:', err);
      setIsPlaying(false);
      setHasError(true);
    });
  }, [ensureAudio]);

  const pause = () => {
    audioRef.current?.pause();
    setIsPlaying(false);
  };

  // Seek externo (clic en segmento de la transcripción)
  useEffect(() => {
    if (seekToMs === null || seekToMs === undefined || seekToMs === pendingSeek.current) return;
    pendingSeek.current = seekToMs;
    (async () => {
      const audio = await ensureAudio();
      if (!audio) return;
      audio.currentTime = Math.max(0, seekToMs / 1000);
      setCurrentMs(seekToMs);
      audio.play().catch(() => setHasError(true));
    })();
  }, [seekToMs, ensureAudio]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  if (!recordingEnabled) {
    return (
      <span className="text-xs text-gray-400 dark:text-gray-600" title="Grabación deshabilitada">
        —
      </span>
    );
  }
  if (hasError) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-red-500 dark:text-red-400" title="Error al cargar grabación">
        <AlertCircle size={14} /> {variant === 'full' && 'Grabación no disponible'}
      </span>
    );
  }

  const button = (
    <Button
      size="icon"
      variant="ghost"
      onClick={isPlaying ? pause : play}
      disabled={isLoading}
      className={cn(variant === 'icon' && className)}
      title={isPlaying ? 'Pausar grabación' : 'Reproducir grabación'}
      aria-label={isPlaying ? 'Pausar grabación' : 'Reproducir grabación'}
    >
      {isLoading ? <Loader2 size={16} className="animate-spin" /> : isPlaying ? <Pause size={16} className="text-blue-600 dark:text-blue-400" /> : <Play size={16} className="text-gray-600 dark:text-gray-300" />}
    </Button>
  );

  if (variant === 'icon') return button;

  const pct = durationMs > 0 ? Math.min(100, (currentMs / durationMs) * 100) : 0;
  return (
    <div className={cn('flex items-center gap-3 rounded-md border border-gray-200 bg-white px-2 py-1.5 dark:border-gray-700 dark:bg-gray-800', className)}>
      {button}
      <input
        type="range"
        min={0}
        max={Math.max(1, Math.round(durationMs))}
        value={Math.round(currentMs)}
        aria-label="Posición de la grabación"
        onChange={(e) => {
          const ms = Number(e.target.value);
          setCurrentMs(ms);
          if (audioRef.current) audioRef.current.currentTime = ms / 1000;
        }}
        onMouseDown={() => { if (!audioRef.current) void ensureAudio(); }}
        className="h-1.5 flex-1 cursor-pointer accent-blue-600"
        style={{ backgroundSize: `${pct}% 100%` }}
      />
      <span className="w-[84px] text-right text-xs tabular-nums text-gray-500 dark:text-gray-400">
        {fmt(currentMs)} / {durationMs ? fmt(durationMs) : '--:--'}
      </span>
    </div>
  );
}
