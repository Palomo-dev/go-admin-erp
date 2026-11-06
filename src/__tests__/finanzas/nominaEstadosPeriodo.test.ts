/// <reference types="jest" />
/**
 * Crear periodos de nómina (2026-11-06). `createPeriod` mandaba `status: 'draft'`
 * y el CHECK de payroll_periods no lo admite: ningún periodo se podía crear.
 * `createRun` mandaba `calculating`, que tampoco admite payroll_runs. Estos
 * valores salen de pg_constraint en producción.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ESTADOS_PERIODO = ['open', 'calculating', 'calculated', 'reviewing', 'approved', 'paying', 'paid', 'closed', 'cancelled'];
const ESTADOS_CORRIDA = ['running', 'completed', 'failed', 'superseded'];

const inserciones: Array<{ tabla: string; fila: Record<string, unknown> }> = [];
const filtros: Array<[string, unknown]> = [];

jest.mock('@/lib/supabase/config', () => {
  const cadena = (tabla: string) => {
    const c: Record<string, unknown> = {};
    const yo = () => c;
    c.insert = (fila: Record<string, unknown>) => {
      inserciones.push({ tabla, fila });
      return c;
    };
    c.update = yo;
    c.delete = yo;
    c.select = yo;
    c.order = yo;
    c.eq = (col: string, val: unknown) => {
      filtros.push([col, val]);
      return c;
    };
    c.single = async () => ({ data: { id: 'x', run_number: 1 }, error: null });
    c.then = (ok: (v: unknown) => unknown) => ok({ data: [], error: null });
    return c;
  };
  return { supabase: { from: cadena } };
});
jest.mock('@/lib/services/timezoneResolver', () => ({ resolveTimezone: async () => 'America/Bogota' }));

import PayrollService from '@/lib/services/payrollService';

const raiz = join(__dirname, '..', '..', '..');

beforeEach(() => {
  inserciones.length = 0;
  filtros.length = 0;
});

describe('estados de nómina contra la base', () => {
  const servicio = new PayrollService(7);

  it('un periodo nuevo nace en un estado que la base admite', async () => {
    await servicio.createPeriod({ period_start: '2026-11-01', period_end: '2026-11-30', frequency: 'monthly' } as never);
    const fila = inserciones.find((i) => i.tabla === 'payroll_periods')?.fila;
    expect(fila?.status).toBe('open');
    expect(ESTADOS_PERIODO).toContain(fila?.status);
    expect(fila?.organization_id).toBe(7);
  });

  it('solo se elimina un periodo abierto', async () => {
    await servicio.deletePeriod('x');
    expect(filtros).toContainEqual(['status', 'open']);
  });

  it('una corrida nace en un estado que la base admite', async () => {
    await servicio.createRun('p', '00000000-0000-0000-0000-000000000001');
    const fila = inserciones.find((i) => i.tabla === 'payroll_runs')?.fila;
    expect(ESTADOS_CORRIDA).toContain(fila?.status);
  });

  it('las listas de estados solo ofrecen valores válidos', () => {
    for (const { value } of servicio.getPeriodStatuses()) expect(ESTADOS_PERIODO).toContain(value);
    for (const { value } of servicio.getRunStatuses()) expect(ESTADOS_CORRIDA).toContain(value);
  });

  it('el detalle ejecuta el cálculo real, sin simularlo ni usar un usuario inventado', () => {
    const pagina = readFileSync(join(raiz, 'src/app/app/hrm/nomina/periodos/[id]/page.tsx'), 'utf8');
    expect(pagina).toContain('calculatePeriod(periodId, usuario)');
    expect(pagina).not.toContain("'current-user'");
    expect(pagina).not.toContain('Simulate calculation');
  });
});
