/// <reference types="jest" />
/**
 * Pestañas de la oportunidad (Figma CRM 822:235333) — `GET /api/crm/tasks`:
 * la organización sale de la sesión, una oportunidad ajena da 404 sin
 * revelar sus tareas, el id se valida y cada tarea trae responsable y quién la
 * completó por nombre. Mismo doble de Supabase que la ola 1.
 */

const { OrgContextError: RealOrgContextError } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');

import { fakeSupabase, makeDb, seed, ORG, OTRA, U, YO, OTRO_VENDEDOR, type Ola1Db } from './ola1Fake';

let db: Ola1Db;

jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError: RealOrgContextError,
  getServerOrgContext: jest.fn(async () => ({ organizationId: ORG, userId: YO, roleId: 4, roleName: 'x', isSuperAdmin: false, supabase: fakeSupabase(db) })),
  hasOrgAdminOrPermission: jest.fn(async () => false),
}));

import { NextRequest } from 'next/server';
import { GET as tareasGet } from '../tasks/route';
import { aTareaOportunidad, nombrePerfil } from '@/lib/services/crm/tareasOportunidadService';

const req = (url: string) => new NextRequest(`http://localhost${url}`);

beforeEach(() => {
  const s = seed();
  s.tasks = [
    { id: U(500), organization_id: ORG, related_to_type: 'opportunity', related_to_id: U(1), title: 'Enviar propuesta', status: 'open', priority: 'high', due_date: '2026-11-16T15:00:00Z', assigned_to: YO, created_at: '2026-11-10T10:00:00Z' },
    { id: U(501), organization_id: ORG, related_to_type: 'opportunity', related_to_id: U(1), title: 'Llamada de discovery', status: 'done', priority: 'med', completed_at: '2026-09-18T15:00:00Z', completed_by: OTRO_VENDEDOR, assigned_to: OTRO_VENDEDOR, created_at: '2026-09-01T10:00:00Z' },
    { id: U(502), organization_id: ORG, related_to_type: 'customer', related_to_id: U(10), title: 'Del cliente, no de la oportunidad', status: 'open', created_at: '2026-09-01T10:00:00Z' },
    { id: U(509), organization_id: OTRA, related_to_type: 'opportunity', related_to_id: U(1), title: 'Señuelo', status: 'open', created_at: '2026-09-01T10:00:00Z' },
  ];
  s.profiles = [
    { id: YO, first_name: 'Ana', last_name: 'Gómez', email: 'ana@ejemplo.test' },
    { id: OTRO_VENDEDOR, first_name: null, last_name: null, email: 'carlos@ejemplo.test' },
  ];
  db = makeDb(s);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('GET /api/crm/tasks?opportunity_id=', () => {
  it('solo las tareas de esa oportunidad en la organización de la sesión, con nombres', async () => {
    const res = await tareasGet(req(`/api/crm/tasks?opportunity_id=${U(1)}`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { id: string; responsable: string | null; completada_por: string | null }[] };
    expect(body.data.map((x) => x.id).sort()).toEqual([U(500), U(501)]);
    const hecha = body.data.find((x) => x.id === U(501))!;
    expect(hecha.completada_por).toBe('carlos@ejemplo.test');
    expect(body.data.find((x) => x.id === U(500))!.responsable).toBe('Ana Gómez');
  });

  it('oportunidad de otra organización → 404 sin datos', async () => {
    const res = await tareasGet(req(`/api/crm/tasks?opportunity_id=${U(90)}`));
    expect(res.status).toBe(404);
    expect(((await res.json()) as { data?: unknown }).data).toBeUndefined();
  });

  it('sin uuid → 400', async () => {
    expect((await tareasGet(req('/api/crm/tasks?opportunity_id=xx'))).status).toBe(400);
    expect((await tareasGet(req('/api/crm/tasks'))).status).toBe(400);
  });

  it('nunca escribe', async () => {
    await tareasGet(req(`/api/crm/tasks?opportunity_id=${U(1)}`));
    expect(db.writes).toEqual([]);
  });
});

describe('tareasOportunidadService', () => {
  it('nombrePerfil: nombre y apellido, si no el correo, si no null', () => {
    expect(nombrePerfil({ first_name: 'Ana', last_name: 'Gómez' })).toBe('Ana Gómez');
    expect(nombrePerfil({ first_name: ' ', email: 'x@y.test' })).toBe('x@y.test');
    expect(nombrePerfil(undefined)).toBeNull();
  });
  it('aTareaOportunidad: valores vacíos a null y estado por defecto «open»', () => {
    const t = aTareaOportunidad({ id: 'a', title: 'T', description: '', assigned_to: null }, new Map());
    expect(t).toMatchObject({ id: 'a', title: 'T', status: 'open', description: null, responsable: null, completada_por: null });
  });
});
