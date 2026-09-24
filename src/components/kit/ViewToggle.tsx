'use client';

import { LayoutGrid, Rows3 } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { SegmentedControl } from './SegmentedControl';
import { useKitT } from './useIdiomaKit';
import { otraVista, type OpcionVista } from './vistaLogica';

/**
 * Conmutador de vista (Figma `ViewToggle` 103:3095; decisión final del dueño
 * en POS-UX-V2 §7.5, 2026-09-24):
 *
 * - Escritorio y tableta: dos iconos pegados con el activo resaltado
 *   (cuadritos = Tarjetas, rayitas = Lista). Es un `radiogroup`.
 * - Celular (por debajo de `corte`): **un solo botón que alterna**; muestra
 *   el icono de la otra vista y se llama «Ver como lista» / «Ver como
 *   tarjetas».
 *
 * Sin «Compacta» ni menú. La preferencia (por dispositivo) la guarda la
 * pantalla. Mesas usa el mismo componente con Plano | Cuadrícula.
 */
export { otraVista, type OpcionVista };

export interface ViewToggleProps<V extends string> {
  valor: V;
  onValorChange: (valor: V) => void;
  /** Las dos vistas. Por defecto Tarjetas (`tarjetas`) | Lista (`lista`). */
  opciones?: readonly [OpcionVista<V>, OpcionVista<V>];
  /** Nombre del grupo («Vista de productos»). */
  etiqueta?: string;
  /** Por debajo de este corte, un botón que alterna. `segmentos` lo desactiva. */
  corte?: 'sm' | 'md' | 'lg';
  modoMovil?: 'alternar' | 'segmentos';
  tamano?: 'sm' | 'md';
  className?: string;
}

const OCULTAR_DEBAJO = { sm: 'hidden sm:inline-flex', md: 'hidden md:inline-flex', lg: 'hidden lg:inline-flex' } as const;
const MOSTRAR_DEBAJO = { sm: 'sm:hidden', md: 'md:hidden', lg: 'lg:hidden' } as const;

export function ViewToggle<V extends string = 'tarjetas' | 'lista'>({
  valor,
  onValorChange,
  opciones: opcionesProp,
  etiqueta,
  corte = 'md',
  modoMovil = 'alternar',
  tamano = 'md',
  className,
}: ViewToggleProps<V>) {
  const t = useKitT();
  const opciones =
    opcionesProp ??
    ([
      { valor: 'tarjetas', etiqueta: t('vista.tarjetas'), icono: LayoutGrid },
      { valor: 'lista', etiqueta: t('vista.lista'), icono: Rows3 },
    ] as unknown as readonly [OpcionVista<V>, OpcionVista<V>]);
  const nombre = etiqueta ?? t('vista.etiqueta');
  const siguiente = otraVista(opciones, valor);
  const IconoSiguiente = siguiente.icono;
  const alternar = modoMovil === 'alternar';

  return (
    <>
      <SegmentedControl
        etiqueta={nombre}
        tamano={tamano}
        valor={valor}
        onValorChange={onValorChange}
        opciones={opciones.map((o) => ({ valor: o.valor, etiqueta: o.etiqueta, icono: o.icono, soloIcono: true }))}
        className={cn(alternar && OCULTAR_DEBAJO[corte], className)}
      />
      {alternar && (
        <button
          type="button"
          onClick={() => onValorChange(siguiente.valor)}
          aria-label={t('vista.verComo', { vista: siguiente.etiqueta.toLowerCase() })}
          title={t('vista.verComo', { vista: siguiente.etiqueta.toLowerCase() })}
          className={cn(
            'inline-flex shrink-0 items-center justify-center rounded-lg border border-line-strong bg-surface text-fg-secondary hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
            tamano === 'md' ? 'size-10' : 'size-8',
            MOSTRAR_DEBAJO[corte],
            className,
          )}
        >
          <IconoSiguiente aria-hidden="true" className="size-5" strokeWidth={1.5} />
        </button>
      )}
    </>
  );
}
