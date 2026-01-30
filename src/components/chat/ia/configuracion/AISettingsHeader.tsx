'use client';

import { Bot, Power, RefreshCw, Briefcase, FlaskConical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';

interface AISettingsHeaderProps {
  isActive: boolean;
  loading: boolean;
  onToggle: () => void;
  onRefresh: () => void;
  onViewJobs?: () => void;
  onViewLab?: () => void;
}

export default function AISettingsHeader({
  isActive,
  loading,
  onToggle,
  onRefresh,
  onViewJobs,
  onViewLab
}: AISettingsHeaderProps) {
  return (
    <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <div className="p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
              <Bot className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-white">
                  Configuración de IA
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
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Configura el comportamiento del asistente de IA para tu organización
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {onViewLab && (
              <Button
                variant="outline"
                onClick={onViewLab}
                className="border-gray-300 dark:border-gray-700 gap-2"
              >
                <FlaskConical className="h-4 w-4" />
                Laboratorio
              </Button>
            )}
            {onViewJobs && (
              <Button
                variant="outline"
                onClick={onViewJobs}
                className="border-gray-300 dark:border-gray-700 gap-2"
              >
                <Briefcase className="h-4 w-4" />
                Trabajos
              </Button>
            )}
            <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                IA {isActive ? 'Activada' : 'Desactivada'}
              </span>
              <Switch
                checked={isActive}
                onCheckedChange={onToggle}
                disabled={loading}
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={onRefresh}
              disabled={loading}
              className="border-gray-300 dark:border-gray-700"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
