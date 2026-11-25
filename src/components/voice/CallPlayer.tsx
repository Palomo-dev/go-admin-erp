'use client';

/**
 * CallPlayer — Reproductor de grabaciones de llamadas.
 * GO Admin ERP — Fase 3 (Telefonía CRM) · Fase 4 (seek desde la transcripción).
 *
 * Obtiene las grabaciones vía /api/crm/calls/[id] y reproduce el audio desde
 * /api/voice/recording/[id]/stream. Props:
 *  - `seekToMs`: al cambiar, salta a ese instante y reproduce (clic en un segmento).
 *  - `onTimeUpdate(ms)`: posición actual (resalta el segmento activo).
 *  - `variant`: `icon` (fila del timeline), `full` (barra de progreso + tiempos)
 *    u `onda` (detalle de la llamada, Figma 1363:20: botón redondo, tiempo,
 *    onda, duración, velocidad y descarga).
 *  - `grabacionId` / `duracionMs`: si el contenedor ya los tiene, no se vuelve
 *    a pedir la llamada para empezar a sonar y la duración se ve antes de dar play.
 *  - `consentMethod` (F-4, ronda 7): `call_consents.method` de la acta; con
 *    `unverified_announcement` se muestra «Aviso no acreditado» junto al
 *    reproductor. Al cargar el detalle se relee de `consents` (la acta manda).
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Play, Pause, Loader2, AlertCircle, Download } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/utils/Utils';
import { UnverifiedConsentBadge, isUnverifiedConsent } from './ConsentBadge';
import { formatoReloj, velocidadSiguiente } from './detalle/llamadaDetalleLogica';
import { OndaGrabacion } from './detalle/OndaGrabacion';

interface CallPlayerProps {
  callId: string;
  recordingEnabled: boolean;
  className?: string;
  /** Instante (ms) al que saltar; cada cambio de valor dispara el seek. */
  seekToMs?: number | null;
  onTimeUpdate?: (ms: number) => void;
  variant?: 'icon' | 'full' | 'onda';
  /** `call_consents.method` de la acta de grabación (ver cabecera, F-4). */
  consentMethod?: string | null;
  /** Grabación ya conocida por el contenedor (evita pedir la llamada). */
  grabacionId?: string | null;
  /** Duración conocida (ms) para pintarla antes de reproducir. */
  duracionMs?: number | null;
  /** Barras de la onda (variante `onda`). */
  barras?: number;
}

type Recording = { id: string; status: string };
type Consent = { consent_type: string; method: string };

const urlAudio = (id: string) => `/api/voice/recording/${encodeURIComponent(id)}/stream`;

