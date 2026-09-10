'use client';

import { Check, CheckCheck, FileText, Image as ImageIcon } from 'lucide-react';
import { cn } from '@/utils/Utils';

export interface BubbleProps {
  header?: string | null;
  body: string;
  footer?: string | null;
  buttons?: Array<{ type: string; text: string }>;
  media?: { mime: string; filename?: string; url?: string } | null;
  status?: 'pending' | 'sent' | 'delivered' | 'read' | 'failed' | null;
  time?: string;
  className?: string;
  outbound?: boolean;
}

/** Vista previa tipo burbuja de WhatsApp (fondo #e7ffdb / dark #005c4b). Los botones no son interactivos. */
export function BubblePreview({ header, body, footer, buttons = [], media, status, time, className, outbound = true }: BubbleProps) {
  return (
    <div className={cn('w-full max-w-sm', className)} aria-label="Vista previa del mensaje" role="img">
      <div className={cn('rounded-2xl px-3 py-2 text-sm shadow-sm', outbound ? 'bg-[#e7ffdb] dark:bg-[#005c4b] text-gray-900 dark:text-gray-50 rounded-br-sm ml-auto' : 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-50 rounded-bl-sm')}>
        {media && (
          <div className="mb-1.5 flex items-center gap-2 rounded-lg bg-black/5 dark:bg-white/10 px-2 py-1.5 text-xs">
            {media.mime.startsWith('image/') ? <ImageIcon className="h-4 w-4" aria-hidden="true" /> : <FileText className="h-4 w-4" aria-hidden="true" />}
            <span className="truncate">{media.filename ?? (media.mime.startsWith('image/') ? 'Imagen' : 'Documento')}</span>
          </div>
        )}
        {header && <p className="font-semibold mb-1">{header}</p>}
        <p className="whitespace-pre-wrap break-words">{body || <span className="text-gray-400">Escribe un mensaje…</span>}</p>
        {footer && <p className="text-[11px] text-gray-500 dark:text-gray-300 mt-1">{footer}</p>}
        <p className="text-[10px] text-gray-500 dark:text-gray-300 mt-1 text-right inline-flex w-full justify-end items-center gap-1">
          {time ?? new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
          {status === 'sent' && <Check className="h-3 w-3" aria-label="enviado" />}
          {status === 'delivered' && <CheckCheck className="h-3 w-3" aria-label="entregado" />}
          {status === 'read' && <CheckCheck className="h-3 w-3 text-sky-500" aria-label="leído" />}
          {status === 'failed' && <span className="text-red-600 dark:text-red-400" aria-label="fallido">⚠</span>}
        </p>
      </div>
      {buttons.length > 0 && (
        <div className="mt-1 space-y-1">
          {buttons.map((b, i) => (
            <span key={i} className="block rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-center text-xs text-sky-600 dark:text-sky-400 py-1.5" aria-hidden="true">{b.text}</span>
          ))}
        </div>
      )}
    </div>
  );
}
