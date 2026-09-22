/**
 * Fase 4 · modo reposo de la pantalla del cliente (PLAN §5.2 y §4.2).
 *
 * Se prueba la lógica pura de `src/components/pos-display/idle.ts` y el
 * saneado de la cartelera (`lib/pos/display/promotions.ts`): qué se pinta,
 * cuándo entra el reposo, cómo rota y cuándo cae a la marca. La rotación se
 * mide con temporizadores falsos, que es la única forma de ver ocho segundos
 * sin esperarlos.
 */

import {
  DEFAULT_IDLE_AFTER_SECONDS,
  IDLE_AFTER_SECONDS_MAX,
  IDLE_AFTER_SECONDS_MIN,
  IDLE_FADE_MS,
  IDLE_SLIDE_MS,
  idleSlideIndex,
  isIdleSettled,
  resolveIdleContent,
  sanitizeIdleSettings,
} from '@/components/pos-display/idle';
import {
  DISPLAY_PROMOTIONS_MAX,
  PROMOTION_DESCRIPTION_MAX_CHARS,
  sanitizeDisplayPromotions,
  shortenDescription,
  toDisplayPromotion,
} from '@/lib/pos/display/promotions';
import { buildPromotionsRequest, readPromotionsPayload } from '@/components/pos-display/useIdlePromotions';

describe('F4 · ajustes de reposo: degradan campo a campo, nunca lanzan', () => {
  it('sin ajustes (emisor de las fases 0-3): la marca de siempre a los 90 s', () => {
    for (const raw of [undefined, null, 'brand', 7, [], new Date()]) {
      expect(sanitizeIdleSettings(raw)).toEqual({ mode: 'brand', mediaUrls: [], idleAfterSeconds: DEFAULT_IDLE_AFTER_SECONDS });
    }
  });

  it('un modo inventado cae a brand sin arrastrar al resto', () => {
    expect(sanitizeIdleSettings({ mode: 'video', mediaUrls: ['https://x.test/a.png'], idleAfterSeconds: 30 })).toEqual({
      mode: 'brand',
      mediaUrls: ['https://x.test/a.png'],
      idleAfterSeconds: 30,
    });
  });

  it('las URLs se filtran una a una: solo http(s) absolutas y sin blancos', () => {
    const { mediaUrls } = sanitizeIdleSettings({
      mode: 'media',
      mediaUrls: [
        'https://x.test/a.png',
        '  https://x.test/b.png  ',
        'javascript:alert(1)',
        'data:image/png;base64,AAAA',
        '/relativa.png',
        'https://x.test/a b.png',
        42,
        null,
      ],
    });
    expect(mediaUrls).toEqual(['https://x.test/a.png', 'https://x.test/b.png']);
  });

  it('el tiempo hasta reposo se acota a los límites de la tarjeta', () => {
    expect(sanitizeIdleSettings({ idleAfterSeconds: 1 }).idleAfterSeconds).toBe(IDLE_AFTER_SECONDS_MIN);
    expect(sanitizeIdleSettings({ idleAfterSeconds: 99_999 }).idleAfterSeconds).toBe(IDLE_AFTER_SECONDS_MAX);
    expect(sanitizeIdleSettings({ idleAfterSeconds: 12.5 }).idleAfterSeconds).toBe(DEFAULT_IDLE_AFTER_SECONDS);
    expect(sanitizeIdleSettings({ idleAfterSeconds: '30' }).idleAfterSeconds).toBe(DEFAULT_IDLE_AFTER_SECONDS);
  });
});

describe('F4 · qué pinta el reposo (y cuándo cae a la marca)', () => {
  it('antes de cumplirse el tiempo sin actividad siempre es la marca', () => {
    expect(resolveIdleContent({ mode: 'promotions', promotions: 3, media: 0, settled: false })).toBe('brand');
    expect(resolveIdleContent({ mode: 'media', promotions: 0, media: 3, settled: false })).toBe('brand');
  });

  it('cumplido el tiempo, el modo elegido… si hay algo que rotar', () => {
    expect(resolveIdleContent({ mode: 'promotions', promotions: 1, media: 0, settled: true })).toBe('promotions');
    expect(resolveIdleContent({ mode: 'media', promotions: 0, media: 1, settled: true })).toBe('media');
  });

  it('sin promociones o sin imágenes cae a la marca: nunca una pantalla en negro', () => {
    expect(resolveIdleContent({ mode: 'promotions', promotions: 0, media: 9, settled: true })).toBe('brand');
    expect(resolveIdleContent({ mode: 'media', promotions: 9, media: 0, settled: true })).toBe('brand');
    expect(resolveIdleContent({ mode: 'brand', promotions: 9, media: 9, settled: true })).toBe('brand');
  });

  it('el reposo entra al cumplirse idleAfterSeconds, no antes', () => {
    const since = 1_000_000;
    expect(isIdleSettled(since, since + 89_999, 90)).toBe(false);
    expect(isIdleSettled(since, since + 90_000, 90)).toBe(true);
    // Sin estado neutro no hay reposo por mucho que pase el tiempo.
    expect(isIdleSettled(null, since + 10 * 90_000, 90)).toBe(false);
  });
});

