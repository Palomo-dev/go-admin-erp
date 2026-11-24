// ============================================================
// Reportes de CRM — ingresos comerciales (antes «Pronóstico › Análisis»)
// ============================================================
// Hasta el 2026-11-24 estas cifras vivían en el tablero Revenue OS de
// /app/crm/pronostico/analisis. Regla del dueño: todo reporte va a
// /app/reportes y ningún módulo lleva tablero propio. Cada sección del
// tablero es aquí un reporte del módulo CRM (grupo «Clientes y CRM»):
//   Resumen          → `crm-ingresos-mensual`
//   Embudo           → `crm-conversion-embudo`
//   Forecast         → `crm-escenarios-forecast`
//   Cohortes         → `crm-cohortes-retencion`
//   Matemática       → `crm-matematica-comercial`
// Nada se recalcula aquí: las lecturas y fórmulas son las del servicio
// Revenue OS (`revenueOsService` y sus módulos puros `revenueOs/*`).
// Lo que no encajó como reporte está anotado en `reportesCatalogo.ts`.
// ============================================================

import { supabase as browserSupabase } from '@/lib/supabase/config';
import {
  buildRevenueMath,
  COHORT_LOOKBACK_MONTHS,
  getCohortRetention,
  getOrgTimezoneServer,
  getRevenueCurrency,
  getRevenueInputs,
  getRevenueMetrics,
  monthHasData,
  summarizeRevenueMetrics,
} from '@/lib/services/crm/revenueOsService';
import { fetchPipelineFunnel, fetchPipelines } from '@/lib/services/crm/revenueOs/rpc';
import { addMonthsPlain, resolveDateRange, type DateRange } from '@/lib/services/crm/revenueOs/dateRange';
import { computeFunnelConversion } from '@/lib/services/crm/revenueOs/funnelConversion';
import { buildCohortTable } from '@/lib/services/crm/revenueOs/cohortModel';
import { computeForecastScenarios } from '@/lib/services/crm/revenueOs/forecastScenarios';
import { addDaysPlain } from '@/lib/services/crm/quotaProgress';
import { todayInTz } from '@/lib/utils/dateDisplay';
import { arpaHint, collectedHint, winRateHint } from '@/components/crm/revenueos/kpiHints';
import { leerPaginado } from '../leerPaginado';
import type { DefinicionModulo, LecturaReporte, PeriodoCierre, ReportData, ReportesClient } from '../types';

/**
 * Periodo del reporte → rango de las RPC de Revenue OS (`date`, fin
 * EXCLUSIVO). `resolveDateRange` valida el formato y el tope de 36 meses.
 */
function rangoRevenue(fechaInicio: string, fechaFin: string): DateRange {
  return resolveDateRange(fechaInicio, addDaysPlain(fechaFin, 1), fechaFin);
}

/** Cohortes: los 24 meses que terminan con el periodo (como el tablero). */
function rangoCohortes(fin: string): DateRange {
  return { start: addMonthsPlain(fin, -COHORT_LOOKBACK_MONTHS), end: fin };
}

function reporte(id: string, titulo: string, periodo: PeriodoCierre, partes: Omit<ReportData, 'id' | 'titulo' | 'modulo' | 'generadoEn' | 'periodo'>): ReportData {
  return { id, titulo, modulo: 'crm', generadoEn: new Date().toISOString(), periodo, ...partes };
}

/** Sin dato no hay cero: el visor pinta «—». */
const SIN = '—';
const kpi = (v: number | null) => (v === null ? SIN : v);

const PERIODO_META: Record<string, string> = { weekly: 'Semanal', monthly: 'Mensual', quarterly: 'Trimestral', yearly: 'Anual' };

interface OportunidadAbierta {
  id: string;
  pipeline_id: string;
  stage_id: string;
  amount: number | string | null;
  expected_close_date: string | null;
}

