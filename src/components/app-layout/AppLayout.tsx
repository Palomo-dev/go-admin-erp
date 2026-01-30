'use client';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  Menu, 
  ChevronsLeft, 
  ChevronsRight, 
  Building2,
  Users, 
  UserCog, 
  FileText, 
  Package, 
  ShoppingCart, 
  MessageCircle, 
  Settings,
  PanelLeft,
  Home,
  Inbox,
  Target,
  TrendingUp,
  BarChart3,
  Activity,
  ClipboardList,
  Tag,
  Megaphone,
  User,
  Briefcase,
  Clock,
  UserCheck,
  Calendar,
  DollarSign,
  HandCoins,
  Wallet,
  Globe,
  Receipt,
  CreditCard,
  Percent,
  Layers,
  ArrowLeftRight,
  FolderOpen,
  Hash,
  Image as ImageIcon,
  Truck,
  Table2,
  Undo2,
  Gift,
  CalendarDays,
  BookOpen,
  MapPin,
  BedDouble,
  Key,
  LogOut as LogOutIcon,
  Sparkles,
  ParkingCircle,
  MessageSquare,
  Bot,
  Headphones,
  Shield,
  Plus,
  Calculator,
  Zap,
  TrendingDown
} from 'lucide-react';
import { OrganizationSelectorWrapper } from './OrganizationSelectorWrapper';
import { supabase } from '@/lib/supabase/config';
import { isAuthenticated } from '@/lib/supabase/auth-manager';
import { getUserData } from '@/lib/services/userService';
import { AppHeader } from './Header/AppHeader';
import { SidebarNavigation } from './Sidebar/SidebarNavigation';
import { SubMenuPanel } from './Sidebar/SubMenuPanel';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { usePathname } from 'next/navigation';
import { NavItemProps } from './types';

// Importaciones estándar para evitar ChunkLoadError
import ModuleLimitNotification from '@/components/notifications/ModuleLimitNotification';
import { ModuleProvider } from '@/lib/context/ModuleContext';
import { NavigationProgress } from './NavigationProgress';

// Función helper para obtener URL del logo
const getOrganizationLogoUrl = (logoPath: string) => {
  if (!logoPath) return null;
  // Si ya es una URL completa, retornarla
  if (logoPath.startsWith('http')) return logoPath;
  // Si es una ruta relativa, construir la URL completa
  return `/api/files/${logoPath}`;
};

