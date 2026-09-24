/**
 * Punto 3 (2026-09-24): precios y descuentos validados en el servidor.
 *
 * El comportamiento de la base (precio manipulado, descuento mayor que la
 * línea, producto o modificador ajeno, total incoherente, precio vencido,
 * carrito armado antes del cambio, sobre fabricado sobre una venta existente)
 * se probó contra pos_checkout_v1 en una transacción deshecha; aquí se fija:
 *   - el contrato del sobre (id del modificador y momento del precio);
 *   - que la migración valida las líneas de una venta NUEVA y arma la factura
 *     y el stock desde sale_items, no desde el sobre;
 *   - que cada código de error tiene texto en es/en/fr/pt.
 */

import fs from 'fs';
import path from 'path';
import { buildCheckoutEnvelope } from '@/lib/offline/checkoutRpc';
import { CODIGOS_ERROR_COBRO, codigoErrorCobro, detalleErrorCobro } from '@/lib/pos/erroresCobro';
import type { CheckoutData } from '@/components/pos/types';

const raiz = process.cwd();
const migracion = fs.readFileSync(
  path.join(raiz, 'supabase/migrations/20260925140000_pos_checkout_v1_valida_precios.sql'),
  'utf8',
);

describe('sobre del cobro', () => {
  const checkout: CheckoutData = {
    cart: {
      id: 'c', organization_id: 120, branch_id: 7, status: 'active',
      items: [{
        id: 'l1', cart_id: 'c', product_id: 1069, quantity: 2, unit_price: 22500, total: 45000,
        discount_amount: 0, tax_amount: 0, tax_rate: 0,
        product: { id: 1069, name: 'Hamburguesa' } as never,
        modifiers: [{ groupId: 1, groupName: 'Extras', modifierId: 45, name: 'Tocineta', extraPrice: 3000 }],
        created_at: '2026-09-24T13:00:00.000Z', updated_at: '2026-09-24T13:00:00.000Z',
      }],
      subtotal: 45000, tax_amount: 0, tax_total: 0, discount_amount: 0, discount_total: 0, total: 45000,
      created_at: '2026-09-24T13:00:00.000Z', updated_at: '2026-09-24T13:00:00.000Z',
    },
    payments: [{ method: 'cash', amount: 45000 }],
    change: 0,
    total_paid: 45000,
  };

  it('manda el id de cada modificador y el momento en que la línea tomó su precio', () => {
    const env = buildCheckoutEnvelope({
      checkout, saleId: 's', createdAt: '2026-09-24T15:00:00.000Z', organizationId: 120, branchId: 7,
      userId: null, currency: 'COP',
      itemCalcs: [{ lineNet: 45000, taxRate: 0, taxAmount: 0, total: 45000, taxIncluded: false, discount: 0 }],
      subtotal: 45000, taxTotal: 0, discountTotal: 0, total: 45000, promotionIds: [], invoiceCommissionAmount: 0,
    });
    expect(env.items[0].modifiers).toEqual([{ name: 'Tocineta', modifier_id: 45 }]);
    expect(env.items[0].priced_at).toBe('2026-09-24T13:00:00.000Z');
  });
});

describe('migración: validación en el servidor', () => {
  const cuerpo = migracion.slice(migracion.indexOf('CREATE OR REPLACE FUNCTION public.pos_checkout_v1'));

  it('valida cada línea solo cuando la venta es nueva', () => {
    expect(cuerpo).toMatch(
      /if not exists \(select 1 from public\.sales s where s\.id = v_sale_id\) then\s+for v_item in select value from jsonb_array_elements\(v_items\) loop\s+perform public\.fn_pos_validar_linea_venta/,
    );
  });

  it('la validación cubre precio vigente, modificadores, descuento, producto y coherencia', () => {
    for (const codigo of CODIGOS_ERROR_COBRO) {
      expect(migracion).toContain(`'${codigo}'`);
    }
    expect(migracion).toMatch(/pp\.effective_from <= p_at\s+and \(pp\.effective_to is null or pp\.effective_to > p_at\)/);
    expect(migracion).toMatch(/v_disc > round\(v_qty \* v_price, 2\) \+ 0\.01/);
    // Enganche del límite por rol / supervisor.
    expect(migracion).toContain('perform public.fn_pos_autorizar_descuento(p_org, p_actor, p_item, p_autorizacion)');
  });

  it('factura y stock salen de sale_items guardados, no del sobre', () => {
    expect(cuerpo).toMatch(/select si\.\* from public\.sale_items si\s+where si\.sale_id = v_sale_id/);
    expect(cuerpo).toMatch(/perform public\.decrement_stock_with_recipe\(\s+v_org, v_branch, v_si\.product_id, v_si\.quantity/);
    expect(cuerpo).not.toMatch(/v_product_id, left\(v_desc, 255\)/);
  });

  it('las funciones auxiliares no se exponen a anon ni a authenticated', () => {
    for (const fn of ['fn_pos_precio_base_vigente', 'fn_pos_extra_modificadores', 'fn_pos_autorizar_descuento', 'fn_pos_validar_linea_venta']) {
      expect(migracion).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon, authenticated`));
    }
    expect(migracion).toContain('revoke all on function public.pos_checkout_v1(jsonb) from public, anon;');
  });

  it('tiene su reversión', () => {
    expect(fs.existsSync(path.join(raiz, 'supabase/rollbacks/20260925140000_pos_checkout_v1_valida_precios_rollback.sql'))).toBe(true);
  });
});

describe('códigos de error del cobro', () => {
  it('reconoce el código del mensaje y lee el detalle', () => {
    expect(codigoErrorCobro({ message: 'precio_no_coincide', details: '«A»: precio enviado 1' })).toBe('precio_no_coincide');
    expect(detalleErrorCobro({ message: 'precio_no_coincide', details: '«A»: precio enviado 1' })).toBe('«A»: precio enviado 1');
    expect(codigoErrorCobro({ message: 'Totales incoherentes: …' })).toBeNull();
    expect(codigoErrorCobro(null)).toBeNull();
  });

  it.each(['es', 'en', 'fr', 'pt'])('cada código tiene texto en %s', (lang) => {
    const msgs = JSON.parse(fs.readFileSync(path.join(raiz, `messages/${lang}.json`), 'utf8'));
    for (const codigo of CODIGOS_ERROR_COBRO) {
      expect(typeof msgs.posCobroServidor?.errores?.[codigo]).toBe('string');
    }
  });
});
