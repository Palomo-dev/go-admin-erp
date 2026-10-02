/**
 * Lista de reglas de automatización: llamadas de red y estado, sin React
 * (ronda 4). `useAutomationRules` solo cablea `useReducer(applyMutation)` con
 * estas funciones; así se prueban EJECUTADAS con `fetch` doblado
 * (`ruleMutations.test.ts`): PATCH OK + GET 500 tiene que dejar en pantalla la
 * fila que devolvió el servidor, nunca la vieja (R-2). Todo pasa por las rutas
 * de servidor: el navegador nunca escribe `automation_rules` directamente.
 */

import type { ConditionTrace } from './conditionsDsl';
import { upsertRule, withoutRule } from './ruleEditorModel';
import type { BulkAutomationPreview } from './automationBulkPreview';

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
/** El `fetch` del navegador, sin atar `this` (los tests pasan uno doblado). */
export const browserFetch: Fetch = (url, init) => fetch(url, init);

export interface RuleAction {
  type: string;
  [key: string]: unknown;
}

export interface AutomationRuleView {
  id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  event: string | null;
  pipeline_id: string | null;
  stage_id: string | null;
  is_active: boolean;
  priority: number;
  run_once_per_opportunity: boolean;
  cooldown_hours: number;
  actions: RuleAction[];
  conditions: unknown;
  last_run_at: string | null;
  runs_count: number;
  updated_at: string;
}

/** Respuesta de `POST /trigger` con `dry_run: true` (`testRunAutomationRule`). */
export interface DryRunResult {
  matched: boolean;
  skip_reason: string | null;
  trace: ConditionTrace[];
  actions_plan: { index: number; type: string | null; implemented: boolean }[];
}

export interface AutomationRunView {
  id: string;
  automation_rule_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  skip_reason: string | null;
  error_message: string | null;
  result: { results?: { index: number; type: string; status?: string; error?: string }[] } | null;
  created_at: string;
  completed_at: string | null;
}

// ─── Estado de la lista (reducer puro) ──────────────────────────────────────

export interface RulesState {
  scope?: number | null;
  rules: AutomationRuleView[];
  loading: boolean;
  /** `true` desde la primera carga buena: con `error`, la lista es la última conocida (R-2). */
  loaded: boolean;
  error: string | null;
  canManage: boolean;
  summary: AutomationSummary | null;
}
export interface AutomationSummary { active_rules: number; executed_7d: number; skipped_7d: number; failed_7d: number; from: string; until: string }

export type RulesEvent =
  | { type: 'scope_changed'; scope: number | null }
  | { type: 'load_started' }
  | { type: 'load_ok'; rows: AutomationRuleView[]; canManage?: boolean; summary?: AutomationSummary | null }
  | { type: 'load_failed'; message: string }
  | { type: 'upserted'; row: AutomationRuleView }
  | { type: 'removed'; id: string };

export const INITIAL_RULES_STATE: RulesState = { rules: [], loading: true, loaded: false, error: null, canManage: false, summary: null };

export function applyMutation(state: RulesState, event: RulesEvent): RulesState {
  switch (event.type) {
    case 'scope_changed': return { ...INITIAL_RULES_STATE, scope:event.scope };
    // Solo la primera carga muestra el esqueleto (M26): las recargas tras
    // guardar, activar o borrar mantienen la lista montada, o el botón que
    // abrió la hoja dejaría de existir y el foco caería al body (H1).
    case 'load_started':
      return { ...state, loading: !state.loaded, error: null };
    case 'load_ok':
      return { ...state, rules: event.rows, loading: false, loaded: true, error: null, canManage: event.canManage === true, summary: event.summary ?? null };
    case 'load_failed':
      return { ...state, loading: false, error: event.message, canManage: false };
    case 'upserted':
      return { ...state, rules: upsertRule(state.rules, event.row) };
    case 'removed':
      return { ...state, rules: withoutRule(state.rules, event.id) };
  }
}

// ─── Red ────────────────────────────────────────────────────────────────────

const BASE = '/api/crm/automation-rules';

function messageOf(body: Record<string, unknown>, fallback: string): string {
  const issues = Array.isArray(body.issues) ? (body.issues as string[]).join('; ') : '';
  const error = typeof body.error === 'string' ? body.error : '';
  return [error || fallback, issues].filter(Boolean).join(' — ');
}

async function call(fetchFn: Fetch, url: string, init: RequestInit, fallback: string): Promise<Record<string, unknown>> {
  const res = await fetchFn(url, init);
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  if (!res.ok) throw new Error(messageOf(body, fallback));
  return body;
}

const jsonInit = (method: 'POST' | 'PATCH', payload: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});

