// ============================================================
// Reportes de Ventas (POS)
// Llama a las RPCs: fn_reporte_cierre_caja, fn_reporte_ventas_resumen,
// fn_reporte_ventas_por_hora, fn_reporte_ventas_personas,
// fn_reporte_mas_vendido, fn_reporte_items_vendidos y
// fn_reporte_ventas_canal_sede (ventas netas por canal y por sede).
// El armado de KPI, tabla y pestañas de los reportes ampliados (Figma
// «14 Reportes», 2733:51399) es puro y vive en `ventasVistas.ts`.
// ============================================================

import { supabase as browserSupabase } from '@/lib/supabase/config';
import type { OpcionesReporte, ReportesClient } from '../types';
// F0-SEC r3 (tester r2, fallo 3): `fetch` acepta el cliente de Supabase por
// parámetro. En el navegador (app/reportes) cae al cliente browser con la sesión
// del usuario; en el servidor (asistente de reportes) el route handler pasa el
// cliente de sesión de `getServerOrgContext()`, así que las RPC `fn_reporte_*`
// corren como `authenticated` miembro y nunca como `anon`.
import { applyBranchFilter, normalizeBranchParam } from '@/lib/services/branchFilterHelper';
import type { DefinicionModulo, ReportData, PeriodoCierre } from '../types';
import { rangoDelPeriodo } from '../rangoPeriodo';
import { PARAMETROS_VENTAS_POR_DEFECTO, parametrosRpcVentas } from '../filtrosVentas';
import { nombreDePerfil } from '../programados/programacion';
import {
  SIN_ASIGNAR,
  armarItemsVendidos,
  armarMasVendido,
  armarResumenPuntoVenta,
  armarVentasPorHora,
  armarVentasPorPersona,
  idsDeVentas,
  vistaDescuentosPersona,
  vistaProductosDescuento,
  type ArmadoReporte,
  type NombresVentas,
  type RespuestaItemsVendidos,
  type RespuestaMasVendido,
  type RespuestaVentasPersonas,
  type RespuestaVentasPorHora,
  type RespuestaVentasResumen,
} from './ventasVistas';
import { aRespuestaCanalSede, armarCanalSede } from './canalSedeVista';

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

/** ReportData de un armado de `ventasVistas.ts`. */
function conArmado(id: string, titulo: string, periodo: PeriodoCierre, a: ArmadoReporte): ReportData {
  return {
    ...buildReportData(id, titulo, 'pos', periodo, a.kpis, a.columnas, a.filas, a.totales),
    ...(a.vistaPrincipal ? { vistaPrincipal: a.vistaPrincipal } : {}),
    ...(a.vistas?.length ? { vistas: a.vistas } : {}),
    ...(a.lectura?.length ? { lectura: a.lectura } : {}),
  };
}

type FilaBD = Record<string, unknown>;

/** Filas de una consulta de nombres; un fallo deja los nombres por defecto (la cifra no depende de ellos). */
async function filasDe(q: PromiseLike<{ data: unknown }> | null): Promise<FilaBD[]> {
  if (!q) return [];
  const { data } = await q;
  return Array.isArray(data) ? (data as FilaBD[]) : [];
}

/**
 * Nombres de personas (`profiles`), su rol en la organización
 * (`organization_members` → `roles`), sedes (`branches`) y métodos de pago
 * (`payment_methods`), en paralelo y solo de los ids que trae la respuesta.
 */
