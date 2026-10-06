/**
 * Roles y permisos — lecturas y acciones del lado del servidor
 * (Organización › Equipo › Roles y permisos; Figma «13. Equipo › Roles y
 * permisos»; docs/acceso/ROLES-Y-PERMISOS-ANALISIS.md).
 *
 * Solo se usa desde `src/app/api/organizacion/roles/**` con el contexto de
 * `withOrg`: la organización sale de la sesión y el cliente es el de la sesión
 * (RLS por pertenencia). Reglas:
 *
 *  - Permisos resueltos en el servidor (regla 6): las capacidades de quien
 *    llama salen de `get_user_permission_codes` para el usuario de la SESIÓN
 *    y del criterio de admin por id (`isOrgAdminLike`), el mismo que aplican
 *    las RPC en la base (`fn_roles_puede`). La base vuelve a comprobarlo:
 *    esto solo decide qué ofrecer y responde 403 antes.
 *  - Escrituras solo por RPC transaccional (`fn_rol_*` y
 *    `fn_cargo_guardar_permisos`, migración 20261006140000; si aún no está
 *    aplicada: 503 `migracion_pendiente`). El alcance por sucursal usa
 *    `fn_miembro_asignar_sucursales` (20261006040701, ya aplicada), la misma
 *    RPC que Organización › Miembros.
 *  - «¿Qué puede hacer?» usa `get_user_permission_codes` (no se reimplementa
 *    la precedencia rol/cargo) y solo ANOTA el origen de cada permiso.
 *  - Conteos de personas por organización (antes contaban todas: problema 3).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { isOrgAdminLike, ORG_ADMIN_ROLE_IDS } from '@/lib/utils/orgAdmin';
import { calcularAlcance } from '@/lib/security/alcanceSucursal';
import { clasificarCatalogo, type FilaPermisoConId, type PermisoCatalogo } from '@/lib/roles/matrizPermisos';
import { anotarOrigenes, contarOrigenes } from '@/lib/roles/permisosEfectivos';
import type {
  AlcanceMiembro,
  CapacidadesRoles,
  CargoResumen,
  DetalleCargo,
  DetalleRol,
  MiembroRoles,
  QuePuedeHacer,
  RespuestaCargos,
  RespuestaRoles,
  RolResumen,
} from '@/lib/roles/tipos';
import { ErrorRoles, errorDeRpc, esColumnaAusente, type ErrorPostgrest } from './erroresRoles';

export type ContextoRoles = Pick<ServerOrgContext, 'userId' | 'organizationId' | 'roleId' | 'isSuperAdmin' | 'memberId' | 'supabase'>;

/** Permiso del catálogo que habilita cada capacidad (los mismos que exigen las RPC). */
export const PERMISOS_ROLES = {
  ver: 'roles.view',
  crear: 'roles.create',
  editar: 'roles.edit',
  eliminar: 'roles.delete',
  asignar: 'roles.assign',
  verPersonas: 'users.view',
  editarCargos: 'hr.positions.edit',
  editarAlcance: 'users.edit',
} as const satisfies Record<keyof CapacidadesRoles, string>;

const TODAS: CapacidadesRoles = {
  ver: true,
  crear: true,
  editar: true,
  eliminar: true,
  asignar: true,
  verPersonas: true,
  editarCargos: true,
  editarAlcance: true,
};
const NINGUNA: CapacidadesRoles = {
  ver: false,
  crear: false,
  editar: false,
  eliminar: false,
  asignar: false,
  verPersonas: false,
  editarCargos: false,
  editarAlcance: false,
};

function fallo(e: ErrorPostgrest, donde: string): never {
  console.error(`[roles] ${donde}`, e.code ?? '', e.message ?? '');
  throw new ErrorRoles(500, 'error_interno');
}

// ─── Capacidades de quien llama ──────────────────────────────────────────

/**
 * Lo que la persona de la sesión puede hacer en Roles y permisos. Admin (super
 * admin o rol 1/2 por id) puede todo; si no, cada permiso del catálogo. Un
 * error de la base cuenta como «nada» (fail-closed).
 */
