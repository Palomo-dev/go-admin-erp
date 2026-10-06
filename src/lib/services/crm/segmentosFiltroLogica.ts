/**
 * Formato único del filtro de un segmento (Figma CRM 1384:825677: «Todos
 * estos» / «O todos estos»): grupos de reglas, Y dentro de cada grupo y O
 * entre grupos. Lógica pura: la usan el conteo en vivo (`crm_segment_preview`),
 * el recálculo y la materialización de campañas, para que los tres entiendan
 * lo mismo (regla dura 7).
 *
 * Formatos guardados que existen en `segments.filter_json` (verificado por MCP
 * el 2026-10-06):
 *  - lista de reglas `[{field, operator, value}]` (constructor actual) → 1 grupo;
 *  - `{"grupos": [[regla…], …]}` (este formato);
 *  - `{"rules": [...], "groups": [...], "operator": "AND"|"OR"}` (constructor
 *    anterior): con `OR` cada regla y cada subgrupo es un grupo; con `AND` se
 *    juntan en uno.
 * Cualquier otra cosa es `null`: quien la reciba debe fallar CERRADO (nunca
 * «sin filtro = todos los clientes»).
 */

export interface ReglaSegmento {
  field: string;
  operator: string;
  value?: unknown;
}

export interface FiltroSegmento {
  grupos: ReglaSegmento[][];
}

/** Límites de `crm_segment_preview` (5 grupos × 10 reglas). */
export const MAX_GRUPOS = 5;
export const MAX_REGLAS_GRUPO = 10;

function esRegla(x: unknown): x is ReglaSegmento {
  return !!x && typeof x === 'object' && !Array.isArray(x) && typeof (x as ReglaSegmento).field === 'string' && typeof (x as ReglaSegmento).operator === 'string';
}

function reglas(lista: unknown): ReglaSegmento[] | null {
  if (!Array.isArray(lista)) return null;
  if (!lista.every(esRegla)) return null;
  return lista.map(({ field, operator, value }) => ({ field, operator, ...(value === undefined ? {} : { value }) }));
}

export function normalizarFiltroSegmento(filtro: unknown): FiltroSegmento | null {
  if (filtro === null || filtro === undefined) return { grupos: [] };
  if (Array.isArray(filtro)) {
    const r = reglas(filtro);
    return r ? { grupos: r.length ? [r] : [] } : null;
  }
  if (typeof filtro !== 'object') return null;
  const o = filtro as Record<string, unknown>;
  if ('grupos' in o) {
    if (!Array.isArray(o.grupos)) return null;
    const grupos: ReglaSegmento[][] = [];
    for (const g of o.grupos) {
      const r = reglas(g);
      if (!r) return null;
      if (r.length) grupos.push(r);
    }
    return { grupos };
  }
  if ('rules' in o || 'groups' in o) {
    const propias = reglas(o.rules ?? []);
    if (!propias) return null;
    const sub: ReglaSegmento[][] = [];
    for (const g of Array.isArray(o.groups) ? o.groups : []) {
      const r = reglas((g as Record<string, unknown>)?.rules ?? []);
      if (!r) return null;
      if (r.length) sub.push(r);
    }
    if (String(o.operator ?? 'AND').toUpperCase() === 'OR') return { grupos: [...propias.map((r) => [r]), ...sub] };
    const todas = [...propias, ...sub.flat()];
    return { grupos: todas.length ? [todas] : [] };
  }
  return null;
}

/** Cómo se guarda: un solo grupo sigue siendo la lista de siempre (compatible). */
export function filtroParaGuardar(grupos: readonly ReglaSegmento[][]): ReglaSegmento[] | FiltroSegmento {
  const llenos = grupos.filter((g) => g.length > 0);
  return llenos.length <= 1 ? [...(llenos[0] ?? [])] : { grupos: llenos.map((g) => [...g]) };
}

export function filtroDentroDeLimites(f: FiltroSegmento): boolean {
  return f.grupos.length <= MAX_GRUPOS && f.grupos.every((g) => g.length <= MAX_REGLAS_GRUPO);
}
