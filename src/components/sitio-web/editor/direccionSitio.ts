/**
 * Direcciones del sitio que se edita (puro: lo prueban los tests).
 *
 * - `baseLienzoSitio`: base pública que pinta el lienzo cuando no hay borrador firmado (legacy,
 *   plantillas de detalle o sin firma de vista previa).
 * - `urlPublicaSitio`: «Ver sitio publicado» del sitio elegido (principal o sede).
 * - `urlLienzoBorrador`: el lienzo sobre el BORRADOR, por la misma vista previa firmada que el
 *   botón «Vista previa» (`/vista-previa/<token>/<ruta>`, capa interior `?marco=1` de
 *   goadmin-websites). Así una página que solo existe en el borrador (sin publicar, o de una sede
 *   aún no activada) no sale «404» en el lienzo, y nadie lee un borrador sin firma.
 *
 * Una sede se resuelve con `baseWebDeSede` (src/lib/organizacion/sucursales.ts), la misma regla
 * que el sitio público. Con una sede elegida y sus datos aún sin llegar, la base es `undefined`
 * (cargando): el lienzo espera en lugar de pintar un instante el sitio del principal.
 */
import { baseWebDeSede, type SedeWeb } from '@/lib/organizacion/sucursales';

/** Lo que hace falta de una sucursal: su id y lo que decide dónde la sirve el sitio. */
export type SucursalWeb = SedeWeb & { id?: number | null };

/** `undefined` = las sedes aún no han llegado. */
function sedeDe(branchId: number, sucursales: readonly SucursalWeb[] | null): SucursalWeb | null | undefined {
  if (sucursales === null) return undefined;
  return sucursales.find((b) => b.id === branchId) ?? null;
}

/**
 * Base del lienzo: el host del principal, o el de la sede que el sitio sirve aparte (`/<slug>` o
 * dominio propio). Una sede que el sitio no sirve aparte se pinta sobre el principal, como antes.
 * `undefined` mientras faltan los datos de las sedes con una sede elegida; `null` sin host.
 */
export function baseLienzoSitio(
  host: string | null,
  branchId: number | null,
  sucursales: readonly SucursalWeb[] | null,
): string | null | undefined {
  if (!host) return null;
  if (branchId === null) return host;
  const sede = sedeDe(branchId, sucursales);
  if (sede === undefined) return undefined;
  return baseWebDeSede(host, sede) ?? host;
}

/**
 * «Ver sitio publicado»: la URL pública del sitio elegido. Principal: la de la organización. Sede:
 * la de ESA sede, o `null` si el sitio no la sirve aparte (sin publicar en la web, inactiva, sin
 * slug ni dominio): abrir el principal haría creer que eso es lo publicado de la sede. `null`
 * también mientras faltan los datos de las sedes.
 */
export function urlPublicaSitio(
  url: string | null,
  branchId: number | null,
  sucursales: readonly SucursalWeb[] | null,
): string | null {
  if (!url) return null;
  if (branchId === null) return url;
  const sede = sedeDe(branchId, sucursales);
  if (!sede) return null;
  return baseWebDeSede(url, sede);
}

/**
 * Lienzo sobre el borrador: `<host>/vista-previa/<token>/<slug>?marco=1` (`home` sin ruta). El
 * host es SIEMPRE el de la organización: el sitio solo acepta el token si la organización del host
 * es la del token, y él mismo antepone la ruta de la sede (`/<slug>`) cuando la sede está
 * publicada en la web. `?preview=1` lo añade el lienzo.
 */
export function urlLienzoBorrador(host: string, token: string, slugPagina: string): string {
  const base = host.replace(/\/+$/, '');
  const ruta =
    slugPagina && slugPagina !== 'home'
      ? `/${slugPagina.split('/').filter(Boolean).map(encodeURIComponent).join('/')}`
      : '';
  return `${base}/vista-previa/${encodeURIComponent(token)}${ruta}?marco=1`;
}

/** Margen para renovar la firma del lienzo antes de que caduque (el enlace dura 24 h). */
export const MARGEN_RENOVAR_FIRMA_MS = 10 * 60 * 1000;

/** ¿Hay que pedir (o renovar) la firma del lienzo para `sitioId`? */
export function pedirFirmaLienzo(
  sitioId: string | null,
  firma: { sitioId: string; token: string | null; caducaEn: number } | null,
  ahora: number,
): boolean {
  if (!sitioId) return false;
  if (!firma || firma.sitioId !== sitioId) return true;
  // Sin firma para este sitio (503 o error): no se insiste; el lienzo usa la dirección pública.
  if (firma.token === null) return false;
  return firma.caducaEn - ahora <= MARGEN_RENOVAR_FIRMA_MS;
}
