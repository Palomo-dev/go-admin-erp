'use client';

/**
 * «Visitantes y pedidos» (Figma B/09-01, E-analitica/02): una serie a la vez
 * (Visitantes · Pedidos · Conversión) con el periodo actual en línea continua
 * con relleno y el anterior en discontinua, alineados día a día; leyenda y
 * rango debajo. Recharts ya es dependencia del repo; colores por token CSS del
 * tema (nada de hex): el modo oscuro sale de tokens.css.
 */
import { useMemo, useState } from 'react';
import { useLocale } from 'next-intl';
import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChipsOpcion } from '@/components/kit';
import type { PuntoSerie } from '@/lib/analiticaWeb/analiticaWeb';
import { formatPlainDate } from '@/lib/utils/dateDisplay';
import { useTextosSeoAnalitica } from '@/components/sitio-web/seoanalitica/textos';
import { CLASE_TAMANO_ICONO, TRAZO_ICONO } from '@/components/sitio-web/ui/iconosSitio';
import { ICONO_BLOQUE_ANALITICA, ICONO_KPI_ANALITICA } from './iconosAnalitica';

export type MetricaGrafico = 'visitantes' | 'pedidos' | 'conversion';

const COLOR_ACTUAL = 'rgb(var(--brand-primary))';
const COLOR_ANTERIOR = 'rgb(var(--text-muted))';
const COLOR_REJILLA = 'rgb(var(--border-default))';
const COLOR_EJE = 'rgb(var(--text-secondary))';

/** Puntos del gráfico para una métrica. Conversión = pedidos / visitantes del día (en %). */
export function puntosGrafico(serie: readonly PuntoSerie[], metrica: MetricaGrafico): Array<{ fecha: string; actual: number; anterior: number }> {
  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);
  return serie.map((p) => ({
    fecha: p.fecha,
    actual: metrica === 'visitantes' ? p.visitantes : metrica === 'pedidos' ? p.pedidos : pct(p.pedidos, p.visitantes),
    anterior: metrica === 'visitantes' ? p.visitantesAnterior : metrica === 'pedidos' ? p.pedidosAnterior : pct(p.pedidosAnterior, p.visitantesAnterior),
  }));
}

export function GraficoVisitas({ serie, titulo }: { serie: PuntoSerie[]; titulo: string }) {
  const t = useTextosSeoAnalitica();
  const locale = useLocale();
  const [metrica, setMetrica] = useState<MetricaGrafico>('visitantes');
  const datos = useMemo(
    () => puntosGrafico(serie, metrica).map((p) => ({ ...p, etiqueta: formatPlainDate(p.fecha).slice(0, 5) })),
    [serie, metrica],
  );
  const nf = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }), [locale]);
  const formato = (v: number) => (metrica === 'conversion' ? `${nf.format(v)} %` : nf.format(v));
  const desde = serie[0]?.fecha;
  const hasta = serie[serie.length - 1]?.fecha;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
          <ICONO_BLOQUE_ANALITICA.grafico aria-hidden="true" className={`${CLASE_TAMANO_ICONO.base} shrink-0 text-fg-secondary`} strokeWidth={TRAZO_ICONO} />
          {titulo}
        </h3>
        <ChipsOpcion<MetricaGrafico>
          opciones={(['visitantes', 'pedidos', 'conversion'] as const).map((m) => ({ valor: m, etiqueta: t(`analitica.grafico.${m}`), icono: ICONO_KPI_ANALITICA[m] }))}
          valor={metrica}
          onValorChange={setMetrica}
          etiqueta={t('analitica.grafico.serie')}
        />
      </div>
      <div className="h-56 w-full" role="img" aria-label={`${titulo}: ${t(`analitica.grafico.${metrica}`)}`}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={datos} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={COLOR_REJILLA} />
            <XAxis dataKey="etiqueta" tick={{ fontSize: 11, fill: COLOR_EJE }} tickLine={false} axisLine={false} minTickGap={16} />
            <YAxis allowDecimals={metrica === 'conversion'} tick={{ fontSize: 11, fill: COLOR_EJE }} tickLine={false} axisLine={false} width={48} tickFormatter={formato} />
            <Tooltip formatter={(v: number) => formato(v)} />
            <Area type="monotone" dataKey="actual" name={t('analitica.grafico.actual')} stroke={COLOR_ACTUAL} strokeWidth={2} fill={COLOR_ACTUAL} fillOpacity={0.12} dot={false} />
            <Line type="monotone" dataKey="anterior" name={t('analitica.grafico.anterior')} stroke={COLOR_ANTERIOR} strokeDasharray="4 4" strokeWidth={1.5} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-fg-secondary">
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-0.5 w-4 rounded-full bg-brand" />
            {t('analitica.grafico.actual')}
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-0 w-4 border-t border-dashed border-line-strong" />
            {t('analitica.grafico.anterior')}
          </span>
        </span>
        {desde && hasta && <span className="tabular-nums">{t('analitica.grafico.rango', { desde: formatPlainDate(desde), hasta: formatPlainDate(hasta) })}</span>}
      </div>
    </div>
  );
}
