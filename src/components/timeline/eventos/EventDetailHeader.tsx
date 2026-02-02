'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/utils/Utils';
import {
  ArrowLeft,
  Clock,
  User,
  MapPin,
  Copy,
  Check,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { TimelineEvent } from '@/lib/services/timelineService';
import {
  SOURCE_TABLE_LABELS,
  SOURCE_TABLE_COLORS,
  ACTION_LABELS,
  SOURCE_CATEGORY_LABELS,
} from '@/lib/services/timelineService';

interface EventDetailHeaderProps {
  event: TimelineEvent;
  actorName?: string;
  branchName?: string;
  onBack: () => void;
}

export function EventDetailHeader({
  event,
  actorName,
  branchName,
  onBack,
}: EventDetailHeaderProps) {
  const [copiedId, setCopiedId] = React.useState(false);

  const handleCopyEventId = () => {
    navigator.clipboard.writeText(event.event_id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const eventTime = new Date(event.event_time);

  const getActionColor = (action: string) => {
    const colors: Record<string, string> = {
      create: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800',
      update: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800',
      delete: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800',
      approve: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
      reject: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400 border-rose-200 dark:border-rose-800',
    };
    return colors[action] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600';
  };

  return (
    <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
      <div className="px-4 sm:px-6 lg:px-8 py-6">
        {/* Navegación */}
        <div className="flex items-center gap-4 mb-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver al Timeline
          </Button>
        </div>

        {/* Título y badges */}
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="space-y-3">
            {/* Badges */}
            <div className="flex flex-wrap items-center gap-2">
              <Badge 
                variant="secondary" 
                className={cn('text-sm font-medium', SOURCE_TABLE_COLORS[event.source_table])}
              >
                {SOURCE_TABLE_LABELS[event.source_table] || event.source_table}
              </Badge>
              <Badge 
                variant="outline" 
                className={cn('text-sm font-medium border', getActionColor(event.action))}
              >
                {ACTION_LABELS[event.action] || event.action}
              </Badge>
              <Badge variant="outline" className="text-sm text-gray-600 dark:text-gray-400">
                {SOURCE_CATEGORY_LABELS[event.source_category] || event.source_category}
              </Badge>
            </div>

            {/* Título */}
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {event.event_type}
            </h1>

            {/* Subtítulo con entidad */}
            <p className="text-gray-600 dark:text-gray-400">
              Entidad: <span className="font-mono bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-sm">
                {event.entity_type}
              </span>
              <span className="mx-2">→</span>
              <span className="font-mono bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-sm">
                {event.entity_id.length > 36 ? `${event.entity_id.substring(0, 36)}...` : event.entity_id}
              </span>
            </p>

            {/* Metadatos rápidos */}
            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
              <div className="flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                <span>{format(eventTime, "EEEE, d 'de' MMMM 'de' yyyy, HH:mm:ss", { locale: es })}</span>
              </div>
              
              <div className="flex items-center gap-1.5">
                <User className="h-4 w-4" />
                <span>{actorName || (event.actor_id ? 'Usuario' : 'Sistema')}</span>
              </div>

              {(event.branch_id || branchName) && (
                <div className="flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" />
                  <span>{branchName || `Sucursal #${event.branch_id}`}</span>
                </div>
              )}
            </div>
          </div>

          {/* Event ID */}
          <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-900 rounded-lg px-4 py-3">
            <div className="text-xs text-gray-500 dark:text-gray-400">Event ID</div>
            <code className="text-xs font-mono text-gray-700 dark:text-gray-300 max-w-[200px] truncate">
              {event.event_id}
            </code>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopyEventId}
                    className="h-7 w-7 p-0"
                  >
                    {copiedId ? (
                      <Check className="h-3.5 w-3.5 text-green-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">{copiedId ? 'Copiado!' : 'Copiar Event ID'}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </div>
    </div>
  );
}
