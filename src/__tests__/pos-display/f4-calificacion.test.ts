/**
 * Fase 4 · calificación del cliente, del botón a la caja (PLAN §4.2 y §4.4).
 *
 * Reparto de responsabilidades que se prueba aquí:
 * - la PANTALLA solo avisa (`UpMessage` `rating`) y no manda id de venta;
 * - el EMISOR decide si se pregunta (ajuste `rating.enabled`) y recuerda qué
 *   venta se está agradeciendo;
 * - la CAJA registra, una sola vez por venta, con `sendDisplayRating`.
 *
 * También los tres ajustes que la pantalla empezó a consumir en esta fase:
 * desglose de impuestos, idioma (importes) y nombre del cliente.
 */

import { DisplayEmitter } from '@/lib/pos/display/emitter';
import { isUpMessage, type DisplayPresentationSettings, type UpMessage } from '@/lib/pos/display/protocol';
import { projectCartForDisplay } from '@/lib/pos/display/projection';
import { _resetDisplayRatingMemory, sendDisplayRating } from '@/lib/pos/display/feedback';
import { formatDisplayMoney, resolveDisplayLocaleTag, resolveTaxRowKind, sanitizeDisplayCart, taxLabelKind } from '@/components/pos-display/logic';
import type { Cart } from '@/components/pos/types';

const SALE = '11111111-2222-4333-8444-555555555555';

function settings(overrides: Partial<DisplayPresentationSettings> = {}): DisplayPresentationSettings {
  return {
    tips: { enabled: false, presets: [5, 10, 15], allowCustom: true },
    rating: { enabled: false },
    showTaxBreakdown: false,
    showCustomerName: false,
    locale: null,
    touch: 'auto',
    idle: { mode: 'brand', mediaUrls: [], idleAfterSeconds: 90 },
    ...overrides,
  };
}

/** Emisor con transporte de mentira: solo interesa el estado que construye. */
function emitter(presentation: DisplayPresentationSettings) {
  const e = new DisplayEmitter({
    createTransport: () => null,
    isEnabled: () => true,
    getSettings: () => presentation,
  });
  e.start({ organizationId: 120, currency: 'COP' });
  return e;
}

describe('F4 · quién decide que se pregunte', () => {
  it('con el ajuste apagado, «Gracias» no pide calificación', () => {
    const e = emitter(settings());
    e.setMode('thanks', { total: 10_000, saleId: SALE });
    expect(e.getState().thanks).toEqual({ total: 10_000, askRating: false });
  });

  it('con el ajuste encendido la pide sin que CheckoutDialog tenga que saberlo', () => {
    const e = emitter(settings({ rating: { enabled: true } }));
    e.setMode('thanks', { total: 10_000, saleId: SALE });
    expect(e.getState().thanks).toEqual({ total: 10_000, askRating: true, id: expect.any(String) });
  });

  it('quien confirma la venta puede decir lo contrario explícitamente', () => {
    const e = emitter(settings({ rating: { enabled: true } }));
    e.setMode('thanks', { total: 1, askRating: false, saleId: SALE });
    expect(e.getState().thanks?.askRating).toBe(false);
  });
});

describe('F4 · la venta la pone la caja, nunca el cable', () => {
  it('el emisor recuerda la venta que se está agradeciendo', () => {
    const e = emitter(settings({ rating: { enabled: true } }));
    expect(e.ratingSaleId).toBeNull();
    e.setMode('thanks', { total: 10_000, saleId: SALE });
    expect(e.ratingSaleId).toBe(SALE);
  });

  it('al salir de «Gracias» se olvida: una calificación tardía no se cuelga de la venta siguiente', () => {
    const e = emitter(settings({ rating: { enabled: true } }));
    e.setMode('thanks', { total: 10_000, saleId: SALE });
    e.setMode('order');
    expect(e.ratingSaleId).toBeNull();
  });

  it('una venta sin id (venta a crédito) deja el recuerdo en null y la fila se guarda sin venta', () => {
    const e = emitter(settings({ rating: { enabled: true } }));
    e.setMode('thanks', { total: 10_000 });
    expect(e.ratingSaleId).toBeNull();
  });

  it('el mensaje de subida que manda la pantalla es válido y viaja SIN venta', () => {
    const msg: UpMessage = { v: 1, terminalId: 't1', t: 'rating', saleId: null, rating: 4 };
    expect(isUpMessage(msg)).toBe(true);
    // Y uno con una venta inventada también es «válido» de forma: por eso la
    // caja usa su propio recuerdo y no este campo.
    expect(isUpMessage({ ...msg, saleId: 'venta-de-otro' })).toBe(true);
    expect(isUpMessage({ ...msg, rating: 0 })).toBe(false);
    expect(isUpMessage({ ...msg, rating: 6 })).toBe(false);
    expect(isUpMessage({ ...msg, rating: 4.5 })).toBe(false);
  });
});

