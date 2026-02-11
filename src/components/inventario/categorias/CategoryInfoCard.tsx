'use client';

import React from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar } from 'lucide-react';
import { type Category } from '@/lib/services/categoryService';

interface CategoryInfoCardProps {
  category: Category;
  parent: Category | null;
}

export default function CategoryInfoCard({ category, parent }: CategoryInfoCardProps) {
  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
      <CardHeader className="pb-3">
        <CardTitle className="text-base text-gray-900 dark:text-white">Información General</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {category.description && (
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Descripción</p>
            <p className="text-sm text-gray-700 dark:text-gray-300">{category.description}</p>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Categoría Padre</p>
            {parent ? (
              <Link
                href={`/app/inventario/categorias/${parent.uuid}`}
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                {parent.name}
              </Link>
            ) : (
              <p className="text-sm text-gray-700 dark:text-gray-300">Raíz (sin padre)</p>
            )}
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Orden</p>
            <p className="text-sm text-gray-700 dark:text-gray-300">{category.display_order}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Rank</p>
            <p className="text-sm text-gray-700 dark:text-gray-300">{category.rank}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-gray-400" />
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Creada</p>
              <p className="text-sm text-gray-700 dark:text-gray-300">{formatDate(category.created_at)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-gray-400" />
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Actualizada</p>
              <p className="text-sm text-gray-700 dark:text-gray-300">{formatDate(category.updated_at)}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
