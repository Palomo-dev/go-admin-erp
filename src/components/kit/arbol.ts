/**
 * Lógica pura de árboles para listados jerárquicos (categorías hoy; cuentas
 * contables o menús mañana). Sin React: se prueba en `__tests__/arbol.test.ts`.
 *
 * Resuelve lo que el árbol viejo de categorías hacía mal
 * (AUDITORIA-CATALOGO-PRODUCCION.md §2):
 *
 * - **La búsqueda entra en ramas cerradas.** Se filtra sobre el árbol completo,
 *   no sobre lo que está a la vista, y se abren solas las ramas que llevan a
 *   una coincidencia. Los ancestros se muestran como contexto.
 * - **La paginación es por nodos raíz.** Un padre nunca queda en una página y
 *   sus hijas en la siguiente.
 * - **Los descendientes se calculan sobre el árbol completo**, no sobre la
 *   página visible: «Mover a…» deshabilita justo los que crearían un ciclo.
 */

export interface NodoPlano {
  id: number;
  parentId: number | null;
}

export interface NodoArbol<T extends NodoPlano> {
  dato: T;
  nivel: number;
  hijos: NodoArbol<T>[];
}

export interface FilaArbol<T extends NodoPlano> {
  dato: T;
  nivel: number;
  tieneHijos: boolean;
  abierto: boolean;
  /** Está en el resultado solo como ancestro de una coincidencia. */
  contexto: boolean;
}

/**
 * Arma el bosque. Un hijo cuyo padre no está en la lista sube a la raíz (no se
 * pierde). Un ciclo en los datos no cuelga el navegador: el nodo que lo
 * cerraría se trata como raíz.
 */
export function construirArbol<T extends NodoPlano>(
  nodos: readonly T[],
  comparar?: (a: T, b: T) => number,
): NodoArbol<T>[] {
  const porId = new Map<number, NodoArbol<T>>();
  nodos.forEach((dato) => porId.set(dato.id, { dato, nivel: 0, hijos: [] }));

  const raices: NodoArbol<T>[] = [];
  for (const nodo of porId.values()) {
    const padreId = nodo.dato.parentId;
    const padre = padreId !== null ? porId.get(padreId) : undefined;
    if (padre && !esAncestroEn(porId, nodo.dato.id, padreId as number)) padre.hijos.push(nodo);
    else raices.push(nodo);
  }

  const fijarNivel = (lista: NodoArbol<T>[], nivel: number) => {
    if (comparar) lista.sort((a, b) => comparar(a.dato, b.dato));
    for (const n of lista) {
      n.nivel = nivel;
      fijarNivel(n.hijos, nivel + 1);
    }
  };
  fijarNivel(raices, 0);
  return raices;
}

/** ¿`posibleAncestro` está en la cadena de padres de `desde` (incluido)? */
function esAncestroEn<T extends NodoPlano>(porId: Map<number, NodoArbol<T>>, posibleAncestro: number, desde: number): boolean {
  const vistos = new Set<number>();
  let actual: number | null = desde;
  while (actual !== null && !vistos.has(actual)) {
    if (actual === posibleAncestro) return true;
    vistos.add(actual);
    actual = porId.get(actual)?.dato.parentId ?? null;
  }
  return false;
}

/** Ids de todos los descendientes (sin incluir los de partida). */
export function descendientesDe<T extends NodoPlano>(nodos: readonly T[], ids: Iterable<number>): Set<number> {
  const hijosDe = new Map<number, number[]>();
  for (const n of nodos) {
    if (n.parentId === null) continue;
    const lista = hijosDe.get(n.parentId) ?? [];
    lista.push(n.id);
    hijosDe.set(n.parentId, lista);
  }
  const salida = new Set<number>();
  const pendientes = [...ids];
  const origen = new Set(pendientes);
  while (pendientes.length) {
    const id = pendientes.pop() as number;
    for (const hijo of hijosDe.get(id) ?? []) {
      if (salida.has(hijo) || origen.has(hijo)) continue;
      salida.add(hijo);
      pendientes.push(hijo);
    }
  }
  return salida;
}

/** Cadena de ancestros de un nodo, de la raíz al padre inmediato. */
export function ancestrosDe<T extends NodoPlano>(nodos: readonly T[], id: number): T[] {
  const porId = new Map(nodos.map((n) => [n.id, n] as const));
  const salida: T[] = [];
  const vistos = new Set<number>([id]);
  let actual = porId.get(id)?.parentId ?? null;
  while (actual !== null && !vistos.has(actual)) {
    const nodo = porId.get(actual);
    if (!nodo) break;
    salida.unshift(nodo);
    vistos.add(actual);
    actual = nodo.parentId;
  }
  return salida;
}

