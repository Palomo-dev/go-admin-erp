/**
 * «Pago contra entrega» de Sitio web › Ventas en línea (Figma «05 POS y ventas» 01–03, aprobado
 * 2026-11-24) en el servidor.
 *
 * La contraentrega ES el método «Efectivo» (`cash`) de `organization_payment_methods`; sus
 * condiciones viven en `settings.contraentrega.sedes[<branch_id>]` (reglaContraentrega.ts). El
 * método sigue viviendo en Finanzas › Métodos de pago: aquí no se crea la fila ni se cambia su
 * visibilidad, solo las condiciones de la tienda.
 *
 * Lectura con el cliente de la SESIÓN (RLS de pertenencia) y la organización del contexto. La
 * escritura exige `website.sites.edit` (como el checkout) y escribe con el cliente de servicio
 * filtrando por la organización de la sesión; solo toca la clave `contraentrega` de `settings`
 * (`conCondicionesDeSede`), nunca las demás.
 */
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { permisosSitio } from '@/lib/services/website/paginasSitioService';
import { resolverContextoMoneda } from '@/lib/services/monedaOrganizacion';
import { getServiceClient } from '@/lib/supabase/server-service';
import type { ContextoMoneda } from '@/lib/utils/moneda';
import { conCondicionesDeSede, condicionesDeSede, type CondicionesContraentrega } from '@/lib/contraentrega/reglaContraentrega';
import { erroresCondiciones, soloDeLaOrganizacion } from '@/lib/contraentrega/condicionesWeb';
import { ErrorVentas } from './ventasSitio.server';

type Ctx = Pick<ServerOrgContext, 'organizationId' | 'userId' | 'supabase' | 'memberId'>;

/** Pasarelas que la tienda sabe cobrar (`getWebsitePaymentMethods` de goadmin-websites). */
export const CONECTORES_PASARELA_WEB = ['wompi_co', 'mp_checkout', 'payu_co', 'stripe_payments', 'paypal_checkout', 'bold_link'] as const;

export interface SedeContraentrega {
  id: number;
  nombre: string;
  principal: boolean;
}

export interface ZonaContraentrega {
  id: string;
  nombre: string;
  branchId: number | null;
  envioGratisDesde: number | null;
  /** Valor del domicilio de la zona (`shipping_zones.fee`): la cifra real del anticipo «el envío». */
  domicilio: number | null;
}

export interface RespuestaContraentrega {
  /** Fila `cash` de Finanzas › Métodos de pago. Sin ella no hay contraentrega que condicionar. */
  efectivo: { existe: boolean; activo: boolean; visibleWeb: boolean; nombre: string | null };
  sedes: SedeContraentrega[];
  /** Condiciones guardadas por sede (solo las sedes que tienen). */
  condiciones: Record<string, CondicionesContraentrega>;
  zonas: ZonaContraentrega[];
  pasarelas: { codigo: string; nombre: string }[];
  categorias: { id: number; nombre: string; descripcion: string | null }[];
  /** Productos que ya usan las condiciones guardadas (para pintar sus nombres). */
  productos: { id: number; nombre: string; sku: string | null }[];
  /** «Envío gratis desde» del checkout del sitio (website_settings.free_shipping_threshold). */
  envioGratisDesde: number | null;
  moneda: ContextoMoneda;
  permisos: { editar: boolean };
}

function numero(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function exigirEditar(ctx: Ctx): Promise<void> {
  const permisos = await permisosSitio(ctx);
  if (!permisos.editar) throw new ErrorVentas('sin_permiso', 403, 'No tienes permiso para editar el sitio web.');
}

interface FilaEfectivo {
  id: number;
  is_active: boolean | null;
  show_on_website: boolean | null;
  website_display_name: string | null;
  settings: unknown;
  payment_methods: { name: string | null } | { name: string | null }[] | null;
}

async function leerEfectivo(ctx: Ctx): Promise<FilaEfectivo | null> {
  const { data, error } = await ctx.supabase
    .from('organization_payment_methods')
    .select('id, is_active, show_on_website, website_display_name, settings, payment_methods(name)')
    .eq('organization_id', ctx.organizationId)
    .eq('payment_method_code', 'cash')
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as FilaEfectivo | null) ?? null;
}

/** Condiciones guardadas de cada sede (solo las que tienen). */
export function condicionesPorSede(settings: unknown, sedes: readonly { id: number }[]): Record<string, CondicionesContraentrega> {
  const r: Record<string, CondicionesContraentrega> = {};
  for (const s of sedes) {
    const c = condicionesDeSede(settings, s.id);
    if (c) r[String(s.id)] = c;
  }
  return r;
}

