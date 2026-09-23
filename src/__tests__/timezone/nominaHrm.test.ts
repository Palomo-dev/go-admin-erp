// ============================================================================
// Fase B, tanda 3 — nómina y HRM escriben el día de la organización
// ============================================================================
// Lo que fija esta red, y por qué cada caso es un bug de dinero y no de estética:
//
//   1. `country_payroll_rules.valid_from <= hoy` decide QUÉ TABLA DE RETENCIONES
//      se aplica. Con el día UTC, una nómina liquidada el 31 de diciembre a las
//      20:00 en Bogotá ya es 1 de enero en UTC y coge la norma del año siguiente.
//   2. Un préstamo cuya primera cuota vence el 31 de enero: `Date.setMonth`
//      desborda febrero al 3 de marzo, y eso deja febrero sin cuota y marzo con
//      dos.
//   3. `attendance_events.event_at` es timestamptz: acotar la jornada con
//      `${día}T00:00:00` sin offset la corre el offset entero de la sucursal.
//   4. La zona sale de la SUCURSAL dueña del dato cuando la tiene (ADR-001), no
//      de la sucursal elegida en la barra superior ni del reloj del navegador.
//
// El reloj es falso en todos los casos: si no, la prueba solo falla un día al año.
// ============================================================================

import { DobleSupabase } from './dobleSupabase';

// ---------------------------------------------------------------------------
// Dobles. `resolveTimezone` se sustituye para (a) fijar la zona y (b) dejar
// constancia de CON QUÉ IDENTIDAD se le llamó: el ADR-003 exige organización y,
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

import PayrollService from '@/lib/services/payrollService';
import EmployeeLoansService from '@/lib/services/employeeLoansService';
import EmploymentCompensationService from '@/lib/services/employmentCompensationService';
import { EmploymentsService } from '@/lib/services/employmentsService';
import { AttendanceService } from '@/lib/services/attendanceService';

const ORG = 120;

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

/** Fija el instante del reloj del sistema. */
function enElInstante(iso: string): void {
  jest.setSystemTime(new Date(iso));
}

// ===========================================================================
describe('payrollService — la tabla de retenciones que se aplica', () => {
  it('el 31 de diciembre a las 20:00 en Bogotá sigue siendo 31 de diciembre', async () => {
    zonas.porOrganizacion.set(ORG, 'America/Bogota');
    // 2027-01-01T01:00:00Z: en UTC ya es el año siguiente, en Bogotá no.
    enElInstante('2027-01-01T01:00:00.000Z');

    doble = new DobleSupabase({ country_payroll_rules: [{ data: [{ id: 'r1', year: 2026 }] }] });
    await new PayrollService(ORG).getCountryRules('CO');

    expect(doble.filtro('country_payroll_rules', 'lte', 'valid_from')).toBe('2026-12-31');
  });

  it('el 1 de enero a las 00:30 en Madrid ya es 1 de enero, no 31 de diciembre', async () => {
    zonas.porOrganizacion.set(ORG, 'Europe/Madrid');
    // 2026-12-31T23:30:00Z = 2027-01-01T00:30 en Madrid (+01:00).
    enElInstante('2026-12-31T23:30:00.000Z');

    doble = new DobleSupabase({ country_payroll_rules: [{ data: [{ id: 'r2', year: 2027 }] }] });
    await new PayrollService(ORG).getCountryRules('CO');

    expect(doble.filtro('country_payroll_rules', 'lte', 'valid_from')).toBe('2027-01-01');
  });

  it('pide la zona de la organización, sin sucursal: el catálogo es por país', async () => {
    zonas.porOrganizacion.set(ORG, 'America/Bogota');
    enElInstante('2026-06-15T12:00:00.000Z');
    doble = new DobleSupabase({ country_payroll_rules: [{ data: [] }] });

    await new PayrollService(ORG).getCountryRules('CO');

    expect(zonas.llamadas).toEqual([{ organizationId: ORG, branchId: undefined }]);
  });
});

