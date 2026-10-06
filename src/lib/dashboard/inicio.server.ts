/**
 * Lecturas del inicio en el servidor (tanda 2, aprobada por el dueño el
 * 2026-09-30): ventas del periodo por canal, tienda web, resumen por módulo,
 * preferencias por usuario y «Tu turno».
 *
 * Todo con el cliente de la SESIÓN (`ctx.supabase`, RLS) y la organización del
 * contexto: nunca de la petición. Las RPC son SECURITY DEFINER con
 * `fn_assert_acceso_org`, sucursal validada y permiso resuelto en la base; un
 * 42501 se traduce a 403 y un 22023 a 400.
 *
 * Sin lógica de negocio nueva en Node: las cifras las calculan
 * `fn_inicio_ventas_periodo` (→ `fn_inicio_ventas_rango`, la regla única de
 * ventas), `fn_inicio_tienda_web` y `fn_inicio_modulos_resumen` (que reutiliza
 * `fn_cxc_listado` y `fn_stock_listado`); aquí solo se decide el rango
 * (`calcularRangoPeriodo`, la misma regla que el navegador) y qué módulos ve
 * la persona (`seccionesVisiblesServidor`, la misma que el menú).
 */
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { zonaHorariaEnServidor } from '@/lib/utils/zonaHorariaServidor';
import { getOperatingHours } from '@/lib/services/organizationOperatingHoursService';
import { moduleManagementService } from '@/lib/services/moduleManagementService';
import { getOperatingToday } from '@/lib/utils/dateRanges';
import { addPlainDays, plainDateToInstant, todayInTz } from '@/lib/utils/dateCore';
import { seccionesVisiblesServidor } from '@/lib/navigation/navegacionServidor';
import { RUTA_ANALITICA_SITIO_WEB } from '@/components/sitio-web/rutasSitioWeb';
import { calcularRangoPeriodo, type PeriodoPedido, type RangoPeriodo } from './periodo';
import { badgeSolido, resumirModulo, type CrudoResumen, type ResumenModulo } from './resumenModulos';
import { desdeFila, ordenarModulos, type PreferenciasInicio } from './preferenciasInicio';
import { calcularTurno, type TurnoCalculado } from './turno';
import { ErrorInicio } from './errorInicio';
import { leerActividad, type Actividad, type PedidoActividad } from './actividadInicio';
import { armarPrimerosPasos, type PrimerosPasos } from './primerosPasos';

type Ctx = Pick<ServerOrgContext, 'organizationId' | 'userId' | 'supabase' | 'memberId'>;

export { ErrorInicio };

function errorRpc(etiqueta: string, error: { code?: string; message?: string }): ErrorInicio {
  if (error.code === '42501') return new ErrorInicio(403, 'sin_permiso', 'Sin permiso');
  if (error.code === '22023') return new ErrorInicio(400, 'pedido_invalido', error.message ?? 'Pedido inválido');
  return new ErrorInicio(500, 'lectura_fallida', `${etiqueta}: ${error.message ?? 'error'}`);
}

// ─── Periodo ────────────────────────────────────────────────────────────────

/**
 * Rango del periodo en la zona de la regla única (sucursal elegida si tiene
 * zona propia; si no, la organización: `zonaHorariaEnServidor` →
 * `fn_timezone_for`), la misma que usan los KPIs en el navegador.
 */
export async function rangoDelPeriodo(ctx: Ctx, pedido: PeriodoPedido, sucursal: number | null = null, ahora: Date = new Date()): Promise<RangoPeriodo> {
  const [zona, horasOrg] = await Promise.all([
    zonaHorariaEnServidor(ctx, sucursal),
    getOperatingHours(ctx.organizationId, ctx.supabase),
  ]);
  return calcularRangoPeriodo({
    periodo: pedido.periodo,
    hoyOperativo: getOperatingToday(zona, horasOrg),
    zona,
    horasOrg,
    horas: pedido.horas,
    fechas: pedido.fechas,
    ahora,
  });
}

function argsRango(ctx: Ctx, r: RangoPeriodo, sucursal: number | null) {
  return {
    p_organization_id: ctx.organizationId,
    p_desde: r.inicio,
    p_hasta: r.fin,
    p_desde_anterior: r.inicioAnterior,
    p_hasta_anterior: r.finAnterior,
    p_branch_id: sucursal,
  };
}

