'use client';

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/Utils';
import { DataTable, type DataTableProps } from './DataTable';
import { RowActionsMenu } from './RowActionsMenu';
import type { AccionFila } from './acciones';

/**
 * Tabla de una sub-pestaña del detalle (Figma `EncabezadoSubseccion` 959:168129
 * y `FilaSubseccion` 959:168240): título con contador, descripción, filtros
 * mínimos a la derecha, la acción «Nuevo …» y un menú ⋯ de opciones; debajo,
 * `DataTable` con sus estados (cargando, vacío, error, sin permiso). Sin
 * acción ni menú cuando no hay permiso: la pantalla decide qué pasar.
 */
export interface TablaSubseccionProps<T> extends Omit<DataTableProps<T>, 'etiqueta'> {
  titulo: string;
  /** Contador junto al título (total de registros). */
  contador?: number;
  descripcion?: ReactNode;
  /** «Nueva orden», «Registrar costo faltante»… */
  accionNueva?: { etiqueta: string; onClick: () => void; icono?: LucideIcon; deshabilitada?: boolean };
  /** Menú ⋯ de la sub-sección (exportar, ir al reporte…). */
  opciones?: readonly AccionFila[];
  /** Filtros mínimos (selector de sucursal, versión, estado). */
  filtros?: ReactNode;
  /** Contenido entre la cabecera y la tabla (KPI, avisos). */
  encabezadoExtra?: ReactNode;
  /** Nombre accesible de la tabla (por defecto, el título). */
  etiqueta?: string;
  /** Sin tabla (la sub-sección muestra solo `encabezadoExtra` o su propio contenido). */
  sinTabla?: boolean;
  children?: ReactNode;
  claseContenedor?: string;
}

export function TablaSubseccion<T>({
  titulo,
  contador,
  descripcion,
  accionNueva,
  opciones,
  filtros,
  encabezadoExtra,
  etiqueta,
  sinTabla,
  children,
  claseContenedor,
  ...tabla
}: TablaSubseccionProps<T>) {
  const IconoNueva = accionNueva?.icono ?? Plus;
  const idTitulo = `subseccion-${titulo.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <section aria-labelledby={idTitulo} className={cn('flex flex-col gap-4', claseContenedor)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id={idTitulo} className="flex items-center gap-2 text-lg font-semibold leading-6 text-fg">
            {titulo}
            {contador !== undefined && (
              <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-subtle px-2 text-xs font-medium tabular-nums text-fg-secondary">
                {contador}
              </span>
            )}
          </h2>
          {descripcion && <p className="max-w-3xl text-[13px] leading-5 text-fg-secondary">{descripcion}</p>}
        </div>
        {(accionNueva || (opciones && opciones.length > 0) || filtros) && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {filtros}
            {accionNueva && (
              <Button className="h-10 gap-2" onClick={accionNueva.onClick} disabled={accionNueva.deshabilitada}>
                <IconoNueva aria-hidden="true" className="size-4" strokeWidth={1.75} />
                {accionNueva.etiqueta}
              </Button>
            )}
            {opciones && opciones.length > 0 && <RowActionsMenu acciones={opciones} titulo={titulo} orientacion="horizontal" tamano="md" />}
          </div>
        )}
      </div>
      {encabezadoExtra}
      {!sinTabla && <DataTable etiqueta={etiqueta ?? titulo} {...tabla} />}
      {children}
    </section>
  );
}
