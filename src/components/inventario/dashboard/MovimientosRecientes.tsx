'use client';

import { FC } from 'react';
import { cn, formatDate } from '@/utils/Utils';
import { 
  ArrowDownCircle, 
  ArrowUpCircle, 
  ArrowRightLeft, 
  RotateCcw, 
  Activity,
  Package
} from 'lucide-react';
import { RecentMovement } from '@/lib/services/inventoryDashboardService';
import Link from 'next/link';

interface MovimientosRecientesProps {
  movements: RecentMovement[];
  isLoading?: boolean;
  className?: string;
}

const getMovementIcon = (type: string) => {
  switch (type.toLowerCase()) {
    case 'entrada':
    case 'in':
    case 'purchase':
      return <ArrowDownCircle className="h-5 w-5 text-green-500" />;
    case 'salida':
    case 'out':
    case 'sale':
      return <ArrowUpCircle className="h-5 w-5 text-red-500" />;
    case 'transfer':
    case 'transferencia':
      return <ArrowRightLeft className="h-5 w-5 text-blue-500" />;
    case 'adjustment':
    case 'ajuste':
      return <RotateCcw className="h-5 w-5 text-amber-500" />;
    default:
      return <Activity className="h-5 w-5 text-gray-500" />;
  }
};

const getMovementLabel = (type: string) => {
  switch (type.toLowerCase()) {
    case 'entrada':
    case 'in':
    case 'purchase':
      return 'Entrada';
    case 'salida':
    case 'out':
    case 'sale':
      return 'Salida';
    case 'transfer':
    case 'transferencia':
      return 'Transferencia';
    case 'adjustment':
    case 'ajuste':
      return 'Ajuste';
    default:
      return type;
  }
};

const MovimientosRecientes: FC<MovimientosRecientesProps> = ({ movements, isLoading, className }) => {
  if (isLoading) {
    return (
      <div className={cn(
        "bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 border border-gray-200 dark:border-gray-700",
        className
      )}>
        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white flex items-center gap-2">
          <Activity className="h-5 w-5 text-blue-500" />
          Movimientos Recientes
        </h3>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="h-14 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 border border-gray-200 dark:border-gray-700",
      className
    )}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Activity className="h-5 w-5 text-blue-500" />
          Movimientos Recientes
        </h3>
        <Link 
          href="/app/inventario/movimientos"
          className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          Ver todos
        </Link>
      </div>

      {movements.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>No hay movimientos recientes</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {movements.map((movement) => (
            <div
              key={movement.id}
              className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors flex items-center gap-3"
            >
              <div className="flex-shrink-0">
                {getMovementIcon(movement.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-medium">
                    {getMovementLabel(movement.type)}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {movement.branchName}
                  </span>
                </div>
                <Link 
                  href={`/app/inventario/productos/${movement.productId}`}
                  className="font-medium text-sm text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 truncate block"
                >
                  {movement.productName}
                </Link>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  SKU: {movement.productSku}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className={cn(
                  "font-semibold",
                  movement.quantity > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                )}>
                  {movement.quantity > 0 ? '+' : ''}{movement.quantity}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {formatDate(movement.createdAt)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MovimientosRecientes;