// Configuración de módulos con submenús para Multi-Column Layout
const MODULES_WITH_SUBMENU: NavItemProps[] = [
  { 
    name: "CRM", 
    href: "/app/crm", 
    icon: <Users size={18} />,
    submenu: [
      { name: "Dashboard", href: "/app/crm", icon: <Home size={16} /> },
      { name: "Bandeja", href: "/app/crm/bandeja", icon: <Inbox size={16} /> },
      { name: "Clientes", href: "/app/crm/clientes", icon: <Users size={16} /> },
      { name: "Pipeline", href: "/app/crm/pipeline", icon: <Target size={16} /> },
      { name: "Oportunidades", href: "/app/crm/oportunidades", icon: <TrendingUp size={16} /> },
      { name: "Pronóstico", href: "/app/crm/pronostico", icon: <BarChart3 size={16} /> },
      { name: "Actividades", href: "/app/crm/actividades", icon: <Activity size={16} /> },
      { name: "Tareas", href: "/app/crm/tareas", icon: <ClipboardList size={16} /> },
      { name: "Segmentos", href: "/app/crm/segmentos", icon: <Tag size={16} /> },
      { name: "Campañas", href: "/app/crm/campanas", icon: <Megaphone size={16} /> },
      { name: "Reportes", href: "/app/crm/reportes", icon: <BarChart3 size={16} /> },
      { name: "Identidades", href: "/app/crm/identidades", icon: <User size={16} /> },
      { name: "Configuración", href: "/app/crm/configuracion", icon: <Settings size={16} /> }
    ]
  },
  { 
    name: "HRM", 
    href: "/app/hrm", 
    icon: <UserCog size={18} />,
    submenu: [
      { name: "Panel HRM", href: "/app/hrm", icon: <Home size={16} /> },
      { name: "Empleados", href: "/app/hrm/empleados", icon: <Users size={16} /> },
      { name: "Departamentos", href: "/app/hrm/departamentos", icon: <Building2 size={16} /> },
      { name: "Cargos", href: "/app/hrm/cargos", icon: <Briefcase size={16} /> },
      { name: "Turnos", href: "/app/hrm/turnos", icon: <Clock size={16} /> },
      { name: "Marcación", href: "/app/hrm/marcacion", icon: <Clock size={16} /> },
      { name: "Asistencia", href: "/app/hrm/asistencia", icon: <UserCheck size={16} /> },
      { name: "Ausencias", href: "/app/hrm/ausencias", icon: <Calendar size={16} /> },
      { name: "Nómina", href: "/app/hrm/nomina", icon: <DollarSign size={16} /> },
      { name: "Compensación", href: "/app/hrm/compensacion", icon: <HandCoins size={16} /> },
      { name: "Préstamos", href: "/app/hrm/prestamos", icon: <Wallet size={16} /> },
      { name: "Reportes", href: "/app/hrm/reportes", icon: <BarChart3 size={16} /> },
      { name: "Reglas País", href: "/app/hrm/reglas-pais", icon: <Globe size={16} /> },
      { name: "Configuración", href: "/app/hrm/configuracion", icon: <Settings size={16} /> }
    ]
  },
  { 
    name: "Finanzas", 
    href: "/app/finanzas", 
    icon: <FileText size={18} />,
    submenu: [
      { name: "Dashboard", href: "/app/finanzas", icon: <BarChart3 size={16} /> },
      { name: "Facturas de venta", href: "/app/finanzas/facturas-venta", icon: <FileText size={16} /> },
      { name: "Facturas de compra", href: "/app/finanzas/facturas-compra", icon: <Receipt size={16} /> },
      { name: "Notas de crédito", href: "/app/finanzas/notas-credito", icon: <FileText size={16} /> },
      { name: "Ingresos", href: "/app/finanzas/ingresos", icon: <TrendingUp size={16} /> },
      { name: "Egresos", href: "/app/finanzas/egresos", icon: <TrendingDown size={16} /> },
      { name: "Transferencias", href: "/app/finanzas/transferencias", icon: <ArrowLeftRight size={16} /> },
      { name: "Cuentas por cobrar", href: "/app/finanzas/cuentas-por-cobrar", icon: <DollarSign size={16} /> },
      { name: "Cuentas por pagar", href: "/app/finanzas/cuentas-por-pagar", icon: <CreditCard size={16} /> },
      { name: "Bancos", href: "/app/finanzas/bancos", icon: <Building2 size={16} /> },
      { name: "Contabilidad", href: "/app/finanzas/contabilidad", icon: <Calculator size={16} /> },
      { name: "Facturación Electrónica", href: "/app/finanzas/facturacion-electronica", icon: <Zap size={16} /> },
      { name: "Reportes", href: "/app/finanzas/reportes", icon: <BarChart3 size={16} /> },
      { name: "Impuestos", href: "/app/finanzas/impuestos", icon: <Percent size={16} /> },
      { name: "Monedas", href: "/app/finanzas/monedas", icon: <Globe size={16} /> },
      { name: "Métodos de pago", href: "/app/finanzas/metodos-pago", icon: <CreditCard size={16} /> }
    ]
  },
  { 
    name: "Inventario", 
    href: "/app/inventario", 
    icon: <Package size={18} />,
    submenu: [
      { name: "Dashboard", href: "/app/inventario", icon: <Home size={16} /> },
      { name: "Productos", href: "/app/inventario/productos", icon: <Package size={16} /> },
      { name: "Stock", href: "/app/inventario/stock", icon: <Layers size={16} /> },
      { name: "Movimientos", href: "/app/inventario/movimientos", icon: <ArrowLeftRight size={16} /> },
      { name: "Ajustes", href: "/app/inventario/ajustes", icon: <Settings size={16} /> },
      { name: "Transferencias", href: "/app/inventario/transferencias", icon: <ArrowLeftRight size={16} /> },
      { name: "Categorías", href: "/app/inventario/categorias", icon: <FolderOpen size={16} /> },
      { name: "Etiquetas", href: "/app/inventario/etiquetas", icon: <Tag size={16} /> },
      { name: "Unidades", href: "/app/inventario/unidades", icon: <Hash size={16} /> },
      { name: "Variantes - Tipos", href: "/app/inventario/variantes/tipos", icon: <Layers size={16} /> },
      { name: "Variantes - Valores", href: "/app/inventario/variantes/valores", icon: <Tag size={16} /> },
      { name: "Lotes", href: "/app/inventario/lotes", icon: <Package size={16} /> },
      { name: "Imágenes", href: "/app/inventario/imagenes", icon: <ImageIcon size={16} /> },
      { name: "Proveedores", href: "/app/inventario/proveedores", icon: <Truck size={16} /> },
      { name: "Órdenes de Compra", href: "/app/inventario/ordenes-compra", icon: <ClipboardList size={16} /> },
      { name: "Reportes", href: "/app/inventario/reportes", icon: <BarChart3 size={16} /> }
    ]
  },
  { 
    name: "POS", 
    href: "/app/pos", 
    icon: <ShoppingCart size={18} />,
    submenu: [
      { name: "POS", href: "/app/pos", icon: <ShoppingCart size={16} /> },
      { name: "Ventas", href: "/app/pos/ventas", icon: <Receipt size={16} /> },
      { name: "Cajas", href: "/app/pos/cajas", icon: <Wallet size={16} /> },
      { name: "Mesas", href: "/app/pos/mesas", icon: <Table2 size={16} /> },
      { name: "Comandas", href: "/app/pos/comandas", icon: <ClipboardList size={16} /> },
      { name: "Devoluciones", href: "/app/pos/devoluciones", icon: <Undo2 size={16} /> },
      { name: "Propinas", href: "/app/pos/propinas", icon: <Gift size={16} /> },
      { name: "Cargos Servicio", href: "/app/pos/cargos-servicio", icon: <Percent size={16} /> },
      { name: "Cupones", href: "/app/pos/cupones", icon: <Gift size={16} /> },
      { name: "Promociones", href: "/app/pos/promociones", icon: <Percent size={16} /> },
      { name: "Cuentas por Cobrar", href: "/app/pos/cuentas-por-cobrar", icon: <DollarSign size={16} /> },
      { name: "Reportes", href: "/app/pos/reportes", icon: <BarChart3 size={16} /> },
      { name: "Configuración", href: "/app/pos/configuracion", icon: <Settings size={16} /> },
    ]
  },
  { 
    name: "PMS", 
    href: "/app/pms", 
    icon: <Building2 size={18} />,
    submenu: [
      { name: "Dashboard", href: "/app/pms", icon: <Home size={16} /> },
      { name: "Calendario", href: "/app/pms/calendario", icon: <CalendarDays size={16} /> },
      { name: "Reservas", href: "/app/pms/reservas", icon: <BookOpen size={16} /> },
      { name: "Grupos", href: "/app/pms/grupos", icon: <Users size={16} /> },
      { name: "Asignaciones", href: "/app/pms/asignaciones", icon: <MapPin size={16} /> },
      { name: "Llegadas (Check-in)", href: "/app/pms/checkin", icon: <Key size={16} /> },
      { name: "Salidas (Check-out)", href: "/app/pms/checkout", icon: <LogOutIcon size={16} /> },
      { name: "Espacios", href: "/app/pms/espacios", icon: <BedDouble size={16} /> },
      { name: "Tipos de Espacio", href: "/app/pms/tipos-espacio", icon: <Layers size={16} /> },
      { name: "Categorías", href: "/app/pms/categorias", icon: <FolderOpen size={16} /> },
      { name: "Tarifas", href: "/app/pms/tarifas", icon: <DollarSign size={16} /> },
      { name: "Limpieza", href: "/app/pms/housekeeping", icon: <Sparkles size={16} /> },
      { name: "Mantenimiento", href: "/app/pms/mantenimiento", icon: <Settings size={16} /> },
      { name: "Consumos", href: "/app/pms/folios", icon: <Receipt size={16} /> },
      { name: "Origenes", href: "/app/pms/origenes", icon: <Globe size={16} /> },
      { name: "Parquedero", href: "/app/pms/parking", icon: <ParkingCircle size={16} /> },
      { name: "Configuración", href: "/app/pms/configuracion", icon: <Settings size={16} /> },
    ]
  },
  { 
    name: "Chat", 
    href: "/app/chat", 
    icon: <MessageCircle size={18} />,
    submenu: [
      { name: "Bandeja", href: "/app/chat/bandeja", icon: <Inbox size={16} /> },
      { name: "Canales", href: "/app/chat/canales", icon: <MessageSquare size={16} /> },
      { name: "Conocimiento", href: "/app/chat/conocimiento", icon: <BookOpen size={16} /> },
      { name: "IA", href: "/app/chat/ia/configuracion", icon: <Bot size={16} /> },
      { name: "Configuración", href: "/app/chat/configuracion/etiquetas", icon: <Settings size={16} /> },
      { name: "Widget", href: "/app/chat/widget/sesiones", icon: <Headphones size={16} /> },
      { name: "Auditoría", href: "/app/chat/auditoria", icon: <Shield size={16} /> },
    ]
  },
  { 
    name: "Organización", 
    href: "/app/organizacion", 
    icon: <Building2 size={18} />,
    submenu: [
      { name: "Miembros", href: "/app/organizacion/miembros", icon: <Users size={16} /> },
      { name: "Invitaciones", href: "/app/organizacion/invitaciones", icon: <Plus size={16} /> },
      { name: "Información", href: "/app/organizacion/informacion", icon: <Building2 size={16} /> },
      { name: "Mi Plan", href: "/app/organizacion/plan", icon: <CreditCard size={16} /> },
      { name: "Sucursales", href: "/app/organizacion/sucursales", icon: <MapPin size={16} /> },
      { name: "Mis Organizaciones", href: "/app/organizacion/mis-organizaciones", icon: <Building2 size={16} /> }
    ]
  },
  { 
    name: "Administración", 
    href: "/app/admin", 
    icon: <Settings size={18} />,
    submenu: [
      { name: "Roles y Permisos", href: "/app/roles/roles", icon: <Shield size={16} /> },
      { name: "Configuración", href: "/app/roles/configuracion", icon: <Settings size={16} /> }
    ]
  },
  { 
    name: "Gimnasio", 
    href: "/app/gym", 
    icon: <Activity size={18} />,
    submenu: [
      { name: "Dashboard", href: "/app/gym", icon: <Home size={16} /> },
      { name: "Check-in", href: "/app/gym/checkin", icon: <UserCheck size={16} /> },
      { name: "Membresías", href: "/app/gym/membresias", icon: <Users size={16} /> },
      { name: "Planes", href: "/app/gym/planes", icon: <CreditCard size={16} /> },
      { name: "Clases", href: "/app/gym/clases", icon: <Calendar size={16} /> },
      { name: "Horarios", href: "/app/gym/horarios", icon: <Clock size={16} /> },
      { name: "Reservaciones", href: "/app/gym/reservaciones", icon: <CalendarDays size={16} /> },
      { name: "Instructores", href: "/app/gym/instructores", icon: <User size={16} /> },
      { name: "Reportes", href: "/app/gym/reportes", icon: <BarChart3 size={16} /> },
      { name: "Configuración", href: "/app/gym/ajustes", icon: <Settings size={16} /> }
    ]
  },
  { 
    name: "Transporte", 
    href: "/app/transporte", 
    icon: <Truck size={18} />,
    submenu: [
      { name: "Dashboard", href: "/app/transporte", icon: <Home size={16} /> },
      { name: "Transportadoras", href: "/app/transporte/transportadoras", icon: <Truck size={16} /> },
      { name: "Vehículos", href: "/app/transporte/vehiculos", icon: <Truck size={16} /> },
      { name: "Conductores", href: "/app/transporte/conductores", icon: <User size={16} /> },
      { name: "Paradas", href: "/app/transporte/paradas", icon: <MapPin size={16} /> },
      { name: "Rutas", href: "/app/transporte/rutas", icon: <MapPin size={16} /> },
      { name: "Horarios", href: "/app/transporte/horarios", icon: <Clock size={16} /> },
      { name: "Direcciones Clientes", href: "/app/transporte/direcciones-clientes", icon: <MapPin size={16} /> },
      { name: "Viajes", href: "/app/transporte/viajes", icon: <Calendar size={16} /> },
      { name: "Boletos", href: "/app/transporte/boletos", icon: <Tag size={16} /> },
      { name: "Tarifas Pasajeros", href: "/app/transporte/tarifas-pasajeros", icon: <DollarSign size={16} /> },
      { name: "Envíos", href: "/app/transporte/envios", icon: <Package size={16} /> },
      { name: "Tarifas Envío", href: "/app/transporte/tarifas-envio", icon: <DollarSign size={16} /> },
      { name: "Tracking", href: "/app/transporte/tracking", icon: <Target size={16} /> },
      { name: "Etiquetas", href: "/app/transporte/etiquetas", icon: <Tag size={16} /> },
      { name: "Manifiestos", href: "/app/transporte/manifiestos", icon: <ClipboardList size={16} /> },
      { name: "Incidentes", href: "/app/transporte/incidentes", icon: <Shield size={16} /> },
    ]
  },
];

