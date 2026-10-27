jest.mock('next/headers', () => ({ cookies: jest.fn(), headers: jest.fn() }));
import { cookiesSinRefresco } from '../server-user';

const sesion = { access_token: 'a.b.c', refresh_token: 'r1', expires_at: 1, user: { id: 'u' } };

describe('cookiesSinRefresco (A4)', () => {
  it('quita el refresh_token de la cookie JSON y deja las demás', () => {
    const r = cookiesSinRefresco([
      { name: 'sb-abc-auth-token', value: JSON.stringify(sesion) },
      { name: 'org_id', value: '7' },
    ]);
    expect(r.find((c) => c.name === 'org_id')?.value).toBe('7');
    const s = JSON.parse(r.find((c) => c.name === 'sb-abc-auth-token')!.value);
    expect(s.access_token).toBe('a.b.c');
    expect(s.refresh_token).toBe('');
  });

  it('une trozos .0/.1 y entiende base64-', () => {
    const json = JSON.stringify(sesion);
    const b64 = 'base64-' + Buffer.from(json).toString('base64url');
    const r = cookiesSinRefresco([
      { name: 'sb-abc-auth-token.0', value: b64.slice(0, 20) },
      { name: 'sb-abc-auth-token.1', value: b64.slice(20) },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].name).toBe('sb-abc-auth-token');
    expect(JSON.parse(r[0].value).refresh_token).toBe('');
  });

  it('descarta la cookie ilegible', () => {
    expect(cookiesSinRefresco([{ name: 'sb-abc-auth-token', value: '[object Object]' }])).toEqual([]);
  });
});
