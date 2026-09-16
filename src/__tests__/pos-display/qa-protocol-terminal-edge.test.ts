/**
 * QA ronda 1 — bordes de los type guards del protocolo y de la identidad de
 * terminal que el builder no cubrió.
 */

import { isDownMessage, isUpMessage } from '@/lib/pos/display/protocol';
import {
  TERMINAL_ID_STORAGE_KEY,
  generateTerminalId,
  getOrCreateLocalTerminalId,
  isTerminalId,
  readLocalTerminalId,
  type TerminalIdStorage,
} from '@/lib/pos/display/terminal';

const TERMINAL = '11111111-2222-4333-8444-555555555555';
const INSTANCE = '99999999-8888-4777-8666-555555555555';

describe('QA protocolo: entradas hostiles o malformadas', () => {
  it('JSON malformado como string no pasa ningún guard', () => {
    const raw = '{"v":1,"t":"bye","seq":1,"terminalId":"x"';
    expect(isDownMessage(raw)).toBe(false);
    expect(isUpMessage(raw)).toBe(false);
    expect(() => JSON.parse(raw)).toThrow();
  });

  it('versión desconocida (0, 2, "1", 1.0000001, null) se rechaza en ambos sentidos', () => {
    for (const v of [0, 2, '1', 1.0000001, null, undefined, true]) {
      expect(isDownMessage({ v, t: 'bye', seq: 1, terminalId: TERMINAL, instanceId: INSTANCE })).toBe(false);
      expect(isUpMessage({ v, t: 'qr_paid_claim', terminalId: TERMINAL, cartId: 'c1' })).toBe(false);
    }
  });

  it('claves extra no invalidan el mensaje (compatibilidad hacia delante dentro de v1)', () => {
    expect(isDownMessage({ v: 1, t: 'bye', seq: 1, terminalId: TERMINAL, instanceId: INSTANCE, futuro: { x: 1 } })).toBe(true);
    expect(isUpMessage({ v: 1, t: 'qr_paid_claim', terminalId: TERMINAL, cartId: 'c1', extra: 'sí' })).toBe(true);
  });

  it('un objeto con prototipo manipulado (__proto__) no pasa por tener las claves en la cadena', () => {
    const proto = { v: 1, t: 'bye', seq: 1, terminalId: TERMINAL, instanceId: INSTANCE };
    const child = Object.create(proto) as Record<string, unknown>;
    // Las propiedades heredadas se leen igual (value.v etc.), así que hoy SÍ pasa.
    // Se documenta: el guard no exige propiedades propias. Riesgo bajo (mismo origen).
    expect(isDownMessage(child)).toBe(true);
  });

  it('hello: cashier con name vacío es válido (nombre vacío se muestra como sin cajero)', () => {
    expect(isDownMessage({ v: 1, t: 'hello', seq: 1, terminalId: TERMINAL, instanceId: INSTANCE, cashier: { name: '' }, sessionOpen: true })).toBe(true);
  });

  it('heartbeat: at negativo o Infinity', () => {
    expect(isDownMessage({ v: 1, t: 'heartbeat', seq: 1, terminalId: TERMINAL, instanceId: INSTANCE, at: -1 })).toBe(true); // no se valida signo
    expect(isDownMessage({ v: 1, t: 'heartbeat', seq: 1, terminalId: TERMINAL, instanceId: INSTANCE, at: Number.POSITIVE_INFINITY })).toBe(false);
  });

  it('seq Infinity y seq flotante se rechazan: seq es un entero ≥ 0 (corregido en ronda 2)', () => {
    expect(isDownMessage({ v: 1, t: 'bye', seq: Number.POSITIVE_INFINITY, terminalId: TERMINAL, instanceId: INSTANCE })).toBe(false);
    expect(isDownMessage({ v: 1, t: 'bye', seq: 1.5, terminalId: TERMINAL, instanceId: INSTANCE })).toBe(false);
    expect(isDownMessage({ v: 1, t: 'bye', seq: 2, terminalId: TERMINAL, instanceId: INSTANCE })).toBe(true);
  });

  it('state: payment con method desconocido y cart con lines no-array NO pasan el guard (corregido en ronda 2)', () => {
    const msg = {
      v: 1, t: 'state', seq: 1, terminalId: TERMINAL, instanceId: INSTANCE,
      state: { mode: 'payment', cart: { lines: 5 }, payment: { method: 'cripto' }, tip: {}, thanks: [] },
    };
    expect(isDownMessage(msg)).toBe(false); // `thanks: []` es array → isRecord lo rechaza
    expect(isDownMessage({ ...msg, state: { ...msg.state, thanks: {} } })).toBe(false); // lines 5 y method cripto
    expect(isDownMessage({ ...msg, state: { ...msg.state, thanks: {}, cart: { lines: [] } } })).toBe(false); // method cripto
    expect(isDownMessage({ ...msg, state: { ...msg.state, thanks: {}, payment: { method: 'qr' } } })).toBe(false); // lines 5
    // tip {} y thanks {} ya no pasan (ronda 3): presets array y total numérico.
    expect(isDownMessage({ ...msg, state: { ...msg.state, thanks: {}, cart: { lines: [] }, payment: { method: 'qr' } } })).toBe(false);
    expect(isDownMessage({ ...msg, state: { ...msg.state, tip: null, thanks: null, cart: { lines: [] }, payment: { method: 'qr' } } })).toBe(true);
  });

  it('need_snapshot: width/height 0 o negativos pasan (no se valida rango)', () => {
    expect(isUpMessage({ v: 1, t: 'need_snapshot', terminalId: TERMINAL, capabilities: { touch: false, width: 0, height: -1 } })).toBe(true);
  });

  it('tip_selected kind=none con value>0 pasa (la caja debe ignorar value cuando kind=none)', () => {
    expect(isUpMessage({ v: 1, t: 'tip_selected', terminalId: TERMINAL, cartId: 'c1', kind: 'none', value: 500 })).toBe(true);
  });

  it('tip_selected percent > 100 pasa el guard (la caja debe acotar)', () => {
    expect(isUpMessage({ v: 1, t: 'tip_selected', terminalId: TERMINAL, cartId: 'c1', kind: 'percent', value: 10_000 })).toBe(true);
  });

  it('rating como string "5" se rechaza', () => {
    expect(isUpMessage({ v: 1, t: 'rating', terminalId: TERMINAL, saleId: null, rating: '5' })).toBe(false);
  });
});

