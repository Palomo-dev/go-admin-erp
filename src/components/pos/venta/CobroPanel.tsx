'use client';

import type { ReactNode } from 'react';
import { CreditCard } from 'lucide-react';
import { PanelAdaptable } from '@/components/kit';

/**
 * Contenedor del cobro del POS (POS-PLAN paso 11, POS-UX-V2 D4): un
 * `PanelAdaptable` de 1120 px en escritorio y una hoja a pantalla completa en
 * el celular. Es un diálogo Radix (`role="dialog"`, Esc, foco atrapado): con
 * él abierto el lector de códigos descarta los escaneos (`dialogOpen()`).
 *
 * Solo dibuja: el estado y la lógica del cobro siguen en `CheckoutDialog`.
 *
 * - `resumen`: zona izquierda (360 px, fondo suave) con el total y las cifras.
 *   Sin ella, una sola columna (la post-venta).
 * - `children`: zona derecha (pagos y secciones), con su propio scroll.
 * - `pie`: «Cancelar · Esc» y «Completar venta · Enter», siempre visibles.
 */
export interface CobroPanelProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  titulo: string;
  descripcion?: ReactNode;
  /** Venta en curso: no se puede cerrar. */
  ocupado?: boolean;
  resumen?: ReactNode;
  pie?: ReactNode;
  /** Foco al abrir (el cobro lo pone en el monto del pago). */
  onFocoAlAbrir?: (evento: Event) => void;
  children: ReactNode;
}

export function CobroPanel({ abierto, onAbiertoChange, titulo, descripcion, ocupado, resumen, pie, onFocoAlAbrir, children }: CobroPanelProps) {
  return (
    <PanelAdaptable
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={titulo}
      descripcion={descripcion}
      icono={CreditCard}
      ancho={1120}
      ocupado={ocupado}
      bloquearClicFuera
      onFocoAlAbrir={onFocoAlAbrir}
      pie={pie}
      className="max-lg:h-[100dvh] max-lg:max-h-[100dvh] max-lg:rounded-none lg:h-[min(820px,calc(100dvh-48px))]"
    >
      {resumen ? (
        <div className="-mx-5 -my-4 flex flex-col border-t border-line lg:grid lg:min-h-0 lg:flex-1 lg:grid-cols-[360px_minmax(0,1fr)]">
          <div className="flex flex-col gap-4 border-b border-line bg-subtle p-5 lg:min-h-0 lg:overflow-y-auto lg:border-b-0 lg:border-r">
            {resumen}
          </div>
          <div className="flex flex-col gap-4 p-5 lg:min-h-0 lg:overflow-y-auto">{children}</div>
        </div>
      ) : (
        children
      )}
    </PanelAdaptable>
  );
}
