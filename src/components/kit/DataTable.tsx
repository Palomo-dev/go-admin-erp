'use client';

import * as React from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, type EmptyStateProps } from './EmptyState';
import { RowActionsMenu } from './RowActionsMenu';
import type { AccionFila } from './acciones';
import type { OrdenListado } from './listadoUrl';
import { alternarId, alternarPagina, estadoCasillaCabecera } from './seleccion';
import { UMBRAL_VIRTUALIZACION, calcularVentana } from './virtualizacion';
import { useKitT } from './useIdiomaKit';

/**
 * La tabla del kit (Figma `DataTable` + `TableCell` 106:3688, PATRONES §5–7).
 *
 * - Columnas tipadas; importes a la derecha con números tabulares, códigos en mono.
 * - Casilla de selección como **primera** columna (44 px) con indeterminado.
 * - «⋯» como **última** columna (44 px), fija a la derecha: no participa del
 *   desplazamiento horizontal. Como mucho 2 iconos sueltos, no destructivos.
 * - La fila entera abre el detalle (clic, Enter o Espacio); sin icono de «ojo».
 * - Estados integrados: `cargando` (esqueleto + paginación deshabilitada),
 *   `vacio`, `sinResultados`, `error`, `sinPermiso`. La paginación (`pie`) solo
 *   se dibuja en `listo` y `cargando`.
 * - Móvil (< lg) con `tarjetaMovil`: una tarjeta por registro, sin scroll
 *   horizontal (`Layout=cards`).
 * - Más de 500 filas en el navegador: se virtualiza (solo se montan las visibles).
 */
export type EstadoTabla = 'listo' | 'cargando' | 'vacio' | 'sinResultados' | 'error' | 'sinPermiso';

export interface ColumnaTabla<T> {
  id: string;
  encabezado: string;
  celda: (fila: T, indice: number) => React.ReactNode;
  /** `importe` alinea a la derecha con números tabulares; `mono` para SKU y códigos. */
  variante?: 'texto' | 'importe' | 'mono';
  alinear?: 'izquierda' | 'derecha' | 'centro';
  /** Ancho fijo (px o CSS). */
  ancho?: number | string;
  ordenable?: boolean;
  /** Campo que se manda al servidor; por defecto `id`. */
  campoOrden?: string;
  /** Oculta la columna por debajo del corte (en lugar de `hidden md:table-cell` a mano). */
  ocultarDebajo?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export interface ContextoTarjeta {
  seleccionado: boolean;
  /** Hay al menos un registro seleccionado: las tarjetas muestran su casilla. */
  modoSeleccion: boolean;
  alternar: (seleccionado: boolean) => void;
}

export interface DataTableProps<T> {
  columnas: readonly ColumnaTabla<T>[];
  filas: readonly T[];
  obtenerId: (fila: T) => string;
  /** Nombre accesible de la tabla («Proveedores»). */
  etiqueta: string;
  /** Por defecto `listo`; con `listo` y sin filas pasa a `vacio`. */
  estado?: EstadoTabla;
  densidad?: 'comoda' | 'compacta';
  orden?: OrdenListado | null;
  onOrdenar?: (campo: string) => void;
  /** Con `onSeleccionChange` aparece la columna de casillas. */
  seleccion?: ReadonlySet<string>;
  onSeleccionChange?: (seleccion: Set<string>) => void;
  onFilaClick?: (fila: T) => void;
  /** Nombre del registro para las casillas y el menú («Ferretería de ejemplo S.A.S.»). */
  etiquetaFila?: (fila: T) => string;
  acciones?: (fila: T) => readonly AccionFila[];
  /** Como mucho 2 IconButton frecuentes y no destructivos, antes del «⋯». */
  accionesRapidas?: (fila: T) => React.ReactNode;
  tonoFila?: (fila: T) => 'peligro' | 'advertencia' | undefined;
  tarjetaMovil?: (fila: T, ctx: ContextoTarjeta) => React.ReactNode;
  /** Textos y acción de cada estado vacío (se combinan con los del kit). */
  vacio?: Partial<EmptyStateProps>;
  sinResultados?: Partial<EmptyStateProps>;
  error?: Partial<EmptyStateProps>;
  sinPermiso?: Partial<EmptyStateProps>;
  onReintentar?: () => void;
  onLimpiarFiltros?: () => void;
  /** Término buscado, para «Sin resultados para «…»». */
  termino?: string;
  /** Normalmente `<Pagination />`. */
  pie?: React.ReactNode;
  virtualizar?: boolean | 'auto';
  /** Alto de fila para la virtualización (por defecto el de la densidad). */
  altoFila?: number;
  /** Alto máximo del área con scroll cuando se virtualiza. */
  altoMaximo?: string;
  filasEsqueleto?: number;
  className?: string;
}

const OCULTAR: Record<NonNullable<ColumnaTabla<unknown>['ocultarDebajo']>, string> = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
  xl: 'hidden xl:table-cell',
};

