/**
 * Integraciones › Conexiones en el SERVIDOR (Frente INT, 2026-11-07).
 *
 * Todo recibe la organización YA resuelta por la sesión (`withOrg`) y un cliente service role
 * creado DESPUÉS de esa resolución; cada consulta filtra por esa organización. Nunca se devuelve
 * un secreto: las credenciales salen como prefijo/últimos 4 (`key_prefix`).
 *
 * Lo que NO hace, a propósito:
 *  - no muda secretos existentes ni reescribe las filas de Wompi de las organizaciones que ya
 *    cobran (solo «Reemplazar llave», a petición del administrador, actualiza en sitio);
 *  - «Probar» nunca cambia `status` (antes `wompiService.healthCheck` ponía `error` ante un fallo
 *    de red, y `resolverConexionDeCobro` dejaba de encontrar la conexión: el POS dejaba de cobrar).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { entradaRegistro } from '@/lib/integrations/core/registro';
import { construirCatalogo, conexionConProblemas, type ItemCatalogo } from './catalogoConexiones';
import { LLAVES, validarFormatoLlaves, type Ambiente, type ErrorFormato, type ProveedorLlaves } from './definicionesLlaves';
import { probarLlaves, type CuentaVerificada, type Prueba } from './probadoresLlaves.server';
import { enmascararSecreto, esReferenciaDeBoveda, resolverSecretos } from './secretosConexion';
import { hostPrincipalVerificado, usaDominioDeTienda, webhookDeConexion, type OrigenWebhook, type WebhookDeConexion } from './urlsWebhook';

type Fila = Record<string, unknown>;

export class ConexionError extends Error {
  constructor(public readonly status: number, public readonly codigo: string, message: string, public readonly extra?: Record<string, unknown>) {
    super(message);
    this.name = 'ConexionError';
  }
}

export interface Actor {
  organizationId: number;
  userId: string;
}

const texto = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));
const fila = (v: unknown): Fila => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Fila) : {});

// ─── Lecturas de la base ─────────────────────────────────────────────────────

/**
 * URL de eventos que se muestra para pegar en el proveedor. Para Wompi es la del dominio
 * principal verificado de ESTA organización (la tienda reenvía al ERP lo que no es suyo); sin
 * dominio, o si la consulta falla, la del ERP de siempre. La organización llega de la sesión.
 */
async function webhookParaOrganizacion(db: SupabaseClient, organizationId: number, connectorCode: string | null): Promise<WebhookDeConexion> {
  if (!usaDominioDeTienda(connectorCode)) return webhookDeConexion(connectorCode, null);
  const { data, error } = await db
    .from('organization_domains')
    .select('host, domain_type, status, is_primary, is_active, updated_at')
    .eq('organization_id', organizationId)
    .eq('is_primary', true)
    .eq('is_active', true)
    .eq('status', 'verified');
  if (error) {
    console.warn('[conexiones] organization_domains: sin dominio para la URL de eventos; se muestra la del ERP', error.message);
    return webhookDeConexion(connectorCode, null);
  }
  const filas = ((data as Fila[] | null) ?? []).map((d) => ({
    host: texto(d.host),
    domain_type: texto(d.domain_type),
    status: texto(d.status),
    is_primary: d.is_primary === true,
    is_active: d.is_active === true,
    updated_at: (d.updated_at as string | null) ?? null,
  }));
  return webhookDeConexion(connectorCode, hostPrincipalVerificado(filas));
}

interface ConectorFila {
  id: string;
  code: string;
  name: string;
  provider_code: string;
  provider_name: string;
  category: string;
  is_active: boolean;
}

async function conectores(db: SupabaseClient): Promise<ConectorFila[]> {
  const { data, error } = await db
    .from('integration_connectors')
    .select('id, code, name, is_active, provider:integration_providers(code, name, category)');
  if (error) throw new Error(`integration_connectors: ${error.message}`);
  return ((data as Fila[] | null) ?? []).map((c) => {
    const p = fila(c.provider);
    return {
      id: texto(c.id),
      code: texto(c.code),
      name: texto(c.name),
      is_active: c.is_active !== false,
      provider_code: texto(p.code),
      provider_name: texto(p.name),
      category: texto(p.category),
    };
  });
}

export interface ConexionResumen {
  id: string;
  nombre: string;
  proveedor: string;
  proveedorNombre: string;
  conector: string;
  ambiente: string;
  estado: string;
  sucursalId: number | null;
  ultimaPrueba: string | null;
  ultimoError: string | null;
  errores24h: number;
  creada: string | null;
  /** Primera credencial enmascarada (p. ej. «Llaves ··a91f»). */
  credencial: string | null;
  usadaPor: { tipo: 'metodo_pago'; codigo: string; tienda: boolean }[];
  /** Con quién quedó conectada según el proveedor («Conectado como …»). */
  conectadoComo: string | null;
  eventos24h: number;
  necesitaAtencion: boolean;
}

async function conexionesDeLaOrganizacion(db: SupabaseClient, organizationId: number): Promise<Fila[]> {
  const { data, error } = await db
    .from('integration_connections')
    .select('id, organization_id, connector_id, branch_id, name, environment, status, settings, last_health_check_at, last_error_at, last_error_message, error_count_24h, connected_at, created_at')
    .eq('organization_id', organizationId)
    .neq('status', 'revoked')
    .order('created_at', { ascending: false });
  if (error) throw new Error(`integration_connections: ${error.message}`);
  return ((data as Fila[] | null) ?? []).filter((c) => Number(c.organization_id) === organizationId);
}

