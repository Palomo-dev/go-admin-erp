/**
 * Fase 2 · Parte C (ronda 12) · GET /api/integrations/qr/status.
 *
 * Regla dura 5: la organización sale de la sesión. El route tomaba
 * `organizationId` del query string y solo exigía sesión; con referencias
 * predecibles (`POS-<Date.now()>-<orgId>`) un usuario autenticado de OTRA
 * organización leía status/amount/paid_at de sesiones ajenas (preexistente al
 * F2-C, pero «Verificar pago» de AA añadió un caller manual más).
 *
 * `getServerOrgContextFor` va doblado con la sesión de la organización 120:
 * cualquier otro id lanza `OrgContextError(403, 'ORG_FORBIDDEN')`, sin sesión
 * lanza 401. `getQrSessionByReference` se dobla para comprobar que la consulta
 * usa la organización de la SESIÓN, nunca la de la query.
 *
 * - Sesión de A (120) con organizationId=B (999) → 403 y registro, sin
 *   tocar `payment_qr_sessions`.
 * - Sin sesión → 401.
 * - Sesión de A con organizationId=A → 200 con el mismo contrato de siempre
 *   ({status, reference, amount, paid_at}); QrPoller no necesita cambios.
 * - Sin parámetros / organizationId no numérico → 400; referencia inexistente → 404.
 */

const { OrgContextError } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');

const SESSION_ORG = 120;
let hasSession = true;

jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError,
  getServerOrgContextFor: jest.fn(async (organizationId: number) => {
    if (!hasSession) throw new OrgContextError('No autenticado', 401, 'UNAUTHENTICATED');
    if (organizationId !== SESSION_ORG) throw new OrgContextError('No perteneces a esa organización', 403, 'ORG_FORBIDDEN');
    return { organizationId: SESSION_ORG, userId: 'u-1', roleId: 4, roleName: 'x', isSuperAdmin: false, organizationName: 'Org 120', memberId: 1, supabase: {} as never };
  }),
}));

const getQrSessionByReference = jest.fn(async (organizationId: number, reference: string) => {
  if (organizationId === SESSION_ORG && reference === 'POS-1-120') {
    return { status: 'paid', amount: 25_000, paid_at: '2026-09-22T10:00:00.000Z', reference, organization_id: SESSION_ORG };
  }
  return null;
});
jest.mock('@/lib/services/integrations/qrShared/qrSessionService', () => ({
  getQrSessionByReference: (...a: unknown[]) => getQrSessionByReference(...(a as [number, string])),
}));

import { NextRequest } from 'next/server';
import { GET } from '@/app/api/integrations/qr/status/route';

function get(query: string) {
  return GET(new NextRequest(`http://localhost/api/integrations/qr/status${query}`));
}

let warn: jest.SpyInstance;
beforeEach(() => {
  hasSession = true;
  getQrSessionByReference.mockClear();
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('GET /api/integrations/qr/status · la organización sale de la sesión (regla dura 5)', () => {
  it('sesión de la org A (120) con organizationId=B (999) → 403 con código, registro y payment_qr_sessions no se consulta', async () => {
    const res = await get('?reference=POS-1-999&organizationId=999');
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'ORG_FORBIDDEN' });
    expect(getQrSessionByReference).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/organizationId ajeno/), expect.objectContaining({ organizationId: 999, code: 'ORG_FORBIDDEN' }));
  });

  it('sin sesión → 401, sin consultar la tabla', async () => {
    hasSession = false;
    const res = await get('?reference=POS-1-120&organizationId=120');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'No autorizado' });
    expect(getQrSessionByReference).not.toHaveBeenCalled();
  });

  it('sesión de A con organizationId=A → 200 con el contrato de siempre, consultando con la organización de la SESIÓN', async () => {
    const res = await get('?reference=POS-1-120&organizationId=120');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'paid', reference: 'POS-1-120', amount: 25_000, paid_at: '2026-09-22T10:00:00.000Z' });
    expect(getQrSessionByReference).toHaveBeenCalledTimes(1);
    expect(getQrSessionByReference).toHaveBeenCalledWith(SESSION_ORG, 'POS-1-120');
    expect(warn).not.toHaveBeenCalled();
  });

  it('referencia que no existe en la organización de la sesión → 404', async () => {
    const res = await get('?reference=POS-2-120&organizationId=120');
    expect(res.status).toBe(404);
  });

  it('sin parámetros o con organizationId no numérico → 400 antes de resolver la sesión', async () => {
    expect((await get('')).status).toBe(400);
    expect((await get('?reference=POS-1-120')).status).toBe(400);
    expect((await get('?reference=POS-1-120&organizationId=abc')).status).toBe(400);
    expect(getQrSessionByReference).not.toHaveBeenCalled();
  });

  it('estático: el route no usa createRouteHandlerClient ni pasa el organizationId de la query a la consulta', () => {
    const { readFileSync } = jest.requireActual<typeof import('fs')>('fs');
    const { join } = jest.requireActual<typeof import('path')>('path');
    const src = readFileSync(join(process.cwd(), 'src/app/api/integrations/qr/status/route.ts'), 'utf8');
    expect(src).not.toContain('createRouteHandlerClient');
    expect(src).toContain('getServerOrgContextFor(organizationId)');
    expect(src).toContain('getQrSessionByReference(ctx.organizationId, reference)');
  });
});
