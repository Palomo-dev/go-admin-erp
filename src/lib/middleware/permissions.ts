import { supabase } from '@/lib/supabase/config';
import { permissionService } from '@/lib/services/permissionService';

export interface UserPermissionContext {
  userId: string;
  organizationId: number;
  isSuperAdmin: boolean;
  roleId: number;
  permissions: string[];
  moduleAccess: string[];
}

/**
 * Obtiene el contexto completo de permisos de un usuario
 */
export async function getUserPermissionContext(
  userId: string, 
  organizationId?: number
): Promise<UserPermissionContext | null> {
  try {
    // Si no se proporciona organizationId, obtenerlo del perfil
    let orgId = organizationId;
    if (!orgId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('last_org_id')
        .eq('id', userId)
        .single();
      
      if (!profile?.last_org_id) return null;
      orgId = profile.last_org_id;
    }

    // Obtener información del miembro de la organización
    const { data: member, error } = await supabase
      .from('organization_members')
      .select(`
        role_id,
        is_super_admin,
        roles(
          role_permissions(
            permissions(code)
          )
        )
      `)
      .eq('user_id', userId)
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .single();

    if (error || !member) return null;

    // Extraer permisos del rol
    const memberRoles = member.roles as any;
    const permissions = memberRoles?.role_permissions?.map((rp: any) => rp.permissions?.code).filter(Boolean) || [];

    // Obtener módulos activos para la organización
    const { data: orgModules } = await supabase
      .from('organization_modules')
      .select('module_code')
      .eq('organization_id', orgId)
      .eq('is_active', true);

    const moduleAccess = orgModules?.map(om => om.module_code) || [];

    return {
      userId,
      organizationId: orgId!,
      isSuperAdmin: member.is_super_admin,
      roleId: member.role_id,
      permissions,
      moduleAccess
    };
    
  } catch (error) {
    console.error('Error getting user permission context:', error);
    return null;
  }
}

/**
 * Verifica si un usuario tiene un permiso específico
 */
export async function hasPermission(
  userId: string,
  permission: string,
  organizationId?: number
): Promise<boolean> {
  const context = await getUserPermissionContext(userId, organizationId);
  
  if (!context) return false;
  
  // Super admin tiene todos los permisos
  if (context.isSuperAdmin) return true;
  
  // Verificar permiso específico
  return context.permissions.includes(permission);
}

/**
 * Verifica si un usuario tiene acceso a un módulo específico
 */
export async function hasModuleAccess(
  userId: string,
  moduleCode: string,
  organizationId?: number
): Promise<boolean> {
  const context = await getUserPermissionContext(userId, organizationId);
  
  if (!context) return false;
  
  // Super admin tiene acceso a todos los módulos
  if (context.isSuperAdmin) return true;
  
  // Verificar si el módulo está activo para la organización
  return context.moduleAccess.includes(moduleCode);
}

/**
 * Verifica múltiples permisos (requiere TODOS)
 */
export async function hasAllPermissions(
  userId: string,
  permissions: string[],
  organizationId?: number
): Promise<boolean> {
  const context = await getUserPermissionContext(userId, organizationId);
  
  if (!context) return false;
  
  // Super admin tiene todos los permisos
  if (context.isSuperAdmin) return true;
  
  // Verificar que tenga todos los permisos
  return permissions.every(permission => context.permissions.includes(permission));
}

/**
 * Verifica múltiples permisos (requiere AL MENOS UNO)
 */
export async function hasAnyPermission(
  userId: string,
  permissions: string[],
  organizationId?: number
): Promise<boolean> {
  const context = await getUserPermissionContext(userId, organizationId);
  
  if (!context) return false;
  
  // Super admin tiene todos los permisos
  if (context.isSuperAdmin) return true;
  
  // Verificar que tenga al menos uno de los permisos
  return permissions.some(permission => context.permissions.includes(permission));
}

/**
 * Middleware para verificar permisos en rutas de API
 */
export function requirePermission(permission: string) {
  return async (req: any, res: any, next: any) => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error || !session) {
        return res.status(401).json({ error: 'No autorizado' });
      }

      const hasAccess = await hasPermission(session.user.id, permission);
      
      if (!hasAccess) {
        return res.status(403).json({ error: 'Permisos insuficientes' });
      }

      // Agregar contexto de permisos a la request
      req.userContext = await getUserPermissionContext(session.user.id);
      
      next();
    } catch (error) {
      console.error('Permission middleware error:', error);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
  };
}

