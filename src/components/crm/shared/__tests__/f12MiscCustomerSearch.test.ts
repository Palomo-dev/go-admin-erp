/// <reference types="jest" />
/**
 * F12-misc — `useCustomerSearch` (picker de referidor) rompía con comas en la
 * búsqueda: el `.or(...)` de PostgREST llevaba el término sin entrecomillar
 * (PGRST100). Ahora busca con la búsqueda única de clientes (RPC
 * `fn_clientes_buscar`): el texto viaja como parámetro, nunca dentro de un `.or`.
 *
 * Sin @testing-library (jest en node): el hook se ejecuta con el despachador
 * mínimo de React 19 (`__CLIENT_INTERNALS…H`), como en `f0RegTesterR4`:
 * `useState` devuelve el inicial, `useEffect` se ejecuta en el acto y el
 * temporizador de 250 ms se adelanta con temporizadores falsos.
 */
import React from 'react';

interface Call { method: string; args: unknown[] }
const calls: Call[] = [];
let result: { data: unknown[] | null; error: { message: string } | null } = { data: [], error: null };

function chain(): Record<string, unknown> {
  const self: Record<string, unknown> = {};
  for (const m of ['from', 'select', 'eq', 'order', 'limit', 'or']) {
    self[m] = (...args: unknown[]) => { calls.push({ method: m, args }); return self; };
  }
  self.then = (onOk: (v: unknown) => unknown) => Promise.resolve(result).then(onOk);
  return self;
}

jest.mock('@/lib/supabase/config', () => ({
  supabase: {
    from: (...args: unknown[]) => { calls.push({ method: 'from', args }); return chain(); },
    rpc: async (...args: unknown[]) => {
      calls.push({ method: 'rpc', args });
      return { data: { total: 1, filas: result.data ?? [] }, error: result.error };
    },
  },
}));
let orgId = 120;
jest.mock('@/lib/hooks/useOrganization', () => ({ getOrganizationId: () => orgId }));

import { useCustomerSearch } from '../useCustomerSearch';

function runHook(query: string, enabled: boolean) {
  const internals = (React as unknown as { __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE: { H: unknown } })
    .__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  const prev = internals.H;
  const setCalls: unknown[][] = [];
  let cleanup: (() => void) | undefined = undefined;
  internals.H = {
    useState: (init: unknown) => [typeof init === 'function' ? (init as () => unknown)() : init, (v: unknown) => { setCalls.push([v]); }],
    useEffect: (fn: () => (() => void) | void) => { cleanup = fn() ?? undefined; },
  };
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const hook = useCustomerSearch(query, enabled);
    // TS no ve la asignación dentro del callback de `useEffect` y estrecharía a `undefined`.
    return { hook, setCalls, cleanup: cleanup as (() => void) | undefined };
  } finally {
    internals.H = prev;
  }
}

beforeEach(() => {
  calls.length = 0;
  orgId = 120;
  result = { data: [{ id: 'c1', full_name: 'Pérez, Juan (hijo)', email: null, phone: null }], error: null };
  jest.useFakeTimers();
});
afterEach(() => jest.useRealTimers());

describe('useCustomerSearch — búsqueda única de clientes', () => {
  it('coma, paréntesis y comillas del usuario viajan como parámetro de la RPC, acotados a la organización', async () => {
    runHook('Pérez, Juan ("hijo")', true);
    await jest.advanceTimersByTimeAsync(260);
    const rpc = calls.find((c) => c.method === 'rpc');
    expect(rpc?.args[0]).toBe('fn_clientes_buscar');
    expect(rpc?.args[1]).toMatchObject({ p_organization_id: 120, p_q: 'Pérez, Juan ("hijo")', p_limit: 8 });
    expect(calls.some((c) => c.method === 'or')).toBe(false);
    expect(calls.some((c) => c.method === 'from')).toBe(false);
  });

  it('el término no se mutila: «Pérez, Juan» llega con su coma', async () => {
    runHook('Pérez, Juan', true);
    await jest.advanceTimersByTimeAsync(260);
    const rpc = calls.find((c) => c.method === 'rpc');
    expect((rpc?.args[1] as { p_q: string }).p_q).toBe('Pérez, Juan');
  });

  it('búsqueda vacía o solo espacios: sin `.or` (lista reciente de la organización)', async () => {
    runHook('   ', true);
    await jest.advanceTimersByTimeAsync(260);
    expect(calls.some((c) => c.method === 'or')).toBe(false);
    expect(calls.some((c) => c.method === 'from')).toBe(true);
  });

  it('deshabilitado o sin organización activa: no consulta', async () => {
    runHook('ana', false);
    await jest.advanceTimersByTimeAsync(260);
    expect(calls).toHaveLength(0);
    orgId = 0;
    const { setCalls } = runHook('ana', true);
    await jest.advanceTimersByTimeAsync(260);
    expect(calls).toHaveLength(0);
    expect(setCalls.flat()).toContain('No hay organización activa.');
  });

  it('antes de los 250 ms no se ha consultado (debounce) y la limpieza cancela el temporizador', async () => {
    const { cleanup } = runHook('ana', true);
    await jest.advanceTimersByTimeAsync(100);
    expect(calls).toHaveLength(0);
    const stop = cleanup;
    if (typeof stop === 'function') stop();
    await jest.advanceTimersByTimeAsync(500);
    expect(calls).toHaveLength(0);
  });
});