export async function capacidadesDe(ctx: ContextoRoles): Promise<CapacidadesRoles> {
  if (isOrgAdminLike(ctx)) return { ...TODAS };
  const { data, error } = await ctx.supabase.rpc('get_user_permission_codes', {
    p_user_id: ctx.userId,
    p_organization_id: ctx.organizationId,
  });
  if (error) {
    console.warn('[roles] get_user_permission_codes falló; se deniega', error.message);
    return { ...NINGUNA };
  }
  const codigos = new Set<string>((data as string[] | null) ?? []);
  const caps = { ...NINGUNA };
  for (const clave of Object.keys(PERMISOS_ROLES) as (keyof CapacidadesRoles)[]) {
    caps[clave] = codigos.has(PERMISOS_ROLES[clave]);
  }
  // Quien puede gestionar roles también puede verlos.
  caps.ver = caps.ver || caps.crear || caps.editar || caps.eliminar || caps.asignar;
  return caps;
}

function exigir(caps: CapacidadesRoles, clave: keyof CapacidadesRoles): void {
  if (!caps[clave]) throw new ErrorRoles(403, 'sin_permiso');
}

// ─── Lecturas base ───────────────────────────────────────────────────────

export async function leerCatalogo(sb: SupabaseClient): Promise<PermisoCatalogo[]> {
  const { data, error } = await sb.from('permissions').select('id, code, module, name, description').order('module').order('code');
  if (error) fallo(error, 'catálogo');
  return clasificarCatalogo((data ?? []) as FilaPermisoConId[]);
}

interface FilaRol {
  id: number;
  name: string;
  description: string | null;
  is_system: boolean | null;
  organization_id?: number | null;
  version?: number | null;
  updated_at?: string | null;
  based_on_role_id?: number | null;
}

/**
 * Roles visibles para la organización: los del sistema y los propios. Antes de
 * la migración (sin `roles.organization_id`) solo los del sistema: un rol
 * «personalizado» global sería de otra organización (problema 2).
 */
export async function leerRolesVisibles(ctx: ContextoRoles): Promise<{ filas: FilaRol[]; modeloListo: boolean }> {
  const nuevo = await ctx.supabase
    .from('roles')
    .select('id, name, description, is_system, organization_id, version, updated_at, based_on_role_id')
    .or(`organization_id.is.null,organization_id.eq.${Number(ctx.organizationId)}`)
    .order('id');
  if (!nuevo.error) return { filas: (nuevo.data ?? []) as FilaRol[], modeloListo: true };
  if (!esColumnaAusente(nuevo.error)) fallo(nuevo.error, 'roles');
  const viejo = await ctx.supabase.from('roles').select('id, name, description, is_system').eq('is_system', true).order('id');
  if (viejo.error) fallo(viejo.error, 'roles (modelo anterior)');
  return { filas: (viejo.data ?? []) as FilaRol[], modeloListo: false };
}

async function permisosDeRoles(sb: SupabaseClient, ids: number[]): Promise<Map<number, number[]>> {
  const mapa = new Map<number, number[]>(ids.map((id) => [id, []]));
  if (ids.length === 0) return mapa;
  const { data, error } = await sb.from('role_permissions').select('role_id, permission_id').in('role_id', ids).eq('allowed', true);
  if (error) fallo(error, 'role_permissions');
  for (const f of (data ?? []) as { role_id: number; permission_id: number }[]) {
    mapa.get(f.role_id)?.push(f.permission_id);
  }
  return mapa;
}

interface FilaMiembro {
  id: number;
  user_id: string;
  role_id: number;
  job_position_id: string | null;
  is_super_admin: boolean | null;
}

