'use client';
import React, { useState, useEffect, useMemo } from 'react';
import { Menu, ChevronsLeft, ChevronsRight, Building2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import { isAuthenticated } from '@/lib/supabase/auth-manager';
import { AppHeader } from './Header/AppHeader';
import { SidebarNavigation } from './Sidebar/SidebarNavigation';

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
  
  // Estados para control del sidebar
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  
  // Estado para almacenar el ID de la organización
  const [orgId, setOrgId] = useState<string | null>(null);
  
  // Cargar datos del perfil del usuario
  useEffect(() => {
    async function loadUserProfile() {
      try {
        // Verificar autenticación
        const { isAuthenticated: isAuth, session } = await isAuthenticated();
        if (!isAuth || !session?.user) {
          console.log('No hay usuario autenticado');
          return;
        }
        
        const user = session.user;
        
        // Obtener datos del perfil
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();
          
        if (profileError) {
          console.error('Error al obtener perfil:', profileError);
          throw profileError;
        }
        
        // Verificar organización activa
        const currentOrgId = localStorage.getItem('currentOrganizationId');
        if (!currentOrgId) {
          console.log('No hay organización seleccionada');
          return;
        }
        
        // Obtener rol del usuario
        const { data: userRoleData, error: roleError } = await supabase
          .from('organization_members')
          .select('role')
          .eq('user_id', user.id)
          .eq('organization_id', currentOrgId)
          .single();
          
        if (roleError) {
          console.error('Error al obtener rol:', roleError);
          // Continuar aunque no tengamos el rol
        }
        
        // Actualizar el estado del userData
        setUserData({
          name: profileData?.full_name || `${profileData?.first_name || ''} ${profileData?.last_name || ''}`,
          email: user.email,
          role: userRoleData?.role,
          avatar: profileData?.avatar_url
        });
      } catch (error) {
        console.error('Error al cargar datos del perfil:', error);
      }
    }
    
    loadUserProfile();
    
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
  }, [profileRefresh]);
  
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
  
  // Función para cambiar el tema
  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    
    console.log('Tema cambiado a:', newTheme);
  };
  
  // Función para cerrar sesión
  const handleSignOut = async (): Promise<void> => {
    try {
      setLoading(true);
      // Ejecutar la función de cierre de sesión
      const { error } = await signOut();
      
      if (error) {
        console.error('Error al cerrar sesión con Supabase:', error);
        throw error;
      }
      
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
  };
  
  // Importación dinámica de la función signOut
  const [signOut, setSignOut] = useState<() => Promise<any>>(async () => {
    console.log('Función de cierre de sesión no disponible');
    return { error: null };
  });

  useEffect(() => {
    // Importar dinámicamente para evitar errores de referencia circular
    import('@/lib/supabase/config').then((module) => {
      setSignOut(() => module.signOut);
    });
  }, []);
  
  return (
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
          
          {/* Información de la organización */}
          {orgName && (
            <div className={`m-3 p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg shadow-sm border border-blue-100 dark:border-blue-800 ${sidebarCollapsed ? 'lg:relative lg:group' : ''}`}>
              <div className="relative">
                <p className="text-sm font-medium text-blue-900 dark:text-blue-100 flex items-center">
                  <Building2 size={16} className={`${sidebarCollapsed ? 'lg:mx-auto' : 'mr-2'}`} />
                  {!sidebarCollapsed && orgName}
                  {sidebarCollapsed && <span className="lg:hidden">{orgName}</span>}
                </p>
                
                {/* Tooltip para mostrar el nombre de la organización cuando está contraído */}
                {sidebarCollapsed && (
                  <div className="absolute left-full top-1/2 transform -translate-y-1/2 ml-2 pl-2 hidden lg:group-hover:block z-50 whitespace-nowrap">
                    <div className="bg-gray-800 text-white text-sm py-1 px-3 rounded shadow-lg flex items-center">
                      <Building2 size={16} className="mr-2" />
                      {orgName}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* Navegación */}
          <div className="flex-1 overflow-y-auto p-2">
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
      
      {/* Botón de menú hamburguesa para mostrar sidebar en móvil */}
      <button 
        onClick={() => setSidebarOpen(true)}
        className="fixed top-4 left-4 z-40 lg:hidden p-2 rounded-md bg-blue-600 text-white shadow-lg hover:bg-blue-700 transition-colors"
        aria-label="Abrir menú"
        title="Abrir menú"
      >
        <Menu size={24} />
      </button>
      
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
        />
        
        {/* Contenido principal */}
        <div className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900">
          {children}
        </div>
      </div>
    </div>
  );
};
