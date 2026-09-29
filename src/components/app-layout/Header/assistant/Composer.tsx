'use client';

/**
 * GO Asistente — composer (Figma `AsistenteComposer` 664:16404, Estado =
 * vacío / escribiendo / con adjunto / grabando / respondiendo / sin créditos).
 *
 * - **Caja** en Fondo de lienzo con borde fuerte y radio 16: el texto arriba
 *   (1 a 8 líneas; Enter envía, Shift+Enter salta; en móvil Enter siempre
 *   salta) y debajo la fila de herramientas: adjuntar, dictar, el **chip de la
 *   página** que el asistente recibe como contexto y, a la derecha, enviar
 *   (Tinte si está vacío, Azul acción con texto, Detener mientras responde).
 * - **Adjuntar**: botón, arrastrar y soltar sobre todo el panel y pegar una
 *   captura.
 * - **Dictar**: el texto queda en el composer para revisarlo ANTES de enviar.
 * - **Pie**: el atajo que aplica en cada estado y el saldo discreto (gris,
 *   ámbar por debajo de 50, rojo en 0).
 *
 * Mejoras sobre el Figma:
 * - La forma de onda es el **nivel real del micrófono** (AnalyserNode), no un
 *   dibujo: si no se mueve, el micrófono no está captando, y se ve antes de
 *   gastar un crédito en transcribir silencio.
 * - **Esc cancela la grabación** sin transcribir (y sin cobrar).
 * - El chip de contexto **se puede quitar** con un toque (lo que dice la
 *   descripción del componente en Figma) y lo anuncia con `aria-pressed`.
 * - Sin créditos, la caja se bloquea con el motivo en el placeholder.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Coins, FileText, ImageIcon, Loader2, MapPin, Mic, Paperclip, Send, Square, X } from 'lucide-react';
import { cn } from '@/utils/Utils';
import type { AssistantCreditsState } from '@/lib/ai/assistant/clientTypes';

export type ComposerAttachment = import('@/lib/ai/assistant/attachments').AssistantAttachment;

interface ComposerProps {
  focusRequest?: number;
  value: string;
  onChange(value: string): void;
  onSubmit(): void;
  onStop(): void;
  isLoading: boolean;
  attachments: ComposerAttachment[];
  onAttach(files: File[]): void;
  onRemoveAttachment(id: string): void;
  /** `false` mientras F4 no exista: se avisa en vez de aceptar en silencio. */
  attachmentsEnabled: boolean;
  disabled?: boolean;
  /** Saldo de créditos de IA de la organización, para el pie. `null` = aún no se sabe. */
  credits?: AssistantCreditsState | null;
  /** Chip «dónde estás»: la página que el asistente recibe como contexto. */
  contexto?: { pagina: string | null; activo: boolean; onAlternar(): void } | null;
}

const MAX_ROWS = 8;
const LINE_HEIGHT = 20;
const MAX_CHARS = 8000;
const BARRAS = 14;

/** Tipos que el asistente sabe leer. Se filtra ya para no dar falsas esperanzas. */
const ACCEPTED = 'image/*,application/pdf,.csv,.xlsx,.xls';

