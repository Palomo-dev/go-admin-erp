'use client';

import { Card } from '@/components/ui/card';
import { Package, Search } from 'lucide-react';

interface MisEnviosEmptyProps {
  hasShipments: boolean;
}

export function MisEnviosEmpty({ hasShipments }: MisEnviosEmptyProps) {
  return (
    <Card className="p-12 text-center">
      {hasShipments ? (
        <>
          <Search className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400">
            No se encontraron envíos con los filtros aplicados
          </p>
        </>
      ) : (
        <>
          <Package className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400">
            No tienes envíos asignados
          </p>
        </>
      )}
    </Card>
  );
}
