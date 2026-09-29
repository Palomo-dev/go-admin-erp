'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  AlertCircle,
  Info,
  CreditCard,
  Package,
  BedDouble,
  Bell,
  CheckCircle2,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Tarjeta } from '@/components/kit';
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
    bg: 'bg-danger-subtle',
    border: 'border-line-danger',
    icon: 'text-danger-text',
    Icon: AlertTriangle,
  },
  media: {
    bg: 'bg-warning-subtle',
    border: 'border-line-warning',
    icon: 'text-warning-text',
    Icon: AlertCircle,
  },
  baja: {
    bg: 'bg-info-subtle',
    border: 'border-line-info',
    icon: 'text-info-text',
    Icon: Info,
  },
};

export function DashboardAlertas({ organizationId, activeModuleCodes }: DashboardAlertasProps) {
  const t = useTranslations('home');
  const [todas, setTodas] = useState<AlertaDashboard[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Una sola consulta por organización. El filtro por módulos activos se
  // aplica al renderizar: antes estaba en las dependencias del efecto y, al
  // llegar los códigos (undefined → lista), se volvía a consultar y, si no
  // había alertas, se volvía a mostrar el skeleton.
  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    setIsLoading(true);
    inicioService
      .getAlertas(organizationId)
      .then((result) => {
        if (!cancelled) setTodas(result);
      })
      .catch((err) => {
        console.error('Error cargando alertas:', err);
        if (!cancelled) setTodas([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  const alertas = useMemo(
    () => (activeModuleCodes ? todas.filter((a) => activeModuleCodes.includes(a.modulo)) : todas),
    [todas, activeModuleCodes],
  );

  if (isLoading) {
    return (
      <Tarjeta titulo={t('attentionRequired')} icono={Bell} tono="advertencia">
        <div className="space-y-2">
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
        </div>
      </Tarjeta>
    );
  }

  if (alertas.length === 0) {
    return (
      // Sin alertas: la misma Tarjeta en tono éxito. Convertirla en casillas
      // `TarjetaHoy` (Figma «Hoy») es otro cambio (#10 de la auditoría).
      <Tarjeta tono="exito">
        <p role="status" className="flex items-center gap-2 text-sm font-medium text-success-text">
          <CheckCircle2 aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.5} />
          {t('noAlerts')}
        </p>
      </Tarjeta>
    );
  }

  return (
    <Tarjeta
      titulo={t('attentionRequired')}
      icono={Bell}
      tono="advertencia"
      accion={<Badge tono="advertencia" tamano="sm">{alertas.length}</Badge>}
    >

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
                'block rounded-lg border p-3 transition-all hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                config.bg,
                config.border,
              )}
            >
              <div className="flex items-start gap-3">
                <AlertIcon className={cn('h-4 w-4 mt-0.5 flex-shrink-0', config.icon)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <ModuleIcon className={cn('h-3.5 w-3.5', config.icon)} />
                    <p className="truncate text-sm font-medium text-fg">
                      {alerta.titulo}
                    </p>
                  </div>
                  <p className="mt-0.5 text-xs text-fg-secondary">
                    {alerta.descripcion}
                  </p>
                  {alerta.monto !== undefined && alerta.monto > 0 && (
                    <p className={cn('mt-1 text-xs font-semibold tabular-nums', config.icon)}>
                      {formatCurrency(alerta.monto)}
                    </p>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </Tarjeta>
  );
}