/** Todos los ids que tienen hijos (para «Expandir todo»). */
export function idsConHijos<T extends NodoPlano>(nodos: readonly T[]): Set<number> {
  const ids = new Set(nodos.map((n) => n.id));
  const salida = new Set<number>();
  for (const n of nodos) if (n.parentId !== null && ids.has(n.parentId)) salida.add(n.parentId);
  return salida;
}

export interface ResultadoFiltroArbol<T extends NodoPlano> {
  /** Raíces del bosque podado: solo ramas con alguna coincidencia. */
  raices: NodoArbol<T>[];
  /** Ids que cumplen el criterio. */
  coincidencias: Set<number>;
  /** Ramas que se abren solas para enseñar una coincidencia. */
  abiertasPorBusqueda: Set<number>;
}

/**
 * Poda el bosque: queda cada nodo que cumple `coincide` y sus ancestros (como
 * contexto). Sin criterio (`coincide` nulo) devuelve el bosque entero.
 */
export function filtrarArbol<T extends NodoPlano>(
  raices: readonly NodoArbol<T>[],
  coincide: ((dato: T) => boolean) | null,
): ResultadoFiltroArbol<T> {
  const coincidencias = new Set<number>();
  const abiertas = new Set<number>();
  if (!coincide) {
    const todas = (lista: readonly NodoArbol<T>[]) => lista.forEach((n) => {
      coincidencias.add(n.dato.id);
      todas(n.hijos);
    });
    todas(raices);
    return { raices: [...raices], coincidencias, abiertasPorBusqueda: abiertas };
  }

  const podar = (lista: readonly NodoArbol<T>[]): NodoArbol<T>[] => {
    const salida: NodoArbol<T>[] = [];
    for (const n of lista) {
      const hijos = podar(n.hijos);
      const propio = coincide(n.dato);
      if (propio) coincidencias.add(n.dato.id);
      if (propio || hijos.length) {
        if (hijos.length) abiertas.add(n.dato.id);
        salida.push({ ...n, hijos });
      }
    }
    return salida;
  };
  return { raices: podar(raices), coincidencias, abiertasPorBusqueda: abiertas };
}

/**
 * Aplana a filas visibles: se baja por un nodo si está abierto (`abiertos`) o
 * si la búsqueda lo abrió. Con búsqueda, un nodo cerrado a mano por el usuario
 * (`cerradosAMano`) se respeta.
 */
export function aplanarArbol<T extends NodoPlano>(
  raices: readonly NodoArbol<T>[],
  opciones: {
    abiertos: ReadonlySet<number>;
    abiertasPorBusqueda?: ReadonlySet<number>;
    cerradosAMano?: ReadonlySet<number>;
    coincidencias?: ReadonlySet<number>;
  },
): FilaArbol<T>[] {
  const { abiertos, abiertasPorBusqueda, cerradosAMano, coincidencias } = opciones;
  const salida: FilaArbol<T>[] = [];
  const recorrer = (lista: readonly NodoArbol<T>[]) => {
    for (const n of lista) {
      const id = n.dato.id;
      const abierto =
        n.hijos.length > 0 &&
        (abiertos.has(id) || (!!abiertasPorBusqueda?.has(id) && !cerradosAMano?.has(id)));
      salida.push({
        dato: n.dato,
        nivel: n.nivel,
        tieneHijos: n.hijos.length > 0,
        abierto,
        contexto: coincidencias ? !coincidencias.has(id) : false,
      });
      if (abierto) recorrer(n.hijos);
    }
  };
  recorrer(raices);
  return salida;
}

/** Página de raíces (1-indexada). `tamano` ≤ 0 devuelve todas. */
export function paginarRaices<T extends NodoPlano>(
  raices: readonly NodoArbol<T>[],
  pagina: number,
  tamano: number,
): NodoArbol<T>[] {
  if (tamano <= 0) return [...raices];
  const desde = (Math.max(1, pagina) - 1) * tamano;
  return raices.slice(desde, desde + tamano);
}

/** Normaliza para buscar sin tildes ni mayúsculas. */
export function normalizarBusqueda(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase()
    .trim();
}
