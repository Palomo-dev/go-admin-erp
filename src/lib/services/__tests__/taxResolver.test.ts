/**
 * Regla única de impuesto por línea (F-42 · F-51 · F-54).
 *
 * Fija el contrato de `taxResolver.ts`:
 *   - precedencia de fuentes: línea → documento → producto → tarifa por defecto → 0;
 *   - sin fuente → tarifa 0 y `has_no_tax` (la UI lo advierte);
 *   - `total_line` es siempre el bruto, con impuesto incluido o no;
 *   - descuento e impuesto en la misma línea; cantidades y precios en 0;
 *   - tarifa no entera (ICA 0,97);
 *   - redondeo único de F-51 (`splitGrossLine`), el mismo de `fn_recalc_invoice_totals`.
 *
 * Datos inventados: organización 900, productos 1–3.
 */

type Row = Record<string, unknown>;

const tables: Record<string, Row[]> = {};

function query(table: string) {
  const filters: Array<(r: Row) => boolean> = [];
  const builder = {
    select: () => builder,
    eq: (col: string, val: unknown) => { filters.push((r) => r[col] === val); return builder; },
    in: (col: string, vals: unknown[]) => { filters.push((r) => vals.includes(r[col])); return builder; },
    then: (resolve: (v: { data: Row[]; error: null }) => unknown) =>
      Promise.resolve({ data: (tables[table] || []).filter((r) => filters.every((f) => f(r))), error: null }).then(resolve),
  };
  return builder;
}

jest.mock('@/lib/supabase/config', () => ({ supabase: { from: (t: string) => query(t) } }));

import { computeLineTotal, resolveLineTax, splitGrossLine } from '@/lib/services/taxResolver';

const ORG = 900;
const IVA19 = { id: 't-iva19', organization_id: ORG, rate: 19, is_active: true, is_default: false, template_id: 1, tax_templates: { code: 'IVA_19' } };
const IVA5 = { id: 't-iva5', organization_id: ORG, rate: 5, is_active: true, is_default: false, template_id: 2, tax_templates: { code: 'IVA_5' } };
const ICA = { id: 't-ica', organization_id: ORG, rate: 0.97, is_active: true, is_default: false, template_id: 6, tax_templates: { code: 'ICA_0.966' } };

function seed({ relations = [] as Row[], defaults = false } = {}) {
  tables.product_tax_relations = relations;
  tables.organization_taxes = [IVA19, { ...IVA5, is_default: defaults }, ICA];
}

const base = { organizationId: ORG, taxIncluded: false, qty: 1, unitPrice: 1_000_000 };

describe('taxResolver — precedencia de fuentes', () => {
  beforeEach(() => seed());

  test('1. la tarifa de la línea gana a todo lo demás', async () => {
    seed({ relations: [{ product_id: 1, tax_id: 't-iva5' }], defaults: true });
    const r = await resolveLineTax({ ...base, itemTaxRate: 19, itemTaxCode: 'IVA_19', productId: 1 });
    expect(r).toMatchObject({ tax_rate: 19, tax_code: 'IVA_19', has_no_tax: false, total_line: 1_190_000 });
  });

  test('2. sin tarifa en la línea, gana el impuesto marcado en el documento', async () => {
    seed({ relations: [{ product_id: 1, tax_id: 't-iva5' }], defaults: true });
    const r = await resolveLineTax({
      ...base,
      productId: 1,
      appliedTaxes: { IVA_19: true },
      appliedTaxTotals: { IVA_19: { rate: 19, base: 0, amount: 0, name: 'IVA 19%', included: false } },
    });
    expect(r).toMatchObject({ tax_rate: 19, tax_code: 'IVA_19', has_no_tax: false });
  });

  test('3. sin línea ni documento, gana la relación del producto', async () => {
    seed({ relations: [{ product_id: 1, tax_id: 't-iva5' }], defaults: false });
    const r = await resolveLineTax({ ...base, productId: 1 });
    expect(r).toMatchObject({ tax_rate: 5, tax_code: 'IVA_5', has_no_tax: false, total_line: 1_050_000 });
  });

  test('3b. un impuesto inactivo del producto no cuenta', async () => {
    tables.product_tax_relations = [{ product_id: 1, tax_id: 't-iva19' }];
    tables.organization_taxes = [{ ...IVA19, is_active: false }];
    const r = await resolveLineTax({ ...base, productId: 1 });
    expect(r.has_no_tax).toBe(true);
  });

  test('4. sin relación del producto, gana la tarifa por defecto de la organización', async () => {
    seed({ relations: [], defaults: true });
    const r = await resolveLineTax({ ...base, productId: 2 });
    expect(r).toMatchObject({ tax_rate: 5, tax_code: 'IVA_5', has_no_tax: false });
  });

  test('5. sin ninguna fuente: tarifa 0, sin código y has_no_tax para que la UI advierta', async () => {
    seed({ relations: [], defaults: false });
    const r = await resolveLineTax({ ...base, productId: 3 });
    expect(r).toEqual({ tax_rate: 0, tax_code: null, tax_included: false, total_line: 1_000_000, has_no_tax: true });
  });
});

