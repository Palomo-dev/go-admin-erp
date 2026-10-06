/**
 * «Ventas en línea» del sitio web (Figma B/10-01…10-05) en el servidor.
 *
 * UNA lectura (`leerVentasSitio`) que reúne el estado real de cada tema
 * (checkout, métodos de pago, envíos, cupones, pedidos online, reservas web y
 * pasarela) y lo pasa por las reglas puras de `estadoVentas.ts`. Cada tarjeta
 * se lee por separado con `Promise.allSettled`: si una falla (por ejemplo,
 * Transporte no responde), las demás llegan y esa vuelve como error parcial
 * (B/10-03).
 *
 * Todo con el cliente de la SESIÓN (`ctx.supabase`, RLS de pertenencia) y la
 * organización del contexto, nunca de la petición. Se reutilizan:
 * - `permisosSitio` (`fn_website_tiene_permiso`: website.sites.edit),
 * - `tienePasarela` y `direccionDelSitio` (la misma regla del Resumen),
 * - `seccionesVisiblesServidor` (un enlace «Ir a …» solo si la persona ve esa
 *   página; si no, «Disponible con <módulo>»),
 * - `getOrganizationTimezone` + `todayInTz`/`plainDateToInstant` («Pagados hoy»
 *   en la zona de la organización, sin `split('T')`),
 * - `resolverContextoMoneda` (la moneda base de la organización, nunca supuesta).
 *
 * Las escrituras (checkout y el interruptor de reservas) validan el permiso y
 * escriben con el cliente de servicio filtrando por la organización de la
 * sesión, como `seo.server.ts`: la RLS de `website_settings` exige un rol de
 * administrador y el permiso del módulo es `website.sites.edit`.
 */
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { permisosSitio } from '@/lib/services/website/paginasSitioService';
import { seccionesVisiblesServidor } from '@/lib/navigation/navegacionServidor';
import { CATALOGO_NAV } from '@/lib/navigation/catalog';
import { getOrganizationTimezone } from '@/lib/services/organizationTimezoneService';
import { resolverContextoMoneda } from '@/lib/services/monedaOrganizacion';
import { plainDateToInstant, todayInTz } from '@/lib/utils/dateDisplay';
import { getServiceClient } from '@/lib/supabase/server-service';
import { getMasterResendKey } from '@/lib/services/crm/email/resendClient';
import type { ContextoMoneda } from '@/lib/utils/moneda';
import { direccionDelSitio } from '@/components/sitio-web/seoanalitica/seo.server';
import { giroDesdeTipo, leerOnboarding, type GiroSitio } from './onboardingSitio';
import { tienePasarela } from './resumenSitio';
import {
  COLUMNAS_PENDIENTES_CHECKOUT,
  TIPOS_ENTREGA,
  filaDeCambios,
  ordenarTablero,
  progresoVentas,
  tarjetaCheckout,
  tarjetaCupones,
  tarjetaEnvios,
  tarjetaPagos,
  tarjetaPasarela,
  tarjetaPedidos,
  tarjetaReservas,
  type CambiosCheckout,
  type EnlaceVenta,
  type EntradaTablero,
  type ProgresoVentas,
  type SelloConfianza,
  type TemaVenta,
  type TipoEntrega,
} from '@/components/sitio-web/ventas/estadoVentas';

type Ctx = Pick<ServerOrgContext, 'organizationId' | 'userId' | 'supabase' | 'memberId'>;

export class ErrorVentas extends Error {
  constructor(
    public readonly codigo: 'sin_permiso' | 'peticion_invalida' | 'sin_ajustes' | 'pendiente_migracion' | 'sin_reservas',
    public readonly status: number,
    mensaje: string,
    public readonly campos?: string[],
  ) {
    super(mensaje);
    this.name = 'ErrorVentas';
  }
}

/** Ajustes del checkout tal como los edita `DialogoCheckout`. */
export interface AjustesCheckout {
  modo: 'steps' | 'one_page';
  tiposEntrega: TipoEntrega[];
  invitado: boolean;
  pedidoMinimo: number | null;
  sellos: boolean;
  listaSellos: SelloConfianza[];
  logosPago: boolean;
  ventaEnLinea: boolean;
  envioActivo: boolean;
  tarifaPlana: number | null;
  envioGratisDesde: number | null;
  /** Compra como invitado y pedido mínimo esperan la migración `sitio_web_ventas_sedes`. */
  pendienteMigracion: boolean;
}

