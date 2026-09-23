'use client';

import type { ReactNode } from 'react';
import { Loader2, X } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useKitT } from './useIdiomaKit';

/**
 * Diálogo del manual (PATRONES §8; Figma «Diálogo · Mover categoría»):
 * cabecera con título, descripción y «×», divisor, cuerpo con scroll, divisor
 * y pie con «Cancelar» a la izquierda del primario. Anchos fijos del manual:
 * 440 · 520 · 560 · 672 · 1024 px (en móvil, el ancho de la pantalla menos
 * 16 px por lado).
 *
 * El primario **responde al título**: «¿Desactivar…?» → «Desactivar»,
 * «Mover «X»» → «Mover aquí». Lo destructivo va en rojo.
 *
 * Para una confirmación de una línea sin cuerpo sigue sirviendo
 * `ConfirmDialog` (ui); este es para diálogos con contenido (un selector, un
 * aviso, una lista).
 */
export interface AccionDialogo {
  etiqueta: string;
  onClick: () => void;
  destructiva?: boolean;
  cargando?: boolean;
  deshabilitada?: boolean;
  /** Por qué está deshabilitado (se lee en el lector de pantalla y en el `title`). */
  motivo?: string;
}

export interface DialogoProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  titulo: string;
  descripcion?: ReactNode;
  children?: ReactNode;
  primario: AccionDialogo;
  /** Texto del botón que cierra sin hacer nada; por defecto «Cancelar». */
  textoCancelar?: string;
  ancho?: 440 | 520 | 560 | 672 | 1024;
  className?: string;
}

const ANCHO: Record<NonNullable<DialogoProps['ancho']>, string> = {
  440: 'sm:max-w-[440px]',
  520: 'sm:max-w-[520px]',
  560: 'sm:max-w-[560px]',
  672: 'sm:max-w-[672px]',
  1024: 'sm:max-w-[1024px]',
};

export function Dialogo({
  abierto,
  onAbiertoChange,
  titulo,
  descripcion,
  children,
  primario,
  textoCancelar: textoCancelarProp,
  ancho = 520,
  className,
}: DialogoProps) {
  const t = useKitT();
  const textoCancelar = textoCancelarProp ?? t('comun.cancelar');
  const ocupado = !!primario.cargando;
  return (
    <Dialog open={abierto} onOpenChange={(v) => !ocupado && onAbiertoChange(v)}>
      <DialogContent
        hideCloseButton
        className={cn(
          'flex max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] max-w-none flex-col gap-0 overflow-hidden rounded-xl border-line bg-surface p-0 text-fg sm:rounded-xl',
          ANCHO[ancho],
          className,
        )}
      >
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <DialogTitle className="text-lg font-semibold leading-6 text-fg">{titulo}</DialogTitle>
            {descripcion ? (
              <DialogDescription className="text-sm leading-5 text-fg-secondary">{descripcion}</DialogDescription>
            ) : (
              <DialogDescription className="sr-only">{titulo}</DialogDescription>
            )}
          </div>
          <button
            type="button"
            aria-label={t('comun.cerrar')}
            disabled={ocupado}
            onClick={() => onAbiertoChange(false)}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
          >
            <X aria-hidden="true" className="size-5" strokeWidth={1.5} />
          </button>
        </div>

        {children && <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">{children}</div>}

        <div className="flex flex-col-reverse gap-2 border-t border-line px-5 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={ocupado}
            onClick={() => onAbiertoChange(false)}
            className="flex h-10 items-center justify-center rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
          >
            {textoCancelar}
          </button>
          <button
            type="button"
            onClick={primario.onClick}
            disabled={primario.deshabilitada || ocupado}
            aria-busy={ocupado || undefined}
            title={primario.deshabilitada ? primario.motivo : undefined}
            className={cn(
              'flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium text-fg-on-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
              primario.destructiva ? 'bg-danger hover:bg-danger-hover' : 'bg-brand-action hover:bg-brand-action-hover',
            )}
          >
            {ocupado && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
            {primario.etiqueta}
          </button>
        </div>
        {primario.deshabilitada && primario.motivo && <span className="sr-only">{primario.motivo}</span>}
      </DialogContent>
    </Dialog>
  );
}
