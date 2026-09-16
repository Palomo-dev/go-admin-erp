/**
 * Error de contexto de organización — módulo hoja, sin dependencias.
 *
 * Vivía dentro de `orgContext.ts`, que arrastra `next/headers`, los clientes
 * de Supabase y `webhookSignatures` → `svix` (ESM puro). Los módulos ligeros
 * que solo necesitan lanzar o reconocer este error (`organizationBody.ts`,
 * helpers de rutas, tests con `orgContext` doblado) lo importan de aquí;
 * `orgContext.ts` lo re-exporta, así que `import { OrgContextError } from
 * '@/lib/utils/orgContext'` sigue funcionando y es LA MISMA clase
 * (`instanceof` cruza sin problema).
 */
export class OrgContextError extends Error {
  statusCode: number;
  code: string;
  constructor(message: string, statusCode: number, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code ?? (statusCode === 401 ? 'UNAUTHENTICATED' : statusCode === 403 ? 'FORBIDDEN' : 'BAD_REQUEST');
    this.name = 'OrgContextError';
  }
}
