/**
 * Lectura y escritura inmutable de campos heredables (`{mode}`) del documento V2 por ruta.
 * Código puro, sin React ni Supabase.
 */
import type { CampoHeredable, DocumentoSitio } from '@/lib/website/contrato/documentoSitio';
import type { RutaHeredable } from './mapeoAjustes';

type Objeto = Record<string, unknown>;

/** Override declarado en el documento para la ruta (`undefined` si no lo declara = hereda). */
export function leerCampo(documento: DocumentoSitio, ruta: RutaHeredable): CampoHeredable<unknown> | undefined {
  let actual: unknown = documento;
  for (const clave of ruta) {
    if (actual === null || typeof actual !== 'object') return undefined;
    actual = (actual as Objeto)[clave];
  }
  return actual as CampoHeredable<unknown> | undefined;
}

/** Valor propio del campo (`null` si hereda, está vacío o no existe). */
export function valorPropioDe(documento: DocumentoSitio | null | undefined, ruta: RutaHeredable): unknown {
  if (!documento) return null;
  const campo = leerCampo(documento, ruta);
  return campo && campo.mode === 'value' ? campo.value : null;
}

/**
 * Devuelve un documento nuevo con el campo fijado. `undefined` borra la clave (equivale a heredar).
 * Nunca muta el documento recibido.
 */
export function fijarCampo(
  documento: DocumentoSitio,
  ruta: RutaHeredable,
  campo: CampoHeredable<unknown> | undefined,
): DocumentoSitio {
  const copia = structuredCloneSeguro(documento) as unknown as Objeto;
  let actual: Objeto = copia;
  for (let i = 0; i < ruta.length - 1; i += 1) {
    const clave = ruta[i];
    const siguiente = actual[clave];
    if (siguiente === null || typeof siguiente !== 'object') actual[clave] = {};
    actual = actual[clave] as Objeto;
  }
  const ultima = ruta[ruta.length - 1];
  if (campo === undefined) delete actual[ultima];
  else actual[ultima] = campo;
  return copia as unknown as DocumentoSitio;
}

/** Clon profundo de datos JSON (el documento siempre es JSON serializable). */
export function structuredCloneSeguro<T>(valor: T): T {
  return JSON.parse(JSON.stringify(valor)) as T;
}
