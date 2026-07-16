'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Users, Clock, ChefHat, Receipt, UserCircle, Edit2 } from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';

interface MesaStatsCardsProps {
  customers: number;
  tiempoSesion: string;
  itemsCount: number;
  total: number;
  serverName?: string;
  onEditarComensales: () => void;
  onEditarMesero?: () => void;
}

export function MesaStatsCards({
  customers,
  tiempoSesion,
  itemsCount,
  total,
  serverName,
  onEditarComensales,
  onEditarMesero,
}: MesaStatsCardsProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
      <Card
        className="p-3 sm:p-4 hover:shadow-md transition-shadow cursor-pointer group relative"
        onClick={onEditarComensales}
      >
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="p-1.5 sm:p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
            <Users className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Comensales
            </p>
            <p className="text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100">
              {customers}
            </p>
          </div>
          <Edit2 className="h-3 w-3 sm:h-4 sm:w-4 text-gray-400 group-hover:text-blue-600 transition-colors flex-shrink-0" />
        </div>
      </Card>

      <Card className="p-3 sm:p-4 hover:shadow-md transition-shadow">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="p-1.5 sm:p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
            <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-green-600 dark:text-green-400" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Tiempo
            </p>
            <p className="text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100">
              {tiempoSesion}
            </p>
          </div>
        </div>
      </Card>

      <Card className="p-3 sm:p-4 hover:shadow-md transition-shadow">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="p-1.5 sm:p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
            <ChefHat className="h-4 w-4 sm:h-5 sm:w-5 text-orange-600 dark:text-orange-400" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Items
            </p>
            <p className="text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100">
              {itemsCount}
            </p>
          </div>
        </div>
      </Card>

      <Card className="p-3 sm:p-4 hover:shadow-md transition-shadow bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border-blue-200 dark:border-blue-800">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="p-1.5 sm:p-2 bg-blue-600 rounded-lg">
            <Receipt className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-blue-700 dark:text-blue-300 font-medium">
              Total
            </p>
            <p className="text-base sm:text-lg font-bold text-blue-900 dark:text-blue-100 truncate">
              {formatCurrency(total)}
            </p>
          </div>
        </div>
      </Card>

      <Card
        className={`p-3 sm:p-4 hover:shadow-md transition-shadow ${onEditarMesero ? 'cursor-pointer group relative' : ''}`}
        onClick={onEditarMesero}
      >
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="p-1.5 sm:p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
            <UserCircle className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Mesero
            </p>
            <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">
              {serverName || 'Sin asignar'}
            </p>
          </div>
          {onEditarMesero && (
            <Edit2 className="h-3 w-3 sm:h-4 sm:w-4 text-gray-400 group-hover:text-purple-600 transition-colors flex-shrink-0" />
          )}
        </div>
      </Card>
    </div>
  );
}
