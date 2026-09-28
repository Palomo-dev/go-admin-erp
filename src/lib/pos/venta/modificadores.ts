/**
 * Variantes y modificadores del diálogo «Seleccionar variante / Personalizar
 * producto» (`src/components/pos/VariantSelectorDialog.tsx`), L20 del plan.
 * Extracción literal de las reglas: marcar/desmarcar una opción, lo elegido,
 * lo que suman los extras, la validación de obligatorios y mínimos, la
 * variante que coincide con los atributos y cuándo se puede confirmar.
 */
import type { ProductModifierGroup } from '@/lib/services/productModifiersService';

export interface ModificadorElegido {
  groupId: number;
  groupName: string;
  modifierId: number;
  name: string;
  extraPrice: number;
}

/** Opciones marcadas por grupo (id del grupo → ids de las opciones). */
export type SeleccionModificadores = Record<number, Set<number>>;

type GrupoModificadores = Pick<ProductModifierGroup, 'id' | 'name' | 'selection_mode' | 'min_selections' | 'max_selections' | 'required' | 'product_modifiers'>;

/**
 * Marca o desmarca una opción. Selección única: marcar otra reemplaza la
 * anterior y la marcada solo se puede desmarcar si el grupo no es
 * obligatorio. Selección múltiple: no deja pasar de `max_selections`
 * (devuelve la misma selección).
 */
export function alternarModificador(
  prev: SeleccionModificadores,
  group: Pick<GrupoModificadores, 'id' | 'selection_mode' | 'required' | 'max_selections'>,
  modifierId: number,
): SeleccionModificadores {
  const current = new Set(prev[group.id] || []);
  if (group.selection_mode === 'single') {
    // Selección única: si ya estaba marcada, se puede desmarcar (a menos que sea obligatoria)
    if (current.has(modifierId)) {
      if (!group.required) current.clear();
    } else {
      current.clear();
      current.add(modifierId);
    }
  } else {
    if (current.has(modifierId)) {
      current.delete(modifierId);
    } else {
      if (group.max_selections && current.size >= group.max_selections) {
        return prev;
      }
      current.add(modifierId);
    }
  }
  return { ...prev, [group.id]: current };
}

/** Las opciones elegidas, en el orden de los grupos y de sus opciones. */
export function modificadoresElegidos(groups: GrupoModificadores[], selected: SeleccionModificadores): ModificadorElegido[] {
  return groups.flatMap((group) => {
    const ids = selected[group.id] || new Set();
    return (group.product_modifiers || [])
      .filter((m) => ids.has(m.id))
      .map((m) => ({
        groupId: group.id,
        groupName: group.name,
        modifierId: m.id,
        name: m.name,
        extraPrice: m.extra_price,
      }));
  });
}

/** Lo que los extras suman al precio de la variante. */
export function extraDeModificadores(elegidos: Pick<ModificadorElegido, 'extraPrice'>[]): number {
  return elegidos.reduce((sum, m) => sum + (m.extraPrice || 0), 0);
}

/**
 * Primer grupo que no cumple su mínimo: un grupo obligatorio pide al menos
 * una opción (o su `min_selections` si es mayor). Devuelve el mensaje que
 * muestra el diálogo, o null si todo está bien.
 */
export function validarModificadores(groups: GrupoModificadores[], selected: SeleccionModificadores): string | null {
  const falta = faltanteModificadores(groups, selected);
  if (!falta) return null;
  return `Selecciona ${falta.minimo > 1 ? `al menos ${falta.minimo} opciones` : 'una opción'} en "${falta.grupo}"`;
}

/**
 * Lo mismo que `validarModificadores`, sin texto: el grupo que no cumple y
 * cuántas opciones pide (el diálogo lo dice en el idioma activo).
 */
export function faltanteModificadores(groups: GrupoModificadores[], selected: SeleccionModificadores): { grupo: string; minimo: number } | null {
  for (const group of groups) {
    const count = (selected[group.id] || new Set()).size;
    const minRequired = group.required ? Math.max(group.min_selections, 1) : group.min_selections;
    if (count < minRequired) return { grupo: group.name, minimo: minRequired };
  }
  return null;
}

export type ReglaSeleccion = { tipo: 'uno' } | { tipo: 'hasta'; maximo: number } | { tipo: 'varias' };

/** Lo que dice la cabecera del grupo: «Elige 1», «Hasta N» o «Elige varias». */
export function reglaDeSeleccion(group: Pick<GrupoModificadores, 'selection_mode' | 'max_selections'>): ReglaSeleccion {
  if (group.selection_mode === 'single') return { tipo: 'uno' };
  if (group.max_selections) return { tipo: 'hasta', maximo: group.max_selections };
  return { tipo: 'varias' };
}

/** La variante cuyos atributos coinciden con TODOS los elegidos (undefined si ninguna). */
export function buscarVariante<V extends { variant_data: Record<string, string> | null | undefined }>(
  variants: V[],
  attrs: Record<string, string>,
): V | undefined {
  return variants.find(v => {
    if (!v.variant_data) return false;
    return Object.entries(attrs).every(([key, value]) =>
      v.variant_data?.[key] === value
    );
  });
}

/** Valores de cada atributo presentes en las variantes, ordenados. */
export function agruparAtributos(variants: Array<{ variant_data: Record<string, string> | null | undefined }>): Record<string, string[]> {
  const groups: Record<string, Set<string>> = {};
  variants.forEach((variant) => {
    if (variant.variant_data) {
      Object.entries(variant.variant_data).forEach(([key, value]) => {
        if (!groups[key]) groups[key] = new Set();
        groups[key].add(value);
      });
    }
  });

  // Convertir Sets a Arrays
  const groupsArray: Record<string, string[]> = {};
  Object.entries(groups).forEach(([key, values]) => {
    groupsArray[key] = Array.from(values).sort();
  });
  return groupsArray;
}

/** «Agregar al carrito» solo con una variante elegida que tenga precio («Sin precio» no entra). */
export function puedeConfirmarVariante(selectedVariant: { price: number | null } | null): boolean {
  return !!selectedVariant && !!selectedVariant.price;
}
