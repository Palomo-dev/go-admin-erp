'use client';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  ChevronsLeft, 
  ChevronsRight, 
  Building2,
  Users, 
  UserCog, 
  FileText,
  FileCheck2,
  Package, 
  ShoppingCart, 
  MessageCircle, 
  Settings,
  PanelLeft,
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
  TrendingDown,
  Dumbbell,
  LogIn,
  CalendarCheck,
  Search,
  ListChecks,
  LayoutGrid,
  Link2,
  Send,
  GitMerge,
  Upload,
  History,
  Palette,
  Bell,
  FileBarChart,
  CalendarClock,
  Radio,
  FolderKanban,
  ChefHat,
  Factory,
  QrCode,
  ShieldCheck,
  HeartPulse,
} from 'lucide-react';
import { OrganizationSelectorWrapper } from './OrganizationSelectorWrapper';
import { supabase } from '@/lib/supabase/config';
import { isAuthenticated } from '@/lib/supabase/auth-manager';
import { AppHeader } from './Header/AppHeader';
import { SidebarNavigation } from './Sidebar/SidebarNavigation';
import { SubMenuPanel } from './Sidebar/SubMenuPanel';
import AIAssistantPanel from './Header/AIAssistantPanel';
import { getOrganizationId, guardarOrganizacionActiva } from '@/lib/hooks/useOrganization';
import { useSubscriptionGuard } from '@/lib/hooks/useSubscriptionGuard';
import { useTheme } from 'next-themes';
import { themeService } from '@/lib/services/themeService';
import { usePathname, useRouter } from 'next/navigation';
import { NavItemProps } from './types';
import type { AssistantContext } from '@/lib/services/aiAssistantService';

