/**
 * Lógica pura del catálogo de variantes (sin React ni Supabase): repetidos,
 * cifras, filtros, código para el SKU y el orden con el que el POS, la tienda
 * y el formulario del producto deben mostrar los atributos.
 */
import type { EstiloTipo, ResumenVariantes, TipoVariante, ValorVariante } from './tipos';

/** Sin mayúsculas, tildes ni espacios sobrantes (la misma regla que `fn_variantes_int_norm`). */
export function normalizarNombre(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Clave de «parecido» para marcar repetidos: además de lo anterior, sin
 * signos y sin plural simple. «Talla», «talla.», «Tallas» y «TALLA» dan
 * «talla»; «Tallaje» no.
 */
export function clavePareceIgual(texto: string): string {
  const base = normalizarNombre(texto).replace(/[^a-z0-9 ]+/g, '').replace(/\s+/g, ' ').trim();
  // «colores» → «color», «tallas» → «talla».
  if (base.length > 4 && /[^aeious]es$/.test(base)) return base.slice(0, -2);
  if (base.length > 3 && base.endsWith('s') && !/\d/.test(base)) return base.slice(0, -1);
  return base;
}

/** Grupos de 2 o más elementos con el mismo nombre parecido, en el orden en que aparecen. */
export function gruposRepetidos<T>(items: readonly T[], nombre: (item: T) => string): T[][] {
  const grupos = new Map<string, T[]>();
  for (const item of items) {
    const clave = clavePareceIgual(nombre(item));
    if (!clave) continue;
    const lista = grupos.get(clave);
    if (lista) lista.push(item);
    else grupos.set(clave, [item]);
  }
  return Array.from(grupos.values()).filter((g) => g.length > 1);
}

/**
 * En un grupo de repetidos, el «principal» es el más usado (y, a igualdad, el
 * más antiguo): los demás se muestran como «igual a «Talla»».
 */
export function principalDeGrupo<T extends { id: number; variantes: number }>(grupo: readonly T[]): T {
  return [...grupo].sort((a, b) => b.variantes - a.variantes || a.id - b.id)[0];
}

/** Mapa id → principal del grupo, solo para los que NO son el principal. */
export function mapaRepetidos<T extends { id: number; variantes: number }>(
  items: readonly T[],
  nombre: (item: T) => string,
): Map<number, T> {
  const mapa = new Map<number, T>();
  for (const grupo of gruposRepetidos(items, nombre)) {
    const principal = principalDeGrupo(grupo);
    for (const item of grupo) if (item.id !== principal.id) mapa.set(item.id, principal);
  }
  return mapa;
}

export type EstadoCatalogo = 'activo' | 'inactivo' | 'repetido' | 'sinUsar';

/** Estado que pinta la tabla (Figma: Activo · Repetido · Sin usar · Inactivo). */
export function estadoDe(item: { id: number; activo: boolean; variantes: number; relaciones: number }, repetidos: ReadonlyMap<number, unknown>): EstadoCatalogo {
  if (!item.activo) return 'inactivo';
  if (repetidos.has(item.id)) return 'repetido';
  if (item.variantes === 0 && item.relaciones === 0) return 'sinUsar';
  return 'activo';
}

/** Se puede eliminar solo si nada lo usa (ni `variant_data` ni relaciones por id). */
export function sePuedeEliminar(item: { variantes: number; relaciones: number }): boolean {
  return item.variantes === 0 && item.relaciones === 0;
}

/** Comparación natural: «2» antes que «10», «7.5 US» antes que «10 US». */
export function compararNatural(a: string, b: string, locale = 'es'): number {
  return a.localeCompare(b, locale, { numeric: true, sensitivity: 'base' });
}

// ---------------------------------------------------------------------------
// Orden del catálogo para quien muestra variantes (POS, tienda, formulario)
// ---------------------------------------------------------------------------

export interface CatalogoOrden {
  tipos: ReadonlyArray<Pick<TipoVariante, 'nombre' | 'orden' | 'estilo'>>;
  valores: ReadonlyArray<Pick<ValorVariante, 'valor' | 'orden' | 'hex'> & { tipo: string }>;
}

export interface AtributoOrdenado {
  nombre: string;
  estilo: EstiloTipo;
  valores: Array<{ valor: string; hex: string | null }>;
}

/**
 * Ordena los atributos de un grupo de variantes (`{ Talla: ['L','M','S'] }`)
 * como dice el catálogo: tipos por `display_order`, valores por
 * `display_order`, y lo que no está en el catálogo al final en orden natural.
 * Nombres comparados sin mayúsculas, tildes ni espacios.
 *
 * Es el contrato para el selector de variantes del POS (`agruparAtributos`
 * ordena hoy alfabético: «L, M, S, XL, XS») y para la tienda.
 */
export function ordenarAtributosSegunCatalogo(
  grupos: Readonly<Record<string, readonly string[]>>,
  catalogo: CatalogoOrden,
  locale = 'es',
): AtributoOrdenado[] {
  const tipoDe = new Map(catalogo.tipos.map((t) => [normalizarNombre(t.nombre), t]));
  const valoresDe = new Map<string, Map<string, { orden: number; hex: string | null }>>();
  for (const v of catalogo.valores) {
    const clave = normalizarNombre(v.tipo);
    const mapa = valoresDe.get(clave) ?? new Map<string, { orden: number; hex: string | null }>();
    mapa.set(normalizarNombre(v.valor), { orden: v.orden, hex: v.hex });
    valoresDe.set(clave, mapa);
  }
  const FUERA = Number.MAX_SAFE_INTEGER;
  return Object.entries(grupos)
    .map(([nombre, valores]) => {
      const clave = normalizarNombre(nombre);
      const tipo = tipoDe.get(clave);
      const mapa = valoresDe.get(clave);
      const ordenados = [...valores]
        .map((valor) => ({ valor, meta: mapa?.get(normalizarNombre(valor)) }))
        .sort((a, b) => (a.meta?.orden ?? FUERA) - (b.meta?.orden ?? FUERA) || compararNatural(a.valor, b.valor, locale))
        .map(({ valor, meta }) => ({ valor, hex: tipo?.estilo === 'color' ? (meta?.hex ?? null) : null }));
      return { nombre, estilo: tipo?.estilo ?? 'texto', valores: ordenados, orden: tipo?.orden ?? FUERA };
    })
    .sort((a, b) => a.orden - b.orden || compararNatural(a.nombre, b.nombre, locale))
    .map(({ nombre, estilo, valores }) => ({ nombre, estilo, valores }));
}

/** Catálogo de orden a partir del resumen de la RPC. */
export function catalogoOrdenDe(resumen: Pick<ResumenVariantes, 'tipos' | 'valores'>): CatalogoOrden {
  const nombreTipo = new Map(resumen.tipos.map((t) => [t.id, t.nombre]));
  return {
    tipos: resumen.tipos.filter((t) => t.activo),
    valores: resumen.valores
      .filter((v) => nombreTipo.has(v.tipo_id))
      .map((v) => ({ valor: v.valor, orden: v.orden, hex: v.hex, tipo: nombreTipo.get(v.tipo_id) as string })),
  };
}

// ---------------------------------------------------------------------------
// Formularios
// ---------------------------------------------------------------------------

/** Código corto para el SKU: «Negro» → NEG, «Verde oliva» → VOL, «10 US» → 10US. */
export function codigoSkuSugerido(valor: string): string {
  const limpio = normalizarNombre(valor).toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').trim();
  if (!limpio) return '';
  const palabras = limpio.split(/\s+/);
  if (/^\d/.test(limpio)) return palabras.join('').slice(0, 8);
  if (palabras.length === 1) return palabras[0].slice(0, 3);
  const iniciales = palabras.slice(0, -1).map((p) => p[0]).join('');
  const ultima = palabras[palabras.length - 1];
  return (iniciales + ultima).slice(0, 3);
}

export const HEX_VALIDO = /^#[0-9A-Fa-f]{6}$/;
export const SKU_VALIDO = /^[A-Za-z0-9]{1,8}$/;

/** Normaliza lo que escribe el usuario en el campo hex («6b7c3a» → «#6B7C3A»). */
export function normalizarHex(texto: string): string {
  const t = texto.trim().replace(/^#?/, '#').toUpperCase();
  return t === '#' ? '' : t;
}

/** Nombre que sugiere el tipo para Facebook según su nombre (la heurística de `formatoMeta`). */
export function metaSugerido(nombre: string): TipoVariante['meta'] {
  const n = normalizarNombre(nombre);
  if (/^colou?r(es)?$/.test(n)) return 'color';
  if (/^(talla|tallas|tamano|size|medida)$/.test(n)) return 'size';
  if (/^material(es)?$/.test(n)) return 'material';
  if (/^(estampado|patron|pattern|diseno)$/.test(n)) return 'pattern';
  if (/^(genero|gender|sexo)$/.test(n)) return 'gender';
  if (/^(edad|age|age group)$/.test(n)) return 'age_group';
  return null;
}

// ---------------------------------------------------------------------------
// Cifras y filtros de la página
// ---------------------------------------------------------------------------

export interface CifrasTipos {
  activos: number;
  valores: number;
  tiposConValores: number;
  sinOrden: number;
  repetidos: TipoVariante[][];
  sinUsar: TipoVariante[];
}

export function cifrasTipos(resumen: Pick<ResumenVariantes, 'tipos' | 'valores'>): CifrasTipos {
  const porTipo = new Map<number, ValorVariante[]>();
  for (const v of resumen.valores) porTipo.set(v.tipo_id, [...(porTipo.get(v.tipo_id) ?? []), v]);
  const sinOrden = resumen.tipos.filter((t) => {
    const vals = porTipo.get(t.id) ?? [];
    return vals.length > 1 && vals.every((v) => v.orden === vals[0].orden);
  }).length;
  return {
    activos: resumen.tipos.filter((t) => t.activo).length,
    valores: resumen.valores.length,
    tiposConValores: porTipo.size,
    sinOrden,
    repetidos: gruposRepetidos(resumen.tipos, (t) => t.nombre),
    sinUsar: resumen.tipos.filter((t) => sePuedeEliminar(t)),
  };
}

export interface CifrasValores {
  total: number;
  conMuestra: number;
  repetidos: ValorVariante[][];
  sinUsar: ValorVariante[];
}

export function cifrasValores(valores: readonly ValorVariante[]): CifrasValores {
  const porTipo = new Map<number, ValorVariante[]>();
  for (const v of valores) porTipo.set(v.tipo_id, [...(porTipo.get(v.tipo_id) ?? []), v]);
  return {
    total: valores.length,
    conMuestra: valores.filter((v) => !!v.hex).length,
    repetidos: Array.from(porTipo.values()).flatMap((grupo) => gruposRepetidos(grupo, (v) => v.valor)),
    sinUsar: valores.filter((v) => sePuedeEliminar(v)),
  };
}

export type FiltroEstado = 'todos' | 'activos' | 'inactivos' | 'repetidos' | 'sinUsar';

export function pasaFiltroEstado(estado: EstadoCatalogo, filtro: FiltroEstado): boolean {
  switch (filtro) {
    case 'activos':
      return estado !== 'inactivo';
    case 'inactivos':
      return estado === 'inactivo';
    case 'repetidos':
      return estado === 'repetido';
    case 'sinUsar':
      return estado === 'sinUsar';
    default:
      return true;
  }
}

/** Mueve un id una posición arriba (-1) o abajo (+1) dentro de la lista. */
export function moverEnLista<T>(lista: readonly T[], indice: number, delta: -1 | 1): T[] {
  const destino = indice + delta;
  if (indice < 0 || indice >= lista.length || destino < 0 || destino >= lista.length) return [...lista];
  const copia = [...lista];
  const [item] = copia.splice(indice, 1);
  copia.splice(destino, 0, item);
  return copia;
}

/** Idiomas a los que les falta traducción («Falta fr»). */
export function traduccionesFaltantes(traducciones: Readonly<Record<string, string | undefined>>, idiomas: readonly string[]): string[] {
  return idiomas.filter((i) => !(traducciones[i] ?? '').trim());
}
