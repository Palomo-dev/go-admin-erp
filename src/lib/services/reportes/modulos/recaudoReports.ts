// ============================================================
// Reporte «Recaudo por medio de pago» (Reportes › Finanzas; Figma «05 POS y ventas»
// 3300-421294, aprobado el 2026-11-25).
//
// Cuánto dinero ENTRÓ por cada medio y pasarela en el periodo: es «Recaudado» (criterio de
// caja), no «Ventas netas». Separa pagos completos en línea, anticipos de contraentrega (2805
// hasta facturar), cobros en puerta y ventas en tienda (POS y demás cobros sin pedido web).
// Vistas: por medio (principal), resumen por tipo, por día, por semana (lunes a domingo), por
// mes y por sede. Se exporta con el exportador del visor (Excel/PDF/CSV).
//
// Lectura única: `fn_recaudo_pagos` (SECURITY INVOKER, manda RLS) + `recaudoPorMedio.ts`, la
// MISMA regla de Pedidos online, Ventas, Movimientos y Procesadores de pago. Los abonos de las
// pasarelas al banco no son pagos y no suman (son traslados).
// ============================================================

import { supabase as browserSupabase } from '@/lib/supabase/config';
import { leerPagosRecaudo } from '@/lib/services/recaudoService';
import {
  agruparPorPeriodo,
  esMedioPasarela,
  resumenRecaudo,
  totalesPorMedio,
  totalesPorSede,
  TIPOS_RECAUDO,
  type ClaveMedio,
  type GrupoRecaudo,
  type TipoRecaudo,
} from '@/lib/finanzas/recaudo/recaudoPorMedio';
import { NOMBRE_PASARELA } from '@/lib/pos/pedidosWeb/pagosDelPedido';
import type { DefinicionModulo, LecturaReporte, PeriodoCierre, ReportData, ReporteColumna, ReportesClient, VistaReporte } from '../types';
import { rangoDelPeriodo } from '../rangoPeriodo';

const NOMBRE_SIN_PASARELA: Record<string, string> = { efectivo: 'Efectivo', datafono: 'Datáfono', transferencia: 'Transferencia' };
const TITULO_TIPO: Record<TipoRecaudo, string> = {
  completo: 'Pagos completos',
  anticipo: 'Anticipos',
  puerta: 'En puerta',
  tienda: 'En tienda (POS)',
};

/** Nombre del medio en el reporte (las pasarelas son nombres propios). */
export function nombreMedioReporte(medio: ClaveMedio): string {
  if (esMedioPasarela(medio)) return NOMBRE_PASARELA[medio];
  return NOMBRE_SIN_PASARELA[medio] ?? medio;
}

/** Por dónde entra: la pasarela, el banco o la caja. */
export function origenMedioReporte(medio: ClaveMedio): string {
  if (esMedioPasarela(medio)) return 'Pasarela';
  if (medio === 'transferencia') return 'Banco';
  if (medio === 'efectivo' || medio === 'datafono') return 'Caja';
  return 'Otro';
}

const COLUMNAS_TIPO: ReporteColumna[] = TIPOS_RECAUDO.map((t) => ({ key: t, titulo: TITULO_TIPO[t], tipo: 'moneda' as const, alinear: 'right' as const }));

function filaGrupo(etiqueta: Record<string, unknown>, g: Pick<GrupoRecaudo, 'total' | 'porTipo'>): Record<string, unknown> {
  return {
    ...etiqueta,
    ...Object.fromEntries(TIPOS_RECAUDO.map((t) => [t, g.porTipo[t].monto])),
    pagos: g.total.pagos,
    total: g.total.monto,
  };
}

function totalesFila(etiqueta: Record<string, unknown>, filas: Record<string, unknown>[]): Record<string, unknown> {
  const suma = (k: string) => Math.round(filas.reduce((a, f) => a + (Number(f[k]) || 0), 0) * 100) / 100;
  return { ...etiqueta, ...Object.fromEntries([...TIPOS_RECAUDO, 'pagos', 'total'].map((k) => [k, suma(k)])) };
}

/** Lunes … domingo o el mes, para la columna del periodo. */
function etiquetaGrupo(clave: string, agrupar: 'dia' | 'semana' | 'mes'): string {
  if (agrupar === 'mes') return clave.slice(0, 7);
  return clave;
}

