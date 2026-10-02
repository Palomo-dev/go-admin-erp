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
 *  - `consentMethod` (F-4, ronda 7): `call_consents.method` de la acta; con
 *    `unverified_announcement` se muestra «Aviso no acreditado» junto al
 *    reproductor. Al cargar el detalle se relee de `consents` (la acta manda).
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';
import { CallPlayerControls } from './CallPlayerControls';
import { useRecordingWaveform } from './useRecordingWaveform';
import { downloadCallRecording } from './recordingDownload';
import { useToast } from '@/components/ui/use-toast';
import { clampRecordingSeek } from './callDeepLink';
import { cn } from '@/utils/Utils';
import { UnverifiedConsentBadge, isUnverifiedConsent } from './ConsentBadge';

interface CallPlayerProps {
  callId: string;
  recordingEnabled: boolean;
  className?: string;
  /** Instante (ms) al que saltar; cada cambio de valor dispara el seek. */
  seekToMs?: number | null;
  seekVersion?: number;
  onTimeUpdate?: (ms: number) => void;
  variant?: 'icon' | 'full';
  /** `call_consents.method` de la acta de grabación (ver cabecera, F-4). */
  consentMethod?: string | null;
  etiqueta?: string;
  initialRecordings?: Recording[];
  initialConsents?: Consent[];
}

interface Recording {
  id: string;
  status: string;
  duration_seconds?: number | null;
}

interface Consent {
  consent_type: string;
  method: string;
}

