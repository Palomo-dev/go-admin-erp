'use client';

/**
 * CallPlayer — Reproductor de grabaciones de llamadas.
 * GO Admin ERP — Fase 3 (Telefonía CRM)
 *
 * Recibe el ID de una llamada, obtiene sus grabaciones vía
 * /api/crm/calls/[id] y reproduce el audio usando el endpoint
 * /api/voice/recording/[id]/stream.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';

interface CallPlayerProps {
  /** ID de la llamada. */
  callId: string;
  /** Si la llamada tiene grabación habilitada. */
  recordingEnabled: boolean;
  /** Clase adicional. */
  className?: string;
}

interface Recording {
  id: string;
  status: string;
}

export function CallPlayer({ callId, recordingEnabled, className }: CallPlayerProps) {
  const { toast } = useToast();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [fetched, setFetched] = useState(false);

  const fetchRecordings = useCallback(async () => {
    if (fetched || isLoading) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/crm/calls/${callId}`);
      if (!res.ok) throw new Error('Error al obtener grabaciones');
      const data = await res.json();
      const recs = data?.data?.recordings ?? [];
      setRecordings(recs);
      setFetched(true);
    } catch (err) {
      console.error('[CallPlayer] Error:', err);
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }, [callId, fetched, isLoading]);

  const handlePlay = async () => {
    if (!fetched) {
      await fetchRecordings();
    }

    // Usar recordings del state o esperar al fetch
    const recs = recordings.length > 0 ? recordings : [];
    if (recs.length === 0 && !fetched) {
      // Re-fetch síncrono
      try {
        const res = await fetch(`/api/crm/calls/${callId}`);
        const data = await res.json();
        const fetchedRecs = data?.data?.recordings ?? [];
        setRecordings(fetchedRecs);
        setFetched(true);
        if (fetchedRecs.length === 0) {
          toast({
            title: 'Sin grabación',
            description: 'Esta llamada no tiene grabaciones disponibles',
            variant: 'destructive',
          });
          return;
        }
        playRecording(fetchedRecs[0].id);
      } catch {
        setHasError(true);
      }
      return;
    }

    if (recordings.length === 0) {
      toast({
        title: 'Sin grabación',
        description: 'Esta llamada no tiene grabaciones disponibles',
        variant: 'destructive',
      });
      return;
    }

    playRecording(recordings[0].id);
  };

  const playRecording = (recordingId: string) => {
    if (audioRef.current) {
      audioRef.current.pause();
    }

    const audio = new Audio(`/api/voice/recording/${recordingId}/stream`);
    audioRef.current = audio;

    audio.onplay = () => setIsPlaying(true);
    audio.onpause = () => setIsPlaying(false);
    audio.onended = () => setIsPlaying(false);
    audio.onerror = () => {
      setIsPlaying(false);
      setHasError(true);
    };

    audio.play().catch((err) => {
      console.error('[CallPlayer] Error reproduciendo:', err);
      setIsPlaying(false);
      setHasError(true);
    });
  };

  const handlePause = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  };

  // Cleanup al desmontar
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  if (!recordingEnabled) {
    return (
      <span className="text-xs text-gray-400 dark:text-gray-600" title="Grabación deshabilitada">
        —
      </span>
    );
  }

  if (isLoading) {
    return (
      <Button size="icon" variant="ghost" disabled className={className}>
        <Loader2 size={16} className="animate-spin" />
      </Button>
    );
  }

  if (hasError) {
    return (
      <span className="inline-flex items-center text-xs text-red-500 dark:text-red-400" title="Error al cargar grabación">
        <AlertCircle size={14} />
      </span>
    );
  }

  return (
    <Button
      size="icon"
      variant="ghost"
      onClick={isPlaying ? handlePause : handlePlay}
      className={className}
      title={isPlaying ? 'Pausar grabación' : 'Reproducir grabación'}
      aria-label={isPlaying ? 'Pausar grabación' : 'Reproducir grabación'}
    >
      {isPlaying ? (
        <Pause size={16} className="text-blue-600 dark:text-blue-400" />
      ) : (
        <Play size={16} className="text-gray-600 dark:text-gray-300" />
      )}
    </Button>
  );
}
