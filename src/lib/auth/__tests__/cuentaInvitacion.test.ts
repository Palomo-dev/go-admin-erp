/// <reference types="jest" />
/**
 * Clasificación de la cuenta del correo invitado. Es lo que impide que el
 * asistente de invitación pida contraseña a quien ya tiene cuenta y, sobre
 * todo, que /api/auth/accept-invitation se la cambie: con el enlace de la
 * invitación (copiable desde la tabla) cualquiera podía apropiarse de una
 * cuenta existente. Caso real del 2026-09-15: un usuario de otra
 * organización invitado como administrador tuvo que "registrarse" de nuevo.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { estadoCuentaInvitacion, buscarUsuarioAuthPorEmail } from '../cuentaInvitacion';

type Usuario = { id: string; email: string; invited_at?: string | null; user_metadata?: Record<string, unknown> };

/** Consulta encadenable falsa: lo justo que usa cuentaInvitacion.ts. */
interface ConsultaFalsa {
  select: (cols?: string) => ConsultaFalsa;
  eq: (col: string, val: string) => ConsultaFalsa;
  maybeSingle: () => Promise<{ data: { id: string } | null }>;
  then: (resolve: (v: unknown) => void) => void;
}
type AdminFalso = SupabaseClient & { from: (tabla: string) => ConsultaFalsa; _listUsers: jest.Mock };

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
    const q = {} as ConsultaFalsa;
    let userId = '';
    q.select = () => q;
    q.eq = (_col: string, val: string) => { userId = val; return q; };
    q.maybeSingle = async () => ({ data: tabla === 'profiles' && perfiles.has(userId) ? { id: userId } : null });
    q.then = (resolve: (v: unknown) => void) =>
      resolve({ count: tabla === 'organization_members' ? (membresias[userId] ?? 0) : 0 });
    return q;
  };
  return { auth: { admin: { listUsers } }, from, _listUsers: listUsers } as unknown as AdminFalso;
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

  describe('cuenta preparada por el alta de RR. HH. (revisión 2026-11-15)', () => {
    const preparada = (extra: Partial<Usuario & { last_sign_in_at: string | null; email_confirmed_at: string | null }> = {}) => ({
      id: 'p1',
      email: 'operario@x.co',
      invited_at: null,
      last_sign_in_at: null,
      email_confirmed_at: null,
      user_metadata: { is_invitation: true, hr_alta: true, organization_id: 137 },
      ...extra,
    });
    function adminConFilas(usuario: object, filas: { organization_id: number; is_active: boolean }[]) {
      const base = adminFalso({ usuarios: [usuario as Usuario], perfiles: ['p1'], membresias: { p1: filas.length } });
      const fromBase = base.from as (tabla: string) => ConsultaFalsa;
      const fromFalso = (tabla: string): ConsultaFalsa => {
        const q = fromBase(tabla);
        if (tabla !== 'organization_members') return q;
        const original = q.then;
        q.select = (cols?: string) => {
          if (cols && cols.includes('is_active')) q.then = (resolve: (v: unknown) => void) => resolve({ data: filas });
          else q.then = original;
          return q;
        };
        return q;
      };
      base.from = fromFalso as unknown as AdminFalso['from'];
      return base;
    }

    it('huerfana: perfil y miembro inactivo de esta organización, nunca entró', async () => {
      const admin = adminConFilas(preparada(), [{ organization_id: 137, is_active: false }]);
      const r = await estadoCuentaInvitacion(admin, 'operario@x.co', INVITACION);
      expect(r.estado).toBe('huerfana');
    });

    it('existente: ya inició sesión alguna vez', async () => {
      const admin = adminConFilas(preparada({ last_sign_in_at: '2026-11-15T10:00:00Z' }), [{ organization_id: 137, is_active: false }]);
      expect((await estadoCuentaInvitacion(admin, 'operario@x.co', INVITACION)).estado).toBe('existente');
    });

    it('existente: tiene una membresía activa o de otra organización', async () => {
      const activa = adminConFilas(preparada(), [{ organization_id: 137, is_active: true }]);
      expect((await estadoCuentaInvitacion(activa, 'operario@x.co', INVITACION)).estado).toBe('existente');
      const otra = adminConFilas(preparada(), [{ organization_id: 137, is_active: false }, { organization_id: 999, is_active: false }]);
      expect((await estadoCuentaInvitacion(otra, 'operario@x.co', INVITACION)).estado).toBe('existente');
    });

    it('existente: la preparó otra organización', async () => {
      const admin = adminConFilas(preparada({ user_metadata: { is_invitation: true, hr_alta: true, organization_id: 999 } }), [
        { organization_id: 999, is_active: false },
      ]);
      expect((await estadoCuentaInvitacion(admin, 'operario@x.co', INVITACION)).estado).toBe('existente');
    });
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