async function usosPorConexion(db: SupabaseClient, organizationId: number): Promise<Map<string, ConexionResumen['usadaPor']>> {
  const { data, error } = await db
    .from('organization_payment_methods')
    .select('payment_method_code, integration_connection_id, is_active, show_on_website')
    .eq('organization_id', organizationId)
    .eq('is_active', true);
  if (error) throw new Error(`organization_payment_methods: ${error.message}`);
  const mapa = new Map<string, ConexionResumen['usadaPor']>();
  for (const m of (data as Fila[] | null) ?? []) {
    const id = texto(m.integration_connection_id);
    if (!id) continue;
    const lista = mapa.get(id) ?? [];
    lista.push({ tipo: 'metodo_pago', codigo: texto(m.payment_method_code), tienda: m.show_on_website === true });
    mapa.set(id, lista);
  }
  return mapa;
}

async function eventosRecientes(db: SupabaseClient, ids: string[]): Promise<Map<string, number>> {
  const mapa = new Map<string, number>();
  if (ids.length === 0) return mapa;
  const desde = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data, error } = await db
    .from('integration_events')
    .select('connection_id')
    .in('connection_id', ids)
    .gte('created_at', desde)
    .limit(5000);
  if (error) throw new Error(`integration_events: ${error.message}`);
  for (const e of (data as Fila[] | null) ?? []) mapa.set(texto(e.connection_id), (mapa.get(texto(e.connection_id)) ?? 0) + 1);
  return mapa;
}

async function primeraCredencial(db: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  if (ids.length === 0) return mapa;
  const { data, error } = await db
    .from('integration_credentials')
    .select('connection_id, purpose, key_prefix, status')
    .in('connection_id', ids)
    .eq('status', 'active');
  if (error) throw new Error(`integration_credentials: ${error.message}`);
  for (const c of (data as Fila[] | null) ?? []) {
    const id = texto(c.connection_id);
    if (!mapa.has(id) && c.key_prefix) mapa.set(id, texto(c.key_prefix));
  }
  return mapa;
}

export async function listarConexiones(db: SupabaseClient, organizationId: number): Promise<ConexionResumen[]> {
  const [lista, cons, usos] = await Promise.all([
    conexionesDeLaOrganizacion(db, organizationId),
    conectores(db),
    usosPorConexion(db, organizationId),
  ]);
  const porId = new Map(cons.map((c) => [c.id, c]));
  const ids = lista.map((c) => texto(c.id));
  const [eventos, creds] = await Promise.all([eventosRecientes(db, ids), primeraCredencial(db, ids)]);
  // Los borradores también se listan (p. ej. los importados por CSV): se ven «Borrador» y se
  // completan con su asistente.
  return lista
    .map((c) => {
      const con = porId.get(texto(c.connector_id));
      const id = texto(c.id);
      const resumen: ConexionResumen = {
        id,
        nombre: texto(c.name),
        proveedor: con?.provider_code ?? '',
        proveedorNombre: con?.provider_name ?? '',
        conector: con?.code ?? '',
        ambiente: texto(c.environment),
        estado: texto(c.status),
        sucursalId: c.branch_id == null ? null : Number(c.branch_id),
        ultimaPrueba: (c.last_health_check_at as string | null) ?? null,
        ultimoError: (c.last_error_message as string | null) ?? null,
        errores24h: Number(c.error_count_24h ?? 0),
        creada: (c.created_at as string | null) ?? null,
        credencial: creds.get(id) ?? null,
        usadaPor: usos.get(id) ?? [],
        conectadoComo: cuentaDeSettings(c.settings)?.nombre ?? null,
        eventos24h: eventos.get(id) ?? 0,
        necesitaAtencion: false,
      };
      resumen.necesitaAtencion = conexionConProblemas({ status: resumen.estado, error_count_24h: resumen.errores24h });
      return resumen;
    });
}

