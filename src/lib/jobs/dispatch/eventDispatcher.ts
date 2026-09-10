import type { CrmEvent, JobContext } from '../types';

/**
 * Despachador de eventos del outbox (`crm_events`) a listeners en proceso.
 *
 * F0 registra un único listener (`opportunity.stage_changed` → activity
 * `system`). F8 registrará aquí el motor de reglas (`automation`) y el de
 * secuencias (`sequence`); F6 los `stage_agents`. Contrato:
 *
 *   onCrmEvent('opportunity.stage_changed', async (event, ctx) => {...})
 *   onCrmEvent('*', fn)   // comodín: recibe todos los eventos
 *
 * Los listeners deben ser IDEMPOTENTES: si alguno lanza, el job `crm_event`
 * se reintenta completo (fn_fail_job con backoff) y los demás listeners
 * volverán a ejecutarse.
 */

export type CrmEventListenerContext = Pick<JobContext, 'supabase' | 'orgId' | 'log' | 'signal'>;

export type CrmEventListener = (
  event: CrmEvent,
  ctx: CrmEventListenerContext,
) => Promise<Record<string, unknown> | void>;

export interface ListenerResult {
  name: string;
  ok: boolean;
  ms: number;
  result?: Record<string, unknown> | void;
  error?: string;
}

export interface DispatchResult {
  listeners: number;
  results: ListenerResult[];
}

interface Registered {
  name: string;
  fn: CrmEventListener;
}

const listeners = new Map<string, Registered[]>();

export function onCrmEvent(type: string, fn: CrmEventListener, name?: string): () => void {
  const entry: Registered = { name: name ?? fn.name ?? 'anonymous', fn };
  const list = listeners.get(type) ?? [];
  list.push(entry);
  listeners.set(type, list);
  return () => offCrmEvent(type, fn);
}

export function offCrmEvent(type: string, fn: CrmEventListener): void {
  const list = listeners.get(type);
  if (!list) return;
  const next = list.filter((l) => l.fn !== fn);
  if (next.length) listeners.set(type, next);
  else listeners.delete(type);
}

export function getCrmEventListeners(type: string): Registered[] {
  return [...(listeners.get(type) ?? []), ...(listeners.get('*') ?? [])];
}

/** Solo para tests. */
export function clearCrmEventListeners(): void {
  listeners.clear();
}

export class CrmEventDispatchError extends Error {
  results: ListenerResult[];
  constructor(message: string, results: ListenerResult[]) {
    super(message);
    this.name = 'CrmEventDispatchError';
    this.results = results;
  }
}

/**
 * Ejecuta todos los listeners del tipo (y los comodín) en orden de registro.
 * Cada listener se aísla: uno que falla no impide a los demás. Al final, si
 * hubo fallos, lanza `CrmEventDispatchError` con el detalle para que el
 * handler `crm_event` marque el evento como `failed` y el job se reintente.
 */
export async function dispatchCrmEvent(event: CrmEvent, ctx: CrmEventListenerContext): Promise<DispatchResult> {
  const registered = getCrmEventListeners(event.event_type);
  const results: ListenerResult[] = [];

  for (const { name, fn } of registered) {
    if (ctx.signal.aborted) {
      results.push({ name, ok: false, ms: 0, error: 'aborted' });
      continue;
    }
    const started = Date.now();
    try {
      const result = await fn(event, ctx);
      results.push({ name, ok: true, ms: Date.now() - started, result: result ?? undefined });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ctx.log.error('crm_event_listener_failed', { listener: name, event_type: event.event_type, error: message });
      results.push({ name, ok: false, ms: Date.now() - started, error: message });
    }
  }

  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    throw new CrmEventDispatchError(
      `${failed.length}/${results.length} listeners fallaron: ${failed.map((f) => `${f.name}: ${f.error}`).join('; ')}`,
      results,
    );
  }

  return { listeners: registered.length, results };
}
