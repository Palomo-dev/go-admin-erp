import {
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
  Building2,
  type LucideIcon,
} from 'lucide-react';

export interface ConfigSection {
  id: string;
  label: string;
  description?: string;
}

export interface ConfigModule {
  id: string;
  moduleCode: string;
  title: string;
  description: string;
  icon: LucideIcon;
  isCore?: boolean;
  sections: ConfigSection[];
}

export const CONFIG_MODULES: ConfigModule[] = [
  {
    id: 'crm',
    moduleCode: 'crm',
    title: 'CRM',
    description: 'Canales, etiquetas, API keys y widget',
    icon: UserCheck,
    sections: [
      { id: 'canales', label: 'Canales', description: 'Canales de comunicación' },
      { id: 'etiquetas', label: 'Etiquetas', description: 'Etiquetas de contactos' },
      { id: 'api-keys', label: 'API Keys', description: 'Llaves de API' },
      { id: 'widget', label: 'Widget', description: 'Configuración del widget' },
    ],
  },
  {
    id: 'hrm',
    moduleCode: 'hrm',
    title: 'Recursos Humanos',
    description: 'Configuración general y monedas',
    icon: Users,
    sections: [
      { id: 'general', label: 'General', description: 'Configuración general' },
      { id: 'monedas', label: 'Monedas', description: 'Divisas de la organización' },
    ],
  },
  {
    id: 'pms',
    moduleCode: 'pms_hotel',
    title: 'PMS Hotel',
    description: 'Reservas, check-in/out y operaciones',
    icon: Bed,
    sections: [
      { id: 'general', label: 'General', description: 'Configuración general' },
      { id: 'reservas', label: 'Reservas', description: 'Configuración de reservas' },
      { id: 'notificaciones', label: 'Notificaciones', description: 'Notificaciones del PMS' },
      { id: 'checkin', label: 'Check-in/out', description: 'Configuración de check-in y check-out' },
      { id: 'operaciones', label: 'Operaciones', description: 'Configuración operativa' },
    ],
  },
  {
    id: 'pos',
    moduleCode: 'pos',
    title: 'POS',
    description: 'Punto de venta, impresiones y consecutivos',
    icon: ShoppingCart,
    sections: [
      { id: 'general', label: 'General', description: 'Configuración general del POS' },
      { id: 'impresiones', label: 'Impresiones', description: 'Configuración de impresoras' },
      { id: 'consecutivos', label: 'Consecutivos', description: 'Consecutivos de ventas' },
      { id: 'agente-impresion', label: 'Agente de impresión', description: 'Agente de impresión de escritorio' },
    ],
  },
  {
    id: 'chat',
    moduleCode: 'chat',
    title: 'Chat',
    description: 'Etiquetas, llaves API, respuestas e IA',
    icon: MessageSquare,
    sections: [
      { id: 'etiquetas', label: 'Etiquetas', description: 'Etiquetas de chat' },
      { id: 'llaves-api', label: 'Llaves API', description: 'Llaves de API del chat' },
      { id: 'respuestas', label: 'Respuestas rápidas', description: 'Respuestas predefinidas' },
      { id: 'ia', label: 'IA', description: 'Configuración de IA del chat' },
    ],
  },
  {
    id: 'integraciones',
    moduleCode: 'integrations',
    title: 'Integraciones',
    description: 'Configuración general de integraciones',
    icon: LinkIcon,
    sections: [
      { id: 'general', label: 'General', description: 'Configuración y estadísticas' },
    ],
  },
  {
    id: 'parking',
    moduleCode: 'parking',
    title: 'Parking',
    description: 'Horarios, tolerancias, políticas y mensajes',
    icon: Car,
    sections: [
      { id: 'horarios', label: 'Horarios', description: 'Horarios de operación' },
      { id: 'tolerancias', label: 'Tolerancias', description: 'Tiempos de tolerancia' },
      { id: 'politicas', label: 'Políticas', description: 'Políticas de estacionamiento' },
      { id: 'ticket-perdido', label: 'Ticket perdido', description: 'Configuración de ticket perdido' },
      { id: 'mensajes', label: 'Mensajes', description: 'Mensajes personalizados' },
      { id: 'alertas', label: 'Alertas', description: 'Alertas del sistema' },
    ],
  },
  {
    id: 'calendario',
    moduleCode: 'calendar',
    title: 'Calendario',
    description: 'Configuración general del calendario',
    icon: Calendar,
    sections: [
      { id: 'general', label: 'General', description: 'Configuración del calendario' },
    ],
  },
  {
    id: 'timeline',
    moduleCode: 'operations',
    title: 'Timeline',
    description: 'Privacidad, fuentes, retención y rendimiento',
    icon: Activity,
    sections: [
      { id: 'privacidad', label: 'Privacidad', description: 'Configuración de privacidad' },
      { id: 'fuentes', label: 'Fuentes', description: 'Fuentes de datos' },
      { id: 'retencion', label: 'Retención', description: 'Políticas de retención' },
      { id: 'rendimiento', label: 'Rendimiento', description: 'Optimización de rendimiento' },
    ],
  },
  {
    id: 'roles',
    moduleCode: 'roles',
    title: 'Roles',
    description: 'Configuración de roles y permisos',
    icon: Shield,
    isCore: true,
    sections: [
      { id: 'general', label: 'General', description: 'Configuración de roles' },
    ],
  },
  {
    id: 'facturacion',
    moduleCode: 'finance',
    title: 'Facturación Electrónica',
    description: 'Credenciales y rangos DIAN',
    icon: Landmark,
    sections: [
      { id: 'credenciales', label: 'Credenciales', description: 'Credenciales Factus' },
      { id: 'rangos', label: 'Rangos DIAN', description: 'Rangos de numeración DIAN' },
    ],
  },
  {
    id: 'gym',
    moduleCode: 'gym',
    title: 'Gym',
    description: 'Acceso, tolerancias, check-in, clases y notificaciones',
    icon: Dumbbell,
    sections: [
      { id: 'acceso', label: 'Acceso', description: 'Configuración de acceso' },
      { id: 'tolerancias', label: 'Tolerancias', description: 'Tiempos de tolerancia' },
      { id: 'checkin', label: 'Check-in', description: 'Configuración de check-in' },
      { id: 'clases', label: 'Clases', description: 'Configuración de clases' },
      { id: 'mensajes', label: 'Mensajes', description: 'Mensajes personalizados' },
      { id: 'notificaciones', label: 'Notificaciones', description: 'Notificaciones del gym' },
    ],
  },
  {
    id: 'notificaciones',
    moduleCode: 'notifications',
    title: 'Notificaciones',
    description: 'Preferencias de canales de notificación',
    icon: Bell,
    sections: [
      { id: 'preferencias', label: 'Preferencias', description: 'Preferencias por canal' },
    ],
  },
  {
    id: 'organizacion',
    moduleCode: 'organizations',
    title: 'Organización',
    description: 'Información, miembros y módulos',
    icon: Building2,
    isCore: true,
    sections: [
      { id: 'general', label: 'General', description: 'Enlace a configuración organizacional' },
    ],
  },
];

export function getConfigModule(moduleId: string): ConfigModule | undefined {
  return CONFIG_MODULES.find((m) => m.id === moduleId);
}

export function getDefaultSection(moduleId: string): string {
  const mod = getConfigModule(moduleId);
  return mod?.sections[0]?.id ?? 'general';
}

export function getModuleByCode(moduleCode: string): ConfigModule | undefined {
  return CONFIG_MODULES.find((m) => m.moduleCode === moduleCode);
}