export interface RespuestaVentas {
  /** `primera_vez`: el sitio aún no tiene ajustes (lleva al asistente). */
  estado: 'listo' | 'primera_vez';
  tablero: EntradaTablero[];
  progreso: ProgresoVentas;
  checkout: AjustesCheckout | null;
  permisos: { editar: boolean; publicar: boolean };
  giro: GiroSitio;
  moneda: ContextoMoneda;
  zonaHoraria: string;
  sitio: { host: string | null; url: string | null; publicado: boolean };
  /** Enlace a Tarifas de envío y si la persona puede usarlo (sección Envíos). */
  tarifasEnvio: EnlaceVenta;
}

// ─── Enlaces a los módulos dueños (B/10-05) ──────────────────────────────────

const ENLACES: Record<Exclude<TemaVenta, 'checkout'>, { href: string; texto: string }> = {
  pagos: { href: '/app/finanzas/metodos-pago', texto: 'irFinanzasMetodos' },
  envios: { href: '/app/transporte/tarifas-envio', texto: 'irTransporteTarifas' },
  cupones: { href: '/app/pos/cupones', texto: 'irPosPromociones' },
  pedidos: { href: '/app/pos/pedidos-online', texto: 'irPosPedidos' },
  reservas: { href: '/app/pos/reservas-mesas?tab=configuracion', texto: 'irPosReservas' },
  pasarela: { href: '/app/integraciones/conexiones', texto: 'irIntegraciones' },
};

/** Módulo del catálogo que tiene esa página (para «Disponible con Transporte»). */
export function moduloDeRuta(href: string): string {
  const base = href.split('?')[0];
  const m = CATALOGO_NAV.find((mod) => mod.paginas.some((p) => p.href === base) || mod.rutas.some((r) => base === r));
  return m?.etiqueta ?? 'sitioWeb';
}

export function enlacesVisibles(rutasVisibles: ReadonlySet<string>): Record<Exclude<TemaVenta, 'checkout'>, EnlaceVenta> {
  const salida = {} as Record<Exclude<TemaVenta, 'checkout'>, EnlaceVenta>;
  for (const [tema, e] of Object.entries(ENLACES) as [Exclude<TemaVenta, 'checkout'>, { href: string; texto: string }][]) {
    salida[tema] = { ...e, visible: rutasVisibles.has(e.href.split('?')[0]), modulo: moduloDeRuta(e.href) };
  }
  return salida;
}

async function rutasVisibles(ctx: Ctx): Promise<Set<string>> {
  try {
    const secciones = await seccionesVisiblesServidor(ctx as ServerOrgContext);
    return new Set(secciones.flatMap((s) => s.modulos.flatMap((m) => m.paginas.map((p) => p.href))));
  } catch (error) {
    // Falla cerrado: sin saber qué ve, no se ofrece ningún enlace.
    console.warn('[ventasSitio] no se pudo leer la navegación visible', { message: (error as Error)?.message });
    return new Set();
  }
}

// ─── Lectura de website_settings ─────────────────────────────────────────────

const COLUMNAS_BASE =
  'checkout_mode, available_delivery_types, enable_shipping, checkout_show_trust_badges, checkout_trust_badges, checkout_show_payment_logos, enable_online_ordering, shipping_flat_rate, free_shipping_threshold, is_published';

interface FilaAjustes {
  checkout_mode: string | null;
  available_delivery_types: string[] | null;
  enable_shipping: boolean | null;
  checkout_show_trust_badges: boolean | null;
  checkout_trust_badges: unknown;
  checkout_show_payment_logos: boolean | null;
  enable_online_ordering: boolean | null;
  shipping_flat_rate: number | string | null;
  free_shipping_threshold: number | string | null;
  is_published: boolean | null;
}

/** Códigos de «la columna no existe» (Postgres y PostgREST). */
const SIN_COLUMNA = new Set(['42703', 'PGRST204']);
export function esSinColumna(error: unknown): boolean {
  return SIN_COLUMNA.has((error as { code?: string } | null)?.code ?? '');
}

