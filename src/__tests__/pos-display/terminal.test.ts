/**
 * Identidad local de la terminal (Fase 0, sin tabla pos_terminals). Suite
 * única de terminal.ts (fusión de las rondas 1-7 de la Parte A).
 */

import {
  TERMINAL_ID_STORAGE_KEY,
  generateTerminalId,
  getOrCreateLocalTerminalId,
  isTerminalId,
  readLocalTerminalId,
  type TerminalIdStorage,
} from '@/lib/pos/display/terminal';
import { displayChannelName } from '@/lib/pos/display/transport';

const TERMINAL = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function memoryStorage(initial: Record<string, string> = {}): TerminalIdStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

describe('generateTerminalId / isTerminalId', () => {
  it('genera UUID v4 válidos y distintos', () => {
    const a = generateTerminalId();
    const b = generateTerminalId();
    expect(isTerminalId(a)).toBe(true);
    expect(isTerminalId(b)).toBe(true);
    expect(a).not.toBe(b);
    expect(a[14]).toBe('4');
  });

  it('isTerminalId acepta cualquier versión RFC 4122 (v1, v4, v5) para no invalidar ids ya guardados; mayúsculas también', () => {
    expect(isTerminalId('aaaaaaaa-bbbb-1ccc-8ddd-eeeeeeeeeeee')).toBe(true);
    expect(isTerminalId('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee')).toBe(true);
    expect(isTerminalId('aaaaaaaa-bbbb-5ccc-8ddd-eeeeeeeeeeee')).toBe(true);
    expect(isTerminalId('AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE')).toBe(true);
  });

  it('rechaza lo que no es UUID: vacío, código legible, con espacios, null, número', () => {
    expect(isTerminalId('')).toBe(false);
    expect(isTerminalId('caja-1')).toBe(false);
    expect(isTerminalId(` ${TERMINAL} `)).toBe(false);
    expect(isTerminalId(null)).toBe(false);
    expect(isTerminalId(123)).toBe(false);
  });

  it('sin crypto.randomUUID (contexto http no seguro) genera igualmente un UUID v4 con getRandomValues', () => {
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
});

describe('getOrCreateLocalTerminalId', () => {
  it('crea el id una sola vez y lo guarda bajo pos_terminal_id', () => {
    const storage = memoryStorage();
    const first = getOrCreateLocalTerminalId(storage);
    const second = getOrCreateLocalTerminalId(storage);
    expect(TERMINAL_ID_STORAGE_KEY).toBe('pos_terminal_id');
    expect(isTerminalId(first)).toBe(true);
    expect(second).toBe(first);
    expect(storage.data.get('pos_terminal_id')).toBe(first);
  });

  it('reutiliza un id existente válido, incluso en mayúsculas, tal cual (no normaliza): caja y pantalla abren el mismo canal', () => {
    const existing = '12345678-1234-4123-8123-123456789abc';
    expect(getOrCreateLocalTerminalId(memoryStorage({ pos_terminal_id: existing }))).toBe(existing);
    const upper = 'AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE';
    const storage = memoryStorage({ pos_terminal_id: upper });
    expect(getOrCreateLocalTerminalId(storage)).toBe(upper);
    expect(readLocalTerminalId(storage)).toBe(upper);
    expect(displayChannelName(upper)).toBe(`pos-display:${upper}`);
  });

  it('un valor que no es UUID («caja-1», «basura», con espacios) se trata como ausente y se sobrescribe: la identidad cambia (contrato de la clave)', () => {
    for (const previo of ['caja-1', 'basura', ` ${TERMINAL} `]) {
      const storage = memoryStorage({ pos_terminal_id: previo });
      expect(readLocalTerminalId(storage)).toBeNull();
      const created = getOrCreateLocalTerminalId(storage);
      expect(isTerminalId(created)).toBe(true);
      expect(created).not.toBe(previo);
      expect(created).not.toBe(TERMINAL);
      expect(storage.data.get('pos_terminal_id')).toBe(created);
    }
  });

  it('sin storage devuelve un id efímero estable para el proceso', () => {
    const a = getOrCreateLocalTerminalId(null);
    const b = getOrCreateLocalTerminalId(null);
    expect(isTerminalId(a)).toBe(true);
    expect(b).toBe(a);
  });

  it('si el storage lanza al escribir (cuota llena), cae al mismo id efímero sin romper', () => {
    const broken: TerminalIdStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    const first = getOrCreateLocalTerminalId(broken);
    expect(isTerminalId(first)).toBe(true);
    expect(getOrCreateLocalTerminalId(broken)).toBe(first);
    expect(first).toBe(getOrCreateLocalTerminalId(null));
    expect(readLocalTerminalId(broken)).toBeNull();
  });

  it('si el storage lanza al leer (SecurityError), cae al id efímero sin propagar', () => {
    const broken: TerminalIdStorage = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => undefined,
    };
    expect(isTerminalId(getOrCreateLocalTerminalId(broken))).toBe(true);
    expect(readLocalTerminalId(broken)).toBeNull();
  });
});

describe('readLocalTerminalId', () => {
  it('lee sin crear: la pantalla abierta antes que la caja no ve id; tras crearlo, ambas ven el mismo', () => {
    const storage = memoryStorage();
    expect(readLocalTerminalId(storage)).toBeNull();
    expect(storage.data.size).toBe(0);
    const id = getOrCreateLocalTerminalId(storage);
    expect(readLocalTerminalId(storage)).toBe(id);
    expect(readLocalTerminalId(null)).toBeNull();
  });
});
