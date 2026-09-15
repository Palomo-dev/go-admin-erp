/// <reference types="jest" />
/**
 * F11 — organizaciones que reciben las tareas programadas: SIEMPRE desde
 * `organization_modules` (módulo `crm` activo), nunca una lista cableada.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { isScheduledTask, listCrmActiveOrgIds, orgIdsWithModule, SCHEDULED_TASKS, splitScheduledKinds } from '../scheduledOrgs';

describe('orgIdsWithModule', () => {
  it('filtra por módulo y activo, deduplica y descarta ids inválidos', () => {
    const rows = [
      { organization_id: 120, module_code: 'crm', is_active: true },
      { organization_id: 120, module_code: 'crm', is_active: true },
      { organization_id: 121, module_code: 'crm', is_active: false },
      { organization_id: 122, module_code: 'pos', is_active: true },
      { organization_id: 0, module_code: 'crm', is_active: true },
      { organization_id: -4, module_code: 'crm', is_active: true },
      { organization_id: 130, module_code: 'crm', is_active: null },
    ];
    expect(orgIdsWithModule(rows, 'crm')).toEqual([120]);
  });
});

describe('listCrmActiveOrgIds', () => {
  it('consulta organization_modules con module_code=crm e is_active=true', async () => {
    const eq = jest.fn();
    const chain: Record<string, unknown> = {};
    chain.select = jest.fn(() => chain);
    chain.eq = eq.mockImplementation(() => chain);
    chain.limit = jest.fn(() => chain);
    chain.then = (resolve: (v: unknown) => void) => resolve({ data: [{ organization_id: 7, module_code: 'crm', is_active: true }, { organization_id: 9, module_code: 'crm', is_active: true }], error: null });
    const from = jest.fn(() => chain);
    const sb = { from } as unknown as SupabaseClient;
    const out = await listCrmActiveOrgIds(sb);
    expect(out).toEqual({ orgIds: [7, 9], error: null });
    expect(from).toHaveBeenCalledWith('organization_modules');
    expect(eq).toHaveBeenCalledWith('module_code', 'crm');
    expect(eq).toHaveBeenCalledWith('is_active', true);
  });
  it('error de BD → lista vacía con el error (la tarea lo reporta, no lanza)', async () => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain; chain.eq = () => chain; chain.limit = () => chain;
    chain.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: { message: 'boom' } });
    const sb = { from: () => chain } as unknown as SupabaseClient;
    expect(await listCrmActiveOrgIds(sb)).toEqual({ orgIds: [], error: 'boom' });
  });
});

describe('ScheduledTask — tipo aparte del CHECK de outbound_jobs.kind', () => {
  it('health_recalculate y renewals_sync son tareas programadas, no JobKind', () => {
    expect(SCHEDULED_TASKS).toEqual(['health_recalculate', 'renewals_sync']);
    expect(isScheduledTask('health_recalculate')).toBe(true);
    expect(isScheduledTask('maintenance')).toBe(false);
    expect(isScheduledTask(42)).toBe(false);
  });
  it('splitScheduledKinds separa kinds de cola y tareas en proceso', () => {
    expect(splitScheduledKinds(['maintenance', 'health_recalculate', 'email', 'renewals_sync'])).toEqual({
      jobKinds: ['maintenance', 'email'],
      tasks: ['health_recalculate', 'renewals_sync'],
    });
    expect(splitScheduledKinds(undefined)).toEqual({ jobKinds: [], tasks: [] });
  });
});
