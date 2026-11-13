import {
  Building2,
  Users,
  Bed,
  ShoppingCart,
  MessageSquare,
  Link as LinkIcon,
  Car,
  Calendar,
  Activity,
  Contact,
  Dumbbell,
  FileText,
  Bell,
  Globe,
  HardDrive,
  Wallet,
  Bot,
  Phone,
  type LucideIcon,
} from 'lucide-react';

/**
 * Grupos del menú del diálogo de Configuración (Figma pág. 10, sección 12,
 * «Configuración como diálogo»). El orden de este arreglo es el del menú.
 */
export type GrupoConfig = 'organizacion' | 'ventas' | 'clientes' | 'operacion' | 'conexiones';
export const GRUPOS_CONFIG: readonly GrupoConfig[] = ['organizacion', 'ventas', 'clientes', 'operacion', 'conexiones'];

export interface ConfigModule {
  id: string;
  moduleCode: string;
  title: string;
  description: string;
  icon: LucideIcon;
  /** Grupo del menú del diálogo donde aparece el módulo. */
  grupo: GrupoConfig;
  isCore?: boolean;
  /** Solo se muestra dentro de Go Admin Desktop (`isDesktop()`). */
  desktopOnly?: boolean;
}

/** El orden de este arreglo es el orden de las entradas dentro de cada grupo. */
export const CONFIG_MODULES: ConfigModule[] = [
  {
    id: 'general',
    moduleCode: 'general',
    title: 'General',
    description: 'Información de la organización y datos generales',
    icon: Building2,
    grupo: 'organizacion',
    isCore: true,
  },
  {
    id: 'roles',
    moduleCode: 'roles',
    title: 'Roles',
    description: 'Configuración de roles y permisos',
    icon: Users,
    grupo: 'organizacion',
    isCore: true,
  },
  {
    id: 'pos',
    moduleCode: 'pos',
    title: 'POS',
    description: 'Punto de venta, impresiones y consecutivos',
    icon: ShoppingCart,
    grupo: 'ventas',
  },
  {
    id: 'facturacion',
    moduleCode: 'finance',
    title: 'Facturación Electrónica',
    description: 'Credenciales y rangos DIAN',
    icon: FileText,
    grupo: 'ventas',
  },
  {
    id: 'sitioweb',
    moduleCode: 'website',
    title: 'Sitio Web',
    description: 'Tema, páginas, SEO, contenido y publicación del sitio web',
    icon: Globe,
    grupo: 'ventas',
    isCore: true,
  },
  {
    id: 'crm',
    moduleCode: 'crm',
    title: 'CRM',
    description: 'Canales, etiquetas, API keys y widget',
    icon: Contact,
    grupo: 'clientes',
  },
  {
    id: 'chat',
    moduleCode: 'chat',
    title: 'Chat',
    description: 'Etiquetas, llaves API, respuestas e IA',
    icon: MessageSquare,
    grupo: 'clientes',
  },
  {
    id: 'notificaciones',
    moduleCode: 'notifications',
    title: 'Notificaciones',
    description: 'Preferencias de canales de notificación',
    icon: Bell,
    grupo: 'clientes',
  },
  {
    id: 'calendario',
    moduleCode: 'calendar',
    title: 'Calendario',
    description: 'Configuración general del calendario',
    icon: Calendar,
    grupo: 'operacion',
  },
  {
    id: 'hrm',
    moduleCode: 'hrm',
    title: 'Recursos Humanos',
    description: 'Configuración general y monedas',
    icon: Users,
    grupo: 'operacion',
  },
  {
    id: 'pms',
    moduleCode: 'pms_hotel',
    title: 'PMS Hotel',
    description: 'Reservas, check-in/out y operaciones',
    icon: Bed,
    grupo: 'operacion',
  },
  {
    id: 'parking',
    moduleCode: 'parking',
    title: 'Parking',
    description: 'Horarios, tolerancias, políticas y mensajes',
    icon: Car,
    grupo: 'operacion',
  },
  {
    id: 'gym',
    // Membresías (antes gym): el código de módulo es «memberships»; «gym» es alias.
    moduleCode: 'memberships',
    title: 'Membresías',
    description: 'Acceso, tolerancias, check-in, clases y notificaciones',
    icon: Dumbbell,
    grupo: 'operacion',
  },
  {
    id: 'integraciones',
    moduleCode: 'integrations',
    title: 'Integraciones',
    description: 'Configuración general de integraciones',
    icon: LinkIcon,
    grupo: 'conexiones',
  },
  {
    id: 'timeline',
    moduleCode: 'operations',
    title: 'Timeline',
    description: 'Privacidad, fuentes, retención y rendimiento',
    icon: Activity,
    grupo: 'conexiones',
  },
  {
    id: 'datos-offline',
    moduleCode: 'general',
    title: 'Datos sin conexión',
    description: 'Copia local para trabajar sin internet en Go Admin Desktop',
    icon: HardDrive,
    grupo: 'conexiones',
    isCore: true,
    desktopOnly: true,
  },
];

/**
 * Entradas del menú del diálogo que NO son un módulo: reúnen secciones que
 * viven en otro módulo (`SeccionConfig.entrada`). GO Asistente y Plan viven en
 * General; Telefonía y voz, en CRM. El id de la sección no cambia (deep links
 * estables): solo cambia dónde se muestra en el menú.
 */
export interface EntradaExtra {
  id: string;
  grupo: GrupoConfig;
  icon: LucideIcon;
  /** Entrada (módulo u otra extra) tras la que se coloca en el menú. */
  despuesDe: string;
}

export const ENTRADAS_EXTRA: readonly EntradaExtra[] = [
  { id: 'plan', grupo: 'organizacion', icon: Wallet, despuesDe: 'roles' },
  { id: 'asistente', grupo: 'organizacion', icon: Bot, despuesDe: 'plan' },
  { id: 'telefonia-voz', grupo: 'clientes', icon: Phone, despuesDe: 'chat' },
];

export function getConfigModule(moduleId: string): ConfigModule | undefined {
  return CONFIG_MODULES.find((m) => m.id === moduleId);
}

export function getModuleByCode(moduleCode: string): ConfigModule | undefined {
  return CONFIG_MODULES.find((m) => m.moduleCode === moduleCode);
}