/** Fila de la API → vista (las reglas viejas pueden traer `actions` null). */
function viewOf(row: unknown): AutomationRuleView {
  const r = row as AutomationRuleView;
  return { ...r, actions: r.actions ?? [] };
}

export async function fetchRules(fetchFn: Fetch): Promise<AutomationRuleView[]> {
  const body = await call(fetchFn, BASE, { cache: 'no-store' }, 'No se pudieron cargar las reglas');
  return ((body.data as unknown[]) ?? []).map(viewOf);
}

export async function createRule(fetchFn: Fetch, input: Partial<AutomationRuleView>): Promise<AutomationRuleView> {
  return viewOf((await call(fetchFn, BASE, jsonInit('POST', input), 'No se pudo guardar la regla')).data);
}

export async function patchRule(fetchFn: Fetch, id: string, patch: Partial<AutomationRuleView>, fallback: string): Promise<AutomationRuleView> {
  return viewOf((await call(fetchFn, `${BASE}/${id}`, jsonInit('PATCH', patch), fallback)).data);
}

/** Crear o editar: la fila que devuelve el servidor es la que se fusiona (R-2). */
export async function saveRule(fetchFn: Fetch, input: Partial<AutomationRuleView> & { id?: string }): Promise<{ type: 'upserted'; row: AutomationRuleView }> {
  const row = input.id ? await patchRule(fetchFn, input.id, input, 'No se pudo guardar la regla') : await createRule(fetchFn, input);
  return { type: 'upserted', row };
}

export async function toggleRule(fetchFn: Fetch, rule: AutomationRuleView): Promise<{ type: 'upserted'; row: AutomationRuleView }> {
  return { type: 'upserted', row: await patchRule(fetchFn, rule.id, { is_active: !rule.is_active }, 'No se pudo cambiar el estado') };
}

export async function deleteRule(fetchFn: Fetch, id: string): Promise<{ type: 'removed'; id: string }> {
  await call(fetchFn, `${BASE}/${id}`, { method: 'DELETE' }, 'No se pudo eliminar la regla');
  return { type: 'removed', id };
}

export async function loadRules(fetchFn: Fetch, dispatch: (e: RulesEvent) => void): Promise<void> {
  dispatch({ type: 'load_started' });
  try {
    const body = await call(fetchFn, BASE, { cache: 'no-store' }, 'No se pudieron cargar las reglas');
    dispatch({ type: 'load_ok', rows: ((body.data as unknown[]) ?? []).map(viewOf), canManage: body.can_manage === true, summary: (body.summary as AutomationSummary | undefined) ?? null });
  } catch (err) {
    dispatch({ type: 'load_failed', message: err instanceof Error ? err.message : 'Error desconocido' });
  }
}

export async function bulkDryRunRule(fetchFn: Fetch, id: string): Promise<BulkAutomationPreview> {
  return (await call(fetchFn, `/api/crm/automations/${encodeURIComponent(id)}/dry-run/bulk`, jsonInit('POST', {}), 'No se pudo simular la regla')).data as BulkAutomationPreview;
}

/**
 * Mutación → aplicar su respuesta → recargar. Si la mutación falla, lanza y no
 * toca nada; si la recarga falla, la respuesta de la mutación ya está aplicada.
 */
export async function runMutation<E extends RulesEvent>(fetchFn: Fetch, dispatch: (e: RulesEvent) => void, op: () => Promise<E>): Promise<E> {
  const event = await op();
  dispatch(event);
  await loadRules(fetchFn, dispatch);
  return event;
}

export async function dryRunRule(fetchFn: Fetch, id: string, opportunityId: string | null): Promise<DryRunResult> {
  const body = await call(fetchFn, `/api/crm/automations/${encodeURIComponent(id)}/dry-run`, jsonInit('POST', { opportunity_id: opportunityId }), 'No se pudo simular la regla');
  const data = body.data as Partial<DryRunResult>;
  return {
    matched: !!data.matched,
    skip_reason: data.skip_reason ?? null,
    trace: Array.isArray(data.trace) ? data.trace : [],
    actions_plan: Array.isArray(data.actions_plan) ? data.actions_plan : [],
  };
}

export async function fetchRuns(fetchFn: Fetch, ruleId?: string): Promise<AutomationRunView[]> {
  const qs = ruleId ? `?rule_id=${encodeURIComponent(ruleId)}&limit=50` : '?limit=50';
  const body = await call(fetchFn, `/api/crm/automation-runs${qs}`, { cache: 'no-store' }, 'No se pudo cargar el historial');
  return (body.data as AutomationRunView[]) ?? [];
}
