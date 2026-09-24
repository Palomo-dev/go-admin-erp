import { supabase } from '@/lib/supabase/config';
import { getOrganizationId, getCurrentBranchId } from '@/lib/hooks/useOrganization';
import { getOrganizationTimezone } from '@/lib/services/organizationTimezoneService';
import {
  Tip,
  TipSummary,
  CreateTipData,
  UpdateTipData,
  TipFilters,
  Mesero,
  PermisosPropinas,
} from './types';
import { PropinaError, errorPropina, rangoDeFiltros, resumirPorMesero } from './propinasLogica';

type PerfilMesero = { id: string; email: string; first_name?: string; last_name?: string };

/**
 * Propinas. Toda lectura y escritura va acotada a la organización de la
 * sesión; distribuir y anular son RPC que comprueban el permiso en la base
 * (migración 20260925110000). Los errores salen como `PropinaError` con un
 * código que la pantalla traduce.
 */
export class PropinasService {
  /**
   * Propinas vigentes (sin anular) con los filtros de la pantalla. Las fechas
   * del filtro son días de la organización, no días UTC.
   */
  static async getAll(filters: TipFilters = {}, branchFilter?: number | null): Promise<Tip[]> {
    const organizationId = getOrganizationId();
    const branchId = branchFilter !== undefined ? branchFilter : getCurrentBranchId();

    let query = supabase
      .from('tips')
      .select(`
        *,
        sale:sales (
          id,
          total,
          sale_date
        )
      `)
      .eq('organization_id', organizationId)
      .is('voided_at', null)
      .order('created_at', { ascending: false });

    if (branchId) query = query.eq('branch_id', branchId);
    if (filters.server_id) query = query.eq('server_id', filters.server_id);
    if (filters.is_distributed !== undefined) query = query.eq('is_distributed', filters.is_distributed);
    if (filters.tip_type) query = query.eq('tip_type', filters.tip_type);

    if (filters.dateFrom || filters.dateTo) {
      const zona = await getOrganizationTimezone(organizationId);
      const { desde, hasta } = rangoDeFiltros(filters, zona);
      if (desde) query = query.gte('created_at', desde);
      if (hasta) query = query.lte('created_at', hasta);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching tips:', error);
      throw errorPropina(error);
    }

    const tips = (data || []) as Tip[];
    const serverIds = Array.from(new Set(tips.map((t) => t.server_id)));
    const serversMap: Record<string, PerfilMesero> = {};

    if (serverIds.length > 0) {
      const { data: members } = await supabase
        .from('organization_members')
        .select('user_id, profiles:user_id (id, email, first_name, last_name)')
        .eq('organization_id', organizationId)
        .in('user_id', serverIds);

      (members || []).forEach((m) => {
        const perfil = m.profiles as unknown as PerfilMesero | null;
        if (perfil) serversMap[m.user_id] = perfil;
      });
    }

    return tips.map((tip) => ({ ...tip, server: serversMap[tip.server_id] || undefined }));
  }

  /** Resumen por mesero con los mismos filtros de la tabla. */
  static async getSummaryByServer(filters: TipFilters = {}, branchFilter?: number | null): Promise<TipSummary[]> {
    return resumirPorMesero(await this.getAll(filters, branchFilter));
  }

  /** Registrar una propina. Exige `pos.create` (RLS). */
  static async create(data: CreateTipData): Promise<Tip> {
    const organizationId = getOrganizationId();
    const branchId = data.branch_id ?? getCurrentBranchId();

    if (!branchId) throw new PropinaError('SIN_SUCURSAL');

    const { data: result, error } = await supabase
      .from('tips')
      .insert([{
        organization_id: organizationId,
        branch_id: branchId,
        sale_id: data.sale_id || null,
        payment_id: data.payment_id || null,
        server_id: data.server_id,
        amount: data.amount,
        tip_type: data.tip_type,
        notes: data.notes || null,
        is_distributed: false,
      }])
      .select()
      .single();

    if (error) {
      console.error('Error creating tip:', error);
      throw errorPropina(error);
    }
    return result as Tip;
  }