/** Miembros ACTIVOS de la organización con nombre, rol y cargo. */
export async function leerMiembros(ctx: ContextoRoles, roles?: Map<number, string>): Promise<MiembroRoles[]> {
  const sb = ctx.supabase;
  const [miembros, organizacion] = await Promise.all([
    sb
      .from('organization_members')
      .select('id, user_id, role_id, job_position_id, is_super_admin')
      .eq('organization_id', ctx.organizationId)
      .eq('is_active', true)
      .order('id'),
    sb.from('organizations').select('owner_user_id').eq('id', ctx.organizationId).maybeSingle(),
  ]);
  if (miembros.error) fallo(miembros.error, 'organization_members');
  const filas = (miembros.data ?? []) as FilaMiembro[];
  const usuarios = [...new Set(filas.map((m) => m.user_id))];
  const cargos = [...new Set(filas.map((m) => m.job_position_id).filter((c): c is string => !!c))];
  const [perfiles, nombresCargo, nombresRol] = await Promise.all([
    usuarios.length ? sb.from('profiles').select('id, first_name, last_name, email').in('id', usuarios) : Promise.resolve({ data: [], error: null }),
    cargos.length ? sb.from('job_positions').select('id, name').in('id', cargos) : Promise.resolve({ data: [], error: null }),
    roles ? Promise.resolve({ data: null, error: null }) : sb.from('roles').select('id, name').in('id', [...new Set(filas.map((m) => m.role_id))]),
  ]);
  if (perfiles.error) fallo(perfiles.error, 'profiles');
  if (nombresCargo.error) fallo(nombresCargo.error, 'job_positions');
  if (nombresRol.error) fallo(nombresRol.error, 'roles');
  const perfilDe = new Map(
    ((perfiles.data ?? []) as { id: string; first_name: string | null; last_name: string | null; email: string | null }[]).map((p) => [p.id, p]),
  );
  const cargoDe = new Map(((nombresCargo.data ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
  const rolDe = roles ?? new Map(((nombresRol.data ?? []) as { id: number; name: string }[]).map((r) => [r.id, r.name]));
  const dueno = (organizacion.data as { owner_user_id?: string | null } | null)?.owner_user_id ?? null;
  return filas.map((m) => {
    const p = perfilDe.get(m.user_id);
    const nombre = [p?.first_name, p?.last_name].filter(Boolean).join(' ').trim() || p?.email || '—';
    return {
      id: Number(m.id),
      nombre,
      email: p?.email ?? null,
      roleId: m.role_id,
      rolNombre: rolDe.get(m.role_id) ?? null,
      cargoId: m.job_position_id,
      cargoNombre: m.job_position_id ? cargoDe.get(m.job_position_id) ?? null : null,
      superAdmin: m.is_super_admin === true,
      dueno: dueno !== null && m.user_id === dueno,
      esSesion: m.user_id === ctx.userId,
    };
  });
}

function aResumen(f: FilaRol, permisoIds: number[], miembros: MiembroRoles[], nombres: Map<number, string>): RolResumen {
  const suyos = miembros.filter((m) => m.roleId === f.id);
  const sistema = f.organization_id == null;
  const esAdmin = sistema && ORG_ADMIN_ROLE_IDS.includes(f.id);
  return {
    id: f.id,
    nombre: f.name,
    descripcion: f.description,
    sistema,
    basadoEn: f.based_on_role_id ?? null,
    basadoEnNombre: f.based_on_role_id ? nombres.get(f.based_on_role_id) ?? null : null,
    version: f.version ?? null,
    actualizado: f.updated_at ?? null,
    permisoIds: [...permisoIds].sort((a, b) => a - b),
    personas: suyos.length,
    muestraPersonas: suyos.slice(0, 3).map((m) => ({ id: m.id, nombre: m.nombre })),
    esAdmin,
    // Super Admin / Admin de organización no son plantillas (fn_rol_crear lo rechaza).
    duplicable: !esAdmin,
  };
}

/** Roles de sistema primero (por id) y luego los propios por nombre. */
function ordenRoles(a: RolResumen, b: RolResumen): number {
  if (a.sistema !== b.sistema) return a.sistema ? -1 : 1;
  return a.sistema ? a.id - b.id : a.nombre.localeCompare(b.nombre, 'es');
}

async function rolesConDatos(ctx: ContextoRoles) {
  const { filas, modeloListo } = await leerRolesVisibles(ctx);
  const nombres = new Map(filas.map((f) => [f.id, f.name]));
  const [permisos, miembros] = await Promise.all([permisosDeRoles(ctx.supabase, filas.map((f) => f.id)), leerMiembros(ctx, nombres)]);
  const roles = filas.map((f) => aResumen(f, permisos.get(f.id) ?? [], miembros, nombres)).sort(ordenRoles);
  return { roles, miembros, modeloListo };
}

// ─── Roles ───────────────────────────────────────────────────────────────

export async function listarRoles(ctx: ContextoRoles): Promise<RespuestaRoles> {
  const capacidades = await capacidadesDe(ctx);
  exigir(capacidades, 'ver');
  const [catalogo, { roles, miembros, modeloListo }] = await Promise.all([leerCatalogo(ctx.supabase), rolesConDatos(ctx)]);
  return { roles, catalogo, capacidades, modeloListo, totalPersonas: miembros.length };
}

export async function detalleRol(ctx: ContextoRoles, id: number): Promise<DetalleRol> {
  const capacidades = await capacidadesDe(ctx);
  exigir(capacidades, 'ver');
  const [catalogo, { roles, miembros, modeloListo }] = await Promise.all([leerCatalogo(ctx.supabase), rolesConDatos(ctx)]);
  const rol = roles.find((r) => r.id === id);
  // Un rol de otra organización responde igual que uno inexistente.
  if (!rol) throw new ErrorRoles(404, 'no_encontrado');
  return { rol, miembros: miembros.filter((m) => m.roleId === id), catalogo, capacidades, modeloListo };
}

async function estadoGuardadoRol(ctx: ContextoRoles, id: number) {
  const { filas } = await leerRolesVisibles(ctx);
  const f = filas.find((r) => r.id === id);
  if (!f) throw new ErrorRoles(404, 'no_encontrado');
  const permisos = await permisosDeRoles(ctx.supabase, [id]);
  return {
    version: f.version ?? null,
    nombre: f.name,
    descripcion: f.description,
    permisoIds: (permisos.get(id) ?? []).sort((a, b) => a - b),
  };
}

function idsValidos(ids: readonly number[]): number[] {
  return [...new Set(ids.filter((n) => Number.isInteger(n) && n > 0))];
}

export interface EntradaCrearRol {
  nombre: string;
  descripcion?: string | null;
  plantillaId?: number | null;
  /** null = copiar los de la plantilla. */
  permisoIds?: number[] | null;
}

export async function crearRol(ctx: ContextoRoles, e: EntradaCrearRol): Promise<{ id: number; version: number }> {
  exigir(await capacidadesDe(ctx), 'crear');
  const { data, error } = await ctx.supabase.rpc('fn_rol_crear', {
    p_organization_id: ctx.organizationId,
    p_nombre: e.nombre,
    p_descripcion: e.descripcion ?? null,
    p_plantilla_id: e.plantillaId ?? null,
    p_permisos: e.permisoIds == null ? null : idsValidos(e.permisoIds),
  });
  if (error) throw errorDeRpc(error);
  const r = data as { id: number; version: number };
  return { id: r.id, version: r.version };
}

export interface EntradaGuardarRol {
  version: number;
  nombre: string;
  descripcion: string | null;
  permisoIds: number[];
}

export async function guardarRol(ctx: ContextoRoles, id: number, e: EntradaGuardarRol): Promise<{ id: number; version: number }> {
  exigir(await capacidadesDe(ctx), 'editar');
  const { data, error } = await ctx.supabase.rpc('fn_rol_guardar', {
    p_role_id: id,
    p_version: e.version,
    p_nombre: e.nombre,
    p_descripcion: e.descripcion ?? '',
    p_permisos: idsValidos(e.permisoIds),
  });
  if (error) {
    const err = errorDeRpc(error);
    if (err.codigo === 'conflicto') throw new ErrorRoles(409, 'conflicto', { actual: await estadoGuardadoRol(ctx, id) });
    throw err;
  }
  const r = data as { id: number; version: number };
  return { id: r.id, version: r.version };
}

export async function eliminarRol(ctx: ContextoRoles, id: number, rolDestino: number | null): Promise<{ reasignados: number }> {
  exigir(await capacidadesDe(ctx), 'eliminar');
  const { data, error } = await ctx.supabase.rpc('fn_rol_eliminar', { p_role_id: id, p_rol_destino: rolDestino });
  if (error) throw errorDeRpc(error);
  return { reasignados: Number((data as { reasignados?: number } | null)?.reasignados ?? 0) };
}

export async function asignarRol(ctx: ContextoRoles, id: number, miembros: number[]): Promise<{ asignados: number }> {
  exigir(await capacidadesDe(ctx), 'asignar');
  const { data, error } = await ctx.supabase.rpc('fn_rol_asignar_miembros', {
    p_organization_id: ctx.organizationId,
    p_role_id: id,
    p_member_ids: idsValidos(miembros),
  });
  if (error) throw errorDeRpc(error);
  return { asignados: Number((data as { asignados?: number } | null)?.asignados ?? 0) };
}

export async function listarMiembros(ctx: ContextoRoles): Promise<{ miembros: MiembroRoles[]; capacidades: CapacidadesRoles }> {
  const capacidades = await capacidadesDe(ctx);
  if (!capacidades.asignar && !capacidades.verPersonas) throw new ErrorRoles(403, 'sin_permiso');
  return { miembros: await leerMiembros(ctx), capacidades };
}

// ─── Cargos ──────────────────────────────────────────────────────────────

interface FilaCargo {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  department_id: string | null;
  is_active: boolean | null;
  updated_at: string | null;
}

async function leerCargos(ctx: ContextoRoles, id?: string): Promise<CargoResumen[]> {
  const sb = ctx.supabase;
  let q = sb
    .from('job_positions')
    .select('id, name, code, description, department_id, is_active, updated_at')
    .eq('organization_id', ctx.organizationId);
  if (id) q = q.eq('id', id);
  const { data, error } = await q.order('name');
  if (error) fallo(error, 'job_positions');
  const filas = (data ?? []) as FilaCargo[];
  const ids = filas.map((c) => c.id);
  const departamentos = [...new Set(filas.map((c) => c.department_id).filter((d): d is string => !!d))];
  const [permisos, deptos, miembros] = await Promise.all([
    ids.length ? sb.from('job_position_permissions').select('job_position_id, permission_id, allowed').in('job_position_id', ids) : Promise.resolve({ data: [], error: null }),
    departamentos.length ? sb.from('departments').select('id, name').in('id', departamentos) : Promise.resolve({ data: [], error: null }),
    sb.from('organization_members').select('id, job_position_id').eq('organization_id', ctx.organizationId).eq('is_active', true),
  ]);
  if (permisos.error) fallo(permisos.error, 'job_position_permissions');
  if (deptos.error) fallo(deptos.error, 'departments');
  if (miembros.error) fallo(miembros.error, 'organization_members');
  const filasMiembro = (miembros.data ?? []) as { id: number; job_position_id: string | null }[];
  const cargoDeMiembro = new Map(filasMiembro.map((m) => [Number(m.id), m.job_position_id]));
  const contratos = ids.length && filasMiembro.length
    ? await sb
        .from('employments')
        .select('organization_member_id, position_id')
        .eq('status', 'active')
        .in('position_id', ids)
        .in('organization_member_id', filasMiembro.map((m) => m.id))
    : { data: [], error: null };
  if (contratos.error) fallo(contratos.error, 'employments');
  const nombreDepto = new Map(((deptos.data ?? []) as { id: string; name: string }[]).map((d) => [d.id, d.name]));
  return filas.map((c) => {
    const propios = ((permisos.data ?? []) as { job_position_id: string; permission_id: number; allowed: boolean }[]).filter(
      (p) => p.job_position_id === c.id,
    );
    const sinVinculo = ((contratos.data ?? []) as { organization_member_id: number; position_id: string }[]).filter(
      (k) => k.position_id === c.id && cargoDeMiembro.get(Number(k.organization_member_id)) !== c.id,
    );
    return {
      id: c.id,
      nombre: c.name,
      codigo: c.code,
      descripcion: c.description,
      departamento: c.department_id ? nombreDepto.get(c.department_id) ?? null : null,
      activo: c.is_active !== false,
      actualizado: c.updated_at,
      permisoIds: propios.filter((p) => p.allowed).map((p) => p.permission_id).sort((a, b) => a - b),
      quitaIds: propios.filter((p) => !p.allowed).map((p) => p.permission_id).sort((a, b) => a - b),
      personas: filasMiembro.filter((m) => m.job_position_id === c.id).length,
      contratosSinVinculo: new Set(sinVinculo.map((k) => Number(k.organization_member_id))).size,
    };
  });
}

/** Funciones que existen solo tras la migración: se detecta sin escribir nada. */
async function modeloListoDe(ctx: ContextoRoles): Promise<boolean> {
  return (await leerRolesVisibles(ctx)).modeloListo;
}

export async function listarCargos(ctx: ContextoRoles): Promise<RespuestaCargos> {
  const capacidades = await capacidadesDe(ctx);
  if (!capacidades.ver && !capacidades.editarCargos) throw new ErrorRoles(403, 'sin_permiso');
  const [cargos, catalogo, modeloListo] = await Promise.all([leerCargos(ctx), leerCatalogo(ctx.supabase), modeloListoDe(ctx)]);
  return { cargos, catalogo, capacidades, modeloListo };
}

export async function detalleCargo(ctx: ContextoRoles, id: string): Promise<DetalleCargo> {
  const capacidades = await capacidadesDe(ctx);
  if (!capacidades.ver && !capacidades.editarCargos) throw new ErrorRoles(403, 'sin_permiso');
  const [cargos, catalogo, datos] = await Promise.all([leerCargos(ctx, id), leerCatalogo(ctx.supabase), rolesConDatos(ctx)]);
  const cargo = cargos[0];
  if (!cargo) throw new ErrorRoles(404, 'no_encontrado');
  const miembros = datos.miembros.filter((m) => m.cargoId === id);
  const frecuencia = new Map<number, number>();
  for (const m of miembros) frecuencia.set(m.roleId, (frecuencia.get(m.roleId) ?? 0) + 1);
  const masFrecuente = [...frecuencia.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const ref = datos.roles.find((r) => r.id === masFrecuente);
  return {
    cargo,
    miembros,
    rolReferencia: ref ? { id: ref.id, nombre: ref.nombre, permisoIds: ref.permisoIds } : null,
    roles: datos.roles.map((r) => ({ id: r.id, nombre: r.nombre, permisoIds: r.permisoIds, sistema: r.sistema })),
    catalogo,
    capacidades,
    modeloListo: datos.modeloListo,
  };
}

export async function guardarCargo(
  ctx: ContextoRoles,
  id: string,
  e: { actualizado: string | null; permisoIds: number[] },
): Promise<{ actualizado: string | null }> {
  exigir(await capacidadesDe(ctx), 'editarCargos');
  const { data, error } = await ctx.supabase.rpc('fn_cargo_guardar_permisos', {
    p_job_position_id: id,
    p_updated_at: e.actualizado,
    p_permisos: idsValidos(e.permisoIds),
  });
  if (error) {
    const err = errorDeRpc(error);
    if (err.codigo === 'conflicto') {
      const actual = (await leerCargos(ctx, id))[0];
      throw new ErrorRoles(409, 'conflicto', { actual: { actualizado: actual?.actualizado ?? null, permisoIds: actual?.permisoIds ?? [] } });
    }
    throw err;
  }
  return { actualizado: (data as { updated_at?: string } | null)?.updated_at ?? null };
}

// ─── ¿Qué puede hacer esta persona? ──────────────────────────────────────

async function leerAlcance(ctx: ContextoRoles, memberId: number, esAdmin: boolean): Promise<AlcanceMiembro> {
  const [sucursales, asignaciones] = await Promise.all([
    ctx.supabase
      .from('branches')
      .select('id, name, address, city')
      .eq('organization_id', ctx.organizationId)
      .eq('is_active', true)
      .order('name'),
    ctx.supabase.from('member_branches').select('branch_id').eq('organization_member_id', memberId),
  ]);
  if (sucursales.error) fallo(sucursales.error, 'branches');
  if (asignaciones.error) fallo(asignaciones.error, 'member_branches');
  const lista = (sucursales.data ?? []) as { id: number; name: string; address: string | null; city: string | null }[];
  const asignadas = ((asignaciones.data ?? []) as { branch_id: number }[]).map((a) => a.branch_id);
  // La misma regla que usan las rutas (`calcularAlcance`): admin o sin filas = todas.
  const alcance = calcularAlcance(esAdmin, lista.map((s) => s.id), asignadas);
  return {
    modo: esAdmin || asignadas.length === 0 ? 'todas' : 'algunas',
    esAdmin,
    sucursales: lista.map((s) => ({ id: s.id, nombre: s.name, detalle: [s.address, s.city].filter(Boolean).join(' · ') || null })),
    asignadas: esAdmin || asignadas.length === 0 ? [] : alcance.permitidas,
  };
}

export async function quePuedeHacer(ctx: ContextoRoles, memberId: number): Promise<QuePuedeHacer> {
  const capacidades = await capacidadesDe(ctx);
  const esPropio = ctx.memberId != null && Number(ctx.memberId) === memberId;
  if (!capacidades.verPersonas && !esPropio) throw new ErrorRoles(403, 'sin_permiso');

  const sb = ctx.supabase;
  const { data: fila, error } = await sb
    .from('organization_members')
    .select('id, user_id, role_id, job_position_id, is_super_admin, is_active')
    .eq('id', memberId)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  if (error) fallo(error, 'organization_members');
  if (!fila) throw new ErrorRoles(404, 'no_encontrado');
  const objetivo = fila as FilaMiembro & { is_active: boolean | null };

  const miembro = (await leerMiembros(ctx)).find((m) => m.id === memberId);
  if (!miembro) throw new ErrorRoles(404, 'no_encontrado');

  const superAdmin = objetivo.is_super_admin === true;
  const accesoTotal = isOrgAdminLike({ isSuperAdmin: superAdmin, roleId: objetivo.role_id });

  // Excepción documentada al guardarraíl 38: la base permite consultar los
  // permisos de OTRA persona solo a admin o con users.view (comprobado arriba
  // y otra vez dentro de la función).
  const [catalogo, efectivos, delRol, delCargo, modeloListo] = await Promise.all([
    leerCatalogo(sb),
    accesoTotal
      ? Promise.resolve({ data: null, error: null })
      : sb.rpc('get_user_permission_codes', { p_user_id: objetivo.user_id, p_organization_id: ctx.organizationId }),
    sb.from('role_permissions').select('permission_id').eq('role_id', objetivo.role_id).eq('allowed', true),
    objetivo.job_position_id
      ? sb.from('job_position_permissions').select('permission_id, allowed').eq('job_position_id', objetivo.job_position_id)
      : Promise.resolve({ data: [], error: null }),
    modeloListoDe(ctx),
  ]);
  if (efectivos.error) fallo(efectivos.error, 'get_user_permission_codes');
  if (delRol.error) fallo(delRol.error, 'role_permissions');
  if (delCargo.error) fallo(delCargo.error, 'job_position_permissions');

  const codigoDe = new Map(catalogo.map((p) => [p.id, p.codigo]));
  const codigosRol = new Set(
    ((delRol.data ?? []) as { permission_id: number }[]).map((r) => codigoDe.get(r.permission_id)).filter((c): c is string => !!c),
  );
  const cargo = new Map<string, boolean>();
  for (const r of (delCargo.data ?? []) as { permission_id: number; allowed: boolean }[]) {
    const c = codigoDe.get(r.permission_id);
    if (c) cargo.set(c, r.allowed);
  }
  const permisos = anotarOrigenes({
    catalogo,
    efectivos: accesoTotal ? 'todos' : new Set<string>((efectivos.data as string[] | null) ?? []),
    codigosRol,
    cargo,
  });
  const conteo = contarOrigenes(permisos, codigosRol);

  return {
    miembro,
    accesoTotal,
    motivoAccesoTotal: accesoTotal ? (superAdmin ? 'superAdmin' : 'rolAdmin') : null,
    rol: { id: objetivo.role_id, nombre: miembro.rolNombre ?? '—', total: conteo.rol },
    cargo: objetivo.job_position_id
      ? { id: objetivo.job_position_id, nombre: miembro.cargoNombre ?? '—', suma: conteo.cargoSuma, quita: conteo.cargoQuita }
      : null,
    total: conteo.total,
    permisos: permisos.map((p) => ({ id: p.permiso.id, concedido: p.concedido, origenes: p.origenes, quitadoPorCargo: p.quitadoPorCargo })),
    catalogo,
    alcance: await leerAlcance(ctx, memberId, accesoTotal),
    puedeEditarAlcance: capacidades.editarAlcance && !miembro.esSesion && !miembro.dueno && !accesoTotal,
    modeloListo,
  };
}

/**
 * Alcance por sucursal con la MISMA RPC que Organización › Miembros
 * (`fn_miembro_asignar_sucursales`, migración 20261006040701): una sola regla
 * en la base. `null` = «todas» explícito (`p_todas`); una lista vacía no es
 * «todas» y se rechaza aquí antes de llegar a la base, que también la rechaza.
 */
export async function guardarAlcance(ctx: ContextoRoles, memberId: number, sucursales: number[] | null): Promise<{ sucursales: number[] }> {
  exigir(await capacidadesDe(ctx), 'editarAlcance');
  const ids = sucursales == null ? null : idsValidos(sucursales);
  if (ids !== null && ids.length === 0) throw new ErrorRoles(400, 'datos_invalidos');
  const { data, error } = await ctx.supabase.rpc('fn_miembro_asignar_sucursales', {
    p_member_id: memberId,
    p_branch_ids: ids,
    p_todas: ids === null,
  });
  if (error) throw errorDeRpc(error);
  return { sucursales: ((data as { sucursales?: number[] } | null)?.sucursales ?? []).map(Number) };
}
