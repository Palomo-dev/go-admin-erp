/**
 * Un parámetro suelto de la URL: la pestaña elegida (`?pestana=`), la vista
 * (`?vista=`) o el registro activo (`?pipeline=<id>`). Regla de pestañas del
 * 2026-10-05: la pestaña elegida vive en la URL, así sobrevive a recargar, se
 * comparte el enlace y «atrás» / «adelante» la recorren.
 *
 * Igual que `listadoUrl.ts`: lo que llega de la URL se valida contra una lista
 * blanca, el valor por defecto no se escribe (la URL queda corta) y las demás
 * claves se conservan (filtros, paginación, ids abiertos).
 */
import type { LectorParams } from './listadoUrl';

/** El valor de la URL si está en la lista; si no, el de por defecto. */
export function leerOpcionUrl<V extends string>(
  params: LectorParams | null | undefined,
  clave: string,
  valores: readonly V[],
  porDefecto: V,
): V {
  const valor = params?.get(clave)?.trim() ?? '';
  return (valores as readonly string[]).includes(valor) ? (valor as V) : porDefecto;
}

/**
 * Aplica cambios sobre los parámetros actuales: `null` o `''` quitan la clave.
 * El resto de claves se conserva en su orden.
 */
export function escribirParametrosUrl(
  actuales: string | URLSearchParams | null | undefined,
  cambios: Readonly<Record<string, string | null>>,
): URLSearchParams {
  const salida = new URLSearchParams(actuales ? actuales.toString() : '');
  for (const [clave, valor] of Object.entries(cambios)) {
    if (valor === null || valor === '') salida.delete(clave);
    else salida.set(clave, valor);
  }
  return salida;
}

/** `ruta?qs` o solo la ruta si no quedan parámetros. */
export function urlConParametros(ruta: string, params: URLSearchParams): string {
  const qs = params.toString();
  return qs ? `${ruta}?${qs}` : ruta;
}
