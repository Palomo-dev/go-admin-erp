// ============================================================================
// Fase B, tanda 7 — transporte escribe y filtra el día de la sucursal
// ============================================================================
// Transporte es el módulo donde la cascada de ADR-001 más se nota: un viaje
// sale de UNA sucursal, y esa sucursal puede estar en otra zona que la sede.
// Lo que esta red fija:
//
//   1. `trips.trip_date` y `dispatch_manifests.manifest_date` son `date`
//      (verificado en `information_schema`): se escribe el día de la SUCURSAL
//      dueña del dato, no el día UTC. Del `trip_date` sale además el
//      `trip_code`, así que un día corrido deja el viaje con un código que
//      contradice su propia fecha.
//   2. `shipments.created_at`, `trip_tickets.created_at` y
//      `transport_events.event_time` son **timestamptz**: la jornada se acota
//      con instantes con offset (`getDayRange`), nunca con `día + 'T00:00:00'`
//      ni con `created_at.startsWith(día)`.
//   3. Los horizontes de vencimiento de documentos (`vehicles.*_expiry`,
//      `driver_credentials.license_expiry`) se cuentan en días calendario sobre
//      el día de la organización, no sumando 30 × 24 h a un instante.
//   4. La recurrencia semanal de `route_schedules` usa el día de la semana del
//      DÍA CALENDARIO, no el de un `Date` interpretado en UTC y leído en local.
//
// Zonas elegidas a propósito: UTC (el runtime por defecto de las pruebas),
// `America/Bogota` (offset entero negativo), `Europe/Madrid` (cambia de offset
// dentro de un mismo rango) y `Asia/Kathmandu` (+05:45, offset no entero: el
// único que también descarta una implementación «por horas enteras»).
//
// El reloj es falso en todos los casos. Una prueba de zona horaria que no
// elige el instante a propósito no prueba nada: hay que ponerse justo en la
// franja en la que el día de la organización y el día UTC son distintos.
// ============================================================================

import { DobleSupabase } from './dobleSupabase';

// ---------------------------------------------------------------------------
// Dobles. `resolveTimezone` se sustituye para (a) fijar la zona y (b) dejar
// constancia de CON QUÉ IDENTIDAD se le llamó: ADR-003 exige organización y,
// cuando el dato tiene sucursal, su `branch_id`.
// ---------------------------------------------------------------------------
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

import { manifestsService } from '@/lib/services/manifestsService';
import { tripsService } from '@/lib/services/tripsService';
import { shipmentsService } from '@/lib/services/shipmentsService';
import { ticketsService } from '@/lib/services/ticketsService';
import { trackingService } from '@/lib/services/trackingService';
import { transportService } from '@/lib/services/transportService';
import { transportRoutesService, type RouteSchedule } from '@/lib/services/transportRoutesService';
import { diaDeLaSemanaDelDia } from '@/lib/services/fiscalCalendar';

const ORG = 120;
const SUCURSAL_MADRID = 7;
const SUCURSAL_KATHMANDU = 9;

/** El único argumento de `.or(cadena)` lo registra el doble como `columna`. */
function filtroOr(tabla: string): string {
  for (const llamada of doble.deTabla(tabla)) {
    const encontrado = llamada.filtros.find((f) => f.metodo === 'or');
    if (encontrado) return encontrado.columna;
  }
  return '';
}

function nuevoDoble(guion: Record<string, Array<{ data?: unknown; error?: unknown }>> = {}) {
  doble = new DobleSupabase(guion);
  return doble;
}