async function resolverNombres(
  db: ReportesClient,
  orgId: number,
  ids: { personas: string[]; sedes: number[]; metodos: boolean },
): Promise<NombresVentas> {
  const [perfiles, miembros, sucursales, metodos] = await Promise.all([
    filasDe(ids.personas.length ? db.from('profiles').select('id, first_name, last_name, email').in('id', ids.personas) : null),
    filasDe(ids.personas.length ? db.from('organization_members').select('user_id, roles(name)').eq('organization_id', orgId).in('user_id', ids.personas) : null),
    filasDe(ids.sedes.length ? db.from('branches').select('id, name').in('id', ids.sedes) : null),
    filasDe(ids.metodos ? db.from('payment_methods').select('code, name') : null),
  ]);
  const persona = new Map(perfiles.map((p) => [String(p.id), nombreDePerfil(p as { first_name?: string | null; last_name?: string | null; email?: string | null }) ?? '—']));
  const rol = new Map(
    miembros.map((m) => {
      const r = Array.isArray(m.roles) ? m.roles[0] : m.roles;
      return [String(m.user_id), String((r as { name?: string | null } | null)?.name ?? '—')];
    }),
  );
  const sede = new Map(sucursales.map((b) => [Number(b.id), String(b.name ?? '—')]));
  const metodo = new Map(metodos.map((m) => [String(m.code), String(m.name ?? m.code)]));
  return {
    persona: (id) => (id ? (persona.get(id) ?? '—') : SIN_ASIGNAR),
    rol: (id) => (id ? (rol.get(id) ?? '—') : '—'),
    sede: (id) => (id === null || id === undefined || id === '' ? 'Sin sede' : (sede.get(Number(id)) ?? '—')),
    metodo: (codigo) => (codigo ? (metodo.get(codigo) ?? codigo) : 'Otro'),
  };
}

/** Líneas por consulta de «Ítems vendidos» y «Productos con descuento» (la RPC admite hasta 5000). */
const LIMITE_ITEMS = 2000;

