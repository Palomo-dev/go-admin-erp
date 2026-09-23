// ============================================================================
// Fase B, tandas 4 y 5 — vigencias que cortan servicio
// ============================================================================
// Una vigencia mal escrita no se ve en una pantalla: se ve en la puerta. El
// socio que pagó hasta el 30 no entra el 30, el abonado del parqueadero paga
// como ocasional, la promoción no descuenta el primer día y el cupón caduca la
// víspera.
//
// Las cuatro columnas de aquí son **timestamptz** (verificado en
// `information_schema.columns`): `memberships.start_date` / `.end_date`,
// `promotions.*` y `coupons.*`. Mandarles 'YYYY-MM-DD' equivale a mandar
// medianoche UTC. Hoy el error se cancela porque la lectura vuelve a usar
// `.split('T')[0]`; en cuanto uno de los dos lados se arregla, todo se corre un
// día. Por eso escritura y lectura se prueban juntas.
//
// `parking_passes.*`, `membership_freezes.*` y `ap_installments.due_date` sí son
// `date`: ahí lo que se comprueba es que el día sea el de la organización.
// ============================================================================

import { DobleSupabase } from './dobleSupabase';

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

const ORG = 120;

jest.mock('@/lib/supabase/config', () => ({
  get supabase() {
    return doble;
  },
  createSupabaseClient: () => doble,
}));

jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => 120,
  getCurrentBranchId: () => null,
  getCurrentUserId: async () => 'usuario-de-prueba',
  obtenerOrganizacionActiva: () => ({ id: 120 }),
}));

import {
  createMembership,
  renewMembership,
  freezeMembership,
  getDaysRemaining,
} from '@/lib/services/gymService';
import parkingService from '@/lib/services/parkingService';
import { PromotionsService } from '@/components/pos/promociones/promotionsService';
import { CuentaPorPagarDetailService } from '@/components/finanzas/cuentas-por-pagar/id/service';

