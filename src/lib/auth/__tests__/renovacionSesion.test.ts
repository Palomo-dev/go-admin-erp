import { esperaRenovacionMs } from '../renovacionSesion';

describe('renovación de la sesión', () => {
  const MIN = 60_000;

  it('un token de 10 minutos se renueva antes de vencer, no a los 10', () => {
    const ahora = 1_000_000;
    const espera = esperaRenovacionMs(ahora + 10 * MIN, ahora);
    expect(espera).toBeGreaterThan(8 * MIN);
    expect(espera).toBeLessThan(10 * MIN);
  });

  it('un token de una hora se renueva 90 segundos antes', () => {
    const ahora = 0;
    expect(esperaRenovacionMs(60 * MIN, ahora)).toBe(60 * MIN - 90_000);
  });

  it('un token ya vencido se renueva de inmediato', () => {
    expect(esperaRenovacionMs(1_000, 2_000)).toBe(0);
  });
});
