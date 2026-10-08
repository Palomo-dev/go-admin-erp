/**
 * Guardar el plano (Figma 870:104583 «Guardar cambios (n)» y 2261:977952):
 * mesas nuevas y editadas, zonas (nombre, color, orden y su recuadro) y
 * elementos fijos, en UNA transacción con la RPC `guardar_plano_sede`
 * (migración 20261008140014). El permiso lo resuelve la base: sesión,
 * pertenencia a la organización de la sede y acceso a la sede; la
 * organización sale de la sede, no del navegador.
 *
 * Los borrados van aparte (la RPC no borra, ver la migración):
 * - elementos fijos: ANTES de la RPC, con RLS; si fallan no se guarda nada y
 *   reintentar no duplica (las altas aún no se mandaron);
 * - mesas: DESPUÉS, con el servicio de siempre, que no borra una mesa con
 *   cuenta abierta (vuelven en `noBorradas`).
 */
import { supabase } from '@/lib/supabase/config';
import { getCurrentBranchId, getOrganizationId } from '@/lib/hooks/useOrganization';
import { MesasService } from '../mesasService';
import { esFuncionFaltante, marcarEstadoMesa } from '../cuenta/cuentaMesaService';
import type { FormaMesa } from './estadoMesaPlano';
import type { CambiosPlano, ElementoEnPlano, EstadoEditor } from './planoMesasLogica';
import {
  COLUMNAS_ELEMENTOS,
  FORMA_BD,
  RPC_GUARDAR_PLANO,
  TABLA_ELEMENTOS,
  cuerpoGuardarPlano,
  elementoDesdeFila,
  hayQueGuardar,
} from './planoGuardadoLogica';

export interface ResultadoPlano {
  /** Mesas que no se pudieron borrar (tienen cuenta abierta). */
  noBorradas: string[];
  /**
   * Faltaban las columnas de forma, tamaño, color y orden. Ya no pasa: la RPC
   * las exige (migraciones 20261006164925 y 20261008133928). Se conserva para
   * la pantalla, siempre en false.
   */
  sinColumnasNuevas: boolean;
}

export async function guardarPlano(cambios: CambiosPlano, estado: EstadoEditor): Promise<ResultadoPlano> {
  const organizationId = getOrganizationId();
  const branchId = getCurrentBranchId();
  if (!branchId) throw new Error('sin_sucursal');

  // 1. Elementos fijos borrados (RLS: miembros de la organización).
  if (cambios.elementosBorrados.length > 0) {
    const { error } = await supabase
      .from(TABLA_ELEMENTOS)
      .delete()
      .in('id', cambios.elementosBorrados)
      .eq('organization_id', organizationId)
      .eq('branch_id', branchId);
    if (error) throw error;
  }

  // 2. Altas y cambios en una transacción.
  const cuerpo = cuerpoGuardarPlano(cambios, estado);
  if (hayQueGuardar(cuerpo)) {
    const { error } = await supabase.rpc(RPC_GUARDAR_PLANO, { p_branch_id: branchId, p_cambios: cuerpo });
    if (error) throw error;
  }

  // 3. Mesas borradas: el servicio de siempre (no borra una mesa con cuenta abierta).
  const noBorradas: string[] = [];
  for (const id of cambios.borradas) {
    try {
      await MesasService.eliminarMesa(id);
    } catch {
      noBorradas.push(id);
    }
  }

  return { noBorradas, sinColumnasNuevas: false };
}

/** Elementos fijos de la sede actual (vacío si la tabla aún no existe o no hay sede). */
export async function obtenerElementosPlano(): Promise<ElementoEnPlano[]> {
  const organizationId = getOrganizationId();
  const branchId = getCurrentBranchId();
  if (!branchId) return [];
  const { data, error } = await supabase
    .from(TABLA_ELEMENTOS)
    .select(COLUMNAS_ELEMENTOS)
    .eq('organization_id', organizationId)
    .eq('branch_id', branchId)
    .order('sort_order', { ascending: true });
  if (error) {
    if (!esFuncionFaltante(error)) console.error('Error cargando los elementos del plano:', error);
    return [];
  }
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(elementoDesdeFila).filter((e): e is ElementoEnPlano => e !== null);
}

export interface ZonaGuardada {
  nombre: string;
  color: string | null;
  orden: number | null;
}

/** Zonas con recuadro guardado (también las vacías), con su color y orden si existen. */
export async function obtenerZonasPlano(): Promise<ZonaGuardada[]> {
  const organizationId = getOrganizationId();
  const branchId = getCurrentBranchId();
  const consulta = (cols: string) => {
    let q = supabase.from('restaurant_zone_layouts').select(cols).eq('organization_id', organizationId);
    if (branchId) q = q.eq('branch_id', branchId);
    return q;
  };
  let { data, error } = await consulta('zone_name, color, sort_order');
  if (error && esFuncionFaltante(error)) ({ data, error } = await consulta('zone_name'));
  if (error) return [];
  return ((data ?? []) as unknown as Array<{ zone_name: string; color?: string | null; sort_order?: number | null }>).map((r) => ({
    nombre: r.zone_name,
    color: r.color ?? null,
    orden: r.sort_order ?? null,
  }));
}

/** Crea varias mesas de una vez (estado vacío «Agregar mesas en lote»): una sola inserción. */
export async function crearMesasEnLote(datos: { desde: number; cantidad: number; capacidad: number; zona: string | null; forma: FormaMesa; prefijo: string }): Promise<void> {
  const organizationId = getOrganizationId();
  const branchId = getCurrentBranchId();
  if (!branchId) throw new Error('sin_sucursal');
  const filas = (cn: boolean) =>
    Array.from({ length: datos.cantidad }, (_, i) => ({
      organization_id: organizationId,
      branch_id: branchId,
      name: `${datos.prefijo} ${datos.desde + i}`,
      zone: datos.zona || null,
      capacity: datos.capacidad,
      state: 'free',
      ...(cn ? { shape: FORMA_BD[datos.forma] } : {}),
    }));
  let { error } = await supabase.from('restaurant_tables').insert(filas(true));
  if (error && esFuncionFaltante(error)) ({ error } = await supabase.from('restaurant_tables').insert(filas(false)));
  if (error) throw error;
}

/** «Por limpiar» → libre (870:98621 «Limpiar»): la RPC nueva o, sin ella, el estado de siempre. */
export async function marcarMesaLista(tableId: string): Promise<void> {
  if (await marcarEstadoMesa(tableId, 'free')) return;
  await MesasService.cambiarEstadoMesa(tableId, 'free');
}
