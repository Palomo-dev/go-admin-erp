'use client';

import React from 'react';
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
  AlertCircle
} from 'lucide-react';
import { useActiveModules } from '@/hooks/useActiveModules';

const moduleIcons: Record<string, React.ComponentType<any>> = {
  'organizations': Building2,
  'branding': Palette,
  'branches': MapPin,
  'pos_retail': ShoppingCart,
  'pos_restaurant': ShoppingCart,
  'pos_gym': ShoppingCart,
  'inventory': Package,
  'pms_hotel': Bed,
  'parking': Car,
  'crm': Users,
  'hrm': UserCheck,
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
  'pos_retail': '/app/pos',
  'pos_restaurant': '/app/pos',
  'pos_gym': '/app/pos',
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

interface DynamicSidebarProps {
  organizationId?: number;
  collapsed?: boolean;
  onSignOut?: () => void;
}

export default function DynamicSidebar({ organizationId, collapsed = false, onSignOut }: DynamicSidebarProps) {
  const pathname = usePathname();
  const { 
    activeModules, 
    organizationStatus, 
    canAccessModule, 
    loading, 
    error 
  } = useActiveModules(organizationId);

  const getModuleIcon = (moduleCode: string) => {
    const IconComponent = moduleIcons[moduleCode] || Package;
    return IconComponent;
  };

  const isActiveRoute = (route: string) => {
    if (route === '/app/inicio') {
      return pathname === '/app/inicio' || pathname === '/app';
    }
    return pathname.startsWith(route);
  };

  const renderModuleItem = (module: any, hasAccess: boolean) => {
    const IconComponent = getModuleIcon(module.code);
    const route = moduleRoutes[module.code];
    const isActive = route && isActiveRoute(route);
    const isCore = module.is_core;

    const content = (
      <div className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
        isActive 
          ? "bg-primary text-primary-foreground" 
          : hasAccess 
            ? "text-gray-700 hover:bg-gray-100" 
            : "text-gray-400 cursor-not-allowed",
        collapsed && "justify-center px-2"
      )}>
        <IconComponent className={cn("h-4 w-4 flex-shrink-0", !hasAccess && "opacity-50")} />
        {!collapsed && (
          <>
            <span className="flex-1 truncate">{module.name}</span>
            <div className="flex items-center gap-1">
              {isCore && <Crown className="h-3 w-3 text-blue-500" />}
              {!hasAccess && <Lock className="h-3 w-3 text-gray-400" />}
            </div>
          </>
        )}
      </div>
    );

    if (!hasAccess || !route) {
      return (
        <TooltipProvider key={module.code}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div>{content}</div>
            </TooltipTrigger>
            <TooltipContent side="right">
              {!hasAccess ? "Sin permisos de acceso" : "Ruta no disponible"}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return (
      <TooltipProvider key={module.code}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Link href={route}>
              {content}
            </Link>
          </TooltipTrigger>
          {collapsed && (
            <TooltipContent side="right">
              {module.name}
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>
    );

  if (loading) {
    return (
      <div className="space-y-2 p-4">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="animate-pulse">
            <div className="h-10 bg-gray-200 rounded-lg"></div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="flex items-center gap-2 text-red-600 text-sm">
          <AlertCircle className="h-4 w-4" />
          {!collapsed && <span>Error cargando módulos</span>}
        </div>
      </div>
    );
  }

  // Separar módulos core y de pago
  const coreModules = activeModules.filter(m => m.is_core).sort((a, b) => a.rank - b.rank);
  const paidModules = activeModules.filter(m => !m.is_core).sort((a, b) => a.rank - b.rank);

  return (
    <ScrollArea className="flex-1">
      <div className="space-y-4 p-4">
        {/* Inicio */}
        <div className="space-y-1">
          <Link href="/app/inicio">
            <div className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              isActiveRoute('/app/inicio')
                ? "bg-primary text-primary-foreground"
                : "text-gray-700 hover:bg-gray-100",
              collapsed && "justify-center px-2"
            )}>
              <Home className="h-4 w-4 flex-shrink-0" />
              {!collapsed && <span>Inicio</span>}
            </div>
          </Link>
        </div>

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
              {coreModules.map(module => 
                renderModuleItem(module, canAccessModule(module.code))
              )}
            </div>
          </>
        )}

        {/* Módulos de Pago */}
        {paidModules.length > 0 && (
          <>
            <Separator />
            <div className="space-y-1">
              {!collapsed && (
                <div className="px-3 py-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      <Package className="h-3 w-3" />
                      Módulos
                    </div>
                    {organizationStatus && (
                      <Badge variant="outline" className="text-xs">
                        {organizationStatus.paid_modules_count}/{organizationStatus.max_modules_allowed}
                      </Badge>
                    )}
                  </div>
                </div>
              )}
              {paidModules.map(module => 
                renderModuleItem(module, canAccessModule(module.code))
              )}
            </div>
          </>
        )}

        {/* Información del Plan */}
        {organizationStatus && !collapsed && (
          <>
            <Separator />
            <div className="px-3 py-2">
              <div className="text-xs text-gray-500">
                <div className="font-medium">{organizationStatus.plan?.name || 'Sin Plan'}</div>
                <div className="mt-1">
                  {organizationStatus.paid_modules_count} de {organizationStatus.max_modules_allowed} módulos
                </div>
                {!organizationStatus.can_activate_more && (
                  <div className="text-orange-600 mt-1">
                    Límite alcanzado
                  </div>
                )}
              </div>
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
