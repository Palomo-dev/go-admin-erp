'use client';

/**
 * Piezas de cupo del plan (Figma 08, secciones 5, 6, 7 y 9):
 * - `ChipCupo`: «8/10 usuarios · Comprar usuarios» junto al buscador;
 * - `MedidorUso`: barra proporcional, amarilla desde el 80 % y roja desde el
 *   95 %, con «Comprar más» al lado;
 * - `AvisoCupo`: banner cuando el cupo se llenó, con salida (comprar o cambiar
 *   de plan). No borra la tabla: va encima.
 */
import Link from 'next/link';
import type { ReactNode } from 'react';
import { AlertTriangle, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/utils/Utils';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { nivelUso, porcentajeUso, type Cupo, type NivelUso } from '@/lib/organizacion/cupo';

const COLOR_BARRA: Record<NivelUso, string> = {
  normal: 'bg-brand-action',
  advertencia: 'bg-warning',
  peligro: 'bg-danger',
  ilimitado: 'bg-brand-action',
};

const COLOR_CHIP: Record<NivelUso, string> = {
  normal: 'border-line-brand bg-brand-tint text-brand-deep',
  advertencia: 'border-line-warning bg-warning-subtle text-warning-text',
  peligro: 'border-line-danger bg-danger-subtle text-danger-text',
  ilimitado: 'border-line bg-subtle text-fg-secondary',
};

export function ChipCupo({
  cupo,
  tipo,
  onComprar,
}: {
  cupo: Cupo | null;
  tipo: 'usuarios' | 'sucursales';
  onComprar?: () => void;
}) {
  const t = useTranslations('org.acceso.cupo');
  const entero = useFormatoEntero();
  if (!cupo || cupo.maximo === null) return null;
  const texto = t(`chip.${tipo}`, { usados: entero(cupo.usados), maximo: entero(cupo.maximo) });
  const contenido = (
    <>
      <span className="tabular-nums">{texto}</span>
      {onComprar && (
        <>
          <span aria-hidden="true">·</span>
          <span className="underline-offset-2 group-hover:underline">{t(`comprar.${tipo}`)}</span>
        </>
      )}
    </>
  );
  const clases = cn(
    'group inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[13px] font-medium',
    COLOR_CHIP[cupo.nivel],
  );
  if (!onComprar) return <span className={clases}>{contenido}</span>;
  return (
    <button type="button" onClick={onComprar} className={cn(clases, 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand')}>
      {contenido}
    </button>
  );
}

export function MedidorUso({
  etiqueta,
  actual,
  maximo,
  valor,
  detalle,
  onComprar,
  textoComprar,
}: {
  etiqueta: string;
  actual: number;
  maximo: number | null;
  /** Texto de la cifra («8 de 10»). */
  valor: string;
  detalle?: ReactNode;
  onComprar?: () => void;
  textoComprar?: string;
}) {
  const t = useTranslations('org.acceso.cupo');
  const pct = porcentajeUso(actual, maximo);
  const nivel = nivelUso(actual, maximo);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-fg">{etiqueta}</span>
        <div className="flex items-center gap-3">
          <span className="text-sm tabular-nums text-fg-secondary">{valor}</span>
          {onComprar && (
            <button
              type="button"
              onClick={onComprar}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[13px] font-medium text-brand hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {textoComprar ?? t('comprarMas')}
            </button>
          )}
        </div>
      </div>
      <div
        role="progressbar"
        aria-label={etiqueta}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct === null ? undefined : Math.round(pct)}
        aria-valuetext={valor}
        className="h-2 w-full overflow-hidden rounded-full bg-subtle"
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none', COLOR_BARRA[nivel])}
          // Un uso mínimo se ve (el Figma pinta una muesca): nunca 0 px con algo usado.
          style={{ width: pct === null ? '0%' : `${actual > 0 ? Math.max(pct, 1) : 0}%` }}
        />
      </div>
      {detalle && <p className="text-xs text-fg-secondary">{detalle}</p>}
    </div>
  );
}

export function AvisoCupo({
  titulo,
  descripcion,
  onComprar,
  textoComprar,
  hrefPlan = '/app/organizacion/plan',
}: {
  titulo: string;
  descripcion: string;
  onComprar?: () => void;
  textoComprar: string;
  hrefPlan?: string;
}) {
  const t = useTranslations('org.acceso.cupo');
  return (
    <div role="status" className="flex flex-col gap-3 rounded-xl border border-line-warning bg-warning-subtle p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 gap-3">
        <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-warning-text" strokeWidth={1.5} />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-warning-text">{titulo}</p>
          <p className="text-[13px] text-fg-secondary">{descripcion}</p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {onComprar && (
          <button
            type="button"
            onClick={onComprar}
            className="inline-flex h-9 items-center rounded-lg bg-brand-action px-3 text-sm font-medium text-fg-on-brand hover:bg-brand-action-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            {textoComprar}
          </button>
        )}
        <Link
          href={hrefPlan}
          className="inline-flex h-9 items-center rounded-lg border border-line-strong bg-surface px-3 text-sm font-medium text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {t('cambiarPlan')}
        </Link>
      </div>
    </div>
  );
}
