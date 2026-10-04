/** @jest-environment jsdom */
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import { ensureSessionSynced } from '@/lib/supabase/config';
import { AgentesIaPage } from '../AgentesIaPage';
import es from '../../../../../messages/es.json';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }), usePathname: () => '/app/crm/agentes-ia', useSearchParams: () => new URLSearchParams() }));
jest.mock('@/lib/supabase/config', () => ({ supabase: {}, ensureSessionSynced: jest.fn() }));
jest.mock('@/lib/hooks/useOrganization', () => ({ ORGANIZATION_CHANGED_EVENT: 'organization-changed' }));
jest.mock('../AgentEditorDialog', () => ({ AgentEditorDialog: () => null }));
jest.mock('../AgentMetricsPanel', () => ({ AgentMetricsPanel: () => null }));
jest.mock('../VoicesPanel', () => ({ VoicesPanel: () => null }));
jest.mock('../AgentCampaignsPanel', () => ({ AgentCampaignsPanel: () => null }));
jest.mock('../useAgentSummary', () => ({ useAgentSummary: () => ({ summaries: {}, loading: false }), completeAgentSummary: () => null, bookedMeetings: () => 0 }));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({ useOrgTimezone: () => ({ timezone: 'UTC' }), useFormatDate: () => ({ formatDateTime: (value: string) => value }) }));

const originalFetch = global.fetch;
const TIMEOUT = 20_000;
const AGENT_ID = '10000000-0000-4000-8000-000000000001';
const STAGE_ID = '10000000-0000-4000-8000-000000000002';
const VOICE_ID = '10000000-0000-4000-8000-000000000003';
const agent = (name = 'Agente de prueba') => ({ id: AGENT_ID, name, purpose_type: 'sales', engine: 'conversation_relay', language: 'es', llm_model: 'modelo-de-prueba', voice_id: null, voice_ref_id: VOICE_ID, is_active: true, allowed_tools: [] });
function fixture(url: string, name?: string) {
  if (url === '/api/crm/voice-agents') return [agent(name)];
  if (url === '/api/crm/stage-agents') return [{ id: 'guion-de-prueba', stage_id: STAGE_ID, voice_agent_id: AGENT_ID, channel: 'voice', is_active: true, action_policy: 'suggest' }];
  if (url === '/api/crm/voices') return [{ id: VOICE_ID, name: 'Voz de prueba', is_active: true }];
  return { pipelines: [{ stages: [{ id: STAGE_ID, name: 'Etapa de prueba' }] }] };
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
const requests = () => jest.mocked(fetch).mock.calls.map(([, options]) => options?.signal);

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['queueMicrotask', 'nextTick'] });
  jest.mocked(ensureSessionSynced).mockReset();
  global.fetch = jest.fn(async url => response(fixture(String(url))));
});
afterEach(async () => {
  await act(async () => cleanup());
  global.fetch = originalFetch;
  jest.restoreAllMocks();
  jest.useRealTimers();
});

it('publica la lista sin esperar contexto; el timeout complementario muestra error y permite reintentar', async () => {
  const context = deferred<Response>();
  jest.mocked(fetch).mockImplementation(async url => String(url).endsWith('/editor-context') ? context.promise : response(fixture(String(url))));
  renderConIdioma(<AgentesIaPage />); await flush();
  expect(screen.getByText('Agente de prueba')).toBeTruthy();
  expect(screen.queryByText(es.crm.agentesIa.loadingAgents)).toBeNull();
  expect(screen.queryByRole('alert')).toBeNull();
  await act(async () => jest.advanceTimersByTimeAsync(TIMEOUT));
  expect(screen.getByText('Agente de prueba')).toBeTruthy();
  expect(screen.getByRole('alert').textContent).toContain(es.crm.agentesIa.editorContext);
  expect(screen.getByRole('button', { name: es.crm.agentesIa.retry })).toBeTruthy();
  context.resolve(response(fixture('/api/crm/voice-agents/editor-context'))); await flush();
  expect(screen.queryByText('Etapa de prueba')).toBeNull();
  expect(screen.getByRole('alert')).toBeTruthy();
  jest.mocked(fetch).mockImplementation(async url => response(fixture(String(url))));
  fireEvent.click(screen.getByRole('button', { name: es.crm.agentesIa.retry })); await flush();
  expect(screen.getByText('Etapa de prueba')).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
});

