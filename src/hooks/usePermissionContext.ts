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
  /**
   * Organización para la que se completó la ÚLTIMA carga con sesión válida,
   * o null si todavía no se ha completado ninguna (o no hay sesión).
   *
   * `context` puede ser null por tres motivos distintos: aún no se cargó,
   * no hay sesión, o el usuario no tiene membresía en esa organización. Solo
   * el tercero es un resultado definitivo. Con este campo, una pantalla
   * puede saber si el rol ya está resuelto PARA SU organización
   * (`resolvedOrganizationId === organization.id`) en vez de fiarse de
   * `loading`, que entre una carga y la siguiente vale false un instante.
   */
  resolvedOrganizationId: number | null;
}

/**
 * Hook para obtener y usar el contexto de permisos del usuario actual
 */
export function usePermissionContext(organizationId?: number): UsePermissionContextReturn {
  const [context, setContext] = useState<UserPermissionContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolvedOrganizationId, setResolvedOrganizationId] = useState<number | null>(null);
  const loadingRef = useRef(false);
  // Si llega una petición de carga mientras otra está en vuelo (típico: la
  // primera arranca sin organización y la organización llega 50 ms después),
  // antes se descartaba sin más y la organización nueva nunca se cargaba.
  // Ahora se anota y se vuelve a lanzar al terminar la que está en curso.
  const pendingRef = useRef(false);
  // Siempre apunta al loadContext MÁS RECIENTE (con la organización actual).
  // El relanzamiento desde `finally` no puede usar la closure con la que
  // arrancó la carga en vuelo: esa tiene la organización anterior.
  const latestLoadRef = useRef<() => Promise<void>>(async () => {});
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const loadContext = useCallback(async () => {
    // Si hay una carga en vuelo, no se descarta esta: se deja anotada y se
    // relanza al terminar la actual (ver pendingRef).
    if (loadingRef.current) {
      pendingRef.current = true;
      return;
    }

    try {
      loadingRef.current = true;
      setLoading(true);
      setError(null);

      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        // Sin sesión no hay nada resuelto: el listener de SIGNED_IN volverá
        // a cargar. No se marca organización resuelta para que las pantallas
        // no tomen este null transitorio como "usuario sin rol".
        setContext(null);
        setResolvedOrganizationId(null);
        return;
      }

      const userContext = await getUserPermissionContext(session.user.id, organizationId);
      setContext(userContext);
      // Resuelto para la organización pedida; si no se pidió ninguna, para la
      // que devolvió el contexto (last_org_id del perfil).
      setResolvedOrganizationId(organizationId ?? userContext?.organizationId ?? null);
      
    } catch (err) {
      console.error('Error loading permission context:', err);
      setError('Error al cargar contexto de permisos');
      setContext(null);
    } finally {
      loadingRef.current = false;
      if (pendingRef.current) {
        // Llegó otra petición mientras cargábamos: relanzar sin bajar
        // `loading`, para que no haya un instante de "resuelto" a medias.
        pendingRef.current = false;
        void latestLoadRef.current();
      } else {
        setLoading(false);
      }
    }
  }, [organizationId]);

  latestLoadRef.current = loadContext;

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

    // `loading` pasa a true YA, no cuando venza el debounce: si no, durante
    // esos 100 ms el hook decía "no estoy cargando" con un contexto que aún
    // era de la organización anterior (o null), y la página de inicio pintaba
    // el panel de empleado a un administrador antes de saltar al correcto.
    setLoading(true);

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
      (event) => {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          // NUNCA hacer await aquí: auth-js espera los callbacks de
          // onAuthStateChange dentro del lock global de sesión
          // (_notifyAllSubscribers corre con lockAcquired = true), y
          // loadContext() llama supabase.auth.getSession(), que vuelve a
          // pedir ese mismo lock. Eso encadenaba la promesa sobre sí misma
          // y bloqueaba TODAS las llamadas a Supabase de la pestaña: las
          // páginas quedaban en skeleton hasta recargar. Fire-and-forget en
          // el siguiente tick: el callback retorna de inmediato y
          // loadContext corre ya fuera del lock.
          setTimeout(() => { void loadContext(); }, 0);
        } else if (event === 'SIGNED_OUT') {
          setContext(null);
          setResolvedOrganizationId(null);
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
    refreshContext,
    resolvedOrganizationId,
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
