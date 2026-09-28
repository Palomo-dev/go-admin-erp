'use client';

import React from 'react';
import { ChefHat } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useTranslations } from 'next-intl';

interface EmptyStateProps {
  message?: string;
  description?: string;
}

export function EmptyState({ message, description }: EmptyStateProps) {
  const t = useTranslations('posComandas.vacio');
  return (
    <Card className="p-16 text-center">
      <ChefHat className="h-16 w-16 mx-auto mb-4 text-gray-400 dark:text-gray-600" />
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
        {message ?? t('titulo')}
      </h3>
      <p className="text-gray-500 dark:text-gray-400">
        {description ?? t('descripcion')}
      </p>
    </Card>
  );
}
