/**
 * L44, L45, L46, L48 y L49 (POS-PLAN §2.6): secciones del cobro extraídas
 * literal de `CheckoutDialog.tsx` a `src/lib/pos/venta/cobro/`. Pruebas de
 * caracterización: fijan lo que hace HOY (lo que se decida cambiar lo cambia
 * su paso, con su prueba).
 *
 * La aritmética de la propina (`computeTipAmount`) y el seguimiento del pago
 * precargado ya los cubre `__tests__/pos-display/tip-f2b.test.ts`; aquí solo
 * lo que faltaba: qué porcentajes se ofrecen, sobre qué base y a quién.
 */

import { computeTipAmount } from '@/lib/pos/display/tip';
import { PORCENTAJES_PROPINA, baseDePropina, meserosDesdeMiembros, propinaTopada } from '@/lib/pos/venta/cobro/propinaCobro';
import {
  camposComisionDelSobre,
  comisionDeTasaResuelta,
  esPersonaAsignada,
  montoComision,
  SIN_ASIGNAR,
} from '@/lib/pos/venta/cobro/comisionCobro';
import {
  camposEntregaDelSobre,
  fleteDeTarifaElegida,
  opcionesDeTarifa,
  tarifaPorDefecto,
  tarifasVisiblesEnPos,
  type EntradaEntregaDelSobre,
} from '@/lib/pos/venta/cobro/entregaCobro';
import { lineasConSerial, seleccionSerialesCompleta } from '@/lib/pos/venta/cobro/serialesCobro';
import { comprobarStockReceta, debeConfirmarStock } from '@/lib/pos/venta/cobro/stockRecetaCobro';

describe('L44 · propina', () => {
  it('paso 12 (D7): ofrece 5 y 10 % sobre el subtotal SIN impuestos, y «otro valor» topado al 10 % de esa base', () => {
    // Antes del paso 12 se fijaba 5/10/15/20 % sobre el total con impuestos; el
    // dueño decidió D7 (tope del 10 %, antes de impuestos). Ejemplo: subtotal
    // 20.000 + IVA 19 % = 23.800; la propina del 10 % es 2.000, no 2.380.
    expect(PORCENTAJES_PROPINA).toEqual([5, 10]);
    const base = baseDePropina({ calculatedTotals: { subtotal: 20000 }, cart: { subtotal: 99999 } });
    expect(base).toBe(20000);
    expect(PORCENTAJES_PROPINA.map((pct) => computeTipAmount(base, pct))).toEqual([1000, 2000]);
    expect(propinaTopada(5000, base)).toBe(2000);
    expect(propinaTopada(1500, base)).toBe(1500);
    expect(propinaTopada(-3, base)).toBe(0);
    expect(propinaTopada(Number.NaN, base)).toBe(0);
    // Sin totales calculados todavía: el subtotal del carrito; nunca negativa.
    expect(baseDePropina({ calculatedTotals: { subtotal: 0 }, cart: { subtotal: 18000 } })).toBe(18000);
    expect(baseDePropina({ calculatedTotals: { subtotal: 0 }, cart: { subtotal: -1 } })).toBe(0);
  });

  it('mesero (y vendedor): todos los miembros; nombre completo → nombre → correo → «Sin nombre»', () => {
    expect(meserosDesdeMiembros([
      { user_id: 'u1', users: { email: 'a@x.co', raw_user_meta_data: { full_name: 'Ana Ríos', name: 'Ana' } } },
      { user_id: 'u2', users: { email: 'b@x.co', raw_user_meta_data: { name: 'Beto' } } },
      { user_id: 'u3', users: { email: 'c@x.co', raw_user_meta_data: null } },
      { user_id: 'u4', users: null },
    ])).toEqual([
      { id: 'u1', name: 'Ana Ríos' },
      { id: 'u2', name: 'Beto' },
      { id: 'u3', name: 'c@x.co' },
      { id: 'u4', name: 'Sin nombre' },
    ]);
  });
});

describe('L45 · comisión del vendedor', () => {
  it('por porcentaje sobre el subtotal sin impuestos (a centavos); por monto, tal cual; sin vendedor o sin tasa, 0', () => {
    expect(montoComision({ commissionRate: 2, salespersonId: 'u1', commissionMethod: 'percentage', subtotal: 12345 })).toBe(246.9);
    expect(montoComision({ commissionRate: 3000, salespersonId: 'u1', commissionMethod: 'fixed_amount', subtotal: 12345 })).toBe(3000);
    expect(montoComision({ commissionRate: 2, salespersonId: SIN_ASIGNAR, commissionMethod: 'percentage', subtotal: 12345 })).toBe(0);
    expect(montoComision({ commissionRate: 2, salespersonId: '', commissionMethod: 'percentage', subtotal: 12345 })).toBe(0);
    expect(montoComision({ commissionRate: 0, salespersonId: 'u1', commissionMethod: 'percentage', subtotal: 12345 })).toBe(0);
    expect(esPersonaAsignada(SIN_ASIGNAR)).toBe(false);
  });

  it('la tasa de vendor_commission_rates precarga «porcentaje» solo si es > 0; con 0 se conserva lo escrito', () => {
    expect(comisionDeTasaResuelta(3.5)).toEqual({ commissionRate: 3.5, commissionMethod: 'percentage' });
    expect(comisionDeTasaResuelta(0)).toBeNull();
  });

  it('el sobre: con vendedor viajan tipo y método; sin vendedor el tipo es «none» (la tasa escrita viaja igual)', () => {
    expect(camposComisionDelSobre({ salespersonId: 'u1', commissionRate: 2, commissionType: 'salesperson', commissionMethod: 'percentage', commissionAmount: 246.9 }))
      .toEqual({ salesperson_id: 'u1', commission_rate: 2, commission_type: 'salesperson', commission_method: 'percentage', commission_amount: 246.9 });
    expect(camposComisionDelSobre({ salespersonId: SIN_ASIGNAR, commissionRate: 2, commissionType: 'salesperson', commissionMethod: 'percentage', commissionAmount: 0 }))
      .toEqual({ salesperson_id: undefined, commission_rate: 2, commission_type: 'none', commission_method: undefined, commission_amount: undefined });
  });
});

