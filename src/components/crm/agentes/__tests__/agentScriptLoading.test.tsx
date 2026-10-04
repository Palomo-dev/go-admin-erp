/** @jest-environment jsdom */
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import type { StageAgent } from '@/lib/services/crm/stageAgentService';
import { AgentScriptTab } from '../editor/AgentScriptTab';
import { EMPTY_AGENT_FORM } from '../editor/useAgentForm';
import es from '../../../../../messages/es.json';

jest.mock('@/lib/supabase/config', () => ({ supabase: {}, ensureSessionSynced: jest.fn() }));
jest.mock('@/lib/hooks/useOrganization', () => ({ getOrganizationId: () => 120, ORGANIZATION_CHANGED_EVENT: 'organization-changed' }));
jest.mock('../CrmSelectControl', () => ({
  CrmSelectControl: ({ value, onChange, options, disabled, 'aria-label': label }: {
    value: string; onChange: (value: string) => void; disabled?: boolean; 'aria-label'?: string;
    options: readonly { value: string; label: string; disabled?: boolean }[];
  }) => <select aria-label={label} value={value} disabled={disabled} onChange={event => onChange(event.target.value)}>
    {options.map(option => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}
  </select>,
}));

const originalFetch = global.fetch;
const TIMEOUT = 20_000;
const AGENT_ID = '10000000-0000-4000-8000-000000000001';
const OTHER_AGENT_ID = '10000000-0000-4000-8000-000000000002';
const PIPELINE_ID = '10000000-0000-4000-8000-000000000003';
const STAGE_A = '10000000-0000-4000-8000-000000000004';
const STAGE_B = '10000000-0000-4000-8000-000000000005';
const INITIAL_VERSION = '2026-10-01T10:00:00Z';
const SAVED_VERSION = '2026-10-01T10:01:00Z';
const NEXT_VERSION = '2026-10-01T10:02:00Z';
const CONTEXT_URL = '/api/crm/voice-agents/editor-context';
const SCRIPTS_URL = '/api/crm/stage-agents';
const m = es.crm.agentesIa;

function context(name = 'Etapa A') {
  return { pipelines: [{ id: PIPELINE_ID, name: 'Embudo de prueba', stages: [
    { id: STAGE_A, name, position: 0 }, { id: STAGE_B, name: 'Etapa B', position: 1 },
  ] }], products: [{ id: 101, name: 'Producto de prueba', sku: 'SKU-PRUEBA' }] };
}
function row(stageId = STAGE_A, overrides: Partial<StageAgent> = {}): StageAgent {
  return {
    id: stageId, organization_id: 120, stage_id: stageId, voice_agent_id: AGENT_ID,
    channel: 'voice', objective: 'qualify_lead', objective_prompt: stageId === STAGE_A ? 'Guion inicial A' : 'Guion inicial B',
    product_id: null, offer: {}, trigger_on: 'enter', trigger_config: {},
    allowed_tools: [...EMPTY_AGENT_FORM.allowed_tools], action_policy: 'suggest', max_attempts: 3,
    config: {}, is_active: true, created_at: INITIAL_VERSION, updated_at: INITIAL_VERSION, ...overrides,
  };
}
function response(data: unknown, status = 200, code?: string) {
  return { status, ok: status < 400, json: async () => ({ success: status < 400, data, code }) } as Response;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(accept => { resolve = accept; });
  return { promise, resolve };
}
const flush = async () => {
  await act(async () => { for (let n = 0; n < 12; n++) await Promise.resolve(); });
  await act(async () => jest.advanceTimersByTimeAsync(0));
};
function editor(agentId = AGENT_ID, onUnsavedChange = jest.fn()) {
  return <AgentScriptTab form={EMPTY_AGENT_FORM} agentId={agentId} onSaveInactive={jest.fn()} onUnsavedChange={onUnsavedChange} />;
}
function stageSection(name: 'A' | 'B') {
  const section = screen.getByRole('region', { name: `${name === 'A' ? 1 : 2} · Etapa ${name}` });
  const header = within(section).getByRole('button', { name: `${name === 'A' ? 1 : 2} · Etapa ${name}` });
  if (header.getAttribute('aria-expanded') === 'false') fireEvent.click(header);
  return within(section);
}
const prompt = (name: 'A' | 'B') => stageSection(name).getByLabelText(m.objectivePrompt) as HTMLTextAreaElement;
const save = (name: 'A' | 'B') => stageSection(name).getByRole('button', { name: m.stageSave }) as HTMLButtonElement;
const writes = () => jest.mocked(fetch).mock.calls.filter(([, options]) => options?.method === 'POST');
const writeBody = (index: number) => JSON.parse(String(writes()[index][1]?.body)) as Record<string, unknown>;

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['queueMicrotask', 'nextTick'] });
  global.fetch = jest.fn(async url => response(String(url) === CONTEXT_URL ? context() : [row(), row(STAGE_B)]));
});
afterEach(async () => {
  await act(async () => cleanup());
  expect(jest.getTimerCount()).toBe(0);
  global.fetch = originalFetch;
  jest.restoreAllMocks();
  jest.useRealTimers();
});

