'use client';

import type { KeyboardEvent, ReactNode } from 'react';
import { Eye, EyeOff, GripVertical, LayoutGrid, Lock, type LucideIcon } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { RowActionsMenu, type AccionFila, type PropsNodoArrastre } from '@/components/kit';
import { useTextosComun } from './textos';

/**
 * Fila ordenable (Figma A/07c; secciones del editor, páginas del menú):
 *
 * - normal: asa ⠿, icono, nombre, ojo y «⋯».
 * - `seleccionada`: tinte y borde de marca, nombre en azul profundo.
 * - `oculta`: nombre atenuado y ojo tachado.
 * - `global`: candado en lugar del asa y «Global» a la derecha, sin acciones
 *   (encabezado y pie: se editan en su panel).
 *
 * El arrastre lo da `useArrastreArbol` del kit (`arrastre` = `nodo(id)`); con
 * teclado, Alt + ↑/↓ llama a `onMover`.
 */
export interface SortableRowProps {
  etiqueta: string;
  /** Segunda línea («Megamenú · 4 columnas…»). */
  detalle?: ReactNode;
  icono?: LucideIcon;
  seleccionada?: boolean;
  oculta?: boolean;
  global?: boolean;
  /**
   * Texto a la derecha de una fila con candado (`global`): «Global» por defecto; `''` deja
   * solo el candado (encabezado y pie en la lista del editor).
   */
  etiquetaGlobal?: string;
  onSeleccionar?: () => void;
  /** Muestra el ojo; sin esto no hay control de visibilidad. */
  onAlternarVisible?: () => void;
  /**
   * Iconos del control de visibilidad; por defecto el ojo (visible) y el ojo
   * tachado (oculta). El menú del sitio los cambia: ahí «oculta» significa
   * «fuera del menú, pero publicada», y el ojo tachado ya es «Sin publicar».
   */
  iconosVisibilidad?: { visible: LucideIcon; oculta: LucideIcon };
  acciones?: readonly AccionFila[];
  /** Props de arrastre del kit (`useArrastreArbol().nodo(id)`). */
  arrastre?: PropsNodoArrastre;
  /** Mover con teclado: -1 arriba, 1 abajo. */
  onMover?: (direccion: -1 | 1) => void;
  /** Sangría por nivel (submenús), en pasos de 24 px. */
  nivel?: number;
  className?: string;
}

export function SortableRow({
  etiqueta,
  detalle,
  icono: Icono = LayoutGrid,
  seleccionada,
  oculta,
  global,
  etiquetaGlobal,
  onSeleccionar,
  onAlternarVisible,
  iconosVisibilidad,
  acciones,
  arrastre,
  onMover,
  nivel = 0,
  className,
}: SortableRowProps) {
  const tx = useTextosComun();
  const alPulsarTecla = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!onMover || !e.altKey) return;
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      onMover(-1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      onMover(1);
    }
  };
  const OjoIcono = oculta ? (iconosVisibilidad?.oculta ?? EyeOff) : (iconosVisibilidad?.visible ?? Eye);
  return (
    <div
      {...(global ? {} : arrastre?.props)}
      onKeyDown={alPulsarTecla}
      style={nivel > 0 ? { paddingLeft: `${8 + nivel * 24}px` } : undefined}
      className={cn(
        'group flex min-h-10 items-center gap-2 rounded-lg border px-2 py-1.5 transition-colors',
        seleccionada ? 'border-line-brand bg-brand-tint' : 'border-transparent bg-surface hover:bg-hover',
        arrastre?.esOrigen && 'opacity-50',
        arrastre?.esDestino && 'ring-2 ring-brand',
        className,
      )}
    >
      {global ? (
        <Lock aria-hidden="true" className="size-4 shrink-0 text-fg-muted" strokeWidth={1.5} />
      ) : (
        <span title={tx('fila.arrastrar')} className="flex cursor-grab text-fg-muted active:cursor-grabbing">
          <GripVertical aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.5} />
        </span>
      )}
      <button
        type="button"
        onClick={onSeleccionar}
        aria-pressed={onSeleccionar ? !!seleccionada : undefined}
        aria-keyshortcuts={onMover ? 'Alt+ArrowUp Alt+ArrowDown' : undefined}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <Icono
          aria-hidden="true"
          className={cn('size-4 shrink-0', seleccionada ? 'text-brand' : oculta ? 'text-fg-muted' : 'text-fg-secondary')}
          strokeWidth={1.5}
        />
        <span className="flex min-w-0 flex-col">
          <span
            title={etiqueta}
            className={cn(
              'truncate text-sm leading-5',
              seleccionada ? 'font-medium text-brand-deep' : oculta ? 'text-fg-muted' : 'text-fg',
            )}
          >
            {etiqueta}
            {oculta && <span className="sr-only"> · {tx('fila.oculta')}</span>}
          </span>
          {detalle ? <span className="truncate text-[13px] leading-[18px] text-fg-secondary">{detalle}</span> : null}
        </span>
      </button>
      {global ? (
        (etiquetaGlobal ?? tx('fila.global')) ? (
          <span title={tx('fila.globalAyuda')} className="shrink-0 text-xs text-fg-muted">
            {etiquetaGlobal ?? tx('fila.global')}
          </span>
        ) : null
      ) : (
        <>
          {onAlternarVisible && (
            <button
              type="button"
              onClick={onAlternarVisible}
              aria-label={oculta ? tx('fila.mostrar', { nombre: etiqueta }) : tx('fila.ocultar', { nombre: etiqueta })}
              aria-pressed={!oculta}
              className={cn(
                'size-8 shrink-0 items-center justify-center rounded-md text-fg-secondary hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                // Oculta: el ojo siempre a la vista (dice el estado); si no, al pasar o enfocar la fila.
                oculta ? 'flex' : 'hidden group-hover:flex group-focus-within:flex',
              )}
            >
              <OjoIcono aria-hidden="true" className="size-4" strokeWidth={1.5} />
            </button>
          )}
          {acciones && acciones.length > 0 && (
            // El menú ocupa sitio solo al pasar o enfocar la fila: así el nombre de la sección se ve
            // entero en el panel de 280 px (Figma), con el texto completo en `title`.
            <span className="hidden shrink-0 group-hover:flex group-focus-within:flex">
              <RowActionsMenu acciones={acciones} titulo={etiqueta} orientacion="horizontal" />
            </span>
          )}
        </>
      )}
    </div>
  );
}
