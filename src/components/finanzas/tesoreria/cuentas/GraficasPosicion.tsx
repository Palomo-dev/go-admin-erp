'use client';

/**
 * Gráficas de la pestaña «Posición» (Tesorería consolidada `2335:142203` +
 * pedido del dueño de verla en el tiempo):
 *
 * - Saldo proyectado a 90 días: una sola serie (área + línea de 2 px, sin
 *   leyenda: el título la nombra), cero marcado si la proyección cruza a
 *   negativo, cruz y tooltip al pasar.
 * - Posición por cuenta: barras horizontales de una sola serie, de mayor a
 *   menor, con el valor escrito al final (etiqueta directa) y tooltip.
 *
 * Colores por token CSS del tema (sin hex; el modo oscuro sale de tokens.css).
 * Las dos gráficas tienen su tabla al lado (tramos y cuentas): el color nunca
 * es la única vía.
 */
import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatPlainDate } from '@/lib/utils/dateDisplay';

const MARCA = 'rgb(var(--brand-primary))';
const PELIGRO = 'rgb(var(--state-danger))';
const REJILLA = 'rgb(var(--border-default))';
const EJE = 'rgb(var(--text-secondary))';
const TEXTO = 'rgb(var(--text-primary))';

/** Cifra corta para ejes («$ 18,9 M»): el valor exacto va en el tooltip y en la tabla. */
function compacto(valor: number, locale: string): string {
  return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(valor);
}

function CajaTooltip({ titulo, filas }: { titulo: string; filas: { etiqueta: string; valor: string }[] }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold text-fg">{titulo}</p>
      {filas.map((f) => (
        <p key={f.etiqueta} className="flex justify-between gap-4 text-fg-secondary">
          <span>{f.etiqueta}</span>
          <span className="tabular-nums text-fg">{f.valor}</span>
        </p>
      ))}
    </div>
  );
}

export function GraficaSaldoProyectado({
  puntos,
  formatear,
  locale,
  textos,
}: {
  puntos: readonly { fecha: string; saldo: number; entra: number; sale: number }[];
  formatear: (v: number) => string;
  locale: string;
  textos: { titulo: string; resumen: string; saldo: string; entra: string; sale: string };
}) {
  const datos = useMemo(() => puntos.map((p) => ({ ...p, etiqueta: formatPlainDate(p.fecha) })), [puntos]);
  const cruzaCero = puntos.some((p) => p.saldo < 0);
  return (
    <figure className="m-0">
      <div className="h-64 w-full" role="img" aria-label={`${textos.titulo}. ${textos.resumen}`}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={datos} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={REJILLA} />
            <XAxis dataKey="etiqueta" tick={{ fontSize: 11, fill: EJE }} tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis tick={{ fontSize: 11, fill: EJE }} tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => compacto(v, locale)} />
            {cruzaCero && <ReferenceLine y={0} stroke={PELIGRO} strokeDasharray="4 4" />}
            <Tooltip
              cursor={{ stroke: EJE, strokeDasharray: '3 3' }}
              content={({ active, payload }) => {
                const p = active && payload?.[0]?.payload as (typeof datos)[number] | undefined;
                if (!p) return null;
                return (
                  <CajaTooltip
                    titulo={p.etiqueta}
                    filas={[
                      { etiqueta: textos.saldo, valor: formatear(p.saldo) },
                      ...(p.entra ? [{ etiqueta: textos.entra, valor: formatear(p.entra) }] : []),
                      ...(p.sale ? [{ etiqueta: textos.sale, valor: formatear(p.sale) }] : []),
                    ]}
                  />
                );
              }}
            />
            <Area type="stepAfter" dataKey="saldo" stroke={MARCA} strokeWidth={2} fill={MARCA} fillOpacity={0.12} dot={false} activeDot={{ r: 4, stroke: 'rgb(var(--bg-surface))', strokeWidth: 2 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

export function GraficaPorCuenta({
  cuentas,
  formatear,
  locale,
  titulo,
}: {
  cuentas: readonly { id: string; nombre: string; saldo: number }[];
  formatear: (v: number) => string;
  locale: string;
  titulo: string;
}) {
  const alto = Math.max(120, cuentas.length * 40 + 16);
  return (
    <figure className="m-0">
      <div className="w-full" style={{ height: alto }} role="img" aria-label={titulo}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={[...cuentas]} layout="vertical" margin={{ top: 4, right: 72, bottom: 4, left: 4 }} barCategoryGap={8}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={REJILLA} />
            <XAxis type="number" tick={{ fontSize: 11, fill: EJE }} tickLine={false} axisLine={false} tickFormatter={(v: number) => compacto(v, locale)} />
            <YAxis type="category" dataKey="nombre" tick={{ fontSize: 12, fill: TEXTO }} tickLine={false} axisLine={false} width={140} />
            <Tooltip
              cursor={{ fill: 'rgb(var(--brand-tint))' }}
              content={({ active, payload }) => {
                const c = active && payload?.[0]?.payload as { nombre: string; saldo: number } | undefined;
                return c ? <CajaTooltip titulo={c.nombre} filas={[{ etiqueta: titulo, valor: formatear(c.saldo) }]} /> : null;
              }}
            />
            <Bar dataKey="saldo" fill={MARCA} radius={[0, 4, 4, 0]} maxBarSize={24}>
              <LabelList dataKey="saldo" position="right" formatter={(v: unknown) => compacto(Number(v), locale)} style={{ fontSize: 11, fill: EJE }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
