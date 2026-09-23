/// <reference types="jest" />
/**
 * F-42: resolver único de impuesto por línea, con el cliente por parámetro
 * (`resolveLineTaxWith`), que es el que usan también las rutas de servidor.
 */
import { computeLineTotal, resolveLineTaxWith, type TaxResolverClient } from '../taxResolverCore';

type Fila = Record<string, unknown>;

/**
 * Cliente falso: cada tabla devuelve sus filas filtradas por los `eq`/`in`
 * encadenados, y registra qué tablas se consultaron.
 */
function clienteFalso(tablas: Record<string, Fila[]>) {
  const consultas: string[] = [];
  const client = {
    from(tabla: string) {
      consultas.push(tabla);
      const filtros: Array<(f: Fila) => boolean> = [];
      const builder = {
        select: () => builder,
        eq: (col: string, val: unknown) => {
          filtros.push((f) => f[col] === val);
          return builder;
        },
        in: (col: string, vals: unknown[]) => {
          filtros.push((f) => vals.includes(f[col]));
          return builder;
        },
        then: (resolve: (r: { data: Fila[]; error: null }) => unknown) =>
          resolve({ data: (tablas[tabla] || []).filter((f) => filtros.every((fn) => fn(f))), error: null }),
      };
      return builder;
    },
  } as unknown as TaxResolverClient;
  return { client, consultas };
}

const ORG = 120;
const impuestos = {
  product_tax_relations: [{ product_id: 7, tax_id: 'iva5' }],
  organization_taxes: [
    { id: 'iva5', organization_id: ORG, rate: 5, is_active: true, is_default: false, tax_templates: { code: 'IVA_5' } },
    { id: 'iva19', organization_id: ORG, rate: 19, is_active: true, is_default: true, tax_templates: { code: 'IVA_19' } },
  ],
};

const linea = { organizationId: ORG, taxIncluded: false, qty: 2, unitPrice: 1000, discountAmount: 0 };

describe('resolveLineTaxWith', () => {
  it('1. la tarifa de la línea manda y no consulta la base', async () => {
    const { client, consultas } = clienteFalso(impuestos);
    const r = await resolveLineTaxWith(client, { ...linea, itemTaxRate: 8, itemTaxCode: 'INC_8', productId: 7 });
    expect(r).toEqual({ tax_rate: 8, tax_code: 'INC_8', tax_included: false, total_line: 2160, has_no_tax: false });
    expect(consultas).toEqual([]);
  });

  it('1b. con itemTaxIsFinal una tarifa 0 es definitiva (línea exenta copiada)', async () => {
    const { client, consultas } = clienteFalso(impuestos);
    const r = await resolveLineTaxWith(client, { ...linea, itemTaxRate: 0, itemTaxIsFinal: true, productId: 7 });
    expect(r.tax_rate).toBe(0);
    expect(r.tax_code).toBeNull();
    expect(r.total_line).toBe(2000);
    expect(consultas).toEqual([]);
  });

  it('2. impuestos aplicados al documento', async () => {
    const { client, consultas } = clienteFalso(impuestos);
    const r = await resolveLineTaxWith(client, {
      ...linea,
      productId: 7,
      appliedTaxes: { IVA_19: true },
      appliedTaxTotals: { IVA_19: { rate: 19, base: 0, amount: 0, name: 'IVA', included: false } },
    });
    expect(r).toMatchObject({ tax_rate: 19, tax_code: 'IVA_19', total_line: 2380 });
    expect(consultas).toEqual([]);
  });

  it('3. impuestos del producto antes que los de la organización por defecto', async () => {
    const { client } = clienteFalso(impuestos);
    const r = await resolveLineTaxWith(client, { ...linea, productId: 7 });
    expect(r).toMatchObject({ tax_rate: 5, tax_code: 'IVA_5', total_line: 2100 });
  });

  it('4. sin producto: impuesto por defecto de la organización', async () => {
    const { client } = clienteFalso(impuestos);
    const r = await resolveLineTaxWith(client, { ...linea, taxIncluded: true, productId: null });
    expect(r).toMatchObject({ tax_rate: 19, tax_code: 'IVA_19', tax_included: true, total_line: 2000 });
  });

  it('5. sin nada configurado: 0 y has_no_tax', async () => {
    const { client } = clienteFalso({});
    const r = await resolveLineTaxWith(client, { ...linea, productId: 7 });
    expect(r).toEqual({ tax_rate: 0, tax_code: null, tax_included: false, total_line: 2000, has_no_tax: true });
  });

  it('la regla de total_line conserva el signo de las notas crédito en negativo', async () => {
    const { client } = clienteFalso({});
    const r = await resolveLineTaxWith(client, {
      ...linea,
      itemTaxRate: 19,
      itemTaxIsFinal: true,
      qty: -2,
      discountAmount: -200,
    });
    expect(r.total_line).toBe(-2142);
  });
});

describe('computeLineTotal', () => {
  it('incluido: el bruto es qty × precio − descuento', () => {
    expect(computeLineTotal(3, 1190, 190, 19, true)).toBe(3380);
  });
  it('no incluido: el neto por (1 + tasa)', () => {
    expect(computeLineTotal(3, 1000, 100, 19, false)).toBe(3451);
  });
});
