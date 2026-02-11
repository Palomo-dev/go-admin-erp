'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ImageIcon } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { type Category } from '@/lib/services/categoryService';

interface CategoryVisualCardProps {
  category: Category;
}

export default function CategoryVisualCard({ category }: CategoryVisualCardProps) {
  const catColor = category.color || '#3B82F6';
  const IconComp = category.icon ? (LucideIcons as any)[category.icon] : null;

  return (
    <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
      <CardHeader className="pb-3">
        <CardTitle className="text-base text-gray-900 dark:text-white">Visual</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Icono + Color preview */}
        <div className="flex items-center gap-4 p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50">
          <div
            className="flex items-center justify-center w-14 h-14 rounded-xl"
            style={{ backgroundColor: `${catColor}20` }}
          >
            {IconComp ? (
              <IconComp className="h-7 w-7" style={{ color: catColor }} />
            ) : (
              <span
                className="w-6 h-6 rounded-full"
                style={{ backgroundColor: catColor }}
              />
            )}
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              {category.icon || 'Sin icono'}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span
                className="w-4 h-4 rounded border border-gray-200 dark:border-gray-600"
                style={{ backgroundColor: catColor }}
              />
              <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                {catColor}
              </span>
            </div>
          </div>
        </div>

        {/* Imagen */}
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Imagen</p>
          {category.image_url ? (
            <img
              src={category.image_url}
              alt={category.name}
              className="w-full h-40 object-cover rounded-lg border border-gray-200 dark:border-gray-700"
            />
          ) : (
            <div className="w-full h-32 rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center text-gray-400 dark:text-gray-500">
              <ImageIcon className="h-8 w-8 mb-1" />
              <span className="text-xs">Sin imagen</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
