/// <reference types="jest" />
/**
 * Pendiente 5 (docs/hallazgos/comisiones-e-impuestos-2026-09-28.md): el paso 3
 * del resolver SUMABA toda tarifa relacionada al producto. Una retención
 * (RETE_4, RETE_11, ReteIVA, ReteICA…) relacionada se habría cobrado como
 * impuesto de la línea: IVA 19 % + RETE_4 = 23 %. Medido el 2026-09-28: 76
 * organizaciones tienen RETE_4 y RETE_11 activos entre sus impuestos, 0
 * relaciones con productos. Datos inventados: organización 120.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { esCodigoRetencion, resolveLineTaxWith, sinRetenciones, type TaxResolverClient } from '../taxResolverCore';

type Fila = Record<string, unknown>;

function clienteFalso(tablas: Record<string, Fila[]>): TaxResolverClient {
  return {
    from(tabla: string) {
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
}

const ORG = 120;
const imp = (id: string, rate: number, code: string | null, extra: Fila = {}): Fila => ({
  id, organization_id: ORG, rate, is_active: true, is_default: false, template_id: code ? 1 : null, tax_templates: code ? { code } : null, ...extra,
});
const tablas = {
  product_tax_relations: [
    { product_id: 1, tax_id: 'iva19' },
    { product_id: 1, tax_id: 'rete4' },
    { product_id: 2, tax_id: 'rete11' },
    { product_id: 3, tax_id: 'iva0' },
    { product_id: 3, tax_id: 'reteiva' },
  ],
  organization_taxes: [
    imp('iva19', 19, 'IVA_19', { is_default: true }),
    imp('iva0', 0, 'IVA_0'),
    imp('rete4', 4, 'RETE_4'),
    imp('rete11', 11, 'RETE_11'),
    imp('reteiva', 15, 'RETEIVA_15'),
  ],
};
const linea = { organizationId: ORG, taxIncluded: false, qty: 1, unitPrice: 10000, discountAmount: 0 };

describe('esCodigoRetencion', () => {
  it.each(['RETE_4', 'RETE_11', 'rete_4', 'RETEIVA_15', 'RETEICA', 'RETEFUENTE', 'RETE_IVA'])('%s es retención', (c) => {
    expect(esCodigoRetencion(c)).toBe(true);
  });
  it.each(['IVA_19', 'IVA_0', 'IVA_EXCLUIDO', 'INC_8', 'ICA_0.966', '', null, undefined])('%s no es retención', (c) => {
    expect(esCodigoRetencion(c)).toBe(false);
  });
  it('sinRetenciones conserva los impuestos personalizados (sin plantilla)', () => {
    const filas = [imp('a', 8, null), imp('b', 4, 'RETE_4'), { rate: 5, tax_templates: [{ code: 'IVA_5' }] }];
    expect(sinRetenciones(filas as never[]).map((f: Fila) => f.rate)).toEqual([8, 5]);
  });
});

describe('resolveLineTaxWith: la retención relacionada no se cobra', () => {
  it('IVA 19 % + RETE_4 relacionados: 19 %, no 23 %', async () => {
    const r = await resolveLineTaxWith(clienteFalso(tablas), { ...linea, productId: 1 });
    expect(r).toEqual({ tax_rate: 19, tax_code: 'IVA_19', tax_included: false, total_line: 11900, has_no_tax: false });
  });

  it('solo una retención relacionada: como «sin relación» → tarifa por defecto de la organización', async () => {
    const r = await resolveLineTaxWith(clienteFalso(tablas), { ...linea, productId: 2 });
    expect(r).toMatchObject({ tax_rate: 19, tax_code: 'IVA_19' });
  });

  it('exento + ReteIVA: sigue exento (0, configurado, sin advertir)', async () => {
    const r = await resolveLineTaxWith(clienteFalso(tablas), { ...linea, productId: 3 });
    expect(r).toMatchObject({ tax_rate: 0, tax_code: 'IVA_0', has_no_tax: false });
  });

  it('una retención marcada por defecto nunca es la tarifa por defecto de la venta', async () => {
    const soloRete = { product_tax_relations: [], organization_taxes: [imp('rete4', 4, 'RETE_4', { is_default: true })] };
    const r = await resolveLineTaxWith(clienteFalso(soloRete), { ...linea, productId: 9 });
    expect(r).toMatchObject({ tax_rate: 0, has_no_tax: true });
  });
});

describe('el POS (en línea y sin conexión) descarta las retenciones en el mismo punto', () => {
  const leer = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
  it('POSService.getProductTaxes lee el código de la plantilla y filtra con sinRetenciones', () => {
    const src = leer('src/lib/services/posService.ts');
    const cuerpo = src.slice(src.indexOf('static async getProductTaxes'), src.indexOf('private static saveCartToStorage'));
    expect(cuerpo).toMatch(/select\('\*, tax_templates\(code\)'\)/);
    expect(cuerpo).toMatch(/sinRetenciones\(taxes \?\? \[\]\)/);
  });
  it('la réplica sin conexión guarda el código y posOfflineReads.getProductTaxes filtra igual', () => {
    expect(leer('src/lib/offline/catalogReplicator.ts')).toMatch(/from\('organization_taxes'\)\.select\('\*, tax_templates\(code\)'\)/);
    const off = leer('src/lib/offline/posOfflineReads.ts');
    expect(off.slice(off.indexOf('export async function getProductTaxes'))).toMatch(/return sinRetenciones\(taxes\)/);
  });
});
