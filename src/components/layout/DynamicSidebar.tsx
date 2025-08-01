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
  'pms_hotel': Landmark,
  'parking': Car,
  'crm': UserCheck,
  'hrm': Users,
  'finance': BarChart3,
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

  const renderModuleItem = (module: any) => {
    const Icon = moduleIcons[module.code] || Package;
    const route = moduleRoutes[module.code];
    const isActive = pathname.startsWith(route);
    const hasAccess = canAccessModule(module.code);

    const content = (
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
            {module.is_core && (
              <Crown className="h-3 w-3 text-yellow-500" />
            )}
            {!hasAccess && (
              <Lock className="h-3 w-3 text-gray-400" />
            )}
          </div>
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