describe('F4 · rotación: 8 s por lámina, fundido de 300 ms, derivada del reloj', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('el fundido no pasa de los 300 ms que admite el PLAN §4.1', () => {
    expect(IDLE_FADE_MS).toBeLessThanOrEqual(300);
    expect(IDLE_SLIDE_MS).toBe(8_000);
  });

  it('con tres láminas se recorren en orden y vuelven a empezar', () => {
    const start = Date.now();
    const seen: number[] = [];
    const timer = setInterval(() => seen.push(idleSlideIndex(Date.now() - start, 3)), IDLE_SLIDE_MS);
    jest.advanceTimersByTime(IDLE_SLIDE_MS * 6);
    clearInterval(timer);
    expect(seen).toEqual([1, 2, 0, 1, 2, 0]);
  });

  it('una pestaña dormida retoma en la lámina que TOCA, no en la siguiente a la última pintada', () => {
    // El navegador no entregó los intervalos durante 40 s (5 láminas).
    expect(idleSlideIndex(IDLE_SLIDE_MS * 5 + 10, 3)).toBe(2);
    expect(idleSlideIndex(IDLE_SLIDE_MS * 5 + 10, 3)).toBe(idleSlideIndex(40_010, 3));
  });

  it('una sola lámina se queda quieta y cero láminas no rompe el índice', () => {
    expect(idleSlideIndex(IDLE_SLIDE_MS * 99, 1)).toBe(0);
    expect(idleSlideIndex(IDLE_SLIDE_MS, 0)).toBe(0);
    expect(idleSlideIndex(Number.NaN, 3)).toBe(0);
    expect(idleSlideIndex(-5, 3)).toBe(0);
  });
});

describe('F4 · cartelera de promociones: solo lo que se pinta', () => {
  it('una fila de promotions se proyecta a nombre, descripción corta y vigencia', () => {
    expect(
      toDisplayPromotion({
        id: 'p1',
        name: '  2x1 en café  ',
        description: '  Solo los martes\n  hasta agotar existencias  ',
        end_date: '2026-10-31T23:59:59-05:00',
        discount_value: 50,
        promotion_type: 'percentage',
      }),
    ).toEqual({
      id: 'p1',
      name: '2x1 en café',
      description: 'Solo los martes hasta agotar existencias',
      endsAt: '2026-10-31T23:59:59-05:00',
    });
  });

  it('ni importes ni reglas viajan a la pantalla: el cartel no calcula descuentos', () => {
    const projected = toDisplayPromotion({ id: 'p1', name: 'x', discount_value: 50, max_discount_amount: 1000, buy_quantity: 2 });
    expect(Object.keys(projected ?? {}).sort()).toEqual(['description', 'endsAt', 'id', 'name']);
  });

  it('sin id o sin nombre no hay cartel', () => {
    expect(toDisplayPromotion({ name: 'sin id' })).toBeNull();
    expect(toDisplayPromotion({ id: 'p1', name: '   ' })).toBeNull();
    expect(toDisplayPromotion('promoción')).toBeNull();
  });

  it('la descripción se recorta sin partir palabras', () => {
    const largo = 'palabra '.repeat(40).trim();
    const corta = shortenDescription(largo);
    expect(corta).not.toBeNull();
    expect(corta!.length).toBeLessThanOrEqual(PROMOTION_DESCRIPTION_MAX_CHARS + 1);
    expect(corta!.endsWith('…')).toBe(true);
    expect(corta).not.toMatch(/palabr…$/);
    expect(shortenDescription('corta')).toBe('corta');
    expect(shortenDescription('   ')).toBeNull();
  });

  it('la lista se sanea y se recorta al máximo que la pantalla rota', () => {
    const muchas = Array.from({ length: DISPLAY_PROMOTIONS_MAX + 5 }, (_, i) => ({ id: `p${i}`, name: `Promo ${i}` }));
    expect(sanitizeDisplayPromotions([...muchas, null, 'x', { name: 'sin id' }])).toHaveLength(DISPLAY_PROMOTIONS_MAX);
    expect(sanitizeDisplayPromotions('nada')).toEqual([]);
  });
});

describe('F4 · cómo pide la pantalla su cartelera', () => {
  it('emparejada manda el token; local, el terminalId (la sesión va en las cookies)', () => {
    expect(buildPromotionsRequest('term-1', 'tok-1')).toEqual({ url: '/api/pos/display/promotions', headers: { authorization: 'Bearer tok-1' } });
    expect(buildPromotionsRequest('term-1', null)).toEqual({ url: '/api/pos/display/promotions?terminalId=term-1', headers: {} });
    expect(buildPromotionsRequest(null, null)).toBeNull();
  });

  it('una respuesta con otra forma no rompe el reposo: lista vacía y a la marca', () => {
    expect(readPromotionsPayload({ data: { promotions: [{ id: 'p1', name: 'Promo' }] } })).toEqual([
      { id: 'p1', name: 'Promo', description: null, endsAt: null },
    ]);
    for (const payload of [null, undefined, 'x', {}, { data: null }, { data: { promotions: 'x' } }]) {
      expect(readPromotionsPayload(payload)).toEqual([]);
    }
  });
});
