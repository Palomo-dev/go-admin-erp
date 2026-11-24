/**
 * Contrato del precio por volumen entre el POS (este repo) y la tienda (goadmin-websites).
 *
 * 1. `precioVolumen.ts` es el MISMO archivo byte a byte en los dos repos. Si la tienda está al
 *    lado (`WEBSITES_REPO` o `../../goadmin-websites`), se comparan los bytes.
 * 2. Los CASOS de abajo (mismos números) los corre también la tienda en
 *    `scripts/verify-precio-volumen.mjs` contra su motor (`lib/promotions.ts`). Si cambias un
 *    número aquí, cámbialo allá: así se prueba que el cliente ve en la tienda el mismo descuento
 *    que cobra el POS.
 * 3. El 2x1 que ya existe sigue dando lo mismo.
 */
import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import {
  calcularDescuentoVolumen,
  compararCompetidoras,
  grupoDeLinea,
  normalizarEscalones,
  normalizarMarca,
  promocionHabilitadaParaCliente,
  reglaMarcaCoincide,
  siguienteEscalon,
  type LineaVolumen,
} from '../precioVolumen';
import { evaluarPromociones, type ContextoPromocion, type FilaPromocion, type LineaPromocion } from '../motorPromociones';

const ERP = resolve(__dirname, '..', '..', '..', '..');
const TIENDA = resolve(process.env.WEBSITES_REPO || join(ERP, '..', '..', 'goadmin-websites'));
const COPIA = join(TIENDA, 'lib', 'promociones', 'precioVolumen.ts');

describe('copia byte a byte en la tienda', () => {
  const hayTienda = existsSync(COPIA);
  (hayTienda ? it : it.skip)('lib/promociones/precioVolumen.ts es idéntico', () => {
    const aqui = readFileSync(join(__dirname, '..', 'precioVolumen.ts'));
    const alla = readFileSync(COPIA);
    expect(alla.equals(aqui)).toBe(true);
  });
});

// ── Casos compartidos (los mismos en scripts/verify-precio-volumen.mjs de la tienda) ──────────

const FIJOS = [
  { min_quantity: 6, unit_price: 9500, discount_percent: null, sort_order: 0 },
  { min_quantity: 12, unit_price: 8800, discount_percent: null, sort_order: 1 },
];
const PORCENTAJES = [
  { min_quantity: 6, unit_price: null, discount_percent: 5 },
  { min_quantity: 12, unit_price: null, discount_percent: 10 },
  { min_quantity: 24, unit_price: null, discount_percent: 15 },
];

const total = (r: { porLinea: number[] }) => r.porLinea.reduce((s, d) => s + d, 0);

