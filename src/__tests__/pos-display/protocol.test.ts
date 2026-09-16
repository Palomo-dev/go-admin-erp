/**
 * Type guards del protocolo caja ↔ pantalla: forma y versión.
 * La pantalla debe ignorar versiones que no conoce y payloads malformados.
 */

import { PROTOCOL_VERSION, isDownMessage, isUpMessage, type DisplayState, type DownMessage, type UpMessage } from '@/lib/pos/display/protocol';

const TERMINAL = '11111111-2222-4333-8444-555555555555';
const INSTANCE = '99999999-8888-4777-8666-555555555555';

const emptyState: DisplayState = { mode: 'idle', cart: null, payment: null, tip: null, thanks: null };

const validDown: DownMessage[] = [
  { v: 1, t: 'hello', seq: 1, terminalId: TERMINAL, instanceId: INSTANCE, cashier: { name: 'Andrea' }, sessionOpen: true },
  { v: 1, t: 'hello', seq: 2, terminalId: TERMINAL, instanceId: INSTANCE, cashier: null, sessionOpen: false },
  { v: 1, t: 'state', seq: 3, terminalId: TERMINAL, instanceId: INSTANCE, state: emptyState },
  {
    v: 1,
    t: 'state',
    seq: 4,
    terminalId: TERMINAL,
    instanceId: INSTANCE,
    state: {
      mode: 'payment',
      cart: {
        id: 'c1', currency: 'COP', lines: [], subtotal: 0, discountTotal: 0, discountLabel: null,
        taxTotal: 0, taxIncluded: true, total: 0, lastChangedLineId: null,
      },
      payment: { method: 'cash', total: 1000, received: 2000, change: 1000 },
      tip: null,
      thanks: null,
    },
  },
  { v: 1, t: 'heartbeat', seq: 5, terminalId: TERMINAL, instanceId: INSTANCE, at: 1_700_000_000_000 },
  { v: 1, t: 'bye', seq: 6, terminalId: TERMINAL, instanceId: INSTANCE },
  {
    v: 1,
    t: 'state',
    seq: 7,
    terminalId: TERMINAL,
    instanceId: INSTANCE,
    state: {
      mode: 'payment',
      cart: null,
      payment: { method: 'qr', total: 1000, provider: 'breb', qr: null, expiresAt: null },
      tip: null,
      thanks: null,
    },
  },
];

const validUp: UpMessage[] = [
  { v: 1, t: 'need_snapshot', terminalId: TERMINAL, capabilities: { touch: true, width: 1920, height: 1080 } },
  { v: 1, t: 'tip_selected', terminalId: TERMINAL, cartId: 'c1', kind: 'percent', value: 10 },
  { v: 1, t: 'tip_selected', terminalId: TERMINAL, cartId: 'c1', kind: 'none', value: 0 },
  { v: 1, t: 'qr_paid_claim', terminalId: TERMINAL, cartId: 'c1' },
  { v: 1, t: 'rating', terminalId: TERMINAL, saleId: null, rating: 5 },
  { v: 1, t: 'rating', terminalId: TERMINAL, saleId: 's1', rating: 1 },
];

describe('PROTOCOL_VERSION', () => {
  it('es 1 en la Fase 0', () => {
    expect(PROTOCOL_VERSION).toBe(1);
  });
});

