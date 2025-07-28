'use client';
import Link from 'next/link';
import Image from 'next/image'; // Importación del componente Image de Next.js
import { signOut, supabase } from '@/lib/supabase/config';
import { getOptimizedSession, isAuthenticated } from '@/lib/supabase/auth-manager';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import BranchSelector from '@/components/common/BranchSelector';
// Importación explícita de los iconos para evitar problemas
import { 
  Bell, 
  Building2, 
  Bus, 
  Calendar, 
  CalendarClock, 
  ChevronRight, 
  ChevronLeft, 
  ChevronsLeft, 
  ChevronsRight, 
  CreditCard, 
  FileText, 
  Home as HomeIcon, 
  LogOut, 
  Mail, 
  Menu, 
  Moon, 
  Package, 
  Search, 
  Settings, 
  ShoppingCart, 
  Sun, 
  User, 
  Users, 
  BarChart3, 
  ChevronDown, 
  LayoutDashboard, 
  PieChart 
} from 'lucide-react';

// Componente para elemento de navegación con posible submenú
// Definiendo tipos para la navegación para mayor seguridad
interface SubNavItem {
  name: string;
  href: string;
}

interface NavItemProps {
  name: string;
  href: string;
  icon: React.ReactNode;
  submenu?: SubNavItem[];
}

interface NavSection {
  title: string;
  items: NavItemProps[];
}

