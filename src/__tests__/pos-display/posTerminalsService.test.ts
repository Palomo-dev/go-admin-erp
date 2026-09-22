/**
 * Fase 2 (parte A) · posTerminalsService.ts sobre `public.pos_terminals`
 * (solo identidad: id, organization_id, branch_id, name, code, is_active,
 * display_last_seen_at, created_at, updated_at).
 *
 * Supabase y la organización/sucursal de la sesión van simulados. Se prueba:
 * - Organización SIEMPRE de la sesión y sucursal del contexto (o explícita).
 * - Solo columnas de identidad en el select (nunca `*`).
 * - Validación del formulario antes del viaje y detección del 23505.
 * - Vincular esta caja: escribe el UUID en `pos_terminal_id` (misma clave que
 *   terminal.ts) y rechaza cualquier valor que no sea UUID.
 * - Sin storage o sin id: la caja sigue «sin vincular», nunca lanza.
 */

import { TERMINAL_ID_STORAGE_KEY } from '@/lib/pos/display/terminal';

// ---------------------------------------------------------------------------
// Supabase y contexto simulados
// ---------------------------------------------------------------------------

interface Call {
  table: string;
  op: 'select' | 'insert' | 'update';
  columns?: string;
  payload?: Record<string, unknown>;
  filters: Array<[string, unknown]>;
  orders: Array<[string, boolean]>;
}

const db: {
  calls: Call[];
  rows: unknown;
  error: { code?: string; message: string } | null;
} = { calls: [], rows: [], error: null };

jest.mock('@/lib/supabase/config', () => ({
  supabase: {
    from: (table: string) => {
      const call: Call = { table, op: 'select', filters: [], orders: [] };
      db.calls.push(call);
      const result = () => (db.error ? { data: null, error: db.error } : { data: db.rows, error: null });
      const chain = {
        select: (columns: string) => {
          call.columns = columns;
          return chain;
        },
        insert: (payload: Record<string, unknown>) => {
          call.op = 'insert';
          call.payload = payload;
          return chain;
        },
        update: (payload: Record<string, unknown>) => {
          call.op = 'update';
          call.payload = payload;
          return chain;
        },
        eq: (col: string, value: unknown) => {
          call.filters.push([col, value]);
          return chain;
        },
        order: (col: string, opts: { ascending: boolean }) => {
          call.orders.push([col, opts.ascending]);
          return chain;
        },
        single: async () => result(),
        maybeSingle: async () => result(),
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject),
      };
      return chain;
    },
  },
}));

const ctx = { orgId: 120, branchId: 7 as number | null };

// Ruta PATCH /api/pos/terminals/[id] simulada (renombrar y activar/desactivar van por ella, no por la tabla).
interface ApiCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}
const api: { calls: ApiCall[]; response: { status: number; body: unknown } } = { calls: [], response: { status: 200, body: {} } };
beforeAll(() => {
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    api.calls.push({
      url: String(input),
      method: init?.method ?? 'GET',
      headers: (init?.headers as Record<string, string>) ?? {},
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {},
    });
    const { status, body } = api.response;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => {
        if (body === null) throw new SyntaxError('sin JSON');
        return body;
      },
    } as Response;
  }) as typeof fetch;
});
jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => ctx.orgId,
  getCurrentBranchId: () => ctx.branchId,
}));

