/**
 * Guardar el plano (Figma 870:104583 «Guardar cambios (n)»): mesas nuevas,
 * editadas y borradas, y las zonas (nombre, color, orden y su recuadro).
 *
 * Forma, tamaño, color y orden son columnas de la migración
 * 20261006164925_pos_mesas_flujo_atencion: mientras no esté aplicada se guarda
 * sin ellas (la forma vuelve a salir de la capacidad) y se avisa.
 */
import { supabase } from '@/lib/supabase/config';
import { getCurrentBranchId, getOrganizationId } from '@/lib/hooks/useOrganization';
import { MesasService } from '../mesasService';
import { esFuncionFaltante, marcarEstadoMesa } from '../cuenta/cuentaMesaService';
import type { FormaMesa } from './estadoMesaPlano';
import { cajaDeZona, mesasDeZona, type CambiosPlano, type EstadoEditor, type MesaEnPlano } from './planoMesasLogica';

const FORMA_BD: Record<FormaMesa, string> = { cuadrada: 'square', redonda: 'round', larga: 'long', barra: 'bar' };

export interface ResultadoPlano {
  /** Mesas que no se pudieron borrar (tienen cuenta abierta). */
  noBorradas: string[];
  /** Faltan las columnas nuevas: se guardó sin forma, tamaño, color ni orden. */
  sinColumnasNuevas: boolean;
}

function filaMesa(m: MesaEnPlano, conNuevas: boolean) {
  return {
    name: m.nombre.trim(),
    zone: m.zona || null,
    capacity: m.capacidad,
    position_x: Math.round(m.x),
    position_y: Math.round(m.y),
    rotation: Math.round(m.rotacion),
    ...(conNuevas ? { shape: FORMA_BD[m.forma], size: m.tamano } : {}),
  };
}

export async function guardarPlano(cambios: CambiosPlano, estado: EstadoEditor): Promise<ResultadoPlano> {
  const organizationId = getOrganizationId();
  const branchId = getCurrentBranchId();
  if (!branchId) throw new Error('sin_sucursal');
  let conNuevas = true;
  const ahora = new Date().toISOString();

  // Mesas nuevas: una sola inserción (todas o ninguna).
  if (cambios.nuevas.length > 0) {
    const filas = (cn: boolean) =>
      cambios.nuevas.map((m) => ({ ...filaMesa(m, cn), organization_id: organizationId, branch_id: branchId, state: 'free' }));
    let { error } = await supabase.from('restaurant_tables').insert(filas(true));
    if (error && esFuncionFaltante(error)) {
      conNuevas = false;
      ({ error } = await supabase.from('restaurant_tables').insert(filas(false)));
    }
    if (error) throw error;
  }

  // Mesas editadas.
  for (const m of cambios.editadas) {
    let { error } = await supabase
      .from('restaurant_tables')
      .update({ ...filaMesa(m, conNuevas), updated_at: ahora })
      .eq('id', m.id)
      .eq('organization_id', organizationId);
    if (error && conNuevas && esFuncionFaltante(error)) {
      conNuevas = false;
      ({ error } = await supabase
        .from('restaurant_tables')
        .update({ ...filaMesa(m, false), updated_at: ahora })
        .eq('id', m.id)
        .eq('organization_id', organizationId));
    }
    if (error) throw error;
  }

  // Mesas borradas: el servicio de siempre (no borra una mesa con cuenta abierta).
  const noBorradas: string[] = [];
  for (const id of cambios.borradas) {
    try {
      await MesasService.eliminarMesa(id);
    } catch {
      noBorradas.push(id);
    }
  }

  // Zonas: recuadro ajustado a sus mesas, color y orden.
  if (estado.zonas.length > 0) {
    const filas = (cn: boolean) =>
      estado.zonas.map((z) => {
        const caja = cajaDeZona(mesasDeZona(estado.mesas, z.nombre)) ?? { x: 0, y: 0, w: 200, h: 150 };
        return {
          organization_id: organizationId,
          branch_id: branchId,
          zone_name: z.nombre.trim(),
          position_x: Math.round(caja.x),
          position_y: Math.round(caja.y),
          width: Math.round(caja.w),
          height: Math.round(caja.h),
          updated_at: ahora,
          ...(cn ? { color: z.color, sort_order: z.orden } : {}),
        };
      });
    let { error } = await supabase.from('restaurant_zone_layouts').upsert(filas(conNuevas), { onConflict: 'organization_id,branch_id,zone_name' });
    if (error && conNuevas && esFuncionFaltante(error)) {
      conNuevas = false;
      ({ error } = await supabase.from('restaurant_zone_layouts').upsert(filas(false), { onConflict: 'organization_id,branch_id,zone_name' }));
    }
    if (error) throw error;
  }

  return { noBorradas, sinColumnasNuevas: !conNuevas };
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