beforeEach(() => {
  zonas.porOrganizacion.clear();
  zonas.porSucursal.clear();
  zonas.llamadas.length = 0;
  zonas.porOrganizacion.set(ORG, 'America/Bogota');
  zonas.porSucursal.set(SUCURSAL_MADRID, 'Europe/Madrid');
  zonas.porSucursal.set(SUCURSAL_KATHMANDU, 'Asia/Kathmandu');
  nuevoDoble();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

// ===========================================================================
// 1. Manifiestos: `dispatch_manifests.manifest_date` · date
// ===========================================================================
describe('manifestsService.duplicateManifest', () => {
  it('fecha el manifiesto duplicado en el día de la sucursal (+05:45), no en el día UTC', async () => {
    // 19:00 UTC del 23 → en Katmandú ya son las 00:45 del 24.
    jest.setSystemTime(new Date('2026-09-23T19:00:00.000Z'));

    nuevoDoble({
      dispatch_manifests: [
        {
          data: [
            {
              id: 'm-1',
              organization_id: ORG,
              branch_id: SUCURSAL_KATHMANDU,
              manifest_type: 'delivery',
              manifest_number: 'MAN-1',
              manifest_date: '2026-09-20',
              manifest_shipments: [],
            },
          ],
        },
      ],
    });

    await manifestsService.duplicateManifest('m-1').catch(() => undefined);

    const insert = doble
      .deTabla('dispatch_manifests')
      .find((l) => l.operacion === 'insert');
    expect(insert).toBeDefined();
    expect((insert?.payload as { manifest_date: string }).manifest_date).toBe('2026-09-24');

    // Y la zona se pidió con la identidad de la fila, sucursal incluida.
    expect(zonas.llamadas).toContainEqual({
      organizationId: ORG,
      branchId: SUCURSAL_KATHMANDU,
    });
  });
});

// ===========================================================================
// 2. Viajes: `trips.trip_date` · date, y el `trip_code` que sale de él
// ===========================================================================
describe('tripsService.createTrip', () => {
  it('sin trip_date, el viaje y su código son del día de la sucursal (Madrid en horario de verano)', async () => {
    // 22:30 UTC del 23 → en Madrid (+02:00) ya es el 24 a las 00:30.
    jest.setSystemTime(new Date('2026-09-23T22:30:00.000Z'));

    await tripsService
      .createTrip({ organization_id: ORG, branch_id: SUCURSAL_MADRID, route_id: 'r-1' })
      .catch(() => undefined);

    const insert = doble.deTabla('trips').find((l) => l.operacion === 'insert');
    const payload = insert?.payload as { trip_date?: string; trip_code: string };

    // El día no se escribe (lo pone el llamador o el DEFAULT), pero el código sí
    // sale del día: con el día UTC quedaba `VJ-20260923-…` para un viaje del 24.
    expect(payload.trip_code.startsWith('VJ-20260924-')).toBe(true);
    expect(zonas.llamadas).toContainEqual({
      organizationId: ORG,
      branchId: SUCURSAL_MADRID,
    });
  });
});

describe('tripsService.getTripStats', () => {
  it('sin fecha, filtra trip_date por el día de la sucursal de los viajes', async () => {
    jest.setSystemTime(new Date('2026-09-23T19:00:00.000Z'));

    await tripsService.getTripStats(ORG, undefined, SUCURSAL_KATHMANDU);

    expect(doble.filtro('trips', 'eq', 'trip_date')).toBe('2026-09-24');
  });

  it('con la organización en Bogotá, el mismo instante sigue siendo el día 23', async () => {
    jest.setSystemTime(new Date('2026-09-23T19:00:00.000Z'));

    await tripsService.getTripStats(ORG, undefined, null);

    expect(doble.filtro('trips', 'eq', 'trip_date')).toBe('2026-09-23');
  });
});

// ===========================================================================
// 3. Envíos: `shipments.created_at` · timestamptz
// ===========================================================================
describe('shipmentsService.getShipmentStats', () => {
  it('cuenta los envíos de hoy comparando instantes, no prefijos de cadena', async () => {
    // 15:00 en Bogotá del 23.
    jest.setSystemTime(new Date('2026-09-23T20:00:00.000Z'));

    nuevoDoble({
      shipments: [
        {
          data: [
            // 21:00 del 23 en Bogotá: es de HOY, pero su cadena empieza por «24».
            { status: 'delivered', created_at: '2026-09-24T02:00:00.000Z' },
            // 13:00 del 23 en Bogotá: de hoy con cualquiera de los dos criterios.
            { status: 'pending', created_at: '2026-09-23T18:00:00.000Z' },
            // 21:00 del 22 en Bogotá: es de AYER, pero su cadena empieza por «23».
            { status: 'pending', created_at: '2026-09-23T02:00:00.000Z' },
          ],
        },
      ],
    });

    const stats = await shipmentsService.getShipmentStats(ORG, null);

    // El código viejo (`created_at.startsWith(díaUTC)`) contaba 1: el tercero.
    expect(stats.shipmentsToday).toBe(2);
  });

  it('la sucursal manda: el mismo envío es de otro día si la sucursal está en Katmandú', async () => {
    jest.setSystemTime(new Date('2026-09-23T20:00:00.000Z'));

    nuevoDoble({
      shipments: [
        {
          data: [
            // 01:45 del 24 en Katmandú → hoy allí es el 24, así que NO cuenta.
            { status: 'pending', created_at: '2026-09-23T20:00:00.000Z' },
          ],
        },
      ],
    });

    const stats = await shipmentsService.getShipmentStats(ORG, SUCURSAL_KATHMANDU);

    expect(stats.shipmentsToday).toBe(1);
    expect(zonas.llamadas).toContainEqual({
      organizationId: ORG,
      branchId: SUCURSAL_KATHMANDU,
    });
  });
});

// ===========================================================================
// 4. Tiquetes: `trip_tickets.created_at` · timestamptz, y el día de 25 horas
// ===========================================================================
describe('ticketsService.getTicketStats', () => {
  it('acota la jornada con instantes con offset y cierra el rango por arriba', async () => {
    zonas.porOrganizacion.set(ORG, 'Europe/Madrid');
    // El 25 de octubre de 2026 Madrid vuelve al horario estándar: el día tiene
    // 25 horas y sus dos extremos NO llevan el mismo offset.
    jest.setSystemTime(new Date('2026-10-25T10:00:00.000Z'));

    await ticketsService.getTicketStats(ORG);

    const desde = doble.filtro('trip_tickets', 'gte', 'created_at') as string;
    const hasta = doble.filtro('trip_tickets', 'lte', 'created_at') as string;

    expect(desde).toBe('2026-10-25T00:00:00.000+02:00');
    expect(hasta).toBe('2026-10-25T23:59:59.999+01:00');
    // 25 horas exactas: si el cálculo fuera «+24 h» el rango se quedaría corto.
    expect(new Date(hasta).getTime() - new Date(desde).getTime()).toBe(25 * 3600 * 1000 - 1);
  });

  it('con offset no entero el rango lleva +05:45, no +06:00 ni Z', async () => {
    zonas.porOrganizacion.set(ORG, 'Asia/Kathmandu');
    jest.setSystemTime(new Date('2026-09-23T19:00:00.000Z'));

    await ticketsService.getTicketStats(ORG);

    expect(doble.filtro('trip_tickets', 'gte', 'created_at')).toBe('2026-09-24T00:00:00.000+05:45');
  });
});

// ===========================================================================
// 5. Tracking: `transport_events.event_time` · timestamptz
// ===========================================================================
describe('trackingService.getTrackingStats', () => {
  it('los eventos de hoy se acotan por instantes de la zona de la organización', async () => {
    zonas.porOrganizacion.set(ORG, 'Asia/Kathmandu');
    jest.setSystemTime(new Date('2026-09-23T19:00:00.000Z'));

    await trackingService.getTrackingStats(ORG);

    const desde = doble.filtro('transport_events', 'gte', 'event_time') as string;
    const hasta = doble.filtro('transport_events', 'lte', 'event_time') as string;

    // Antes era la cadena de día UTC «2026-09-23» y sin extremo superior.
    expect(desde).toBe('2026-09-24T00:00:00.000+05:45');
    expect(hasta).toBe('2026-09-24T23:59:59.999+05:45');
  });
});

// ===========================================================================
// 6. Tablero de transporte: rangos por defecto y del datepicker
// ===========================================================================
describe('transportService.getStatsWithFilters', () => {
  it('sin filtros, el rango por defecto es HOY en la sucursal seleccionada', async () => {
    jest.setSystemTime(new Date('2026-09-23T19:00:00.000Z'));

    await transportService.getStatsWithFilters(ORG, {
      branchId: String(SUCURSAL_KATHMANDU),
    });

    expect(doble.filtro('trips', 'gte', 'trip_date')).toBe('2026-09-24');
    expect(doble.filtro('trips', 'lte', 'trip_date')).toBe('2026-09-24');
    expect(doble.filtro('shipments', 'gte', 'created_at')).toBe(
      '2026-09-24T00:00:00.000+05:45',
    );
    expect(doble.filtro('shipments', 'lte', 'created_at')).toBe(
      '2026-09-24T23:59:59.999+05:45',
    );
  });

  it('el rango del datepicker cruza el cambio de horario con un offset en cada extremo', async () => {
    zonas.porOrganizacion.set(ORG, 'Europe/Madrid');
    jest.setSystemTime(new Date('2026-10-20T10:00:00.000Z'));

    await transportService.getStatsWithFilters(ORG, {
      // Mediodía UTC: el mismo día calendario en Madrid y en UTC, para que lo
      // que se mida aquí sea el offset del rango y no el del datepicker.
      dateFrom: new Date('2026-10-20T12:00:00.000Z'),
      dateTo: new Date('2026-10-30T12:00:00.000Z'),
    });

    expect(doble.filtro('shipments', 'gte', 'created_at')).toBe(
      '2026-10-20T00:00:00.000+02:00',
    );
    expect(doble.filtro('shipments', 'lte', 'created_at')).toBe(
      '2026-10-30T23:59:59.999+01:00',
    );
  });

  it('el día del datepicker sale en la zona de la organización, no en UTC', async () => {
    zonas.porOrganizacion.set(ORG, 'America/Bogota');
    jest.setSystemTime(new Date('2026-09-23T19:00:00.000Z'));

    await transportService.getStatsWithFilters(ORG, {
      // 01:00 UTC del 24 = 20:00 del 23 en Bogotá.
      dateFrom: new Date('2026-09-24T01:00:00.000Z'),
      dateTo: new Date('2026-09-24T01:00:00.000Z'),
    });

    expect(doble.filtro('trips', 'gte', 'trip_date')).toBe('2026-09-23');
  });
});

describe('transportService.getStats', () => {
  it('«de hoy en adelante» se mide en el día de la sucursal', async () => {
    jest.setSystemTime(new Date('2026-09-23T19:00:00.000Z'));

    await transportService.getStats(ORG, SUCURSAL_KATHMANDU);

    expect(doble.filtro('trips', 'gte', 'trip_date')).toBe('2026-09-24');
  });
});

// ===========================================================================
// 7. Horizontes de vencimiento de documentos · date
// ===========================================================================
describe('transportService — documentos por vencer', () => {
  it('el horizonte de vehículos son 30 días calendario desde el día de la organización', async () => {
    zonas.porOrganizacion.set(ORG, 'Asia/Kathmandu');
    jest.setSystemTime(new Date('2026-09-23T19:00:00.000Z'));

    await transportService.getVehiclesWithExpiringDocs(ORG, 30);

    // Hoy en Katmandú es el 24; 30 días calendario después, el 24 de octubre.
    // El cálculo viejo (día UTC + 30 × 24 h) daba el 23 de octubre.
    // `.or(cadena)` lleva un solo argumento: el doble lo registra como `columna`.
    const filtro = filtroOr('vehicles');
    expect(filtro).toContain('soat_expiry.lte.2026-10-24');
  });

  it('el horizonte de conductores cruza el cambio de horario sin perder un día', async () => {
    zonas.porOrganizacion.set(ORG, 'Europe/Madrid');
    // 2026-10-25 Madrid gana una hora: sumar 30 × 24 h desde el 20 cae el 19 de
    // noviembre a las 23:00, cuyo día UTC es el 19 y no el 20.
    jest.setSystemTime(new Date('2026-10-20T23:30:00.000Z'));

    await transportService.getDriversWithExpiringDocs(ORG, 30);

    const filtro = filtroOr('driver_credentials');
    expect(filtro).toContain('license_expiry.lte.2026-11-20');
  });
});

// ===========================================================================
// 8. Recurrencia de horarios: día de la semana del DÍA, no del `Date`
// ===========================================================================
describe('diaDeLaSemanaDelDia', () => {
  it('no depende de la zona del proceso: el 2026-09-23 es miércoles siempre', () => {
    expect(diaDeLaSemanaDelDia('2026-09-23')).toBe(3);
    expect(diaDeLaSemanaDelDia('2026-09-20')).toBe(0);
    expect(diaDeLaSemanaDelDia('2028-02-29')).toBe(2); // bisiesto: martes
  });
});

describe('transportRoutesService.getScheduleDates', () => {
  const horarioSemanal = (dias: number[]): RouteSchedule =>
    ({
      id: 'h-1',
      organization_id: ORG,
      route_id: 'r-1',
      recurrence_type: 'weekly',
      days_of_week: dias,
      departure_time: '08:00',
      valid_from: '2026-01-01',
      is_active: true,
      created_at: '',
      updated_at: '',
    }) as RouteSchedule;

  it('un horario «los miércoles» genera miércoles (con TZ=America/Bogota el código viejo daba jueves)', () => {
    const fechas = transportRoutesService.getScheduleDates(
      horarioSemanal([3]),
      '2026-09-21',
      '2026-09-27',
    );
    expect(fechas).toEqual(['2026-09-23']);
  });

  it('la iteración diaria no se salta ni repite días al cruzar un cambio de horario', () => {
    const horario = { ...horarioSemanal([]), recurrence_type: 'daily' } as RouteSchedule;
    const fechas = transportRoutesService.getScheduleDates(horario, '2026-10-24', '2026-10-27');
    expect(fechas).toEqual(['2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27']);
  });

  it('respeta la vigencia del horario recortando el rango por días calendario', () => {
    const horario = {
      ...horarioSemanal([]),
      recurrence_type: 'daily',
      valid_from: '2026-10-25',
      valid_until: '2026-10-26',
    } as RouteSchedule;
    const fechas = transportRoutesService.getScheduleDates(horario, '2026-10-20', '2026-10-31');
    expect(fechas).toEqual(['2026-10-25', '2026-10-26']);
  });
});
