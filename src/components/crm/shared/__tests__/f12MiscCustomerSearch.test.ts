/// <reference types="jest" />
/**
 * F12-misc — `useCustomerSearch` (picker de referidor) rompía con comas en la
 * búsqueda: el `.or(...)` de PostgREST llevaba el término sin entrecomillar
 * (PGRST100). Ahora compone el filtro con el helper único `ilikeAnyOf`.
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

jest.mock('@/lib/supabase/config', () => ({ supabase: { from: (...args: unknown[]) => { calls.push({ method: 'from', args }); return chain(); } } }));
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
    return { hook, setCalls, cleanup };
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

describe('useCustomerSearch — filtro `or` de PostgREST', () => {
  it('coma, paréntesis y comillas del usuario viajan entrecomillados (helper único) y acotados a la organización', async () => {
    runHook('Pérez, Juan ("hijo")', true);
    await jest.advanceTimersByTimeAsync(260);
    const or = calls.find((c) => c.method === 'or');
    expect(or?.args[0]).toBe('full_name.ilike."%Pérez, Juan (\\"hijo\\")%",email.ilike."%Pérez, Juan (\\"hijo\\")%"');
    expect(calls.find((c) => c.method === 'from')?.args[0]).toBe('customers');
    expect(calls.find((c) => c.method === 'eq')?.args).toEqual(['organization_id', 120]);
    expect(calls.find((c) => c.method === 'limit')?.args).toEqual([8]);
  });

  it('el término no se mutila: «Pérez, Juan» se busca con su coma (no con un espacio)', async () => {
    runHook('Pérez, Juan', true);
    await jest.advanceTimersByTimeAsync(260);
    const or = calls.find((c) => c.method === 'or');
    expect(String(or?.args[0])).toContain('"%Pérez, Juan%"');
    expect(String(or?.args[0])).not.toContain('Pérez  Juan');
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
    if (typeof cleanup === 'function') cleanup();
    await jest.advanceTimersByTimeAsync(500);
    expect(calls).toHaveLength(0);
  });
});
