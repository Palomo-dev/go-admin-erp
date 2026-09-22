/**
 * Fase 2 · Parte C (ronda 12) · TESTER sobre GET /api/integrations/qr/status.
 *
 * Complementa qr-status-route-f2c-r12 (del builder) con lo que ahí no se
 * ataca: fallos que NO son OrgContextError (la sesión de Supabase se cae, la
 * consulta lanza) → 500 genérico sin filtrar el mensaje; un OrgContextError
 * de otro código (400 ORG_AMBIGUOUS) → viaja con SU código de estado y sin el
 * registro de «organización ajena», que es solo del 403 (ronda de cierre,
 * QA-6: antes todo lo que no era 401 se disfrazaba de 403); `parseInt`
 * permisivo («120abc», «120.9»,
 * « 120») cuenta como 120 —evidencia, no defecto: la membresía manda—;
 * organizationId 0 / negativo → 403 sin consultar; el 403 no lleva nada de
 * la sesión ni de la tabla; y `reference` con caracteres raros viaja tal
 * cual a la consulta (no se normaliza ni se recorta).
 *
 * `getServerOrgContextFor` y `getQrSessionByReference` doblados, sin base.
 * Organización ficticia (org 120), sin nombres reales.
 */

const { OrgContextError } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');

const SESSION_ORG = 120;
let orgBehaviour: 'ok' | 'no-session' | 'throw-generic' | 'ambiguous' = 'ok';
/** Forma mínima del contexto que devuelve el doble; `userEmail` admite null como en `ServerOrgContext`. */
type OrgContextLike = {
  organizationId: number;
  userId: string;
  userEmail: string | null;
  roleId: number;
  roleName: string;
  isSuperAdmin: boolean;
  organizationName: string;
  memberId: number;
  supabase: never;
};
const getServerOrgContextFor = jest.fn(async (organizationId: number): Promise<OrgContextLike> => {
  if (orgBehaviour === 'throw-generic') throw new Error('secreto: connection refused postgres://user:pass@host');
  if (orgBehaviour === 'no-session') throw new OrgContextError('No hay sesión activa', 401, 'UNAUTHENTICATED');
  // Mismo código y estado que el ORG_AMBIGUOUS real de orgContext.ts (400).
  if (orgBehaviour === 'ambiguous') throw new OrgContextError('Indica la organización activa (header X-Organization-Id o cookie goadmin_org_id)', 400, 'ORG_AMBIGUOUS');
  if (organizationId !== SESSION_ORG) throw new OrgContextError('No perteneces a esa organización', 403, 'ORG_FORBIDDEN');
  return { organizationId: SESSION_ORG, userId: 'u-1', userEmail: 'u@example.test', roleId: 4, roleName: 'x', isSuperAdmin: false, organizationName: 'Org 120', memberId: 1, supabase: {} as never };
});

jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError,
  getServerOrgContextFor: (...a: unknown[]) => getServerOrgContextFor(...(a as [number])),
}));

let sessionThrows = false;
/** Forma mínima de la fila que devuelve el doble; `paid_at` admite null como en la tabla. */
type QrSessionRowLike = {
  id?: string;
  status: string;
  amount: number;
  paid_at: string | null;
  reference: string;
  organization_id: number;
  provider?: string;
  qr_data?: string;
  metadata?: Record<string, unknown>;
};
const getQrSessionByReference = jest.fn(async (organizationId: number, reference: string): Promise<QrSessionRowLike | null> => {
  if (sessionThrows) throw new Error('secreto: relation payment_qr_sessions does not exist');
  if (organizationId === SESSION_ORG && reference === 'POS-1-120') {
    return { id: 'row-1', status: 'paid', amount: 25_000, paid_at: '2026-09-22T10:00:00.000Z', reference, organization_id: SESSION_ORG, provider: 'x', qr_data: 'EMV…', metadata: { secret: 1 } };
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
let error: jest.SpyInstance;
beforeEach(() => {
  orgBehaviour = 'ok';
  sessionThrows = false;
  getServerOrgContextFor.mockClear();
  getQrSessionByReference.mockClear();
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('GET /api/integrations/qr/status · fallos que no son de organización', () => {
  it('getServerOrgContextFor lanza un Error genérico (Supabase caído) → 500 «Error interno del servidor» sin el mensaje, registrado en console.error, sin consultar la tabla', async () => {
    orgBehaviour = 'throw-generic';
    const res = await get('?reference=POS-1-120&organizationId=120');
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: 'Error interno del servidor' });
    expect(JSON.stringify(body)).not.toContain('secreto');
    expect(error).toHaveBeenCalledTimes(1);
    expect(getQrSessionByReference).not.toHaveBeenCalled();
  });

  it('getQrSessionByReference lanza → 500 genérico sin el mensaje de Postgres', async () => {
    sessionThrows = true;
    const res = await get('?reference=POS-1-120&organizationId=120');
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: 'Error interno del servidor' });
    expect(JSON.stringify(body)).not.toContain('payment_qr_sessions');
  });

  it('OrgContextError que no es 401 ni 403 (400 ORG_AMBIGUOUS) → viaja con SU código de estado (400) y su `code`, SIN el registro de «organización ajena» (solo del 403), sin consultar', async () => {
    orgBehaviour = 'ambiguous';
    const res = await get('?reference=POS-1-120&organizationId=120');
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'ORG_AMBIGUOUS' });
    expect(warn).not.toHaveBeenCalled();
    expect(getQrSessionByReference).not.toHaveBeenCalled();
  });
});

