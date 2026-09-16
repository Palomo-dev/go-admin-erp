/**
 * Identidad local de la terminal (Fase 0, sin tabla pos_terminals).
 */

import {
  TERMINAL_ID_STORAGE_KEY,
  generateTerminalId,
  getOrCreateLocalTerminalId,
  isTerminalId,
  readLocalTerminalId,
  type TerminalIdStorage,
} from '@/lib/pos/display/terminal';

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
  });

  it('rechaza lo que no es UUID', () => {
    expect(isTerminalId('')).toBe(false);
    expect(isTerminalId('caja-1')).toBe(false);
    expect(isTerminalId(null)).toBe(false);
    expect(isTerminalId(123)).toBe(false);
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

  it('reutiliza un id existente válido', () => {
    const existing = '12345678-1234-4123-8123-123456789abc';
    const storage = memoryStorage({ pos_terminal_id: existing });
    expect(getOrCreateLocalTerminalId(storage)).toBe(existing);
  });

  it('sustituye un valor corrupto en storage', () => {
    const storage = memoryStorage({ pos_terminal_id: 'basura' });
    const id = getOrCreateLocalTerminalId(storage);
    expect(isTerminalId(id)).toBe(true);
    expect(storage.data.get('pos_terminal_id')).toBe(id);
  });

  it('sin storage devuelve un id efímero estable para el proceso', () => {
    const a = getOrCreateLocalTerminalId(null);
    const b = getOrCreateLocalTerminalId(null);
    expect(isTerminalId(a)).toBe(true);
    expect(b).toBe(a);
  });

  it('si el storage lanza al escribir, cae al id efímero sin romper', () => {
    const broken: TerminalIdStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    const id = getOrCreateLocalTerminalId(broken);
    expect(isTerminalId(id)).toBe(true);
    expect(id).toBe(getOrCreateLocalTerminalId(null));
  });
});

describe('readLocalTerminalId', () => {
  it('lee sin crear', () => {
    const storage = memoryStorage();
    expect(readLocalTerminalId(storage)).toBeNull();
    expect(storage.data.size).toBe(0);
    const id = getOrCreateLocalTerminalId(storage);
    expect(readLocalTerminalId(storage)).toBe(id);
    expect(readLocalTerminalId(null)).toBeNull();
  });
});