describe('taxResolver — total_line es siempre el bruto', () => {
  test('IVA 19% no incluido sobre 1.000.000 → 1.190.000 (caso E2E a)', () => {
    expect(computeLineTotal(1, 1_000_000, 0, 19, false)).toBe(1_190_000);
  });

  test('IVA 19% incluido sobre 1.190.000 → 1.190.000 (caso E2E b)', () => {
    expect(computeLineTotal(1, 1_190_000, 0, 19, true)).toBe(1_190_000);
  });

  test('descuento e impuesto en la misma línea: el impuesto va sobre el neto', () => {
    // 3 × 10.000 − 5.000 = 25.000 de base; con 19% → 29.750.
    expect(computeLineTotal(3, 10_000, 5_000, 19, false)).toBe(29_750);
    expect(computeLineTotal(3, 10_000, 5_000, 19, true)).toBe(25_000);
  });

  test('cantidad o precio en 0 → línea en 0, sin NaN', () => {
    expect(computeLineTotal(0, 10_000, 0, 19, false)).toBe(0);
    expect(computeLineTotal(2, 0, 0, 19, false)).toBe(0);
    expect(computeLineTotal(0, 0, 0, 19, true)).toBe(0);
  });

  test('tarifa no entera (ICA 0,97): 100.000 → 100.970', () => {
    expect(computeLineTotal(1, 100_000, 0, 0.97, false)).toBe(100_970);
  });

  test('tarifa no entera resuelta desde el producto', async () => {
    seed({ relations: [{ product_id: 1, tax_id: 't-ica' }] });
    const r = await resolveLineTax({ ...base, unitPrice: 100_000, productId: 1 });
    expect(r).toMatchObject({ tax_rate: 0.97, tax_code: 'ICA_0.966', total_line: 100_970 });
  });
});

describe('splitGrossLine — F-51, un solo redondeo', () => {
  test('bruto 1.190.000 al 19% → base 1.000.000 e impuesto 190.000', () => {
    expect(splitGrossLine(1_190_000, 19)).toEqual({ base: 1_000_000, tax: 190_000 });
  });

  test('bruto 27.000 al 19%: base redondeada a centavos e impuesto por resta, sin perder el centavo', () => {
    // 27.000 / 1,19 = 22.689,0756… → 22.689,08; impuesto = 4.310,92.
    const r = splitGrossLine(27_000, 19);
    expect(r).toEqual({ base: 22_689.08, tax: 4_310.92 });
    expect(Math.round((r.base + r.tax) * 100)).toBe(2_700_000);
  });

  test('tarifa 0: todo es base', () => {
    expect(splitGrossLine(5_000, 0)).toEqual({ base: 5_000, tax: 0 });
  });

  test('negativos (nota crédito): el mismo resultado con signo contrario', () => {
    expect(splitGrossLine(-27_000, 19)).toEqual({ base: -22_689.08, tax: -4_310.92 });
  });

  test('tarifa no entera: 100.970 al 0,97% → 100.000 + 970', () => {
    expect(splitGrossLine(100_970, 0.97)).toEqual({ base: 100_000, tax: 970 });
  });
});
