'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, RefreshCw, GitMerge, Plus, History } from 'lucide-react';

interface MesaDetailHeaderProps {
  mesaNombre: string;
  session: any;
  onRefresh: () => void;
  onCombinar: () => void;
  onAddProduct: () => void;
  onVerHistorial: () => void;
  getEstadoBadge: () => React.ReactNode;
}

export function MesaDetailHeader({
  mesaNombre,
  session,
  onRefresh,
  onCombinar,
  onAddProduct,
  onVerHistorial,
  getEstadoBadge,
}: MesaDetailHeaderProps) {
  const router = useRouter();

  return (
    <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10 shadow-sm">
      <div className="container mx-auto px-3 sm:px-6 py-3 sm:py-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2 sm:gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/app/pos/mesas')}
              className="hover:bg-gray-100 dark:hover:bg-gray-700 flex-shrink-0"
            >
              <ArrowLeft className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Volver</span>
            </Button>
            <Separator orientation="vertical" className="h-8 hidden sm:block" />
            <div className="min-w-0">
              <div className="flex items-center gap-2 sm:gap-3">
                <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-gray-100 truncate">
                  {mesaNombre}
                </h1>
                {session ? getEstadoBadge() : <Badge variant="secondary">Disponible</Badge>}
              </div>
              {session?.restaurant_tables?.zone && (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {session.restaurant_tables.zone}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              className="hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onVerHistorial}
              className="hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <History className="h-4 w-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Historial</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onCombinar}
              className="hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <GitMerge className="h-4 w-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Combinar Mesa</span>
              <span className="sm:hidden">Combinar</span>
            </Button>
            <Button
              size="sm"
              onClick={onAddProduct}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Plus className="h-4 w-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Agregar Producto</span>
              <span className="sm:hidden">Agregar</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
