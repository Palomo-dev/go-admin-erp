/**
 * Secretos del emparejamiento de la pantalla remota (PLAN §3.3, §7 y §11).
 * SOLO servidor: usa `node:crypto`. Módulo puro (sin Supabase) para que las
 * rutas y sus pruebas lo compartan.
 *
 * - Código de emparejamiento: 6 dígitos (CHECK `pos_terminal_secrets_code_formato`),
 *   vida de 5 minutos, generado con `randomInt` (no `Math.random`).
 * - Token de la pantalla: 32 bytes aleatorios en base64url (43 caracteres).
 *   Se devuelve UNA vez al canjear el código; en la base solo vive su
 *   sha256 en hexadecimal (`display_token_hash`). Regla: nada de tokens en
 *   claro en la base.
 * - Comparación de hashes en tiempo constante (`timingSafeEqual`).
 * - JWT HS256 de corta vida para Realtime, firmado con el secreto JWT del
 *   proyecto (`SUPABASE_JWT_SECRET`), para que la pantalla se una al canal
 *   `pos-display:<terminalId>` sin sesión de usuario (PLAN §7, «Canal
 *   Realtime remoto»). Se firma a mano (cabecera + payload + HMAC) para no
 *   añadir dependencias: `jose` solo llega al repo de forma transitiva.
 *   REGLA DE CLAIMS (ronda 3, qa crítico 1): ver `REALTIME_JWT_PAYLOAD_KEYS`.
 */

import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/** Vida del código de emparejamiento (PLAN §3.3: 5 minutos). */
export const PAIRING_CODE_TTL_MS = 5 * 60 * 1000;
/** Bytes de entropía del token de la pantalla. */
export const DISPLAY_TOKEN_BYTES = 32;
// Formas del código y del token: UNA definición, en el módulo hoja
// `../pairing` (parte B), que también usa la pantalla en el navegador. Se
// re-exportan aquí para que las rutas y sus pruebas no cambien de import.
export { DISPLAY_TOKEN_PATTERN, PAIRING_CODE_PATTERN, isDisplayTokenShape, isPairingCodeShape } from '../pairing';
/** sha256 en hexadecimal: 64 caracteres. */
const SHA256_HEX_LENGTH = 64;

/**
 * Rate limit del canje (PLAN §7: 10 intentos por IP cada 15 minutos). Vive
 * aquí porque un `route.ts` solo puede exportar handlers y opciones de
 * segmento. `unknownClientLimit`: sin cabecera de IP (local, sin proxy) el
 * cubo compartido admite 5, no el 1 por defecto: un código mal tecleado en
 * desarrollo no bloquea 15 minutos.
 */
export const PAIR_RATE_LIMIT = { limit: 10, windowMs: 15 * 60 * 1000, unknownClientLimit: 5 } as const;
export const PAIR_RATE_LIMIT_PREFIX = 'pos-display:pair:ip:';
/**
 * Cubo GLOBAL de respaldo del canje (F3-A ronda 3, qa medio 3). RECALCULADO
 * en F3-B ronda 4 (· 1 y · 2): el número anterior (120/min, «~600 intentos
 * por código vigente: 0,06 % del espacio») estaba mal por dos motivos.
 *
 * 1. EL ESPACIO DE CÓDIGOS ES DEL DESPLIEGUE, NO DE UNA TERMINAL. `/pair` no
 *    recibe terminal ni organización (regla 5), así que
 *    `.eq('pairing_code', code)` casa con CUALQUIER fila vigente: quien
 *    adivina a ciegas no ataca un código, ataca el conjunto. Con N códigos
 *    vivos a la vez la probabilidad por intento es N / 10^6, no 1 / 10^6.
 *    Escribirlo «por código vigente» subestimaba el riesgo por un factor N.
 * 2. EL TECHO SOLO ES DEL DESPLIEGUE CON `RATE_LIMIT_STORE=db`. En memoria el
 *    cubo vive en el `Map` de cada instancia, el techo real es
 *    `limit x instancias` y un lambda frío devuelve el presupuesto entero.
 *    Por eso `/pair` EXIGE el store persistente en producción
 *    (`requireDisplayRateLimitStore` -> 503 `RATE_LIMIT_STORE_REQUIRED`):
 *    el número de abajo SOLO vale con `db`, y sin `db` la ruta no atiende.
 *
 * Con 60 canjes FALLIDOS por minuto en todo el despliegue, la vida de un
 * código (5 min) admite como mucho 300 intentos ciegos. La probabilidad de
 * que alguno acierte ALGUNO de los N códigos vivos es
 * 1 - (1 - N/10^6)^300 ~= 3e-4 x N: 0,03 % con un código vivo, 0,3 % con
 * diez, 3 % con cien (cien organizaciones emparejando dentro de la misma
 * ventana de cinco minutos). Crece LINEALMENTE con N: a esa escala el cierre
 * real no es seguir bajando este número, sino que el código deje de ser la
 * única credencial del canje —exigir además el `code` visible de la terminal,
 * con lo que el espacio pasa a ser por terminal—. Queda en pendientes.
 *
 * Y un acierto no es solo lectura: el UPDATE pisa `display_token_hash` y pone
 * `pairing_code = null`, así que ROBA el emparejamiento. Matiz verificado: el
 * UPDATE exige `pairing_code = code`, luego solo se puede robar un código AÚN
 * NO CANJEADO, y en cuanto la tableta legítima se empareja con uno nuevo el
 * hash del atacante queda sustituido. La exposición duradera es el código que
 * se genera y nunca se usa: ahí el token robado vive hasta que alguien revoque.
 *
 * Se MIRA al entrar (`isRateLimitExhausted`, solo memoria: es un atajo para no
 * tocar la base, no la barrera) y solo lo consumen los canjes que FALLAN
 * (F3-B ronda 3 · 4): un canje correcto no es abuso, y contándolo bastaban 60
 * peticiones por minuto desde cualquier sitio para dejar sin emparejar a todas
 * las organizaciones durante la ventana.
 */