it('guardar B conserva el borrador de A montado y lo mantiene marcado como pendiente durante la recarga', async () => {
  const refresh = deferred<Response>(); const onUnsavedChange = jest.fn(); let saved = false;
  const savedB = row(STAGE_B, { objective_prompt: 'Guion guardado B', updated_at: SAVED_VERSION });
  jest.mocked(fetch).mockImplementation(async (url, options) => {
    if (options?.method === 'POST') { saved = true; return response(savedB); }
    if (String(url) === CONTEXT_URL) return response(context());
    return saved ? refresh.promise : response([row(), row(STAGE_B)]);
  });
  renderConIdioma(editor(AGENT_ID, onUnsavedChange)); await flush();
  const fieldA = prompt('A');
  fireEvent.change(fieldA, { target: { value: 'Borrador pendiente A' } });
  fireEvent.change(prompt('B'), { target: { value: 'Guion guardado B' } });
  fireEvent.click(save('B')); await flush();
  expect(prompt('A')).toBe(fieldA);
  expect(fieldA.value).toBe('Borrador pendiente A');
  expect(save('A').matches(':disabled')).toBe(true);
  refresh.resolve(response([row(), savedB])); await flush();
  expect(prompt('A')).toBe(fieldA);
  expect(fieldA.value).toBe('Borrador pendiente A');
  expect(prompt('B').value).toBe('Guion guardado B');
  expect(onUnsavedChange.mock.calls.at(-1)).toEqual([true]);
  expect((screen.getByLabelText(m.pipeline) as HTMLSelectElement).disabled).toBe(true);
});

it('un segundo guardado usa la versión CAS devuelta por el primero', async () => {
  let stored = row(); let writeCount = 0;
  jest.mocked(fetch).mockImplementation(async (url, options) => {
    if (options?.method === 'POST') {
      const body = JSON.parse(String(options.body)) as Partial<StageAgent>;
      stored = { ...stored, ...body, updated_at: ++writeCount === 1 ? SAVED_VERSION : NEXT_VERSION };
      return response(stored);
    }
    return response(String(url) === CONTEXT_URL ? context() : [stored, row(STAGE_B)]);
  });
  renderConIdioma(editor()); await flush();
  fireEvent.change(prompt('A'), { target: { value: 'Primer guion guardado' } });
  fireEvent.click(save('A')); await flush();
  fireEvent.change(prompt('A'), { target: { value: 'Segundo guion guardado' } });
  fireEvent.click(save('A')); await flush();
  expect(writes()).toHaveLength(2);
  expect(writeBody(0).expected_updated_at).toBe(INITIAL_VERSION);
  expect(writeBody(1).expected_updated_at).toBe(SAVED_VERSION);
  expect(prompt('A').value).toBe('Segundo guion guardado');
});

it('una recarga fallida mantiene los borradores y la respuesta guardada; reintentar permite seguir guardando', async () => {
  let storedB = row(STAGE_B); let refreshFailed = false;
  jest.mocked(fetch).mockImplementation(async (url, options) => {
    if (options?.method === 'POST') {
      const body = JSON.parse(String(options.body)) as Partial<StageAgent>;
      storedB = { ...storedB, ...body, updated_at: SAVED_VERSION }; refreshFailed = true;
      return response(storedB);
    }
    return response(String(url) === CONTEXT_URL ? context() : refreshFailed ? null : [row(), storedB], String(url) === SCRIPTS_URL && refreshFailed ? 503 : 200);
  });
  renderConIdioma(editor()); await flush();
  fireEvent.change(prompt('A'), { target: { value: 'Borrador pendiente A' } });
  fireEvent.change(prompt('B'), { target: { value: 'Guion guardado B' } });
  fireEvent.click(save('B')); await flush();
  expect(screen.getByRole('alert').textContent).toContain(m.stageScript);
  expect(prompt('A').value).toBe('Borrador pendiente A');
  expect(prompt('B').value).toBe('Guion guardado B');
  expect(save('A').matches(':disabled')).toBe(true);
  refreshFailed = false;
  fireEvent.click(screen.getByRole('button', { name: new RegExp(m.retry) })); await flush();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(prompt('A').value).toBe('Borrador pendiente A');
  expect(save('A').matches(':disabled')).toBe(false);
  fireEvent.change(prompt('B'), { target: { value: 'Nueva revisión B' } });
  fireEvent.click(save('B')); await flush();
  expect(writeBody(1).expected_updated_at).toBe(SAVED_VERSION);
});

