/// <reference types="jest" />
/**
 * Clasificación de la cuenta del correo invitado. Es lo que impide que el
 * asistente de invitación pida contraseña a quien ya tiene cuenta y, sobre
 * todo, que /api/auth/accept-invitation se la cambie: con el enlace de la
 * invitación (copiable desde la tabla) cualquiera podía apropiarse de una
 * cuenta existente. Caso real del 2026-09-15: un usuario de otra
 * organización invitado como administrador tuvo que "registrarse" de nuevo.
 */
import { estadoCuentaInvitacion, buscarUsuarioAuthPorEmail } from '../cuentaInvitacion';

type Usuario = { id: string; email: string; invited_at?: string | null; user_metadata?: Record<string, unknown> };

function adminFalso(opts: {
  usuarios: Usuario[];
  perfiles?: string[];
  membresias?: Record<string, number>;
  porPagina?: number;
}) {
  const perfiles = new Set(opts.perfiles ?? []);
  const membresias = opts.membresias ?? {};
  const listUsers = jest.fn(async ({ page, perPage }: { page: number; perPage: number }) => {
    const desde = (page - 1) * perPage;
    return { data: { users: opts.usuarios.slice(desde, desde + perPage) }, error: null };
  });
  const from = (tabla: string) => {
    const q: any = {};
    let userId = '';
    q.select = () => q;
    q.eq = (_col: string, val: string) => { userId = val; return q; };
    q.maybeSingle = async () => ({ data: tabla === 'profiles' && perfiles.has(userId) ? { id: userId } : null });
    q.then = (resolve: (v: unknown) => void) =>
      resolve({ count: tabla === 'organization_members' ? (membresias[userId] ?? 0) : 0 });
    return q;
  };
  return { auth: { admin: { listUsers } }, from, _listUsers: listUsers } as any;
}

const INVITACION = { code: 'abc123', organization_id: 137 };

describe('buscarUsuarioAuthPorEmail', () => {
  it('recorre varias páginas (la admin API no filtra por correo)', async () => {
    const usuarios = Array.from({ length: 1500 }, (_, i) => ({ id: `u${i}`, email: `u${i}@x.co` }));
    const admin = adminFalso({ usuarios });
    const hallado = await buscarUsuarioAuthPorEmail(admin, 'U1200@X.CO');
    expect(hallado?.id).toBe('u1200');
    expect(admin._listUsers).toHaveBeenCalledTimes(2);
  });

  it('devuelve null si no existe', async () => {
    const admin = adminFalso({ usuarios: [{ id: 'a', email: 'a@x.co' }] });
    expect(await buscarUsuarioAuthPorEmail(admin, 'nadie@x.co')).toBeNull();
  });
});

describe('estadoCuentaInvitacion', () => {
  it('nueva: el correo no tiene usuario en auth', async () => {
    const admin = adminFalso({ usuarios: [] });
    const r = await estadoCuentaInvitacion(admin, 'nuevo@x.co', INVITACION);
    expect(r.estado).toBe('nueva');
  });

  it('existente: miembro de otra organización (con perfil) — el caso del reporte', async () => {
    const admin = adminFalso({
      usuarios: [{ id: 'u1', email: 'servicio@x.co', user_metadata: { first_name: 'S' } }],
      perfiles: ['u1'],
      membresias: { u1: 1 },
    });
    const r = await estadoCuentaInvitacion(admin, 'servicio@x.co', INVITACION);
    expect(r.estado).toBe('existente');
  });

  it('existente: cliente de una tienda web (sin perfil, sin membresía, no invitado)', async () => {
    const admin = adminFalso({ usuarios: [{ id: 'c1', email: 'cliente@x.co', invited_at: null }] });
    const r = await estadoCuentaInvitacion(admin, 'cliente@x.co', INVITACION);
    expect(r.estado).toBe('existente');
  });

  it('existente: invitado por OTRA organización que aún no terminó (no es nuestro huérfano)', async () => {
    const admin = adminFalso({
      usuarios: [{ id: 'h2', email: 'h@x.co', invited_at: '2026-09-01', user_metadata: { is_invitation: true, organization_id: 999, invitation_code: 'otro' } }],
    });
    const r = await estadoCuentaInvitacion(admin, 'h@x.co', INVITACION);
    expect(r.estado).toBe('existente');
  });

  it('huerfana: creada por esta invitación, sin perfil ni membresías', async () => {
    const admin = adminFalso({
      usuarios: [{ id: 'h1', email: 'h@x.co', invited_at: '2026-09-14', user_metadata: { is_invitation: true, invitation_code: 'abc123' } }],
    });
    const r = await estadoCuentaInvitacion(admin, 'h@x.co', INVITACION);
    expect(r.estado).toBe('huerfana');
    expect(r.usuario?.id).toBe('h1');
  });

  it('existente: creada por esta organización pero ya reclamada (tiene membresía)', async () => {
    const admin = adminFalso({
      usuarios: [{ id: 'h3', email: 'h@x.co', invited_at: '2026-09-14', user_metadata: { is_invitation: true, organization_id: 137 } }],
      membresias: { h3: 1 },
    });
    const r = await estadoCuentaInvitacion(admin, 'h@x.co', INVITACION);
    expect(r.estado).toBe('existente');
  });
});
