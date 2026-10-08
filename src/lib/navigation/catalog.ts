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
  Wand2,
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
  /**
   * Flujo a pantalla completa (POS, mesas, check-in): aunque sale en el menú,
   * en móvil no lleva la barra inferior de la app (regla del 2026-09-29,
   * `shell/header/cabeceraMovil.tsx`).
   */
  pantallaCompleta?: boolean;
  /**
   * Línea de ayuda bajo el nombre, en español como valor canónico (igual que
   * `nombre`); se traduce con `nav.descripciones.<clavePagina(href)>`. Solo la
   * pinta el nivel 2 del menú móvil en los módulos con `drawer: 'filas'`
   * (Figma 01c: «Solo restaurantes», «Checkout, pagos y envíos»…).
   */
  descripcion?: string;
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
  /**
   * Cómo pinta sus páginas el nivel 2 del menú móvil. `'grupos'` (por defecto):
   * filas de texto bajo los rótulos de grupo (MobileDrawerNivel2 622:13996).
   * `'filas'`: sin rótulos, cada fila con icono, descripción opcional y chevron
   * (Figma 01c, módulo Sitio web). Opt-in por módulo: los demás no cambian.
   */
  drawer?: 'grupos' | 'filas';
  /**
   * Subtítulo dinámico de la cabecera del nivel 2 móvil. Es un identificador,
   * no un texto: lo resuelve `shell/sidebar/subtitulosModulo.tsx`.
   * `'dominioSitio'` = la URL pública del sitio (Figma 01c, «tu-marca.goadmin.io»).
   */
  subtitulo?: 'dominioSitio';
}

/**
 * Capacidades que puede exigir una página, calculadas en el servidor
 * (`capacidadesNav.server.ts`, servidas por `GET /api/me/capacidades`):
 *  - gestionarNotificaciones: admin o `notifications.manage`;
 *  - verAnaliticaWeb: la misma regla que `GET /api/analitica-web`;
 *  - variasSedes: la organización tiene más de una sucursal activa.
 */
export type CapacidadNav = 'gestionarNotificaciones' | 'verAnaliticaWeb' | 'variasSedes';

