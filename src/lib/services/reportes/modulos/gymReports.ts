// ============================================================
// Reportes de Gimnasio (Gym)
// Consultas directas a Supabase para membresías, asistencia y retención
// ============================================================

import { supabase as browserSupabase } from '@/lib/supabase/config';
import type { ReportesClient } from '../types';
// F0-SEC r3 (tester r2, fallo 3): `fetch` acepta el cliente de Supabase por
// parámetro. En el navegador (app/reportes) cae al cliente browser con la sesión
// del usuario; en el servidor (asistente de reportes) el route handler pasa el
// cliente de sesión de `getServerOrgContext()`, así que las RPC `fn_reporte_*`
// corren como `authenticated` miembro y nunca como `anon`.
import type { DefinicionModulo, ReportData, PeriodoCierre } from '../types';
import { franjaDelPeriodo } from '../rangoPeriodo';
import { getOrganizationTimezone } from '@/lib/services/organizationTimezoneService';
import { getOrgDateRange, toPlainDate } from '@/lib/utils/timezone';
import {
  calcularMrr,
  cuotaMensualDeMembresia,
  preciosVigentesPorProducto,
  sumaAlMrr,
  type FilaPrecio,
  type MembresiaMrr,
} from '@/lib/services/membresias/mrr';

/** Membresía tal como la lee el informe (el plan sin `price`: el precio sale de product_prices, P9). */
interface FilaMembresiaInforme {
  id: number;
  status: string;
  start_date: string | null;
  end_date: string;
  grace_until: string | null;
  branch_id: number | null;
  product_id: number | null;
  membership_plans:
    | { name: string | null; product_id: number | null; duration_unit: string | null; duration_value: number | null; duration_days: number | null }
    | null;
}

function buildReportData(
  id: string, titulo: string, modulo: string, periodo: PeriodoCierre,
  kpis: ReportData['kpis'], columnas: ReportData['columnas'],
  filas: Record<string, unknown>[], totales?: Record<string, unknown>,
): ReportData {
  return { id, titulo, modulo, kpis, columnas, filas, totales, generadoEn: new Date().toISOString(), periodo };
}

