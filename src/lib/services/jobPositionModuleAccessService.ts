import { supabase } from '@/lib/supabase/config';
import { MODULE_PAGES, MODULE_HREF_TO_CODE } from '@/lib/config/modulePages';

export interface ModuleAccess {
  module_code: string;
  can_view: boolean;
  can_access: boolean;
}

export interface PageAccess {
  module_code: string;
  page_href: string;
  can_view: boolean;
  can_access: boolean;
}

export interface JobPositionAccess {
  modules: ModuleAccess[];
  pages: PageAccess[];
}

export const jobPositionModuleAccessService = {
  /**
   * Obtener el acceso a módulos y páginas de un cargo
   */
  async getJobPositionAccess(jobPositionId: string): Promise<JobPositionAccess> {
    const [modulesRes, pagesRes] = await Promise.all([
      supabase
        .from('job_position_module_access')
        .select('module_code, can_view, can_access')
        .eq('job_position_id', jobPositionId),
      supabase
        .from('job_position_page_access')
        .select('module_code, page_href, can_view, can_access')
        .eq('job_position_id', jobPositionId),
    ]);

    return {
      modules: (modulesRes.data || []) as ModuleAccess[],
      pages: (pagesRes.data || []) as PageAccess[],
    };
  },

  /**
   * Obtener los códigos de módulos visibles para un cargo
   * Si no hay registros, retorna null (significa que no hay restricciones)
   */
  async getVisibleModuleCodes(jobPositionId: string): Promise<string[] | null> {
    // Primero verificar si existen registros para este cargo
    const { data: allRecords, error: countError } = await supabase
      .from('job_position_module_access')
      .select('module_code')
      .eq('job_position_id', jobPositionId);

    if (countError) {
      console.error('Error getting visible module codes:', countError);
      return null;
    }

    // Si no hay registros, no hay restricciones
    if (!allRecords || allRecords.length === 0) return null;

    // Si hay registros, filtrar por can_view = true
    const { data, error } = await supabase
      .from('job_position_module_access')
      .select('module_code')
      .eq('job_position_id', jobPositionId)
      .eq('can_view', true);

    if (error) {
      console.error('Error getting visible module codes:', error);
      return null;
    }

    return (data || []).map(d => d.module_code);
  },

  /**
   * Obtener los hrefs de páginas visibles para un cargo
   * Si no hay registros, retorna null (significa que no hay restricciones)
   */
  async getVisiblePageHrefs(jobPositionId: string): Promise<string[] | null> {
    // Primero verificar si existen registros para este cargo
    const { data: allRecords, error: countError } = await supabase
      .from('job_position_page_access')
      .select('page_href')
      .eq('job_position_id', jobPositionId);

    if (countError) {
      console.error('Error getting visible page hrefs:', countError);
      return null;
    }

    // Si no hay registros, no hay restricciones
    if (!allRecords || allRecords.length === 0) return null;

    // Si hay registros, filtrar por can_view = true
    const { data, error } = await supabase
      .from('job_position_page_access')
      .select('page_href')
      .eq('job_position_id', jobPositionId)
      .eq('can_view', true);

    if (error) {
      console.error('Error getting visible page hrefs:', error);
      return null;
    }

    return (data || []).map(d => d.page_href);
  },

  /**
   * Guardar el acceso a módulos de un cargo (reemplazo total)
   */
  async setModuleAccess(
    jobPositionId: string,
    modules: Array<{ module_code: string; can_view: boolean; can_access: boolean }>
  ): Promise<void> {
    const { error: deleteError } = await supabase
      .from('job_position_module_access')
      .delete()
      .eq('job_position_id', jobPositionId);

    if (deleteError) throw deleteError;

    if (modules.length > 0) {
      const rows = modules.map(m => ({
        job_position_id: jobPositionId,
        module_code: m.module_code,
        can_view: m.can_view,
        can_access: m.can_access,
      }));

      const { error: insertError } = await supabase
        .from('job_position_module_access')
        .insert(rows);

      if (insertError) throw insertError;
    }
  },

  /**
   * Guardar el acceso a páginas de un cargo (reemplazo total)
   */
  async setPageAccess(
    jobPositionId: string,
    pages: Array<{ module_code: string; page_href: string; can_view: boolean; can_access: boolean }>
  ): Promise<void> {
    const { error: deleteError } = await supabase
      .from('job_position_page_access')
      .delete()
      .eq('job_position_id', jobPositionId);

    if (deleteError) throw deleteError;

    if (pages.length > 0) {
      const rows = pages.map(p => ({
        job_position_id: jobPositionId,
        module_code: p.module_code,
        page_href: p.page_href,
        can_view: p.can_view,
        can_access: p.can_access,
      }));

      const { error: insertError } = await supabase
        .from('job_position_page_access')
        .insert(rows);

      if (insertError) throw insertError;
    }
  },

  /**
   * Obtener el acceso combinado para el sidebar del usuario actual
   * Retorna: { visibleModules: string[] | null, visiblePages: string[] | null }
   * null significa sin restricciones (admin o sin configuración)
   */
  async getUserAccess(userId: string, organizationId: number): Promise<{
    visibleModules: string[] | null;
    visiblePages: string[] | null;
  }> {
    // Verificar si es super admin
    const { data: memberData } = await supabase
      .from('organization_members')
      .select('is_super_admin, job_position_id, id')
      .eq('user_id', userId)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (memberData?.is_super_admin) {
      return { visibleModules: null, visiblePages: null };
    }

    let jobPositionId = memberData?.job_position_id;

    // Fallback: si no hay job_position_id en organization_members,
    // buscar el cargo asignado via employments.position_id
    if (!jobPositionId && memberData?.id) {
      const { data: employmentData } = await supabase
        .from('employments')
        .select('position_id')
        .eq('organization_member_id', memberData.id)
        .eq('status', 'active')
        .maybeSingle();

      if (employmentData?.position_id) {
        jobPositionId = employmentData.position_id;
      }
    }

    if (!jobPositionId) {
      return { visibleModules: null, visiblePages: null };
    }

    const [visibleModules, visiblePages] = await Promise.all([
      this.getVisibleModuleCodes(jobPositionId),
      this.getVisiblePageHrefs(jobPositionId),
    ]);

    return { visibleModules, visiblePages };
  },
};
