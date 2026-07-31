'use client';

import { useThemeClasses } from '@/lib/theme';
import React from 'react';
import { ChefHat } from 'lucide-react';
import { Card } from '@/components/ui/card';

interface EmptyStateProps {
  message?: string;
  description?: string;
}

export function EmptyState({ 
  message = 'No hay comandas',
  description = 'Las nuevas comandas aparecerán aquí en tiempo real'
}: EmptyStateProps) {
  const { themeClass } = useThemeClasses();
  return (
    <Card className="p-16 text-center">
      <ChefHat className={`h-16 w-16 mx-auto mb-4 text-gray-400 ${themeClass("", "text-gray-600")}`} />
      <h3 className={`text-lg font-semibold text-gray-900 mb-2 ${themeClass("", "text-gray-100")}`}>
        {message}
      </h3>
      <p className={`text-gray-500 ${themeClass("", "text-gray-400")}`}>
        {description}
      </p>
    </Card>
  );
}
