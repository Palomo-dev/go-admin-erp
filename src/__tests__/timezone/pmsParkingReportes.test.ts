// ============================================================================
// Fase B, tandas 6 y 8 — PMS (tablero y tape chart) y parqueadero (tablero y
// reportes) se cortan por el día del negocio, no por el de UTC.
// ============================================================================
// Aquí conviven las dos familias de columnas, y el arreglo NO es el mismo.
// Verificado por MCP en `information_schema.columns`:
//
//   **date**         `reservations.checkin` / `.checkout`,
//                    `reservation_blocks.date_from` / `.date_to`,
//                    `parking_passes.start_date` / `.end_date`.
//                    El arreglo es el DÍA de la organización o de la sucursal.
//
//   **timestamptz**  `maintenance_orders.created_at`,
//                    `parking_sessions.entry_at` / `.exit_at` / `.created_at`,
//                    `payments.created_at`.
//                    El arreglo es un INSTANTE con offset: `getDayRange` /
//                    `getDateRange`, y la lectura por `plainDayOfInstant` o por
//                    la hora de pared de la zona — nunca cortando por la 'T'.
//
// Los cuatro instantes del reloj falso están elegidos a propósito para que el
// día de la organización y el de UTC NO coincidan; si coincidieran, la prueba
// pasaría también con el código viejo y no probaría nada (lección de la
// tanda 5).
//
//   2026-09-24T01:00Z  ->  Bogotá sigue en el 23 (20:00), UTC ya está en el 24.
//   2026-09-22T22:30Z  ->  Madrid ya está en el 23 (00:30), UTC sigue en el 22.
//   2026-10-24T22:30Z  ->  Madrid está en el 25 (00:30) y ese día dura 25 h.
//   2026-09-23T19:00Z  ->  Katmandú (+05:45) está en el 24 a las 00:45.
// ============================================================================

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { DobleSupabase } from './dobleSupabase';

const RAIZ = join(__dirname, '..', '..', '..');

// --- Dobles -----------------------------------------------------------------
// `resolveTimezone` se sustituye para (a) fijar la zona y (b) dejar constancia
// de CON QUÉ IDENTIDAD se le llamó: el ADR-003 exige la organización y, cuando
// el dato tiene sucursal, su `branch_id`.
const zonas = {
  porOrganizacion: new Map<number, string>(),
  porSucursal: new Map<number, string>(),
  llamadas: [] as Array<{ organizationId: number; branchId: number | null | undefined }>,
};

jest.mock('@/lib/services/timezoneResolver', () => ({
  resolveTimezone: async (organizationId: number, branchId?: number | null): Promise<string> => {
    zonas.llamadas.push({ organizationId, branchId });
    if (branchId != null && zonas.porSucursal.has(branchId)) {
      return zonas.porSucursal.get(branchId) as string;
    }
    return zonas.porOrganizacion.get(organizationId) ?? 'America/Bogota';
  },
}));

let doble = new DobleSupabase();

jest.mock('@/lib/supabase/config', () => ({
  get supabase() {
    return doble;
  },
  createSupabaseClient: () => doble,
}));

// `pmsCrmLink` resuelve la identidad por su cuenta y delega la creación en
// `reservationsService`; el doble captura los datos con los que se le llama.
const reservaCreada: { datos: Record<string, unknown> | null } = { datos: null };

jest.mock('@/lib/utils/orgId', () => ({
  getOrganizationId: () => 120,
}));

jest.mock('@/lib/hooks/useOrganization', () => ({
  getCurrentBranchIdWithFallback: () => 77,
}));

jest.mock('@/lib/services/reservationsService', () => ({
  __esModule: true,
  default: {
    createReservation: async (datos: Record<string, unknown>) => {
      reservaCreada.datos = datos;
      return { id: 'reserva-1' };
    },
  },
}));

import pmsDashboardService from '@/lib/services/pmsDashboardService';
import tapeChartService from '@/lib/services/tapeChartService';
import pmsCrmLink from '@/lib/services/crm/pmsCrmLink';
import parkingDashboardService from '@/lib/services/parkingDashboardService';
import parkingReportService from '@/lib/services/parkingReportService';

const ORG = 120;
const SUCURSAL_MADRID = 55;
const SUCURSAL_KATMANDU = 88;