export default function Composer({
  value,
  onChange,
  onSubmit,
  onStop,
  isLoading,
  attachments,
  onAttach,
  onRemoveAttachment,
  attachmentsEnabled,
  disabled = false,
  focusRequest = 0,
  credits = null,
  contexto = null,
}: ComposerProps) {
  const t = useTranslations('asistente.composer');
  const locale = useLocale();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  /** Aviso bajo el composer tras una nota de voz (baja confianza, error). */
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [niveles, setNiveles] = useState<number[]>(() => Array(BARRAS).fill(0.15));
  const [isMobile, setIsMobile] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cancelarRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const sinCreditos = credits?.level === 'empty';
  const bloqueado = disabled || sinCreditos;

  useEffect(() => {
    if (focusRequest > 0) textareaRef.current?.focus();
  }, [focusRequest]);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  /** Ajusta la altura al contenido, hasta 8 líneas. */
  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_ROWS * LINE_HEIGHT + 4)}px`;
  }, []);

  useEffect(() => {
    autoResize();
  }, [value, autoResize]);

  useEffect(() => {
    if (!isRecording) return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [isRecording]);

  useEffect(
    () => () => {
      recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
      void audioCtxRef.current?.close().catch(() => undefined);
    },
    []
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // En móvil `Enter` siempre salta de línea: el teclado virtual no distingue
    // Shift de forma fiable y enviar sin querer es peor que un salto de más.
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !isMobile) {
      e.preventDefault();
      if ((value.trim() || attachments.length) && !isLoading && !bloqueado) onSubmit();
    }
  };

  /** Pegar una captura: el caso más común en soporte. */
  const handlePaste = (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData.files);
    if (files.length > 0) {
      e.preventDefault();
      onAttach(files);
    }
  };

  /** Nivel real del micrófono para la forma de onda. Si el navegador no deja, se queda quieta. */
  const medirNivel = (stream: MediaStream) => {
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      audioCtxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const datos = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') return;
        analyser.getByteFrequencyData(datos);
        const paso = Math.max(1, Math.floor(datos.length / BARRAS));
        setNiveles(Array.from({ length: BARRAS }, (_, i) => Math.max(0.12, (datos[i * paso] ?? 0) / 255)));
        window.setTimeout(tick, 100);
      };
      tick();
    } catch {
      /* sin analizador: la grabación funciona igual */
    }
  };

  const cerrarAnalizador = () => {
    const ctx = audioCtxRef.current;
    audioCtxRef.current = null;
    void ctx?.close().catch(() => undefined);
    setNiveles(Array(BARRAS).fill(0.15));
  };

  const startRecording = async () => {
    setVoiceNote(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      cancelarRef.current = false;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        cerrarAnalizador();
        // Cancelada con Esc: no se transcribe, y por tanto no se cobra.
        if (cancelarRef.current) return;
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        if (blob.size === 0) return;

        setIsTranscribing(true);
        try {
          const form = new FormData();
          form.append('audio', blob, 'nota.webm');
          form.append('language', locale.slice(0, 2) || 'es');
          const res = await fetch('/api/ai-assistant/transcribe', { method: 'POST', body: form });
          const data = await res.json();
          if (res.ok && data.text) {
            // El texto entra en el composer, NO se envía solo: el usuario ve lo
            // que se entendió y lo corrige antes de mandarlo.
            onChange(value ? `${value} ${data.text}` : data.text);
            // §5.5.1: la confianza se enseña. Si el proveedor no está seguro,
            // se le pide al usuario que revise antes de enviar.
            const conf = typeof data.confidence === 'number' ? data.confidence : null;
            setVoiceNote(conf !== null && conf < 0.7 ? t('notaDudosa') : null);
            setTimeout(() => textareaRef.current?.focus(), 50);
          } else if (res.ok && !data.text) {
            setVoiceNote(t('notaVacia'));
          } else {
            console.error('Error transcribiendo:', data.error);
            setVoiceNote(typeof data.error === 'string' ? data.error : t('notaError'));
          }
        } catch (error) {
          console.error('Error transcribiendo:', error);
          setVoiceNote(t('notaError'));
        } finally {
          setIsTranscribing(false);
        }
      };
      recorder.start();
      recorderRef.current = recorder;
      setSeconds(0);
      setIsRecording(true);
      medirNivel(stream);
    } catch (error) {
      console.error('No se pudo acceder al micrófono:', error);
      setVoiceNote(t('sinMicrofono'));
    }
  };

  const stopRecording = (cancelar = false) => {
    cancelarRef.current = cancelar;
    recorderRef.current?.stop();
    recorderRef.current = null;
    setIsRecording(false);
  };

  const nearLimit = value.length > MAX_CHARS * 0.9;
  const hayContenido = value.trim().length > 0 || attachments.length > 0;
  const canSend = hayContenido && !isLoading && !bloqueado;
  const mmss = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

  const ayuda = isRecording
    ? t('ayudaGrabando')
    : isLoading
      ? t('ayudaRespondiendo')
      : sinCreditos
        ? t('ayudaSinCreditos')
        : isMobile
          ? t('ayudaMovil')
          : t('ayuda');

  const iconoBoton = 'h-8 w-8 shrink-0 flex items-center justify-center rounded-lg outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <div
      className="flex shrink-0 flex-col gap-2 border-t border-line bg-surface px-4 py-3"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && isRecording) {
          e.preventDefault();
          e.stopPropagation();
          stopRecording(true);
        }
      }}
    >
      {attachments.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={t('adjuntos')}>
          {attachments.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-1.5 rounded-lg border border-line bg-subtle py-1 pl-2 pr-1 text-xs"
            >
              {a.file.type.startsWith('image/') ? (
                <ImageIcon className="h-3 w-3 text-fg-muted" strokeWidth={1.5} aria-hidden="true" />
              ) : (
                <FileText className="h-3 w-3 text-fg-muted" strokeWidth={1.5} aria-hidden="true" />
              )}
              <span className="max-w-[160px] truncate text-fg-secondary">{a.file.name}</span>
              <button
                type="button"
                onClick={() => onRemoveAttachment(a.id)}
                className="rounded p-0.5 text-fg-muted outline-none hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-brand"
                aria-label={t('quitarAdjunto', { nombre: a.file.name })}
              >
                <X className="h-3 w-3" strokeWidth={1.5} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {attachments.length > 0 && !attachmentsEnabled && (
        <p className="text-[11px] text-warning-text">{t('adjuntosNoDisponibles')}</p>
      )}

      <div
        className={cn(
          'flex flex-col gap-2 rounded-2xl border bg-canvas pb-2 pl-3 pr-2 pt-2.5 transition-colors',
          'border-line-strong focus-within:border-brand',
          bloqueado && 'opacity-70'
        )}
      >
        {isRecording ? (
          <div className="flex min-h-5 items-center gap-2" aria-live="polite">
            <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-danger motion-reduce:animate-none" aria-hidden="true" />
            <span className="text-sm text-fg tabular-nums">{t('grabando', { tiempo: mmss })}</span>
            <span className="flex h-4 items-center gap-[3px]" aria-hidden="true">
              {niveles.map((nivel, i) => (
                <span key={i} className="w-[3px] rounded-full bg-brand" style={{ height: `${Math.round(nivel * 16)}px` }} />
              ))}
            </span>
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => {
              onChange(e.target.value.slice(0, MAX_CHARS));
              // En cuanto el usuario edita, el aviso de la nota de voz ya cumplió.
              if (voiceNote) setVoiceNote(null);
            }}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            rows={1}
            placeholder={isTranscribing ? t('transcribiendo') : sinCreditos ? t('placeholderSinCreditos') : t('placeholder')}
            disabled={isLoading || isTranscribing || bloqueado}
            aria-label={t('etiqueta')}
            className="max-h-[164px] w-full resize-none border-0 bg-transparent p-0 text-sm leading-5 text-fg outline-none placeholder:text-fg-muted disabled:cursor-not-allowed"
          />
        )}

        <div className="flex items-center gap-1">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPTED}
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length > 0) onAttach(files);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading || bloqueado || isRecording}
            className={cn(iconoBoton, 'text-fg-secondary hover:bg-hover hover:text-fg')}
            aria-label={t('adjuntar')}
            title={t('adjuntar')}
          >
            <Paperclip className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={isRecording ? () => stopRecording(false) : startRecording}
            disabled={isLoading || isTranscribing || bloqueado}
            className={cn(iconoBoton, isRecording ? 'text-danger-text hover:bg-danger-subtle' : 'text-fg-secondary hover:bg-hover hover:text-fg')}
            aria-label={isRecording ? t('detenerGrabacion') : t('dictar')}
            title={isRecording ? t('detenerGrabacion') : t('dictar')}
          >
            {isTranscribing ? (
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" strokeWidth={1.5} aria-hidden="true" />
            ) : isRecording ? (
              <Square className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
            ) : (
              <Mic className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
            )}
          </button>

          {contexto?.pagina && (
            <button
              type="button"
              onClick={contexto.onAlternar}
              aria-pressed={contexto.activo}
              title={contexto.activo ? t('contextoActivo', { pagina: contexto.pagina }) : t('contextoInactivo')}
              className={cn(
                'flex min-w-0 items-center gap-1 rounded-full border py-1 pl-1.5 pr-2 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand',
                contexto.activo
                  ? 'border-line bg-subtle text-fg-secondary hover:bg-hover'
                  : 'border-dashed border-line-strong bg-transparent text-fg-muted line-through hover:bg-hover'
              )}
            >
              <MapPin className="h-3 w-3 shrink-0" strokeWidth={1.5} aria-hidden="true" />
              <span className="truncate">{contexto.pagina}</span>
            </button>
          )}

          <div className="flex-1" />

          {/*
            Mientras responde, enviar se convierte en detener: una respuesta larga
            que arrancó mal no debería haber que aguantarla entera.
          */}
          <button
            type="button"
            onClick={isLoading ? onStop : onSubmit}
            disabled={!isLoading && !canSend}
            className={cn(
              iconoBoton,
              isLoading
                ? 'bg-fg text-surface hover:bg-fg/90'
                : hayContenido && !bloqueado
                  ? 'bg-brand-action text-fg-on-brand hover:bg-brand-action-hover'
                  : 'bg-brand-tint text-brand-action disabled:opacity-100'
            )}
            aria-label={isLoading ? t('detener') : t('enviar')}
            aria-keyshortcuts={isLoading ? 'Escape' : 'Enter'}
          >
            {isLoading ? (
              <Square className="h-3.5 w-3.5" strokeWidth={2} fill="currentColor" aria-hidden="true" />
            ) : (
              <Send className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1.5 px-1">
        {voiceNote ? (
          <p className="min-w-0 flex-1 text-xs font-medium text-warning-text" role="status">
            {voiceNote}
          </p>
        ) : (
          <p className="min-w-0 flex-1 truncate text-xs font-medium text-fg-muted">{ayuda}</p>
        )}
        {/* El contador solo aparece cerca del límite: antes es ruido. */}
        {nearLimit && (
          <p className="shrink-0 text-xs text-warning-text tabular-nums">
            {value.length.toLocaleString(locale)} / {MAX_CHARS.toLocaleString(locale)}
          </p>
        )}
        {/*
          El saldo, visible desde que se abre el panel. Antes solo aparecía al
          fallar un turno por falta de créditos: enterarse del saldo por el error
          es enterarse tarde. Gris normal, ámbar bajo, rojo en 0.
        */}
        {credits && (
          <p
            className={cn(
              'flex shrink-0 items-center gap-1 text-xs font-medium tabular-nums',
              credits.level === 'empty' ? 'text-danger-text' : credits.level === 'low' ? 'text-warning-text' : 'text-fg-muted'
            )}
          >
            <Coins className="h-3 w-3" strokeWidth={1.5} aria-hidden="true" />
            {t('creditos', { n: credits.credits })}
          </p>
        )}
      </div>
    </div>
  );
}
