/**
 * Edición de los grupos de reglas del constructor de segmentos (Figma CRM
 * 1384:825677: «Todos estos» / «O todos estos»). Lógica pura, sin React.
 * Los campos y operadores son los de `FILTER_FIELDS` / `FILTER_OPERATORS`, la
 * misma lista blanca que entiende `crm_segment_preview`.
 */
import { FILTER_FIELDS, FILTER_OPERATORS, type FilterOperator, type FilterRule } from '../types';
import { MAX_GRUPOS, MAX_REGLAS_GRUPO } from '@/lib/services/crm/segmentosFiltroLogica';

export type TipoCampo = 'text' | 'date' | 'array' | 'number';

export function tipoDeCampo(campo: string): TipoCampo {
  return (FILTER_FIELDS.find((f) => f.value === campo)?.type ?? 'text') as TipoCampo;
}

export function operadoresDeCampo(campo: string): FilterOperator[] {
  return (FILTER_OPERATORS[tipoDeCampo(campo)] ?? FILTER_OPERATORS.text).map((o) => o.value);
}

export const sinValor = (op: FilterOperator): boolean => op === 'is_empty' || op === 'is_not_empty';

/** Regla recién añadida: primer campo y su primer operador, sin valor. */
export function reglaNueva(campo: string = FILTER_FIELDS[0].value): FilterRule {
  return { field: campo, operator: operadoresDeCampo(campo)[0], value: '' };
}

/** Cambiar el campo conserva el operador solo si el nuevo tipo lo admite; el valor se limpia. */
export function cambiarCampo(regla: FilterRule, campo: string): FilterRule {
  const ops = operadoresDeCampo(campo);
  return { field: campo, operator: ops.includes(regla.operator) ? regla.operator : ops[0], value: '' };
}

/** `between` guarda `[desde, hasta]`; los demás, un texto. */
export function cambiarOperador(regla: FilterRule, operador: FilterOperator): FilterRule {
  const value = operador === 'between' ? ['', ''] : sinValor(operador) ? '' : Array.isArray(regla.value) ? '' : regla.value;
  return { ...regla, operator: operador, value };
}

export const puedeAnadirGrupo = (grupos: readonly FilterRule[][]): boolean => grupos.length < MAX_GRUPOS;
export const puedeAnadirRegla = (grupo: readonly FilterRule[]): boolean => grupo.length < MAX_REGLAS_GRUPO;

export function anadirRegla(grupos: readonly FilterRule[][], g: number): FilterRule[][] {
  return grupos.map((grupo, i) => (i === g && puedeAnadirRegla(grupo) ? [...grupo, reglaNueva()] : grupo));
}

export function actualizarRegla(grupos: readonly FilterRule[][], g: number, r: number, regla: FilterRule): FilterRule[][] {
  return grupos.map((grupo, i) => (i === g ? grupo.map((x, j) => (j === r ? regla : x)) : grupo));
}

/** Quitar la última regla de un grupo que no es el primero quita el grupo. */
export function quitarRegla(grupos: readonly FilterRule[][], g: number, r: number): FilterRule[][] {
  const siguiente = grupos.map((grupo, i) => (i === g ? grupo.filter((_, j) => j !== r) : grupo));
  return siguiente.filter((grupo, i) => i === 0 || grupo.length > 0);
}

export function anadirGrupo(grupos: readonly FilterRule[][]): FilterRule[][] {
  return puedeAnadirGrupo(grupos) ? [...grupos, [reglaNueva()]] : [...grupos];
}

/** El primer grupo («Todos estos») no se quita: se vacía. */
export function quitarGrupo(grupos: readonly FilterRule[][], g: number): FilterRule[][] {
  if (g === 0) return [[], ...grupos.slice(1)];
  return grupos.filter((_, i) => i !== g);
}
