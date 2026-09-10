import { isJobKind, type JobHandler, type JobKind } from './types';

/**
 * Registro de handlers por `kind`.
 *
 * Los handlers se registran como side-effect al importar
 * `@/lib/jobs/handlers` (índice). El runner hace ese import; los tests pueden
 * registrar handlers falsos directamente con `registerJobHandler`.
 *
 * Un handler "placeholder" (F0) puede ser sobreescrito por el real que
 * registre una fase posterior (F3 `recording_cleanup`, F16 `campaign_batch`).
 * Sobreescribir un handler NO placeholder se loguea como aviso: casi siempre
 * es un import duplicado.
 */

interface Entry {
  handler: JobHandler;
  placeholder: boolean;
}

const registry = new Map<JobKind, Entry>();

export interface RegisterOptions {
  /** true = puede ser reemplazado silenciosamente por un handler real. */
  placeholder?: boolean;
}

export function registerJobHandler(kind: JobKind, handler: JobHandler, opts: RegisterOptions = {}): void {
  if (!isJobKind(kind)) {
    throw new Error(`registerJobHandler: kind desconocido "${String(kind)}"`);
  }
  const existing = registry.get(kind);
  if (existing && !existing.placeholder && !opts.placeholder) {
    console.warn(JSON.stringify({ level: 'warn', src: 'jobs.registry', msg: 'handler_overridden', kind }));
  }
  if (existing && !existing.placeholder && opts.placeholder) {
    // Nunca degradar un handler real a placeholder.
    return;
  }
  registry.set(kind, { handler, placeholder: !!opts.placeholder });
}

export function getJobHandler(kind: string): JobHandler | undefined {
  if (!isJobKind(kind)) return undefined;
  return registry.get(kind)?.handler;
}

export function hasRealJobHandler(kind: string): boolean {
  if (!isJobKind(kind)) return false;
  const entry = registry.get(kind);
  return !!entry && !entry.placeholder;
}

export function listRegisteredKinds(): JobKind[] {
  return Array.from(registry.keys());
}

/** Solo para tests. */
export function clearJobHandlers(): void {
  registry.clear();
}
