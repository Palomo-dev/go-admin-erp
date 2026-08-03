// ============================================================
// Reportes Contables
// Llama a las RPCs: fn_reporte_estado_resultados, fn_reporte_balance_general, fn_reporte_presupuesto_vs_real
// ============================================================

import { supabase } from '@/lib/supabase/config';
import type { ReportDefinition, ReportData, PeriodoCierre } from '../types';

function buildReportData(
  id: string, titulo: string, modulo: string, periodo: PeriodoCierre,
  kpis: ReportData['kpis'], columnas: ReportData['columnas'],
  filas: Record<string, unknown>[], totales?: Record<string, unknown>,
): ReportData {
  return { id, titulo, modulo, kpis, columnas, filas, totales, generadoEn: new Date().toISOString(), periodo };
}

export const contabilidadReports: ReportDefinition[] = [
  {
    id: 'estado-resultados',
    modulo: 'finance',
    titulo: 'Estado de Resultados',
    descripcion: 'Ingresos, costos y gastos → utilidad neta del período',
    categoria: 'contable',
    periodosSugeridos: ['mensual', 'trimestral', 'anual'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data, error } = await supabase.rpc('fn_reporte_estado_resultados', {
        p_organization_id: orgId,
        p_from: `${periodo.fechaInicio}T00:00:00Z`,
        p_to: `${periodo.fechaFin}T23:59:59Z`,
      });
      if (error) throw error;

      const d = data ?? {};

      return buildReportData(
        'estado-resultados', 'Estado de Resultados', 'finance', periodo,
        [
          { titulo: 'Ingresos', valor: d.ingresos ?? 0, formato: 'moneda' },
          { titulo: 'Costos', valor: d.costos ?? 0, formato: 'moneda' },
          { titulo: 'Utilidad Bruta', valor: d.utilidad_bruta ?? 0, formato: 'moneda' },
          { titulo: 'Gastos', valor: d.gastos ?? 0, formato: 'moneda' },
          { titulo: 'Utilidad Neta', valor: d.utilidad_neta ?? 0, formato: 'moneda' },
        ],
        [
          { key: 'cuenta', titulo: 'Cuenta', tipo: 'texto' },
          { key: 'nombre', titulo: 'Nombre', tipo: 'texto' },
          { key: 'tipo', titulo: 'Tipo', tipo: 'texto' },
          { key: 'monto', titulo: 'Monto', tipo: 'moneda', alinear: 'right' },
        ],
        d.detalle ?? [],
      );
    },
  },
  {
    id: 'balance-general',
    modulo: 'finance',
    titulo: 'Balance General',
    descripcion: 'Activo, pasivo y patrimonio a la fecha de corte',
    categoria: 'contable',
    periodosSugeridos: ['mensual', 'trimestral', 'anual'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data, error } = await supabase.rpc('fn_reporte_balance_general', {
        p_organization_id: orgId,
        p_as_of: periodo.fechaFin,
      });
      if (error) throw error;

      const d = data ?? {};

      return buildReportData(
        'balance-general', 'Balance General', 'finance', periodo,
        [
          { titulo: 'Total Activos', valor: d.activos ?? 0, formato: 'moneda' },
          { titulo: 'Total Pasivos', valor: d.pasivos ?? 0, formato: 'moneda' },
          { titulo: 'Patrimonio', valor: d.patrimonio ?? 0, formato: 'moneda' },
          { titulo: 'Pasivo + Patrimonio', valor: d.total_pasivo_patrimonio ?? 0, formato: 'moneda' },
        ],
        [
          { key: 'cuenta', titulo: 'Cuenta', tipo: 'texto' },
          { key: 'nombre', titulo: 'Nombre', tipo: 'texto' },
          { key: 'tipo', titulo: 'Tipo', tipo: 'texto' },
          { key: 'saldo', titulo: 'Saldo', tipo: 'moneda', alinear: 'right' },
        ],
        d.detalle ?? [],
      );
    },
  },
  {
    id: 'presupuesto-vs-real',
    modulo: 'finance',
    titulo: 'Presupuesto vs Real',
    descripcion: 'Comparativo de presupuestos contra ejecución real',
    categoria: 'contable',
    periodosSugeridos: ['mensual', 'trimestral'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data, error } = await supabase.rpc('fn_reporte_presupuesto_vs_real', {
        p_organization_id: orgId,
        p_from: `${periodo.fechaInicio}T00:00:00Z`,
        p_to: `${periodo.fechaFin}T23:59:59Z`,
      });
      if (error) throw error;

      const d = data ?? {};

      return buildReportData(
        'presupuesto-vs-real', 'Presupuesto vs Real', 'finance', periodo,
        [
          { titulo: 'Tiene Presupuesto', valor: d.tiene_presupuesto ? 'Sí' : 'No' },
        ],
        [
          { key: 'cuenta', titulo: 'Cuenta', tipo: 'texto' },
          { key: 'nombre', titulo: 'Nombre', tipo: 'texto' },
          { key: 'presupuesto', titulo: 'Presupuesto', tipo: 'moneda', alinear: 'right' },
          { key: 'real', titulo: 'Real', tipo: 'moneda', alinear: 'right' },
          { key: 'diferencia', titulo: 'Diferencia', tipo: 'moneda', alinear: 'right' },
          { key: 'variacion', titulo: 'Variación %', tipo: 'porcentaje', alinear: 'right' },
        ],
        d.detalle ?? [],
      );
    },
  },
];
