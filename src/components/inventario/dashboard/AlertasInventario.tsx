'use client';

import { FC } from 'react';
import { cn } from '@/utils/Utils';
import { 
  AlertTriangle, 
  PackageX, 
  Clock, 
  FileText, 
  Truck, 
  ShoppingCart,
  ChevronRight
} from 'lucide-react';
import { StockAlert } from '@/lib/services/inventoryDashboardService';
import Link from 'next/link';

interface AlertasInventarioProps {
  alerts: StockAlert[];
  isLoading?: boolean;
  className?: string;
}

const getAlertIcon = (type: StockAlert['type']) => {
  switch (type) {
    case 'low_stock':
      return <AlertTriangle className="h-5 w-5" />;
    case 'out_of_stock':
      return <PackageX className="h-5 w-5" />;
    case 'expiring_lot':
      return <Clock className="h-5 w-5" />;
    case 'pending_adjustment':
      return <FileText className="h-5 w-5" />;
    case 'pending_transfer':
      return <Truck className="h-5 w-5" />;
    case 'pending_purchase':
      return <ShoppingCart className="h-5 w-5" />;
    default:
      return <AlertTriangle className="h-5 w-5" />;
  }
};

const getSeverityStyles = (severity: StockAlert['severity']) => {
  switch (severity) {
    case 'critical':
      return {
        bg: 'bg-red-50 dark:bg-red-900/20',
        border: 'border-red-200 dark:border-red-800',
        icon: 'text-red-600 dark:text-red-400',
        text: 'text-red-800 dark:text-red-300',
      };
    case 'warning':
      return {
        bg: 'bg-amber-50 dark:bg-amber-900/20',
        border: 'border-amber-200 dark:border-amber-800',
        icon: 'text-amber-600 dark:text-amber-400',
        text: 'text-amber-800 dark:text-amber-300',
      };
    case 'info':
    default:
      return {
        bg: 'bg-blue-50 dark:bg-blue-900/20',
        border: 'border-blue-200 dark:border-blue-800',
        icon: 'text-blue-600 dark:text-blue-400',
        text: 'text-blue-800 dark:text-blue-300',
      };
  }
};

const AlertasInventario: FC<AlertasInventarioProps> = ({ alerts, isLoading, className }) => {
  if (isLoading) {
    return (
      <div className={cn(
        "bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 border border-gray-200 dark:border-gray-700",
        className
      )}>
        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          Alertas
        </h3>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="h-16 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const criticalCount = alerts.filter(a => a.severity === 'critical').length;
  const warningCount = alerts.filter(a => a.severity === 'warning').length;

  return (
    <div className={cn(
      "bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 border border-gray-200 dark:border-gray-700",
      className
    )}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          Alertas
          {alerts.length > 0 && (
            <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
              ({alerts.length})
            </span>
          )}
        </h3>
        {(criticalCount > 0 || warningCount > 0) && (
          <div className="flex gap-2">
            {criticalCount > 0 && (
              <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                {criticalCount} críticas
              </span>
            )}
            {warningCount > 0 && (
              <span className="px-2 py-1 text-xs font-medium rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                {warningCount} advertencias
              </span>
            )}
          </div>
        )}
      </div>

      {alerts.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <PackageX className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>No hay alertas activas</p>
          <p className="text-sm">Tu inventario está en orden</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {alerts.map((alert) => {
            const styles = getSeverityStyles(alert.severity);
            return (
              <div
                key={alert.id}
                className={cn(
                  "p-3 rounded-lg border flex items-start gap-3 transition-colors hover:opacity-90",
                  styles.bg,
                  styles.border
                )}
              >
                <div className={cn("mt-0.5", styles.icon)}>
                  {getAlertIcon(alert.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn("font-medium text-sm", styles.text)}>
                    {alert.title}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                    {alert.description}
                  </p>
                </div>
                {alert.productId && (
                  <Link
                    href={`/app/inventario/productos/${alert.productId}`}
                    className={cn(
                      "p-1 rounded hover:bg-white/50 dark:hover:bg-gray-700/50 transition-colors",
                      styles.icon
                    )}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AlertasInventario;
