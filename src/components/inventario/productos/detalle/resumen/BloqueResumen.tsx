'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Pencil, type LucideIcon } from 'lucide-react';
import { FormSection } from '@/components/kit';
import { cn } from '@/utils/Utils';
import { useProductoDetalle } from '../ContextoProducto';

/** Anclas de las secciones del formulario único (`/editar#<seccion>`). */
export type SeccionFormulario =
  | 'informacion'
  | 'precios'
  | 'impuestos'
  | 'inventario'
  | 'variantes'
  | 'modificadores'
  | 'imagenes'
  | 'codigos'
  | 'organizacion'
  | 'avanzado';

/**
 * «Editar» de un bloque del Resumen: lleva a la sección del formulario único
 * (una sola vía de edición). Deshabilitado con motivo si el producto está
 * eliminado o el servidor dice que no hay permiso.
 */
export function EnlaceEditar({ seccion, etiqueta }: { seccion: SeccionFormulario; etiqueta: string }) {
  const ta = useTranslations('productoDetalle.acciones');
  const tc = useTranslations('productoDetalle.comun');
  const { producto, permisos, resumen } = useProductoDetalle();
  const motivo =
    producto.status === 'deleted' ? ta('motivoEliminado') : resumen && !permisos.editar ? ta('motivoSinPermiso') : undefined;
  const clase =
    'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';

  if (motivo) {
    return (
      <span role="link" aria-disabled="true" title={motivo} className={cn(clase, 'cursor-not-allowed text-fg-muted')}>
        <Pencil className="size-4" aria-hidden />
        {tc('editar')}
        <span className="sr-only">
          {etiqueta}. {motivo}
        </span>
      </span>
    );
  }
  return (
    <Link
      href={`/app/inventario/productos/${producto.uuid}/editar#${seccion}`}
      className={cn(clase, 'text-link hover:bg-hover')}
      aria-label={`${tc('editar')}: ${etiqueta}`}
    >
      <Pencil className="size-4" aria-hidden />
      {tc('editar')}
    </Link>
  );
}

/**
 * Bloque del Resumen (Figma `Producto — Detalles`, instancias de `FormSection`
 * 191:9407…): el `FormSection` del kit con icono, título, «Editar» (a la
 * sección del formulario único) y el cuerpo. Los datos van apilados etiqueta
 * sobre valor en dos columnas, como en Figma (por eso `Dato` y no `FilaDato`,
 * que es etiqueta a la izquierda y valor a la derecha).
 */
export function BloqueResumen({
  titulo,
  icono: Icono,
  seccion,
  accion,
  children,
  className,
}: {
  titulo: string;
  icono: LucideIcon;
  seccion?: SeccionFormulario;
  /** Acción extra junto a «Editar» (enlace a otra pestaña). */
  accion?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const acciones =
    accion || seccion ? (
      <div className="flex items-center gap-1">
        {accion}
        {seccion && <EnlaceEditar seccion={seccion} etiqueta={titulo} />}
      </div>
    ) : undefined;
  return (
    <FormSection titulo={titulo} icono={Icono} accion={acciones} className={className}>
      <div className="min-w-0">{children}</div>
    </FormSection>
  );
}

/** Rejilla de datos «etiqueta / valor» (2 columnas desde sm). */
export function Datos({ children, columnas = 2 }: { children: ReactNode; columnas?: 1 | 2 }) {
  return <dl className={cn('grid gap-x-6 gap-y-4', columnas === 2 && 'sm:grid-cols-2')}>{children}</dl>;
}

export function Dato({
  etiqueta,
  children,
  mono,
  ancho,
}: {
  etiqueta: string;
  children: ReactNode;
  mono?: boolean;
  /** Ocupa las dos columnas. */
  ancho?: boolean;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', ancho && 'sm:col-span-2')}>
      <dt className="text-xs font-medium text-fg-secondary">{etiqueta}</dt>
      <dd className={cn('min-w-0 break-words text-sm text-fg', mono && 'font-mono')}>{children}</dd>
    </div>
  );
}

/** Enlace a otra pestaña del detalle («Ver stock →»). */
export function EnlacePestana({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 items-center rounded-lg px-2.5 text-sm font-medium text-link hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      {children}
    </button>
  );
}
