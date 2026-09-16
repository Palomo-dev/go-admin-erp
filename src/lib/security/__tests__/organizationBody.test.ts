/// <reference types="jest" />
/**
 * F0-SEC r2 (sub-parte C) — `readOrgBody`, punto único de la regla dura 5 (b):
 * la organización sale de la sesión; si el body o la query traen OTRA → 403
 * `FOREIGN_ORGANIZATION` y `console.warn` estructurado. Sin datos reales
 * (organizaciones 7 y 9 ficticias).
 */
import { OrgContextError } from '@/lib/utils/orgContextError';
import {
  claimedOrganizationIn,
  claimedOrganizationsIn,
  FOREIGN_ORGANIZATION_CODE,
  foreignOrganizationInBody,
  ORG_BODY_KEYS,
  readOrgBody,
} from '../organizationBody';

const ctx = { organizationId: 7, userId: 'u-1' };

function jsonReq(body: unknown, url = 'http://localhost/api/crm/x', method = 'POST'): Request {
  return new Request(url, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { 'content-type': 'application/json' } });
}

let warn: jest.SpyInstance;
beforeEach(() => {
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => warn.mockRestore());

async function expect403(p: Promise<unknown> | (() => unknown)): Promise<OrgContextError> {
  try {
    await (typeof p === 'function' ? p() : p);
  } catch (err) {
    expect(err).toBeInstanceOf(OrgContextError);
    const e = err as OrgContextError;
    expect(e.statusCode).toBe(403);
    expect(e.code).toBe(FOREIGN_ORGANIZATION_CODE);
    return e;
  }
  throw new Error('esperaba OrgContextError 403');
}

describe('readOrgBody sobre un body ya parseado', () => {
  test.each(ORG_BODY_KEYS)('%s ajeno → 403 + registro', (key) => {
    expect(() => readOrgBody(ctx, { [key]: 9, name: 'x' })).toThrow(OrgContextError);
    expect(warn).toHaveBeenCalledTimes(1);
    const [msg, meta] = warn.mock.calls[0];
    expect(String(msg)).toMatch(new RegExp(`${key} ajeno`));
    expect(meta).toMatchObject({ key, session: 7, body: 9, userId: 'u-1', where: 'body' });
  });

  test('misma organización (número o cadena) → devuelve el body intacto, sin registro', () => {
    const body = { organization_id: '7', name: 'x' };
    expect(readOrgBody(ctx, body)).toBe(body);
    expect(readOrgBody(ctx, { orgId: 7 })).toEqual({ orgId: 7 });
    expect(warn).not.toHaveBeenCalled();
  });

  test('ausente, null, vacío, array o escalar → pasa', () => {
    expect(readOrgBody(ctx, {})).toEqual({});
    expect(readOrgBody(ctx, null)).toBeNull();
    expect(readOrgBody(ctx, { organization_id: '' })).toEqual({ organization_id: '' });
    expect(readOrgBody(ctx, { organization_id: null })).toEqual({ organization_id: null });
    expect(readOrgBody(ctx, [{ organization_id: 9 }])).toEqual([{ organization_id: 9 }]);
    expect(readOrgBody(ctx, 'texto')).toBe('texto');
    expect(warn).not.toHaveBeenCalled();
  });

  test('FormData y URLSearchParams se inspeccionan igual', () => {
    const fd = new FormData();
    fd.set('organization_id', '9');
    expect(() => readOrgBody(ctx, fd)).toThrow(OrgContextError);
    const ok = new FormData();
    ok.set('organization_id', '7');
    expect(readOrgBody(ctx, ok)).toBe(ok);
    expect(() => readOrgBody(ctx, new URLSearchParams('orgId=9'))).toThrow(OrgContextError);
  });

  test('se evalúan TODAS las claves: una propia (o vacía) delante no tapa a un alias ajeno (QA C+D r2 §3)', () => {
    expect(() => readOrgBody(ctx, { organization_id: 7, organizationId: 9 })).toThrow(OrgContextError);
    expect(warn.mock.calls[0][1]).toMatchObject({ key: 'organizationId', body: 9 });
    expect(() => readOrgBody(ctx, { organization_id: '', orgId: 9 })).toThrow(OrgContextError);
    expect(() => readOrgBody(ctx, { organization_id: '   ', org_id: '9' })).toThrow(OrgContextError);
    // ParamsLike: `organization_id=` presente pero vacío no es una declaración.
    expect(() => readOrgBody(ctx, new URLSearchParams('organization_id=&orgId=999'))).toThrow(OrgContextError);
    const fd = new FormData();
    fd.set('organization_id', '7');
    fd.set('org_id', '999');
    expect(() => readOrgBody(ctx, fd)).toThrow(OrgContextError);
    // Todas propias o vacías → pasa.
    warn.mockClear();
    expect(readOrgBody(ctx, new URLSearchParams('organization_id=&orgId=7'))).toBeInstanceOf(URLSearchParams);
    expect(readOrgBody(ctx, { organization_id: 7, organizationId: '7', orgId: '', org_id: null })).toBeTruthy();
    expect(warn).not.toHaveBeenCalled();
  });

  test('un doble con solo get() (tests de otras fases) también se inspecciona', () => {
    const fake = { get: (k: string) => (k === 'organization_id' ? '9' : null), getAll: () => [] };
    expect(() => readOrgBody(ctx, fake)).toThrow(OrgContextError);
  });

  test('el valor ajeno se registra recortado (nunca objetos ni cadenas largas enteras)', () => {
    expect(() => readOrgBody(ctx, { organization_id: 'x'.repeat(500) })).toThrow(OrgContextError);
    expect(String(warn.mock.calls[0][1].body).length).toBeLessThanOrEqual(64);
  });
});

describe('readOrgBody sobre una Request', () => {
  test('JSON con organización ajena → 403 y el body no se devuelve', async () => {
    await expect403(readOrgBody(ctx, jsonReq({ organization_id: 9 })));
    expect(warn).toHaveBeenCalledTimes(1);
  });

  test('JSON con la misma organización o sin ella → devuelve el body parseado', async () => {
    await expect(readOrgBody(ctx, jsonReq({ organization_id: 7, a: 1 }))).resolves.toEqual({ organization_id: 7, a: 1 });
    await expect(readOrgBody(ctx, jsonReq({ a: 1 }))).resolves.toEqual({ a: 1 });
  });

  test('sin body (DELETE) → {}; organización ajena en la QUERY → 403', async () => {
    await expect(readOrgBody(ctx, new Request('http://localhost/api/crm/x/1', { method: 'DELETE' }))).resolves.toEqual({});
    const e = await expect403(readOrgBody(ctx, new Request('http://localhost/api/crm/x/1?organization_id=9', { method: 'DELETE' })));
    expect(e.code).toBe(FOREIGN_ORGANIZATION_CODE);
    expect(warn.mock.calls[0][1]).toMatchObject({ where: 'query', key: 'organization_id' });
  });

  test('clave repetida en la QUERY: la segunda ocurrencia ajena también → 403 (tester C+D r3; QA r3 «B»)', async () => {
    const e = await expect403(readOrgBody(ctx, new Request('http://localhost/api/crm/x/1?organization_id=7&organization_id=9', { method: 'DELETE' })));
    expect(e.code).toBe(FOREIGN_ORGANIZATION_CODE);
    expect(warn.mock.calls[0][1]).toMatchObject({ where: 'query', key: 'organization_id' });
    await expect(readOrgBody(ctx, new Request('http://localhost/api/crm/x/1?organization_id=7&organization_id=7', { method: 'DELETE' }))).resolves.toEqual({});
  });

  test('JSON mal formado → 400 INVALID_JSON (OrgContextError, la ruta lo convierte)', async () => {
    const req = new Request('http://localhost/api/crm/x', { method: 'POST', body: '{no', headers: { 'content-type': 'application/json' } });
    await expect(readOrgBody(ctx, req)).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_JSON' });
  });

  test('multipart: organización ajena en un campo → 403; propia → FormData devuelto', async () => {
    const fd = new FormData();
    fd.set('organization_id', '9');
    fd.set('file', new Blob(['x']), 'a.txt');
    await expect403(readOrgBody(ctx, new Request('http://localhost/api/x', { method: 'POST', body: fd })));
    const ok = new FormData();
    ok.set('organization_id', '7');
    const out = await readOrgBody<FormData>(ctx, new Request('http://localhost/api/x', { method: 'POST', body: ok }));
    expect(out.get('organization_id')).toBe('7');
  });

  test('body ya consumido → solo se comprueba la query y se devuelve {}', async () => {
    const req = jsonReq({ organization_id: 9 });
    await req.json();
    await expect(readOrgBody(ctx, req)).resolves.toEqual({});
  });

  test('doble de test con solo json() (como usan varias suites)', async () => {
    const fake = { json: async () => ({ organization_id: 9 }) } as unknown as Request;
    await expect403(readOrgBody(ctx, fake));
    const ok = { json: async () => ({ x: 1 }) } as unknown as Request;
    await expect(readOrgBody(ctx, ok)).resolves.toEqual({ x: 1 });
  });

  test('la etiqueta `route` viaja al registro', async () => {
    await expect403(readOrgBody(ctx, jsonReq({ orgId: 9 }), { route: 'crm/x' }));
    expect(warn.mock.calls[0][1]).toMatchObject({ route: 'crm/x', key: 'orgId' });
  });
});

describe('predicados puros', () => {
  test('foreignOrganizationInBody conserva su contrato (F12/F13/Voces lo importan)', () => {
    expect(foreignOrganizationInBody(undefined, 7)).toBeNull();
    expect(foreignOrganizationInBody('', 7)).toBeNull();
    expect(foreignOrganizationInBody('7', 7)).toBeNull();
    expect(foreignOrganizationInBody(9, 7)).toBe(9);
    expect(foreignOrganizationInBody('abc', 7)).toBe('abc');
  });

  test('claimedOrganizationIn devuelve la primera clave presente con valor no vacío', () => {
    expect(claimedOrganizationIn({ orgId: 3, organization_id: 4 })).toEqual({ key: 'organization_id', value: 4 });
    expect(claimedOrganizationIn({ org_id: 5 })).toEqual({ key: 'org_id', value: 5 });
    expect(claimedOrganizationIn({ organization_id: undefined })).toBeNull();
    expect(claimedOrganizationIn({ organization_id: '', orgId: 5 })).toEqual({ key: 'orgId', value: 5 });
    expect(claimedOrganizationIn(undefined)).toBeNull();
  });

  test('claimedOrganizationsIn devuelve todas las claves con valor, en el orden de ORG_BODY_KEYS', () => {
    expect(claimedOrganizationsIn({ orgId: 3, organization_id: 4, org_id: '', organizationId: null })).toEqual([
      { key: 'organization_id', value: 4 },
      { key: 'orgId', value: 3 },
    ]);
    expect(claimedOrganizationsIn(new URLSearchParams('organization_id=&orgId=9'))).toEqual([{ key: 'orgId', value: '9' }]);
    expect(claimedOrganizationsIn([{ organization_id: 9 }])).toEqual([]);
    expect(claimedOrganizationsIn(null)).toEqual([]);
  });
});