export const PAIR_GLOBAL_RATE_LIMIT = { limit: 60, windowMs: 60 * 1000 } as const;
export const PAIR_GLOBAL_RATE_LIMIT_KEY = 'pos-display:pair:global';

/**
 * CARRIL LENTO del canje (F3-C ronda 5 · 4). El cubo global de arriba se mira
 * al ENTRAR —tiene que ser así: es el techo de intentos ADIVINADOS, y mirarlo
 * después del lookup dejaría que el atacante evaluase cuantas conjeturas
 * quisiera y solo cambiase el código de respuesta—. El efecto secundario es
 * que, agotado, devolvía 429 a TODO el mundo: 60 códigos equivocados por
 * minuto con `x-forwarded-for` rotado (que `getClientIp` toma tal cual) eran
 * un interruptor de apagado del emparejamiento para todo el despliegue.
 *
 * Con el cubo global agotado ya no se rechaza de plano: la petición pasa por
 * ESTE cubo, mucho más estrecho. Un canje que acierta sigue sin consumir
 * ninguno de los dos (solo los fallos consumen el global), así que una
 * organización que empareja de verdad tiene por dónde entrar mientras un
 * tercero inunda la ruta.
 *
 * Lo que cuesta en seguridad: el techo de conjeturas pasa de 60 a 66 por
 * minuto, de 300 a 330 por vida de un código (5 min). La probabilidad de
 * acertar ALGUNO de los N códigos vivos sube de ~3,0e-4 x N a ~3,3e-4 x N:
 * el mismo orden de magnitud, un 10 % peor. Se acepta a cambio de que el
 * emparejamiento de terceros no se pueda apagar a voluntad.
 *
 * Lo que NO arregla: bajo una inundación sostenida las seis plazas también se
 * disputan. Sin identidad en la petición no hay forma de distinguir antes del
 * lookup un canje legítimo de una conjetura, así que el cierre de verdad sigue
 * siendo el que ya está en pendientes: exigir además el `code` visible de la
 * terminal, con lo que el espacio de códigos pasa a ser POR TERMINAL y este
 * cubo global deja de hacer falta.
 */
export const PAIR_GLOBAL_SLOW_RATE_LIMIT = { limit: 6, windowMs: 60 * 1000 } as const;
export const PAIR_GLOBAL_SLOW_RATE_LIMIT_KEY = 'pos-display:pair:global:lento';

