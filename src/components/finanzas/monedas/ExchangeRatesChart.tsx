'use client';

import { useTranslations } from 'next-intl';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Skeleton } from '@/components/kit';
import { sincronizarTasasDeCambio } from '@/lib/services/tasasCambioCliente';
import { DIAS_GRAFICA, type PuntoGrafica } from '@/lib/finanzas/monedas/tasasLogica';
import type { FormatoTasas } from './useFormatoTasas';
import { useSincronizarCatalogo } from './piezasTasas';

/**
 * M2 · gráfica de los últimos 30 días, arriba de la tabla del histórico.
 * Una línea en azul de marca; los días con tasa manual llevan un punto
 * relleno (y el tooltip lo dice: no depende solo del color). La tabla de
 * abajo es la vista accesible de los mismos datos.
 */
const COLOR_LINEA = 'rgb(var(--brand-primary))';
const COLOR_REJILLA = 'rgb(var(--border-default))';
const COLOR_TEXTO = 'rgb(var(--text-muted))';
const COLOR_FONDO = 'rgb(var(--bg-surface))';

export interface GraficaTasasProps {
  puntos: readonly PuntoGrafica[];
  /** «USD/COP». */
  par: string;
  formato: FormatoTasas;
  cargando: boolean;
  onSincronizado?: () => void;
}

export default function GraficaTasas({ puntos, par, formato, cargando, onSincronizado }: GraficaTasasProps) {
  const t = useTranslations('finanzasMonedasR2.grafica');
  const tComun = useTranslations('finanzasMonedasR2.comun');
  const { sincronizando, sincronizarCatalogo } = useSincronizarCatalogo(sincronizarTasasDeCambio, onSincronizado);

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4" aria-label={t('titulo', { par, dias: DIAS_GRAFICA })}>
      <h3 className="text-sm font-semibold text-fg">{t('titulo', { par, dias: DIAS_GRAFICA })}</h3>
      {cargando ? (
        <Skeleton className="h-48 w-full" />
      ) : puntos.length < 2 ? (
        <div className="flex h-48 flex-col items-center justify-center gap-2 text-center">
          <p className="text-sm text-fg-muted">{t('insuficiente')}</p>
          <button
            type="button"
            onClick={sincronizarCatalogo}
            disabled={sincronizando}
            className="text-sm font-medium text-link hover:underline disabled:opacity-50"
          >
            {sincronizando ? tComun('sincronizando') : tComun('sincronizar')}
          </button>
        </div>
      ) : (
        <div className="h-48 w-full" role="img" aria-label={t('descripcion', { par, n: puntos.length })}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={puntos as PuntoGrafica[]} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
              <CartesianGrid vertical={false} stroke={COLOR_REJILLA} strokeWidth={1} />
              <XAxis
                dataKey="dia"
                tickFormatter={(d: string) => formato.diaCorto(d)}
                tick={{ fill: COLOR_TEXTO, fontSize: 11 }}
                axisLine={{ stroke: COLOR_REJILLA }}
                tickLine={false}
                minTickGap={24}
              />
              <YAxis
                dataKey="tasa"
                domain={['auto', 'auto']}
                tickFormatter={(v: number) => formato.tasa(v)}
                tick={{ fill: COLOR_TEXTO, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={88}
              />
              <Tooltip
                cursor={{ stroke: COLOR_TEXTO, strokeWidth: 1 }}
                content={({ active, payload }) => {
                  const p = active && payload && payload.length > 0 ? (payload[0].payload as PuntoGrafica) : null;
                  if (!p) return null;
                  return (
                    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs text-fg shadow-md">
                      <p className="font-medium">{formato.dia(p.dia)}</p>
                      <p className="tabular-nums">{formato.tasa(p.tasa)}</p>
                      <p className="text-fg-secondary">{p.fuente === 'manual' ? tComun('manual') : tComun('automatica')}</p>
                    </div>
                  );
                }}
              />
              <Line
                type="monotone"
                dataKey="tasa"
                stroke={COLOR_LINEA}
                strokeWidth={2}
                isAnimationActive={false}
                dot={(props: { cx?: number; cy?: number; payload?: PuntoGrafica; index?: number }) => (
                  <circle
                    key={`p-${props.index ?? 0}`}
                    cx={props.cx}
                    cy={props.cy}
                    r={props.payload?.fuente === 'manual' ? 4 : 0}
                    fill={COLOR_LINEA}
                    stroke={COLOR_FONDO}
                    strokeWidth={1.5}
                  />
                )}
                activeDot={{ r: 4, fill: COLOR_LINEA, stroke: COLOR_FONDO }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
