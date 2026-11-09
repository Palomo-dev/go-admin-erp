/**
 * Desarrolladores (diseño 85-15): llaves de API y webhooks salientes, en el SERVIDOR.
 *
 * Llaves de API — antes `integrationsService.generateApiKey` usaba `Math.random` (predecible) y
 * `hashApiKey` una huella de 32 bits con `Date.now()` (ni siquiera reproducible). Ahora:
 *  - 32 bytes de `crypto.randomBytes` → `goak_<base64url>`;
 *  - se guarda SOLO `sha256` en hex (igual que `inboxConfigService.hashKey`) y una máscara con los
 *    últimos 4 (`goak_··3f2a`); la llave completa se devuelve una única vez.
 *
 * Webhooks salientes — antes «Probar» respondía 200 sin enviar nada. Ahora se envía un evento
 * `prueba` firmado (HMAC-SHA256 del cuerpo con el secreto del endpoint, cabecera
 * `X-GoAdmin-Signature: t=<unix>,v1=<hex>`), con tiempo máximo, sin seguir redirecciones y solo a
 * HTTPS públicos (se rechazan localhost, IP privadas, de enlace local y metadatos de nube: SSRF).
 */
import crypto from 'crypto';
import { lookup } from 'dns/promises';
import { isIP, type LookupFunction } from 'net';
import https from 'https';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ConexionError, type Actor } from './conexiones.server';
import { ALCANCES_LLAVE } from './alcancesLlave';
import { EVENTOS_WEBHOOK } from './eventosWebhook';

type Fila = Record<string, unknown>;
const texto = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));

// ─── Llaves de API ───────────────────────────────────────────────────────────

export const PREFIJO_LLAVE = 'goak_';

export function generarLlaveApi(aleatorio: (n: number) => Buffer = crypto.randomBytes): { llave: string; hash: string; mascara: string } {
  const llave = `${PREFIJO_LLAVE}${aleatorio(32).toString('base64url')}`;
  return { llave, hash: huellaLlave(llave), mascara: `${PREFIJO_LLAVE}··${llave.slice(-4)}` };
}

export function huellaLlave(llave: string): string {
  return crypto.createHash('sha256').update(llave, 'utf8').digest('hex');
}

/** Alcances admitidos: módulo puro compartido con el diálogo del navegador. */
export { ALCANCES_LLAVE };

/** Secreto de firma de webhook saliente con `crypto.randomBytes` (antes `Math.random`). */
export function generarSecretoWebhook(aleatorio: (n: number) => Buffer = crypto.randomBytes): string {
  return `whsec_${aleatorio(24).toString('base64url')}`;
}

export interface LlaveApiResumen {
  id: string;
  nombre: string;
  mascara: string;
  alcances: string[];
  ultimoUso: string | null;
  creada: string | null;
  expira: string | null;
  revocada: string | null;
  activa: boolean;
  /** Nombre de quien la creó (85-53: «Creada por …»); null si no se sabe o el miembro ya no existe. */
  creadaPor: string | null;
}

function resumirLlave(k: Fila, creadaPor: string | null = null): LlaveApiResumen {
  return {
    id: texto(k.id),
    nombre: texto(k.name),
    mascara: texto(k.key_prefix),
    alcances: Array.isArray(k.scopes) ? (k.scopes as unknown[]).map(texto) : [],
    ultimoUso: (k.last_used_at as string | null) ?? null,
    creada: (k.created_at as string | null) ?? null,
    expira: (k.expires_at as string | null) ?? null,
    revocada: (k.revoked_at as string | null) ?? null,
    activa: k.is_active !== false && !k.revoked_at,
    creadaPor,
  };
}

/**
 * Nombres de los miembros (`organization_members.id`) de la organización: «Nombre Apellido» del
 * perfil, o su correo si no tiene nombre. Solo miembros de `organizationId` (nunca de otra).
 */