beforeEach(() => {
  zonas.porOrganizacion.clear();
  zonas.porSucursal.clear();
  zonas.llamadas.length = 0;
  reservaCreada.datos = null;
  doble = new DobleSupabase();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

/** Fija el instante del reloj del sistema. */
function enElInstante(iso: string): void {
  jest.setSystemTime(new Date(iso));
}

// ===========================================================================
// TANDA 6 — PMS: tablero
// ===========================================================================
describe('pmsDashboardService — «hoy» es el día del hotel', () => {
  it('a las 20:00 en Bogotá el tablero sigue mostrando el día de hoy, no el de mañana', async () => {
    zonas.porOrganizacion.set(ORG, 'America/Bogota');
    enElInstante('2026-09-24T01:00:00.000Z');

    await pmsDashboardService.getDashboardStats(ORG);

    // `reservations.checkin` es una columna date: se compara día con día.
    expect(doble.filtro('reservations', 'gte', 'checkin')).toBe('2026-09-23');
    expect(doble.filtro('reservations', 'lte', 'checkin')).toBe('2026-09-23');
  });

  it('a las 00:30 en Madrid ya es el día siguiente aunque UTC siga en el anterior', async () => {
    zonas.porOrganizacion.set(ORG, 'Europe/Madrid');
    enElInstante('2026-09-22T22:30:00.000Z');

    await pmsDashboardService.getDashboardStats(ORG);

    expect(doble.filtro('reservations', 'gte', 'checkin')).toBe('2026-09-23');
  });

  it('a las 00:45 en Katmandú (+05:45) el día es el 24, no el 23 de UTC', async () => {
    zonas.porOrganizacion.set(ORG, 'Asia/Kathmandu');
    enElInstante('2026-09-23T19:00:00.000Z');

    await pmsDashboardService.getDashboardStats(ORG);

    expect(doble.filtro('reservations', 'gte', 'checkin')).toBe('2026-09-24');
  });

  it('el rango que elige el usuario se lee en la zona de LA SUCURSAL del filtro', async () => {
    zonas.porOrganizacion.set(ORG, 'America/Bogota');
    zonas.porSucursal.set(SUCURSAL_KATMANDU, 'Asia/Kathmandu');
    enElInstante('2026-09-23T19:00:00.000Z');

    // El mismo instante: el 23 a las 19:00Z. En Katmandú ya es el 24.
    const desde = new Date('2026-09-23T19:00:00.000Z');
    await pmsDashboardService.getArrivals(
      ORG,
      { from: desde, to: desde },
      SUCURSAL_KATMANDU,
    );

    expect(doble.filtro('reservations', 'gte', 'checkin')).toBe('2026-09-24');
    // ADR-003: identidad completa, no la zona ya resuelta.
    expect(zonas.llamadas).toContainEqual({ organizationId: ORG, branchId: SUCURSAL_KATMANDU });
  });

  it('las salidas del rango también salen de la zona de la sucursal', async () => {
    zonas.porOrganizacion.set(ORG, 'America/Bogota');
    zonas.porSucursal.set(SUCURSAL_MADRID, 'Europe/Madrid');
    enElInstante('2026-09-22T22:30:00.000Z');

    await pmsDashboardService.getDepartures(ORG, undefined, SUCURSAL_MADRID);

    expect(doble.filtro('reservations', 'gte', 'checkout')).toBe('2026-09-23');
  });

  it('«hoy y mañana» son dos días calendario, no 24 horas: el día de 25 h de Madrid', async () => {
    // 2026-10-25 en Madrid dura 25 h (el reloj vuelve atrás a las 03:00).
    // A las 00:30 de ese día, `Date.now() + 86400000` SIGUE cayendo en el 25.
    zonas.porOrganizacion.set(ORG, 'Europe/Madrid');
    enElInstante('2026-10-24T22:30:00.000Z');

    await pmsDashboardService.getAlerts(ORG);

    expect(doble.filtro('reservations', 'gte', 'checkin')).toBe('2026-10-25');
    expect(doble.filtro('reservations', 'lte', 'checkin')).toBe('2026-10-26');
    // Y los bloqueos del mismo par de días.
    expect(doble.filtro('reservation_blocks', 'gte', 'date_from')).toBe('2026-10-25');
    expect(doble.filtro('reservation_blocks', 'lte', 'date_from')).toBe('2026-10-26');
  });

  it('la semana del calendario son 7 días calendario aunque uno dure 25 h', async () => {
    zonas.porOrganizacion.set(ORG, 'Europe/Madrid');
    enElInstante('2026-10-24T22:30:00.000Z');

    await pmsDashboardService.getWeekCalendarEvents(ORG);

    expect(doble.filtro('reservations', 'gte', 'checkin')).toBe('2026-10-25');
    expect(doble.filtro('reservations', 'lte', 'checkin')).toBe('2026-11-01');
  });

  it('el día de una orden de mantenimiento sale de su instante, no del corte por la T', async () => {
    zonas.porOrganizacion.set(ORG, 'America/Bogota');
    enElInstante('2026-09-24T01:00:00.000Z');

    // `maintenance_orders.created_at` es timestamptz. Este instante es el 23 a
    // las 20:00 en Bogotá, pero el 24 en UTC.
    doble = new DobleSupabase({
      branches: [{ data: [{ id: 9 }] }],
      maintenance_orders: [
        {
          data: [
            { id: 'm1', description: 'Fuga', created_at: '2026-09-24T01:00:00.000Z', spaces: [] },
          ],
        },
      ],
    });

    const eventos = await pmsDashboardService.getWeekCalendarEvents(ORG);
    const mantenimiento = eventos.find((e) => e.id === 'maintenance-m1');

    expect(mantenimiento?.date).toBe('2026-09-23');
  });
});

// ===========================================================================
// TANDA 6 — tape chart
// ===========================================================================
describe('tapeChartService — aritmética de día calendario, sin Date', () => {
  it('genera los días seguidos sin saltarse ninguno al cruzar el cambio de horario', () => {
    // 2026-10-25 es el día de 25 h en Madrid. Con `setDate` sobre un `Date`
    // local esto podía repetir o saltarse un día.
    expect(tapeChartService.generateDateRange('2026-10-23', 5)).toEqual([
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
      '2026-10-26',
      '2026-10-27',
    ]);
  });

  it('cruza el fin de mes, el fin de año y el 29 de febrero bisiesto', () => {
    expect(tapeChartService.generateDateRange('2026-12-30', 3)).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
    ]);
    expect(tapeChartService.generateDateRange('2028-02-28', 3)).toEqual([
      '2028-02-28',
      '2028-02-29',
      '2028-03-01',
    ]);
    // 2026 no es bisiesto: del 28 se pasa al 1 de marzo.
    expect(tapeChartService.generateDateRange('2026-02-28', 2)).toEqual([
      '2026-02-28',
      '2026-03-01',
    ]);
  });

  it('el mapa de ocupación cuenta desde el check-in y NO cuenta la noche de salida', async () => {
    doble = new DobleSupabase({
      spaces: [{ data: [{ id: 'e1' }, { id: 'e2' }] }],
      reservations: [
        {
          data: [
            // Tres noches: 27 y 28 de febrero y 1 de marzo. El 2 ya no.
            { space_id: 'e1', checkin: '2026-02-27', checkout: '2026-03-02' },
          ],
        },
      ],
    });

    const ocupacion = await tapeChartService.getOccupancyData(
      ORG,
      '2026-02-26',
      '2026-03-03',
      7,
    );

    const porDia = Object.fromEntries(ocupacion.map((o) => [o.date, o.occupied]));
    expect(porDia).toEqual({
      '2026-02-26': 0,
      '2026-02-27': 1,
      '2026-02-28': 1,
      '2026-03-01': 1,
      '2026-03-02': 0,
      '2026-03-03': 0,
    });
  });

  it('una reserva que empieza antes del rango se cuenta desde el primer día del rango', async () => {
    doble = new DobleSupabase({
      spaces: [{ data: [{ id: 'e1' }] }],
      reservations: [
        { data: [{ space_id: 'e1', checkin: '2026-01-28', checkout: '2026-02-02' }] },
      ],
    });

    const ocupacion = await tapeChartService.getOccupancyData(ORG, '2026-01-31', '2026-02-02', 7);
    const porDia = Object.fromEntries(ocupacion.map((o) => [o.date, o.occupied]));

    expect(porDia).toEqual({
      '2026-01-31': 1,
      '2026-02-01': 1,
      '2026-02-02': 0,
    });
  });
});

