'use client';

import React, { useState, useEffect } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import spaceServicesService, { OrgServiceView } from '@/lib/services/spaceServicesService';

interface SpaceServicesChecklistProps {
  spaceId: string | null;
  organizationId: number;
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
}

export function SpaceServicesChecklist({
  spaceId, organizationId, selectedIds, onSelectionChange,
}: SpaceServicesChecklistProps) {
  const [services, setServices] = useState<OrgServiceView[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      const data = await spaceServicesService.getActiveOrgServices(organizationId);
      setServices(data);

      // Si estamos editando un espacio existente, cargar sus servicios asignados
      if (spaceId) {
        const ids = await spaceServicesService.getSpaceServiceIds(spaceId);
        onSelectionChange(ids);
      }
      setIsLoading(false);
    };
    load();
  }, [organizationId, spaceId]);

  const handleToggle = (orgServiceId: string, checked: boolean) => {
    if (checked) {
      onSelectionChange([...selectedIds, orgServiceId]);
    } else {
      onSelectionChange(selectedIds.filter((id) => id !== orgServiceId));
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-2">
        <Loader2 className="h-3 w-3 animate-spin text-gray-400" />
        <span className="text-xs text-gray-400">Cargando servicios...</span>
      </div>
    );
  }

  if (services.length === 0) {
    return (
      <p className="text-xs text-gray-400 dark:text-gray-500 py-1">
        No hay servicios configurados. Configúralos en PMS → Servicios.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2 max-h-48 overflow-y-auto pr-1">
      {services.map((s) => (
        <label
          key={s.org_service_id}
          className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded px-1 py-0.5"
        >
          <Checkbox
            checked={selectedIds.includes(s.org_service_id)}
            onCheckedChange={(checked) => handleToggle(s.org_service_id, !!checked)}
          />
          <span className="text-xs text-gray-700 dark:text-gray-300 truncate">
            {s.name}
          </span>
        </label>
      ))}
    </div>
  );
}
