'use client';

import { Button } from '@/components/ui/button';
import { Plus, Calendar, Ban } from 'lucide-react';

interface BlocksHeaderProps {
  onNewBlock: () => void;
}

export function BlocksHeader({ onNewBlock }: BlocksHeaderProps) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900">
          <Ban className="h-5 w-5 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Bloqueos de Inventario
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Gestiona bloqueos de espacios sin crear reservas
          </p>
        </div>
      </div>

      <Button onClick={onNewBlock} className="bg-blue-600 hover:bg-blue-700">
        <Plus className="mr-2 h-4 w-4" />
        Nuevo Bloqueo
      </Button>
    </div>
  );
}
