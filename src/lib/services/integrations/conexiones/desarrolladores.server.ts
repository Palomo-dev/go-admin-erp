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
import { isIP } from 'net';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ConexionError, type Actor } from './conexiones.server';
import { ALCANCES_LLAVE } from './alcancesLlave';

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
}

function resumirLlave(k: Fila): LlaveApiResumen {
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
  };
}

export async function listarLlaves(db: SupabaseClient, organizationId: number): Promise<LlaveApiResumen[]> {
  const { data, error } = await db
    .from('channel_api_keys')
    .select('id, name, key_prefix, scopes, is_active, last_used_at, expires_at, created_at, revoked_at')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(`channel_api_keys: ${error.message}`);
  return ((data as Fila[] | null) ?? []).map(resumirLlave);
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
  return { llave: resumirLlave(data as Fila), completa: llave };
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

// ─── Webhooks salientes ──────────────────────────────────────────────────────

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
  return ((res.data as Fila[] | null) ?? []).map((w) => ({
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
  }));
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
    const r = await (deps.fetchImpl ?? fetch)(destino.toString(), { method: 'POST', headers, body: cuerpo, redirect: 'manual', signal: control.signal, cache: 'no-store' });
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
