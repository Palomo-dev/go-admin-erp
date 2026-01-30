'use client';
import React, { useMemo, memo } from 'react';

// Importamos los componentes de Tooltip de Radix UI
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { 
  Bell, 
  Building2, 
  Bus,
  MessageCircle, 
  Calendar, 
  CalendarClock, 
  CreditCard, 
  FileText, 
  HomeIcon, 
  LogOut, 
  Package, 
  Settings, 
  ShoppingCart, 
  User, 
  Users, 
  BarChart3,
  Shield,
  UserCog,
  Banknote,
  Clock,
  Globe,
  FileBarChart,
  Home,
  Inbox,
  Target,
  TrendingUp,
  TrendingDown,
  Activity,
  ClipboardList,
  Tag,
  Megaphone,
  Briefcase,
  UserCheck,
  DollarSign,
  HandCoins,
  Wallet,
  Receipt,
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
  Plus,
  Calculator,
  Zap,
  Dumbbell,
  LogIn,
  CalendarCheck,
  Ticket,
  Search
} from 'lucide-react';
import ProfileDropdownMenu from '../ProfileDropdownMenu';
import { NavItem } from './NavItem';
import { NavSection } from './NavSection';
import { SidebarNavigationProps } from '../types';

// Componente para la navegación lateral
const SidebarNavigationComponent = ({ 
  handleSignOut, 
  loading, 
  userData, 
  orgName,
  collapsed,
  onNavigate
}: SidebarNavigationProps) => {
  const pathname = usePathname();
  
  // Memoizar las secciones de navegación para evitar re-creaciones costosas
  const navSections = useMemo(() => [
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
            { name: "POS", href: "/app/pos", icon: <ShoppingCart size={16} /> },
            { name: "Pedidos Online", href: "/app/pos/pedidos-online", icon: <Globe size={16} /> },
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
          name: "Transporte", 
          href: "/app/transporte", 
          icon: <Bus size={18} />,
          submenu: [
            { name: "Dashboard", href: "/app/transporte", icon: <Home size={16} /> },
            { name: "Transportadoras", href: "/app/transporte/transportadoras", icon: <Truck size={16} /> },
            { name: "Vehículos", href: "/app/transporte/vehiculos", icon: <Bus size={16} /> },
            { name: "Conductores", href: "/app/transporte/conductores", icon: <User size={16} /> },
            { name: "Paradas", href: "/app/transporte/paradas", icon: <MapPin size={16} /> },
            { name: "Rutas", href: "/app/transporte/rutas", icon: <MapPin size={16} /> },
            { name: "Horarios", href: "/app/transporte/horarios", icon: <Clock size={16} /> },
            { name: "Direcciones Clientes", href: "/app/transporte/direcciones-clientes", icon: <MapPin size={16} /> },
            { name: "Viajes", href: "/app/transporte/viajes", icon: <Calendar size={16} /> },
            { name: "Boletos", href: "/app/transporte/boletos", icon: <Ticket size={16} /> },
            { name: "Tarifas Pasajeros", href: "/app/transporte/tarifas-pasajeros", icon: <DollarSign size={16} /> },
            { name: "Envíos", href: "/app/transporte/envios", icon: <Package size={16} /> },
            { name: "Tarifas Envío", href: "/app/transporte/tarifas-envio", icon: <DollarSign size={16} /> },
            { name: "Tracking", href: "/app/transporte/tracking", icon: <Search size={16} /> },
            { name: "Etiquetas", href: "/app/transporte/etiquetas", icon: <Tag size={16} /> },
            { name: "Manifiestos", href: "/app/transporte/manifiestos", icon: <ClipboardList size={16} /> },
            { name: "Incidentes", href: "/app/transporte/incidentes", icon: <Shield size={16} /> },
          ]
        },
        { 
          name: "Gimnasio", 
          href: "/app/gym", 
          icon: <Dumbbell size={18} />,
          submenu: [
            { name: "Dashboard", href: "/app/gym", icon: <Home size={16} /> },
            { name: "Check-in", href: "/app/gym/checkin", icon: <LogIn size={16} /> },
            { name: "Membresías", href: "/app/gym/membresias", icon: <Users size={16} /> },
            { name: "Planes", href: "/app/gym/planes", icon: <CreditCard size={16} /> },
            { name: "Clases", href: "/app/gym/clases", icon: <Calendar size={16} /> },
            { name: "Horarios", href: "/app/gym/horarios", icon: <Clock size={16} /> },
            { name: "Reservaciones", href: "/app/gym/reservaciones", icon: <CalendarCheck size={16} /> },
            { name: "Instructores", href: "/app/gym/instructores", icon: <User size={16} /> },
            { name: "Reportes", href: "/app/gym/reportes", icon: <BarChart3 size={16} /> },
            { name: "Configuración", href: "/app/gym/ajustes", icon: <Settings size={16} /> },
          ]
        },
        { 
          name: "Parking", 
          href: "/app/parking", 
          icon: <ParkingCircle size={18} />,
          submenu: [
            { name: "Dashboard", href: "/app/parking", icon: <Home size={16} /> },
            { name: "Operación", href: "/app/parking/operacion", icon: <ParkingCircle size={16} /> },
            { name: "Abonados", href: "/app/parking/abonados", icon: <CreditCard size={16} /> },
            { name: "Tarifas", href: "/app/parking/tarifas", icon: <DollarSign size={16} /> },
            { name: "Espacios", href: "/app/parking/espacios", icon: <MapPin size={16} /> },
            { name: "Reportes", href: "/app/parking/reportes", icon: <BarChart3 size={16} /> },
          ]
        }
      ]
    },
    {
      title: "Organización",
      items: [
        /*{ name: "Calendario", href: "/app/calendario", icon: <Calendar size={18} /> },*/
        { name: "Clientes", href: "/app/clientes", icon: <Users size={18} /> },
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
       /*{{ name: "Reportes", href: "/app/reportes", icon: <BarChart3 size={18} /> },
        { name: "Timeline", href: "/app/timeline", icon: <CalendarClock size={18} /> },
        { name: "Transporte", href: "/app/transporte", icon: <Bus size={18} /> }*/
      ]
    },
     /*{
      title: "Sistema",
      items: [
        { name: "Notificaciones", href: "/app/notificaciones", icon: <Bell size={18} /> },
        { name: "Integraciones", href: "/app/integraciones", icon: <Settings size={18} /> }
      ]
    }*/
  ], []);
  
  return (
    <div className="flex flex-col h-full transition-all duration-300">
      {/* Contenedor superior para las secciones de navegación - con altura limitada */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="space-y-1 px-0 py-2 pb-32 lg:pb-4">
          {/* Secciones de navegación utilizando el componente NavSection */}
          {navSections.map((section, idx) => (
            <NavSection
              key={idx}
              title={section.title}
              items={section.items}
              collapsed={collapsed}
              sectionIdx={idx}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      </div>
      
      {/* Sección de perfil con el componente UserMenu compartido - siempre visible abajo */}
      <div className="flex-shrink-0 pt-3 mt-2 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 pb-safe-bottom pb-4">
        <div className="px-3">
          <ProfileDropdownMenu 
            userData={userData} 
            handleSignOut={handleSignOut} 
            loading={loading} 
            isSidebar={true} 
            collapsed={collapsed} 
            orgName={orgName || undefined} 
          />
        </div>
        
        {/* Botón de suscripción destacado */}
        <div className="px-3 mt-3 space-y-2">
          <TooltipProvider>
            {collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link 
                    href="/app/plan"
                    onClick={onNavigate}
                    className="w-full flex items-center justify-center px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 active:bg-blue-800 shadow-sm hover:shadow transition-all duration-200 border border-blue-500 min-h-[44px]"
                  >
                    <CreditCard size={18} />
                    <span className="lg:hidden ml-2">Mi Suscripción</span>
                  </Link>
                </TooltipTrigger>
                <TooltipContent 
                  side="right" 
                  sideOffset={10} 
                  className="bg-white text-gray-900 dark:bg-gray-100 dark:text-gray-800 border border-gray-200 rounded-lg py-1 px-2 shadow-md"
                >
                  Mi Suscripción
                </TooltipContent>
              </Tooltip>
            ) : (
              <Link 
                href="/app/plan"
                onClick={onNavigate}
                className="w-full flex items-center justify-center px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 active:bg-blue-800 shadow-sm hover:shadow transition-all duration-200 border border-blue-500 min-h-[44px]"
              >
                <CreditCard size={18} className="mr-2" />
                <span>Mi Suscripción</span>
              </Link>
            )}
          </TooltipProvider>
        
          {/* Botón de cerrar sesión */}
          <TooltipProvider>
            {collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleSignOut}
                    disabled={loading}
                    className="w-full flex items-center justify-center px-4 py-2.5 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 active:bg-red-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
                  >
                    <LogOut size={18} />
                    <span className="lg:hidden ml-2">{loading ? 'Cerrando...' : 'Cerrar Sesión'}</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent 
                  side="right" 
                  sideOffset={10} 
                  className="bg-white text-gray-900 dark:bg-gray-100 dark:text-gray-800 border border-gray-200 rounded-lg py-1 px-2 shadow-md"
                >
                  {loading ? 'Cerrando...' : 'Cerrar Sesión'}
                </TooltipContent>
              </Tooltip>
            ) : (
              <button
                onClick={handleSignOut}
                disabled={loading}
                className="w-full flex items-center justify-center px-4 py-2.5 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 active:bg-red-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
              >
                <LogOut size={18} className="mr-2" />
                <span>{loading ? 'Cerrando...' : 'Cerrar Sesión'}</span>
              </button>
            )}
          </TooltipProvider>
        </div>
      </div>
    </div>
  );
};

// Exportar con memo para evitar re-renders innecesarios
export const SidebarNavigation = memo(SidebarNavigationComponent);