// ===========================================================================
// TANDA 6 — CRM -> PMS
// ===========================================================================
describe('pmsCrmLink — el respaldo hoy/mañana es el del hotel', () => {
  it('sin fechas en la oportunidad, la reserva entra hoy y sale mañana en la zona de la sucursal', async () => {
    zonas.porOrganizacion.set(ORG, 'America/Bogota');
    zonas.porSucursal.set(77, 'Asia/Kathmandu');
    enElInstante('2026-09-23T19:00:00.000Z'); // 00:45 del 24 en Katmandú

    doble = new DobleSupabase({
      opportunities: [
        {
          data: [
            {
              id: 'op1',
              organization_id: ORG,
              customer_id: 'cli1',
              title: 'Grupo',
              amount: 100,
            },
          ],
        },
      ],
      opportunity_spaces: [
        {
          data: [
            {
              id: 'os1',
              opportunity_id: 'op1',
              space_id: 'e1',
              nights: 1,
              unit_price: 100,
              total_price: 100,
              checkin_date: null,
              checkout_date: null,
              notes: null,
            },
          ],
        },
      ],
    });

    await pmsCrmLink.createReservationFromOpportunity('op1');

    expect(reservaCreada.datos?.checkin).toBe('2026-09-24');
    expect(reservaCreada.datos?.checkout).toBe('2026-09-25');
    expect(zonas.llamadas).toContainEqual({ organizationId: ORG, branchId: 77 });
  });
});

