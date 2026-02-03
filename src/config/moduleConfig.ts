import React from 'react';
import {
  Building2,
  Palette,
  MapPin,
  ShoppingCart,
  Package,
  Bed,
  Car,
  Users,
  UserCheck,
  Landmark,
  BarChart3,
  Bell,
  Link as LinkIcon,
  Bus,
  Calendar,
  Activity,
  Shield,
  Info,
  UserPlus,
  CreditCard,
  Grid3X3,
  Settings
} from 'lucide-react';

export const moduleIcons: Record<string, React.ComponentType<any>> = {
  'organizations': Building2,
  'branding': Palette,
  'branches': MapPin,
  'clientes': Users,
  'roles': Shield,
  'subscriptions': CreditCard,
  'pos': ShoppingCart,
  'inventory': Package,
  'pms_hotel': Bed,
  'parking': Car,
  'crm': UserCheck,
  'hrm': Users,
  'finance': Landmark,
  'reports': BarChart3,
  'notifications': Bell,
  'integrations': LinkIcon,
  'transport': Bus,
  'calendar': Calendar,
  'operations': Activity
};

export const moduleRoutes: Record<string, string> = {
  'organizations': '/app/organizacion',
  'branding': '/app/branding',
  'branches': '/app/sucursales',
  'clientes': '/app/clientes',
  'roles': '/app/roles',
  'subscriptions': '/app/plan',
  'pos': '/app/pos',
  'inventory': '/app/inventario',
  'pms_hotel': '/app/pms',
  'parking': '/app/pms/parking',
  'crm': '/app/crm',
  'hrm': '/app/hrm',
  'finance': '/app/finanzas',
  'reports': '/app/reportes',
  'notifications': '/app/notificaciones',
  'integrations': '/app/integraciones',
  'transport': '/app/transporte',
  'calendar': '/app/calendario',
  'operations': '/app/timeline'
};

export interface ModuleSubroute {
  name: string;
  path: string;
  icon: React.ComponentType<any>;
}

export const moduleSubroutes: Record<string, ModuleSubroute[]> = {
  'organizations': [
    { name: 'Información', path: '/app/organizacion/informacion', icon: Info },
    { name: 'Miembros', path: '/app/organizacion/miembros', icon: Users },
    { name: 'Invitaciones', path: '/app/organizacion/invitaciones', icon: UserPlus },
    { name: 'Mis Organizaciones', path: '/app/organizacion/mis-organizaciones', icon: Building2 },
    { name: 'Módulos', path: '/app/organizacion/modulos', icon: Grid3X3 }
  ],
  'subscriptions': [
    { name: 'Plan Actual', path: '/app/plan', icon: CreditCard },
    { name: 'Historial', path: '/app/plan/historial', icon: Calendar }
  ],
  'branches': [
    { name: 'Sucursales', path: '/app/sucursales', icon: MapPin },
    { name: 'Configuración', path: '/app/sucursales/configuracion', icon: Settings },
    { name: 'Empleados', path: '/app/sucursales/empleados', icon: Users }
  ],
  'roles': [
    { name: 'Roles', path: '/app/roles', icon: Shield },
    { name: 'Configuración', path: '/app/roles/configuracion', icon: Settings },
    { name: 'Gestión de Roles', path: '/app/roles', icon: Shield }
  ],
  'clientes': [
    { name: 'Clientes', path: '/app/clientes', icon: Users },
    { name: 'Contactos', path: '/app/clientes/contactos', icon: Users },
    { name: 'Grupos', path: '/app/clientes/grupos', icon: Users },
    { name: 'Historial', path: '/app/clientes/historial', icon: Calendar }
  ],
  'pos': [
    { name: 'Punto de Venta', path: '/app/pos', icon: ShoppingCart },
    { name: 'Cajas', path: '/app/pos/cajas', icon: Package },
    { name: 'Carritos', path: '/app/pos/carritos', icon: ShoppingCart },
    { name: 'Configuración', path: '/app/pos/configuracion', icon: Settings },
    { name: 'Cuentas por Cobrar', path: '/app/pos/cuentas-por-cobrar', icon: BarChart3 },
    { name: 'Devoluciones', path: '/app/pos/devoluciones', icon: BarChart3 },
    { name: 'Mesas', path: '/app/pos/mesas', icon: Grid3X3 },
    { name: 'Pagos Pendientes', path: '/app/pos/pagos-pendientes', icon: BarChart3 },
    { name: 'Reportes', path: '/app/pos/reportes', icon: BarChart3 }
  ],
  'inventory': [
    { name: 'Inventario', path: '/app/inventario', icon: Package },
    { name: 'Categorías', path: '/app/inventario/categorias', icon: Grid3X3 },
    { name: 'Productos', path: '/app/inventario/productos', icon: Package },
    { name: 'Proveedores', path: '/app/inventario/proveedores', icon: Users }
  ],
  'pms_hotel': [
    { name: 'Reservas', path: '/app/pms', icon: Landmark },
    { name: 'Habitaciones', path: '/app/pms/habitaciones', icon: Building2 },
    { name: 'Huéspedes', path: '/app/pms/huespedes', icon: Users },
    { name: 'Parking', path: '/app/pms/parking', icon: Car }
  ],
  'crm': [
    { name: 'CRM', path: '/app/crm', icon: UserCheck },
    { name: 'Actividades', path: '/app/crm/actividades', icon: Activity },
    { name: 'Clientes', path: '/app/crm/clientes', icon: Users },
    { name: 'Pipeline', path: '/app/crm/pipeline', icon: BarChart3 },
    { name: 'Tareas', path: '/app/crm/tareas', icon: Calendar }
  ],
  'hrm': [
    { name: 'Recursos Humanos', path: '/app/hrm', icon: Users }
  ],
  'finance': [
    { name: 'Finanzas', path: '/app/finanzas', icon: BarChart3 },
    { name: 'Cuentas por Cobrar', path: '/app/finanzas/cuentas-por-cobrar', icon: BarChart3 },
    { name: 'Facturas de Venta', path: '/app/finanzas/facturas-venta', icon: BarChart3 },
    { name: 'Impuestos', path: '/app/finanzas/impuestos', icon: BarChart3 },
    { name: 'Métodos de Pago', path: '/app/finanzas/metodos-pago', icon: CreditCard },
    { name: 'Monedas', path: '/app/finanzas/monedas', icon: BarChart3 }
  ]
};
