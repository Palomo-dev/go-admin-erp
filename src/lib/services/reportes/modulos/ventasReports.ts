// ============================================================
// Reportes de Ventas (POS)
// Llama a las RPCs: fn_reporte_cierre_caja, fn_reporte_ventas_resumen, fn_reporte_ventas_por_hora
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
  return {
    id,
    titulo,
    modulo,
    kpis,
    columnas,
    filas,
    totales,
    generadoEn: new Date().toISOString(),
    periodo,
  };
}

export const ventasReports: ReportDefinition[] = [
  {
    id: 'cierre-caja',
    modulo: 'pos',
    titulo: 'Cierre de Caja (Zeta)',
    descripcion: 'Totales por método de pago, sesiones, descuentos y propinas del día',
    categoria: 'operativo',
    periodosSugeridos: ['diario'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data, error } = await supabase.rpc('fn_reporte_cierre_caja', {
        p_organization_id: orgId,
        p_from: `${periodo.fechaInicio}T00:00:00Z`,
        p_to: `${periodo.fechaFin}T23:59:59Z`,
      });
      if (error) throw error;

      const d = data ?? {};
      const porMetodo: Record<string, unknown>[] = d.por_metodo ?? [];
      const sesiones: Record<string, unknown>[] = d.sesiones ?? [];

      const { data: metodosData } = await supabase
        .from('payment_methods')
        .select('code, name');

      const metodosMap: Record<string, string> = {};
      (metodosData ?? []).forEach((m: Record<string, unknown>) => {
        metodosMap[String(m.code)] = String(m.name);
      });

      const filasMetodo = porMetodo.map((m) => ({
        metodo: metodosMap[String(m.metodo ?? '')] ?? String(m.metodo ?? '—'),
        cantidad: m.cantidad,
        total: m.total,
      }));

      const totalTransacciones = filasMetodo.reduce((s: number, m: Record<string, unknown>) => s + Number(m.cantidad ?? 0), 0);
      const totalIngresos = filasMetodo.reduce((s: number, m: Record<string, unknown>) => s + Number(m.total ?? 0), 0);
      const sesionesCerradas = sesiones.filter((s) => s.status === 'closed').length;
      const sesionesAbiertas = sesiones.filter((s) => s.status === 'open').length;

      const branchIds = [...new Set(sesiones.map((s) => Number(s.sucursal_id)).filter(Boolean))];
      const { data: sucursales } = await supabase
        .from('branches')
        .select('id, name')
        .in('id', branchIds);

      const sucursalesMap: Record<number, string> = {};
      (sucursales ?? []).forEach((b: Record<string, unknown>) => {
        sucursalesMap[Number(b.id)] = String(b.name ?? '—');
      });

      const userIds = [...new Set(
        sesiones.flatMap((s) => [String(s.abierta_por ?? ''), String(s.cerrada_por ?? '')]).filter(Boolean)
      )];
      const { data: perfiles } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email')
        .in('id', userIds);

      const perfilesMap: Record<string, string> = {};
      (perfiles ?? []).forEach((p: Record<string, unknown>) => {
        const nombre = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim();
        perfilesMap[String(p.id)] = nombre || String(p.email ?? '—');
      });

      const estadoLabel: Record<string, string> = {
        open: 'Abierta',
        closed: 'Cerrada',
        suspended: 'Suspendida',
      };

      const filas = sesiones.map((s) => ({
        sucursal: sucursalesMap[Number(s.sucursal_id)] ?? '—',
        cajero: perfilesMap[String(s.abierta_por ?? '')] ?? '—',
        abierta_en: s.abierta_en,
        cerrada_en: s.cerrada_en,
        monto_inicial: s.monto_inicial,
        monto_final: s.monto_final,
        diferencia: s.diferencia,
        estado: estadoLabel[String(s.status ?? '')] ?? String(s.status ?? '—'),
      }));

      const totalDiferencia = filas.reduce((s: number, f: Record<string, unknown>) => s + Number(f.diferencia ?? 0), 0);
      const totalInicial = filas.reduce((s: number, f: Record<string, unknown>) => s + Number(f.monto_inicial ?? 0), 0);
      const totalFinal = filas.reduce((s: number, f: Record<string, unknown>) => s + Number(f.monto_final ?? 0), 0);

      const resumenMetodos = filasMetodo.map((m) => ({
        metodo: m.metodo,
        cantidad: m.cantidad,
        total: m.total,
      }));

      return buildReportData(
        'cierre-caja', 'Cierre de Caja (Zeta)', 'pos', periodo,
        [
          { titulo: 'Total Ventas', valor: d.total_ventas ?? 0, formato: 'moneda' },
          { titulo: 'Total Ingresos', valor: totalIngresos, formato: 'moneda' },
          { titulo: 'Transacciones', valor: totalTransacciones, formato: 'numero' },
          { titulo: 'Descuentos', valor: d.descuentos ?? 0, formato: 'moneda' },
          { titulo: 'Devoluciones', valor: d.devoluciones ?? 0, formato: 'moneda' },
          { titulo: 'Propinas', valor: d.propinas ?? 0, formato: 'moneda' },
          { titulo: 'Sesiones Cerradas', valor: sesionesCerradas, formato: 'numero' },
          { titulo: 'Sesiones Abiertas', valor: sesionesAbiertas, formato: 'numero' },
          { titulo: 'Diferencia', valor: d.esperado_vs_real?.diferencia ?? 0, formato: 'moneda' },
        ],
        [
          { key: 'sucursal', titulo: 'Sucursal', tipo: 'texto' },
          { key: 'cajero', titulo: 'Cajero', tipo: 'texto' },
          { key: 'abierta_en', titulo: 'Apertura', tipo: 'fecha' },
          { key: 'cerrada_en', titulo: 'Cierre', tipo: 'fecha' },
          { key: 'monto_inicial', titulo: 'Monto Inicial', tipo: 'moneda', alinear: 'right' },
          { key: 'monto_final', titulo: 'Monto Final', tipo: 'moneda', alinear: 'right' },
          { key: 'diferencia', titulo: 'Diferencia', tipo: 'moneda', alinear: 'right' },
          { key: 'estado', titulo: 'Estado', tipo: 'texto' },
        ],
        filas.length > 0 ? filas : resumenMetodos.length > 0 ? resumenMetodos : [],
        filas.length > 0
          ? { monto_inicial: totalInicial, monto_final: totalFinal, diferencia: totalDiferencia }
          : { cantidad: totalTransacciones, total: totalIngresos },
      );
    },
  },
  {
    id: 'ventas-periodo',
    modulo: 'pos',
    titulo: 'Ventas del Período',
    descripcion: 'Ventas por día, sucursal y vendedor',
    categoria: 'operativo',
    periodosSugeridos: ['diario', 'semanal'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data, error } = await supabase.rpc('fn_reporte_ventas_resumen', {
        p_organization_id: orgId,
        p_from: `${periodo.fechaInicio}T00:00:00Z`,
        p_to: `${periodo.fechaFin}T23:59:59Z`,
      });
      if (error) throw error;

      const d = data ?? {};
      const porDia: Record<string, unknown>[] = d.por_dia ?? [];
      const porSucursal: Record<string, unknown>[] = d.por_sucursal ?? [];
      const porVendedor: Record<string, unknown>[] = d.por_vendedor ?? [];

      const branchIds = [...new Set(porSucursal.map((s) => Number(s.sucursal_id)).filter(Boolean))];
      const { data: sucursales } = await supabase
        .from('branches')
        .select('id, name')
        .in('id', branchIds);

      const sucursalesMap: Record<number, string> = {};
      (sucursales ?? []).forEach((b: Record<string, unknown>) => {
        sucursalesMap[Number(b.id)] = String(b.name ?? '—');
      });

      const vendedorIds = porVendedor
        .map((v) => String(v.vendedor_id ?? ''))
        .filter(Boolean);
      const { data: perfiles } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email')
        .in('id', vendedorIds);

      const perfilesMap: Record<string, string> = {};
      (perfiles ?? []).forEach((p: Record<string, unknown>) => {
        const nombre = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim();
        perfilesMap[String(p.id)] = nombre || String(p.email ?? '—');
      });

      const filasSucursal = porSucursal.map((s) => ({
        sucursal: sucursalesMap[Number(s.sucursal_id)] ?? 'Sin sucursal',
        total: s.total,
        num_ventas: s.num_ventas,
        ticket_promedio: Number(s.num_ventas) > 0 ? Number(s.total) / Number(s.num_ventas) : 0,
      }));

      const filasVendedor = porVendedor.map((v) => ({
        vendedor: perfilesMap[String(v.vendedor_id ?? '')] ?? '—',
        total: v.total,
        num_ventas: v.num_ventas,
        ticket_promedio: Number(v.num_ventas) > 0 ? Number(v.total) / Number(v.num_ventas) : 0,
      }));

      const filasDia = porDia.map((dia) => ({
        fecha: dia.fecha,
        total: dia.total,
        num_ventas: dia.num_ventas,
        ticket_promedio: Number(dia.num_ventas) > 0 ? Number(dia.total) / Number(dia.num_ventas) : 0,
      }));

      const filas = filasSucursal.length > 0
        ? filasSucursal.sort((a, b) => Number(b.total) - Number(a.total))
        : filasDia;

      const totalVentas = Number(d.total_ventas ?? 0);
      const numVentas = Number(d.num_ventas ?? 0);
      const ticketPromedio = numVentas > 0 ? totalVentas / numVentas : 0;
      const ventasPorSucursal = filasSucursal.length;
      const ventasPorVendedor = filasVendedor.length;

      return buildReportData(
        'ventas-periodo', 'Ventas del Período', 'pos', periodo,
        [
          { titulo: 'Total Ventas', valor: totalVentas, formato: 'moneda' },
          { titulo: 'N° Ventas', valor: numVentas, formato: 'numero' },
          { titulo: 'Ticket Promedio', valor: ticketPromedio, formato: 'moneda' },
          { titulo: 'Sucursales Activas', valor: ventasPorSucursal, formato: 'numero' },
          { titulo: 'Vendedores Activos', valor: ventasPorVendedor, formato: 'numero' },
          { titulo: 'Ventas/Día', valor: filasDia.length > 0 ? Math.round(numVentas / filasDia.length) : 0, formato: 'numero' },
        ],
        filasSucursal.length > 0
          ? [
              { key: 'sucursal', titulo: 'Sucursal', tipo: 'texto' },
              { key: 'num_ventas', titulo: 'N° Ventas', tipo: 'numero', alinear: 'right' },
              { key: 'total', titulo: 'Total', tipo: 'moneda', alinear: 'right' },
              { key: 'ticket_promedio', titulo: 'Ticket Prom.', tipo: 'moneda', alinear: 'right' },
            ]
          : [
              { key: 'fecha', titulo: 'Fecha', tipo: 'fecha' },
              { key: 'num_ventas', titulo: 'N° Ventas', tipo: 'numero', alinear: 'right' },
              { key: 'total', titulo: 'Total', tipo: 'moneda', alinear: 'right' },
              { key: 'ticket_promedio', titulo: 'Ticket Prom.', tipo: 'moneda', alinear: 'right' },
            ],
        filas,
        { total: filas.reduce((s: number, r: Record<string, unknown>) => s + Number(r.total ?? 0), 0),
          num_ventas: filas.reduce((s: number, r: Record<string, unknown>) => s + Number(r.num_ventas ?? 0), 0) },
      );
    },
  },
  {
    id: 'ventas-hora',
    modulo: 'pos',
    titulo: 'Ventas por Hora',
    descripcion: 'Heatmap de volumen de ventas por hora del día',
    categoria: 'operativo',
    periodosSugeridos: ['semanal'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data, error } = await supabase.rpc('fn_reporte_ventas_por_hora', {
        p_organization_id: orgId,
        p_from: `${periodo.fechaInicio}T00:00:00Z`,
        p_to: `${periodo.fechaFin}T23:59:59Z`,
      });
      if (error) throw error;

      const d = data ?? {};
      const porHora: Record<string, unknown>[] = d.por_hora ?? [];

      const filas = porHora
        .map((h) => {
          const hora = Number(h.hora ?? 0);
          const total = Number(h.total ?? 0);
          const numVentas = Number(h.num_ventas ?? 0);
          return {
            hora,
            rango: `${String(hora).padStart(2, '0')}:00 - ${String(hora + 1).padStart(2, '0')}:00`,
            total,
            num_ventas: numVentas,
            ticket_promedio: numVentas > 0 ? total / numVentas : 0,
          };
        })
        .sort((a, b) => b.total - a.total);

      const totalVentas = filas.reduce((s, f) => s + f.total, 0);
      const totalTransacciones = filas.reduce((s, f) => s + f.num_ventas, 0);
      const horaPico = filas.length > 0 ? filas[0] : null;
      const ticketPromedio = totalTransacciones > 0 ? totalVentas / totalTransacciones : 0;

      return buildReportData(
        'ventas-hora', 'Ventas por Hora', 'pos', periodo,
        [
          { titulo: 'Hora Pico', valor: horaPico?.rango ?? '—' },
          { titulo: 'Total Ventas', valor: totalVentas, formato: 'moneda' },
          { titulo: 'Transacciones', valor: totalTransacciones, formato: 'numero' },
          { titulo: 'Ticket Promedio', valor: ticketPromedio, formato: 'moneda' },
          { titulo: 'Horas Activas', valor: filas.length, formato: 'numero' },
        ],
        [
          { key: 'rango', titulo: 'Horario', tipo: 'texto' },
          { key: 'num_ventas', titulo: 'N° Ventas', tipo: 'numero', alinear: 'right' },
          { key: 'total', titulo: 'Total', tipo: 'moneda', alinear: 'right' },
          { key: 'ticket_promedio', titulo: 'Ticket Prom.', tipo: 'moneda', alinear: 'right' },
        ],
        filas,
        { total: totalVentas, num_ventas: totalTransacciones },
      );
    },
  },
  {
    id: 'ventas-vendedor',
    modulo: 'pos',
    titulo: 'Ventas por Vendedor',
    descripcion: 'Ranking de vendedores por monto y número de ventas',
    categoria: 'comercial',
    periodosSugeridos: ['semanal', 'mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data, error } = await supabase.rpc('fn_reporte_ventas_resumen', {
        p_organization_id: orgId,
        p_from: `${periodo.fechaInicio}T00:00:00Z`,
        p_to: `${periodo.fechaFin}T23:59:59Z`,
      });
      if (error) throw error;

      const d = data ?? {};
      const porVendedor: Record<string, unknown>[] = d.por_vendedor ?? [];

      const vendedorIds = porVendedor
        .map((v) => String(v.vendedor_id ?? ''))
        .filter(Boolean);

      let nombresMap: Record<string, string> = {};
      if (vendedorIds.length) {
        const { data: perfiles } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, email')
          .in('id', vendedorIds);

        (perfiles ?? []).forEach((p: Record<string, unknown>) => {
          const nombre = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim();
          nombresMap[String(p.id)] = nombre || String(p.email ?? '—');
        });
      }

      const filas = porVendedor
        .map((v) => {
          const total = Number(v.total ?? 0);
          const numVentas = Number(v.num_ventas ?? 0);
          return {
            vendedor: nombresMap[String(v.vendedor_id ?? '')] ?? '—',
            total,
            num_ventas: numVentas,
            ticket_promedio: numVentas > 0 ? total / numVentas : 0,
          };
        })
        .sort((a, b) => b.total - a.total);

      const totalVentas = filas.reduce((s, f) => s + f.total, 0);
      const totalTransacciones = filas.reduce((s, f) => s + f.num_ventas, 0);
      const ticketPromedio = totalTransacciones > 0 ? totalVentas / totalTransacciones : 0;
      const topVendedor = filas.length > 0 ? filas[0].vendedor : '—';
      const topVendedorPct = totalVentas > 0 && filas.length > 0
        ? Math.round((filas[0].total / totalVentas) * 100)
        : 0;

      return buildReportData(
        'ventas-vendedor', 'Ventas por Vendedor', 'pos', periodo,
        [
          { titulo: 'Total Ventas', valor: totalVentas, formato: 'moneda' },
          { titulo: 'Vendedores Activos', valor: filas.length, formato: 'numero' },
          { titulo: 'Transacciones', valor: totalTransacciones, formato: 'numero' },
          { titulo: 'Ticket Promedio', valor: ticketPromedio, formato: 'moneda' },
          { titulo: 'Top Vendedor', valor: topVendedor },
          { titulo: '% Top Vendedor', valor: topVendedorPct, formato: 'porcentaje' },
        ],
        [
          { key: 'vendedor', titulo: 'Vendedor', tipo: 'texto' },
          { key: 'num_ventas', titulo: 'N° Ventas', tipo: 'numero', alinear: 'right' },
          { key: 'total', titulo: 'Total Vendido', tipo: 'moneda', alinear: 'right' },
          { key: 'ticket_promedio', titulo: 'Ticket Prom.', tipo: 'moneda', alinear: 'right' },
          { key: 'participacion', titulo: '% Particip.', tipo: 'porcentaje', alinear: 'right' },
        ],
        filas.map((f) => ({
          ...f,
          participacion: totalVentas > 0 ? Math.round((f.total / totalVentas) * 100) : 0,
        })),
        { total: totalVentas, num_ventas: totalTransacciones },
      );
    },
  },
  {
    id: 'devoluciones-descuentos',
    modulo: 'pos',
    titulo: 'Devoluciones y Descuentos',
    descripcion: 'Resumen de devoluciones y descuentos aplicados',
    categoria: 'operativo',
    periodosSugeridos: ['semanal', 'mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const from = `${periodo.fechaInicio}T00:00:00Z`;
      const to = `${periodo.fechaFin}T23:59:59Z`;

      const [
        { data: devolucionesData, error: errDev },
        { data: ventasData, error: errVentas },
      ] = await Promise.all([
        supabase
          .from('returns')
          .select('id, sale_id, total_refund, reason, return_date, branch_id, status, reason_id, return_reasons(name)')
          .eq('organization_id', orgId)
          .gte('return_date', from)
          .lte('return_date', to)
          .order('return_date', { ascending: false }),
        supabase
          .from('sales')
          .select('id, sale_date, total, discount_total, tip_amount, branch_id')
          .eq('organization_id', orgId)
          .gte('sale_date', from)
          .lte('sale_date', to)
          .not('status', 'in', '("cancelled","void")'),
      ]);

      if (errDev) throw errDev;
      if (errVentas) throw errVentas;

      const devoluciones = devolucionesData ?? [];
      const ventas = ventasData ?? [];

      const branchIds = [...new Set([
        ...devoluciones.map((r: Record<string, unknown>) => Number(r.branch_id)).filter(Boolean),
        ...ventas.map((v: Record<string, unknown>) => Number(v.branch_id)).filter(Boolean),
      ])];

      const { data: sucursales } = await supabase
        .from('branches')
        .select('id, name')
        .in('id', branchIds);

      const sucursalesMap: Record<number, string> = {};
      (sucursales ?? []).forEach((b: Record<string, unknown>) => {
        sucursalesMap[Number(b.id)] = String(b.name ?? '—');
      });

      const totalDevoluciones = devoluciones.reduce((s: number, r: Record<string, unknown>) => s + Number(r.total_refund ?? 0), 0);
      const totalDescuentos = ventas.reduce((s: number, v: Record<string, unknown>) => s + Number(v.discount_total ?? 0), 0);
      const totalPropinas = ventas.reduce((s: number, v: Record<string, unknown>) => s + Number(v.tip_amount ?? 0), 0);
      const numDevoluciones = devoluciones.length;
      const ventasConDescuento = ventas.filter((v: Record<string, unknown>) => Number(v.discount_total ?? 0) > 0).length;
      const ventasConPropina = ventas.filter((v: Record<string, unknown>) => Number(v.tip_amount ?? 0) > 0).length;
      const promedioDevolucion = numDevoluciones > 0 ? totalDevoluciones / numDevoluciones : 0;

      const filasDevoluciones = devoluciones.map((r: Record<string, unknown>) => {
        const rr = r.return_reasons as Record<string, unknown> | null;
        return {
          tipo: 'Devolución',
          fecha: r.return_date,
          sucursal: sucursalesMap[Number(r.branch_id)] ?? '—',
          motivo: rr?.name ?? r.reason ?? '—',
          monto: Number(r.total_refund ?? 0),
          estado: r.status === 'approved' ? 'Aprobada' : r.status === 'pending' ? 'Pendiente' : r.status === 'rejected' ? 'Rechazada' : String(r.status ?? '—'),
        };
      });

      const filasDescuentos = ventas
        .filter((v: Record<string, unknown>) => Number(v.discount_total ?? 0) > 0)
        .map((v: Record<string, unknown>) => ({
          tipo: 'Descuento',
          fecha: v.sale_date,
          sucursal: sucursalesMap[Number(v.branch_id)] ?? '—',
          motivo: 'Descuento aplicado',
          monto: Number(v.discount_total ?? 0),
          estado: '—',
        }));

      const filasPropinas = ventas
        .filter((v: Record<string, unknown>) => Number(v.tip_amount ?? 0) > 0)
        .map((v: Record<string, unknown>) => ({
          tipo: 'Propina',
          fecha: v.sale_date,
          sucursal: sucursalesMap[Number(v.branch_id)] ?? '—',
          motivo: 'Propina voluntaria',
          monto: Number(v.tip_amount ?? 0),
          estado: '—',
        }));

      const filas = [...filasDevoluciones, ...filasDescuentos, ...filasPropinas]
        .sort((a, b) => Number(b.monto) - Number(a.monto));

      return buildReportData(
        'devoluciones-descuentos', 'Devoluciones y Descuentos', 'pos', periodo,
        [
          { titulo: 'Total Descuentos', valor: totalDescuentos, formato: 'moneda' },
          { titulo: 'Total Devoluciones', valor: totalDevoluciones, formato: 'moneda' },
          { titulo: 'Total Propinas', valor: totalPropinas, formato: 'moneda' },
          { titulo: 'N° Devoluciones', valor: numDevoluciones, formato: 'numero' },
          { titulo: 'Prom. Devolución', valor: promedioDevolucion, formato: 'moneda' },
          { titulo: 'Ventas c/Descuento', valor: ventasConDescuento, formato: 'numero' },
          { titulo: 'Ventas c/Propina', valor: ventasConPropina, formato: 'numero' },
        ],
        [
          { key: 'tipo', titulo: 'Tipo', tipo: 'texto' },
          { key: 'fecha', titulo: 'Fecha', tipo: 'fecha' },
          { key: 'sucursal', titulo: 'Sucursal', tipo: 'texto' },
          { key: 'motivo', titulo: 'Motivo', tipo: 'texto' },
          { key: 'monto', titulo: 'Monto', tipo: 'moneda', alinear: 'right' },
          { key: 'estado', titulo: 'Estado', tipo: 'texto' },
        ],
        filas,
        { monto: totalDescuentos + totalDevoluciones + totalPropinas },
      );
    },
  },
  {
    id: 'pedidos-online',
    modulo: 'pos',
    titulo: 'Pedidos Online',
    descripcion: 'Pedidos web: estado, tiempo de entrega, conversión',
    categoria: 'operativo',
    periodosSugeridos: ['semanal'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data, error } = await supabase
        .from('web_orders')
        .select('id, order_number, status, source, total, subtotal, delivery_fee, tip_amount, discount_total, delivery_type, payment_method, payment_status, customer_name, customer_email, created_at, confirmed_at, delivered_at, cancelled_at, cancellation_reason')
        .eq('organization_id', orgId)
        .gte('created_at', `${periodo.fechaInicio}T00:00:00Z`)
        .lte('created_at', `${periodo.fechaFin}T23:59:59Z`)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const pedidos: Record<string, unknown>[] = data ?? [];

      const estadoLabel: Record<string, string> = {
        pending: 'Pendiente',
        confirmed: 'Confirmado',
        preparing: 'Preparando',
        ready: 'Listo',
        delivered: 'Entregado',
        cancelled: 'Cancelado',
        rejected: 'Rechazado',
      };

      const payStatusLabel: Record<string, string> = {
        pending: 'Pendiente',
        paid: 'Pagado',
        failed: 'Fallido',
        refunded: 'Reembolsado',
        partial: 'Parcial',
      };

      const deliveryLabel: Record<string, string> = {
        delivery: 'Domicilio',
        pickup: 'Recoger',
        dine_in: 'En sitio',
      };

      const sourceLabel: Record<string, string> = {
        web: 'Web',
        mobile: 'Móvil',
        whatsapp: 'WhatsApp',
        app: 'App',
      };

      const filas = pedidos.map((p) => ({
        pedido: p.order_number ?? '—',
        cliente: p.customer_name ?? p.customer_email ?? '—',
        fuente: sourceLabel[String(p.source ?? '')] ?? String(p.source ?? '—'),
        tipo_entrega: deliveryLabel[String(p.delivery_type ?? '')] ?? String(p.delivery_type ?? '—'),
        estado: estadoLabel[String(p.status ?? '')] ?? String(p.status ?? '—'),
        pago: payStatusLabel[String(p.payment_status ?? '')] ?? String(p.payment_status ?? '—'),
        metodo_pago: p.payment_method ?? '—',
        subtotal: Number(p.subtotal ?? 0),
        envio: Number(p.delivery_fee ?? 0),
        propina: Number(p.tip_amount ?? 0),
        descuento: Number(p.discount_total ?? 0),
        total: Number(p.total ?? 0),
        fecha: p.created_at,
      }));

      const totalPedidos = pedidos.length;
      const totalValor = filas.reduce((s, f) => s + f.total, 0);
      const totalEnvios = filas.reduce((s, f) => s + f.envio, 0);
      const totalPropinas = filas.reduce((s, f) => s + f.propina, 0);
      const totalDescuentos = filas.reduce((s, f) => s + f.descuento, 0);
      const entregados = pedidos.filter((p) => p.status === 'delivered').length;
      const cancelados = pedidos.filter((p) => p.status === 'cancelled').length;
      const tasaConversion = totalPedidos > 0 ? Math.round((entregados / totalPedidos) * 100) : 0;
      const tasaCancelacion = totalPedidos > 0 ? Math.round((cancelados / totalPedidos) * 100) : 0;
      const ticketPromedio = totalPedidos > 0 ? totalValor / totalPedidos : 0;

      return buildReportData(
        'pedidos-online', 'Pedidos Online', 'pos', periodo,
        [
          { titulo: 'Total Pedidos', valor: totalPedidos, formato: 'numero' },
          { titulo: 'Total Valor', valor: totalValor, formato: 'moneda' },
          { titulo: 'Ticket Promedio', valor: ticketPromedio, formato: 'moneda' },
          { titulo: 'Entregados', valor: entregados, formato: 'numero' },
          { titulo: 'Cancelados', valor: cancelados, formato: 'numero' },
          { titulo: '% Conversión', valor: tasaConversion, formato: 'porcentaje' },
          { titulo: '% Cancelación', valor: tasaCancelacion, formato: 'porcentaje' },
          { titulo: 'Total Envíos', valor: totalEnvios, formato: 'moneda' },
          { titulo: 'Total Propinas', valor: totalPropinas, formato: 'moneda' },
        ],
        [
          { key: 'pedido', titulo: 'Pedido', tipo: 'texto' },
          { key: 'cliente', titulo: 'Cliente', tipo: 'texto' },
          { key: 'fuente', titulo: 'Origen', tipo: 'texto' },
          { key: 'tipo_entrega', titulo: 'Entrega', tipo: 'texto' },
          { key: 'estado', titulo: 'Estado', tipo: 'texto' },
          { key: 'pago', titulo: 'Estado Pago', tipo: 'texto' },
          { key: 'total', titulo: 'Total', tipo: 'moneda', alinear: 'right' },
          { key: 'fecha', titulo: 'Fecha', tipo: 'fecha' },
        ],
        filas,
        { total: totalValor },
      );
    },
  },
];
