/// <reference types="jest" />
/**
 * F10 — eventos de Stripe → registro de pago. Puro: la organización sale de la
 * metadata de la sesión (que puso la plataforma al crear el enlace), el importe
 * de `amount_total` en unidades menores (con monedas sin decimales), y la clave
 * de idempotencia es `stripe:<event.id>`.
 */
import { parseStripeCheckoutEvent, toRegisterPaymentInput, minorToMajor, majorToMinor } from '@/lib/services/crm/paymentEvents';

function ev(overrides: Record<string, unknown> = {}, objOverrides: Record<string, unknown> = {}) {
  return {
    id: 'evt_1',
    type: 'checkout.session.completed',
    livemode: false,
    data: {
      object: {
        id: 'cs_1',
        object: 'checkout.session',
        payment_status: 'paid',
        amount_total: 680000000,
        currency: 'cop',
        payment_intent: 'pi_1',
        metadata: { organization_id: '120', quotation_id: 'q-1', invoice_id: 'inv-1' },
        ...objOverrides,
      },
    },
    ...overrides,
  };
}

describe('F10 paymentEvents — parseStripeCheckoutEvent', () => {
  it('extrae organización, cotización, factura, importe en unidades mayores y clave de idempotencia', () => {
    const r = parseStripeCheckoutEvent(ev());
    expect(r).toEqual({
      ok: true,
      payment: {
        eventId: 'evt_1',
        organizationId: 120,
        quotationId: 'q-1',
        invoiceId: 'inv-1',
        amount: 6800000,
        currency: 'COP',
        sessionId: 'cs_1',
        paymentIntentId: 'pi_1',
        paymentLinkId: null,
        idempotencyKey: 'stripe:evt_1',
        livemode: false,
      },
    });
  });

  it('monedas sin decimales (JPY, CLP) no se dividen entre 100; USD sí', () => {
    expect(minorToMajor(1500, 'jpy')).toBe(1500);
    expect(minorToMajor(1500, 'clp')).toBe(1500);
    expect(minorToMajor(1500, 'usd')).toBe(15);
    expect(majorToMinor(15.5, 'usd')).toBe(1550);
    expect(majorToMinor(1500, 'clp')).toBe(1500);
    expect(majorToMinor(0.001, 'usd')).toBe(0);
  });

  // de tester r1 (A8/A9): redondeo a la unidad menor y monedas de tres decimales de Stripe
  it('A8/A9 majorToMinor redondea (12.345 USD → 1235); KWD/BHD/JOD/OMR/TND se dividen y multiplican por 1000, ida y vuelta', () => {
    expect(majorToMinor(12.345, 'USD')).toBe(1235);
    expect(majorToMinor(5000, 'JPY')).toBe(5000);
    // Stripe: 1 KWD = 1000 fils → amount_total 5000 = 5 KWD
    expect(minorToMajor(5000, 'kwd')).toBe(5);
    for (const c of ['BHD', 'jod', 'OMR', 'tnd']) expect(minorToMajor(1500, c)).toBe(1.5);
    expect(majorToMinor(5, 'KWD')).toBe(5000);
    expect(majorToMinor(1.2345, 'bhd')).toBe(1235);
  });

  it.each([
    ['tipo distinto', ev({ type: 'payment_intent.succeeded' })],
    ['sesión sin pagar', ev({}, { payment_status: 'unpaid' })],
    ['sin organización en metadata', ev({}, { metadata: { quotation_id: 'q-1' } })],
    ['organización no numérica', ev({}, { metadata: { organization_id: 'abc', quotation_id: 'q-1' } })],
    ['organización 0', ev({}, { metadata: { organization_id: '0', quotation_id: 'q-1' } })],
    ['sin cotización', ev({}, { metadata: { organization_id: '120' } })],
    ['importe 0', ev({}, { amount_total: 0 })],
    ['importe negativo', ev({}, { amount_total: -5 })],
    ['importe no entero', ev({}, { amount_total: 12.5 })],
    ['sin moneda', ev({}, { currency: null })],
    ['sin id de evento', ev({ id: '' })],
    ['payload nulo', null],
    ['payload string', 'x'],
  ])('rechaza: %s', (_label, payload) => {
    const r = parseStripeCheckoutEvent(payload as never);
    expect(r.ok).toBe(false);
  });

  it('la clave de idempotencia depende solo del event.id (un reenvío da la misma clave)', () => {
    const a = parseStripeCheckoutEvent(ev());
    const b = parseStripeCheckoutEvent(ev({}, { amount_total: 1 }));
    expect(a.ok && b.ok && a.payment.idempotencyKey === b.payment.idempotencyKey).toBe(true);
  });
});

describe('F10 paymentEvents — toRegisterPaymentInput', () => {
  it('produce el input de paymentService: source invoice_sales, status completed lo pone el servicio, referencia = clave', () => {
    const r = parseStripeCheckoutEvent(ev());
    if (!r.ok) throw new Error('esperaba ok');
    const input = toRegisterPaymentInput(r.payment, 'inv-1', '2026-09-15T10:00:00.000Z');
    expect(input).toEqual({
      invoice_id: 'inv-1',
      amount: 6800000,
      currency: 'COP',
      method: 'stripe',
      reference: 'stripe:evt_1',
      payment_date: '2026-09-15T10:00:00.000Z',
      processor_response: { provider: 'stripe', event_id: 'evt_1', session_id: 'cs_1', payment_intent_id: 'pi_1', livemode: false },
      created_by: null,
      branch_id: null,
    });
  });
});
