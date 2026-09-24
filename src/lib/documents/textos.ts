/**
 * Textos de los documentos: namespace `documentos` de next-intl
 * (`messages/<idioma>.json`), el mismo archivo que usa la aplicación.
 *
 * En el servidor no hay `NextIntlClientProvider`: se carga el JSON del idioma
 * pedido y se traduce con la misma sintaxis de argumentos simples de
 * next-intl (`{nombre}`). Una clave que falte en el idioma cae al español y,
 * si tampoco existe, se devuelve la clave (visible en pruebas, nunca vacío).
 *
 * El resultado NO está escapado: el renderizador escapa todo lo que pinta,
 * incluidos los valores interpolados (pueden venir de la base).
 */

import type { IdiomaDocumento } from './tipos';

export type Traductor = (clave: string, vars?: Record<string, string | number | null | undefined>) => string;

type Mensajes = Record<string, unknown>;

function buscar(mensajes: Mensajes | undefined, clave: string): string | null {
  if (!mensajes) return null;
  let nodo: unknown = mensajes;
  for (const parte of clave.split('.')) {
    if (!nodo || typeof nodo !== 'object') return null;
    nodo = (nodo as Record<string, unknown>)[parte];
  }
  return typeof nodo === 'string' ? nodo : null;
}

function interpolar(plantilla: string, vars?: Record<string, string | number | null | undefined>): string {
  if (!vars) return plantilla;
  return plantilla.replace(/\{(\w+)\}/g, (entero, nombre: string) => {
    const valor = vars[nombre];
    return valor === null || valor === undefined ? '' : String(valor);
  });
}

/** Traductor sobre el namespace `documentos` ya cargado (y su respaldo en español). */
export function crearTraductor(documentos: Mensajes | undefined, respaldo?: Mensajes): Traductor {
  return (clave, vars) => {
    const texto = buscar(documentos, clave) ?? buscar(respaldo, clave);
    return texto === null ? clave : interpolar(texto, vars);
  };
}

async function namespaceDocumentos(idioma: IdiomaDocumento): Promise<Mensajes | undefined> {
  let modulo: { default?: Mensajes } & Mensajes;
  switch (idioma) {
    case 'en':
      modulo = await import('../../../messages/en.json');
      break;
    case 'fr':
      modulo = await import('../../../messages/fr.json');
      break;
    case 'pt':
      modulo = await import('../../../messages/pt.json');
      break;
    default:
      modulo = await import('../../../messages/es.json');
  }
  const raiz = (modulo.default ?? modulo) as Mensajes;
  return raiz.documentos as Mensajes | undefined;
}

const cache = new Map<IdiomaDocumento, Promise<Traductor>>();

/** Traductor del idioma pedido, con respaldo en español. Cacheado por proceso. */
export function cargarTextos(idioma: IdiomaDocumento): Promise<Traductor> {
  let hit = cache.get(idioma);
  if (!hit) {
    hit = (async () => {
      const [propio, espanol] = await Promise.all([
        namespaceDocumentos(idioma),
        idioma === 'es' ? Promise.resolve(undefined) : namespaceDocumentos('es'),
      ]);
      return crearTraductor(propio, espanol ?? propio);
    })();
    hit.catch(() => cache.delete(idioma));
    cache.set(idioma, hit);
  }
  return hit;
}
