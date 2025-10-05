'use client';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Menu, ChevronsLeft, ChevronsRight, Building2 } from 'lucide-react';
import { OrganizationSelectorWrapper } from './OrganizationSelectorWrapper';
import { supabase } from '@/lib/supabase/config';
import { isAuthenticated } from '@/lib/supabase/auth-manager';
import { getUserData } from '@/lib/services/userService';
import { AppHeader } from './Header/AppHeader';
import { SidebarNavigation } from './Sidebar/SidebarNavigation';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

// Importaciones estándar para evitar ChunkLoadError
import ModuleLimitNotification from '@/components/notifications/ModuleLimitNotification';
import { ModuleProvider } from '@/lib/context/ModuleContext';

// Función helper para obtener URL del logo
const getOrganizationLogoUrl = (logoPath: string) => {
  if (!logoPath) return null;
  // Si ya es una URL completa, retornarla
  if (logoPath.startsWith('http')) return logoPath;
  // Si es una ruta relativa, construir la URL completa
  return `/api/files/${logoPath}`;
};

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
  // Estados para gestión de datos de usuario y tema
  const [loading, setLoading] = useState(false);
  const [orgName, setOrgName] = useState<string>('');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [userData, setUserData] = useState<{
    name?: string;
    email?: string;
    role?: string;
    avatar?: string;
  } | null>(null);
  
  // Estado para indicar recarga del perfil
  const [profileRefresh, setProfileRefresh] = useState(0);
  
  // Helper function para obtener el logo de la organización activa
  const getActiveOrgLogo = () => {
    try {
      const orgData = localStorage.getItem('organizacionActiva');
      if (orgData) {
        const org = JSON.parse(orgData);
        return org.logo_url ? getOrganizationLogoUrl(org.logo_url) : null;
      }
    } catch (error) {
      console.error('Error parsing organization data:', error);
    }
    return null;
  };
  
  // Estados para control del sidebar
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true); // Colapsado por defecto
  
  // Estado para almacenar el ID de la organización
  const [orgId, setOrgId] = useState<string | null>(null);
  

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
      const currentOrgId = getOrganizationId();
      setOrgId(currentOrgId.toString());

      // Intentar cargar desde cache primero
      const cachedData = loadFromCache();
      if (cachedData && cachedData.orgId === currentOrgId.toString()) {
        console.log('⚡ Datos cargados desde cache');
        setUserData(cachedData.data);
        setOrgName(cachedData.orgName);
        setLoading(false);
        return;
      }

      console.log('🔄 Cargando perfil optimizado para usuario:', user.id);
      
      // Consulta unificada con JOIN para obtener todos los datos de una vez
      const { data: unifiedData, error: unifiedError } = await supabase
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
            organizations!inner(
              name
            ),
            roles!inner(
              name
            )
          )
        `)
        .eq('id', user.id)
        .eq('organization_members.organization_id', currentOrgId)
        .eq('organization_members.is_active', true)
        .single();

      if (unifiedError) {
        console.error('Error en consulta unificada:', unifiedError);
        // Fallback a consultas separadas si falla el JOIN
        await loadUserProfileFallback(user, currentOrgId);
        return;
      }

      if (!unifiedData || !unifiedData.organization_members) {
        console.warn('No se encontraron datos del usuario en la organización');
        await loadUserProfileFallback(user, currentOrgId);
        return;
      }

      // Procesar datos unificados
      const member = Array.isArray(unifiedData.organization_members) 
        ? unifiedData.organization_members[0] 
        : unifiedData.organization_members;
      
      const organization = Array.isArray(member.organizations)
        ? member.organizations[0]
        : member.organizations;
      
      const role = Array.isArray(member.roles)
        ? member.roles[0]
        : member.roles;

      const finalUserData = {
        name: `${unifiedData.first_name || ''} ${unifiedData.last_name || ''}`.trim() || unifiedData.email,
        email: unifiedData.email,
        role: role?.name || 'Usuario',
        avatar: unifiedData.avatar_url || ''
      };

      const finalOrgName = organization?.name || '';
      
      console.log('✅ Datos cargados exitosamente:', {
        user: finalUserData.name,
        role: finalUserData.role,
        org: finalOrgName
      });

      // Actualizar estados
      setUserData(finalUserData);
      setOrgName(finalOrgName);
      
      // Guardar en cache
      saveToCache(finalUserData, finalOrgName, currentOrgId.toString());
      
    } catch (error) {
      console.error('Error general al cargar perfil:', error);
    } finally {
      setLoading(false);
    }
  }, [loadFromCache, saveToCache]);

  // Función de fallback con consultas separadas
  const loadUserProfileFallback = useCallback(async (user: any, currentOrgId: number) => {
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
      const { data: orgData, error: orgError } = await supabase
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
      
    } catch (error) {
      console.error('Error en fallback:', error);
    }
  }, [saveToCache]);

  // Cargar datos del perfil del usuario y configurar suscripción
  useEffect(() => {
    loadUserProfileOptimized();
    
    // Configurar canal de suscripción para cambios en el perfil
    const profileSubscription = supabase
      .channel('public:profiles')
      .on('postgres_changes', 
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${supabase.auth.getSession().then(res => res.data.session?.user.id)}` },
        () => {
          // Actualizar al detectar cambios
          setProfileRefresh(prev => prev + 1);
        }
      )
      .subscribe();
      
    return () => {
      // Limpiar suscripción
      supabase.removeChannel(profileSubscription);
    };
  }, [loadUserProfileOptimized, profileRefresh]);
  
  // Inicializar tema desde localStorage o preferencia del sistema
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Verificar preferencia guardada
      const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
      
      if (savedTheme) {
        setTheme(savedTheme);
        if (savedTheme === 'dark') {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      } else {
        // Usar preferencia del sistema
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        setTheme(prefersDark ? 'dark' : 'light');
        
        if (prefersDark) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
        
        // Guardar la preferencia
        localStorage.setItem('theme', prefersDark ? 'dark' : 'light');
      }
      
      // Obtener nombre de organización
      const storedOrgName = localStorage.getItem('currentOrganizationName');
      if (storedOrgName) {
        setOrgName(storedOrgName);
      }
      
      // Obtener ID de organización
      const storedOrgId = localStorage.getItem('currentOrganizationId');
      setOrgId(storedOrgId);
    }
  }, []);
  
  // Importación dinámica de la función signOut (memoizada)
  const signOut = useMemo(() => {
    let signOutFn: () => Promise<any> = async () => {
      console.log('Función de cierre de sesión no disponible');
      return { error: null };
    };
    
    // Importar dinámicamente para evitar errores de referencia circular
    import('@/lib/supabase/config').then((module) => {
      signOutFn = module.signOut;
    });
    
    return signOutFn;
  }, []);

  // Función para cerrar sesión (memoizada)
  const handleSignOut = useCallback(async () => {
    try {
      setLoading(true);
      
      console.log('Cerrando sesión...');
      
      // Limpiar cache del usuario
      localStorage.removeItem(USER_CACHE_KEY);
      
      // Importar dinámicamente la función signOut para evitar referencias circulares
      const { signOut } = await import('@/lib/supabase/config');
      const { error } = await signOut();
      
      if (error) {
        console.error('Error al cerrar sesión:', error);
        return;
      }
      
      console.log('Sesión cerrada exitosamente');
      
      // Limpiar localStorage
      localStorage.removeItem('currentOrganizationId');
      localStorage.removeItem('currentOrganizationName');
      localStorage.removeItem('userRole');
      localStorage.removeItem('supabase.auth.token');
      
      // Redireccionar a login
      window.location.replace('/auth/login');
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    } finally {
      setLoading(false);
    }
  }, [signOut]);

  // Función para alternar el tema (memoizada)
  const toggleTheme = useCallback(() => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
  }, [theme]);

  // Función para invalidar cache manualmente
  const invalidateUserCache = useCallback(() => {
    localStorage.removeItem(USER_CACHE_KEY);
    setProfileRefresh(prev => prev + 1);
  }, []);

  
  return (
    <ModuleProvider>
      <div className="flex h-screen">
      {/* Sidebar - con versión móvil que se muestra/oculta */}
      <div className={`
        fixed lg:static inset-y-0 left-0 z-50 ${sidebarCollapsed ? 'lg:w-20' : 'w-64'} 
        transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} 
        lg:translate-x-0 transition-all duration-300 ease-in-out
        bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 shadow-lg
      `}>
        <div className="flex flex-col h-full">
          {/* Logo y nombre */}
          <div className="flex justify-between items-center p-4 bg-blue-600">
            <h1 className={`text-xl font-bold text-white ${sidebarCollapsed ? 'lg:hidden' : ''}`}>GO Admin ERP</h1>
            {sidebarCollapsed && <h1 className="hidden lg:block text-xl font-bold text-white text-center">GO</h1>}
            <div className="flex items-center">
              {/* Botón para contraer/expandir en escritorio */}
              <button 
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="hidden lg:flex items-center justify-center h-7 w-7 rounded-full bg-blue-700 text-white hover:bg-blue-800 transition-colors"
                aria-label={sidebarCollapsed ? 'Expandir menú' : 'Contraer menú'}
              >
                {sidebarCollapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
              </button>
              
              {/* Botón para cerrar en móvil */}
              <button 
                onClick={() => setSidebarOpen(false)}
                className="lg:hidden ml-2 text-white"
              >
                &times;
              </button>
            </div>
          </div>
          
          {/* Selector de Organización */}
          {orgId && (
            <div className={`m-3 ${sidebarCollapsed ? 'p-2 lg:relative lg:group' : 'p-3'} bg-blue-50 dark:bg-blue-900/30 rounded-lg shadow-md border border-blue-100 dark:border-blue-800 transition-all duration-200 hover:shadow-lg`}>
              {/* Organización para sidebar colapsado */}
              {sidebarCollapsed && (
                <>
                  {/* Icono/Logo centrado cuando está colapsado */}
                  <div className="flex justify-center items-center">
                    {getActiveOrgLogo() ? (
                      <div className="w-7 h-7 lg:mx-auto">
                        <img 
                          src={getActiveOrgLogo()!}
                          alt="Logo"
                          className="w-full h-full object-cover rounded-full border-2 border-blue-200 dark:border-blue-700 shadow-sm"
                        />
                      </div>
                    ) : (
                      <div className="w-7 h-7 lg:mx-auto flex items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-700 dark:from-blue-600 dark:to-blue-900 text-white font-medium shadow-sm border-2 border-blue-200 dark:border-blue-700">
                        {orgName && orgName.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="ml-2 lg:hidden text-sm font-medium text-blue-900 dark:text-blue-100">{orgName}</span>
                  </div>
                  
                  {/* Tooltip para mostrar el nombre de la organización cuando está contraído */}
                  <div className="absolute left-full top-1/2 transform -translate-y-1/2 ml-2 pl-2 hidden lg:group-hover:block z-50 whitespace-nowrap">
                    <div className="bg-gray-800 text-white text-sm py-1 px-3 rounded shadow-lg flex items-center">
                      {getActiveOrgLogo() ? (
                        <img 
                          src={getActiveOrgLogo()!}
                          alt="Logo"
                          className="w-5 h-5 rounded-full mr-2 object-cover border border-gray-300 dark:border-gray-700 shadow-sm"
                        />
                      ) : (
                        <div className="w-5 h-5 mr-2 flex items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-white text-xs font-medium shadow-sm border border-gray-300 dark:border-gray-700">
                          {orgName && orgName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      {orgName}
                    </div>
                  </div>
                </>
              )}
              
              {/* Selector de organizaciones (solo visible cuando no está colapsado) */}
              {!sidebarCollapsed && (
                <OrganizationSelectorWrapper 
                  className="w-full" 
                  showCreateOption={true} 
                />
              )}
            </div>
          )}
          
          {/* Navegación */}
          <div className="flex-1 overflow-y-auto">
            <SidebarNavigation 
              handleSignOut={handleSignOut}
              loading={loading}
              userData={userData}
              orgName={orgName}
              collapsed={sidebarCollapsed}
            />
          </div>
        </div>
      </div>
      
      {/* Área de contenido principal */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header del panel de administración */}
        <AppHeader 
          theme={theme}
          toggleTheme={toggleTheme}
          userData={userData}
          orgId={orgId}
          handleSignOut={handleSignOut}
          loading={loading}
          setSidebarOpen={setSidebarOpen}
        />
        
        {/* Contenido principal */}
        <div className="flex-1 overflow-hidden bg-gray-50 dark:bg-gray-900 h-full">
          {children}
        </div>
      </div>
      
      {/* Notificación de límites de módulos */}
      <ModuleLimitNotification 
        organizationId={orgId ? parseInt(orgId) : undefined}
      />

      </div>
    </ModuleProvider>
  );
};