// ===========================================================================
// TANDA 8 — parqueadero: tablero
// ===========================================================================
describe('parkingDashboardService — la caja del día es la del parqueadero', () => {
  it('la jornada se acota con instantes con offset, no con una cadena de día', async () => {
    zonas.porOrganizacion.set(ORG, 'America/Bogota');
    enElInstante('2026-09-24T01:00:00.000Z');

    await parkingDashboardService.getDashboardStats(null, ORG);

    // `parking_sessions.created_at` es timestamptz.
    expect(doble.filtro('parking_sessions', 'gte', 'created_at')).toBe(
      '2026-09-23T00:00:00.000-05:00',
    );
    expect(doble.filtro('parking_sessions', 'lte', 'created_at')).toBe(
      '2026-09-23T23:59:59.999-05:00',
    );
  });

  it('el día de 25 h de Madrid empieza en +02:00 y termina en +01:00', async () => {
    zonas.porOrganizacion.set(ORG, 'Europe/Madrid');
    zonas.porSucursal.set(SUCURSAL_MADRID, 'Europe/Madrid');
    enElInstante('2026-10-24T22:30:00.000Z');

    await parkingDashboardService.getDashboardStats(SUCURSAL_MADRID, ORG);

    expect(doble.filtro('parking_sessions', 'gte', 'created_at')).toBe(
      '2026-10-25T00:00:00.000+02:00',
    );
    expect(doble.filtro('parking_sessions', 'lte', 'created_at')).toBe(
      '2026-10-25T23:59:59.999+01:00',
    );
  });

  it('los pases por vencer se filtran por día calendario, y +30 días son 30 días', async () => {
    zonas.porOrganizacion.set(ORG, 'Europe/Madrid');
    enElInstante('2026-10-24T22:30:00.000Z'); // 25 de octubre en Madrid

    await parkingDashboardService.getExpiringPasses(ORG, 30);

    // `parking_passes.end_date` es date y la tabla no tiene `branch_id`.
    expect(doble.filtro('parking_passes', 'gte', 'end_date')).toBe('2026-10-25');
    expect(doble.filtro('parking_passes', 'lte', 'end_date')).toBe('2026-11-24');
    expect(zonas.llamadas).toContainEqual({ organizationId: ORG, branchId: null });
  });

  it('los días restantes de un pase se cuentan desde el día del parqueadero', async () => {
    zonas.porOrganizacion.set(ORG, 'Europe/Madrid');
    // 00:30 del 25 en Madrid; en UTC todavía es el 24.
    enElInstante('2026-10-24T22:30:00.000Z');

    doble = new DobleSupabase({
      parking_passes: [
        {
          data: [
            {
              id: 'p1',
              plan_name: 'Mensual',
              end_date: '2026-10-25',
              customers: { full_name: 'Cliente' },
              vehicles: [],
            },
          ],
        },
      ],
    });

    const pases = await parkingDashboardService.getExpiringPasses(ORG, 30);

    // Vence HOY: 0 días. Con el día de UTC habría dicho 1.
    expect(pases[0].days_remaining).toBe(0);
  });

  it('las horas pico se cuentan en la hora de pared del parqueadero', async () => {
    zonas.porOrganizacion.set(ORG, 'America/Bogota');
    zonas.porSucursal.set(SUCURSAL_KATMANDU, 'Asia/Kathmandu');
    enElInstante('2026-09-23T19:00:00.000Z');

    doble = new DobleSupabase({
      parking_sessions: [
        {
          data: [
            // 01:30Z = 20:30 del 23 en Bogotá y 07:15 del 24 en Katmandú.
            { entry_at: '2026-09-24T01:30:00.000Z', exit_at: null },
          ],
        },
      ],
    });

    const porHora = await parkingDashboardService.getHourlyStats(
      SUCURSAL_KATMANDU,
      ORG,
      '2026-09-24',
    );

    expect(porHora[7].entries).toBe(1);
    expect(porHora[1].entries).toBe(0); // la hora de UTC
    expect(porHora[20].entries).toBe(0); // la de Bogotá
  });

  it('el corte de las horas pico llega hasta el último milisegundo del día', async () => {
    zonas.porOrganizacion.set(ORG, 'America/Bogota');
    zonas.porSucursal.set(SUCURSAL_MADRID, 'America/Bogota');
    enElInstante('2026-09-24T01:00:00.000Z');

    await parkingDashboardService.getHourlyStats(SUCURSAL_MADRID, ORG, '2026-09-23');

    expect(doble.filtro('parking_sessions', 'gte', 'entry_at')).toBe(
      '2026-09-23T00:00:00.000-05:00',
    );
    expect(doble.filtro('parking_sessions', 'lte', 'entry_at')).toBe(
      '2026-09-23T23:59:59.999-05:00',
    );
  });
});

