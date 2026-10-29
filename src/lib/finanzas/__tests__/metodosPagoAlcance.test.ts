import {
  esColumnaAusente,
  filtrarMetodosPorSucursal,
  metodoCatalogoVisible,
  metodoPermitidoEnSucursal,
  metodosConMonto,
  metodosPagoParaPromocion,
  promocionAplicaConMetodos,
  reiniciarColumnasAusentes,
  seleccionarConColumnaOpcional,
  TTL_COLUMNA_AUSENTE_MS,
} from '../metodosPagoAlcance';
import { opcionesSucursalesMetodo, sucursalesParaGuardar } from '@/components/finanzas/metodos-pago/SucursalesMetodoPago';

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));

describe('métodos de pago por sucursal', () => {
  // Space Cocktails (142): DIDI transferencia solo en El Socorro (117).
  const metodos = [
    { payment_method_code: 'cash', branch_ids: null },
    { payment_method_code: 'didi_transferencia', branch_ids: [117] },
    { payment_method_code: 'card' }, // columna ausente (migración sin aplicar)
  ];

  it('NULL o ausente = todas las sucursales', () => {
    expect(metodoPermitidoEnSucursal(null, 120)).toBe(true);
    expect(metodoPermitidoEnSucursal(undefined, 120)).toBe(true);
    expect(metodoPermitidoEnSucursal([], 120)).toBe(true);
  });

  it('DIDI se ve en 117 y no en 120 ni 121', () => {
    const codigos = (b: number) => filtrarMetodosPorSucursal(metodos, b).map((m) => m.payment_method_code);
    expect(codigos(117)).toEqual(['cash', 'didi_transferencia', 'card']);
    expect(codigos(120)).toEqual(['cash', 'card']);
    expect(codigos(121)).toEqual(['cash', 'card']);
  });

  it('acepta el texto de un array de Postgres', () => {
    expect(metodoPermitidoEnSucursal('{117,118}', 118)).toBe(true);
    expect(metodoPermitidoEnSucursal('{117}', 120)).toBe(false);
  });

  it('el formulario guarda NULL con «Todas», vacío o todas marcadas', () => {
    expect(sucursalesParaGuardar(null)).toBeNull();
    expect(sucursalesParaGuardar([])).toBeNull();
    expect(sucursalesParaGuardar([117, 120, 121], 3)).toBeNull();
    expect(sucursalesParaGuardar([117, 117], 3)).toEqual([117]);
  });
});

describe('promociones por método de pago', () => {
  it('NULL = cualquier método', () => {
    expect(promocionAplicaConMetodos(null, ['cash'])).toBe(true);
    expect(promocionAplicaConMetodos(undefined, [])).toBe(true);
  });
  it('solo con un método de la lista; sin método elegido no aplica', () => {
    expect(promocionAplicaConMetodos(['didi_transferencia'], ['cash'])).toBe(false);
    expect(promocionAplicaConMetodos(['didi_transferencia'], ['cash', 'didi_transferencia'])).toBe(true);
    expect(promocionAplicaConMetodos(['didi_transferencia'], [])).toBe(false);
  });
  it('métodos con monto, sin repetir', () => {
    expect(metodosConMonto([{ method: 'cash', amount: 0 }, { method: 'didi', amount: 5 }, { method: 'didi', amount: 1 }])).toEqual(['didi']);
  });
  it('el selector de la promoción respeta las sucursales del método', () => {
    const m = [{ code: 'cash', branch_ids: null }, { code: 'didi', branch_ids: [117] }];
    expect(metodosPagoParaPromocion(m, [120]).map((x) => x.code)).toEqual(['cash']);
    expect(metodosPagoParaPromocion(m, [117]).map((x) => x.code)).toEqual(['cash', 'didi']);
    expect(metodosPagoParaPromocion(m, null).map((x) => x.code)).toEqual(['cash', 'didi']);
  });
});