/** Conectores activos para la importación por CSV (id y nombre; nada secreto). */
export async function conectoresImportables(db: SupabaseClient): Promise<{ id: string; nombre: string }[]> {
  return (await conectores(db))
    .filter((c) => c.is_active)
    .map((c) => ({ id: c.id, nombre: c.provider_name ? `${c.provider_name} · ${c.name}` : c.name }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

/** Apps OAuth configuradas en el servidor (sin revelar valores). */
export function oauthConfigurado(): Record<'meta' | 'tiktok' | 'google_ads', boolean> {
  const hay = (...vars: string[]) => vars.every((v) => !!process.env[v]) && !!process.env.NEXT_PUBLIC_APP_URL;
  return {
    meta: hay('META_APP_ID', 'META_APP_SECRET'),
    tiktok: hay('TIKTOK_APP_ID'),
    google_ads: hay('GOOGLE_ADS_CLIENT_ID', 'GOOGLE_ADS_CLIENT_SECRET'),
  };
}

export async function catalogo(db: SupabaseClient, organizationId: number): Promise<ItemCatalogo[]> {
  const [cons, lista, provs] = await Promise.all([
    conectores(db),
    conexionesDeLaOrganizacion(db, organizationId),
    db.from('integration_providers').select('code, name, category, is_active'),
  ]);
  if (provs.error) throw new Error(`integration_providers: ${provs.error.message}`);
  const porId = new Map(cons.map((c) => [c.id, c]));
  return construirCatalogo({
    proveedores: ((provs.data as Fila[] | null) ?? []).map((p) => ({
      code: texto(p.code),
      name: texto(p.name),
      category: texto(p.category),
      is_active: p.is_active !== false,
    })),
    conectores: cons.map((c) => ({ code: c.code, provider_code: c.provider_code, is_active: c.is_active })),
    conexiones: lista.map((c) => ({
      id: texto(c.id),
      connector_code: porId.get(texto(c.connector_id))?.code ?? '',
      status: texto(c.status),
      error_count_24h: Number(c.error_count_24h ?? 0),
      last_error_at: (c.last_error_at as string | null) ?? null,
      connected_at: (c.connected_at as string | null) ?? null,
    })),
    estadoLogistica: (code) => entradaRegistro(code)?.estado ?? null,
    oauthConfigurado: oauthConfigurado(),
  });
}

// ─── Detalle ─────────────────────────────────────────────────────────────────

async function conexionPropia(db: SupabaseClient, organizationId: number, id: string): Promise<Fila> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ConexionError(404, 'NO_ENCONTRADA', 'Conexión no encontrada.');
  const { data, error } = await db
    .from('integration_connections')
    .select('id, organization_id, connector_id, branch_id, name, environment, status, settings, last_health_check_at, last_error_at, last_error_message, error_count_24h, connected_at, created_at, created_by')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error) throw new Error(`integration_connections: ${error.message}`);
  if (!data || Number((data as Fila).organization_id) !== organizationId) {
    throw new ConexionError(404, 'NO_ENCONTRADA', 'Conexión no encontrada.');
  }
  return data as Fila;
}

export interface EventoResumen {
  id: string;
  conexionId: string;
  creado: string;
  tipo: string;
  sentido: 'inbound' | 'outbound';
  estado: string;
  origen: string;
  error: string | null;
  referencia: string | null;
}

function resumirEvento(e: Fila): EventoResumen {
  const payload = fila(e.payload);
  const tx = fila(fila(payload.data).transaction);
  return {
    id: texto(e.id),
    conexionId: texto(e.connection_id),
    creado: texto(e.created_at),
    tipo: texto(e.event_type),
    sentido: e.direction === 'outbound' ? 'outbound' : 'inbound',
    estado: texto(e.status),
    origen: texto(e.source),
    error: (e.error_message as string | null) ?? null,
    // Solo la referencia de negocio; nunca el payload completo (puede traer datos del pagador).
    referencia: texto(tx.reference) || texto(payload.reference) || texto(e.external_event_id) || null,
  };
}

export async function detalleConexion(db: SupabaseClient, organizationId: number, id: string) {
  const c = await conexionPropia(db, organizationId, id);
  const [cons, usos, credsRes, eventosRes] = await Promise.all([
    conectores(db),
    usosPorConexion(db, organizationId),
    db.from('integration_credentials').select('purpose, credential_type, key_prefix, secret_ref, rotated_at, updated_at, created_at, status').eq('connection_id', id).eq('status', 'active'),
    db.from('integration_events').select('id, connection_id, created_at, event_type, direction, status, source, error_message, external_event_id, payload').eq('connection_id', id).order('created_at', { ascending: false }).limit(10),
  ]);
  if (credsRes.error) throw new Error(`integration_credentials: ${credsRes.error.message}`);
  if (eventosRes.error) throw new Error(`integration_events: ${eventosRes.error.message}`);
  const con = cons.find((x) => x.id === texto(c.connector_id));
  const settings = fila(c.settings);
  const webhook = await webhookParaOrganizacion(db, organizationId, con?.code ?? null);
  return {
    conexion: {
      id,
      nombre: texto(c.name),
      proveedor: con?.provider_code ?? '',
      proveedorNombre: con?.provider_name ?? '',
      conector: con?.code ?? '',
      conectorNombre: con?.name ?? '',
      ambiente: texto(c.environment),
      estado: texto(c.status),
      sucursalId: c.branch_id == null ? null : Number(c.branch_id),
      ultimaPrueba: (c.last_health_check_at as string | null) ?? null,
      ultimoError: (c.last_error_message as string | null) ?? null,
      ultimoErrorEn: (c.last_error_at as string | null) ?? null,
      errores24h: Number(c.error_count_24h ?? 0),
      conectadaEn: (c.connected_at as string | null) ?? null,
      creada: (c.created_at as string | null) ?? null,
      // Ajustes no secretos que la UI muestra (nunca credenciales).
      ajustes: {
        hotelId: texto(settings.hotel_id) || null,
        propertyId: texto(settings.property_id) || null,
        modo: texto(settings.modo) || null,
      },
      cuentaVerificada: cuentaDeSettings(c.settings),
    },
    credenciales: ((credsRes.data as Fila[] | null) ?? []).map((k) => ({
      proposito: texto(k.purpose),
      tipo: texto(k.credential_type),
      mascara: texto(k.key_prefix) || null,
      enBoveda: esReferenciaDeBoveda(k.secret_ref),
      actualizada: (k.rotated_at as string | null) ?? (k.updated_at as string | null) ?? (k.created_at as string | null) ?? null,
    })),
    usadaPor: usos.get(id) ?? [],
    eventos: ((eventosRes.data as Fila[] | null) ?? []).map(resumirEvento),
    webhookUrl: webhook.url,
    webhookOrigen: webhook.origen,
    webhookSinDominio: webhook.sinDominioVerificado,
    asistenteLlaves: (Object.values(LLAVES).find((d) => d.conector === con?.code)?.proveedor ?? null) as ProveedorLlaves | null,
  };
}

// ─── Actividad ───────────────────────────────────────────────────────────────

export async function listarEventos(
  db: SupabaseClient,
  organizationId: number,
  filtros: { conexionId?: string | null; soloErrores?: boolean; desde?: string | null; limite?: number },
): Promise<{ eventos: EventoResumen[]; errores: number }> {
  const propias = (await conexionesDeLaOrganizacion(db, organizationId)).map((c) => texto(c.id));
  const ids = filtros.conexionId ? propias.filter((i) => i === filtros.conexionId) : propias;
  if (ids.length === 0) return { eventos: [], errores: 0 };
  let q = db
    .from('integration_events')
    .select('id, connection_id, created_at, event_type, direction, status, source, error_message, external_event_id, payload')
    .in('connection_id', ids)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(filtros.limite ?? 100, 1), 300));
  if (filtros.soloErrores) q = q.eq('status', 'error');
  if (filtros.desde) q = q.gte('created_at', filtros.desde);
  const { data, error } = await q;
  if (error) throw new Error(`integration_events: ${error.message}`);
  const eventos = ((data as Fila[] | null) ?? []).map(resumirEvento);
  const desde30 = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
  const { data: errs } = await db.from('integration_events').select('id').in('connection_id', ids).eq('status', 'error').gte('created_at', desde30).limit(1000);
  return { eventos, errores: ((errs as Fila[] | null) ?? []).length };
}