function numero(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function sellosDe(crudo: unknown): SelloConfianza[] {
  if (!Array.isArray(crudo)) return [];
  return crudo
    .filter((s): s is { icon?: unknown; text?: unknown } => typeof s === 'object' && s !== null)
    .map((s) => ({ icono: typeof s.icon === 'string' ? s.icon : '', texto: typeof s.text === 'string' ? s.text : '' }))
    .filter((s) => s.texto.trim() !== '');
}

const TIPOS_VALIDOS = new Set<string>(TIPOS_ENTREGA);

async function leerAjustes(ctx: Ctx): Promise<AjustesCheckout | null> {
  const { data, error } = await ctx.supabase
    .from('website_settings')
    .select(COLUMNAS_BASE)
    .eq('organization_id', ctx.organizationId)
    .is('branch_id', null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const f = data as unknown as FilaAjustes;

  // Columnas de la migración pendiente: sin ellas, el sitio hoy deja comprar sin cuenta y sin mínimo.
  let invitado = true;
  let pedidoMinimo: number | null = null;
  let pendienteMigracion = false;
  const extra = await ctx.supabase
    .from('website_settings')
    .select('checkout_guest_enabled, checkout_min_order_amount')
    .eq('organization_id', ctx.organizationId)
    .is('branch_id', null)
    .maybeSingle();
  if (extra.error) {
    if (!esSinColumna(extra.error)) throw extra.error;
    pendienteMigracion = true;
  } else {
    const e = extra.data as { checkout_guest_enabled: boolean | null; checkout_min_order_amount: number | string | null } | null;
    invitado = e?.checkout_guest_enabled ?? true;
    pedidoMinimo = numero(e?.checkout_min_order_amount);
  }

  return {
    modo: f.checkout_mode === 'one_page' ? 'one_page' : 'steps',
    tiposEntrega: (f.available_delivery_types ?? []).filter((t): t is TipoEntrega => TIPOS_VALIDOS.has(t)),
    invitado,
    pedidoMinimo,
    sellos: f.checkout_show_trust_badges !== false,
    listaSellos: sellosDe(f.checkout_trust_badges),
    logosPago: f.checkout_show_payment_logos !== false,
    ventaEnLinea: f.enable_online_ordering === true,
    envioActivo: f.enable_shipping !== false,
    tarifaPlana: numero(f.shipping_flat_rate),
    envioGratisDesde: numero(f.free_shipping_threshold),
    pendienteMigracion,
  };
}

// ─── Una lectura por tarjeta ─────────────────────────────────────────────────

async function contar(consulta: PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
  const { count, error } = await consulta;
  if (error) throw error;
  return count ?? 0;
}

interface FilaPago {
  payment_method_code: string;
  is_active: boolean | null;
  show_on_website: boolean | null;
  website_display_name: string | null;
  website_display_order: number | null;
  integration_connection_id: string | null;
  payment_methods: { name: string | null } | { name: string | null }[] | null;
}

async function leerPagos(ctx: Ctx) {
  const { data, error } = await ctx.supabase
    .from('organization_payment_methods')
    .select('payment_method_code, is_active, show_on_website, website_display_name, website_display_order, integration_connection_id, payment_methods(name)')
    .eq('organization_id', ctx.organizationId)
    .order('website_display_order', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as unknown as FilaPago[];
}

function nombreMetodo(f: FilaPago): string {
  const pm = Array.isArray(f.payment_methods) ? f.payment_methods[0] : f.payment_methods;
  return (f.website_display_name || pm?.name || f.payment_method_code).trim();
}

async function leerEnvios(ctx: Ctx): Promise<number> {
  return contar(
    ctx.supabase
      .from('shipping_rates')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', ctx.organizationId)
      .eq('is_active', true)
      .eq('show_on_website', true),
  );
}

async function leerCupones(ctx: Ctx, ahora: Date) {
  const iso = ahora.toISOString();
  const [cupones, promociones] = await Promise.all([
    ctx.supabase
      .from('coupons')
      .select('usage_count, usage_limit, start_date, end_date')
      .eq('organization_id', ctx.organizationId)
      .eq('is_active', true)
      .or(`end_date.is.null,end_date.gte.${iso}`)
      .limit(1000),
    contar(
      ctx.supabase
        .from('promotions')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', ctx.organizationId)
        .eq('is_active', true)
        .eq('applies_to_web', true)
        .or(`end_date.is.null,end_date.gte.${iso}`),
    ),
  ]);
  if (cupones.error) throw cupones.error;
  const usables = ((cupones.data ?? []) as { usage_count: number | null; usage_limit: number | null; start_date: string | null }[]).filter(
    (c) => (c.start_date === null || new Date(c.start_date).getTime() <= ahora.getTime()) && (c.usage_limit === null || (c.usage_count ?? 0) < c.usage_limit),
  ).length;
  return { cuponesUsables: usables, promocionesWeb: promociones };
}

async function leerPedidos(ctx: Ctx, zona: string, ahora: Date) {
  const inicioHoy = plainDateToInstant(todayInTz(zona), zona);
  const [pendientes, pagados] = await Promise.all([
    contar(
      ctx.supabase
        .from('web_orders')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', ctx.organizationId)
        .eq('status', 'pending'),
    ),
    ctx.supabase
      .from('web_orders')
      .select('total')
      .eq('organization_id', ctx.organizationId)
      .eq('payment_status', 'paid')
      .gte('created_at', inicioHoy)
      .lte('created_at', ahora.toISOString())
      .limit(5000),
  ]);
  if (pagados.error) throw pagados.error;
  const filas = (pagados.data ?? []) as { total: number | string | null }[];
  return { pendientes, pagadosHoy: filas.length, totalHoy: filas.reduce((s, f) => s + (numero(f.total) ?? 0), 0) };
}

async function leerReservas(ctx: Ctx) {
  const { data, error } = await ctx.supabase
    .from('restaurant_booking_settings')
    .select('is_enabled, branches(name, is_active)')
    .eq('organization_id', ctx.organizationId);
  if (error) throw error;
  type Fila = { is_enabled: boolean | null; branches: { name: string; is_active: boolean | null } | { name: string; is_active: boolean | null }[] | null };
  return ((data ?? []) as unknown as Fila[])
    .map((f) => ({ sede: Array.isArray(f.branches) ? f.branches[0] : f.branches, recibiendo: f.is_enabled === true }))
    .filter((f) => f.sede && f.sede.is_active !== false)
    .map((f) => ({ nombre: f.sede!.name, recibiendo: f.recibiendo }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

interface FilaConexion {
  id: string;
  status: string;
  environment: string | null;
  last_activity_at: string | null;
  integration_connectors: { integration_providers: { name: string; category: string } | null } | null;
}

async function leerPasarela(ctx: Ctx) {
  const { data, error } = await ctx.supabase
    .from('integration_connections')
    .select('id, status, environment, last_activity_at, integration_connectors!inner(integration_providers!inner(name, category))')
    .eq('organization_id', ctx.organizationId)
    .eq('integration_connectors.integration_providers.category', 'payments')
    .order('last_activity_at', { ascending: false, nullsFirst: false });
  if (error) throw error;
  const filas = (data ?? []) as unknown as FilaConexion[];
  const conexiones = filas.map((f) => ({
    id: f.id,
    proveedor: f.integration_connectors?.integration_providers?.name ?? '',
    estado: f.status,
    entorno: f.environment,
  }));
  const conectada = conexiones.find((c) => c.estado === 'connected');
  let firma: 'match' | 'mismatch' | null = null;
  let ultimoPago: string | null = null;
  if (conectada) {
    const [ver, ultimo] = await Promise.all([
      ctx.supabase
        .from('integration_events')
        .select('veredicto:payload->>signature_verdict, created_at')
        .eq('connection_id', conectada.id)
        .not('payload->>signature_verdict', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      ctx.supabase
        .from('integration_events')
        .select('created_at')
        .eq('connection_id', conectada.id)
        .eq('status', 'processed')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (ver.error) throw ver.error;
    if (ultimo.error) throw ultimo.error;
    const v = (ver.data as { veredicto: string | null } | null)?.veredicto;
    firma = v === 'match' ? 'match' : v === 'mismatch' ? 'mismatch' : null;
    ultimoPago = (ultimo.data as { created_at: string } | null)?.created_at ?? null;
  }
  return { conexiones, firma, ultimoPago };
}

// ─── Lectura completa ────────────────────────────────────────────────────────

function tarjetaOError(tema: TemaVenta, r: PromiseSettledResult<EntradaTablero>): EntradaTablero {
  if (r.status === 'fulfilled') return r.value;
  console.error('[ventasSitio] tarjeta sin leer', { tema, message: (r.reason as Error)?.message ?? String(r.reason) });
  return { tema, error: true };
}

export async function leerVentasSitio(ctx: Ctx, ahora: Date = new Date()): Promise<RespuestaVentas> {
  const permisos = await permisosSitio(ctx);
  if (!permisos.editar) throw new ErrorVentas('sin_permiso', 403, 'No tienes permiso para ver las ventas del sitio.');

  const [orgRes, estadoRes, ajustes, rutas, zona, moneda, direccion] = await Promise.all([
    ctx.supabase.from('organizations').select('type_id').eq('id', ctx.organizationId).maybeSingle(),
    ctx.supabase.from('website_site_states').select('onboarding, published_revision_id').eq('organization_id', ctx.organizationId).is('branch_id', null).maybeSingle(),
    leerAjustes(ctx),
    rutasVisibles(ctx),
    getOrganizationTimezone(ctx.organizationId, ctx.supabase),
    resolverContextoMoneda(ctx.supabase, ctx.organizationId),
    direccionDelSitio(ctx),
  ]);
  if (orgRes.error) throw orgRes.error;
  const estadoSitio = estadoRes.error ? null : (estadoRes.data as { onboarding: unknown; published_revision_id: string | null } | null);
  const giro = leerOnboarding(estadoSitio?.onboarding).giro ?? giroDesdeTipo((orgRes.data as { type_id: number | null } | null)?.type_id);
  const enlaces = enlacesVisibles(rutas);

  const base = {
    permisos,
    giro,
    moneda,
    zonaHoraria: zona,
    checkout: ajustes,
    sitio: { host: direccion.host, url: direccion.url, publicado: !!estadoSitio?.published_revision_id },
    tarifasEnvio: enlaces.envios,
  };
  if (!ajustes) return { ...base, estado: 'primera_vez', tablero: [], progreso: { listos: 0, total: 0, faltan: [], sinVender: false } };

  const conReservas = giro === 'restaurante';
  const temas: TemaVenta[] = ['checkout', 'pagos', 'envios', 'cupones', 'pedidos', ...(conReservas ? (['reservas'] as const) : []), 'pasarela'];
  const pagosP = leerPagos(ctx);
  const lecturas: Record<TemaVenta, () => Promise<EntradaTablero>> = {
    checkout: async () =>
      tarjetaCheckout({
        modo: ajustes.modo,
        tiposEntrega: ajustes.tiposEntrega,
        invitado: ajustes.pendienteMigracion ? null : ajustes.invitado,
        pedidoMinimo: ajustes.pendienteMigracion ? undefined : ajustes.pedidoMinimo,
        sellos: ajustes.sellos,
        logosPago: ajustes.logosPago,
        ventaEnLinea: ajustes.ventaEnLinea,
        hayAjustes: true,
        editable: permisos.editar,
      }),
    pagos: async () =>
      tarjetaPagos(
        (await pagosP).map((f) => ({
          nombre: nombreMetodo(f),
          visible: f.show_on_website === true,
          activo: f.is_active !== false,
          conPasarela: !!f.integration_connection_id,
        })),
        enlaces.pagos,
      ),
    envios: async () =>
      tarjetaEnvios({
        enlace: enlaces.envios,
        envioActivo: ajustes.envioActivo,
        tiposEntrega: ajustes.tiposEntrega,
        tarifaPlana: ajustes.tarifaPlana,
        envioGratisDesde: ajustes.envioGratisDesde,
        tarifasZonaWeb: await leerEnvios(ctx),
      }),
    cupones: async () => tarjetaCupones({ enlace: enlaces.cupones, ...(await leerCupones(ctx, ahora)) }),
    pedidos: async () =>
      tarjetaPedidos({
        enlace: enlaces.pedidos,
        ventaEnLinea: ajustes.ventaEnLinea,
        // El correo de estado del pedido (orderStatusEmailService) sale con la clave de la plataforma.
        avisosCliente: getMasterResendKey() ? ['correo'] : [],
        ...(await leerPedidos(ctx, zona, ahora)),
      }),
    reservas: async () => tarjetaReservas({ enlace: enlaces.reservas, sedes: await leerReservas(ctx) }, permisos.editar),
    pasarela: async () => {
      const [p, pagos] = await Promise.all([leerPasarela(ctx), pagosP]);
      return tarjetaPasarela({ enlace: enlaces.pasarela, enlazadaAlSitio: tienePasarela(pagos), ...p });
    },
  };
  const resultados = await Promise.allSettled(temas.map((t) => lecturas[t]()));
  const tablero = ordenarTablero(temas.map((t, i) => tarjetaOError(t, resultados[i])));
  return { ...base, estado: 'listo', tablero, progreso: progresoVentas(tablero) };
}

// ─── Escrituras ──────────────────────────────────────────────────────────────

async function exigirEditar(ctx: Ctx): Promise<void> {
  const permisos = await permisosSitio(ctx);
  if (!permisos.editar) throw new ErrorVentas('sin_permiso', 403, 'No tienes permiso para editar el sitio web.');
}

/**
 * PUT del checkout: lista blanca de columnas (`filaDeCambios`), organización
 * de la sesión. Compra como invitado y pedido mínimo, si la migración aún no
 * se aplica, responden 409 `pendiente_migracion` sin tocar lo demás.
 */
export async function guardarCheckout(ctx: Ctx, cambios: CambiosCheckout): Promise<void> {
  await exigirEditar(ctx);
  const fila = filaDeCambios(cambios);
  if (Object.keys(fila).length === 0) return;
  const { data, error } = await getServiceClient()
    .from('website_settings')
    .update({ ...fila, updated_at: new Date().toISOString() })
    .eq('organization_id', ctx.organizationId)
    .is('branch_id', null)
    .select('id');
  if (error) {
    if (esSinColumna(error) && Object.keys(fila).some((c) => COLUMNAS_PENDIENTES_CHECKOUT.has(c))) {
      throw new ErrorVentas('pendiente_migracion', 409, 'Compra como invitado y pedido mínimo se activan con una migración pendiente.');
    }
    throw error;
  }
  if (!data || data.length === 0) throw new ErrorVentas('sin_ajustes', 404, 'El sitio aún no tiene ajustes. Créalo desde el Resumen.');
}

/**
 * Interruptor global de reservas en la web: el atajo del «Recibir reservas en
 * la web» de cada sede (B/10-04 nota 4). Solo actualiza las sedes que ya
 * tienen configuración en POS › Reservas de mesas; no crea filas con valores
 * inventados.
 *
 * Solo toca las sedes ACTIVAS: el mismo conjunto que pinta la tarjeta
 * (`leerReservas`). Una sucursal cerrada no empieza a recibir reservas web
 * por un interruptor que no la muestra.
 */
export async function alternarReservasWeb(ctx: Ctx, activo: boolean): Promise<number> {
  await exigirEditar(ctx);
  const db = getServiceClient();
  const activas = await db.from('branches').select('id').eq('organization_id', ctx.organizationId).or('is_active.is.null,is_active.eq.true');
  if (activas.error) throw activas.error;
  const ids = ((activas.data ?? []) as { id: number }[]).map((b) => b.id);
  if (ids.length === 0) throw new ErrorVentas('sin_reservas', 409, 'Aún no configuras las reservas. Hazlo en POS › Reservas de mesas.');
  const { data, error } = await db
    .from('restaurant_booking_settings')
    .update({ is_enabled: activo, updated_at: new Date().toISOString() })
    .eq('organization_id', ctx.organizationId)
    .in('branch_id', ids)
    .select('id');
  if (error) throw error;
  const n = (data ?? []).length;
  if (n === 0) throw new ErrorVentas('sin_reservas', 409, 'Aún no configuras las reservas. Hazlo en POS › Reservas de mesas.');
  return n;
}

/** Respuesta de error común de las rutas de esta área. */
export function respuestaErrorVentas(error: unknown, ruta: string, organizationId: number): Response {
  const cabeceras = { 'Cache-Control': 'private, no-store' };
  if (error instanceof ErrorVentas) {
    return Response.json({ error: error.message, codigo: error.codigo, campos: error.campos }, { status: error.status, headers: cabeceras });
  }
  if ((error as { code?: string } | null)?.code === '42501') {
    return Response.json({ error: 'No tienes acceso al sitio web.', codigo: 'sin_permiso' }, { status: 403, headers: cabeceras });
  }
  console.error(`[api/${ruta}]`, { organizationId, message: error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error) });
  return Response.json({ error: 'No pudimos completar la operación.', codigo: 'error_interno' }, { status: 500, headers: cabeceras });
}
