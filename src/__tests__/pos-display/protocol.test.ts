/**
 * Type guards del protocolo caja ↔ pantalla: forma y versión. La pantalla
 * debe ignorar versiones que no conoce y payloads malformados (PLAN §6.1: un
 * JSON malformado degrada, nunca rompe la pantalla). Suite única del
 * protocolo (fusión de las rondas 1-7 de la Parte A).
 *
 * Fixtures con organización ficticia (org 1). Sin nombres de clientes reales.
 */

import type { Cart, CartItem } from '@/components/pos/types';
import { projectCartForDisplay } from '@/lib/pos/display/projection';
import {
  PROTOCOL_VERSION,
  isDownMessage,
  isIncompatibleEnvelope,
  isUpMessage,
  readEnvelopeVersion,
  type DisplayState,
  type DownMessage,
  type UpMessage,
} from '@/lib/pos/display/protocol';

const TERMINAL = '11111111-2222-4333-8444-555555555555';
const INSTANCE = '99999999-8888-4777-8666-555555555555';
const CAPS = { touch: false, width: 1280, height: 800 } as const;

const emptyState: DisplayState = { mode: 'idle', cart: null, payment: null, tip: null, thanks: null };
const down = (extra: Record<string, unknown>) => ({ v: 1, seq: 1, terminalId: TERMINAL, instanceId: INSTANCE, ...extra });

const validDown: DownMessage[] = [
  { v: 1, t: 'hello', seq: 1, terminalId: TERMINAL, instanceId: INSTANCE, cashier: { name: 'Andrea' }, sessionOpen: true, organizationId: 1 },
  { v: 1, t: 'hello', seq: 2, terminalId: TERMINAL, instanceId: INSTANCE, cashier: null, sessionOpen: false, organizationId: 1 },
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
    state: { mode: 'payment', cart: null, payment: { method: 'qr', total: 1000, provider: 'breb', qr: null, expiresAt: null }, tip: null, thanks: null },
  },
];

const validUp: UpMessage[] = [
  { v: 1, t: 'need_snapshot', terminalId: TERMINAL, capabilities: { touch: true, width: 1920, height: 1080 } },
  { v: 1, t: 'tip_selected', terminalId: TERMINAL, cartId: 'c1', kind: 'percent', value: 10 },
  { v: 1, t: 'tip_selected', terminalId: TERMINAL, cartId: 'c1', kind: 'none', value: 0 },
  { v: 1, t: 'qr_paid_claim', terminalId: TERMINAL, cartId: 'c1' },
  { v: 1, t: 'rating', terminalId: TERMINAL, saleId: null, rating: 5 },
  { v: 1, t: 'rating', terminalId: TERMINAL, saleId: 's1', rating: 1 },
  { v: 1, t: 'display_alive', terminalId: TERMINAL, at: 1, capabilities: CAPS },
  { v: 1, t: 'display_bye', terminalId: TERMINAL },
];

