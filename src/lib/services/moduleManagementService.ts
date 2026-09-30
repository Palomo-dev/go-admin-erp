import { supabase } from '@/lib/supabase/config';
import { MODULE_PAGES } from '@/lib/config/modulePages';
import { canonicalModuleCode } from '@/lib/config/moduleAliases';

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

export interface ModulePlanEnforcementResult {
  allowed: boolean;
  reason?: 'core_module' | 'included_in_plan' | 'not_in_plan' | 'no_plan_config';
  enforcement_mode: 'off' | 'warn' | 'enforce';
  should_block: boolean;
  warning_message?: string;
}

export interface ModulePageStatus {
  module_code: string;
  page_href: string;
  page_name: string;
  is_active: boolean;
}

export interface ModulePageToggleResult {
  success: boolean;
  message: string;
}

export const moduleManagementService = {
  /**
   * Obtener el modo de enforcement para una organización (GO-156)
   * 
   * Prioridad:
   * 1. Excepción específica de la org en module_enforcement_exceptions
   * 2. Configuración global en platform_settings
   * 
   * Solo la plataforma (service_role) puede cambiar estos valores.
   */
  async getEnforcementMode(
    organizationId: number,
    supabaseClient = supabase
  ): Promise<'off' | 'warn' | 'enforce'> {
    // 1. Verificar si hay excepción para esta organización
    const { data: exception } = await supabaseClient
      .from('module_enforcement_exceptions')
      .select('enforcement_mode, expires_at')
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (exception) {
      // Si tiene fecha de expiración y ya expiró, ignorar excepción
      if (exception.expires_at) {
        const expiry = new Date(exception.expires_at);
        if (expiry < new Date()) {
          // Excepción expirada, usar configuración global
        } else {
          return exception.enforcement_mode;
        }
      } else {
        // Sin fecha de expiración, usar excepción permanente
        return exception.enforcement_mode;
      }
    }

    // 2. Usar configuración global
    const { data: globalConfig } = await supabaseClient
      .from('platform_settings')
      .select('module_enforcement_mode')
      .eq('id', 1)
      .maybeSingle();

    return globalConfig?.module_enforcement_mode || 'warn';
  },

  /**
   * Verificar si una organización debe ser excluida del enforcement estricto (GO-156)
   * 
   * En modo 'enforce', nunca bloqueamos organizaciones con:
   * - Suscripción activa de pago
   * - Suscripción anual activa
   * 
   * Esto protege a clientes de pago de bloqueos automáticos sin decisión explícita.
   */
  async isProtectedFromEnforcement(
    organizationId: number,
    supabaseClient = supabase
  ): Promise<boolean> {
    const { data: subscription } = await supabaseClient
      .from('subscriptions')
      .select('status, billing_cycle, plan_id, plans!inner(price_usd_month, price_usd_year)')
      .eq('organization_id', organizationId)
      .eq('status', 'active')
      .maybeSingle();

    if (!subscription) return false;

    // Proteger suscripciones activas de pago
    const isPaid = 
      parseFloat(subscription.plans.price_usd_month || '0') > 0 ||
      parseFloat(subscription.plans.price_usd_year || '0') > 0;

    // Proteger suscripciones anuales
    const isAnnual = subscription.billing_cycle === 'yearly' || subscription.billing_cycle === 'annual';

    return isPaid || isAnnual;
  },

  /**
   * Verificar si un módulo está permitido por el plan de la organización (GO-156)
   * 
   * Retorna información sobre si el módulo está permitido y qué acción tomar
   * según el modo de enforcement configurado.
   */
  async checkModulePlanCompliance(
    organizationId: number,
    moduleCode: string,
    isCore: boolean,
    supabaseClient = supabase
  ): Promise<ModulePlanEnforcementResult> {
    // Los módulos core siempre están permitidos
    if (isCore) {
      return {
        allowed: true,
        reason: 'core_module',
        enforcement_mode: 'off',
        should_block: false
      };
    }

    // Obtener modo de enforcement
    const enforcementMode = await this.getEnforcementMode(organizationId, supabaseClient);

    // Si está en modo 'off', no hay restricción
    if (enforcementMode === 'off') {
      return {
        allowed: true,
        reason: 'core_module',
        enforcement_mode: 'off',
        should_block: false
      };
    }

    // Obtener el plan actual con su configuración de módulos
    const { data: planData, error: planError } = await supabaseClient
      .rpc('get_current_plan', { org_id: organizationId });

    if (planError || !planData?.[0]) {
      console.warn(`No se pudo obtener plan para org ${organizationId}:`, planError);
      return {
        allowed: true,
        reason: 'no_plan_config',
        enforcement_mode: enforcementMode,
        should_block: false,
        warning_message: 'No se pudo verificar el plan de la organización'
      };
    }

    const planInfo = planData[0];

    // Obtener plan completo con module_config desde la tabla plans
    const { data: fullPlan, error: fullPlanError } = await supabaseClient
      .from('plans')
      .select('module_config')
      .eq('id', planInfo.plan_id)
      .single();

    if (fullPlanError || !fullPlan?.module_config) {
      console.warn(`No se pudo obtener module_config para plan ${planInfo.plan_id}:`, fullPlanError);
      return {
        allowed: true,
        reason: 'no_plan_config',
        enforcement_mode: enforcementMode,
        should_block: false,
        warning_message: 'El plan no tiene configuración de módulos'
      };
    }

    const moduleConfig = fullPlan.module_config;
    const coreModules = moduleConfig.core_modules || [];
    const availableModules = moduleConfig.available_modules || [];
    const allowedModules = [...coreModules, ...availableModules];

    // Verificar si el módulo está permitido
    const isAllowed = allowedModules.includes(moduleCode);

    if (isAllowed) {
      return {
        allowed: true,
        reason: 'included_in_plan',
        enforcement_mode: enforcementMode,
        should_block: false
      };
    }

    // El módulo NO está en el plan
    const warningMessage = `Este módulo no está incluido en tu plan ${planInfo.plan_name}. ` +
      `Considera actualizar tu plan para mantenerlo.`;

    // En modo 'enforce', verificar si la org está protegida
    if (enforcementMode === 'enforce') {
      const isProtected = await this.isProtectedFromEnforcement(organizationId, supabaseClient);
      if (isProtected) {
        // Org protegida: no bloquear pero sí avisar
        return {
          allowed: false,
          reason: 'not_in_plan',
          enforcement_mode: enforcementMode,
          should_block: false,
          warning_message: warningMessage + ' (Organización con suscripción activa - no bloqueado)'
        };
      }
    }

    // En modo 'warn' permitimos pero avisamos; en modo 'enforce' bloqueamos
    return {
      allowed: false,
      reason: 'not_in_plan',
      enforcement_mode: enforcementMode,
      should_block: enforcementMode === 'enforce',
      warning_message: warningMessage
    };
  },

  /**
   * Obtener todos los módulos disponibles
   */
  async getAllModules(supabaseClient = supabase): Promise<Module[]> {
    const { data, error } = await supabaseClient
      .from('modules')
      .select('*')
      .order('rank', { ascending: true });
    
    if (error) throw error;
    return data || [];
  },

  /**
   * Obtener módulos core (no cuentan para límites del plan)
   */
  async getCoreModules(supabaseClient = supabase): Promise<Module[]> {
    const { data, error } = await supabaseClient
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
  async getPaidModules(supabaseClient = supabase): Promise<Module[]> {
    const { data, error } = await supabaseClient
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
  async getOrganizationModuleStatus(organizationId: number, supabaseClient = supabase): Promise<OrganizationModuleStatus> {
    // Consultas paralelas: org data, plan RPC, subscription metadata, active modules, all modules
    const [
      orgRes, planRes, subscriptionRes, activeModulesRes, allModulesRes
    ] = await Promise.all([
      supabaseClient.from('organizations').select('id, name').eq('id', organizationId).single(),
      supabaseClient.rpc('get_current_plan', { org_id: organizationId }),
      supabaseClient.from('subscriptions').select('metadata').eq('organization_id', organizationId).maybeSingle(),
      supabaseClient.from('organization_modules')
        .select('module_code, is_active, modules!inner(*)')
        .eq('organization_id', organizationId)
        .eq('is_active', true),
      supabaseClient.from('modules').select('*').order('rank', { ascending: true }),
    ]);

    if (orgRes.error) throw orgRes.error;
    if (planRes.error) throw planRes.error;

    const planInfo = planRes.data?.[0];
    if (!planInfo) {
      throw new Error('No se pudo obtener el plan actual de la organización');
    }

    if (activeModulesRes.error) throw activeModulesRes.error;

    // Extraer límites personalizados de la metadata si existen
    const customConfig = subscriptionRes.data?.metadata?.custom_config;
    const customMaxModules = customConfig?.total_available_modules || customConfig?.modules_count;
    const customMaxBranches = customConfig?.branches_count;

    const plan: Plan = {
      id: planInfo.plan_id,
      code: planInfo.plan_code,
      name: planInfo.plan_name,
      price_usd_month: planInfo.price_usd_month,
      price_usd_year: planInfo.price_usd_year,
      trial_days: planInfo.trial_days,
      max_modules: customMaxModules || planInfo.max_modules,
      max_branches: customMaxBranches || planInfo.max_branches,
      features: planInfo.features,
      is_active: true
    };

    const allModules = allModulesRes.data || [];
    const coreModules = allModules.filter(m => m.is_core);
    const paidModules = allModules.filter(m => !m.is_core);

    // Calcular estadísticas
    const activeModuleCodes = activeModulesRes.data?.map(am => am.module_code) || [];
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
      organization_name: orgRes.data?.name || 'Unknown',
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
   * Debug function to test module queries
   */
  async debugModuleQuery(moduleCode: string, supabaseClient = supabase) {
    console.log(`DEBUG: Testing module query for ${moduleCode}`);
    
    // Test 1: Get all modules
    const { data: allModules, error: allError } = await supabaseClient
      .from('modules')
      .select('*');
    
    console.log('DEBUG: All modules query:', { count: allModules?.length, error: allError });
    
    // Test 2: Get specific module
    const { data: specificModule, error: specificError } = await supabaseClient
      .from('modules')
      .select('*')
      .eq('code', moduleCode);
    
    console.log('DEBUG: Specific module query:', { data: specificModule, error: specificError });
    
    // Test 3: Get specific module with single()
    const { data: singleModule, error: singleError } = await supabaseClient
      .from('modules')
      .select('*')
      .eq('code', moduleCode)
      .single();
    
    console.log('DEBUG: Single module query:', { data: singleModule, error: singleError });
    
    return { allModules, specificModule, singleModule };
  },

  /**
   * Activar un módulo para una organización
   */
  async activateModule(organizationId: number, moduleCode: string, supabaseClient = supabase, modulePages?: Array<{ name: string; href: string }>): Promise<ModuleActivationResult> {
    // Alias (gym → memberships): activar el código viejo activa el nuevo.
    moduleCode = canonicalModuleCode(moduleCode);
    try {
      console.log(`moduleManagementService.activateModule - Starting for org ${organizationId}, module ${moduleCode}`);
      
      // Debug: Test module queries
      await this.debugModuleQuery(moduleCode, supabaseClient);
      
      // Verificar que el módulo existe
      const { data: module, error: moduleError } = await supabaseClient
        .from('modules')
        .select('*')
        .eq('code', moduleCode)
        .single();

      console.log(`moduleManagementService.activateModule - Module query result:`, { module, moduleError });

      if (moduleError || !module) {
        console.log(`moduleManagementService.activateModule - Module not found: ${moduleCode}`);
        return {
          success: false,
          message: 'Módulo no encontrado'
        };
      }

      // Obtener estado actual de la organización
      console.log(`moduleManagementService.activateModule - Getting org status for ${organizationId}`);
      const orgStatus = await this.getOrganizationModuleStatus(organizationId, supabaseClient);
      console.log(`moduleManagementService.activateModule - Org status:`, orgStatus);

      // Verificar si el módulo ya está activo
      if (orgStatus.active_modules.includes(moduleCode)) {
        console.log(`moduleManagementService.activateModule - Module ${moduleCode} already active`);
        return {
          success: false,
          message: 'El módulo ya está activo'
        };
      }

      // Verificar restricciones de plan (GO-156)
      const planCompliance = await this.checkModulePlanCompliance(
        organizationId,
        moduleCode,
        module.is_core,
        supabaseClient
      );

      console.log(`moduleManagementService.activateModule - Plan compliance check:`, planCompliance);

      // Si debe bloquear (modo 'enforce'), rechazar activación
      if (planCompliance.should_block) {
        console.log(`moduleManagementService.activateModule - Module blocked by plan enforcement`);
        return {
          success: false,
          message: planCompliance.warning_message || 'Este módulo no está incluido en tu plan actual'
        };
      }

      // Si es modo 'warn', registrar el evento (no bloqueamos pero avisamos)
      if (planCompliance.enforcement_mode === 'warn' && !planCompliance.allowed) {
        console.warn(`moduleManagementService.activateModule - WARNING: Module ${moduleCode} not in plan for org ${organizationId}, but allowed in warn mode`);
        // Registrar en ops_audit_log
        await supabaseClient.from('ops_audit_log').insert({
          organization_id: organizationId,
          table_name: 'organization_modules',
          operation: 'INSERT',
          record_id: `${organizationId}-${moduleCode}`,
          changes: {
            warning: 'module_not_in_plan',
            module_code: moduleCode,
            enforcement_mode: 'warn',
            message: planCompliance.warning_message
          }
        }).catch(err => console.warn('Could not log plan warning:', err));
      }

      // Si es un módulo pagado, verificar límites del plan
      if (!module.is_core) {
        console.log(`moduleManagementService.activateModule - Checking limits for paid module. Can activate more: ${orgStatus.can_activate_more}`);
        if (!orgStatus.can_activate_more) {
          console.log(`moduleManagementService.activateModule - Module limit reached`);
          return {
            success: false,
            message: `Has alcanzado el límite de módulos de tu plan (${orgStatus.max_modules_allowed}). Actualiza tu plan para activar más módulos.`
          };
        }
      } else {
        console.log(`moduleManagementService.activateModule - Core module, no limits apply`);
      }

      // Activar el módulo
      console.log(`moduleManagementService.activateModule - Activating module in database`);
      const { error: activationError } = await supabaseClient
        .from('organization_modules')
        .upsert({
          organization_id: organizationId,
          module_code: moduleCode,
          is_active: true,
          enabled_at: new Date().toISOString(),
          disabled_at: null
        }, {
          onConflict: 'organization_id,module_code'
        });

      if (activationError) {
        console.log(`moduleManagementService.activateModule - Database error:`, activationError);
        throw activationError;
      }

      // Si es un módulo core, asegurar que los permisos básicos estén disponibles
      if (module.is_core) {
        console.log(`moduleManagementService.activateModule - Ensuring core module permissions`);
        await this.ensureCoreModulePermissions(organizationId, moduleCode, supabaseClient);
      }

      // Activar todas las páginas del módulo por defecto
      if (modulePages && modulePages.length > 0) {
        try {
          await this.activateAllModulePages(organizationId, moduleCode, modulePages, supabaseClient);
          console.log(`moduleManagementService.activateModule - All ${modulePages.length} pages activated for ${moduleCode}`);
        } catch (pageError) {
          console.warn(`moduleManagementService.activateModule - Could not activate pages (non-blocking):`, pageError);
        }
      }

      console.log(`moduleManagementService.activateModule - Module ${moduleCode} activated successfully`);
      return {
        success: true,
        message: `Módulo ${module.name} activado exitosamente`,
        data: { module }
      };

    } catch (error: any) {
      console.error('Error activando módulo:', error);
      const errorMessage = error?.message || error?.details || 'Error interno al activar el módulo';
      return {
        success: false,
        message: errorMessage
      };
    }
  },

  /**
   * Desactivar un módulo para una organización
   */
  async deactivateModule(organizationId: number, moduleCode: string, supabaseClient = supabase): Promise<ModuleActivationResult> {
    moduleCode = canonicalModuleCode(moduleCode);
    try {
      // Verificar que el módulo existe
      const { data: module, error: moduleError } = await supabaseClient
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
      const orgStatus = await this.getOrganizationModuleStatus(organizationId, supabaseClient);
      if (!orgStatus.active_modules.includes(moduleCode)) {
        return {
          success: false,
          message: 'El módulo no está activo'
        };
      }

      // Desactivar el módulo
      const { error: deactivationError } = await supabaseClient
        .from('organization_modules')
        .update({
          is_active: false,
          disabled_at: new Date().toISOString()
        })
        .eq('organization_id', organizationId)
        .eq('module_code', moduleCode);

      if (deactivationError) {
        throw deactivationError;
      }

      // Desactivar todas las páginas del módulo
      try {
        await this.deactivateAllModulePages(organizationId, moduleCode, supabaseClient);
      } catch (pageError) {
        console.warn('Could not deactivate module pages (non-blocking):', pageError);
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
  async ensureCoreModulesActivated(organizationId: number, supabaseClient = supabase): Promise<void> {
    const coreModules = await this.getCoreModules(supabaseClient);
    
    for (const coreModule of coreModules) {
      await supabaseClient
        .from('organization_modules')
        .upsert({
          organization_id: organizationId,
          module_code: coreModule.code,
          is_active: true,
          enabled_at: new Date().toISOString(),
          disabled_at: null
        }, {
          onConflict: 'organization_id,module_code'
        });
    }
  },

  /**
   * Asegurar permisos básicos para módulos core
   */
  async ensureCoreModulePermissions(organizationId: number, moduleCode: string, supabaseClient = supabase): Promise<void> {
    // Esta función se puede expandir para asegurar permisos específicos por módulo core
    // Por ahora, es un placeholder para futuras implementaciones
    console.log(`Ensuring core permissions for module ${moduleCode} in organization ${organizationId}`);
  },

  /**
   * Verificar si una organización puede acceder a un módulo específico
   */
  async canAccessModule(organizationId: number, moduleCode: string, supabaseClient = supabase): Promise<boolean> {
    moduleCode = canonicalModuleCode(moduleCode);
    const { data, error } = await supabaseClient
      .from('organization_modules')
      .select('is_active')
      .eq('organization_id', organizationId)
      .eq('module_code', moduleCode)
      .eq('is_active', true)
      .maybeSingle();

    if (error) return false;
    return !!data;
  },

  /**
   * Obtener módulos activos de una organización
   * Los módulos core siempre están incluidos independientemente de su estado de activación
   */
  async getActiveModules(organizationId: number, supabaseClient = supabase): Promise<Module[]> {
    // Consultas paralelas: módulos core y módulos pagados activos
    const [coreRes, activeRes] = await Promise.all([
      supabaseClient.from('modules').select('*').eq('is_core', true).eq('is_active', true),
      supabaseClient.from('organization_modules')
        .select('module_code, modules!inner(*)')
        .eq('organization_id', organizationId)
        .eq('is_active', true),
    ]);

    if (coreRes.error) throw coreRes.error;
    if (activeRes.error) throw activeRes.error;

    const paidModules = activeRes.data?.map(item => item.modules).filter(Boolean) || [];
    
    // Combinar módulos core y pagados, evitando duplicados
    const allModules = [...(coreRes.data || []), ...paidModules];
    const uniqueModules = allModules.filter((module, index, self) => 
      index === self.findIndex(m => m.code === module.code)
    );
    
    return uniqueModules;
  },

  /**
   * Auditar y corregir inconsistencias en módulos de organizaciones
   */
  async auditOrganizationModules(supabaseClient = supabase): Promise<{
    organizationsWithoutSubscriptions: number[];
    organizationsExceedingLimits: Array<{
      organizationId: number;
      currentModules: number;
      maxAllowed: number;
    }>;
    organizationsWithoutCoreModules: number[];
  }> {
    // Organizaciones sin suscripciones
    const { data: orgsWithoutSubs, error: subsError } = await supabaseClient
      .from('organizations')
      .select(`
        id,
        subscriptions(id)
      `)
      .is('subscriptions.id', null);

    if (subsError) throw subsError;

    // Organizaciones que exceden límites
    const { data: orgsWithLimits, error: limitsError } = await supabaseClient
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

    // Verificar límites usando la función get_current_plan para cada organización
    if (orgsWithLimits) {
      for (const org of orgsWithLimits) {
        try {
          const { data: planData } = await supabaseClient
            .rpc('get_current_plan', { org_id: org.id });
          
          const planInfo = planData?.[0];
          const maxModules = planInfo?.max_modules || 0;
          const paidModules = org.organization_modules?.filter(om =>
            om.modules && !om.modules[0]?.is_core
          ).length || 0;

          if (paidModules > maxModules) {
            organizationsExceedingLimits.push({
              organizationId: org.id,
              currentModules: paidModules,
              maxAllowed: maxModules
            });
          }
        } catch (error) {
          console.error(`Error checking limits for org ${org.id}:`, error);
        }
      }
    }

    return {
      organizationsWithoutSubscriptions: orgsWithoutSubs?.map(o => o.id) || [],
      organizationsExceedingLimits,
      organizationsWithoutCoreModules: [] // Se puede implementar después
    };
  },

  /**
   * Corregir inconsistencias detectadas en la auditoría
   */
  /**
   * Páginas explícitamente APAGADAS por módulo: las filas de
   * `organization_module_pages` con `is_active = false`.
   *
   * Es lo único que hace falta para decidir qué se ve, porque desde el
   * 2026-09-23 la ausencia de fila significa «activa» en todos los lectores
   * (ver `src/lib/navigation/paginaActiva.ts`). Un módulo sin filas apagadas no
   * aparece en el mapa, y eso no oculta nada.
   *
   * Las filas huérfanas —las que nombran un `page_href` que ya no está en el
   * catálogo— se descartan aquí a propósito, en vez de dejarlas ensuciar el
   * mapa: no pueden esconder ninguna página real y confundirían al depurar.
   * Medidas el 2026-09-23: las hay en varias organizaciones (p. ej. un módulo
   * de reportes con 8 rutas que ya no existen).
   */
  async getHiddenModulePages(
    organizationId: number,
    supabaseClient = supabase
  ): Promise<Record<string, string[]>> {
    const { data, error } = await supabaseClient
      .from('organization_module_pages')
      .select('module_code, page_href')
      .eq('organization_id', organizationId)
      .eq('is_active', false);

    if (error) {
      console.error('Error getting hidden module pages:', error);
      // Fallar abriendo: el menú no es la barrera de acceso (lo es la RLS), y
      // esconder pantallas por un fallo de red deja a la persona sin salida.
      return {};
    }

    const result: Record<string, string[]> = {};
    for (const row of data || []) {
      const delCatalogo = MODULE_PAGES[row.module_code];
      if (!delCatalogo?.some((p) => p.href === row.page_href)) continue; // huérfana
      if (!result[row.module_code]) result[row.module_code] = [];
      result[row.module_code].push(row.page_href);
    }
    return result;
  },

  /**
   * Obtener páginas activas de módulos para una organización
   * Retorna un mapa: module_code -> Set de page_href activos
   *
   * OJO: esto es «qué filas hay en true», NO «qué se ve». Para decidir si una
   * página se ve, el único camino es `paginaActiva()` con
   * `getHiddenModulePages()`. Este método queda para lo que de verdad necesita
   * saber qué filas existen (auditoría y estado del propio registro).
   */
  async getActiveModulePages(organizationId: number, supabaseClient = supabase): Promise<Record<string, string[]>> {
    // Consultar TODOS los registros (activos e inactivos) para saber qué
    // módulos tienen registros. Luego incluir solo las páginas activas.
    const { data, error } = await supabaseClient
      .from('organization_module_pages')
      .select('module_code, page_href, is_active')
      .eq('organization_id', organizationId);

    if (error) {
      console.error('Error getting active module pages:', error);
      return {};
    }

    const result: Record<string, string[]> = {};
    for (const row of data || []) {
      // Asegurar que el módulo aparezca en el resultado (incluso si array vacío)
      if (!result[row.module_code]) result[row.module_code] = [];
      // Solo incluir las páginas activas
      if (row.is_active) {
        result[row.module_code].push(row.page_href);
      }
    }
    return result;
  },

  /**
   * Activar todas las páginas de un módulo (usado cuando se activa un módulo por primera vez)
   */
  async activateAllModulePages(
    organizationId: number,
    moduleCode: string,
    pages: Array<{ name: string; href: string }>,
    supabaseClient = supabase
  ): Promise<void> {
    const rows = pages.map(page => ({
      organization_id: organizationId,
      module_code: moduleCode,
      page_href: page.href,
      page_name: page.name,
      is_active: true,
      enabled_at: new Date().toISOString(),
      disabled_at: null,
    }));

    const { error } = await supabaseClient
      .from('organization_module_pages')
      .upsert(rows, {
        onConflict: 'organization_id,module_code,page_href',
      });

    if (error) {
      console.error('Error activating all module pages:', error);
      throw error;
    }
  },

  /**
   * Desactivar todas las páginas de un módulo (usado cuando se desactiva un módulo)
   */
  async deactivateAllModulePages(
    organizationId: number,
    moduleCode: string,
    supabaseClient = supabase
  ): Promise<void> {
    const { error } = await supabaseClient
      .from('organization_module_pages')
      .update({
        is_active: false,
        disabled_at: new Date().toISOString(),
      })
      .eq('organization_id', organizationId)
      .eq('module_code', moduleCode);

    if (error) {
      console.error('Error deactivating module pages:', error);
      throw error;
    }
  },

  /**
   * Toggle individual de una página/submódulo.
   *
   * Al hacer toggle de una página, se consultan los estados actuales de todas
   * las páginas del módulo y se hace upsert de todas, manteniendo el estado
   * de las demás y cambiando solo la página objetivo. Esto asegura que el
   * mapa de páginas activas siempre tenga registros completos y
   * getActiveModulePages funcione correctamente.
   */
  async toggleModulePage(
    organizationId: number,
    moduleCode: string,
    pageHref: string,
    pageName: string,
    isActive: boolean,
    supabaseClient = supabase
  ): Promise<ModulePageToggleResult> {
    try {
      // 1. Consultar el estado actual de todas las páginas del módulo
      const { data: existingPages } = await supabaseClient
        .from('organization_module_pages')
        .select('page_href, page_name, is_active')
        .eq('organization_id', organizationId)
        .eq('module_code', moduleCode);

      // 2. Construir el mapa de estados actuales
      const currentState = new Map<string, { page_name: string; is_active: boolean }>();
      for (const row of existingPages || []) {
        currentState.set(row.page_href, { page_name: row.page_name, is_active: row.is_active });
      }

      // 3. Construir las filas para upsert: todas las páginas conocidas del módulo
      const knownPages = MODULE_PAGES[moduleCode] || [];
      const now = new Date().toISOString();
      const rows = knownPages.map(page => {
        const isTargetPage = page.href === pageHref;
        const current = currentState.get(page.href);
        // La página objetivo usa el nuevo estado; las demás mantienen su estado actual
        const finalIsActive = isTargetPage ? isActive : (current ? current.is_active : true);
        return {
          organization_id: organizationId,
          module_code: moduleCode,
          page_href: page.href,
          page_name: page.name,
          is_active: finalIsActive,
          enabled_at: finalIsActive ? now : null,
          disabled_at: !finalIsActive ? now : null,
        };
      });

      // 4. Upsert de todas las páginas
      const { error } = await supabaseClient
        .from('organization_module_pages')
        .upsert(rows, {
          onConflict: 'organization_id,module_code,page_href',
        });

      if (error) throw error;

      return {
        success: true,
        message: isActive ? 'Página activada' : 'Página desactivada',
      };
    } catch (error: any) {
      console.error('Error toggling module page:', error);
      return {
        success: false,
        message: error?.message || 'Error al cambiar estado de la página',
      };
    }
  },

  async fixInconsistencies(organizationId: number, supabaseClient = supabase): Promise<ModuleActivationResult> {
    try {
      // 1. Asegurar que tenga una suscripción (plan gratuito por defecto)
      const { data: existingSub } = await supabaseClient
        .from('subscriptions')
        .select('id')
        .eq('organization_id', organizationId)
        .maybeSingle();

      if (!existingSub) {
        const { data: freePlan } = await supabaseClient
          .from('plans')
          .select('id')
          .eq('code', 'free')
          .single();

        if (freePlan) {
          await supabaseClient
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
      await this.ensureCoreModulesActivated(organizationId, supabaseClient);

      // 3. Verificar y corregir límites de módulos pagados
      const orgStatus = await this.getOrganizationModuleStatus(organizationId, supabaseClient);
      if (orgStatus.paid_modules_count > orgStatus.max_modules_allowed) {
        // Desactivar módulos pagados excedentes (mantener los más antiguos)
        const { data: paidActiveModules } = await supabaseClient
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
          for (const excessModule of excessModules) {
            await this.deactivateModule(organizationId, excessModule.module_code, supabaseClient);
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