describe('catálogo aislado por organización', () => {
  it('sistema + propios; nunca el personalizado de otra organización', () => {
    expect(metodoCatalogoVisible({ code: 'cash', is_system: true }, 142, [])).toBe(true);
    expect(metodoCatalogoVisible({ code: 'didi_transferencia', is_system: false, organization_id: 142 }, 142, [])).toBe(true);
    expect(metodoCatalogoVisible({ code: '001', is_system: false, organization_id: 132 }, 142, ['001'])).toBe(false);
    // Antes de la migración (sin organization_id): solo si la organización lo tiene.
    expect(metodoCatalogoVisible({ code: 'SQS', is_system: false }, 142, [])).toBe(false);
    expect(metodoCatalogoVisible({ code: 'wompi', is_system: false }, 142, ['wompi'])).toBe(true);
  });
});

describe('retrocompatible con la columna ausente', () => {
  beforeEach(() => reiniciarColumnasAusentes());
  it('reintenta sin la columna si la BD dice 42703', async () => {
    const llamadas: string[] = [];
    const r = await seleccionarConColumnaOpcional('t', 'branch_ids', async (extra) => {
      llamadas.push(extra);
      return extra
        ? { data: null, error: { code: '42703', message: 'column organization_payment_methods.branch_ids does not exist' } }
        : { data: [1], error: null };
    });
    expect(r.data).toEqual([1]);
    expect(llamadas).toEqual([', branch_ids', '']);
    await seleccionarConColumnaOpcional('t', 'branch_ids', async (extra) => { llamadas.push(extra); return { data: [], error: null }; });
    expect(llamadas[2]).toBe('');
  });
  it('la marca de columna ausente vence a los 5 min (migración aplicada sin recargar)', async () => {
    const llamadas: string[] = [];
    const ahora = jest.spyOn(Date, 'now');
    ahora.mockReturnValue(1_000_000);
    await seleccionarConColumnaOpcional('t', 'branch_ids', async (extra) => {
      llamadas.push(extra);
      return extra ? { data: null, error: { code: '42703', message: 'column branch_ids does not exist' } } : { data: [], error: null };
    });
    ahora.mockReturnValue(1_000_000 + TTL_COLUMNA_AUSENTE_MS - 1);
    await seleccionarConColumnaOpcional('t', 'branch_ids', async (extra) => { llamadas.push(extra); return { data: [], error: null }; });
    ahora.mockReturnValue(1_000_000 + TTL_COLUMNA_AUSENTE_MS);
    await seleccionarConColumnaOpcional('t', 'branch_ids', async (extra) => { llamadas.push(extra); return { data: [], error: null }; });
    expect(llamadas).toEqual([', branch_ids', '', '', ', branch_ids']);
    ahora.mockRestore();
  });
  it('no confunde otros errores', () => {
    expect(esColumnaAusente({ code: '42501', message: 'permission denied' }, 'branch_ids')).toBe(false);
    expect(esColumnaAusente({ code: 'PGRST204', message: "Could not find the 'payment_method_codes' column" }, 'payment_method_codes')).toBe(true);
  });
});

describe('selector de sucursales: solo activas (y las inactivas ya marcadas, con aviso)', () => {
  const sucursales = [
    { id: 117, name: 'El Socorro', is_active: true },
    { id: 120, name: 'San Javier', is_active: true },
    { id: 121, name: 'La 88', is_active: false },
    { id: 130, name: 'Sin dato' },
  ];
  it('oculta la inactiva no marcada; la marcada sale como «· inactiva»', () => {
    expect(opcionesSucursalesMetodo(sucursales, null).map((o) => o.etiqueta)).toEqual(['El Socorro', 'San Javier', 'Sin dato']);
    expect(opcionesSucursalesMetodo(sucursales, [121]).map((o) => [o.etiqueta, o.inactiva])).toEqual([
      ['El Socorro', false], ['San Javier', false], ['La 88 · inactiva', true], ['Sin dato', false],
    ]);
  });
  it('todas las activas marcadas = NULL; con una inactiva marcada se guarda la lista', () => {
    const activas = [117, 120, 130];
    expect(sucursalesParaGuardar([117, 120, 130], activas)).toBeNull();
    expect(sucursalesParaGuardar([117, 120, 121, 130], activas)).toEqual([117, 120, 121, 130]);
    expect(sucursalesParaGuardar([117, 121], activas)).toEqual([117, 121]);
  });
});
