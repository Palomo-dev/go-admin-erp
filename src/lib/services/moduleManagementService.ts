import { supabase } from '@/lib/supabase/config';

export interface Module {
  code: string;
  name: string;
  description: string;
  is_core: boolean;
  icon: string;
  rank: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Plan {
  id: number;
  code: string;
  name: string;
  price_usd_month: string;
  price_usd_year: string;
  trial_days: number;
  max_modules: number;
  max_branches: number;
  features: Record<string, any>;
  is_active: boolean;
}

export interface OrganizationModule {
  organization_id: number;
  module_code: string;
  is_active: boolean;
  activated_at: string;
  deactivated_at?: string;
}

export interface ModuleActivationResult {
  success: boolean;
  message: string;
  data?: any;
}

export interface OrganizationModuleStatus {
  organization_id: number;
  organization_name: string;
  plan: Plan | null;
  active_modules_count: number;
  paid_modules_count: number;
  max_modules_allowed: number;
  can_activate_more: boolean;
  active_modules: string[];
  available_modules: Module[];
}

export const moduleManagementService = {
  /**
   * Obtener todos los módulos disponibles
   */
  async getAllModules(): Promise<Module[]> {
    const { data, error } = await supabase
      .from('modules')
      .select('*')
      .order('rank', { ascending: true });
    
    if (error) throw error;
    return data || [];
  },

  /**
   * Obtener módulos core (no cuentan para límites del plan)
   */
  async getCoreModules(): Promise<Module[]> {
    const { data, error } = await supabase
      .from('modules')
      .select('*')
      .eq('is_core', true)
      .order('rank', { ascending: true });
    
    if (error) throw error;
    return data || [];
  },

  /**
   * Obtener módulos pagados (cuentan para límites del plan)
   */
  async getPaidModules(): Promise<Module[]> {
    const { data, error } = await supabase
      .from('modules')
      .select('*')
      .eq('is_core', false)
      .order('rank', { ascending: true });
    
    if (error) throw error;
    return data || [];
  },

  /**
   * Obtener el estado de módulos de una organización
   */
  async getOrganizationModuleStatus(organizationId: number): Promise<OrganizationModuleStatus> {
    // Obtener información de la organización y su plan
    const { data: orgData, error: orgError } = await supabase
      .from('organizations')
      .select(`
        id,
        name,
        subscriptions!inner(
          plan_id,
          plans!inner(*)
        )
      `)
      .eq('id', organizationId)
      .single();

    if (orgError && orgError.code !== 'PGRST116') {
      throw orgError;
    }

    // Si no hay suscripción, usar plan gratuito por defecto
    let plan: Plan | null = null;
    if (orgData?.subscriptions?.plans) {
      plan = orgData.subscriptions.plans;
    } else {
      // Obtener plan gratuito por defecto
      const { data: freePlan, error: planError } = await supabase
        .from('plans')
        .select('*')
        .eq('code', 'free')
        .single();
      
      if (!planError) {
        plan = freePlan;
      }
    }

    // Obtener módulos activos de la organización
    const { data: activeModules, error: activeError } = await supabase
      .from('organization_modules')
      .select(`
        module_code,
        is_active,
        modules!inner(*)
      `)
      .eq('organization_id', organizationId)
      .eq('is_active', true);

    if (activeError) throw activeError;

    // Obtener todos los módulos disponibles
    const allModules = await this.getAllModules();
    const coreModules = allModules.filter(m => m.is_core);
    const paidModules = allModules.filter(m => !m.is_core);

    // Calcular estadísticas
    const activeModuleCodes = activeModules?.map(am => am.module_code) || [];
    const activePaidModules = activeModuleCodes.filter(code => 
      paidModules.some(m => m.code === code)
    );

    const maxModulesAllowed = plan?.max_modules || 0;
    const paidModulesCount = activePaidModules.length;
    const canActivateMore = paidModulesCount < maxModulesAllowed;

    // Módulos disponibles para activar (no activos actualmente)
    const availableModules = allModules.filter(module => 
      !activeModuleCodes.includes(module.code)
    );

    return {
      organization_id: organizationId,
      organization_name: orgData?.name || 'Unknown',
      plan,
      active_modules_count: activeModuleCodes.length,
      paid_modules_count: paidModulesCount,
      max_modules_allowed: maxModulesAllowed,
      can_activate_more: canActivateMore,
      active_modules: activeModuleCodes,
      available_modules: availableModules
    };
  },

  /**
   * Activar un módulo para una organización
   */
  async activateModule(organizationId: number, moduleCode: string): Promise<ModuleActivationResult> {
    try {
      // Verificar que el módulo existe
      const { data: module, error: moduleError } = await supabase
        .from('modules')
        .select('*')
        .eq('code', moduleCode)
        .single();

      if (moduleError || !module) {
        return {
          success: false,
          message: 'Módulo no encontrado'
        };
      }

      // Obtener estado actual de la organización
      const orgStatus = await this.getOrganizationModuleStatus(organizationId);

      // Verificar si el módulo ya está activo
      if (orgStatus.active_modules.includes(moduleCode)) {
        return {
          success: false,
          message: 'El módulo ya está activo'
        };
      }

      // Si es un módulo pagado, verificar límites del plan
      if (!module.is_core) {
        if (!orgStatus.can_activate_more) {
          return {
            success: false,
            message: `Has alcanzado el límite de módulos de tu plan (${orgStatus.max_modules_allowed}). Actualiza tu plan para activar más módulos.`
          };
        }
      }

      // Activar el módulo
      const { error: activationError } = await supabase
        .from('organization_modules')
        .upsert({
          organization_id: organizationId,
          module_code: moduleCode,
          is_active: true,
          activated_at: new Date().toISOString()
        }, {
          onConflict: 'organization_id,module_code'
        });

      if (activationError) {
        throw activationError;
      }

      // Si es un módulo core, asegurar que los permisos básicos estén disponibles
      if (module.is_core) {
        await this.ensureCoreModulePermissions(organizationId, moduleCode);
      }

      return {
        success: true,
        message: `Módulo ${module.name} activado exitosamente`,
        data: { module }
      };

    } catch (error) {
      console.error('Error activando módulo:', error);
      return {
        success: false,
        message: 'Error interno al activar el módulo'
      };
    }
  },

  /**
   * Desactivar un módulo para una organización
   */
  async deactivateModule(organizationId: number, moduleCode: string): Promise<ModuleActivationResult> {
    try {
      // Verificar que el módulo existe
      const { data: module, error: moduleError } = await supabase
        .from('modules')
        .select('*')
        .eq('code', moduleCode)
        .single();

      if (moduleError || !module) {
        return {
          success: false,
          message: 'Módulo no encontrado'
        };
      }

      // No permitir desactivar módulos core
      if (module.is_core) {
        return {
          success: false,
          message: 'Los módulos core no pueden ser desactivados'
        };
      }

      // Verificar que el módulo está activo
      const orgStatus = await this.getOrganizationModuleStatus(organizationId);
      if (!orgStatus.active_modules.includes(moduleCode)) {
        return {
          success: false,
          message: 'El módulo no está activo'
        };
      }

      // Desactivar el módulo
      const { error: deactivationError } = await supabase
        .from('organization_modules')
        .update({
          is_active: false,
          deactivated_at: new Date().toISOString()
        })
        .eq('organization_id', organizationId)
        .eq('module_code', moduleCode);

      if (deactivationError) {
        throw deactivationError;
      }

      return {
        success: true,
        message: `Módulo ${module.name} desactivado exitosamente`,
        data: { module }
      };

    } catch (error) {
      console.error('Error desactivando módulo:', error);
      return {
        success: false,
        message: 'Error interno al desactivar el módulo'
      };
    }
  },

  /**
   * Asegurar que los módulos core estén activados para una organización
   */
  async ensureCoreModulesActivated(organizationId: number): Promise<void> {
    const coreModules = await this.getCoreModules();
    
    for (const module of coreModules) {
      await supabase
        .from('organization_modules')
        .upsert({
          organization_id: organizationId,
          module_code: module.code,
          is_active: true,
          activated_at: new Date().toISOString()
        }, {
          onConflict: 'organization_id,module_code'
        });
    }
  },

  /**
   * Asegurar permisos básicos para módulos core
   */
  async ensureCoreModulePermissions(organizationId: number, moduleCode: string): Promise<void> {
    // Esta función se puede expandir para asegurar permisos específicos por módulo core
    // Por ahora, es un placeholder para futuras implementaciones
    console.log(`Ensuring core permissions for module ${moduleCode} in organization ${organizationId}`);
  },

  /**
   * Verificar si una organización puede acceder a un módulo específico
   */
  async canAccessModule(organizationId: number, moduleCode: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('organization_modules')
      .select('is_active')
      .eq('organization_id', organizationId)
      .eq('module_code', moduleCode)
      .eq('is_active', true)
      .single();

    if (error) return false;
    return !!data;
  },

  /**
   * Obtener módulos activos de una organización
   */
  async getActiveModules(organizationId: number): Promise<Module[]> {
    const { data, error } = await supabase
      .from('organization_modules')
      .select(`
        module_code,
        modules!inner(*)
      `)
      .eq('organization_id', organizationId)
      .eq('is_active', true);

    if (error) throw error;
    
    return data?.map(item => item.modules).filter(Boolean) || [];
  },

  /**
   * Auditar y corregir inconsistencias en módulos de organizaciones
   */
  async auditOrganizationModules(): Promise<{
    organizationsWithoutSubscriptions: number[];
    organizationsExceedingLimits: Array<{
      organizationId: number;
      currentModules: number;
      maxAllowed: number;
    }>;
    organizationsWithoutCoreModules: number[];
  }> {
    // Organizaciones sin suscripciones
    const { data: orgsWithoutSubs, error: subsError } = await supabase
      .from('organizations')
      .select(`
        id,
        subscriptions(id)
      `)
      .is('subscriptions.id', null);

    if (subsError) throw subsError;

    // Organizaciones que exceden límites
    const { data: orgsWithLimits, error: limitsError } = await supabase
      .from('organizations')
      .select(`
        id,
        name,
        subscriptions!inner(
          plans!inner(max_modules)
        ),
        organization_modules!inner(
          module_code,
          modules!inner(is_core)
        )
      `);

    if (limitsError) throw limitsError;

    const organizationsExceedingLimits: Array<{
      organizationId: number;
      currentModules: number;
      maxAllowed: number;
    }> = [];

    orgsWithLimits?.forEach(org => {
      const maxModules = org.subscriptions?.plans?.max_modules || 0;
      const paidModules = org.organization_modules?.filter(om => 
        !om.modules?.is_core
      ).length || 0;

      if (paidModules > maxModules) {
        organizationsExceedingLimits.push({
          organizationId: org.id,
          currentModules: paidModules,
          maxAllowed: maxModules
        });
      }
    });

    return {
      organizationsWithoutSubscriptions: orgsWithoutSubs?.map(o => o.id) || [],
      organizationsExceedingLimits,
      organizationsWithoutCoreModules: [] // Se puede implementar después
    };
  },

  /**
   * Corregir inconsistencias detectadas en la auditoría
   */
  async fixInconsistencies(organizationId: number): Promise<ModuleActivationResult> {
    try {
      // 1. Asegurar que tenga una suscripción (plan gratuito por defecto)
      const { data: existingSub } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('organization_id', organizationId)
        .single();

      if (!existingSub) {
        const { data: freePlan } = await supabase
          .from('plans')
          .select('id')
          .eq('code', 'free')
          .single();

        if (freePlan) {
          await supabase
            .from('subscriptions')
            .insert({
              organization_id: organizationId,
              plan_id: freePlan.id,
              status: 'active',
              started_at: new Date().toISOString()
            });
        }
      }

      // 2. Asegurar módulos core activados
      await this.ensureCoreModulesActivated(organizationId);

      // 3. Verificar y corregir límites de módulos pagados
      const orgStatus = await this.getOrganizationModuleStatus(organizationId);
      if (orgStatus.paid_modules_count > orgStatus.max_modules_allowed) {
        // Desactivar módulos pagados excedentes (mantener los más antiguos)
        const { data: paidActiveModules } = await supabase
          .from('organization_modules')
          .select(`
            module_code,
            activated_at,
            modules!inner(is_core)
          `)
          .eq('organization_id', organizationId)
          .eq('is_active', true)
          .eq('modules.is_core', false)
          .order('activated_at', { ascending: false });

        if (paidActiveModules) {
          const excessModules = paidActiveModules.slice(orgStatus.max_modules_allowed);
          for (const module of excessModules) {
            await this.deactivateModule(organizationId, module.module_code);
          }
        }
      }

      return {
        success: true,
        message: 'Inconsistencias corregidas exitosamente'
      };

    } catch (error) {
      console.error('Error corrigiendo inconsistencias:', error);
      return {
        success: false,
        message: 'Error al corregir inconsistencias'
      };
    }
  }
};