// ===========================================================================
// TANDA 8 — parqueadero: reportes
// ===========================================================================
describe('parkingReportService — el rango del informe cubre el último día entero', () => {
  const filtros = { startDate: '2026-09-01', endDate: '2026-09-23' };

  it('el extremo final es el fin del último día, no su medianoche UTC', async () => {
    zonas.porOrganizacion.set(ORG, 'America/Bogota');

    await parkingReportService.getReportSummary(ORG, filtros);

    expect(doble.filtro('parking_sessions', 'gte', 'entry_at')).toBe(
      '2026-09-01T00:00:00.000-05:00',
    );
    expect(doble.filtro('parking_sessions', 'lte', 'entry_at')).toBe(
      '2026-09-23T23:59:59.999-05:00',
    );
  });

  it('un rango que cruza el cambio de horario empieza y termina con offsets distintos', async () => {
    zonas.porOrganizacion.set(ORG, 'Europe/Madrid');

    await parkingReportService.getZoneStats(ORG, {
      startDate: '2026-10-24',
      endDate: '2026-10-25',
    });

    expect(doble.filtro('parking_sessions', 'gte', 'entry_at')).toBe(
      '2026-10-24T00:00:00.000+02:00',
    );
    expect(doble.filtro('parking_sessions', 'lte', 'entry_at')).toBe(
      '2026-10-25T23:59:59.999+01:00',
    );
  });

  it('los pagos de abonados y ocasionales usan los mismos instantes', async () => {
    zonas.porOrganizacion.set(ORG, 'America/Bogota');

    await parkingReportService.getPassVsOccasional(ORG, filtros);

    // `payments.created_at` es timestamptz.
    expect(doble.filtro('payments', 'gte', 'created_at')).toBe('2026-09-01T00:00:00.000-05:00');
    expect(doble.filtro('payments', 'lte', 'created_at')).toBe('2026-09-23T23:59:59.999-05:00');
  });

  it('la zona sale de la SUCURSAL del filtro cuando la hay', async () => {
    zonas.porOrganizacion.set(ORG, 'America/Bogota');
    zonas.porSucursal.set(SUCURSAL_KATMANDU, 'Asia/Kathmandu');

    await parkingReportService.getTopPlates(
      ORG,
      { ...filtros, branchId: SUCURSAL_KATMANDU },
      10,
    );

    expect(doble.filtro('parking_sessions', 'gte', 'entry_at')).toBe(
      '2026-09-01T00:00:00.000+05:45',
    );
    expect(zonas.llamadas).toContainEqual({
      organizationId: ORG,
      branchId: SUCURSAL_KATMANDU,
    });
  });

  it('agrupar por día usa el día del parqueadero, no el de UTC', async () => {
    zonas.porOrganizacion.set(ORG, 'America/Bogota');

    doble = new DobleSupabase({
      parking_sessions: [
        {
          data: [
            // 23:00 del 31 de enero en Bogotá = 04:00 del 1 de febrero en UTC.
            { entry_at: '2026-02-01T04:00:00.000Z', amount: 10000 },
          ],
        },
      ],
    });

    const porPeriodo = await parkingReportService.getRevenueByPeriod(
      ORG,
      { startDate: '2026-01-01', endDate: '2026-02-28' },
      'day',
    );

    expect(porPeriodo).toEqual([{ period: '2026-01-31', revenue: 10000, sessions: 1 }]);
  });

  it('agrupar por mes no manda esa misma sesión a febrero', async () => {
    zonas.porOrganizacion.set(ORG, 'America/Bogota');

    doble = new DobleSupabase({
      parking_sessions: [{ data: [{ entry_at: '2026-02-01T04:00:00.000Z', amount: 10000 }] }],
    });

    const porPeriodo = await parkingReportService.getRevenueByPeriod(
      ORG,
      { startDate: '2026-01-01', endDate: '2026-02-28' },
      'month',
    );

    expect(porPeriodo[0].period).toBe('2026-01');
  });

  it('agrupar por semana ancla en el domingo del día de la organización', async () => {
    zonas.porOrganizacion.set(ORG, 'America/Bogota');

    doble = new DobleSupabase({
      parking_sessions: [
        // 2026-01-31 es sábado; su semana empieza el domingo 2026-01-25.
        { data: [{ entry_at: '2026-02-01T04:00:00.000Z', amount: 10000 }] },
      ],
    });

    const porPeriodo = await parkingReportService.getRevenueByPeriod(
      ORG,
      { startDate: '2026-01-01', endDate: '2026-02-28' },
      'week',
    );

    expect(porPeriodo[0].period).toBe('2026-01-25');
  });

  it('la ocupación por hora se cuenta en la hora del parqueadero, con offset no entero', async () => {
    zonas.porOrganizacion.set(ORG, 'Asia/Kathmandu');

    doble = new DobleSupabase({
      parking_sessions: [
        { data: [{ entry_at: '2026-09-24T01:30:00.000Z', duration_min: 60 }] },
      ],
    });

    const porHora = await parkingReportService.getOccupancyByHour(ORG, filtros);

    // 01:30Z + 05:45 = 07:15.
    expect(porHora[7].sessions).toBe(1);
    expect(porHora[1].sessions).toBe(0);
  });

  it('el CSV imprime la hora del parqueadero, no la del navegador', async () => {
    zonas.porOrganizacion.set(ORG, 'Europe/Madrid');

    doble = new DobleSupabase({
      parking_sessions: [
        {
          data: [
            {
              vehicle_plate: 'AAA111',
              vehicle_type: 'car',
              entry_at: '2026-01-15T23:30:00.000Z', // 00:30 del 16 en Madrid
              exit_at: null,
              duration_min: 30,
              amount: 1000,
              status: 'closed',
              branch: { name: 'Sede' },
            },
          ],
        },
      ],
    });

    const csv = await parkingReportService.exportToCSV(ORG, filtros);

    expect(csv).toContain('16/01/2026 00:30');
    expect(csv).not.toContain('15/01/2026');
  });
});

