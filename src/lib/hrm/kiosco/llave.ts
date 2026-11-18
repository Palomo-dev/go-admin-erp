/**
 * Clave del equipo (kiosco o lector de escritorio), plan de Marcación §4.3.
 *
 * La genera el propio equipo (32 bytes al azar) y nunca sale de él salvo en la
 * cabecera `Authorization: Bearer` de sus peticiones. Al pedir el código de
 * vinculación manda solo su SHA-256; la base guarda ese hash y nada más. Revocar
 * la clave en GO Admin corta al equipo al instante.
 *
 * Funciona en el navegador y en Node (Web Crypto).
 */

const LLAVE_RE = /^[0-9a-f]{64}$/;

export function esLlave(v: unknown): v is string {
  return typeof v === 'string' && LLAVE_RE.test(v);
}

function cripto(): Crypto {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c?.getRandomValues || !c.subtle) throw new Error('crypto_no_disponible');
  return c;
}

function hex(b: ArrayBuffer | Uint8Array): string {
  return Array.from(b instanceof Uint8Array ? b : new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join('');
}

export function generarLlave(): string {
  return hex(cripto().getRandomValues(new Uint8Array(32)));
}

export async function hashLlave(llave: string): Promise<string> {
  if (!esLlave(llave)) throw new Error('llave_invalida');
  return hex(await cripto().subtle.digest('SHA-256', new TextEncoder().encode(llave)));
}

/** Lee `Authorization: Bearer <llave>`; null si falta o no tiene la forma. */
export function llaveDeCabecera(valor: string | null | undefined): string | null {
  const m = /^Bearer\s+([0-9a-f]{64})$/i.exec((valor ?? '').trim());
  return m ? m[1].toLowerCase() : null;
}

export function nuevoIdLocal(): string {
  const c = cripto() as Crypto & { randomUUID?: () => string };
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = hex(b);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
