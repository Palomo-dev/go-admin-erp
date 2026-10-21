import type { SupabaseClient } from '@supabase/supabase-js';
import { desactivarOrganizacion, rechazoDesactivar, tieneSuscripcionStripeViva } from '../organizacionEstadoService';

const viva = { status: 'active', stripe_subscription_id: 'sub_1', cancel_at_period_end: false };

describe('reglas de desactivar', () => {
  it('una fila con id de Stripe se contrasta; la cancelación programada no', () => {
    expect(tieneSuscripcionStripeViva([viva])).toBe(true);
    expect(tieneSuscripcionStripeViva([{ ...viva, cancel_at_period_end: true }])).toBe(false);
    expect(tieneSuscripcionStripeViva([{ ...viva, stripe_subscription_id: null }])).toBe(false);
    expect(tieneSuscripcionStripeViva([{ ...viva, status: 'canceled' }])).toBe(false);
    expect(tieneSuscripcionStripeViva([{ ...viva, status: 'trialing' }])).toBe(true);
  });

  it('solo una organización activa; suspendida o inactiva no', () => {
    expect(rechazoDesactivar('active')).toBeNull();
    expect(rechazoDesactivar('suspended')?.codigo).toBe('ESTADO_NO_PERMITIDO');
    expect(rechazoDesactivar('inactive')?.codigo).toBe('ESTADO_NO_PERMITIDO');
  });
});

function clienteFalso(org: { status: string } | null, subs: unknown[] = [], cambiada = true) {
  const updates: Array<{ tabla: string; valores: unknown; filtros: Array<[string, unknown]> }> = [];
  const from = (tabla: string) => {
    let actual: { tabla: string; valores: unknown; filtros: Array<[string, unknown]> } | null = null;
    const q: Record<string, unknown> = {};
    Object.assign(q, {
      select: () => q,
      update: (valores: unknown) => {
        actual = { tabla, valores, filtros: [] };
        updates.push(actual);
        return q;
      },
      eq: (col: string, v: unknown) => {
        actual?.filtros.push([col, v]);
        return q;
      },
      maybeSingle: () => Promise.resolve({ data: actual ? (cambiada ? { id: 1 } : null) : org, error: null }),
      then: (res: (v: unknown) => unknown) => Promise.resolve(tabla === 'subscriptions' && !actual ? { data: subs, error: null } : { error: null }).then(res),
    });
    return q;
  };
  return { cliente: { from } as unknown as SupabaseClient, updates };
}

describe('desactivarOrganizacion', () => {
  it('desactiva solo si sigue activa y retira la membresía de quien lo pide', async () => {
    const { cliente, updates } = clienteFalso({ status: 'active' });
    await expect(desactivarOrganizacion(cliente, 120, 'u1')).resolves.toEqual({ ok: true });
    const org = updates.find((u) => u.tabla === 'organizations');
    expect(org?.valores).toMatchObject({ status: 'inactive' });
    expect(org?.filtros).toEqual([['id', 120], ['status', 'active']]);
    const miembro = updates.find((u) => u.tabla === 'organization_members');
    expect(miembro?.filtros).toEqual([['organization_id', 120], ['user_id', 'u1']]);
  });

  it('con una suscripción que va a cobrar no escribe nada', async () => {
    const fila = { ...viva, id: 's-120', stripe_customer_id: 'cus_120' };
    const { cliente, updates } = clienteFalso({ status: 'active' }, [fila]);
    const cancelar = jest.fn();
    const r = await desactivarOrganizacion(cliente, 120, 'u1', {
      leer: async () => ({ existe: true, status: 'active', tieneMedio: true }),
      cancelar,
    });
    expect(r).toMatchObject({ ok: false, rechazo: { status: 409, codigo: 'SUSCRIPCION_VIVA' } });
    expect(cancelar).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });

  it('un id que Stripe no tiene se cierra y la organización se desactiva', async () => {
    const fila = { ...viva, id: 's-88', stripe_customer_id: 'cus_88', metadata: { origen: 'alta' } };
    const { cliente, updates } = clienteFalso({ status: 'active' }, [fila]);
    const r = await desactivarOrganizacion(cliente, 88, 'u1', {
      leer: async () => ({ existe: false, status: '', tieneMedio: false }),
      cancelar: async () => ({ ausente: true }),
    });
    expect(r).toEqual({ ok: true });
    const sub = updates.find((u) => u.tabla === 'subscriptions');
    expect(sub?.valores).toMatchObject({
      status: 'canceled',
      stripe_subscription_id: null,
      cancel_at_period_end: false,
      metadata: {
        origen: 'alta',
        stripe_missing_live: true,
        stripe_subscription_id_test: 'sub_1',
        stripe_customer_id_test: 'cus_88',
      },
    });
    expect(sub?.filtros).toEqual([['id', 's-88'], ['organization_id', 88]]);
    expect(updates.some((u) => u.tabla === 'organizations')).toBe(true);
  });

  it('una ya cancelada en Stripe se sincroniza, conserva el id y no bloquea', async () => {
    const fila = { ...viva, id: 's-131', status: 'active', stripe_subscription_id: 'sub_cerrada' };
    const { cliente, updates } = clienteFalso({ status: 'active' }, [fila]);
    const cancelar = jest.fn();
    const r = await desactivarOrganizacion(cliente, 131, 'u1', {
      leer: async () => ({ existe: true, status: 'canceled', tieneMedio: false }),
      cancelar,
    });
    expect(r).toEqual({ ok: true });
    expect(cancelar).not.toHaveBeenCalled();
    const sub = updates.find((u) => u.tabla === 'subscriptions');
    expect(sub?.valores).toMatchObject({ status: 'canceled', cancel_at_period_end: false });
    expect(sub?.valores).not.toHaveProperty('stripe_subscription_id');
  });

  it('una prueba sin tarjeta se cancela en Stripe y no bloquea', async () => {
    const fila = { ...viva, id: 's-130', status: 'trialing', stripe_subscription_id: 'sub_prueba' };
    const { cliente, updates } = clienteFalso({ status: 'active' }, [fila]);
    const cancelar = jest.fn(async () => ({ ausente: false }));
    const r = await desactivarOrganizacion(cliente, 130, 'u1', {
      leer: async () => ({ existe: true, status: 'trialing', tieneMedio: false }),
      cancelar,
    });
    expect(r).toEqual({ ok: true });
    expect(cancelar).toHaveBeenCalledWith('sub_prueba');
    const sub = updates.find((u) => u.tabla === 'subscriptions');
    expect(sub?.valores).toMatchObject({ status: 'canceled', cancel_at_period_end: false });
    expect(sub?.valores).not.toHaveProperty('stripe_subscription_id');
  });

  it('una suspendida no la toca nadie de la organización', async () => {
    const { cliente, updates } = clienteFalso({ status: 'suspended' });
    const r = await desactivarOrganizacion(cliente, 120, 'u1');
    expect(r.ok).toBe(false);
    expect(updates).toHaveLength(0);
  });

  it('si otro proceso la cambió entre leer y escribir, 409 y la membresía queda igual', async () => {
    const { cliente, updates } = clienteFalso({ status: 'active' }, [], false);
    const r = await desactivarOrganizacion(cliente, 120, 'u1');
    expect(r).toMatchObject({ ok: false, rechazo: { status: 409 } });
    expect(updates.some((u) => u.tabla === 'organization_members')).toBe(false);
  });
});
