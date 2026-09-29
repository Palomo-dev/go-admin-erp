/**
 * Verificación del access token de Supabase para el middleware (Edge Runtime).
 *
 * POR QUÉ EXISTE (auditoría de seguridad 2026-09-24)
 * --------------------------------------------------
 * El middleware aceptaba la cookie de sesión con el JWT DECODIFICADO sin
 * verificar la firma (`decodeJwt` de jose): bastaba una cookie inventada con
 * `{"access_token":"<cualquier cosa>.<{"sub":"x"} en base64>.x"}` para pasar la
 * protección de rutas. Se decodificaba sin verificar para no hacer una llamada
 * de red en cada petición. Aquí se verifica de verdad y se sigue sin llamada de
 * red en el camino normal.
 *
 * CÓMO VERIFICA (en este orden, según el `alg` de la cabecera)
 * ------------------------------------------------------------
 *  1. `HS256` + `SUPABASE_JWT_SECRET` real en el entorno → verificación LOCAL
 *     (WebCrypto, ~0,1 ms, sin red). Es el camino normal en producción: el
 *     proyecto firma hoy con el secreto simétrico heredado (el JWKS público del
 *     proyecto está vacío, `{"keys":[]}`, comprobado el 2026-09-24).
 *  2. `ES256`/`RS256`/`EdDSA` → claves asimétricas del proyecto por JWKS
 *     (`/auth/v1/.well-known/jwks.json`), en caché de módulo: una descarga por
 *     instancia y luego verificación local. Deja listo el día que el proyecto
 *     migre a claves de firma asimétricas, sin tocar código.
 *  3. `HS256` SIN secreto en el entorno (despliegue sin la variable, servidor
 *     embebido del escritorio, desarrollo) → se pregunta al servidor de Auth
 *     (`GET /auth/v1/user`), con timeout, caché en memoria por token (hasta su
 *     `exp`, máx. 5 min) y deduplicación de peticiones en vuelo. Es la opción
 *     correcta pero lenta; el log avisa una vez de que falta el secreto.
 *
 * FAIL-CLOSED: un token con firma mala, alterado, con `alg` no admitido, sin
 * `sub`, con `role` distinto de `authenticated`, sin `exp` o vencido NO da
 * sesión. Si no se puede verificar (red caída, Auth no responde), tampoco:
 * el veredicto es `no_verificable` y el middleware lo trata como sin sesión.
 * La única excepción está acotada al servidor embebido del escritorio
 * (`sesionHeredadaSoloEscritorio`), ver su comentario.
 *
 * Sin secretos en el cliente: este módulo solo se importa desde el middleware
 * (servidor). `SUPABASE_JWT_SECRET` es de servidor y NUNCA lleva `NEXT_PUBLIC_`.
 */

import {
  createRemoteJWKSet,
  decodeJwt,
  decodeProtectedHeader,
  jwtVerify,
  type JWTPayload,
} from 'jose';
import { readRealSecret } from '@/lib/security/secrets';

/** Variable de entorno (solo servidor) con el secreto JWT del proyecto. */
export const SUPABASE_JWT_SECRET_ENV = 'SUPABASE_JWT_SECRET';

/** Algoritmos asimétricos que Supabase usa para sus claves de firma. */
const ALGS_ASIMETRICOS = ['ES256', 'RS256', 'EdDSA'] as const;

/** Tope de tamaño del token: una cookie legítima de Supabase está muy por debajo. */
const MAX_TOKEN_LENGTH = 8192;

/** Timeout del camino por red (Auth o JWKS). */
export const TIMEOUT_VERIFICACION_RED_MS = 1500;

/** Vigencia máxima de un veredicto positivo de Auth en la caché de memoria. */
const CACHE_AUTH_MAX_MS = 5 * 60 * 1000;
const CACHE_AUTH_MAX_ENTRADAS = 500;

/**
 * Servidor embebido del escritorio: ventana de gracia de la sesión heredada.
 * Es la misma que tenía el middleware antes del arreglo.
 */
const GRACIA_ESCRITORIO_SEGUNDOS = 7 * 24 * 60 * 60;

export type MetodoVerificacion = 'secreto-local' | 'jwks' | 'servidor-auth';

export interface ClaimsVerificados {
  sub: string;
  exp: number;
  role: string;
  email?: string;
  session_id?: string;
  /**
   * Métodos con los que se abrió la sesión (claim amr de Supabase: password,
   * oauth, otp, recovery, magiclink, invite…). Solo de un token ya verificado.
   * Lo usa /api/auth/restablecer: la contraseña solo se cambia sin la actual
   * con una sesión abierta desde un enlace del correo (R8).
   */
  amr?: { method: string; timestamp: number }[];
}