describe('isDownMessage', () => {
  it.each(validDown.map((m) => [m.t, m] as const))('acepta %s válido', (_t, msg) => {
    expect(isDownMessage(msg)).toBe(true);
  });

  it('rechaza versiones distintas de la actual', () => {
    expect(isDownMessage({ ...validDown[5], v: 2 })).toBe(false);
    expect(isDownMessage({ ...validDown[5], v: '1' })).toBe(false);
    expect(isDownMessage({ ...validDown[5], v: undefined })).toBe(false);
  });

  it('rechaza lo que no es objeto', () => {
    for (const bad of [null, undefined, 1, 'hello', [], true]) {
      expect(isDownMessage(bad)).toBe(false);
    }
  });

  it('rechaza tipos desconocidos y mensajes de subida', () => {
    expect(isDownMessage({ v: 1, t: 'goodbye', seq: 1, terminalId: TERMINAL, instanceId: INSTANCE })).toBe(false);
    expect(isDownMessage(validUp[0])).toBe(false);
  });

  it('rechaza seq ausente, negativo, no finito o no entero, y terminalId vacío', () => {
    const base = validDown[5];
    expect(isDownMessage({ ...base, seq: undefined })).toBe(false);
    expect(isDownMessage({ ...base, seq: -1 })).toBe(false);
    expect(isDownMessage({ ...base, seq: Number.NaN })).toBe(false);
    expect(isDownMessage({ ...base, seq: Number.POSITIVE_INFINITY })).toBe(false);
    expect(isDownMessage({ ...base, seq: 1.5 })).toBe(false);
    expect(isDownMessage({ ...base, seq: '7' })).toBe(false);
    expect(isDownMessage({ ...base, seq: 0 })).toBe(true);
    expect(isDownMessage({ ...base, seq: Number.MAX_SAFE_INTEGER })).toBe(true);
    expect(isDownMessage({ ...base, terminalId: '' })).toBe(false);
    expect(isDownMessage({ ...base, terminalId: 42 })).toBe(false);
  });

  it('exige instanceId no vacío en todo mensaje de bajada', () => {
    const base = validDown[5];
    expect(isDownMessage({ ...base, instanceId: undefined })).toBe(false);
    expect(isDownMessage({ ...base, instanceId: '' })).toBe(false);
    expect(isDownMessage({ ...base, instanceId: 7 })).toBe(false);
    expect(isDownMessage({ ...base, instanceId: 'cualquier-texto' })).toBe(true);
  });

  it('valida el payload de cada tipo', () => {
    expect(isDownMessage({ ...validDown[0], sessionOpen: 'yes' })).toBe(false);
    expect(isDownMessage({ ...validDown[0], cashier: { name: 7 } })).toBe(false);
    expect(isDownMessage({ ...validDown[0], cashier: undefined })).toBe(false);
    expect(isDownMessage({ ...validDown[4], at: 'ahora' })).toBe(false);
    expect(isDownMessage({ ...validDown[2], state: null })).toBe(false);
    expect(isDownMessage({ ...validDown[2], state: { ...emptyState, mode: 'volando' } })).toBe(false);
    expect(isDownMessage({ ...validDown[2], state: { mode: 'idle', cart: null } })).toBe(false); // faltan bloques
    expect(isDownMessage({ ...validDown[2], state: { ...emptyState, cart: 'no' } })).toBe(false);
  });

  it('state: cart.lines debe ser array y payment.method conocido (PLAN §6.1: JSON malformado degrada, no rompe)', () => {
    const okCart = validDown[3];
    const cartOf = (cart: unknown) => ({ ...validDown[2], state: { ...emptyState, cart } });
    const paymentOf = (payment: unknown) => ({ ...validDown[2], state: { ...emptyState, mode: 'payment', payment } });
    expect(isDownMessage(cartOf({ lines: 5 }))).toBe(false);
    expect(isDownMessage(cartOf({ lines: 'no-es-array' }))).toBe(false);
    expect(isDownMessage(cartOf({}))).toBe(false);
    expect(isDownMessage(cartOf({ lines: [] }))).toBe(true);
    expect(isDownMessage(paymentOf({ method: 'cripto' }))).toBe(false);
    expect(isDownMessage(paymentOf({ method: 'bitcoin', total: 1 }))).toBe(false);
    expect(isDownMessage(paymentOf({}))).toBe(false);
    expect(isDownMessage(paymentOf({ method: 'cash' }))).toBe(true);
    expect(isDownMessage(paymentOf({ method: 'card' }))).toBe(true);
    expect(isDownMessage(paymentOf({ method: 'qr' }))).toBe(true);
    expect(isDownMessage(okCart)).toBe(true);
  });

  it('state: tip.presets debe ser array y thanks.total número finito (barato y evita presets.map/undefined en la UI)', () => {
    const tipOf = (tip: unknown) => ({ ...validDown[2], state: { ...emptyState, mode: 'tip', tip } });
    const thanksOf = (thanks: unknown) => ({ ...validDown[2], state: { ...emptyState, mode: 'thanks', thanks } });
    expect(isDownMessage(tipOf({}))).toBe(false);
    expect(isDownMessage(tipOf({ presets: 'no' }))).toBe(false);
    expect(isDownMessage(tipOf({ presets: [] }))).toBe(true);
    expect(isDownMessage(tipOf({ presets: [5, 10, 15], allowCustom: true, selected: null }))).toBe(true);
    expect(isDownMessage(thanksOf({}))).toBe(false);
    expect(isDownMessage(thanksOf({ total: '1000' }))).toBe(false);
    expect(isDownMessage(thanksOf({ total: Number.NaN }))).toBe(false);
    expect(isDownMessage(thanksOf({ total: 0 }))).toBe(true);
    expect(isDownMessage(thanksOf({ total: 1000, askRating: true }))).toBe(true);
    // Lo que sigue sin garantizarse (documentado en isDisplayStateShape): coherencia mode ↔ bloques y contenido de líneas.
    expect(isDownMessage({ ...validDown[2], state: { ...emptyState, mode: 'order', cart: null } })).toBe(true);
    expect(isDownMessage({ ...validDown[2], state: { ...emptyState, mode: 'order', cart: { lines: [{}] } } })).toBe(true);
  });
});