/**
 * Middleware para verificar acceso a módulos en rutas de API
 */
export function requireModuleAccess(moduleCode: string) {
  return async (req: any, res: any, next: any) => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error || !session) {
        return res.status(401).json({ error: 'No autorizado' });
      }

      const hasAccess = await hasModuleAccess(session.user.id, moduleCode);
      
      if (!hasAccess) {
        return res.status(403).json({ error: 'Acceso al módulo denegado' });
      }

      // Agregar contexto de permisos a la request
      req.userContext = await getUserPermissionContext(session.user.id);
      
      next();
    } catch (error) {
      console.error('Module access middleware error:', error);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
  };
}

/**
 * Utilidad para verificar permisos en componentes del lado del cliente
 */
export class PermissionChecker {
  private context: UserPermissionContext | null = null;

  constructor(context: UserPermissionContext | null) {
    this.context = context;
  }

  /**
   * Verifica si tiene un permiso específico
   */
  can(permission: string): boolean {
    if (!this.context) return false;
    if (this.context.isSuperAdmin) return true;
    return this.context.permissions.includes(permission);
  }

  /**
   * Verifica si tiene acceso a un módulo
   */
  canAccessModule(moduleCode: string): boolean {
    if (!this.context) return false;
    if (this.context.isSuperAdmin) return true;
    return this.context.moduleAccess.includes(moduleCode);
  }

  /**
   * Verifica si tiene todos los permisos especificados
   */
  canAll(permissions: string[]): boolean {
    if (!this.context) return false;
    if (this.context.isSuperAdmin) return true;
    return permissions.every(permission => this.context!.permissions.includes(permission));
  }

  /**
   * Verifica si tiene al menos uno de los permisos especificados
   */
  canAny(permissions: string[]): boolean {
    if (!this.context) return false;
    if (this.context.isSuperAdmin) return true;
    return permissions.some(permission => this.context!.permissions.includes(permission));
  }

  /**
   * Verifica si es super admin
   */
  isSuperAdmin(): boolean {
    return this.context?.isSuperAdmin || false;
  }

  /**
   * Obtiene el contexto completo
   */
  getContext(): UserPermissionContext | null {
    return this.context;
  }
}

/**
 * Hook para usar el verificador de permisos en componentes React
 */
export function createPermissionChecker(context: UserPermissionContext | null): PermissionChecker {
  return new PermissionChecker(context);
}

// Constantes de permisos comunes
export const PERMISSIONS = {
  // Administración
  ADMIN_FULL_ACCESS: 'admin.full_access',
  USER_MANAGEMENT: 'user_management',
  ROLES_MANAGE: 'roles.manage',
  ORGANIZATION_SETTINGS: 'organization.settings',
  
  // Módulos específicos
  POS_ACCESS: 'pos.access',
  POS_MANAGE: 'pos.manage',
  INVENTORY_ACCESS: 'inventory.access',
  INVENTORY_MANAGE: 'inventory.manage',
  CRM_ACCESS: 'crm.access',
  CRM_MANAGE: 'crm.manage',
  HRM_ACCESS: 'hrm.access',
  HRM_MANAGE: 'hrm.manage',
  FINANCE_ACCESS: 'finance.access',
  FINANCE_MANAGE: 'finance.manage',
  REPORTS_ACCESS: 'reports.access',
  REPORTS_MANAGE: 'reports.manage',
  
  // Operaciones comunes
  CREATE: 'create',
  READ: 'read',
  UPDATE: 'update',
  DELETE: 'delete',
  APPROVE: 'approve',
  EXPORT: 'export'
} as const;

// Constantes de módulos
export const MODULES = {
  ADMIN: 'admin',
  POS: 'pos',
  INVENTORY: 'inventario',
  CRM: 'crm',
  HRM: 'hrm',
  FINANCE: 'finanzas',
  REPORTS: 'reportes',
  NOTIFICATIONS: 'notificaciones',
  INTEGRATIONS: 'integraciones',
  TRANSPORT: 'transporte',
  CALENDAR: 'calendario',
  TIMELINE: 'timeline',
  PMS: 'pms',
  ORGANIZATION: 'app-organ'
} as const;