/** Fórmulas del tablero (FASE-14 §3.1), en el orden en que se mostraban. */
const FORMULAS = [
  { key: 'arpa', metrica: 'ARPA', formula: 'Ticket medio por factura pagada del periodo (ponderado por facturas)', formato: 'moneda' },
  { key: 'cac', metrica: 'CAC', formula: 'Gasto de adquisición del periodo ÷ oportunidades ganadas en el periodo', formato: 'moneda' },
  { key: 'churnRatePct', metrica: 'Churn mensual', formula: '100 − retención M1 ponderada por cohorte', formato: 'porcentaje' },
  { key: 'ltv', metrica: 'LTV', formula: 'ARPA × margen bruto × (1 ÷ churn)', formato: 'moneda' },
  { key: 'ltvCacRatio', metrica: 'LTV / CAC', formula: 'LTV ÷ CAC (saludable ≥ 3)', formato: 'numero' },
  { key: 'paybackMonths', metrica: 'Payback (meses)', formula: 'CAC ÷ (ARPA × margen bruto)', formato: 'numero' },
  { key: 'netRevenueRetentionPct', metrica: 'Retención neta de ingresos', formula: '(MRR inicial + expansión − contracción − churn) ÷ MRR inicial', formato: 'porcentaje' },
] as const;