describe('GET /api/integrations/qr/status · el organizationId de la query', () => {
  it('evidencia: parseInt es permisivo («120abc», «120.9», « 120») y todos cuentan como 120 → 200; la membresía es lo que manda, no el formato', async () => {
    for (const raw of ['120abc', '120.9', '%20120', '+120']) {
      const res = await get(`?reference=POS-1-120&organizationId=${raw}`);
      expect(res.status).toBe(200);
      expect(getServerOrgContextFor).toHaveBeenLastCalledWith(120);
    }
  });

  it('organizationId 0, negativo, «1e3» (=1) o de otra organización → 403 ORG_FORBIDDEN sin tocar la tabla, con registro por cada intento', async () => {
    for (const raw of ['0', '-1', '1e3', '121']) {
      const res = await get(`?reference=POS-1-120&organizationId=${raw}`);
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ code: 'ORG_FORBIDDEN' });
    }
    expect(getQrSessionByReference).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(4);
  });

  it('el 403 no lleva nada de la sesión (userId, email, organización) ni de la fila', async () => {
    const res = await get('?reference=POS-1-120&organizationId=999');
    const text = JSON.stringify(await res.json());
    for (const leak of ['u-1', 'u@example.test', 'Org 120', 'row-1', '25000', 'paid_at']) expect(text).not.toContain(leak);
  });

  it('el 200 devuelve SOLO {status, reference, amount, paid_at}: nunca id, provider, qr_data, metadata ni organization_id de la fila', async () => {
    const res = await get('?reference=POS-1-120&organizationId=120');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(['amount', 'paid_at', 'reference', 'status']);
  });

  it('`paid_at` null en la fila se omite del JSON (undefined), no viaja como null: contrato que QrPoller ya ignora', async () => {
    getQrSessionByReference.mockImplementationOnce(async () => ({ status: 'pending', amount: 1000, paid_at: null, reference: 'r', organization_id: SESSION_ORG }));
    const res = await get('?reference=POS-1-120&organizationId=120');
    const body = await res.json();
    expect(body).toEqual({ status: 'pending', reference: 'POS-1-120', amount: 1000 });
    expect('paid_at' in body).toBe(false);
  });

  it('`reference` viaja a la consulta tal cual (decodificada, sin recortar): espacios, «&» y unicode codificados llegan íntegros y NUNCA con la organización de la query', async () => {
    const raw = 'POS-1-120 x&y=ñ';
    const res = await get(`?organizationId=120&reference=${encodeURIComponent(raw)}`);
    expect(res.status).toBe(404);
    expect(getQrSessionByReference).toHaveBeenCalledWith(SESSION_ORG, raw);
    // reference vacía tras decodificar («?reference=») → 400.
    expect((await get('?reference=&organizationId=120')).status).toBe(400);
  });

  it('organizationId de la query nunca llega a la consulta aunque coincida con el de la sesión: siempre viaja ctx.organizationId (evidencia con el doble devolviendo la sesión)', async () => {
    getServerOrgContextFor.mockImplementationOnce(async () => ({ organizationId: 777, userId: 'u-1', userEmail: null, roleId: 4, roleName: 'x', isSuperAdmin: false, organizationName: 'Org 777', memberId: 1, supabase: {} as never }));
    await get('?reference=POS-1-120&organizationId=120');
    expect(getQrSessionByReference).toHaveBeenCalledWith(777, 'POS-1-120');
  });
});