export const ventasReports: DefinicionModulo[] = [
  {
    id: 'cierre-caja',
    modulo: 'pos',
    titulo: 'Cierre de caja (Zeta)',
    descripcion: 'Totales por método de pago, sesiones, descuentos y propinas del día',
    categoria: 'operativo',
    alcance: 'sucursal',
    periodosSugeridos: ['diario'],
    async fetch(orgId: number, periodo: PeriodoCierre, branchId?: number | null, client?: ReportesClient): Promise<ReportData> {
      const db = client ?? browserSupabase;
      const { start, end } = await rangoDelPeriodo(orgId, periodo, db);
      const { data, error } = await db.rpc('fn_reporte_cierre_caja', {
        p_organization_id: orgId,
        p_from: start,
        p_to: end,
        p_branch_id: normalizeBranchParam(branchId),
      });
      if (error) throw error;

      const d = data ?? {};
      const porMetodo: Record<string, unknown>[] = d.por_metodo ?? [];
      const sesiones: Record<string, unknown>[] = d.sesiones ?? [];

      const { data: metodosData } = await db
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
      const { data: sucursales } = await db
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
      const { data: perfiles } = await db
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
        'cierre-caja', 'Cierre de caja (Zeta)', 'pos', periodo,
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
    titulo: 'Resumen general del punto de venta',
    descripcion: 'Ventas por sede, persona, método de pago, descuentos y día',
    categoria: 'operativo',
    alcance: 'sucursal',
    periodosSugeridos: ['diario', 'semanal'],
    async fetch(orgId: number, periodo: PeriodoCierre, branchId?: number | null, client?: ReportesClient, opciones?: OpcionesReporte): Promise<ReportData> {
      const db = client ?? browserSupabase;
      const { start, end } = await rangoDelPeriodo(orgId, periodo, db);
      const filtros = parametrosRpcVentas(opciones);
      // La sede sale del resumen; persona, métodos, descuentos y día, de la RPC por persona (que sí filtra).
      const [resumenRes, personasRes] = await Promise.all([
        db.rpc('fn_reporte_ventas_resumen', { p_organization_id: orgId, p_from: start, p_to: end, p_branch_id: normalizeBranchParam(branchId) }),
        db.rpc('fn_reporte_ventas_personas', { p_organization_id: orgId, p_from: start, p_to: end, p_branch_id: normalizeBranchParam(branchId), ...filtros }),
      ]);
      if (resumenRes.error) throw resumenRes.error;
      if (personasRes.error) throw personasRes.error;
      const resumen = (resumenRes.data ?? {}) as RespuestaVentasResumen;
      const personas = (personasRes.data ?? {}) as RespuestaVentasPersonas;
      const nombres = await resolverNombres(db, orgId, idsDeVentas(resumen, personas));
      const filtrado = !!(filtros.p_persona || filtros.p_metodos);
      return conArmado(
        'ventas-periodo',
        'Resumen general del punto de venta',
        periodo,
        armarResumenPuntoVenta(resumen, personas, nombres, filtros.p_contar_por, filtrado),
      );
    },
  },
  {
    id: 'ventas-hora',
    modulo: 'pos',
    titulo: 'Ventas por hora',
    descripcion: 'Volumen de ventas por hora del día, por sede y lo más vendido de cada franja',
    categoria: 'operativo',
    alcance: 'sucursal',
    periodosSugeridos: ['semanal'],
    async fetch(orgId: number, periodo: PeriodoCierre, branchId?: number | null, client?: ReportesClient): Promise<ReportData> {
      const db = client ?? browserSupabase;
      const { start, end } = await rangoDelPeriodo(orgId, periodo, db);
      // La RPC por hora no filtra persona ni método: lo más vendido va con los valores por defecto.
      const [horaRes, masVendidoRes] = await Promise.all([
        db.rpc('fn_reporte_ventas_por_hora', { p_organization_id: orgId, p_from: start, p_to: end, p_branch_id: normalizeBranchParam(branchId) }),
        db.rpc('fn_reporte_mas_vendido', { p_organization_id: orgId, p_from: start, p_to: end, p_branch_id: normalizeBranchParam(branchId), ...PARAMETROS_VENTAS_POR_DEFECTO }),
      ]);
      if (horaRes.error) throw horaRes.error;
      if (masVendidoRes.error) throw masVendidoRes.error;
      const d = (horaRes.data ?? {}) as RespuestaVentasPorHora;
      const masVendido = (masVendidoRes.data ?? {}) as RespuestaMasVendido;
      const nombres = await resolverNombres(db, orgId, { ...idsDeVentas(d), metodos: false });
      return conArmado('ventas-hora', 'Ventas por hora', periodo, armarVentasPorHora(d, masVendido, nombres));
    },
  },
  {
    // Figma «24 Ventas» sección 7 (2026-11-24): la regla única de ventas netas
    // (`fn_ventas_netas_cifras`, la del Inicio y de Todas las ventas) por canal y
    // por sede. Las dos sumas dan el total (`canalSedeVista.ts`).
    id: 'ventas-canal-sede',
    modulo: 'pos',
    titulo: 'Ventas por canal y por sede',
    descripcion: 'Ventas netas (sin IVA ni INC, menos devoluciones, sin propinas) por canal y por sede; las dos suman el total',
    categoria: 'comercial',
    alcance: 'sucursal',
    periodosSugeridos: ['semanal', 'mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre, branchId?: number | null, client?: ReportesClient): Promise<ReportData> {
      const db = client ?? browserSupabase;
      const { start, end } = await rangoDelPeriodo(orgId, periodo, db);
      const { data, error } = await db.rpc('fn_reporte_ventas_canal_sede', {
        p_organization_id: orgId,
        p_from: start,
        p_to: end,
        p_branch_id: normalizeBranchParam(branchId),
      });
      if (error) throw error;
      return conArmado('ventas-canal-sede', 'Ventas por canal y por sede', periodo, armarCanalSede(aRespuestaCanalSede(data)));
    },
  },
  {
    id: 'ventas-vendedor',
    modulo: 'pos',
    titulo: 'Ventas por persona',
    descripcion: 'Cuánto vendió y cobró cada persona',
    categoria: 'comercial',
    alcance: 'sucursal',
    periodosSugeridos: ['semanal', 'mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre, branchId?: number | null, client?: ReportesClient, opciones?: OpcionesReporte): Promise<ReportData> {
      const db = client ?? browserSupabase;
      const { start, end } = await rangoDelPeriodo(orgId, periodo, db);
      const filtros = parametrosRpcVentas(opciones);
      const { data, error } = await db.rpc('fn_reporte_ventas_personas', { p_organization_id: orgId, p_from: start, p_to: end, p_branch_id: normalizeBranchParam(branchId), ...filtros });
      if (error) throw error;
      const d = (data ?? {}) as RespuestaVentasPersonas;
      const nombres = await resolverNombres(db, orgId, idsDeVentas(d));
      return conArmado('ventas-vendedor', 'Ventas por persona', periodo, armarVentasPorPersona(d, nombres, filtros.p_contar_por));
    },
  },
  {
    id: 'devoluciones-descuentos',
    modulo: 'pos',
    titulo: 'Devoluciones y descuentos',
    descripcion: 'Devoluciones, descuentos y propinas del periodo',
    categoria: 'operativo',
    alcance: 'sucursal',
    periodosSugeridos: ['semanal', 'mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre, branchId?: number | null, client?: ReportesClient, opciones?: OpcionesReporte): Promise<ReportData> {
      const db = client ?? browserSupabase;
      const { start: from, end: to } = await rangoDelPeriodo(orgId, periodo, db);
      const filtros = parametrosRpcVentas(opciones);

      let devolucionesQuery = db
        .from('returns')
        .select('id, sale_id, total_refund, reason, return_date, branch_id, status, reason_id, return_reasons(name)')
        .eq('organization_id', orgId)
        .gte('return_date', from)
        .lte('return_date', to)
        .order('return_date', { ascending: false });
      devolucionesQuery = applyBranchFilter(devolucionesQuery, branchId);

      let ventasQuery = db
        .from('sales')
        .select('id, sale_date, total, discount_total, tip_amount, branch_id')
        .eq('organization_id', orgId)
        .gte('sale_date', from)
        .lte('sale_date', to)
        .not('status', 'in', '("cancelled","void")');
      ventasQuery = applyBranchFilter(ventasQuery, branchId);

      const [
        { data: devolucionesData, error: errDev },
        { data: ventasData, error: errVentas },
        { data: itemsData, error: errItems },
      ] = await Promise.all([
        devolucionesQuery,
        ventasQuery,
        // Pestañas «Productos con descuento» y «Por persona»: líneas con descuento, con persona y método.
        db.rpc('fn_reporte_items_vendidos', {
          p_organization_id: orgId,
          p_from: from,
          p_to: to,
          p_branch_id: normalizeBranchParam(branchId),
          ...filtros,
          p_solo_descuento: true,
          p_limite: LIMITE_ITEMS,
        }),
      ]);

      if (errDev) throw errDev;
      if (errVentas) throw errVentas;
      if (errItems) throw errItems;
      const items = (itemsData ?? {}) as RespuestaItemsVendidos;
      const nombres = await resolverNombres(db, orgId, idsDeVentas(items));

      const devoluciones = devolucionesData ?? [];
      const ventas = ventasData ?? [];

      const branchIds = [...new Set([
        ...devoluciones.map((r: Record<string, unknown>) => Number(r.branch_id)).filter(Boolean),
        ...ventas.map((v: Record<string, unknown>) => Number(v.branch_id)).filter(Boolean),
      ])];

      const { data: sucursales } = await db
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

      const lectura: ReportData['lectura'] = [];
      if (filtros.p_persona || filtros.p_metodos) {
        lectura.push({ tono: 'info', texto: 'La pestaña «Movimientos» muestra todas las devoluciones, descuentos y propinas: no aplica los filtros de persona ni de método de pago. «Productos con descuento» y «Por persona» sí.' });
      }
      const lineasConDescuento = Number(items.totales?.lineas ?? 0);
      if (lineasConDescuento > (items.lineas?.length ?? 0)) {
        lectura.push({ tono: 'aviso', texto: `Hay ${lineasConDescuento} líneas con descuento; «Productos con descuento» muestra las últimas ${items.lineas?.length ?? 0}.` });
      }

      const base = buildReportData(
        'devoluciones-descuentos', 'Devoluciones y descuentos', 'pos', periodo,
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
      return {
        ...base,
        vistaPrincipal: 'Movimientos',
        vistas: [vistaProductosDescuento(items, nombres), vistaDescuentosPersona(items, nombres, filtros.p_contar_por)],
        ...(lectura.length ? { lectura } : {}),
      };
    },
  },
  {
    id: 'pedidos-online',
    modulo: 'pos',
    titulo: 'Pedidos online',
    descripcion: 'Pedidos web: estado, tiempo de entrega y conversión',
    categoria: 'operativo',
    alcance: 'sucursal',
    periodosSugeridos: ['semanal'],
    async fetch(orgId: number, periodo: PeriodoCierre, branchId?: number | null, client?: ReportesClient): Promise<ReportData> {
      const db = client ?? browserSupabase;
      const { start, end } = await rangoDelPeriodo(orgId, periodo, db);
      let query = db
        .from('web_orders')
        .select('id, order_number, status, source, total, subtotal, delivery_fee, tip_amount, discount_total, delivery_type, payment_method, payment_status, customer_name, customer_email, created_at, confirmed_at, delivered_at, cancelled_at, cancellation_reason')
        .eq('organization_id', orgId)
        .gte('created_at', start)
        .lte('created_at', end)
        .order('created_at', { ascending: false });
      query = applyBranchFilter(query, branchId);
      const { data, error } = await query;

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
      const entregados = pedidos.filter((p) => p.status === 'delivered').length;
      const cancelados = pedidos.filter((p) => p.status === 'cancelled').length;
      const tasaConversion = totalPedidos > 0 ? Math.round((entregados / totalPedidos) * 100) : 0;
      const tasaCancelacion = totalPedidos > 0 ? Math.round((cancelados / totalPedidos) * 100) : 0;
      const ticketPromedio = totalPedidos > 0 ? totalValor / totalPedidos : 0;

      return buildReportData(
        'pedidos-online', 'Pedidos online', 'pos', periodo,
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
  {
    id: 'mas-vendido',
    modulo: 'pos',
    titulo: 'Lo más vendido',
    descripcion: 'Productos que más ingreso dejaron, por hora y por sede',
    categoria: 'comercial',
    alcance: 'sucursal',
    periodosSugeridos: ['semanal', 'mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre, branchId?: number | null, client?: ReportesClient, opciones?: OpcionesReporte): Promise<ReportData> {
      const db = client ?? browserSupabase;
      const { start, end } = await rangoDelPeriodo(orgId, periodo, db);
      const filtros = parametrosRpcVentas(opciones);
      const { data, error } = await db.rpc('fn_reporte_mas_vendido', { p_organization_id: orgId, p_from: start, p_to: end, p_branch_id: normalizeBranchParam(branchId), ...filtros });
      if (error) throw error;
      const d = (data ?? {}) as RespuestaMasVendido;
      const nombres = await resolverNombres(db, orgId, idsDeVentas(d));
      return conArmado('mas-vendido', 'Lo más vendido', periodo, armarMasVendido(d, nombres));
    },
  },
  {
    id: 'items-vendidos',
    modulo: 'pos',
    titulo: 'Ítems vendidos',
    descripcion: 'Cada línea vendida con su factura, precio, descuento, impuesto y persona',
    categoria: 'operativo',
    alcance: 'sucursal',
    periodosSugeridos: ['diario', 'semanal'],
    async fetch(orgId: number, periodo: PeriodoCierre, branchId?: number | null, client?: ReportesClient, opciones?: OpcionesReporte): Promise<ReportData> {
      const db = client ?? browserSupabase;
      const { start, end } = await rangoDelPeriodo(orgId, periodo, db);
      const filtros = parametrosRpcVentas(opciones);
      const { data, error } = await db.rpc('fn_reporte_items_vendidos', {
        p_organization_id: orgId,
        p_from: start,
        p_to: end,
        p_branch_id: normalizeBranchParam(branchId),
        ...filtros,
        p_solo_descuento: false,
        p_limite: LIMITE_ITEMS,
      });
      if (error) throw error;
      const d = (data ?? {}) as RespuestaItemsVendidos;
      const nombres = await resolverNombres(db, orgId, idsDeVentas(d));
      return conArmado('items-vendidos', 'Ítems vendidos', periodo, armarItemsVendidos(d, nombres, filtros.p_contar_por));
    },
  },
];
