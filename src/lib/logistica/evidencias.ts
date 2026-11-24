/**
 * Evidencias de entrega (fotos, firma, comprobante y fotos de novedad) en el bucket PRIVADO
 * `shipment-pod` (migración 20261123165515).
 *
 * Lo que se guarda en `proof_of_delivery.photo_urls / signature_url` y `delivery_attempts.photo_urls`
 * es la RUTA dentro del bucket: `{organización}/{envío}/{tipo}-{uuid}.{ext}`. Para verla, la pantalla
 * pide enlaces firmados de corta duración a `GET /api/logistica/envios/[id]/evidencias`, que los
 * genera en el servidor con la sesión (la política de lectura del bucket exige ser miembro activo de
 * la organización y ver el envío). Nunca hay URL pública.
 *
 * Este módulo es puro (sin Supabase): decide qué valores guardados son evidencias firmables.
 */

export const BUCKET_EVIDENCIAS = 'shipment-pod';

/** Vida de un enlace firmado, en segundos. Corta: la pantalla vuelve a pedirlos al recargar. */
export const DURACION_ENLACE_EVIDENCIA = 300;

const MARCAS_BUCKET = [`/object/public/${BUCKET_EVIDENCIAS}/`, `/object/sign/${BUCKET_EVIDENCIAS}/`, `/object/authenticated/${BUCKET_EVIDENCIAS}/`];
const SEGMENTO = /^[A-Za-z0-9._-]+$/;

/**
 * Ruta en el bucket de un valor guardado, SOLO si es del envío y la organización dados. Acepta la
 * ruta tal cual o una URL vieja de Storage (pública o firmada) del mismo bucket. Cualquier otra cosa
 * —otra organización, otro envío, otro dominio, `..`— devuelve null y no se firma ni se pinta.
 */
export function rutaEvidencia(valor: string | null | undefined, organizationId: number, shipmentId: string): string | null {
  if (!valor || typeof valor !== 'string') return null;
  let ruta = valor.trim();
  if (/^https?:\/\//i.test(ruta)) {
    const marca = MARCAS_BUCKET.find((m) => ruta.includes(m));
    if (!marca) return null;
    ruta = ruta.slice(ruta.indexOf(marca) + marca.length).split('?')[0];
    try {
      ruta = decodeURIComponent(ruta);
    } catch {
      return null;
    }
  }
  const partes = ruta.split('/');
  if (partes.length !== 3) return null;
  const [org, envio, archivo] = partes;
  if (org !== String(organizationId) || envio.toLowerCase() !== shipmentId.toLowerCase()) return null;
  if (!SEGMENTO.test(archivo) || archivo.startsWith('.')) return null;
  return ruta;
}

/** Valores guardados de una prueba de entrega y de los intentos (sin repetir, sin vacíos). */
export function valoresEvidencia(
  prueba: { signature_url?: string | null; photo_urls?: readonly (string | null)[] | null } | null | undefined,
  intentos: ReadonlyArray<{ photo_urls?: readonly (string | null)[] | null }> | null | undefined,
): string[] {
  const todos = [prueba?.signature_url, ...(prueba?.photo_urls ?? []), ...(intentos ?? []).flatMap((i) => i.photo_urls ?? [])];
  return [...new Set(todos.filter((v): v is string => typeof v === 'string' && v.trim() !== ''))];
}
