/**
 * Cuenta los registros de cada fuente de datos de las secciones del sitio
 * (ver `fuentesDatosSecciones.ts`). Solo servidor; recibe el cliente de la
 * SESIÓN (RLS) y la organización ya resuelta por `withOrg`.
 *
 * Devuelve conteos, nunca filas: `select('id', { count: 'exact', head: true })`.
 * Una fuente cuya consulta falla no aparece en el resultado (el editor no avisa
 * de lo que no pudo comprobar).
 *
 * Columnas verificadas por MCP (jgmgphmzusbluqhuqihj) el 2026-10-05:
 * - space_types: organization_id, is_active
 * - products: organization_id, status, parent_product_id
 * - product_prices: product_id, price, compare_price, effective_to (sin organization_id)
 * - categories: organization_id, is_active, branch_id
 * - parking_zones: branch_id (sin organization_id: se filtra por la sede de la organización), is_active
 * - parking_rates: organization_id, branch_id, is_active
 * - parking_pass_types: organization_id, is_active
 * - restaurant_tables: organization_id, branch_id (mesas por sede para reservar)
 * - branches: organization_id, is_active
 * Y el 2026-10-06 (mismos filtros que lib/website/datosSecciones.ts del sitio):
 * - gym_classes: organization_id, branch_id, status ('active' | 'cancelled' |
 *   'completed'), end_at, recurrence (próximas o recurrentes)
 * - transport_routes: organization_id, is_active
 * - vehicles: organization_id, branch_id, is_active
 * - membership_plans: organization_id, is_active
 * Mismo criterio que el sitio público: productos `status = 'active'` y sin padre;
 * tipos de habitación activos (`getOrganizationSpaceTypes`).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { LISTA_FUENTES, type ConteoFuentes, type FuenteDatos } from './fuentesDatosSecciones';

interface ResultadoConteo {
  count: number | null;
  error: unknown;
}

type ConsultaConteo = PromiseLike<ResultadoConteo>;

/**
 * Consultas por fuente. `sede` (opcional, ya validada contra la organización)
 * acota las tablas que tienen `branch_id`: lo de esa sede y lo de toda la
 * organización (`branch_id` nulo).
 */
function consultas(
  cliente: SupabaseClient,
  org: number,
  sede: number | null,
  ahora: Date = new Date(),
): Record<FuenteDatos, () => ConsultaConteo> {
  const conteo = { count: 'exact' as const, head: true };
  return {
    tipos_habitacion: () =>
      cliente.from('space_types').select('id', conteo).eq('organization_id', org).eq('is_active', true),
    productos: () =>
      cliente
        .from('products')
        .select('id', conteo)
        .eq('organization_id', org)
        .eq('status', 'active')
        .is('parent_product_id', null),
    categorias: () => {
      let q = cliente.from('categories').select('id', conteo).eq('organization_id', org).eq('is_active', true);
      if (sede !== null) q = q.or(`branch_id.is.null,branch_id.eq.${sede}`);
      return q;
    },
    ofertas: () =>
      cliente
        .from('product_prices')
        .select('id, products!inner(organization_id, status)', conteo)
        .eq('products.organization_id', org)
        .eq('products.status', 'active')
        .is('effective_to', null)
        .gt('compare_price', 0),
    zonas_parqueo: () => {
      let q = cliente
        .from('parking_zones')
        .select('id, branches!inner(organization_id)', conteo)
        .eq('branches.organization_id', org)
        .eq('is_active', true);
      if (sede !== null) q = q.eq('branch_id', sede);
      return q;
    },
    tarifas_parqueo: () => {
      let q = cliente.from('parking_rates').select('id', conteo).eq('organization_id', org).eq('is_active', true);
      if (sede !== null) q = q.or(`branch_id.is.null,branch_id.eq.${sede}`);
      return q;
    },
    planes_parqueo: () =>
      cliente.from('parking_pass_types').select('id', conteo).eq('organization_id', org).eq('is_active', true),
    mesas: () => {
      let q = cliente.from('restaurant_tables').select('id', conteo).eq('organization_id', org);
      if (sede !== null) q = q.eq('branch_id', sede);
      return q;
    },
    sedes: () => {
      let q = cliente.from('branches').select('id', conteo).eq('organization_id', org).eq('is_active', true);
      if (sede !== null) q = q.eq('id', sede);
      return q;
    },
    clases: () => {
      let q = cliente
        .from('gym_classes')
        .select('id', conteo)
        .eq('organization_id', org)
        .eq('status', 'active')
        .or(`end_at.gte."${ahora.toISOString()}",recurrence.not.is.null`);
      if (sede !== null) q = q.or(`branch_id.is.null,branch_id.eq.${sede}`);
      return q;
    },
    rutas: () =>
      cliente.from('transport_routes').select('id', conteo).eq('organization_id', org).eq('is_active', true),
    flota: () => {
      let q = cliente.from('vehicles').select('id', conteo).eq('organization_id', org).eq('is_active', true);
      if (sede !== null) q = q.or(`branch_id.is.null,branch_id.eq.${sede}`);
      return q;
    },
    planes_membresia: () =>
      cliente.from('membership_plans').select('id', conteo).eq('organization_id', org).eq('is_active', true),
  };
}

export async function contarFuentesDatos(
  cliente: SupabaseClient,
  org: number,
  sede: number | null,
  fuentes: readonly FuenteDatos[] = LISTA_FUENTES,
): Promise<ConteoFuentes> {
  const porFuente = consultas(cliente, org, sede);
  const resultados = await Promise.all(
    fuentes.map(async (f) => {
      try {
        const { count, error } = await porFuente[f]();
        if (error || typeof count !== 'number') return [f, null] as const;
        return [f, count] as const;
      } catch {
        return [f, null] as const;
      }
    }),
  );
  const conteos: ConteoFuentes = {};
  for (const [f, n] of resultados) if (n !== null) conteos[f] = n;
  return conteos;
}
