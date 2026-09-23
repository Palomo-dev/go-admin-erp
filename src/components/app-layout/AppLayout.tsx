'use client';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Bot, Bug } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { supabase } from '@/lib/supabase/config';
import { isAuthenticated } from '@/lib/supabase/auth-manager';
import { AppHeader } from '@/components/shell/header/AppHeader';
import { abrirReportarProblema } from '@/components/shell/header/ReportarProblema';
import type { PaginaBuscable } from './Header/GlobalSearch';
import AIAssistantPanel from './Header/AIAssistantPanel';
import { SidebarShell } from '@/components/shell/sidebar/SidebarShell';
import { CATALOGO_NAV } from '@/lib/navigation/catalog';
import { filtrarNavegacion, rutaActiva } from '@/lib/navigation/filtrar';
import { useCapacidades } from '@/lib/navigation/useCapacidades';
import { getOrganizationId, guardarOrganizacionActiva } from '@/lib/hooks/useOrganization';
import { useSubscriptionGuard } from '@/lib/hooks/useSubscriptionGuard';
import { useTheme } from 'next-themes';
import { themeService } from '@/lib/services/themeService';
import { usePathname, useRouter } from 'next/navigation';
import type { AssistantContext } from '@/lib/services/aiAssistantService';

// Importaciones estándar para evitar ChunkLoadError
import ModuleLimitNotification from '@/components/notifications/ModuleLimitNotification';
import { PageHeaderSkeleton, StatsSkeleton, CardListSkeleton } from '@/components/common/PageSkeletons';
import { ModuleProvider } from '@/lib/context/ModuleContext';
// F3: dock del softphone y aviso de llamada entrante. Se montan AQUI y no en
// `SoftphoneShell` porque aqui ya se sabe que modulos tiene activos la
// organizacion (`activeModuleCodes`), sin una consulta extra, y porque
// `ModuleProvider` vive dentro de este componente.
// El `SoftphoneProvider` también se monta aquí (no en `SoftphoneShell`) con
// `enabled` condicional al CRM: así el navegador NO pide permiso de micrófono
// al usuario si el CRM no está activo, y cuando lo está, no lo pide en cada
// carga (solo cuando el usuario hace/recibe una llamada).
import { SoftphoneProvider } from '@/components/voice/SoftphoneProvider';

/**
 * Wrapper con reintentos para `dynamic()`: en dev, los chunks grandes (ej.
 * SoftphoneDock ~4 MB sin minificar) pueden tardar demasiado en compilarse
 * bajo demanda y el navegador lanza ChunkLoadError por timeout. Esto reintenta
 * la carga antes de rendirse, y el `loading: () => null` evita que la app
 * entera se caiga mientras el chunk se resuelve.
 */
function retryImport<T>(loader: () => Promise<T>, retries = 3, delayMs = 1000): Promise<T> {
  return loader().catch((err) => {
    if (retries <= 0) throw err;
    return new Promise((resolve) => setTimeout(resolve, delayMs)).then(() => retryImport(loader, retries - 1, delayMs * 2));
  });
}

const SoftphoneDock = dynamic(() => retryImport(() => import('@/components/voice/SoftphoneDock').then((m) => m.SoftphoneDock)), { ssr: false, loading: () => null });
const IncomingCallToast = dynamic(() => retryImport(() => import('@/components/voice/IncomingCallToast').then((m) => m.IncomingCallToast)), { ssr: false, loading: () => null });
import { BranchProvider } from '@/lib/context/BranchContext';
import { NavigationProgress } from './NavigationProgress';
import { OfflineIndicator } from './OfflineIndicator';
import { LocalDataNotice } from '@/components/offline/LocalDataNotice';
import { moduleManagementService } from '@/lib/services/moduleManagementService';
import { jobPositionModuleAccessService } from '@/lib/services/jobPositionModuleAccessService';
import { registerUserDevice } from '@/lib/auth/organizationAuth';

// Los módulos y páginas del menú salen de `src/lib/navigation/catalog.ts` (única
// fuente). Aquí había una copia de ~300 líneas (`MODULES_WITH_SUBMENU`) que ya
// no coincidía con la del sidebar.

// Cache interno para datos del usuario con TTL
interface UserDataCache {
  data: {
    name?: string;
    email?: string;
    role?: string;
    avatar?: string;
  };
  orgName: string;
  orgId: string;
  timestamp: number;
}

const USER_CACHE_KEY = 'appLayout_userData_cache';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos en milisegundos

