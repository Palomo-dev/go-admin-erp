'use client';

import { useId, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { AlertTriangle, ChevronDown, RotateCw } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { Badge } from '@/components/ui/badge';
import { formatMoneda, type ContextoMoneda } from '@/lib/utils/moneda';
import { fechaCortaPlana } from './fechasCrm';
import { cantidadSinTasa, estadoKpiMoneda, fechaTasaInformada, formatearTasa, tieneDesglose } from './kpiMonedaLogica';
import { formatearEn, type ResumenMonedaBase } from './monedaCrm';

/**
 * KPI monetario del CRM (Figma `KpiMoneda` 759:22664): total en la moneda base
 * de la organización, convertido con la tasa del día contable. Desglose por
 * moneda a un clic. Si falta una tasa no se inventa: se suma lo que tiene tasa
 * y se avisa lo que quedó fuera, con el atajo para registrarla.
 *
 * El resumen lo arma `sumarEnMonedaBase` (o la RPC de KPI de la ola 1, M10,
 * con la misma forma); este componente solo lo pinta.
 */
export interface KpiMonedaProps {
  etiqueta: string;
  resumen: ResumenMonedaBase;
  monedaBase: ContextoMoneda;
  /** «23 oportunidades abiertas». */
  detalle?: string;
  /** Día contable de la conversión (`date`). */
  fechaContable?: string | null;
  /** Lleva a Finanzas › Monedas para registrar la tasa que falta. */
  onRegistrarTasa?: (moneda: string) => void;
  cargando?: boolean;
  error?: string | null;
  onReintentar?: () => void;
  className?: string;
}

export function KpiMoneda({
  etiqueta,
  resumen,
  monedaBase,
  detalle,
  fechaContable,
  onRegistrarTasa,
  cargando,
  error,
  onReintentar,
  className,
}: KpiMonedaProps) {
  const t = useTranslations('crm.kit.kpiMoneda');
  const idioma = useLocale();
  const idDesglose = useId();
  const [abierto, setAbierto] = useState(false);
  const fecha = fechaCortaPlana(fechaTasaInformada(resumen) ?? fechaContable, idioma);
  const faltaTasa = estadoKpiMoneda(resumen) === 'faltaTasa';
  const lineaDetalle = [detalle, fecha ? t('tasaDel', { fecha }) : null].filter(Boolean).join(' · ');

  return (
    <section
      aria-label={etiqueta}
      aria-busy={cargando || undefined}
      className={cn('flex min-w-0 flex-col gap-1.5 rounded-xl border border-line bg-surface p-4', className)}
    >
      <div className="flex items-center gap-2">
        <h3 className="truncate text-[13px] text-fg-secondary">{etiqueta}</h3>
        <span className="flex-1" />
        <Badge tono="neutro" apariencia="contorno" tamano="sm">
          {t('base', { moneda: monedaBase.code })}
        </Badge>
      </div>

      {cargando ? (
        <div aria-hidden="true" className="flex flex-col gap-2 py-1">
          <span className="h-7 w-40 animate-pulse rounded bg-subtle" />
          <span className="h-3 w-52 animate-pulse rounded bg-subtle" />
        </div>
      ) : error ? (
        <div role="alert" className="flex flex-col items-start gap-1 text-xs text-danger-text">
          <span>{error}</span>
          {onReintentar && (
            <button type="button" onClick={onReintentar} className="inline-flex items-center gap-1 font-medium text-brand-deep hover:underline">
              <RotateCw aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
              {t('reintentar')}
            </button>
          )}
        </div>
      ) : (
        <>
          <p className="text-2xl font-semibold tabular-nums text-fg">{formatMoneda(resumen.total, monedaBase)}</p>
          {lineaDetalle && <p className="text-xs text-fg-muted">{lineaDetalle}</p>}

          {faltaTasa && (
            <div className="flex flex-col gap-1 rounded-lg bg-warning-subtle px-3 py-2 text-xs text-warning-text">
              {resumen.sinTasa.map((g) => (
                <p key={g.moneda} className="flex items-start gap-1.5">
                  <AlertTriangle aria-hidden="true" className="mt-px size-3.5 shrink-0" strokeWidth={1.5} />
                  {t('noIncluye', {
                    monto: formatearEn(g.monto, g.moneda, monedaBase),
                    cantidad: g.cantidad,
                    moneda: g.moneda,
                    fecha: fecha || '—',
                  })}
                </p>
              ))}
            </div>
          )}

          {abierto && (
            <div id={idDesglose} className="flex flex-col gap-2 border-t border-line pt-2">
              <ul className="flex flex-col gap-1.5">
                {resumen.grupos.map((g) => {
                  const sinTasa = g.convertido === null;
                  const esBase = g.moneda === monedaBase.code;
                  return (
                    <li key={g.moneda} className="flex items-center gap-2 text-[13px]">
                      <Badge tono={sinTasa ? 'advertencia' : 'neutro'} tamano="sm">
                        {g.moneda}
                      </Badge>
                      <span className="font-medium text-fg">{formatearEn(g.monto, g.moneda, monedaBase)}</span>
                      <span className="flex-1" />
                      <span className={cn('text-xs', sinTasa ? 'text-warning-text' : 'text-fg-muted')}>
                        {esBase ? t('esBase') : sinTasa ? t('sinTasa') : formatMoneda(g.convertido, monedaBase)}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="text-xs text-fg-muted">
                {resumen.convertidas
                  .map((g) => t('tasaDe', { moneda: g.moneda, tasa: formatearTasa(g.tasa, idioma), fecha: fechaCortaPlana(g.fechaTasa, idioma) }))
                  .concat(resumen.sinTasa.map((g) => t('sinTasaNoSuma', { moneda: g.moneda })))
                  .join(' ')}
              </p>
              {onRegistrarTasa &&
                resumen.sinTasa.map((g) => (
                  <button
                    key={g.moneda}
                    type="button"
                    onClick={() => onRegistrarTasa(g.moneda)}
                    className="self-start text-xs font-medium text-brand-deep hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    {t('registrarTasa', { moneda: g.moneda })}
                  </button>
                ))}
            </div>
          )}

          {tieneDesglose(resumen) && (
            <button
              type="button"
              aria-expanded={abierto}
              aria-controls={abierto ? idDesglose : undefined}
              onClick={() => setAbierto((v) => !v)}
              className="inline-flex items-center gap-1 self-start text-xs font-medium text-brand-deep hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {abierto ? t('ocultarDesglose') : t('verPorMoneda')}
              <ChevronDown aria-hidden="true" className={cn('size-3.5 transition-transform', abierto && 'rotate-180')} strokeWidth={1.5} />
            </button>
          )}
          {cantidadSinTasa(resumen) > 0 && <span className="sr-only">{t('avisoLector', { cantidad: cantidadSinTasa(resumen) })}</span>}
        </>
      )}
    </section>
  );
}

