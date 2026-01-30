import { supabase } from '@/lib/supabase/config';

export type BlockType = 'maintenance' | 'owner' | 'event' | 'ota_hold' | 'other';

export interface ReservationBlock {
  id: string;
  organization_id: number;
  branch_id: number;
  space_id: string | null;
  space_type_id: string | null;
  date_from: string;
  date_to: string;
  block_type: BlockType;
  reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Relaciones
  spaces?: {
    id: string;
    label: string;
    floor_zone: string;
    space_types?: {
      name: string;
    };
  };
  space_types?: {
    id: string;
    name: string;
  };
}

export interface CreateBlockData {
  organization_id: number;
  branch_id: number;
  space_id?: string | null;
  space_type_id?: string | null;
  date_from: string;
  date_to: string;
  block_type: BlockType;
  reason?: string;
  created_by?: string;
}

export interface BlockStats {
  total: number;
  by_type: Record<BlockType, number>;
  active_today: number;
  upcoming: number;
}

/**
 * Configura el contexto de organización para RLS
 */
async function setOrganizationContext(organizationId: number): Promise<void> {
  await supabase.rpc('set_config', {
    setting_name: 'app.current_org_id',
    setting_value: organizationId.toString(),
  });
}

class ReservationBlocksService {
  /**
   * Obtener todos los bloqueos de una organización
   */
  async getBlocks(
    organizationId: number,
    filters?: {
      branchId?: number;
      blockType?: BlockType;
      startDate?: string;
      endDate?: string;
      spaceId?: string;
      includeExpired?: boolean;
    }
  ): Promise<ReservationBlock[]> {
    await setOrganizationContext(organizationId);

    let query = supabase
      .from('reservation_blocks')
      .select(`
        *,
        spaces (
          id,
          label,
          floor_zone,
          space_types (
            name
          )
        ),
        space_types (
          id,
          name
        )
      `)
      .eq('organization_id', organizationId)
      .order('date_from', { ascending: true });

    if (filters?.branchId) {
      query = query.eq('branch_id', filters.branchId);
    }

    if (filters?.blockType) {
      query = query.eq('block_type', filters.blockType);
    }

    if (filters?.spaceId) {
      query = query.eq('space_id', filters.spaceId);
    }

    if (filters?.startDate && filters?.endDate) {
      // Bloqueos que se solapan con el rango
      query = query
        .lte('date_from', filters.endDate)
        .gte('date_to', filters.startDate);
    } else if (!filters?.includeExpired) {
      // Por defecto, solo bloqueos activos o futuros
      const today = new Date().toISOString().split('T')[0];
      query = query.gte('date_to', today);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error obteniendo bloqueos:', error);
      throw error;
    }

    return data as ReservationBlock[];
  }

  /**
   * Obtener bloqueos activos hoy
   */
  async getActiveBlocks(organizationId: number, branchId?: number): Promise<ReservationBlock[]> {
    const today = new Date().toISOString().split('T')[0];
    return this.getBlocks(organizationId, {
      branchId,
      startDate: today,
      endDate: today,
    });
  }

  /**
   * Obtener estadísticas de bloqueos
   */
  async getStats(organizationId: number, branchId?: number): Promise<BlockStats> {
    await setOrganizationContext(organizationId);
    const today = new Date().toISOString().split('T')[0];

    let query = supabase
      .from('reservation_blocks')
      .select('id, block_type, date_from, date_to')
      .eq('organization_id', organizationId);

    if (branchId) {
      query = query.eq('branch_id', branchId);
    }

    const { data, error } = await query;

    if (error) throw error;

    const blocks = data || [];
    const stats: BlockStats = {
      total: blocks.length,
      by_type: {
        maintenance: 0,
        owner: 0,
        event: 0,
        ota_hold: 0,
        other: 0,
      },
      active_today: 0,
      upcoming: 0,
    };

    blocks.forEach((block) => {
      // Contar por tipo
      stats.by_type[block.block_type as BlockType]++;

      // Activos hoy
      if (block.date_from <= today && block.date_to >= today) {
        stats.active_today++;
      }

      // Futuros
      if (block.date_from > today) {
        stats.upcoming++;
      }
    });

    return stats;
  }

