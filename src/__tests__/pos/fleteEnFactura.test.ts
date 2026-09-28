/**
 * Punto 5 (2026-09-24): el flete de la venta va como línea de la factura.
 *
 * El total de invoice_sales sale de SUM(total_line) (fn_recalc_invoice_totals)
 * y pos_checkout_v1 no escribía el flete como línea: 33 de 531 facturas con
 * delivery_fee quedaron por debajo de su venta. El comportamiento se probó en
 * una transacción deshecha (venta 39.000 + flete 5.000 → factura 44.000 pagada,
 * reintento sin duplicar); aquí se fija el parche y su forma, la misma que el
 * pedido web.
 */

import fs from 'fs';
import path from 'path';
import { lineasFacturaDesdePedidoWeb } from '@/lib/services/webOrderTotals';

const raiz = process.cwd();
const migracion = fs.readFileSync(
  path.join(raiz, 'supabase/migrations/20260925140100_pos_checkout_v1_flete_en_factura.sql'),
  'utf8',
);
const reversion = fs.readFileSync(
  path.join(raiz, 'supabase/rollbacks/20260925140100_pos_checkout_v1_flete_en_factura_rollback.sql'),
  'utf8',
);

describe('pos_checkout_v1: línea de flete', () => {
  const nuevo = migracion.slice(migracion.indexOf('v_new0 text := $frag0$'), migracion.indexOf('begin\n  if position('));

  it('añade «Envío (Delivery)» sin producto, cantidad 1, tarifa 0 y en el modo de la factura', () => {
    expect(nuevo).toMatch(/if coalesce\(v_sale\.delivery_fee, 0\) > 0 then/);
    expect(nuevo).toMatch(/'sale', null, 'Envío \(Delivery\)', 1, v_sale\.delivery_fee,\s+v_sale\.delivery_fee, 0, v_tax_included, 0/);
  });

  it('solo al crear las líneas: una factura existente no se toca', () => {
    // El parche va dentro del bloque «if not exists invoice_items», justo tras el bucle de líneas.
    expect(nuevo.indexOf('end loop;')).toBeLessThan(nuevo.indexOf("'Envío (Delivery)'"));
    expect(nuevo.trim().endsWith("if v_replayed then v_completed := array_append(v_completed, 'invoice_items'); end if;\n  end if;$frag0$;")).toBe(true);
  });

  it('parchea la definición viva y falla si el fragmento no aparece una sola vez', () => {
    expect(migracion).toContain("pg_get_functiondef('public.pos_checkout_v1(jsonb)'::regprocedure)");
    expect(migracion).toContain('no aparece exactamente una vez');
    expect(reversion).toContain('nada que revertir');
  });

  it('misma forma que la línea de flete del pedido web', () => {
    const lineas = lineasFacturaDesdePedidoWeb(
      { order_number: 'W-1', organization_id: 1, subtotal: 10000, tax_total: 0, discount_total: 0, delivery_fee: 5000, tip_amount: 0, total: 15000,
        items: [{ product_id: 1, product_name: 'A', quantity: 1, unit_price: 10000, discount_amount: 0, tax_amount: 0 }] } as never,
      'inv-1',
    );
    const flete = lineas.find((l) => l.product_id === null);
    expect(flete).toMatchObject({ description: 'Envío (Delivery)', qty: 1, unit_price: 5000, total_line: 5000, tax_rate: 0 });
  });
});