export type VeredictoToken =
  | { estado: 'valido'; claims: ClaimsVerificados; metodo: MetodoVerificacion }
  /** Vencido. Tampoco da sesión: el cliente debe refrescar y volver. */
  | { estado: 'vencido' }
  | { estado: 'invalido'; motivo: string }
  /** No se pudo verificar (red, Auth caído, sin configuración). Sin sesión. */
  | { estado: 'no_verificable'; motivo: string };

// ─── Utilidades ───────────────────────────────────────────────────────────────

function ahoraSegundos(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Claims mínimos exigidos a un token de usuario de Supabase. Se aplican SOLO a
 * un payload ya verificado (o confirmado por Auth).
 */
function claimsDeUsuario(payload: JWTPayload): ClaimsVerificados | null {
  const sub = payload.sub;
  const exp = payload.exp;
  const role = (payload as { role?: unknown }).role;
  if (typeof sub !== 'string' || sub.trim() === '') return null;
  if (typeof exp !== 'number' || !Number.isFinite(exp)) return null;
  // La clave anon y la service_role también son JWT firmados con el mismo
  // secreto, pero sin `sub` y con otro `role`: nunca son una sesión de usuario.
  if (role !== 'authenticated') return null;
  const email = (payload as { email?: unknown }).email;
  const sessionId = (payload as { session_id?: unknown }).session_id;
  const amrCrudo = (payload as { amr?: unknown }).amr;
  const amr = Array.isArray(amrCrudo)
    ? amrCrudo
        .filter((a): a is { method: string; timestamp: number } =>
          !!a && typeof (a as { method?: unknown }).method === 'string' && typeof (a as { timestamp?: unknown }).timestamp === 'number')
        .map((a) => ({ method: a.method, timestamp: a.timestamp }))
    : undefined;
  return {
    sub,
    exp,
    role,
    ...(typeof email === 'string' ? { email } : {}),
    ...(typeof sessionId === 'string' ? { session_id: sessionId } : {}),
    ...(amr && amr.length > 0 ? { amr } : {}),
  };
}

/**
 * ÚNICO punto del módulo que lee el payload sin verificar la firma. Solo se
 * llama desde dos sitios, los dos documentados (el guardarraíl 29 de
 * src/__tests__/guardrails.test.ts los cuenta):
 *  - `verificarConServidorAuth`: DESPUÉS de que Auth aceptó ese mismo token
 *    (o para descartar sin preguntar un token ya vencido, que no da sesión);
 *  - `sesionHeredadaSoloEscritorio`: la excepción del servidor embebido.
 */
function leerPayloadSinVerificar(token: string): JWTPayload | null {
  try {
    return decodeJwt(token);
  } catch {
    return null;
  }
}

/** Traduce los errores de jose a un veredicto. */
function veredictoDeError(error: unknown): VeredictoToken {
  const code = (error as { code?: unknown })?.code;
  switch (code) {
    case 'ERR_JWT_EXPIRED':
      return { estado: 'vencido' };
    case 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED':
    case 'ERR_JWS_INVALID':
    case 'ERR_JWT_INVALID':
    case 'ERR_JWT_CLAIM_VALIDATION_FAILED':
    case 'ERR_JOSE_ALG_NOT_ALLOWED':
    case 'ERR_JOSE_NOT_SUPPORTED':
    case 'ERR_JWKS_NO_MATCHING_KEY':
    case 'ERR_JWKS_MULTIPLE_MATCHING_KEYS':
    case 'ERR_JWK_INVALID':
      return { estado: 'invalido', motivo: String(code) };
    default:
      // ERR_JWKS_TIMEOUT, ERR_JWKS_INVALID, fallos de red: no se sabe.
      return { estado: 'no_verificable', motivo: typeof code === 'string' ? code : 'error_verificacion' };
  }
}

// ─── Camino 1: secreto simétrico local ────────────────────────────────────────

let secretoCodificado: { secreto: string; bytes: Uint8Array } | null = null;
function bytesDelSecreto(secreto: string): Uint8Array {
  if (!secretoCodificado || secretoCodificado.secreto !== secreto) {
    secretoCodificado = { secreto, bytes: new TextEncoder().encode(secreto) };
  }
  return secretoCodificado.bytes;
}

async function verificarConSecreto(token: string, secreto: string): Promise<VeredictoToken> {
  try {
    const { payload } = await jwtVerify(token, bytesDelSecreto(secreto), { algorithms: ['HS256'] });
    const claims = claimsDeUsuario(payload);
    if (!claims) return { estado: 'invalido', motivo: 'claims_de_usuario' };
    return { estado: 'valido', claims, metodo: 'secreto-local' };
  } catch (error) {
    return veredictoDeError(error);
  }
}

// ─── Camino 2: claves asimétricas por JWKS ────────────────────────────────────

let jwks: { url: string; set: ReturnType<typeof createRemoteJWKSet> } | null = null;
function conjuntoJwks(): ReturnType<typeof createRemoteJWKSet> | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  if (!base) return null;
  const url = `${base.replace(/\/+$/, '')}/auth/v1/.well-known/jwks.json`;
  if (!jwks || jwks.url !== url) {
    jwks = {
      url,
      set: createRemoteJWKSet(new URL(url), {
        timeoutDuration: TIMEOUT_VERIFICACION_RED_MS,
        cooldownDuration: 30_000,
        cacheMaxAge: 10 * 60_000,
      }),
    };
  }
  return jwks.set;
}