export async function leerContraentrega(ctx: Ctx): Promise<RespuestaContraentrega> {
  const permisos = await permisosSitio(ctx);
  if (!permisos.editar) throw new ErrorVentas('sin_permiso', 403, 'No tienes permiso para ver las ventas del sitio.');

  const [efectivo, sedesRes, zonasRes, conexionesRes, categoriasRes, ajustesRes, moneda] = await Promise.all([
    leerEfectivo(ctx),
    ctx.supabase
      .from('branches')
      .select('id, name, is_main')
      .eq('organization_id', ctx.organizationId)
      .or('is_active.is.null,is_active.eq.true')
      .order('is_main', { ascending: false, nullsFirst: false })
      .order('name', { ascending: true }),
    ctx.supabase
      .from('shipping_zones')
      .select('id, name, branch_id, free_shipping_from, priority, fee')
      .eq('organization_id', ctx.organizationId)
      .eq('is_active', true)
      .order('priority', { ascending: true })
      .order('name', { ascending: true }),
    ctx.supabase
      .from('integration_connections')
      .select('status, integration_connectors!inner(code, name)')
      .eq('organization_id', ctx.organizationId)
      .in('status', ['active', 'connected'])
      .in('integration_connectors.code', [...CONECTORES_PASARELA_WEB]),
    ctx.supabase
      .from('categories')
      .select('id, name, description')
      .eq('organization_id', ctx.organizationId)
      .or('is_active.is.null,is_active.eq.true')
      .order('name', { ascending: true })
      .limit(500),
    ctx.supabase
      .from('website_settings')
      .select('free_shipping_threshold')
      .eq('organization_id', ctx.organizationId)
      .is('branch_id', null)
      .maybeSingle(),
    resolverContextoMoneda(ctx.supabase, ctx.organizationId),
  ]);
  if (sedesRes.error) throw sedesRes.error;
  if (zonasRes.error) throw zonasRes.error;
  if (conexionesRes.error) throw conexionesRes.error;
  if (categoriasRes.error) throw categoriasRes.error;

  const sedes = ((sedesRes.data ?? []) as { id: number; name: string | null; is_main: boolean | null }[]).map((s) => ({
    id: s.id,
    nombre: (s.name ?? '').trim() || `#${s.id}`,
    principal: s.is_main === true,
  }));
  const condiciones = condicionesPorSede(efectivo?.settings, sedes);

  const idsProductos = Array.from(new Set(Object.values(condiciones).flatMap((c) => c.productos.productos)));
  let productos: RespuestaContraentrega['productos'] = [];
  if (idsProductos.length > 0) {
    const { data, error } = await ctx.supabase
      .from('products')
      .select('id, name, sku')
      .eq('organization_id', ctx.organizationId)
      .in('id', idsProductos.slice(0, 500));
    if (error) throw error;
    productos = ((data ?? []) as { id: number; name: string | null; sku: string | null }[]).map((p) => ({ id: p.id, nombre: p.name ?? `#${p.id}`, sku: p.sku }));
  }

  const pasarelasVistas = new Map<string, string>();
  for (const f of (conexionesRes.data ?? []) as unknown as { integration_connectors: { code: string; name: string | null } | null }[]) {
    const c = f.integration_connectors;
    if (c?.code && !pasarelasVistas.has(c.code)) pasarelasVistas.set(c.code, c.name ?? c.code);
  }
  const pm = efectivo ? (Array.isArray(efectivo.payment_methods) ? efectivo.payment_methods[0] : efectivo.payment_methods) : null;

  return {
    efectivo: {
      existe: !!efectivo,
      activo: efectivo ? efectivo.is_active !== false : false,
      visibleWeb: efectivo ? efectivo.show_on_website === true : false,
      nombre: efectivo ? (efectivo.website_display_name || pm?.name || null) : null,
    },
    sedes,
    condiciones,
    zonas: ((zonasRes.data ?? []) as { id: string; name: string; branch_id: number | null; free_shipping_from: number | string | null; fee: number | string | null }[]).map((z) => ({
      id: z.id,
      nombre: z.name,
      branchId: z.branch_id,
      envioGratisDesde: numero(z.free_shipping_from),
      domicilio: numero(z.fee),
    })),
    pasarelas: Array.from(pasarelasVistas, ([codigo, nombre]) => ({ codigo, nombre })),
    categorias: ((categoriasRes.data ?? []) as { id: number; name: string | null; description: string | null }[]).map((c) => ({
      id: c.id,
      nombre: c.name ?? `#${c.id}`,
      descripcion: c.description,
    })),
    productos,
    // Sin la fila de ajustes (o la columna) el aviso de envío gratis sale sin monto.
    envioGratisDesde: ajustesRes.error ? null : numero((ajustesRes.data as { free_shipping_threshold: unknown } | null)?.free_shipping_threshold),
    moneda,
    permisos: { editar: permisos.editar },
  };
}

