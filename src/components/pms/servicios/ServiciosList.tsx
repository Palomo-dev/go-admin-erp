'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { MoreVertical, Pencil, Trash2, Loader2, Sparkles, Globe } from 'lucide-react';
import { OrgServiceView, SERVICE_CATEGORIES } from '@/lib/services/spaceServicesService';

interface ServiciosListProps {
  services: OrgServiceView[];
  isLoading: boolean;
  togglingId: string | null;
  onToggle: (service: OrgServiceView) => void;
  onEdit: (service: OrgServiceView) => void;
  onDelete: (service: OrgServiceView) => void;
}

export function ServiciosList({
  services, isLoading, togglingId, onToggle, onEdit, onDelete,
}: ServiciosListProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
        <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">Cargando servicios...</span>
      </div>
    );
  }

  if (services.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        <Globe className="h-10 w-10 mx-auto mb-2 opacity-40" />
        <p className="text-sm">No se encontraron servicios</p>
      </div>
    );
  }

  // Agrupar por categoría
  const grouped: Record<string, OrgServiceView[]> = {};
  for (const s of services) {
    const cat = s.category || 'general';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(s);
  }

  const categoryLabel = (cat: string) =>
    SERVICE_CATEGORIES.find((c) => c.value === cat)?.label || cat;

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([category, items]) => (
        <div key={category}>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2 px-1">
            {categoryLabel(category)}
          </h3>
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
            {items.map((service) => (
              <div
                key={service.org_service_id || service.service_id || service.name}
                className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                {/* Icono */}
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
                  <span className="text-sm text-blue-600 dark:text-blue-400">
                    {service.icon ? '●' : '○'}
                  </span>
                </div>

                {/* Nombre + badges */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {service.name}
                    </span>
                    <Badge
                      variant="outline"
                      className={
                        service.is_custom
                          ? 'text-[10px] px-1.5 py-0 border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400'
                          : 'text-[10px] px-1.5 py-0 border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400'
                      }
                    >
                      {service.is_custom ? 'personalizado' : 'estándar'}
                    </Badge>
                  </div>
                  {service.icon && (
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
                      Icono: {service.icon}
                    </p>
                  )}
                </div>

                {/* Toggle activo */}
                <div className="flex items-center gap-2">
                  {togglingId === (service.org_service_id || service.service_id) ? (
                    <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                  ) : (
                    <Switch
                      checked={service.is_active}
                      onCheckedChange={() => onToggle(service)}
                      className="data-[state=checked]:bg-blue-600"
                    />
                  )}
                  <span className={`text-xs w-14 ${service.is_active ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`}>
                    {service.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                </div>

                {/* Acciones (solo custom) */}
                {service.is_custom && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="dark:bg-gray-800 dark:border-gray-700">
                      <DropdownMenuItem onClick={() => onEdit(service)} className="gap-2 text-xs">
                        <Pencil className="h-3.5 w-3.5" /> Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onDelete(service)} className="gap-2 text-xs text-red-600 dark:text-red-400">
                        <Trash2 className="h-3.5 w-3.5" /> Eliminar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