async function verificarConJwks(token: string): Promise<VeredictoToken> {
  const set = conjuntoJwks();
  if (!set) return { estado: 'no_verificable', motivo: 'sin_url_supabase' };
  try {
    const { payload } = await jwtVerify(token, set, { algorithms: [...ALGS_ASIMETRICOS] });
    const claims = claimsDeUsuario(payload);
    if (!claims) return { estado: 'invalido', motivo: 'claims_de_usuario' };
    return { estado: 'valido', claims, metodo: 'jwks' };
  } catch (error) {
    return veredictoDeError(error);
  }
}

// ─── Camino 3: preguntar al servidor de Auth ──────────────────────────────────

type EntradaCache = { claims: ClaimsVerificados; hastaMs: number };
const cacheAuth = new Map<string, EntradaCache>();
const enVuelo = new Map<string, Promise<VeredictoToken>>();
let avisoSinSecreto = false;

async function huellaToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return hex;
}

function guardarEnCache(huella: string, claims: ClaimsVerificados): void {
  const hastaMs = Math.min(claims.exp * 1000, Date.now() + CACHE_AUTH_MAX_MS);
  if (hastaMs <= Date.now()) return;
  if (cacheAuth.size >= CACHE_AUTH_MAX_ENTRADAS) {
    // Map conserva el orden de inserción: se descarta la más antigua.
    const primera = cacheAuth.keys().next().value;
    if (primera !== undefined) cacheAuth.delete(primera);
  }
  cacheAuth.set(huella, { claims, hastaMs });
}

async function consultarAuth(token: string, payload: JWTPayload, huella: string): Promise<VeredictoToken> {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!base || !anon) return { estado: 'no_verificable', motivo: 'sin_config_supabase' };

  let res: Response;
  try {
    res = await fetch(`${base}/auth/v1/user`, {
      method: 'GET',
      headers: { apikey: anon, Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_VERIFICACION_RED_MS),
    });
  } catch {
    return { estado: 'no_verificable', motivo: 'auth_sin_respuesta' };
  }

  if (res.status === 401 || res.status === 403) {
    return { estado: 'invalido', motivo: `auth_${res.status}` };
  }
  if (!res.ok) return { estado: 'no_verificable', motivo: `auth_${res.status}` };

  let usuario: { id?: unknown } | null = null;
  try {
    usuario = (await res.json()) as { id?: unknown };
  } catch {
    return { estado: 'no_verificable', motivo: 'auth_respuesta_no_json' };
  }

  // Auth aceptó ESTE token: su payload ya es de fiar. Aun así, el usuario que
  // devuelve Auth tiene que ser el `sub` del token.
  const claims = claimsDeUsuario(payload);
  if (!claims || usuario?.id !== claims.sub) return { estado: 'invalido', motivo: 'auth_usuario_distinto' };

  guardarEnCache(huella, claims);
  return { estado: 'valido', claims, metodo: 'servidor-auth' };
}