/** ¿La persona ve esta página en su menú? (las secciones las resuelve el servidor). */
function paginaVisible(secciones: Awaited<ReturnType<typeof seccionesVisiblesServidor>>, href: string): boolean {
  return secciones.some((s) => s.modulos.some((m) => m.paginas.some((p) => p.href === href)));
}

// ─── Ventas del periodo ─────────────────────────────────────────────────────

export interface CifrasVentasPeriodo {
  cobrado: number;
  reintegros: number;
  neto: number;
  num_cobros: number;
  ventas_cobradas: number;
  ticket_promedio?: number;
  por_canal?: Record<string, number>;
  por_sucursal?: Record<string, number>;
  /**
   * Neto por hora o por día LOCAL del periodo (`fn_inicio_ventas_rango`,
   * migración 20260930230100): la gráfica de la tarjeta y del detalle.
   */
  granularidad?: 'hora' | 'dia';
  serie?: Array<{ b: string; v: number }>;
}

export interface VentasPeriodo {
  desde: string;
  hasta: string;
  moneda_base: string;
  monedas: string[];
  actual: CifrasVentasPeriodo;
  anterior: CifrasVentasPeriodo;
  /** Nombres de las sucursales del desglose «Todas» (id → nombre). */
  sucursales: Record<string, string>;
  /** «Ver ventas» del detalle, solo si la persona ve esa página del menú. */
  hrefVentas: string | null;
}

const PAGINA_VENTAS = '/app/pos/ventas';

export async function ventasDelPeriodo(ctx: Ctx, rango: RangoPeriodo, sucursal: number | null): Promise<VentasPeriodo> {
  const [res, secciones] = await Promise.all([
    ctx.supabase.rpc('fn_inicio_ventas_periodo', argsRango(ctx, rango, sucursal)),
    seccionesVisiblesServidor(ctx).catch(() => []),
  ]);
  if (res.error) throw errorRpc('fn_inicio_ventas_periodo', res.error);
  const r = res.data as Omit<VentasPeriodo, 'sucursales' | 'hrefVentas'>;
  const ids = Object.keys(r.actual?.por_sucursal ?? {}).map(Number).filter((n) => Number.isInteger(n));
  let sucursales: Record<string, string> = {};
  if (ids.length > 0) {
    const nombres = await ctx.supabase.from('branches').select('id, name').eq('organization_id', ctx.organizationId).in('id', ids);
    if (!nombres.error) sucursales = Object.fromEntries((nombres.data ?? []).map((b: { id: number; name: string }) => [String(b.id), b.name]));
  }
  return {
    ...r,
    monedas: Array.isArray(r.monedas) ? r.monedas : [],
    sucursales,
    hrefVentas: paginaVisible(secciones, PAGINA_VENTAS) ? PAGINA_VENTAS : null,
  };
}

// ─── Tienda web ─────────────────────────────────────────────────────────────

export interface TiendaWeb {
  activa: boolean;
  actual?: { visitantes: number; sesiones: number; sesiones_nuevas: number; pedidos: number; pedidos_pagados: number };
  anterior?: { visitantes: number; sesiones: number; pedidos: number; pedidos_pagados: number };
  pendientes?: number;
  /** De los pendientes, los que expiran en 30 min y antes de acabar el día. */
  por_expirar?: number;
  expiran_hoy?: number;
  /** Miniaturas: visitantes, pedidos y pagados por hora o día LOCAL del periodo. */
  granularidad?: 'hora' | 'dia';
  serie?: Array<{ b: string; visitantes: number; pedidos: number; pagados: number }>;
  /** Enlace a los pedidos online, solo si la persona ve esa página en el menú. */
  hrefPedidos: string | null;
  /**
   * «Ver analítica web»: la página «Analítica» del módulo Sitio web
   * (`/app/sitio-web/analitica`), solo si la persona la ve en su menú. El dato
   * lo sigue protegiendo `GET /api/analitica-web` (panel completo).
   */
  hrefAnalitica: string | null;
}

/** Página del menú donde viven los pedidos de la tienda (se busca en el catálogo visible). */
const PAGINA_PEDIDOS_ONLINE = '/app/pos/pedidos-online';
const PAGINA_ANALITICA_WEB = RUTA_ANALITICA_SITIO_WEB;

