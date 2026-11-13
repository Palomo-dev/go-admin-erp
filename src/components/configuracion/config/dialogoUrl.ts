/**
 * Estado del diálogo de Configuración en la URL (decisión del dueño: Figma
 * pág. 10, sección 12). El diálogo se abre SOBRE la pantalla actual con un
 * parámetro de búsqueda, así es enlazable y «Atrás» lo cierra:
 *
 *   /app/pos/ventas?config=chat.ia
 *   /app/pos/ventas?config=crm.agente-voz&config_ajuste=desinteres
 *   /app/inicio?config=          (abierto, sin sección: el menú)
 *
 * Los deep links de siempre (`/app/configuracion?modulo=&seccion=#ancla`, las
 * redirecciones de `next.config.js`, `/app/configuracion/asistente` y
 * `/app/configuracion/pos/avisos-cliente`) siguen valiendo: `destinoDesdeRutaVieja`
 * los traduce a la sección del diálogo.
 *
 * Puro (sin React ni `window`): lo usan el proveedor, la página de
 * redirección y las pruebas.
 */
import { resolverSeccion, seccionPorId } from './configSectionsRegistry';

export const PARAM_CONFIG = 'config';
export const PARAM_CONFIG_AJUSTE = 'config_ajuste';
export const PARAM_CONFIG_MOVIDO = 'config_movido';

/** La ruta vieja de la página de Configuración. */
export const RUTA_CONFIGURACION = '/app/configuracion';
/** Pantalla sobre la que se abre el diálogo cuando se llega por un enlace viejo sin pantalla previa. */
export const RUTA_BASE_POR_DEFECTO = '/app/inicio';

export interface DestinoDialogo {
  /** Sección a abrir; `null` abre el diálogo en el menú (en escritorio, la primera sección). */
  seccionId: string | null;
  /** Ajuste a resaltar dentro de la sección. */
  ancla?: string;
  /** Origen de una ruta vieja que se mudó (aviso «se movió aquí»). */
  movido?: string;
}

/** Páginas viejas que hoy son una sección del diálogo. */
const PAGINAS_VIEJAS: Readonly<Record<string, string>> = {
  '/app/configuracion/asistente': 'general.asistente',
  '/app/configuracion/pos/avisos-cliente': 'pos.avisos-cliente',
};

function sinBarraFinal(ruta: string): string {
  return ruta.length > 1 ? ruta.replace(/\/+$/, '') : ruta;
}

function decodificar(texto: string): string {
  try {
    return decodeURIComponent(texto);
  } catch {
    return texto;
  }
}

function limpio(d: DestinoDialogo): DestinoDialogo {
  const out: DestinoDialogo = { seccionId: d.seccionId };
  if (d.ancla) out.ancla = d.ancla;
  if (d.movido) out.movido = d.movido;
  return out;
}

/** ¿La ruta es una de las de Configuración que ahora abren el diálogo? */
export function esRutaVieja(pathname: string): boolean {
  const ruta = sinBarraFinal(pathname);
  return ruta === RUTA_CONFIGURACION || ruta in PAGINAS_VIEJAS;
}

/**
 * Sección del diálogo que pide una ruta vieja de Configuración. `null` si la
 * ruta no es de Configuración (no hay que interceptarla).
 */
export function destinoDesdeRutaVieja(pathname: string, search = '', hash = ''): DestinoDialogo | null {
  const ruta = sinBarraFinal(pathname);
  const q = new URLSearchParams(search);
  const ancla = q.get('ajuste') || decodificar(hash.replace(/^#/, '')) || undefined;
  const movido = q.get('movido') || undefined;

  const pagina = PAGINAS_VIEJAS[ruta];
  if (pagina) return limpio({ seccionId: pagina, ancla, movido });
  if (ruta !== RUTA_CONFIGURACION) return null;

  // Alguien ya armó el enlace con el formato nuevo sobre la ruta vieja.
  const nuevo = leerDestino(q);
  if (nuevo) return nuevo;

  const modulo = q.get('modulo');
  const seccion = modulo ? resolverSeccion(modulo, q.get('seccion'), q.get('tab')) : undefined;
  return limpio({ seccionId: seccion?.id ?? null, ancla: seccion ? ancla : undefined, movido });
}

/** Estado del diálogo en los parámetros de la URL; `null` si está cerrado. */
export function leerDestino(params: Pick<URLSearchParams, 'get' | 'has'>): DestinoDialogo | null {
  if (!params.has(PARAM_CONFIG)) return null;
  const valor = params.get(PARAM_CONFIG) ?? '';
  const seccion = valor ? seccionPorId(valor) : undefined;
  return limpio({
    seccionId: seccion?.id ?? null,
    ancla: seccion ? params.get(PARAM_CONFIG_AJUSTE) || undefined : undefined,
    movido: params.get(PARAM_CONFIG_MOVIDO) || undefined,
  });
}

function separar(href: string): { ruta: string; params: URLSearchParams; hash: string } {
  const [sinHash, ...resto] = href.split('#');
  const [ruta, query] = sinHash.split('?');
  return { ruta, params: new URLSearchParams(query ?? ''), hash: resto.length ? `#${resto.join('#')}` : '' };
}

function unir(ruta: string, params: URLSearchParams, hash: string): string {
  const q = params.toString();
  return `${ruta}${q ? `?${q}` : ''}${hash}`;
}

/** `href` (ruta + query de la pantalla actual) con el diálogo abierto en `destino`. */
export function hrefConDialogo(href: string, destino: DestinoDialogo): string {
  const { ruta, params, hash } = separar(href);
  params.delete(PARAM_CONFIG_AJUSTE);
  params.delete(PARAM_CONFIG_MOVIDO);
  params.set(PARAM_CONFIG, destino.seccionId ?? '');
  if (destino.seccionId && destino.ancla) params.set(PARAM_CONFIG_AJUSTE, destino.ancla);
  if (destino.movido) params.set(PARAM_CONFIG_MOVIDO, destino.movido);
  return unir(ruta, params, hash);
}

/** `href` sin el diálogo (lo que queda al cerrarlo). */
export function hrefSinDialogo(href: string): string {
  const { ruta, params, hash } = separar(href);
  params.delete(PARAM_CONFIG);
  params.delete(PARAM_CONFIG_AJUSTE);
  params.delete(PARAM_CONFIG_MOVIDO);
  return unir(ruta, params, hash);
}
