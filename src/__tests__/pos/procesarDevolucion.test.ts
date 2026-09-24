/**
 * Devoluciones del POS por la RPC transaccional `procesar_devolucion`
 * (docs/design/POS-PARIDAD-PAGINAS-SECUNDARIAS.md §5 D-1).
 *
 * Antes (verificado en la BD el 2026-09-23): la salida de caja insertaba
 * cash_movements sin organization_id (23502, tragado en silencio), el stock
 * solo volvía para serializados, reason_id quedaba vacío (0 de 7) y la cartera
 * se escribía a mano desde el navegador.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  CODIGOS_ERROR_DEVOLUCION,
  claveErrorDevolucion,
  codigoErrorDevolucion,
  metodoReintegro,
  parametrosProcesarDevolucion,
} from '@/lib/pos/devoluciones/procesarDevolucion';

const SRC = path.resolve(__dirname, '..', '..');
const REPO = path.resolve(SRC, '..');
const leer = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

describe('parametrosProcesarDevolucion', () => {
  const base = {
    items: [
      { sale_item_id: 'a', return_quantity: 2, reason: ' GARANTIA ', serial_number_ids: [7, 8] },
      { sale_item_id: 'b', return_quantity: 0, reason: 'X' },
    ],
    refund_method: 'cash' as const,
    reason: '  Cliente insatisfecho ',
    notes: '  ',
  };

  test('solo lo necesario: líneas con cantidad, motivo por código y clave; sin montos del navegador', () => {
    const p = parametrosProcesarDevolucion(113, 'venta-1', base, 'clave-1');
    expect(p).toEqual({
      p_organization_id: 113,
      p_sale_id: 'venta-1',
      p_items: [{ sale_item_id: 'a', quantity: 2, reason_code: 'GARANTIA', serial_ids: [7, 8] }],
      p_refund_method: 'cash',
      p_reason: 'Cliente insatisfecho',
      p_notes: null,
      p_idempotency_key: 'clave-1',
    });
    expect(JSON.stringify(p)).not.toMatch(/refund_amount|total_refund|unit_price/);
  });

  test('«nota de crédito» de la pantalla es saldo a favor; «medio original» sigue siendo efectivo', () => {
    expect(metodoReintegro('credit_note')).toBe('store_credit');
    expect(metodoReintegro('cash')).toBe('cash');
    expect(metodoReintegro('original_method')).toBe('cash');
  });

  test('rechaza sin clave, sin venta o sin líneas', () => {
    expect(() => parametrosProcesarDevolucion(113, 'v', base, '')).toThrow();
    expect(() => parametrosProcesarDevolucion(113, '', base, 'k')).toThrow();
    expect(() => parametrosProcesarDevolucion(0, 'v', base, 'k')).toThrow();
    expect(() => parametrosProcesarDevolucion(113, 'v', { ...base, items: [] }, 'k')).toThrow();
  });
});

describe('errores de la RPC', () => {
  test('efectivo sin caja y el resto se traducen por código', () => {
    expect(codigoErrorDevolucion({ message: 'efectivo_sin_caja', code: '22023' })).toBe('efectivo_sin_caja');
    expect(codigoErrorDevolucion({ message: 'Acceso denegado a la organización' })).toBe('sin_acceso_sucursal');
    expect(codigoErrorDevolucion(new Error('otra cosa'))).toBe('generico');
    expect(claveErrorDevolucion('efectivo_sin_caja')).toBe('efectivoSinCaja');
  });

  test('cada código tiene texto en es/en/fr/pt', () => {
    for (const idioma of ['es', 'en', 'fr', 'pt']) {
      const mensajes = JSON.parse(fs.readFileSync(path.join(REPO, 'messages', `${idioma}.json`), 'utf8'));
      const errores = mensajes.posDevoluciones?.errores ?? {};
      for (const codigo of [...CODIGOS_ERROR_DEVOLUCION, 'generico' as const]) {
        expect({ idioma, codigo, texto: typeof errores[claveErrorDevolucion(codigo)] }).toEqual({ idioma, codigo, texto: 'string' });
      }
    }
  });
});

describe('DevolucionesService.procesarDevolucion llama a la RPC', () => {
  test('una sola llamada a procesar_devolucion, sin escribir tablas desde el navegador', async () => {
    jest.resetModules();
    const rpc = jest.fn().mockResolvedValue({ data: { return_id: 9, total_refund: 36000, repetida: false }, error: null });
    const from = jest.fn();
    jest.doMock('@/lib/supabase/config', () => ({ supabase: { rpc, from, storage: { from: jest.fn() } } }));
    jest.doMock('@/lib/hooks/useOrganization', () => ({ obtenerOrganizacionActiva: () => ({ id: 113 }) }));
    const { DevolucionesService } = await import('@/components/pos/devoluciones/devolucionesService');
    const r = await DevolucionesService.procesarDevolucion('venta-1', {
      type: 'partial',
      items: [{ sale_item_id: 'a', product_id: 1, return_quantity: 1, refund_amount: 999, reason: 'PRUEBA' }],
      refund_method: 'cash',
      total_refund: 999,
      reason: 'No la quiso',
    }, 'clave-1');
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('procesar_devolucion', expect.objectContaining({
      p_organization_id: 113, p_sale_id: 'venta-1', p_idempotency_key: 'clave-1', p_refund_method: 'cash',
    }));
    expect(from).not.toHaveBeenCalled();
    expect(r.total_refund).toBe(36000);
  });
});

describe('Guardarraíles de devoluciones', () => {
  const service = leer('components/pos/devoluciones/devolucionesService.ts');

  test('el servicio no escribe cartera, facturas, caja, pagos ni stock a mano', () => {
    for (const tabla of ['accounts_receivable', 'invoice_sales', 'cash_movements', 'payments', 'stock_levels', 'credit_notes', 'serial_numbers']) {
      const escrituras = service.split(`.from('${tabla}')`).slice(1)
        .map((b) => b.slice(0, b.indexOf(';')))
        .filter((b) => /\.(insert|update|upsert|delete)\(/.test(b));
      expect({ tabla, escrituras: escrituras.length }).toEqual({ tabla, escrituras: 0 });
    }
  });

  test('la pantalla manda una clave de idempotencia por intento', () => {
    const form = leer('components/pos/devoluciones/ReturnForm.tsx');
    expect(form).toMatch(/procesarDevolucion\(sale\.id, refundData, claveIntento\.current\)/);
  });

  test('el resumen de caja no resta dos veces las devoluciones nuevas', () => {
    const cajas = leer('components/pos/cajas/CajasService.ts');
    const bloque = cajas.slice(cajas.indexOf(".from('returns')"), cajas.indexOf(".from('returns')") + 300);
    expect(bloque).toMatch(/\.is\('refund_method', null\)/);
  });
});
