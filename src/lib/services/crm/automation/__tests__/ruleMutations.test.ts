/**
 * Ronda 4 · punto 1: lo que hace `useAutomationRules` tras cada mutación,
 * EJECUTADO con `fetch` doblado (sin jsdom). El hook solo cablea
 * `useReducer(applyMutation)` con estas funciones, así que esto es lo que
 * corre en pantalla: PATCH/POST/DELETE responden y luego el GET falla; la
 * lista tiene que reflejar la respuesta de la mutación, nunca la fila vieja.
 * Con esto muere M-A5 (fusionar `rule` en vez de `body.data`), que el
 * guardarraíl de cadena de la ronda 3 no veía.
 */
import {
  applyMutation,
  deleteRule,
  INITIAL_RULES_STATE,
  loadRules,
  runMutation,
  saveRule,
  toggleRule,
  type AutomationRuleView,
  type Fetch,
  type RulesEvent,
  type RulesState,
} from '../ruleMutations';

interface Reply { status: number; body?: unknown }
interface Call { url: string; method: string; body: unknown }

/** `fetch` doblado: responde por método y registra cada llamada. */
function fakeFetch(replies: Partial<Record<string, Reply>>): { fetch: Fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetch: Fetch = async (url, init) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
    const reply = replies[method] ?? { status: 500, body: { error: 'sin respuesta doblada' } };
    return {
      ok: reply.status < 400,
      status: reply.status,
      json: async () => { if (reply.body === undefined) throw new Error('sin json'); return reply.body; },
    } as unknown as Response;
  };
  return { fetch, calls };
}

const row = (over: Partial<AutomationRuleView>): AutomationRuleView => ({
  id: 'a', name: 'A', description: null, trigger_type: 'stage_change', event: 'opportunity.stage_changed',
  pipeline_id: null, stage_id: null, is_active: true, priority: 10, run_once_per_opportunity: true,
  cooldown_hours: 0, actions: [], conditions: null, last_run_at: null, runs_count: 0, updated_at: 't0', ...over,
});

/** Estado y `dispatch` tal como los tiene el hook (`useReducer(applyMutation)`). */
function harness(initial: RulesState) {
  let state = initial;
  const dispatch = (e: RulesEvent) => { state = applyMutation(state, e); };
  return { dispatch, get state() { return state; } };
}

const GET_500 = { GET: { status: 500, body: { error: 'boom' } } };
const old = row({ id: 'a', is_active: true, updated_at: 't0' });
const other = row({ id: 'b', priority: 20 });
const loadedWith = (rules: AutomationRuleView[]): RulesState => ({ rules, loading: false, loaded: true, error: null });

describe('R-2 ejecutado · mutación OK + recarga fallida (la respuesta de la mutación manda)', () => {
  it('PATCH OK + GET 500 → el interruptor muestra la fila que devolvió el servidor, no la vieja (M-A5)', async () => {
    const server = { ...old, is_active: false, updated_at: 't1', runs_count: 7 };
    const { fetch, calls } = fakeFetch({ PATCH: { status: 200, body: { data: server } }, ...GET_500 });
    const h = harness(loadedWith([old, other]));
    await runMutation(fetch, h.dispatch, () => toggleRule(fetch, old));
    expect(calls.map((c) => [c.method, c.url])).toEqual([['PATCH', '/api/crm/automation-rules/a'], ['GET', '/api/crm/automation-rules']]);
    expect(calls[0].body).toEqual({ is_active: false });
    expect(h.state.rules.find((r) => r.id === 'a')).toEqual(server);
    expect(h.state.rules.map((r) => r.id)).toEqual(['a', 'b']); // última lista conocida, no vacía
    expect(h.state).toMatchObject({ loading: false, loaded: true, error: 'boom' });
  });

  it('POST OK + GET 500 → la regla nueva aparece con la fila del servidor (id, orden por prioridad, actions null → [])', async () => {
    const server = { ...row({ id: 'c', priority: 15 }), actions: null };
    const { fetch, calls } = fakeFetch({ POST: { status: 201, body: { data: server } }, ...GET_500 });
    const h = harness(loadedWith([old, other]));
    const event = await runMutation(fetch, h.dispatch, () => saveRule(fetch, { name: 'C', priority: 15 }));
    expect(calls[0]).toMatchObject({ method: 'POST', url: '/api/crm/automation-rules', body: { name: 'C', priority: 15 } });
    expect(event).toEqual({ type: 'upserted', row: { ...server, actions: [] } });
    expect(h.state.rules.map((r) => r.id)).toEqual(['a', 'c', 'b']);
  });

  it('save con id → PATCH a la ruta de la regla y reemplaza la fila', async () => {
    const server = { ...old, name: 'A2', updated_at: 't2' };
    const { fetch, calls } = fakeFetch({ PATCH: { status: 200, body: { data: server } }, ...GET_500 });
    const h = harness(loadedWith([old, other]));
    await runMutation(fetch, h.dispatch, () => saveRule(fetch, { id: 'a', name: 'A2' }));
    expect(calls[0]).toMatchObject({ method: 'PATCH', url: '/api/crm/automation-rules/a' });
    expect(h.state.rules.map((r) => r.name)).toEqual(['A2', 'A']);
  });

  it('DELETE OK + GET 500 → la tarjeta borrada desaparece', async () => {
    const { fetch, calls } = fakeFetch({ DELETE: { status: 200, body: {} }, ...GET_500 });
    const h = harness(loadedWith([old, other]));
    await expect(runMutation(fetch, h.dispatch, () => deleteRule(fetch, 'a'))).resolves.toEqual({ type: 'removed', id: 'a' });
    expect(calls[0]).toMatchObject({ method: 'DELETE', url: '/api/crm/automation-rules/a' });
    expect(h.state.rules.map((r) => r.id)).toEqual(['b']);
  });

  it('PATCH 500 → lanza con el mensaje del servidor, no toca la lista y no recarga', async () => {
    const { fetch, calls } = fakeFetch({ PATCH: { status: 500, body: { error: 'Regla bloqueada', issues: ['x'] } } });
    const h = harness(loadedWith([old, other]));
    await expect(runMutation(fetch, h.dispatch, () => toggleRule(fetch, old))).rejects.toThrow('Regla bloqueada — x');
    expect(calls.map((c) => c.method)).toEqual(['PATCH']);
    expect(h.state).toEqual(loadedWith([old, other]));
  });

  it('PATCH 500 sin cuerpo JSON → mensaje de respaldo', async () => {
    const { fetch } = fakeFetch({ PATCH: { status: 502 } });
    await expect(toggleRule(fetch, old)).rejects.toThrow('No se pudo cambiar el estado');
  });
});

describe('loadRules · esqueleto solo en la primera carga (M26) y última lista conocida al fallar', () => {
  it('primera carga: loading → lista; recarga fallida: sin esqueleto, error y lista intacta', async () => {
    const h = harness(INITIAL_RULES_STATE);
    const first = fakeFetch({ GET: { status: 200, body: { data: [old] } } });
    const p1 = loadRules(first.fetch, h.dispatch);
    expect(h.state.loading).toBe(true);
    await p1;
    expect(h.state).toEqual(loadedWith([old]));
    const p2 = loadRules(fakeFetch(GET_500).fetch, h.dispatch);
    expect(h.state).toMatchObject({ loading: false, error: null }); // la lista sigue montada mientras recarga
    await p2;
    expect(h.state).toEqual({ ...loadedWith([old]), error: 'boom' });
  });
});
