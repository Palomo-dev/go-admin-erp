/// <reference types="jest" />
/**
 * B-I2 (decisión del dueño, 2026-09-28): las retenciones salen de «Impuestos de
 * venta» a su propia clase, sin borrar filas. Migración
 * 20260928220000_impuestos_clase_retencion: `kind` ('tax' | 'withholding') en
 * tax_templates y organization_taxes; 228 filas (RETE_4, RETE_11 e ICA_0.966
 * de 76 organizaciones) reclasificadas, 0 en uso como impuesto.
 *
 * Probado por MCP en transacción deshecha antes de aplicar: retención por
 * defecto → WITHHOLDING_NOT_DEFAULT; plantilla RETE_4 pedida como 'tax' →
 * queda 'withholding'; llamada con 9 argumentos nombrados → 'tax'; clase
 * inválida → INVALID_KIND; fijar por defecto una retención →
 * retencion_no_predeterminada; relacionar retención o impuesto de otra
 * organización a un producto → impuesto_invalido; IVA de la misma
 * organización → sí; fn_codigo_impuesto_linea(…, 0.97) → NULL. Rollback
 * probado igual (md5 del cuerpo de fn_importar_productos_lote vuelve al
 * original). Datos inventados: organización 120.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  esRetencion,
  resolveLineTaxWith,
  sinRetenciones,
  soloRetenciones,
  type TaxResolverClient,
} from '@/lib/services/taxResolverCore';
import { tipoRetencion } from '@/components/finanzas/impuestos/retencionesLogica';

type Fila = Record<string, unknown>;
const leer = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

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
const imp = (id: string, rate: number, code: string | null, kind: string | undefined, extra: Fila = {}): Fila => ({
  id,
  organization_id: ORG,
  rate,
  is_active: true,
  is_default: false,
  template_id: code ? 1 : null,
  tax_templates: code ? { code } : null,
  ...(kind ? { kind } : {}),
  ...extra,
});

describe('esRetencion: la clase manda; el código solo cuando falta la clase', () => {
  it('ICA con clase withholding es retención aunque su código no empiece por RETE', () => {
    expect(esRetencion({ kind: 'withholding', tax_templates: { code: 'ICA_0.966' } })).toBe(true);
  });
  it('clase tax gana al código', () => {
    expect(esRetencion({ kind: 'tax', tax_templates: { code: 'RETE_4' } })).toBe(false);
  });
  it('sin clase (réplica sin conexión anterior a la columna): decide el prefijo RETE', () => {
    expect(esRetencion({ tax_templates: { code: 'RETE_11' } })).toBe(true);
    expect(esRetencion({ tax_templates: [{ code: 'IVA_19' }] })).toBe(false);
    expect(esRetencion({ tax_templates: null })).toBe(false);
  });
  it('sinRetenciones y soloRetenciones parten la lista sin perder filas', () => {
    const filas = [
      imp('iva19', 19, 'IVA_19', 'tax'),
      imp('ica', 0.97, 'ICA_0.966', 'withholding'),
      imp('rete4', 4, 'RETE_4', undefined),
      imp('propio', 8, null, 'tax'),
      imp('reteiva', 15, null, 'withholding'),
    ];
    expect(sinRetenciones(filas as never[]).map((f: Fila) => f.id)).toEqual(['iva19', 'propio']);
    expect(soloRetenciones(filas as never[]).map((f: Fila) => f.id)).toEqual(['ica', 'rete4', 'reteiva']);
  });
});

describe('resolveLineTaxWith con la clase', () => {
  const linea = { organizationId: ORG, taxIncluded: false, qty: 1, unitPrice: 10000, discountAmount: 0 };
  const tablas = {
    product_tax_relations: [
      { product_id: 1, tax_id: 'iva19' },
      { product_id: 1, tax_id: 'ica' },
      { product_id: 2, tax_id: 'reteiva' },
    ],
    organization_taxes: [
      imp('iva19', 19, 'IVA_19', 'tax'),
      imp('ica', 0.97, 'ICA_0.966', 'withholding'),
      imp('reteiva', 15, null, 'withholding'),
    ],
  };

  it('IVA 19 % + ReteICA relacionados: 19 %, no 19,97 %', async () => {
    const r = await resolveLineTaxWith(clienteFalso(tablas), { ...linea, productId: 1 });
    expect(r).toMatchObject({ tax_rate: 19, tax_code: 'IVA_19', total_line: 11900 });
  });
  it('una retención personalizada (sin plantilla) tampoco se cobra', async () => {
    const r = await resolveLineTaxWith(clienteFalso(tablas), { ...linea, productId: 2 });
    expect(r).toMatchObject({ tax_rate: 0, has_no_tax: true });
  });
  it('el resolver pide la clase en los pasos 3 y 4', () => {
    const src = leer('src/lib/services/taxResolverCore.ts');
    expect(src).toMatch(/select\('id, rate, is_active, kind, template_id, tax_templates\(code\)'\)/);
    expect(src).toMatch(/select\('id, rate, is_default, kind, template_id, tax_templates\(code\)'\)/);
  });
});

describe('tipoRetencion (columna «Tipo» de la pestaña Retenciones)', () => {
  it.each([
    [null, 'Retención en la Fuente 4%', 'retefuente'],
    [null, 'Retención en la Fuente 11%', 'retefuente'],
    [null, 'ICA Bogotá 9.66x1000', 'reteica'],
    [null, 'ReteICA Bogotá', 'reteica'],
    [null, 'ReteIVA 15 %', 'reteiva'],
    [null, 'Retención servicios de comunicaciones', 'otra'],
    ['RETE_4', 'x', 'retefuente'],
    ['RETEIVA_15', 'x', 'reteiva'],
    ['ICA_0.966', 'x', 'reteica'],
  ])('%s / %s → %s', (codigo, nombre, esperado) => {
    expect(tipoRetencion(codigo, nombre)).toBe(esperado);
  });
});

describe('una sola fuente de verdad en los lectores de venta', () => {
  it.each([
    ['src/lib/services/posService.ts', /return sinRetenciones\(data \?\? \[\]\);/],
    ['src/lib/offline/posOfflineReads.ts', /return sinRetenciones\(await getCatalogRowsByOrg\('organization_taxes', organizationId\)\)/],
    ['src/components/inventario/productos/formulario/cargarCatalogos.ts', /impuestos: sinRetenciones\(/],
    ['src/components/finanzas/facturas-venta/nueva-factura/ImpuestosFactura.tsx', /sinRetenciones\(taxesData\)/],
    ['src/components/finanzas/facturas-compra/nueva-factura/ImpuestosFacturaCompra.tsx', /sinRetenciones\(taxes\)/],
    ['src/lib/services/checkoutService.ts', /sinRetenciones\(orgTaxes \?\? \[\]\)/],
    ['src/components/pos/configuracion/configuracionService.ts', /sinRetenciones\(data \?\? \[\]\)/],
    ['src/lib/services/productosImportService.ts', /sinRetenciones\(/],
    ['src/components/finanzas/impuestos/useImpuestosOrganizacion.ts', /sinRetenciones\(taxes\)[\s\S]*soloRetenciones\(taxes\)/],
  ])('%s filtra con el helper común', (archivo, patron) => {
    expect(leer(archivo)).toMatch(patron);
  });

  it('nadie vuelve a filtrar por el prefijo RETE fuera del helper', () => {
    for (const archivo of [
      'src/lib/services/posService.ts',
      'src/lib/offline/posOfflineReads.ts',
      'src/components/inventario/productos/formulario/cargarCatalogos.ts',
      'src/components/finanzas/impuestos/TaxForm.tsx',
      'src/components/finanzas/impuestos/RetencionesTable.tsx',
    ]) {
      expect(leer(archivo)).not.toMatch(/startsWith\('RETE'\)|ilike.*RETE/);
    }
  });

  it('la réplica sin conexión trae la clase de ambas tablas', () => {
    const m = leer('src/lib/offline/replicationManifest.ts');
    expect(m).toMatch(/table: 'tax_templates'[^\n]*'updated_at', 'kind'\]/);
    expect(m).toMatch(/'updated_at', 'tax_included', 'kind'\]/);
  });

  it('el formulario manda la clase y la retención no ofrece «por defecto» ni «incluido»', () => {
    const f = leer('src/components/finanzas/impuestos/TaxForm.tsx');
    expect(f).toMatch(/p_kind: clase/);
    expect(f).toMatch(/p_is_default: esClaseRetencion \? false : isDefault/);
    expect(f).toMatch(/p_tax_included: esClaseRetencion \? false : taxIncluded/);
    expect(f).toMatch(/\{!esClaseRetencion && \(/);
  });
});

describe('migración y rollback', () => {
  const sql = leer('supabase/migrations/20260928220000_impuestos_clase_retencion.sql');
  const rb = leer('supabase/rollbacks/20260928220000_impuestos_clase_retencion_rollback.sql');

  it('columna aditiva con default y check en las dos tablas', () => {
    expect(sql).toMatch(/alter table public\.tax_templates\s+add column if not exists kind text not null default 'tax';/);
    expect(sql).toMatch(/alter table public\.organization_taxes\s+add column if not exists kind text not null default 'tax';/);
    expect(sql).toMatch(/check \(kind in \('tax', 'withholding'\)\)/);
    expect(sql).not.toMatch(/delete from|drop table|alter column/i);
  });

  it('reclasifica sin tocar lo que está en uso como impuesto', () => {
    const bloque = sql.slice(sql.indexOf('-- ── 4.'), sql.indexOf('-- ── 5.'));
    expect(bloque).toMatch(/not coalesce\(ot\.is_default, false\)/);
    expect(bloque).toMatch(/not exists \(select 1 from public\.product_tax_relations r where r\.tax_id = ot\.id\)/);
  });

  it('guardas: retención no por defecto y no relacionada a productos (misma organización)', () => {
    expect(sql).toMatch(/organization_taxes_retencion_no_por_defecto/);
    expect(sql).toMatch(/create trigger trg_product_tax_relations_validar\s+before insert or update of tax_id, product_id on public\.product_tax_relations/);
    expect(sql).toMatch(/v_org_imp <> v_org_prod/);
    expect(sql).toMatch(/raise exception 'retencion_no_predeterminada'/);
  });

  it('manage_organization_tax: una sola firma con p_kind (la de 9 se sustituye) y sin anon', () => {
    expect(sql).toMatch(/drop function if exists public\.manage_organization_tax\(integer, text, numeric, text, boolean, boolean, integer, text, boolean\);/);
    expect(sql).toMatch(/p_kind text default null\)/);
    expect(sql).toMatch(/revoke all on function public\.manage_organization_tax\(integer, text, numeric, text, boolean, boolean, integer, text, boolean, text\) from public, anon;/);
    expect(sql).toMatch(/'WITHHOLDING_NOT_DEFAULT'/);
    expect(sql).toMatch(/'TAX_IN_USE_BY_PRODUCTS'/);
  });

  it('la importación de productos solo relaciona impuestos de clase tax (parche idempotente)', () => {
    expect(sql).toMatch(/and t\.kind = ''tax''\\n/);
    expect(sql).toMatch(/if position\(v_nueva in v_def\) > 0 then\s+return;/);
  });

  it('el rollback restaura las funciones, quita la columna y advierte que no restaura datos', () => {
    expect(rb).toMatch(/ADVIERTE/);
    expect(rb).toMatch(/drop column if exists kind/);
    expect(rb).toMatch(/drop function if exists public\.manage_organization_tax\(integer, text, numeric, text, boolean, boolean, integer, text, boolean, text\);/);
    expect(rb).toMatch(/tt\.code not ilike '%RETE%'/);
  });
});
