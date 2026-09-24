// ============================================================
// /api/integrations/open-finance/cron/consent-expiry
// Cron de Open Finance — DESHABILITADO (no-op seguro).
//
// SEGURIDAD (GO-sec, 2026-09-23; auditoria de integraciones §1.3):
// - Antes solo exportaba POST (Vercel cron llama con GET), comparaba con
//   `OPEN_FINANCE_CRON_SECRET` (Vercel envia `CRON_SECRET`) con `===`, y el
//   middleware lo redirigia a login (307): nunca se ejecuto.
// - Ahora: GET y POST con `withCron` (Authorization: Bearer CRON_SECRET,
//   comparacion en tiempo constante, fail-closed: sin secreto real → 401),
//   excluido del middleware como los demas crons.
// - Mientras no exista el rediseno de la sesion bancaria (decision de
//   producto, auditoria §1.5 punto 3) el trabajo NO corre: responde 200 con
//   `disabled: true` y no toca la base ni al proveedor.
// ============================================================

import { withCron } from '@/lib/utils/orgContext';
import { respuestaCronDeshabilitado } from '@/lib/services/integrations/openFinance/seguridadRutas';

const handler = withCron(async () => respuestaCronDeshabilitado('consent-expiry'));

export const GET = handler;
export const POST = handler;
