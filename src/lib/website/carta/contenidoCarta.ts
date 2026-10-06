/**
 * Contenido propio de la CARTA (sección `menu_full`) que se edita en el constructor de la carta
 * del editor del sitio: orden de los platos, ocultos, destacados y descripción / foto propias de
 * la carta. Va en `content.carta_platos` de la sección (y por tanto en el borrador V2).
 *
 * Qué NO va aquí:
 * - Qué categorías salen y en qué orden: `content.selected_category_ids` (ya existía; su orden es
 *   el de la carta).
 * - Cartas por horario: `content.menus` (variante «Pestañas por horario»).
 * - Precio web, agotado y oculto POR SEDE: `website_branch_products` vía `/api/website/carta-sede`
 *   (datos de operación de la sede, no del diseño del sitio).
 * - El precio base: Inventario (product_prices / product_branch_prices). Nunca se copia aquí.
 *
 * Código puro, sin dependencias. ORIGEN de `ordenarCarta`: goadmin-websites lo copia en
 * `lib/menu/cartaPlatos.ts` para pintar la carta con el mismo orden; si cambia, cambia en los dos.
 */

export interface TextoPlato {
  /** Descripción solo para la carta (vacío = la del producto). */
  descripcion?: string;
  /** Foto solo para la carta (vacío = la del producto). */
  foto_url?: string;
}

export interface CartaPlatos {
  /** Orden de los platos por categoría: `{ "<category_id>": [product_id, …] }`. */
  orden: Record<string, number[]>;
  /** Platos que no salen en la carta (siguen en Inventario y en el POS). */
  ocultos: number[];
  /** Platos destacados (se pintan primero y con distintivo). */
  destacados: number[];
  /** Textos propios de la carta por plato. */
  textos: Record<string, TextoPlato>;
}

export const CARTA_VACIA: Readonly<CartaPlatos> = Object.freeze({ orden: {}, ocultos: [], destacados: [], textos: {} });

/** Límites: el contenido viaja en el documento del sitio (≤ 2 MB). */
export const LIMITES_CARTA = { platos: 2000, descripcion: 500, url: 1000 } as const;

const entero = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : null);

function ids(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  const vistos = new Set<number>();
  const out: number[] = [];
  for (const x of v.slice(0, LIMITES_CARTA.platos)) {
    const n = entero(x);
    if (n !== null && !vistos.has(n)) {
      vistos.add(n);
      out.push(n);
    }
  }
  return out;
}

function urlSegura(v: unknown): string | undefined {
  if (typeof v !== 'string' || !v.trim()) return undefined;
  const t = v.trim().slice(0, LIMITES_CARTA.url);
  return /^https:\/\//i.test(t) || t.startsWith('/') ? t : undefined;
}

/** Lee `content.carta_platos` tolerando datos viejos o mal formados (nunca lanza). */
export function leerCartaPlatos(content: Record<string, unknown> | null | undefined): CartaPlatos {
  const crudo = content?.carta_platos;
  if (!crudo || typeof crudo !== 'object' || Array.isArray(crudo)) return { orden: {}, ocultos: [], destacados: [], textos: {} };
  const c = crudo as Record<string, unknown>;
  const orden: Record<string, number[]> = {};
  if (c.orden && typeof c.orden === 'object' && !Array.isArray(c.orden)) {
    for (const [cat, lista] of Object.entries(c.orden as Record<string, unknown>)) {
      if (/^-?\d+$/.test(cat)) {
        const l = ids(lista);
        if (l.length > 0) orden[cat] = l;
      }
    }
  }
  const textos: Record<string, TextoPlato> = {};
  if (c.textos && typeof c.textos === 'object' && !Array.isArray(c.textos)) {
    for (const [id, t] of Object.entries(c.textos as Record<string, unknown>)) {
      if (!/^\d+$/.test(id) || !t || typeof t !== 'object') continue;
      const tt = t as Record<string, unknown>;
      const descripcion = typeof tt.descripcion === 'string' ? tt.descripcion.trim().slice(0, LIMITES_CARTA.descripcion) : '';
      const foto = urlSegura(tt.foto_url);
      if (descripcion || foto) textos[id] = { ...(descripcion ? { descripcion } : {}), ...(foto ? { foto_url: foto } : {}) };
    }
  }
  return { orden, ocultos: ids(c.ocultos), destacados: ids(c.destacados), textos };
}

/** ¿No hay nada propio? (para no guardar `carta_platos` vacío). */
export function cartaVacia(c: CartaPlatos): boolean {
  return Object.keys(c.orden).length === 0 && c.ocultos.length === 0 && c.destacados.length === 0 && Object.keys(c.textos).length === 0;
}

