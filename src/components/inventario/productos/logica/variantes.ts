import { buildVariantDisplayName } from '@/utils/variantUtils';
import { normalizarBusqueda } from '@/components/kit/arbol';

/**
 * Matriz de variantes: una variante es un `products` hijo con `variant_data`
 * ({ Talla: 'M', Color: 'Negro' }). Aquí vive la lógica del generador de
 * combinaciones, del SKU y del nombre que usan el formulario y el detalle.
 */

export type Atributos = Record<string, string>;

export interface TipoAtributo {
  nombre: string;
  valores: string[];
}

/** Producto cartesiano de los tipos con valores (los tipos vacíos se ignoran). */
export function combinarAtributos(tipos: readonly TipoAtributo[]): Atributos[] {
  const conValores = tipos
    .map((t) => ({ nombre: t.nombre.trim(), valores: unicos(t.valores.map((v) => v.trim()).filter(Boolean)) }))
    .filter((t) => t.nombre && t.valores.length > 0);
  if (conValores.length === 0) return [];
  return conValores.reduce<Atributos[]>(
    (acc, tipo) => acc.flatMap((combo) => tipo.valores.map((v) => ({ ...combo, [tipo.nombre]: v }))),
    [{}],
  );
}

/** Clave estable de una combinación (sin mayúsculas ni tildes, orden por tipo). */
export function claveAtributos(attrs: Atributos | null | undefined): string {
  if (!attrs) return '';
  return Object.keys(attrs)
    .filter((k) => (attrs[k] ?? '').toString().trim() !== '')
    .map((k) => [normalizarBusqueda(k), normalizarBusqueda(String(attrs[k]))] as const)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('|');
}

/** Combinaciones del generador que aún no existen como variante. */
export function combinacionesNuevas(tipos: readonly TipoAtributo[], existentes: readonly (Atributos | null | undefined)[]): Atributos[] {
  const ya = new Set(existentes.map(claveAtributos));
  return combinarAtributos(tipos).filter((c) => !ya.has(claveAtributos(c)));
}

/** Parte del SKU para un valor: sin tildes, mayúsculas, alfanumérico, máx. 6. */
export function segmentoSku(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .slice(0, 6);
}

/** SKU de variante: `BASE-VAL1-VAL2`; si ya existe, `-2`, `-3`… */
export function skuVariante(skuBase: string, attrs: Atributos, existentes: ReadonlySet<string> = new Set()): string {
  const base = [skuBase.trim(), ...Object.values(attrs).map(segmentoSku).filter(Boolean)].filter(Boolean).join('-');
  const usados = new Set([...existentes].map((s) => s.toUpperCase()));
  if (!usados.has(base.toUpperCase())) return base;
  let n = 2;
  while (usados.has(`${base}-${n}`.toUpperCase())) n += 1;
  return `${base}-${n}`;
}

/** Nombre legible: «Camiseta (M, Azul)» (misma regla que el POS y la tienda). */
export function nombreVariante(nombrePadre: string, attrs: Atributos | null | undefined): string {
  return buildVariantDisplayName(nombrePadre, attrs ?? {});
}

/** Tipos y valores presentes en las variantes, en orden de aparición. */
export function resumenAtributos(variantes: readonly { attributes?: Atributos | null; variant_data?: Atributos | null }[]): TipoAtributo[] {
  const mapa = new Map<string, string[]>();
  for (const v of variantes) {
    const attrs = v.attributes ?? v.variant_data ?? {};
    for (const [k, val] of Object.entries(attrs)) {
      const valor = String(val ?? '').trim();
      if (!k.trim() || !valor) continue;
      const lista = mapa.get(k) ?? [];
      if (!lista.some((x) => normalizarBusqueda(x) === normalizarBusqueda(valor))) lista.push(valor);
      mapa.set(k, lista);
    }
  }
  return [...mapa.entries()].map(([nombre, valores]) => ({ nombre, valores }));
}

/** Variantes repetidas por atributos (misma combinación dos veces). */
export function combinacionesRepetidas(variantes: readonly { attributes: Atributos }[]): string[] {
  const vistos = new Map<string, number>();
  for (const v of variantes) {
    const k = claveAtributos(v.attributes);
    if (!k) continue;
    vistos.set(k, (vistos.get(k) ?? 0) + 1);
  }
  return [...vistos.entries()].filter(([, n]) => n > 1).map(([k]) => k);
}

function unicos(valores: string[]): string[] {
  const vistos = new Set<string>();
  return valores.filter((v) => {
    const k = normalizarBusqueda(v);
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
}
