'use client';

/**
 * GO Assistant — composer.
 *
 * El anterior era un `<Input>` de UNA línea: dictar un pedido largo o pegar el
 * texto de una factura era imposible, y no había forma de adjuntar nada ni de
 * hablar. Este es el que el plan pide en §11.2.
 *
 * Qué hace y por qué:
 * - **Textarea que crece** de 1 a 8 líneas. `Enter` envía, `Shift+Enter` salta
 *   de línea (en móvil `Enter` siempre salta: ahí el teclado no distingue).
 * - **Adjuntar**: botón, arrastrar y soltar sobre todo el panel, y **pegar
 *   desde el portapapeles** — que es como se manda una captura de pantalla, el
 *   caso más común en soporte.
 * - **Micrófono**: pulsar para grabar, con contador y forma de onda. Al parar,
 *   se transcribe y el texto entra en el composer para que el usuario lo
 *   corrija ANTES de enviarlo, en vez de mandarlo a ciegas.
 * - **Parar**: mientras responde, el botón de enviar se convierte en detener.
 *   Sin esto, una respuesta larga que arrancó mal hay que aguantarla entera.
 *
 * Los adjuntos se recogen aquí pero todavía NO se procesan: la extracción de
 * facturas es F4. Se muestran con un aviso honesto en vez de aceptarlos en
 * silencio y no hacer nada con ellos.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Send, Loader2, Paperclip, Mic, Square, X, FileText, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/Utils';

export interface ComposerAttachment {
  id: string;
  file: File;
  previewUrl?: string;
}

interface ComposerProps {
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
}

const MAX_ROWS = 8;
const LINE_HEIGHT = 24;
const MAX_CHARS = 8000;

/** Tipos que el asistente sabrá leer en F4. Se filtra ya para no dar falsas esperanzas. */
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
}: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

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
    el.style.height = `${Math.min(el.scrollHeight, MAX_ROWS * LINE_HEIGHT + 16)}px`;
  }, []);

  useEffect(() => {
    autoResize();
  }, [value, autoResize]);

  useEffect(() => {
    if (!isRecording) return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [isRecording]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // En móvil `Enter` siempre salta de línea: el teclado virtual no distingue
    // Shift de forma fiable y enviar sin querer es peor que un salto de más.
    if (e.key === 'Enter' && !e.shiftKey && !isMobile) {
      e.preventDefault();
      if (value.trim() && !isLoading) onSubmit();
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

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        if (blob.size === 0) return;

        setIsTranscribing(true);
        try {
          const form = new FormData();
          form.append('audio', blob, 'nota.webm');
          form.append('language', 'es');
          const res = await fetch('/api/ai-assistant/transcribe', { method: 'POST', body: form });
          const data = await res.json();
          if (res.ok && data.text) {
            // El texto entra en el composer, NO se envía solo: el usuario ve lo
            // que se entendió y lo corrige antes de mandarlo.
            onChange(value ? `${value} ${data.text}` : data.text);
            setTimeout(() => textareaRef.current?.focus(), 50);
          } else {
            console.error('Error transcribiendo:', data.error);
          }
        } catch (error) {
          console.error('Error transcribiendo:', error);
        } finally {
          setIsTranscribing(false);
        }
      };
      recorder.start();
      recorderRef.current = recorder;
      setSeconds(0);
      setIsRecording(true);
    } catch (error) {
      console.error('No se pudo acceder al micrófono:', error);
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setIsRecording(false);
  };

  const nearLimit = value.length > MAX_CHARS * 0.9;
  const canSend = value.trim().length > 0 && !isLoading && !disabled;

  return (
    <div className="p-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex-shrink-0">
      {attachments.length > 0 && (
        <ul className="flex flex-wrap gap-2 mb-2" aria-label="Archivos adjuntos">
          {attachments.map((a) => (
            <li
              key={a.id}
              className="group relative flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs"
            >
              {a.file.type.startsWith('image/') ? (
                <ImageIcon size={12} className="text-gray-500" aria-hidden="true" />
              ) : (
                <FileText size={12} className="text-gray-500" aria-hidden="true" />
              )}
              <span className="max-w-[140px] truncate text-gray-700 dark:text-gray-300">{a.file.name}</span>
              <button
                type="button"
                onClick={() => onRemoveAttachment(a.id)}
                className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                aria-label={`Quitar ${a.file.name}`}
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {attachments.length > 0 && !attachmentsEnabled && (
        <p className="mb-2 text-[11px] text-amber-700 dark:text-amber-400">
          Todavía no puedo leer archivos: lo estoy aprendiendo. Por ahora cuéntame por escrito qué dice.
        </p>
      )}

      <div
        className={cn(
          'flex items-end gap-1.5 rounded-2xl border bg-gray-50 dark:bg-gray-800 px-2 py-1.5 transition-colors',
          'border-gray-300 dark:border-gray-600 focus-within:border-blue-500 dark:focus-within:border-blue-500'
        )}
      >
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

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading || disabled}
          className="h-8 w-8 flex-shrink-0 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          aria-label="Adjuntar archivo"
          title="Adjuntar archivo o foto"
        >
          <Paperclip size={16} />
        </Button>

        {isRecording ? (
          <div className="flex-1 flex items-center gap-2 px-1 py-1.5" aria-live="polite">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" aria-hidden="true" />
            <span className="text-sm text-gray-700 dark:text-gray-300 tabular-nums">
              Grabando… {String(Math.floor(seconds / 60)).padStart(2, '0')}:
              {String(seconds % 60).padStart(2, '0')}
            </span>
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value.slice(0, MAX_CHARS))}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            rows={1}
            placeholder={isTranscribing ? 'Transcribiendo tu nota…' : 'Escribe, pega una captura o dicta…'}
            disabled={isLoading || isTranscribing || disabled}
            aria-label="Mensaje para GO Assistant"
            className={cn(
              'flex-1 resize-none bg-transparent border-0 outline-none',
              'text-sm text-gray-900 dark:text-white placeholder:text-gray-400',
              'py-1.5 px-1 leading-6 max-h-[200px]',
              'disabled:opacity-60'
            )}
          />
        )}

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={isRecording ? stopRecording : startRecording}
          disabled={isLoading || isTranscribing || disabled}
          className={cn(
            'h-8 w-8 flex-shrink-0',
            isRecording
              ? 'text-red-600 hover:text-red-700'
              : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          )}
          aria-label={isRecording ? 'Detener grabación' : 'Dictar mensaje'}
          title={isRecording ? 'Detener y transcribir' : 'Dictar'}
        >
          {isTranscribing ? <Loader2 size={16} className="animate-spin" /> : isRecording ? <Square size={16} /> : <Mic size={16} />}
        </Button>

        {/*
          Mientras responde, enviar se convierte en detener: una respuesta larga
          que arrancó mal no debería haber que aguantarla entera.
        */}
        <Button
          type="button"
          size="icon"
          onClick={isLoading ? onStop : onSubmit}
          disabled={!isLoading && !canSend}
          className={cn(
            'h-8 w-8 flex-shrink-0 rounded-lg',
            isLoading
              ? 'bg-gray-700 hover:bg-gray-800 text-white'
              : 'bg-blue-600 hover:bg-blue-700 text-white disabled:bg-gray-300 dark:disabled:bg-gray-700'
          )}
          aria-label={isLoading ? 'Detener respuesta' : 'Enviar mensaje'}
        >
          {isLoading ? <Square size={14} /> : <Send size={16} />}
        </Button>
      </div>

      <div className="flex items-center justify-between mt-1.5 px-1">
        <p className="text-[10px] text-gray-400">
          {isMobile ? 'Toca enviar para mandar' : 'Enter envía · Shift+Enter salta de línea'}
        </p>
        {/* El contador solo aparece cerca del límite: antes es ruido. */}
        {nearLimit && (
          <p className="text-[10px] text-amber-600 tabular-nums">
            {value.length.toLocaleString('es-CO')} / {MAX_CHARS.toLocaleString('es-CO')}
          </p>
        )}
      </div>
    </div>
  );
}