async function nombresDeMiembros(db: SupabaseClient, organizationId: number, ids: readonly number[]): Promise<Map<number, string>> {
  const nombres = new Map<number, string>();
  const unicos = [...new Set(ids.filter((i) => Number.isInteger(i) && i > 0))];
  if (unicos.length === 0) return nombres;
  const { data: miembros } = await db.from('organization_members').select('id, user_id').eq('organization_id', organizationId).in('id', unicos);
  const filas = (miembros as Fila[] | null) ?? [];
  const usuarios = [...new Set(filas.map((m) => texto(m.user_id)).filter(Boolean))];
  if (usuarios.length === 0) return nombres;
  const { data: perfiles } = await db.from('profiles').select('id, first_name, last_name, email').in('id', usuarios);
  const porUsuario = new Map(((perfiles as Fila[] | null) ?? []).map((p) => [texto(p.id), `${texto(p.first_name)} ${texto(p.last_name)}`.trim() || texto(p.email)]));
  for (const m of filas) {
    const nombre = porUsuario.get(texto(m.user_id));
    if (nombre) nombres.set(Number(m.id), nombre);
  }
  return nombres;
}

export async function listarLlaves(db: SupabaseClient, organizationId: number): Promise<LlaveApiResumen[]> {
  const { data, error } = await db
    .from('channel_api_keys')
    .select('id, name, key_prefix, scopes, is_active, last_used_at, expires_at, created_at, revoked_at, created_by')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(`channel_api_keys: ${error.message}`);
  const filas = (data as Fila[] | null) ?? [];
  // El nombre de quien la creó es un adorno: si su lectura falla, la lista sale igual.
  const nombres = await nombresDeMiembros(db, organizationId, filas.map((k) => Number(k.created_by))).catch(() => new Map<number, string>());
  return filas.map((k) => resumirLlave(k, nombres.get(Number(k.created_by)) ?? null));
}

export async function crearLlave(
  db: SupabaseClient,
  actor: Actor & { memberId: number | null },
  entrada: { nombre: string; alcances: string[]; expira?: string | null },
): Promise<{ llave: LlaveApiResumen; completa: string }> {
  const nombre = entrada.nombre.trim().slice(0, 80);
  if (!nombre) throw new ConexionError(400, 'NOMBRE', 'Ponle un nombre a la llave.');
  const alcances = [...new Set(entrada.alcances)].filter((a) => (ALCANCES_LLAVE as readonly string[]).includes(a));
  if (alcances.length === 0) throw new ConexionError(400, 'ALCANCES', 'Elige al menos un permiso.');
  let expira: string | null = null;
  if (entrada.expira) {
    const d = new Date(entrada.expira);
    if (Number.isNaN(d.getTime()) || d.getTime() <= Date.now()) throw new ConexionError(400, 'EXPIRA', 'La fecha de vencimiento debe ser futura.');
    expira = d.toISOString();
  }
  const { llave, hash, mascara } = generarLlaveApi();
  const { data, error } = await db
    .from('channel_api_keys')
    .insert({
      organization_id: actor.organizationId,
      name: nombre,
      key_hash: hash,
      key_prefix: mascara,
      scopes: alcances,
      is_active: true,
      expires_at: expira,
      created_by: actor.memberId,
    })
    .select('id, name, key_prefix, scopes, is_active, last_used_at, expires_at, created_at, revoked_at')
    .single();
  if (error || !data) throw new Error(`channel_api_keys: ${error?.message ?? 'sin fila'}`);
  const nombres = actor.memberId ? await nombresDeMiembros(db, actor.organizationId, [actor.memberId]).catch(() => new Map<number, string>()) : new Map<number, string>();
  return { llave: resumirLlave(data as Fila, actor.memberId ? nombres.get(actor.memberId) ?? null : null), completa: llave };
}

export async function revocarLlave(db: SupabaseClient, actor: Actor & { memberId: number | null }, id: string): Promise<void> {
  const { data, error } = await db
    .from('channel_api_keys')
    .update({ is_active: false, revoked_at: new Date().toISOString(), revoked_by: actor.memberId })
    .eq('id', id)
    .eq('organization_id', actor.organizationId)
    .select('id');
  if (error) throw new Error(`channel_api_keys: ${error.message}`);
  if (((data as Fila[] | null) ?? []).length === 0) throw new ConexionError(404, 'NO_ENCONTRADA', 'Llave no encontrada.');
}

const COLUMNAS_LLAVE = 'id, name, key_prefix, scopes, is_active, last_used_at, expires_at, created_at, revoked_at';

/** Fecha de vencimiento validada (`null` = sin vencimiento). Debe ser futura. */
function vencimiento(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const d = new Date(valor);
  if (Number.isNaN(d.getTime()) || d.getTime() <= Date.now()) throw new ConexionError(400, 'EXPIRA', 'La fecha de vencimiento debe ser futura.');
  return d.toISOString();
}

