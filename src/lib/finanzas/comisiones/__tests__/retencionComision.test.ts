import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  retencionArt383,
  retencionComision,
  tieneDatosTributarios,
  TOPE_ANUAL_UVT,
  UVT_2026,
  UvtNoConfiguradaError,
  uvtDelAnio,
} from '../retencionComision';

const NAT = { tipoPersona: 'natural' as const };

describe('retención sobre comisiones (art. 392 / 383 ET)', () => {
  test('sin base mínima: persona natural 10 %', () => {
    expect(retencionComision(19500, NAT)).toBe(1950);
    expect(retencionComision(100, { tipoPersona: 'natural' })).toBe(10);
  });
  test('sin datos tributarios del tercero: null (cola), como el SQL (QA ROJO N4)', () => {
    expect(retencionComision(19500, null)).toBeNull();
    expect(retencionComision(19500, {})).toBeNull();
    expect(retencionComision(19500, { tipoPersona: null, retencionTarifa: null, aplicaArt383: null })).toBeNull();
    expect(tieneDatosTributarios({ aplicaArt383: false })).toBe(true);
    expect(retencionComision(0, null)).toBe(0);
  });
  test('Régimen Simple 0, jurídica 11 %', () => {
    expect(retencionComision(1_000_000, { tipoPersona: 'simple', retencionTarifa: 10 })).toBe(0);
    expect(retencionComision(1_000_000, { tipoPersona: 'juridica' })).toBe(110000);
  });
  test('natural pasa a 11 % al superar 3.300 UVT en el año ($172.834.200)', () => {
    expect(TOPE_ANUAL_UVT * UVT_2026).toBe(172834200);
    expect(retencionComision(1_000_000, NAT, 171_834_200)).toBe(100000);
    expect(retencionComision(1_000_000, NAT, 171_834_201)).toBe(110000);
  });
  test('la tarifa del vendedor es editable y manda', () => {
    expect(retencionComision(1_000_000, { tipoPersona: 'juridica', retencionTarifa: 4 })).toBe(40000);
    expect(retencionComision(1_000_000, { retencionTarifa: 0 })).toBe(0);
  });
  test('art. 383 si el vendedor lo certifica', () => {
    expect(retencionArt383(95 * UVT_2026)).toBe(0);
    expect(retencionArt383(150 * UVT_2026)).toBe(Math.round(55 * 0.19 * UVT_2026));
    expect(retencionArt383(360 * UVT_2026)).toBe(Math.round(68.8 * UVT_2026));
    expect(retencionComision(3_000_000, { aplicaArt383: true })).toBe(0);
    expect(retencionComision(10_000_000, { aplicaArt383: true })).toBe(retencionArt383(10_000_000));
  });
  test('art. 383 sobre el acumulado del mes menos lo ya retenido (QA ROJO N4)', () => {
    const v = { tipoPersona: 'natural' as const, aplicaArt383: true };
    // 3 comisiones de 4M en el mes: individualmente 0, acumuladas 12M sí retienen.
    const r1 = retencionComision(4_000_000, v, 0, null, 2026, { base: 0, retenido: 0 })!;
    const r2 = retencionComision(4_000_000, v, 0, null, 2026, { base: 4_000_000, retenido: r1 })!;
    const r3 = retencionComision(4_000_000, v, 0, null, 2026, { base: 8_000_000, retenido: r1 + r2 })!;
    expect(r1).toBe(0);
    expect(r1 + r2 + r3).toBe(retencionArt383(12_000_000));
    expect(r3).toBeGreaterThan(0);
    // nunca negativa si ya se retuvo de más
    expect(retencionComision(1_000, v, 0, null, 2026, { base: 0, retenido: 999_999 })).toBe(0);
  });
  test('valor del contrato > 3.300 UVT: natural al 11 %', () => {
    expect(retencionComision(1_000_000, { ...NAT, valorContrato: 172_834_201 })).toBe(110000);
    expect(retencionComision(1_000_000, { ...NAT, valorContrato: 172_834_200 })).toBe(100000);
  });
  test('el SQL (134130) usa la misma tabla, UVT y tope', () => {
    const dir = join(process.cwd(), 'supabase/migrations');
    const f = readdirSync(dir).find((n) => n.startsWith('20261025134130_'))!;
    const sql = readFileSync(join(dir, f), 'utf8');
    // AJUSTE B1: UVT por año (fiscal_uvt / fn_uvt), no fija.
    expect(sql).toMatch(/p_uvt numeric default null/);
    expect(sql).toMatch(/fn_uvt\(extract\(year from/);
    // N8: año exacto, sin caer al último año
    expect(sql).toMatch(/u\.year = p_anio/);
    expect(sql).toMatch(/3300 \* v_uvt/);
    for (const t of ['(u - 95) * 0.19', '(u - 150) * 0.28 + 10', '(u - 360) * 0.33 + 69', '(u - 640) * 0.35 + 162', '(u - 945) * 0.37 + 268', '(u - 2300) * 0.39 + 770']) {
      expect(sql).toContain(t);
    }
    expect(sql).toMatch(/'simple' then return 0/);
    expect(sql).toMatch(/p_monto \* 11 \/ 100\.0/);
  });
  test('UVT por año (AJUSTE B1)', () => {
    expect(uvtDelAnio(2025)).toBe(49799);
    expect(uvtDelAnio(2026)).toBe(52374);
    // QA ROJO N8: sin UVT del año no se usa la de otro año
    expect(() => uvtDelAnio(2027)).toThrow(UvtNoConfiguradaError);
    expect(() => retencionComision(1_000_000, NAT, 0, null, 2027)).toThrow('uvt_no_configurada COL/2027');
    // tope 3.300 UVT de 2025 = 164.336.700
    expect(retencionComision(1_000_000, NAT, 163_336_700, null, 2025)).toBe(100000);
    expect(retencionComision(1_000_000, NAT, 163_336_701, null, 2025)).toBe(110000);
  });
});
