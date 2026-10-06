/**
 * Contraste WCAG único (Figma Sitio web A/07e: aviso de contraste y
 * «Corregir automáticamente»).
 */
import {
  ajustarHastaContraste,
  contraste,
  CONTRASTE_AA,
  formatearRazon,
  hexARgb,
  nivelContraste,
  normalizarHex,
} from '../contrasteColor';
import { contraste as contrasteDocumento } from '@/lib/documents/tema';

describe('contrasteColor', () => {
  test('lee #rgb y #rrggbb, con o sin #, y rechaza lo demás', () => {
    expect(hexARgb('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(hexARgb('C8A97E')).toEqual({ r: 200, g: 169, b: 126 });
    expect(hexARgb('rgb(0,0,0)')).toBeNull();
    expect(hexARgb(null)).toBeNull();
    expect(normalizarHex('#c8a97e')).toBe('#C8A97E');
  });

  test('negro sobre blanco es 21:1 y blanco sobre blanco 1:1', () => {
    expect(contraste('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contraste('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
    expect(contraste('#zzz', '#FFFFFF')).toBeNull();
  });

  test('el azul GO sobre el tinte no pasa AA (4,46:1) y la razón se trunca, nunca se redondea hacia arriba', () => {
    const r = contraste('#4361EE', '#EEF1FE')!;
    expect(r).toBeLessThan(CONTRASTE_AA);
    expect(formatearRazon(r)).toBe('4,4:1');
    expect(nivelContraste(r)).toBe('AA grande');
    expect(formatearRazon(7.15)).toBe('7,1:1');
  });

  test('corregir oscurece sobre fondo claro hasta cumplir AA y conserva lo que ya cumple', () => {
    const sugerido = ajustarHastaContraste('#C8A97E', '#FFFFFF')!;
    expect(contraste(sugerido, '#FFFFFF')!).toBeGreaterThanOrEqual(CONTRASTE_AA);
    expect(hexARgb(sugerido)!.r).toBeLessThan(200);
    expect(ajustarHastaContraste('#000000', '#FFFFFF')).toBe('#000000');
  });

  test('corregir aclara sobre fondo oscuro', () => {
    const sugerido = ajustarHastaContraste('#3A2E1F', '#111111')!;
    expect(contraste(sugerido, '#111111')!).toBeGreaterThanOrEqual(CONTRASTE_AA);
    expect(hexARgb(sugerido)!.r).toBeGreaterThan(0x3a);
  });

  test('los documentos delegan aquí: misma cifra', () => {
    expect(contrasteDocumento('#3651d4', '#ffffff')).toBeCloseTo(contraste('#3651d4', '#ffffff')!, 10);
  });
});
