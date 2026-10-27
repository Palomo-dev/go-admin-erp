/**
 * update_category del asistente: con la RLS de UPDATE (fn_categorias_puede_editar) un miembro sin
 * permiso actualiza 0 filas sin error. El chat no puede decir «Categoría actualizada» (QA 27-oct).
 */
import { aiActionsService } from '@/lib/services/aiActionsService';

function supabaseFalso(filasActualizadas: unknown[] | null, error: { code?: string; message: string } | null = null) {
  const update = jest.fn();
  const cadena = (fin: () => unknown) => {
    const q: Record<string, unknown> = {};
    q.eq = () => q;
    q.select = () => (update.mock.calls.length ? Promise.resolve(fin()) : q);
    q.maybeSingle = async () => ({ data: { id: 5, name: 'Bebidas', description: null }, error: null });
    return q;
  };
  return {
    update,
    cliente: {
      from: () => ({
        select: () => cadena(() => null),
        update: (u: unknown) => {
          update(u);
          return cadena(() => ({ data: filasActualizadas, error }));
        },
      }),
    },
  };
}

const ctx = (cliente: unknown) => ({ supabase: cliente as never, organizationId: 1, userId: 'u' });

describe('aiActionsService update_category', () => {
  it('0 filas (RLS sin permiso): error de permiso, no «actualizada»', async () => {
    const f = supabaseFalso([]);
    const r = await aiActionsService.executeAction('update_category', { category_id: 5, name: 'Nuevo' }, ctx(f.cliente));
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe('no_permission');
    expect(r.message).toMatch(/permiso/);
    expect(f.update).toHaveBeenCalledTimes(1);
  });

  it('42501 de la BD: error de permiso', async () => {
    const f = supabaseFalso(null, { code: '42501', message: 'denied' });
    const r = await aiActionsService.executeAction('update_category', { category_id: 5, name: 'Nuevo' }, ctx(f.cliente));
    expect(r.errorCode).toBe('no_permission');
  });

  it('con permiso (1 fila): éxito con deshacer', async () => {
    const f = supabaseFalso([{ id: 5 }]);
    const r = await aiActionsService.executeAction('update_category', { category_id: 5, name: 'Nuevo' }, ctx(f.cliente));
    expect(r.success).toBe(true);
    expect(r.message).toContain('Bebidas');
    expect(r.undo?.kind).toBe('restore_category');
  });
});