it('un borrador B conserva su CAS original si guardar A recarga una versión externa de B y un 409 mantiene el draft', async () => {
  const onUnsavedChange = jest.fn(); let storedA = row(); let externalB = row(STAGE_B); let writeCount = 0;
  jest.mocked(fetch).mockImplementation(async (url, options) => {
    if (options?.method === 'POST') {
      if (++writeCount === 2) return response(null, 409, 'STAGE_AGENT_CONFLICT');
      const body = JSON.parse(String(options.body)) as Partial<StageAgent>;
      storedA = { ...storedA, ...body, updated_at: SAVED_VERSION };
      externalB = row(STAGE_B, { objective_prompt: 'Guion B de otra sesión', updated_at: NEXT_VERSION });
      return response(storedA);
    }
    return response(String(url) === CONTEXT_URL ? context() : [storedA, externalB]);
  });
  renderConIdioma(editor(AGENT_ID, onUnsavedChange)); await flush();
  fireEvent.change(prompt('B'), { target: { value: 'Borrador pendiente B' } });
  fireEvent.change(prompt('A'), { target: { value: 'Guion guardado A' } });
  fireEvent.click(save('A')); await flush();
  expect(prompt('B').value).toBe('Borrador pendiente B');
  expect(screen.queryByDisplayValue('Guion B de otra sesión')).toBeNull();
  fireEvent.click(save('B')); await flush();
  expect(writeBody(1).stage_id).toBe(STAGE_B);
  expect(writeBody(1).expected_updated_at).toBe(INITIAL_VERSION);
  expect(stageSection('B').getByRole('alert').textContent).toContain(m.saveError);
  expect(prompt('B').value).toBe('Borrador pendiente B');
  expect(onUnsavedChange.mock.calls.at(-1)).toEqual([true]);
});

it.each([CONTEXT_URL, SCRIPTS_URL])('un 403 inicial en %s bloquea las filas y permite reintentar sin escribir', async deniedUrl => {
  jest.mocked(fetch).mockImplementation(async url => response(String(url) === CONTEXT_URL ? context() : [row()], String(url) === deniedUrl ? 403 : 200, 'sin_permiso'));
  renderConIdioma(editor()); await flush();
  expect(screen.getByRole('alert').textContent).toContain(m.editorPermissionErrorDescription);
  expect(screen.queryByLabelText(m.objectivePrompt)).toBeNull();
  expect(writes()).toHaveLength(0);
  expect(fetch).toHaveBeenCalledTimes(2);
  jest.mocked(fetch).mockImplementation(async url => response(String(url) === CONTEXT_URL ? context() : [row(), row(STAGE_B)]));
  fireEvent.click(screen.getByRole('button', { name: new RegExp(m.retry) })); await flush();
  expect(prompt('A').value).toBe('Guion inicial A');
  fireEvent.change(stageSection('A').getByLabelText(m.objective), { target: { value: 'sell_product' } });
  expect(stageSection('A').getByRole('option', { name: 'Producto de prueba · SKU-PRUEBA' })).toBeTruthy();
});

