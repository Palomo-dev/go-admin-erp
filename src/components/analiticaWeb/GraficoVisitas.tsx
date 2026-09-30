'use client';

/**
 * «Visitantes y pedidos» (Figma 464:237485): serie diaria del periodo actual
 * (línea continua) y del anterior (discontinua), alineadas día a día.
 * Recharts ya es dependencia del repo; colores por token CSS del tema.
 */
import { useTranslations } from 'next-intl';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { PuntoSerie } from '@/lib/analiticaWeb/analiticaWeb';
import { formatPlainDate } from '@/lib/utils/dateDisplay';

export function GraficoVisitas({ serie, comparar }: { serie: PuntoSerie[]; comparar: boolean }) {
  const t = useTranslations('analiticaWeb.grafico');
  const datos = serie.map((p) => ({ ...p, etiqueta: formatPlainDate(p.fecha).slice(0, 5) }));

  return (
    <div className="h-64 w-full" role="img" aria-label={t('titulo')}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={datos} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-line, #e5e7eb)" />
          <XAxis dataKey="etiqueta" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={16} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={48} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="visitantes" name={t('visitantes')} stroke="#2563eb" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="pedidos" name={t('pedidos')} stroke="#059669" strokeWidth={2} dot={false} />
          {comparar && (
            <Line type="monotone" dataKey="visitantesAnterior" name={t('visitantesAnterior')} stroke="#2563eb" strokeOpacity={0.45} strokeDasharray="4 4" dot={false} />
          )}
          {comparar && (
            <Line type="monotone" dataKey="pedidosAnterior" name={t('pedidosAnterior')} stroke="#059669" strokeOpacity={0.45} strokeDasharray="4 4" dot={false} />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