export interface CambiosLlave {
  nombre?: string;
  alcances?: string[];
  /** `null` quita el vencimiento; ausente lo deja como está. */
  expira?: string | null;
  /** Desactivar/activar sin revocar (la página vieja lo llamaba «Desactivar»). */
  activa?: boolean;
}

/**
 * Edita nombre, permisos, vencimiento o estado de una llave de la organización. Una llave
 * revocada no se edita (404 si no es de la organización; 409 si está revocada).
 */
export async function editarLlave(db: SupabaseClient, actor: Actor, id: string, cambios: CambiosLlave): Promise<LlaveApiResumen> {
  const { data: actual, error: errorLectura } = await db.from('channel_api_keys').select(COLUMNAS_LLAVE).eq('id', id).eq('organization_id', actor.organizationId).maybeSingle();
  if (errorLectura) throw new Error(`channel_api_keys: ${errorLectura.message}`);
  if (!actual) throw new ConexionError(404, 'NO_ENCONTRADA', 'Llave no encontrada.');
  if ((actual as Fila).revoked_at) throw new ConexionError(409, 'REVOCADA', 'Una llave revocada no se puede editar.');

  const parche: Fila = {};
  if (cambios.nombre !== undefined) {
    const nombre = cambios.nombre.trim().slice(0, 80);
    if (!nombre) throw new ConexionError(400, 'NOMBRE', 'Ponle un nombre a la llave.');
    parche.name = nombre;
  }
  if (cambios.alcances !== undefined) {
    const alcances = [...new Set(cambios.alcances)].filter((a) => (ALCANCES_LLAVE as readonly string[]).includes(a));
    if (alcances.length === 0) throw new ConexionError(400, 'ALCANCES', 'Elige al menos un permiso.');
    parche.scopes = alcances;
  }
  if (cambios.expira !== undefined) parche.expires_at = vencimiento(cambios.expira);
  if (cambios.activa !== undefined) parche.is_active = cambios.activa;
  if (Object.keys(parche).length === 0) return resumirLlave(actual as Fila);

  const { data, error } = await db.from('channel_api_keys').update(parche).eq('id', id).eq('organization_id', actor.organizationId).select(COLUMNAS_LLAVE).single();
  if (error || !data) throw new Error(`channel_api_keys: ${error?.message ?? 'sin fila'}`);
  return resumirLlave(data as Fila);
}

/** Borra la fila (la página vieja lo ofrecía además de revocar). Solo de la organización de la sesión. */
export async function borrarLlave(db: SupabaseClient, actor: Actor, id: string): Promise<void> {
  const { data, error } = await db.from('channel_api_keys').delete().eq('id', id).eq('organization_id', actor.organizationId).select('id');
  if (error) throw new Error(`channel_api_keys: ${error.message}`);
  if (((data as Fila[] | null) ?? []).length === 0) throw new ConexionError(404, 'NO_ENCONTRADA', 'Llave no encontrada.');
}

// ─── Webhooks salientes ──────────────────────────────────────────────────────

const COLUMNAS_WEBHOOK = 'id, organization_id, name, target_url, events, is_active, secret, last_delivery_at, last_response_status, consecutive_failures';

function resumirWebhook(w: Fila, registro = true): WebhookSalienteResumen {
  return {
    id: texto(w.id),
    nombre: texto(w.name),
    url: texto(w.target_url),
    eventos: Array.isArray(w.events) ? (w.events as unknown[]).map(texto) : [],
    activo: w.is_active !== false,
    secreto: w.secret ? `··${texto(w.secret).slice(-4)}` : null,
    ultimoEnvio: (w.last_delivery_at as string | null) ?? null,
    ultimaRespuesta: w.last_response_status == null ? null : Number(w.last_response_status),
    fallosSeguidos: Number(w.consecutive_failures ?? 0),
    registroDeEnvios: registro,
  };
}

/** Eventos válidos y sin repetir; vacío → 400. */
function eventosValidos(eventos: readonly string[]): string[] {
  const lista = [...new Set(eventos)].filter((e) => (EVENTOS_WEBHOOK as readonly string[]).includes(e));
  if (lista.length === 0) throw new ConexionError(400, 'EVENTOS', 'Elige al menos un evento.');
  return lista;
}

export interface EntradaWebhook {
  nombre: string;
  url: string;
  eventos: string[];
}

