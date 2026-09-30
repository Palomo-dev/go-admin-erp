// ============================================================
// Reportes de Finanzas
// Llama a las RPCs: fn_reporte_cxc_aging, fn_reporte_cxp_aging, fn_reporte_flujo_efectivo, fn_reporte_impuestos,
// fn_reporte_retenciones_practicadas, fn_reporte_gastos_naturaleza, fn_reporte_rentabilidad_producto,
// fn_reporte_ventas_resumen, fn_reporte_bancos_conciliacion, fn_reporte_caja_bancos_diario
// ============================================================

import { supabase as browserSupabase } from '@/lib/supabase/config';
import type { ReportesClient } from '../types';
// F0-SEC r3 (tester r2, fallo 3): `fetch` acepta el cliente de Supabase por
// parámetro. En el navegador (app/reportes) cae al cliente browser con la sesión
// del usuario; en el servidor (asistente de reportes) el route handler pasa el
// cliente de sesión de `getServerOrgContext()`, así que las RPC `fn_reporte_*`
// corren como `authenticated` miembro y nunca como `anon`.
import { applyBranchFilter, normalizeBranchParam } from '@/lib/services/branchFilterHelper';
import type { DefinicionModulo, ReportData, PeriodoCierre, VistaReporte } from '../types';
import { rangoDelPeriodo } from '../rangoPeriodo';
import { vistaRentabilidadProducto } from './rentabilidadProducto';

function buildReportData(
  id: string,
  titulo: string,
  modulo: string,
  periodo: PeriodoCierre,
  kpis: ReportData['kpis'],
  columnas: ReportData['columnas'],
  filas: Record<string, unknown>[],
  totales?: Record<string, unknown>,
): ReportData {
  return { id, titulo, modulo, kpis, columnas, filas, totales, generadoEn: new Date().toISOString(), periodo };
}

interface RetencionesPracticadas {
  totales: { retefuente?: number; reteiva?: number; reteica?: number; total?: number; facturas?: number; proveedores?: number };
  por_tipo: Array<{ clase: string; concepto: string; cuenta: string | null; tarifa: number | null; base: number | null; retenido: number | null; facturas: number | null }>;
  por_proveedor: Array<{ proveedor_id: number; proveedor: string | null; nit: string | null; facturas: number | null; retefuente: number | null; reteiva: number | null; reteica: number | null; retenido: number | null }>;
}

/** Normaliza el jsonb de `fn_reporte_retenciones_practicadas` (el doble de los tests devuelve `{}`). */
function aRetencionesPracticadas(data: unknown): RetencionesPracticadas {
  const d = (data ?? {}) as Partial<RetencionesPracticadas>;
  return {
    totales: d.totales ?? {},
    por_tipo: Array.isArray(d.por_tipo) ? d.por_tipo : [],
    por_proveedor: Array.isArray(d.por_proveedor) ? d.por_proveedor : [],
  };
}

/** Clase de `fn_clase_retencion` → rótulo de la DIAN. */
const CLASES_RETENCION: Record<string, string> = {
  retefuente: 'ReteFuente',
  reteiva: 'ReteIVA',
  reteica: 'ReteICA',
};

function kpisRetenciones(t: RetencionesPracticadas['totales']): ReportData['kpis'] {
  return [
    { titulo: 'ReteFuente', valor: Number(t.retefuente ?? 0), formato: 'moneda' },
    { titulo: 'ReteIVA', valor: Number(t.reteiva ?? 0), formato: 'moneda' },
    { titulo: 'ReteICA', valor: Number(t.reteica ?? 0), formato: 'moneda' },
    { titulo: 'Total a declarar', valor: Number(t.total ?? 0), formato: 'moneda' },
  ];
}

/** Vista «Por proveedor»: la base del certificado de retenciones de cada uno. */
function vistaRetencionesPorProveedor(d: RetencionesPracticadas): Pick<VistaReporte, 'columnas' | 'filas' | 'totales'> {
  const t = d.totales;
  return {
    columnas: [
      { key: 'proveedor', titulo: 'Proveedor', tipo: 'texto' },
      { key: 'nit', titulo: 'NIT', tipo: 'texto' },
      { key: 'facturas', titulo: 'Facturas', tipo: 'numero', alinear: 'right' },
      { key: 'retefuente', titulo: 'ReteFuente', tipo: 'moneda', alinear: 'right' },
      { key: 'reteiva', titulo: 'ReteIVA', tipo: 'moneda', alinear: 'right' },
      { key: 'reteica', titulo: 'ReteICA', tipo: 'moneda', alinear: 'right' },
      { key: 'retenido', titulo: 'Total retenido', tipo: 'moneda', alinear: 'right' },
    ],
    filas: d.por_proveedor.map((f) => ({
      proveedor: f.proveedor ?? `Proveedor #${f.proveedor_id}`,
      nit: f.nit ?? '',
      facturas: Number(f.facturas ?? 0),
      retefuente: Number(f.retefuente ?? 0),
      reteiva: Number(f.reteiva ?? 0),
      reteica: Number(f.reteica ?? 0),
      retenido: Number(f.retenido ?? 0),
    })),
    totales: {
      proveedor: 'Total',
      facturas: Number(t.facturas ?? 0),
      retefuente: Number(t.retefuente ?? 0),
      reteiva: Number(t.reteiva ?? 0),
      reteica: Number(t.reteica ?? 0),
      retenido: Number(t.total ?? 0),
    },
  };
}

