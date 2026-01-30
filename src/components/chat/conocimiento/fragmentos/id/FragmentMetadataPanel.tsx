'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Zap, 
  Database, 
  Clock, 
  Hash, 
  GitBranch, 
  ThumbsUp, 
  ThumbsDown,
  BarChart3,
  Settings
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { es } from 'date-fns/locale';
import { EmbeddingInfo } from '@/lib/services/knowledgeService';

interface FragmentMetadataPanelProps {
  sourceName?: string;
  sourceIcon?: string;
  version: number;
  contentHash: string | null;
  priority: number;
  usageCount: number;
  positiveFeedback: number;
  negativeFeedback: number;
  createdAt: string;
  updatedAt: string;
  hasEmbedding: boolean;
  embeddingInfo: EmbeddingInfo | null;
  onPriorityChange: (priority: number) => void;
}

export default function FragmentMetadataPanel({
  sourceName,
  sourceIcon,
  version,
  contentHash,
  priority,
  usageCount,
  positiveFeedback,
  negativeFeedback,
  createdAt,
  updatedAt,
  hasEmbedding,
  embeddingInfo,
  onPriorityChange
}: FragmentMetadataPanelProps) {
  return (
    <div className="space-y-4">
      {sourceName && (
        <Card className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <Database className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              Fuente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              {sourceIcon && <span className="text-lg">{sourceIcon}</span>}
              <span className="text-gray-900 dark:text-white font-medium">{sourceName}</span>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
            <Zap className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            Estado de Indexación
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">Estado</span>
            <Badge 
              variant={hasEmbedding ? 'default' : 'secondary'}
              className={hasEmbedding 
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
              }
            >
              {hasEmbedding ? 'Indexado' : 'Sin indexar'}
            </Badge>
          </div>
          {embeddingInfo && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">Modelo</span>
                <span className="text-sm font-mono text-gray-900 dark:text-white">
                  {embeddingInfo.model}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">Indexado</span>
                <span className="text-sm text-gray-900 dark:text-white">
                  {formatDistanceToNow(new Date(embeddingInfo.created_at), { addSuffix: true, locale: es })}
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            Versionado
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">Versión</span>
            <Badge variant="outline" className="font-mono">v{version}</Badge>
          </div>
          {contentHash && (
            <div className="flex flex-col gap-1">
              <span className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1">
                <Hash className="h-3 w-3" />
                Hash del contenido
              </span>
              <span className="text-xs font-mono text-gray-500 dark:text-gray-400 break-all bg-gray-50 dark:bg-gray-800 p-2 rounded">
                {contentHash}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
            <Settings className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            Configuración
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label className="text-sm text-gray-600 dark:text-gray-400">Prioridad</Label>
            <Select 
              value={String(priority)} 
              onValueChange={(value) => onPriorityChange(parseInt(value))}
            >
              <SelectTrigger className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 - Más baja</SelectItem>
                <SelectItem value="2">2 - Baja</SelectItem>
                <SelectItem value="3">3 - Algo baja</SelectItem>
                <SelectItem value="4">4 - Media baja</SelectItem>
                <SelectItem value="5">5 - Normal</SelectItem>
                <SelectItem value="6">6 - Media alta</SelectItem>
                <SelectItem value="7">7 - Algo alta</SelectItem>
                <SelectItem value="8">8 - Alta</SelectItem>
                <SelectItem value="9">9 - Muy alta</SelectItem>
                <SelectItem value="10">10 - Máxima</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            Estadísticas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">Usos</span>
            <span className="text-sm font-medium text-gray-900 dark:text-white">{usageCount}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1">
              <ThumbsUp className="h-3 w-3 text-green-500" />
              Positivos
            </span>
            <span className="text-sm font-medium text-green-600 dark:text-green-400">{positiveFeedback}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1">
              <ThumbsDown className="h-3 w-3 text-red-500" />
              Negativos
            </span>
            <span className="text-sm font-medium text-red-600 dark:text-red-400">{negativeFeedback}</span>
          </div>
        </CardContent>
      </Card>

      <Card className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
            <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            Fechas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-1">
            <span className="text-sm text-gray-600 dark:text-gray-400">Creado</span>
            <span className="text-sm text-gray-900 dark:text-white">
              {format(new Date(createdAt), "d 'de' MMMM yyyy, HH:mm", { locale: es })}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm text-gray-600 dark:text-gray-400">Última actualización</span>
            <span className="text-sm text-gray-900 dark:text-white">
              {format(new Date(updatedAt), "d 'de' MMMM yyyy, HH:mm", { locale: es })}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