// ─── Cuenta verificada («Conectado como …») ──────────────────────────────────

/** Lee `settings.cuenta_verificada` (sin secretos; lo escribe el servidor tras una prueba correcta). */
export function cuentaDeSettings(settings: unknown): (CuentaVerificada & { verificadaEn?: string | null }) | null {
  const c = fila(fila(settings).cuenta_verificada);
  const nombre = texto(c.nombre).trim();
  if (!nombre) return null;
  const opcional = (v: unknown) => (texto(v).trim() || null);
  return {
    nombre,
    razonSocial: opcional(c.razonSocial),
    documento: opcional(c.documento),
    correo: opcional(c.correo),
    pais: opcional(c.pais),
    ambiente: c.ambiente === 'production' || c.ambiente === 'sandbox' ? c.ambiente : null,
    metodos: Array.isArray(c.metodos) ? (c.metodos as unknown[]).map(texto).filter(Boolean) : [],
    idExterno: opcional(c.idExterno),
    verificadaEn: opcional(c.verificadaEn),
  };
}

/** Guarda con quién quedó conectada la conexión, fusionando `settings` (nunca lo pisa). */
async function guardarCuentaVerificada(db: SupabaseClient, organizationId: number, connectionId: string, cuenta: CuentaVerificada | undefined): Promise<void> {
  if (!cuenta) return;
  const { data } = await db.from('integration_connections').select('settings').eq('id', connectionId).eq('organization_id', organizationId).maybeSingle();
  const settings = fila((data as Fila | null)?.settings);
  await db
    .from('integration_connections')
    .update({ settings: { ...settings, cuenta_verificada: { ...cuenta, verificadaEn: new Date().toISOString() } } })
    .eq('id', connectionId)
    .eq('organization_id', organizationId);
}

// ─── Probar ──────────────────────────────────────────────────────────────────

async function registrarEvento(db: SupabaseClient, organizationId: number, connectionId: string, tipo: string, prueba: Prueba): Promise<void> {
  const ok = prueba.resultado === 'correcta';
  await db.from('integration_events').insert({
    connection_id: connectionId,
    organization_id: organizationId,
    source: 'manual',
    direction: 'outbound',
    event_type: tipo,
    payload: { resultado: prueba.resultado, http: prueba.http ?? null, verificado: prueba.verificado },
    status: ok ? 'processed' : 'error',
    processed_at: new Date().toISOString(),
    error_message: ok ? null : `prueba:${prueba.resultado}${prueba.http ? ` (HTTP ${prueba.http})` : ''}`,
  });
}

/**
 * «Probar» de una conexión existente. Lee las llaves en sus dos formas (en claro o bóveda),
 * llama al proveedor y deja un evento. Solo toca `last_health_check_at` y, si falla,
 * `last_error_*`; NUNCA `status`.
 */
export async function probarConexion(db: SupabaseClient, actor: Actor, id: string): Promise<Prueba & { proveedor: string }> {
  const c = await conexionPropia(db, actor.organizationId, id);
  const con = (await conectores(db)).find((x) => x.id === texto(c.connector_id));
  const def = Object.values(LLAVES).find((d) => d.conector === con?.code);
  let prueba: Prueba;
  if (!def) {
    prueba = { resultado: 'sin_prueba', verificado: [] };
  } else {
    const { data, error } = await db.from('integration_credentials').select('purpose, secret_ref').eq('connection_id', id).eq('status', 'active');
    if (error) throw new Error(`integration_credentials: ${error.message}`);
    const valores = await resolverSecretos(db, id, ((data as Fila[] | null) ?? []).map((r) => ({ purpose: texto(r.purpose), secret_ref: texto(r.secret_ref) })));
    const ambiente: Ambiente = texto(c.environment) === 'production' ? 'production' : 'sandbox';
    prueba = await probarLlaves(def.proveedor, ambiente, valores);
  }
  const ahora = new Date().toISOString();
  if (prueba.resultado !== 'sin_prueba') {
    const cambios: Fila = { last_health_check_at: ahora, updated_at: ahora };
    if (prueba.resultado !== 'correcta') {
      cambios.last_error_at = ahora;
      cambios.last_error_message = `Prueba: ${prueba.resultado}${prueba.http ? ` (HTTP ${prueba.http})` : ''}`;
    } else {
      cambios.last_error_message = null;
    }
    await db.from('integration_connections').update(cambios).eq('id', id).eq('organization_id', actor.organizationId);
    if (prueba.resultado === 'correcta') await guardarCuentaVerificada(db, actor.organizationId, id, prueba.cuenta);
    await registrarEvento(db, actor.organizationId, id, 'prueba_de_conexion', prueba);
  }
  return { ...prueba, proveedor: con?.provider_code ?? '' };
}

