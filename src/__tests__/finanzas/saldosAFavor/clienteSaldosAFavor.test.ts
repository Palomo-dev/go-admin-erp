/**
 * Caracterización del cliente del navegador de saldos a favor
 * (`components/finanzas/saldos-a-favor/saldosAFavorService.ts`) al rehacer la
 * pantalla (ronda 3): las cuatro acciones de dinero siguen yendo a las mismas
 * rutas con el mismo cuerpo (las mismas RPC transaccionales), y el listado y la
 * hoja de detalle leen sus rutas nuevas. Ninguna escribe tablas desde el
 * navegador; la organización solo viaja como cabecera para que el servidor la
 * compare con la de la sesión.
 */
jest.mock('@/lib/hooks/useOrganization', () => ({ getOrganizationId: () => 120, getCurrentBranchId: () => 7 }));

import { ErrorPeticionSaldoFavor, saldosAFavorService } from '@/components/finanzas/saldos-a-favor/saldosAFavorService';

const llamadas: { url: string; init: RequestInit }[] = [];
let respuesta: { status: number; cuerpo: unknown } = { status: 200, cuerpo: {} };

beforeEach(() => {
  llamadas.length = 0;
  respuesta = { status: 200, cuerpo: { resultado: { ok: true } } };
  global.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
    llamadas.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(respuesta.cuerpo), { status: respuesta.status });
  }) as typeof fetch;
});

const cuerpo = (i: number) => JSON.parse(String(llamadas[i].init.body));
const cabecera = (i: number, k: string) => (llamadas[i].init.headers as Record<string, string>)[k];

describe('acciones de dinero (sin cambios de contrato)', () => {
  test('registrar anticipo → POST /api/saldos-a-favor con el método de la organización, nunca una cuenta PUC', async () => {
    await saldosAFavorService.crear({ customerId: 'c-1', amount: 500, metodo: 'cash', notes: ' x ', expiry: '2026-12-31', claveIdempotencia: 'anticipo:1' });
    expect(llamadas[0].url).toBe('/api/saldos-a-favor');
    expect(llamadas[0].init.method).toBe('POST');
    expect(cuerpo(0)).toEqual({
      cliente_id: 'c-1',
      sucursal_id: 7,
      monto: 500,
      metodo: 'cash',
      cuenta_bancaria: null,
      referencia: null,
      vence: '2026-12-31',
      notas: 'x',
      clave_idempotencia: 'anticipo:1',
    });
    expect(cabecera(0, 'x-organization-id')).toBe('120');
  });

  test('aplicar → POST …/[id]/aplicar', async () => {
    await saldosAFavorService.aplicar({ creditId: 's-1', invoiceId: 'f-1', amount: 120, claveIdempotencia: 'aplicar:1' });
    expect(llamadas[0].url).toBe('/api/saldos-a-favor/s-1/aplicar');
    expect(cuerpo(0)).toEqual({ factura_id: 'f-1', monto: 120, clave_idempotencia: 'aplicar:1' });
  });

  test('devolver → POST …/[id]/devolver con motivo y clave', async () => {
    await saldosAFavorService.devolver('s-1', { monto: 50, metodo: 'transfer', motivo: 'Pedido del cliente', cuentaBancaria: 3, referencia: 'T-1', claveIdempotencia: 'devolver:1' });
    expect(llamadas[0].url).toBe('/api/saldos-a-favor/s-1/devolver');
    expect(cuerpo(0)).toEqual({ monto: 50, metodo: 'transfer', motivo: 'Pedido del cliente', cuenta_bancaria: 3, referencia: 'T-1', clave_idempotencia: 'devolver:1' });
  });

  test('anular → POST …/[id]/anular con el motivo', async () => {
    await saldosAFavorService.anular('s-1', 'Duplicado');
    expect(llamadas[0].url).toBe('/api/saldos-a-favor/s-1/anular');
    expect(cuerpo(0)).toEqual({ motivo: 'Duplicado' });
  });

  test('un error del servidor llega con su código estable (la pantalla lo traduce)', async () => {
    respuesta = { status: 409, cuerpo: { codigo: 'saldo_usado' } };
    await expect(saldosAFavorService.anular('s-1', 'x')).rejects.toEqual(expect.objectContaining({ codigo: 'saldo_usado', estado: 409 }));
    await expect(saldosAFavorService.anular('s-1', 'x')).rejects.toBeInstanceOf(ErrorPeticionSaldoFavor);
  });
});

describe('lecturas', () => {
  test('listado y detalle leen sus rutas del servidor', async () => {
    respuesta = { status: 200, cuerpo: { filas: [], total: 0, kpis: {}, hoy: '2026-09-28' } };
    await saldosAFavorService.listado(new URLSearchParams('estado=vencido&pagina=2'));
    expect(llamadas[0].url).toBe('/api/saldos-a-favor/listado?estado=vencido&pagina=2');
    await saldosAFavorService.detalle('s-1');
    expect(llamadas[1].url).toBe('/api/saldos-a-favor/s-1');
  });

  test('facturas abiertas del cliente y contexto de la sucursal (sin cambios)', async () => {
    respuesta = { status: 200, cuerpo: { facturas: [], metodos: [], cuentasBancarias: [], caja: { abierta: false, id: null }, hoy: '2026-09-28' } };
    await saldosAFavorService.listarFacturasPendientes('c-1');
    await saldosAFavorService.contexto(7);
    expect(llamadas.map((l) => l.url)).toEqual(['/api/saldos-a-favor/contexto?cliente=c-1', '/api/saldos-a-favor/contexto?sucursal=7']);
  });
});
