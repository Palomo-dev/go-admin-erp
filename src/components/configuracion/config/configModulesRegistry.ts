import {
  Settings,
  UserCheck,
  Users,
  Bed,
  ShoppingCart,
  MessageSquare,
  Link as LinkIcon,
  Car,
  Calendar,
  Activity,
  Shield,
  Landmark,
  Dumbbell,
  Bell,
  Globe,
  type LucideIcon,
} from 'lucide-react';

export interface ConfigModule {
  id: string;
  moduleCode: string;
  title: string;
  description: string;
  icon: LucideIcon;
  isCore?: boolean;
}

export const CONFIG_MODULES: ConfigModule[] = [
  {
    id: 'general',
    moduleCode: 'general',
    title: 'General',
    description: 'Información de la organización y datos generales',
    icon: Settings,
    isCore: true,
  },
  {
    id: 'sitioweb',
    moduleCode: 'website',
    title: 'Sitio Web',
    description: 'Tema, páginas, SEO, contenido y publicación del sitio web',
    icon: Globe,
    isCore: true,
  },
  {
    id: 'crm',
    moduleCode: 'crm',
    title: 'CRM',
    description: 'Canales, etiquetas, API keys y widget',
    icon: UserCheck,
  },
  {
    id: 'hrm',
    moduleCode: 'hrm',
    title: 'Recursos Humanos',
    description: 'Configuración general y monedas',
    icon: Users,
  },
  {
    id: 'pms',
    moduleCode: 'pms_hotel',
    title: 'PMS Hotel',
    description: 'Reservas, check-in/out y operaciones',
    icon: Bed,
  },
  {
    id: 'pos',
    moduleCode: 'pos',
    title: 'POS',
    description: 'Punto de venta, impresiones y consecutivos',
    icon: ShoppingCart,
  },
  {
    id: 'chat',
    moduleCode: 'chat',
    title: 'Chat',
    description: 'Etiquetas, llaves API, respuestas e IA',
    icon: MessageSquare,
  },
  {
    id: 'integraciones',
    moduleCode: 'integrations',
    title: 'Integraciones',
    description: 'Configuración general de integraciones',
    icon: LinkIcon,
  },
  {
    id: 'parking',
    moduleCode: 'parking',
    title: 'Parking',
    description: 'Horarios, tolerancias, políticas y mensajes',
    icon: Car,
  },
  {
    id: 'calendario',
    moduleCode: 'calendar',
    title: 'Calendario',
    description: 'Configuración general del calendario',
    icon: Calendar,
  },
  {
    id: 'timeline',
    moduleCode: 'operations',
    title: 'Timeline',
    description: 'Privacidad, fuentes, retención y rendimiento',
    icon: Activity,
  },
  {
    id: 'roles',
    moduleCode: 'roles',
    title: 'Roles',
    description: 'Configuración de roles y permisos',
    icon: Shield,
    isCore: true,
  },
  {
    id: 'facturacion',
    moduleCode: 'finance',
    title: 'Facturación Electrónica',
    description: 'Credenciales y rangos DIAN',
    icon: Landmark,
  },
  {
    id: 'gym',
    moduleCode: 'gym',
    title: 'Gym',
    description: 'Acceso, tolerancias, check-in, clases y notificaciones',
    icon: Dumbbell,
  },
  {
    id: 'notificaciones',
    moduleCode: 'notifications',
    title: 'Notificaciones',
    description: 'Preferencias de canales de notificación',
    icon: Bell,
  },
];

export function getConfigModule(moduleId: string): ConfigModule | undefined {
  return CONFIG_MODULES.find((m) => m.id === moduleId);
}

export function getModuleByCode(moduleCode: string): ConfigModule | undefined {
  return CONFIG_MODULES.find((m) => m.moduleCode === moduleCode);
}
