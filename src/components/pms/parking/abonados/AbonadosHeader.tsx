'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Plus, RefreshCw, Settings } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface AbonadosHeaderProps {
  onRefresh: () => void;
  onNewPass: () => void;
  onManageTypes: () => void;
  isLoading: boolean;
}

export function AbonadosHeader({ onRefresh, onNewPass, onManageTypes, isLoading }: AbonadosHeaderProps) {
  const t = useTranslations('pmsParking');
  return (
    <div className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-6 py-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {t('abonadosHeader.abonadosParking')}
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {t('abonadosHeader.gestionaPasesMembresiasEstacionamiento')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            {t('abonadosHeader.actualizar')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onManageTypes}
          >
            <Settings className="h-4 w-4 mr-2" />
            {t('abonadosHeader.tiposPlan')}
          </Button>
          <Button
            size="sm"
            onClick={onNewPass}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus className="h-4 w-4 mr-2" />
            {t('abonadosHeader.nuevoAbonado')}
          </Button>
        </div>
      </div>
    </div>
  );
}
