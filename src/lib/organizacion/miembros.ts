/**
 * Miembros de Organización › Equipo: de las filas de la RPC
 * `get_profiles_by_organization` (una por miembro y sucursal) a un miembro por
 * fila, y los filtros del listado.
 *
 * Reglas que antes estaban mal (auditoría 2026-10, P1-7):
 * - el estado se filtra por el valor (`activo`/`inactivo`), no por el texto
 *   traducido;
 * - cualquier cambio de filtro vuelve a la página 1 (lo hace la pantalla con
 *   `calcularRango`, que además acota la página al total).
 *
 * Alcance por sucursal (`src/lib/security/alcanceSucursal.ts`): un miembro SIN
 * filas en `member_branches` ve TODAS las sucursales. Por eso aquí «sin sede»
 * se muestra como «Todas las sedes», y quitar la última sede de un miembro no
 * se ofrece: le ampliaría el acceso en silencio.
 */
import { normalizar } from './invitaciones';

export interface FilaPerfilMiembro {
  id: number | string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  avatar_url?: string | null;
  role_id: number | null;
  role_name: string | null;
  is_active: boolean | null;
  is_super_admin: boolean | null;
  branch_id: number | string | null;
  branch_name: string | null;
  job_position_id?: string | null;
  job_position_name: string | null;
  created_at: string | null;
}

export interface SedeMiembro {
  id: number;
  nombre: string;
}

export interface Miembro {
  /** `organization_members.id` como texto (clave de fila y de selección). */
  id: string;
  userId: string | null;
  nombre: string;
  email: string;
  avatarUrl: string | null;
  rolId: number | null;
  rolNombre: string | null;
  esSuperAdmin: boolean;
  activo: boolean;
  sedes: SedeMiembro[];
  cargoId: string | null;
  cargoNombre: string | null;
  creadoEn: string | null;
}

/**
 * Agrupa por miembro. `usuarios` mapea `organization_members.id` → `user_id`
 * (la RPC no lo devuelve; las cuotas lo necesitan).
 */
export function agruparMiembros(filas: readonly FilaPerfilMiembro[], usuarios: ReadonlyMap<string, string> = new Map()): Miembro[] {
  const porId = new Map<string, Miembro>();
  for (const f of filas) {
    const id = String(f.id);
    let m = porId.get(id);
    if (!m) {
      const nombre = `${f.first_name ?? ''} ${f.last_name ?? ''}`.trim();
      m = {
        id,
        userId: usuarios.get(id) ?? null,
        nombre,
        email: f.email ?? '',
        avatarUrl: f.avatar_url ?? null,
        rolId: f.role_id ?? null,
        rolNombre: f.role_name ?? null,
        esSuperAdmin: f.is_super_admin === true,
        activo: f.is_active === true,
        sedes: [],
        cargoId: f.job_position_id ?? null,
        cargoNombre: f.job_position_name ?? null,
        creadoEn: f.created_at ?? null,
      };
      porId.set(id, m);
    }
    if (f.branch_id != null && f.branch_name) {
      const sedeId = Number(f.branch_id);
      if (!m.sedes.some((s) => s.id === sedeId)) m.sedes.push({ id: sedeId, nombre: f.branch_name });
    }
  }
  const lista = [...porId.values()];
  for (const m of lista) m.sedes.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  return lista.sort((a, b) => (a.nombre || a.email).localeCompare(b.nombre || b.email, 'es'));
}

export type FiltroEstadoMiembro = 'todos' | 'activo' | 'inactivo';

export interface FiltrosMiembro {
  /** Un solo buscador: nombre, correo o cargo. */
  texto: string;
  rolId: number | null;
  /** `null` = todas. Un miembro sin sedes cuenta en todas (ve todas). */
  sedeId: number | null;
  estado: FiltroEstadoMiembro;
}

export const FILTROS_MIEMBRO_VACIOS: FiltrosMiembro = { texto: '', rolId: null, sedeId: null, estado: 'todos' };

export function contarFiltrosActivos(f: FiltrosMiembro): number {
  return [f.rolId !== null, f.sedeId !== null, f.estado !== 'todos'].filter(Boolean).length;
}

export function filtrarMiembros(miembros: readonly Miembro[], f: FiltrosMiembro): Miembro[] {
  const q = normalizar(f.texto);
  return miembros.filter((m) => {
    if (q) {
      const pajar = normalizar(`${m.nombre} ${m.email} ${m.cargoNombre ?? ''}`);
      if (!pajar.includes(q)) return false;
    }
    if (f.rolId !== null && m.rolId !== f.rolId) return false;
    if (f.sedeId !== null && m.sedes.length > 0 && !m.sedes.some((s) => s.id === f.sedeId)) return false;
    if (f.estado === 'activo' && !m.activo) return false;
    if (f.estado === 'inactivo' && m.activo) return false;
    return true;
  });
}

/** «Todas las sedes» si no tiene filas (ve todas); si no, sus sedes. */
export function alcanceSedes(m: Pick<Miembro, 'sedes'>): { todas: true } | { todas: false; sedes: SedeMiembro[] } {
  return m.sedes.length === 0 ? { todas: true } : { todas: false, sedes: m.sedes };
}

/**
 * ¿Se le puede quitar esta sede? No si es la única: sin filas pasaría a ver
 * todas las sucursales (más acceso, no menos).
 */
export function puedeQuitarSede(m: Pick<Miembro, 'sedes'>, sedeId: number): boolean {
  return m.sedes.length > 1 && m.sedes.some((s) => s.id === sedeId);
}

/**
 * Selección para acciones masivas: separa los que se pueden tocar de los que
 * no (uno mismo, super admins). El servidor vuelve a comprobarlo todo.
 */
export function separarSeleccion(
  miembros: readonly Miembro[],
  ids: ReadonlySet<string>,
  miUsuarioId: string | null,
): { aplicables: Miembro[]; omitidos: Miembro[] } {
  const aplicables: Miembro[] = [];
  const omitidos: Miembro[] = [];
  for (const m of miembros) {
    if (!ids.has(m.id)) continue;
    if (m.esSuperAdmin || (miUsuarioId !== null && m.userId === miUsuarioId)) omitidos.push(m);
    else aplicables.push(m);
  }
  return { aplicables, omitidos };
}