// localStorage simulado (jest corre en node)
const store = new Map<string, string>();
let storageThrows = false;
beforeAll(() => {
  Object.defineProperty(globalThis, 'window', {
    value: {
      localStorage: {
        getItem: (k: string) => {
          if (storageThrows) throw new Error('bloqueado');
          return store.get(k) ?? null;
        },
        setItem: (k: string, v: string) => {
          if (storageThrows) throw new Error('bloqueado');
          store.set(k, v);
        },
      },
    },
    configurable: true,
    writable: true,
  });
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const svc = require('@/lib/services/posTerminalsService') as typeof import('@/lib/services/posTerminalsService');
const { PosTerminalsService, PosTerminalsApiError, isDuplicateCodeError, isForbiddenError, isOrgMismatchError, normalizeTerminalCode, suggestTerminalCode, validateTerminalInput } = svc;

const T1 = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const T2 = 'bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const IDENTITY_COLUMNS = ['id', 'organization_id', 'branch_id', 'name', 'code', 'is_active', 'display_last_seen_at', 'created_at', 'updated_at'];

function row(overrides: Partial<import('@/lib/services/posTerminalsService').PosTerminal> = {}) {
  return {
    id: T1,
    organization_id: 120,
    branch_id: 7,
    name: 'Caja 1',
    code: 'CAJA-1',
    is_active: true,
    display_last_seen_at: null,
    created_at: '2026-09-21T10:00:00.000Z',
    updated_at: '2026-09-21T10:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  db.calls = [];
  db.rows = [];
  db.error = null;
  ctx.orgId = 120;
  ctx.branchId = 7;
  store.clear();
  storageThrows = false;
  api.calls = [];
  api.response = { status: 200, body: {} };
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------

describe('validateTerminalInput / suggestTerminalCode / isDuplicateCodeError', () => {
  it('nombre vacío, nombre largo y código con formato inválido', () => {
    expect(validateTerminalInput({ name: '   ', code: 'A' })).toBe('name_required');
    expect(validateTerminalInput({ name: 'x'.repeat(81), code: 'A' })).toBe('name_too_long');
    expect(validateTerminalInput({ name: 'Caja', code: '' })).toBe('code_invalid');
    expect(validateTerminalInput({ name: 'Caja', code: 'CAJA 1' })).toBe('code_invalid');
    expect(validateTerminalInput({ name: 'Caja', code: 'Ñ' })).toBe('code_invalid');
    expect(validateTerminalInput({ name: 'Caja', code: 'A'.repeat(21) })).toBe('code_invalid');
    expect(validateTerminalInput({ name: ' Caja 1 ', code: ' caja_1-A ' })).toBeNull();
  });

  it('sugiere un código corto a partir del nombre (sin tildes, mayúsculas, guiones)', () => {
    expect(suggestTerminalCode('Caja 1')).toBe('CAJA-1');
    expect(suggestTerminalCode('  Cajón principal  ')).toBe('CAJON-PRINCIPAL');
    expect(suggestTerminalCode('Terminal de la barra número dos 2026')).toHaveLength(20);
    expect(suggestTerminalCode('¡¡¡')).toBe('');
  });

  it('suggestTerminalCode nunca termina en guion al recortar a 20 (se recorta ANTES de limpiar los extremos)', () => {
    // 'A'×19 + ' B' → 'AAAAAAAAAAAAAAAAAAA-B' (21) → recorte a 20 deja 'AAAAAAAAAAAAAAAAAAA-' → sin guion final.
    expect(suggestTerminalCode(`${'A'.repeat(19)} B`)).toBe('A'.repeat(19));
    expect(suggestTerminalCode('Terminal de la barra número dos 2026')).not.toMatch(/-$/);
  });

  it('normalizeTerminalCode: recorta y pasa a MAYÚSCULAS; createTerminal escribe la forma canónica', async () => {
    expect(normalizeTerminalCode(' caja-1 ')).toBe('CAJA-1');
    db.rows = row();
    await PosTerminalsService.createTerminal({ name: 'Caja 1', code: 'caja-1' });
    expect(db.calls[0].payload?.code).toBe('CAJA-1');
  });

  it('isDuplicateCodeError reconoce solo el 23505', () => {
    expect(isDuplicateCodeError({ code: '23505', message: 'duplicate key' })).toBe(true);
    expect(isDuplicateCodeError({ code: '42501', message: 'RLS' })).toBe(false);
    expect(isDuplicateCodeError(new Error('x'))).toBe(false);
    expect(isDuplicateCodeError(null)).toBe(false);
  });
});

describe('PosTerminalsService.listTerminals', () => {
  it('filtra por organización de la sesión y sucursal del contexto, solo columnas de identidad, activas primero', async () => {
    db.rows = [row(), row({ id: T2, name: 'Caja 2', code: 'CAJA-2', is_active: false })];
    const list = await PosTerminalsService.listTerminals();
    expect(list).toHaveLength(2);
    const call = db.calls[0];
    expect(call.table).toBe('pos_terminals');
    expect(call.op).toBe('select');
    expect(call.columns?.split(',').map((c) => c.trim())).toEqual(IDENTITY_COLUMNS);
    expect(call.filters).toEqual([
      ['organization_id', 120],
      ['branch_id', 7],
    ]);
    expect(call.orders).toEqual([
      ['is_active', false],
      ['name', true],
    ]);
  });

  it('la sucursal explícita manda sobre la del contexto', async () => {
    await PosTerminalsService.listTerminals(9);
    expect(db.calls[0].filters).toContainEqual(['branch_id', 9]);
  });

  it('sin sucursal: lanza antes de consultar', async () => {
    ctx.branchId = null;
    await expect(PosTerminalsService.listTerminals()).rejects.toThrow(/sucursal/);
    expect(db.calls).toHaveLength(0);
  });

  it('error de Supabase se propaga', async () => {
    db.error = { message: 'RLS' };
    await expect(PosTerminalsService.listTerminals()).rejects.toEqual({ message: 'RLS' });
  });
});

describe('PosTerminalsService.createTerminal', () => {
  it('inserta con organización de la sesión y sucursal del contexto, recortando espacios; devuelve la fila', async () => {
    db.rows = row();
    const created = await PosTerminalsService.createTerminal({ name: ' Caja 1 ', code: ' CAJA-1 ' });
    expect(created.id).toBe(T1);
    const call = db.calls[0];
    expect(call.op).toBe('insert');
    expect(call.payload).toEqual({ organization_id: 120, branch_id: 7, name: 'Caja 1', code: 'CAJA-1', is_active: true });
    expect(call.columns?.split(',').map((c) => c.trim())).toEqual(IDENTITY_COLUMNS);
  });

  it('la organización NUNCA sale del parámetro: solo de la sesión', async () => {
    db.rows = row();
    await PosTerminalsService.createTerminal({ name: 'Caja', code: 'C', ...({ organization_id: 999 } as object) }, 7);
    expect(db.calls[0].payload?.organization_id).toBe(120);
  });

  it('entrada inválida: lanza sin consultar', async () => {
    await expect(PosTerminalsService.createTerminal({ name: '', code: 'A' })).rejects.toThrow(/name_required/);
    await expect(PosTerminalsService.createTerminal({ name: 'Caja', code: 'no válido' })).rejects.toThrow(/code_invalid/);
    expect(db.calls).toHaveLength(0);
  });

  it('código repetido en la sucursal: el 23505 se propaga y isDuplicateCodeError lo reconoce', async () => {
    db.error = { code: '23505', message: 'duplicate key value violates unique constraint "pos_terminals_code_unico"' };
    let caught: unknown = null;
    try {
      await PosTerminalsService.createTerminal({ name: 'Caja 1', code: 'CAJA-1' });
    } catch (e) {
      caught = e;
    }
    expect(caught).not.toBeNull();
    expect(isDuplicateCodeError(caught)).toBe(true);
  });
});

describe('PosTerminalsService.updateTerminal / setTerminalActive (por PATCH /api/pos/terminals/[id], rol en servidor)', () => {
  it('update manda SOLO lo que cambia por la ruta, con la organización de la sesión en cabecera y nunca en el body', async () => {
    api.response = { status: 200, body: { data: row({ name: 'Caja principal' }) } };
    const updated = await PosTerminalsService.updateTerminal(T1, { name: ' Caja principal ' });
    expect(updated.name).toBe('Caja principal');
    expect(db.calls).toHaveLength(0); // nunca directo a la tabla
    expect(api.calls).toHaveLength(1);
    const call = api.calls[0];
    expect(call.url).toBe(`/api/pos/terminals/${T1}`);
    expect(call.method).toBe('PATCH');
    expect(call.headers['X-Organization-Id']).toBe('120');
    expect(call.body).toEqual({ name: 'Caja principal' });
    expect(Object.keys(call.body)).not.toEqual(expect.arrayContaining(['organization_id', 'organizationId']));
  });

  it('update normaliza el código a MAYÚSCULAS antes de viajar (la UNIQUE distingue mayúsculas)', async () => {
    api.response = { status: 200, body: { data: row({ code: 'CAJA-1' }) } };
    await PosTerminalsService.updateTerminal(T1, { code: ' caja-1 ' });
    expect(api.calls[0].body).toEqual({ code: 'CAJA-1' });
  });

  it('update rechaza id que no es UUID, código inválido y parche vacío sin consultar', async () => {
    await expect(PosTerminalsService.updateTerminal('caja-1', { name: 'x' })).rejects.toThrow(/id/);
    await expect(PosTerminalsService.updateTerminal(T1, { code: 'a b' })).rejects.toThrow(/code_invalid/);
    await expect(PosTerminalsService.updateTerminal(T1, {})).rejects.toThrow();
    expect(db.calls).toHaveLength(0);
    expect(api.calls).toHaveLength(0);
  });

  it('desactivar = PATCH { is_active: false }, nunca delete ni update directo', async () => {
    api.response = { status: 200, body: { data: row({ is_active: false }) } };
    const updated = await PosTerminalsService.setTerminalActive(T1, false);
    expect(updated.is_active).toBe(false);
    expect(api.calls[0].body).toEqual({ is_active: false });
    expect(db.calls).toHaveLength(0);
  });

  it('403 de la ruta (cajero sin rol) → PosTerminalsApiError con status 403 y isForbiddenError', async () => {
    api.response = { status: 403, body: { error: 'Requiere rol', code: 'ADMIN_REQUIRED' } };
    let caught: unknown = null;
    try {
      await PosTerminalsService.setTerminalActive(T1, false);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(PosTerminalsApiError);
    expect((caught as InstanceType<typeof PosTerminalsApiError>).code).toBe('ADMIN_REQUIRED');
    expect(isForbiddenError(caught)).toBe(true);
    expect(isDuplicateCodeError(caught)).toBe(false);
  });

  it('ronda 3 (QA bajo #5): isForbiddenError SOLO para 403 ADMIN_REQUIRED; 403 ORG_AMBIGUOUS y FOREIGN_ORGANIZATION son isOrgMismatchError (la tarjeta pide recargar, no culpa al rol)', async () => {
    for (const code of ['ORG_AMBIGUOUS', 'FOREIGN_ORGANIZATION']) {
      api.response = { status: 403, body: { error: 'organización incoherente', code } };
      let caught: unknown = null;
      try {
        await PosTerminalsService.updateTerminal(T1, { name: 'Caja 2' });
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(PosTerminalsApiError);
      expect(isForbiddenError(caught)).toBe(false);
      expect(isOrgMismatchError(caught)).toBe(true);
      expect(isDuplicateCodeError(caught)).toBe(false);
    }
    // Un 403 sin code conocido no es ninguno de los dos (la tarjeta pinta updateError).
    api.response = { status: 403, body: { error: 'otro' } };
    let other: unknown = null;
    try {
      await PosTerminalsService.setTerminalActive(T1, false);
    } catch (e) {
      other = e;
    }
    expect(isForbiddenError(other)).toBe(false);
    expect(isOrgMismatchError(other)).toBe(false);
    // Un 401/404 con code ORG_AMBIGUOUS tampoco: el criterio es 403 + code.
    api.response = { status: 404, body: { error: 'no', code: 'ORG_AMBIGUOUS' } };
    let notFound: unknown = null;
    try {
      await PosTerminalsService.setTerminalActive(T1, false);
    } catch (e) {
      notFound = e;
    }
    expect(isOrgMismatchError(notFound)).toBe(false);
    expect(isOrgMismatchError(new Error('x'))).toBe(false);
    expect(isOrgMismatchError(null)).toBe(false);
  });

  it('409 DUPLICATE_CODE de la ruta → isDuplicateCodeError, igual que el 23505 directo', async () => {
    api.response = { status: 409, body: { error: 'Ya existe', code: 'DUPLICATE_CODE' } };
    let caught: unknown = null;
    try {
      await PosTerminalsService.updateTerminal(T1, { code: 'CAJA-2' });
    } catch (e) {
      caught = e;
    }
    expect(isDuplicateCodeError(caught)).toBe(true);
    expect(isForbiddenError(caught)).toBe(false);
  });

  it('respuesta sin JSON (502 de un proxy) → error con el estado, no una excepción de parseo', async () => {
    api.response = { status: 502, body: null };
    await expect(PosTerminalsService.setTerminalActive(T1, true)).rejects.toMatchObject({ status: 502, code: 'HTTP_502' });
  });

  it('organización inválida (0 = sin sesión): lanza antes de llamar a la ruta', async () => {
    ctx.orgId = 0;
    await expect(PosTerminalsService.updateTerminal(T1, { name: 'x' })).rejects.toThrow(/organización/);
    await expect(PosTerminalsService.setTerminalActive(T1, true)).rejects.toThrow(/organización/);
    expect(api.calls).toHaveLength(0);
  });
});

describe('PosTerminalsService · organización de la sesión inválida (0 = sin sesión)', () => {
  it('listTerminals y createTerminal lanzan ANTES de consultar (nada viaja con organization_id 0)', async () => {
    ctx.orgId = 0;
    await expect(PosTerminalsService.listTerminals()).rejects.toThrow(/organización/);
    await expect(PosTerminalsService.createTerminal({ name: 'Caja 1', code: 'CAJA-1' })).rejects.toThrow(/organización/);
    expect(db.calls).toHaveLength(0);
  });

  it('getLinkedTerminal con id local y organización 0 lanza (no devuelve null en silencio)', async () => {
    ctx.orgId = 0;
    store.set(TERMINAL_ID_STORAGE_KEY, T1);
    await expect(PosTerminalsService.getLinkedTerminal()).rejects.toThrow(/organización/);
    expect(db.calls).toHaveLength(0);
  });

  it.each([null, undefined, -1, 3.5, '120'])('organización %p también se rechaza', async (bad) => {
    ctx.orgId = bad as never;
    await expect(PosTerminalsService.listTerminals()).rejects.toThrow(/organización/);
    expect(db.calls).toHaveLength(0);
  });
});

describe('PosTerminalsService · vincular esta caja (pos_terminal_id)', () => {
  it('linkThisTerminal escribe el id en la MISMA clave que terminal.ts y getLocalTerminalId lo lee', () => {
    expect(PosTerminalsService.getLocalTerminalId()).toBeNull();
    expect(PosTerminalsService.linkThisTerminal({ id: T1 })).toBe(true);
    expect(store.get(TERMINAL_ID_STORAGE_KEY)).toBe(T1);
    expect(PosTerminalsService.getLocalTerminalId()).toBe(T1);
  });

  it('un id que no es UUID se rechaza sin tocar el storage (contrato de terminal.ts)', () => {
    store.set(TERMINAL_ID_STORAGE_KEY, T1);
    expect(PosTerminalsService.linkThisTerminal({ id: 'caja-1' })).toBe(false);
    expect(store.get(TERMINAL_ID_STORAGE_KEY)).toBe(T1);
  });

  it('storage bloqueado: devuelve false y no lanza', () => {
    storageThrows = true;
    expect(PosTerminalsService.linkThisTerminal({ id: T1 })).toBe(false);
    expect(PosTerminalsService.getLocalTerminalId()).toBeNull();
  });

  it('resolveLinkedTerminal: vinculada si el id local está en la lista; «sin registrar» si no; nada sin id local', () => {
    const list = [row(), row({ id: T2, name: 'Caja 2', code: 'CAJA-2' })];
    expect(PosTerminalsService.resolveLinkedTerminal(list, T2)).toEqual({ localTerminalId: T2, terminal: list[1], unlinked: false });
    expect(PosTerminalsService.resolveLinkedTerminal(list, 'cccccccc-bbbb-4ccc-8ddd-eeeeeeeeeeee')).toEqual({
      localTerminalId: 'cccccccc-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      terminal: null,
      unlinked: true,
    });
    expect(PosTerminalsService.resolveLinkedTerminal(list, null)).toEqual({ localTerminalId: null, terminal: null, unlinked: false });
    // Por defecto lee el storage.
    store.set(TERMINAL_ID_STORAGE_KEY, T1);
    expect(PosTerminalsService.resolveLinkedTerminal(list).terminal?.id).toBe(T1);
  });

  it('getLinkedTerminal consulta por id y organización de la sesión (cualquier sucursal)', async () => {
    store.set(TERMINAL_ID_STORAGE_KEY, T1);
    db.rows = row();
    const linked = await PosTerminalsService.getLinkedTerminal();
    expect(linked?.id).toBe(T1);
    expect(db.calls[0].filters).toEqual([
      ['id', T1],
      ['organization_id', 120],
    ]);
    expect(db.calls[0].filters.some(([col]) => col === 'branch_id')).toBe(false);
  });

  it('getLinkedTerminal: sin id local no consulta; con error devuelve null y avisa (la caja sigue con su id local)', async () => {
    expect(await PosTerminalsService.getLinkedTerminal()).toBeNull();
    expect(db.calls).toHaveLength(0);
    store.set(TERMINAL_ID_STORAGE_KEY, T1);
    db.error = { message: 'sin red' };
    expect(await PosTerminalsService.getLinkedTerminal()).toBeNull();
    expect(console.warn).toHaveBeenCalled();
  });

  it('getLinkedTerminal: id local que no es de esta organización → null (RLS/filtro no devuelve fila)', async () => {
    store.set(TERMINAL_ID_STORAGE_KEY, T1);
    db.rows = null;
    expect(await PosTerminalsService.getLinkedTerminal()).toBeNull();
  });
});
