/**
 * Lógica pura de la pantalla Equipo comercial (Figma CRM 1411:837770 …
 * 1413:1051): pestañas, resumen legible de las reglas de un territorio,
 * montos compactos y el CSV de Desempeño. Sin React ni I/O.
 */

import type { ContextoMoneda } from '@/lib/utils/moneda';

/** Pestañas del SegmentedControl, más «desempeno» (vista sin pestañas, desde el menú ⋯). */
export const PESTANAS_EQUIPO = ['equipos', 'territorios', 'asignacion', 'desempeno'] as const;
export type PestanaEquipo = (typeof PESTANAS_EQUIPO)[number];
export const SEGMENTOS_EQUIPO = ['equipos', 'territorios', 'asignacion'] as const;

/** Enlaces viejos (`?pestana=asignar|performance`) a la pestaña nueva. */
export function pestanaDesdeUrl(valor: string | null | undefined): PestanaEquipo {
  if (valor === 'asignar') return 'asignacion';
  if (valor === 'performance') return 'desempeno';
  return (PESTANAS_EQUIPO as readonly string[]).includes(valor ?? '') ? (valor as PestanaEquipo) : 'equipos';
}

export interface ReglaTerritorio {
  field_key: string;
  operator: string;
  value: unknown;
  is_required?: boolean;
}

/** Reglas de `territories.criteria` (formato de `assignmentService.TerritoryCriteria`). */
export function reglasDe(criteria: unknown): ReglaTerritorio[] {
  if (!criteria || typeof criteria !== 'object' || Array.isArray(criteria)) return [];
  const rules = (criteria as { rules?: unknown }).rules;
  if (!Array.isArray(rules)) return [];
  return rules.filter(
    (r): r is ReglaTerritorio =>
      !!r && typeof r === 'object' && typeof (r as ReglaTerritorio).field_key === 'string' && typeof (r as ReglaTerritorio).operator === 'string',
  );
}

function valorLegible(v: unknown): string {
  if (Array.isArray(v)) return v.map(valorLegible).join(', ');
  if (v === null || v === undefined) return '—';
  return String(v);
}

/**
 * «Ciudad en Medellín, Envigado, Itagüí» · «Departamento = Cundinamarca o
 * ciudad = Bogotá». Mismo criterio que `evaluateICPCriteria`: las reglas
 * obligatorias se cumplen todas («y») y de las demás basta una («o»).
 * `campo` y `operador` traducen; `y` y `o` son las conjunciones del idioma.
 */
export function resumenReglas(
  criteria: unknown,
  campo: (fieldKey: string) => string,
  operador: (op: string) => string,
  conjunciones: { y: string; o: string },
): string | null {
  const reglas = reglasDe(criteria);
  if (reglas.length === 0) return null;
  let primera = true;
  const texto = (r: ReglaTerritorio) => {
    const etiqueta = campo(r.field_key);
    const inicio = primera ? etiqueta : etiqueta.charAt(0).toLowerCase() + etiqueta.slice(1);
    primera = false;
    return `${inicio} ${operador(r.operator)} ${valorLegible(r.value)}`;
  };
  const obligatorias = reglas.filter((r) => r.is_required).map(texto);
  const opcionales = reglas.filter((r) => !r.is_required).map(texto);
  const o = opcionales.join(` ${conjunciones.o} `);
  if (obligatorias.length === 0) return o;
  const y = obligatorias.join(` ${conjunciones.y} `);
  if (opcionales.length === 0) return y;
  return `${y} ${conjunciones.y} (${o})`;
}

/** «$ 42,0 M» (Figma 1411:837770): notación compacta en la moneda y el locale del contexto. */
export function montoCompacto(valor: number, ctx: Pick<ContextoMoneda, 'code' | 'locale'>): string {
  try {
    return new Intl.NumberFormat(ctx.locale, {
      style: 'currency',
      currency: ctx.code,
      notation: 'compact',
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(valor);
  } catch {
    return String(valor);
  }
}

/** Escapa un campo CSV (comillas, separador, saltos). */
function campoCsv(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csv(encabezados: readonly string[], filas: readonly (readonly (string | number | null | undefined)[])[]): string {
  return [encabezados, ...filas].map((f) => f.map(campoCsv).join(',')).join('\r\n');
}
