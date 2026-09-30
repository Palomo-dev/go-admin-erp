/**
 * Medición del desfase contra GET /api/pos/hora-servidor (fetch simulado).
 */

import { RUTA_HORA_SERVIDOR, medirDesfase } from '@/lib/pos/reloj/desfaseReloj';

const SERVIDOR = '2026-09-30T13:00:00.000Z';

function respuesta(cuerpo: unknown, init: { ok?: boolean; date?: string } = {}): Response {
  return {
    ok: init.ok ?? true,
    json: async () => cuerpo,
    headers: { get: (h: string) => (h.toLowerCase() === 'date' ? init.date ?? null : null) },
  } as unknown as Response;
}

describe('medirDesfase', () => {
  it('pide la hora al servidor sin caché y calcula equipo − servidor', async () => {
    const llamadas: Array<[string, RequestInit | undefined]> = [];
    const relojEquipo = [Date.parse(SERVIDOR) + 7 * 60_000 - 100, Date.parse(SERVIDOR) + 7 * 60_000 + 100];
    const m = await medirDesfase(
      async (url, init) => {
        llamadas.push([url, init]);
        return respuesta({ ahora: SERVIDOR });
      },
      () => relojEquipo.shift() as number,
    );
    expect(llamadas[0][0]).toBe(RUTA_HORA_SERVIDOR);
    expect(llamadas[0][1]?.cache).toBe('no-store');
    expect(m).toEqual({ desfaseMs: 7 * 60_000, medidoEn: SERVIDOR });
  });

  it('si el cuerpo no trae la hora, usa la cabecera Date de la respuesta', async () => {
    const t = Date.parse(SERVIDOR);
    const m = await medirDesfase(async () => respuesta(null, { date: new Date(t).toUTCString() }), () => t - 3 * 60_000);
    expect(m?.desfaseMs).toBe(-3 * 60_000);
  });

  it('sin red o con error del servidor no inventa un desfase', async () => {
    await expect(medirDesfase(async () => { throw new TypeError('Failed to fetch'); })).resolves.toBeNull();
    await expect(medirDesfase(async () => respuesta({}, { ok: false }))).resolves.toBeNull();
  });
});
