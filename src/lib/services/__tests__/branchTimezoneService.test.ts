// ============================================================
// Fase A3 — caché de zonas por sucursal: una sola consulta, invalidada al
// guardar y al cambiar de organización, y lectura doblada mientras
// `branches.timezone` (fase A1) no exista.
// ============================================================

type Fila = { id: number; timezone?: string | null };
type Respuesta = { data: Fila[] | null; error: { code?: string; message: string } | null };

const guion: { respuestas: Respuesta[]; columnas: string[] } = { respuestas: [], columnas: [] };

jest.mock('@/lib/supabase/config', () => ({
  supabase: {
    from: () => ({
      select: (columnas: string) => {
        guion.columnas.push(columnas);
        return {
          eq: async (): Promise<Respuesta> =>
            guion.respuestas.shift() ?? { data: [], error: null },
        };
      },
    }),
  },
}));

import {
  getBranchTimezones,
  invalidateBranchTimezoneCache,
  TIMEZONES_UPDATED_EVENT,
  notifyTimezonesUpdated,
} from '@/lib/services/branchTimezoneService';

const ORG = 120;

beforeEach(() => {
  guion.respuestas = [];
  guion.columnas = [];
  invalidateBranchTimezoneCache();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('getBranchTimezones', () => {
  it('normaliza vacíos a null (heredar) y conserva los overrides', async () => {
    guion.respuestas.push({
      data: [
        { id: 1, timezone: null },
        { id: 2, timezone: '  ' },
        { id: 3, timezone: 'Europe/Madrid' },
      ],
      error: null,
    });
    await expect(getBranchTimezones(ORG)).resolves.toEqual({
      1: null,
      2: null,
      3: 'Europe/Madrid',
    });
  });

  it('consulta una sola vez: la segunda llamada sale del caché', async () => {
    guion.respuestas.push({ data: [{ id: 1, timezone: 'Europe/Madrid' }], error: null });
    await getBranchTimezones(ORG);
    await getBranchTimezones(ORG);
    expect(guion.columnas).toEqual(['id, timezone']);
  });

  it('tras invalidar, vuelve a consultar y devuelve el valor nuevo', async () => {
    guion.respuestas.push({ data: [{ id: 1, timezone: 'Europe/Madrid' }], error: null });
    expect(await getBranchTimezones(ORG)).toEqual({ 1: 'Europe/Madrid' });

    guion.respuestas.push({ data: [{ id: 1, timezone: 'America/Mexico_City' }], error: null });
    // Sin invalidar seguiría viéndose Madrid: eso es el bug que cierra el test.
    invalidateBranchTimezoneCache(ORG);
    expect(await getBranchTimezones(ORG)).toEqual({ 1: 'America/Mexico_City' });
    expect(guion.columnas).toHaveLength(2);
  });

  it('lectura doblada: sin la columna todavía (42703) nadie tiene override', async () => {
    guion.respuestas.push({ data: null, error: { code: '42703', message: 'column does not exist' } });
    guion.respuestas.push({ data: [{ id: 7 }, { id: 8 }], error: null });
    await expect(getBranchTimezones(ORG)).resolves.toEqual({ 7: null, 8: null });
    expect(guion.columnas).toEqual(['id, timezone', 'id']);
  });

  it('ante cualquier otro error devuelve un mapa vacío (se hereda) y avisa', async () => {
    guion.respuestas.push({ data: null, error: { code: '42501', message: 'permission denied' } });
    await expect(getBranchTimezones(ORG)).resolves.toEqual({});
    expect(console.warn).toHaveBeenCalled();
  });
});

describe('notifyTimezonesUpdated', () => {
  // El entorno de Jest es `node`: se dobla lo mínimo de `window` que usa el
  // servicio para comprobar que el evento sale con el nombre que el contexto
  // escucha (si el nombre cambia en un lado, este test lo caza).
  it('emite el evento que el contexto escucha para recargar', () => {
    const escucha = jest.fn();
    const dispatchEvent = jest.fn((evento: { type: string }) => {
      if (evento.type === TIMEZONES_UPDATED_EVENT) escucha();
      return true;
    });
    (globalThis as Record<string, unknown>).window = { dispatchEvent };
    (globalThis as Record<string, unknown>).CustomEvent = class {
      type: string;
      constructor(type: string) {
        this.type = type;
      }
    };
    try {
      notifyTimezonesUpdated();
    } finally {
      delete (globalThis as Record<string, unknown>).window;
      delete (globalThis as Record<string, unknown>).CustomEvent;
    }
    expect(escucha).toHaveBeenCalledTimes(1);
    expect(TIMEZONES_UPDATED_EVENT).toBe('timezones-updated');
  });

  it('fuera del navegador no lanza', () => {
    expect(() => notifyTimezonesUpdated()).not.toThrow();
  });
});