export async function tiendaWeb(ctx: Ctx, rango: RangoPeriodo, sucursal: number | null): Promise<TiendaWeb> {
  const [res, secciones] = await Promise.all([
    ctx.supabase.rpc('fn_inicio_tienda_web', argsRango(ctx, rango, sucursal)),
    seccionesVisiblesServidor(ctx).catch(() => []),
  ]);
  if (res.error) throw errorRpc('fn_inicio_tienda_web', res.error);
  const visible = paginaVisible(secciones, PAGINA_PEDIDOS_ONLINE);
  const analitica = paginaVisible(secciones, PAGINA_ANALITICA_WEB);
  return {
    ...(res.data as Omit<TiendaWeb, 'hrefPedidos' | 'hrefAnalitica'>),
    hrefPedidos: visible ? PAGINA_PEDIDOS_ONLINE : null,
    hrefAnalitica: analitica ? PAGINA_ANALITICA_WEB : null,
  };
}

// ─── Actividad reciente ─────────────────────────────────────────────────────

/**
 * «Actividad reciente» del periodo y la sucursal: `fn_inicio_actividad`
 * decide en la base qué tipos ve la persona (módulo activo + permiso) y
 * devuelve el conteo por tipo y una página.
 */
export async function actividadDelInicio(ctx: Ctx, rango: RangoPeriodo, sucursal: number | null, pedido: PedidoActividad): Promise<Actividad> {
  const { data, error } = await ctx.supabase.rpc('fn_inicio_actividad', {
    p_organization_id: ctx.organizationId,
    p_desde: rango.inicio,
    p_hasta: rango.fin,
    p_branch_id: sucursal,
    p_tipo: pedido.tipo,
    p_limite: pedido.tamano,
    p_offset: (pedido.pagina - 1) * pedido.tamano,
  });
  if (error) throw errorRpc('fn_inicio_actividad', error);
  return leerActividad(data);
}

// ─── Primeros pasos ─────────────────────────────────────────────────────────

/** Módulos de base, activos en todas las organizaciones: no cuentan como «activar módulos». */
const MODULOS_BASE = ['clientes', 'organizations', 'roles', 'configuracion'];

/**
 * «Primeros pasos» y «Todavía no hay movimientos» (Figma 445:137617): los
 * conteos del antiguo onboarding del navegador, ahora en el servidor con el
 * cliente de la sesión (RLS) y la organización del contexto. Cada conteo es
 * `head` o `limit 1`: nada de traer filas.
 */
export async function primerosPasos(ctx: Ctx): Promise<PrimerosPasos> {
  const org = ctx.organizationId;
  const db = ctx.supabase;
  const contar = async (q: PromiseLike<{ count: number | null; error: { message?: string; code?: string } | null }>, etiqueta: string) => {
    const r = await q;
    if (r.error) throw errorRpc(etiqueta, r.error);
    return r.count ?? 0;
  };
  const alguno = async (tabla: string) => {
    const r = await db.from(tabla).select('id').eq('organization_id', org).limit(1);
    if (r.error) throw errorRpc(tabla, r.error);
    return (r.data ?? []).length > 0;
  };
  const [modulos, sucursales, miembros, productos, impuestos, clientes, movimientos, secciones] = await Promise.all([
    contar(
      db.from('organization_modules').select('id', { count: 'exact', head: true }).eq('organization_id', org).eq('is_active', true)
        .not('module_code', 'in', `(${MODULOS_BASE.join(',')})`),
      'organization_modules',
    ),
    contar(db.from('branches').select('id', { count: 'exact', head: true }).eq('organization_id', org), 'branches'),
    contar(db.from('organization_members').select('id', { count: 'exact', head: true }).eq('organization_id', org).eq('is_active', true), 'organization_members'),
    contar(db.from('products').select('id', { count: 'exact', head: true }).eq('organization_id', org).eq('status', 'active'), 'products'),
    contar(db.from('organization_taxes').select('id', { count: 'exact', head: true }).eq('organization_id', org), 'organization_taxes'),
    contar(db.from('customers').select('id', { count: 'exact', head: true }).eq('organization_id', org), 'customers'),
    Promise.all(['sales', 'invoice_sales', 'stock_movements', 'reservations'].map(alguno)).then((r) => r.some(Boolean)),
    seccionesVisiblesServidor(ctx).catch(() => []),
  ]);
  return armarPrimerosPasos(
    { modulos, sucursales, miembros, productos, impuestos, clientes },
    movimientos,
    (href) => paginaVisible(secciones, href),
  );
}

// ─── Preferencias ───────────────────────────────────────────────────────────

export async function leerPreferencias(ctx: Ctx): Promise<PreferenciasInicio> {
  const { data, error } = await ctx.supabase
    .from('user_dashboard_preferences')
    .select('bloques_ocultos, modulos_orden, modulos_ocultos')
    .eq('organization_id', ctx.organizationId)
    .eq('user_id', ctx.userId)
    .maybeSingle();
  if (error) throw errorRpc('user_dashboard_preferences', error);
  return desdeFila(data);
}