// Importaciones estándar para evitar ChunkLoadError
import ModuleLimitNotification from '@/components/notifications/ModuleLimitNotification';
import { PageHeaderSkeleton, StatsSkeleton, CardListSkeleton } from '@/components/common/PageSkeletons';
import { ModuleProvider } from '@/lib/context/ModuleContext';
import { BranchProvider } from '@/lib/context/BranchContext';
import { NavigationProgress } from './NavigationProgress';
import { OfflineIndicator } from './OfflineIndicator';
import { moduleManagementService } from '@/lib/services/moduleManagementService';
import { jobPositionModuleAccessService } from '@/lib/services/jobPositionModuleAccessService';
import { getModuleCodeByHref } from '@/lib/config/modulePages';
import { registerUserDevice } from '@/lib/auth/organizationAuth';
import { getOrgColor } from '@/lib/utils/organizationColors';

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
      { name: "Clientes", href: "/app/crm/clientes", icon: <Users size={16} /> },
      { name: "Pipeline", href: "/app/crm/pipeline", icon: <Target size={16} /> },
      { name: "Oportunidades", href: "/app/crm/oportunidades", icon: <TrendingUp size={16} /> },
      { name: "Equipo", href: "/app/crm/equipo", icon: <Users size={16} /> },
      { name: "Pronóstico", href: "/app/crm/pronostico", icon: <BarChart3 size={16} /> },
      { name: "Actividades", href: "/app/crm/actividades", icon: <Activity size={16} /> },
      { name: "Segmentos", href: "/app/crm/segmentos", icon: <Tag size={16} /> },
      { name: "Campañas", href: "/app/crm/campanas", icon: <Megaphone size={16} /> },
      { name: "Salud Clientes", href: "/app/crm/salud", icon: <HeartPulse size={16} /> },
      { name: "Identidades", href: "/app/crm/identidades", icon: <User size={16} /> }
    ]
  },
  {
    name: "HRM",
    href: "/app/hrm/empleados",
    icon: <UserCog size={18} />,
    submenu: [
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
      { name: "Reglas País", href: "/app/hrm/reglas-pais", icon: <Globe size={16} /> }
    ]
  },
  {
    name: "Finanzas",
    href: "/app/finanzas/facturas-venta",
    icon: <FileText size={18} />,
    submenu: [
      { name: "Facturas de venta", href: "/app/finanzas/facturas-venta", icon: <FileText size={16} /> },
      { name: "Cotizaciones", href: "/app/finanzas/cotizaciones", icon: <ClipboardList size={16} /> },
      { name: "Facturas de compra", href: "/app/finanzas/facturas-compra", icon: <Receipt size={16} /> },
      { name: "Notas de crédito", href: "/app/finanzas/notas-credito", icon: <FileText size={16} /> },
      { name: "Ingresos", href: "/app/finanzas/ingresos", icon: <TrendingUp size={16} /> },
      { name: "Egresos", href: "/app/finanzas/egresos", icon: <TrendingDown size={16} /> },
      { name: "Transferencias", href: "/app/finanzas/transferencias", icon: <ArrowLeftRight size={16} /> },
      { name: "Cuentas por cobrar", href: "/app/finanzas/cuentas-por-cobrar", icon: <DollarSign size={16} /> },
      { name: "Saldos a favor", href: "/app/finanzas/saldos-a-favor", icon: <DollarSign size={16} /> },
      { name: "Cuentas por pagar", href: "/app/finanzas/cuentas-por-pagar", icon: <CreditCard size={16} /> },
      { name: "Bancos", href: "/app/finanzas/bancos", icon: <Building2 size={16} /> },
      { name: "Contabilidad", href: "/app/finanzas/contabilidad", icon: <Calculator size={16} /> },
      { name: "Plan de Cuentas", href: "/app/finanzas/contabilidad/plan-cuentas", icon: <ListChecks size={16} /> },
      { name: "Asientos", href: "/app/finanzas/contabilidad/asientos", icon: <FileText size={16} /> },
      { name: "Balance de Comprobación", href: "/app/finanzas/contabilidad/balance-comprobacion", icon: <BarChart3 size={16} /> },
      { name: "Estado de Resultados", href: "/app/finanzas/contabilidad/estado-resultados", icon: <TrendingUp size={16} /> },
      { name: "Balance General", href: "/app/finanzas/contabilidad/balance-general", icon: <Calculator size={16} /> },
      { name: "Mayor Contable", href: "/app/finanzas/contabilidad/mayor-contable", icon: <BookOpen size={16} /> },
      { name: "Reglas Contables", href: "/app/finanzas/reglas-contables", icon: <Shield size={16} /> },
      { name: "Períodos Fiscales", href: "/app/finanzas/contabilidad/periodos-fiscales", icon: <CalendarClock size={16} /> },
      { name: "Centro de Costos", href: "/app/finanzas/centro-costos", icon: <LayoutGrid size={16} /> },
      { name: "Activos Fijos", href: "/app/finanzas/activos-fijos", icon: <Package size={16} /> },
      { name: "Presupuestos", href: "/app/finanzas/presupuestos", icon: <Target size={16} /> },
      { name: "Facturación Electrónica", href: "/app/finanzas/facturacion-electronica", icon: <Zap size={16} /> },
      { name: "Documentos Soporte", href: "/app/finanzas/documentos-soporte", icon: <FileCheck2 size={16} /> },
      { name: "Impuestos", href: "/app/finanzas/impuestos", icon: <Percent size={16} /> },
      { name: "Monedas", href: "/app/finanzas/monedas", icon: <Globe size={16} /> },
      { name: "Métodos de pago", href: "/app/finanzas/metodos-pago", icon: <CreditCard size={16} /> },
      { name: "Comisiones", href: "/app/finanzas/comisiones", icon: <HandCoins size={16} /> }
    ]
  },
  {
    name: "Inventario",
    href: "/app/inventario/productos",
    icon: <Package size={18} />,
    submenu: [
      { name: "Productos", href: "/app/inventario/productos", icon: <Package size={16} /> },
      { name: "Stock", href: "/app/inventario/stock", icon: <Layers size={16} /> },
      { name: "Movimientos", href: "/app/inventario/movimientos", icon: <ArrowLeftRight size={16} /> },
      { name: "Ajustes", href: "/app/inventario/ajustes", icon: <Settings size={16} /> },
      { name: "Transferencias", href: "/app/inventario/transferencias", icon: <ArrowLeftRight size={16} /> },
      { name: "Categorías", href: "/app/inventario/categorias", icon: <FolderOpen size={16} /> },
      { name: "Etiquetas", href: "/app/inventario/etiquetas", icon: <Tag size={16} /> },
      { name: "Unidades", href: "/app/inventario/unidades", icon: <Hash size={16} /> },
      { name: "Conversiones", href: "/app/inventario/conversiones", icon: <ArrowLeftRight size={16} /> },
      { name: "Variantes - Tipos", href: "/app/inventario/variantes/tipos", icon: <Layers size={16} /> },
      { name: "Variantes - Valores", href: "/app/inventario/variantes/valores", icon: <Tag size={16} /> },
      { name: "Lotes", href: "/app/inventario/lotes", icon: <Package size={16} /> },
      { name: "Seriales", href: "/app/inventario/seriales", icon: <QrCode size={16} /> },
      { name: "Garantías", href: "/app/inventario/garantias", icon: <ShieldCheck size={16} /> },
      { name: "Imágenes", href: "/app/inventario/imagenes", icon: <ImageIcon size={16} /> },
      { name: "Proveedores", href: "/app/inventario/proveedores", icon: <Truck size={16} /> },
      { name: "Órdenes de Compra", href: "/app/inventario/ordenes-compra", icon: <ClipboardList size={16} /> },
      { name: "Recetas", href: "/app/inventario/recetas", icon: <ChefHat size={16} /> },
      { name: "Producción", href: "/app/inventario/produccion", icon: <Factory size={16} /> },
      { name: "Distribución", href: "/app/inventario/distribucion", icon: <Truck size={16} /> },
      { name: "Trazabilidad", href: "/app/inventario/reportes/trazabilidad", icon: <Search size={16} /> },
      { name: "Costo Recetas", href: "/app/inventario/reportes/costo-recetas", icon: <DollarSign size={16} /> }
    ]
  },
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
      { name: "Reservas Mesas", href: "/app/pos/reservas-mesas", icon: <CalendarClock size={16} /> },
      { name: "Comandas", href: "/app/pos/comandas", icon: <ClipboardList size={16} /> },
      { name: "Devoluciones", href: "/app/pos/devoluciones", icon: <Undo2 size={16} /> },
      { name: "Propinas", href: "/app/pos/propinas", icon: <Gift size={16} /> },
      { name: "Cargos Servicio", href: "/app/pos/cargos-servicio", icon: <Percent size={16} /> },
      { name: "Cupones", href: "/app/pos/cupones", icon: <Gift size={16} /> },
      { name: "Promociones", href: "/app/pos/promociones", icon: <Percent size={16} /> },
      { name: "Cuentas por Cobrar", href: "/app/pos/cuentas-por-cobrar", icon: <DollarSign size={16} /> },
    ]
  },
  {
    name: "PMS",
    href: "/app/pms/calendario",
    icon: <Building2 size={18} />,
    submenu: [
      { name: "Calendario", href: "/app/pms/calendario", icon: <CalendarDays size={16} /> },
      { name: "Reservas", href: "/app/pms/reservas", icon: <BookOpen size={16} /> },
      { name: "Grupos", href: "/app/pms/grupos", icon: <Users size={16} /> },
      { name: "Asignaciones", href: "/app/pms/asignaciones", icon: <MapPin size={16} /> },
      { name: "Llegadas (Check-in)", href: "/app/pms/checkin", icon: <Key size={16} /> },
      { name: "Salidas (Check-out)", href: "/app/pms/checkout", icon: <LogOutIcon size={16} /> },
      { name: "Espacios", href: "/app/pms/espacios", icon: <BedDouble size={16} /> },
      { name: "Servicios", href: "/app/pms/servicios", icon: <Settings size={16} /> },
      { name: "Tipos de Espacio", href: "/app/pms/tipos-espacio", icon: <Layers size={16} /> },
      { name: "Categorías", href: "/app/pms/categorias", icon: <FolderOpen size={16} /> },
      { name: "Tarifas", href: "/app/pms/tarifas", icon: <DollarSign size={16} /> },
      { name: "Limpieza", href: "/app/pms/housekeeping", icon: <Sparkles size={16} /> },
      { name: "Mantenimiento", href: "/app/pms/mantenimiento", icon: <Settings size={16} /> },
      { name: "Consumos", href: "/app/pms/folios", icon: <Receipt size={16} /> },
      { name: "Origenes", href: "/app/pms/origenes", icon: <Globe size={16} /> },
      { name: "Channel Manager", href: "/app/pms/channel-manager", icon: <Radio size={16} /> },
      { name: "Parquedero", href: "/app/pms/parking", icon: <ParkingCircle size={16} /> },
    ]
  },
  {
    name: "Proyectos",
    href: "/app/pm/proyectos",
    icon: <FolderKanban size={18} />,
    moduleCode: 'pm',
    submenu: [
      { name: "Proyectos", href: "/app/pm/proyectos", icon: <FolderKanban size={16} /> },
      { name: "Metas", href: "/app/pm/metas", icon: <Target size={16} /> },
      { name: "Tareas", href: "/app/pm/tareas", icon: <ClipboardList size={16} /> },
    ]
  },
  {
    name: "Chat",
    href: "/app/chat/bandeja",
    icon: <MessageCircle size={18} />,
    submenu: [
      { name: "Bandeja", href: "/app/chat/bandeja", icon: <Inbox size={16} /> },
      { name: "Canales", href: "/app/chat/canales", icon: <MessageSquare size={16} /> },
      { name: "Conocimiento", href: "/app/chat/conocimiento", icon: <BookOpen size={16} /> },
      { name: "IA", href: "/app/chat/ia", icon: <Bot size={16} /> },
      { name: "Widget", href: "/app/chat/widget/sesiones", icon: <Headphones size={16} /> },
      { name: "Auditoría", href: "/app/chat/auditoria", icon: <Shield size={16} /> },
    ]
  },
  { 
    name: "Calendario", 
    href: "/app/calendario", 
    icon: <CalendarDays size={18} />,
    submenu: [
      { name: "Vista General", href: "/app/calendario", icon: <CalendarDays size={16} /> },
      { name: "Recurrencias", href: "/app/calendario/recurrencias", icon: <GitMerge size={16} /> },
      { name: "Importar", href: "/app/calendario/importar", icon: <Upload size={16} /> },
    ]
  },
  { 
    name: "Organización", 
    href: "/app/organizacion", 
    icon: <Building2 size={18} />,
    moduleCode: 'organizations',
    submenu: [
      { name: "Información", href: "/app/organizacion/informacion", icon: <Building2 size={16} /> },
      { name: "Sitio Web", href: "/app/organizacion/branding", icon: <Palette size={16} /> },
      { name: "Dominios", href: "/app/organizacion/dominios", icon: <Globe size={16} /> },
      { name: "Miembros", href: "/app/organizacion/miembros", icon: <Users size={16} /> },
      { name: "Invitaciones", href: "/app/organizacion/invitaciones", icon: <Plus size={16} /> },
      { name: "Sucursales", href: "/app/organizacion/sucursales", icon: <MapPin size={16} /> },
      { name: "Módulos", href: "/app/organizacion/modulos", icon: <Package size={16} /> },
      { name: "Mi Plan", href: "/app/organizacion/plan", icon: <CreditCard size={16} /> },
      { name: "Mis Organizaciones", href: "/app/organizacion/mis-organizaciones", icon: <Building2 size={16} /> }
    ]
  },
  { 
    name: "Administración", 
    href: "/app/roles", 
    icon: <Settings size={18} />,
    moduleCode: 'roles',
    submenu: [
      { name: "Roles y Permisos", href: "/app/roles", icon: <Shield size={16} /> }
    ]
  },
  {
    name: "Gimnasio",
    href: "/app/gym/checkin",
    icon: <Dumbbell size={18} />,
    submenu: [
      { name: "Check-in", href: "/app/gym/checkin", icon: <LogIn size={16} /> },
      { name: "Membresías", href: "/app/gym/membresias", icon: <Users size={16} /> },
      { name: "Planes", href: "/app/gym/planes", icon: <CreditCard size={16} /> },
      { name: "Clases", href: "/app/gym/clases", icon: <Calendar size={16} /> },
      { name: "Horarios", href: "/app/gym/horarios", icon: <Clock size={16} /> },
      { name: "Reservaciones", href: "/app/gym/reservaciones", icon: <CalendarCheck size={16} /> },
      { name: "Instructores", href: "/app/gym/instructores", icon: <User size={16} /> }
    ]
  },
  {
    name: "Parqueadero",
    href: "/app/parking/operacion",
    icon: <ParkingCircle size={18} />,
    submenu: [
      { name: "Operación", href: "/app/parking/operacion", icon: <ParkingCircle size={16} /> },
      { name: "Sesiones", href: "/app/parking/sesiones", icon: <Clock size={16} /> },
      { name: "Abonados", href: "/app/parking/abonados", icon: <Users size={16} /> },
      { name: "Planes", href: "/app/parking/planes", icon: <ListChecks size={16} /> },
      { name: "Pagos", href: "/app/parking/pagos", icon: <Wallet size={16} /> },
      { name: "Tarifas", href: "/app/parking/tarifas", icon: <Receipt size={16} /> },
      { name: "Espacios", href: "/app/parking/espacios", icon: <LayoutGrid size={16} /> },
      { name: "Zonas", href: "/app/parking/zonas", icon: <MapPin size={16} /> },
      { name: "Mapa", href: "/app/parking/mapa", icon: <LayoutGrid size={16} /> }
    ]
  },
  {
    name: "Transporte",
    href: "/app/transporte/transportadoras",
    icon: <Truck size={18} />,
    submenu: [
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
      { name: "Mis Envíos", href: "/app/transporte/mis-envios", icon: <Truck size={16} /> },
      { name: "Tarifas Envío", href: "/app/transporte/tarifas-envio", icon: <DollarSign size={16} /> },
      { name: "Tracking", href: "/app/transporte/tracking", icon: <Target size={16} /> },
      { name: "Etiquetas", href: "/app/transporte/etiquetas", icon: <Tag size={16} /> },
      { name: "Manifiestos", href: "/app/transporte/manifiestos", icon: <ClipboardList size={16} /> },
      { name: "Incidentes", href: "/app/transporte/incidentes", icon: <Shield size={16} /> },
    ]
  },
  {
    name: "Notificaciones",
    href: "/app/notificaciones",
    icon: <Bell size={18} />,
    submenu: [
      { name: "Notificaciones", href: "/app/notificaciones", icon: <Bell size={16} /> },
      { name: "Bandeja", href: "/app/notificaciones/bandeja", icon: <Inbox size={16} /> },
      { name: "Alertas", href: "/app/notificaciones/alertas", icon: <Bell size={16} /> },
      { name: "Reglas", href: "/app/notificaciones/reglas", icon: <Shield size={16} /> },
      { name: "Canales", href: "/app/notificaciones/canales", icon: <Send size={16} /> },
      { name: "Plantillas", href: "/app/notificaciones/plantillas", icon: <FileText size={16} /> },
      { name: "Logs de Envío", href: "/app/notificaciones/logs", icon: <Activity size={16} /> },
    ]
  },
  { 
    name: "Integraciones", 
    href: "/app/integraciones", 
    icon: <Link2 size={18} />,
    submenu: [
      { name: "Conexiones", href: "/app/integraciones/conexiones", icon: <Link2 size={16} /> },
      { name: "Eventos", href: "/app/integraciones/eventos", icon: <Activity size={16} /> },
      { name: "Jobs", href: "/app/integraciones/jobs", icon: <Briefcase size={16} /> },
      { name: "Mapeos", href: "/app/integraciones/mapeos", icon: <GitMerge size={16} /> },
      { name: "API Keys", href: "/app/integraciones/api-keys", icon: <Key size={16} /> },
      { name: "Webhooks", href: "/app/integraciones/webhooks-salientes", icon: <Send size={16} /> },
    ]
  },
  { 
    name: "Timeline", 
    href: "/app/timeline", 
    icon: <History size={18} />,
    submenu: [
      { name: "Vista General", href: "/app/timeline", icon: <History size={16} /> },
      { name: "Exportaciones", href: "/app/timeline/exportaciones", icon: <FileText size={16} /> },
    ]
  },
  { 
    name: "Reportes", 
    href: "/app/reportes", 
    icon: <FileBarChart size={18} />,
  },
];