export function CallPlayer(props: CallPlayerProps) {
  const { callId, recordingEnabled, className, seekToMs, onTimeUpdate, variant = 'icon', consentMethod = null, grabacionId = null, duracionMs = null, barras = 48 } = props;
  const t = useTranslations('crm.llamadas.reproductor');
  const { toast } = useToast();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [recordings, setRecordings] = useState<Recording[]>(grabacionId ? [{ id: grabacionId, status: 'ready' }] : []);
  /** La acta leída del detalle manda sobre la prop (F-4). */
  const [fetchedMethod, setFetchedMethod] = useState<string | null>(null);
  const unverified = isUnverifiedConsent(fetchedMethod ?? consentMethod);
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [fetched, setFetched] = useState(!!grabacionId);
  const [currentMs, setCurrentMs] = useState(0);
  const [durationMs, setDurationMs] = useState(duracionMs ?? 0);
  const [velocidad, setVelocidad] = useState(1);
  const pendingSeek = useRef<number | null>(null);

  const fetchRecordings = useCallback(async (): Promise<Recording[]> => {
    if (fetched) return recordings;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/crm/calls/${callId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const recs: Recording[] = (data?.data?.recordings ?? []).filter((r: Recording) => r.status === 'ready' || r.status === 'completed');
      const acta = ((data?.data?.consents ?? []) as Consent[]).find((c) => c.consent_type === 'recording');
      setFetchedMethod(acta?.method ?? null);
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
      toast({ title: t('sinGrabacion'), description: t('sinGrabacionDetalle'), variant: 'destructive' });
      return null;
    }
    const audio = new Audio(urlAudio(recs[0].id));
    audio.preload = 'metadata';
    audio.playbackRate = velocidad;
    audio.onplay = () => setIsPlaying(true);
    audio.onpause = () => setIsPlaying(false);
    audio.onended = () => setIsPlaying(false);
    audio.onloadedmetadata = () => {
      if (Number.isFinite(audio.duration)) setDurationMs(audio.duration * 1000);
    };
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
  }, [fetchRecordings, onTimeUpdate, toast, t, velocidad]);

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

  const irA = useCallback(
    async (ms: number) => {
      const audio = await ensureAudio();
      if (!audio) return;
      const destino = Math.max(0, durationMs ? Math.min(ms, durationMs) : ms);
      audio.currentTime = destino / 1000;
      setCurrentMs(destino);
      onTimeUpdate?.(destino);
    },
    [ensureAudio, durationMs, onTimeUpdate],
  );

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
      <span className="text-xs text-fg-muted" title={t('deshabilitada')}>
        —
      </span>
    );
  }
  if (hasError) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-danger-text" title={t('errorCargar')}>
        <AlertCircle aria-hidden="true" className="size-3.5" /> {variant !== 'icon' && t('noDisponible')}
      </span>
    );
  }

  const etiquetaBoton = isPlaying ? t('pausar') : t('reproducir');

  if (variant === 'onda') {
    const cambiarVelocidad = () => {
      const v = velocidadSiguiente(velocidad);
      setVelocidad(v);
      if (audioRef.current) audioRef.current.playbackRate = v;
    };
    const idGrabacion = recordings[0]?.id ?? grabacionId;
    return (
      <div className={cn('flex flex-col gap-2', className)}>
        {unverified && <UnverifiedConsentBadge method="unverified_announcement" variant="full" />}
        <div className={cn('flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2.5', unverified && 'border-line-warning')}>
          <button
            type="button"
            onClick={isPlaying ? pause : play}
            disabled={isLoading}
            aria-label={etiquetaBoton}
            title={etiquetaBoton}
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-action text-fg-on-brand transition-colors hover:bg-brand-action-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-60"
          >
            {isLoading ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : isPlaying ? <Pause aria-hidden="true" className="size-4" fill="currentColor" /> : <Play aria-hidden="true" className="size-4" fill="currentColor" />}
          </button>
          <span className="w-11 shrink-0 text-[13px] tabular-nums text-fg-secondary">{formatoReloj(currentMs)}</span>
          <OndaGrabacion
            semilla={callId}
            barras={barras}
            actualMs={currentMs}
            duracionMs={durationMs}
            etiqueta={t('posicion')}
            onIr={(ms) => void irA(ms)}
            onPreparar={() => void ensureAudio()}
          />
          <span className="hidden shrink-0 text-[13px] tabular-nums text-fg-secondary sm:inline">{durationMs ? formatoReloj(durationMs) : '--:--'}</span>
          <button
            type="button"
            onClick={cambiarVelocidad}
            aria-label={t('velocidad', { v: velocidad })}
            className="h-7 shrink-0 rounded-md bg-subtle px-2 text-xs font-medium tabular-nums text-fg-secondary hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            {velocidad}x
          </button>
          {idGrabacion && (
            <a
              href={urlAudio(idGrabacion)}
              target="_blank"
              rel="noopener noreferrer"
              download
              aria-label={t('descargar')}
              title={t('descargar')}
              className="flex size-8 shrink-0 items-center justify-center rounded-md text-fg-secondary hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Download aria-hidden="true" className="size-4" />
            </a>
          )}
        </div>
      </div>
    );
  }

  const button = (
    <button
      type="button"
      onClick={isPlaying ? pause : play}
      disabled={isLoading}
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-md text-fg-secondary transition-colors hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60',
        variant === 'icon' && className,
      )}
      title={etiquetaBoton}
      aria-label={etiquetaBoton}
    >
      {isLoading ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : isPlaying ? <Pause aria-hidden="true" className="size-4 text-brand" /> : <Play aria-hidden="true" className="size-4" />}
    </button>
  );

  // F-4: el distintivo va pegado al reproductor, con icono + texto (nunca solo color).
  if (variant === 'icon') {
    return unverified ? (
      <span className="inline-flex items-center gap-1">
        {button}
        <UnverifiedConsentBadge method="unverified_announcement" />
      </span>
    ) : (
      button
    );
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-3 rounded-md border border-line bg-surface px-2 py-1.5', unverified && 'border-line-warning', className)}>
      {unverified && <UnverifiedConsentBadge method="unverified_announcement" variant="full" className="basis-full" />}
      {button}
      <input
        type="range"
        min={0}
        max={Math.max(1, Math.round(durationMs))}
        value={Math.round(currentMs)}
        aria-label={t('posicion')}
        onChange={(e) => {
          const ms = Number(e.target.value);
          setCurrentMs(ms);
          if (audioRef.current) audioRef.current.currentTime = ms / 1000;
        }}
        onMouseDown={() => {
          if (!audioRef.current) void ensureAudio();
        }}
        className="h-1.5 flex-1 cursor-pointer accent-brand"
      />
      <span className="w-[84px] text-right text-xs tabular-nums text-fg-muted">
        {formatoReloj(currentMs)} / {durationMs ? formatoReloj(durationMs) : '--:--'}
      </span>
    </div>
  );
}
