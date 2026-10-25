/** QA ROJO 56f889e2 BAJO 1: si no se puede leer `vinculo`, el pago se rechaza (no se asume empleado). */
import { transitionCommission } from '../commissionAdminService';
import { CommissionTransitionError } from '../commissionTransitions';

function cadena(resultado: { data: unknown; error: unknown }) {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order', 'limit']) q[m] = jest.fn(() => q);
  q.maybeSingle = jest.fn(async () => resultado);
  return q;
}

function cliente(vinculo: { data: unknown; error: unknown }) {
  const rpc = jest.fn(() => cadena({ data: { id: 'c1', status: 'paid' }, error: null }));
  const from = jest.fn((tabla: string) =>
    tabla === 'commissions'
      ? cadena({ data: { id: 'c1', status: 'accrued', paid_at: null, metadata: {}, notes: null, organization_id: 7, payee_type: 'employee', payee_id: 'u1' }, error: null })
      : cadena(vinculo),
  );
  return { client: { from, rpc } as never, rpc };
}

describe('resolverVinculo', () => {
  it('rechaza el pago si falta la columna vinculo', async () => {
    const { client, rpc } = cliente({ data: null, error: { message: 'column vendor_commission_rates.vinculo does not exist', code: '42703' } });
    await expect(transitionCommission('pay', 'c1', 7, client)).rejects.toMatchObject({ code: 'VINCULO_NO_DISPONIBLE' });
    await expect(transitionCommission('pay', 'c1', 7, client)).rejects.toBeInstanceOf(CommissionTransitionError);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('sin tarifa registrada sigue como empleado', async () => {
    const { client, rpc } = cliente({ data: null, error: null });
    await transitionCommission('pay', 'c1', 7, client);
    const cambios = (rpc.mock.calls[0] as unknown[])[1] as { p_cambios: { metadata: Record<string, unknown> } };
    expect(cambios.p_cambios.metadata.vinculo).toBe('empleado');
  });
});