// Componente seguro para renderizar elementos de navegación
const NavItem = ({ item, collapsed }: { item: NavItemProps, collapsed?: boolean }) => {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
  
  // Para abrir automáticamente el submenú de una sección activa
  useEffect(() => {
    if (isActive && item.submenu) {
      setIsOpen(true);
    }
  }, [isActive, item.submenu]);
  
  // Si tiene submenú, controla su apertura/cierre
  const handleClick = () => {
    if (item.submenu) {
      setIsOpen(!isOpen);
    }
  };
  
  return (
    <div>
      <div 
        className={`
          flex items-center justify-between ${collapsed ? 'lg:justify-center' : ''} px-3 py-2 rounded-md text-sm font-medium
          ${isActive 
            ? 'bg-blue-50 text-blue-600 dark:bg-gray-700 dark:text-blue-300 font-semibold' 
            : 'text-gray-700 hover:bg-blue-50/50 hover:text-blue-600 dark:text-gray-300 dark:hover:bg-gray-700/50'
          }
          transition-all duration-200 cursor-pointer
          ${collapsed ? 'lg:relative lg:group' : ''}
        `}>
        <Link href={item.href} className={`flex items-center ${collapsed ? 'lg:justify-center lg:w-full' : 'flex-grow'}`}>
          <span className={`
              inline-block ${collapsed ? 'lg:mr-0' : 'mr-3'} transition-colors duration-200
              ${isActive ? 'text-blue-600 dark:text-blue-300' : 'text-gray-500 dark:text-gray-400'}
            `}>
            {item.icon}
          </span>
          {!collapsed && <span>{item.name}</span>}
          {collapsed && <span className="lg:hidden">{item.name}</span>}
          {/* Tooltip para mostrar el nombre cuando está contraído */}
          {collapsed && (
            <div className="absolute left-full ml-2 pl-2 hidden lg:group-hover:block z-50 whitespace-nowrap">
              <div className="bg-gray-800 text-white text-sm py-1 px-3 rounded shadow-lg">
                {item.name}
              </div>
            </div>
          )}
        </Link>
        {item.submenu && !collapsed && (
          <button 
            onClick={() => setIsOpen(!isOpen)}
            className="ml-auto pl-1"
            aria-expanded={isOpen}
            aria-label={isOpen ? `Cerrar ${item.name}` : `Abrir ${item.name}`}
          >
            <ChevronRight size={16} className={`transition-transform duration-200 ${isOpen ? 'transform rotate-90' : ''}`} />
          </button>
        )}
      </div>
      
      {/* Submenú desplegable con animación */}
      {item.submenu && (
        <div 
          className={`
            ml-6 space-y-1 overflow-hidden transition-all duration-300 ease-in-out
            ${isOpen ? 'max-h-60 opacity-100 mt-1' : 'max-h-0 opacity-0'}
          `}
        >
          {item.submenu.map((subItem: any, subIdx: number) => (
            <Link 
              key={subIdx} 
              href={subItem.href}
              className={`
                flex items-center px-3 py-1.5 text-sm rounded-md transition-colors duration-200
                ${pathname === subItem.href 
                  ? 'bg-blue-50 text-blue-700 font-medium dark:bg-blue-900/20 dark:text-blue-200' 
                  : 'text-gray-600 hover:text-blue-600 hover:bg-blue-50/40 dark:text-gray-400 dark:hover:text-gray-200'}
              `}
            >
              <span className="h-1 w-1 bg-gray-400 rounded-full mr-2"></span>
              {subItem.name}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// Componente principal de layout
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [loading, setLoading] = useState(false);
  const [orgName, setOrgName] = useState<string>('');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [userData, setUserData] = useState<{
    name?: string;
    email?: string;
    role?: string;
    avatar?: string;
  } | null>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  
  // Indicador de recarga para forzar actualización de datos del perfil
  const [profileRefresh, setProfileRefresh] = useState(0);
  
  // Cargar datos del perfil del usuario desde Supabase al montar el componente o cuando se actualiza el perfil
  useEffect(() => {
    async function loadUserProfile() {
      try {
        // Usar el gestor optimizado para verificar autenticación
        const { isAuthenticated: isAuth, session } = await isAuthenticated();
        if (!isAuth || !session?.user) {
          console.log('No hay usuario autenticado');
          return;
        }
        
        const user = session.user;

        console.log(user);
        
        // Obtener datos del perfil del usuario usando el cliente de Supabase configurado
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();
          
        if (profileError) {
          console.error('Error al obtener perfil:', profileError);
          throw profileError;
        }
        
        // Asegurar que tenemos el organizationId en localStorage
        const currentOrgId = localStorage.getItem('currentOrganizationId');
        if (!currentOrgId) {
          console.log('No hay organización seleccionada');
          return;
        }
        
        // Obtener datos del rol del usuario con manejo adecuado de errores
        const { data: userRoleData, error: roleError } = await supabase
          .from('organization_members')
          .select('role_id (id, name)')
          .eq('user_id', user.id)
          .eq('organization_id', currentOrgId)
          .single();
          
        if (roleError) {
          console.error('Error al obtener rol:', roleError);
          // Continuar aunque no tengamos el rol
        }
        
        // Actualizar el estado del userData
        setUserData({
          name: profileData?.full_name || (profileData?.first_name || '') + ' ' + (profileData?.last_name || ''),
          email: user.email,
          role: userRoleData?.role_id.name,
          avatar: profileData?.avatar_url
        });
      } catch (error) {
        console.error('Error al cargar datos del perfil:', error);
      }
    }
    
    loadUserProfile();
    
    // Configurar un canal de suscripción para escuchar cambios en el perfil
    const profileSubscription = supabase
      .channel('public:profiles')
      .on('postgres_changes', 
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${supabase.auth.getSession().then(res => res.data.session?.user.id)}` },
        (payload) => {
          // Cuando se actualiza el perfil, actualizar el userData
          setProfileRefresh(prev => prev + 1);
        }
      )
      .subscribe();
      
    return () => {
      // Limpiar la suscripción cuando el componente se desmonta
      supabase.removeChannel(profileSubscription);
    };
  }, [profileRefresh]);
  
  // Inicializar tema desde localStorage o preferencia del sistema
  useEffect(() => {
    // Verificar si el código se está ejecutando en el navegador
    if (typeof window !== 'undefined') {
      // Verificar si hay una preferencia guardada de tema
      const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
      
      if (savedTheme) {
        setTheme(savedTheme);
        // Si es tema oscuro, añadir la clase 'dark' al elemento HTML
        if (savedTheme === 'dark') {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      } else {
        // Si no hay preferencia guardada, usar preferencia del sistema
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        setTheme(prefersDark ? 'dark' : 'light');
        
        if (prefersDark) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
        
        // Guardar la preferencia detectada
        localStorage.setItem('theme', prefersDark ? 'dark' : 'light');
      }
      
      // Obtener el nombre de la organización del localStorage si existe
      const storedOrgName = localStorage.getItem('currentOrganizationName');
      if (storedOrgName) {
        setOrgName(storedOrgName);
      }
    }
  }, []);
  
  // Función para cambiar el tema
  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    
    // Aplicar o quitar la clase 'dark' según corresponda
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    
    // Para depuración
    console.log('Tema cambiado a:', newTheme);
  };
  
  const handleSignOut = async () => {
    try {
      setLoading(true);
      await signOut();
      
      // Limpiar localStorage
      localStorage.removeItem('currentOrganizationId');
      localStorage.removeItem('currentOrganizationName');
      localStorage.removeItem('userRole');
      localStorage.removeItem('supabase.auth.token');
      
      // Redireccionar a la página de login
      window.location.replace('/auth/login');
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    } finally {
      setLoading(false);
    }
  };
  
  // Estados para controlar la barra lateral en móvil y contraer/expandir en escritorio
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  
  // Estado para almacenar el ID de la organización
  const [orgId, setOrgId] = useState<string | null>(null);
  
  // Efecto para obtener el ID de la organización del localStorage (solo en cliente)
  useEffect(() => {
    const storedOrgId = localStorage.getItem('currentOrganizationId');
    setOrgId(storedOrgId);
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
      
      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
          <div className="flex justify-between items-center px-4 py-2">
            <h2 className="text-lg font-medium text-gray-800 dark:text-gray-200">
              Panel de Administración
            </h2>
            <div className="flex items-center space-x-3">
              {/* Branch Selector - Only re-renders when orgId changes */}
              {useMemo(() => {
                return orgId ? <BranchSelector organizationId={parseInt(orgId)} /> : null;
              }, [orgId])}
              
              {/* Botón para cambiar tema */}
              <button
                onClick={toggleTheme}
                className="p-2 rounded-md text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
                aria-label="Cambiar tema"
                title={theme === 'light' ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro'}
              >
                {theme === 'light' ? (
                  <Moon size={18} className="text-gray-700" />
                ) : (
                  <Sun size={18} className="text-yellow-400" />
                )}
              </button>
              
              {/* Notificaciones */}
              <button
                className="p-2 rounded-md text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
                aria-label="Notificaciones"
                title="Notificaciones"
              >
                <Bell size={18} />
              </button>

              {/* Perfil de usuario con menú desplegable */}
              <div className="relative" ref={userMenuRef}>
                <div 
                  className="flex items-center space-x-2 p-1 rounded-md cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                >
                  <div className="h-8 w-8 rounded-full overflow-hidden bg-gray-200 flex items-center justify-center">
                    {userData?.avatar ? (
                      <Image 
                        src={userData.avatar} 
                        alt="Avatar" 
                        width={32} 
                        height={32} 
                        className="object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300">
                        <User size={20} />
                      </div>
                    )}
                  </div>
                  <div className="hidden md:block">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{userData?.name || 'Usuario'}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{userData?.role || 'Usuario'}</p>
                  </div>
                  <ChevronDown size={16} className="text-gray-500 dark:text-gray-400" />
                </div>

                {/* Menú desplegable */}
                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-60 bg-white dark:bg-gray-800 rounded-md shadow-lg py-1 z-50 border border-gray-200 dark:border-gray-700">
                    {/* Información del usuario */}
                    <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{userData?.name}</p>
                      <div className="flex flex-col space-y-1 text-xs text-gray-500 dark:text-gray-400">
                        {userData?.role && (
                          <p className="truncate">{userData.role}</p>
                        )}
                        {userData?.email && (
                          <p className="truncate">{userData.email}</p>
                        )}
                      </div>
                    </div>

                    {/* Opciones del menú */}
                    <Link href="/app/perfil" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 flex items-center">
                      <User size={14} className="mr-2" />
                      Ver perfil
                    </Link>
                    <Link href="/app/configuraciones" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 flex items-center">
                      <Settings size={14} className="mr-2" />
                      Configuraciones
                    </Link>
                    <Link href="/app/notificaciones" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 flex items-center">
                      <Bell size={14} className="mr-2" />
                      Notificaciones
                    </Link>
                    
                    {/* Separador */}
                    <div className="border-t border-gray-200 dark:border-gray-700 my-1"></div>
                    
                    {/* Botón de cierre de sesión */}
                    <button
                      onClick={handleSignOut}
                      disabled={loading}
                      className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                    >
                      <LogOut size={14} className="mr-2" />
                      {loading ? 'Cerrando sesión...' : 'Cerrar sesión'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        
        {/* Contenido principal */}
        <div className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900">
          {children}
        </div>
      </div>
    </div>
  );
}

// Componente para la navegación lateral
const SidebarNavigation = ({ 
  handleSignOut, 
  loading, 
  userData, 
  orgName,
  collapsed
}: { 
  handleSignOut: () => Promise<void>, 
  loading: boolean,
  userData: {
    name?: string;
    email?: string;
    role?: string;
    avatar?: string;
  } | null,
  orgName?: string | null,
  collapsed?: boolean
}) => {
  const pathname = usePathname();
  
  // Definición de las secciones de navegación con submenús
  const navSections = [
    {
      title: "Principal",
      items: [
        { name: "Inicio", href: "/app/inicio", icon: <HomeIcon size={18} /> }
      ]
    },
    {
      title: "Gestión",
      items: [
        { 
          name: "CRM", 
          href: "/app/crm", 
          icon: <Users size={18} />,
          submenu: [
            { name: "Clientes", href: "/app/crm/clientes" },
            { name: "Oportunidades", href: "/app/crm/oportunidades" },
            { name: "Seguimiento", href: "/app/crm/seguimiento" }
          ]
        },
        { 
          name: "HRM", 
          href: "/app/hrm", 
          icon: <Users size={18} />,
          submenu: [
            { name: "Empleados", href: "/app/hrm/empleados" },
            { name: "Nómina", href: "/app/hrm/nomina" }
          ]
        },
        { 
          name: "Finanzas", 
          href: "/app/finanzas", 
          icon: <FileText size={18} />,
          submenu: [
            { name: "Facturas", href: "/app/finanzas/facturas" },
            { name: "Gastos", href: "/app/finanzas/gastos" },
            { name: "Presupuestos", href: "/app/finanzas/presupuestos" }
          ]
        },
        { 
          name: "Inventario", 
          href: "/app/inventario", 
          icon: <Package size={18} />,
          submenu: [
            { name: "Productos", href: "/app/inventario/productos" },
            { name: "Categorías", href: "/app/inventario/categorias" },
            { name: "Proveedores", href: "/app/inventario/proveedores" }
          ]
        },
      ]
    },
    {
      title: "Ventas",
      items: [
        { 
          name: "POS", 
          href: "/app/pos", 
          icon: <ShoppingCart size={18} />,
          submenu: [
            { name: "Carritos", href: "/app/pos/carritos" },
            { name: "Mesas", href: "/app/pos/mesas" },
            { name: "Cajas", href: "/app/pos/cajas" },
            { name: "Clientes Multiples", href: "/app/pos/clientes-multiples" },
            { name: "Cobro", href: "/app/pos/cobro" },
            { name: "Comandas", href: "/app/pos/comandas" },
            { name: "Configuración", href: "/app/pos/configuración" },
            { name: "Cuentas por Cobrar", href: "/app/pos/cuentas-por-cobrar" },
            { name: "Devoluciones", href: "/app/pos/devoluciones" },
            { name: "Habitaciones", href: "/app/pos/habitaciones" },
            { name: "Mesas", href: "/app/pos/mesas" },
            { name: "Pagos Pendientes", href: "/app/pos/pagos-pendientes" },
            { name: "Reportes", href: "/app/pos/reportes" },
          ]
        },
        { 
          name: "PMS", 
          href: "/app/pms", 
          icon: <Building2 size={18} />,
          submenu: []
        }
      ]
    },
    {
      title: "Organización",
      items: [
        { name: "Calendario", href: "/app/calendario", icon: <Calendar size={18} /> },
        { name: "Clientes", href: "/app/clientes", icon: <Users size={18} /> },
        { name: "Organización", href: "/app/organizacion", icon: <Building2 size={18} /> },
        { name: "Reportes", href: "/app/reportes", icon: <BarChart3 size={18} /> },
        { name: "Timeline", href: "/app/timeline", icon: <CalendarClock size={18} /> },
        { name: "Transporte", href: "/app/transporte", icon: <Bus size={18} /> }
      ]
    },
    {
      title: "Sistema",
      items: [
        { name: "Notificaciones", href: "/app/notificaciones", icon: <Bell size={18} /> },
        { name: "Integraciones", href: "/app/integraciones", icon: <Settings size={18} /> }
      ]
    }
  ];
  
  return (
    <div className="space-y-1 transition-all duration-300">
      {/* Secciones de navegación */}
      {navSections.map((section, idx) => (
        <div key={idx} className="mb-4">
          <h3 className={`px-3 mb-1 text-xs font-semibold text-gray-500 uppercase tracking-wider ${collapsed ? 'lg:text-center lg:px-0' : ''}`}>
            {collapsed ? (idx === 0 ? '•' : '•') : section.title}
          </h3>
          {section.items.map((item, itemIdx) => (
            <NavItem key={itemIdx} item={item} collapsed={collapsed} />
          ))}
        </div>
      ))}
      
      {/* Sección de perfil */}
      <div className="pt-4 mt-4 border-t border-gray-200 dark:border-gray-700">
        {/* Información de perfil del usuario */}
        <Link href="/app/perfil" className={`block px-3 py-3 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors rounded-md ${collapsed ? 'lg:px-2 lg:text-center lg:relative lg:group' : ''}`}>
          <div className={`flex ${collapsed ? 'lg:justify-center' : ''} items-center`}>
            {/* Avatar del usuario */}
            <div className="flex-shrink-0 relative w-10 h-10 overflow-hidden rounded-full">
              {userData?.avatar ? (
                <Image 
                  src={userData.avatar} 
                  alt="Foto de perfil" 
                  width={40} 
                  height={40} 
                  className="object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300">
                  <User size={20} />
                </div>
              )}
            </div>

            {/* Información del usuario - visible solo cuando no está contraído */}
            {!collapsed && (
              <div className="ml-3 overflow-hidden">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                  {userData?.name || 'Usuario'}
                </p>
                <div className="flex flex-col space-y-1 text-xs text-gray-500 dark:text-gray-400">
                  {userData?.role && (
                    <p className="truncate">{userData.role}</p>
                  )}
                  {userData?.email && (
                    <p className="truncate">{userData.email}</p>
                  )}
                </div>
              </div>
            )}
            {/* Información del usuario en móvil */}
            {collapsed && (
              <div className="ml-3 overflow-hidden lg:hidden">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                  {userData?.name || 'Usuario'}
                </p>
                <div className="flex flex-col space-y-1 text-xs text-gray-500 dark:text-gray-400">
                  {userData?.role && (
                    <p className="truncate">{userData.role}</p>
                  )}
                  {userData?.email && (
                    <p className="truncate">{userData.email}</p>
                  )}
                </div>
              </div>
            )}
            
            {/* Tooltip para mostrar la información de usuario cuando está contraído */}
            {collapsed && (
              <div className="absolute left-full top-1/2 transform -translate-y-1/2 ml-2 pl-2 hidden lg:group-hover:block z-50 whitespace-nowrap">
                <div className="bg-gray-800 text-white text-sm py-2 px-3 rounded shadow-lg min-w-[200px]">
                  <div className="font-medium mb-1">{userData?.name || 'Usuario'}</div>
                  {userData?.role && (
                    <div className="text-xs text-gray-300">{userData.role}</div>
                  )}
                  {userData?.email && (
                    <div className="text-xs text-gray-300 truncate">{userData.email}</div>
                  )}
                  {orgName && (
                    <div className="text-xs text-gray-300 mt-1 flex items-center">
                      <Building2 size={12} className="mr-1" />
                      <span className="truncate">{orgName}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* Organización (visible cuando no está contraído) */}
            {!collapsed && orgName && (
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center">
                <Building2 size={12} className="mr-1" />
                <span className="truncate">{orgName}</span>
              </div>
            )}
            
            {/* Organización (visible en móvil) */}
            {collapsed && orgName && (
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center lg:hidden">
                <Building2 size={12} className="mr-1" />
                <span className="truncate">{orgName}</span>
              </div>
            )}
          </div>
        </Link>

        {/* Espacio adicional */}
        <div className="mb-3"></div>
        
        {/* Botón de suscripción destacado */}
        <Link 
          href="/app/suscripcion" 
          className={`w-full flex items-center justify-center px-3 py-2 mb-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 shadow-sm hover:shadow transition-all duration-200 border border-blue-500 ${collapsed ? 'lg:relative lg:group' : ''}`}
        >
          <CreditCard size={16} className={collapsed ? 'lg:mr-0' : 'mr-2'} />
          {!collapsed && <span>Mi Suscripción</span>}
          {collapsed && <span className="lg:hidden">Mi Suscripción</span>}
          
          {/* Tooltip para el botón de suscripción */}
          {collapsed && (
            <div className="absolute left-full top-1/2 transform -translate-y-1/2 ml-2 pl-2 hidden lg:group-hover:block z-50 whitespace-nowrap">
              <div className="bg-gray-800 text-white text-sm py-1 px-3 rounded shadow-lg">
                Mi Suscripción
              </div>
            </div>
          )}
        </Link>
        
        {/* Botón de cerrar sesión */}
        <button
          onClick={handleSignOut}
          disabled={loading}
          className={`w-full flex items-center justify-center px-3 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors ${collapsed ? 'lg:relative lg:group' : ''}`}
        >
          <LogOut size={16} className={collapsed ? 'lg:mr-0' : 'mr-2'} />
          {!collapsed && <span>{loading ? 'Cerrando...' : 'Cerrar Sesión'}</span>}
          {collapsed && <span className="lg:hidden">{loading ? 'Cerrando...' : 'Cerrar Sesión'}</span>}
          
          {/* Tooltip para el botón de cerrar sesión */}
          {collapsed && (
            <div className="absolute left-full top-1/2 transform -translate-y-1/2 ml-2 pl-2 hidden lg:group-hover:block z-50 whitespace-nowrap">
              <div className="bg-gray-800 text-white text-sm py-1 px-3 rounded shadow-lg">
                {loading ? 'Cerrando...' : 'Cerrar Sesión'}
              </div>
            </div>
          )}
        </button>
      </div>
    </div>
  );
}