describe('PROTOCOL_VERSION', () => {
  it('es 1 en la Fase 0', () => {
    expect(PROTOCOL_VERSION).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// isDownMessage
// ---------------------------------------------------------------------------

describe('isDownMessage · sobre', () => {
  it.each(validDown.map((m) => [m.t, m] as const))('acepta %s válido', (_t, msg) => {
    expect(isDownMessage(msg)).toBe(true);
  });

  it('rechaza versiones distintas de la actual (0, 2, "1", 1.0000001, null, undefined, true)', () => {
    for (const v of [0, 2, '1', 1.0000001, null, undefined, true]) {
      expect(isDownMessage({ ...validDown[5], v })).toBe(false);
    }
  });

  it('rechaza lo que no es objeto, incluido un string JSON sin parsear (la Fase 3 debe parsear antes del guard)', () => {
    for (const bad of [null, undefined, 1, 'hello', [], true]) {
      expect(isDownMessage(bad)).toBe(false);
    }
    const msg = down({ t: 'heartbeat', at: 0 });
    expect(isDownMessage(JSON.stringify(msg))).toBe(false);
    expect(isDownMessage(JSON.parse(JSON.stringify(msg)))).toBe(true);
    const roto = '{"v":1,"t":"bye","seq":1,"terminalId":"x"';
    expect(isDownMessage(roto)).toBe(false);
    expect(() => JSON.parse(roto)).toThrow();
  });

  it('rechaza tipos desconocidos, t no string y mensajes de subida; devuelve siempre boolean estricto', () => {
    expect(isDownMessage(down({ t: 'goodbye' }))).toBe(false);
    expect(isDownMessage(down({ t: 1 }))).toBe(false);
    expect(isDownMessage(down({ t: 'need_snapshot', capabilities: CAPS }))).toBe(false);
    expect(isDownMessage(validUp[0])).toBe(false);
    for (const t of ['hello', 'state', 'heartbeat', 'bye', 'need_snapshot', 'otro', '']) {
      expect(typeof isDownMessage(down({ t }))).toBe('boolean');
    }
  });

  it('seq: entero ≥ 0; rechaza ausente, negativo, no finito, flotante, string, booleano y BigInt', () => {
    const base = validDown[5];
    expect(isDownMessage({ ...base, seq: undefined })).toBe(false);
    expect(isDownMessage({ ...base, seq: -1 })).toBe(false);
    expect(isDownMessage({ ...base, seq: Number.NaN })).toBe(false);
    expect(isDownMessage({ ...base, seq: Number.POSITIVE_INFINITY })).toBe(false);
    expect(isDownMessage({ ...base, seq: 1.5 })).toBe(false);
    expect(isDownMessage({ ...base, seq: '7' })).toBe(false);
    expect(isDownMessage({ ...base, seq: true })).toBe(false);
    expect(isDownMessage({ ...base, seq: BigInt(1) })).toBe(false);
    expect(isDownMessage({ ...base, seq: 0 })).toBe(true);
    expect(isDownMessage({ ...base, seq: 2 })).toBe(true);
    expect(isDownMessage({ ...base, seq: Number.MAX_SAFE_INTEGER })).toBe(true);
  });

  it('terminalId e instanceId: string no vacío (no se exige UUID)', () => {
    const base = validDown[5];
    expect(isDownMessage({ ...base, terminalId: '' })).toBe(false);
    expect(isDownMessage({ ...base, terminalId: 42 })).toBe(false);
    expect(isDownMessage({ ...base, instanceId: undefined })).toBe(false);
    expect(isDownMessage({ ...base, instanceId: '' })).toBe(false);
    expect(isDownMessage({ ...base, instanceId: 7 })).toBe(false);
    expect(isDownMessage({ ...base, instanceId: 'cualquier-texto' })).toBe(true);
    expect(isDownMessage({ ...base, instanceId: 'x' })).toBe(true);
  });

  it('claves extra no invalidan el mensaje (compatibilidad hacia delante dentro de v1)', () => {
    expect(isDownMessage(down({ t: 'bye', futuro: { x: 1 } }))).toBe(true);
    expect(isDownMessage(down({ t: 'hello', cashier: null, sessionOpen: true, organizationId: 120, futuro: { x: 1 } }))).toBe(true);
  });

  it('un objeto cuyas claves viven en el prototipo pasa (hasEnvelope lee propiedades, no exige propias): riesgo bajo, mismo origen', () => {
    // Por BroadcastChannel llega siempre un clon estructurado sin prototipo: en transport.test se comprueba que no sobrevive al canal.
    const proto = { v: 1, t: 'bye', seq: 1, terminalId: TERMINAL, instanceId: INSTANCE };
    expect(isDownMessage(Object.create(proto) as Record<string, unknown>)).toBe(true);
  });

  it('un objeto con getters que lanzan propaga la excepción (el guard no captura; por el canal nunca llegan getters)', () => {
    const trap = { v: 1, t: 'bye', seq: 1, terminalId: TERMINAL, instanceId: INSTANCE };
    Object.defineProperty(trap, 'seq', {
      get() {
        throw new Error('getter hostil');
      },
      enumerable: true,
    });
    expect(() => isDownMessage(trap)).toThrow('getter hostil');
  });
});

describe('isDownMessage · hello', () => {
  const base = { v: 1, seq: 1, terminalId: TERMINAL, instanceId: INSTANCE, t: 'hello', cashier: null, sessionOpen: true };

  it('cashier: null o { name: string } (nombre vacío vale); string, array, {} o name no string se rechazan', () => {
    expect(isDownMessage({ ...base, organizationId: 1, cashier: { name: '' } })).toBe(true);
    expect(isDownMessage({ ...base, organizationId: 1, cashier: 'Andrea' })).toBe(false);
    expect(isDownMessage({ ...base, organizationId: 1, cashier: ['Andrea'] })).toBe(false);
    expect(isDownMessage({ ...base, organizationId: 1, cashier: {} })).toBe(false);
    expect(isDownMessage({ ...base, organizationId: 1, cashier: { name: 7 } })).toBe(false);
    expect(isDownMessage({ ...base, organizationId: 1, cashier: { name: null } })).toBe(false);
    expect(isDownMessage({ ...base, organizationId: 1, cashier: undefined })).toBe(false);
  });

  it('sessionOpen debe ser booleano', () => {
    expect(isDownMessage({ ...base, organizationId: 1, sessionOpen: 'yes' })).toBe(false);
    expect(isDownMessage({ ...base, organizationId: 1, sessionOpen: 'true' })).toBe(false);
  });

  it('organizationId: entero > 0 obligatorio (1 y 120 pasan; ausente, 0, negativo, decimal, "120", NaN, Infinity, null, {} no)', () => {
    expect(isDownMessage({ ...base, organizationId: 1 })).toBe(true);
    expect(isDownMessage({ ...base, organizationId: 120 })).toBe(true);
    expect(isDownMessage(base)).toBe(false);
    for (const bad of [0, -1, 1.5, '1', '120', Number.NaN, Number.POSITIVE_INFINITY, null, undefined, {}]) {
      expect(isDownMessage({ ...base, organizationId: bad })).toBe(false);
    }
  });

  it('los demás tipos de bajada no exigen organizationId (viaja una vez, en hello)', () => {
    expect(isDownMessage(down({ t: 'heartbeat', at: 1 }))).toBe(true);
    expect(isDownMessage(down({ t: 'bye' }))).toBe(true);
    expect(isDownMessage(down({ t: 'state', state: emptyState }))).toBe(true);
  });
});

describe('isDownMessage · heartbeat', () => {
  it('at debe ser número finito (el signo no se valida)', () => {
    expect(isDownMessage(down({ t: 'heartbeat', at: 'ahora' }))).toBe(false);
    expect(isDownMessage(down({ t: 'heartbeat', at: Number.POSITIVE_INFINITY }))).toBe(false);
    expect(isDownMessage(down({ t: 'heartbeat', at: -1 }))).toBe(true);
  });
});

describe('isDownMessage · state (guard de FORMA, no de contenido)', () => {
  const stateOf = (state: unknown) => down({ t: 'state', state });
  const cartOf = (cart: unknown) => stateOf({ ...emptyState, mode: 'order', cart });
  const paymentOf = (payment: unknown) => stateOf({ ...emptyState, mode: 'payment', payment });
  const tipOf = (tip: unknown) => stateOf({ ...emptyState, mode: 'tip', tip });
  const thanksOf = (thanks: unknown) => stateOf({ ...emptyState, mode: 'thanks', thanks });

  it('state debe ser objeto: null, array, string se rechazan', () => {
    expect(isDownMessage(stateOf(null))).toBe(false);
    expect(isDownMessage(stateOf([]))).toBe(false);
    expect(isDownMessage(stateOf('idle'))).toBe(false);
  });

  it('mode: uno de DisplayMode, comparación exacta (mayúsculas o espacios se rechazan)', () => {
    expect(isDownMessage(stateOf({ ...emptyState, mode: 'volando' }))).toBe(false);
    expect(isDownMessage(stateOf({ ...emptyState, mode: 'Idle' }))).toBe(false);
    expect(isDownMessage(stateOf({ ...emptyState, mode: 'idle ' }))).toBe(false);
  });

  it('los cuatro bloques deben estar presentes (null explícito), cada uno objeto o null', () => {
    expect(isDownMessage(stateOf({ mode: 'idle', cart: null }))).toBe(false);
    const { tip: _tip, ...sinTip } = emptyState;
    void _tip;
    expect(isDownMessage(stateOf(sinTip))).toBe(false);
    expect(isDownMessage(stateOf({ ...emptyState, tip: undefined }))).toBe(false); // { ...state, tip: undefined } no vale
    expect(isDownMessage(stateOf({ ...emptyState, cart: 'no' }))).toBe(false);
    expect(isDownMessage(stateOf({ ...emptyState, thanks: [] }))).toBe(false); // array no es record
  });

  it('cart: lines debe ser array; su contenido no se valida (la Parte C se defiende)', () => {
    expect(isDownMessage(cartOf({ lines: 5 }))).toBe(false);
    expect(isDownMessage(cartOf({ lines: 'no-es-array' }))).toBe(false);
    expect(isDownMessage(cartOf({}))).toBe(false);
    expect(isDownMessage(cartOf({ lines: [] }))).toBe(true);
    expect(isDownMessage(cartOf({ lines: [{}] }))).toBe(true);
    expect(isDownMessage(cartOf({ lines: Array.from({ length: 200 }, () => 'no-es-linea') }))).toBe(true);
    expect(isDownMessage(validDown[3])).toBe(true);
  });

  it('payment: method conocido (cash | card | qr); el resto de campos no se valida', () => {
    expect(isDownMessage(paymentOf({ method: 'cripto' }))).toBe(false);
    expect(isDownMessage(paymentOf({ method: 'bitcoin', total: 1 }))).toBe(false);
    expect(isDownMessage(paymentOf({}))).toBe(false);
    expect(isDownMessage(paymentOf({ method: 'cash' }))).toBe(true);
    expect(isDownMessage(paymentOf({ method: 'card' }))).toBe(true);
    expect(isDownMessage(paymentOf({ method: 'qr' }))).toBe(true);
  });

  it('tip: presets debe ser array (sus elementos y selected no se validan)', () => {
    expect(isDownMessage(tipOf({}))).toBe(false);
    expect(isDownMessage(tipOf({ presets: 'no' }))).toBe(false);
    expect(isDownMessage(tipOf({ presets: [] }))).toBe(true);
    expect(isDownMessage(tipOf({ presets: [5, 10, 15], allowCustom: true, selected: null }))).toBe(true);
    expect(isDownMessage(tipOf({ presets: [5], allowCustom: true, selected: 'basura' }))).toBe(true);
  });

  it('thanks: total debe ser número finito', () => {
    expect(isDownMessage(thanksOf({}))).toBe(false);
    expect(isDownMessage(thanksOf({ total: '1000' }))).toBe(false);
    expect(isDownMessage(thanksOf({ total: Number.NaN }))).toBe(false);
    expect(isDownMessage(thanksOf({ total: 0 }))).toBe(true);
    expect(isDownMessage(thanksOf({ total: 1000, askRating: true }))).toBe(true);
  });

  it('varias violaciones a la vez se rechazan hasta que todas se corrigen', () => {
    const state: Record<string, unknown> = { mode: 'payment', cart: { lines: 5 }, payment: { method: 'cripto' }, tip: {}, thanks: [] };
    const msg = down({ t: 'state', state });
    expect(isDownMessage(msg)).toBe(false);
    expect(isDownMessage({ ...msg, state: { ...state, thanks: {} } })).toBe(false);
    expect(isDownMessage({ ...msg, state: { ...state, thanks: {}, cart: { lines: [] } } })).toBe(false);
    expect(isDownMessage({ ...msg, state: { ...state, thanks: {}, payment: { method: 'qr' } } })).toBe(false);
    expect(isDownMessage({ ...msg, state: { ...state, thanks: {}, cart: { lines: [] }, payment: { method: 'qr' } } })).toBe(false);
    expect(isDownMessage({ ...msg, state: { ...state, tip: null, thanks: null, cart: { lines: [] }, payment: { method: 'qr' } } })).toBe(true);
  });

  it('lo que NO garantiza: coherencia mode ↔ bloques, cart.id, ni el contenido de payment (la Parte C cae a Reposo)', () => {
    expect(isDownMessage(stateOf({ ...emptyState, mode: 'order', cart: null }))).toBe(true);
    expect(isDownMessage(cartOf({ lines: [] }))).toBe(true); // sin cart.id
    expect(isDownMessage(paymentOf({ method: 'cash' }))).toBe(true); // sin total ni received
  });

  it('un state con carrito proyectado sobrevive JSON.parse(JSON.stringify()) y pasa el guard (Fase 3: Realtime serializa a JSON)', () => {
    const ts = '2026-09-15T15:00:00.000Z';
    const line: CartItem = {
      id: 'l1', cart_id: 'cart-1', product_id: 1, quantity: 1, unit_price: 1000, total: 1000, notes: 'x', created_at: ts, updated_at: ts,
      product: { id: 1, organization_id: 1, sku: 'SKU-1', name: 'Producto 1', unit_code: 'UND', status: 'active', created_at: ts, updated_at: ts },
      modifiers: [{ groupId: 1, groupName: 'g', modifierId: 1, name: 'M', extraPrice: 5 }],
    };
    const cart: Cart = {
      id: 'cart-1', organization_id: 1, branch_id: 1, status: 'active', items: [line],
      subtotal: 1000, tax_amount: 0, tax_total: 0, discount_amount: 0, discount_total: 0, total: 1000, created_at: ts, updated_at: ts,
    };
    const projected = projectCartForDisplay(cart, { currency: 'COP', lastChangedLineId: 'l1' });
    const msg = down({ t: 'state', state: { ...emptyState, mode: 'order', cart: projected } });
    const roundTrip: unknown = JSON.parse(JSON.stringify(msg));
    expect(isDownMessage(roundTrip)).toBe(true);
    expect(roundTrip).toEqual(msg);
  });
});

// ---------------------------------------------------------------------------
// isUpMessage
// ---------------------------------------------------------------------------

describe('isUpMessage', () => {
  it.each(validUp.map((m) => [m.t, m] as const))('acepta %s válido', (_t, msg) => {
    expect(isUpMessage(msg)).toBe(true);
  });

  it('rechaza versiones distintas, no-objetos, strings JSON y mensajes de bajada; devuelve boolean estricto', () => {
    for (const v of [0, 2, '1', 1.0000001, null, undefined, true]) {
      expect(isUpMessage({ v, t: 'qr_paid_claim', terminalId: TERMINAL, cartId: 'c1' })).toBe(false);
    }
    expect(isUpMessage(null)).toBe(false);
    expect(isUpMessage('need_snapshot')).toBe(false);
    expect(isUpMessage('{"v":1,"t":"bye","seq":1,"terminalId":"x"')).toBe(false);
    expect(isUpMessage(validDown[0])).toBe(false);
    expect(isUpMessage({ v: 1, t: 'heartbeat', terminalId: TERMINAL, at: 1 })).toBe(false);
    expect(isUpMessage({ v: 1, t: 'bye', terminalId: TERMINAL })).toBe(false);
    expect(isUpMessage({ v: 1, terminalId: TERMINAL, t: ['bye'] })).toBe(false);
    for (const t of ['need_snapshot', 'tip_selected', 'qr_paid_claim', 'rating', 'display_alive', 'display_bye', 'otro', '']) {
      expect(typeof isUpMessage({ v: 1, terminalId: TERMINAL, t })).toBe('boolean');
    }
  });

  it('claves extra pasan (compatibilidad hacia delante dentro de v1)', () => {
    expect(isUpMessage({ v: 1, t: 'qr_paid_claim', terminalId: TERMINAL, cartId: 'c1', extra: 'sí' })).toBe(true);
  });

  it('need_snapshot: capabilities con touch booleano y width/height finitos (0 o negativos pasan: no se valida rango)', () => {
    expect(isUpMessage({ ...validUp[0], capabilities: undefined })).toBe(false);
    expect(isUpMessage({ ...validUp[0], capabilities: { touch: 'sí', width: 1, height: 1 } })).toBe(false);
    expect(isUpMessage({ ...validUp[0], capabilities: { touch: true, width: Number.NaN, height: 1 } })).toBe(false);
    expect(isUpMessage({ ...validUp[0], capabilities: { touch: false, width: 0, height: -1 } })).toBe(true);
  });

  it('tip_selected: cartId no vacío, kind conocido, value finito ≥ 0 (-0 y 0 pasan; -1, Infinity y string no); percent > 100 y none con value > 0 pasan (la caja acota)', () => {
    const base = { v: 1, t: 'tip_selected', terminalId: TERMINAL, cartId: 'c1', kind: 'percent' };
    expect(isUpMessage({ ...base, cartId: '', value: 10 })).toBe(false);
    expect(isUpMessage({ ...base, kind: 'porcentaje', value: 10 })).toBe(false);
    expect(isUpMessage({ ...base, value: -0 })).toBe(true);
    expect(isUpMessage({ ...base, value: 0 })).toBe(true);
    expect(isUpMessage({ ...base, value: -1 })).toBe(false);
    expect(isUpMessage({ ...base, value: -5 })).toBe(false);
    expect(isUpMessage({ ...base, value: Number.POSITIVE_INFINITY })).toBe(false);
    expect(isUpMessage({ ...base, value: '10' })).toBe(false);
    expect(isUpMessage({ ...base, value: 10_000 })).toBe(true);
    expect(isUpMessage({ ...base, kind: 'none', value: 500 })).toBe(true);
  });

  it('rating: entero 1..5 (5.0 pasa; 0, 6, 3.5, 4.5, "5" no) y saleId string no vacío o null', () => {
    const base = { v: 1, t: 'rating', terminalId: TERMINAL, saleId: null };
    expect(isUpMessage({ ...base, rating: 5.0 })).toBe(true);
    for (const bad of [0, 6, 3.5, 4.5, '5']) expect(isUpMessage({ ...base, rating: bad })).toBe(false);
    expect(isUpMessage({ ...base, rating: 3, saleId: '' })).toBe(false);
    expect(isUpMessage({ ...base, rating: 3, saleId: undefined })).toBe(false);
    expect(isUpMessage({ ...base, rating: 3, saleId: 12 })).toBe(false);
  });

  it('qr_paid_claim: cartId obligatorio', () => {
    expect(isUpMessage({ v: 1, t: 'qr_paid_claim', terminalId: TERMINAL })).toBe(false);
  });

  it('display_alive: at finito + capabilities; display_bye sin payload; ninguno es de bajada', () => {
    const base = { v: 1, terminalId: TERMINAL };
    expect(isUpMessage({ ...base, t: 'display_alive', at: 1, capabilities: CAPS, toInstanceId: INSTANCE })).toBe(true);
    expect(isUpMessage({ ...base, t: 'display_alive', capabilities: CAPS })).toBe(false); // sin at
    expect(isUpMessage({ ...base, t: 'display_alive', at: Number.NaN, capabilities: CAPS })).toBe(false);
    expect(isUpMessage({ ...base, t: 'display_alive', at: '1', capabilities: CAPS })).toBe(false);
    expect(isUpMessage({ ...base, t: 'display_alive', at: 1 })).toBe(false); // sin capabilities
    expect(isUpMessage({ ...base, t: 'display_alive', at: 1, capabilities: { ...CAPS, touch: 'yes' } })).toBe(false);
    expect(isUpMessage({ ...base, t: 'display_alive', at: 1, capabilities: { touch: true, width: 1 } })).toBe(false);
    expect(isUpMessage({ ...base, t: 'display_bye' })).toBe(true);
    expect(isUpMessage({ v: 1, t: 'display_bye', terminalId: '' })).toBe(false);
    expect(isUpMessage({ v: 2, t: 'display_bye', terminalId: TERMINAL })).toBe(false);
    expect(isUpMessage({ ...base, t: 'display_bye', toInstanceId: '' })).toBe(false);
    expect(isDownMessage(down({ t: 'display_alive', at: 1, capabilities: CAPS }))).toBe(false);
  });

  it('toInstanceId es opcional: ausente o string no vacío; "", número o null se rechazan (null no es "ausente")', () => {
    expect(isUpMessage({ ...validUp[3], toInstanceId: INSTANCE })).toBe(true);
    expect(isUpMessage({ ...validUp[3], toInstanceId: undefined })).toBe(true);
    expect(isUpMessage({ ...validUp[3], toInstanceId: '' })).toBe(false);
    expect(isUpMessage({ ...validUp[3], toInstanceId: 7 })).toBe(false);
    expect(isUpMessage({ ...validUp[3], toInstanceId: null })).toBe(false);
    expect(isUpMessage({ ...validUp[0], toInstanceId: INSTANCE })).toBe(true);
    expect(isUpMessage({ ...validUp[0], toInstanceId: null })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// D3 · versión del sobre
// ---------------------------------------------------------------------------

describe('readEnvelopeVersion / isIncompatibleEnvelope', () => {
  it('readEnvelopeVersion devuelve v si es número finito; null si no hay sobre o v no es numérico', () => {
    expect(readEnvelopeVersion(validDown[0])).toBe(1);
    expect(readEnvelopeVersion({ v: 2, t: 'hello' })).toBe(2);
    expect(readEnvelopeVersion({ v: 0 })).toBe(0);
    expect(readEnvelopeVersion({ v: '1' })).toBeNull();
    expect(readEnvelopeVersion({ v: Number.NaN })).toBeNull();
    expect(readEnvelopeVersion({ t: 'hello' })).toBeNull();
    for (const bad of [null, undefined, 1, 'v:1', [], true]) expect(readEnvelopeVersion(bad)).toBeNull();
  });

  it('isIncompatibleEnvelope: true solo con terminalId de esta terminal y v numérica distinta de PROTOCOL_VERSION', () => {
    expect(isIncompatibleEnvelope({ v: 2, t: 'hello', terminalId: TERMINAL }, TERMINAL)).toBe(true);
    expect(isIncompatibleEnvelope({ v: 0, terminalId: TERMINAL }, TERMINAL)).toBe(true);
    expect(isIncompatibleEnvelope({ v: 1.5, terminalId: TERMINAL }, TERMINAL)).toBe(true);
    expect(isIncompatibleEnvelope(validDown[0], TERMINAL)).toBe(false); // versión actual
    expect(isIncompatibleEnvelope({ v: 2, terminalId: 'otra-terminal' }, TERMINAL)).toBe(false); // otra terminal
    expect(isIncompatibleEnvelope({ v: '2', terminalId: TERMINAL }, TERMINAL)).toBe(false); // basura, no otra versión
    expect(isIncompatibleEnvelope({ terminalId: TERMINAL }, TERMINAL)).toBe(false); // sin v
    expect(isIncompatibleEnvelope('basura', TERMINAL)).toBe(false);
    expect(isIncompatibleEnvelope(null, TERMINAL)).toBe(false);
  });

  it('un sobre incompatible nunca pasa isDownMessage ni isUpMessage aunque el resto sea válido', () => {
    expect(isDownMessage({ ...validDown[0], v: 2 })).toBe(false);
    expect(isUpMessage({ ...validUp[0], v: 2 })).toBe(false);
    expect(isIncompatibleEnvelope({ ...validDown[0], v: 2 }, TERMINAL)).toBe(true);
    expect(isIncompatibleEnvelope({ ...validUp[0], v: 2 }, TERMINAL)).toBe(true);
  });
});
