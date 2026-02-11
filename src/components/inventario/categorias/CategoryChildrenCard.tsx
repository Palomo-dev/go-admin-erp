'use client';

import React from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FolderTree } from 'lucide-react';
import { type Category } from '@/lib/services/categoryService';

interface CategoryChildrenCardProps {
  subcategories: Category[];
}

export default function CategoryChildrenCard({ subcategories }: CategoryChildrenCardProps) {
  if (subcategories.length === 0) return null;

  return (
    <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
      <CardHeader className="pb-3">
        <CardTitle className="text-base text-gray-900 dark:text-white flex items-center justify-between">
          <span className="flex items-center gap-2">
            <FolderTree className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            Subcategorías
          </span>
          <Badge variant="secondary">{subcategories.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {subcategories.map(child => (
            <Link
              key={child.id}
              href={`/app/inventario/categorias/${child.uuid}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
            >
              <span
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: child.color || '#3B82F6' }}
              />
              <span className="text-sm font-medium text-gray-900 dark:text-white">{child.name}</span>
              <Badge
                variant={child.is_active ? 'secondary' : 'outline'}
                className="text-xs ml-auto"
              >
                {child.is_active ? 'Activa' : 'Inactiva'}
              </Badge>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
