'use client';

import { SegmentedControl } from '@/components/kit';
import { cn } from '@/utils/Utils';
import { DISPOSITIVOS_VISTA, VIEWPORT_DISPOSITIVO, type DispositivoVista } from './dispositivos';
import { ICONO_DISPOSITIVO_VISTA } from './iconosSitio';

/**
 * Selector de ancho de la vista previa. Una sola pieza para Diseño, el diálogo de
 * Plantillas y la barra del editor, sobre la tabla única de `dispositivos.ts`.
 *
 * - `variante="texto"` (Figma A/06a, A/06c y A/07g): icono + «1440 px» en cada opción.
 * - `variante="icono"` (barra del editor, decisión del dueño: «los iconos los entiende
 *   más fácil cualquier usuario»): solo el icono del dispositivo, con `aria-label` y
 *   tooltip «Computador · 1440 px», el activo con tinte de marca (AA sobre la barra clara)
 *   y el ancho del activo como texto discreto al lado («1440 px»), anunciado con
 *   `aria-live` al cambiar.
 */
export interface SelectorAnchoVistaProps {
  valor: DispositivoVista;
  onValorChange: (dispositivo: DispositivoVista) => void;
  /** Nombre del grupo para lectores de pantalla («Ancho de la vista previa»). */
  etiqueta: string;
  /** Dispositivos a ofrecer; por defecto los tres de Diseño (`DISPOSITIVOS_VISTA`). */
  dispositivos?: readonly DispositivoVista[];
  variante?: 'texto' | 'icono';
  /**
   * Solo con `variante="icono"`: nombre accesible de cada opción («Computador · 1440 px»).
   * Si falta, se usa el ancho («1440 px»).
   */
  nombreOpcion?: (dispositivo: DispositivoVista) => string;
  tamano?: 'sm' | 'md';
  /**
   * Solo con `variante="icono"`: clases del texto «1440 px» junto a los iconos. La barra
   * del editor lo oculta por debajo de xl (`hidden xl:inline`) para no desbordarse entre
   * 1024 y 1280; el ancho sigue en el tooltip y el nombre accesible de cada icono.
   */
  claseAncho?: string;
  className?: string;
}

/** «1440 px»: el número con separador de miles nunca aplica (son anchos de pantalla). */
export function etiquetaAncho(dispositivo: DispositivoVista): string {
  return `${VIEWPORT_DISPOSITIVO[dispositivo].ancho} px`;
}

export function SelectorAnchoVista({
  valor,
  onValorChange,
  etiqueta,
  dispositivos = DISPOSITIVOS_VISTA,
  variante = 'texto',
  nombreOpcion,
  tamano = 'sm',
  claseAncho,
  className,
}: SelectorAnchoVistaProps) {
  if (variante === 'texto') {
    return (
      <SegmentedControl
        className={className}
        etiqueta={etiqueta}
        tamano={tamano}
        opciones={dispositivos.map((d) => ({ valor: d, etiqueta: etiquetaAncho(d), icono: ICONO_DISPOSITIVO_VISTA[d] }))}
        valor={valor}
        onValorChange={onValorChange}
      />
    );
  }
  return (
    <div className={cn('inline-flex items-center gap-2', className)}>
      <SegmentedControl
        etiqueta={etiqueta}
        tamano={tamano}
        tonoActivo="marca"
        opciones={dispositivos.map((d) => ({
          valor: d,
          etiqueta: nombreOpcion?.(d) ?? etiquetaAncho(d),
          icono: ICONO_DISPOSITIVO_VISTA[d],
          soloIcono: true,
        }))}
        valor={valor}
        onValorChange={onValorChange}
      />
      <span aria-live="polite" className={cn('min-w-[4.5rem] text-sm tabular-nums text-fg-secondary', claseAncho)}>
        {etiquetaAncho(valor)}
      </span>
    </div>
  );
}
