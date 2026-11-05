/**
 * Zonas de restaurante para el campo «Zonas visibles» de la reserva con plano (entidad `zone`,
 * Figma «16 Sitio web» 2223:46106, lámina 15). Solo servidor: recibe el cliente de la SESIÓN
 * (RLS de pertenencia) y la organización ya resuelta por `withOrg`.
 *
 * Una zona es un nombre: el mismo texto en `restaurant_zone_layouts.zone_name` (recuadro del
 * plano) y en `restaurant_tables.zone` (la mesa). Se juntan las dos fuentes, porque una zona puede
 * tener mesas sin recuadro dibujado o recuadro sin mesas todavía.
 *
 * Columnas verificadas por MCP (taqjemqjtumhwptchcxk) el 2026-11-05:
 * - restaurant_zone_layouts: organization_id, branch_id (NOT NULL), zone_name (NOT NULL), sort_order
 * - restaurant_tables: organization_id, branch_id (NOT NULL), zone (NULL), is_web_bookable (NOT NULL, default true)
 * - branches: id, organization_id, name
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface ZonaRestaurante {
  nombre: string;
  /** Sedes donde existe la zona, por nombre. */
  sedes: { id: number; nombre: string }[];
  /** Mesas de la zona que se pueden reservar en la web. */
  mesasWeb: number;
}

interface FilaZona {
  zone_name: string | null;
  branch_id: number | null;
  sort_order: number | null;
}

interface FilaMesa {
  zone: string | null;
  branch_id: number | null;
  is_web_bookable: boolean | null;
}

/** Junta zonas de recuadros y de mesas por nombre (sin distinguir mayúsculas), en orden de dibujo. */
export function unirZonas(
  recuadros: readonly FilaZona[],
  mesas: readonly FilaMesa[],
  sedes: ReadonlyMap<number, string>,
): ZonaRestaurante[] {
  const porNombre = new Map<string, { nombre: string; sedes: Set<number>; mesasWeb: number; orden: number }>();
  const entrada = (crudo: string | null, orden: number) => {
    const nombre = (crudo ?? '').trim();
    if (!nombre) return null;
    const clave = nombre.toLocaleLowerCase('es');
    let z = porNombre.get(clave);
    if (!z) {
      z = { nombre, sedes: new Set(), mesasWeb: 0, orden };
      porNombre.set(clave, z);
    }
    z.orden = Math.min(z.orden, orden);
    return z;
  };
  for (const r of recuadros) {
    const z = entrada(r.zone_name, r.sort_order ?? 1000);
    if (z && r.branch_id !== null) z.sedes.add(r.branch_id);
  }
  for (const m of mesas) {
    const z = entrada(m.zone, 2000);
    if (!z) continue;
    if (m.branch_id !== null) z.sedes.add(m.branch_id);
    if (m.is_web_bookable !== false) z.mesasWeb += 1;
  }
  return [...porNombre.values()]
    .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es'))
    .map((z) => ({
      nombre: z.nombre,
      sedes: [...z.sedes].filter((id) => sedes.has(id)).map((id) => ({ id, nombre: sedes.get(id) as string })),
      mesasWeb: z.mesasWeb,
    }));
}

/** Zonas de la organización; con `sedes`, solo las de esas sedes (ya validadas como de la organización). */
export async function listarZonasRestaurante(cliente: SupabaseClient, org: number, sedes: readonly number[] | null = null): Promise<ZonaRestaurante[]> {
  let recuadros = cliente.from('restaurant_zone_layouts').select('zone_name, branch_id, sort_order').eq('organization_id', org);
  let mesas = cliente.from('restaurant_tables').select('zone, branch_id, is_web_bookable').eq('organization_id', org).not('zone', 'is', null);
  if (sedes && sedes.length > 0) {
    recuadros = recuadros.in('branch_id', [...sedes]);
    mesas = mesas.in('branch_id', [...sedes]);
  }
  const [r, m, b] = await Promise.all([recuadros, mesas, cliente.from('branches').select('id, name').eq('organization_id', org)]);
  if (r.error) throw r.error;
  if (m.error) throw m.error;
  if (b.error) throw b.error;
  const nombres = new Map(((b.data ?? []) as { id: number; name: string }[]).map((x) => [x.id, x.name]));
  return unirZonas((r.data ?? []) as FilaZona[], (m.data ?? []) as FilaMesa[], nombres);
}
