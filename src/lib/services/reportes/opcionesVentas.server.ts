/**
 * Opciones de los filtros «Persona» y «Método de pago» de los reportes de
 * ventas: miembros activos de la organización con su rol, y los métodos de
 * pago activos de la organización con su nombre legible.
 *
 * Todo con el cliente de la sesión (RLS por pertenencia) y la organización de
 * la sesión, nunca la del cliente. Solo alimenta los selectores: la RPC del
 * reporte vuelve a exigir pertenencia y alcance, y un uuid o un código que no
 * sean de la organización simplemente no encuentran ventas.
 */
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { nombreDePerfil } from './programados/programacion';

export const MAX_PERSONAS_VENTAS = 500;

export interface PersonaVentas {
  id: string;
  nombre: string;
  rol: string | null;
}

export interface MetodoVentas {
  codigo: string;
  nombre: string;
}

export interface OpcionesVentas {
  personas: PersonaVentas[];
  metodos: MetodoVentas[];
}

type Ctx = Pick<ServerOrgContext, 'organizationId' | 'supabase'>;

interface FilaMiembro {
  user_id: string;
  roles: { name: string | null } | { name: string | null }[] | null;
}

const primero = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

export async function listarOpcionesVentas(ctx: Ctx): Promise<OpcionesVentas> {
  const db = ctx.supabase;
  const [miembrosRes, metodosOrgRes] = await Promise.all([
    db
      .from('organization_members')
      .select('user_id, roles(name)')
      .eq('organization_id', ctx.organizationId)
      .eq('is_active', true)
      .limit(MAX_PERSONAS_VENTAS),
    db.from('organization_payment_methods').select('payment_method_code').eq('organization_id', ctx.organizationId).eq('is_active', true),
  ]);
  if (miembrosRes.error) throw new Error(`No se pudieron leer los miembros: ${miembrosRes.error.message}`);
  if (metodosOrgRes.error) throw new Error(`No se pudieron leer los métodos de pago: ${metodosOrgRes.error.message}`);

  const miembros = (miembrosRes.data ?? []) as unknown as FilaMiembro[];
  const codigos = [...new Set(((metodosOrgRes.data ?? []) as Array<{ payment_method_code: string | null }>).map((m) => m.payment_method_code).filter((c): c is string => !!c))];

  const ids = [...new Set(miembros.map((m) => m.user_id).filter(Boolean))];
  const [perfilesRes, metodosRes] = await Promise.all([
    ids.length ? db.from('profiles').select('id, first_name, last_name, email').in('id', ids) : Promise.resolve({ data: [], error: null }),
    // Sin métodos configurados en la organización se ofrecen los del catálogo general.
    codigos.length ? db.from('payment_methods').select('code, name').in('code', codigos) : db.from('payment_methods').select('code, name'),
  ]);
  if (perfilesRes.error) throw new Error(`No se pudieron leer los perfiles: ${perfilesRes.error.message}`);
  if (metodosRes.error) throw new Error(`No se pudieron leer los nombres de los métodos: ${metodosRes.error.message}`);

  const perfiles = new Map(
    ((perfilesRes.data ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null; email: string | null }>).map((p) => [p.id, p]),
  );
  const rolDe = new Map(miembros.map((m) => [m.user_id, primero(m.roles)?.name ?? null]));
  const personas: PersonaVentas[] = ids
    .map((id) => ({ id, nombre: nombreDePerfil(perfiles.get(id)) ?? '—', rol: rolDe.get(id) ?? null }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  const nombreMetodo = new Map(((metodosRes.data ?? []) as Array<{ code: string; name: string | null }>).map((m) => [m.code, m.name ?? m.code]));
  const metodos: MetodoVentas[] = (codigos.length ? codigos : Array.from(nombreMetodo.keys()))
    .map((codigo) => ({ codigo, nombre: nombreMetodo.get(codigo) ?? codigo }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  return { personas, metodos };
}
