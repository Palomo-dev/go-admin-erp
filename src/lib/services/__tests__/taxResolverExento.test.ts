/// <reference types="jest" />
/**
 * B7 (2026-09-28): producto exento o sin impuesto cobrado con la tarifa por
 * defecto. Antes, en `resolveLineTaxWith`, un producto relacionado con un
 * impuesto activo de tarifa 0 caía al paso 4 (tarifa por defecto) y
 * `tax_templates!inner` descartaba los impuestos personalizados.
 *
 * Primero se FIJAN los casos que no deben cambiar (impuesto > 0, producto sin
 * relación en una organización con tarifa por defecto); después el cambio.
 * Datos inventados: organización 120.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { resolveLineTaxWith, type TaxResolverClient } from '../taxResolverCore';

type Fila = Record<string, unknown>;

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
const tablas = {
  product_tax_relations: [
    { product_id: 1, tax_id: 'iva19' },
    { product_id: 2, tax_id: 'iva0' },
    { product_id: 3, tax_id: 'inc8' },
    { product_id: 4, tax_id: 'inactivo' },
  ],
  organization_taxes: [
    { id: 'iva19', organization_id: ORG, rate: 19, is_active: true, is_default: true, template_id: 1, tax_templates: { code: 'IVA_19' } },
    { id: 'iva0', organization_id: ORG, rate: 0, is_active: true, is_default: false, template_id: 3, tax_templates: { code: 'IVA_0' } },
    // Personalizado: sin plantilla.
    { id: 'inc8', organization_id: ORG, rate: 8, is_active: true, is_default: false, template_id: null, tax_templates: null },
    { id: 'inactivo', organization_id: ORG, rate: 5, is_active: false, is_default: false, template_id: 2, tax_templates: { code: 'IVA_5' } },
  ],
};
const linea = { organizationId: ORG, taxIncluded: false, qty: 1, unitPrice: 10000, discountAmount: 0 };

describe('lo que NO cambia', () => {
  it('producto con impuesto > 0: su tarifa', async () => {
    const r = await resolveLineTaxWith(clienteFalso(tablas).client, { ...linea, productId: 1 });
    expect(r).toEqual({ tax_rate: 19, tax_code: 'IVA_19', tax_included: false, total_line: 11900, has_no_tax: false });
  });

  it('producto SIN relación en una organización con tarifa por defecto: la tarifa por defecto (decisión documentada)', async () => {
    const r = await resolveLineTaxWith(clienteFalso(tablas).client, { ...linea, productId: 99 });
    expect(r).toMatchObject({ tax_rate: 19, tax_code: 'IVA_19', has_no_tax: false });
  });

  it('producto relacionado solo con un impuesto INACTIVO: como sin relación → por defecto', async () => {
    const r = await resolveLineTaxWith(clienteFalso(tablas).client, { ...linea, productId: 4 });
    expect(r.tax_rate).toBe(19);
  });

  it('línea con tarifa propia > 0: manda la línea', async () => {
    const r = await resolveLineTaxWith(clienteFalso(tablas).client, { ...linea, productId: 2, itemTaxRate: 5, itemTaxCode: 'IVA_5' });
    expect(r).toMatchObject({ tax_rate: 5, tax_code: 'IVA_5' });
  });

  it('sin nada configurado: 0 y has_no_tax', async () => {
    const r = await resolveLineTaxWith(clienteFalso({}).client, { ...linea, productId: 2 });
    expect(r).toMatchObject({ tax_rate: 0, has_no_tax: true });
  });
});

describe('lo que cambia', () => {
  it('producto relacionado con un impuesto activo de tarifa 0 (exento): queda en 0, sin advertir y sin consultar la tarifa por defecto', async () => {
    const { client, consultas } = clienteFalso(tablas);
    const r = await resolveLineTaxWith(client, { ...linea, productId: 2 });
    expect(r).toEqual({ tax_rate: 0, tax_code: 'IVA_0', tax_included: false, total_line: 10000, has_no_tax: false });
    // Antes: product_tax_relations, organization_taxes (relación) y organization_taxes (por defecto).
    expect(consultas).toEqual(['product_tax_relations', 'organization_taxes']);
  });

  it('impuesto personalizado sin plantilla cuenta', async () => {
    const r = await resolveLineTaxWith(clienteFalso(tablas).client, { ...linea, productId: 3 });
    expect(r).toMatchObject({ tax_rate: 8, tax_code: null, total_line: 10800, has_no_tax: false });
  });

  it('el join con la plantilla es izquierdo (nunca !inner)', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/services/taxResolverCore.ts'), 'utf8');
    const codigo = src.split('\n').filter((l) => !/^\s*(\*|\/\/)/.test(l)).join('\n');
    expect(codigo).not.toMatch(/tax_templates!inner/);
    expect(codigo).toMatch(/tax_templates\(code\)/);
  });

  it('el cobro del POS marca como definitiva la tarifa que ya decidió el carrito', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/services/posService.ts'), 'utf8');
    expect(src).toMatch(/const decididaPorElCarrito = typeof item\.tax_rate === 'number' && typeof item\.tax_amount === 'number';/);
    expect(src).toMatch(/itemTaxIsFinal: decididaPorElCarrito,/);
  });
});
