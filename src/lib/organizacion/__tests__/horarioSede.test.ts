import {
  HORARIO_POR_DEFECTO,
  errorTurnos,
  esHorarioPorDefecto,
  normalizarDia,
  normalizarHorario,
  turnosDelDia,
} from '../horarioSede';
import { resumenHorario, urlPublicaSede } from '../sucursales';

describe('horario por defecto (sin revisar)', () => {
  const L = { open: '09:00', close: '18:00', closed: false };
  const sab = { open: '10:00', close: '15:00', closed: false };
  // Formas reales en la BD (MCP 2026-10-06): 69 y 7 sedes.
  const real = { monday: L, tuesday: L, wednesday: L, thursday: L, friday: L, saturday: sab, sunday: { closed: true } };

  test('detecta las formas reales y el valor del formulario', () => {
    expect(esHorarioPorDefecto(real)).toBe(true);
    expect(esHorarioPorDefecto({ ...real, sunday: { open: '09:00', close: '18:00', closed: true } })).toBe(true);
    expect(esHorarioPorDefecto(HORARIO_POR_DEFECTO)).toBe(true);
  });

  test('un horario distinto no es «por defecto»', () => {
    expect(esHorarioPorDefecto({ ...real, saturday: { open: '10:00', close: '12:00', closed: false } })).toBe(false);
    expect(esHorarioPorDefecto({ ...real, saturday: { ...sab, closed: true } })).toBe(false);
    expect(esHorarioPorDefecto({ ...real, monday: { ...L, tramos: [{ open: '09:00', close: '12:00' }, { open: '14:00', close: '18:00' }] } })).toBe(false);
    expect(esHorarioPorDefecto(null)).toBe(false);
  });
});

describe('turnos partidos', () => {
  test('normalizarDia guarda tramos ordenados y la envolvente', () => {
    expect(normalizarDia({ open: '00:00', close: '00:00', closed: false, tramos: [{ open: '19:00', close: '23:00' }, { open: '12:00', close: '15:00' }] })).toEqual({
      open: '12:00',
      close: '23:00',
      closed: false,
      tramos: [{ open: '12:00', close: '15:00' }, { open: '19:00', close: '23:00' }],
    });
  });

  test('con un solo turno queda el formato de siempre', () => {
    expect(normalizarDia({ open: '12:00', close: '22:00', closed: false, tramos: [{ open: '12:00', close: '22:00' }] })).toEqual({ open: '12:00', close: '22:00', closed: false });
    expect(normalizarDia({ closed: true } as never)).toEqual({ open: '09:00', close: '18:00', closed: true });
  });

  test('errorTurnos: solape, medianoche y vacío', () => {
    expect(errorTurnos([{ open: '12:00', close: '15:00' }, { open: '19:00', close: '23:00' }])).toBeNull();
    expect(errorTurnos([{ open: '12:00', close: '16:00' }, { open: '15:00', close: '23:00' }])).toBe('solape');
    expect(errorTurnos([{ open: '22:00', close: '02:00' }, { open: '12:00', close: '15:00' }])).toBeNull();
    expect(errorTurnos([{ open: '20:00', close: '01:00' }, { open: '21:00', close: '23:00' }])).toBe('medianoche');
    expect(errorTurnos([])).toBe('vacio');
  });

  test('normalizarHorario conserva los tramos (branchService ya no los borra)', () => {
    const h = normalizarHorario({ friday: { open: '12:00', close: '23:00', closed: false, tramos: [{ open: '12:00', close: '15:00' }, { open: '19:00', close: '23:00' }] } });
    expect(h?.friday?.tramos).toHaveLength(2);
    expect(turnosDelDia(h?.friday)).toHaveLength(2);
  });

  test('resumenHorario pinta los turnos', () => {
    const dias = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    const t = { open: '12:00', close: '23:00', tramos: [{ open: '12:00', close: '15:00' }, { open: '19:00', close: '23:00' }] };
    expect(resumenHorario({ friday: t, saturday: t }, dias)).toEqual(['Vie–Sáb 12:00–15:00 · 19:00–23:00']);
  });
});

describe('URL pública de la sede', () => {
  test('la que el sitio resuelve a la misma organización', () => {
    expect(urlPublicaSede({ custom_domain: 'norte.ejemplo.co', slug: 'norte' }, { subdominio: 'marca' })).toBe('https://norte.ejemplo.co');
    expect(urlPublicaSede({ subdomain: 'norte', slug: 'norte' }, { subdominio: 'marca' })).toBe('https://marca.goadmin.io/norte');
    expect(urlPublicaSede({ subdomain: 'norte' }, { subdominio: 'marca' })).toBeNull();
  });
});