/**
 * Crea un webhook saliente con secreto de firma criptográfico. La dirección se valida igual que
 * al probar (HTTPS, pública, sin credenciales). El secreto completo se devuelve UNA vez.
 */
export async function crearWebhook(db: SupabaseClient, actor: Actor, entrada: EntradaWebhook, resolver?: Resolver): Promise<{ webhook: WebhookSalienteResumen; secreto: string }> {
  const nombre = entrada.nombre.trim().slice(0, 80);
  if (!nombre) throw new ConexionError(400, 'NOMBRE', 'Ponle un nombre al webhook.');
  const destino = await validarDestino(entrada.url.trim(), resolver);
  const eventos = eventosValidos(entrada.eventos);
  const secreto = generarSecretoWebhook();
  const { data, error } = await db
    .from('webhook_endpoints')
    .insert({ organization_id: actor.organizationId, name: nombre, target_url: destino.toString(), events: eventos, secret: secreto, is_active: true })
    .select(COLUMNAS_WEBHOOK)
    .single();
  if (error || !data) throw new Error(`webhook_endpoints: ${error?.message ?? 'sin fila'}`);
  return { webhook: resumirWebhook(data as Fila), secreto };
}

export interface CambiosWebhook {
  nombre?: string;
  url?: string;
  eventos?: string[];
  /** Pausar (`false`) o reactivar (`true`) sin borrar. */
  activo?: boolean;
}

/** Edita nombre, dirección, eventos o estado de un webhook de la organización. */
export async function editarWebhook(db: SupabaseClient, actor: Actor, id: string, cambios: CambiosWebhook, resolver?: Resolver): Promise<WebhookSalienteResumen> {
  const parche: Fila = {};
  if (cambios.nombre !== undefined) {
    const nombre = cambios.nombre.trim().slice(0, 80);
    if (!nombre) throw new ConexionError(400, 'NOMBRE', 'Ponle un nombre al webhook.');
    parche.name = nombre;
  }
  if (cambios.url !== undefined) parche.target_url = (await validarDestino(cambios.url.trim(), resolver)).toString();
  if (cambios.eventos !== undefined) parche.events = eventosValidos(cambios.eventos);
  if (cambios.activo !== undefined) {
    parche.is_active = cambios.activo;
    // Reactivar limpia la racha de fallos: el siguiente envío decide de nuevo.
    if (cambios.activo) parche.consecutive_failures = 0;
  }
  if (Object.keys(parche).length === 0) {
    const { data, error } = await db.from('webhook_endpoints').select(COLUMNAS_WEBHOOK).eq('id', id).eq('organization_id', actor.organizationId).maybeSingle();
    if (error) throw new Error(`webhook_endpoints: ${error.message}`);
    if (!data) throw new ConexionError(404, 'NO_ENCONTRADO', 'Webhook no encontrado.');
    return resumirWebhook(data as Fila);
  }
  const { data, error } = await db.from('webhook_endpoints').update(parche).eq('id', id).eq('organization_id', actor.organizationId).select(COLUMNAS_WEBHOOK);
  if (error) throw new Error(`webhook_endpoints: ${error.message}`);
  const fila = ((data as Fila[] | null) ?? [])[0];
  if (!fila) throw new ConexionError(404, 'NO_ENCONTRADO', 'Webhook no encontrado.');
  return resumirWebhook(fila);
}

export async function borrarWebhook(db: SupabaseClient, actor: Actor, id: string): Promise<void> {
  const { data, error } = await db.from('webhook_endpoints').delete().eq('id', id).eq('organization_id', actor.organizationId).select('id');
  if (error) throw new Error(`webhook_endpoints: ${error.message}`);
  if (((data as Fila[] | null) ?? []).length === 0) throw new ConexionError(404, 'NO_ENCONTRADO', 'Webhook no encontrado.');
}

/** Nuevo secreto de firma (el anterior deja de valer al instante). Se devuelve UNA vez. */
export async function regenerarSecretoWebhook(db: SupabaseClient, actor: Actor, id: string): Promise<{ webhook: WebhookSalienteResumen; secreto: string }> {
  const secreto = generarSecretoWebhook();
  const { data, error } = await db.from('webhook_endpoints').update({ secret: secreto }).eq('id', id).eq('organization_id', actor.organizationId).select(COLUMNAS_WEBHOOK);
  if (error) throw new Error(`webhook_endpoints: ${error.message}`);
  const fila = ((data as Fila[] | null) ?? [])[0];
  if (!fila) throw new ConexionError(404, 'NO_ENCONTRADO', 'Webhook no encontrado.');
  return { webhook: resumirWebhook(fila), secreto };
}