async function verificarConServidorAuth(token: string): Promise<VeredictoToken> {
  const payload = leerPayloadSinVerificar(token);
  if (!payload) return { estado: 'invalido', motivo: 'payload_ilegible' };
  // Un token vencido no da sesión con ningún veredicto de Auth: se decide sin
  // la llamada. (Su `exp` sin verificar solo elige entre «vencido» e
  // «inválido», que para el middleware son lo mismo: sin sesión.)
  if (typeof payload.exp === 'number' && payload.exp <= ahoraSegundos()) return { estado: 'vencido' };

  const huella = await huellaToken(token);
  const enCache = cacheAuth.get(huella);
  if (enCache) {
    if (enCache.hastaMs > Date.now()) return { estado: 'valido', claims: enCache.claims, metodo: 'servidor-auth' };
    cacheAuth.delete(huella);
  }

  const pendiente = enVuelo.get(huella);
  if (pendiente) return pendiente;
  const promesa = consultarAuth(token, payload, huella).finally(() => enVuelo.delete(huella));
  enVuelo.set(huella, promesa);
  return promesa;
}

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * Verifica un access token de Supabase. Nunca lanza: ante cualquier duda el
 * veredicto es `invalido` o `no_verificable` (sin sesión).
 */
export async function verificarTokenAcceso(token: unknown): Promise<VeredictoToken> {
  if (typeof token !== 'string' || token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
    return { estado: 'invalido', motivo: 'formato' };
  }
  if (token.split('.').length !== 3) return { estado: 'invalido', motivo: 'formato' };

  let alg: unknown;
  try {
    alg = decodeProtectedHeader(token).alg;
  } catch {
    return { estado: 'invalido', motivo: 'cabecera' };
  }

  if (alg === 'HS256') {
    const secreto = readRealSecret(SUPABASE_JWT_SECRET_ENV, { min: 32 });
    if (secreto) return verificarConSecreto(token, secreto);
    if (!avisoSinSecreto) {
      avisoSinSecreto = true;
      console.warn(
        `[auth/verificarTokenAcceso] ${SUPABASE_JWT_SECRET_ENV} no configurado: la sesión se verifica contra el servidor de Auth (una llamada por token y por instancia). Configúralo para verificar en local.`
      );
    }
    return verificarConServidorAuth(token);
  }

  if (typeof alg === 'string' && (ALGS_ASIMETRICOS as readonly string[]).includes(alg)) {
    return verificarConJwks(token);
  }

  // `none`, HS384/HS512 o cualquier otro: Supabase no los emite.
  return { estado: 'invalido', motivo: `alg_no_admitido` };
}

/**
 * ¿Corre este código en el servidor Next EMBEBIDO del escritorio (Electron)?
 *
 * Exige las dos cosas: la marca que pone `electron/src/main/webServer.ts` al
 * arrancar el proceso hijo (`GOADMIN_DESKTOP_EMBEDDED=1`) y que la petición
 * llegue a localhost (el servidor escucha solo en 127.0.0.1). En Vercel la
 * variable no existe y el host nunca es localhost.
 */
export function esServidorEmbebidoEscritorio(hostname: string): boolean {
  if (process.env.GOADMIN_DESKTOP_EMBEDDED !== '1') return false;
  const host = hostname.toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
}

/**
 * EXCEPCIÓN ACOTADA AL ESCRITORIO. El servidor embebido no tiene el secreto JWT
 * (el instalador es público: `electron/scripts/build-web.js` prohíbe empaquetar
 * claves de servidor) y la app debe abrir y navegar SIN RED
 * (docs/desktop/FASE-3-NEXT-EMBEBIDO.md). Si el veredicto fue `no_verificable`
 * (sin red) o `vencido` (sin red no se puede refrescar), aquí se mantiene el
 * criterio anterior: `sub` presente y vencido hace menos de 7 días.
 *
 * Por qué es aceptable SOLO ahí: ese servidor escucha en 127.0.0.1 y sirve a
 * quien ya tiene la máquina; el middleware no protege datos (los protege la RLS
 * con el JWT real en cada consulta), y un `invalido` confirmado (firma mala o
 * Auth lo rechaza) NO entra por esta puerta.
 */
export function sesionHeredadaSoloEscritorio(token: unknown): ClaimsVerificados | null {
  if (typeof token !== 'string' || token.length === 0 || token.length > MAX_TOKEN_LENGTH) return null;
  const payload = leerPayloadSinVerificar(token);
  if (!payload || typeof payload.sub !== 'string' || payload.sub.trim() === '') return null;
  const ahora = ahoraSegundos();
  const exp = typeof payload.exp === 'number' ? payload.exp : ahora;
  if (ahora - exp > GRACIA_ESCRITORIO_SEGUNDOS) return null;
  const role = (payload as { role?: unknown }).role;
  return { sub: payload.sub, exp, role: typeof role === 'string' ? role : 'authenticated' };
}

/** Solo para tests: vacía cachés de módulo. */
export function _reiniciarVerificadorParaTests(): void {
  cacheAuth.clear();
  enVuelo.clear();
  jwks = null;
  secretoCodificado = null;
  avisoSinSecreto = false;
}
