/**
 * «¿Qué mesas están reservadas ahora?» (POS › Mesas).
 *
 * Una reserva confirmada con mesa marca la mesa como reservada desde 60 min
 * antes de su hora hasta que termina su franja. La hora es de PARED de la
 * sucursal: estos tests fijan el instante con `Z` y no dependen del TZ del
 * proceso, así que deben pasar igual con `TZ=UTC` y `TZ=America/Bogota`
 * (`npm run test:tz-all`).
 */
import {
  VENTANA_RESERVA_MIN,
  diasAConsultar,
  estadoVisualMesa,
  horaDeReserva,
  inicioDeReserva,
  reservasActivasPorMesa,
  type ReservaParaMesa,
} from '@/components/pos/mesas/reservasProximas';
import type { TableWithSession, TableSession } from '@/components/pos/mesas/types';

const BOGOTA = 'America/Bogota'; // UTC-5, sin horario de verano
const MADRID = 'Europe/Madrid'; // UTC+2 en octubre (horario de verano hasta el 25)

const SEDE_BOGOTA = 10;
const SEDE_MADRID = 20;
const zonaDe = (branchId: number) => (branchId === SEDE_MADRID ? MADRID : BOGOTA);

function reserva(over: Partial<ReservaParaMesa> = {}): ReservaParaMesa {
  return {
    id: 'r-1',
    branch_id: SEDE_BOGOTA,
    restaurant_table_id: 'mesa-6',
    customer_name: 'Cliente de prueba',
    customer_phone: null,
    party_size: 4,
    reservation_date: '2026-10-05',
    reservation_time: '20:30:00',
    duration_minutes: 90,
    status: 'confirmed',
    notes: null,
    special_requests: null,
    source: 'website',
    ...over,
  };
}

function mesa(over: Partial<TableWithSession> = {}): TableWithSession {
  return {
    id: 'mesa-6',
    organization_id: 1000,
    branch_id: SEDE_BOGOTA,
    name: 'Mesa 6',
    zone: 'Terraza',
    capacity: 4,
    state: 'free',
    position_x: null,
    position_y: null,
    ...over,
  };
}

const sesion = (status: TableSession['status']): TableSession => ({
  id: 's-1',
  organization_id: 1000,
  restaurant_table_id: 'mesa-6',
  sale_id: null,
  opened_at: '2026-10-06T00:00:00Z',
  closed_at: null,
  server_id: 'u-1',
  customers: 2,
  status,
  notes: null,
});

describe('inicioDeReserva: la hora es de pared de la sucursal', () => {
  test('20:30 en Bogotá es 01:30 UTC del día siguiente', () => {
    expect(inicioDeReserva(reserva(), BOGOTA).toISOString()).toBe('2026-10-06T01:30:00.000Z');
  });

  test('la misma hora de pared en Madrid es otro instante', () => {
    expect(inicioDeReserva(reserva(), MADRID).toISOString()).toBe('2026-10-05T18:30:00.000Z');
  });
});

describe('reservasActivasPorMesa: ventana de 60 minutos', () => {
  test('la ventana es de 60 minutos', () => {
    expect(VENTANA_RESERVA_MIN).toBe(60);
  });

  test('a las 20:00 de Bogotá una reserva de las 20:30 aparta la mesa (faltan 30 min)', () => {
    const activas = reservasActivasPorMesa([reserva()], new Date('2026-10-06T01:00:00Z'), zonaDe);
    expect(activas.get('mesa-6')?.reserva.id).toBe('r-1');
    expect(activas.get('mesa-6')?.minutosParaInicio).toBe(30);
  });

  test('borde inferior: 19:30 entra, 19:29 no', () => {
    expect(reservasActivasPorMesa([reserva()], new Date('2026-10-06T00:30:00Z'), zonaDe).has('mesa-6')).toBe(true);
    expect(reservasActivasPorMesa([reserva()], new Date('2026-10-06T00:29:00Z'), zonaDe).has('mesa-6')).toBe(false);
  });

  test('el cliente que llega tarde sigue teniendo la mesa hasta que acaba su franja', () => {
    const tarde = reservasActivasPorMesa([reserva()], new Date('2026-10-06T02:45:00Z'), zonaDe); // 21:45
    expect(tarde.get('mesa-6')?.minutosParaInicio).toBe(-75);
    // 20:30 + 90 min = 22:00: la franja termina y la mesa deja de estar apartada.
    expect(reservasActivasPorMesa([reserva()], new Date('2026-10-06T03:00:00Z'), zonaDe).has('mesa-6')).toBe(false);
  });

  test('sin duración usa la de la tabla (90 min)', () => {
    const sinDuracion = reserva({ duration_minutes: null });
    expect(reservasActivasPorMesa([sinDuracion], new Date('2026-10-06T02:59:00Z'), zonaDe).has('mesa-6')).toBe(true);
    expect(reservasActivasPorMesa([sinDuracion], new Date('2026-10-06T03:00:00Z'), zonaDe).has('mesa-6')).toBe(false);
  });

  test('una reserva de mañana no marca la mesa hoy', () => {
    const manana = reserva({ reservation_date: '2026-10-06' });
    expect(reservasActivasPorMesa([manana], new Date('2026-10-06T01:00:00Z'), zonaDe).size).toBe(0);
  });

  test.each(['pending', 'seated', 'completed', 'cancelled', 'no_show'])('una reserva %s no aparta la mesa', (status) => {
    expect(reservasActivasPorMesa([reserva({ status })], new Date('2026-10-06T01:00:00Z'), zonaDe).size).toBe(0);
  });

  test('una reserva sin mesa asignada no marca ninguna', () => {
    expect(
      reservasActivasPorMesa([reserva({ restaurant_table_id: null })], new Date('2026-10-06T01:00:00Z'), zonaDe).size,
    ).toBe(0);
  });

  test('cada reserva se mide con la zona de SU sucursal', () => {
    // 20:00 en Bogotá = 03:00 del día siguiente en Madrid: la de Madrid ya pasó.
    const ahora = new Date('2026-10-06T01:00:00Z');
    const madrid = reserva({ id: 'r-mad', branch_id: SEDE_MADRID, restaurant_table_id: 'mesa-m1' });
    const activas = reservasActivasPorMesa([reserva(), madrid], ahora, zonaDe);
    expect(activas.has('mesa-6')).toBe(true);
    expect(activas.has('mesa-m1')).toBe(false);

    // 20:00 en Madrid: la de Madrid entra; la de Bogotá (13:00 allá) no.
    const ahoraMadrid = new Date('2026-10-05T18:00:00Z');
    const activasMadrid = reservasActivasPorMesa([reserva(), madrid], ahoraMadrid, zonaDe);
    expect(activasMadrid.has('mesa-m1')).toBe(true);
    expect(activasMadrid.has('mesa-6')).toBe(false);
  });

  test('con dos reservas en la misma mesa gana la que empieza antes', () => {
    const primera = reserva({ id: 'r-primera', reservation_time: '20:15:00' });
    const segunda = reserva({ id: 'r-segunda', reservation_time: '20:45:00' });
    const activas = reservasActivasPorMesa([segunda, primera], new Date('2026-10-06T01:00:00Z'), zonaDe);
    expect(activas.get('mesa-6')?.reserva.id).toBe('r-primera');
  });

  test('una reserva pasada la medianoche cuenta en la ventana de la noche anterior', () => {
    const madrugada = reserva({ reservation_date: '2026-10-06', reservation_time: '00:15:00' });
    // 23:30 del 5 en Bogotá (04:30Z del 6)
    const activas = reservasActivasPorMesa([madrugada], new Date('2026-10-06T04:30:00Z'), zonaDe);
    expect(activas.get('mesa-6')?.minutosParaInicio).toBe(45);
  });
});