// ===========================================================================
describe('employeeLoansService — plan de cuotas y fechas del préstamo', () => {
  const prestamo = {
    id: 'p1',
    organization_id: ORG,
    status: 'requested',
    first_payment_date: '2026-01-31',
    installments_total: 4,
    installment_amount: 250,
    principal: 1000,
    total_interest: 0,
  };

  it('la cuota del 31 de enero cae el 28 de febrero, no el 3 de marzo', async () => {
    zonas.porOrganizacion.set(ORG, 'America/Bogota');
    enElInstante('2026-01-15T12:00:00.000Z');

    doble = new DobleSupabase({
      employee_loans: [{ data: [prestamo] }],
      loan_installments: [{ data: [] }],
    });

    await new EmployeeLoansService(ORG).approve('p1', 'jefe');

    const insercion = doble.ultimaEscritura('loan_installments');
    const vencimientos = (insercion?.payload as Array<{ due_date: string }>).map((c) => c.due_date);
    expect(vencimientos).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  });

  it('el desembolso lleva el día de la organización, no el día UTC', async () => {
    zonas.porOrganizacion.set(ORG, 'America/Bogota');
    // 2026-03-02T02:00:00Z es todavía el 1 de marzo, 21:00, en Bogotá.
    enElInstante('2026-03-02T02:00:00.000Z');

    doble = new DobleSupabase({
      employee_loans: [{ data: [prestamo] }],
      loan_installments: [{ data: [] }],
    });

    await new EmployeeLoansService(ORG).approve('p1', 'jefe');

    const actualizacion = doble
      .deTabla('employee_loans')
      .find((l) => l.operacion === 'update');
    expect((actualizacion?.payload as { disbursement_date: string }).disbursement_date).toBe(
      '2026-03-01',
    );
  });

  it('un año bisiesto no desborda: 31 de enero de 2028 → 29 de febrero', async () => {
    zonas.porOrganizacion.set(ORG, 'America/Bogota');
    enElInstante('2028-01-10T12:00:00.000Z');

    doble = new DobleSupabase({
      employee_loans: [
        { data: [{ ...prestamo, first_payment_date: '2028-01-31', installments_total: 2 }] },
      ],
      loan_installments: [{ data: [] }],
    });

    await new EmployeeLoansService(ORG).approve('p1', 'jefe');

    const insercion = doble.ultimaEscritura('loan_installments');
    const vencimientos = (insercion?.payload as Array<{ due_date: string }>).map((c) => c.due_date);
    expect(vencimientos).toEqual(['2028-01-31', '2028-02-29']);
  });
});

// ===========================================================================
describe('employmentCompensationService — vigencia salarial vigente hoy', () => {
  it('a las 23:30 de Madrid la vigencia de hoy sigue siendo la de hoy', async () => {
    zonas.porOrganizacion.set(ORG, 'Europe/Madrid');
    // 2026-07-01T21:30:00Z = 2026-07-01 23:30 en Madrid (+02:00). En UTC es el
    // mismo día, pero media hora después ya no lo sería.
    enElInstante('2026-07-01T22:30:00.000Z'); // 2026-07-02 00:30 en Madrid

    doble = new DobleSupabase({ employment_compensation: [{ data: [] }] });
    await new EmploymentCompensationService(ORG).getCurrentAssignment('e1');

    // El filtro por fecha efectiva se aplica en memoria; lo que se comprueba es
    // que la zona se pidió a la organización y no al reloj del proceso.
    expect(zonas.llamadas).toEqual([{ organizationId: ORG, branchId: undefined }]);
  });
});

