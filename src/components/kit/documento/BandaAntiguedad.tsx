'use client';

import { cn } from '@/utils/Utils';
import { useKitT } from '../useIdiomaKit';
import { normalizarTramos, TRAMOS_ANTIGUEDAD, type TramoAntiguedad, type TramosEntrada } from './carteraLogica';

/**
 * Banda de antigüedad de la cartera (capturas `26-cartera-01-cobrar-listado.png`
 * y `26-cartera-08-pagar-listado.png`): al día · 1–30 · 31–60 · 61–90 · más de
 * 90 días, con el saldo (y el número de cuentas, si llega) de cada tramo. Cada
 * tramo es un botón conmutable que filtra el listado; la barra proporcional es
 * decorativa (la cifra va en el texto) y solo se ve desde md. En el celular
 * los cinco tramos van en una fila que se desliza. Una sola pieza para CxC y CxP.
 *
 * Solo pinta: los tramos los calcula la RPC o el servicio de cada dominio.
 */
export interface BandaAntiguedadProps {
  /** Lista `{ tramo, saldo, cuentas? }` (CxC) o mapa tramo → saldo (CxP). */
  tramos: TramosEntrada;
  formatear: (valor: number) => string;
  seleccionado?: TramoAntiguedad | string | null;
  onSeleccionar?: (tramo: TramoAntiguedad | null) => void;
  cargando?: boolean;
  /** Muestra el título y «Ver todos los tramos» (por defecto, sí). */
  conTitulo?: boolean;
  titulo?: string;
  className?: string;
}

const TONO: Record<TramoAntiguedad, string> = {
  al_dia: 'bg-success',
  d1_30: 'bg-warning',
  d31_60: 'bg-warning-text',
  d61_90: 'bg-danger',
  d90_mas: 'bg-danger-text',
};

export { TRAMOS_ANTIGUEDAD };

export function BandaAntiguedad({ tramos, formatear, seleccionado, onSeleccionar, cargando, conTitulo = true, titulo, className }: BandaAntiguedadProps) {
  const t = useKitT();
  const filas = normalizarTramos(tramos);
  const hayDatos = !!tramos;
  const nombre = titulo ?? t('documento.antiguedad.titulo');
  return (
    <section aria-label={nombre} className={cn('flex min-w-0 flex-col gap-2 rounded-xl border border-line bg-surface p-2 md:gap-3 md:p-4', className)}>
      {conTitulo && (
        <div className="flex items-center justify-between gap-2">
          <h2 className="min-w-0 truncate text-xs font-medium leading-4 text-fg-secondary md:text-sm md:font-semibold md:leading-5 md:text-fg">{nombre}</h2>
          {seleccionado && onSeleccionar && (
            <button
              type="button"
              onClick={() => onSeleccionar(null)}
              className="shrink-0 rounded text-xs font-medium text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand md:text-sm"
            >
              {t('documento.antiguedad.quitar')}
            </button>
          )}
        </div>
      )}
      <div aria-hidden="true" className="hidden h-2 w-full overflow-hidden rounded-full bg-subtle md:flex">
        {filas.map((f) => (f.porcentaje > 0 ? <span key={f.tramo} className={TONO[f.tramo]} style={{ width: `${f.porcentaje}%` }} /> : null))}
      </div>
      <div
        role="group"
        aria-label={t('documento.antiguedad.filtrar')}
        className="scrollbar-hide -mx-0.5 flex snap-x snap-mandatory gap-2 overflow-x-auto px-0.5 md:mx-0 md:grid md:snap-none md:grid-cols-5 md:overflow-visible md:px-0"
      >
        {filas.map((f) => {
          const activo = seleccionado === f.tramo;
          return (
            <button
              key={f.tramo}
              type="button"
              aria-pressed={activo}
              disabled={cargando || !onSeleccionar}
              onClick={() => onSeleccionar?.(activo ? null : f.tramo)}
              className={cn(
                'flex w-[8.25rem] shrink-0 snap-start flex-col items-start gap-0.5 rounded-lg border px-2.5 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-default md:w-auto md:min-w-0 md:shrink md:px-3 md:py-2',
                activo ? 'border-line-brand bg-brand-tint' : 'border-line bg-surface enabled:hover:bg-hover',
              )}
            >
              <span className="flex w-full min-w-0 items-center gap-1.5 text-xs text-fg-secondary">
                <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', TONO[f.tramo])} />
                <span className="truncate">{t(`documento.antiguedad.tramos.${f.tramo}`)}</span>
              </span>
              <span className={cn('w-full truncate text-sm font-semibold tabular-nums text-fg', cargando && 'animate-pulse text-fg-muted')}>
                {cargando || !hayDatos ? '—' : formatear(f.saldo)}
              </span>
              {f.cuentas !== null && !cargando && (
                <span className="hidden text-xs text-fg-muted md:inline">{t('documento.antiguedad.cuentas', { count: f.cuentas })}</span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
