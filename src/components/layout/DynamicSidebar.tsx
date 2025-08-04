'use client';

import React, { useState, useMemo, useCallback, memo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Home, AlertCircle, Package, Crown } from 'lucide-react';
import { useOptimizedModules } from '@/hooks/useOptimizedModules';
import { moduleSubroutes, moduleRoutes } from '@/config/moduleConfig';
import ModuleItem from './sidebar/ModuleItem';
import UserProfile from './sidebar/UserProfile';



interface DynamicSidebarProps {
  organizationId?: number;
  collapsed?: boolean;
  onSignOut?: () => void;
}

const DynamicSidebar = memo(({ organizationId, collapsed = false, onSignOut }: DynamicSidebarProps) => {
  const pathname = usePathname();
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const { 
    coreModules, 
    paidModules, 
    canAccessModule, 
    loading, 
    error 
  } = useOptimizedModules(organizationId);

  // Memoizar solo el módulo activo que debe expandirse automáticamente
  const activeModuleToExpand = useMemo(() => {
    const allModules = [...coreModules, ...paidModules];
    const toExpand = new Set<string>();
    
    // Solo expandir el módulo que contiene la ruta actual
    allModules.forEach(module => {
      if (moduleSubroutes[module.code]?.length > 0) {
        const route = moduleRoutes[module.code];
        if (route && pathname.startsWith(route)) {
          toExpand.add(module.code);
        }
      }
    });
    
    return toExpand;
  }, [coreModules, paidModules, pathname]);

  // Expandir automáticamente solo el módulo activo
  React.useEffect(() => {
    setExpandedModules(activeModuleToExpand);
  }, [activeModuleToExpand]);

  const toggleModule = useCallback((moduleCode: string) => {
    if (collapsed) return;
    setExpandedModules(prev => {
      const newExpanded = new Set(prev);
      if (newExpanded.has(moduleCode)) {
        newExpanded.delete(moduleCode);
      } else {
        newExpanded.add(moduleCode);
      }
      return newExpanded;
    });
  }, [collapsed]);



  // Memoizar la función de renderizado de módulos
  const renderModuleItem = useCallback((module: any) => {
    const hasAccess = canAccessModule(module.code);
    const isExpanded = expandedModules.has(module.code);
    
    return (
      <ModuleItem
        key={module.code}
        module={module}
        hasAccess={hasAccess}
        collapsed={collapsed}
        isExpanded={isExpanded}
        onToggle={toggleModule}
      />
    );
  }, [canAccessModule, expandedModules, collapsed, toggleModule]);

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



  return (
    <div className="flex flex-col h-full">
      {/* Scrollable content */}
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
                      <Badge variant="outline" className="text-xs">
                        {paidModules.length}
                      </Badge>
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
          {(coreModules.length === 0 && paidModules.length === 0) && !loading && (
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
      
      {/* User Profile - Fixed at bottom */}
      <div className="flex-shrink-0">
        <UserProfile 
          collapsed={collapsed}
          onSubscriptionClick={() => window.location.href = '/app/plan'}
          onSignOut={onSignOut}
        />
      </div>
    </div>
  );
});

DynamicSidebar.displayName = 'DynamicSidebar';

export default DynamicSidebar;