// ===========================================================================
describe('employmentsService — alta y retiro con la zona de la sucursal', () => {
  it('duplicar un contrato de la sede de Madrid usa el día de Madrid', async () => {
    zonas.porOrganizacion.set(ORG, 'America/Bogota');
    zonas.porSucursal.set(7, 'Europe/Madrid');
    // 2026-05-11T00:30:00Z: en Bogotá es todavía el 10 de mayo; en Madrid, el 11.
    enElInstante('2026-05-11T00:30:00.000Z');

    doble = new DobleSupabase({
      employments: [
        { data: [{ id: 'c1', branch_id: 7, hire_date: '2020-01-01', organization_member_id: 3 }] },
        { data: [{ id: 'c2' }] },
      ],
    });

    await new EmploymentsService(ORG).duplicate('c1', 99);

    const insercion = doble.ultimaEscritura('employments');
    expect((insercion?.payload as { hire_date: string }).hire_date).toBe('2026-05-11');
    expect(zonas.llamadas).toContainEqual({ organizationId: ORG, branchId: 7 });
  });

  it('el retiro sin fecha explícita toma el día de la sucursal del contrato', async () => {
    zonas.porOrganizacion.set(ORG, 'America/Bogota');
    zonas.porSucursal.set(7, 'Europe/Madrid');
    enElInstante('2026-05-11T00:30:00.000Z');

    doble = new DobleSupabase({
      employments: [{ data: [{ branch_id: 7 }] }, { data: [{ id: 'c1' }] }],
    });

    await new EmploymentsService(ORG).updateStatus('c1', 'terminated', {
      terminationReason: 'renuncia',
    });

    const actualizacion = doble.deTabla('employments').find((l) => l.operacion === 'update');
    expect((actualizacion?.payload as { termination_date: string }).termination_date).toBe(
      '2026-05-11',
    );
  });
});

// ===========================================================================
describe('attendanceService — la jornada se acota con instantes, no con cadenas', () => {
  it('el rango de un día lleva el offset real de la sucursal', async () => {
    zonas.porOrganizacion.set(ORG, 'America/Bogota');
    zonas.porSucursal.set(7, 'Europe/Madrid');
    enElInstante('2026-07-15T10:00:00.000Z');

    doble = new DobleSupabase({ attendance_events: [{ data: [] }] });
    await new AttendanceService(ORG).getEvents({
      dateFrom: '2026-07-15',
      dateTo: '2026-07-15',
      branchId: 7,
    });

    // Madrid en julio es +02:00 (horario de verano).
    expect(doble.filtro('attendance_events', 'gte', 'event_at')).toBe(
      '2026-07-15T00:00:00.000+02:00',
    );
    expect(doble.filtro('attendance_events', 'lte', 'event_at')).toBe(
      '2026-07-15T23:59:59.999+02:00',
    );
  });

  it('en invierno el mismo día de Madrid lleva +01:00: el offset no se cablea', async () => {
    zonas.porOrganizacion.set(ORG, 'America/Bogota');
    zonas.porSucursal.set(7, 'Europe/Madrid');
    enElInstante('2026-01-15T10:00:00.000Z');

    doble = new DobleSupabase({ attendance_events: [{ data: [] }] });
    await new AttendanceService(ORG).getEvents({
      dateFrom: '2026-01-15',
      dateTo: '2026-01-15',
      branchId: 7,
    });

    expect(doble.filtro('attendance_events', 'gte', 'event_at')).toBe(
      '2026-01-15T00:00:00.000+01:00',
    );
  });

  it('sin filtro de sucursal se usa la zona de la organización', async () => {
    zonas.porOrganizacion.set(ORG, 'America/Bogota');
    enElInstante('2026-01-15T10:00:00.000Z');

    doble = new DobleSupabase({ attendance_events: [{ data: [] }] });
    await new AttendanceService(ORG).getEvents({ dateFrom: '2026-01-15', dateTo: '2026-01-15' });

    expect(doble.filtro('attendance_events', 'gte', 'event_at')).toBe(
      '2026-01-15T00:00:00.000-05:00',
    );
  });
});