describe('L46 · entrega', () => {
  const SIMULADAS = [
    { rate: { id: 'r2', rate_name: 'Moto', currency: 'COP' }, total_cost: 6000 },
    { rate: { id: 'r9', rate_name: 'Solo web', currency: 'COP' }, total_cost: 7000 },
    { rate: { id: 'r1', rate_name: 'Carro', currency: 'COP' }, total_cost: 12000 },
  ];

  it('tarifas: solo las marcadas show_on_pos, en el orden de la simulación (más económica primero) y esa queda elegida', () => {
    const posRates = tarifasVisiblesEnPos([
      { id: 'r1', show_on_pos: true },
      { id: 'r2', show_on_pos: true },
      { id: 'r9', show_on_pos: false },
    ]);
    const opciones = opcionesDeTarifa(SIMULADAS, posRates);
    expect(opciones.map((o) => o.id)).toEqual(['r2', 'r1']);
    expect(tarifaPorDefecto(opciones)).toEqual({ id: 'r2', rate_name: 'Moto', total_cost: 6000, currency: 'COP' });
    expect(tarifaPorDefecto([])).toBeNull();
  });

  it('el flete sigue a la tarifa elegida; sin tarifa, 0; elegida con la lista vacía, no cambia', () => {
    const opciones = [{ id: 'r2', rate_name: 'Moto', total_cost: 6000, currency: 'COP' }];
    expect(fleteDeTarifaElegida('r2', opciones)).toBe(6000);
    expect(fleteDeTarifaElegida('r7', opciones)).toBe(0);
    expect(fleteDeTarifaElegida('', opciones)).toBe(0);
    expect(fleteDeTarifaElegida('r2', [])).toBeNull();
  });

  it('el sobre: recoger sin datos; tercero con dirección y sin conductor; propio con conductor; flete 0 no viaja', () => {
    const base: EntradaEntregaDelSobre = {
      deliveryType: 'pickup',
      deliveryAddress: 'Cra 1 # 2-3',
      deliveryCity: 'Medellín',
      deliveryContactName: 'Luz',
      deliveryContactPhone: '3000000000',
      deliveryInstructions: 'Portería',
      selectedDriverId: 'd1',
      shippingFee: 0,
    };
    expect(camposEntregaDelSobre(base)).toEqual({ delivery_type: 'pickup', delivery_info: undefined, driver_id: undefined, shipping_fee: undefined });
    const tercero = camposEntregaDelSobre({ ...base, deliveryType: 'delivery_third_party', shippingFee: 6000 });
    expect(tercero.delivery_info).toEqual({ address: 'Cra 1 # 2-3', city: 'Medellín', contact_name: 'Luz', contact_phone: '3000000000', instructions: 'Portería' });
    expect(tercero.driver_id).toBeUndefined();
    expect(tercero.shipping_fee).toBe(6000);
    expect(camposEntregaDelSobre({ ...base, deliveryType: 'delivery_own' }).driver_id).toBe('d1');
    expect(camposEntregaDelSobre({ ...base, deliveryType: 'delivery_own', selectedDriverId: '' }).driver_id).toBeUndefined();
  });
});

describe('L48 · seriales obligatorios', () => {
  const ITEMS = [
    { product_id: 10, quantity: 2, product: { track_serial: true } },
    { product_id: 11, quantity: 1, product: { track_serial: false } },
    { product_id: 12, quantity: 1, product: null },
  ];

  it('solo las líneas con track_serial; completo = tantos seriales como unidades en cada una', () => {
    const conSerial = lineasConSerial(ITEMS);
    expect(conSerial.map((i) => i.product_id)).toEqual([10]);
    expect(seleccionSerialesCompleta(conSerial, {})).toBe(false);
    expect(seleccionSerialesCompleta(conSerial, { 10: [501] })).toBe(false);
    expect(seleccionSerialesCompleta(conSerial, { 10: [501, 502] })).toBe(true);
    // Sin líneas con serial no hay nada que elegir.
    expect(seleccionSerialesCompleta(lineasConSerial(ITEMS.slice(1)), {})).toBe(true);
  });
});

describe('L49 · stock de ingredientes', () => {
  const ITEMS = [{ product_id: 10, quantity: 2 }];
  const FALTA = { ok: false, message: 'Faltan 200 g de harina' };

  it('con faltante pide confirmación (y solo si hay mensaje que mostrar)', async () => {
    const r = await comprobarStockReceta(ITEMS, 7, { validar: async () => FALTA, esDesktop: () => false });
    expect(r).toBe(FALTA);
    expect(debeConfirmarStock(r)).toBe(true);
    expect(debeConfirmarStock({ ok: false })).toBe(false);
    expect(debeConfirmarStock({ ok: true })).toBe(false);
  });

  it('si la comprobación falla: en el navegador corta el cobro; en Desktop sin red NO bloquea', async () => {
    const validar = async () => { throw new Error('sin red'); };
    await expect(comprobarStockReceta(ITEMS, 7, { validar, esDesktop: () => false })).rejects.toThrow('sin red');
    const aviso = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(comprobarStockReceta(ITEMS, 7, { validar, esDesktop: () => true })).resolves.toEqual({ ok: true });
    expect(aviso).toHaveBeenCalledTimes(1);
    aviso.mockRestore();
  });
});