export async function guardarPreferencias(ctx: Ctx, p: PreferenciasInicio): Promise<PreferenciasInicio> {
  const { data, error } = await ctx.supabase
    .from('user_dashboard_preferences')
    .upsert(
      {
        user_id: ctx.userId,
        organization_id: ctx.organizationId,
        bloques_ocultos: p.bloquesOcultos,
        modulos_orden: p.modulosOrden,
        modulos_ocultos: p.modulosOcultos,
      },
      { onConflict: 'user_id,organization_id' },
    )
    .select('bloques_ocultos, modulos_orden, modulos_ocultos')
    .single();
  if (error) throw errorRpc('user_dashboard_preferences', error);
  return desdeFila(data);
}

// ─── Módulos ────────────────────────────────────────────────────────────────

export interface ModuloInicio {
  codigo: string;
  /** `ModuloNav.id` del catálogo (icono y nombre `nav.<etiqueta>` en el cliente). */
  idNav: string;
  etiqueta: string;
  /** «Ver módulo»: su primera página visible en el menú. */
  href: string;
  oculto: boolean;
  resumen: ResumenModulo | null;
}

export interface ModulosInicio {
  modulos: ModuloInicio[];
  /** Código del único badge sólido de la lista (el más grave). */
  badgeSolido: string | null;
  moneda: string;
  zona: string;
  calculadoEn: string;
}

/** Módulos del menú visibles para la persona, con su enlace (sin «Inicio»). */
export async function modulosVisibles(ctx: Ctx): Promise<Array<{ codigo: string; idNav: string; etiqueta: string; href: string }>> {
  const secciones = await seccionesVisiblesServidor(ctx);
  return secciones.flatMap((s) =>
    s.modulos
      .filter((m) => m.modulo.codigo !== null)
      .map((m) => ({ codigo: m.modulo.codigo as string, idNav: m.modulo.id, etiqueta: m.modulo.etiqueta, href: m.href })),
  );
}

/**
 * Filas de «Módulos»: los módulos que el menú le muestra a la persona Y para
 * los que la base devolvió resumen (activos + permiso de lectura). Los
 * ocultos por preferencia NO se consultan (`p_omitir`: «al ocultar un módulo
 * dejan de lanzarse sus consultas») y se listan con `oculto: true` para el
 * modo «Reordenar y ocultar».
 */
export async function modulosDelInicio(
  ctx: Ctx,
  rango: RangoPeriodo,
  sucursal: number | null,
  prefs: PreferenciasInicio,
): Promise<ModulosInicio> {
  const visibles = await modulosVisibles(ctx);
  const codigos = visibles.map((v) => v.codigo);
  const ocultos = prefs.modulosOcultos.filter((c) => codigos.includes(c));

  const principal = await ctx.supabase.rpc('fn_inicio_modulos_resumen', { ...argsRango(ctx, rango, sucursal), p_omitir: ocultos });
  if (principal.error) throw errorRpc('fn_inicio_modulos_resumen', principal.error);
  const crudo = principal.data as CrudoResumen;

  const porCodigo = new Map((crudo.modulos ?? []).map((m) => [m.codigo, m]));
  const filas: ModuloInicio[] = [];
  for (const v of visibles) {
    const m = porCodigo.get(v.codigo);
    if (m) {
      const resumen = resumirModulo(m, crudo.moneda);
      if (resumen) filas.push({ ...v, oculto: false, resumen });
    } else if (ocultos.includes(v.codigo)) {
      // Oculto por la persona: no se consulta; se lista para poder volver a
      // mostrarlo. Solo pudo ocultarlo desde esta misma lista, así que es un
      // módulo con resumen (si perdió el permiso, al mostrarlo desaparece).
      filas.push({ ...v, oculto: true, resumen: null });
    }
  }
  const ordenadas = ordenarModulos(filas, prefs.modulosOrden);
  return {
    modulos: ordenadas,
    badgeSolido: badgeSolido(ordenadas.filter((f) => !f.oculto && f.resumen).map((f) => f.resumen as ResumenModulo)),
    moneda: crudo.moneda,
    zona: crudo.zona,
    calculadoEn: crudo.calculado_en,
  };
}

// ─── Tu turno ───────────────────────────────────────────────────────────────

