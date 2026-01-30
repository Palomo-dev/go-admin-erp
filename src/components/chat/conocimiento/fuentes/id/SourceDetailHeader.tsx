'use client';

import { ArrowLeft, Database, RefreshCw, Settings, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

interface SourceStats {
  totalFragments: number;
  indexedFragments: number;
  activeFragments: number;
}

interface SourceDetailHeaderProps {
  name: string;
  description?: string | null;
  icon?: string | null;
  isActive: boolean;
  stats: SourceStats;
  loading?: boolean;
  onBack: () => void;
  onRefresh: () => void;
  onReindex: () => void;
  onSettings: () => void;
  reindexing?: boolean;
}

export default function SourceDetailHeader({
  name,
  description,
  icon,
  isActive,
  stats,
  loading,
  onBack,
  onRefresh,
  onReindex,
  onSettings,
  reindexing
}: SourceDetailHeaderProps) {
  const indexPercentage = stats.totalFragments > 0 
    ? Math.round((stats.indexedFragments / stats.totalFragments) * 100) 
    : 0;

  return (
    <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
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
                <Database className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                    {icon && <span className="mr-2">{icon}</span>}
                    {name}
                  </h1>
                  <Badge 
                    variant={isActive ? 'default' : 'secondary'}
                    className={isActive 
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                      : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                    }
                  >
                    {isActive ? 'Activa' : 'Inactiva'}
                  </Badge>
                </div>
                {description && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {description}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={loading}
              className="border-gray-300 dark:border-gray-700"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Actualizar
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onReindex}
              disabled={reindexing || stats.totalFragments === 0}
              className="border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
            >
              <Zap className={`h-4 w-4 mr-2 ${reindexing ? 'animate-pulse' : ''}`} />
              {reindexing ? 'Reindexando...' : 'Reindexar'}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onSettings}
              className="text-gray-600 dark:text-gray-400"
            >
              <Settings className="h-5 w-5" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4 mt-4">
          <Card className="bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {stats.totalFragments}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Total Fragmentos
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {stats.activeFragments}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Activos
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {stats.indexedFragments}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Indexados
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700">
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {indexPercentage}%
                </div>
                <div className="flex-1">
                  <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-500 rounded-full transition-all duration-300"
                      style={{ width: `${indexPercentage}%` }}
                    />
                  </div>
                </div>
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Cobertura
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