// Función para detectar el módulo activo basado en la ruta
const getActiveModule = (pathname: string | null): NavItemProps | null => {
  if (!pathname) return null;
  
  // Buscar el módulo que coincida con la ruta actual
  for (const module of MODULES_WITH_SUBMENU) {
    if (pathname === module.href || pathname.startsWith(module.href + '/')) {
      return module;
    }
  }
  
  return null;
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
  // Hook para obtener la ruta actual
  const pathname = usePathname();
  
  // Detectar módulo activo para Multi-Column Layout
  const activeModule = useMemo(() => getActiveModule(pathname), [pathname]);
  
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
  
  // Estado para controlar el panel de submenú Multi-Column
  const [subMenuPanelOpen, setSubMenuPanelOpen] = useState(true);
  
  // Referencia al módulo anterior para detectar cambios (useRef para evitar re-renders)
  const previousModuleHrefRef = useRef<string | null>(null);
  
  // Efecto para cerrar el panel cuando cambia de módulo
  useEffect(() => {
    const currentModuleHref = activeModule?.href || null;
    const previousHref = previousModuleHrefRef.current;
    
    // Si hay un módulo activo y es diferente al anterior, cerrar el panel
    if (currentModuleHref && previousHref && currentModuleHref !== previousHref) {
      setSubMenuPanelOpen(false);
    }
    
    // Actualizar la referencia
    previousModuleHrefRef.current = currentModuleHref;
  }, [activeModule?.href]);
  
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
      // Nota: Usamos organization_members_role_id_fkey para especificar la relación con roles
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
            organizations(
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
      {/* Barra de progreso de navegación - feedback visual inmediato */}
      <NavigationProgress />
      
      <div className="flex h-screen overflow-hidden">
      {/* Overlay oscuro para móvil cuando el sidebar está abierto */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden transition-opacity duration-300"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}
      
      {/* Sidebar - con versión móvil que se muestra/oculta */}
      <div className={`
        fixed lg:sticky inset-y-0 left-0 z-50 
        ${sidebarCollapsed ? 'lg:w-20' : 'lg:w-64'} 
        w-72 max-w-[85vw]
        transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} 
        lg:translate-x-0 transition-transform duration-300 ease-in-out
        bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 shadow-2xl lg:shadow-lg
        h-screen overflow-hidden
      `}>
        <div className="flex flex-col h-full overflow-hidden">
          {/* Logo y nombre */}
          <div className="flex justify-between items-center p-4 min-h-[60px] bg-blue-600 flex-shrink-0">
            <h1 className={`text-lg sm:text-xl font-bold text-white ${sidebarCollapsed ? 'lg:hidden' : ''}`}>GO Admin ERP</h1>
            {sidebarCollapsed && <h1 className="hidden lg:block text-xl font-bold text-white text-center">GO</h1>}
            <div className="flex items-center gap-2">
              {/* Botón para contraer/expandir en escritorio */}
              <button 
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="hidden lg:flex items-center justify-center h-8 w-8 rounded-full bg-blue-700 text-white hover:bg-blue-800 transition-colors"
                aria-label={sidebarCollapsed ? 'Expandir menú' : 'Contraer menú'}
              >
                {sidebarCollapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
              </button>
              
              {/* Botón para cerrar en móvil */}
              <button 
                onClick={() => setSidebarOpen(false)}
                className="lg:hidden flex items-center justify-center h-9 w-9 rounded-md bg-blue-700 text-white hover:bg-blue-800 transition-colors active:scale-95"
                aria-label="Cerrar menú"
              >
                <span className="text-2xl leading-none">&times;</span>
              </button>
            </div>
          </div>
          
          {/* Selector de Organización */}
          {orgId && (
            <div className={`flex-shrink-0 mx-3 mt-3 mb-2 ${sidebarCollapsed ? 'p-2 lg:relative lg:group' : 'p-3'} bg-blue-50 dark:bg-blue-900/30 rounded-lg shadow-md border border-blue-100 dark:border-blue-800 transition-all duration-200 hover:shadow-lg`}>
              {/* Organización para sidebar colapsado */}
              {sidebarCollapsed && (
                <>
                  {/* Icono/Logo centrado cuando está colapsado */}
                  <div className="flex justify-center items-center">
                    {getActiveOrgLogo() ? (
                      <div className="w-8 h-8 lg:w-7 lg:h-7 lg:mx-auto">
                        <img 
                          src={getActiveOrgLogo()!}
                          alt="Logo"
                          className="w-full h-full object-cover rounded-full border-2 border-blue-200 dark:border-blue-700 shadow-sm"
                        />
                      </div>
                    ) : (
                      <div className="w-8 h-8 lg:w-7 lg:h-7 lg:mx-auto flex items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-700 dark:from-blue-600 dark:to-blue-900 text-white font-medium shadow-sm border-2 border-blue-200 dark:border-blue-700">
                        {orgName && orgName.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="ml-3 lg:hidden text-sm font-medium text-blue-900 dark:text-blue-100 truncate flex-1">{orgName}</span>
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
          
          {/* Navegación - usa todo el espacio restante con scroll interno */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <SidebarNavigation 
              handleSignOut={handleSignOut}
              loading={loading}
              userData={userData}
              orgName={orgName}
              collapsed={sidebarCollapsed}
              onNavigate={() => setSidebarOpen(false)}
            />
          </div>
        </div>
      </div>
      
      {/* Panel de submenú Multi-Column - Solo visible en desktop cuando hay módulo activo */}
      {activeModule && activeModule.submenu && (
        <SubMenuPanel 
          activeModule={activeModule}
          collapsed={sidebarCollapsed}
          onNavigate={() => setSidebarOpen(false)}
          isOpen={subMenuPanelOpen}
          onToggle={() => setSubMenuPanelOpen(!subMenuPanelOpen)}
        />
      )}
      
      {/* Botón flotante para abrir el panel cuando está cerrado */}
      {activeModule && activeModule.submenu && !subMenuPanelOpen && (
        <button
          onClick={() => setSubMenuPanelOpen(true)}
          className="hidden lg:flex items-center justify-center h-10 w-10 bg-blue-600 hover:bg-blue-700 text-white rounded-r-lg shadow-lg transition-all duration-200 fixed left-20 top-1/2 -translate-y-1/2 z-40"
          style={{ left: sidebarCollapsed ? '80px' : '256px' }}
          aria-label="Abrir panel de submenú"
        >
          <PanelLeft size={20} />
        </button>
      )}
      
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
        
        {/* Contenido principal con scroll */}
        <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900 overscroll-contain">
          <div className="min-h-full">
            {children}
          </div>
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
