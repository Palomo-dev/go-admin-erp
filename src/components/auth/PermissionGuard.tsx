'use client';

import { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { usePermissionContext, usePermission, useModuleAccess } from '@/hooks/usePermissionContext';
import { Shield, Lock, AlertTriangle } from 'lucide-react';

interface PermissionGuardProps {
  children: ReactNode;
  permission?: string;
  permissions?: string[];
  requireAll?: boolean;
  moduleCode?: string;
  fallback?: ReactNode;
  redirectTo?: string;
  organizationId?: number;
}

/**
 * Componente para proteger rutas y componentes basado en permisos
 */
export default function PermissionGuard({
  children,
  permission,
  permissions = [],
  requireAll = true,
  moduleCode,
  fallback,
  redirectTo,
  organizationId
}: PermissionGuardProps) {
  const router = useRouter();
  const { context, checker, loading } = usePermissionContext(organizationId);

  // Mostrar loading mientras se cargan los permisos
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-2 text-sm text-gray-600">Verificando permisos...</p>
        </div>
      </div>
    );
  }

  // Si no hay contexto de usuario, mostrar error de autenticación
  if (!context) {
    if (redirectTo) {
      router.push(redirectTo);
      return null;
    }

    return fallback || (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Lock className="mx-auto h-12 w-12 text-red-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">Acceso Denegado</h3>
          <p className="mt-1 text-sm text-gray-500">
            Debes iniciar sesión para acceder a esta sección.
          </p>
        </div>
      </div>
    );
  }

  // Verificar permisos
  let hasAccess = true;

  // Verificar permiso específico
  if (permission) {
    hasAccess = checker.can(permission);
  }

  // Verificar múltiples permisos
  if (permissions.length > 0) {
    hasAccess = requireAll 
      ? checker.canAll(permissions)
      : checker.canAny(permissions);
  }

  // Verificar acceso a módulo
  if (moduleCode) {
    hasAccess = hasAccess && checker.canAccessModule(moduleCode);
  }

  // Si no tiene acceso, mostrar fallback o redirigir
  if (!hasAccess) {
    if (redirectTo) {
      router.push(redirectTo);
      return null;
    }

    return fallback || (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Shield className="mx-auto h-12 w-12 text-red-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">Permisos Insuficientes</h3>
          <p className="mt-1 text-sm text-gray-500">
            No tienes los permisos necesarios para acceder a esta sección.
          </p>
        </div>
      </div>
    );
  }

  // Si tiene acceso, renderizar children
  return <>{children}</>;
}

/**
 * Componente para mostrar contenido solo si tiene un permiso específico
 */
interface PermissionGateProps {
  children: ReactNode;
  permission: string;
  fallback?: ReactNode;
  organizationId?: number;
}

export function PermissionGate({ 
  children, 
  permission, 
  fallback = null,
  organizationId 
}: PermissionGateProps) {
  const { hasPermission, loading } = usePermission(permission, organizationId);

  if (loading) {
    return null; // No mostrar nada mientras carga
  }

  return hasPermission ? <>{children}</> : <>{fallback}</>;
}

/**
 * Componente para mostrar contenido solo si tiene acceso a un módulo
 */
interface ModuleGateProps {
  children: ReactNode;
  moduleCode: string;
  fallback?: ReactNode;
  organizationId?: number;
}

export function ModuleGate({ 
  children, 
  moduleCode, 
  fallback = null,
  organizationId 
}: ModuleGateProps) {
  const { hasAccess, loading } = useModuleAccess(moduleCode, organizationId);

  if (loading) {
    return null; // No mostrar nada mientras carga
  }

  return hasAccess ? <>{children}</> : <>{fallback}</>;
}

/**
 * Componente para mostrar contenido solo para super admins
 */
interface SuperAdminGateProps {
  children: ReactNode;
  fallback?: ReactNode;
  organizationId?: number;
}

export function SuperAdminGate({ 
  children, 
  fallback = null,
  organizationId 
}: SuperAdminGateProps) {
  const { checker, loading } = usePermissionContext(organizationId);

  if (loading) {
    return null; // No mostrar nada mientras carga
  }

  return checker.isSuperAdmin() ? <>{children}</> : <>{fallback}</>;
}

/**
 * Componente para mostrar advertencias de permisos
 */
interface PermissionWarningProps {
  title?: string;
  message?: string;
  type?: 'warning' | 'error' | 'info';
}

export function PermissionWarning({ 
  title = 'Permisos Limitados',
  message = 'Algunas funciones pueden no estar disponibles debido a tus permisos actuales.',
  type = 'warning'
}: PermissionWarningProps) {
  const iconMap = {
    warning: AlertTriangle,
    error: Shield,
    info: Shield
  };

  const colorMap = {
    warning: 'text-amber-600 bg-amber-50 border-amber-200',
    error: 'text-red-600 bg-red-50 border-red-200',
    info: 'text-blue-600 bg-blue-50 border-blue-200'
  };

  const Icon = iconMap[type];
  const colors = colorMap[type];

  return (
    <div className={`rounded-md border p-4 ${colors}`}>
      <div className="flex">
        <div className="flex-shrink-0">
          <Icon className="h-5 w-5" />
        </div>
        <div className="ml-3">
          <h3 className="text-sm font-medium">{title}</h3>
          <div className="mt-2 text-sm">
            <p>{message}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