beforeEach(() => {
  zonas.porOrganizacion.clear();
  zonas.porSucursal.clear();
  zonas.llamadas.length = 0;
  doble = new DobleSupabase();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

function enElInstante(iso: string): void {
  jest.setSystemTime(new Date(iso));
}

// ===========================================================================
describe('membresías de gimnasio — la vigencia cubre el día entero', () => {
  it('una membresía «hasta el 30» en Madrid no caduca hasta el final del 30', async () => {
    zonas.porOrganizacion.set(ORG, 'Europe/Madrid');
    enElInstante('2026-09-01T10:00:00.000Z');
    doble = new DobleSupabase({ memberships: [{ data: [{ id: 1 }] }] });

    await createMembership({
      customer_id: 5,
      membership_plan_id: 2,
      start_date: '2026-09-01',
      end_date: '2026-09-30',
    } as never);

    const insercion = doble.ultimaEscritura('memberships');
    const guardado = insercion?.payload as { start_date: string; end_date: string };

    // Septiembre en Madrid es +02:00.
    expect(guardado.start_date).toBe('2026-09-01T00:00:00.000+02:00');
    expect(guardado.end_date).toBe('2026-09-30T23:59:59.999+02:00');

    // A las 23:30 del 30 (hora de Madrid) la membresía sigue viva: es
    // exactamente el caso que antes cortaba el servicio un día antes.
    const alas2330 = new Date('2026-09-30T21:30:00.000Z');
    expect(new Date(guardado.end_date).getTime()).toBeGreaterThan(alas2330.getTime());
  });

  it('una membresía que vence hoy tiene 0 días restantes, no 1 ni -1', () => {
    // 2026-09-30T21:30:00Z = 23:30 del 30 en Madrid.
    enElInstante('2026-09-30T21:30:00.000Z');
    expect(getDaysRemaining('2026-09-30T23:59:59.999+02:00', 'Europe/Madrid')).toBe(0);
    // Y a primera hora del mismo día da lo mismo: no depende de la hora.
    enElInstante('2026-09-30T06:00:00.000Z');
    expect(getDaysRemaining('2026-09-30T23:59:59.999+02:00', 'Europe/Madrid')).toBe(0);
  });

  it('a las 00:30 del día siguiente en Madrid, la de ayer ya da -1', () => {
    // 2026-09-30T22:30:00Z = 00:30 del 1 de octubre en Madrid. Contado con la
    // zona del navegador (UTC, o la del proceso de pruebas) saldría 0: la
    // membresía parecería viva un día más de la cuenta.
    enElInstante('2026-09-30T22:30:00.000Z');
    expect(getDaysRemaining('2026-09-30T23:59:59.999+02:00', 'Europe/Madrid')).toBe(-1);
  });

  it('la que venció ayer da -1 y la que vence mañana, 1', () => {
    enElInstante('2026-09-30T12:00:00.000Z');
    expect(getDaysRemaining('2026-09-29T23:59:59.999+02:00', 'Europe/Madrid')).toBe(-1);
    expect(getDaysRemaining('2026-10-01T23:59:59.999+02:00', 'Europe/Madrid')).toBe(1);
  });

  it('renovar 30 días cruzando el cambio de horario da 30 días de calendario', async () => {
    zonas.porOrganizacion.set(ORG, 'Europe/Madrid');
    // 00:30 del 15 de octubre en Madrid (+02:00). El 25 de octubre Madrid
    // pasa a +01:00, así que `Date.now() + 30 × 24 h` cae a las 23:30 del 13
    // de noviembre: un día menos de membresía, pagado.
    enElInstante('2026-10-14T22:30:00.000Z');
    doble = new DobleSupabase({
      memberships: [
        {
          data: [
            {
              id: 1,
              organization_id: ORG,
              membership_plan_id: 2,
              end_date: '2026-10-20T23:59:59.999+02:00',
            },
          ],
        },
        { data: [{ id: 1 }] },
      ],
      membership_plans: [{ data: [{ id: 2, duration_days: 30, name: 'mensual' }] }],
    });

    await renewMembership(1);

    const actualizacion = doble.ultimaEscritura('memberships');
    const guardado = actualizacion?.payload as { start_date: string; end_date: string };
    expect(guardado.start_date).toBe('2026-10-15T00:00:00.000+02:00');
    // 15 de octubre + 30 días = 14 de noviembre, ya en horario de invierno.
    expect(guardado.end_date).toBe('2026-11-14T23:59:59.999+01:00');
  });

  it('el congelamiento escribe el día de la organización (columna `date`)', async () => {
    zonas.porOrganizacion.set(ORG, 'America/Bogota');
    // 2026-03-02T02:00:00Z es todavía el 1 de marzo, 21:00, en Bogotá.
    enElInstante('2026-03-02T02:00:00.000Z');
    doble = new DobleSupabase({
      memberships: [{ data: [{ id: 1, organization_id: ORG }] }, { data: [{ id: 1 }] }],
      membership_freezes: [{ data: [{ id: 9 }] }],
    });

    await freezeMembership(1, 'viaje');

    const insercion = doble.ultimaEscritura('membership_freezes');
    expect((insercion?.payload as { start_date: string }).start_date).toBe('2026-03-01');
    // La organización sale de la membresía, no de un parámetro del llamador.
    expect(zonas.llamadas).toContainEqual({ organizationId: ORG, branchId: undefined });
  });
});

// ===========================================================================
describe('abonados de parqueadero — `parking_passes.end_date` es `date`', () => {
  it('un pase que vence hoy sigue abriendo la talanquera hoy', async () => {
    zonas.porOrganizacion.set(ORG, 'America/Bogota');
    // 2026-04-11T02:00:00Z: en UTC ya es el 11; en Bogotá son las 21:00 del 10.
    enElInstante('2026-04-11T02:00:00.000Z');
    doble = new DobleSupabase({ parking_pass_vehicles: [{ data: null }] });

    await parkingService.checkPlateHasActivePass(ORG, 'ABC123');

    expect(doble.filtro('parking_pass_vehicles', 'gte', 'pass.end_date')).toBe('2026-04-10');
  });

  it('la caja del día se acota con instantes, no con el prefijo de `exit_at`', async () => {
    zonas.porOrganizacion.set(ORG, 'America/Bogota');
    enElInstante('2026-04-10T15:00:00.000Z');

    doble = new DobleSupabase({
      parking_sessions: [
        {
          data: [
            // 20:30 del 10 en Bogotá. En UTC es el 11: el prefijo de cadena lo
            // dejaba fuera de la caja del día y el dinero no cuadraba.
            { status: 'closed', exit_at: '2026-04-11T01:30:00.000Z', amount: 12000 },
            // 00:30 del 10 en UTC = 19:30 del 9 en Bogotá: el prefijo de cadena
            // lo contaba como del día 10 y sumaba a la caja un cierre de ayer.
            { status: 'closed', exit_at: '2026-04-10T00:30:00.000Z', amount: 99000 },
          ],
        },
      ],
    });

    const stats = await parkingService.getStats(null, ORG);

    expect(stats.completed_today).toBe(1);
    expect(stats.revenue_today).toBe(12000);
  });
});

// ===========================================================================
describe('promociones — la vigencia entra y sale con el día de la organización', () => {
  it('el día de inicio empieza a las 00:00 y el de fin acaba a las 23:59:59.999', async () => {
    zonas.porOrganizacion.set(ORG, 'America/Bogota');
    enElInstante('2026-05-20T12:00:00.000Z');
    doble = new DobleSupabase({ promotions: [{ data: [{ id: 'promo-1' }] }] });

    await PromotionsService.create({
      name: 'Rebaja',
      promotion_type: 'percentage',
      discount_value: 10,
      applies_to: 'all',
      start_date: '2026-06-01',
      end_date: '2026-06-30',
    } as never);

    const insercion = doble.ultimaEscritura('promotions');
    const guardado = (insercion?.payload as Array<{ start_date: string; end_date: string }>)[0];
    expect(guardado.start_date).toBe('2026-06-01T00:00:00.000-05:00');
    expect(guardado.end_date).toBe('2026-06-30T23:59:59.999-05:00');
  });

  it('sin fecha de fin no se inventa ninguna', async () => {
    zonas.porOrganizacion.set(ORG, 'America/Bogota');
    enElInstante('2026-05-20T12:00:00.000Z');
    doble = new DobleSupabase({ promotions: [{ data: [{ id: 'promo-2' }] }] });

    await PromotionsService.create({
      name: 'Permanente',
      promotion_type: 'percentage',
      discount_value: 5,
      applies_to: 'all',
      start_date: '2026-06-01',
    } as never);

    const insercion = doble.ultimaEscritura('promotions');
    const guardado = (insercion?.payload as Array<Record<string, unknown>>)[0];
    expect(guardado.end_date).toBeUndefined();
  });
});

// ===========================================================================
describe('cuotas de cuentas por pagar — la firma pide identidad, no zona', () => {
  it('el plan de cuotas del 31 de enero no se salta febrero', async () => {
    zonas.porOrganizacion.set(ORG, 'America/Bogota');
    zonas.porSucursal.set(7, 'Europe/Madrid');
    // 2026-01-31T22:00:00Z = 17:00 del 31 en Bogotá y 23:00 del 31 en Madrid.
    enElInstante('2026-01-31T22:00:00.000Z');
    doble = new DobleSupabase({ ap_installments: [{ data: [] }] });

    await CuentaPorPagarDetailService.crearCuotas('cuenta-1', 1200, 4, new Date(), ORG, 7);

    const insercion = doble.ultimaEscritura('ap_installments');
    const vencimientos = (insercion?.payload as Array<{ due_date: string }>).map((c) => c.due_date);
    expect(vencimientos).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
    // La zona se pidió con la identidad de la cuenta: organización Y sucursal.
    expect(zonas.llamadas).toContainEqual({ organizationId: ORG, branchId: 7 });
  });

  it('sin sucursal, el primer vencimiento es el día de la organización, no el UTC', async () => {
    zonas.porOrganizacion.set(ORG, 'America/Bogota');
    // 2026-02-01T02:00:00Z: en UTC ya es febrero; en Bogotá son las 21:00 del
    // 31 de enero. El plan tiene que arrancar el 31, no el 1.
    enElInstante('2026-02-01T02:00:00.000Z');
    doble = new DobleSupabase({ ap_installments: [{ data: [] }] });

    await CuentaPorPagarDetailService.crearCuotas('cuenta-1', 600, 3, new Date(), ORG, null);

    const insercion = doble.ultimaEscritura('ap_installments');
    const vencimientos = (insercion?.payload as Array<{ due_date: string }>).map((c) => c.due_date);
    expect(vencimientos).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
  });

  it('la sucursal manda sobre la organización para fijar el primer día', async () => {
    zonas.porOrganizacion.set(ORG, 'America/Bogota');
    zonas.porSucursal.set(7, 'Europe/Madrid');
    // 2026-02-01T00:30:00Z: 19:30 del 31 de enero en Bogotá, 01:30 del 1 de
    // febrero en Madrid. La cuenta es de la sede de Madrid.
    enElInstante('2026-02-01T00:30:00.000Z');
    doble = new DobleSupabase({ ap_installments: [{ data: [] }] });

    await CuentaPorPagarDetailService.crearCuotas('cuenta-1', 300, 2, new Date(), ORG, 7);

    const insercion = doble.ultimaEscritura('ap_installments');
    const vencimientos = (insercion?.payload as Array<{ due_date: string }>).map((c) => c.due_date);
    expect(vencimientos).toEqual(['2026-02-01', '2026-03-01']);
  });
});
