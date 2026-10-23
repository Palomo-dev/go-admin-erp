import fs from 'fs';
import path from 'path';
import { asientoIvaIncluido, cuadrarDevengoPesos } from '../redondeoPesos';

describe('factura con IVA incluido', () => {
  test('el débito al cliente cuadra con el ingreso y el IVA al crédito', () => {
    const asiento = asientoIvaIncluido(119_000);
    expect(asiento).toEqual({ debitoClientes: 119_000, ingreso: 100_000, ivaGenerado: 19_000 });
    expect(asiento.debitoClientes).toBe(asiento.ingreso + asiento.ivaGenerado);
    expect(asiento.ivaGenerado).toBeGreaterThan(0);
  });

  test('un total que no divide exacto el 19 % sigue cuadrando en pesos', () => {
    const asiento = asientoIvaIncluido(10_000);
    expect(asiento.debitoClientes).toBe(asiento.ingreso + asiento.ivaGenerado);
    expect(asiento.ingreso).toBe(8_403);
    expect(asiento.ivaGenerado).toBe(1_597);
  });

  test('el devengo redondeado no queda descuadrado, con el IVA al crédito o al débito', () => {
    for (const total of [10_000.49, 1_596.64, 23_800_000, 0.6]) {
      for (const alCredito of [true, false]) {
        const asiento = cuadrarDevengoPesos(total, total - total / 1.19, alCredito);
        expect(asiento.debitos).toBe(asiento.creditos);
      }
    }
  });
});

describe('protección de movimientos con asiento propio', () => {
  const sql = fs.readFileSync(
    path.join(__dirname, '../../../../supabase/migrations/20261023170000_correccion_flujo_cuentas.sql'),
    'utf8',
  );
  const cuerpo = sql.slice(sql.search(/function\s+public\.fn_auto_journal_stock_movement\s*\(/i));
  const exclusion = cuerpo.match(/IF\s+NEW\.source\s+IN\s*\(([^)]*)\)\s*THEN\s*RETURN\s+NEW/i);

  test('compras y traslados siguen fuera, y la apertura no entra en esa lista', () => {
    expect(exclusion).not.toBeNull();
    for (const origen of ['purchase_order', 'purchase_invoice', 'purchase_void', 'transfer_out', 'transfer_in', 'purchase', 'transfer']) {
      expect(exclusion![1]).toContain(`'${origen}'`);
    }
    expect(exclusion![1]).not.toContain(`'initial'`);
    expect(cuerpo.toLowerCase()).toContain('entrada_clase_6');
  });

  test('devoluciones, producción y el ajuste con documento no generan otro asiento', () => {
    expect(cuerpo).toContain("'return'");
    expect(cuerpo).toContain("'credit_note'");
    expect(cuerpo).toContain("'production'");
    expect(cuerpo).toContain('inventory_adjustments');
    expect(cuerpo).not.toMatch(/ia\.type in \('gain', 'loss'\)/);
  });

  test('el saldo inicial acredita 3105 y el conteo acredita 4250', () => {
    expect(cuerpo).toContain('Ajuste masivo%');
    expect(cuerpo).toContain("'saldo_inicial'");
    const ajuste = sql.slice(sql.search(/function\s+public\.fn_auto_journal_inventory_adjustment\s*\(/i));
    expect(ajuste).toContain("'initial_setup'");
    expect(ajuste).toContain("'saldo_inicial'");
    expect(ajuste).toContain("'physical_count'");
    expect(ajuste).toContain("'4250'");
    expect(ajuste).toContain('compra sin orden');
  });
});