export function CallPlayer({
  callId,
  recordingEnabled,
  className,
  seekToMs,
  seekVersion,
  onTimeUpdate,
  variant = 'icon',
  consentMethod = null,
  etiqueta,
  initialRecordings,
  initialConsents,
}: CallPlayerProps) {
  const { toast } = useToast();
  const t = useTranslations('crm.llamadas.ficha');
  const seed = initialRecordings?.filter((recording) => recording.status === 'ready' || recording.status === 'completed');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mounted = useRef(true);
  const [recordings, setRecordings] = useState<Recording[]>(seed ?? []);
  /** La acta leída del detalle manda sobre la prop (F-4). */
  const [fetchedMethod, setFetchedMethod] = useState<string | null>(initialConsents?.find((consent) => consent.consent_type === 'recording')?.method ?? null);
  const unverified = isUnverifiedConsent(fetchedMethod ?? consentMethod);
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [fetched, setFetched] = useState(initialRecordings !== undefined);
  const [currentMs, setCurrentMs] = useState(0);
  const [durationMs, setDurationMs] = useState((seed?.[0]?.duration_seconds ?? 0) * 1000);
  const [rate, setRate] = useState(1);
  const [waveRecording, setWaveRecording] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const peaks = useRecordingWaveform(variant === 'full' ? waveRecording : null);
  const pendingSeek = useRef<number | null>(null);
  const lastSeekVersion = useRef<number | undefined>(undefined);
  const lastRequestedSeek = useRef<number | null>(null);

  const fetchRecordings = useCallback(async (): Promise<Recording[]> => {
    if (fetched) return recordings;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/crm/calls/${callId}`);
      if (!res.ok) throw new Error('Error al obtener grabaciones');
      const data = await res.json();
      const recs: Recording[] = (data?.data?.recordings ?? []).filter(
        (r: Recording) => r.status === 'ready' || r.status === 'completed',
      );
      const acta = ((data?.data?.consents ?? []) as Consent[]).find(
        (c) => c.consent_type === 'recording',
      );
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
    if (!mounted.current) return null;
    if (audioRef.current) return audioRef.current;
    if (recs.length === 0) {
      toast({
        title: t('sinGrabacion'),
        description: t('sinGrabacionDescripcion'),
        variant: 'destructive',
      });
      return null;
    }
    const audio = new Audio(`/api/voice/recording/${recs[0].id}/stream`);
    audio.preload = 'metadata';
    audio.playbackRate = rate;
    setWaveRecording(recs[0].id);
    audio.onplay = () => setIsPlaying(true);
    audio.onpause = () => setIsPlaying(false);
    audio.onended = () => setIsPlaying(false);
    const applyPending = () => {
      const requested = pendingSeek.current;
      if (requested === null) return;
      const ms = clampRecordingSeek(requested, audio.duration);
      if (ms === null) return;
      audio.currentTime = ms / 1000;
      setCurrentMs(ms);
      onTimeUpdate?.(ms);
      pendingSeek.current = null;
      audio.play().catch(() => setHasError(true));
    };
    audio.onloadedmetadata = () => {
      setDurationMs(Number.isFinite(audio.duration) ? audio.duration * 1000 : 0);
      applyPending();
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
  }, [fetchRecordings, onTimeUpdate, toast, t, rate]);

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
    if (
      !recordingEnabled ||
      seekToMs === null ||
      seekToMs === undefined ||
      !Number.isFinite(seekToMs) ||
      seekToMs < 0 ||
      (seekToMs === lastRequestedSeek.current && seekVersion === lastSeekVersion.current)
    )
      return;
    lastRequestedSeek.current = seekToMs;
    lastSeekVersion.current = seekVersion;
    pendingSeek.current = seekToMs;
    (async () => {
      const audio = await ensureAudio();
      if (!audio) return;
      const ms = clampRecordingSeek(seekToMs, audio.duration);
      if (ms === null) return;
      audio.currentTime = ms / 1000;
      setCurrentMs(ms);
      onTimeUpdate?.(ms);
      pendingSeek.current = null;
      audio.play().catch(() => setHasError(true));
    })();
  }, [seekToMs, seekVersion, ensureAudio, recordingEnabled, onTimeUpdate]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      pendingSeek.current = null;
      lastRequestedSeek.current = null;
      if (audioRef.current) audioRef.current.onloadedmetadata = null;
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  if (!recordingEnabled) {
    return (
      <span className="text-xs text-fg-muted" title={t('grabacionDeshabilitada')}>
        {variant === 'full' ? t('sinGrabacion') : '—'}
      </span>
    );
  }
  if (hasError) {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs text-danger-text"
        title={t('errorGrabacion')}
      >
        <AlertCircle size={14} /> {variant === 'full' && t('sinGrabacion')}
      </span>
    );
  }

  const button = (
    <Button
      size={etiqueta && variant === 'icon' ? 'sm' : 'icon'}
      variant="ghost"
      onClick={isPlaying ? pause : play}
      disabled={isLoading}
      className={cn(variant === 'full' ? 'size-9 shrink-0 rounded-full bg-brand-action p-0 text-fg-on-brand hover:bg-brand-action-hover' : className)}
      title={isPlaying ? t('pausar') : t('reproducir')}
      aria-label={isPlaying ? t('pausar') : t('reproducir')}
    >
      {isLoading ? (
        <Loader2 size={16} className="animate-spin" />
      ) : isPlaying ? (
        <Pause size={16} className={variant === 'full' ? 'text-fg-on-brand' : 'text-brand'} />
      ) : (
        <Play size={16} className={variant === 'full' ? 'text-fg-on-brand' : 'text-fg-secondary'} />
      )}
      {etiqueta && variant === 'icon' && <span>{etiqueta}</span>}
    </Button>
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

  return <CallPlayerControls button={button} className={className} currentMs={currentMs} durationMs={durationMs} rate={rate} peaks={peaks}
    consent={unverified ? <UnverifiedConsentBadge method="unverified_announcement" variant="full" className="basis-full" /> : null}
    onSeek={(ms) => { setCurrentMs(ms); onTimeUpdate?.(ms); if (audioRef.current) audioRef.current.currentTime = ms / 1000; else { pendingSeek.current = ms; void ensureAudio(); } }}
    onRate={() => { const next = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1; setRate(next); if (audioRef.current) audioRef.current.playbackRate = next; }}
    downloading={downloading} onDownload={() => { setDownloading(true); void fetchRecordings().then(async (recs) => { if (!recs[0]) throw new Error('recording_unavailable'); await downloadCallRecording(recs[0].id); }).catch(() => toast({ title: t('errorDescargar'), variant: 'destructive' })).finally(() => { if (mounted.current) setDownloading(false); }); }} />;
}
