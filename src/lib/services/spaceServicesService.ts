import { supabase } from '@/lib/supabase/config';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface GlobalService {
  id: string;
  name: string;
  icon: string | null;
  category: string;
  is_default: boolean;
  created_at: string;
}

export interface OrgService {
  id: string;
  organization_id: number;
  service_id: string | null;
  custom_name: string | null;
  custom_icon: string | null;
  custom_category: string | null;
  is_active: boolean;
  created_at: string;
  // Joined
  service?: GlobalService | null;
}

/** Vista aplanada para UI */
export interface OrgServiceView {
  org_service_id: string;
  name: string;
  icon: string | null;
  category: string;
  is_active: boolean;
  is_custom: boolean;
  service_id: string | null;
}

export interface SpaceServiceRow {
  id: string;
  space_id: string;
  organization_service_id: string;
  notes: string | null;
  created_at: string;
  // Joined
  org_service?: OrgServiceView;
}

export interface SpaceServiceView {
  space_service_id: string;
  org_service_id: string;
  name: string;
  icon: string | null;
  category: string;
  notes: string | null;
}

// ─── Categorías disponibles ──────────────────────────────────────────────────

export const SERVICE_CATEGORIES = [
  { value: 'conectividad', label: 'Conectividad' },
  { value: 'confort', label: 'Confort' },
  { value: 'entretenimiento', label: 'Entretenimiento' },
  { value: 'seguridad', label: 'Seguridad' },
  { value: 'facilidades', label: 'Facilidades' },
  { value: 'servicios', label: 'Servicios' },
  { value: 'general', label: 'General' },
] as const;

// ─── Servicio ────────────────────────────────────────────────────────────────