export const gymReports: DefinicionModulo[] = [
  {
    id: 'gym-membresias',
    modulo: 'gym',
    titulo: 'Membresías activas',
    descripcion: 'Membresías activas y en gracia, nuevas e ingreso recurrente mensual',
    categoria: 'comercial',
    alcance: 'sucursal',
    periodosSugeridos: ['semanal', 'mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre, branchId?: number | null, client?: ReportesClient): Promise<ReportData> {
      const db = client ?? browserSupabase;
      const ahora = new Date();
      let consulta = db
        .from('memberships')
        .select(
          'id, status, start_date, end_date, grace_until, branch_id, product_id, ' +
            'membership_plans(name, product_id, duration_unit, duration_value, duration_days)',
        )
        .eq('organization_id', orgId);
      // Con sucursal elegida, solo las membresías vendidas en ella (las legadas sin sucursal quedan fuera).
      if (branchId != null) consulta = consulta.eq('branch_id', branchId);
      const [tz, { data, error }] = await Promise.all([getOrganizationTimezone(orgId, db), consulta]);
      if (error) throw error;

      const filas = (data ?? []) as unknown as FilaMembresiaInforme[];
      const aMrr = (m: FilaMembresiaInforme): MembresiaMrr => ({
        status: m.status,
        start_date: m.start_date,
        end_date: m.end_date,
        grace_until: m.grace_until,
        product_id: m.product_id,
        plan: m.membership_plans,
      });

      // Precio VIGENTE del producto de cada plan (P9), no membership_plans.price.
      const productIds = Array.from(
        new Set(
          filas
            .map((m) => Number(m.membership_plans?.product_id ?? m.product_id))
            .filter((v) => Number.isFinite(v) && v > 0),
        ),
      );
      let precios = new Map<number, number>();
      if (productIds.length > 0) {
        const { data: filasPrecio, error: errorPrecio } = await db
          .from('product_prices')
          .select('id, product_id, price, effective_from, effective_to')
          .in('product_id', productIds)
          .lte('effective_from', ahora.toISOString());
        if (errorPrecio) throw errorPrecio;
        precios = preciosVigentesPorProducto((filasPrecio ?? []) as unknown as FilaPrecio[], ahora);
      }

      const membresias = filas.map((m) => ({
        id: m.id,
        plan_name: m.membership_plans?.name ?? 'Sin plan',
        status: m.status,
        monthly_fee: cuotaMensualDeMembresia(aMrr(m), precios),
        // Día calendario de la organización (start_date es timestamptz).
        start_date: m.start_date ? toPlainDate(new Date(m.start_date), tz) : null,
      }));
      const activas = filas.filter((m) => sumaAlMrr(aMrr(m), ahora, tz));
      const nuevas = membresias.filter(
        (m) => m.start_date !== null && m.start_date >= periodo.fechaInicio && m.start_date <= periodo.fechaFin,
      );
      const mrr = calcularMrr(filas.map(aMrr), precios, ahora, tz);

      return buildReportData(
        'gym-membresias', 'Membresías activas', 'gym', periodo,
        [
          { titulo: 'Activas y en gracia', valor: activas.length, formato: 'numero' },
          { titulo: 'Nuevas', valor: nuevas.length, formato: 'numero' },
          { titulo: 'MRR', valor: mrr, formato: 'moneda' },
        ],
        [
          { key: 'plan_name', titulo: 'Plan', tipo: 'texto' },
          { key: 'status', titulo: 'Estado', tipo: 'texto' },
          { key: 'monthly_fee', titulo: 'Cuota mensual', tipo: 'moneda', alinear: 'right' },
          { key: 'start_date', titulo: 'Inicio', tipo: 'fecha' },
        ],
        membresias,
      );
    },
  },
  {
    id: 'gym-asistencia',
    modulo: 'gym',
    titulo: 'Actividad de membresías',
    descripcion: 'Altas, renovaciones y cancelaciones por día',
    categoria: 'operativo',
    alcance: 'organizacion',
    periodosSugeridos: ['semanal'],
    async fetch(orgId: number, periodo: PeriodoCierre, branchId?: number | null, client?: ReportesClient): Promise<ReportData> {
      const db = client ?? browserSupabase;
      // Límites del periodo en la zona de la organización (no en UTC).
      const { start, end, timezone } = await getOrgDateRange(orgId, periodo.fechaInicio, periodo.fechaFin, franjaDelPeriodo(periodo), db);
      const { data, error } = await db
        .from('membership_events')
        .select('id, membership_id, event_type, created_at')
        .eq('organization_id', orgId)
        .gte('created_at', start)
        .lte('created_at', end);

      if (error) throw error;

      const eventos = data ?? [];
      const porDia: Record<string, number> = {};
      eventos.forEach((c: Record<string, unknown>) => {
        const dia = toPlainDate(new Date(String(c.created_at)), timezone);
        porDia[dia] = (porDia[dia] ?? 0) + 1;
      });

      const filas = Object.entries(porDia).map(([dia, cantidad]) => ({ dia, cantidad }));

      return buildReportData(
        'gym-asistencia', 'Actividad de membresías', 'gym', periodo,
        [
          { titulo: 'Total Eventos', valor: eventos.length, formato: 'numero' },
        ],
        [
          { key: 'dia', titulo: 'Día', tipo: 'fecha' },
          { key: 'cantidad', titulo: 'Eventos', tipo: 'numero', alinear: 'right' },
        ],
        filas,
        { cantidad: eventos.length },
      );
    },
  },
  {
    id: 'gym-retencion',
    modulo: 'gym',
    titulo: 'Retención',
    descripcion: 'Tasa de retención y abandono por cohorte',
    categoria: 'comercial',
    alcance: 'organizacion',
    periodosSugeridos: ['mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre, branchId?: number | null, client?: ReportesClient): Promise<ReportData> {
      const db = client ?? browserSupabase;
      const [tz, { data, error }] = await Promise.all([
        getOrganizationTimezone(orgId, db),
        db.from('memberships').select('id, status, start_date, end_date').eq('organization_id', orgId),
      ]);

      if (error) throw error;

      const membresias = data ?? [];
      const activas = membresias.filter((m: Record<string, unknown>) => m.status === 'active').length;
      const canceladas = membresias.filter((m: Record<string, unknown>) => {
        // end_date es timestamptz: se compara su día en la zona de la organización.
        const end = m.end_date ? toPlainDate(new Date(String(m.end_date)), tz) : '';
        return m.status !== 'active' && end >= periodo.fechaInicio && end <= periodo.fechaFin;
      }).length;
      const total = activas + canceladas;
      const retencion = total > 0 ? Math.round((activas / total) * 100) : 0;
      const churn = total > 0 ? Math.round((canceladas / total) * 100) : 0;

      return buildReportData(
        'gym-retencion', 'Retención', 'gym', periodo,
        [
          { titulo: 'Activas', valor: activas, formato: 'numero' },
          { titulo: 'Canceladas', valor: canceladas, formato: 'numero' },
          { titulo: 'Tasa Retención', valor: retencion, formato: 'porcentaje' },
          { titulo: 'Churn', valor: churn, formato: 'porcentaje' },
        ],
        [
          { key: 'metrica', titulo: 'Métrica', tipo: 'texto' },
          { key: 'valor', titulo: 'Valor', tipo: 'numero', alinear: 'right' },
        ],
        [
          { metrica: 'Membresías Activas', valor: activas },
          { metrica: 'Canceladas en Período', valor: canceladas },
          { metrica: 'Tasa de Retención %', valor: retencion },
          { metrica: 'Churn Rate %', valor: churn },
        ],
      );
    },
  },
];
