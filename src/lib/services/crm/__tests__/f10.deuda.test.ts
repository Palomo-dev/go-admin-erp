/// <reference types="jest" />
/**
 * F10 — deuda viva (consolidación 2026-09-21). Cada `it.failing` reproduce un
 * defecto real que sigue abierto: si algún día pasa en verde, jest lo marca en
 * rojo y hay que convertirlo en `it` normal.
 *
 * A6 (tester r2, `f10Round2Tester`): `isStripeReferenceDuplicate` acepta
 * cualquier 23505 cuyo mensaje contenga «payments» (`/payments/.test(message)`),
 * así que un 23505 de OTRA restricción (`payments_pkey`, `payments_new_pkey`)
 * con referencia `stripe:` se responde como «ya registrado» y el pago se
 * pierde en silencio. La RPC `fn_register_crm_payment` mitiga el caso real
 * (solo convierte en `duplicate` el índice exacto), pero la función de Node
 * sigue siendo demasiado laxa para el camino de respaldo.
 */
import { isStripeReferenceDuplicate } from '@/lib/services/crm/paymentService';

describe('deuda F10', () => {
  it.failing('A6 un 23505 de OTRA restricción (payments_pkey) con referencia stripe: no debe pasar por duplicado', () => {
    expect(isStripeReferenceDuplicate({ code: '23505', message: 'duplicate key value violates unique constraint "payments_pkey"' }, 'stripe:evt_1')).toBe(false);
  });
});
