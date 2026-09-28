/// <reference types="jest" />
/**
 * B8 (2026-09-28): códigos de impuesto para Factus/DIAN y marca de excluido.
 *
 * Tabla oficial de Factus (https://developers.factus.com.co/tablas-de-referencia/tablas/):
 *   impuestos:   01 IVA · 04 Impuesto Nacional al Consumo · 35 ultraprocesados
 *   retenciones: 05 sobre el IVA (ReteIVA) · 06 sobre la renta (ReteFuente)
 * ICA y ReteICA no están en esas tablas. Antes `mapTaxCode` mandaba cualquier
 * código no mapeado como '01' (un INC_8 se declaraba IVA) y RETE_* salía como '09'.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { CodigoTributoNoAdmitidoError, mapTaxCode, mapWithholdingCode } from '@/lib/services/factusService';
import { DatosIncompletosError, mapearLinea } from '@/lib/services/einvoicing/payloadsFactus';

describe('mapTaxCode', () => {
  it.each([
    ['IVA_19', '01'],
    ['IVA_5', '01'],
    ['IVA_0', '01'],
    ['IVA_EXCLUIDO', '01'],
    ['IVA', '01'],
    ['01', '01'],
    ['INC_8', '04'],
    ['INC', '04'],
    ['04', '04'],
    ['35', '35'],
  ])('%s → %s', (interno, dian) => {
    expect(mapTaxCode(interno)).toBe(dian);
  });

  it('sin código: IVA a la tarifa de la línea (como antes)', () => {
    expect(mapTaxCode(null)).toBe('01');
    expect(mapTaxCode(undefined)).toBe('01');
    expect(mapTaxCode('')).toBe('01');
  });

  it.each(['ICA_0.966', 'RETE_4', 'RETE_11', 'XYZ', '09', '07'])('%s falla con error claro (nunca se declara como IVA)', (code) => {
    expect(() => mapTaxCode(code)).toThrow(CodigoTributoNoAdmitidoError);
  });
});

describe('mapWithholdingCode', () => {
  it.each([
    ['RETE_4', '06'],
    ['RETE_11', '06'],
    ['RETEFUENTE', '06'],
    ['06', '06'],
    ['RETEIVA', '05'],
    ['05', '05'],
  ])('%s → %s', (interno, dian) => {
    expect(mapWithholdingCode(interno)).toBe(dian);
  });
  it.each(['RETEICA', '07', '09', 'IVA_19'])('%s falla', (code) => {
    expect(() => mapWithholdingCode(code)).toThrow(CodigoTributoNoAdmitidoError);
  });
});

describe('mapearLinea', () => {
  const base = { qty: 1, unit_price: 10000, product_id: 5 };

  it('INC_8 se declara como INC (04), no como IVA', () => {
    const { item } = mapearLinea({ ...base, tax_rate: 8, tax_code: 'INC_8' }, 0);
    expect(item.taxes).toEqual([{ code: '04', rate: '8.00', is_excluded: false }]);
  });

  it('excluido por la marca de la línea o por el código IVA_EXCLUIDO', () => {
    expect(mapearLinea({ ...base, tax_rate: 0, is_excluded: 1 }, 0).item.taxes[0]).toEqual({ code: '01', rate: '0.00', is_excluded: true });
    expect(mapearLinea({ ...base, tax_rate: 0, tax_code: 'IVA_EXCLUIDO' }, 0).item.taxes[0]).toEqual({ code: '01', rate: '0.00', is_excluded: true });
  });

  it('exento (IVA_0) sigue siendo IVA 0 %, no excluido', () => {
    expect(mapearLinea({ ...base, tax_rate: 0, tax_code: 'IVA_0' }, 0).item.taxes[0]).toEqual({ code: '01', rate: '0.00', is_excluded: false });
  });

  it('código desconocido → DatosIncompletosError (dato a corregir; la cola no reintenta sola)', () => {
    expect(() => mapearLinea({ ...base, tax_rate: 8, tax_code: 'OTRO_8' }, 2)).toThrow(DatosIncompletosError);
    expect(() => mapearLinea({ ...base, tax_rate: 8, tax_code: 'OTRO_8' }, 2)).toThrow(/línea 3/);
  });

  it('retención ReteFuente sale como 06', () => {
    const { item } = mapearLinea({ ...base, tax_rate: 19, tax_code: 'IVA_19', withholding_taxes: [{ code: 'RETE_4', rate: 4 }] }, 0);
    expect(item.withholding_taxes).toEqual([{ code: '06', rate: '4.00' }]);
  });
});

describe('migración: la marca de excluido llega a invoice_items', () => {
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20260928190000_invoice_items_marca_excluido_iva.sql'), 'utf8');
  it('plantilla IVA_EXCLUIDO y disparador BEFORE INSERT solo sobre líneas de venta', () => {
    expect(sql).toMatch(/'COL', 'IVA_EXCLUIDO', 'Excluido de IVA', 0/);
    expect(sql).toMatch(/before insert on public\.invoice_items/);
    expect(sql).toMatch(/coalesce\(NEW\.invoice_type, 'sale'\) <> 'sale'/);
    // Nunca pisa una línea gravada ni un código que ya trae la línea.
    expect(sql).toMatch(/coalesce\(NEW\.tax_rate, 0\) <> 0 or NEW\.product_id is null or NEW\.tax_code is not null/);
  });
});
