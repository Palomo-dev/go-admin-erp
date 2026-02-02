'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/utils/Utils';
import {
  ArrowLeft,
  Copy,
  Check,
  Link2,
  Share2,
  Clock,
} from 'lucide-react';
import { format, formatDistanceStrict } from 'date-fns';
import { es } from 'date-fns/locale';

interface CorrelationHeaderProps {
  correlationId: string;
  totalEvents: number;
  firstEventTime?: string;
  lastEventTime?: string;
  onBack: () => void;
  onShare: () => void;
}

export function CorrelationHeader({
  correlationId,
  totalEvents,
  firstEventTime,
  lastEventTime,
  onBack,
  onShare,
}: CorrelationHeaderProps) {
  const [copiedId, setCopiedId] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const handleCopyId = () => {
    navigator.clipboard.writeText(correlationId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleCopyUrl = () => {
    const url = `${window.location.origin}/app/timeline/correlaciones/${correlationId}`;
    navigator.clipboard.writeText(url);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  // Calcular duración de la operación
  const getDuration = () => {
    if (!firstEventTime || !lastEventTime) return null;
    const first = new Date(firstEventTime);
    const last = new Date(lastEventTime);
    if (first.getTime() === last.getTime()) return 'Instantáneo';
    return formatDistanceStrict(first, last, { locale: es });
  };

  const duration = getDuration();

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

        {/* Contenido principal */}
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="flex items-start gap-4">
            {/* Icono */}
            <div className="p-3 rounded-lg bg-cyan-100 dark:bg-cyan-900/30">
              <Link2 className="h-8 w-8 text-cyan-600 dark:text-cyan-400" />
            </div>

            <div className="space-y-2">
              {/* Badge */}
              <Badge variant="secondary" className="bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400">
                Traza de Correlación
              </Badge>

              {/* Título */}
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Operación Completa
              </h1>

              {/* Correlation ID */}
              <div className="flex items-center gap-3">
                <code className="text-sm font-mono bg-gray-100 dark:bg-gray-700 px-3 py-1.5 rounded text-gray-700 dark:text-gray-300">
                  {correlationId}
                </code>
                
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleCopyId}
                        className="h-8 w-8 p-0"
                      >
                        {copiedId ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">{copiedId ? 'Copiado!' : 'Copiar ID'}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>

              {/* Estadísticas */}
              <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                <span className="font-medium text-gray-900 dark:text-white">
                  {totalEvents} {totalEvents === 1 ? 'evento' : 'eventos'}
                </span>
                
                {duration && (
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-4 w-4" />
                    <span>Duración: {duration}</span>
                  </div>
                )}
                
                {firstEventTime && (
                  <span>
                    Inicio: {format(new Date(firstEventTime), "dd/MM/yyyy HH:mm:ss", { locale: es })}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Acciones */}
          <div className="flex items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyUrl}
                    className="border-gray-300 dark:border-gray-600"
                  >
                    {copiedUrl ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Share2 className="h-4 w-4" />
                    )}
                    <span className="ml-2">{copiedUrl ? 'Enlace copiado' : 'Compartir'}</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Copiar enlace para compartir</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </div>
    </div>
  );
}