/** Devuelve el `content` con `carta_platos` actualizado (o sin la clave si queda vacío). */
export function conCartaPlatos(content: Record<string, unknown>, carta: CartaPlatos): Record<string, unknown> {
  const { carta_platos: _anterior, ...resto } = content;
  void _anterior;
  return cartaVacia(carta) ? resto : { ...resto, carta_platos: carta };
}

// ─── Orden de la carta ────────────────────────────────────────────────────────────────────────

export interface PlatoBase {
  id: number;
  category_id: number | null;
}

/**
 * Ordena los platos de una categoría: primero los del orden guardado (en ese orden), después
 * los que no están en él (platos nuevos de Inventario) en el orden de entrada. Los destacados
 * no se mueven aquí: es el orden que el usuario fija arrastrando.
 */
export function ordenarPlatos<T extends PlatoBase>(platos: readonly T[], orden: readonly number[] | undefined): T[] {
  if (!orden || orden.length === 0) return [...platos];
  const pos = new Map(orden.map((id, i) => [id, i]));
  const conOrden = platos.filter((p) => pos.has(p.id)).sort((a, b) => (pos.get(a.id)! - pos.get(b.id)!));
  const sinOrden = platos.filter((p) => !pos.has(p.id));
  return [...conOrden, ...sinOrden];
}

export interface GrupoCarta<T extends PlatoBase> {
  categoryId: number | null;
  platos: T[];
}

/**
 * Agrupa por categoría siguiendo `categorias` (orden de la carta) y ordena cada grupo con
 * `carta.orden`. Con `incluirOcultos: false` (lo que ve el cliente) quita los ocultos; el
 * constructor los muestra atenuados.
 */
export function ordenarCarta<T extends PlatoBase>(
  platos: readonly T[],
  categorias: readonly (number | null)[],
  carta: CartaPlatos,
  opciones: { incluirOcultos?: boolean } = {},
): GrupoCarta<T>[] {
  const ocultos = new Set(carta.ocultos);
  const porCategoria = new Map<number | null, T[]>();
  for (const p of platos) {
    if (!opciones.incluirOcultos && ocultos.has(p.id)) continue;
    const lista = porCategoria.get(p.category_id) ?? [];
    lista.push(p);
    porCategoria.set(p.category_id, lista);
  }
  return categorias
    .map((cat) => ({
      categoryId: cat,
      platos: ordenarPlatos(porCategoria.get(cat) ?? [], carta.orden[String(cat ?? -1)]),
    }))
    .filter((g) => g.platos.length > 0);
}

// ─── Cambios (inmutables) ─────────────────────────────────────────────────────────────────────

/** Mueve un plato dentro de su categoría a la posición `destino` del orden visible. */
export function moverPlato(carta: CartaPlatos, categoryId: number | null, visibles: readonly number[], productId: number, destino: number): CartaPlatos {
  const lista = visibles.filter((id) => id !== productId);
  const i = Math.max(0, Math.min(destino, lista.length));
  lista.splice(i, 0, productId);
  return { ...carta, orden: { ...carta.orden, [String(categoryId ?? -1)]: lista } };
}

function alternar(lista: readonly number[], id: number, activo: boolean): number[] {
  const sin = lista.filter((x) => x !== id);
  return activo ? [...sin, id] : sin;
}

export function fijarOculto(carta: CartaPlatos, productId: number, oculto: boolean): CartaPlatos {
  return { ...carta, ocultos: alternar(carta.ocultos, productId, oculto) };
}

export function fijarDestacado(carta: CartaPlatos, productId: number, destacado: boolean): CartaPlatos {
  return { ...carta, destacados: alternar(carta.destacados, productId, destacado) };
}

export function fijarTexto(carta: CartaPlatos, productId: number, texto: TextoPlato): CartaPlatos {
  const actual = carta.textos[String(productId)] ?? {};
  const siguiente: TextoPlato = { ...actual, ...texto };
  const limpio: TextoPlato = {};
  if (siguiente.descripcion?.trim()) limpio.descripcion = siguiente.descripcion.slice(0, LIMITES_CARTA.descripcion);
  const foto = urlSegura(siguiente.foto_url);
  if (foto) limpio.foto_url = foto;
  const textos = { ...carta.textos };
  if (limpio.descripcion || limpio.foto_url) textos[String(productId)] = limpio;
  else delete textos[String(productId)];
  return { ...carta, textos };
}