// ===========================================================================
// Guardas estáticas
// ===========================================================================
// Las pantallas (componentes de React) no se pueden ejercitar en este entorno
// (`testEnvironment: 'node'`), así que lo que se fija aquí es que NO vuelva el
// patrón viejo y que el helper correcto siga en su sitio. Es la lección de la
// tanda 2: una guarda que solo comprueba «aparece el helper» no basta cuando un
// archivo tiene varios puntos de escritura, así que abajo se nombra cada uno.
describe('guardas estáticas de las tandas 6 y 8', () => {
  const leer = (ruta: string): string => readFileSync(join(RAIZ, ruta), 'utf8');

  const ARCHIVOS = [
    'src/lib/services/pmsDashboardService.ts',
    'src/lib/services/tapeChartService.ts',
    'src/lib/services/crm/pmsCrmLink.ts',
    'src/app/app/pms/calendario/page.tsx',
    'src/app/app/pms/reservas/page.tsx',
    'src/components/pms/calendario/TapeChartHeader.tsx',
    'src/lib/services/parkingDashboardService.ts',
    'src/lib/services/parkingReportService.ts',
    'src/components/parking/reportes/ReportesFilters.tsx',
    'src/app/app/parking/reportes/page.tsx',
  ];

  it.each(ARCHIVOS)('%s no deriva un día calendario de un ISO en UTC', (ruta) => {
    const fuente = leer(ruta);
    expect(fuente).not.toMatch(/toISOString\(\)\s*\.\s*split\(/);
    expect(fuente).not.toMatch(/toISOString\(\)\s*\.\s*slice\(/);
  });

  it('las pantallas piden el día al contexto y esperan a que resuelva la zona', () => {
    for (const ruta of [
      'src/app/app/pms/calendario/page.tsx',
      'src/app/app/parking/reportes/page.tsx',
    ]) {
      const fuente = leer(ruta);
      expect(fuente).toContain('useFormatDate');
      // No basta con que `tzLoading` aparezca: la primera versión de esta
      // guarda solo miraba eso y sobrevivía una mutación que quitaba la
      // GUARDA y dejaba la declaración (es la lección de la tanda 2, otra vez).
      // Lo que se exige es el corto-circuito completo.
      expect(fuente).toContain('if (tzLoading || arrancado.current) return;');
      expect(fuente).toContain('arrancado.current = true;');
    }
  });

  it('los filtros rápidos del informe de parqueadero salen del día de la organización', () => {
    const fuente = leer('src/components/parking/reportes/ReportesFilters.tsx');
    expect(fuente).toContain('getToday()');
    expect(fuente).not.toMatch(/new Date\(\)/);
  });

  it('la lista de reservas pide «hoy» al contexto', () => {
    const fuente = leer('src/app/app/pms/reservas/page.tsx');
    expect(fuente).toContain('const today = getToday();');
  });

  it('el encabezado del tape chart recibe un día calendario, no un Date', () => {
    const fuente = leer('src/components/pms/calendario/TapeChartHeader.tsx');
    expect(fuente).toContain('startDay: string');
    expect(fuente).toContain('onStartDayChange');
  });

  it('cada punto de resolución de zona de los servicios sigue en su sitio', () => {
    // Nombrados uno por uno: `resolveTimezone` aparece una sola vez por
    // servicio (en el helper privado), así que «contiene el helper» no
    // detectaría que un método concreto dejó de llamarlo.
    const pms = leer('src/lib/services/pmsDashboardService.ts');
    expect((pms.match(/await this\.zona\(organizationId, branchId\)/g) || []).length).toBe(5);

    const parking = leer('src/lib/services/parkingDashboardService.ts');
    expect(parking).toContain('getDayRange(today, tz)');
    expect(parking).toContain('getDayRange(targetDate, tz)');
    expect(parking).toContain('todayInTz(tz)');

    const reportes = leer('src/lib/services/parkingReportService.ts');
    // Los ocho métodos que filtran por fecha resuelven el rango.
    expect(
      (reportes.match(/await this\.rangoDeInstantes\(organizationId, filters\)/g) || []).length,
    ).toBe(8);
    // Y ninguno vuelve a comparar un timestamptz contra el día suelto.
    expect(reportes).not.toMatch(/\.(gte|lte)\('(entry_at|created_at)', filters\./);
  });

  it('el tape chart no vuelve a meter días calendario en un Date', () => {
    const fuente = leer('src/lib/services/tapeChartService.ts');
    expect(fuente).toContain('sumarDiasAlDia(startDate, i)');
    expect(fuente).toContain('dia = nextPlainDay(dia)');
    expect(fuente).not.toContain('d.setDate(d.getDate() + 1)');
  });

  it('el enlace CRM→PMS resuelve la zona con la identidad que ya tenía', () => {
    const fuente = leer('src/lib/services/crm/pmsCrmLink.ts');
    expect(fuente).toContain('await resolveTimezone(orgId, branchId)');
    expect(fuente).toContain('sumarDiasAlDia(today, 1)');
  });
});
