'use client';

/**
 * Dato largo de una hoja de detalle del Chat (Figma 94-chat-recuperado-ia-08 y
 * 10): la etiqueta arriba y el valor en una caja gris que parte la línea donde
 * haga falta (ID anónimo, URL de la página, navegador, IDs de la auditoría).
 * Es un par `<dt>`/`<dd>`: va dentro de un `<dl>` (`ListaDatos`).
 */
import type { ReactNode } from 'react';
import { cn } from '@/utils/Utils';

export interface DatoEnCajaProps {
  etiqueta: ReactNode;
  valor: ReactNode;
  /** Letra de ancho fijo (identificadores, navegador, JSON). */
  mono?: boolean;
  className?: string;
}

export function DatoEnCaja({ etiqueta, valor, mono, className }: DatoEnCajaProps) {
  return (
    <div className={cn('flex flex-col gap-1.5 py-1', className)}>
      <dt className="text-[13px] text-fg-muted">{etiqueta}</dt>
      <dd className={cn('break-all rounded-lg bg-subtle px-2 py-2 text-xs leading-[18px] text-fg-secondary', mono && 'font-mono')}>{valor}</dd>
    </div>
  );
}
