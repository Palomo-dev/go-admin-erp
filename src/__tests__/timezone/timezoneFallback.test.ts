// ============================================================
// Fase A2, punto 4 — el fallback de zona horaria deja de ser silencioso.
//
// Hoy las 85 organizaciones estan en America/Bogota: cuando la
// resolucion de zona falla, el fallback acierta de casualidad y nadie se
// entera. Estos tests fijan que:
//   - si la zona SI venia, no se avisa de nada;
//   - si no venia (o era invalida), se avisa con contexto;
//   - se avisa UNA sola vez por clave, para no inundar la consola;
//   - claves distintas (otra organizacion, otro sitio) avisan por separado;
//   - en servidor (sin window) no se rompe por intentar hablar con Sentry.
// ============================================================

import {
  avisarFallbackZonaHoraria,
  reiniciarAvisosZonaHoraria,
  resolverZonaHoraria,
} from '@/lib/utils/timezoneFallback';
import { DEFAULT_TIMEZONE } from '@/lib/utils/timezone';

describe('A2.6 — aviso del fallback de zona horaria', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    reiniciarAvisosZonaHoraria();
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('no avisa cuando la zona si venia', () => {
    const tz = resolverZonaHoraria('America/Mexico_City', {
      donde: 'reporteDeVentas',
      organizationId: 120,
    });
    expect(tz).toBe('America/Mexico_City');
    expect(warn).not.toHaveBeenCalled();
  });

  it('avisa y cae al fallback cuando no hay dato', () => {
    const tz = resolverZonaHoraria(null, { donde: 'reporteDeVentas', organizationId: 120 });
    expect(tz).toBe(DEFAULT_TIMEZONE);
    expect(warn).toHaveBeenCalledTimes(1);
    const mensaje = String(warn.mock.calls[0][0]);
    expect(mensaje).toContain('[timezone]');
    expect(mensaje).toContain(DEFAULT_TIMEZONE);
    expect(mensaje).toContain('donde=reporteDeVentas');
    expect(mensaje).toContain('organizacion=120');
    expect(mensaje).toContain('motivo=sin-dato');
  });

  it('avisa con motivo invalida cuando la zona guardada no sirve', () => {
    const tz = resolverZonaHoraria('Marte/Olympus', { donde: 'jobRenovaciones', organizationId: 7 });
    expect(tz).toBe(DEFAULT_TIMEZONE);
    expect(String(warn.mock.calls[0][0])).toContain('motivo=invalida');
    expect(String(warn.mock.calls[0][0])).toContain('valor=Marte/Olympus');
  });

  it('una cadena vacia cuenta como "sin dato"', () => {
    expect(resolverZonaHoraria('', { donde: 'x', organizationId: 1 })).toBe(DEFAULT_TIMEZONE);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('avisa una sola vez por clave aunque se llame mil veces', () => {
    for (let i = 0; i < 1000; i++) {
      resolverZonaHoraria(undefined, { donde: 'listaDeVentas', organizationId: 120 });
    }
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('organizaciones distintas avisan por separado', () => {
    resolverZonaHoraria(undefined, { donde: 'listaDeVentas', organizationId: 120 });
    resolverZonaHoraria(undefined, { donde: 'listaDeVentas', organizationId: 145 });
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('sitios distintos de la misma organizacion avisan por separado', () => {
    resolverZonaHoraria(undefined, { donde: 'listaDeVentas', organizationId: 120 });
    resolverZonaHoraria(undefined, { donde: 'cierreDeCaja', organizationId: 120 });
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('la sucursal forma parte de la clave y aparece en el mensaje', () => {
    avisarFallbackZonaHoraria({ donde: 'turnos', organizationId: 120, branchId: 3 });
    avisarFallbackZonaHoraria({ donde: 'turnos', organizationId: 120, branchId: 4 });
    expect(warn).toHaveBeenCalledTimes(2);
    expect(String(warn.mock.calls[0][0])).toContain('sucursal=3');
  });

  it('avisarFallbackZonaHoraria dice si emitio o no el aviso', () => {
    expect(avisarFallbackZonaHoraria({ donde: 'unaVez', organizationId: 9 })).toBe(true);
    expect(avisarFallbackZonaHoraria({ donde: 'unaVez', organizationId: 9 })).toBe(false);
  });

  it('funciona sin organizacion conocida', () => {
    expect(resolverZonaHoraria(undefined, { donde: 'widgetPublico' })).toBe(DEFAULT_TIMEZONE);
    expect(String(warn.mock.calls[0][0])).toContain('donde=widgetPublico');
    expect(String(warn.mock.calls[0][0])).not.toContain('organizacion=');
  });

  it('en servidor (sin window) no lanza al intentar el rastro de Sentry', () => {
    expect(typeof window).toBe('undefined');
    expect(() => avisarFallbackZonaHoraria({ donde: 'routeHandler', organizationId: 2 })).not.toThrow();
  });
});
