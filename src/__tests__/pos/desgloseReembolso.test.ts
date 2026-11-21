/**
 * El historial sumaba el impuesto encima de `returns.total_refund`, que ya lo
 * incluye. El caso citado: total 21.600 (20.000 + 1.600) pasaba a 23.328
 * porque prorrateaba 1.600 / 20.000 sobre el total.
 */
import * as fs from 'fs';
import * as path from 'path';
import { desgloseReembolso } from '@/lib/pos/devoluciones/desgloseReembolso';

const SRC = path.resolve(__dirname, '..', '..');
const leer = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

describe('desgloseReembolso', () => {
  test('con impuesto el total no cambia y el subtotal es la diferencia', () => {
    expect(desgloseReembolso(21600, 1600)).toEqual({
      total: 21600,
      impuesto: 1600,
      subtotal: 20000,
    });
    // El prorrateo viejo: 21600 + 21600 * (1600 / 20000) = 23328.
    expect(desgloseReembolso(21600, 1600).total).not.toBe(23328);
  });

  test('una devolución parcial usa el impuesto de sus líneas, no el de toda la venta', () => {
    expect(desgloseReembolso(10800, 800)).toEqual({
      total: 10800,
      impuesto: 800,
      subtotal: 10000,
    });
  });

  test('sin impuesto el total queda igual y no hay desglose que mostrar', () => {
    const desglose = desgloseReembolso(5000, 0);
    expect(desglose).toEqual({ total: 5000, impuesto: 0, subtotal: 5000 });
    expect(desglose.impuesto > 0).toBe(false);
  });

  test('un monto que no es número se trata como cero', () => {
    expect(desgloseReembolso(Number.NaN, Number.NaN)).toEqual({
      total: 0,
      impuesto: 0,
      subtotal: 0,
    });
  });
});

describe('el historial deja de prorratear el impuesto de la venta', () => {
  const service = leer('components/pos/devoluciones/devolucionesService.ts');
  // Rediseño 2026-11-21: el historial (`ReturnsHistory`) es ahora el listado
  // `DevolucionesPage` + el detalle; el reintegro sale tal cual de total_refund.
  const listado = leer('components/pos/devoluciones/DevolucionesPage.tsx');
  const detalle = leer('lib/pos/devoluciones/detalleServidor.ts');

  test('el servicio lee el impuesto de las líneas de la organización', () => {
    expect(service).toContain("from('return_lines')");
    expect(service).toContain('tax_amount');
    expect(service).toContain(".eq('organization_id', organizationId)");
    expect(service).toContain('desgloseReembolso');
    expect(service).not.toMatch(/originalTaxTotal\s*\/\s*originalSubtotal/);
    expect(service).not.toMatch(/refundAmount\s*\+\s*refundTaxAmount/);
    expect(service).not.toMatch(/refundAmount\s*-\s*originalSubtotal/);
  });

  test('el listado, el CSV y el detalle muestran el total sin volver a sumar el impuesto', () => {
    expect(listado).not.toContain('refund_total_with_tax');
    expect(listado).toContain('formatear(f.total)');
    expect(listado).not.toMatch(/f\.total\s*\+\s*f\.impuesto/);
    // Neto de la línea = reintegro − impuesto de la línea (no un prorrateo de la venta).
    expect(detalle).toContain('neto: n(l.refund_amount) - n(l.tax_amount)');
    expect(detalle).toContain('total: n(r.total_refund)');
  });
});
