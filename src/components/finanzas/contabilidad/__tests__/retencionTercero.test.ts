jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));

import { cuentaRetencionExigeNit, lineasSinTerceroParaContabilizar, mensajeErrorAsiento } from '../ContabilidadService';

describe('retenciones exigen tercero al contabilizar', () => {
  it('reconoce 2365, 2367 y 2368', () => {
    expect(cuentaRetencionExigeNit('23652501')).toBe(true);
    expect(cuentaRetencionExigeNit('2367')).toBe(true);
    expect(cuentaRetencionExigeNit('236805')).toBe(true);
    expect(cuentaRetencionExigeNit('2366')).toBe(false);
    expect(cuentaRetencionExigeNit('2408')).toBe(false);
  });
  it('lista las líneas sin NIT en retenciones y sin tercero en cuentas marcadas', () => {
    const faltan = lineasSinTerceroParaContabilizar(
      [
        { account_code: '23652501', tercero_nombre: 'Proveedor' },
        { account_code: '23670101', tercero_nit: '900123456' },
        { account_code: '130505', tercero_nombre: 'Cliente' },
        { account_code: '220505' },
        { account_code: '110505' },
      ],
      (c) => c.startsWith('22') || c.startsWith('13'),
    );
    expect(faltan).toEqual(['23652501', '220505']);
  });
  it('traduce el error del servidor', () => {
    expect(mensajeErrorAsiento({ message: 'TERCERO_RETENCION_REQUERIDO: la cuenta 2365' })).toMatch(/NIT o la cédula/);
  });
});
