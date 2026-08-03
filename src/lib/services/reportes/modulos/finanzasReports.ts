// ============================================================
// Reportes de Finanzas
// Llama a las RPCs: fn_reporte_cxc_aging, fn_reporte_cxp_aging, fn_reporte_flujo_efectivo, fn_reporte_impuestos
// ============================================================

import { supabase } from '@/lib/supabase/config';
import type { ReportDefinition, ReportData, PeriodoCierre } from '../types';

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

export const finanzasReports: ReportDefinition[] = [
  {
    id: 'cxc-vencidas',
    modulo: 'finance',
    titulo: 'Cuentas por Cobrar Vencidas',
    descripcion: 'Facturas vencidas agrupadas por cliente y antigüedad',
    categoria: 'financiero',
    periodosSugeridos: ['diario'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data, error } = await supabase
        .from('accounts_receivable')
        .select('id, customer_id, amount, balance, due_date, days_overdue, status')
        .eq('organization_id', orgId)
        .not('status', 'in', '("paid","cancelled")')
        .gt('days_overdue', 0)
        .order('days_overdue', { ascending: false });

      if (error) throw error;

      const items = data ?? [];

      return buildReportData(
        'cxc-vencidas', 'Cuentas por Cobrar Vencidas', 'finance', periodo,
        [
          { titulo: 'Total Vencido', valor: items.reduce((s: number, r: Record<string, unknown>) => s + Number(r.balance ?? 0), 0), formato: 'moneda' },
          { titulo: 'N° Facturas', valor: items.length, formato: 'numero' },
        ],
        [
          { key: 'customer_id', titulo: 'Cliente', tipo: 'texto' },
          { key: 'amount', titulo: 'Monto', tipo: 'moneda', alinear: 'right' },
          { key: 'balance', titulo: 'Saldo', tipo: 'moneda', alinear: 'right' },
          { key: 'due_date', titulo: 'Vencimiento', tipo: 'fecha' },
          { key: 'days_overdue', titulo: 'Días Vencido', tipo: 'numero', alinear: 'right' },
        ],
        items,
        { balance: items.reduce((s: number, r: Record<string, unknown>) => s + Number(r.balance ?? 0), 0) },
      );
    },
  },
  {
    id: 'cxc-aging',
    modulo: 'finance',
    titulo: 'CxC — Edades de Saldo',
    descripcion: 'Aging de cartera: corriente, 1-30, 31-60, 61-90, +90 días',
    categoria: 'financiero',
    periodosSugeridos: ['mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data, error } = await supabase.rpc('fn_reporte_cxc_aging', {
        p_organization_id: orgId,
        p_as_of: periodo.fechaFin,
      });
      if (error) throw error;

      const d = data ?? {};
      const buckets = d.buckets ?? [];

      return buildReportData(
        'cxc-aging', 'CxC — Edades de Saldo', 'finance', periodo,
        [
          { titulo: 'Total CxC', valor: d.total ?? 0, formato: 'moneda' },
        ],
        [
          { key: 'bucket', titulo: 'Rango', tipo: 'texto' },
          { key: 'cantidad', titulo: 'N° Facturas', tipo: 'numero', alinear: 'right' },
          { key: 'total', titulo: 'Total', tipo: 'moneda', alinear: 'right' },
        ],
        buckets,
        { total: d.total ?? 0 },
      );
    },
  },
  {
    id: 'cxp-aging',
    modulo: 'finance',
    titulo: 'CxP — Edades de Saldo',
    descripcion: 'Aging de cuentas por pagar al proveedor',
    categoria: 'financiero',
    periodosSugeridos: ['mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data, error } = await supabase.rpc('fn_reporte_cxp_aging', {
        p_organization_id: orgId,
        p_as_of: periodo.fechaFin,
      });
      if (error) throw error;

      const d = data ?? {};
      const buckets = d.buckets ?? [];

      return buildReportData(
        'cxp-aging', 'CxP — Edades de Saldo', 'finance', periodo,
        [
          { titulo: 'Total CxP', valor: d.total ?? 0, formato: 'moneda' },
        ],
        [
          { key: 'bucket', titulo: 'Rango', tipo: 'texto' },
          { key: 'cantidad', titulo: 'N° Facturas', tipo: 'numero', alinear: 'right' },
          { key: 'total', titulo: 'Total', tipo: 'moneda', alinear: 'right' },
        ],
        buckets,
        { total: d.total ?? 0 },
      );
    },
  },
  {
    id: 'flujo-efectivo',
    modulo: 'finance',
    titulo: 'Flujo de Efectivo',
    descripcion: 'Flujo operativo, inversión y financiación del período',
    categoria: 'financiero',
    periodosSugeridos: ['mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data, error } = await supabase.rpc('fn_reporte_flujo_efectivo', {
        p_organization_id: orgId,
        p_from: `${periodo.fechaInicio}T00:00:00Z`,
        p_to: `${periodo.fechaFin}T23:59:59Z`,
      });
      if (error) throw error;

      const d = data ?? {};

      return buildReportData(
        'flujo-efectivo', 'Flujo de Efectivo', 'finance', periodo,
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
    titulo: 'Impuestos (IVA/Retenciones)',
    descripcion: 'IVA generado, IVA descontable y retenciones del período',
    categoria: 'financiero',
    periodosSugeridos: ['mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data, error } = await supabase.rpc('fn_reporte_impuestos', {
        p_organization_id: orgId,
        p_from: `${periodo.fechaInicio}T00:00:00Z`,
        p_to: `${periodo.fechaFin}T23:59:59Z`,
      });
      if (error) throw error;

      const d = data ?? {};

      return buildReportData(
        'impuestos', 'Impuestos (IVA/Retenciones)', 'finance', periodo,
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
    id: 'liquidez',
    modulo: 'finance',
    titulo: 'Liquidez (Flujo Proyectado)',
    descripcion: 'Proyección de liquidez basada en CxC y CxP pendientes',
    categoria: 'financiero',
    periodosSugeridos: ['semanal'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data: cxc } = await supabase
        .from('accounts_receivable')
        .select('balance, due_date')
        .eq('organization_id', orgId)
        .not('status', 'in', '("paid","cancelled")');

      const { data: cxp } = await supabase
        .from('accounts_payable')
        .select('balance, due_date')
        .eq('organization_id', orgId)
        .not('status', 'in', '("paid","cancelled")');

      const totalCxC = (cxc ?? []).reduce((s: number, r: Record<string, unknown>) => s + Number(r.balance ?? 0), 0);
      const totalCxP = (cxp ?? []).reduce((s: number, r: Record<string, unknown>) => s + Number(r.balance ?? 0), 0);

      return buildReportData(
        'liquidez', 'Liquidez (Flujo Proyectado)', 'finance', periodo,
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
    titulo: 'Gastos Operativos',
    descripcion: 'Gastos por categoría y sucursal',
    categoria: 'financiero',
    periodosSugeridos: ['quincenal', 'mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data, error } = await supabase
        .from('journal_lines')
        .select('account_code, debit_base, credit_base, description, journal_entries!inner(entry_date, branch_id)')
        .eq('organization_id', orgId)
        .gte('journal_entries.entry_date', `${periodo.fechaInicio}T00:00:00Z`)
        .lte('journal_entries.entry_date', `${periodo.fechaFin}T23:59:59Z`);

      if (error) throw error;

      const lineas = data ?? [];
      const porCuenta: Record<string, number> = {};
      lineas.forEach((l: Record<string, unknown>) => {
        const code = String(l.account_code ?? '');
        porCuenta[code] = (porCuenta[code] ?? 0) + Number(l.debit_base ?? 0) - Number(l.credit_base ?? 0);
      });

      const filas = Object.entries(porCuenta)
        .filter(([, monto]) => monto > 0)
        .map(([cuenta, monto]) => ({ cuenta, monto }))
        .sort((a, b) => b.monto - a.monto);

      return buildReportData(
        'gastos-operativos', 'Gastos Operativos', 'finance', periodo,
        [
          { titulo: 'Total Gastos', valor: filas.reduce((s, f) => s + f.monto, 0), formato: 'moneda' },
          { titulo: 'Cuentas', valor: filas.length, formato: 'numero' },
        ],
        [
          { key: 'cuenta', titulo: 'Cuenta', tipo: 'texto' },
          { key: 'monto', titulo: 'Monto', tipo: 'moneda', alinear: 'right' },
        ],
        filas,
        { monto: filas.reduce((s, f) => s + f.monto, 0) },
      );
    },
  },
  {
    id: 'facturacion-electronica',
    modulo: 'finance',
    titulo: 'Facturación Electrónica',
    descripcion: 'Resumen de facturas electrónicas emitidas y estado DIAN',
    categoria: 'financiero',
    periodosSugeridos: ['mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data, error } = await supabase
        .from('invoice_sales')
        .select('id, issue_date, total, status, customer_id')
        .eq('organization_id', orgId)
        .gte('issue_date', `${periodo.fechaInicio}T00:00:00Z`)
        .lte('issue_date', `${periodo.fechaFin}T23:59:59Z`)
        .order('issue_date', { ascending: false });

      if (error) throw error;

      const facturas = data ?? [];
      const porEstado: Record<string, number> = {};
      facturas.forEach((f: Record<string, unknown>) => {
        const st = String(f.status ?? 'unknown');
        porEstado[st] = (porEstado[st] ?? 0) + 1;
      });

      const filas = Object.entries(porEstado).map(([estado, cantidad]) => ({ estado, cantidad }));

      return buildReportData(
        'facturacion-electronica', 'Facturación Electrónica', 'finance', periodo,
        [
          { titulo: 'Total Facturas', valor: facturas.length, formato: 'numero' },
          { titulo: 'Total Facturado', valor: facturas.reduce((s: number, f: Record<string, unknown>) => s + Number(f.total ?? 0), 0), formato: 'moneda' },
        ],
        [
          { key: 'estado', titulo: 'Estado', tipo: 'texto' },
          { key: 'cantidad', titulo: 'Cantidad', tipo: 'numero', alinear: 'right' },
        ],
        filas,
        { cantidad: facturas.length },
      );
    },
  },
  {
    id: 'rentabilidad-producto',
    modulo: 'finance',
    titulo: 'Rentabilidad por Producto',
    descripcion: 'Margen por producto: ingreso vs costo',
    categoria: 'financiero',
    periodosSugeridos: ['mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data, error } = await supabase.rpc('fn_reporte_rotacion_inventario', {
        p_organization_id: orgId,
        p_from: `${periodo.fechaInicio}T00:00:00Z`,
        p_to: `${periodo.fechaFin}T23:59:59Z`,
      });
      if (error) throw error;

      const d = data ?? {};
      const top = d.top_vendidos ?? [];

      return buildReportData(
        'rentabilidad-producto', 'Rentabilidad por Producto', 'finance', periodo,
        [
          { titulo: 'Total Vendido', valor: d.total_vendido ?? 0, formato: 'moneda' },
          { titulo: 'Productos', valor: d.num_productos_vendidos ?? 0, formato: 'numero' },
        ],
        [
          { key: 'nombre', titulo: 'Producto', tipo: 'texto' },
          { key: 'cantidad_vendida', titulo: 'Cantidad', tipo: 'numero', alinear: 'right' },
          { key: 'total_ventas', titulo: 'Ingresos', tipo: 'moneda', alinear: 'right' },
        ],
        top,
        { total_ventas: top.reduce((s: number, r: Record<string, unknown>) => s + Number(r.total_ventas ?? 0), 0) },
      );
    },
  },
  {
    id: 'rentabilidad-sucursal',
    modulo: 'finance',
    titulo: 'Rentabilidad por Sucursal',
    descripcion: 'Ingresos, costos y margen por sucursal',
    categoria: 'financiero',
    periodosSugeridos: ['mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data, error } = await supabase.rpc('fn_reporte_ventas_resumen', {
        p_organization_id: orgId,
        p_from: `${periodo.fechaInicio}T00:00:00Z`,
        p_to: `${periodo.fechaFin}T23:59:59Z`,
      });
      if (error) throw error;

      const d = data ?? {};
      const porSucursal = d.por_sucursal ?? [];

      return buildReportData(
        'rentabilidad-sucursal', 'Rentabilidad por Sucursal', 'finance', periodo,
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
];