export interface WebhookSalienteResumen {
  id: string;
  nombre: string;
  url: string;
  eventos: string[];
  activo: boolean;
  /** Últimos 4 del secreto de firma; nunca el secreto. */
  secreto: string | null;
  ultimoEnvio: string | null;
  ultimaRespuesta: number | null;
  fallosSeguidos: number;
  /** false si la migración 20261108090000 aún no está aplicada. */
  registroDeEnvios: boolean;
}

export async function listarWebhooks(db: SupabaseClient, organizationId: number): Promise<WebhookSalienteResumen[]> {
  const columnasBase = 'id, organization_id, name, target_url, events, is_active, secret';
  let registro = true;
  const leer = (columnas: string) =>
    db.from('webhook_endpoints').select(columnas).eq('organization_id', organizationId).order('created_at', { ascending: false }) as unknown as Promise<{
      data: Fila[] | null;
      error: { message: string; code?: string } | null;
    }>;
  let res = await leer(`${columnasBase}, last_delivery_at, last_response_status, consecutive_failures`);
  if (res.error && res.error.code === '42703') {
    // Columnas de la migración 20261108090000 aún sin aplicar: «pendiente de activar».
    registro = false;
    res = await leer(columnasBase);
  }
  if (res.error) throw new Error(`webhook_endpoints: ${res.error.message}`);
  return ((res.data as Fila[] | null) ?? []).map((w) => resumirWebhook(w, registro));
}

/** ¿La IP es pública? Rechaza loopback, privadas, enlace local, CGNAT, multicast y reservadas. */
export function ipPublica(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 192 && b === 0) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    return true;
  }
  if (v === 6) {
    const x = ip.toLowerCase();
    if (x === '::' || x === '::1') return false;
    if (x.startsWith('fc') || x.startsWith('fd') || x.startsWith('fe8') || x.startsWith('fe9') || x.startsWith('fea') || x.startsWith('feb') || x.startsWith('ff')) return false;
    const mapeada = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(x);
    if (mapeada) return ipPublica(mapeada[1]);
    return true;
  }
  return false;
}

export type Resolver = (host: string) => Promise<string[]>;
const resolverDns: Resolver = async (host) => (await lookup(host, { all: true, verbatim: true })).map((r) => r.address);

/** Valida el destino de un webhook saliente: HTTPS, sin credenciales en la URL, IP pública. */
export async function validarDestino(url: string, resolver: Resolver = resolverDns): Promise<URL> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new ConexionError(400, 'URL', 'La dirección no es válida.');
  }
  if (u.protocol !== 'https:') throw new ConexionError(400, 'URL', 'La dirección debe empezar por https://');
  if (u.username || u.password) throw new ConexionError(400, 'URL', 'La dirección no puede llevar usuario ni clave.');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) {
    throw new ConexionError(400, 'URL', 'La dirección debe ser pública.');
  }
  const ips = isIP(host) ? [host] : await resolver(host).catch(() => []);
  if (ips.length === 0) throw new ConexionError(400, 'URL', 'No se encontró el servidor de esa dirección.');
  if (!ips.every(ipPublica)) throw new ConexionError(400, 'URL', 'La dirección debe ser pública.');
  return u;
}

/**
 * `lookup` para la conexión del envío: resuelve el nombre UNA vez y solo entrega IP públicas.
 * Como la petición se conecta exactamente a la IP que devuelve esta función, un DNS que cambie
 * entre la validación y el envío (DNS rebinding) no puede llevarla a una IP interna.
 */
export function crearLookupSeguro(resolver: Resolver = resolverDns): LookupFunction {
  return ((hostname: string, opciones: { all?: boolean } | number | undefined, cb: (...a: unknown[]) => void) => {
    const todas = typeof opciones === 'object' && opciones !== null && opciones.all === true;
    resolver(hostname)
      .then((ips) => {
        if (ips.length === 0 || !ips.every(ipPublica)) {
          const err = Object.assign(new Error('Destino no público'), { code: 'EDESTINO_PRIVADO' });
          return cb(err);
        }
        const ip = ips[0];
        const familia = isIP(ip);
        return todas ? cb(null, [{ address: ip, family: familia }]) : cb(null, ip, familia);
      })
      .catch((err: unknown) => cb(err));
  }) as unknown as LookupFunction;
}

