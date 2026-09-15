/**
 * F12 — error de dominio de referidos y partners (módulo hoja, sin
 * dependencias): lo lanzan los servicios y lo mapea `f12RouteSupport.routeError`.
 * Vive aparte para que los servicios no arrastren `next/server` ni
 * `orgContext` (→ `svix`, ESM puro que no carga en Jest CJS).
 */
export class F12Error extends Error {
  statusCode: number;
  code: string;
  extra: Record<string, unknown>;
  constructor(statusCode: number, code: string, message: string, extra: Record<string, unknown> = {}) {
    super(message);
    this.name = 'F12Error';
    this.statusCode = statusCode;
    this.code = code;
    this.extra = extra;
  }
}

export const notFound = (what: string) => new F12Error(404, 'NOT_FOUND', `${what} no encontrado en esta organización`);
