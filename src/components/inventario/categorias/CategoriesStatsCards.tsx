'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/utils/Utils';
import { FolderTree, CheckCircle2, XCircle, Package } from 'lucide-react';
import { type CategoryStats } from '@/lib/services/categoryService';

interface CategoriesStatsCardsProps {
  stats: CategoryStats;
}

export function CategoriesStatsCards({ stats }: CategoriesStatsCardsProps) {
  const items = [
    { label: 'Total', value: stats.total, icon: FolderTree, bg: 'bg-blue-100 dark:bg-blue-900/30', fg: 'text-blue-600 dark:text-blue-400' },
    { label: 'Activas', value: stats.active, icon: CheckCircle2, bg: 'bg-green-100 dark:bg-green-900/30', fg: 'text-green-600 dark:text-green-400' },
    { label: 'Inactivas', value: stats.inactive, icon: XCircle, bg: 'bg-amber-100 dark:bg-amber-900/30', fg: 'text-amber-600 dark:text-amber-400' },
    { label: 'Raíz', value: stats.root, icon: Package, bg: 'bg-purple-100 dark:bg-purple-900/30', fg: 'text-purple-600 dark:text-purple-400' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {items.map(s => (
        <Card key={s.label} className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className={cn('p-2 rounded-lg', s.bg)}><s.icon className={cn('h-5 w-5', s.fg)} /></div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{s.label}</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{s.value}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