/** Todas las capacidades del menú, en una sola lista (cliente y servidor). */
export const CAPACIDADES_NAV: readonly CapacidadNav[] = ['gestionarNotificaciones', 'verAnaliticaWeb', 'variasSedes'];

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
    paginas: [
      // «Analítica web» vivía aquí fuera del menú (/app/inicio/analitica-web):
      // ahora es la página «Analítica» del módulo Sitio web (redirección 308).
      { href: '/app/inicio', nombre: 'Inicio', icono: Home },
    ],
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
      { href: '/app/pos', nombre: 'POS', icono: ShoppingCart, grupo: 'Venta', pantallaCompleta: true },
      { href: '/app/pos/pedidos-online', nombre: 'Pedidos online', icono: ShoppingBag, grupo: 'Venta' },
      { href: '/app/pos/ventas', nombre: 'Ventas', icono: Receipt, grupo: 'Venta' },
      { href: '/app/pos/cajas', nombre: 'Cajas', icono: Banknote, grupo: 'Venta' },
      { href: '/app/pos/devoluciones', nombre: 'Devoluciones', icono: Undo2, grupo: 'Venta' },
      { href: '/app/pos/cuentas-por-cobrar', nombre: 'Cuentas por cobrar', icono: Wallet, grupo: 'Venta' },
      { href: '/app/pos/mesas', nombre: 'Mesas', icono: UtensilsCrossed, grupo: 'Restaurante', pantallaCompleta: true },
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
    // Módulo propio del menú lateral (no una página de «Clientes»): se ve si la
    // organización tiene `crm` en organization_modules, como cualquier otro.
    // Fuente de sus páginas y grupos: src/config/crmNav.ts (la usa también el
    // propio módulo). Con grupos, su panel de submenú va a dos columnas.
    paginas: CRM_NAV_ENABLED.map((p) => ({ href: p.href, nombre: p.name, icono: p.icon, grupo: p.grupo })),
  },
  {
    // Sitio web: módulo BASE (modules.is_core) desde el 2026-10-05 (Figma 01a/01b).
    // Antes vivía escondido en Organización › Sitio web (/app/organizacion/branding,
    // 7 pestañas) y Organización › Dominios. Las rutas viejas redirigen con 308
    // (next.config.js). El editor (/app/sitio-web/editor/[pageId]) no es una
    // página del menú: se entra con «Abrir editor» desde Resumen, Páginas o
    // Diseño, y se sirve a pantalla completa fuera del AppLayout (rewrite).
    codigo: 'website',
    id: 'sitio-web',
    etiqueta: 'sitioWeb',
    icono: Globe,
    seccion: 'ventas',
    rutas: ['/app/sitio-web'],
    // Figma 01c: en móvil, filas con icono, descripción y chevron, y la URL
    // pública del sitio bajo el título.
    drawer: 'filas',
    subtitulo: 'dominioSitio',
    // Carta (solo restaurantes) y Tienda (solo comercio) se ocultan por giro
    // con filas `is_active = false` en organization_module_pages (Figma 01e;
    // migración 20261006220000_sitio_web_paginas_por_giro). «Sedes en la web»
    // depende de una capacidad del servidor (`variasSedes`), que se recalcula
    // sola al crear la segunda sede. «Analítica» exige la misma regla que su API.
    paginas: [
      { href: '/app/sitio-web', nombre: 'Resumen', icono: Home, grupo: 'Tu sitio' },
      { href: '/app/sitio-web/paginas', nombre: 'Páginas', icono: FileText, grupo: 'Tu sitio' },
      { href: '/app/sitio-web/diseno', nombre: 'Diseño', icono: Wand2, grupo: 'Tu sitio' },
      { href: '/app/sitio-web/plantillas', nombre: 'Plantillas', icono: LayoutGrid, grupo: 'Tu sitio' },
      { href: '/app/sitio-web/carta', nombre: 'Carta', icono: UtensilsCrossed, grupo: 'Según tu negocio', descripcion: 'Solo restaurantes' },
      { href: '/app/sitio-web/tienda', nombre: 'Tienda', icono: ShoppingBag, grupo: 'Según tu negocio', descripcion: 'Solo comercio' },
      { href: '/app/sitio-web/ventas', nombre: 'Ventas en línea', icono: ShoppingCart, grupo: 'Vender y crecer', descripcion: 'Checkout, pagos y envíos' },
      { href: '/app/sitio-web/dominios', nombre: 'Dominios', icono: Link2, grupo: 'Vender y crecer' },
      { href: '/app/sitio-web/seo', nombre: 'SEO y redes', icono: Search, grupo: 'Vender y crecer' },
      { href: '/app/sitio-web/analitica', nombre: 'Analítica', icono: BarChart3, grupo: 'Vender y crecer', requiere: 'verAnaliticaWeb' },
      {
        href: '/app/sitio-web/sedes',
        nombre: 'Sedes en la web',
        icono: MapPin,
        grupo: 'Ajustes del sitio',
        requiere: 'variasSedes',
        descripcion: 'Si tienes más de una sede',
      },
      { href: '/app/sitio-web/configuracion', nombre: 'Configuración', icono: Settings, grupo: 'Ajustes del sitio' },
    ],
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
      // Se entra desde la página de IA; no va en el menú. La configuración de la
      // IA se mudó a Configuración › Chat › IA del chat (2026-10-07).
      { href: '/app/chat/ia/laboratorio', nombre: 'Laboratorio de IA', icono: Bot, enMenu: false },
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
    // Membresías (antes «Gimnasio», código gym): gimnasios, academias, clubes, coworking, spa.
    // docs/design/MEMBRESIAS-FASE-1-2.md §2. /app/gym/* redirige aquí (next.config.js) y el
    // código viejo «gym» es alias de «memberships» (moduleManagementService, middleware).
    codigo: 'memberships',
    id: 'membresias',
    etiqueta: 'membresias',
    icono: UserCheck,
    seccion: 'ventas',
    rutas: ['/app/membresias'],
    paginas: [
      { href: '/app/membresias', nombre: 'Resumen', icono: LayoutGrid },
      { href: '/app/membresias/miembros', nombre: 'Miembros', icono: Users },
      { href: '/app/membresias/membresias', nombre: 'Membresías', icono: CreditCard },
      { href: '/app/membresias/planes', nombre: 'Planes', icono: Layers },
      { href: '/app/membresias/clases', nombre: 'Clases', icono: Calendar },
      { href: '/app/membresias/reservas', nombre: 'Reservas', icono: CalendarCheck },
      { href: '/app/membresias/check-in', nombre: 'Check-in', icono: LogIn, pantallaCompleta: true },
      { href: '/app/membresias/instructores', nombre: 'Instructores', icono: User },
      { href: '/app/membresias/control-de-acceso', nombre: 'Control de acceso', icono: QrCode },
      { href: '/app/membresias/pagos', nombre: 'Pagos', icono: Wallet },
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
      { href: '/app/inventario/etiquetas', nombre: 'Etiquetas de producto', icono: Tag, grupo: 'Catálogo' },
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
    // Cuatro grupos (Figma 08 «Acceso y organización», 2026-10-06): Equipo,
    // Sedes, Plan y facturación, Marca. «Compras» es el historial de compras de
    // cupo (/app/plan/historial). Sitio web y Dominios viven en el módulo Sitio
    // web desde el 2026-10-05: no vuelven aquí.
    // PENDIENTE: el diseño pone «Roles y permisos» dentro de Equipo. Su página
    // (/app/roles) pertenece hoy al módulo `roles` (bloque de abajo) y un href
    // no puede estar en dos módulos (`filtrar.test.ts`): se mueve aquí cuando
    // ese bloque se pliegue en este.
    rutas: ['/app/organizacion', '/app/plan'],
    paginas: [
      { href: '/app/organizacion/miembros', nombre: 'Miembros', icono: UserCheck, grupo: 'Equipo' },
      { href: '/app/organizacion/invitaciones', nombre: 'Invitaciones', icono: UserPlus, grupo: 'Equipo' },
      { href: '/app/organizacion/sucursales', nombre: 'Sucursales', icono: MapPin, grupo: 'Sedes' },
      { href: '/app/organizacion/plan', nombre: 'Plan', icono: CreditCard, grupo: 'Plan y facturación' },
      { href: '/app/plan/historial', nombre: 'Compras', icono: Receipt, grupo: 'Plan y facturación' },
      { href: '/app/organizacion/modulos', nombre: 'Módulos', icono: Grid3x3, grupo: 'Plan y facturación' },
      { href: '/app/organizacion/informacion', nombre: 'Información', icono: Info, grupo: 'Marca' },
      { href: '/app/organizacion/mis-organizaciones', nombre: 'Mis organizaciones', icono: Building2, grupo: 'Marca' },
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