/**
 * Cubo del BOOTSTRAP por TOKEN (F3-B ronda 4 · 3). `/bootstrap` es la ruta
 * más cara de la fase —2 lecturas de autenticación + 3 del bootstrap, todas
 * con service-role, más un JWT HS256 firmado— y era la única sin freno para
 * un token VÁLIDO: el cubo de `authenticateDisplayRequest` solo lo consumen
 * los 401 (así está escrito a propósito). Una tableta robada o revendida, o
 * un bucle de remontaje en el cliente, repetía las cinco lecturas sin tope;
 * es la forma del incidente del 14/09 (ráfaga de lecturas sin caché).
 * `/heartbeat` ya se había endurecido para este escenario con
 * `HEARTBEAT_WRITE_INTERVAL_MS`; esta es su pareja.
 *
 * 10 por minuto: el cliente legítimo llama una vez por carga y reintenta con
 * retroceso de 5 s -> 60 s (`bootstrapRetryDelay`), que en el peor minuto son
 * cinco llamadas. A diferencia del cubo de autenticación, este SÍ lo consumen
 * las llamadas correctas: lo que se acota es el coste, no el fracaso.
 *
 * La clave es un digest PROPIO del token, con un dominio distinto al de
 * `hashDisplayToken`: el cubo persistente escribe su clave en
 * `rate_limit_buckets`, y no debe replicar allí el hash que autentica en
 * `pos_terminal_secrets`. Se comprueba ANTES de autenticar, así el 429 ahorra
 * las cinco consultas.
 */
export const BOOTSTRAP_RATE_LIMIT = { limit: 10, windowMs: 60 * 1000 } as const;
export const BOOTSTRAP_RATE_LIMIT_PREFIX = 'pos-display:bootstrap:tok:';

/** Clave del cubo de `/bootstrap`: digest de dominio propio del token (nunca el token ni `display_token_hash`). */
export function bootstrapRateLimitKey(token: string): string {
  const digest = createHash('sha256').update(`pos-display:bootstrap:${token}`, 'utf8').digest('hex').slice(0, 32);
  return `${BOOTSTRAP_RATE_LIMIT_PREFIX}${digest}`;
}

/**
 * Cubo del EMISOR de códigos (`POST /api/pos/terminals/[id]/pairing-code`),
 * F3-C ronda 4 · 5: era la única ruta de la fase sin cubo. El riesgo es menor
 * —exige admin/manager resuelto en el servidor— pero cada llamada escribe un
 * secreto y quema el código anterior, así que un bucle accidental (un
 * `useEffect` mal atado) vaciaba la pantalla de emparejamiento de la
 * organización sin que nada lo frenara. 30 peticiones por administrador cada
 * 15 minutos: un emparejamiento normal gasta una o dos, y el cupo cuenta
 * también las aperturas del diálogo (que reutilizan el código vigente y no
 * escriben nada), para que el bucle accidental tope igual.
 */
export const PAIRING_CODE_RATE_LIMIT = { limit: 30, windowMs: 15 * 60 * 1000 } as const;
export const PAIRING_CODE_RATE_LIMIT_PREFIX = 'pos-display:pairing-code:';

/** Clave del cubo: por usuario DENTRO de su organización, ambos resueltos en el servidor. */
export function pairingCodeRateLimitKey(organizationId: number | string, userId: string): string {
  return `${PAIRING_CODE_RATE_LIMIT_PREFIX}${organizationId}:${userId}`;
}

/**
 * Cubo de INTENTOS de la misma ruta (F3-C ronda 5 · 5), con clave propia.
 *
 * El cubo de arriba se comprueba DESPUÉS del gate de rol, a propósito: un
 * cajero que se equivoca de botón no debe gastarle el cupo al administrador.
 * Pero eso dejaba el COSTE sin freno: el 403 se decide con
 * `getServerOrgContext` más la consulta de permisos de `hasOrgAdminOrPermission`,
 * y un usuario autenticado sin rol podía repetir la ruta sin tope. Es la forma
 * del incidente del 14/09 (ráfaga de lecturas sin freno) a pequeña escala, y
 * era la única ruta con sesión de la fase que hacía trabajo caro antes de
 * cualquier cubo.
 *
 * Este se comprueba ANTES del gate de rol y lo consume TODA llamada, tenga rol
 * o no. 60 cada 15 minutos por usuario y organización: el doble del cupo de
 * códigos, así que un administrador real nunca lo alcanza (sus 30 códigos
 * caben de sobra) y quien martillea la ruta sin rol se detiene tras 60
 * resoluciones de permisos en vez de infinitas. Clave distinta para que los
 * 403 sigan sin tocar el cupo del administrador.
 */
