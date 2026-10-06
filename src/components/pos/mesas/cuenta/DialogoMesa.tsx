'use client';

import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/utils/Utils';

/**
 * Marco de los diálogos de la mesa tal como los dibuja el flujo aprobado
 * (Figma D1, D7, D8, D8b, D9, D12, T1, T6): título de 18 px con «×», sin
 * divisores, cuerpo y un pie propio alineado a la derecha (cada diálogo pone
 * sus botones: «Cancelar» sin borde y el primario, o los tres de D8b/D9).
 * El velo y el foco son los de `ui/dialog`.
 */
export interface DialogoMesaProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  titulo: string;
  descripcion?: ReactNode;
  children?: ReactNode;
  pie?: ReactNode;
  /** Ancho en px (Figma: 560 abrir y liberar, 720 mover y partes, 856 dividir). */
  ancho?: number;
  /** Sin «×» mientras se procesa. */
  ocupado?: boolean;
  textoCerrar: string;
  className?: string;
}

export function DialogoMesa({
  abierto,
  onAbiertoChange,
  titulo,
  descripcion,
  children,
  pie,
  ancho = 560,
  ocupado,
  textoCerrar,
  className,
}: DialogoMesaProps) {
  return (
    <Dialog open={abierto} onOpenChange={(v) => !ocupado && onAbiertoChange(v)}>
      <DialogContent
        hideCloseButton
        style={{ maxWidth: ancho }}
        className={cn(
          'flex max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] flex-col gap-4 overflow-hidden rounded-xl border-line bg-surface p-6 text-fg sm:rounded-xl',
          className,
        )}
      >
        <div className="flex items-start gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <DialogTitle className="text-lg font-semibold leading-7 text-fg">{titulo}</DialogTitle>
            {descripcion ? (
              <DialogDescription className="text-sm text-fg-secondary">{descripcion}</DialogDescription>
            ) : (
              <DialogDescription className="sr-only">{titulo}</DialogDescription>
            )}
          </div>
          <button
            type="button"
            aria-label={textoCerrar}
            disabled={ocupado}
            onClick={() => onAbiertoChange(false)}
            className="-mr-1 -mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
          >
            <X aria-hidden="true" className="size-5" strokeWidth={1.5} />
          </button>
        </div>
        {children && <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1">{children}</div>}
        {pie && <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">{pie}</div>}
      </DialogContent>
    </Dialog>
  );
}
