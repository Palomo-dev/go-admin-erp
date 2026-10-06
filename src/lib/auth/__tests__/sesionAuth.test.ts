/**
 * `sesionAuthDeToken`: el claim `session_id` del access token es lo que
 * `registerUserDevice` guarda en `user_devices.session_id` (antes guardaba el
 * id de la persona en las 305 filas, y no se podía cerrar una sesión concreta).
 */
import { sesionAuthDeToken } from '../sesionAuth';

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const token = (payload: unknown) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.firma`;

describe('sesionAuthDeToken', () => {
  it('devuelve el session_id del JWT', () => {
    const sid = '3f2a9c1e-8b7d-4e6f-9a0b-1c2d3e4f5a6b';
    expect(sesionAuthDeToken(token({ sub: 'u', session_id: sid, aal: 'aal1' }))).toBe(sid);
  });

  it('decodifica base64url con caracteres fuera de ASCII', () => {
    const sid = '3f2a9c1e-8b7d-4e6f-9a0b-1c2d3e4f5a6b';
    expect(sesionAuthDeToken(token({ nombre: 'María Ñúñez ¿?>>', session_id: sid }))).toBe(sid);
  });

  it('null si falta, no es uuid o el token está roto; nunca lanza', () => {
    expect(sesionAuthDeToken(token({ sub: 'u' }))).toBeNull();
    expect(sesionAuthDeToken(token({ session_id: 'no-es-uuid' }))).toBeNull();
    expect(sesionAuthDeToken(token({ session_id: 42 }))).toBeNull();
    expect(sesionAuthDeToken('a.%%%.c')).toBeNull();
    expect(sesionAuthDeToken('sin-puntos')).toBeNull();
    expect(sesionAuthDeToken(null)).toBeNull();
    expect(sesionAuthDeToken('')).toBeNull();
  });
});