export const PAIRING_CODE_ATTEMPT_RATE_LIMIT = { limit: 60, windowMs: 15 * 60 * 1000 } as const;
export const PAIRING_CODE_ATTEMPT_RATE_LIMIT_PREFIX = 'pos-display:pairing-code:intento:';

/** Clave del cubo de intentos: por usuario dentro de su organización, ambos del servidor. */
export function pairingCodeAttemptRateLimitKey(organizationId: number | string, userId: string): string {
  return `${PAIRING_CODE_ATTEMPT_RATE_LIMIT_PREFIX}${organizationId}:${userId}`;
}

/**
 * Intervalo mínimo entre DOS escrituras de `display_last_seen_at` de la
 * misma terminal (ronda 3, qa bajo 5). El latido legítimo es 1/min; el
 * `UPDATE` de `/heartbeat` lleva en el WHERE «nulo o más viejo que esto», así
 * una tableta comprometida que martillee el latido no genera escrituras (0
 * filas afectadas) sin una lectura previa ni un 429 que dejaría sin renovar
 * el JWT a una pantalla legítima.
 */
export const HEARTBEAT_WRITE_INTERVAL_MS = 30 * 1000;

/** Código de 6 dígitos con ceros a la izquierda (000000–999999), de `randomInt`. */
export function generatePairingCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/** Instante de caducidad de un código generado en `now`. */
export function pairingCodeExpiresAt(now: number = Date.now()): Date {
  return new Date(now + PAIRING_CODE_TTL_MS);
}

/** Token en claro para la pantalla: 32 bytes aleatorios en base64url. */
export function generateDisplayToken(): string {
  return randomBytes(DISPLAY_TOKEN_BYTES).toString('base64url');
}

/** sha256 hexadecimal del token: lo ÚNICO que se guarda en `display_token_hash`. */
export function hashDisplayToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * Compara dos hashes hexadecimales en tiempo constante. `null`/vacío (token
 * revocado, fila sin hash) o longitudes distintas → false sin comparar bytes.
 */
export function hashesMatch(expectedHash: string | null | undefined, presentedHash: string): boolean {
  if (typeof expectedHash !== 'string' || expectedHash.length !== SHA256_HEX_LENGTH || presentedHash.length !== SHA256_HEX_LENGTH) {
    return false;
  }
  return timingSafeEqual(Buffer.from(expectedHash, 'utf8'), Buffer.from(presentedHash, 'utf8'));
}

/** Token `Bearer …` de la cabecera Authorization; null si no hay o no es Bearer. */
export function readBearerToken(request: Pick<Request, 'headers'>): string | null {
  const header = request.headers.get('authorization');
  if (!header) return null;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
  return match ? match[1] : null;
}

// ---------------------------------------------------------------------------
// JWT de Realtime
// ---------------------------------------------------------------------------

/**
 * Vida del JWT de Realtime: 5 minutos (ronda 3, qa alto 2). Lo emiten
 * `/bootstrap` y CADA `/heartbeat` (60 s), así la pantalla siempre tiene uno
 * fresco y, tras `/revoke`, el latido da 401 y el canal muere en <= 5 min sin
 * ninguna pieza nueva: las políticas de `realtime.messages` solo se evalúan
 * al unirse o al renovar el token, y el servidor no puede retirar un JWT ya
 * emitido. Esa es la ventana residual, documentada en F3-A y PLAN §11.
 */
export const REALTIME_JWT_TTL_SECONDS = 5 * 60;
/** Variable de entorno con el secreto JWT (HS256) del proyecto Supabase. */
export const SUPABASE_JWT_SECRET_ENV = 'SUPABASE_JWT_SECRET';

