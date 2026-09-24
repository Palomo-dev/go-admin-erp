'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { formatDateInTz, formatDateTimeInTz } from '@/lib/utils/dateDisplay';
import type { MonedaProducto } from '../ContextoProducto';
import type { PuntoSerie } from './datosPrecios';

/**
 * «Evolución de precios» (A.9 #11, gráfico real): precio y costo como líneas
 * escalonadas (cada valor rige hasta el siguiente cambio) sobre un eje de
 * tiempo, un solo eje de moneda. Precio en azul de marca (continuo), costo en
 * pizarra (discontinuo: no depende solo del color). Leyenda siempre visible;
 * la tabla de abajo es la vista accesible de los mismos datos.
 */
const COLOR_PRECIO = 'rgb(var(--brand-primary))';
const COLOR_COSTO = 'rgb(var(--text-secondary))';
const COLOR_REJILLA = 'rgb(var(--border-default))';
const COLOR_TEXTO = 'rgb(var(--text-muted))';

export function GraficoPrecios({
  serie,
  moneda,
  timezone,
  ahora,
}: {
  serie: readonly PuntoSerie[];
  moneda: MonedaProducto;
  timezone: string;
  ahora: number;
}) {
  const t = useTranslations('productoDetalle.precios.grafico');
  const locale = useLocaleIntl();
  const compacto = useMemo(() => new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }), [locale]);
  const hayCosto = serie.some((p) => p.costo !== null);
  const hayPrecio = serie.some((p) => p.precio !== null);
  const datos = useMemo(() => serie.map((p) => ({ ...p })), [serie]);

  if (serie.length < 2 || (!hayCosto && !hayPrecio)) {
    return <p className="flex h-40 items-center justify-center text-sm text-fg-muted">{t('insuficiente')}</p>;
  }

  const eje = (v: number) => formatDateInTz(new Date(v), timezone, { locale, month: 'short', year: '2-digit' });

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-wrap items-center gap-4 text-xs text-fg-secondary" aria-label={t('leyenda')}>
        {hayPrecio && (
          <li className="flex items-center gap-1.5">
            <svg width="20" height="8" aria-hidden>
              <line x1="0" y1="4" x2="20" y2="4" stroke={COLOR_PRECIO} strokeWidth="2" />
            </svg>
            {t('precio')}
          </li>
        )}
        {hayCosto && (
          <li className="flex items-center gap-1.5">
            <svg width="20" height="8" aria-hidden>
              <line x1="0" y1="4" x2="20" y2="4" stroke={COLOR_COSTO} strokeWidth="2" strokeDasharray="4 3" />
            </svg>
            {t('costo')}
          </li>
        )}
      </ul>
      <div className="h-64 w-full" role="img" aria-label={t('descripcionAccesible', { cambios: serie.length - 1 })}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={datos} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
            <CartesianGrid vertical={false} stroke={COLOR_REJILLA} strokeWidth={1} />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              tickFormatter={eje}
              tick={{ fill: COLOR_TEXTO, fontSize: 11 }}
              axisLine={{ stroke: COLOR_REJILLA }}
              tickLine={false}
              minTickGap={32}
            />
            <YAxis
              tickFormatter={(v: number) => `${moneda.simbolo} ${compacto.format(v)}`}
              tick={{ fill: COLOR_TEXTO, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={64}
              domain={[0, 'auto']}
            />
            <ReferenceLine x={ahora} stroke={COLOR_REJILLA} strokeDasharray="2 2" label={{ value: t('hoy'), position: 'insideTopRight', fill: COLOR_TEXTO, fontSize: 11 }} />
            <Tooltip
              cursor={{ stroke: COLOR_TEXTO, strokeWidth: 1 }}
              content={({ active, payload }) => {
                const punto = active && payload && payload.length > 0 ? (payload[0].payload as PuntoSerie) : null;
                if (!punto) return null;
                return (
                  <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs text-fg shadow-md">
                    <p className="mb-1 font-medium">{formatDateTimeInTz(new Date(punto.t), timezone, { locale })}</p>
                    {punto.precio !== null && (
                      <p className="flex justify-between gap-4">
                        <span className="text-fg-secondary">{t('precio')}</span>
                        <span className="font-semibold tabular-nums">{moneda.formatear(punto.precio)}</span>
                      </p>
                    )}
                    {punto.costo !== null && (
                      <p className="flex justify-between gap-4">
                        <span className="text-fg-secondary">{t('costo')}</span>
                        <span className="font-semibold tabular-nums">{moneda.formatear(punto.costo)}</span>
                      </p>
                    )}
                  </div>
                );
              }}
            />
            {hayPrecio && (
              <Line
                type="stepAfter"
                dataKey="precio"
                name={t('precio')}
                stroke={COLOR_PRECIO}
                strokeWidth={2}
                dot={{ r: 4, strokeWidth: 2, fill: 'rgb(var(--bg-surface))' }}
                activeDot={{ r: 6 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            )}
            {hayCosto && (
              <Line
                type="stepAfter"
                dataKey="costo"
                name={t('costo')}
                stroke={COLOR_COSTO}
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={{ r: 4, strokeWidth: 2, fill: 'rgb(var(--bg-surface))' }}
                activeDot={{ r: 6 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