export const recaudoReports: DefinicionModulo[] = [
  {
    id: 'recaudo-medio-pago',
    modulo: 'finance',
    titulo: 'Recaudo por medio de pago',
    descripcion: 'Cuánto dinero entró por cada medio y pasarela: pagos completos, anticipos de contraentrega, cobros en puerta y ventas en tienda. Es Recaudado, no Ventas netas.',
    categoria: 'financiero',
    alcance: 'sucursal',
    periodosSugeridos: ['diario', 'semanal', 'mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre, branchId?: number | null, client?: ReportesClient): Promise<ReportData> {
      const db = client ?? browserSupabase;
      const { start, end, timezone } = await rangoDelPeriodo(orgId, periodo, db);
      const pagos = await leerPagosRecaudo(orgId, { desde: start, hasta: end }, branchId ?? null, db);
      const resumen = resumenRecaudo(pagos);
      const porMedio = totalesPorMedio(pagos);

      const columnasMedio: ReporteColumna[] = [
        { key: 'medio', titulo: 'Medio de pago', tipo: 'texto' },
        { key: 'origen', titulo: 'Origen', tipo: 'texto' },
        ...COLUMNAS_TIPO,
        { key: 'pagos', titulo: 'N.º pagos', tipo: 'numero', alinear: 'right' },
        { key: 'total', titulo: 'Total recaudado', tipo: 'moneda', alinear: 'right' },
      ];
      const filasMedio = porMedio.map((m) => filaGrupo({ medio: nombreMedioReporte(m.medio), origen: origenMedioReporte(m.medio) }, { total: m, porTipo: m.porTipo }));

      const vistaPeriodo = (agrupar: 'dia' | 'semana' | 'mes', id: string, titulo: string, columna: string): VistaReporte => {
        const filas = agruparPorPeriodo(pagos, agrupar, timezone).map((g) => filaGrupo({ periodo: etiquetaGrupo(g.clave, agrupar) }, g));
        return {
          id,
          titulo,
          columnas: [{ key: 'periodo', titulo: columna, tipo: agrupar === 'mes' ? 'texto' : 'fecha' }, ...COLUMNAS_TIPO, { key: 'pagos', titulo: 'N.º pagos', tipo: 'numero', alinear: 'right' }, { key: 'total', titulo: 'Total recaudado', tipo: 'moneda', alinear: 'right' }],
          filas,
          totales: totalesFila({ periodo: 'Total' }, filas),
        };
      };

      // Nombres de sede: la misma RLS de la sesión.
      const sedes = totalesPorSede(pagos);
      const ids = sedes.map((s) => s.sedeId).filter((x): x is number => typeof x === 'number');
      const nombres = new Map<number, string>();
      if (ids.length > 0) {
        const { data } = await db.from('branches').select('id, name').eq('organization_id', orgId).in('id', ids);
        for (const b of (data ?? []) as { id: number; name: string }[]) nombres.set(b.id, b.name);
      }
      const filasSede = sedes.map((s) => filaGrupo({ sede: s.sedeId === null ? 'Sin sede' : nombres.get(s.sedeId) ?? `Sede ${s.sedeId}` }, s));

      const filasResumen = TIPOS_RECAUDO.map((t) => ({ tipo: TITULO_TIPO[t], pagos: resumen.porTipo[t].pagos, total: resumen.porTipo[t].monto }));

      const lectura: LecturaReporte[] = [];
      const principal = porMedio[0];
      if (principal && resumen.total.monto > 0) {
        const pct = Math.round((principal.monto / resumen.total.monto) * 100);
        lectura.push({ tono: 'info', texto: `${nombreMedioReporte(principal.medio)} trae el ${pct} % del recaudo del periodo.` });
      }
      if (resumen.porTipo.anticipo.monto > 0) {
        lectura.push({
          tono: 'info',
          texto: `Incluye ${resumen.porTipo.anticipo.pagos} anticipos de contraentrega: quedan en la cuenta 2805 hasta facturar el pedido.`,
        });
      }
      const pasarelas = porMedio.filter((m) => esMedioPasarela(m.medio) || m.medio === 'datafono').reduce((a, m) => a + m.monto, 0);
      if (pasarelas > 0) {
        lectura.push({
          tono: 'aviso',
          texto: 'Lo cobrado por pasarelas y datáfono queda en la cuenta del procesador (138020xx) hasta que abona al banco.',
        });
      }

      return {
        id: 'recaudo-medio-pago',
        titulo: 'Recaudo por medio de pago',
        modulo: 'finance',
        periodo,
        generadoEn: new Date().toISOString(),
        kpis: [
          { titulo: 'Recaudado', valor: resumen.total.monto, formato: 'moneda' },
          { titulo: 'Pagos completos en línea', valor: resumen.porTipo.completo.monto, formato: 'moneda' },
          { titulo: 'Anticipos de contraentrega', valor: resumen.porTipo.anticipo.monto, formato: 'moneda' },
          { titulo: 'Cobrado en puerta', valor: resumen.porTipo.puerta.monto, formato: 'moneda' },
          { titulo: 'En tienda (POS)', valor: resumen.porTipo.tienda.monto, formato: 'moneda' },
        ],
        vistaPrincipal: 'Por medio de pago',
        columnas: columnasMedio,
        filas: filasMedio,
        totales: totalesFila({ medio: 'Total', origen: `${porMedio.length} medios` }, filasMedio),
        vistas: [
          {
            id: 'resumen',
            titulo: 'Resumen',
            columnas: [
              { key: 'tipo', titulo: 'Tipo de cobro', tipo: 'texto' },
              { key: 'pagos', titulo: 'N.º pagos', tipo: 'numero', alinear: 'right' },
              { key: 'total', titulo: 'Recaudado', tipo: 'moneda', alinear: 'right' },
            ],
            filas: filasResumen,
            totales: { tipo: 'Total', pagos: resumen.total.pagos, total: resumen.total.monto },
          },
          vistaPeriodo('dia', 'por-dia', 'Por día', 'Día'),
          vistaPeriodo('semana', 'por-semana', 'Por semana', 'Semana (lunes)'),
          vistaPeriodo('mes', 'por-mes', 'Por mes', 'Mes'),
          {
            id: 'por-sede',
            titulo: 'Por sede',
            columnas: [{ key: 'sede', titulo: 'Sede', tipo: 'texto' }, ...COLUMNAS_TIPO, { key: 'pagos', titulo: 'N.º pagos', tipo: 'numero', alinear: 'right' }, { key: 'total', titulo: 'Total recaudado', tipo: 'moneda', alinear: 'right' }],
            filas: filasSede,
            totales: totalesFila({ sede: 'Total' }, filasSede),
          },
        ],
        lectura,
      };
    },
  },
];