/**
 * POST HTTPS con la IP fijada por `crearLookupSeguro` (sin redirecciones: `https.request` no las
 * sigue). Devuelve solo el código HTTP; el cuerpo de la respuesta se descarta.
 */
export function enviarConIpFijada(
  destino: URL,
  init: { headers: Record<string, string>; body: string; signal: AbortSignal },
  resolver: Resolver = resolverDns,
): Promise<{ status: number }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        protocol: 'https:',
        hostname: destino.hostname.replace(/^\[|\]$/g, ''),
        port: destino.port || 443,
        path: `${destino.pathname}${destino.search}`,
        method: 'POST',
        headers: { ...init.headers, 'Content-Length': Buffer.byteLength(init.body) },
        servername: isIP(destino.hostname) ? undefined : destino.hostname,
        lookup: crearLookupSeguro(resolver),
        signal: init.signal,
      },
      (res) => {
        res.resume();
        resolve({ status: res.statusCode ?? 0 });
      },
    );
    req.on('error', reject);
    req.end(init.body);
  });
}

export function firmarCuerpo(secreto: string, cuerpo: string, unix: number): string {
  const v1 = crypto.createHmac('sha256', secreto).update(`${unix}.${cuerpo}`).digest('hex');
  return `t=${unix},v1=${v1}`;
}

export interface ResultadoEnvio {
  ok: boolean;
  http: number | null;
  ms: number;
  motivo?: 'tiempo' | 'red' | 'respuesta';
}

export async function probarWebhookSaliente(
  db: SupabaseClient,
  organizationId: number,
  id: string,
  deps: { fetchImpl?: typeof fetch; resolver?: Resolver } = {},
): Promise<ResultadoEnvio> {
  const { data, error } = await db
    .from('webhook_endpoints')
    .select('id, organization_id, target_url, secret, events')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error) throw new Error(`webhook_endpoints: ${error.message}`);
  const w = data as Fila | null;
  if (!w || Number(w.organization_id) !== organizationId) throw new ConexionError(404, 'NO_ENCONTRADO', 'Webhook no encontrado.');
  const destino = await validarDestino(texto(w.target_url), deps.resolver);

  const unix = Math.floor(Date.now() / 1000);
  const cuerpo = JSON.stringify({ id: crypto.randomUUID(), type: 'prueba', created: unix, organization_id: organizationId, data: { mensaje: 'Evento de prueba de GO Admin' } });
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'User-Agent': 'GOAdmin-Webhooks/1.0' };
  if (w.secret) headers['X-GoAdmin-Signature'] = firmarCuerpo(texto(w.secret), cuerpo, unix);

  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), 8000);
  const inicio = Date.now();
  let resultado: ResultadoEnvio;
  try {
    // Sin `fetchImpl` (producción) se envía con la IP fijada: protección contra DNS rebinding.
    const r = deps.fetchImpl
      ? await deps.fetchImpl(destino.toString(), { method: 'POST', headers, body: cuerpo, redirect: 'manual', signal: control.signal, cache: 'no-store' })
      : await enviarConIpFijada(destino, { headers, body: cuerpo, signal: control.signal }, deps.resolver);
    resultado = { ok: r.status >= 200 && r.status < 300, http: r.status, ms: Date.now() - inicio, motivo: r.status >= 200 && r.status < 300 ? undefined : 'respuesta' };
  } catch (err) {
    const tiempo = err instanceof Error && err.name === 'AbortError';
    resultado = { ok: false, http: null, ms: Date.now() - inicio, motivo: tiempo ? 'tiempo' : 'red' };
  } finally {
    clearTimeout(reloj);
  }

  // Registro del envío (columnas de la migración 20261108090000; si aún no existen, se omite).
  const { data: previo } = await db.from('webhook_endpoints').select('consecutive_failures').eq('id', id).maybeSingle();
  const fallos = resultado.ok ? 0 : Number((previo as Fila | null)?.consecutive_failures ?? 0) + 1;
  await db
    .from('webhook_endpoints')
    .update({ last_delivery_at: new Date().toISOString(), last_response_status: resultado.http ?? 0, consecutive_failures: fallos })
    .eq('id', id)
    .eq('organization_id', organizationId);
  return resultado;
}
