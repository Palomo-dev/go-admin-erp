'use client';
import React, { memo, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronLeft, PanelLeftClose, PanelLeft } from 'lucide-react';
import { SubMenuPanelProps } from '../types';
import { 
  Home, 
  User, 
  Users, 
  Settings, 
  BarChart2, 
  FileText, 
  CreditCard, 
  List, 
  Plus,
  Inbox,
  Target,
  TrendingUp,
  Calendar,
  Tag,
  Megaphone,
  Clock,
  Building2,
  Briefcase,
  UserCheck,
  DollarSign,
  HandCoins,
  Globe,
  ShoppingCart,
  Package,
  Layers,
  ArrowLeftRight,
  FolderOpen,
  Image,
  Truck,
  ClipboardList,
  Table2,
  Receipt,
  Undo2,
  Gift,
  Percent,
  Wallet,
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
  Activity,
  Link as LinkIcon,
  Hash,
  Calculator,
  Zap,
  TrendingDown,
  BarChart3,
  Dumbbell,
  LogIn,
  CalendarCheck,
  CalendarClock,
  Ticket,
  Search,
  LayoutGrid,
  Link2,
  Send,
  GitMerge,
  Upload,
  History,
  Palette,
  Wrench,
  FileBarChart,
  UserCog,
  Bell as BellIcon,
} from 'lucide-react';

