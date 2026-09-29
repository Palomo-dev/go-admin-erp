/**
 * Política ÚNICA de contraseña de GO Admin (decisión v2-5, docs/design/AUTH-ACCESO-V2.md §9 y §12.4).
 *
 * Una sola regla para registro, restablecer, invitación y perfil (antes había
 * tres: 8 · 8 + 3 reglas · 8 + 4 reglas):
 *  - al menos 10 caracteres;
 *  - distinta del correo (ni el correo completo ni su parte local);
 *  - que no aparezca en filtraciones conocidas (Have I Been Pwned por
 *    k-anonimato: solo sale el prefijo de 5 caracteres del SHA-1; la
 *    contraseña nunca viaja).
 * No se exigen mayúsculas, números ni símbolos: la longitud protege más que la
 * composición y las reglas de composición empujan a patrones previsibles.
 *
 * Isomórfico: se usa en el navegador (medidor) y en el servidor (la decisión
 * final siempre la toma el servidor). Sin imports de Node.
 */

export const LONGITUD_MINIMA_CONTRASENA = 10;

export type NivelFortaleza = 'vacia' | 'debil' | 'aceptable' | 'fuerte';

/** `null` = aún no se sabe (comprobación en curso o sin red). */
export type EstadoFiltracion = boolean | null;

export interface EvaluacionContrasena {
  nivel: NivelFortaleza;
  requisitos: {
    longitud: boolean;
    distintaDelCorreo: boolean;
    /** true = no aparece en filtraciones; null = no comprobado. */
    noFiltrada: EstadoFiltracion;
  };
  /** Cumple la política (con `noFiltrada` null se considera que sí: lo decide el servidor). */
  valida: boolean;
}

export type MotivoRechazo = 'longitud' | 'igual_al_correo' | 'filtrada';

function normalizar(v: string): string {
  return v.normalize('NFKC').trim().toLowerCase();
}

/** ¿La contraseña es el correo o su parte local (con o sin mayúsculas)? */
export function esIgualAlCorreo(contrasena: string, correo?: string | null): boolean {
  if (!correo) return false;
  const c = normalizar(contrasena);
  const e = normalizar(correo);
  if (!c || !e) return false;
  const local = e.split('@')[0];
  return c === e || (local.length >= 3 && c === local);
}

/** Variedad de clases de caracteres (solo para el nivel del medidor, no es requisito). */
function variedad(contrasena: string): number {
  let n = 0;
  if (/[a-záéíóúñü]/.test(contrasena)) n++;
  if (/[A-ZÁÉÍÓÚÑÜ]/.test(contrasena)) n++;
  if (/\d/.test(contrasena)) n++;
  if (/[^A-Za-z0-9áéíóúñüÁÉÍÓÚÑÜ]/.test(contrasena)) n++;
  return n;
}

/**
 * Evalúa una contraseña contra la política. `filtrada` es el resultado de
 * `estaFiltrada` (o null si no se ha comprobado).
 */
export function evaluarContrasena(
  contrasena: string,
  opciones: { correo?: string | null; filtrada?: boolean | null } = {}
): EvaluacionContrasena {
  const longitud = contrasena.length >= LONGITUD_MINIMA_CONTRASENA;
  const distintaDelCorreo = !esIgualAlCorreo(contrasena, opciones.correo);
  const noFiltrada: EstadoFiltracion =
    opciones.filtrada === undefined || opciones.filtrada === null ? null : !opciones.filtrada;

  let nivel: NivelFortaleza;
  if (!contrasena) nivel = 'vacia';
  else if (!longitud || !distintaDelCorreo || noFiltrada === false) nivel = 'debil';
  else if (contrasena.length >= 14 || (contrasena.length >= 12 && variedad(contrasena) >= 3)) nivel = 'fuerte';
  else nivel = 'aceptable';

  return {
    nivel,
    requisitos: { longitud, distintaDelCorreo, noFiltrada },
    valida: longitud && distintaDelCorreo && noFiltrada !== false,
  };
}

/** Primer motivo de rechazo (para el servidor), o null si cumple. */
export function motivoRechazo(
  contrasena: unknown,
  opciones: { correo?: string | null; filtrada?: boolean | null } = {}
): MotivoRechazo | null {
  if (typeof contrasena !== 'string' || contrasena.length < LONGITUD_MINIMA_CONTRASENA) return 'longitud';
  if (esIgualAlCorreo(contrasena, opciones.correo)) return 'igual_al_correo';
  if (opciones.filtrada === true) return 'filtrada';
  return null;
}

async function sha1Hex(texto: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('crypto.subtle no disponible');
  const buf = await subtle.digest('SHA-1', new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

export const URL_RANGO_HIBP = 'https://api.pwnedpasswords.com/range/';

/**
 * ¿Aparece la contraseña en filtraciones conocidas? Consulta el rango de
 * Have I Been Pwned con el prefijo de 5 caracteres del SHA-1 (k-anonimato) y
 * compara el resto aquí. Devuelve null si no se pudo comprobar (sin red,
 * timeout): quien llama decide (el servidor registra y deja pasar para no
 * bloquear altas por una caída de un tercero).
 */
export async function estaFiltrada(
  contrasena: string,
  opciones: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}
): Promise<boolean | null> {
  if (!contrasena) return null;
  const f = opciones.fetchImpl ?? globalThis.fetch;
  if (!f) return null;
  try {
    const hash = await sha1Hex(contrasena);
    const prefijo = hash.slice(0, 5);
    const resto = hash.slice(5);
    const control = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const temporizador = control ? setTimeout(() => control.abort(), opciones.timeoutMs ?? 3500) : null;
    try {
      const res = await f(`${URL_RANGO_HIBP}${prefijo}`, {
        headers: { 'Add-Padding': 'true' },
        signal: control?.signal,
      });
      if (!res.ok) return null;
      const cuerpo = await res.text();
      for (const linea of cuerpo.split('\n')) {
        const [sufijo, cuenta] = linea.trim().split(':');
        if (sufijo && sufijo.toUpperCase() === resto && Number(cuenta) > 0) return true;
      }
      return false;
    } finally {
      if (temporizador) clearTimeout(temporizador);
    }
  } catch {
    return null;
  }
}

/** Clave de next-intl (namespace `acceso.contrasena`) para cada motivo de rechazo. */
export const CLAVE_MOTIVO: Record<MotivoRechazo, string> = {
  longitud: 'errorLongitud',
  igual_al_correo: 'errorIgualCorreo',
  filtrada: 'errorFiltrada',
};