const spaceServicesService = {
  // ═══════════════════════════════════════════════════════════════════════════
  // Catálogo global
  // ═══════════════════════════════════════════════════════════════════════════

  async getGlobalServices(): Promise<GlobalService[]> {
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .order('category')
      .order('name');

    if (error) {
      console.error('Error fetching global services:', error);
      return [];
    }
    return data as GlobalService[];
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Servicios de la organización
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Obtener todos los servicios de una org: estándar (activados) + personalizados.
   * También incluye estándar NO activados para que el admin pueda activarlos.
   */
  async getOrgServices(organizationId: number): Promise<OrgServiceView[]> {
    // 1. Todos los servicios globales
    const globalServices = await this.getGlobalServices();

    // 2. Registros de organization_services para esta org
    const { data: orgRows, error } = await supabase
      .from('organization_services')
      .select('*')
      .eq('organization_id', organizationId);

    if (error) {
      console.error('Error fetching org services:', error);
      return [];
    }

    const orgMap = new Map<string, OrgService>();
    const customServices: OrgServiceView[] = [];

    for (const row of (orgRows || []) as OrgService[]) {
      if (row.service_id) {
        orgMap.set(row.service_id, row);
      } else {
        // Servicio personalizado
        customServices.push({
          org_service_id: row.id,
          name: row.custom_name || 'Sin nombre',
          icon: row.custom_icon,
          category: row.custom_category || 'general',
          is_active: row.is_active,
          is_custom: true,
          service_id: null,
        });
      }
    }

    // 3. Merge: global + org overrides
    const merged: OrgServiceView[] = globalServices.map((gs) => {
      const override = orgMap.get(gs.id);
      return {
        org_service_id: override?.id || gs.id,
        name: gs.name,
        icon: gs.icon,
        category: gs.category,
        is_active: override ? override.is_active : true, // activo por defecto si no hay override
        is_custom: false,
        service_id: gs.id,
      };
    });

    return [...merged, ...customServices];
  },

  /**
   * Obtener solo los servicios activos de una org (para checklist y badges)
   */
  async getActiveOrgServices(organizationId: number): Promise<OrgServiceView[]> {
    const all = await this.getOrgServices(organizationId);
    return all.filter((s) => s.is_active);
  },

  /**
   * Activar un servicio estándar para la org (crear registro en organization_services)
   */
  async activateService(organizationId: number, serviceId: string): Promise<boolean> {
    // Verificar si ya existe
    const { data: existing } = await supabase
      .from('organization_services')
      .select('id, is_active')
      .eq('organization_id', organizationId)
      .eq('service_id', serviceId)
      .maybeSingle();

    if (existing) {
      // Ya existe, solo activar
      const { error } = await supabase
        .from('organization_services')
        .update({ is_active: true })
        .eq('id', existing.id);
      return !error;
    }

    // Crear nuevo registro
    const { error } = await supabase
      .from('organization_services')
      .insert({
        organization_id: organizationId,
        service_id: serviceId,
        is_active: true,
      });

    return !error;
  },

  /**
   * Desactivar un servicio para la org
   */
  async deactivateService(organizationId: number, serviceId: string): Promise<boolean> {
    const { data: existing } = await supabase
      .from('organization_services')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('service_id', serviceId)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from('organization_services')
        .update({ is_active: false })
        .eq('id', existing.id);
      return !error;
    }

    // No existe → crear como inactivo
    const { error } = await supabase
      .from('organization_services')
      .insert({
        organization_id: organizationId,
        service_id: serviceId,
        is_active: false,
      });

    return !error;
  },

  /**
   * Toggle activo/inactivo
   */
  async toggleService(organizationId: number, serviceId: string, isActive: boolean): Promise<boolean> {
    return isActive
      ? this.activateService(organizationId, serviceId)
      : this.deactivateService(organizationId, serviceId);
  },

  /**
   * Crear servicio personalizado
   */
  async createCustomService(
    organizationId: number,
    data: { name: string; icon?: string; category?: string }
  ): Promise<string | null> {
    const { data: result, error } = await supabase
      .from('organization_services')
      .insert({
        organization_id: organizationId,
        service_id: null,
        custom_name: data.name,
        custom_icon: data.icon || null,
        custom_category: data.category || 'general',
        is_active: true,
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error creating custom service:', error);
      return null;
    }
    return result.id;
  },

  /**
   * Editar servicio personalizado
   */
  async updateCustomService(
    orgServiceId: string,
    data: { name?: string; icon?: string; category?: string }
  ): Promise<boolean> {
    const updates: Record<string, any> = {};
    if (data.name !== undefined) updates.custom_name = data.name;
    if (data.icon !== undefined) updates.custom_icon = data.icon;
    if (data.category !== undefined) updates.custom_category = data.category;

    const { error } = await supabase
      .from('organization_services')
      .update(updates)
      .eq('id', orgServiceId);

    return !error;
  },

  /**
   * Eliminar servicio personalizado
   */
  async deleteCustomService(orgServiceId: string): Promise<boolean> {
    const { error } = await supabase
      .from('organization_services')
      .delete()
      .eq('id', orgServiceId)
      .is('service_id', null); // Solo personalizados

    return !error;
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Servicios de un espacio
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Obtener servicios asignados a un espacio
   */
  async getSpaceServices(spaceId: string): Promise<SpaceServiceView[]> {
    const { data, error } = await supabase
      .from('space_services')
      .select(`
        id,
        space_id,
        organization_service_id,
        notes,
        created_at,
        organization_services (
          id,
          service_id,
          custom_name,
          custom_icon,
          custom_category,
          is_active,
          services (
            id, name, icon, category
          )
        )
      `)
      .eq('space_id', spaceId);

    if (error) {
      console.error('Error fetching space services:', error);
      return [];
    }

    return (data || []).map((row: any) => {
      const os = row.organization_services;
      const gs = os?.services;
      return {
        space_service_id: row.id,
        org_service_id: row.organization_service_id,
        name: gs?.name || os?.custom_name || 'Sin nombre',
        icon: gs?.icon || os?.custom_icon || null,
        category: gs?.category || os?.custom_category || 'general',
        notes: row.notes,
      };
    });
  },

  /**
   * Asignar un servicio a un espacio
   */
  async assignServiceToSpace(
    spaceId: string,
    orgServiceId: string,
    notes?: string
  ): Promise<boolean> {
    const { error } = await supabase
      .from('space_services')
      .insert({
        space_id: spaceId,
        organization_service_id: orgServiceId,
        notes: notes || null,
      });

    if (error) {
      // Puede ser duplicado (UNIQUE constraint)
      if (error.code === '23505') return true;
      console.error('Error assigning service to space:', error);
      return false;
    }
    return true;
  },

  /**
   * Quitar un servicio de un espacio
   */
  async removeServiceFromSpace(spaceServiceId: string): Promise<boolean> {
    const { error } = await supabase
      .from('space_services')
      .delete()
      .eq('id', spaceServiceId);

    return !error;
  },

  /**
   * Asignar/desasignar múltiples servicios de golpe (sync).
   * Auto-crea organization_services para servicios globales que no tienen entry.
   */
  async syncSpaceServices(
    spaceId: string,
    selectedOrgServiceIds: string[],
    organizationId?: number
  ): Promise<boolean> {
    // 0. Resolver IDs: si algún ID es de services (global) y no existe en
    //    organization_services, crear el registro automáticamente.
    const resolvedIds: string[] = [];
    for (const id of selectedOrgServiceIds) {
      // Verificar si existe en organization_services
      const { data: exists } = await supabase
        .from('organization_services')
        .select('id')
        .eq('id', id)
        .maybeSingle();

      if (exists) {
        resolvedIds.push(id);
      } else if (organizationId) {
        // El ID es de la tabla services (global), crear entry en organization_services
        const { data: newOrgSvc, error: createErr } = await supabase
          .from('organization_services')
          .insert({
            organization_id: organizationId,
            service_id: id,
            is_active: true,
          })
          .select('id')
          .single();

        if (createErr) {
          // Puede que ya exista por unique constraint (organization_id, service_id)
          const { data: existing } = await supabase
            .from('organization_services')
            .select('id')
            .eq('organization_id', organizationId)
            .eq('service_id', id)
            .maybeSingle();
          if (existing) {
            resolvedIds.push(existing.id);
          } else {
            console.error('Error creating org service:', createErr);
          }
        } else if (newOrgSvc) {
          resolvedIds.push(newOrgSvc.id);
        }
      }
    }

    // 1. Obtener actuales
    const { data: current, error: fetchError } = await supabase
      .from('space_services')
      .select('id, organization_service_id')
      .eq('space_id', spaceId);

    if (fetchError) {
      console.error('Error fetching current space services:', fetchError);
      return false;
    }

    const currentIds = new Set((current || []).map((r: any) => r.organization_service_id));
    const targetIds = new Set(resolvedIds);

    // 2. Eliminar los que ya no están seleccionados
    const toRemove = (current || []).filter(
      (r: any) => !targetIds.has(r.organization_service_id)
    );
    for (const r of toRemove) {
      await supabase.from('space_services').delete().eq('id', r.id);
    }

    // 3. Agregar los nuevos
    const toAdd = resolvedIds.filter((id) => !currentIds.has(id));
    if (toAdd.length > 0) {
      const rows = toAdd.map((orgServiceId) => ({
        space_id: spaceId,
        organization_service_id: orgServiceId,
      }));
      const { error: insertError } = await supabase
        .from('space_services')
        .insert(rows);

      if (insertError) {
        console.error('Error inserting space services:', insertError);
        return false;
      }
    }

    return true;
  },

  /**
   * Obtener IDs de org_services asignados a un espacio (para checklist)
   */
  async getSpaceServiceIds(spaceId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('space_services')
      .select('organization_service_id')
      .eq('space_id', spaceId);

    if (error) return [];
    return (data || []).map((r: any) => r.organization_service_id);
  },

  /**
   * Obtener servicios de múltiples espacios en una sola query (para lista)
   * Retorna un mapa spaceId → SpaceServiceView[]
   */
  async getSpaceServicesMap(spaceIds: string[]): Promise<Record<string, SpaceServiceView[]>> {
    if (spaceIds.length === 0) return {};

    const { data, error } = await supabase
      .from('space_services')
      .select(`
        id,
        space_id,
        organization_service_id,
        notes,
        organization_services (
          id,
          service_id,
          custom_name,
          custom_icon,
          custom_category,
          services (
            id, name, icon, category
          )
        )
      `)
      .in('space_id', spaceIds);

    if (error) {
      console.error('Error fetching space services map:', error);
      return {};
    }

    const map: Record<string, SpaceServiceView[]> = {};
    for (const row of (data || []) as any[]) {
      const os = row.organization_services;
      const gs = os?.services;
      const view: SpaceServiceView = {
        space_service_id: row.id,
        org_service_id: row.organization_service_id,
        name: gs?.name || os?.custom_name || 'Sin nombre',
        icon: gs?.icon || os?.custom_icon || null,
        category: gs?.category || os?.custom_category || 'general',
        notes: row.notes,
      };
      if (!map[row.space_id]) map[row.space_id] = [];
      map[row.space_id].push(view);
    }
    return map;
  },
};

export default spaceServicesService;
