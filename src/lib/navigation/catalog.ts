/**
 * Catálogo de navegación — la ÚNICA lista de módulos y páginas de la app.
 *
 * Antes había cuatro copias escritas a mano que ya no coincidían entre sí:
 * `AppLayout.MODULES_WITH_SUBMENU` (panel de submenú), `SidebarNavigation`
 * (sidebar), `MODULE_PAGES` en `src/lib/config/modulePages.ts` (páginas que se
 * pueden activar por organización) y las páginas del buscador. El CRM tenía 16
 * páginas en un sitio y 10 en otro; «Clientes» y «Configuración» no existían en
 * el panel; el menú de Notificaciones cambiaba según el NOMBRE del rol.
 *
 * Qué NO decide este archivo: qué ve cada organización y cada persona. Eso
 * sale de la base de datos (`organization_modules`, `organization_module_pages`,
 * acceso por cargo) y de las capacidades calculadas en el servidor, y lo aplica
 * `filtrarNavegacion()`. Aquí solo está el mapa completo.
 *
 * Los nombres de módulo son claves i18n (`nav.*`). Los de página y grupo se
 * quedan aquí en español como valor canónico (los usan `modulePages.ts` y la
 * configuración de páginas por organización), y en pantalla se traducen con
 * claves derivadas: `nav.paginas.<clavePagina(href)>` y
 * `nav.grupos.<claveGrupo(grupo)>` (ver `useNombresNav`). Una página nueva
 * necesita su clave en es/en/fr/pt: `__tests__/traducciones.test.ts` lo exige.
 */
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  ArrowLeftRight,
  BadgePercent,
  Banknote,
  BarChart3,
  BedDouble,
  Bell,
  BookOpen,
  Bot,
  Boxes,
  Briefcase,
  Building,
  Building2,
  Bus,
  Calculator,
  Calendar,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  ChefHat,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Coins,
  CreditCard,
  DollarSign,
  Dumbbell,
  Factory,
  FileBarChart,
  FileCheck2,
  FileText,
  FolderKanban,
  FolderOpen,
  Gift,
  GitBranch,
  GitMerge,
  Globe,
  Grid3x3,
  HandCoins,
  Hash,
  Headphones,
  History,
  Home,
  Image as ImageIcon,
  Inbox,
  Info,
  Key,
  Landmark,
  Layers,
  LayoutGrid,
  Link2,
  ListChecks,
  LogIn,
  LogOut,
  MapPin,
  MessageCircle,
  MessageSquare,
  Package,
  Palette,
  ParkingCircle,
  Percent,
  PiggyBank,
  QrCode,
  Radio,
  Receipt,
  ReceiptText,
  Search,
  Send,
  Settings,
  Shield,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Tag,
  Tags,
  Target,
  Ticket,
  TrendingDown,
  TrendingUp,
  Truck,
  Undo2,
  Upload,
  User,
  UserCheck,
  UserCog,
  UserPlus,
  Users,
  UtensilsCrossed,
  Wallet,
  Zap,
} from 'lucide-react';
import { CRM_NAV_ENABLED } from '@/config/crmNav';

/** Secciones del sidebar, en el orden en que se pintan (diseño de Figma, página 03). */
export type CodigoSeccion = 'principal' | 'ventas' | 'gestion' | 'organizacion' | 'sistema';

export interface PaginaNav {
  href: string;
  nombre: string;
  icono: LucideIcon;
  /** Grupo dentro del panel de submenú (solo en módulos grandes). */
  grupo?: string;
  /**
   * Capacidad que exige la página, calculada en el servidor
   * (`/api/me/capacidades`). Nunca un nombre de rol.
   */
  requiere?: CapacidadNav;
  /**
   * `false` = página real que se puede activar por organización y asignar a un
   * cargo, pero que no sale en el menú (se llega desde otra página).
   */
  enMenu?: boolean;
}

