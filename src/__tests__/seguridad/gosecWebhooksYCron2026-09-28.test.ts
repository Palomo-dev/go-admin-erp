/**
 * GO-sec 2026-09-28 — restos de la auditoría del middleware (91d0ea2f).
 *
 * - Cron de sesiones QR: withCron en GET y POST (Vercel Cron llama GET; antes
 *   solo había POST → 405), Bearer CRON_SECRET en tiempo constante, sin
 *   OPEN_FINANCE_CRON_SECRET de respaldo.
 * - Bre-B (Mono): la firma HMAC se compara en tiempo constante.
 * - Bold: el body crudo del webhook no va a los logs.
 * La exclusión del middleware de Meta por canal y del cron está en
 * middlewareSesionVerificada.test.ts.
 */
import * as fs from 'fs';
import * as path from 'path';
import crypto from 'crypto';

jest.mock('svix', () => ({ Webhook: class {} }));

const getExpiredQrSessions = jest.fn();
jest.mock('@/lib/services/integrations/qrShared/qrSessionService', () => ({
  getExpiredQrSessions: (...a: unknown[]) => getExpiredQrSessions(...a),
  getQrSessionForWebhook: jest.fn(),
}));
const actualizadas: unknown[] = [];
jest.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      update: (v: unknown) => {
        actualizadas.push(v);
        const q = { in: () => q, eq: async () => ({ error: null }) };
        return q;
      },
    }),
  }),
}));
jest.mock('@/lib/services/integrations/qrShared/paymentConfirmation', () => ({ confirmQrPayment: jest.fn() }));

import * as cronQr from '@/app/api/integrations/qr/expire-sessions/route';
import { monoService } from '@/lib/services/integrations/breb/monoService';

const RAIZ = path.resolve(__dirname, '..', '..', '..');
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), 'utf-8');
const SECRETO = 'cron-secreto-real-de-prueba-0123456789abcdef';
const params = { params: Promise.resolve({}) };

function peticion(metodo: 'GET' | 'POST', auth?: string) {
  return new Request('https://app.goadmin.io/api/integrations/qr/expire-sessions', {
    method: metodo,
    headers: auth ? { authorization: auth } : {},
  });
}

describe('cron /api/integrations/qr/expire-sessions', () => {
  const previo = { ...process.env };
  beforeEach(() => {
    jest.clearAllMocks();
    actualizadas.length = 0;
    process.env.CRON_SECRET = SECRETO;
    delete process.env.OPEN_FINANCE_CRON_SECRET;
    getExpiredQrSessions.mockResolvedValue([{ id: 's1', reference: 'POS-1-7', provider_code: 'wompi_co', amount: 1000 }]);
  });
  afterAll(() => {
    process.env = previo;
  });

  it.each(['GET', 'POST'] as const)('%s con el Bearer correcto expira las sesiones', async (metodo) => {
    const res = await cronQr[metodo](peticion(metodo, `Bearer ${SECRETO}`), params);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, expiredCount: 1 });
    expect(actualizadas).toEqual([expect.objectContaining({ status: 'expired' })]);
  });

  it.each(['GET', 'POST'] as const)('%s sin secreto o con secreto malo → 401 sin tocar nada', async (metodo) => {
    for (const auth of [undefined, 'Bearer otro', `Bearer ${SECRETO}x`]) {
      const res = await cronQr[metodo](peticion(metodo, auth), params);
      expect(res.status).toBe(401);
    }
    expect(getExpiredQrSessions).not.toHaveBeenCalled();
    expect(actualizadas).toHaveLength(0);
  });

  it('OPEN_FINANCE_CRON_SECRET ya no sirve para este cron', async () => {
    process.env.OPEN_FINANCE_CRON_SECRET = 'otro-secreto-real-de-open-finance-0123456789';
    const res = await cronQr.GET(peticion('GET', `Bearer ${process.env.OPEN_FINANCE_CRON_SECRET}`), params);
    expect(res.status).toBe(401);
  });

  it('sin CRON_SECRET configurado → 401 (fail-closed)', async () => {
    delete process.env.CRON_SECRET;
    const res = await cronQr.GET(peticion('GET', 'Bearer '), params);
    expect(res.status).toBe(401);
  });
});

describe('Bre-B (Mono): firma del webhook', () => {
  const secreto = 'whsec_mono_prueba';
  const cuerpo = '{"event":"payment.succeeded"}';
  const hex = crypto.createHmac('sha256', secreto).update(cuerpo).digest('hex');
  const b64 = crypto.createHmac('sha256', secreto).update(cuerpo).digest('base64');

  it('acepta la firma en hex o base64 y rechaza cualquier otra', () => {
    expect(monoService.verifyWebhookSignature(cuerpo, hex, secreto)).toBe(true);
    expect(monoService.verifyWebhookSignature(cuerpo, b64, secreto)).toBe(true);
    expect(monoService.verifyWebhookSignature(cuerpo, hex.slice(0, -1) + (hex.endsWith('0') ? '1' : '0'), secreto)).toBe(false);
    expect(monoService.verifyWebhookSignature(cuerpo, hex.slice(0, 10), secreto)).toBe(false);
    expect(monoService.verifyWebhookSignature(cuerpo, '', secreto)).toBe(false);
  });

  it('compara en tiempo constante (sin === sobre la firma)', () => {
    const src = leer('src/lib/services/integrations/breb/monoService.ts');
    expect(src).toMatch(/timingSafeEqual/);
    expect(src).not.toMatch(/calculated(Hex|Base64) === signature/);
  });
});

describe('Bold: el webhook no registra el body crudo', () => {
  it('ningún console.* recibe rawBody', () => {
    const src = leer('src/app/api/integrations/bold/webhook/route.ts');
    expect(src).not.toMatch(/console\.\w+\([^)]*rawBody\s*\)/);
  });
});