// Mapa de iconos mejorado para los submenús
const getSubmenuIcon = (name: string): React.ReactNode => {
  const iconMap: { [key: string]: React.ReactNode } = {
    // General
    'Dashboard': <Home size={16} />,
    'Panel HRM': <Home size={16} />,
    'Inicio': <Home size={16} />,
    'Perfil': <User size={16} />,
    'Usuarios': <Users size={16} />,
    'Configuración': <Settings size={16} />,
    'Reportes': <BarChart2 size={16} />,
    'Facturas': <FileText size={16} />,
    'Pagos': <CreditCard size={16} />,
    'Lista': <List size={16} />,
    'Agregar': <Plus size={16} />,
    
    // CRM
    'Bandeja': <Inbox size={16} />,
    'Clientes': <Users size={16} />,
    'Pipeline': <Target size={16} />,
    'Oportunidades': <TrendingUp size={16} />,
    'Pronóstico': <BarChart2 size={16} />,
    'Actividades': <Activity size={16} />,
    'Tareas': <ClipboardList size={16} />,
    'Segmentos': <Tag size={16} />,
    'Campañas': <Megaphone size={16} />,
    'Identidades': <User size={16} />,
    
    // HRM
    'Empleados': <Users size={16} />,
    'Departamentos': <Building2 size={16} />,
    'Cargos': <Briefcase size={16} />,
    'Turnos': <Clock size={16} />,
    'Marcación': <Clock size={16} />,
    'Asistencia': <UserCheck size={16} />,
    'Ausencias': <Calendar size={16} />,
    'Nómina': <DollarSign size={16} />,
    'Compensación': <HandCoins size={16} />,
    'Préstamos': <Wallet size={16} />,
    'Reglas País': <Globe size={16} />,
    
    // Finanzas
    'Facturas de venta': <FileText size={16} />,
    'Facturas de compra': <Receipt size={16} />,
    'Notas de crédito': <FileText size={16} />,
    'Ingresos': <TrendingUp size={16} />,
    'Egresos': <TrendingDown size={16} />,
    'Transferencias': <ArrowLeftRight size={16} />,
    'Cuentas por cobrar': <DollarSign size={16} />,
    'Cuentas por pagar': <CreditCard size={16} />,
    'Bancos': <Building2 size={16} />,
    'Contabilidad': <Calculator size={16} />,
    'Facturación Electrónica': <Zap size={16} />,
    'Reportes Financieros': <BarChart3 size={16} />,
    'Impuestos': <Percent size={16} />,
    'Monedas': <Globe size={16} />,
    'Métodos de pago': <CreditCard size={16} />,
    
    // Inventario
    'Productos': <Package size={16} />,
    'Stock': <Layers size={16} />,
    'Movimientos': <ArrowLeftRight size={16} />,
    'Ajustes': <Settings size={16} />,
    'Categorías': <FolderOpen size={16} />,
    'Etiquetas': <Tag size={16} />,
    'Unidades': <Hash size={16} />,
    'Variantes - Tipos': <Layers size={16} />,
    'Variantes - Valores': <List size={16} />,
    'Lotes': <Package size={16} />,
    'Imágenes': <Image size={16} />,
    'Proveedores': <Truck size={16} />,
    'Órdenes de Compra': <ClipboardList size={16} />,
    
    // POS
    'POS': <ShoppingCart size={16} />,
    'Pedidos Online': <Globe size={16} />,
    'Ventas': <Receipt size={16} />,
    'Cajas': <Wallet size={16} />,
    'Mesas': <Table2 size={16} />,
    'Comandas': <ClipboardList size={16} />,
    'Devoluciones': <Undo2 size={16} />,
    'Propinas': <Gift size={16} />,
    'Cargos Servicio': <Percent size={16} />,
    'Cupones': <Gift size={16} />,
    'Promociones': <Percent size={16} />,
    'Reservas Mesas': <CalendarClock size={16} />,
    'Cuentas por Cobrar': <DollarSign size={16} />,
    
    // Calendario Unificado
    'Vista General': <CalendarDays size={16} />,
    'Recurrencias': <GitMerge size={16} />,
    'Importar': <Upload size={16} />,
    
    // PMS
    'Calendario': <CalendarDays size={16} />,
    'Reservas': <BookOpen size={16} />,
    'Grupos': <Users size={16} />,
    'Asignaciones': <MapPin size={16} />,
    'Llegadas (Check-in)': <Key size={16} />,
    'Salidas (Check-out)': <LogOutIcon size={16} />,
    'Espacios': <BedDouble size={16} />,
    'Servicios': <Settings size={16} />,
    'Tipos de Espacio': <Layers size={16} />,
    'Tarifas': <DollarSign size={16} />,
    'Limpieza': <Sparkles size={16} />,
    'Mantenimiento': <Settings size={16} />,
    'Consumos': <Receipt size={16} />,
    'Origenes': <Globe size={16} />,
    'Parquedero': <ParkingCircle size={16} />,
    
    // Parking (los iconos vienen del subItem.icon, esto es fallback)
    'Operación': <ParkingCircle size={16} />,
    'Mapa': <LayoutGrid size={16} />,
    
    // Chat
    'Canales': <MessageSquare size={16} />,
    'Conocimiento': <BookOpen size={16} />,
    'IA': <Bot size={16} />,
    'Widget': <Headphones size={16} />,
    'Auditoría': <Shield size={16} />,
    
    // Organización
    'Miembros': <Users size={16} />,
    'Invitaciones': <Plus size={16} />,
    'Información': <Building2 size={16} />,
    'Mi Plan': <CreditCard size={16} />,
    'Módulos': <Package size={16} />,
    'Dominios': <Globe size={16} />,
    'Branding': <Palette size={16} />,
    'Sucursales': <MapPin size={16} />,
    'Mis Organizaciones': <Building2 size={16} />,
    
    // Admin
    'Roles y Permisos': <Shield size={16} />,
    
    // Gimnasio
    'Check-in': <LogIn size={16} />,
    'Membresías': <Users size={16} />,
    'Planes': <CreditCard size={16} />,
    'Clases': <Calendar size={16} />,
    'Reservaciones': <CalendarCheck size={16} />,
    'Instructores': <User size={16} />,
    
    // Transporte
    'Transportadoras': <Truck size={16} />,
    'Vehículos': <Truck size={16} />,
    'Conductores': <User size={16} />,
    'Paradas': <MapPin size={16} />,
    'Rutas': <MapPin size={16} />,
    'Horarios': <Clock size={16} />,
    'Direcciones Clientes': <MapPin size={16} />,
    'Viajes': <Calendar size={16} />,
    'Boletos': <Ticket size={16} />,
    'Tarifas Pasajeros': <DollarSign size={16} />,
    'Envíos': <Package size={16} />,
    'Tarifas Envío': <DollarSign size={16} />,
    'Tracking': <Search size={16} />,
    'Etiquetas Envío': <Tag size={16} />,
    'Manifiestos': <ClipboardList size={16} />,
    'Incidentes': <Shield size={16} />,
    
    // Notificaciones
    'Alertas': <Shield size={16} />,
    'Reglas': <Shield size={16} />,
    'Canales de Envío': <MessageSquare size={16} />,
    'Plantillas': <FileText size={16} />,
    'Logs de Envío': <Activity size={16} />,
    'Preferencias': <Settings size={16} />,
    
    // Integraciones
    'Conexiones': <Link2 size={16} />,
    'Eventos': <Activity size={16} />,
    'Jobs': <Briefcase size={16} />,
    'Mapeos': <GitMerge size={16} />,
    'API Keys': <Key size={16} />,
    'Webhooks': <Send size={16} />,
    
    // Timeline
    'Timeline': <History size={16} />,
    'Exportaciones': <FileText size={16} />,
    
    // Reportes
    'Hotelería': <BedDouble size={16} />,
    'HRM': <UserCog size={16} />,
    'Personalizado': <Wrench size={16} />,
    'Programados': <Clock size={16} />,
  };

  return iconMap[name] || <FileText size={16} />;
};

