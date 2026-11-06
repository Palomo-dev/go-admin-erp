import { FixedAssetService } from '@/components/finanzas/activos-fijos/FixedAssetService';
import {
  colillaCompleta,
  colillasPendientes,
  ejecucionVigente,
  esBloqueoDeduccion,
  estadoRetencion,
} from '../nominaDeducciones';

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
jest.mock('@/lib/hooks/useOrganization', () => ({ obtenerOrganizacionActiva: () => ({ id: 1 }) }));

describe('deducciones de nómina', () => {
  it('sin calcular no es cero', () => {
    expect(estadoRetencion(null)).toBe('sin_calcular');
    expect(estadoRetencion(undefined)).toBe('sin_calcular');
    expect(estadoRetencion(0)).toBe('no_aplica');
    expect(estadoRetencion(1000)).toBe('con_valor');
  });

  it('una colilla sin retención o con préstamo sin confirmar queda pendiente', () => {
    const completa = { tax_withholding: 0, loan_deductions: 0 };
    const sinRetencion = { tax_withholding: null, loan_deductions: 0 };
    const sinPrestamo = { tax_withholding: 0, loan_deductions: null };
    expect(colillaCompleta(completa)).toBe(true);
    expect(colillasPendientes([completa, sinRetencion, sinPrestamo])).toEqual([sinRetencion, sinPrestamo]);
  });

  it('manda la ejecución final y, si no hay, la última', () => {
    const a = { is_final: true, run_number: 1 };
    const b = { is_final: false, run_number: 3 };
    expect(ejecucionVigente([a, b])).toBe(a);
    expect(ejecucionVigente([b, { is_final: null, run_number: 2 }])).toBe(b);
    expect(ejecucionVigente([])).toBeNull();
  });

  it('reconoce el bloqueo de la base', () => {
    expect(esBloqueoDeduccion({ message: 'NOMINA_CIERRE_BLOQUEADO: 2 colillas' })).toBe(true);
    expect(esBloqueoDeduccion({ message: 'NOMINA_DEDUCCION_SIN_CALCULAR: la colilla' })).toBe(true);
    expect(esBloqueoDeduccion(new Error('otra cosa'))).toBe(false);
  });
});

describe('depreciación', () => {
  const base = { acquisition_cost: 12000, salvage_value: 0, useful_life_months: 12 };

  it('línea recta sí calcula', () => {
    expect(FixedAssetService.calculateMonthlyDepreciation({ ...base, depreciation_method: 'straight_line' })).toBe(1000);
  });

  it('un método sin cálculo devuelve null, nunca cero', () => {
    expect(FixedAssetService.calculateMonthlyDepreciation({ ...base, depreciation_method: 'declining_balance' })).toBeNull();
    expect(FixedAssetService.calculateMonthlyDepreciation({ ...base, depreciation_method: 'units_of_production' })).toBeNull();
  });
});
