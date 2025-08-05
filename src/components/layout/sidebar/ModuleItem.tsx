'use client';

import React, { memo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Crown, Lock, ChevronDown, ChevronRight, Package } from 'lucide-react';
import { moduleIcons, moduleRoutes, moduleSubroutes } from '@/config/moduleConfig';
import SubrouteItem from './SubrouteItem';

interface ModuleItemProps {
  module: {
    code: string;
    name: string;
    is_core: boolean;
  };
  hasAccess: boolean;
  collapsed: boolean;
  isExpanded: boolean;
  onToggle: (moduleCode: string) => void;
}

const ModuleItem = memo(({ 
  module, 
  hasAccess, 
  collapsed, 
  isExpanded, 
  onToggle 
}: ModuleItemProps) => {
  const pathname = usePathname();
  const Icon = moduleIcons[module.code] || Package;
  const route = moduleRoutes[module.code];
  const isActive = route ? pathname.startsWith(route) : false;
  const hasSubroutes = moduleSubroutes[module.code]?.length > 0;

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
                  onToggle(module.code);
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
      <div>
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
    <div>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            {hasSubroutes ? (
              <div 
                className="cursor-pointer"
                onClick={() => onToggle(module.code)}
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
          {moduleSubroutes[module.code].map((subroute) => (
            <SubrouteItem 
              key={subroute.path} 
              subroute={subroute} 
              pathname={pathname}
            />
          ))}
        </div>
      )}
    </div>
  );
});

ModuleItem.displayName = 'ModuleItem';

export default ModuleItem;
