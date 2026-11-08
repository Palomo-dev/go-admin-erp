/**
 * Pasos 2 y 3 del asistente de Meta (diseño 85-42 «Activos» y 85-43 «Qué se envía»), sobre lo que
 * ya existe: el OAuth de `/api/integrations/meta/oauth/*` guarda el token y hace un primer
 * `fullSetup`; aquí el administrador elige portafolio, cuenta publicitaria, catálogo y píxel con
 * los métodos de `metaMarketingService` (Graph API real) y decide qué se envía.
 *
 * - El token NUNCA sale del servidor: se lee con service role tras validar la conexión.
 * - Cada id elegido se comprueba contra lo que Graph devuelve para ese token (no se aceptan ids
 *   arbitrarios del navegador). «nuevo» crea el catálogo o el píxel con los métodos existentes.
 * - «Qué se envía» queda en `integration_connections.settings.meta_envios` (fusionado, sin pisar
 *   otros ajustes). Lo respetan las rutas de envío: catálogo (`product-sync`, `catalog-sync`) y
 *   compras (`send-event` del ERP y `lib/meta/send-capi-event` de la tienda).
 *   Prospectos del CRM: no existe envío de prospectos a Meta; la opción se muestra «en construcción».
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { metaMarketingService } from '@/lib/services/integrations/meta';
import { resolveOrgStoreDomain } from '@/lib/services/integrations/marketingAccess';
import { ConexionError } from './conexiones.server';

type Fila = Record<string, unknown>;

export interface OpcionMeta {
  id: string;
  nombre: string;
  moneda?: string;
}

export interface EnviosMeta {
  catalogo: boolean;
  compras: boolean;
}

export const ENVIOS_POR_DEFECTO: EnviosMeta = { catalogo: true, compras: true };

/** Lee `settings.meta_envios` con los valores por defecto (todo lo que hoy se envía, sigue). */
export function leerEnviosMeta(settings: unknown): EnviosMeta {
  const s = settings && typeof settings === 'object' && !Array.isArray(settings) ? (settings as Fila) : {};
  const e = s.meta_envios && typeof s.meta_envios === 'object' ? (s.meta_envios as Fila) : {};
  return {
    catalogo: e.catalogo !== false,
    compras: e.compras !== false,
  };
}

export interface ActivosMeta {
  autorizada: boolean;
  negocios: OpcionMeta[];
  cuentas: OpcionMeta[];
  catalogos: OpcionMeta[];
  pixeles: OpcionMeta[];
  seleccion: { negocio: string; cuenta: string; catalogo: string; pixel: string };
  envios: EnviosMeta;
  productosTienda: number | null;
}

async function conexionMeta(db: SupabaseClient, organizationId: number, id: string): Promise<Fila> {
  const { data, error } = await db
    .from('integration_connections')
    .select('id, organization_id, settings, connector:integration_connectors(code)')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error) throw new Error(`integration_connections: ${error.message}`);
  const f = data as Fila | null;
  const code = (f?.connector as Fila | undefined)?.code;
  if (!f || Number(f.organization_id) !== organizationId || code !== 'meta_marketing') {
    throw new ConexionError(404, 'NO_ENCONTRADA', 'Conexión no encontrada.');
  }
  return f;
}

export async function activosMeta(
  db: SupabaseClient,
  organizationId: number,
  conexionId: string,
  filtro: { negocio?: string | null; cuenta?: string | null } = {},
): Promise<ActivosMeta> {
  const c = await conexionMeta(db, organizationId, conexionId);
  const cred = await metaMarketingService.getCredentials(conexionId, db);
  const envios = leerEnviosMeta(c.settings);
  const vacio: ActivosMeta = {
    autorizada: false,
    negocios: [],
    cuentas: [],
    catalogos: [],
    pixeles: [],
    seleccion: { negocio: '', cuenta: '', catalogo: '', pixel: '' },
    envios,
    productosTienda: null,
  };
  if (!cred?.accessToken) return vacio;

  const negocios = (await metaMarketingService.getBusinessAccounts(cred.accessToken)).map((b) => ({ id: b.id, nombre: b.name }));
  const negocio = filtro.negocio && negocios.some((n) => n.id === filtro.negocio) ? filtro.negocio : cred.businessId || negocios[0]?.id || '';
  const cuentas = negocio
    ? (await metaMarketingService.getAdAccounts(cred.accessToken, negocio)).map((a) => ({ id: a.id, nombre: a.name, moneda: a.currency }))
    : [];
  const cuenta = filtro.cuenta && cuentas.some((a) => a.id === filtro.cuenta) ? filtro.cuenta : cred.adAccountId || cuentas[0]?.id || '';
  const [catalogos, pixeles] = await Promise.all([
    negocio ? metaMarketingService.listCatalogs(cred.accessToken, negocio) : Promise.resolve([]),
    cuenta ? metaMarketingService.listPixels(cred.accessToken, cuenta) : Promise.resolve([]),
  ]);

  let productosTienda: number | null = null;
  try {
    const dominio = await resolveOrgStoreDomain(db, organizationId);
    productosTienda = (await metaMarketingService.getProductsForSync(organizationId, dominio, undefined, db)).length;
  } catch {
    productosTienda = null;
  }

  return {
    autorizada: true,
    negocios,
    cuentas,
    catalogos: catalogos.map((x) => ({ id: x.id, nombre: x.name })),
    pixeles: pixeles.map((x) => ({ id: x.id, nombre: x.name })),
    seleccion: { negocio, cuenta, catalogo: cred.catalogId || '', pixel: cred.pixelId || '' },
    envios,
    productosTienda,
  };
}

