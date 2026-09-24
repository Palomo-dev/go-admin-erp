'use client';

import * as React from 'react';
import { cn } from '@/utils/Utils';
import { indiceSiguiente } from './navegacionTeclado';

/**
 * Pestañas de un detalle (Figma `TabItem` 581:277913): etiqueta con contador
 * opcional y subrayado de marca en la activa. Es un `tablist` con foco
 * itinerante (flechas, Inicio, Fin); los paneles los pinta la pantalla con
 * `idPanel(valor)` y `idPestana(valor)` para enlazar `aria-controls` y
 * `aria-labelledby`. En móvil desplaza en horizontal.
 *
 * ```tsx
 * <TabBar id="prov" etiqueta="Secciones del proveedor" valor={tab} onValorChange={setTab}
 *   pestanas={[{ valor: 'resumen', etiqueta: 'Resumen' }, { valor: 'ordenes', etiqueta: 'Órdenes de compra', contador: 18 }]} />
 * <div role="tabpanel" id={idPanel('prov', 'resumen')} aria-labelledby={idPestana('prov', 'resumen')}>…</div>
 * ```
 */
export interface PestanaTab<V extends string> {
  valor: V;
  etiqueta: string;
  contador?: number;
  deshabilitada?: boolean;
}

export interface TabBarProps<V extends string> {
  /** Prefijo de los ids de pestañas y paneles. */
  id: string;
  pestanas: readonly PestanaTab<V>[];
  valor: V;
  onValorChange: (valor: V) => void;
  /** Nombre accesible del grupo. */
  etiqueta: string;
  /** `sm`: sub-pestañas dentro de una pestaña (32 px, texto 13). Por defecto `md`. */
  tamano?: 'md' | 'sm';
  className?: string;
}

export const idPestana = (id: string, valor: string) => `${id}-tab-${valor}`;
export const idPanel = (id: string, valor: string) => `${id}-panel-${valor}`;

export function TabBar<V extends string>({ id, pestanas, valor, onValorChange, etiqueta, tamano = 'md', className }: TabBarProps<V>) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const deshabilitadas = pestanas.map((p) => !!p.deshabilitada);

  const alPulsar = (e: React.KeyboardEvent, i: number) => {
    const siguiente = indiceSiguiente(i, pestanas.length, e.key, deshabilitadas);
    if (siguiente === null) return;
    e.preventDefault();
    refs.current[siguiente]?.focus();
    onValorChange(pestanas[siguiente].valor);
  };

  return (
    <div
      role="tablist"
      aria-label={etiqueta}
      className={cn(
        'flex items-end gap-1 overflow-x-auto border-b border-line [scrollbar-width:none]',
        className,
      )}
    >
      {pestanas.map((p, i) => {
        const activa = p.valor === valor;
        return (
          <button
            key={p.valor}
            ref={(el) => {
              refs.current[i] = el;
            }}
            id={idPestana(id, p.valor)}
            type="button"
            role="tab"
            aria-selected={activa}
            aria-controls={idPanel(id, p.valor)}
            tabIndex={activa ? 0 : -1}
            disabled={p.deshabilitada}
            onClick={() => onValorChange(p.valor)}
            onKeyDown={(e) => alPulsar(e, i)}
            className={cn(
              '-mb-px inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 font-medium transition-colors',
              tamano === 'sm' ? 'h-8 px-2.5 text-[13px]' : 'h-10 px-3 text-sm',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50',
              activa ? 'border-brand text-brand-deep' : 'border-transparent text-fg-secondary hover:text-fg',
            )}
          >
            {p.etiqueta}
            {p.contador !== undefined && (
              <span
                className={cn(
                  'rounded-full px-1.5 text-[11px] font-semibold leading-4 tabular-nums',
                  activa ? 'bg-brand-tint text-brand-deep' : 'bg-subtle text-fg-secondary',
                )}
              >
                {p.contador.toLocaleString('es-CO')}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