  /**
   * Crear un nuevo bloqueo
   */
  async createBlock(data: CreateBlockData): Promise<ReservationBlock> {
    await setOrganizationContext(data.organization_id);

    // Validar que tenga space_id o space_type_id
    if (!data.space_id && !data.space_type_id) {
      throw new Error('Debe especificar un espacio o tipo de espacio');
    }

    const { data: block, error } = await supabase
      .from('reservation_blocks')
      .insert({
        ...data,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select(`
        *,
        spaces (
          id,
          label,
          floor_zone,
          space_types (
            name
          )
        ),
        space_types (
          id,
          name
        )
      `)
      .single();

    if (error) {
      console.error('Error creando bloqueo:', error);
      throw error;
    }

    return block as ReservationBlock;
  }

  /**
   * Actualizar un bloqueo
   */
  async updateBlock(
    blockId: string,
    organizationId: number,
    updates: Partial<CreateBlockData>
  ): Promise<ReservationBlock> {
    await setOrganizationContext(organizationId);

    const { data, error } = await supabase
      .from('reservation_blocks')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', blockId)
      .select(`
        *,
        spaces (
          id,
          label,
          floor_zone,
          space_types (
            name
          )
        ),
        space_types (
          id,
          name
        )
      `)
      .single();

    if (error) {
      console.error('Error actualizando bloqueo:', error);
      throw error;
    }

    return data as ReservationBlock;
  }

  /**
   * Eliminar un bloqueo
   */
  async deleteBlock(blockId: string, organizationId: number): Promise<void> {
    await setOrganizationContext(organizationId);

    const { error } = await supabase
      .from('reservation_blocks')
      .delete()
      .eq('id', blockId);

    if (error) {
      console.error('Error eliminando bloqueo:', error);
      throw error;
    }
  }

  /**
   * Verificar si un espacio está bloqueado en un rango de fechas
   */
  async isSpaceBlocked(
    organizationId: number,
    spaceId: string,
    dateFrom: string,
    dateTo: string
  ): Promise<{ blocked: boolean; blocks: ReservationBlock[] }> {
    await setOrganizationContext(organizationId);

    // Obtener el space_type_id del espacio
    const { data: space } = await supabase
      .from('spaces')
      .select('space_type_id')
      .eq('id', spaceId)
      .single();

    // Buscar bloqueos directos del espacio
    const { data: directBlocks } = await supabase
      .from('reservation_blocks')
      .select('*')
      .eq('space_id', spaceId)
      .lte('date_from', dateTo)
      .gte('date_to', dateFrom);

    // Buscar bloqueos por tipo de espacio
    let typeBlocks: any[] = [];
    if (space?.space_type_id) {
      const { data } = await supabase
        .from('reservation_blocks')
        .select('*')
        .eq('space_type_id', space.space_type_id)
        .is('space_id', null)
        .lte('date_from', dateTo)
        .gte('date_to', dateFrom);
      typeBlocks = data || [];
    }

    const allBlocks = [...(directBlocks || []), ...typeBlocks];

    return {
      blocked: allBlocks.length > 0,
      blocks: allBlocks as ReservationBlock[],
    };
  }

  /**
   * Obtener espacios disponibles (excluyendo bloqueados)
   */
  async getAvailableSpaces(
    organizationId: number,
    branchId: number,
    dateFrom: string,
    dateTo: string
  ): Promise<string[]> {
    await setOrganizationContext(organizationId);

    // Obtener todos los espacios de la sucursal
    const { data: allSpaces } = await supabase
      .from('spaces')
      .select('id, space_type_id')
      .eq('branch_id', branchId)
      .in('status', ['available', 'reserved', 'cleaning']);

    if (!allSpaces) return [];

    // Obtener bloqueos directos de espacios
    const { data: directBlocks } = await supabase
      .from('reservation_blocks')
      .select('space_id')
      .eq('branch_id', branchId)
      .not('space_id', 'is', null)
      .lte('date_from', dateTo)
      .gte('date_to', dateFrom);

    const blockedSpaceIds = new Set((directBlocks || []).map((b) => b.space_id));

    // Obtener bloqueos por tipo de espacio
    const { data: typeBlocks } = await supabase
      .from('reservation_blocks')
      .select('space_type_id')
      .eq('branch_id', branchId)
      .is('space_id', null)
      .not('space_type_id', 'is', null)
      .lte('date_from', dateTo)
      .gte('date_to', dateFrom);

    const blockedTypeIds = new Set((typeBlocks || []).map((b) => b.space_type_id));

    // Filtrar espacios disponibles
    const availableSpaces = allSpaces.filter((space) => {
      // Excluir si está bloqueado directamente
      if (blockedSpaceIds.has(space.id)) return false;
      // Excluir si su tipo está bloqueado
      if (blockedTypeIds.has(space.space_type_id)) return false;
      return true;
    });

    return availableSpaces.map((s) => s.id);
  }
}

export default new ReservationBlocksService();