it('un contexto sin permiso identifica la lectura fallida y conserva la lista válida', async () => {
  jest.mocked(fetch).mockImplementation(async url => String(url).endsWith('/editor-context') ? response(null, 403, 'sin_permiso') : response(fixture(String(url))));
  renderConIdioma(<AgentesIaPage />); await flush();
  expect(screen.getByText('Agente de prueba')).toBeTruthy();
  expect(screen.getByRole('alert').textContent).toContain(es.crm.agentesIa.detailPermissionError.replace('{detail}', es.crm.agentesIa.editorContext));
  expect(screen.queryByText(es.crm.agentesIa.loadErrorDescription)).toBeNull();
  expect(ensureSessionSynced).not.toHaveBeenCalled();
  expect(fetch).toHaveBeenCalledTimes(4);
});

it.each(['fetch', 'body'] as const)('un %s no cooperativo de la lista termina en error a los 20 s, sin reintento automático', async phase => {
  const pending = deferred<Response>();
  jest.mocked(fetch).mockImplementation(async url => {
    if (String(url) !== '/api/crm/voice-agents') return response(fixture(String(url)));
    return phase === 'fetch' ? pending.promise : { ...response([]), json: () => new Promise(() => undefined) } as Response;
  });
  renderConIdioma(<AgentesIaPage />); await flush();
  expect(screen.getByText(es.crm.agentesIa.loadingAgents)).toBeTruthy();
  await act(async () => jest.advanceTimersByTimeAsync(TIMEOUT - 1));
  expect(screen.queryByText(es.crm.agentesIa.loadErrorDescription)).toBeNull();
  await act(async () => jest.advanceTimersByTimeAsync(1));
  expect(screen.getByText(es.crm.agentesIa.loadErrorDescription)).toBeTruthy();
  expect(screen.queryByText(es.crm.agentesIa.loadingAgents)).toBeNull();
  expect(fetch).toHaveBeenCalledTimes(4);
  expect(requests()[0]?.aborted).toBe(true);
  expect(jest.getTimerCount()).toBe(0);
  pending.resolve(response([agent('Respuesta tardía')])); await flush();
  expect(screen.queryByText('Respuesta tardía')).toBeNull();
});

it('el plazo incluye la resincronización de sesión pendiente y evita un GET tardío', async () => {
  const sync = deferred<boolean>();
  jest.mocked(ensureSessionSynced).mockReturnValue(sync.promise);
  jest.mocked(fetch).mockImplementation(async url => String(url) === '/api/crm/voice-agents' ? response(null, 401, 'UNAUTHENTICATED') : response(fixture(String(url))));
  renderConIdioma(<AgentesIaPage />); await flush();
  expect(ensureSessionSynced).toHaveBeenCalledTimes(1);
  await act(async () => jest.advanceTimersByTimeAsync(TIMEOUT));
  expect(screen.getByText(es.crm.agentesIa.loadErrorDescription)).toBeTruthy();
  sync.resolve(true); await flush();
  expect(fetch).toHaveBeenCalledTimes(4);
  expect(jest.getTimerCount()).toBe(0);
});

it('un 403 conserva el error sin resincronizar sesión ni repetir peticiones', async () => {
  jest.mocked(fetch).mockImplementation(async url => String(url) === '/api/crm/voice-agents' ? response(null, 403, 'sin_permiso') : response(fixture(String(url))));
  renderConIdioma(<AgentesIaPage />); await flush();
  expect(screen.getByText(es.crm.agentesIa.loadErrorDescription)).toBeTruthy();
  expect(ensureSessionSynced).not.toHaveBeenCalled();
  expect(fetch).toHaveBeenCalledTimes(4);
});

it('desmontar cancela las cuatro lecturas y limpia sus temporizadores aunque fetch ignore señales', async () => {
  global.fetch = jest.fn(() => new Promise<Response>(() => undefined));
  const page = renderConIdioma(<AgentesIaPage />); await flush();
  expect(fetch).toHaveBeenCalledTimes(4);
  page.unmount(); await flush();
  expect(requests().every(signal => signal?.aborted)).toBe(true);
  expect(jest.getTimerCount()).toBe(0);
});

