/**
 * Foto de evidencia del kiosco (plan de Marcación §5.2, D5; Figma 20.29.3).
 *
 * - Solo con autorización expresa de la persona (`hr_marcacion_consents`,
 *   `foto_evidencia`) y aviso con letrero en la sede. Sin ella, la marca queda
 *   «Sin foto»: no se rechaza.
 * - Se guarda en el bucket privado `hr-marcacion-evidencia` y se borra a los 30
 *   días (7 a 90, por sede). Retención por caso: si la marca tiene un reclamo o
 *   un ajuste abierto (`photo_hold`), no se borra hasta cerrar el caso.
 *
 * Puro: lo mismo que deciden `fn_hr_kiosco_foto_guardada` y
 * `fn_hr_fotos_evidencia_vencidas`, para las pantallas y las pruebas.
 */

export const BUCKET_FOTOS = 'hr-marcacion-evidencia';
export const FOTO_DIAS_MIN = 7;
export const FOTO_DIAS_MAX = 90;
export const FOTO_DIAS_POR_DEFECTO = 30;
/** Tope del archivo (el bucket admite 1 MB; la tablet manda ~60 KB). */
export const FOTO_BYTES_MAX = 700 * 1024;
export const FOTO_ANCHO = 640;
export const FOTO_ALTO = 480;
export const FOTO_CALIDAD = 0.7;
/** Cuenta atrás de 20.29.3 («Mira a la cámara… 3»). */
export const SEGUNDOS_CUENTA_FOTO = 3;

export function diasFotoValidos(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= FOTO_DIAS_MIN && n <= FOTO_DIAS_MAX;
}

const RUTA_RE = /^org\/(\d+)\/(\d{4})\/(\d{2})\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jpg$/;

/** La ruta que arma la base: `org/<org>/<año>/<mes>/<marca>.jpg` (mes de la sede). */
export function esRutaFoto(ruta: unknown, org: number): ruta is string {
  if (typeof ruta !== 'string') return false;
  const m = RUTA_RE.exec(ruta);
  return !!m && Number(m[1]) === org && Number(m[3]) >= 1 && Number(m[3]) <= 12;
}

/** Instante en que vence la foto: hora de la marca + días de la sede. */
export function venceFoto(horaMarcaIso: string, dias: number): string | null {
  const t = Date.parse(horaMarcaIso);
  if (!Number.isFinite(t) || !diasFotoValidos(dias)) return null;
  return new Date(t + dias * 86_400_000).toISOString();
}

export interface FotoMarca {
  photo_path: string | null;
  photo_expires_at: string | null;
  photo_hold: boolean;
  /** Hay un ajuste o reclamo pendiente sobre la marca. */
  caso_abierto: boolean;
}

/** ¿La tarea diaria puede borrar esta foto? Vencida, sin retención y sin caso abierto. */
export function fotoBorrable(f: FotoMarca, ahoraMs: number): boolean {
  if (!f.photo_path || f.photo_hold || f.caso_abierto) return false;
  const v = f.photo_expires_at ? Date.parse(f.photo_expires_at) : NaN;
  return Number.isFinite(v) && v < ahoraMs;
}

/**
 * Foto que manda la tablet: `data:image/jpeg;base64,…` (o webp), hasta 700 KB.
 * Devuelve el tipo y el base64 limpio; null si no es una imagen aceptable.
 */
export function leerFotoDataUrl(v: unknown): { tipo: 'image/jpeg' | 'image/webp'; base64: string; bytes: number } | null {
  if (typeof v !== 'string' || v.length > Math.ceil((FOTO_BYTES_MAX * 4) / 3) + 64) return null;
  const m = /^data:(image\/jpeg|image\/webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(v);
  if (!m) return null;
  const base64 = m[2];
  const relleno = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  const bytes = (base64.length * 3) / 4 - relleno;
  if (bytes <= 0 || bytes > FOTO_BYTES_MAX) return null;
  return { tipo: m[1] as 'image/jpeg' | 'image/webp', base64, bytes };
}
