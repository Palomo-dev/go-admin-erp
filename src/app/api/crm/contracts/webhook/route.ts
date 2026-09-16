/**
 * POST /api/crm/contracts/webhook — ruta histórica del webhook de Documenso.
 *
 * F10: la versión anterior aceptaba `{event, document_id, status}` sin
 * verificar ninguna firma y actualizaba el contrato con service role: cualquiera
 * podía marcar firmado un contrato conociendo su id de documento. Ahora delega
 * en la misma implementación verificada que `/api/crm/webhooks/documenso`.
 * Nota: esta ruta NO está excluida en `src/middleware.ts` (la nueva sí), así
 * que la URL que se registra en el proveedor debe ser la nueva.
 */
export { POST, runtime } from '@/app/api/crm/webhooks/documenso/route';