it('cambiar organización cancela la carga previa e ignora sus respuestas tardías', async () => {
  const old = deferred<Response>(); let changed = false;
  jest.mocked(fetch).mockImplementation(async url => changed ? response(fixture(String(url), 'Agente de la nueva organización')) : old.promise);
  const page = renderConIdioma(<AgentesIaPage />); await flush();
  const previous = requests(); changed = true;
  act(() => window.dispatchEvent(new Event('organization-changed'))); await flush();
  expect(previous.every(signal => signal?.aborted)).toBe(true);
  expect(screen.getByText('Agente de la nueva organización')).toBeTruthy();
  old.resolve(response([agent('Agente de la organización anterior')])); await flush();
  expect(screen.queryByText('Agente de la organización anterior')).toBeNull();
  expect(screen.getByText('Agente de la nueva organización')).toBeTruthy();
  expect(fetch).toHaveBeenCalledTimes(8);
  page.unmount(); await flush();
  expect(jest.getTimerCount()).toBe(0);
});

it('StrictMode y el éxito conservan voces, guiones y nombres de etapas', async () => {
  const page = renderConIdioma(<StrictMode><AgentesIaPage /></StrictMode>); await flush();
  expect(screen.getByText('Agente de prueba')).toBeTruthy();
  expect(screen.getByText('Voz de prueba')).toBeTruthy();
  expect(screen.getByText('Etapa de prueba')).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
  page.unmount(); await flush();
  expect(jest.getTimerCount()).toBe(0);
});

it('un PATCH exitoso recarga el estado y vuelve a habilitar el interruptor', async () => {
  let enabled = true;
  jest.mocked(fetch).mockImplementation(async (url, options) => {
    if (options?.method === 'PATCH') {
      enabled = false;
      return response({ id: AGENT_ID, is_active: enabled });
    }
    return response(String(url) === '/api/crm/voice-agents' ? [{ ...agent(), is_active: enabled }] : fixture(String(url)));
  });
  const page = renderConIdioma(<AgentesIaPage />); await flush();
  fireEvent.click(screen.getByRole('switch', { name: `${es.crm.agentesIa.deactivate} · Agente de prueba` })); await flush();
  const control = screen.getByRole('switch', { name: `${es.crm.agentesIa.activate} · Agente de prueba` }) as HTMLButtonElement;
  expect(control.disabled).toBe(false);
  expect(control.getAttribute('aria-checked')).toBe('false');
  const writes = jest.mocked(fetch).mock.calls.filter(([, options]) => options?.method === 'PATCH');
  expect(writes).toHaveLength(1);
  expect(writes[0][0]).toBe(`/api/crm/voice-agents/${AGENT_ID}`);
  expect(JSON.parse(String(writes[0][1]?.body))).toEqual({ is_active: false });
  expect(jest.mocked(fetch).mock.calls.filter(([url]) => url === '/api/crm/voice-agents')).toHaveLength(2);
  page.unmount(); await flush();
  expect(jest.getTimerCount()).toBe(0);
});

it('un PATCH de la organización anterior no recarga ni cambia el interruptor de la nueva', async () => {
  const write = deferred<Response>(); let changed = false;
  jest.mocked(fetch).mockImplementation(async (url, options) => options?.method === 'PATCH' ? write.promise : response(fixture(String(url), changed ? 'Agente de la nueva organización' : 'Agente de prueba')));
  const page = renderConIdioma(<AgentesIaPage />); await flush();
  fireEvent.click(screen.getByRole('switch', { name: `${es.crm.agentesIa.deactivate} · Agente de prueba` })); await flush();
  expect((screen.getByRole('switch') as HTMLButtonElement).disabled).toBe(true);
  changed = true;
  act(() => window.dispatchEvent(new Event('organization-changed'))); await flush();
  write.resolve(response({ id: AGENT_ID, is_active: false })); await flush();
  const control = screen.getByRole('switch', { name: `${es.crm.agentesIa.deactivate} · Agente de la nueva organización` }) as HTMLButtonElement;
  expect(control.disabled).toBe(false);
  expect(control.getAttribute('aria-checked')).toBe('true');
  expect(fetch).toHaveBeenCalledTimes(9);
  expect(screen.queryByText('Agente de prueba')).toBeNull();
  page.unmount(); await flush();
  expect(jest.getTimerCount()).toBe(0);
});
