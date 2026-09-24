import { cambiosAuditoria, extremosAuditoria } from '../cambiosAuditoria';

describe('cambiosAuditoria', () => {
  it('lista solo los campos que cambiaron, sin los técnicos', () => {
    const r = cambiosAuditoria({
      before: { id: 1, name: 'A', sku: 'X', status: 'inactive', weight_kg: '1.50', updated_at: 'a', busqueda_nombre: 'a', tag_id: null },
      after: { id: 1, name: 'B', sku: 'X', status: 'active', weight_kg: 1.5, updated_at: 'b', busqueda_nombre: 'b', tag_id: 3 },
    });
    expect(r).toEqual([
      { campo: 'name', antes: 'A', despues: 'B' },
      { campo: 'status', antes: 'inactive', despues: 'active' },
      { campo: 'tag_id', antes: null, despues: 3 },
    ]);
  });

  it('acepta el formato viejo old/new y trata vacío y null como iguales', () => {
    expect(cambiosAuditoria({ old: { brand: null, name: 'A' }, new: { brand: '', name: 'A' } })).toEqual([]);
  });

  it('sin antes o sin después (creación/eliminación) no hay diferencias', () => {
    expect(cambiosAuditoria({ before: null, after: { name: 'A' } })).toEqual([]);
    expect(extremosAuditoria({ after: { name: 'A' } }).despues).toEqual({ name: 'A' });
    expect(cambiosAuditoria('texto')).toEqual([]);
  });
});
