import { resumenAlcances, tiempoRelativo } from '../presentacionLlaves';

describe('presentación de las llaves de API (Figma 12.9)', () => {
  it('muestra los dos primeros permisos y cuántos más', () => {
    expect(resumenAlcances(['Leer productos', 'Leer pedidos', 'Leer clientes', 'Webhooks'])).toEqual({ visibles: ['Leer productos', 'Leer pedidos'], resto: 2 });
    expect(resumenAlcances(['Leer reportes'])).toEqual({ visibles: ['Leer reportes'], resto: 0 });
  });

  it('último uso relativo en el idioma de quien mira', () => {
    const ahora = Date.parse('2026-11-14T15:00:00Z');
    expect(tiempoRelativo('2026-11-14T13:00:00Z', 'es', ahora)).toMatch(/hace 2 h/);
    expect(tiempoRelativo('2026-11-13T12:00:00Z', 'es', ahora)).toBe('ayer');
    expect(tiempoRelativo('2026-11-14T13:00:00Z', 'en', ahora)).toMatch(/2 hr/);
  });

  it('pasada una semana, o con fecha inválida, deja que la pantalla use la fecha', () => {
    const ahora = Date.parse('2026-11-14T15:00:00Z');
    expect(tiempoRelativo('2026-10-01T00:00:00Z', 'es', ahora)).toBeNull();
    expect(tiempoRelativo('no-es-fecha', 'es', ahora)).toBeNull();
  });
});
