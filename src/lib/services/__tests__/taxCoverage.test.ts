/**
 * Advertencia de líneas sin impuesto y tarifa por defecto de la organización.
 *
 *   - `lineaQuedaSinImpuesto` replica el `has_no_tax` de `resolveLineTax` y NO
 *     advierte cuando la tarifa 0 es una elección explícita;
 *   - `fetchTaxCoverage` solo cuenta impuestos activos de la organización;
 *   - `setOrganizationDefaultTax` deja una sola tarifa por defecto (o ninguna)
 *     y rechaza impuestos de otra organización.
 *
 * Datos inventados: organizaciones 900 y 901, productos 1–4.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  fetchTaxCoverage,
  lineaQuedaSinImpuesto,
  rutaEditarProducto,
  tasaImpuestosDelDocumento,
  type TaxCoverage,
} from '@/lib/services/taxCoverage';
import {
  parseCodigoTarifaPorDefecto,
  setOrganizationDefaultTax,
  setOrganizationDefaultTaxByCode,
  SIN_TARIFA_POR_DEFECTO,
} from '@/lib/services/defaultTaxService';

type Row = Record<string, unknown>;

const get = (r: Row, path: string): unknown =>
  path.split('.').reduce<unknown>((acc, k) => (acc && typeof acc === 'object' ? (acc as Row)[k] : undefined), r);

function fakeClient(tables: Record<string, Row[]>): SupabaseClient {
  function from(table: string) {
    const filters: Array<(r: Row) => boolean> = [];
    let patch: Row | null = null;
    let limit: number | null = null;
    const run = () => {
      const rows = (tables[table] || []).filter((r) => filters.every((f) => f(r)));
      if (patch) rows.forEach((r) => Object.assign(r, patch));
      return limit != null ? rows.slice(0, limit) : rows;
    };
    const builder = {
      select: () => builder,
      update: (p: Row) => { patch = p; return builder; },
      eq: (col: string, val: unknown) => { filters.push((r) => get(r, col) === val); return builder; },
      neq: (col: string, val: unknown) => { filters.push((r) => get(r, col) !== val); return builder; },
      in: (col: string, vals: unknown[]) => { filters.push((r) => vals.includes(get(r, col))); return builder; },
      limit: (n: number) => { limit = n; return builder; },
      maybeSingle: () => Promise.resolve({ data: run()[0] ?? null, error: null }),
      then: (resolve: (v: { data: Row[]; error: null }) => unknown) =>
        Promise.resolve({ data: run(), error: null }).then(resolve),
    };
    return builder;
  }
  return { from } as unknown as SupabaseClient;
}

const ORG = 900;
const OTRA_ORG = 901;

function impuestos(): Row[] {
  return [
    { id: 't-iva19', organization_id: ORG, rate: 19, is_active: true, is_default: false, tax_templates: { code: 'IVA_19' } },
    { id: 't-iva5', organization_id: ORG, rate: 5, is_active: true, is_default: true, tax_templates: { code: 'IVA_5' } },
    { id: 't-iva0', organization_id: ORG, rate: 0, is_active: true, is_default: false, tax_templates: { code: 'IVA_0' } },
    { id: 't-inactivo', organization_id: ORG, rate: 19, is_active: false, is_default: false, tax_templates: { code: 'IVA_19' } },
    { id: 't-ajeno', organization_id: OTRA_ORG, rate: 19, is_active: true, is_default: true, tax_templates: { code: 'IVA_19' } },
  ];
}

const sinCobertura: TaxCoverage = { defaultRate: 0, configuredProductIds: new Set(), productUuids: new Map() };

describe('lineaQuedaSinImpuesto', () => {
  test('sin tarifa, sin producto configurado y sin tarifa por defecto → advierte', () => {
    expect(lineaQuedaSinImpuesto({ productId: 1, taxRate: 0 }, sinCobertura)).toBe(true);
    expect(lineaQuedaSinImpuesto({ productId: null, taxRate: null }, sinCobertura)).toBe(true);
  });

  test('la tarifa de la línea, los impuestos del documento o la tarifa por defecto evitan la advertencia', () => {
    expect(lineaQuedaSinImpuesto({ productId: 1, taxRate: 19 }, sinCobertura)).toBe(false);
    expect(lineaQuedaSinImpuesto({ productId: 1 }, sinCobertura, { docTaxRate: 19 })).toBe(false);
    expect(lineaQuedaSinImpuesto({ productId: 1 }, { ...sinCobertura, defaultRate: 19 })).toBe(false);
  });

  test('un producto con impuesto configurado no advierte', () => {
    const cobertura = { ...sinCobertura, configuredProductIds: new Set([1]) };
    expect(lineaQuedaSinImpuesto({ productId: 1 }, cobertura)).toBe(false);
    expect(lineaQuedaSinImpuesto({ productId: 2 }, cobertura)).toBe(true);
  });

  test('exento explícito (código de impuesto o «excluir impuesto») no advierte', () => {
    expect(lineaQuedaSinImpuesto({ productId: 1, taxRate: 0, taxCode: 'IVA_0' }, sinCobertura)).toBe(false);
    expect(lineaQuedaSinImpuesto({ productId: 1, taxRate: 0, taxExcluded: true }, sinCobertura)).toBe(false);
  });
});

describe('tasaImpuestosDelDocumento', () => {
  test('suma solo los marcados con total y tarifa > 0 (paso 2 del resolver)', () => {
    expect(
      tasaImpuestosDelDocumento(
        { IVA_19: true, IVA_5: false, ICA: true, SIN_TOTAL: true },
        { IVA_19: { rate: 19 }, IVA_5: { rate: 5 }, ICA: { rate: 0.97 } },
      ),
    ).toBeCloseTo(19.97);
    expect(tasaImpuestosDelDocumento({}, {})).toBe(0);
    expect(tasaImpuestosDelDocumento(null, null)).toBe(0);
  });
});

describe('fetchTaxCoverage', () => {
  test('cuenta relaciones a impuestos activos de la organización, incluido el exento, e ignora inactivos y ajenos', async () => {
    const client = fakeClient({
      organization_taxes: impuestos(),
      product_tax_relations: [
        { product_id: 1, tax_id: 't-iva19' },
        { product_id: 2, tax_id: 't-iva0' },
        { product_id: 3, tax_id: 't-inactivo' },
        { product_id: 4, tax_id: 't-ajeno' },
      ],
      products: [
        { id: 3, uuid: 'uuid-3', organization_id: ORG },
        { id: 4, uuid: 'uuid-4', organization_id: ORG },
      ],
    });
    const c = await fetchTaxCoverage(client, ORG, [1, 2, 3, 4, 4]);
    expect(c.defaultRate).toBe(5);
    expect(Array.from(c.configuredProductIds).sort()).toEqual([1, 2]);
    expect(c.productUuids.get(3)).toBe('uuid-3');
    expect(c.productUuids.has(1)).toBe(false);
  });

  test('sin tarifa por defecto la tasa es 0', async () => {
    const tablas = impuestos().map((t) => ({ ...t, is_default: t.organization_id === OTRA_ORG }));
    const c = await fetchTaxCoverage(fakeClient({ organization_taxes: tablas }), ORG, []);
    expect(c.defaultRate).toBe(0);
  });
});

describe('tarifa por defecto de la organización', () => {
  const defaults = (rows: Row[], org: number) =>
    rows.filter((r) => r.organization_id === org && r.is_default).map((r) => r.id);

  test('marca una sola y desmarca las demás, sin tocar otras organizaciones', async () => {
    const rows = impuestos();
    await setOrganizationDefaultTax(fakeClient({ organization_taxes: rows }), ORG, 't-iva19');
    expect(defaults(rows, ORG)).toEqual(['t-iva19']);
    expect(defaults(rows, OTRA_ORG)).toEqual(['t-ajeno']);
  });

  test('null deja la organización sin tarifa por defecto', async () => {
    const rows = impuestos();
    await setOrganizationDefaultTax(fakeClient({ organization_taxes: rows }), ORG, null);
    expect(defaults(rows, ORG)).toEqual([]);
    expect(defaults(rows, OTRA_ORG)).toEqual(['t-ajeno']);
  });

  test('rechaza un impuesto de otra organización sin escribir nada', async () => {
    const rows = impuestos();
    await expect(setOrganizationDefaultTax(fakeClient({ organization_taxes: rows }), ORG, 't-ajeno')).rejects.toThrow();
    expect(defaults(rows, ORG)).toEqual(['t-iva5']);
  });

  test('por código: elige el impuesto activo de la plantilla; «Ninguna» desmarca todo', async () => {
    const rows = impuestos();
    const client = fakeClient({ organization_taxes: rows });
    await expect(setOrganizationDefaultTaxByCode(client, ORG, 'IVA_19')).resolves.toBe(true);
    expect(defaults(rows, ORG)).toEqual(['t-iva19']);
    await expect(setOrganizationDefaultTaxByCode(client, ORG, SIN_TARIFA_POR_DEFECTO)).resolves.toBe(true);
    expect(defaults(rows, ORG)).toEqual([]);
  });

  test('por código: si la organización no tiene ese impuesto no cambia nada', async () => {
    const rows = impuestos().filter((r) => r.id !== 't-iva19' && r.id !== 't-inactivo');
    await expect(setOrganizationDefaultTaxByCode(fakeClient({ organization_taxes: rows }), ORG, 'IVA_19')).resolves.toBe(false);
    expect(defaults(rows, ORG)).toEqual(['t-iva5']);
  });

  test('parseCodigoTarifaPorDefecto solo acepta las opciones ofrecidas', () => {
    expect(parseCodigoTarifaPorDefecto('IVA_19')).toBe('IVA_19');
    expect(parseCodigoTarifaPorDefecto('NINGUNA')).toBe('NINGUNA');
    expect(parseCodigoTarifaPorDefecto('RETE_4')).toBeNull();
    expect(parseCodigoTarifaPorDefecto(undefined)).toBeNull();
  });
});

describe('rutaEditarProducto', () => {
  test('usa el uuid del producto; sin uuid va al catálogo', () => {
    expect(rutaEditarProducto('abc-123')).toBe('/app/inventario/productos/abc-123/editar');
    expect(rutaEditarProducto(null)).toBe('/app/inventario/productos');
  });
});
