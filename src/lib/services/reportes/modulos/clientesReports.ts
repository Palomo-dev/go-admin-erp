// ============================================================
// Reportes de Clientes (core)
// Llama a la RPC: fn_reporte_clientes_crecimiento + consultas directas
// ============================================================

import { supabase } from '@/lib/supabase/config';
import { getBranchFilter } from '@/lib/hooks/useOrganization';
import { getDateRange } from '@/lib/utils/timezone';
import { getOrganizationTimezone } from '@/lib/services/organizationTimezoneService';
import type { ReportDefinition, ReportData, PeriodoCierre } from '../types';

function buildReportData(
  id: string, titulo: string, modulo: string, periodo: PeriodoCierre,
  kpis: ReportData['kpis'], columnas: ReportData['columnas'],
  filas: Record<string, unknown>[], totales?: Record<string, unknown>,
): ReportData {
  return { id, titulo, modulo, kpis, columnas, filas, totales, generadoEn: new Date().toISOString(), periodo };
}

export const clientesReports: ReportDefinition[] = [
  {
    id: 'clientes-crecimiento',
    modulo: 'clientes',
    titulo: 'Crecimiento de Clientes',
    descripcion: 'Nuevos clientes, total acumulado y crecimiento',
    categoria: 'comercial',
    periodosSugeridos: ['mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const branchFilter = getBranchFilter();
      const tz = await getOrganizationTimezone(orgId);
      const { start, end } = getDateRange(periodo.fechaInicio, periodo.fechaFin, tz);

      // Conteo total exacto (sin límite de 1000)
      const baseEq: Record<string, unknown> = { organization_id: orgId };
      if (branchFilter !== null) baseEq.branch_id = branchFilter;

      const { count: totalAcumulado } = await supabase
        .from('customers')
        .select('*', { count: 'exact', head: true })
        .match(baseEq)
        .lte('created_at', end);

      // Nuevos en el período seleccionado
      const { count: nuevosEnPeriodo } = await supabase
        .from('customers')
        .select('*', { count: 'exact', head: true })
        .match(baseEq)
        .gte('created_at', start)
        .lte('created_at', end);

      // Desglose mensual: últimos 12 meses hasta la fecha fin del período
      // Usar count queries por mes en lugar de paginar todos los registros
      const fechaFin = new Date(end);
      const fechaInicio12m = new Date(fechaFin);
      fechaInicio12m.setMonth(fechaInicio12m.getMonth() - 11);
      fechaInicio12m.setDate(1);
      fechaInicio12m.setHours(0, 0, 0, 0);

      const porMes: Record<string, number> = {};

      // Generar claves de mes para los últimos 12 meses
      const mesesKeys: string[] = [];
      const tmpDate = new Date(fechaInicio12m);
      while (tmpDate <= fechaFin) {
        const key = `${tmpDate.getFullYear()}-${String(tmpDate.getMonth() + 1).padStart(2, '0')}-01`;
        mesesKeys.push(key);
        porMes[key] = 0;
        tmpDate.setMonth(tmpDate.getMonth() + 1);
      }

      // Un count query por mes (12 queries máximo, mucho más rápido que paginar 18K registros)
      // Rangos ajustados a la zona horaria de la organizacion para evitar desplazamiento de dia
      const countPromises = mesesKeys.map((mesKey) => {
        // mesKey = YYYY-MM-01; calcular último día del mes
        const [y, m] = mesKey.split('-').map(Number);
        const ultimoDia = new Date(Date.UTC(y, m, 0)).getUTCDate();
        const mesInicioStr = `${mesKey.slice(0, 8)}01`;
        const mesFinStr = `${mesKey.slice(0, 8)}${String(ultimoDia).padStart(2, '0')}`;
        const { start: mesStart, end: mesEnd } = getDateRange(mesInicioStr, mesFinStr, tz);

        return supabase
          .from('customers')
          .select('*', { count: 'exact', head: true })
          .match(baseEq)
          .gte('created_at', mesStart)
          .lte('created_at', mesEnd)
          .then(({ count }) => ({ mesKey, count: count ?? 0 }));
      });

      const counts = await Promise.all(countPromises);
      for (const { mesKey, count } of counts) {
        porMes[mesKey] = count;
      }

      // Construir filas con acumulado y crecimiento
      const mesesOrdenados = Object.entries(porMes).sort((a, b) => a[0].localeCompare(b[0]));
      let acumuladoAntes = (totalAcumulado ?? 0) - mesesOrdenados.reduce((s, [, n]) => s + n, 0);
      if (acumuladoAntes < 0) acumuladoAntes = 0;

      const filas: Record<string, unknown>[] = [];
      let nuevoAcumulado = acumuladoAntes;
      for (const [mesKey, nuevos] of mesesOrdenados) {
        nuevoAcumulado += nuevos;
        const crecimiento = nuevoAcumulado > 0
          ? Math.round((nuevos / (nuevoAcumulado - nuevos)) * 1000) / 10
          : 0;
        filas.push({
          mes: mesKey,
          nuevos,
          acumulado: nuevoAcumulado,
          crecimiento: isFinite(crecimiento) ? crecimiento : 0,
        });
      }

      // KPIs
      const promedioMensual = filas.length > 0
        ? Math.round(filas.reduce((s, f) => s + Number(f.nuevos), 0) / filas.length)
        : 0;
      const nuevosMesAnterior = filas.length >= 2 ? Number(filas[filas.length - 2].nuevos) : 0;
      const nuevosMesActual = filas.length >= 1 ? Number(filas[filas.length - 1].nuevos) : 0;
      const tasaCrecimiento = nuevosMesAnterior > 0
        ? Math.round(((nuevosMesActual - nuevosMesAnterior) / nuevosMesAnterior) * 1000) / 10
        : 0;

      return buildReportData(
        'clientes-crecimiento', 'Crecimiento de Clientes', 'clientes', periodo,
        [
          { titulo: 'Total Clientes', valor: totalAcumulado ?? 0, formato: 'numero' },
          { titulo: 'Nuevos en Período', valor: nuevosEnPeriodo ?? 0, formato: 'numero' },
          { titulo: 'Promedio Mensual', valor: promedioMensual, formato: 'numero' },
          { titulo: 'Tasa de Crecimiento', valor: isFinite(tasaCrecimiento) ? tasaCrecimiento : 0, formato: 'porcentaje' },
        ],
        [
          { key: 'mes', titulo: 'Mes', tipo: 'fecha' },
          { key: 'nuevos', titulo: 'Nuevos', tipo: 'numero', alinear: 'right' },
          { key: 'acumulado', titulo: 'Acumulado', tipo: 'numero', alinear: 'right' },
          { key: 'crecimiento', titulo: 'Crecimiento', tipo: 'porcentaje', alinear: 'right' },
        ],
        filas.reverse(),
        { nuevos: filas.reduce((s, f) => s + Number(f.nuevos), 0) },
      );
    },
  },
  {
    id: 'clientes-tipo',
    modulo: 'clientes',
    titulo: 'Clientes por Tipo',
    descripcion: 'Distribución por tipo (persona/empresa), ciudad, segmento',
    categoria: 'comercial',
    periodosSugeridos: ['mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const branchFilter = getBranchFilter();

      // Conteos exactos con head:true (evita el límite de 1000 filas)
      const baseEq = { 'organization_id': orgId } as Record<string, unknown>;
      if (branchFilter !== null) baseEq['branch_id'] = branchFilter;

      const [totalRes, personRes, companyRes] = await Promise.all([
        supabase.from('customers').select('*', { count: 'exact', head: true }).match(baseEq),
        supabase.from('customers').select('*', { count: 'exact', head: true }).match({ ...baseEq, customer_type: 'person' }),
        supabase.from('customers').select('*', { count: 'exact', head: true }).match({ ...baseEq, customer_type: 'company' }),
      ]);

      const total = totalRes.count ?? 0;
      const personCount = personRes.count ?? 0;
      const companyCount = companyRes.count ?? 0;

      // Construir tabla: solo Persona y Empresa
      const pct = (n: number) => total > 0 ? Math.round((n / total) * 1000) / 10 : 0;

      const filas = [
        { tipo: 'Persona', cantidad: personCount, porcentaje: pct(personCount) },
        { tipo: 'Empresa', cantidad: companyCount, porcentaje: pct(companyCount) },
      ];

      return buildReportData(
        'clientes-tipo', 'Clientes por Tipo', 'clientes', periodo,
        [
          { titulo: 'Total Clientes', valor: total, formato: 'numero' },
          { titulo: 'Personas', valor: personCount, formato: 'numero' },
          { titulo: 'Empresas', valor: companyCount, formato: 'numero' },
        ],
        [
          { key: 'tipo', titulo: 'Tipo', tipo: 'texto' },
          { key: 'cantidad', titulo: 'Cantidad', tipo: 'numero', alinear: 'right' },
          { key: 'porcentaje', titulo: '%', tipo: 'porcentaje', alinear: 'right' },
        ],
        filas,
        { cantidad: total },
      );
    },
  },
  {
    id: 'clientes-top',
    modulo: 'clientes',
    titulo: 'Top Clientes',
    descripcion: 'Clientes por volumen de compras y valor',
    categoria: 'comercial',
    periodosSugeridos: ['mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const tz = await getOrganizationTimezone(orgId);
      const { start, end } = getDateRange(periodo.fechaInicio, periodo.fechaFin, tz);
      const { data, error } = await supabase
        .from('sales')
        .select('customer_id, total, customers!inner(first_name, last_name, customer_type, company_name)')
        .eq('organization_id', orgId)
        .gte('sale_date', start)
        .lte('sale_date', end)
        .not('status', 'in', '("cancelled","void")')
        .not('customer_id', 'is', null);

      if (error) throw error;

      const ventas = data ?? [];
      const porCliente: Record<string, { total: number; num: number; nombre: string; tipo: string }> = {};
      ventas.forEach((v: Record<string, unknown>) => {
        const id = String(v.customer_id ?? '');
        if (!porCliente[id]) {
          const c = v.customers as Record<string, unknown> | null;
          const tipo = String(c?.customer_type ?? 'persona');
          const nombre = tipo === 'empresa'
            ? String(c?.company_name ?? '—')
            : `${c?.first_name ?? ''} ${c?.last_name ?? ''}`.trim() || '—';
          porCliente[id] = { total: 0, num: 0, nombre, tipo };
        }
        porCliente[id].total += Number(v.total ?? 0);
        porCliente[id].num++;
      });

      const filas = Object.entries(porCliente)
        .map(([cliente_id, v]) => ({
          cliente_id,
          nombre: v.nombre,
          tipo: v.tipo === 'empresa' ? 'Empresa' : 'Persona',
          total: v.total,
          num_ventas: v.num,
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 20);

      return buildReportData(
        'clientes-top', 'Top Clientes', 'clientes', periodo,
        [
          { titulo: 'Clientes Activos', valor: filas.length, formato: 'numero' },
          { titulo: 'Total Ventas', valor: filas.reduce((s, f) => s + f.total, 0), formato: 'moneda' },
        ],
        [
          { key: 'nombre', titulo: 'Cliente', tipo: 'texto' },
          { key: 'tipo', titulo: 'Tipo', tipo: 'texto' },
          { key: 'total', titulo: 'Total Compras', tipo: 'moneda', alinear: 'right' },
          { key: 'num_ventas', titulo: 'N° Compras', tipo: 'numero', alinear: 'right' },
        ],
        filas,
        { total: filas.reduce((s, f) => s + f.total, 0) },
      );
    },
  },
];
