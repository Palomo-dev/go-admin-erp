/**
 * «Revisión con los datos de la sede» del diálogo Publicar (Figma «16 Sitio web» 2264:51434,
 * lámina 16): avisos que NO bloquean, calculados en el servidor con el borrador guardado y los
 * datos del ERP. El navegador solo manda el id del sitio; la organización sale de la sesión.
 *
 * Solo servidor: recibe el cliente de la SESIÓN (RLS de pertenencia) y la organización ya
 * resuelta por `withOrg`. El borrador se lee con `obtenerBorrador`, que ya valida que el sitio
 * sea de la organización.
 *
 * Columnas verificadas por MCP (taqjemqjtumhwptchcxk) el 2026-11-05:
 * - restaurant_tables: organization_id, branch_id, zone, position_x, position_y
 * - restaurant_floor_elements: organization_id, branch_id, show_on_web
 * - restaurant_booking_settings: organization_id, branch_id (NULL = de la organización), is_enabled
 *   (misma regla que `fn_ajustes_reserva`: la de la sede y, si no hay, la de la organización)
 * - product_branch_prices: organization_id, branch_id, effective_from, effective_to
 * - branches: id, organization_id, name, is_active, is_web_published
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { obtenerBorrador } from '@/lib/services/website/siteDocumentService';
import { avisosPublicacion, usosConDatos, type AvisoPublicacion, type DatosSedePublicacion } from '@/lib/website/v2/cambiosPublicacion';

/** Tope de sedes revisadas (una organización con muchas sedes no hace N consultas sin límite). */
const MAX_SEDES = 10;

interface Sede {
  id: number;
  name: string;
  is_active: boolean | null;
  is_web_published: boolean | null;
}

async function datosDeSedes(cliente: SupabaseClient, org: number, sedes: readonly Sede[]): Promise<DatosSedePublicacion[]> {
  if (sedes.length === 0) return [];
  const ids = sedes.map((s) => s.id);
  const ahora = new Date().toISOString();
  const [mesas, elementos, ajustes, precios] = await Promise.all([
    cliente.from('restaurant_tables').select('branch_id, zone, position_x, position_y').eq('organization_id', org).in('branch_id', ids),
    cliente.from('restaurant_floor_elements').select('branch_id').eq('organization_id', org).eq('show_on_web', true).in('branch_id', ids),
    cliente.from('restaurant_booking_settings').select('branch_id, is_enabled').eq('organization_id', org),
    Promise.all(
      ids.map((id) =>
        cliente
          .from('product_branch_prices')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', org)
          .eq('branch_id', id)
          .lte('effective_from', ahora)
          .or(`effective_to.is.null,effective_to.gt.${ahora}`),
      ),
    ),
  ]);
  for (const r of [mesas, elementos, ajustes, ...precios]) if (r.error) throw r.error;
  const filasMesas = (mesas.data ?? []) as { branch_id: number; zone: string | null; position_x: number | null; position_y: number | null }[];
  const filasElementos = (elementos.data ?? []) as { branch_id: number }[];
  const filasAjustes = (ajustes.data ?? []) as { branch_id: number | null; is_enabled: boolean }[];
  const deOrganizacion = filasAjustes.find((a) => a.branch_id === null);
  return sedes.map((s, i) => {
    const propia = filasAjustes.find((a) => a.branch_id === s.id) ?? deOrganizacion;
    return {
      id: s.id,
      nombre: s.name,
      mesas: filasMesas
        .filter((m) => m.branch_id === s.id)
        .map((m) => ({ zona: m.zone, conPosicion: typeof m.position_x === 'number' && typeof m.position_y === 'number' })),
      elementos: filasElementos.filter((e) => e.branch_id === s.id).length,
      reservasActivas: propia ? propia.is_enabled : null,
      preciosPropios: precios[i].count ?? 0,
    };
  });
}

/**
 * Sedes a revisar por uso: las que eligió la sección o, sin elección, las de la organización con
 * mesas (plano) o con sitio publicado (carta); si ninguna cumple, las activas.
 */
function sedesDeUso(activas: readonly Sede[], ids: number[] | null, respaldo: (s: Sede) => boolean): Sede[] {
  if (ids === null) return [];
  if (ids.length > 0) return activas.filter((s) => ids.includes(s.id));
  const candidatas = activas.filter(respaldo);
  return candidatas.length > 0 ? [...candidatas] : [...activas];
}

export async function avisosDePublicacion(cliente: SupabaseClient, org: number, sitioId: string): Promise<AvisoPublicacion[]> {
  const borrador = await obtenerBorrador(cliente, org, sitioId);
  const usos = usosConDatos(borrador.documento);
  if (!usos.plano && !usos.carta && !usos.portada) return [];

  const branchSitio = borrador.sitio.branchId;
  const { data: filasSedes, error } = await cliente.from('branches').select('id, name, is_active, is_web_published').eq('organization_id', org);
  if (error) throw error;
  const todas = (filasSedes ?? []) as Sede[];

  let plano: Sede[];
  let carta: Sede[];
  if (branchSitio !== null) {
    // Sitio de una sede: se revisa esa sede, elijan lo que elijan las secciones.
    const sede = todas.filter((s) => s.id === branchSitio);
    plano = usos.plano ? sede : [];
    carta = usos.carta ? sede : [];
  } else {
    const activas = todas.filter((s) => s.is_active !== false);
    let conMesas = new Set<number>();
    if (usos.plano && usos.plano.sedes.length === 0) {
      const { data, error: e } = await cliente.from('restaurant_tables').select('branch_id').eq('organization_id', org);
      if (e) throw e;
      conMesas = new Set(((data ?? []) as { branch_id: number }[]).map((m) => m.branch_id));
    }
    plano = sedesDeUso(activas, usos.plano?.sedes ?? null, (x) => conMesas.has(x.id)).slice(0, MAX_SEDES);
    carta = sedesDeUso(activas, usos.carta?.sedes ?? null, (x) => x.is_web_published === true).slice(0, MAX_SEDES);
  }
  // Cada uso con sus sedes explícitas: la carta no revisa las sedes que solo pidió el plano.
  // Sin sedes que revisar, ese uso no se revisa (un `[]` querría decir «todas»).
  if (usos.plano) usos.plano = plano.length > 0 ? { sedes: plano.map((s) => s.id) } : null;
  if (usos.carta) usos.carta = carta.length > 0 ? { sedes: carta.map((s) => s.id) } : null;
  const unidas = new Map<number, Sede>([...plano, ...carta].map((s) => [s.id, s]));
  return avisosPublicacion(usos, await datosDeSedes(cliente, org, [...unidas.values()]));
}