export interface GuardarActivosMeta {
  negocio: string;
  cuenta: string;
  /** id existente o 'nuevo'. */
  catalogo: string;
  /** id existente o 'nuevo'. */
  pixel: string;
  envios: EnviosMeta;
}

export async function guardarActivosMeta(
  db: SupabaseClient,
  organizationId: number,
  conexionId: string,
  entrada: GuardarActivosMeta,
  nombreOrganizacion: string,
): Promise<{ catalogo: OpcionMeta; pixel: OpcionMeta }> {
  const c = await conexionMeta(db, organizationId, conexionId);
  const cred = await metaMarketingService.getCredentials(conexionId, db);
  if (!cred?.accessToken) throw new ConexionError(409, 'SIN_AUTORIZAR', 'Primero inicia sesión con Meta.');

  // Cada id elegido debe ser uno de los que Graph devuelve para ESTE token.
  const negocios = await metaMarketingService.getBusinessAccounts(cred.accessToken);
  if (!negocios.some((n) => n.id === entrada.negocio)) throw new ConexionError(400, 'NEGOCIO', 'Portafolio comercial no válido.');
  const cuentas = await metaMarketingService.getAdAccounts(cred.accessToken, entrada.negocio);
  if (!cuentas.some((a) => a.id === entrada.cuenta)) throw new ConexionError(400, 'CUENTA', 'Cuenta publicitaria no válida.');

  let catalogo: OpcionMeta;
  if (entrada.catalogo === 'nuevo') {
    const nuevo = await metaMarketingService.createCatalog(cred.accessToken, entrada.negocio, `GO Admin · ${nombreOrganizacion}`.slice(0, 100));
    catalogo = { id: nuevo.id, nombre: nuevo.name };
  } else {
    const encontrado = (await metaMarketingService.listCatalogs(cred.accessToken, entrada.negocio)).find((x) => x.id === entrada.catalogo);
    if (!encontrado) throw new ConexionError(400, 'CATALOGO', 'Catálogo no válido.');
    catalogo = { id: encontrado.id, nombre: encontrado.name };
  }

  let pixel: OpcionMeta;
  if (entrada.pixel === 'nuevo') {
    const nuevo = await metaMarketingService.createPixel(cred.accessToken, entrada.cuenta, `GO Admin · ${nombreOrganizacion}`.slice(0, 100));
    pixel = { id: nuevo.id, nombre: nuevo.name };
  } else {
    const encontrado = (await metaMarketingService.listPixels(cred.accessToken, entrada.cuenta)).find((x) => x.id === entrada.pixel);
    if (!encontrado) throw new ConexionError(400, 'PIXEL', 'Píxel no válido.');
    pixel = { id: encontrado.id, nombre: encontrado.name };
  }

  const ok = await metaMarketingService.saveCredentials(
    conexionId,
    {
      ...cred,
      businessId: entrada.negocio,
      adAccountId: entrada.cuenta,
      catalogId: catalogo.id,
      pixelId: pixel.id,
      // Al cambiar de catálogo el conjunto de productos anterior deja de servir.
      productSetId: catalogo.id === cred.catalogId ? cred.productSetId : '',
    },
    db,
  );
  if (!ok) throw new ConexionError(409, 'PENDIENTE_ACTIVAR', 'No se pudieron guardar los activos de Meta (pendiente de activar la migración de credenciales).');

  const settings = c.settings && typeof c.settings === 'object' && !Array.isArray(c.settings) ? (c.settings as Fila) : {};
  const { error } = await db
    .from('integration_connections')
    .update({ settings: { ...settings, meta_envios: { catalogo: entrada.envios.catalogo, compras: entrada.envios.compras } }, updated_at: new Date().toISOString() })
    .eq('id', conexionId)
    .eq('organization_id', organizationId);
  if (error) throw new Error(`integration_connections: ${error.message}`);
  return { catalogo, pixel };
}

/** «Qué se envía» de una conexión de Meta (por defecto, todo lo de hoy). */
export async function enviosDeConexion(db: SupabaseClient, connectionId: string): Promise<EnviosMeta> {
  const { data } = await db.from('integration_connections').select('settings').eq('id', connectionId).maybeSingle();
  return leerEnviosMeta((data as Fila | null)?.settings);
}
