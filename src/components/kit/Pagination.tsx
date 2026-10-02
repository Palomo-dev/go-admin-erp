'use client';

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TAMANOS_PAGINA, calcularRango, paginasVisibles, sustantivoPara, type Sustantivo } from './paginacion';
import { useFormatoEntero, useKitT, useSustantivoKit } from './useIdiomaKit';
import { PaginationCompact } from './PaginationCompact';

/**
 * La paginación única de la app (Figma `Pagination`, PATRONES §2), al pie de
 * la tabla y con su ancho: «Mostrando a a b de n {sustantivo}» y el tamaño de
 * página a la izquierda; primera · anterior · números · siguiente · última a
 * la derecha.
 *
 * `layout="auto"` dibuja la completa en escritorio y la compacta en móvil.
 * En «cargando» se ve igual, con el resumen en esqueleto y los controles
 * deshabilitados (sin salto de maquetación). No se dibuja en vacío ni en error:
 * eso lo decide `DataTable`.
 *
 * `DataTablePagination` (ui) delega aquí: las pantallas viejas ya se ven igual.
 */
export interface PaginationProps {
  pagina: number;
  tamano: number;
  total: number;
  onPaginaChange: (pagina: number) => void;
  /** Sin él no se muestra el selector de tamaño. */
  onTamanoChange?: (tamano: number) => void;
  opcionesTamano?: readonly number[];
  /** «sesiones», «clientes»: el del dominio, nunca el de otra pantalla (PATRONES §12). */
  sustantivo?: Sustantivo;
  cargando?: boolean;
  layout?: 'auto' | 'full' | 'compact';
  /** Selector 32 px y resumen Small13 del listado de Llamadas. */
  densidad?: 'normal' | 'compacta';
  className?: string;
}

const BOTON =
  'flex h-8 items-center justify-center rounded-lg border text-sm tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:pointer-events-none disabled:opacity-50';
const BOTON_NORMAL = 'w-8 border-line-strong bg-surface text-fg hover:bg-hover';

function PaginationFull({
  pagina,
  tamano,
  total,
  onPaginaChange,
  onTamanoChange,
  opcionesTamano = TAMANOS_PAGINA,
  sustantivo: sustantivoProp,
  cargando,
  densidad = 'normal',
  className,
}: Omit<PaginationProps, 'layout'>) {
  const t = useKitT();
  const entero = useFormatoEntero();
  const sustantivoKit = useSustantivoKit('registro');
  const sustantivo = sustantivoProp ?? sustantivoKit;
  const r = calcularRango(pagina, tamano, total);
  const opciones = opcionesTamano.includes(tamano) ? opcionesTamano : [...opcionesTamano, tamano].sort((a, b) => a - b);

  return (
    <nav aria-label={t('paginacion.etiqueta')} className={cn('flex flex-wrap items-center justify-between gap-3', className)}>
      <div className="flex items-center gap-3">
        {cargando ? (
          <Skeleton className="h-4 w-48" />
        ) : (
          <span className={cn('text-fg-secondary tabular-nums', densidad === 'compacta' ? 'text-[13px] leading-[18px]' : 'text-sm')} aria-live="polite">
            {r.total === 0
              ? t('paginacion.vacio', { sustantivo: sustantivo.plural })
              : t('paginacion.resumen', {
                  desde: entero(r.desde),
                  hasta: entero(r.hasta),
                  total: entero(r.total),
                  sustantivo: sustantivoPara(r.total, sustantivo),
                })}
          </span>
        )}
        {onTamanoChange && (
          <Select value={String(tamano)} onValueChange={(v) => onTamanoChange(Number(v))} disabled={cargando}>
            <SelectTrigger
              aria-label={t('paginacion.porPaginaEtiqueta')}
              className={cn('w-[150px] rounded-lg border-line-strong bg-surface text-fg focus:ring-brand', densidad === 'compacta' ? 'h-8 text-[13px] leading-[18px]' : 'h-10 text-sm')}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {opciones.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {t('paginacion.porPagina', { n: entero(n) })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {r.totalPaginas > 1 && (
        <ul className="flex items-center gap-1.5">
          <li>
            <button
              type="button"
              className={cn(BOTON, BOTON_NORMAL)}
              aria-label={t('paginacion.primera')}
              disabled={cargando || r.pagina <= 1}
              onClick={() => onPaginaChange(1)}
            >
              <ChevronsLeft aria-hidden="true" className="size-4" strokeWidth={1.5} />
            </button>
          </li>
          <li>
            <button
              type="button"
              className={cn(BOTON, BOTON_NORMAL)}
              aria-label={t('paginacion.anterior')}
              disabled={cargando || r.pagina <= 1}
              onClick={() => onPaginaChange(r.pagina - 1)}
            >
              <ChevronLeft aria-hidden="true" className="size-4" strokeWidth={1.5} />
            </button>
          </li>
          {paginasVisibles(r.pagina, r.totalPaginas).map((p) =>
            typeof p === 'number' ? (
              <li key={p}>
                <button
                  type="button"
                  aria-label={t('paginacion.pagina', { n: entero(p) })}
                  aria-current={p === r.pagina ? 'page' : undefined}
                  disabled={cargando}
                  onClick={() => p !== r.pagina && onPaginaChange(p)}
                  className={cn(
                    BOTON,
                    'min-w-8 px-1.5',
                    p === r.pagina
                      ? 'border-brand-action bg-brand-action font-semibold text-fg-on-brand'
                      : 'border-transparent bg-transparent text-fg hover:bg-hover',
                  )}
                >
                  {p}
                </button>
              </li>
            ) : (
              <li key={p} aria-hidden="true" className="flex size-8 items-center justify-center text-sm text-fg-muted">
                …
              </li>
            ),
          )}
          <li>
            <button
              type="button"
              className={cn(BOTON, BOTON_NORMAL)}
              aria-label={t('paginacion.siguiente')}
              disabled={cargando || r.pagina >= r.totalPaginas}
              onClick={() => onPaginaChange(r.pagina + 1)}
            >
              <ChevronRight aria-hidden="true" className="size-4" strokeWidth={1.5} />
            </button>
          </li>
          <li>
            <button
              type="button"
              className={cn(BOTON, BOTON_NORMAL)}
              aria-label={t('paginacion.ultima')}
              disabled={cargando || r.pagina >= r.totalPaginas}
              onClick={() => onPaginaChange(r.totalPaginas)}
            >
              <ChevronsRight aria-hidden="true" className="size-4" strokeWidth={1.5} />
            </button>
          </li>
        </ul>
      )}
    </nav>
  );
}

export function Pagination({ layout = 'auto', className, densidad = 'normal', ...props }: PaginationProps) {
  if (layout === 'full') return <PaginationFull {...props} densidad={densidad} className={className} />;
  if (layout === 'compact') return <PaginationCompact {...props} className={className} />;
  return (
    <>
      <PaginationFull {...props} densidad={densidad} className={cn('hidden lg:flex', className)} />
      <PaginationCompact {...props} className={cn('lg:hidden', className)} />
    </>
  );
}
