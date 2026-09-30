'use client';

/**
 * GO Asistente — un mensaje del hilo (Figma `AsistenteMensaje` 662:15899).
 *
 * - Usuario: burbuja en Azul acción a la derecha (radio 12, texto hasta 280 px
 *   en el panel acoplado), con los adjuntos que se mandaron en ese turno.
 * - Asistente: burbuja en Fondo suave a todo el ancho, markdown, y debajo
 *   «Escuchar» (solo si la organización activó la voz) y «Copiar».
 * - Sin avatares: en 400 px el ancho es para el contenido.
 *
 * `React.memo`: mientras llega una respuesta el panel se vuelve a pintar en
 * cada token; sin memo, cada token volvía a interpretar el markdown de TODO el
 * hilo (§11.7 «sin re-render de toda la lista por token»).
 */

import React, { memo } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Copy, FileSpreadsheet, FileText, ImageIcon, Loader2, Volume2 } from 'lucide-react';
import { cn } from '@/utils/Utils';
import MarkdownRenderer from '../MarkdownRenderer';

export interface AdjuntoMensaje {
  nombre: string;
  bytes: number;
  tipo: string;
}

export interface MensajeHilo {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  adjuntos?: AdjuntoMensaje[];
}

export interface MessageBubbleProps {
  mensaje: MensajeHilo;
  ampliado: boolean;
  puedeEscuchar: boolean;
  leyendo: boolean;
  copiado: boolean;
  onCopiar(id: string, texto: string): void;
  onEscuchar(id: string, texto: string): void;
  onDetenerLectura(): void;
}

/** «48 KB», «1,2 MB». */
export function tamanoLegible(bytes: number, locale = 'es-CO'): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString(locale)} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString(locale, { maximumFractionDigits: 1 })} MB`;
}

function IconoAdjunto({ tipo }: { tipo: string }) {
  const cls = 'h-3.5 w-3.5 shrink-0';
  if (tipo.startsWith('image/')) return <ImageIcon className={cls} strokeWidth={1.5} aria-hidden="true" />;
  if (/sheet|excel|csv/.test(tipo)) return <FileSpreadsheet className={cls} strokeWidth={1.5} aria-hidden="true" />;
  return <FileText className={cls} strokeWidth={1.5} aria-hidden="true" />;
}

function MessageBubble({ mensaje, ampliado, puedeEscuchar, leyendo, copiado, onCopiar, onEscuchar, onDetenerLectura }: MessageBubbleProps) {
  const t = useTranslations('asistente.mensaje');

  if (mensaje.role === 'user') {
    return (
      <div className="flex justify-end">
        <div
          className={cn(
            'flex flex-col gap-1.5 rounded-xl bg-brand-action px-3 py-2 text-fg-on-brand',
            ampliado ? 'max-w-[70%]' : 'max-w-[85%]'
          )}
        >
          {mensaje.adjuntos?.map((a, i) => (
            <span key={`${a.nombre}-${i}`} className="flex items-center gap-1.5 self-start rounded-lg bg-fg-on-brand/15 px-2 py-1.5 text-xs font-medium">
              <IconoAdjunto tipo={a.tipo} />
              <span className="max-w-[200px] truncate">{a.nombre}</span>
              {a.bytes > 0 && <span className="shrink-0 opacity-80">· {tamanoLegible(a.bytes)}</span>}
            </span>
          ))}
          {mensaje.content && <p className="whitespace-pre-wrap break-words text-sm leading-5">{mensaje.content}</p>}
        </div>
      </div>
    );
  }

  const texto = mensaje.content;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="w-full rounded-xl bg-subtle px-3 py-2.5 text-fg">
        <MarkdownRenderer content={texto} />
      </div>
      {texto.trim() && (
        <div className="flex items-center gap-3 px-1">
          {puedeEscuchar && (
            <button
              type="button"
              onClick={() => (leyendo ? onDetenerLectura() : onEscuchar(mensaje.id, texto))}
              aria-label={leyendo ? t('detenerLectura') : t('escucharRespuesta')}
              className="flex items-center gap-1 rounded text-xs font-medium text-fg-muted outline-none hover:text-brand-action focus-visible:ring-2 focus-visible:ring-brand"
            >
              {leyendo ? (
                <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" strokeWidth={1.5} aria-hidden="true" />
              ) : (
                <Volume2 className="h-3 w-3" strokeWidth={1.5} aria-hidden="true" />
              )}
              {leyendo ? t('leyendo') : t('escuchar')}
            </button>
          )}
          <button
            type="button"
            onClick={() => onCopiar(mensaje.id, texto)}
            aria-label={t('copiarRespuesta')}
            className="flex items-center gap-1 rounded text-xs font-medium text-fg-muted outline-none hover:text-brand-action focus-visible:ring-2 focus-visible:ring-brand"
          >
            {copiado ? (
              <Check className="h-3 w-3" strokeWidth={1.5} aria-hidden="true" />
            ) : (
              <Copy className="h-3 w-3" strokeWidth={1.5} aria-hidden="true" />
            )}
            <span aria-live="polite">{copiado ? t('copiado') : t('copiar')}</span>
          </button>
        </div>
      )}
    </div>
  );
}

export default memo(MessageBubble);
