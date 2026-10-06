/**
 * Paquete D (restaurante): el ERP crea, sienta y cancela reservas de mesa por
 * las RPC de la base (migraciones D1 y D4), nunca con un INSERT directo que
 * duplique y contradiga la regla de la RPC.
 */
const rpc = jest.fn();
const from = jest.fn();

jest.mock('@/lib/supabase/config', () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    from: (...a: unknown[]) => from(...a),
    auth: { getUser: async () => ({ data: { user: { id: 'u-1' } } }) },
  },
}));
jest.mock('@/lib/hooks/useOrganization', () => ({ getOrganizationId: () => 140, getCurrentBranchId: () => null }));

import { reservasMesasService } from '@/components/pos/reservas-mesas/reservasMesasService';

/** Cadena de PostgREST mínima: cada método devuelve la cadena; `single` resuelve la fila. */
function cadena(fila: unknown) {
  const c: Record<string, jest.Mock> = {};
  for (const m of ['select', 'eq', 'update', 'in', 'or', 'order', 'gte', 'lte', 'neq', 'not', 'is']) c[m] = jest.fn(() => c);
  c.single = jest.fn(async () => ({ data: fila, error: null }));
  c.maybeSingle = c.single;
  c.insert = jest.fn(() => {
    throw new Error('INSERT directo en restaurant_reservations');
  });
  (c as unknown as { then: unknown }).then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
  return c;
}

beforeEach(() => {
  rpc.mockReset();
  from.mockReset();
});

describe('createReservation', () => {
  it('llama a create_restaurant_reservation (sobrecarga D1) con la sede, la mesa y origen del equipo', async () => {
    rpc.mockResolvedValue({ data: { success: true, reservation_id: 'r-1' }, error: null });
    from.mockImplementation(() => cadena({ id: 'r-1', status: 'confirmed' }));

    const creada = await reservasMesasService.createReservation(
      {
        customer_name: 'Cliente Prueba',
        customer_phone: '3001112233',
        party_size: 4,
        reservation_date: '2026-10-10',
        reservation_time: '19:30',
        restaurant_table_id: 'mesa-1',
        source: 'website',
      },
      115,
    );

    expect(creada.id).toBe('r-1');
    expect(rpc).toHaveBeenCalledTimes(1);
    const [nombre, args] = rpc.mock.calls[0];
    expect(nombre).toBe('create_restaurant_reservation');
    expect(args).toMatchObject({
      p_organization_id: 140,
      p_branch_id: 115,
      p_table_id: 'mesa-1',
      p_party_size: 4,
      p_validar_reglas: true,
      // «website» lo pone solo el sitio: desde el ERP es origen del equipo.
      p_source: 'admin',
    });
    // Los cuatro parámetros sin default de la sobrecarga viajan siempre.
    expect(Object.keys(args)).toEqual(expect.arrayContaining(['p_table_id', 'p_customer_id', 'p_duration_minutes', 'p_validar_reglas']));
    // Nada de INSERT ni de marcar la mesa a mano.
    expect(from).not.toHaveBeenCalledWith('restaurant_tables');
  });

  it('traduce el error con prefijo de la RPC a un mensaje legible', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'AFORO: La mesa ya tiene una reserva en ese horario' } });
    await expect(
      reservasMesasService.createReservation(
        { customer_name: 'X', party_size: 2, reservation_date: '2026-10-10', reservation_time: '19:30' },
        115,
      ),
    ).rejects.toThrow('La mesa ya tiene una reserva en ese horario');
  });
});