describe('QA terminal: identidad', () => {
  it('sin crypto.randomUUID (contexto http no seguro) genera igualmente un UUID v4', () => {
    const original = globalThis.crypto;
    const fake = { getRandomValues: original.getRandomValues.bind(original) } as unknown as Crypto;
    Object.defineProperty(globalThis, 'crypto', { value: fake, configurable: true });
    try {
      const id = generateTerminalId();
      expect(isTerminalId(id)).toBe(true);
      expect(id[14]).toBe('4');
      expect(['8', '9', 'a', 'b']).toContain(id[19]);
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: original, configurable: true });
    }
  });

  it('sin crypto en absoluto cae a Math.random y sigue siendo UUID v4 con forma válida', () => {
    const original = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    try {
      const id = generateTerminalId();
      expect(isTerminalId(id)).toBe(true);
      expect(id[14]).toBe('4');
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: original, configurable: true });
    }
  });

  it('storage que lanza en getItem (SecurityError) cae al id efímero sin propagar', () => {
    const broken: TerminalIdStorage = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => undefined,
    };
    expect(isTerminalId(getOrCreateLocalTerminalId(broken))).toBe(true);
    expect(readLocalTerminalId(broken)).toBeNull();
  });

  it('un UUID en mayúsculas se acepta y se conserva tal cual (no se normaliza)', () => {
    const upper = '12345678-1234-4123-8123-123456789ABC';
    const storage: TerminalIdStorage = { getItem: () => upper, setItem: () => undefined };
    expect(getOrCreateLocalTerminalId(storage)).toBe(upper);
  });

  it('un UUID con espacios alrededor NO se acepta y se regenera (se pierde la identidad)', () => {
    const data = new Map<string, string>([[TERMINAL_ID_STORAGE_KEY, ` ${TERMINAL} `]]);
    const storage: TerminalIdStorage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
    const id = getOrCreateLocalTerminalId(storage);
    expect(id).not.toBe(TERMINAL);
    expect(isTerminalId(id)).toBe(true);
  });

  it('la pantalla (readLocalTerminalId) y la caja (getOrCreate) ven el mismo id con el mismo storage', () => {
    const data = new Map<string, string>();
    const storage: TerminalIdStorage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
    expect(readLocalTerminalId(storage)).toBeNull(); // pantalla abierta antes que la caja: sin id
    const id = getOrCreateLocalTerminalId(storage);
    expect(readLocalTerminalId(storage)).toBe(id);
  });
});