describe('isUpMessage', () => {
  it.each(validUp.map((m) => [m.t, m] as const))('acepta %s válido', (_t, msg) => {
    expect(isUpMessage(msg)).toBe(true);
  });

  it('rechaza versiones distintas, no-objetos y mensajes de bajada', () => {
    expect(isUpMessage({ ...validUp[3], v: 0 })).toBe(false);
    expect(isUpMessage(null)).toBe(false);
    expect(isUpMessage('need_snapshot')).toBe(false);
    expect(isUpMessage(validDown[0])).toBe(false);
  });

  it('valida capabilities de need_snapshot', () => {
    expect(isUpMessage({ ...validUp[0], capabilities: undefined })).toBe(false);
    expect(isUpMessage({ ...validUp[0], capabilities: { touch: 'sí', width: 1, height: 1 } })).toBe(false);
    expect(isUpMessage({ ...validUp[0], capabilities: { touch: true, width: Number.NaN, height: 1 } })).toBe(false);
  });

  it('valida tip_selected: cartId, kind conocido y valor no negativo', () => {
    expect(isUpMessage({ ...validUp[1], cartId: '' })).toBe(false);
    expect(isUpMessage({ ...validUp[1], kind: 'porcentaje' })).toBe(false);
    expect(isUpMessage({ ...validUp[1], value: -5 })).toBe(false);
    expect(isUpMessage({ ...validUp[1], value: '10' })).toBe(false);
  });

  it('valida rating: entero 1..5 y saleId string o null', () => {
    expect(isUpMessage({ ...validUp[4], rating: 0 })).toBe(false);
    expect(isUpMessage({ ...validUp[4], rating: 6 })).toBe(false);
    expect(isUpMessage({ ...validUp[4], rating: 3.5 })).toBe(false);
    expect(isUpMessage({ ...validUp[4], saleId: undefined })).toBe(false);
    expect(isUpMessage({ ...validUp[4], saleId: 12 })).toBe(false);
  });

  it('valida qr_paid_claim: cartId obligatorio', () => {
    expect(isUpMessage({ v: 1, t: 'qr_paid_claim', terminalId: TERMINAL })).toBe(false);
  });

  it('toInstanceId es opcional: ausente o string no vacío; vacío o no string se rechaza', () => {
    expect(isUpMessage({ ...validUp[3], toInstanceId: INSTANCE })).toBe(true);
    expect(isUpMessage({ ...validUp[3], toInstanceId: undefined })).toBe(true);
    expect(isUpMessage({ ...validUp[3], toInstanceId: '' })).toBe(false);
    expect(isUpMessage({ ...validUp[3], toInstanceId: 7 })).toBe(false);
    expect(isUpMessage({ ...validUp[3], toInstanceId: null })).toBe(false);
  });
});