describe('diasAConsultar: rango de reservation_date en la zona de la sede', () => {
  test('a las 23:30 de Bogotá el día es el 5, aunque en UTC ya sea el 6', () => {
    // toISOString().split('T')[0] diría '2026-10-06' para "hoy": el bug que este helper evita.
    const ahora = new Date('2026-10-06T04:30:00Z');
    expect(diasAConsultar(ahora, [BOGOTA])).toEqual({ desde: '2026-10-04', hasta: '2026-10-06' });
  });

  test('a las 20:00 de Bogotá la ventana no cruza el día', () => {
    expect(diasAConsultar(new Date('2026-10-06T01:00:00Z'), [BOGOTA])).toEqual({ desde: '2026-10-04', hasta: '2026-10-05' });
  });

  test('con sucursales en varias zonas cubre los días de todas', () => {
    // 01:00Z del 6: 20:00 del 5 en Bogotá, 03:00 del 6 en Madrid.
    expect(diasAConsultar(new Date('2026-10-06T01:00:00Z'), [BOGOTA, MADRID])).toEqual({
      desde: '2026-10-04',
      hasta: '2026-10-06',
    });
  });

  test('sin zonas usa el fallback del sistema', () => {
    expect(diasAConsultar(new Date('2026-10-06T01:00:00Z'), [])).toEqual({ desde: '2026-10-04', hasta: '2026-10-05' });
  });
});

describe('estadoVisualMesa: la ocupación manda sobre la reserva', () => {
  const activa = reservasActivasPorMesa([reserva()], new Date('2026-10-06T01:00:00Z'), zonaDe).get('mesa-6');

  test('mesa libre con reserva en ventana: reservada', () => {
    expect(estadoVisualMesa(mesa(), activa)).toBe('reserved');
  });

  test('mesa con sesión abierta: ocupada aunque tenga reserva', () => {
    expect(estadoVisualMesa(mesa({ state: 'occupied', session: sesion('active') }), activa)).toBe('occupied');
  });

  test('mesa con estado occupied sin sesión cargada: ocupada', () => {
    expect(estadoVisualMesa(mesa({ state: 'occupied' }), activa)).toBe('occupied');
  });

  test('cuenta solicitada manda sobre todo', () => {
    expect(estadoVisualMesa(mesa({ state: 'occupied', session: sesion('bill_requested') }), activa)).toBe('bill_requested');
  });

  test('el state=reserved persistido sin reserva en ventana ya no marca la mesa', () => {
    expect(estadoVisualMesa(mesa({ state: 'reserved' }), undefined)).toBe('free');
  });

  test('mesa libre sin reserva: libre', () => {
    expect(estadoVisualMesa(mesa(), undefined)).toBe('free');
  });
});

describe('horaDeReserva: «8:00» / «20:30» en la zona de la sede', () => {
  test('noche', () => {
    expect(horaDeReserva({ inicio: new Date('2026-10-06T01:30:00Z'), zona: BOGOTA })).toBe('20:30');
  });

  test('mañana, sin cero a la izquierda', () => {
    expect(horaDeReserva({ inicio: new Date('2026-10-05T13:00:00Z'), zona: BOGOTA })).toBe('8:00');
  });

  test('el mismo instante se pinta con la hora de la sede, no la del equipo', () => {
    expect(horaDeReserva({ inicio: new Date('2026-10-05T18:30:00Z'), zona: MADRID })).toBe('20:30');
  });
});
