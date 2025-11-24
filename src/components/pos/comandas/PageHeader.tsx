'use client';

import React from 'react';
import { RefreshCw, ChefHat } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PageHeaderProps {
  onRefresh: () => void;
  isLoading: boolean;
}

export function PageHeader({ onRefresh, isLoading }: PageHeaderProps) {
  return (
    <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10 shadow-sm">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ChefHat className="h-8 w-8 text-blue-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                Comandas de Cocina
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Monitor en tiempo real
              </p>
            </div>
          </div>

          <Button
            onClick={onRefresh}
            variant="outline"
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
        </div>
      </div>
    </div>
  );
}