// ─── Guardar llaves (asistente «llaves») ─────────────────────────────────────

export interface GuardarLlaves {
  proveedor: ProveedorLlaves;
  ambiente: Ambiente;
  valores: Record<string, string>;
  /** Reemplazar las llaves de una conexión existente («Reemplazar llave»). */
  conexionId?: string | null;
  nombre?: string | null;
  sucursalId?: number | null;
}

async function conectorPorCodigo(db: SupabaseClient, code: string): Promise<string> {
  const { data, error } = await db.from('integration_connectors').select('id, code, is_active').eq('code', code).maybeSingle();
  if (error) throw new Error(`integration_connectors: ${error.message}`);
  if (!data || (data as Fila).is_active === false) throw new ConexionError(409, 'SIN_CONECTOR', 'El proveedor no está disponible.');
  return texto((data as Fila).id);
}

async function escribirComoHoy(db: SupabaseClient, connectionId: string, def: (typeof LLAVES)[ProveedorLlaves], valores: Record<string, string>): Promise<void> {
  const ahora = new Date().toISOString();
  for (const campo of def.campos) {
    const valor = (valores[campo.proposito] ?? '').trim();
    if (!valor) continue;
    const mascara = campo.secreto ? enmascararSecreto(valor) : valor.length > 24 ? enmascararSecreto(valor) : valor;
    const { data: previa, error: errPrevia } = await db
      .from('integration_credentials')
      .select('id')
      .eq('connection_id', connectionId)
      .eq('purpose', campo.proposito)
      .eq('status', 'active')
      .limit(1);
    if (errPrevia) throw new Error(`integration_credentials: ${errPrevia.message}`);
    const existente = ((previa as Fila[] | null) ?? [])[0];
    const res = existente
      ? await db.from('integration_credentials').update({ secret_ref: valor, key_prefix: mascara, rotated_at: ahora, updated_at: ahora }).eq('id', texto(existente.id))
      : await db.from('integration_credentials').insert({
          connection_id: connectionId,
          credential_type: campo.tipoCredencial,
          purpose: campo.proposito,
          secret_ref: valor,
          key_prefix: mascara,
          status: 'active',
          rotated_at: ahora,
        });
    if (res.error) {
      // 23514: el CHECK de `purpose` aún no admite este propósito (migración 20261108090000 sin aplicar).
      if ((res.error as { code?: string }).code === '23514') {
        throw new ConexionError(409, 'PENDIENTE_ACTIVAR', 'Este proveedor queda listo cuando se active la migración de credenciales.');
      }
      throw new Error(`integration_credentials (${campo.proposito}): ${res.error.message}`);
    }
  }
}

async function escribirEnBoveda(db: SupabaseClient, connectionId: string, def: (typeof LLAVES)[ProveedorLlaves], valores: Record<string, string>): Promise<void> {
  for (const campo of def.campos) {
    const valor = (valores[campo.proposito] ?? '').trim();
    if (!valor) continue;
    const { error } = await db.rpc('fn_set_provider_secret', { p_connection_id: connectionId, p_purpose: campo.proposito, p_value: valor, p_credential_type: campo.tipoCredencial });
    if (error) throw new Error(`fn_set_provider_secret (${campo.proposito}): ${error.message}`);
    await db.from('integration_credentials').update({ key_prefix: enmascararSecreto(valor) }).eq('connection_id', connectionId).eq('purpose', campo.proposito);
  }
}

/**
 * Prueba las llaves contra el proveedor y, SOLO si responde que son correctas, las guarda.
 * Llaves rechazadas o sin respuesta → no se guarda nada (la UI muestra 85-08).
 */
export interface ResultadoGuardarLlaves {
  conexionId: string;
  prueba: Prueba;
  webhookUrl: string | null;
  webhookOrigen: OrigenWebhook | null;
  /** Wompi sin dominio principal verificado: se muestra la URL del ERP y la UI explica por qué. */
  webhookSinDominio: boolean;
}

