// ============================================================
// /api/integrations/open-finance/cron/scheduled-payments
// Cron de Open Finance — DESHABILITADO (no-op seguro).
//
// SEGURIDAD (GO-sec, 2026-09-23; auditoria de integraciones §1.3):
// - Antes solo exportaba POST (Vercel cron llama con GET), comparaba con
//   `OPEN_FINANCE_CRON_SECRET` (Vercel envia `CRON_SECRET`) con `===`, y el
//   middleware lo redirigia a login (307): nunca se ejecuto.
// - Ahora: GET y POST con `withCron` (Authorization: Bearer CRON_SECRET,
//   comparacion en tiempo constante, fail-closed: sin secreto real → 401),
//   excluido del middleware como los demas crons.
// - Este cron ejecutaria PAGOS programados con la llave de la plataforma (el
//   mismo flujo que `transfer`/`pay-supplier`, deshabilitados con 501): no
//   corre hasta el rediseno del producto de pagos. Responde 200 con
//   `disabled: true` y no toca la base ni al proveedor.
// ============================================================

import { withCron } from '@/lib/utils/orgContext';
import { respuestaCronDeshabilitado } from '@/lib/services/integrations/openFinance/seguridadRutas';

const handler = withCron(async () => respuestaCronDeshabilitado('scheduled-payments'));

export const GET = handler;
export const POST = handler;