export interface ModuloNav {
  /**
   * `modules.code` de la base de datos. `null` = núcleo siempre visible
   * (hoy solo «Inicio», que no es un módulo contratable).
   */
  codigo: string | null;
  /** Identificador estable en la UI (claves de React, tests). */
  id: string;
  /** Clave i18n del nombre: `nav.<etiqueta>`. */
  etiqueta: string;
  icono: LucideIcon;
  seccion: CodigoSeccion;
  /**
   * Prefijos de ruta que pertenecen al módulo, para saber cuál está activo.
   * El primero es la raíz del módulo.
   */
  rutas: string[];
  /** Páginas en orden. Si solo queda una visible, el módulo es un enlace directo. */
  paginas: PaginaNav[];
}

export type CapacidadNav = 'gestionarNotificaciones';

export const SECCIONES: { codigo: CodigoSeccion; etiqueta: string }[] = [
  { codigo: 'principal', etiqueta: 'sectionMain' },
  { codigo: 'ventas', etiqueta: 'sectionSales' },
  { codigo: 'gestion', etiqueta: 'sectionManagement' },
  { codigo: 'organizacion', etiqueta: 'sectionOrganization' },
  { codigo: 'sistema', etiqueta: 'sectionSystem' },
];

export const CATALOGO_NAV: ModuloNav[] = [
  // ─── Principal ────────────────────────────────────────────────────────────
  {
    codigo: null,
    id: 'inicio',
    etiqueta: 'home',
    icono: Home,
    seccion: 'principal',
    rutas: ['/app/inicio'],
    paginas: [{ href: '/app/inicio', nombre: 'Inicio', icono: Home }],
  },

  // ─── Ventas ───────────────────────────────────────────────────────────────
  {
    codigo: 'pos',
    id: 'pos',
    etiqueta: 'pointOfSale',
    icono: ShoppingCart,
    seccion: 'ventas',
    rutas: ['/app/pos'],
    paginas: [
      { href: '/app/pos', nombre: 'POS', icono: ShoppingCart, grupo: 'Venta' },
      { href: '/app/pos/pedidos-online', nombre: 'Pedidos online', icono: ShoppingBag, grupo: 'Venta' },
      { href: '/app/pos/ventas', nombre: 'Ventas', icono: Receipt, grupo: 'Venta' },
      { href: '/app/pos/cajas', nombre: 'Cajas', icono: Banknote, grupo: 'Venta' },
      { href: '/app/pos/devoluciones', nombre: 'Devoluciones', icono: Undo2, grupo: 'Venta' },
      { href: '/app/pos/cuentas-por-cobrar', nombre: 'Cuentas por cobrar', icono: Wallet, grupo: 'Venta' },
      { href: '/app/pos/mesas', nombre: 'Mesas', icono: UtensilsCrossed, grupo: 'Restaurante' },
      { href: '/app/pos/reservas-mesas', nombre: 'Reservas de mesas', icono: CalendarClock, grupo: 'Restaurante' },
      { href: '/app/pos/comandas', nombre: 'Comandas', icono: ChefHat, grupo: 'Restaurante' },
      { href: '/app/pos/propinas', nombre: 'Propinas', icono: Gift, grupo: 'Restaurante' },
      { href: '/app/pos/cargos-servicio', nombre: 'Cargos de servicio', icono: Coins, grupo: 'Restaurante' },
      { href: '/app/pos/cupones', nombre: 'Cupones', icono: Ticket, grupo: 'Promociones' },
      { href: '/app/pos/promociones', nombre: 'Promociones', icono: BadgePercent, grupo: 'Promociones' },
    ],
  },
  {
    codigo: 'clientes',
    id: 'clientes',
    etiqueta: 'clients',
    icono: Users,
    seccion: 'ventas',
    rutas: ['/app/clientes'],
    paginas: [{ href: '/app/clientes', nombre: 'Clientes', icono: Users }],
  },
  {
    codigo: 'crm',
    id: 'crm',
    etiqueta: 'crm',
    icono: Target,
    seccion: 'ventas',
    rutas: ['/app/crm'],
    // Fuente del CRM: src/config/crmNav.ts (la usa también el propio módulo).
    paginas: CRM_NAV_ENABLED.map((p) => ({ href: p.href, nombre: p.name, icono: p.icon })),
  },
  {
    codigo: 'chat',
    id: 'chat',
    etiqueta: 'chat',
    icono: MessageCircle,
    seccion: 'ventas',
    rutas: ['/app/chat'],
    paginas: [
      { href: '/app/chat/bandeja', nombre: 'Bandeja', icono: Inbox },
      { href: '/app/chat/canales', nombre: 'Canales', icono: MessageSquare },
      { href: '/app/chat/conocimiento', nombre: 'Conocimiento', icono: BookOpen },
      { href: '/app/chat/ia', nombre: 'IA', icono: Bot },
      // Se entra desde la página de IA; no va en el menú.
      { href: '/app/chat/ia/configuracion', nombre: 'Configuración de IA', icono: Settings, enMenu: false },
      { href: '/app/chat/widget/sesiones', nombre: 'Widget', icono: Headphones },
      { href: '/app/chat/auditoria', nombre: 'Auditoría', icono: Shield },
    ],
  },
  {
    codigo: 'pms_hotel',
    id: 'pms',
    etiqueta: 'pms',
    icono: BedDouble,
    seccion: 'ventas',
    rutas: ['/app/pms'],
    paginas: [
      { href: '/app/pms/calendario', nombre: 'Calendario', icono: CalendarDays, grupo: 'Reservas' },
      { href: '/app/pms/reservas', nombre: 'Reservas', icono: BookOpen, grupo: 'Reservas' },
      { href: '/app/pms/grupos', nombre: 'Grupos', icono: Users, grupo: 'Reservas' },
      { href: '/app/pms/asignaciones', nombre: 'Asignaciones', icono: MapPin, grupo: 'Reservas' },
      { href: '/app/pms/checkin', nombre: 'Llegadas (check-in)', icono: Key, grupo: 'Recepción' },
      { href: '/app/pms/checkout', nombre: 'Salidas (check-out)', icono: LogOut, grupo: 'Recepción' },
      { href: '/app/pms/folios', nombre: 'Consumos', icono: Receipt, grupo: 'Recepción' },
      { href: '/app/pms/parking', nombre: 'Parqueadero', icono: ParkingCircle, grupo: 'Recepción' },
      { href: '/app/pms/espacios', nombre: 'Espacios', icono: BedDouble, grupo: 'Inventario' },
      { href: '/app/pms/tipos-espacio', nombre: 'Tipos de espacio', icono: Layers, grupo: 'Inventario' },
      { href: '/app/pms/categorias', nombre: 'Categorías', icono: FolderOpen, grupo: 'Inventario' },
      { href: '/app/pms/servicios', nombre: 'Servicios', icono: Settings, grupo: 'Inventario' },
      { href: '/app/pms/tarifas', nombre: 'Tarifas', icono: DollarSign, grupo: 'Inventario' },
      { href: '/app/pms/housekeeping', nombre: 'Limpieza', icono: Sparkles, grupo: 'Operación' },
      { href: '/app/pms/mantenimiento', nombre: 'Mantenimiento', icono: Settings, grupo: 'Operación' },
      { href: '/app/pms/origenes', nombre: 'Orígenes', icono: Globe, grupo: 'Canales' },
      { href: '/app/pms/channel-manager', nombre: 'Channel Manager', icono: Radio, grupo: 'Canales' },
    ],
  },
  {
    codigo: 'gym',
    id: 'gym',
    etiqueta: 'gym',
    icono: Dumbbell,
    seccion: 'ventas',
    rutas: ['/app/gym'],
    paginas: [
      { href: '/app/gym/checkin', nombre: 'Check-in', icono: LogIn },
      { href: '/app/gym/membresias', nombre: 'Membresías', icono: Users },
      { href: '/app/gym/planes', nombre: 'Planes', icono: CreditCard },
      { href: '/app/gym/clases', nombre: 'Clases', icono: Calendar },
      { href: '/app/gym/horarios', nombre: 'Horarios', icono: Clock },
      { href: '/app/gym/reservaciones', nombre: 'Reservaciones', icono: CalendarCheck },
      { href: '/app/gym/instructores', nombre: 'Instructores', icono: User },
    ],
  },
  {
    codigo: 'parking',
    id: 'parking',
    etiqueta: 'parking',
    icono: ParkingCircle,
    seccion: 'ventas',
    rutas: ['/app/parking'],
    paginas: [
      { href: '/app/parking/operacion', nombre: 'Operación', icono: ParkingCircle },
      { href: '/app/parking/sesiones', nombre: 'Sesiones', icono: Clock },
      { href: '/app/parking/abonados', nombre: 'Abonados', icono: Users },
      { href: '/app/parking/planes', nombre: 'Planes', icono: ListChecks },
      { href: '/app/parking/pagos', nombre: 'Pagos', icono: Wallet },
      { href: '/app/parking/tarifas', nombre: 'Tarifas', icono: Receipt },
      { href: '/app/parking/espacios', nombre: 'Espacios', icono: LayoutGrid },
      { href: '/app/parking/zonas', nombre: 'Zonas', icono: MapPin },
      { href: '/app/parking/mapa', nombre: 'Mapa', icono: LayoutGrid },
    ],
  },
  {
    codigo: 'transport',
    id: 'transporte',
    etiqueta: 'transport',
    icono: Bus,
    seccion: 'ventas',
    rutas: ['/app/transporte'],
    paginas: [
      { href: '/app/transporte/viajes', nombre: 'Viajes', icono: Calendar, grupo: 'Pasajeros' },
      { href: '/app/transporte/boletos', nombre: 'Boletos', icono: Ticket, grupo: 'Pasajeros' },
      { href: '/app/transporte/tarifas-pasajeros', nombre: 'Tarifas de pasajeros', icono: DollarSign, grupo: 'Pasajeros' },
      { href: '/app/transporte/envios', nombre: 'Envíos', icono: Package, grupo: 'Envíos' },
      { href: '/app/transporte/mis-envios', nombre: 'Mis envíos', icono: Truck, grupo: 'Envíos' },
      { href: '/app/transporte/tarifas-envio', nombre: 'Tarifas de envío', icono: DollarSign, grupo: 'Envíos' },
      { href: '/app/transporte/tracking', nombre: 'Tracking', icono: Search, grupo: 'Envíos' },
      { href: '/app/transporte/etiquetas', nombre: 'Etiquetas', icono: Tag, grupo: 'Envíos' },
      { href: '/app/transporte/manifiestos', nombre: 'Manifiestos', icono: ClipboardList, grupo: 'Envíos' },
      { href: '/app/transporte/transportadoras', nombre: 'Transportadoras', icono: Truck, grupo: 'Operación' },
      { href: '/app/transporte/vehiculos', nombre: 'Vehículos', icono: Bus, grupo: 'Operación' },
      { href: '/app/transporte/conductores', nombre: 'Conductores', icono: User, grupo: 'Operación' },
      { href: '/app/transporte/paradas', nombre: 'Paradas', icono: MapPin, grupo: 'Operación' },
      { href: '/app/transporte/rutas', nombre: 'Rutas', icono: MapPin, grupo: 'Operación' },
      { href: '/app/transporte/horarios', nombre: 'Horarios', icono: Clock, grupo: 'Operación' },
      { href: '/app/transporte/direcciones-clientes', nombre: 'Direcciones de clientes', icono: MapPin, grupo: 'Operación' },
      { href: '/app/transporte/incidentes', nombre: 'Incidentes', icono: Shield, grupo: 'Operación' },
    ],
  },

  // ─── Gestión ──────────────────────────────────────────────────────────────
  {
    codigo: 'inventory',
    id: 'inventario',
    etiqueta: 'inventory',
    icono: Package,
    seccion: 'gestion',
    rutas: ['/app/inventario'],
    paginas: [
      { href: '/app/inventario/productos', nombre: 'Productos', icono: Package, grupo: 'Catálogo' },
      { href: '/app/inventario/categorias', nombre: 'Categorías', icono: Tags, grupo: 'Catálogo' },
      { href: '/app/inventario/etiquetas', nombre: 'Etiquetas', icono: Tag, grupo: 'Catálogo' },
      { href: '/app/inventario/variantes/tipos', nombre: 'Variantes · tipos', icono: Layers, grupo: 'Catálogo' },
      { href: '/app/inventario/variantes/valores', nombre: 'Variantes · valores', icono: Tag, grupo: 'Catálogo' },
      { href: '/app/inventario/unidades', nombre: 'Unidades', icono: Hash, grupo: 'Catálogo' },
      { href: '/app/inventario/conversiones', nombre: 'Conversiones', icono: ArrowLeftRight, grupo: 'Catálogo' },
      { href: '/app/inventario/imagenes', nombre: 'Imágenes', icono: ImageIcon, grupo: 'Catálogo' },
      { href: '/app/inventario/stock', nombre: 'Stock', icono: Boxes, grupo: 'Existencias' },
      { href: '/app/inventario/movimientos', nombre: 'Movimientos', icono: ArrowLeftRight, grupo: 'Existencias' },
      { href: '/app/inventario/ajustes', nombre: 'Ajustes', icono: ClipboardCheck, grupo: 'Existencias' },
      { href: '/app/inventario/transferencias', nombre: 'Transferencias', icono: ArrowLeftRight, grupo: 'Existencias' },
      { href: '/app/inventario/lotes', nombre: 'Lotes', icono: Layers, grupo: 'Existencias' },
      { href: '/app/inventario/seriales', nombre: 'Seriales', icono: QrCode, grupo: 'Existencias' },
      { href: '/app/inventario/garantias', nombre: 'Garantías', icono: ShieldCheck, grupo: 'Existencias' },
      { href: '/app/inventario/proveedores', nombre: 'Proveedores', icono: Truck, grupo: 'Compras' },
      { href: '/app/inventario/ordenes-compra', nombre: 'Órdenes de compra', icono: ClipboardList, grupo: 'Compras' },
      { href: '/app/inventario/recetas', nombre: 'Recetas', icono: ChefHat, grupo: 'Producción' },
      { href: '/app/inventario/produccion', nombre: 'Producción', icono: Factory, grupo: 'Producción' },
      { href: '/app/inventario/distribucion', nombre: 'Distribución', icono: Truck, grupo: 'Producción' },
      { href: '/app/inventario/reportes/trazabilidad', nombre: 'Trazabilidad', icono: Search, grupo: 'Reportes' },
      { href: '/app/inventario/reportes/costo-recetas', nombre: 'Costo de recetas', icono: DollarSign, grupo: 'Reportes' },
    ],
  },
  {
    codigo: 'finance',
    id: 'finanzas',
    etiqueta: 'finance',
    icono: Landmark,
    seccion: 'gestion',
    rutas: ['/app/finanzas'],
    paginas: [
      { href: '/app/finanzas/facturas-venta', nombre: 'Facturas de venta', icono: FileText, grupo: 'Documentos' },
      { href: '/app/finanzas/cotizaciones', nombre: 'Cotizaciones', icono: ClipboardList, grupo: 'Documentos' },
      { href: '/app/finanzas/facturas-compra', nombre: 'Facturas de compra', icono: ReceiptText, grupo: 'Documentos' },
      { href: '/app/finanzas/notas-credito', nombre: 'Notas crédito', icono: FileText, grupo: 'Documentos' },
      { href: '/app/finanzas/documentos-soporte', nombre: 'Documentos soporte', icono: FileCheck2, grupo: 'Documentos' },
      { href: '/app/finanzas/facturacion-electronica', nombre: 'Facturación electrónica', icono: Zap, grupo: 'Documentos' },
      { href: '/app/finanzas/ingresos', nombre: 'Ingresos', icono: TrendingUp, grupo: 'Tesorería' },
      { href: '/app/finanzas/egresos', nombre: 'Egresos', icono: TrendingDown, grupo: 'Tesorería' },
      { href: '/app/finanzas/transferencias', nombre: 'Transferencias', icono: ArrowLeftRight, grupo: 'Tesorería' },
      { href: '/app/finanzas/bancos', nombre: 'Bancos', icono: Building2, grupo: 'Tesorería' },
      { href: '/app/finanzas/cuentas-por-cobrar', nombre: 'Cuentas por cobrar', icono: Wallet, grupo: 'Tesorería' },
      { href: '/app/finanzas/saldos-a-favor', nombre: 'Saldos a favor', icono: PiggyBank, grupo: 'Tesorería' },
      { href: '/app/finanzas/cuentas-por-pagar', nombre: 'Cuentas por pagar', icono: HandCoins, grupo: 'Tesorería' },
      { href: '/app/finanzas/contabilidad', nombre: 'Contabilidad', icono: Calculator, grupo: 'Contabilidad' },
      { href: '/app/finanzas/contabilidad/plan-cuentas', nombre: 'Plan de cuentas', icono: ListChecks, grupo: 'Contabilidad' },
      { href: '/app/finanzas/contabilidad/asientos', nombre: 'Asientos', icono: FileText, grupo: 'Contabilidad' },
      { href: '/app/finanzas/contabilidad/mayor-contable', nombre: 'Mayor contable', icono: BookOpen, grupo: 'Contabilidad' },
      { href: '/app/finanzas/contabilidad/balance-comprobacion', nombre: 'Balance de comprobación', icono: BarChart3, grupo: 'Contabilidad' },
      { href: '/app/finanzas/contabilidad/estado-resultados', nombre: 'Estado de resultados', icono: TrendingUp, grupo: 'Contabilidad' },
      { href: '/app/finanzas/contabilidad/balance-general', nombre: 'Balance general', icono: Calculator, grupo: 'Contabilidad' },
      { href: '/app/finanzas/contabilidad/periodos-fiscales', nombre: 'Períodos fiscales', icono: CalendarClock, grupo: 'Contabilidad' },
      { href: '/app/finanzas/reglas-contables', nombre: 'Reglas contables', icono: Shield, grupo: 'Contabilidad' },
      { href: '/app/finanzas/centro-costos', nombre: 'Centros de costos', icono: GitBranch, grupo: 'Contabilidad' },
      { href: '/app/finanzas/activos-fijos', nombre: 'Activos fijos', icono: Building, grupo: 'Contabilidad' },
      { href: '/app/finanzas/presupuestos', nombre: 'Presupuestos', icono: Target, grupo: 'Contabilidad' },
      { href: '/app/finanzas/impuestos', nombre: 'Impuestos', icono: Percent, grupo: 'Configuración' },
      { href: '/app/finanzas/metodos-pago', nombre: 'Métodos de pago', icono: CreditCard, grupo: 'Configuración' },
      { href: '/app/finanzas/monedas', nombre: 'Monedas', icono: Coins, grupo: 'Configuración' },
      { href: '/app/finanzas/comisiones', nombre: 'Comisiones', icono: HandCoins, grupo: 'Configuración' },
    ],
  },
  {
    codigo: 'hrm',
    id: 'hrm',
    etiqueta: 'hrm',
    icono: UserCog,
    seccion: 'gestion',
    rutas: ['/app/hrm'],
    paginas: [
      { href: '/app/hrm/empleados', nombre: 'Empleados', icono: Users, grupo: 'Personas' },
      { href: '/app/hrm/departamentos', nombre: 'Departamentos', icono: Building2, grupo: 'Personas' },
      { href: '/app/hrm/cargos', nombre: 'Cargos', icono: Briefcase, grupo: 'Personas' },
      { href: '/app/hrm/turnos', nombre: 'Turnos', icono: Clock, grupo: 'Tiempo' },
      { href: '/app/hrm/marcacion', nombre: 'Marcación', icono: Clock, grupo: 'Tiempo' },
      { href: '/app/hrm/asistencia', nombre: 'Asistencia', icono: UserCheck, grupo: 'Tiempo' },
      { href: '/app/hrm/ausencias', nombre: 'Ausencias', icono: Calendar, grupo: 'Tiempo' },
      { href: '/app/hrm/nomina', nombre: 'Nómina', icono: DollarSign, grupo: 'Pagos' },
      { href: '/app/hrm/compensacion', nombre: 'Compensación', icono: HandCoins, grupo: 'Pagos' },
      { href: '/app/hrm/prestamos', nombre: 'Préstamos', icono: Wallet, grupo: 'Pagos' },
      { href: '/app/hrm/reglas-pais', nombre: 'Reglas por país', icono: Globe, grupo: 'Pagos' },
    ],
  },
  {
    codigo: 'pm',
    id: 'proyectos',
    etiqueta: 'projects',
    icono: FolderKanban,
    seccion: 'gestion',
    rutas: ['/app/pm'],
    paginas: [
      { href: '/app/pm/proyectos', nombre: 'Proyectos', icono: FolderKanban },
      { href: '/app/pm/metas', nombre: 'Metas', icono: Target },
      { href: '/app/pm/tareas', nombre: 'Tareas', icono: ClipboardList },
    ],
  },
  {
    codigo: 'calendar',
    id: 'calendario',
    etiqueta: 'calendar',
    icono: CalendarDays,
    seccion: 'gestion',
    rutas: ['/app/calendario'],
    paginas: [
      { href: '/app/calendario', nombre: 'Vista general', icono: CalendarDays },
      { href: '/app/calendario/recurrencias', nombre: 'Recurrencias', icono: GitMerge },
      { href: '/app/calendario/importar', nombre: 'Importar', icono: Upload },
    ],
  },
  {
    codigo: 'reports',
    id: 'reportes',
    etiqueta: 'reports',
    icono: FileBarChart,
    seccion: 'gestion',
    rutas: ['/app/reportes'],
    paginas: [{ href: '/app/reportes', nombre: 'Reportes', icono: FileBarChart }],
  },

  // ─── Organización ─────────────────────────────────────────────────────────
  {
    codigo: 'organizations',
    id: 'organizacion',
    etiqueta: 'myOrganization',
    icono: Building2,
    seccion: 'organizacion',
    rutas: ['/app/organizacion'],
    paginas: [
      { href: '/app/organizacion/informacion', nombre: 'Información', icono: Info },
      { href: '/app/organizacion/sucursales', nombre: 'Sucursales', icono: MapPin },
      { href: '/app/organizacion/miembros', nombre: 'Miembros', icono: UserCheck },
      { href: '/app/organizacion/invitaciones', nombre: 'Invitaciones', icono: UserPlus },
      { href: '/app/organizacion/modulos', nombre: 'Módulos', icono: Grid3x3 },
      { href: '/app/organizacion/plan', nombre: 'Mi plan', icono: CreditCard },
      { href: '/app/organizacion/branding', nombre: 'Sitio web', icono: Palette },
      { href: '/app/organizacion/dominios', nombre: 'Dominios', icono: Globe },
      { href: '/app/organizacion/mis-organizaciones', nombre: 'Mis organizaciones', icono: Building2 },
    ],
  },
  {
    codigo: 'roles',
    id: 'roles',
    etiqueta: 'roles',
    icono: Shield,
    seccion: 'organizacion',
    rutas: ['/app/roles', '/app/admin'],
    paginas: [{ href: '/app/roles', nombre: 'Roles y permisos', icono: Shield }],
  },
  {
    codigo: 'configuracion',
    id: 'configuracion',
    etiqueta: 'settings',
    icono: Settings,
    seccion: 'organizacion',
    rutas: ['/app/configuracion'],
    paginas: [{ href: '/app/configuracion', nombre: 'Configuración', icono: Settings }],
  },

  // ─── Sistema ──────────────────────────────────────────────────────────────
  {
    codigo: 'notifications',
    id: 'notificaciones',
    etiqueta: 'notifications',
    icono: Bell,
    seccion: 'sistema',
    rutas: ['/app/notificaciones'],
    paginas: [
      // Quien no gestiona notificaciones ve solo su bandeja (antes lo decidía
      // el nombre del rol en el navegador; ahora, el permiso en el servidor).
      { href: '/app/notificaciones', nombre: 'Resumen', icono: Bell, requiere: 'gestionarNotificaciones' },
      { href: '/app/notificaciones/bandeja', nombre: 'Bandeja', icono: Inbox },
      { href: '/app/notificaciones/alertas', nombre: 'Alertas', icono: Bell, requiere: 'gestionarNotificaciones' },
      { href: '/app/notificaciones/reglas', nombre: 'Reglas', icono: Shield, requiere: 'gestionarNotificaciones' },
      { href: '/app/notificaciones/canales', nombre: 'Canales de envío', icono: Send, requiere: 'gestionarNotificaciones' },
      { href: '/app/notificaciones/plantillas', nombre: 'Plantillas', icono: FileText, requiere: 'gestionarNotificaciones' },
      { href: '/app/notificaciones/logs', nombre: 'Registro de envíos', icono: Activity, requiere: 'gestionarNotificaciones' },
    ],
  },
  {
    codigo: 'integrations',
    id: 'integraciones',
    etiqueta: 'integrations',
    icono: Link2,
    seccion: 'sistema',
    rutas: ['/app/integraciones'],
    paginas: [
      { href: '/app/integraciones/conexiones', nombre: 'Conexiones', icono: Link2 },
      { href: '/app/integraciones/eventos', nombre: 'Eventos', icono: Activity },
      { href: '/app/integraciones/jobs', nombre: 'Trabajos', icono: Briefcase },
      { href: '/app/integraciones/mapeos', nombre: 'Mapeos', icono: GitMerge },
      { href: '/app/integraciones/api-keys', nombre: 'Llaves de API', icono: Key },
      { href: '/app/integraciones/webhooks-salientes', nombre: 'Webhooks', icono: Send },
    ],
  },
  {
    codigo: 'operations',
    id: 'operaciones',
    etiqueta: 'operations',
    icono: History,
    seccion: 'sistema',
    rutas: ['/app/timeline'],
    paginas: [
      { href: '/app/timeline', nombre: 'Vista general', icono: History },
      { href: '/app/timeline/exportaciones', nombre: 'Exportaciones', icono: FileText },
    ],
  },
];

/** Busca un módulo por su código de base de datos. */
export function moduloPorCodigo(codigo: string): ModuloNav | undefined {
  return CATALOGO_NAV.find((m) => m.codigo === codigo);
}

/**
 * Clave i18n de una página, derivada de su ruta: sin `/app/`, sin consulta y
 * con `_` en lugar de `/` (next-intl usa el punto como separador, así que la
 * clave nunca lleva puntos). `/app/finanzas/facturas-venta` →
 * `finanzas_facturas-venta`; se lee en `nav.paginas.<clave>`.
 */
export function clavePagina(href: string): string {
  const ruta = href.split(/[?#]/)[0].replace(/^\/app\/?/, '').replace(/\/+$/, '');
  return ruta.replace(/\//g, '_').replace(/\./g, '-') || 'app';
}

/**
 * Clave i18n de un grupo del panel de submenú: el nombre en minúsculas, sin
 * tildes y con guiones. «Tesorería» → `tesoreria`; se lee en `nav.grupos.<clave>`.
 */
export function claveGrupo(grupo: string): string {
  return grupo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