export const crmIngresosReports: DefinicionModulo[] = [
  {
    id: 'crm-ingresos-mensual',
    modulo: 'crm',
    titulo: 'Ingresos comerciales por mes',
    descripcion: 'Cobrado, ganado y perdido en pipeline, win rate, ciclo de venta, ARPA y comisiones, mes a mes',
    categoria: 'comercial',
    alcance: 'organizacion',
    periodosSugeridos: ['trimestral', 'semestral', 'anual'],
    async fetch(orgId: number, periodo: PeriodoCierre, branchId?: number | null, client?: ReportesClient): Promise<ReportData> {
      const db = client ?? browserSupabase;
      const rango = rangoRevenue(periodo.fechaInicio, periodo.fechaFin);
      const [meses, moneda] = await Promise.all([getRevenueMetrics(orgId, rango.start, rango.end, db), getRevenueCurrency(orgId, db)]);
      const r = summarizeRevenueMetrics(meses);

      const filas = meses.map((m) => ({
        mes: m.month,
        cobrado: m.revenue_collected,
        cobrado_enlazado: m.revenue_collected_linked,
        ganado: m.revenue_won_pipeline,
        perdido: m.revenue_lost,
        ganadas: m.deals_won,
        perdidas: m.deals_lost,
        abiertas: m.deals_open,
        win_rate: m.win_rate === null ? null : m.win_rate * 100,
        ciclo_dias: m.avg_sales_cycle_days,
        arpa: m.arpa,
        facturas_pagadas: m.invoices_paid,
        comisiones: m.commissions_paid,
      }));

      const lectura: LecturaReporte[] = [];
      if (r.months_with_data === 0) lectura.push({ tono: 'info', texto: 'Sin oportunidades, facturas ni comisiones en el periodo.' });
      else {
        lectura.push({ tono: r.revenue_collected > 0 && r.revenue_collected_linked <= 0 ? 'aviso' : 'info', texto: collectedHint(r, moneda) });
        lectura.push({ tono: 'info', texto: `Win rate: ${winRateHint(r)}.` });
        lectura.push({ tono: 'info', texto: `ARPA: ${arpaHint(r)}.` });
        if (meses.some((m) => !monthHasData(m))) lectura.push({ tono: 'info', texto: 'Los meses sin actividad se muestran en cero para no esconder huecos.' });
      }

      return reporte('crm-ingresos-mensual', 'Ingresos comerciales por mes', periodo, {
        kpis: [
          { titulo: 'Cobrado', valor: r.revenue_collected, formato: 'moneda' },
          { titulo: 'Ganado en pipeline', valor: r.revenue_won_pipeline, formato: 'moneda' },
          { titulo: 'Win rate', valor: kpi(r.win_rate_pct), formato: 'porcentaje' },
          { titulo: 'Ciclo medio de venta (días)', valor: kpi(r.avg_sales_cycle_days), formato: 'numero' },
          { titulo: 'ARPA', valor: kpi(r.arpa), formato: 'moneda' },
          { titulo: 'Comisiones pagadas', valor: r.commissions_paid, formato: 'moneda' },
        ],
        columnas: [
          { key: 'mes', titulo: 'Mes', tipo: 'fecha' },
          { key: 'cobrado', titulo: 'Cobrado', tipo: 'moneda', alinear: 'right' },
          { key: 'cobrado_enlazado', titulo: 'Cobrado con oportunidad', tipo: 'moneda', alinear: 'right' },
          { key: 'ganado', titulo: 'Ganado en pipeline', tipo: 'moneda', alinear: 'right' },
          { key: 'perdido', titulo: 'Perdido', tipo: 'moneda', alinear: 'right' },
          { key: 'ganadas', titulo: 'Ganadas', tipo: 'numero', alinear: 'right' },
          { key: 'perdidas', titulo: 'Perdidas', tipo: 'numero', alinear: 'right' },
          { key: 'abiertas', titulo: 'Abiertas', tipo: 'numero', alinear: 'right' },
          { key: 'win_rate', titulo: 'Win rate', tipo: 'porcentaje', alinear: 'right' },
          { key: 'ciclo_dias', titulo: 'Ciclo (días)', tipo: 'numero', alinear: 'right' },
          { key: 'arpa', titulo: 'ARPA', tipo: 'moneda', alinear: 'right' },
          { key: 'facturas_pagadas', titulo: 'Facturas pagadas', tipo: 'numero', alinear: 'right' },
          { key: 'comisiones', titulo: 'Comisiones', tipo: 'moneda', alinear: 'right' },
        ],
        filas,
        totales: {
          cobrado: r.revenue_collected,
          cobrado_enlazado: r.revenue_collected_linked,
          ganado: r.revenue_won_pipeline,
          perdido: r.revenue_lost,
          ganadas: r.deals_won,
          perdidas: r.deals_lost,
          win_rate: r.win_rate_pct,
          arpa: r.arpa,
          facturas_pagadas: r.invoices_paid,
          comisiones: r.commissions_paid,
        },
        lectura,
      });
    },
  },
  {
    id: 'crm-conversion-embudo',
    modulo: 'crm',
    titulo: 'Conversión del embudo por pipeline',
    descripcion: 'Oportunidades de hoy por etapa, cuántas llegaron a cada etapa o más allá y el paso a la siguiente',
    categoria: 'comercial',
    alcance: 'organizacion',
    periodosSugeridos: ['mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre, branchId?: number | null, client?: ReportesClient): Promise<ReportData> {
      const db = client ?? browserSupabase;
      // Foto de hoy (`fn_pipeline_funnel` no recibe fechas): no depende del periodo.
      const pipelines = await fetchPipelines(orgId, db);
      const embudo = await fetchPipelineFunnel(orgId, db, pipelines);
      const nombre = (id: string | null) => pipelines.find((p) => p.id === id)?.name || (id ? `Pipeline ${id.slice(0, 8)}` : 'Sin pipeline');
      const ids = Array.from(new Set(embudo.map((e) => e.pipeline_id)));

      const filas: Record<string, unknown>[] = [];
      const resumen: Record<string, unknown>[] = [];
      const lectura: LecturaReporte[] = [];
      for (const id of ids) {
        const c = computeFunnelConversion(embudo.filter((e) => e.pipeline_id === id));
        const pipeline = nombre(id);
        for (const s of c.stages) {
          filas.push({
            pipeline,
            etapa: s.is_won ? `${s.stage_name} (ganada)` : s.stage_name,
            en_etapa: s.count,
            llegaron: s.reached,
            pct_inicio: c.totalReached > 0 ? s.sharePct : null,
            pasa_siguiente: s.conversionToNextPct,
            monto: s.amount,
          });
        }
        if (c.lost.count > 0) filas.push({ pipeline, etapa: 'Perdidas', en_etapa: c.lost.count, llegaron: null, pct_inicio: null, pasa_siguiente: null, monto: c.lost.amount });
        resumen.push({
          pipeline,
          llegaron: c.totalReached,
          conversion_global: c.overallPct,
          base: c.overallBasis === 'won' ? 'Hasta la etapa ganada' : c.overallBasis === 'last' ? 'Hasta la última etapa (no hay etapa ganada)' : 'Sin etapas',
          perdidas: c.lost.count,
          monto_perdido: c.lost.amount,
        });
        if (c.ignoredAfterWon.length > 0) {
          lectura.push({
            tono: 'aviso',
            texto: `${pipeline}: ${c.ignoredAfterWon.map((s) => `«${s.stage_name}»`).join(', ')} va después de la etapa ganada y queda fuera de la conversión.`,
            href: '/app/crm/pipeline',
            etiquetaAccion: 'Revisar etapas',
          });
        }
        if (c.overallBasis === 'last') lectura.push({ tono: 'info', texto: `${pipeline}: sin etapa ganada; la conversión global llega hasta la última etapa.` });
      }
      lectura.push({ tono: 'info', texto: 'Foto de hoy: el periodo elegido no cambia este reporte. «Llegaron» suma las oportunidades en la etapa o en una posterior; las perdidas no cuentan.' });

      const abierto = embudo.filter((e) => !e.is_won && !e.is_lost).reduce((s, e) => s + e.total_amount, 0);
      return reporte('crm-conversion-embudo', 'Conversión del embudo por pipeline', periodo, {
        kpis: [
          { titulo: 'Pipeline abierto (hoy)', valor: abierto, formato: 'moneda' },
          { titulo: 'Pipelines', valor: ids.length, formato: 'numero' },
        ],
        columnas: [
          { key: 'pipeline', titulo: 'Pipeline', tipo: 'texto' },
          { key: 'etapa', titulo: 'Etapa', tipo: 'texto' },
          { key: 'en_etapa', titulo: 'En la etapa', tipo: 'numero', alinear: 'right' },
          { key: 'llegaron', titulo: 'Llegaron', tipo: 'numero', alinear: 'right' },
          { key: 'pct_inicio', titulo: '% del inicio', tipo: 'porcentaje', alinear: 'right' },
          { key: 'pasa_siguiente', titulo: 'Pasa a la siguiente', tipo: 'porcentaje', alinear: 'right' },
          { key: 'monto', titulo: 'Monto en la etapa', tipo: 'moneda', alinear: 'right' },
        ],
        filas,
        vistaPrincipal: 'Por etapa',
        vistas: [
          {
            id: 'por-pipeline',
            titulo: 'Conversión global',
            columnas: [
              { key: 'pipeline', titulo: 'Pipeline', tipo: 'texto' },
              { key: 'llegaron', titulo: 'Entraron al embudo', tipo: 'numero', alinear: 'right' },
              { key: 'conversion_global', titulo: 'Conversión global', tipo: 'porcentaje', alinear: 'right' },
              { key: 'base', titulo: 'Base', tipo: 'texto' },
              { key: 'perdidas', titulo: 'Perdidas', tipo: 'numero', alinear: 'right' },
              { key: 'monto_perdido', titulo: 'Monto perdido', tipo: 'moneda', alinear: 'right' },
            ],
            filas: resumen,
          },
        ],
        lectura,
      });
    },
  },
  {
    id: 'crm-escenarios-forecast',
    modulo: 'crm',
    titulo: 'Escenarios del forecast por pipeline',
    descripcion: 'Oportunidades abiertas de hoy: mejor caso, esperado (ponderado) y peor caso, por pipeline y por mes de cierre esperado',
    categoria: 'comercial',
    alcance: 'organizacion',
    periodosSugeridos: ['mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre, branchId?: number | null, client?: ReportesClient): Promise<ReportData> {
      const db = client ?? browserSupabase;
      // Foto de hoy de las oportunidades abiertas, como el «Forecast» del tablero.
      const [pipelinesRes, abiertas] = await Promise.all([
        db.from('pipelines').select('id, name, goal_amount, goal_period').eq('organization_id', orgId).order('name'),
        leerPaginado<OportunidadAbierta>((desde, hasta) =>
          db
            .from('opportunities')
            .select('id, pipeline_id, stage_id, amount, expected_close_date')
            .eq('organization_id', orgId)
            .eq('status', 'open')
            .order('id')
            .range(desde, hasta),
        ),
      ]);
      if (pipelinesRes.error) throw pipelinesRes.error;
      const pipelines = (pipelinesRes.data ?? []) as Array<{ id: string; name: string | null; goal_amount: number | string | null; goal_period: string | null }>;
      const { data: etapas, error: errEtapas } = pipelines.length
        ? await db.from('stages').select('id, probability').in('pipeline_id', pipelines.map((p) => p.id))
        : { data: [], error: null };
      if (errEtapas) throw errEtapas;
      const stages = (etapas ?? []) as Array<{ id: string; probability: number | null }>;
      const opps = abiertas.map((o) => ({ ...o, status: 'open', amount: o.amount === null ? null : Number(o.amount) }));

      const filas = pipelines.map((p) => {
        const s = computeForecastScenarios(opps.filter((o) => o.pipeline_id === p.id), stages);
        const meta = p.goal_amount === null ? null : Number(p.goal_amount);
        return {
          pipeline: p.name?.trim() || `Pipeline ${p.id.slice(0, 8)}`,
          abiertas: s.openCount,
          abierto: s.openTotal,
          mejor: s.best,
          esperado: s.expected,
          peor: s.worst,
          meta: meta && meta > 0 ? meta : null,
          periodo_meta: p.goal_period ? PERIODO_META[p.goal_period] ?? p.goal_period : null,
        };
      });
      const total = computeForecastScenarios(opps, stages);

      const porMes = new Map<string, typeof opps>();
      for (const o of opps) {
        const mes = o.expected_close_date ? `${o.expected_close_date.slice(0, 7)}-01` : '';
        porMes.set(mes, [...(porMes.get(mes) ?? []), o]);
      }
      const filasMes = Array.from(porMes.entries())
        .sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)))
        .map(([mes, lista]) => {
          const s = computeForecastScenarios(lista, stages);
          return { mes: mes || 'Sin fecha de cierre', abiertas: s.openCount, abierto: s.openTotal, mejor: s.best, esperado: s.expected, peor: s.worst };
        });

      return reporte('crm-escenarios-forecast', 'Escenarios del forecast por pipeline', periodo, {
        kpis: [
          { titulo: 'Mejor caso', valor: total.best, formato: 'moneda' },
          { titulo: 'Esperado (ponderado)', valor: total.expected, formato: 'moneda' },
          { titulo: 'Peor caso', valor: total.worst, formato: 'moneda' },
          { titulo: 'Oportunidades abiertas', valor: total.openCount, formato: 'numero' },
        ],
        columnas: [
          { key: 'pipeline', titulo: 'Pipeline', tipo: 'texto' },
          { key: 'abiertas', titulo: 'Abiertas', tipo: 'numero', alinear: 'right' },
          { key: 'abierto', titulo: 'Monto abierto', tipo: 'moneda', alinear: 'right' },
          { key: 'mejor', titulo: 'Mejor caso', tipo: 'moneda', alinear: 'right' },
          { key: 'esperado', titulo: 'Esperado', tipo: 'moneda', alinear: 'right' },
          { key: 'peor', titulo: 'Peor caso', tipo: 'moneda', alinear: 'right' },
          { key: 'meta', titulo: 'Meta del pipeline', tipo: 'moneda', alinear: 'right' },
          { key: 'periodo_meta', titulo: 'Periodo de la meta', tipo: 'texto' },
        ],
        filas,
        totales: { abiertas: total.openCount, abierto: total.openTotal, mejor: total.best, esperado: total.expected, peor: total.worst },
        vistaPrincipal: 'Por pipeline',
        vistas: [
          {
            id: 'por-mes',
            titulo: 'Por mes de cierre esperado',
            columnas: [
              { key: 'mes', titulo: 'Mes de cierre esperado', tipo: 'fecha' },
              { key: 'abiertas', titulo: 'Abiertas', tipo: 'numero', alinear: 'right' },
              { key: 'abierto', titulo: 'Monto abierto', tipo: 'moneda', alinear: 'right' },
              { key: 'mejor', titulo: 'Mejor caso', tipo: 'moneda', alinear: 'right' },
              { key: 'esperado', titulo: 'Esperado', tipo: 'moneda', alinear: 'right' },
              { key: 'peor', titulo: 'Peor caso', tipo: 'moneda', alinear: 'right' },
            ],
            filas: filasMes,
          },
        ],
        lectura: [
          {
            tono: 'info',
            texto: `Esperado = monto × probabilidad de la etapa. Mejor caso: etapas con probabilidad ≥ ${total.bestMinProbability} %. Peor caso: ≥ ${total.worstMinProbability} %. Foto de hoy: el periodo no cambia este reporte.`,
          },
          ...(total.openCount === 0 ? [{ tono: 'info' as const, texto: 'No hay oportunidades abiertas.', href: '/app/crm/oportunidades', etiquetaAccion: 'Ver oportunidades' }] : []),
        ],
      });
    },
  },
  {
    id: 'crm-cohortes-retencion',
    modulo: 'crm',
    titulo: 'Retención de clientes por cohorte',
    descripcion: 'Clientes por mes de alta y qué parte volvió a facturar en M1, M3, M6 y M12',
    categoria: 'comercial',
    alcance: 'organizacion',
    periodosSugeridos: ['mensual', 'anual'],
    async fetch(orgId: number, periodo: PeriodoCierre, branchId?: number | null, client?: ReportesClient): Promise<ReportData> {
      const db = client ?? browserSupabase;
      // Las 24 cohortes que terminan con el periodo; hoy (zona de la organización) decide qué celda ya se observó.
      const fin = rangoRevenue(periodo.fechaInicio, periodo.fechaFin).end;
      const cohortes = rangoCohortes(fin);
      const [filasRpc, zona] = await Promise.all([getCohortRetention(orgId, cohortes.start, cohortes.end, db), getOrgTimezoneServer(orgId, db)]);
      const tabla = buildCohortTable(filasRpc, todayInTz(zona));
      const pct = (fila: (typeof tabla.rows)[number], h: number) => fila.cells.find((c) => c.horizon === h)?.pct ?? null;

      return reporte('crm-cohortes-retencion', 'Retención de clientes por cohorte', periodo, {
        kpis: [
          { titulo: 'Clientes en las cohortes', valor: tabla.totalCustomers, formato: 'numero' },
          { titulo: 'Cohortes', valor: tabla.rows.length, formato: 'numero' },
        ],
        columnas: [
          { key: 'cohorte', titulo: 'Cohorte', tipo: 'fecha' },
          { key: 'clientes', titulo: 'Clientes', tipo: 'numero', alinear: 'right' },
          { key: 'm1', titulo: 'M1', tipo: 'porcentaje', alinear: 'right' },
          { key: 'm3', titulo: 'M3', tipo: 'porcentaje', alinear: 'right' },
          { key: 'm6', titulo: 'M6', tipo: 'porcentaje', alinear: 'right' },
          { key: 'm12', titulo: 'M12', tipo: 'porcentaje', alinear: 'right' },
        ],
        filas: tabla.rows.map((f) => ({ cohorte: f.cohort_month, clientes: f.cohort_size, m1: pct(f, 1), m3: pct(f, 3), m6: pct(f, 6), m12: pct(f, 12) })),
        totales: { clientes: tabla.totalCustomers },
        lectura: [
          { tono: 'info', texto: '«—» significa que ese mes todavía no ha cerrado (sin observar); 0 % es que nadie volvió a facturar.' },
          ...(tabla.rows.length === 0 ? [{ tono: 'info' as const, texto: 'Ningún cliente pasó a la etapa «cliente» en los 24 meses que terminan con el periodo.' }] : []),
        ],
      });
    },
  },
  {
    id: 'crm-matematica-comercial',
    modulo: 'crm',
    titulo: 'Matemática comercial (CAC, LTV, churn)',
    descripcion: 'ARPA, CAC, churn, LTV, LTV/CAC, payback y retención neta, con su fórmula y lo que falta para calcularlas',
    categoria: 'comercial',
    alcance: 'organizacion',
    periodosSugeridos: ['trimestral', 'anual'],
    async fetch(orgId: number, periodo: PeriodoCierre, branchId?: number | null, client?: ReportesClient): Promise<ReportData> {
      const db = client ?? browserSupabase;
      const rango = rangoRevenue(periodo.fechaInicio, periodo.fechaFin);
      const cohortes = rangoCohortes(rango.end);
      const [meses, filasCohortes, insumos, zona] = await Promise.all([
        getRevenueMetrics(orgId, rango.start, rango.end, db),
        getCohortRetention(orgId, cohortes.start, cohortes.end, db),
        getRevenueInputs(orgId, db),
        getOrgTimezoneServer(orgId, db),
      ]);
      const math = buildRevenueMath(meses, filasCohortes, insumos, todayInTz(zona));

      const lectura: LecturaReporte[] = [];
      if (insumos.acquisition_spend === null || insumos.gross_margin_pct === null) {
        lectura.push({ tono: 'aviso', texto: 'Faltan insumos manuales (gasto de adquisición y margen bruto): sin ellos no se calculan CAC, LTV, LTV/CAC ni payback.' });
      }
      if (math.ltvCacRatio !== null) {
        lectura.push({ tono: math.ltvCacRatio >= 3 ? 'bien' : 'alerta', texto: math.ltvCacRatio >= 3 ? 'LTV/CAC saludable (≥ 3).' : 'LTV/CAC por debajo de 3.' });
      }

      return reporte('crm-matematica-comercial', 'Matemática comercial (CAC, LTV, churn)', periodo, {
        kpis: FORMULAS.map((f) => ({ titulo: f.metrica, valor: kpi(math[f.key]), formato: f.formato })),
        columnas: [
          { key: 'metrica', titulo: 'Métrica', tipo: 'texto' },
          { key: 'formula', titulo: 'Fórmula', tipo: 'texto' },
          { key: 'estado', titulo: 'Estado', tipo: 'texto' },
        ],
        filas: [
          ...FORMULAS.map((f) => ({ metrica: f.metrica, formula: f.formula, estado: math.missing[f.key] ?? 'Calculada' })),
          { metrica: 'Clientes nuevos (oportunidades ganadas)', formula: 'Σ ganadas del periodo', estado: String(math.newCustomers) },
          { metrica: 'Gasto de adquisición (insumo)', formula: 'Marketing + ventas del periodo', estado: insumos.acquisition_spend === null ? 'Sin registrar' : String(insumos.acquisition_spend) },
          { metrica: 'Margen bruto (insumo)', formula: '0–100 %', estado: insumos.gross_margin_pct === null ? 'Sin registrar' : `${insumos.gross_margin_pct} %` },
        ],
        lectura,
      });
    },
  },
];