describe('precioVolumen (módulo compartido)', () => {
  it('normaliza escalones: ordena, descarta basura y deduplica', () => {
    const e = normalizarEscalones([
      { min_quantity: '12', unit_price: '8800.00' },
      { min_quantity: 6, unit_price: 9500 },
      { min_quantity: 0, unit_price: 1 },
      { min_quantity: 3 },
      { min_quantity: 6, discount_percent: 50, sort_order: 9 },
      null,
    ]);
    expect(e).toEqual([
      { desde: 6, precioUnidad: 9500, porcentaje: null },
      { desde: 12, precioUnidad: 8800, porcentaje: null },
    ]);
  });

  it('precio fijo: 5 → 0, 6 → 9.000, 12 → 26.400 (Gaseosa $ 11.000)', () => {
    const e = normalizarEscalones(FIJOS);
    const linea = (q: number): LineaVolumen[] => [{ producto: 1, cantidad: q, precio: 11000 }];
    expect(total(calcularDescuentoVolumen(e, linea(5), 'promotion_mix'))).toBe(0);
    expect(total(calcularDescuentoVolumen(e, linea(6), 'promotion_mix'))).toBe(9000);
    expect(total(calcularDescuentoVolumen(e, linea(12), 'promotion_mix'))).toBe(26400);
  });

  it('porcentaje: 12 × $ 6.000 con 10 % → 7.200', () => {
    const e = normalizarEscalones(PORCENTAJES);
    expect(total(calcularDescuentoVolumen(e, [{ producto: 1, cantidad: 12, precio: 6000 }], 'same_product'))).toBe(7200);
  });

  it('modos de conteo: 3 cola + 3 limón', () => {
    const e = normalizarEscalones(FIJOS);
    const distintos: LineaVolumen[] = [
      { producto: 10, padre: null, cantidad: 3, precio: 11000 },
      { producto: 11, padre: null, cantidad: 3, precio: 11000 },
    ];
    expect(total(calcularDescuentoVolumen(e, distintos, 'promotion_mix'))).toBe(9000);
    expect(total(calcularDescuentoVolumen(e, distintos, 'same_product'))).toBe(0);
    expect(total(calcularDescuentoVolumen(e, distintos, 'same_variant'))).toBe(0);
    const variantes: LineaVolumen[] = distintos.map((l) => ({ ...l, padre: 1 }));
    expect(total(calcularDescuentoVolumen(e, variantes, 'same_product'))).toBe(9000);
    expect(total(calcularDescuentoVolumen(e, variantes, 'same_variant'))).toBe(0);
  });

  it('grupo elegido: solo los productos del grupo suman y reciben el precio', () => {
    const reglas = [
      { rule_type: 'include_product', product_id: 10, tier_group: 1 },
      { rule_type: 'include_product', product_id: 11, tier_group: '1' },
      { rule_type: 'include_product', product_id: 12, tier_group: null },
    ];
    const e = normalizarEscalones(FIJOS);
    const lineas: LineaVolumen[] = [10, 11, 12].map((p) => ({
      producto: p,
      cantidad: p === 12 ? 6 : 3,
      precio: 11000,
      grupo: grupoDeLinea(reglas, p, null),
    }));
    const r = calcularDescuentoVolumen(e, lineas, 'product_group');
    expect(r.porLinea).toEqual([4500, 4500, 0]);
  });

  it('el precio de la línea ya por debajo del escalón no da descuento extra', () => {
    const e = normalizarEscalones(FIJOS);
    expect(total(calcularDescuentoVolumen(e, [{ producto: 1, cantidad: 6, precio: 9000 }], 'promotion_mix'))).toBe(0);
  });

  it('siguiente escalón: con 6 faltan 6 para el de 12', () => {
    const e = normalizarEscalones(FIJOS);
    expect(siguienteEscalon(e, 6)).toEqual({ escalon: { desde: 12, precioUnidad: 8800, porcentaje: null }, faltan: 6 });
    expect(siguienteEscalon(e, 12)).toBeNull();
  });

  it('marca sin mayúsculas ni tildes; sin brand, la regla antigua por producto', () => {
    expect(normalizarMarca('  Café   Águila ')).toBe('cafe aguila');
    expect(reglaMarcaCoincide({ brand: 'Café Águila' }, { product_id: 1, brand: 'cafe aguila' })).toBe(true);
    expect(reglaMarcaCoincide({ brand: 'Otra' }, { product_id: 1, brand: 'cafe aguila' })).toBe(false);
    expect(reglaMarcaCoincide({ brand: null, product_id: 5 }, { product_id: 9, parent_product_id: 5 })).toBe(true);
  });

  it('cliente: grupo y usos por cliente fallan cerrado sin cliente', () => {
    const p = { id: 'p1', customer_segment_id: 'seg-1', usage_limit_per_customer: 2 };
    expect(promocionHabilitadaParaCliente(p, null)).toBe(false);
    expect(promocionHabilitadaParaCliente(p, { id: 'c1', segmentos: ['otro'], usos: {} })).toBe(false);
    expect(promocionHabilitadaParaCliente(p, { id: 'c1', segmentos: ['seg-1'], usos: { p1: 1 } })).toBe(true);
    expect(promocionHabilitadaParaCliente(p, { id: 'c1', segmentos: ['seg-1'], usos: { p1: 2 } })).toBe(false);
    expect(promocionHabilitadaParaCliente({ id: 'p2' }, null)).toBe(true);
  });
});

// ── Motor del POS con el tipo nuevo ────────────────────────────────────────────────────────────

const CTX: ContextoPromocion = {
  canal: 'pos',
  ahora: new Date('2026-12-10T15:00:00Z'),
  zonaHoraria: 'America/Bogota',
  sucursalId: 1,
};

const base = (extra: Partial<FilaPromocion>): FilaPromocion => ({
  id: 'x',
  name: 'x',
  promotion_type: 'percentage',
  applies_to: 'all',
  start_date: '2026-12-01T05:00:00Z',
  end_date: null,
  is_active: true,
  is_combinable: false,
  priority: 0,
  created_at: '2026-11-24T00:00:00Z',
  ...extra,
});

