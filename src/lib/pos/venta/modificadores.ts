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

// ---------------------------------------------------------------------------
// Selector de variantes v2 (Figma `VariantModifierDialog` 155:7980): estado de
// cada botón de atributo, variante al tocar un valor, variante con la que abre
// y por qué no se puede agregar. `is_out_of_stock` llega por variante desde
// `POSService.getProductVariants(padre, { branchFilter })` (regla única en
// `src/lib/pos/stockDisponible.ts`).
// ---------------------------------------------------------------------------

type VarianteConStock = {
  id: number;
  price: number | null;
  variant_data: Record<string, string> | null | undefined;
  is_out_of_stock?: boolean;
};

export interface EstadoValorAtributo {
  valor: string;
  elegido: boolean;
  /** Hay una variante con este valor y el resto de lo elegido. */
  existe: boolean;
  /** La variante que resultaría (o todas las que tienen el valor) está agotada. */
  agotado: boolean;
}

/** Botones de cada atributo: elegido, si la combinación existe y si está agotada. */
export function estadoAtributos<V extends VarianteConStock>(
  variants: V[],
  elegidos: Record<string, string>,
): Array<{ nombre: string; valores: EstadoValorAtributo[] }> {
  return Object.entries(agruparAtributos(variants)).map(([nombre, valores]) => ({
    nombre,
    valores: valores.map((valor) => {
      const exacta = buscarVariante(variants, { ...elegidos, [nombre]: valor });
      const conValor = variants.filter((v) => v.variant_data?.[nombre] === valor);
      return {
        valor,
        elegido: elegidos[nombre] === valor,
        existe: !!exacta,
        agotado: exacta ? !!exacta.is_out_of_stock : conValor.length > 0 && conValor.every((v) => !!v.is_out_of_stock),
      };
    }),
  }));
}

/**
 * Variante al tocar el valor `valor` del atributo `nombre`: la que coincide
 * con todo lo elegido; si esa combinación no existe, la que conserva más
 * atributos de lo elegido con ese valor (disponible antes que agotada). Así
 * ninguna combinación queda inalcanzable por los botones atenuados.
 */
export function varianteAlElegirValor<V extends VarianteConStock>(
  variants: V[],
  elegidos: Record<string, string>,
  nombre: string,
  valor: string,
): V | undefined {
  const exacta = buscarVariante(variants, { ...elegidos, [nombre]: valor });
  if (exacta) return exacta;
  const candidatas = variants.filter((v) => v.variant_data?.[nombre] === valor);
  const coincidencias = (v: V) => Object.entries(elegidos).filter(([k, val]) => k !== nombre && v.variant_data?.[k] === val).length;
  return [...candidatas].sort((a, b) => {
    const porCoincidencia = coincidencias(b) - coincidencias(a);
    if (porCoincidencia !== 0) return porCoincidencia;
    return Number(!!a.is_out_of_stock) - Number(!!b.is_out_of_stock);
  })[0];
}

/**
 * Variante con la que abre el selector: la que pidió el escáner (si llega y
 * existe); si no, la primera disponible con precio; si no, la primera.
 */
export function varianteInicial<V extends VarianteConStock>(variants: V[], preferidaId?: number | null): V | undefined {
  if (preferidaId !== undefined && preferidaId !== null) {
    const pedida = variants.find((v) => v.id === preferidaId);
    if (pedida) return pedida;
  }
  return variants.find((v) => !v.is_out_of_stock && !!v.price) ?? variants.find((v) => !v.is_out_of_stock) ?? variants[0];
}

export type BloqueoVariante = 'agotado' | 'sinPrecio' | 'sinVariante' | null;

/**
 * Por qué no se puede agregar: sin variante elegida, agotada en la sucursal
 * (la misma regla de la tarjeta: con control de stock y sin unidades no se
 * vende) o sin precio vigente (`puedeConfirmarVariante`).
 */
export function bloqueoVariante(variante: { price: number | null; is_out_of_stock?: boolean } | null | undefined): BloqueoVariante {
  if (!variante) return 'sinVariante';
  if (variante.is_out_of_stock) return 'agotado';
  if (!puedeConfirmarVariante(variante)) return 'sinPrecio';
  return null;
}
