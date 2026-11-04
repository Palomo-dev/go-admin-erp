/**
 * «Búsquedas populares» del buscador (Encabezado › Diseño › Buscador, `search_popular`).
 *
 * Lista de textos (regla `listaTextos` de mapeoAjustes: máx. 8, 30 caracteres, sin repetir). Sin
 * ninguna (`null`), la tienda muestra las primeras categorías del menú (goadmin-websites
 * lib/website/busquedasPopulares.ts); nunca una lista genérica.
 */
import { OPCIONES_SHELL, normalizarOpcionShell } from '@/lib/website/v2/mapeoAjustes';

const regla = OPCIONES_SHELL.search_popular?.regla;
export const MAX_BUSQUEDAS = regla?.tipo === 'listaTextos' ? regla.max : 8;
export const LARGO_BUSQUEDA = regla?.tipo === 'listaTextos' ? regla.largo : 30;

/** Las guardadas y válidas; `[]` = la tienda usa las categorías del menú. */
export function busquedasGuardadas(a: Record<string, unknown>): string[] {
  const v = normalizarOpcionShell('search_popular', a.search_popular);
  return Array.isArray(v) ? (v as string[]) : [];
}

/** Agrega un texto (recortado, sin repetir sin importar mayúsculas). `null` si no hay nada que cambiar. */
export function cambioAgregarBusqueda(a: Record<string, unknown>, texto: string): Record<string, unknown> | null {
  const limpio = texto.trim().replace(/\s+/g, ' ').slice(0, LARGO_BUSQUEDA);
  const actuales = busquedasGuardadas(a);
  if (!limpio || actuales.length >= MAX_BUSQUEDAS) return null;
  if (actuales.some((x) => x.toLowerCase() === limpio.toLowerCase())) return null;
  return { search_popular: [...actuales, limpio] };
}

/** Quita un texto. Sin ninguna, `null`: vuelven las categorías del menú. */
export function cambioQuitarBusqueda(a: Record<string, unknown>, texto: string): Record<string, unknown> {
  const resto = busquedasGuardadas(a).filter((x) => x !== texto);
  return { search_popular: resto.length > 0 ? resto : null };
}
