/**
 * Búsqueda del `SearchSelect` (Figma `02 Componentes` › SearchSelect).
 * La misma normalización que el árbol y el `MultiSelect`: sin tildes ni
 * mayúsculas. Así «tecnologia» encuentra «Tecnología».
 */
import { normalizarBusqueda } from './arbol';
import { indiceSiguiente } from './navegacionTeclado';

/** Filtra por cualquiera de los textos. Consulta vacía devuelve la lista entera. */
export function filtrarPorTexto<T>(items: readonly T[], busqueda: string, textos: (item: T) => readonly (string | undefined)[]): T[] {
  const q = normalizarBusqueda(busqueda);
  if (!q) return [...items];
  return items.filter((item) => textos(item).some((texto) => !!texto && normalizarBusqueda(texto).includes(q)));
}

/**
 * Mueve el resalte de la lista con las flechas. Da la vuelta en los extremos,
 * igual que el resto de los grupos de opciones del kit.
 */
export function moverResalte(actual: number, total: number, tecla: string): number | null {
  if (total <= 0) return null;
  return indiceSiguiente(actual < 0 ? -1 : actual, total, tecla);
}
