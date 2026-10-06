import type { SupabaseClient } from '@supabase/supabase-js';
import { desactivarOrganizacion, rechazoDesactivar, tieneSuscripcionStripeViva } from '../organizacionEstadoService';

const viva = { status: 'active', stripe_subscription_id: 'sub_1', cancel_at_period_end: false };

describe('reglas de desactivar', () => {
  it('Stripe sigue cobrando: viva y sin cancelación programada', () => {
    expect(tieneSuscripcionStripeViva([viva])).toBe(true);
    expect(tieneSuscripcionStripeViva([{ ...viva, cancel_at_period_end: true }])).toBe(false);
    expect(tieneSuscripcionStripeViva([{ ...viva, stripe_subscription_id: null }])).toBe(false);
    expect(tieneSuscripcionStripeViva([{ ...viva, status: 'canceled' }])).toBe(false);
    expect(tieneSuscripcionStripeViva([{ ...viva, status: 'trialing' }])).toBe(true);
  });

  it('solo una organización activa; suspendida o inactiva no', () => {
    expect(rechazoDesactivar('active', [])).toBeNull();
    expect(rechazoDesactivar('suspended', [])?.codigo).toBe('ESTADO_NO_PERMITIDO');
    expect(rechazoDesactivar('inactive', [])?.codigo).toBe('ESTADO_NO_PERMITIDO');
  });

  it('con Stripe vivo pide cancelar primero (409)', () => {
    expect(rechazoDesactivar('active', [viva])).toMatchObject({ status: 409, codigo: 'SUSCRIPCION_VIVA' });
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

  it('con Stripe vivo no escribe nada', async () => {
    const { cliente, updates } = clienteFalso({ status: 'active' }, [viva]);
    const r = await desactivarOrganizacion(cliente, 120, 'u1');
    expect(r).toMatchObject({ ok: false, rechazo: { codigo: 'SUSCRIPCION_VIVA' } });
    expect(updates).toHaveLength(0);
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
