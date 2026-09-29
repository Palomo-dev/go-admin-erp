/**
 * Buscador global — reglas puras (sin React, sin Supabase, sin navegador).
 *
 * La normalización es la de la búsqueda única de clientes
 * (`src/lib/clientes/busqueda.ts`, espejo de `normalizar_busqueda` en SQL):
 * minúsculas, sin tildes ni diéresis, lo que no sea [a-z0-9] pasa a espacio, y
 * una consulta de solo dígitos y separadores («1.020.456.789») es UNA palabra
 * con sus dígitos. Una fila coincide si contiene TODAS las palabras.
 */
import { normalizarBusqueda, palabrasBusqueda } from '@/lib/clientes/busqueda';
import {
  ACCIONES_RAPIDAS,
  GRUPOS_ENTIDAD,
  type DefinicionAccion,
  type GrupoResultados,
  type IdAccion,
  type TipoEntidad,
} from './definiciones';

/** Por debajo de esto solo se filtran páginas y acciones (sin viaje al servidor). */
export const MIN_CARACTERES_ENTIDADES = 2;
/** Resultados por grupo (Figma: «límite 5 por grupo»). */
export const LIMITE_POR_GRUPO = 5;
/** Páginas que se ofrecen con el buscador vacío. */
export const PAGINAS_INICIALES = 6;
/** Espera entre la última tecla y la petición. */
export const DEBOUNCE_MS = 200;
/** Consulta más larga que se envía al servidor. */
export const LARGO_MAXIMO_CONSULTA = 120;

export { palabrasBusqueda };

function digitos(valor: string): string {
  return valor.replace(/[^0-9]/g, '');
}

