'use client';

import * as React from 'react';
import { Clock, Lock, Mic, Paperclip, Send, Smile, Sparkles, Square, X, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { clasesBoton } from '@/components/kit';
import { cn } from '@/utils/Utils';
import {
  EMOJIS_FRECUENTES,
  duracionGrabacion,
  puedeEnviar,
  puedeEscribir,
  respuestasParaTexto,
  type EstadoComposer,
  type ModoComposer,
  type RespuestaRapidaComposer,
} from './composerLogica';

export type { EstadoComposer, ModoComposer, RespuestaRapidaComposer } from './composerLogica';

export interface EnvioComposer {
  texto?: string;
  archivo?: File | null;
  esAudio?: boolean;
}

export interface ComposerChatProps {
  modo: ModoComposer;
  onModoChange: (modo: ModoComposer) => void;
  estado: EstadoComposer;
  /** Responder al cliente (texto, archivo o nota de voz). Lanza si falla. */
  onEnviar: (envio: EnvioComposer) => Promise<void>;
  /** Guardar una nota interna. Lanza si falla. */
  onGuardarNota: (texto: string) => Promise<void>;
  onReabrir?: () => void;
  onElegirPlantilla?: () => void;
  /** Pide a la IA una respuesta sugerida; devuelve el texto o `null`. */
  onSugerirIA?: () => Promise<string | null>;
  respuestasRapidas?: readonly RespuestaRapidaComposer[];
  /** Se avisa al usar una respuesta rápida (para contar su uso). */
  onUsarRespuestaRapida?: (id: string) => void;
  /**
   * Texto que otra parte de la pantalla pone en la caja («Usar» en la pestaña
   * IA). Cambia `clave` para volver a ponerlo.
   */
  insertar?: { texto: string; clave: number } | null;
  /** Móvil: textos cortos («Sugerir con IA»). */
  compacto?: boolean;
  className?: string;
}

/**
 * Barra para escribir del Chat (Figma 91-chat-00): «Responder» / «Nota
 * interna», adjuntos, emojis, respuestas rápidas con «/», audio y «Sugerir
 * respuesta con IA». Estados: conversación cerrada (Reabrir) y ventana de 24 h
 * de WhatsApp vencida (Elegir plantilla). No sabe CÓMO se envía: eso lo decide
 * `enviarMensajeConversacion` en quien la usa.
 */
export function ComposerChat({
  modo,
  onModoChange,
  estado,
  onEnviar,
  onGuardarNota,
  onReabrir,
  onElegirPlantilla,
  onSugerirIA,
  respuestasRapidas = [],
  onUsarRespuestaRapida,
  insertar,
  compacto = false,
  className,
}: ComposerChatProps) {
  const t = useTranslations('chatUi.composer');
  const [texto, setTexto] = React.useState('');
  const [ocupado, setOcupado] = React.useState(false);
  const [sugiriendo, setSugiriendo] = React.useState(false);
  const [emojis, setEmojis] = React.useState(false);
  const [grabando, setGrabando] = React.useState(false);
  const [segundos, setSegundos] = React.useState(0);
  const [indiceRapida, setIndiceRapida] = React.useState(0);
  const caja = React.useRef<HTMLTextAreaElement>(null);
  const archivoRef = React.useRef<HTMLInputElement>(null);
  const grabadora = React.useRef<MediaRecorder | null>(null);
  const trozos = React.useRef<Blob[]>([]);
  const descartar = React.useRef(false);
  const reloj = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const escribible = puedeEscribir(modo, estado);
  const rapidas = modo === 'responder' ? respuestasParaTexto(respuestasRapidas, texto) : null;
  const esNota = modo === 'nota';

  React.useEffect(() => {
    if (!insertar) return;
    setTexto(insertar.texto);
    caja.current?.focus();
  }, [insertar]);

  React.useEffect(() => setIndiceRapida(0), [texto]);

  React.useEffect(
    () => () => {
      if (reloj.current) clearInterval(reloj.current);
    },
    [],
  );

  const ajustarAlto = () => {
    const el = caja.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };
  React.useLayoutEffect(ajustarAlto, [texto]);

  const enviar = async () => {
    if (!puedeEnviar(texto, modo, estado, ocupado)) return;
    setOcupado(true);
    try {
      if (esNota) await onGuardarNota(texto.trim());
      else await onEnviar({ texto: texto.trim() });
      setTexto('');
    } catch {
      // Quien llama avisa del error; el texto se conserva para reintentar.
    } finally {
      setOcupado(false);
    }
  };

  const usarRapida = (r: RespuestaRapidaComposer) => {
    setTexto(r.content);
    onUsarRespuestaRapida?.(r.id);
    caja.current?.focus();
  };

  const alTeclear = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (rapidas && rapidas.length > 0) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const d = e.key === 'ArrowDown' ? 1 : -1;
        setIndiceRapida((i) => (i + d + rapidas.length) % rapidas.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        usarRapida(rapidas[Math.min(indiceRapida, rapidas.length - 1)]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setTexto('');
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void enviar();
    }
  };

  const alElegirArchivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo || esNota) return;
    setOcupado(true);
    try {
      await onEnviar({ archivo, texto: texto.trim() || undefined });
      setTexto('');
    } catch {
      /* aviso en quien llama */
    } finally {
      setOcupado(false);
    }
  };

  const sugerir = async () => {
    if (!onSugerirIA || sugiriendo) return;
    setSugiriendo(true);
    try {
      const s = await onSugerirIA();
      if (s) {
        onModoChange('responder');
        setTexto(s);
        caja.current?.focus();
      }
    } finally {
      setSugiriendo(false);
    }
  };

  const empezarGrabacion = async () => {
    try {
      const flujo = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(flujo);
      grabadora.current = rec;
      trozos.current = [];
      descartar.current = false;
      rec.ondataavailable = (ev) => trozos.current.push(ev.data);
      rec.onstop = () => {
        flujo.getTracks().forEach((p) => p.stop());
        if (descartar.current || trozos.current.length === 0) return;
        const blob = new Blob(trozos.current, { type: 'audio/webm' });
        const archivo = new File([blob], `audio_${Date.now()}.webm`, { type: 'audio/webm' });
        setOcupado(true);
        onEnviar({ archivo, esAudio: true })
          .catch(() => undefined)
          .finally(() => setOcupado(false));
      };
      rec.start();
      setGrabando(true);
      setSegundos(0);
      reloj.current = setInterval(() => setSegundos((s) => s + 1), 1000);
    } catch {
      setGrabando(false);
    }
  };

  const terminarGrabacion = (descartarla: boolean) => {
    descartar.current = descartarla;
    grabadora.current?.stop();
    setGrabando(false);
    if (reloj.current) clearInterval(reloj.current);
  };

  // ── Estados que reemplazan la caja ────────────────────────────────────────
  if (estado === 'cerrada') {
    return (
      <div className={cn('shrink-0 border-t border-line bg-surface p-3 sm:px-4', className)}>
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-subtle px-4 py-3">
          <Lock aria-hidden="true" className="size-4 shrink-0 text-fg-secondary" />
          <p className="min-w-0 flex-1 text-sm text-fg-secondary">{t('cerrada')}</p>
          {onReabrir ? (
            <button type="button" onClick={onReabrir} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
              {t('reabrir')}
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  const bloqueoVentana = !esNota && (estado === 'ventanaVencida' || estado === 'sinConsentimiento');

  return (
    <div className={cn('shrink-0 border-t border-line bg-surface p-3 sm:px-4', className)}>
      {/* Modo y sugerencia */}
      <div className="mb-2 flex items-center gap-1">
        <div role="radiogroup" aria-label={t('modo')} className="flex items-center gap-1">
          {(['responder', 'nota'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={modo === m}
              onClick={() => onModoChange(m)}
              className={cn(
                'inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-[13px] font-medium transition-colors',
                modo === m
                  ? m === 'nota'
                    ? 'bg-warning-subtle text-warning-text'
                    : 'bg-brand-tint text-brand'
                  : 'text-fg-secondary hover:bg-hover',
              )}
            >
              {m === 'nota' ? <Lock aria-hidden="true" className="size-3.5" /> : null}
              {m === 'nota' ? t('nota') : t('responder')}
            </button>
          ))}
        </div>
        {onSugerirIA && !esNota ? (
          <button
            type="button"
            onClick={() => void sugerir()}
            disabled={sugiriendo || !escribible}
            aria-busy={sugiriendo}
            className={cn(clasesBoton({ variante: 'secundario', tamano: 'sm' }), 'ml-auto h-7 text-brand')}
          >
            <Sparkles aria-hidden="true" className={cn('size-3.5', sugiriendo && 'animate-pulse')} />
            {sugiriendo ? t('sugiriendo') : compacto ? t('sugerirCorto') : t('sugerir')}
          </button>
        ) : null}
      </div>

      {bloqueoVentana ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line-warning bg-warning-subtle px-4 py-3">
          <Clock aria-hidden="true" className="size-4 shrink-0 text-warning-text" />
          <p className="min-w-0 flex-1 text-sm text-warning-text">{estado === 'sinConsentimiento' ? t('sinConsentimiento') : t('ventanaVencida')}</p>
          {estado === 'ventanaVencida' && onElegirPlantilla ? (
            <button type="button" onClick={onElegirPlantilla} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
              {t('elegirPlantilla')}
            </button>
          ) : null}
        </div>
      ) : grabando ? (
        <div className="flex items-center gap-3 rounded-xl border border-line-danger bg-danger-subtle px-4 py-2.5">
          <span aria-hidden="true" className="size-2.5 animate-pulse rounded-full bg-danger" />
          <p className="flex-1 text-sm font-medium text-danger-text" aria-live="polite">
            {t('grabando', { tiempo: duracionGrabacion(segundos) })}
          </p>
          <button type="button" onClick={() => terminarGrabacion(true)} aria-label={t('cancelarAudio')} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>
            <X aria-hidden="true" className="size-4" />
          </button>
          <button type="button" onClick={() => terminarGrabacion(false)} aria-label={t('enviarAudio')} className={clasesBoton({ variante: 'destructivo', tamano: 'sm' })}>
            <Square aria-hidden="true" className="size-3.5" />
          </button>
        </div>
      ) : (
        <div className="relative">
          {rapidas && (
            <div role="listbox" aria-label={t('respuestasRapidas')} className="absolute bottom-full left-0 right-0 z-20 mb-2 max-h-56 overflow-y-auto rounded-xl border border-line bg-surface shadow-lg">
              {rapidas.length === 0 ? (
                <p className="px-4 py-3 text-sm text-fg-muted">{t('sinRespuestasRapidas')}</p>
              ) : (
                rapidas.map((r, i) => (
                  <button
                    key={r.id}
                    type="button"
                    role="option"
                    aria-selected={i === indiceRapida}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => usarRapida(r)}
                    className={cn('block w-full border-b border-line px-4 py-2 text-left last:border-b-0 hover:bg-hover', i === indiceRapida && 'bg-hover')}
                  >
                    <span className="flex items-center gap-2 text-sm font-medium text-fg">
                      <Zap aria-hidden="true" className="size-3.5 text-warning" />
                      {r.title}
                      {r.shortcut ? <span className="text-xs font-normal text-fg-muted">/{r.shortcut}</span> : null}
                    </span>
                    <span className="mt-0.5 line-clamp-1 text-xs text-fg-secondary">{r.content}</span>
                  </button>
                ))
              )}
            </div>
          )}
          <div
            className={cn(
              'flex items-end gap-1 rounded-xl border px-2 py-1.5',
              esNota ? 'border-line-warning bg-warning-subtle' : 'border-line bg-subtle',
              'focus-within:ring-2 focus-within:ring-brand/40',
            )}
          >
            <input ref={archivoRef} type="file" className="hidden" onChange={(e) => void alElegirArchivo(e)} accept="image/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt" />
            {!esNota ? (
              <button
                type="button"
                onClick={() => archivoRef.current?.click()}
                disabled={!escribible || ocupado}
                aria-label={t('adjuntar')}
                title={t('adjuntar')}
                className="flex size-8 shrink-0 items-center justify-center rounded-md text-fg-secondary hover:bg-hover disabled:opacity-50"
              >
                <Paperclip aria-hidden="true" className="size-4" />
              </button>
            ) : null}
            <Popover open={emojis} onOpenChange={setEmojis}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  disabled={!escribible}
                  aria-label={t('emojis')}
                  title={t('emojis')}
                  className="flex size-8 shrink-0 items-center justify-center rounded-md text-fg-secondary hover:bg-hover disabled:opacity-50"
                >
                  <Smile aria-hidden="true" className="size-4" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-2" align="start">
                <div className="grid grid-cols-10 gap-1">
                  {EMOJIS_FRECUENTES.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => {
                        setTexto((v) => v + e);
                        setEmojis(false);
                        caja.current?.focus();
                      }}
                      className="flex size-7 items-center justify-center rounded text-lg hover:bg-hover"
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            {!esNota && !compacto ? (
              <button
                type="button"
                onClick={() => {
                  setTexto('/');
                  caja.current?.focus();
                }}
                disabled={!escribible}
                aria-label={t('respuestasRapidas')}
                title={t('respuestasRapidas')}
                className="flex size-8 shrink-0 items-center justify-center rounded-md text-fg-secondary hover:bg-hover disabled:opacity-50"
              >
                <Zap aria-hidden="true" className="size-4" />
              </button>
            ) : null}
            <label className="sr-only" htmlFor="composer-chat-texto">
              {esNota ? t('placeholderNota') : t('placeholder')}
            </label>
            <textarea
              id="composer-chat-texto"
              ref={caja}
              rows={1}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={alTeclear}
              disabled={!escribible || ocupado}
              placeholder={esNota ? t('placeholderNota') : compacto ? t('placeholderCorto') : t('placeholder')}
              className="max-h-40 min-h-8 flex-1 resize-none bg-transparent px-1 py-1.5 text-sm text-fg placeholder:text-fg-muted focus:outline-none"
            />
            {!esNota && !texto.trim() ? (
              <button
                type="button"
                onClick={() => void empezarGrabacion()}
                disabled={!escribible || ocupado}
                aria-label={t('grabar')}
                title={t('grabar')}
                className="flex size-8 shrink-0 items-center justify-center rounded-md text-fg-secondary hover:bg-hover disabled:opacity-50"
              >
                <Mic aria-hidden="true" className="size-4" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void enviar()}
              disabled={!puedeEnviar(texto, modo, estado, ocupado)}
              aria-busy={ocupado}
              className={clasesBoton({ tamano: 'sm' })}
            >
              <Send aria-hidden="true" className="size-4" />
              {esNota ? t('guardarNota') : t('enviar')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
