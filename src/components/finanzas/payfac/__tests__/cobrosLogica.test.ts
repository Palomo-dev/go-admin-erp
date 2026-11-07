/**
 * Finanzas ronda 2, A7–A10: lectura de la API de PayFac, KPIs, filtros, CSV y
 * reglas de la cuenta de abono en la pantalla.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  camposFaltantesCuenta,
  cuerpoNuevaCuenta,
  datosDeRespuesta,
  ErrorApiCobros,
  filasCsvDispersiones,
  filtrarDispersiones,
  kpisDispersiones,
  motivoNoQuitarCuenta,
  ultimosDigitos,
  type CuentaAbono,
  type Dispersion,
  type FormularioCuentaAbono,
} from '../cobrosLogica';

const RAIZ = path.resolve(__dirname, '..', '..', '..', '..', '..');
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), 'utf-8');

const dispersion = (p: Partial<Dispersion>): Dispersion => ({
  id: 'po-1',
  organization_id: 120,
  payout_reference: 'DSP-2026-0311',
  provider_code: 'breb',
  total_amount: '2640000.00',
  commission_amount: '79200.00',
  net_amount: '2560800.00',
  currency: 'COP',
  status: 'pending',
  payout_method: 'breb',
  period_start: '2026-11-01T05:00:00Z',
  period_end: '2026-11-04T04:59:59Z',
  scheduled_at: null,
  processed_at: null,
  failed_at: null,
  failure_reason: null,
  created_at: '2026-11-04T12:00:00Z',
  ...p,
});

describe('lectura de la API { success, data }', () => {
  test('devuelve `data` del sobre de la API (antes se leía el sobre como arreglo)', () => {
    const lista = [dispersion({})];
    expect(datosDeRespuesta<Dispersion[]>({ success: true, data: lista })).toBe(lista);
    expect(datosDeRespuesta({ success: true, data: { totalCollected: 10 } })).toEqual({ totalCollected: 10 });
  });

  test('acepta un arreglo suelto (forma antigua)', () => {
    expect(datosDeRespuesta<number[]>([1, 2])).toEqual([1, 2]);
  });

  test('un error lanza ErrorApiCobros con mensaje, estado y código', () => {
    try {
      datosDeRespuesta({ error: 'No', code: 'unica_verificada_con_pendientes' }, false, 409);
      throw new Error('no lanzó');
    } catch (e) {
      expect(e).toBeInstanceOf(ErrorApiCobros);
      expect((e as ErrorApiCobros).estado).toBe(409);
      expect((e as ErrorApiCobros).codigo).toBe('unica_verificada_con_pendientes');
      expect((e as ErrorApiCobros).message).toBe('No');
    }
  });

  test('una respuesta sin `data` no se toma como lista vacía', () => {
    expect(() => datosDeRespuesta({ success: true })).toThrow(ErrorApiCobros);
    expect(() => datosDeRespuesta(null, false, 500)).toThrow('HTTP 500');
  });

  test('la pantalla ya no lee la respuesta como arreglo ni con los nombres viejos', () => {
    const fuentes = ['useCobrosDispersiones.ts', 'DispersionesPestana.tsx', 'DetalleDispersionHoja.tsx', 'CuentaAbonoPestana.tsx', 'NuevaCuentaAbonoDialogo.tsx']
      .map((f) => leer(`src/components/finanzas/payfac/${f}`))
      .join('\n');
    expect(fuentes).not.toMatch(/await res\.json\(\)/);
    expect(fuentes).not.toMatch(/total_gross|\.gross\b|organizationId=\$\{/);
    expect(leer('src/app/app/finanzas/payfac/dispersiones/page.tsx')).toMatch(/CobrosDispersionesPage pestanaInicial="dispersiones"/);
    expect(leer('src/app/app/finanzas/payfac/cuentas/page.tsx')).toMatch(/CobrosDispersionesPage pestanaInicial="cuenta"/);
  });
});

describe('KPIs', () => {
  test('salen del resumen del servidor, con el % de comisión y la próxima dispersión', () => {
    const k = kpisDispersiones(
      { totalCollected: 14_820_000, totalCommission: 444_600, totalDispersed: 12_180_000, pendingDispersal: 2_195_400 },
      [
        dispersion({ id: 'a', status: 'pending', scheduled_at: '2026-11-10T15:00:00Z' }),
        dispersion({ id: 'b', status: 'processing', scheduled_at: '2026-11-08T15:00:00Z' }),
        dispersion({ id: 'c', status: 'completed', scheduled_at: '2026-11-01T15:00:00Z' }),
      ],
    );
    expect(k).toEqual({
      recaudado: 14_820_000,
      comision: 444_600,
      porcentajeComision: 3,
      dispersado: 12_180_000,
      pendiente: 2_195_400,
      proxima: '2026-11-08T15:00:00Z',
    });
  });

  test('sin resumen ni recaudo: ceros y sin porcentaje', () => {
    expect(kpisDispersiones(null, [])).toEqual({ recaudado: 0, comision: 0, porcentajeComision: null, dispersado: 0, pendiente: 0, proxima: null });
  });
});

describe('filtros y CSV', () => {
  const lista = [
    dispersion({ id: '1', payout_reference: 'DSP-2026-0311', status: 'pending' }),
    dispersion({ id: '2', payout_reference: 'DSP-2026-0270', status: 'failed' }),
  ];

  test('por estado y por referencia (sin distinguir mayúsculas)', () => {
    expect(filtrarDispersiones(lista, { estado: 'failed', texto: '' }).map((d) => d.id)).toEqual(['2']);
    expect(filtrarDispersiones(lista, { estado: null, texto: 'dsp-2026-03' }).map((d) => d.id)).toEqual(['1']);
    expect(filtrarDispersiones(lista, { estado: 'pending', texto: '0270' })).toEqual([]);
  });

  test('CSV con importes numéricos (numeric de Postgres llega como texto)', () => {
    const filas = filasCsvDispersiones([lista[0]], ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7', 'h8', 'h9', 'h10'], {
      fecha: (iso) => (iso ? iso.slice(0, 4) : ''),
      medio: (m) => `m:${m}`,
      estado: (e) => `e:${e}`,
    });
    expect(filas[1]).toEqual(['DSP-2026-0311', '2026', '2026', 2_640_000, 79_200, 2_560_800, 'COP', 'm:breb', 'e:pending', '2026']);
  });
});

describe('cuenta de abono', () => {
  const cuenta = (p: Partial<CuentaAbono>): CuentaAbono => ({
    id: 'pa-1',
    bank_name: 'Banco',
    account_type: 'savings',
    account_number: '******4321',
    account_holder_name: 'Org',
    account_holder_id_type: 'NIT',
    account_holder_id: '*****2223',
    is_verified: true,
    is_active: true,
    ...p,
  });

  test('no se quita la única verificada con dispersiones pendientes', () => {
    const unica = cuenta({ id: 'a' });
    const pendienteVerif = cuenta({ id: 'b', is_verified: false });
    expect(motivoNoQuitarCuenta(unica, [unica, pendienteVerif], 1)).toBe('unica_verificada_con_pendientes');
  });

  test('sí se quita si hay otra verificada, si no hay pendientes o si no está verificada', () => {
    const a = cuenta({ id: 'a' });
    const b = cuenta({ id: 'b' });
    expect(motivoNoQuitarCuenta(a, [a, b], 3)).toBeNull();
    expect(motivoNoQuitarCuenta(a, [a], 0)).toBeNull();
    const sinVerificar = cuenta({ id: 'c', is_verified: false });
    expect(motivoNoQuitarCuenta(sinVerificar, [a, sinVerificar], 3)).toBeNull();
  });

  test('últimos dígitos de un valor enmascarado', () => {
    expect(ultimosDigitos('******4321')).toBe('··4321');
    expect(ultimosDigitos('')).toBe('');
  });

  test('el POST va en camelCase, como lo lee la ruta (antes snake_case → 400)', () => {
    const f: FormularioCuentaAbono = {
      bankAccountId: 7,
      bankName: ' Banco ',
      accountType: 'savings',
      accountNumber: '0000 4321',
      accountHolderName: 'Mi empresa',
      accountHolderIdType: 'NIT',
      accountHolderId: '900000000-0',
      brebKeyValue: '  ',
    };
    expect(cuerpoNuevaCuenta(f)).toEqual({
      bankName: 'Banco',
      accountType: 'savings',
      accountNumber: '0000 4321',
      accountHolderName: 'Mi empresa',
      accountHolderIdType: 'NIT',
      accountHolderId: '900000000-0',
      brebKeyValue: undefined,
      bankAccountId: 7,
    });
    expect(camposFaltantesCuenta({ ...f, bankName: ' ', accountHolderId: '' })).toEqual(['bankName', 'accountHolderId']);
  });
});
