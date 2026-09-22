/**
 * Lector físico de códigos de barras en el POS (2026-09-21): el detector
 * distingue la ráfaga de un lector (pocos ms entre teclas + Enter) del
 * tecleo humano, para agregar el producto al carrito sin clics.
 */
import { BarcodeWedgeDetector } from '@/lib/pos/barcodeWedge';

const burst = (d: BarcodeWedgeDetector, code: string, start = 1000, gap = 5) => {
  let t = start;
  for (const ch of code) {
    d.push({ key: ch, at: t });
    t += gap;
  }
  return t;
};

describe('BarcodeWedgeDetector', () => {
  it('ráfaga rápida + Enter ⇒ escaneo con el código completo', () => {
    const d = new BarcodeWedgeDetector();
    const t = burst(d, '7702001234567');
    expect(d.push({ key: 'Enter', at: t })).toEqual({ type: 'scan', code: '7702001234567', terminator: 'Enter' });
    expect(d.pending).toBe('');
  });

  it('acepta Tab como remate y códigos alfanuméricos', () => {
    const d = new BarcodeWedgeDetector();
    const t = burst(d, 'PROD-765-UB0');
    expect(d.push({ key: 'Tab', at: t })).toEqual({ type: 'scan', code: 'PROD-765-UB0', terminator: 'Tab' });
  });

  it('tecleo humano (más de 80 ms entre teclas) + Enter ⇒ nada', () => {
    const d = new BarcodeWedgeDetector();
    const t = burst(d, '12345678', 1000, 150);
    expect(d.push({ key: 'Enter', at: t })).toEqual({ type: 'none' });
  });

  it('una pausa larga antes del Enter descarta la ráfaga (el cajero lo escribió y lo pensó)', () => {
    const d = new BarcodeWedgeDetector();
    const t = burst(d, '7702001234567');
    expect(d.push({ key: 'Enter', at: t + 500 })).toEqual({ type: 'none' });
  });

  it('la ráfaga empieza de cero tras una pausa: no arrastra lo tecleado antes', () => {
    const d = new BarcodeWedgeDetector();
    burst(d, 'silla', 0, 200); // búsqueda escrita a mano
    const t = burst(d, '7702001234567', 5000);
    expect(d.push({ key: 'Enter', at: t })).toEqual({ type: 'scan', code: '7702001234567', terminator: 'Enter' });
  });

  it('ráfagas cortas (< 4) no cuentan: Enter en un campo de cantidad', () => {
    const d = new BarcodeWedgeDetector();
    const t = burst(d, '12');
    expect(d.push({ key: 'Enter', at: t })).toEqual({ type: 'none' });
  });

  it('Shift y flechas no rompen la ráfaga; Ctrl/Alt/Meta la anulan', () => {
    const d = new BarcodeWedgeDetector();
    d.push({ key: 'Shift', at: 1000 });
    const t = burst(d, 'ABC1234', 1001);
    d.push({ key: 'ArrowLeft', at: t });
    expect(d.push({ key: 'Enter', at: t + 1 })).toEqual({ type: 'scan', code: 'ABC1234', terminator: 'Enter' });

    const t2 = burst(d, '7702001234567', 5000);
    d.push({ key: 'a', at: t2, withModifier: true });
    expect(d.push({ key: 'Enter', at: t2 + 1 })).toEqual({ type: 'none' });
  });

  it('sin remate: una ráfaga larga se cierra por silencio; una corta no', () => {
    const d = new BarcodeWedgeDetector();
    const t = burst(d, '7702001234567');
    expect(d.flushIdle(t + 50)).toBeNull(); // aún no ha pasado el silencio
    expect(d.flushIdle(t + 200)).toBe('7702001234567');
    expect(d.flushIdle(t + 400)).toBeNull(); // ya consumido

    const t2 = burst(d, '12345', 9000);
    expect(d.flushIdle(t2 + 200)).toBeNull(); // 5 < idleMinLength
  });
});
