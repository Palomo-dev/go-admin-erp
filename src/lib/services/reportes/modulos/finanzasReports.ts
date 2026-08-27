// ============================================================
// Reportes de Finanzas
// Llama a las RPCs: fn_reporte_cxc_aging, fn_reporte_cxp_aging, fn_reporte_flujo_efectivo, fn_reporte_impuestos
// ============================================================

import { supabase } from '@/lib/supabase/config';
import { getOrgDateRange } from '@/lib/utils/timezone';
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
        .select('id, customer_id, invoice_id, amount, balance, due_date, days_overdue, status, branch_id, discount_amount, created_at, customers(first_name, last_name, customer_type, company_name)')
        .eq('organization_id', orgId)
        .not('status', 'in', '("paid","cancelled")')
        .gt('days_overdue', 0)
        .order('days_overdue', { ascending: false });

      if (error) throw error;

      const rawData = data ?? [];

      const branchIds = [...new Set(rawData.map((r: Record<string, unknown>) => Number(r.branch_id)).filter(Boolean))];
      const { data: sucursales } = await supabase
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
        'cxc-vencidas', 'Cuentas por Cobrar Vencidas', 'finance', periodo,
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

      const { data: detalleData, error: errDetalle } = await supabase
        .from('accounts_receivable')
        .select('id, customer_id, amount, balance, due_date, days_overdue, status, customers(first_name, last_name, customer_type, company_name)')
        .eq('organization_id', orgId)
        .not('status', 'in', '("paid","cancelled")')
        .order('days_overdue', { ascending: false });

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
        'cxc-aging', 'CxC — Edades de Saldo', 'finance', periodo,
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

      const { data: detalleData, error: errDetalle } = await supabase
        .from('accounts_payable')
        .select('id, supplier_id, invoice_id, amount, balance, due_date, days_overdue, status, branch_id, suppliers(name)')
        .eq('organization_id', orgId)
        .not('status', 'in', '("paid","cancelled")')
        .order('days_overdue', { ascending: false });

      if (errDetalle) throw errDetalle;

      const rawData = detalleData ?? [];

      const branchIds = [...new Set(rawData.map((r: Record<string, unknown>) => Number(r.branch_id)).filter(Boolean))];
      const { data: sucursales } = await supabase
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
        'cxp-aging', 'CxP — Edades de Saldo', 'finance', periodo,
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
    titulo: 'Flujo de Efectivo',
    descripcion: 'Flujo operativo, inversión y financiación del período',
    categoria: 'financiero',
    periodosSugeridos: ['mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const overrideHours = (periodo.horaInicio && periodo.horaFin)
        ? { start_time: periodo.horaInicio, end_time: periodo.horaFin }
        : null;
      const { start, end } = await getOrgDateRange(orgId, periodo.fechaInicio, periodo.fechaFin, overrideHours);
      const { data, error } = await supabase.rpc('fn_reporte_flujo_efectivo', {
        p_organization_id: orgId,
        p_from: start,
        p_to: end,
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
      const overrideHours = (periodo.horaInicio && periodo.horaFin)
        ? { start_time: periodo.horaInicio, end_time: periodo.horaFin }
        : null;
      const { start, end } = await getOrgDateRange(orgId, periodo.fechaInicio, periodo.fechaFin, overrideHours);
      const { data, error } = await supabase.rpc('fn_reporte_impuestos', {
        p_organization_id: orgId,
        p_from: start,
        p_to: end,
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
      const overrideHours = (periodo.horaInicio && periodo.horaFin)
        ? { start_time: periodo.horaInicio, end_time: periodo.horaFin }
        : null;
      const { start, end } = await getOrgDateRange(orgId, periodo.fechaInicio, periodo.fechaFin, overrideHours);
      const { data, error } = await supabase
        .from('journal_lines')
        .select('account_code, debit_base, credit_base, description, journal_entries!inner(entry_date, branch_id)')
        .eq('organization_id', orgId)
        .gte('journal_entries.entry_date', start)
        .lte('journal_entries.entry_date', end);

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
      const overrideHours = (periodo.horaInicio && periodo.horaFin)
        ? { start_time: periodo.horaInicio, end_time: periodo.horaFin }
        : null;
      const { start, end } = await getOrgDateRange(orgId, periodo.fechaInicio, periodo.fechaFin, overrideHours);
      const { data, error } = await supabase
        .from('invoice_sales')
        .select('id, subtotal, tax_total, total, balance, status, document_type, issue_date')
        .eq('organization_id', orgId)
        .gte('issue_date', start)
        .lte('issue_date', end)
        .order('issue_date', { ascending: false });

      if (error) throw error;

      const rawData = (data ?? []).map((f) => ({
        ...f,
        document_type: f.document_type ?? 'invoice',
      })) as Record<string, unknown>[];

      const invoiceIds = rawData.map((f) => f.id);
      const { data: jobsData } = await supabase
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
        'facturacion-electronica', 'Facturación Electrónica', 'finance', periodo,
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
    titulo: 'Rentabilidad por Producto',
    descripcion: 'Margen por producto: ingreso vs costo',
    categoria: 'financiero',
    periodosSugeridos: ['mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const overrideHours = (periodo.horaInicio && periodo.horaFin)
        ? { start_time: periodo.horaInicio, end_time: periodo.horaFin }
        : null;
      const { start, end } = await getOrgDateRange(orgId, periodo.fechaInicio, periodo.fechaFin, overrideHours);
      const { data, error } = await supabase.rpc('fn_reporte_rotacion_inventario', {
        p_organization_id: orgId,
        p_from: start,
        p_to: end,
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
      const overrideHours = (periodo.horaInicio && periodo.horaFin)
        ? { start_time: periodo.horaInicio, end_time: periodo.horaFin }
        : null;
      const { start, end } = await getOrgDateRange(orgId, periodo.fechaInicio, periodo.fechaFin, overrideHours);
      const { data, error } = await supabase.rpc('fn_reporte_ventas_resumen', {
        p_organization_id: orgId,
        p_from: start,
        p_to: end,
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
