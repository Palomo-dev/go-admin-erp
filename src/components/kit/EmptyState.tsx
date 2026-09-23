'use client';

import Link from 'next/link';
import { Inbox, Lock, MapPinOff, RefreshCw, Search, TriangleAlert, type LucideIcon } from 'lucide-react';
import { cn } from '@/utils/Utils';

/**
 * Estados sin datos (Figma `EmptyState`, PATRONES §7 y §10). Todo estado lleva
 * **una acción**: nunca un callejón sin salida.
 *
 * - `empty`: no hay nada todavía → primer paso («Crear cliente»).
 * - `search`: los filtros no devuelven nada → «Limpiar filtros».
 * - `error`: no se pudo cargar → «Reintentar».
 * - `forbidden`: sin permiso → volver al inicio.
 * - `sinSucursal`: pantallas de ámbito de sucursal sin sucursal asignada. No
 *   revela nombres de administradores ni cuántas sucursales hay.
 *
 * `compacto` = `Layout=compact` (móvil y tablas dentro de tarjetas).
 */
export type VarianteEmptyState = 'empty' | 'search' | 'error' | 'forbidden' | 'sinSucursal';

export interface AccionEmptyState {
  etiqueta: string;
  onClick?: () => void;
  href?: string;
  icono?: LucideIcon;
}

export interface EmptyStateProps {
  variante?: VarianteEmptyState;
  titulo?: string;
  descripcion?: string;
  icono?: LucideIcon;
  /** Acción principal. En `search` y `error` se arma sola con `onLimpiarFiltros` / `onReintentar`. */
  accion?: AccionEmptyState;
  accionSecundaria?: AccionEmptyState;
  onLimpiarFiltros?: () => void;
  onReintentar?: () => void;
  /** `search`: el término buscado, para el título «Sin resultados para «…»». */
  termino?: string;
  compacto?: boolean;
  className?: string;
}

const PREDETERMINADOS: Record<
  VarianteEmptyState,
  { titulo: string; descripcion: string; icono: LucideIcon; caja: string }
> = {
  empty: {
    titulo: 'Aún no hay registros',
    descripcion: 'Cuando crees el primero, aparecerá aquí.',
    icono: Inbox,
    caja: 'bg-brand-tint text-brand',
  },
  search: {
    titulo: 'Sin resultados',
    descripcion: 'Prueba con otro término o quita un filtro.',
    icono: Search,
    caja: 'bg-brand-tint text-brand',
  },
  error: {
    titulo: 'No pudimos cargar la información',
    descripcion: 'Revisa tu conexión e inténtalo de nuevo.',
    icono: TriangleAlert,
    caja: 'bg-danger-subtle text-danger-text',
  },
  forbidden: {
    titulo: 'No tienes permiso para ver esta sección',
    descripcion: 'Pídele a un administrador de tu organización que te dé acceso.',
    icono: Lock,
    caja: 'bg-subtle text-fg-secondary',
  },
  sinSucursal: {
    titulo: 'No tienes ninguna sucursal asignada',
    descripcion: 'Para ver ventas, inventario y facturas necesitas que un administrador te asigne al menos una sucursal.',
    icono: MapPinOff,
    caja: 'bg-subtle text-fg-secondary',
  },
};

function BotonAccion({ accion, primaria }: { accion: AccionEmptyState; primaria: boolean }) {
  const Icono = accion.icono;
  const clases = cn(
    'inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2',
    primaria
      ? 'bg-brand-action text-fg-on-brand hover:bg-brand-action-hover'
      : 'border border-line-strong bg-surface text-fg hover:bg-hover',
  );
  const contenido = (
    <>
      {Icono && <Icono aria-hidden="true" className="size-4" strokeWidth={1.5} />}
      {accion.etiqueta}
    </>
  );
  if (accion.href) {
    return (
      <Link href={accion.href} className={clases}>
        {contenido}
      </Link>
    );
  }
  return (
    <button type="button" onClick={accion.onClick} className={clases}>
      {contenido}
    </button>
  );
}

export function EmptyState({
  variante = 'empty',
  titulo,
  descripcion,
  icono,
  accion,
  accionSecundaria,
  onLimpiarFiltros,
  onReintentar,
  termino,
  compacto,
  className,
}: EmptyStateProps) {
  const base = PREDETERMINADOS[variante];
  const Icono = icono ?? base.icono;
  const tituloFinal = titulo ?? (variante === 'search' && termino ? `Sin resultados para «${termino}»` : base.titulo);

  let principal = accion;
  if (!principal && variante === 'search' && onLimpiarFiltros) {
    principal = { etiqueta: 'Limpiar filtros', onClick: onLimpiarFiltros };
  }
  if (!principal && variante === 'error' && onReintentar) {
    principal = { etiqueta: 'Reintentar', onClick: onReintentar, icono: RefreshCw };
  }
  if (!principal && variante === 'forbidden') {
    principal = { etiqueta: 'Volver al inicio', href: '/app/inicio' };
  }
  // En «sin resultados» y «sin permiso» la acción es secundaria (contorno), como en Figma.
  const principalEsPrimaria = variante === 'empty' || variante === 'sinSucursal';

  return (
    <div
      role={variante === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compacto ? 'gap-3 px-4 py-10' : 'gap-4 px-6 py-16',
        className,
      )}
    >
      <div
        aria-hidden="true"
        className={cn('flex items-center justify-center rounded-full', compacto ? 'size-12' : 'size-14', base.caja)}
      >
        <Icono className={compacto ? 'size-5' : 'size-6'} strokeWidth={1.5} />
      </div>
      <div className="flex max-w-md flex-col gap-1">
        <h3 className="text-base font-semibold text-fg">{tituloFinal}</h3>
        <p className="text-sm text-fg-secondary">{descripcion ?? base.descripcion}</p>
      </div>
      {(principal || accionSecundaria) && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {accionSecundaria && <BotonAccion accion={accionSecundaria} primaria={false} />}
          {principal && <BotonAccion accion={principal} primaria={principalEsPrimaria} />}
        </div>
      )}
    </div>
  );
}