// Función para detectar el módulo activo basado en la ruta
const getActiveModule = (pathname: string | null): NavItemProps | null => {
  if (!pathname) return null;

  // Buscar el módulo que coincida con la ruta actual
  for (const navModule of MODULES_WITH_SUBMENU) {
    if (pathname === navModule.href || pathname.startsWith(navModule.href + '/')) {
      return navModule;
    }
    // Verificar también los items del submenú: algunos módulos tienen href
    // apuntando a una subpágina específica (ej: /app/inventario/productos),
    // por lo que la detección por href falla en otras subpáginas (ej: categorías).
    if (navModule.submenu) {
      for (const subItem of navModule.submenu) {
        if (pathname === subItem.href || pathname.startsWith(subItem.href + '/')) {
          return navModule;
        }
      }
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
  const router = useRouter();

  // Verificación client-side del estado de suscripción (segunda capa después del middleware)
  const subscriptionChecked = useSubscriptionGuard();
  
  // Detectar módulo activo para Multi-Column Layout
  const activeModule = useMemo(() => getActiveModule(pathname), [pathname]);
  
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

  // Flag de error de carga del logo (se declara aquí, se usa más abajo
  // después de que orgId esté disponible).
  const [logoLoadError, setLogoLoadError] = useState(false);
  
  // Estados para control del sidebar
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true); // Colapsado por defecto
  // El colapsado de sidebar es un concepto solo de escritorio (ancho fijo en móvil);
  // se usa para no mostrar la vista "icono colapsado" (sin interacción) en móvil.
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  useEffect(() => {
    const checkViewport = () => setIsMobileViewport(window.innerWidth < 1024);
    checkViewport();
    window.addEventListener('resize', checkViewport);
    return () => window.removeEventListener('resize', checkViewport);
  }, []);
  
  // Estado para controlar el panel de submenú Multi-Column
  const [subMenuPanelOpen, setSubMenuPanelOpen] = useState(true);
  
  // Estado para controlar el panel del Asistente de IA
  const [aiAssistantOpen, setAiAssistantOpen] = useState(false);
  
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

  // Logo de la organización activa (memoizado para evitar releer localStorage
  // en cada render y causar titileo/fallo de carga cuando el sidebar colapsa).
  // Se recalcula solo cuando cambia orgId o profileRefresh (cambio de org).
  const activeOrgLogo = useMemo(() => {
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
    // orgId y profileRefresh son dependencias intencionales: fuerzan a
    // releer localStorage cuando cambia la organización activa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, profileRefresh]);

  // Resetear el flag de error de carga cuando cambia el logo
  useEffect(() => {
    setLogoLoadError(false);
  }, [activeOrgLogo]);

  // Color determinístico de la organización activa (para el avatar sin logo)
  const orgColor = useMemo(() => getOrgColor(orgId ? parseInt(orgId, 10) : null), [orgId]);

  // Estado para saber si el usuario actual es administrador de la organización
  // (controla, por ejemplo, la visibilidad de ModuleLimitNotification)
  const [isOrgAdmin, setIsOrgAdmin] = useState(false);
  
  // Estado para módulos activos de la organización (controla visibilidad del sidebar)
  const [activeModuleCodes, setActiveModuleCodes] = useState<string[] | undefined>(undefined);
  // Estado para páginas activas por módulo: { moduleCode: [pageHref, ...] }
  const [activeModulePages, setActiveModulePages] = useState<Record<string, string[]> | undefined>(undefined);
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
    } catch (error) {
      console.error('Error cargando módulos activos:', error);
      setActiveModuleCodes(undefined);
      setActiveModulePages(undefined);
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

  // Verificar si el usuario actual es administrador de la organización activa
  useEffect(() => {
    if (!orgId) {
      setIsOrgAdmin(false);
      return;
    }

    const checkOrgAdmin = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const userId = session?.user?.id;
        if (!userId) {
          setIsOrgAdmin(false);
          return;
        }

        const { data, error } = await supabase
          .from('organization_members')
          .select('is_super_admin')
          .eq('user_id', userId)
          .eq('organization_id', orgId)
          .maybeSingle();

        if (error) throw error;
        setIsOrgAdmin(!!data?.is_super_admin);
      } catch (error) {
        console.error('Error verificando rol de administrador:', error);
        setIsOrgAdmin(false);
      }
    };

    checkOrgAdmin();
  }, [orgId]);

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
        .single();

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

      // Fallback: si no hay org en localStorage, obtener last_org_id del perfil
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

      // Validación temprana: verificar que el usuario sigue siendo miembro
      // activo de la org guardada. Si la org fue eliminada o el usuario fue
      // removido, buscar la org real y corregir localStorage antes de que
      // otros componentes disparen consultas con un org_id obsoleto.
      if (currentOrgId && currentOrgId > 0) {
        const { data: validMember } = await supabase
          .from('organization_members')
          .select('organization_id, organizations(id, name)')
          .eq('user_id', user.id)
          .eq('organization_id', currentOrgId)
          .eq('is_active', true)
          .maybeSingle();

        if (!validMember) {
          // La org guardada no es válida — buscar la primera org activa del usuario
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
            // Limpiar cache de usuario para que no se usen datos de la org anterior
            try { localStorage.removeItem('appLayout_userData_cache'); } catch {}
          } else {
            // El usuario no tiene ninguna org activa
            console.warn('⚠️ Usuario no tiene ninguna organización activa');
            currentOrgId = 0;
          }
        }
      }

      setOrgId(currentOrgId.toString());

      // Intentar cargar desde cache primero
      const cachedData = loadFromCache();
      if (cachedData && cachedData.orgId === currentOrgId.toString()) {
        console.log('⚡ Datos cargados desde cache');
        setUserData(cachedData.data);
        setOrgName(cachedData.orgName);

        const { updateSavedAccountProfile } = await import('@/lib/auth/accountSwitcher');
        updateSavedAccountProfile(user.id, { name: cachedData.data.name, avatarUrl: cachedData.data.avatar });

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
        console.warn('Consulta unificada falló, usando fallback:', unifiedError.code || unifiedError.message || 'unknown');

        // Si el error es PGRST116 (0 rows), el org_id en localStorage podría ser inválido.
        // Buscar la organización real del usuario sin filtrar por org_id.
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

      // Sincronizar el nombre real del perfil con el selector de cuentas guardadas:
      // ese registro solo conoce el auth user_metadata (a veces sin nombre), por lo
      // que sin esto el selector muestra el correo repetido en vez del nombre.
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
    
    // Configurar canal de suscripción para cambios en el perfil
    const setupProfileSubscription = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const userId = session?.user?.id;
        
        if (!userId) {
          console.warn('No user ID available for profile subscription');
          return;
        }
        
        const subscription = supabase
          .channel('public:profiles')
          .on('postgres_changes', 
            { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
            () => {
              // Actualizar al detectar cambios
              setProfileRefresh(prev => prev + 1);
            }
          )
          .subscribe();
        
        return () => {
          subscription.unsubscribe();
        };
      } catch (error) {
        console.error('Error setting up profile subscription:', error);
      }
    };
    
    setupProfileSubscription();
  }, [loadUserProfileOptimized, profileRefresh]);
  
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
            const org = member.organizations as any;
            const orgIdStr = org.id.toString();
            // Persistir en localStorage para futuras cargas
            localStorage.setItem('currentOrganizationId', orgIdStr);
            if (org.name) localStorage.setItem('currentOrganizationName', org.name);
            if (org.subdomain) localStorage.setItem('organization', org.subdomain);
            setOrgId(orgIdStr);
            if (org.name) setOrgName(org.name);
            // Notificar a otros componentes
            window.dispatchEvent(new CustomEvent('organization-changed'));
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
      
      // Invalidar caché en memoria de branch_id
      const { invalidateBranchIdCache } = await import('@/lib/hooks/useOrganization');
      invalidateBranchIdCache();
      
      // Quitar esta cuenta del selector de cuentas (ya no debe ofrecerse
      // para cambio instantáneo, pues su sesión se está cerrando)
      const { getActiveAccountUserId, removeSavedAccount } = await import('@/lib/auth/accountSwitcher');
      const activeAccountId = getActiveAccountUserId();
      if (activeAccountId) removeSavedAccount(activeAccountId);
      
      // Importar dinámicamente la función signOut para evitar referencias circulares
      const { signOut } = await import('@/lib/supabase/config');
      const { error } = await signOut();
      
      if (error) {
        console.error('Error al cerrar sesión:', error);
        return;
      }
      
      console.log('Sesión cerrada exitosamente');
      
      // Redireccionar a login (usar replace para no volver atrás)
      window.location.replace('/auth/login');
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
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

  // Si estamos en la página de cuenta congelada, renderizar sin layout (sin sidebar/header)
  if (pathname?.startsWith('/app/cuenta-congelada')) {
    return <>{children}</>;
  }

  return (
    <ModuleProvider>
      <BranchProvider>
      {/* Barra de progreso de navegación - feedback visual inmediato */}
      <NavigationProgress />
      {/* Indicador offline para app de escritorio */}
      <OfflineIndicator />
      
      <div className="flex h-dynamic-screen overflow-hidden">
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
        h-dynamic-screen overflow-hidden
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
            <div className={`flex-shrink-0 mx-3 mt-3 mb-2 ${sidebarCollapsed && !isMobileViewport ? 'p-2 lg:relative lg:group' : 'p-3'} ${orgColor.containerBg} rounded-lg shadow-md border ${orgColor.containerBorder} transition-all duration-200 hover:shadow-lg`}>
              {/* Organización para sidebar colapsado (solo escritorio: en móvil el ancho es fijo) */}
              {sidebarCollapsed && !isMobileViewport && (
                <>
                  {/* Icono/Logo centrado cuando está colapsado */}
                  <div className="flex justify-center items-center">
                    {activeOrgLogo && !logoLoadError ? (
                      <div className="w-8 h-8 lg:w-7 lg:h-7 lg:mx-auto">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={activeOrgLogo}
                          alt="Logo"
                          onError={() => setLogoLoadError(true)}
                          className={`w-full h-full object-cover rounded-full border-2 ${orgColor.border} shadow-sm`}
                        />
                      </div>
                    ) : (
                      <div className={`w-8 h-8 lg:w-7 lg:h-7 lg:mx-auto flex items-center justify-center rounded-full ${orgColor.bg} text-white font-medium shadow-sm border-2 ${orgColor.border}`}>
                        {orgName && orgName.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className={`ml-3 lg:hidden text-sm font-medium ${orgColor.text} truncate flex-1`}>{orgName}</span>
                  </div>

                  {/* Tooltip para mostrar el nombre de la organización cuando está contraído */}
                  <div className="absolute left-full top-1/2 transform -translate-y-1/2 ml-2 pl-2 hidden lg:group-hover:block z-50 whitespace-nowrap">
                    <div className="bg-gray-800 text-white text-sm py-1 px-3 rounded shadow-lg flex items-center">
                      {activeOrgLogo && !logoLoadError ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={activeOrgLogo}
                          alt="Logo"
                          onError={() => setLogoLoadError(true)}
                          className="w-5 h-5 rounded-full mr-2 object-cover border border-gray-300 dark:border-gray-700 shadow-sm"
                        />
                      ) : (
                        <div className={`w-5 h-5 mr-2 flex items-center justify-center rounded-full ${orgColor.bg} text-white text-xs font-medium shadow-sm border border-gray-300 dark:border-gray-700`}>
                          {orgName && orgName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      {orgName}
                    </div>
                  </div>
                </>
              )}
              
              {/* Selector de organizaciones interactivo: siempre en móvil, o en escritorio cuando no está colapsado */}
              {(!sidebarCollapsed || isMobileViewport) && (
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
              activeModuleCodes={activeModuleCodes}
              activeModulePages={activeModulePages}
              jobPositionVisibleModules={jobPositionVisibleModules}
              jobPositionVisiblePages={jobPositionVisiblePages}
            />
          </div>
        </div>
      </div>
      
      {/* Panel de submenú Multi-Column - Solo visible en desktop cuando hay módulo activo y >1 página activa */}
      {activeModule && activeModule.submenu && (() => {
        const moduleCode = getModuleCodeByHref(activeModule.href);
        const activePages = activeModulePages?.[moduleCode || ''];
        let filteredSubmenu = activePages !== undefined
          ? activeModule.submenu.filter(item => activePages.includes(item.href))
          : activeModule.submenu;
        // Filtrar también por acceso del cargo a páginas
        if (jobPositionVisiblePages !== null && jobPositionVisiblePages !== undefined) {
          filteredSubmenu = filteredSubmenu.filter(item => jobPositionVisiblePages.includes(item.href));
        }
        const filteredModule = { ...activeModule, submenu: filteredSubmenu };
        // Solo mostrar el panel si hay más de 1 página activa
        return filteredSubmenu.length > 1 ? (
          <SubMenuPanel 
            activeModule={filteredModule}
            collapsed={sidebarCollapsed}
            onNavigate={() => setSidebarOpen(false)}
            isOpen={subMenuPanelOpen}
            onToggle={() => setSubMenuPanelOpen(!subMenuPanelOpen)}
          />
        ) : null;
      })()}
      
      {/* Botón flotante para abrir el panel cuando está cerrado - solo si >1 página activa */}
      {activeModule && activeModule.submenu && !subMenuPanelOpen && (() => {
        const moduleCode = getModuleCodeByHref(activeModule.href);
        const activePages = activeModulePages?.[moduleCode || ''];
        let filteredCount = activePages !== undefined
          ? activeModule.submenu.filter(item => activePages.includes(item.href)).length
          : activeModule.submenu.length;
        // Considerar también el filtrado por cargo
        if (jobPositionVisiblePages !== null && jobPositionVisiblePages !== undefined) {
          filteredCount = activeModule.submenu.filter(item => 
            (activePages === undefined || activePages.includes(item.href)) && jobPositionVisiblePages.includes(item.href)
          ).length;
        }
        return filteredCount > 1 ? (
          <button
            onClick={() => setSubMenuPanelOpen(true)}
            className="hidden lg:flex items-center justify-center h-10 w-10 bg-blue-600 hover:bg-blue-700 text-white rounded-r-lg shadow-lg transition-all duration-200 fixed left-20 top-1/2 -translate-y-1/2 z-40"
            style={{ left: sidebarCollapsed ? '80px' : '256px' }}
            aria-label="Abrir panel de submenú"
          >
            <PanelLeft size={20} />
          </button>
        ) : null;
      })()}
      
      {/* Área de contenido principal */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Header del panel de administración */}
        <AppHeader 
          theme={nextTheme === 'dark' ? 'dark' : 'light'}
          toggleTheme={toggleTheme}
          userData={userData}
          orgId={orgId}
          handleSignOut={handleSignOut}
          loading={loading}
          setSidebarOpen={setSidebarOpen}
          aiAssistantOpen={aiAssistantOpen}
          onToggleAIAssistant={() => setAiAssistantOpen(!aiAssistantOpen)}
        />
        
        {/* Contenido principal con scroll */}
        <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900 overscroll-contain min-w-0">
          <div className="h-full min-w-0 w-full">
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
          className="hidden lg:flex items-center justify-center h-10 w-10 bg-blue-600 hover:bg-blue-700 text-white rounded-l-lg shadow-lg transition-all duration-200 fixed right-0 top-1/2 -translate-y-1/2 z-40"
          aria-label="Abrir GO Assistant"
          title="GO Assistant"
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

      </div>
      </BranchProvider>
    </ModuleProvider>
  );
};
