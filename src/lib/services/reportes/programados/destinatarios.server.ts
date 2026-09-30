/**
 * Posibles destinatarios de un envío programado: miembros activos de la
 * organización con su alcance de sucursal («Solo Sucursal Norte») y si
 * pueden recibir reportes (`reports.export`, rol + cargo).
 *
 * Todo con el cliente de la sesión (RLS de `organization_members`,
 * `profiles` y `member_branches` por pertenencia) y la organización de la
 * sesión. El alcance usa la misma regla que el resto (`calcularAlcance`).
 */
import { calcularAlcance } from '@/lib/security/alcanceSucursal';
import { hasOrgAdminOrPermission, type ServerOrgContext } from '@/lib/utils/orgContext';
import { isOrgAdminLike } from '@/lib/utils/orgAdmin';
import { nombreDePerfil } from './programacion';

export const MAX_MIEMBROS_DESTINATARIOS = 300;

export interface DestinatarioDisponible {
  userId: string;
  nombre: string | null;
  email: string | null;
  rol: string | null;
  cargo: string | null;
  accesoTotal: boolean;
  sucursales: Array<{ id: number; nombre: string }>;
  puedeRecibir: boolean;
}

type Ctx = Pick<ServerOrgContext, 'organizationId' | 'supabase'>;

interface FilaMiembro {
  id: number;
  user_id: string;
  role_id: number;
  is_super_admin: boolean | null;
  job_position_id: string | null;
  roles: { name: string | null } | { name: string | null }[] | null;
  job_positions: { name: string | null } | { name: string | null }[] | null;
}

const primero = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

export async function listarDestinatarios(ctx: Ctx): Promise<DestinatarioDisponible[]> {
  const db = ctx.supabase;
  const [miembrosRes, sucursalesRes] = await Promise.all([
    db
      .from('organization_members')
      .select('id, user_id, role_id, is_super_admin, job_position_id, roles(name), job_positions(name)')
      .eq('organization_id', ctx.organizationId)
      .eq('is_active', true)
      .limit(MAX_MIEMBROS_DESTINATARIOS),
    db.from('branches').select('id, name').eq('organization_id', ctx.organizationId).eq('is_active', true).order('name'),
  ]);
  if (miembrosRes.error) throw new Error(`No se pudieron leer los miembros: ${miembrosRes.error.message}`);
  if (sucursalesRes.error) throw new Error(`No se pudieron leer las sucursales: ${sucursalesRes.error.message}`);
  const miembros = (miembrosRes.data ?? []) as unknown as FilaMiembro[];
  const sucursales = (sucursalesRes.data ?? []) as Array<{ id: number; name: string | null }>;
  if (miembros.length === 0) return [];

  const [perfilesRes, asignacionesRes] = await Promise.all([
    db.from('profiles').select('id, email, first_name, last_name').in('id', miembros.map((m) => m.user_id)),
    db.from('member_branches').select('organization_member_id, branch_id').in('organization_member_id', miembros.map((m) => m.id)),
  ]);
  if (perfilesRes.error) throw new Error(`No se pudieron leer los perfiles: ${perfilesRes.error.message}`);
  // Sin poder leer las asignaciones no se asume «todas las sucursales».
  if (asignacionesRes.error) throw new Error(`No se pudieron leer las asignaciones de sucursal: ${asignacionesRes.error.message}`);

  const perfiles = new Map(((perfilesRes.data ?? []) as Array<{ id: string; email: string | null; first_name: string | null; last_name: string | null }>).map((p) => [p.id, p]));
  const asignadas = new Map<number, number[]>();
  for (const a of (asignacionesRes.data ?? []) as Array<{ organization_member_id: number; branch_id: number }>) {
    asignadas.set(a.organization_member_id, [...(asignadas.get(a.organization_member_id) ?? []), a.branch_id]);
  }
  const todas = sucursales.map((s) => s.id);
  const nombreSucursal = new Map(sucursales.map((s) => [s.id, s.name ?? `#${s.id}`]));

  const filas = await Promise.all(
    miembros.map(async (m): Promise<DestinatarioDisponible> => {
      const sujeto = { userId: m.user_id, organizationId: ctx.organizationId, roleId: m.role_id, isSuperAdmin: m.is_super_admin === true, supabase: db };
      const alcance = calcularAlcance(isOrgAdminLike(sujeto), todas, asignadas.get(m.id) ?? []);
      const perfil = perfiles.get(m.user_id);
      return {
        userId: m.user_id,
        nombre: nombreDePerfil(perfil),
        email: perfil?.email ?? null,
        rol: primero(m.roles)?.name ?? null,
        cargo: primero(m.job_positions)?.name ?? null,
        accesoTotal: alcance.accesoTotal,
        sucursales: alcance.permitidas.map((id) => ({ id, nombre: nombreSucursal.get(id) ?? `#${id}` })),
        puedeRecibir: !!perfil?.email && (await hasOrgAdminOrPermission(sujeto, 'reports.export')),
      };
    }),
  );
  return filas.sort((a, b) => (a.nombre ?? '').localeCompare(b.nombre ?? '', 'es'));
}
