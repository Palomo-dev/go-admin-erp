'use client';

import { ArrowLeft, FileText, Power, RefreshCw, Save, Zap, Clock, Hash, GitBranch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

interface FragmentDetailHeaderProps {
  title: string;
  isActive: boolean;
  hasEmbedding: boolean;
  version: number;
  contentHash: string | null;
  updatedAt: string;
  hasChanges: boolean;
  saving: boolean;
  reindexing: boolean;
  onBack: () => void;
  onSave: () => void;
  onToggle: () => void;
  onReindex: () => void;
}

export default function FragmentDetailHeader({
  title,
  isActive,
  hasEmbedding,
  version,
  contentHash,
  updatedAt,
  hasChanges,
  saving,
  reindexing,
  onBack,
  onSave,
  onToggle,
  onReindex
}: FragmentDetailHeaderProps) {
  return (
    <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <div className="p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={onBack}
              className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <FileText className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white line-clamp-1">
                  {title}
                </h1>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  <Badge 
                    variant={isActive ? 'default' : 'secondary'}
                    className={isActive 
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                      : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                    }
                  >
                    {isActive ? 'Activo' : 'Inactivo'}
                  </Badge>
                  <Badge 
                    variant="outline"
                    className={hasEmbedding 
                      ? 'border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-400'
                      : 'border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-400'
                    }
                  >
                    <Zap className="h-3 w-3 mr-1" />
                    {hasEmbedding ? 'Indexado' : 'Sin indexar'}
                  </Badge>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onToggle}
                    className="border-gray-300 dark:border-gray-700"
                  >
                    <Power className="h-4 w-4 mr-2" />
                    {isActive ? 'Desactivar' : 'Activar'}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{isActive ? 'Desactivar fragmento (no aparecerá en búsquedas)' : 'Activar fragmento'}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onReindex}
                    disabled={reindexing}
                    className="border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${reindexing ? 'animate-spin' : ''}`} />
                    {reindexing ? 'Indexando...' : 'Reindexar'}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Regenerar el embedding para este fragmento</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <Button
              onClick={onSave}
              disabled={!hasChanges || saving}
              className="bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
            >
              <Save className={`h-4 w-4 mr-2 ${saving ? 'animate-pulse' : ''}`} />
              {saving ? 'Guardando...' : 'Guardar'}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 mt-4 text-sm text-gray-500 dark:text-gray-400">
          <div className="flex items-center gap-1">
            <GitBranch className="h-4 w-4" />
            <span>Versión {version}</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            <span>
              Actualizado {formatDistanceToNow(new Date(updatedAt), { addSuffix: true, locale: es })}
            </span>
          </div>
          {contentHash && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1 cursor-help">
                    <Hash className="h-4 w-4" />
                    <span className="font-mono text-xs">{contentHash.substring(0, 8)}...</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="font-mono text-xs">{contentHash}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>
    </div>
  );
}