const volumen = base({
  id: 'vol',
  name: 'Mayoristas de bebidas',
  promotion_type: 'volume_tiers',
  tiers_count_mode: 'promotion_mix',
  promotion_tiers: FIJOS,
});
const dosPorUno = base({ id: '2x1', name: '2x1', promotion_type: 'buy_x_get_y', buy_quantity: 2, get_quantity: 1 });

const gaseosa = (q: number, id = 1): LineaPromocion => ({ product_id: id, quantity: q, unit_price: 11000 });

describe('motorPromociones con volume_tiers', () => {
  it('6 gaseosas → 9.000; 12 → 26.400 (mismos números que la tienda)', () => {
    expect(evaluarPromociones([volumen], [gaseosa(6)], CTX).discountTotal).toBe(9000);
    expect(evaluarPromociones([volumen], [gaseosa(12)], CTX).discountTotal).toBe(26400);
    expect(evaluarPromociones([volumen], [gaseosa(3, 10), gaseosa(3, 11)], CTX).discountTotal).toBe(9000);
  });

  it('el 2x1 de siempre no cambia: 2 unidades → 1 gratis', () => {
    const r = evaluarPromociones([dosPorUno], [{ product_id: 7, quantity: 2, unit_price: 4500 }], CTX);
    expect(r.discountTotal).toBe(4500);
    expect(r.applied.map((a) => a.promotion_id)).toEqual(['2x1']);
  });

  it('si chocan y no se suman, gana la que más ahorra', () => {
    // 6 × 11.000: volumen da 9.000; el 2x1 da 3 × 11.000 = 33.000 → gana el 2x1.
    const r = evaluarPromociones([volumen, dosPorUno], [gaseosa(6)], CTX);
    expect(r.applied.map((a) => a.promotion_id)).toEqual(['2x1']);
  });

  // Los mismos casos que «6. Desempate» de scripts/verify-precio-volumen.mjs de la tienda.
  it('mismo ahorro: gana la MÁS RECIENTE, sin importar el orden de las filas', () => {
    const vieja = base({ id: 'vieja', name: '10 % vieja', discount_value: 10, created_at: '2026-11-01T00:00:00Z' });
    const nueva = base({ id: 'nueva', name: '10 % nueva', discount_value: 10, created_at: '2026-11-20T00:00:00Z' });
    expect(evaluarPromociones([vieja, nueva], [gaseosa(1)], CTX).applied.map((a) => a.promotion_id)).toEqual(['nueva']);
    expect(evaluarPromociones([nueva, vieja], [gaseosa(1)], CTX).applied.map((a) => a.promotion_id)).toEqual(['nueva']);
    const veinteVieja = { ...vieja, id: 'vieja20', discount_value: 20 };
    expect(evaluarPromociones([veinteVieja, nueva], [gaseosa(1)], CTX).applied.map((a) => a.promotion_id)).toEqual(['vieja20']);
  });

  it('compararCompetidoras: prioridad, ahorro y luego la más reciente', () => {
    const a = { id: 'a', priority: 0, created_at: '2026-11-01T00:00:00Z' };
    const b = { id: 'b', priority: 0, created_at: '2026-11-20T00:00:00Z' };
    expect(compararCompetidoras(a, 100, b, 100)).toBeGreaterThan(0);
    expect(compararCompetidoras(a, 200, b, 100)).toBeLessThan(0);
    expect(compararCompetidoras({ ...a, priority: 5 }, 1, b, 100)).toBeLessThan(0);
    expect(compararCompetidoras({ id: 'sin' }, 100, b, 100)).toBeGreaterThan(0);
  });

  it('montos por línea y escalón: lo que se registra en sale_promotions', () => {
    const r = evaluarPromociones([volumen], [gaseosa(6), gaseosa(6, 2)], CTX);
    expect(r.applied[0].montos_linea).toEqual({ 0: 13200, 1: 13200 });
    expect(r.applied[0].escalon_linea).toEqual({ 0: 12, 1: 12 });
  });

  it('grupo de clientes: sin cliente no aplica; con el cliente del grupo sí', () => {
    const soloGrupo = { ...volumen, customer_segment_id: 'seg-mayoristas' };
    expect(evaluarPromociones([soloGrupo], [gaseosa(6)], CTX).discountTotal).toBe(0);
    expect(
      evaluarPromociones([soloGrupo], [gaseosa(6)], { ...CTX, cliente: { id: 'c1', segmentos: ['seg-mayoristas'], usos: {} } })
        .discountTotal,
    ).toBe(9000);
  });
});
