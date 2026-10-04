/** Trazas de lectura acotadas, compartidas por middleware Edge y handlers Node. */
export const CRM_READ_TRACE_HEADER = 'x-go-crm-read-id';

const ROUTES = new Set([
  '/api/crm/voices/library',
  '/api/crm/voices',
  '/api/crm/config/providers',
  '/api/crm/voice-agents',
]);
const STAGES = new Set([
  'middleware-start', 'auth-start', 'auth-end', 'middleware-end',
  'handler-start', 'context-start', 'context-end', 'library-start', 'library-end',
]);
const CODES = new Set([
  'REQUEST_TIMEOUT', 'REQUEST_ABORTED', 'UNAUTHENTICATED', 'SESSION_EXPIRED',
  'FORBIDDEN', 'BAD_REQUEST', 'ORG_FORBIDDEN', 'NO_MEMBERSHIP', 'ORG_AMBIGUOUS',
  'FOREIGN_ORGANIZATION', 'ADMIN_REQUIRED', 'PROVIDER_ERROR', 'INTERNAL_ERROR',
  'credentials_unavailable', 'provider_timeout', 'provider_unavailable',
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface CrmReadTrace {
  readonly id: string;
  step(stage: string): void;
  finish(status: number, code?: string): void;
}

export function isCrmReadTraceRoute(route: string): boolean {
  return ROUTES.has(route);
}

/** Web Crypto funciona en ambos runtimes; el fallback conserva UUID v4. */
function newId(): string {
  if (typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID();
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function createCrmReadTrace(route: string, requestId?: string): CrmReadTrace {
  const id = typeof requestId === 'string' && UUID.test(requestId) ? requestId.toLowerCase() : newId();
  const allowed = isCrmReadTraceRoute(route);
  const start = Date.now();
  let finished = false;
  const emit = (stage: string, result?: { status: number; code?: string }) => {
    if (!allowed) return;
    const now = Date.now();
    const elapsed = now - start;
    console.info('[crm/read]', {
      requestId: id, route, stage,
      atMs: Number.isFinite(now) ? Math.max(0, Math.floor(now)) : 0,
      elapsedMs: Number.isFinite(elapsed) ? Math.max(0, Math.floor(elapsed)) : 0,
      ...result,
    });
  };
  return {
    id,
    step(stage) { if (!finished && STAGES.has(stage)) emit(stage); },
    finish(status, code) {
      if (finished) return;
      finished = true;
      const safeStatus = Number.isInteger(status) && status >= 100 && status <= 599 ? status : 500;
      // Una expresión regular no basta: un token o un mensaje también puede parecer un código.
      const safeCode = typeof code === 'string' ? CODES.has(code) ? code : 'INTERNAL_ERROR' : undefined;
      emit('finish', { status: safeStatus, ...(safeCode ? { code: safeCode } : {}) });
    },
  };
}