describe('sentarReserva y cancelar', () => {
  it('sienta con pos_reserva_sentar (una transacción) y devuelve la sesión', async () => {
    rpc.mockResolvedValue({ data: { table_session_id: 's-1', status: 'seated' }, error: null });
    const r = await reservasMesasService.sentarReserva('r-1', 'mesa-1', 3);
    expect(r.tableSessionId).toBe('s-1');
    expect(rpc).toHaveBeenCalledWith('pos_reserva_sentar', {
      p_organization_id: 140,
      p_reservation_id: 'r-1',
      p_table_id: 'mesa-1',
      p_customers: 3,
    });
  });

  it('cancela por la RPC con p_forzar (el equipo puede cancelar fuera de plazo)', async () => {
    rpc.mockResolvedValue({ data: { success: true }, error: null });
    from.mockImplementation(() => cadena({ id: 'r-1', status: 'cancelled', restaurant_table_id: null }));
    await reservasMesasService.changeStatus('r-1', 'cancelled', 'pidió cambio');
    expect(rpc).toHaveBeenCalledWith('cancel_restaurant_reservation', {
      p_reservation_id: 'r-1',
      p_forzar: true,
      p_reason: 'pidió cambio',
    });
  });

  it('«No se presentó» escribe no_show_at, no cancelled_at', async () => {
    const c = cadena({ id: 'r-1', status: 'no_show', restaurant_table_id: null });
    from.mockImplementation(() => c);
    await reservasMesasService.changeStatus('r-1', 'no_show');
    const datos = c.update.mock.calls[0][0] as Record<string, unknown>;
    expect(datos.status).toBe('no_show');
    expect(datos.no_show_at).toEqual(expect.any(String));
    expect(datos).not.toHaveProperty('cancelled_at');
  });
});

describe('antes de aplicar D1/D4/D5 (PGRST202 / columna inexistente): vía anterior', () => {
  const sinFuncion = { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } };

  /** Cadena que registra insert/update y resuelve con `fila`. */
  function cadenaEscritura(fila: unknown, errorUpdate: unknown = null) {
    const c: Record<string, jest.Mock> = {};
    for (const m of ['select', 'eq', 'in', 'or', 'order', 'gte', 'lte', 'neq', 'not', 'is']) c[m] = jest.fn(() => c);
    c.insert = jest.fn(() => c);
    c.update = jest.fn(() => c);
    c.single = jest.fn(async () => ({ data: fila, error: null }));
    c.maybeSingle = c.single;
    let llamadasUpdate = 0;
    (c as unknown as { then: unknown }).then = (ok: (v: unknown) => unknown) => {
      llamadasUpdate += 1;
      return Promise.resolve({ data: [], error: llamadasUpdate === 1 ? errorUpdate : null }).then(ok);
    };
    return c;
  }

  it('crear: INSERT directo con la sede y origen del equipo', async () => {
    rpc.mockResolvedValue(sinFuncion);
    const c = cadenaEscritura({ id: 'r-9', status: 'confirmed' });
    from.mockImplementation(() => c);
    const creada = await reservasMesasService.createReservation(
      { customer_name: 'X', party_size: 2, reservation_date: '2026-10-10', reservation_time: '19:30', source: 'phone' },
      115,
    );
    expect(creada.id).toBe('r-9');
    const fila = c.insert.mock.calls[0][0] as Record<string, unknown>;
    expect(fila).toMatchObject({ organization_id: 140, branch_id: 115, status: 'confirmed', source: 'phone' });
  });

  it('cancelar: UPDATE a cancelled con el motivo', async () => {
    rpc.mockResolvedValue(sinFuncion);
    const c = cadenaEscritura({ id: 'r-1', status: 'cancelled', restaurant_table_id: null });
    from.mockImplementation(() => c);
    await reservasMesasService.changeStatus('r-1', 'cancelled', 'motivo');
    expect(c.update.mock.calls[0][0]).toMatchObject({ status: 'cancelled', cancellation_reason: 'motivo' });
  });

  it('«No se presentó» sin no_show_at: vuelve a cancelled_at', async () => {
    const c = cadenaEscritura({ id: 'r-1', status: 'no_show', restaurant_table_id: null }, { code: 'PGRST204', message: 'no_show_at' });
    from.mockImplementation(() => c);
    await reservasMesasService.changeStatus('r-1', 'no_show');
    expect(c.update.mock.calls[0][0]).toHaveProperty('no_show_at');
    expect(c.update.mock.calls[1][0]).toMatchObject({ status: 'no_show' });
    expect(c.update.mock.calls[1][0]).toHaveProperty('cancelled_at');
  });

  it('un error con prefijo lleva la clave de i18n para la interfaz', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'PERSONAS: El numero maximo de personas es 6' } });
    await expect(
      reservasMesasService.createReservation({ customer_name: 'X', party_size: 9, reservation_date: '2026-10-10', reservation_time: '19:30' }, 115),
    ).rejects.toMatchObject({ error: { clave: 'personasMaximo', valores: { n: 6 } } });
  });
});