// Componente principal que organiza todo el layout de la aplicación
export const AppLayout = ({
  children
}: {
  children: React.ReactNode;
}) => {
  // Hook para obtener la ruta actual
  const pathname = usePathname();
  const tNav = useTranslations('nav');
  const tHeader = useTranslations('header');
  const router = useRouter();

  // Verificación client-side del estado de suscripción (segunda capa después del middleware)
  const subscriptionChecked = useSubscriptionGuard();
  
  // Módulo y página activos, desde el catálogo de navegación.
  const rutaNav = useMemo(() => rutaActiva(pathname), [pathname]);
  
  // Estados para gestión de datos de usuario
  const [loading, setLoading] = useState(false);
  const [orgName, setOrgName] = useState<string>('');
  const { theme: nextTheme, setTheme: setNextTheme } = useTheme();
  const [userData, setUserData] = useState<{
    name?: string;
    email?: string;
    role?: string;
    avatar?: string;
  } | null>(null);
  
  // Estado para indicar recarga del perfil
  const [profileRefresh, setProfileRefresh] = useState(0);

  // Drawer del menú en móvil (lo abre el botón ☰ del header). El modo del
  // sidebar de escritorio y el panel de submenú los gestiona `SidebarShell`.
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  // Estado para controlar el panel del Asistente de IA
  const [aiAssistantOpen, setAiAssistantOpen] = useState(false);
  
  // Estado para almacenar el ID de la organización
  const [orgId, setOrgId] = useState<string | null>(null);

  
  // Estado para módulos activos de la organización (controla visibilidad del sidebar)
  const [activeModuleCodes, setActiveModuleCodes] = useState<string[] | undefined>(undefined);
  // Estado para páginas activas por módulo: { moduleCode: [pageHref, ...] }
  const [activeModulePages, setActiveModulePages] = useState<Record<string, string[]> | undefined>(undefined);
  // true si la carga de módulos falló (el menú cae a mostrar todos).
  const [modulosError, setModulosError] = useState(false);
  // Estado para acceso del cargo del usuario: null = sin restricciones
  const [jobPositionVisibleModules, setJobPositionVisibleModules] = useState<string[] | null | undefined>(undefined);
  const [jobPositionVisiblePages, setJobPositionVisiblePages] = useState<string[] | null | undefined>(undefined);

  // Cargar módulos activos cuando cambia la organización
  const loadActiveModuleCodes = useCallback(async (organizationId: string) => {
    try {
      const [modules, pages] = await Promise.all([
        moduleManagementService.getActiveModules(parseInt(organizationId)),
        moduleManagementService.getActiveModulePages(parseInt(organizationId)),
      ]);
      setActiveModuleCodes(modules.map(m => m.code));
      setActiveModulePages(pages);
      setModulosError(false);
    } catch (error) {
      console.error('Error cargando módulos activos:', error);
      setActiveModuleCodes(undefined);
      setActiveModulePages(undefined);
      setModulosError(true);
    }
  }, []);

  useEffect(() => {
    if (orgId) {
      loadActiveModuleCodes(orgId);
    }
  }, [orgId, loadActiveModuleCodes]);

  // Cargar acceso por cargo del usuario actual
  const loadJobPositionAccess = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId || !orgId) {
        setJobPositionVisibleModules(null);
        setJobPositionVisiblePages(null);
        return;
      }
      const access = await jobPositionModuleAccessService.getUserAccess(userId, parseInt(orgId));
      setJobPositionVisibleModules(access.visibleModules);
      setJobPositionVisiblePages(access.visiblePages);
    } catch (error) {
      console.error('Error cargando acceso por cargo:', error);
      setJobPositionVisibleModules(null);
      setJobPositionVisiblePages(null);
    }
  }, [orgId]);

  useEffect(() => {
    if (orgId) {
      loadJobPositionAccess();
    }
  }, [orgId, loadJobPositionAccess]);


  // Reintentar registro de dispositivo si quedó pendiente tras la redirección del login
  useEffect(() => {
    const pendingUserId = localStorage.getItem('pendingDeviceRegister');
    if (pendingUserId) {
      const retryRegister = async () => {
        try {
          await registerUserDevice(pendingUserId);
          console.log('✅ [AppLayout] Dispositivo registrado en reintento post-redirect');
        } catch (e) {
          console.warn('⚠️ [AppLayout] Reintento de registro de dispositivo falló:', e);
        } finally {
          localStorage.removeItem('pendingDeviceRegister');
        }
      };
      // Pequeño delay para que la sesión esté lista
      setTimeout(retryRegister, 2000);
    }
  }, []);

  // Registrar push token en móvil (Capacitor) cuando hay sesión y org
  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;

    const registerPush = async () => {
      const { isMobile } = await import('@/lib/utils/mobile');
      if (!isMobile() || cancelled) return;

      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId || cancelled) return;

      try {
        const { registerPushToken } = await import('@/lib/services/pushTokenService');
        await registerPushToken(userId);
        console.log('✅ [AppLayout] Push token registrado');
      } catch (e) {
        console.warn('⚠️ [AppLayout] Error registrando push token:', e);
      }
    };

    // Delay para que la sesión esté lista tras login
    const timer = setTimeout(registerPush, 3000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [orgId]);

  // Escuchar evento personalizado para refrescar módulos cuando se activan/desactivan
  useEffect(() => {
    const handleModulesRefresh = (event: Event) => {
      // Si el evento trae datos optimistas, aplicarlos inmediatamente
      const customEvent = event as CustomEvent;
      if (customEvent.detail) {
        if (customEvent.detail.activeModulePages) {
          setActiveModulePages(customEvent.detail.activeModulePages);
        }
        if (customEvent.detail.activeModuleCodes) {
          setActiveModuleCodes(customEvent.detail.activeModuleCodes);
        }
      }
      // Luego recargar desde DB para confirmar (solo si no hay detail)
      if (!customEvent.detail && orgId) {
        loadActiveModuleCodes(orgId);
        loadJobPositionAccess();
      }
    };
    window.addEventListener('modules-updated', handleModulesRefresh as EventListener);
    return () => window.removeEventListener('modules-updated', handleModulesRefresh as EventListener);
  }, [orgId, loadActiveModuleCodes, loadJobPositionAccess]);

  // Verificar estado de suscripción: redirigir si está cancelada
  // Solo se ejecuta cuando cambia orgId, no en cada navegación
  useEffect(() => {
    if (!orgId) return;

    const checkSubscriptionStatus = async () => {
      const allowedPaths = ['/app/organizacion/plan', '/app/plan', '/app/organizacion'];
      const isAllowed = allowedPaths.some(p => pathname?.startsWith(p) ?? false);
      if (isAllowed) return;

      const { data } = await supabase
        .from('subscriptions')
        .select('status')
        .eq('organization_id', orgId)
        .maybeSingle();

      if (data?.status === 'canceled') {
        console.warn('⚠️ Suscripción cancelada — redirigiendo a plan');
        router.replace('/app/organizacion/plan');
      }
    };

    checkSubscriptionStatus();
  }, [orgId, router]);

  // Función para cargar cache
  const loadFromCache = useCallback((): UserDataCache | null => {
    if (typeof window === 'undefined') return null;
    
    try {
      const cached = localStorage.getItem(USER_CACHE_KEY);
      if (!cached) return null;
      
      const parsedCache: UserDataCache = JSON.parse(cached);
      const now = Date.now();
      
      // Verificar si el cache ha expirado
      if (now - parsedCache.timestamp > CACHE_TTL) {
        localStorage.removeItem(USER_CACHE_KEY);
        return null;
      }
      
      return parsedCache;
    } catch (error) {
      console.error('Error al leer cache:', error);
      localStorage.removeItem(USER_CACHE_KEY);
      return null;
    }
  }, []);

  // Función para guardar en cache
  const saveToCache = useCallback((data: {
    name?: string;
    email?: string;
    role?: string;
    avatar?: string;
  }, orgName: string, orgId: string) => {
    if (typeof window === 'undefined') return;
    
    try {
      const cacheData: UserDataCache = {
        data,
        orgName,
        orgId,
        timestamp: Date.now()
      };
      localStorage.setItem(USER_CACHE_KEY, JSON.stringify(cacheData));
    } catch (error) {
      console.error('Error al guardar cache:', error);
    }
  }, []);

  // Función de fallback con consultas separadas
  const loadUserProfileFallback = useCallback(async (user: { id: string }, currentOrgId: number) => {
    try {
      console.log('🔄 Usando método fallback con consultas separadas');
      
      // Obtener perfil
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('first_name, last_name, email, avatar_url')
        .eq('id', user.id)
        .single();

      if (profileError) {
        console.error('Error al obtener perfil:', profileError);
        return;
      }

      // Obtener organización
      const { data: orgData } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', currentOrgId)
        .single();

      // Obtener rol del usuario
      const { data: userRoleData, error: roleError } = await supabase
        .from('organization_members')
        .select('role_id')
        .eq('user_id', user.id)
        .eq('organization_id', currentOrgId)
        .single();

      let roleName = 'Usuario';
      if (!roleError && userRoleData?.role_id) {
        const { data: roleData } = await supabase
          .from('roles')
          .select('name')
          .eq('id', userRoleData.role_id)
          .single();
        
        roleName = roleData?.name || 'Usuario';
      }

      const finalUserData = {
        name: `${profileData.first_name || ''} ${profileData.last_name || ''}`.trim() || profileData.email,
        email: profileData.email,
        role: roleName,
        avatar: profileData.avatar_url || ''
      };

      const finalOrgName = orgData?.name || '';

      setUserData(finalUserData);
      setOrgName(finalOrgName);
      
      // Guardar en cache también
      saveToCache(finalUserData, finalOrgName, currentOrgId.toString());

      // Sincronizar el nombre real del perfil con el selector de cuentas guardadas
      // (ver comentario equivalente en loadUserProfileOptimized).
      const { updateSavedAccountProfile } = await import('@/lib/auth/accountSwitcher');
      updateSavedAccountProfile(user.id, { name: finalUserData.name, avatarUrl: finalUserData.avatar });
      
    } catch (error) {
      console.error('Error en fallback:', error);
    }
  }, [saveToCache]);

  // Función optimizada para cargar perfil con consulta unificada
  const loadUserProfileOptimized = useCallback(async () => {
    try {
      setLoading(true);
      
      // Verificar autenticación
      const { isAuthenticated: isAuth, session } = await isAuthenticated();
      if (!isAuth || !session?.user) {
        console.log('No hay usuario autenticado');
        setLoading(false);
        return;
      }

      const user = session.user;
      let currentOrgId = getOrganizationId();

      // Intentar cargar desde cache PRIMERO, antes de cualquier consulta a la BD.
      // Si el cache es válido para la org actual, mostrarlo instantáneamente y
      // salir sin hacer ninguna consulta.
      const cachedData = loadFromCache();
      if (cachedData && cachedData.orgId === currentOrgId.toString()) {
        console.log('⚡ Datos cargados desde cache (sin consultas)');
        setUserData(cachedData.data);
        setOrgName(cachedData.orgName);
        setLoading(false);

        // Sincronizar el selector de cuentas en background (no bloquea)
        const { updateSavedAccountProfile } = await import('@/lib/auth/accountSwitcher');
        updateSavedAccountProfile(user.id, { name: cachedData.data.name, avatarUrl: cachedData.data.avatar });
        return;
      }

      // Si no hay org en localStorage, obtener last_org_id del perfil Y validar
      // membresía en paralelo (antes eran 3 consultas secuenciales).
      if (!currentOrgId || currentOrgId === 0) {
        const { data: profileOrg } = await supabase
          .from('profiles')
          .select('last_org_id')
          .eq('id', user.id)
          .single();
        
        if (profileOrg?.last_org_id) {
          currentOrgId = profileOrg.last_org_id;
          // Obtener nombre de la org para guardar en localStorage
          const { data: orgInfo } = await supabase
            .from('organizations')
            .select('name')
            .eq('id', currentOrgId)
            .single();
          guardarOrganizacionActiva({ id: currentOrgId, name: orgInfo?.name || '' });
          console.log('🔄 Org recuperada desde perfil:', currentOrgId);
        }
      }

      // Validación de membresía + consulta unificada en paralelo.
      // Antes eran 2-3 consultas secuenciales; ahora se hacen al mismo tiempo.
      const [memberCheck, unifiedResult] = await Promise.all([
        // Validar que el usuario sigue siendo miembro activo de la org
        currentOrgId && currentOrgId > 0
          ? supabase
              .from('organization_members')
              .select('organization_id')
              .eq('user_id', user.id)
              .eq('organization_id', currentOrgId)
              .eq('is_active', true)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        // Consulta unificada con JOIN
        currentOrgId && currentOrgId > 0
          ? supabase
              .from('profiles')
              .select(`
                first_name,
                last_name,
                email,
                avatar_url,
                organization_members!inner(
                  role_id,
                  is_super_admin,
                  organization_id,
                  organizations(
                    name
                  )
                )
              `)
              .eq('id', user.id)
              .eq('organization_members.organization_id', currentOrgId)
              .eq('organization_members.is_active', true)
              .single()
          : Promise.resolve({ data: null, error: { code: 'NO_ORG' } }),
      ]);

      // Si la org guardada no es válida, buscar la primera org activa
      if (currentOrgId && currentOrgId > 0 && !memberCheck.data) {
        const { data: fallbackMember } = await supabase
          .from('organization_members')
          .select('organization_id, organizations(id, name)')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .order('organization_id', { ascending: true })
          .limit(1)
          .maybeSingle();

        if (fallbackMember?.organization_id) {
          const validOrgId = fallbackMember.organization_id;
          const orgInfo = Array.isArray(fallbackMember.organizations)
            ? fallbackMember.organizations[0]
            : fallbackMember.organizations;
          console.warn(`⚠️ Org guardada (${currentOrgId}) no es válida, corrigiendo a: ${validOrgId}`);
          currentOrgId = validOrgId;
          guardarOrganizacionActiva({ id: validOrgId, name: orgInfo?.name || '' });
          try { localStorage.removeItem('appLayout_userData_cache'); } catch {}
          // Reintentar la consulta unificada con la org correcta
          const { data: retryData, error: retryError } = await supabase
            .from('profiles')
            .select(`
              first_name, last_name, email, avatar_url,
              organization_members!inner(role_id, is_super_admin, organization_id, organizations(name))
            `)
            .eq('id', user.id)
            .eq('organization_members.organization_id', currentOrgId)
            .eq('organization_members.is_active', true)
            .single();
          if (retryError || !retryData) {
            await loadUserProfileFallback(user, currentOrgId);
            return;
          }
          // Procesar retryData igual que unifiedData abajo
          const member = Array.isArray(retryData.organization_members) ? retryData.organization_members[0] : retryData.organization_members;
          const organization = Array.isArray(member.organizations) ? member.organizations[0] : member.organizations;
          let roleName = 'Usuario';
          if (member.role_id) {
            const { data: roleData } = await supabase.from('roles').select('name').eq('id', member.role_id).single();
            roleName = roleData?.name || 'Usuario';
          }
          const finalUserData = {
            name: `${retryData.first_name || ''} ${retryData.last_name || ''}`.trim() || retryData.email,
            email: retryData.email,
            role: roleName,
            avatar: retryData.avatar_url || ''
          };
          const finalOrgName = organization?.name || '';
          setUserData(finalUserData);
          setOrgName(finalOrgName);
          setOrgId(currentOrgId.toString());
          saveToCache(finalUserData, finalOrgName, currentOrgId.toString());
          const { updateSavedAccountProfile } = await import('@/lib/auth/accountSwitcher');
          updateSavedAccountProfile(user.id, { name: finalUserData.name, avatarUrl: finalUserData.avatar });
          setLoading(false);
          return;
        } else {
          console.warn('⚠️ Usuario no tiene ninguna organización activa');
          currentOrgId = 0;
        }
      }

      setOrgId(currentOrgId.toString());

      const unifiedData = unifiedResult.data;
      const unifiedError = unifiedResult.error as { code?: string; message?: string } | null;

      if (unifiedError) {
        console.warn('Consulta unificada falló, usando fallback:', unifiedError.code || unifiedError.message || 'unknown');

        if (unifiedError.code === 'PGRST116') {
          const { data: memberData } = await supabase
            .from('organization_members')
            .select('organization_id, organizations(id, name)')
            .eq('user_id', user.id)
            .eq('is_active', true)
            .limit(1)
            .single();

          if (memberData?.organization_id && memberData.organization_id !== currentOrgId) {
            const validOrgId = memberData.organization_id;
            const orgInfo = Array.isArray(memberData.organizations)
              ? memberData.organizations[0]
              : memberData.organizations;
            console.log(`🔄 Org inválida (${currentOrgId}), corrigiendo a: ${validOrgId}`);
            currentOrgId = validOrgId;
            guardarOrganizacionActiva({ id: validOrgId, name: orgInfo?.name || '' });
            setOrgId(validOrgId.toString());
          }
        }

        await loadUserProfileFallback(user, currentOrgId);
        return;
      }

      if (!unifiedData || !unifiedData.organization_members) {
        console.warn('No se encontraron datos del usuario en la organización');
        await loadUserProfileFallback(user, currentOrgId);
        return;
      }

      const member = Array.isArray(unifiedData.organization_members) 
        ? unifiedData.organization_members[0] 
        : unifiedData.organization_members;
      
      const organization = Array.isArray(member.organizations)
        ? member.organizations[0]
        : member.organizations;
      
      // Obtener nombre del rol con consulta separada (más confiable)
      let roleName = 'Usuario';
      if (member.role_id) {
        const { data: roleData } = await supabase
          .from('roles')
          .select('name')
          .eq('id', member.role_id)
          .single();
        
        roleName = roleData?.name || 'Usuario';
      }

      const finalUserData = {
        name: `${unifiedData.first_name || ''} ${unifiedData.last_name || ''}`.trim() || unifiedData.email,
        email: unifiedData.email,
        role: roleName,
        avatar: unifiedData.avatar_url || ''
      };

      const finalOrgName = organization?.name || '';
      
      console.log('✅ Datos cargados exitosamente:', {
        user: finalUserData.name,
        role: finalUserData.role,
        org: finalOrgName
      });

      setUserData(finalUserData);
      setOrgName(finalOrgName);
      
      saveToCache(finalUserData, finalOrgName, currentOrgId.toString());

      const { updateSavedAccountProfile } = await import('@/lib/auth/accountSwitcher');
      updateSavedAccountProfile(user.id, { name: finalUserData.name, avatarUrl: finalUserData.avatar });
      
    } catch (error) {
      console.error('Error general al cargar perfil:', error);
    } finally {
      setLoading(false);
    }
  }, [loadFromCache, saveToCache, loadUserProfileFallback]);

  // Cargar datos del perfil del usuario y configurar suscripción
  useEffect(() => {
    loadUserProfileOptimized();
    
    // Configurar canal de suscripción para cambios en el perfil.
    // NOTA: No incluir profileRefresh en las dependencias — el callback
    // del subscription lo incrementa, creando un bucle de re-suscripciones
    // que satura el pool de conexiones Realtime de Postgres.
    let subscription: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    
    const setupProfileSubscription = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const userId = session?.user?.id;
        
        if (!userId || cancelled) {
          return;
        }
        
        subscription = supabase
          .channel('public:profiles')
          .on('postgres_changes', 
            { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
            () => {
              // Actualizar al detectar cambios
              setProfileRefresh(prev => prev + 1);
            }
          )
          .subscribe();
      } catch (error) {
        console.error('Error setting up profile subscription:', error);
      }
    };
    
    setupProfileSubscription();
    
    return () => {
      cancelled = true;
      if (subscription) {
        supabase.removeChannel(subscription);
      }
    };
  }, [loadUserProfileOptimized]);
  
  // Recargar el perfil cuando cambia (Realtime sobre `profiles`) o cuando cambia
  // la organización. Antes `profileRefresh` subía pero solo lo leía el logo de
  // la tarjeta de organización del sidebar: el nombre y el rol no se
  // actualizaban hasta recargar la página.
  useEffect(() => {
    if (profileRefresh === 0) return;
    try {
      localStorage.removeItem(USER_CACHE_KEY);
    } catch {
      // sin almacenamiento: no hay caché que invalidar
    }
    loadUserProfileOptimized();
  }, [profileRefresh, loadUserProfileOptimized]);

  // Sincronizar tema desde Supabase (preferencia del usuario) al cargar
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Sincronizar tema desde Supabase en background
    // Resetear bandera de override manual antes de iniciar la sync
    themeService.resetUserOverride();
    themeService.syncTheme().then((syncedTheme) => {
      // syncTheme retorna null si el usuario cambió el tema manualmente
      // mientras la sincronización estaba en curso; en ese caso no sobrescribir.
      if (syncedTheme) {
        setNextTheme(syncedTheme);
      }
    });
    // NOTA: este efecto debe correr SOLO al montar. Si se incluye
    // setNextTheme en las dependencias, next-themes 0.4.x cambia la
    // identidad de setTheme en cada cambio de tema (useCallback con
    // dep [theme]), lo que re-dispara la sync, resetea el override
    // manual y revierte la elección del usuario (titileo doble).

    // Obtener nombre de organización
    const storedOrgName = localStorage.getItem('currentOrganizationName');
    if (storedOrgName) {
      setOrgName(storedOrgName);
    }

    // Obtener ID de organización
    const storedOrgId = localStorage.getItem('currentOrganizationId');
    setOrgId(storedOrgId);

    // Fallback PWA iOS: si no hay orgId en localStorage (storage separado en
    // PWA standalone), intentar cargarlo desde la sesión de Supabase.
    if (!storedOrgId) {
      (async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session?.user?.id) return;
          // Buscar la organización activa del usuario
          const { data: member } = await supabase
            .from('organization_members')
            .select('organization_id, organizations(id, name, subdomain)')
            .eq('user_id', session.user.id)
            .eq('is_active', true)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();
          if (member?.organization_id && member?.organizations) {
            // PostgREST devuelve el embed como objeto (FK muchos-a-uno).
            const org = member.organizations as unknown as { id: number; name?: string | null; subdomain?: string | null };
            const orgIdStr = org.id.toString();
            // Persistir para futuras cargas. guardarOrganizacionActiva escribe
            // todas las claves y cookies, y ya emite 'organization-changed'.
            guardarOrganizacionActiva({
              id: Number(org.id),
              name: org.name || undefined,
              subdomain: org.subdomain || undefined,
            });
            if (org.subdomain) localStorage.setItem('organization', org.subdomain);
            setOrgId(orgIdStr);
            if (org.name) setOrgName(org.name);
          }
        } catch (e) {
          console.error('[AppLayout] Fallback orgId desde sesión falló:', e);
        }
      })();
    }

    // Escuchar cambios de organización sin recargar la página
    const handleOrgChange = () => {
      const newOrgId = localStorage.getItem('currentOrganizationId');
      const newOrgName = localStorage.getItem('currentOrganizationName');
      setOrgId(newOrgId);
      if (newOrgName) setOrgName(newOrgName);
      // Forzar recarga del perfil y módulos con la nueva org
      setProfileRefresh(prev => prev + 1);
    };
    window.addEventListener('organization-changed', handleOrgChange);

    return () => {
      window.removeEventListener('organization-changed', handleOrgChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Función para cerrar sesión (memoizada)
  const handleSignOut = useCallback(async () => {
    try {
      setLoading(true);
      
      console.log('Cerrando sesión...');
      
      // Limpiar TODO el estado relacionado con la organización y el usuario
      localStorage.removeItem(USER_CACHE_KEY);
      localStorage.removeItem('organizacionActiva');
      localStorage.removeItem('currentOrganizationId');
      localStorage.removeItem('currentOrganizationName');
      localStorage.removeItem('currentBranchId');
      localStorage.removeItem('userRole');
      localStorage.removeItem('supabase.auth.token');
      // No eliminar rememberMe ni userEmail para que el "recuérdame" funcione en el próximo login
      
      // Limpiar sessionStorage
      sessionStorage.removeItem('organizacionActiva');
      sessionStorage.removeItem('currentBranchId');
      
      // Cargar dependencias en paralelo (antes eran 3 imports secuenciales)
      const [orgMod, accountMod, configMod] = await Promise.all([
        import('@/lib/hooks/useOrganization'),
        import('@/lib/auth/accountSwitcher'),
        import('@/lib/supabase/config'),
      ]);
      
      // Invalidar caché en memoria de branch_id
      orgMod.invalidateBranchIdCache();
      
      // Quitar esta cuenta del selector de cuentas (ya no debe ofrecerse
      // para cambio instantáneo, pues su sesión se está cerrando)
      const activeAccountId = accountMod.getActiveAccountUserId();
      if (activeAccountId) accountMod.removeSavedAccount(activeAccountId);
      
      // Cerrar sesión en Supabase con timeout: si la red está lenta,
      // no bloquear al usuario. La limpieza local ya se hizo arriba
      // y el middleware no encontrará la cookie, así que el redirect
      // a /auth/login funciona igual.
      try {
        await Promise.race([
          configMod.signOut(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('SIGNOUT_TIMEOUT')), 5000)
          ),
        ]);
      } catch (signOutErr) {
        // No bloquear el logout si signOut falla o tarda demasiado.
        // La sesión local ya se limpió; el server invalidará el token
        // cuando expire o en el próximo login.
        console.warn('signOut lento/fallido, continuando logout:', signOutErr);
      }
      
      console.log('Sesión cerrada exitosamente');
      
      // Redireccionar a login (usar replace para no volver atrás)
      window.location.replace('/auth/login');
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
      // Aun en error, redirigir a login para no dejar al usuario pegado
      window.location.replace('/auth/login');
    } finally {
      setLoading(false);
    }
  }, []);

  // Función para alternar el tema (memoizada) - usa next-themes + sync Supabase
  const toggleTheme = useCallback(() => {
    const currentResolved = nextTheme === 'dark' ? 'dark' : 'light';
    const newTheme = currentResolved === 'light' ? 'dark' : 'light';
    // Actualizar cache local inmediatamente y marcar override manual
    // para que una syncTheme pendiente no revierta la elección del usuario.
    themeService.setLocalTheme(newTheme);
    themeService.markUserOverride();
    setNextTheme(newTheme);
    // Guardar en Supabase (persistencia entre dispositivos) - fire and forget
    themeService.setRemoteTheme(newTheme);
  }, [nextTheme, setNextTheme]);

  // Función para invalidar cache manualmente (reservada para uso futuro)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _invalidateUserCache = useCallback(() => {
    localStorage.removeItem(USER_CACHE_KEY);
    setProfileRefresh(prev => prev + 1);
  }, []);

  // Qué parte del catálogo ve esta persona: módulos y páginas activos de la
  // organización, acceso del cargo y capacidades calculadas en el servidor
  // (`/api/me/capacidades`: nada se decide por el nombre del rol).
  const { datos: capacidades, navegacion: capacidadesNav } = useCapacidades();
  // Admin según el servidor (is_super_admin o rol 1/2), no por consulta propia:
  // controla, por ejemplo, ModuleLimitNotification.
  const isOrgAdmin = capacidades?.esAdmin ?? false;
  const seccionesNav = useMemo(() => {
    // Si la carga de módulos falla se muestran todos (como hacía el sidebar
    // viejo): ocultar el menú entero dejaría a la persona sin salida, y la
    // barrera real de acceso es la RLS, no el menú.
    const todos = CATALOGO_NAV.map((m) => m.codigo).filter((c): c is string => c !== null);
    return filtrarNavegacion({
      modulosActivos: activeModuleCodes ?? (modulosError ? todos : []),
      paginasActivas: activeModulePages ?? {},
      modulosCargo: jobPositionVisibleModules ?? null,
      paginasCargo: jobPositionVisiblePages ?? null,
      capacidades: capacidadesNav,
    });
  }, [activeModuleCodes, activeModulePages, jobPositionVisibleModules, jobPositionVisiblePages, capacidadesNav, modulosError]);
  // Páginas del buscador global: las mismas que el menú deja ver.
  const paginasBuscables = useMemo<PaginaBuscable[]>(
    () =>
      seccionesNav.flatMap((s) =>
        s.modulos.flatMap((m) =>
          m.paginas
            .filter((p) => p.enMenu !== false)
            .map((p) => ({ id: p.href, name: p.nombre, url: p.href, description: tNav(m.modulo.etiqueta) }))
        )
      ),
    [seccionesNav, tNav]
  );
  // Sin organización no hay módulos que esperar: solo «Inicio».
  const cargandoNav = !!orgId && !modulosError && (activeModuleCodes === undefined || jobPositionVisibleModules === undefined);

  // Si estamos en la página de cuenta congelada, renderizar sin layout (sin sidebar/header)
  if (pathname?.startsWith('/app/cuenta-congelada')) {
    return <>{children}</>;
  }

  return (
    <ModuleProvider>
      <SoftphoneProvider enabled={activeModuleCodes?.includes('crm') ?? false}>
      <BranchProvider>
      {/* Barra de progreso de navegación - feedback visual inmediato */}
      <NavigationProgress />
      {/* Indicador offline para app de escritorio */}
      <OfflineIndicator />
      
      <div className="flex h-dynamic-screen overflow-hidden">
      {/* Sidebar, panel de submenú y drawer móvil (src/components/shell/sidebar). */}
      <SidebarShell
        pathname={pathname}
        secciones={seccionesNav}
        cargando={cargandoNav}
        activa={rutaNav}
        drawerAbierto={sidebarOpen}
        onCerrarDrawer={() => setSidebarOpen(false)}
        usuario={userData}
        organizacion={orgName}
        tema={nextTheme === 'dark' ? 'dark' : 'light'}
        onAlternarTema={toggleTheme}
        onCerrarSesion={handleSignOut}
        cerrandoSesion={loading}
        accionesDrawer={
          <button
            type="button"
            onClick={() => {
              setSidebarOpen(false);
              abrirReportarProblema();
            }}
            className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-fg-secondary hover:bg-hover"
          >
            <Bug className="h-5 w-5" aria-hidden="true" />
            {tHeader('reportProblem')}
          </button>
        }
      />
      
      {/* Área de contenido principal */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Header del panel de administración */}
        <AppHeader
          organizacionId={orgId}
          organizacionNombre={orgName}
          correo={userData?.email ?? null}
          pathname={pathname}
          secciones={seccionesNav}
          paginasBuscables={paginasBuscables}
          asistenteAbierto={aiAssistantOpen}
          onAlternarAsistente={() => setAiAssistantOpen(!aiAssistantOpen)}
          onAbrirMenu={() => setSidebarOpen(true)}
        />
        
        {/* Contenido principal con scroll */}
        {/* En móvil deja sitio a la barra inferior (MobileTabBar, 64 px + zona segura). */}
        <div className="flex-1 overflow-y-auto bg-canvas overscroll-contain min-w-0 pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0">
          <div className="h-full min-w-0 w-full">
            {/* Desktop sin red (fase 4C): «Estás viendo datos locales del hh:mm» en todos los módulos. */}
            <LocalDataNotice className="mx-4 mt-3 sm:mx-6 lg:mx-8" />
            {subscriptionChecked ? children : (
              <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-full">
                <PageHeaderSkeleton />
                <StatsSkeleton count={4} />
                <CardListSkeleton cards={3} columns="1" />
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Panel del Asistente de IA - al lado derecho */}
      <AIAssistantPanel 
        isOpen={aiAssistantOpen}
        onToggle={() => setAiAssistantOpen(!aiAssistantOpen)}
        context={{
          organizationId: orgId ? parseInt(orgId) : 0,
          organizationName: orgName,
          userName: userData?.name || userData?.email?.split('@')[0] || 'Usuario',
          userRole: userData?.role || 'Empleado',
        } as AssistantContext}
      />
      
      {/* Botón flotante para abrir el panel de IA cuando está cerrado */}
      {!aiAssistantOpen && (
        <button
          onClick={() => setAiAssistantOpen(true)}
          className="hidden lg:flex items-center justify-center h-10 w-10 bg-brand-action hover:bg-brand-action-hover text-fg-on-brand rounded-l-lg shadow-lg transition-colors fixed right-0 top-1/2 -translate-y-1/2 z-40"
          aria-label={tHeader('openAssistant')}
          title={tHeader('assistant')}
        >
          <Bot size={20} />
        </button>
      )}
      
      {/* Notificación de límites de módulos (solo visible para el administrador de la organización) */}
      {isOrgAdmin && (
        <ModuleLimitNotification 
          organizationId={orgId ? parseInt(orgId) : undefined}
        />
      )}

      {/* Telefonia: el SoftphoneProvider ya está activo arriba con
          `enabled={activeModuleCodes?.includes('crm')}`. Aquí solo se montan
          el dock y el toast, también condicionados al CRM. `activeModuleCodes`
          es `undefined` mientras carga, y en ese caso no se pinta nada: mostrar
          el boton flotante y esconderlo despues daria un parpadeo en cada carga
          de pagina. */}
      {activeModuleCodes?.includes('crm') && (
        <>
          <SoftphoneDock />
          <IncomingCallToast />
        </>
      )}

      </div>
      </BranchProvider>
      </SoftphoneProvider>
    </ModuleProvider>
  );
};