export const finanzasReports: DefinicionModulo[] = [
  {
    id: 'cxc-vencidas',
    modulo: 'finance',
    titulo: 'Cuentas por cobrar vencidas',
    descripcion: 'Facturas vencidas por cliente y antigüedad',
    categoria: 'financiero',
    alcance: 'sucursal',
    periodosSugeridos: ['diario'],
    async fetch(orgId: number, periodo: PeriodoCierre, branchId?: number | null, client?: ReportesClient): Promise<ReportData> {
      const db = client ?? browserSupabase;
      let query = db
        .from('accounts_receivable')
        .select('id, customer_id, invoice_id, amount, balance, due_date, days_overdue, status, branch_id, discount_amount, created_at, customers(first_name, last_name, customer_type, company_name)')
        .eq('organization_id', orgId)
        .not('status', 'in', '("paid","cancelled")')
        .gt('days_overdue', 0)
        .order('days_overdue', { ascending: false });
      query = applyBranchFilter(query, branchId);
      const { data, error } = await query;

      if (error) throw error;

      const rawData = data ?? [];

      const branchIds = [...new Set(rawData.map((r: Record<string, unknown>) => Number(r.branch_id)).filter(Boolean))];
      const { data: sucursales } = await db
        .from('branches')
        .select('id, name')
        .in('id', branchIds);

      const sucursalesMap: Record<number, string> = {};
      (sucursales ?? []).forEach((b: Record<string, unknown>) => {
        sucursalesMap[Number(b.id)] = String(b.name ?? '—');
      });

      const statusLabel: Record<string, string> = {
        open: 'Abierta',
        partial: 'Pago Parcial',
        overdue: 'Vencida',
        disputed: 'Disputada',
        written_off: 'Castigada',
      };

      const items = rawData.map((r: Record<string, unknown>) => {
        const c = r.customers as Record<string, unknown> | null;
        const tipo = String(c?.customer_type ?? 'persona');
        const nombre = tipo === 'empresa'
          ? String(c?.company_name ?? '—')
          : `${c?.first_name ?? ''} ${c?.last_name ?? ''}`.trim() || '—';
        const dias = Number(r.days_overdue ?? 0);
        const rango = dias <= 30 ? '1-30 días' : dias <= 60 ? '31-60 días' : dias <= 90 ? '61-90 días' : dias <= 180 ? '91-180 días' : '+180 días';
        return {
          nombre_cliente: nombre,
          tipo_cliente: tipo === 'empresa' ? 'Empresa' : 'Persona',
          sucursal: sucursalesMap[Number(r.branch_id)] ?? '—',
          factura: String(r.invoice_id ?? '—').slice(0, 8),
          monto: Number(r.amount ?? 0),
          abonado: Number(r.amount ?? 0) - Number(r.balance ?? 0),
          balance: Number(r.balance ?? 0),
          vencimiento: r.due_date,
          dias_vencido: dias,
          rango_antiguedad: rango,
          estado: statusLabel[String(r.status ?? '')] ?? String(r.status ?? '—'),
        };
      });

      const totalVencido = items.reduce((s, i) => s + i.balance, 0);
      const totalMonto = items.reduce((s, i) => s + i.monto, 0);
      const totalAbonado = items.reduce((s, i) => s + i.abonado, 0);
      const numFacturas = items.length;
      const clientesAfectados = new Set(items.map((i) => i.nombre_cliente)).size;
      const promDiasVencido = numFacturas > 0 ? Math.round(items.reduce((s, i) => s + i.dias_vencido, 0) / numFacturas) : 0;
      const maxDiasVencido = numFacturas > 0 ? Math.max(...items.map((i) => i.dias_vencido)) : 0;
      const rango30 = items.filter((i) => i.dias_vencido <= 30).length;
      const rango60 = items.filter((i) => i.dias_vencido > 30 && i.dias_vencido <= 60).length;
      const rango90 = items.filter((i) => i.dias_vencido > 60 && i.dias_vencido <= 90).length;
      const rango180 = items.filter((i) => i.dias_vencido > 90).length;

      return buildReportData(
        'cxc-vencidas', 'Cuentas por cobrar vencidas', 'finance', periodo,
        [
          { titulo: 'Total Vencido', valor: totalVencido, formato: 'moneda' },
          { titulo: 'N° Facturas', valor: numFacturas, formato: 'numero' },
          { titulo: 'Clientes Afectados', valor: clientesAfectados, formato: 'numero' },
          { titulo: 'Total Facturado', valor: totalMonto, formato: 'moneda' },
          { titulo: 'Total Abonado', valor: totalAbonado, formato: 'moneda' },
          { titulo: 'Prom. Días Vencido', valor: promDiasVencido, formato: 'numero' },
          { titulo: 'Máx. Días Vencido', valor: maxDiasVencido, formato: 'numero' },
          { titulo: '1-30 días', valor: rango30, formato: 'numero' },
          { titulo: '31-90 días', valor: rango60 + rango90, formato: 'numero' },
          { titulo: '+90 días', valor: rango180, formato: 'numero' },
        ],
        [
          { key: 'nombre_cliente', titulo: 'Cliente', tipo: 'texto' },
          { key: 'tipo_cliente', titulo: 'Tipo', tipo: 'texto' },
          { key: 'sucursal', titulo: 'Sucursal', tipo: 'texto' },
          { key: 'factura', titulo: 'Factura', tipo: 'texto' },
          { key: 'monto', titulo: 'Monto', tipo: 'moneda', alinear: 'right' },
          { key: 'abonado', titulo: 'Abonado', tipo: 'moneda', alinear: 'right' },
          { key: 'balance', titulo: 'Saldo', tipo: 'moneda', alinear: 'right' },
          { key: 'vencimiento', titulo: 'Vencimiento', tipo: 'fecha' },
          { key: 'dias_vencido', titulo: 'Días', tipo: 'numero', alinear: 'right' },
          { key: 'rango_antiguedad', titulo: 'Antigüedad', tipo: 'texto' },
          { key: 'estado', titulo: 'Estado', tipo: 'texto' },
        ],
        items,
        { balance: totalVencido, monto: totalMonto, abonado: totalAbonado },
      );
    },
  },
  {
    id: 'cxc-aging',
    modulo: 'finance',
    titulo: 'CxC — edades de saldo',
    descripcion: 'Cartera por rangos: corriente, 1–30, 31–60, 61–90 y más de 90 días',
    categoria: 'financiero',
    alcance: 'sucursal',
    periodosSugeridos: ['mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre, branchId?: number | null, client?: ReportesClient): Promise<ReportData> {
      const db = client ?? browserSupabase;
      const { data, error } = await db.rpc('fn_reporte_cxc_aging', {
        p_organization_id: orgId,
        p_as_of: periodo.fechaFin,
        p_branch_id: normalizeBranchParam(branchId),
      });
      if (error) throw error;

      const d = data ?? {};
      const buckets: Record<string, unknown>[] = d.buckets ?? [];

      const bucketLabel: Record<string, string> = {
        corriente: 'Corriente',
        '1-30': '1-30 días',
        '31-60': '31-60 días',
        '61-90': '61-90 días',
        '+90': '+90 días',
      };

      const bucketsTraducidos: Record<string, unknown>[] = buckets.map((b) => ({
        ...b,
        rango: bucketLabel[String(b.bucket ?? '')] ?? String(b.bucket ?? '—'),
      }));

      let detalleQuery = db
        .from('accounts_receivable')
        .select('id, customer_id, amount, balance, due_date, days_overdue, status, customers(first_name, last_name, customer_type, company_name)')
        .eq('organization_id', orgId)
        .not('status', 'in', '("paid","cancelled")')
        .order('days_overdue', { ascending: false });
      // Filtrar detalle de accounts_receivable por branch_id cuando branchId != null
      detalleQuery = applyBranchFilter(detalleQuery, branchId);
      const { data: detalleData, error: errDetalle } = await detalleQuery;

      if (errDetalle) throw errDetalle;

      const detalle = (detalleData ?? []).map((r: Record<string, unknown>) => {
        const c = r.customers as Record<string, unknown> | null;
        const tipo = String(c?.customer_type ?? 'persona');
        const nombre = tipo === 'empresa'
          ? String(c?.company_name ?? '—')
          : `${c?.first_name ?? ''} ${c?.last_name ?? ''}`.trim() || '—';
        const dias = Number(r.days_overdue ?? 0);
        const rango = dias === 0 ? 'Corriente'
          : dias <= 30 ? '1-30 días'
          : dias <= 60 ? '31-60 días'
          : dias <= 90 ? '61-90 días'
          : '+90 días';
        return {
          cliente: nombre,
          tipo_cliente: tipo === 'empresa' ? 'Empresa' : 'Persona',
          monto: Number(r.amount ?? 0),
          saldo: Number(r.balance ?? 0),
          vencimiento: r.due_date,
          dias_vencido: dias,
          rango,
        };
      });

      const totalCxC = Number(d.total ?? 0);
      const totalCorriente = bucketsTraducidos.find((b) => b.bucket === 'corriente')?.total ?? 0;
      const totalVencido = totalCxC - Number(totalCorriente);
      const numFacturas = bucketsTraducidos.reduce((s: number, b: Record<string, unknown>) => s + Number(b.cantidad ?? 0), 0);
      const pctVencido = totalCxC > 0 ? Math.round((totalVencido / totalCxC) * 100) : 0;
      const clientesAfectados = new Set(detalle.map((i) => i.cliente)).size;
      const rango30 = bucketsTraducidos.find((b) => b.bucket === '1-30')?.cantidad ?? 0;
      const rango60 = bucketsTraducidos.find((b) => b.bucket === '31-60')?.cantidad ?? 0;
      const rango90 = bucketsTraducidos.find((b) => b.bucket === '61-90')?.cantidad ?? 0;
      const rango180 = bucketsTraducidos.find((b) => b.bucket === '+90')?.cantidad ?? 0;

      const filas = detalle.length > 0 ? detalle : bucketsTraducidos;

      return buildReportData(
        'cxc-aging', 'CxC — edades de saldo', 'finance', periodo,
        [
          { titulo: 'Total CxC', valor: totalCxC, formato: 'moneda' },
          { titulo: 'Corriente', valor: Number(totalCorriente), formato: 'moneda' },
          { titulo: 'Vencido', valor: totalVencido, formato: 'moneda' },
          { titulo: '% Vencido', valor: pctVencido, formato: 'porcentaje' },
          { titulo: 'N° Facturas', valor: numFacturas, formato: 'numero' },
          { titulo: 'Clientes', valor: clientesAfectados, formato: 'numero' },
          { titulo: '1-30 días', valor: Number(rango30), formato: 'numero' },
          { titulo: '31-90 días', valor: Number(rango60) + Number(rango90), formato: 'numero' },
          { titulo: '+90 días', valor: Number(rango180), formato: 'numero' },
        ],
        detalle.length > 0
          ? [
              { key: 'cliente', titulo: 'Cliente', tipo: 'texto' },
              { key: 'tipo_cliente', titulo: 'Tipo', tipo: 'texto' },
              { key: 'monto', titulo: 'Monto', tipo: 'moneda', alinear: 'right' },
              { key: 'saldo', titulo: 'Saldo', tipo: 'moneda', alinear: 'right' },
              { key: 'vencimiento', titulo: 'Vencimiento', tipo: 'fecha' },
              { key: 'dias_vencido', titulo: 'Días', tipo: 'numero', alinear: 'right' },
              { key: 'rango', titulo: 'Rango', tipo: 'texto' },
            ]
          : [
              { key: 'rango', titulo: 'Rango', tipo: 'texto' },
              { key: 'cantidad', titulo: 'N° Facturas', tipo: 'numero', alinear: 'right' },
              { key: 'total', titulo: 'Total', tipo: 'moneda', alinear: 'right' },
            ],
        filas,
        detalle.length > 0
          ? { saldo: detalle.reduce((s, i) => s + i.saldo, 0) }
          : { total: totalCxC },
      );
    },
  },
  {
    id: 'cxp-aging',
    modulo: 'finance',
    titulo: 'CxP — edades de saldo',
    descripcion: 'Cuentas por pagar a proveedores por rango de vencimiento',
    categoria: 'financiero',
    alcance: 'sucursal',
    periodosSugeridos: ['mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre, branchId?: number | null, client?: ReportesClient): Promise<ReportData> {
      const db = client ?? browserSupabase;
      const { data, error } = await db.rpc('fn_reporte_cxp_aging', {
        p_organization_id: orgId,
        p_as_of: periodo.fechaFin,
        p_branch_id: normalizeBranchParam(branchId),
      });
      if (error) throw error;

      const d = data ?? {};
      const buckets: Record<string, unknown>[] = d.buckets ?? [];

      const bucketLabel: Record<string, string> = {
        corriente: 'Corriente',
        '1-30': '1-30 días',
        '31-60': '31-60 días',
        '61-90': '61-90 días',
        '+90': '+90 días',
      };

      const bucketsTraducidos: Record<string, unknown>[] = buckets.map((b) => ({
        ...b,
        rango: bucketLabel[String(b.bucket ?? '')] ?? String(b.bucket ?? '—'),
      }));

      let detalleQuery = db
        .from('accounts_payable')
        .select('id, supplier_id, invoice_id, amount, balance, due_date, days_overdue, status, branch_id, suppliers(name)')
        .eq('organization_id', orgId)
        .not('status', 'in', '("paid","cancelled")')
        .order('days_overdue', { ascending: false });
      detalleQuery = applyBranchFilter(detalleQuery, branchId);
      const { data: detalleData, error: errDetalle } = await detalleQuery;

      if (errDetalle) throw errDetalle;

      const rawData = detalleData ?? [];

      const branchIds = [...new Set(rawData.map((r: Record<string, unknown>) => Number(r.branch_id)).filter(Boolean))];
      const { data: sucursales } = await db
        .from('branches')
        .select('id, name')
        .in('id', branchIds);

      const sucursalesMap: Record<number, string> = {};
      (sucursales ?? []).forEach((b: Record<string, unknown>) => {
        sucursalesMap[Number(b.id)] = String(b.name ?? '—');
      });

      const statusLabel: Record<string, string> = {
        open: 'Abierta',
        partial: 'Pago Parcial',
        overdue: 'Vencida',
        disputed: 'Disputada',
        written_off: 'Castigada',
      };

      const detalle = rawData.map((r: Record<string, unknown>) => {
        const s = r.suppliers as Record<string, unknown> | null;
        const dias = Number(r.days_overdue ?? 0);
        const rango = dias === 0 ? 'Corriente'
          : dias <= 30 ? '1-30 días'
          : dias <= 60 ? '31-60 días'
          : dias <= 90 ? '61-90 días'
          : '+90 días';
        return {
          proveedor: s?.name ?? '—',
          sucursal: sucursalesMap[Number(r.branch_id)] ?? '—',
          factura: String(r.invoice_id ?? '—').slice(0, 8),
          monto: Number(r.amount ?? 0),
          abonado: Number(r.amount ?? 0) - Number(r.balance ?? 0),
          saldo: Number(r.balance ?? 0),
          vencimiento: r.due_date,
          dias_vencido: dias,
          rango,
          estado: statusLabel[String(r.status ?? '')] ?? String(r.status ?? '—'),
        };
      });

      const totalCxP = Number(d.total ?? 0);
      const totalCorriente = bucketsTraducidos.find((b) => b.bucket === 'corriente')?.total ?? 0;
      const totalVencido = totalCxP - Number(totalCorriente);
      const numFacturas = bucketsTraducidos.reduce((s: number, b: Record<string, unknown>) => s + Number(b.cantidad ?? 0), 0);
      const pctVencido = totalCxP > 0 ? Math.round((totalVencido / totalCxP) * 100) : 0;
      const proveedoresAfectados = new Set(detalle.map((i) => i.proveedor)).size;
      const rango30 = bucketsTraducidos.find((b) => b.bucket === '1-30')?.cantidad ?? 0;
      const rango60 = bucketsTraducidos.find((b) => b.bucket === '31-60')?.cantidad ?? 0;
      const rango90 = bucketsTraducidos.find((b) => b.bucket === '61-90')?.cantidad ?? 0;
      const rango180 = bucketsTraducidos.find((b) => b.bucket === '+90')?.cantidad ?? 0;

      const filas = detalle.length > 0 ? detalle : bucketsTraducidos;

      return buildReportData(
        'cxp-aging', 'CxP — edades de saldo', 'finance', periodo,
        [
          { titulo: 'Total CxP', valor: totalCxP, formato: 'moneda' },
          { titulo: 'Corriente', valor: Number(totalCorriente), formato: 'moneda' },
          { titulo: 'Vencido', valor: totalVencido, formato: 'moneda' },
          { titulo: '% Vencido', valor: pctVencido, formato: 'porcentaje' },
          { titulo: 'N° Facturas', valor: numFacturas, formato: 'numero' },
          { titulo: 'Proveedores', valor: proveedoresAfectados, formato: 'numero' },
          { titulo: '1-30 días', valor: Number(rango30), formato: 'numero' },
          { titulo: '31-90 días', valor: Number(rango60) + Number(rango90), formato: 'numero' },
          { titulo: '+90 días', valor: Number(rango180), formato: 'numero' },
        ],
        detalle.length > 0
          ? [
              { key: 'proveedor', titulo: 'Proveedor', tipo: 'texto' },
              { key: 'sucursal', titulo: 'Sucursal', tipo: 'texto' },
              { key: 'factura', titulo: 'Factura', tipo: 'texto' },
              { key: 'monto', titulo: 'Monto', tipo: 'moneda', alinear: 'right' },
              { key: 'abonado', titulo: 'Abonado', tipo: 'moneda', alinear: 'right' },
              { key: 'saldo', titulo: 'Saldo', tipo: 'moneda', alinear: 'right' },
              { key: 'vencimiento', titulo: 'Vencimiento', tipo: 'fecha' },
              { key: 'dias_vencido', titulo: 'Días', tipo: 'numero', alinear: 'right' },
              { key: 'rango', titulo: 'Rango', tipo: 'texto' },
              { key: 'estado', titulo: 'Estado', tipo: 'texto' },
            ]
          : [
              { key: 'rango', titulo: 'Rango', tipo: 'texto' },
              { key: 'cantidad', titulo: 'N° Facturas', tipo: 'numero', alinear: 'right' },
              { key: 'total', titulo: 'Total', tipo: 'moneda', alinear: 'right' },
            ],
        filas,
        detalle.length > 0
          ? { saldo: detalle.reduce((s, i) => s + i.saldo, 0) }
          : { total: totalCxP },
      );
    },
  },
  {
    id: 'flujo-efectivo',
    modulo: 'finance',
    titulo: 'Flujo de efectivo',
    descripcion: 'Flujo operativo, de inversión y de financiación del periodo',
    categoria: 'financiero',
    alcance: 'sucursal',
    periodosSugeridos: ['mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre, branchId?: number | null, client?: ReportesClient): Promise<ReportData> {
      const db = client ?? browserSupabase;
      const { start, end } = await rangoDelPeriodo(orgId, periodo, db);
      const { data, error } = await db.rpc('fn_reporte_flujo_efectivo', {
        p_organization_id: orgId,
        p_from: start,
        p_to: end,
        p_branch_id: normalizeBranchParam(branchId),
      });
      if (error) throw error;

      const d = data ?? {};

      return buildReportData(
        'flujo-efectivo', 'Flujo de efectivo', 'finance', periodo,
        [
          { titulo: 'Flujo Operativo', valor: d.operativo ?? 0, formato: 'moneda' },
          { titulo: 'Flujo Neto', valor: d.neto ?? 0, formato: 'moneda' },
        ],
        [
          { key: 'concepto', titulo: 'Concepto', tipo: 'texto' },
          { key: 'monto', titulo: 'Monto', tipo: 'moneda', alinear: 'right' },
        ],
        [
          { concepto: 'Entradas Operativas', monto: d.entradas ?? 0 },
          { concepto: 'Salidas Operativas', monto: -(d.salidas ?? 0) },
          { concepto: 'Flujo Operativo Neto', monto: d.operativo ?? 0 },
          { concepto: 'Inversión', monto: d.inversion ?? 0 },
          { concepto: 'Financiación', monto: d.financiacion ?? 0 },
          { concepto: 'Flujo Neto Total', monto: d.neto ?? 0 },
        ],
      );
    },
  },
  {
    id: 'impuestos',
    modulo: 'finance',
    titulo: 'Impuestos (IVA y retenciones)',
    descripcion: 'IVA generado, IVA descontable y retenciones del periodo',
    categoria: 'financiero',
    alcance: 'sucursal',
    periodosSugeridos: ['mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre, branchId?: number | null, client?: ReportesClient): Promise<ReportData> {
      const db = client ?? browserSupabase;
      const { start, end } = await rangoDelPeriodo(orgId, periodo, db);
      const { data, error } = await db.rpc('fn_reporte_impuestos', {
        p_organization_id: orgId,
        p_from: start,
        p_to: end,
        p_branch_id: normalizeBranchParam(branchId),
      });
      if (error) throw error;

      const d = data ?? {};

      return buildReportData(
        'impuestos', 'Impuestos (IVA y retenciones)', 'finance', periodo,
        [
          { titulo: 'IVA Generado', valor: d.iva_generado ?? 0, formato: 'moneda' },
          { titulo: 'IVA Descontable', valor: d.iva_descontable ?? 0, formato: 'moneda' },
          { titulo: 'IVA Neto', valor: d.iva_neto ?? 0, formato: 'moneda' },
          { titulo: 'Total Facturado', valor: d.total_facturado ?? 0, formato: 'moneda' },
        ],
        [
          { key: 'codigo', titulo: 'Código', tipo: 'texto' },
          { key: 'tasa', titulo: 'Tasa %', tipo: 'porcentaje', alinear: 'right' },
          { key: 'base', titulo: 'Base Gravable', tipo: 'moneda', alinear: 'right' },
          { key: 'monto', titulo: 'Monto IVA', tipo: 'moneda', alinear: 'right' },
        ],
        d.por_codigo ?? [],
      );
    },
  },
  {
    id: 'retenciones-practicadas',
    modulo: 'finance',
    titulo: 'Retenciones practicadas',
    descripcion: 'Retención en la fuente, de IVA y de ICA practicadas a proveedores',
    categoria: 'financiero',
    alcance: 'sucursal',
    periodosSugeridos: ['mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre, branchId?: number | null, client?: ReportesClient): Promise<ReportData> {
      const db = client ?? browserSupabase;
      const { start, end } = await rangoDelPeriodo(orgId, periodo, db);
      const { data, error } = await db.rpc('fn_reporte_retenciones_practicadas', {
        p_organization_id: orgId,
        p_from: start,
        p_to: end,
        p_branch_id: normalizeBranchParam(branchId),
      });
      if (error) throw error;
      const d = aRetencionesPracticadas(data);
      const t = d.totales;

      return {
        ...buildReportData(
          'retenciones-practicadas', 'Retenciones practicadas', 'finance', periodo,
          kpisRetenciones(t),
          [
            { key: 'tipo', titulo: 'Tipo', tipo: 'texto' },
            { key: 'concepto', titulo: 'Concepto', tipo: 'texto' },
            { key: 'cuenta', titulo: 'Cuenta', tipo: 'texto' },
            { key: 'base', titulo: 'Base', tipo: 'moneda', alinear: 'right' },
            { key: 'tarifa', titulo: 'Tarifa', tipo: 'porcentaje', alinear: 'right' },
            { key: 'retenido', titulo: 'Retenido', tipo: 'moneda', alinear: 'right' },
            { key: 'facturas', titulo: 'Facturas', tipo: 'numero', alinear: 'right' },
          ],
          d.por_tipo.map((f) => ({
            tipo: CLASES_RETENCION[f.clase] ?? f.clase,
            concepto: f.concepto,
            cuenta: f.cuenta,
            base: Number(f.base ?? 0),
            tarifa: Number(f.tarifa ?? 0),
            retenido: Number(f.retenido ?? 0),
            facturas: Number(f.facturas ?? 0),
          })),
          // Sin total de bases: la misma factura es base de varias retenciones.
          { tipo: 'Total a declarar', retenido: Number(t.total ?? 0), facturas: Number(t.facturas ?? 0) },
        ),
        vistaPrincipal: 'Por tipo',
        vistas: [{ id: 'por-proveedor', titulo: 'Por proveedor', ...vistaRetencionesPorProveedor(d) }],
      };
    },
  },
  {
    // Alias: la misma consulta, abierta en la vista «Por proveedor». Se
    // conserva para favoritos, cierres y el asistente que ya la nombran.
    id: 'retenciones-por-proveedor',
    modulo: 'finance',
    titulo: 'Retenciones por proveedor',
    descripcion: 'Lo retenido a cada proveedor en el período: la base del certificado de retenciones que se le expide',
    categoria: 'financiero',
    alcance: 'sucursal',
    periodosSugeridos: ['mensual', 'anual'],
    async fetch(orgId: number, periodo: PeriodoCierre, branchId?: number | null, client?: ReportesClient): Promise<ReportData> {
      const db = client ?? browserSupabase;
      const { start, end } = await rangoDelPeriodo(orgId, periodo, db);
      const { data, error } = await db.rpc('fn_reporte_retenciones_practicadas', {
        p_organization_id: orgId,
        p_from: start,
        p_to: end,
        p_branch_id: normalizeBranchParam(branchId),
      });
      if (error) throw error;
      const d = aRetencionesPracticadas(data);
      const vista = vistaRetencionesPorProveedor(d);

      return buildReportData(
        'retenciones-por-proveedor', 'Retenciones por proveedor', 'finance', periodo,
        kpisRetenciones(d.totales),
        vista.columnas,
        vista.filas,
        vista.totales,
      );
    },
  },
  {
    id: 'liquidez',
    modulo: 'finance',
    titulo: 'Liquidez (flujo proyectado)',
    descripcion: 'Proyección con la cartera y las cuentas por pagar pendientes',
    categoria: 'financiero',
    alcance: 'sucursal',
    periodosSugeridos: ['semanal'],
    async fetch(orgId: number, periodo: PeriodoCierre, branchId?: number | null, client?: ReportesClient): Promise<ReportData> {
      const db = client ?? browserSupabase;
      let cxcQuery = db
        .from('accounts_receivable')
        .select('balance, due_date')
        .eq('organization_id', orgId)
        .not('status', 'in', '("paid","cancelled")');
      cxcQuery = applyBranchFilter(cxcQuery, branchId);
      const { data: cxc } = await cxcQuery;

      let cxpQuery = db
        .from('accounts_payable')
        .select('balance, due_date')
        .eq('organization_id', orgId)
        .not('status', 'in', '("paid","cancelled")');
      cxpQuery = applyBranchFilter(cxpQuery, branchId);
      const { data: cxp } = await cxpQuery;

      const totalCxC = (cxc ?? []).reduce((s: number, r: Record<string, unknown>) => s + Number(r.balance ?? 0), 0);
      const totalCxP = (cxp ?? []).reduce((s: number, r: Record<string, unknown>) => s + Number(r.balance ?? 0), 0);

      return buildReportData(
        'liquidez', 'Liquidez (flujo proyectado)', 'finance', periodo,
        [
          { titulo: 'CxC Pendiente', valor: totalCxC, formato: 'moneda' },
          { titulo: 'CxP Pendiente', valor: totalCxP, formato: 'moneda' },
          { titulo: 'Liquidez Neta', valor: totalCxC - totalCxP, formato: 'moneda' },
        ],
        [
          { key: 'concepto', titulo: 'Concepto', tipo: 'texto' },
          { key: 'monto', titulo: 'Monto', tipo: 'moneda', alinear: 'right' },
        ],
        [
          { concepto: 'Cuentas por Cobrar', monto: totalCxC },
          { concepto: 'Cuentas por Pagar', monto: -totalCxP },
          { concepto: 'Liquidez Proyectada', monto: totalCxC - totalCxP },
        ],
      );
    },
  },
  {
    id: 'gastos-operativos',
    modulo: 'finance',
    titulo: 'Gastos operativos',
    descripcion: 'Gastos de la clase 5 del PUC por cuenta, en la sucursal elegida o consolidados',
    categoria: 'financiero',
    alcance: 'sucursal',
    periodosSugeridos: ['quincenal', 'mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre, branchId?: number | null, client?: ReportesClient): Promise<ReportData> {
      const db = client ?? browserSupabase;
      const { start, end } = await rangoDelPeriodo(orgId, periodo, db);
      const { data, error } = await db.rpc('fn_reporte_gastos_naturaleza', {
        p_organization_id: orgId,
        p_from: start,
        p_to: end,
        p_branch_id: normalizeBranchParam(branchId),
      });
      if (error) throw error;

      const d = (data ?? {}) as Record<string, unknown>;
      const esGasto = (grupo: unknown) => String(grupo ?? '').startsWith('5');
      const filas = (Array.isArray(d.cuentas) ? d.cuentas : [])
        .filter((c: Record<string, unknown>) => esGasto(c.grupo))
        .map((c: Record<string, unknown>) => ({ cuenta: String(c.cuenta ?? ''), nombre: String(c.nombre ?? ''), monto: Number(c.monto ?? 0) }));
      const grupos = (Array.isArray(d.grupos) ? d.grupos : []) as Array<Record<string, unknown>>;
      const sumaGrupos = (filtro: (g: Record<string, unknown>) => boolean) =>
        grupos.filter(filtro).reduce((s, g) => s + Number(g.monto ?? 0), 0);
      const total = sumaGrupos((g) => esGasto(g.grupo));

      return {
        ...buildReportData(
          'gastos-operativos', 'Gastos operativos', 'finance', periodo,
          [
            { titulo: 'Total gastos', valor: total, formato: 'moneda' },
            { titulo: 'Operacionales', valor: sumaGrupos((g) => g.naturaleza === 'operacional'), formato: 'moneda' },
            { titulo: 'No operacionales', valor: sumaGrupos((g) => g.naturaleza === 'no_operacional'), formato: 'moneda' },
            { titulo: 'Cuentas', valor: filas.length, formato: 'numero' },
          ],
          [
            { key: 'cuenta', titulo: 'Cuenta', tipo: 'texto' },
            { key: 'nombre', titulo: 'Nombre', tipo: 'texto' },
            { key: 'monto', titulo: 'Monto', tipo: 'moneda', alinear: 'right' },
          ],
          filas,
          { monto: total },
        ),
        lectura: d.truncado
          ? [{ tono: 'aviso', texto: 'La tabla muestra las 2.000 cuentas de mayor valor; los totales cubren todas.' }]
          : [],
      };
    },
  },
  {
    id: 'facturacion-electronica',
    modulo: 'finance',
    titulo: 'Facturación electrónica',
    descripcion: 'Documentos emitidos y su estado ante la DIAN',
    categoria: 'financiero',
    alcance: 'sucursal',
    periodosSugeridos: ['mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre, branchId?: number | null, client?: ReportesClient): Promise<ReportData> {
      const db = client ?? browserSupabase;
      const { start, end } = await rangoDelPeriodo(orgId, periodo, db);
      let facturacionQuery = db
        .from('invoice_sales')
        .select('id, subtotal, tax_total, total, balance, status, document_type, issue_date')
        .eq('organization_id', orgId)
        .gte('issue_date', start)
        .lte('issue_date', end)
        .order('issue_date', { ascending: false });
      facturacionQuery = applyBranchFilter(facturacionQuery, branchId);
      const { data, error } = await facturacionQuery;

      if (error) throw error;

      const rawData = (data ?? []).map((f) => ({
        ...f,
        document_type: f.document_type ?? 'invoice',
      })) as Record<string, unknown>[];

      const invoiceIds = rawData.map((f) => f.id);
      const { data: jobsData } = await db
        .from('electronic_invoicing_jobs')
        .select('invoice_id, status, cufe, provider, processed_at, error_message')
        .in('invoice_id', invoiceIds)
        .order('created_at', { ascending: false });

      const jobsByInvoice: Record<string, Record<string, unknown>> = {};
      (jobsData ?? []).forEach((j: Record<string, unknown>) => {
        const invId = String(j.invoice_id ?? '');
        if (!jobsByInvoice[invId]) jobsByInvoice[invId] = j;
      });

      const docTypeLabel: Record<string, string> = {
        invoice: 'Factura',
        credit_note: 'Nota Crédito',
        debit_note: 'Nota Débito',
      };

      const totalFacturas = rawData.length;
      const totalFacturado = rawData.reduce((s, f) => s + Number(f.total ?? 0), 0);
      const totalIVA = rawData.reduce((s, f) => s + Number(f.tax_total ?? 0), 0);

      const conIVA = rawData.filter((f) => Number(f.tax_total ?? 0) > 0);
      const sinIVA = rawData.filter((f) => Number(f.tax_total ?? 0) === 0);
      const baseGravable = conIVA.reduce((s, f) => s + Number(f.subtotal ?? 0), 0);
      const exento = sinIVA.reduce((s, f) => s + Number(f.subtotal ?? 0), 0);

      const anuladas = rawData.filter((f) => f.status === 'cancelled' || f.status === 'void').length;

      let dianAceptadas = 0;
      let dianPendientes = 0;
      let dianFallidas = 0;
      let dianConCUFE = 0;

      rawData.forEach((f) => {
        const job = jobsByInvoice[String(f.id)];
        if (job) {
          const dianStatus = String(job.status ?? '');
          if (dianStatus === 'accepted') dianAceptadas++;
          else if (dianStatus === 'pending') dianPendientes++;
          else if (dianStatus === 'failed' || dianStatus === 'rejected') dianFallidas++;
          if (job.cufe) dianConCUFE++;
        } else {
          dianPendientes++;
        }
      });

      const sinEnviar = totalFacturas - dianAceptadas - dianPendientes - dianFallidas;

      const tiposDoc = ['invoice', 'credit_note', 'debit_note'] as const;
      const filas: Record<string, unknown>[] = [];

      tiposDoc.forEach((tipo) => {
        const items = rawData.filter((f) => f.document_type === tipo);
        if (items.length === 0) return;
        const iva = items.reduce((s, f) => s + Number(f.tax_total ?? 0), 0);
        const total = items.reduce((s, f) => s + Number(f.total ?? 0), 0);
        const gravable = items.filter((f) => Number(f.tax_total ?? 0) > 0).reduce((s, f) => s + Number(f.subtotal ?? 0), 0);
        const noGravado = items.filter((f) => Number(f.tax_total ?? 0) === 0).reduce((s, f) => s + Number(f.subtotal ?? 0), 0);
        const aceptadas = items.filter((f) => {
          const job = jobsByInvoice[String(f.id)];
          return job && job.status === 'accepted';
        }).length;
        const pct = totalFacturado > 0 ? Math.round((total / totalFacturado) * 100) : 0;
        filas.push({
          tipo: docTypeLabel[tipo] ?? tipo,
          cantidad: items.length,
          base_gravable: gravable,
          iva,
          exento: noGravado,
          total,
          dian_aceptadas: aceptadas,
          pct,
        });
      });

      filas.push({
        tipo: 'TOTAL',
        cantidad: totalFacturas,
        base_gravable: baseGravable,
        iva: totalIVA,
        exento,
        total: totalFacturado,
        dian_aceptadas: dianAceptadas,
        pct: 100,
      });

      return buildReportData(
        'facturacion-electronica', 'Facturación electrónica', 'finance', periodo,
        [
          { titulo: 'Total Facturado', valor: totalFacturado, formato: 'moneda' },
          { titulo: 'Base Gravable', valor: baseGravable, formato: 'moneda' },
          { titulo: 'Exento/No Gravado', valor: exento, formato: 'moneda' },
          { titulo: 'Total IVA', valor: totalIVA, formato: 'moneda' },
          { titulo: 'DIAN Aceptadas', valor: dianAceptadas, formato: 'numero' },
          { titulo: 'DIAN Pendientes', valor: dianPendientes, formato: 'numero' },
          { titulo: 'DIAN Fallidas', valor: dianFallidas, formato: 'numero' },
          { titulo: 'Sin Enviar', valor: sinEnviar, formato: 'numero' },
          { titulo: 'Con CUFE', valor: dianConCUFE, formato: 'numero' },
          { titulo: 'Anuladas', valor: anuladas, formato: 'numero' },
        ],
        [
          { key: 'tipo', titulo: 'Tipo Documento', tipo: 'texto' },
          { key: 'cantidad', titulo: 'N°', tipo: 'numero', alinear: 'right' },
          { key: 'base_gravable', titulo: 'Base Gravable', tipo: 'moneda', alinear: 'right' },
          { key: 'iva', titulo: 'IVA', tipo: 'moneda', alinear: 'right' },
          { key: 'exento', titulo: 'Exento', tipo: 'moneda', alinear: 'right' },
          { key: 'total', titulo: 'Total', tipo: 'moneda', alinear: 'right' },
          { key: 'dian_aceptadas', titulo: 'DIAN Aceptadas', tipo: 'numero', alinear: 'right' },
          { key: 'pct', titulo: '%', tipo: 'porcentaje', alinear: 'right' },
        ],
        filas,
        { total: totalFacturado, iva: totalIVA, base: baseGravable, exento },
      );
    },
  },
  {
    id: 'rentabilidad-producto',
    modulo: 'finance',
    titulo: 'Rentabilidad por producto',
    descripcion: 'Ingreso neto, costo real de lo vendido y margen por producto',
    categoria: 'financiero',
    alcance: 'sucursal',
    periodosSugeridos: ['mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre, branchId?: number | null, client?: ReportesClient): Promise<ReportData> {
      const db = client ?? browserSupabase;
      const { start, end } = await rangoDelPeriodo(orgId, periodo, db);
      const { data, error } = await db.rpc('fn_reporte_rentabilidad_producto', {
        p_organization_id: orgId,
        p_from: start,
        p_to: end,
        p_branch_id: normalizeBranchParam(branchId),
      });
      if (error) throw error;

      const v = vistaRentabilidadProducto(data);
      return {
        ...buildReportData('rentabilidad-producto', 'Rentabilidad por producto', 'finance', periodo, v.kpis, v.columnas, v.filas, v.totales),
        vistaPrincipal: 'Por producto',
        vistas: v.vistas,
        lectura: v.lectura,
      };
    },
  },
  {
    id: 'rentabilidad-sucursal',
    modulo: 'finance',
    titulo: 'Rentabilidad por sucursal',
    descripcion: 'Ingresos, costos y margen por sucursal',
    categoria: 'financiero',
    alcance: 'sucursal',
    periodosSugeridos: ['mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre, branchId?: number | null, client?: ReportesClient): Promise<ReportData> {
      const db = client ?? browserSupabase;
      const { start, end } = await rangoDelPeriodo(orgId, periodo, db);
      const { data, error } = await db.rpc('fn_reporte_ventas_resumen', {
        p_organization_id: orgId,
        p_from: start,
        p_to: end,
        p_branch_id: normalizeBranchParam(branchId),
      });
      if (error) throw error;

      const d = data ?? {};
      const porSucursal = d.por_sucursal ?? [];

      return buildReportData(
        'rentabilidad-sucursal', 'Rentabilidad por sucursal', 'finance', periodo,
        [
          { titulo: 'Total Ventas', valor: d.total_ventas ?? 0, formato: 'moneda' },
          { titulo: 'Sucursales', valor: porSucursal.length, formato: 'numero' },
        ],
        [
          { key: 'sucursal_id', titulo: 'Sucursal', tipo: 'texto' },
          { key: 'total', titulo: 'Total Ventas', tipo: 'moneda', alinear: 'right' },
          { key: 'num_ventas', titulo: 'N° Ventas', tipo: 'numero', alinear: 'right' },
        ],
        porSucursal,
        { total: porSucursal.reduce((s: number, r: Record<string, unknown>) => s + Number(r.total ?? 0), 0),
          num_ventas: porSucursal.reduce((s: number, r: Record<string, unknown>) => s + Number(r.num_ventas ?? 0), 0) },
      );
    },
  },
  {
    id: 'bancos-conciliacion',
    modulo: 'finance',
    titulo: 'Bancos y conciliación',
    descripcion: 'Movimientos de cada cuenta bancaria en el periodo y lo que falta por conciliar',
    categoria: 'financiero',
    alcance: 'sucursal',
    periodosSugeridos: ['semanal', 'mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre, branchId?: number | null, client?: ReportesClient): Promise<ReportData> {
      const db = client ?? browserSupabase;
      const { start, end } = await rangoDelPeriodo(orgId, periodo, db);
      const { data, error } = await db.rpc('fn_reporte_bancos_conciliacion', {
        p_organization_id: orgId,
        p_from: start,
        p_to: end,
        p_branch_id: normalizeBranchParam(branchId),
      });
      if (error) throw error;

      const d = (data ?? {}) as Record<string, unknown>;
      const t = (d.totales ?? {}) as Record<string, unknown>;
      const cuentas = (Array.isArray(d.cuentas) ? d.cuentas : []) as Array<Record<string, unknown>>;
      const sinConciliar = Number(t.sin_conciliar ?? 0);
      const ultima = (c: Record<string, unknown>) => (c.ultima_conciliacion ?? null) as Record<string, unknown> | null;
      const conDiferencia = cuentas.filter((c) => Number(ultima(c)?.diferencia ?? 0) !== 0).length;

      const lectura: ReportData['lectura'] = [];
      if (cuentas.length === 0) {
        lectura.push({ tono: 'info', texto: 'No hay cuentas bancarias activas en este alcance.', href: '/app/finanzas/bancos', etiquetaAccion: 'Ver bancos' });
      }
      if (sinConciliar > 0) {
        lectura.push({ tono: 'aviso', texto: `${sinConciliar} movimientos del periodo siguen sin conciliar.`, href: '/app/finanzas/conciliacion-bancaria', etiquetaAccion: 'Conciliar' });
      }
      if (conDiferencia > 0) {
        lectura.push({ tono: 'alerta', texto: `${conDiferencia} cuentas cerraron su última conciliación con diferencia.`, href: '/app/finanzas/conciliacion-bancaria', etiquetaAccion: 'Revisar' });
      }

      const ESTADO_CONCILIACION: Record<string, string> = { draft: 'Borrador', in_progress: 'En curso', closed: 'Cerrada' };

      return {
        ...buildReportData(
          'bancos-conciliacion', 'Bancos y conciliación', 'finance', periodo,
          [
            { titulo: 'Cuentas', valor: Number(t.cuentas ?? 0), formato: 'numero' },
            { titulo: 'Entradas', valor: Number(t.entradas ?? 0), formato: 'moneda' },
            { titulo: 'Salidas', valor: Number(t.salidas ?? 0), formato: 'moneda' },
            { titulo: 'Movimientos sin conciliar', valor: sinConciliar, formato: 'numero' },
            { titulo: 'Monto por conciliar', valor: Number(t.por_conciliar ?? 0), formato: 'moneda' },
          ],
          [
            { key: 'cuenta', titulo: 'Cuenta', tipo: 'texto' },
            { key: 'banco', titulo: 'Banco', tipo: 'texto' },
            { key: 'moneda', titulo: 'Moneda', tipo: 'texto' },
            { key: 'saldo', titulo: 'Saldo actual', tipo: 'moneda', alinear: 'right' },
            { key: 'entradas', titulo: 'Entradas', tipo: 'moneda', alinear: 'right' },
            { key: 'salidas', titulo: 'Salidas', tipo: 'moneda', alinear: 'right' },
            { key: 'movimientos', titulo: 'Movimientos', tipo: 'numero', alinear: 'right' },
            { key: 'sin_conciliar', titulo: 'Sin conciliar', tipo: 'numero', alinear: 'right' },
            { key: 'ultima_hasta', titulo: 'Conciliada hasta', tipo: 'fecha' },
            { key: 'ultima_estado', titulo: 'Estado', tipo: 'texto' },
          ],
          cuentas.map((c) => ({
            cuenta: c.numero ? `${c.cuenta} · ${c.numero}` : c.cuenta,
            banco: c.banco ?? '',
            moneda: c.moneda ?? '',
            saldo: Number(c.saldo ?? 0),
            entradas: Number(c.entradas ?? 0),
            salidas: Number(c.salidas ?? 0),
            movimientos: Number(c.movimientos ?? 0),
            sin_conciliar: Number(c.sin_conciliar ?? 0),
            ultima_hasta: ultima(c)?.hasta ?? null,
            ultima_estado: ultima(c) ? (ESTADO_CONCILIACION[String(ultima(c)?.estado)] ?? String(ultima(c)?.estado)) : 'Nunca',
          })),
          { entradas: Number(t.entradas ?? 0), salidas: Number(t.salidas ?? 0), movimientos: Number(t.movimientos ?? 0), sin_conciliar: sinConciliar },
        ),
        lectura,
      };
    },
  },
  {
    id: 'caja-bancos-diario',
    modulo: 'finance',
    titulo: 'Caja y bancos: saldos diarios',
    descripcion: 'Entradas, salidas y saldo al cierre de cada día en caja (1105) y bancos (111x, 112x)',
    categoria: 'financiero',
    alcance: 'sucursal',
    periodosSugeridos: ['semanal', 'quincenal', 'mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre, branchId?: number | null, client?: ReportesClient): Promise<ReportData> {
      const db = client ?? browserSupabase;
      const { start, end } = await rangoDelPeriodo(orgId, periodo, db);
      const { data, error } = await db.rpc('fn_reporte_caja_bancos_diario', {
        p_organization_id: orgId,
        p_from: start,
        p_to: end,
        p_branch_id: normalizeBranchParam(branchId),
      });
      if (error) throw error;

      const d = (data ?? {}) as Record<string, unknown>;
      const dias = ((Array.isArray(d.dias) ? d.dias : []) as Array<Record<string, unknown>>).map((f) => ({
        dia: f.dia,
        caja_entradas: Number(f.caja_entradas ?? 0),
        caja_salidas: Number(f.caja_salidas ?? 0),
        saldo_caja: Number(f.saldo_caja ?? 0),
        bancos_entradas: Number(f.bancos_entradas ?? 0),
        bancos_salidas: Number(f.bancos_salidas ?? 0),
        saldo_bancos: Number(f.saldo_bancos ?? 0),
        saldo_total: Number(f.saldo_total ?? 0),
      }));
      const inicialCaja = Number(d.saldo_inicial_caja ?? 0);
      const inicialBancos = Number(d.saldo_inicial_bancos ?? 0);
      const final = dias[dias.length - 1];
      const suma = (k: keyof (typeof dias)[number]) => dias.reduce((s, f) => s + Number(f[k] ?? 0), 0);
      const diasCajaNegativa = dias.filter((f) => f.saldo_caja < 0).length;

      return {
        ...buildReportData(
          'caja-bancos-diario', 'Caja y bancos: saldos diarios', 'finance', periodo,
          [
            { titulo: 'Saldo inicial', valor: inicialCaja + inicialBancos, formato: 'moneda' },
            { titulo: 'Caja al cierre', valor: final?.saldo_caja ?? inicialCaja, formato: 'moneda' },
            { titulo: 'Bancos al cierre', valor: final?.saldo_bancos ?? inicialBancos, formato: 'moneda' },
            { titulo: 'Saldo final', valor: final?.saldo_total ?? inicialCaja + inicialBancos, formato: 'moneda' },
          ],
          [
            { key: 'dia', titulo: 'Día', tipo: 'fecha' },
            { key: 'caja_entradas', titulo: 'Caja: entradas', tipo: 'moneda', alinear: 'right' },
            { key: 'caja_salidas', titulo: 'Caja: salidas', tipo: 'moneda', alinear: 'right' },
            { key: 'saldo_caja', titulo: 'Saldo caja', tipo: 'moneda', alinear: 'right' },
            { key: 'bancos_entradas', titulo: 'Bancos: entradas', tipo: 'moneda', alinear: 'right' },
            { key: 'bancos_salidas', titulo: 'Bancos: salidas', tipo: 'moneda', alinear: 'right' },
            { key: 'saldo_bancos', titulo: 'Saldo bancos', tipo: 'moneda', alinear: 'right' },
            { key: 'saldo_total', titulo: 'Saldo total', tipo: 'moneda', alinear: 'right' },
          ],
          dias,
          {
            caja_entradas: suma('caja_entradas'),
            caja_salidas: suma('caja_salidas'),
            bancos_entradas: suma('bancos_entradas'),
            bancos_salidas: suma('bancos_salidas'),
          },
        ),
        lectura: diasCajaNegativa > 0
          ? [{ tono: 'alerta', texto: `La caja queda con saldo negativo en ${diasCajaNegativa} días: faltan registrar ingresos o sobran egresos.`, href: '/app/finanzas/contabilidad/asientos', etiquetaAccion: 'Ver asientos' }]
          : [],
      };
    },
  },
];