const TONO_FILA = { peligro: 'bg-danger-subtle/60', advertencia: 'bg-warning-subtle/60' } as const;

function alineacion<T>(c: ColumnaTabla<T>): string {
  const a = c.alinear ?? (c.variante === 'importe' ? 'derecha' : 'izquierda');
  return a === 'derecha' ? 'text-right' : a === 'centro' ? 'text-center' : 'text-left';
}

function estiloAncho(ancho: ColumnaTabla<unknown>['ancho']): React.CSSProperties | undefined {
  if (ancho === undefined) return undefined;
  const w = typeof ancho === 'number' ? `${ancho}px` : ancho;
  return { width: w, minWidth: w };
}

export function DataTable<T>({
  columnas,
  filas,
  obtenerId,
  etiqueta,
  estado: estadoProp = 'listo',
  densidad = 'comoda',
  orden,
  onOrdenar,
  seleccion,
  onSeleccionChange,
  onFilaClick,
  etiquetaFila,
  acciones,
  accionesRapidas,
  tonoFila,
  tarjetaMovil,
  vacio,
  sinResultados,
  error,
  sinPermiso,
  onReintentar,
  onLimpiarFiltros,
  termino,
  pie,
  virtualizar = 'auto',
  altoFila,
  altoMaximo = '70vh',
  filasEsqueleto = 8,
  className,
}: DataTableProps<T>) {
  const t = useKitT();
  const estado: EstadoTabla = estadoProp === 'listo' && filas.length === 0 ? 'vacio' : estadoProp;
  const seleccionable = !!onSeleccionChange;
  const sel = React.useMemo(() => seleccion ?? new Set<string>(), [seleccion]);
  const idsPagina = React.useMemo(() => filas.map(obtenerId), [filas, obtenerId]);
  const casillaCabecera = estadoCasillaCabecera(sel, idsPagina);
  const conAcciones = !!acciones || !!accionesRapidas;
  const totalColumnas = columnas.length + (seleccionable ? 1 : 0) + (conAcciones ? 1 : 0);
  const alto = altoFila ?? (densidad === 'comoda' ? 52 : 40);

  const usarVirtual =
    estado === 'listo' && (virtualizar === true || (virtualizar === 'auto' && filas.length > UMBRAL_VIRTUALIZACION));
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = React.useState({ top: 0, alto: 600 });
  React.useEffect(() => {
    if (!usarVirtual || !scrollRef.current) return;
    const el = scrollRef.current;
    const ro = new ResizeObserver(() => setScroll((s) => ({ ...s, alto: el.clientHeight })));
    ro.observe(el);
    return () => ro.disconnect();
  }, [usarVirtual]);
  const ventana = usarVirtual
    ? calcularVentana({ scrollTop: scroll.top, altoVisible: scroll.alto, altoFila: alto, total: filas.length })
    : { inicio: 0, fin: filas.length, espacioArriba: 0, espacioAbajo: 0 };

  const alternarFila = (id: string, valor?: boolean) => {
    if (!onSeleccionChange) return;
    if (valor === undefined || valor !== sel.has(id)) onSeleccionChange(alternarId(sel, id));
  };

  // ── Estados sin filas ────────────────────────────────────────────────────
  const estadoVacio = (compacto: boolean): React.ReactNode => {
    switch (estado) {
      case 'vacio':
        return <EmptyState variante="empty" compacto={compacto} {...vacio} />;
      case 'sinResultados':
        return (
          <EmptyState variante="search" termino={termino} onLimpiarFiltros={onLimpiarFiltros} compacto={compacto} {...sinResultados} />
        );
      case 'error':
        return <EmptyState variante="error" onReintentar={onReintentar} compacto={compacto} {...error} />;
      case 'sinPermiso':
        return <EmptyState variante="forbidden" compacto={compacto} {...sinPermiso} />;
      default:
        return null;
    }
  };
  const mostrarPie = (estado === 'listo' || estado === 'cargando') && pie;

  // ── Cabecera ─────────────────────────────────────────────────────────────
  const cabecera = (
    <thead className={cn('bg-subtle', usarVirtual && 'sticky top-0 z-20')}>
      <tr className="border-b border-line">
        {seleccionable && (
          <th scope="col" className="w-11 min-w-11 pl-4 pr-0">
            <Checkbox
              checked={casillaCabecera}
              disabled={estado !== 'listo'}
              onCheckedChange={() => onSeleccionChange?.(alternarPagina(sel, idsPagina))}
              aria-label={t('tabla.seleccionarPagina')}
              className="size-[18px] rounded"
            />
          </th>
        )}
        {columnas.map((c) => {
          const campo = c.campoOrden ?? c.id;
          const activa = orden?.campo === campo;
          const ordenable = c.ordenable && !!onOrdenar;
          const IconoOrden = !activa ? ArrowUpDown : orden?.direccion === 'asc' ? ArrowUp : ArrowDown;
          return (
            <th
              key={c.id}
              scope="col"
              style={estiloAncho(c.ancho)}
              aria-sort={activa ? (orden?.direccion === 'asc' ? 'ascending' : 'descending') : ordenable ? 'none' : undefined}
              className={cn(
                'h-10 whitespace-nowrap px-3 text-xs font-medium text-fg-secondary first:pl-4',
                alineacion(c),
                c.ocultarDebajo && OCULTAR[c.ocultarDebajo],
                c.className,
              )}
            >
              {ordenable ? (
                <button
                  type="button"
                  onClick={() => onOrdenar?.(campo)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-sm hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                    alineacion(c) === 'text-right' && 'flex-row-reverse',
                    activa && 'text-fg',
                  )}
                >
                  {c.encabezado}
                  <IconoOrden aria-hidden="true" className={cn('size-3.5', !activa && 'text-fg-muted')} strokeWidth={1.5} />
                </button>
              ) : (
                c.encabezado
              )}
            </th>
          );
        })}
        {conAcciones && (
          <th scope="col" className="sticky right-0 w-11 min-w-11 bg-subtle pr-2">
            <span className="sr-only">{t('comun.acciones')}</span>
          </th>
        )}
      </tr>
    </thead>
  );

  // ── Cuerpo ───────────────────────────────────────────────────────────────
  const celdaPad = densidad === 'comoda' ? 'py-2.5' : 'py-1.5';
  const cuerpo = (
    <tbody>
      {estado === 'cargando' &&
        Array.from({ length: filasEsqueleto }, (_, i) => (
          <tr key={`esq-${i}`} className="border-b border-line last:border-b-0" style={{ height: alto }}>
            {seleccionable && (
              <td className="pl-4">
                <Skeleton className="size-[18px] rounded" />
              </td>
            )}
            {columnas.map((c) => (
              <td key={c.id} className={cn('px-3 first:pl-4', c.ocultarDebajo && OCULTAR[c.ocultarDebajo])}>
                <Skeleton className={cn('h-4', c.variante === 'importe' ? 'ml-auto w-16' : 'w-3/4')} />
              </td>
            ))}
            {conAcciones && <td className="sticky right-0 bg-surface" />}
          </tr>
        ))}

      {estado !== 'listo' && estado !== 'cargando' && (
        <tr>
          <td colSpan={totalColumnas}>{estadoVacio(false)}</td>
        </tr>
      )}

      {estado === 'listo' && ventana.espacioArriba > 0 && (
        <tr aria-hidden="true" style={{ height: ventana.espacioArriba }} />
      )}
      {estado === 'listo' &&
        filas.slice(ventana.inicio, ventana.fin).map((fila, i) => {
          const indice = ventana.inicio + i;
          const id = idsPagina[indice];
          const marcada = sel.has(id);
          const nombre = etiquetaFila?.(fila);
          const tono = tonoFila?.(fila);
          const accionesFila = acciones?.(fila);
          return (
            <tr
              key={id}
              aria-rowindex={usarVirtual ? indice + 2 : undefined}
              aria-selected={seleccionable ? marcada : undefined}
              tabIndex={onFilaClick ? 0 : undefined}
              onClick={onFilaClick ? () => onFilaClick(fila) : undefined}
              onKeyDown={
                onFilaClick
                  ? (e) => {
                      if (e.target !== e.currentTarget) return;
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onFilaClick(fila);
                      }
                    }
                  : undefined
              }
              style={usarVirtual ? { height: alto } : undefined}
              className={cn(
                'group/fila border-b border-line text-sm text-fg last:border-b-0',
                tono && TONO_FILA[tono],
                marcada && 'bg-brand-tint/50',
                onFilaClick &&
                  'cursor-pointer hover:bg-hover focus-visible:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand',
              )}
            >
              {seleccionable && (
                <td className={cn('pl-4 pr-0', celdaPad)} onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={marcada}
                    onCheckedChange={(v) => alternarFila(id, v === true)}
                    aria-label={nombre ? t('tabla.seleccionar', { nombre }) : t('tabla.seleccionarFila')}
                    className="size-[18px] rounded"
                  />
                </td>
              )}
              {columnas.map((c) => (
                <td
                  key={c.id}
                  style={estiloAncho(c.ancho)}
                  className={cn(
                    'px-3 align-middle first:pl-4',
                    celdaPad,
                    alineacion(c),
                    c.variante === 'importe' && 'whitespace-nowrap tabular-nums',
                    c.variante === 'mono' && 'font-mono text-[13px]',
                    c.ocultarDebajo && OCULTAR[c.ocultarDebajo],
                    c.className,
                  )}
                >
                  {c.celda(fila, indice)}
                </td>
              ))}
              {conAcciones && (
                <td
                  className={cn(
                    'sticky right-0 w-11 bg-surface pr-2 text-right group-hover/fila:bg-hover',
                    tono && TONO_FILA[tono],
                    marcada && 'bg-brand-tint',
                    celdaPad,
                  )}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-end gap-1">
                    {accionesRapidas?.(fila)}
                    {accionesFila && accionesFila.length > 0 && <RowActionsMenu acciones={accionesFila} titulo={nombre} />}
                  </div>
                </td>
              )}
            </tr>
          );
        })}
      {estado === 'listo' && ventana.espacioAbajo > 0 && (
        <tr aria-hidden="true" style={{ height: ventana.espacioAbajo }} />
      )}
    </tbody>
  );

  // ── Móvil: tarjetas ──────────────────────────────────────────────────────
  const modoSeleccion = sel.size > 0;
  const tarjetas = tarjetaMovil && (
    <div className="flex flex-col gap-3 lg:hidden">
      {estado === 'cargando' &&
        Array.from({ length: Math.min(filasEsqueleto, 5) }, (_, i) => (
          <div key={`esq-t-${i}`} className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3">
            <Skeleton className="size-10 rounded-lg" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-4 w-12" />
          </div>
        ))}
      {estado !== 'listo' && estado !== 'cargando' && (
        <div className="rounded-xl border border-line bg-surface">{estadoVacio(true)}</div>
      )}
      {estado === 'listo' && (
        <ul aria-label={etiqueta} className="flex flex-col gap-3">
          {filas.map((fila, i) => {
            const id = idsPagina[i];
            return (
              <li key={id}>
                {tarjetaMovil(fila, {
                  seleccionado: sel.has(id),
                  modoSeleccion: seleccionable && modoSeleccion,
                  alternar: (v) => alternarFila(id, v),
                })}
              </li>
            );
          })}
        </ul>
      )}
      {mostrarPie && <div>{pie}</div>}
    </div>
  );

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {tarjetas}
      <div className={cn('overflow-hidden rounded-xl border border-line bg-surface', tarjetaMovil && 'hidden lg:block')}>
        <div
          ref={scrollRef}
          onScroll={usarVirtual ? (e) => setScroll({ top: e.currentTarget.scrollTop, alto: e.currentTarget.clientHeight }) : undefined}
          className={cn('overflow-x-auto', usarVirtual && 'overflow-y-auto')}
          style={usarVirtual ? { maxHeight: altoMaximo } : undefined}
        >
          <table
            aria-label={etiqueta}
            aria-busy={estado === 'cargando' || undefined}
            aria-rowcount={usarVirtual ? filas.length + 1 : undefined}
            className="w-full border-collapse"
          >
            {cabecera}
            {cuerpo}
          </table>
        </div>
        {mostrarPie && <div className="border-t border-line px-4 py-3">{pie}</div>}
      </div>
    </div>
  );
}