const escaparLike = (q: string) => q.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Buscador de productos del diálogo (padres y simples; las variantes las cubre su padre). */
export async function buscarProductosContraentrega(ctx: Ctx, texto: string): Promise<RespuestaContraentrega['productos']> {
  await exigirEditar(ctx);
  const q = texto.trim().slice(0, 80);
  if (q.length < 2) return [];
  const patron = `%${escaparLike(q)}%`;
  const { data, error } = await ctx.supabase
    .from('products')
    .select('id, name, sku')
    .eq('organization_id', ctx.organizationId)
    .eq('status', 'active')
    .is('parent_product_id', null)
    .or(`name.ilike.${patron},sku.ilike.${patron}`)
    .order('name', { ascending: true })
    .limit(20);
  if (error) throw error;
  return ((data ?? []) as { id: number; name: string | null; sku: string | null }[]).map((p) => ({ id: p.id, nombre: p.name ?? `#${p.id}`, sku: p.sku }));
}

/**
 * Guarda (o quita, con `null`) las condiciones de UNA sede. La sede, las zonas, las categorías y
 * los productos se comprueban contra la organización de la sesión; lo ajeno se descarta.
 */
export async function guardarContraentrega(ctx: Ctx, branchId: number, condiciones: CondicionesContraentrega | null): Promise<void> {
  await exigirEditar(ctx);
  const db = getServiceClient();
  const [sede, fila] = await Promise.all([
    db.from('branches').select('id').eq('organization_id', ctx.organizationId).eq('id', branchId).maybeSingle(),
    db
      .from('organization_payment_methods')
      .select('id, settings')
      .eq('organization_id', ctx.organizationId)
      .eq('payment_method_code', 'cash')
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);
  if (sede.error) throw sede.error;
  if (fila.error) throw fila.error;
  if (!sede.data) throw new ErrorVentas('peticion_invalida', 400, 'La sede no es de tu organización.', ['branchId']);
  if (!fila.data) {
    throw new ErrorVentas('sin_ajustes', 409, 'Tu organización no tiene el método Efectivo. Actívalo en Finanzas › Métodos de pago.');
  }

  let limpias = condiciones;
  if (condiciones) {
    const zonasPedidas = condiciones.zonas.modo === 'algunas' ? condiciones.zonas.ids : [];
    const { categorias: catPedidas, productos: prodPedidos } = condiciones.productos;
    const [zonas, categorias, productos] = await Promise.all([
      // Zonas de la organización Y de esta sede (o de todas las sedes: branch_id NULL), las mismas que lista el diálogo.
      zonasPedidas.length > 0
        ? db
            .from('shipping_zones')
            .select('id')
            .eq('organization_id', ctx.organizationId)
            .or(`branch_id.is.null,branch_id.eq.${branchId}`)
            .in('id', zonasPedidas)
        : Promise.resolve({ data: [] as { id: string }[], error: null }),
      catPedidas.length > 0
        ? db.from('categories').select('id').eq('organization_id', ctx.organizationId).in('id', catPedidas)
        : Promise.resolve({ data: [] as { id: number }[], error: null }),
      prodPedidos.length > 0
        ? db.from('products').select('id').eq('organization_id', ctx.organizationId).in('id', prodPedidos)
        : Promise.resolve({ data: [] as { id: number }[], error: null }),
    ]);
    if (zonas.error) throw zonas.error;
    if (categorias.error) throw categorias.error;
    if (productos.error) throw productos.error;
    limpias = soloDeLaOrganizacion(condiciones, {
      zonas: new Set(((zonas.data ?? []) as { id: string }[]).map((z) => z.id)),
      categorias: new Set(((categorias.data ?? []) as { id: number }[]).map((c) => c.id)),
      productos: new Set(((productos.data ?? []) as { id: number }[]).map((p) => p.id)),
    });
    // Pasarela del anticipo: solo una de las que la tienda sabe cobrar.
    const pasarela = limpias.anticipo.pasarela;
    if (pasarela !== null && !(CONECTORES_PASARELA_WEB as readonly string[]).includes(pasarela)) {
      throw new ErrorVentas('peticion_invalida', 400, 'Esa pasarela no cobra en la tienda.', ['anticipo.pasarela']);
    }
    // Lo ajeno se descartó: si eso deja la regla vacía («solo en estas zonas» sin zonas, «solo
    // algunos» sin productos) se rechaza, en vez de guardar una contraentrega que nunca se ofrece.
    const errores = erroresCondiciones(limpias);
    if (errores.length > 0) throw new ErrorVentas('peticion_invalida', 400, 'Revisa las condiciones de la contraentrega.', errores);
  } else {
    // Quitar las condiciones de la sede: la contraentrega vuelve a funcionar como hoy.
  }

  const filaEfectivo = fila.data as { id: number; settings: unknown };
  const settings = conCondicionesDeSede(filaEfectivo.settings, branchId, limpias);
  const { error } = await db
    .from('organization_payment_methods')
    .update({ settings, updated_at: new Date().toISOString() })
    .eq('organization_id', ctx.organizationId)
    .eq('id', filaEfectivo.id);
  if (error) throw error;
}