export async function guardarLlaves(db: SupabaseClient, actor: Actor, entrada: GuardarLlaves): Promise<ResultadoGuardarLlaves> {
  const def = LLAVES[entrada.proveedor];
  if (!def.ambientes.includes(entrada.ambiente)) throw new ConexionError(400, 'AMBIENTE', 'Ambiente no disponible para este proveedor.');
  const errores: ErrorFormato[] = validarFormatoLlaves(entrada.proveedor, entrada.ambiente, entrada.valores);
  if (errores.length > 0) throw new ConexionError(400, 'FORMATO', 'Revisa el formato de las llaves.', { errores });

  let conexionId = entrada.conexionId ?? null;
  if (conexionId) {
    const c = await conexionPropia(db, actor.organizationId, conexionId);
    const con = (await conectores(db)).find((x) => x.id === texto(c.connector_id));
    if (con?.code !== def.conector) throw new ConexionError(404, 'NO_ENCONTRADA', 'Conexión no encontrada.');
    if (texto(c.environment) !== entrada.ambiente) throw new ConexionError(400, 'AMBIENTE', 'Las llaves nuevas deben ser del mismo ambiente de la conexión.');
  }

  const prueba = await probarLlaves(entrada.proveedor, entrada.ambiente, entrada.valores);
  if (prueba.resultado !== 'correcta') {
    if (conexionId) await registrarEvento(db, actor.organizationId, conexionId, 'prueba_de_llaves_nuevas', prueba);
    return { conexionId: conexionId ?? '', prueba, webhookUrl: null, webhookOrigen: null, webhookSinDominio: false };
  }

  const ahora = new Date().toISOString();
  if (!conexionId) {
    const connectorId = await conectorPorCodigo(db, def.conector);
    const base = (entrada.nombre ?? '').trim().slice(0, 80) || `${entrada.proveedor} · ${entrada.ambiente === 'production' ? 'producción' : 'pruebas'}`;
    // `(organization_id, name)` es único: se numera si ya existe.
    let nombre = base;
    for (let n = 2; n < 20; n += 1) {
      const { data: dup } = await db.from('integration_connections').select('id').eq('organization_id', actor.organizationId).eq('name', nombre).limit(1);
      if (((dup as Fila[] | null) ?? []).length === 0) break;
      nombre = `${base} (${n})`;
    }
    // Se crea en borrador: pasa a `connected` solo cuando las llaves quedaron guardadas.
    const { data, error } = await db
      .from('integration_connections')
      .insert({
        organization_id: actor.organizationId,
        connector_id: connectorId,
        branch_id: entrada.sucursalId ?? null,
        name: nombre,
        environment: entrada.ambiente,
        country_code: 'CO',
        status: 'draft',
        settings: {},
        created_by: actor.userId,
      })
      .select('id')
      .single();
    if (error || !data) throw new Error(`integration_connections: ${error?.message ?? 'sin fila'}`);
    conexionId = texto((data as Fila).id);
  }

  try {
    if (def.guardado === 'boveda') await escribirEnBoveda(db, conexionId, def, entrada.valores);
    else await escribirComoHoy(db, conexionId, def, entrada.valores);
  } catch (err) {
    if (!entrada.conexionId) await db.from('integration_connections').delete().eq('id', conexionId).eq('organization_id', actor.organizationId).eq('status', 'draft');
    throw err;
  }

  await db
    .from('integration_connections')
    .update({ status: 'connected', connected_at: ahora, last_health_check_at: ahora, last_error_message: null, updated_at: ahora })
    .eq('id', conexionId)
    .eq('organization_id', actor.organizationId);
  await guardarCuentaVerificada(db, actor.organizationId, conexionId, prueba.cuenta);
  await registrarEvento(db, actor.organizationId, conexionId, entrada.conexionId ? 'llaves_reemplazadas' : 'prueba_de_conexion', prueba);
  const webhook = await webhookParaOrganizacion(db, actor.organizationId, def.conector);
  return { conexionId, prueba, webhookUrl: webhook.url, webhookOrigen: webhook.origen, webhookSinDominio: webhook.sinDominioVerificado };
}

// ─── Dónde se usa (paso 5) ───────────────────────────────────────────────────

export interface Uso {
  tienda: boolean;
  pos: boolean;
  /** Sucursales donde se ofrece; vacío = todas. */
  sucursales: number[];
}

/**
 * Enlaza la conexión al método de pago del proveedor SIN tocar los demás métodos ni los demás
 * ajustes del método: `settings` se fusiona (antes se sobrescribía entero) y un método ya
 * enlazado a OTRA conexión no se roba (409).
 */
export async function enlazarUso(db: SupabaseClient, actor: Actor, id: string, uso: Uso): Promise<{ metodo: string; creado: boolean }> {
  const c = await conexionPropia(db, actor.organizationId, id);
  const con = (await conectores(db)).find((x) => x.id === texto(c.connector_id));
  const def = Object.values(LLAVES).find((d) => d.conector === con?.code);
  if (!def?.metodoPago) throw new ConexionError(400, 'SIN_METODO', 'Esta conexión no cobra pagos.');
  const codigo = def.metodoPago;

  const { data: sucursales, error: errSuc } = await db.from('branches').select('id').eq('organization_id', actor.organizationId);
  if (errSuc) throw new Error(`branches: ${errSuc.message}`);
  const validas = new Set(((sucursales as Fila[] | null) ?? []).map((b) => Number(b.id)));
  if (uso.sucursales.some((b) => !validas.has(b))) throw new ConexionError(404, 'SUCURSAL', 'Sucursal no encontrada.');

  const { data: existentes, error } = await db
    .from('organization_payment_methods')
    .select('id, integration_connection_id, settings, branch_ids')
    .eq('organization_id', actor.organizationId)
    .eq('payment_method_code', codigo)
    .limit(1);
  if (error) throw new Error(`organization_payment_methods: ${error.message}`);
  const actual = ((existentes as Fila[] | null) ?? [])[0];
  const ahora = new Date().toISOString();
  const ajustes = (previos: unknown) => ({ ...fila(previos), gateway: con?.provider_name ?? def.proveedor, usar_en_pos: uso.pos });
  if (actual) {
    const enlazada = texto(actual.integration_connection_id);
    if (enlazada && enlazada !== id) {
      throw new ConexionError(409, 'METODO_EN_USO', 'El método de pago ya cobra con otra conexión. Cámbialo en Finanzas › Métodos de pago.');
    }
    const { error: e2 } = await db
      .from('organization_payment_methods')
      .update({
        integration_connection_id: id,
        is_active: true,
        show_on_website: uso.tienda,
        branch_ids: uso.sucursales.length ? uso.sucursales : null,
        settings: ajustes(actual.settings),
        updated_at: ahora,
      })
      .eq('id', Number(actual.id))
      .eq('organization_id', actor.organizationId);
    if (e2) throw new Error(`organization_payment_methods: ${e2.message}`);
    return { metodo: codigo, creado: false };
  }
  const { error: e3 } = await db.from('organization_payment_methods').insert({
    organization_id: actor.organizationId,
    payment_method_code: codigo,
    integration_connection_id: id,
    is_active: true,
    show_on_website: uso.tienda,
    branch_ids: uso.sucursales.length ? uso.sucursales : null,
    settings: ajustes({}),
    created_at: ahora,
    updated_at: ahora,
  });
  if (e3) throw new Error(`organization_payment_methods: ${e3.message}`);
  return { metodo: codigo, creado: true };
}

