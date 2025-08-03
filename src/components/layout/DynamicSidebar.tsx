'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  Home,
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
  Crown,
  Lock,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Settings,
  Shield,
  Info,
  UserPlus,
  CreditCard,
  Grid3X3
} from 'lucide-react';
import { useActiveModules } from '@/hooks/useActiveModules';

const moduleIcons: Record<string, React.ComponentType<any>> = {
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

const moduleRoutes: Record<string, string> = {
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

// Subrutas para módulos (core y pagados)
const moduleSubroutes: Record<string, Array<{name: string, path: string, icon: React.ComponentType<any>}>> = {
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
    { name: 'Roles', path: '/app/roles/roles', icon: Shield }
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

interface DynamicSidebarProps {
  organizationId?: number;
  collapsed?: boolean;
  onSignOut?: () => void;
}

export default function DynamicSidebar({ organizationId, collapsed = false, onSignOut }: DynamicSidebarProps) {
  const pathname = usePathname();
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const { 
    activeModules, 
    organizationStatus, 
    canAccessModule, 
    loading, 
    error 
  } = useActiveModules(organizationId);

  // Expandir automáticamente módulos que tienen subrutas definidas y están activos
  React.useEffect(() => {
    const modulesToExpand = new Set<string>();
    
    activeModules.forEach(module => {
      // Solo expandir si el módulo tiene subrutas definidas en moduleSubroutes
      if (moduleSubroutes[module.code] && moduleSubroutes[module.code].length > 0) {
        modulesToExpand.add(module.code);
      }
    });
    
    setExpandedModules(modulesToExpand);
  }, [activeModules]);

  const toggleModule = (moduleCode: string) => {
    if (collapsed) return;
    const newExpanded = new Set(expandedModules);
    if (newExpanded.has(moduleCode)) {
      newExpanded.delete(moduleCode);
    } else {
      newExpanded.add(moduleCode);
    }
    setExpandedModules(newExpanded);
  };

  // Función mejorada para verificar acceso que siempre permite módulos core
  const canAccessModuleEnhanced = (moduleCode: string): boolean => {
    // Los módulos core siempre son accesibles
    const module = activeModules.find(m => m.code === moduleCode);
    if (module?.is_core) {
      return true;
    }
    
    // Para módulos pagados, usar la función original
    return canAccessModule(moduleCode);
  };

  const renderModuleItem = (module: any) => {
    const Icon = moduleIcons[module.code] || Package;
    const route = moduleRoutes[module.code];
    const isActive = pathname.startsWith(route);
    const hasAccess = canAccessModuleEnhanced(module.code);
    const hasSubroutes = moduleSubroutes[module.code] && moduleSubroutes[module.code].length > 0;
    const isExpanded = expandedModules.has(module.code);

    const moduleContent = (
      <div className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-lg transition-colors",
        collapsed ? "justify-center" : "",
        isActive 
          ? "bg-blue-100 text-blue-700 border border-blue-200" 
          : hasAccess 
            ? "hover:bg-gray-100 text-gray-700" 
            : "text-gray-400 cursor-not-allowed"
      )}>
        <Icon className={cn(
          "h-5 w-5",
          isActive ? "text-blue-600" : hasAccess ? "text-gray-600" : "text-gray-400"
        )} />
        {!collapsed && (
          <div className="flex items-center justify-between flex-1">
            <span className="font-medium">{module.name}</span>
            <div className="flex items-center gap-1">
              {module.is_core && (
                <Crown className="h-3 w-3 text-yellow-500" />
              )}
              {!hasAccess && (
                <Lock className="h-3 w-3 text-gray-400" />
              )}
              {hasSubroutes && hasAccess && (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleModule(module.code);
                  }}
                  className="p-1 hover:bg-gray-200 rounded"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );

    if (!hasAccess || !route) {
      return (
        <div key={module.code}>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div>{moduleContent}</div>
              </TooltipTrigger>
              <TooltipContent side="right">
                {!hasAccess ? "Sin permisos de acceso" : "Ruta no disponible"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      );
    }

    return (
      <div key={module.code}>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              {hasSubroutes ? (
                <div 
                  className="cursor-pointer"
                  onClick={() => toggleModule(module.code)}
                >
                  {moduleContent}
                </div>
              ) : (
                <Link href={route}>
                  {moduleContent}
                </Link>
              )}
            </TooltipTrigger>
            {collapsed && (
              <TooltipContent side="right">
                {module.name}
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
        
        {/* Subrutas */}
        {hasSubroutes && isExpanded && !collapsed && hasAccess && (
          <div className="ml-6 mt-1 space-y-1">
            {moduleSubroutes[module.code].map((subroute) => {
              const SubIcon = subroute.icon;
              const isSubActive = pathname === subroute.path;
              
              return (
                <Link key={subroute.path} href={subroute.path}>
                  <div className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors text-sm",
                    isSubActive 
                      ? "bg-blue-50 text-blue-700 border-l-2 border-blue-500" 
                      : "hover:bg-gray-50 text-gray-600"
                  )}>
                    <SubIcon className={cn(
                      "h-4 w-4",
                      isSubActive ? "text-blue-600" : "text-gray-500"
                    )} />
                    <span>{subroute.name}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="space-y-2 p-4">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="h-10 bg-gray-200 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center">
        <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
        {!collapsed && (
          <div className="text-sm text-red-600">
            Error al cargar módulos
          </div>
        )}
      </div>
    );
  }

  const coreModules = activeModules.filter(m => m.is_core);
  const paidModules = activeModules.filter(m => !m.is_core);

  return (
    <ScrollArea className="flex-1 px-2">
      <div className="space-y-2 py-4">
        {/* Inicio */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Link href="/app/inicio">
                <div className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg transition-colors",
                  collapsed ? "justify-center" : "",
                  pathname === '/app/inicio' 
                    ? "bg-blue-100 text-blue-700 border border-blue-200" 
                    : "hover:bg-gray-100 text-gray-700"
                )}>
                  <Home className={cn(
                    "h-5 w-5",
                    pathname === '/app/inicio' ? "text-blue-600" : "text-gray-600"
                  )} />
                  {!collapsed && (
                    <span className="font-medium">Inicio</span>
                  )}
                </div>
              </Link>
            </TooltipTrigger>
            {collapsed && (
              <TooltipContent side="right">
                Inicio
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>

        {/* Módulos Pagados */}
        {paidModules.length > 0 && (
          <>
            <Separator />
            <div className="space-y-1">
              {!collapsed && (
                <div className="px-3 py-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    <Package className="h-3 w-3" />
                    Módulos
                    {organizationStatus && (
                      <Badge variant="outline" className="text-xs">
                        {organizationStatus.active_modules.filter(code => {
                          const mod = activeModules.find(m => m.code === code);
                          return mod && !mod.is_core;
                        }).length}/{organizationStatus.plan?.max_modules || 0}
                      </Badge>
                    )}
                  </div>
                </div>
              )}
              {paidModules.map(renderModuleItem)}
            </div>
          </>
        )}

        {/* Módulos Core */}
        {coreModules.length > 0 && (
          <>
            <Separator />
            <div className="space-y-1">
              {!collapsed && (
                <div className="px-3 py-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    <Crown className="h-3 w-3" />
                    Core
                  </div>
                </div>
              )}
              {coreModules.map(renderModuleItem)}
            </div>
          </>
        )}

        {/* Mensaje si no hay módulos */}
        {activeModules.length === 0 && !loading && (
          <div className="px-3 py-8 text-center">
            <Package className="h-8 w-8 text-gray-400 mx-auto mb-2" />
            {!collapsed && (
              <div className="text-sm text-gray-500">
                No hay módulos activos
              </div>
            )}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
