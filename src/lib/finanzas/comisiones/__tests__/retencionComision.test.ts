import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { retencionArt383, retencionComision, TOPE_ANUAL_UVT, UVT_2026 } from '../retencionComision';

describe('retención sobre comisiones (art. 392 / 383 ET)', () => {
  test('sin base mínima: persona natural 10 %', () => {
    expect(retencionComision(19500, null)).toBe(1950);
    expect(retencionComision(100, { tipoPersona: 'natural' })).toBe(10);
  });
  test('Régimen Simple 0, jurídica 11 %', () => {
    expect(retencionComision(1_000_000, { tipoPersona: 'simple', retencionTarifa: 10 })).toBe(0);
    expect(retencionComision(1_000_000, { tipoPersona: 'juridica' })).toBe(110000);
  });
  test('natural pasa a 11 % al superar 3.300 UVT en el año ($172.834.200)', () => {
    expect(TOPE_ANUAL_UVT * UVT_2026).toBe(172834200);
    expect(retencionComision(1_000_000, null, 171_834_200)).toBe(100000);
    expect(retencionComision(1_000_000, null, 171_834_201)).toBe(110000);
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
  test('el SQL (134130) usa la misma tabla, UVT y tope', () => {
    const dir = join(process.cwd(), 'supabase/migrations');
    const f = readdirSync(dir).find((n) => n.startsWith('20261025134130_'))!;
    const sql = readFileSync(join(dir, f), 'utf8');
    expect(sql).toMatch(/p_uvt numeric default 52374/);
    expect(sql).toMatch(/3300 \* 52374/);
    for (const t of ['(u - 95) * 0.19', '(u - 150) * 0.28 + 10', '(u - 360) * 0.33 + 69', '(u - 640) * 0.35 + 162', '(u - 945) * 0.37 + 268', '(u - 2300) * 0.39 + 770']) {
      expect(sql).toContain(t);
    }
    expect(sql).toMatch(/'simple' then return 0/);
    expect(sql).toMatch(/p_monto \* 11 \/ 100\.0/);
  });
});
