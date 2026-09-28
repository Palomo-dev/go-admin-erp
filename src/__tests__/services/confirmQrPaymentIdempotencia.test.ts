/// <reference types="jest" />
/**
 * confirmQrPayment: el proveedor reintenta y puede mandar dos avisos a la vez.
 * El cambio de estado de la sesión es un reclamo atómico, así que solo uno de
 * los dos crea el pago. Otra organización no toca la sesión.
 */

type Fila = Record<string, unknown>;

const db: { payment_qr_sessions: Fila[]; payments: Fila[] } = { payment_qr_sessions: [], payments: [] };

/** Cliente mínimo con la semántica que usa confirmQrPayment (filtros eq/neq, select, single). */
function consulta(tabla: keyof typeof db) {
  const filtros: Array<(f: Fila) => boolean> = [];
  let cambio: Fila | null = null;
  let nueva: Fila | null = null;
  const q = {
    select: () => q,
    update: (c: Fila) => { cambio = c; return q; },
    insert: (f: Fila) => { nueva = f; return q; },
    eq: (col: string, v: unknown) => { filtros.push((f) => f[col] === v); return q; },
    neq: (col: string, v: unknown) => { filtros.push((f) => f[col] !== v); return q; },
    single: async () => ejecutar(true),
    maybeSingle: async () => ejecutar(true),
    then: (ok: (r: unknown) => unknown, ko?: (e: unknown) => unknown) => ejecutar(false).then(ok, ko),
  };
  async function ejecutar(uno: boolean) {
    if (nueva) {
      const fila = { id: `pay-${db[tabla].length + 1}`, ...nueva };
      db[tabla].push(fila);
      return { data: uno ? fila : [fila], error: null };
    }
    const filas = db[tabla].filter((f) => filtros.every((p) => p(f)));
    if (cambio) filas.forEach((f) => Object.assign(f, cambio));
    return { data: uno ? filas[0] ?? null : filas, error: null };
  }
  return q;
}

jest.mock('@/lib/supabase/admin', () => ({ getSupabaseAdmin: () => ({ from: (t: 'payment_qr_sessions' | 'payments') => consulta(t) }) }));
jest.mock('@/lib/services/integrations/qrShared/autoReconciliation', () => ({ autoMatchFromWebhook: jest.fn() }));
jest.mock('@/lib/services/integrations/qrShared/qrNotificationService', () => ({
  createPaymentReceivedNotification: jest.fn(),
  createQrExpiredNotification: jest.fn(),
}));

import { confirmQrPayment } from '@/lib/services/integrations/qrShared/paymentConfirmation';

const ORG = 120;
const OTRA = 999;

beforeEach(() => {
  db.payments = [];
  db.payment_qr_sessions = [
    { id: 'qr-1', organization_id: ORG, status: 'pending', payment_id: null, reference: 'POS-1-120', amount: 50000, currency: 'COP', provider_code: 'bancolombia_qr_wompi', branch_id: 1 },
  ];
});

test('dos APPROVED simultáneos crean un solo pago', async () => {
  const [a, b] = await Promise.all([
    confirmQrPayment({ qrSessionId: 'qr-1', organizationId: ORG, status: 'paid' }),
    confirmQrPayment({ qrSessionId: 'qr-1', organizationId: ORG, status: 'paid' }),
  ]);
  expect(a.success && b.success).toBe(true);
  expect(db.payments).toHaveLength(1);
  expect(db.payment_qr_sessions[0]).toEqual(expect.objectContaining({ status: 'paid', payment_id: db.payments[0].id }));
});

test('un reintento después de pagada devuelve el mismo pago sin crear otro', async () => {
  const primero = await confirmQrPayment({ qrSessionId: 'qr-1', organizationId: ORG, status: 'paid' });
  const segundo = await confirmQrPayment({ qrSessionId: 'qr-1', organizationId: ORG, status: 'paid' });
  expect(db.payments).toHaveLength(1);
  expect(segundo.paymentId).toBe(primero.paymentId);
});

test('un rechazo tardío no deshace una sesión pagada', async () => {
  await confirmQrPayment({ qrSessionId: 'qr-1', organizationId: ORG, status: 'paid' });
  await confirmQrPayment({ qrSessionId: 'qr-1', organizationId: ORG, status: 'rejected' });
  expect(db.payment_qr_sessions[0].status).toBe('paid');
});

test('otra organización no encuentra ni toca la sesión', async () => {
  const r = await confirmQrPayment({ qrSessionId: 'qr-1', organizationId: OTRA, status: 'paid' });
  expect(r.success).toBe(false);
  expect(db.payments).toHaveLength(0);
  expect(db.payment_qr_sessions[0].status).toBe('pending');
});