it.each(['fetch', 'body'] as const)('el timeout del %s no cooperativo bloquea el editor e ignora su respuesta tardía', async phase => {
  const pending = deferred<Response>();
  const pendingBody = deferred<{ success: true; data: ReturnType<typeof context> }>();
  jest.mocked(fetch).mockImplementation(async url => String(url) === CONTEXT_URL
    ? phase === 'fetch' ? pending.promise : { ...response(context()), json: () => pendingBody.promise } as Response
    : response([row(), row(STAGE_B)]));
  renderConIdioma(editor()); await flush();
  expect(screen.queryByLabelText(m.objectivePrompt)).toBeNull();
  await act(async () => jest.advanceTimersByTimeAsync(TIMEOUT));
  expect(screen.getByRole('alert').textContent).toContain(m.editorReadErrorDescription);
  expect(jest.mocked(fetch).mock.calls.find(([url]) => url === CONTEXT_URL)?.[1]?.signal?.aborted).toBe(true);
  expect(jest.getTimerCount()).toBe(0);
  if (phase === 'fetch') pending.resolve(response(context('Etapa tardía')));
  else pendingBody.resolve({ success: true, data: context('Etapa tardía') });
  await flush();
  expect(screen.queryByText('1 · Etapa tardía')).toBeNull();
  expect(screen.queryByLabelText(m.objectivePrompt)).toBeNull();
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('cambiar organización cancela lecturas pendientes e ignora filas y contexto de la organización anterior', async () => {
  const oldContext = deferred<Response>(); const oldRows = deferred<Response>(); let changed = false;
  jest.mocked(fetch).mockImplementation(async url => changed
    ? response(String(url) === CONTEXT_URL ? context('Etapa nueva') : [row(STAGE_A, { objective_prompt: 'Guion de la nueva organización', organization_id: 140 })])
    : String(url) === CONTEXT_URL ? oldContext.promise : oldRows.promise);
  renderConIdioma(editor()); await flush();
  const previous = jest.mocked(fetch).mock.calls.map(([, options]) => options?.signal);
  changed = true; act(() => window.dispatchEvent(new Event('organization-changed'))); await flush();
  expect(previous.every(signal => signal?.aborted)).toBe(true);
  expect(screen.getByDisplayValue('Guion de la nueva organización')).toBeTruthy();
  oldContext.resolve(response(context('Etapa anterior'))); oldRows.resolve(response([row()])); await flush();
  expect(screen.queryByText('1 · Etapa anterior')).toBeNull();
  expect(screen.queryByDisplayValue('Guion inicial A')).toBeNull();
  expect(screen.getByDisplayValue('Guion de la nueva organización')).toBeTruthy();
});

it.each(['organización', 'agente'] as const)('cambiar %s limpia drafts y descarta un guardado pendiente sin recargar el nuevo contexto', async kind => {
  const pending = deferred<Response>(); const onUnsavedChange = jest.fn(); let changed = false;
  jest.mocked(fetch).mockImplementation(async (url, options) => options?.method === 'POST' ? pending.promise
    : response(String(url) === CONTEXT_URL ? context() : changed ? [row(STAGE_A, {
      voice_agent_id: kind === 'agente' ? OTHER_AGENT_ID : AGENT_ID, objective_prompt: 'Guion del contexto nuevo',
      organization_id: kind === 'organización' ? 140 : 120,
    })] : [row(), row(STAGE_B)]));
  const page = renderConIdioma(editor(AGENT_ID, onUnsavedChange)); await flush();
  fireEvent.change(prompt('A'), { target: { value: 'Borrador del contexto anterior' } });
  fireEvent.click(save('A')); await flush();
  const count = jest.mocked(fetch).mock.calls.length;
  changed = true;
  const oldSaved = row(STAGE_A, { objective_prompt: 'Guardado anterior tardío', updated_at: SAVED_VERSION });
  if (kind === 'organización') {
    await act(async () => {
      window.dispatchEvent(new Event('organization-changed'));
      pending.resolve(response(oldSaved));
      for (let n = 0; n < 12; n++) await Promise.resolve();
    });
  } else page.rerender(editor(OTHER_AGENT_ID, onUnsavedChange));
  await flush();
  expect(screen.queryByDisplayValue('Borrador del contexto anterior')).toBeNull();
  expect(screen.getByDisplayValue('Guion del contexto nuevo')).toBeTruthy();
  expect(onUnsavedChange.mock.calls.at(-1)).toEqual([false]);
  if (kind === 'agente') pending.resolve(response(oldSaved));
  await flush();
  expect(screen.queryByDisplayValue('Guardado anterior tardío')).toBeNull();
  expect(screen.getByDisplayValue('Guion del contexto nuevo')).toBeTruthy();
  expect(fetch).toHaveBeenCalledTimes(count + 2);
});

it('desmontar cancela ambas lecturas y sus temporizadores aunque fetch ignore abort', async () => {
  global.fetch = jest.fn(() => new Promise<Response>(() => undefined));
  const page = renderConIdioma(editor()); await flush();
  expect(fetch).toHaveBeenCalledTimes(2);
  page.unmount(); await flush();
  expect(jest.mocked(fetch).mock.calls.every(([, options]) => options?.signal?.aborted)).toBe(true);
  expect(jest.getTimerCount()).toBe(0);
});

it('StrictMode cancela su primera carga antes de emitir GET y conserva las filas al recargar después de guardar', async () => {
  const refreshRows = deferred<Response>(); let saved = false;
  const savedA = row(STAGE_A, { objective_prompt: 'Guion guardado A', updated_at: SAVED_VERSION });
  jest.mocked(fetch).mockImplementation(async (url, options) => {
    if (options?.method === 'POST') { saved = true; return response(savedA); }
    return String(url) === CONTEXT_URL ? response(context()) : saved ? refreshRows.promise : response([row(), row(STAGE_B)]);
  });
  renderConIdioma(<StrictMode>{editor()}</StrictMode>); await flush();
  expect(fetch).toHaveBeenCalledTimes(2);
  const fieldA = prompt('A');
  fireEvent.change(fieldA, { target: { value: 'Guion guardado A' } });
  fireEvent.click(save('A')); await flush();
  expect(prompt('A')).toBe(fieldA);
  expect(fieldA.value).toBe('Guion guardado A');
  refreshRows.resolve(response([savedA, row(STAGE_B)])); await flush();
  expect(prompt('A').value).toBe('Guion guardado A');
});
