/// <reference types="jest" />
/**
 * F2 — progreso del discovery sobre la plantilla plana sembrada
 * («Discovery General/Ventas»: lista de `DiscoveryField`, no secciones).
 * Es lo único que valía del `DiscoveryWizard` muerto: contar obligatorias
 * respondidas y saber qué falta. Escrito antes que el código, visto en rojo.
 */
import { discoveryProgress, missingRequired } from '../discoveryProgress';
import type { DiscoveryField } from '../discoveryTemplateService';

const FIELDS: DiscoveryField[] = [
  { id: 'who_is', label: 'Quién es', type: 'text', required: true },
  { id: 'problem', label: 'Problema', type: 'textarea', required: true },
  { id: 'budget', label: 'Presupuesto', type: 'text' },
  { id: 'branches_count', label: 'N° sedes', type: 'number' },
];

describe('discoveryProgress', () => {
  it('sin respuestas: 0 de 4, 0 % y ninguna obligatoria', () => {
    expect(discoveryProgress(FIELDS, {})).toEqual({ answered: 0, total: 4, requiredAnswered: 0, requiredTotal: 2, percent: 0, complete: false });
  });

  it('cuenta solo respuestas con contenido (los espacios no cuentan) y redondea el porcentaje', () => {
    const values = { who_is: 'Gerente', problem: '   ', budget: '2M' };
    expect(discoveryProgress(FIELDS, values)).toEqual({ answered: 2, total: 4, requiredAnswered: 1, requiredTotal: 2, percent: 50, complete: false });
  });

  it('está completo cuando todas las obligatorias tienen respuesta, aunque falten opcionales', () => {
    const p = discoveryProgress(FIELDS, { who_is: 'Gerente', problem: 'Inventario manual' });
    expect(p.complete).toBe(true);
    expect(p.percent).toBe(50);
  });

  it('sin campos obligatorios (la plantilla sembrada), está completo solo con TODOS respondidos', () => {
    const optional = FIELDS.map((f) => ({ ...f, required: false }));
    expect(discoveryProgress(optional, {}).complete).toBe(false);
    expect(discoveryProgress(optional, { budget: '1' }).complete).toBe(false);
    expect(discoveryProgress(optional, { who_is: 'a', problem: 'b', budget: '1', branches_count: '3' }).complete).toBe(true);
    expect(discoveryProgress([], {}).complete).toBe(false);
  });

  it('redondea el porcentaje al entero más cercano (2 de 3 → 67, no 66)', () => {
    const three = FIELDS.slice(0, 3).map((f) => ({ ...f, required: false }));
    expect(discoveryProgress(three, { who_is: 'a', problem: 'b' }).percent).toBe(67);
    expect(discoveryProgress(three, { who_is: 'a' }).percent).toBe(33);
  });

  it('ignora claves que no están en la plantilla (datos de una plantilla anterior)', () => {
    expect(discoveryProgress(FIELDS, { legacy: 'x' }).answered).toBe(0);
  });
});

describe('missingRequired', () => {
  it('lista las obligatorias sin respuesta en el orden de la plantilla', () => {
    expect(missingRequired(FIELDS, { problem: 'x' })).toEqual([{ id: 'who_is', label: 'Quién es', type: 'text', required: true }]);
    expect(missingRequired(FIELDS, { who_is: 'a', problem: 'b' })).toEqual([]);
  });
});