  /**
   * Corregir una propina pendiente (mesero, importe, tipo, notas). Exige
   * `pos.create` (RLS). La base rechaza editar una distribuida o anulada y
   * cambiar el importe si ya tiene asiento.
   */
  static async update(id: string, data: UpdateTipData): Promise<Tip> {
    const organizationId = getOrganizationId();
    const cambios: UpdateTipData = {};
    if (data.server_id !== undefined) cambios.server_id = data.server_id;
    if (data.amount !== undefined) cambios.amount = data.amount;
    if (data.tip_type !== undefined) cambios.tip_type = data.tip_type;
    if (data.notes !== undefined) cambios.notes = data.notes;

    // `.select()` porque un UPDATE que la RLS bloquea no da error: afecta 0 filas.
    const { data: filas, error } = await supabase
      .from('tips')
      .update(cambios)
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select();

    if (error) {
      console.error('Error updating tip:', error);
      throw errorPropina(error);
    }
    if (!filas || filas.length === 0) throw new PropinaError('SIN_PERMISO');
    return filas[0] as Tip;
  }

  /**
   * Anular una propina (reemplaza al borrado). En una transacción revierte su
   * asiento contable con un contra-asiento y la marca anulada. Exige `pos.void`.
   */
  static async anular(id: string, motivo?: string): Promise<{ asientosRevertidos: number }> {
    const { data, error } = await supabase.rpc('fn_propina_anular', {
      p_tip_id: id,
      p_motivo: motivo ?? null,
    });
    if (error) {
      console.error('Error voiding tip:', error);
      throw errorPropina(error);
    }
    const r = (data ?? {}) as { asientos_revertidos?: number };
    return { asientosRevertidos: Number(r.asientos_revertidos) || 0 };
  }

  /** Marcar una propina como distribuida. */
  static async markAsDistributed(id: string): Promise<number> {
    return this.markMultipleAsDistributed([id]);
  }

  /**
   * Marcar propinas como distribuidas. La RPC solo toca las de la organización
   * que siguen pendientes y sin anular, así que repetir no liquida dos veces.
   * Exige `pos.propinas.liquidar`. Devuelve cuántas se liquidaron.
   */
  static async markMultipleAsDistributed(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const { data, error } = await supabase.rpc('fn_propinas_liquidar', {
      p_organization_id: getOrganizationId(),
      p_ids: ids,
    });
    if (error) {
      console.error('Error distributing tips:', error);
      throw errorPropina(error);
    }
    return Number((data as { liquidadas?: number } | null)?.liquidadas) || 0;
  }

  /**
   * Meseros: miembros activos con acceso a la sucursal (sin sucursal, todos).
   * `sinNombre` es el texto traducido para quien no tiene nombre ni correo.
   */
  static async getServers(branchId?: number | null, sinNombre = ''): Promise<Mesero[]> {
    const { data, error } = await supabase.rpc('fn_propinas_meseros', {
      p_organization_id: getOrganizationId(),
      p_branch_id: branchId ?? null,
    });
    if (error) {
      console.error('Error fetching servers:', error);
      throw errorPropina(error);
    }
    const filas = (data || []) as { user_id: string; first_name: string | null; last_name: string | null; email: string | null }[];
    return filas.map((m) => ({
      id: m.user_id,
      name: [m.first_name, m.last_name].filter(Boolean).join(' ') || m.email || sinNombre,
      email: m.email || '',
    }));
  }

  /** Solo decide qué botones se muestran: la base vuelve a comprobarlo en cada escritura. */
  static async getPermisos(): Promise<PermisosPropinas> {
    const organizationId = getOrganizationId();
    const puede = async (codigo: string) => {
      const { data, error } = await supabase.rpc('fn_tiene_permiso', {
        p_organization_id: organizationId,
        p_code: codigo,
      });
      return !error && data === true;
    };
    const [registrar, anular, liquidar] = await Promise.all([
      puede('pos.create'),
      puede('pos.void'),
      puede('pos.propinas.liquidar'),
    ]);
    return { registrar, anular, liquidar };
  }
}
