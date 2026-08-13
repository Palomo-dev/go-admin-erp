'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  AlertCircle,
  Info,
  CreditCard,
  Package,
  BedDouble,
  Bell,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/utils/Utils';
import { inicioService, type AlertaDashboard } from './inicioService';
import { useTranslations } from 'next-intl';
import { formatCurrency } from '@/utils/Utils';

interface DashboardAlertasProps {
  organizationId: number | undefined;
  /** Códigos de módulos activos para filtrar alertas relevantes */
  activeModuleCodes?: string[];
}

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  CreditCard,
  Package,
  BedDouble,
};

const SEVERITY_CONFIG = {
  alta: {
    bg: 'bg-red-50 dark:bg-red-900/20',
    border: 'border-red-200 dark:border-red-800',
    icon: 'text-red-600 dark:text-red-400',
    Icon: AlertTriangle,
  },
  media: {
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    border: 'border-amber-200 dark:border-amber-800',
    icon: 'text-amber-600 dark:text-amber-400',
    Icon: AlertCircle,
  },
  baja: {
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    border: 'border-blue-200 dark:border-blue-800',
    icon: 'text-blue-600 dark:text-blue-400',
    Icon: Info,
  },
};

export function DashboardAlertas({ organizationId, activeModuleCodes }: DashboardAlertasProps) {
  const t = useTranslations('home');
  const [alertas, setAlertas] = useState<AlertaDashboard[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    setIsLoading(true);
    inicioService
      .getAlertas(organizationId)
      .then((result) => {
        if (cancelled) return;
        // Filtrar por módulos activos si se proporciona
        const filtered = activeModuleCodes
          ? result.filter((a) => activeModuleCodes.includes(a.modulo))
          : result;
        setAlertas(filtered);
      })
      .catch((err) => {
        console.error('Error cargando alertas:', err);
        if (!cancelled) setAlertas([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, activeModuleCodes]);

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Bell className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            {t('attentionRequired')}
          </h3>
        </div>
        <div className="space-y-2">
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  if (alertas.length === 0) {
    return (
      <div className="bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800 p-5">
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-green-600 dark:text-green-400" />
          <p className="text-sm font-medium text-green-700 dark:text-green-300">
            {t('noAlerts')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center gap-2 mb-3">
        <Bell className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          {t('attentionRequired')}
        </h3>
        <span className="ml-auto text-xs font-medium text-gray-500 dark:text-gray-400">
          {alertas.length}
        </span>
      </div>

      <div className="space-y-2">
        {alertas.map((alerta) => {
          const config = SEVERITY_CONFIG[alerta.severidad];
          const AlertIcon = config.Icon;
          const ModuleIcon = ICON_MAP[alerta.icono] || Info;

          return (
            <Link
              key={alerta.id}
              href={alerta.href}
              className={cn(
                'block p-3 rounded-lg border transition-all hover:shadow-sm',
                config.bg,
                config.border,
              )}
            >
              <div className="flex items-start gap-3">
                <AlertIcon className={cn('h-4 w-4 mt-0.5 flex-shrink-0', config.icon)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <ModuleIcon className={cn('h-3.5 w-3.5', config.icon)} />
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {alerta.titulo}
                    </p>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                    {alerta.descripcion}
                  </p>
                  {alerta.monto !== undefined && alerta.monto > 0 && (
                    <p className={cn('text-xs font-semibold mt-1', config.icon)}>
                      {formatCurrency(alerta.monto)}
                    </p>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
