import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { avisoPeriodo } from '@/lib/finanzas/permisosCierre';
import { motivoReaperturaValido } from '@/components/finanzas/contabilidad/periodos-fiscales/PeriodosFiscalesService';

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
jest.mock('@/lib/hooks/useOrganization', () => ({ obtenerOrganizacionActiva: () => ({ id: 2 }) }));

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261027212000_cierre_periodo_validaciones.sql'), 'utf8');

describe('cierre de periodo', () => {
  it('bloquea el cierre con borradores o pendientes', () => {
    expect(sql).toContain('periodo_con_pendientes');
    expect(sql).toMatch(/posted is not true/);
    expect(sql).toMatch(/resolved_at is null/);
    expect(avisoPeriodo({ message: 'periodo_con_pendientes: 2 borradores, 0 pendientes' }, 'x')).toContain('2 borradores');
  });

  it('el motivo solo es obligatorio al reabrir y se guarda quién y cuándo', () => {
    expect(motivoReaperturaValido('')).toBeNull();
    expect(motivoReaperturaValido('  abc ')).toBeNull();
    expect(motivoReaperturaValido(' Ajuste tardío ')).toBe('Ajuste tardío');
    expect(sql).toMatch(/reopened_by = auth\.uid\(\), reopened_at = now\(\), reopen_reason/);
    expect(sql).toMatch(/fn_cierre_periodo\(p_organization_id integer, p_period_id uuid, p_notas text default null\)/);
    expect(avisoPeriodo({ message: 'motivo_obligatorio' }, 'x')).toContain('motivo');
  });

  it('expone el consecutivo por tipo de comprobante con sus saltos', () => {
    expect(sql).toContain('fn_consecutivos_periodo');
    expect(sql).toMatch(/generate_series\(min\(g\.n\), max\(g\.n\)\)/);
  });
});
