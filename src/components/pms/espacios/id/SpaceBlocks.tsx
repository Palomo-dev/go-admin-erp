'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Ban, Calendar, Wrench, User, PartyPopper, Clock, HelpCircle } from 'lucide-react';
import { ReservationBlock, BlockType } from '@/lib/services/reservationBlocksService';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

interface SpaceBlocksProps {
  blocks: ReservationBlock[];
  isLoading?: boolean;
}

const blockTypeConfig: Record<BlockType, { label: string; color: string; icon: any }> = {
  maintenance: {
    label: 'Mantenimiento',
    color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
    icon: Wrench,
  },
  owner: {
    label: 'Propietario',
    color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
    icon: User,
  },
  event: {
    label: 'Evento',
    color: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-300',
    icon: PartyPopper,
  },
  ota_hold: {
    label: 'Hold OTA',
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    icon: Clock,
  },
  other: {
    label: 'Otro',
    color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
    icon: HelpCircle,
  },
};

function isActiveToday(dateFrom: string, dateTo: string): boolean {
  const today = new Date().toISOString().split('T')[0];
  return dateFrom <= today && dateTo >= today;
}

export function SpaceBlocks({ blocks, isLoading }: SpaceBlocksProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ban className="h-5 w-5" />
            Bloqueos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-16 bg-gray-200 dark:bg-gray-700 rounded"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Ban className="h-5 w-5" />
          Bloqueos
          {blocks.length > 0 && (
            <Badge variant="secondary">{blocks.length}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {blocks.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
            Sin bloqueos activos o programados
          </p>
        ) : (
          <div className="space-y-3">
            {blocks.map((block) => {
              const config = blockTypeConfig[block.block_type];
              const Icon = config.icon;
              const isActive = isActiveToday(block.date_from, block.date_to);

              return (
                <div
                  key={block.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border ${
                    isActive
                      ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950'
                      : 'border-gray-200 dark:border-gray-700'
                  }`}
                >
                  <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${config.color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className={config.color} variant="secondary">
                        {config.label}
                      </Badge>
                      {isActive && (
                        <Badge variant="destructive" className="text-xs">
                          Activo
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
                      <Calendar className="h-3 w-3" />
                      <span>
                        {format(parseISO(block.date_from), 'dd MMM', { locale: es })} -{' '}
                        {format(parseISO(block.date_to), 'dd MMM yyyy', { locale: es })}
                      </span>
                    </div>
                    {block.reason && (
                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-300 truncate">
                        {block.reason}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
