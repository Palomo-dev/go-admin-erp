'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Package, FolderTree, Hash } from 'lucide-react';
import { type Category } from '@/lib/services/categoryService';

interface CategoryStatsCardProps {
  category: Category;
  productCount: number;
  childrenCount: number;
}

export default function CategoryStatsCard({ category, productCount, childrenCount }: CategoryStatsCardProps) {
  return (
    <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
      <CardHeader className="pb-3">
        <CardTitle className="text-base text-gray-900 dark:text-white">Estadísticas</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
            <Package className="h-4 w-4" /> Productos
          </span>
          <span className="text-sm font-bold text-gray-900 dark:text-white">{productCount}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
            <FolderTree className="h-4 w-4" /> Subcategorías
          </span>
          <span className="text-sm font-bold text-gray-900 dark:text-white">{childrenCount}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
            <Hash className="h-4 w-4" /> ID
          </span>
          <span className="text-sm font-mono text-gray-700 dark:text-gray-300">{category.id}</span>
        </div>
      </CardContent>
    </Card>
  );
}
