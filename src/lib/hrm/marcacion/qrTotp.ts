/**
 * QR de la sede que cambia cada 30 s y sirve una sola vez (plan de Marcación, D9).
 *
 * La pantalla calcula el código en el navegador con la clave del punto (también
 * sin internet) y el servidor lo valida en `fn_hr_marcar`:
 *   firma = primeros 20 hex de HMAC-SHA256(clave, `${relojId}.${paso}.${n}`)
 *   token = `${paso}.${n}.${firma}`
 * `paso` = segundos Unix / 30; `n` = número del código dentro del paso. Cuando
 * alguien marca con el código `n`, la pantalla muestra `n + 1` (así una fila de
 * personas no espera 30 s). La base guarda cada código usado (`hr_qr_codes_used`).
 *
 * Puro y sin React: lo prueban `__tests__/qrTotp.test.ts` con un vector calculado
 * en Postgres con `extensions.hmac`.
 */

export const SEGUNDOS_PASO = 30;
const LARGO_FIRMA = 20;

/** Paso de tiempo de un instante (milisegundos Unix). */
export function pasoDe(ms: number): number {
  return Math.floor(ms / 1000 / SEGUNDOS_PASO);
}

/** Segundos que le quedan al paso actual (1..30). */
export function segundosRestantes(ms: number): number {
  const s = Math.floor(ms / 1000);
  return SEGUNDOS_PASO - (s % SEGUNDOS_PASO);
}

/** Código que toca mostrar: el siguiente al último usado en el paso (o el primero). */
export function siguienteCodigo(usadoHasta: number | null | undefined): number {
  return typeof usadoHasta === 'number' && Number.isInteger(usadoHasta) && usadoHasta >= 0 ? usadoHasta + 1 : 0;
}

function hexABytes(hex: string): Uint8Array {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) throw new Error('clave_invalida');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesAHex(b: ArrayBuffer): string {
  return Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join('');
}

/** Web Crypto del navegador o de Node (pruebas). */
function subtle(): SubtleCrypto {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c?.subtle) throw new Error('crypto_no_disponible');
  return c.subtle;
}

export async function firmaQr(claveHex: string, relojId: string, paso: number, n: number): Promise<string> {
  const s = subtle();
  const clave = await s.importKey('raw', hexABytes(claveHex), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const firma = await s.sign('HMAC', clave, new TextEncoder().encode(`${relojId}.${paso}.${n}`));
  return bytesAHex(firma).slice(0, LARGO_FIRMA);
}

export function tokenQr(paso: number, n: number, firma: string): string {
  return `${paso}.${n}.${firma}`;
}

/** Contenido del QR: el mismo formato que ya lee `leerQr` (`marcacion.ts`). */
export function contenidoQr(args: { relojId: string; org: number; paso: number; n: number; firma: string }): string {
  return JSON.stringify({ type: 'attendance', device_id: args.relojId, token: tokenQr(args.paso, args.n, args.firma), org: args.org });
}

/** Desfase del reloj del navegador contra el servidor (ms), para que el paso sea el del servidor. */
export function desfaseServidor(ahoraServidorIso: string | null | undefined, ahoraLocalMs: number): number {
  const s = ahoraServidorIso ? Date.parse(ahoraServidorIso) : NaN;
  return Number.isFinite(s) ? s - ahoraLocalMs : 0;
}