describe('F4 · la caja registra una sola vez por venta', () => {
  beforeEach(() => _resetDisplayRatingMemory());

  it('la segunda pulsación de la misma venta no llega ni a llamar al servidor', async () => {
    const fetchMock = jest.fn(async () => ({ ok: true, status: 200 }) as Response);
    const first = await sendDisplayRating({ terminalId: 't1', saleId: SALE, rating: 5 }, fetchMock as unknown as typeof fetch);
    const second = await sendDisplayRating({ terminalId: 't1', saleId: SALE, rating: 1 }, fetchMock as unknown as typeof fetch);
    expect(first).toEqual({ ok: true, alreadySent: false });
    expect(second).toEqual({ ok: true, alreadySent: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ terminalId: 't1', saleId: SALE, rating: 5 });
  });

  it('otra venta sí vuelve a llamar', async () => {
    const fetchMock = jest.fn(async () => ({ ok: true, status: 200 }) as Response);
    await sendDisplayRating({ terminalId: 't1', saleId: SALE, rating: 5 }, fetchMock as unknown as typeof fetch);
    await sendDisplayRating({ terminalId: 't1', saleId: 'otra-venta', rating: 5 }, fetchMock as unknown as typeof fetch);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('un fallo NO se recuerda: si el cliente vuelve a pulsar, se reintenta', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    const failed = await sendDisplayRating({ terminalId: 't1', saleId: SALE, rating: 5 }, fetchMock as unknown as typeof fetch);
    expect(failed).toEqual({ ok: false, alreadySent: false });
    const retried = await sendDisplayRating({ terminalId: 't1', saleId: SALE, rating: 5 }, fetchMock as unknown as typeof fetch);
    expect(retried).toEqual({ ok: true, alreadySent: false });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('una red caída no rompe la caja', async () => {
    const fetchMock = jest.fn(async () => {
      throw new Error('sin red');
    });
    await expect(sendDisplayRating({ terminalId: 't1', saleId: SALE, rating: 5 }, fetchMock as unknown as typeof fetch)).resolves.toEqual({
      ok: false,
      alreadySent: false,
    });
  });

  it('una calificación fuera de rango no se manda', async () => {
    const fetchMock = jest.fn();
    await sendDisplayRating({ terminalId: 't1', saleId: SALE, rating: 9 as unknown as 5 }, fetchMock as unknown as typeof fetch);
    await sendDisplayRating({ terminalId: '', saleId: SALE, rating: 5 }, fetchMock as unknown as typeof fetch);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('F4 · desglose de impuestos (ajuste showTaxBreakdown)', () => {
  const included = { taxTotal: 1900, taxIncluded: true, lines: [{ taxExcluded: false, taxIncluded: true }] } as never;
  const added = { taxTotal: 1900, taxIncluded: false, lines: [{ taxExcluded: false, taxIncluded: false }] } as never;

  it('impuesto INCLUIDO y desglose apagado: solo la etiqueta, sin importe', () => {
    expect(resolveTaxRowKind(taxLabelKind(included), false)).toBe('label');
  });

  it('impuesto INCLUIDO y desglose encendido: también el importe, como en el recibo', () => {
    expect(resolveTaxRowKind(taxLabelKind(included), true)).toBe('amount');
  });

  it('impuesto SUMADO: el importe se muestra siempre, o subtotal + nada no daría el total', () => {
    expect(resolveTaxRowKind(taxLabelKind(added), false)).toBe('amount');
    expect(resolveTaxRowKind(taxLabelKind(added), true)).toBe('amount');
  });

  it('sin impuesto no hay fila que pintar', () => {
    expect(resolveTaxRowKind('none', true)).toBe('none');
  });
});

describe('F4 · idioma de los importes (ajuste locale)', () => {
  it('el ajuste manda; si no dice nada, el idioma en el que está pintando la pantalla', () => {
    expect(resolveDisplayLocaleTag('en-US', 'es')).toBe('en-US');
    expect(resolveDisplayLocaleTag(null, 'en')).toBe('en-US');
    expect(resolveDisplayLocaleTag(null, 'es')).toBe('es-CO');
    expect(resolveDisplayLocaleTag('pt', null)).toBe('pt-BR');
    expect(resolveDisplayLocaleTag(null, null)).toBe('es-CO');
    expect(resolveDisplayLocaleTag('no es un idioma!', null)).toBe('es-CO');
  });

  it('el mismo importe se lee distinto en cada idioma, y la moneda no cambia', () => {
    const co = formatDisplayMoney(1234.5, 'COP', 'es-CO');
    const us = formatDisplayMoney(1234.5, 'COP', 'en-US');
    expect(co).not.toBe(us);
    expect(co).toContain('1.234,50');
    expect(us).toContain('1,234.50');
  });

  it('lo que no es un número finito se pinta «—», nunca $ 0,00', () => {
    for (const value of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY, 'x', {}]) {
      expect(formatDisplayMoney(value, 'COP', 'es-CO')).toBe('—');
    }
  });

  it('una etiqueta o una moneda que Intl no conoce no rompe la pantalla', () => {
    expect(formatDisplayMoney(10, 'XXXXX', 'es-CO')).toBe('XXXXX 10.00');
    expect(formatDisplayMoney(10, 'COP', 'xx-YY-zz-ww')).toMatch(/10/);
  });
});

describe('F4 · nombre del cliente (ajuste showCustomerName)', () => {
  const cart = (customer: unknown): Cart =>
    ({
      id: 'c1',
      organization_id: 120,
      branch_id: 7,
      status: 'active',
      items: [],
      subtotal: 0,
      tax_amount: 0,
      tax_total: 0,
      discount_amount: 0,
      discount_total: 0,
      total: 0,
      created_at: '',
      updated_at: '',
      customer,
    }) as unknown as Cart;

  it('viaja `full_name` y nada más: ni documento, ni teléfono, ni correo', () => {
    const projected = projectCartForDisplay(
      cart({ id: 'x', full_name: '  Ana Pérez  ', doc_number: '123', phone: '300', email: 'a@b.c' }),
      { currency: 'COP' },
    );
    expect(projected.customerName).toBe('Ana Pérez');
    expect(JSON.stringify(projected)).not.toMatch(/123|300|a@b\.c/);
  });

  it('venta anónima o nombre vacío → null', () => {
    expect(projectCartForDisplay(cart(undefined), { currency: 'COP' }).customerName).toBeNull();
    expect(projectCartForDisplay(cart({ full_name: '   ' }), { currency: 'COP' }).customerName).toBeNull();
    expect(projectCartForDisplay(cart({ full_name: 42 }), { currency: 'COP' }).customerName).toBeNull();
  });

  it('con el ajuste apagado el nombre NO viaja: se corta en el emisor, no al pintar', () => {
    // «Privacidad primero» (PLAN §5.2): si el filtro viviera solo en la
    // pantalla, el nombre seguiría cruzando el canal remoto de una tableta y
    // se vería en sus herramientas de desarrollo.
    expect(projectCartForDisplay(cart({ full_name: 'Ana Pérez' }), { currency: 'COP', includeCustomerName: false }).customerName).toBeNull();
    expect(projectCartForDisplay(cart({ full_name: 'Ana Pérez' }), { currency: 'COP', includeCustomerName: true }).customerName).toBe('Ana Pérez');
    // Sin la opción (llamadores anteriores) se conserva el comportamiento.
    expect(projectCartForDisplay(cart({ full_name: 'Ana Pérez' }), { currency: 'COP' }).customerName).toBe('Ana Pérez');
  });

  it('la pantalla lo sanea al recibirlo (un emisor anterior no lo manda)', () => {
    const base = {
      id: 'c1',
      currency: 'COP',
      lines: [{ id: 'l1', name: 'x', qty: 1, unitPrice: 1000, total: 1000 }],
      subtotal: 1000,
      total: 1000,
    };
    expect(sanitizeDisplayCart(base)?.customerName).toBeNull();
    expect(sanitizeDisplayCart({ ...base, customerName: 99 })?.customerName).toBeNull();
    expect(sanitizeDisplayCart({ ...base, customerName: ' Ana ' })?.customerName).toBe('Ana');
  });
});
