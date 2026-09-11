/// <reference types="jest" />
/**
 * Filtro de sucursal INCLUSIVO: una fila sin sucursal es de la organización
 * entera, no de ninguna.
 *
 * Hallazgo del dueño (2026-09-11, con capturas): la página de Oportunidades
 * mostraba «No se encontraron oportunidades» mientras el pipeline enseñaba 11
 * y la ficha del cliente también. Medido contra la base: **las 35
 * oportunidades de toda la plataforma tienen `branch_id` nulo (el 100 %)**,
 * porque `createOpportunity` nunca lo escribía; y la lista hacía
 * `eq('branch_id', sucursal)`, que descarta lo nulo. Con cualquier sucursal
 * seleccionada la lista quedaba vacía para TODAS las organizaciones.
 *
 * `applyBranchFilter` (estricto) es correcto para tablas donde la sucursal es
 * obligatoria, como `sales`. Para `opportunities`, donde es opcional, hace
 * falta esta variante: `branch_id = X OR branch_id IS NULL`.
 */
import { applyBranchFilter, applyBranchFilterInclusive } from '../branchFilterHelper';

/** Doble mínimo del constructor de consultas: registra qué filtro se aplicó. */
function fakeQuery() {
  const llamadas: Array<{ metodo: string; args: unknown[] }> = [];
  const q: Record<string, unknown> = { llamadas };
  for (const m of ['eq', 'is', 'or']) {
    q[m] = (...args: unknown[]) => { llamadas.push({ metodo: m, args }); return q; };
  }
  return q as unknown as { llamadas: typeof llamadas } & Parameters<typeof applyBranchFilterInclusive>[0];
}

describe('applyBranchFilterInclusive · una fila sin sucursal cuenta en todas', () => {
  it('con sucursal: incluye las de esa sucursal Y las que no tienen ninguna', () => {
    const q = fakeQuery();
    applyBranchFilterInclusive(q, 99);
    expect(q.llamadas).toEqual([{ metodo: 'or', args: ['branch_id.eq.99,branch_id.is.null'] }]);
  });

  it('con «Todas las sucursales» (null) no filtra', () => {
    const q = fakeQuery();
    applyBranchFilterInclusive(q, null);
    expect(q.llamadas).toEqual([]);
  });

  it('sin especificar (undefined) no filtra', () => {
    const q = fakeQuery();
    applyBranchFilterInclusive(q, undefined);
    expect(q.llamadas).toEqual([]);
  });

  it('un valor inválido no se cuela en el filtro (nada de `branch_id.eq.NaN`)', () => {
    for (const malo of [NaN, -1, 0, Infinity]) {
      const q = fakeQuery();
      applyBranchFilterInclusive(q, malo);
      expect(q.llamadas).toEqual([]);
    }
  });

  it('el estricto sigue excluyendo lo nulo: es otro contrato, para tablas con sucursal obligatoria', () => {
    const q = fakeQuery();
    applyBranchFilter(q, 99);
    expect(q.llamadas).toEqual([{ metodo: 'eq', args: ['branch_id', 99] }]);
  });
});