const SubMenuPanelComponent = ({ 
  activeModule, 
  collapsed,
  onNavigate,
  isOpen,
  onToggle
}: SubMenuPanelProps) => {
  const pathname = usePathname();
  const router = useRouter();

  const handlePrefetch = useCallback((href: string) => {
    router.prefetch(href);
  }, [router]);

  const handleNavigation = useCallback(() => {
    onNavigate?.();
  }, [onNavigate]);

  // Si no hay módulo activo o no tiene submenú, no mostrar el panel
  if (!activeModule || !activeModule.submenu || activeModule.submenu.length === 0) {
    return null;
  }

  // Función para determinar si un item está activo
  // Dashboard/Panel/Vista General solo se marca como activo si la ruta es exactamente igual
  const isItemActive = (itemHref: string, itemName: string): boolean => {
    const isExactMatchItem = itemName === 'Dashboard' || itemName === 'Panel HRM' || itemName === 'POS' || itemName === 'Vista General';
    
    if (isExactMatchItem) {
      // Solo activo si la ruta es exactamente igual
      return pathname === itemHref;
    }
    
    // Para otros items, activo si es exacto o si está dentro de la sección
    return pathname === itemHref || (pathname?.startsWith(itemHref + '/') ?? false);
  };

  return (
    <div 
      className={`
        hidden lg:flex flex-col
        h-full 
        ${isOpen ? 'w-56' : 'w-0'}
        bg-gray-50 dark:bg-gray-900
        border-r border-gray-200 dark:border-gray-700
        transition-all duration-300 ease-in-out
        overflow-hidden
      `}
    >
      {/* Header del panel - misma altura y padding que el sidebar principal */}
      <div className="flex items-center justify-between p-4 min-h-[60px] bg-blue-600 flex-shrink-0">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-white flex-shrink-0">
            {activeModule.icon}
          </span>
          <h2 className="text-lg font-bold text-white truncate">
            {activeModule.name}
          </h2>
        </div>
        
        {/* Botón para cerrar el panel */}
        <button
          onClick={onToggle}
          className="flex items-center justify-center h-8 w-8 rounded-full bg-blue-700 text-white hover:bg-blue-800 transition-colors flex-shrink-0 ml-2"
          aria-label="Cerrar panel de submenú"
        >
          <PanelLeftClose size={16} />
        </button>
      </div>

      {/* Lista de submenús con scroll */}
      <div className="flex-1 overflow-y-auto py-2 px-2">
        <nav className="space-y-0.5">
          {activeModule.submenu.map((subItem, idx) => {
            const isActive = isItemActive(subItem.href, subItem.name);
            
            return (
              <Link
                key={idx}
                href={subItem.href}
                prefetch={true}
                onClick={handleNavigation}
                onMouseEnter={() => handlePrefetch(subItem.href)}
                className={`
                  flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm
                  transition-all duration-150 ease-in-out
                  group relative
                  ${isActive
                    ? 'bg-blue-100 text-blue-700 font-medium dark:bg-blue-900/40 dark:text-blue-300'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200'
                  }
                `}
              >
                {/* Indicador de activo */}
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-blue-600 dark:bg-blue-400 rounded-r-full" />
                )}
                
                <span className={`
                  flex-shrink-0 transition-colors
                  ${isActive
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-gray-500 group-hover:text-blue-500 dark:text-gray-400 dark:group-hover:text-blue-400'
                  }
                `}>
                  {subItem.icon || getSubmenuIcon(subItem.name)}
                </span>
                
                <span className="truncate">{subItem.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer opcional con info del módulo */}
      <div className="flex-shrink-0 px-3 py-2 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
          {activeModule.submenu.length} opciones
        </p>
      </div>
    </div>
  );
};

export const SubMenuPanel = memo(SubMenuPanelComponent);