export interface TurnoInicio extends TurnoCalculado {
  visible: boolean;
  sucursal: string | null;
  /** Flujo de marcación existente de HRM (escáner QR a pantalla completa). */
  hrefMarcar: string;
  /** Historial propio en HRM › Marcación, solo si la persona ve esa página. */
  hrefMarcaciones: string | null;
}

/** Entrada del flujo de marcación existente (`src/app/marcar`), fuera del menú. */
export const RUTA_MARCAR = '/marcar';
const PAGINA_MARCACIONES = '/app/hrm/marcacion';

const TURNO_OCULTO: TurnoInicio = {
  visible: false,
  estado: 'sinTurno',
  entradaProgramada: null,
  salidaProgramada: null,
  entradaMarcada: null,
  salidaMarcada: null,
  minutos: 0,
  sucursal: null,
  hrefMarcar: RUTA_MARCAR,
  hrefMarcaciones: null,
};

type Rel<T> = T | T[] | null;
const uno = <T,>(v: Rel<T>): T | null => (Array.isArray(v) ? v[0] ?? null : v);

/**
 * Estado de «Tu turno» de la persona de la sesión. Solo se muestra a quien
 * tiene el módulo HRM activo y un contrato activo en esta organización (el
 * mismo requisito que el flujo de marcación `/marcar`). Sin contrato —el dueño
 * o el administrador que no marca— no hay tarjeta ni botón (Figma, frames 5 y
 * 10).
 */
export async function turnoDeHoy(ctx: Ctx, ahora: Date = new Date()): Promise<TurnoInicio> {
  if (!ctx.memberId) return TURNO_OCULTO;
  const modulos = await moduleManagementService.getActiveModules(ctx.organizationId, ctx.supabase);
  if (!modulos.some((m) => m.code === 'hrm')) return TURNO_OCULTO;

  const emp = await ctx.supabase
    .from('employments')
    .select('id, branch_id, branches(name)')
    .eq('organization_member_id', ctx.memberId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (emp.error) throw errorRpc('employments', emp.error);
  if (!emp.data) return TURNO_OCULTO;
  const empleo = emp.data as { id: string; branch_id: number | null; branches: Rel<{ name: string }> };
  // Horas del turno en la zona de la sucursal del contrato (regla única).
  const zona = await zonaHorariaEnServidor(ctx, empleo.branch_id);

  const hoy = todayInTz(zona);
  const desde = plainDateToInstant(addPlainDays(hoy, -1), zona);
  const [turnoRes, eventosRes, secciones] = await Promise.all([
    ctx.supabase
      .from('shift_assignments')
      .select('status, actual_start_time, actual_end_time, branch_id, branches(name), shift_templates(start_time, end_time)')
      .eq('organization_id', ctx.organizationId)
      .eq('employment_id', empleo.id)
      .eq('work_date', hoy)
      .not('status', 'in', '(cancelled,swapped)')
      .maybeSingle(),
    ctx.supabase
      .from('attendance_events')
      .select('event_type, event_at')
      .eq('organization_id', ctx.organizationId)
      .eq('employment_id', empleo.id)
      .gte('event_at', desde)
      .order('event_at', { ascending: true })
      .limit(50),
    seccionesVisiblesServidor(ctx).catch(() => []),
  ]);
  if (turnoRes.error) throw errorRpc('shift_assignments', turnoRes.error);
  if (eventosRes.error) throw errorRpc('attendance_events', eventosRes.error);

  const t = turnoRes.data as
    | { actual_start_time: string | null; actual_end_time: string | null; branches: Rel<{ name: string }>; shift_templates: Rel<{ start_time: string; end_time: string }> }
    | null;
  const plantilla = t ? uno(t.shift_templates) : null;
  const inicio = t?.actual_start_time ?? plantilla?.start_time ?? null;
  const fin = t?.actual_end_time ?? plantilla?.end_time ?? null;

  const calculado = calcularTurno({
    hoy,
    zona,
    ahora,
    turno: inicio && fin ? { inicio, fin } : null,
    marcaciones: ((eventosRes.data ?? []) as Array<{ event_type: string; event_at: string }>).map((e) => ({ tipo: e.event_type, en: e.event_at })),
  });
  return {
    ...calculado,
    visible: true,
    sucursal: uno(t?.branches ?? null)?.name ?? uno(empleo.branches)?.name ?? null,
    hrefMarcar: RUTA_MARCAR,
    hrefMarcaciones: paginaVisible(secciones, PAGINA_MARCACIONES) ? PAGINA_MARCACIONES : null,
  };
}
