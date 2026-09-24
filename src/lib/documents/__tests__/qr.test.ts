/**
 * El QR del motor se decodifica de verdad (jsqr) y vuelve al texto original:
 * versiones pequeñas y grandes (con bloques de alineación y de versión),
 * UTF-8 con tildes y la URL de verificación DIAN con un CUFE de 96 caracteres.
 */
import jsQR from 'jsqr';
import { codificarQr, qrSvg, QR_MAX_BYTES } from '../qr';

function decodificar(texto: string, nivel: 'L' | 'M' = 'M'): string | null {
  const { tamano, modulos } = codificarQr(texto, nivel);
  const escala = 4;
  const borde = 4;
  const lado = (tamano + borde * 2) * escala;
  const pixeles = new Uint8ClampedArray(lado * lado * 4).fill(255);
  for (let y = 0; y < tamano; y++) {
    for (let x = 0; x < tamano; x++) {
      if (!modulos[y][x]) continue;
      for (let dy = 0; dy < escala; dy++) {
        for (let dx = 0; dx < escala; dx++) {
          const px = (x + borde) * escala + dx;
          const py = (y + borde) * escala + dy;
          const i = (py * lado + px) * 4;
          pixeles[i] = 0;
          pixeles[i + 1] = 0;
          pixeles[i + 2] = 0;
        }
      }
    }
  }
  return jsQR(pixeles, lado, lado)?.data ?? null;
}

describe('qr del motor de documentos', () => {
  it.each([
    ['corto', 'FV-1042'],
    ['con tildes', 'Cotización Nº 12 · Señor Muñoz'],
    ['versión media', 'Factura de venta FV-1042\nNIT 900123456-7\n2026-09-24\nTotal 1.234.567'],
    ['CUFE DIAN', `https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=${'a1b2c3d4e5f6'.repeat(8)}`],
    ['versión ≥ 7 (bits de versión)', 'x'.repeat(200)],
    ['varios bloques', 'Documento '.repeat(40)],
  ])('%s: se decodifica al mismo texto', (_nombre, texto) => {
    expect(decodificar(texto)).toBe(texto);
  });

  it('nivel L también decodifica', () => {
    expect(decodificar('Recibo de caja RC-9', 'L')).toBe('Recibo de caja RC-9');
  });

  it('el svg es autónomo: sin URLs remotas y con título escapado', () => {
    const svg = qrSvg('hola', { titulo: '<script>' });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
    expect(svg).toContain('&lt;script&gt;');
    expect(svg).not.toContain('<script>');
  });

  it('rechaza textos más largos que el límite', () => {
    expect(() => codificarQr('x'.repeat(QR_MAX_BYTES + 1))).toThrow();
  });
});
