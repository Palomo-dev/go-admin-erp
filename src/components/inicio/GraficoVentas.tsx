'use client';

/**
 * Gráfica de «Ventas del periodo» (Figma 445:137185 `447:73046` y detalle
 * 448:196680): periodo actual (línea de marca con área) frente al anterior
 * (discontinua), alineados punto a punto. Sin ejes, como el diseño; el
 * detalle de cada punto va en el tooltip. Recharts ya es dependencia del repo;
 * colores por token del tema.
 */
import { Area, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import type { PuntoComparado } from '@/lib/dashboard/serieInicio';

export interface GraficoVentasProps {
  puntos: readonly PuntoComparado[];
  /** Etiqueta de cada punto («8 h», «1 sep»). */
  etiqueta: (b: string) => string;
  importe: (v: number) => string;
  leyendaActual: string;
  leyendaAnterior: string;
  /** Nombre accesible de la gráfica. */
  titulo: string;
  className?: string;
}

const COLOR_ACTUAL = 'var(--go-brand-primary, #4361ee)';
const COLOR_ANTERIOR = 'var(--go-text-muted, #94a3b8)';

export function GraficoVentas({ puntos, etiqueta, importe, leyendaActual, leyendaAnterior, titulo, className }: GraficoVentasProps) {
  const datos = puntos.map((p) => ({ x: etiqueta(p.b), actual: p.actual, anterior: p.anterior }));
  return (
    <div className={className ?? 'h-full min-h-[180px] w-full'} role="img" aria-label={titulo}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={datos} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
          <XAxis dataKey="x" hide />
          <Tooltip
            formatter={(v: number, nombre: string) => [importe(Number(v) || 0), nombre === 'actual' ? leyendaActual : leyendaAnterior]}
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
          />
          <Area
            type="linear"
            dataKey="actual"
            stroke={COLOR_ACTUAL}
            strokeWidth={2}
            fill={COLOR_ACTUAL}
            fillOpacity={0.1}
            dot={false}
            isAnimationActive={false}
            connectNulls={false}
          />
          <Line
            type="linear"
            dataKey="anterior"
            stroke={COLOR_ANTERIOR}
            strokeWidth={1.5}
            strokeDasharray="4 4"
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
