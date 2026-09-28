'use client';

import React from 'react';
import { RefreshCw, ChefHat, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';

interface PageHeaderProps {
  onRefresh: () => void;
  isLoading: boolean;
  soundEnabled?: boolean;
  onToggleSound?: () => void;
}

export function PageHeader({ onRefresh, isLoading, soundEnabled, onToggleSound }: PageHeaderProps) {
  const t = useTranslations('posComandas.cabecera');
  return (
    <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10 shadow-sm">
      <div className="px-3 sm:px-6 py-3 sm:py-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-3">
            <ChefHat className="h-8 w-8 text-blue-600 dark:text-blue-300" />
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
                {t('titulo')}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('subtitulo')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onToggleSound && (
              <Button
                onClick={onToggleSound}
                variant="outline"
                size="icon"
                title={soundEnabled ? t('desactivarSonido') : t('activarSonido')}
              >
                {soundEnabled ? <Volume2 className="h-4 w-4 text-blue-600 dark:text-blue-300" /> : <VolumeX className="h-4 w-4 text-gray-400 dark:text-gray-500" />}
              </Button>
            )}
            <Button
              onClick={onRefresh}
              variant="outline"
              disabled={isLoading}
              className="shrink-0"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{t('actualizar')}</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
