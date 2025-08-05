'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase/config';
import { 
  getUserPermissionContext, 
  UserPermissionContext, 
  PermissionChecker,
  createPermissionChecker 
} from '@/lib/middleware/permissions';

interface UsePermissionContextReturn {
  context: UserPermissionContext | null;
  checker: PermissionChecker;
  loading: boolean;
  error: string | null;
  refreshContext: () => Promise<void>;
}

/**
 * Hook para obtener y usar el contexto de permisos del usuario actual
 */
export function usePermissionContext(organizationId?: number): UsePermissionContextReturn {
  const [context, setContext] = useState<UserPermissionContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const loadContext = useCallback(async () => {
    // Prevent multiple simultaneous calls
    if (loadingRef.current) {
      return;
    }

    try {
      loadingRef.current = true;
      setLoading(true);
      setError(null);

      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        setContext(null);
        return;
      }

      const userContext = await getUserPermissionContext(session.user.id, organizationId);
      setContext(userContext);
      
    } catch (err) {
      console.error('Error loading permission context:', err);
      setError('Error al cargar contexto de permisos');
      setContext(null);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [organizationId]);

  const refreshContext = useCallback(async () => {
    // Clear any pending debounced calls
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    await loadContext();
  }, [loadContext]);

  // Cargar contexto inicial con debounce
  useEffect(() => {
    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Debounce the loading to prevent rapid successive calls
    timeoutRef.current = setTimeout(() => {
      loadContext();
    }, 100);

    // Cleanup timeout on unmount
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [loadContext]);

  // Escuchar cambios de autenticación
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          await loadContext();
        } else if (event === 'SIGNED_OUT') {
          setContext(null);
          setLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [loadContext]);

  const checker = createPermissionChecker(context);

  return {
    context,
    checker,
    loading,
    error,
    refreshContext
  };
}

/**
 * Hook simplificado para verificar un permiso específico
 */
export function usePermission(permission: string, organizationId?: number) {
  const { checker, loading } = usePermissionContext(organizationId);
  
  return {
    hasPermission: checker.can(permission),
    loading
  };
}

/**
 * Hook simplificado para verificar acceso a un módulo
 */
export function useModuleAccess(moduleCode: string, organizationId?: number) {
  const { checker, loading } = usePermissionContext(organizationId);
  
  return {
    hasAccess: checker.canAccessModule(moduleCode),
    loading
  };
}

/**
 * Hook para verificar múltiples permisos
 */
export function usePermissions(permissions: string[], requireAll = true, organizationId?: number) {
  const { checker, loading } = usePermissionContext(organizationId);
  
  const hasPermissions = requireAll 
    ? checker.canAll(permissions)
    : checker.canAny(permissions);
  
  return {
    hasPermissions,
    loading
  };
}

/**
 * Hook para verificar si el usuario es super admin
 */
export function useSuperAdmin(organizationId?: number) {
  const { checker, loading } = usePermissionContext(organizationId);
  
  return {
    isSuperAdmin: checker.isSuperAdmin(),
    loading
  };
}
