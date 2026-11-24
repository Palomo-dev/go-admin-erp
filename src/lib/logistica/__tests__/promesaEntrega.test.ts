/**
 * Promesa de entrega en minutos, horas o días (2026-11-23): un envío nacional promete días
 * («3–15 días») y nunca «Llega hoy». Contrato compartido con la tienda (cotizacion.ts).
 */
import { llegaHoy, minutosDeValor, promesaEntrega, unidadDePromesa, valorEnUnidad, type CotizacionEnvio } from '../cotizacion';
import { textoPromesa } from '../presentacionEnvio';

const zona = (min: number | null, max: number | null, texto: string | null = null) => ({
  promise_min_minutes: min,
  promise_max_minutes: max,
  promise_text: texto,
});
const DIA = 1440;

describe('promesa de entrega', () => {
  it('elige la unidad por el valor más largo', () => {
    expect(unidadDePromesa(45, 60)).toBe('minutos');
    expect(unidadDePromesa(120, 240)).toBe('horas');
    expect(unidadDePromesa(3 * DIA, 15 * DIA)).toBe('dias');
    expect(unidadDePromesa(null, null)).toBe('minutos');
  });

  it('convierte entre la unidad escrita y los minutos guardados', () => {
    expect(minutosDeValor(15, 'dias')).toBe(15 * DIA);
    expect(minutosDeValor(4, 'horas')).toBe(240);
    expect(valorEnUnidad(15 * DIA, 'dias')).toBe(15);
    expect(valorEnUnidad(null, 'dias')).toBeNull();
  });

  it('escribe minutos, horas y días', () => {
    expect(textoPromesa(zona(45, 60))).toBe('45–60 min');
    expect(textoPromesa(zona(120, 240))).toBe('2–4 horas');
    expect(textoPromesa(zona(3 * DIA, 15 * DIA))).toBe('3–15 días');
    expect(textoPromesa(zona(null, 15 * DIA))).toBe('hasta 15 días');
    expect(textoPromesa(zona(DIA, DIA))).toBe('1 día');
    expect(textoPromesa(zona(null, null, '2 a 5 días hábiles'))).toBe('2 a 5 días hábiles');
    expect(textoPromesa(zona(null, null))).toBeNull();
  });

  it('solo dice «Llega hoy» si la entrega cabe en el día', () => {
    const cot = (min: number | null, max: number | null, hoy = true, texto: string | null = null) =>
      ({ tiempo: { min_minutos: min, max_minutos: max, texto }, despacho: { fecha: '2026-11-23', hoy, corte: null, dias_reparto: [], zona_horaria: 'America/Bogota' } }) as Pick<CotizacionEnvio, 'tiempo' | 'despacho'>;
    expect(llegaHoy(cot(45, 60))).toBe(true);
    expect(llegaHoy(cot(120, 240))).toBe(true);
    expect(llegaHoy(cot(3 * DIA, 15 * DIA))).toBe(false);
    expect(llegaHoy(cot(45, 60, false))).toBe(false);
    expect(llegaHoy(cot(null, null, true, 'Mismo día'))).toBe(false);
    expect(promesaEntrega(cot(3 * DIA, 15 * DIA).tiempo)?.mismoDia).toBe(false);
  });
});

describe('ítems para la cotización (peso del pedido)', () => {
  it('suma por producto, descarta basura y limita a 200', async () => {
    const { itemsParaCotizar } = await import('../cotizacion');
    expect(itemsParaCotizar([{ product_id: 7, cantidad: 2 }, { product_id: '7', cantidad: 1 }, { product_id: 'x', cantidad: 3 }, { product_id: 9, cantidad: 0 }])).toEqual([
      { product_id: 7, cantidad: 3 },
    ]);
    expect(itemsParaCotizar(null)).toEqual([]);
    expect(itemsParaCotizar(Array.from({ length: 250 }, (_, i) => ({ product_id: i + 1, cantidad: 1 })))).toHaveLength(200);
  });
});