/**
 * Conjunto EXACTO de claves del payload del JWT de la pantalla. Guardarraíl
 * (ronda 3, qa crítico 1): el JWT va firmado con el MISMO secreto que valida
 * PostgREST, así que cualquier claim que una política RLS `to public/anon`
 * o una función SECURITY DEFINER lea como confianza convierte a la tableta
 * (o a un token robado) en un cliente de esas tablas para la organización
 * entera. En este proyecto ya leen `auth.jwt() ->> …`: `organization_id`
 * (carts, organization_images, organization_taxes, products, shared_images y
 * seis funciones como current_org_id), `org_id`, `app_role`, `email`; y
 * `auth.uid()` lee `sub`. Por eso:
 * - NUNCA `organization_id`, `org_id`, `app_role`, `email`, ni un `sub` con
 *   forma de uuid. `sub` lleva el prefijo `pos-display:` a propósito: no es
 *   uuid, así que `auth.uid()` no lo convierte en un usuario (una política
 *   con `auth.uid()` falla con 22P02 en vez de evaluar a true; inocuo).
 * - `pos_terminal_id` es el ÚNICO claim propio y solo lo leen
 *   `pos_display_pantalla_recibe/envia` (verificado en pg_policies).
 * - Si la parte B necesitara la organización en el canal, que sea un claim
 *   con prefijo propio (`pos_display_org`) que ninguna política lea, y antes
 *   de añadir CUALQUIER claim: grep de pg_policies y pg_proc por ese nombre.
 * El test `f3a-display-auth.test.ts › guardarraíl` fija este conjunto.
 */
export const REALTIME_JWT_PAYLOAD_KEYS = ['role', 'aud', 'sub', 'pos_terminal_id', 'iat', 'exp'] as const;
/** Claims que NUNCA pueden aparecer en el payload (los lee alguna política o función como confianza). */
export const REALTIME_JWT_FORBIDDEN_CLAIMS = ['organization_id', 'org_id', 'app_role', 'email', 'user_id', 'branch_id'] as const;

export interface RealtimeJwtClaims {
  /** UUID de la terminal; se normaliza a minúsculas (la política de la caja y el canal lo esperan así). */
  terminalId: string;
  /** Segundos de vida; por defecto REALTIME_JWT_TTL_SECONDS. */
  ttlSeconds?: number;
  /** Solo para pruebas: instante «ahora» en ms. */
  now?: number;
}

export interface SignedRealtimeJwt {
  token: string;
  /** Caducidad en ISO 8601. */
  expiresAt: string;
}

function base64url(input: Buffer | string): string {
  return (typeof input === 'string' ? Buffer.from(input, 'utf8') : input).toString('base64url');
}

/**
 * JWT HS256 para Realtime. Claims (y NADA más: ver REALTIME_JWT_PAYLOAD_KEYS):
 * - `role: 'anon'` — el MENOR privilegio que Realtime acepta. Nunca
 *   `authenticated`: ese rol abre en PostgREST las políticas `to authenticated`.
 *   Ojo: `to public` incluye a `anon`, por eso el resto de claims importa
 *   tanto como el rol.
 * - `sub: 'pos-display:<terminalId>'` (no es uuid a propósito) y
 *   `pos_terminal_id`: lo único que leen `pos_display_pantalla_recibe/envia`.
 *   La organización NO viaja: la política del canal no la necesita y
 *   `organization_id` es un claim de confianza en políticas `to public`.
 * - `aud: 'pos-display'`, `iat`, `exp` (5 min).
 * Lanza si el secreto está vacío: el llamador decide el 503.
 */
export function signRealtimeJwt(secret: string, claims: RealtimeJwtClaims): SignedRealtimeJwt {
  if (typeof secret !== 'string' || secret.length === 0) {
    throw new Error(`${SUPABASE_JWT_SECRET_ENV} vacío`);
  }
  const nowSeconds = Math.floor((claims.now ?? Date.now()) / 1000);
  const ttl = claims.ttlSeconds ?? REALTIME_JWT_TTL_SECONDS;
  const exp = nowSeconds + ttl;
  const terminalId = claims.terminalId.toLowerCase();
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload: Record<(typeof REALTIME_JWT_PAYLOAD_KEYS)[number], string | number> = {
    role: 'anon',
    aud: 'pos-display',
    sub: `pos-display:${terminalId}`,
    pos_terminal_id: terminalId,
    iat: nowSeconds,
    exp,
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = createHmac('sha256', secret).update(signingInput).digest('base64url');
  return { token: `${signingInput}.${signature}`, expiresAt: new Date(exp * 1000).toISOString() };
}

/** Decodifica el payload de un JWT SIN verificar la firma. Solo para pruebas y diagnóstico. */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Verifica la firma HS256 de un JWT (tiempo constante). Solo para pruebas y diagnóstico. */
export function verifyJwtSignature(token: string, secret: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const expected = createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest();
  const presented = Buffer.from(parts[2], 'base64url');
  return expected.length === presented.length && timingSafeEqual(expected, presented);
}