// ─── Pausar / reanudar / desconectar ─────────────────────────────────────────

export async function cambiarEstado(db: SupabaseClient, actor: Actor, id: string, accion: 'pausar' | 'reanudar' | 'desconectar'): Promise<{ estado: string }> {
  const c = await conexionPropia(db, actor.organizationId, id);
  const actual = texto(c.status);
  const destino = accion === 'pausar' ? 'paused' : accion === 'reanudar' ? 'connected' : 'revoked';
  if (accion === 'reanudar' && actual !== 'paused') throw new ConexionError(409, 'ESTADO', 'Solo se reanuda una conexión pausada.');
  if (accion === 'pausar' && actual !== 'connected' && actual !== 'error') throw new ConexionError(409, 'ESTADO', 'La conexión no está activa.');
  const { error } = await db
    .from('integration_connections')
    .update({ status: destino, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', actor.organizationId);
  if (error) throw new Error(`integration_connections: ${error.message}`);
  if (destino === 'revoked') {
    // Las credenciales quedan revocadas (no se borran: trazabilidad); los métodos de pago se
    // desenlazan sin tocar el resto de sus ajustes.
    await db.from('integration_credentials').update({ status: 'revoked', updated_at: new Date().toISOString() }).eq('connection_id', id);
    await db.from('organization_payment_methods').update({ integration_connection_id: null, updated_at: new Date().toISOString() }).eq('organization_id', actor.organizationId).eq('integration_connection_id', id);
  }
  return { estado: destino };
}

// ─── Borrar ──────────────────────────────────────────────────────────────────

/**
 * Borra una conexión. No se permite si un método de pago la usa (hay que desenlazarlo primero en
 * Finanzas › Métodos de pago) ni si ya tiene historia de dinero o envíos (cobros QR, guías): en
 * ese caso se ofrece «Desconectar», que revoca y conserva la historia. El borrado arrastra por
 * cascada credenciales, eventos, webhooks, trabajos y mapeos de la conexión.
 */
export async function eliminarConexion(db: SupabaseClient, actor: Actor, id: string): Promise<{ eliminada: true }> {
  await conexionPropia(db, actor.organizationId, id);

  const { data: metodos, error: errMetodos } = await db
    .from('organization_payment_methods')
    .select('payment_method_code')
    .eq('organization_id', actor.organizationId)
    .eq('integration_connection_id', id);
  if (errMetodos) throw new Error(`organization_payment_methods: ${errMetodos.message}`);
  const enUso = ((metodos as Fila[] | null) ?? []).map((m) => texto(m.payment_method_code));
  if (enUso.length > 0) {
    throw new ConexionError(409, 'EN_USO', 'Un método de pago usa esta conexión: desenlázalo primero en Finanzas › Métodos de pago.', { metodos: enUso });
  }

  for (const tabla of ['payment_qr_sessions', 'shipments'] as const) {
    const { data, error } = await db.from(tabla).select('id').eq('integration_connection_id', id).limit(1);
    if (error) throw new Error(`${tabla}: ${error.message}`);
    if (((data as Fila[] | null) ?? []).length > 0) {
      throw new ConexionError(409, 'CON_HISTORIA', 'La conexión ya tiene cobros o envíos registrados: desconéctala en lugar de borrarla para conservar la historia.');
    }
  }

  const { error } = await db.from('integration_connections').delete().eq('id', id).eq('organization_id', actor.organizationId);
  if (error) throw new Error(`integration_connections: ${error.message}`);
  return { eliminada: true };
}

// ─── Importar (CSV) ──────────────────────────────────────────────────────────

export interface FilaImportacion {
  nombre: string;
  sucursalId?: number | null;
  pais?: string | null;
  ambiente?: string | null;
}

export const MAX_FILAS_IMPORTACION = 200;

/**
 * Crea conexiones en BORRADOR (sin credenciales: se completan con su asistente) a partir de las
 * filas de un CSV. Valida conector activo, sucursales de la organización, ambiente y nombres
 * únicos. Devuelve el resultado por fila; nunca crea nada `connected`.
 */
export async function importarConexiones(
  db: SupabaseClient,
  actor: Actor,
  connectorId: string,
  filas: readonly FilaImportacion[],
): Promise<{ creadas: number; fallidas: number; errores: string[] }> {
  if (filas.length === 0 || filas.length > MAX_FILAS_IMPORTACION) {
    throw new ConexionError(400, 'FILAS', `El archivo debe traer entre 1 y ${MAX_FILAS_IMPORTACION} filas.`);
  }
  const { data: conector, error: errCon } = await db.from('integration_connectors').select('id, is_active').eq('id', connectorId).maybeSingle();
  if (errCon) throw new Error(`integration_connectors: ${errCon.message}`);
  if (!conector || (conector as Fila).is_active === false) throw new ConexionError(404, 'CONECTOR', 'Conector no encontrado.');

  const { data: sucursales, error: errSuc } = await db.from('branches').select('id').eq('organization_id', actor.organizationId);
  if (errSuc) throw new Error(`branches: ${errSuc.message}`);
  const validas = new Set(((sucursales as Fila[] | null) ?? []).map((b) => Number(b.id)));

  const { data: existentes } = await db.from('integration_connections').select('name').eq('organization_id', actor.organizationId);
  const nombres = new Set(((existentes as Fila[] | null) ?? []).map((c) => texto(c.name).toLocaleLowerCase('es')));

  const resultado = { creadas: 0, fallidas: 0, errores: [] as string[] };
  for (const [i, f] of filas.entries()) {
    const n = i + 2; // fila del archivo (la 1 es el encabezado)
    const nombre = f.nombre.trim().slice(0, 80);
    const ambiente = (f.ambiente ?? 'production').trim().toLowerCase();
    const fallo = (motivo: string) => {
      resultado.fallidas += 1;
      resultado.errores.push(`Fila ${n}: ${motivo}`);
    };
    if (!nombre) { fallo('falta el nombre'); continue; }
    if (nombres.has(nombre.toLocaleLowerCase('es'))) { fallo(`ya existe una conexión «${nombre}»`); continue; }
    if (!['production', 'sandbox', 'test'].includes(ambiente)) { fallo('ambiente inválido (production, sandbox o test)'); continue; }
    if (f.sucursalId != null && !validas.has(Number(f.sucursalId))) { fallo('la sucursal no es de la organización'); continue; }
    const pais = (f.pais ?? 'CO').trim().toUpperCase().slice(0, 2) || 'CO';
    const { error } = await db.from('integration_connections').insert({
      organization_id: actor.organizationId,
      connector_id: connectorId,
      branch_id: f.sucursalId ?? null,
      name: nombre,
      environment: ambiente,
      country_code: pais,
      status: 'draft',
      settings: {},
      created_by: actor.userId,
    });
    if (error) { fallo('no se pudo crear'); continue; }
    nombres.add(nombre.toLocaleLowerCase('es'));
    resultado.creadas += 1;
  }
  return resultado;
}

// ─── Ver una credencial (decisión del dueño, 2026-11-07) ─────────────────────

/**
 * Devuelve el valor de UNA credencial activa de la conexión para el botón «Ver»/«Copiar» del
 * detalle. El dueño decidió mantener las credenciales visibles y sin cifrar: el valor en claro
 * sale tal cual; las que ya estaban en la bóveda (OTA, logística) se leen con
 * `fn_get_provider_secret`. Cada lectura queda en `ops_audit_log` (quién, cuándo, cuál, desde qué
 * IP) ANTES de devolver el valor: si la auditoría falla, no se revela nada.
 * La ruta exige administración resuelta en el servidor (`withOrg({ admin: true })`).
 */
export async function revelarCredencial(
  db: SupabaseClient,
  actor: Actor,
  connectionId: string,
  proposito: string,
  ip: string | null,
): Promise<{ proposito: string; valor: string; origen: 'registro' | 'boveda' }> {
  const c = await conexionPropia(db, actor.organizationId, connectionId);
  const { data, error } = await db
    .from('integration_credentials')
    .select('id, purpose, secret_ref, status, created_at')
    .eq('connection_id', connectionId)
    .eq('purpose', proposito)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(`integration_credentials: ${error.message}`);
  const fila = ((data as Fila[] | null) ?? [])[0];
  if (!fila) throw new ConexionError(404, 'SIN_CREDENCIAL', 'Credencial no encontrada.');

  const ref = texto(fila.secret_ref);
  const deBoveda = esReferenciaDeBoveda(ref);
  const valor = deBoveda ? (await resolverSecretos(db, connectionId, [{ purpose: proposito, secret_ref: ref }]))[proposito] : ref;
  if (deBoveda && (!valor || valor === ref)) {
    throw new ConexionError(409, 'BOVEDA_SIN_VALOR', 'La bóveda no devolvió el valor de esta credencial.');
  }

  const { error: errAuditoria } = await db.from('ops_audit_log').insert({
    organization_id: actor.organizationId,
    branch_id: c.branch_id == null ? null : Number(c.branch_id),
    user_id: actor.userId,
    entity_type: 'integration_credential',
    entity_id: texto(fila.id),
    action: 'credential_revealed',
    ip_address: ip,
    metadata: { connection_id: connectionId, purpose: proposito, origen: deBoveda ? 'boveda' : 'registro' },
  });
  if (errAuditoria) {
    console.error('[conexiones] auditoría de «Ver credencial» falló; no se revela', errAuditoria.message);
    throw new ConexionError(503, 'AUDITORIA', 'No se pudo registrar la consulta; intenta de nuevo.');
  }
  return { proposito, valor, origen: deBoveda ? 'boveda' : 'registro' };
}