/** `pathname` está en `prefijo` o debajo (`/app/clientes/123` está en `/app/clientes`). */
export function rutaDentroDe(pathname: string, prefijo: string): boolean {
  const ruta = pathname.split(/[?#]/)[0];
  return ruta === prefijo || ruta.startsWith(prefijo.endsWith('/') ? prefijo : `${prefijo}/`);
}

/**
 * ¿Contienen estos campos todas las palabras? Se compara contra el texto
 * normalizado, contra el mismo texto sin espacios («fv001» encuentra
 * «FV-001») y, para las palabras numéricas, contra los dígitos de cada campo
 * («1020456789» encuentra «1.020.456.789»).
 */
export function coincideCampos(campos: readonly (string | number | null | undefined)[], palabras: readonly string[]): boolean {
  if (palabras.length === 0) return false;
  const textos = campos.filter((c) => c !== null && c !== undefined && String(c) !== '').map(String);
  const normal = textos.map(normalizarBusqueda).join(' ');
  const compacto = normal.replace(/ /g, '');
  const soloDigitos = textos.map(digitos).join(' ');
  return palabras.every(
    (p) => normal.includes(p) || compacto.includes(p) || (/^[0-9]+$/.test(p) && soloDigitos.includes(p)),
  );
}

/**
 * Patrón `ilike` para traer candidatos de la base; la coincidencia exacta la
 * decide después `coincideCampos` con las reglas de siempre.
 *
 * - Se usa la palabra más larga (la más selectiva).
 * - Las vocales pasan a `_` (un carácter cualquiera): así «medellin» trae
 *   «Medellín» sin `unaccent` en PostgREST. La ñ no se cubre: «pena» no trae
 *   «Peña» en sucursales, proveedores o espacios (los clientes sí, por la RPC).
 * - Una palabra de solo dígitos (≥ 4) se intercala con `%`: «9001234» trae
 *   «900.123.4…» con cualquier separador.
 *
 * El resultado solo contiene [a-z0-9_%]: es seguro dentro de un `.or()` de
 * PostgREST (sin comas, puntos ni paréntesis que rompan el filtro).
 */
export function patronCandidato(palabras: readonly string[]): string | null {
  const util = palabras.filter((p) => /^[a-z0-9]+$/.test(p));
  if (util.length === 0) return null;
  const palabra = util.reduce((a, b) => (b.length > a.length ? b : a));
  if (/^[0-9]+$/.test(palabra) && palabra.length >= 4) {
    return `%${palabra.split('').join('%')}%`;
  }
  return `%${palabra.replace(/[aeiou]/g, '_')}%`;
}

// ─── Páginas ────────────────────────────────────────────────────────────────

export interface PaginaFiltrable {
  id: string;
  name: string;
  url: string;
  description?: string;
}

/**
 * Páginas que contienen todas las palabras (en el nombre, el módulo o la
 * ruta), ordenadas: primero las que EMPIEZAN por la consulta, luego aquellas
 * en que cada palabra empieza una palabra del nombre, luego el resto; a
 * igualdad, el orden del menú.
 */
export function filtrarPaginas<T extends PaginaFiltrable>(paginas: readonly T[], consulta: string): T[] {
  const palabras = palabrasBusqueda(consulta);
  if (palabras.length === 0) return [];
  const frase = palabras.join(' ');
  const puntuadas: { pagina: T; puntaje: number; orden: number }[] = [];
  paginas.forEach((pagina, orden) => {
    if (!coincideCampos([pagina.name, pagina.description, pagina.url.replace(/^\/app\//, '').replace(/[/-]/g, ' ')], palabras)) return;
    const nombre = normalizarBusqueda(pagina.name);
    const palabrasNombre = nombre.split(' ');
    const puntaje = nombre.startsWith(frase)
      ? 0
      : palabras.every((p) => palabrasNombre.some((w) => w.startsWith(p)))
        ? 1
        : 2;
    puntuadas.push({ pagina, puntaje, orden });
  });
  return puntuadas.sort((a, b) => a.puntaje - b.puntaje || a.orden - b.orden).map((p) => p.pagina);
}

// ─── Visibilidad (servidor) ─────────────────────────────────────────────────

export interface GrupoPermitido {
  tipo: TipoEntidad;
  /** Página visible que respalda el grupo (destino por defecto de sus filas). */
  pagina: string;
}

/** Grupos que la persona puede buscar: los que tienen alguna página visible. */
export function gruposPermitidos(hrefsVisibles: ReadonlySet<string>): GrupoPermitido[] {
  const permitidos: GrupoPermitido[] = [];
  for (const g of GRUPOS_ENTIDAD) {
    const pagina = g.paginas.find((p) => hrefsVisibles.has(p));
    if (pagina) permitidos.push({ tipo: g.tipo, pagina });
  }
  return permitidos;
}

export interface AccesoAcciones {
  hrefsVisibles: ReadonlySet<string>;
  permisos: ReadonlySet<string>;
  esAdmin: boolean;
}

/** Acciones rápidas que la persona puede usar: página visible Y algún permiso (o admin). */
export function accionesPermitidas(
  acceso: AccesoAcciones,
  catalogo: readonly DefinicionAccion[] = ACCIONES_RAPIDAS,
): { id: IdAccion; href: string }[] {
  return catalogo
    .filter((a) => acceso.hrefsVisibles.has(a.pagina))
    .filter((a) => acceso.esAdmin || a.permisos.some((p) => acceso.permisos.has(p)))
    .map((a) => ({ id: a.id, href: a.href }));
}

/** Deja los grupos en el orden de `GRUPOS_ENTIDAD`, sin vacíos y con el límite por grupo. */
export function ordenarGrupos(grupos: readonly GrupoResultados[], limite = LIMITE_POR_GRUPO): GrupoResultados[] {
  const orden = new Map(GRUPOS_ENTIDAD.map((g, i) => [g.tipo, i]));
  return grupos
    .filter((g) => g.items.length > 0)
    .map((g) => ({ tipo: g.tipo, items: g.items.slice(0, limite) }))
    .sort((a, b) => (orden.get(a.tipo) ?? 99) - (orden.get(b.tipo) ?? 99));
}

// ─── Estado de la paleta ────────────────────────────────────────────────────

export type EstadoBusqueda = 'inicial' | 'escribiendo' | 'cargando' | 'resultados' | 'sin-resultados' | 'error';

/**
 * Qué pinta la paleta. `cargando` y `error` se refieren a los datos del
 * servidor; las páginas filtradas en el navegador se enseñan igual.
 */
export function estadoBusqueda(p: {
  consulta: string;
  cargando: boolean;
  error: boolean;
  totalLocal: number;
  totalServidor: number;
}): EstadoBusqueda {
  const texto = p.consulta.trim();
  if (!texto) return 'inicial';
  if (texto.length < MIN_CARACTERES_ENTIDADES) return p.totalLocal > 0 ? 'escribiendo' : 'sin-resultados';
  if (p.cargando) return 'cargando';
  if (p.error && p.totalLocal + p.totalServidor === 0) return 'error';
  return p.totalLocal + p.totalServidor > 0 ? 'resultados' : 'sin-resultados';
}

// ─── Atajos de teclado ──────────────────────────────────────────────────────

export interface TeclaPulsada {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  defaultPrevented: boolean;
  isComposing?: boolean;
}

/**
 * Qué hace una tecla con el buscador global:
 *
 * - **Ctrl K / ⌘ K** alterna la paleta desde cualquier sitio, también desde un
 *   campo (es el atajo universal de las paletas de comandos).
 * - **«/»** la abre solo si (1) no se está escribiendo en un campo editable,
 *   (2) la paleta está cerrada y (3) nadie la atendió antes. La regla de
 *   prioridad con el buscador del listado (`kit/SearchInput`, que también usa
 *   «/»): SearchInput escucha en `document` y hace `preventDefault()`; el
 *   buscador global escucha en `window`, que en la fase de burbuja va DESPUÉS,
 *   y respeta `defaultPrevented`. Resultado: en una página con buscador propio
 *   «/» enfoca ese buscador; en el resto abre la paleta.
 */
export function accionAtajo(e: TeclaPulsada, enCampoEditable: boolean, abierto: boolean): 'alternar' | 'abrir' | null {
  if (e.isComposing) return null;
  if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) return 'alternar';
  if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.defaultPrevented && !enCampoEditable && !abierto) return 'abrir';
  return null;
}
