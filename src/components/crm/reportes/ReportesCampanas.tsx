'use client';

import { Send, Eye, MousePointer, Reply, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/utils/Utils';
import type { CampaignMetrics } from './types';

interface ReportesCampanasProps {
  metrics: CampaignMetrics[];
  loading?: boolean;
}

const getStatusBadge = (status: string) => {
  switch (status?.toLowerCase()) {
    case 'active':
    case 'activa':
      return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Activa</Badge>;
    case 'draft':
    case 'borrador':
      return <Badge className="bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400">Borrador</Badge>;
    case 'scheduled':
    case 'programada':
      return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">Programada</Badge>;
    case 'completed':
    case 'completada':
      return <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">Completada</Badge>;
    case 'paused':
    case 'pausada':
      return <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">Pausada</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

export function ReportesCampanas({ metrics, loading }: ReportesCampanasProps) {
  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Rendimiento de Campañas
        </h3>
        <div className="animate-pulse space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 bg-gray-200 dark:bg-gray-700 rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        Rendimiento de Campañas
      </h3>

      {metrics.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 text-center py-8">
          No hay campañas disponibles
        </p>
      ) : (
        <div className="space-y-4">
          {metrics.map((campaign) => (
            <div
              key={campaign.campaignId}
              className="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <h4 className="font-medium text-gray-900 dark:text-white">
                    {campaign.campaignName}
                  </h4>
                  {getStatusBadge(campaign.status)}
                </div>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {campaign.totalContacts} contactos
                </span>
              </div>

              <div className="grid grid-cols-5 gap-4">
                <MetricCard
                  icon={Send}
                  label="Enviados"
                  value={campaign.sent}
                  color="text-blue-600 dark:text-blue-400"
                  bgColor="bg-blue-50 dark:bg-blue-900/20"
                />
                <MetricCard
                  icon={Eye}
                  label="Abiertos"
                  value={campaign.opened}
                  rate={campaign.openRate}
                  color="text-green-600 dark:text-green-400"
                  bgColor="bg-green-50 dark:bg-green-900/20"
                />
                <MetricCard
                  icon={MousePointer}
                  label="Clicks"
                  value={campaign.clicked}
                  rate={campaign.clickRate}
                  color="text-purple-600 dark:text-purple-400"
                  bgColor="bg-purple-50 dark:bg-purple-900/20"
                />
                <MetricCard
                  icon={Reply}
                  label="Respuestas"
                  value={campaign.replied}
                  rate={campaign.replyRate}
                  color="text-indigo-600 dark:text-indigo-400"
                  bgColor="bg-indigo-50 dark:bg-indigo-900/20"
                />
                <MetricCard
                  icon={AlertTriangle}
                  label="Rebotes"
                  value={campaign.bounced}
                  color="text-red-600 dark:text-red-400"
                  bgColor="bg-red-50 dark:bg-red-900/20"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface MetricCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  rate?: number;
  color: string;
  bgColor: string;
}

function MetricCard({ icon: Icon, label, value, rate, color, bgColor }: MetricCardProps) {
  return (
    <div className="text-center">
      <div className={cn('inline-flex p-2 rounded-lg mb-2', bgColor)}>
        <Icon className={cn('h-4 w-4', color)} />
      </div>
      <p className="text-lg font-semibold text-gray-900 dark:text-white">
        {value.toLocaleString()}
      </p>
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      {rate !== undefined && (
        <p className={cn('text-xs font-medium', color)}>{rate}%</p>
      )}
    </div>
  );
}
